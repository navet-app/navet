import {
  createEmptyDeviceCollection,
  mapNavetEntitiesToDeviceCollection,
} from '@navet/app/core/navet-device-collections';
import { useRoomWorkspaceStore } from '@navet/app/features/dashboard/rooms/room-workspace-store';
import {
  buildRoomWorkspaceIndexV2,
  type RoomWorkspaceV2,
} from '@navet/app/features/dashboard/rooms/room-workspace-v2';
import { normalizeRoomName } from '@navet/app/utils/room-name';
import type { NavetProviderRoom } from '@navet/core/types';
import { useCallback, useMemo } from 'react';
import { useEntityRoomOverridesStore } from '../stores/entity-room-overrides-store';
import type { IntegrationStore } from '../stores/integration-store';
import { integrationSelectors } from '../stores/selectors';
import type { Device, DeviceCollection, SensorDevice } from '../types/device.types';
import type { IntegrationProviderId } from '../types/provider';
import { getAllRooms } from '../utils/device-location';
import { createProviderScopedId } from '../utils/provider-ids';
import { areArraysEqual } from '../utils/structural-equality';
import { useIntegrationStore } from './use-integration-store';
import { useProviderCalendarDevicesCollection } from './use-provider-calendar-devices';
import { useProviderWeatherDevicesCollection } from './use-provider-weather-devices';

const EMPTY_SELECTED_PROVIDER_IDS: IntegrationProviderId[] = [];
const EMPTY_DEVICE_COLLECTION = Object.freeze(mapNavetEntitiesToDeviceCollection([]));
const EMPTY_DEVICE_COLLECTIONS: DeviceCollection[] = [];
const EMPTY_DEVICE_GROUP_SLICES: ReadonlyArray<readonly unknown[]> = [];
const EMPTY_SENSOR_ENTITY_IDS: string[] = [];
const EMPTY_NORMALIZED_ROOMS_BY_CANONICAL_ID: Record<string, NavetProviderRoom> = {};
const EMPTY_ROOM_IDS_BY_ENTITY_ID: Record<string, string> = {};

export const DEVICE_COLLECTION_KEYS = [
  'lights',
  'fans',
  'climate',
  'hvac',
  'media',
  'weather',
  'switches',
  'helpers',
  'timers',
  'counters',
  'valves',
  'remotes',
  'covers',
  'locks',
  'scenes',
  'persons',
  'sensors',
  'vacuums',
  'calendars',
  'cameras',
  'grouped-sensors',
] as const;

export type DeviceCollectionKey = (typeof DEVICE_COLLECTION_KEYS)[number];

interface UseDevicesOptions {
  enabled?: boolean;
  includeFeatureCollections?: boolean;
  deviceFilter?: (device: Device, key: DeviceCollectionKey) => boolean;
}

interface RoomPlacementLookup {
  roomNamesById: Record<string, string>;
  workspaceRoomIdsBySourceCanonicalId: Record<string, string>;
}

function buildRoomPlacementLookup(
  normalizedRoomsByCanonicalId: Record<string, NavetProviderRoom>,
  workspace: RoomWorkspaceV2 | null
): RoomPlacementLookup {
  const roomNamesById: Record<string, string> = {};
  const workspaceRoomIdsBySourceCanonicalId: Record<string, string> = {};
  const displayNamesByNormalizedName = new Map<string, string>();

  Object.values(normalizedRoomsByCanonicalId).forEach((room) => {
    // Match the display name chosen by useAggregatedRooms for shared provider rooms.
    // Otherwise differently capitalized source labels produce invisible room card orders.
    const roomKey = normalizeRoomName(room.name);
    const displayName = displayNamesByNormalizedName.get(roomKey) ?? room.name;
    displayNamesByNormalizedName.set(roomKey, displayName);
    roomNamesById[roomKey] = displayName;
    roomNamesById[room.canonicalId] = displayName;
    roomNamesById[room.id] = displayName;
    roomNamesById[room.normalizedName] = displayName;
    roomNamesById[room.externalId] = displayName;
    roomNamesById[createProviderScopedId(room.providerId, room.externalId)] = displayName;
  });

  if (workspace) {
    const workspaceIndex = buildRoomWorkspaceIndexV2(workspace);
    for (const room of workspace.rooms) {
      roomNamesById[room.id] = room.displayName;
    }
    workspaceIndex.roomIdBySourceCanonicalId.forEach((roomId, sourceCanonicalId) => {
      workspaceRoomIdsBySourceCanonicalId[sourceCanonicalId] = roomId;
    });
  }

  return { roomNamesById, workspaceRoomIdsBySourceCanonicalId };
}

