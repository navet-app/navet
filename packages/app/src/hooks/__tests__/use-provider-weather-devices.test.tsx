import { integrationWeatherFeatureService } from '@navet/app/services/integration-weather-feature.service';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProviderWeatherDevices } from '../use-provider-weather-devices';

let mockEntities: Record<string, { state: string; attributes?: Record<string, unknown> }> | null =
  null;
let mockProviderRuntime = {
  connected: true,
  connecting: false,
  reconnecting: false,
  entitiesHydrated: true,
  registriesHydrated: true,
};
let refreshForecasts: () => Promise<void>;

vi.mock('@navet/app/utils/visibility-aware-scheduler', () => ({
  subscribeVisibilityAwareAsyncTask: (task: () => Promise<void>) => {
    refreshForecasts = task;
    return () => {};
  },
}));

vi.mock('@navet/app/hooks/device-mappers', () => ({
  mapWeatherDevice: vi.fn(
    (
      id: string,
      entity: { state: string },
      name: string,
      room: string,
      options: {
        storedForecasts?: { daily: Record<string, unknown>[]; hourly: Record<string, unknown>[] };
      }
    ) => ({
      id,
      name,
      room,
      size: 'medium',
      condition: entity.state,
      temperature: 20,
      forecastMode: 'weekly',
      forecast: options.storedForecasts?.daily ?? [],
      hourlyForecast: options.storedForecasts?.hourly ?? [],
    })
  ),
}));

vi.mock('@navet/app/i18n', () => ({
  useI18n: () => ({
    locale: 'en',
    t: (key: string) => key,
  }),
}));

vi.mock('@navet/app/services/integration-weather-feature.service', () => ({
  integrationWeatherFeatureService: {
    getForecast: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@navet/app/stores/selectors', () => ({
  settingsSelectors: {
    weatherForecastMode: (state: { weatherForecastMode: string }) => state.weatherForecastMode,
    use24HourTime: (state: { use24HourTime: boolean }) => state.use24HourTime,
  },
}));

vi.mock('@navet/app/stores/settings-store', () => ({
  useSettingsStore: (
    selector: (state: { weatherForecastMode: string; use24HourTime: boolean }) => unknown
  ) =>
    selector({
      weatherForecastMode: 'weekly',
      use24HourTime: true,
    }),
}));

vi.mock('../use-integration-store', () => ({
  useProviderId: (providerId?: string) => providerId ?? 'home_assistant',
  useIntegrationStore: (
    selector: (state: {
      currentProviderId: string;
      providerRuntime: Record<string, typeof mockProviderRuntime>;
      providerEntitiesByCanonicalId: Record<string, { room?: string }>;
    }) => unknown
  ) =>
    selector({
      currentProviderId: 'home_assistant',
      providerRuntime: {
        home_assistant: mockProviderRuntime,
      },
      providerEntitiesByCanonicalId: {},
    }),
}));

vi.mock('../use-provider-entity', () => ({
  useProviderEntityRegistryEntries: () => [],
  useProviderEntitySnapshotsByPrefix: (
    _prefixes: readonly string[],
    options?: { enabled?: boolean }
  ) => (options?.enabled === false ? {} : (mockEntities ?? {})),
}));

vi.mock('../use-provider-feature-support', () => ({
  useProviderFeature: () => true,
}));

describe('useProviderWeatherDevices', () => {
  it('exposes every weather entity as a selectable source', () => {
    mockEntities = {
      'weather.home': { state: 'sunny' },
      'weather.cabin': { state: 'rainy' },
      'sun.sun': { state: 'above_horizon' },
    };
    const { result } = renderHook(() => useProviderWeatherDevices('home_assistant'));
    expect(result.current.map((device) => device.id)).toEqual([
      'home_assistant:weather.cabin',
      'home_assistant:weather.home',
    ]);
  });
  beforeEach(() => {
    vi.mocked(integrationWeatherFeatureService.getForecast).mockReset().mockResolvedValue([]);
    mockEntities = {
      'weather.home': {
        state: 'sunny',
        attributes: {
          friendly_name: 'Home Weather',
        },
      },
      'sun.sun': {
        state: 'above_horizon',
        attributes: {},
      },
    };
    mockProviderRuntime = {
      connected: true,
      connecting: false,
      reconnecting: false,
      entitiesHydrated: true,
      registriesHydrated: true,
    };
  });

  it('keeps the last resolved weather device while provider entities are rehydrating', () => {
    const { result, rerender } = renderHook(() => useProviderWeatherDevices('home_assistant'));

    expect(result.current).toEqual([
      expect.objectContaining({ id: 'home_assistant:weather.home' }),
    ]);

    mockEntities = null;
    mockProviderRuntime = {
      ...mockProviderRuntime,
      entitiesHydrated: false,
      reconnecting: true,
    };
    rerender();

    expect(result.current).toEqual([
      expect.objectContaining({ id: 'home_assistant:weather.home' }),
    ]);
  });

  it('clears the cached weather device once hydration completes without a weather entity', () => {
    const { result, rerender } = renderHook(() => useProviderWeatherDevices('home_assistant'));

    expect(result.current).toHaveLength(1);

    mockEntities = {};
    mockProviderRuntime = {
      ...mockProviderRuntime,
      entitiesHydrated: true,
      reconnecting: false,
    };
    rerender();

    expect(result.current).toEqual([]);
  });

  it('returns no weather devices when disabled', () => {
    const { result } = renderHook(() =>
      useProviderWeatherDevices('home_assistant', { enabled: false })
    );

    expect(result.current).toEqual([]);
  });

  it('keeps forecasts after navigating away and back when the next request fails', async () => {
    const forecast = [{ datetime: '2026-10-12T12:00:00Z', temperature: 18 }];
    vi.mocked(integrationWeatherFeatureService.getForecast).mockResolvedValue(forecast);
    const { result, rerender } = renderHook(
      ({ enabled }) => useProviderWeatherDevices('home_assistant', { enabled }),
      { initialProps: { enabled: true } }
    );
    await act(async () => refreshForecasts());
    expect(result.current[0].forecast).toEqual(forecast);

    rerender({ enabled: false });
    expect(result.current).toEqual([]);
    vi.mocked(integrationWeatherFeatureService.getForecast).mockRejectedValue(new Error('offline'));
    rerender({ enabled: true });
    expect(result.current[0].forecast).toEqual(forecast);
    await act(async () => refreshForecasts());
    expect(result.current[0].forecast).toEqual(forecast);
  });

  it('retains only failed forecast types and accepts successful empty forecasts', async () => {
    const daily = [{ datetime: '2026-10-12T12:00:00Z', temperature: 18 }];
    const hourly = [{ datetime: '2026-10-12T13:00:00Z', temperature: 19 }];
    const request = vi.mocked(integrationWeatherFeatureService.getForecast);
    request.mockImplementation(async (_id, type) => (type === 'daily' ? daily : hourly));
    const { result } = renderHook(() => useProviderWeatherDevices('home_assistant'));
    await act(async () => refreshForecasts());

    request.mockImplementation(async (_id, type) => {
      if (type === 'daily') throw new Error('daily forecast unavailable');
      return [];
    });
    await act(async () => refreshForecasts());
    expect(result.current[0].forecast).toEqual(daily);
    expect(result.current[0]).toHaveProperty('hourlyForecast', []);
  });
});
