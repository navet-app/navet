import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { startRssFixture } from './docker-rss-fixture.mjs';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}`);
  }
}

function ensureDockerAvailable() {
  const result = spawnSync('docker', ['info'], {
    stdio: 'pipe',
    encoding: 'utf8',
  });

  if (!result.error && result.status === 0) {
    return;
  }

  const message =
    result.error?.message ||
    result.stderr ||
    result.stdout ||
    'Docker is unavailable. Start Docker Desktop or another Docker daemon and try again.';
  throw new Error(`check:docker requires a running Docker daemon.\n${message.trim()}`);
}

function resolveHomeAssistantAddonTarget() {
  const requestedArchitecture = process.env.NAVET_ADDON_TEST_ARCH?.trim().toLowerCase();
  let architecture = requestedArchitecture;
  if (!architecture) {
    const result = spawnSync(
      'docker',
      ['info', '--format', '{{.Architecture}}'],
      { stdio: 'pipe', encoding: 'utf8' }
    );
    architecture = result.stdout.trim().toLowerCase();
    if (result.error || result.status !== 0) {
      throw new Error(
        result.error?.message ||
          result.stderr?.trim() ||
          'Unable to resolve the Docker host architecture'
      );
    }
  }
  let target;
  if (architecture === 'amd64' || architecture === 'x86_64') {
    target = {
      addonArchitecture: 'amd64',
      buildFrom: 'ghcr.io/home-assistant/amd64-base:3.20',
      platform: 'linux/amd64',
    };
  } else if (architecture === 'arm64' || architecture === 'aarch64') {
    target = {
      addonArchitecture: 'aarch64',
      buildFrom: 'ghcr.io/home-assistant/aarch64-base:3.20',
      platform: 'linux/arm64',
    };
  } else {
    throw new Error(`Unsupported Home Assistant add-on host architecture: ${architecture}`);
  }

  if (process.env.NAVET_TEST_ADDON_IMAGE) return { ...target, compatibilityEntrypoint: false, exactBase: true };

  const exactBase = spawnSync(
    'docker',
    ['manifest', 'inspect', target.buildFrom],
    { stdio: 'pipe', encoding: 'utf8' }
  );
  if (!exactBase.error && exactBase.status === 0) {
    return {
      ...target,
      compatibilityEntrypoint: false,
      exactBase: true,
    };
  }

  console.warn(
    `Exact Home Assistant add-on base ${target.buildFrom} is unavailable to this Docker client; ` +
      'using Alpine 3.20 with a with-contenv/bashio compatibility shim.'
  );
  return {
    ...target,
    buildFrom: 'alpine:3.20',
    compatibilityEntrypoint: true,
    exactBase: false,
  };
}

function ensureSerializedProfileRuntime() {
  const workerConfigs = [
    'docker/nginx.main.conf',
    'platform/home-assistant/addons/navet/rootfs/etc/nginx/nginx.conf',
  ];
  for (const file of workerConfigs) {
    const source = readFileSync(file, 'utf8');
    if (!/^\s*worker_processes\s+1\s*;/m.test(source)) {
      throw new Error(`${file} must serialize local profile-store writes with one Nginx worker`);
    }
    if (
      !/^\s*js_shared_dict_zone\s+zone=navet_chore_management_sessions:1m\s+timeout=30m\s+evict\s*;/m.test(
        source
      )
    ) {
      throw new Error(
        `${file} must reserve a 1m Nginx shared dictionary for chore management sessions`
      );
    }
  }

  const addonConfigs = [
    'platform/home-assistant/addons/navet/config.yaml',
    'platform/home-assistant/addons/navet-dev/config.yaml',
  ];
  for (const file of addonConfigs) {
    const source = readFileSync(file, 'utf8');
    if (!/^ports:\s*\n\s+8080\/tcp:\s+null$/m.test(source)) {
      throw new Error(`${file} must expose the optional direct listener disabled by default`);
    }
    if (!/^ingress_port:\s+8099$/m.test(source)) {
      throw new Error(`${file} must keep the dedicated Ingress listener on port 8099`);
    }
    for (const obsoleteOption of [
      'dashboard_config_url',
      'homey_client_id',
      'homey_client_secret',
      'homey_redirect_uri',
      'hass_url',
      'token',
    ]) {
      if (new RegExp(`^\\s+${obsoleteOption}:`, 'm').test(source)) {
        throw new Error(`${file} must not expose obsolete option ${obsoleteOption}`);
      }
    }
    if (!/^\s+allow_insecure_provider_tls:\s+bool$/m.test(source)) {
      throw new Error(`${file} must retain the advanced provider TLS option`);
    }

    const translations = readFileSync(
      file.replace(/config\.yaml$/, 'translations/en.yaml'),
      'utf8'
    );
    if (
      !/^configuration:\s*$/m.test(translations) ||
      !/^\s+allow_insecure_provider_tls:\s*$/m.test(translations) ||
      !/^network:\s*$/m.test(translations) ||
      !/^\s+8080\/TCP:/m.test(translations)
    ) {
      throw new Error(`${file} must provide English option and network translations`);
    }
  }

  const njsHandlerFiles = [
    'docker/snippets/navet-auth-store.conf',
    'docker/snippets/navet-chore-store.conf',
    'docker/snippets/navet-chore-store-ingress.conf',
    'docker/snippets/navet-homey-store.conf',
    'docker/snippets/navet-openhab-store.conf',
    'docker/snippets/navet-profile-store.conf',
    'docker/snippets/navet-profile-store-ingress.conf',
    'docker/snippets/navet-rss-proxy.conf',
    'docker/snippets/navet-rss-proxy-ingress.conf',
  ];
  const runtimeConfigs = [
    {
      imports: 'docker/nginx.main.conf',
      handlers: njsHandlerFiles,
    },
    {
      imports: 'platform/home-assistant/addons/navet/rootfs/etc/nginx/nginx.conf',
      handlers: [
        ...njsHandlerFiles,
        'platform/home-assistant/addons/navet/run.sh',
        'platform/home-assistant/addons/navet/rootfs/etc/nginx/http.d/default.conf',
      ],
    },
  ];
  for (const runtime of runtimeConfigs) {
    const importSource = readFileSync(runtime.imports, 'utf8');
    const imports = new Set(
      [...importSource.matchAll(/^\s*js_import\s+([A-Za-z0-9_]+)\s+from\s+/gm)].map(
        (match) => match[1]
      )
    );
    for (const handlerFile of runtime.handlers) {
      const source = readFileSync(handlerFile, 'utf8');
      for (const match of source.matchAll(/\bjs_(?:content|periodic)\s+([A-Za-z0-9_]+)\.[A-Za-z0-9_]+/g)) {
        if (!imports.has(match[1])) {
          throw new Error(
            `${runtime.imports} must js_import ${match[1]} because ${handlerFile} references it`
          );
        }
      }
    }
  }
}

function ensurePersistentDataConfiguration() {
  const dockerfile = readFileSync('Dockerfile', 'utf8');
  if (!/^VOLUME\s+\["\/data"\]\s*$/m.test(dockerfile)) {
    throw new Error('Dockerfile must declare /data as the standalone persistent-data volume');
  }

  const compose = readFileSync('docker-compose.yml', 'utf8');
  if (
    !/^\s+-\s+navet-data:\/data\s*$/m.test(compose) ||
    !/^volumes:\s*\n\s+navet-data:\s*$/m.test(compose)
  ) {
    throw new Error('docker-compose.yml must mount its named navet-data volume at /data');
  }

  const standaloneEntrypoint = readFileSync('docker/30-navet-config.sh', 'utf8');
  const addonEntrypoint = readFileSync('platform/home-assistant/addons/navet/run.sh', 'utf8');
  if (!addonEntrypoint.includes('runtime: "ha-ingress"')) {
    throw new Error(
      'Home Assistant add-on config must explicitly select the Ingress runtime'
    );
  }
  for (const [file, source] of [
    ['docker/30-navet-config.sh', standaloneEntrypoint],
    ['platform/home-assistant/addons/navet/run.sh', addonEntrypoint],
  ]) {
    if (!source.includes('mkdir -p /data') || !source.includes('chown nginx:nginx /data')) {
      throw new Error(`${file} must prepare the persistent /data mount for the Nginx worker`);
    }
    if (
      !source.includes('INSTALLATION_KEY_PATH="/data/navet-installation-key"') ||
      !source.includes('chmod 600 "${INSTALLATION_KEY_PATH}"')
    ) {
      throw new Error(`${file} must persist a private installation key for cookie isolation`);
    }
  }
}

function assertBuiltStandaloneMetadata(containerName, expectedBuildVersion) {
  const result = spawnSync(
    'docker',
    [
      'exec',
      containerName,
      'grep',
      '-R',
      '-F',
      '-l',
      expectedBuildVersion,
      '/usr/share/nginx/html/assets',
    ],
    { stdio: 'pipe', encoding: 'utf8' }
  );
  const matchingJavaScriptAssets = result.stdout
    .split('\n')
    .map((value) => value.trim())
    .filter((value) => value.endsWith('.js'));
  if (result.error || result.status !== 0 || matchingJavaScriptAssets.length === 0) {
    const diagnostic = [result.stderr?.trim(), result.stdout?.trim()].filter(Boolean).join('\n');
    throw new Error(
      `Built standalone UI is missing exact build version ${expectedBuildVersion}${
        diagnostic ? `\n${diagnostic}` : ''
      }`
    );
  }
}

function extractCookie(response, cookieName) {
  const escapedName = cookieName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return response.headers
    .get('set-cookie')
    ?.match(
      new RegExp(
        `(?:^|,\\s*)(${escapedName}(?:_[a-f0-9]{24})?=[a-f0-9]{64})(?:;|$)`,
        'i'
      )
    )?.[1];
}

function extractScopedCookie(response, cookieName) {
  const cookie = extractCookie(response, cookieName);
  if (!cookie) {
    return cookie;
  }
  const escapedName = cookieName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!new RegExp(`^${escapedName}_[a-f0-9]{24}=[a-f0-9]{64}$`, 'i').test(cookie)) {
    throw new Error(`Production ${cookieName} cookie is missing its installation namespace`);
  }
  return cookie;
}

function cookieValue(cookie) {
  const separator = String(cookie || '').indexOf('=');
  return separator === -1 ? '' : String(cookie).slice(separator + 1);
}

function assertSecurityHeaders(response, surface) {
  const contentSecurityPolicy = response.headers.get('content-security-policy') ?? '';
  if (
    !contentSecurityPolicy.includes("frame-ancestors 'self'") ||
    response.headers.get('x-frame-options') !== 'SAMEORIGIN' ||
    response.headers.get('x-content-type-options') !== 'nosniff' ||
    response.headers.get('referrer-policy') !== 'strict-origin-when-cross-origin'
  ) {
    throw new Error(`Actual-image security headers are incomplete on ${surface}`);
  }
}

async function assertWebManifestDelivery(baseUrl) {
  const response = await fetch(`${baseUrl}/site.webmanifest`);
  if (
    response.status !== 200 ||
    !response.headers.get('content-type')?.startsWith('application/manifest+json') ||
    response.headers.get('cache-control') !== 'no-cache'
  ) {
    throw new Error(
      'The stable standalone web manifest must use application/manifest+json and revalidate'
    );
  }
}

async function rawHttpStatus(
  baseUrl,
  path,
  headers,
  { body, method = 'GET' } = {}
) {
  const target = new URL(baseUrl);
  return await new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: target.hostname,
        path,
        port: target.port,
        protocol: target.protocol,
        headers,
        method,
      },
      (response) => {
        response.resume();
        response.once('end', () => resolve(response.statusCode ?? 0));
      }
    );
    request.once('error', reject);
    request.end(body);
  });
}

async function verifyNjsWriteValidatorShield(baseUrl) {
  for (const header of ['If-Match', 'If-Unmodified-Since']) {
    const status = await rawHttpStatus(
      baseUrl,
      '/__navet_profile__/default',
      {
        [header]: '"njs-validator-probe"',
        'Content-Type': 'application/json',
        Origin: baseUrl,
        'X-Navet-Base-Revision': '0',
      },
      { body: '{}', method: 'PUT' }
    );
    if (status !== 428) {
      throw new Error(`${header} reached the njs profile handler with status ${status}`);
    }
  }

  const healthResponse = await fetch(`${baseUrl}/__navet_auth__/session`);
  if (healthResponse.status !== 200) {
    throw new Error('Navet stopped responding after the njs validator probes');
  }
}

async function readAuthMetadata(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/__navet_auth__/session`, {
      signal: AbortSignal.timeout(2_000),
    });
    const metadata = await response.json();
    const cookie = extractScopedCookie(response, 'navet_auth_session');
    if (
      response.status !== 200 ||
      metadata?.authenticated !== false ||
      metadata?.providerId !== 'home_assistant' ||
      !/^nas_[a-f0-9]{32}$/.test(metadata?.sessionId) ||
      !Number.isSafeInteger(metadata?.authRevision) ||
      metadata.authRevision < 0 ||
      !cookie ||
      Object.hasOwn(metadata, 'access_token') ||
      Object.hasOwn(metadata, 'refresh_token')
    ) {
      return {
        error: `Unexpected auth metadata: ${JSON.stringify(metadata)}`,
        metadata: null,
      };
    }

    return { cookie, error: null, metadata };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Auth endpoint returned invalid JSON',
      metadata: null,
    };
  }
}

