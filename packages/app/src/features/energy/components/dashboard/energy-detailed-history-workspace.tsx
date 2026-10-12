import {
  BaseCard,
  Button,
  InteractivePill,
  OverlayScrollArea,
} from '@navet/app/components/primitives';
import { EntityCardHeaderIcon } from '@navet/app/components/primitives/entity-card-header-icon';
import { CardEditActionButton } from '@navet/app/components/shared/card-edit-action-button';
import { getCardReadableTextTokens } from '@navet/app/components/shared/theme/card-readable-text-tokens';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { cn } from '@navet/app/components/ui/utils';
import { STORAGE_KEYS } from '@navet/app/constants/storage-keys';
import { AddEntityDialogPrimitive } from '@navet/app/features/dashboard/components/add-entity-dialog';
import { useEnergyHistoryWorkspace } from '@navet/app/features/energy/hooks/use-energy-history-workspace';
import { useProviderEnergyKpiMetrics } from '@navet/app/features/energy/hooks/use-provider-energy-kpi-metrics';
import type {
  EnergyConsumer,
  EnergyDashboardModel,
  EnergyHistoryBucket,
  EnergyHistoryContribution,
  EnergyHistoryRange,
  EnergyHistorySource,
  EnergyHistoryWindow,
  EnergyProviderKpiMetric,
  EnergySeriesPoint,
} from '@navet/app/features/energy/types/energy.types';
import { formatEnergyValue } from '@navet/app/features/energy/utils/energy-formatters';
import { SmallSensorDisplay } from '@navet/app/features/sensors/components/sensors/small-sensor-display';
import {
  useI18n,
  useIntegrationStore,
  useMediaQuery,
  usePersistedState,
  useTheme,
} from '@navet/app/hooks';
import type { TranslateFn, TranslationKey } from '@navet/app/i18n';
import type {
  PlatformStatisticsHistoryRequest,
  PlatformStatisticsHistorySeries,
} from '@navet/app/platform/provider-feature-models';
import { integrationSelectors } from '@navet/app/stores/selectors';
import {
  ArrowLeft,
  BatteryCharging,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Gauge,
  type LucideIcon,
  Pencil,
  SunMedium,
  TrendingDown,
  TrendingUp,
  UtilityPole,
  WalletCards,
  Zap,
} from 'lucide-react';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { EnergyHistoryBarChart } from '../charts/energy-history-bar-chart';
import { EnergySparkline } from '../charts/energy-sparkline';
import { EnergyCardArrangement } from './energy-card-arrangement';

type EnergyUsageRange = 'live' | EnergyHistoryRange;

function EnergyLoadingIndicator() {
  const { t } = useI18n();
  return (
    <div
      role="status"
      className="flex items-center justify-center"
      aria-label={t('energy.historyWorkspace.loading')}
    >
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-current border-r-transparent opacity-60"
      />
    </div>
  );
}

export interface EnergyUsageMetric {
  id: string;
  label: string;
  period: string;
  value: string;
  detail: string;
  footer: string;
  icon: LucideIcon;
  color: string;
}

interface EnergyKpiPreference {
  mode: 'auto' | 'custom';
  metricIds: string[];
}

interface EnergyKpiPreferences {
  version: 1;
  byProvider: Record<string, EnergyKpiPreference>;
  shared?: EnergyKpiPreference;
}

const DEFAULT_ENERGY_KPI_PREFERENCES: EnergyKpiPreferences = {
  version: 1,
  byProvider: {},
};

const RANGE_LABELS: Record<EnergyUsageRange, TranslationKey> = {
  live: 'energy.range.live',
  today: 'energy.range.day',
  week: 'energy.range.week',
  month: 'energy.range.month',
  year: 'energy.range.year',
  custom: 'common.custom',
};
const EMPTY_HISTORY_SOURCES: EnergyHistorySource[] = [];
const EMPTY_HISTORY_CONSUMERS: EnergyConsumer[] = [];

