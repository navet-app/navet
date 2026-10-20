import { resetRuntimeContextForTests } from '@navet/app/infrastructure/home-assistant/runtime/runtime-detector';
import { homeAssistantUrlFixtures } from '@navet/app/test/fixtures/home-assistant/resources/urls';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  resolveHomeAssistantAbsoluteUrl,
  resolveHomeAssistantProxyUrl,
} from '../home-assistant-url';

describe('home-assistant-url', () => {
  beforeEach(() => {
    document.querySelector('base')?.remove();
    window.__NAVET_PANEL__ = false;
    window.__NAVET_CONFIG__ = undefined;
    resetRuntimeContextForTests();
  });

  it('keeps safe app asset paths for absolute artwork resolution', () => {
    expect(resolveHomeAssistantAbsoluteUrl('/navet/demo/assets/album.jpg')).toBe(
      '/navet/demo/assets/album.jpg'
    );
  });

  it('keeps safe app asset paths for development artwork resolution', () => {
    expect(resolveHomeAssistantProxyUrl('/navet/demo/assets/album.jpg')).toBe(
      '/navet/demo/assets/album.jpg'
    );
  });

  it('still proxies Home Assistant media paths in development', () => {
    expect(resolveHomeAssistantProxyUrl(homeAssistantUrlFixtures.relativeMediaArtwork)).toBe(
      `/__navet_ha_proxy__${homeAssistantUrlFixtures.relativeMediaArtwork}`
    );
  });

  // Rewrite: Ingress media resolves on the host HA origin, without the add-on proxy.
  it('resolves Home Assistant media paths on the host origin in Ingress', () => {
    const base = document.createElement('base');
    base.href = `${window.location.origin}/api/hassio_ingress/addon-slug/`;
    document.head.append(base);
    resetRuntimeContextForTests();

    expect(resolveHomeAssistantProxyUrl(homeAssistantUrlFixtures.relativeMediaArtwork)).toBe(
      homeAssistantUrlFixtures.relativeMediaArtwork
    );
  });

  it('resolves Home Assistant media paths directly when proxy generation is disabled', () => {
    expect(
      resolveHomeAssistantProxyUrl(
        '/api/media_player_proxy/media_player.living_room',
        'https://ha.example.test',
        { proxyAvailable: false }
      )
    ).toBe(`https://ha.example.test${homeAssistantUrlFixtures.relativeMediaArtwork}`);
  });

  it('does not keep stale Home Assistant proxy paths when proxy generation is disabled', () => {
    expect(
      resolveHomeAssistantProxyUrl(
        homeAssistantUrlFixtures.staleProxyMediaArtwork,
        'https://ha.example.test',
        { proxyAvailable: false }
      )
    ).toBeNull();
  });

  it('proxies absolute Home Assistant media URLs when they match the configured Home Assistant URL', () => {
    window.__NAVET_CONFIG__ = { hassUrl: 'https://ha.example.test' };
    resetRuntimeContextForTests();
    expect(resolveHomeAssistantProxyUrl(homeAssistantUrlFixtures.absoluteHaMediaArtwork)).toBe(
      `/__navet_ha_proxy__${homeAssistantUrlFixtures.relativeMediaArtwork}`
    );
  });

  it('resolves internal Home Assistant media URLs on the Ingress host origin', () => {
    const base = document.createElement('base');
    base.href = `${window.location.origin}/api/hassio_ingress/addon-slug/`;
    document.head.append(base);
    window.__NAVET_CONFIG__ = { hassUrl: window.location.origin };
    resetRuntimeContextForTests();

    expect(
      resolveHomeAssistantProxyUrl(
        'http://homeassistant:8123/api/media_player_proxy/media_player.living_room'
      )
    ).toBe(homeAssistantUrlFixtures.relativeMediaArtwork);
  });

  it('keeps matching absolute Home Assistant media URLs direct when proxy generation is disabled', () => {
    window.__NAVET_CONFIG__ = { hassUrl: 'https://ha.example.test' };
    resetRuntimeContextForTests();
    expect(
      resolveHomeAssistantProxyUrl(
        homeAssistantUrlFixtures.absoluteHaMediaArtwork,
        'https://ha.example.test',
        { proxyAvailable: false }
      )
    ).toBe(`https://ha.example.test${homeAssistantUrlFixtures.relativeMediaArtwork}`);
  });

  it('keeps Home Assistant image API paths same-origin in panel mode', () => {
    window.__NAVET_PANEL__ = true;
    resetRuntimeContextForTests();

    expect(resolveHomeAssistantProxyUrl(homeAssistantUrlFixtures.relativeImageServe)).toBe(
      homeAssistantUrlFixtures.relativeImageServe
    );
  });

  it('strips stale Home Assistant proxy image paths in panel mode', () => {
    window.__NAVET_PANEL__ = true;
    resetRuntimeContextForTests();

    expect(
      resolveHomeAssistantProxyUrl(
        `/__navet_ha_proxy__${homeAssistantUrlFixtures.relativeImageServe}`
      )
    ).toBe(homeAssistantUrlFixtures.relativeImageServe);
  });

  it('strips stale Home Assistant proxy image paths for absolute resolution in panel mode', () => {
    window.__NAVET_PANEL__ = true;
    resetRuntimeContextForTests();

    expect(
      resolveHomeAssistantAbsoluteUrl(
        `/__navet_ha_proxy__${homeAssistantUrlFixtures.relativeImageServe}`
      )
    ).toBe(homeAssistantUrlFixtures.relativeImageServe);
  });

  it('keeps Home Assistant media proxy paths same-origin in panel mode', () => {
    window.__NAVET_PANEL__ = true;
    resetRuntimeContextForTests();

    expect(resolveHomeAssistantProxyUrl(homeAssistantUrlFixtures.relativeMediaArtwork)).toBe(
      homeAssistantUrlFixtures.relativeMediaArtwork
    );
  });

  it('keeps safe app asset paths unchanged in panel mode', () => {
    window.__NAVET_PANEL__ = true;
    resetRuntimeContextForTests();

    expect(resolveHomeAssistantProxyUrl('/navet/demo/assets/album.jpg')).toBe(
      '/navet/demo/assets/album.jpg'
    );
  });

  it('keeps external image URLs sanitized in panel mode', () => {
    window.__NAVET_PANEL__ = true;
    resetRuntimeContextForTests();

    expect(resolveHomeAssistantProxyUrl('https://cdn.example.test/album.jpg')).toBe(
      'https://cdn.example.test/album.jpg'
    );
  });

  it('keeps absolute Home Assistant URLs same-origin in panel mode', () => {
    window.__NAVET_PANEL__ = true;
    window.__NAVET_CONFIG__ = { hassUrl: 'https://ha.example.test' };
    resetRuntimeContextForTests();

    expect(resolveHomeAssistantProxyUrl(homeAssistantUrlFixtures.absoluteHaSignedImage)).toBe(
      homeAssistantUrlFixtures.signedImageServe
    );
  });

  it('strips stale absolute Home Assistant proxy URLs in panel mode', () => {
    window.__NAVET_PANEL__ = true;
    resetRuntimeContextForTests();

    expect(
      resolveHomeAssistantProxyUrl(
        `${window.location.origin}/__navet_ha_proxy__${homeAssistantUrlFixtures.relativeImageServe}`
      )
    ).toBe(homeAssistantUrlFixtures.relativeImageServe);
  });

  it('strips stale configured Home Assistant proxy media URLs in panel mode', () => {
    window.__NAVET_PANEL__ = true;
    window.__NAVET_CONFIG__ = { hassUrl: 'https://ha.example.test' };
    resetRuntimeContextForTests();

    expect(
      resolveHomeAssistantProxyUrl(homeAssistantUrlFixtures.absoluteIngressProxyMediaArtwork)
    ).toBe(homeAssistantUrlFixtures.relativeMediaArtwork);
  });

  it('keeps relative Home Assistant URLs same-origin for absolute resolution in panel mode', () => {
    window.__NAVET_PANEL__ = true;
    resetRuntimeContextForTests();

    expect(resolveHomeAssistantAbsoluteUrl(homeAssistantUrlFixtures.relativeImageServe)).toBe(
      homeAssistantUrlFixtures.relativeImageServe
    );
  });

  it('proxies Home Assistant media paths for hosted runtime artwork resolution', () => {
    window.__NAVET_CONFIG__ = { hassUrl: 'https://ha.example.test' };
    resetRuntimeContextForTests();
    expect(resolveHomeAssistantProxyUrl(homeAssistantUrlFixtures.relativeMediaArtwork)).toBe(
      `/__navet_ha_proxy__${homeAssistantUrlFixtures.relativeMediaArtwork}`
    );
  });

  it('proxies Home Assistant camera snapshot paths in hosted runtimes', () => {
    window.__NAVET_CONFIG__ = { hassUrl: 'https://ha.example.test' };
    resetRuntimeContextForTests();

    expect(resolveHomeAssistantProxyUrl(homeAssistantUrlFixtures.relativeCameraSnapshot)).toBe(
      `/__navet_ha_proxy__${homeAssistantUrlFixtures.relativeCameraSnapshot}`
    );
  });

  it('keeps signed Home Assistant image paths stable in panel mode', () => {
    window.__NAVET_PANEL__ = true;
    resetRuntimeContextForTests();

    expect(resolveHomeAssistantProxyUrl(homeAssistantUrlFixtures.signedImageServe)).toBe(
      homeAssistantUrlFixtures.signedImageServe
    );
  });

  it('returns null for unsafe or unavailable resource URLs', () => {
    expect(resolveHomeAssistantProxyUrl(homeAssistantUrlFixtures.unsafeJavascriptUrl)).toBeNull();
  });
});
