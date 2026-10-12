import { homeAssistantStore } from '@navet/app/stores/home-assistant-store';
import { getProviderNativeId } from '@navet/app/utils/provider-ids';
import type { CommandResult, NavetCommand } from '@navet/core/types';
import type { HassEntities, HassEntity } from 'home-assistant-js-websocket';

type PreviewRuntimeKind = 'storybook' | 'demo';

export type PreviewServiceCallRequest = {
  entityId?: string;
  domain: string;
  service: string;
  serviceData?: Record<string, unknown>;
  target?: {
    entityId?: string | string[];
  };
};

const PREVIEW_COMMAND_RESULT: CommandResult = {
  accepted: true,
  requiresEventConfirmation: false,
};

type PreviewCommandHandler = (command: NavetCommand) => Promise<CommandResult | null>;
let installedPreviewCommandHandler: PreviewCommandHandler | null = null;
let installedPreviewServiceHandler:
  | ((entityId: string, request: PreviewServiceCallRequest) => boolean)
  | null = null;

// Runtime registration keeps preview fixtures out of the production command import graph.
export function setInstalledPreviewCommandHandler(handler: PreviewCommandHandler | null) {
  installedPreviewCommandHandler = handler;
}

export function setInstalledPreviewServiceHandler(handler: typeof installedPreviewServiceHandler) {
  installedPreviewServiceHandler = handler;
}

function getPreviewRuntimeKind(): PreviewRuntimeKind | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const explicitRuntime = document.documentElement.dataset.navetPreviewRuntime;
  if (explicitRuntime === 'storybook' || explicitRuntime === 'demo') {
    return explicitRuntime;
  }

  if (document.documentElement.dataset.navetStorybook === 'true') {
    return 'storybook';
  }

  return null;
}

function isPreviewRuntime() {
  return getPreviewRuntimeKind() !== null;
}

function updatePreviewEntity(
  entityId: string | undefined,
  update: (entity: HassEntity) => HassEntity
): boolean {
  if (!entityId) {
    return false;
  }

  const nativeEntityId = getProviderNativeId(entityId);
  const previousState = homeAssistantStore.getState();
  const entities = previousState.entities;
  if (!entities || !(nativeEntityId in entities)) {
    return false;
  }

  const nextEntities: HassEntities = {
    ...entities,
    [nativeEntityId]: update(entities[nativeEntityId] as HassEntity),
  };

  homeAssistantStore.setState({
    ...previousState,
    entities: nextEntities,
  });

  return true;
}

function withEntityPatch(
  entity: HassEntity,
  patch: Partial<HassEntity> & {
    attributes?: Record<string, unknown>;
  }
): HassEntity {
  return {
    ...entity,
    ...patch,
    attributes: {
      ...entity.attributes,
      ...(patch.attributes ?? {}),
    },
    last_updated: new Date().toISOString(),
  };
}

function brightnessToHaScale(brightness: number) {
  return Math.round((Math.max(0, Math.min(100, brightness)) / 100) * 255);
}

function volumeToHaScale(volume: number) {
  return Math.max(0, Math.min(1, volume / 100));
}

function togglePlaybackState(state: string) {
  return state === 'playing' ? 'paused' : 'playing';
}

