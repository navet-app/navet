import type { ProviderCalendarFeatureService } from '@navet/core/provider-feature-services';
import { getHomeAssistantCalendarCapabilities } from './homeassistant-calendar-capabilities';
import { getHomeAssistantConnection } from './homeassistant-service-bridge';

export const createHomeAssistantCalendarEvent: NonNullable<
  ProviderCalendarFeatureService['createEvent']
> = async (entityId, event, options) => {
  const capabilities = getHomeAssistantCalendarCapabilities(entityId);
  if (!capabilities?.canCreate || !capabilities.available) {
    throw new Error('This calendar cannot create events right now');
  }
  const messageClient = options?.messageClient ?? getHomeAssistantConnection();
  if (!messageClient) throw new Error('Calendar connection is unavailable');
  if (!event.title.trim()) throw new Error('An event title is required');
  const start = event.allDay ? event.startDate : event.startDateTime;
  const end = event.allDay ? event.endDate : event.endDateTime;
  const validDate = (value: string) => {
    const date = new Date(value);
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  };
  const validTime = (value: string) =>
    value.includes('T') && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value));
  if (
    !(event.allDay ? validDate(start) && validDate(end) : validTime(start) && validTime(end)) ||
    Date.parse(end) <= Date.parse(start)
  ) {
    throw new Error('The event needs a valid start and a later end');
  }
  await messageClient.sendMessagePromise({
    type: 'call_service',
    domain: 'calendar',
    service: 'create_event',
    target: { entity_id: entityId },
    service_data: {
      summary: event.title.trim(),
      ...(event.description ? { description: event.description } : {}),
      ...(event.location ? { location: event.location } : {}),
      ...(event.allDay
        ? { start_date: start, end_date: end }
        : { start_date_time: start, end_date_time: end }),
    },
  });
};
