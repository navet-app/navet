import { homeAssistantStore } from '@navet/app/stores/home-assistant-store';
import { getProviderNativeId } from '@navet/app/utils/provider-ids';
import type { CommandResult, NavetCommand, NavetEntity } from '@navet/core/types';
import type { HassEntities, HassEntity } from 'home-assistant-js-websocket';

import {
  applyPreviewCommandToEntity,
  applyPreviewServiceToEntity as applyService,
} from './preview-command-model';
import {
  getPreviewSnapshotAttributes,
  getPreviewSnapshotState,
} from './preview-entity-runtime-service';

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

// Raw-only legacy fixtures adapt to the same action model as installed scenarios.
function adaptLegacyEntity(entity: HassEntity): NavetEntity {
  const domain = entity.entity_id.split('.')[0];
  const type: NavetEntity['type'] =
    domain === 'media_player'
      ? 'media_player'
      : domain === 'light'
        ? 'light'
        : domain === 'cover'
          ? 'cover'
          : domain === 'climate' || domain === 'water_heater'
            ? 'climate'
            : 'unknown';
  return {
    id: entity.entity_id,
    canonicalId: entity.entity_id,
    externalId: entity.entity_id,
    providerId: 'home_assistant',
    name: entity.entity_id,
    type,
    primaryState: entity.state,
    availability: 'available',
    capabilities: [],
    attributes: {
      ...entity.attributes,
      ...(typeof entity.attributes.volume_level === 'number'
        ? { volume: entity.attributes.volume_level * 100 }
        : {}),
      ...(typeof entity.attributes.is_volume_muted === 'boolean'
        ? { isMuted: entity.attributes.is_volume_muted }
        : {}),
      ...(Array.isArray(entity.attributes.group_members)
        ? { groupMembers: entity.attributes.group_members }
        : {}),
    },
  };
}

function applyLegacyAction(
  entityId: string | undefined,
  apply: (entity: NavetEntity) => NavetEntity
) {
  return updatePreviewEntity(entityId, (raw) => {
    const entity = adaptLegacyEntity(raw);
    const next = apply(entity);
    if (next === entity) return raw;
    return withEntityPatch(raw, {
      state: getPreviewSnapshotState(next),
      attributes: getPreviewSnapshotAttributes(next),
    });
  });
}

function applyPreviewCommand(command: NavetCommand): boolean {
  return applyLegacyAction(command.entityId, (entity) => {
    // Preserve raw fixture semantics where the normalized preview intentionally does not act.
    if (command.type === 'stop') return { ...entity, primaryState: 'idle' };
    if (command.type === 'turn_off' && entity.type === 'cover') {
      return { ...entity, primaryState: 'closed' };
    }
    const next = applyPreviewCommandToEntity(entity, command);
    if (command.type === 'set_climate_mode') {
      return {
        ...next,
        attributes: {
          ...next.attributes,
          [entity.externalId.startsWith('water_heater.') ? 'operation_mode' : 'hvac_mode']:
            command.mode,
        },
      };
    }
    return next;
  });
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
  return applyLegacyAction(entityId, (entity) => applyService(entity, request));
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
