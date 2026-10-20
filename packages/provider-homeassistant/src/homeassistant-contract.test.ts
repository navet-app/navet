import { runProviderContractTests } from '@navet/core/contract-test-suite';
import { createProviderScopedId } from '@navet/core/ids';
import type { NavetEntityEvent } from '@navet/core/types';
import { createHomeAssistantContractAdapter } from '@navet/provider-homeassistant/homeassistant-adapter';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  configureHomeAssistantServiceBridge,
  type HomeAssistantServiceBridge,
} from './homeassistant-service-bridge';

function lightEntityFactory(overrides: Record<string, unknown> = {}) {
  return {
    entity_id: 'light.kitchen',
    state: 'on',
    last_changed: '2026-05-30T10:00:00.000Z',
    last_updated: '2026-05-30T10:00:00.000Z',
    context: { id: 'ctx-1', parent_id: null, user_id: null },
    ...overrides,
    attributes: {
      friendly_name: 'Kitchen Light',
      brightness: 128,
      supported_color_modes: ['brightness'],
      ...(typeof overrides.attributes === 'object' && overrides.attributes !== null
        ? (overrides.attributes as Record<string, unknown>)
        : {}),
    },
  };
}

const {
  connectMock,
  disconnectMock,
  callServiceMock,
  homeAssistantState,
  homeAssistantListeners,
  homeAssistantStoreListeners,
  emitHomeAssistantSnapshot,
  emitHomeAssistantRawSnapshot,
} = vi.hoisted(() => {
  const listeners = {
    entities: new Set<() => void>(),
    registries: new Set<() => void>(),
    connection: new Set<() => void>(),
    config: new Set<() => void>(),
  };
  const storeListeners = new Set<() => void>();
  const state = {
    connected: true,
    entities: {} as Record<string, unknown>,
  };

  return {
    connectMock: vi.fn(async () => undefined),
    disconnectMock: vi.fn(async () => undefined),
    callServiceMock: vi.fn(async () => undefined),
    homeAssistantState: state,
    homeAssistantListeners: listeners,
    homeAssistantStoreListeners: storeListeners,
    emitHomeAssistantSnapshot: () => {
      for (const listener of storeListeners) {
        listener();
      }
    },
    emitHomeAssistantRawSnapshot: () => {
      for (const listener of listeners.entities) {
        listener();
      }
    },
  };
});

let currentSession: {
  providerId: 'home_assistant';
  runtime: string;
  authMode: string;
  haBaseUrl: string;
  hassUrl: string;
} | null = null;

beforeEach(() => {
  connectMock.mockReset();
  disconnectMock.mockReset();
  callServiceMock.mockReset();
  homeAssistantState.connected = true;
  homeAssistantState.entities = {
    'light.kitchen': lightEntityFactory(),
  };
  for (const listeners of Object.values(homeAssistantListeners)) {
    listeners.clear();
  }
  homeAssistantStoreListeners.clear();
  currentSession = null;
  configureHomeAssistantServiceBridge({
    callApi: vi.fn(async () => []) as unknown as HomeAssistantServiceBridge['callApi'],
    callService: callServiceMock,
    signPath: vi.fn(async (path: string) => ({ path })),
    getCameraStreamUrl: vi.fn(async () => ({ url: '/stream' })),
    getCameraStreamPaths: vi.fn(async () => ({})),
    addListener: (event, listener) => {
      const listeners = homeAssistantListeners[event];
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    isConnected: () => homeAssistantState.connected,
    getPanelHass: () => null,
    getConnection: () => null,
    sendWebSocketBinary: vi.fn(),
    getEntities: () => homeAssistantState.entities as never,
    getEntityRegistry: () => [],
    getConfig: () => null,
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
    createArea: vi.fn(async (name: string) => ({ area_id: name.toLowerCase(), name })),
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
      connected: homeAssistantState.connected,
      connecting: false,
      reconnecting: false,
      error: null,
      config: null,
      entities: homeAssistantState.entities as never,
      areas: [],
      deviceRegistry: [],
      entityRegistry: [],
      registriesHydrated: true,
      connect: connectMock,
      disconnect: disconnectMock,
      syncPanelHass: vi.fn(),
    }),
    subscribeStore: (listener) => {
      homeAssistantStoreListeners.add(listener);
      return () => {
        homeAssistantStoreListeners.delete(listener);
      };
    },
  });
});

runProviderContractTests({
  providerName: 'Home Assistant',
  createAdapter: () =>
    createHomeAssistantContractAdapter(undefined, {
      getSession: () => currentSession,
    }),
  setAuthenticatedSession: () => {
    currentSession = {
      providerId: 'home_assistant',
      runtime: 'standalone-oauth',
      authMode: 'oauth',
      haBaseUrl: 'https://ha.example.test',
      hassUrl: 'https://ha.example.test',
    };
  },
  clearAuthenticatedSession: () => {
    currentSession = null;
  },
  createCommand: (entity) => ({
    type: 'turn_off',
    entityId: entity.id,
  }),
  expectConnected: () => {
    expect(connectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'home_assistant',
      })
    );
  },
  expectDisconnected: () => {
    expect(disconnectMock).toHaveBeenCalled();
  },
  expectCommandDispatched: () => {
    expect(callServiceMock).toHaveBeenCalledWith(
      'light',
      'turn_off',
      {},
      {
        entityId: 'light.kitchen',
      }
    );
  },
  getLookupIds: (entity) => [
    entity.externalId,
    createProviderScopedId('home_assistant', entity.externalId),
  ],
  emitEntityUpdate: () => {
    homeAssistantState.entities = {
      'light.kitchen': lightEntityFactory({
        attributes: {
          brightness: 42,
        },
      }),
    };
    emitHomeAssistantSnapshot();
  },
  emitEntityAdded: () => {
    homeAssistantState.entities = {
      ...homeAssistantState.entities,
      'light.entryway': lightEntityFactory({
        entity_id: 'light.entryway',
        attributes: {
          friendly_name: 'Entryway Light',
        },
      }),
    };
    emitHomeAssistantSnapshot();
  },
  emitEntityRemoved: () => {
    const nextEntities = { ...homeAssistantState.entities };
    delete nextEntities['light.kitchen'];
    homeAssistantState.entities = nextEntities;
    emitHomeAssistantSnapshot();
  },
  setUnavailableSnapshot: () => {
    homeAssistantState.entities = {
      'light.kitchen': lightEntityFactory({
        state: 'unavailable',
      }),
    };
  },
  setMalformedSnapshot: () => {
    homeAssistantState.entities = {
      'light.kitchen': lightEntityFactory(),
      broken_entity: {} as never,
    };
  },
});

it('emits the latest committed store entity update instead of stale raw entity callbacks', async () => {
  const adapter = createHomeAssistantContractAdapter();
  const events: NavetEntityEvent[] = [];
  const unsubscribe = await adapter.subscribeToEvents((event) => {
    events.push(event);
  });

  homeAssistantState.entities = {
    'light.kitchen': lightEntityFactory({ state: 'unavailable' }),
  };
  emitHomeAssistantRawSnapshot();
  homeAssistantState.entities = {
    'light.kitchen': lightEntityFactory({ state: 'off' }),
  };
  emitHomeAssistantRawSnapshot();

  expect(events).toEqual([]);

  emitHomeAssistantSnapshot();

  expect(events).toEqual([
    expect.objectContaining({
      type: 'entity_updated',
      entity: expect.objectContaining({
        externalId: 'light.kitchen',
        primaryState: 'off',
      }),
    }),
  ]);
  unsubscribe();
});