function useRoomPlacementLookup(enabled: boolean) {
  const normalizedRoomsByCanonicalId = useIntegrationStore((state) =>
    enabled
      ? integrationSelectors.normalizedRoomsByCanonicalId(state)
      : EMPTY_NORMALIZED_ROOMS_BY_CANONICAL_ID
  );
  const roomWorkspace = useRoomWorkspaceStore((state) => (enabled ? state.workspace : null));
  const roomIdsByEntityId = useEntityRoomOverridesStore((state) =>
    enabled ? state.roomIdsByEntityId : EMPTY_ROOM_IDS_BY_ENTITY_ID
  );
  const roomPlacementLookup = useMemo(
    () => buildRoomPlacementLookup(normalizedRoomsByCanonicalId, roomWorkspace),
    [normalizedRoomsByCanonicalId, roomWorkspace]
  );

  return { roomIdsByEntityId, roomPlacementLookup };
}

function getRoomOverrideIdForDevice(
  device: {
    id: string;
    canonicalId?: string;
    nativeId?: string;
    providerId?: IntegrationProviderId;
  },
  roomIdsByEntityId: Record<string, string>
) {
  const directRoomId = roomIdsByEntityId[device.id];
  if (directRoomId) {
    return directRoomId;
  }

  if (typeof device.canonicalId === 'string' && device.canonicalId.length > 0) {
    const canonicalRoomId = roomIdsByEntityId[device.canonicalId];
    if (canonicalRoomId) {
      return canonicalRoomId;
    }
  }

  if (
    typeof device.nativeId === 'string' &&
    device.nativeId.length > 0 &&
    typeof device.providerId === 'string'
  ) {
    return roomIdsByEntityId[createProviderScopedId(device.providerId, device.nativeId)];
  }

  return undefined;
}

function applyRoomOverridesToDevices<
  T extends {
    id: string;
    room: string;
    roomId?: string;
    canonicalId?: string;
    nativeId?: string;
    providerId?: IntegrationProviderId;
  },
>(
  devices: T[],
  roomIdsByEntityId: Record<string, string>,
  roomPlacementLookup: RoomPlacementLookup
): T[] {
  let nextDevices: T[] | null = null;

  devices.forEach((device, index) => {
    const overrideRoomId = getRoomOverrideIdForDevice(device, roomIdsByEntityId);
    const requestedRoomId = overrideRoomId ?? device.roomId;
    const roomId = requestedRoomId
      ? (roomPlacementLookup.workspaceRoomIdsBySourceCanonicalId[requestedRoomId] ??
        requestedRoomId)
      : undefined;
    const roomName =
      (roomId ? roomPlacementLookup.roomNamesById[roomId] : undefined) ??
      (!overrideRoomId
        ? roomPlacementLookup.roomNamesById[normalizeRoomName(device.room)]
        : undefined);
    if (!roomName || (roomName === device.room && roomId === device.roomId)) {
      return;
    }

    if (!nextDevices) {
      nextDevices = [...devices];
    }

    nextDevices[index] = { ...device, room: roomName, roomId };
  });

  return nextDevices ?? devices;
}

