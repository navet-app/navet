import { EMPTY_NAVET_MEDIA_CAPABILITIES } from '@navet/app/core/navet-device-state';
import type { NavetEntity } from '@navet/core/types';
import { addDemoRoomEntities } from './demo-room-entities';

/** Sample capabilities belong to the public demo, not every isolated story. */
export function enrichDemoEntities(entities: NavetEntity[]): NavetEntity[] {
  const enriched = addDemoRoomEntities(entities)
    .map(withDemoControlCapabilities)
    .map((entity): NavetEntity => {
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

/** Match the simulated demo actions without inferring capabilities in product UI. */
function withDemoControlCapabilities(entity: NavetEntity): NavetEntity {
  if (entity.type === 'calendar' && Array.isArray(entity.attributes.events))
    return {
      ...entity,
      attributes: {
        ...entity.attributes,
        events: entity.attributes.events.flatMap((event, index) => {
          if (!event || typeof event !== 'object') return [];
          const start = new Date();
          start.setDate(start.getDate() + 1 + index);
          start.setHours(15, 0, 0, 0);
          const end = new Date(start.getTime() + 30 * 60_000);
          return [
            {
              ...event,
              startDateTime: start.toISOString(),
              endDateTime: end.toISOString(),
              sortKey: start.toISOString(),
            },
          ];
        }),
      },
    };

  if (entity.type === 'light')
    return {
      ...entity,
      capabilities: [
        ...new Set<NavetEntity['capabilities'][number]>([
          ...entity.capabilities,
          'toggle',
          ...(typeof entity.attributes.brightnessPct === 'number' ? ['brightness' as const] : []),
        ]),
      ],
    };
  if (entity.type === 'hvac')
    return {
      ...entity,
      capabilities: [
        ...new Set<NavetEntity['capabilities'][number]>([
          ...entity.capabilities,
          'temperature_setpoint',
        ]),
      ],
    };
  if (entity.type === 'switch')
    return {
      ...entity,
      capabilities: [
        ...new Set<NavetEntity['capabilities'][number]>([...entity.capabilities, 'toggle']),
      ],
    };
  if (entity.type === 'media_player')
    return {
      ...entity,
      capabilities: [
        ...new Set<NavetEntity['capabilities'][number]>([...entity.capabilities, 'media_playback']),
      ],
      attributes: {
        ...entity.attributes,
        mediaCapabilities: entity.attributes.mediaCapabilities ?? {
          ...EMPTY_NAVET_MEDIA_CAPABILITIES,
          canPlay: true,
          canTurnOn: true,
          canTurnOff: true,
          canPause: true,
          canNextTrack: true,
          canPreviousTrack: true,
          canSetVolume: true,
          canMuteVolume: true,
          canGroup: entity.attributes.supportsGrouping === true,
        },
      },
    };
  return entity;
}
