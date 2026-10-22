import type { IntegrationProviderId } from '@navet/app/types/provider';
import { isIntegrationProviderId } from '@navet/app/types/provider';
import { normalizeRoomName } from '@navet/app/utils/room-name';
import { parseProviderScopedId } from '@navet/core/ids';

export const ROOM_WORKSPACE_VERSION = 2 as const;

declare const roomWorkspaceRoomIdBrand: unique symbol;
declare const roomWorkspaceGroupIdBrand: unique symbol;

export type RoomWorkspaceRoomId = string & {
  readonly [roomWorkspaceRoomIdBrand]: true;
};

export type RoomWorkspaceGroupId = string & {
  readonly [roomWorkspaceGroupIdBrand]: true;
};

export type RoomWorkspaceOpaqueIdScope = 'room' | 'group';
export type RoomWorkspaceSourceType = 'provider_managed' | 'derived';
export type RoomWorkspaceRoomOrigin = 'provider' | 'navet' | 'legacy';
export type RoomWorkspaceVisibility = 'visible' | 'hidden';
export type RoomWorkspaceNameMode = 'provider' | 'custom';

export type RoomWorkspaceTargetV2 = { kind: 'all' } | { kind: 'room'; roomId: RoomWorkspaceRoomId };

export interface RoomWorkspaceSourceRefV2 {
  providerId: IntegrationProviderId;
  canonicalId: string;
  sourceType: RoomWorkspaceSourceType;
}

export type RoomWorkspaceImageReferenceV2 =
  | { kind: 'asset'; value: string }
  | { kind: 'url'; value: string };

export interface RoomWorkspaceRoomMetadataV2 {
  order: number;
  visibility: RoomWorkspaceVisibility;
  nameMode?: RoomWorkspaceNameMode;
  groupId?: RoomWorkspaceGroupId;
  favoriteRank?: number;
  symbol?: string;
  image?: RoomWorkspaceImageReferenceV2;
}

export interface RoomWorkspaceRoomV2 {
  id: RoomWorkspaceRoomId;
  displayName: string;
  origin: RoomWorkspaceRoomOrigin;
  sourceRefs: RoomWorkspaceSourceRefV2[];
  metadata: RoomWorkspaceRoomMetadataV2;
}

export interface RoomWorkspaceGroupV2 {
  id: RoomWorkspaceGroupId;
  displayName: string;
  order: number;
  symbol?: string;
}

export type RoomWorkspaceLegacyField = 'order' | 'visibility' | 'group';

export type RoomWorkspaceReviewIssueCode =
  | 'ambiguous_legacy_name'
  | 'unmatched_legacy_name'
  | 'legacy_all_collision'
  | 'duplicate_source_ref';

export interface RoomWorkspaceReviewIssueV2 {
  code: RoomWorkspaceReviewIssueCode;
  affectedFields: RoomWorkspaceLegacyField[];
  candidateRoomIds: RoomWorkspaceRoomId[];
  legacyName?: string;
  placeholderRoomId?: RoomWorkspaceRoomId;
  sourceCanonicalId?: string;
}

export interface RoomWorkspaceV2 {
  version: typeof ROOM_WORKSPACE_VERSION;
  rooms: RoomWorkspaceRoomV2[];
  groups: RoomWorkspaceGroupV2[];
  reviewIssues: RoomWorkspaceReviewIssueV2[];
}

export interface RoomWorkspaceDiscoveredRoom {
  displayName: string;
  sourceRef: RoomWorkspaceSourceRefV2;
}

export interface LegacyRoomOrganizationGroup {
  id: string;
  name: string;
  symbol?: string;
}

export interface LegacyRoomOrganization {
  groups: LegacyRoomOrganizationGroup[];
  groupIdByRoomKey: Record<string, string>;
}

export interface MigrateLegacyRoomWorkspaceV2Input {
  discoveredRooms: readonly RoomWorkspaceDiscoveredRoom[];
  roomOrder?: unknown;
  hiddenRoomNames?: unknown;
  roomOrganization?: unknown;
  legacyAllName?: string;
  idFactory?: RoomWorkspaceIdFactory;
}

export interface ReconcileRoomWorkspaceV2Options {
  idFactory?: RoomWorkspaceIdFactory;
}

export type RoomWorkspaceIdFactory = (
  scope: RoomWorkspaceOpaqueIdScope
) => RoomWorkspaceRoomId | RoomWorkspaceGroupId;

export interface RoomWorkspaceIndexV2 {
  roomById: ReadonlyMap<RoomWorkspaceRoomId, RoomWorkspaceRoomV2>;
  groupById: ReadonlyMap<RoomWorkspaceGroupId, RoomWorkspaceGroupV2>;
  roomIdBySourceCanonicalId: ReadonlyMap<string, RoomWorkspaceRoomId>;
}

export interface RoomWorkspaceSectionV2 {
  group: RoomWorkspaceGroupV2 | null;
  rooms: RoomWorkspaceRoomV2[];
}

export interface CreateNavetRoomWorkspaceRoomV2Input {
  displayName: string;
  symbol?: string;
  image?: RoomWorkspaceImageReferenceV2;
}

export interface CreateRoomWorkspaceGroupV2Input {
  displayName: string;
  symbol?: string;
}

export interface RoomWorkspaceRoomCreationResultV2 {
  workspace: RoomWorkspaceV2;
  roomId: RoomWorkspaceRoomId | null;
}

export interface RoomWorkspaceGroupCreationResultV2 {
  workspace: RoomWorkspaceV2;
  groupId: RoomWorkspaceGroupId | null;
}

const MAX_ROOMS = 500;
const MAX_GROUPS = 64;
const MAX_REVIEW_ISSUES = 500;
const MAX_SOURCE_REFS_PER_ROOM = 16;
const MAX_NAME_LENGTH = 120;
const MAX_SYMBOL_LENGTH = 32;
const MAX_CANONICAL_ID_LENGTH = 320;
const MAX_ASSET_REFERENCE_LENGTH = 320;
const MAX_URL_REFERENCE_LENGTH = 2_000;
const MAX_OPAQUE_ID_LENGTH = 160;
const OPAQUE_ROOM_ID_PATTERN = /^room_[a-zA-Z0-9_-]{6,154}$/;
const OPAQUE_GROUP_ID_PATTERN = /^group_[a-zA-Z0-9_-]{6,153}$/;
const REVIEW_ISSUE_CODES = new Set<RoomWorkspaceReviewIssueCode>([
  'ambiguous_legacy_name',
  'unmatched_legacy_name',
  'legacy_all_collision',
  'duplicate_source_ref',
]);
const LEGACY_FIELDS = new Set<RoomWorkspaceLegacyField>(['order', 'visibility', 'group']);
const SOURCE_TYPES = new Set<RoomWorkspaceSourceType>(['provider_managed', 'derived']);
const ROOM_ORIGINS = new Set<RoomWorkspaceRoomOrigin>(['provider', 'navet', 'legacy']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeText(value: string): string {
  return Array.from(value.normalize('NFKC'))
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join('')
    .trim()
    .replace(/\s+/g, ' ');
}

function sanitizeText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? normalizeText(value).slice(0, maxLength).trim() : '';
}

