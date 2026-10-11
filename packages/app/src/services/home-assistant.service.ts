import { fromHassUser, type IntegrationUser } from '@navet/app/types/integration-user';
import type { Connection, HassConfig, HassEntities } from 'home-assistant-js-websocket';

import HAConnectionService, {
  type HAConnectionEventMap,
  type HAConnectionEventType,
  type HomeAssistantConfiguration,
} from './ha-connection.service';
import HAEntityService from './ha-entity-service';
import HARegistryService from './ha-registry.service';
import {
  HomeAssistantPanelAdapter,
  type HomeAssistantPanelHass,
} from './home-assistant-panel-adapter';

export type { HAConnectionEventMap, HAConnectionEventType, HomeAssistantConfiguration };

export interface HomeAssistantAreaRegistryEntry {
  area_id: string;
  name: string;
}

export interface HomeAssistantDeviceRegistryEntry {
  id: string;
  area_id?: string | null;
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

export interface HomeAssistantMediaSourceItem {
  title: string;
  media_title?: string;
  media_class: string;
  media_content_id: string;
  media_content_type?: string;
  children?: HomeAssistantMediaSourceItem[];
  can_expand?: boolean;
  can_play?: boolean;
  thumbnail?: string | null;
  media_image_url?: string | null;
  artist?: string;
  media_artist?: string;
  album?: string;
  media_album_name?: string;
}

export interface HomeAssistantMediaBrowseResult {
  title?: string;
  media_title?: string;
  media_class?: string;
  media_content_id?: string;
  media_content_type?: string;
  children?: HomeAssistantMediaBrowseResult[];
  can_expand?: boolean;
  can_play?: boolean;
  thumbnail?: string | null;
  media_image_url?: string | null;
  artist?: string;
  media_artist?: string;
  album?: string;
  media_album_name?: string;
}

export interface HomeAssistantMediaSearchResult {
  title?: string;
  media_title?: string;
  media_class?: string;
  media_content_id?: string;
  media_content_type?: string;
  children?: HomeAssistantMediaBrowseResult[];
}

export interface HomeAssistantResolvedMediaSource {
  url: string;
  mime_type?: string;
}

export interface HomeAssistantAutomationConfig {
  config: Record<string, unknown>;
}

export type HomeAssistantCameraStreamType = 'hls' | 'web_rtc';

export interface HomeAssistantCameraCapabilities {
  frontend_stream_types?: HomeAssistantCameraStreamType[];
}

export interface HomeAssistantCameraStream {
  url: string;
}

export interface HomeAssistantCameraStreamPaths {
  hls_path?: string | null;
  mjpeg_path?: string | null;
}

export interface HomeAssistantSignedPath {
  path: string;
}

export interface HomeAssistantWebRtcClientConfiguration {
  configuration: RTCConfiguration;
  dataChannel?: string;
}

export type HomeAssistantWebRtcOfferEvent =
  | { type: 'session'; session_id: string }
  | { type: 'answer'; answer: string }
  | { type: 'candidate'; candidate: RTCIceCandidateInit }
  | { type: 'error'; code: string; message: string };

export interface HAServiceEventMap {
  entities: HassEntities;
  config: HassConfig;
  registries: {
    areas: HomeAssistantAreaRegistryEntry[];
    devices: HomeAssistantDeviceRegistryEntry[];
    entities: HomeAssistantEntityRegistryEntry[];
    automationCategories: HomeAssistantCategoryRegistryEntry[];
  };
  connection: { connected: boolean; connection: Connection | null; reconnecting: boolean };
  error: { message: string };
}

export type HAServiceEventType = keyof HAServiceEventMap;

/**
 * HomeAssistantService facade - orchestrates connection, registry, and entity services.
 * Maintains backward compatibility with existing code while improving separation of concerns.
 */
class HomeAssistantService {
  private connectionService: HAConnectionService;
  private registryService: HARegistryService;
  private entityService: HAEntityService;
  private panelAdapter: HomeAssistantPanelAdapter | null = null;
  private registryListeners = new Set<(data: HAServiceEventMap['registries']) => void>();
  private connectionListeners = new Set<(data: HAServiceEventMap['connection']) => void>();
  private configListeners = new Set<(data: HAServiceEventMap['config']) => void>();
  private entityListeners = new Set<(data: HAServiceEventMap['entities']) => void>();
  private errorListeners = new Set<(data: HAServiceEventMap['error']) => void>();