export function EnergyDetailedHistoryWorkspace({
  currentLoadStatisticId,
  accentColor,
  currentLoadW,
  livePoints,
  consumers = EMPTY_HISTORY_CONSUMERS,
  priorityData,
  insightsRange,
  customStart,
  customEnd,
  referenceDateMs,
  onReferenceDateChange,
  mainCardStyle,
  metricRowSpan,
  useBentoLayout = false,
  isEditMode = false,
  statisticsLoader,
  sources = EMPTY_HISTORY_SOURCES,
}: {
  currentLoadStatisticId?: string;
  accentColor: string;
  currentLoadW: number;
  livePoints: EnergySeriesPoint[];
  consumers?: EnergyConsumer[];
  priorityData?: Pick<EnergyDashboardModel, 'dataCoverage' | 'totals'>;
  insightsRange: EnergyHistoryRange;
  customStart: string;
  customEnd: string;
  referenceDateMs: number;
  onReferenceDateChange: (timestampMs: number) => void;
  mainCardStyle?: CSSProperties;
  metricRowSpan?: number;
  useBentoLayout?: boolean;
  isEditMode?: boolean;
  statisticsLoader?: (
    request: PlatformStatisticsHistoryRequest
  ) => Promise<PlatformStatisticsHistorySeries | null>;
  sources?: EnergyHistorySource[];
}) {
  const { theme } = useTheme();
  const [usageCardOrder, setUsageCardOrder] = usePersistedState<string[]>(
    STORAGE_KEYS.energyUsageCardOrder,
    []
  );
  const { locale, t } = useI18n();
  const isPhone = useMediaQuery('(max-width: 639px)');
  const currentProviderId = useIntegrationStore(integrationSelectors.currentProviderId);
  const providerKpiMetrics = useProviderEnergyKpiMetrics();
  const [kpisHidden] = usePersistedState(STORAGE_KEYS.energyKpisHidden, false);
  const [editingKpiIndex, setEditingKpiIndex] = useState<number | null>(null);
  const [kpiPreferences, setKpiPreferences] = usePersistedState<EnergyKpiPreferences>(
    STORAGE_KEYS.energyKpiPreferences,
    DEFAULT_ENERGY_KPI_PREFERENCES
  );
  const surface = getThemeSurfaceTokens(theme);
  const sourceSummaryText = getCardReadableTextTokens({ theme, tone: 'neutral' });
  const [chartMode, setChartMode] = useState<'live' | 'insights'>(
    insightsRange === 'today' ? 'live' : 'insights'
  );
  const [selectedSourceId, setSelectedSourceId] = useState<EnergyHistorySource['id']>('home');
  const [selectedBucketIndex, setSelectedBucketIndex] = useState<number | null>(null);
  const previousInsightsRange = useRef(insightsRange);
  useEffect(() => {
    if (previousInsightsRange.current === insightsRange) return;
    previousInsightsRange.current = insightsRange;
    setChartMode('insights');
    setSelectedBucketIndex(null);
  }, [insightsRange]);
  const availableSources = useMemo(() => {
    const candidates =
      sources.length > 0
        ? sources
        : currentLoadStatisticId
          ? [
              {
                id: 'home' as const,
                label: t('energy.historyWorkspace.homeUse'),
                entityId: currentLoadStatisticId,
                color: accentColor,
                valueKind: 'power' as const,
              },
            ]
          : [];
    const seenEntityIds = new Set<string>();
    return candidates.filter((source) => {
      if (seenEntityIds.has(source.entityId)) return false;
      seenEntityIds.add(source.entityId);
      return true;
    });
  }, [accentColor, currentLoadStatisticId, sources, t]);
  const selectedSource =
    availableSources.find((source) => source.id === selectedSourceId) ?? availableSources[0];
  const selectedSourceColor =
    selectedSource?.id === 'home' ? accentColor : (selectedSource?.color ?? accentColor);
  const shouldShowSourceSelector =
    availableSources.length > 1 &&
    (availableSources.some((source) => source.id === 'solar') ||
      Boolean(priorityData?.dataCoverage.hasBattery || priorityData?.dataCoverage.hasGridExport));
  const isLiveChart = chartMode === 'live';
  const historyRange = insightsRange;
  const { model, window, isLoading, isBreakdownLoading, error } = useEnergyHistoryWorkspace({
    currentLoadStatisticId: selectedSource?.entityId,
    consumers: selectedSource?.id === 'home' ? consumers : EMPTY_HISTORY_CONSUMERS,
    range: historyRange,
    customStart,
    customEnd,
    referenceDateMs,
    selectedBucketIndex,
    enabled: Boolean(selectedSource?.entityId),
    statisticsLoader,
    valueKind: selectedSource?.valueKind,
  });
  const chartData =
    model?.buckets.map((bucket) => ({
      label: bucket.label,
      value: bucket.averagePowerW,
      secondaryValue: bucket.energyKWh,
      hasData: bucket.hasData,
      timestampMs: bucket.startMs,
      endTimestampMs: bucket.endMs,
      minValue: bucket.lowPowerW,
      maxValue: bucket.peakPowerW,
    })) ?? [];
  const detailLabel = t('energy.historyCopy.total', { period: t(RANGE_LABELS[historyRange]) });
  const metricEnergyKWh = model?.totalEnergyKWh ?? 0;
  const metricLowPowerW = model?.lowPowerW ?? 0;
  const metricAveragePowerW = model?.averagePowerW ?? 0;
  const metricPeakPowerW = model?.peakPowerW ?? 0;
  const observedEnergyBuckets = model?.buckets.filter((bucket) => bucket.hasData) ?? [];
  const lowestEnergyBucket = findLowestEnergyBucket(observedEnergyBuckets);
  const highestEnergyBucket = findHighestEnergyBucket(observedEnergyBuckets);
  const averageBucketEnergyKWh =
    observedEnergyBuckets.length > 0
      ? (model?.totalEnergyKWh ?? 0) / observedEnergyBuckets.length
      : 0;
  const energyBucketUnit = getEnergyBucketUnit(observedEnergyBuckets[0]);
  const energyBucketAverageLabel = t('energy.historyCopy.bucketAverage', {
    period: t(`energy.historyCopy.${energyBucketUnit}`),
  });
  const liveLowPowerW = livePoints.reduce(
    (lowest, point) => Math.min(lowest, point.minValue ?? point.value),
    Number.POSITIVE_INFINITY
  );
  const liveAveragePowerW =
    livePoints.length > 0
      ? livePoints.reduce((total, point) => total + point.value, 0) / livePoints.length
      : 0;
  const livePeakPowerW = livePoints.reduce(
    (highest, point) => Math.max(highest, point.maxValue ?? point.value),
    0
  );
  const liveTickIndexes = new Set([
    0,
    Math.floor((livePoints.length - 1) / 3),
    Math.floor(((livePoints.length - 1) * 2) / 3),
    livePoints.length - 1,
  ]);
  const isTodayInsights = historyRange === 'today';
  const displayedLowPowerW = isTodayInsights
    ? (model?.lowPowerW ?? (Number.isFinite(liveLowPowerW) ? liveLowPowerW : 0))
    : metricLowPowerW;
  const displayedAveragePowerW = isTodayInsights
    ? (model?.averagePowerW ?? liveAveragePowerW)
    : metricAveragePowerW;
  const displayedPeakPowerW = isTodayInsights
    ? (model?.peakPowerW ?? livePeakPowerW)
    : metricPeakPowerW;
  const displayedEnergyKWh = model?.totalEnergyKWh;
  const lowPowerBucket = findLowestPowerBucket(model?.buckets ?? []);
  const energyComparison = model
    ? formatEnergyComparison(model.comparisonPercent, isTodayInsights, t)
    : isLoading
      ? t('energy.historyCopy.comparisonLoading')
      : t('energy.historyCopy.comparisonUnavailable');
  const periodLabel = t(RANGE_LABELS[historyRange]);
  const historyPeriodContext = formatHistoryPeriodContext(historyRange, window, locale, t);
  const navigationUnit = getHistoryNavigationUnit(historyRange);
  const historyNavigationUnit = navigationUnit ? t(`energy.historyCopy.${navigationUnit}`) : null;
  const isCurrentHistoryPeriod = isSameHistoryPeriod(historyRange, referenceDateMs, Date.now());
  const periodAverageLabel = isTodayInsights
    ? t('energy.historyCopy.todayAverage')
    : t('energy.historyCopy.periodAverage');
  const metricCardSpans = resolveMetricCardSpans(metricRowSpan);
  const genericLiveMetrics: EnergyUsageMetric[] = [
    {
      id: 'now',
      label: t('energy.historyWorkspace.currentDemand'),
      period: t('energy.range.live'),
      value: formatPowerValue(currentLoadW),
      detail: t('energy.historyCopy.householdLoad'),
      footer: energyComparison,
      icon: Zap,
      color: selectedSourceColor,
    },
    {
      id: 'low',
      label: t('energy.historyWorkspace.lowUsage'),
      period: periodLabel,
      value: model || livePoints.length > 0 ? formatPowerValue(displayedLowPowerW) : '—',
      detail: lowPowerBucket
        ? formatOccurrence(lowPowerBucket.startMs, lowPowerBucket.endMs, 'lowest', locale, t)
        : t('energy.historyCopy.todaySoFar'),
      footer: formatRelativeToAverage(
        displayedLowPowerW,
        displayedAveragePowerW,
        'below',
        periodAverageLabel,
        t
      ),
      icon: TrendingDown,
      color: '#38bdf8',
    },
    {
      id: 'average',
      label: t('energy.historyWorkspace.averageUsage'),
      period: periodLabel,
      value: model || livePoints.length > 0 ? formatPowerValue(displayedAveragePowerW) : '—',
      detail: t('energy.historyCopy.typicalDemand'),
      footer:
        typeof displayedEnergyKWh === 'number'
          ? t('energy.historyCopy.usedToday', { value: formatEnergyValue(displayedEnergyKWh) })
          : t('energy.historyCopy.historyLoading'),
      icon: Gauge,
      color: '#2dd4bf',
    },
    {
      id: 'peak',
      label: t('energy.historyWorkspace.peakUsage'),
      period: periodLabel,
      value: model || livePoints.length > 0 ? formatPowerValue(displayedPeakPowerW) : '—',
      detail:
        model?.peakStartMs && model.peakEndMs
          ? formatOccurrence(model.peakStartMs, model.peakEndMs, 'highest', locale, t)
          : t('energy.historyCopy.highestDemand'),
      footer: formatRelativeToAverage(
        displayedPeakPowerW,
        displayedAveragePowerW,
        'above',
        periodAverageLabel,
        t
      ),
      icon: TrendingUp,
      color: '#fb923c',
    },
  ];
  const capabilityMetrics: EnergyUsageMetric[] = [];
  if (priorityData?.dataCoverage.hasGridImport || priorityData?.dataCoverage.hasGridExport) {
    const isExporting = (priorityData?.totals.exportW ?? 0) > 0;
    const gridPowerW = isExporting
      ? (priorityData?.totals.exportW ?? 0)
      : (priorityData?.totals.importW ?? 0);
    const gridEnergyKWh = isExporting
      ? (priorityData?.totals.exportTodayKWh ?? 0)
      : (priorityData?.totals.importTodayKWh ?? 0);
    capabilityMetrics.push({
      id: 'grid',
      label: t(isExporting ? 'energy.model.gridExport' : 'energy.model.gridImport'),
      period: t('energy.range.live'),
      value: formatPowerValue(gridPowerW),
      detail:
        gridPowerW > 0
          ? t(isExporting ? 'energy.historyCopy.exporting' : 'energy.historyCopy.importing')
          : t('energy.historyCopy.gridIdle'),
      footer: t(
        isExporting ? 'energy.historyCopy.exportedToday' : 'energy.historyCopy.importedToday',
        { value: formatEnergyValue(gridEnergyKWh) }
      ),
      icon: UtilityPole,
      color: '#60a5fa',
    });
  }
  if (priorityData?.dataCoverage.hasSolar) {
    const solarCoverage =
      currentLoadW > 0
        ? Math.min(100, Math.round((priorityData.totals.solarW / currentLoadW) * 100))
        : 0;
    capabilityMetrics.push({
      id: 'solar',
      label: t('energy.historyWorkspace.solarProduction'),
      period: t('energy.range.live'),
      value: formatPowerValue(priorityData.totals.solarW),
      detail:
        priorityData.totals.solarW > 0
          ? t('energy.historyCopy.generating')
          : t('energy.historyCopy.solarIdle'),
      footer:
        priorityData.totals.solarW > 0
          ? t('energy.historyCopy.demandShare', { percent: solarCoverage })
          : t('energy.historyCopy.generatedToday', {
              value: formatEnergyValue(priorityData.totals.solarTodayKWh),
            }),
      icon: SunMedium,
      color: '#facc15',
    });
  }
  if (priorityData?.dataCoverage.hasBattery) {
    const batteryPowerW = priorityData.totals.batteryPowerW;
    capabilityMetrics.push({
      id: 'battery',
      label: t('energy.model.battery'),
      period: t('energy.range.live'),
      value: `${Math.round(priorityData.totals.batteryPercent)}%`,
      detail:
        batteryPowerW > 0
          ? t('energy.historyCopy.charging', { value: formatPowerValue(batteryPowerW) })
          : batteryPowerW < 0
            ? t('energy.historyCopy.supplying', {
                value: formatPowerValue(Math.abs(batteryPowerW)),
              })
            : t('energy.historyCopy.idle'),
      footer:
        priorityData.totals.batteryPercent <= 20
          ? t('energy.historyCopy.reserveLow')
          : t('energy.historyCopy.storedAvailable'),
      icon: BatteryCharging,
      color: '#2dd4bf',
    });
  }
  if (priorityData?.dataCoverage.hasCost) {
    capabilityMetrics.push({
      id: 'cost',
      label: t('energy.historyWorkspace.energyCost'),
      period: t('energy.model.today'),
      value: formatEnergyValue(priorityData.totals.costToday),
      detail: t('energy.historyCopy.costSoFar'),
      footer:
        priorityData.totals.projectedMonthCost > 0
          ? t('energy.historyCopy.projectedMonth', {
              value: formatEnergyValue(priorityData.totals.projectedMonthCost),
            })
          : t('energy.historyCopy.projectionUnavailable'),
      icon: CircleDollarSign,
      color: '#a78bfa',
    });
  }
  const rangeMetrics: EnergyUsageMetric[] = [
    {
      id: 'energy',
      label: t('energy.historyWorkspace.energyUsed'),
      period: periodLabel,
      value: model ? `${formatEnergyValue(metricEnergyKWh)} kWh` : '—',
      detail: detailLabel,
      footer: energyComparison,
      icon: Gauge,
      color: selectedSourceColor,
    },
    {
      id: 'low',
      label: t('energy.historyWorkspace.lowUsage'),
      period: periodLabel,
      value: lowestEnergyBucket ? `${formatEnergyValue(lowestEnergyBucket.energyKWh)} kWh` : '—',
      detail: lowestEnergyBucket
        ? formatOccurrence(
            lowestEnergyBucket.startMs,
            lowestEnergyBucket.endMs,
            'lowest',
            locale,
            t
          )
        : detailLabel,
      footer: formatRelativeToAverage(
        lowestEnergyBucket?.energyKWh ?? 0,
        averageBucketEnergyKWh,
        'below',
        energyBucketAverageLabel,
        t
      ),
      icon: TrendingDown,
      color: '#38bdf8',
    },
    {
      id: 'average',
      label: t('energy.historyWorkspace.averageUsage'),
      period: periodLabel,
      value: model ? `${formatEnergyValue(averageBucketEnergyKWh)} kWh` : '—',
      detail: t('energy.historyCopy.averageTitle', {
        period: capitalizeFirst(t(`energy.historyCopy.${energyBucketUnit}`)),
      }),
      footer: model
        ? t('energy.historyCopy.energyAcross', {
            value: formatEnergyValue(model.totalEnergyKWh),
            duration: formatBucketCount(observedEnergyBuckets.length, energyBucketUnit, locale, t),
          })
        : t('energy.historyCopy.historyLoading'),
      icon: Gauge,
      color: '#2dd4bf',
    },
    {
      id: 'peak',
      label: t('energy.historyWorkspace.peakUsage'),
      period: periodLabel,
      value: highestEnergyBucket ? `${formatEnergyValue(highestEnergyBucket.energyKWh)} kWh` : '—',
      detail: highestEnergyBucket
        ? formatOccurrence(
            highestEnergyBucket.startMs,
            highestEnergyBucket.endMs,
            'highest',
            locale,
            t
          )
        : detailLabel,
      footer: formatRelativeToAverage(
        highestEnergyBucket?.energyKWh ?? 0,
        averageBucketEnergyKWh,
        'above',
        energyBucketAverageLabel,
        t
      ),
      icon: TrendingUp,
      color: '#fb923c',
    },
  ];
  const providerUsageMetrics = providerKpiMetrics.map((metric) => toProviderUsageMetric(metric, t));
  const automaticProviderMetrics = providerKpiMetrics
    .filter((metric) => metric.kind === 'prepaid')
    .map((metric) => toProviderUsageMetric(metric, t));
  const selectableUsageMetrics = uniqueUsageMetrics([
    ...providerUsageMetrics,
    ...capabilityMetrics,
    ...genericLiveMetrics,
    ...rangeMetrics,
  ]);
  const automaticUsageMetrics = uniqueUsageMetrics(
    isLiveChart
      ? [
          ...automaticProviderMetrics,
          ...(capabilityMetrics.length > 0
            ? [...capabilityMetrics, ...genericLiveMetrics.slice(1), genericLiveMetrics[0]]
            : genericLiveMetrics),
        ]
      : [...automaticProviderMetrics, ...rangeMetrics]
  ).slice(0, 4);
  const currentKpiPreference = normalizeEnergyKpiPreference(
    kpiPreferences.shared ?? kpiPreferences.byProvider[currentProviderId]
  );
  const usageMetrics =
    currentKpiPreference.mode === 'custom'
      ? resolveSelectedUsageMetrics(currentKpiPreference.metricIds, selectableUsageMetrics, t)
      : automaticUsageMetrics;
  const updateKpiPreference = (nextPreference: EnergyKpiPreference) => {
    setKpiPreferences((current) => ({
      version: 1,
      shared: nextPreference,
      byProvider: {
        ...(current?.version === 1 ? current.byProvider : {}),
      },
    }));
  };
  const detailCardClassName = useBentoLayout ? 'order-10 col-span-4 row-span-2 min-w-0' : 'min-w-0';
  const selectedBucket = isLiveChart ? null : (model?.selectedBucket ?? null);
  const selectedBucketUnit = t(
    `energy.historyCopy.${getEnergyBucketUnit(selectedBucket ?? undefined)}`
  );
  const selectedBucketCost =
    selectedBucket &&
    priorityData?.dataCoverage.hasCost &&
    priorityData.totals.costToday > 0 &&
    isSameLocalDate(selectedBucket.startMs, Date.now())
      ? priorityData.totals.costToday
      : undefined;

  const usageCard = (
    <BaseCard
      size="extra-large"
      fullBleed
      surfaceVariant="muted"
      className={cn('h-full min-w-0 w-full overflow-hidden', useBentoLayout && 'h-full')}
      data-testid="energy-usage-card"
      data-overview-module="usage"
      style={useBentoLayout ? undefined : mainCardStyle}
      title={
        selectedBucket
          ? t('energy.historyWorkspace.selected', { period: selectedBucketUnit })
          : t('energy.historyWorkspace.usage')
      }
      subtitle={
        isLiveChart
          ? t('energy.historyWorkspace.liveDemand')
          : selectedBucket
            ? formatTimeWindow(selectedBucket.startMs, selectedBucket.endMs, locale)
            : t('energy.historyWorkspace.inspectPeriod', { period: historyPeriodContext })
      }
      headerLayout="title-first"
      headerLeading={
        selectedBucket ? (
          <div className="flex items-start gap-1.5">
            <Button
              iconOnly
              label={t('energy.historyWorkspace.backToChart')}
              size="compact"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setSelectedBucketIndex(null)}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <EntityCardHeaderIcon
              IconComponent={Gauge}
              isActive
              size="extra-large"
              baseColor={selectedSourceColor}
            />
          </div>
        ) : (
          <EntityCardHeaderIcon
            IconComponent={TrendingUp}
            isActive
            size="extra-large"
            baseColor={selectedSourceColor}
          />
        )
      }
      headerTrailing={
        selectedBucket ? undefined : (
          <div
            className="flex min-w-0 flex-row items-center justify-between gap-2 sm:justify-start"
            data-testid="energy-usage-toolbar"
          >
            {!isLiveChart && historyNavigationUnit ? (
              <fieldset className="order-2 m-0 flex min-w-0 flex-1 items-center justify-end gap-0.5 border-0 p-0 sm:order-1 sm:flex-none sm:gap-1">
                <legend className="sr-only">
                  {t('energy.historyWorkspace.displayed', { period: historyNavigationUnit })}
                </legend>
                <Button
                  iconOnly
                  label={t('energy.historyWorkspace.previous', {
                    period: historyNavigationUnit,
                  })}
                  size="compact"
                  variant="ghost"
                  className="h-9 w-9 shrink-0"
                  onClick={() =>
                    onReferenceDateChange(shiftHistoryReference(insightsRange, referenceDateMs, -1))
                  }
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate px-0.5 text-center text-[11px] font-semibold tabular-nums sm:min-w-28 sm:flex-none sm:px-1 sm:text-xs',
                    surface.textPrimary
                  )}
                >
                  {historyPeriodContext}
                </span>
                <Button
                  iconOnly
                  label={t('energy.historyWorkspace.next', { period: historyNavigationUnit })}
                  size="compact"
                  variant="ghost"
                  className="h-9 w-9 shrink-0"
                  disabled={isCurrentHistoryPeriod}
                  onClick={() =>
                    onReferenceDateChange(shiftHistoryReference(insightsRange, referenceDateMs, 1))
                  }
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </fieldset>
            ) : null}
            <nav
              className="order-1 flex shrink-0 gap-1 sm:order-2 sm:gap-1.5"
              aria-label={t('energy.historyWorkspace.view')}
            >
              <InteractivePill
                active={isLiveChart}
                aria-pressed={isLiveChart}
                size="compact"
                className="px-2.5 sm:px-3"
                onClick={() => {
                  setChartMode('live');
                  setSelectedBucketIndex(null);
                }}
              >
                {t('energy.range.live')}
              </InteractivePill>
              <InteractivePill
                active={!isLiveChart}
                aria-pressed={!isLiveChart}
                size="compact"
                className="px-2.5 sm:px-3"
                onClick={() => {
                  setChartMode('insights');
                  setSelectedBucketIndex(null);
                }}
              >
                {t(RANGE_LABELS[insightsRange])}
              </InteractivePill>
            </nav>
          </div>
        )
      }
      headerClassName={
        selectedBucket
          ? 'px-3 pt-3'
          : 'flex-wrap px-3 pt-3 [&>div:last-child]:w-full [&>div:last-child]:basis-full lg:flex-nowrap lg:[&>div:last-child]:w-auto lg:[&>div:last-child]:basis-auto'
      }
      headerMarginBottomClassName="mb-3"
    >
      <div className="flex h-full min-h-0 flex-col">
        {!isLiveChart && !selectedBucket && shouldShowSourceSelector ? (
          <div className="scrollbar-hide flex gap-1.5 overflow-x-auto px-3 pb-3">
            {availableSources.map((source) => (
              <InteractivePill
                key={source.id}
                active={selectedSource?.id === source.id}
                aria-pressed={selectedSource?.id === source.id}
                size="compact"
                onClick={() => {
                  setSelectedSourceId(source.id);
                  setSelectedBucketIndex(null);
                }}
              >
                {source.label}
              </InteractivePill>
            ))}
          </div>
        ) : null}

        {isLiveChart ? (
          <>
            {!useBentoLayout ? <HistoryMetricRow metrics={usageMetrics} /> : null}
            {livePoints.length >= 2 ? (
              <div className="relative min-h-0 flex-1">
                <div className="absolute inset-x-0 top-2 bottom-0 overflow-visible">
                  <EnergySparkline
                    data={livePoints}
                    accentColor={selectedSourceColor}
                    height={52}
                    className="h-full w-full"
                    showYAxisMarks
                    showPowerRange
                    fillOpacity={0.12}
                    padX={0}
                    strokeWidth={1}
                    valueKind="power"
                  />
                </div>
                <div
                  className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-between gap-3 px-3 pb-3 text-xs ${surface.textMuted}`}
                >
                  {livePoints
                    .filter((_, index) => liveTickIndexes.has(index))
                    .map((point, index) => (
                      <span
                        key={`${point.timestampMs ?? point.label}-${index}`}
                        className="min-w-0 flex-1 truncate text-center first:text-left last:text-right"
                      >
                        {point.label}
                      </span>
                    ))}
                </div>
              </div>
            ) : (
              <div
                className={`m-3 flex min-h-32 flex-1 items-center justify-center rounded-2xl border border-dashed px-4 text-center text-sm ${surface.border} ${surface.textMuted}`}
              >
                {t('energy.historyWorkspace.liveEmpty')}
              </div>
            )}
          </>
        ) : isLoading ? (
          <div className="flex min-h-64 flex-1 items-center justify-center">
            <EnergyLoadingIndicator />
          </div>
        ) : error ? (
          <div
            className={`flex min-h-64 flex-1 items-center justify-center px-6 text-sm ${surface.textSecondary}`}
          >
            {t('energy.historyWorkspace.historyError')}
          </div>
        ) : !model || chartData.length === 0 ? (
          <div
            className={`flex min-h-64 flex-1 items-center justify-center px-6 text-center text-sm ${surface.textSecondary}`}
          >
            {t('energy.historyWorkspace.historyEmpty')}
          </div>
        ) : selectedBucket ? (
          <SelectedPeriodView
            bucket={selectedBucket}
            contributions={model.deviceBreakdown}
            untrackedEnergyKWh={model.untrackedEnergyKWh}
            isBreakdownLoading={isBreakdownLoading}
            showDeviceBreakdown={selectedSource?.id === 'home'}
            periodCost={selectedBucketCost}
          />
        ) : (
          <>
            {!useBentoLayout ? <HistoryMetricRow metrics={usageMetrics} /> : null}
            <div className="mx-3 mb-3 flex min-h-0 flex-1 flex-col pt-2">
              <div className="min-h-0 flex-1">
                <EnergyHistoryBarChart
                  data={chartData}
                  showPowerRange={selectedSource?.valueKind === 'power'}
                  accentColor={selectedSourceColor}
                  ariaLabel={t('energy.history.usageByPeriod')}
                  className="h-full w-full"
                  selectionDetailsId="energy-selected-period-details"
                  selectedIndex={selectedBucketIndex}
                  onSelectedIndexChange={setSelectedBucketIndex}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </BaseCard>
  );

  return (
    <>
      <div
        className={useBentoLayout ? 'contents' : 'space-y-3'}
        data-testid="energy-history-workspace"
      >
        {useBentoLayout ? (
          <EnergyCardArrangement
            cards={[
              ...(kpisHidden ? [] : usageMetrics).map((metric, index) => ({
                id: `kpi:${metric.id}`,
                name: metric.label,
                size: 'small' as const,
                style: { gridColumn: `span ${metricCardSpans[index] ?? 2}`, gridRow: 'span 2' },
                content: <EnergyUsageMetricCard metric={metric} compactHeader={isPhone} />,
                editActions: (
                  <CardEditActionButton
                    cardSize="small"
                    Icon={Pencil}
                    inline
                    theme={theme}
                    aria-label={t('common.editItem', { item: metric.label })}
                    onClick={() => setEditingKpiIndex(index)}
                  />
                ),
              })),
              {
                id: 'usage',
                name: t('energy.historyWorkspace.usage'),
                size: 'extra-large' as const,
                style: { ...mainCardStyle, gridRow: 'span 4' },
                content: usageCard,
              },
            ]}
            order={usageCardOrder}
            isEditMode={isEditMode}
            onOrderChange={(ids) =>
              setUsageCardOrder((current) => [...ids, ...current.filter((id) => !ids.includes(id))])
            }
          />
        ) : null}
        {!useBentoLayout ? usageCard : null}

        {model && chartData.length > 0 && selectedSource?.id !== 'home' ? (
          <section
            className={cn(useBentoLayout ? 'contents' : 'grid gap-3 lg:grid-cols-2')}
            aria-label={t('energy.historyWorkspace.selectedDetails')}
          >
            <BaseCard
              size="medium"
              className={detailCardClassName}
              disableDefaultSheen={theme !== 'light'}
              contentClassName="flex min-h-0 items-end"
              title={t('energy.historyWorkspace.sourceSummary', {
                source: selectedSource?.label ?? t('media.source'),
              })}
              subtitle={detailLabel}
              headerLayout="eyebrow-first"
              headerTitleOverflow="wrap"
              headerTone="neutral"
              headerLeading={
                <EntityCardHeaderIcon
                  IconComponent={Gauge}
                  isActive
                  size="medium"
                  baseColor={selectedSourceColor}
                />
              }
            >
              <SmallSensorDisplay
                size="medium"
                textPrimaryColor={sourceSummaryText.titleColor}
                textSecondaryColor={sourceSummaryText.subtitleColor}
                sensors={[
                  {
                    id: 'total',
                    label: t('energy.band.eyebrow'),
                    value: formatEnergyValue(metricEnergyKWh),
                    unit: 'kWh',
                    icon: 'zap',
                  },
                  {
                    id: 'average',
                    label: t('energy.history.average'),
                    value: formatPowerValue(metricAveragePowerW),
                    unit: '',
                    icon: 'gauge',
                  },
                  {
                    id: 'low',
                    label: t('energy.history.low'),
                    value: formatPowerValue(metricLowPowerW),
                    unit: '',
                    icon: 'trend-down',
                  },
                  {
                    id: 'peak',
                    label: t('energy.dashboard.mode.peak'),
                    value: formatPowerValue(metricPeakPowerW),
                    unit: '',
                    icon: 'trend-up',
                  },
                ]}
              />
            </BaseCard>
          </section>
        ) : null}
      </div>

      <AddEntityDialogPrimitive
        open={editingKpiIndex !== null}
        onClose={() => setEditingKpiIndex(null)}
        title={t('energy.historyWorkspace.kpis')}
        actionLabel={t('common.save')}
        currentRoom=""
        libraryOnly
        libraryCards={selectableUsageMetrics
          .filter(
            (metric) =>
              !usageMetrics.some(
                (selected, index) => selected.id === metric.id && index !== editingKpiIndex
              )
          )
          .map((metric) => ({
            id: metric.id,
            title: metric.label,
            subtitle: metric.detail,
            meta: metric.value,
            kind: 'widget' as const,
            icon: metric.icon,
            entityType: 'energy',
            entityTypeLabel: t('homeSummary.energy'),
          }))}
        onAddCard={() => {}}
        onAddLibraryCard={(id) => {
          if (editingKpiIndex === null) return;
          const metricIds = usageMetrics.map((metric, index) =>
            index === editingKpiIndex ? id : metric.id
          );
          updateKpiPreference({ mode: 'custom', metricIds });
          setUsageCardOrder((current) =>
            current.map((cardId) =>
              cardId === `kpi:${usageMetrics[editingKpiIndex]?.id}` ? `kpi:${id}` : cardId
            )
          );
          setEditingKpiIndex(null);
        }}
      />
    </>
  );
}

function toProviderUsageMetric(metric: EnergyProviderKpiMetric, t: TranslateFn): EnergyUsageMetric {
  const isUnavailable = metric.availability === 'unavailable';
  const icon =
    metric.kind === 'prepaid'
      ? WalletCards
      : metric.kind === 'cost'
        ? CircleDollarSign
        : metric.kind === 'power'
          ? Zap
          : Gauge;
  const color =
    metric.kind === 'prepaid' || metric.kind === 'cost'
      ? '#a78bfa'
      : metric.kind === 'power'
        ? '#fb923c'
        : '#2dd4bf';
  const detail =
    metric.kind === 'prepaid'
      ? t('energy.historyCopy.prepaidRemaining')
      : metric.kind === 'cost'
        ? t('energy.historyCopy.providerCost')
        : metric.kind === 'power'
          ? t('energy.historyCopy.providerPower')
          : t('energy.historyCopy.providerEnergy');

  return {
    id: metric.id,
    label: metric.label,
    period: t('energy.range.live'),
    value: isUnavailable ? '—' : [metric.value, metric.unit].filter(Boolean).join(' '),
    detail: isUnavailable ? t('energy.historyCopy.providerUnavailable') : detail,
    footer: metric.room
      ? t('energy.historyCopy.reportedRoom', { room: metric.room })
      : t('energy.historyCopy.reportedProvider'),
    icon,
    color,
  };
}

function uniqueUsageMetrics(metrics: EnergyUsageMetric[]) {
  const byId = new Map<string, EnergyUsageMetric>();
  metrics.forEach((metric) => {
    if (!byId.has(metric.id)) byId.set(metric.id, metric);
  });
  return [...byId.values()];
}

function normalizeEnergyKpiPreference(
  preference: EnergyKpiPreference | undefined
): EnergyKpiPreference {
  const metricIds = [...new Set(preference?.metricIds ?? [])];
  if (
    preference?.mode === 'custom' &&
    Array.isArray(preference.metricIds) &&
    metricIds.length === 4
  ) {
    return { mode: 'custom', metricIds };
  }
  return { mode: 'auto', metricIds: [] };
}

function resolveSelectedUsageMetrics(
  selectedMetricIds: string[],
  metrics: EnergyUsageMetric[],
  t: TranslateFn
): EnergyUsageMetric[] {
  const metricsById = new Map(metrics.map((metric) => [metric.id, metric]));
  return selectedMetricIds.map(
    (metricId) =>
      metricsById.get(metricId) ?? {
        id: metricId,
        label: t('energy.historyWorkspace.unavailableMetric'),
        period: t('common.unavailable'),
        value: '—',
        detail: t('energy.historyCopy.readingUnavailable'),
        footer: t('energy.historyCopy.chooseKpi'),
        icon: Gauge,
        color: '#94a3b8',
      }
  );
}

function EnergyUsageMetricCard({
  metric,
  gridColumnSpan,
  compactHeader,
}: {
  metric: EnergyUsageMetric;
  gridColumnSpan?: number;
  compactHeader: boolean;
}) {
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);

  return (
    <BaseCard
      size="small"
      surfaceVariant="muted"
      className="h-full col-span-2 row-span-2 min-w-0"
      title={metric.label}
      subtitle={metric.period}
      headerCompact={compactHeader}
      headerLayout="title-first"
      headerLeading={
        <EntityCardHeaderIcon
          IconComponent={metric.icon}
          isActive
          size={compactHeader ? 'extra-small' : 'small'}
          baseColor={metric.color}
        />
      }
      data-testid={`energy-usage-metric-${metric.id}`}
      data-overview-module="usage-metric"
      style={
        gridColumnSpan
          ? { gridColumn: `span ${gridColumnSpan} / span ${gridColumnSpan}` }
          : undefined
      }
    >
      <div className="flex h-full min-w-0 flex-col">
        <div className={`text-2xl font-semibold tabular-nums ${surface.textPrimary}`}>
          {metric.value}
        </div>
        <p className={`mt-0.5 line-clamp-2 text-[11px] ${surface.textSecondary}`}>
          {metric.detail}
        </p>
        <div
          className={cn(
            'mt-auto border-t pt-2 text-[11px] font-medium leading-snug',
            surface.border,
            surface.textPrimary
          )}
        >
          {metric.footer}
        </div>
      </div>
    </BaseCard>
  );
}

function resolveMetricCardSpans(metricRowSpan?: number) {
  if (!metricRowSpan || metricRowSpan < 8) return [2, 2, 2, 2];
  const baseSpan = Math.floor(metricRowSpan / 4);
  const remainder = metricRowSpan % 4;
  return Array.from({ length: 4 }, (_, index) => baseSpan + (index < remainder ? 1 : 0));
}

function HistoryMetricRow({ metrics }: { metrics: EnergyUsageMetric[] }) {
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);

  return (
    <div className={cn('grid grid-cols-2 border-y lg:grid-cols-4', surface.border)}>
      {metrics.map((metric) => (
        <HistoryMetric
          key={metric.id}
          label={metric.label}
          value={metric.value}
          icon={metric.icon}
          color={metric.color}
        />
      ))}
    </div>
  );
}

function HistoryMetric({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  color: string;
}) {
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 px-4 py-3 border-r border-b lg:border-b-0 last:border-r-0',
        surface.border
      )}
    >
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full"
        style={{ color, backgroundColor: `${color}14` }}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <div>
        <div className={`text-sm font-semibold tabular-nums ${surface.textPrimary}`}>{value}</div>
        <div className={`text-[10px] ${surface.textSecondary}`}>{label}</div>
      </div>
    </div>
  );
}

function SelectedPeriodView({
  bucket,
  contributions,
  untrackedEnergyKWh,
  isBreakdownLoading,
  showDeviceBreakdown,
  periodCost,
}: {
  bucket: EnergyHistoryBucket;
  contributions: EnergyHistoryContribution[];
  untrackedEnergyKWh: number;
  isBreakdownLoading: boolean;
  showDeviceBreakdown: boolean;
  periodCost?: number;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const metrics: SelectedPeriodMetricData[] = bucket.hasData
    ? [
        {
          id: 'average',
          label: t('energy.history.average'),
          value: formatPowerValue(bucket.averagePowerW),
          icon: Gauge,
          color: '#2dd4bf',
        },
        {
          id: 'low',
          label: t('energy.history.low'),
          value: formatPowerValue(bucket.lowPowerW),
          icon: TrendingDown,
          color: '#38bdf8',
        },
        {
          id: 'peak',
          label: t('energy.dashboard.mode.peak'),
          value: formatPowerValue(bucket.peakPowerW),
          icon: TrendingUp,
          color: '#fb923c',
        },
      ]
    : [];

  return (
    <section
      id="energy-selected-period-details"
      className="flex min-h-0 flex-1 flex-col"
      aria-label={t('energy.historyWorkspace.selectedPeriodDetails')}
      aria-live="polite"
      data-testid="energy-selected-period-details"
    >
      {bucket.hasData ? (
        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:grid-cols-[minmax(16rem,0.75fr)_minmax(0,1.25fr)] sm:grid-rows-1">
          <div className="relative flex min-w-0 flex-col p-3">
            <div
              className={cn(
                'pointer-events-none absolute inset-x-3 bottom-0 border-b sm:inset-x-auto sm:inset-y-3 sm:right-0 sm:border-r sm:border-b-0',
                surface.border
              )}
              data-testid="energy-selected-period-divider"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <h3 className={`text-xs font-semibold ${surface.textPrimary}`}>
                {t('energy.historyWorkspace.energyUsed')}
              </h3>
              <p className={`mt-0.5 text-[11px] ${surface.textSecondary}`}>
                {t('energy.historyWorkspace.recordedTotal')}
              </p>
            </div>
            <div className={`mt-4 text-3xl font-semibold tabular-nums ${surface.textPrimary}`}>
              {formatEnergyValue(bucket.energyKWh)} kWh
            </div>
            {typeof periodCost === 'number' ? (
              <div
                className={`mt-0.5 flex items-center gap-1.5 text-[11px] ${surface.textSecondary}`}
              >
                <CircleDollarSign className="h-3 w-3" aria-hidden="true" />
                <span>
                  {t('energy.historyWorkspace.recordedCost')}{' '}
                  <strong className={`font-semibold tabular-nums ${surface.textPrimary}`}>
                    {formatEnergyValue(periodCost)}
                  </strong>
                </span>
              </div>
            ) : null}

            <dl
              className="mt-auto grid shrink-0 grid-cols-3 gap-2 pt-4"
              data-testid="energy-selected-period-metrics"
            >
              {metrics.map((metric) => (
                <SelectedPeriodMetric key={metric.id} metric={metric} />
              ))}
            </dl>
          </div>

          <div
            className="min-h-0 overflow-hidden p-3"
            data-testid="energy-selected-period-device-panel"
          >
            <SelectedPeriodDeviceBreakdown
              totalEnergyKWh={bucket.energyKWh}
              contributions={contributions}
              untrackedEnergyKWh={untrackedEnergyKWh}
              isLoading={isBreakdownLoading}
              isAvailable={showDeviceBreakdown}
            />
          </div>
        </div>
      ) : (
        <p className={`px-3 py-5 text-sm ${surface.textSecondary}`}>
          {t('energy.historyWorkspace.chooseBar')}
        </p>
      )}
    </section>
  );
}

function SelectedPeriodDeviceBreakdown({
  totalEnergyKWh,
  contributions,
  untrackedEnergyKWh,
  isLoading,
  isAvailable,
}: {
  totalEnergyKWh: number;
  contributions: EnergyHistoryContribution[];
  untrackedEnergyKWh: number;
  isLoading: boolean;
  isAvailable: boolean;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const trackedEnergyKWh = contributions.reduce((total, item) => total + item.energyKWh, 0);
  const contributionTotalKWh = Math.max(totalEnergyKWh, trackedEnergyKWh + untrackedEnergyKWh);
  const subtleFill =
    theme === 'light'
      ? '#f3f4f6'
      : theme === 'black'
        ? 'rgba(255,255,255,0.05)'
        : 'rgba(255,255,255,0.08)';
  const rows = [
    ...contributions,
    ...(untrackedEnergyKWh > 0
      ? [
          {
            id: 'untracked',
            name: t('energy.historyWorkspace.untracked'),
            energyKWh: untrackedEnergyKWh,
            averagePowerW: 0,
            share: totalEnergyKWh > 0 ? untrackedEnergyKWh / totalEnergyKWh : 0,
          },
        ]
      : []),
  ].sort((left, right) => right.energyKWh - left.energyKWh);
  const rankedRows = rows.map((row) => ({
    ...row,
    displayShare: contributionTotalKWh > 0 ? row.energyKWh / contributionTotalKWh : 0,
    color: colorForContribution(row.id),
  }));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h3 className={`text-xs font-semibold ${surface.textPrimary}`}>
            {t('energy.historyWorkspace.topUsage')}
          </h3>
          <p className={`mt-0.5 text-[11px] ${surface.textSecondary}`}>
            {t('energy.historyWorkspace.rankedUsage')}
          </p>
        </div>
        {rows.length > 0 ? (
          <span className={`text-[10px] ${surface.textMuted}`}>
            {t('energy.historyWorkspace.contributors', { count: rows.length })}
          </span>
        ) : null}
      </div>

      <OverlayScrollArea
        className="mt-4 flex min-h-0 flex-1 flex-col"
        viewportProps={{ 'data-testid': 'energy-selected-period-device-scroll' }}
        contentClassName="flex min-h-full flex-col pr-3"
      >
        {isLoading ? (
          <div className="flex h-full min-h-20 items-center justify-center">
            <EnergyLoadingIndicator />
          </div>
        ) : !isAvailable ? (
          <p className={`py-4 text-xs leading-5 ${surface.textSecondary}`}>
            {t('energy.historyWorkspace.contributionUnavailable')}
          </p>
        ) : rows.length === 0 ? (
          <p className={`py-4 text-xs leading-5 ${surface.textSecondary}`}>
            {t('energy.historyWorkspace.deviceHistoryEmpty')}
          </p>
        ) : (
          <div className="min-w-0">
            {rankedRows.length > 0 ? (
              <div className="grid min-w-0 grid-cols-1 gap-x-8 gap-y-3.5 sm:grid-cols-2">
                {rankedRows.map((row) => (
                  <SelectedPeriodContributionRow
                    key={row.id}
                    row={row}
                    subtleFill={subtleFill}
                    textPrimary={surface.textPrimary}
                    textSecondary={surface.textSecondary}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </OverlayScrollArea>
    </div>
  );
}

interface SelectedPeriodContributionRowData {
  id: string;
  name: string;
  energyKWh: number;
  displayShare: number;
  color: string;
}

function SelectedPeriodContributionRow({
  row,
  subtleFill,
  textPrimary,
  textSecondary,
}: {
  row: SelectedPeriodContributionRowData;
  subtleFill: string;
  textPrimary: string;
  textSecondary: string;
}) {
  const share = Math.round(row.displayShare * 100);

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <Zap className="h-4 w-4 shrink-0" style={{ color: row.color }} aria-hidden="true" />
        <span className={`min-w-0 flex-1 truncate text-sm font-medium ${textPrimary}`}>
          {row.name}
        </span>
        <span className={`shrink-0 text-sm font-semibold tabular-nums ${textPrimary}`}>
          {formatEnergyValue(row.energyKWh)} kWh
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-3 pl-[1.625rem]">
        <div
          className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full"
          style={{ backgroundColor: subtleFill }}
          aria-hidden="true"
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.max(2, row.displayShare * 100)}%`, backgroundColor: row.color }}
          />
        </div>
        <span className={`w-8 shrink-0 text-right text-[11px] tabular-nums ${textSecondary}`}>
          {share}%
        </span>
      </div>
    </div>
  );
}

