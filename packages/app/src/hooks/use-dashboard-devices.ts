import { useMemo } from 'react';
import type { BaseDevice, DeviceCollection } from '../types/device.types';
import { ensureCanonicalEntityId } from '../utils/provider-entity-id';

const EMPTY_DEVICES: [] = [];
const ABSORBING_PARENT_KEYS = [
  'lights',
  'fans',
  'climate',
  'hvac',
  'media',
  'switches',
  'covers',
  'locks',
  'persons',
  'vacuums',
  'cameras',
] as const;
const ABSORBABLE_CHILD_KEYS = ['helpers', 'sensors'] as const;

interface DashboardVisibilityResult {
  absorbedEntityIds: string[];
  availableDevices: DeviceCollection;
  visibleDevices: DeviceCollection;
}

function readSecurityCameraGroupKey(camera: DeviceCollection['cameras'][number]) {
  if (camera.providerId && camera.sourceDeviceId) {
    return `${camera.providerId}:${camera.sourceDeviceId}`;
  }

  const nativeId = typeof camera.nativeId === 'string' ? camera.nativeId : camera.id;
  const normalizedBaseId = nativeId.toLowerCase().replace(/(?:[_-]\d+)+$/, '');
  return `${camera.providerId ?? ''}:${normalizedBaseId}:${camera.room.toLowerCase()}:${camera.name.toLowerCase()}`;
}

type DashboardEntityIdentity = Pick<BaseDevice, 'id' | 'nativeId' | 'canonicalId'>;

export function isDashboardEntityHidden(
  device: DashboardEntityIdentity,
  hiddenIds: ReadonlySet<string>
): boolean {
  const identityIds = [device.id, device.canonicalId, device.nativeId];

  return identityIds.some(
    (identityId) =>
      typeof identityId === 'string' &&
      (hiddenIds.has(identityId) || hiddenIds.has(ensureCanonicalEntityId(identityId)))
  );
}

function filterVisibleDevices<T extends DashboardEntityIdentity>(
  devices: T[],
  hiddenIds: Set<string>
): T[] {
  if (devices.length === 0 || hiddenIds.size === 0) {
    return devices;
  }

  const visibleDevices = devices.filter((device) => !isDashboardEntityHidden(device, hiddenIds));
  return visibleDevices.length === devices.length ? devices : visibleDevices;
}

function filterVisibleSensors<T extends DashboardEntityIdentity>(
  devices: T[],
  hiddenIds: Set<string>,
  shownSensorIds: Set<string>
): T[] {
  if (devices.length === 0) {
    return devices;
  }

  if (shownSensorIds.size === 0) {
    return EMPTY_DEVICES;
  }

  const visibleSensors = devices.filter(
    (device) => shownSensorIds.has(device.id) && !isDashboardEntityHidden(device, hiddenIds)
  );
  return visibleSensors.length === devices.length ? devices : visibleSensors;
}

function collectVisibleParentDeviceIds(
  devices: DeviceCollection,
  hiddenIds: Set<string>
): Set<string> {
  const parentDeviceIds = new Set<string>();

  for (const key of ABSORBING_PARENT_KEYS) {
    for (const device of devices[key]) {
      if (
        isDashboardEntityHidden(device, hiddenIds) ||
        typeof device.underlyingDeviceId !== 'string'
      ) {
        continue;
      }

      parentDeviceIds.add(device.underlyingDeviceId);
    }
  }

  return parentDeviceIds;
}

function isAbsorbableSecurityChild(
  device: Pick<BaseDevice, 'id' | 'securityKind' | 'underlyingDeviceId'>
) {
  return (
    typeof device.securityKind === 'string' &&
    typeof device.underlyingDeviceId === 'string' &&
    device.underlyingDeviceId.length > 0
  );
}

function isAlwaysAbsorbedSecurityHelper(
  device: Pick<BaseDevice, 'securityKind'>,
  collectionKey: (typeof ABSORBABLE_CHILD_KEYS)[number]
) {
  return (
    collectionKey === 'helpers' &&
    (device.securityKind === 'button' || device.securityKind === 'event')
  );
}

function filterAbsorbedDevices<T extends { id: string }>(
  devices: T[],
  absorbedIds: Set<string>
): T[] {
  if (devices.length === 0 || absorbedIds.size === 0) {
    return devices;
  }

  const nextDevices = devices.filter((device) => !absorbedIds.has(device.id));
  return nextDevices.length === devices.length ? devices : nextDevices;
}

export function getExpandedHiddenDashboardEntityIds(
  devices: Pick<DeviceCollection, 'cameras'>,
  hiddenEntityIds: string[]
): string[] {
  if (hiddenEntityIds.length === 0 || devices.cameras.length < 2) {
    return hiddenEntityIds;
  }

  const hiddenIds = new Set(hiddenEntityIds);
  const hiddenCameraGroupKeys = new Set(
    devices.cameras
      .filter((camera) => isDashboardEntityHidden(camera, hiddenIds))
      .map((camera) => readSecurityCameraGroupKey(camera))
  );

  if (hiddenCameraGroupKeys.size === 0) {
    return hiddenEntityIds;
  }

  for (const camera of devices.cameras) {
    if (hiddenCameraGroupKeys.has(readSecurityCameraGroupKey(camera))) {
      hiddenIds.add(camera.id);
    }
  }

  return hiddenIds.size === hiddenEntityIds.length ? hiddenEntityIds : [...hiddenIds];
}

