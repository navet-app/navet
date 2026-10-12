import artworksOriginal from '@assets/reference/media/artworks-original.avif';
import cameraSampleImageAvif from '@assets/reference/media/camera-sample.avif';
import cameraSampleImageWebp from '@assets/reference/media/camera-sample.webp';
import { RUNTIME_SAMPLE_SCREENSHOTS } from '@navet/app/assets/runtime-sample-images';
import { AuthProvider, useOptionalAuthSession } from '@navet/app/auth/AuthProvider';
import { RoomNav } from '@navet/app/components/layout/room-nav';
import type { RoomNavigationGroup } from '@navet/app/components/layout/room-nav.utils';
import { LoadingSpinner } from '@navet/app/components/primitives/loading-spinner';
import { SkipLink } from '@navet/app/components/primitives/skip-link';
import {
  type CardSize,
  getCardGridAutoRowsStyle,
  getCardSpanClass,
  getDashboardCardFootprint,
  getDashboardGridColumnCount,
} from '@navet/app/components/shared/card-size-selector';
import { ALL_ROOMS_ID, isAllRooms } from '@navet/app/constants/rooms';
import { ClimateCard } from '@navet/app/features/climate/components/climate-card';
import { HumidifierCard } from '@navet/app/features/climate/components/humidifier-card';
import type { ClimateDashboardSection } from '@navet/app/features/climate/types/climate-dashboard';
import type { CardTemplate } from '@navet/app/features/dashboard/components/add-entity-dialog/types';
import { HomeEditCommandBar } from '@navet/app/features/dashboard/components/home-edit-command-bar';
import { WidgetCard } from '@navet/app/features/dashboard/components/widget-card';
import { useProgressiveBatching } from '@navet/app/features/dashboard/hooks/use-progressive-batching';
import { DashboardLayout } from '@navet/app/features/dashboard/shell';
import type { CustomCard } from '@navet/app/features/dashboard/stores/custom-cards-store';
import { FanCard } from '@navet/app/features/lighting/components/fan-card';
import { LightCard } from '@navet/app/features/lighting/components/light-card';
import { MediaCard } from '@navet/app/features/media/components/media-card';
import { PersonCard } from '@navet/app/features/person/components/person-card';
import { SceneCard } from '@navet/app/features/scenes/components/scene-card';
import { AlarmPanelCard } from '@navet/app/features/security/components/alarm-panel-card';
import { CoverCard } from '@navet/app/features/security/components/cover-card';
import { LockCard } from '@navet/app/features/security/components/lock-card';
import { GroupedSensorCard } from '@navet/app/features/sensors/components/grouped-sensor-card';
import type { HomeStatusSummaryItem } from '@navet/app/features/sensors/components/home-status-summary-model';
import {
  SummaryBar,
  SummaryBarStack,
} from '@navet/app/features/sensors/components/info-badge-strip';
import { SensorCard } from '@navet/app/features/sensors/components/sensor-card';
import { useBreakpointCols } from '@navet/app/hooks/use-breakpoint-cols';
import { useDeferredVisibility } from '@navet/app/hooks/use-deferred-visibility';
import { I18nProvider, useI18n } from '@navet/app/i18n';
import { integrationSessionRuntime } from '@navet/app/integration-session-runtime';
import type { Section } from '@navet/app/navigation/sections';
import {
  getPreviewRuntimeScenario,
  installPreviewRuntime,
  resetPreviewRuntime,
} from '@navet/app/preview/runtime';
import { useEditModeStore } from '@navet/app/stores/edit-mode-store';
import { useNavigationStore } from '@navet/app/stores/navigation-store';
import { defaultSettings, useSettingsStore } from '@navet/app/stores/settings-store';
import { useThemeStore } from '@navet/app/stores/theme-store';
import type { NavetAlarmEntity } from '@navet/core/alarm-types';
import { Fan, Lightbulb, ShieldCheck, Speaker, Zap } from 'lucide-react';
import {
  Children,
  type ComponentProps,
  type CSSProperties,
  lazy,
  type ReactNode,
  type Ref,
  type RefObject,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { CameraDevice, DeviceWithType, LockDevice, SensorDevice } from '../types/device.types';
import { DEMO_CARD_TEMPLATE_IDS, demoHomeLibraryCards } from './demo-card-library';
import { installDemoDeviceAuthority } from './demo-device-authority';
import { PHOTO_FRAME_DEMO_IMAGES } from './photo-frame-demo-images';

type DemoSection = Section;

const EnergyShot = lazy(async () => {
  const module = await import('./demo-energy-section');
  return { default: module.DemoEnergySection };
});
const CalendarCard = lazy(async () => {
  const module = await import('@navet/app/features/calendar/components/calendar-card');
  return { default: module.CalendarCard };
});
const ClimateDashboard = lazy(async () => {
  const module = await import('@navet/app/features/climate/components/climate-dashboard');
  return { default: module.ClimateDashboard };
});
const DemoSecurityShot = lazy(async () => {
  const module = await import('./demo-security-shot');
  return { default: module.DemoSecurityShot };
});
const TasksShot = lazy(async () => {
  const module = await import('./demo-household-section');
  return { default: module.DemoHouseholdSection };
});
const LightsDashboard = lazy(async () => {
  const module = await import('@navet/app/features/lighting/dashboard/lights-dashboard');
  return { default: module.LightsDashboard };
});
const MediaSection = lazy(async () => {
  const module = await import('@navet/app/components/layout/media-section');
  return { default: module.MediaSection };
});
const SettingsSection = lazy(async () => {
  const module = await import('@navet/app/features/settings/components/settings-section');
  return { default: module.SettingsSection };
});
const CameraCard = lazy(async () => {
  const module = await import('@navet/app/features/security/components/camera-card');
  return { default: module.CameraCard };
});
const EnergyNowCardView = lazy(async () => {
  const module = await import('@navet/app/features/energy/components/widgets/energy-now-card-view');
  return { default: module.EnergyNowCardView };
});
const SwitchCard = lazy(async () => {
  const module = await import('@navet/app/features/lighting/components/switch-card');
  return { default: module.SwitchCard };
});
const VacuumCard = lazy(async () => {
  const module = await import('@navet/app/features/vacuum/components/vacuum-card');
  return { default: module.VacuumCard };
});
const WeatherCard = lazy(async () => {
  const module = await import('@navet/app/features/weather/components/weather-card');
  return { default: module.WeatherCard };
});
const loadAddEntityDialogPrimitive = () =>
  import('@navet/app/features/dashboard/components/add-entity-dialog/primitive');
const AddEntityDialogPrimitive = lazy(async () => {
  const module = await loadAddEntityDialogPrimitive();
  return { default: module.AddEntityDialogPrimitive };
});

const noopCardSizeChange = () => {};
const noopRemoveEntity = () => {};
const DEMO_ROOMS = [
  'Basement',
  'Bathroom',
  'Bedroom',
  'Guest room',
  'Gym',
  'Hallway',
  'Kitchen',
  'Living Room',
  'Office',
  'Outside',
  'Toilet',
  'Unassigned',
  ...Array.from({ length: 48 }, (_, index) => `Demo Room ${String(index + 1).padStart(2, '0')}`),
];
const DEMO_ROOM_GROUPS = [
  {
    id: 'upstairs',
    name: 'Upstairs',
    rooms: ['Bedroom', 'Guest room', 'Office'],
    symbol: 'Layers3',
  },
  {
    id: 'shared-spaces',
    name: 'Shared spaces',
    rooms: ['Kitchen', 'Living Room', 'Hallway'],
    symbol: 'Home',
  },
] satisfies RoomNavigationGroup[];

const energyTrend = [
  ['00:00', 420],
  ['03:00', 360],
  ['06:00', 510],
  ['09:00', 840],
  ['12:00', 690],
  ['15:00', 760],
  ['18:00', 1180],
  ['21:00', 620],
].map(([label, value], index) => ({
  label: String(label),
  value: Number(value),
  timestampMs: Date.UTC(2026, 4, 16, index * 3),
}));

const sampleArtworkImage = artworksOriginal;
const sampleCameraFallbackImage = cameraSampleImageWebp;
const sampleCameraSources = [
  { srcSet: cameraSampleImageAvif, type: 'image/avif' },
  { srcSet: cameraSampleImageWebp, type: 'image/webp' },
] as const;
const {
  energyTablet: demoEnergyImage,
  homePhone: demoMobileImage,
  homeTablet: demoHomeImage,
  securityTablet: demoSecurityImage,
} = RUNTIME_SAMPLE_SCREENSHOTS;
const demoEntityTimestamp = '2026-05-16T08:00:00+00:00';
const demoClimateDevices = [
  {
    id: 'climate.main_floor',
    type: 'climate',
    name: 'Main floor',
    room: 'Hallway',
    size: 'medium',
    temperature: 22,
    currentTemperature: 21,
    temperatureUnit: 'celsius',
    mode: 'heat',
    action: 'heating',
    supportedClimateModes: ['off', 'heat', 'cool', 'auto'],
    providerId: 'home_assistant',
  },
  {
    id: 'climate.upstairs',
    type: 'climate',
    name: 'Upstairs',
    room: 'Hallway',
    size: 'medium',
    temperature: 20,
    currentTemperature: 20.6,
    temperatureUnit: 'celsius',
    mode: 'heat',
    action: 'idle',
    supportedClimateModes: ['off', 'heat', 'cool', 'auto'],
    providerId: 'home_assistant',
  },
  {
    id: 'climate.bedroom',
    type: 'climate',
    name: 'Bedroom',
    room: 'Bedroom',
    size: 'medium',
    temperature: 19,
    currentTemperature: 20.1,
    temperatureUnit: 'celsius',
    mode: 'cool',
    action: 'cooling',
    supportedClimateModes: ['off', 'heat', 'cool', 'auto'],
    providerId: 'home_assistant',
  },
  {
    id: 'fan.bedroom_ceiling',
    type: 'fans',
    name: 'Bedroom fan',
    room: 'Bedroom',
    size: 'small',
    state: true,
    percentage: 66,
    providerId: 'home_assistant',
  },
  {
    id: 'humidifier.bedroom',
    type: 'switches',
    name: 'Bedroom humidifier',
    room: 'Bedroom',
    size: 'medium',
    state: true,
    entityType: 'Humidifier',
    deviceClass: 'humidifier',
    serviceDomain: 'humidifier',
    currentHumidity: 43,
    targetHumidity: 46,
    minHumidity: 30,
    maxHumidity: 70,
    targetHumidityStep: 1,
    mode: 'auto',
    availableModes: ['auto', 'eco', 'sleep'],
    providerId: 'home_assistant',
  },
  {
    id: 'sensor.living_room_temp',
    type: 'sensors',
    name: 'Living room temperature',
    room: 'Living Room',
    size: 'small',
    value: '22.4',
    unit: '°C',
    icon: 'thermometer',
    deviceClass: 'temperature',
    status: 'measurement',
    providerId: 'home_assistant',
  },
  {
    id: 'sensor.living_room_humidity',
    type: 'sensors',
    name: 'Living room humidity',
    room: 'Living Room',
    size: 'small',
    value: '47',
    unit: '%',
    icon: 'droplets',
    deviceClass: 'humidity',
    status: 'measurement',
    providerId: 'home_assistant',
  },
  {
    id: 'sensor.living_room_co2',
    type: 'sensors',
    name: 'Living room CO2',
    room: 'Living Room',
    size: 'small',
    value: '510',
    unit: 'ppm',
    icon: 'gauge',
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
    temperature: 18,
    temperatureUnit: 'celsius',
    feelsLikeTemperature: 17,
    feelsLikeTemperatureUnit: 'celsius',
    location: 'Stockholm',
    condition: 'partlycloudy',
    humidity: 58,
    windSpeed: 12,
    pressure: 1014,
    precipitation: 0.4,
    precipitationUnit: 'mm',
    sunrise: '05:08',
    sunset: '20:51',
    daylight: '15h 43m',
    rainForecast: 'Light rain possible later',
    highTemp: 22,
    lowTemp: 13,
    forecastMode: 'weekly',
    forecast: [],
    providerId: 'home_assistant',
  },
] satisfies DeviceWithType[];
const demoClimateDeviceMap = new Map<string, DeviceWithType>(
  demoClimateDevices.map((device) => [device.id, device])
);
const demoClimateSections: ClimateDashboardSection[] = [
  {
    key: 'climate',
    titleKey: 'sections.climate.title',
    orderedIds: ['climate.main_floor', 'climate.upstairs', 'climate.bedroom'],
  },
  {
    key: 'fans',
    titleKey: 'sections.climate.fans.title',
    orderedIds: ['fan.bedroom_ceiling'],
  },
  {
    key: 'temperature',
    titleKey: 'sections.climate.temperature.title',
    orderedIds: ['sensor.living_room_temp'],
  },
  {
    key: 'humidity',
    titleKey: 'sections.climate.humidity.title',
    orderedIds: ['humidifier.bedroom', 'sensor.living_room_humidity'],
  },
  {
    key: 'airQuality',
    titleKey: 'sections.climate.airQuality.title',
    orderedIds: ['sensor.living_room_co2'],
  },
];
const demoClimateCardSizes: Record<string, CardSize> = {};
const demoLightDevices = [
  {
    id: 'light.kitchen_island',
    name: 'Kitchen island',
    room: 'Kitchen',
    state: true,
    brightness: 72,
    temp: 3200,
    size: 'small',
    type: 'lights',
  },
  {
    id: 'light.kitchen_window',
    name: 'Window lamp',
    room: 'Kitchen',
    state: false,
    brightness: 35,
    temp: 2700,
    size: 'small',
    type: 'lights',
  },
  {
    id: 'light.kitchen_plants',
    name: 'Plant light',
    room: 'Kitchen',
    state: true,
    brightness: 48,
    temp: 4100,
    size: 'small',
    type: 'lights',
  },
  {
    id: 'light.living_ceiling',
    name: 'Living room ceiling',
    room: 'Living room',
    state: false,
    brightness: 55,
    temp: 3000,
    size: 'small',
    type: 'lights',
  },
  {
    id: 'light.reading',
    name: 'Reading corner',
    room: 'Living room',
    state: true,
    brightness: 24,
    temp: 2600,
    size: 'small',
    type: 'lights',
  },
  {
    id: 'light.hall',
    name: 'Hallway',
    room: 'Hallway',
    state: false,
    brightness: 100,
    temp: 3400,
    size: 'small',
    type: 'lights',
  },
] satisfies DeviceWithType[];
const demoLightDeviceMap = new Map<string, DeviceWithType>(
  demoLightDevices.map((device) => [device.id, device])
);
const demoLightScenes = [
  { id: 'scene.evening', type: 'scene', name: 'Evening', room: 'Unassigned', state: 'off' },
  { id: 'scene.movie', type: 'scene', name: 'Movie', room: 'Living room', state: 'off' },
] as const;
const demoSummaryItems: HomeStatusSummaryItem[] = [
  {
    id: 'energy',
    title: 'Energy',
    value: '1.4 kW',
    icon: Zap,
    iconColor: '#f59e0b',
    targetSection: 'energy',
  },
  {
    id: 'climate',
    title: 'Climate',
    value: '21,0-25,4°',
    icon: Fan,
    iconColor: '#22d3ee',
    targetSection: 'climate',
  },
  {
    id: 'security',
    title: 'Security',
    value: 'No Alerts',
    icon: ShieldCheck,
    iconColor: '#22c55e',
    targetSection: 'security',
  },
  {
    id: 'lights',
    title: 'Lights',
    value: '0 On',
    icon: Lightbulb,
    iconColor: '#facc15',
    targetSection: 'lights',
  },
  {
    id: 'media',
    title: 'Speakers & TVs',
    value: 'None Playing',
    icon: Speaker,
    iconColor: '#cbd5e1',
    targetSection: 'media',
  },
];

const demoAlarmEntities: NavetAlarmEntity[] = [
  {
    id: 'home_assistant:alarm_control_panel.home',
    name: 'Home Alarm',
    state: 'armed_home',
    supportedActions: ['arm_home', 'arm_away', 'arm_night', 'disarm'],
    codeFormat: 'number',
    requiresCode: true,
    provider: 'home_assistant',
    availability: 'available',
  },
];

const demoSecurityCameras: CameraDevice[] = [
  {
    id: 'camera.front_door',
    name: 'Front Door',
    room: 'Entrance',
    entityPicture: sampleCameraFallbackImage,
    entityPictureSources: sampleCameraSources,
    size: 'medium',
    state: 'streaming',
    supportedFeatures: 0,
    isStreamCapable: false,
    isStillImageOnly: true,
    lastChanged: demoEntityTimestamp,
    lastUpdated: demoEntityTimestamp,
  },
  {
    id: 'camera.driveway',
    name: 'Driveway',
    room: 'Garage',
    entityPicture: sampleCameraFallbackImage,
    entityPictureSources: sampleCameraSources,
    size: 'medium',
    state: 'idle',
    supportedFeatures: 0,
    isStreamCapable: false,
    isStillImageOnly: true,
    lastChanged: demoEntityTimestamp,
    lastUpdated: demoEntityTimestamp,
  },
  {
    id: 'camera.garden',
    name: 'Garden',
    room: 'Garden',
    entityPicture: sampleCameraFallbackImage,
    entityPictureSources: sampleCameraSources,
    size: 'medium',
    state: 'recording',
    supportedFeatures: 0,
    isStreamCapable: false,
    isStillImageOnly: true,
    lastChanged: demoEntityTimestamp,
    lastUpdated: demoEntityTimestamp,
  },
  {
    id: 'camera.utility_map',
    name: 'Utility Map',
    room: 'Utility',
    entityPicture: sampleCameraFallbackImage,
    entityPictureSources: sampleCameraSources,
    size: 'medium',
    state: '2026-05-16 20:17:10',
    supportedFeatures: 0,
    isStreamCapable: false,
    isStillImageOnly: true,
    lastChanged: demoEntityTimestamp,
    lastUpdated: demoEntityTimestamp,
  },
  {
    id: 'camera.side_gate',
    name: 'Side Gate',
    room: 'Garden',
    entityPicture: sampleCameraFallbackImage,
    entityPictureSources: sampleCameraSources,
    size: 'medium',
    state: 'unavailable',
    securityKind: 'camera',
    securitySeverity: 'unknown',
    supportedFeatures: 0,
    isStreamCapable: false,
    isStillImageOnly: true,
    lastChanged: demoEntityTimestamp,
    lastUpdated: demoEntityTimestamp,
  },
];

const demoSecurityLocks: LockDevice[] = [
  {
    id: 'lock.front_door',
    name: 'Front Door',
    room: 'Entrance',
    size: 'small',
    state: true,
    securityKind: 'lock',
    securitySeverity: 'normal',
  },
  {
    id: 'lock.back_door',
    name: 'Back Door',
    room: 'Kitchen',
    size: 'small',
    state: false,
    securityKind: 'lock',
    securitySeverity: 'warning',
  },
];

const demoSecuritySensors: SensorDevice[] = [
  {
    id: 'binary_sensor.entry_motion',
    nativeId: 'binary_sensor.entry_motion',
    name: 'Entryway',
    room: 'Entrance',
    size: 'small',
    value: 'on',
    unit: '',
    deviceClass: 'motion',
    securityKind: 'motion',
    securitySeverity: 'active',
    status: 'active',
  },
  {
    id: 'binary_sensor.garden_motion',
    nativeId: 'binary_sensor.garden_motion',
    name: 'Garden',
    room: 'Garden',
    size: 'small',
    value: 'on',
    unit: '',
    deviceClass: 'motion',
    securityKind: 'motion',
    securitySeverity: 'active',
    status: 'active',
  },
  {
    id: 'binary_sensor.driveway_motion',
    nativeId: 'binary_sensor.driveway_motion',
    name: 'Driveway',
    room: 'Outside',
    size: 'small',
    value: 'on',
    unit: '',
    deviceClass: 'motion',
    securityKind: 'motion',
    securitySeverity: 'active',
    status: 'active',
  },
  {
    id: 'binary_sensor.hall_occupancy',
    nativeId: 'binary_sensor.hall_occupancy',
    name: 'Hallway',
    room: 'Hallway',
    size: 'small',
    value: 'on',
    unit: '',
    deviceClass: 'occupancy',
    securityKind: 'occupancy',
    securitySeverity: 'active',
    status: 'active',
  },
  {
    id: 'binary_sensor.garage_vibration',
    nativeId: 'binary_sensor.garage_vibration',
    name: 'Garage',
    room: 'Garage',
    size: 'small',
    value: 'on',
    unit: '',
    deviceClass: 'vibration',
    securityKind: 'vibration',
    securitySeverity: 'active',
    status: 'active',
  },
  {
    id: 'binary_sensor.patio_door',
    nativeId: 'binary_sensor.patio_door',
    name: 'Patio Door',
    room: 'Garden',
    size: 'small',
    value: 'on',
    unit: '',
    deviceClass: 'door',
    securityKind: 'door',
    securitySeverity: 'warning',
    status: 'active',
  },
  {
    id: 'binary_sensor.front_door',
    nativeId: 'binary_sensor.front_door',
    name: 'Front Door',
    room: 'Entrance',
    size: 'small',
    value: 'off',
    unit: '',
    deviceClass: 'door',
    securityKind: 'door',
    securitySeverity: 'normal',
    status: 'clear',
  },
  {
    id: 'binary_sensor.kitchen_window',
    nativeId: 'binary_sensor.kitchen_window',
    name: 'Kitchen Window',
    room: 'Kitchen',
    size: 'small',
    value: 'off',
    unit: '',
    deviceClass: 'window',
    securityKind: 'window',
    securitySeverity: 'normal',
    status: 'clear',
  },
  {
    id: 'binary_sensor.garage_door',
    nativeId: 'binary_sensor.garage_door',
    name: 'Garage Door',
    room: 'Garage',
    size: 'small',
    value: 'off',
    unit: '',
    deviceClass: 'garage_door',
    securityKind: 'opening',
    securitySeverity: 'normal',
    status: 'clear',
  },
];

const forecast = [
  { day: 'Mon', condition: 'sunny', high: 22, low: 13 },
  { day: 'Tue', condition: 'partlycloudy', high: 19, low: 12 },
  { day: 'Wed', condition: 'rainy', high: 16, low: 10 },
  { day: 'Thu', condition: 'sunny', high: 21, low: 12 },
  { day: 'Fri', condition: 'cloudy', high: 18, low: 11 },
  { day: 'Sat', condition: 'sunny', high: 20, low: 12 },
  { day: 'Sun', condition: 'partlycloudy', high: 17, low: 10 },
];

const calendarEvents = [
  {
    id: 'demo-calendar-1',
    title: 'School pickup',
    startTime: '15:00',
    endTime: '15:30',
    timeDisplay: '15:00',
    startDateTime: '2026-05-16T15:00:00.000Z',
    endDateTime: '2026-05-16T15:30:00.000Z',
    type: 'event' as const,
    color: 'bg-blue-500',
    location: 'North entrance',
    sortKey: '2026-05-16T15:00:00.000Z',
  },
  {
    id: 'demo-calendar-2',
    title: 'Installer call',
    startTime: '17:30',
    endTime: '18:00',
    timeDisplay: '17:30',
    startDateTime: '2026-05-17T17:30:00.000Z',
    endDateTime: '2026-05-17T18:00:00.000Z',
    type: 'call' as const,
    color: 'bg-purple-500',
    attendees: 2,
    sortKey: '2026-05-17T17:30:00.000Z',
  },
  {
    id: 'demo-calendar-3',
    title: 'Waste pickup',
    startTime: 'All day',
    endTime: 'All day',
    timeDisplay: 'All day',
    startDateTime: '2026-05-18T00:00:00.000Z',
    isAllDay: true,
    type: 'event' as const,
    color: 'bg-green-500',
    location: 'Home',
    sortKey: '2026-05-18T00:00:00.000Z',
  },
];

const demoHomeWidgets: CustomCard[] = [
  {
    id: 'demo-widget-ups',
    type: 'ups',
    size: 'medium',
    room: 'Home',
    createdAt: 0,
    data: {
      deviceId: 'device-ups',
      statusEntityId: 'sensor.nutdev1_status',
      metricEntityIds: [
        'sensor.nutdev1_battery_charge',
        'sensor.nutdev1_load',
        'sensor.nutdev1_battery_runtime',
      ],
    },
  },
  {
    id: 'demo-widget-note',
    type: 'note',
    size: 'medium',
    room: 'Home',
    createdAt: 1,
    data: {
      note: 'Tonight: arm home mode, dim hallway, and start the vacuum after dinner.',
      tintColor: '#f97316',
    },
  },
  {
    id: 'demo-widget-photo',
    type: 'photo',
    size: 'medium',
    room: 'Home',
    createdAt: 2,
    data: {
      sourceMode: 'urls',
      photoImages: PHOTO_FRAME_DEMO_IMAGES,
      shuffleEnabled: false,
    },
  },
  {
    id: 'demo-widget-rss',
    type: 'rss',
    size: 'large',
    room: 'Home',
    createdAt: 3,
    data: {
      articleCount: 4,
      customProviders: [
        {
          id: 'bbc-world',
          name: 'BBC World',
          type: 'url',
          feedUrl: 'https://feeds.bbci.co.uk/news/rss.xml',
          demoItems: [
            {
              id: 'demo-rss-1',
              title: 'Energy dashboard highlights evening demand peak',
              source: 'BBC World',
              timeAgo: '12 min ago',
              url: 'https://www.bbc.com/news',
              excerpt:
                'A practical view of home energy demand helps households shift flexible loads away from the evening peak.',
              imageUrl: demoEnergyImage,
              publishedAtMs: Date.UTC(2026, 4, 16, 18, 40),
            },
            {
              id: 'demo-rss-2',
              title: 'Smart home controls move toward calmer shared screens',
              source: 'BBC World',
              timeAgo: '28 min ago',
              url: 'https://www.bbc.com/news',
              excerpt:
                'Dashboard-first interfaces are focusing on clarity, glanceability, and fewer interruptions for family spaces.',
              imageUrl: demoHomeImage,
              publishedAtMs: Date.UTC(2026, 4, 16, 18, 24),
            },
            {
              id: 'demo-rss-3',
              title: 'Weather systems bring cooler nights across southern Sweden',
              source: 'BBC World',
              timeAgo: '46 min ago',
              url: 'https://www.bbc.com/weather',
              excerpt:
                'Forecasts show mild daytime conditions with cooler nights and a chance of showers later in the week.',
              imageUrl: demoMobileImage,
              publishedAtMs: Date.UTC(2026, 4, 16, 18, 6),
            },
            {
              id: 'demo-rss-4',
              title: 'Connected devices get renewed focus on local-first privacy',
              source: 'BBC World',
              timeAgo: '1 hr ago',
              url: 'https://www.bbc.com/news/technology',
              excerpt:
                'More smart home products are adding local controls and clearer data boundaries for household automation.',
              imageUrl: demoSecurityImage,
              publishedAtMs: Date.UTC(2026, 4, 16, 17, 40),
            },
          ],
        },
      ],
      selectedProviderIds: ['bbc-world'],
    },
  },
  {
    id: 'demo-widget-map',
    type: 'map',
    size: 'medium',
    room: 'Home',
    createdAt: 4,
    data: {
      markers: [
        {
          id: 'person.demo_landskrona',
          name: 'Landskrona',
          latitude: 55.8708,
          longitude: 12.8302,
          state: 'home',
          gpsAccuracy: 24,
        },
      ],
    },
  },
  {
    id: 'demo-widget-battery',
    type: 'battery',
    size: 'medium',
    room: 'Home',
    createdAt: 5,
    data: {
      selectedEntityIds: [
        'sensor.front_door_sensor_battery',
        'sensor.kitchen_remote_battery',
        'sensor.living_room_motion_battery',
      ],
    },
  },
  {
    id: 'demo-widget-button',
    type: 'button',
    size: 'small',
    room: 'Home',
    createdAt: 6,
    data: {
      label: 'Movie Mode',
      service: 'scene.turn_on',
      entityId: 'scene.movie_mode',
      icon: 'Zap',
      tintColor: '#60a5fa',
    },
  },
  {
    id: 'demo-widget-sensor-group',
    type: 'info',
    size: 'medium',
    room: 'Home',
    createdAt: 7,
    data: {
      name: 'Living Room Air',
      sensorEntityIds: [
        'sensor.living_room_temp',
        'sensor.living_room_humidity',
        'sensor.living_room_co2',
      ],
      accentColor: 'teal',
    },
  },
];

const groupedSensors = [
  {
    id: 'sensor.living_room_temp',
    label: 'Temp',
    value: '22.4',
    unit: 'C',
    icon: 'thermometer' as const,
  },
  {
    id: 'sensor.living_room_humidity',
    label: 'Humidity',
    value: '47',
    unit: '%',
    icon: 'droplets' as const,
  },
  { id: 'sensor.living_room_co2', label: 'CO2', value: '510', unit: 'ppm', icon: 'gauge' as const },
  {
    id: 'sensor.living_room_pm25',
    label: 'PM2.5',
    value: '8',
    unit: 'ug/m3',
    icon: 'activity' as const,
  },
];

function useDemoDisplayDefaults() {
  const [runtimeReady, setRuntimeReady] = useState(false);

  useEffect(() => {
    const detectedEffectsQuality = useSettingsStore.getState().effectsQuality;
    const reduceEffects = detectedEffectsQuality === 'low';
    const kioskPreview = window.location.pathname.split('/').filter(Boolean).includes('kiosk');
    useEditModeStore.getState().setEditMode(false);
    useThemeStore.getState().setTheme('dark');
    useThemeStore.getState().setPrimaryColor('orange');
    useThemeStore.getState().setCustomPrimaryColor(null);
    useThemeStore.getState().setWallpaper(null);
    useSettingsStore.getState().updateSettings({
      ...defaultSettings,
      username: 'Navet',
      language: 'en',
      temperatureUnit: 'celsius',
      cameraDashboardViewMode: 'snapshot',
      effectsQuality: detectedEffectsQuality,
      effectsQualityUserOverride: false,
      disableAnimations: reduceEffects,
      lowPowerMode: reduceEffects,
      kioskMode: kioskPreview,
      kioskSwipeRooms: kioskPreview,
    });

    document.documentElement.dataset.theme = 'dark';
    document.documentElement.dataset.navetPreviewRuntime = 'demo';
    document.documentElement.style.setProperty('--navet-accent', '#f97316');
    document.documentElement.dataset.effectsQuality = detectedEffectsQuality;
    document.documentElement.dataset.lowPower = reduceEffects ? 'true' : 'false';
    document.documentElement.dataset.noAnimation = reduceEffects ? 'true' : 'false';
    const restoreDeviceAuthority = installDemoDeviceAuthority();
    const previousSession = integrationSessionRuntime.getSession();
    installPreviewRuntime(getPreviewRuntimeScenario('demo'));
    setRuntimeReady(true);

    return () => {
      restoreDeviceAuthority();
      integrationSessionRuntime.replaceSession(previousSession);
      resetPreviewRuntime();
    };
  }, []);

  return runtimeReady;
}

function CardSlot({
  size,
  children,
  viewportRef,
}: {
  size: CardSize;
  children: ReactNode;
  viewportRef?: Ref<HTMLDivElement>;
}) {
  const breakpointCols = useBreakpointCols();
  const { heightPx } = getDashboardCardFootprint(size, breakpointCols);

  return (
    <div
      ref={viewportRef}
      className={`${getCardSpanClass(size)} min-w-0 [&>*]:h-full`}
      style={{ minHeight: heightPx }}
    >
      {children}
    </div>
  );
}

function DemoLazyCardSlot({
  size,
  children,
  deferUntilVisible = true,
  keyboardLabel,
}: {
  size: CardSize;
  children: ReactNode;
  deferUntilVisible?: boolean;
  keyboardLabel?: string;
}) {
  const { ref, isVisible } = useDeferredVisibility<HTMLDivElement>({
    disabled: !deferUntilVisible,
    rootMargin: '400px 0px',
  });
  const [keyboardRequested, setKeyboardRequested] = useState(false);
  const shouldTransferFocus = useRef(false);
  const shouldRender = isVisible || keyboardRequested;

  return (
    <CardSlot size={size} viewportRef={ref}>
      {shouldRender ? (
        <Suspense
          fallback={
            keyboardLabel ? (
              <DeferredCardLoadingButton
                label={keyboardLabel}
                shouldTransferFocus={shouldTransferFocus}
              />
            ) : (
              <LoadingSpinner />
            )
          }
        >
          {keyboardLabel ? (
            <FocusDeferredCardControl shouldFocus={shouldTransferFocus}>
              {children}
            </FocusDeferredCardControl>
          ) : (
            children
          )}
        </Suspense>
      ) : keyboardLabel ? (
        <button
          type="button"
          aria-label={keyboardLabel}
          className="h-full w-full rounded-2xl focus-visible:outline-2 focus-visible:outline-orange-500"
          onFocus={() => {
            shouldTransferFocus.current = true;
            setKeyboardRequested(true);
          }}
          onClick={() => {
            shouldTransferFocus.current = true;
            setKeyboardRequested(true);
          }}
        />
      ) : (
        <div aria-hidden="true" />
      )}
    </CardSlot>
  );
}

function DeferredCardLoadingButton({
  label,
  shouldTransferFocus,
}: {
  label: string;
  shouldTransferFocus: RefObject<boolean>;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (shouldTransferFocus.current) ref.current?.focus();
  }, [shouldTransferFocus]);

  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-busy="true"
      className="flex h-full w-full items-center justify-center rounded-2xl focus-visible:outline-2 focus-visible:outline-orange-500"
      onFocus={() => {
        shouldTransferFocus.current = true;
      }}
      onBlur={() => {
        shouldTransferFocus.current = false;
      }}
    >
      <LoadingSpinner />
    </button>
  );
}

