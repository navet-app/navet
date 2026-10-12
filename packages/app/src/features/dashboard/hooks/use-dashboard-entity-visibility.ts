import { getLegacyVisibleHelperIds } from '@navet/app/core/navet-device-collections';
import { useIntegrationStore } from '@navet/app/hooks/use-integration-store';
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { shallow } from 'zustand/shallow';
import { useDashboardEntitiesStore } from '../stores/dashboard-entities-store';

export function useDashboardEntityVisibility() {
  const pendingProviders = useDashboardEntitiesStore(
    (state) => state.legacyHelperVisibilityProviderIds
  );
  const runtime = useIntegrationStore(
    (state) =>
      Object.fromEntries(
        pendingProviders.map((id) => [id, state.providerRuntime[id]?.entitiesHydrated])
      ),
    shallow
  );
  const entities = useIntegrationStore(
    (state) =>
      Object.fromEntries(
        pendingProviders.map((id) => [id, state.providerEntitiesByProviderId[id]])
      ),
    shallow
  );
  const migrateHelpers = useDashboardEntitiesStore((state) => state.migrateLegacyHelperVisibility);
  useEffect(() => {
    for (const providerId of pendingProviders) {
      if (!runtime[providerId]) continue;
      migrateHelpers(
        providerId,
        getLegacyVisibleHelperIds(Object.values(entities[providerId] ?? {}))
      );
    }
  }, [runtime, entities, pendingProviders, migrateHelpers]);
  return useDashboardEntitiesStore(
    useShallow((state) => ({
      hiddenEntityIds: state.hiddenEntityIds,
      shownSensorEntityIds: state.shownSensorEntityIds,
      explicitlyShownEntityIds: state.explicitlyShownEntityIds,
      hideAutoEntity: state.hideEntity,
      showAutoEntity: state.showEntity,
    }))
  );
}
