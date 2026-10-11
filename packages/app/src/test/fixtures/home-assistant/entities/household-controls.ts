import { makeHassEntityFixture } from '../shared';

/** HA state payloads: timer strings, bounded integer counter, valve feature bitmask, basic remote. */
export function householdControlEntityFactory(
  domain: 'timer' | 'counter' | 'valve' | 'remote',
  attributes: Record<string, unknown> = {},
  state?: string
) {
  const defaults = {
    timer: {
      state: 'active',
      attrs: {
        friendly_name: 'Laundry timer',
        duration: '0:10:00',
        remaining: '0:10:00',
        finishes_at: '2026-10-11T12:10:00+00:00',
        editable: true,
        restore: true,
      },
    },
    counter: {
      state: '4',
      attrs: {
        friendly_name: 'Water bottles',
        initial: 0,
        step: 2,
        minimum: -10,
        maximum: 20,
        editable: true,
      },
    },
    valve: {
      state: 'opening',
      attrs: {
        friendly_name: 'Garden water',
        current_position: 35,
        device_class: 'water',
        supported_features: 1 | 2 | 4 | 8,
      },
    },
    remote: { state: 'off', attrs: { friendly_name: 'Living room remote', supported_features: 0 } },
  }[domain];
  return makeHassEntityFixture({
    entityId: `${domain}.household`,
    state: state ?? defaults.state,
    attributes: { ...defaults.attrs, ...attributes },
  });
}
