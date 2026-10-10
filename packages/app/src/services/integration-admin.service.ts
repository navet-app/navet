import type { ProviderAdminFeatureService } from '@navet/app/platform/provider-feature-services';
import { parsePlatformRoomReference } from '@navet/app/platform/provider-room-management';
import {
  getProviderRoomManagementCapabilities,
  getProviderRuntimeRegistration,
} from '@navet/app/provider-runtime-registry';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import { parseProviderScopedId } from '@navet/app/utils/provider-ids';
import { isImplementedIntegrationProviderId } from '@navet/core/integration-providers';
import type {
  PlatformRoomMutationPlan,
  PlatformRoomMutationResult,
  PlatformRoomMutationStep,
  PlatformRoomMutationStepFailure,
  PlatformRoomMutationStepSuccess,
  ProviderRoomManagementCapability,
} from '@navet/core/provider-feature-models';
import { createPlatformRoomMutationPlan } from '@navet/core/provider-room-management';
import { getCurrentIntegrationProviderIdFromStore } from './integration-provider-context.service';
import { resolveProviderService } from './integration-provider-service';

function getCurrentProviderId(): IntegrationProviderId {
  return getCurrentIntegrationProviderIdFromStore();
}

function getProviderLabel(providerId: IntegrationProviderId): string {
  switch (providerId) {
    case 'home_assistant':
      return 'Home Assistant';
    case 'homey':
      return 'Homey';
    case 'openhab':
      return 'openHAB';
    case 'hubitat':
      return 'Hubitat';
    case 'smartthings':
      return 'SmartThings';
  }
}

function resolveEntityProviderId(entityId: string): IntegrationProviderId {
  return parseProviderScopedId(entityId)?.providerId ?? getCurrentProviderId();
}

function requireRoomAdminFeatureService(
  providerId: IntegrationProviderId,
  capability: Exclude<ProviderRoomManagementCapability, 'discover'>
): ProviderAdminFeatureService {
  if (!getProviderRoomManagementCapabilities(providerId)[capability]) {
    throw new Error(
      `Room ${capability} is not supported by provider ${getProviderLabel(providerId)}`
    );
  }

  const service = getProviderRuntimeRegistration(providerId).adminFeatureService;
  if (!service) {
    throw new Error(
      `Room administration is unavailable for provider ${getProviderLabel(providerId)}`
    );
  }

  return service;
}

async function runRoomMutation<T>(
  providerId: IntegrationProviderId,
  operation: Exclude<ProviderRoomManagementCapability, 'discover'>,
  mutation: () => Promise<T>
): Promise<T> {
  try {
    return await mutation();
  } catch {
    throw new Error(`Room ${operation} failed for provider ${getProviderLabel(providerId)}`);
  }
}

function requireRoomReferenceProvider(
  roomId: string,
  providerId?: IntegrationProviderId
): IntegrationProviderId {
  const parsedRoom = parsePlatformRoomReference(roomId);
  if (!parsedRoom) {
    throw new Error(`Invalid room reference: ${roomId}`);
  }
  if (providerId && parsedRoom.providerId !== providerId) {
    throw new Error(`Room ${roomId} does not belong to provider ${getProviderLabel(providerId)}`);
  }

  return parsedRoom.providerId;
}

export const integrationAdminService: ProviderAdminFeatureService & {
  canReloadEntityIntegration: (entityId: string) => boolean;
  reloadEntityIntegration: (entityId: string) => Promise<void>;
} = {
  canReloadEntityIntegration: (entityId) => {
    const providerId = resolveEntityProviderId(entityId);
    if (!isImplementedIntegrationProviderId(providerId)) return false;
    const service = getProviderRuntimeRegistration(providerId).adminFeatureService;
    return Boolean(
      service?.reloadEntityIntegration && service.canReloadEntityIntegration?.(entityId)
    );
  },
  reloadEntityIntegration: async (entityId) => {
    const providerId = resolveEntityProviderId(entityId);
    if (!isImplementedIntegrationProviderId(providerId)) {
      throw new Error('Integration reload is unavailable for this entity or session');
    }
    const service = getProviderRuntimeRegistration(providerId).adminFeatureService;
    if (!service?.reloadEntityIntegration || !service.canReloadEntityIntegration?.(entityId)) {
      throw new Error('Integration reload is unavailable for this entity or session');
    }
    await service.reloadEntityIntegration(entityId);
  },
  createRoom: async (name) => {
    const providerId = getCurrentProviderId();
    const service = requireRoomAdminFeatureService(providerId, 'create');
    return await runRoomMutation(providerId, 'create', () => service.createRoom(name));
  },
  renameRoom: async (roomId, name) => {
    const providerId = requireRoomReferenceProvider(roomId);
    const service = requireRoomAdminFeatureService(providerId, 'rename');
    return await runRoomMutation(providerId, 'rename', () => service.renameRoom(roomId, name));
  },
  assignEntityToRoom: async (entityId, roomId) => {
    const providerId = resolveEntityProviderId(entityId);
    requireRoomReferenceProvider(roomId, providerId);
    const service = requireRoomAdminFeatureService(providerId, 'assign');
    await runRoomMutation(providerId, 'assign', () => service.assignEntityToRoom(entityId, roomId));
  },
  unassignEntityFromRoom: async (entityId) => {
    const providerId = resolveEntityProviderId(entityId);
    const service = requireRoomAdminFeatureService(providerId, 'unassign');
    await runRoomMutation(providerId, 'unassign', () => service.unassignEntityFromRoom(entityId));
  },
  updateEntityRoom: async (entityId, roomId) => {
    if (roomId) {
      await integrationAdminService.assignEntityToRoom(entityId, roomId);
      return;
    }

    await integrationAdminService.unassignEntityFromRoom(entityId);
  },
  updateEntityName: async (entityId, name) => {
    const providerId = resolveEntityProviderId(entityId);
    const { service } = resolveProviderService({
      providerId,
      getService: (registration) => registration.adminFeatureService,
      missingMessage: 'Room aggregation is not implemented yet for the current integration',
    });
    await service.updateEntityName(entityId, name);
  },
  deleteRoom: async (roomId) => {
    const providerId = requireRoomReferenceProvider(roomId);
    const service = requireRoomAdminFeatureService(providerId, 'delete');
    await runRoomMutation(providerId, 'delete', () => service.deleteRoom(roomId));
  },
};

