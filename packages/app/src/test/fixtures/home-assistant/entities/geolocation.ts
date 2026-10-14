import { makeHassEntityFixture } from '../shared';

export const geolocationEntityFactory = (overrides: Record<string, unknown> = {}) =>
  makeHassEntityFixture({
    entityId: 'geo_location.alert',
    state: '12',
    attributes: {
      friendly_name: 'Weather alert',
      latitude: 55,
      longitude: 13,
      source: 'geo_json_events',
      unit_of_measurement: 'km',
      ...overrides,
    },
  });
