import type { Connection, HassConfig, HassEntity, HassUser } from 'home-assistant-js-websocket';
import { describe, expect, it, vi } from 'vitest';
import {
  HomeAssistantPanelAdapter,
  type HomeAssistantPanelHass,
} from '../home-assistant-panel-adapter';

const config = {
  latitude: 0,
  longitude: 0,
  elevation: 0,
  radius: 100,
  unit_system: {
    length: 'km',
    mass: 'g',
    volume: 'L',
    temperature: 'C',
    pressure: 'Pa',
    wind_speed: 'm/s',
    accumulated_precipitation: 'mm',
  },
  location_name: 'Home',
  time_zone: 'Europe/Stockholm',
  components: [],
  config_dir: '/config',
  allowlist_external_dirs: [],
  allowlist_external_urls: [],
  version: '2026.5.0',
  config_source: 'storage',
  recovery_mode: false,
  safe_mode: false,
  state: 'RUNNING',
  external_url: null,
  internal_url: null,
  currency: 'SEK',
  country: 'SE',
  language: 'en',
} satisfies HassConfig;

const user = {
  id: 'user-1',
  is_admin: true,
  is_owner: true,
  name: 'Panel User',
} as HassUser;

const states = {
  'light.kitchen': {
    entity_id: 'light.kitchen',
    state: 'on',
    last_changed: '2026-05-18T00:00:00.000Z',
    last_updated: '2026-05-18T00:00:00.000Z',
    attributes: { friendly_name: 'Kitchen' },
    context: {
      id: 'context-1',
      user_id: 'user-1',
      parent_id: null,
    },
  },
} satisfies Record<string, HassEntity>;

function createCallWS(results: unknown[] = []): HomeAssistantPanelHass['callWS'] {
  const queue = [...results];
  const handler: HomeAssistantPanelHass['callWS'] = async <T = unknown>() => queue.shift() as T;
  return vi.fn(handler) as HomeAssistantPanelHass['callWS'];
}

function createPanelHass(overrides: Partial<HomeAssistantPanelHass> = {}): HomeAssistantPanelHass {
  return {
    states,
    config,
    user,
    callService: vi.fn(async () => undefined),
    callWS: createCallWS([[]]),
    ...overrides,
  };
}

