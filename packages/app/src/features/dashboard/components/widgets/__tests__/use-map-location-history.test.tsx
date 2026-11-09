import type {
  PlatformLocationHistoryRequest,
  PlatformLocationPoint,
} from '@navet/core/provider-feature-models';
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useMapLocationHistory } from '../use-map-location-history';

const query = {
  entityId: 'home_assistant:person.alex',
  startTime: '2026-10-14T10:00:00Z',
  endTime: '2026-10-14T12:00:00Z',
};
it('cancels old-source requests and hides stale coordinates', async () => {
  let finish: (value: PlatformLocationPoint[][]) => void = () => undefined;
  const first = new Promise<PlatformLocationPoint[][]>((resolve) => {
    finish = resolve;
  });
  const load = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce([]);
  const { result, rerender } = renderHook(({ request }) => useMapLocationHistory(request, load), {
    initialProps: { request: query as PlatformLocationHistoryRequest | null },
  });
  expect(result.current.status).toBe('loading');
  const signal = load.mock.calls[0][0].signal as AbortSignal;
  rerender({ request: { ...query, entityId: 'home_assistant:person.sam' } });
  expect(signal.aborted).toBe(true);
  await waitFor(() => expect(result.current.status).toBe('loaded'));
  await act(async () => {
    finish([[{ latitude: 55, longitude: 13, timestamp: query.startTime }]]);
  });
  expect(result.current.segments).toEqual([]);
  rerender({ request: null });
  expect(result.current.status).toBe('idle');
});
