import type { HomeAssistantPanelHass } from '@navet/app/services/home-assistant-panel-adapter';
import {
  householdRegistryAfter,
  householdRegistryBefore,
  householdRegistryEvents,
} from '@navet/app/test/fixtures/home-assistant/registries/household';
import { createHomeAssistantEntityMapper } from '@navet/provider-homeassistant';
import type { HassConfig, HassEntity, HassUser } from 'home-assistant-js-websocket';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HAConnectionService from '../ha-connection.service';
import { homeAssistantService } from '../home-assistant.service';

const panelConfig = {
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
  location_name: 'Ingress Home',
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

const panelUser = {
  id: 'panel-user',
  is_admin: true,
  is_owner: true,
  name: 'Panel User',
} as HassUser;

function createAlarmEntity(state: string): HassEntity {
  return {
    entity_id: 'alarm_control_panel.home',
    state,
    attributes: {
      friendly_name: 'Home Alarm',
      supported_features: 3,
    },
    last_changed: '2026-06-07T18:00:00.000Z',
    last_updated: '2026-06-07T18:00:00.000Z',
    context: {
      id: 'ctx-1',
      parent_id: null,
      user_id: 'panel-user',
    },
  };
}

function createPanelHass(state: string): HomeAssistantPanelHass {
  return {
    states: {
      'alarm_control_panel.home': createAlarmEntity(state),
    },
    config: panelConfig,
    user: panelUser,
    connection: {
      sendMessagePromise: vi.fn(async () => ({ ok: true })),
      subscribeMessage: vi.fn(async () => vi.fn()),
    } as unknown as HomeAssistantPanelHass['connection'],
    callService: vi.fn(async () => undefined),
    callWS: vi.fn(async () => ({ ok: true })) as HomeAssistantPanelHass['callWS'],
  };
}

describe('homeAssistantService panel bridge updates', () => {
  beforeEach(() => {
    homeAssistantService.disconnect();
  });

  it('emits entity updates when the ingress bridge refreshes in place', () => {
    const entityStates: string[] = [];
    const unsubscribe = homeAssistantService.addListener('entities', (entities) => {
      entityStates.push(entities['alarm_control_panel.home']?.state ?? 'missing');
    });

    const hass = createPanelHass('disarmed');
    homeAssistantService.setPanelHass(hass);

    hass.states['alarm_control_panel.home'].state = 'armed_home';
    homeAssistantService.setPanelHass(hass);

    unsubscribe();

    expect(entityStates).toEqual(['disarmed', 'armed_home']);
  });
});

describe('Home Assistant registry freshness', () => {
  beforeEach(() => {
    homeAssistantService.disconnect();
    vi.useFakeTimers();
  });
  afterEach(() => {
    homeAssistantService.disconnect();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function registryPanel() {
    const callbacks = new Map<string, (event: unknown) => void>();
    const readyListeners = new Set<() => void>();
    const unsubscribe = vi.fn();
    const hass = createPanelHass('disarmed');
    hass.states = {
      'light.kitchen_island': {
        ...createAlarmEntity('on'),
        entity_id: 'light.kitchen_island',
        attributes: { friendly_name: 'Ceiling light', supported_features: 0 },
      },
    };
    let snapshot = householdRegistryBefore;
    hass.callWS = vi.fn(async (message: Record<string, unknown>) => {
      switch (message.type) {
        case 'config/area_registry/list':
          return snapshot.areas;
        case 'config/device_registry/list':
          return snapshot.devices;
        case 'config/entity_registry/list':
          return snapshot.entities;
        default:
          return [];
      }
    }) as HomeAssistantPanelHass['callWS'];
    hass.connection = {
      subscribeMessage: vi.fn(async (callback, message) => {
        callbacks.set(message.event_type, callback);
        return unsubscribe;
      }),
      addEventListener: vi.fn((_type, listener) => readyListeners.add(listener)),
      removeEventListener: vi.fn((_type, listener) => readyListeners.delete(listener)),
    } as unknown as HomeAssistantPanelHass['connection'];
    return {
      hass,
      callbacks,
      readyListeners,
      unsubscribe,
      update: () => {
        snapshot = householdRegistryAfter;
      },
    };
  }

  it('loads callWS-only panel registries without creating event subscriptions', async () => {
    const panel = registryPanel();
    panel.hass.connection = undefined;
    homeAssistantService.setPanelHass(panel.hass);
    expect(panel.hass.callWS).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(homeAssistantService.getAreas()).toEqual(householdRegistryBefore.areas);
    expect(panel.hass.callWS).toHaveBeenCalledTimes(4);
    expect(panel.callbacks.size).toBe(0);
    expect(panel.readyListeners.size).toBe(0);
  });

  it('preserves callWS-only metadata across ordinary hass wrapper updates', async () => {
    const panel = registryPanel();
    panel.hass.connection = undefined;
    homeAssistantService.setPanelHass(panel.hass);
    await homeAssistantService.loadRegistries();
    await vi.advanceTimersByTimeAsync(100);
    const calls = vi.mocked(panel.hass.callWS).mock.calls.length;
    homeAssistantService.setPanelHass({ ...panel.hass, states: { ...panel.hass.states } });
    expect(homeAssistantService.getAreas()).toEqual(householdRegistryBefore.areas);
    await vi.advanceTimersByTimeAsync(100);
    expect(panel.hass.callWS).toHaveBeenCalledTimes(calls);
  });

  it('clears callWS-only household metadata before a failed replacement session refresh', async () => {
    const householdA = registryPanel();
    householdA.hass.connection = undefined;
    homeAssistantService.setPanelHass(householdA.hass);
    await homeAssistantService.loadRegistries();
    expect(homeAssistantService.getAreas()).toEqual(householdRegistryBefore.areas);
    const householdB = registryPanel();
    householdB.hass.connection = undefined;
    householdB.hass.callWS = vi.fn(async () => {
      throw new Error('household B registry denied');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    homeAssistantService.setPanelHass(householdB.hass);
    expect(homeAssistantService.getAreas()).toEqual([]);
    expect(homeAssistantService.getDeviceRegistry()).toEqual([]);
    expect(homeAssistantService.getEntityRegistry()).toEqual([]);
    await vi.advanceTimersByTimeAsync(100);
    expect(householdB.hass.callWS).toHaveBeenCalledTimes(4);
    expect(homeAssistantService.getAreas()).toEqual([]);
  });

  it('refreshes callWS-only registry edits on a bounded cadence despite fresh hass wrappers', async () => {
    const panel = registryPanel();
    panel.hass.connection = undefined;
    homeAssistantService.setPanelHass(panel.hass);
    await vi.advanceTimersByTimeAsync(100);
    const states = homeAssistantService.getEntities();
    panel.update();
    for (let second = 0; second < 30; second += 1) {
      homeAssistantService.setPanelHass({ ...panel.hass, states: { ...panel.hass.states } });
      await vi.advanceTimersByTimeAsync(1000);
    }
    await vi.advanceTimersByTimeAsync(100);
    expect(panel.hass.callWS).toHaveBeenCalledTimes(8);
    expect(panel.callbacks.size).toBe(0);
    expect(homeAssistantService.getEntities()).toEqual(states);
    const mapper = createHomeAssistantEntityMapper();
    expect(
      mapper.map({
        entities: homeAssistantService.getEntities() ?? {},
        areas: homeAssistantService.getAreas(),
        deviceRegistry: homeAssistantService.getDeviceRegistry(),
        entityRegistry: homeAssistantService.getEntityRegistry(),
      })[0]
    ).toMatchObject({ name: 'Dining lights', room: 'Dining room' });
  });

  it('releases the callWS-only poll when a native panel replaces it and on disconnect', async () => {
    const panel = registryPanel();
    panel.hass.connection = undefined;
    homeAssistantService.setPanelHass(panel.hass);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(30000);
    expect(panel.hass.callWS).toHaveBeenCalledTimes(8);
    const native = registryPanel();
    homeAssistantService.setPanelHass(native.hass);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(60000);
    expect(panel.hass.callWS).toHaveBeenCalledTimes(8);
    expect(native.hass.callWS).toHaveBeenCalledTimes(4);
    homeAssistantService.setPanelHass(panel.hass);
    await vi.advanceTimersByTimeAsync(100);
    homeAssistantService.disconnect();
    await vi.advanceTimersByTimeAsync(60000);
    expect(panel.hass.callWS).toHaveBeenCalledTimes(12);
  });

  it('keeps the last useful callWS-only snapshot after polling fails and recovers on the next tick', async () => {
    const panel = registryPanel();
    panel.hass.connection = undefined;
    const callWS = panel.hass.callWS;
    let denied = false;
    panel.hass.callWS = vi.fn(async (message) => {
      if (denied) throw new Error('temporary registry failure');
      return callWS(message);
    }) as HomeAssistantPanelHass['callWS'];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    homeAssistantService.setPanelHass(panel.hass);
    await vi.advanceTimersByTimeAsync(100);
    denied = true;
    panel.update();
    await vi.advanceTimersByTimeAsync(30000);
    expect(homeAssistantService.getAreas()).toEqual(householdRegistryBefore.areas);
    denied = false;
    await vi.advanceTimersByTimeAsync(30000);
    expect(homeAssistantService.getAreas()).toEqual(householdRegistryAfter.areas);
    expect(panel.hass.callWS).toHaveBeenCalledTimes(12);
  });

  it.each(['before', 'after'] as const)(
    'refreshes a replacement panel while an obsolete load settles %s it',
    async (obsoleteSettles) => {
      const householdA = registryPanel();
      householdA.hass.connection = undefined;
      const callWS = householdA.hass.callWS;
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      householdA.hass.callWS = vi.fn(async (message) => {
        await gate;
        return callWS(message);
      }) as HomeAssistantPanelHass['callWS'];
      homeAssistantService.setPanelHass(householdA.hass);
      await vi.advanceTimersByTimeAsync(100);
      expect(householdA.hass.callWS).toHaveBeenCalledTimes(4);
      const householdB = registryPanel();
      householdB.hass.connection = undefined;
      householdB.update();
      const callWSB = householdB.hass.callWS;
      let releaseB = () => {};
      const gateB = new Promise<void>((resolve) => {
        releaseB = resolve;
      });
      householdB.hass.callWS = vi.fn(async (message) => {
        await gateB;
        return callWSB(message);
      }) as HomeAssistantPanelHass['callWS'];
      homeAssistantService.setPanelHass(householdB.hass);
      const snapshots: unknown[] = [];
      const unsubscribe = homeAssistantService.addListener('registries', (registries) =>
        snapshots.push(registries.areas)
      );
      await vi.advanceTimersByTimeAsync(100);
      expect(householdB.hass.callWS).toHaveBeenCalledTimes(4);
      if (obsoleteSettles === 'before') {
        release();
        await vi.advanceTimersByTimeAsync(100);
        expect(homeAssistantService.getAreas()).toEqual([]);
      }
      releaseB();
      await vi.advanceTimersByTimeAsync(200);
      expect(homeAssistantService.getAreas()).toEqual(householdRegistryAfter.areas);
      if (obsoleteSettles === 'after') {
        release();
        await vi.advanceTimersByTimeAsync(200);
      }
      expect(householdB.hass.callWS).toHaveBeenCalledTimes(4);
      expect(snapshots.length).toBeGreaterThan(0);
      for (const snapshot of snapshots) expect(snapshot).toEqual(householdRegistryAfter.areas);
      unsubscribe();
    }
  );

  it('refreshes external entity, device and area edits without any entity state change', async () => {
    const panel = registryPanel();
    homeAssistantService.setPanelHass(panel.hass);
    await homeAssistantService.loadRegistries();
    const entityStates = homeAssistantService.getEntities();
    const mapper = createHomeAssistantEntityMapper();
    const mapCurrent = () =>
      mapper.map({
        entities: homeAssistantService.getEntities() ?? {},
        areas: homeAssistantService.getAreas(),
        deviceRegistry: homeAssistantService.getDeviceRegistry(),
        entityRegistry: homeAssistantService.getEntityRegistry(),
      });
    expect(mapCurrent()[0]).toMatchObject({
      name: 'Ceiling light',
      room: 'Kitchen',
      roomId: 'home_assistant:kitchen',
    });
    panel.update();
    for (const event of householdRegistryEvents) panel.callbacks.get(event.event_type)?.(event);
    // Metadata remains old until the bounded coalescing window expires.
    expect(homeAssistantService.getEntityRegistry()).toEqual(householdRegistryBefore.entities);
    await vi.advanceTimersByTimeAsync(100);
    expect(homeAssistantService.getEntityRegistry()).toEqual(householdRegistryAfter.entities);
    expect(homeAssistantService.getDeviceRegistry()).toEqual(householdRegistryAfter.devices);
    expect(homeAssistantService.getAreas()).toEqual(householdRegistryAfter.areas);
    expect(homeAssistantService.getEntities()).toBe(entityStates);
    expect(mapCurrent()[0]).toMatchObject({
      name: 'Dining lights',
      room: 'Dining room',
      roomId: 'home_assistant:dining_room',
    });
    expect(panel.hass.callWS).toHaveBeenCalledTimes(8);
  });

  it('refreshes missed changes on ready and releases subscriptions on disconnect', async () => {
    const panel = registryPanel();
    homeAssistantService.setPanelHass(panel.hass);
    await homeAssistantService.loadRegistries();
    panel.update();
    for (const listener of panel.readyListeners) listener();
    await vi.advanceTimersByTimeAsync(100);
    expect(homeAssistantService.getAreas()).toEqual(householdRegistryAfter.areas);
    homeAssistantService.disconnect();
    expect(panel.unsubscribe).toHaveBeenCalledTimes(4);
    expect(panel.readyListeners.size).toBe(0);
    for (const event of householdRegistryEvents) panel.callbacks.get(event.event_type)?.(event);
    await vi.advanceTimersByTimeAsync(500);
    expect(panel.hass.callWS).toHaveBeenCalledTimes(8);
  });

  it('preserves useful metadata when an external refresh fails and recovers on the next event', async () => {
    const panel = registryPanel();
    homeAssistantService.setPanelHass(panel.hass);
    await homeAssistantService.loadRegistries();
    const originalCallWS = panel.hass.callWS;
    panel.hass.callWS = vi.fn(async () => {
      throw new Error('connection lost');
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    panel.callbacks.get('entity_registry_updated')?.(householdRegistryEvents[0]);
    await vi.advanceTimersByTimeAsync(100);
    expect(homeAssistantService.getEntityRegistry()).toEqual(householdRegistryBefore.entities);
    panel.hass.callWS = originalCallWS;
    panel.update();
    panel.callbacks.get('entity_registry_updated')?.(householdRegistryEvents[0]);
    await vi.advanceTimersByTimeAsync(100);
    expect(homeAssistantService.getEntityRegistry()).toEqual(householdRegistryAfter.entities);
    log.mockRestore();
  });
  it('refreshes automation categories after category-only edits', async () => {
    const panel = registryPanel();
    const callWS = panel.hass.callWS;
    let name = 'Morning';
    panel.hass.callWS = vi.fn(async (message) =>
      message.type === 'config/category_registry/list'
        ? [{ category_id: 'routine', name }]
        : callWS(message)
    ) as HomeAssistantPanelHass['callWS'];
    homeAssistantService.setPanelHass(panel.hass);
    await homeAssistantService.loadRegistries();
    await vi.advanceTimersByTimeAsync(100);
    expect(homeAssistantService.getAutomationCategories()).toEqual([
      { category_id: 'routine', name: 'Morning' },
    ]);
    name = 'Evening';
    panel.callbacks.get('category_registry_updated')?.({
      data: { action: 'update', category_id: 'routine' },
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(homeAssistantService.getAutomationCategories()).toEqual([
      { category_id: 'routine', name: 'Evening' },
    ]);
  });

  it('coalesces events arriving during a slow refresh into one subsequent snapshot', async () => {
    const panel = registryPanel();
    homeAssistantService.setPanelHass(panel.hass);
    await homeAssistantService.loadRegistries();
    const callWS = panel.hass.callWS;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    panel.hass.callWS = vi.fn(async (message) => {
      await gate;
      return callWS(message);
    }) as HomeAssistantPanelHass['callWS'];
    panel.callbacks.get('entity_registry_updated')?.(householdRegistryEvents[0]);
    await vi.advanceTimersByTimeAsync(100);
    for (let i = 0; i < 20; i++)
      panel.callbacks.get('device_registry_updated')?.(householdRegistryEvents[1]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(panel.hass.callWS).toHaveBeenCalledTimes(4);
    panel.update();
    release();
    await vi.advanceTimersByTimeAsync(100);
    expect(panel.hass.callWS).toHaveBeenCalledTimes(8);
    expect(homeAssistantService.getEntityRegistry()).toEqual(householdRegistryAfter.entities);
  });

  it('ignores a slow snapshot completed after disconnect', async () => {
    const panel = registryPanel();
    homeAssistantService.setPanelHass(panel.hass);
    await homeAssistantService.loadRegistries();
    const callWS = panel.hass.callWS;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    panel.hass.callWS = vi.fn(async (message) => {
      await gate;
      return callWS(message);
    }) as HomeAssistantPanelHass['callWS'];
    panel.update();
    panel.callbacks.get('entity_registry_updated')?.(householdRegistryEvents[0]);
    await vi.advanceTimersByTimeAsync(100);
    homeAssistantService.disconnect();
    release();
    await vi.advanceTimersByTimeAsync(500);
    expect(homeAssistantService.getEntityRegistry()).toEqual([]);
  });
  it('releases subscriptions that finish establishing after disconnect', async () => {
    const panel = registryPanel();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    if (!panel.hass.connection) throw new Error('Fixture connection is required');
    panel.hass.connection.subscribeMessage = vi.fn(async () => {
      await gate;
      return panel.unsubscribe;
    });
    homeAssistantService.setPanelHass(panel.hass);
    homeAssistantService.disconnect();
    release();
    await vi.advanceTimersByTimeAsync(100);
    expect(panel.unsubscribe).toHaveBeenCalledTimes(4);
    expect(panel.hass.callWS).not.toHaveBeenCalled();
  });
  it('subscribes after standalone authentication without an initial ready event', async () => {
    const panel = registryPanel();
    if (!panel.hass.connection) throw new Error('Fixture connection is required');
    const connection = panel.hass.connection;
    connection.sendMessagePromise = panel.hass.callWS;
    // The real authentication seam establishes an already-ready socket, then installs listeners.
    // It does not emit a synthetic connection event on the initial authentication.
    vi.spyOn(HAConnectionService.prototype, 'authenticate').mockResolvedValue(undefined);
    vi.spyOn(HAConnectionService.prototype, 'getConnection').mockReturnValue(connection);
    await homeAssistantService.authenticate({
      providerId: 'home_assistant',
      runtime: 'standalone-oauth',
      authMode: 'oauth',
      haBaseUrl: 'https://ha.example.test',
      hassUrl: 'https://ha.example.test',
    });
    expect(connection.subscribeMessage).toHaveBeenCalledTimes(4);
    panel.update();
    panel.callbacks.get('entity_registry_updated')?.(householdRegistryEvents[0]);
    await vi.advanceTimersByTimeAsync(100);
    expect(homeAssistantService.getEntityRegistry()).toEqual(householdRegistryAfter.entities);
  });

  it('does not subscribe when standalone authentication finishes after disconnect', async () => {
    const panel = registryPanel();
    if (!panel.hass.connection) throw new Error('Fixture connection is required');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(HAConnectionService.prototype, 'authenticate').mockReturnValue(gate);
    vi.spyOn(HAConnectionService.prototype, 'getConnection').mockReturnValue(panel.hass.connection);
    const authentication = homeAssistantService.authenticate({
      providerId: 'home_assistant',
      runtime: 'standalone-oauth',
      authMode: 'oauth',
      haBaseUrl: 'https://ha.example.test',
      hassUrl: 'https://ha.example.test',
    });
    homeAssistantService.disconnect();
    release();
    await authentication;
    await vi.advanceTimersByTimeAsync(100);
    expect(panel.hass.connection.subscribeMessage).not.toHaveBeenCalled();
  });
  it('does not retain household A metadata when household B registry loading fails', async () => {
    const householdA = registryPanel();
    homeAssistantService.setPanelHass(householdA.hass);
    await homeAssistantService.loadRegistries();
    expect(homeAssistantService.getAreas()).toEqual(householdRegistryBefore.areas);
    const householdB = registryPanel();
    householdB.hass.callWS = vi.fn(async () => {
      throw new Error('household B registry denied');
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const receivedAreas: unknown[] = [];
    const unsubscribe = homeAssistantService.addListener('registries', (registries) =>
      receivedAreas.push(registries.areas)
    );
    homeAssistantService.setPanelHass(householdB.hass);
    await homeAssistantService.loadRegistries();
    expect(homeAssistantService.getAreas()).toEqual([]);
    expect(homeAssistantService.getDeviceRegistry()).toEqual([]);
    expect(homeAssistantService.getEntityRegistry()).toEqual([]);
    expect(receivedAreas.length).toBeGreaterThan(0);
    expect(receivedAreas.every((areas) => Array.isArray(areas) && areas.length === 0)).toBe(true);
    unsubscribe();
    log.mockRestore();
  });
});
