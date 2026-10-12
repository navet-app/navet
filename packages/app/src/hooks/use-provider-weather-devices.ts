import { SUN_ENTITY_ID, WEATHER_FORECAST_REFRESH_INTERVAL } from '@navet/app/constants';
import { mapWeatherDevice } from '@navet/app/hooks/device-mappers';
import { useI18n } from '@navet/app/i18n';
import type {
  PlatformWeatherDevice,
  PlatformWeatherForecastEntry,
} from '@navet/app/platform/provider-feature-models';
import { integrationWeatherFeatureService } from '@navet/app/services/integration-weather-feature.service';
import { settingsSelectors } from '@navet/app/stores/selectors';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import { createProviderScopedId } from '@navet/app/utils/provider-ids';
import { areStringArraysEqual } from '@navet/app/utils/structural-equality';
import { useCallback, useMemo, useRef } from 'react';
import {
  resolveProviderFeatureEntityName,
  resolveProviderFeatureEntityRoom,
} from './provider-feature-entity-labels';
import { useIntegrationStore, useProviderId } from './use-integration-store';
import {
  useHydratingProviderCollection,
  useProviderCollectionData,
} from './use-provider-collection-lifecycle';
import {
  useProviderEntityRegistryEntries,
  useProviderEntitySnapshotsByPrefix,
} from './use-provider-entity';
import { useProviderFeature } from './use-provider-feature-support';

const EMPTY_WEATHER_DEVICES: PlatformWeatherDevice[] = [];
const WEATHER_ENTITY_PREFIXES = ['sun.', 'weather.'] as const;

type WeatherForecastState = Record<
  string,
  {
    daily?: PlatformWeatherForecastEntry[];
    hourly?: PlatformWeatherForecastEntry[];
  }
>;

const EMPTY_WEATHER_FORECASTS: WeatherForecastState = {};
const mergeForecasts = (previous: WeatherForecastState, next: WeatherForecastState) =>
  Object.fromEntries(
    Object.entries(next).map(([entityId, forecast]) => [
      entityId,
      {
        daily: forecast.daily ?? previous[entityId]?.daily,
        hourly: forecast.hourly ?? previous[entityId]?.hourly,
      },
    ])
  );

export function useProviderWeatherDevices(
  providerId?: IntegrationProviderId,
  options?: { enabled?: boolean }
): PlatformWeatherDevice[] {
  const enabled = options?.enabled ?? true;
  const resolvedProviderId = useProviderId(providerId);
  const entitiesHydrated = useIntegrationStore(
    (state) =>
      (state.providerRuntime[resolvedProviderId] ?? state.providerRuntime[state.currentProviderId])
        .entitiesHydrated
  );
  const supportsWeather = useProviderFeature('weather', resolvedProviderId) && enabled;
  const entities = useProviderEntitySnapshotsByPrefix(WEATHER_ENTITY_PREFIXES, {
    providerId: resolvedProviderId,
    enabled: supportsWeather,
  });
  const entityRegistry = useProviderEntityRegistryEntries({
    providerId: resolvedProviderId,
    enabled: supportsWeather,
  });
  const { locale, t } = useI18n();
  const weatherForecastMode = useSettingsStore(settingsSelectors.weatherForecastMode);
  const use24HourTime = useSettingsStore(settingsSelectors.use24HourTime);

  const nextWeatherEntityIds = useMemo(() => {
    if (!supportsWeather || !entities) return [];
    return Object.keys(entities)
      .filter((entityId) => entityId.startsWith('weather.'))
      .sort();
  }, [entities, supportsWeather]);
  const weatherEntityIdsRef = useRef<string[]>([]);
  if (!areStringArraysEqual(weatherEntityIdsRef.current, nextWeatherEntityIds)) {
    weatherEntityIdsRef.current = nextWeatherEntityIds;
  }
  const weatherEntityIds = weatherEntityIdsRef.current;

  const entityRegistryMap = useMemo(
    () => new Map(entityRegistry.map((entry) => [entry.entityId, entry])),
    [entityRegistry]
  );
  const loadForecasts = useCallback(async (): Promise<WeatherForecastState> => {
    const entries = await Promise.all(
      weatherEntityIds.map(async (entityId) => {
        const scopedEntityId = createProviderScopedId(resolvedProviderId, entityId);
        const [daily, hourly] = await Promise.all([
          integrationWeatherFeatureService
            .getForecast(scopedEntityId, 'daily')
            .catch(() => undefined),
          integrationWeatherFeatureService
            .getForecast(scopedEntityId, 'hourly')
            .catch(() => undefined),
        ]);
        return [entityId, { daily, hourly }] as const;
      })
    );
    return Object.fromEntries(entries);
  }, [resolvedProviderId, weatherEntityIds]);
  const deferredWeatherForecasts = useProviderCollectionData({
    providerId: resolvedProviderId,
    enabled: supportsWeather && weatherEntityIds.length > 0,
    interval: WEATHER_FORECAST_REFRESH_INTERVAL,
    empty: EMPTY_WEATHER_FORECASTS,
    load: loadForecasts,
    merge: mergeForecasts,
    retainWhenDisabled: true,
  });

  const resolvedDevices = useMemo(() => {
    if (!entities || weatherEntityIds.length === 0) return EMPTY_WEATHER_DEVICES;
    return weatherEntityIds.map((entityId) => {
      const weatherEntity = entities[entityId];
      const scopedEntityId = createProviderScopedId(resolvedProviderId, entityId);
      return mapWeatherDevice(
        scopedEntityId,
        weatherEntity,
        resolveProviderFeatureEntityName(
          entityId,
          weatherEntity,
          entityRegistryMap.get(entityId)?.name
        ),
        resolveProviderFeatureEntityRoom(weatherEntity),
        {
          sunEntity: entities[SUN_ENTITY_ID],
          config: null,
          weatherForecastMode,
          storedForecasts: deferredWeatherForecasts[entityId]
            ? {
                daily: deferredWeatherForecasts[entityId].daily ?? [],
                hourly: deferredWeatherForecasts[entityId].hourly ?? [],
              }
            : undefined,
          locale,
          t,
          use24HourTime,
        }
      );
    });
  }, [
    resolvedProviderId,
    deferredWeatherForecasts,
    entities,
    entityRegistryMap,
    locale,
    weatherEntityIds,
    t,
    use24HourTime,
    weatherForecastMode,
  ]);

  return useHydratingProviderCollection(
    resolvedProviderId,
    resolvedDevices,
    supportsWeather,
    entitiesHydrated,
    EMPTY_WEATHER_DEVICES
  );
}

export const useProviderWeatherDevicesCollection = useProviderWeatherDevices;
