import * as runtimeRegistry from '@navet/app/provider-runtime-registry';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getConnectionMock, getEntitiesMock } = vi.hoisted(() => ({
  getConnectionMock: vi.fn(),
  getEntitiesMock: vi.fn(),
}));

vi.mock('../home-assistant.service', () => ({
  homeAssistantService: {
    getConnection: getConnectionMock,
    getEntities: getEntitiesMock,
  },
}));

import {
  calendarEntityFactory,
  readOnlyCalendarEntityFixture,
} from '@navet/app/test/fixtures/home-assistant/entities/calendar';
import {
  integrationCalendarFeatureService,
  subscribeCalendarChanges,
} from '../integration-calendar-feature.service';

describe('integrationCalendarFeatureService', () => {
  beforeEach(() => {
    getConnectionMock.mockReset();
    getEntitiesMock.mockReturnValue({
      'calendar.family': calendarEntityFactory(),
      'calendar.holidays': readOnlyCalendarEntityFixture,
    });
  });

  it('keeps viewing snapshots safe when no writable calendar service is registered', () => {
    const registration = runtimeRegistry.getProviderRuntimeRegistration('home_assistant');
    const spy = vi
      .spyOn(runtimeRegistry, 'getProviderRuntimeRegistration')
      .mockReturnValueOnce({ ...registration, calendarFeatureService: undefined });
    try {
      expect(integrationCalendarFeatureService.getCapabilities('calendar.family')).toEqual({
        canCreate: false,
        available: false,
      });
      expect(integrationCalendarFeatureService.getCapabilities('homey:calendar.family')).toEqual({
        canCreate: false,
        available: false,
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('loads calendar events through the HA adapter contract', async () => {
    const sendMessagePromise = vi.fn().mockResolvedValue({
      response: {
        'calendar.family': {
          events: [{ summary: 'School pickup' }],
        },
      },
    });
    getConnectionMock.mockReturnValue({ sendMessagePromise });

    await expect(integrationCalendarFeatureService.getEvents('calendar.family')).resolves.toEqual([
      { summary: 'School pickup' },
    ]);
    expect(sendMessagePromise).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'call_service',
        domain: 'calendar',
        service: 'get_events',
        target: { entity_id: 'calendar.family' },
        return_response: true,
      })
    );
  });

  it('accepts an injected message client through the provider contract options', async () => {
    const sendMessagePromise = vi.fn().mockResolvedValue({
      response: {
        'calendar.family': {
          events: [{ summary: 'Dentist' }],
        },
      },
    });

    await expect(
      integrationCalendarFeatureService.getEvents('calendar.family', {
        messageClient: { sendMessagePromise },
      })
    ).resolves.toEqual([{ summary: 'Dentist' }]);
    expect(getConnectionMock).not.toHaveBeenCalled();
  });

  it('creates timed events on the owning HA adapter using explicit instants', async () => {
    const sendMessagePromise = vi.fn().mockResolvedValue({});
    await integrationCalendarFeatureService.createEvent(
      'home_assistant:calendar.family',
      {
        title: 'School pickup',
        allDay: false,
        startDateTime: '2026-10-15T15:00:00+02:00',
        endDateTime: '2026-10-15T16:00:00+02:00',
      },
      { messageClient: { sendMessagePromise } }
    );
    expect(sendMessagePromise).toHaveBeenCalledWith({
      type: 'call_service',
      domain: 'calendar',
      service: 'create_event',
      target: { entity_id: 'calendar.family' },
      service_data: {
        summary: 'School pickup',
        start_date_time: '2026-10-15T15:00:00+02:00',
        end_date_time: '2026-10-15T16:00:00+02:00',
      },
    });
  });

  it('notifies event readers only after a successful creation', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCalendarChanges(listener);
    const sendMessagePromise = vi
      .fn()
      .mockRejectedValueOnce(new Error('Failed'))
      .mockResolvedValueOnce({});
    const event = {
      title: 'Holiday',
      allDay: true as const,
      startDate: '2026-10-25',
      endDate: '2026-10-26',
    };
    const options = { messageClient: { sendMessagePromise } };
    try {
      await expect(
        integrationCalendarFeatureService.createEvent(
          'home_assistant:calendar.family',
          event,
          options
        )
      ).rejects.toThrow();
      expect(listener).not.toHaveBeenCalled();
      await integrationCalendarFeatureService.createEvent(
        'home_assistant:calendar.family',
        event,
        options
      );
      expect(listener).toHaveBeenCalledExactlyOnceWith('home_assistant:calendar.family');
    } finally {
      unsubscribe();
    }
  });

  it('keeps all-day dates separate from timed events', async () => {
    const sendMessagePromise = vi.fn().mockResolvedValue({});
    await integrationCalendarFeatureService.createEvent(
      'calendar.family',
      {
        title: 'Holiday',
        allDay: true,
        startDate: '2026-10-25',
        endDate: '2026-10-26',
      },
      { messageClient: { sendMessagePromise } }
    );
    expect(sendMessagePromise).toHaveBeenCalledWith(
      expect.objectContaining({
        service_data: { summary: 'Holiday', start_date: '2026-10-25', end_date: '2026-10-26' },
      })
    );
  });

  it('does not write to read-only, unavailable or foreign calendars', async () => {
    const event = {
      title: 'Holiday',
      allDay: true as const,
      startDate: '2026-10-25',
      endDate: '2026-10-26',
    };
    const sendMessagePromise = vi.fn();
    const options = { messageClient: { sendMessagePromise } };
    expect(integrationCalendarFeatureService.getCapabilities('calendar.holidays').canCreate).toBe(
      false
    );
    await expect(
      integrationCalendarFeatureService.createEvent('calendar.holidays', event, options)
    ).rejects.toThrow();
    getEntitiesMock.mockReturnValue({
      'calendar.family': { state: 'unavailable', attributes: { supported_features: 1 } },
    });
    await expect(
      integrationCalendarFeatureService.createEvent('calendar.family', event, options)
    ).rejects.toThrow();
    await expect(
      integrationCalendarFeatureService.createEvent('homey:calendar.family', event, options)
    ).rejects.toThrow();
    expect(sendMessagePromise).not.toHaveBeenCalled();
  });

  it('rejects invalid ranges and propagates service failures', async () => {
    const sendMessagePromise = vi.fn().mockRejectedValue(new Error('Permission denied'));
    const event = {
      title: 'Holiday',
      allDay: true as const,
      startDate: '2026-10-25',
      endDate: '2026-10-26',
    };
    const options = { messageClient: { sendMessagePromise } };
    await expect(
      integrationCalendarFeatureService.createEvent(
        'calendar.family',
        { ...event, endDate: event.startDate },
        options
      )
    ).rejects.toThrow();
    expect(sendMessagePromise).not.toHaveBeenCalled();
    await expect(
      integrationCalendarFeatureService.createEvent('calendar.family', event, options)
    ).rejects.toThrow('Permission denied');
  });

  it('rejects non-Home Assistant calendar entities', async () => {
    await expect(
      integrationCalendarFeatureService.getEvents('homey:calendar.family')
    ).rejects.toThrow('Calendar events are not supported for the current integration yet');
  });
});