function colorForContribution(id: string) {
  if (id === 'untracked') return '#94a3b8';
  const colors = ['#3b82f6', '#f59e0b', '#10b981', '#d946ef', '#8b5cf6'];
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

interface SelectedPeriodMetricData {
  id: string;
  label: string;
  value: string;
  icon: LucideIcon;
  color: string;
}

function SelectedPeriodMetric({ metric }: { metric: SelectedPeriodMetricData }) {
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const Icon = metric.icon;
  const containerSurface = theme === 'black' ? 'bg-white/[0.04]' : surface.subtleBg;

  return (
    <div className={cn('min-w-0 rounded-xl border px-2.5 py-2', surface.border, containerSurface)}>
      <dt className="flex items-center gap-1.5">
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
          style={{ color: metric.color, backgroundColor: `${metric.color}14` }}
        >
          <Icon className="h-3 w-3" aria-hidden="true" />
        </span>
        <span className={`truncate text-[11px] font-medium ${surface.textSecondary}`}>
          {metric.label}
        </span>
      </dt>
      <dd className={cn('mt-1 text-base font-semibold tabular-nums', surface.textPrimary)}>
        {metric.value}
      </dd>
    </div>
  );
}

function isSameLocalDate(leftMs: number, rightMs: number) {
  const left = new Date(leftMs);
  const right = new Date(rightMs);
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function getHistoryNavigationUnit(range: EnergyHistoryRange) {
  if (range === 'custom') return null;
  return range === 'today' ? 'day' : range;
}

function isSameHistoryPeriod(range: EnergyHistoryRange, leftMs: number, rightMs: number) {
  const left = new Date(leftMs);
  const right = new Date(rightMs);
  if (range === 'year') return left.getFullYear() === right.getFullYear();
  if (range === 'month') {
    return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
  }
  return isSameLocalDate(leftMs, rightMs);
}

function shiftHistoryReference(range: EnergyHistoryRange, timestampMs: number, direction: -1 | 1) {
  const date = new Date(timestampMs);
  if (range === 'year') {
    return new Date(date.getFullYear() + direction, 0, 1, 12).getTime();
  }
  if (range === 'month') {
    return new Date(date.getFullYear(), date.getMonth() + direction, 1, 12).getTime();
  }
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + direction * (range === 'week' ? 7 : 1));
  return date.getTime();
}

function formatHistoryPeriodContext(
  range: EnergyHistoryRange,
  window: EnergyHistoryWindow,
  locale: string,
  t: TranslateFn
) {
  if (range === 'today') {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(window.startMs));
  }

  if (range === 'week') {
    const start = new Date(window.startMs);
    const end = new Date(window.endMs - 1);
    const formatter = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
    });
    if (start.getFullYear() === end.getFullYear()) {
      return `${formatter.format(start)}–${formatter.format(end)}, ${end.getFullYear()}`;
    }
    const formatterWithYear = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `${formatterWithYear.format(start)}–${formatterWithYear.format(end)}`;
  }

  if (range === 'month') {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
      new Date(window.startMs)
    );
  }

  if (range === 'year') {
    return String(new Date(window.startMs).getFullYear());
  }

  return t(RANGE_LABELS[range]);
}

