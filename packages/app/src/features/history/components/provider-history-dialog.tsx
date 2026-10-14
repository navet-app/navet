import { useHistoryEntityOptions } from '../hooks/use-history-entity-options';
import { HistoryExplorerDialog } from './history-explorer-dialog';

export function ProviderHistoryDialog({ onClose }: { onClose: () => void }) {
  const options = useHistoryEntityOptions();
  return <HistoryExplorerDialog entities={options} onClose={onClose} />;
}
