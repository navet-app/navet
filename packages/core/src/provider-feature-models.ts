import type { IntegrationProviderId } from './integration-providers';
import type { ResolvedPlatformResource } from './provider-contract';

export interface PlatformMediaItem {
  title: string;
  mediaClass?: string;
  mediaContentId?: string;
  mediaContentType?: string;
  children?: PlatformMediaItem[];
  canExpand?: boolean;
  canPlay?: boolean;
  thumbnail?: string | null;
  artist?: string;
  album?: string;
}

export interface PlatformMediaBrowseResult extends PlatformMediaItem {}

export interface PlatformResolvedMediaSource {
  url: string;
  mimeType?: string;
}

export interface PlatformMediaPlayRequest {
  mediaContentId: string;
  mediaContentType: string;
  enqueue?: 'play' | 'next' | 'add' | 'replace';
  announce?: boolean;
}

export type PlatformRemoteCommand = string;

export type PlatformCameraStreamType = 'hls' | 'web_rtc' | 'mjpeg';

export interface PlatformCameraCapabilities {
  streamTypes: PlatformCameraStreamType[];
}

export interface PlatformCameraLiveState {
  isStreamCapable: boolean;
  isStillImageOnly: boolean;
  motionDetectionEnabled: boolean | null;
}

export interface PlatformCameraCompanionState {
  entityId: string;
  type: 'motion';
  detectionTarget?: 'motion' | 'person';
  detected: boolean;
  changedAt: string | null;
}

export interface PlatformCameraStream {
  url: string;
}

export interface PlatformWebRtcClientConfiguration {
  configuration: RTCConfiguration;
  dataChannel?: string;
}

export type PlatformWebRtcOfferEvent =
  | { type: 'session'; session_id: string }
  | { type: 'answer'; answer: string }
  | { type: 'candidate'; candidate: RTCIceCandidateInit }
  | { type: 'error'; code: string; message: string };

export type PlatformCalendarEvent = Record<string, unknown>;
export type PlatformWeatherForecastEntry = Record<string, unknown>;

export interface PlatformMessageClient {
  sendMessagePromise<TResponse = unknown>(message: unknown): Promise<TResponse>;
  subscribeMessage?<TEvent = unknown>(
    callback: (event: TEvent) => void,
    subscribeMessage: unknown
  ): Promise<() => void>;
}

export interface PlatformConversationPipeline {
  id: string;
  name: string;
  language: string;
  conversationEngineId?: string;
  supportsSpeechToText: boolean;
  supportsTextToSpeech: boolean;
}

export interface PlatformConversationPipelineCollection {
  pipelines: PlatformConversationPipeline[];
  preferredPipelineId: string | null;
}

export interface PlatformConversationTextRequest {
  text: string;
  pipelineId?: string;
  conversationId?: string;
}

export interface PlatformConversationVoiceRequest {
  sampleRate: number;
  pipelineId?: string;
  conversationId?: string;
  playAudioResponse?: boolean;
}

export type PlatformConversationEvent =
  | {
      type: 'run-start';
      pipelineId: string;
      conversationId?: string;
    }
  | { type: 'speech-start' }
  | { type: 'speech-end'; text: string }
  | { type: 'response-delta'; text?: string; thinkingText?: string }
  | {
      type: 'response';
      conversationId?: string;
      text: string;
      responseType?: string;
      continueConversation: boolean;
    }
  | { type: 'audio-output'; url: string; mimeType?: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'run-end' };

export interface PlatformConversationRunHandle {
  sendAudio?: (chunk: Int16Array) => void;
  finishAudio?: () => void;
  cancel: () => void;
}

export interface PlatformEntitySnapshot {
  entityId: string;
  state: string;
  attributes: Record<string, unknown>;
  lastChanged?: string;
  lastUpdated?: string;
}

export type PlatformEntitySnapshotMap = Record<string, PlatformEntitySnapshot>;

export interface PlatformEntityHistoryRequest {
  entityId: string;
  startTime: string;
  endTime?: string;
  includeAttributes?: boolean;
  significantChangesOnly?: boolean;
}

