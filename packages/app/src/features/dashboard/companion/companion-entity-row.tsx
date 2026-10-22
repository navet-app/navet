import { DeviceControlRow } from '@navet/app/components/shared/device-editor/device-control-row';
import {
  readNavetClimateState,
  readNavetLightState,
  readNavetMediaState,
  readNavetSensorState,
} from '@navet/app/core/navet-device-state';
import { useI18n, useIntegrationStore } from '@navet/app/hooks';
import { useSettingsStore } from '@navet/app/stores';
import { formatTemperatureFromSourceUnit } from '@navet/app/utils/temperature';
import type { NavetEntity } from '@navet/core/types';
import { Activity } from 'lucide-react';
import { lazy, Suspense } from 'react';

const LightCard = lazy(async () => ({
  default: (await import('@navet/app/features/lighting/components/light-card')).LightCard,
}));
const FanCard = lazy(async () => ({
  default: (await import('@navet/app/features/lighting/components/fan-card')).FanCard,
}));
const ClimateCard = lazy(async () => ({
  default: (await import('@navet/app/features/climate/components/climate-card')).ClimateCard,
}));
const MediaCard = lazy(async () => ({
  default: (await import('@navet/app/features/media/components/media-card')).MediaCard,
}));
const SwitchCard = lazy(async () => ({
  default: (await import('@navet/app/features/lighting/components/switch-card')).SwitchCard,
}));
const keepPanelSize = () => {};

/** The card owns power and details; the panel selects only its compact row presentation. */
export function CompanionEntityRow({ entity, editing }: { entity: NavetEntity; editing: boolean }) {
  const { t } = useI18n();
  const unit = useSettingsStore((state) => state.temperatureUnit);
  const connected = useIntegrationStore(
    (state) => state.providerRuntime[entity.providerId]?.connected
  );
  const available = Boolean(connected && entity.availability === 'available');
  const on = entity.primaryState === 'on' || entity.primaryState === true;
  const light = entity.type === 'light' ? readNavetLightState(entity) : null;
  const media = entity.type === 'media_player' ? readNavetMediaState(entity) : null;
  const climate =
    entity.type === 'hvac' ||
    (entity.type === 'climate' && entity.capabilities.includes('temperature_setpoint'))
      ? readNavetClimateState(entity)
      : null;
  const sensor = readNavetSensorState(entity);
  const percentage =
    light?.brightnessPct ?? (entity.type === 'fan' ? entity.attributes.percentage : undefined);
  const value = !available
    ? t('common.unavailable')
    : climate &&
        typeof climate.currentTemperature === 'number' &&
        Number.isFinite(climate.currentTemperature)
      ? formatTemperatureFromSourceUnit(
          climate.currentTemperature,
          climate.temperatureUnit ?? 'celsius',
          unit
        )
      : on && typeof percentage === 'number' && Number.isFinite(percentage)
        ? `${Math.round(percentage)}%`
        : on
          ? t('common.on')
          : entity.primaryState === 'off' || entity.primaryState === false
            ? t('common.off')
            : entity.primaryState == null || entity.primaryState === ''
              ? '—'
              : `${entity.primaryState}${sensor?.unit ? ` ${sensor.unit}` : ''}`;
  const companion = { disabled: editing || !available, value };
  // The panel owns editing tools; do not register duplicate dashboard-card edit requests.
  const common = {
    id: entity.canonicalId,
    name: entity.name,
    room: entity.room ?? '',
    providerId: entity.providerId,
    size: 'small' as const,
    onSizeChange: keepPanelSize,
    isEditMode: false,
    companion,
  };
  const fallback = (
    <DeviceControlRow
      kind="reading"
      label={entity.name}
      icon={<Activity className="h-4 w-4" />}
      value={value}
    />
  );
  let content = fallback;
  if (light)
    content = (
      <LightCard
        {...common}
        initialState={on}
        initialBrightness={light.brightnessPct}
        initialTemp={light.colorTemperatureKelvin}
      />
    );
  else if (entity.type === 'fan')
    content = (
      <FanCard
        {...common}
        initialState={on}
        initialPercentage={typeof percentage === 'number' ? percentage : undefined}
      />
    );
  else if (climate)
    content = (
      <ClimateCard
        {...common}
        initialState={entity.primaryState !== 'off'}
        initialTemp={climate.temperature}
        initialCurrentTemp={climate.currentTemperature}
        initialMode={climate.mode ?? String(entity.primaryState)}
        initialAction={climate.action}
        temperatureUnit={climate.temperatureUnit}
        supportedClimateModes={climate.supportedClimateModes ?? climate.supportedHvacModes}
      />
    );
  else if (media)
    content = (
      <MediaCard
        {...common}
        title={media.title ?? ''}
        artist={media.artist ?? ''}
        album={media.album}
        entityPicture={media.entityPicture}
        deviceClass={media.deviceClass}
        state={
          entity.primaryState === 'playing' ||
          entity.primaryState === 'paused' ||
          entity.primaryState === 'off'
            ? entity.primaryState
            : 'idle'
        }
        volume={media.volume ?? 0}
        isMuted={media.isMuted ?? false}
        mediaCapabilities={media.mediaCapabilities}
        supportsGrouping={media.supportsGrouping}
        supportsPreviousTrack={media.supportsPreviousTrack}
        supportsNextTrack={media.supportsNextTrack}
      />
    );
  else if (
    entity.type === 'switch' ||
    (entity.type === 'helper' && entity.capabilities.includes('toggle'))
  )
    content = (
      <SwitchCard
        {...common}
        initialState={on}
        entityType={
          typeof entity.attributes.entityType === 'string'
            ? entity.attributes.entityType
            : undefined
        }
      />
    );
  return <Suspense fallback={fallback}>{content}</Suspense>;
}
