import { describe, expect, it } from 'vitest';
import { buildHomeyProviderRooms, mapHomeySnapshotToNavetEntities } from './homey-mappers';
import type { HomeySnapshot } from './homey-types';

function createSnapshot(zoneName: string): HomeySnapshot {
  return {
    connected: true,
    zones: {
      zone_kitchen: {
        id: 'zone_kitchen',
        name: zoneName,
      },
      zone_empty: {
        id: 'zone_empty',
        name: 'Empty room',
      },
    },
    devices: {
      kitchen_light: {
        id: 'kitchen_light',
        name: 'Kitchen light',
        class: 'light',
        zone: 'zone_kitchen',
        capabilities: ['onoff'],
        capabilitiesObj: {
          onoff: { value: true },
        },
      },
      loose_switch: {
        id: 'loose_switch',
        name: 'Loose switch',
        class: 'socket',
        capabilities: ['onoff'],
        capabilitiesObj: {
          onoff: { value: false },
        },
      },
    },
  };
}

describe('homey-mappers room identity', () => {
  it('retains device names for temperature, humidity and other measurement entities', () => {
    const snapshot = createSnapshot('Kitchen');
    snapshot.devices.loose_switch.name = 'Freezer probe';
    snapshot.devices.loose_switch.capabilitiesObj = {
      measure_temperature: { value: -8.5, title: 'Temperature', units: '°C' },
      measure_humidity: { value: 45, title: 'Humidity', units: '%' },
      measure_power: { value: 20, title: 'Power', units: 'W' },
    };
    const entities = mapHomeySnapshotToNavetEntities(snapshot);
    expect(
      entities.find(({ externalId }) => externalId === 'loose_switch#measure_temperature')
    ).toMatchObject({ name: 'Freezer probe · Temperature', primaryState: -8.5 });
    expect(
      entities.find(({ externalId }) => externalId === 'loose_switch#measure_humidity')
    ).toMatchObject({ name: 'Freezer probe · Humidity' });
    expect(
      entities.find(({ externalId }) => externalId === 'loose_switch#measure_power')
    ).toMatchObject({ name: 'Freezer probe · Power' });
    snapshot.devices.loose_switch.name = 'Garage freezer';
    expect(
      mapHomeySnapshotToNavetEntities(snapshot).find(
        ({ externalId }) => externalId === 'loose_switch#measure_temperature'
      )
    ).toMatchObject({ name: 'Garage freezer · Temperature' });
  });
  it.each([
    ['alarm_contact', 'opening', 'opening', 'warning'],
    ['alarm_motion', 'motion', 'motion', 'active'],
    ['alarm_occupancy', 'occupancy', 'occupancy', 'active'],
    ['alarm_presence', 'presence', 'presence', 'active'],
    ['alarm_smoke', 'smoke', 'smoke', 'critical'],
    ['alarm_co', 'carbonMonoxide', 'carbon_monoxide', 'critical'],
    ['alarm_gas', 'gas', 'gas', 'critical'],
    ['alarm_water', 'waterLeak', 'moisture', 'warning'],
    ['alarm_heat', 'safety', 'safety', 'critical'],
    ['alarm_tamper', 'tamper', 'tamper', 'warning'],
    ['alarm_vibration', 'vibration', 'vibration', 'active'],
    ['alarm_sound', 'sound', 'sound', 'active'],
    ['alarm_battery', 'battery', 'battery', 'warning'],
    ['alarm_generic', 'problem', 'problem', 'warning'],
    ['alarm_contact.front', 'opening', 'opening', 'warning'],
    ['alarm_custom', 'problem', 'problem', 'warning'],
  ])(
    'maps %s to a security reading with active, clear and unknown states',
    (capabilityId, securityKind, deviceClass, securitySeverity) => {
      const snapshot = createSnapshot('Kitchen');
      const device = snapshot.devices.loose_switch;
      device.capabilitiesObj = { [capabilityId]: { value: true, type: 'boolean', title: 'Alarm' } };
      const reading = () =>
        mapHomeySnapshotToNavetEntities(snapshot).find(
          (entity) => entity.externalId === `loose_switch#${capabilityId}`
        );
      expect(reading()).toMatchObject({
        type: 'binary_sensor',
        name: securityKind === 'battery' ? 'Loose switch · Battery' : 'Loose switch · Alarm',
        primaryState: true,
        attributes: { securityKind, deviceClass, securitySeverity, status: 'active' },
      });
      device.capabilitiesObj[capabilityId].value = false;
      expect(reading()).toMatchObject({
        primaryState: false,
        attributes: { securitySeverity: 'normal', status: 'inactive' },
      });
      device.capabilitiesObj[capabilityId].value = null;
      expect(reading()).toMatchObject({
        primaryState: null,
        attributes: { securitySeverity: 'unknown', status: 'unavailable' },
      });
      device.capabilitiesObj[capabilityId].value = true;
      device.available = false;
      expect(reading()).toMatchObject({
        availability: 'unavailable',
        attributes: { securitySeverity: 'unknown', status: 'unavailable' },
      });
    }
  );

  it.each([
    [15, 'warning'],
    [92, 'normal'],
    [null, 'unknown'],
  ])('includes battery level %s in Security with severity %s', (value, securitySeverity) => {
    const snapshot = createSnapshot('Kitchen');
    snapshot.devices.loose_switch.capabilitiesObj = {
      measure_battery: { value, units: '%', title: 'Battery' },
    };
    expect(
      mapHomeySnapshotToNavetEntities(snapshot).find(
        (entity) => entity.externalId === 'loose_switch#measure_battery'
      )
    ).toMatchObject({
      attributes: { securityKind: 'battery', securitySeverity, deviceClass: 'battery' },
    });
  });

  it('attaches electrical readings to a socket card, including zero readings while off', () => {
    const snapshot = createSnapshot('Kitchen');
    snapshot.devices.loose_switch.capabilitiesObj = {
      onoff: { value: false },
      measure_power: { value: 0, units: 'W' },
      measure_voltage: { value: 230.1, units: 'V' },
      measure_current: { value: 0, units: 'A' },
      meter_power: { value: 12.45, units: 'kWh', title: 'Energy' },
    };
    const entities = mapHomeySnapshotToNavetEntities(snapshot);
    expect(entities.find((entity) => entity.externalId === 'loose_switch')).toMatchObject({
      type: 'switch',
      attributes: {
        on: false,
        metrics: [
          { label: 'Power', value: 0, unit: 'W', icon: 'zap', category: 'measurement' },
          { label: 'Voltage', value: 230.1, unit: 'V', icon: 'gauge', category: 'measurement' },
          { label: 'Current', value: 0, unit: 'A', icon: 'activity', category: 'measurement' },
          { label: 'Energy', value: 12.45, unit: 'kWh', icon: 'activity', category: 'measurement' },
        ],
      },
    });
    expect(
      entities.find((entity) => entity.externalId === 'loose_switch#meter_power')
    ).toMatchObject({
      type: 'sensor',
      primaryState: 12.45,
      attributes: { unit: 'kWh', deviceClass: 'energy' },
    });
  });

  it('normalizes electrical units and omits unavailable measurement values', () => {
    const snapshot = createSnapshot('Kitchen');
    snapshot.devices.loose_switch.capabilitiesObj = {
      onoff: { value: true },
      measure_power: { value: 1.5, units: 'kW' },
      measure_voltage: { value: null, units: 'V' },
      measure_current: { value: Number.NaN, units: 'A' },
      meter_power: { value: 1250, units: 'Wh' },
    };
    const metrics = mapHomeySnapshotToNavetEntities(snapshot).find(
      (entity) => entity.externalId === 'loose_switch'
    )?.attributes.metrics;
    expect(metrics).toEqual([
      expect.objectContaining({ label: 'Power', value: 1500, unit: 'W' }),
      expect.objectContaining({ label: 'Energy', value: 1.25, unit: 'kWh' }),
    ]);
    snapshot.devices.loose_switch.capabilitiesObj = { onoff: { value: false } };
    expect(
      mapHomeySnapshotToNavetEntities(snapshot).find(
        (entity) => entity.externalId === 'loose_switch'
      )?.attributes.metrics
    ).toEqual([]);
  });

  it('keeps zone identity and direct membership while normalizing parent references', () => {
    const snapshot = createSnapshot('Hall');
    snapshot.zones = {
      ...snapshot.zones,
      zone_kitchen: { id: 'zone_kitchen', name: 'Hall', parent: 'upstairs' },
      upstairs: { id: 'upstairs', name: 'Upstairs' },
      downstairs: { id: 'downstairs', name: 'Downstairs' },
      other_hall: { id: 'other_hall', name: 'Hall', parent: 'downstairs' },
      orphan: { id: 'orphan', name: 'Orphan', parent: 'missing' },
      self: { id: 'self', name: 'Self', parent: 'self' },
      cycle_a: { id: 'cycle_a', name: 'Cycle A', parent: 'cycle_b' },
      cycle_b: { id: 'cycle_b', name: 'Cycle B', parent: 'cycle_a' },
    };
    const rooms = new Map(buildHomeyProviderRooms(snapshot).map((room) => [room.externalId, room]));

    expect(rooms.get('zone_kitchen')).toMatchObject({
      name: 'Hall',
      parentCanonicalId: 'homey:upstairs',
      memberIds: ['homey:kitchen_light'],
    });
    expect(rooms.get('other_hall')).toMatchObject({
      name: 'Hall',
      parentCanonicalId: 'homey:downstairs',
    });
    expect(rooms.get('upstairs')?.memberIds).toEqual([]);
    for (const id of ['orphan', 'self', 'cycle_a', 'cycle_b']) {
      expect(rooms.get(id)?.parentCanonicalId).toBeUndefined();
    }
  });

  it('keeps membership stable when a zone display name changes', () => {
    const snapshot = createSnapshot('Cooking space');
    const entities = mapHomeySnapshotToNavetEntities(snapshot);
    const rooms = buildHomeyProviderRooms(snapshot);

    expect(entities.find((entity) => entity.externalId === 'kitchen_light')).toEqual(
      expect.objectContaining({
        room: 'Cooking space',
        roomId: 'homey:zone_kitchen',
      })
    );
    expect(entities.find((entity) => entity.externalId === 'loose_switch')).toEqual(
      expect.objectContaining({
        room: 'Unassigned',
        roomId: undefined,
      })
    );
    expect(rooms).toEqual([
      expect.objectContaining({
        canonicalId: 'homey:zone_kitchen',
        name: 'Cooking space',
        memberIds: ['homey:kitchen_light'],
        sourceType: 'provider_managed',
        supportsOrdering: true,
        supportsDeletion: false,
      }),
      expect.objectContaining({
        canonicalId: 'homey:zone_empty',
        name: 'Empty room',
        memberIds: [],
        sourceType: 'provider_managed',
        supportsOrdering: true,
        supportsDeletion: false,
      }),
    ]);
  });
});