export interface PlatformEntityHistoriesRequest {
  entityIds: string[];
  startTime: string;
  endTime?: string;
  includeAttributes?: boolean;
  significantChangesOnly?: boolean;
  signal?: AbortSignal;
}

export interface PlatformEntityHistoryPoint {
  state: string;
  changedAt: string;
  updatedAt?: string;
  attributes?: Record<string, unknown>;
  /** A retained initial state supplied at the requested range boundary. */
  atStart?: boolean;
}

export interface PlatformEntityHistorySeries {
  entityId: string;
  points: PlatformEntityHistoryPoint[];
}

export interface PlatformActivityRequest {
  entityIds: string[];
  startTime: string;
  endTime: string;
  signal?: AbortSignal;
}

export interface PlatformActivityEntry {
  entityId: string;
  timestamp: string;
  state?: string;
  name?: string;
  message?: string;
  context?: {
    name?: string;
    message?: string;
    service?: string;
    source?: string;
    userId?: string;
  };
}

export type PlatformStatisticsPeriod = '5minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

export type PlatformStatisticsType = 'change' | 'max' | 'mean' | 'min' | 'state' | 'sum';

export interface PlatformStatisticsHistoryRequest {
  entityIds: string[];
  startTime: string;
  endTime?: string;
  period: PlatformStatisticsPeriod;
  types: PlatformStatisticsType[];
  /** Target units keyed by measurement category (for example, energy: 'kWh'). */
  units?: Record<string, string>;
}

export interface PlatformStatisticsHistoryPoint {
  startMs: number;
  endMs: number;
  change?: number;
  max?: number;
  mean?: number;
  min?: number;
  state?: number;
  sum?: number;
}

export type PlatformStatisticsHistorySeries = Record<string, PlatformStatisticsHistoryPoint[]>;

export interface PlatformEntityRegistryEntry {
  entityId: string;
  deviceId?: string | null;
  deviceName?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  areaId?: string | null;
  name?: string | null;
  platform?: string | null;
}

export interface PlatformFeatureRequestOptions {
  messageClient?: PlatformMessageClient | null;
}

export interface PlatformTaskEntityState {
  entityId: string;
  state: string;
  name?: string;
  attributes: Record<string, unknown>;
}

export type PlatformTaskEntityMap = Record<string, PlatformTaskEntityState>;

export interface PlatformTaskRoomReference {
  id: string;
  name: string;
}

export interface PlatformTaskDeviceReference {
  id: string;
  roomId?: string | null;
}

export interface PlatformTaskEntityReference {
  entityId: string;
  roomId?: string | null;
  deviceId?: string | null;
  category?: string;
}

export interface PlatformTaskRuntimeSnapshot {
  entities: PlatformTaskEntityMap | null;
  rooms: PlatformTaskRoomReference[];
  devices: PlatformTaskDeviceReference[];
  entityReferences: PlatformTaskEntityReference[];
}

export interface PlatformAutomationDetails {
  config: Record<string, unknown>;
}

export interface PlatformCalendarCapabilities {
  canCreate: boolean;
  available: boolean;
}

/** Dates use YYYY-MM-DD; timed events require an explicit UTC offset. End is exclusive. */
export type PlatformCalendarCreateEvent = {
  title: string;
  description?: string;
  location?: string;
} & (
  | { allDay: true; startDate: string; endDate: string }
  | { allDay: false; startDateTime: string; endDateTime: string }
);

export interface PlatformCalendarRequestOptions extends PlatformFeatureRequestOptions {
  startDateTime?: string;
  endDateTime?: string;
}

export interface PlatformWeatherRequestOptions extends PlatformFeatureRequestOptions {}
export interface PlatformNotificationRequestOptions extends PlatformFeatureRequestOptions {}

export interface PlatformRoomReference {
  id: string;
  name: string;
  providerId: IntegrationProviderId;
}

