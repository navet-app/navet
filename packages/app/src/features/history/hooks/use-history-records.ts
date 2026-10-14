import { useEffect, useState } from 'react';
import { type HistoryQuery, type HistoryRecord, loadHistoryRecords } from '../history-records';

export type HistoryResult = {
  status: 'idle' | 'loading' | 'unavailable' | 'error' | 'loaded';
  records: HistoryRecord[];
};
export function useHistoryRecords(
  query: HistoryQuery | null,
  load = loadHistoryRecords
): HistoryResult {
  const [state, setState] = useState<{ query: HistoryQuery | null; result: HistoryResult }>({
    query: null,
    result: { status: 'idle', records: [] },
  });
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    void load(query, controller.signal)
      .then((records) => {
        if (!controller.signal.aborted)
          setState({
            query,
            result: { status: records === null ? 'unavailable' : 'loaded', records: records ?? [] },
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ query, result: { status: 'error', records: [] } });
      });
    return () => controller.abort();
  }, [query, load]);
  if (!query) return { status: 'idle', records: [] };
  return state.query === query ? state.result : { status: 'loading', records: [] };
}