function normalizeLegacyRoomName(value: string): string {
  return normalizeText(value).toLocaleLowerCase().slice(0, MAX_NAME_LENGTH);
}

export function isRoomWorkspaceRoomId(value: unknown): value is RoomWorkspaceRoomId {
  return (
    typeof value === 'string' &&
    value.length <= MAX_OPAQUE_ID_LENGTH &&
    OPAQUE_ROOM_ID_PATTERN.test(value)
  );
}

function isRoomWorkspaceGroupId(value: unknown): value is RoomWorkspaceGroupId {
  return (
    typeof value === 'string' &&
    value.length <= MAX_OPAQUE_ID_LENGTH &&
    OPAQUE_GROUP_ID_PATTERN.test(value)
  );
}

function sanitizeNonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function sanitizeSymbol(value: unknown): string | undefined {
  const symbol = sanitizeText(value, MAX_SYMBOL_LENGTH);
  return symbol || undefined;
}

function sanitizeImageReference(value: unknown): RoomWorkspaceImageReferenceV2 | undefined {
  if (!isRecord(value) || (value.kind !== 'asset' && value.kind !== 'url')) {
    return undefined;
  }

  if (value.kind === 'asset') {
    const assetValue = sanitizeText(value.value, MAX_ASSET_REFERENCE_LENGTH);
    if (!assetValue || /^(?:blob|data|javascript):/i.test(assetValue)) {
      return undefined;
    }
    return { kind: 'asset', value: assetValue };
  }

  const urlValue = sanitizeText(value.value, MAX_URL_REFERENCE_LENGTH);
  if (!urlValue) {
    return undefined;
  }

  try {
    const url = new URL(urlValue);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return undefined;
    }
  } catch {
    return undefined;
  }

  return { kind: 'url', value: urlValue };
}

function sanitizeSourceRef(value: unknown): RoomWorkspaceSourceRefV2 | null {
  if (
    !isRecord(value) ||
    typeof value.providerId !== 'string' ||
    !isIntegrationProviderId(value.providerId) ||
    typeof value.sourceType !== 'string' ||
    !SOURCE_TYPES.has(value.sourceType as RoomWorkspaceSourceType)
  ) {
    return null;
  }

  const canonicalId = sanitizeText(value.canonicalId, MAX_CANONICAL_ID_LENGTH);
  const parsedCanonicalId = parseProviderScopedId(canonicalId);
  if (!parsedCanonicalId || parsedCanonicalId.providerId !== value.providerId) {
    return null;
  }

  return {
    providerId: value.providerId,
    canonicalId,
    sourceType: value.sourceType as RoomWorkspaceSourceType,
  };
}

function sanitizeDiscoveredRooms(
  discoveredRooms: readonly RoomWorkspaceDiscoveredRoom[]
): RoomWorkspaceDiscoveredRoom[] {
  const seenCanonicalIds = new Set<string>();
  const sanitized: RoomWorkspaceDiscoveredRoom[] = [];

  for (const discoveredRoom of discoveredRooms.slice(0, MAX_ROOMS * 4)) {
    if (sanitized.length >= MAX_ROOMS) {
      break;
    }

    const displayName = sanitizeText(discoveredRoom.displayName, MAX_NAME_LENGTH);
    const sourceRef = sanitizeSourceRef(discoveredRoom.sourceRef);
    if (!displayName || !sourceRef || seenCanonicalIds.has(sourceRef.canonicalId)) {
      continue;
    }

    seenCanonicalIds.add(sourceRef.canonicalId);
    sanitized.push({ displayName, sourceRef });
  }

  return sanitized;
}

function createRandomOpaqueSuffix(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().replace(/-/g, '_');
  }

  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

export function createOpaqueRoomWorkspaceId(
  scope: RoomWorkspaceOpaqueIdScope
): RoomWorkspaceRoomId | RoomWorkspaceGroupId {
  const id = `${scope}_${createRandomOpaqueSuffix()}`;
  return scope === 'room' ? (id as RoomWorkspaceRoomId) : (id as RoomWorkspaceGroupId);
}

const defaultIdFactory: RoomWorkspaceIdFactory = createOpaqueRoomWorkspaceId;

function createUniqueId(
  scope: RoomWorkspaceOpaqueIdScope,
  usedIds: Set<string>,
  idFactory: RoomWorkspaceIdFactory
): RoomWorkspaceRoomId | RoomWorkspaceGroupId {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const candidate = idFactory(scope);
    const isValid =
      scope === 'room' ? isRoomWorkspaceRoomId(candidate) : isRoomWorkspaceGroupId(candidate);
    if (isValid && !usedIds.has(candidate)) {
      usedIds.add(candidate);
      return candidate;
    }
  }

  let fallback: string;
  do {
    fallback = `${scope}_${createRandomOpaqueSuffix()}`;
  } while (usedIds.has(fallback));
  usedIds.add(fallback);
  return scope === 'room' ? (fallback as RoomWorkspaceRoomId) : (fallback as RoomWorkspaceGroupId);
}

export function createEmptyRoomWorkspaceV2(): RoomWorkspaceV2 {
  return {
    version: ROOM_WORKSPACE_VERSION,
    rooms: [],
    groups: [],
    reviewIssues: [],
  };
}

function normalizeWorkspaceOrders(workspace: RoomWorkspaceV2): RoomWorkspaceV2 {
  const groups = workspace.groups
    .map((group, index) => ({ group, index }))
    .sort(
      (left, right) =>
        left.group.order - right.group.order ||
        left.index - right.index ||
        left.group.id.localeCompare(right.group.id)
    )
    .map(({ group }, order) => ({ ...group, order }));

  const rooms = workspace.rooms
    .map((room, index) => ({ room, index }))
    .sort(
      (left, right) =>
        left.room.metadata.order - right.room.metadata.order ||
        left.index - right.index ||
        left.room.id.localeCompare(right.room.id)
    )
    .map(({ room }, order) => ({
      ...room,
      metadata: { ...room.metadata, order },
    }));

  return { ...workspace, groups, rooms };
}

