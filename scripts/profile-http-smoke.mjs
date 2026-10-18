import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

// Exercise real nginx body buffering, which request-object mocks cannot model.
// Only synthetic profiles and a test principal enter this isolated container.
const directory = mkdtempSync(join(tmpdir(), 'navet-profile-http-'));
const name = `navet-profile-http-${randomUUID().slice(0, 8)}`;
const image = process.env.NAVET_PROFILE_SMOKE_IMAGE || 'navet:profile-http-smoke';
function docker(...args) {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

writeFileSync(join(directory, 'handler.js'), `
import store from '/repo/docker/njs/profile-store.js';
store.setProfileStorePrincipalResolverForTests(function () {
  return {providerId: 'home_assistant', tenantId: 'hat_' + 'a'.repeat(64),
    sessionId: 'synthetic-session', userId: 'synthetic-user', userName: 'Test'};
});
export default {handle: store.handle, handleIngress: store.handleIngress};
`);
writeFileSync(join(directory, 'nginx.conf'), `
load_module /usr/lib/nginx/modules/ngx_http_js_module.so;
user nginx;
worker_processes 1;
pid /tmp/nginx.pid;
error_log /dev/stderr warn;
events { worker_connections 64; }
http {
  access_log off;
  client_body_temp_path /tmp/client-body;
  proxy_temp_path /tmp/proxy;
  fastcgi_temp_path /tmp/fastcgi;
  uwsgi_temp_path /tmp/uwsgi;
  scgi_temp_path /tmp/scgi;
  js_import navet_profile_store from /smoke/handler.js;
  server { listen 8080; include /etc/nginx/snippets/navet-profile-store.conf; }
  server { listen 8081; include /etc/nginx/snippets/navet-profile-store-ingress.conf; }
}
`);

try {
  if (!process.env.NAVET_PROFILE_SMOKE_IMAGE) {
    const addonDockerfile = readFileSync('platform/home-assistant/addons/navet/Dockerfile', 'utf8');
    const version = addonDockerfile.match(/ARG BUILD_FROM=ghcr\.io\/home-assistant\/amd64-base:(\d+\.\d+)/)?.[1];
    assert.ok(version, 'Update the smoke runtime to match the add-on base image.');
    writeFileSync(join(directory, 'Dockerfile'),
      `FROM alpine:${version}\nRUN apk add --no-cache nginx nginx-mod-http-js\n`);
    docker('build', '-t', image, directory);
  }
  docker('run', '-d', '--name', name, '--read-only',
    '--security-opt', 'no-new-privileges',
    '--tmpfs', '/tmp', '--tmpfs', '/var/cache/nginx', '--tmpfs', '/var/lib/nginx',
    '--tmpfs', '/data:mode=1777',
    '-p', '127.0.0.1::8080', '-p', '127.0.0.1::8081',
    '-v', `${resolve('docker')}:/repo/docker:ro`,
    '-v', `${resolve('docker/snippets')}:/etc/nginx/snippets:ro`,
    '-v', `${directory}:/smoke:ro`,
    '--entrypoint', 'nginx', image, '-e', 'stderr', '-c', '/smoke/nginx.conf', '-g', 'daemon off;');
  docker('exec', name, 'nginx', '-t', '-e', 'stderr', '-c', '/smoke/nginx.conf');

  for (const port of ['8080', '8081']) {
    const address = docker('port', name, `${port}/tcp`);
    const origin = `http://${address}`;
    const url = `${origin}/__navet_profile__/default`;
    let revision;
    const clients = [];
    for (let index = 0; index < 3; index += 1) {
      const headers = {
        Origin: origin,
        'X-Navet-Client-Id': `synthetic-client-${index}`,
        'X-Navet-Client-Name': `Test ${index}`,
        'X-Navet-Client-Kind': 'desktop',
      };
      const response = await fetch(url, { headers });
      assert.ok([200, 204].includes(response.status));
      await response.text();
      headers.Cookie = response.headers.get('set-cookie').split(';')[0];
      clients.push(headers);
      revision = response.headers.get('x-navet-profile-revision');
    }

    for (const [index, bytes] of [32 * 1024, 128 * 1024, 1000 * 1024].entries()) {
      const profile = {
        app: 'navet', version: 4, exportedAt: new Date().toISOString(),
        dashboardEntities: { explicitlyShownEntityIds: [`home_assistant:script.test_${index}`] },
        dashboard: { title: `Test ${index}`, notes: 'x'.repeat(bytes) },
      };
      const body = JSON.stringify(profile);
      const saved = await fetch(url, { method: 'PUT', body, headers: {
        ...clients[index], 'Content-Type': 'application/json', 'X-Navet-Base-Revision': revision,
      } });
      assert.equal(saved.status, 200, `${port}: ${bytes} byte save: ${await saved.text()}`);
      revision = saved.headers.get('x-navet-profile-revision');
      for (const headers of clients) {
        const loaded = await fetch(url, { headers });
        assert.equal(loaded.status, 200);
        assert.equal(loaded.headers.get('x-navet-profile-revision'), revision);
        assert.deepEqual((await loaded.json()).dashboardEntities, profile.dashboardEntities);
      }
    }
    const oversized = await fetch(url, { method: 'PUT', body: 'x'.repeat(1024 * 1024 + 1),
      headers: { ...clients[0], 'X-Navet-Base-Revision': revision } });
    assert.equal(oversized.status, 413);
    await oversized.text();
    console.log(`${port}: three-client saves/reloads through 1000 KiB pass; >1 MiB rejected.`);
  }
} catch (error) {
  const logs = spawnSync('docker', ['logs', name], { encoding: 'utf8' });
  console.error(logs.stderr || logs.stdout);
  console.error(spawnSync('docker', ['inspect', '--format', '{{json .State}}', name], { encoding: 'utf8' }).stdout);
  throw error;
} finally {
  spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
  rmSync(directory, { recursive: true, force: true });
}
