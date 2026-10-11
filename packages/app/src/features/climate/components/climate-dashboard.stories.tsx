import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import type {
  PlatformEntitySnapshotMap,
  PlatformMessageClient,
} from '@navet/app/platform/provider-feature-models';
import type {
  ProviderEntityRuntimeService,
  ProviderHistoryFeatureService,
} from '@navet/app/platform/provider-feature-services';
import { getProviderRuntimeRegistration } from '@navet/app/provider-runtime-registry';
import { integrationStore } from '@navet/app/stores/integration-store';
import { useThemeStore } from '@navet/app/stores/theme-store';
import type { DeviceWithType } from '@navet/app/types/device.types';
import type { NavetEntity } from '@navet/core/types';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ComponentProps, type ReactNode, useEffect, useMemo } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { ClimateDashboard } from './climate-dashboard';

const comfortableDevices: DeviceWithType[] = [
  {
    id: 'climate.living_room',
    type: 'climate',
    name: 'Living room climate',
    room: 'Living room',
    size: 'medium',
    temperature: 21,
    currentTemperature: 21,
    temperatureUnit: 'celsius',
    mode: 'heat',
    action: 'idle',
    supportedClimateModes: ['off', 'heat', 'cool', 'heat_cool'],
    providerId: 'home_assistant',
  },
  {
    id: 'climate.bedroom',
    type: 'climate',
    name: 'Bedroom climate',
    room: 'Bedroom',
    size: 'medium',
    temperature: 20,
    currentTemperature: 20.2,
    temperatureUnit: 'celsius',
    mode: 'cool',
    action: 'idle',
    supportedClimateModes: ['off', 'heat', 'cool'],
    providerId: 'home_assistant',
  },
  {
    id: 'fan.living_room',
    type: 'fans',
    name: 'Living room fan',
    room: 'Living room',
    size: 'small',
    state: false,
    percentage: 42,
    providerId: 'home_assistant',
  },
  {
    id: 'sensor.living_temperature',
    type: 'sensors',
    name: 'Living room temperature',
    room: 'Living room',
    size: 'small',
    value: '21.4',
    unit: '°C',
    deviceClass: 'temperature',
    status: 'measurement',
    providerId: 'home_assistant',
  },
  {
    id: 'sensor.bedroom_humidity',
    type: 'sensors',
    name: 'Bedroom humidity',
    room: 'Bedroom',
    size: 'small',
    value: '46',
    unit: '%',
    deviceClass: 'humidity',
    status: 'measurement',
    providerId: 'home_assistant',
  },
  {
    id: 'sensor.office_co2',
    type: 'sensors',
    name: 'Office CO2',
    room: 'Office',
    size: 'small',
    value: '720',
    unit: 'ppm',
    deviceClass: 'carbon_dioxide',
    status: 'measurement',
    providerId: 'home_assistant',
  },
  {
    id: 'weather.home',
    type: 'weather',
    name: 'Home weather',
    room: 'Outside',
    size: 'medium',
    temperature: 8,
    temperatureUnit: 'celsius',
    feelsLikeTemperature: 6,
    feelsLikeTemperatureUnit: 'celsius',
    location: 'Home',
    condition: 'cloudy',
    humidity: 74,
    windSpeed: 3,
    pressure: 1012,
    precipitation: 0,
    precipitationUnit: 'mm',
    sunrise: '',
    sunset: '',
    daylight: '',
    rainForecast: '',
    highTemp: 10,
    lowTemp: 4,
    forecastMode: 'hourly',
    forecast: [],
    providerId: 'home_assistant',
  },
];

const sections: ComponentProps<typeof ClimateDashboard>['sections'] = [
  {
    key: 'climate',
    titleKey: 'sections.climate.title',
    orderedIds: ['climate.living_room', 'climate.bedroom'],
  },
  { key: 'fans', titleKey: 'sections.climate.fans.title', orderedIds: ['fan.living_room'] },
  {
    key: 'temperature',
    titleKey: 'sections.climate.temperature.title',
    orderedIds: ['sensor.living_temperature'],
  },
  {
    key: 'humidity',
    titleKey: 'sections.climate.humidity.title',
    orderedIds: ['sensor.bedroom_humidity'],
  },
  {
    key: 'airQuality',
    titleKey: 'sections.climate.airQuality.title',
    orderedIds: ['sensor.office_co2'],
  },
];

const entityTypeByDeviceType: Record<DeviceWithType['type'], NavetEntity['type']> = {
  calendars: 'calendar',
  cameras: 'camera',
  climate: 'climate',
  covers: 'cover',
  fans: 'fan',
  'grouped-sensors': 'grouped_sensor',
  helpers: 'helper',
  timers: 'timer',
  counters: 'counter',
  valves: 'valve',
  remotes: 'remote',
  hvac: 'hvac',
  lights: 'light',
  locks: 'lock',
  media: 'media_player',
  persons: 'person',
  scenes: 'scene',
  sensors: 'sensor',
  switches: 'switch',
  vacuums: 'vacuum',
  weather: 'weather',
};