function sanitizeReviewIssue(
  value: unknown,
  roomIds: ReadonlySet<RoomWorkspaceRoomId>
): RoomWorkspaceReviewIssueV2 | null {
  if (
    !isRecord(value) ||
    typeof value.code !== 'string' ||
    !REVIEW_ISSUE_CODES.has(value.code as RoomWorkspaceReviewIssueCode)
  ) {
    return null;
  }

  const affectedFields = Array.isArray(value.affectedFields)
    ? Array.from(
        new Set(
          value.affectedFields.filter(
            (field): field is RoomWorkspaceLegacyField =>
              typeof field === 'string' && LEGACY_FIELDS.has(field as RoomWorkspaceLegacyField)
          )
        )
      )
    : [];
  const candidateRoomIds = Array.isArray(value.candidateRoomIds)
    ? Array.from(
        new Set(
          value.candidateRoomIds.filter(
            (roomId): roomId is RoomWorkspaceRoomId =>
              isRoomWorkspaceRoomId(roomId) && roomIds.has(roomId)
          )
        )
      ).slice(0, MAX_ROOMS)
    : [];
  const placeholderRoomId =
    isRoomWorkspaceRoomId(value.placeholderRoomId) && roomIds.has(value.placeholderRoomId)
      ? value.placeholderRoomId
      : undefined;
  const legacyName = sanitizeText(value.legacyName, MAX_NAME_LENGTH) || undefined;
  const sourceCanonicalId =
    sanitizeText(value.sourceCanonicalId, MAX_CANONICAL_ID_LENGTH) || undefined;

  return {
    code: value.code as RoomWorkspaceReviewIssueCode,
    affectedFields,
    candidateRoomIds,
    ...(legacyName ? { legacyName } : {}),
    ...(placeholderRoomId ? { placeholderRoomId } : {}),
    ...(sourceCanonicalId ? { sourceCanonicalId } : {}),
  };
}

export function parseRoomWorkspaceV2(value: unknown): RoomWorkspaceV2 | null {
  if (!isRecord(value) || value.version !== ROOM_WORKSPACE_VERSION) {
    return null;
  }

  const groups: RoomWorkspaceGroupV2[] = [];
  const groupIds = new Set<RoomWorkspaceGroupId>();
  if (Array.isArray(value.groups)) {
    for (const [index, rawGroup] of value.groups.slice(0, MAX_GROUPS * 4).entries()) {
      if (groups.length >= MAX_GROUPS || !isRecord(rawGroup)) {
        continue;
      }

      const id = rawGroup.id;
      const displayName = sanitizeText(rawGroup.displayName, MAX_NAME_LENGTH);
      if (!isRoomWorkspaceGroupId(id) || groupIds.has(id) || !displayName) {
        continue;
      }

      groupIds.add(id);
      const symbol = sanitizeSymbol(rawGroup.symbol);
      groups.push({
        id,
        displayName,
        order: sanitizeNonNegativeInteger(rawGroup.order, index),
        ...(symbol ? { symbol } : {}),
      });
    }
  }

  const rooms: RoomWorkspaceRoomV2[] = [];
  const roomIds = new Set<RoomWorkspaceRoomId>();
  const sourceOwnerByCanonicalId = new Map<string, RoomWorkspaceRoomId>();
  const duplicateSourceIssues: RoomWorkspaceReviewIssueV2[] = [];
  if (Array.isArray(value.rooms)) {
    for (const [index, rawRoom] of value.rooms.slice(0, MAX_ROOMS * 4).entries()) {
      if (rooms.length >= MAX_ROOMS || !isRecord(rawRoom) || !isRecord(rawRoom.metadata)) {
        continue;
      }

      const id = rawRoom.id;
      const displayName = sanitizeText(rawRoom.displayName, MAX_NAME_LENGTH);
      const origin =
        typeof rawRoom.origin === 'string' &&
        ROOM_ORIGINS.has(rawRoom.origin as RoomWorkspaceRoomOrigin)
          ? (rawRoom.origin as RoomWorkspaceRoomOrigin)
          : null;
      if (!isRoomWorkspaceRoomId(id) || roomIds.has(id) || !displayName || !origin) {
        continue;
      }

      const sourceRefs: RoomWorkspaceSourceRefV2[] = [];
      const roomSourceIds = new Set<string>();
      if (Array.isArray(rawRoom.sourceRefs)) {
        for (const rawSourceRef of rawRoom.sourceRefs.slice(0, MAX_SOURCE_REFS_PER_ROOM * 4)) {
          if (sourceRefs.length >= MAX_SOURCE_REFS_PER_ROOM) {
            break;
          }

          const sourceRef = sanitizeSourceRef(rawSourceRef);
          if (!sourceRef || roomSourceIds.has(sourceRef.canonicalId)) {
            continue;
          }

          const existingOwner = sourceOwnerByCanonicalId.get(sourceRef.canonicalId);
          if (existingOwner) {
            duplicateSourceIssues.push({
              code: 'duplicate_source_ref',
              affectedFields: [],
              candidateRoomIds: [existingOwner, id],
              sourceCanonicalId: sourceRef.canonicalId,
            });
            continue;
          }

          roomSourceIds.add(sourceRef.canonicalId);
          sourceOwnerByCanonicalId.set(sourceRef.canonicalId, id);
          sourceRefs.push(sourceRef);
        }
      }

      const groupId =
        isRoomWorkspaceGroupId(rawRoom.metadata.groupId) && groupIds.has(rawRoom.metadata.groupId)
          ? rawRoom.metadata.groupId
          : undefined;
      const favoriteRank =
        typeof rawRoom.metadata.favoriteRank === 'number' &&
        Number.isSafeInteger(rawRoom.metadata.favoriteRank) &&
        rawRoom.metadata.favoriteRank >= 0
          ? rawRoom.metadata.favoriteRank
          : undefined;
      const symbol = sanitizeSymbol(rawRoom.metadata.symbol);
      const image = sanitizeImageReference(rawRoom.metadata.image);
      const nameMode =
        rawRoom.metadata.nameMode === 'custom' || rawRoom.metadata.nameMode === 'provider'
          ? rawRoom.metadata.nameMode
          : undefined;

      roomIds.add(id);
      rooms.push({
        id,
        displayName,
        origin,
        sourceRefs,
        metadata: {
          order: sanitizeNonNegativeInteger(rawRoom.metadata.order, index),
          visibility: rawRoom.metadata.visibility === 'hidden' ? 'hidden' : 'visible',
          ...(nameMode ? { nameMode } : {}),
          ...(groupId ? { groupId } : {}),
          ...(favoriteRank !== undefined ? { favoriteRank } : {}),
          ...(symbol ? { symbol } : {}),
          ...(image ? { image } : {}),
        },
      });
    }
  }

  const reviewIssues = Array.isArray(value.reviewIssues)
    ? value.reviewIssues.slice(0, MAX_REVIEW_ISSUES).flatMap((issue) => {
        const sanitized = sanitizeReviewIssue(issue, roomIds);
        return sanitized ? [sanitized] : [];
      })
    : [];

  return normalizeWorkspaceOrders({
    version: ROOM_WORKSPACE_VERSION,
    groups,
    rooms,
    reviewIssues: [...reviewIssues, ...duplicateSourceIssues].slice(0, MAX_REVIEW_ISSUES),
  });
}

