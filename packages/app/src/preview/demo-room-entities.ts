import type { NavetEntity } from '@navet/core/types';

/** Named rooms form a sample household; numbered rooms only exercise navigation density. */
export const DEMO_ROOM_ENTITY_IDS: Record<string, string[]> = {
  Basement: [
    'light.basement_utility',
    'switch.laundry',
    'sensor.basement_humidity',
    'sensor.nutdev1_status',
  ],
  Bathroom: [
    'light.bathroom_mirror',
    'fan.bathroom_extractor',
    'climate.bathroom_floor',
    'sensor.bathroom_humidity',
  ],
  Bedroom: [
    'light.bedroom',
    'climate.bedroom',
    'fan.bedroom_ceiling',
    'humidifier.bedroom',
    'sensor.bedroom_humidity',
  ],
  'Guest room': [
    'light.guest_room',
    'climate.guest_room',
    'cover.guest_room_blind',
    'sensor.guest_room_humidity',
  ],
  Gym: ['light.gym_ceiling', 'fan.gym', 'switch.gym_air_purifier', 'sensor.gym_temperature'],
  Hallway: ['light.hallway', 'climate.main_floor', 'lock.front_door', 'input_boolean.guest_mode'],
  Kitchen: ['light.kitchen', 'light.kitchen_island', 'switch.espresso', 'calendar.home'],
  'Living Room': [
    'media_player.demo_living_room_tv',
    'light.living_room',
    'cover.living_room_blind',
    'grouped_sensors.living_room_air',
  ],
  Office: ['light.office_desk', 'switch.desk_power', 'cover.office_blind', 'sensor.office_co2'],
  Outside: [
    'camera.front_door',
    'switch.porch_lights',
    'weather.home',
    'sensor.outside_temperature',
  ],
  Toilet: ['light.toilet', 'fan.toilet_extractor', 'sensor.toilet_humidity'],
  Unassigned: ['switch.spare_plug', 'sensor.spare_plug_power'],
};

// New fixtures share the same normalized shapes as the existing preview devices.
type Fixture = [
  NavetEntity['type'],
  string,
  string,
  string,
  NavetEntity['primaryState'],
  Record<string, unknown>?,
];
const FIXTURES: Fixture[] = [
  ['light', 'light.basement_utility', 'Utility lights', 'Basement', 'on'],
  ['switch', 'switch.laundry', 'Washing machine', 'Basement', true, { power: 420 }],
  [
    'sensor',
    'sensor.basement_humidity',
    'Humidity',
    'Basement',
    '58',
    { unit: '%', deviceClass: 'humidity' },
  ],
  ['light', 'light.bathroom_mirror', 'Mirror lights', 'Bathroom', 'on'],
  ['fan', 'fan.bathroom_extractor', 'Extractor fan', 'Bathroom', 'on', { percentage: 66 }],
  [
    'hvac',
    'climate.bathroom_floor',
    'Floor heating',
    'Bathroom',
    'heat',
    { temperature: 24, currentTemperature: 23 },
  ],
  [
    'sensor',
    'sensor.bathroom_humidity',
    'Humidity',
    'Bathroom',
    '64',
    { unit: '%', deviceClass: 'humidity' },
  ],
  [
    'light',
    'light.bedroom',
    'Bedside lamp',
    'Bedroom',
    'on',
    { brightnessPct: 35, colorTemperatureKelvin: 2700 },
  ],
  ['hvac', 'climate.bedroom', 'Radiator', 'Bedroom', 'heat'],
  [
    'sensor',
    'sensor.bedroom_humidity',
    'Humidity',
    'Bedroom',
    '47',
    { unit: '%', deviceClass: 'humidity' },
  ],
  [
    'light',
    'light.guest_room',
    'Bedside lamp',
    'Guest room',
    'off',
    { brightnessPct: 35, colorTemperatureKelvin: 2700 },
  ],
  [
    'hvac',
    'climate.guest_room',
    'Radiator',
    'Guest room',
    'heat',
    { temperature: 19, currentTemperature: 19, action: 'idle' },
  ],
  ['cover', 'cover.guest_room_blind', 'Window blind', 'Guest room', 'open', { position: 80 }],
  [
    'sensor',
    'sensor.guest_room_humidity',
    'Humidity',
    'Guest room',
    '44',
    { unit: '%', deviceClass: 'humidity' },
  ],
  ['light', 'light.gym_ceiling', 'Ceiling lights', 'Gym', 'on'],
  ['fan', 'fan.gym', 'Workout fan', 'Gym', 'off', { percentage: 0 }],
  ['switch', 'switch.gym_air_purifier', 'Air purifier', 'Gym', true, { power: 35 }],
  [
    'sensor',
    'sensor.gym_temperature',
    'Temperature',
    'Gym',
    '20.5',
    { unit: 'C', deviceClass: 'temperature' },
  ],
  ['light', 'light.hallway', 'Entry lights', 'Hallway', 'on'],
  ['switch', 'switch.espresso', 'Espresso machine', 'Kitchen', true, { power: 1140 }],
  ['light', 'light.office_desk', 'Desk lamp', 'Office', 'on', { brightnessPct: 75 }],
  ['cover', 'cover.office_blind', 'Window blind', 'Office', 'open', { position: 45 }],
  [
    'sensor',
    'sensor.office_co2',
    'CO2',
    'Office',
    '680',
    { unit: 'ppm', deviceClass: 'carbon_dioxide' },
  ],
  ['switch', 'switch.porch_lights', 'Porch lights', 'Outside', false],
  [
    'sensor',
    'sensor.outside_temperature',
    'Outdoor temperature',
    'Outside',
    '16.8',
    { unit: 'C', deviceClass: 'temperature' },
  ],
  ['light', 'light.toilet', 'Ceiling light', 'Toilet', 'off'],
  ['fan', 'fan.toilet_extractor', 'Extractor fan', 'Toilet', 'off', { percentage: 0 }],
  [
    'sensor',
    'sensor.toilet_humidity',
    'Humidity',
    'Toilet',
    '43',
    { unit: '%', deviceClass: 'humidity' },
  ],
  ['switch', 'switch.spare_plug', 'Spare smart plug', 'Unassigned', false, { power: 0 }],
  [
    'sensor',
    'sensor.spare_plug_power',
    'Spare plug power',
    'Unassigned',
    '0',
    { unit: 'W', deviceClass: 'power' },
  ],
];

