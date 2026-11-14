import type {
  PlatformEntityRegistryEntry,
  PlatformEntitySnapshot,
  PlatformEntitySnapshotMap,
} from '@navet/core/provider-feature-models';
import type { ProviderEntityRuntimeService } from '@navet/core/provider-feature-services';
import { areDataEqual } from '@navet/core/structural-equality';
import type { HassConfig, HassEntities } from 'home-assistant-js-websocket';
import { resolveDeviceAreaId } from './homeassistant-mapper-support';
import {
  addHomeAssistantListener,
  getHomeAssistantConfig,
  getHomeAssistantEntityRegistry,
  getHomeAssistantStoreState,
  type HomeAssistantDeviceRegistryEntry,
  type HomeAssistantEntityRegistryEntry,
  subscribeHomeAssistantStoreEntities,
} from './homeassistant-service-bridge';

const EMPTY_HASS_ENTITY_REGISTRY: HomeAssistantEntityRegistryEntry[] = [];
let cachedSourceEntities: HassEntities | null | undefined;
let cachedSourceEntityCount = 0;
let cachedPlatformEntities: PlatformEntitySnapshotMap | null = null;
let cachedSourceRegistry: HomeAssistantEntityRegistryEntry[] | null = null;
let cachedSourceDeviceRegistry: HomeAssistantDeviceRegistryEntry[] | null = null;
let cachedPlatformRegistry: PlatformEntityRegistryEntry[] = [];
let cachedPlatformRegistryById: Record<string, PlatformEntityRegistryEntry> = {};
let cachedSourceConfig: HassConfig | null = null;
let cachedPlatformConfig: HassConfig | null = null;

function areEquivalentRegistryEntries(
  previous: HomeAssistantEntityRegistryEntry[] | null,
  next: HomeAssistantEntityRegistryEntry[]
) {
  if (previous === next) {
    return true;
  }

  if (!previous || previous.length !== next.length) {
    return false;
  }

  return previous.every((entry, index) => {
    const nextEntry = next[index];
    return (
      entry.entity_id === nextEntry.entity_id &&
      entry.device_id === nextEntry.device_id &&
      entry.area_id === nextEntry.area_id &&
      entry.name === nextEntry.name &&
      entry.original_name === nextEntry.original_name &&
      entry.platform === nextEntry.platform
    );
  });
}

function toPlatformEntityRegistryEntry(
  entry: {
    entity_id?: string;
    entityId?: string;
    device_id?: string | null;
    deviceId?: string | null;
    area_id?: string | null;
    areaId?: string | null;
    name?: string | null;
    original_name?: string | null;
    originalName?: string | null;
    platform?: string | null;
  },
  deviceEntry?: HomeAssistantDeviceRegistryEntry,
  deviceAreaId?: string
): PlatformEntityRegistryEntry {
  return {
    entityId: entry.entity_id ?? entry.entityId ?? '',
    deviceId: entry.device_id ?? entry.deviceId ?? null,
    deviceName: deviceEntry?.name_by_user ?? deviceEntry?.name ?? null,
    manufacturer: deviceEntry?.manufacturer ?? null,
    model: deviceEntry?.model ?? null,
    areaId: entry.area_id ?? entry.areaId ?? deviceAreaId ?? null,
    name: entry.name ?? entry.original_name ?? entry.originalName ?? null,
    platform: entry.platform ?? null,
  };
}

