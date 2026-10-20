import { STORE_STORAGE_KEYS } from '@navet/app/constants/storage-keys';
import { type AppLanguage, getNavigatorLanguage } from '@navet/app/i18n/config';
import type { PlatformCameraTransport } from '@navet/app/platform/provider-feature-models';
import {
  type CustomSidebarAction,
  type CustomSummaryPill,
  normalizeCustomSidebarActions,
  normalizeCustomSummaryPills,
} from '@navet/app/utils/custom-extensions';
import { detectDeviceTier } from '@navet/app/utils/detect-device-tier';
import {
  readLocalStorageWithMigration,
  removeLocalStorageWithMigration,
  writeLocalStorageWithMigration,
} from '@navet/app/utils/local-storage-migration';
import {
  ensureCanonicalEntityId,
  normalizePersistedEntityRecord,
} from '@navet/app/utils/provider-entity-id';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type EntityInteractionMode = 'control-first' | 'toggle-first';
export type EffectsQuality = 'high' | 'medium' | 'low';
export type HeaderTitleMode = 'auto_greeting' | 'custom_text' | 'clock';
export type DashboardSpaceMode = 'default' | 'more_space';
export type DashboardProfileMode = 'standard' | 'wall_display' | 'bedside' | 'custom';
export const HEADER_CUSTOM_TEXT_MAX_LENGTH = 40;
export type CameraViewMode = 'live' | 'auto' | 'snapshot';
export type CameraDashboardViewMode = CameraViewMode;
export type CameraStreamPreference = 'auto' | PlatformCameraTransport;
export type CameraWebRtcStreamSource = 'provider' | 'direct';
export type CoverControlMode = 'simple' | 'position';
export type CameraFitMode = 'cover' | 'contain';
export type WeatherForecastMode = 'weekly' | 'hourly';
export type WeatherMetricId =
  | 'precipitation'
  | 'humidity'
  | 'wind'
  | 'feelsLike'
  | 'windGust'
  | 'pressure'
  | 'uvIndex'
  | 'cloudCover';

export interface UserSettings {
  username: string;
  email: string;
  language: AppLanguage;
  headerTitleMode: HeaderTitleMode;
  headerCustomText: string;
  showNotifications: boolean;
  showWeatherInHeader: boolean;
  showHomeSummaryBar: boolean;
  choresEnabled: boolean;
  keepDeviceAwake: boolean;
  use24HourTime: boolean;
  temperatureUnit: 'celsius' | 'fahrenheit';
  defaultView: 'all' | string;
  compactMode: boolean;
  companionEnabled: boolean;
  companionCollapsed: boolean;
  kioskMode: boolean;
  kioskSwipeRooms: boolean;
  dashboardProfileMode: DashboardProfileMode;
  dashboardSpaceMode: DashboardSpaceMode;
  disableAnimations: boolean;
  preventBrowserZoom: boolean;
  lowPowerMode: boolean;
  effectsQuality: EffectsQuality;
  effectsQualityUserOverride: boolean;
  entityInteractionMode: EntityInteractionMode;
  cameraDashboardViewMode: CameraDashboardViewMode;
  cameraViewMode: CameraViewMode;
  cameraViewModes: Record<string, CameraViewMode>;
  cameraStreamPreference: CameraStreamPreference;
  cameraStreamPreferences: Record<string, CameraStreamPreference>;
  cameraWebRtcStreamSources: Record<string, CameraWebRtcStreamSource>;
  cameraDirectStreamUrls: Record<string, string>;
  cameraFitMode: CameraFitMode;
  cameraFitModes: Record<string, CameraFitMode>;
  coverControlModes: Record<string, CoverControlMode>;
  cameraFullscreenHiddenAccessoryIds: Record<string, string[]>;
  cameraFullscreenVisibleAccessoryIds: Record<string, string[]>;
  ambientLightBleed: boolean;
  weatherForecastMode: WeatherForecastMode;
  weatherMetricIds: WeatherMetricId[];
  advancedCustomizationEnabled: boolean;
  customSidebarActions: CustomSidebarAction[];
  customSummaryPills: CustomSummaryPill[];
}

