import { Button } from '@navet/app/components/primitives/button';
import { BaseCardDialog } from '@navet/app/components/primitives/Cards/BaseCardDialog';
import { Select } from '@navet/app/components/primitives/select';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { readNavetAlarmEntity, readNavetCameraState } from '@navet/app/core/navet-device-state';
import { getAlarmStateLabel } from '@navet/app/features/security/utils/alarm-state-label';
import {
  formatWeatherConditionLabel,
  WeatherIcon,
} from '@navet/app/features/weather/components/weather-card/weather-icon';
import { useI18n, useIntegrationStore, useProviderResource, useTheme } from '@navet/app/hooks';
import { useResourceUrl } from '@navet/app/hooks/use-resource-url';
import { useNavigationStore, useSettingsStore } from '@navet/app/stores';
import { formatTemperatureFromSourceUnit } from '@navet/app/utils/temperature';
import type { NavetEntity } from '@navet/core/types';
import { ArrowUpRight, CameraOff, Lock, Shield, SlidersHorizontal } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  type DashboardCompanionSettings,
  DEFAULT_DASHBOARD_COMPANION,
} from '../dashboards/dashboard-collection';
import { useDashboardCollectionStore } from '../dashboards/dashboard-collection-store';

// Uses normalized entities across selected providers. Room changes never change the selection.
export function DashboardCompanion() {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const configuring = useDashboardCollectionStore((state) => state.companionCustomizationOpen);
  const setConfiguring = useDashboardCollectionStore(
    (state) => state.setCompanionCustomizationOpen
  );
  useEffect(() => () => setConfiguring(false), [setConfiguring]);
  const formId = useId();
  const dashboard = useDashboardCollectionStore(
    (state) => state.collection.dashboardsById[state.activeDashboardId]
  );
  const settings = dashboard?.companion ?? DEFAULT_DASHBOARD_COMPANION;
  const updateCompanion = useDashboardCollectionStore((state) => state.updateCompanion);
  const entities = useIntegrationStore(
    useShallow((state) =>
      state.selectedProviderIds.flatMap((id) =>
        Object.values(state.providerEntitiesByProviderId[id] ?? {}).filter(
          (entity) =>
            entity.type === 'weather' ||
            entity.type === 'camera' ||
            entity.type === 'lock' ||
            Boolean(entity.attributes.alarmState)
        )
      )
    )
  );
  const weatherSources = useMemo(
    () => entities.filter((entity) => entity.type === 'weather'),
    [entities]
  );
  const cameras = useMemo(() => entities.filter((entity) => entity.type === 'camera'), [entities]);
  const resolveSelection = (sources: NavetEntity[], id: string | null | undefined) =>
    id === null
      ? undefined
      : id === undefined
        ? sources[0]
        : sources.find((entity) => entity.canonicalId === id);
  const camera = resolveSelection(cameras, settings.cameraEntityId);
  const weather = resolveSelection(weatherSources, settings.weatherEntityId);
  const security = settings.showSecurity
    ? entities.filter((entity) => entity.type === 'lock' || Boolean(entity.attributes.alarmState))
    : [];
  const hasConfiguredMissingSource = Boolean(
    (settings.cameraEntityId && !camera) || (settings.weatherEntityId && !weather)
  );

  const update = (changes: Partial<DashboardCompanionSettings>) => {
    if (dashboard) updateCompanion(dashboard.id, { ...settings, ...changes });
  };

  return (
    <>
      <section aria-label={t('sidebar.companion.title')} className="space-y-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className={`text-sm font-medium ${surface.textSecondary}`}>
            {t('sidebar.companion.title')}
          </h2>
          <Button
            variant="ghost"
            size="compact"
            iconOnly
            label={t('sidebar.companion.configure')}
            onClick={() => setConfiguring(true)}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </div>
        {camera ? (
          <CompanionCamera key={camera.canonicalId} entity={camera} />
        ) : settings.cameraEntityId ? (
          <p className={`text-sm ${surface.textMuted}`}>
            {t('sidebar.companion.unavailable', { name: t('sidebar.companion.camera') })}
          </p>
        ) : null}
        {weather ? (
          <CompanionWeather entity={weather} />
        ) : settings.weatherEntityId ? (
          <p className={`text-sm ${surface.textMuted}`}>
            {t('sidebar.companion.unavailable', { name: t('sidebar.companion.weather') })}
          </p>
        ) : null}
        {security.length ? (
          <div className={`space-y-2 border-t pt-4 ${surface.border}`}>
            {security.map((entity) => (
              <CompanionSecurityRow key={entity.canonicalId} entity={entity} />
            ))}
          </div>
        ) : null}
        {!camera && !weather && !security.length && !hasConfiguredMissingSource ? (
          <p className={`text-sm ${surface.textMuted}`}>
            {entities.length ? t('sidebar.companion.empty') : t('sidebar.companion.noSources')}
          </p>
        ) : null}
      </section>
      <BaseCardDialog
        variant="modal"
        isOpen={configuring}
        onOpenChange={setConfiguring}
        title={t('sidebar.companion.configure')}
        description={t('sidebar.companion.description')}
        theme={theme}
      >
        <div className="space-y-5 p-5">
          <p className={`text-sm font-medium ${surface.textPrimary}`}>{dashboard?.name}</p>
          {(
            [
              { key: 'cameraEntityId', label: t('sidebar.companion.camera'), sources: cameras },
              {
                key: 'weatherEntityId',
                label: t('sidebar.companion.weather'),
                sources: weatherSources,
              },
            ] as const
          ).map(({ key, label, sources }) => (
            <div key={key} className="space-y-2 text-sm">
              <label htmlFor={`${formId}-${key}`} className="block">
                {label}
              </label>
              <Select
                id={`${formId}-${key}`}
                value={settings[key] ?? (settings[key] === null ? 'hidden' : 'automatic')}
                onChange={(event) =>
                  update({
                    [key]:
                      event.target.value === 'automatic'
                        ? undefined
                        : event.target.value === 'hidden'
                          ? null
                          : event.target.value,
                  })
                }
              >
                <option value="automatic">{t('sidebar.companion.automatic')}</option>
                <option value="hidden">{t('sidebar.companion.hidden')}</option>
                {settings[key] &&
                !sources.some((source) => source.canonicalId === settings[key]) ? (
                  <option value={settings[key] ?? ''}>{t('common.unavailable')}</option>
                ) : null}
                {sources.map((source) => (
                  <option key={source.canonicalId} value={source.canonicalId}>
                    {source.name}
                  </option>
                ))}
              </Select>
            </div>
          ))}
          <label className="flex min-h-10 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={settings.showSecurity}
              onChange={(event) => update({ showSecurity: event.target.checked })}
            />
            {t('sidebar.companion.security')}
          </label>
          <Button variant="secondary" onClick={() => setConfiguring(false)}>
            {t('common.done')}
          </Button>
        </div>
      </BaseCardDialog>
    </>
  );
}

