import { isCredentialBearingUrl as isCredentialBearingSettingsUrl } from '@navet/core/credential-policy';

export {
  isCredentialBearingUrl as isCredentialBearingSettingsUrl,
  isCredentialFieldName,
} from '@navet/core/credential-policy';

import { isSupportedLanguage } from '@navet/app/i18n/config';
import { type UserSettings, useSettingsStore } from '@navet/app/stores/settings-store';
import {
  normalizeCustomSidebarActions,
  normalizeCustomSummaryPills,
} from '@navet/app/utils/custom-extensions';
import { detectDeviceTier } from '@navet/app/utils/detect-device-tier';
import { normalizePersistedEntityRecord } from '@navet/app/utils/provider-entity-id';

export const SETTINGS_PROFILE_SCHEMA_VERSION = 1 as const;

export type SettingsPreferenceLayer =
  | 'shared'
  | 'account'
  | 'device'
  | 'secret'
  | 'legacy'
  | 'ephemeral';

export const SETTINGS_PROFILE_CLASSIFICATION = {
  username: 'secret',
  email: 'secret',
  language: 'account',
  headerTitleMode: 'device',
  headerCustomText: 'device',
  showNotifications: 'account',
  showWeatherInHeader: 'shared',
  showHomeSummaryBar: 'shared',
  choresEnabled: 'shared',
  keepDeviceAwake: 'device',
  preventBrowserZoom: 'device',
  use24HourTime: 'account',
  temperatureUnit: 'account',
  defaultView: 'account',
  compactMode: 'device',
  companionEnabled: 'device',
  companionCollapsed: 'device',
  kioskMode: 'device',
  kioskSwipeRooms: 'device',
  dashboardProfileMode: 'device',
  dashboardSpaceMode: 'device',
  disableAnimations: 'device',
  lowPowerMode: 'device',
  effectsQuality: 'device',
  effectsQualityUserOverride: 'device',
  entityInteractionMode: 'account',
  cameraDashboardViewMode: 'device',
  cameraViewMode: 'legacy',
  cameraViewModes: 'device',
  cameraStreamPreference: 'device',
  cameraStreamPreferences: 'device',
  cameraWebRtcStreamSources: 'secret',
  cameraDirectStreamUrls: 'secret',
  cameraFitMode: 'device',
  cameraFitModes: 'device',
  coverControlModes: 'device',
  cameraFullscreenHiddenAccessoryIds: 'device',
  cameraFullscreenVisibleAccessoryIds: 'device',
  ambientLightBleed: 'device',
  weatherForecastMode: 'shared',
  weatherMetricIds: 'shared',
  advancedCustomizationEnabled: 'shared',
  customSidebarActions: 'shared',
  customSummaryPills: 'shared',
} as const satisfies Record<keyof UserSettings, SettingsPreferenceLayer>;

type ClassifiedSettings = typeof SETTINGS_PROFILE_CLASSIFICATION;
type SettingsKeyForLayer<L extends SettingsPreferenceLayer> = {
  [K in keyof ClassifiedSettings]: ClassifiedSettings[K] extends L ? K : never;
}[keyof ClassifiedSettings];

export type SettingsPreferenceValues<L extends SettingsPreferenceLayer> = Partial<
  Pick<UserSettings, SettingsKeyForLayer<L>>
>;

export interface SettingsPreferenceProjection<L extends SettingsPreferenceLayer> {
  schemaVersion: typeof SETTINGS_PROFILE_SCHEMA_VERSION;
  settings: SettingsPreferenceValues<L>;
}

export type SettingsProfileScope = 'all' | 'device';
export type ScopedUserSettingKey = Exclude<
  keyof UserSettings,
  SettingsKeyForLayer<'secret' | 'legacy' | 'ephemeral'>
>;

