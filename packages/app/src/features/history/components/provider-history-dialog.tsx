import { useIntegrationStore } from '@navet/app/hooks/use-integration-store';
import { INTEGRATION_PROVIDERS } from '@navet/app/types/provider';
import { useShallow } from 'zustand/react/shallow';
import { HistoryExplorerDialog } from './history-explorer-dialog';

export function ProviderHistoryDialog({ onClose }: { onClose: () => void }) {
  const { selectedProviderIds, entities, runtime } = useIntegrationStore(
    useShallow((state) => ({
      selectedProviderIds: state.selectedProviderIds,
      entities: state.providerEntitiesByCanonicalId,
      runtime: state.providerRuntime,
    }))
  );
  const options = Object.values(entities)
    .filter((entity) => selectedProviderIds.includes(entity.providerId))
    .map((entity) => ({
      id: entity.canonicalId,
      name: entity.name,
      source: INTEGRATION_PROVIDERS[entity.providerId].label,
      connected: runtime[entity.providerId]?.connected ?? false,
    }))
    .sort(
      (left, right) =>
        left.source.localeCompare(right.source) || left.name.localeCompare(right.name)
    );
  return <HistoryExplorerDialog entities={options} onClose={onClose} />;
}