  constructor() {
    this.connectionService = new HAConnectionService();
    this.registryService = new HARegistryService(() => this.getConnection());
    this.entityService = new HAEntityService(
      () => this.getConnection(),
      (domain, service, serviceData, target) =>
        this.callService(domain, service, serviceData, target)
    );

    this.connectionService.addListener('connection', (connection) => {
      this.emitConnection(connection);
    });
    this.connectionService.addListener('config', (config) => {
      this.emitConfig(config);
    });
    this.connectionService.addListener('entities', (entities) => {
      this.emitEntities(entities);
    });
    this.connectionService.addListener('error', (error) => {
      this.emitError(error);
    });
  }

  /**
   * Authenticate and establish connection to Home Assistant
   */
  async authenticate(configuration: HomeAssistantConfiguration): Promise<void> {
    this.panelAdapter = null;
    await this.connectionService.authenticate(configuration);
    await this.registryService.loadRegistries();
  }

  /**
   * Attach the Home Assistant frontend-provided hass object when Navet runs as a native panel.
   */
  setPanelHass(hass: HomeAssistantPanelHass): void {
    if (this.panelAdapter) {
      this.panelAdapter.update(hass);
      this.emitPanelRuntimeState();
      return;
    }

    this.connectionService.disconnect();
    this.panelAdapter = new HomeAssistantPanelAdapter(hass);
    this.emitPanelRuntimeState();
  }

  getPanelHass(): HomeAssistantPanelHass | null {
    return this.panelAdapter?.getHass() ?? null;
  }

  /**
   * Subscribe to a specific typed HA service event.
   * Returns an unsubscribe function.
   */
  addListener<K extends HAServiceEventType>(
    event: K,
    callback: (data: HAServiceEventMap[K]) => void
  ): () => void {
    if (event === 'connection') {
      const listener = callback as (data: HAServiceEventMap['connection']) => void;
      this.connectionListeners.add(listener);
      return () => {
        this.connectionListeners.delete(listener);
      };
    }

    if (event === 'config') {
      const listener = callback as (data: HAServiceEventMap['config']) => void;
      this.configListeners.add(listener);
      return () => {
        this.configListeners.delete(listener);
      };
    }

    if (event === 'entities') {
      const listener = callback as (data: HAServiceEventMap['entities']) => void;
      this.entityListeners.add(listener);
      return () => {
        this.entityListeners.delete(listener);
      };
    }

    if (event === 'error') {
      const listener = callback as (data: HAServiceEventMap['error']) => void;
      this.errorListeners.add(listener);
      return () => {
        this.errorListeners.delete(listener);
      };
    }

    // For registry events, we need to wrap the listener
    if (event === 'registries') {
      const registriesCallback = callback as (data: HAServiceEventMap['registries']) => void;
      this.registryListeners.add(registriesCallback);
      const unsubscribeConnection = this.connectionService.addListener('connection', () => {
        // Trigger registry load on connection
        void this.registryService.loadRegistries().then(() => {
          this.emitRegistries();
        });
      });
      return () => {
        this.registryListeners.delete(registriesCallback);
        unsubscribeConnection();
      };
    }

    return () => {};
  }

  /**
   * Get current connection status
   */
  isConnected(): boolean {
    if (this.panelAdapter) {
      return true;
    }

    return this.connectionService.isConnected();
  }

  /**
   * Get Home Assistant configuration
   */
  getConfig(): HassConfig | null {
    if (this.panelAdapter) {
      return this.panelAdapter.getConfig();
    }

    return this.connectionService.getConfig();
  }

  /**
   * Get Home Assistant entities
   */
  getEntities(): HassEntities | null {
    if (this.panelAdapter) {
      return this.panelAdapter.getEntities();
    }

    return this.connectionService.getEntities();
  }

  /**
   * Get Home Assistant user
   */
  getUser(): IntegrationUser | null {
    if (this.panelAdapter) {
      return fromHassUser(this.panelAdapter.getUser());
    }

    return fromHassUser(this.connectionService.getUser());
  }