function toPlatformEntitySnapshotMap(
  entities: HassEntities | null | undefined
): PlatformEntitySnapshotMap | null {
  if (entities === cachedSourceEntities) {
    return cachedPlatformEntities;
  }

  if (!entities) {
    cachedSourceEntities = entities;
    cachedSourceEntityCount = 0;
    cachedPlatformEntities = null;
    return null;
  }

  const previousSourceEntities = cachedSourceEntities;
  const previousPlatformEntities = cachedPlatformEntities;
  const nextPlatformEntities: PlatformEntitySnapshotMap = {};
  let nextEntityCount = 0;
  let snapshotsChanged = !previousSourceEntities || !previousPlatformEntities;

  for (const [entityId, entity] of Object.entries(entities)) {
    nextEntityCount += 1;
    const previousEntity = previousSourceEntities?.[entityId];
    const previousSnapshot = previousPlatformEntities?.[entityId];

    if (
      previousSnapshot &&
      (previousEntity === entity ||
        (previousEntity &&
          previousEntity.state === entity.state &&
          previousEntity.last_changed === entity.last_changed &&
          previousEntity.last_updated === entity.last_updated &&
          areDataEqual(previousEntity.attributes ?? {}, entity.attributes ?? {})))
    ) {
      nextPlatformEntities[entityId] = previousSnapshot;
      continue;
    }

    snapshotsChanged = true;
    nextPlatformEntities[entityId] = {
      entityId,
      state: entity.state,
      attributes: (entity.attributes as Record<string, unknown> | undefined) ?? {},
      lastChanged: entity.last_changed,
      lastUpdated: entity.last_updated,
    } satisfies PlatformEntitySnapshot;
  }

  snapshotsChanged ||= nextEntityCount !== cachedSourceEntityCount;
  cachedSourceEntities = entities;
  cachedSourceEntityCount = nextEntityCount;

  if (!snapshotsChanged) {
    return cachedPlatformEntities;
  }

  cachedPlatformEntities = nextPlatformEntities;
  return cachedPlatformEntities;
}

function toPlatformEntityRegistryEntries(
  entityRegistry: HomeAssistantEntityRegistryEntry[],
  deviceRegistry: HomeAssistantDeviceRegistryEntry[]
): PlatformEntityRegistryEntry[] {
  const deviceRegistryChanged = !areDataEqual(cachedSourceDeviceRegistry ?? [], deviceRegistry);
  if (
    !deviceRegistryChanged &&
    (entityRegistry === cachedSourceRegistry ||
      areEquivalentRegistryEntries(cachedSourceRegistry, entityRegistry))
  ) {
    cachedSourceRegistry = entityRegistry;
    return cachedPlatformRegistry;
  }

  const previousSourceRegistryById = Object.fromEntries(
    (cachedSourceRegistry ?? []).map((entry) => [entry.entity_id, entry])
  );
  const previousPlatformRegistryById = cachedPlatformRegistryById;
  const previousDeviceRegistryById = new Map(
    (cachedSourceDeviceRegistry ?? []).map((device) => [device.id, device])
  );
  const deviceRegistryById = new Map(deviceRegistry.map((device) => [device.id, device]));
  cachedSourceRegistry = entityRegistry;
  cachedSourceDeviceRegistry = deviceRegistry;
  cachedPlatformRegistry = entityRegistry.map((entry) => {
    const previousEntry = previousSourceRegistryById[entry.entity_id];
    const previousPlatformEntry = previousPlatformRegistryById[entry.entity_id];
    const previousDeviceEntry = entry.device_id
      ? previousDeviceRegistryById.get(entry.device_id)
      : undefined;
    const deviceEntry = entry.device_id ? deviceRegistryById.get(entry.device_id) : undefined;
    const parentEntry = deviceEntry?.parent_device_id
      ? deviceRegistryById.get(deviceEntry.parent_device_id)
      : undefined;
    const deviceAreaId = resolveDeviceAreaId(deviceEntry, parentEntry);

    if (
      previousEntry &&
      previousPlatformEntry &&
      previousEntry.device_id === entry.device_id &&
      previousEntry.area_id === entry.area_id &&
      previousEntry.name === entry.name &&
      previousEntry.original_name === entry.original_name &&
      previousEntry.platform === entry.platform &&
      previousPlatformEntry.areaId === (entry.area_id ?? deviceAreaId ?? null) &&
      areDataEqual(previousDeviceEntry ?? null, deviceEntry ?? null)
    ) {
      return previousPlatformEntry;
    }

    return toPlatformEntityRegistryEntry(entry, deviceEntry, deviceAreaId);
  });
  cachedPlatformRegistryById = Object.fromEntries(
    cachedPlatformRegistry.map((entry) => [entry.entityId, entry])
  );
  return cachedPlatformRegistry;
}

function subscribeHomeAssistantEvent(event: 'registries' | 'config', listener: () => void) {
  return addHomeAssistantListener(event, () => {
    listener();
  });
}

function getHomeAssistantEntitiesSnapshot(): HassEntities | null {
  return getHomeAssistantStoreState().entities;
}

function getHomeAssistantEntityRegistrySnapshot(): HomeAssistantEntityRegistryEntry[] {
  const entityRegistry = getHomeAssistantEntityRegistry();
  if (entityRegistry.length > 0) {
    return entityRegistry;
  }

  return getHomeAssistantStoreState().entityRegistry ?? EMPTY_HASS_ENTITY_REGISTRY;
}

