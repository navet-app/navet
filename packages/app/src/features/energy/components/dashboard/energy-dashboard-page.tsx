import { useAuthBaseUrl } from '@navet/app/auth/AuthProvider';
import {
  BaseCard,
  InteractivePill,
  SheetSurface,
  SheetSurfaceHeader,
} from '@navet/app/components/primitives';
import { EntityCardHeaderIcon } from '@navet/app/components/primitives/entity-card-header-icon';
import { CardEditActionButton } from '@navet/app/components/shared/card-edit-action-button';
import { type CardSize, getCardSpanClass } from '@navet/app/components/shared/card-size-selector';
import {
  getInheritedDialogSectionStyle,
  withTintAlpha,
} from '@navet/app/components/shared/theme/custom-card-tint-surface';
import { themeColorValues } from '@navet/app/components/shared/theme/theme-colors';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import {
  getBaseCardRadiusClassName,
  getThemeFocusRingClassName,
} from '@navet/app/components/system/tokens';
import { cn } from '@navet/app/components/ui/utils';
import { STORAGE_KEYS } from '@navet/app/constants/storage-keys';
import { DashboardCardItem } from '@navet/app/features/dashboard/components/dashboard-card-item';
import { DashboardResizeTrigger } from '@navet/app/features/dashboard/components/dashboard-edit-actions';
import { useFitDashboardGrid } from '@navet/app/features/dashboard/hooks/use-fit-dashboard-grid';
import { useProgressiveBatching } from '@navet/app/features/dashboard/hooks/use-progressive-batching';
import type { CustomCard } from '@navet/app/features/dashboard/stores/custom-cards-store';
import { useEnergyLoadHistory } from '@navet/app/features/energy/hooks/use-energy-load-history';
import type {
  EnergyConsumer,
  EnergyDashboardModel,
  EnergyHistoryRange,
  EnergyHistorySource,
  EnergyRange,
  EnergySeriesPoint,
  EnergySourceDiagnostic,
} from '@navet/app/features/energy/types/energy.types';
import {
  formatEnergyPercent,
  formatEnergyValue,
} from '@navet/app/features/energy/utils/energy-formatters';
import type { HomeStatusSummaryItem } from '@navet/app/features/sensors/components/home-status-summary-model';
import { SummaryBar } from '@navet/app/features/sensors/components/info-badge-strip';
import { useI18n, useMediaQuery, useTheme } from '@navet/app/hooks';
import { useBreakpointCols } from '@navet/app/hooks/use-breakpoint-cols';
import { useDeferredVisibility } from '@navet/app/hooks/use-deferred-visibility';
import { usePersistedState } from '@navet/app/hooks/use-persisted-state';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import type {
  PlatformStatisticsHistoryRequest,
  PlatformStatisticsHistorySeries,
} from '@navet/app/platform/provider-feature-models';
import { settingsSelectors } from '@navet/app/stores/selectors';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import * as Popover from '@radix-ui/react-popover';
import {
  AlertTriangle,
  ExternalLink,
  EyeOff,
  Flame,
  Info,
  Leaf,
  PlugZap,
  Sun,
  X,
  Zap,
} from 'lucide-react';
import {
  type CSSProperties,
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import { EnergyNowCardView } from '../widgets/energy-now-card-view';
import { type EnergyArrangementCard, EnergyCardArrangement } from './energy-card-arrangement';
import { EnergyDetailedHistoryWorkspace } from './energy-detailed-history-workspace';
import {
  type EnergyOverviewModuleId,
  normalizeEnergyOverviewLayout,
  useEnergyOverviewLayout,
} from './energy-overview-layout';

interface EnergyDashboardPageProps {
  dashboard: EnergyDashboardModel;
  sourceDiagnostics: EnergySourceDiagnostic[];
  energyCustomCards?: CustomCard[];
  energyOrderedCardIds?: string[];
  isEditMode?: boolean;
  onDeleteCard?: (cardId: string) => void;
  onUpdateCard?: (cardId: string, updates: Partial<Omit<CustomCard, 'id' | 'createdAt'>>) => void;
  onRangeChange?: (range: EnergyRange) => void;
  currentLoadStatisticId?: string;
  historyStatisticsLoader?: (
    request: PlatformStatisticsHistoryRequest
  ) => Promise<PlatformStatisticsHistorySeries | null>;
  historySources?: EnergyHistorySource[];
}
const ENERGY_CONSUMER_COLORS = [
  '#3b82f6',
  '#f59e0b',
  '#10b981',
  '#d946ef',
  '#06b6d4',
  '#f43f5e',
  '#84cc16',
  '#8b5cf6',
  '#eab308',
  '#14b8a6',
] as const;
const UNTRACKED_CONSUMPTION_COLOR = '#94a3b8';
const ENERGY_INSIGHTS_RANGES: EnergyHistoryRange[] = ['today', 'week', 'month', 'year', 'custom'];
const ENERGY_INSIGHTS_RANGE_LABELS = {
  today: 'energy.range.day',
  week: 'energy.range.week',
  month: 'energy.range.month',
  year: 'energy.range.year',
  custom: 'common.custom',
} as const;
const EMPTY_ENERGY_SUMMARY_ITEMS: HomeStatusSummaryItem[] = [];
interface EnergyCustomRange {
  start: string;
  end: string;
}
const ENERGY_WHOLE_HOME_SPARKLINE_CARD_ID = 'energy:whole-home-sparkline';
const ENERGY_SPARKLINE_ALLOWED_SIZES: CardSize[] = ['small', 'medium', 'large'];
const LOAD_ORB_DRIFT_BASE_DURATION_S = 8.5;
const LOAD_ORB_DENSITY_HIGH = {
  ringCount: 5,
  spokeCount: 26,
  radiusStart: 84,
  radiusStep: 21,
} as const;
const LOAD_ORB_DENSITY_MEDIUM = {
  ringCount: 3,
  spokeCount: 20,
  radiusStart: 96,
  radiusStep: 32,
} as const;
const LOAD_ORB_DENSITY_LOW = {
  ringCount: 1,
  spokeCount: 26,
  radiusStart: 126,
  radiusStep: 0,
} as const;
const LOAD_ORB_RIPPLE_KEYFRAMES = `
  @keyframes navet-load-orb-water-drift {
    0%, 100% {
      opacity: var(--load-orb-dot-opacity);
      transform:
        translate(
          var(--load-orb-drift-x-negative),
          var(--load-orb-drift-y-negative)
        )
        scale(0.97);
    }

    50% {
      opacity: calc(var(--load-orb-dot-opacity) * 0.9);
      transform:
        translate(
          var(--load-orb-drift-x),
          var(--load-orb-drift-y)
        )
        scale(1.03);
    }
  }

  .navet-load-orb-dot {
    transform-box: fill-box;
    transform-origin: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .navet-load-orb-dot {
      animation: none !important;
      opacity: var(--load-orb-dot-opacity) !important;
      transform: none !important;
    }
  }
`;

export const EnergyDashboardPage = memo(function EnergyDashboardPage({
  dashboard,
  sourceDiagnostics,
  energyCustomCards = [],
  energyOrderedCardIds = [],
  isEditMode: controlledEditMode,
  onDeleteCard,
  onUpdateCard,
  onRangeChange,
  currentLoadStatisticId,
  historyStatisticsLoader,
  historySources,
}: EnergyDashboardPageProps) {
  const { t } = useI18n();
  const haBaseUrl = useAuthBaseUrl();
  const { theme, accentColor } = useTheme();
  const [uncontrolledEditMode] = useState(false);
  const [hiddenConsumerIds, setHiddenConsumerIds] = usePersistedState<string[]>(
    STORAGE_KEYS.energyHiddenConsumerIds,
    []
  );
  const [sparklineCardSizes, setSparklineCardSizes] = usePersistedState<Record<string, CardSize>>(
    STORAGE_KEYS.energySparklineCardSizes,
    {}
  );
  const [overviewLayout, setOverviewLayout] = useEnergyOverviewLayout();
  const [insightsRange, setInsightsRange] = useState<EnergyHistoryRange>(
    dashboard.selectedRange === 'now' ? 'today' : dashboard.selectedRange
  );
  const [insightsReferenceDateMs, setInsightsReferenceDateMs] = useState(() => Date.now());
  const [customRange, setCustomRange] = useState<EnergyCustomRange>(createDefaultEnergyCustomRange);
  const surface = getThemeSurfaceTokens(theme);
  const isPortraitTablet = useMediaQuery('(orientation: portrait) and (min-width: 768px)');
  const homeAssistantEnergyUrl = resolveHomeAssistantEnergyUrl(haBaseUrl);
  const isEditMode =
    typeof controlledEditMode === 'boolean' ? controlledEditMode : uncontrolledEditMode;
  const hiddenConsumerIdSet = useMemo(() => new Set(hiddenConsumerIds), [hiddenConsumerIds]);
  const energyCardsById = useMemo(
    () => new Map(energyCustomCards.map((card) => [card.id, card])),
    [energyCustomCards]
  );
  const orderedEnergyCustomCards = useMemo(() => {
    const orderedCards = energyOrderedCardIds
      .map((cardId) => energyCardsById.get(cardId))
      .filter((card): card is CustomCard => card !== undefined);

    const seenCardIds = new Set(orderedCards.map((card) => card.id));
    const remainingCards = energyCustomCards.filter((card) => !seenCardIds.has(card.id));

    return [...orderedCards, ...remainingCards];
  }, [energyCardsById, energyCustomCards, energyOrderedCardIds]);
  const visibleConsumers = useMemo(
    () => dashboard.topConsumers.filter((consumer) => !hiddenConsumerIdSet.has(consumer.id)),
    [dashboard.topConsumers, hiddenConsumerIdSet]
  );
  const filteredDashboard = useMemo(
    () => ({
      ...dashboard,
      topConsumers: visibleConsumers,
    }),
    [dashboard, visibleConsumers]
  );
  const liveWatts = Math.round(filteredDashboard.totals.currentLoadW);
  useEffect(() => {
    if (dashboard.selectedRange !== 'now') {
      setInsightsRange(dashboard.selectedRange);
      setInsightsReferenceDateMs(Date.now());
    }
  }, [dashboard.selectedRange]);
  const handleInsightsRangeChange = (range: EnergyHistoryRange) => {
    setInsightsRange(range);
    setInsightsReferenceDateMs(Date.now());
    if (range === 'today' || range === 'week' || range === 'month') {
      onRangeChange?.(range);
    }
  };
  const handleConsumerVisibilityChange = (consumerId: string, visible: boolean) => {
    setHiddenConsumerIds((previous) => {
      const nextSet = new Set(previous);
      if (visible) {
        nextSet.delete(consumerId);
      } else {
        nextSet.add(consumerId);
      }
      return [...nextSet];
    });
  };
  const updateSparklineCardSize = (cardId: string, size: CardSize) => {
    setSparklineCardSizes((previous) => ({ ...previous, [cardId]: size }));
  };
  const availableOverviewModules = useMemo(
    () => new Set<EnergyOverviewModuleId>(['live', 'devices']),
    []
  );
  const normalizedOverviewLayout = normalizeEnergyOverviewLayout(overviewLayout);
  const visibleOverviewModules = normalizedOverviewLayout.order.filter(
    (moduleId) =>
      availableOverviewModules.has(moduleId) && !normalizedOverviewLayout.hidden.includes(moduleId)
  );
  const overviewBreakpointCols = useBreakpointCols();
  const {
    gridStyle: overviewGridStyle,
    innerContainerStyle: overviewInnerContainerStyle,
    innerRef: overviewInnerRef,
    isAutoScaled: isOverviewAutoScaled,
    outerContainerStyle: overviewOuterContainerStyle,
    outerRef: overviewOuterRef,
    renderedGridCols: overviewRenderedGridCols,
  } = useFitDashboardGrid(overviewBreakpointCols);
  const overviewLiveSpan = isPortraitTablet
    ? overviewRenderedGridCols
    : Math.min(4, overviewRenderedGridCols);
  const overviewUsageSpan =
    isPortraitTablet || overviewRenderedGridCols <= 4
      ? overviewRenderedGridCols
      : overviewRenderedGridCols - overviewLiveSpan;
  const showOverviewModule = (moduleId: EnergyOverviewModuleId) => {
    setOverviewLayout((current) => {
      const normalized = normalizeEnergyOverviewLayout(current);
      return { ...normalized, hidden: normalized.hidden.filter((id) => id !== moduleId) };
    });
  };
  const renderOverviewModule = (moduleId: EnergyOverviewModuleId) => {
    if (moduleId === 'live') {
      return (
        <DeviceTable
          accentColor={accentColor}
          consumers={filteredDashboard.topConsumers}
          homeAssistantEnergyUrl={homeAssistantEnergyUrl}
          loadW={liveWatts}
          openLabel={t('common.open')}
          sourceDiagnostics={sourceDiagnostics}
          surface={surface}
          totalConsumptionTodayKWh={dashboard.ranges.today.totalUsageKWh}
          usePortraitLayout={isPortraitTablet}
        />
      );
    }
    return (
      <CompactLoadSparklines
        accentColor={accentColor}
        cardSizes={sparklineCardSizes}
        consumers={filteredDashboard.topConsumers}
        customCards={orderedEnergyCustomCards}
        isEditMode={isEditMode}
        onHideConsumer={(consumerId) => handleConsumerVisibilityChange(consumerId, false)}
        onDeleteCard={onDeleteCard}
        onSizeChange={updateSparklineCardSize}
        onUpdateCard={onUpdateCard}
        theme={theme}
        wholeHomeCurrentW={dashboard.totals.currentLoadW}
        wholeHomePoints={dashboard.ranges.now.liveConsumption}
        wholeHomeTodayKWh={dashboard.ranges.today.totalUsageKWh}
        embedded
      />
    );
  };
  const renderOverviewModuleFrame = (moduleId: EnergyOverviewModuleId) => {
    return (
      <EnergyOverviewModuleFrame
        key={moduleId}
        moduleId={moduleId}
        className={undefined}
        style={
          moduleId === 'live'
            ? {
                gridColumn: `span ${overviewLiveSpan} / span ${overviewLiveSpan}`,
                gridRow: isPortraitTablet ? 'span 5 / span 5' : 'span 8 / span 8',
              }
            : moduleId === 'devices'
              ? undefined
              : { gridColumn: `span ${overviewRenderedGridCols}` }
        }
      >
        {isEditMode && moduleId === 'live' ? (
          <div inert className="h-full pointer-events-none">
            {renderOverviewModule(moduleId)}
          </div>
        ) : (
          renderOverviewModule(moduleId)
        )}
      </EnergyOverviewModuleFrame>
    );
  };
  return (
    <div className="space-y-3">
      <SummaryBar
        items={EMPTY_ENERGY_SUMMARY_ITEMS}
        ariaLabel={t('homeSummary.energy')}
        leadingContent={
          <EnergyInsightsRangeControl
            range={insightsRange}
            onRangeChange={handleInsightsRangeChange}
            customRange={customRange}
            onApplyCustomRange={(nextRange) => {
              setCustomRange(nextRange);
              handleInsightsRangeChange('custom');
            }}
            onClearCustomRange={() => handleInsightsRangeChange('today')}
          />
        }
      />

      <div ref={overviewOuterRef} className="relative w-full" style={overviewOuterContainerStyle}>
        <div
          ref={overviewInnerRef}
          className={`w-full${isOverviewAutoScaled ? ' absolute left-0 top-0 origin-top-left' : ''}`}
          style={overviewInnerContainerStyle}
        >
          <div
            data-testid="energy-overview-grid"
            data-orientation-layout={isPortraitTablet ? 'portrait' : 'landscape'}
            className="grid w-full grid-flow-row-dense gap-3 lg:gap-4"
            style={overviewGridStyle}
          >
            {visibleOverviewModules
              .filter((moduleId) => moduleId === 'live')
              .map(renderOverviewModuleFrame)}
            <EnergyDetailedHistoryWorkspace
              currentLoadStatisticId={currentLoadStatisticId}
              accentColor={accentColor}
              currentLoadW={dashboard.totals.currentLoadW}
              livePoints={dashboard.ranges.now.liveConsumption}
              consumers={filteredDashboard.topConsumers}
              priorityData={{
                dataCoverage: dashboard.dataCoverage,
                totals: dashboard.totals,
              }}
              insightsRange={insightsRange}
              referenceDateMs={insightsReferenceDateMs}
              onReferenceDateChange={setInsightsReferenceDateMs}
              mainCardStyle={{
                gridColumn: `span ${overviewUsageSpan} / span ${overviewUsageSpan}`,
              }}
              metricRowSpan={overviewUsageSpan}
              customStart={customRange.start}
              customEnd={customRange.end}
              statisticsLoader={historyStatisticsLoader}
              sources={historySources}
              useBentoLayout
              isEditMode={isEditMode}
            />
            {visibleOverviewModules
              .filter((moduleId) => moduleId !== 'live')
              .map(renderOverviewModuleFrame)}
            {isEditMode && normalizedOverviewLayout.hidden.length > 0 ? (
              <div
                className={cn(
                  'flex flex-wrap items-center gap-2 rounded-2xl border border-dashed p-3',
                  surface.border
                )}
                style={{ gridColumn: '1 / -1' }}
              >
                <span className={`text-xs ${surface.textSecondary}`}>
                  {t('energy.edit.hiddenModules')}
                </span>
                {normalizedOverviewLayout.hidden
                  .filter((moduleId) => availableOverviewModules.has(moduleId))
                  .map((moduleId) => (
                    <InteractivePill
                      key={moduleId}
                      size="compact"
                      onClick={() => showOverviewModule(moduleId)}
                    >
                      {t('energy.edit.addModule', { name: energyOverviewModuleLabel(moduleId, t) })}
                    </InteractivePill>
                  ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
});

function EnergyInsightsRangeControl({
  customRange,
  onApplyCustomRange,
  onClearCustomRange,
  onRangeChange,
  range,
}: {
  customRange: EnergyCustomRange;
  onApplyCustomRange: (range: EnergyCustomRange) => void;
  onClearCustomRange: () => void;
  onRangeChange: (range: EnergyHistoryRange) => void;
  range: EnergyHistoryRange;
}) {
  const { t, locale } = useI18n();
  const { theme, accentColor } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const isPhone = useMediaQuery('(max-width: 639px)');
  const [isCustomRangeOpen, setIsCustomRangeOpen] = useState(false);
  const [draftRange, setDraftRange] = useState(customRange);
  const today = toDateInputValue(new Date());
  const isDraftRangeValid =
    Boolean(draftRange.start) &&
    Boolean(draftRange.end) &&
    draftRange.start <= draftRange.end &&
    draftRange.end <= today;
  const openCustomRange = () => {
    setDraftRange(customRange);
    setIsCustomRangeOpen(true);
  };
  const closeCustomRange = () => setIsCustomRangeOpen(false);
  const applyCustomRange = () => {
    if (!isDraftRangeValid) return;
    onApplyCustomRange(draftRange);
    closeCustomRange();
  };
  const customRangeForm = (
    <EnergyCustomRangeForm
      draftRange={draftRange}
      isValid={isDraftRangeValid}
      maxDate={today}
      showHeading={!isPhone}
      onCancel={closeCustomRange}
      onApply={applyCustomRange}
      onChange={setDraftRange}
    />
  );

  return (
    <div
      className="flex min-w-0 shrink-0 items-center"
      data-testid="energy-insights-period-control"
    >
      <fieldset className="flex min-w-0 gap-1.5" aria-label={t('energy.range.insightsPeriod')}>
        {ENERGY_INSIGHTS_RANGES.filter((rangeId) => rangeId !== 'custom').map((rangeId) => (
          <InteractivePill
            key={rangeId}
            active={range === rangeId}
            aria-pressed={range === rangeId}
            size="small"
            onClick={() => onRangeChange(rangeId)}
          >
            {t(ENERGY_INSIGHTS_RANGE_LABELS[rangeId])}
          </InteractivePill>
        ))}
        {isPhone ? (
          <InteractivePill
            active={isCustomRangeOpen}
            aria-expanded={isCustomRangeOpen}
            aria-haspopup="dialog"
            size="small"
            onClick={openCustomRange}
          >
            {t('common.custom')}
          </InteractivePill>
        ) : (
          <Popover.Root
            open={isCustomRangeOpen}
            onOpenChange={(open) => {
              if (open) openCustomRange();
              else closeCustomRange();
            }}
          >
            <Popover.Trigger asChild>
              <InteractivePill
                active={isCustomRangeOpen}
                aria-expanded={isCustomRangeOpen}
                aria-haspopup="dialog"
                size="small"
              >
                {t('common.custom')}
              </InteractivePill>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="start"
                side="bottom"
                sideOffset={8}
                collisionPadding={12}
                className={cn(
                  'z-[920] w-[min(22rem,calc(100vw-1.5rem))] rounded-[24px] border p-4 outline-none',
                  surface.panel,
                  surface.border,
                  surface.cardShadow
                )}
              >
                {customRangeForm}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        )}
        {range === 'custom' ? (
          <InteractivePill
            active
            aria-label={t('energy.range.clearCustom', {
              range: formatCustomRangeLabel(customRange, t, locale),
            })}
            size="small"
            onClick={onClearCustomRange}
          >
            <span>{formatCustomRangeLabel(customRange, t, locale)}</span>
            <X className="h-4 w-4" aria-hidden="true" />
          </InteractivePill>
        ) : null}
      </fieldset>
      {isPhone ? (
        <SheetSurface
          isOpen={isCustomRangeOpen}
          onOpenChange={setIsCustomRangeOpen}
          title={t('energy.range.customTitle')}
          description={t('energy.range.customDescription')}
          closeLabel={t('energy.range.closeCustom')}
          accentColor={accentColor}
          overlayClassName={`animate-in fade-in bg-black/45 backdrop-blur-[2px] sm:hidden ${surface.dialogBackdrop}`}
          contentClassName={`${surface.panel} ${surface.border}`}
          bodyClassName="pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetSurfaceHeader
            title={t('energy.range.customTitle')}
            description={t('energy.range.customDescription')}
            closeLabel={t('energy.range.closeCustom')}
            onClose={closeCustomRange}
            className={cn('border-b', surface.border)}
          />
          <div className="px-4 pt-4">{customRangeForm}</div>
        </SheetSurface>
      ) : null}
    </div>
  );
}

function EnergyCustomRangeForm({
  draftRange,
  isValid,
  maxDate,
  showHeading,
  onApply,
  onCancel,
  onChange,
}: {
  draftRange: EnergyCustomRange;
  isValid: boolean;
  maxDate: string;
  showHeading: boolean;
  onApply: () => void;
  onCancel: () => void;
  onChange: (range: EnergyCustomRange) => void;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);

  return (
    <div className="space-y-4">
      {showHeading ? (
        <div>
          <div className={`text-sm font-semibold ${surface.textPrimary}`}>
            {t('energy.range.customTitle')}
          </div>
          <div className={`mt-0.5 text-xs ${surface.textSecondary}`}>
            {t('energy.range.customDescription')}
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={`space-y-1.5 text-xs font-medium ${surface.textSecondary}`}>
          <span>{t('energy.range.from')}</span>
          <input
            type="date"
            value={draftRange.start}
            max={draftRange.end || maxDate}
            onChange={(event) => onChange({ ...draftRange, start: event.target.value })}
            className={cn(
              'h-10 w-full min-w-0 rounded-xl border px-3 text-sm font-normal outline-none',
              surface.inputBg,
              surface.border,
              surface.textPrimary,
              getThemeFocusRingClassName(theme)
            )}
          />
        </label>
        <label className={`space-y-1.5 text-xs font-medium ${surface.textSecondary}`}>
          <span>{t('energy.range.to')}</span>
          <input
            type="date"
            value={draftRange.end}
            min={draftRange.start}
            max={maxDate}
            onChange={(event) => onChange({ ...draftRange, end: event.target.value })}
            className={cn(
              'h-10 w-full min-w-0 rounded-xl border px-3 text-sm font-normal outline-none',
              surface.inputBg,
              surface.border,
              surface.textPrimary,
              getThemeFocusRingClassName(theme)
            )}
          />
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <InteractivePill size="small" onClick={onCancel}>
          {t('common.cancel')}
        </InteractivePill>
        <InteractivePill active size="small" disabled={!isValid} onClick={onApply}>
          {t('energy.range.apply')}
        </InteractivePill>
      </div>
    </div>
  );
}

function createDefaultEnergyCustomRange(): EnergyCustomRange {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return { start: toDateInputValue(start), end: toDateInputValue(end) };
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatCustomRangeLabel(
  range: EnergyCustomRange,
  t: ReturnType<typeof useI18n>['t'],
  locale: string
) {
  const start = parseDateInputValue(range.start);
  const end = parseDateInputValue(range.end);
  if (!start || !end) return t('energy.range.customTitle');

  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  const currentYear = new Date().getFullYear();
  const monthDay = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });

  if (sameMonth) {
    const month = new Intl.DateTimeFormat(locale, { month: 'short' }).format(start);
    const year = sameYear && start.getFullYear() !== currentYear ? `, ${start.getFullYear()}` : '';
    return `${month} ${start.getDate()}–${end.getDate()}${year}`;
  }

  const startLabel = monthDay.format(start);
  const endLabel = monthDay.format(end);
  return sameYear && start.getFullYear() === currentYear
    ? `${startLabel}–${endLabel}`
    : `${startLabel}, ${start.getFullYear()}–${endLabel}, ${end.getFullYear()}`;
}

function parseDateInputValue(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

function EnergyOverviewModuleFrame({
  moduleId,
  className,
  style,
  children,
}: {
  moduleId: EnergyOverviewModuleId;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <section
      data-overview-module={moduleId}
      style={style}
      className={cn(moduleId === 'devices' ? 'contents' : 'min-w-0', className)}
    >
      {children}
    </section>
  );
}

function energyOverviewModuleLabel(
  moduleId: EnergyOverviewModuleId,
  t: ReturnType<typeof useI18n>['t']
) {
  return {
    live: t('energy.dashboard.liveEnergy'),
    devices: t('energy.edit.deviceCards'),
  }[moduleId];
}

function CompactLoadSparklines({
  accentColor,
  cardSizes,
  consumers,
  customCards,
  isEditMode,
  onDeleteCard,
  onHideConsumer,
  onSizeChange,
  onUpdateCard,
  theme,
  wholeHomeCurrentW,
  wholeHomePoints,
  wholeHomeTodayKWh,
  embedded = false,
}: {
  accentColor: string;
  cardSizes: Record<string, CardSize>;
  consumers: EnergyConsumer[];
  customCards: CustomCard[];
  isEditMode: boolean;
  onDeleteCard?: (cardId: string) => void;
  onHideConsumer: (consumerId: string) => void;
  onSizeChange: (cardId: string, size: CardSize) => void;
  onUpdateCard?: (cardId: string, updates: Partial<Omit<CustomCard, 'id' | 'createdAt'>>) => void;
  theme: ThemeType;
  wholeHomeCurrentW: number;
  wholeHomePoints: EnergySeriesPoint[];
  wholeHomeTodayKWh: number;
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const [cardOrder, setCardOrder] = usePersistedState<string[]>(STORAGE_KEYS.energyCardOrder, []);
  const breakpointCols = useBreakpointCols();
  const effectsQuality = useSettingsStore(settingsSelectors.effectsQuality);
  const lowPowerMode = useSettingsStore(settingsSelectors.lowPowerMode);
  const cardConsumers = useMemo(
    () => consumers.filter((consumer) => consumer.powerW > 0 || consumer.energyKWh > 0),
    [consumers]
  );
  const supportsDeferredVisibility = typeof IntersectionObserver !== 'undefined';
  const { ref: viewportRef, isVisible } = useDeferredVisibility<HTMLDivElement>({
    disabled: isEditMode || !supportsDeferredVisibility,
    initiallyVisible: isEditMode || !supportsDeferredVisibility,
    rootMargin: '180px 0px',
  });
  const shouldRenderCards = isEditMode || isVisible;
  const shouldBatchCustomCards = lowPowerMode || effectsQuality === 'low';
  const progressiveBatchSize = !supportsDeferredVisibility
    ? Math.max(1, cardConsumers.length)
    : lowPowerMode || effectsQuality === 'low'
      ? 1
      : effectsQuality === 'medium'
        ? 2
        : 3;
  const progressiveCardCount =
    cardConsumers.length + (shouldBatchCustomCards ? customCards.length : 0);
  const visibleProgressiveCardCount = useProgressiveBatching(progressiveCardCount, isEditMode, {
    enabled: shouldRenderCards,
    initialBatch: progressiveBatchSize,
    batchSize: progressiveBatchSize,
    timeoutFallbackMs: lowPowerMode || effectsQuality === 'low' ? 128 : 96,
  });
  const visibleConsumerCount = Math.min(cardConsumers.length, visibleProgressiveCardCount);
  const visibleCustomCardCount = shouldBatchCustomCards
    ? Math.max(0, visibleProgressiveCardCount - cardConsumers.length)
    : customCards.length;
  const [consumerTrends, setConsumerTrends] = useState<Record<string, EnergySeriesPoint[]>>({});
  const handleConsumerTrendChange = useCallback(
    (consumerId: string, points: EnergySeriesPoint[]) => {
      setConsumerTrends((current) =>
        current[consumerId] === points ? current : { ...current, [consumerId]: points }
      );
    },
    []
  );
  const { outerRef, innerRef, outerContainerStyle, innerContainerStyle, isAutoScaled, gridStyle } =
    useFitDashboardGrid(breakpointCols, !embedded);
  const wholeHomeCardSize = resolveSparklineCardSize(
    cardSizes[ENERGY_WHOLE_HOME_SPARKLINE_CARD_ID]
  );
  const trackedTodayKWh = consumers.reduce(
    (total, consumer) => total + Math.max(0, consumer.energyKWh),
    0
  );
  const trackedCurrentW = consumers.reduce(
    (total, consumer) => total + Math.max(0, consumer.powerW),
    0
  );
  const untrackedTodayKWh = wholeHomeTodayKWh - trackedTodayKWh;
  const untrackedCurrentW = Math.max(0, wholeHomeCurrentW - trackedCurrentW);
  const untrackedTrend = buildUntrackedTrend({
    consumerTrends,
    consumers,
    wholeHomeCurrentW,
    wholeHomePoints,
  });

  const arrangementCards: EnergyArrangementCard[] = [
    ...(shouldRenderCards && untrackedTodayKWh > 0
      ? [
          {
            id: ENERGY_WHOLE_HOME_SPARKLINE_CARD_ID,
            name: t('energy.dashboard.untracked'),
            size: wholeHomeCardSize,
            content: (
              <SparklineCardFrame
                accentColor={accentColor}
                cardSize={wholeHomeCardSize}
                isEditMode={isEditMode}
                onSizeChange={(size) => onSizeChange(ENERGY_WHOLE_HOME_SPARKLINE_CARD_ID, size)}
                theme={theme}
              >
                <EnergyNowCardView
                  accentColor={accentColor}
                  currentLoadW={untrackedCurrentW}
                  size={wholeHomeCardSize}
                  title={t('energy.dashboard.untracked')}
                  todayUsageKWh={untrackedTodayKWh}
                  trend={untrackedTrend}
                />
              </SparklineCardFrame>
            ),
          },
        ]
      : []),
    ...cardConsumers.slice(0, visibleConsumerCount).map((consumer) => ({
      id: getEnergyConsumerSparklineCardId(consumer.id),
      name: consumer.name,
      size: resolveSparklineCardSize(cardSizes[getEnergyConsumerSparklineCardId(consumer.id)]),
      content: (
        <DeviceSparklineRow
          key={consumer.id}
          accentColor={accentColor}
          cardSize={resolveSparklineCardSize(
            cardSizes[getEnergyConsumerSparklineCardId(consumer.id)]
          )}
          consumer={consumer}
          enabled={isVisible}
          isEditMode={isEditMode}
          onHideConsumer={onHideConsumer}
          onSizeChange={onSizeChange}
          onTrendChange={handleConsumerTrendChange}
          theme={theme}
        />
      ),
    })),
    ...(shouldRenderCards
      ? customCards.slice(0, visibleCustomCardCount).map((card) => ({
          id: card.id,
          name:
            typeof card.data?.title === 'string'
              ? card.data.title
              : typeof card.data?.label === 'string'
                ? card.data.label
                : card.type,
          size: card.size,
          content: (
            <DashboardCardItem
              key={card.id}
              id={card.id}
              size={card.size}
              isEditMode={isEditMode}
              card={card}
              handleSizeChange={(cardId, size) => onUpdateCard?.(cardId, { size })}
              onDeleteCard={onDeleteCard}
              onUpdateCard={onUpdateCard}
            />
          ),
        }))
      : []),
  ];

  return (
    <div
      ref={embedded ? undefined : viewportRef}
      className={embedded ? 'contents' : shouldRenderCards ? undefined : 'min-h-48'}
      data-energy-sparklines-ready={shouldRenderCards ? 'true' : 'false'}
    >
      {embedded && !isVisible ? (
        <div
          ref={viewportRef}
          className="h-px min-w-0"
          style={{ gridColumn: '1 / -1' }}
          aria-hidden="true"
        />
      ) : null}
      <div
        ref={outerRef}
        className={embedded ? 'contents' : 'relative w-full'}
        style={embedded ? undefined : outerContainerStyle}
      >
        <div
          ref={innerRef}
          className={
            embedded
              ? 'contents'
              : `w-full${isAutoScaled ? ' absolute left-0 top-0 origin-top-left' : ''}`
          }
          style={embedded ? undefined : innerContainerStyle}
        >
          <div
            className={embedded ? 'contents' : 'grid w-full grid-flow-row gap-3 lg:gap-4'}
            style={embedded ? undefined : (gridStyle as CSSProperties)}
          >
            <EnergyCardArrangement
              cards={arrangementCards}
              order={cardOrder}
              isEditMode={isEditMode}
              onOrderChange={(ids) =>
                setCardOrder((current) => [...ids, ...current.filter((id) => !ids.includes(id))])
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DeviceSparklineRow({
  accentColor,
  cardSize,
  consumer,
  enabled,
  isEditMode,
  onHideConsumer,
  onSizeChange,
  onTrendChange,
  theme,
}: {
  accentColor: string;
  cardSize: Extract<CardSize, 'small' | 'medium' | 'large'>;
  consumer: EnergyConsumer;
  enabled: boolean;
  isEditMode: boolean;
  onHideConsumer: (consumerId: string) => void;
  onSizeChange: (cardId: string, size: CardSize) => void;
  onTrendChange: (consumerId: string, points: EnergySeriesPoint[]) => void;
  theme: ThemeType;
}) {
  const points = useEnergyLoadHistory(consumer.powerEntityId, consumer.powerW, enabled);
  const cardId = getEnergyConsumerSparklineCardId(consumer.id);

  useEffect(() => {
    onTrendChange(consumer.id, points);
  }, [consumer.id, onTrendChange, points]);

  return (
    <SparklineCardFrame
      accentColor={accentColor}
      cardSize={cardSize}
      isEditMode={isEditMode}
      onHide={() => onHideConsumer(consumer.id)}
      onSizeChange={(size) => onSizeChange(cardId, size)}
      theme={theme}
    >
      <EnergyNowCardView
        accentColor={accentColor}
        currentLoadW={consumer.powerW}
        size={cardSize}
        title={consumer.name}
        todayUsageKWh={consumer.energyKWh}
        trend={points}
      />
    </SparklineCardFrame>
  );
}

function SparklineCardFrame({
  accentColor,
  cardSize,
  children,
  isEditMode,
  onHide,
  onSizeChange,
  theme,
}: {
  accentColor: string;
  cardSize: Extract<CardSize, 'small' | 'medium' | 'large'>;
  children: ReactNode;
  isEditMode: boolean;
  onHide?: () => void;
  onSizeChange: (size: CardSize) => void;
  theme: ThemeType;
}) {
  const { t } = useI18n();
  return (
    <div className={`${getCardSpanClass(cardSize)} relative h-full min-w-0`}>
      <div className="relative h-full">
        {children}
        {isEditMode ? (
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 z-30 h-24 overflow-hidden ${getBaseCardRadiusClassName(cardSize)}`}
            data-card-edit-dock="true"
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  theme === 'glass'
                    ? 'linear-gradient(to top, rgba(4,8,18,0.56), rgba(8,12,20,0.3) 24%, rgba(10,14,24,0.1) 52%, transparent 78%)'
                    : 'linear-gradient(to top, rgba(0,0,0,0.88), rgba(0,0,0,0.78) 24%, rgba(0,0,0,0.42) 52%, transparent 78%)',
              }}
              aria-hidden="true"
            />
            <div className="relative flex h-full items-end justify-center px-2 pb-3">
              <div
                className="pointer-events-auto inline-flex max-w-full items-center justify-center gap-2 rounded-full px-3 py-2"
                style={
                  theme === 'glass'
                    ? {
                        border: '1px solid rgba(255,255,255,0.16)',
                        background:
                          'linear-gradient(180deg, rgba(255,255,255,0.2), rgba(255,255,255,0.08) 22%, rgba(255,255,255,0.03) 100%)',
                        boxShadow:
                          '0 18px 38px -24px rgba(4,10,22,0.82), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -10px 18px rgba(255,255,255,0.03)',
                        backdropFilter: 'blur(24px) saturate(1.05)',
                        WebkitBackdropFilter: 'blur(24px) saturate(1.05)',
                      }
                    : {
                        border: `1px solid ${withTintAlpha(accentColor, 0.12)}`,
                        background: '#161619',
                        boxShadow: '0 12px 24px -18px rgba(0,0,0,0.72)',
                      }
                }
              >
                {onHide ? (
                  <CardEditActionButton
                    cardSize={cardSize}
                    Icon={EyeOff}
                    inline
                    theme={theme}
                    variant="warning"
                    aria-label={t('energy.dashboard.hideSensor')}
                    title={t('energy.dashboard.hideSensor')}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onHide();
                    }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                    }}
                  />
                ) : null}
                <DashboardResizeTrigger
                  cardSize={cardSize}
                  allowedSizes={ENERGY_SPARKLINE_ALLOWED_SIZES}
                  onSizeChange={onSizeChange}
                  inline
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function getEnergyConsumerSparklineCardId(consumerId: string) {
  return `energy:consumer:${consumerId}`;
}

function resolveSparklineCardSize(
  size: CardSize | undefined
): Extract<CardSize, 'small' | 'medium' | 'large'> {
  if (size === 'small' || size === 'medium' || size === 'large') {
    return size;
  }

  return 'medium';
}

export function buildUntrackedTrend({
  consumerTrends,
  consumers,
  wholeHomeCurrentW,
  wholeHomePoints,
}: {
  consumerTrends: Readonly<Record<string, EnergySeriesPoint[]>>;
  consumers: EnergyConsumer[];
  wholeHomeCurrentW: number;
  wholeHomePoints: EnergySeriesPoint[];
}) {
  const latestWholeHomeValue = wholeHomePoints.at(-1)?.value ?? 0;
  const wholeHomeScale = latestWholeHomeValue > 0 ? wholeHomeCurrentW / latestWholeHomeValue : 0;

  return wholeHomePoints.map((point, pointIndex) => {
    const wholeHomePowerW = point.value * wholeHomeScale;
    const trackedPowerW = consumers.reduce((total, consumer) => {
      const trend = consumerTrends[consumer.id] ?? [];
      if (trend.length === 0) {
        return total + Math.max(0, consumer.powerW);
      }

      const alignedIndex =
        wholeHomePoints.length <= 1
          ? trend.length - 1
          : Math.round((pointIndex / (wholeHomePoints.length - 1)) * (trend.length - 1));
      const alignedValue = trend[alignedIndex]?.value ?? 0;
      const latestValue = trend.at(-1)?.value ?? 0;
      const trendScale = latestValue > 0 ? Math.max(0, consumer.powerW) / latestValue : 0;

      return total + Math.max(0, alignedValue * trendScale);
    }, 0);

    return {
      ...point,
      value: Math.max(0, wholeHomePowerW - trackedPowerW),
      minValue: undefined,
      maxValue: undefined,
    };
  });
}

function LoadOrb({
  consumerColors,
  consumers,
  loadW,
  surface,
  untrackedPowerW,
  untrackedTodayKWh,
}: {
  consumerColors: ReadonlyMap<string, string>;
  consumers: EnergyConsumer[];
  loadW: number;
  surface: ReturnType<typeof getThemeSurfaceTokens>;
  untrackedPowerW: number;
  untrackedTodayKWh: number;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const disableAnimations = useSettingsStore(settingsSelectors.disableAnimations);
  const effectsQuality = useSettingsStore(settingsSelectors.effectsQuality);
  const lowPowerMode = useSettingsStore(settingsSelectors.lowPowerMode);
  const density = resolveLoadOrbDensity({
    disableAnimations,
    effectsQuality,
    lowPowerMode,
  });
  const animateDots = !disableAnimations && !lowPowerMode && effectsQuality !== 'low';
  const motionIntensity = getLoadOrbMotionIntensity(loadW);
  const dots = useMemo(() => buildOrbDots(motionIntensity, density), [density, motionIntensity]);
  const orbSegments = useMemo(
    () =>
      getLoadOrbSegments({
        consumerColors,
        consumers,
        untrackedLabel: t('energy.dashboard.untracked'),
        untrackedPowerW,
      }),
    [consumerColors, consumers, t, untrackedPowerW]
  );
  const [activeSegmentState, setActiveSegmentState] = useState<{
    id: string;
    leftPercent: number;
    topPercent: number;
  } | null>(null);
  const tooltipId = useId();
  const activeSegment =
    activeSegmentState === null
      ? null
      : (orbSegments.find((segment) => segment.id === activeSegmentState.id) ?? null);
  const tooltipClassName = `border ${surface.border} ${surface.panel} ${
    theme !== 'light' ? 'shadow-2xl' : 'shadow-[0_18px_38px_-24px_rgba(15,23,42,0.22)]'
  }`;
  const selectSegment = useCallback((segment: LoadOrbSegment) => {
    const position = getLoadOrbSegmentTooltipPosition(segment);
    setActiveSegmentState({ id: segment.id, ...position });
  }, []);
  const updateActiveSegmentFromPointer = useCallback(
    (clientX: number, clientY: number, rect: DOMRect) => {
      const drawSize = Math.min(rect.width, rect.height);
      const dx = clientX - (rect.left + rect.width / 2);
      const dy = clientY - (rect.top + rect.height / 2);
      const distance = Math.hypot(dx, dy);

      if (drawSize <= 0 || distance < drawSize * 0.18 || distance > drawSize * 0.5) {
        setActiveSegmentState(null);
        return;
      }

      const segment = getLoadOrbSegmentAtAngle(Math.atan2(dy, dx), orbSegments);
      if (!segment) {
        setActiveSegmentState(null);
        return;
      }

      setActiveSegmentState({
        id: segment.id,
        leftPercent: Math.max(22, Math.min(78, ((clientX - rect.left) / rect.width) * 100)),
        topPercent: Math.max(30, Math.min(88, ((clientY - rect.top) / rect.height) * 100)),
      });
    },
    [orbSegments]
  );
  const consumedTodayKWh =
    consumers.reduce((total, consumer) => total + Math.max(0, consumer.energyKWh), 0) +
    untrackedTodayKWh;

  return (
    <div
      className={cn(
        'relative flex min-h-[17rem] w-full min-w-0 items-center justify-center rounded-3xl px-2 py-3 md:min-h-[20rem]',
        getThemeFocusRingClassName(theme)
      )}
      data-testid="load-orb"
      role="img"
      tabIndex={orbSegments.length > 0 ? 0 : -1}
      aria-describedby={activeSegment ? tooltipId : undefined}
      aria-label={`${t('energy.dashboard.liveEnergy')}. ${orbSegments
        .map((segment) => `${segment.label}: ${formatPowerValue(segment.value)}`)
        .join(', ')}`}
      onBlur={() => setActiveSegmentState(null)}
      onKeyDown={(event) => {
        if (orbSegments.length === 0) return;
        const currentIndex = activeSegment
          ? orbSegments.findIndex((segment) => segment.id === activeSegment.id)
          : -1;
        let nextIndex = currentIndex;

        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          nextIndex = (Math.max(currentIndex, -1) + 1) % orbSegments.length;
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          nextIndex = (currentIndex - 1 + orbSegments.length) % orbSegments.length;
        } else if (event.key === 'Home') {
          nextIndex = 0;
        } else if (event.key === 'End') {
          nextIndex = orbSegments.length - 1;
        } else if (event.key === 'Escape') {
          setActiveSegmentState(null);
          return;
        } else {
          return;
        }

        event.preventDefault();
        const nextSegment = orbSegments[nextIndex];
        if (nextSegment) selectSegment(nextSegment);
      }}
      onPointerDown={(event) => {
        updateActiveSegmentFromPointer(
          event.clientX,
          event.clientY,
          event.currentTarget.getBoundingClientRect()
        );
        if (event.pointerType !== 'mouse') event.currentTarget.focus();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setActiveSegmentState(null);
      }}
      onPointerMove={(event) => {
        updateActiveSegmentFromPointer(
          event.clientX,
          event.clientY,
          event.currentTarget.getBoundingClientRect()
        );
      }}
    >
      {animateDots ? <style>{LOAD_ORB_RIPPLE_KEYFRAMES}</style> : null}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden rounded-3xl"
        preserveAspectRatio="xMidYMid meet"
        viewBox="-180 -180 360 360"
      >
        {orbSegments.length > 0
          ? dots.map((dot) => {
              const segment = getLoadOrbSegmentAtAngle(dot.angle, orbSegments);
              const opacity = activeSegment
                ? segment?.id === activeSegment.id
                  ? 1
                  : 0.22
                : dot.opacity;

              return (
                <circle
                  key={dot.id}
                  className="navet-load-orb-dot"
                  cx={dot.x}
                  cy={dot.y}
                  data-ring={dot.ring}
                  data-segment-id={segment?.id}
                  data-testid="load-orb-dot"
                  fill={segment?.color ?? 'transparent'}
                  r={dot.size / 2}
                  style={{
                    ['--load-orb-dot-opacity' as string]: String(opacity),
                    ...(animateDots
                      ? {
                          ['--load-orb-drift-x' as string]: `${dot.driftX}px`,
                          ['--load-orb-drift-x-negative' as string]: `${-dot.driftX}px`,
                          ['--load-orb-drift-y' as string]: `${dot.driftY}px`,
                          ['--load-orb-drift-y-negative' as string]: `${-dot.driftY}px`,
                          animationDelay: `${dot.delayS}s`,
                          animationDuration: `${dot.durationS}s`,
                          animationIterationCount: 'infinite',
                          animationName: 'navet-load-orb-water-drift',
                          animationTimingFunction: 'ease-in-out',
                        }
                      : {
                          opacity,
                        }),
                  }}
                />
              );
            })
          : null}
      </svg>
      {activeSegment && activeSegmentState ? (
        <div className="pointer-events-none absolute inset-0 z-30">
          <div
            className="absolute"
            style={{
              left: `${activeSegmentState.leftPercent}%`,
              top: `${activeSegmentState.topPercent}%`,
              transform: 'translate(-50%, calc(-100% - 10px))',
            }}
          >
            <div
              id={tooltipId}
              role="tooltip"
              className={`w-max max-w-52 rounded-xl px-3 py-2 text-left backdrop-blur-md ${tooltipClassName}`}
            >
              <div className={`flex items-center gap-2 text-xs ${surface.textPrimary}`}>
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: activeSegment.color }}
                  aria-hidden="true"
                />
                <span className="max-w-40 truncate font-medium">{activeSegment.label}</span>
              </div>
              <div className={`mt-1 text-[11px] tabular-nums ${surface.textSecondary}`}>
                {formatPowerValue(activeSegment.value)} ·{' '}
                {formatEnergyPercent(activeSegment.share * 100)}%{' '}
                {t('energy.widgets.storage.ofCurrentLoad')}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div className="relative z-10 flex flex-col items-center justify-center text-center">
        <div className={`text-4xl font-semibold tracking-tight ${surface.textPrimary}`}>
          {loadW}
        </div>
        <div className={`text-sm font-medium ${surface.textSecondary}`}>
          {t('energy.dashboard.wattsNow')}
        </div>
        <div className={`mt-1 text-xs ${surface.textMuted}`} data-testid="load-orb-consumption">
          {t('energy.dashboard.kwhToday', { value: formatEnergyValue(consumedTodayKWh) })}
        </div>
      </div>
    </div>
  );
}

function DeviceTable({
  accentColor,
  consumers,
  homeAssistantEnergyUrl,
  loadW,
  openLabel,
  sourceDiagnostics,
  surface,
  totalConsumptionTodayKWh,
  usePortraitLayout = false,
}: {
  accentColor: string;
  consumers: EnergyConsumer[];
  homeAssistantEnergyUrl: string | null;
  loadW: number;
  openLabel: string;
  sourceDiagnostics: EnergySourceDiagnostic[];
  surface: ReturnType<typeof getThemeSurfaceTokens>;
  totalConsumptionTodayKWh: number;
  usePortraitLayout?: boolean;
}) {
  const { t } = useI18n();
  const unavailableDevices = getUnavailableDeviceDiagnostics(consumers, sourceDiagnostics);
  const consumerColors = useMemo(() => buildEnergyConsumerColorMap(consumers), [consumers]);
  const trackedConsumptionTodayKWh = useMemo(
    () => consumers.reduce((total, consumer) => total + Math.max(0, consumer.energyKWh), 0),
    [consumers]
  );
  const untrackedTodayKWh = Math.max(0, totalConsumptionTodayKWh - trackedConsumptionTodayKWh);
  const trackedPowerW = consumers.reduce(
    (total, consumer) => total + Math.max(0, consumer.powerW),
    0
  );
  const untrackedPowerW = Math.max(0, loadW - trackedPowerW);
  const roomUsage = useMemo(
    () => buildLiveRoomUsage(consumers, t('dashboard.multiple.manager.unassigned')),
    [consumers, t]
  );
  const [contentView, setContentView] = useState<'devices' | 'rooms' | 'sources'>('devices');

  return (
    <BaseCard
      size="medium"
      className={cn(
        'h-full min-w-0 w-full p-4',
        usePortraitLayout ? 'min-h-[26rem]' : 'min-h-[32rem]'
      )}
      surfaceVariant="muted"
      title={t('energy.dashboard.liveEnergy')}
      subtitle={t('energy.dashboard.wattsNow')}
      headerLayout="title-first"
      headerLeading={
        <EntityCardHeaderIcon IconComponent={Zap} isActive size="medium" baseColor={accentColor} />
      }
      headerMarginBottomClassName="mb-3"
    >
      <div
        data-testid="energy-live-layout"
        data-layout={usePortraitLayout ? 'split' : 'stacked'}
        className={cn(
          'h-full min-h-0 gap-4',
          usePortraitLayout
            ? 'grid grid-cols-[minmax(15rem,0.85fr)_minmax(0,1.15fr)]'
            : 'flex flex-col'
        )}
      >
        <div className="flex min-w-0 flex-col">
          <div className="mx-auto flex w-full max-w-[20rem] justify-center">
            <LoadOrb
              consumerColors={consumerColors}
              consumers={consumers}
              loadW={loadW}
              surface={surface}
              untrackedPowerW={untrackedPowerW}
              untrackedTodayKWh={untrackedTodayKWh}
            />
          </div>
        </div>

        <div
          className={cn(
            `flex w-full min-w-0 items-start gap-2 text-left text-xs leading-relaxed ${surface.textMuted}`,
            usePortraitLayout && 'col-span-2 row-start-2'
          )}
        >
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">{t('energy.dashboard.orbHelp')}</p>
        </div>

        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col',
            usePortraitLayout && 'col-start-2 row-start-1'
          )}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <InteractivePill
                active={contentView === 'devices'}
                aria-pressed={contentView === 'devices'}
                size="compact"
                onClick={() => setContentView('devices')}
              >
                {t('energy.dashboard.devices')}
              </InteractivePill>
              <InteractivePill
                active={contentView === 'rooms'}
                aria-pressed={contentView === 'rooms'}
                size="compact"
                onClick={() => setContentView('rooms')}
              >
                {t('dashboard.multiple.group.rooms')}
              </InteractivePill>
              <InteractivePill
                active={contentView === 'sources'}
                aria-pressed={contentView === 'sources'}
                size="compact"
                onClick={() => setContentView('sources')}
              >
                {t('energy.dashboard.sources')}
              </InteractivePill>
            </div>
          </div>
          {/* biome-ignore-start lint/a11y/noNoninteractiveTabindex: The scrollable usage list needs a keyboard focus target when its rows have no controls. */}
          <section
            aria-label={
              contentView === 'devices'
                ? t('energy.dashboard.devices')
                : contentView === 'rooms'
                  ? t('dashboard.multiple.group.rooms')
                  : t('energy.dashboard.sources')
            }
            tabIndex={0}
            className={`min-h-0 flex-1 touch-pan-y overflow-auto overscroll-contain rounded-[22px] border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 [-webkit-overflow-scrolling:touch] ${surface.border} ${surface.panelMuted}`}
          >
            {/* biome-ignore-end lint/a11y/noNoninteractiveTabindex: End scroll region opening tag. */}
            {contentView === 'devices' ? (
              consumers.length === 0 && untrackedTodayKWh <= 0 ? (
                <div className={`px-4 py-5 text-sm ${surface.textMuted}`}>
                  {t('energy.dashboard.noDeviceUsage')}
                </div>
              ) : (
                <>
                  <div
                    className={`grid min-w-[18rem] grid-cols-[minmax(max-content,1fr)_3.5rem_4.5rem] items-center gap-2 px-3 pt-3 pb-2 text-xs font-medium ${surface.textMuted}`}
                  >
                    <div>{t('energy.dashboard.device')}</div>
                    <div className="text-right">{t('energy.dashboard.now')}</div>
                    <div className="text-right">{t('energy.stats.today')}</div>
                  </div>
                  {consumers.map((consumer, index) => (
                    <div
                      key={consumer.id}
                      className={`grid min-h-12 min-w-[18rem] grid-cols-[minmax(max-content,1fr)_3.5rem_4.5rem] items-center gap-2 px-3 py-2 text-xs ${
                        index % 2 === 0 ? surface.subtleBg : ''
                      }`}
                    >
                      <div className="min-w-max whitespace-nowrap">
                        <div className={`font-medium ${surface.textPrimary}`}>{consumer.name}</div>
                        <div
                          data-testid={`energy-device-status-${consumer.id}`}
                          className={`text-[11px] leading-[14px] ${surface.textMuted}`}
                        >
                          {getConsumerShareStatusLabel(consumer, totalConsumptionTodayKWh, t)}
                        </div>
                      </div>
                      <div
                        className={`whitespace-nowrap text-right font-medium tabular-nums ${surface.textPrimary}`}
                      >
                        {formatPowerValue(consumer.powerW)}
                      </div>
                      <div
                        className={`whitespace-nowrap text-right tabular-nums ${surface.textSecondary}`}
                      >
                        {formatTrackedEnergyValue(consumer.energyKWh)}
                      </div>
                    </div>
                  ))}
                  {untrackedTodayKWh > 0 ? (
                    <div
                      className={`grid min-h-12 min-w-[18rem] grid-cols-[minmax(max-content,1fr)_3.5rem_4.5rem] items-center gap-2 px-3 py-2 text-xs ${
                        consumers.length % 2 === 0 ? surface.subtleBg : ''
                      }`}
                    >
                      <div className="min-w-max whitespace-nowrap">
                        <div className={`font-medium ${surface.textPrimary}`}>
                          {t('energy.dashboard.untracked')}
                        </div>
                        <div className={`text-[11px] leading-[14px] ${surface.textMuted}`}>
                          {getConsumptionShareLabel(untrackedTodayKWh, totalConsumptionTodayKWh, t)}
                        </div>
                      </div>
                      <div
                        className={`whitespace-nowrap text-right font-medium tabular-nums ${surface.textPrimary}`}
                      >
                        {formatPowerValue(untrackedPowerW)}
                      </div>
                      <div
                        className={`whitespace-nowrap text-right tabular-nums ${surface.textSecondary}`}
                      >
                        {formatTrackedEnergyValue(untrackedTodayKWh)}
                      </div>
                    </div>
                  ) : null}
                </>
              )
            ) : contentView === 'rooms' ? (
              roomUsage.length === 0 && untrackedTodayKWh <= 0 ? (
                <div className={`px-4 py-5 text-sm ${surface.textMuted}`}>
                  {t('energy.dashboard.noDeviceUsage')}
                </div>
              ) : (
                <>
                  <div
                    className={`hidden grid-cols-[minmax(0,1fr)_5rem_5rem_4rem] items-center gap-3 px-4 pt-3 pb-2 text-xs font-medium sm:grid ${surface.textMuted}`}
                  >
                    <div>{t('dashboard.addEntity.roomLabel')}</div>
                    <div className="text-right">{t('energy.dashboard.now')}</div>
                    <div className="text-right">{t('energy.stats.today')}</div>
                    <div className="text-right">{t('energy.dashboard.devices')}</div>
                  </div>
                  {roomUsage.map((room, index) => (
                    <div
                      key={room.id}
                      data-testid="energy-room-row"
                      className={`grid gap-3 px-4 py-3 text-xs sm:grid-cols-[minmax(0,1fr)_5rem_5rem_4rem] sm:items-center ${
                        index % 2 === 0 ? surface.subtleBg : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className={`truncate font-medium ${surface.textPrimary}`}>
                          {room.name}
                        </div>
                        <div className={`truncate text-[11px] leading-[14px] ${surface.textMuted}`}>
                          {room.deviceNames.join(', ')}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className={`text-xs font-medium sm:hidden ${surface.textMuted}`}>
                          {t('energy.dashboard.now')}
                        </div>
                        <div className={`font-medium sm:text-right ${surface.textPrimary}`}>
                          {formatPowerValue(room.powerW)}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className={`text-xs font-medium sm:hidden ${surface.textMuted}`}>
                          {t('energy.stats.today')}
                        </div>
                        <div className={`sm:text-right ${surface.textSecondary}`}>
                          {formatTrackedEnergyValue(room.energyKWh)}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className={`text-xs font-medium sm:hidden ${surface.textMuted}`}>
                          {t('energy.dashboard.devices')}
                        </div>
                        <div
                          className={`font-medium tabular-nums sm:text-right ${surface.textSecondary}`}
                        >
                          {room.deviceCount}
                        </div>
                      </div>
                    </div>
                  ))}
                  {untrackedTodayKWh > 0 || untrackedPowerW > 0 ? (
                    <div
                      className={`grid gap-3 px-4 py-3 text-xs sm:grid-cols-[minmax(0,1fr)_5rem_5rem_4rem] sm:items-center ${
                        roomUsage.length % 2 === 0 ? surface.subtleBg : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className={`truncate font-medium ${surface.textPrimary}`}>
                          {t('energy.dashboard.untracked')}
                        </div>
                        <div className={`truncate text-[11px] leading-[14px] ${surface.textMuted}`}>
                          {t('energy.dashboard.untrackedDescription')}
                        </div>
                      </div>
                      <div className={`font-medium sm:text-right ${surface.textPrimary}`}>
                        {formatPowerValue(untrackedPowerW)}
                      </div>
                      <div className={`sm:text-right ${surface.textSecondary}`}>
                        {formatTrackedEnergyValue(untrackedTodayKWh)}
                      </div>
                      <div className={`font-medium sm:text-right ${surface.textMuted}`}>—</div>
                    </div>
                  ) : null}
                </>
              )
            ) : (
              <SourceDiagnostics
                accentColor={accentColor}
                compact
                hideHeader
                homeAssistantEnergyUrl={homeAssistantEnergyUrl}
                openLabel={openLabel}
                sources={sourceDiagnostics}
                surface={surface}
              />
            )}
            {contentView === 'devices' && unavailableDevices.length > 0 ? (
              <div className={`border-t ${surface.border}`}>
                {unavailableDevices.map((device, index) => (
                  <div
                    key={device.id}
                    className={`grid min-h-12 min-w-[18rem] grid-cols-[minmax(max-content,1fr)_3.5rem_4.5rem] items-center gap-2 px-3 py-2 text-xs ${
                      consumers.length === 0 && index % 2 === 0 ? surface.subtleBg : ''
                    }`}
                  >
                    <div className="flex min-w-max items-center gap-1.5 whitespace-nowrap">
                      <span className={`font-medium ${surface.textSecondary}`}>{device.label}</span>
                      <span aria-hidden="true" className={surface.textMuted}>
                        ·
                      </span>
                      <span className={surface.textMuted}>{t('common.unavailable')}</span>
                    </div>
                    <div className={`text-right ${surface.textMuted}`}>—</div>
                    <div className={`text-right ${surface.textMuted}`}>—</div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </BaseCard>
  );
}

function getConsumerStatusLabel(consumer: EnergyConsumer, t: ReturnType<typeof useI18n>['t']) {
  if (consumer.status === 'active') return t('energy.dashboard.status.active');
  if (consumer.status === 'standby') return t('energy.dashboard.status.standby');
  return t('energy.dashboard.status.idle');
}

function getConsumerShareStatusLabel(
  consumer: EnergyConsumer,
  totalConsumptionTodayKWh: number,
  t: ReturnType<typeof useI18n>['t']
) {
  const share =
    totalConsumptionTodayKWh > 0 ? (consumer.energyKWh / totalConsumptionTodayKWh) * 100 : 0;
  return t('energy.dashboard.usageShareStatus', {
    value: formatEnergyPercent(share),
    status: getConsumerStatusLabel(consumer, t),
  });
}

function getConsumptionShareLabel(
  energyKWh: number,
  totalConsumptionTodayKWh: number,
  t: ReturnType<typeof useI18n>['t']
) {
  const share = totalConsumptionTodayKWh > 0 ? (energyKWh / totalConsumptionTodayKWh) * 100 : 0;
  return t('energy.dashboard.usageShareDetail', {
    value: formatEnergyPercent(share),
  });
}

function formatPowerValue(powerW: number) {
  return `${Math.round(powerW)} W`;
}

function formatTrackedEnergyValue(energyKWh: number) {
  if (energyKWh > 0 && energyKWh < 1) {
    return `${formatEnergyValue(energyKWh, 2)} kWh`;
  }

  return `${formatEnergyValue(energyKWh)} kWh`;
}

function buildLiveRoomUsage(consumers: EnergyConsumer[], unassignedRoomLabel: string) {
  const rooms = new Map<
    string,
    {
      id: string;
      name: string;
      powerW: number;
      energyKWh: number;
      deviceCount: number;
      deviceNames: string[];
    }
  >();

  consumers.forEach((consumer) => {
    const roomName = consumer.room?.trim() || unassignedRoomLabel;
    const current = rooms.get(roomName);
    rooms.set(roomName, {
      id: current?.id ?? roomName,
      name: roomName,
      powerW: (current?.powerW ?? 0) + Math.max(0, consumer.powerW),
      energyKWh: (current?.energyKWh ?? 0) + Math.max(0, consumer.energyKWh),
      deviceCount: (current?.deviceCount ?? 0) + 1,
      deviceNames: [...(current?.deviceNames ?? []), consumer.name],
    });
  });

  return [...rooms.values()].sort(
    (left, right) =>
      right.powerW - left.powerW ||
      right.energyKWh - left.energyKWh ||
      left.name.localeCompare(right.name)
  );
}

function getUnavailableDeviceDiagnostics(
  consumers: EnergyConsumer[],
  sourceDiagnostics: EnergySourceDiagnostic[]
) {
  const visibleConsumerIds = new Set(consumers.map((consumer) => consumer.id));
  return sourceDiagnostics.filter(
    (source) =>
      source.id.startsWith('device:') &&
      source.status === 'configured_unavailable' &&
      source.entityId &&
      !visibleConsumerIds.has(source.entityId)
  );
}

function SourceDiagnostics({
  accentColor,
  compact = false,
  hideHeader = false,
  homeAssistantEnergyUrl,
  openLabel,
  sources,
  surface,
}: {
  accentColor: string;
  compact?: boolean;
  hideHeader?: boolean;
  homeAssistantEnergyUrl: string | null;
  openLabel: string;
  sources: EnergySourceDiagnostic[];
  surface: ReturnType<typeof getThemeSurfaceTokens>;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const sourceRows = getSourceDiagnostics(sources);
  const sectionStyle = getInheritedDialogSectionStyle(theme, accentColor, accentColor);
  const rowDividerClassName = theme === 'light' ? 'border-slate-200/80' : surface.border;
  const sectionClassName =
    theme === 'light'
      ? 'bg-white/60'
      : theme === 'glass'
        ? 'bg-white/[0.03]'
        : theme === 'black'
          ? 'bg-white/[0.02]'
          : 'bg-white/[0.025]';

  return (
    <div data-testid="energy-sources-card" className="w-full">
      {!hideHeader ? (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <EntityCardHeaderIcon
                IconComponent={Zap}
                isActive
                size="medium"
                tone="primary"
                baseColor={accentColor}
              />
              <div className={`text-base font-semibold ${surface.textPrimary}`}>
                {t('energy.dashboard.sources')}
              </div>
            </div>
            <p className={`mt-1 text-sm ${surface.textMuted}`}>
              {t('energy.dashboard.manageSources')}
            </p>
          </div>
          {homeAssistantEnergyUrl ? (
            <a
              href={homeAssistantEnergyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${surface.textPrimary} ${
                theme === 'light' ? 'bg-white/88 hover:bg-white' : 'bg-black/18 hover:bg-black/24'
              }`}
              style={{
                borderColor: `${accentColor}${theme === 'light' ? '33' : '29'}`,
                color: theme === 'light' ? undefined : accentColor,
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>{openLabel}</span>
            </a>
          ) : null}
        </div>
      ) : null}
      <div
        className={`grid gap-2 overflow-hidden ${
          hideHeader
            ? `px-4 ${compact ? 'py-3' : 'py-4'}`
            : `rounded-[1.25rem] border px-3 ${compact ? 'py-3' : 'py-4'}`
        } ${hideHeader ? '' : `${surface.border} ${sectionClassName}`}`}
        style={sectionStyle}
      >
        {sourceRows.map((source) => (
          <div
            key={source.id}
            className={`flex min-w-0 items-center justify-between gap-3 border-t pt-2 first:border-t-0 first:pt-0 ${
              compact ? 'text-xs' : 'text-sm'
            } ${rowDividerClassName}`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <SourceIcon source={source} accentColor={accentColor} />
              <div className="min-w-0">
                <div className={`truncate font-medium ${surface.textPrimary}`}>{source.label}</div>
                <div
                  className={`truncate ${compact ? 'text-[11px] leading-[14px]' : 'text-xs'} ${surface.textMuted}`}
                >
                  {source.entityId ?? source.liveEntityId}
                </div>
              </div>
            </div>
            <div
              className={`shrink-0 text-right text-xs font-medium ${
                source.status === 'configured_unavailable'
                  ? theme === 'light'
                    ? 'text-amber-700'
                    : 'text-amber-200'
                  : surface.textSecondary
              }`}
            >
              {formatDiagnosticStatus(source, t)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SourceIcon({
  accentColor,
  source,
}: {
  accentColor: string;
  source: EnergySourceDiagnostic;
}) {
  const { theme } = useTheme();
  const iconWrapClassName =
    source.status === 'configured_unavailable'
      ? theme === 'light'
        ? 'bg-amber-100'
        : 'bg-amber-300/16'
      : source.id === 'grid-import'
        ? theme === 'light'
          ? 'bg-orange-100'
          : 'bg-orange-400/16'
        : source.id === 'grid-export'
          ? theme === 'light'
            ? 'bg-amber-100'
            : 'bg-amber-300/16'
          : source.id === 'solar'
            ? theme === 'light'
              ? 'bg-yellow-100'
              : 'bg-yellow-300/16'
            : source.id === 'gas'
              ? theme === 'light'
                ? 'bg-red-100'
                : 'bg-red-400/16'
              : theme === 'light'
                ? 'bg-emerald-100'
                : 'bg-emerald-400/16';

  const iconClassName = 'h-3.5 w-3.5 shrink-0';
  const iconNode =
    source.status === 'configured_unavailable' ? (
      <AlertTriangle
        className={`${iconClassName} ${theme === 'light' ? 'text-amber-700' : 'text-amber-200'}`}
      />
    ) : source.id === 'grid-import' ? (
      <Zap className={iconClassName} style={{ color: accentColor }} />
    ) : source.id === 'grid-export' ? (
      <PlugZap
        className={`${iconClassName} ${theme === 'light' ? 'text-amber-700' : 'text-amber-200'}`}
      />
    ) : source.id === 'solar' ? (
      <Sun className={iconClassName} style={{ color: themeColorValues.yellow }} />
    ) : source.id === 'gas' ? (
      <Flame className={iconClassName} style={{ color: themeColorValues.red }} />
    ) : (
      <Leaf className={iconClassName} style={{ color: themeColorValues.green }} />
    );

  return (
    <div
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${iconWrapClassName}`}
    >
      {iconNode}
    </div>
  );
}

function getSourceDiagnostics(sourceDiagnostics: EnergySourceDiagnostic[]) {
  return sourceDiagnostics.filter((source) => !source.id.startsWith('device:'));
}

function formatDiagnosticStatus(
  source: EnergySourceDiagnostic,
  t: ReturnType<typeof useI18n>['t']
) {
  if (source.status === 'configured_unavailable') {
    return t('common.unavailable');
  }

  if (source.status === 'configured_idle') {
    return t('energy.dashboard.status.idle');
  }

  if (source.status === 'not_configured') {
    return t('energy.dashboard.status.notConfigured');
  }

  if (typeof source.currentPowerW === 'number' && source.currentPowerW > 0) {
    return `${Math.round(source.currentPowerW)} W`;
  }

  if (typeof source.todayKWh === 'number') {
    return `${source.todayKWh.toFixed(1)} kWh`;
  }

  return t('widgets.generic.available');
}

function resolveHomeAssistantEnergyUrl(haBaseUrl: string | null): string | null {
  const energyPath = '/config/energy/dashboard';

  if (haBaseUrl) {
    try {
      return new URL(energyPath, haBaseUrl).toString();
    } catch {
      return energyPath;
    }
  }

  if (typeof window !== 'undefined' && window.location.pathname.includes('/api/hassio_ingress/')) {
    return energyPath;
  }

  return null;
}

function getLoadOrbMotionIntensity(loadW: number) {
  return Math.max(0.7, Math.min(1.9, 0.82 + loadW / 2200));
}

type LoadOrbDensity =
  | typeof LOAD_ORB_DENSITY_HIGH
  | typeof LOAD_ORB_DENSITY_MEDIUM
  | typeof LOAD_ORB_DENSITY_LOW;

function resolveLoadOrbDensity({
  disableAnimations,
  effectsQuality,
  lowPowerMode,
}: {
  disableAnimations: boolean;
  effectsQuality: 'high' | 'medium' | 'low';
  lowPowerMode: boolean;
}): LoadOrbDensity {
  if (disableAnimations || lowPowerMode || effectsQuality === 'low') {
    return LOAD_ORB_DENSITY_LOW;
  }

  if (effectsQuality === 'medium') {
    return LOAD_ORB_DENSITY_MEDIUM;
  }

  return LOAD_ORB_DENSITY_HIGH;
}

function buildOrbDots(motionIntensity = 1, density: LoadOrbDensity = LOAD_ORB_DENSITY_HIGH) {
  const dots: Array<{
    angle: number;
    delayS: number;
    driftX: number;
    driftY: number;
    durationS: number;
    id: string;
    opacity: number;
    ring: number;
    size: number;
    x: number;
    y: number;
  }> = [];
  const { radiusStart, radiusStep, ringCount, spokeCount } = density;

  for (let ring = 0; ring < ringCount; ring += 1) {
    const radius = radiusStart + ring * radiusStep;
    const driftAmplitude = Math.max(1.4, 2.3 - ring * 0.18) * motionIntensity;
    const durationScale = Math.max(0.62, 1.18 - (motionIntensity - 0.7) * 0.28);
    for (let index = 0; index < spokeCount; index += 1) {
      const angle = (index / spokeCount) * Math.PI * 2 - Math.PI / 2;
      const durationBase = LOAD_ORB_DRIFT_BASE_DURATION_S + ring * 0.4 + (index % 4) * 0.18;
      dots.push({
        angle,
        delayS: -((index / spokeCount) * durationBase * durationScale),
        driftX: Math.cos(angle) * driftAmplitude,
        driftY: Math.sin(angle) * driftAmplitude,
        durationS: durationBase * durationScale,
        id: `${ring}:${index}`,
        opacity: 0.92 - ring * 0.08,
        ring,
        size: 6.2 + (ringCount - 1 - ring) * 0.7,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    }
  }

  return dots;
}

function getLoadOrbSegmentAtAngle(angle: number, segments: LoadOrbSegment[]) {
  const fullTurn = Math.PI * 2;
  const progress = ((((angle + Math.PI) % fullTurn) + fullTurn) % fullTurn) / fullTurn;

  for (const segment of segments) {
    if (progress <= segment.end) {
      return segment;
    }
  }

  return segments.at(-1) ?? null;
}

function getLoadOrbSegmentTooltipPosition(segment: LoadOrbSegment) {
  const progress = segment.start + (segment.end - segment.start) / 2;
  const angle = progress * Math.PI * 2 - Math.PI;

  return {
    leftPercent: Math.max(22, Math.min(78, 50 + Math.cos(angle) * 34)),
    topPercent: Math.max(30, Math.min(88, 50 + Math.sin(angle) * 34)),
  };
}

interface LoadOrbSegment {
  color: string;
  end: number;
  id: string;
  label: string;
  share: number;
  start: number;
  value: number;
}

function getLoadOrbSegments({
  consumerColors,
  consumers,
  untrackedLabel,
  untrackedPowerW,
}: {
  consumerColors: ReadonlyMap<string, string>;
  consumers: EnergyConsumer[];
  untrackedLabel: string;
  untrackedPowerW: number;
}): LoadOrbSegment[] {
  const trackedConsumers = consumers
    .filter((consumer) => consumer.status === 'active' && consumer.powerW > 0)
    .sort((left, right) => right.powerW - left.powerW);
  const trackedTotal = trackedConsumers.reduce((sum, consumer) => sum + consumer.powerW, 0);
  const totalConsumption = trackedTotal + untrackedPowerW;

  if (totalConsumption <= 0) {
    return [];
  }

  const segmentInputs: Array<{
    color: string;
    id: string;
    label: string;
    value: number;
  }> = [];

  if (untrackedPowerW > 0) {
    segmentInputs.push({
      color: UNTRACKED_CONSUMPTION_COLOR,
      id: 'untracked',
      label: untrackedLabel,
      value: untrackedPowerW,
    });
  }

  for (const consumer of trackedConsumers) {
    segmentInputs.push({
      color: consumerColors.get(consumer.id) ?? ENERGY_CONSUMER_COLORS[0],
      id: consumer.id,
      label: consumer.name,
      value: consumer.powerW,
    });
  }

  const minVisibleShare = 0.035;
  const reserved = segmentInputs.length * minVisibleShare;
  const flexible = Math.max(0, 1 - reserved);
  let cursor = 0;

  return segmentInputs.map((segment) => {
    const start = cursor;
    const share = minVisibleShare + (segment.value / totalConsumption) * flexible;
    cursor += share;
    return {
      ...segment,
      end: Math.min(1, cursor),
      share: segment.value / totalConsumption,
      start,
    };
  });
}

function buildEnergyConsumerColorMap(consumers: EnergyConsumer[]) {
  return new Map(
    consumers.map((consumer, index) => [
      consumer.id,
      ENERGY_CONSUMER_COLORS[index % ENERGY_CONSUMER_COLORS.length],
    ])
  );
}