export function addDemoRoomEntities(entities: NavetEntity[]): NavetEntity[] {
  const roomById = new Map(
    Object.entries(DEMO_ROOM_ENTITY_IDS).flatMap(([room, ids]) =>
      ids.map((id) => [id, room] as const)
    )
  );
  const existing = entities.map((entity) => {
    const room =
      entity.attributes.deviceId === 'device-ups' ? 'Basement' : roomById.get(entity.externalId);
    return room ? { ...entity, room, attributes: { ...entity.attributes, room } } : entity;
  });
  return [
    ...existing,
    ...FIXTURES.map(
      ([type, externalId, name, room, primaryState, attributes = {}]): NavetEntity => {
        const defaults: Record<string, unknown> =
          type === 'light'
            ? {
                brightnessPct: 65,
                colorTemperatureKelvin: 3200,
                supportedColorModes: ['brightness', 'color_temp'],
                colorMode: 'color_temp',
              }
            : type === 'hvac'
              ? {
                  temperature: 21,
                  currentTemperature: 20,
                  temperatureUnit: 'celsius',
                  action: 'heating',
                  supportedHvacModes: ['off', 'heat'],
                }
              : type === 'fan'
                ? { percentage_step: 33 }
                : type === 'cover'
                  ? {
                      deviceClass: 'blind',
                      positionMode: 'position',
                      supportedFeatures: 15,
                      hasPosition: true,
                    }
                  : type === 'switch'
                    ? { entityType: 'switch', serviceDomain: 'switch', serviceAction: 'toggle' }
                    : {};
        return {
          id: `home_assistant:${externalId}`,
          canonicalId: `home_assistant:${externalId}`,
          providerId: 'home_assistant',
          externalId,
          type,
          name,
          room,
          primaryState,
          availability: 'available',
          lastUpdated: entities[0]?.lastUpdated,
          capabilities:
            type === 'fan'
              ? ['toggle', 'fan_speed']
              : type === 'light' || type === 'switch'
                ? ['toggle']
                : [],
          attributes: {
            value: primaryState,
            room,
            deviceId:
              externalId === 'sensor.spare_plug_power'
                ? 'device-switch-spare_plug'
                : `device-${externalId.replace('.', '-')}`,
            ...defaults,
            ...attributes,
          },
        };
      }
    ),
  ];
}