function getStepReferenceFields(
  step: PlatformRoomMutationStep
): Pick<PlatformRoomMutationStepFailure, 'entityId' | 'roomId'> {
  switch (step.operation) {
    case 'create':
      return {};
    case 'rename':
    case 'delete':
      return { roomId: step.roomId };
    case 'assign':
      return { entityId: step.entityId, roomId: step.roomId };
    case 'unassign':
      return { entityId: step.entityId };
  }
}

function hasValidStepReferences(
  providerId: IntegrationProviderId,
  step: PlatformRoomMutationStep
): boolean {
  if ('roomId' in step) {
    const parsedRoom = parsePlatformRoomReference(step.roomId);
    if (!parsedRoom || parsedRoom.providerId !== providerId) {
      return false;
    }
  }

  if ('entityId' in step) {
    const parsedEntity = parseProviderScopedId(step.entityId);
    if (!parsedEntity || parsedEntity.providerId !== providerId) {
      return false;
    }
  }

  return true;
}

async function executeRoomMutationStep(
  service: ProviderAdminFeatureService,
  step: PlatformRoomMutationStep
): Promise<PlatformRoomMutationStepSuccess> {
  switch (step.operation) {
    case 'create':
      return {
        stepId: step.stepId,
        operation: step.operation,
        room: await service.createRoom(step.name),
      };
    case 'rename':
      return {
        stepId: step.stepId,
        operation: step.operation,
        room: await service.renameRoom(step.roomId, step.name),
      };
    case 'assign':
      await service.assignEntityToRoom(step.entityId, step.roomId);
      break;
    case 'unassign':
      await service.unassignEntityFromRoom(step.entityId);
      break;
    case 'delete':
      await service.deleteRoom(step.roomId);
      break;
  }

  return {
    stepId: step.stepId,
    operation: step.operation,
  };
}

export async function executeIntegrationRoomMutationPlan(
  inputPlan: PlatformRoomMutationPlan
): Promise<PlatformRoomMutationResult> {
  const plan = createPlatformRoomMutationPlan(inputPlan.providerId, inputPlan.steps);
  const capabilities = getProviderRoomManagementCapabilities(plan.providerId);
  const service = getProviderRuntimeRegistration(plan.providerId).adminFeatureService;
  const successes: PlatformRoomMutationStepSuccess[] = [];
  const failures: PlatformRoomMutationStepFailure[] = [];
  const successfulStepIds = new Set<string>();

  for (const step of plan.steps) {
    const failedDependencyStepIds = (step.dependsOn ?? []).filter(
      (stepId) => !successfulStepIds.has(stepId)
    );
    if (failedDependencyStepIds.length > 0) {
      failures.push({
        stepId: step.stepId,
        operation: step.operation,
        reason: 'dependency_failed',
        failedDependencyStepIds,
        ...getStepReferenceFields(step),
      });
      continue;
    }

    if (!capabilities[step.operation]) {
      failures.push({
        stepId: step.stepId,
        operation: step.operation,
        reason: 'unsupported',
        ...getStepReferenceFields(step),
      });
      continue;
    }

    if (!hasValidStepReferences(plan.providerId, step)) {
      failures.push({
        stepId: step.stepId,
        operation: step.operation,
        reason: 'invalid_reference',
        ...getStepReferenceFields(step),
      });
      continue;
    }

    if (!service) {
      failures.push({
        stepId: step.stepId,
        operation: step.operation,
        reason: 'provider_unavailable',
        ...getStepReferenceFields(step),
      });
      continue;
    }

    try {
      const success = await executeRoomMutationStep(service, step);
      if (success.room && success.room.providerId !== plan.providerId) {
        throw new Error('Provider returned a room owned by another provider');
      }
      successes.push(success);
      successfulStepIds.add(step.stepId);
    } catch {
      failures.push({
        stepId: step.stepId,
        operation: step.operation,
        reason: 'provider_rejected',
        ...getStepReferenceFields(step),
      });
    }
  }

  return {
    providerId: plan.providerId,
    status:
      failures.length === 0
        ? 'succeeded'
        : successes.length === 0
          ? 'failed'
          : 'partially_succeeded',
    successes,
    failures,
  };
}
