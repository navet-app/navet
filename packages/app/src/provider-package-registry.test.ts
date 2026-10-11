import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHomeAssistantArgs: undefined as
    | undefined
    | {
        dependencies: {
          homeAssistantStore: {
            getState: () => { user?: { name: string; is_admin: boolean } | null };
          };
          homeAssistantService: {
            subscribeCameraWebRtcOffer: (
              entityId: string,
              offer: string,
              listener: (event: unknown) => void
            ) => Promise<() => void>;
          };
        };
      },
  createHomeAssistantProviderPackageRegistrationMock: vi.fn((args: unknown) => {
    mocks.capturedHomeAssistantArgs = args as typeof mocks.capturedHomeAssistantArgs;
    return {
      runtimeRegistration: {},
    };
  }),
  createHomeyProviderPackageRegistrationMock: vi.fn(() => ({ runtimeRegistration: {} })),
  createOpenHABProviderPackageRegistrationMock: vi.fn(() => ({ runtimeRegistration: {} })),
  subscribeCameraWebRtcOfferMock: vi.fn(async () => () => undefined),
  homeAssistantUser: { name: 'Administrator', is_admin: true } as {
    name: string;
    is_admin: boolean;
  } | null,
}));

vi.mock('@navet/provider-homeassistant', () => ({
  createHomeAssistantProviderPackageRegistration:
    mocks.createHomeAssistantProviderPackageRegistrationMock,
}));

vi.mock('@navet/provider-homey', () => ({
  createHomeyProviderPackageRegistration: mocks.createHomeyProviderPackageRegistrationMock,
}));

vi.mock('@navet/provider-openhab', () => ({
  createOpenHABProviderPackageRegistration: mocks.createOpenHABProviderPackageRegistrationMock,
}));

vi.mock('./integration-session-runtime', () => ({
  integrationSessionRuntime: {
    getSnapshot: () => ({ sessions: {} }),
  },
}));

vi.mock('./services/home-assistant.service', () => ({
  homeAssistantService: {
    callApi: vi.fn(async () => []),
    callService: vi.fn(async () => undefined),
    signPath: vi.fn(async (path: string) => ({ path })),
    getCameraStreamUrl: vi.fn(async () => ({ url: '/stream' })),
    getCameraStreamPaths: vi.fn(async () => ({})),
    addListener: vi.fn(() => () => undefined),
    isConnected: vi.fn(() => false),
    getPanelHass: vi.fn(() => null),
    getConnection: vi.fn(() => null),
    getEntities: vi.fn(() => null),
    getEntityRegistry: vi.fn(() => []),
    getConfig: vi.fn(() => null),
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
    resolveMediaSource: vi.fn(async () => ({ url: '/media' })),
    getAutomationConfig: vi.fn(async () => ({ config: {} })),
    getCameraCapabilities: vi.fn(async () => ({})),
    enableCameraMotionDetection: vi.fn(async () => undefined),
    disableCameraMotionDetection: vi.fn(async () => undefined),
    getWebRtcClientConfiguration: vi.fn(async () => ({ configuration: {} })),
    subscribeCameraWebRtcOffer: mocks.subscribeCameraWebRtcOfferMock,
    addCameraWebRtcCandidate: vi.fn(async () => undefined),
    createArea: vi.fn(async (name: string) => ({ area_id: name, name })),
    updateEntityArea: vi.fn(async () => undefined),
    updateEntityName: vi.fn(async () => undefined),
    deleteArea: vi.fn(async () => undefined),
  },
}));

vi.mock('./services/homey.service', () => ({
  homeyService: {},
}));

vi.mock('./services/homey-api-client.service', () => ({
  ensureHomeyApiClientConfigured: vi.fn(),
}));

vi.mock('./services/homey-entity-runtime.service', () => ({
  homeyEntityRuntimeService: {},
}));

vi.mock('./stores/home-assistant-store', () => ({
  homeAssistantStore: {
    getState: () => ({
      connected: false,
      user: mocks.homeAssistantUser,
      config: null,
      entities: null,
      areas: [],
      deviceRegistry: [],
      entityRegistry: [],
      connect: vi.fn(async () => undefined),
      disconnect: vi.fn(),
      syncPanelHass: vi.fn(),
    }),
    subscribe: vi.fn(() => () => undefined),
  },
}));

vi.mock('./utils/home-assistant-url', () => ({
  resolveHomeAssistantProxyUrl: vi.fn(() => null),
}));