export function getAbsorbedDashboardEntityIds(
  devices: DeviceCollection,
  hiddenEntityIds: string[]
): string[] {
  const hiddenIds = new Set(getExpandedHiddenDashboardEntityIds(devices, hiddenEntityIds));
  const visibleParentDeviceIds = collectVisibleParentDeviceIds(devices, hiddenIds);
  const absorbedEntityIds: string[] = [];

  for (const key of ABSORBABLE_CHILD_KEYS) {
    for (const device of devices[key]) {
      if (isAlwaysAbsorbedSecurityHelper(device, key)) {
        absorbedEntityIds.push(device.id);
        continue;
      }

      if (
        isAbsorbableSecurityChild(device) &&
        typeof device.underlyingDeviceId === 'string' &&
        visibleParentDeviceIds.has(device.underlyingDeviceId)
      ) {
        absorbedEntityIds.push(device.id);
      }
    }
  }

  return absorbedEntityIds.length > 0 ? absorbedEntityIds : EMPTY_DEVICES;
}

export function buildDashboardVisibilityResult(
  devices: DeviceCollection,
  hiddenEntityIds: string[],
  shownSensorEntityIds: string[] = []
): DashboardVisibilityResult {
  const expandedHiddenEntityIds = getExpandedHiddenDashboardEntityIds(devices, hiddenEntityIds);
  const hiddenIds = new Set(expandedHiddenEntityIds);
  const shownSensorIds = new Set(shownSensorEntityIds);
  const absorbedEntityIds = getAbsorbedDashboardEntityIds(devices, expandedHiddenEntityIds);
  const absorbedIds = new Set(absorbedEntityIds);

  const visibleDevices: DeviceCollection = {
    lights: filterVisibleDevices(devices.lights, hiddenIds),
    fans: filterVisibleDevices(devices.fans, hiddenIds),
    climate: filterVisibleDevices(devices.climate, hiddenIds),
    hvac: filterVisibleDevices(devices.hvac, hiddenIds),
    media: filterVisibleDevices(devices.media, hiddenIds),
    weather: filterVisibleDevices(devices.weather, hiddenIds),
    switches: filterVisibleDevices(devices.switches, hiddenIds),
    timers: filterVisibleDevices(devices.timers, hiddenIds),
    counters: filterVisibleDevices(devices.counters, hiddenIds),
    valves: filterVisibleDevices(devices.valves, hiddenIds),
    remotes: filterVisibleDevices(devices.remotes, hiddenIds),
    helpers: filterAbsorbedDevices(filterVisibleDevices(devices.helpers, hiddenIds), absorbedIds),
    covers: filterVisibleDevices(devices.covers, hiddenIds),
    locks: filterVisibleDevices(devices.locks, hiddenIds),
    scenes: filterVisibleDevices(devices.scenes, hiddenIds),
    persons: filterVisibleDevices(devices.persons, hiddenIds),
    sensors: filterAbsorbedDevices(
      filterVisibleSensors(devices.sensors, hiddenIds, shownSensorIds),
      absorbedIds
    ),
    vacuums: filterVisibleDevices(devices.vacuums, hiddenIds),
    calendars: filterVisibleDevices(devices.calendars, hiddenIds),
    cameras: filterVisibleDevices(devices.cameras, hiddenIds),
    'grouped-sensors': filterVisibleDevices(devices['grouped-sensors'], hiddenIds),
  };

  const availableDevices: DeviceCollection =
    absorbedIds.size === 0
      ? devices
      : {
          ...devices,
          helpers: filterAbsorbedDevices(devices.helpers, absorbedIds),
          sensors: filterAbsorbedDevices(devices.sensors, absorbedIds),
        };

  return {
    absorbedEntityIds,
    availableDevices,
    visibleDevices,
  };
}

export const useDashboardDevices = (
  devices: DeviceCollection,
  hiddenEntityIds: string[],
  shownSensorEntityIds: string[] = []
): DeviceCollection => {
  return useMemo(() => {
    const { visibleDevices } = buildDashboardVisibilityResult(
      devices,
      hiddenEntityIds,
      shownSensorEntityIds
    );

    const unchanged =
      visibleDevices.lights === devices.lights &&
      visibleDevices.fans === devices.fans &&
      visibleDevices.climate === devices.climate &&
      visibleDevices.hvac === devices.hvac &&
      visibleDevices.media === devices.media &&
      visibleDevices.weather === devices.weather &&
      visibleDevices.switches === devices.switches &&
      visibleDevices.helpers === devices.helpers &&
      visibleDevices.timers === devices.timers &&
      visibleDevices.counters === devices.counters &&
      visibleDevices.valves === devices.valves &&
      visibleDevices.remotes === devices.remotes &&
      visibleDevices.covers === devices.covers &&
      visibleDevices.locks === devices.locks &&
      visibleDevices.scenes === devices.scenes &&
      visibleDevices.persons === devices.persons &&
      visibleDevices.sensors === devices.sensors &&
      visibleDevices.vacuums === devices.vacuums &&
      visibleDevices.calendars === devices.calendars &&
      visibleDevices.cameras === devices.cameras &&
      visibleDevices['grouped-sensors'] === devices['grouped-sensors'];

    return unchanged ? devices : visibleDevices;
  }, [devices, hiddenEntityIds, shownSensorEntityIds]);
};
