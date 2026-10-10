import { CardDialogOverflowMenu } from '@navet/app/components/patterns/card-dialog-overflow-menu';
import { CardErrorBoundary } from '@navet/app/components/shared/card-error-boundary';
import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import { getBaseCardRadiusClassName } from '@navet/app/components/system/tokens';
import {
  type NavetMediaCapabilities,
  readNavetCameraState,
  readNavetClimateState,
  readNavetCoverState,
  readNavetLockState,
  readNavetMediaState,
  readNavetPersonState,
  readNavetSensorState,
} from '@navet/app/core/navet-device-state';
import type { MediaDialogMediaStackSettings } from '@navet/app/features/media/components/media/media-dialog.types';
import type { CoverState } from '@navet/app/features/security/components/cover-card/types';
import type { SensorReading } from '@navet/app/features/sensors/components/sensors';
import type { VacuumStatus } from '@navet/app/features/vacuum/components/vacuum/vacuum-utils';
import { isLawnMowerEntityId } from '@navet/app/features/vacuum/components/vacuum/vacuum-utils';
import { useI18n, useIntegrationStore } from '@navet/app/hooks';
import { useEntityIntegrationReload } from '@navet/app/hooks/use-entity-integration-reload';
import { useTheme } from '@navet/app/hooks/use-theme';
import type { IntegrationStore } from '@navet/app/stores/integration-store';
import { integrationSelectors, settingsSelectors } from '@navet/app/stores/selectors';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import type { DeviceMetric, SecuritySeverity } from '@navet/app/types/device.types';
import { type IntegrationProviderId, isIntegrationProviderId } from '@navet/app/types/provider';
import { resolveEffectsQuality } from '@navet/app/utils/effects-quality';
import { parseProviderScopedId } from '@navet/app/utils/provider-ids';
import type { NavetAlarmEntity } from '@navet/core/alarm-types';
import type { NavetEntity } from '@navet/core/types';
import { lazy, type ReactElement, type ReactNode, Suspense, useCallback, useMemo } from 'react';

interface DeviceData {
  id: string;
  type: string;
  securitySeverity?: SecuritySeverity;
  [key: string]: string | number | boolean | string[] | object | undefined;
}

interface CardRendererOptions {
  device: DeviceData;
  size: CardSize;
  handleSizeChange: (id: string, size: CardSize) => void;
  isEditMode: boolean;
  headerSubtitleOverride?: string;
  presentationVariant?: 'media-stack';
  mediaStackSettings?: MediaDialogMediaStackSettings;
  onRemoveCard?: () => void;
  removeCardLabel?: string;
}

type CardRenderFn = (options: CardRendererOptions) => ReactElement | null;
type CardProviderId = IntegrationProviderId | undefined;

const CalendarCard = lazy(async () => {
  const module = await import('@navet/app/features/calendar');
  return { default: module.CalendarCard };
});

const ClimateCard = lazy(async () => {
  const module = await import('@navet/app/features/climate');
  return { default: module.ClimateCard };
});

const HumidifierCard = lazy(async () => {
  const module = await import('@navet/app/features/climate');
  return { default: module.HumidifierCard };
});

const LightCard = lazy(async () => {
  const module = await import('@navet/app/features/lighting');
  return { default: module.LightCard };
});

const FanCard = lazy(async () => {
  const module = await import('@navet/app/features/lighting');
  return { default: module.FanCard };
});

const SwitchCard = lazy(async () => {
  const module = await import('@navet/app/features/lighting');
  return { default: module.SwitchCard };
});

const MediaCard = lazy(async () => {
  const module = await import('@navet/app/features/media');
  return { default: module.MediaCard };
});

const PersonCard = lazy(async () => {
  const module = await import('@navet/app/features/person');
  return { default: module.PersonCard };
});

const SceneCard = lazy(async () => {
  const module = await import('@navet/app/features/scenes');
  return { default: module.SceneCard };
});

const CameraCard = lazy(async () => {
  const module = await import('@navet/app/features/security');
  return { default: module.CameraCard };
});