function createWorkspaceFromDiscoveredRooms(
  discoveredRooms: readonly RoomWorkspaceDiscoveredRoom[],
  idFactory: RoomWorkspaceIdFactory
): RoomWorkspaceV2 {
  const usedIds = new Set<string>();
  const rooms = sanitizeDiscoveredRooms(discoveredRooms).map(
    (discoveredRoom, order): RoomWorkspaceRoomV2 => ({
      id: createUniqueId('room', usedIds, idFactory) as RoomWorkspaceRoomId,
      displayName: discoveredRoom.displayName,
      origin: 'provider',
      sourceRefs: [discoveredRoom.sourceRef],
      metadata: {
        order,
        visibility: 'visible',
      },
    })
  );

  return {
    version: ROOM_WORKSPACE_VERSION,
    rooms,
    groups: [],
    reviewIssues: [],
  };
}

export function sanitizeLegacyRoomOrganization(value: unknown): LegacyRoomOrganization {
  if (!isRecord(value)) {
    return { groups: [], groupIdByRoomKey: {} };
  }

  const groups: LegacyRoomOrganizationGroup[] = [];
  const legacyIds = new Set<string>();
  if (Array.isArray(value.groups)) {
    for (const rawGroup of value.groups.slice(0, MAX_GROUPS * 4)) {
      if (groups.length >= MAX_GROUPS || !isRecord(rawGroup)) {
        continue;
      }

      const id = sanitizeText(rawGroup.id, MAX_OPAQUE_ID_LENGTH);
      const name = sanitizeText(rawGroup.name, MAX_NAME_LENGTH);
      if (!id || !name || legacyIds.has(id)) {
        continue;
      }

      legacyIds.add(id);
      const symbol = sanitizeSymbol(rawGroup.symbol);
      groups.push({
        id,
        name,
        ...(symbol ? { symbol } : {}),
      });
    }
  }

  const groupIdByRoomKey: Record<string, string> = {};
  if (isRecord(value.groupIdByRoomKey)) {
    for (const [rawRoomName, rawGroupId] of Object.entries(value.groupIdByRoomKey).slice(
      0,
      MAX_ROOMS * 4
    )) {
      const roomKey = normalizeLegacyRoomName(rawRoomName);
      const legacyGroupId = sanitizeText(rawGroupId, MAX_OPAQUE_ID_LENGTH);
      if (roomKey && legacyIds.has(legacyGroupId) && !(roomKey in groupIdByRoomKey)) {
        groupIdByRoomKey[roomKey] = legacyGroupId;
      }
    }
  }

  return { groups, groupIdByRoomKey };
}

function sanitizeLegacyStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: string[] = [];
  for (const rawEntry of value.slice(0, MAX_ROOMS * 4)) {
    const entry = sanitizeText(rawEntry, MAX_NAME_LENGTH);
    if (entry) {
      result.push(entry);
    }
  }
  return result;
}

interface LegacyRoomPreference {
  displayName: string;
  normalizedName: string;
  affectedFields: Set<RoomWorkspaceLegacyField>;
  orderIndex?: number;
  hidden: boolean;
  legacyGroupId?: string;
}

function buildLegacyRoomPreferences({
  roomOrder,
  hiddenRoomNames,
  groupIdByRoomKey,
}: {
  roomOrder: string[];
  hiddenRoomNames: string[];
  groupIdByRoomKey: Record<string, string>;
}): LegacyRoomPreference[] {
  const byName = new Map<string, LegacyRoomPreference>();

  const getPreference = (displayName: string): LegacyRoomPreference => {
    const normalizedName = normalizeLegacyRoomName(displayName);
    const existing = byName.get(normalizedName);
    if (existing) {
      return existing;
    }

    const preference: LegacyRoomPreference = {
      displayName,
      normalizedName,
      affectedFields: new Set(),
      hidden: false,
    };
    byName.set(normalizedName, preference);
    return preference;
  };

  roomOrder.forEach((displayName, orderIndex) => {
    const preference = getPreference(displayName);
    preference.affectedFields.add('order');
    preference.orderIndex ??= orderIndex;
  });

  for (const displayName of hiddenRoomNames) {
    const preference = getPreference(displayName);
    preference.affectedFields.add('visibility');
    preference.hidden = true;
  }

  for (const [roomName, legacyGroupId] of Object.entries(groupIdByRoomKey)) {
    const preference = getPreference(roomName);
    preference.affectedFields.add('group');
    preference.legacyGroupId = legacyGroupId;
  }

  return Array.from(byName.values());
}

