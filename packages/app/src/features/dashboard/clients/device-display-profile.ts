import type { UserSettings } from '@navet/app/stores/settings-store';

export const DEVICE_DISPLAY_PROFILE_SCHEMA_VERSION = 1 as const;
export const DEVICE_DISPLAY_PROFILE_LIMIT = 20;

export const DEVICE_DISPLAY_SETTING_KEYS = [
  'headerTitleMode',
  'headerCustomText',
  'keepDeviceAwake',
  'screensaverEnabled',
  'companionEnabled',
  'companionCollapsed',
  'compactMode',
  'kioskMode',
  'kioskSwipeRooms',
  'dashboardProfileMode',
  'dashboardSpaceMode',
  'disableAnimations',
  'lowPowerMode',
  'effectsQuality',
  'effectsQualityUserOverride',
  'ambientLightBleed',
] as const satisfies readonly (keyof UserSettings)[];

export type DeviceDisplaySettingKey = (typeof DEVICE_DISPLAY_SETTING_KEYS)[number];
export type DeviceDisplaySettings = Partial<Pick<UserSettings, DeviceDisplaySettingKey>>;

export interface DeviceDisplayProfile {
  id: string;
  name: string;
  settings: DeviceDisplaySettings;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceDisplayProfilePolicy {
  schemaVersion: typeof DEVICE_DISPLAY_PROFILE_SCHEMA_VERSION;
  profilesById: Record<string, DeviceDisplayProfile>;
  profileIdByClientId: Record<string, string>;
}

const DISPLAY_PROFILE_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const DISPLAY_PROFILE_VALUE_SETS: Partial<Record<DeviceDisplaySettingKey, ReadonlySet<string>>> = {
  headerTitleMode: new Set(['auto_greeting', 'custom_text', 'clock']),
  dashboardProfileMode: new Set(['standard', 'wall_display', 'bedside', 'custom']),
  dashboardSpaceMode: new Set(['default', 'more_space']),
  effectsQuality: new Set(['high', 'medium', 'low']),
};
const BOOLEAN_DISPLAY_SETTINGS = new Set<DeviceDisplaySettingKey>([
  'keepDeviceAwake',
  'screensaverEnabled',
  'companionEnabled',
  'companionCollapsed',
  'compactMode',
  'kioskMode',
  'kioskSwipeRooms',
  'disableAnimations',
  'lowPowerMode',
  'effectsQualityUserOverride',
  'ambientLightBleed',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeDisplaySetting(
  key: DeviceDisplaySettingKey,
  value: unknown
): UserSettings[DeviceDisplaySettingKey] | undefined {
  if (BOOLEAN_DISPLAY_SETTINGS.has(key)) {
    return (typeof value === 'boolean' ? value : undefined) as
      | UserSettings[DeviceDisplaySettingKey]
      | undefined;
  }
  if (key === 'headerCustomText') {
    return (typeof value === 'string' ? value.trim().slice(0, 40) : undefined) as
      | UserSettings[DeviceDisplaySettingKey]
      | undefined;
  }
  const allowedValues = DISPLAY_PROFILE_VALUE_SETS[key];
  return (typeof value === 'string' && allowedValues?.has(value) ? value : undefined) as
    | UserSettings[DeviceDisplaySettingKey]
    | undefined;
}

export function sanitizeDeviceDisplaySettings(value: unknown): DeviceDisplaySettings {
  if (!isRecord(value)) {
    return {};
  }
  const settings: Record<string, unknown> = {};
  for (const key of DEVICE_DISPLAY_SETTING_KEYS) {
    if (!Object.hasOwn(value, key)) {
      continue;
    }
    const sanitized = sanitizeDisplaySetting(key, value[key]);
    if (sanitized !== undefined) {
      settings[key] = sanitized;
    }
  }
  if (settings.effectsQualityUserOverride === false) {
    delete settings.effectsQuality;
  }
  return settings as DeviceDisplaySettings;
}

export function projectDeviceDisplaySettings(settings: UserSettings): DeviceDisplaySettings {
  return sanitizeDeviceDisplaySettings(settings);
}

export function emptyDeviceDisplayProfilePolicy(): DeviceDisplayProfilePolicy {
  return {
    schemaVersion: DEVICE_DISPLAY_PROFILE_SCHEMA_VERSION,
    profilesById: {},
    profileIdByClientId: {},
  };
}

export function sanitizeDeviceDisplayProfilePolicy(value: unknown): DeviceDisplayProfilePolicy {
  if (!isRecord(value)) {
    return emptyDeviceDisplayProfilePolicy();
  }
  const rawProfiles = isRecord(value.profilesById) ? value.profilesById : {};
  const profilesById: Record<string, DeviceDisplayProfile> = {};
  for (const [rawId, rawProfile] of Object.entries(rawProfiles).slice(
    0,
    DEVICE_DISPLAY_PROFILE_LIMIT
  )) {
    if (!DISPLAY_PROFILE_ID_PATTERN.test(rawId) || !isRecord(rawProfile)) {
      continue;
    }
    const name = typeof rawProfile.name === 'string' ? rawProfile.name.trim().slice(0, 64) : '';
    const createdAt =
      typeof rawProfile.createdAt === 'string' && Number.isFinite(Date.parse(rawProfile.createdAt))
        ? rawProfile.createdAt
        : new Date(0).toISOString();
    const updatedAt =
      typeof rawProfile.updatedAt === 'string' && Number.isFinite(Date.parse(rawProfile.updatedAt))
        ? rawProfile.updatedAt
        : createdAt;
    if (!name) {
      continue;
    }
    profilesById[rawId] = {
      id: rawId,
      name,
      settings: sanitizeDeviceDisplaySettings(rawProfile.settings),
      createdAt,
      updatedAt,
    };
  }
  const rawAssignments = isRecord(value.profileIdByClientId) ? value.profileIdByClientId : {};
  const profileIdByClientId = Object.fromEntries(
    Object.entries(rawAssignments).flatMap(([clientId, profileId]) =>
      DISPLAY_PROFILE_ID_PATTERN.test(clientId) &&
      typeof profileId === 'string' &&
      profilesById[profileId]
        ? [[clientId, profileId]]
        : []
    )
  );
  return {
    schemaVersion: DEVICE_DISPLAY_PROFILE_SCHEMA_VERSION,
    profilesById,
    profileIdByClientId,
  };
}

export function createDeviceDisplayProfileId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `display_${crypto.randomUUID().replaceAll('-', '')}`;
  }
  return `display_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

export function getLinkedDeviceDisplayProfile(
  policy: DeviceDisplayProfilePolicy,
  clientId: string
): DeviceDisplayProfile | null {
  const profileId = policy.profileIdByClientId[clientId];
  return profileId ? (policy.profilesById[profileId] ?? null) : null;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function mergeDeviceDisplayProfilePolicies(
  base: DeviceDisplayProfilePolicy,
  local: DeviceDisplayProfilePolicy,
  remote: DeviceDisplayProfilePolicy
): DeviceDisplayProfilePolicy {
  const profilesById = { ...remote.profilesById };
  const profileIds = new Set([
    ...Object.keys(base.profilesById),
    ...Object.keys(local.profilesById),
    ...Object.keys(remote.profilesById),
  ]);
  for (const profileId of profileIds) {
    const baseProfile = base.profilesById[profileId];
    const localProfile = local.profilesById[profileId];
    const remoteProfile = remote.profilesById[profileId];
    if (valuesEqual(baseProfile, localProfile)) {
      continue;
    }
    if (!localProfile) {
      delete profilesById[profileId];
      continue;
    }
    const settings = { ...(remoteProfile?.settings ?? {}) };
    for (const key of DEVICE_DISPLAY_SETTING_KEYS) {
      if (valuesEqual(baseProfile?.settings[key], localProfile.settings[key])) {
        continue;
      }
      if (localProfile.settings[key] === undefined) {
        delete settings[key];
      } else {
        (settings as Record<string, unknown>)[key] = localProfile.settings[key];
      }
    }
    profilesById[profileId] = {
      ...(remoteProfile ?? localProfile),
      name:
        baseProfile?.name !== localProfile.name
          ? localProfile.name
          : (remoteProfile?.name ?? localProfile.name),
      settings,
      updatedAt: localProfile.updatedAt,
    };
  }

  const profileIdByClientId = { ...remote.profileIdByClientId };
  const clientIds = new Set([
    ...Object.keys(base.profileIdByClientId),
    ...Object.keys(local.profileIdByClientId),
  ]);
  for (const clientId of clientIds) {
    const baseProfileId = base.profileIdByClientId[clientId];
    const localProfileId = local.profileIdByClientId[clientId];
    if (baseProfileId === localProfileId) {
      continue;
    }
    if (localProfileId && profilesById[localProfileId]) {
      profileIdByClientId[clientId] = localProfileId;
    } else {
      delete profileIdByClientId[clientId];
    }
  }
  for (const [clientId, profileId] of Object.entries(profileIdByClientId)) {
    if (!profilesById[profileId]) {
      delete profileIdByClientId[clientId];
    }
  }
  return {
    schemaVersion: DEVICE_DISPLAY_PROFILE_SCHEMA_VERSION,
    profilesById,
    profileIdByClientId,
  };
}
