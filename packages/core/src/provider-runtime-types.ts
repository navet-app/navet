import type { NavetProviderContract, SmartHomeProviderAdapter } from './provider-contract';
import type {
  PlatformCameraStream,
  PlatformCameraStreamType,
  ProviderRoomManagementCapabilities,
} from './provider-feature-models';
import type {
  ProviderAdminFeatureService,
  ProviderCalendarFeatureService,
  ProviderCameraFeatureService,
  ProviderChoreProjectionFeatureService,
  ProviderClimateFeatureService,
  ProviderConversationFeatureService,
  ProviderEnergyFeatureService,
  ProviderEntityRuntimeService,
  ProviderHistoryFeatureService,
  ProviderLightFeatureService,
  ProviderMapFeatureService,
  ProviderMediaFeatureService,
  ProviderNativeActionFeatureService,
  ProviderNotificationFeatureService,
  ProviderSecurityFeatureService,
  ProviderTaskFeatureService,
  ProviderTodoListFeatureService,
  ProviderWeatherFeatureService,
} from './provider-feature-services';
import type { ProviderHubFeatureService } from './provider-hub';

export interface ProviderContractRegistration {
  contract: NavetProviderContract;
  providerContractAdapter: SmartHomeProviderAdapter;
}

export interface ProviderPackageRegistration extends ProviderContractRegistration {
  runtimeRegistration: IntegrationProviderRuntimeRegistration;
}

export interface IntegrationProviderCapabilities {
  pathSigning: boolean;
  cameraStreams: boolean;
}

export type IntegrationProviderCapability = keyof IntegrationProviderCapabilities;

export interface IntegrationProviderFeatureMatrix {
  rooms: boolean;
  lighting: boolean;
  sensors: boolean;
  climate: boolean;
  mediaControls: boolean;
  mediaBrowse: boolean;
  mediaArtwork: boolean;
  cameraSnapshot: boolean;
  cameraStreams: boolean;
  energyNow: boolean;
  calendar: boolean;
  weather: boolean;
  notifications: boolean;
  tasks: boolean;
  conversation: boolean;
}

export type IntegrationProviderFeature = keyof IntegrationProviderFeatureMatrix;

export type IntegrationProviderImplementationStatus = 'implemented' | 'planned';

export interface IntegrationProviderRuntimeRegistration {
  providerContractAdapter: SmartHomeProviderAdapter;
  contract: NavetProviderContract;
  implementationStatus: IntegrationProviderImplementationStatus;
  capabilities: IntegrationProviderCapabilities;
  featureMatrix: IntegrationProviderFeatureMatrix;
  roomManagementCapabilities?: ProviderRoomManagementCapabilities;
  signPath?: (path: string, expiresSeconds?: number) => Promise<string>;
  getCameraStream?: (
    entityId: string,
    format: PlatformCameraStreamType
  ) => Promise<PlatformCameraStream>;
  adminFeatureService?: ProviderAdminFeatureService;
  calendarFeatureService?: ProviderCalendarFeatureService;
  choreProjectionFeatureService?: ProviderChoreProjectionFeatureService;
  cameraFeatureService?: ProviderCameraFeatureService;
  climateFeatureService?: ProviderClimateFeatureService;
  conversationFeatureService?: ProviderConversationFeatureService;
  energyFeatureService?: ProviderEnergyFeatureService;
  entityRuntimeService?: ProviderEntityRuntimeService;
  historyFeatureService?: ProviderHistoryFeatureService;
  mapFeatureService?: ProviderMapFeatureService;
  hubFeatureService?: ProviderHubFeatureService;
  lightFeatureService?: ProviderLightFeatureService;
  mediaFeatureService?: ProviderMediaFeatureService;
  nativeActionFeatureService?: ProviderNativeActionFeatureService;
  notificationFeatureService?: ProviderNotificationFeatureService;
  securityFeatureService?: ProviderSecurityFeatureService;
  taskFeatureService?: ProviderTaskFeatureService;
  todoListFeatureService?: ProviderTodoListFeatureService;
  weatherFeatureService?: ProviderWeatherFeatureService;
}
