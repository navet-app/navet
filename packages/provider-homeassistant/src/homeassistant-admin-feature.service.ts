import { getProviderNativeId, parseProviderScopedId } from '@navet/core/ids';
import type { ProviderAdminFeatureService } from '@navet/core/provider-feature-services';
import {
  createPlatformRoomReference,
  parsePlatformRoomReference,
} from '@navet/core/provider-room-management';
import {
  callHomeAssistantService,
  createHomeAssistantArea,
  deleteHomeAssistantArea,
  getHomeAssistantConnection,
  getHomeAssistantEntityRegistry,
  getHomeAssistantStoreState,
  renameHomeAssistantArea,
  updateHomeAssistantEntityArea,
  updateHomeAssistantEntityName,
} from './homeassistant-service-bridge';

function getReloadEntryId(entityId: string): string | null {
  const scopedId = parseProviderScopedId(entityId);
  if (scopedId && scopedId.providerId !== 'home_assistant') return null;
  const state = getHomeAssistantStoreState();
  if (!state.connected || state.user?.is_admin !== true) return null;
  const entry = getHomeAssistantEntityRegistry().find(
    (entry) => entry.entity_id === getProviderNativeId(entityId)
  );
  return entry?.config_entry_id || null;
}

const pendingReloads = new Map<string, Promise<void>>();

export const homeAssistantAdminFeatureService: ProviderAdminFeatureService & {
  canReloadEntityIntegration: (entityId: string) => boolean;
  reloadEntityIntegration: (entityId: string) => Promise<void>;
} = {
  canReloadEntityIntegration: (entityId) => getReloadEntryId(entityId) !== null,
  reloadEntityIntegration: async (entityId) => {
    const entryId = getReloadEntryId(entityId);
    if (!entryId) throw new Error('Integration reload is unavailable for this entity or session');
    const pending = pendingReloads.get(entryId);
    if (pending) return pending;
    const connection = getHomeAssistantConnection();
    if (!connection) throw new Error('Home Assistant is not connected');
    const request = (async () => {
      await callHomeAssistantService('homeassistant', 'reload_config_entry', {
        entry_id: entryId,
      });
      // The service discards async_reload's result, including failed unloads.
      const result = await connection.sendMessagePromise<{
        config_entry: { state: string };
      }>({ type: 'config_entries/get_single', entry_id: entryId });
      if (result.config_entry?.state !== 'loaded') {
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
