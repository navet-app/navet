import { UnsupportedProviderCommandError } from '@navet/core/errors';
import type { NavetCommand, NavetEntity } from '@navet/core/types';
import { getHomeAssistantClimateControlCommandRoute } from './homeassistant-climate-controls';
import { HOME_ASSISTANT_VALUE_HELPER_DOMAINS } from './homeassistant-helper';
import { getHomeAssistantHelperCommandRoute } from './homeassistant-helper-commands';
import { getHomeAssistantHouseholdCommandRoute } from './homeassistant-household-commands';
import { HOME_ASSISTANT_HOUSEHOLD_DOMAINS } from './homeassistant-household-controls';
import { callHomeAssistantService } from './homeassistant-service-bridge';

const ALARM_COMMAND_SERVICES: Record<
  | 'arm_home'
  | 'arm_away'
  | 'arm_night'
  | 'arm_vacation'
  | 'arm_custom_bypass'
  | 'disarm'
  | 'trigger',
  string
> = {
  arm_home: 'alarm_arm_home',
  arm_away: 'alarm_arm_away',
  arm_night: 'alarm_arm_night',
  arm_vacation: 'alarm_arm_vacation',
  arm_custom_bypass: 'alarm_arm_custom_bypass',
  disarm: 'alarm_disarm',
  trigger: 'alarm_trigger',
};

function getEntityCommandDomain(entity: NavetEntity): string {
  if (entity.externalId.includes('.')) {
    return entity.externalId.split('.', 1)[0] || 'homeassistant';
  }

  switch (entity.type) {
    case 'light':
      return 'light';
    case 'fan':
      return 'fan';
    case 'switch':
    case 'helper':
      return 'switch';
    case 'climate':
    case 'hvac':
      return 'climate';
    case 'lock':
      return 'lock';
    case 'cover':
      return 'cover';
    case 'vacuum':
      return 'vacuum';
    case 'scene':
      return 'scene';
    default:
      return 'homeassistant';
  }
}

function isLawnMowerEntity(entity: NavetEntity): boolean {
  return entity.externalId.startsWith('lawn_mower.');
}

function getVacuumLikeCommandRoute(entity: NavetEntity, command: NavetCommand) {
  if (!isLawnMowerEntity(entity)) {
    switch (command.type) {
      case 'set_vacuum_fan_speed':
        return {
          domain: 'vacuum',
          service: 'set_fan_speed',
          data: { fan_speed: command.fanSpeed },
        };
      case 'clean_vacuum_areas':
        return {
          domain: 'vacuum',
          service: 'clean_area',
          data: { cleaning_area_id: command.areaIds },
        };
      case 'start':
        return { domain: 'vacuum', service: 'start', data: {} };
      case 'pause':
        return { domain: 'vacuum', service: 'pause', data: {} };
      case 'stop':
        return { domain: 'vacuum', service: 'stop', data: {} };
      case 'return_home':
        return { domain: 'vacuum', service: 'return_to_base', data: {} };
      case 'locate':
        return { domain: 'vacuum', service: 'locate', data: {} };
      case 'clean_spot':
        return { domain: 'vacuum', service: 'clean_spot', data: {} };
      default:
        return null;
    }
  }

  switch (command.type) {
    case 'start':
      return { domain: 'lawn_mower', service: 'start_mowing', data: {} };
    case 'pause':
      return { domain: 'lawn_mower', service: 'pause', data: {} };
    case 'return_home':
      return { domain: 'lawn_mower', service: 'dock', data: {} };
    default:
      return null;
  }
}

