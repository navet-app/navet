import { makeEntityFixtures, makeHassEntityFixture } from '../shared';

export const binarySensorEntityFactory = (overrides: Record<string, unknown> = {}) =>
  makeHassEntityFixture({
    entityId: 'binary_sensor.front_door_motion',
    state: 'off',
    attributes: {
      friendly_name: 'Front Door Motion',
      device_class: 'motion',
      ...overrides,
    },
  });

export const binarySensorEntityFixtures = makeEntityFixtures(
  'binary_sensor',
  'front_door_motion',
  binarySensorEntityFactory().attributes
);

export const securityConnectivityEntity = makeHassEntityFixture({
  entityId: 'binary_sensor.front_door_connectivity',
  state: 'on',
  attributes: {
    friendly_name: 'Front Door Lock Connectivity',
    device_class: 'connectivity',
  },
});
