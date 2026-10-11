import type {
  PlatformEntityHistoriesRequest,
  PlatformEntityHistoryRequest,
  PlatformEntityHistorySeries,
  PlatformMessageClient,
  PlatformStatisticsHistoryRequest,
  PlatformStatisticsHistorySeries,
} from '@navet/app/platform/provider-feature-models';
import type { ProviderHistoryFeatureService } from '@navet/app/platform/provider-feature-services';
import { getProviderRuntimeRegistration } from '@navet/app/provider-runtime-registry';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import {
  getCurrentIntegrationProviderIdFromStore,
  resolveIntegrationProviderId,
} from './integration-provider-context.service';

const ENTITY_HISTORY_FALLBACK_CONCURRENCY = 6;

function readNativeEntityId(entityId: string) {
  return entityId.replace(/^[^:]+:/, '');
}

function throwIfHistoryRequestAborted(signal?: AbortSignal) {
  if (!signal?.aborted) {
    return;
  }

  throw signal.reason ?? new DOMException('History request aborted', 'AbortError');
}

export const integrationHistoryService: ProviderHistoryFeatureService = {
  getMessageClient: () => {
    const service = getProviderRuntimeRegistration(
      getCurrentIntegrationProviderIdFromStore()
    ).historyFeatureService;
    return service?.getMessageClient() ?? null;
  },
};

export function getIntegrationHistoryMessageClient(
  entityIdOrProviderId?: string | IntegrationProviderId
): PlatformMessageClient | null {
  const providerId = resolveIntegrationProviderId(entityIdOrProviderId);
  const service = getProviderRuntimeRegistration(providerId).historyFeatureService;
  return service?.getMessageClient() ?? null;
}

export async function getIntegrationEntityHistory(
  request: PlatformEntityHistoryRequest
): Promise<PlatformEntityHistorySeries | null> {
  const providerId = resolveIntegrationProviderId(request.entityId);
  const service = getProviderRuntimeRegistration(providerId).historyFeatureService;
  if (!service?.getEntityHistory) {
    return null;
  }

  const nativeEntityId = readNativeEntityId(request.entityId);
  if (service.supportsEntityHistory?.(nativeEntityId) === false) return null;
  const result = await service.getEntityHistory({ ...request, entityId: nativeEntityId });
  return { ...result, entityId: request.entityId };
}

async function getProviderEntityHistories({
  providerId,
  canonicalEntityIds,
  request,
  requireComplete,
}: {
  requireComplete: boolean;
  providerId: IntegrationProviderId;
  canonicalEntityIds: string[];
  request: Omit<PlatformEntityHistoriesRequest, 'entityIds'>;
}): Promise<PlatformEntityHistorySeries[]> {
  throwIfHistoryRequestAborted(request.signal);
  const service = getProviderRuntimeRegistration(providerId).historyFeatureService;
  if (!service) {
    return [];
  }

  const nativeToCanonical = new Map<string, string>();
  for (const canonicalEntityId of canonicalEntityIds) {
    nativeToCanonical.set(readNativeEntityId(canonicalEntityId), canonicalEntityId);
  }
  const nativeEntityIds = [...nativeToCanonical.keys()].filter(
    (entityId) => service.supportsEntityHistory?.(entityId) !== false
  );
  if (nativeEntityIds.length === 0) return [];

  if (service.getEntityHistories) {
    const providerSeries = await service.getEntityHistories({
      ...request,
      entityIds: nativeEntityIds,
    });
    throwIfHistoryRequestAborted(request.signal);
    const pointsByNativeEntityId = new Map(
      providerSeries.map((series) => [series.entityId, series.points])
    );
    return nativeEntityIds.map((nativeEntityId) => ({
      entityId: nativeToCanonical.get(nativeEntityId) ?? nativeEntityId,
      points: pointsByNativeEntityId.get(nativeEntityId) ?? [],
    }));
  }

  const getEntityHistory = service.getEntityHistory;
  if (!getEntityHistory) {
    return [];
  }

  const series: PlatformEntityHistorySeries[] = [];
  for (
    let index = 0;
    index < nativeEntityIds.length;
    index += ENTITY_HISTORY_FALLBACK_CONCURRENCY
  ) {
    throwIfHistoryRequestAborted(request.signal);
    const batch = nativeEntityIds.slice(index, index + ENTITY_HISTORY_FALLBACK_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((entityId) => getEntityHistory({ ...request, entityId }))
    );
    throwIfHistoryRequestAborted(request.signal);

    for (let resultIndex = 0; resultIndex < results.length; resultIndex += 1) {
      const result = results[resultIndex];
      const nativeEntityId = batch[resultIndex];
      if (requireComplete && result?.status === 'rejected') throw result.reason;
      if (result?.status !== 'fulfilled' || !result.value || !nativeEntityId) {
        continue;
      }
      series.push({
        entityId: nativeToCanonical.get(nativeEntityId) ?? nativeEntityId,
        points: result.value.points,
      });
    }
  }

  return series;
}

