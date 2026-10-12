import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import { DASHBOARD_CONFIG_VERSION } from '@navet/app/constants/dashboard-config-version';
import { ALL_ROOMS_ID, HOME_WIDGET_ROOM, isAllRooms } from '@navet/app/constants/rooms';
import { STORAGE_KEYS, STORE_STORAGE_KEYS } from '@navet/app/constants/storage-keys';
import {
  createLegacyDashboardCollection,
  type NavetDashboardCollection,
  sanitizeDashboardCollection,
  useDashboardCollectionStore,
} from '@navet/app/features/dashboard/dashboards';
import {
  type LegacyRoomOrganization,
  parseRoomWorkspaceV2,
  type RoomWorkspaceV2,
  readRoomWorkspaceV2,
  removeRoomWorkspaceV2,
  sanitizeLegacyRoomOrganization,
  writeRoomWorkspaceV2,
} from '@navet/app/features/dashboard/rooms';
import { useCardZonesStore } from '@navet/app/features/dashboard/stores/card-zones-store';
import {
  type CardType,
  useCustomCardsStore,
} from '@navet/app/features/dashboard/stores/custom-cards-store';
import { useDashboardEntitiesStore } from '@navet/app/features/dashboard/stores/dashboard-entities-store';
import {
  type HomeDashboardLayoutState,
  useHomeDashboardLayoutStore,
} from '@navet/app/features/dashboard/stores/home-dashboard-layout-store';
import {
  parseButtonServiceCall,
  sanitizeButtonEntityId,
} from '@navet/app/features/dashboard/utils/button-widget-security';
import { normalizeLayout } from '@navet/app/features/dashboard/utils/layout-migration';
import { useLightPresetStore } from '@navet/app/features/lighting/stores/light-preset-store';
import { isSection } from '@navet/app/navigation/sections';
import { useEntityRoomOverridesStore } from '@navet/app/stores/entity-room-overrides-store';
import { useNavigationStore } from '@navet/app/stores/navigation-store';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { useThemeStore } from '@navet/app/stores/theme-store';
import {
  parseDashboardConfigYaml,
  stringifyDashboardConfigYaml,
} from '@navet/app/utils/dashboard-config-yaml';
import { removeLocalStorageWithMigration } from '@navet/app/utils/local-storage-migration';
import { notifyPersistedStateChanged } from '@navet/app/utils/persisted-state-events';
import { storage } from '@navet/app/utils/storage';
import { sanitizeExternalUrl, sanitizeImageUrl } from '@navet/app/utils/url-security';
import {
  applySettingsPreferenceLayerToStore,
  isCredentialBearingSettingsUrl,
  isCredentialFieldName,
  projectSettingsPreferenceLayer,
  type SettingsPreferenceValues,
} from './settings-profile-scope';

export interface DashboardConfigPayload {
  version: 1 | 2 | 3 | typeof DASHBOARD_CONFIG_VERSION;
  app: 'navet';
  exportedAt: string;
  theme: {
    theme: ReturnType<typeof useThemeStore.getState>['theme'];
    primaryColor: ReturnType<typeof useThemeStore.getState>['primaryColor'];
    customPrimaryColor?: ReturnType<typeof useThemeStore.getState>['customPrimaryColor'];
    wallpaper?: ReturnType<typeof useThemeStore.getState>['wallpaper'];
  };
  settings: SettingsPreferenceValues<'shared'>;
  navigation: Pick<ReturnType<typeof useNavigationStore.getState>, 'currentRoom' | 'activeSection'>;
  dashboards?: NavetDashboardCollection;
  customCards?: ReturnType<typeof useCustomCardsStore.getState>['cards'];
  dashboardEntities?: Pick<
    ReturnType<typeof useDashboardEntitiesStore.getState>,
    'hiddenEntityIds' | 'lockedCardIds' | 'onboardingCompleted'
  > & { explicitlyShownEntityIds?: string[] };
  entityRoomOverrides?: ReturnType<
    typeof useEntityRoomOverridesStore.getState
  >['roomIdsByEntityId'];
  lightPresets?: Pick<
    ReturnType<typeof useLightPresetStore.getState>,
    'globalBrightnessPresetValues' | 'globalBrightnessPresetOrder' | 'lightPresetConfigs'
  >;
  cardSizes?: Record<string, string>;
  /** Legacy import-only cache. Runtime card ordering is derived locally and is never shared. */
  cardOrders?: Record<string, string[]>;
  cardZones?: Record<string, string>;
  homeDashboardLayout?: unknown;
  roomWorkspace?: RoomWorkspaceV2;
  roomOrder?: string[];
  hiddenRoomNames?: string[];
  roomOrganization?: LegacyRoomOrganization;
}

