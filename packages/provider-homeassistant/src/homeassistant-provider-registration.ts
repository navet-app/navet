import type { NavetProviderSessionInput } from '@navet/core/provider-contract';
import type {
  ProviderContractRegistration,
  ProviderPackageRegistration,
} from '@navet/core/provider-runtime-types';
import {
  createHomeAssistantContractAdapter,
  createHomeAssistantProviderContract,
} from './homeassistant-adapter';
import { createHomeAssistantRuntimeRegistration } from './homeassistant-runtime-registration';
import {
  configureHomeAssistantServiceBridge,
  type HomeAssistantServiceBridge,
  type HomeAssistantStoreState,
} from './homeassistant-service-bridge';

interface HomeAssistantBrowseNode {
  title?: string;
  media_title?: string;
  media_class?: string;
  media_content_id?: string;
  media_content_type?: string;
  children?: HomeAssistantBrowseNode[];
  can_expand?: boolean;
  can_play?: boolean;
  thumbnail?: string | null;
  media_image_url?: string | null;
  artist?: string;
  media_artist?: string;
  album?: string;
  media_album_name?: string;
}

export function normalizeHomeAssistantBrowseLabel(result: HomeAssistantBrowseNode) {
  const title = result.media_title ?? result.title ?? '';
  const artist = result.artist ?? result.media_artist;
  const mediaClass = result.media_class?.trim().toLowerCase();
  const mediaContentType = result.media_content_type?.trim().toLowerCase();
  const usesCombinedMusicLabel =
    mediaClass === 'track' ||
    mediaClass === 'album' ||
    mediaContentType === 'track' ||
    mediaContentType === 'album';

  if (artist || !usesCombinedMusicLabel) {
    return { title, artist };
  }

  const separatorIndex = title.indexOf(' - ');
  if (separatorIndex <= 0 || separatorIndex >= title.length - 3) {
    return { title, artist };
  }

  return {
    title: title.slice(separatorIndex + 3).trim(),
    artist: title.slice(0, separatorIndex).trim(),
  };
}

function mapHomeAssistantBrowseResult(result: HomeAssistantBrowseNode): {
  title: string;
  mediaClass?: string;
  mediaContentId?: string;
  mediaContentType?: string;
  children?: ReturnType<typeof mapHomeAssistantBrowseResult>[];
  canExpand?: boolean;
  canPlay?: boolean;
  thumbnail?: string | null;
  artist?: string;
  album?: string;
} {
  const label = normalizeHomeAssistantBrowseLabel(result);

  return {
    title: label.title,
    mediaClass: result.media_class,
    mediaContentId: result.media_content_id,
    mediaContentType: result.media_content_type,
    children: result.children?.map(mapHomeAssistantBrowseResult),
    canExpand: result.can_expand,
    canPlay: result.can_play,
    thumbnail: result.thumbnail ?? result.media_image_url ?? null,
    artist: label.artist,
    album: result.album ?? result.media_album_name,
  };
}

function toHomeAssistantTarget(target?: {
  entityId?: string | string[];
  areaId?: string | string[];
  deviceId?: string | string[];
}) {
  if (!target) {
    return undefined;
  }

  return {
    ...(target.entityId !== undefined ? { entity_id: target.entityId } : {}),
    ...(target.areaId !== undefined ? { area_id: target.areaId } : {}),
    ...(target.deviceId !== undefined ? { device_id: target.deviceId } : {}),
  };
}