async function assertAnonymousProviderReadDoesNotMint(baseUrl, containerName, providerId) {
  const endpoint = `/__navet_${providerId}__/session`;
  const cookieName = `navet_${providerId}_session`;
  const response = await fetch(`${baseUrl}${endpoint}`);
  if (
    response.status !== 204 ||
    extractCookie(response, cookieName)
  ) {
    throw new Error(`Anonymous ${providerId} GET minted a durable browser session`);
  }

  const files = spawnSync(
    'docker',
    [
      'exec',
      containerName,
      'find',
      `/data/navet-provider-sessions/${providerId}`,
      '-maxdepth',
      '1',
      '-name',
      '*.json',
      '-print',
    ],
    { stdio: 'pipe', encoding: 'utf8' }
  );
  if (files.stdout.trim()) {
    throw new Error(`Anonymous ${providerId} GET created a session file`);
  }
}

function readInstallationKey(containerName) {
  const result = spawnSync(
    'docker',
    ['exec', containerName, 'cat', '/data/navet-installation-key'],
    { stdio: 'pipe', encoding: 'utf8' }
  );
  const key = result.stdout.trim();
  if (
    result.error ||
    result.status !== 0 ||
    !/^[a-f0-9]{64}$/.test(key)
  ) {
    throw new Error('Actual image did not persist a valid installation key');
  }
  const mode = spawnSync(
    'docker',
    [
      'exec',
      containerName,
      'stat',
      '-c',
      '%a',
      '/data/navet-installation-key',
    ],
    { stdio: 'pipe', encoding: 'utf8' }
  ).stdout.trim();
  if (mode !== '600') {
    throw new Error(`Actual-image installation key has unsafe mode ${mode}`);
  }
  return key;
}

function assertInstallationKeyOwner(containerName) {
  const result = spawnSync(
    'docker',
    [
      'exec',
      containerName,
      'stat',
      '-c',
      '%U:%G',
      '/data/navet-installation-key',
    ],
    { stdio: 'pipe', encoding: 'utf8' }
  );
  const owner = result.stdout.trim();
  if (result.error || result.status !== 0 || owner !== 'nginx:nginx') {
    throw new Error(`Actual-image installation key has unexpected owner ${owner || 'unknown'}`);
  }
}

async function startHomeAssistantOAuth(
  baseUrl,
  containerName,
  browserSession,
  installationKey
) {
  const requestStart = (key) =>
    fetch(`${baseUrl}/__navet_auth__/authorize`, {
      method: 'POST',
      headers: {
        Cookie: browserSession.cookie,
        Origin: baseUrl,
        'Content-Type': 'application/json',
        'X-Navet-OAuth-Binding': browserSession.metadata.sessionId,
        ...(key ? { 'X-Navet-Installation-Key': key } : {}),
      },
      body: JSON.stringify({
        hassUrl: 'http://provider-check:8080/ha',
        returnTo: '/wall-panel?view=home&code=stale&state=stale#lights',
      }),
    });
  const response = await requestStart(installationKey);
  if (response.status !== 200) {
    throw new Error(
      `Docker NJS OAuth authorize endpoint did not start Home Assistant login: ${response.status}`
    );
  }

  const payload = await response.json();
  const authorizeUrl = new URL(payload.authorizeUrl);
  const cookieId = cookieValue(browserSession.cookie);
  const pendingResult = spawnSync(
    'docker',
    [
      'exec',
      containerName,
      'cat',
      `/data/navet-auth-sessions/${cookieId}.json`,
    ],
    {
      stdio: 'pipe',
      encoding: 'utf8',
    }
  );
  const pendingSession =
    !pendingResult.error && pendingResult.status === 0
      ? JSON.parse(pendingResult.stdout)
      : null;
  if (
    authorizeUrl.origin !== 'http://provider-check:8080' ||
    authorizeUrl.pathname !== '/ha/auth/authorize' ||
    authorizeUrl.searchParams.get('response_type') !== 'code' ||
    authorizeUrl.searchParams.get('client_id') !== `${baseUrl}/` ||
    authorizeUrl.searchParams.get('redirect_uri') !==
      `${baseUrl}/__navet_auth__/callback` ||
    !/^[a-f0-9]{64}$/.test(authorizeUrl.searchParams.get('state') ?? '') ||
    pendingSession?.pending?.state !== authorizeUrl.searchParams.get('state') ||
    pendingSession?.pending?.hassUrl !== 'http://provider-check:8080/ha' ||
    pendingSession?.pending?.browserHassUrl !== 'http://provider-check:8080/ha' ||
    pendingSession?.pending?.returnTo !== '/wall-panel?view=home#lights' ||
    JSON.stringify(pendingSession).includes(installationKey)
  ) {
    throw new Error(`Unexpected Docker NJS OAuth authorize response: ${JSON.stringify(payload)}`);
  }
  return authorizeUrl.searchParams.get('state');
}

async function startHomeAssistantOAuthThroughAlternateBrowserRoute(
  baseUrl,
  containerName,
  browserSession,
  installationKey
) {
  const browserHassUrl = 'http://100.77.118.32:8123';
  const response = await fetch(`${baseUrl}/__navet_auth__/authorize`, {
    method: 'POST',
    headers: {
      Cookie: browserSession.cookie,
      Origin: baseUrl,
      'Content-Type': 'application/json',
      'X-Navet-OAuth-Binding': browserSession.metadata.sessionId,
      'X-Navet-Installation-Key': installationKey,
    },
    body: JSON.stringify({
      hassUrl: browserHassUrl,
      returnTo: '/wall-panel?view=home#lights',
    }),
  });
  const payload = await response.json();
  const authorizeUrl = new URL(payload.authorizeUrl);
  const cookieId = cookieValue(browserSession.cookie);
  const pendingResult = spawnSync(
    'docker',
    [
      'exec',
      containerName,
      'cat',
      `/data/navet-auth-sessions/${cookieId}.json`,
    ],
    { stdio: 'pipe', encoding: 'utf8' }
  );
  const pendingSession =
    !pendingResult.error && pendingResult.status === 0 ? JSON.parse(pendingResult.stdout) : null;
  if (
    response.status !== 200 ||
    authorizeUrl.origin !== new URL(browserHassUrl).origin ||
    authorizeUrl.pathname !== '/auth/authorize' ||
    authorizeUrl.searchParams.get('response_type') !== 'code' ||
    authorizeUrl.searchParams.get('client_id') !== `${baseUrl}/` ||
    authorizeUrl.searchParams.get('redirect_uri') !== `${baseUrl}/__navet_auth__/callback` ||
    !/^[a-f0-9]{64}$/.test(authorizeUrl.searchParams.get('state') ?? '') ||
    pendingSession?.pending?.state !== authorizeUrl.searchParams.get('state') ||
    pendingSession?.pending?.hassUrl !== browserHassUrl ||
    pendingSession?.pending?.browserHassUrl !== browserHassUrl
  ) {
    throw new Error(
      `Alternate Home Assistant route did not start its own login: ${response.status} ${JSON.stringify(payload)}`
    );
  }
}

async function completeHomeAssistantOAuth(baseUrl, browserSession, state) {
  const response = await fetch(
    `${baseUrl}/__navet_auth__/callback?code=actual-image-code&state=${state}`,
    {
      headers: { Cookie: browserSession.cookie },
      redirect: 'manual',
    }
  );
  const cookie = extractScopedCookie(response, 'navet_auth_session');
  if (
    response.status !== 302 ||
    !cookie ||
    cookie === browserSession.cookie ||
    response.headers.get('location') !==
      `${baseUrl}/wall-panel?view=home&navet_oauth_callback=1#lights`
  ) {
    throw new Error('Docker NJS OAuth callback did not rotate the browser session');
  }
  return cookie;
}

async function verifyHomeAssistantProxyTokenRefresh(baseUrl, authCookie) {
  const response = await fetch(`${baseUrl}/__navet_ha_proxy__/auth/token`, {
    method: 'POST',
    headers: {
      Cookie: authCookie,
      Origin: baseUrl,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: `${baseUrl}/`,
      grant_type: 'refresh_token',
      refresh_token: 'actual-image-refresh',
    }),
  });
  const payload = await response.json().catch(() => null);
  if (response.status !== 200 || payload?.access_token !== 'actual-image-access') {
    throw new Error('Actual-image same-origin Home Assistant token renewal failed');
  }
}

