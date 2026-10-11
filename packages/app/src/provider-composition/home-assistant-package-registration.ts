import type { NavetProviderSessionInput } from '@navet/core/provider-contract';
import { createHomeAssistantProviderPackageRegistration } from '@navet/provider-homeassistant';
import type {
  HomeAssistantAreaRegistryEntry,
  HomeAssistantCategoryRegistryEntry,
  HomeAssistantDeviceRegistryEntry,
  HomeAssistantEntityRegistryEntry,
} from '../services/home-assistant.service';
import { homeAssistantService } from '../services/home-assistant.service';
import { homeAssistantStore } from '../stores/home-assistant-store';
import type { IntegrationProviderId } from '../types/provider';
import { resolveHomeAssistantProxyUrl } from '../utils/home-assistant-url';

export function createHomeAssistantAppProviderPackageRegistration({
  getProviderSession,
}: {
  getProviderSession: (
    providerId: IntegrationProviderId
  ) => NavetProviderSessionInput | null | undefined;
}) {
  return createHomeAssistantProviderPackageRegistration({
    dependencies: {
      homeAssistantService: {
        callApi: (method, path, parameters) =>
          homeAssistantService.callApi(method, path, parameters),
        callService: async (domain, service, serviceData, target) =>
          homeAssistantService.callService(domain, service, serviceData, target as never),
        signPath: (path, expiresSeconds) => homeAssistantService.signPath(path, expiresSeconds),
        getCameraStreamUrl: (entityId, format) =>
          homeAssistantService.getCameraStreamUrl(entityId, format),
        getCameraStreamPaths: async (entityId) => {
          const paths = await homeAssistantService.getCameraStreamPaths(entityId);
          return {
            ...(paths.hls_path ? { hls_path: paths.hls_path } : {}),
            ...(paths.mjpeg_path ? { mjpeg_path: paths.mjpeg_path } : {}),
          };
        },
        addListener: (event, listener) => homeAssistantService.addListener(event, listener),
        isConnected: () => homeAssistantService.isConnected(),
        getPanelHass: () => homeAssistantService.getPanelHass(),
        getConnection: () => homeAssistantService.getConnection(),
        sendWebSocketBinary: (data) => homeAssistantService.sendWebSocketBinary(data),
        getEntities: () => homeAssistantService.getEntities(),
        getEntityRegistry: () => homeAssistantService.getEntityRegistry(),
        getConfig: () => homeAssistantService.getConfig(),
        updateLight: (entityId, options) => homeAssistantService.updateLight(entityId, options),
        playMedia: (entityId, media) => homeAssistantService.playMedia(entityId, media),
        browseMediaPlayer: (entityId, media) =>
          homeAssistantService.browseMediaPlayer(entityId, media),
        searchMediaPlayer: (entityId, query, media) =>
          homeAssistantService.searchMediaPlayer(entityId, query, media),
        selectMediaPlayerSource: (entityId, source) =>
          homeAssistantService.selectMediaPlayerSource(entityId, source),
        selectMediaPlayerSoundMode: (entityId, soundMode) =>
          homeAssistantService.selectMediaPlayerSoundMode(entityId, soundMode),
        seekMediaPlayer: (entityId, seekPosition) =>
          homeAssistantService.seekMediaPlayer(entityId, seekPosition),
        clearMediaPlayerPlaylist: (entityId) =>
          homeAssistantService.clearMediaPlayerPlaylist(entityId),
        updateMediaPlayerPower: (entityId, state) =>
          homeAssistantService.updateMediaPlayerPower(entityId, state),
        sendRemoteCommand: (entityId, command) =>
          homeAssistantService.sendRemoteCommand(entityId, command),
        browseMediaSource: (mediaContentId) =>
          homeAssistantService.browseMediaSource(mediaContentId),
        resolveMediaSource: (mediaContentId) =>
          homeAssistantService.resolveMediaSource(mediaContentId),
        getAutomationConfig: (entityId) => homeAssistantService.getAutomationConfig(entityId),
        getCameraCapabilities: async (entityId) =>
          (await homeAssistantService.getCameraCapabilities(entityId)) as Record<string, unknown>,
        enableCameraMotionDetection: (entityId) =>
          homeAssistantService.enableCameraMotionDetection(entityId),
        disableCameraMotionDetection: (entityId) =>
          homeAssistantService.disableCameraMotionDetection(entityId),
        getWebRtcClientConfiguration: async (entityId) =>
          (await homeAssistantService.getWebRtcClientConfiguration(entityId)) as unknown as Record<
            string,
            unknown
          >,
        subscribeCameraWebRtcOffer: async (entityId, offer, listener) =>
          homeAssistantService.subscribeCameraWebRtcOffer(entityId, offer, (event) => {
            const sessionId =
              'session_id' in event && typeof event.session_id === 'string'
                ? event.session_id
                : undefined;
            const hasSessionId = sessionId !== undefined;
            const hasAnswer = 'answer' in event && typeof event.answer === 'string';

            if (hasSessionId && !hasAnswer) {
              listener({ session_id: sessionId });
            }
            if (hasAnswer) {
              if (hasSessionId) {
                listener({ session_id: sessionId });
              }
              listener(
                hasSessionId
                  ? { answer: event.answer, session_id: sessionId }
                  : { answer: event.answer }
              );
              return;
            }
            if ('candidate' in event && typeof event.candidate === 'object' && event.candidate) {
              listener({ candidate: event.candidate });
              return;
            }
            if (
              'code' in event &&
              typeof event.code === 'string' &&
              'message' in event &&
              typeof event.message === 'string'
            ) {
              listener({ code: event.code, message: event.message });
            }
          }),
        addCameraWebRtcCandidate: (entityId, sessionId, candidate) =>
          homeAssistantService.addCameraWebRtcCandidate(entityId, sessionId, candidate),
        createArea: (name) => homeAssistantService.createArea(name),
        updateAreaName: (areaId, name) => homeAssistantService.updateAreaName(areaId, name),
        updateEntityArea: (entityId, areaId) =>
          homeAssistantService.updateEntityArea(entityId, areaId),
        updateEntityName: (entityId, name) =>
          homeAssistantService.updateEntityName(entityId, name ?? ''),
        deleteArea: (areaId) => homeAssistantService.deleteArea(areaId),
      },
      homeAssistantStore: {
        getState: () => {
          const state = homeAssistantStore.getState();
          return {
            connected: state.connected,
            user: state.user,
            connecting: state.connecting,
            reconnecting: state.reconnecting,
            error: state.error,
            config: state.config,
            entities: state.entities,
            areas: state.areas as HomeAssistantAreaRegistryEntry[],
            deviceRegistry: state.deviceRegistry as HomeAssistantDeviceRegistryEntry[],
            entityRegistry: state.entityRegistry as HomeAssistantEntityRegistryEntry[],
            registriesHydrated: state.registriesHydrated,
            automationCategories:
              state.automationCategories as HomeAssistantCategoryRegistryEntry[],
            connect: async (session) => {
              await state.connect(session as never);
            },
            disconnect: async () => {
              state.disconnect();
            },
            syncPanelHass: (bridge) => {
              state.syncPanelHass(bridge as never);
            },
          };
        },
        subscribe: (listener) => homeAssistantStore.subscribe(listener),
      },
      mediaArtworkService: {
        resolveArtwork: async (entityId, attrs, fallbackPicture) =>
          (
            await import('../infrastructure/home-assistant/home-assistant-shared-infrastructure')
          ).mediaArtworkService.resolveArtwork(entityId, attrs ?? {}, fallbackPicture),
      },
      resolveProxyUrl: resolveHomeAssistantProxyUrl,
      cameraMediaService: {
        getPlaybackPlan: async (request) =>
          (
            await import('../infrastructure/home-assistant/home-assistant-camera-infrastructure')
          ).cameraMediaService.getPlaybackPlan(request as never),
      },
      homeAssistantResourceResolver: {
        resolve: async (request) =>
          (
            await import('../infrastructure/home-assistant/home-assistant-shared-infrastructure')
          ).homeAssistantResourceResolver.resolve(request),
      },
    },
    getSession: () => getProviderSession('home_assistant'),
  });
}
