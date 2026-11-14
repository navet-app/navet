export { normalizeTemperatureUnit } from '@navet/core/temperature';
export { normalizeVacuumStatus } from '@navet/core/vacuum-status';

import type {
  HomeAssistantAreaRegistryEntry,
  HomeAssistantDeviceRegistryEntry,
  HomeAssistantEntityRegistryEntry,
} from './homeassistant-service-bridge';

const MEDIA_PLAYER_FEATURES = {
  PAUSE: 1,
  VOLUME_SET: 4,
  VOLUME_MUTE: 8,
  PREVIOUS_TRACK: 16,
  NEXT_TRACK: 32,
  TURN_ON: 128,
  TURN_OFF: 256,
  PLAY_MEDIA: 512,
  PLAY: 16384,
  SHUFFLE_SET: 32768,
  SELECT_SOURCE: 2048,
  SELECT_SOUND_MODE: 65536,
  BROWSE_MEDIA: 131072,
  REPEAT_SET: 262144,
  GROUPING: 524288,
} as const;

export const UNKNOWN_ROOM_LABEL = 'Unassigned';

export interface HADeviceRegistryMaps {
  areaMap: Map<string, string>;
  deviceRegistryMap: Map<string, HomeAssistantDeviceRegistryEntry>;
  entityRegistryMap: Map<string, HomeAssistantEntityRegistryEntry>;
}

interface NamedEntityLike {
  entity_id?: string;
  entityId?: string;
  attributes?: Record<string, unknown>;
}

export function getEntityCategory(
  entityEntry: { entity_category?: unknown } | undefined
): 'config' | 'diagnostic' | null {
  const raw = entityEntry?.entity_category;
  return raw === 'config' || raw === 'diagnostic' ? raw : null;
}

export function createRegistryMaps(
  areas: HomeAssistantAreaRegistryEntry[],
  deviceRegistry: HomeAssistantDeviceRegistryEntry[],
  entityRegistry: HomeAssistantEntityRegistryEntry[]
): HADeviceRegistryMaps {
  return {
    areaMap: new Map(areas.map((area) => [area.area_id, area.name])),
    entityRegistryMap: new Map(
      entityRegistry.map((registryEntry) => [registryEntry.entity_id, registryEntry])
    ),
    deviceRegistryMap: new Map(deviceRegistry.map((device) => [device.id, device])),
  };
}

function readRegistryName(registryEntry?: {
  name?: string | null;
  name_by_user?: string | null;
  original_name?: string | null;
  originalName?: string | null;
}) {
  for (const candidate of [
    registryEntry?.name_by_user,
    registryEntry?.name,
    registryEntry?.original_name,
    registryEntry?.originalName,
  ]) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
}

function readNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function getName(
  entity: NamedEntityLike,
  registryEntry?: {
    name?: string | null;
    name_by_user?: string | null;
    original_name?: string | null;
    originalName?: string | null;
    next_name_part?: string | null;
  },
  device?: HomeAssistantDeviceRegistryEntry,
  parent?: HomeAssistantDeviceRegistryEntry
): string {
  const registryName = readRegistryName(registryEntry);
  if (registryEntry?.next_name_part === 'device') {
    const deviceName = readRegistryName(device);
    const parentName =
      device?.next_name_part === 'parent_device' ? readRegistryName(parent) : undefined;
    const composedName = [parentName, deviceName, registryName].filter(Boolean).join(' ');
    if (composedName) return composedName;
  }
  if (registryName) {
    return registryName;
  }

  return (
    readNonEmptyString(entity.attributes?.friendly_name) ||
    entity.entity_id ||
    entity.entityId ||
    'Unknown'
  );
}

export function resolveDeviceAreaId(
  device: HomeAssistantDeviceRegistryEntry | undefined,
  parent: HomeAssistantDeviceRegistryEntry | undefined
) {
  return device?.area_id ?? parent?.area_id ?? undefined;
}

export function resolveEntityRoom(entity: NamedEntityLike, areaName: string | undefined): string {
  return (
    areaName ||
    (typeof entity.attributes?.room === 'string' ? entity.attributes.room : null) ||
    (typeof entity.attributes?.area === 'string' ? entity.attributes.area : null) ||
    (typeof entity.attributes?.zone === 'string' ? entity.attributes.zone : null) ||
    UNKNOWN_ROOM_LABEL
  );
}

function hasMediaPlayerFeature(supportedFeatures: number, feature: number): boolean {
  return (supportedFeatures & feature) === feature;
}

export function getMediaPlayerCapabilities(supportedFeatures: number) {
  return {
    canBrowseMedia: hasMediaPlayerFeature(supportedFeatures, MEDIA_PLAYER_FEATURES.BROWSE_MEDIA),
    canGroup: hasMediaPlayerFeature(supportedFeatures, MEDIA_PLAYER_FEATURES.GROUPING),
    canMuteVolume: hasMediaPlayerFeature(supportedFeatures, MEDIA_PLAYER_FEATURES.VOLUME_MUTE),
    canNextTrack: hasMediaPlayerFeature(supportedFeatures, MEDIA_PLAYER_FEATURES.NEXT_TRACK),
    canPause: hasMediaPlayerFeature(supportedFeatures, MEDIA_PLAYER_FEATURES.PAUSE),
    canPlay: hasMediaPlayerFeature(supportedFeatures, MEDIA_PLAYER_FEATURES.PLAY),
    canPlayMedia: hasMediaPlayerFeature(supportedFeatures, MEDIA_PLAYER_FEATURES.PLAY_MEDIA),
    canPreviousTrack: hasMediaPlayerFeature(
      supportedFeatures,
      MEDIA_PLAYER_FEATURES.PREVIOUS_TRACK
    ),
    canRepeat: hasMediaPlayerFeature(supportedFeatures, MEDIA_PLAYER_FEATURES.REPEAT_SET),
    canSelectSoundMode: hasMediaPlayerFeature(
      supportedFeatures,
      MEDIA_PLAYER_FEATURES.SELECT_SOUND_MODE
    ),
    canSelectSource: hasMediaPlayerFeature(supportedFeatures, MEDIA_PLAYER_FEATURES.SELECT_SOURCE),
    canSetVolume: hasMediaPlayerFeature(supportedFeatures, MEDIA_PLAYER_FEATURES.VOLUME_SET),
    canShuffle: hasMediaPlayerFeature(supportedFeatures, MEDIA_PLAYER_FEATURES.SHUFFLE_SET),
    canTurnOff: hasMediaPlayerFeature(supportedFeatures, MEDIA_PLAYER_FEATURES.TURN_OFF),
    canTurnOn: hasMediaPlayerFeature(supportedFeatures, MEDIA_PLAYER_FEATURES.TURN_ON),
  };
}
