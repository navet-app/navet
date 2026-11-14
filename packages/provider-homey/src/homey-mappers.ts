import { createProviderScopedId } from '@navet/core/ids';
import type { NavetEntity, NavetProviderRoom } from '@navet/core/types';
import { getHomeyDeviceProfile } from './homey-device-profiles';
import { getHomeySensorName, getHomeySensorState } from './homey-sensor-state';
import type { HomeyDevice, HomeySnapshot, HomeyZone } from './homey-types';

const UNKNOWN_ROOM_LABEL = 'Unassigned';

function normalizeRoomName(name: string) {
  return name.trim().toLocaleLowerCase();
}

function createNavetEntity(
  nativeId: string,
  type: NavetEntity['type'],
  name: string,
  room: string,
  roomId: string | undefined,
  capabilities: NavetEntity['capabilities'],
  state: Record<string, unknown>
): NavetEntity {
  const canonicalId = createProviderScopedId('homey', nativeId);

  return {
    id: canonicalId,
    canonicalId,
    providerId: 'homey',
    externalId: nativeId,
    type,
    name,
    room,
    roomId,
    primaryState:
      typeof state.value === 'string' ||
      typeof state.value === 'number' ||
      typeof state.value === 'boolean'
        ? state.value
        : null,
    availability: state.available === false ? 'unavailable' : 'available',
    attributes: state,
    capabilities,
    lastUpdated: typeof state.lastUpdated === 'string' ? state.lastUpdated : undefined,
  };
}

function getCapabilityState(device: HomeyDevice, capabilityId: string) {
  return device.capabilitiesObj?.[capabilityId];
}

function resolveHomeyRoom(device: HomeyDevice, zones: Record<string, HomeyZone>) {
  const zoneId = typeof device.zone === 'string' && device.zone.length > 0 ? device.zone : null;
  return {
    name: zoneId ? (zones[zoneId]?.name ?? UNKNOWN_ROOM_LABEL) : UNKNOWN_ROOM_LABEL,
    roomId: zoneId ? createProviderScopedId('homey', zoneId) : undefined,
  };
}

function createHomeyState(device: HomeyDevice): Record<string, unknown> {
  return {
    available: device.available ?? true,
    on: getCapabilityState(device, 'onoff')?.value,
    dim: getCapabilityState(device, 'dim')?.value,
    lightTemperature: getCapabilityState(device, 'light_temperature')?.value,
  };
}

const switchMeasurements = [
  {
    id: 'measure_power',
    label: 'Power',
    unit: 'W',
    icon: 'zap',
    scales: { kW: 1000, MW: 1_000_000 },
  },
  {
    id: 'measure_voltage',
    label: 'Voltage',
    unit: 'V',
    icon: 'gauge',
    scales: { mV: 0.001, kV: 1000 },
  },
  {
    id: 'measure_current',
    label: 'Current',
    unit: 'A',
    icon: 'activity',
    scales: { mA: 0.001, kA: 1000 },
  },
  {
    id: 'meter_power',
    label: 'Energy',
    unit: 'kWh',
    icon: 'activity',
    scales: { Wh: 0.001, MWh: 1000 },
  },
] as const;

function getHomeySwitchMetrics(device: HomeyDevice) {
  return switchMeasurements.flatMap(({ id, label, unit, icon, scales }) => {
    const capability = getCapabilityState(device, id);
    if (typeof capability?.value !== 'number' || !Number.isFinite(capability.value)) return [];
    const scale = (scales as Record<string, number>)[capability.units ?? ''] ?? 1;
    return [
      { label, value: capability.value * scale, unit, icon, category: 'measurement' as const },
    ];
  });
}

function inferHomeyCapabilities(device: HomeyDevice): NavetEntity['capabilities'] {
  const capabilities: NavetEntity['capabilities'] = [];
  const capabilityIds = new Set(device.capabilities ?? Object.keys(device.capabilitiesObj ?? {}));

  if (capabilityIds.has('onoff')) {
    capabilities.push('toggle');
  }
  if (capabilityIds.has('dim')) {
    capabilities.push(device.class === 'fan' ? 'fan_speed' : 'brightness');
  }
  if (capabilityIds.has('light_temperature')) {
    capabilities.push('color_temperature');
  }
  if (capabilityIds.has('locked') && device.capabilitiesObj?.locked?.setable === true) {
    capabilities.push('lock');
  }
  if (
    capabilityIds.has('windowcoverings_set') &&
    device.capabilitiesObj?.windowcoverings_set?.setable === true
  ) {
    capabilities.push('position');
  }

  if (
    Array.from(capabilityIds).some(
      (capabilityId) => capabilityId.startsWith('measure_') || capabilityId.startsWith('meter_')
    )
  ) {
    capabilities.push('numeric_sensor');
  }

  return capabilities;
}

