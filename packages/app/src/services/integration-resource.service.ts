import type { ResolvedPlatformResource } from '@navet/app/platform/resources';
import { getRegisteredProviderContract } from '@navet/app/provider-contract-registry';
import { integrationStore } from '@navet/app/stores/integration-store';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import { parseProviderScopedId } from '@navet/app/utils/provider-ids';
import type { NavetResourceKind } from '@navet/core/types';

interface ResolvePlatformArtworkRequest {
  entityId: string;
  attrs: Record<string, unknown>;
  fallbackPicture?: string;
  providerId?: IntegrationProviderId;
}

function resolveProviderId(
  entityId: string,
  providerId?: IntegrationProviderId
): IntegrationProviderId {
  return (
    providerId ??
    parseProviderScopedId(entityId)?.providerId ??
    integrationStore.getState().currentProviderId
  );
}

export async function resolvePlatformArtwork({
  entityId,
  attrs,
  fallbackPicture,
  providerId,
}: ResolvePlatformArtworkRequest): Promise<ResolvedPlatformResource> {
  return await resolveResource(entityId, 'media_artwork', {
    attrs,
    fallbackPicture,
    providerId,
  });
}

export function normalizeResourceUrl(
  resourceUrl: string,
  providerId?: IntegrationProviderId
): string | null {
  if (!resourceUrl) {
    return null;
  }

  const resolvedProviderId = resolveProviderId(resourceUrl, providerId);
  const contract = getRegisteredProviderContract(resolvedProviderId);

  return contract.normalizeResourceUrl?.(resourceUrl) ?? resourceUrl;
}

/** Preserve provider-owned authentication and expiry for display resources. */
export async function resolveDisplayResource(
  resourceUrl: string,
  providerId?: IntegrationProviderId
): Promise<ResolvedPlatformResource> {
  const contract = getRegisteredProviderContract(resolveProviderId(resourceUrl, providerId));
  if (contract.resolveDisplayResource) return await contract.resolveDisplayResource(resourceUrl);
  return {
    id: resourceUrl,
    kind: 'image',
    url: normalizeResourceUrl(resourceUrl, providerId) ?? undefined,
    cacheKey: resourceUrl,
    authStrategy: 'none',
  };
}

export async function resolveResourceUrl(resourceUrl: string, providerId?: IntegrationProviderId) {
  return (await resolveDisplayResource(resourceUrl, providerId)).url ?? null;
}

export async function resolveResource(
  deviceId: string,
  kind: NavetResourceKind,
  options?: {
    attrs?: Record<string, unknown>;
    fallbackPicture?: string;
    providerId?: IntegrationProviderId;
  }
): Promise<ResolvedPlatformResource> {
  const resolvedProviderId = resolveProviderId(deviceId, options?.providerId);
  const contract = getRegisteredProviderContract(resolvedProviderId);

  if (!contract.resolveResource) {
    return {
      id: deviceId,
      kind: 'unavailable',
      cacheKey: deviceId,
      authStrategy: 'none',
    };
  }

  return await contract.resolveResource({
    deviceId,
    providerId: resolvedProviderId,
    kind,
    attrs: options?.attrs,
    fallbackPicture: options?.fallbackPicture,
  });
}