interface ImportDashboardConfigOptions {
  applyNavigation?: boolean;
}

const DASHBOARD_ENTITIES_STORAGE_KEY = 'navet-dashboard-entities';

const parseStoredJson = <T>(key: string, fallback: T): T => {
  return storage.get(key, fallback);
};

function resetStore<T>(store: {
  getInitialState: () => T;
  setState: (state: T, replace: true) => unknown;
}) {
  store.setState(store.getInitialState(), true);
}

export function resetDashboardProfileState() {
  if (typeof window === 'undefined') {
    return;
  }

  [
    STORAGE_KEYS.cardSizes,
    STORAGE_KEYS.mediaDefaultViews,
    STORAGE_KEYS.cardOrders,
    STORAGE_KEYS.cardZones,
    STORAGE_KEYS.homeDashboardLayout,
    STORAGE_KEYS.dashboardCollection,
    STORAGE_KEYS.roomOrder,
    STORAGE_KEYS.hiddenRooms,
    STORAGE_KEYS.roomOrganization,
    STORAGE_KEYS.roomWorkspace,
    STORAGE_KEYS.dashboardProfileSync,
    STORAGE_KEYS.dashboardPreferenceSync,
    STORAGE_KEYS.settingsProfileScopes,
    STORE_STORAGE_KEYS.theme,
    STORE_STORAGE_KEYS.settings,
    STORE_STORAGE_KEYS.navigation,
    STORE_STORAGE_KEYS.customCards,
    STORE_STORAGE_KEYS.entityRoomOverrides,
    STORE_STORAGE_KEYS.lightPresetSettings,
  ].forEach((key) => {
    storage.remove(key);
  });
  removeLocalStorageWithMigration(DASHBOARD_ENTITIES_STORAGE_KEY, window.localStorage);

  resetStore(useThemeStore);
  resetStore(useSettingsStore);
  resetStore(useNavigationStore);
  useNavigationStore.getState().applyNavigationState({
    currentRoom: ALL_ROOMS_ID,
    activeSection: 'home',
  });
  resetStore(useCustomCardsStore);
  resetStore(useDashboardEntitiesStore);
  resetStore(useEntityRoomOverridesStore);
  resetStore(useLightPresetStore);
  resetStore(useCardZonesStore);
  resetStore(useHomeDashboardLayoutStore);
  useDashboardCollectionStore.getState().resetCollection();

  notifyPersistedStateChanged(STORAGE_KEYS.cardSizes, {});
  notifyPersistedStateChanged(STORAGE_KEYS.mediaDefaultViews, {});
  notifyPersistedStateChanged(STORAGE_KEYS.cardOrders, {});
  notifyPersistedStateChanged(STORAGE_KEYS.roomOrder, []);
  notifyPersistedStateChanged(STORAGE_KEYS.hiddenRooms, []);
  notifyPersistedStateChanged(STORAGE_KEYS.roomOrganization, {
    groups: [],
    groupIdByRoomKey: {},
  });
  notifyPersistedStateChanged(STORAGE_KEYS.roomWorkspace, null);
}

