import type { ProviderAdminFeatureService } from '@navet/core/provider-feature-services';

import { createSessionBoundFeatureLoader } from './homeassistant-lazy-feature-service';

async function getService() {
  const module = await import('./homeassistant-admin-feature.service');
  return module.homeAssistantAdminFeatureService;
}

let availability: typeof import('./homeassistant-integration-reload-availability') | undefined;

const withService = createSessionBoundFeatureLoader(getService);

export const lazyHomeAssistantAdminFeatureService: ProviderAdminFeatureService = {
  canReloadEntityIntegration(entityId) {
    return availability?.canReloadEntityIntegration(entityId) ?? false;
  },
  subscribeEntityIntegrationReload(entityId, listener) {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void import('./homeassistant-integration-reload-availability')
      .then((module) => {
        availability = module;
        if (disposed) return;
        unsubscribe = module.subscribeEntityIntegrationReload(entityId, listener);
        listener();
      })
      .catch(() => {
        // Unknown availability stays hidden; a new subscription can retry loading.
      });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  },
  async reloadEntityIntegration(entityId) {
    return withService((service) => service.reloadEntityIntegration(entityId));
  },
  async createRoom(name) {
    return withService((service) => service.createRoom(name));
  },
  async renameRoom(roomId, name) {
    return withService((service) => service.renameRoom(roomId, name));
  },
  async assignEntityToRoom(entityId, roomId) {
    return withService((service) => service.assignEntityToRoom(entityId, roomId));
  },
  async unassignEntityFromRoom(entityId) {
    return withService((service) => service.unassignEntityFromRoom(entityId));
  },
  async updateEntityRoom(entityId, roomId) {
    return withService((service) => service.updateEntityRoom(entityId, roomId));
  },
  async updateEntityName(entityId, name) {
    return withService((service) => service.updateEntityName(entityId, name));
  },
  async deleteRoom(roomId) {
    return withService((service) => service.deleteRoom(roomId));
  },
};
