import type { EnergySourceConfig } from './energy-types';
import type { IntegrationServiceTarget } from './integration-service-target';
import type {
  PlatformAutomationDetails,
  PlatformCalendarEvent,
  PlatformCalendarRequestOptions,
  PlatformCameraCapabilities,
  PlatformCameraLiveState,
  PlatformCameraStream,
  PlatformCameraStreamType,
  PlatformConversationEvent,
  PlatformConversationPipelineCollection,
  PlatformConversationRunHandle,
  PlatformConversationTextRequest,
  PlatformConversationVoiceRequest,
  PlatformEnergyEntityMap,
  PlatformEnergyEntityRegistryEntry,
  PlatformEntityHistoriesRequest,
  PlatformEntityHistoryRequest,
  PlatformEntityHistorySeries,
  PlatformEntityRegistryEntry,
  PlatformEntitySnapshotMap,
  PlatformMediaBrowseResult,
  PlatformMessageClient,
  PlatformNotificationDeliveryRequest,
  PlatformNotificationDeliveryTarget,
  PlatformNotificationRequestOptions,
  PlatformNotificationSnapshot,
  PlatformPersistentNotificationEvent,
  PlatformResolvedMediaSource,
  PlatformRoomReference,
  PlatformStatisticsHistoryRequest,
  PlatformStatisticsHistorySeries,
  PlatformTaskRuntimeSnapshot,
  PlatformWeatherForecastEntry,
  PlatformWeatherRequestOptions,
  PlatformWebRtcClientConfiguration,
  PlatformWebRtcOfferEvent,
} from './provider-feature-models';

export interface ProviderConversationFeatureService {
  getPipelines: () => Promise<PlatformConversationPipelineCollection>;
  startTextConversation: (
    request: PlatformConversationTextRequest,
    listener: (event: PlatformConversationEvent) => void
  ) => Promise<PlatformConversationRunHandle>;
  startVoiceConversation: (
    request: PlatformConversationVoiceRequest,
    listener: (event: PlatformConversationEvent) => void
  ) => Promise<PlatformConversationRunHandle>;
}

export interface ProviderMediaFeatureService {
  playMedia: (
    entityId: string,
    media: {
      mediaContentId: string;
      mediaContentType: string;
      enqueue?: 'play' | 'next' | 'add' | 'replace';
      announce?: boolean;
    }
  ) => Promise<void>;
  browseMediaPlayer: (
    entityId: string,
    media?: { mediaContentId?: string; mediaContentType?: string }
  ) => Promise<PlatformMediaBrowseResult>;
  searchMediaPlayer: (
    entityId: string,
    query: string,
    media?: { mediaContentId?: string; mediaContentType?: string }
  ) => Promise<PlatformMediaBrowseResult>;
  selectMediaPlayerSource: (entityId: string, source: string) => Promise<void>;
  selectMediaPlayerSoundMode: (entityId: string, soundMode: string) => Promise<void>;
  seekMediaPlayer: (entityId: string, seekPosition: number) => Promise<void>;
  clearMediaPlayerPlaylist: (entityId: string) => Promise<void>;
  updateMediaPlayerPower: (entityId: string, state: 'on' | 'off') => Promise<void>;
  sendRemoteCommand: (entityId: string, command: string) => Promise<void>;
  browseMediaSource: (mediaContentId: string) => Promise<PlatformMediaBrowseResult>;
  resolveMediaSource: (mediaContentId: string) => Promise<PlatformResolvedMediaSource>;
  fetchMediaThumbnailDataUrl: (
    entityId: string,
    messageClient?: PlatformMessageClient | null
  ) => Promise<string | null>;
}

export interface ProviderLightUpdateOptions {
  state?: 'on' | 'off';
  brightnessPct?: number;
  kelvin?: number;
  rgbColor?: [number, number, number];
  hsColor?: [number, number];
  xyColor?: [number, number];
  effect?: string;
}

export interface ProviderLightFeatureService {
  updateLight: (entityId: string, options: ProviderLightUpdateOptions) => Promise<void>;
}

