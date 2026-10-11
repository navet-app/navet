import {
  createNavetPackageAliases,
  createBuildMetadata,
  REACT_COMPILER_EXCLUDE,
} from '../../scripts/vite-host-conventions.ts';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import path from 'path';
import { defineConfig, loadEnv, type PluginOption, type UserConfig } from 'vite';
import { VitePWA, type VitePWAOptions } from 'vite-plugin-pwa';
import {
  createViteInstallationAuthority,
  type ViteInstallationAuthority,
} from '../../scripts/vite-installation-authority.ts';
import { createViteDeviceSessionAuthority } from '../../scripts/vite-device-session-authority.ts';
import { createInstallationCookieNames } from '../../scripts/installation-cookie-scope.ts';
import { getVendorChunkName, isLazyHtmlPreload } from '../../scripts/vite-chunking.ts';
import {
  createVitePwaCachePolicy,
  deferVitePwaGenerationUntilWriteBundle,
  isNavetRuntimeAssetRequest,
  NAVET_PWA_INCLUDE_ASSETS,
} from '../../scripts/vite-pwa-cache.ts';
import { NAVET_INTERNAL_NAVIGATION_PATH_PATTERN } from '../../scripts/vite-pwa-routing.ts';
import { rssProxyPlugin, spotifyMetadataPlugin } from '../../scripts/vite-public-media-plugins.ts';
import {
  homeAssistantProxyPlugin,
  homeyProxyPlugin,
  openhabProxyPlugin,
} from '../../scripts/vite-provider-proxy-plugins.ts';
import {
  authSessionStorePlugin,
  choreStorePlugin,
  dashboardProfileStorePlugin,
  deviceSessionStorePlugin,
} from '../../scripts/vite-workspace-plugins.ts';
import { homeySessionStorePlugin } from '../../scripts/vite-homey-session-plugin.ts';
import { openhabSessionStorePlugin } from '../../scripts/vite-openhab-session-plugin.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');
type VitePwaManifestTransform = NonNullable<
  VitePWAOptions['workbox']['manifestTransforms']
>[number];
const packageJson = JSON.parse(readFileSync(path.resolve(repoRoot, 'package.json'), 'utf8')) as {
  version?: string;
};
const appVersion = (process.env.NAVET_VERSION ?? packageJson.version ?? '0.0.0').trim();
const publicWebManifest = JSON.parse(
  readFileSync(path.resolve(repoRoot, 'assets/public/site.webmanifest'), 'utf8')
) as {
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: 'standalone';
  background_color: string;
  theme_color: string;
  orientation: 'portrait-primary';
  icons: Array<{
    src: string;
    sizes: string;
    type: string;
    purpose: 'any' | 'maskable';
  }>;
  categories: string[];
};
const DISABLED_INSTALLATION_AUTHORITY: ViteInstallationAuthority = {
  authorizeHomeAssistant: () => ({
    allowed: false,
    pairingVerified: false,
  }),
  authorizeHomeyStart: () => ({
    allowed: false,
    pairingVerified: false,
  }),
  authorizeOpenHAB: () => ({
    allowed: false,
    pairingVerified: false,
  }),
  commitHomeAssistant: () => false,
  commitHomey: () => false,
  commitOpenHAB: () => false,
  getCookieNames: (baseName) => createInstallationCookieNames(baseName),
};

const buildMetadata = createBuildMetadata(repoRoot, appVersion, 'git');

