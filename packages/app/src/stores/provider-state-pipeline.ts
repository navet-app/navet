import {
  hasStableDeviceCollectionMembership,
  mapNavetEntitiesToDeviceCollection,
} from '@navet/app/core/navet-device-collections';
import { buildManageableRoomReferences } from '@navet/app/platform/provider-room-management';
import type {
  IntegrationProviderRoomModel,
  IntegrationRoomDescriptor,
} from '@navet/app/stores/integration-models';
import type { DeviceCollection } from '@navet/app/types/device.types';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import { INTEGRATION_PROVIDER_IDS } from '@navet/app/types/provider';
import { createProviderScopedId } from '@navet/app/utils/provider-ids';
import { normalizeRoomName } from '@navet/app/utils/room-name';
import { areDataEqual } from '@navet/app/utils/structural-equality';
import type {
  PlatformManageableRoomReference,
  ProviderRoomManagementCapabilities,
} from '@navet/core/provider-feature-models';
import type {
  NavetEntity,
  NavetEntityEvent,
  NavetProviderRoom,
  NavetProviderState,
} from '@navet/core/types';
import {
  createDashboardEntityView,
  type DashboardEntityView,
} from '@navet/ui/dashboard-entity-view';

export type ProviderScopedState = {
  deviceCollection: DeviceCollection;
  deviceCollectionLocationsByCanonicalId: Map<string, DeviceCollectionLocation>;
  entityDeltaIds: string[];
  entityLookupByCanonicalId: Record<string, string>;
  entityViewsByCanonicalId: Record<string, DashboardEntityView>;
  entitiesByCanonicalId: Record<string, NavetEntity>;
  normalizedRoomsByCanonicalId: Record<string, NavetProviderRoom>;
  roomsByCanonicalId: Record<string, IntegrationProviderRoomModel>;
  sourceEntities: NavetEntity[];
  sourceProviderState: NavetProviderState | null;
  sourceRooms: NavetProviderRoom[];
};

