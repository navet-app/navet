import { resetRuntimeContextForTests } from '@navet/app/infrastructure/home-assistant/runtime/runtime-detector';
import { homeAssistantService } from '@navet/app/services/home-assistant.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveArtworkMock } = vi.hoisted(() => ({
  resolveArtworkMock: vi.fn(),
}));

vi.mock(
  '@navet/app/infrastructure/home-assistant/home-assistant-shared-infrastructure',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@navet/app/infrastructure/home-assistant/home-assistant-shared-infrastructure')
      >();

    return {
      ...actual,
      mediaArtworkService: {
        ...actual.mediaArtworkService,
        resolveArtwork: resolveArtworkMock,
      },
    };
  }
);

describe('integration-resource.service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.__NAVET_CONFIG__ = undefined;
    resetRuntimeContextForTests();
  });
  beforeEach(() => {
    resolveArtworkMock.mockReset();
    resolveArtworkMock.mockResolvedValue({
      id: 'artwork',
      kind: 'url',
      cacheKey: 'artwork',
      authStrategy: 'none',
      url: 'https://example.com/artwork.jpg',
    });
  });

  it('routes artwork resolution through the provider contract', async () => {
    const { resolveResource } = await import('../integration-resource.service');

    const result = await resolveResource(
      'home_assistant:media_player.living_room',
      'media_artwork',
      {
        attrs: {
          entity_picture: '/api/media_player_proxy/media_player.living_room',
        },
        fallbackPicture: '/fallback.jpg',
      }
    );

    expect(resolveArtworkMock).toHaveBeenCalledWith(
      'media_player.living_room',
      {
        entity_picture: '/api/media_player_proxy/media_player.living_room',
      },
      '/fallback.jpg'
    );
    expect(result).toMatchObject({
      kind: 'url',
      url: 'https://example.com/artwork.jpg',
    });
  });

  it('returns unavailable resources for Homey artwork requests', async () => {
    const { resolveResource } = await import('../integration-resource.service');

    await expect(resolveResource('homey:device-1', 'media_artwork')).resolves.toMatchObject({
      id: 'homey:device-1',
      kind: 'unavailable',
    });
  });

  it.each([
    '/api/camera_proxy/camera.front',
    '/api/media_player_proxy/media_player.living_room',
    '/api/image/serve/photo/512x512',
  ])('resolves display URLs through the current-user signing bridge: %s', async (url) => {
    window.__NAVET_CONFIG__ = { runtime: 'ha-ingress' };
    resetRuntimeContextForTests();
    const sign = vi
      .spyOn(homeAssistantService, 'signPath')
      .mockResolvedValue({ path: `${url}?authSig=current-user` });
    const { resolveResourceUrl } = await import('../integration-resource.service');
    await expect(resolveResourceUrl(url, 'home_assistant')).resolves.toBe(
      `${url}?authSig=current-user`
    );
    expect(sign).toHaveBeenCalledWith(url, 30);
  });

  it('does not expose an unsigned Ingress URL when signing is denied', async () => {
    window.__NAVET_CONFIG__ = { runtime: 'ha-ingress' };
    resetRuntimeContextForTests();
    vi.spyOn(homeAssistantService, 'signPath').mockRejectedValue(new Error('unauthorized'));
    const { resolveResourceUrl } = await import('../integration-resource.service');
    await expect(
      resolveResourceUrl('/api/camera_proxy/camera.front', 'home_assistant')
    ).resolves.toBeNull();
  });

  it('preserves the signed resource expiry across the provider boundary', async () => {
    window.__NAVET_CONFIG__ = { runtime: 'ha-ingress' };
    resetRuntimeContextForTests();
    vi.spyOn(homeAssistantService, 'signPath').mockResolvedValue({
      path: '/api/image?authSig=current-user',
    });
    const { resolveDisplayResource } = await import('../integration-resource.service');
    const start = Date.now();
    const resource = await resolveDisplayResource('/api/image', 'home_assistant');
    expect(resource.expiresAt).toBeGreaterThanOrEqual(start + 30_000);
    expect(resource.expiresAt).toBeLessThanOrEqual(Date.now() + 30_000);
  });
});