function applyRoomOverrides(
  collection: DeviceCollection,
  roomIdsByEntityId: Record<string, string>,
  roomPlacementLookup: RoomPlacementLookup
): DeviceCollection {
  if (
    Object.keys(roomIdsByEntityId).length === 0 &&
    Object.keys(roomPlacementLookup.roomNamesById).length === 0
  ) {
    return collection;
  }

  const lights = applyRoomOverridesToDevices(
    collection.lights,
    roomIdsByEntityId,
    roomPlacementLookup
  );
  const fans = applyRoomOverridesToDevices(collection.fans, roomIdsByEntityId, roomPlacementLookup);
  const climate = applyRoomOverridesToDevices(
    collection.climate,
    roomIdsByEntityId,
    roomPlacementLookup
  );
  const legacyClimateDevices = applyRoomOverridesToDevices(
    collection.hvac,
    roomIdsByEntityId,
    roomPlacementLookup
  );
  const media = applyRoomOverridesToDevices(
    collection.media,
    roomIdsByEntityId,
    roomPlacementLookup
  );
  const weather = applyRoomOverridesToDevices(
    collection.weather,
    roomIdsByEntityId,
    roomPlacementLookup
  );
  const switches = applyRoomOverridesToDevices(
    collection.switches,
    roomIdsByEntityId,
    roomPlacementLookup
  );
  const helpers = applyRoomOverridesToDevices(
    collection.helpers,
    roomIdsByEntityId,
    roomPlacementLookup
  );
  const timers = applyRoomOverridesToDevices(
    collection.timers,
    roomIdsByEntityId,
    roomPlacementLookup
  );
  const counters = applyRoomOverridesToDevices(
    collection.counters,
    roomIdsByEntityId,
    roomPlacementLookup
  );
  const valves = applyRoomOverridesToDevices(
    collection.valves,
    roomIdsByEntityId,
    roomPlacementLookup
  );
  const remotes = applyRoomOverridesToDevices(
    collection.remotes,
    roomIdsByEntityId,
    roomPlacementLookup
  );
  const covers = applyRoomOverridesToDevices(
    collection.covers,
    roomIdsByEntityId,
    roomPlacementLookup
  );
  const locks = applyRoomOverridesToDevices(
    collection.locks,
    roomIdsByEntityId,
    roomPlacementLookup
  );
  const scenes = applyRoomOverridesToDevices(
    collection.scenes,
    roomIdsByEntityId,
    roomPlacementLookup
  );
  const persons = applyRoomOverridesToDevices(
    collection.persons,
    roomIdsByEntityId,
    roomPlacementLookup
  );
  const sensors = applyRoomOverridesToDevices(
    collection.sensors,
    roomIdsByEntityId,
    roomPlacementLookup
  );
  const vacuums = applyRoomOverridesToDevices(
    collection.vacuums,
    roomIdsByEntityId,
    roomPlacementLookup
  );
  const calendars = applyRoomOverridesToDevices(
    collection.calendars,
    roomIdsByEntityId,
    roomPlacementLookup
  );
  const cameras = applyRoomOverridesToDevices(
    collection.cameras,
    roomIdsByEntityId,
    roomPlacementLookup
  );
  const groupedSensors = applyRoomOverridesToDevices(
    collection['grouped-sensors'],
    roomIdsByEntityId,
    roomPlacementLookup
  );

  const unchanged =
    lights === collection.lights &&
    fans === collection.fans &&
    climate === collection.climate &&
    legacyClimateDevices === collection.hvac &&
    media === collection.media &&
    weather === collection.weather &&
    switches === collection.switches &&
    helpers === collection.helpers &&
    timers === collection.timers &&
    counters === collection.counters &&
    valves === collection.valves &&
    remotes === collection.remotes &&
    covers === collection.covers &&
    locks === collection.locks &&
    scenes === collection.scenes &&
    persons === collection.persons &&
    sensors === collection.sensors &&
    vacuums === collection.vacuums &&
    calendars === collection.calendars &&
    cameras === collection.cameras &&
    groupedSensors === collection['grouped-sensors'];

  if (unchanged) {
    return collection;
  }

  return {
    ...collection,
    lights,
    fans,
    climate,
    hvac: legacyClimateDevices,
    media,
    weather,
    switches,
    helpers,
    timers,
    counters,
    valves,
    remotes,
    covers,
    locks,
    scenes,
    persons,
    sensors,
    vacuums,
    calendars,
    cameras,
    'grouped-sensors': groupedSensors,
  };
}