describe('HomeAssistantPanelAdapter', () => {
  // Keep: connection identity must distinguish sessions while preserving ordinary hass updates.
  it('preserves the connection bridge across panel state updates', async () => {
    const connection = {} as Connection;
    const adapter = new HomeAssistantPanelAdapter(createPanelHass({ connection }));
    const bridge = adapter.getConnection();
    expect(adapter.getConnection()).toBe(bridge);
    const callWS = createCallWS([{ ok: true }]);
    adapter.update(createPanelHass({ connection, callWS }));
    expect(adapter.getConnection()).toBe(bridge);
    await expect(bridge.sendMessagePromise({ type: 'config_entries/get_single' })).resolves.toEqual(
      { ok: true }
    );
    expect(callWS).toHaveBeenCalledOnce();
  });

  it('replaces the bridge when the panel user changes on the same host connection', () => {
    const connection = {} as Connection;
    const adapter = new HomeAssistantPanelAdapter(createPanelHass({ connection }));
    const original = adapter.getConnection();
    adapter.update(createPanelHass({ connection, user: { ...user, id: 'user-2' } }));
    expect(adapter.getConnection()).not.toBe(original);
  });

  it('replaces the bridge when the host session changes and keeps old requests on their session', async () => {
    const originalCallWS = createCallWS([{ session: 'original' }]);
    const adapter = new HomeAssistantPanelAdapter(
      createPanelHass({ connection: {} as Connection, callWS: originalCallWS })
    );
    const bridge = adapter.getConnection();
    const nextCallWS = createCallWS([{ session: 'next' }]);
    adapter.update(createPanelHass({ connection: {} as Connection, callWS: nextCallWS }));
    expect(adapter.getConnection()).not.toBe(bridge);
    await expect(bridge.sendMessagePromise({ type: 'config_entries/get_single' })).resolves.toEqual(
      { session: 'original' }
    );
    expect(nextCallWS).not.toHaveBeenCalled();
  });

  it('exposes injected Home Assistant state without opening a websocket', () => {
    const adapter = new HomeAssistantPanelAdapter(createPanelHass());

    expect(adapter.getConfig()).toBe(config);
    expect(adapter.getEntities()).toBe(states);
    expect(adapter.getUser()).toBe(user);
  });

  it('routes service calls through the injected hass object', async () => {
    const callService = vi.fn(async () => undefined);
    const adapter = new HomeAssistantPanelAdapter(createPanelHass({ callService }));

    await adapter.callService(
      'light',
      'turn_on',
      { brightness_pct: 50 },
      { entity_id: 'light.kitchen' }
    );

    expect(callService).toHaveBeenCalledWith(
      'light',
      'turn_on',
      { brightness_pct: 50, entity_id: 'light.kitchen' },
      { entity_id: 'light.kitchen' }
    );
  });

  it('routes REST calls through the injected hass session', async () => {
    const callApi = vi.fn(async () => [[{ state: 'on' }]]) as unknown as NonNullable<
      HomeAssistantPanelHass['callApi']
    >;
    const adapter = new HomeAssistantPanelAdapter(createPanelHass({ callApi }));

    await expect(
      adapter.callApi('GET', '/api/history/period?filter_entity_id=light.kitchen')
    ).resolves.toEqual([[{ state: 'on' }]]);
    expect(callApi).toHaveBeenCalledWith(
      'GET',
      'history/period?filter_entity_id=light.kitchen',
      undefined
    );
  });

  it('does not make an unauthenticated REST request when the hass API bridge is unavailable', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new HomeAssistantPanelAdapter(createPanelHass());

    await expect(
      adapter.callApi('GET', '/api/history/period?filter_entity_id=light.kitchen')
    ).rejects.toThrow('require the authenticated hass API bridge');
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('loads registries with Home Assistant websocket commands', async () => {
    const callWS = createCallWS([
      [{ area_id: 'kitchen', name: 'Kitchen' }],
      [{ id: 'device-1', area_id: 'kitchen' }],
      [
        {
          entity_id: 'automation.morning',
          device_id: 'device-1',
          categories: { automation: 'morning-id' },
        },
      ],
      [{ category_id: 'morning-id', name: 'Morning' }],
    ]);
    const adapter = new HomeAssistantPanelAdapter(createPanelHass({ callWS }));

    await expect(adapter.loadRegistries()).resolves.toEqual({
      areas: [{ area_id: 'kitchen', name: 'Kitchen' }],
      devices: [{ id: 'device-1', area_id: 'kitchen' }],
      entities: [
        {
          entity_id: 'automation.morning',
          device_id: 'device-1',
          categories: { automation: 'morning-id' },
        },
      ],
      automationCategories: [{ category_id: 'morning-id', name: 'Morning' }],
    });

    expect(callWS).toHaveBeenNthCalledWith(1, { type: 'config/area_registry/list' });
    expect(callWS).toHaveBeenNthCalledWith(2, { type: 'config/device_registry/list' });
    expect(callWS).toHaveBeenNthCalledWith(3, { type: 'config/entity_registry/list' });
    expect(callWS).toHaveBeenNthCalledWith(4, {
      type: 'config/category_registry/list',
      scope: 'automation',
    });
  });

  it('returns a connection-compatible websocket command bridge', async () => {
    const callWS = createCallWS([{ ok: true }]);
    const adapter = new HomeAssistantPanelAdapter(createPanelHass({ callWS }));

    await expect(
      adapter.getConnection().sendMessagePromise({ type: 'camera/capabilities' })
    ).resolves.toEqual({ ok: true });
  });

  it('routes websocket subscriptions through the injected frontend connection', async () => {
    const unsubscribe = vi.fn();
    const subscribeMessage = vi.fn(async () => unsubscribe);
    const adapter = new HomeAssistantPanelAdapter(
      createPanelHass({
        connection: {
          subscribeMessage,
        } as unknown as HomeAssistantPanelHass['connection'],
      })
    );
    const callback = vi.fn();

    await expect(
      adapter.getConnection().subscribeMessage(callback, {
        type: 'persistent_notification/subscribe',
      })
    ).resolves.toBe(unsubscribe);

    expect(subscribeMessage).toHaveBeenCalledWith(
      callback,
      { type: 'persistent_notification/subscribe' },
      undefined
    );
  });

  it('exposes a subscription method even when Home Assistant omits the frontend connection', async () => {
    const adapter = new HomeAssistantPanelAdapter(createPanelHass());

    await expect(
      adapter.getConnection().subscribeMessage(vi.fn(), {
        type: 'persistent_notification/subscribe',
      })
    ).rejects.toThrow('Home Assistant panel connection cannot subscribe');
  });
});
