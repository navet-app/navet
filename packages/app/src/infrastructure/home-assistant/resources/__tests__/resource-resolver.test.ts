import { resetRuntimeContextForTests } from '@navet/app/infrastructure/home-assistant/runtime/runtime-detector';
import { oauthSessionFixture } from '@navet/app/test/fixtures/home-assistant/auth/oauth';
import { signedPathFixture } from '@navet/app/test/fixtures/home-assistant/auth/signed-path';
import { homeAssistantUrlFixtures } from '@navet/app/test/fixtures/home-assistant/resources/urls';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeAssistantResourceResolver } from '../resource-resolver';

describe('HomeAssistantResourceResolver', () => {
  beforeEach(() => {
    document.querySelector('base')?.remove();
    window.history.replaceState({}, '', '/');
    window.__NAVET_PANEL__ = false;
    window.__NAVET_CONFIG__ = undefined;
    resetRuntimeContextForTests();
  });

  it('rewrites relative Home Assistant media paths through the same-origin proxy', () => {
    window.__NAVET_CONFIG__ = { hassUrl: oauthSessionFixture.haBaseUrl };
    resetRuntimeContextForTests();
    const resolver = new HomeAssistantResourceResolver(() => null);

    const resource = resolver.resolveSync({
      kind: 'media_artwork',
      entityId: 'media_player.living_room',
      rawPath: homeAssistantUrlFixtures.relativeMediaArtwork,
    });

    expect(resource.url).toBe(
      `/__navet_ha_proxy__${homeAssistantUrlFixtures.relativeMediaArtwork}`
    );
    expect(resource.authStrategy).toBe('same_origin');
  });

  it('preserves signed image paths while proxying them in hosted runtimes', () => {
    window.__NAVET_CONFIG__ = { hassUrl: oauthSessionFixture.haBaseUrl };
    resetRuntimeContextForTests();
    const resolver = new HomeAssistantResourceResolver(() => null);

    const resource = resolver.resolveSync({
      kind: 'absolute_url',
      url: homeAssistantUrlFixtures.signedImageServe,
    });

    expect(resource.url).toBe(`/__navet_ha_proxy__${homeAssistantUrlFixtures.signedImageServe}`);
    expect(resource.authStrategy).toBe('same_origin');
  });

  it('keeps standalone OAuth signed resources on the same-origin proxy when available', async () => {
    window.__NAVET_CONFIG__ = { hassUrl: oauthSessionFixture.haBaseUrl };
    resetRuntimeContextForTests();
    const signPath = async (path: string) =>
      path === signedPathFixture.sourceWebSocketCommand.path ? signedPathFixture.path : null;
    const resolver = new HomeAssistantResourceResolver(
      () => ({
        providerId: 'home_assistant',
        runtime: oauthSessionFixture.runtime,
        authMode: oauthSessionFixture.authMode,
        haBaseUrl: oauthSessionFixture.haBaseUrl,
        hassUrl: oauthSessionFixture.hassUrl,
      }),
      signPath
    );

    const resource = await resolver.resolve({
      kind: 'absolute_url',
      url: homeAssistantUrlFixtures.relativeImageServe,
    });

    expect(resource.url).toBe(`/__navet_ha_proxy__${signedPathFixture.path}`);
    expect(resource.authStrategy).toBe('same_origin');
  });

  it('keeps standalone OAuth signed camera snapshots on the same-origin proxy', async () => {
    window.__NAVET_CONFIG__ = { hassUrl: oauthSessionFixture.haBaseUrl };
    resetRuntimeContextForTests();
    const signedSnapshotPath = '/api/camera_proxy/camera.front_door?authSig=signed-camera-token';
    const resolver = new HomeAssistantResourceResolver(
      () => ({
        providerId: 'home_assistant',
        runtime: oauthSessionFixture.runtime,
        authMode: oauthSessionFixture.authMode,
        haBaseUrl: oauthSessionFixture.haBaseUrl,
        hassUrl: oauthSessionFixture.hassUrl,
      }),
      async (path) =>
        path === homeAssistantUrlFixtures.relativeCameraSnapshot ? signedSnapshotPath : null
    );

    const resource = await resolver.resolve({
      kind: 'camera_snapshot',
      entityId: 'camera.front_door',
      rawPath: homeAssistantUrlFixtures.relativeCameraSnapshot,
    });

    expect(resource.url).toBe(`/__navet_ha_proxy__${signedSnapshotPath}`);
    expect(resource.authStrategy).toBe('same_origin');
  });

  it('keeps standalone OAuth signed camera HLS streams on the same-origin proxy', async () => {
    window.__NAVET_CONFIG__ = { hassUrl: oauthSessionFixture.haBaseUrl };
    resetRuntimeContextForTests();
    const signedHlsPath = '/api/hls/camera.front_door/master.m3u8?authSig=signed-stream-token';
    const resolver = new HomeAssistantResourceResolver(
      () => ({
        providerId: 'home_assistant',
        runtime: oauthSessionFixture.runtime,
        authMode: oauthSessionFixture.authMode,
        haBaseUrl: oauthSessionFixture.haBaseUrl,
        hassUrl: oauthSessionFixture.hassUrl,
      }),
      async (path) => (path === homeAssistantUrlFixtures.relativeHlsStream ? signedHlsPath : null)
    );

    const resource = await resolver.resolve({
      kind: 'camera_stream',
      entityId: 'camera.front_door',
      stream: 'hls',
      rawPath: homeAssistantUrlFixtures.relativeHlsStream,
    });

    expect(resource.url).toBe(`/__navet_ha_proxy__${signedHlsPath}`);
    expect(resource.authStrategy).toBe('same_origin');
  });

  it('does not sign standalone OAuth media artwork that already uses the same-origin proxy', async () => {
    window.__NAVET_CONFIG__ = { hassUrl: oauthSessionFixture.haBaseUrl };
    resetRuntimeContextForTests();
    const signPath = async () => '/api/media_player_proxy/media_player.living_room?authSig=signed';
    const resolver = new HomeAssistantResourceResolver(
      () => ({
        providerId: 'home_assistant',
        runtime: oauthSessionFixture.runtime,
        authMode: oauthSessionFixture.authMode,
        haBaseUrl: oauthSessionFixture.haBaseUrl,
        hassUrl: oauthSessionFixture.hassUrl,
      }),
      signPath
    );

    const resource = await resolver.resolve({
      kind: 'media_artwork',
      entityId: 'media_player.living_room',
      rawPath: homeAssistantUrlFixtures.relativeMediaArtwork,
    });

    expect(resource.url).toBe(
      `/__navet_ha_proxy__${homeAssistantUrlFixtures.relativeMediaArtwork}`
    );
    expect(resource.authStrategy).toBe('same_origin');
  });

  // Rewrite: Ingress uses the current HA user's resources, never the add-on token.
  it('resolves absolute Home Assistant URLs on the host origin in Ingress', () => {
    const base = document.createElement('base');
    base.href = `${window.location.origin}${homeAssistantUrlFixtures.ingressBasePath}/`;
    document.head.append(base);
    window.__NAVET_CONFIG__ = { hassUrl: oauthSessionFixture.haBaseUrl };
    resetRuntimeContextForTests();
    const resolver = new HomeAssistantResourceResolver(() => null);

    const resource = resolver.resolveSync({
      kind: 'absolute_url',
      url: homeAssistantUrlFixtures.absoluteHaMediaArtwork,
    });

    expect(resource.url).toBe(homeAssistantUrlFixtures.relativeMediaArtwork);
    expect(resource.authStrategy).toBe('panel_bridge');
  });

  // Rewrite: persisted Ingress proxy URLs must migrate to native HA paths.
  it('strips stale ingress-prefixed proxy paths from Home Assistant camera snapshots', () => {
    const base = document.createElement('base');
    base.href = `${window.location.origin}${homeAssistantUrlFixtures.ingressBasePath}/`;
    document.head.append(base);
    window.history.replaceState({}, '', `${homeAssistantUrlFixtures.ingressBasePath}/security`);
    window.__NAVET_CONFIG__ = { hassUrl: oauthSessionFixture.haBaseUrl };
    resetRuntimeContextForTests();
    const resolver = new HomeAssistantResourceResolver(() => null);

    const ingressSnapshotUrl = `${homeAssistantUrlFixtures.ingressBasePath}${homeAssistantUrlFixtures.staleProxyCameraSnapshot}`;
    const resource = resolver.resolveSync({
      kind: 'camera_snapshot',
      entityId: 'camera.front_door',
      rawPath: ingressSnapshotUrl,
    });

    expect(resource.url).toBe(homeAssistantUrlFixtures.relativeCameraSnapshot);
    expect(resource.authStrategy).toBe('panel_bridge');
  });

  it.each([
    homeAssistantUrlFixtures.relativeMediaArtwork,
    homeAssistantUrlFixtures.relativeCameraSnapshot,
    homeAssistantUrlFixtures.relativeImageServe,
    homeAssistantUrlFixtures.relativeHlsStream,
    homeAssistantUrlFixtures.absoluteHaMediaArtwork,
    'http://homeassistant:8123/api/media_player_proxy/media_player.living_room',
    `${homeAssistantUrlFixtures.ingressBasePath}${homeAssistantUrlFixtures.staleProxyCameraSnapshot}`,
  ])('signs Ingress resources through the current user connection: %s', async (url) => {
    window.__NAVET_CONFIG__ = { runtime: 'ha-ingress', hassUrl: oauthSessionFixture.haBaseUrl };
    resetRuntimeContextForTests();
    const signPath = vi.fn(async (path: string) => `${path}?authSig=current-user-signature`);
    const resolver = new HomeAssistantResourceResolver(() => null, signPath);

    const resource = await resolver.resolve({ kind: 'absolute_url', url });

    expect(signPath).toHaveBeenCalledOnce();
    const path = signPath.mock.calls[0]?.[0];
    expect(path).toMatch(/^\/api\/(media_player_proxy|camera_proxy|image\/serve|hls)\//);
    expect(resource.url).toBe(`${path}?authSig=current-user-signature`);
    expect(resource.authStrategy).toBe('none');
    expect(signPath).toHaveBeenCalledWith(path, 30);
  });

  it('preserves signed Ingress resource queries without signing them again', async () => {
    window.__NAVET_CONFIG__ = { runtime: 'ha-ingress' };
    resetRuntimeContextForTests();
    const signPath = vi.fn();
    const resolver = new HomeAssistantResourceResolver(() => null, signPath);

    const resource = await resolver.resolve({
      kind: 'absolute_url',
      url: `${window.location.origin}${homeAssistantUrlFixtures.signedImageServe}`,
    });

    expect(resource.url).toBe(homeAssistantUrlFixtures.signedImageServe);
    expect(resource.authStrategy).toBe('none');
    expect(signPath).not.toHaveBeenCalled();
  });

  it('keeps external Ingress artwork outside Home Assistant signing', async () => {
    window.__NAVET_CONFIG__ = { runtime: 'ha-ingress' };
    resetRuntimeContextForTests();
    const signPath = vi.fn();
    const resolver = new HomeAssistantResourceResolver(() => null, signPath);
    const resource = await resolver.resolve({
      kind: 'absolute_url',
      url: homeAssistantUrlFixtures.crossOriginExternalImage,
    });
    expect(resource.url).toBe(homeAssistantUrlFixtures.crossOriginExternalImage);
    expect(signPath).not.toHaveBeenCalled();
  });

  it('never falls back to the add-on proxy when the current user cannot sign a resource', async () => {
    window.__NAVET_CONFIG__ = { runtime: 'ha-ingress' };
    resetRuntimeContextForTests();
    const resolver = new HomeAssistantResourceResolver(
      () => null,
      async () => {
        throw new Error('unauthorized');
      }
    );
    const resource = await resolver.resolve({
      kind: 'absolute_url',
      url: homeAssistantUrlFixtures.relativeCameraSnapshot,
    });
    expect(resource.url).toBe(homeAssistantUrlFixtures.relativeCameraSnapshot);
    expect(resource.authStrategy).toBe('panel_bridge');
  });

  it('strips stale proxy paths in panel mode and keeps same-origin HA access', () => {
    window.__NAVET_PANEL__ = true;
    resetRuntimeContextForTests();
    const resolver = new HomeAssistantResourceResolver(() => null);

    const resource = resolver.resolveSync({
      kind: 'absolute_url',
      url: `${window.location.origin}${homeAssistantUrlFixtures.staleProxyCameraSnapshot}`,
    });

    expect(resource.url).toBe(homeAssistantUrlFixtures.relativeCameraSnapshot);
    expect(resource.authStrategy).toBe('panel_bridge');
  });

  it('passes external URLs through unchanged when they are safe', () => {
    const resolver = new HomeAssistantResourceResolver(() => null);

    const resource = resolver.resolveSync({
      kind: 'absolute_url',
      url: homeAssistantUrlFixtures.crossOriginExternalImage,
    });

    expect(resource.url).toBe(homeAssistantUrlFixtures.crossOriginExternalImage);
    expect(resource.authStrategy).toBe('none');
  });

  it('does not treat an external CDN image path as a Home Assistant image path', () => {
    window.__NAVET_CONFIG__ = { hassUrl: oauthSessionFixture.haBaseUrl };
    resetRuntimeContextForTests();
    const resolver = new HomeAssistantResourceResolver(() => null);
    const artworkUrl =
      'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/27/8d/78/cover.jpg/1000x1000bb.jpg';

    const resource = resolver.resolveSync({
      kind: 'absolute_url',
      url: artworkUrl,
    });

    expect(resource.url).toBe(artworkUrl);
    expect(resource.authStrategy).toBe('none');
  });

  it('rejects unsafe URL schemes', () => {
    const resolver = new HomeAssistantResourceResolver(() => null);

    const resource = resolver.resolveSync({
      kind: 'absolute_url',
      url: homeAssistantUrlFixtures.unsafeJavascriptUrl,
    });

    expect(resource.kind).toBe('unavailable');
    expect(resource.url).toBeUndefined();
  });

  it('rejects root-relative image paths that the browser would resolve off origin', () => {
    const resolver = new HomeAssistantResourceResolver(() => null);

    const resource = resolver.resolveSync({
      kind: 'absolute_url',
      url: '/\\evil.example/pixel',
    });

    expect(resource.kind).toBe('unavailable');
    expect(resource.url).toBeUndefined();
  });

  it('rejects malformed relative paths before routing through the Home Assistant proxy', () => {
    const resolver = new HomeAssistantResourceResolver(() => null);

    const resource = resolver.resolveSync({
      kind: 'absolute_url',
      url: '/__navet_ha_proxy__\\..\\private',
    });

    expect(resource.kind).toBe('unavailable');
    expect(resource.url).toBeUndefined();
  });

  it('reuses cached resources for semantically identical refs and options', () => {
    window.__NAVET_CONFIG__ = { hassUrl: oauthSessionFixture.haBaseUrl };
    resetRuntimeContextForTests();
    const resolver = new HomeAssistantResourceResolver(() => null);

    const first = resolver.resolveSync(
      {
        kind: 'media_artwork',
        entityId: 'media_player.living_room',
        rawPath: homeAssistantUrlFixtures.relativeMediaArtwork,
      },
      {
        preferProxy: true,
      }
    );
    const second = resolver.resolveSync(
      {
        kind: 'media_artwork',
        entityId: 'media_player.living_room',
        rawPath: homeAssistantUrlFixtures.relativeMediaArtwork,
      },
      {
        preferProxy: true,
      }
    );

    expect(second).toBe(first);
  });
});
