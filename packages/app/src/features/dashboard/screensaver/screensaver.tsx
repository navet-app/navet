import { useHeaderDateTime } from '@navet/app/components/layout/use-header-datetime';
import { BaseCardDialog } from '@navet/app/components/primitives/Cards/BaseCardDialog';
import { getDialogReturnFocus } from '@navet/app/components/shared/dialog-return-focus';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { navetTypographyTokens } from '@navet/app/components/system/tokens';
import { resolveScreensaverAppearance } from '@navet/app/constants/screensaver-options';
import { readNavetAlarmEntity } from '@navet/app/core/navet-device-state';
import { useDashboardCollectionStore } from '@navet/app/features/dashboard/dashboards/dashboard-collection-store';
import {
  formatWeatherConditionLabel,
  WeatherIcon,
} from '@navet/app/features/weather/components/weather-card/weather-icon';
import { useI18n, useTheme } from '@navet/app/hooks';
import { useWeatherDevicesCollection } from '@navet/app/hooks/use-devices';
import { useIntegrationStore } from '@navet/app/hooks/use-integration-store';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { parseProviderScopedId } from '@navet/app/utils/provider-ids';
import { formatTemperatureFromSourceUnit } from '@navet/app/utils/temperature';
import { subscribeVisibilityAwareTask } from '@navet/app/utils/visibility-aware-scheduler';
import { readNavetTimerState } from '@navet/core/household-device-state';
import type { NavetEntity } from '@navet/core/types';
import { ShieldAlert, Timer } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useScreensaverStore } from './screensaver-store';

export default function Screensaver() {
  const { t } = useI18n();
  const { theme, wallpaper } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const [returnFocus] = useState(() =>
    getDialogReturnFocus(
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    )
  );
  const [previewed] = useState(() =>
    Boolean(returnFocus?.hasAttribute('data-screensaver-preview'))
  );
  const dismiss = useScreensaverStore((state) => state.stop);
  const selectedBackground = useSettingsStore((state) => state.screensaverBackground);
  const appearance = resolveScreensaverAppearance(selectedBackground, wallpaper);
  return (
    <BaseCardDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        // Responsive Settings can remount the launcher while the modal stays open.
        const target = returnFocus?.isConnected
          ? returnFocus
          : previewed
            ? document.querySelector<HTMLElement>('[data-screensaver-preview]')
            : document.getElementById('dashboard-main-content');
        target?.focus({ preventScroll: true });
      }}
      variant="fullscreen"
      edgeToEdge
      theme={theme}
      title={t('screensaver.title')}
      description={t('screensaver.returnHint')}
      mobileCoverSheet={false}
      persistentMobileDismiss={false}
      contentClassName={`!animate-none ${surface.appBg} ${surface.textPrimary}`}
    >
      <ScreensaverScene {...appearance}>
        <button
          type="button"
          aria-label={t('screensaver.return')}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            dismiss();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Tab') return;
            event.preventDefault();
            event.stopPropagation();
            dismiss();
          }}
          className="pointer-events-auto absolute inset-0 h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-8 focus-visible:outline-current"
        />
      </ScreensaverScene>
    </BaseCardDialog>
  );
}

// Shared by the real screensaver and settings preview so layout and live details stay aligned.
export function ScreensaverScene({
  background,
  color,
  foreground,
  children,
}: {
  background: string | null;
  color?: string;
  foreground?: string;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const { formattedTime, formattedDate } = useHeaderDateTime();
  return (
    <div
      className="@container/screensaver pointer-events-none absolute inset-0 font-sans"
      style={{ containerType: 'size' }}
    >
      {color ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundColor: color }}
        />
      ) : null}
      {background ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: background }}
        />
      ) : null}
      {background ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-black/60" />
      ) : null}
      {children}
      <div
        data-screensaver-scene
        style={{ color: foreground }}
        className={`pointer-events-none relative flex h-full min-h-0 flex-col justify-between gap-10 overflow-y-auto p-[clamp(1.5rem,6cqw,6rem)] @min-[640px]/screensaver:justify-between @min-[640px]/screensaver:py-[12cqh] ${background ? 'text-white' : ''}`}
      >
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[clamp(3rem,8cqh,5rem)] text-center @min-[640px]/screensaver:flex-none @min-[640px]/screensaver:justify-start @min-[640px]/screensaver:gap-10">
          <div className="min-w-0">
            <p
              className={`${navetTypographyTokens.label} mb-6 opacity-70 @min-[640px]/screensaver:mb-4`}
            >
              {formattedDate}
            </p>
            <p className="text-[clamp(4.5rem,18cqw,6rem)] font-normal leading-none tracking-tight tabular-nums @min-[640px]/screensaver:text-[clamp(3rem,11cqw,12rem)]">
              {formattedTime}
            </p>
          </div>
          <ScreensaverDetails />
        </div>
        <p className={`${navetTypographyTokens.caption} shrink-0 text-center opacity-50`}>
          {t('screensaver.returnHint')}
        </p>
      </div>
    </div>
  );
}

