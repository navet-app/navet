import type { ProviderCalendarFeatureService } from '@navet/core/provider-feature-services';
import {
  getHomeAssistantConnection,
  getHomeAssistantEntities,
} from './homeassistant-service-bridge';

type CalendarServiceEvent = Record<string, unknown>;

type CalendarEventsServicePayload = {
  response?: Record<
    string,
    {
      events?: CalendarServiceEvent[];
    }
  >;
};

type CalendarEventsServiceEnvelope = CalendarEventsServicePayload & {
  result?: CalendarEventsServicePayload;
};

function getActiveMessageClient(
  messageClient?: { sendMessagePromise<T>(message: unknown): Promise<T> } | null
) {
  return messageClient ?? getHomeAssistantConnection();
}

export const homeAssistantCalendarFeatureService: ProviderCalendarFeatureService = {
  getCapabilities(entityId) {
    const entity = getHomeAssistantEntities()?.[entityId];
    const features = entity?.attributes.supported_features;
    return {
      canCreate: typeof features === 'number' && (features & 1) !== 0,
      available: Boolean(entity && !['unavailable', 'unknown'].includes(entity.state)),
    };
  },
  async createEvent(entityId, event, options) {
    const capabilities = homeAssistantCalendarFeatureService.getCapabilities?.(entityId);
    if (!capabilities?.canCreate || !capabilities.available) {
      throw new Error('This calendar cannot create events right now');
    }
    const messageClient = getActiveMessageClient(options?.messageClient);
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
      value.includes('T') &&
      /(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
      !Number.isNaN(Date.parse(value));
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
  },
  async getEvents(entityId, options) {
    const messageClient = getActiveMessageClient(options?.messageClient);
    if (!messageClient) {
      return [];
    }

    const now = new Date();
    const startDateTime = options?.startDateTime ?? now.toISOString();
    const endDateTime =
      options?.endDateTime ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const response = (await messageClient.sendMessagePromise({
      type: 'call_service',
      domain: 'calendar',
      service: 'get_events',
      target: { entity_id: entityId },
      service_data: {
        start_date_time: startDateTime,
        end_date_time: endDateTime,
      },
      return_response: true,
    })) as CalendarEventsServiceEnvelope;

    const payload = response.response ?? response.result?.response;
    return payload?.[entityId]?.events ?? [];
  },
};
