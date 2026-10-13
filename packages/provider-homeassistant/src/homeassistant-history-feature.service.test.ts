import { beforeEach, describe, expect, it, vi } from 'vitest';
import { homeAssistantActivityFixture } from '../../app/src/test/fixtures/home-assistant/activity';

const { callHomeAssistantApiMock, getHomeAssistantConnectionMock } = vi.hoisted(() => ({
  callHomeAssistantApiMock: vi.fn(),
  getHomeAssistantConnectionMock: vi.fn<
    () => { sendMessagePromise: ReturnType<typeof vi.fn> } | null
  >(() => null),
}));

vi.mock('./homeassistant-service-bridge', () => ({
  callHomeAssistantApi: callHomeAssistantApiMock,
  getHomeAssistantConnection: getHomeAssistantConnectionMock,
}));

import { homeAssistantHistoryFeatureService } from './homeassistant-history-feature.service';

describe('homeAssistantHistoryFeatureService', () => {
  beforeEach(() => {
    callHomeAssistantApiMock.mockReset();
    getHomeAssistantConnectionMock.mockReset();
    getHomeAssistantConnectionMock.mockReturnValue(null);
  });

  it('reads entity-filtered activity over the existing authenticated WebSocket', async () => {
    const sendMessagePromise = vi.fn().mockResolvedValue(homeAssistantActivityFixture);
    getHomeAssistantConnectionMock.mockReturnValue({ sendMessagePromise });
    const entries = await homeAssistantHistoryFeatureService.getActivity?.({
      entityIds: ['switch.kitchen'],
      startTime: '2026-10-13T10:00:00Z',
      endTime: '2026-10-13T12:00:00Z',
    });
    expect(sendMessagePromise).toHaveBeenCalledWith({
      type: 'logbook/get_events',
      start_time: '2026-10-13T10:00:00Z',
      end_time: '2026-10-13T12:00:00Z',
      entity_ids: ['switch.kitchen'],
    });
    expect(entries).toEqual([
      {
        entityId: 'switch.kitchen',
        timestamp: '2026-10-13T10:35:00.000Z',
        name: 'Kitchen',
        message: 'Evening routine started',
      },
      { entityId: 'switch.kitchen', timestamp: '2026-10-13T10:30:00.000Z', state: 'on' },
    ]);
  });

  it('keeps the inclusive start and exclusive end and rejects malformed activity rows', async () => {
    const startTime = '2026-10-13T10:00:00Z';
    const endTime = '2026-10-13T12:00:00Z';
    const sendMessagePromise = vi
      .fn()
      .mockResolvedValue([
        { entity_id: 'switch.kitchen', when: Date.parse(startTime) / 1000, state: 'on' },
        { entity_id: 'switch.kitchen', when: Date.parse(endTime) / 1000, state: 'off' },
        { entity_id: 'switch.kitchen', when: 'not-a-date', state: 'on' },
        null,
      ]);
    getHomeAssistantConnectionMock.mockReturnValue({ sendMessagePromise });
    await expect(
      homeAssistantHistoryFeatureService.getActivity?.({
        entityIds: ['switch.kitchen'],
        startTime,
        endTime,
      })
    ).resolves.toEqual([
      { entityId: 'switch.kitchen', timestamp: '2026-10-13T10:00:00.000Z', state: 'on' },
    ]);
  });

  it('distinguishes empty activity from disconnected and failed readers', async () => {
    const request = {
      entityIds: ['switch.kitchen'],
      startTime: '2026-10-13T10:00:00Z',
      endTime: '2026-10-13T12:00:00Z',
    };
    await expect(homeAssistantHistoryFeatureService.getActivity?.(request)).rejects.toThrow(
      'active connection'
    );
    const sendMessagePromise = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('Recorder unavailable'))
      .mockResolvedValueOnce({});
    getHomeAssistantConnectionMock.mockReturnValue({ sendMessagePromise });
    await expect(homeAssistantHistoryFeatureService.getActivity?.(request)).resolves.toEqual([]);
    await expect(homeAssistantHistoryFeatureService.getActivity?.(request)).rejects.toThrow(
      'Recorder unavailable'
    );
    await expect(homeAssistantHistoryFeatureService.getActivity?.(request)).rejects.toThrow(
      'Invalid'
    );
  });

  it('rejects invalid activity ranges and suppresses cancelled responses', async () => {
    const request = {
      entityIds: ['switch.kitchen'],
      startTime: '2026-10-13T10:00:00Z',
      endTime: '2026-10-13T12:00:00Z',
    };
    const controller = new AbortController();
    const sendMessagePromise = vi.fn(async () => {
      controller.abort();
      return homeAssistantActivityFixture;
    });
    getHomeAssistantConnectionMock.mockReturnValue({ sendMessagePromise });
    await expect(
      homeAssistantHistoryFeatureService.getActivity?.({ ...request, endTime: request.startTime })
    ).rejects.toThrow();
    expect(sendMessagePromise).not.toHaveBeenCalled();
    await expect(
      homeAssistantHistoryFeatureService.getActivity?.({ ...request, signal: controller.signal })
    ).rejects.toThrow();
  });

  it('loads bounded entity history through the documented REST endpoint', async () => {
    callHomeAssistantApiMock.mockResolvedValueOnce([
      [
        {
          entity_id: 'binary_sensor.front_door',
          state: 'off',
          last_changed: '2026-07-14T08:00:00+00:00',
          last_updated: '2026-07-14T08:00:01+00:00',
        },
        {
          state: 'on',
          last_changed: '2026-07-14T08:30:00+00:00',
        },
      ],
    ]);

    await expect(
      homeAssistantHistoryFeatureService.getEntityHistory?.({
        entityId: 'binary_sensor.front_door',
        startTime: '2026-07-14T08:00:00+00:00',
        endTime: '2026-07-14T09:00:00+00:00',
      })
    ).resolves.toEqual({
      entityId: 'binary_sensor.front_door',
      points: [
        {
          state: 'off',
          changedAt: '2026-07-14T08:00:00+00:00',
          updatedAt: '2026-07-14T08:00:01+00:00',
        },
        {
          state: 'on',
          changedAt: '2026-07-14T08:30:00+00:00',
        },
      ],
    });

    const [method, path] = callHomeAssistantApiMock.mock.calls[0] as [string, string];
    expect(method).toBe('GET');
    expect(path).toContain('history/period/2026-07-14T08%3A00%3A00%2B00%3A00?');
    const query = new URLSearchParams(path.split('?')[1]);
    expect(query.get('filter_entity_id')).toBe('binary_sensor.front_door');
    expect(query.get('end_time')).toBe('2026-07-14T09:00:00+00:00');
    expect(query.has('minimal_response')).toBe(true);
    expect(query.has('no_attributes')).toBe(true);
  });

  it('preserves requested attributes and ignores malformed history rows', async () => {
    callHomeAssistantApiMock.mockResolvedValueOnce([
      [
        {
          entity_id: 'sensor.temperature',
          state: '21.4',
          last_changed: '2026-07-14T08:00:00Z',
          attributes: { unit_of_measurement: '°C' },
        },
        { state: 22, last_changed: '2026-07-14T08:05:00Z' },
        { state: '22', last_changed: 'not-a-date' },
      ],
    ]);

    const result = await homeAssistantHistoryFeatureService.getEntityHistory?.({
      entityId: 'sensor.temperature',
      startTime: '2026-07-14T08:00:00Z',
      endTime: '2026-07-14T09:00:00Z',
      includeAttributes: true,
      significantChangesOnly: true,
    });

    expect(result?.points).toEqual([
      {
        state: '21.4',
        changedAt: '2026-07-14T08:00:00Z',
        attributes: { unit_of_measurement: '°C' },
      },
    ]);
    const path = callHomeAssistantApiMock.mock.calls[0]?.[1] as string;
    const query = new URLSearchParams(path.split('?')[1]);
    expect(query.has('minimal_response')).toBe(false);
    expect(query.has('no_attributes')).toBe(false);
    expect(query.has('significant_changes_only')).toBe(true);
  });

  it('loads multiple entity histories in one REST request', async () => {
    callHomeAssistantApiMock.mockResolvedValueOnce([
      [{ entity_id: 'binary_sensor.motion', state: 'on', last_changed: '2026-07-14T08:10:00Z' }],
      [{ entity_id: 'lock.front_door', state: 'locked', last_changed: '2026-07-14T08:20:00Z' }],
    ]);

    const result = await homeAssistantHistoryFeatureService.getEntityHistories?.({
      entityIds: ['binary_sensor.motion', 'lock.front_door'],
      startTime: '2026-07-14T08:00:00Z',
      endTime: '2026-07-14T09:00:00Z',
    });

    expect(result?.map((series) => series.entityId)).toEqual([
      'binary_sensor.motion',
      'lock.front_door',
    ]);
    expect(callHomeAssistantApiMock).toHaveBeenCalledTimes(1);
    const path = callHomeAssistantApiMock.mock.calls[0]?.[1] as string;
    const query = new URLSearchParams(path.split('?')[1]);
    expect(query.get('filter_entity_id')).toBe('binary_sensor.motion,lock.front_door');
  });

  it('rejects invalid or reversed periods before making a request', async () => {
    await expect(
      homeAssistantHistoryFeatureService.getEntityHistory?.({
        entityId: 'sensor.temperature',
        startTime: '2026-07-14T10:00:00Z',
        endTime: '2026-07-14T09:00:00Z',
      })
    ).rejects.toThrow('valid start time before the end time');
    expect(callHomeAssistantApiMock).not.toHaveBeenCalled();
  });

  it('normalizes recorder statistics without exposing Home Assistant response fields', async () => {
    const sendMessagePromise = vi.fn().mockResolvedValue({
      'sensor.house_power': [
        { start: 1_787_040_000_000, end: 1_787_043_600_000, mean: 437, min: 147, max: 3764 },
        { start: '2026-08-20T01:00:00Z', end: '2026-08-20T02:00:00Z', mean: 512 },
        { start: 'invalid', end: 1_787_050_800_000, mean: 900 },
      ],
    });
    getHomeAssistantConnectionMock.mockReturnValue({ sendMessagePromise });

    await expect(
      homeAssistantHistoryFeatureService.getStatisticsHistory?.({
        entityIds: ['sensor.house_power'],
        startTime: '2026-08-20T00:00:00Z',
        endTime: '2026-08-20T03:00:00Z',
        period: 'hour',
        types: ['mean', 'min', 'max'],
      })
    ).resolves.toEqual({
      'sensor.house_power': [
        {
          startMs: 1_787_040_000_000,
          endMs: 1_787_043_600_000,
          mean: 437,
          min: 147,
          max: 3764,
        },
        {
          startMs: Date.parse('2026-08-20T01:00:00Z'),
          endMs: Date.parse('2026-08-20T02:00:00Z'),
          mean: 512,
        },
      ],
    });
    expect(sendMessagePromise).toHaveBeenCalledWith({
      type: 'recorder/statistics_during_period',
      start_time: '2026-08-20T00:00:00Z',
      end_time: '2026-08-20T03:00:00Z',
      statistic_ids: ['sensor.house_power'],
      period: 'hour',
      types: ['mean', 'min', 'max'],
    });
  });

  it('requests energy conversion by category and preserves converted changes', async () => {
    const sendMessagePromise = vi.fn().mockResolvedValue({
      'sensor.total_energy_mwh': [{ start: 1_787_040_000_000, end: 1_787_043_600_000, change: 2 }],
    });
    getHomeAssistantConnectionMock.mockReturnValue({ sendMessagePromise });

    await expect(
      homeAssistantHistoryFeatureService.getStatisticsHistory?.({
        entityIds: ['sensor.total_energy_mwh'],
        startTime: '2026-08-20T00:00:00Z',
        endTime: '2026-08-20T01:00:00Z',
        period: 'hour',
        types: ['change'],
        units: { energy: 'kWh' },
      })
    ).resolves.toEqual({
      'sensor.total_energy_mwh': [
        { startMs: 1_787_040_000_000, endMs: 1_787_043_600_000, change: 2 },
      ],
    });
    expect(sendMessagePromise).toHaveBeenCalledWith({
      type: 'recorder/statistics_during_period',
      statistic_ids: ['sensor.total_energy_mwh'],
      start_time: '2026-08-20T00:00:00Z',
      end_time: '2026-08-20T01:00:00Z',
      period: 'hour',
      types: ['change'],
      units: { energy: 'kWh' },
    });
  });

  it('rejects statistics requests when there is no active provider connection', async () => {
    await expect(
      homeAssistantHistoryFeatureService.getStatisticsHistory?.({
        entityIds: ['sensor.house_power'],
        startTime: '2026-08-20T00:00:00Z',
        endTime: '2026-08-20T01:00:00Z',
        period: 'hour',
        types: ['mean'],
      })
    ).rejects.toThrow('requires an active connection');
  });
});