export function migrateLegacyRoomWorkspaceV2({
  discoveredRooms,
  roomOrder,
  hiddenRoomNames,
  roomOrganization,
  legacyAllName = 'All',
  idFactory = defaultIdFactory,
}: MigrateLegacyRoomWorkspaceV2Input): RoomWorkspaceV2 {
  const workspace = createWorkspaceFromDiscoveredRooms(discoveredRooms, idFactory);
  const usedIds = new Set<string>(workspace.rooms.map((room) => room.id));
  const sanitizedRoomOrder = sanitizeLegacyStringArray(roomOrder);
  const sanitizedHiddenRoomNames = sanitizeLegacyStringArray(hiddenRoomNames);
  const legacyOrganization = sanitizeLegacyRoomOrganization(roomOrganization);
  const legacyGroupIdMap = new Map<string, RoomWorkspaceGroupId>();

  workspace.groups = legacyOrganization.groups.map((legacyGroup, order) => {
    const id = createUniqueId('group', usedIds, idFactory) as RoomWorkspaceGroupId;
    legacyGroupIdMap.set(legacyGroup.id, id);
    return {
      id,
      displayName: legacyGroup.name,
      order,
      ...(legacyGroup.symbol ? { symbol: legacyGroup.symbol } : {}),
    };
  });

  const roomsByNormalizedName = new Map<string, RoomWorkspaceRoomV2[]>();
  for (const room of workspace.rooms) {
    const normalizedName = normalizeLegacyRoomName(room.displayName);
    const rooms = roomsByNormalizedName.get(normalizedName) ?? [];
    rooms.push(room);
    roomsByNormalizedName.set(normalizedName, rooms);
  }

  const preferences = buildLegacyRoomPreferences({
    roomOrder: sanitizedRoomOrder,
    hiddenRoomNames: sanitizedHiddenRoomNames,
    groupIdByRoomKey: legacyOrganization.groupIdByRoomKey,
  });
  const legacyAllKey = normalizeLegacyRoomName(legacyAllName);
  const targetByLegacyName = new Map<string, RoomWorkspaceRoomV2>();

  for (const preference of preferences) {
    const candidates = roomsByNormalizedName.get(preference.normalizedName) ?? [];
    const isLegacyAllCollision =
      preference.normalizedName === legacyAllKey &&
      (candidates.length > 0 ||
        preference.affectedFields.has('visibility') ||
        preference.affectedFields.has('group'));

    if (
      candidates.length === 1 &&
      preference.normalizedName !== legacyAllKey &&
      !isLegacyAllCollision
    ) {
      targetByLegacyName.set(preference.normalizedName, candidates[0]);
      continue;
    }

    if (
      preference.normalizedName === legacyAllKey &&
      !isLegacyAllCollision &&
      preference.affectedFields.size === 1 &&
      preference.affectedFields.has('order')
    ) {
      continue;
    }

    const placeholderRoom: RoomWorkspaceRoomV2 = {
      id: createUniqueId('room', usedIds, idFactory) as RoomWorkspaceRoomId,
      displayName: preference.displayName,
      origin: 'legacy',
      sourceRefs: [],
      metadata: {
        order: workspace.rooms.length,
        visibility: 'visible',
        nameMode: 'custom',
      },
    };
    workspace.rooms.push(placeholderRoom);
    targetByLegacyName.set(preference.normalizedName, placeholderRoom);
    workspace.reviewIssues.push({
      code: isLegacyAllCollision
        ? 'legacy_all_collision'
        : candidates.length > 1
          ? 'ambiguous_legacy_name'
          : 'unmatched_legacy_name',
      legacyName: preference.displayName,
      affectedFields: Array.from(preference.affectedFields),
      candidateRoomIds: candidates.map((room) => room.id),
      placeholderRoomId: placeholderRoom.id,
    });
  }

  const orderedTargets: RoomWorkspaceRoomV2[] = [];
  const orderedTargetIds = new Set<RoomWorkspaceRoomId>();
  for (const displayName of sanitizedRoomOrder) {
    const target = targetByLegacyName.get(normalizeLegacyRoomName(displayName));
    if (target && !orderedTargetIds.has(target.id)) {
      orderedTargetIds.add(target.id);
      orderedTargets.push(target);
    }
  }
  for (const room of workspace.rooms) {
    if (!orderedTargetIds.has(room.id)) {
      orderedTargetIds.add(room.id);
      orderedTargets.push(room);
    }
  }

  workspace.rooms = orderedTargets.map((room, order) => {
    const preference = preferences.find(
      (entry) => targetByLegacyName.get(entry.normalizedName)?.id === room.id
    );
    const groupId = preference?.legacyGroupId
      ? legacyGroupIdMap.get(preference.legacyGroupId)
      : undefined;

    return {
      ...room,
      metadata: {
        ...room.metadata,
        order,
        visibility: preference?.hidden ? 'hidden' : room.metadata.visibility,
        ...(groupId ? { groupId } : {}),
      },
    };
  });

  return normalizeWorkspaceOrders(workspace);
}

function mergeMatchingRoomNames(workspace: RoomWorkspaceV2): RoomWorkspaceV2 {
  const protectedRoomIds = new Set(
    workspace.reviewIssues
      .filter((issue) => issue.code === 'legacy_all_collision')
      .flatMap((issue) => (issue.placeholderRoomId ? [issue.placeholderRoomId] : []))
  );
  const rooms: RoomWorkspaceRoomV2[] = [];
  const roomByName = new Map<string, number>();
  const mergedRoomIds = new Map<RoomWorkspaceRoomId, RoomWorkspaceRoomId>();

  for (const room of workspace.rooms) {
    const key = normalizeRoomName(room.displayName);
    const index = protectedRoomIds.has(room.id) ? undefined : roomByName.get(key);
    if (index === undefined) {
      rooms.push(room);
      if (!protectedRoomIds.has(room.id)) roomByName.set(key, rooms.length - 1);
      continue;
    }
    const target = rooms[index];
    mergedRoomIds.set(room.id, target.id);
    rooms[index] = {
      ...target,
      sourceRefs: [...target.sourceRefs, ...room.sourceRefs],
      metadata: {
        ...room.metadata,
        ...target.metadata,
        order: Math.min(target.metadata.order, room.metadata.order),
        visibility:
          target.metadata.visibility === 'hidden' || room.metadata.visibility === 'hidden'
            ? 'hidden'
            : 'visible',
      },
    };
  }

  const reviewIssues = workspace.reviewIssues.flatMap((issue) => {
    const candidateRoomIds = Array.from(
      new Set(issue.candidateRoomIds.map((id) => mergedRoomIds.get(id) ?? id))
    );
    const placeholderRoomId = issue.placeholderRoomId
      ? (mergedRoomIds.get(issue.placeholderRoomId) ?? issue.placeholderRoomId)
      : undefined;
    if (
      issue.code === 'ambiguous_legacy_name' &&
      candidateRoomIds.length === 1 &&
      candidateRoomIds[0] === placeholderRoomId
    )
      return [];
    if (
      issue.code === 'unmatched_legacy_name' &&
      rooms.some((room) => room.id === placeholderRoomId && room.sourceRefs.length > 0)
    )
      return [];
    return [{ ...issue, candidateRoomIds, ...(placeholderRoomId ? { placeholderRoomId } : {}) }];
  });
  return normalizeWorkspaceOrders({ ...workspace, rooms, reviewIssues });
}

