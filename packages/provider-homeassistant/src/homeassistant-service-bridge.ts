import type { IntegrationServiceTarget } from '@navet/core/integration-service-target';
import type { ResolvedPlatformResource } from '@navet/core/provider-contract';
import type {
  PlatformCameraStream,
  PlatformCameraStreamType,
  PlatformMediaBrowseResult,
  PlatformMediaPlayRequest,
  PlatformMessageClient,
  PlatformRemoteCommand,
} from '@navet/core/provider-feature-models';
import type { ProviderLightUpdateOptions } from '@navet/core/provider-feature-services';
import type { HassConfig, HassEntities } from 'home-assistant-js-websocket';

export interface HomeAssistantAreaRegistryEntry {
  area_id: string;
  name: string;
}

export interface HomeAssistantDeviceRegistryEntry {
  id: string;
  area_id?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  name?: string | null;
  name_by_user?: string | null;
}

export interface HomeAssistantEntityRegistryEntry {
  entity_id: string;
  config_entry_id?: string | null;
  area_id?: string | null;
  device_id?: string | null;
  categories?: Record<string, string>;
  name?: string | null;
  original_name?: string | null;
  platform?: string | null;
  entity_category?: 'config' | 'diagnostic' | null;
  options?: Record<string, Record<string, unknown>>;
}

export interface HomeAssistantCategoryRegistryEntry {
  category_id: string;
  name: string;
  icon?: string | null;
}

export interface HomeAssistantStoreState {
  user?: { is_admin?: boolean } | null;
  connected: boolean;
  connecting: boolean;
  reconnecting: boolean;
  error: string | null;
  config: HassConfig | null;
  entities: HassEntities | null;
  areas: HomeAssistantAreaRegistryEntry[];
  deviceRegistry: HomeAssistantDeviceRegistryEntry[];
  entityRegistry: HomeAssistantEntityRegistryEntry[];
  registriesHydrated: boolean;
  automationCategories?: HomeAssistantCategoryRegistryEntry[];
  connect(session: unknown): Promise<void>;
  disconnect(): Promise<void>;
  syncPanelHass(bridge: unknown): void;
}

export type HomeAssistantPanelHass = object;

type HomeAssistantWebRtcBridgeEvent =
  | { answer: string; session_id: string }
  | { answer: string }
  | { session_id: string }
  | { candidate: RTCIceCandidateInit }
  | { code: string; message: string };

type HomeAssistantMediaBrowseRequest = {
  mediaContentId?: string;
  mediaContentType?: string;
};

export interface HomeAssistantServiceBridge {
  callApi<T = unknown>(
    method: string,
    path: string,
    parameters?: Record<string, unknown>
  ): Promise<T>;
  callService(
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>,
    target?: IntegrationServiceTarget
  ): Promise<void>;
  signPath(path: string, expiresSeconds?: number): Promise<{ path: string }>;
  getCameraStreamUrl(entityId: string, format: 'hls' | 'web_rtc'): Promise<PlatformCameraStream>;
  getCameraStreamPaths(
    entityId: string
  ): Promise<Partial<Record<PlatformCameraStreamType, string>>>;
  addListener(
    event: 'entities' | 'registries' | 'connection' | 'config',
    listener: () => void
  ): () => void;
  isConnected(): boolean;
  getPanelHass(): HomeAssistantPanelHass | null;
  getConnection(): PlatformMessageClient | null;
  sendWebSocketBinary(data: Uint8Array): void;
  getEntities(): HassEntities | null;
  getEntityRegistry(): HomeAssistantEntityRegistryEntry[];
  getConfig(): HassConfig | null;
  updateLight(entityId: string, options: ProviderLightUpdateOptions): Promise<void>;
  playMedia(entityId: string, media: PlatformMediaPlayRequest): Promise<void>;
  browseMediaPlayer(
    entityId: string,
    media?: HomeAssistantMediaBrowseRequest
  ): Promise<PlatformMediaBrowseResult>;
  searchMediaPlayer(
    entityId: string,
    query: string,
    media?: HomeAssistantMediaBrowseRequest
  ): Promise<PlatformMediaBrowseResult>;
  selectMediaPlayerSource(entityId: string, source: string): Promise<void>;
  selectMediaPlayerSoundMode(entityId: string, soundMode: string): Promise<void>;
  seekMediaPlayer(entityId: string, seekPosition: number): Promise<void>;
  clearMediaPlayerPlaylist(entityId: string): Promise<void>;
  updateMediaPlayerPower(entityId: string, state: 'on' | 'off'): Promise<void>;
  sendRemoteCommand(entityId: string, command: PlatformRemoteCommand): Promise<void>;
  browseMediaSource(mediaContentId?: string): Promise<PlatformMediaBrowseResult>;
  resolveMediaSource(mediaContentId: string): Promise<{ url: string; mime_type?: string }>;
  getAutomationConfig(entityId: string): Promise<{ config: Record<string, unknown> }>;
  getCameraCapabilities(entityId: string): Promise<Record<string, unknown>>;
  enableCameraMotionDetection(entityId: string): Promise<void>;
  disableCameraMotionDetection(entityId: string): Promise<void>;
  getWebRtcClientConfiguration(entityId: string): Promise<Record<string, unknown>>;
  subscribeCameraWebRtcOffer(
    entityId: string,
    offerSdp: string,
    listener: (event: HomeAssistantWebRtcBridgeEvent) => void
  ): Promise<() => void>;
  addCameraWebRtcCandidate(
    entityId: string,
    sessionId: string,
    candidate: RTCIceCandidateInit
  ): Promise<void>;
  createArea(name: string): Promise<{ area_id: string; name: string }>;
  updateAreaName(areaId: string, name: string): Promise<{ area_id: string; name: string }>;
  updateEntityArea(entityId: string, areaId: string | null): Promise<void>;
  updateEntityName(entityId: string, name: string | null): Promise<void>;
  deleteArea(areaId: string): Promise<void>;
  resolveArtwork(
    entityId: string,
    attrs?: Record<string, unknown>,
    fallbackPicture?: string
  ): Promise<ResolvedPlatformResource>;
  resolveProxyUrl(
    resourceUrl: string,
    hassUrl?: string,
    options?: { proxyAvailable?: boolean }
  ): string | null;
  getCameraPlaybackPlan(request: unknown): Promise<unknown>;
  resolveCameraStreamResource: (
    entityId: string,
    stream: 'hls' | 'web_rtc',
    rawPath?: string
  ) => Promise<ResolvedPlatformResource>;
  getStoreState(): HomeAssistantStoreState;
  subscribeStore(listener: () => void): () => void;
}

