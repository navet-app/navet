import previewMediaArtwork from '@assets/reference/media/artworks-original.avif';
import { mapNavetEntitiesToDeviceCollection } from '@navet/app/core/navet-device-collections';
import { setProviderPackageRegistrationOverride } from '@navet/app/provider-package-registry';
import { resetProviderRuntimeRegistrationCache } from '@navet/app/provider-runtime-registry';
import type { HomeAssistantStore } from '@navet/app/stores/home-assistant-store';
import { integrationStore } from '@navet/app/stores/integration-store';
import { createProviderScopedId } from '@navet/app/utils/provider-ids';
import type { NavetProviderContract } from '@navet/core/provider-contract';
import type {
  PlatformAutomationDetails,
  PlatformEntityHistoriesRequest,
  PlatformEntityHistorySeries,
  PlatformMediaBrowseResult,
  PlatformTaskRuntimeSnapshot,
} from '@navet/core/provider-feature-models';
import type {
  ProviderClimateFeatureService,
  ProviderHistoryFeatureService,
  ProviderLightFeatureService,
  ProviderMediaFeatureService,
  ProviderNotificationFeatureService,
  ProviderSecurityFeatureService,
  ProviderTaskFeatureService,
} from '@navet/core/provider-feature-services';
import type { ProviderPackageRegistration } from '@navet/core/provider-runtime-types';
import { createSnapshotBackedProviderAdapter } from '@navet/core/snapshot-backed-adapter';
import type {
  CommandResult,
  NavetCommand,
  NavetEntity,
  NavetProviderRoom,
  NavetProviderState,
} from '@navet/core/types';
import { createStore } from 'zustand/vanilla';
import { enrichDemoEntities } from './demo-entities';
import {
  setInstalledPreviewCommandHandler,
  setInstalledPreviewServiceHandler,
} from './preview-action-bridge';
import { applyPreviewCommandToEntity } from './preview-command-model';
import {
  createPreviewEntityRuntimeService,
  getPreviewSnapshotAttributes,
  getPreviewSnapshotState,
  resetPreviewEntityRuntimeCaches,
} from './preview-entity-runtime-service';

type PreviewHomeAssistantCompatibilityState = Pick<
  HomeAssistantStore,
  | 'areas'
  | 'config'
  | 'connected'
  | 'connecting'
  | 'connection'
  | 'deviceRegistry'
  | 'entities'
  | 'entityRegistry'
  | 'error'
  | 'reconnecting'
  | 'registriesHydrated'
  | 'user'
>;

export interface PreviewRuntimeScenario {
  id: string;
  entities: NavetEntity[];
  rooms: NavetProviderRoom[];
  homeAssistant: PreviewHomeAssistantCompatibilityState;
  taskRuntime: PlatformTaskRuntimeSnapshot;
}

interface PreviewRuntimeState {
  scenario: PreviewRuntimeScenario | null;
}

const PREVIEW_PROVIDER_ID = 'home_assistant';
const PREVIEW_TIMESTAMP = '2026-05-16T08:00:00.000Z';
const PREVIEW_SECURITY_HISTORY: Record<string, Array<{ minutesAgo: number; state: string }>> = {
  'lock.front_door': [
    { minutesAgo: 82, state: 'unlocked' },
    { minutesAgo: 72, state: 'locked' },
  ],
  'lock.back_door': [
    { minutesAgo: 66, state: 'locked' },
    { minutesAgo: 58, state: 'unlocked' },
  ],
  'binary_sensor.patio_door': [
    { minutesAgo: 48, state: 'off' },
    { minutesAgo: 46, state: 'on' },
  ],
  'binary_sensor.entry_motion': [
    { minutesAgo: 39, state: 'off' },
    { minutesAgo: 37, state: 'on' },
  ],
  'binary_sensor.garden_motion': [
    { minutesAgo: 32, state: 'off' },
    { minutesAgo: 30, state: 'on' },
  ],
  'binary_sensor.garage_vibration': [
    { minutesAgo: 25, state: 'off' },
    { minutesAgo: 23, state: 'on' },
  ],
  'binary_sensor.hall_occupancy': [
    { minutesAgo: 18, state: 'off' },
    { minutesAgo: 16, state: 'on' },
  ],
  'binary_sensor.driveway_motion': [
    { minutesAgo: 10, state: 'off' },
    { minutesAgo: 8, state: 'on' },
  ],
};
const PREVIEW_HOME_ASSISTANT_CONFIG = {
  unit_system: {
    temperature: 'C',
  },
  temperature_unit: 'C',
  location_name: 'Navet Preview',
  time_zone: 'Europe/Stockholm',
};

const previewRuntimeStore = createStore<PreviewRuntimeState>(() => ({
  scenario: null,
}));

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

function createPreviewEntity(
  type: NavetEntity['type'],
  externalId: string,
  name: string,
  primaryState: NavetEntity['primaryState'],
  attributes: Record<string, unknown>,
  options: {
    room?: string;
  } = {}
): NavetEntity {
  return {
    id: createProviderScopedId(PREVIEW_PROVIDER_ID, externalId),
    canonicalId: createProviderScopedId(PREVIEW_PROVIDER_ID, externalId),
    providerId: PREVIEW_PROVIDER_ID,
    externalId,
    type,
    name,
    room: options.room ?? 'Home',
    primaryState,
    availability: 'available',
    attributes,
    capabilities: [],
    lastUpdated: PREVIEW_TIMESTAMP,
  };
}

function createPreviewRoom(name: string, memberEntityIds: string[]): NavetProviderRoom {
  const nativeId = slugify(name);
  return {
    id: createProviderScopedId(PREVIEW_PROVIDER_ID, nativeId),
    canonicalId: createProviderScopedId(PREVIEW_PROVIDER_ID, nativeId),
    providerId: PREVIEW_PROVIDER_ID,
    externalId: nativeId,
    name,
    normalizedName: name.trim().toLowerCase(),
    memberIds: memberEntityIds.map((entityId) =>
      createProviderScopedId(PREVIEW_PROVIDER_ID, entityId)
    ),
    sourceType: 'provider_managed',
    supportsOrdering: true,
    supportsDeletion: true,
  };
}

function createHomeAssistantCompatEntity(entity: NavetEntity) {
  const state = getPreviewSnapshotState(entity);

  return {
    entity_id: entity.externalId,
    state,
    attributes: {
      friendly_name: entity.name,
      ...getPreviewSnapshotAttributes(entity),
    },
    last_changed: PREVIEW_TIMESTAMP,
    last_updated: entity.lastUpdated ?? PREVIEW_TIMESTAMP,
    context: {
      id: `preview-${entity.externalId}`,
      parent_id: null,
      user_id: null,
    },
  };
}

function createHomeAssistantCompatibilityState(
  entities: NavetEntity[],
  areas: Array<{ area_id: string; name: string }>,
  deviceRegistry: Array<{ id: string; area_id: string | null; name?: string | null }>,
  entityRegistry: Array<{ entity_id: string; device_id: string | null; area_id?: string | null }>
): PreviewHomeAssistantCompatibilityState {
  return {
    connected: true,
    connecting: false,
    reconnecting: false,
    connection: null,
    config: PREVIEW_HOME_ASSISTANT_CONFIG as unknown as HomeAssistantStore['config'],
    entities: Object.fromEntries(
      entities.map((entity) => [entity.externalId, createHomeAssistantCompatEntity(entity)])
    ),
    user: null,
    areas: areas as HomeAssistantStore['areas'],
    deviceRegistry: deviceRegistry as HomeAssistantStore['deviceRegistry'],
    entityRegistry: entityRegistry as HomeAssistantStore['entityRegistry'],
    registriesHydrated: true,
    error: null,
  };
}

