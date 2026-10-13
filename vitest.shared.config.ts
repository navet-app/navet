import { readFileSync } from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { getMarketingReleaseHighlights } from './scripts/marketing-release-highlights.mjs';

const configDir = import.meta.dirname;
const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version?: string;
};
const appVersion = packageJson.version ?? '0.0.0';
const latestRelease = {
  version: appVersion,
  url: `https://github.com/navet-app/navet/releases/tag/v${appVersion}`,
  highlights: getMarketingReleaseHighlights(
    readFileSync(new URL('./CHANGELOG.md', import.meta.url), 'utf8'),
    appVersion
  ),
};

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_GIT_SHA__: JSON.stringify('test-sha'),
    __APP_BUILD_DATE__: JSON.stringify('2026-01-01T00:00:00.000Z'),
    __APP_RELEASE_CHANNEL__: JSON.stringify('development'),
    __APP_BUILD_VERSION__: JSON.stringify(appVersion),
    __MARKETING_LATEST_RELEASE__: JSON.stringify(latestRelease),
  },
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['packages/app/src/**/*.{ts,tsx}'],
      exclude: [
        'packages/app/src/**/*.d.ts',
        'packages/app/src/**/index.ts',
        '**/*.json',
        '**/package.json',
      ],
    },
  },
  resolve: {
    alias: {
      '@assets': path.resolve(configDir, './assets'),
      '@docs': path.resolve(configDir, './docs'),
      '@website': path.resolve(configDir, './apps/website/src'),
      '@navet/core': path.resolve(configDir, './packages/core/src'),
      '@navet/ui': path.resolve(configDir, './packages/ui/src'),
      '@navet/app': path.resolve(configDir, './packages/app/src'),
      '@navet/provider-homeassistant': path.resolve(
        configDir,
        './packages/provider-homeassistant/src'
      ),
      '@navet/provider-homey': path.resolve(configDir, './packages/provider-homey/src'),
      '@navet/provider-openhab': path.resolve(configDir, './packages/provider-openhab/src'),
      '@docker': path.resolve(configDir, './docker'),
      '@scripts': path.resolve(configDir, './scripts'),
      'virtual:pwa-register': path.resolve(
        configDir,
        './packages/app/src/test/mocks/virtual-pwa-register.ts'
      ),
    },
  },
});