export function reconcileRoomWorkspaceV2(
  value: unknown,
  discoveredRooms: readonly RoomWorkspaceDiscoveredRoom[],
  { idFactory = defaultIdFactory }: ReconcileRoomWorkspaceV2Options = {}
): RoomWorkspaceV2 {
  const previous = parseRoomWorkspaceV2(value) ?? createEmptyRoomWorkspaceV2();
  const current = mergeMatchingRoomNames(previous);
  const usedIds = new Set<string>([
    ...previous.rooms.map((room) => room.id),
    ...current.groups.map((group) => group.id),
  ]);
  const roomBySourceCanonicalId = new Map<string, RoomWorkspaceRoomV2>();
  for (const room of current.rooms) {
    for (const sourceRef of room.sourceRefs) {
      roomBySourceCanonicalId.set(sourceRef.canonicalId, room);
    }
  }

  const rooms = [...current.rooms];
  for (const discoveredRoom of sanitizeDiscoveredRooms(discoveredRooms)) {
    const existingRoom = roomBySourceCanonicalId.get(discoveredRoom.sourceRef.canonicalId);
    if (existingRoom) {
      const index = rooms.findIndex((room) => room.id === existingRoom.id);
      if (index >= 0) {
        rooms[index] = {
          ...rooms[index],
          displayName:
            existingRoom.origin === 'provider' &&
            existingRoom.metadata.nameMode !== 'custom' &&
            existingRoom.sourceRefs[0]?.canonicalId === discoveredRoom.sourceRef.canonicalId
              ? discoveredRoom.displayName
              : rooms[index].displayName,
          sourceRefs: rooms[index].sourceRefs.map((sourceRef) =>
            sourceRef.canonicalId === discoveredRoom.sourceRef.canonicalId
              ? discoveredRoom.sourceRef
              : sourceRef
          ),
        };
      }
      continue;
    }

    const room: RoomWorkspaceRoomV2 = {
      id: createUniqueId('room', usedIds, idFactory) as RoomWorkspaceRoomId,
      displayName: discoveredRoom.displayName,
      origin: 'provider',
      sourceRefs: [discoveredRoom.sourceRef],
      metadata: {
        order: rooms.length,
        visibility: 'visible',
      },
    };
    rooms.push(room);
    roomBySourceCanonicalId.set(discoveredRoom.sourceRef.canonicalId, room);
  }

  return mergeMatchingRoomNames({ ...current, rooms });
}

export function buildRoomWorkspaceIndexV2(value: unknown): RoomWorkspaceIndexV2 {
  const workspace = parseRoomWorkspaceV2(value) ?? createEmptyRoomWorkspaceV2();
  const roomById = new Map(workspace.rooms.map((room) => [room.id, room]));
  const groupById = new Map(workspace.groups.map((group) => [group.id, group]));
  const roomIdBySourceCanonicalId = new Map<string, RoomWorkspaceRoomId>();

  for (const room of workspace.rooms) {
    for (const sourceRef of room.sourceRefs) {
      roomIdBySourceCanonicalId.set(sourceRef.canonicalId, room.id);
    }
  }

  return {
    roomById,
    groupById,
    roomIdBySourceCanonicalId,
  };
}

export function getRoomWorkspaceRoomIdBySourceCanonicalId(
  index: RoomWorkspaceIndexV2,
  sourceCanonicalId: string
): RoomWorkspaceRoomId | undefined {
  return index.roomIdBySourceCanonicalId.get(sourceCanonicalId);
}

export function getRoomWorkspaceRoomById(
  index: RoomWorkspaceIndexV2,
  roomId: RoomWorkspaceRoomId
): RoomWorkspaceRoomV2 | undefined {
  return index.roomById.get(roomId);
}

export function getRoomWorkspaceDisplayNameById(
  index: RoomWorkspaceIndexV2,
  roomId: RoomWorkspaceRoomId
): string | undefined {
  return index.roomById.get(roomId)?.displayName;
}

function compareRooms(left: RoomWorkspaceRoomV2, right: RoomWorkspaceRoomV2): number {
  return left.metadata.order - right.metadata.order || left.id.localeCompare(right.id);
}

export function getRoomWorkspaceSectionsV2(value: unknown): RoomWorkspaceSectionV2[] {
  const workspace = parseRoomWorkspaceV2(value) ?? createEmptyRoomWorkspaceV2();
  const roomsByGroupId = new Map<RoomWorkspaceGroupId, RoomWorkspaceRoomV2[]>(
    workspace.groups.map((group) => [group.id, []])
  );
  const ungroupedRooms: RoomWorkspaceRoomV2[] = [];

  for (const room of workspace.rooms) {
    const groupRooms = room.metadata.groupId
      ? roomsByGroupId.get(room.metadata.groupId)
      : undefined;
    if (groupRooms) {
      groupRooms.push(room);
    } else {
      ungroupedRooms.push(room);
    }
  }

  const sections: RoomWorkspaceSectionV2[] = workspace.groups.map((group) => ({
    group,
    rooms: (roomsByGroupId.get(group.id) ?? []).sort(compareRooms),
  }));
  if (ungroupedRooms.length > 0) {
    sections.push({ group: null, rooms: ungroupedRooms.sort(compareRooms) });
  }

  return sections;
}

export function getRoomWorkspaceRoomsInDisplayOrderV2(value: unknown): RoomWorkspaceRoomV2[] {
  return getRoomWorkspaceSectionsV2(value).flatMap((section) => section.rooms);
}

export function createNavetRoomWorkspaceRoomV2(
  value: unknown,
  input: CreateNavetRoomWorkspaceRoomV2Input,
  idFactory: RoomWorkspaceIdFactory = defaultIdFactory
): RoomWorkspaceRoomCreationResultV2 {
  const workspace = parseRoomWorkspaceV2(value) ?? createEmptyRoomWorkspaceV2();
  const displayName = sanitizeText(input.displayName, MAX_NAME_LENGTH);
  if (!displayName || workspace.rooms.length >= MAX_ROOMS) {
    return { workspace, roomId: null };
  }

  const usedIds = new Set<string>([
    ...workspace.rooms.map((room) => room.id),
    ...workspace.groups.map((group) => group.id),
  ]);
  const roomId = createUniqueId('room', usedIds, idFactory) as RoomWorkspaceRoomId;
  const symbol = sanitizeSymbol(input.symbol);
  const image = sanitizeImageReference(input.image);
  const room: RoomWorkspaceRoomV2 = {
    id: roomId,
    displayName,
    origin: 'navet',
    sourceRefs: [],
    metadata: {
      order: workspace.rooms.length,
      visibility: 'visible',
      nameMode: 'custom',
      ...(symbol ? { symbol } : {}),
      ...(image ? { image } : {}),
    },
  };

  return {
    roomId,
    workspace: normalizeWorkspaceOrders({
      ...workspace,
      rooms: [...workspace.rooms, room],
    }),
  };
}

