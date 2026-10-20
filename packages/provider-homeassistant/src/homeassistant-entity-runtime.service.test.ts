import type { HassConfig } from 'home-assistant-js-websocket';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  homeAssistantEntityRuntimeService,
  resetHomeAssistantEntityRuntimeServiceCachesForTests,
} from './homeassistant-entity-runtime.service';
import {
  configureHomeAssistantServiceBridge,
  type HomeAssistantServiceBridge,
} from './homeassistant-service-bridge';

const state = {
  entities: null as Record<string, unknown> | null,
  entityRegistry: [] as Array<Record<string, unknown>>,
  deviceRegistry: [] as Array<Record<string, unknown>>,
  config: null as HassConfig | null,
};
const listeners = {
  entities: new Set<() => void>(),
  registries: new Set<() => void>(),
  connection: new Set<() => void>(),
  config: new Set<() => void>(),
};
const storeListeners = new Set<() => void>();

function emitBridgeEvent(event: keyof typeof listeners) {
  for (const listener of listeners[event]) {
    listener();
  }
}

function emitStoreChange() {
  for (const listener of storeListeners) {
    listener();
  }
}

describe('homeAssistantEntityRuntimeService', () => {
  beforeEach(() => {
    state.entities = null;
    state.entityRegistry = [];
    state.deviceRegistry = [];
    state.config = null;
    listeners.entities.clear();
    listeners.registries.clear();
    listeners.connection.clear();
    listeners.config.clear();
    storeListeners.clear();
    resetHomeAssistantEntityRuntimeServiceCachesForTests();
    configureHomeAssistantServiceBridge({
      callApi: vi.fn(async () => []) as unknown as HomeAssistantServiceBridge['callApi'],
      callService: vi.fn(async () => undefined),
      signPath: vi.fn(async (path: string) => ({ path })),
      getCameraStreamUrl: vi.fn(async () => ({ url: '/stream' })),
      getCameraStreamPaths: vi.fn(async () => ({})),
      addListener: vi.fn((event: keyof typeof listeners, listener: () => void) => {
        listeners[event].add(listener);

        return () => {
          listeners[event].delete(listener);
        };
      }),
      isConnected: vi.fn(() => true),
      getPanelHass: vi.fn(() => null),
      getConnection: vi.fn(() => null),
      sendWebSocketBinary: vi.fn(),
      getEntities: () => state.entities as never,
      getEntityRegistry: () => state.entityRegistry as never,
      getConfig: () => state.config,
      updateLight: vi.fn(async () => undefined),
      playMedia: vi.fn(async () => undefined),
      browseMediaPlayer: vi.fn(async () => ({ title: 'Media' })),
      searchMediaPlayer: vi.fn(async () => ({ title: 'Media' })),
      selectMediaPlayerSource: vi.fn(async () => undefined),
      selectMediaPlayerSoundMode: vi.fn(async () => undefined),
      seekMediaPlayer: vi.fn(async () => undefined),
      clearMediaPlayerPlaylist: vi.fn(async () => undefined),
      updateMediaPlayerPower: vi.fn(async () => undefined),
      sendRemoteCommand: vi.fn(async () => undefined),
      browseMediaSource: vi.fn(async () => ({ title: 'Media' })),
      resolveMediaSource: vi.fn(async () => ({ url: '/media', mime_type: 'image/jpeg' })),
      getAutomationConfig: vi.fn(async () => ({ config: {} })),
      getCameraCapabilities: vi.fn(async () => ({ frontend_stream_types: [] })),
      enableCameraMotionDetection: vi.fn(async () => undefined),
      disableCameraMotionDetection: vi.fn(async () => undefined),
      getWebRtcClientConfiguration: vi.fn(async () => ({})),
      subscribeCameraWebRtcOffer: vi.fn(async () => () => {}),
      addCameraWebRtcCandidate: vi.fn(async () => undefined),
      createArea: vi.fn(async () => ({ area_id: 'kitchen', name: 'Kitchen' })),
      updateAreaName: vi.fn(async (areaId: string, name: string) => ({
        area_id: areaId,
        name,
      })),
      updateEntityArea: vi.fn(async () => undefined),
      updateEntityName: vi.fn(async () => undefined),
      deleteArea: vi.fn(async () => undefined),
      resolveArtwork: vi.fn(async (entityId: string) => ({
        id: entityId,
        kind: 'image' as const,
        cacheKey: entityId,
        authStrategy: 'none' as const,
      })),
      resolveProxyUrl: vi.fn((resourceUrl: string) => resourceUrl),
      resolveDisplayResource: vi.fn(async (url: string) => ({
        id: url,
        kind: 'image' as const,
        cacheKey: url,
        authStrategy: 'none' as const,
        url,
      })),
      getCameraPlaybackPlan: vi.fn(async () => ({ mode: 'snapshot' })),
      resolveCameraStreamResource: vi.fn(async (entityId: string) => ({
        id: entityId,
        kind: 'unavailable' as const,
        cacheKey: entityId,
        authStrategy: 'none' as const,
      })),
      getStoreState: () => ({
        connected: true,
        connecting: false,
        reconnecting: false,
        error: null,
        entities: state.entities as never,
        config: state.config,
        areas: [],
        deviceRegistry: state.deviceRegistry as never,
        entityRegistry: [],
        registriesHydrated: true,
        connect: vi.fn(async () => undefined),
        disconnect: vi.fn(async () => undefined),
        syncPanelHass: vi.fn(),
      }),
      subscribeStore: (listener) => {
        storeListeners.add(listener);
        return () => {
          storeListeners.delete(listener);
        };
      },
    });
  });

  it('reuses entity snapshot references when cloned entity maps are semantically unchanged', () => {
    state.entities = {
      'sensor.kitchen_temperature': {
        entity_id: 'sensor.kitchen_temperature',
        state: '21',
        attributes: {
          unit_of_measurement: 'C',
        },
        last_changed: '2026-05-30T10:00:00.000Z',
        last_updated: '2026-05-30T10:00:00.000Z',
        context: { id: 'ctx-1', parent_id: null, user_id: null },
      },
    };

    const firstSnapshot = homeAssistantEntityRuntimeService.getEntitySnapshots();

    state.entities = {
      'sensor.kitchen_temperature': {
        entity_id: 'sensor.kitchen_temperature',
        state: '21',
        attributes: {
          unit_of_measurement: 'C',
        },
        last_changed: '2026-05-30T10:00:00.000Z',
        last_updated: '2026-05-30T10:00:00.000Z',
        context: { id: 'ctx-1', parent_id: null, user_id: null },
      },
    };

    const secondSnapshot = homeAssistantEntityRuntimeService.getEntitySnapshots();

    expect(secondSnapshot).toBe(firstSnapshot);
  });

  it('reuses config references when cloned config objects are semantically unchanged', () => {
    const config = {
      latitude: 1,
      longitude: 2,
      elevation: 3,
      unit_system: {
        length: 'km',
      },
      location_name: 'Home',
      time_zone: 'Europe/Stockholm',
      components: [],
      config_dir: '/config',
      whitelist_external_dirs: [],
      allowlist_external_dirs: [],
      allowlist_external_urls: [],
      version: '2026.5.0',
      config_source: 'storage',
      safe_mode: false,
      state: 'RUNNING',
      external_url: null,
      internal_url: null,
      currency: 'EUR',
    } as unknown as HassConfig;

    state.config = config;

    const firstConfig = homeAssistantEntityRuntimeService.getConfig();

    state.config = {
      ...config,
      unit_system: {
        ...config.unit_system,
      },
    };

    const secondConfig = homeAssistantEntityRuntimeService.getConfig();

    expect(secondConfig).toBe(firstConfig);
  });

  it('reuses unchanged entity snapshot references when unrelated Home Assistant entities change', () => {
    state.entities = {
      'sensor.kitchen_temperature': {
        entity_id: 'sensor.kitchen_temperature',
        state: '21',
        attributes: {
          unit_of_measurement: 'C',
        },
        last_changed: '2026-05-30T10:00:00.000Z',
        last_updated: '2026-05-30T10:00:00.000Z',
        context: { id: 'ctx-1', parent_id: null, user_id: null },
      },
    };

    const firstSnapshot = homeAssistantEntityRuntimeService.getEntitySnapshot?.(
      'sensor.kitchen_temperature'
    );

    state.entities = {
      'sensor.kitchen_temperature': {
        entity_id: 'sensor.kitchen_temperature',
        state: '21',
        attributes: {
          unit_of_measurement: 'C',
        },
        last_changed: '2026-05-30T10:00:00.000Z',
        last_updated: '2026-05-30T10:00:00.000Z',
        context: { id: 'ctx-1', parent_id: null, user_id: null },
      },
      'sensor.hall_temperature': {
        entity_id: 'sensor.hall_temperature',
        state: '19',
        attributes: {
          unit_of_measurement: 'C',
        },
        last_changed: '2026-05-30T10:00:00.000Z',
        last_updated: '2026-05-30T10:00:00.000Z',
        context: { id: 'ctx-2', parent_id: null, user_id: null },
      },
    };

    const secondSnapshot = homeAssistantEntityRuntimeService.getEntitySnapshot?.(
      'sensor.kitchen_temperature'
    );

    expect(secondSnapshot).toBe(firstSnapshot);
  });

  it('replaces the entity map when an entity is removed while reusing retained snapshots', () => {
    state.entities = {
      'sensor.kitchen_temperature': {
        entity_id: 'sensor.kitchen_temperature',
        state: '21',
        attributes: { unit_of_measurement: 'C' },
        last_changed: '2026-05-30T10:00:00.000Z',
        last_updated: '2026-05-30T10:00:00.000Z',
        context: { id: 'ctx-1', parent_id: null, user_id: null },
      },
      'sensor.hall_temperature': {
        entity_id: 'sensor.hall_temperature',
        state: '19',
        attributes: { unit_of_measurement: 'C' },
        last_changed: '2026-05-30T10:00:00.000Z',
        last_updated: '2026-05-30T10:00:00.000Z',
        context: { id: 'ctx-2', parent_id: null, user_id: null },
      },
    };

    const firstSnapshots = homeAssistantEntityRuntimeService.getEntitySnapshots();

    state.entities = {
      'sensor.kitchen_temperature': state.entities['sensor.kitchen_temperature'],
    };

    const secondSnapshots = homeAssistantEntityRuntimeService.getEntitySnapshots();

    expect(secondSnapshots).not.toBe(firstSnapshots);
    expect(secondSnapshots?.['sensor.kitchen_temperature']).toBe(
      firstSnapshots?.['sensor.kitchen_temperature']
    );
    expect(secondSnapshots?.['sensor.hall_temperature']).toBeUndefined();
  });

  it('reuses registry entry references when cloned registry payloads are semantically unchanged', () => {
    state.entityRegistry = [
      {
        entity_id: 'light.kitchen',
        device_id: 'device-kitchen',
        area_id: 'area-kitchen',
        name: 'Kitchen Light',
        platform: 'hue',
      },
    ];

    const firstEntry = homeAssistantEntityRuntimeService.getEntityRegistryEntry?.('light.kitchen');

    state.entityRegistry = [
      {
        entity_id: 'light.kitchen',
        device_id: 'device-kitchen',
        area_id: 'area-kitchen',
        name: 'Kitchen Light',
        platform: 'hue',
      },
    ];

    const secondEntry = homeAssistantEntityRuntimeService.getEntityRegistryEntry?.('light.kitchen');

    expect(secondEntry).toBe(firstEntry);
  });

  it('enriches registry entries with provider-neutral device identity', () => {
    state.entityRegistry = [
      {
        entity_id: 'media_player.kitchen',
        device_id: 'device-kitchen',
        platform: 'apple_tv',
      },
    ];
    state.deviceRegistry = [
      {
        id: 'device-kitchen',
        manufacturer: 'Apple',
        model: 'HomePod mini',
        name: 'Kitchen HomePod',
      },
    ];

    expect(
      homeAssistantEntityRuntimeService.getEntityRegistryEntry?.('media_player.kitchen')
    ).toMatchObject({
      deviceName: 'Kitchen HomePod',
      manufacturer: 'Apple',
      model: 'HomePod mini',
      platform: 'apple_tv',
    });
  });

  it('notifies entity listeners only when the subscribed entity snapshot changes', () => {
    const hallEntity = {
      entity_id: 'sensor.hall_temperature',
      state: '19',
      attributes: { unit_of_measurement: 'C' },
      last_changed: '2026-05-30T10:00:00.000Z',
      last_updated: '2026-05-30T10:00:00.000Z',
      context: { id: 'ctx-2', parent_id: null, user_id: null },
    };
    state.entities = {
      'sensor.kitchen_temperature': {
        entity_id: 'sensor.kitchen_temperature',
        state: '21',
        attributes: { unit_of_measurement: 'C' },
        last_changed: '2026-05-30T10:00:00.000Z',
        last_updated: '2026-05-30T10:00:00.000Z',
        context: { id: 'ctx-1', parent_id: null, user_id: null },
      },
    };

    const listener = vi.fn();
    const unsubscribe = homeAssistantEntityRuntimeService.subscribeEntitySnapshot?.(
      'sensor.kitchen_temperature',
      listener
    );

    state.entities = {
      'sensor.kitchen_temperature': {
        entity_id: 'sensor.kitchen_temperature',
        state: '21',
        attributes: { unit_of_measurement: 'C' },
        last_changed: '2026-05-30T10:00:00.000Z',
        last_updated: '2026-05-30T10:00:00.000Z',
        context: { id: 'ctx-1', parent_id: null, user_id: null },
      },
      'sensor.hall_temperature': hallEntity,
    };
    emitStoreChange();

    expect(listener).not.toHaveBeenCalled();

    state.entities = {
      'sensor.kitchen_temperature': {
        entity_id: 'sensor.kitchen_temperature',
        state: '22',
        attributes: { unit_of_measurement: 'C' },
        last_changed: '2026-05-30T10:05:00.000Z',
        last_updated: '2026-05-30T10:05:00.000Z',
        context: { id: 'ctx-3', parent_id: null, user_id: null },
      },
      'sensor.hall_temperature': hallEntity,
    };
    emitStoreChange();

    expect(listener).toHaveBeenCalledTimes(1);

    state.entities = {
      'sensor.hall_temperature': hallEntity,
    };
    emitStoreChange();

    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe?.();
  });

  it('notifies broad entity listeners only when the committed store entity reference changes', () => {
    state.entities = {
      'sensor.kitchen_temperature': {
        entity_id: 'sensor.kitchen_temperature',
        state: '21',
        attributes: { unit_of_measurement: 'C' },
        last_changed: '2026-05-30T10:00:00.000Z',
        last_updated: '2026-05-30T10:00:00.000Z',
        context: { id: 'ctx-1', parent_id: null, user_id: null },
      },
    };

    const listener = vi.fn();
    const unsubscribe = homeAssistantEntityRuntimeService.subscribeEntitySnapshots(listener);

    state.config = { location_name: 'Updated Home' } as HassConfig;
    emitStoreChange();
    emitBridgeEvent('entities');

    expect(listener).not.toHaveBeenCalled();

    state.entities = {
      ...state.entities,
      'sensor.hall_temperature': {
        entity_id: 'sensor.hall_temperature',
        state: '19',
        attributes: { unit_of_measurement: 'C' },
        last_changed: '2026-05-30T10:05:00.000Z',
        last_updated: '2026-05-30T10:05:00.000Z',
        context: { id: 'ctx-2', parent_id: null, user_id: null },
      },
    };
    emitStoreChange();

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('notifies registry listeners only when the subscribed entity registry entry changes', () => {
    state.entityRegistry = [
      {
        entity_id: 'light.kitchen',
        device_id: 'device-kitchen',
        area_id: 'area-kitchen',
        name: 'Kitchen Light',
        platform: 'hue',
      },
    ];

    const listener = vi.fn();
    const unsubscribe = homeAssistantEntityRuntimeService.subscribeEntityRegistryEntry?.(
      'light.kitchen',
      listener
    );

    state.entityRegistry = [
      {
        entity_id: 'light.kitchen',
        device_id: 'device-kitchen',
        area_id: 'area-kitchen',
        name: 'Kitchen Light',
        platform: 'hue',
      },
      {
        entity_id: 'light.hall',
        device_id: 'device-hall',
        area_id: 'area-hall',
        name: 'Hall Light',
        platform: 'hue',
      },
    ];
    emitBridgeEvent('registries');

    expect(listener).not.toHaveBeenCalled();

    state.entityRegistry = [
      {
        entity_id: 'light.kitchen',
        device_id: 'device-kitchen',
        area_id: 'area-main-kitchen',
        name: 'Kitchen Light',
        platform: 'hue',
      },
      {
        entity_id: 'light.hall',
        device_id: 'device-hall',
        area_id: 'area-hall',
        name: 'Hall Light',
        platform: 'hue',
      },
    ];
    emitBridgeEvent('registries');

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe?.();
  });
});
