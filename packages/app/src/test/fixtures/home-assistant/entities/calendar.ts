import { makeEntityFixtures, makeHassEntityFixture } from '../shared';

export const calendarEntityFactory = (overrides: Record<string, unknown> = {}) =>
  makeHassEntityFixture({
    entityId: 'calendar.family',
    state: 'on',
    attributes: {
      friendly_name: 'Family Calendar',
      supported_features: 7,
      message: 'School pickup',
      all_day: false,
      start_time: '2026-05-17T14:00:00+02:00',
      end_time: '2026-05-17T15:00:00+02:00',
      ...overrides,
    },
  });

export const calendarEntityFixtures = makeEntityFixtures(
  'calendar',
  'family',
  calendarEntityFactory().attributes
);

export const readOnlyCalendarEntityFixture = calendarEntityFactory({ supported_features: 0 });
