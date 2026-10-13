import type { ProviderCalendarFeatureService } from '@navet/core/provider-feature-services';
import { createSessionBoundFeatureLoader } from './homeassistant-lazy-feature-service';

const withCreation = createSessionBoundFeatureLoader(async () => {
  const module = await import('./homeassistant-calendar-create-event');
  return module.createHomeAssistantCalendarEvent;
});

export const lazyCreateHomeAssistantCalendarEvent: NonNullable<
  ProviderCalendarFeatureService['createEvent']
> = (entityId, event, options) =>
  withCreation(
    (create) => create(entityId, event, options),
    options?.messageClient ? () => options.messageClient : undefined
  );
