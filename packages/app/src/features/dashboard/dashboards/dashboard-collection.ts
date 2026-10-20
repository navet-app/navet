import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import { HOME_WIDGET_ROOM, isAllRooms } from '@navet/app/constants/rooms';
import { ensureCanonicalEntityId } from '@navet/app/utils/provider-entity-id';
import { parseProviderScopedId } from '@navet/app/utils/provider-ids';
import { normalizeRoomName } from '@navet/app/utils/room-name';
import type { CustomCard } from '../stores/custom-cards-store';
import type {
  HomeDashboardLayoutState,
  HomeDashboardSection,
} from '../stores/home-dashboard-layout-store';
import { normalizeLayout } from '../utils/layout-migration';
import { ZONE_ORDERED, type ZoneName } from '../zones/zone-types';

export const DASHBOARD_COLLECTION_SCHEMA_VERSION = 1 as const;
export const DEFAULT_DASHBOARD_ID = 'home' as const;
export const MAX_DASHBOARD_COUNT = 24;
export const MAX_DASHBOARD_NAME_LENGTH = 64;
const MAX_DASHBOARD_ROOM_COUNT = 200;

export type DashboardId = string;

export interface DashboardCompanionSettings {
  /** Undefined selects the first source; null hides the item. */
  cameraEntityId?: string | null;
  weatherEntityId?: string | null;
  showSecurity: boolean;
}

export const DEFAULT_DASHBOARD_COMPANION: DashboardCompanionSettings = { showSecurity: true };

export function sanitizeDashboardCompanion(value: unknown): DashboardCompanionSettings {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const selection = (key: string) => {
    if (input[key] === null) return null;
    if (typeof input[key] !== 'string' || input[key].length > 256) return undefined;
    const id = ensureCanonicalEntityId(input[key].trim());
    return parseProviderScopedId(id) ? id : undefined;
  };
  return {
    cameraEntityId: selection('cameraEntityId'),
    weatherEntityId: selection('weatherEntityId'),
    showSecurity: typeof input.showSecurity === 'boolean' ? input.showSecurity : true,
  };
}

export interface NavetDashboardDefinition {
  id: DashboardId;
  name: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
  companion?: DashboardCompanionSettings;
  homeRoomNames: string[] | null;
  homeLayout: HomeDashboardLayoutState;
  homeCardSizes: Record<string, CardSize>;
  homeCustomCards: CustomCard[];
  homeCardZones: Record<string, ZoneName>;
}

export interface NavetDashboardCollection {
  schemaVersion: typeof DASHBOARD_COLLECTION_SCHEMA_VERSION;
  defaultDashboardId: DashboardId;
  order: DashboardId[];
  dashboardsById: Record<DashboardId, NavetDashboardDefinition>;
  dashboardIdByClientId: Record<string, DashboardId>;
}

export type DashboardActivationSource = 'default' | 'assignment' | 'preview' | 'link';

export interface DashboardResolutionInput {
  clientId?: string | null;
  directDashboardId?: string | null;
  previewDashboardId?: string | null;
}

export interface ResolvedDashboard {
  dashboardId: DashboardId;
  source: DashboardActivationSource;
}

export interface LegacyDashboardState {
  homeLayout: unknown;
  cardSizes?: Record<string, unknown>;
  customCards?: CustomCard[];
  cardZones?: Record<string, unknown>;
  now?: string;
  homeName?: string;
}

export interface DashboardSeedDevice {
  id: string;
  room: string;
  size: CardSize;
  type: string;
}

export type DashboardSeedMode = 'common' | 'lights' | 'selected';

export interface DashboardCreateInput {
  name: string;
  icon?: string;
  now?: string;
  id?: string;
  source?:
    | { kind: 'blank' }
    | { kind: 'copy'; dashboard: NavetDashboardDefinition }
    | {
        kind: 'rooms';
        devices: DashboardSeedDevice[];
        roomNames: string[];
        include: DashboardSeedMode;
        selectedCardIds?: string[];
      };
}

const CARD_SIZES = new Set<CardSize>([
  'tiny',
  'extra-small',
  'small',
  'medium',
  'medium-vertical',
  'large',
  'extra-large',
  'extra-wide',
]);
const VALID_ZONES = new Set<ZoneName>(ZONE_ORDERED);
const COMMON_DASHBOARD_DEVICE_TYPES = new Set([
  'lights',
  'switches',
  'climate',
  'hvac',
  'fans',
  'covers',
  'locks',
  'media',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeDashboardRoomNames(value: unknown): string[] | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!Array.isArray(value)) {
    return null;
  }

  const seenRoomNames = new Set<string>();
  const roomNames: string[] = [];
  for (const valueRoomName of value) {
    if (typeof valueRoomName !== 'string') {
      continue;
    }
    const roomName = valueRoomName.trim();
    const normalizedRoomName = normalizeRoomName(roomName);
    if (!roomName || isAllRooms(roomName) || seenRoomNames.has(normalizedRoomName)) {
      continue;
    }
    seenRoomNames.add(normalizedRoomName);
    roomNames.push(roomName);
    if (roomNames.length >= MAX_DASHBOARD_ROOM_COUNT) {
      break;
    }
  }
  return roomNames;
}