export function mapHomeySnapshotToNavetEntities(snapshot: HomeySnapshot): NavetEntity[] {
  const entities: NavetEntity[] = [];

  for (const device of Object.values(snapshot.devices)) {
    const room = resolveHomeyRoom(device, snapshot.zones);
    const capabilities = inferHomeyCapabilities(device);
    const baseState = createHomeyState(device);

    const profile = getHomeyDeviceProfile(device);
    if (profile) {
      entities.push(
        createNavetEntity(
          device.id,
          profile.type,
          device.name,
          room.name,
          room.roomId,
          [
            ...capabilities,
            ...(profile.type === 'climate'
              ? (['temperature_setpoint'] as const)
              : profile.type === 'media_player'
                ? (['media_playback'] as const)
                : []),
          ],
          { ...baseState, ...profile.state }
        )
      );
    } else if (device.class === 'light') {
      entities.push(
        createNavetEntity(
          device.id,
          'light',
          device.name,
          room.name,
          room.roomId,
          capabilities,
          baseState
        )
      );
    } else if (device.class === 'fan') {
      entities.push(
        createNavetEntity(
          device.id,
          'fan',
          device.name,
          room.name,
          room.roomId,
          capabilities,
          baseState
        )
      );
    } else if (capabilities.includes('toggle')) {
      entities.push(
        createNavetEntity(device.id, 'switch', device.name, room.name, room.roomId, capabilities, {
          ...baseState,
          metrics: getHomeySwitchMetrics(device),
        })
      );
    }

    for (const [capabilityId, capability] of Object.entries(device.capabilitiesObj ?? {})) {
      if (
        !capabilityId.startsWith('measure_') &&
        !capabilityId.startsWith('meter_') &&
        !capabilityId.startsWith('alarm_')
      ) {
        continue;
      }

      const nativeId = `${device.id}#${capabilityId}`;
      const sensorState = getHomeySensorState(device, capabilityId, capability);
      entities.push(
        createNavetEntity(
          nativeId,
          capabilityId.startsWith('alarm_') ? 'binary_sensor' : 'sensor',
          getHomeySensorName(device, capabilityId, capability),
          room.name,
          room.roomId,
          ['numeric_sensor'],
          sensorState
        )
      );
    }
  }

  for (const [kind, flows] of [
    ['flow', snapshot.flows],
    ['advancedflow', snapshot.advancedFlows],
  ] as const) {
    for (const flow of Object.values(flows ?? {})) {
      if (flow.triggerable !== true || flow.enabled === false) continue;
      entities.push(
        createNavetEntity(
          `${kind}/${flow.id}`,
          'scene',
          flow.name,
          UNKNOWN_ROOM_LABEL,
          undefined,
          [],
          { value: null, available: true }
        )
      );
    }
  }
  for (const mood of Object.values(snapshot.moods ?? {})) {
    entities.push(
      createNavetEntity(
        `mood/${mood.id}`,
        'scene',
        mood.name,
        snapshot.zones[mood.zone ?? '']?.name || UNKNOWN_ROOM_LABEL,
        mood.zone ? createProviderScopedId('homey', mood.zone) : undefined,
        [],
        { value: null, available: true }
      )
    );
  }
  for (const user of Object.values({
    ...(snapshot.users ?? {}),
    ...(snapshot.me ? { [snapshot.me.id]: snapshot.me } : {}),
  })) {
    entities.push(
      createNavetEntity(
        `person/${user.id}`,
        'person',
        user.name || user.id,
        UNKNOWN_ROOM_LABEL,
        undefined,
        ['presence'],
        {
          value:
            user.present === null || user.present === undefined
              ? 'unknown'
              : user.present
                ? 'home'
                : 'away',
          asleep: user.asleep,
          location: user.present ? 'Home' : 'Away',
        }
      )
    );
  }
  return entities;
}

export function buildHomeyProviderRooms(snapshot: HomeySnapshot): NavetProviderRoom[] {
  const mappedEntities = mapHomeySnapshotToNavetEntities(snapshot);
  const memberIdsByRoomId = new Map<string, string[]>();
  for (const entity of mappedEntities) {
    if (!entity.roomId) {
      continue;
    }
    const members = memberIdsByRoomId.get(entity.roomId);
    if (members) {
      members.push(entity.canonicalId);
    } else {
      memberIdsByRoomId.set(entity.roomId, [entity.canonicalId]);
    }
  }

  const zones = Object.values(snapshot.zones);
  const zonesById = new Map(zones.map((zone) => [zone.id, zone]));
  return zones
    .map((zone) => {
      const visited = new Set([zone.id]);
      let ancestor = zone.parent;
      let validParent = Boolean(ancestor);
      while (ancestor) {
        const ancestorZone = zonesById.get(ancestor);
        if (!ancestorZone || visited.has(ancestor)) {
          validParent = false;
          break;
        }
        visited.add(ancestor);
        ancestor = ancestorZone.parent;
      }
      const canonicalId = createProviderScopedId('homey', zone.id);
      return {
        id: canonicalId,
        canonicalId,
        providerId: 'homey' as const,
        externalId: zone.id,
        name: zone.name,
        normalizedName: normalizeRoomName(zone.name),
        ...(validParent && zone.parent
          ? { parentCanonicalId: createProviderScopedId('homey', zone.parent) }
          : {}),
        memberIds: memberIdsByRoomId.get(canonicalId) ?? [],
        sourceType: 'provider_managed' as const,
        supportsOrdering: true,
        supportsDeletion: false,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}
