import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearEnergyStatisticsCache, getCachedEnergyStatistics } from '../energy-statistics-cache';

afterEach(() => {
  clearEnergyStatisticsCache();
  vi.restoreAllMocks();
});

describe('getCachedEnergyStatistics', () => {
  it('propagates a failed request to all callers and permits a retry', async () => {
    const error = { code: 'invalid_format', message: 'Invalid statistics units' };
    const fetcher = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({ today: 4 });

    const results = await Promise.allSettled([
      getCachedEnergyStatistics('history:sensor.total_energy_mwh', 60_000, fetcher),
      getCachedEnergyStatistics('history:sensor.total_energy_mwh', 60_000, fetcher),
    ]);
    expect(results).toEqual([
      { status: 'rejected', reason: error },
      { status: 'rejected', reason: error },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(
      getCachedEnergyStatistics('history:sensor.total_energy_mwh', 60_000, fetcher)
    ).resolves.toEqual({ today: 4 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('reuses fresh cached values for matching keys', async () => {
    const fetcher = vi.fn().mockResolvedValue({ today: 4 });

    await expect(
      getCachedEnergyStatistics('periods:sensor.grid', 60_000, fetcher)
    ).resolves.toEqual({ today: 4 });
    await expect(
      getCachedEnergyStatistics('periods:sensor.grid', 60_000, fetcher)
    ).resolves.toEqual({ today: 4 });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('dedupes simultaneous requests for matching keys', async () => {
    const fetcher = vi.fn().mockResolvedValue([1, 2, 3]);

    const [first, second] = await Promise.all([
      getCachedEnergyStatistics('history:sensor.load', 60_000, fetcher),
      getCachedEnergyStatistics('history:sensor.load', 60_000, fetcher),
    ]);

    expect(first).toEqual([1, 2, 3]);
    expect(second).toEqual([1, 2, 3]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
