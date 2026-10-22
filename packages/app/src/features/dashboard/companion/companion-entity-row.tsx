import {
  companionEntityIconClassName,
  companionEntityNameTypography,
  companionEntityRowClassName,
  companionEntityValueClassName,
} from '@navet/app/components/shared/companion-row-presentation';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { getDeviceTypeIcon } from '@navet/app/constants/device-type-icons';
import {
  readNavetClimateState,
  readNavetLightState,
  readNavetMediaState,
  readNavetSensorState,
} from '@navet/app/core/navet-device-state';
import { useI18n, useIntegrationStore, useTheme } from '@navet/app/hooks';
import { useSettingsStore } from '@navet/app/stores';
import { formatTemperatureFromSourceUnit } from '@navet/app/utils/temperature';
import type { NavetEntity } from '@navet/core/types';
import { Activity } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { CompanionEntityDetails } from './companion-entity-details';
import { CompanionRowLoading } from './companion-row-loading';

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
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
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
  const companion = { disabled: editing || !available, unavailable: !available, value };
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
  const fallback = <CompanionRowLoading name={entity.name} icon={getDeviceTypeIcon(entity.type)} />;
  let content = (
    <CompanionEntityDetails
      entity={entity}
      editing={editing}
      className={companionEntityRowClassName}
    >
      <Activity
        aria-hidden="true"
        className={`${companionEntityIconClassName} ${surface.textMuted}`}
      />
      <span className={`min-w-0 flex-1 break-words ${companionEntityNameTypography}`}>
        {entity.name}
      </span>
      <span className={companionEntityValueClassName}>{value}</span>
    </CompanionEntityDetails>
  );
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
    (entity.type === 'switch' && entity.attributes.serviceDomain !== 'humidifier') ||
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