function formatPowerValue(powerW: number) {
  return Math.abs(powerW) >= 1000
    ? `${formatEnergyValue(powerW / 1000)} kW`
    : `${Math.round(powerW)} W`;
}

function findLowestPowerBucket(buckets: EnergyHistoryBucket[]) {
  return buckets
    .filter((bucket) => bucket.hasData)
    .reduce<EnergyHistoryBucket | null>(
      (lowest, bucket) => (!lowest || bucket.lowPowerW < lowest.lowPowerW ? bucket : lowest),
      null
    );
}

function findLowestEnergyBucket(buckets: EnergyHistoryBucket[]) {
  return buckets.reduce<EnergyHistoryBucket | null>(
    (lowest, bucket) => (!lowest || bucket.energyKWh < lowest.energyKWh ? bucket : lowest),
    null
  );
}

function findHighestEnergyBucket(buckets: EnergyHistoryBucket[]) {
  return buckets.reduce<EnergyHistoryBucket | null>(
    (highest, bucket) => (!highest || bucket.energyKWh > highest.energyKWh ? bucket : highest),
    null
  );
}

function getEnergyBucketUnit(
  bucket: EnergyHistoryBucket | undefined
): 'hour' | 'day' | 'month' | 'period' {
  if (!bucket) return 'period';
  const durationMs = bucket.endMs - bucket.startMs;
  if (durationMs < 60 * 60 * 1000) return 'period';
  if (durationMs <= 2 * 60 * 60 * 1000) return 'hour';
  if (durationMs <= 2 * 24 * 60 * 60 * 1000) return 'day';
  return 'month';
}