let bridge: HomeAssistantServiceBridge | null = null;

export function configureHomeAssistantServiceBridge(nextBridge: HomeAssistantServiceBridge) {
  bridge = nextBridge;
}

function getBridge(): HomeAssistantServiceBridge {
  if (!bridge) {
    throw new Error('Home Assistant service bridge has not been configured');
  }

  return bridge;
}

export function callHomeAssistantService(
  domain: string,
  service: string,
  serviceData: Record<string, unknown> = {},
  target?: IntegrationServiceTarget
) {
  return getBridge().callService(domain, service, serviceData, target);
}

export function callHomeAssistantApi<T = unknown>(
  method: string,
  path: string,
  parameters?: Record<string, unknown>
) {
  return getBridge().callApi<T>(method, path, parameters);
}

export function signHomeAssistantPath(path: string, expiresSeconds?: number) {
  return getBridge().signPath(path, expiresSeconds);
}

export function getHomeAssistantCameraStreamUrl(entityId: string, format: 'hls' | 'web_rtc') {
  return getBridge().getCameraStreamUrl(entityId, format);
}

export function getHomeAssistantCameraStreamPaths(entityId: string) {
  return getBridge().getCameraStreamPaths(entityId);
}

export function addHomeAssistantListener(
  event: 'entities' | 'registries' | 'connection' | 'config',
  listener: () => void
) {
  return getBridge().addListener(event, listener);
}

export function isHomeAssistantConnected() {
  return getBridge().isConnected();
}

export function getHomeAssistantPanelHass() {
  return getBridge().getPanelHass();
}

export function getHomeAssistantConnection() {
  return getBridge().getConnection();
}

export function sendHomeAssistantWebSocketBinary(data: Uint8Array) {
  getBridge().sendWebSocketBinary(data);
}

export function getHomeAssistantEntities() {
  return getBridge().getEntities();
}

export function getHomeAssistantEntityRegistry() {
  return getBridge().getEntityRegistry();
}

export function getHomeAssistantConfig() {
  return getBridge().getConfig();
}

export function updateHomeAssistantLight(entityId: string, options: ProviderLightUpdateOptions) {
  return getBridge().updateLight(entityId, options);
}

export function getHomeAssistantStoreState() {
  return getBridge().getStoreState();
}

export function subscribeHomeAssistantStore(listener: () => void) {
  return getBridge().subscribeStore(listener);
}

export function subscribeHomeAssistantStoreEntities(listener: () => void) {
  const currentBridge = getBridge();
  let previousEntities = currentBridge.getStoreState().entities;

  return currentBridge.subscribeStore(() => {
    const nextEntities = currentBridge.getStoreState().entities;
    if (nextEntities === previousEntities) {
      return;
    }

    previousEntities = nextEntities;
    listener();
  });
}