  /**
   * Get connection object
   */
  getConnection(): Connection | null {
    if (this.panelAdapter) {
      return this.panelAdapter.getConnection();
    }

    return this.connectionService.getConnection();
  }

  sendWebSocketBinary(data: Uint8Array): void {
    const connection =
      this.panelAdapter?.getHass().connection ?? this.connectionService.getConnection();
    const socket = (connection as (Connection & { socket?: WebSocket }) | null)?.socket;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('Home Assistant websocket is not connected');
    }

    socket.send(new Uint8Array(data).buffer);
  }

  async callApi<T = unknown>(
    method: string,
    path: string,
    parameters?: Record<string, unknown>
  ): Promise<T> {
    if (this.panelAdapter) {
      return await this.panelAdapter.callApi<T>(method, path, parameters);
    }

    return await this.connectionService.callApi<T>(method, path, parameters);
  }

  async loadRegistries(): Promise<void> {
    if (this.panelAdapter) {
      const { areas, devices, entities, automationCategories } =
        await this.panelAdapter.loadRegistries();
      this.registryService.replaceRegistries(areas, devices, entities, automationCategories);
      this.emitRegistries();
      return;
    }

    await this.registryService.loadRegistries();
    this.emitRegistries();
  }

  /**
   * Get Home Assistant areas
   */
  getAreas(): HomeAssistantAreaRegistryEntry[] {
    return this.registryService.getAreas();
  }

  /**
   * Get device registry
   */
  getDeviceRegistry(): HomeAssistantDeviceRegistryEntry[] {
    return this.registryService.getDeviceRegistry();
  }

  /**
   * Get entity registry
   */
  getEntityRegistry(): HomeAssistantEntityRegistryEntry[] {
    return this.registryService.getEntityRegistry();
  }

  getAutomationCategories(): HomeAssistantCategoryRegistryEntry[] {
    return this.registryService.getAutomationCategories();
  }

  /**
   * Update entity area assignment
   */
  async updateEntityArea(entityId: string, areaId: string | null): Promise<void> {
    await this.registryService.updateEntityArea(entityId, areaId);
    this.emitRegistries();
  }

  /**
   * Update entity display name in Home Assistant.
   */
  async updateEntityName(entityId: string, name: string): Promise<void> {
    await this.registryService.updateEntityName(entityId, name);
    this.emitRegistries();
  }

  /**
   * Call an arbitrary Home Assistant service over the active websocket connection.
   */
  async callService(
    domain: string,
    service: string,
    serviceData: Record<string, unknown> = {},
    target?: {
      entity_id?: string | string[];
      area_id?: string | string[];
      device_id?: string | string[];
    }
  ): Promise<void> {
    if (this.panelAdapter) {
      await this.panelAdapter.callService(domain, service, serviceData, target);
      return;
    }

    await this.connectionService.callService(domain, service, serviceData, target);
  }

  /**
   * Create a new area
   */
  async createArea(name: string): Promise<HomeAssistantAreaRegistryEntry> {
    const area = await this.registryService.createArea(name);
    this.emitRegistries();
    return area;
  }

  /**
   * Update an area's display name.
   */
  async updateAreaName(areaId: string, name: string): Promise<HomeAssistantAreaRegistryEntry> {
    const area = await this.registryService.updateAreaName(areaId, name);
    this.emitRegistries();
    return area;
  }

  /**
   * Delete an area
   */
  async deleteArea(areaId: string): Promise<void> {
    await this.registryService.deleteArea(areaId);
    this.emitRegistries();
  }

  /**
   * Update a light entity
   */
  async updateLight(
    entityId: string,
    options: {
      state?: 'on' | 'off';
      brightnessPct?: number;
      kelvin?: number;
      rgbColor?: [number, number, number];
      hsColor?: [number, number];
      xyColor?: [number, number];
      effect?: string;
    }
  ): Promise<void> {
    await this.entityService.updateLight(entityId, options);
  }

  /**
   * Update a switch entity
   */
  async updateSwitch(entityId: string, state: 'on' | 'off'): Promise<void> {
    await this.entityService.updateSwitch(entityId, state);
  }

  /**
   * Update a lock entity
   */
  async updateLock(entityId: string, state: 'locked' | 'unlocked'): Promise<void> {
    await this.entityService.updateLock(entityId, state);
  }

