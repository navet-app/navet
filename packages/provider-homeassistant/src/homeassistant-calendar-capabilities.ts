import { getHomeAssistantEntities } from './homeassistant-service-bridge';

export function getHomeAssistantCalendarCapabilities(entityId: string) {
  const entity = getHomeAssistantEntities()?.[entityId];
  const features = entity?.attributes.supported_features;
  return {
    canCreate: typeof features === 'number' && (features & 1) !== 0,
    available: Boolean(entity && !['unavailable', 'unknown'].includes(entity.state)),
  };
}