function toEntity(device: DeviceWithType): NavetEntity {
  return {
    id: device.id,
    canonicalId: `home_assistant:${device.id}`,
    externalId: device.id,
    providerId: 'home_assistant',
    type: entityTypeByDeviceType[device.type],
    name: device.name,
    room: 'room' in device ? device.room : undefined,
    primaryState:
      device.type === 'climate' || device.type === 'hvac'
        ? device.mode
        : 'state' in device
          ? (device.state ?? 'unknown')
          : 'value' in device
            ? device.value
            : 'unknown',
    availability:
      device.type === 'sensors' && device.availability === 'unavailable'
        ? 'unavailable'
        : 'available',
    attributes: {},
    capabilities: [],
  };
}

function createDeviceMap(
  transform: (device: DeviceWithType) => DeviceWithType = (device) => device
) {
  return new Map(comfortableDevices.map((device) => [device.id, transform(device)] as const));
}

function ClimateFixture({ devices, children }: { devices: DeviceWithType[]; children: ReactNode }) {
  const theme = useThemeStore((state) => state.theme);
  const surface = getThemeSurfaceTokens(theme);
  const entitySnapshots = useMemo<PlatformEntitySnapshotMap>(
    () =>
      Object.fromEntries(
        devices
          .filter((device) => device.type === 'sensors')
          .map((device) => [
            device.id,
            {
              entityId: device.id,
              state: device.value,
              attributes: {
                device_class: device.deviceClass,
                state_class: 'measurement',
                unit_of_measurement: device.unit,
              },
            },
          ])
      ),
    [devices]
  );
  const entityRuntimeService = useMemo<ProviderEntityRuntimeService>(
    () => ({
      getEntitySnapshots: () => entitySnapshots,
      getEntitySnapshot: (entityId) => entitySnapshots[entityId],
      subscribeEntitySnapshots: () => () => {},
      subscribeEntitySnapshot: () => () => {},
      getEntityRegistryEntries: () => [],
      subscribeEntityRegistryEntries: () => () => {},
      getConfig: () => null,
      subscribeConfig: () => () => {},
    }),
    [entitySnapshots]
  );
  const historyFeatureService = useMemo<ProviderHistoryFeatureService>(() => {
    const messageClient: PlatformMessageClient = {
      sendMessagePromise: async <TResponse,>(message: unknown) => {
        const request = message as { statistic_ids?: string[] };
        const end = Date.now();
        const values = [20.5, 20.9, 20.7, 21.2, 21, 21.4];
        const response = Object.fromEntries(
          (request.statistic_ids ?? []).map((entityId) => [
            entityId,
            entityId === 'sensor.living_temperature'
              ? values.map((value, index) => ({
                  start: end - (values.length - index) * 60 * 60_000,
                  end: end - (values.length - index - 1) * 60 * 60_000,
                  mean: value,
                  min: value - 0.2,
                  max: value + 0.2,
                }))
              : [],
          ])
        );
        return response as TResponse;
      },
    };
    return {
      getMessageClient: () => messageClient,
      supportsStatisticsHistory: (entityId) => entityId === 'sensor.living_temperature',
    };
  }, []);

  useEffect(() => {
    const previousIntegration = integrationStore.getState();
    const registration = getProviderRuntimeRegistration('home_assistant');
    const previousEntityRuntimeService = registration.entityRuntimeService;
    const previousHistoryFeatureService = registration.historyFeatureService;
    registration.entityRuntimeService = entityRuntimeService;
    registration.historyFeatureService = historyFeatureService;
    integrationStore.setState({
      ...previousIntegration,
      providerEntitiesByCanonicalId: Object.fromEntries(
        devices.map((device) => {
          const entity = toEntity(device);
          return [entity.canonicalId, entity];
        })
      ),
    });
    return () => {
      integrationStore.setState(previousIntegration);
      registration.entityRuntimeService = previousEntityRuntimeService;
      registration.historyFeatureService = previousHistoryFeatureService;
    };
  }, [devices, entityRuntimeService, historyFeatureService]);

  return <div className={`min-h-screen p-3 md:p-6 ${surface.appBg}`}>{children}</div>;
}

function ClimateDashboardStory(props: ComponentProps<typeof ClimateDashboard>) {
  return (
    <ClimateFixture devices={[...props.deviceMap.values()]}>
      <ClimateDashboard {...props} />
    </ClimateFixture>
  );
}

