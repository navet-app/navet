import type { ProviderCalendarFeatureService } from '@navet/app/platform/provider-feature-services';
import type {
  PlatformCalendarCreateEvent,
  PlatformCalendarRequestOptions,
} from '@navet/core/provider-feature-models';
import { resolveProviderFeatureService } from './integration-provider-service';

const changeListeners = new Set<(entityId: string) => void>();

export function subscribeCalendarChanges(listener: (entityId: string) => void) {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

function resolveCalendar(entityId: string) {
  return resolveProviderFeatureService({
    entityId,
    feature: 'calendar',
    getService: (registration) => registration.calendarFeatureService,
    unsupportedMessage: 'Calendar events are not supported for the current integration yet',
    missingMessage: 'Calendar support is not implemented yet for the current integration',
  });
}

export const integrationCalendarFeatureService = {
  getCapabilities(entityId) {
    // Viewing/demo snapshots may exist without a writable feature service.
    try {
      const { nativeEntityId, service } = resolveCalendar(entityId);
      return nativeEntityId && service.getCapabilities
        ? service.getCapabilities(nativeEntityId)
        : { canCreate: false, available: false };
    } catch {
      return { canCreate: false, available: false };
    }
  },
  async createEvent(
    entityId: string,
    event: PlatformCalendarCreateEvent,
    options?: PlatformCalendarRequestOptions
  ) {
    const { nativeEntityId, service } = resolveCalendar(entityId);
    if (!nativeEntityId || !service.createEvent)
      throw new Error('Calendar creation is not supported');
    await service.createEvent(nativeEntityId, event, options);
    for (const listener of changeListeners) listener(entityId);
  },
  async getEvents(entityId: string, options?: PlatformCalendarRequestOptions) {
    const { nativeEntityId, service } = resolveCalendar(entityId);
    if (!nativeEntityId) {
      throw new Error('Calendar events require an entity id');
    }
    return await service.getEvents(nativeEntityId, options);
  },
} satisfies ProviderCalendarFeatureService;