export interface SettingsState extends UserSettings {
  updateSettings: (settings: Partial<UserSettings>) => void;
  updateCameraViewMode: (entityId: string, mode: CameraViewMode) => void;
  updateCameraStreamPreference: (entityId: string, preference: CameraStreamPreference) => void;
  updateCameraWebRtcStreamSource: (entityId: string, source: CameraWebRtcStreamSource) => void;
  updateCameraDirectStreamUrl: (entityId: string, url: string) => void;
  updateCameraFitMode: (entityId: string, mode: CameraFitMode) => void;
  updateCoverControlMode: (entityId: string, mode: CoverControlMode) => void;
  updateCameraFullscreenAccessoryVisibility: (
    cameraEntityId: string,
    accessoryEntityId: string,
    visible: boolean
  ) => void;
  applyImportedSettings: (settings: UserSettings) => void;
  resetSettings: () => void;
}

export const defaultSettings: UserSettings = {
  username: 'User',
  email: '',
  language: getNavigatorLanguage(),
  headerTitleMode: 'auto_greeting',
  headerCustomText: '',
  showNotifications: true,
  showWeatherInHeader: true,
  showHomeSummaryBar: true,
  choresEnabled: true,
  keepDeviceAwake: false,
  use24HourTime: false,
  temperatureUnit: 'fahrenheit',
  defaultView: 'all',
  compactMode: false,
  companionEnabled: true,
  companionCollapsed: false,
  kioskMode: false,
  kioskSwipeRooms: false,
  dashboardProfileMode: 'standard',
  dashboardSpaceMode: 'default',
  disableAnimations: false,
  preventBrowserZoom: false,
  lowPowerMode: false,
  effectsQuality: 'high',
  effectsQualityUserOverride: false,
  entityInteractionMode: 'toggle-first',
  cameraDashboardViewMode: 'live',
  cameraViewMode: 'live',
  cameraViewModes: {},
  cameraStreamPreference: 'auto',
  cameraStreamPreferences: {},
  cameraWebRtcStreamSources: {},
  cameraDirectStreamUrls: {},
  cameraFitMode: 'cover',
  cameraFitModes: {},
  coverControlModes: {},
  cameraFullscreenHiddenAccessoryIds: {},
  cameraFullscreenVisibleAccessoryIds: {},
  ambientLightBleed: true,
  weatherForecastMode: 'weekly',
  weatherMetricIds: ['precipitation', 'humidity', 'wind'],
  advancedCustomizationEnabled: false,
  customSidebarActions: [],
  customSummaryPills: [],
};

function isCameraViewMode(value: unknown): value is CameraViewMode {
  return value === 'live' || value === 'auto' || value === 'snapshot';
}

function isEffectsQuality(value: unknown): value is EffectsQuality {
  return value === 'high' || value === 'medium' || value === 'low';
}

function isCameraStreamPreference(value: unknown): value is CameraStreamPreference {
  return (
    value === 'auto' ||
    value === 'web_rtc' ||
    value === 'mse' ||
    value === 'hls' ||
    value === 'mjpeg'
  );
}

function isLegacyDirectStreamPreference(value: unknown) {
  return value === 'direct_stream';
}

function normalizeCameraWebRtcStreamSource(value: unknown): CameraWebRtcStreamSource | null {
  if (value === 'provider' || value === 'direct') {
    return value;
  }

  if (value === 'direct_web_rtc' || value === 'direct_mse') {
    return 'direct';
  }

  return null;
}

export function isDirectCameraStreamSource(source: CameraWebRtcStreamSource) {
  return source === 'direct';
}

function normalizeCoverControlModes(value: unknown): Record<string, CoverControlMode> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return normalizePersistedEntityRecord(
    Object.fromEntries(
      Object.entries(value).filter(([, mode]) => mode === 'simple' || mode === 'position')
    )
  ) as Record<string, CoverControlMode>;
}

function isCameraFitMode(value: unknown): value is CameraFitMode {
  return value === 'cover' || value === 'contain';
}

function isHeaderTitleMode(value: unknown): value is HeaderTitleMode {
  return value === 'auto_greeting' || value === 'custom_text' || value === 'clock';
}

function isDashboardSpaceMode(value: unknown): value is DashboardSpaceMode {
  return value === 'default' || value === 'more_space';
}

function isDashboardProfileMode(value: unknown): value is DashboardProfileMode {
  return (
    value === 'standard' || value === 'wall_display' || value === 'bedside' || value === 'custom'
  );
}

export function normalizeHeaderCustomText(value: unknown): string {
  if (typeof value !== 'string') {
    return defaultSettings.headerCustomText;
  }

  return value.trim().slice(0, HEADER_CUSTOM_TEXT_MAX_LENGTH);
}

