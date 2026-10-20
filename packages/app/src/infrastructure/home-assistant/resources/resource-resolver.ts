import type { AuthSession } from '@navet/app/auth/types';
import { resolveIngressAwarePath } from '@navet/app/utils/home-assistant-connection-target';
import { isSafeRelativePath, sanitizeImageUrl } from '@navet/app/utils/url-security';
import { getRuntimeContext } from '../runtime/runtime-detector';
import type { ResolvedRequest } from '../transport/transport-types';
import { ResourceCache } from './resource-cache';
import type { HaResourceRef, ResolvedMediaResource, ResolveOptions } from './resource-types';

const HOME_ASSISTANT_PROXY_PATH = '/__navet_ha_proxy__';
const HOME_ASSISTANT_RELATIVE_PREFIXES = [
  '/api/',
  '/local/',
  '/media/',
  '/auth/',
  '/static/',
  '/hls/',
  '/image/',
];
const DEFAULT_CACHE_TTL_MS = 60_000;

function isAbsoluteHttpUrl(value: string) {
  return value.startsWith('http://') || value.startsWith('https://');
}

function isHomeAssistantRelativeUrl(value: string) {
  return HOME_ASSISTANT_RELATIVE_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function stripProxyPath(path: string) {
  const unproxiedPath = path.slice(HOME_ASSISTANT_PROXY_PATH.length);
  return unproxiedPath.startsWith('/') ? unproxiedPath : `/${unproxiedPath}`;
}

function getEmbeddedProxyPath(path: string) {
  const proxyIndex = path.indexOf(`${HOME_ASSISTANT_PROXY_PATH}/`);
  if (proxyIndex === -1) {
    return null;
  }

  return path.slice(proxyIndex);
}

function resolveProxyPath(path: string) {
  return resolveIngressAwarePath(`${HOME_ASSISTANT_PROXY_PATH}${path}`);
}

function extractSignablePath(resourceUrl: string, haBaseUrl: string | null) {
  if (resourceUrl.startsWith(HOME_ASSISTANT_PROXY_PATH)) {
    return stripProxyPath(resourceUrl);
  }

  const proxyIndex = resourceUrl.indexOf(`${HOME_ASSISTANT_PROXY_PATH}/`);
  if (proxyIndex >= 0) {
    return stripProxyPath(resourceUrl.slice(proxyIndex));
  }

  if (resourceUrl.startsWith('/') && isHomeAssistantRelativeUrl(resourceUrl)) {
    return resourceUrl;
  }

  if (!isAbsoluteHttpUrl(resourceUrl) || !haBaseUrl) {
    return null;
  }

  try {
    const resource = new URL(resourceUrl);
    const homeAssistant = new URL(haBaseUrl);
    if (
      resource.origin !== homeAssistant.origin ||
      !isHomeAssistantRelativeUrl(resource.pathname)
    ) {
      return null;
    }

    return `${resource.pathname}${resource.search}`;
  } catch {
    return null;
  }
}

function hasSignedAuthQuery(resourceUrl: string) {
  return resourceUrl.includes('authSig=');
}

function toUrlWithCacheBust(url: string, cacheBustKey: ResolveOptions['cacheBustKey']) {
  if (cacheBustKey === undefined || cacheBustKey === null) {
    return url;
  }

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_t=${encodeURIComponent(String(cacheBustKey))}`;
}

function serializeCacheKeyPart(value: unknown): string {
  if (value == null) {
    return '';
  }

  if (Array.isArray(value)) {
    return `[${value.map(serializeCacheKeyPart).join(',')}]`;
  }

  if (typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${encodeURIComponent(key)}:${serializeCacheKeyPart((value as Record<string, unknown>)[key])}`
      )
      .join(',')}}`;
  }

  return encodeURIComponent(String(value));
}

function buildResourceCacheKey(
  runtime: ReturnType<typeof getRuntimeContext>,
  haBaseUrl: string | null | undefined,
  ref: HaResourceRef,
  options: ResolveOptions
) {
  return [
    runtime.kind,
    runtime.appBasePath,
    haBaseUrl ?? '',
    serializeCacheKeyPart(ref),
    serializeCacheKeyPart(options.cacheBustKey),
    options.preferProxy ? 'proxy' : '',
    options.allowDirect ? 'direct' : '',
  ].join('|');
}

export class HomeAssistantResourceResolver {
  private cache = new ResourceCache();

  constructor(
    private getSession: () => AuthSession | null,
    private signPath?: (path: string, expiresSeconds?: number) => Promise<string | null>
  ) {}

  private buildResolvedRequest(
    url: string,
    authStrategy: ResolvedMediaResource['authStrategy']
  ): ResolvedRequest {
    return {
      url,
      authStrategy,
      cache: 'force-cache',
    };
  }

  resolveRequest(ref: HaResourceRef, options: ResolveOptions = {}): ResolvedRequest | null {
    const resource = this.resolveSync(ref, options);
    if (!resource.url) {
      return null;
    }

    return this.buildResolvedRequest(resource.url, resource.authStrategy);
  }

  resolveSync(ref: HaResourceRef, options: ResolveOptions = {}): ResolvedMediaResource {
    const runtime = getRuntimeContext();
    const session = this.getSession();
    const haBaseUrl = session?.haBaseUrl ?? runtime.haBaseUrl;
    const cacheKey = buildResourceCacheKey(runtime, haBaseUrl, ref, options);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const resolvePath = (resourceUrl: string): ResolvedMediaResource => {
      const safeImageUrl = sanitizeImageUrl(resourceUrl, undefined, {
        allowBlob: true,
        allowDataImage: true,
      });

      if (resourceUrl.startsWith('blob:') || resourceUrl.startsWith('data:')) {
        return {
          id: resourceUrl,
          kind: 'image',
          url: safeImageUrl ?? undefined,
          cacheKey,
          authStrategy: 'none',
          metadata: { source: 'inline' },
        };
      }

      if (resourceUrl.startsWith('/') && !isSafeRelativePath(resourceUrl)) {
        return {
          id: resourceUrl,
          kind: 'unavailable',
          cacheKey,
          authStrategy: 'none',
        };
      }

      // Ingress shares Home Assistant's browser origin. Resolve HA resources on
      // that origin and sign them through the current user's parent connection;
      // the add-on must never substitute its Supervisor credential.
      if (runtime.kind === 'ha_ingress') {
        try {
          const url = new URL(resourceUrl, runtime.appOrigin);
          const haOrigin = haBaseUrl ? new URL(haBaseUrl).origin : runtime.appOrigin;
          // HA can advertise internal media origins while Ingress is accessed
          // through an external URL. Preserve that resource-path compatibility,
          // while leaving ambiguous external CDN /image/ URLs untouched.
          const haResourcePath =
            isHomeAssistantRelativeUrl(url.pathname) && !url.pathname.startsWith('/image/');
          if (url.origin === runtime.appOrigin || url.origin === haOrigin || haResourcePath) {
            const proxyPath = getEmbeddedProxyPath(url.pathname);
            const path = proxyPath ? stripProxyPath(proxyPath) : url.pathname;
            if (isHomeAssistantRelativeUrl(path)) {
              const nativePath = `${path}${url.search}`;
              return {
                id: resourceUrl,
                kind: 'image',
                url: toUrlWithCacheBust(nativePath, options.cacheBustKey),
                cacheKey,
                authStrategy: hasSignedAuthQuery(nativePath) ? 'none' : 'panel_bridge',
                metadata: { source: 'ha_ingress_user_resource' },
              };
            }
          }
        } catch {
          // Let the existing URL validation and unavailable fallback handle it.
        }
      }

      if (resourceUrl.startsWith(HOME_ASSISTANT_PROXY_PATH)) {
        const resolvedUrl =
          runtime.kind === 'ha_panel'
            ? stripProxyPath(resourceUrl)
            : resolveIngressAwarePath(resourceUrl);

        return {
          id: resourceUrl,
          kind: 'image',
          url: toUrlWithCacheBust(resolvedUrl, options.cacheBustKey),
          cacheKey,
          authStrategy: runtime.kind === 'ha_panel' ? 'panel_bridge' : 'same_origin',
          metadata: { source: 'ha_proxy' },
        };
      }

      if (resourceUrl.startsWith('/') && isHomeAssistantRelativeUrl(resourceUrl)) {
        const embeddedProxyPath = getEmbeddedProxyPath(resourceUrl);

        if (embeddedProxyPath) {
          return {
            id: resourceUrl,
            kind: 'image',
            url: toUrlWithCacheBust(
              runtime.kind === 'ha_panel' ? stripProxyPath(embeddedProxyPath) : resourceUrl,
              options.cacheBustKey
            ),
            cacheKey,
            authStrategy: runtime.kind === 'ha_panel' ? 'panel_bridge' : 'same_origin',
            metadata: { source: 'ha_proxy_embedded_relative' },
          };
        }

        if (runtime.kind === 'ha_panel') {
          return {
            id: resourceUrl,
            kind: 'image',
            url: toUrlWithCacheBust(resourceUrl, options.cacheBustKey),
            cacheKey,
            authStrategy: 'panel_bridge',
            metadata: { source: 'ha_panel_relative' },
          };
        }

        if (runtime.supportsSameOriginHaProxy && options.allowDirect !== true) {
          return {
            id: resourceUrl,
            kind: 'image',
            url: toUrlWithCacheBust(resolveProxyPath(resourceUrl), options.cacheBustKey),
            cacheKey,
            authStrategy: 'same_origin',
            metadata: { source: 'ha_proxy_relative' },
          };
        }

        return {
          id: resourceUrl,
          kind: 'image',
          url: haBaseUrl
            ? toUrlWithCacheBust(`${haBaseUrl}${resourceUrl}`, options.cacheBustKey)
            : undefined,
          cacheKey,
          authStrategy: hasSignedAuthQuery(resourceUrl) ? 'none' : 'bearer',
          metadata: { source: 'ha_absolute_relative' },
        };
      }

      if (resourceUrl.startsWith('/')) {
        return {
          id: resourceUrl,
          kind: 'image',
          url: toUrlWithCacheBust(resourceUrl, options.cacheBustKey),
          cacheKey,
          authStrategy: 'none',
          metadata: { source: 'app_relative' },
        };
      }

      if (isAbsoluteHttpUrl(resourceUrl)) {
        const sanitized = sanitizeImageUrl(resourceUrl) ?? undefined;
        if (!sanitized) {
          return {
            id: resourceUrl,
            kind: 'unavailable',
            cacheKey,
            authStrategy: 'none',
          };
        }

        try {
          const resource = new URL(sanitized);
          const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';
          const sameOrigin = resource.origin === appOrigin;
          const sameHaOrigin = haBaseUrl ? resource.origin === new URL(haBaseUrl).origin : false;

          if (sameOrigin && resource.pathname.startsWith(HOME_ASSISTANT_PROXY_PATH)) {
            return {
              id: sanitized,
              kind: 'image',
              url: toUrlWithCacheBust(
                runtime.kind === 'ha_panel'
                  ? `${stripProxyPath(resource.pathname)}${resource.search}`
                  : `${resolveIngressAwarePath(resource.pathname)}${resource.search}`,
                options.cacheBustKey
              ),
              cacheKey,
              authStrategy: runtime.kind === 'ha_panel' ? 'panel_bridge' : 'same_origin',
              metadata: { source: 'app_proxy_absolute' },
            };
          }

          if (resource.pathname.startsWith(HOME_ASSISTANT_PROXY_PATH)) {
            if (runtime.kind === 'ha_panel') {
              return {
                id: sanitized,
                kind: 'image',
                url: toUrlWithCacheBust(
                  `${stripProxyPath(resource.pathname)}${resource.search}`,
                  options.cacheBustKey
                ),
                cacheKey,
                authStrategy: 'panel_bridge',
                metadata: { source: 'ha_panel_cross_origin_proxy' },
              };
            }

            if (runtime.supportsSameOriginHaProxy && options.allowDirect !== true) {
              return {
                id: sanitized,
                kind: 'image',
                url: toUrlWithCacheBust(
                  `${resolveIngressAwarePath(resource.pathname)}${resource.search}`,
                  options.cacheBustKey
                ),
                cacheKey,
                authStrategy: 'same_origin',
                metadata: { source: 'cross_origin_proxy' },
              };
            }
          }

          if (sameOrigin || !sameHaOrigin) {
            const isExternalCdnImagePath =
              !sameOrigin && !sameHaOrigin && resource.pathname.startsWith('/image/');
            if (isHomeAssistantRelativeUrl(resource.pathname) && !isExternalCdnImagePath) {
              if (runtime.kind === 'ha_panel') {
                return {
                  id: sanitized,
                  kind: 'image',
                  url: toUrlWithCacheBust(
                    `${resource.pathname}${resource.search}`,
                    options.cacheBustKey
                  ),
                  cacheKey,
                  authStrategy: 'panel_bridge',
                  metadata: { source: 'ha_panel_cross_origin_relative' },
                };
              }

              if (runtime.supportsSameOriginHaProxy && options.allowDirect !== true) {
                return {
                  id: sanitized,
                  kind: 'image',
                  url: toUrlWithCacheBust(
                    `${resolveProxyPath(resource.pathname)}${resource.search}`,
                    options.cacheBustKey
                  ),
                  cacheKey,
                  authStrategy: 'same_origin',
                  metadata: { source: 'ha_proxy_cross_origin_relative' },
                };
              }

              return {
                id: sanitized,
                kind: 'image',
                url: sameHaOrigin ? toUrlWithCacheBust(sanitized, options.cacheBustKey) : undefined,
                cacheKey,
                authStrategy: hasSignedAuthQuery(sanitized) ? 'none' : 'bearer',
                metadata: { source: 'ha_direct_cross_origin_relative' },
              };
            }

            return {
              id: sanitized,
              kind: 'image',
              url: toUrlWithCacheBust(sanitized, options.cacheBustKey),
              cacheKey,
              authStrategy: 'none',
              metadata: { source: sameOrigin ? 'same_origin_absolute' : 'external' },
            };
          }

          if (runtime.kind === 'ha_panel') {
            return {
              id: sanitized,
              kind: 'image',
              url: toUrlWithCacheBust(
                `${resource.pathname}${resource.search}`,
                options.cacheBustKey
              ),
              cacheKey,
              authStrategy: 'panel_bridge',
              metadata: { source: 'ha_panel_absolute' },
            };
          }

          if (runtime.supportsSameOriginHaProxy && options.allowDirect !== true) {
            return {
              id: sanitized,
              kind: 'image',
              url: toUrlWithCacheBust(
                `${resolveProxyPath(resource.pathname)}${resource.search}`,
                options.cacheBustKey
              ),
              cacheKey,
              authStrategy: 'same_origin',
              metadata: { source: 'ha_proxy_absolute' },
            };
          }

          return {
            id: sanitized,
            kind: 'image',
            url: toUrlWithCacheBust(sanitized, options.cacheBustKey),
            cacheKey,
            authStrategy: hasSignedAuthQuery(sanitized) ? 'none' : 'bearer',
            metadata: { source: 'ha_direct_absolute' },
          };
        } catch {
          return {
            id: sanitized,
            kind: 'image',
            url: toUrlWithCacheBust(sanitized, options.cacheBustKey),
            cacheKey,
            authStrategy: 'none',
            metadata: { source: 'sanitized_absolute' },
          };
        }
      }

      return {
        id: resourceUrl,
        kind: 'unavailable',
        cacheKey,
        authStrategy: 'none',
      };
    };

    let resource: ResolvedMediaResource;

    switch (ref.kind) {
      case 'absolute_url':
        resource = resolvePath(ref.url);
        break;
      case 'media_source':
        resource = {
          id: ref.mediaContentId,
          kind: 'unavailable',
          cacheKey,
          authStrategy: 'same_origin',
        };
        break;
      case 'camera_stream':
        {
          const resolvedStream = ref.rawPath ? resolvePath(ref.rawPath) : null;
          resource = {
            id: `${ref.entityId}:${ref.stream}:${ref.rawPath ?? ''}`,
            kind:
              ref.stream === 'hls'
                ? 'hls_stream'
                : ref.stream === 'web_rtc'
                  ? 'webrtc_stream'
                  : 'mjpeg_stream',
            url: resolvedStream?.url,
            cacheKey,
            authStrategy:
              ref.stream === 'web_rtc' ? 'none' : (resolvedStream?.authStrategy ?? 'same_origin'),
            metadata: { source: ref.stream },
          };
        }
        break;
      default:
        resource = resolvePath(ref.rawPath);
        break;
    }

    this.cache.set(cacheKey, resource, DEFAULT_CACHE_TTL_MS);
    return resource;
  }

  async resolve(ref: HaResourceRef, options: ResolveOptions = {}): Promise<ResolvedMediaResource> {
    const { resolveSignedResource } = await import('./signed-resource-resolver');
    return resolveSignedResource({
      resource: this.resolveSync(ref, options),
      runtime: getRuntimeContext(),
      session: this.getSession(),
      signPath: this.signPath,
      extractSignablePath,
      resolveSync: (resourceRef) => this.resolveSync(resourceRef, options),
    });
  }
}