function applyPreviewCommand(command: NavetCommand): boolean {
  switch (command.type) {
    case 'turn_on':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { state: 'on' })
      );
    case 'turn_off':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { state: entity.entity_id.startsWith('cover.') ? 'closed' : 'off' })
      );
    case 'set_brightness':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, {
          state: 'on',
          attributes: { brightness: brightnessToHaScale(command.brightness) },
        })
      );
    case 'set_color_temperature':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, {
          state: 'on',
          attributes: { color_temp_kelvin: command.kelvin, color_mode: 'color_temp' },
        })
      );
    case 'set_fan_speed':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, {
          state: command.percentage > 0 ? 'on' : 'off',
          attributes: { percentage: command.percentage },
        })
      );
    case 'set_vacuum_fan_speed':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, {
          attributes: { fan_speed: command.fanSpeed },
        })
      );
    case 'clean_vacuum_areas':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, {
          state: 'cleaning',
          attributes: { active_cleaning_area_ids: command.areaIds },
        })
      );
    case 'play_pause':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { state: togglePlaybackState(entity.state) })
      );
    case 'previous_track':
    case 'next_track':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { state: 'playing' })
      );
    case 'set_volume':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, {
          attributes: { volume_level: volumeToHaScale(command.volume), is_volume_muted: false },
        })
      );
    case 'mute':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { attributes: { is_volume_muted: true } })
      );
    case 'unmute':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { attributes: { is_volume_muted: false } })
      );
    case 'set_shuffle':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { attributes: { shuffle: command.shuffle } })
      );
    case 'set_repeat_mode':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { attributes: { repeat: command.repeatMode } })
      );
    case 'join_group':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { attributes: { group_members: command.members } })
      );
    case 'leave_group':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { attributes: { group_members: [] } })
      );
    case 'set_climate_mode':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, {
          state: command.mode,
          attributes: entity.entity_id.startsWith('water_heater.')
            ? { operation_mode: command.mode }
            : { hvac_mode: command.mode },
        })
      );
    case 'set_temperature':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { attributes: { temperature: command.temperature } })
      );
    case 'lock':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { state: 'locked' })
      );
    case 'unlock':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { state: 'unlocked' })
      );
    case 'arm_home':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { state: 'armed_home' })
      );
    case 'arm_away':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { state: 'armed_away' })
      );
    case 'arm_night':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { state: 'armed_night' })
      );
    case 'arm_vacation':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { state: 'armed_vacation' })
      );
    case 'arm_custom_bypass':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { state: 'armed_custom_bypass' })
      );
    case 'disarm':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { state: 'disarmed' })
      );
    case 'trigger':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { state: 'triggered' })
      );
    case 'open':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { state: 'open', attributes: { current_position: 100 } })
      );
    case 'close':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { state: 'closed', attributes: { current_position: 0 } })
      );
    case 'start':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, {
          state: entity.entity_id.startsWith('vacuum.') ? 'cleaning' : 'on',
        })
      );
    case 'pause':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { state: 'paused' })
      );
    case 'stop':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { state: 'idle' })
      );
    case 'return_home':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { state: 'returning' })
      );
    case 'locate':
    case 'clean_spot':
      return updatePreviewEntity(command.entityId, (entity) =>
        withEntityPatch(entity, { state: 'cleaning' })
      );
    default:
      return false;
  }
}

function getPreviewServiceEntityIds(request: PreviewServiceCallRequest) {
  const ids: string[] = [];

  if (request.entityId) {
    ids.push(request.entityId);
  }

  const targetEntityId = request.target?.entityId;
  if (typeof targetEntityId === 'string') {
    ids.push(targetEntityId);
  } else if (Array.isArray(targetEntityId)) {
    ids.push(...targetEntityId);
  }

  return Array.from(new Set(ids));
}