const omitUndefinedEntries = <T extends Record<string, unknown>>(value: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Partial<T>;

const pruneEmptyRecord = <T extends Record<string, unknown>>(value: T): T | undefined =>
  Object.keys(value).length > 0 ? value : undefined;

const pruneEmptyArray = <T>(value: T[]): T[] | undefined => (value.length > 0 ? value : undefined);

const buildExportedSettings = (
  settingsState: Omit<
    ReturnType<typeof useSettingsStore.getState>,
    'updateSettings' | 'updateCameraViewMode' | 'applyImportedSettings' | 'resetSettings'
  >
) => projectSettingsPreferenceLayer(settingsState, 'shared').settings;

export const exportDashboardConfig = (): DashboardConfigPayload => {
  const themeState = useThemeStore.getState();
  const settingsState = useSettingsStore.getState();
  const navigationState = useNavigationStore.getState();
  const customCardsState = useCustomCardsStore.getState();
  const dashboardEntitiesState = useDashboardEntitiesStore.getState();
  const entityRoomOverridesState = useEntityRoomOverridesStore.getState();
  const cardZonesState = useCardZonesStore.getState();
  const homeDashboardLayoutState = useHomeDashboardLayoutStore.getState();
  const lightPresetState = useLightPresetStore.getState();
  const roomWorkspace = readRoomWorkspaceV2();
  const dashboardCollection = useDashboardCollectionStore.getState().collection;
  const legacyRoomOrganization = sanitizeLegacyRoomOrganization(
    parseStoredJson<unknown>(STORAGE_KEYS.roomOrganization, null)
  );
  const hasLegacyRoomOrganization =
    legacyRoomOrganization.groups.length > 0 ||
    Object.keys(legacyRoomOrganization.groupIdByRoomKey).length > 0;

  return {
    version: DASHBOARD_CONFIG_VERSION,
    app: 'navet',
    exportedAt: new Date().toISOString(),
    theme: {
      theme: themeState.theme,
      primaryColor: themeState.primaryColor,
      ...(themeState.customPrimaryColor
        ? { customPrimaryColor: themeState.customPrimaryColor }
        : {}),
      ...(themeState.wallpaper && !isCredentialBearingSettingsUrl(themeState.wallpaper)
        ? { wallpaper: themeState.wallpaper }
        : {}),
    },
    settings: buildExportedSettings(settingsState),
    navigation: {
      currentRoom: navigationState.currentRoom,
      activeSection: navigationState.activeSection,
    },
    dashboards: dashboardCollection,
    customCards: pruneEmptyArray(
      customCardsState.cards
        .filter((card) => card.room !== HOME_WIDGET_ROOM && !isAllRooms(card.room))
        .map((card) => ({
          ...card,
          data: sanitizeCustomCardData(card.type, card.data),
        }))
    ),
    dashboardEntities:
      dashboardEntitiesState.hiddenEntityIds.length > 0 ||
      dashboardEntitiesState.lockedCardIds.length > 0 ||
      dashboardEntitiesState.explicitlyShownEntityIds.length > 0 ||
      dashboardEntitiesState.onboardingCompleted
        ? {
            hiddenEntityIds: dashboardEntitiesState.hiddenEntityIds,
            explicitlyShownEntityIds: dashboardEntitiesState.explicitlyShownEntityIds,
            lockedCardIds: dashboardEntitiesState.lockedCardIds,
            onboardingCompleted: dashboardEntitiesState.onboardingCompleted,
          }
        : undefined,
    entityRoomOverrides: pruneEmptyRecord(entityRoomOverridesState.roomIdsByEntityId),
    lightPresets:
      Object.keys(lightPresetState.lightPresetConfigs).length > 0
        ? {
            globalBrightnessPresetValues: lightPresetState.globalBrightnessPresetValues,
            globalBrightnessPresetOrder: lightPresetState.globalBrightnessPresetOrder,
            lightPresetConfigs: lightPresetState.lightPresetConfigs,
          }
        : undefined,
    cardSizes: pruneEmptyRecord(
      parseStoredJson<Record<string, string>>(STORAGE_KEYS.cardSizes, {})
    ),
    cardZones: pruneEmptyRecord(cardZonesState.cardZones),
    homeDashboardLayout: {
      mode: homeDashboardLayoutState.mode,
      showHero: homeDashboardLayoutState.showHero,
      cardIds: homeDashboardLayoutState.cardIds,
      sections: homeDashboardLayoutState.sections,
      cardSectionAssignments: homeDashboardLayoutState.cardSectionAssignments,
    },
    roomWorkspace: roomWorkspace ?? undefined,
    roomOrder: pruneEmptyArray(parseStoredJson<string[]>(STORAGE_KEYS.roomOrder, [])),
    hiddenRoomNames: roomWorkspace
      ? undefined
      : pruneEmptyArray(parseStoredJson<string[]>(STORAGE_KEYS.hiddenRooms, [])),
    roomOrganization:
      !roomWorkspace && hasLegacyRoomOrganization ? legacyRoomOrganization : undefined,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const cardTypes = new Set<CardType>([
  'info',
  'rss',
  'photo',
  'note',
  'battery',
  'ups',
  'energy-now',
  'media-stack',
  'button',
  'assist',
  'map',
  'entity',
]);
const cardSizes = new Set([
  'tiny',
  'extra-small',
  'small',
  'medium',
  'medium-vertical',
  'large',
  'extra-large',
  'extra-wide',
]);
const MAX_IMPORTED_CARDS = 200;
const MAX_IMPORTED_RECORD_KEYS = 500;

const sanitizeRSSFeedUrl = (value: unknown) => {
  const rawUrl = stringValue(value, 2000);
  if (!rawUrl || isCredentialBearingSettingsUrl(rawUrl)) {
    return null;
  }
  const safeUrl = sanitizeExternalUrl(rawUrl);
  return safeUrl?.startsWith('https://') ? safeUrl : null;
};

type SanitizedJsonPrimitive = string | number | boolean | null;
type SanitizedJsonValue =
  | SanitizedJsonPrimitive
  | SanitizedJsonPrimitive[]
  | Record<string, unknown>;
type SanitizedJsonEntry = readonly [string, SanitizedJsonValue];

function isSanitizedJsonPrimitive(value: unknown): value is SanitizedJsonPrimitive {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  );
}

function stringValue(value: unknown, maxLength = 240): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function sanitizeJsonRecord(value: unknown, depth = 0): Record<string, unknown> | undefined {
  if (!isRecord(value) || depth > 4) {
    return undefined;
  }

  const entries = Object.entries(value)
    .slice(0, 50)
    .flatMap<SanitizedJsonEntry>(([key, entry]) => {
      const safeKey = stringValue(key, 80);
      if (!safeKey || isCredentialFieldName(safeKey)) {
        return [];
      }

      if (isSanitizedJsonPrimitive(entry)) {
        if (typeof entry === 'string' && isCredentialBearingSettingsUrl(entry)) {
          return [];
        }
        return [[safeKey, entry] as const];
      }

      if (Array.isArray(entry)) {
        return [
          [
            safeKey,
            entry
              .slice(0, 50)
              .filter(isSanitizedJsonPrimitive)
              .filter((item) => typeof item !== 'string' || !isCredentialBearingSettingsUrl(item)),
          ] as const,
        ];
      }

      const nested = sanitizeJsonRecord(entry, depth + 1);
      return nested ? ([[safeKey, nested]] as const) : [];
    });

  return Object.fromEntries(entries);
}

function sanitizeStringArray(value: unknown, maxItems = 200): string[] {
  return Array.isArray(value)
    ? value.slice(0, maxItems).flatMap((item) => {
        const safeItem = stringValue(item);
        return safeItem ? [safeItem] : [];
      })
    : [];
}

function sanitizeStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_IMPORTED_RECORD_KEYS)
      .flatMap(([key, entry]) => {
        const safeKey = stringValue(key);
        const safeEntry = stringValue(entry);
        return safeKey && safeEntry ? ([[safeKey, safeEntry]] as const) : [];
      })
  );
}

