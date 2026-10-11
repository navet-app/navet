import { BaseCard, CardMetric, CardMetricActionLayout } from '@navet/app/components/primitives';
import { EntityCardHeader } from '@navet/app/components/primitives/entity-card-header';
import { EntityCardHeaderIcon } from '@navet/app/components/primitives/entity-card-header-icon';
import { type CardSize, isCompactCardSize } from '@navet/app/components/shared/card-size-selector';
import { useEditModeSettingsRequest } from '@navet/app/components/shared/edit-mode-settings-request';
import { getCardReadableTextTokens } from '@navet/app/components/shared/theme/card-readable-text-tokens';
import { getCardShellSurfaceTokens } from '@navet/app/components/shared/theme/card-shell-surface-tokens';
import { getCardStateSurfaceTokens } from '@navet/app/components/shared/theme/card-state-surface-tokens';
import { cn } from '@navet/app/components/ui/utils';
import {
  useI18n,
  useProviderEntityModel,
  useProviderEntityRegistryEntries,
  useProviderEntitySnapshot,
  useProviderEntitySnapshots,
  useTheme,
} from '@navet/app/hooks';
import { useIntegrationStore } from '@navet/app/hooks/use-integration-store';
import { settingsSelectors } from '@navet/app/stores/selectors';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import { resolveEffectsQuality } from '@navet/app/utils/effects-quality';
import { parseProviderScopedId } from '@navet/app/utils/provider-ids';
import { Battery, Bot, Clock3, Fan, History, ScanSearch } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useVacuumControl } from '../vacuum/use-vacuum-control';
import { resolveVacuumCardSummary } from '../vacuum/vacuum-card-summary';
import { VacuumControlsMedium } from '../vacuum/vacuum-controls-medium';
import { VacuumControlsSmall } from '../vacuum/vacuum-controls-small';
import { resolveVacuumCapabilities, type VacuumCapabilities } from '../vacuum/vacuum-features';
import { resolveVacuumGlanceMetrics } from '../vacuum/vacuum-metrics';
import { VacuumSettingsDialog } from '../vacuum/vacuum-settings-dialog';
import {
  getVacuumThemeStatus,
  normalizeVacuumStatus,
  type VacuumStatus,
} from '../vacuum/vacuum-utils';

export type VacuumCardSize = 'small' | 'medium';
export type VacuumDisplayState = VacuumStatus | 'unavailable';
export type MotionLevel = 'high' | 'medium' | 'low';
type IllustrationPalette = {
  titleColor: string;
  subtitleColor: string;
};
type IllustrationSurface = {
  background: string;
  baseColor: string;
  shadow: string;
};

export interface VacuumCardProps {
  id: string;
  name: string;
  providerId?: IntegrationProviderId;
  rawStatus?: string;
  status: VacuumStatus;
  availability?: 'available' | 'unavailable' | 'unknown';
  battery?: number;
  cleanedArea?: string;
  cleaningTime?: string;
  nextCleaning?: string;
  waterLevel?: number | string;
  binLevel?: number | string;
  room?: string;
  lastCleaned?: string;
  size: CardSize;
  onSizeChange: (id: string, size: CardSize) => void;
  isEditMode: boolean;
}

export function normalizeVacuumCardSize(size: CardSize): VacuumCardSize {
  if (size === 'small' || size === 'medium') {
    return size;
  }

  return 'medium';
}

function normalizeVacuumDisplayName(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  const parts = trimmed.split(' ');

  if (parts.length % 2 === 0) {
    const half = parts.length / 2;
    const left = parts.slice(0, half).join(' ');
    const right = parts.slice(half).join(' ');

    if (left === right) {
      return left;
    }
  }

  return trimmed;
}

export function isMonochromeVacuumIllustrationState(displayState: VacuumDisplayState): boolean {
  return (
    displayState === 'idle' ||
    displayState === 'docked' ||
    displayState === 'charging' ||
    displayState === 'charging-complete'
  );
}

export function useVacuumMotionLevel(): MotionLevel {
  const disableAnimations = useSettingsStore(settingsSelectors.disableAnimations);
  const lowPowerMode = useSettingsStore(settingsSelectors.lowPowerMode);
  const effectsQuality = useSettingsStore(settingsSelectors.effectsQuality);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    setPrefersReducedMotion(mediaQuery.matches);
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  return resolveEffectsQuality(
    effectsQuality,
    disableAnimations || lowPowerMode || prefersReducedMotion
  );
}