  /**
   * Set climate temperature
   */
  async setClimateTemperature(entityId: string, temperature: number): Promise<void> {
    await this.entityService.setClimateTemperature(entityId, temperature);
  }

  /**
   * Set climate HVAC mode
   */
  async setClimateHvacMode(entityId: string, hvacMode: string): Promise<void> {
    await this.entityService.setClimateHvacMode(entityId, hvacMode);
  }

  /**
   * Update media player playback
   */
  async updateMediaPlayerPlayback(
    entityId: string,
    action: 'toggle' | 'play' | 'pause' | 'previous' | 'next'
  ): Promise<void> {
    await this.entityService.updateMediaPlayerPlayback(entityId, action);
  }

  /**
   * Set media player volume
   */
  async setMediaPlayerVolume(entityId: string, volumePct: number): Promise<void> {
    await this.entityService.setMediaPlayerVolume(entityId, volumePct);
  }

  /**
   * Set media player mute
   */
  async setMediaPlayerMute(entityId: string, isMuted: boolean): Promise<void> {
    await this.entityService.setMediaPlayerMute(entityId, isMuted);
  }

  /**
   * Update media player power
   */
  async updateMediaPlayerPower(entityId: string, state: 'on' | 'off'): Promise<void> {
    await this.entityService.updateMediaPlayerPower(entityId, state);
  }

  /**
   * Select media player source
   */
  async selectMediaPlayerSource(entityId: string, source: string): Promise<void> {
    await this.entityService.selectMediaPlayerSource(entityId, source);
  }

  async playMedia(
    entityId: string,
    media: {
      mediaContentId: string;
      mediaContentType: string;
      enqueue?: 'play' | 'next' | 'add' | 'replace';
      announce?: boolean;
    }
  ): Promise<void> {
    await this.entityService.playMedia(entityId, media);
  }

  async browseMediaPlayer(
    entityId: string,
    media?: { mediaContentId?: string; mediaContentType?: string }
  ): Promise<HomeAssistantMediaBrowseResult> {
    return await this.entityService.browseMediaPlayer(entityId, media);
  }

  async searchMediaPlayer(
    entityId: string,
    query: string,
    media?: { mediaContentId?: string; mediaContentType?: string }
  ): Promise<HomeAssistantMediaSearchResult> {
    return await this.entityService.searchMediaPlayer(entityId, query, media);
  }

  async seekMediaPlayer(entityId: string, seekPosition: number): Promise<void> {
    await this.entityService.seekMediaPlayer(entityId, seekPosition);
  }

  async selectMediaPlayerSoundMode(entityId: string, soundMode: string): Promise<void> {
    await this.entityService.selectMediaPlayerSoundMode(entityId, soundMode);
  }

  async clearMediaPlayerPlaylist(entityId: string): Promise<void> {
    await this.entityService.clearMediaPlayerPlaylist(entityId);
  }

  /**
   * Send remote command
   */
  async sendRemoteCommand(entityId: string, command: string | string[]): Promise<void> {
    await this.entityService.sendRemoteCommand(entityId, command);
  }

  /**
   * Set media player shuffle
   */
  async setMediaPlayerShuffle(entityId: string, shuffle: boolean): Promise<void> {
    await this.entityService.setMediaPlayerShuffle(entityId, shuffle);
  }

  /**
   * Set media player repeat
   */
  async setMediaPlayerRepeat(entityId: string, repeat: 'off' | 'one' | 'all'): Promise<void> {
    await this.entityService.setMediaPlayerRepeat(entityId, repeat);
  }

  /**
   * Join media players
   */
  async joinMediaPlayers(entityId: string, memberEntityIds: string[]): Promise<void> {
    await this.entityService.joinMediaPlayers(entityId, memberEntityIds);
  }

  /**
   * Unjoin media player
   */
  async unjoinMediaPlayer(entityId: string): Promise<void> {
    await this.entityService.unjoinMediaPlayer(entityId);
  }

  /**
   * Update camera
   */
  async updateCamera(entityId: string, state: 'on' | 'off'): Promise<void> {
    await this.entityService.updateCamera(entityId, state);
  }

  async enableCameraMotionDetection(entityId: string): Promise<void> {
    await this.entityService.enableCameraMotionDetection(entityId);
  }