const HEADER_TITLE_MODES = new Set(['auto_greeting', 'custom_text', 'clock']);
const DASHBOARD_PROFILE_MODES = new Set(['standard', 'wall_display', 'bedside', 'custom']);
const DASHBOARD_SPACE_MODES = new Set(['default', 'more_space']);
const EFFECTS_QUALITY_VALUES = new Set(['high', 'medium', 'low']);
const ENTITY_INTERACTION_MODES = new Set(['control-first', 'toggle-first']);
const CAMERA_VIEW_MODES = new Set(['live', 'auto', 'snapshot']);
const CAMERA_STREAM_PREFERENCES = new Set(['auto', 'web_rtc', 'mse', 'hls', 'mjpeg']);
const CAMERA_WEBRTC_SOURCES = new Set(['provider', 'direct', 'direct_web_rtc', 'direct_mse']);
const CAMERA_FIT_MODES = new Set(['cover', 'contain']);
const WEATHER_FORECAST_MODES = new Set(['weekly', 'hourly']);
const WEATHER_METRIC_IDS = new Set([
  'precipitation',
  'humidity',
  'wind',
  'feelsLike',
  'windGust',
  'pressure',
  'uvIndex',
  'cloudCover',
]);
const BOOLEAN_SETTINGS = new Set<keyof UserSettings>([
  'showNotifications',
  'showWeatherInHeader',
  'showHomeSummaryBar',
  'choresEnabled',
  'keepDeviceAwake',
  'preventBrowserZoom',
  'use24HourTime',
  'compactMode',
  'companionEnabled',
  'companionCollapsed',
  'kioskMode',
  'kioskSwipeRooms',
  'disableAnimations',
  'lowPowerMode',
  'effectsQualityUserOverride',
  'ambientLightBleed',
  'advancedCustomizationEnabled',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeRecordValues(
  value: unknown,
  allowedValues: ReadonlySet<string>
): Record<string, string> | null {
  if (!isRecord(value)) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' && allowedValues.has(entry[1])
    )
  );
}

function sanitizeSettingValue(key: keyof UserSettings, value: unknown): unknown {
  if (BOOLEAN_SETTINGS.has(key)) {
    return typeof value === 'boolean' ? value : undefined;
  }
  if (key === 'language') {
    return typeof value === 'string' && isSupportedLanguage(value) ? value : undefined;
  }
  if (key === 'headerTitleMode') {
    return typeof value === 'string' && HEADER_TITLE_MODES.has(value) ? value : undefined;
  }
  if (key === 'dashboardProfileMode') {
    return typeof value === 'string' && DASHBOARD_PROFILE_MODES.has(value) ? value : undefined;
  }
  if (key === 'dashboardSpaceMode') {
    return typeof value === 'string' && DASHBOARD_SPACE_MODES.has(value) ? value : undefined;
  }
  if (key === 'effectsQuality') {
    return typeof value === 'string' && EFFECTS_QUALITY_VALUES.has(value) ? value : undefined;
  }
  if (key === 'entityInteractionMode') {
    return typeof value === 'string' && ENTITY_INTERACTION_MODES.has(value) ? value : undefined;
  }
  if (key === 'cameraDashboardViewMode' || key === 'cameraViewMode') {
    return typeof value === 'string' && CAMERA_VIEW_MODES.has(value) ? value : undefined;
  }
  if (key === 'cameraStreamPreference') {
    return typeof value === 'string' && CAMERA_STREAM_PREFERENCES.has(value) ? value : undefined;
  }
  if (key === 'cameraFitMode') {
    return typeof value === 'string' && CAMERA_FIT_MODES.has(value) ? value : undefined;
  }
  if (key === 'weatherForecastMode') {
    return typeof value === 'string' && WEATHER_FORECAST_MODES.has(value) ? value : undefined;
  }
  if (key === 'temperatureUnit') {
    return value === 'celsius' || value === 'fahrenheit' ? value : undefined;
  }
  if (key === 'weatherMetricIds') {
    return Array.isArray(value)
      ? value.filter(
          (entry): entry is UserSettings['weatherMetricIds'][number] =>
            typeof entry === 'string' && WEATHER_METRIC_IDS.has(entry)
        )
      : undefined;
  }
  if (key === 'customSidebarActions') {
    return normalizeCustomSidebarActions(value).filter(
      (action) => !action.targetUrl || !isCredentialBearingSettingsUrl(action.targetUrl)
    );
  }
  if (key === 'customSummaryPills') {
    return normalizeCustomSummaryPills(value).filter(
      (pill) => !pill.actionUrl || !isCredentialBearingSettingsUrl(pill.actionUrl)
    );
  }
  if (key === 'cameraViewModes') {
    const sanitized = sanitizeRecordValues(value, CAMERA_VIEW_MODES);
    return sanitized ? normalizePersistedEntityRecord(sanitized) : undefined;
  }
  if (key === 'cameraStreamPreferences') {
    const sanitized = sanitizeRecordValues(value, CAMERA_STREAM_PREFERENCES);
    return sanitized ? normalizePersistedEntityRecord(sanitized) : undefined;
  }
  if (key === 'cameraWebRtcStreamSources') {
    const sanitized = sanitizeRecordValues(value, CAMERA_WEBRTC_SOURCES);
    return sanitized ? normalizePersistedEntityRecord(sanitized) : undefined;
  }
  if (key === 'coverControlModes') {
    const sanitized = sanitizeRecordValues(value, new Set(['simple', 'position']));
    return sanitized ? normalizePersistedEntityRecord(sanitized) : undefined;
  }
  if (key === 'cameraFitModes') {
    const sanitized = sanitizeRecordValues(value, CAMERA_FIT_MODES);
    return sanitized ? normalizePersistedEntityRecord(sanitized) : undefined;
  }
  if (key === 'cameraFullscreenHiddenAccessoryIds') {
    if (!isRecord(value)) return undefined;
    return normalizePersistedEntityRecord(
      Object.fromEntries(
        Object.entries(value).flatMap(([cameraEntityId, accessoryIds]) => {
          if (!Array.isArray(accessoryIds)) return [];
          const validIds = accessoryIds.filter(
            (entry): entry is string => typeof entry === 'string' && entry.length > 0
          );
          return validIds.length > 0 ? [[cameraEntityId, validIds]] : [];
        })
      )
    );
  }
  if (key === 'cameraFullscreenVisibleAccessoryIds') {
    if (!isRecord(value)) return undefined;
    return normalizePersistedEntityRecord(
      Object.fromEntries(
        Object.entries(value).flatMap(([cameraEntityId, accessoryIds]) => {
          if (!Array.isArray(accessoryIds)) return [];
          const validIds = accessoryIds.filter(
            (entry): entry is string => typeof entry === 'string' && entry.length > 0
          );
          return validIds.length > 0 ? [[cameraEntityId, validIds]] : [];
        })
      )
    );
  }
  if (key === 'cameraDirectStreamUrls') {
    if (!isRecord(value)) {
      return undefined;
    }
    return normalizePersistedEntityRecord(
      Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] =>
            typeof entry[1] === 'string' && entry[1].trim().length > 0
        )
      )
    );
  }
  if (
    key === 'username' ||
    key === 'email' ||
    key === 'headerCustomText' ||
    key === 'defaultView'
  ) {
    return typeof value === 'string' ? value : undefined;
  }

  return undefined;
}