function createTaskRuntimeSnapshot(): PlatformTaskRuntimeSnapshot {
  return {
    entities: {
      'automation.good_morning': {
        entityId: 'automation.good_morning',
        state: 'on',
        name: 'Good morning',
        attributes: {
          description:
            'Raises bedroom lights, starts the kitchen speaker, and sets downstairs heat.',
          category: 'Morning',
          last_triggered: '2026-05-16T06:45:00.000Z',
          mode: 'single',
          current: 0,
        },
      },
      'automation.night_check': {
        entityId: 'automation.night_check',
        state: 'on',
        name: 'Night check',
        attributes: {
          description: 'Locks doors, arms home mode, and turns off common-area lights after 22:30.',
          category: 'Security',
          last_triggered: '2026-05-15T22:32:00.000Z',
          mode: 'queued',
          current: 0,
        },
      },
      'automation.away_presence': {
        entityId: 'automation.away_presence',
        state: 'off',
        name: 'Away presence',
        attributes: {
          description: 'Runs presence lighting and camera notifications when nobody is home.',
          category: 'Presence',
          last_triggered: '2026-05-14T18:10:00.000Z',
          mode: 'restart',
          current: 0,
        },
      },
      'scene.movie_mode': {
        entityId: 'scene.movie_mode',
        state: 'scening',
        name: 'Movie mode',
        attributes: {},
      },
      'script.goodnight': {
        entityId: 'script.goodnight',
        state: 'off',
        name: 'Goodnight',
        attributes: {},
      },
    },
    rooms: [
      { id: 'kitchen', name: 'Kitchen' },
      { id: 'living-room', name: 'Living Room' },
      { id: 'hallway', name: 'Hallway' },
      { id: 'outside', name: 'Outside' },
    ],
    devices: [
      { id: 'device-kitchen', roomId: 'kitchen' },
      { id: 'device-living-room', roomId: 'living-room' },
      { id: 'device-hallway', roomId: 'hallway' },
      { id: 'device-outside', roomId: 'outside' },
    ],
    entityReferences: [
      { entityId: 'automation.good_morning', roomId: 'kitchen', deviceId: 'device-kitchen' },
      { entityId: 'automation.night_check', roomId: 'hallway', deviceId: 'device-hallway' },
      { entityId: 'automation.away_presence', roomId: 'outside', deviceId: 'device-outside' },
      { entityId: 'scene.movie_mode', roomId: 'living-room', deviceId: 'device-living-room' },
      { entityId: 'script.goodnight', roomId: 'hallway', deviceId: 'device-hallway' },
    ],
  };
}

function createPreviewMediaEntity({
  album,
  artist = '',
  deviceClass,
  externalId,
  groupMembers = [],
  name,
  room,
  source,
  sourceList,
  state,
  title,
  volume,
}: {
  album?: string;
  artist?: string;
  deviceClass: 'player' | 'receiver' | 'speaker' | 'streaming_box' | 'tv';
  externalId: string;
  groupMembers?: string[];
  name: string;
  room: string;
  source: string;
  sourceList: string[];
  state: 'idle' | 'playing';
  title: string;
  volume: number;
}) {
  return createPreviewEntity(
    'media_player',
    externalId,
    name,
    state,
    {
      value: state,
      friendly_name: name,
      title,
      artist,
      album,
      entityType:
        deviceClass === 'speaker'
          ? 'Speaker'
          : deviceClass === 'tv'
            ? 'TV'
            : deviceClass === 'streaming_box'
              ? 'Streaming box'
              : deviceClass === 'player'
                ? 'Media player'
                : 'Cast receiver',
      deviceClass,
      device_class: deviceClass,
      source,
      sourceList,
      source_list: sourceList,
      volume,
      volume_level: volume / 100,
      isMuted: false,
      is_volume_muted: false,
      elapsedSeconds: state === 'playing' ? 35 : 0,
      media_position: state === 'playing' ? 35 : 0,
      durationSeconds: state === 'playing' ? 248 : 0,
      media_duration: state === 'playing' ? 248 : 0,
      media_title: title,
      media_artist: artist,
      media_album_name: album,
      supportsGrouping: deviceClass === 'speaker' || deviceClass === 'receiver',
      groupMembers,
      group_members: groupMembers,
      supported_features: 969_279,
      room,
      deviceId: `device-${externalId.replaceAll('.', '-')}`,
    },
    { room }
  );
}

