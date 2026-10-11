import type {
  NavetAlarmAction,
  NavetAlarmCodeFormat,
  NavetAlarmState,
} from '@navet/core/alarm-types';
import type { NavetHelperState } from '@navet/core/helper-state';
import type { NavetEntity } from '@navet/core/types';
import type { CardSize } from '../components/shared/card-size-selector';
import type { NavetMediaCapabilities } from '../core/navet-device-state';
import type { SensorIconType } from '../features/sensors';
import type { PlatformResourceDescriptor } from '../platform/resources';
import type { WeatherForecastMode } from '../stores/settings-store';
import type { TemperatureUnit } from '../utils/temperature';
import type { IntegrationProviderId } from './provider';

export type SecurityKind =
  | 'alarm'
  | 'lock'
  | 'camera'
  | 'siren'
  | 'door'
  | 'window'
  | 'garageDoor'
  | 'opening'
  | 'motion'
  | 'occupancy'
  | 'presence'
  | 'tamper'
  | 'smoke'
  | 'carbonMonoxide'
  | 'gas'
  | 'waterLeak'
  | 'vibration'
  | 'sound'
  | 'safety'
  | 'problem'
  | 'connectivity'
  | 'battery'
  | 'person'
  | 'deviceTracker'
  | 'button'
  | 'event';

export type SecuritySeverity = 'critical' | 'warning' | 'active' | 'normal' | 'unknown';

export interface DeviceMetric {
  label: string;
  value: string | number;
  unit: string;
  icon: SensorIconType;
  category?: 'measurement' | 'configuration';
}

// Base device interface
export interface BaseDevice {
  id: string;
  name: string;
  size: CardSize;
  providerId?: IntegrationProviderId;
  nativeId?: string;
  canonicalId?: string;
  roomId?: string;
  underlyingDeviceId?: string;
  resources?: Partial<
    Record<'primaryImage' | 'artwork' | 'snapshot' | 'stream', PlatformResourceDescriptor>
  >;
  securityKind?: SecurityKind;
  securitySeverity?: SecuritySeverity;
}

// Light device
export interface LightDevice extends BaseDevice {
  room: string;
  state: boolean;
  brightness: number;
  temp: number;
}

// Fan device
export interface FanDevice extends BaseDevice {
  room: string;
  state: boolean;
  percentage: number;
  presetMode?: string;
  presetModes?: string[];
}

// Climate device
export interface ClimateDevice extends BaseDevice {
  room: string;
  temperature: number;
  currentTemperature: number;
  hasCurrentTemperature?: boolean;
  temperatureUnit?: TemperatureUnit;
  mode: string;
  action?: string;
  supportedClimateModes?: string[];
  /** @deprecated Use supportedClimateModes. */
  supportedHvacModes?: string[];
  serviceDomain?: 'climate' | 'water_heater';
}

// Weather device
export interface WeatherDevice extends BaseDevice {
  room: string;
  temperature: number;
  temperatureUnit?: TemperatureUnit;
  feelsLikeTemperature?: number;
  feelsLikeTemperatureUnit?: TemperatureUnit;
  location: string;
  condition: string;
  humidity: number;
  windSpeed: number;
  windSpeedUnit?: string;
  windGustSpeed?: number;
  pressure: number;
  pressureUnit?: string;
  uvIndex?: number;
  cloudCoverage?: number;
  precipitation: number;
  precipitationUnit: string;
  sunrise: string;
  sunset: string;
  daylight: string;
  rainForecast: string;
  highTemp: number;
  highTempUnit?: TemperatureUnit;
  lowTemp: number;
  lowTempUnit?: TemperatureUnit;
  forecastMode: WeatherForecastMode;
  forecast: Array<{
    day: string;
    condition: string;
    high: number;
    highUnit?: TemperatureUnit;
    low: number;
    lowUnit?: TemperatureUnit;
  }>;
}

// Media device
export interface MediaDevice extends BaseDevice {
  isPoweredOn?: boolean;
  room: string;
  title: string;
  artist: string;
  album?: string;
  entityType?: string;
  deviceClass?: string;
  source?: string;
  sourceList?: string[];
  entityPicture?: string;
  state: 'playing' | 'paused' | 'idle' | 'off';
  volume: number;
  isMuted: boolean;
  elapsedSeconds?: number;
  durationSeconds?: number;
  positionUpdatedAt?: string;
  mediaContentId?: string;
  mediaContentType?: string;
  mediaCapabilities?: NavetMediaCapabilities;
  supportsGrouping?: boolean;
  supportsPreviousTrack?: boolean;
  supportsNextTrack?: boolean;
  supportedFeatures?: number;
  groupMembers?: string[];
}

// Switch device
export interface SwitchDevice extends BaseDevice {
  room: string;
  state: boolean;
  entityType?: string;
  deviceClass?: string;
  serviceDomain?: string;
  serviceAction?: string;
  power?: number;
  voltage?: number;
  energy?: number;
  metrics?: DeviceMetric[];
  currentHumidity?: number;
  targetHumidity?: number;
  minHumidity?: number;
  maxHumidity?: number;
  targetHumidityStep?: number;
  mode?: string;
  availableModes?: string[];
  action?: string;
}

export type HelperDevice = Pick<
  SwitchDevice,
  | 'id'
  | 'name'
  | 'room'
  | 'size'
  | 'state'
  | 'entityType'
  | 'serviceDomain'
  | 'serviceAction'
  | 'providerId'
  | 'nativeId'
  | 'canonicalId'
  | 'underlyingDeviceId'
  | 'securityKind'
  | 'securitySeverity'
