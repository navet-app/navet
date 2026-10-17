import { readNavetClimateControlState } from '@navet/core/climate-controls';
import type { NavetCommand, NavetEntity } from '@navet/core/types';

export function applyPreviewCommandToEntity<T extends NavetEntity>(
  entity: T,
  command: NavetCommand
): T {
  const state = (
    value: NavetEntity['primaryState'],
    attributes: Record<string, unknown> = {}
  ): T => ({
    ...entity,
    primaryState: value,
    attributes: { ...entity.attributes, value, ...attributes },
  });
  const attributes = (patch: Record<string, unknown>): T => ({
    ...entity,
    attributes: { ...entity.attributes, ...patch },
  });
  switch (command.type) {
    case 'play_pause':
      return state(entity.primaryState === 'playing' ? 'paused' : 'playing');
    case 'previous_track':
    case 'next_track':
      return state('playing');
    case 'set_volume':
      return attributes({ volume: Math.max(0, Math.min(100, command.volume)), isMuted: false });
    case 'mute':
      return attributes({ isMuted: true });
    case 'unmute':
      return attributes({ isMuted: false });
    case 'set_shuffle':
      return attributes({ shuffle: command.shuffle });
    case 'set_repeat_mode':
      return attributes({ repeat: command.repeatMode });
    case 'join_group':
      return attributes({ groupMembers: command.members });
    case 'leave_group':
      return attributes({ groupMembers: [] });
    case 'set_vacuum_fan_speed':
      return attributes({ fan_speed: command.fanSpeed });
    case 'clean_vacuum_areas':
      return state('cleaning', { active_cleaning_area_ids: command.areaIds });
    case 'arm_home':
      return state('armed_home');
    case 'arm_away':
      return state('armed_away');
    case 'arm_night':
      return state('armed_night');
    case 'arm_vacation':
      return state('armed_vacation');
    case 'arm_custom_bypass':
      return state('armed_custom_bypass');
    case 'disarm':
      return state('disarmed');
    case 'trigger':
      return state('triggered');
    case 'start':
      return state(entity.externalId.startsWith('vacuum.') ? 'cleaning' : 'on');
    case 'pause':
      return state('paused');
    case 'return_home':
      return state('returning');
    case 'locate':
    case 'clean_spot':
      return state('cleaning');
    case 'set_number_value':
    case 'set_text_value':
    case 'set_datetime_value':
      return {
        ...entity,
        primaryState: command.value,
        attributes: { ...entity.attributes, value: command.value },
      };
    case 'select_option':
      return {
        ...entity,
        primaryState: command.option,
        attributes: { ...entity.attributes, value: command.option },
      };
    case 'press': {
      const pressedAt = new Date().toISOString();
      return {
        ...entity,
        primaryState: pressedAt,
        lastUpdated: pressedAt,
        attributes: { ...entity.attributes, value: pressedAt },
      };
    }
    case 'set_fan_speed':
      return {
        ...entity,
        primaryState: command.percentage > 0 ? 'on' : 'off',
        attributes: {
          ...entity.attributes,
          value: command.percentage > 0 ? 'on' : 'off',
          percentage: command.percentage,
        },
      };
    case 'set_climate_preset':
    case 'set_climate_fan_mode':
    case 'set_climate_swing_mode':
    case 'set_climate_swing_horizontal_mode':
    case 'set_climate_humidity': {
      const controls = readNavetClimateControlState(entity);
      if (!controls?.writable) return entity;
      const nextControls = { ...controls };
      if (command.type === 'set_climate_humidity') {
        if (!controls.targetHumidity) return entity;
        nextControls.targetHumidity = { ...controls.targetHumidity, value: command.humidity };
      } else {
        const key =
          command.type === 'set_climate_preset'
            ? 'preset'
            : command.type === 'set_climate_fan_mode'
              ? 'fanMode'
              : command.type === 'set_climate_swing_mode'
                ? 'swingMode'
                : 'swingHorizontalMode';
        const control = controls[key];
        if (!control) return entity;
        nextControls[key] = {
          ...control,
          value: command.type === 'set_climate_preset' ? command.preset : command.mode,
        };
      }
      return { ...entity, attributes: { ...entity.attributes, climateControls: nextControls } };
    }
    case 'turn_on':
      return {
        ...entity,
        primaryState: entity.type === 'switch' || entity.type === 'helper' ? true : 'on',
        attributes: {
          ...entity.attributes,
          value: entity.type === 'switch' || entity.type === 'helper' ? true : 'on',
        },
      };
    case 'turn_off':
      return {
        ...entity,
        primaryState: entity.type === 'switch' || entity.type === 'helper' ? false : 'off',
        attributes: {
          ...entity.attributes,
          value: entity.type === 'switch' || entity.type === 'helper' ? false : 'off',
        },
      };
    case 'set_temperature':
      return { ...entity, attributes: { ...entity.attributes, temperature: command.temperature } };
    case 'set_climate_mode':
      return {
        ...entity,
        primaryState: command.mode,
        attributes: {
          ...entity.attributes,
          value: command.mode,
          action: command.mode === 'off' ? 'off' : 'idle',
        },
      };
    case 'set_position':
      return {
        ...entity,
        primaryState: command.position > 0 ? 'open' : 'closed',
        attributes: {
          ...entity.attributes,
          value: command.position > 0 ? 'open' : 'closed',
          position: command.position,
        },
      };
    case 'set_brightness':
      return {
        ...entity,
        primaryState: 'on',
        attributes: { ...entity.attributes, value: 'on', brightnessPct: command.brightness },
      };
    case 'set_color_temperature':
      return {
        ...entity,
        primaryState: 'on',
        attributes: {
          ...entity.attributes,
          value: 'on',
          colorTemperatureKelvin: command.kelvin,
          colorMode: 'color_temp',
        },
      };
    case 'lock':
      return {
        ...entity,
        primaryState: 'locked',
        attributes: { ...entity.attributes, value: 'locked', locked: true },
      };
    case 'unlock':
      return {
        ...entity,
        primaryState: 'unlocked',
        attributes: { ...entity.attributes, value: 'unlocked', locked: false },
      };
    case 'open':
      return {
        ...entity,
        primaryState: 'open',
        attributes: { ...entity.attributes, value: 'open', position: 100 },
      };
    case 'close':
      return {
        ...entity,
        primaryState: 'closed',
        attributes: { ...entity.attributes, value: 'closed', position: 0 },
      };
    case 'stop':
      return entity;
    default:
      return entity;
  }
}

