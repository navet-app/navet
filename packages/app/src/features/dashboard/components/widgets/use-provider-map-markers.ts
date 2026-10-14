import { useIntegrationStore } from '@navet/app/hooks';
import { getProviderRuntimeQuery } from '@navet/app/provider-runtime-query';
import { getProviderRuntimeRegistration } from '@navet/app/provider-runtime-registry';
import { createProviderScopedId } from '@navet/core/ids';
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { mapMarkersEqual } from './map-markers';
import type { MapMarker } from './map-types';

const EMPTY: MapMarker[] = [];
export function useProviderMapMarkers(enabled = true): MapMarker[] {
  const selectedProviderIds = useIntegrationStore((state) => state.selectedProviderIds);
  const sources = useMemo(
    () =>
      selectedProviderIds.flatMap((providerId) => {
        const service = getProviderRuntimeRegistration(providerId).mapFeatureService;
        return service ? [{ providerId, service, query: getProviderRuntimeQuery(providerId) }] : [];
      }),
    [selectedProviderIds]
  );
  const stable = useRef<MapMarker[]>(EMPTY);
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!enabled) return () => undefined;
      const cleanups = sources.map(({ query }) => query.subscribeSnapshots(listener));
      return () => {
        for (const cleanup of cleanups) cleanup();
      };
    },
    [enabled, sources]
  );
  const getSnapshot = useCallback(() => {
    if (!enabled) return EMPTY;
    const next = sources.flatMap(({ providerId, service, query }) =>
      service
        .mapEntities(query.selectSnapshotsByPrefixes(service.entityPrefixes))
        .map((marker) => ({
          ...marker,
          id: createProviderScopedId(providerId, marker.id),
          providerId,
        }))
    );
    if (mapMarkersEqual(stable.current, next)) return stable.current;
    stable.current = next;
    return next;
  }, [enabled, sources]);
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
