import { getIntegrationLocationHistory } from '@navet/app/services/integration-map.service';
import type {
  PlatformLocationHistoryRequest,
  PlatformLocationPoint,
} from '@navet/core/provider-feature-models';
import { useEffect, useState } from 'react';
export function useMapLocationHistory(
  query: PlatformLocationHistoryRequest | null,
  load = getIntegrationLocationHistory
) {
  const [state, setState] = useState<{
    query: PlatformLocationHistoryRequest;
    status: 'loaded' | 'error' | 'unsupported';
    segments: PlatformLocationPoint[][];
  } | null>(null);
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    void load({ ...query, signal: controller.signal })
      .then((segments) => {
        if (!controller.signal.aborted)
          setState({
            query,
            status: segments === null ? 'unsupported' : 'loaded',
            segments: segments ?? [],
          });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ query, status: 'error', segments: [] });
      });
    return () => controller.abort();
  }, [query, load]);
  if (!query) return { status: 'idle' as const, segments: [] };
  return state?.query === query ? state : { status: 'loading' as const, segments: [] };
}
