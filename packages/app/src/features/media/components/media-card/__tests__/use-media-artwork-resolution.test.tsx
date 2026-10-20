import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMediaThumbnailDataUrlMock, signPathMock } = vi.hoisted(() => ({
  fetchMediaThumbnailDataUrlMock: vi.fn(),
  signPathMock: vi.fn(),
}));

vi.mock('@navet/app/features/media/utils/media-thumbnail', () => ({
  fetchMediaThumbnailDataUrl: fetchMediaThumbnailDataUrlMock,
}));

vi.mock('@navet/app/services/home-assistant.service', () => ({
  homeAssistantService: {
    getConnection: vi.fn(),
    signPath: signPathMock,
  },
}));

import { useMediaArtworkResolution } from '@navet/app/features/media/components/media-card/use-media-artwork-resolution';
import * as mediaArtworkHookModule from '@navet/app/features/media/hooks/use-media-artwork';
import * as resourceUrlHookModule from '@navet/app/hooks/use-resource-url';
import { mediaArtworkService } from '@navet/app/infrastructure/home-assistant/home-assistant-shared-infrastructure';
import { resetRuntimeContextForTests } from '@navet/app/infrastructure/home-assistant/runtime/runtime-detector';

const ARTWORK_CLEAR_TEST_DELAY_MS = 700;

function installRuntimeProxyConfig() {
  window.__NAVET_CONFIG__ = {
    hassUrl: 'http://homeassistant.local:8123',
    proxyBaseUrl: '/__navet_ha_proxy__',
  };
  resetRuntimeContextForTests();
}

function installIngressBase(addonSlug = 'navet_dev') {
  signPathMock.mockImplementation(async (path: string) => ({
    path: `${path}?authSig=current-user-signature`,
  }));
  const base = document.createElement('base');
  base.href = `${window.location.origin}/api/hassio_ingress/${addonSlug}/`;
  document.head.append(base);
  resetRuntimeContextForTests();
}

function expectFetchUrl(fetchMock: ReturnType<typeof vi.spyOn>, expectedUrl: string) {
  expect(fetchMock).toHaveBeenCalled();
  expect(fetchMock.mock.calls[0]?.[0]).toBe(expectedUrl);
}

