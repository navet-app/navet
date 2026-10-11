import { integrationStore } from '@navet/app/stores/integration-store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getProviderRuntimeRegistrationMock } = vi.hoisted(() => ({
  getProviderRuntimeRegistrationMock: vi.fn(),
}));

vi.mock('@navet/app/provider-runtime-registry', () => ({
  getProviderRuntimeRegistration: getProviderRuntimeRegistrationMock,
}));

import {
  getIntegrationEntityHistories,
  getIntegrationEntityHistory,
  getIntegrationHistoryMessageClient,
  getIntegrationStatisticsHistory,
  integrationHistoryService,
  supportsIntegrationEnergyStatistics,
  supportsIntegrationStatisticsHistory,
} from '../integration-history.service';

describe('integrationHistoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProviderRuntimeRegistrationMock.mockImplementation(() => ({
      historyFeatureService: null,
    }));
    integrationStore.getState().setCurrentProviderId('home_assistant');
  });

  it.each(['batch', 'fallback'])(
    'skips unsupported entities during strict %s history requests',
    async (mode) => {
      const getEntityHistory = vi.fn(async ({ entityId }: { entityId: string }) => ({
        entityId,
        points: [],
      }));
      const getEntityHistories = vi.fn(async ({ entityIds }: { entityIds: string[] }) =>
        entityIds.map((entityId) => ({ entityId, points: [] }))
      );
      getProviderRuntimeRegistrationMock.mockReturnValue({
        historyFeatureService: {
          supportsEntityHistory: (id: string) => id === 'detector#alarm_motion',
          getEntityHistory,
          ...(mode === 'batch' ? { getEntityHistories } : {}),
        },
      });
      await expect(
        getIntegrationEntityHistory({ entityId: 'homey:lock', startTime: '2026-09-12T10:00:00Z' })
      ).resolves.toBeNull();
      expect(getEntityHistory).not.toHaveBeenCalled();
      await expect(
        getIntegrationEntityHistories(
          {
            entityIds: ['homey:lock', 'homey:detector#alarm_motion'],
            startTime: '2026-09-12T10:00:00Z',
          },
          { requireComplete: true }
        )
      ).resolves.toEqual([{ entityId: 'homey:detector#alarm_motion', points: [] }]);
      if (mode === 'batch')
        expect(getEntityHistories).toHaveBeenCalledWith(
          expect.objectContaining({ entityIds: ['detector#alarm_motion'] })
        );
      else
        expect(getEntityHistory).toHaveBeenCalledWith(
          expect.objectContaining({ entityId: 'detector#alarm_motion' })
        );
    }
  );

  it('propagates native batch failures when the caller requires complete history', async () => {
    getProviderRuntimeRegistrationMock.mockReturnValue({
      historyFeatureService: {
        getEntityHistories: vi.fn().mockRejectedValue(new Error('Offline')),
      },
    });
    const request = { entityIds: ['home_assistant:lock.front'], startTime: '2026-09-12T10:00:00Z' };
    await expect(getIntegrationEntityHistories(request, { requireComplete: true })).rejects.toThrow(
      'Offline'
    );
    await expect(getIntegrationEntityHistories(request)).resolves.toEqual([]);
  });

  it('does not silently return incomplete fallback history in strict mode', async () => {
    getProviderRuntimeRegistrationMock.mockReturnValue({
      historyFeatureService: {
        getEntityHistory: vi
          .fn()
          .mockImplementation(({ entityId }: { entityId: string }) =>
            entityId === 'lock.front'
              ? Promise.resolve({ entityId, points: [] })
              : Promise.reject(new Error('Missing device'))
          ),
      },
    });
    const request = {
      entityIds: ['home_assistant:lock.front', 'home_assistant:lock.back'],
      startTime: '2026-09-12T10:00:00Z',
    };
    await expect(getIntegrationEntityHistories(request, { requireComplete: true })).rejects.toThrow(
      'Missing device'
    );
    await expect(getIntegrationEntityHistories(request)).resolves.toHaveLength(1);
  });

  it('exposes the active provider message client through the history contract', () => {
    const sendMessagePromise = vi.fn();
    getProviderRuntimeRegistrationMock.mockReturnValue({
      historyFeatureService: {
        getMessageClient: () => ({ sendMessagePromise }),
      },
    });

    expect(integrationHistoryService.getMessageClient()).toEqual({
      sendMessagePromise,
    });
    expect(getProviderRuntimeRegistrationMock).toHaveBeenCalledWith('home_assistant');
  });

  it('resolves provider-scoped entity ids through the provider registry', () => {
    const sendMessagePromise = vi.fn();
    getProviderRuntimeRegistrationMock.mockReturnValue({
      historyFeatureService: {
        getMessageClient: () => ({ sendMessagePromise }),
      },
    });

    expect(getIntegrationHistoryMessageClient('home_assistant:sensor.energy')).toEqual({
      sendMessagePromise,
    });
    expect(getProviderRuntimeRegistrationMock).toHaveBeenCalledWith('home_assistant');
  });

  it('returns null when the provider has no history feature service', () => {
    getProviderRuntimeRegistrationMock.mockReturnValue({
      historyFeatureService: null,
    });

    expect(getIntegrationHistoryMessageClient('homey:sensor.energy')).toBeNull();
    expect(getProviderRuntimeRegistrationMock).toHaveBeenCalledWith('homey');
  });

  it('delegates raw history with a native id and restores the provider-scoped id', async () => {
    const getEntityHistory = vi.fn(async ({ entityId }: { entityId: string }) => ({
      entityId,
      points: [{ state: 'on', changedAt: '2026-07-14T08:30:00Z' }],
    }));
    getProviderRuntimeRegistrationMock.mockReturnValue({
      historyFeatureService: {
        getMessageClient: () => null,
        getEntityHistory,
      },
    });

    await expect(
      getIntegrationEntityHistory({
        entityId: 'home_assistant:binary_sensor.motion',
        startTime: '2026-07-14T08:00:00Z',
        endTime: '2026-07-14T09:00:00Z',
      })
    ).resolves.toEqual({
      entityId: 'home_assistant:binary_sensor.motion',
      points: [{ state: 'on', changedAt: '2026-07-14T08:30:00Z' }],
    });
    expect(getEntityHistory).toHaveBeenCalledWith({
      entityId: 'binary_sensor.motion',
      startTime: '2026-07-14T08:00:00Z',
      endTime: '2026-07-14T09:00:00Z',
    });
  });

  it('returns null when the provider does not implement raw entity history', async () => {
    getProviderRuntimeRegistrationMock.mockReturnValue({
      historyFeatureService: { getMessageClient: () => null },
    });

    await expect(
      getIntegrationEntityHistory({
        entityId: 'homey:sensor.temperature',
        startTime: '2026-07-14T08:00:00Z',
      })
    ).resolves.toBeNull();
  });

  it('groups entity history into one request per provider and restores canonical ids', async () => {
    const getEntityHistories = vi.fn(async ({ entityIds }: { entityIds: string[] }) =>
      entityIds.map((entityId) => ({
        entityId,
        points: [{ state: 'on', changedAt: '2026-07-14T08:30:00Z' }],
      }))
    );
    getProviderRuntimeRegistrationMock.mockImplementation(() => ({
      historyFeatureService: { getMessageClient: () => null, getEntityHistories },
    }));

    await expect(
      getIntegrationEntityHistories({
        entityIds: [
          'home_assistant:binary_sensor.motion',
          'home_assistant:binary_sensor.door',
          'homey:alarm.motion',
        ],
        startTime: '2026-07-14T08:00:00Z',
      })
    ).resolves.toHaveLength(3);
    expect(getEntityHistories).toHaveBeenCalledTimes(2);
    expect(getEntityHistories.mock.calls[0]?.[0].entityIds).toEqual([
      'binary_sensor.motion',
      'binary_sensor.door',
    ]);
    expect(getEntityHistories.mock.calls[1]?.[0].entityIds).toEqual(['alarm.motion']);
  });

  it('uses provider-owned history support gates instead of provider identity checks', () => {
    getProviderRuntimeRegistrationMock.mockReturnValue({
      historyFeatureService: {
        getMessageClient: () => null,
        supportsStatisticsHistory: (entityId: string) => entityId.startsWith('sensor.'),
        supportsEnergyStatistics: (entityId: string) => entityId === 'sensor.energy',
      },
    });

    expect(supportsIntegrationStatisticsHistory('home_assistant:sensor.temperature')).toBe(true);
    expect(supportsIntegrationStatisticsHistory('home_assistant:binary_sensor.motion')).toBe(false);
    expect(supportsIntegrationEnergyStatistics('home_assistant:sensor.energy')).toBe(true);
    expect(supportsIntegrationEnergyStatistics('home_assistant:sensor.power')).toBe(false);
  });

  it('delegates normalized statistics with native ids and restores canonical ids', async () => {
    const getStatisticsHistory = vi.fn(async () => ({
      'sensor.house_power': [{ startMs: 1_787_040_000_000, endMs: 1_787_043_600_000, mean: 437 }],
      'sensor.kitchen_power': [],
    }));
    getProviderRuntimeRegistrationMock.mockReturnValue({
      historyFeatureService: {
        getMessageClient: () => null,
        getStatisticsHistory,
      },
    });

    await expect(
      getIntegrationStatisticsHistory({
        entityIds: ['home_assistant:sensor.house_power', 'home_assistant:sensor.kitchen_power'],
        startTime: '2026-08-20T00:00:00Z',
        endTime: '2026-08-20T02:00:00Z',
        period: 'hour',
        types: ['mean'],
        units: { power: 'W' },
      })
    ).resolves.toEqual({
      'home_assistant:sensor.house_power': [
        { startMs: 1_787_040_000_000, endMs: 1_787_043_600_000, mean: 437 },
      ],
      'home_assistant:sensor.kitchen_power': [],
    });
    expect(getStatisticsHistory).toHaveBeenCalledWith({
      entityIds: ['sensor.house_power', 'sensor.kitchen_power'],
      startTime: '2026-08-20T00:00:00Z',
      endTime: '2026-08-20T02:00:00Z',
      period: 'hour',
      types: ['mean'],
      units: { power: 'W' },
    });
  });

  it('rejects statistics queries that mix providers', async () => {
    await expect(
      getIntegrationStatisticsHistory({
        entityIds: ['home_assistant:sensor.house_power', 'homey:sensor.office_power'],
        startTime: '2026-08-20T00:00:00Z',
        period: 'hour',
        types: ['mean'],
      })
    ).rejects.toThrow('same provider');
  });
});