export function deleteNavetRoomWorkspaceRoomV2(
  value: unknown,
  roomId: RoomWorkspaceRoomId
): RoomWorkspaceV2 {
  const workspace = parseRoomWorkspaceV2(value) ?? createEmptyRoomWorkspaceV2();
  const room = workspace.rooms.find((entry) => entry.id === roomId);
  if (!room) {
    return workspace;
  }
  if (room.origin !== 'navet' || room.sourceRefs.length > 0) {
    return workspace;
  }

  return removeRoomWorkspaceMetadataV2(workspace, roomId);
}

export function reorderRoomWorkspaceRoomsV2(
  value: unknown,
  orderedRoomIds: readonly RoomWorkspaceRoomId[]
): RoomWorkspaceV2 {
  const workspace = parseRoomWorkspaceV2(value) ?? createEmptyRoomWorkspaceV2();
  const roomById = new Map(workspace.rooms.map((room) => [room.id, room]));
  const nextRooms: RoomWorkspaceRoomV2[] = [];
  const seenRoomIds = new Set<RoomWorkspaceRoomId>();

  for (const roomId of orderedRoomIds) {
    const room = roomById.get(roomId);
    if (room && !seenRoomIds.has(roomId)) {
      seenRoomIds.add(roomId);
      nextRooms.push(room);
    }
  }
  for (const room of workspace.rooms) {
    if (!seenRoomIds.has(room.id)) {
      seenRoomIds.add(room.id);
      nextRooms.push(room);
    }
  }

  return normalizeWorkspaceOrders({
    ...workspace,
    rooms: nextRooms.map((room, order) => ({
      ...room,
      metadata: { ...room.metadata, order },
    })),
  });
}

export function createRoomWorkspaceGroupV2(
  value: unknown,
  input: CreateRoomWorkspaceGroupV2Input,
  idFactory: RoomWorkspaceIdFactory = defaultIdFactory
): RoomWorkspaceGroupCreationResultV2 {
  const workspace = parseRoomWorkspaceV2(value) ?? createEmptyRoomWorkspaceV2();
  const displayName = sanitizeText(input.displayName, MAX_NAME_LENGTH);
  if (!displayName || workspace.groups.length >= MAX_GROUPS) {
    return { workspace, groupId: null };
  }

  const usedIds = new Set<string>([
    ...workspace.rooms.map((room) => room.id),
    ...workspace.groups.map((group) => group.id),
  ]);
  const groupId = createUniqueId('group', usedIds, idFactory) as RoomWorkspaceGroupId;
  const symbol = sanitizeSymbol(input.symbol);
  const group: RoomWorkspaceGroupV2 = {
    id: groupId,
    displayName,
    order: workspace.groups.length,
    ...(symbol ? { symbol } : {}),
  };

  return {
    groupId,
    workspace: normalizeWorkspaceOrders({
      ...workspace,
      groups: [...workspace.groups, group],
    }),
  };
}

export function renameRoomWorkspaceGroupV2(
  value: unknown,
  groupId: RoomWorkspaceGroupId,
  displayName: string
): RoomWorkspaceV2 {
  const workspace = parseRoomWorkspaceV2(value) ?? createEmptyRoomWorkspaceV2();
  const safeDisplayName = sanitizeText(displayName, MAX_NAME_LENGTH);
  if (!safeDisplayName || !workspace.groups.some((group) => group.id === groupId)) {
    return workspace;
  }

  return {
    ...workspace,
    groups: workspace.groups.map((group) =>
      group.id === groupId ? { ...group, displayName: safeDisplayName } : group
    ),
  };
}

export function deleteRoomWorkspaceGroupV2(
  value: unknown,
  groupId: RoomWorkspaceGroupId
): RoomWorkspaceV2 {
  const workspace = parseRoomWorkspaceV2(value) ?? createEmptyRoomWorkspaceV2();
  if (!workspace.groups.some((group) => group.id === groupId)) {
    return workspace;
  }

  return normalizeWorkspaceOrders({
    ...workspace,
    groups: workspace.groups.filter((group) => group.id !== groupId),
    rooms: workspace.rooms.map((room) => {
      if (room.metadata.groupId !== groupId) {
        return room;
      }
      const { groupId: _removedGroupId, ...metadata } = room.metadata;
      return { ...room, metadata };
    }),
  });
}

export function reorderRoomWorkspaceGroupsV2(
  value: unknown,
  orderedGroupIds: readonly RoomWorkspaceGroupId[]
): RoomWorkspaceV2 {
  const workspace = parseRoomWorkspaceV2(value) ?? createEmptyRoomWorkspaceV2();
  const groupById = new Map(workspace.groups.map((group) => [group.id, group]));
  const nextGroups: RoomWorkspaceGroupV2[] = [];
  const seenGroupIds = new Set<RoomWorkspaceGroupId>();

  for (const groupId of orderedGroupIds) {
    const group = groupById.get(groupId);
    if (group && !seenGroupIds.has(groupId)) {
      seenGroupIds.add(groupId);
      nextGroups.push(group);
    }
  }
  for (const group of workspace.groups) {
    if (!seenGroupIds.has(group.id)) {
      seenGroupIds.add(group.id);
      nextGroups.push(group);
    }
  }

  return normalizeWorkspaceOrders({
    ...workspace,
    groups: nextGroups.map((group, order) => ({ ...group, order })),
  });
}

function updateWorkspaceRoom(
  value: unknown,
  roomId: RoomWorkspaceRoomId,
  update: (room: RoomWorkspaceRoomV2) => RoomWorkspaceRoomV2
): RoomWorkspaceV2 {
  const workspace = parseRoomWorkspaceV2(value) ?? createEmptyRoomWorkspaceV2();
  if (!workspace.rooms.some((room) => room.id === roomId)) {
    return workspace;
  }

  return normalizeWorkspaceOrders({
    ...workspace,
    rooms: workspace.rooms.map((room) => (room.id === roomId ? update(room) : room)),
  });
}