function useSelectedProviderFeatureCollections({
  selectedProviderIds,
  enabled,
  includeCalendars,
  includeWeather,
}: {
  selectedProviderIds: readonly IntegrationProviderId[];
  enabled: boolean;
  includeCalendars: boolean;
  includeWeather: boolean;
}) {
  const selectedProviderIdSet = useMemo(() => new Set(selectedProviderIds), [selectedProviderIds]);

  const homeAssistantCalendars = useProviderCalendarDevicesCollection('home_assistant', {
    enabled: enabled && includeCalendars && selectedProviderIdSet.has('home_assistant'),
  });
  const homeyCalendars = useProviderCalendarDevicesCollection('homey', {
    enabled: enabled && includeCalendars && selectedProviderIdSet.has('homey'),
  });
  const openhabCalendars = useProviderCalendarDevicesCollection('openhab', {
    enabled: enabled && includeCalendars && selectedProviderIdSet.has('openhab'),
  });
  const homeAssistantWeather = useProviderWeatherDevicesCollection('home_assistant', {
    enabled: enabled && includeWeather && selectedProviderIdSet.has('home_assistant'),
  });
  const homeyWeather = useProviderWeatherDevicesCollection('homey', {
    enabled: enabled && includeWeather && selectedProviderIdSet.has('homey'),
  });
  const openhabWeather = useProviderWeatherDevicesCollection('openhab', {
    enabled: enabled && includeWeather && selectedProviderIdSet.has('openhab'),
  });
  const calendars = useMemo(
    () => [...homeAssistantCalendars, ...homeyCalendars, ...openhabCalendars],
    [homeAssistantCalendars, homeyCalendars, openhabCalendars]
  );
  const weather = useMemo(
    () => [...homeAssistantWeather, ...homeyWeather, ...openhabWeather],
    [homeAssistantWeather, homeyWeather, openhabWeather]
  );

  return { calendars, weather };
}

function assignDeviceCollectionKey<K extends DeviceCollectionKey>(
  collection: DeviceCollection,
  key: K,
  value: DeviceCollection[K]
) {
  collection[key] = value;
}

function buildDeviceCollectionForKeys(
  keys: readonly DeviceCollectionKey[],
  collections: readonly DeviceCollection[]
): DeviceCollection {
  const nextCollection = createEmptyDeviceCollection();

  for (const key of keys) {
    const nonEmptySlices = collections
      .map((collection) => collection[key])
      .filter((slice) => slice.length > 0);

    if (nonEmptySlices.length === 0) {
      continue;
    }

    if (nonEmptySlices.length === 1) {
      assignDeviceCollectionKey(nextCollection, key, nonEmptySlices[0]);
      continue;
    }

    assignDeviceCollectionKey(
      nextCollection,
      key,
      nonEmptySlices.flat() as DeviceCollection[typeof key]
    );
  }

  return nextCollection;
}

function createSelectedProviderCollections(
  keys: readonly DeviceCollectionKey[],
  selectedProviderIds: readonly IntegrationProviderId[],
  providerGroupSlices: ReadonlyArray<readonly unknown[]>
): DeviceCollection[] {
  const selectedProviderCollections: DeviceCollection[] = [];
  let sliceIndex = 0;

  for (let providerIndex = 0; providerIndex < selectedProviderIds.length; providerIndex += 1) {
    const collection = createEmptyDeviceCollection();

    for (const key of keys) {
      const slice = providerGroupSlices[sliceIndex];
      assignDeviceCollectionKey(
        collection,
        key,
        Array.isArray(slice) ? (slice as DeviceCollection[typeof key]) : []
      );
      sliceIndex += 1;
    }

    selectedProviderCollections.push(collection);
  }

  return selectedProviderCollections;
}