export function applyPreviewServiceToEntity<T extends NavetEntity>(
  entity: T,
  {
    domain,
    service,
    serviceData,
  }: {
    domain: string;
    service: string;
    serviceData?: Record<string, unknown>;
  }
): T {
  const command = (value: NavetCommand) => applyPreviewCommandToEntity(entity, value);
  const state = (value: string): T => ({
    ...entity,
    primaryState: value,
    attributes: { ...entity.attributes, value },
  });
  const attributes = (patch: Record<string, unknown>): T => ({
    ...entity,
    attributes: { ...entity.attributes, ...patch },
  });
  const entityId = entity.externalId;
  if (domain === 'scene' && service === 'turn_on') return state('scening');
  if (
    (domain === 'script' || domain === 'button') &&
    (service === 'turn_on' || service === 'press')
  )
    return state('on');
  if (domain === 'automation' && service === 'trigger')
    return attributes({ last_triggered: new Date().toISOString() });
  if (service === 'turn_off' && entity.type === 'cover') return state('closed');
  if (service === 'turn_on' || service === 'turn_off') return command({ type: service, entityId });
  if (service === 'toggle')
    return state(entity.primaryState === 'on' || entity.primaryState === true ? 'off' : 'on');
  if (domain === 'fan') {
    if (service === 'set_percentage' && typeof serviceData?.percentage === 'number')
      return command({ type: 'set_fan_speed', entityId, percentage: serviceData.percentage });
    if (
      service === 'set_direction' &&
      (serviceData?.direction === 'forward' || serviceData?.direction === 'reverse')
    )
      return attributes({ direction: serviceData.direction });
    if (service === 'oscillate' && typeof serviceData?.oscillating === 'boolean')
      return attributes({ oscillating: serviceData.oscillating });
  }
  if (
    (domain === 'climate' || domain === 'water_heater') &&
    service === 'set_temperature' &&
    typeof serviceData?.temperature === 'number'
  )
    return command({ type: 'set_temperature', entityId, temperature: serviceData.temperature });
  if (
    domain === 'climate' &&
    service === 'set_hvac_mode' &&
    typeof serviceData?.hvac_mode === 'string'
  )
    return command({ type: 'set_climate_mode', entityId, mode: serviceData.hvac_mode });
  if (domain === 'media_player') {
    if (service === 'volume_set' && typeof serviceData?.volume_level === 'number')
      return command({ type: 'set_volume', entityId, volume: serviceData.volume_level * 100 });
    if (service === 'shuffle_set' && typeof serviceData?.shuffle === 'boolean')
      return command({ type: 'set_shuffle', entityId, shuffle: serviceData.shuffle });
    if (service === 'repeat_set' && typeof serviceData?.repeat === 'string')
      return attributes({ repeat: serviceData.repeat });
    if (service === 'volume_mute' && typeof serviceData?.is_volume_muted === 'boolean')
      return command({ type: serviceData.is_volume_muted ? 'mute' : 'unmute', entityId });
  }
  if (domain === 'lock' && (service === 'lock' || service === 'unlock'))
    return command({ type: service, entityId });
  if (domain === 'cover' && (service === 'open_cover' || service === 'close_cover'))
    return command({ type: service === 'open_cover' ? 'open' : 'close', entityId });
  if (domain === 'vacuum' && service === 'return_to_base')
    return command({ type: 'return_home', entityId });
  return entity;
}