function sanitizeStringArrayRecord(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_IMPORTED_RECORD_KEYS)
      .flatMap(([key, entry]) => {
        const safeKey = stringValue(key);
        const safeEntries = sanitizeStringArray(entry);
        return safeKey && safeEntries.length > 0 ? ([[safeKey, safeEntries]] as const) : [];
      })
  );
}

function sanitizeHomeDashboardLayout(value: unknown): HomeDashboardLayoutState {
  const importedLayout =
    isRecord(value) &&
    isRecord(value.state) &&
    ('cardIds' in value.state || 'sections' in value.state)
      ? value.state
      : value;
  const normalized = normalizeLayout(importedLayout);

  return {
    ...normalized,
    sections: normalized.sections.map((section) => ({
      ...section,
      span: section.w,
    })),
  };
}

function sanitizeCustomCardData(
  type: CardType | 'sensor-group',
  data: unknown
): Record<string, unknown> | undefined {
  if (!isRecord(data)) {
    return undefined;
  }

  if (type === 'button') {
    const serviceCall = parseButtonServiceCall(stringValue(data.service));
    const serviceData = sanitizeJsonRecord(data.serviceData);

    return omitUndefinedEntries({
      label: stringValue(data.label, 80),
      service: serviceCall ? `${serviceCall.domain}.${serviceCall.service}` : undefined,
      entityId: sanitizeButtonEntityId(stringValue(data.entityId)),
      icon: stringValue(data.icon, 80),
      serviceData,
      tintColor: stringValue(data.tintColor, 40),
    });
  }

  if (type === 'assist') {
    return omitUndefinedEntries({
      providerId: data.providerId === 'home_assistant' ? 'home_assistant' : undefined,
      pipelineId: stringValue(data.pipelineId, 160),
      label: stringValue(data.label, 80),
      tintColor: stringValue(data.tintColor, 40),
    });
  }

  if (type === 'photo') {
    const baseUrl = typeof window !== 'undefined' ? window.location.href : undefined;
    const photoUrls = Array.isArray(data.photoUrls)
      ? data.photoUrls.slice(0, 48).flatMap((url) => {
          const rawUrl = stringValue(url, 2000);
          if (!rawUrl || isCredentialBearingSettingsUrl(rawUrl)) {
            return [];
          }
          const safeUrl = sanitizeImageUrl(rawUrl, baseUrl, {
            allowDataImage: true,
          });
          return safeUrl ? [safeUrl] : [];
        })
      : undefined;
    const photoImages = Array.isArray(data.photoImages)
      ? data.photoImages.slice(0, 48).flatMap((photo) => {
          if (!isRecord(photo)) {
            return [];
          }

          const rawSrc = stringValue(photo.src, 2000);
          if (!rawSrc || isCredentialBearingSettingsUrl(rawSrc)) {
            return [];
          }
          const src = sanitizeImageUrl(rawSrc, baseUrl, {
            allowDataImage: true,
          });
          if (!src) {
            return [];
          }

          const sources = Array.isArray(photo.sources)
            ? photo.sources.slice(0, 2).flatMap((source) => {
                if (!isRecord(source)) {
                  return [];
                }

                const rawSrcSet = stringValue(source.srcSet, 2000);
                if (!rawSrcSet || isCredentialBearingSettingsUrl(rawSrcSet)) {
                  return [];
                }
                const srcSet = sanitizeImageUrl(rawSrcSet, baseUrl, {
                  allowDataImage: true,
                });
                const type = stringValue(source.type, 40);
                if (!srcSet || (type !== 'image/avif' && type !== 'image/webp')) {
                  return [];
                }

                return [{ srcSet, type }] as const;
              })
            : undefined;

          return [{ src, sources }];
        })
      : undefined;

    return omitUndefinedEntries({
      sourceMode: data.sourceMode === 'home-assistant' ? 'home-assistant' : 'urls',
      photoUrls,
      photoImages,
      mediaSourceId: stringValue(data.mediaSourceId, 240),
      shuffleEnabled: typeof data.shuffleEnabled === 'boolean' ? data.shuffleEnabled : undefined,
      tintColor: stringValue(data.tintColor, 40),
    });
  }

  if (type === 'rss') {
    const customProviders = Array.isArray(data.customProviders)
      ? data.customProviders.slice(0, 50).flatMap((provider) => {
          if (!isRecord(provider)) {
            return [];
          }

          const id = stringValue(provider.id, 120);
          const name = stringValue(provider.name, 120);
          const feedUrl = sanitizeRSSFeedUrl(provider.feedUrl);
          if (!id || !name || !feedUrl) {
            return [];
          }

          return [{ id, name, type: 'url', feedUrl }];
        })
      : undefined;

    return omitUndefinedEntries({
      customProviders,
      selectedProviderIds: sanitizeStringArray(data.selectedProviderIds, 50),
      articleCount:
        typeof data.articleCount === 'number'
          ? Math.max(1, Math.min(50, Math.round(data.articleCount)))
          : undefined,
      tintColor: stringValue(data.tintColor, 40),
    });
  }

  if (type === 'sensor-group') {
    return omitUndefinedEntries({
      name: stringValue(data.name, 80),
      sensorEntityIds: sanitizeStringArray(data.sensorEntityIds, 4).filter((entityId) =>
        entityId.startsWith('sensor.')
      ),
      accentColor:
        data.accentColor === 'teal' ||
        data.accentColor === 'blue' ||
        data.accentColor === 'purple' ||
        data.accentColor === 'amber' ||
        data.accentColor === 'emerald'
          ? data.accentColor
          : undefined,
    });
  }

  if (type === 'info') {
    const primaryEntityId = stringValue(data.entityId, 160);
    const validatedPrimaryEntityId =
      primaryEntityId &&
      (primaryEntityId.startsWith('sensor.') || primaryEntityId.startsWith('binary_sensor.'))
        ? primaryEntityId
        : undefined;

    return omitUndefinedEntries({
      name: stringValue(data.name, 80),
      sensorEntityIds: sanitizeStringArray(data.sensorEntityIds, 6).filter(
        (entityId) => entityId.startsWith('sensor.') || entityId.startsWith('binary_sensor.')
      ),
      entityId: validatedPrimaryEntityId,
      accentColor:
        data.accentColor === 'teal' ||
        data.accentColor === 'blue' ||
        data.accentColor === 'purple' ||
        data.accentColor === 'amber' ||
        data.accentColor === 'emerald'
          ? data.accentColor
          : undefined,
    });
  }

  if (type === 'ups') {
    return omitUndefinedEntries({
      deviceId: stringValue(data.deviceId, 160),
      statusEntityId: stringValue(data.statusEntityId, 160),
      metricEntityIds: sanitizeStringArray(data.metricEntityIds, 6).filter((entityId) =>
        entityId.startsWith('sensor.')
      ),
      tintColor: stringValue(data.tintColor, 40),
    });
  }

  return sanitizeJsonRecord(data);
}