export async function getIntegrationEntityHistories(
  request: PlatformEntityHistoriesRequest,
  options: { requireComplete?: boolean } = {}
): Promise<PlatformEntityHistorySeries[]> {
  if (request.entityIds.length === 0) {
    return [];
  }

  throwIfHistoryRequestAborted(request.signal);
  const canonicalIdsByProvider = new Map<IntegrationProviderId, string[]>();
  for (const entityId of request.entityIds) {
    const providerId = resolveIntegrationProviderId(entityId);
    const providerEntityIds = canonicalIdsByProvider.get(providerId);
    if (providerEntityIds) {
      providerEntityIds.push(entityId);
    } else {
      canonicalIdsByProvider.set(providerId, [entityId]);
    }
  }

  const providerRequest = {
    startTime: request.startTime,
    ...(request.endTime ? { endTime: request.endTime } : {}),
    ...(request.includeAttributes !== undefined
      ? { includeAttributes: request.includeAttributes }
      : {}),
    ...(request.significantChangesOnly !== undefined
      ? { significantChangesOnly: request.significantChangesOnly }
      : {}),
    ...(request.signal ? { signal: request.signal } : {}),
  };
  const providerResults = await Promise.allSettled(
    [...canonicalIdsByProvider.entries()].map(([providerId, canonicalEntityIds]) =>
      getProviderEntityHistories({
        providerId,
        canonicalEntityIds,
        request: providerRequest,
        requireComplete: options.requireComplete ?? false,
      })
    )
  );
  throwIfHistoryRequestAborted(request.signal);
  if (options.requireComplete) {
    const failure = providerResults.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  }
  const seriesByCanonicalEntityId = new Map(
    providerResults
      .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
      .map((series) => [series.entityId, series])
  );

  return request.entityIds.flatMap((entityId) => {
    const series = seriesByCanonicalEntityId.get(entityId);
    return series ? [series] : [];
  });
}

export async function getIntegrationStatisticsHistory(
  request: PlatformStatisticsHistoryRequest
): Promise<PlatformStatisticsHistorySeries | null> {
  if (request.entityIds.length === 0) {
    return {};
  }

  const providerId = resolveIntegrationProviderId(request.entityIds[0]);
  if (request.entityIds.some((entityId) => resolveIntegrationProviderId(entityId) !== providerId)) {
    throw new Error('Statistics history entities must belong to the same provider');
  }

  const service = getProviderRuntimeRegistration(providerId).historyFeatureService;
  if (!service?.getStatisticsHistory) {
    return null;
  }

  const nativeToCanonical = new Map<string, string>();
  for (const entityId of request.entityIds) {
    nativeToCanonical.set(readNativeEntityId(entityId), entityId);
  }
  const nativeEntityIds = [...nativeToCanonical.keys()];
  const result = await service.getStatisticsHistory({
    ...request,
    entityIds: nativeEntityIds,
  });

  const normalized: PlatformStatisticsHistorySeries = {};
  for (const nativeEntityId of nativeEntityIds) {
    const canonicalEntityId = nativeToCanonical.get(nativeEntityId);
    if (canonicalEntityId) {
      normalized[canonicalEntityId] = result[nativeEntityId] ?? [];
    }
  }
  return normalized;
}

export function supportsIntegrationStatisticsHistory(
  entityIdOrProviderId?: string | IntegrationProviderId
): boolean {
  const providerId = resolveIntegrationProviderId(entityIdOrProviderId);
  const service = getProviderRuntimeRegistration(providerId).historyFeatureService;
  if (!service) {
    return false;
  }

  if (
    typeof service.supportsStatisticsHistory === 'function' &&
    typeof entityIdOrProviderId === 'string'
  ) {
    return service.supportsStatisticsHistory(readNativeEntityId(entityIdOrProviderId));
  }

  return service.getMessageClient() !== null;
}

export function supportsIntegrationEnergyStatistics(
  entityIdOrProviderId?: string | IntegrationProviderId
): boolean {
  const providerId = resolveIntegrationProviderId(entityIdOrProviderId);
  const service = getProviderRuntimeRegistration(providerId).historyFeatureService;
  if (!service) {
    return false;
  }

  if (
    typeof service.supportsEnergyStatistics === 'function' &&
    typeof entityIdOrProviderId === 'string'
  ) {
    return service.supportsEnergyStatistics(readNativeEntityId(entityIdOrProviderId));
  }

  return service.getMessageClient() !== null;
}