function CompanionWeather({ entity }: { entity: NavetEntity }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const unit = useSettingsStore((state) => state.temperatureUnit);
  const connected = useIntegrationStore(
    (state) => state.providerRuntime[entity.providerId]?.connected
  );
  const available = connected && entity.availability === 'available';
  const value = entity.attributes.temperature;
  const sourceUnit = entity.attributes.temperatureUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
  const condition =
    typeof entity.attributes.condition === 'string'
      ? entity.attributes.condition
      : String(entity.primaryState ?? '');
  return (
    <div className="flex items-start gap-3">
      <WeatherIcon condition={condition} className="mt-1 h-9 w-9 shrink-0" />
      <div className="min-w-0">
        <p className={`truncate text-xs ${surface.textMuted}`}>{entity.name}</p>
        <p className="text-2xl font-medium tabular-nums">
          {available && typeof value === 'number' && Number.isFinite(value)
            ? formatTemperatureFromSourceUnit(value, sourceUnit, unit)
            : '—'}
        </p>
        <p className={`text-sm ${surface.textSecondary}`}>
          {available ? formatWeatherConditionLabel(condition) : t('common.unavailable')}
        </p>
      </div>
    </div>
  );
}

function CompanionCamera({ entity }: { entity: NavetEntity }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const surface = getThemeSurfaceTokens(theme);
  const connected = useIntegrationStore(
    (state) => state.providerRuntime[entity.providerId]?.connected
  );
  const available = connected && entity.availability === 'available';
  const picture =
    entity.resources?.camera_snapshot?.path ?? readNavetCameraState(entity)?.entityPicture;
  const pictureUrl = useResourceUrl(available ? picture : null, entity.providerId);
  const resource = useProviderResource({
    deviceId: available && !picture ? entity.canonicalId : '',
    kind: 'camera_snapshot',
    providerId: entity.providerId,
    fallbackPicture: readNavetCameraState(entity)?.entityPicture,
  });
  const [open, setOpen] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const resolvedUrl = pictureUrl ?? (resource?.kind === 'image' ? resource.url : undefined);
  const src = available && resolvedUrl !== failedUrl ? resolvedUrl : undefined;
  const fallback = (
    <div
      role="status"
      className={`flex aspect-video items-center justify-center gap-2 rounded-xl text-xs ${surface.subtleBg} ${surface.textMuted}`}
    >
      <CameraOff className="h-5 w-5" />
      {t('common.unavailable')}
    </div>
  );
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!src}
        className="block w-full rounded-xl text-left focus-visible:outline focus-visible:outline-2"
        aria-label={t('sidebar.companion.openCamera', { name: entity.name })}
      >
        <span className="mb-2 flex items-center justify-between gap-2 text-sm font-medium">
          <span className="truncate">{entity.name}</span>
          <ArrowUpRight className="h-4 w-4 shrink-0" />
        </span>
        {src ? (
          <img
            src={src}
            alt={entity.name}
            onError={() => setFailedUrl(src)}
            className="aspect-video w-full rounded-xl object-cover"
          />
        ) : (
          fallback
        )}
      </button>
      <p className={`text-xs ${surface.textMuted}`}>{t('sidebar.companion.snapshot')}</p>
      <BaseCardDialog
        variant="modal"
        isOpen={open}
        onOpenChange={setOpen}
        title={entity.name}
        theme={theme}
      >
        <div className="p-4">
          {src ? (
            <img
              src={src}
              alt={entity.name}
              onError={() => setFailedUrl(src)}
              className="w-full rounded-xl"
            />
          ) : (
            fallback
          )}
        </div>
      </BaseCardDialog>
    </div>
  );
}

function CompanionSecurityRow({ entity }: { entity: NavetEntity }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const navigate = useNavigationStore((state) => state.setActiveSection);
  const connected = useIntegrationStore(
    (state) => state.providerRuntime[entity.providerId]?.connected
  );
  const alarm = readNavetAlarmEntity(entity);
  const state = entity.primaryState;
  const label =
    !connected || entity.availability !== 'available'
      ? t('common.unavailable')
      : alarm
        ? getAlarmStateLabel(alarm.state, t)
        : state === 'locked'
          ? t('security.locked')
          : state === 'unlocked'
            ? t('security.unlocked')
            : t('common.unavailable');
  const Icon = alarm ? Shield : Lock;
  return (
    <button
      type="button"
      onClick={() => navigate('security')}
      className={`flex min-h-10 w-full items-center gap-2 rounded-lg text-left ${surface.hoverBg}`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${surface.textMuted}`} />
      <span className="min-w-0 flex-1 truncate text-xs">{entity.name}</span>
      <span className="max-w-[55%] text-right text-xs font-medium">{label}</span>
    </button>
  );
}
