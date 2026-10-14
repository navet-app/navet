import type { ProviderCalendarFeatureService } from '@navet/core/provider-feature-services';
import { getHomeAssistantCalendarCapabilities } from './homeassistant-calendar-capabilities';
import { lazyCreateHomeAssistantCalendarEvent } from './homeassistant-calendar-feature.service.lazy';
import { getHomeAssistantConnection } from './homeassistant-service-bridge';

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
  getCapabilities: getHomeAssistantCalendarCapabilities,
  createEvent: lazyCreateHomeAssistantCalendarEvent,
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
