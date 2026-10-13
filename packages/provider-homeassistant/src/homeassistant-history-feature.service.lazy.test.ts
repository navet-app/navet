import { beforeEach, expect, it, vi } from 'vitest';

const { loaded, service, session, connection } = vi.hoisted(() => ({
  loaded: vi.fn(),
  connection: { sendMessagePromise: vi.fn() },
  session: { callWS: vi.fn() },
  service: {
    getActivity: vi.fn(),
    getEntityHistories: vi.fn(),
    getEntityHistory: vi.fn(),
    getStatisticsHistory: vi.fn(),
  },
}));
vi.mock('./homeassistant-service-bridge', () => ({
  getHomeAssistantPanelHass: () => ({ callWS: session.callWS }),
  getHomeAssistantConnection: () => connection,
}));
vi.mock('./homeassistant-history-feature.service', () => {
  loaded();
  return { homeAssistantHistoryFeatureService: service };
});
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  session.callWS = vi.fn();
});

it('keeps history capability checks synchronous and loads queries only on demand', async () => {
  const { lazyHomeAssistantHistoryFeatureService: proxy } = await import(
    './homeassistant-history-feature.service.lazy'
  );
  expect(proxy.getMessageClient()).toBe(connection);
  expect(proxy.supportsStatisticsHistory?.('sensor.energy')).toBe(true);
  expect(proxy.supportsStatisticsHistory?.('light.island')).toBe(false);
  expect(proxy.supportsEnergyStatistics?.('sensor.energy')).toBe(true);
  expect(proxy.supportsEnergyStatistics?.('light.island')).toBe(false);
  expect(proxy.supportsEntityHistory).toBeUndefined();
  expect(loaded).not.toHaveBeenCalled();
  const startTime = '2026-10-10T00:00:00Z';
  const batch = { entityIds: ['sensor.energy'], startTime };
  const single = { entityId: 'sensor.energy', startTime };
  const series = { entityId: 'sensor.energy', points: [] };
  service.getEntityHistories.mockResolvedValueOnce([series]);
  service.getEntityHistory.mockResolvedValueOnce(series);
  expect(await proxy.getEntityHistories?.(batch)).toEqual([series]);
  expect(service.getEntityHistories).toHaveBeenCalledWith(batch);
  expect(await proxy.getEntityHistory?.(single)).toBe(series);
  expect(service.getEntityHistory).toHaveBeenCalledWith(single);
  const statistics = { ...batch, period: 'hour' as const, types: ['sum' as const] };
  service.getStatisticsHistory.mockResolvedValueOnce({});
  expect(await proxy.getStatisticsHistory?.(statistics)).toEqual({});
  expect(service.getStatisticsHistory).toHaveBeenCalledWith(statistics);
  const activityRequest = {
    entityIds: ['switch.kitchen'],
    startTime,
    endTime: '2026-10-11T00:00:00Z',
  };
  service.getActivity.mockResolvedValueOnce([]);
  expect(await proxy.getActivity?.(activityRequest)).toEqual([]);
  expect(service.getActivity).toHaveBeenCalledWith(activityRequest);
  expect(loaded).toHaveBeenCalledTimes(1);
});

it('preserves history failures and rejects replacement household queries', async () => {
  const { lazyHomeAssistantHistoryFeatureService: proxy } = await import(
    './homeassistant-history-feature.service.lazy'
  );
  const request = { entityId: 'sensor.energy', startTime: '2026-10-10T00:00:00Z' };
  const error = new Error('History denied');
  service.getEntityHistory.mockRejectedValueOnce(error);
  await expect(proxy.getEntityHistory?.(request)).rejects.toBe(error);
  const pending = proxy.getEntityHistory?.(request);
  session.callWS = vi.fn();
  await expect(pending).rejects.toThrow('Home Assistant session changed');
  expect(service.getEntityHistory).toHaveBeenCalledOnce();
});