async function verifyHomeAssistantRefreshRevision(baseUrl, authCookie) {
  const metadataResponse = await fetch(`${baseUrl}/__navet_auth__/session`, {
    headers: { Cookie: authCookie },
  });
  const metadata = await metadataResponse.json();
  if (
    metadataResponse.status !== 200 ||
    metadata?.authenticated !== true ||
    !Number.isSafeInteger(metadata?.authRevision)
  ) {
    throw new Error('Actual-image authenticated session did not expose an auth revision');
  }
  const credentialsResponse = await fetch(
    `${baseUrl}/__navet_auth__/session/credentials`,
    {
      method: 'POST',
      headers: {
        Cookie: authCookie,
        'X-Navet-OAuth-Binding': metadata.sessionId,
      },
    }
  );
  const credentials = await credentialsResponse.json();
  const legacyAuth = {
    ...credentials,
    access_token: 'actual-image-legacy-access',
    expires: Number(credentials.expires) + 60_000,
  };
  const oldClient = await fetch(`${baseUrl}/__navet_auth__/session`, {
    method: 'PUT',
    headers: {
      Cookie: authCookie,
      Origin: baseUrl,
      'Content-Type': 'application/json',
      'X-Navet-OAuth-Binding': metadata.sessionId,
    },
    body: JSON.stringify(legacyAuth),
  });
  const oldClientPayload = await oldClient.json();
  if (
    oldClient.status !== 200 ||
    oldClientPayload?.authRevision !== metadata.authRevision + 1
  ) {
    throw new Error('Actual image rejected a monotonic old-client refresh without a revision');
  }
  const staleLegacy = await fetch(`${baseUrl}/__navet_auth__/session`, {
    method: 'PUT',
    headers: {
      Cookie: authCookie,
      Origin: baseUrl,
      'Content-Type': 'application/json',
      'X-Navet-OAuth-Binding': metadata.sessionId,
    },
    body: JSON.stringify({
      ...credentials,
      access_token: 'actual-image-stale-legacy-access',
    }),
  });
  const staleLegacyPayload = await staleLegacy.json();
  if (
    staleLegacy.status !== 200 ||
    staleLegacyPayload?.authRevision !== oldClientPayload.authRevision
  ) {
    throw new Error('Actual image did not treat a stale old-client refresh as a no-op');
  }
  const legacyCredentials = await fetch(
    `${baseUrl}/__navet_auth__/session/credentials`,
    {
      method: 'POST',
      headers: {
        Cookie: authCookie,
        'X-Navet-OAuth-Binding': metadata.sessionId,
      },
    }
  ).then((response) => response.json());
  if (legacyCredentials?.access_token !== legacyAuth.access_token) {
    throw new Error('Actual-image stale old-client refresh replaced newer credentials');
  }

  const winningAuth = {
    ...legacyAuth,
    access_token: 'actual-image-winning-access',
    expires: Number(legacyAuth.expires) + 60_000,
  };
  const headers = {
    Cookie: authCookie,
    Origin: baseUrl,
    'Content-Type': 'application/json',
    'X-Navet-OAuth-Binding': metadata.sessionId,
    'X-Navet-Auth-Revision': String(oldClientPayload.authRevision),
  };
  const winner = await fetch(`${baseUrl}/__navet_auth__/session`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(winningAuth),
  });
  const winnerMetadata = await winner.json();
  if (
    winner.status !== 200 ||
    winnerMetadata?.authRevision !== oldClientPayload.authRevision + 1
  ) {
    throw new Error('Actual-image winning Home Assistant refresh was not revisioned');
  }

  const staleAuth = {
    ...legacyAuth,
    access_token: 'actual-image-stale-access',
    expires: Number(legacyAuth.expires) + 120_000,
  };
  const stale = await fetch(`${baseUrl}/__navet_auth__/session`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(staleAuth),
  });
  const stalePayload = await stale.json();
  if (
    stale.status !== 409 ||
    stalePayload?.code !== 'credential-session-superseded' ||
    stalePayload?.session?.authRevision !== winnerMetadata.authRevision
  ) {
    throw new Error('Actual-image stale Home Assistant refresh was not rejected');
  }
  const staleInvalidation = await fetch(`${baseUrl}/__navet_auth__/session`, {
    method: 'DELETE',
    headers,
  });
  const staleInvalidationPayload = await staleInvalidation.json();
  if (
    staleInvalidation.status !== 409 ||
    staleInvalidationPayload?.code !== 'credential-session-superseded' ||
    staleInvalidationPayload?.session?.authRevision !== winnerMetadata.authRevision
  ) {
    throw new Error('Actual-image stale Home Assistant invalidation was not rejected');
  }
  const persistedCredentials = await fetch(
    `${baseUrl}/__navet_auth__/session/credentials`,
    {
      method: 'POST',
      headers: {
        Cookie: authCookie,
        'X-Navet-OAuth-Binding': winnerMetadata.sessionId,
      },
    }
  ).then((response) => response.json());
  if (persistedCredentials?.access_token !== winningAuth.access_token) {
    throw new Error('Actual-image stale refresh replaced the winning credentials');
  }
  return {
    authRevision: winnerMetadata.authRevision,
    sessionId: winnerMetadata.sessionId,
    staleAuth,
    staleRevision: oldClientPayload.authRevision,
    winningAuth,
  };
}

async function waitForAuthMetadata(baseUrl, containerName) {
  let lastError = 'Auth endpoint is not ready';
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await readAuthMetadata(baseUrl);
    if (result.metadata) {
      return result;
    }
    lastError = result.error;
    await delay(250);
  }

  const logs = spawnSync('docker', ['logs', containerName], {
    stdio: 'pipe',
    encoding: 'utf8',
  });
  const diagnostic = [logs.stdout?.trim(), logs.stderr?.trim()].filter(Boolean).join('\n');
  throw new Error(diagnostic ? `${lastError}\n${diagnostic}` : lastError);
}

async function waitForProvider(containerName) {
  let lastError = 'Fake provider is not ready';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = spawnSync(
      'docker',
      [
        'exec',
        containerName,
        'node',
        '-e',
        "fetch('http://127.0.0.1:8080/openhab/rest/items?recursive=false&limit=1').then((response) => { if (!response.ok) process.exit(1) })",
      ],
      { stdio: 'pipe', encoding: 'utf8' }
    );
    if (!result.error && result.status === 0) {
      return;
    }

    lastError = result.error?.message || result.stderr || result.stdout || lastError;
    await delay(200);
  }

  throw new Error(`Timed out waiting for the fake provider container: ${lastError.trim()}`);
}

function rssFixtureContainerArgs() {
  return rssFixture ? [
    '--mount', `type=bind,source=${rssFixture.caFile},target=/etc/navet/rss-test-ca.pem,readonly`,
    '-e', 'SSL_CERT_FILE=/etc/navet/rss-test-ca.pem',
  ] : [];
}

async function verifyRssBoundary(baseUrl, headers, privateHostname, fixtureUrl) {
  const path = (target) => '/__navet_rss_proxy__?url=' + encodeURIComponent(target);
  const cases = [
    ['/__navet_rss_transport__', headers, 404],
    [path(fixtureUrl + '/feed'), {}, 401],
    [path('https://127.0.0.1/feed'), headers, 400],
    [path('https://' + privateHostname + '/feed'), headers, 400],
    [path(fixtureUrl + '/feed'), headers, 200],
    [path(fixtureUrl + '/large'), headers, 200],
    [path(fixtureUrl + '/oversized'), headers, 502],
    [path(fixtureUrl + '/wrong-type'), headers, 502],
    [path(fixtureUrl + '/redirect'), headers, 502],
    // Error responses must leave the transport able to serve the next valid feed.
    [path(fixtureUrl + '/feed'), headers, 200],
  ];
  for (const [route, requestHeaders, expected] of cases) {
    const response = await fetch(baseUrl + route, {
      headers: requestHeaders, signal: AbortSignal.timeout(20_000),
    }).catch((error) => { throw new Error('RSS request failed for ' + route + ': ' + error.message); });
    const body = await response.text();
    if (response.status !== expected) {
      throw new Error('RSS boundary ' + route + ': expected ' + expected + ', got ' +
        response.status + ': ' + body.slice(0, 200));
    }
    if (expected === 200) {
      if (route.includes(encodeURIComponent('/large'))) {
        if (body.length !== 1024 * 1024) throw new Error('RSS subrequest truncated the bounded XML response');
      } else if (!body.includes('<title>Navet fixture</title>')) {
        throw new Error('RSS transport did not return the verified TLS fixture');
      }
      if (!response.headers.get('content-type')?.includes('application/rss+xml')) {
        throw new Error('RSS transport lost the XML content type');
      }
    }
  }
}

function verifyAddonRssBoundary(probeContainerName) {
  const headers = {
    'X-Forwarded-Proto': 'https',
    'X-Ingress-Path': addonIngressPath,
    'X-Remote-User-Id': 'actual-addon-user',
    'X-Remote-User-Name': 'Actual add-on user',
    'Authorization': 'Bearer must-not-reach-feed',
    'X-Navet-Installation-Key': 'must-not-reach-feed',
  };
  run('docker', ['exec', probeContainerName, 'node', '-e',
    '(' + verifyRssBoundary.toString() + ')(' + JSON.stringify('http://navet-addon-check:8099') +
    ',' + JSON.stringify(headers) + ',' + JSON.stringify('supervisor') + ',' +
    JSON.stringify(rssFixture.url) + ').catch((error) => { console.error(error); process.exit(1); })',
  ]);
}

async function verifyRssServiceSupervision(containerName) {
  const identity = spawnSync('docker', ['exec', containerName, 'stat', '-c', '%U:%G:%a',
    '/run/navet/rss-transport.sock'], { encoding: 'utf8' });
  if (identity.status !== 0 || identity.stdout.trim() !== 'nginx:nginx:660') {
    throw new Error('RSS Unix socket must be private to the nginx identity');
  }
  run('docker', [
    'exec',
    containerName,
    'pkill',
    '-KILL',
    '-f',
    '/etc/navet/rss-transport$',
  ]);
  // QEMU can take several seconds to propagate the child failure through the
  // Home Assistant base image's s6 shutdown path. Keep polling so native runs
  // still finish immediately, but give emulated release architectures a fair
  // bounded window to prove that the container exits.
  for (let attempt = 0; attempt < 120; attempt++) {
    const result = spawnSync('docker', ['inspect', '--format', '{{.State.Running}} {{.State.ExitCode}}',
      containerName], { encoding: 'utf8' });
    if (result.status === 0 && result.stdout.startsWith('false ')) {
      if (result.stdout.trim() === 'false 0') throw new Error('Transport failure reported a clean container exit');
      return;
    }
    await delay(250);
  }
  const processes = spawnSync('docker', ['exec', containerName, 'ps', '-o', 'pid,ppid,comm,args'], { encoding: 'utf8' });
  throw new Error('container remained running after the RSS transport failed\n' + processes.stdout);
}

function startNavetContainer(containerName, networkName, volumeName, imageTag) {
  run('docker', [
    'run',
    '-d',
    '--name',
    containerName,
    '--network',
    networkName,
    '--publish',
    '127.0.0.1::80',
    '--mount',
    `type=volume,source=${volumeName},target=/data`,
    '-e',
    'NAVET_HOMEY_CLIENT_ID=actual-image-homey-client',
    '-e',
    'NAVET_HOMEY_CLIENT_SECRET=actual-image-homey-secret',
    ...rssFixtureContainerArgs(),
    imageTag,
  ]);

  rssFixture?.attach(containerName);

  const portResult = spawnSync('docker', ['port', containerName, '80/tcp'], {
    stdio: 'pipe',
    encoding: 'utf8',
  });
  const portMatch = portResult.stdout.trim().match(/:(\d+)$/);
  if (portResult.error || portResult.status !== 0 || !portMatch) {
    throw new Error('Unable to resolve the actual-image published port');
  }
  return `http://127.0.0.1:${portMatch[1]}`;
}

function seedHomeAssistantAddonOptions(imageTag, volumeName) {
  const options = JSON.stringify({
    allow_insecure_provider_tls: false,
  });
  const bashioShim = `bashio::config() {
  case "$1" in
    allow_insecure_provider_tls)
      printf '%s\\n' 'false'
      ;;
    *)
      return 1
      ;;
  esac
}`;
  run('docker', [
    'run',
    '--rm',
    '--entrypoint',
    '/bin/sh',
    '--mount',
    `type=volume,source=${volumeName},target=/data`,
    '-e',
    `NAVET_ADDON_OPTIONS=${options}`,
    '-e',
    `NAVET_ADDON_BASHIO_SHIM=${bashioShim}`,
    imageTag,
    '-c',
    'printf "%s\\n" "$NAVET_ADDON_OPTIONS" > /data/options.json && ' +
      'printf "%s\\n" "$NAVET_ADDON_BASHIO_SHIM" > /data/navet-bashio-runtime-check',
  ]);
}