export interface ProviderNativeActionFeatureService {
  invokeAction: (request: {
    entityId?: string;
    domain: string;
    service: string;
    serviceData?: Record<string, unknown>;
    target?: IntegrationServiceTarget;
  }) => Promise<void>;
}

export interface ProviderCameraFeatureService {
  getCameraCapabilities: (entityId: string) => Promise<PlatformCameraCapabilities>;
  getCameraLiveState?: (entityId: string) => Promise<PlatformCameraLiveState>;
  refreshCameraSnapshot?: (entityId: string) => Promise<void>;
  getCameraStreamPaths?: (
    entityId: string
  ) => Promise<Partial<Record<PlatformCameraStreamType, string>>>;
  getCameraStreamUrl: (
    entityId: string,
    format?: PlatformCameraStreamType
  ) => Promise<PlatformCameraStream>;
  getWebRtcClientConfiguration: (entityId: string) => Promise<PlatformWebRtcClientConfiguration>;
  subscribeCameraWebRtcOffer: (
    entityId: string,
    offer: string,
    callback: (event: PlatformWebRtcOfferEvent) => void
  ) => Promise<() => void>;
  addCameraWebRtcCandidate: (
    entityId: string,
    sessionId: string,
    candidate: RTCIceCandidateInit
  ) => Promise<void>;
  closeCameraWebRtcSession?: (entityId: string, sessionId: string) => Promise<void>;
  toggleCameraAccessory: (entityId: string, state: 'on' | 'off') => Promise<void>;
  selectCameraAccessoryOption: (entityId: string, option: string) => Promise<void>;
  setCameraAccessoryValue: (entityId: string, value: number) => Promise<void>;
  enableCameraMotionDetection: (entityId: string) => Promise<void>;
  disableCameraMotionDetection: (entityId: string) => Promise<void>;
}

export interface ProviderSecurityFeatureService {
  lockEntity: (entityId: string) => Promise<void>;
  unlockEntity: (entityId: string) => Promise<void>;
  armHome: (entityId: string, code?: string) => Promise<void>;
  armAway: (entityId: string, code?: string) => Promise<void>;
  armNight: (entityId: string, code?: string) => Promise<void>;
  armVacation: (entityId: string, code?: string) => Promise<void>;
  armCustomBypass: (entityId: string, code?: string) => Promise<void>;
  disarm: (entityId: string, code?: string) => Promise<void>;
  trigger: (entityId: string, code?: string) => Promise<void>;
  openCover: (entityId: string, mode?: 'position' | 'tilt') => Promise<void>;
  closeCover: (entityId: string, mode?: 'position' | 'tilt') => Promise<void>;
  stopCover: (entityId: string, mode?: 'position' | 'tilt') => Promise<void>;
  setCoverPosition: (
    entityId: string,
    position: number,
    mode?: 'position' | 'tilt'
  ) => Promise<void>;
}

export interface ProviderClimateTemperatureUpdate {
  serviceDomain?: 'climate' | 'water_heater';
  temperature?: number;
  targetTemperatureLow?: number;
  targetTemperatureHigh?: number;
}

export interface ProviderClimateFeatureService {
  setTargetTemperature: (
    entityId: string,
    update: ProviderClimateTemperatureUpdate
  ) => Promise<void>;
}

export interface ProviderRoomAdminFeatureService {
  createRoom: (name: string) => Promise<PlatformRoomReference>;
  renameRoom: (roomId: string, name: string) => Promise<PlatformRoomReference>;
  assignEntityToRoom: (entityId: string, roomId: string) => Promise<void>;
  unassignEntityFromRoom: (entityId: string) => Promise<void>;
  deleteRoom: (roomId: string) => Promise<void>;
}

export interface ProviderAdminFeatureService extends ProviderRoomAdminFeatureService {
  /** Whether this session can reload the integration behind this entity, regardless of its state. */
  canReloadEntityIntegration?: (entityId: string) => boolean;
  /** Watches live integration reload support; unknown support remains unavailable. */
  subscribeEntityIntegrationReload?: (entityId: string, listener: () => void) => () => void;
  /** Reloads the owning integration; completion does not establish entity recovery. */
  reloadEntityIntegration?: (entityId: string) => Promise<void>;
  /**
   * Compatibility seam for callers that still model assign and unassign as one nullable update.
   */
  updateEntityRoom: (entityId: string, roomId: string | null) => Promise<void>;
  updateEntityName: (entityId: string, name: string) => Promise<void>;
}

