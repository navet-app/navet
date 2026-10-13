import { describe, expect, it, vi } from 'vitest';

const { histories, activity } = vi.hoisted(() => ({ histories: vi.fn(), activity: vi.fn() }));
vi.mock('@navet/app/services/integration-history.service', () => ({
  getIntegrationEntityHistories: histories,
  getIntegrationActivity: activity,
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
  it('preserves numeric and nonnumeric values and marks a carried initial state', async () => {
    histories.mockResolvedValueOnce([
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
    histories
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ entityId: query.entityId, points: [] }])
      .mockRejectedValueOnce(new Error('Recorder unavailable'));
    const signal = new AbortController().signal;
    await expect(loadHistoryRecords(query, signal)).resolves.toBeNull();
    await expect(loadHistoryRecords(query, signal)).resolves.toEqual([]);
    await expect(loadHistoryRecords(query, signal)).rejects.toThrow('Recorder unavailable');
  });
  it('reads activity separately from state history', async () => {
    activity.mockResolvedValueOnce([
      { entityId: query.entityId, timestamp: query.startTime, message: 'Evening routine started' },
    ]);
    const result = await loadHistoryRecords(
      { ...query, mode: 'activity' },
      new AbortController().signal
    );
    expect(result?.[0].value).toBe('Evening routine started');
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