function createPreviewScenario(): PreviewRuntimeScenario {
  const entities: NavetEntity[] = [
    createPreviewEntity(
      'light',
      'light.living_room',
      'Living Room',
      'on',
      {
        value: 'on',
        brightnessPct: 68,
        colorTemperatureKelvin: 3200,
        supportedColorModes: ['brightness', 'color_temp'],
        colorMode: 'color_temp',
        effect: 'None',
        effectList: ['None', 'Rainbow', 'Fire', 'Twinkle'],
        room: 'Living Room',
        deviceId: 'device-living-room-light',
      },
      { room: 'Living Room' }
    ),
    createPreviewEntity(
      'light',
      'light.kitchen',
      'Kitchen',
      'on',
      {
        value: 'on',
        brightnessPct: 84,
        colorTemperatureKelvin: 4100,
        supportedColorModes: ['brightness', 'color_temp'],
        colorMode: 'color_temp',
        room: 'Kitchen',
        deviceId: 'device-kitchen-light',
      },
      { room: 'Kitchen' }
    ),
    createPreviewEntity(
      'light',
      'light.kitchen_island',
      'Kitchen island',
      'on',
      {
        value: 'on',
        brightnessPct: 72,
        supportedColorModes: ['brightness'],
        colorMode: 'brightness',
        room: 'Kitchen',
        deviceId: 'device-kitchen-island-light',
      },
      { room: 'Kitchen' }
    ),
    createPreviewEntity(
      'fan',
      'fan.bedroom_ceiling',
      'Bedroom fan',
      'on',
      {
        value: 'on',
        percentage: 66,
        room: 'Bedroom',
        deviceId: 'device-bedroom-fan',
      },
      { room: 'Bedroom' }
    ),
    createPreviewEntity(
      'hvac',
      'climate.main_floor',
      'Main floor',
      'heat',
      {
        value: 'heat',
        temperature: 22,
        currentTemperature: 21,
        temperatureUnit: 'celsius',
        action: 'heating',
        supportedHvacModes: ['off', 'heat', 'cool', 'auto'],
        room: 'Hallway',
        deviceId: 'device-hallway-climate',
      },
      { room: 'Hallway' }
    ),
    createPreviewEntity(
      'climate',
      'humidifier.bedroom',
      'Bedroom Humidifier',
      'on',
      {
        value: 'on',
        entityType: 'Humidifier',
        deviceClass: 'humidifier',
        targetHumidity: 46,
        minHumidity: 30,
        maxHumidity: 70,
        targetHumidityStep: 1,
        mode: 'auto',
        availableModes: ['auto', 'eco', 'sleep'],
        room: 'Bedroom',
        deviceId: 'device-bedroom-humidifier',
        serviceDomain: 'humidifier',
      },
      { room: 'Bedroom' }
    ),
    createPreviewEntity(
      'media_player',
      'media_player.living_room_speaker',
      'Living Room Speaker',
      'playing',
      {
        value: 'playing',
        friendly_name: 'Living Room Speaker',
        title: 'Morning Mix',
        artist: 'Navet Radio',
        entityType: 'Speaker',
        entityPicture: previewMediaArtwork,
        entity_picture: previewMediaArtwork,
        source: 'Spotify',
        sourceList: ['Spotify', 'AirPlay', 'Radio'],
        volume: 42,
        isMuted: false,
        elapsedSeconds: 86,
        durationSeconds: 243,
        positionUpdatedAt: '2026-05-16T12:00:00.000Z',
        supportsGrouping: true,
        groupMembers: ['Kitchen Speaker'],
        room: 'Living Room',
        deviceId: 'device-living-room-speaker',
      },
      { room: 'Living Room' }
    ),
    createPreviewMediaEntity({
      externalId: 'media_player.demo_spotify',
      name: 'Spotify',
      room: 'Whole home',
      title: 'Olalla',
      artist: 'Blanco White',
      album: 'On the Other Side',
      deviceClass: 'receiver',
      source: 'Kitchen',
      sourceList: ['Bathroom', 'Kitchen', 'Living room', 'Bedroom'],
      state: 'playing',
      volume: 36,
    }),
    createPreviewMediaEntity({
      externalId: 'media_player.demo_kitchen',
      name: 'Kitchen',
      room: 'Kitchen',
      title: 'Olalla',
      artist: 'Blanco White',
      album: 'On the Other Side',
      deviceClass: 'speaker',
      source: 'Spotify',
      sourceList: ['Spotify', 'AirPlay', 'Radio'],
      state: 'playing',
      volume: 36,
      groupMembers: [
        'media_player.demo_kitchen',
        'media_player.demo_living_room',
        'media_player.demo_bedroom',
      ],
    }),
    createPreviewMediaEntity({
      externalId: 'media_player.demo_living_room',
      name: 'Living room',
      room: 'Living Room',
      title: 'Olalla',
      artist: 'Blanco White',
      album: 'On the Other Side',
      deviceClass: 'speaker',
      source: 'Spotify',
      sourceList: ['Spotify', 'AirPlay', 'Radio'],
      state: 'playing',
      volume: 31,
      groupMembers: [
        'media_player.demo_kitchen',
        'media_player.demo_living_room',
        'media_player.demo_bedroom',
      ],
    }),
    createPreviewMediaEntity({
      externalId: 'media_player.demo_bedroom',
      name: 'Bedroom',
      room: 'Bedroom',
      title: 'Olalla',
      artist: 'Blanco White',
      album: 'On the Other Side',
      deviceClass: 'speaker',
      source: 'Spotify',
      sourceList: ['Spotify', 'AirPlay', 'Radio'],
      state: 'playing',
      volume: 24,
      groupMembers: [
        'media_player.demo_kitchen',
        'media_player.demo_living_room',
        'media_player.demo_bedroom',
      ],
    }),
    createPreviewMediaEntity({
      externalId: 'media_player.demo_bathroom',
      name: 'Bathroom',
      room: 'Bathroom',
      title: 'Bathroom',
      deviceClass: 'speaker',
      source: 'AirPlay',
      sourceList: ['Spotify', 'AirPlay', 'Radio'],
      state: 'idle',
      volume: 20,
    }),
    createPreviewMediaEntity({
      externalId: 'media_player.demo_kitchen_display',
      name: 'Kitchen display',
      room: 'Kitchen',
      title: 'Kitchen display',
      deviceClass: 'receiver',
      source: 'Google Cast',
      sourceList: ['Google Cast', 'Spotify', 'YouTube'],
      state: 'idle',
      volume: 28,
    }),
    createPreviewMediaEntity({
      externalId: 'media_player.demo_office_cast',
      name: 'Office Cast',
      room: 'Office',
      title: 'Office Cast',
      deviceClass: 'receiver',
      source: 'Google Cast',
      sourceList: ['Google Cast', 'Spotify', 'YouTube Music'],
      state: 'idle',
      volume: 18,
    }),
    createPreviewMediaEntity({
      externalId: 'media_player.demo_apple_tv',
      name: 'Apple TV 4K',
      room: 'Living Room',
      title: 'Apple TV 4K',
      deviceClass: 'streaming_box',
      source: 'Apple TV',
      sourceList: ['Apple TV', 'AirPlay', 'Disney+', 'Netflix'],
      state: 'idle',
      volume: 24,
    }),
    createPreviewMediaEntity({
      externalId: 'media_player.demo_playstation_5',
      name: 'PlayStation 5',
      room: 'Living Room',
      title: "Astro's Playroom",
      artist: 'PlayStation 5',
      deviceClass: 'player',
      source: 'PlayStation 5',
      sourceList: ['PlayStation 5', 'Blu-ray', 'Media'],
      state: 'playing',
      volume: 30,
    }),
    createPreviewMediaEntity({
      externalId: 'media_player.demo_living_room_tv',
      name: 'Living room TV',
      room: 'Living Room',
      title: 'Samsung TV Plus',
      artist: 'Live',
      deviceClass: 'tv',
      source: 'HDMI 1',
      sourceList: ['HDMI 1', 'Apple TV', 'TV'],
      state: 'idle',
      volume: 18,
    }),
    createPreviewEntity(
      'weather',
      'weather.home',
      'Home Weather',
      'partlycloudy',
      {
        value: 'partlycloudy',
        location: 'Stockholm',
        temperature: 18,
        feelsLikeTemperature: 17,
        humidity: 58,
        windSpeed: 12,
        precipitation: 0.4,
        precipitationUnit: 'mm',
        sunrise: '05:08',
        sunset: '20:51',
        daylight: '15h 43m',
        rainForecast: 'Light rain possible later',
        highTemp: 22,
        lowTemp: 13,
        forecastMode: 'weekly',
        forecast: [
          { day: 'Mon', condition: 'sunny', high: 22, low: 13 },
          { day: 'Tue', condition: 'partlycloudy', high: 19, low: 12 },
        ],
        room: 'Outside',
        deviceId: 'device-outside-weather',
      },
      { room: 'Outside' }
    ),
    createPreviewEntity(
      'switch',
      'switch.desk_power',
      'Desk power',
      true,
      {
        value: true,
        entityType: 'switch',
        serviceDomain: 'switch',
        serviceAction: 'toggle',
        power: 230,
        room: 'Office',
        deviceId: 'device-office-switch',
      },
      { room: 'Office' }
    ),
    createPreviewEntity(
      'helper',
      'input_boolean.guest_mode',
      'Guest mode',
      true,
      {
        value: true,
        entityType: 'helper',
        serviceDomain: 'input_boolean',
        serviceAction: 'toggle',
        room: 'Hallway',
        deviceId: 'device-hallway-helper',
      },
      { room: 'Hallway' }
    ),
    createPreviewEntity(
      'cover',
      'cover.living_room_blind',
      'Living Room Blind',
      'open',
      {
        value: 'open',
        position: 72,
        positionMode: 'position',
        deviceClass: 'blind',
        supportedFeatures: 15,
        hasPosition: true,
        room: 'Living Room',
        deviceId: 'device-living-room-cover',
      },
      { room: 'Living Room' }
    ),
    createPreviewEntity(
      'lock',
      'lock.front_door',
      'Front Door',
      'locked',
      {
        value: 'locked',
        locked: true,
        room: 'Entrance',
        deviceId: 'device-entrance-lock',
      },
      { room: 'Entrance' }
    ),
    createPreviewEntity(
      'scene',
      'scene.movie_mode',
      'Movie Mode',
      'scening',
      {
        value: 'scening',
        room: 'Living Room',
        deviceId: 'device-living-room-scene',
      },
      { room: 'Living Room' }
    ),
    createPreviewEntity(
      'camera',
      'camera.front_door',
      'Front Door',
      'idle',
      {
        value: 'idle',
        entityPicture: '/assets/reference/media/camera-sample.webp',
        entityPictureSources: [
          { srcSet: '/assets/reference/media/camera-sample.avif', type: 'image/avif' },
          { srcSet: '/assets/reference/media/camera-sample.webp', type: 'image/webp' },
        ],
        supportedFeatures: 0,
        isStreamCapable: false,
        room: 'Outside',
        deviceId: 'device-outside-camera',
      },
      { room: 'Outside' }
    ),
    createPreviewEntity(
      'person',
      'person.alice',
      'Alice',
      'home',
      {
        value: 'home',
        location: 'Home',
        latitude: 55.8708,
        longitude: 12.8302,
        gps_accuracy: 24,
        entity_picture: '/assets/reference/portraits/alice.png',
        room: 'Home',
        deviceId: 'device-person-alice',
      },
      { room: 'Home' }
    ),
    createPreviewEntity(
      'unknown',
      'device_tracker.phone_charlie',
      'Charlie',
      'not_home',
      {
        value: 'not_home',
        latitude: 55.874,
        longitude: 12.835,
        gps_accuracy: 12,
        room: 'Home',
        deviceId: 'device-tracker-charlie',
      },
      { room: 'Home' }
    ),
    createPreviewEntity(
      'sensor',
      'sensor.front_door_sensor_battery',
      'Front Door Sensor',
      '18',
      {
        value: '18',
        deviceClass: 'battery',
        unit: '%',
        unit_of_measurement: '%',
        room: 'Entrance',
        deviceId: 'device-entrance-sensor',
      },
      { room: 'Entrance' }
    ),
    createPreviewEntity(
      'sensor',
      'sensor.kitchen_remote_battery',
      'Kitchen Remote',
      '42',
      {
        value: '42',
        deviceClass: 'battery',
        unit: '%',
        unit_of_measurement: '%',
        room: 'Kitchen',
        deviceId: 'device-kitchen-remote',
      },
      { room: 'Kitchen' }
    ),
    createPreviewEntity(
      'binary_sensor',
      'binary_sensor.entry_motion',
      'Entry Motion',
      'on',
      {
        value: 'on',
        icon: 'activity',
        unit: '',
        entityType: 'Sensor',
        deviceClass: 'motion',
        status: 'active',
        room: 'Entrance',
        deviceId: 'device-entry-motion',
        securityKind: 'motion',
        securitySeverity: 'active',
      },
      { room: 'Entrance' }
    ),
    createPreviewEntity(
      'sensor',
      'sensor.living_room_temp',
      'Living Room Temperature',
      '22.4',
      {
        value: '22.4',
        deviceClass: 'temperature',
        unit: 'C',
        unit_of_measurement: 'C',
        icon: 'thermometer',
        room: 'Living Room',
        deviceId: 'device-living-room-air',
      },
      { room: 'Living Room' }
    ),
    createPreviewEntity(
      'grouped_sensor',
      'grouped_sensors.living_room_air',
      'Living Room Air',
      '22.4',
      {
        value: '22.4',
        sensors: [
          {
            id: 'sensor.living_room_temp',
            label: 'Temp',
            value: '22.4',
            unit: 'C',
            icon: 'thermometer',
          },
          {
            id: 'sensor.living_room_humidity',
            label: 'Humidity',
            value: '47',
            unit: '%',
            icon: 'droplets',
          },
          { id: 'sensor.living_room_co2', label: 'CO2', value: '510', unit: 'ppm', icon: 'gauge' },
        ],
        accentColor: 'teal',
        room: 'Living Room',
        deviceId: 'device-living-room-air',
      },
      { room: 'Living Room' }
    ),
    createPreviewEntity(
      'vacuum',
      'vacuum.downstairs',
      'Downstairs Vacuum',
      'docked',
      {
        value: 'docked',
        status: 'docked',
        battery: 92,
        cleanedArea: '48 m2',
        cleaningTime: '42 min',
        nextCleaning: 'Tomorrow',
        room: 'Home',
        deviceId: 'device-vacuum-downstairs',
      },
      { room: 'Home' }
    ),
    createPreviewEntity(
      'calendar',
      'calendar.home',
      'Family Calendar',
      'on',
      {
        value: 'on',
        events: [
          {
            id: 'demo-calendar-1',
            title: 'School pickup',
            startTime: '15:00',
            endTime: '15:30',
            timeDisplay: '15:00',
            startDateTime: '2026-05-16T15:00:00.000Z',
            endDateTime: '2026-05-16T15:30:00.000Z',
            type: 'event',
            color: 'bg-blue-500',
            location: 'North entrance',
            sortKey: '2026-05-16T15:00:00.000Z',
          },
        ],
        room: 'Home',
        deviceId: 'device-calendar-home',
      },
      { room: 'Home' }
    ),
    createPreviewEntity(
      'sensor',
      'alarm_control_panel.home',
      'Home Alarm',
      'armed_home',
      {
        value: 'armed_home',
        alarmState: 'armed_home',
        alarmSupportedActions: ['arm_home', 'arm_away', 'arm_night', 'disarm'],
        alarmCodeFormat: 'number',
        alarmRequiresCode: true,
        availability: 'available',
        room: 'Home',
        deviceId: 'device-home-alarm',
      },
      { room: 'Home' }
    ),
    createPreviewEntity(
      'sensor',
      'sensor.nutdev1_battery_charge',
      'Battery charge',
      '97',
      {
        value: '97',
        deviceClass: 'battery',
        unit: '%',
        unit_of_measurement: '%',
        room: 'Server Room',
        deviceId: 'device-ups',
      },
      { room: 'Server Room' }
    ),
    createPreviewEntity(
      'sensor',
      'sensor.nutdev1_load',
      'Load',
      '14',
      {
        value: '14',
        unit: '%',
        unit_of_measurement: '%',
        room: 'Server Room',
        deviceId: 'device-ups',
      },
      { room: 'Server Room' }
    ),
    createPreviewEntity(
      'sensor',
      'sensor.nutdev1_status',
      'Status',
      'Online',
      {
        value: 'Online',
        room: 'Server Room',
        deviceId: 'device-ups',
      },
      { room: 'Server Room' }
    ),
    createPreviewEntity(
      'sensor',
      'sensor.nutdev1_status_data',
      'Status data',
      'OL',
      {
        value: 'OL',
        room: 'Server Room',
        deviceId: 'device-ups',
      },
      { room: 'Server Room' }
    ),
    createPreviewEntity(
      'sensor',
      'sensor.nutdev1_input_voltage',
      'Input voltage',
      '232',
      {
        value: '232',
        unit: 'V',
        unit_of_measurement: 'V',
        room: 'Server Room',
        deviceId: 'device-ups',
      },
      { room: 'Server Room' }
    ),
    createPreviewEntity(
      'sensor',
      'sensor.nutdev1_output_voltage',
      'Output voltage',
      '230',
      {
        value: '230',
        unit: 'V',
        unit_of_measurement: 'V',
        room: 'Server Room',
        deviceId: 'device-ups',
      },
      { room: 'Server Room' }
    ),
    createPreviewEntity(
      'sensor',
      'sensor.nutdev1_battery_runtime',
      'Battery runtime',
      '1320',
      {
        value: '1320',
        unit: 's',
        unit_of_measurement: 's',
        room: 'Server Room',
        deviceId: 'device-ups',
      },
      { room: 'Server Room' }
    ),
  ];

  const rooms = [
    createPreviewRoom('Living Room', [
      'light.living_room',
      'sensor.living_room_temp',
      'grouped_sensors.living_room_air',
      'cover.living_room_blind',
      'scene.movie_mode',
    ]),
    createPreviewRoom('Kitchen', [
      'light.kitchen',
      'light.kitchen_island',
      'sensor.kitchen_remote_battery',
    ]),
    createPreviewRoom('Bedroom', ['fan.bedroom_ceiling', 'humidifier.bedroom']),
    createPreviewRoom('Hallway', ['climate.main_floor', 'input_boolean.guest_mode']),
    createPreviewRoom('Outside', ['camera.front_door', 'weather.home']),
    createPreviewRoom('Home', [
      'person.alice',
      'vacuum.downstairs',
      'calendar.home',
      'alarm_control_panel.home',
    ]),
    createPreviewRoom('Server Room', [
      'sensor.nutdev1_battery_charge',
      'sensor.nutdev1_load',
      'sensor.nutdev1_status',
      'sensor.nutdev1_status_data',
      'sensor.nutdev1_input_voltage',
      'sensor.nutdev1_output_voltage',
      'sensor.nutdev1_battery_runtime',
    ]),
  ];

  const homeAssistant = createHomeAssistantCompatibilityState(
    entities,
    [
      { area_id: 'living-room', name: 'Living Room' },
      { area_id: 'kitchen', name: 'Kitchen' },
      { area_id: 'hallway', name: 'Hallway' },
      { area_id: 'outside', name: 'Outside' },
      { area_id: 'server-room', name: 'Server Room' },
    ],
    [
      { id: 'device-ups', area_id: 'server-room', name: 'Rack UPS' },
      { id: 'device-kitchen-light', area_id: 'kitchen', name: 'Kitchen Light' },
      {
        id: 'device-kitchen-island-light',
        area_id: 'kitchen',
        name: 'Kitchen Island Light',
      },
      { id: 'device-living-room-light', area_id: 'living-room', name: 'Living Room Light' },
      { id: 'device-hallway', area_id: 'hallway', name: 'Hallway Controls' },
    ],
    entities.map((entity) => ({
      entity_id: entity.externalId,
      device_id: typeof entity.attributes.deviceId === 'string' ? entity.attributes.deviceId : null,
      area_id: null,
    }))
  );

  return {
    id: 'default',
    entities,
    rooms,
    homeAssistant,
    taskRuntime: createTaskRuntimeSnapshot(),
  };
}

