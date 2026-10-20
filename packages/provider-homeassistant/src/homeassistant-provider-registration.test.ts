import { runProviderPackageRegistrationTests } from '@navet/core/provider-package-test-suite';
import { describe, expect, it, vi } from 'vitest';
import {
  createHomeAssistantProviderPackageRegistration,
  normalizeHomeAssistantBrowseLabel,
} from './homeassistant-provider-registration';
import type { HomeAssistantServiceBridge } from './homeassistant-service-bridge';

describe('normalizeHomeAssistantBrowseLabel', () => {
  it('separates Music Assistant combined track labels when artist metadata is missing', () => {
    expect(
      normalizeHomeAssistantBrowseLabel({
        title: 'Cigarettes After Sex - Cry',
        media_class: 'track',
      })
    ).toEqual({ title: 'Cry', artist: 'Cigarettes After Sex' });
  });

  it('also separates Music Assistant combined album labels', () => {
    expect(
      normalizeHomeAssistantBrowseLabel({
        title: 'Bright Eyes - Cassadaga',
        media_class: 'album',
      })
    ).toEqual({ title: 'Cassadaga', artist: 'Bright Eyes' });
  });

  it('preserves explicit artist metadata and non-music labels', () => {
    expect(
      normalizeHomeAssistantBrowseLabel({
        title: 'Song - Live',
        media_class: 'track',
        artist: 'Artist',
      })
    ).toEqual({ title: 'Song - Live', artist: 'Artist' });
    expect(
      normalizeHomeAssistantBrowseLabel({
        title: 'Morning - Favorites',
        media_class: 'playlist',
      })
    ).toEqual({ title: 'Morning - Favorites', artist: undefined });
  });
});

runProviderPackageRegistrationTests({
  providerName: 'Home Assistant',
  providerId: 'home_assistant',
  createRegistration: () =>
    createHomeAssistantProviderPackageRegistration({
      getSession: () => null,
      bridge: {
        callApi: vi.fn(async () => []) as unknown as HomeAssistantServiceBridge['callApi'],
        callService: vi.fn(async () => undefined),
        signPath: vi.fn(async (path: string) => ({ path })),
        getCameraStreamUrl: vi.fn(async () => ({ url: '/stream' })),
        getCameraStreamPaths: vi.fn(async () => ({})),
        addListener: vi.fn(() => () => {}),
        isConnected: () => false,
        getPanelHass: () => null,
        getConnection: () => null,
        sendWebSocketBinary: vi.fn(),
        getEntities: () => null,
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
        resolveMediaSource: vi.fn(async () => ({ url: '/media' })),
        getAutomationConfig: vi.fn(async () => ({ config: {} })),
        getCameraCapabilities: vi.fn(async () => ({})),
        enableCameraMotionDetection: vi.fn(async () => undefined),
        disableCameraMotionDetection: vi.fn(async () => undefined),
        getWebRtcClientConfiguration: vi.fn(async () => ({})),
        subscribeCameraWebRtcOffer: vi.fn(async () => () => {}),
        addCameraWebRtcCandidate: vi.fn(async () => undefined),
        createArea: vi.fn(async (name: string) => ({ area_id: name, name })),
        updateAreaName: vi.fn(async (areaId: string, name: string) => ({
          area_id: areaId,
          name,
        })),
        updateEntityArea: vi.fn(async () => undefined),
        updateEntityName: vi.fn(async () => undefined),
        deleteArea: vi.fn(async () => undefined),
        resolveArtwork: vi.fn(async () => ({
          id: 'artwork',
          kind: 'unavailable' as const,
          cacheKey: 'artwork',
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
        resolveCameraStreamResource: vi.fn(async () => ({
          id: 'camera',
          kind: 'unavailable' as const,
          cacheKey: 'camera',
          authStrategy: 'none' as const,
        })),
        getStoreState: () => ({
          connected: false,
          connecting: false,
          reconnecting: false,
          error: null,
          config: null,
          entities: null,
          areas: [],
          deviceRegistry: [],
          entityRegistry: [],
          registriesHydrated: false,
          connect: vi.fn(async () => undefined),
          disconnect: vi.fn(async () => undefined),
          syncPanelHass: vi.fn(),
        }),
        subscribeStore: vi.fn(() => () => {}),
      },
    }),
  expectedStatus: 'implemented',
  supportedFeatures: [
    'rooms',
    'lighting',
    'mediaControls',
    'cameraStreams',
    'notifications',
    'conversation',
  ],
  expectedRoomManagementCapabilities: {
    discover: true,
    create: true,
    rename: true,
    assign: true,
    unassign: true,
    delete: true,
  },
});