export function playHomeAssistantMedia(entityId: string, media: PlatformMediaPlayRequest) {
  return getBridge().playMedia(entityId, media);
}

export function browseHomeAssistantMediaPlayer(
  entityId: string,
  media?: HomeAssistantMediaBrowseRequest
) {
  return getBridge().browseMediaPlayer(entityId, media);
}

export function searchHomeAssistantMediaPlayer(
  entityId: string,
  query: string,
  media?: HomeAssistantMediaBrowseRequest
) {
  return getBridge().searchMediaPlayer(entityId, query, media);
}

export function selectHomeAssistantMediaPlayerSource(entityId: string, source: string) {
  return getBridge().selectMediaPlayerSource(entityId, source);
}

export function selectHomeAssistantMediaPlayerSoundMode(entityId: string, soundMode: string) {
  return getBridge().selectMediaPlayerSoundMode(entityId, soundMode);
}

export function seekHomeAssistantMediaPlayer(entityId: string, seekPosition: number) {
  return getBridge().seekMediaPlayer(entityId, seekPosition);
}

export function clearHomeAssistantMediaPlayerPlaylist(entityId: string) {
  return getBridge().clearMediaPlayerPlaylist(entityId);
}

export function updateHomeAssistantMediaPlayerPower(entityId: string, state: 'on' | 'off') {
  return getBridge().updateMediaPlayerPower(entityId, state);
}

export function sendHomeAssistantRemoteCommand(entityId: string, command: PlatformRemoteCommand) {
  return getBridge().sendRemoteCommand(entityId, command);
}

export function browseHomeAssistantMediaSource(mediaContentId?: string) {
  return getBridge().browseMediaSource(mediaContentId);
}

export function resolveHomeAssistantMediaSource(mediaContentId: string) {
  return getBridge().resolveMediaSource(mediaContentId);
}

export function getHomeAssistantAutomationConfig(entityId: string) {
  return getBridge().getAutomationConfig(entityId);
}

export function getHomeAssistantCameraCapabilities(entityId: string) {
  return getBridge().getCameraCapabilities(entityId);
}

export function enableHomeAssistantCameraMotionDetection(entityId: string) {
  return getBridge().enableCameraMotionDetection(entityId);
}

export function disableHomeAssistantCameraMotionDetection(entityId: string) {
  return getBridge().disableCameraMotionDetection(entityId);
}

export function getHomeAssistantWebRtcClientConfiguration(entityId: string) {
  return getBridge().getWebRtcClientConfiguration(entityId);
}

export function subscribeHomeAssistantCameraWebRtcOffer(
  entityId: string,
  offerSdp: string,
  listener: (event: HomeAssistantWebRtcBridgeEvent) => void
) {
  return getBridge().subscribeCameraWebRtcOffer(entityId, offerSdp, listener);
}

export function addHomeAssistantCameraWebRtcCandidate(
  entityId: string,
  sessionId: string,
  candidate: RTCIceCandidateInit
) {
  return getBridge().addCameraWebRtcCandidate(entityId, sessionId, candidate);
}

export function createHomeAssistantArea(name: string) {
  return getBridge().createArea(name);
}

export function renameHomeAssistantArea(areaId: string, name: string) {
  return getBridge().updateAreaName(areaId, name);
}

export function updateHomeAssistantEntityArea(entityId: string, areaId: string | null) {
  return getBridge().updateEntityArea(entityId, areaId);
}

export function updateHomeAssistantEntityName(entityId: string, name: string | null) {
  return getBridge().updateEntityName(entityId, name);
}

export function deleteHomeAssistantArea(areaId: string) {
  return getBridge().deleteArea(areaId);
}

export function resolveHomeAssistantArtwork(
  entityId: string,
  attrs?: Record<string, unknown>,
  fallbackPicture?: string
) {
  return getBridge().resolveArtwork(entityId, attrs, fallbackPicture);
}

export function resolveHomeAssistantProxyUrl(
  resourceUrl: string,
  hassUrl?: string,
  options?: { proxyAvailable?: boolean }
) {
  return getBridge().resolveProxyUrl(resourceUrl, hassUrl, options);
}

export function getHomeAssistantCameraPlaybackPlan(request: unknown) {
  return getBridge().getCameraPlaybackPlan(request);
}

export function resolveHomeAssistantCameraStreamResource(
  entityId: string,
  stream: 'hls' | 'web_rtc',
  rawPath?: string
) {
  return getBridge().resolveCameraStreamResource(entityId, stream, rawPath);
}