function sanitizeImportedCustomCards(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, MAX_IMPORTED_CARDS).flatMap((card) => {
    if (!isRecord(card) || !cardTypes.has(card.type as CardType)) {
      if (!isRecord(card) || card.type !== 'sensor-group') {
        return [];
      }
    }

    const id = stringValue(card.id, 160);
    const legacyType = card.type as CardType | 'sensor-group';
    const type: CardType = legacyType === 'sensor-group' ? 'info' : legacyType;
    const room = stringValue(card.room) ?? ALL_ROOMS_ID;
    const size = cardSizes.has(card.size as string) ? (card.size as CardSize) : 'medium';
    if (!id) {
      return [];
    }

    return [
      {
        id,
        type,
        size,
        room,
        data: sanitizeCustomCardData(legacyType, card.data),
        createdAt: typeof card.createdAt === 'number' ? card.createdAt : Date.now(),
      },
    ];
  });
}

export const importDashboardConfig = (
  value: unknown,
  { applyNavigation = true }: ImportDashboardConfigOptions = {}
) => {
  if (
    !isRecord(value) ||
    (value.version !== 1 &&
      value.version !== 2 &&
      value.version !== 3 &&
      value.version !== DASHBOARD_CONFIG_VERSION)
  ) {
    throw new Error('Unsupported dashboard config format.');
  }

  const theme = isRecord(value.theme) ? value.theme : null;
  const settings = isRecord(value.settings) ? value.settings : null;
  const navigation = isRecord(value.navigation) ? value.navigation : null;
  const dashboardEntities = isRecord(value.dashboardEntities) ? value.dashboardEntities : {};
  const lightPresets = isRecord(value.lightPresets) ? value.lightPresets : {};

  if (!theme || !settings || !navigation) {
    throw new Error('Dashboard config file is incomplete.');
  }

  const currentThemeState = useThemeStore.getState();
  const currentLightPresetState = useLightPresetStore.getState();

  useThemeStore.getState().applyImportedTheme({
    theme:
      (theme.theme as ReturnType<typeof useThemeStore.getState>['theme'] | undefined) ??
      currentThemeState.theme,
    primaryColor:
      (theme.primaryColor as
        | ReturnType<typeof useThemeStore.getState>['primaryColor']
        | undefined) ?? currentThemeState.primaryColor,
    customPrimaryColor:
      theme.customPrimaryColor === undefined
        ? currentThemeState.customPrimaryColor
        : (theme.customPrimaryColor as string | null),
    wallpaper:
      theme.wallpaper === undefined
        ? currentThemeState.wallpaper
        : theme.wallpaper === null
          ? null
          : typeof theme.wallpaper === 'string' && !isCredentialBearingSettingsUrl(theme.wallpaper)
            ? theme.wallpaper
            : currentThemeState.wallpaper,
  });

  applySettingsPreferenceLayerToStore(settings, 'shared');

  if (applyNavigation) {
    useNavigationStore.getState().applyNavigationState({
      currentRoom: (navigation.currentRoom as string | undefined) ?? ALL_ROOMS_ID,
      activeSection: isSection(navigation.activeSection) ? navigation.activeSection : 'home',
    });
  }

  const importedCustomCards = sanitizeImportedCustomCards(value.customCards);
  useCustomCardsStore
    .getState()
    .replaceCards(
      importedCustomCards.filter((card) => card.room !== HOME_WIDGET_ROOM && !isAllRooms(card.room))
    );

  useDashboardEntitiesStore.getState().replaceDashboardEntitiesState({
    hiddenEntityIds: sanitizeStringArray(dashboardEntities.hiddenEntityIds),
    explicitlyShownEntityIds: sanitizeStringArray(dashboardEntities.explicitlyShownEntityIds),
    lockedCardIds: sanitizeStringArray(dashboardEntities.lockedCardIds),
    onboardingCompleted:
      typeof dashboardEntities.onboardingCompleted === 'boolean'
        ? dashboardEntities.onboardingCompleted
        : true,
  });
  useEntityRoomOverridesStore
    .getState()
    .replaceRoomOverrides(sanitizeStringRecord(value.entityRoomOverrides));

  useLightPresetStore.getState().replacePresetState({
    globalBrightnessPresetValues:
      (lightPresets.globalBrightnessPresetValues as
        | ReturnType<typeof useLightPresetStore.getState>['globalBrightnessPresetValues']
        | undefined) ?? currentLightPresetState.globalBrightnessPresetValues,
    globalBrightnessPresetOrder:
      (lightPresets.globalBrightnessPresetOrder as
        | ReturnType<typeof useLightPresetStore.getState>['globalBrightnessPresetOrder']
        | undefined) ?? currentLightPresetState.globalBrightnessPresetOrder,
    lightPresetConfigs:
      (lightPresets.lightPresetConfigs as ReturnType<
        typeof useLightPresetStore.getState
      >['lightPresetConfigs']) ?? currentLightPresetState.lightPresetConfigs,
  });

  const cardSizes = sanitizeStringRecord(value.cardSizes);
  const cardZones = sanitizeStringRecord(value.cardZones);
  const homeDashboardLayout = sanitizeHomeDashboardLayout(value.homeDashboardLayout);
  const roomWorkspace = parseRoomWorkspaceV2(value.roomWorkspace);
  const roomOrder = sanitizeStringArray(value.roomOrder);
  const hiddenRoomNames = sanitizeStringArray(value.hiddenRoomNames);
  const roomOrganization = sanitizeLegacyRoomOrganization(value.roomOrganization);

  storage.set(STORAGE_KEYS.cardSizes, cardSizes);
  notifyPersistedStateChanged(STORAGE_KEYS.cardSizes, cardSizes);
  if (value.cardOrders !== undefined) {
    const legacyCardOrders = sanitizeStringArrayRecord(value.cardOrders);
    storage.set(STORAGE_KEYS.cardOrders, legacyCardOrders);
    notifyPersistedStateChanged(STORAGE_KEYS.cardOrders, legacyCardOrders);
  }
  useCardZonesStore.getState().replaceCardZones(cardZones);
  useHomeDashboardLayoutStore.getState().replaceLayout(homeDashboardLayout);
  const legacyDashboardCollection = createLegacyDashboardCollection({
    homeLayout: homeDashboardLayout,
    cardSizes,
    customCards: importedCustomCards,
    cardZones,
  });
  useDashboardCollectionStore
    .getState()
    .replaceCollection(
      sanitizeDashboardCollection(
        value.dashboards,
        legacyDashboardCollection,
        sanitizeImportedCustomCards
      )
    );
  if (roomWorkspace) {
    writeRoomWorkspaceV2(roomWorkspace);
  } else {
    removeRoomWorkspaceV2();
  }
  storage.set(STORAGE_KEYS.roomOrder, roomOrder);
  notifyPersistedStateChanged(STORAGE_KEYS.roomOrder, roomOrder);
  storage.set(STORAGE_KEYS.hiddenRooms, hiddenRoomNames);
  notifyPersistedStateChanged(STORAGE_KEYS.hiddenRooms, hiddenRoomNames);
  storage.set(STORAGE_KEYS.roomOrganization, roomOrganization);
  notifyPersistedStateChanged(STORAGE_KEYS.roomOrganization, roomOrganization);
};

