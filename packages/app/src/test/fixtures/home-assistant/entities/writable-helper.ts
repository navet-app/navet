import type { HassEntity } from 'home-assistant-js-websocket';
import { makeHassEntityFixture } from '../shared';

/** Full state payloads using Home Assistant's published helper attributes. */
export const writableHelperEntities: Record<string, HassEntity> = Object.fromEntries(
  [
    [
      'input_number.target',
      '20.5',
      {
        friendly_name: 'Target',
        min: 10,
        max: 30,
        step: 0.5,
        mode: 'box',
        unit_of_measurement: '°C',
      },
    ],
    ['number.threshold', '5', { friendly_name: 'Threshold', min: 0, max: 10, step: 1 }],
    ['input_select.house_mode', 'Home', { friendly_name: 'House mode', options: ['Home', 'Away'] }],
    ['select.profile', 'Quiet', { friendly_name: 'Profile', options: ['Quiet', 'Normal'] }],
    [
      'input_text.note',
      'Dinner',
      { friendly_name: 'Note', min: 0, max: 40, mode: 'text', pattern: '[A-Za-z ]*' },
    ],
    ['text.label', 'Room', { friendly_name: 'Label', min: 1, max: 20, mode: 'text' }],
    [
      'input_datetime.wakeup',
      '07:30:00',
      { friendly_name: 'Wake up', has_date: false, has_time: true },
    ],
    [
      'input_datetime.reminder',
      '2026-10-10 07:30:00',
      { friendly_name: 'Reminder', has_date: true, has_time: true },
    ],
    [
      'input_datetime.birthday',
      '2026-10-10',
      { friendly_name: 'Birthday', has_date: true, has_time: false },
    ],
    ['date.filter', '2026-10-10', { friendly_name: 'Next filter change' }],
    ['time.schedule', '07:30:00', { friendly_name: 'Schedule' }],
  ].map(([entityId, state, attributes]) => [
    entityId,
    makeHassEntityFixture({
      entityId: entityId as string,
      state: state as string,
      attributes: attributes as Record<string, unknown>,
    }),
  ])
);

/** Device-owned configuration helpers exposed in the parent's controls. */
export const writableHelperRegistry = [
  {
    entity_id: 'number.threshold',
    device_id: 'device-kitchen',
    entity_category: 'config' as const,
  },
  { entity_id: 'select.profile', device_id: 'device-kitchen', entity_category: 'config' as const },
];
