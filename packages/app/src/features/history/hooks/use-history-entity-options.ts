import { useIntegrationStore } from '@navet/app/hooks/use-integration-store';
import type { IntegrationStore } from '@navet/app/stores/integration-store';
import { INTEGRATION_PROVIDERS } from '@navet/app/types/provider';
import { useMemo } from 'react';
import type { HistoryEntityOption } from '../components/history-explorer-dialog';

function createOptionsSelector() {
  let options: HistoryEntityOption[] = [];
  let byId = new Map<string, HistoryEntityOption>();

  return (state: IntegrationStore) => {
    let count = 0;
    let changed = false;
    for (const id in state.providerEntitiesByCanonicalId) {
      const entity = state.providerEntitiesByCanonicalId[id];
      if (!state.selectedProviderIds.includes(entity.providerId)) continue;
      count += 1;
      const previous = byId.get(entity.canonicalId);
      if (
        !previous ||
        previous.name !== entity.name ||
        previous.source !== INTEGRATION_PROVIDERS[entity.providerId].label ||
        previous.connected !== (state.providerRuntime[entity.providerId]?.connected ?? false)
      ) {
        changed = true;
        break;
      }
    }
    // Sensor values and other live attributes do not invalidate the picker or loaded rows.
    if (!changed && count === options.length) return options;

    options = Object.values(state.providerEntitiesByCanonicalId)
      .filter((entity) => state.selectedProviderIds.includes(entity.providerId))
      .map((entity) => ({
        id: entity.canonicalId,
        name: entity.name,
        source: INTEGRATION_PROVIDERS[entity.providerId].label,
        connected: state.providerRuntime[entity.providerId]?.connected ?? false,
      }))
      .sort(
        (left, right) =>
          left.source.localeCompare(right.source) || left.name.localeCompare(right.name)
      );
    byId = new Map(options.map((option) => [option.id, option]));
    return options;
  };
}

export function useHistoryEntityOptions() {
  const selector = useMemo(createOptionsSelector, []);
  return useIntegrationStore(selector);
}