function resolveCameraDashboardViewMode(
  value: unknown,
  legacyValue: unknown = undefined
): CameraDashboardViewMode {
  if (isCameraViewMode(value)) {
    return value;
  }

  if (isCameraViewMode(legacyValue)) {
    return legacyValue;
  }

  return defaultSettings.cameraDashboardViewMode;
}

function normalizeCameraViewModes(value: unknown): Record<string, CameraViewMode> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return normalizePersistedEntityRecord(
    Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, CameraViewMode] =>
        isCameraViewMode(entry[1])
      )
    )
  );
}

function normalizeCameraStreamPreferences(value: unknown): Record<string, CameraStreamPreference> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return normalizePersistedEntityRecord(
    Object.fromEntries(
      Object.entries(value)
        .map(([entityId, preference]) => [
          entityId,
          isLegacyDirectStreamPreference(preference) ? 'web_rtc' : preference,
        ])
        .filter((entry): entry is [string, CameraStreamPreference] =>
          isCameraStreamPreference(entry[1])
        )
    )
  );
}

function normalizeCameraWebRtcStreamSources(
  value: unknown,
  legacyPreferences: unknown = undefined
): Record<string, CameraWebRtcStreamSource> {
  const normalizedSources =
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).flatMap(([entityId, source]) => {
            const normalizedSource = normalizeCameraWebRtcStreamSource(source);
            return normalizedSource ? ([[entityId, normalizedSource]] as const) : [];
          })
        )
      : {};

  if (
    !legacyPreferences ||
    typeof legacyPreferences !== 'object' ||
    Array.isArray(legacyPreferences)
  ) {
    return normalizePersistedEntityRecord(normalizedSources);
  }

  const legacyDirectSources = Object.fromEntries(
    Object.entries(legacyPreferences)
      .filter(([, preference]) => isLegacyDirectStreamPreference(preference))
      .map(([entityId]) => [entityId, 'direct' as const])
  );

  return normalizePersistedEntityRecord({ ...legacyDirectSources, ...normalizedSources });
}

function normalizeCameraDirectStreamUrls(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return normalizePersistedEntityRecord(
    Object.fromEntries(
      Object.entries(value)
        .map(([entityId, url]) => [entityId, typeof url === 'string' ? url.trim() : ''] as const)
        .filter((entry): entry is [string, string] => entry[1].length > 0)
    )
  );
}

function normalizeCameraFitModes(value: unknown): Record<string, CameraFitMode> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return normalizePersistedEntityRecord(
    Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, CameraFitMode] =>
        isCameraFitMode(entry[1])
      )
    )
  );
}

function normalizeCameraFullscreenHiddenAccessoryIds(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return normalizePersistedEntityRecord(
    Object.fromEntries(
      Object.entries(value).flatMap(([cameraEntityId, accessoryIds]) => {
        if (!Array.isArray(accessoryIds)) return [];
        const normalizedIds = Array.from(
          new Set(
            accessoryIds
              .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
              .map((entry) => ensureCanonicalEntityId(entry))
          )
        );
        return normalizedIds.length > 0 ? [[cameraEntityId, normalizedIds]] : [];
      })
    )
  );
}

const normalizeCameraFullscreenVisibleAccessoryIds = normalizeCameraFullscreenHiddenAccessoryIds;

const knownSettingsKeys = new Set<keyof UserSettings>(
  Object.keys(defaultSettings) as Array<keyof UserSettings>
);

function pickKnownSettings(value: unknown): Partial<UserSettings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(([key]) => knownSettingsKeys.has(key as keyof UserSettings))
  ) as Partial<UserSettings>;
}