const DEFAULT_PREVIEW_SCENARIO = createPreviewScenario();

function clonePreviewScenario(scenario: PreviewRuntimeScenario): PreviewRuntimeScenario {
  return {
    ...scenario,
    entities: scenario.entities.map((entity) => ({
      ...entity,
      attributes: { ...entity.attributes },
      resources: entity.resources ? { ...entity.resources } : undefined,
    })),
    rooms: scenario.rooms.map((room) => ({ ...room, memberIds: [...room.memberIds] })),
    homeAssistant: {
      ...scenario.homeAssistant,
      entities: scenario.homeAssistant.entities
        ? Object.fromEntries(
            Object.entries(scenario.homeAssistant.entities).map(([entityId, entity]) => [
              entityId,
              { ...entity, attributes: { ...entity.attributes } },
            ])
          )
        : null,
      areas: scenario.homeAssistant.areas.map((area) => ({ ...area })),
      deviceRegistry: scenario.homeAssistant.deviceRegistry.map((device) => ({ ...device })),
      entityRegistry: scenario.homeAssistant.entityRegistry.map((entity) => ({ ...entity })),
    },
    taskRuntime: {
      entities: scenario.taskRuntime.entities
        ? Object.fromEntries(
            Object.entries(scenario.taskRuntime.entities).map(([entityId, entity]) => [
              entityId,
              { ...entity, attributes: { ...entity.attributes } },
            ])
          )
        : null,
      rooms: scenario.taskRuntime.rooms.map((room) => ({ ...room })),
      devices: scenario.taskRuntime.devices.map((device) => ({ ...device })),
      entityReferences: scenario.taskRuntime.entityReferences.map((reference) => ({
        ...reference,
      })),
    },
  };
}