function formatBucketCount(count: number, unit: string, locale: string, t: TranslateFn) {
  if (unit === 'period')
    return count === 1
      ? `${count} ${t('energy.historyCopy.period')}`
      : t('energy.historyCopy.periods', { count });
  return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'long' }).format(count);
}

function capitalizeFirst(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function formatEnergyComparison(
  comparisonPercent: number | undefined,
  isToday: boolean,
  t: TranslateFn
) {
  if (typeof comparisonPercent !== 'number') return t('energy.historyCopy.comparisonUnavailable');
  const percent = Math.round(Math.abs(comparisonPercent) * 100);
  if (percent < 1)
    return t(
      isToday ? 'energy.historyCopy.comparisonSameToday' : 'energy.historyCopy.comparisonSamePeriod'
    );
  const key = isToday
    ? comparisonPercent < 0
      ? 'energy.historyCopy.comparisonLessToday'
      : 'energy.historyCopy.comparisonMoreToday'
    : comparisonPercent < 0
      ? 'energy.historyCopy.comparisonLessPeriod'
      : 'energy.historyCopy.comparisonMorePeriod';
  return t(key, { percent });
}

function formatRelativeToAverage(
  value: number,
  average: number,
  direction: 'above' | 'below',
  averageLabel: string,
  t: TranslateFn
) {
  if (average <= 0) return t('energy.historyCopy.averageUnavailable');
  const percent = Math.round((Math.abs(value - average) / average) * 100);
  return t(
    direction === 'above' ? 'energy.historyCopy.aboveAverage' : 'energy.historyCopy.belowAverage',
    { percent, average: averageLabel }
  );
}

function formatOccurrence(
  startMs: number,
  endMs: number,
  kind: 'lowest' | 'highest',
  locale: string,
  t: TranslateFn
) {
  const durationMs = endMs - startMs;
  if (durationMs <= 2 * 60 * 60 * 1000) {
    return t(
      kind === 'lowest' ? 'energy.historyCopy.lowestBetween' : 'energy.historyCopy.highestBetween',
      {
        start: new Date(startMs).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
        end: new Date(endMs).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
      }
    );
  }
  const daily = durationMs <= 2 * 24 * 60 * 60 * 1000;
  const key =
    kind === 'lowest'
      ? daily
        ? 'energy.historyCopy.lowestDay'
        : 'energy.historyCopy.lowestMonth'
      : daily
        ? 'energy.historyCopy.highestDay'
        : 'energy.historyCopy.highestMonth';
  return t(key, {
    date: new Date(startMs).toLocaleDateString(
      locale,
      daily
        ? { weekday: 'short', month: 'short', day: 'numeric' }
        : { month: 'long', year: 'numeric' }
    ),
  });
}

function formatTimeWindow(startMs: number, endMs: number, locale: string) {
  const start = new Date(startMs);
  const end = new Date(endMs);
  if (endMs - startMs > 2 * 60 * 60 * 1000 && endMs - startMs <= 27 * 60 * 60 * 1000) {
    return start.toLocaleDateString(locale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }
  const sameDay = start.toDateString() === end.toDateString();
  return sameDay
    ? `${start.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })}, ${start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}–${end.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`
    : `${start.toLocaleDateString(locale, { month: 'short', day: 'numeric' })}–${end.toLocaleDateString(locale, { month: 'short', day: 'numeric' })}`;
}