export const useDeviceCollectionsByKeys = (
  keys: readonly DeviceCollectionKey[],
  options?: UseDevicesOptions
): DeviceCollection => {
  const enabled = options?.enabled ?? true;
  const includeFeatureCollections = options?.includeFeatureCollections ?? true;
  const deviceFilter = options?.deviceFilter;
  const selectedProviderIds = useIntegrationStore(
    (state) =>
      enabled ? integrationSelectors.selectedProviderIds(state) : EMPTY_SELECTED_PROVIDER_IDS,
    areArraysEqual
  );
  const providerGroupSlices = useIntegrationStore(
    (state) => {
      if (!enabled || keys.length === 0) {
        return EMPTY_DEVICE_GROUP_SLICES;
      }

      return selectedProviderIds.flatMap((providerId) => {
        const collection =
          integrationSelectors.providerDeviceCollectionById(providerId)(state) ??
          EMPTY_DEVICE_COLLECTION;
        return keys.map((key) => {
          const devices = collection[key];
          return deviceFilter ? devices.filter((device) => deviceFilter(device, key)) : devices;
        });
      });
    },
    (left, right) =>
      areArraysEqual(
        left,
        right,
        (leftSlice, rightSlice) =>
          Object.is(leftSlice, rightSlice) ||
          (Array.isArray(leftSlice) &&
            Array.isArray(rightSlice) &&
            areArraysEqual(leftSlice, rightSlice, Object.is))
      )
  );
  const { roomIdsByEntityId, roomPlacementLookup } = useRoomPlacementLookup(enabled);
  const { calendars, weather } = useSelectedProviderFeatureCollections({
    selectedProviderIds,
    enabled,
    includeCalendars: includeFeatureCollections && keys.includes('calendars'),
    includeWeather: includeFeatureCollections && keys.includes('weather'),
  });

  return useMemo(() => {
    if (!enabled) {
      return createEmptyDeviceCollection();
    }

    if (keys.length === 0) {
      return createEmptyDeviceCollection();
    }

    const selectedProviderCollections = createSelectedProviderCollections(
      keys,
      selectedProviderIds,
      providerGroupSlices
    );

    const collection = applyRoomOverrides(
      buildDeviceCollectionForKeys(keys, selectedProviderCollections),
      roomIdsByEntityId,
      roomPlacementLookup
    );
    if (keys.includes('calendars')) {
      collection.calendars = calendars;
    }
    if (keys.includes('weather')) {
      collection.weather = weather;
    }

    return collection;
  }, [
    calendars,
    deviceFilter,
    enabled,
    keys,
    providerGroupSlices,
    roomIdsByEntityId,
    roomPlacementLookup,
    selectedProviderIds,
    weather,
  ]);
};