const meta = {
  title: 'Pages/Climate/Whole home',
  component: ClimateDashboardStory,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen', viewport: { defaultViewport: 'desktop1080p' } },
  args: {
    deviceMap: createDeviceMap(),
    sections,
    temperatureUnit: 'celsius',
    cardSizes: {},
    updateCardSize: () => {},
    isEditMode: false,
    onRemoveEntity: () => {},
    densePerformanceMode: false,
    optimizeOffscreenPaint: false,
  },
} satisfies Meta<typeof ClimateDashboardStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Comfortable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('tab', { name: /Temperature/ }));
    await waitFor(() => {
      expect(canvas.getByTestId('sensor-history-sparkline')).toBeInTheDocument();
    });
    const sparkline = canvas.getByTestId('sensor-history-sparkline').querySelector('svg');
    expect(sparkline?.getBoundingClientRect().height).toBeGreaterThan(0);

    await userEvent.click(canvas.getByRole('tab', { name: /Humidity/ }));
    await waitFor(() => {
      expect(canvas.getByRole('meter', { name: 'Bedroom humidity: 46 %' })).toBeInTheDocument();
    });

    await userEvent.click(canvas.getByRole('tab', { name: /Air Quality/ }));
    await waitFor(() => {
      expect(canvas.getByRole('meter', { name: 'Office CO2: 720 ppm' })).toBeInTheDocument();
    });
    const qualityFill = canvasElement.querySelector<HTMLElement>('[data-quality-bar-fill]');
    expect(qualityFill?.getBoundingClientRect().height).toBeGreaterThan(0);
  },
};

export const HeatingAndCooling: Story = {
  args: {
    deviceMap: createDeviceMap((device) => {
      if (device.id === 'climate.living_room' && device.type === 'climate') {
        return { ...device, currentTemperature: 19.4, temperature: 21, action: 'heating' };
      }
      if (device.id === 'climate.bedroom' && device.type === 'climate') {
        return { ...device, currentTemperature: 22.4, temperature: 20, action: 'cooling' };
      }
      return device;
    }),
  },
};

export const NeedsAttention: Story = {
  args: {
    deviceMap: createDeviceMap((device) =>
      device.id === 'sensor.office_co2' && device.type === 'sensors'
        ? { ...device, value: '1180', securitySeverity: 'warning' }
        : device
    ),
  },
};

export const CriticalAirQuality: Story = {
  args: {
    deviceMap: createDeviceMap((device) =>
      device.id === 'sensor.office_co2' && device.type === 'sensors'
        ? { ...device, value: '1420', securitySeverity: 'critical' }
        : device
    ),
  },
};

export const UnavailableSensor: Story = {
  args: {
    deviceMap: createDeviceMap((device) =>
      device.id === 'sensor.bedroom_humidity' && device.type === 'sensors'
        ? { ...device, status: 'unavailable', availability: 'unavailable' }
        : device
    ),
  },
};

export const LongNames: Story = {
  args: {
    deviceMap: createDeviceMap((device) =>
      device.id === 'climate.living_room'
        ? {
            ...device,
            name: 'Living room underfloor heating and cooling controller',
            room: 'Open-plan living room and dining area',
          }
        : device
    ),
  },
};

export const MissingOptionalEnvironmentData: Story = {
  args: {
    deviceMap: new Map(
      comfortableDevices
        .filter((device) => device.type !== 'sensors' && device.type !== 'weather')
        .map((device) => [device.id, device] as const)
    ),
    sections: sections
      .map((section) => ({
        ...section,
        orderedIds: section.orderedIds.filter((id) => !id.startsWith('sensor.')),
      }))
      .filter((section) => section.orderedIds.length > 0),
  },
};

export const MultipleDevicesInOneRoom: Story = {
  args: {
    deviceMap: createDeviceMap((device) =>
      device.id === 'climate.bedroom' && device.type === 'climate'
        ? { ...device, room: 'Living room', name: 'Window heat pump' }
        : device
    ),
  },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Group cards by: Type' }));
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole('menuitemradio', { name: 'Room' })
    );
    const livingRoomTab = canvas.getByRole('tab', { name: /Living room/ });
    await expect(livingRoomTab).toBeVisible();
    await userEvent.click(livingRoomTab);
    await expect(livingRoomTab).toHaveAttribute('aria-selected', 'true');
  },
};

export const WallTablet: Story = {
  globals: {
    viewport: {
      value: 'tabletLandscape',
      isRotated: false,
    },
  },
};

export const Phone: Story = {
  globals: {
    viewport: {
      value: 'iphone14',
      isRotated: false,
    },
  },
};

export const LightTheme: Story = { globals: { theme: 'light' } };
export const DarkTheme: Story = { globals: { theme: 'dark' } };
export const BlackTheme: Story = { globals: { theme: 'black' } };
