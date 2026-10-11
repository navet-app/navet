import {
  BadgeInfo,
  Blinds,
  Bot,
  Calendar,
  Camera,
  CircleAlert,
  CloudSun,
  DoorOpen,
  Droplets,
  Fan,
  Gauge,
  Home,
  Lightbulb,
  Lock,
  type LucideIcon,
  PanelTop,
  PersonStanding,
  Power,
  Radio,
  Snowflake,
  Sparkles,
  Speaker,
  Thermometer,
  Timer,
  Tv,
  User,
  Wind,
  Zap,
} from 'lucide-react';
import type { DeviceCollection } from '../types/device.types';

export const DEVICE_TYPE_ICONS: Record<string, LucideIcon> = {
  lights: Lightbulb,
  fans: Fan,
  hvac: Snowflake,
  climate: Thermometer,
  media: Tv,
  weather: CloudSun,
  switches: Power,
  helpers: BadgeInfo,
  timers: Timer,
  counters: Gauge,
  valves: Droplets,
  remotes: Power,
  covers: Blinds,
  locks: Lock,
  scenes: Sparkles,
  persons: User,
  sensors: Gauge,
  vacuums: Bot,
  calendars: Calendar,
  cameras: Camera,
  'grouped-sensors': Radio,
} satisfies Partial<Record<keyof DeviceCollection, LucideIcon>>;

const MEDIA_DEVICE_CLASS_ICONS: Record<string, LucideIcon> = {
  speaker: Speaker,
  tv: Tv,
  television: Tv,
};

const SENSOR_DEVICE_CLASS_ICONS: Record<string, LucideIcon> = {
  carbon_dioxide: Wind,
  carbon_monoxide: Wind,
  door: DoorOpen,
  energy: Zap,
  garage_door: DoorOpen,
  gas: CircleAlert,
  humidity: Droplets,
  lock: Lock,
  moisture: Droplets,
  motion: PersonStanding,
  occupancy: PersonStanding,
  opening: DoorOpen,
  power: Zap,
  presence: PersonStanding,
  problem: CircleAlert,
  smoke: CircleAlert,
  temperature: Thermometer,
  window: PanelTop,
};

const NORMALIZED_ENTITY_TYPE_TO_DEVICE_TYPE: Record<string, string> = {
  binary_sensor: 'sensors',
  calendar: 'calendars',
  camera: 'cameras',
  cover: 'covers',
  fan: 'fans',
  grouped_sensor: 'grouped-sensors',
  helper: 'helpers',
  timer: 'timers',
  counter: 'counters',
  valve: 'valves',
  remote: 'remotes',
  light: 'lights',
  lock: 'locks',
  media_player: 'media',
  person: 'persons',
  scene: 'scenes',
  sensor: 'sensors',
  switch: 'switches',
  vacuum: 'vacuums',
};

export function getDeviceTypeIcon(type: string, deviceClass?: string): LucideIcon {
  const resolvedType = NORMALIZED_ENTITY_TYPE_TO_DEVICE_TYPE[type] ?? type;

  if (resolvedType === 'media' && deviceClass) {
    return MEDIA_DEVICE_CLASS_ICONS[deviceClass.toLowerCase()] ?? Tv;
  }
  if (resolvedType === 'sensors' && deviceClass) {
    return SENSOR_DEVICE_CLASS_ICONS[deviceClass.toLowerCase()] ?? Gauge;
  }
  if (resolvedType === 'energy') {
    return Zap;
  }
  return DEVICE_TYPE_ICONS[resolvedType] ?? Home;
}
