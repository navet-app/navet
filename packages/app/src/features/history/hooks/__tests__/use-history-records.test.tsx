import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HistoryQuery, HistoryRecord } from '../../history-records';
import { useHistoryRecords } from '../use-history-records';

const query: HistoryQuery = {
  entityId: 'home_assistant:switch.kitchen',
  startTime: '2026-10-13T10:00:00Z',
  endTime: '2026-10-13T12:00:00Z',
  mode: 'states',
};
describe('history request recovery', () => {
  it('suppresses a late result after switching entities and aborts the old request', async () => {
    let finishFirst: (records: HistoryRecord[]) => void = () => undefined;
    const first = new Promise<HistoryRecord[]>((resolve) => {
      finishFirst = resolve;
    });
    const load = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce([{ timestamp: query.startTime, value: 'locked' }]);
    const { result, rerender } = renderHook(({ request }) => useHistoryRecords(request, load), {
      initialProps: { request: query as HistoryQuery | null },
    });
    expect(result.current.status).toBe('loading');
    const signal = load.mock.calls[0][1] as AbortSignal;
    rerender({ request: { ...query, entityId: 'home_assistant:lock.front' } });
    expect(signal.aborted).toBe(true);
    await waitFor(() => expect(result.current.records[0]?.value).toBe('locked'));
    await act(async () => {
      finishFirst([{ timestamp: query.startTime, value: 'wrong source' }]);
    });
    expect(result.current.records[0]?.value).toBe('locked');
    rerender({ request: null });
    expect(result.current.status).toBe('idle');
    expect(result.current.records).toEqual([]);
  });
  it('distinguishes failures from empty data and supports retry', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce([]);
    const { result, rerender } = renderHook(({ request }) => useHistoryRecords(request, load), {
      initialProps: { request: query },
    });
    await waitFor(() => expect(result.current.status).toBe('error'));
    rerender({ request: { ...query } });
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(result.current.records).toEqual([]);
  });
});