function projectRecord<L extends SettingsPreferenceLayer>(
  value: unknown,
  layer: L
): SettingsPreferenceValues<L> {
  if (!isRecord(value)) {
    return {};
  }

  const projected: Partial<UserSettings> = {};
  for (const [key, keyLayer] of Object.entries(SETTINGS_PROFILE_CLASSIFICATION) as Array<
    [keyof UserSettings, SettingsPreferenceLayer]
  >) {
    if (keyLayer !== layer || !Object.hasOwn(value, key)) {
      continue;
    }

    const sanitized = sanitizeSettingValue(key, value[key]);
    if (sanitized !== undefined) {
      (projected as Record<string, unknown>)[key] = sanitized;
    }
  }
  return projected as SettingsPreferenceValues<L>;
}

function migrateLegacyPreferenceSource(
  source: Record<string, unknown>,
  layer: SettingsPreferenceLayer
): Record<string, unknown> {
  if (layer !== 'device') {
    return source;
  }

  const migrated = { ...source };
  if (
    migrated.cameraDashboardViewMode === undefined &&
    typeof migrated.cameraViewMode === 'string'
  ) {
    migrated.cameraDashboardViewMode = migrated.cameraViewMode;
  }

  if (migrated.cameraStreamPreference === 'direct_stream') {
    migrated.cameraStreamPreference = 'web_rtc';
    if (migrated.cameraWebRtcStreamSources === undefined) {
      migrated.cameraWebRtcStreamSources = {};
    }
  }

  const sourcePreferences = isRecord(migrated.cameraStreamPreferences)
    ? migrated.cameraStreamPreferences
    : {};
  const sourceWebRtcSources = isRecord(migrated.cameraWebRtcStreamSources)
    ? migrated.cameraWebRtcStreamSources
    : {};
  const cameraStreamPreferences: Record<string, unknown> = { ...sourcePreferences };
  const cameraWebRtcStreamSources: Record<string, unknown> = { ...sourceWebRtcSources };
  for (const [entityId, preference] of Object.entries(sourcePreferences)) {
    if (preference === 'direct_stream') {
      cameraStreamPreferences[entityId] = 'web_rtc';
      if (cameraWebRtcStreamSources[entityId] === undefined) {
        cameraWebRtcStreamSources[entityId] = 'direct';
      }
    }
  }
  if (Object.keys(cameraStreamPreferences).length > 0) {
    migrated.cameraStreamPreferences = cameraStreamPreferences;
  }
  if (Object.keys(cameraWebRtcStreamSources).length > 0) {
    migrated.cameraWebRtcStreamSources = cameraWebRtcStreamSources;
  }

  if (
    migrated.effectsQualityUserOverride === undefined &&
    typeof migrated.effectsQuality === 'string' &&
    EFFECTS_QUALITY_VALUES.has(migrated.effectsQuality)
  ) {
    // Before automatic effects quality existed, every installation persisted the default `high`
    // value. Treating that legacy default as an explicit override permanently disables device
    // detection on upgraded wall panels. Low and medium remain explicit because they differ from
    // the old default.
    migrated.effectsQualityUserOverride = migrated.effectsQuality !== 'high';
  }

  return migrated;
}

