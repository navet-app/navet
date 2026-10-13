import { beforeEach, expect, it, vi } from 'vitest';

const { loaded, service, session } = vi.hoisted(() => ({
  loaded: vi.fn(),
  service: { createEvent: vi.fn() },
  session: { callWS: vi.fn() },
}));
vi.mock('./homeassistant-service-bridge', () => ({
  getHomeAssistantPanelHass: () => ({ callWS: session.callWS }),
  getHomeAssistantConnection: () => null,
  getHomeAssistantEntities: () => ({
    'calendar.family': { state: 'off', attributes: { supported_features: 1 } },
    'calendar.offline': { state: 'unavailable', attributes: { supported_features: 1 } },
  }),
}));
vi.mock('./homeassistant-calendar-create-event', () => {
  loaded();
  return { createHomeAssistantCalendarEvent: service.createEvent };
});
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  session.callWS = vi.fn();
});
const event = {
  allDay: true as const,
  title: 'Family dinner',
  startDate: '2026-10-13',
  endDate: '2026-10-14',
};

it('checks capabilities and reads events without loading creation commands', async () => {
  const { homeAssistantCalendarFeatureService: proxy } = await import(
    './homeassistant-calendar-feature.service'
  );
  expect(proxy.getCapabilities?.('calendar.family')).toEqual({ canCreate: true, available: true });
  expect(proxy.getCapabilities?.('calendar.offline')).toEqual({
    canCreate: true,
    available: false,
  });
  expect(proxy.getCapabilities?.('calendar.missing')).toEqual({
    canCreate: false,
    available: false,
  });
  expect(loaded).not.toHaveBeenCalled();
  expect(await proxy.getEvents('calendar.family')).toEqual([]);
  expect(loaded).not.toHaveBeenCalled();
  await proxy.createEvent?.('calendar.family', event);
  expect(service.createEvent).toHaveBeenCalledWith('calendar.family', event, undefined);
  expect(loaded).toHaveBeenCalledTimes(1);
});

it('rejects creation if a delayed module load crosses a household session', async () => {
  const { homeAssistantCalendarFeatureService: proxy } = await import(
    './homeassistant-calendar-feature.service'
  );
  const creation = proxy.createEvent?.('calendar.family', event);
  session.callWS = vi.fn();
  await expect(creation).rejects.toThrow('session changed');
  expect(service.createEvent).not.toHaveBeenCalled();
});