function startHomeAssistantAddonContainer({
  containerName,
  imageTag,
  networkName,
  volumeName,
  compatibilityEntrypoint,
}) {
  const args = [
    'run',
    '-d',
    '--name',
    containerName,
    '--network',
    networkName,
    '--network-alias',
    'navet-addon-check',
    '--ip',
    '172.30.32.3',
    '--mount',
    `type=volume,source=${volumeName},target=/data`,
    '-e',
    'SUPERVISOR_TOKEN=actual-image-supervisor-token',
  ];
  if (compatibilityEntrypoint) {
    args.push(
      '-e',
      'BASH_ENV=/data/navet-bashio-runtime-check',
      '--entrypoint',
      '/bin/bash'
    );
  }
  args.push(...rssFixtureContainerArgs(), imageTag);
  if (compatibilityEntrypoint) {
    args.push('/run.sh');
  }
  run('docker', args);
  rssFixture?.attach(containerName);
}

const addonIngressPath = '/api/hassio_ingress/navet-runtime-check';
function assertHomeAssistantAddonProxyDenied(probeContainerName) {
  // Keep the real listener covered: same-origin mutations and read-only requests
  // must both fail before they can acquire the add-on's Supervisor credential.
  const result = spawnSync('docker', ['exec', probeContainerName, 'node', '-e', `
    async function run() {
      const base = 'http://navet-addon-check:8099';
      for (const [method, path] of [
        ['GET', '/__navet_ha_proxy__/api/states'],
        ['HEAD', '/__navet_ha_proxy__/api/config'],
        ['POST', '/__navet_ha_proxy__/api/services/homeassistant/restart'],
        ['GET', '/__navet_ha_proxy__/api/websocket'],
        ['GET', '/__navet_ha_proxy__/api/image/serve/test/512x512.png'],
      ]) {
        const response = await fetch(base + path, {
          method,
          headers: { Origin: base, 'Sec-Fetch-Site': 'same-origin' },
          signal: AbortSignal.timeout(2000),
        });
        if (response.status !== 403) throw new Error(method + ' ' + path + ': ' + response.status);
        await response.arrayBuffer();
      }
    }
    run().catch(error => { console.error(error); process.exit(1); });
  `], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(`Ingress Home Assistant proxy boundary failed: ${result.error?.message || result.stderr}`);
  }
}

const addonDirectProbeSource = `
  async function run() {
    const baseUrl = 'http://navet-addon-check:8080';
    const configResponse = await fetch(baseUrl + '/config.js', {
      signal: AbortSignal.timeout(2000)
    });
    const config = await configResponse.text();
    const authResponse = await fetch(baseUrl + '/__navet_auth__/session', {
      signal: AbortSignal.timeout(2000)
    });
    const auth = await authResponse.json();
    const authCookie = (authResponse.headers.get('set-cookie') || '').split(';')[0];
    const setupResponse = await fetch(baseUrl + '/__navet_auth__/setup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': baseUrl
      },
      body: JSON.stringify({ code: process.env.NAVET_SETUP_CODE }),
      signal: AbortSignal.timeout(2000)
    });
    const setupCookie = (setupResponse.headers.get('set-cookie') || '').split(';')[0];
    const authorizeResponse = await fetch(baseUrl + '/__navet_auth__/authorize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': [authCookie, setupCookie].filter(Boolean).join('; '),
        'Origin': baseUrl,
        'X-Navet-OAuth-Binding': auth.sessionId
      },
      body: JSON.stringify({
        hassUrl: 'http://homeassistant.local:8123',
        returnTo: '/'
      }),
      signal: AbortSignal.timeout(2000)
    });
    const authorize = await authorizeResponse.json();
    const spoofedProfileResponse = await fetch(baseUrl + '/__navet_profile__/preferences/client', {
      headers: {
        'X-Remote-User-Id': 'spoofed-direct-user',
        'X-Remote-User-Name': 'Spoofed direct user'
      },
      signal: AbortSignal.timeout(2000)
    });
    process.stdout.write(JSON.stringify({
      auth,
      authStatus: authResponse.status,
      authorize,
      authorizeStatus: authorizeResponse.status,
      config,
      configStatus: configResponse.status,
      spoofedProfileStatus: spoofedProfileResponse.status
    }));
  }
  run().catch((error) => {
    process.stderr.write(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
`;
const addonIngressProbeSource = `
  const headers = {
    'X-Forwarded-Proto': 'https',
    'X-Ingress-Path': process.env.NAVET_ADDON_INGRESS_PATH,
    'X-Navet-Client-Id': 'actual-addon-panel-01',
    'X-Navet-Client-Kind': 'wall_panel',
    'X-Navet-Client-Name': 'Actual add-on panel',
    'X-Remote-User-Id': 'actual-addon-user',
    'X-Remote-User-Name': 'Actual add-on user'
  };
  if (process.env.NAVET_ADDON_COOKIE) {
    headers.Cookie = process.env.NAVET_ADDON_COOKIE;
  }
  fetch(
    'http://navet-addon-check:8099/__navet_profile__/preferences/client',
    { headers, signal: AbortSignal.timeout(2000) }
  ).then(async (response) => {
    process.stdout.write(JSON.stringify({
      body: await response.text(),
      cookie: response.headers.get('set-cookie') || '',
      status: response.status
    }));
  }).catch((error) => {
    process.stderr.write(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
`;

const addonChoreProbeSource = `
  const baseUrl = 'http://navet-addon-check:8099';
  const ingressOrigin = 'https://navet-addon-check:8099';
  const headers = {
    'X-Forwarded-Proto': 'https',
    'X-Ingress-Path': process.env.NAVET_ADDON_INGRESS_PATH,
    'X-Navet-Client-Id': 'actual-addon-panel-01',
    'X-Navet-Client-Kind': 'wall_panel',
    'X-Navet-Client-Name': 'Actual add-on panel',
    'X-Remote-User-Id': 'actual-addon-user',
    'X-Remote-User-Name': 'Actual add-on user'
  };
  async function run() {
    const capabilitiesResponse = await fetch(baseUrl + '/__navet_chores__/capabilities', {
      headers,
      signal: AbortSignal.timeout(2000)
    });
    const capabilities = await capabilitiesResponse.json();
    const workspaceResponse = await fetch(baseUrl + '/__navet_chores__/workspace', {
      headers,
      signal: AbortSignal.timeout(2000)
    });
    let workspace = await workspaceResponse.json();
    let managementSessionStatus = null;
    if (process.env.NAVET_ADDON_CREATE_CHORE === 'true') {
      const timestamp = new Date().toISOString();
      const commandResponse = await fetch(baseUrl + '/__navet_chores__/commands', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Origin': ingressOrigin,
          'X-Navet-Base-Revision': String(workspace.revision)
        },
        body: JSON.stringify({
          commandId: 'actual-addon-runtime-participant',
          baseRevision: workspace.revision,
          action: {
            type: 'participant_create',
            participant: {
              id: 'actual-addon-manager',
              displayName: 'Actual add-on manager',
              capabilities: ['complete', 'approve', 'manage'],
              createdAt: timestamp,
              updatedAt: timestamp
            }
          }
        }),
        signal: AbortSignal.timeout(2000)
      });
      workspace = await commandResponse.json();
      if (!commandResponse.ok) {
        throw new Error('Chore command failed: ' + JSON.stringify(workspace));
      }
      const managementHeaders = {
        ...headers,
        'Content-Type': 'application/json',
        'Origin': ingressOrigin
      };
      const configureResponse = await fetch(baseUrl + '/__navet_chores__/management/pin', {
        method: 'POST',
        headers: managementHeaders,
        body: JSON.stringify({
          actorParticipantId: 'actual-addon-manager',
          pin: '1234'
        }),
        signal: AbortSignal.timeout(2000)
      });
      if (!configureResponse.ok) {
        throw new Error('Management PIN configuration failed: ' + await configureResponse.text());
      }
      const verifyResponse = await fetch(baseUrl + '/__navet_chores__/management/verify', {
        method: 'POST',
        headers: managementHeaders,
        body: JSON.stringify({ pin: '1234' }),
        signal: AbortSignal.timeout(2000)
      });
      const verifiedSession = await verifyResponse.json();
      if (!verifyResponse.ok || !verifiedSession.sessionToken) {
        throw new Error('Management PIN verification failed: ' + JSON.stringify(verifiedSession));
      }
      const protectedCommandResponse = await fetch(baseUrl + '/__navet_chores__/commands', {
        method: 'POST',
        headers: {
          ...managementHeaders,
          'X-Navet-Base-Revision': String(workspace.revision),
          'X-Navet-Chore-Management-Session': verifiedSession.sessionToken
        },
        body: JSON.stringify({
          commandId: 'actual-addon-runtime-protected-participant',
          baseRevision: workspace.revision,
          action: {
            type: 'participant_create',
            actorParticipantId: 'actual-addon-manager',
            participant: {
              id: 'actual-addon-member',
              displayName: 'Actual add-on member',
              capabilities: ['complete'],
              createdAt: timestamp,
              updatedAt: timestamp
            }
          }
        }),
        signal: AbortSignal.timeout(2000)
      });
      workspace = await protectedCommandResponse.json();
      managementSessionStatus = protectedCommandResponse.status;
      if (!protectedCommandResponse.ok) {
        throw new Error('Protected chore command failed: ' + JSON.stringify(workspace));
      }
    }
    process.stdout.write(JSON.stringify({
      capabilities,
      capabilitiesStatus: capabilitiesResponse.status,
      managementSessionStatus,
      workspace,
      workspaceStatus: workspaceResponse.status
    }));
  }
  run().catch((error) => {
    process.stderr.write(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
`;

function readHomeAssistantAddonIngressProfile(probeContainerName, cookie = '') {
  const result = spawnSync(
    'docker',
    [
      'exec',
      '-e',
      `NAVET_ADDON_COOKIE=${cookie}`,
      '-e',
      `NAVET_ADDON_INGRESS_PATH=${addonIngressPath}`,
      probeContainerName,
      'node',
      '-e',
      addonIngressProbeSource,
    ],
    { stdio: 'pipe', encoding: 'utf8' }
  );
  if (result.error || result.status !== 0) {
    return {
      error: result.error?.message || result.stderr.trim() || result.stdout.trim(),
      response: null,
    };
  }
  try {
    return { error: null, response: JSON.parse(result.stdout) };
  } catch {
    return {
      error: `Add-on Ingress probe returned invalid JSON: ${result.stdout.trim()}`,
      response: null,
    };
  }
}

function assertHomeAssistantAddonDirectListener(probeContainerName, addonContainerName) {
  const setupCodeResult = spawnSync(
    'docker',
    ['exec', addonContainerName, 'cat', '/data/navet-setup-code.json'],
    { stdio: 'pipe', encoding: 'utf8' }
  );
  if (setupCodeResult.error || setupCodeResult.status !== 0) {
    throw new Error(setupCodeResult.error?.message || setupCodeResult.stderr.trim());
  }
  const setupCodeRecord = JSON.parse(setupCodeResult.stdout);
  const result = spawnSync(
    'docker',
    [
      'exec',
      '-e',
      `NAVET_SETUP_CODE=${setupCodeRecord.code}`,
      probeContainerName,
      'node',
      '-e',
      addonDirectProbeSource,
    ],
    { stdio: 'pipe', encoding: 'utf8' }
  );
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr.trim() || result.stdout.trim());
  }
  const response = JSON.parse(result.stdout);
  if (
    response.configStatus !== 200 ||
    response.config.includes('runtime: "ha-ingress"') ||
    !response.config.includes('proxyBaseUrl: "/__navet_ha_proxy__"') ||
    response.authStatus !== 200 ||
    response.auth?.authenticated !== false ||
    response.authorizeStatus !== 200 ||
    !String(response.authorize?.authorizeUrl || '').startsWith(
      'http://homeassistant.local:8123/auth/authorize?'
    ) ||
    response.spoofedProfileStatus !== 401
  ) {
    throw new Error(
      `Home Assistant add-on direct listener boundary check failed: ${JSON.stringify(response)}`
    );
  }
}