export function resolveVacuumIllustrationPalette({
  theme,
  displayState,
  titleColor,
  subtitleColor,
}: {
  theme: ReturnType<typeof useTheme>['theme'];
  displayState: VacuumDisplayState;
  titleColor: string;
  subtitleColor: string;
}): IllustrationPalette {
  if (!isMonochromeVacuumIllustrationState(displayState)) {
    return { titleColor, subtitleColor };
  }

  switch (theme) {
    case 'light':
      return {
        titleColor: '#52525b',
        subtitleColor: '#71717a',
      };
    case 'glass':
      return {
        titleColor: '#d4d4d8',
        subtitleColor: '#a1a1aa',
      };
    default:
      return {
        titleColor: '#a1a1aa',
        subtitleColor: '#71717a',
      };
  }
}

export function resolveVacuumIllustrationSurface({
  theme,
  displayState,
  titleColor,
}: {
  theme: ReturnType<typeof useTheme>['theme'];
  displayState: VacuumDisplayState;
  titleColor: string;
}): IllustrationSurface {
  if (displayState === 'error') {
    return {
      background: 'radial-gradient(circle at top, rgba(251,191,36,0.16), rgba(15,23,42,0.92) 66%)',
      baseColor: '#0f172a',
      shadow: `0 24px 54px -28px ${titleColor}33`,
    };
  }

  if (isMonochromeVacuumIllustrationState(displayState)) {
    const restingBase =
      theme === 'light'
        ? 'rgba(244,244,245,0.96)'
        : theme === 'glass'
          ? 'rgba(255,255,255,0.055)'
          : 'rgba(24,24,27,0.96)';
    const restingBaseColor =
      theme === 'light' ? '#f4f4f5' : theme === 'glass' ? 'rgba(255,255,255,0.055)' : '#18181b';

    return {
      background:
        theme === 'light'
          ? `radial-gradient(circle at top, rgba(255,255,255,0.92), ${restingBase} 68%)`
          : theme === 'glass'
            ? `radial-gradient(circle at 30% 18%, rgba(255,255,255,0.18), ${restingBase} 68%)`
            : `radial-gradient(circle at top, rgba(255,255,255,0.06), ${restingBase} 68%)`,
      baseColor: restingBaseColor,
      shadow: `0 18px 38px -28px ${titleColor}1f`,
    };
  }

  return {
    background: 'radial-gradient(circle at top, rgba(255,255,255,0.18), rgba(15,23,42,0.94) 66%)',
    baseColor: '#0f172a',
    shadow: `0 24px 54px -28px ${titleColor}33`,
  };
}

type SharedCardSummary = ReturnType<typeof resolveVacuumCardSummary>;

function VacuumStatusMetric({
  primaryText,
  secondaryFacts,
  size,
  titleColor,
  subtitleColor,
  theme,
  className,
}: {
  primaryText: string;
  secondaryFacts: SharedCardSummary['secondaryFacts'];
  size: VacuumCardSize;
  titleColor: string;
  subtitleColor: string;
  theme: ReturnType<typeof useTheme>['theme'];
  className?: string;
}) {
  const valueSizeStyle =
    size === 'medium'
      ? { fontSize: '1.6rem', lineHeight: 0.96 }
      : { fontSize: '1.2rem', lineHeight: 0.98 };
  const shouldWrapFacts = size === 'small' && secondaryFacts.length > 1;

  return (
    <CardMetric
      value={primaryText}
      label={
        secondaryFacts.length > 0 ? (
          <span
            className={cn(
              'min-w-0 text-xs leading-4 text-inherit',
              shouldWrapFacts
                ? 'flex flex-wrap items-start gap-x-2 gap-y-1 whitespace-normal'
                : 'flex items-center gap-2 overflow-hidden whitespace-nowrap'
            )}
          >
            {secondaryFacts.map((fact) => {
              const Icon =
                fact.kind === 'area'
                  ? ScanSearch
                  : fact.kind === 'battery'
                    ? Battery
                    : fact.kind === 'time'
                      ? Clock3
                      : fact.kind === 'speed'
                        ? Fan
                        : History;

              return (
                <span
                  key={`${fact.kind}-${fact.value}`}
                  className={cn(
                    'inline-flex min-w-0 items-center gap-2',
                    shouldWrapFacts ? 'max-w-full shrink-0' : 'shrink'
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex min-w-0 items-center gap-1',
                      shouldWrapFacts ? 'max-w-full shrink-0' : 'shrink'
                    )}
                    title={`${fact.label} ${fact.value}`}
                  >
                    <Icon className="h-3 w-3 shrink-0 opacity-75" aria-hidden="true" />
                    <span className={shouldWrapFacts ? 'whitespace-normal' : 'truncate'}>
                      {fact.value}
                    </span>
                  </span>
                </span>
              );
            })}
          </span>
        ) : undefined
      }
      size="sm"
      isActive
      accentClassName="card-primary-text"
      theme={theme}
      className={className}
      valueStyle={{ color: titleColor, ...valueSizeStyle }}
      labelStyle={{ color: subtitleColor, fontSize: '0.75rem', lineHeight: '1rem' }}
      labelClassName="text-inherit"
    />
  );
}