  async disableCameraMotionDetection(entityId: string): Promise<void> {
    await this.entityService.disableCameraMotionDetection(entityId);
  }

  async playCameraStream(entityId: string, mediaPlayerId: string): Promise<void> {
    await this.entityService.playCameraStream(entityId, mediaPlayerId);
  }

  async getCameraCapabilities(entityId: string): Promise<HomeAssistantCameraCapabilities> {
    return await this.entityService.getCameraCapabilities(entityId);
  }

  async getCameraStreamUrl(
    entityId: string,
    format: HomeAssistantCameraStreamType = 'hls'
  ): Promise<HomeAssistantCameraStream> {
    return await this.entityService.getCameraStreamUrl(entityId, format);
  }

  async getCameraStreamPaths(entityId: string): Promise<HomeAssistantCameraStreamPaths> {
    return await this.entityService.getCameraStreamPaths(entityId);
  }

  async signPath(path: string, expires = 30): Promise<HomeAssistantSignedPath> {
    const conn = this.getConnection();
    if (!conn) {
      throw new Error('Home Assistant is not connected');
    }

    return (await conn.sendMessagePromise({
      type: 'auth/sign_path',
      path,
      expires,
    })) as HomeAssistantSignedPath;
  }

  async getWebRtcClientConfiguration(
    entityId: string
  ): Promise<HomeAssistantWebRtcClientConfiguration> {
    return await this.entityService.getWebRtcClientConfiguration(entityId);
  }

  subscribeCameraWebRtcOffer(
    entityId: string,
    offer: string,
    callback: (event: HomeAssistantWebRtcOfferEvent) => void
  ): Promise<() => void> {
    return this.entityService.subscribeCameraWebRtcOffer(entityId, offer, callback);
  }

  async addCameraWebRtcCandidate(
    entityId: string,
    sessionId: string,
    candidate: RTCIceCandidateInit
  ): Promise<void> {
    await this.entityService.addCameraWebRtcCandidate(entityId, sessionId, candidate);
  }

  /**
   * Browse media source
   */
  async browseMediaSource(mediaContentId: string): Promise<HomeAssistantMediaSourceItem> {
    return await this.entityService.browseMediaSource(mediaContentId);
  }

  /**
   * Resolve media source
   */
  async resolveMediaSource(mediaContentId: string): Promise<HomeAssistantResolvedMediaSource> {
    return await this.entityService.resolveMediaSource(mediaContentId);
  }

  /**
   * Get automation config
   */
  async getAutomationConfig(entityId: string): Promise<HomeAssistantAutomationConfig> {
    return await this.entityService.getAutomationConfig(entityId);
  }

  /**
   * Disconnect from Home Assistant
   */
  disconnect(): void {
    const hadPanelAdapter = Boolean(this.panelAdapter);
    this.panelAdapter = null;
    this.connectionService.disconnect();
    if (hadPanelAdapter) {
      this.emitConnection({ connected: false, connection: null, reconnecting: false });
    }
  }

  private emitConnection(data: HAServiceEventMap['connection']): void {
    for (const listener of this.connectionListeners) {
      listener(data);
    }
  }

  private emitConfig(data: HAServiceEventMap['config']): void {
    for (const listener of this.configListeners) {
      listener(data);
    }
  }

  private emitEntities(data: HAServiceEventMap['entities']): void {
    for (const listener of this.entityListeners) {
      listener(data);
    }
  }

  private emitError(data: HAServiceEventMap['error']): void {
    for (const listener of this.errorListeners) {
      listener(data);
    }
  }

  private emitPanelRuntimeState(): void {
    const config = this.getConfig();
    const entities = this.getEntities();
    const connection = this.getConnection();

    if (config) {
      this.emitConfig(config);
    }

    if (entities) {
      this.emitEntities(entities);
    }

    this.emitConnection({
      connected: true,
      connection,
      reconnecting: false,
    });
  }

  private emitRegistries(): void {
    const registries = {
      areas: this.registryService.getAreas(),
      devices: this.registryService.getDeviceRegistry(),
      entities: this.registryService.getEntityRegistry(),
      automationCategories: this.registryService.getAutomationCategories(),
    };

    for (const listener of this.registryListeners) {
      listener(registries);
    }
  }
}

export const homeAssistantService = new HomeAssistantService();
