import type { NavetEntity } from '@navet/core/types';
import { addDemoRoomEntities } from './demo-room-entities';

/** Sample capabilities belong to the public demo, not every isolated story. */
export function enrichDemoEntities(entities: NavetEntity[]): NavetEntity[] {
  const enriched = addDemoRoomEntities(entities).map((entity): NavetEntity => {
    if (entity.externalId === 'fan.bedroom_ceiling') {
      return {
        ...entity,
        capabilities: ['toggle', 'fan_speed'],
        attributes: {
          ...entity.attributes,
          percentage_step: 33,
          direction: 'forward',
          oscillating: true,
        },
      };
    }
    if (entity.externalId === 'climate.main_floor') {
      return {
        ...entity,
        capabilities: [
          ...entity.capabilities,
          'climate_preset',
          'climate_fan_mode',
          'climate_swing_mode',
          'climate_swing_horizontal_mode',
          'climate_target_humidity',
        ],
        attributes: {
          ...entity.attributes,
          climateControls: {
            writable: true,
            preset: { value: 'Comfort', options: ['Comfort', 'Away', 'Sleep'] },
            fanMode: { value: 'Auto', options: ['Auto', 'Low', 'High'] },
            swingMode: { value: 'Off', options: ['Off', 'Vertical'] },
            swingHorizontalMode: { value: 'Off', options: ['Off', 'Horizontal'] },
            targetHumidity: { value: 45, min: 30, max: 70, step: 1 },
            currentHumidity: 42,
          },
        },
      };
    }
    return entity;
  });
  const parent = enriched.find((entity) => entity.externalId === 'light.kitchen_island');
  if (!parent) return enriched;
  const helper = (
    externalId: string,
    name: string,
    value: NavetEntity['primaryState'],
    attributes: NavetEntity['attributes'],
    capabilities: NavetEntity['capabilities'],
    availability: NavetEntity['availability'] = 'available'
  ): NavetEntity => ({
    ...parent,
    id: `${parent.providerId}:${externalId}`,
    canonicalId: `${parent.providerId}:${externalId}`,
    externalId,
    type: 'helper',
    name,
    primaryState: value,
    availability,
    attributes: { deviceId: parent.attributes.deviceId, value, ...attributes },
    capabilities,
  });
  return [
    ...enriched,
    helper(
      'number.kitchen_turn_off_delay',
      'Turn-off delay',
      5,
      { helperType: 'number', writable: true, min: 0, max: 60, step: 1, unit: 'min' },
      ['number_value']
    ),
    helper(
      'select.kitchen_power_on_behavior',
      'Power-on behavior',
      'Previous state',
      { helperType: 'select', writable: true, options: ['Previous state', 'On', 'Off'] },
      ['select_option']
    ),
    helper('switch.kitchen_night_mode', 'Night mode', false, {}, ['toggle']),
    helper('button.kitchen_identify', 'Identify light', null, {}, ['press']),
    helper(
      'number.kitchen_transition_time',
      'Transition time',
      2,
      { helperType: 'number', writable: true, min: 0, max: 10, step: 0.5, unit: 's' },
      ['number_value'],
      'unavailable'
    ),
  ];
}