export const downloadDashboardConfig = async (): Promise<'shared' | 'downloaded'> => {
  const payload = exportDashboardConfig();
  const yamlContent = await stringifyDashboardConfigYaml(payload);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const fileName = `navet-dashboard-config-${dateStamp}.yaml`;
  const blob = new Blob([yamlContent], { type: 'text/yaml;charset=utf-8' });
  const file = new File([blob], fileName, { type: 'text/yaml;charset=utf-8' });

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    await navigator.share({
      files: [file],
      title: 'Navet dashboard config',
    });
    return 'shared';
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.append(link);
  link.click();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 1000);

  return 'downloaded';
};

export const importDashboardConfigFromFile = async (file: File) => {
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith('.yaml') && !lowerName.endsWith('.yml')) {
    throw new Error('Unsupported dashboard config file. Use a .yaml or .yml export.');
  }

  const content = (await file.text()).replace(/^\uFEFF/, '');
  const parsed = await parseDashboardConfigYaml(content);
  importDashboardConfig(parsed);
};

export const importDashboardConfigFromUrl = async (url: string) => {
  const response = await fetch(url, {
    cache: 'no-store',
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new Error(`Unable to load dashboard config from ${url}`);
  }

  const content = (await response.text()).replace(/^\uFEFF/, '');
  const parsed = await parseDashboardConfigYaml(content);
  importDashboardConfig(parsed);
};