function applyPreviewServiceToEntity(entityId: string, request: PreviewServiceCallRequest) {
  const { domain, service, serviceData } = request;

  if (domain === 'scene' && service === 'turn_on') {
    return updatePreviewEntity(entityId, (entity) => withEntityPatch(entity, { state: 'scening' }));
  }

  if (
    (domain === 'script' || domain === 'button') &&
    (service === 'turn_on' || service === 'press')
  ) {
    return updatePreviewEntity(entityId, (entity) => withEntityPatch(entity, { state: 'on' }));
  }

  if (domain === 'automation' && service === 'trigger') {
    return updatePreviewEntity(entityId, (entity) =>
      withEntityPatch(entity, {
        attributes: { last_triggered: new Date().toISOString() },
      })
    );
  }

  if (service === 'turn_on') {
    return applyPreviewCommand({ type: 'turn_on', entityId });
  }

  if (service === 'turn_off') {
    return applyPreviewCommand({ type: 'turn_off', entityId });
  }

  if (service === 'toggle') {
    return updatePreviewEntity(entityId, (entity) =>
      withEntityPatch(entity, { state: entity.state === 'on' ? 'off' : 'on' })
    );
  }

  if (
    domain === 'fan' &&
    service === 'set_percentage' &&
    typeof serviceData?.percentage === 'number'
  ) {
    return applyPreviewCommand({
      type: 'set_fan_speed',
      entityId,
      percentage: serviceData.percentage,
    });
  }

  if (
    (domain === 'climate' || domain === 'water_heater') &&
    service === 'set_temperature' &&
    typeof serviceData?.temperature === 'number'
  ) {
    return applyPreviewCommand({
      type: 'set_temperature',
      entityId,
      temperature: serviceData.temperature,
    });
  }

  if (
    domain === 'climate' &&
    service === 'set_hvac_mode' &&
    typeof serviceData?.hvac_mode === 'string'
  ) {
    return applyPreviewCommand({
      type: 'set_climate_mode',
      entityId,
      mode: serviceData.hvac_mode,
    });
  }

  if (
    domain === 'media_player' &&
    service === 'volume_set' &&
    typeof serviceData?.volume_level === 'number'
  ) {
    return updatePreviewEntity(entityId, (entity) =>
      withEntityPatch(entity, {
        attributes: { volume_level: serviceData.volume_level, is_volume_muted: false },
      })
    );
  }

  if (
    domain === 'media_player' &&
    service === 'volume_mute' &&
    typeof serviceData?.is_volume_muted === 'boolean'
  ) {
    return updatePreviewEntity(entityId, (entity) =>
      withEntityPatch(entity, {
        attributes: { is_volume_muted: serviceData.is_volume_muted },
      })
    );
  }

  if (
    domain === 'media_player' &&
    service === 'shuffle_set' &&
    typeof serviceData?.shuffle === 'boolean'
  ) {
    return updatePreviewEntity(entityId, (entity) =>
      withEntityPatch(entity, {
        attributes: { shuffle: serviceData.shuffle },
      })
    );
  }

  if (
    domain === 'media_player' &&
    service === 'repeat_set' &&
    typeof serviceData?.repeat === 'string'
  ) {
    return updatePreviewEntity(entityId, (entity) =>
      withEntityPatch(entity, {
        attributes: { repeat: serviceData.repeat },
      })
    );
  }

  if (domain === 'lock' && service === 'lock') {
    return applyPreviewCommand({ type: 'lock', entityId });
  }

  if (domain === 'lock' && service === 'unlock') {
    return applyPreviewCommand({ type: 'unlock', entityId });
  }

  if (domain === 'cover' && service === 'open_cover') {
    return applyPreviewCommand({ type: 'open', entityId });
  }

  if (domain === 'cover' && service === 'close_cover') {
    return applyPreviewCommand({ type: 'close', entityId });
  }

  if (domain === 'vacuum' && service === 'return_to_base') {
    return applyPreviewCommand({ type: 'return_home', entityId });
  }

  return updatePreviewEntity(entityId, (entity) => withEntityPatch(entity, {}));
}

export async function maybeDispatchPreviewCommand(
  command: NavetCommand
): Promise<CommandResult | null> {
  if (!isPreviewRuntime()) {
    return null;
  }

  const installedResult = await installedPreviewCommandHandler?.(command);
  if (installedResult) return installedResult;

  applyPreviewCommand(command);
  return PREVIEW_COMMAND_RESULT;
}

export async function maybeHandlePreviewServiceCall(
  request: PreviewServiceCallRequest
): Promise<boolean> {
  if (!isPreviewRuntime()) {
    return false;
  }

  const entityIds = getPreviewServiceEntityIds(request);
  if (entityIds.length === 0) {
    return true;
  }

  for (const entityId of entityIds) {
    if (!installedPreviewServiceHandler?.(entityId, request)) {
      applyPreviewServiceToEntity(entityId, request);
    }
  }

  return true;
}