export function resolveDashboardNavigationRooms(
  rooms: string[],
  homeRoomNames: readonly string[] | null | undefined
): string[] {
  if (homeRoomNames === null || homeRoomNames === undefined) {
    return rooms;
  }
  const scopedRoomNames = new Set(homeRoomNames.map(normalizeRoomName));
  return rooms.filter((room) => scopedRoomNames.has(normalizeRoomName(room)));
}

export function sanitizeDashboardName(value: unknown, fallback = 'Dashboard') {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_DASHBOARD_NAME_LENGTH) : fallback;
}

export function createDashboardId(name = 'dashboard') {
  const slug =
    sanitizeDashboardName(name)
      .toLocaleLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36) || 'dashboard';
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return `${slug}-${suffix}`;
}

export function normalizeHomeDashboardLayout(value: unknown): HomeDashboardLayoutState {
  const normalized = normalizeLayout(value);
  return {
    mode: normalized.mode,
    showHero: normalized.showHero,
    cardIds: normalized.cardIds.map((cardId) => ensureCanonicalEntityId(cardId)),
    sections: normalized.sections.map(
      (section): HomeDashboardSection => ({ ...section, span: section.w })
    ),
    cardSectionAssignments: Object.fromEntries(
      Object.entries(normalized.cardSectionAssignments).map(([cardId, sectionId]) => [
        ensureCanonicalEntityId(cardId),
        sectionId,
      ])
    ),
  };
}

function sanitizeCardSizes(
  value: unknown,
  allowedIds?: ReadonlySet<string>
): Record<string, CardSize> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([rawId, rawSize]) => {
      const canonicalId = ensureCanonicalEntityId(rawId);
      const legacyMatch =
        allowedIds && !allowedIds.has(canonicalId)
          ? [...allowedIds].find((id) => id.endsWith(`:${rawId}`))
          : undefined;
      const id = legacyMatch ?? canonicalId;
      return (!allowedIds || allowedIds.has(id)) && CARD_SIZES.has(rawSize as CardSize)
        ? [[id, rawSize as CardSize]]
        : [];
    })
  );
}

function sanitizeCardZones(
  value: unknown,
  allowedIds?: ReadonlySet<string>
): Record<string, ZoneName> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([rawId, rawZone]) => {
      const canonicalId = ensureCanonicalEntityId(rawId);
      const legacyMatch =
        allowedIds && !allowedIds.has(canonicalId)
          ? [...allowedIds].find((id) => id.endsWith(`:${rawId}`))
          : undefined;
      const id = legacyMatch ?? canonicalId;
      return (!allowedIds || allowedIds.has(id)) && VALID_ZONES.has(rawZone as ZoneName)
        ? [[id, rawZone as ZoneName]]
        : [];
    })
  );
}

function normalizeTrustedCustomCards(value: unknown): CustomCard[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((card) => {
    if (
      !isRecord(card) ||
      typeof card.id !== 'string' ||
      typeof card.type !== 'string' ||
      typeof card.room !== 'string' ||
      !CARD_SIZES.has(card.size as CardSize)
    ) {
      return [];
    }
    return [clone(card as unknown as CustomCard)];
  });
}

function definitionCardIds(layout: HomeDashboardLayoutState, cards: CustomCard[]) {
  return new Set([
    ...layout.cardIds.map((cardId) => ensureCanonicalEntityId(cardId)),
    ...cards.map((card) => ensureCanonicalEntityId(card.id)),
  ]);
}

