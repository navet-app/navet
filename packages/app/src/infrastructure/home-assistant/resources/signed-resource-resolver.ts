import type { AuthSession } from '@navet/app/auth/types';
import type { RuntimeContext } from '../runtime/runtime-context';
import type { HaResourceRef, ResolvedMediaResource } from './resource-types';

const SIGNED_PATH_EXPIRY_SECONDS = 30;

export async function resolveSignedResource({
  resource,
  runtime,
  session,
  signPath,
  extractSignablePath,
  resolveSync,
}: {
  resource: ResolvedMediaResource;
  runtime: RuntimeContext;
  session: AuthSession | null;
  signPath?: (path: string, expiresSeconds?: number) => Promise<string | null>;
  extractSignablePath: (url: string, haBaseUrl: string | null) => string | null;
  resolveSync: (ref: HaResourceRef) => ResolvedMediaResource;
}): Promise<ResolvedMediaResource> {
  const ingress = runtime.kind === 'ha_ingress';
  const haBaseUrl = session?.haBaseUrl ?? runtime.haBaseUrl ?? (ingress ? runtime.appOrigin : null);

  if (
    (!ingress && runtime.kind !== 'standalone' && runtime.kind !== 'dev') ||
    (!ingress && session?.authMode !== 'oauth') ||
    !signPath ||
    resource.authStrategy !== (ingress ? 'panel_bridge' : 'same_origin') ||
    !resource.url ||
    !haBaseUrl
  ) {
    return resource;
  }

  const signablePath = extractSignablePath(resource.url, haBaseUrl);
  if (!signablePath) {
    return resource;
  }

  // Media artwork already flows through Navet's same-origin proxy in standalone OAuth mode.
  // Re-signing media_player_proxy paths adds authSig noise without improving access, and some
  // Home Assistant-backed players fail when the extra signed query is appended.
  if (!ingress && signablePath.includes('/api/media_player_proxy/')) {
    return resource;
  }

  try {
    const signingStartedAt = Date.now();
    const signedPath = await signPath(signablePath, SIGNED_PATH_EXPIRY_SECONDS);
    if (!signedPath) {
      return ingress ? { ...resource, kind: 'unavailable', url: undefined } : resource;
    }

    const signedResource = resolveSync({ kind: 'absolute_url', url: signedPath });

    return {
      ...resource,
      ...signedResource,
      expiresAt: signingStartedAt + SIGNED_PATH_EXPIRY_SECONDS * 1000,
      metadata: {
        ...signedResource.metadata,
        source: 'ha_signed_path',
      },
    };
  } catch {
    return ingress ? { ...resource, kind: 'unavailable', url: undefined } : resource;
  }
}