describe('provider-package-registry Home Assistant WebRTC bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.capturedHomeAssistantArgs = undefined;
    mocks.homeAssistantUser = { name: 'Administrator', is_admin: true };
  });

  // Keep existing WebRTC coverage; add a regression for the live composition boundary.
  it('forwards current Home Assistant permissions, including revocation and logout', async () => {
    const { getProviderPackageRegistration } = await import('./provider-package-registry');
    getProviderPackageRegistration('home_assistant');
    const store = mocks.capturedHomeAssistantArgs?.dependencies.homeAssistantStore;
    expect(store?.getState().user).toEqual({ name: 'Administrator', is_admin: true });

    mocks.homeAssistantUser = { name: 'Administrator', is_admin: false };
    expect(store?.getState().user?.is_admin).toBe(false);

    mocks.homeAssistantUser = null;
    expect(store?.getState().user).toBeNull();
  });

  it('forwards combined session and answer events plus candidate and error events', async () => {
    const unsubscribe = vi.fn();
    mocks.subscribeCameraWebRtcOfferMock.mockResolvedValueOnce(unsubscribe);

    const { getProviderPackageRegistration } = await import('./provider-package-registry');
    getProviderPackageRegistration('home_assistant');

    const dependencies = mocks.capturedHomeAssistantArgs?.dependencies;
    expect(dependencies).toBeTruthy();
    if (!dependencies) {
      throw new Error('Expected Home Assistant dependencies to be captured');
    }

    const listener = vi.fn();
    const result = await dependencies.homeAssistantService.subscribeCameraWebRtcOffer(
      'camera.front',
      'offer-sdp',
      listener
    );

    expect(result).toBe(unsubscribe);
    expect(mocks.subscribeCameraWebRtcOfferMock).toHaveBeenCalledWith(
      'camera.front',
      'offer-sdp',
      expect.any(Function)
    );

    const firstCall = mocks.subscribeCameraWebRtcOfferMock.mock.calls[0] as unknown[] | undefined;
    const bridgeListener =
      firstCall && typeof firstCall[2] === 'function'
        ? (firstCall[2] as (event: unknown) => void)
        : undefined;
    expect(bridgeListener).toBeTruthy();

    bridgeListener?.({ session_id: 'session-1' });
    bridgeListener?.({ answer: 'answer-sdp' });
    bridgeListener?.({ candidate: { candidate: 'candidate:1', sdpMid: '0' } });
    bridgeListener?.({ code: 'webrtc_failed', message: 'ICE negotiation failed' });

    expect(listener).toHaveBeenNthCalledWith(1, {
      session_id: 'session-1',
    });
    expect(listener).toHaveBeenNthCalledWith(2, {
      answer: 'answer-sdp',
    });
    expect(listener).toHaveBeenNthCalledWith(3, {
      candidate: { candidate: 'candidate:1', sdpMid: '0' },
    });
    expect(listener).toHaveBeenNthCalledWith(4, {
      code: 'webrtc_failed',
      message: 'ICE negotiation failed',
    });
  });

  it('emits session before answer when Home Assistant combines them in one event', async () => {
    const unsubscribe = vi.fn();
    mocks.subscribeCameraWebRtcOfferMock.mockResolvedValueOnce(unsubscribe);

    const { getProviderPackageRegistration } = await import('./provider-package-registry');
    getProviderPackageRegistration('home_assistant');

    const dependencies = mocks.capturedHomeAssistantArgs?.dependencies;
    expect(dependencies).toBeTruthy();
    if (!dependencies) {
      throw new Error('Expected Home Assistant dependencies to be captured');
    }

    const listener = vi.fn();
    await dependencies.homeAssistantService.subscribeCameraWebRtcOffer(
      'camera.front',
      'offer-sdp',
      listener
    );

    const firstCall = mocks.subscribeCameraWebRtcOfferMock.mock.calls[0] as unknown[] | undefined;
    const bridgeListener =
      firstCall && typeof firstCall[2] === 'function'
        ? (firstCall[2] as (event: unknown) => void)
        : undefined;

    bridgeListener?.({ answer: 'answer-sdp', session_id: 'session-1' });

    expect(listener).toHaveBeenNthCalledWith(1, {
      session_id: 'session-1',
    });
    expect(listener).toHaveBeenNthCalledWith(2, {
      answer: 'answer-sdp',
      session_id: 'session-1',
    });
  });
});