function ScreensaverDetails() {
  const { t } = useI18n();
  const weatherDevices = useWeatherDevicesCollection();
  const temperatureUnit = useSettingsStore((state) => state.temperatureUnit);
  const settings = useDashboardCollectionStore(
    (state) => state.collection.dashboardsById[state.activeDashboardId]?.companion
  );
  const entities = useIntegrationStore(
    useShallow((state) =>
      state.selectedProviderIds.flatMap((id) =>
        Object.values(state.providerEntitiesByProviderId[id] ?? {}).filter(
          (entity) => entity.type === 'timer' || Boolean(entity.attributes.alarmState)
        )
      )
    )
  );
  const connections = useIntegrationStore(
    useShallow((state) =>
      Object.fromEntries(
        state.selectedProviderIds.map((id) => [id, state.providerRuntime[id]?.connected])
      )
    )
  );
  const available = (entity: NavetEntity) =>
    connections[entity.providerId] && entity.availability === 'available';
  const weather =
    settings?.weatherEntityId === null
      ? undefined
      : settings?.weatherEntityId
        ? weatherDevices.find((device) => device.id === settings.weatherEntityId)
        : weatherDevices[0];
  const alarm =
    settings?.showSecurity === false
      ? undefined
      : entities.find(
          (entity) => available(entity) && readNavetAlarmEntity(entity)?.state === 'triggered'
        );
  const timer = entities.find(
    (entity) => available(entity) && readNavetTimerState(entity)?.phase === 'active'
  );
  const weatherProvider = weather ? parseProviderScopedId(weather.id)?.providerId : undefined;
  const condition = weather?.condition ?? '';
  const weatherAvailable =
    weatherProvider &&
    connections[weatherProvider] &&
    condition !== 'unavailable' &&
    condition !== 'unknown';
  const value = weather?.temperature;
  const sourceUnit = weather?.temperatureUnit ?? 'celsius';
  return (
    <div className="min-w-0 max-w-full space-y-6">
      {weather ? (
        <div className="flex items-center justify-center gap-3">
          <WeatherIcon
            condition={weatherAvailable ? condition : 'unknown'}
            className="h-7 w-7 shrink-0"
          />
          <div>
            <p className={`${navetTypographyTokens.pageHeading} tabular-nums`}>
              {weatherAvailable && typeof value === 'number' && Number.isFinite(value)
                ? formatTemperatureFromSourceUnit(value, sourceUnit, temperatureUnit)
                : '—'}
            </p>
            <p className={`${navetTypographyTokens.caption} opacity-70`}>
              {weatherAvailable ? formatWeatherConditionLabel(condition) : t('common.unavailable')}
            </p>
          </div>
        </div>
      ) : settings?.weatherEntityId ? (
        <p>{t('sidebar.companion.unavailable', { name: t('sidebar.companion.weather') })}</p>
      ) : null}
      {alarm ? (
        <div className="flex items-center justify-center gap-3 border-t border-current/25 pt-5">
          <ShieldAlert className="h-6 w-6 shrink-0" />
          <div className="min-w-0">
            <p className="line-clamp-2 break-words text-xl font-medium">{alarm.name}</p>
            <p className="text-sm opacity-80">{t('security.alarm.state.triggered')}</p>
          </div>
        </div>
      ) : timer ? (
        <ScreensaverTimer entity={timer} />
      ) : null}
    </div>
  );
}

function ScreensaverTimer({ entity }: { entity: NavetEntity }) {
  const { t } = useI18n();
  const state = readNavetTimerState(entity);
  const [now, setNow] = useState(Date.now);
  useEffect(() => subscribeVisibilityAwareTask(() => setNow(Date.now()), 1000), []);
  const seconds = state?.finishesAt
    ? Math.max(0, Math.ceil((Date.parse(state.finishesAt) - now) / 1000))
    : state?.remainingSeconds == null
      ? null
      : Math.ceil(state.remainingSeconds);
  return (
    <div className="flex items-center justify-center gap-3 border-t border-current/25 pt-5">
      <Timer className="h-6 w-6 shrink-0" />
      <div className="min-w-0">
        <p className="line-clamp-2 break-words text-xl font-medium">{entity.name}</p>
        <p className="text-2xl tabular-nums">
          {seconds == null
            ? t('common.unavailable')
            : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}
        </p>
      </div>
    </div>
  );
}