export interface HomeAssistantProviderDependencies {
  homeAssistantService: {
    callApi: HomeAssistantServiceBridge['callApi'];
    callService: (
      domain: string,
      service: string,
      serviceData?: Record<string, unknown>,
      target?: Record<string, unknown>
    ) => Promise<void>;
    signPath: (path: string, expiresSeconds?: number) => Promise<{ path: string }>;
    getCameraStreamUrl: HomeAssistantServiceBridge['getCameraStreamUrl'];
    getCameraStreamPaths: (entityId: string) => Promise<{ hls_path?: string; mjpeg_path?: string }>;
    addListener: HomeAssistantServiceBridge['addListener'];
    isConnected: HomeAssistantServiceBridge['isConnected'];
    getPanelHass: HomeAssistantServiceBridge['getPanelHass'];
    getConnection: HomeAssistantServiceBridge['getConnection'];
    sendWebSocketBinary: HomeAssistantServiceBridge['sendWebSocketBinary'];
    getEntities: HomeAssistantServiceBridge['getEntities'];
    getEntityRegistry: HomeAssistantServiceBridge['getEntityRegistry'];
    getConfig: HomeAssistantServiceBridge['getConfig'];
    updateLight: HomeAssistantServiceBridge['updateLight'];
    playMedia: HomeAssistantServiceBridge['playMedia'];
    browseMediaPlayer: (
      entityId: string,
      media?: { mediaContentId?: string; mediaContentType?: string }
    ) => Promise<HomeAssistantBrowseNode>;
    searchMediaPlayer: (
      entityId: string,
      query: string,
      media?: { mediaContentId?: string; mediaContentType?: string }
    ) => Promise<HomeAssistantBrowseNode>;
    selectMediaPlayerSource: HomeAssistantServiceBridge['selectMediaPlayerSource'];
    selectMediaPlayerSoundMode: HomeAssistantServiceBridge['selectMediaPlayerSoundMode'];
    seekMediaPlayer: HomeAssistantServiceBridge['seekMediaPlayer'];
    clearMediaPlayerPlaylist: HomeAssistantServiceBridge['clearMediaPlayerPlaylist'];
    updateMediaPlayerPower: HomeAssistantServiceBridge['updateMediaPlayerPower'];
    sendRemoteCommand: HomeAssistantServiceBridge['sendRemoteCommand'];
    browseMediaSource: (
      mediaContentId: string
    ) => ReturnType<HomeAssistantServiceBridge['browseMediaSource']>;
    resolveMediaSource: HomeAssistantServiceBridge['resolveMediaSource'];
    getAutomationConfig: HomeAssistantServiceBridge['getAutomationConfig'];
    getCameraCapabilities: HomeAssistantServiceBridge['getCameraCapabilities'];
    enableCameraMotionDetection: HomeAssistantServiceBridge['enableCameraMotionDetection'];
    disableCameraMotionDetection: HomeAssistantServiceBridge['disableCameraMotionDetection'];
    getWebRtcClientConfiguration: HomeAssistantServiceBridge['getWebRtcClientConfiguration'];
    subscribeCameraWebRtcOffer: HomeAssistantServiceBridge['subscribeCameraWebRtcOffer'];
    addCameraWebRtcCandidate: HomeAssistantServiceBridge['addCameraWebRtcCandidate'];
    createArea: HomeAssistantServiceBridge['createArea'];
    updateAreaName: HomeAssistantServiceBridge['updateAreaName'];
    updateEntityArea: HomeAssistantServiceBridge['updateEntityArea'];
    updateEntityName: HomeAssistantServiceBridge['updateEntityName'];
    deleteArea: HomeAssistantServiceBridge['deleteArea'];
  };
  homeAssistantStore: {
    getState: () => HomeAssistantStoreState;
    subscribe: (listener: () => void) => () => void;
  };
  mediaArtworkService: {
    resolveArtwork: HomeAssistantServiceBridge['resolveArtwork'];
  };
  resolveProxyUrl: HomeAssistantServiceBridge['resolveProxyUrl'];
  cameraMediaService: {
    getPlaybackPlan: (request: unknown) => Promise<unknown>;
  };
  homeAssistantResourceResolver: {
    resolve: (
      request:
        | {
            kind: 'camera_stream';
            entityId: string;
            stream: 'hls' | 'web_rtc';
            rawPath?: string;
          }
        | { kind: 'absolute_url'; url: string }
    ) => ReturnType<HomeAssistantServiceBridge['resolveCameraStreamResource']>;
  };
}