const DEVICE_COLLECTION_KEYS = [
  'lights',
  'fans',
  'hvac',
  'climate',
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

type DeviceCollectionKey = (typeof DEVICE_COLLECTION_KEYS)[number];
type DeviceCollectionEntry = DeviceCollection[DeviceCollectionKey][number];
type DeviceCollectionLocation = {
  index: number;
  key: DeviceCollectionKey;
};

const EMPTY_NAVET_ENTITIES: NavetEntity[] = [];
const EMPTY_NAVET_ROOMS: NavetProviderRoom[] = [];

function ownsKey(record: object, key: PropertyKey) {
  return Reflect.apply(Object.prototype.hasOwnProperty, record, [key]);
}

export function reuseValue<T>(previousValue: T | undefined, nextValue: T): T {
  return previousValue !== undefined && areDataEqual(previousValue, nextValue)
    ? previousValue
    : nextValue;
}

export function buildProviderScopedState({
  providerId,
  providerState,
  previousState,
}: {
  providerId: IntegrationProviderId;
  providerState: NavetProviderState | null;
  previousState?: ProviderScopedState;
}): ProviderScopedState {
  if (previousState?.sourceProviderState === providerState) {
    return previousState;
  }

  const sourceEntities = providerState?.entities ?? EMPTY_NAVET_ENTITIES;
  const sourceRooms = providerState?.rooms ?? EMPTY_NAVET_ROOMS;
  let entitiesByCanonicalId =
    previousState?.entitiesByCanonicalId ?? ({} as Record<string, NavetEntity>);
  let entityViewsByCanonicalId =
    previousState?.entityViewsByCanonicalId ?? ({} as Record<string, DashboardEntityView>);
  const changedEntityIds: string[] = [];
  let entityMembershipChanged = !previousState;
  let lookupAliasesChanged = !previousState;

  if (sourceEntities !== previousState?.sourceEntities) {
    let entitiesWritable = !previousState;
    let viewsWritable = !previousState;
    const ensureEntitiesWritable = () => {
      if (!entitiesWritable) {
        entitiesByCanonicalId = { ...entitiesByCanonicalId };
        entitiesWritable = true;
      }
    };
    const ensureViewsWritable = () => {
      if (!viewsWritable) {
        entityViewsByCanonicalId = { ...entityViewsByCanonicalId };
        viewsWritable = true;
      }
    };

    if (previousState && sourceEntities.length !== previousState.sourceEntities.length) {
      entityMembershipChanged = true;
      lookupAliasesChanged = true;
    }

    for (const entity of sourceEntities) {
      const previousEntity = previousState?.entitiesByCanonicalId[entity.canonicalId];
      const nextEntity = reuseValue(previousEntity, entity);
      if (previousEntity === nextEntity) {
        continue;
      }

      ensureEntitiesWritable();
      ensureViewsWritable();
      entitiesByCanonicalId[nextEntity.canonicalId] = nextEntity;
      entityViewsByCanonicalId[nextEntity.canonicalId] = reuseValue(
        previousState?.entityViewsByCanonicalId[nextEntity.canonicalId],
        createDashboardEntityView(nextEntity)
      );
      changedEntityIds.push(nextEntity.canonicalId);

      if (!previousEntity) {
        entityMembershipChanged = true;
        lookupAliasesChanged = true;
      } else if (
        previousEntity.id !== nextEntity.id ||
        previousEntity.externalId !== nextEntity.externalId ||
        previousEntity.providerId !== nextEntity.providerId
      ) {
        lookupAliasesChanged = true;
      }
    }

    if (entityMembershipChanged && previousState) {
      const nextEntityIds = new Set(sourceEntities.map((entity) => entity.canonicalId));
      for (const entityId of Object.keys(previousState.entitiesByCanonicalId)) {
        if (nextEntityIds.has(entityId)) {
          continue;
        }
        ensureEntitiesWritable();
        ensureViewsWritable();
        delete entitiesByCanonicalId[entityId];
        delete entityViewsByCanonicalId[entityId];
        changedEntityIds.push(entityId);
      }
    }
  }

  let normalizedRoomsByCanonicalId =
    previousState?.normalizedRoomsByCanonicalId ?? ({} as Record<string, NavetProviderRoom>);
  let roomsByCanonicalId =
    previousState?.roomsByCanonicalId ?? ({} as Record<string, IntegrationProviderRoomModel>);
  let roomMembershipChanged = !previousState;

  if (sourceRooms !== previousState?.sourceRooms) {
    let normalizedRoomsWritable = !previousState;
    let roomsWritable = !previousState;
    const ensureNormalizedRoomsWritable = () => {
      if (!normalizedRoomsWritable) {
        normalizedRoomsByCanonicalId = { ...normalizedRoomsByCanonicalId };
        normalizedRoomsWritable = true;
      }
    };
    const ensureRoomsWritable = () => {
      if (!roomsWritable) {
        roomsByCanonicalId = { ...roomsByCanonicalId };
        roomsWritable = true;
      }
    };
    if (previousState && sourceRooms.length !== previousState.sourceRooms.length) {
      roomMembershipChanged = true;
    }

    for (const room of sourceRooms) {
      const previousNormalizedRoom = previousState?.normalizedRoomsByCanonicalId[room.canonicalId];
      const nextNormalizedRoom = reuseValue(previousNormalizedRoom, room);
      if (previousNormalizedRoom === nextNormalizedRoom) {
        continue;
      }
      if (!previousNormalizedRoom) {
        roomMembershipChanged = true;
      }

      ensureNormalizedRoomsWritable();
      ensureRoomsWritable();
      normalizedRoomsByCanonicalId[nextNormalizedRoom.canonicalId] = nextNormalizedRoom;
      roomsByCanonicalId[nextNormalizedRoom.canonicalId] = reuseValue(
        previousState?.roomsByCanonicalId[nextNormalizedRoom.canonicalId],
        mapProviderRoomToIntegrationRoom(nextNormalizedRoom)
      );
    }

    if (previousState && roomMembershipChanged) {
      const nextRoomIds = new Set(sourceRooms.map((room) => room.canonicalId));
      for (const roomId of Object.keys(previousState.normalizedRoomsByCanonicalId)) {
        if (nextRoomIds.has(roomId)) {
          continue;
        }
        ensureNormalizedRoomsWritable();
        ensureRoomsWritable();
        delete normalizedRoomsByCanonicalId[roomId];
        delete roomsByCanonicalId[roomId];
      }
    }
  }

  let deviceCollection = previousState?.deviceCollection;
  let deviceCollectionLocationsByCanonicalId =
    previousState?.deviceCollectionLocationsByCanonicalId;
  if (!deviceCollection || entitiesByCanonicalId !== previousState?.entitiesByCanonicalId) {
    const incrementalCollection =
      previousState && !entityMembershipChanged
        ? updateChangedDeviceCollectionEntries({
            changedEntityIds,
            entitiesByCanonicalId,
            previousState,
          })
        : null;
    const usedIncrementalCollection = incrementalCollection !== null;

    if (incrementalCollection) {
      deviceCollection = incrementalCollection;
    } else {
      deviceCollection = reuseDeviceCollection(
        previousState?.deviceCollection,
        mapNavetEntitiesToDeviceCollection(sourceEntities)
      );
    }

    if (
      !previousState ||
      entityMembershipChanged ||
      (!usedIncrementalCollection && deviceCollection !== previousState.deviceCollection)
    ) {
      deviceCollectionLocationsByCanonicalId = buildDeviceCollectionLocationIndex(deviceCollection);
    }
  }

  const entityLookupByCanonicalId =
    previousState && !lookupAliasesChanged
      ? previousState.entityLookupByCanonicalId
      : reuseValue(
          previousState?.entityLookupByCanonicalId,
          buildEntityLookupIndex(providerId, entitiesByCanonicalId)
        );

  return {
    deviceCollection: deviceCollection as DeviceCollection,
    deviceCollectionLocationsByCanonicalId:
      deviceCollectionLocationsByCanonicalId ??
      buildDeviceCollectionLocationIndex(deviceCollection as DeviceCollection),
    entityDeltaIds: changedEntityIds,
    entityLookupByCanonicalId,
    entityViewsByCanonicalId,
    entitiesByCanonicalId,
    normalizedRoomsByCanonicalId,
    roomsByCanonicalId,
    sourceEntities,
    sourceProviderState: providerState,
    sourceRooms,
  };
}

export function flattenProviderRecords<T>(
  recordByProviderId: Partial<Record<IntegrationProviderId, Record<string, T>>>
): Record<string, T> {
  return Object.values(recordByProviderId).reduce<Record<string, T>>((merged, record) => {
    if (!record) {
      return merged;
    }

    Object.assign(merged, record);
    return merged;
  }, {});
}

export function replaceFlattenedProviderRecord<T>(
  previousFlatRecord: Record<string, T>,
  previousProviderRecord: Record<string, T>,
  nextProviderRecord: Record<string, T>,
  changedKeys?: readonly string[]
): Record<string, T> {
  if (previousProviderRecord === nextProviderRecord) {
    return previousFlatRecord;
  }

  let nextFlatRecord = previousFlatRecord;
  const getWritableRecord = () => {
    if (nextFlatRecord === previousFlatRecord) {
      nextFlatRecord = { ...previousFlatRecord };
    }
    return nextFlatRecord;
  };

  if (changedKeys) {
    for (const key of changedKeys) {
      const previousValue = previousProviderRecord[key];
      const nextValue = nextProviderRecord[key];
      if (previousValue === nextValue) {
        continue;
      }
      if (nextValue === undefined) {
        delete getWritableRecord()[key];
      } else {
        getWritableRecord()[key] = nextValue;
      }
    }
    return nextFlatRecord;
  }

  for (const [key, previousValue] of Object.entries(previousProviderRecord)) {
    if (!(key in nextProviderRecord)) {
      delete getWritableRecord()[key];
    } else if (nextProviderRecord[key] !== previousValue) {
      getWritableRecord()[key] = nextProviderRecord[key];
    }
  }

  for (const [key, nextValue] of Object.entries(nextProviderRecord)) {
    if (!(key in previousProviderRecord)) {
      getWritableRecord()[key] = nextValue;
    }
  }

  return nextFlatRecord;
}

export function collectProviderEntityEvents(
  providerId: IntegrationProviderId,
  previousEntitiesByCanonicalId: Record<string, NavetEntity>,
  nextEntitiesByCanonicalId: Record<string, NavetEntity>,
  changedEntityIds?: readonly string[]
): NavetEntityEvent[] {
  if (previousEntitiesByCanonicalId === nextEntitiesByCanonicalId) {
    return [];
  }

  const events: NavetEntityEvent[] = [];
  const timestamp = new Date().toISOString();
  if (changedEntityIds) {
    for (const entityId of changedEntityIds) {
      const previousEntity = previousEntitiesByCanonicalId[entityId];
      const entity = nextEntitiesByCanonicalId[entityId];
      if (!previousEntity && entity) {
        events.push({
          type: 'entity_added',
          providerId,
          entityId,
          entity,
          at: timestamp,
        });
      } else if (previousEntity && !entity) {
        events.push({
          type: 'entity_removed',
          providerId,
          entityId,
          at: timestamp,
        });
      } else if (previousEntity && entity && previousEntity !== entity) {
        events.push({
          type: 'entity_updated',
          providerId,
          entityId,
          entity,
          at: timestamp,
        });
      }
    }
    return events;
  }

  for (const [entityId, entity] of Object.entries(nextEntitiesByCanonicalId)) {
    const previousEntity = previousEntitiesByCanonicalId[entityId];

    if (!previousEntity) {
      events.push({
        type: 'entity_added',
        providerId,
        entityId,
        entity,
        at: timestamp,
      });
      continue;
    }

    if (previousEntity !== entity) {
      events.push({
        type: 'entity_updated',
        providerId,
        entityId,
        entity,
        at: timestamp,
      });
    }
  }

  for (const entityId of Object.keys(previousEntitiesByCanonicalId)) {
    if (!(entityId in nextEntitiesByCanonicalId)) {
      events.push({
        type: 'entity_removed',
        providerId,
        entityId,
        at: timestamp,
      });
    }
  }

  return events;
}

export function buildRoomDescriptors({
  normalizedRoomsByCanonicalId,
}: {
  normalizedRoomsByCanonicalId: Record<string, NavetProviderRoom>;
}): IntegrationRoomDescriptor[] {
  const descriptorMap = new Map<string, IntegrationRoomDescriptor>();

  const upsertRoomDescriptor = (
    name: string,
    source: IntegrationRoomDescriptor['sources'][number],
    memberIds: string[] = []
  ) => {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      return;
    }

    const normalizedName = normalizeRoomName(trimmedName);
    const existing = descriptorMap.get(normalizedName);

    if (existing) {
      if (!existing.providerIds.includes(source.providerId)) {
        existing.providerIds.push(source.providerId);
      }
      if (
        !existing.sources.some(
          (entry) =>
            entry.providerId === source.providerId &&
            entry.nativeId === source.nativeId &&
            entry.sourceType === source.sourceType
        )
      ) {
        existing.sources.push(source);
      }
      for (const memberId of memberIds) {
        if (!existing.memberIds.includes(memberId)) {
          existing.memberIds.push(memberId);
        }
      }
      return;
    }

    descriptorMap.set(normalizedName, {
      id: normalizedName,
      canonicalId: normalizedName,
      name: trimmedName,
      normalizedName,
      providerIds: [source.providerId],
      memberIds: [...memberIds],
      sources: [source],
    });
  };

  for (const room of Object.values(normalizedRoomsByCanonicalId)) {
    upsertRoomDescriptor(
      room.name,
      {
        providerId: room.providerId,
        nativeId: room.externalId,
        canonicalId: room.canonicalId,
        sourceType: room.sourceType,
        supportsOrdering: room.supportsOrdering,
        supportsDeletion: room.supportsDeletion,
      },
      room.memberIds
    );
  }

  return Array.from(descriptorMap.values());
}

