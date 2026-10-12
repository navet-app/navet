import { readNavetClimateControlState } from '@navet/core/climate-controls';
import type { NavetCommand, NavetEntity } from '@navet/core/types';

export function applyPreviewCommandToEntity(
  entity: NavetEntity,
  command: NavetCommand
): NavetEntity {
  switch (command.type) {
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
        attributes: { ...entity.attributes, value: 'on', colorTemperatureKelvin: command.kelvin },
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