function getHomeAssistantDeviceRegistrySnapshot(): HomeAssistantDeviceRegistryEntry[] {
  return getHomeAssistantStoreState().deviceRegistry ?? [];
}

function getHomeAssistantConfigSnapshot(): HassConfig | null {
  const config = getHomeAssistantConfig();
  if (config) {
    return config;
  }

  return getHomeAssistantStoreState().config;
}

function getStableHomeAssistantConfigSnapshot(): HassConfig | null {
  const config = getHomeAssistantConfigSnapshot();
  if (config === cachedSourceConfig) {
    return cachedPlatformConfig;
  }

  if (cachedSourceConfig && config && areDataEqual(cachedSourceConfig, config)) {
    cachedSourceConfig = config;
    return cachedPlatformConfig;
  }

  cachedSourceConfig = config;
  cachedPlatformConfig = config;
  return cachedPlatformConfig;
}

function subscribeHomeAssistantEntitySnapshot(entityId: string, listener: () => void) {
  let previousSnapshot = toPlatformEntitySnapshotMap(getHomeAssistantEntitiesSnapshot())?.[
    entityId
  ];

  return subscribeHomeAssistantStoreEntities(() => {
    const nextSnapshot = toPlatformEntitySnapshotMap(getHomeAssistantEntitiesSnapshot())?.[
      entityId
    ];
    if (nextSnapshot === previousSnapshot) {
      return;
    }

    previousSnapshot = nextSnapshot;
    listener();
  });
}

function subscribeHomeAssistantEntityRegistryEntry(entityId: string, listener: () => void) {
  toPlatformEntityRegistryEntries(
    getHomeAssistantEntityRegistrySnapshot(),
    getHomeAssistantDeviceRegistrySnapshot()
  );
  let previousEntry = cachedPlatformRegistryById[entityId];

  return subscribeHomeAssistantEvent('registries', () => {
    toPlatformEntityRegistryEntries(
      getHomeAssistantEntityRegistrySnapshot(),
      getHomeAssistantDeviceRegistrySnapshot()
    );
    const nextEntry = cachedPlatformRegistryById[entityId];
    if (nextEntry === previousEntry) {
      return;
    }

    previousEntry = nextEntry;
    listener();
  });
}

export const homeAssistantEntityRuntimeService: ProviderEntityRuntimeService = {
  getEntitySnapshots: () => toPlatformEntitySnapshotMap(getHomeAssistantEntitiesSnapshot()),
  subscribeEntitySnapshots: (listener) => subscribeHomeAssistantStoreEntities(listener),
  getEntitySnapshot: (entityId) =>
    toPlatformEntitySnapshotMap(getHomeAssistantEntitiesSnapshot())?.[entityId],
  subscribeEntitySnapshot: (entityId, listener) =>
    subscribeHomeAssistantEntitySnapshot(entityId, listener),
  getEntityRegistryEntries: () =>
    toPlatformEntityRegistryEntries(
      getHomeAssistantEntityRegistrySnapshot(),
      getHomeAssistantDeviceRegistrySnapshot()
    ),
  subscribeEntityRegistryEntries: (listener) => subscribeHomeAssistantEvent('registries', listener),
  getEntityRegistryEntry: (entityId) => {
    toPlatformEntityRegistryEntries(
      getHomeAssistantEntityRegistrySnapshot(),
      getHomeAssistantDeviceRegistrySnapshot()
    );
    return cachedPlatformRegistryById[entityId];
  },
  subscribeEntityRegistryEntry: (entityId, listener) =>
    subscribeHomeAssistantEntityRegistryEntry(entityId, listener),
  getConfig: () => getStableHomeAssistantConfigSnapshot(),
  subscribeConfig: (listener) => subscribeHomeAssistantEvent('config', listener),
};

export function resetHomeAssistantEntityRuntimeServiceCachesForTests() {
  cachedSourceEntities = undefined;
  cachedSourceEntityCount = 0;
  cachedPlatformEntities = null;
  cachedSourceRegistry = null;
  cachedSourceDeviceRegistry = null;
  cachedPlatformRegistry = [];
  cachedPlatformRegistryById = {};
  cachedSourceConfig = null;
  cachedPlatformConfig = null;
}