export function renameRoomWorkspaceRoomV2(
  value: unknown,
  roomId: RoomWorkspaceRoomId,
  displayName: string
): RoomWorkspaceV2 {
  const safeDisplayName = sanitizeText(displayName, MAX_NAME_LENGTH);
  if (!safeDisplayName) {
    return parseRoomWorkspaceV2(value) ?? createEmptyRoomWorkspaceV2();
  }

  return updateWorkspaceRoom(value, roomId, (room) => ({
    ...room,
    displayName: safeDisplayName,
    metadata: {
      ...room.metadata,
      nameMode: 'custom',
    },
  }));
}

export function setRoomWorkspaceVisibilityV2(
  value: unknown,
  roomId: RoomWorkspaceRoomId,
  visibility: RoomWorkspaceVisibility
): RoomWorkspaceV2 {
  if (visibility !== 'visible' && visibility !== 'hidden') {
    return parseRoomWorkspaceV2(value) ?? createEmptyRoomWorkspaceV2();
  }

  return updateWorkspaceRoom(value, roomId, (room) => ({
    ...room,
    metadata: { ...room.metadata, visibility },
  }));
}

export function setRoomWorkspaceFavoriteRankV2(
  value: unknown,
  roomId: RoomWorkspaceRoomId,
  favoriteRank: number | null
): RoomWorkspaceV2 {
  if (favoriteRank !== null && (!Number.isSafeInteger(favoriteRank) || favoriteRank < 0)) {
    return parseRoomWorkspaceV2(value) ?? createEmptyRoomWorkspaceV2();
  }

  return updateWorkspaceRoom(value, roomId, (room) => {
    const { favoriteRank: _currentFavoriteRank, ...metadata } = room.metadata;
    return {
      ...room,
      metadata:
        favoriteRank !== null && Number.isSafeInteger(favoriteRank) && favoriteRank >= 0
          ? { ...metadata, favoriteRank }
          : metadata,
    };
  });
}

export function setRoomWorkspaceRoomSymbolV2(
  value: unknown,
  roomId: RoomWorkspaceRoomId,
  symbol: string | null
): RoomWorkspaceV2 {
  const safeSymbol = sanitizeSymbol(symbol);
  return updateWorkspaceRoom(value, roomId, (room) => {
    const { symbol: _currentSymbol, ...metadata } = room.metadata;
    return {
      ...room,
      metadata: safeSymbol ? { ...metadata, symbol: safeSymbol } : metadata,
    };
  });
}

export function setRoomWorkspaceRoomImageV2(
  value: unknown,
  roomId: RoomWorkspaceRoomId,
  image: RoomWorkspaceImageReferenceV2 | null
): RoomWorkspaceV2 {
  const safeImage = sanitizeImageReference(image);
  if (image !== null && !safeImage) {
    return parseRoomWorkspaceV2(value) ?? createEmptyRoomWorkspaceV2();
  }

  return updateWorkspaceRoom(value, roomId, (room) => {
    const { image: _currentImage, ...metadata } = room.metadata;
    return {
      ...room,
      metadata: safeImage ? { ...metadata, image: safeImage } : metadata,
    };
  });
}

export function setRoomWorkspaceGroupSymbolV2(
  value: unknown,
  groupId: RoomWorkspaceGroupId,
  symbol: string | null
): RoomWorkspaceV2 {
  const workspace = parseRoomWorkspaceV2(value) ?? createEmptyRoomWorkspaceV2();
  if (!workspace.groups.some((group) => group.id === groupId)) {
    return workspace;
  }

  const safeSymbol = sanitizeSymbol(symbol);
  return {
    ...workspace,
    groups: workspace.groups.map((group) => {
      if (group.id !== groupId) {
        return group;
      }
      const { symbol: _currentSymbol, ...groupWithoutSymbol } = group;
      return safeSymbol ? { ...groupWithoutSymbol, symbol: safeSymbol } : groupWithoutSymbol;
    }),
  };
}

export function assignRoomWorkspaceGroupV2(
  value: unknown,
  roomId: RoomWorkspaceRoomId,
  groupId: RoomWorkspaceGroupId | null
): RoomWorkspaceV2 {
  const workspace = parseRoomWorkspaceV2(value) ?? createEmptyRoomWorkspaceV2();
  if (groupId !== null && !workspace.groups.some((group) => group.id === groupId)) {
    return workspace;
  }

  return updateWorkspaceRoom(workspace, roomId, (room) => {
    const { groupId: _currentGroupId, ...metadata } = room.metadata;
    return {
      ...room,
      metadata: groupId ? { ...metadata, groupId } : metadata,
    };
  });
}

export function linkRoomWorkspaceSourceV2(
  value: unknown,
  roomId: RoomWorkspaceRoomId,
  sourceRef: RoomWorkspaceSourceRefV2
): RoomWorkspaceV2 {
  const workspace = parseRoomWorkspaceV2(value) ?? createEmptyRoomWorkspaceV2();
  const safeSourceRef = sanitizeSourceRef(sourceRef);
  if (!safeSourceRef) {
    return workspace;
  }

  const index = buildRoomWorkspaceIndexV2(workspace);
  const currentOwnerId = index.roomIdBySourceCanonicalId.get(safeSourceRef.canonicalId);
  if (currentOwnerId && currentOwnerId !== roomId) {
    return workspace;
  }

  return updateWorkspaceRoom(workspace, roomId, (room) => ({
    ...room,
    sourceRefs: room.sourceRefs.some((entry) => entry.canonicalId === safeSourceRef.canonicalId)
      ? room.sourceRefs.map((entry) =>
          entry.canonicalId === safeSourceRef.canonicalId ? safeSourceRef : entry
        )
      : [...room.sourceRefs, safeSourceRef].slice(0, MAX_SOURCE_REFS_PER_ROOM),
  }));
}

export function unlinkRoomWorkspaceSourceV2(
  value: unknown,
  roomId: RoomWorkspaceRoomId,
  sourceCanonicalId: string
): RoomWorkspaceV2 {
  return updateWorkspaceRoom(value, roomId, (room) => ({
    ...room,
    sourceRefs: room.sourceRefs.filter((sourceRef) => sourceRef.canonicalId !== sourceCanonicalId),
  }));
}

export function removeRoomWorkspaceMetadataV2(
  value: unknown,
  roomId: RoomWorkspaceRoomId
): RoomWorkspaceV2 {
  const workspace = parseRoomWorkspaceV2(value) ?? createEmptyRoomWorkspaceV2();
  return normalizeWorkspaceOrders({
    ...workspace,
    rooms: workspace.rooms.filter((room) => room.id !== roomId),
    reviewIssues: workspace.reviewIssues.filter(
      (issue) => issue.placeholderRoomId !== roomId && !issue.candidateRoomIds.includes(roomId)
    ),
  });
}
