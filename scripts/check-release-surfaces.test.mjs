import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readYaml } from './release-surfaces.mjs';

const fixtures = [];
afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture({ addonVersion = '0.17.2', addonNotes = '0.17.2', docVersion = '0.17.1' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'navet-release-surfaces-'));
  fixtures.push(root);
  const files = {
    'package.json': JSON.stringify({ version: '0.17.1' }),
    'repository.yaml': 'url: https://github.com/navet-app/navet\n',
    'docs/VERSIONING.md': `- current version: \`${docVersion}\`\n`,
    'CHANGELOG.md': '## 0.17.1\n\n## Improvements and bug fixes\n\n- Fixed setup.\n',
    'platform/home-assistant/custom_components/navet/manifest.json': JSON.stringify({ version: '0.17.1' }),
    'platform/home-assistant/addons/navet/config.yaml': `version: "${addonVersion}"\n`,
    'platform/home-assistant/addons/navet/CHANGELOG.md': `## ${addonNotes}\n\n- Fixed setup.\n`,
    'packages/app/src/constants/app-version.ts': 'export const APP_VERSION = __APP_VERSION__;\n',
  };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  mkdirSync(join(root, 'scripts'));
  for (const script of ['check-release-surfaces.mjs', 'release-surfaces.mjs', 'repo-paths.mjs', 'marketing-release-highlights.mjs']) {
    copyFileSync(join(import.meta.dirname, script), join(root, 'scripts', script));
  }
  return (...args) => spawnSync(process.execPath, [join(root, 'scripts/check-release-surfaces.mjs'), ...args], { encoding: 'utf8' });
}

describe('release surface validation', () => {
  // Keep: arbitrary YAML keys are data, including names inherited by ordinary objects.
  it('reads prototype-related metadata keys without changing the record prototype', () => {
    const root = mkdtempSync(join(tmpdir(), 'navet-release-yaml-'));
    fixtures.push(root);
    const file = join(root, 'metadata.yaml');
    writeFileSync(file, '__proto__: injected\nconstructor: custom\nversion: 0.17.1\n');
    const metadata = readYaml(file);
    expect(Object.getPrototypeOf(metadata)).toBeNull();
    expect(metadata.__proto__).toBe('injected');
    expect(metadata.constructor).toBe('custom');
    expect(metadata.version).toBe('0.17.1');
  });
  it('accepts published add-on metadata ahead of the source line', () => {
    expect(fixture()().status).toBe(0);
  });

  it('requires release notes for the published add-on version', () => {
    const result = fixture({ addonNotes: '0.17.1' })();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('CHANGELOG.md does not contain a section for 0.17.2');
  });

  it('rejects malformed add-on versions', () => {
    const result = fixture({ addonVersion: 'invalid' })();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid add-on version');
  });

  it('still requires source-line documentation to match the package', () => {
    const result = fixture({ docVersion: '0.17.2' })();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('docs/VERSIONING.md current version');
  });

  it('requires aligned add-on metadata when checking an explicit tag', () => {
    const result = fixture()('--tag', 'v0.17.1');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('config.yaml version 0.17.2 does not match');
  });

  it('accepts a matching tag and rejects a different or missing tag value', () => {
    const run = fixture({ addonVersion: '0.17.1', addonNotes: '0.17.1' });
    expect(run('--tag', 'v0.17.1').status).toBe(0);
    expect(run('--tag', 'v0.17.2').stderr).toContain('Git tag v0.17.2 does not match');
    expect(run('--tag').stderr).toContain('Missing value for --tag');
  });
});