const CoverCard = lazy(async () => {
  const module = await import('@navet/app/features/security');
  return { default: module.CoverCard };
});

const LockCard = lazy(async () => {
  const module = await import('@navet/app/features/security');
  return { default: module.LockCard };
});

const SecurityPanelCard = lazy(async () => {
  const module = await import('@navet/app/features/security');
  return { default: module.SecurityPanelCard };
});

const GroupedSensorCard = lazy(async () => {
  const module = await import('@navet/app/features/sensors');
  return { default: module.GroupedSensorCard };
});

const InfoCard = lazy(async () => {
  const module = await import('@navet/app/features/sensors');
  return { default: module.InfoCard };
});

const VacuumCard = lazy(async () => {
  const module = await import('@navet/app/features/vacuum');
  return { default: module.VacuumCard };
});

const LawnMowerCard = lazy(async () => {
  const module = await import('@navet/app/features/vacuum');
  return { default: module.LawnMowerCard };
});

const WeatherCard = lazy(async () => {
  const module = await import('@navet/app/features/weather');
  return { default: module.WeatherCard };
});

function EntityCardFallback({ size }: { size: CardSize }) {
  return (
    <div
      className={`h-full w-full ${getBaseCardRadiusClassName(size)} border border-white/8 bg-white/5`}
      aria-hidden="true"
    />
  );
}

function readUnavailableState(device: DeviceData): string | undefined {
  const value = device.state;
  if (typeof value === 'string') {
    return value;
  }

  return undefined;
}

function readProviderEntityStateValue(entity: NavetEntity): string | undefined {
  switch (entity.type) {
    case 'camera':
      return readNavetCameraState(entity)?.value;
    case 'climate':
    case 'hvac':
      return readNavetClimateState(entity)?.value;
    case 'cover':
      return readNavetCoverState(entity)?.value;
    case 'lock':
      return readNavetLockState(entity)?.value;
    case 'media_player':
      return readNavetMediaState(entity)?.value;
    case 'person':
      return readNavetPersonState(entity)?.value;
    case 'sensor':
    case 'binary_sensor':
    case 'grouped_sensor':
    case 'energy':
    case 'unknown':
      return readNavetSensorState(entity)?.value;
    default:
      return typeof entity.attributes?.value === 'string'
        ? entity.attributes.value
        : typeof entity.primaryState === 'string'
          ? entity.primaryState
          : undefined;
  }
}

function resolveAvailabilityProviderId(
  deviceId: string,
  currentProviderId: ReturnType<typeof integrationSelectors.currentProviderId>
) {
  return parseProviderScopedId(deviceId)?.providerId ?? currentProviderId;
}

function getProviderEntityByLookup(
  state: IntegrationStore,
  providerId: IntegrationProviderId,
  entityId: string
): NavetEntity | null {
  const entities = state.providerEntitiesByProviderId[providerId] ?? {};
  const canonicalId =
    entities[entityId]?.canonicalId ??
    state.providerEntityLookupByProviderId[providerId]?.[entityId];

  return canonicalId ? (entities[canonicalId] ?? null) : null;
}

function readAlarmEntityFromCardDevice(device: DeviceData): NavetAlarmEntity | null {
  if (
    device.type !== 'sensors' ||
    typeof device.alarmState !== 'string' ||
    typeof device.name !== 'string' ||
    typeof device.id !== 'string' ||
    typeof device.providerId !== 'string' ||
    !isIntegrationProviderId(device.providerId)
  ) {
    return null;
  }

  return {
    id: device.id,
    name: device.name,
    state: device.alarmState as NavetAlarmEntity['state'],
    supportedActions: Array.isArray(device.alarmSupportedActions)
      ? device.alarmSupportedActions.filter(
          (action): action is NavetAlarmEntity['supportedActions'][number] =>
            typeof action === 'string'
        )
      : [],
    codeFormat:
      device.alarmCodeFormat === 'number' || device.alarmCodeFormat === 'text'
        ? device.alarmCodeFormat
        : 'none',
    requiresCode:
      typeof device.alarmRequiresCode === 'boolean' ? device.alarmRequiresCode : undefined,
    changedBy: typeof device.alarmChangedBy === 'string' ? device.alarmChangedBy : undefined,
    lastChanged: typeof device.alarmLastChanged === 'string' ? device.alarmLastChanged : undefined,
    provider: device.providerId,
    availability:
      device.availability === 'available' ||
      device.availability === 'unavailable' ||
      device.availability === 'unknown'
        ? device.availability
        : undefined,
  };
}