function createHomeAssistantServiceBridgeFromDependencies(
  dependencies: HomeAssistantProviderDependencies
): HomeAssistantServiceBridge {
  return {
    callApi: (method, path, parameters) =>
      dependencies.homeAssistantService.callApi(method, path, parameters),
    callService: (domain, service, serviceData, target) =>
      dependencies.homeAssistantService.callService(
        domain,
        service,
        serviceData,
        toHomeAssistantTarget(target)
      ),
    signPath: (path, expiresSeconds) =>
      dependencies.homeAssistantService.signPath(path, expiresSeconds),
    getCameraStreamUrl: (entityId, format) =>
      dependencies.homeAssistantService.getCameraStreamUrl(entityId, format),
    getCameraStreamPaths: async (entityId) => {
      const paths = await dependencies.homeAssistantService.getCameraStreamPaths(entityId);
      return {
        ...(paths.hls_path ? { hls: paths.hls_path } : {}),
        ...(paths.mjpeg_path ? { mjpeg: paths.mjpeg_path } : {}),
      };
    },
    addListener: (event, listener) =>
      dependencies.homeAssistantService.addListener(event, listener),
    isConnected: () => dependencies.homeAssistantService.isConnected(),
    getPanelHass: () => dependencies.homeAssistantService.getPanelHass(),
    getConnection: () => dependencies.homeAssistantService.getConnection(),
    sendWebSocketBinary: (data) => dependencies.homeAssistantService.sendWebSocketBinary(data),
    getEntities: () => dependencies.homeAssistantService.getEntities(),
    getEntityRegistry: () => dependencies.homeAssistantService.getEntityRegistry(),
    getConfig: () => dependencies.homeAssistantService.getConfig(),
    updateLight: (entityId, options) =>
      dependencies.homeAssistantService.updateLight(entityId, options),
    playMedia: (entityId, media) => dependencies.homeAssistantService.playMedia(entityId, media),
    browseMediaPlayer: (entityId, media) =>
      dependencies.homeAssistantService
        .browseMediaPlayer(entityId, media)
        .then((result) => mapHomeAssistantBrowseResult(result)),
    searchMediaPlayer: (entityId, query, media) =>
      dependencies.homeAssistantService
        .searchMediaPlayer(entityId, query, media)
        .then((result) => mapHomeAssistantBrowseResult(result)),
    selectMediaPlayerSource: (entityId, source) =>
      dependencies.homeAssistantService.selectMediaPlayerSource(entityId, source),
    selectMediaPlayerSoundMode: (entityId, soundMode) =>
      dependencies.homeAssistantService.selectMediaPlayerSoundMode(entityId, soundMode),
    seekMediaPlayer: (entityId, seekPosition) =>
      dependencies.homeAssistantService.seekMediaPlayer(entityId, seekPosition),
    clearMediaPlayerPlaylist: (entityId) =>
      dependencies.homeAssistantService.clearMediaPlayerPlaylist(entityId),
    updateMediaPlayerPower: (entityId, state) =>
      dependencies.homeAssistantService.updateMediaPlayerPower(entityId, state),
    sendRemoteCommand: (entityId, command) =>
      dependencies.homeAssistantService.sendRemoteCommand(entityId, command),
    browseMediaSource: (mediaContentId) =>
      dependencies.homeAssistantService.browseMediaSource(mediaContentId ?? ''),
    resolveMediaSource: (mediaContentId) =>
      dependencies.homeAssistantService.resolveMediaSource(mediaContentId),
    getAutomationConfig: (entityId) =>
      dependencies.homeAssistantService.getAutomationConfig(entityId),
    getCameraCapabilities: (entityId) =>
      dependencies.homeAssistantService.getCameraCapabilities(entityId),
    enableCameraMotionDetection: (entityId) =>
      dependencies.homeAssistantService.enableCameraMotionDetection(entityId),
    disableCameraMotionDetection: (entityId) =>
      dependencies.homeAssistantService.disableCameraMotionDetection(entityId),
    getWebRtcClientConfiguration: (entityId) =>
      dependencies.homeAssistantService.getWebRtcClientConfiguration(entityId),
    subscribeCameraWebRtcOffer: (entityId, offer, listener) =>
      dependencies.homeAssistantService.subscribeCameraWebRtcOffer(entityId, offer, listener),
    addCameraWebRtcCandidate: (entityId, sessionId, candidate) =>
      dependencies.homeAssistantService.addCameraWebRtcCandidate(entityId, sessionId, candidate),
    createArea: (name) => dependencies.homeAssistantService.createArea(name),
    updateAreaName: (areaId, name) =>
      dependencies.homeAssistantService.updateAreaName(areaId, name),
    updateEntityArea: (entityId, areaId) =>
      dependencies.homeAssistantService.updateEntityArea(entityId, areaId),
    updateEntityName: (entityId, name) =>
      dependencies.homeAssistantService.updateEntityName(entityId, name ?? ''),
    deleteArea: (areaId) => dependencies.homeAssistantService.deleteArea(areaId),
    resolveArtwork: (entityId, attrs, fallbackPicture) =>
      dependencies.mediaArtworkService.resolveArtwork(entityId, attrs, fallbackPicture),
    resolveProxyUrl: (resourceUrl, hassUrl, options) =>
      dependencies.resolveProxyUrl(resourceUrl, hassUrl, options),
    resolveDisplayResource: (url) =>
      dependencies.homeAssistantResourceResolver.resolve({ kind: 'absolute_url', url }),
    getCameraPlaybackPlan: (request) => dependencies.cameraMediaService.getPlaybackPlan(request),
    resolveCameraStreamResource: (entityId, stream, rawPath) =>
      dependencies.homeAssistantResourceResolver.resolve({
        kind: 'camera_stream',
        entityId,
        stream,
        rawPath,
      }),
    getStoreState: () => dependencies.homeAssistantStore.getState(),
    subscribeStore: (listener) => dependencies.homeAssistantStore.subscribe(listener),
  };
}

export interface CreateHomeAssistantProviderPackageRegistrationOptions {
  bridge?: HomeAssistantServiceBridge;
  dependencies?: HomeAssistantProviderDependencies;
  getSession?: () => NavetProviderSessionInput | null | undefined;
}

export function createHomeAssistantProviderContractRegistration(
  options: CreateHomeAssistantProviderPackageRegistrationOptions = {}
): ProviderContractRegistration {
  if (options.dependencies) {
    configureHomeAssistantServiceBridge(
      createHomeAssistantServiceBridgeFromDependencies(options.dependencies)
    );
  } else if (options.bridge) {
    configureHomeAssistantServiceBridge(options.bridge);
  }

  const contract = createHomeAssistantProviderContract();

  return {
    contract,
    providerContractAdapter: createHomeAssistantContractAdapter(contract, {
      getSession: options.getSession,
    }),
  };
}

export function createHomeAssistantProviderPackageRegistration(
  options: CreateHomeAssistantProviderPackageRegistrationOptions = {}
): ProviderPackageRegistration {
  const contractRegistration = createHomeAssistantProviderContractRegistration(options);

  return {
    ...contractRegistration,
    runtimeRegistration: createHomeAssistantRuntimeRegistration(contractRegistration),
  };
}