export function getPreviewRuntimeScenario(name: 'default' | 'demo' = 'default') {
  if (name === 'demo') {
    const base = clonePreviewScenario(DEFAULT_PREVIEW_SCENARIO);
    const entities = enrichDemoEntities(base.entities);
    const roomNames = [
      ...new Set(
        entities.map((entity) => entity.room).filter((room): room is string => Boolean(room))
      ),
    ];
    return withPreviewEntities(
      {
        ...base,
        id: 'demo',
        rooms: roomNames.map((room) =>
          createPreviewRoom(
            room,
            entities.filter((entity) => entity.room === room).map((entity) => entity.externalId)
          )
        ),
        homeAssistant: {
          ...base.homeAssistant,
          areas: roomNames.map((room) => ({ area_id: slugify(room), name: room })),
          deviceRegistry: [
            ...new Map(
              entities
                .filter((entity) => typeof entity.attributes.deviceId === 'string')
                .map((entity) => [
                  entity.attributes.deviceId as string,
                  {
                    id: entity.attributes.deviceId as string,
                    area_id: entity.room ? slugify(entity.room) : null,
                    name:
                      base.homeAssistant.deviceRegistry.find(
                        (device) => device.id === entity.attributes.deviceId
                      )?.name ??
                      entities.find(
                        (candidate) => candidate.attributes.deviceId === entity.attributes.deviceId
                      )?.name ??
                      entity.name,
                  },
                ])
            ).values(),
          ],
          entityRegistry: entities.map((entity) => ({
            entity_id: entity.externalId,
            device_id:
              typeof entity.attributes.deviceId === 'string' ? entity.attributes.deviceId : null,
            area_id: entity.room ? slugify(entity.room) : null,
          })),
        },
      },
      entities
    );
  }

  return clonePreviewScenario(DEFAULT_PREVIEW_SCENARIO);
}

function getActiveScenario() {
  return previewRuntimeStore.getState().scenario;
}

export function getPreviewHomeAssistantCompatibilityState(): PreviewHomeAssistantCompatibilityState | null {
  return getActiveScenario()?.homeAssistant ?? null;
}

export function subscribePreviewHomeAssistantCompatibilityState(listener: () => void) {
  return previewRuntimeStore.subscribe((state, previousState) => {
    if (state.scenario?.homeAssistant !== previousState.scenario?.homeAssistant) {
      listener();
    }
  });
}

function getPreviewProviderState(): NavetProviderState {
  const scenario = getActiveScenario() ?? DEFAULT_PREVIEW_SCENARIO;

  return {
    providerId: PREVIEW_PROVIDER_ID,
    connected: true,
    connecting: false,
    reconnecting: false,
    entitiesHydrated: true,
    registriesHydrated: true,
    error: null,
    entities: scenario.entities,
    rooms: scenario.rooms,
  };
}

function updateScenario(mutator: (scenario: PreviewRuntimeScenario) => PreviewRuntimeScenario) {
  const currentScenario = getActiveScenario();
  if (!currentScenario) {
    return;
  }

  const nextScenario = mutator(currentScenario);
  previewRuntimeStore.setState({ scenario: nextScenario });

  integrationStore.getState().applyPreviewProviderState(PREVIEW_PROVIDER_ID, {
    homeAssistantState: nextScenario.homeAssistant,
    currentProviderId: PREVIEW_PROVIDER_ID,
    selectedProviderIds: [PREVIEW_PROVIDER_ID],
  });
}