function resolvePreferenceSettingsForApplication<L extends SettingsPreferenceLayer>(
  projection: SettingsPreferenceProjection<L>,
  layer: L
): SettingsPreferenceValues<L> {
  const settings = { ...projection.settings } as Partial<UserSettings>;
  if (layer === 'device' && settings.effectsQualityUserOverride === false) {
    settings.effectsQuality = detectDeviceTier();
  }
  return settings as SettingsPreferenceValues<L>;
}

export function projectSettingsPreferenceLayer<L extends SettingsPreferenceLayer>(
  settings: UserSettings,
  layer: L
): SettingsPreferenceProjection<L> {
  return {
    schemaVersion: SETTINGS_PROFILE_SCHEMA_VERSION,
    settings: projectRecord(settings, layer),
  };
}

export function migrateSettingsPreferenceLayer<L extends SettingsPreferenceLayer>(
  value: unknown,
  layer: L
): SettingsPreferenceProjection<L> {
  const rawSource =
    isRecord(value) && isRecord(value.settings) ? value.settings : isRecord(value) ? value : {};
  const source = migrateLegacyPreferenceSource(rawSource, layer);
  return {
    schemaVersion: SETTINGS_PROFILE_SCHEMA_VERSION,
    settings: projectRecord(source, layer),
  };
}

export function applySettingsPreferenceLayer<L extends SettingsPreferenceLayer>(
  current: UserSettings,
  value: unknown,
  layer: L
): UserSettings {
  const projection = migrateSettingsPreferenceLayer(value, layer);
  return {
    ...current,
    ...resolvePreferenceSettingsForApplication(projection, layer),
  };
}

export function applySettingsPreferenceLayerToStore<L extends SettingsPreferenceLayer>(
  value: unknown,
  layer: L
) {
  const projection = migrateSettingsPreferenceLayer(value, layer);
  const settings = resolvePreferenceSettingsForApplication(projection, layer);
  useSettingsStore.getState().updateSettings(settings);
  return { ...projection, settings };
}

export function getSettingsProfileScope(key: ScopedUserSettingKey): SettingsProfileScope {
  return SETTINGS_PROFILE_CLASSIFICATION[key] === 'device' ? 'device' : 'all';
}

export function setSettingsProfileScope(
  _keys: readonly ScopedUserSettingKey[],
  _scope: SettingsProfileScope,
  _settings?: Partial<UserSettings>
) {
  // Scope is now exhaustive and fixed by SETTINGS_PROFILE_CLASSIFICATION.
}

export function shouldSyncSettingToProfile(key: ScopedUserSettingKey) {
  return SETTINGS_PROFILE_CLASSIFICATION[key] === 'shared';
}

export function getSettingsProfileSharedValue(_key: ScopedUserSettingKey) {
  return undefined;
}

export function setSettingsProfileSharedValues(_settings: Partial<UserSettings>) {
  // Compatibility no-op for old persisted scope migrations.
}