export function buildManageableRoomsByProviderId(
  roomDescriptors: IntegrationRoomDescriptor[],
  resolveCapabilities: (providerId: IntegrationProviderId) => ProviderRoomManagementCapabilities
): Record<IntegrationProviderId, PlatformManageableRoomReference[]> {
  return Object.fromEntries(
    INTEGRATION_PROVIDER_IDS.map((providerId) => [
      providerId,
      buildManageableRoomReferences(roomDescriptors, providerId, resolveCapabilities(providerId)),
    ])
  ) as Record<IntegrationProviderId, PlatformManageableRoomReference[]>;
}

function mapProviderRoomToIntegrationRoom(room: NavetProviderRoom): IntegrationProviderRoomModel {
  return {
    id: room.canonicalId,
    canonicalId: room.canonicalId,
    providerId: room.providerId,
    nativeId: room.externalId,
    name: room.name,
    normalizedName: room.normalizedName,
    alias: room.alias,
    memberIds: [...room.memberIds],
  };
}

function assignDeviceCollectionEntry<K extends DeviceCollectionKey>(
  collection: DeviceCollection,
  key: K,
  value: DeviceCollection[K]
) {
  collection[key] = value;
}

function addLookupAlias(
  index: Record<string, string>,
  alias: string | undefined,
  canonicalId: string
) {
  if (!alias) {
    return;
  }

  index[alias] = canonicalId;
}

