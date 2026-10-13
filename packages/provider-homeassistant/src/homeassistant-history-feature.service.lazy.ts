import type { ProviderHistoryFeatureService } from '@navet/core/provider-feature-services';
import { createSessionBoundFeatureLoader } from './homeassistant-lazy-feature-service';
import { getHomeAssistantConnection } from './homeassistant-service-bridge';

const withService = createSessionBoundFeatureLoader(async () => {
  const module = await import('./homeassistant-history-feature.service');
  return module.homeAssistantHistoryFeatureService;
});

export const lazyHomeAssistantHistoryFeatureService: ProviderHistoryFeatureService = {
  getMessageClient: () => getHomeAssistantConnection(),
  supportsStatisticsHistory: (entityId) => entityId.startsWith('sensor.'),
  supportsEnergyStatistics: (entityId) => entityId.startsWith('sensor.'),
  getActivity: (request) =>
    withService((service) => {
      if (!service.getActivity) throw new Error('Home Assistant activity is unavailable');
      return service.getActivity(request);
    }),
  getEntityHistories: (request) =>
    withService((service) => {
      if (!service.getEntityHistories) throw new Error('Home Assistant history is unavailable');
      return service.getEntityHistories(request);
    }),
  getEntityHistory: (request) =>
    withService((service) => {
      if (!service.getEntityHistory) throw new Error('Home Assistant history is unavailable');
      return service.getEntityHistory(request);
    }),
  getStatisticsHistory: (request) =>
    withService((service) => {
      if (!service.getStatisticsHistory) throw new Error('Home Assistant history is unavailable');
      return service.getStatisticsHistory(request);
    }),
};