function getInitialEffectsQuality(): EffectsQuality {
  return detectDeviceTier();
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      effectsQuality: getInitialEffectsQuality(),
      updateSettings: (newSettings) =>
        set((state) => ({
          ...state,
          ...newSettings,
          headerTitleMode:
            newSettings.headerTitleMode !== undefined &&
            isHeaderTitleMode(newSettings.headerTitleMode)
              ? newSettings.headerTitleMode
              : state.headerTitleMode,
          headerCustomText:
            newSettings.headerCustomText !== undefined
              ? normalizeHeaderCustomText(newSettings.headerCustomText)
              : state.headerCustomText,
          dashboardSpaceMode:
            newSettings.dashboardSpaceMode !== undefined &&
            isDashboardSpaceMode(newSettings.dashboardSpaceMode)
              ? newSettings.dashboardSpaceMode
              : state.dashboardSpaceMode,
          dashboardProfileMode:
            newSettings.dashboardProfileMode !== undefined &&
            isDashboardProfileMode(newSettings.dashboardProfileMode)
              ? newSettings.dashboardProfileMode
              : state.dashboardProfileMode,
          cameraDashboardViewMode:
            newSettings.cameraDashboardViewMode !== undefined
              ? resolveCameraDashboardViewMode(newSettings.cameraDashboardViewMode)
              : state.cameraDashboardViewMode,
          cameraViewMode:
            newSettings.cameraDashboardViewMode !== undefined
              ? resolveCameraDashboardViewMode(newSettings.cameraDashboardViewMode)
              : newSettings.cameraViewMode !== undefined
                ? resolveCameraDashboardViewMode(newSettings.cameraViewMode)
                : state.cameraViewMode,
          cameraStreamPreference:
            newSettings.cameraStreamPreference !== undefined &&
            isCameraStreamPreference(newSettings.cameraStreamPreference)
              ? newSettings.cameraStreamPreference
              : state.cameraStreamPreference,
          cameraViewModes:
            newSettings.cameraViewModes !== undefined
              ? normalizeCameraViewModes(newSettings.cameraViewModes)
              : state.cameraViewModes,
          cameraStreamPreferences:
            newSettings.cameraStreamPreferences !== undefined
              ? normalizeCameraStreamPreferences(newSettings.cameraStreamPreferences)
              : state.cameraStreamPreferences,
          cameraWebRtcStreamSources:
            newSettings.cameraWebRtcStreamSources !== undefined
              ? normalizeCameraWebRtcStreamSources(newSettings.cameraWebRtcStreamSources)
              : state.cameraWebRtcStreamSources,
          cameraDirectStreamUrls:
            newSettings.cameraDirectStreamUrls !== undefined
              ? normalizeCameraDirectStreamUrls(newSettings.cameraDirectStreamUrls)
              : state.cameraDirectStreamUrls,
          cameraFitMode:
            newSettings.cameraFitMode !== undefined && isCameraFitMode(newSettings.cameraFitMode)
              ? newSettings.cameraFitMode
              : state.cameraFitMode,
          coverControlModes:
            newSettings.coverControlModes !== undefined
              ? normalizeCoverControlModes(newSettings.coverControlModes)
              : state.coverControlModes,
          cameraFitModes:
            newSettings.cameraFitModes !== undefined
              ? normalizeCameraFitModes(newSettings.cameraFitModes)
              : state.cameraFitModes,
          cameraFullscreenHiddenAccessoryIds:
            newSettings.cameraFullscreenHiddenAccessoryIds !== undefined
              ? normalizeCameraFullscreenHiddenAccessoryIds(
                  newSettings.cameraFullscreenHiddenAccessoryIds
                )
              : state.cameraFullscreenHiddenAccessoryIds,
          cameraFullscreenVisibleAccessoryIds:
            newSettings.cameraFullscreenVisibleAccessoryIds !== undefined
              ? normalizeCameraFullscreenVisibleAccessoryIds(
                  newSettings.cameraFullscreenVisibleAccessoryIds
                )
              : state.cameraFullscreenVisibleAccessoryIds,
          customSidebarActions:
            newSettings.customSidebarActions !== undefined
              ? normalizeCustomSidebarActions(newSettings.customSidebarActions)
              : state.customSidebarActions,
          customSummaryPills:
            newSettings.customSummaryPills !== undefined
              ? normalizeCustomSummaryPills(newSettings.customSummaryPills)
              : state.customSummaryPills,
        })),
      updateCameraViewMode: (entityId, mode) =>
        set((state) => ({
          cameraViewModes: {
            ...state.cameraViewModes,
            [ensureCanonicalEntityId(entityId)]: mode,
          },
        })),
      updateCameraStreamPreference: (entityId, preference) =>
        set((state) => ({
          cameraStreamPreferences: {
            ...state.cameraStreamPreferences,
            [ensureCanonicalEntityId(entityId)]: preference,
          },
        })),
      updateCameraWebRtcStreamSource: (entityId, source) =>
        set((state) => {
          const canonicalEntityId = ensureCanonicalEntityId(entityId);
          const nextSources = { ...state.cameraWebRtcStreamSources };
          if (source === 'provider') {
            delete nextSources[canonicalEntityId];
          } else {
            nextSources[canonicalEntityId] = source;
          }
          return { cameraWebRtcStreamSources: nextSources };
        }),
      updateCameraDirectStreamUrl: (entityId, url) =>
        set((state) => {
          const canonicalEntityId = ensureCanonicalEntityId(entityId);
          const nextUrls = { ...state.cameraDirectStreamUrls };
          const normalizedUrl = url.trim();
          if (normalizedUrl) {
            nextUrls[canonicalEntityId] = normalizedUrl;
          } else {
            delete nextUrls[canonicalEntityId];
          }
          return { cameraDirectStreamUrls: nextUrls };
        }),
      updateCoverControlMode: (entityId, mode) =>
        set((state) => ({
          coverControlModes: {
            ...state.coverControlModes,
            [ensureCanonicalEntityId(entityId)]: mode,
          },
        })),
      updateCameraFitMode: (entityId, mode) =>
        set((state) => ({
          cameraFitModes: {
            ...state.cameraFitModes,
            [ensureCanonicalEntityId(entityId)]: mode,
          },
        })),
      updateCameraFullscreenAccessoryVisibility: (cameraEntityId, accessoryEntityId, visible) =>
        set((state) => {
          const cameraId = ensureCanonicalEntityId(cameraEntityId);
          const accessoryId = ensureCanonicalEntityId(accessoryEntityId);
          const currentVisibleIds = state.cameraFullscreenVisibleAccessoryIds[cameraId] ?? [];
          const nextVisibleIds = visible
            ? Array.from(new Set([...currentVisibleIds, accessoryId]))
            : currentVisibleIds.filter((id) => id !== accessoryId);
          const nextByCamera = { ...state.cameraFullscreenVisibleAccessoryIds };
          if (nextVisibleIds.length > 0) {
            nextByCamera[cameraId] = nextVisibleIds;
          } else {
            delete nextByCamera[cameraId];
          }
          return { cameraFullscreenVisibleAccessoryIds: nextByCamera };
        }),
      applyImportedSettings: (importedSettings) => {
        const supportedSettings = pickKnownSettings(importedSettings);
        return set(() => ({
          ...defaultSettings,
          ...supportedSettings,
          preventBrowserZoom: supportedSettings.preventBrowserZoom === true,
          headerTitleMode: isHeaderTitleMode(supportedSettings.headerTitleMode)
            ? supportedSettings.headerTitleMode
            : defaultSettings.headerTitleMode,
          headerCustomText: normalizeHeaderCustomText(supportedSettings.headerCustomText),
          dashboardSpaceMode: isDashboardSpaceMode(supportedSettings.dashboardSpaceMode)
            ? supportedSettings.dashboardSpaceMode
            : defaultSettings.dashboardSpaceMode,
          dashboardProfileMode: isDashboardProfileMode(supportedSettings.dashboardProfileMode)
            ? supportedSettings.dashboardProfileMode
            : defaultSettings.dashboardProfileMode,
          cameraDashboardViewMode: resolveCameraDashboardViewMode(
            supportedSettings.cameraDashboardViewMode,
            supportedSettings.cameraViewMode
          ),
          cameraViewMode: isCameraViewMode(supportedSettings.cameraViewMode)
            ? supportedSettings.cameraViewMode
            : resolveCameraDashboardViewMode(supportedSettings.cameraDashboardViewMode),
          cameraViewModes: normalizeCameraViewModes(supportedSettings.cameraViewModes),
          cameraStreamPreference: isCameraStreamPreference(supportedSettings.cameraStreamPreference)
            ? supportedSettings.cameraStreamPreference
            : defaultSettings.cameraStreamPreference,
          cameraStreamPreferences: normalizeCameraStreamPreferences(
            supportedSettings.cameraStreamPreferences
          ),
          cameraWebRtcStreamSources: normalizeCameraWebRtcStreamSources(
            supportedSettings.cameraWebRtcStreamSources,
            supportedSettings.cameraStreamPreferences
          ),
          cameraDirectStreamUrls: normalizeCameraDirectStreamUrls(
            supportedSettings.cameraDirectStreamUrls
          ),
          cameraFitMode: isCameraFitMode(supportedSettings.cameraFitMode)
            ? supportedSettings.cameraFitMode
            : defaultSettings.cameraFitMode,
          cameraFitModes: normalizeCameraFitModes(supportedSettings.cameraFitModes),
          coverControlModes: normalizeCoverControlModes(supportedSettings.coverControlModes),
          cameraFullscreenHiddenAccessoryIds: normalizeCameraFullscreenHiddenAccessoryIds(
            supportedSettings.cameraFullscreenHiddenAccessoryIds
          ),
          cameraFullscreenVisibleAccessoryIds: normalizeCameraFullscreenVisibleAccessoryIds(
            supportedSettings.cameraFullscreenVisibleAccessoryIds
          ),
          customSidebarActions: normalizeCustomSidebarActions(
            supportedSettings.customSidebarActions
          ),
          customSummaryPills: normalizeCustomSummaryPills(supportedSettings.customSummaryPills),
        }));
      },
      resetSettings: () =>
        set({
          ...defaultSettings,
          effectsQuality: detectDeviceTier(),
          effectsQualityUserOverride: false,
        }),
    }),
    {
      name: STORE_STORAGE_KEYS.settings,
      storage: createJSONStorage(() => ({
        getItem: (name) => readLocalStorageWithMigration(name, localStorage),
        setItem: (name, value) => writeLocalStorageWithMigration(name, value, localStorage),
        removeItem: (name) => removeLocalStorageWithMigration(name, localStorage),
      })),
      merge: (persisted, current) => {
        const next = pickKnownSettings(persisted);
        const effectsQualityUserOverride =
          next.effectsQualityUserOverride === true ||
          (next.effectsQualityUserOverride === undefined &&
            isEffectsQuality(next.effectsQuality) &&
            next.effectsQuality !== 'high');
        return {
          ...current,
          ...next,
          preventBrowserZoom: next.preventBrowserZoom === true,
          effectsQuality:
            effectsQualityUserOverride && isEffectsQuality(next.effectsQuality)
              ? next.effectsQuality
              : detectDeviceTier(),
          effectsQualityUserOverride,
          headerTitleMode: isHeaderTitleMode(next.headerTitleMode)
            ? next.headerTitleMode
            : current.headerTitleMode,
          headerCustomText: normalizeHeaderCustomText(next.headerCustomText),
          dashboardSpaceMode: isDashboardSpaceMode(next.dashboardSpaceMode)
            ? next.dashboardSpaceMode
            : current.dashboardSpaceMode,
          dashboardProfileMode: isDashboardProfileMode(next.dashboardProfileMode)
            ? next.dashboardProfileMode
            : current.dashboardProfileMode,
          cameraDashboardViewMode: resolveCameraDashboardViewMode(
            next.cameraDashboardViewMode,
            next.cameraViewMode
          ),
          cameraViewMode: isCameraViewMode(next.cameraViewMode)
            ? next.cameraViewMode
            : resolveCameraDashboardViewMode(next.cameraDashboardViewMode, current.cameraViewMode),
          cameraViewModes: normalizeCameraViewModes(next.cameraViewModes),
          cameraStreamPreference: isCameraStreamPreference(next.cameraStreamPreference)
            ? next.cameraStreamPreference
            : current.cameraStreamPreference,
          cameraStreamPreferences: normalizeCameraStreamPreferences(next.cameraStreamPreferences),
          cameraWebRtcStreamSources: normalizeCameraWebRtcStreamSources(
            next.cameraWebRtcStreamSources,
            next.cameraStreamPreferences
          ),
          cameraDirectStreamUrls: normalizeCameraDirectStreamUrls(next.cameraDirectStreamUrls),
          cameraFitMode: isCameraFitMode(next.cameraFitMode)
            ? next.cameraFitMode
            : current.cameraFitMode,
          cameraFitModes: normalizeCameraFitModes(next.cameraFitModes),
          coverControlModes: normalizeCoverControlModes(next.coverControlModes),
          cameraFullscreenHiddenAccessoryIds: normalizeCameraFullscreenHiddenAccessoryIds(
            next.cameraFullscreenHiddenAccessoryIds
          ),
          cameraFullscreenVisibleAccessoryIds: normalizeCameraFullscreenVisibleAccessoryIds(
            next.cameraFullscreenVisibleAccessoryIds
          ),
          customSidebarActions: normalizeCustomSidebarActions(next.customSidebarActions),
          customSummaryPills: normalizeCustomSummaryPills(next.customSummaryPills),
        };
      },
    }
  )
);
