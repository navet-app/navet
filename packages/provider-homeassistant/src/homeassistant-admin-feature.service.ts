import { getProviderNativeId } from '@navet/core/ids';
import type { PlatformMessageClient } from '@navet/core/provider-feature-models';
import type { ProviderAdminFeatureService } from '@navet/core/provider-feature-services';
import {
  createPlatformRoomReference,
  parsePlatformRoomReference,
} from '@navet/core/provider-room-management';
import {
  canReloadEntityIntegration,
  isReloadConnectionCurrent,
  resolveReloadEntryId,
  subscribeEntityIntegrationReload,
} from './homeassistant-integration-reload-availability';
import {
  callHomeAssistantService,
  createHomeAssistantArea,
  deleteHomeAssistantArea,
  renameHomeAssistantArea,
  updateHomeAssistantEntityArea,
  updateHomeAssistantEntityName,
} from './homeassistant-service-bridge';

const pendingReloadsByConnection = new WeakMap<PlatformMessageClient, Map<string, Promise<void>>>();

export const homeAssistantAdminFeatureService: ProviderAdminFeatureService & {
  canReloadEntityIntegration: (entityId: string) => boolean;
  subscribeEntityIntegrationReload: (entityId: string, listener: () => void) => () => void;
  reloadEntityIntegration: (entityId: string) => Promise<void>;
} = {
  canReloadEntityIntegration,
  subscribeEntityIntegrationReload,
  reloadEntityIntegration: async (entityId) => {
    const { connection, entryId } = await resolveReloadEntryId(entityId);
    let pendingReloads = pendingReloadsByConnection.get(connection);
    if (!pendingReloads) {
      pendingReloads = new Map();
      pendingReloadsByConnection.set(connection, pendingReloads);
    }
    const pending = pendingReloads.get(entryId);
    if (pending) return pending;
    const request = (async () => {
      const entry = await connection.sendMessagePromise<{
        config_entry: { supports_unload?: boolean | null };
      }>({ type: 'config_entries/get_single', entry_id: entryId });
      if (entry.config_entry?.supports_unload !== true) {
        throw new Error('Integration does not support reload');
      }
      if (!isReloadConnectionCurrent(entityId, connection)) {
        throw new Error('Integration reload is unavailable for this entity or session');
      }
      await callHomeAssistantService('homeassistant', 'reload_config_entry', {
        entry_id: entryId,
      });
      // The service discards async_reload's result, including failed unloads.
      const result = await connection.sendMessagePromise<{
        config_entry: { state: string };
      }>({ type: 'config_entries/get_single', entry_id: entryId });
      if (
        !isReloadConnectionCurrent(entityId, connection) ||
        result.config_entry?.state !== 'loaded'
      ) {
        throw new Error('Integration reload did not complete successfully');
      }
    })();
    pendingReloads.set(entryId, request);
    try {
      await request;
    } finally {
      pendingReloads.delete(entryId);
    }
  },
  createRoom: async (name) => {
    const area = await createHomeAssistantArea(name);
    return createPlatformRoomReference('home_assistant', area.area_id, area.name);
  },
  renameRoom: async (roomId, name) => {
    const parsedRoom = parsePlatformRoomReference(roomId);
    if (parsedRoom?.providerId !== 'home_assistant') {
      throw new Error(`Room ${roomId} does not belong to provider Home Assistant`);
    }

    const area = await renameHomeAssistantArea(parsedRoom.nativeId, name);
    return createPlatformRoomReference('home_assistant', area.area_id, area.name);
  },
  assignEntityToRoom: async (entityId, roomId) => {
    const parsedRoom = parsePlatformRoomReference(roomId);
    if (parsedRoom?.providerId !== 'home_assistant') {
      throw new Error(`Room ${roomId} does not belong to provider Home Assistant`);
    }

    await updateHomeAssistantEntityArea(getProviderNativeId(entityId), parsedRoom.nativeId);
  },
  unassignEntityFromRoom: async (entityId) => {
    await updateHomeAssistantEntityArea(getProviderNativeId(entityId), null);
  },
  updateEntityRoom: async (entityId, roomId) => {
    if (roomId) {
      await homeAssistantAdminFeatureService.assignEntityToRoom(entityId, roomId);
      return;
    }

    await homeAssistantAdminFeatureService.unassignEntityFromRoom(entityId);
  },
  updateEntityName: async (entityId, name) => {
    await updateHomeAssistantEntityName(getProviderNativeId(entityId), name);
  },
  deleteRoom: async (roomId) => {
    const parsedRoom = parsePlatformRoomReference(roomId);
    if (!parsedRoom) {
      throw new Error(`Invalid room reference: ${roomId}`);
    }

    if (parsedRoom.providerId !== 'home_assistant') {
      throw new Error(
        `Room management is not implemented yet for provider ${parsedRoom.providerId}`
      );
    }

    await deleteHomeAssistantArea(parsedRoom.nativeId);
  },
};