function updatePreviewEntity(entityId: string, updater: (entity: NavetEntity) => NavetEntity) {
  updateScenario((scenario) => {
    const nextEntities = scenario.entities.map((entity) =>
      entity.externalId === entityId ? updater(entity) : entity
    );
    const nextHomeAssistant = createHomeAssistantCompatibilityState(
      nextEntities,
      scenario.homeAssistant.areas as Array<{ area_id: string; name: string }>,
      scenario.homeAssistant.deviceRegistry as Array<{
        id: string;
        area_id: string | null;
        name?: string | null;
      }>,
      scenario.homeAssistant.entityRegistry as Array<{
        entity_id: string;
        device_id: string | null;
        area_id?: string | null;
      }>
    );

    return {
      ...scenario,
      entities: nextEntities,
      homeAssistant: nextHomeAssistant,
    };
  });
}

function updateTaskRuntime(
  mutator: (taskRuntime: PlatformTaskRuntimeSnapshot) => PlatformTaskRuntimeSnapshot
) {
  updateScenario((scenario) => ({
    ...scenario,
    taskRuntime: mutator(scenario.taskRuntime),
  }));
}

async function executePreviewCommand(entity: NavetEntity, command: NavetCommand) {
  updatePreviewEntity(entity.externalId, (currentEntity) =>
    applyPreviewCommandToEntity(currentEntity, command)
  );
}

const previewLightFeatureService: ProviderLightFeatureService = {
  updateLight: async (entityId, options) => {
    updatePreviewEntity(entityId, (entity) => ({
      ...entity,
      primaryState: options.state ?? entity.primaryState,
      attributes: {
        ...entity.attributes,
        value: options.state ?? entity.attributes.value,
        brightnessPct:
          typeof options.brightnessPct === 'number'
            ? options.brightnessPct
            : entity.attributes.brightnessPct,
        colorTemperatureKelvin:
          typeof options.kelvin === 'number'
            ? options.kelvin
            : entity.attributes.colorTemperatureKelvin,
        effect: typeof options.effect === 'string' ? options.effect : entity.attributes.effect,
      },
    }));
  },
};

const previewClimateFeatureService: ProviderClimateFeatureService = {
  setTargetTemperature: async (entityId, update) => {
    updatePreviewEntity(entityId, (entity) => ({
      ...entity,
      attributes: {
        ...entity.attributes,
        ...(typeof update.temperature === 'number' ? { temperature: update.temperature } : {}),
        ...(typeof update.targetTemperatureLow === 'number'
          ? { targetTemperatureLow: update.targetTemperatureLow }
          : {}),
        ...(typeof update.targetTemperatureHigh === 'number'
          ? { targetTemperatureHigh: update.targetTemperatureHigh }
          : {}),
      },
    }));
  },
};

const PREVIEW_MEDIA_LIBRARY: PlatformMediaBrowseResult = {
  title: 'Media Library',
  mediaClass: 'directory',
  children: [
    {
      title: 'Playlists',
      mediaClass: 'directory',
      mediaContentId: 'preview:playlists',
      mediaContentType: 'playlist',
      canExpand: true,
      canPlay: false,
    },
    {
      title: 'Artists',
      mediaClass: 'directory',
      mediaContentId: 'preview:artists',
      mediaContentType: 'artist',
      canExpand: true,
      canPlay: false,
    },
    {
      title: 'Albums',
      mediaClass: 'directory',
      mediaContentId: 'preview:albums',
      mediaContentType: 'album',
      canExpand: true,
      canPlay: false,
    },
    {
      title: 'Liked songs',
      mediaClass: 'directory',
      mediaContentId: 'preview:liked-songs',
      mediaContentType: 'track',
      canExpand: true,
      canPlay: false,
    },
    {
      title: 'Podcasts',
      mediaClass: 'directory',
      mediaContentId: 'preview:podcasts',
      mediaContentType: 'podcast',
      canExpand: true,
      canPlay: false,
    },
    {
      title: 'Recently played',
      mediaClass: 'directory',
      mediaContentId: 'preview:recently-played',
      mediaContentType: 'track',
      canExpand: true,
      canPlay: false,
    },
    {
      title: 'Top artists',
      mediaClass: 'directory',
      mediaContentId: 'preview:top-artists',
      mediaContentType: 'artist',
      canExpand: true,
      canPlay: false,
    },
    {
      title: 'Top tracks',
      mediaClass: 'directory',
      mediaContentId: 'preview:top-tracks',
      mediaContentType: 'track',
      canExpand: true,
      canPlay: false,
    },
  ],
};

function createPreviewMediaItems({
  count,
  mediaClass,
  prefix,
}: {
  count: number;
  mediaClass: string;
  prefix: string;
}) {
  return Array.from({ length: count }, (_, index) => ({
    title: `${prefix} ${index + 1}`,
    mediaClass,
    mediaContentId: `preview:${mediaClass}:${prefix.toLowerCase().replaceAll(' ', '-')}:${index + 1}`,
    mediaContentType: mediaClass,
    canExpand: false,
    canPlay: true,
  }));
}

const PREVIEW_RECENT_TRACKS = [
  {
    title: 'Olalla',
    artist: 'Blanco White',
    album: 'On the Other Side',
    mediaClass: 'track',
    mediaContentId: 'preview:track:olalla',
    mediaContentType: 'track',
    canExpand: false,
    canPlay: true,
  },
  {
    title: 'Above the Clouds of Pompeii',
    artist: "Bear's Den",
    album: 'Islands',
    mediaClass: 'track',
    mediaContentId: 'preview:track:pompeii',
    mediaContentType: 'track',
    canExpand: false,
    canPlay: true,
  },
  {
    title: 'Bed Head',
    artist: 'Manchester Orchestra',
    album: 'The Million Masks of God',
    mediaClass: 'track',
    mediaContentId: 'preview:track:bed-head',
    mediaContentType: 'track',
    canExpand: false,
    canPlay: true,
  },
  ...createPreviewMediaItems({ count: 45, mediaClass: 'track', prefix: 'Recently played' }),
];

const PREVIEW_RECENT_MEDIA: PlatformMediaBrowseResult = {
  title: 'Recently played',
  mediaClass: 'directory',
  mediaContentId: 'preview:recently-played',
  mediaContentType: 'track',
  children: PREVIEW_RECENT_TRACKS,
};

const PREVIEW_MEDIA_BROWSE_RESULTS: Record<string, PlatformMediaBrowseResult> = {
  'preview:playlists': {
    title: 'Playlists',
    mediaClass: 'directory',
    children: [],
  },
  'preview:artists': {
    title: 'Artists',
    mediaClass: 'directory',
    children: createPreviewMediaItems({ count: 3, mediaClass: 'artist', prefix: 'Artist' }),
  },
  'preview:albums': {
    title: 'Albums',
    mediaClass: 'directory',
    children: [],
  },
  'preview:liked-songs': {
    title: 'Liked songs',
    mediaClass: 'directory',
    children: PREVIEW_RECENT_TRACKS.slice(0, 1),
  },
  'preview:podcasts': {
    title: 'Podcasts',
    mediaClass: 'directory',
    children: [],
  },
  'preview:recently-played': PREVIEW_RECENT_MEDIA,
  'preview:top-artists': {
    title: 'Top artists',
    mediaClass: 'directory',
    children: createPreviewMediaItems({ count: 2, mediaClass: 'artist', prefix: 'Top artist' }),
  },
  'preview:top-tracks': {
    title: 'Top tracks',
    mediaClass: 'directory',
    children: PREVIEW_RECENT_TRACKS,
  },
};

function getPreviewMediaBrowseResult(mediaContentId?: string): PlatformMediaBrowseResult {
  if (!mediaContentId) {
    return PREVIEW_MEDIA_LIBRARY;
  }

  return PREVIEW_MEDIA_BROWSE_RESULTS[mediaContentId] ?? PREVIEW_MEDIA_LIBRARY;
}