function readHomeAssistantAddonIngressChores(probeContainerName, createChore = false) {
  const result = spawnSync(
    'docker',
    [
      'exec',
      '-e',
      `NAVET_ADDON_INGRESS_PATH=${addonIngressPath}`,
      '-e',
      `NAVET_ADDON_CREATE_CHORE=${createChore}`,
      probeContainerName,
      'node',
      '-e',
      addonChoreProbeSource,
    ],
    { stdio: 'pipe', encoding: 'utf8' }
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      result.error?.message || result.stderr.trim() || result.stdout.trim()
    );
  }
  return JSON.parse(result.stdout);
}

function assertHomeAssistantAddonChores(result, expectedRevision) {
  if (
    result.capabilitiesStatus !== 200 ||
    result.capabilities?.authority !== 'navet_addon' ||
    result.capabilities?.backgroundScheduling !== true ||
    result.capabilities?.backgroundNotifications !== true ||
    result.workspaceStatus !== 200 ||
    result.workspace?.revision !== expectedRevision ||
    !result.workspace?.data?.participantsById?.['actual-addon-manager'] ||
    (result.managementSessionStatus !== null &&
      (result.managementSessionStatus !== 200 ||
        !result.workspace?.data?.participantsById?.['actual-addon-member']))
  ) {
    throw new Error(
      `Home Assistant add-on chore authority check failed: ${JSON.stringify(result)}`
    );
  }
}

async function waitForHomeAssistantAddonIngressProfile(
  addonContainerName,
  probeContainerName,
  cookie = ''
) {
  let lastError = 'Home Assistant add-on Nginx is not ready';
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = readHomeAssistantAddonIngressProfile(
      probeContainerName,
      cookie
    );
    if (
      result.response &&
      result.response.status === 204 &&
      !result.response.body
    ) {
      return result.response;
    }
    lastError =
      result.error ||
      `Unexpected add-on profile response: ${JSON.stringify(result.response)}`;
    await delay(250);
  }
  const logs = spawnSync('docker', ['logs', addonContainerName], {
    stdio: 'pipe',
    encoding: 'utf8',
  });
  const diagnostic = [logs.stdout?.trim(), logs.stderr?.trim()]
    .filter(Boolean)
    .join('\n');
  throw new Error(diagnostic ? `${lastError}\n${diagnostic}` : lastError);
}

function assertHomeAssistantAddonIngressCookie(serialized, expectedCookie = '') {
  const attributes = String(serialized)
    .split(';')
    .map((value) => value.trim());
  const cookie = attributes[0] || '';
  if (
    !/^navet_profile_client_[a-f0-9]{24}=[a-f0-9]{64}$/i.test(cookie) ||
    attributes.indexOf(`Path=${addonIngressPath}`) === -1 ||
    attributes.indexOf('HttpOnly') === -1 ||
    attributes.indexOf('SameSite=Lax') === -1 ||
    attributes.indexOf('Secure') === -1
  ) {
    throw new Error(`Home Assistant add-on emitted an invalid Ingress cookie: ${serialized}`);
  }
  if (expectedCookie && cookie !== expectedCookie) {
    throw new Error('Home Assistant add-on cookie namespace changed after replacement');
  }
  return cookie;
}

class HostCookieJar {
  #cookiesByHost = new Map();