function FocusDeferredCardControl({
  children,
  shouldFocus,
}: {
  children: ReactNode;
  shouldFocus: RefObject<boolean>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!shouldFocus.current) return;
    ref.current
      ?.querySelector<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), [role="button"][tabindex], [tabindex="0"]'
      )
      ?.focus();
    shouldFocus.current = false;
  }, [shouldFocus]);

  return (
    <div ref={ref} className="h-full [&>*]:h-full">
      {children}
    </div>
  );
}

function DemoVacuumCard() {
  return (
    <DemoLazyCardSlot size="medium" keyboardLabel="Downstairs Vacuum">
      <VacuumCard
        id="vacuum.downstairs"
        name="Downstairs Vacuum"
        status="docked"
        battery={92}
        cleanedArea="48 m²"
        cleaningTime="42 min"
        nextCleaning="Tomorrow"
        size="medium"
        onSizeChange={noopCardSizeChange}
        isEditMode={false}
      />
    </DemoLazyCardSlot>
  );
}

function DemoSwitchCard({
  deferUntilVisible = false,
  ...props
}: ComponentProps<typeof SwitchCard> & { deferUntilVisible?: boolean }) {
  return (
    <DemoLazyCardSlot
      size={props.size}
      deferUntilVisible={deferUntilVisible}
      keyboardLabel={props.name}
    >
      <SwitchCard {...props} />
    </DemoLazyCardSlot>
  );
}

