import { beforeEach, describe, expect, it, vi } from 'vitest';

const { histories, activity, queryMode } = vi.hoisted(() => ({
  histories: vi.fn(),
  activity: vi.fn(),
  queryMode: vi.fn(),
}));
vi.mock('@navet/app/services/integration-history.service', () => ({
  getIntegrationEntityHistories: histories,
  getIntegrationActivity: activity,
  getIntegrationEntityHistoryQueryMode: queryMode,
}));

import {
  type HistoryQuery,
  historyRange,
  loadHistoryRecords,
  toLocalDateTime,
} from '../history-records';

const query: HistoryQuery = {
  entityId: 'home_assistant:switch.kitchen',
  startTime: '2026-10-13T10:00:00Z',
  endTime: '2026-10-13T12:00:00Z',
  mode: 'states',
};
describe('entity history exploration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    queryMode.mockReturnValue('time-range');
  });

  it.each([1, 31])('batches an empty %i-day range instead of reading every hour', async (days) => {
    histories.mockResolvedValue([{ entityId: query.entityId, points: [] }]);
    const end = Date.parse(query.endTime);
    const request = {
      ...query,
      startTime: new Date(end - days * 24 * 60 * 60 * 1000).toISOString(),
    };
    await expect(loadHistoryRecords(request, new AbortController().signal)).resolves.toEqual([]);
    expect(histories.mock.calls.length).toBeLessThanOrEqual(days === 1 ? 5 : 35);
    expect(histories.mock.calls.at(-1)?.[0].startTime).toBe(request.startTime);
    for (const [range] of histories.mock.calls) {
      expect(Date.parse(range.endTime) - Date.parse(range.startTime)).toBeLessThanOrEqual(
        24 * 60 * 60 * 1000 + 1
      );
    }
  });

  it('reads a retained series once for the full requested range and still caps dense results', async () => {
    queryMode.mockReturnValue('retained-series');
    const end = Date.parse(query.endTime);
    const request = {
      ...query,
      entityId: 'homey:device#temperature',
      startTime: new Date(end - 31 * 24 * 60 * 60 * 1000).toISOString(),
    };
    histories.mockResolvedValue([
      {
        entityId: request.entityId,
        points: Array.from({ length: 20000 }, (_, index) => ({
          state: String(index),
          changedAt: new Date(end - (index + 1) * 10).toISOString(),
        })),
      },
    ]);
    const records = await loadHistoryRecords(request, new AbortController().signal);
    expect(records).toHaveLength(1001);
    expect(histories).toHaveBeenCalledTimes(1);
    expect(histories.mock.calls[0][0]).toMatchObject({
      startTime: request.startTime,
      endTime: new Date(end).toISOString(),
    });
    expect(queryMode).toHaveBeenCalledWith(request.entityId);
  });

  it('batches sparse activity without applying the state reader policy', async () => {
    queryMode.mockReturnValue('retained-series');
    activity.mockResolvedValue([]);
    const end = Date.parse(query.endTime);
    await expect(
      loadHistoryRecords(
        {
          ...query,
          mode: 'activity',
          startTime: new Date(end - 24 * 60 * 60 * 1000).toISOString(),
        },
        new AbortController().signal
      )
    ).resolves.toEqual([]);
    expect(activity).toHaveBeenCalledTimes(5);
    expect(queryMode).not.toHaveBeenCalled();
  });

  it('keeps the dense cutoff when an older window follows a sparse window', async () => {
    const end = Date.parse(query.endTime);
    const denseEnd = end - 60 * 60 * 1000;
    histories.mockResolvedValueOnce([{ entityId: query.entityId, points: [] }]);
    histories.mockResolvedValueOnce([
      {
        entityId: query.entityId,
        points: Array.from({ length: 20000 }, (_, index) => ({
          state: String(index),
          changedAt: new Date(denseEnd - (index + 1) * 10).toISOString(),
        })),
      },
    ]);
    const records = await loadHistoryRecords(
      { ...query, startTime: new Date(end - 31 * 24 * 60 * 60 * 1000).toISOString() },
      new AbortController().signal
    );
    expect(records).toHaveLength(1001);
    expect(records?.[0].value).toBe('0');
    expect(records?.[1000].value).toBe('1000');
    expect(histories).toHaveBeenCalledTimes(2);
  });
  it('preserves numeric and nonnumeric values and marks a carried initial state', async () => {
    histories.mockResolvedValue([
      {
        entityId: query.entityId,
        points: [
          { state: 'off', changedAt: '2026-10-13T09:00:00Z' },
          { state: 'on', changedAt: '2026-10-13T10:30:00Z' },
          { state: '21.4', changedAt: '2026-10-13T11:00:00Z' },
          { state: 'outside', changedAt: '2026-10-13T12:00:00Z' },
        ],
      },
    ]);
    const records = await loadHistoryRecords(query, new AbortController().signal);
    expect(records?.map((record) => record.value)).toEqual(['21.4', 'on', 'off']);
    expect(records?.[2].atStart).toBe(true);
    expect(histories).toHaveBeenCalledWith(
      expect.objectContaining({ entityIds: [query.entityId], significantChangesOnly: false }),
      { requireComplete: true }
    );
  });
  it('keeps unsupported, retained-empty and failed history distinct', async () => {
    const signal = new AbortController().signal;
    histories.mockResolvedValue([]);
    await expect(loadHistoryRecords(query, signal)).resolves.toBeNull();
    histories.mockResolvedValue([{ entityId: query.entityId, points: [] }]);
    await expect(loadHistoryRecords(query, signal)).resolves.toEqual([]);
    histories.mockRejectedValue(new Error('Recorder unavailable'));
    await expect(loadHistoryRecords(query, signal)).rejects.toThrow('Recorder unavailable');
  });
  it('reads activity separately from state history', async () => {
    activity.mockResolvedValue([
      { entityId: query.entityId, timestamp: query.startTime, message: 'Evening routine started' },
    ]);
    const result = await loadHistoryRecords(
      { ...query, mode: 'activity' },
      new AbortController().signal
    );
    expect(result?.[0].value).toBe('Evening routine started');
  });
  it('keeps only the newest 1001 rows and stops before fetching an entire dense month', async () => {
    const end = Date.parse(query.endTime);
    const points = Array.from({ length: 20000 }, (_, index) => ({
      state: String(index),
      changedAt: new Date(end - (index + 1) * 10).toISOString(),
    })).reverse();
    histories.mockResolvedValue([{ entityId: query.entityId, points }]);
    const records = await loadHistoryRecords(
      { ...query, startTime: new Date(end - 31 * 24 * 60 * 60 * 1000).toISOString() },
      new AbortController().signal
    );
    expect(records).toHaveLength(1001);
    expect(records?.[0].value).toBe('0');
    expect(records?.[1000].value).toBe('1000');
    expect(histories).toHaveBeenCalledTimes(1);
    const request = histories.mock.calls[0][0];
    expect(Date.parse(request.endTime) - Date.parse(request.startTime)).toBeLessThanOrEqual(
      60 * 60 * 1000 + 1
    );
  });
  it('retains a synthetic initial state and real window-boundary changes without duplicate snapshots', async () => {
    const changes = [
      { state: 'on', changedAt: '2026-10-13T10:30:00Z' },
      { state: 'boundary', changedAt: '2026-10-13T11:00:00Z' },
      { state: 'off', changedAt: '2026-10-13T11:40:00Z' },
    ];
    histories.mockImplementation(async (request) => [
      {
        entityId: query.entityId,
        points: [
          { state: 'retained', changedAt: request.startTime, atStart: true },
          ...changes.filter(
            (point) =>
              Date.parse(point.changedAt) > Date.parse(request.startTime) &&
              Date.parse(point.changedAt) < Date.parse(request.endTime)
          ),
        ],
      },
    ]);
    const records = await loadHistoryRecords(query, new AbortController().signal);
    expect(records?.map((record) => record.value)).toEqual(['off', 'boundary', 'on', 'retained']);
    expect(records?.[3].atStart).toBe(true);
    expect(records?.slice(0, 3).every((record) => !record.atStart)).toBe(true);
    expect(histories).toHaveBeenCalledTimes(2);
  });
  it('aborts between windows without requesting older history', async () => {
    const controller = new AbortController();
    histories.mockImplementation(async () => {
      controller.abort();
      return [{ entityId: query.entityId, points: [] }];
    });
    await expect(loadHistoryRecords(query, controller.signal)).rejects.toThrow();
    expect(histories).toHaveBeenCalledTimes(1);
  });
  it('preserves recorded activity context across the normalized feature seam', async () => {
    const context = { name: 'Evening routine', message: 'started', userId: 'household-user' };
    activity.mockResolvedValue([
      { entityId: query.entityId, timestamp: query.startTime, state: 'on', context },
    ]);
    const records = await loadHistoryRecords(
      { ...query, mode: 'activity' },
      new AbortController().signal
    );
    expect(records?.[0]).toMatchObject({ value: 'on', context });
  });
  it.skipIf(Intl.DateTimeFormat().resolvedOptions().timeZone !== 'Europe/Stockholm')(
    'rejects a nonexistent local time at the daylight-saving boundary',
    () => {
      expect(() => historyRange('2026-03-29T02:30', '2026-03-29T04:00')).toThrow();
    }
  );
  it('preserves local instants, rejects invalid or excessive ranges', () => {
    const start = new Date('2026-10-13T10:00:00Z');
    const end = new Date('2026-10-13T12:00:00Z');
    expect(historyRange(toLocalDateTime(start), toLocalDateTime(end))).toEqual({
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });
    expect(() => historyRange('2026-02-30T10:00', '2026-03-01T10:00')).toThrow();
    expect(() => historyRange('2026-10-13T10:00', '2026-10-13T09:00')).toThrow();
    expect(() => historyRange('2026-01-01T10:00', '2026-03-01T10:00')).toThrow();
  });
});