export const useAggregatedDevices = (options?: UseDevicesOptions): DeviceCollection => {
  const enabled = options?.enabled ?? true;
  const includeFeatureCollections = options?.includeFeatureCollections ?? true;
  const selectedProviderIds = useIntegrationStore(
    (state) =>
      enabled ? integrationSelectors.selectedProviderIds(state) : EMPTY_SELECTED_PROVIDER_IDS,
    areArraysEqual
  );
  const selectedProviderCollections = useIntegrationStore(
    (state) =>
      enabled
        ? selectedProviderIds.map(
            (providerId) =>
              integrationSelectors.providerDeviceCollectionById(providerId)(state) ??
              EMPTY_DEVICE_COLLECTION
          )
        : EMPTY_DEVICE_COLLECTIONS,
    (left, right) => areArraysEqual(left, right, Object.is)
  );
  const { roomIdsByEntityId, roomPlacementLookup } = useRoomPlacementLookup(enabled);
  const { calendars, weather } = useSelectedProviderFeatureCollections({
    selectedProviderIds,
    enabled,
    includeCalendars: includeFeatureCollections,
    includeWeather: includeFeatureCollections,
  });

  return useMemo(() => {
    if (!enabled) {
      return {
        ...EMPTY_DEVICE_COLLECTION,
        calendars: [],
        weather: [],
      };
    }

    const collection =
      selectedProviderCollections.length === 1
        ? { ...selectedProviderCollections[0] }
        : mergeDeviceCollections(...selectedProviderCollections);

    collection.calendars = calendars;
    collection.weather = weather;

    return applyRoomOverrides(collection, roomIdsByEntityId, roomPlacementLookup);
  }, [
    calendars,
    enabled,
    roomIdsByEntityId,
    roomPlacementLookup,
    selectedProviderCollections,
    weather,
  ]);
};
export const useDevices = (options?: UseDevicesOptions): DeviceCollection =>
  useDeviceCollectionsByKeys(DEVICE_COLLECTION_KEYS, options);
export const useProviderDevices = (providerId: IntegrationProviderId): DeviceCollection => {
  return useIntegrationStore(
    (state) =>
      integrationSelectors.providerDeviceCollectionById(providerId)(state) ??
      EMPTY_DEVICE_COLLECTION,
    Object.is
  );
};
export const useProviderDeviceCollection = useProviderDevices;

interface UseProviderSensorCollectionOptions {
  entityIds?: string[];
  includeAll?: boolean;
}

function matchesSelectedSensorId(device: SensorDevice, selectedIds: Set<string>) {
  return (
    selectedIds.has(device.id) ||
    (typeof device.canonicalId === 'string' && selectedIds.has(device.canonicalId)) ||
    (typeof device.nativeId === 'string' && selectedIds.has(device.nativeId))
  );
}

export const useProviderSensorCollection = (
  providerId: IntegrationProviderId,
  options: UseProviderSensorCollectionOptions = {}
) => {
  const entityIds = options.entityIds ?? EMPTY_SENSOR_ENTITY_IDS;
  const includeAll = options.includeAll ?? true;
  const selectedIds = useMemo(() => new Set(entityIds), [entityIds]);
  const selectSensors = useCallback(
    (state: IntegrationStore) => {
      const sensors = (
        integrationSelectors.providerDeviceCollectionById(providerId)(state) ??
        EMPTY_DEVICE_COLLECTION
      ).sensors;

      if (includeAll) {
        return sensors;
      }
      if (selectedIds.size === 0) {
        return EMPTY_DEVICE_COLLECTION.sensors;
      }
      return sensors.filter((device) => matchesSelectedSensorId(device, selectedIds));
    },
    [includeAll, providerId, selectedIds]
  );

  return useIntegrationStore(selectSensors, areArraysEqual);
};
export const useCalendarDevicesCollection = (options?: { enabled?: boolean }) => {
  const enabled = options?.enabled ?? true;
  const selectedProviderIds = useIntegrationStore(
    (state) =>
      enabled ? integrationSelectors.selectedProviderIds(state) : EMPTY_SELECTED_PROVIDER_IDS,
    areArraysEqual
  );

  return useSelectedProviderFeatureCollections({
    selectedProviderIds,
    enabled,
    includeCalendars: true,
    includeWeather: false,
  }).calendars;
};
export const useWeatherDevicesCollection = (options?: { enabled?: boolean }) => {
  const enabled = options?.enabled ?? true;
  const selectedProviderIds = useIntegrationStore(
    (state) =>
      enabled ? integrationSelectors.selectedProviderIds(state) : EMPTY_SELECTED_PROVIDER_IDS,
    areArraysEqual
  );

  return useSelectedProviderFeatureCollections({
    selectedProviderIds,
    enabled,
    includeCalendars: false,
    includeWeather: true,
  }).weather;
};
export const useProviderCalendarCollections = useProviderCalendarDevicesCollection;
export const useProviderWeatherCollections = useProviderWeatherDevicesCollection;