const previewMediaFeatureService: ProviderMediaFeatureService = {
  playMedia: async () => undefined,
  browseMediaPlayer: async (_entityId, media) => getPreviewMediaBrowseResult(media?.mediaContentId),
  searchMediaPlayer: async (_entityId, query) => ({
    title: `Search: ${query}`,
    mediaClass: 'directory',
    children: PREVIEW_RECENT_MEDIA.children?.filter((item) =>
      `${item.title} ${item.artist ?? ''} ${item.album ?? ''}`
        .toLowerCase()
        .includes(query.toLowerCase())
    ),
  }),
  selectMediaPlayerSource: async () => undefined,
  selectMediaPlayerSoundMode: async () => undefined,
  seekMediaPlayer: async () => undefined,
  clearMediaPlayerPlaylist: async () => undefined,
  updateMediaPlayerPower: async () => undefined,
  sendRemoteCommand: async () => undefined,
  browseMediaSource: async (mediaContentId) => getPreviewMediaBrowseResult(mediaContentId),
  resolveMediaSource: async (mediaContentId) => ({ url: mediaContentId }),
  fetchMediaThumbnailDataUrl: async () => null,
};

const previewSecurityFeatureService: ProviderSecurityFeatureService = {
  lockEntity: async (entityId) =>
    updatePreviewEntity(entityId, (entity) =>
      applyPreviewCommandToEntity(entity, { type: 'lock', entityId: entity.id })
    ),
  unlockEntity: async (entityId) =>
    updatePreviewEntity(entityId, (entity) =>
      applyPreviewCommandToEntity(entity, { type: 'unlock', entityId: entity.id })
    ),
  armHome: async (entityId, code) =>
    updatePreviewEntity(entityId, (entity) => ({
      ...entity,
      primaryState: 'armed_home',
      attributes: { ...entity.attributes, value: 'armed_home', code },
    })),
  armAway: async (entityId, code) =>
    updatePreviewEntity(entityId, (entity) => ({
      ...entity,
      primaryState: 'armed_away',
      attributes: { ...entity.attributes, value: 'armed_away', code },
    })),
  armNight: async (entityId, code) =>
    updatePreviewEntity(entityId, (entity) => ({
      ...entity,
      primaryState: 'armed_night',
      attributes: { ...entity.attributes, value: 'armed_night', code },
    })),
  armVacation: async (entityId, code) =>
    updatePreviewEntity(entityId, (entity) => ({
      ...entity,
      primaryState: 'armed_vacation',
      attributes: { ...entity.attributes, value: 'armed_vacation', code },
    })),
  armCustomBypass: async (entityId, code) =>
    updatePreviewEntity(entityId, (entity) => ({
      ...entity,
      primaryState: 'armed_custom_bypass',
      attributes: { ...entity.attributes, value: 'armed_custom_bypass', code },
    })),
  disarm: async (entityId, code) =>
    updatePreviewEntity(entityId, (entity) => ({
      ...entity,
      primaryState: 'disarmed',
      attributes: { ...entity.attributes, value: 'disarmed', code },
    })),
  trigger: async (entityId, code) =>
    updatePreviewEntity(entityId, (entity) => ({
      ...entity,
      primaryState: 'triggered',
      attributes: { ...entity.attributes, value: 'triggered', code },
    })),
  openCover: async (entityId) =>
    updatePreviewEntity(entityId, (entity) => ({
      ...entity,
      primaryState: 'open',
      attributes: { ...entity.attributes, value: 'open', position: 100 },
    })),
  closeCover: async (entityId) =>
    updatePreviewEntity(entityId, (entity) => ({
      ...entity,
      primaryState: 'closed',
      attributes: { ...entity.attributes, value: 'closed', position: 0 },
    })),
  stopCover: async (_entityId) => undefined,
  setCoverPosition: async (entityId, position) =>
    updatePreviewEntity(entityId, (entity) => ({
      ...entity,
      primaryState: position >= 100 ? 'open' : position <= 0 ? 'closed' : 'open',
      attributes: {
        ...entity.attributes,
        value: position >= 100 ? 'open' : position <= 0 ? 'closed' : 'open',
        position,
      },
    })),
};

function createPreviewSecurityHistory({
  entityIds,
  startTime,
  endTime,
}: PlatformEntityHistoriesRequest): PlatformEntityHistorySeries[] {
  const parsedEndTime = endTime ? Date.parse(endTime) : Number.NaN;
  const endTimeMs = Number.isFinite(parsedEndTime) ? parsedEndTime : Date.now();
  const parsedStartTime = Date.parse(startTime);
  const startTimeMs = Number.isFinite(parsedStartTime)
    ? parsedStartTime
    : endTimeMs - 24 * 60 * 60 * 1000;

  return entityIds.map((entityId) => ({
    entityId,
    points: (PREVIEW_SECURITY_HISTORY[entityId] ?? [])
      .map(({ minutesAgo, state }) => ({
        state,
        changedAt: new Date(endTimeMs - minutesAgo * 60 * 1000).toISOString(),
      }))
      .filter(({ changedAt }) => {
        const changedAtMs = Date.parse(changedAt);
        return changedAtMs >= startTimeMs && changedAtMs <= endTimeMs;
      }),
  }));
}

const previewHistoryFeatureService: ProviderHistoryFeatureService = {
  getMessageClient: () => null,
  getEntityHistories: async (request) => createPreviewSecurityHistory(request),
};

const previewTaskFeatureService: ProviderTaskFeatureService = {
  getTaskRuntimeSnapshot: () => getActiveScenario()?.taskRuntime ?? createTaskRuntimeSnapshot(),
  subscribeTaskRuntimeSnapshot: (listener) =>
    previewRuntimeStore.subscribe((state, previousState) => {
      if (state.scenario?.taskRuntime !== previousState.scenario?.taskRuntime) {
        listener();
      }
    }),
  getAutomationDetails: async (entityId) => {
    const automation = getActiveScenario()?.taskRuntime.entities?.[entityId];
    return {
      config: automation?.attributes ?? {},
    } satisfies PlatformAutomationDetails;
  },
  triggerAutomation: async (entityId) => {
    updateTaskRuntime((taskRuntime) => ({
      ...taskRuntime,
      entities: taskRuntime.entities
        ? {
            ...taskRuntime.entities,
            [entityId]: {
              ...(taskRuntime.entities[entityId] ?? {
                entityId,
                state: 'on',
                attributes: {},
              }),
              attributes: {
                ...(taskRuntime.entities[entityId]?.attributes ?? {}),
                last_triggered: new Date().toISOString(),
              },
            },
          }
        : taskRuntime.entities,
    }));
  },
};

const previewNotificationFeatureService: ProviderNotificationFeatureService = {
  getSnapshot: async () => ({ persistentNotifications: [], repairIssues: [] }),
  subscribePersistentNotifications: async () => () => undefined,
  dismissPersistentNotification: async () => undefined,
  installUpdate: async () => undefined,
  restartSystem: async () => undefined,
  getDeliveryTargets: async () => [
    { id: 'mobile_app_alex_iphone', label: "Alex's iPhone" },
    { id: 'mobile_app_kitchen_tablet', label: 'Kitchen tablet' },
  ],
  sendNotification: async () => undefined,
};

const previewContract: NavetProviderContract = {
  providerId: PREVIEW_PROVIDER_ID,
  bootstrapSession: () => ({
    providerId: PREVIEW_PROVIDER_ID,
    connected: true,
    runtime: 'preview',
    authMode: 'preview',
  }),
  initializeSession: async () => undefined,
  attachRuntimeBridge: () => undefined,
  teardownSession: () => undefined,
  getState: () => getPreviewProviderState(),
  subscribeState: (listener) =>
    previewRuntimeStore.subscribe((state, previousState) => {
      if (
        state.scenario?.entities !== previousState.scenario?.entities ||
        state.scenario?.rooms !== previousState.scenario?.rooms
      ) {
        listener();
      }
    }),
};