function CompactMetricContent({
  size,
  summary,
  titleColor,
  subtitleColor,
  theme,
}: {
  size: VacuumCardSize;
  summary: SharedCardSummary;
  titleColor: string;
  subtitleColor: string;
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  const contentClassName = size === 'medium' ? 'min-w-0 flex-1 pr-24' : 'min-w-0 flex-1';

  return (
    <div className="flex min-h-0 items-start justify-start">
      <VacuumStatusMetric
        primaryText={summary.primaryText}
        secondaryFacts={summary.secondaryFacts}
        size={size}
        titleColor={titleColor}
        subtitleColor={subtitleColor}
        theme={theme}
        className={contentClassName}
      />
    </div>
  );
}

export function getCompactVisualClassName(size: VacuumCardSize): string {
  return size === 'medium'
    ? 'pointer-events-none absolute inset-x-0 bottom-0 z-0 overflow-visible'
    : 'pointer-events-none absolute right-[-1.1rem] top-[-0.2rem] z-0 h-[6.3rem] min-h-0 w-[6.3rem]';
}

function resolveVacuumCardStatusSource(entity: {
  state?: unknown;
  attributes?: Record<string, unknown>;
}): unknown {
  const entityState = typeof entity.state === 'string' ? entity.state : undefined;
  const attributeCandidates = [
    entity.attributes?.status,
    entity.attributes?.state,
    entity.attributes?.activity,
  ];
  const sleepingAttribute = attributeCandidates.find(
    (value) =>
      typeof value === 'string' && value.trim().toLowerCase().replace(/\s+/g, '_') === 'sleeping'
  );

  if (
    typeof entityState === 'string' &&
    entityState.trim().toLowerCase().replace(/\s+/g, '_') === 'docked' &&
    typeof sleepingAttribute === 'string'
  ) {
    return sleepingAttribute;
  }

  return entityState ?? attributeCandidates.find((value) => typeof value === 'string');
}

function formatRawVacuumStatus(value: string): string {
  const normalized = value
    .trim()
    .replace(/[_\s]+/g, ' ')
    .toLowerCase();
  if (normalized.length === 0) {
    return value;
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export interface SharedVacuumCardState {
  id: string;
  resolvedSize: VacuumCardSize;
  liveName: string;
  liveRoom?: string;
  subtitle: string;
  computedStatus: VacuumStatus;
  currentStatus: VacuumStatus;
  displayState: VacuumDisplayState;
  isLawnMower: boolean;
  isUnavailable: boolean;
  isActive: boolean;
  theme: ReturnType<typeof useTheme>['theme'];
  accentColor: ReturnType<typeof useTheme>['accentColor'];
  frameClassName: string;
  overlay: ReactNode;
  headerTone: 'primary' | 'purple' | 'amber' | 'neutral';
  headerAccentColor: string | null;
  primaryTextClassName?: string;
  mutedTextClassName?: string;
  motionLevel: MotionLevel;
  illustrationPalette: IllustrationPalette;
  cardSummary: SharedCardSummary;
  displayCapabilities: VacuumCapabilities;
  vacuumCapabilities: VacuumCapabilities;
  liveFanSpeed?: string;
  liveFanSpeeds?: string[];
  isDialogOpen: boolean;
  setIsDialogOpen: (open: boolean) => void;
  handleStartCleaning: () => void;
  handleStartAreaCleaning: (areaIds: string[]) => void;
  handlePause: () => void;
  handleStop: () => void;
  handleReturnHome: () => void;
  handleLocate: () => void;
  handleCleanSpot: () => void;
  handleSetFanSpeed: (speed: string) => void;
  isUpdatingFanSpeed: boolean;
}

export function useVacuumCardState(
  {
    id,
    name,
    providerId,
    rawStatus,
    status,
    availability,
    battery,
    cleanedArea,
    cleaningTime,
    nextCleaning,
    waterLevel,
    binLevel,
    room,
    lastCleaned,
    size,
    isEditMode,
  }: VacuumCardProps,
  options: { entityVariant: 'vacuum' | 'lawn-mower' }
): SharedVacuumCardState {
  const resolvedSize = normalizeVacuumCardSize(size);
  const providerEntity = useProviderEntityModel(id);
  const currentProviderId = useIntegrationStore((state) => state.currentProviderId);
  const resolvedProviderId =
    providerEntity?.providerId ??
    providerId ??
    parseProviderScopedId(id)?.providerId ??
    currentProviderId;
  const isHomeAssistantProvider = resolvedProviderId === 'home_assistant';
  const liveEntity = useProviderEntitySnapshot(id);
  const allEntities = useProviderEntitySnapshots({
    providerId: resolvedProviderId,
    enabled: isHomeAssistantProvider,
  });
  const entityRegistry = useProviderEntityRegistryEntries({
    providerId: resolvedProviderId,
    enabled: isHomeAssistantProvider,
  });
  const use24HourTime = useSettingsStore(settingsSelectors.use24HourTime);
  const liveAttrs = liveEntity?.attributes;
  const rawLiveStatus = resolveVacuumCardStatusSource({
    state: liveEntity?.state,
    attributes: liveAttrs,
  });
  const liveStatus = normalizeVacuumStatus(rawLiveStatus, status);
  const vacuumCapabilities = resolveVacuumCapabilities({
    providerEntity,
    vacuumEntity: liveEntity,
  });
  const {
    currentStatus,
    isDialogOpen,
    setIsDialogOpen,
    isUpdatingFanSpeed,
    displayFanSpeed,
    handleStartCleaning,
    handleStartAreaCleaning,
    handlePause,
    handleStop,
    handleReturnHome,
    handleLocate,
    handleCleanSpot,
    handleSetFanSpeed,
  } = useVacuumControl({
    entityId: id,
    providerId: resolvedProviderId,
    initialStatus: liveStatus,
    currentFanSpeed: vacuumCapabilities.currentFanSpeed,
  });
  const motionLevel = useVacuumMotionLevel();
  useEditModeSettingsRequest(id, () => setIsDialogOpen(true), Boolean(isEditMode));
  const liveName =
    typeof liveAttrs?.friendly_name === 'string' && liveAttrs.friendly_name.length > 0
      ? normalizeVacuumDisplayName(liveAttrs.friendly_name)
      : normalizeVacuumDisplayName(name);
  const glanceMetrics = resolveVacuumGlanceMetrics({
    vacuumEntity: liveEntity,
    vacuumEntityId: id,
    fallbackBattery: battery,
    fallbackCleanedArea: cleanedArea,
    fallbackCleaningTime: cleaningTime,
    fallbackNextCleaning: nextCleaning,
    fallbackWaterLevel: waterLevel,
    fallbackBinLevel: binLevel,
    use24HourTime,
    entities: allEntities,
    entityRegistry,
  });
  const liveBattery = glanceMetrics.battery;
  const liveFanSpeed = vacuumCapabilities.currentFanSpeed;
  const liveFanSpeeds = vacuumCapabilities.fanSpeedOptions;
  const rawDisplayStatusSource = typeof rawLiveStatus === 'string' ? rawLiveStatus : rawStatus;
  const rawDisplayStatus =
    typeof rawDisplayStatusSource === 'string' && rawDisplayStatusSource.trim().length > 0
      ? formatRawVacuumStatus(rawDisplayStatusSource)
      : undefined;
  const shouldInferDockedAsCharging = options.entityVariant !== 'lawn-mower';
  const computedStatus: VacuumStatus =
    currentStatus === 'charging'
      ? typeof liveBattery === 'number' && liveBattery >= 100
        ? 'charging-complete'
        : 'charging'
      : shouldInferDockedAsCharging && currentStatus === 'docked' && typeof liveBattery === 'number'
        ? liveBattery >= 100
          ? 'charging-complete'
          : 'charging'
        : currentStatus;
  const liveRoom =
    typeof liveAttrs?.current_room === 'string' && liveAttrs.current_room.length > 0
      ? liveAttrs.current_room
      : typeof liveAttrs?.current_zone === 'string' && liveAttrs.current_zone.length > 0
        ? liveAttrs.current_zone
        : typeof liveAttrs?.room === 'string' && liveAttrs.room.length > 0
          ? liveAttrs.room
          : room;
  const liveCurrentRoom =
    typeof liveAttrs?.current_room === 'string' && liveAttrs.current_room.length > 0
      ? liveAttrs.current_room
      : typeof liveAttrs?.current_zone === 'string' && liveAttrs.current_zone.length > 0
        ? liveAttrs.current_zone
        : undefined;
  const liveCleanedArea = glanceMetrics.cleanedArea;
  const liveCleaningTime = glanceMetrics.cleaningTime;
  const liveLastCleaned = glanceMetrics.lastCleaned ?? lastCleaned;
  const isUnavailable =
    availability === 'unavailable' ||
    providerEntity?.availability === 'unavailable' ||
    (typeof liveEntity?.state === 'string' && liveEntity.state.toLowerCase() === 'unavailable');
  const displayState: VacuumDisplayState = isUnavailable ? 'unavailable' : computedStatus;
  const { theme, colors, accentColor } = useTheme();
  const cardShell = getCardShellSurfaceTokens(theme);
  const { t } = useI18n();
  const isActive =
    displayState === 'cleaning' || displayState === 'mopping' || displayState === 'returning';
  const stateSurface = getCardStateSurfaceTokens(theme, isActive);
  const vacuumThemeStatus = getVacuumThemeStatus(
    displayState === 'unavailable' ? 'docked' : displayState
  );
  const cardColors = colors.vacuum[vacuumThemeStatus];
  const activeShellBackgroundClassName = isActive ? `bg-gradient-to-br ${cardColors.gradient}` : '';
  const frameClassName = cn(
    cardShell.rootFrameClassName,
    activeShellBackgroundClassName,
    cardColors.border,
    stateSurface.containerClassName,
    isUnavailable && 'opacity-80 saturate-[0.72]'
  );
  const headerTone =
    displayState === 'returning'
      ? 'purple'
      : displayState === 'cleaning' || displayState === 'mopping'
        ? 'primary'
        : displayState === 'error'
          ? 'amber'
          : 'neutral';
  const headerAccentColor = headerTone === 'primary' ? accentColor : null;
  const metricReadableTokens = getCardReadableTextTokens({
    theme,
    tone: headerTone,
    accentColor: headerAccentColor,
  });
  const illustrationPalette = resolveVacuumIllustrationPalette({
    theme,
    displayState,
    titleColor: metricReadableTokens.titleColor,
    subtitleColor: metricReadableTokens.subtitleColor,
  });
  const cardSummary = resolveVacuumCardSummary({
    status: displayState,
    rawStatus: rawDisplayStatus,
    isLawnMower: options.entityVariant === 'lawn-mower',
    currentRoom: liveCurrentRoom,
    battery: liveBattery,
    cleanedArea: liveCleanedArea,
    cleaningTime: liveCleaningTime,
    fanSpeed: displayFanSpeed,
    lastCleaned: liveLastCleaned,
    t: (key) => t(key as never),
  });
  const displayCapabilities: VacuumCapabilities = {
    ...vacuumCapabilities,
    currentFanSpeed: displayFanSpeed,
  };

  return {
    id,
    resolvedSize,
    liveName,
    liveRoom,
    subtitle: t(options.entityVariant === 'lawn-mower' ? 'lawnMower.subtitle' : 'vacuum.subtitle'),
    computedStatus,
    currentStatus,
    displayState,
    isLawnMower: options.entityVariant === 'lawn-mower',
    isUnavailable,
    isActive,
    theme,
    accentColor,
    frameClassName,
    overlay: (
      <>
        {isActive ? (
          <div className={`absolute inset-0 bg-gradient-to-br ${cardColors.glow} to-transparent`} />
        ) : null}
        {stateSurface.overlayClassName ? (
          <div className={`absolute inset-0 ${stateSurface.overlayClassName}`} />
        ) : null}
        {isUnavailable ? <div className="absolute inset-0 bg-slate-950/12" /> : null}
      </>
    ),
    headerTone,
    headerAccentColor,
    primaryTextClassName: stateSurface.primaryTextClassName,
    mutedTextClassName: stateSurface.mutedTextClassName,
    motionLevel,
    illustrationPalette,
    cardSummary,
    displayCapabilities,
    vacuumCapabilities,
    liveFanSpeed,
    liveFanSpeeds,
    isDialogOpen,
    setIsDialogOpen,
    handleStartCleaning,
    handleStartAreaCleaning,
    handlePause,
    handleStop,
    handleReturnHome,
    handleLocate,
    handleCleanSpot,
    handleSetFanSpeed,
    isUpdatingFanSpeed,
  };
}

export function SharedVacuumCardShell({
  state,
  compactVisual,
}: {
  state: SharedVacuumCardState;
  compactVisual?: ReactNode;
}) {
  const controls = isCompactCardSize(state.resolvedSize) ? (
    <VacuumControlsSmall
      currentStatus={state.currentStatus}
      isLawnMower={state.isLawnMower}
      onStartCleaning={state.handleStartCleaning}
      onPause={state.handlePause}
      onStop={state.handleStop}
      onReturnHome={state.handleReturnHome}
      onLocate={state.handleLocate}
      onCleanSpot={state.handleCleanSpot}
      onCycleFanSpeed={state.handleSetFanSpeed}
      onOpenSettings={() => state.setIsDialogOpen(true)}
      theme={state.theme}
      capabilities={state.displayCapabilities}
      isUpdatingFanSpeed={state.isUpdatingFanSpeed}
      disabled={state.isUnavailable}
    />
  ) : (
    <VacuumControlsMedium
      currentStatus={state.currentStatus}
      isLawnMower={state.isLawnMower}
      onStartCleaning={state.handleStartCleaning}
      onPause={state.handlePause}
      onStop={state.handleStop}
      onReturnHome={state.handleReturnHome}
      onLocate={state.handleLocate}
      onCleanSpot={state.handleCleanSpot}
      onCycleFanSpeed={state.handleSetFanSpeed}
      onOpenSettings={() => state.setIsDialogOpen(true)}
      theme={state.theme}
      capabilities={state.displayCapabilities}
      isUpdatingFanSpeed={state.isUpdatingFanSpeed}
      disabled={state.isUnavailable}
    />
  );

  const compactMetric = (
    <CompactMetricContent
      size={state.resolvedSize}
      summary={state.cardSummary}
      titleColor={state.illustrationPalette.titleColor}
      subtitleColor={state.illustrationPalette.subtitleColor}
      theme={state.theme}
    />
  );

  return (
    <div className="relative h-full w-full">
      <BaseCard
        size={state.resolvedSize}
        frameClassName={state.frameClassName}
        disableDefaultSheen
        overlay={state.overlay}
        contentClassName="h-full"
      >
        <div className="relative flex h-full flex-col">
          {state.resolvedSize === 'medium' ? compactVisual : null}
          <div className="relative z-10 flex h-full flex-col">
            <EntityCardHeader
              title={state.liveName}
              subtitle={state.subtitle}
              layout="eyebrow-first"
              size={state.resolvedSize}
              accentColor={state.headerAccentColor}
              tone={state.headerTone}
              titleClassName={state.primaryTextClassName}
              subtitleClassName={state.mutedTextClassName}
              leading={
                <EntityCardHeaderIcon
                  IconComponent={Bot}
                  isActive={state.isActive}
                  size={state.resolvedSize}
                  baseColor={state.headerAccentColor}
                  tone={state.headerTone}
                />
              }
            />

            <CardMetricActionLayout
              size={state.resolvedSize}
              className="pt-1"
              metric={compactMetric}
              actions={controls}
            />
          </div>
        </div>
      </BaseCard>

      {state.isDialogOpen ? (
        <VacuumSettingsDialog
          entityId={state.id}
          isOpen={state.isDialogOpen}
          disabled={state.isUnavailable}
          onClose={() => state.setIsDialogOpen(false)}
          isLawnMower={state.isLawnMower}
          onStartCleaning={state.handleStartCleaning}
          onPauseCleaning={state.handlePause}
          onStopCleaning={state.handleStop}
          onReturnHome={state.handleReturnHome}
          name={state.liveName}
          room={state.liveRoom ?? ''}
          theme={state.theme}
          accentColorValue={state.accentColor}
          currentStatus={state.computedStatus}
          fanSpeed={state.liveFanSpeed}
          fanSpeeds={state.liveFanSpeeds}
          supportsFanSpeed={state.vacuumCapabilities.canSetFanSpeed}
          capabilities={state.vacuumCapabilities}
          onSetFanSpeed={state.handleSetFanSpeed}
          isUpdatingFanSpeed={state.isUpdatingFanSpeed}
          availableCleaningAreas={state.vacuumCapabilities.availableCleaningAreas}
          onStartAreaCleaning={state.handleStartAreaCleaning}
          onLocate={state.handleLocate}
          onCleanSpot={state.handleCleanSpot}
        />
      ) : null}
    </div>
  );
}