function buildEntityLookupIndex(
  providerId: IntegrationProviderId,
  entitiesByCanonicalId: Record<string, NavetEntity>
) {
  const lookupByCanonicalId: Record<string, string> = {};

  for (const entityId in entitiesByCanonicalId) {
    if (!ownsKey(entitiesByCanonicalId, entityId)) {
      continue;
    }
    const entity = entitiesByCanonicalId[entityId] as NavetEntity;
    addLookupAlias(lookupByCanonicalId, entity.canonicalId, entity.canonicalId);
    addLookupAlias(lookupByCanonicalId, entity.id, entity.canonicalId);
    addLookupAlias(lookupByCanonicalId, entity.externalId, entity.canonicalId);
    addLookupAlias(
      lookupByCanonicalId,
      entity.externalId ? createProviderScopedId(providerId, entity.externalId) : undefined,
      entity.canonicalId
    );
  }

  return lookupByCanonicalId;
}

function buildDeviceCollectionLocationIndex(collection: DeviceCollection) {
  const locations = new Map<string, DeviceCollectionLocation>();

  for (const key of DEVICE_COLLECTION_KEYS) {
    const devices = collection[key] as DeviceCollectionEntry[];
    for (let index = 0; index < devices.length; index += 1) {
      const device = devices[index];
      if (device) {
        locations.set(device.id, { index, key });
      }
    }
  }

  return locations;
}