export interface ProviderRoomManagementCapabilities {
  providerId: IntegrationProviderId;
  discover: boolean;
  create: boolean;
  rename: boolean;
  assign: boolean;
  unassign: boolean;
  delete: boolean;
}

export type ProviderRoomManagementCapability = Exclude<
  keyof ProviderRoomManagementCapabilities,
  'providerId'
>;

export interface PlatformManageableRoomReference extends PlatformRoomReference {
  canAssign: boolean;
  canDelete: boolean;
  canOrder: boolean;
  roomManagementCapabilities?: ProviderRoomManagementCapabilities;
}

export type PlatformRoomMutationOperation = Exclude<ProviderRoomManagementCapability, 'discover'>;

interface PlatformRoomMutationStepBase {
  stepId: string;
  dependsOn?: string[];
}

export interface PlatformCreateRoomMutationStep extends PlatformRoomMutationStepBase {
  operation: 'create';
  name: string;
}

export interface PlatformRenameRoomMutationStep extends PlatformRoomMutationStepBase {
  operation: 'rename';
  roomId: string;
  name: string;
}

export interface PlatformAssignRoomMutationStep extends PlatformRoomMutationStepBase {
  operation: 'assign';
  entityId: string;
  roomId: string;
}

export interface PlatformUnassignRoomMutationStep extends PlatformRoomMutationStepBase {
  operation: 'unassign';
  entityId: string;
}

export interface PlatformDeleteRoomMutationStep extends PlatformRoomMutationStepBase {
  operation: 'delete';
  roomId: string;
}

export type PlatformRoomMutationStep =
  | PlatformCreateRoomMutationStep
  | PlatformRenameRoomMutationStep
  | PlatformAssignRoomMutationStep
  | PlatformUnassignRoomMutationStep
  | PlatformDeleteRoomMutationStep;

export interface PlatformRoomMutationPlan {
  providerId: IntegrationProviderId;
  steps: PlatformRoomMutationStep[];
}

export type PlatformRoomMutationFailureReason =
  | 'unsupported'
  | 'invalid_reference'
  | 'provider_unavailable'
  | 'provider_rejected'
  | 'dependency_failed';

export interface PlatformRoomMutationStepSuccess {
  stepId: string;
  operation: PlatformRoomMutationOperation;
  room?: PlatformRoomReference;
}

export interface PlatformRoomMutationStepFailure {
  stepId: string;
  operation: PlatformRoomMutationOperation;
  reason: PlatformRoomMutationFailureReason;
  entityId?: string;
  roomId?: string;
  failedDependencyStepIds?: string[];
}

export interface PlatformRoomMutationResult {
  providerId: IntegrationProviderId;
  status: 'succeeded' | 'partially_succeeded' | 'failed';
  successes: PlatformRoomMutationStepSuccess[];
  failures: PlatformRoomMutationStepFailure[];
}

export interface PlatformPersistentNotification {
  notification_id?: string;
  title?: string;
  message?: string;
  created_at?: string;
  status?: string;
}

export interface PlatformRepairIssue {
  issue_id?: string;
  domain?: string;
  issue_domain?: string;
  translation_key?: string;
  severity?: string;
  breaks_in_ha_version?: string;
  learn_more_url?: string;
  title?: string;
  description?: string;
}

export interface PlatformPersistentNotificationEvent {
  update_type?: 'added' | 'removed' | 'updated' | 'current';
  notifications?: PlatformPersistentNotification[];
}

export interface PlatformNotificationSnapshot {
  persistentNotifications: PlatformPersistentNotification[];
  repairIssues: PlatformRepairIssue[];
}

export interface PlatformNotificationDeliveryRequest {
  title: string;
  message: string;
  target?: string;
  data?: Record<string, unknown>;
}

export interface PlatformNotificationDeliveryTarget {
  id: string;
  label: string;
}