export const useRooms = (devices: DeviceCollection): string[] =>
  useMemo(() => getAllRooms(devices), [devices]);

export function mergeDeviceCollections(...collections: DeviceCollection[]): DeviceCollection {
  return collections.reduce<DeviceCollection>(
    (merged, collection) => ({
      lights: [...merged.lights, ...collection.lights],
      fans: [...merged.fans, ...collection.fans],
      climate: [...merged.climate, ...collection.climate],
      hvac: [...merged.hvac, ...collection.hvac],
      media: [...merged.media, ...collection.media],
      weather: [...merged.weather, ...collection.weather],
      switches: [...merged.switches, ...collection.switches],
      helpers: [...merged.helpers, ...collection.helpers],
      timers: [...merged.timers, ...collection.timers],
      counters: [...merged.counters, ...collection.counters],
      valves: [...merged.valves, ...collection.valves],
      remotes: [...merged.remotes, ...collection.remotes],
      covers: [...merged.covers, ...collection.covers],
      locks: [...merged.locks, ...collection.locks],
      scenes: [...merged.scenes, ...collection.scenes],
      persons: [...merged.persons, ...collection.persons],
      sensors: [...merged.sensors, ...collection.sensors],
      vacuums: [...merged.vacuums, ...collection.vacuums],
      calendars: [...merged.calendars, ...collection.calendars],
      cameras: [...merged.cameras, ...collection.cameras],
      'grouped-sensors': [...merged['grouped-sensors'], ...collection['grouped-sensors']],
    }),
    {
      lights: [],
      fans: [],
      climate: [],
      hvac: [],
      media: [],
      weather: [],
      switches: [],
      helpers: [],
      timers: [],
      counters: [],
      valves: [],
      remotes: [],
      covers: [],
      locks: [],
      scenes: [],
      persons: [],
      sensors: [],
      vacuums: [],
      calendars: [],
      cameras: [],
      'grouped-sensors': [],
    }
  );
}

export function filterDeviceCollectionByProvider(
  devices: DeviceCollection,
  providerId: IntegrationProviderId
): DeviceCollection {
  return {
    lights: devices.lights.filter((device) => device.providerId === providerId),
    fans: devices.fans.filter((device) => device.providerId === providerId),
    climate: devices.climate.filter((device) => device.providerId === providerId),
    hvac: devices.hvac.filter((device) => device.providerId === providerId),
    media: devices.media.filter((device) => device.providerId === providerId),
    weather: devices.weather.filter((device) => device.providerId === providerId),
    switches: devices.switches.filter((device) => device.providerId === providerId),
    helpers: devices.helpers.filter((device) => device.providerId === providerId),
    timers: devices.timers.filter((device) => device.providerId === providerId),
    counters: devices.counters.filter((device) => device.providerId === providerId),
    valves: devices.valves.filter((device) => device.providerId === providerId),
    remotes: devices.remotes.filter((device) => device.providerId === providerId),
    covers: devices.covers.filter((device) => device.providerId === providerId),
    locks: devices.locks.filter((device) => device.providerId === providerId),
    scenes: devices.scenes.filter((device) => device.providerId === providerId),
    persons: devices.persons.filter((device) => device.providerId === providerId),
    sensors: devices.sensors.filter((device) => device.providerId === providerId),
    vacuums: devices.vacuums.filter((device) => device.providerId === providerId),
    calendars: devices.calendars.filter((device) => device.providerId === providerId),
    cameras: devices.cameras.filter((device) => device.providerId === providerId),
    'grouped-sensors': devices['grouped-sensors'].filter(
      (device) => device.providerId === providerId
    ),
  };
}
