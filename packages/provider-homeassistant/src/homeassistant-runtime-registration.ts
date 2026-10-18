import { createProviderRoomManagementCapabilities } from '@navet/core/provider-room-management';
import type {
  IntegrationProviderRuntimeRegistration,
  ProviderContractRegistration,
} from '@navet/core/provider-runtime-types';
import { lazyHomeAssistantAdminFeatureService } from './homeassistant-admin-feature.service.lazy';
import { homeAssistantCalendarFeatureService } from './homeassistant-calendar-feature.service';
import { homeAssistantCameraFeatureService } from './homeassistant-camera-feature.service';
import { lazyHomeAssistantChoreProjectionFeatureService } from './homeassistant-chore-projection-feature.service.lazy';
import { homeAssistantClimateFeatureService } from './homeassistant-climate-feature.service';
import { lazyHomeAssistantConversationFeatureService } from './homeassistant-conversation-feature.service.lazy';
import { homeAssistantEnergyFeatureService } from './homeassistant-energy-feature.service';
import { homeAssistantEntityRuntimeService } from './homeassistant-entity-runtime.service';
import { lazyHomeAssistantHistoryFeatureService } from './homeassistant-history-feature.service.lazy';
import { homeAssistantLightFeatureService } from './homeassistant-light-feature.service';
import { homeAssistantMapFeatureService } from './homeassistant-map-feature.service';
import { homeAssistantMediaFeatureService } from './homeassistant-media-feature.service';
import { homeAssistantNativeActionFeatureService } from './homeassistant-native-action-feature.service';
import { lazyHomeAssistantNotificationFeatureService } from './homeassistant-notification-feature.service.lazy';
import { homeAssistantSecurityFeatureService } from './homeassistant-security-feature.service';
import {
  getHomeAssistantCameraStreamUrl,
  signHomeAssistantPath,
} from './homeassistant-service-bridge';
import { homeAssistantTaskFeatureService } from './homeassistant-task-feature.service';
import { lazyHomeAssistantTodoListFeatureService } from './homeassistant-todo-feature.service.lazy';
import { homeAssistantWeatherFeatureService } from './homeassistant-weather-feature.service';

export const homeAssistantRoomManagementCapabilities = createProviderRoomManagementCapabilities(
  'home_assistant',
  {
    discover: true,
    create: true,
    rename: true,
    assign: true,
    unassign: true,
    delete: true,
  }
);

export function createHomeAssistantRuntimeRegistration(
  registration: ProviderContractRegistration
): IntegrationProviderRuntimeRegistration {
  return {
    providerContractAdapter: registration.providerContractAdapter,
    contract: registration.contract,
    implementationStatus: 'implemented',
    capabilities: {
      pathSigning: true,
      cameraStreams: true,
    },
    featureMatrix: {
      rooms: true,
      lighting: true,
      sensors: true,
      climate: true,
      mediaControls: true,
      mediaBrowse: true,
      mediaArtwork: true,
      cameraSnapshot: true,
      cameraStreams: true,
      energyNow: true,
      calendar: true,
      weather: true,
      notifications: true,
      tasks: true,
      conversation: true,
    },
    roomManagementCapabilities: homeAssistantRoomManagementCapabilities,
    signPath: async (path, expiresSeconds) => {
      const signed = await signHomeAssistantPath(path, expiresSeconds);
      return signed.path;
    },
    getCameraStream: async (entityId, format) => {
      if (format === 'mjpeg') {
        throw new Error('Home Assistant MJPEG streams are resolved via camera stream paths');
      }

      return await getHomeAssistantCameraStreamUrl(entityId, format);
    },
    adminFeatureService: lazyHomeAssistantAdminFeatureService,
    calendarFeatureService: homeAssistantCalendarFeatureService,
    choreProjectionFeatureService: lazyHomeAssistantChoreProjectionFeatureService,
    cameraFeatureService: homeAssistantCameraFeatureService,
    climateFeatureService: homeAssistantClimateFeatureService,
    conversationFeatureService: lazyHomeAssistantConversationFeatureService,
    energyFeatureService: homeAssistantEnergyFeatureService,
    entityRuntimeService: homeAssistantEntityRuntimeService,
    historyFeatureService: lazyHomeAssistantHistoryFeatureService,
    mapFeatureService: homeAssistantMapFeatureService,
    lightFeatureService: homeAssistantLightFeatureService,
    mediaFeatureService: homeAssistantMediaFeatureService,
    nativeActionFeatureService: homeAssistantNativeActionFeatureService,
    notificationFeatureService: lazyHomeAssistantNotificationFeatureService,
    securityFeatureService: homeAssistantSecurityFeatureService,
    taskFeatureService: homeAssistantTaskFeatureService,
    todoListFeatureService: lazyHomeAssistantTodoListFeatureService,
    weatherFeatureService: homeAssistantWeatherFeatureService,
  };
}