function DemoWeatherCard({
  id,
  location,
  size,
  deferUntilVisible = false,
}: {
  id: string;
  location: string;
  size: CardSize;
  deferUntilVisible?: boolean;
}) {
  return (
    <DemoLazyCardSlot
      size={size}
      deferUntilVisible={deferUntilVisible}
      keyboardLabel={`Weather in ${location}`}
    >
      <WeatherCard
        id={id}
        location={location}
        temperature={18}
        feelsLikeTemperature={17}
        condition="partlycloudy"
        humidity={58}
        windSpeed={12}
        precipitation={0.4}
        precipitationUnit="mm"
        sunrise="05:08"
        sunset="20:51"
        daylight="15h 43m"
        rainForecast="Light rain possible later"
        forecast={forecast}
        forecastMode="weekly"
        highTemp={22}
        lowTemp={13}
        size={size}
        onSizeChange={noopCardSizeChange}
        isEditMode={false}
      />
    </DemoLazyCardSlot>
  );
}

function getRoomEntitySlug(room: string) {
  return room.toLowerCase().replace(/\s+/g, '_');
}

function DashboardGrid({ children }: { children: ReactNode }) {
  const breakpointCols = useBreakpointCols();

  return (
    <div
      className="grid w-full grid-flow-row-dense gap-3 md:gap-3 lg:gap-4"
      style={
        {
          ...getCardGridAutoRowsStyle(breakpointCols),
          gridTemplateColumns: `repeat(${getDashboardGridColumnCount(breakpointCols)}, minmax(0, 1fr))`,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}

function DemoSummaryRow() {
  const setActiveSection = useNavigationStore((state) => state.setActiveSection);

  return <SummaryBar items={demoSummaryItems} onNavigate={setActiveSection} />;
}

function ProductGrid({ addedWidgets }: { addedWidgets: CustomCard[] }) {
  const reduceRenderingWork = useSettingsStore(
    (state) =>
      state.effectsQuality === 'low' ||
      state.lowPowerMode === true ||
      state.disableAnimations === true
  );
  const cardElements = (
    <>
      <CardSlot size="small">
        <LightCard
          id="light.kitchen_island"
          name="Kitchen island"
          room="Kitchen"
          initialState
          initialBrightness={72}
          initialTemp={3600}
          size="small"
          onSizeChange={noopCardSizeChange}
          isEditMode={false}
        />
      </CardSlot>
      <CardSlot size="small">
        <FanCard
          id="fan.bedroom_ceiling"
          name="Bedroom fan"
          room="Bedroom"
          initialState
          initialPercentage={66}
          size="small"
          onSizeChange={noopCardSizeChange}
          isEditMode={false}
        />
      </CardSlot>
      <CardSlot size="medium">
        <ClimateCard
          id="climate.main_floor"
          name="Main floor"
          room="Hallway"
          initialTemp={22}
          initialCurrentTemp={21}
          initialMode="heat"
          initialAction="heating"
          initialState
          size="medium"
          onSizeChange={noopCardSizeChange}
          isEditMode={false}
        />
      </CardSlot>
      <CardSlot size="medium">
        <HumidifierCard
          id="humidifier.bedroom"
          name="Bedroom Humidifier"
          room="Bedroom"
          entityType="Humidifier"
          deviceClass="humidifier"
          initialState
          initialTargetHumidity={46}
          minHumidity={30}
          maxHumidity={70}
          targetHumidityStep={1}
          initialMode="auto"
          availableModes={['auto', 'eco', 'sleep']}
          size="medium"
          onSizeChange={noopCardSizeChange}
          isEditMode={false}
        />
      </CardSlot>
      <CardSlot size="medium">
        <MediaCard
          id="media_player.living_room_speaker"
          name="Living Room Speaker"
          room="Living Room"
          title="Morning Mix"
          artist="Navet Radio"
          entityType="Speaker"
          entityPicture={sampleArtworkImage}
          state="playing"
          volume={42}
          isMuted={false}
          elapsedSeconds={86}
          durationSeconds={243}
          positionUpdatedAt={new Date('2026-05-16T12:00:00.000Z').toISOString()}
          supportsGrouping
          groupMembers={['Kitchen Speaker']}
          size="medium"
          onSizeChange={noopCardSizeChange}
          isEditMode={false}
        />
      </CardSlot>
      <CardSlot size="medium">
        <MediaCard
          id="media_player.living_room_tv"
          name="Living Room TV"
          room="Living Room"
          title="Aerial"
          artist="Navet Studio"
          entityType="TV"
          deviceClass="tv"
          source="Samsung TV Plus"
          sourceList={['Samsung TV Plus', 'HDMI 1', 'HDMI 2', 'Apple TV']}
          state="idle"
          volume={36}
          isMuted={false}
          supportsGrouping={false}
          groupMembers={[]}
          size="medium"
          onSizeChange={noopCardSizeChange}
          isEditMode={false}
          simulateTvRemote
        />
      </CardSlot>
      <CardSlot size="small">
        <CoverCard
          id="cover.living_room_blind"
          name="Living Room Blind"
          room="Living Room"
          initialPosition={48}
          initialDeviceClass="blind"
          size="small"
          onSizeChange={noopCardSizeChange}
          isEditMode={false}
        />
      </CardSlot>
      <CardSlot size="small">
        <LockCard id="lock.front_door" name="Front Door" initialState size="small" />
      </CardSlot>
      <CardSlot size="medium">
        <AlarmPanelCard alarms={demoAlarmEntities} size="medium" />
      </CardSlot>
      <CardSlot size="small">
        <PersonCard
          id="person.alice"
          name="Alice"
          room="Home"
          location="Home"
          state="home"
          size="small"
          onSizeChange={noopCardSizeChange}
          isEditMode={false}
        />
      </CardSlot>
      <DemoWeatherCard id="weather.home" location="Stockholm" size="large" deferUntilVisible />
      <DemoLazyCardSlot size="large" keyboardLabel="Family Calendar">
        <CalendarCard
          id="calendar.home"
          name="Family Calendar"
          room="Home"
          events={calendarEvents}
          inEditMode={false}
          size="large"
          onSizeChange={noopCardSizeChange}
        />
      </DemoLazyCardSlot>
      <DemoLazyCardSlot size="medium">
        <EnergyNowCardView
          title="Energy now"
          currentLoadW={842}
          todayUsageKWh={12.4}
          trend={energyTrend}
          accentColor="#f97316"
          size="medium"
        />
      </DemoLazyCardSlot>
      <DemoSwitchCard
        id="switch.desk_power"
        name="Desk power"
        initialState
        size="small"
        isEditMode={false}
        deferUntilVisible
      />
      <DemoSwitchCard
        id="input_boolean.guest_mode"
        name="Guest mode"
        initialState
        entityType="helper"
        serviceDomain="input_boolean"
        serviceAction="toggle"
        size="small"
        isEditMode={false}
        deferUntilVisible
      />
      <DemoSwitchCard
        id="script.goodnight"
        name="Goodnight"
        initialState={false}
        entityType="script"
        serviceDomain="script"
        serviceAction="turn_on"
        size="small"
        isEditMode={false}
        deferUntilVisible
      />
      <CardSlot size="small">
        <SceneCard
          id="scene.movie_mode"
          name="Movie Mode"
          room="Living Room"
          size="small"
          onSizeChange={noopCardSizeChange}
          isEditMode={false}
        />
      </CardSlot>
      <CardSlot size="small">
        <SensorCard
          id="sensor.living_room_temp"
          name="Living Room Temperature"
          room="Living Room"
          value="22.4"
          unit="C"
          icon="thermometer"
          subtitle="Sensor"
          size="small"
          onSizeChange={noopCardSizeChange}
          isEditMode={false}
        />
      </CardSlot>
      <DemoVacuumCard />
      {[...demoHomeWidgets, ...addedWidgets].map((card) => (
        <DemoWidgetCard key={card.id} card={card} />
      ))}
    </>
  );
  const cards = Children.toArray(cardElements.props.children);
  const visibleCardCount = useProgressiveBatching(cards.length, false, {
    enabled: reduceRenderingWork,
    initialBatch: 2,
    batchSize: 1,
    timeoutFallbackMs: 128,
  });

  return (
    <SummaryBarStack>
      <DemoSummaryRow />
      <DashboardGrid>
        {reduceRenderingWork ? cards.slice(0, visibleCardCount) : cards}
      </DashboardGrid>
    </SummaryBarStack>
  );
}

function DemoWidgetCard({ card }: { card: CustomCard }) {
  const [currentCard, setCurrentCard] = useState(card);
  return (
    <CardSlot size={currentCard.size}>
      <WidgetCard
        card={currentCard}
        isEditMode={false}
        onUpdate={(_id, updates) => setCurrentCard((current) => ({ ...current, ...updates }))}
      />
    </CardSlot>
  );
}

function ClimateShot() {
  const reduceRenderingWork = useSettingsStore(
    (state) =>
      state.effectsQuality === 'low' ||
      state.lowPowerMode === true ||
      state.disableAnimations === true
  );

  return (
    <ClimateDashboard
      deviceMap={demoClimateDeviceMap}
      sections={demoClimateSections}
      temperatureUnit="celsius"
      cardSizes={demoClimateCardSizes}
      updateCardSize={noopCardSizeChange}
      isEditMode={false}
      onRemoveEntity={noopRemoveEntity}
      densePerformanceMode={reduceRenderingWork}
      optimizeOffscreenPaint={reduceRenderingWork}
    />
  );
}

function LightsShot() {
  return (
    <LightsDashboard
      deviceMap={demoLightDeviceMap}
      rooms={['Kitchen', 'Living room', 'Hallway']}
      cardOrders={{
        Kitchen: ['light.kitchen_island', 'light.kitchen_plants', 'light.kitchen_window'],
        'Living room': ['light.reading', 'light.living_ceiling'],
        Hallway: ['light.hall'],
      }}
      scenes={[...demoLightScenes]}
      isEditMode={false}
    />
  );
}

function SettingsShot() {
  return <SettingsSection />;
}

function MediaShot() {
  return <MediaSection />;
}

function HomeRoomShot({
  activeRoom,
  addedWidgets,
}: {
  activeRoom: string;
  addedWidgets: CustomCard[];
}) {
  if (!isAllRooms(activeRoom)) {
    return <RoomShot room={activeRoom} />;
  }

  return (
    <div className="space-y-6">
      <ProductGrid addedWidgets={addedWidgets} />
    </div>
  );
}

function RoomShot({ room }: { room: string }) {
  const roomSlug = getRoomEntitySlug(room);

  if (room === 'Kitchen') {
    return (
      <DashboardGrid>
        <CardSlot size="medium">
          <LightCard
            id="light.kitchen"
            name="Kitchen"
            room="Kitchen"
            initialState
            initialBrightness={84}
            initialTemp={4100}
            size="medium"
            onSizeChange={noopCardSizeChange}
            isEditMode={false}
          />
        </CardSlot>
        <CardSlot size="medium">
          <LightCard
            id="light.kitchen_island_room"
            name="Kitchen island"
            room="Kitchen"
            initialState
            initialBrightness={72}
            initialTemp={3600}
            size="medium"
            onSizeChange={noopCardSizeChange}
            isEditMode={false}
          />
        </CardSlot>
        <DemoSwitchCard
          id="switch.espresso"
          name="Espresso"
          initialState
          entityType="switch"
          serviceDomain="switch"
          serviceAction="toggle"
          power={1140}
          size="small"
          isEditMode={false}
        />
        <DemoLazyCardSlot size="medium" deferUntilVisible={false} keyboardLabel="Family Calendar">
          <CalendarCard
            id="calendar.kitchen"
            name="Family Calendar"
            room="Kitchen"
            events={calendarEvents}
            inEditMode={false}
            size="medium"
            onSizeChange={noopCardSizeChange}
          />
        </DemoLazyCardSlot>
      </DashboardGrid>
    );
  }

  if (room === 'Living Room') {
    return (
      <DashboardGrid>
        <CardSlot size="medium">
          <MediaCard
            id="media_player.living_room_tv_featured"
            name="Living Room TV"
            room="Living Room"
            title="Aerial"
            artist="Navet Studio"
            entityType="TV"
            entityPicture={sampleArtworkImage}
            state="playing"
            volume={42}
            isMuted={false}
            elapsedSeconds={86}
            durationSeconds={243}
            positionUpdatedAt={new Date('2026-05-16T12:00:00.000Z').toISOString()}
            supportsGrouping
            groupMembers={['Kitchen Speaker']}
            size="medium"
            onSizeChange={noopCardSizeChange}
            isEditMode={false}
            simulateTvRemote
          />
        </CardSlot>
        <CardSlot size="medium">
          <LightCard
            id="light.sofa_lamp"
            name="Sofa lamp"
            room="Living Room"
            initialState
            initialBrightness={58}
            initialTemp={2900}
            size="medium"
            onSizeChange={noopCardSizeChange}
            isEditMode={false}
          />
        </CardSlot>
        <CardSlot size="small">
          <CoverCard
            id="cover.patio_curtains"
            name="Patio curtains"
            room="Living Room"
            initialPosition={62}
            initialDeviceClass="curtain"
            size="small"
            onSizeChange={noopCardSizeChange}
            isEditMode={false}
          />
        </CardSlot>
        <CardSlot size="medium">
          <GroupedSensorCard
            id="grouped_sensors.living_room_air"
            name="Living Room Air"
            room="Living Room"
            sensors={groupedSensors}
            accentColor="teal"
            size="medium"
            onSizeChange={noopCardSizeChange}
            isEditMode={false}
          />
        </CardSlot>
      </DashboardGrid>
    );
  }

  if (room === 'Bedroom' || room === 'Guest room') {
    return (
      <DashboardGrid>
        <CardSlot size="small">
          <LightCard
            id={`light.${roomSlug}`}
            name="Bedside lamp"
            room={room}
            initialState={room !== 'Guest room'}
            initialBrightness={35}
            initialTemp={2700}
            size="small"
            onSizeChange={noopCardSizeChange}
            isEditMode={false}
          />
        </CardSlot>
        <CardSlot size="small">
          <ClimateCard
            id={`climate.${roomSlug}`}
            name="Climate"
            room={room}
            initialTemp={21}
            initialCurrentTemp={20}
            initialMode="heat"
            initialAction="heating"
            initialState
            size="small"
            onSizeChange={noopCardSizeChange}
            isEditMode={false}
          />
        </CardSlot>
        <CardSlot size="small">
          <SensorCard
            id={`sensor.${roomSlug}_humidity`}
            name="Humidity"
            room={room}
            value="47"
            unit="%"
            icon="gauge"
            subtitle="Sensor"
            size="small"
            onSizeChange={noopCardSizeChange}
            isEditMode={false}
          />
        </CardSlot>
      </DashboardGrid>
    );
  }

  if (room === 'Outside') {
    return (
      <DashboardGrid>
        <CardSlot size="medium">
          <Suspense fallback={<LoadingSpinner />}>
            <CameraCard
              id="camera.front_door_room"
              name="Front Door Cam"
              room="Outside"
              entityPicture={sampleCameraFallbackImage}
              entityPictureSources={sampleCameraSources}
              supportedFeatures={0}
              isStreamCapable={false}
              size="medium"
              onSizeChange={noopCardSizeChange}
              isEditMode={false}
            />
          </Suspense>
        </CardSlot>
        <CardSlot size="small">
          <LockCard id="lock.front_door_room" name="Front Door" initialState size="small" />
        </CardSlot>
        <DemoSwitchCard
          id="switch.porch_lights"
          name="Porch lights"
          initialState
          size="small"
          isEditMode={false}
        />
        <DemoWeatherCard id="weather.outside_room" location="Home" size="medium" />
      </DashboardGrid>
    );
  }

  return (
    <DashboardGrid>
      <CardSlot size="small">
        <LightCard
          id={`light.${roomSlug}_main`}
          name="Main light"
          room={room}
          initialState
          initialBrightness={52}
          initialTemp={3200}
          size="small"
          onSizeChange={noopCardSizeChange}
          isEditMode={false}
        />
      </CardSlot>
      <CardSlot size="small">
        <SensorCard
          id={`sensor.${roomSlug}_temperature`}
          name="Temperature"
          room={room}
          value="21.8"
          unit="C"
          icon="gauge"
          subtitle="Sensor"
          size="small"
          onSizeChange={noopCardSizeChange}
          isEditMode={false}
        />
      </CardSlot>
      <DemoSwitchCard
        id={`switch.${roomSlug}_power`}
        name="Power"
        initialState={room !== 'Unassigned'}
        size="small"
        isEditMode={false}
      />
    </DashboardGrid>
  );
}

function DemoSectionContent({
  section,
  activeRoom,
  addedWidgets,
}: {
  section: DemoSection;
  activeRoom: string;
  addedWidgets: CustomCard[];
}) {
  if (section === 'energy') return <EnergyShot />;
  if (section === 'climate') return <ClimateShot />;
  if (section === 'security')
    return (
      <DemoSecurityShot
        cameras={demoSecurityCameras}
        locks={demoSecurityLocks}
        sensors={demoSecuritySensors}
        alarms={demoAlarmEntities}
      />
    );
  if (section === 'tasks') return <TasksShot />;
  if (section === 'lights') return <LightsShot />;
  if (section === 'media') return <MediaShot />;
  if (section === 'settings') return <SettingsShot />;
  return <HomeRoomShot activeRoom={activeRoom} addedWidgets={addedWidgets} />;
}

function getDemoSectionFromPath() {
  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  const demoSegmentIndex = pathSegments.indexOf('demo');

  if (demoSegmentIndex === -1) {
    return pathSegments.length === 1 ? sanitizeDemoSection(pathSegments[0]) : null;
  }

  return sanitizeDemoSection(pathSegments[demoSegmentIndex + 1]);
}

function sanitizeDemoSection(value: unknown): DemoSection {
  if (
    value === 'energy' ||
    value === 'climate' ||
    value === 'security' ||
    value === 'tasks' ||
    value === 'lights' ||
    value === 'media' ||
    value === 'settings'
  ) {
    return value;
  }

  return 'home';
}

function DemoContent() {
  const { t } = useI18n();
  const runtimeReady = useDemoDisplayDefaults();
  const authSession = useOptionalAuthSession();
  const [activeRoom, setActiveRoom] = useState<string>(ALL_ROOMS_ID);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [addedWidgets, setAddedWidgets] = useState<CustomCard[]>([]);
  const [removedWidgets, setRemovedWidgets] = useState<CustomCard[]>([]);
  const isEditMode = useEditModeStore((state) => state.isEditMode);
  const toggleEditMode = useEditModeStore((state) => state.toggleEditMode);
  const activeSection = useNavigationStore((state) => state.activeSection);
  const demoSection = getDemoSectionFromPath();
  const section = sanitizeDemoSection(activeSection ?? demoSection ?? 'home');

  useEffect(() => {
    if (section === 'home' && isEditMode) {
      void loadAddEntityDialogPrimitive().catch(() => {
        // The dialog still attempts to load when opened if this optional preload fails.
      });
    }
  }, [isEditMode, section]);

  useEffect(() => {
    if (!runtimeReady || !authSession || authSession.sessions.home_assistant) return;
    authSession.replaceSession({
      providerId: 'home_assistant',
      runtime: 'standalone-oauth',
      authMode: 'oauth',
      haBaseUrl: 'http://homeassistant.local:8123',
      hassUrl: 'http://homeassistant.local:8123',
      expiresAt: Date.now() + 30 * 86_400_000,
    });
  }, [runtimeReady, authSession]);

  const addDemoCard = (template: CardTemplate, size: CardSize) => {
    setAddedWidgets((cards) => [
      ...cards,
      {
        id: `demo-added-${Date.now()}-${cards.length}`,
        type: template.cardType,
        size,
        room: 'Home',
        data: {
          ...demoHomeWidgets.find((card) => card.type === template.cardType)?.data,
          ...template.initialData,
        },
        createdAt: Date.now(),
      },
    ]);
    setRemovedWidgets([]);
    setAddCardOpen(false);
  };

  const addDemoEntity = (entityId: string) => {
    setAddedWidgets((cards) => [
      ...cards,
      {
        id: `demo-added-entity-${Date.now()}-${cards.length}`,
        type: 'entity',
        size: 'medium',
        room: 'Home',
        data: { entityId },
        createdAt: Date.now(),
      },
    ]);
    setRemovedWidgets([]);
    setAddCardOpen(false);
  };

  const undoAddedCard = () => {
    const latest = addedWidgets.at(-1);
    if (!latest) return;
    setAddedWidgets((cards) => cards.slice(0, -1));
    setRemovedWidgets((cards) => [...cards, latest]);
  };

  const redoAddedCard = () => {
    const latest = removedWidgets.at(-1);
    if (!latest) return;
    setRemovedWidgets((cards) => cards.slice(0, -1));
    setAddedWidgets((cards) => [...cards, latest]);
  };

  if (!runtimeReady) {
    return null;
  }

  return (
    <>
      <SkipLink targetId="demo-main-content" label={t('common.skipToMainContent')} />
      {section === 'home' && isEditMode ? (
        <HomeEditCommandBar
          canUndo={addedWidgets.length > 0}
          canRedo={removedWidgets.length > 0}
          onAddCard={isAllRooms(activeRoom) ? () => setAddCardOpen(true) : undefined}
          onUndo={undoAddedCard}
          onRedo={redoAddedCard}
          onToggleEditMode={toggleEditMode}
        />
      ) : null}
      {addCardOpen ? (
        <Suspense fallback={<LoadingSpinner />}>
          <AddEntityDialogPrimitive
            open={addCardOpen}
            onClose={() => setAddCardOpen(false)}
            onAddCard={addDemoCard}
            onAddLibraryCard={addDemoEntity}
            currentRoom={ALL_ROOMS_ID}
            libraryCards={demoHomeLibraryCards.filter(
              (card) => !addedWidgets.some((widget) => widget.data?.entityId === card.id)
            )}
            description="Choose a sample device or add a Navet content card."
            allowedTemplateIds={DEMO_CARD_TEMPLATE_IDS}
          />
        </Suspense>
      ) : null}
      <DashboardLayout
        mobileEditActions={{ isEditMode, onToggleEditMode: toggleEditMode }}
        mobileRoomNavigation={
          section === 'home'
            ? {
                activeRoom,
                onRoomChange: setActiveRoom,
                rooms: DEMO_ROOMS,
                groups: DEMO_ROOM_GROUPS,
              }
            : undefined
        }
      >
        <div
          id="demo-main-content"
          role={section === 'tasks' || section === 'settings' ? undefined : 'main'}
          tabIndex={-1}
          className={`flex w-full flex-col gap-2 md:gap-4 min-[1025px]:gap-6 ${section === 'home' && isEditMode ? 'pt-14' : ''}`}
        >
          {section === 'home' ? (
            <RoomNav
              rooms={DEMO_ROOMS}
              activeRoom={activeRoom}
              onRoomChange={setActiveRoom}
              isEditMode={isEditMode}
              onToggleEditMode={toggleEditMode}
              suppressEditActions={isEditMode}
              showCustomizeButton={false}
            />
          ) : null}
          <Suspense
            fallback={
              section === 'tasks' || section === 'settings' ? (
                <main aria-busy="true">
                  <LoadingSpinner />
                </main>
              ) : (
                <LoadingSpinner />
              )
            }
          >
            <DemoSectionContent
              section={section}
              activeRoom={activeRoom}
              addedWidgets={addedWidgets}
            />
          </Suspense>
        </div>
      </DashboardLayout>
    </>
  );
}

export default function DemoApp() {
  return (
    <I18nProvider>
      <AuthProvider>
        <DemoContent />
      </AuthProvider>
    </I18nProvider>
  );
}