export interface PlatformUpdateNotificationCandidate {
  entityId: string;
  state: string;
  friendlyName?: string;
  installedVersion?: string | null;
  latestVersion?: string | null;
  releaseSummary?: string | null;
  releaseNotes?: string | null;
  detailsUrl?: string | null;
  progress?: number | null;
  inProgress: boolean;
  requiresRestart?: boolean;
  lastChanged?: string;
  lastUpdated?: string;
}

export interface PlatformHistoryClientAccess {
  messageClient: PlatformMessageClient | null;
}

export interface PlatformNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  notificationId: string;
  source: 'persistent_notification' | 'update' | 'repair';
  isBusy?: boolean;
  progress?: number | null;
  statusLabel?: string;
  requiresRestart?: boolean;
  installedVersion?: string | null;
  latestVersion?: string | null;
  detailsUrl?: string | null;
}

export type PlatformCameraSourceKind = 'snapshot' | 'hls' | 'mse' | 'web_rtc' | 'mjpeg';
export type PlatformCameraTransport = 'hls' | 'mse' | 'web_rtc' | 'mjpeg';
export type PlatformCameraState = 'unavailable' | 'off' | 'idle' | 'streaming' | 'recording';

export interface PlatformCameraPresentation {
  sourceUrl?: string;
  sourceKind: PlatformCameraSourceKind;
  isFallback: boolean;
  videoStreamKind: Extract<PlatformCameraSourceKind, 'hls' | 'mse' | 'web_rtc' | 'mjpeg'> | null;
  supportsStreaming: boolean;
  availableStreamTypes: string[];
}

export interface CameraPlaybackPlan {
  primary: ResolvedPlatformResource;
  fallbacks: ResolvedPlatformResource[];
  refreshPolicy: {
    snapshotRefreshMs?: number;
    retryDelaysMs: number[];
  };
}

export interface PlatformCameraPlaybackModel {
  cameraState: PlatformCameraState;
  snapshotResource: ResolvedPlatformResource | null;
  supportsSnapshot: boolean;
  /** Provider transports available before user preference and runtime failure filtering. */
  supportedTransports?: PlatformCameraTransport[];
  liveTransports: PlatformCameraTransport[];
  fallbackTransports: PlatformCameraTransport[];
  selectedTransport: PlatformCameraTransport | null;
  selectedStreamResource: ResolvedPlatformResource | null;
  supportsStreaming: boolean;
  isSnapshotFallback: boolean;
  shouldStartWithSnapshot: boolean;
  motionDetectionEnabled: boolean | null;
  refreshPolicy: {
    snapshotRefreshMs?: number;
    capabilitiesRefreshMs?: number;
    retryDelaysMs: number[];
  };
}

export interface PlatformEnergySourceOption {
  id: string;
  name: string;
  currentPowerW: number;
  todayUsageKWh: number;
  trendEntityId?: string;
  group: 'home' | 'sources' | 'devices';
}

export interface PlatformEnergyNowSnapshot {
  isConnected: boolean;
  isConfigured: boolean;
  currentLoadStatisticId?: string;
  todayTotalUsageKWh: number;
  currentLoadW: number;
  solarW: number;
  solarTodayKWh: number;
  importW: number;
  importTodayKWh: number;
  sourceOptions: PlatformEnergySourceOption[];
}

export type PlatformEnergySourceDiagnosticStatus =
  | 'not_configured'
  | 'configured_idle'
  | 'configured_unavailable'
  | 'configured_numeric';

export interface PlatformEnergySourceDiagnostic {
  id: string;
  label: string;
  entityId?: string;
  liveEntityId?: string;
  status: PlatformEnergySourceDiagnosticStatus;
}

export interface PlatformEnergySnapshot extends PlatformEnergyNowSnapshot {
  hasLoaded: boolean;
  sourceDiagnostics: PlatformEnergySourceDiagnostic[];
}

export interface PlatformEnergyEntityLike {
  state: string;
  attributes?: Record<string, unknown>;
}

export type PlatformEnergyEntityMap = Record<string, PlatformEnergyEntityLike>;

export interface PlatformEnergyEntityRegistryEntry {
  entityId: string;
  deviceId?: string | null;
}