describe('useMediaArtworkResolution', () => {
  // Keep: exercise real provider resolution. Load the lazy modules before the
  // assertion clock starts so a cold CI transform cannot consume waitFor's budget.
  beforeAll(async () => {
    await Promise.all([
      import('@navet/app/services/integration-resource.service'),
      import('@navet/app/services/resource-url-observer'),
    ]);
  });

  beforeEach(() => {
    document.querySelector('base')?.remove();
    window.history.replaceState(null, '', '/');
    fetchMediaThumbnailDataUrlMock.mockReset();
    signPathMock.mockReset();
    vi.restoreAllMocks();
    window.__NAVET_PANEL__ = false;
    window.__NAVET_CONFIG__ = undefined;
    resetRuntimeContextForTests();
    const artworkServiceForTest = mediaArtworkService as unknown as {
      objectUrlCache: Map<string, unknown>;
      negativeCache: Map<string, unknown>;
      lookupCache: Map<string, unknown>;
    };
    artworkServiceForTest.objectUrlCache.clear();
    artworkServiceForTest.negativeCache.clear();
    artworkServiceForTest.lookupCache.clear();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ close: vi.fn() } as unknown as ImageBitmap)
    );
  });

  it('uses authenticated websocket thumbnail data for Home Assistant media proxy artwork', async () => {
    fetchMediaThumbnailDataUrlMock.mockResolvedValue('data:image/jpeg;base64,album-art');

    const { result } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.kitchen',
        liveEntityPicture: '/api/media_player_proxy/media_player.kitchen',
        homeAssistantUrl: 'http://homeassistant.local:8123',
      })
    );

    await waitFor(() => {
      expect(result.current.albumArt).toBe('data:image/jpeg;base64,album-art');
    });
    expect(result.current.artworkResource).toMatchObject({
      kind: 'image',
      url: 'data:image/jpeg;base64,album-art',
      authStrategy: 'none',
    });
    expect(fetchMediaThumbnailDataUrlMock).toHaveBeenCalledWith('media_player.kitchen');
  });

  it('never exposes a raw Home Assistant media proxy URL while artwork resolution is pending', () => {
    installRuntimeProxyConfig();
    fetchMediaThumbnailDataUrlMock.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.living_room',
        providerId: 'home_assistant',
        liveEntityPicture:
          '/api/media_player_proxy/media_player.living_room?token=stale-token&cache=artwork-hash',
        homeAssistantUrl: 'http://homeassistant.local:8123',
      })
    );

    // Rewrite: wait for asynchronous provider resolution before exposing a display URL.
    expect(result.current.albumArt).toBeNull();
  });

  it('uses websocket thumbnail data before panel-mode media proxy fallback artwork', async () => {
    window.__NAVET_PANEL__ = true;
    resetRuntimeContextForTests();
    fetchMediaThumbnailDataUrlMock.mockResolvedValue('data:image/jpeg;base64,panel-album-art');

    const { result } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.kitchen',
        liveEntityPicture: '/api/media_player_proxy/media_player.kitchen',
        homeAssistantUrl: 'http://homeassistant.local:8123',
      })
    );

    await waitFor(() => {
      expect(result.current.albumArt).toBe('data:image/jpeg;base64,panel-album-art');
    });
    expect(fetchMediaThumbnailDataUrlMock).toHaveBeenCalledWith('media_player.kitchen');
  });

  it('uses direct Home Assistant media proxy artwork in local dev when thumbnails are unavailable', async () => {
    fetchMediaThumbnailDataUrlMock.mockResolvedValue(null);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('server error'));

    const { result } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.kitchen',
        liveEntityPicture: '/api/media_player_proxy/media_player.kitchen',
        homeAssistantUrl: 'http://homeassistant.local:8123',
      })
    );

    await waitFor(() => {
      expect(fetchMediaThumbnailDataUrlMock).toHaveBeenCalledWith('media_player.kitchen');
    });
    await waitFor(() => {
      expect(result.current.albumArt).toBe(
        '/__navet_ha_proxy__/api/media_player_proxy/media_player.kitchen'
      );
    });
    expectFetchUrl(fetchMock, '/__navet_ha_proxy__/api/media_player_proxy/media_player.kitchen');
  });

  it('keeps same-origin media proxy artwork in panel mode when thumbnail loading fails', async () => {
    window.__NAVET_PANEL__ = true;
    resetRuntimeContextForTests();
    fetchMediaThumbnailDataUrlMock.mockResolvedValue(null);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));

    const { result } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.kitchen',
        liveEntityPicture: '/api/media_player_proxy/media_player.kitchen',
        homeAssistantUrl: 'http://homeassistant.local:8123',
      })
    );

    await waitFor(() => {
      expect(fetchMediaThumbnailDataUrlMock).toHaveBeenCalledWith('media_player.kitchen');
    });
    await waitFor(() => {
      expect(result.current.albumArt).toBe('/api/media_player_proxy/media_player.kitchen');
    });
    expectFetchUrl(fetchMock, '/api/media_player_proxy/media_player.kitchen');
  });

  it('loads same-origin panel artwork as an object URL when no auth token is stored', async () => {
    window.__NAVET_PANEL__ = true;
    resetRuntimeContextForTests();
    fetchMediaThumbnailDataUrlMock.mockResolvedValue(null);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://navet.local/panel-album-art');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('image', {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      })
    );

    const { result } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.kitchen',
        liveEntityPicture: '/api/media_player_proxy/media_player.kitchen',
        homeAssistantUrl: 'http://homeassistant.local:8123',
      })
    );

    await waitFor(() => {
      expect(result.current.albumArt).toBe('blob:http://navet.local/panel-album-art');
    });
    expectFetchUrl(fetchMock, '/api/media_player_proxy/media_player.kitchen');
  });

  it('keeps external artwork URLs direct when Home Assistant does not require proxying', async () => {
    fetchMediaThumbnailDataUrlMock.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.living_room',
        liveEntityPicture: 'https://cdn.example.test/album-art.jpg',
        homeAssistantUrl: 'http://homeassistant.local:8123',
      })
    );

    await waitFor(() => {
      expect(result.current.albumArt).toBe('https://cdn.example.test/album-art.jpg');
    });
  });

  it('uses renewed display artwork instead of retaining an expiring primary result', () => {
    vi.spyOn(mediaArtworkHookModule, 'useMediaArtwork').mockReturnValue({
      id: 'media_player.kitchen',
      kind: 'image',
      cacheKey: 'artwork',
      authStrategy: 'none',
      url: '/api/image?authSig=old',
      expiresAt: Date.now() + 30_000,
    });
    const displayUrl = vi
      .spyOn(resourceUrlHookModule, 'useResourceUrl')
      .mockReturnValue('/api/image?authSig=first');
    const { result, rerender } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.kitchen',
        providerId: 'home_assistant',
        liveEntityPicture: '/api/image',
      })
    );
    expect(result.current.albumArt).toBe('/api/image?authSig=first');
    act(() => result.current.handleArtworkError('/api/image?authSig=first'));
    expect(result.current.albumArt).toBeNull();
    displayUrl.mockReturnValue('/api/image?authSig=renewed');
    rerender();
    expect(result.current.albumArt).toBe('/api/image?authSig=renewed');
    expect(result.current.artworkResource).toBeNull();
    displayUrl.mockReturnValue(null);
    rerender();
    expect(result.current.albumArt).toBeNull();
  });

  it('preserves direct fallback artwork when resource resolution is unavailable', async () => {
    vi.spyOn(mediaArtworkHookModule, 'useMediaArtwork').mockReturnValue({
      id: 'media_player.storybook',
      kind: 'unavailable',
      cacheKey: 'storybook-artwork',
      authStrategy: 'none',
    });

    const { result } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.storybook',
        liveEntityPicture: '/assets/reference/media/artworks-original.jpg',
      })
    );

    await waitFor(() => {
      expect(result.current.albumArt).toBe('/assets/reference/media/artworks-original.jpg');
    });
    expect(result.current.artworkResource).toBeNull();
  });

  it('resolves signed Home Assistant artwork URLs in panel mode without dropping the signature', async () => {
    window.__NAVET_PANEL__ = true;
    resetRuntimeContextForTests();
    fetchMediaThumbnailDataUrlMock.mockResolvedValue(null);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://navet.local/jellyfin-signed');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('image', {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      })
    );

    const { result } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.jellyfin_tv',
        liveEntityPicture:
          'https://ha.example.test/api/media_player_proxy/media_player.jellyfin_tv?authSig=signed-artwork-token',
        homeAssistantUrl: 'https://ha.example.test',
      })
    );

    await waitFor(() => {
      expect(result.current.albumArt).toBe('blob:http://navet.local/jellyfin-signed');
    });
    expectFetchUrl(
      fetchMock,
      '/api/media_player_proxy/media_player.jellyfin_tv?authSig=signed-artwork-token'
    );
  });

  it('fetches relative Home Assistant media proxy artwork through the Docker proxy', async () => {
    installRuntimeProxyConfig();
    fetchMediaThumbnailDataUrlMock.mockResolvedValue(null);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://navet.local/docker-album-art');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('image', {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      })
    );

    const { result } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.kitchen',
        liveEntityPicture: '/api/media_player_proxy/media_player.kitchen',
        homeAssistantUrl: 'http://homeassistant.local:8123',
      })
    );

    await waitFor(() => {
      expect(result.current.albumArt).toBe('blob:http://navet.local/docker-album-art');
    });
    expect(result.current.artworkResource).toMatchObject({
      kind: 'image',
      url: 'blob:http://navet.local/docker-album-art',
      authStrategy: 'none',
    });
    expectFetchUrl(fetchMock, '/__navet_ha_proxy__/api/media_player_proxy/media_player.kitchen');
  });

  // Rewrite: Ingress artwork uses user-signed host URLs; privileged add-on proxying is forbidden.
  it('fetches user-signed Ingress artwork directly from Home Assistant when runtime HA config exists', async () => {
    installIngressBase();
    installRuntimeProxyConfig();
    fetchMediaThumbnailDataUrlMock.mockResolvedValue(null);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://navet.local/addon-album-art');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('image', {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      })
    );

    const { result } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.kitchen',
        liveEntityPicture: '/api/media_player_proxy/media_player.kitchen',
        homeAssistantUrl: 'http://homeassistant.local:8123',
      })
    );

    await waitFor(() => {
      expect(result.current.albumArt).toBe('blob:http://navet.local/addon-album-art');
      expect(result.current.artworkResource?.expiresAt).toBeUndefined();
    });
    expectFetchUrl(
      fetchMock,
      '/api/media_player_proxy/media_player.kitchen?authSig=current-user-signature'
    );
  });

  it('fetches absolute Home Assistant artwork through a user-signed host URL in Ingress', async () => {
    installIngressBase();
    installRuntimeProxyConfig();
    fetchMediaThumbnailDataUrlMock.mockResolvedValue(null);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue(
      'blob:http://navet.local/addon-absolute-album-art'
    );
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('image', {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      })
    );

    const { result } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.kitchen',
        liveEntityPicture:
          'http://homeassistant.local:8123/api/media_player_proxy/media_player.kitchen',
        homeAssistantUrl: 'http://homeassistant.local:8123',
      })
    );

    await waitFor(() => {
      expect(result.current.albumArt).toBe('blob:http://navet.local/addon-absolute-album-art');
    });
    expectFetchUrl(
      fetchMock,
      '/api/media_player_proxy/media_player.kitchen?authSig=current-user-signature'
    );
  });

  it('fetches user-signed Ingress artwork when runtime HA config is empty', async () => {
    installIngressBase();
    fetchMediaThumbnailDataUrlMock.mockResolvedValue(null);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue(
      'blob:http://navet.local/addon-direct-album-art'
    );
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('image', {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      })
    );

    const { result } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.kitchen',
        liveEntityPicture: '/api/media_player_proxy/media_player.kitchen',
        homeAssistantUrl: 'http://homeassistant.local:8123',
      })
    );

    await waitFor(() => {
      expect(result.current.albumArt).toBe('blob:http://navet.local/addon-direct-album-art');
    });
    expectFetchUrl(
      fetchMock,
      '/api/media_player_proxy/media_player.kitchen?authSig=current-user-signature'
    );
  });

  it('keeps the user-signed host URL when empty-runtime Ingress artwork fetch fails', async () => {
    installIngressBase();
    fetchMediaThumbnailDataUrlMock.mockResolvedValue(null);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));

    const { result } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.kitchen',
        liveEntityPicture: '/api/media_player_proxy/media_player.kitchen',
        homeAssistantUrl: 'http://homeassistant.local:8123',
      })
    );

    await waitFor(() => {
      expect(fetchMediaThumbnailDataUrlMock).toHaveBeenCalledWith('media_player.kitchen');
    });
    expectFetchUrl(
      fetchMock,
      '/api/media_player_proxy/media_player.kitchen?authSig=current-user-signature'
    );
    await waitFor(() => {
      expect(result.current.albumArt).toBe(
        '/api/media_player_proxy/media_player.kitchen?authSig=current-user-signature'
      );
    });
  });

  it('fetches absolute Home Assistant media proxy artwork through the Docker proxy', async () => {
    installRuntimeProxyConfig();
    fetchMediaThumbnailDataUrlMock.mockResolvedValue(null);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue(
      'blob:http://navet.local/docker-absolute-album-art'
    );
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('image', {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      })
    );

    const { result } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.kitchen',
        liveEntityPicture:
          'http://homeassistant.local:8123/api/media_player_proxy/media_player.kitchen',
        homeAssistantUrl: 'http://homeassistant.local:8123',
      })
    );

    await waitFor(() => {
      expect(result.current.albumArt).toBe('blob:http://navet.local/docker-absolute-album-art');
    });
    expectFetchUrl(fetchMock, '/__navet_ha_proxy__/api/media_player_proxy/media_player.kitchen');
  });

  it('keeps Docker proxy artwork when authenticated fetch fails', async () => {
    installRuntimeProxyConfig();
    fetchMediaThumbnailDataUrlMock.mockResolvedValue(null);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));

    const { result } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.kitchen',
        liveEntityPicture:
          'http://homeassistant.local:8123/api/media_player_proxy/media_player.kitchen',
        homeAssistantUrl: 'http://homeassistant.local:8123',
      })
    );

    await waitFor(() => {
      expect(fetchMediaThumbnailDataUrlMock).toHaveBeenCalledWith('media_player.kitchen');
    });
    await waitFor(() => {
      expect(result.current.albumArt).toBe(
        '/__navet_ha_proxy__/api/media_player_proxy/media_player.kitchen'
      );
    });
  });

  it('falls back to normalized cache artwork URLs when Home Assistant media proxy artwork returns a broken response', async () => {
    installRuntimeProxyConfig();
    fetchMediaThumbnailDataUrlMock.mockResolvedValue(null);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      })
    );

    const { result } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.kitchen',
        liveEntityPicture:
          '/api/media_player_proxy/media_player.kitchen?token=test-token&cache=https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/66/7a/9e/667a9e1e-c6d4-a658-2a36-f96ff92f3dbc/067003220361.png/{w}x{h}bb.{f}',
        homeAssistantUrl: 'http://homeassistant.local:8123',
      })
    );

    await waitFor(() => {
      expect(result.current.albumArt).toBe(
        'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/66/7a/9e/667a9e1e-c6d4-a658-2a36-f96ff92f3dbc/067003220361.png/512x512bb.png'
      );
    });
    expectFetchUrl(
      fetchMock,
      '/__navet_ha_proxy__/api/media_player_proxy/media_player.kitchen?token=test-token&cache=https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/66/7a/9e/667a9e1e-c6d4-a658-2a36-f96ff92f3dbc/067003220361.png/{w}x{h}bb.{f}'
    );
    expect(result.current.artworkResource).toMatchObject({
      kind: 'image',
      url: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/66/7a/9e/667a9e1e-c6d4-a658-2a36-f96ff92f3dbc/067003220361.png/512x512bb.png',
      authStrategy: 'none',
    });
  });

  it('keeps Home Assistant proxy artwork when non-YouTube opaque cache artwork has music metadata', async () => {
    installRuntimeProxyConfig();
    fetchMediaThumbnailDataUrlMock.mockResolvedValue(null);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);

      if (url.startsWith('https://musicbrainz.org/ws/2/release')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              releases: [
                {
                  id: '8c7b18fe-c68b-3bcf-980d-9d75208615e5',
                  score: 100,
                  status: 'Official',
                  title: 'I’m Wide Awake, It’s Morning',
                  'artist-credit': [{ name: 'Bright Eyes' }],
                  'release-group': {
                    title: 'I’m Wide Awake, It’s Morning',
                    'primary-type': 'Album',
                  },
                  media: [{ format: 'Digital Media' }],
                },
              ],
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        );
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    const { result } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.kitchen',
        liveEntityPicture:
          '/api/media_player_proxy/media_player.kitchen?token=test-token&cache=be07c2bb6494d520',
        liveAttrs: {
          app_name: 'Spotify',
          media_title: 'Poison Oak',
          media_artist: 'Bright Eyes',
          media_album_name: 'I’m Wide Awake, It’s Morning',
        },
        homeAssistantUrl: 'http://homeassistant.local:8123',
      })
    );

    await waitFor(() => {
      expect(result.current.albumArt).toBe(
        '/__navet_ha_proxy__/api/media_player_proxy/media_player.kitchen?token=test-token&cache=be07c2bb6494d520'
      );
    });
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).not.toContainEqual(
      expect.stringContaining('https://musicbrainz.org/ws/2/release')
    );
  });

  it('keeps Home Assistant proxy artwork when non-YouTube opaque cache artwork has album metadata', async () => {
    installRuntimeProxyConfig();
    fetchMediaThumbnailDataUrlMock.mockResolvedValue(null);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);

      if (url.startsWith('https://musicbrainz.org/ws/2/release')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              releases: [
                {
                  id: 'release-id',
                  score: 100,
                  status: 'Official',
                  title: 'Pablo Honey',
                  'artist-credit': [{ name: 'Radiohead' }],
                  'release-group': {
                    id: 'release-group-id',
                    title: 'Pablo Honey',
                    'primary-type': 'Album',
                  },
                  media: [{ format: 'Digital Media' }],
                },
              ],
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        );
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    const { result } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.kitchen',
        liveEntityPicture:
          '/api/media_player_proxy/media_player.kitchen?token=test-token&cache=be07c2bb6494d520',
        liveAttrs: {
          app_name: 'Spotify',
          media_title: 'Creep',
          media_artist: 'Radiohead',
          media_album_name: 'Pablo Honey',
        },
      })
    );

    await waitFor(() => {
      expect(result.current.albumArt).toBe(
        '/__navet_ha_proxy__/api/media_player_proxy/media_player.kitchen?token=test-token&cache=be07c2bb6494d520'
      );
    });
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).not.toContainEqual(
      expect.stringContaining('https://musicbrainz.org/ws/2/release')
    );
  });

  it('keeps Home Assistant proxy artwork when non-YouTube opaque cache artwork only has title and artist metadata', async () => {
    installRuntimeProxyConfig();
    fetchMediaThumbnailDataUrlMock.mockResolvedValue(null);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);

      if (url.startsWith('https://musicbrainz.org/ws/2/release')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              releases: [
                {
                  id: 'title-only-release-id',
                  score: 95,
                  status: 'Official',
                  title: 'Creep',
                  'artist-credit': [{ name: 'Radiohead' }],
                  media: [{ format: 'Digital Media' }],
                },
              ],
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        );
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    const { result } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.kitchen',
        liveEntityPicture:
          '/api/media_player_proxy/media_player.kitchen?token=test-token&cache=be07c2bb6494d520',
        liveAttrs: {
          app_name: 'Spotify',
          media_title: 'Creep',
          media_artist: 'Radiohead',
        },
      })
    );

    await waitFor(() => {
      expect(result.current.albumArt).toBe(
        '/__navet_ha_proxy__/api/media_player_proxy/media_player.kitchen?token=test-token&cache=be07c2bb6494d520'
      );
    });
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).not.toContainEqual(
      expect.stringContaining('https://musicbrainz.org/ws/2/release')
    );
  });

  it('uses the fast thumbnail path before metadata fallbacks when HomePod artwork only exposes an opaque cache key', async () => {
    installRuntimeProxyConfig();
    fetchMediaThumbnailDataUrlMock.mockResolvedValue('data:image/jpeg;base64,youtube-thumbnail');
    vi.spyOn(URL, 'createObjectURL').mockReturnValue(
      'blob:http://navet.local/youtube-musicbrainz-cover-art'
    );
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);

      if (url.startsWith('https://musicbrainz.org/ws/2/release')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              releases: [
                {
                  id: 'bright-eyes-release-id',
                  score: 100,
                  status: 'Official',
                  title: 'I’m Wide Awake, It’s Morning',
                  'artist-credit': [{ name: 'Bright Eyes' }],
                  'release-group': {
                    id: 'bright-eyes-release-group-id',
                    title: 'I’m Wide Awake, It’s Morning',
                    'primary-type': 'Album',
                  },
                  media: [{ format: 'Digital Media' }],
                },
              ],
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        );
      }

      if (url === 'https://coverartarchive.org/release/bright-eyes-release-id/front-500') {
        return Promise.resolve(
          new Response('image', {
            status: 200,
            headers: { 'Content-Type': 'image/jpeg' },
          })
        );
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    const { result } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.kitchen',
        liveEntityPicture:
          '/api/media_player_proxy/media_player.kitchen?token=test-token&cache=ebc5b876a366a328',
        liveAttrs: {
          app_name: 'YouTube Music',
          media_content_id: 'zNm-tWPArDM',
          media_title: 'Poison Oak',
          media_artist: 'Bright Eyes',
          media_album_name: 'I’m Wide Awake, It’s Morning',
        },
        homeAssistantUrl: 'http://homeassistant.local:8123',
        liveArtworkKey: 'Poison Oak::Bright Eyes',
      })
    );

    await waitFor(() => {
      expect(result.current.albumArt).toBe('data:image/jpeg;base64,youtube-thumbnail');
    });
    expect(fetchMediaThumbnailDataUrlMock).toHaveBeenCalledWith('media_player.kitchen');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://musicbrainz.org/ws/2/release'),
      expect.objectContaining({
        headers: { Accept: 'application/json' },
      })
    );
  });

  it('does not prefer MusicBrainz first for non-YouTube opaque cache artwork', async () => {
    installRuntimeProxyConfig();
    fetchMediaThumbnailDataUrlMock.mockResolvedValue(null);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://navet.local/resolved-artwork');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('image', {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      })
    );

    const { result } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.kitchen',
        liveEntityPicture:
          '/api/media_player_proxy/media_player.kitchen?token=test-token&cache=a94e2d54cff36dd0',
        liveAttrs: {
          app_name: 'Spotify',
          media_title: 'Land Locked Blues',
          media_artist: 'Bright Eyes',
          media_album_name: "I'm Wide Awake, It's Morning",
        },
        homeAssistantUrl: 'http://homeassistant.local:8123',
      })
    );

    await waitFor(() => {
      expect(result.current.albumArt).toBe('blob:http://navet.local/resolved-artwork');
    });

    expect(fetchMock.mock.calls.map((call) => String(call[0]))).not.toContainEqual(
      expect.stringContaining('https://musicbrainz.org/ws/2/release')
    );
  });

  it('falls back to YouTube Music thumbnails when MusicBrainz has no usable match', async () => {
    installRuntimeProxyConfig();
    fetchMediaThumbnailDataUrlMock.mockResolvedValue(null);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue(
      'blob:http://navet.local/youtube-thumbnail-square'
    );
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);

      if (url.startsWith('https://musicbrainz.org/ws/2/release')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              releases: [],
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        );
      }

      if (url === 'https://i.ytimg.com/vi/zNm-tWPArDM/hqdefault.jpg') {
        return Promise.resolve(
          new Response('image', {
            status: 200,
            headers: { 'Content-Type': 'image/jpeg' },
          })
        );
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    const { result } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.kitchen',
        liveEntityPicture:
          '/api/media_player_proxy/media_player.kitchen?token=test-token&cache=ebc5b876a366a328',
        liveAttrs: {
          app_name: 'YouTube Music',
          media_content_id: 'zNm-tWPArDM',
          media_title: 'Poison Oak',
          media_artist: 'Bright Eyes',
        },
        homeAssistantUrl: 'http://homeassistant.local:8123',
        liveArtworkKey: 'Poison Oak::Bright Eyes',
      })
    );

    await waitFor(() => {
      expect(result.current.albumArt).toBe('blob:http://navet.local/youtube-thumbnail-square');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://musicbrainz.org/ws/2/release'),
      expect.objectContaining({
        headers: { Accept: 'application/json' },
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://i.ytimg.com/vi/zNm-tWPArDM/hqdefault.jpg',
      expect.objectContaining({ cache: 'force-cache' })
    );
  });

  it('keeps the user-signed host URL when Ingress blob normalization fails despite returning 200', async () => {
    installIngressBase();
    installRuntimeProxyConfig();
    fetchMediaThumbnailDataUrlMock.mockResolvedValue(null);
    const createImageBitmapMock = vi.fn().mockRejectedValue(new Error('decode failed'));
    vi.stubGlobal('createImageBitmap', createImageBitmapMock);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('broken image bytes', {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      })
    );

    const { result } = renderHook(() =>
      useMediaArtworkResolution({
        entityId: 'media_player.kitchen',
        liveEntityPicture: '/api/media_player_proxy/media_player.kitchen',
        homeAssistantUrl: 'http://homeassistant.local:8123',
      })
    );

    await waitFor(() => {
      expect(fetchMediaThumbnailDataUrlMock).toHaveBeenCalledWith('media_player.kitchen');
    });
    await waitFor(() => {
      expect(createImageBitmapMock).toHaveBeenCalled();
    });
    expect(result.current.albumArt).toBe(
      '/api/media_player_proxy/media_player.kitchen?authSig=current-user-signature'
    );
  });

  it('reloads authenticated artwork when the track key changes but the proxy URL stays stable', async () => {
    fetchMediaThumbnailDataUrlMock
      .mockResolvedValueOnce('data:image/jpeg;base64,first-track')
      .mockResolvedValueOnce('data:image/jpeg;base64,second-track');

    const { result, rerender } = renderHook(
      ({ liveArtworkKey }: { liveArtworkKey: string }) =>
        useMediaArtworkResolution({
          entityId: 'media_player.kitchen',
          liveEntityPicture: '/api/media_player_proxy/media_player.kitchen',
          liveArtworkKey,
          homeAssistantUrl: 'http://homeassistant.local:8123',
        }),
      { initialProps: { liveArtworkKey: 'first-title::first-artist' } }
    );

    await waitFor(() => {
      expect(result.current.albumArt).toBe('data:image/jpeg;base64,first-track');
    });

    rerender({ liveArtworkKey: 'second-title::second-artist' });

    await waitFor(() => {
      expect(result.current.albumArt).toBe('data:image/jpeg;base64,second-track');
    });
    expect(fetchMediaThumbnailDataUrlMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the previous authenticated artwork visible while the next track artwork loads', async () => {
    let callCount = 0;
    fetchMediaThumbnailDataUrlMock.mockImplementation(() =>
      callCount++ === 0
        ? Promise.resolve('data:image/jpeg;base64,first-track')
        : new Promise<string>(() => undefined)
    );

    const { result, rerender } = renderHook(
      ({ liveArtworkKey }: { liveArtworkKey: string }) =>
        useMediaArtworkResolution({
          entityId: 'media_player.kitchen',
          liveEntityPicture: '/api/media_player_proxy/media_player.kitchen',
          liveArtworkKey,
          homeAssistantUrl: 'http://homeassistant.local:8123',
        }),
      { initialProps: { liveArtworkKey: 'first-title::first-artist' } }
    );

    await waitFor(() => {
      expect(result.current.albumArt).toBe('data:image/jpeg;base64,first-track');
    });

    rerender({ liveArtworkKey: 'second-title::second-artist' });

    expect(result.current.albumArt).toBe('data:image/jpeg;base64,first-track');
    await waitFor(() => {
      expect(fetchMediaThumbnailDataUrlMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('keeps previous artwork through transient missing entity picture updates', async () => {
    fetchMediaThumbnailDataUrlMock.mockResolvedValue('data:image/jpeg;base64,first-track');

    const { result, rerender } = renderHook(
      ({ liveEntityPicture }: { liveEntityPicture?: string }) =>
        useMediaArtworkResolution({
          entityId: 'media_player.kitchen',
          liveEntityPicture,
          liveArtworkKey: 'first-title::first-artist',
          homeAssistantUrl: 'http://homeassistant.local:8123',
        }),
      {
        initialProps: {
          liveEntityPicture: '/api/media_player_proxy/media_player.kitchen',
        } as { liveEntityPicture?: string },
      }
    );

    await waitFor(() => {
      expect(result.current.albumArt).toBe('data:image/jpeg;base64,first-track');
    });

    vi.useFakeTimers();
    try {
      rerender({ liveEntityPicture: undefined });

      expect(result.current.albumArt).toBe('data:image/jpeg;base64,first-track');

      act(() => {
        vi.advanceTimersByTime(ARTWORK_CLEAR_TEST_DELAY_MS - 1);
      });

      expect(result.current.albumArt).toBe('data:image/jpeg;base64,first-track');

      act(() => {
        vi.advanceTimersByTime(1);
      });

      expect(result.current.albumArt).toBe('data:image/jpeg;base64,first-track');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reloads authenticated artwork when only the entity update timestamp changes', async () => {
    fetchMediaThumbnailDataUrlMock
      .mockResolvedValueOnce('data:image/jpeg;base64,first-update')
      .mockResolvedValueOnce('data:image/jpeg;base64,second-update');

    const { result, rerender } = renderHook(
      ({ artworkVersionKey }: { artworkVersionKey: string }) =>
        useMediaArtworkResolution({
          entityId: 'media_player.kitchen',
          liveEntityPicture: '/api/media_player_proxy/media_player.kitchen',
          liveArtworkKey: 'stable-content-id',
          artworkVersionKey,
          homeAssistantUrl: 'http://homeassistant.local:8123',
        }),
      { initialProps: { artworkVersionKey: '2026-05-17T20:00:00.000Z' } }
    );

    await waitFor(() => {
      expect(result.current.albumArt).toBe('data:image/jpeg;base64,first-update');
    });

    rerender({ artworkVersionKey: '2026-05-17T20:01:00.000Z' });

    await waitFor(() => {
      expect(result.current.albumArt).toBe('data:image/jpeg;base64,second-update');
    });
    expect(fetchMediaThumbnailDataUrlMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
