import type {
  PlatformStatisticsHistoryRequest,
  PlatformStatisticsHistorySeries,
} from '@navet/app/platform/provider-feature-models';
import { getIntegrationStatisticsHistory } from '@navet/app/services/integration-history.service';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getCachedEnergyStatistics } from '../services/energy-statistics-cache';
import type {
  EnergyConsumer,
  EnergyHistoryRange,
  EnergyHistoryWindow,
  EnergyHistoryWorkspaceModel,
} from '../types/energy.types';
import {
  buildEnergyHistoryBuckets,
  buildEnergyHistoryWorkspaceModel,
  resolveEnergyHistoryWindow,
} from '../utils/energy-history-workspace';

interface EnergyHistoryState {
  series: PlatformStatisticsHistorySeries;
  previousSeries: PlatformStatisticsHistorySeries;
}

const HISTORY_CACHE_TTL_MS: Record<EnergyHistoryRange, number> = {
  today: 5 * 60 * 1000,
  week: 15 * 60 * 1000,
  month: 30 * 60 * 1000,
  year: 60 * 60 * 1000,
  custom: 30 * 60 * 1000,
};

export function useEnergyHistoryWorkspace({
  currentLoadStatisticId,
  consumers,
  range,
  customStart,
  customEnd,
  referenceDateMs,
  selectedBucketIndex,
  enabled,
  statisticsLoader = getIntegrationStatisticsHistory,
  valueKind = 'power',
}: {
  currentLoadStatisticId?: string;
  consumers: EnergyConsumer[];
  range: EnergyHistoryRange;
  customStart?: string;
  customEnd?: string;
  referenceDateMs?: number;
  selectedBucketIndex?: number | null;
  enabled: boolean;
  statisticsLoader?: (
    request: PlatformStatisticsHistoryRequest
  ) => Promise<PlatformStatisticsHistorySeries | null>;
  valueKind?: 'power' | 'energy';
}): {
  model: EnergyHistoryWorkspaceModel | null;
  window: EnergyHistoryWindow;
  isLoading: boolean;
  isBreakdownLoading: boolean;
  error: Error | null;
} {
  const window = useMemo(
    () =>
      resolveEnergyHistoryWindow({
        range,
        customStart,
        customEnd,
        ...(referenceDateMs !== undefined ? { referenceDate: new Date(referenceDateMs) } : {}),
      }),
    [customEnd, customStart, range, referenceDateMs]
  );
  const consumerEntityIds = useMemo(
    () => [
      ...new Set(
        consumers
          .map((consumer) => consumer.powerEntityId)
          .filter((entityId): entityId is string => Boolean(entityId))
      ),
    ],
    [consumers]
  );
  const [state, setState] = useState<EnergyHistoryState | null>(null);
  const [breakdownSeries, setBreakdownSeries] = useState<PlatformStatisticsHistorySeries>({});
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBreakdownLoading, setIsBreakdownLoading] = useState(false);
  const statisticsLoaderRef = useRef(statisticsLoader);
  statisticsLoaderRef.current = statisticsLoader;

  useEffect(() => {
    if (!enabled || !currentLoadStatisticId) {
      setState(null);
      setBreakdownSeries({});
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    const rangeIdentity =
      range === 'custom' ? `custom:${customStart ?? ''}:${customEnd ?? ''}` : range;
    const currentTypes =
      valueKind === 'energy' ? (['change'] as const) : (['mean', 'min', 'max'] as const);
    const previousTypes = valueKind === 'energy' ? (['change'] as const) : (['mean'] as const);
    const fetchSeries = (
      cacheScope: string,
      startMs: number,
      endMs: number,
      types: PlatformStatisticsHistoryRequest['types']
    ) =>
      getCachedEnergyStatistics(
        `energy-history:${cacheScope}:${currentLoadStatisticId}:${rangeIdentity}:${window.startMs}:${window.endMs}:${window.period}:${valueKind}`,
        HISTORY_CACHE_TTL_MS[range],
        async () =>
          (await statisticsLoaderRef.current({
            entityIds: [currentLoadStatisticId],
            startTime: new Date(startMs).toISOString(),
            endTime: new Date(endMs).toISOString(),
            period: window.period,
            types,
            ...(valueKind === 'energy' ? { units: { energy: 'kWh' } } : {}),
          })) ?? {}
      );

    setBreakdownSeries({});
    setIsBreakdownLoading(false);
    setIsLoading(true);
    setError(null);
    Promise.all([
      fetchSeries('current', window.startMs, window.endMs, [...currentTypes]),
      fetchSeries('previous', window.previousStartMs, window.previousEndMs, [...previousTypes]),
    ])
      .then(([series, previousSeries]) => {
        if (!cancelled) setState({ series, previousSeries });
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setState(null);
          setError(reason instanceof Error ? reason : new Error('Energy history could not load'));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentLoadStatisticId, customEnd, customStart, enabled, range, valueKind, window]);

  const selectedBucket = useMemo(
    () =>
      state &&
      currentLoadStatisticId &&
      selectedBucketIndex !== null &&
      selectedBucketIndex !== undefined
        ? (buildEnergyHistoryBuckets({
            points: state.series[currentLoadStatisticId] ?? [],
            window,
            valueKind,
          })[selectedBucketIndex] ?? null)
        : null,
    [currentLoadStatisticId, selectedBucketIndex, state, valueKind, window]
  );

  useEffect(() => {
    if (!enabled || !selectedBucket?.hasData || consumerEntityIds.length === 0) {
      setBreakdownSeries({});
      setIsBreakdownLoading(false);
      return;
    }

    let cancelled = false;
    const cacheIdentity = consumerEntityIds.join(',');
    setBreakdownSeries({});
    setIsBreakdownLoading(true);
    getCachedEnergyStatistics(
      `energy-history:breakdown:${cacheIdentity}:${selectedBucket.startMs}:${selectedBucket.endMs}:${window.period}`,
      HISTORY_CACHE_TTL_MS[range],
      async () =>
        (await statisticsLoaderRef.current({
          entityIds: consumerEntityIds,
          startTime: new Date(selectedBucket.startMs).toISOString(),
          endTime: new Date(selectedBucket.endMs).toISOString(),
          period: window.period,
          types: ['mean'],
        })) ?? {}
    )
      .then((series) => {
        if (!cancelled) setBreakdownSeries(series);
      })
      .catch(() => {
        if (!cancelled) setBreakdownSeries({});
      })
      .finally(() => {
        if (!cancelled) setIsBreakdownLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [consumerEntityIds, enabled, range, selectedBucket, window.period]);

  const model = useMemo(
    () =>
      state && currentLoadStatisticId
        ? buildEnergyHistoryWorkspaceModel({
            wholeHomeEntityId: currentLoadStatisticId,
            consumers,
            series: { ...state.series, ...breakdownSeries },
            previousSeries: state.previousSeries,
            window,
            selectedBucketIndex,
            valueKind,
          })
        : null,
    [
      breakdownSeries,
      consumers,
      currentLoadStatisticId,
      selectedBucketIndex,
      state,
      valueKind,
      window,
    ]
  );

  return { model, window, isLoading, isBreakdownLoading, error };
}