export interface ProviderHistoryFeatureService {
  getMessageClient: () => PlatformMessageClient | null;
  /** False means this entity has no history; transport failures must still reject requests. */
  supportsEntityHistory?: (entityId: string) => boolean;
  getEntityHistories?: (
    request: PlatformEntityHistoriesRequest
  ) => Promise<PlatformEntityHistorySeries[]>;
  getEntityHistory?: (
    request: PlatformEntityHistoryRequest
  ) => Promise<PlatformEntityHistorySeries>;
  getStatisticsHistory?: (
    request: PlatformStatisticsHistoryRequest
  ) => Promise<PlatformStatisticsHistorySeries>;
  supportsStatisticsHistory?: (entityId: string) => boolean;
  supportsEnergyStatistics?: (entityId: string) => boolean;
}

export interface ProviderEnergyFeatureService {
  getSourceConfig: (messageClient: PlatformMessageClient) => Promise<EnergySourceConfig>;
  augmentSourceConfig: (
    config: EnergySourceConfig,
    entities: PlatformEnergyEntityMap,
    entityRegistry?: PlatformEnergyEntityRegistryEntry[]
  ) => EnergySourceConfig;
}

export interface ProviderEntityRuntimeService {
  getEntitySnapshots: () => PlatformEntitySnapshotMap | null;
  subscribeEntitySnapshots: (listener: () => void) => () => void;
  getEntitySnapshot?: (entityId: string) => PlatformEntitySnapshotMap[string] | undefined;
  subscribeEntitySnapshot?: (entityId: string, listener: () => void) => () => void;
  getEntityRegistryEntries: () => PlatformEntityRegistryEntry[];
  subscribeEntityRegistryEntries: (listener: () => void) => () => void;
  getEntityRegistryEntry?: (entityId: string) => PlatformEntityRegistryEntry | undefined;
  subscribeEntityRegistryEntry?: (entityId: string, listener: () => void) => () => void;
  getConfig: () => unknown | null;
  subscribeConfig: (listener: () => void) => () => void;
}

export interface ProviderCalendarFeatureService {
  getEvents: (
    entityId: string,
    options?: PlatformCalendarRequestOptions
  ) => Promise<PlatformCalendarEvent[]>;
}

export interface ProviderWeatherFeatureService {
  getForecast: (
    entityId: string,
    type: 'daily' | 'hourly',
    options?: PlatformWeatherRequestOptions
  ) => Promise<PlatformWeatherForecastEntry[]>;
}

export interface ProviderNotificationFeatureService {
  getSnapshot: (
    options?: PlatformNotificationRequestOptions
  ) => Promise<PlatformNotificationSnapshot>;
  subscribePersistentNotifications: (
    callback: (event: PlatformPersistentNotificationEvent) => void,
    options?: PlatformNotificationRequestOptions
  ) => Promise<() => void>;
  dismissPersistentNotification: (notificationId: string) => Promise<void>;
  installUpdate: (entityId: string) => Promise<void>;
  restartSystem: () => Promise<void>;
  getDeliveryTargets?: (
    options?: PlatformNotificationRequestOptions
  ) => Promise<PlatformNotificationDeliveryTarget[]>;
  sendNotification?: (request: PlatformNotificationDeliveryRequest) => Promise<void>;
}

export interface ProviderTaskFeatureService {
  getTaskRuntimeSnapshot: () => PlatformTaskRuntimeSnapshot;
  subscribeTaskRuntimeSnapshot: (listener: () => void) => () => void;
  getAutomationDetails: (entityId: string) => Promise<PlatformAutomationDetails>;
  triggerAutomation: (entityId: string) => Promise<void>;
}

export interface ProviderChoreProjectionFeatureService {
  publishSnapshot: (
    snapshot: import('./chore-projection').ChoreProjectionSnapshot
  ) => Promise<void>;
  subscribeActionRequests?: (
    listener: (request: import('./chore-projection').ChoreProjectionActionRequest) => void
  ) => Promise<() => void>;
}