  #host(baseUrl) {
    return new URL(baseUrl).hostname;
  }

  seed(baseUrl, cookie) {
    const separator = cookie.indexOf('=');
    if (separator <= 0) {
      throw new Error('Cannot seed the runtime cookie jar with an invalid cookie');
    }
    const host = this.#host(baseUrl);
    const cookies = this.#cookiesByHost.get(host) ?? new Map();
    cookies.set(cookie.slice(0, separator), cookie.slice(separator + 1));
    this.#cookiesByHost.set(host, cookies);
  }

  absorb(baseUrl, response) {
    const getSetCookie = response.headers.getSetCookie;
    const values =
      typeof getSetCookie === 'function'
        ? getSetCookie.call(response.headers)
        : [response.headers.get('set-cookie')].filter(Boolean);
    for (const serialized of values) {
      const pair = serialized.split(';', 1)[0] ?? '';
      const separator = pair.indexOf('=');
      if (separator <= 0) {
        continue;
      }
      const host = this.#host(baseUrl);
      const cookies = this.#cookiesByHost.get(host) ?? new Map();
      const name = pair.slice(0, separator);
      if (/;\s*Max-Age=0(?:;|$)/i.test(serialized)) {
        cookies.delete(name);
      } else {
        cookies.set(name, pair.slice(separator + 1));
      }
      this.#cookiesByHost.set(host, cookies);
    }
  }

  header(baseUrl) {
    return [...(this.#cookiesByHost.get(this.#host(baseUrl)) ?? new Map())]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }
}

async function fetchWithCookieJar(cookieJar, baseUrl, path) {
  const cookie = cookieJar.header(baseUrl);
  const response = await fetch(`${baseUrl}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  cookieJar.absorb(baseUrl, response);
  return response;
}

async function verifyTwoInstallationCookieJar({
  authenticatedCookie,
  baseUrl,
  imageTag,
  networkName,
  primaryInstallationKey,
}) {
  const siblingContainerName = `${networkName}-sibling`;
  const siblingVolumeName = `${networkName}-sibling-data`;
  try {
    run('docker', ['volume', 'create', siblingVolumeName]);
    const siblingBaseUrl = startNavetContainer(
      siblingContainerName,
      networkName,
      siblingVolumeName,
      imageTag
    );
    await waitForAuthMetadata(siblingBaseUrl, siblingContainerName);
    const siblingInstallationKey = readInstallationKey(siblingContainerName);
    if (siblingInstallationKey === primaryInstallationKey) {
      throw new Error('Separate Navet volumes produced the same installation key');
    }

    const cookieJar = new HostCookieJar();
    cookieJar.seed(baseUrl, authenticatedCookie);
    const primaryBefore = await fetchWithCookieJar(
      cookieJar,
      baseUrl,
      '/__navet_auth__/session'
    );
    const primaryBeforeMetadata = await primaryBefore.json();
    const primaryCookie = extractScopedCookie(primaryBefore, 'navet_auth_session');
    if (primaryBeforeMetadata?.authenticated !== true || !primaryCookie) {
      throw new Error('Primary installation was not authenticated before sibling visit');
    }

    const siblingResponse = await fetchWithCookieJar(
      cookieJar,
      siblingBaseUrl,
      '/__navet_auth__/session'
    );
    const siblingMetadata = await siblingResponse.json();
    const siblingCookie = extractScopedCookie(siblingResponse, 'navet_auth_session');
    if (
      siblingMetadata?.authenticated !== false ||
      !siblingCookie ||
      siblingCookie.split('=', 1)[0] === primaryCookie.split('=', 1)[0]
    ) {
      throw new Error('Sibling installation did not mint an isolated browser cookie');
    }

    const primaryAfter = await fetchWithCookieJar(
      cookieJar,
      baseUrl,
      '/__navet_auth__/session'
    );
    const primaryAfterMetadata = await primaryAfter.json();
    const jarHeader = cookieJar.header(baseUrl);
    if (
      primaryAfterMetadata?.authenticated !== true ||
      !jarHeader.includes(`${primaryCookie.split('=', 1)[0]}=`) ||
      !jarHeader.includes(`${siblingCookie.split('=', 1)[0]}=`)
    ) {
      throw new Error(
        'Visiting a sibling Navet port displaced the primary authenticated cookie'
      );
    }
  } finally {
    spawnSync('docker', ['rm', '-f', siblingContainerName], {
      stdio: 'ignore',
    });
    spawnSync('docker', ['volume', 'rm', '-f', siblingVolumeName], {
      stdio: 'ignore',
    });
  }
}

async function startHomeyOAuth(baseUrl) {
  const requestStart = (origin) =>
    fetch(`${baseUrl}/__navet_homey__/authorize`, {
      method: 'POST',
      headers: {
        ...(origin ? { Origin: origin } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ returnTo: '/' }),
    });
  for (const rejectedOrigin of [null, 'https://attacker.example']) {
    const rejected = await requestStart(rejectedOrigin);
    if (
      rejected.status !== 403 ||
      extractCookie(rejected, 'navet_homey_session')
    ) {
      throw new Error('Homey OAuth start accepted a missing or cross-origin Origin');
    }
  }
  const response = await requestStart(baseUrl);
  const cookie = extractScopedCookie(response, 'navet_homey_session');
  const body = await response.json();
  const state =
    typeof body?.authorizeUrl === 'string'
      ? new URL(body.authorizeUrl).searchParams.get('state')
      : '';
  if (
    response.status !== 200 ||
    !cookie ||
    !/^[a-f0-9]{64}$/.test(state ?? '')
  ) {
    throw new Error('Actual-image Homey OAuth start did not mint a pending session');
  }
  return cookie;
}

async function createOpenHABSession(baseUrl, installationKey) {
  const body = JSON.stringify({
      hassUrl: 'http://provider-check:8080/openhab',
      username: 'navet',
      password: 'actual-image-secret',
  });
  const requestLogin = (origin) =>
    fetch(`${baseUrl}/__navet_openhab__/session`, {
      method: 'PUT',
      headers: {
        ...(origin ? { Origin: origin } : {}),
        'Content-Type': 'application/json',
      },
      body,
    });
  for (const rejectedOrigin of [null, 'https://attacker.example']) {
    const rejected = await requestLogin(rejectedOrigin);
    if (
      rejected.status !== 403 ||
      extractCookie(rejected, 'navet_openhab_session')
    ) {
      throw new Error('openHAB login accepted a missing or cross-origin Origin');
    }
  }
  const response = await requestLogin(baseUrl);
  const responseBody = await response.text();
  const cookie = extractScopedCookie(response, 'navet_openhab_session');
  if (response.status !== 200 || !cookie) {
    throw new Error(
      `Actual-image openHAB login through the runtime resolver failed with ${response.status}: ${responseBody}`
    );
  }

  const proxyResponse = await fetch(
    `${baseUrl}/__navet_openhab_proxy__/rest/items?recursive=false`,
    {
      headers: {
        Cookie: cookie,
        'X-Navet-Installation-Key': installationKey,
      },
    }
  );
  assertSecurityHeaders(proxyResponse, 'the openHAB proxy');
  if (
    proxyResponse.status !== 200 ||
    (await proxyResponse.text()) !== '[]' ||
    proxyResponse.headers.get('x-accel-redirect') ||
    proxyResponse.headers.get('location') ||
    proxyResponse.headers.get('www-authenticate') ||
    proxyResponse.headers.get('set-cookie')?.includes('attacker=')
  ) {
    throw new Error('Actual-image openHAB response-header confinement failed');
  }
  if (!extractScopedCookie(proxyResponse, 'navet_openhab_session')) {
    throw new Error('Active openHAB proxy traffic did not slide its browser cookie');
  }

  for (const path of [
    '/rest/things',
    '/rest/items/Lamp%252f../../secret',
    '/rest/items/Lamp?unexpected=true',
  ]) {
    const isItemMutation = path.includes('items/Lamp');
    const blockedStatus = await rawHttpStatus(
      baseUrl,
      `/__navet_openhab_proxy__${path}`,
      {
        Cookie: cookie,
        Origin: baseUrl,
        ...(isItemMutation ? { 'Content-Type': 'text/plain' } : {}),
      },
      {
        body: isItemMutation ? 'ON' : undefined,
        method: isItemMutation ? 'POST' : 'GET',
      }
    );
    if (blockedStatus === 200) {
      throw new Error(`Forbidden openHAB proxy path reached upstream: ${path}`);
    }
  }
  return cookie;
}

async function verifyProfileColdBinding(baseUrl, authCookie) {
  const clientId = 'actual-image-panel-01';
  const request = (
    path,
    profileCookie = '',
    client = {
      id: clientId,
      name: 'Actual image panel',
      kind: 'wall_panel',
    }
  ) =>
    fetch(`${baseUrl}/__navet_profile__${path}`, {
      headers: {
        Cookie: [authCookie, profileCookie].filter(Boolean).join('; '),
        'X-Navet-Client-Id': client.id,
        'X-Navet-Client-Name': client.name,
        'X-Navet-Client-Kind': client.kind,
      },
    });
  const responses = await Promise.all([
    request('/default'),
    request('/preferences/client'),
    request('/clients'),
  ]);
  const bodies = await Promise.all(responses.map((response) => response.text()));
  const cookies = responses.map((response) =>
    extractScopedCookie(response, 'navet_profile_client')
  );
  if (
    responses.some((response) => ![200, 204].includes(response.status)) ||
    bodies.some((body) => body.includes('client-binding-mismatch')) ||
    cookies.some((cookie) => !cookie) ||
    new Set(cookies).size !== 1
  ) {
    throw new Error('Parallel cold profile requests produced competing client bindings');
  }

  const emptyClientPreference = responses[1];
  const preferenceInstallationId = emptyClientPreference.headers.get(
    'x-navet-installation-id'
  );
  const preferenceWorkspaceId = emptyClientPreference.headers.get(
    'x-navet-workspace-id'
  );
  const encodedPreferenceIdentity = emptyClientPreference.headers.get(
    'x-navet-preference-identity'
  );
  let preferenceIdentity = null;
  try {
    preferenceIdentity = encodedPreferenceIdentity
      ? JSON.parse(decodeURIComponent(encodedPreferenceIdentity))
      : null;
  } catch {
    preferenceIdentity = null;
  }
  if (
    emptyClientPreference.status !== 204 ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(preferenceInstallationId ?? '') ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(preferenceWorkspaceId ?? '') ||
    preferenceIdentity?.clientId !== clientId ||
    preferenceIdentity?.principal?.providerId !== 'home_assistant' ||
    preferenceIdentity?.principal?.userId !== null ||
    preferenceIdentity?.principal?.userName !== null
  ) {
    throw new Error(
      'Actual-image empty client preference response omitted its workspace or verified client identity'
    );
  }

  const profileCookie = cookies[0];
  for (const path of ['/default', '/preferences/client', '/clients']) {
    const replay = await request(path, profileCookie);
    const body = await replay.text();
    if (![200, 204].includes(replay.status) || body.includes('client-binding-mismatch')) {
      throw new Error(`Persisted profile client binding failed on ${path}`);
    }
  }

  const secondClient = {
    id: 'actual-image-panel-02',
    name: 'Second actual image panel',
    kind: 'desktop',
  };
  const secondClientResponse = await request('/clients', '', secondClient);
  const secondClientBody = await secondClientResponse.text();
  const secondProfileCookie = extractScopedCookie(
    secondClientResponse,
    'navet_profile_client'
  );
  if (
    secondClientResponse.status !== 200 ||
    !secondProfileCookie ||
    secondProfileCookie === profileCookie
  ) {
    throw new Error(
      `Actual-image second profile client failed with ${secondClientResponse.status}: ${secondClientBody}`
    );
  }
  const listedClients = JSON.parse(secondClientBody).clients;
  if (
    !Array.isArray(listedClients) ||
    !listedClients.some((client) => client.id === clientId) ||
    !listedClients.some((client) => client.id === secondClient.id)
  ) {
    throw new Error('Actual-image profile registry did not retain both browser clients');
  }
  const secondPreference = await request(
    '/preferences/client',
    secondProfileCookie,
    secondClient
  );
  if (![200, 204].includes(secondPreference.status)) {
    throw new Error(
      `Actual-image second client preference read failed with ${secondPreference.status}`
    );
  }
  const firstClientAfterSecond = await request('/clients', profileCookie);
  if (firstClientAfterSecond.status !== 200) {
    throw new Error(
      `Actual-image first client failed after second enrollment with ${firstClientAfterSecond.status}`
    );
  }

  const write = await fetch(`${baseUrl}/__navet_profile__/default`, {
    method: 'PUT',
    headers: {
      Cookie: `${authCookie}; ${profileCookie}`,
      Origin: baseUrl,
      'Content-Type': 'application/json',
      'X-Navet-Base-Revision': '0',
      'X-Navet-Changed-Paths': encodeURIComponent(
        JSON.stringify(['/dashboard/title'])
      ),
      'X-Navet-Client-Id': clientId,
      'X-Navet-Client-Name': 'Actual image panel',
      'X-Navet-Client-Kind': 'wall_panel',
    },
    body: JSON.stringify({
      app: 'navet',
      version: 3,
      exportedAt: '2026-07-29T00:00:00.000Z',
      dashboard: { title: 'Actual image profile' },
    }),
  });
  if (write.status !== 200) {
    throw new Error(`Actual-image profile write failed with ${write.status}`);
  }

  const staleWrite = await fetch(`${baseUrl}/__navet_profile__/default`, {
    method: 'PUT',
    headers: {
      Cookie: `${authCookie}; ${profileCookie}`,
      Origin: baseUrl,
      'Content-Type': 'application/json',
      'X-Navet-Base-Revision': '0',
      'X-Navet-Changed-Paths': encodeURIComponent(
        JSON.stringify(['/dashboard/title'])
      ),
      'X-Navet-Client-Id': clientId,
      'X-Navet-Client-Name': 'Actual image panel',
      'X-Navet-Client-Kind': 'wall_panel',
    },
    body: JSON.stringify({
      app: 'navet',
      version: 3,
      exportedAt: '2026-07-29T00:00:00.000Z',
      dashboard: { title: 'Stale profile write' },
    }),
  });
  if (staleWrite.status !== 412) {
    throw new Error(`Actual-image stale profile write returned ${staleWrite.status}`);
  }

  const afterStaleWrite = await request('/default', profileCookie);
  if (afterStaleWrite.status !== 200) {
    throw new Error('Profile endpoint stopped responding after a stale write');
  }
  return profileCookie;
}

async function seedAndVerifyUnavailableAuthRecord({
  authCookie,
  baseUrl,
  containerName,
}) {
  const cookieId = cookieValue(authCookie);
  if (!/^[a-f0-9]{64}$/.test(cookieId)) {
    throw new Error('Cannot seed an invalid actual-image auth cookie');
  }
  const sessionPath = `/data/navet-auth-sessions/${cookieId}.json`;
  run('docker', [
    'exec',
    containerName,
    'sh',
    '-c',
    `umask 077; printf '%s' '{"version":2' > ${sessionPath}; chown nginx:nginx ${sessionPath}`,
  ]);
  const response = await fetch(`${baseUrl}/__navet_auth__/session`, {
    headers: { Cookie: authCookie },
  });
  const payload = await response.json();
  if (
    response.status !== 503 ||
    payload?.code !== 'credential-session-record-unavailable'
  ) {
    throw new Error('Actual image presented a corrupt auth record as a logout');
  }
  const preserved = spawnSync(
    'docker',
    ['exec', containerName, 'cat', sessionPath],
    { stdio: 'pipe', encoding: 'utf8' }
  );
  if (
    preserved.error ||
    preserved.status !== 0 ||
    preserved.stdout !== '{"version":2'
  ) {
    throw new Error('Actual image destroyed a corrupt auth record');
  }
  return { authCookie, sessionPath };
}

function assertConfiguredInstallationKeyMismatchRejected({
  imageTag,
  installationKey,
  volumeName,
}) {
  const mismatchedKey =
    installationKey === 'f'.repeat(64) ? 'e'.repeat(64) : 'f'.repeat(64);
  const mismatch = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--mount',
      `type=volume,source=${volumeName},target=/data`,
      '-e',
      `NAVET_INSTALLATION_KEY=${mismatchedKey}`,
      imageTag,
    ],
    { stdio: 'pipe', encoding: 'utf8' }
  );
  if (
    mismatch.error ||
    mismatch.status === 0 ||
    !`${mismatch.stdout}\n${mismatch.stderr}`.includes(
      'refusing to rotate browser cookie scope'
    )
  ) {
    throw new Error('Actual image did not reject installation-key rotation on restart');
  }
  const persisted = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--entrypoint',
      '/bin/cat',
      '--mount',
      `type=volume,source=${volumeName},target=/data`,
      imageTag,
      '/data/navet-installation-key',
    ],
    { stdio: 'pipe', encoding: 'utf8' }
  );
  if (
    persisted.error ||
    persisted.status !== 0 ||
    persisted.stdout.trim() !== installationKey
  ) {
    throw new Error('Rejected installation-key rotation changed the persisted key');
  }
}

function assertConfiguredInstallationKeyIsNotLogged(imageTag) {
  const configuredKey = 'c'.repeat(64);
  const configuredStartup = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--tmpfs',
      '/data',
      '--entrypoint',
      '/bin/sh',
      '-e',
      `NAVET_INSTALLATION_KEY=${configuredKey}`,
      imageTag,
      '-c',
      '/docker-entrypoint.d/30-navet-config.sh',
    ],
    { stdio: 'pipe', encoding: 'utf8' }
  );
  const output = `${configuredStartup.stdout}\n${configuredStartup.stderr}`;
  if (
    configuredStartup.error ||
    configuredStartup.status !== 0 ||
    output.includes(configuredKey) ||
    output.includes('#navet_pairing=')
  ) {
    throw new Error('Actual image logged an operator-supplied installation key');
  }
}

async function verifyPersistedStateAfterReplacement({
  authCookie,
  authRefresh,
  baseUrl,
  containerName,
  corruptAuthRecord,
  installationKey,
  openHABCookie,
  profileCookie,
}) {
  const persistedInstallationKey = readInstallationKey(containerName);
  if (persistedInstallationKey !== installationKey) {
    throw new Error('Container replacement generated a different installation key');
  }

  const authResponse = await fetch(`${baseUrl}/__navet_auth__/session`, {
    headers: { Cookie: authCookie },
  });
  const authMetadata = await authResponse.json();
  if (
    authResponse.status !== 200 ||
    authMetadata?.authenticated !== true ||
    Object.hasOwn(authMetadata, 'access_token') ||
    Object.hasOwn(authMetadata, 'refresh_token')
  ) {
    throw new Error('Home Assistant browser session did not survive container replacement');
  }
  if (authMetadata.authRevision !== authRefresh.authRevision) {
    throw new Error('Home Assistant auth revision did not survive container replacement');
  }
  const persistedCredentials = await fetch(
    `${baseUrl}/__navet_auth__/session/credentials`,
    {
      method: 'POST',
      headers: {
        Cookie: authCookie,
        'X-Navet-OAuth-Binding': authRefresh.sessionId,
      },
    }
  ).then((response) => response.json());
  if (persistedCredentials?.access_token !== authRefresh.winningAuth.access_token) {
    throw new Error('Winning Home Assistant credentials did not survive replacement');
  }
  const staleAfterReplacement = await fetch(`${baseUrl}/__navet_auth__/session`, {
    method: 'PUT',
    headers: {
      Cookie: authCookie,
      Origin: baseUrl,
      'Content-Type': 'application/json',
      'X-Navet-OAuth-Binding': authRefresh.sessionId,
      'X-Navet-Auth-Revision': String(authRefresh.staleRevision),
    },
    body: JSON.stringify(authRefresh.staleAuth),
  });
  if (staleAfterReplacement.status !== 409) {
    throw new Error('A stale Home Assistant refresh was accepted after replacement');
  }

  const corruptResponse = await fetch(`${baseUrl}/__navet_auth__/session`, {
    headers: { Cookie: corruptAuthRecord.authCookie },
  });
  const corruptPayload = await corruptResponse.json();
  if (
    corruptResponse.status !== 503 ||
    corruptPayload?.code !== 'credential-session-record-unavailable'
  ) {
    throw new Error('Corrupt auth unavailability did not survive replacement');
  }
  const corruptContents = spawnSync(
    'docker',
    ['exec', containerName, 'cat', corruptAuthRecord.sessionPath],
    { stdio: 'pipe', encoding: 'utf8' }
  );
  if (
    corruptContents.error ||
    corruptContents.status !== 0 ||
    corruptContents.stdout !== '{"version":2'
  ) {
    throw new Error('Replacement destroyed the preserved corrupt auth record');
  }

  const proxyResponse = await fetch(`${baseUrl}/__navet_ha_proxy__/api/states`, {
    headers: { Cookie: authCookie },
  });
  if (proxyResponse.status !== 200 || (await proxyResponse.text()) !== '[]') {
    throw new Error('Persisted Home Assistant session was unusable after container replacement');
  }

  const profileResponse = await fetch(`${baseUrl}/__navet_profile__/default`, {
    headers: {
      Cookie: `${authCookie}; ${profileCookie}`,
      'X-Navet-Client-Id': 'actual-image-panel-01',
      'X-Navet-Client-Name': 'Actual image panel',
      'X-Navet-Client-Kind': 'wall_panel',
    },
  });
  const profileBody = await profileResponse.text();
  if (profileResponse.status !== 200 || !profileBody.includes('Actual image profile')) {
    throw new Error('Dashboard profile did not survive container replacement');
  }

  const openHABResponse = await fetch(
    `${baseUrl}/__navet_openhab_proxy__/rest/items?recursive=false`,
    {
      headers: { Cookie: openHABCookie },
    }
  );
  if (openHABResponse.status !== 200 || (await openHABResponse.text()) !== '[]') {
    throw new Error('openHAB browser session did not survive container replacement');
  }

  const ownership = spawnSync(
    'docker',
    ['exec', containerName, 'find', '/data', '!', '-user', 'nginx', '-print'],
    { stdio: 'pipe', encoding: 'utf8' }
  );
  if (ownership.error || ownership.status !== 0 || ownership.stdout.trim()) {
    throw new Error(
      `Persistent data is not owned by the Nginx worker: ${ownership.stdout.trim()}`
    );
  }

  const replacementLogs = spawnSync('docker', ['logs', containerName], {
    stdio: 'pipe',
    encoding: 'utf8',
  });
  if (`${replacementLogs.stdout}\n${replacementLogs.stderr}`.includes('#navet_pairing=')) {
    throw new Error('Container replacement treated the persisted installation as new');
  }
}

let rssFixture = null;
const imageTag = process.env.NAVET_TEST_STANDALONE_IMAGE || `navet-docker-runtime-check:${Date.now()}`;
const addonImageTag = process.env.NAVET_TEST_ADDON_IMAGE || `navet-addon-runtime-check:${Date.now()}`;
const expectedBuildVersion = process.env.NAVET_TEST_BUILD_VERSION || '0.0.0-dev.20990101010101';
if (Boolean(process.env.NAVET_TEST_STANDALONE_IMAGE) !== Boolean(process.env.NAVET_TEST_ADDON_IMAGE)) {
  throw new Error('Prebuilt runtime validation requires both standalone and add-on images.');
}
for (const reference of [process.env.NAVET_TEST_STANDALONE_IMAGE, process.env.NAVET_TEST_ADDON_IMAGE].filter(Boolean)) {
  if (!/(?:^|@)sha256:[a-f0-9]{64}$/.test(reference)) throw new Error('Prebuilt images must be pinned by digest.');
}
const containerName = `navet-docker-runtime-check-${process.pid}-${Date.now()}`;
const addonContainerName = `${containerName}-addon`;
const addonProbeContainerName = `${containerName}-addon-probe`;
const providerContainerName = `${containerName}-provider`;
const networkName = `${containerName}-network`;
const addonNetworkName = `${containerName}-addon-network`;
const volumeName = `${containerName}-data`;
const addonVolumeName = `${containerName}-addon-data`;
const providerServerSource = `
  const http = require('http');
  http.createServer((req, res) => {
    req.resume();
    if (req.headers['x-navet-installation-key']) {
      res.statusCode = 418;
      res.end('pairing header leaked');
      return;
    }
    if (req.url === '/ha/auth/token' && req.method === 'POST') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        access_token: 'actual-image-access',
        refresh_token: 'actual-image-refresh',
        expires_in: 3600
      }));
      return;
    }
    if (req.url === '/ha/api/states') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.end('[]');
      return;
    }
    if (req.url && req.url.startsWith('/openhab/rest/items')) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Set-Cookie', 'attacker=stolen');
      res.setHeader('Location', 'http://attacker.invalid/');
      res.setHeader('WWW-Authenticate', 'Basic realm="attacker"');
      res.setHeader('X-Accel-Redirect', '/config.js');
      res.end('[]');
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  }).listen(8080, '0.0.0.0');
`;

try {
  ensureSerializedProfileRuntime();
  ensurePersistentDataConfiguration();
  ensureDockerAvailable();
  if (!process.env.NAVET_TEST_STANDALONE_IMAGE) run(
    'docker',
    [
      'build',
      '--build-arg',
      'NAVET_ENABLE_DEMO=false',
      '--build-arg',
      `NAVET_BUILD_VERSION=${expectedBuildVersion}`,
      '-t',
      imageTag,
      '.',
    ],
    {
      cwd: process.cwd(),
    }
  );
  const imageVolumes = spawnSync(
    'docker',
    ['image', 'inspect', '--format', '{{json .Config.Volumes}}', imageTag],
    { stdio: 'pipe', encoding: 'utf8' }
  );
  if (
    imageVolumes.error ||
    imageVolumes.status !== 0 ||
    !Object.hasOwn(JSON.parse(imageVolumes.stdout), '/data')
  ) {
    throw new Error('Built standalone image does not declare /data as a volume');
  }
  run('docker', [
    'run',
    '--rm',
    '-e',
    'NAVET_HASS_URL=http://homeassistant.local:8123',
    '--tmpfs',
    '/data',
    imageTag,
    'nginx',
    '-t',
  ]);
  assertConfiguredInstallationKeyIsNotLogged(imageTag);
  const addonTarget = resolveHomeAssistantAddonTarget();
  if (!process.env.NAVET_TEST_ADDON_IMAGE) run(
    'docker',
    [
      'build',
      '--platform',
      addonTarget.platform,
      '--file',
      'platform/home-assistant/addons/navet/Dockerfile',
      '--build-arg',
      `BUILD_FROM=${addonTarget.buildFrom}`,
      '--build-arg',
      `BUILD_ARCH=${addonTarget.addonArchitecture}`,
      '--build-arg',
      `BUILD_VERSION=${expectedBuildVersion}`,
      '--build-arg',
      'NAVET_GIT_SHA=actual-image-runtime-check',
      '--build-arg',
      'NAVET_BUILD_DATE=2099-01-01T01:01:01Z',
      '--build-arg',
      'NAVET_RELEASE_CHANNEL=development',
      '--build-arg',
      `NAVET_BUILD_VERSION=${expectedBuildVersion}`,
      '-t',
      addonImageTag,
      '.',
    ],
    {
      cwd: process.cwd(),
    }
  );
  rssFixture = await startRssFixture(containerName);
  run('docker', ['volume', 'create', addonVolumeName]);
  seedHomeAssistantAddonOptions(addonImageTag, addonVolumeName);
  run('docker', [
    'network',
    'create',
    '--subnet',
    '172.30.32.0/24',
    addonNetworkName,
  ]);
  run('docker', [
    'run',
    '-d',
    '--name',
    addonProbeContainerName,
    '--network',
    addonNetworkName,
    '--network-alias',
    'supervisor',
    '--ip',
    '172.30.32.2',
    'node:22-alpine',
    'node',
    '-e',
    'setInterval(() => {}, 60_000)',
  ]);
  startHomeAssistantAddonContainer({
    compatibilityEntrypoint: addonTarget.compatibilityEntrypoint,
    containerName: addonContainerName,
    imageTag: addonImageTag,
    networkName: addonNetworkName,
    volumeName: addonVolumeName,
  });
  const firstAddonProfile = await waitForHomeAssistantAddonIngressProfile(
    addonContainerName,
    addonProbeContainerName
  );
  assertBuiltStandaloneMetadata(addonContainerName, expectedBuildVersion);
  assertHomeAssistantAddonDirectListener(addonProbeContainerName, addonContainerName);
  assertHomeAssistantAddonProxyDenied(addonProbeContainerName);
  const addonCookie = assertHomeAssistantAddonIngressCookie(
    firstAddonProfile.cookie
  );
  const addonInstallationKey = readInstallationKey(addonContainerName);
  assertInstallationKeyOwner(addonContainerName);
  run('docker', ['exec', addonContainerName, 'nginx', '-t']);
  const firstAddonChores = readHomeAssistantAddonIngressChores(
    addonProbeContainerName,
    true
  );
  assertHomeAssistantAddonChores(
    firstAddonChores,
    firstAddonChores.workspace.revision
  );
  const addonChoreRevision = firstAddonChores.workspace.revision;

  run('docker', ['rm', '-f', addonContainerName]);
  startHomeAssistantAddonContainer({
    compatibilityEntrypoint: addonTarget.compatibilityEntrypoint,
    containerName: addonContainerName,
    imageTag: addonImageTag,
    networkName: addonNetworkName,
    volumeName: addonVolumeName,
  });
  const replacementAddonProfile =
    await waitForHomeAssistantAddonIngressProfile(
      addonContainerName,
      addonProbeContainerName,
      addonCookie
    );
  assertHomeAssistantAddonIngressCookie(
    replacementAddonProfile.cookie,
    addonCookie
  );
  if (readInstallationKey(addonContainerName) !== addonInstallationKey) {
    throw new Error(
      'Home Assistant add-on generated a different installation key after replacement'
    );
  }
  assertInstallationKeyOwner(addonContainerName);
  run('docker', ['exec', addonContainerName, 'nginx', '-t']);
  assertHomeAssistantAddonChores(
    readHomeAssistantAddonIngressChores(addonProbeContainerName),
    addonChoreRevision
  );

  verifyAddonRssBoundary(addonProbeContainerName);
  await verifyRssServiceSupervision(addonContainerName);
  run('docker', ['start', addonContainerName]);
  await waitForHomeAssistantAddonIngressProfile(addonContainerName, addonProbeContainerName, addonCookie);
  verifyAddonRssBoundary(addonProbeContainerName);

  run('docker', ['volume', 'create', volumeName]);
  run('docker', ['network', 'create', networkName]);
  run('docker', [
    'run',
    '-d',
    '--name',
    providerContainerName,
    '--network',
    networkName,
    '--network-alias',
    'provider-check',
    'node:22-alpine',
    'node',
    '-e',
    providerServerSource,
  ]);
  await waitForProvider(providerContainerName);
  const baseUrl = startNavetContainer(containerName, networkName, volumeName, imageTag);
  assertBuiltStandaloneMetadata(containerName, expectedBuildVersion);

  const firstBrowser = await waitForAuthMetadata(baseUrl, containerName);
  run('docker', ['cp', 'scripts/check-chore-durable-njs.js', `${containerName}:/tmp/check-chore-durable-njs.js`]);
  run('docker', ['exec', containerName, 'njs', '/tmp/check-chore-durable-njs.js']);
  const secondBrowser = await waitForAuthMetadata(baseUrl, containerName);
  const installationKey = readInstallationKey(containerName);
  const htmlResponse = await fetch(`${baseUrl}/`);
  assertSecurityHeaders(htmlResponse, 'the HTML shell');
  if ((await htmlResponse.text()).includes(installationKey)) {
    throw new Error('The installation key leaked into the HTML response');
  }
  await assertWebManifestDelivery(baseUrl);
  const authApiResponse = await fetch(`${baseUrl}/__navet_auth__/session`, {
    headers: { Cookie: firstBrowser.cookie },
  });
  assertSecurityHeaders(authApiResponse, 'the auth API');
  if ((await authApiResponse.text()).includes(installationKey)) {
    throw new Error('The installation key leaked into the auth API response');
  }
  await verifyNjsWriteValidatorShield(baseUrl);
  if (firstBrowser.metadata.sessionId === secondBrowser.metadata.sessionId) {
    throw new Error('Separate cookie-less requests received the same auth session ID');
  }
  const authFiles = spawnSync(
    'docker',
    [
      'exec',
      containerName,
      'find',
      '/data/navet-auth-sessions',
      '-maxdepth',
      '1',
      '-name',
      '*.json',
      '-print',
    ],
    { stdio: 'pipe', encoding: 'utf8' }
  );
  if (authFiles.stdout.trim()) {
    throw new Error('Anonymous Home Assistant metadata GET created a session record');
  }

  const fixedCookie = `navet_auth_session=${'a'.repeat(64)}`;
  const fixedCookieResponse = await fetch(`${baseUrl}/__navet_auth__/session`, {
    headers: { Cookie: fixedCookie },
  });
  if (extractCookie(fixedCookieResponse, 'navet_auth_session') === fixedCookie) {
    throw new Error('An unbacked caller-supplied auth cookie was not rotated');
  }

  const state = await startHomeAssistantOAuth(
    baseUrl,
    containerName,
    firstBrowser,
    installationKey
  );
  const authenticatedCookie = await completeHomeAssistantOAuth(
    baseUrl,
    firstBrowser,
    state
  );
  await verifyRssBoundary(baseUrl, { Cookie: authenticatedCookie,
    Authorization: 'Bearer must-not-reach-feed',
    'X-Navet-Installation-Key': 'must-not-reach-feed',
  }, 'provider-check', rssFixture.url);
  await startHomeAssistantOAuthThroughAlternateBrowserRoute(
    baseUrl,
    containerName,
    secondBrowser,
    installationKey
  );
  await verifyHomeAssistantProxyTokenRefresh(baseUrl, authenticatedCookie);
  const authRefresh = await verifyHomeAssistantRefreshRevision(
    baseUrl,
    authenticatedCookie
  );
  await verifyTwoInstallationCookieJar({
    authenticatedCookie,
    baseUrl,
    imageTag,
    networkName,
    primaryInstallationKey: installationKey,
  });
  const oldCookieMetadata = await fetch(`${baseUrl}/__navet_auth__/session`, {
    headers: { Cookie: firstBrowser.cookie },
  }).then((response) => response.json());
  if (oldCookieMetadata.authenticated !== false) {
    throw new Error('The pre-login Home Assistant cookie remained authorized after rotation');
  }

  for (const origin of [null, 'http://sibling.navet.example']) {
    const blocked = await fetch(`${baseUrl}/__navet_ha_proxy__/api/states`, {
      method: 'POST',
      headers: {
        Cookie: authenticatedCookie,
        'Content-Type': 'application/json',
        ...(origin ? { Origin: origin } : {}),
      },
      body: '{}',
    });
    if (blocked.status !== 403) {
      throw new Error(`Cross-origin Home Assistant mutation was not blocked (${blocked.status})`);
    }
  }
  const allowedHaMutation = await fetch(
    `${baseUrl}/__navet_ha_proxy__/api/states`,
    {
      method: 'POST',
      headers: {
        Cookie: authenticatedCookie,
        Origin: baseUrl,
        'Content-Type': 'application/json',
        'X-Navet-Installation-Key': installationKey,
      },
      body: '{}',
    }
  );
  if (
    allowedHaMutation.status !== 200 ||
    allowedHaMutation.headers.get('access-control-allow-origin') ||
    allowedHaMutation.headers.get('access-control-allow-credentials') ||
    allowedHaMutation.headers.get('access-control-allow-headers')
  ) {
    throw new Error('Home Assistant proxy origin or CORS response confinement failed');
  }
  const blockedUpgrade = await rawHttpStatus(
    baseUrl,
    '/__navet_ha_proxy__/api/states',
    {
      Cookie: authenticatedCookie,
      Upgrade: 'h2c',
      Connection: 'upgrade',
    }
  );
  if (blockedUpgrade !== 403) {
    throw new Error(`Cross-origin provider upgrade was not blocked (${blockedUpgrade})`);
  }

  await assertAnonymousProviderReadDoesNotMint(baseUrl, containerName, 'homey');
  await assertAnonymousProviderReadDoesNotMint(baseUrl, containerName, 'openhab');
  const blockedHomeyMutation = await fetch(
    `${baseUrl}/__navet_homey_proxy__/api/manager/devices`,
    { method: 'POST' }
  );
  if (blockedHomeyMutation.status !== 403) {
    throw new Error(
      `Cross-origin Homey mutation was not blocked (${blockedHomeyMutation.status})`
    );
  }
  await startHomeyOAuth(baseUrl);
  const openHABCookie = await createOpenHABSession(baseUrl, installationKey);
  const profileCookie = await verifyProfileColdBinding(baseUrl, authenticatedCookie);
  const corruptAuthRecord = await seedAndVerifyUnavailableAuthRecord({
    authCookie: secondBrowser.cookie,
    baseUrl,
    containerName,
  });

  const dataFiles = spawnSync(
    'docker',
    ['exec', containerName, 'find', '/data', '-type', 'f', '-print'],
    { stdio: 'pipe', encoding: 'utf8' }
  ).stdout
    .split('\n')
    .map((value) => value.trim())
    .filter(
      (value) =>
        value && value !== '/data/navet-installation-key'
    );
  for (const file of dataFiles) {
    const contents = spawnSync(
      'docker',
      ['exec', containerName, 'cat', file],
      { stdio: 'pipe', encoding: 'utf8' }
    ).stdout;
    if (contents.includes(installationKey)) {
      throw new Error(`The installation key leaked into ${file}`);
    }
  }
  const runtimeLogs = spawnSync('docker', ['logs', containerName], {
    stdio: 'pipe',
    encoding: 'utf8',
  });
  const combinedRuntimeLogs = `${runtimeLogs.stdout}\n${runtimeLogs.stderr}`;
  if (
    /headers? already sent|worker process \d+ exited on signal 11|js exception/i.test(
      combinedRuntimeLogs
    )
  ) {
    throw new Error('The profile runtime logged a JavaScript exception or crashed');
  }
  if (combinedRuntimeLogs.includes(installationKey)) {
    throw new Error('The installation key leaked into runtime logs');
  }
  const setupCodeLogLines = combinedRuntimeLogs
    .split('\n')
    .filter((line) => /Navet setup code: [a-f0-9]{4}(?:-[a-f0-9]{4}){3}/.test(line));
  if (setupCodeLogLines.length !== 0) {
    throw new Error('Standalone startup unexpectedly logged a temporary setup code');
  }
  const initializationLogLines = combinedRuntimeLogs
    .split('\n')
    .filter((line) => line === 'Navet installation security initialized.');
  if (initializationLogLines.length !== 1) {
    throw new Error('Installation security initialization was not logged exactly once at startup');
  }

  const resolverConfig = spawnSync(
    'docker',
    ['exec', containerName, 'cat', '/etc/nginx/resolver.conf'],
    { stdio: 'pipe', encoding: 'utf8' }
  ).stdout;
  const nginxConfig = spawnSync(
    'docker',
    ['exec', containerName, 'nginx', '-T'],
    { stdio: 'pipe', encoding: 'utf8' }
  ).stdout;
  if (
    !resolverConfig.includes('127.0.0.11') ||
    !nginxConfig.includes('proxy_ssl_verify on;') ||
    !nginxConfig.includes('proxy_ignore_headers X-Accel-Redirect') ||
    (
      nginxConfig.match(
        /proxy_set_header X-Navet-Installation-Key "";/g
      ) ?? []
    ).length < 5
  ) {
    throw new Error(
      'Runtime DNS, TLS verification, pairing-header stripping, or response confinement config is missing'
    );
  }

  await verifyRssServiceSupervision(containerName);
  run('docker', ['rm', '-f', containerName]);
  assertConfiguredInstallationKeyMismatchRejected({
    imageTag,
    installationKey,
    volumeName,
  });
  const replacementBaseUrl = startNavetContainer(
    containerName,
    networkName,
    volumeName,
    imageTag
  );
  await waitForAuthMetadata(replacementBaseUrl, containerName);
  await verifyPersistedStateAfterReplacement({
    authCookie: authenticatedCookie,
    authRefresh,
    baseUrl: replacementBaseUrl,
    containerName,
    corruptAuthRecord,
    installationKey,
    openHABCookie,
    profileCookie,
  });

  await verifyRssBoundary(replacementBaseUrl, { Cookie: authenticatedCookie }, 'provider-check', rssFixture.url);

  console.log(
    `Docker NJS auth smoke check passed with a Home Assistant add-on startup/replacement cycle using ${
      addonTarget.exactBase
        ? 'the exact Home Assistant base image'
        : 'the explicit Alpine with-contenv/bashio compatibility fallback'
    }, separate add-on Ingress and direct OAuth listeners, exact standalone build metadata, no anonymous record minting, OAuth rotation, proxied token renewal, direct alternate-target Home Assistant login, two-installation host cookie isolation, runtime hostname resolution, pinned RSS HTTPS with private-DNS rejection and isolated credentials, bounded XML, transport supervision/recovery, provider confinement, stable parallel profile binding, njs-safe two-client profile ordering, cross-request chore management PIN sessions, and persisted auth/profile state after container replacement.`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  for (const name of [containerName, addonContainerName]) {
    const logs = spawnSync('docker', ['logs', '--tail', '60', name], { encoding: 'utf8' });
    if (logs.status === 0) console.error(logs.stdout + logs.stderr);
    const nginxLog = spawnSync('docker', ['exec', name, 'tail', '-60', '/var/log/nginx/error.log'], { encoding: 'utf8', timeout: 2000 });
    if (nginxLog.status === 0) console.error(nginxLog.stdout);
  }
  process.exitCode = 1;
} finally {
  await rssFixture?.cleanup();
  spawnSync('docker', ['rm', '-f', containerName], {
    stdio: 'ignore',
  });
  spawnSync('docker', ['rm', '-f', addonContainerName], {
    stdio: 'ignore',
  });
  spawnSync('docker', ['rm', '-f', addonProbeContainerName], {
    stdio: 'ignore',
  });
  spawnSync('docker', ['rm', '-f', providerContainerName], {
    stdio: 'ignore',
  });
  spawnSync('docker', ['network', 'rm', addonNetworkName], {
    stdio: 'ignore',
  });
  spawnSync('docker', ['network', 'rm', networkName], {
    stdio: 'ignore',
  });
  spawnSync('docker', ['volume', 'rm', '-f', addonVolumeName], {
    stdio: 'ignore',
  });
  spawnSync('docker', ['volume', 'rm', '-f', volumeName], {
    stdio: 'ignore',
  });
  if (!process.env.NAVET_TEST_ADDON_IMAGE) spawnSync('docker', ['image', 'rm', '-f', addonImageTag], {
    stdio: 'ignore',
  });
  if (!process.env.NAVET_TEST_STANDALONE_IMAGE) spawnSync('docker', ['image', 'rm', '-f', imageTag], {
    stdio: 'ignore',
  });
}
