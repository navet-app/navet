import {
  readNavetCounterState,
  readNavetRemoteState,
  readNavetTimerState,
  readNavetValveState,
} from '@navet/core/household-device-state';
import type { NavetEntity } from '@navet/core/types';
import { describe, expect, it } from 'vitest';
import { mapNavetEntitiesToDeviceCollection } from '../navet-device-collections';

function createEntity({
  canonicalId,
  externalId,
  type,
  name,
  attributes,
}: {
  canonicalId: string;
  externalId: string;
  type: NavetEntity['type'];
  name: string;
  attributes: Record<string, unknown>;
}): NavetEntity {
  return {
    id: canonicalId,
    canonicalId,
    providerId: 'home_assistant',
    externalId,
    type,
    name,
    room: 'Kitchen',
    roomId: 'home_assistant:area-kitchen',
    primaryState: attributes.value as string | number | boolean | null,
    availability: 'available',
    attributes,
    capabilities: [],
  };
}

describe('mapNavetEntitiesToDeviceCollection', () => {
  it('discovers four household control families with persisted identity and source ownership', () => {
    const entities = (['timer', 'counter', 'valve', 'remote'] as const).flatMap((type) =>
      (['home_assistant', 'homey'] as const).map((providerId) => ({
        ...createEntity({
          canonicalId: `${providerId}:${type}.household`,
          externalId: `${type}.household`,
          type,
          name: type,
          attributes: {
            phase: type === 'timer' ? 'active' : 'opening',
            value: 4,
            min: -10,
            max: 20,
            step: 2,
            initial: 0,
            position: 35,
            isOn: false,
            durationSeconds: 600,
            remainingSeconds: 600,
            finishesAt: '2026-10-11T12:10:00Z',
            deviceId: 'shared-device',
          },
        }),
        providerId,
        roomId: `${providerId}:area-kitchen`,
      }))
    );
    const collection = mapNavetEntitiesToDeviceCollection(entities);
    for (const [type, key] of [
      ['timer', 'timers'],
      ['counter', 'counters'],
      ['valve', 'valves'],
      ['remote', 'remotes'],
    ] as const) {
      expect(
        collection[key].map((item) => ({
          id: item.id,
          providerId: item.providerId,
          nativeId: item.nativeId,
          roomId: item.roomId,
        }))
      ).toEqual([
        {
          id: `home_assistant:${type}.household`,
          providerId: 'home_assistant',
          nativeId: `${type}.household`,
          roomId: 'home_assistant:area-kitchen',
        },
        {
          id: `homey:${type}.household`,
          providerId: 'homey',
          nativeId: `${type}.household`,
          roomId: 'homey:area-kitchen',
        },
      ]);
    }
    expect(readNavetTimerState(collection.timers[0].normalizedEntity)).toMatchObject({
      phase: 'active',
      durationSeconds: 600,
      canStart: false,
    });
    expect(readNavetCounterState(collection.counters[0].normalizedEntity)).toMatchObject({
      value: 4,
      min: -10,
      step: 2,
    });
    expect(readNavetValveState(collection.valves[0].normalizedEntity)).toMatchObject({
      position: 35,
      phase: 'opening',
    });
    expect(readNavetRemoteState(collection.remotes[0].normalizedEntity)).toMatchObject({
      isOn: false,
    });
    for (const key of ['timers', 'counters', 'valves', 'remotes'] as const) {
      for (const device of collection[key]) {
        expect(device.normalizedEntity).toBe(
          entities.find((entity) => entity.canonicalId === device.canonicalId)
        );
      }
    }
    expect(collection.helpers).toEqual([]);
    expect(collection.switches).toEqual([]);
  });

  it('retains a writable household helper alongside its physical device card', () => {
    const switchEntity = createEntity({
      canonicalId: 'home_assistant:switch.heater',
      externalId: 'switch.heater',
      type: 'switch',
      name: 'Heater',
      attributes: { value: 'on', deviceId: 'heater' },
    });
    const helperEntity = createEntity({
      canonicalId: 'home_assistant:number.target',
      externalId: 'number.target',
      type: 'helper',
      name: 'Target',
      attributes: {
        helperType: 'number',
        value: 20,
        writable: true,
        min: 10,
        max: 30,
        step: 0.5,
        deviceId: 'heater',
      },
    });
    helperEntity.capabilities = ['number_value'];
    const devices = mapNavetEntitiesToDeviceCollection([switchEntity, helperEntity]);
    expect(devices.switches).toHaveLength(1);
    expect(devices.helpers).toMatchObject([
      {
        id: 'home_assistant:number.target',
        nativeId: 'number.target',
        helper: { helperType: 'number', value: 20, writable: true },
      },
    ]);
  });

  it.each(['home_assistant', 'homey', 'openhab'] as const)(
    'defaults climate and speaker cards to medium for %s',
    (providerId) => {
      const entities = (['climate', 'hvac', 'media_player', 'switch', 'cover'] as const).map(
        (type) => ({
          ...createEntity({
            canonicalId: `${providerId}:${type}.living_room`,
            externalId: `${type}.living_room`,
            type,
            name: type,
            attributes: {},
          }),
          providerId,
        })
      );
      const devices = mapNavetEntitiesToDeviceCollection(entities);

      expect(devices.climate.map((device) => device.size)).toEqual(['medium', 'medium']);
      expect(devices.media[0].size).toBe('medium');
      expect(devices.switches[0].size).toBe('small');
      expect(devices.covers[0].size).toBe('small');
    }
  );

  it.each(['small', 'medium', 'large'] as const)(
    'preserves an explicit %s climate, speaker, or cover size',
    (size) => {
      const entities = (['climate', 'media_player', 'cover'] as const).map((type) =>
        createEntity({
          canonicalId: `homey:${type}.living_room`,
          externalId: `${type}.living_room`,
          type,
          name: type,
          attributes: { size },
        })
      );
      const devices = mapNavetEntitiesToDeviceCollection(entities);

      expect(devices.climate[0].size).toBe(size);
      expect(devices.media[0].size).toBe(size);
      expect(devices.covers[0].size).toBe(size);
    }
  );

  it('preserves provider-neutral electrical metrics on an off switch card', () => {
    const metrics = [
      { label: 'Power', value: 0, unit: 'W', icon: 'zap', category: 'measurement' },
      { label: 'Voltage', value: 230.1, unit: 'V', icon: 'gauge', category: 'measurement' },
      { label: 'Current', value: 0, unit: 'A', icon: 'activity', category: 'measurement' },
      { label: 'Energy', value: 12.45, unit: 'kWh', icon: 'activity', category: 'measurement' },
    ];
    const entity: NavetEntity = {
      ...createEntity({
        canonicalId: 'homey:socket',
        externalId: 'socket',
        type: 'switch',
        name: 'Coffee maker',
        attributes: { on: false, metrics },
      }),
      providerId: 'homey',
    };
    expect(mapNavetEntitiesToDeviceCollection([entity]).switches).toMatchObject([
      { id: 'homey:socket', providerId: 'homey', state: false, metrics },
    ]);
  });

  it('preserves the stable provider room identity on mapped devices', () => {
    const devices = mapNavetEntitiesToDeviceCollection([
      createEntity({
        canonicalId: 'home_assistant:light.kitchen',
        externalId: 'light.kitchen',
        type: 'light',
        name: 'Kitchen light',
        attributes: {
          value: 'on',
        },
      }),
    ]);

    expect(devices.lights[0]).toEqual(
      expect.objectContaining({
        room: 'Kitchen',
        roomId: 'home_assistant:area-kitchen',
      })
    );
  });

  it('suppresses helper and sensor cards when a device already has a primary switch card', () => {
    const devices = mapNavetEntitiesToDeviceCollection([
      createEntity({
        canonicalId: 'home_assistant:switch.kitchen_main',
        externalId: 'switch.kitchen_main',
        type: 'switch',
        name: 'Kitchen Main',
        attributes: {
          value: 'on',
          deviceId: 'device-kitchen',
        },
      }),
      createEntity({
        canonicalId: 'home_assistant:input_boolean.kitchen_timer',
        externalId: 'input_boolean.kitchen_timer',
        type: 'helper',
        name: 'Kitchen Timer',
        attributes: {
          value: 'off',
          deviceId: 'device-kitchen',
          serviceDomain: 'input_boolean',
        },
      }),
      createEntity({
        canonicalId: 'home_assistant:sensor.kitchen_power',
        externalId: 'sensor.kitchen_power',
        type: 'sensor',
        name: 'Kitchen Power',
        attributes: {
          value: '127',
          unit: 'W',
          deviceId: 'device-kitchen',
          entityType: 'power',
        },
      }),
    ]);

    expect(devices.switches.map((device) => device.id)).toEqual([
      'home_assistant:switch.kitchen_main',
    ]);
    expect(devices.helpers).toHaveLength(0);
    expect(devices.sensors).toHaveLength(0);
  });

  it.each([
    'temperature',
    'humidity',
    'air_quality',
    'carbon_dioxide',
    'pm1',
    'pm25',
    'pm10',
    'volatile_organic_compounds',
    'volatile_organic_compounds_parts',
    'pressure',
  ])('keeps a %s sensor alongside its air purifier fan', (deviceClass) => {
    const devices = mapNavetEntitiesToDeviceCollection([
      createEntity({
        canonicalId: 'home_assistant:fan.office_air_purifier',
        externalId: 'fan.office_air_purifier',
        type: 'fan',
        name: 'Office air purifier',
        attributes: { value: 'on', deviceId: 'device-air-purifier' },
      }),
      createEntity({
        canonicalId: `home_assistant:sensor.office_air_purifier_${deviceClass}`,
        externalId: `sensor.office_air_purifier_${deviceClass}`,
        type: 'sensor',
        name: `Office ${deviceClass}`,
        attributes: { value: '55', unit: '%', deviceId: 'device-air-purifier', deviceClass },
      }),
    ]);

    expect(devices.fans).toHaveLength(1);
    expect(devices.sensors).toMatchObject([{ deviceClass, value: '55' }]);
  });

  it('keeps environmental measurements beside climate controls without surfacing accessory sensors', () => {
    const climate = createEntity({
      canonicalId: 'home_assistant:climate.bedroom',
      externalId: 'climate.bedroom',
      type: 'climate',
      name: 'Bedroom thermostat',
      attributes: { value: 'heat', deviceId: 'device-thermostat' },
    });
    const sensor = (name: string, deviceClass: string, entityCategory?: string) =>
      createEntity({
        canonicalId: `home_assistant:sensor.bedroom_${name}`,
        externalId: `sensor.bedroom_${name}`,
        type: 'sensor',
        name,
        attributes: { value: '21', deviceId: 'device-thermostat', deviceClass, entityCategory },
      });
    const devices = mapNavetEntitiesToDeviceCollection([
      climate,
      sensor('temperature', 'temperature'),
      sensor('power', 'power'),
      sensor('diagnostic_humidity', 'humidity', 'diagnostic'),
    ]);

    expect(devices.climate).toHaveLength(1);
    expect(devices.sensors.map((device) => device.id)).toEqual([
      'home_assistant:sensor.bedroom_temperature',
    ]);
  });

  it('retains independent measurements alongside their device control when requested', () => {
    const devices = mapNavetEntitiesToDeviceCollection([
      createEntity({
        canonicalId: 'openhab:WasherPower',
        externalId: 'WasherPower',
        type: 'switch',
        name: 'Washing machine',
        attributes: { on: true, sourceDeviceId: 'Washer' },
      }),
      createEntity({
        canonicalId: 'openhab:WasherUsage',
        externalId: 'WasherUsage',
        type: 'sensor',
        name: 'Washing machine power',
        attributes: {
          value: 485,
          unit: 'W',
          deviceClass: 'power',
          sourceDeviceId: 'Washer',
          retainSensorCard: true,
        },
      }),
    ]);
    expect(devices.switches).toHaveLength(1);
    expect(devices.sensors).toMatchObject([{ id: 'openhab:WasherUsage', value: '485', unit: 'W' }]);
  });

  it('suppresses secondary switch cards attached to climate devices', () => {
    const devices = mapNavetEntitiesToDeviceCollection([
      createEntity({
        canonicalId: 'home_assistant:climate.hallway',
        externalId: 'climate.hallway',
        type: 'climate',
        name: 'Hallway Climate',
        attributes: {
          value: 'heat',
          deviceId: 'device-climate',
          temperature: 21,
          currentTemperature: 20,
        },
      }),
      createEntity({
        canonicalId: 'home_assistant:switch.hallway_boost',
        externalId: 'switch.hallway_boost',
        type: 'switch',
        name: 'Hallway Boost',
        attributes: {
          value: 'off',
          deviceId: 'device-climate',
        },
      }),
    ]);

    expect(devices.climate.map((device) => device.id)).toEqual(['home_assistant:climate.hallway']);
    expect(devices.switches).toHaveLength(0);
  });

  it('suppresses accessory switch cards attached to fan devices', () => {
    const devices = mapNavetEntitiesToDeviceCollection([
      createEntity({
        canonicalId: 'home_assistant:fan.xiaomi_smart_tower_fan',
        externalId: 'fan.xiaomi_smart_tower_fan',
        type: 'fan',
        name: 'Xiaomi Smart Tower Fan',
        attributes: {
          value: 'on',
          deviceId: 'device-xiaomi-fan',
          percentage: 33,
        },
      }),
      createEntity({
        canonicalId: 'home_assistant:switch.xiaomi_smart_tower_fan_physical_control_locked',
        externalId: 'switch.xiaomi_smart_tower_fan_physical_control_locked',
        type: 'switch',
        name: 'Xiaomi Smart Tower Fan Physical Control Locked',
        attributes: {
          value: 'off',
          deviceId: 'device-xiaomi-fan',
        },
      }),
    ]);

    expect(devices.fans.map((device) => device.id)).toEqual([
      'home_assistant:fan.xiaomi_smart_tower_fan',
    ]);
    expect(devices.switches).toHaveLength(0);
  });

  it('keeps only the primary switch card when a device exposes multiple switches', () => {
    const devices = mapNavetEntitiesToDeviceCollection([
      createEntity({
        canonicalId: 'home_assistant:switch.kitchen_boost',
        externalId: 'switch.kitchen_boost',
        type: 'switch',
        name: 'Kitchen Boost',
        attributes: {
          value: 'off',
          deviceId: 'device-kitchen',
        },
      }),
      createEntity({
        canonicalId: 'home_assistant:switch.kitchen_main',
        externalId: 'switch.kitchen_main',
        type: 'switch',
        name: 'Kitchen Main',
        attributes: {
          value: 'on',
          deviceId: 'device-kitchen',
        },
      }),
    ]);

    expect(devices.switches.map((device) => device.id)).toEqual([
      'home_assistant:switch.kitchen_main',
    ]);
  });

  it('selects primary switches in linear time across a large multi-switch snapshot', () => {
    const entities = Array.from({ length: 1_024 }, (_, index) => {
      const deviceId = `device-${index}`;
      return [
        createEntity({
          canonicalId: `home_assistant:switch.fixture_${index}_boost`,
          externalId: `switch.fixture_${index}_boost`,
          type: 'switch',
          name: `Fixture ${index} Boost`,
          attributes: {
            value: 'off',
            deviceId,
          },
        }),
        createEntity({
          canonicalId: `home_assistant:switch.fixture_${index}`,
          externalId: `switch.fixture_${index}`,
          type: 'switch',
          name: `Fixture ${index}`,
          attributes: {
            value: 'on',
            deviceId,
          },
        }),
      ];
    }).flat();

    const devices = mapNavetEntitiesToDeviceCollection(entities);

    expect(devices.switches).toHaveLength(1_024);
    expect(devices.switches[0]?.id).toBe('home_assistant:switch.fixture_0');
    expect(devices.switches.at(-1)?.id).toBe('home_assistant:switch.fixture_1023');
  });

  it('does not surface brightness accessory switches as the primary switch card', () => {
    const devices = mapNavetEntitiesToDeviceCollection([
      createEntity({
        canonicalId: 'home_assistant:switch.xiaomi_smart_tower_fan',
        externalId: 'switch.xiaomi_smart_tower_fan',
        type: 'switch',
        name: 'Xiaomi Smart Tower Fan',
        attributes: {
          value: 'on',
          deviceId: 'device-xiaomi-fan',
        },
      }),
      createEntity({
        canonicalId: 'home_assistant:switch.xiaomi_smart_tower_fan_brightness',
        externalId: 'switch.xiaomi_smart_tower_fan_brightness',
        type: 'switch',
        name: 'Xiaomi Smart Tower Fan Brightness',
        attributes: {
          value: 'off',
          deviceId: 'device-xiaomi-fan',
        },
      }),
    ]);

    expect(devices.switches.map((device) => device.id)).toEqual([
      'home_assistant:switch.xiaomi_smart_tower_fan',
    ]);
  });

  it('suppresses helper buttons attached to sensor devices', () => {
    const devices = mapNavetEntitiesToDeviceCollection([
      createEntity({
        canonicalId: 'home_assistant:sensor.aqara_humidity_sensor_humidity',
        externalId: 'sensor.aqara_humidity_sensor_humidity',
        type: 'sensor',
        name: 'Aqara Humidity Sensor',
        attributes: {
          value: '48',
          unit: '%',
          deviceId: 'device-aqara-humidity',
          entityType: 'humidity',
        },
      }),
      createEntity({
        canonicalId: 'home_assistant:button.aqara_humidity_sensor_identify',
        externalId: 'button.aqara_humidity_sensor_identify',
        type: 'helper',
        name: 'Aqara Humidity Sensor Identify',
        attributes: {
          value: '',
          deviceId: 'device-aqara-humidity',
          entityType: 'button',
          serviceDomain: 'button',
          serviceAction: 'press',
        },
      }),
    ]);

    expect(devices.sensors.map((device) => device.id)).toEqual([
      'home_assistant:sensor.aqara_humidity_sensor_humidity',
    ]);
    expect(devices.helpers).toHaveLength(0);
  });

  it('keeps the underlying device id on camera devices', () => {
    const devices = mapNavetEntitiesToDeviceCollection([
      createEntity({
        canonicalId: 'home_assistant:camera.driveway',
        externalId: 'camera.driveway',
        type: 'camera',
        name: 'Driveway',
        attributes: {
          value: 'streaming',
          deviceId: 'device-driveway',
          entityPicture: '/api/camera_proxy/camera.driveway',
          isStreamCapable: true,
        },
      }),
    ]);

    expect(devices.cameras).toMatchObject([
      {
        id: 'home_assistant:camera.driveway',
        sourceDeviceId: 'device-driveway',
      },
    ]);
  });

  it('preserves humidifier control state on switch-backed humidity devices', () => {
    const devices = mapNavetEntitiesToDeviceCollection([
      createEntity({
        canonicalId: 'home_assistant:humidifier.basement',
        externalId: 'humidifier.basement',
        type: 'switch',
        name: 'Basement Dehumidifier',
        attributes: {
          value: 'on',
          serviceDomain: 'humidifier',
          entityType: 'Dehumidifier',
          deviceClass: 'dehumidifier',
          currentHumidity: 58,
          targetHumidity: 46,
          minHumidity: 35,
          maxHumidity: 70,
          targetHumidityStep: 5,
          mode: 'auto',
          availableModes: ['auto', 'sleep'],
          action: 'drying',
        },
      }),
    ]);

    expect(devices.switches).toMatchObject([
      {
        id: 'home_assistant:humidifier.basement',
        serviceDomain: 'humidifier',
        entityType: 'Dehumidifier',
        deviceClass: 'dehumidifier',
        currentHumidity: 58,
        targetHumidity: 46,
        minHumidity: 35,
        maxHumidity: 70,
        targetHumidityStep: 5,
        mode: 'auto',
        availableModes: ['auto', 'sleep'],
        action: 'drying',
      },
    ]);
  });

  it('keeps security sensors even when they share a device with a primary security card', () => {
    const devices = mapNavetEntitiesToDeviceCollection([
      createEntity({
        canonicalId: 'home_assistant:lock.front_door',
        externalId: 'lock.front_door',
        type: 'lock',
        name: 'Front Door',
        attributes: {
          value: 'locked',
          deviceId: 'device-front-door',
          locked: true,
          securityKind: 'lock',
          securitySeverity: 'normal',
        },
      }),
      createEntity({
        canonicalId: 'home_assistant:binary_sensor.front_door_contact',
        externalId: 'binary_sensor.front_door_contact',
        type: 'sensor',
        name: 'Front Door Contact',
        attributes: {
          value: 'Open',
          deviceId: 'device-front-door',
          entityType: 'Door',
          deviceClass: 'door',
          status: 'active',
          securityKind: 'door',
          securitySeverity: 'warning',
        },
      }),
    ]);

    expect(devices.locks).toHaveLength(1);
    expect(devices.sensors).toMatchObject([
      {
        id: 'home_assistant:binary_sensor.front_door_contact',
        securityKind: 'door',
        securitySeverity: 'warning',
      },
    ]);
  });

  it('keeps security helpers even when they share a device with sensor cards', () => {
    const devices = mapNavetEntitiesToDeviceCollection([
      createEntity({
        canonicalId: 'home_assistant:sensor.doorbell_battery',
        externalId: 'sensor.doorbell_battery',
        type: 'sensor',
        name: 'Doorbell Battery',
        attributes: {
          value: '81',
          unit: '%',
          deviceId: 'device-doorbell',
        },
      }),
      createEntity({
        canonicalId: 'home_assistant:button.doorbell_chime',
        externalId: 'button.doorbell_chime',
        type: 'helper',
        name: 'Doorbell Chime',
        attributes: {
          value: 'Action',
          deviceId: 'device-doorbell',
          entityType: 'Button',
          serviceDomain: 'button',
          serviceAction: 'press',
          securityKind: 'button',
          securitySeverity: 'normal',
        },
      }),
    ]);

    expect(devices.helpers).toMatchObject([
      {
        id: 'home_assistant:button.doorbell_chime',
        securityKind: 'button',
        securitySeverity: 'normal',
      },
    ]);
  });

  it('preserves normalized alarm metadata on security sensor devices', () => {
    const devices = mapNavetEntitiesToDeviceCollection([
      createEntity({
        canonicalId: 'home_assistant:alarm_control_panel.security',
        externalId: 'alarm_control_panel.security',
        type: 'sensor',
        name: 'Security',
        attributes: {
          value: 'Disarmed',
          securityKind: 'alarm',
          securitySeverity: 'normal',
          deviceClass: 'alarm_control_panel',
          alarmState: 'disarmed',
          alarmSupportedActions: [
            'arm_home',
            'arm_away',
            'arm_night',
            'arm_vacation',
            'arm_custom_bypass',
            'disarm',
          ],
          alarmCodeFormat: 'none',
          alarmRequiresCode: false,
          alarmChangedBy: 'Wall Panel',
          alarmLastChanged: '2026-06-07T11:00:00.000Z',
          availability: 'available',
          size: 'large',
        },
      }),
    ]);

    expect(devices.sensors).toMatchObject([
      {
        id: 'home_assistant:alarm_control_panel.security',
        deviceClass: 'alarm_control_panel',
        alarmState: 'disarmed',
        alarmSupportedActions: [
          'arm_home',
          'arm_away',
          'arm_night',
          'arm_vacation',
          'arm_custom_bypass',
          'disarm',
        ],
        alarmCodeFormat: 'none',
        alarmRequiresCode: false,
        alarmChangedBy: 'Wall Panel',
        alarmLastChanged: '2026-06-07T11:00:00.000Z',
        availability: 'available',
      },
    ]);
  });
});