function updateChangedDeviceCollectionEntries({
  changedEntityIds,
  entitiesByCanonicalId,
  previousState,
}: {
  changedEntityIds: readonly string[];
  entitiesByCanonicalId: Record<string, NavetEntity>;
  previousState: ProviderScopedState;
}): DeviceCollection | null {
  let nextCollection = previousState.deviceCollection;
  const writableKeys = new Set<DeviceCollectionKey>();

  for (const entityId of changedEntityIds) {
    const previousEntity = previousState.entitiesByCanonicalId[entityId];
    const nextEntity = entitiesByCanonicalId[entityId];
    if (
      !previousEntity ||
      !nextEntity ||
      !hasStableDeviceCollectionMembership(previousEntity, nextEntity)
    ) {
      return null;
    }

    const location = previousState.deviceCollectionLocationsByCanonicalId.get(entityId);
    if (!location) {
      continue;
    }

    const remappedCollection = mapNavetEntitiesToDeviceCollection([nextEntity]);
    const nextDevice = remappedCollection[location.key][0] as DeviceCollectionEntry | undefined;
    const previousDevice = previousState.deviceCollection[location.key][
      location.index
    ] as DeviceCollectionEntry;
    if (!nextDevice || nextDevice.id !== entityId) {
      return null;
    }
    if (areDataEqual(previousDevice, nextDevice)) {
      continue;
    }

    if (nextCollection === previousState.deviceCollection) {
      nextCollection = { ...previousState.deviceCollection };
    }
    if (!writableKeys.has(location.key)) {
      assignDeviceCollectionEntry(nextCollection, location.key, [
        ...previousState.deviceCollection[location.key],
      ] as DeviceCollection[typeof location.key]);
      writableKeys.add(location.key);
    }
    (nextCollection[location.key] as DeviceCollectionEntry[])[location.index] = nextDevice;
  }

  return nextCollection;
}

function reuseDeviceArrayEntries<T extends { id: string }>(previous: T[], next: T[]): T[] {
  if (previous === next) {
    return previous;
  }

  if (previous.length === 0) {
    return next;
  }

  const previousById = new Map(previous.map((device) => [device.id, device]));
  let changed = previous.length !== next.length;

  const merged = next.map((device, index) => {
    const previousDevice = previousById.get(device.id);
    if (previousDevice && areDataEqual(previousDevice, device)) {
      if (previous[index] !== previousDevice) {
        changed = true;
      }
      return previousDevice;
    }

    if (previous[index] !== device) {
      changed = true;
    }
    return device;
  });

  return changed ? merged : previous;
}

function reuseDeviceCollection(
  previousCollection: DeviceCollection | undefined,
  nextCollection: DeviceCollection
): DeviceCollection {
  if (!previousCollection) {
    return nextCollection;
  }

  let changed = false;
  const mergedCollection = { ...nextCollection };

  for (const key of DEVICE_COLLECTION_KEYS) {
    const previousDevices = previousCollection[key] as DeviceCollectionEntry[];
    const nextDevices = nextCollection[key] as DeviceCollectionEntry[];
    const mergedDevices = reuseDeviceArrayEntries(previousDevices, nextDevices);

    if (mergedDevices !== previousDevices) {
      changed = true;
    }

    assignDeviceCollectionEntry(
      mergedCollection,
      key,
      mergedDevices as DeviceCollection[typeof key]
    );
  }

  return changed ? mergedCollection : previousCollection;
}