const previewProviderPackageRegistration: ProviderPackageRegistration = {
  contract: previewContract,
  providerContractAdapter: createSnapshotBackedProviderAdapter({
    providerId: PREVIEW_PROVIDER_ID,
    providerLabel: 'Preview',
    contract: previewContract,
    executeCommand: executePreviewCommand,
    getSession: () => ({
      providerId: PREVIEW_PROVIDER_ID,
      runtime: 'preview',
      authMode: 'preview',
    }),
  }),
  runtimeRegistration: {
    contract: previewContract,
    providerContractAdapter: createSnapshotBackedProviderAdapter({
      providerId: PREVIEW_PROVIDER_ID,
      providerLabel: 'Preview',
      contract: previewContract,
      executeCommand: executePreviewCommand,
      getSession: () => ({
        providerId: PREVIEW_PROVIDER_ID,
        runtime: 'preview',
        authMode: 'preview',
      }),
    }),
    implementationStatus: 'implemented',
    capabilities: {
      pathSigning: false,
      cameraStreams: false,
    },
    featureMatrix: {
      rooms: true,
      lighting: true,
      sensors: true,
      climate: true,
      mediaControls: true,
      mediaBrowse: true,
      mediaArtwork: true,
      cameraSnapshot: true,
      cameraStreams: false,
      energyNow: true,
      calendar: true,
      weather: true,
      notifications: true,
      tasks: true,
      conversation: false,
    },
    lightFeatureService: previewLightFeatureService,
    climateFeatureService: previewClimateFeatureService,
    mediaFeatureService: previewMediaFeatureService,
    securityFeatureService: previewSecurityFeatureService,
    historyFeatureService: previewHistoryFeatureService,
    notificationFeatureService: previewNotificationFeatureService,
    taskFeatureService: previewTaskFeatureService,
    entityRuntimeService: createPreviewEntityRuntimeService({
      defaultConfig: PREVIEW_HOME_ASSISTANT_CONFIG,
      getActiveScenario,
      getProviderEntities: () => getPreviewProviderState().entities,
      store: previewRuntimeStore,
      timestamp: PREVIEW_TIMESTAMP,
    }),
  },
};

function applyPreviewRuntimeScenario(scenario: PreviewRuntimeScenario) {
  resetPreviewEntityRuntimeCaches();
  previewRuntimeStore.setState({ scenario });
  setProviderPackageRegistrationOverride(PREVIEW_PROVIDER_ID, previewProviderPackageRegistration);
  resetProviderRuntimeRegistrationCache();
  integrationStore.getState().applyPreviewProviderState(PREVIEW_PROVIDER_ID, {
    homeAssistantState: scenario.homeAssistant,
    currentProviderId: PREVIEW_PROVIDER_ID,
    selectedProviderIds: [PREVIEW_PROVIDER_ID],
  });
}

export function installPreviewRuntime(scenario: PreviewRuntimeScenario) {
  applyPreviewRuntimeScenario(clonePreviewScenario(scenario));
  setInstalledPreviewCommandHandler(async (command) => {
    const entity = getActiveScenario()?.entities.find(
      (entry) =>
        entry.id === command.entityId ||
        entry.canonicalId === command.entityId ||
        entry.externalId === command.entityId
    );
    if (
      !entity ||
      ![
        'turn_on',
        'turn_off',
        'set_brightness',
        'set_color_temperature',
        'set_fan_speed',
        'set_temperature',
        'set_climate_mode',
        'set_position',
        'open',
        'close',
        'stop',
        'lock',
        'unlock',
        'set_number_value',
        'select_option',
        'set_text_value',
        'set_datetime_value',
        'press',
        'set_climate_preset',
        'set_climate_fan_mode',
        'set_climate_swing_mode',
        'set_climate_swing_horizontal_mode',
        'set_climate_humidity',
      ].includes(command.type)
    )
      return null;
    return previewProviderPackageRegistration.providerContractAdapter.execute(command);
  });
  setInstalledPreviewServiceHandler((entityId, { domain, service, serviceData }) => {
    const entity = getActiveScenario()?.entities.find(
      (entry) => entry.externalId === entityId || entry.canonicalId === entityId
    );
    if (!entity || domain !== 'fan') return false;
    const patch =
      service === 'set_direction' &&
      (serviceData?.direction === 'forward' || serviceData?.direction === 'reverse')
        ? { direction: serviceData.direction }
        : service === 'oscillate' && typeof serviceData?.oscillating === 'boolean'
          ? { oscillating: serviceData.oscillating }
          : null;
    if (!patch) return false;
    updatePreviewEntity(entity.externalId, (current) => ({
      ...current,
      attributes: { ...current.attributes, ...patch },
    }));
    return true;
  });
}

export function getInstalledPreviewRuntimeScenario() {
  return getActiveScenario();
}

export function resetPreviewRuntime() {
  setInstalledPreviewServiceHandler(null);
  setInstalledPreviewCommandHandler(null);
  resetPreviewEntityRuntimeCaches();
  previewRuntimeStore.setState({ scenario: null });
  setProviderPackageRegistrationOverride(PREVIEW_PROVIDER_ID, null);
  resetProviderRuntimeRegistrationCache();
}

export function createPreviewStoryScenario(
  configure?: (scenario: PreviewRuntimeScenario) => PreviewRuntimeScenario
) {
  const scenario = getPreviewRuntimeScenario('default');
  return configure ? configure(scenario) : scenario;
}

export function replacePreviewEntity(
  scenario: PreviewRuntimeScenario,
  nextEntity: NavetEntity
): PreviewRuntimeScenario {
  const nextEntities = scenario.entities.map((entity) =>
    entity.externalId === nextEntity.externalId ? nextEntity : entity
  );

  return withPreviewEntities(scenario, nextEntities);
}

export function withPreviewEntities(
  scenario: PreviewRuntimeScenario,
  nextEntities: NavetEntity[]
): PreviewRuntimeScenario {
  return {
    ...scenario,
    entities: nextEntities,
    homeAssistant: createHomeAssistantCompatibilityState(
      nextEntities,
      scenario.homeAssistant.areas as Array<{ area_id: string; name: string }>,
      scenario.homeAssistant.deviceRegistry as Array<{
        id: string;
        area_id: string | null;
        name?: string | null;
      }>,
      scenario.homeAssistant.entityRegistry as Array<{
        entity_id: string;
        device_id: string | null;
        area_id?: string | null;
      }>
    ),
  };
}

export function createPreviewLightEntity(
  externalId: string,
  overrides: Partial<NavetEntity['attributes']> = {}
) {
  return createPreviewEntity(
    'light',
    externalId,
    'Living Room',
    'on',
    {
      value: 'on',
      brightnessPct: 64,
      colorTemperatureKelvin: 3900,
      supportedColorModes: ['brightness', 'color_temp'],
      colorMode: 'color_temp',
      effect: 'None',
      effectList: ['None', 'Rainbow', 'Fire', 'Twinkle'],
      room: 'Living Room',
      deviceId: 'device-living-room-light',
      ...overrides,
    },
    { room: 'Living Room' }
  );
}

export function getPreviewDeviceCollection(
  scenario: PreviewRuntimeScenario = getPreviewRuntimeScenario('default')
) {
  return mapNavetEntitiesToDeviceCollection(scenario.entities);
}

export function readPreviewCommandResult(): CommandResult {
  return {
    accepted: true,
    requiresEventConfirmation: true,
  };
}