export function selectCardIsUnavailable(
  state: IntegrationStore,
  entityIds: readonly string[],
  currentProviderId: ReturnType<typeof integrationSelectors.currentProviderId>,
  fallbackState?: string
) {
  if (entityIds.length === 0) {
    return false;
  }

  return entityIds.every((entityId) => {
    const providerId = resolveAvailabilityProviderId(entityId, currentProviderId);
    const providerEntity = getProviderEntityByLookup(state, providerId, entityId);
    const entityState = providerEntity
      ? readProviderEntityStateValue(providerEntity)
      : fallbackState;

    return entityState === 'unavailable';
  });
}

export function useCardIsUnavailable(
  entityIds: readonly string[],
  currentProviderId: ReturnType<typeof integrationSelectors.currentProviderId>,
  fallbackState?: string
) {
  const selectUnavailable = useCallback(
    (state: IntegrationStore) =>
      selectCardIsUnavailable(state, entityIds, currentProviderId, fallbackState),
    [currentProviderId, entityIds, fallbackState]
  );

  return useIntegrationStore(selectUnavailable, Object.is);
}

function UnavailableEntityOverlay({
  entityId,
  size,
  isEditMode,
  shouldReducePaintEffects,
}: {
  entityId?: string;
  size: CardSize;
  isEditMode: boolean;
  shouldReducePaintEffects: boolean;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const recovery = useEntityIntegrationReload(entityId);
  const showRecovery = !isEditMode && recovery.available;
  const isTinyAvailabilityCard = size === 'tiny';
  const isCompactAvailabilityCard = isTinyAvailabilityCard || size === 'extra-small';
  return (
    <>
      {showRecovery ? (
        <div className="absolute right-1 top-1 z-40">
          <CardDialogOverflowMenu
            theme={theme}
            sections={[]}
            onSectionChange={() => undefined}
            entityId={entityId}
          />
        </div>
      ) : null}
      <div
        className={`pointer-events-none absolute inset-0 z-30 flex justify-center ${
          showRecovery && isTinyAvailabilityCard ? 'items-end pb-2' : 'items-center'
        }`}
      >
        <div
          className={`inline-flex max-w-[calc(100%-1rem)] items-center justify-center truncate rounded-full border border-white/12 bg-black/45 font-semibold text-white/92 ${
            isTinyAvailabilityCard
              ? 'px-1.5 py-0.5 text-[10px] leading-none tracking-[0.02em]'
              : isCompactAvailabilityCard
                ? 'px-2 py-0.5 text-[11px] leading-none tracking-[0.04em]'
                : 'px-2.5 py-1 text-xs tracking-[0.06em] uppercase'
          } ${shouldReducePaintEffects ? '' : 'backdrop-blur-md'}`}
        >
          {t('camera.status.unavailable')}
        </div>
      </div>
    </>
  );
}

function EntityAvailabilityFrame({
  device,
  isEditMode,
  size,
  children,
}: {
  device: DeviceData;
  isEditMode: boolean;
  size: CardSize;
  children: ReactNode;
}) {
  const effectsQuality = useSettingsStore(settingsSelectors.effectsQuality);
  const lowPowerMode = useSettingsStore(settingsSelectors.lowPowerMode);
  const currentProviderId = useIntegrationStore(integrationSelectors.currentProviderId);
  const shouldReducePaintEffects = resolveEffectsQuality(effectsQuality, lowPowerMode) !== 'high';
  const entityIdsKey = JSON.stringify(
    (() => {
      const sourceIds = device.sourceIds;
      if (Array.isArray(sourceIds) && sourceIds.every((value) => typeof value === 'string')) {
        return sourceIds;
      }

      return typeof device.id === 'string' ? [device.id] : [];
    })()
  );
  const entityIds = useMemo(() => {
    return JSON.parse(entityIdsKey) as string[];
  }, [entityIdsKey]);
  const isUnavailable = useCardIsUnavailable(
    entityIds,
    currentProviderId,
    readUnavailableState(device)
  );
  const usesDedicatedUnavailableState = device.type === 'cameras';

  if (!isUnavailable || usesDedicatedUnavailableState) {
    return <>{children}</>;
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-3xl">
      <div
        inert={!isEditMode}
        className={`pointer-events-none h-full w-full opacity-45 ${
          shouldReducePaintEffects ? '' : 'saturate-50'
        }`}
      >
        {children}
      </div>
      <div
        className={`pointer-events-none absolute inset-0 z-10 rounded-[inherit] bg-black/18 ${
          shouldReducePaintEffects ? '' : 'backdrop-blur-[1px]'
        }`}
      />
      {!isEditMode ? (
        <div className="pointer-events-auto absolute inset-0 z-20 rounded-[inherit]" />
      ) : null}
      <UnavailableEntityOverlay
        entityId={entityIds.length === 1 ? entityIds[0] : undefined}
        size={size}
        isEditMode={isEditMode}
        shouldReducePaintEffects={shouldReducePaintEffects}
      />
    </div>
  );
}

const cardRegistry: Partial<Record<string, CardRenderFn>> = {
  lights: ({ device, size, handleSizeChange, isEditMode, onRemoveCard, removeCardLabel }) => (
    <LightCard
      onRemoveCard={onRemoveCard}
      removeCardLabel={removeCardLabel}
      id={device.id as string}
      name={device.name as string}
      room={device.room as string}
      providerId={device.providerId as CardProviderId}
      initialState={device.state as boolean | undefined}
      initialBrightness={device.brightness as number | undefined}
      initialTemp={device.temp as number | undefined}
      size={size}
      onSizeChange={handleSizeChange}
      isEditMode={isEditMode}
    />
  ),

  fans: ({ device, size, handleSizeChange, isEditMode }) => (
    <FanCard
      id={device.id as string}
      name={device.name as string}
      room={device.room as string}
      providerId={device.providerId as CardProviderId}
      initialState={device.state as boolean | undefined}
      initialPercentage={device.percentage as number | undefined}
      size={size}
      onSizeChange={handleSizeChange}
      isEditMode={isEditMode}
    />
  ),

  climate: ({ device, size, handleSizeChange, isEditMode, headerSubtitleOverride }) => (
    <ClimateCard
      id={device.id as string}
      name={device.name as string}
      room={device.room as string}
      providerId={device.providerId as CardProviderId}
      headerSubtitle={headerSubtitleOverride}
      initialTemp={device.temperature as number | undefined}
      initialCurrentTemp={device.currentTemperature as number | undefined}
      temperatureUnit={device.temperatureUnit as 'celsius' | 'fahrenheit' | undefined}
      initialMode={device.mode as string | undefined}
      initialAction={device.action as string | undefined}
      supportedClimateModes={
        (device.supportedClimateModes ?? device.supportedHvacModes) as string[] | undefined
      }
      initialState={(device.mode as string | undefined) !== 'off'}
      size={size}
      onSizeChange={handleSizeChange}
      isEditMode={isEditMode}
    />
  ),

  hvac: ({ device, size, handleSizeChange, isEditMode, headerSubtitleOverride }) => (
    <ClimateCard
      id={device.id as string}
      name={device.name as string}
      room={device.room as string}
      providerId={device.providerId as CardProviderId}
      headerSubtitle={headerSubtitleOverride}
      initialTemp={(device.temperature ?? device.temp) as number | undefined}
      initialCurrentTemp={device.currentTemperature as number | undefined}
      temperatureUnit={device.temperatureUnit as 'celsius' | 'fahrenheit' | undefined}
      initialMode={device.mode as string | undefined}
      initialAction={device.action as string | undefined}
      supportedClimateModes={
        (device.supportedClimateModes ?? device.supportedHvacModes) as string[] | undefined
      }
      initialState={(device.mode as string | undefined) !== 'off'}
      size={size}
      onSizeChange={handleSizeChange}
      isEditMode={isEditMode}
    />
  ),

  media: ({
    device,
    size,
    handleSizeChange,
    isEditMode,
    presentationVariant,
    mediaStackSettings,
  }) => (
    <MediaCard
      id={device.id as string}
      name={device.name as string}
      room={device.room as string}
      title={device.title as string}
      artist={device.artist as string}
      album={device.album as string | undefined}
      entityType={device.entityType as string | undefined}
      deviceClass={device.deviceClass as string | undefined}
      source={device.source as string | undefined}
      sourceList={device.sourceList as string[] | undefined}
      entityPicture={device.entityPicture as string | undefined}
      state={device.state as 'playing' | 'paused' | 'idle' | 'off'}
      volume={device.volume as number}
      isMuted={device.isMuted as boolean}
      elapsedSeconds={device.elapsedSeconds as number | undefined}
      durationSeconds={device.durationSeconds as number | undefined}
      positionUpdatedAt={device.positionUpdatedAt as string | undefined}
      mediaCapabilities={device.mediaCapabilities as NavetMediaCapabilities}
      supportsGrouping={device.supportsGrouping as boolean | undefined}
      supportsPreviousTrack={device.supportsPreviousTrack as boolean | undefined}
      supportsNextTrack={device.supportsNextTrack as boolean | undefined}
      groupMembers={device.groupMembers as string[] | undefined}
      size={size}
      onSizeChange={handleSizeChange}
      isEditMode={isEditMode}
      mediaStackAppearance={presentationVariant === 'media-stack'}
      mediaStackSettings={mediaStackSettings}
    />
  ),

  weather: ({ device, size, isEditMode }) => (
    <WeatherCard
      id={device.id as string}
      location={device.location as string}
      temperature={device.temperature as number}
      temperatureUnit={device.temperatureUnit as 'celsius' | 'fahrenheit' | undefined}
      feelsLikeTemperature={device.feelsLikeTemperature as number | undefined}
      feelsLikeTemperatureUnit={
        device.feelsLikeTemperatureUnit as 'celsius' | 'fahrenheit' | undefined
      }
      condition={device.condition as string}
      humidity={device.humidity as number}
      windSpeed={device.windSpeed as number}
      windSpeedUnit={device.windSpeedUnit as string | undefined}
      windGustSpeed={device.windGustSpeed as number | undefined}
      pressure={device.pressure as number | undefined}
      pressureUnit={device.pressureUnit as string | undefined}
      uvIndex={device.uvIndex as number | undefined}
      cloudCoverage={device.cloudCoverage as number | undefined}
      precipitation={device.precipitation as number}
      precipitationUnit={device.precipitationUnit as string}
      sunrise={device.sunrise as string}
      sunset={device.sunset as string}
      daylight={device.daylight as string}
      rainForecast={device.rainForecast as string}
      forecast={
        (device.forecast as Array<{
          day: string;
          condition: string;
          high: number;
          highUnit?: 'celsius' | 'fahrenheit';
          low: number;
          lowUnit?: 'celsius' | 'fahrenheit';
        }>) ?? []
      }
      forecastMode={(device.forecastMode as 'weekly' | 'hourly' | undefined) ?? 'weekly'}
      highTemp={device.highTemp as number}
      highTempUnit={device.highTempUnit as 'celsius' | 'fahrenheit' | undefined}
      lowTemp={device.lowTemp as number}
      lowTempUnit={device.lowTempUnit as 'celsius' | 'fahrenheit' | undefined}
      size={size}
      onSizeChange={() => {}}
      isEditMode={isEditMode}
    />
  ),

  switches: ({ device, size, handleSizeChange, isEditMode }) =>
    device.serviceDomain === 'humidifier' ? (
      <HumidifierCard
        id={device.id as string}
        name={device.name as string}
        room={device.room as string}
        providerId={device.providerId as CardProviderId}
        entityType={device.entityType as string | undefined}
        deviceClass={device.deviceClass as string | undefined}
        initialState={device.state as boolean | undefined}
        initialTargetHumidity={device.targetHumidity as number | undefined}
        minHumidity={device.minHumidity as number | undefined}
        maxHumidity={device.maxHumidity as number | undefined}
        targetHumidityStep={device.targetHumidityStep as number | undefined}
        initialMode={device.mode as string | undefined}
        availableModes={device.availableModes as string[] | undefined}
        size={size}
        onSizeChange={handleSizeChange}
        isEditMode={isEditMode}
      />
    ) : (
      <SwitchCard
        id={device.id as string}
        name={device.name as string}
        size={size}
        providerId={device.providerId as CardProviderId}
        initialState={device.state as boolean | undefined}
        entityType={device.entityType as string | undefined}
        serviceDomain={device.serviceDomain as string | undefined}
        serviceAction={device.serviceAction as string | undefined}
        power={device.power as number | undefined}
        voltage={device.voltage as number | undefined}
        energy={device.energy as number | undefined}
        metrics={device.metrics as DeviceMetric[] | undefined}
        isEditMode={isEditMode}
      />
    ),

  helpers: ({ device, size, isEditMode }) => (
    <SwitchCard
      id={device.id as string}
      name={device.name as string}
      size={size}
      providerId={device.providerId as CardProviderId}
      initialState={device.state as boolean | undefined}
      entityType={device.entityType as string | undefined}
      serviceDomain={device.serviceDomain as string | undefined}
      serviceAction={device.serviceAction as string | undefined}
      isEditMode={isEditMode}
    />
  ),

  covers: ({ device, size, handleSizeChange, isEditMode }) => (
    <CoverCard
      id={device.id as string}
      name={device.name as string}
      room={device.room as string}
      initialState={device.state as CoverState | undefined}
      initialPosition={device.position as number | undefined}
      initialPositionMode={device.positionMode as 'position' | 'tilt' | undefined}
      initialDeviceClass={device.deviceClass as string | undefined}
      supportedFeatures={device.supportedFeatures as number | undefined}
      hasPosition={device.hasPosition as boolean | undefined}
      size={size}
      onSizeChange={handleSizeChange}
      isEditMode={isEditMode}
    />
  ),

  locks: ({ device, size, isEditMode }) => (
    <LockCard
      id={device.id as string}
      name={device.name as string}
      initialState={device.state as boolean | undefined}
      size={size}
      isEditMode={isEditMode}
    />
  ),

  scenes: ({ device, size, handleSizeChange, isEditMode }) => (
    <SceneCard
      id={device.id as string}
      name={device.name as string}
      room={device.room as string}
      providerId={device.providerId as CardProviderId}
      size={size}
      onSizeChange={handleSizeChange}
      isEditMode={isEditMode}
    />
  ),

  cameras: ({ device, size, handleSizeChange, isEditMode }) => (
    <CameraCard
      id={device.id as string}
      name={device.name as string}
      room={device.room as string}
      entityPicture={device.entityPicture as string | undefined}
      entityPictureSources={
        device.entityPictureSources as ReadonlyArray<{ srcSet: string; type: string }> | undefined
      }
      supportedFeatures={device.supportedFeatures as number | undefined}
      isStreamCapable={device.isStreamCapable as boolean | undefined}
      size={size}
      onSizeChange={handleSizeChange}
      isEditMode={isEditMode}
    />
  ),

  persons: ({ device, size, handleSizeChange, isEditMode }) => (
    <PersonCard
      id={device.id as string}
      name={device.name as string}
      room={device.room as string}
      location={device.location as string}
      state={device.state as 'home' | 'away'}
      entityPicture={device.entityPicture as string | undefined}
      size={size}
      onSizeChange={handleSizeChange}
      isEditMode={isEditMode}
    />
  ),

  sensors: ({ device, size, handleSizeChange, isEditMode, headerSubtitleOverride }) =>
    (() => {
      const alarm = readAlarmEntityFromCardDevice(device);
      if (alarm) {
        return (
          <SecurityPanelCard
            alarms={[alarm]}
            size={size === 'large' || size === 'extra-large' ? size : 'medium'}
          />
        );
      }

      return (
        <InfoCard
          id={device.id as string}
          name={device.name as string}
          room={device.room as string}
          value={device.value as string}
          unit={device.unit as string}
          icon={device.icon as SensorReading['icon']}
          subtitle={headerSubtitleOverride ?? (device.entityType as string | undefined)}
          deviceClass={device.deviceClass as string | undefined}
          status={device.status as 'measurement' | 'active' | 'clear' | 'unavailable' | undefined}
          securitySeverity={device.securitySeverity}
          lastUpdated={device.lastUpdated as string | undefined}
          size={size}
          onSizeChange={handleSizeChange}
          isEditMode={isEditMode}
        />
      );
    })(),

  'grouped-sensors': ({ device, size, handleSizeChange, isEditMode }) => (
    <GroupedSensorCard
      id={device.id as string}
      name={device.name as string}
      room={device.room as string}
      sensors={device.sensors as SensorReading[]}
      accentColor={
        device.accentColor as 'teal' | 'blue' | 'purple' | 'amber' | 'emerald' | undefined
      }
      size={size}
      onSizeChange={handleSizeChange}
      isEditMode={isEditMode}
    />
  ),

  vacuums: ({ device, size, handleSizeChange, isEditMode }) =>
    isLawnMowerEntityId(device.id as string) ? (
      <LawnMowerCard
        id={device.id as string}
        name={device.name as string}
        providerId={device.providerId as CardProviderId}
        room={device.room as string}
        rawStatus={device.rawStatus as string | undefined}
        status={device.status as VacuumStatus}
        battery={device.battery as number}
        cleanedArea={device.cleanedArea as string | undefined}
        cleaningTime={device.cleaningTime as string | undefined}
        size={size}
        onSizeChange={handleSizeChange}
        isEditMode={isEditMode}
      />
    ) : (
      <VacuumCard
        id={device.id as string}
        name={device.name as string}
        providerId={device.providerId as CardProviderId}
        room={device.room as string}
        rawStatus={device.rawStatus as string | undefined}
        status={device.status as VacuumStatus}
        battery={device.battery as number}
        cleanedArea={device.cleanedArea as string | undefined}
        cleaningTime={device.cleaningTime as string | undefined}
        size={size}
        onSizeChange={handleSizeChange}
        isEditMode={isEditMode}
      />
    ),

  calendars: ({ device, size, handleSizeChange, isEditMode }) => (
    <CalendarCard
      id={device.id as string}
      name={device.name as string}
      room={device.room as string}
      events={
        (device.events as Array<{
          id: string;
          title: string;
          startTime: string;
          endTime: string;
          timeDisplay: string;
          location?: string;
          type: 'meeting' | 'call' | 'event';
          color: string;
          attendees?: number;
        }>) ?? []
      }
      inEditMode={isEditMode}
      size={size}
      onSizeChange={(newSize) => handleSizeChange(device.id, newSize)}
    />
  ),
};

export const DASHBOARD_CARD_TYPES = Object.freeze(Object.keys(cardRegistry));

export const renderCard = (options: CardRendererOptions): ReactElement | null => {
  const renderer = cardRegistry[options.device.type];
  if (!renderer) return null;
  const card = renderer(options);
  if (!card) return null;
  return (
    <CardErrorBoundary>
      <EntityAvailabilityFrame
        device={options.device}
        isEditMode={options.isEditMode}
        size={options.size}
      >
        <Suspense fallback={<EntityCardFallback size={options.size} />}>{card}</Suspense>
      </EntityAvailabilityFrame>
    </CardErrorBoundary>
  );
};