export async function executeHomeAssistantCommand(entity: NavetEntity, command: NavetCommand) {
  if (HOME_ASSISTANT_HOUSEHOLD_DOMAINS.has(getEntityCommandDomain(entity))) {
    const route = getHomeAssistantHouseholdCommandRoute(entity, command);
    await callHomeAssistantService(route.domain, route.service, route.data, {
      entityId: entity.externalId,
    });
    return;
  }
  if (
    HOME_ASSISTANT_VALUE_HELPER_DOMAINS.has(getEntityCommandDomain(entity)) &&
    !['set_number_value', 'select_option', 'set_text_value', 'set_datetime_value'].includes(
      command.type
    )
  ) {
    throw new UnsupportedProviderCommandError(command.type);
  }
  switch (command.type) {
    case 'press': {
      const domain = getEntityCommandDomain(entity);
      if (
        !entity.capabilities.includes('press') ||
        !['button', 'input_button', 'script'].includes(domain)
      ) {
        throw new UnsupportedProviderCommandError(command.type);
      }
      await callHomeAssistantService(
        domain,
        domain === 'script' ? 'turn_on' : 'press',
        {},
        {
          entityId: entity.externalId,
        }
      );
      return;
    }
    case 'set_number_value':
    case 'select_option':
    case 'set_text_value':
    case 'set_datetime_value': {
      const route = getHomeAssistantHelperCommandRoute(entity, command);
      await callHomeAssistantService(route.domain, route.service, route.data, {
        entityId: entity.externalId,
      });
      return;
    }
    case 'turn_on':
      await callHomeAssistantService(
        getEntityCommandDomain(entity),
        'turn_on',
        {},
        {
          entityId: entity.externalId,
        }
      );
      return;
    case 'turn_off':
      await callHomeAssistantService(
        getEntityCommandDomain(entity),
        'turn_off',
        {},
        {
          entityId: entity.externalId,
        }
      );
      return;
    case 'set_fan_speed':
      await callHomeAssistantService(
        'fan',
        'set_percentage',
        { percentage: command.percentage },
        { entityId: entity.externalId }
      );
      return;
    case 'set_vacuum_fan_speed':
    case 'clean_vacuum_areas':
    case 'start':
    case 'pause':
    case 'stop':
    case 'return_home':
    case 'locate':
    case 'clean_spot': {
      const route = getVacuumLikeCommandRoute(entity, command);
      if (!route) {
        throw new UnsupportedProviderCommandError(command.type);
      }
      await callHomeAssistantService(route.domain, route.service, route.data, {
        entityId: entity.externalId,
      });
      return;
    }
    case 'play_pause':
      await callHomeAssistantService(
        'media_player',
        entity.primaryState === 'playing' ? 'media_pause' : 'media_play',
        {},
        {
          entityId: entity.externalId,
        }
      );
      return;
    case 'previous_track':
      await callHomeAssistantService(
        'media_player',
        'media_previous_track',
        {},
        {
          entityId: entity.externalId,
        }
      );
      return;
    case 'next_track':
      await callHomeAssistantService(
        'media_player',
        'media_next_track',
        {},
        {
          entityId: entity.externalId,
        }
      );
      return;
    case 'set_volume':
      await callHomeAssistantService(
        'media_player',
        'volume_set',
        { volume_level: command.volume / 100 },
        { entityId: entity.externalId }
      );
      return;
    case 'mute':
      await callHomeAssistantService(
        'media_player',
        'volume_mute',
        { is_volume_muted: true },
        { entityId: entity.externalId }
      );
      return;
    case 'unmute':
      await callHomeAssistantService(
        'media_player',
        'volume_mute',
        { is_volume_muted: false },
        { entityId: entity.externalId }
      );
      return;
    case 'set_shuffle':
      await callHomeAssistantService(
        'media_player',
        'shuffle_set',
        { shuffle: command.shuffle },
        { entityId: entity.externalId }
      );
      return;
    case 'set_repeat_mode':
      await callHomeAssistantService(
        'media_player',
        'repeat_set',
        { repeat: command.repeatMode },
        { entityId: entity.externalId }
      );
      return;
    case 'join_group':
      await callHomeAssistantService(
        'media_player',
        'join',
        { group_members: command.members },
        { entityId: entity.externalId }
      );
      return;
    case 'leave_group':
      await callHomeAssistantService(
        'media_player',
        'unjoin',
        {},
        {
          entityId: entity.externalId,
        }
      );
      return;
    case 'set_climate_preset':
    case 'set_climate_fan_mode':
    case 'set_climate_swing_mode':
    case 'set_climate_swing_horizontal_mode':
    case 'set_climate_humidity': {
      const route = getHomeAssistantClimateControlCommandRoute(entity, command);
      await callHomeAssistantService('climate', route.service, route.data, {
        entityId: entity.externalId,
      });
      return;
    }
    case 'set_climate_mode':
      await callHomeAssistantService(
        entity.externalId.startsWith('water_heater.') ? 'water_heater' : 'climate',
        entity.externalId.startsWith('water_heater.') ? 'set_operation_mode' : 'set_hvac_mode',
        entity.externalId.startsWith('water_heater.')
          ? { operation_mode: command.mode }
          : { hvac_mode: command.mode },
        { entityId: entity.externalId }
      );
      return;
    case 'set_brightness':
      await callHomeAssistantService(
        'light',
        'turn_on',
        { brightness_pct: command.brightness },
        { entityId: entity.externalId }
      );
      return;
    case 'set_color_temperature':
      await callHomeAssistantService(
        'light',
        'turn_on',
        { color_temp_kelvin: command.kelvin },
        { entityId: entity.externalId }
      );
      return;
    case 'set_temperature':
      await callHomeAssistantService(
        entity.externalId.startsWith('water_heater.') ? 'water_heater' : 'climate',
        'set_temperature',
        { temperature: command.temperature },
        { entityId: entity.externalId }
      );
      return;
    case 'lock':
      await callHomeAssistantService('lock', 'lock', {}, { entityId: entity.externalId });
      return;
    case 'unlock':
      await callHomeAssistantService('lock', 'unlock', {}, { entityId: entity.externalId });
      return;
    case 'arm_home':
    case 'arm_away':
    case 'arm_night':
    case 'arm_vacation':
    case 'arm_custom_bypass':
    case 'disarm':
    case 'trigger': {
      const service = ALARM_COMMAND_SERVICES[command.type];
      await callHomeAssistantService(
        'alarm_control_panel',
        service,
        command.code ? { code: command.code } : {},
        { entityId: entity.externalId }
      );
      return;
    }
    case 'open':
      await callHomeAssistantService('cover', 'open_cover', {}, { entityId: entity.externalId });
      return;
    case 'close':
      await callHomeAssistantService(
        'cover',
        'close_cover',
        {},
        {
          entityId: entity.externalId,
        }
      );
      return;
    default:
      throw new UnsupportedProviderCommandError((command as { type: string }).type);
  }
}
