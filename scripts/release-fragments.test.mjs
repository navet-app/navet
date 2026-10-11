import { describe, expect, it } from 'vitest';
import { isDependabotDependencyUpdate, parseReleaseFragment, renderReleaseNotes } from './release-fragments.mjs';

describe('release fragments', () => {
  // Keep: untrusted fragment fields must fail validation without prototype mutation.
  it.each(['__proto__', 'constructor', 'prototype'])(
    'rejects unsupported prototype-related fields: %s',
    (field) => {
      expect(() => parseReleaseFragment(
        `type: internal\naudiences: []\nsummary: Reviewed release tooling.\n${field}: injected\n`
      )).toThrow('unsupported fields');
      expect(Object.prototype).not.toHaveProperty('injected');
    }
  );
  it('validates and renders user-facing fragments by category', () => {
    const fragments = [
      parseReleaseFragment(
        'type: new\naudiences: [standalone, home-assistant]\nsummary: Added room-scoped dashboard recovery.\n',
        '.changes/rooms.yaml'
      ),
      parseReleaseFragment(
        'type: fixed\naudiences: [standalone]\nsummary: Fixed blank media artwork fallbacks.\n',
        '.changes/media.yaml'
      ),
    ];

    expect(renderReleaseNotes(fragments)).toBe(
      '## New features\n\n- Added room-scoped dashboard recovery.\n\n## Improvements and bug fixes\n\n- Fixed blank media artwork fallbacks.\n'
    );
    expect(renderReleaseNotes(fragments, { audience: 'home-assistant' })).toBe(
      '## New features\n\n- Added room-scoped dashboard recovery.\n'
    );
  });

  it('requires explicit internal fragments for changes without release notes', () => {
    expect(
      parseReleaseFragment(
        'type: internal\naudiences: []\nsummary: Reworked release automation tests.\n',
        '.changes/release-tooling.yaml'
      )
    ).toMatchObject({ type: 'internal', audiences: [] });
  });

  it('rejects verbose or invalid fragments', () => {
    expect(() =>
      parseReleaseFragment(
        'type: fixed\naudiences: []\nsummary: Fixed something.\n',
        '.changes/invalid.yaml'
      )
    ).toThrow('must name at least one audience');

    expect(() =>
      parseReleaseFragment(
        `type: fixed\naudiences: [standalone]\nsummary: ${'word '.repeat(21).trim()}\n`,
        '.changes/verbose.yaml'
      )
    ).toThrow('20 words or fewer');

    expect(() =>
      parseReleaseFragment(
        'type: fixed\naudiences: [standalone]\nsummary: Fixed setup.\nowner: maintainer\n',
        '.changes/unknown-field.yaml'
      )
    ).toThrow('unsupported fields');
  });
});

// Keep the existing fragment validation and rendering regressions.
describe('Dependabot fragment policy', () => {
  const bot = { login: 'dependabot[bot]', type: 'Bot' };
  const fixtureLock = 'testing/provider-lab/homey-fixture-app/package-lock.json';
  it('accepts grouped dependency lockfiles and dependency-only manifests', () => {
    const read = (revision) => JSON.stringify({ name: 'navet', scripts: { test: 'vitest' }, dependencies: { react: revision === 'base' ? '19.0.0' : '19.1.0' } });
    expect(isDependabotDependencyUpdate(bot, [fixtureLock, 'pnpm-lock.yaml', 'package.json'], read)).toBe(true);
    expect(isDependabotDependencyUpdate(bot, ['packages/app/package.json'], read)).toBe(true);
  });
  it('requires the actual bot author and a nonempty dependency-only diff', () => {
    expect(isDependabotDependencyUpdate({ login: 'maintainer', type: 'User' }, [fixtureLock])).toBe(false);
    expect(isDependabotDependencyUpdate({ login: 'dependabot[bot]', type: 'User' }, [fixtureLock])).toBe(false);
    expect(isDependabotDependencyUpdate(bot, [])).toBe(false);
    expect(isDependabotDependencyUpdate(bot, [fixtureLock, 'packages/app/src/app.tsx'])).toBe(false);
    expect(isDependabotDependencyUpdate(bot, ['.github/workflows/ci.yml'])).toBe(false);
    expect(isDependabotDependencyUpdate(bot, ['other/package-lock.json'])).toBe(false);
  });
  it('rejects script, version, malformed and added/deleted manifest changes', () => {
    for (const after of [{ scripts: { test: 'new-command' } }, { version: '2.0.0' }]) {
      expect(isDependabotDependencyUpdate(bot, ['package.json'], (revision) => JSON.stringify(revision === 'base' ? { version: '1.0.0', scripts: { test: 'vitest' } } : after))).toBe(false);
    }
    expect(isDependabotDependencyUpdate(bot, ['package.json'], () => '{')).toBe(false);
    expect(isDependabotDependencyUpdate(bot, ['package.json'], () => { throw new Error('missing'); })).toBe(false);
  });
});