const REACT_COMPILER_INCLUDE = [
  /[\\/]src[\\/]/,
  /[\\/]packages[\\/][^\\/]+[\\/]src[\\/]/,
  /[\\/]apps[\\/]website[\\/]src[\\/]/,
];

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  if (env.NAVET_HOMEY_CLIENT_ID) {
    process.env.NAVET_HOMEY_CLIENT_ID = env.NAVET_HOMEY_CLIENT_ID;
  }
  if (env.NAVET_HOMEY_CLIENT_SECRET) {
    process.env.NAVET_HOMEY_CLIENT_SECRET = env.NAVET_HOMEY_CLIENT_SECRET;
  }
  if (env.NAVET_HOMEY_REDIRECT_URI) {
    process.env.NAVET_HOMEY_REDIRECT_URI = env.NAVET_HOMEY_REDIRECT_URI;
  }
  const hassUrl = env.NAVET_HASS_URL?.trim().replace(/\/$/, '');
  const enableDemo = (env.NAVET_ENABLE_DEMO ?? process.env.NAVET_ENABLE_DEMO ?? 'true') !== 'false';
  const lifecycleEvent = process.env.npm_lifecycle_event ?? '';
  const commandLine = process.argv.join(' ');
  const isStorybook =
    env.STORYBOOK === '1' ||
    process.env.STORYBOOK === '1' ||
    lifecycleEvent.includes('storybook') ||
    commandLine.includes('storybook') ||
    commandLine.includes('chromatic');

  const resolveConfig = {
    alias: {
      ...createNavetPackageAliases(repoRoot),
      '@assets': path.resolve(repoRoot, 'assets'),
      '@docs': path.resolve(repoRoot, 'docs'),
      '@website': path.resolve(repoRoot, 'apps/website/src'),
      '@docker': path.resolve(repoRoot, 'docker'),
      '@scripts': path.resolve(repoRoot, 'scripts'),
      ...(isStorybook
        ? {
            'virtual:pwa-register': path.resolve(
              repoRoot,
              'packages/app/src/test/mocks/virtual-pwa-register.ts'
            ),
          }
        : {}),
    },
  };

  const baseBuildConfig = {
    modulePreload: {
      resolveDependencies(_filename: string, deps: string[], context: { hostType: string }) {
        if (context.hostType !== 'html') {
          return deps;
        }

        return deps.filter((dependency) => !isLazyHtmlPreload(dependency));
      },
    },
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              // Keep eager room references out of the deferred admin service chunk.
              name: 'provider-room-management',
              test(id: string) {
                return id.endsWith('/packages/core/src/provider-room-management.ts');
              },
              entriesAware: true,
              includeDependenciesRecursively: false,
            },
            {
              name(id: string) {
                return getVendorChunkName(id) ?? 'vendor';
              },
              test(id: string) {
                return getVendorChunkName(id) !== undefined;
              },
              entriesAware: true,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  } satisfies NonNullable<UserConfig['build']>;

  function createAppPlugins() {
    const pwaCachePolicy = createVitePwaCachePolicy();
    const installationAuthority =
      command === 'serve' && mode !== 'test' && !isStorybook
        ? createViteInstallationAuthority({
            hassUrlPin: env.NAVET_HASS_URL?.trim(),
            installationKey: env.NAVET_INSTALLATION_KEY?.trim(),
            openhabUrlPin: env.NAVET_OPENHAB_URL?.trim(),
          })
        : DISABLED_INSTALLATION_AUTHORITY;
    const deviceSessionAuthority =
      command === 'serve' && mode !== 'test' && !isStorybook
        ? createViteDeviceSessionAuthority(installationAuthority)
        : undefined;
    const authSessionPlugin = authSessionStorePlugin(
      installationAuthority,
      deviceSessionAuthority
    );
    const resolveAuthenticatedPrincipal = (req: IncomingMessage) =>
      authSessionPlugin.api.resolveAuthenticatedPrincipal(req, { trustIngressHeaders: false });
    const dashboardProfilePlugin = dashboardProfileStorePlugin(
      installationAuthority,
      resolveAuthenticatedPrincipal
    );
    const homeySessionPlugin = homeySessionStorePlugin(
      installationAuthority,
      deviceSessionAuthority
    );
    const openhabSessionPlugin = openhabSessionStorePlugin(
      installationAuthority,
      deviceSessionAuthority
    );
    const choresPlugin = choreStorePlugin((req) =>
      resolveAuthenticatedPrincipal(req) ??
      (homeySessionPlugin.api.getHomeySession(req) || openhabSessionPlugin.api.getOpenHABSession(req)
        ? { sessionId: 'authenticated-provider-session' }
        : null)
    );
    const appPlugins: PluginOption[] = [
      react(),
      babel({
        include: REACT_COMPILER_INCLUDE,
        exclude: REACT_COMPILER_EXCLUDE,
        presets: [reactCompilerPreset()],
      }),
      tailwindcss(),
      rssProxyPlugin((req, res) =>
        Boolean(
          resolveAuthenticatedPrincipal(req) ||
            homeySessionPlugin.api.getHomeySession(req, res) ||
            openhabSessionPlugin.api.getOpenHABSession(req, res)
        )
      ),
      spotifyMetadataPlugin(),
      ...(deviceSessionAuthority
        ? [deviceSessionStorePlugin(deviceSessionAuthority)]
        : []),
      authSessionPlugin,
      dashboardProfilePlugin,
      choresPlugin,
      homeySessionPlugin,
      openhabSessionPlugin,
      homeAssistantProxyPlugin((req) => authSessionPlugin.api.getAuthSession?.(req) ?? null),
      homeyProxyPlugin((req, res) => homeySessionPlugin.api.getHomeySession?.(req, res) ?? null),
      openhabProxyPlugin(
        (req, res) => openhabSessionPlugin.api.getOpenHABSession?.(req, res) ?? null
      ),
    ];

    if (!isStorybook) {
      const pwaPlugins = VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        manifestFilename: 'site.webmanifest',
        includeAssets: [...NAVET_PWA_INCLUDE_ASSETS],
        manifest: {
          ...publicWebManifest,
          start_url: './',
          scope: './',
          icons: publicWebManifest.icons.map((icon) => ({
            ...icon,
            src: `./${icon.src.replace(/^\/+/, '')}`,
          })),
        },
        workbox: {
          cleanupOutdatedCaches: true,
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          navigateFallback: './index.html',
          navigateFallbackDenylist: [NAVET_INTERNAL_NAVIGATION_PATH_PATTERN],
          // Precache only the static entry graph referenced by index.html. Preloading every
          // route, locale, media codec, and card chunk made each install/update download and
          // write the entire application while a wall panel was in use.
          globPatterns: [
            'index.html',
            'offline.html',
            'boot-i18n.js',
            'assets/*.{css,js,svg,woff2}',
          ],
          manifestTransforms: [pwaCachePolicy.manifestTransform as VitePwaManifestTransform],
          runtimeCaching: [
            {
              urlPattern: isNavetRuntimeAssetRequest,
              handler: 'CacheFirst',
              options: {
                cacheName: 'navet-immutable-assets-v1',
                cacheableResponse: {
                  statuses: [0, 200],
                },
                expiration: {
                  maxAgeSeconds: 30 * 24 * 60 * 60,
                  maxEntries: 192,
                  purgeOnQuotaError: true,
                },
              },
            },
          ],
        },
      });
      appPlugins.push(
        pwaCachePolicy.capturePlugin,
        pwaPlugins,
        deferVitePwaGenerationUntilWriteBundle(pwaPlugins)
      );
    }

    return appPlugins;
  }

  function createSharedConfig(overrides: UserConfig): UserConfig {
    return {
      root: import.meta.dirname,
      optimizeDeps: {
        exclude: ['maplibre-gl'],
      },
      publicDir: path.resolve(repoRoot, 'assets/public'),
      base: './',
      envPrefix: ['VITE_'],
      define: {
        __APP_VERSION__: JSON.stringify(appVersion),
        __APP_GIT_SHA__: JSON.stringify(buildMetadata.gitSha),
        __APP_BUILD_DATE__: JSON.stringify(buildMetadata.buildDate),
        __APP_RELEASE_CHANNEL__: JSON.stringify(buildMetadata.releaseChannel),
        __APP_BUILD_VERSION__: JSON.stringify(buildMetadata.buildVersion),
        __NAVET_ENABLE_DEMO__: JSON.stringify(enableDemo),
      },
      resolve: resolveConfig,
      assetsInclude: ['**/*.svg'],
      ...overrides,
    };
  }

  function createAppConfig(config: {
    cacheDir: string;
    outDir?: string;
    emptyOutDir?: boolean;
    input?: string | Record<string, string>;
  }): UserConfig {
    return createSharedConfig({
      cacheDir: path.resolve(repoRoot, config.cacheDir),
      plugins: createAppPlugins(),
      build: {
        ...baseBuildConfig,
        outDir: config.outDir ?? path.resolve(import.meta.dirname, 'dist'),
        emptyOutDir: config.emptyOutDir,
        rollupOptions: {
          ...baseBuildConfig.rollupOptions,
          ...(config.input ? { input: config.input } : {}),
          output: baseBuildConfig.rollupOptions?.output,
        },
      },
      server: {
        host: 'navet.local',
        port: 5200,
        strictPort: true,
        fs: {
          allow: [repoRoot],
        },
        proxy: hassUrl
          ? {
              '/api': {
                target: hassUrl,
                changeOrigin: true,
                secure: false,
              },
            }
          : undefined,
      },
    });
  }

  return createAppConfig({
    cacheDir: '.cache/vite-standalone',
    emptyOutDir: true,
  });
});