> & { helper?: NavetHelperState };

// Cover device
export interface CoverDevice extends BaseDevice {
  room: string;
  state?: 'open' | 'closed' | 'opening' | 'closing' | 'unknown' | 'unavailable';
  position: number;
  positionMode?: 'position' | 'tilt';
  deviceClass?: string;
  supportedFeatures?: number;
  hasPosition?: boolean;
}

// Lock device
export interface LockDevice extends BaseDevice {
  room: string;
  state: boolean;
}

// Scene device
export interface SceneDevice extends BaseDevice {
  room: string;
}

// Person device
export interface PersonDevice extends BaseDevice {
  room: string;
  location: string;
  state: 'home' | 'away';
  entityPicture?: string;
}

// Sensor device
export interface SensorDevice extends BaseDevice {
  room: string;
  value: string;
  unit: string;
  icon?: SensorIconType;
  entityType?: string;
  deviceClass?: string;
  groupMembers?: string[];
  sourceDeviceId?: string;
  sourceDeviceName?: string;
  status?: 'measurement' | 'active' | 'clear' | 'unavailable';
  lastUpdated?: string;
  alarmState?: NavetAlarmState;
  alarmSupportedActions?: NavetAlarmAction[];
  alarmCodeFormat?: NavetAlarmCodeFormat;
  alarmRequiresCode?: boolean;
  alarmChangedBy?: string;
  alarmLastChanged?: string;
  availability?: 'available' | 'unavailable' | 'unknown';
}

// Vacuum device
export interface VacuumDevice extends BaseDevice {
  room: string;
  rawStatus?: string;
  status:
    | 'cleaning'
    | 'mopping'
    | 'drying'
    | 'returning'
    | 'docked'
    | 'charging'
    | 'charging-complete'
    | 'paused'
    | 'idle'
    | 'error';
  battery?: number;
  cleanedArea?: string;
  cleaningTime?: string;
  nextCleaning?: string;
  waterLevel?: number | string;
  binLevel?: number | string;
}

// Calendar device
export interface CalendarDevice extends BaseDevice {
  room: string;
  sourceIds?: string[];
  sources?: Array<{
    id: string;
    name: string;
    room: string;
    events: Array<{
      id: string;
      title: string;
      startTime: string;
      endTime: string;
      timeDisplay: string;
      location?: string;
      type: 'meeting' | 'call' | 'event';
      color: string;
      attendees?: number;
      sortKey?: string;
      sourceId?: string;
      sourceName?: string;
    }>;
  }>;
  events: Array<{
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    timeDisplay: string;
    location?: string;
    type: 'meeting' | 'call' | 'event';
    color: string;
    attendees?: number;
    sortKey?: string;
    sourceId?: string;
    sourceName?: string;
  }>;
}

// Camera device
export interface CameraDevice extends BaseDevice {
  room: string;
  sourceDeviceId?: string;
  entityPicture?: string;
  entityPictureSources?: ReadonlyArray<{
    srcSet: string;
    type: string;
  }>;
  state: string;
  supportedFeatures?: number;
  isStreamCapable?: boolean;
  isStillImageOnly?: boolean;
  lastChanged?: string;
  lastUpdated?: string;
  motionDetected?: boolean;
  motionChangedAt?: string;
}

// Grouped Sensor device
export interface GroupedSensorDevice extends BaseDevice {
  room: string;
  sensors: Array<{
    id: string;
    label: string;
    value: string;
    unit: string;
    icon?: SensorIconType;
  }>;
  accentColor?: 'teal' | 'blue' | 'purple' | 'amber' | 'emerald';
}

export interface TimerDevice extends BaseDevice {
  room: string;
  normalizedEntity: NavetEntity;
}
export interface CounterDevice extends BaseDevice {
  room: string;
  normalizedEntity: NavetEntity;
}
export interface ValveDevice extends BaseDevice {
  room: string;
  normalizedEntity: NavetEntity;
}
export interface RemoteDevice extends BaseDevice {
  room: string;
  normalizedEntity: NavetEntity;
}

// Union type for all devices
export type Device =
  | TimerDevice
  | CounterDevice
  | ValveDevice
  | RemoteDevice
  | LightDevice
  | FanDevice
  | ClimateDevice
  | ClimateDevice
  | WeatherDevice
  | MediaDevice
  | SwitchDevice
  | HelperDevice
  | CoverDevice
  | LockDevice
  | SceneDevice
  | PersonDevice
  | SensorDevice
  | VacuumDevice
  | CalendarDevice
  | GroupedSensorDevice
  | CameraDevice;

// Device collection
export interface DeviceCollection {
  timers: TimerDevice[];
  counters: CounterDevice[];
  valves: ValveDevice[];
  remotes: RemoteDevice[];

  lights: LightDevice[];
  fans: FanDevice[];
  hvac: ClimateDevice[];
  climate: ClimateDevice[];
  media: MediaDevice[];
  weather: WeatherDevice[];
  switches: SwitchDevice[];
  helpers: HelperDevice[];
  covers: CoverDevice[];
  locks: LockDevice[];
  scenes: SceneDevice[];
  persons: PersonDevice[];
  sensors: SensorDevice[];
  vacuums: VacuumDevice[];
  calendars: CalendarDevice[];
  cameras: CameraDevice[];
  'grouped-sensors': GroupedSensorDevice[];
}

// Device with type information
export type DeviceWithType = {
  [K in keyof DeviceCollection]: DeviceCollection[K][number] & { type: K };
}[keyof DeviceCollection];