export function createDashboardDefinition(input: DashboardCreateInput): NavetDashboardDefinition {
  const now = input.now ?? new Date().toISOString();
  const name = sanitizeDashboardName(input.name);
  const id = input.id ?? createDashboardId(name);
  const source = input.source ?? { kind: 'blank' as const };
  let homeLayout = normalizeHomeDashboardLayout(null);
  let homeCardSizes: Record<string, CardSize> = {};
  let homeCustomCards: CustomCard[] = [];
  let homeCardZones: Record<string, ZoneName> = {};
  let homeRoomNames: string[] | null = null;

  if (source.kind === 'copy') {
    homeRoomNames = sanitizeDashboardRoomNames(source.dashboard.homeRoomNames);
    homeLayout = clone(source.dashboard.homeLayout);
    homeCardSizes = clone(source.dashboard.homeCardSizes);
    homeCustomCards = clone(source.dashboard.homeCustomCards).map((card) => ({
      ...card,
      id: card.id.startsWith('custom-')
        ? `custom-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
        : card.id,
    }));
    const copiedCardIds = new Map(
      source.dashboard.homeCustomCards.map((card, index) => [card.id, homeCustomCards[index]?.id])
    );
    homeLayout = {
      ...homeLayout,
      cardIds: homeLayout.cardIds.map((cardId) => copiedCardIds.get(cardId) ?? cardId),
      cardSectionAssignments: Object.fromEntries(
        Object.entries(homeLayout.cardSectionAssignments).map(([cardId, sectionId]) => [
          copiedCardIds.get(cardId) ?? cardId,
          sectionId,
        ])
      ),
    };
    homeCardSizes = Object.fromEntries(
      Object.entries(homeCardSizes).map(([cardId, size]) => [
        copiedCardIds.get(cardId) ?? cardId,
        size,
      ])
    );
    homeCardZones = Object.fromEntries(
      Object.entries(source.dashboard.homeCardZones).map(([cardId, zone]) => [
        copiedCardIds.get(cardId) ?? cardId,
        zone,
      ])
    );
  } else if (source.kind === 'rooms') {
    homeRoomNames = sanitizeDashboardRoomNames(source.roomNames) ?? [];
    const rooms = new Set(homeRoomNames);
    const selectedIds = new Set(source.selectedCardIds ?? []);
    const devices = source.devices.filter((device) => {
      if (!rooms.has(device.room)) {
        return false;
      }
      if (source.include === 'selected') {
        return selectedIds.has(device.id);
      }
      if (source.include === 'lights') {
        return device.type === 'lights';
      }
      return COMMON_DASHBOARD_DEVICE_TYPES.has(device.type);
    });
    homeLayout = normalizeHomeDashboardLayout({
      mode: 'flow',
      showHero: true,
      cardIds: devices.map((device) => device.id),
    });
    homeCardSizes = Object.fromEntries(devices.map((device) => [device.id, device.size]));
  }

  return {
    id,
    name,
    icon: input.icon ?? 'layout-dashboard',
    createdAt: now,
    updatedAt: now,
    companion:
      source.kind === 'copy'
        ? sanitizeDashboardCompanion(source.dashboard.companion)
        : { ...DEFAULT_DASHBOARD_COMPANION },
    homeRoomNames,
    homeLayout,
    homeCardSizes,
    homeCustomCards,
    homeCardZones,
  };
}

export function createLegacyDashboardCollection({
  homeLayout,
  cardSizes = {},
  customCards = [],
  cardZones = {},
  now = new Date().toISOString(),
  homeName = 'Home',
}: LegacyDashboardState): NavetDashboardCollection {
  const normalizedCards = customCards
    .filter((card) => isAllRooms(card.room) || card.room === HOME_WIDGET_ROOM)
    .map((card) => clone(card));
  const normalizedLayout = normalizeHomeDashboardLayout(homeLayout);
  const allowedIds = definitionCardIds(normalizedLayout, normalizedCards);
  const dashboard = createDashboardDefinition({
    id: DEFAULT_DASHBOARD_ID,
    name: homeName,
    now,
    source: { kind: 'blank' },
  });
  dashboard.homeLayout = normalizedLayout;
  dashboard.homeCustomCards = normalizedCards;
  dashboard.homeCardSizes = sanitizeCardSizes(cardSizes, allowedIds);
  dashboard.homeCardZones = sanitizeCardZones(cardZones, allowedIds);

  return {
    schemaVersion: DASHBOARD_COLLECTION_SCHEMA_VERSION,
    defaultDashboardId: dashboard.id,
    order: [dashboard.id],
    dashboardsById: { [dashboard.id]: dashboard },
    dashboardIdByClientId: {},
  };
}

export function sanitizeDashboardCollection(
  value: unknown,
  fallback: NavetDashboardCollection,
  sanitizeCards: (value: unknown) => CustomCard[] = normalizeTrustedCustomCards
): NavetDashboardCollection {
  if (!isRecord(value) || !isRecord(value.dashboardsById)) {
    return clone(fallback);
  }

  const dashboardsById = Object.fromEntries(
    Object.entries(value.dashboardsById)
      .slice(0, MAX_DASHBOARD_COUNT)
      .flatMap(([recordId, rawDefinition]) => {
        if (!isRecord(rawDefinition)) {
          return [];
        }
        const id =
          typeof rawDefinition.id === 'string' && rawDefinition.id.trim()
            ? rawDefinition.id.trim().slice(0, 120)
            : recordId.trim().slice(0, 120);
        if (!id) {
          return [];
        }
        const homeLayout = normalizeHomeDashboardLayout(rawDefinition.homeLayout);
        const homeCustomCards = sanitizeCards(rawDefinition.homeCustomCards).map((card) => ({
          ...card,
          room: HOME_WIDGET_ROOM,
        }));
        const allowedIds = definitionCardIds(homeLayout, homeCustomCards);
        const createdAt =
          typeof rawDefinition.createdAt === 'string'
            ? rawDefinition.createdAt
            : new Date().toISOString();
        const updatedAt =
          typeof rawDefinition.updatedAt === 'string' ? rawDefinition.updatedAt : createdAt;
        const definition: NavetDashboardDefinition = {
          id,
          name: sanitizeDashboardName(rawDefinition.name),
          icon:
            typeof rawDefinition.icon === 'string'
              ? rawDefinition.icon.slice(0, 80)
              : 'layout-dashboard',
          createdAt,
          updatedAt,
          companion: sanitizeDashboardCompanion(rawDefinition.companion),
          homeRoomNames: sanitizeDashboardRoomNames(rawDefinition.homeRoomNames),
          homeLayout,
          homeCardSizes: sanitizeCardSizes(rawDefinition.homeCardSizes, allowedIds),
          homeCustomCards,
          homeCardZones: sanitizeCardZones(rawDefinition.homeCardZones, allowedIds),
        };
        return [[id, definition] as const];
      })
  );
  const ids = Object.keys(dashboardsById);
  if (ids.length === 0) {
    return clone(fallback);
  }
  const order = Array.isArray(value.order)
    ? [
        ...new Set(
          value.order.filter(
            (id): id is string => typeof id === 'string' && Boolean(dashboardsById[id])
          )
        ),
      ]
    : [];
  for (const id of ids) {
    if (!order.includes(id)) {
      order.push(id);
    }
  }
  const requestedDefault =
    typeof value.defaultDashboardId === 'string' ? value.defaultDashboardId : '';
  const defaultDashboardId = dashboardsById[requestedDefault] ? requestedDefault : order[0];
  const dashboardIdByClientId = isRecord(value.dashboardIdByClientId)
    ? Object.fromEntries(
        Object.entries(value.dashboardIdByClientId).flatMap(([clientId, dashboardId]) =>
          typeof dashboardId === 'string' &&
          dashboardId in dashboardsById &&
          clientId.trim().length > 0
            ? [[clientId.slice(0, 160), dashboardId]]
            : []
        )
      )
    : {};

  return {
    schemaVersion: DASHBOARD_COLLECTION_SCHEMA_VERSION,
    defaultDashboardId,
    order,
    dashboardsById,
    dashboardIdByClientId,
  };
}

export function resolveDashboard(
  collection: NavetDashboardCollection,
  { clientId, directDashboardId, previewDashboardId }: DashboardResolutionInput = {}
): ResolvedDashboard {
  const exists = (id: string | null | undefined): id is string =>
    Boolean(id && collection.dashboardsById[id]);
  if (exists(directDashboardId)) {
    return { dashboardId: directDashboardId, source: 'link' };
  }
  if (exists(previewDashboardId)) {
    return { dashboardId: previewDashboardId, source: 'preview' };
  }
  const assignment = clientId ? collection.dashboardIdByClientId[clientId] : undefined;
  if (exists(assignment)) {
    return { dashboardId: assignment, source: 'assignment' };
  }
  if (exists(collection.defaultDashboardId)) {
    return { dashboardId: collection.defaultDashboardId, source: 'default' };
  }
  return { dashboardId: collection.order[0], source: 'default' };
}

export function deleteDashboardFromCollection(
  collection: NavetDashboardCollection,
  dashboardId: string
): NavetDashboardCollection {
  if (!collection.dashboardsById[dashboardId] || collection.order.length <= 1) {
    return collection;
  }
  const dashboardsById = { ...collection.dashboardsById };
  delete dashboardsById[dashboardId];
  const order = collection.order.filter((id) => id !== dashboardId);
  const defaultDashboardId =
    collection.defaultDashboardId === dashboardId
      ? (order[0] as string)
      : collection.defaultDashboardId;
  const dashboardIdByClientId = Object.fromEntries(
    Object.entries(collection.dashboardIdByClientId).map(([clientId, assignedId]) => [
      clientId,
      assignedId === dashboardId ? defaultDashboardId : assignedId,
    ])
  );
  return {
    ...collection,
    defaultDashboardId,
    order,
    dashboardsById,
    dashboardIdByClientId,
  };
}
