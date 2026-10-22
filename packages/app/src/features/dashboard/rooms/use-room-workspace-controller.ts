import { ALL_ROOMS_ID } from '@navet/app/constants/rooms';
import { useDashboardEntitiesStore } from '@navet/app/features/dashboard/stores/dashboard-entities-store';
import { useI18n, useIntegrationStore } from '@navet/app/hooks';
import { getProviderRoomManagementCapabilities } from '@navet/app/provider-runtime-registry';
import { useEntityRoomOverridesStore } from '@navet/app/stores/entity-room-overrides-store';
import { integrationSelectors } from '@navet/app/stores/selectors';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import type { PlatformManageableRoomReference } from '@navet/core/provider-feature-models';
import type { NavetEntity, NavetProviderRoom } from '@navet/core/types';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useDashboardEntityVisibility } from '../hooks/use-dashboard-entity-visibility';
import type {
  RoomWorkspaceActions,
  RoomWorkspaceChangeViewModel,
  RoomWorkspaceDeviceViewModel,
  RoomWorkspaceGroupViewModel,
  RoomWorkspaceMode,
  RoomWorkspaceRoomViewModel,
  RoomWorkspaceStage,
  RoomWorkspaceViewModel,
} from './components';
import { createDiscoveredRooms } from './room-workspace-discovery';
import {
  createRoomWorkspaceEditorSession,
  type RoomWorkspacePendingOperation,
  type RoomWorkspaceSaveOutcome,
  roomWorkspaceEditorSessionReducer,
} from './room-workspace-editor-session';
import {
  executeRoomWorkspaceMutationTransaction,
  type PendingProviderRoomDeletion,
} from './room-workspace-mutation-transaction';
import { useRoomWorkspaceStore } from './room-workspace-store';
import {
  assignRoomWorkspaceGroupV2,
  buildRoomWorkspaceIndexV2,
  createNavetRoomWorkspaceRoomV2,
  createRoomWorkspaceGroupV2,
  deleteNavetRoomWorkspaceRoomV2,
  deleteRoomWorkspaceGroupV2,
  getRoomWorkspaceRoomsInDisplayOrderV2,
  linkRoomWorkspaceSourceV2,
  type RoomWorkspaceGroupId,
  type RoomWorkspaceImageReferenceV2,
  type RoomWorkspaceIndexV2,
  type RoomWorkspaceRoomId,
  type RoomWorkspaceV2,
  removeRoomWorkspaceMetadataV2,
  renameRoomWorkspaceGroupV2,
  renameRoomWorkspaceRoomV2,
  reorderRoomWorkspaceGroupsV2,
  reorderRoomWorkspaceRoomsV2,
  setRoomWorkspaceFavoriteRankV2,
  setRoomWorkspaceGroupSymbolV2,
  setRoomWorkspaceRoomImageV2,
  setRoomWorkspaceRoomSymbolV2,
  setRoomWorkspaceVisibilityV2,
  unlinkRoomWorkspaceSourceV2,
} from './room-workspace-v2';

export interface RoomWorkspaceControllerInput {
  isOpen: boolean;
  manageableRooms: PlatformManageableRoomReference[];
  roomHiddenItemCounts: Map<string, number>;
  roomEntityCounts: Map<string, number>;
  dashboardEntityIds?: readonly string[];
  dashboardVisibleEntityIds?: readonly string[];
  onRoomOrderChange?: (rooms: string[]) => void;
  onHiddenRoomsChange?: (rooms: string[]) => void;
}

export type {
  RoomWorkspacePendingOperation,
  RoomWorkspaceSaveOutcome,
} from './room-workspace-editor-session';

const EMPTY_PROVIDER_ROOMS: Record<string, NavetProviderRoom> = {};
const EMPTY_PROVIDER_ENTITIES: Record<string, NavetEntity> = {};
const EMPTY_ROOM_OVERRIDES: Record<string, string> = {};

function isEntityShownOnDashboard(
  entity: NavetEntity,
  hiddenEntityIds: ReadonlySet<string>,
  shownSensorEntityIds: ReadonlySet<string>,
  explicitlyShownEntityIds: ReadonlySet<string>
): boolean {
  if (hiddenEntityIds.has(entity.canonicalId)) {
    return false;
  }

  if (entity.type === 'helper') return explicitlyShownEntityIds.has(entity.canonicalId);

  if (entity.type === 'sensor' || entity.type === 'binary_sensor') {
    return shownSensorEntityIds.has(entity.canonicalId);
  }

  return true;
}

function setContainsEntityId(entity: NavetEntity, entityIds: ReadonlySet<string>): boolean {
  return (
    entityIds.has(entity.canonicalId) ||
    entityIds.has(entity.id) ||
    entityIds.has(entity.externalId)
  );
}

export interface RoomWorkspaceController {
  viewModel: RoomWorkspaceViewModel;
  roomDeviceCounts: ReadonlyMap<string, number>;
  actions: RoomWorkspaceActions;
  draftWorkspace: RoomWorkspaceV2 | null;
  pendingOperation: RoomWorkspacePendingOperation | null;
  saveOutcome: RoomWorkspaceSaveOutcome;
  dismissOperation: () => void;
  confirmNameOperation: (name: string) => void;
  confirmMerge: (targetRoomId: string) => void;
  confirmDeviceMove: (targetRoomId: string) => void;
  confirmAppearance: (input: {
    symbol: string | null;
    image: RoomWorkspaceImageReferenceV2 | null;
  }) => void;
  confirmDelete: (destinationRoomId?: string | null) => void;
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function providerLabel(providerId: IntegrationProviderId): string {
  switch (providerId) {
    case 'home_assistant':
      return 'Home Assistant';
    case 'homey':
      return 'Homey';
    case 'openhab':
      return 'openHAB';
    case 'hubitat':
      return 'Hubitat';
    case 'smartthings':
      return 'SmartThings';
  }
}

type RoomWorkspaceTranslate = ReturnType<typeof useI18n>['t'];

function formatRoomCount(t: RoomWorkspaceTranslate, count: number): string {
  return t(
    count === 1
      ? 'dashboard.roomsWorkspace.counts.rooms.one'
      : 'dashboard.roomsWorkspace.counts.rooms.other',
    { count }
  );
}

function formatDeviceCount(t: RoomWorkspaceTranslate, count: number): string {
  return t(
    count === 1
      ? 'dashboard.roomsWorkspace.counts.devices.one'
      : 'dashboard.roomsWorkspace.counts.devices.other',
    { count }
  );
}

function formatSelectedCount(t: RoomWorkspaceTranslate, count: number): string {
  return t(
    count === 1
      ? 'dashboard.roomsWorkspace.counts.selected.one'
      : 'dashboard.roomsWorkspace.counts.selected.other',
    { count }
  );
}

function getEntityOverrideId(
  entity: NavetEntity,
  roomIdsByEntityId: Record<string, string>
): string | null {
  return (
    roomIdsByEntityId[entity.canonicalId] ??
    roomIdsByEntityId[entity.id] ??
    roomIdsByEntityId[entity.externalId] ??
    null
  );
}

function resolveEntityWorkspaceRoomId(
  entity: NavetEntity,
  index: RoomWorkspaceIndexV2,
  roomIdsByEntityId: Record<string, string>
): RoomWorkspaceRoomId | null {
  const candidateId = getEntityOverrideId(entity, roomIdsByEntityId) ?? entity.roomId;
  if (!candidateId) {
    return null;
  }

  if (index.roomById.has(candidateId as RoomWorkspaceRoomId)) {
    return candidateId as RoomWorkspaceRoomId;
  }

  return index.roomIdBySourceCanonicalId.get(candidateId) ?? null;
}

function areWorkspacesEqual(left: RoomWorkspaceV2 | null, right: RoomWorkspaceV2 | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildWorkspaceChanges({
  committedWorkspace,
  draftWorkspace,
  entitiesByCanonicalId,
  committedRoomIdByEntityId,
  pendingPlacements,
  pendingProviderDeletions,
  saveOutcome,
  t,
}: {
  committedWorkspace: RoomWorkspaceV2 | null;
  draftWorkspace: RoomWorkspaceV2 | null;
  entitiesByCanonicalId: Record<string, NavetEntity>;
  committedRoomIdByEntityId: ReadonlyMap<string, RoomWorkspaceRoomId | null>;
  pendingPlacements: Record<string, RoomWorkspaceRoomId | null>;
  pendingProviderDeletions: PendingProviderRoomDeletion[];
  saveOutcome: RoomWorkspaceSaveOutcome;
  t: RoomWorkspaceTranslate;
}): RoomWorkspaceChangeViewModel[] {
  if (!draftWorkspace) {
    return [];
  }

  const changes: RoomWorkspaceChangeViewModel[] = [];
  const committedRooms = new Map(
    (committedWorkspace?.rooms ?? []).map((room) => [room.id, room] as const)
  );
  const draftRooms = new Map(draftWorkspace.rooms.map((room) => [room.id, room] as const));
  const createdCount = draftWorkspace.rooms.filter((room) => !committedRooms.has(room.id)).length;
  const removedCount = (committedWorkspace?.rooms ?? []).filter(
    (room) => !draftRooms.has(room.id)
  ).length;
  const editedCount = draftWorkspace.rooms.filter((room) => {
    const previous = committedRooms.get(room.id);
    return previous && JSON.stringify(previous) !== JSON.stringify(room);
  }).length;
  const groupChanged =
    JSON.stringify(committedWorkspace?.groups ?? []) !== JSON.stringify(draftWorkspace.groups);
  const placementCount = Object.keys(pendingPlacements).length;
  const providerRenameCount = draftWorkspace.rooms.filter((room) => {
    const previous = committedRooms.get(room.id);
    const sourceRef = room.sourceRefs.length === 1 ? room.sourceRefs[0] : null;
    return (
      previous?.displayName !== room.displayName &&
      sourceRef !== null &&
      getProviderRoomManagementCapabilities(sourceRef.providerId).rename
    );
  }).length;
  const localChangeCount = createdCount + editedCount + removedCount + (groupChanged ? 1 : 0);
  const providerChangeCount =
    providerRenameCount + placementCount + pendingProviderDeletions.length;
  const providerChangeDetails: string[] = [];

  for (const room of draftWorkspace.rooms) {
    const previous = committedRooms.get(room.id);
    const sourceRef = room.sourceRefs.length === 1 ? room.sourceRefs[0] : null;
    if (
      previous !== undefined &&
      previous.displayName !== room.displayName &&
      sourceRef !== null &&
      getProviderRoomManagementCapabilities(sourceRef.providerId).rename
    ) {
      providerChangeDetails.push(
        `${providerLabel(sourceRef.providerId)} · ${previous.displayName} → ${room.displayName}`
      );
    }
  }

  for (const [entityId, targetRoomId] of Object.entries(pendingPlacements)) {
    const entity = entitiesByCanonicalId[entityId];
    if (!entity) {
      continue;
    }
    const previousRoomId = committedRoomIdByEntityId.get(entityId) ?? null;
    const previousRoomName = previousRoomId
      ? (committedRooms.get(previousRoomId)?.displayName ?? previousRoomId)
      : t('dashboard.roomsWorkspace.notInRoom');
    const targetRoomName = targetRoomId
      ? (draftRooms.get(targetRoomId)?.displayName ?? targetRoomId)
      : t('dashboard.roomsWorkspace.notInRoom');
    providerChangeDetails.push(
      `${providerLabel(entity.providerId)} · ${entity.name}: ${previousRoomName} → ${targetRoomName}`
    );
  }

  for (const deletion of pendingProviderDeletions) {
    providerChangeDetails.push(
      `${providerLabel(deletion.sourceRef.providerId)} · ${deletion.room.displayName}: ${t(
        'dashboard.roomsWorkspace.deleteRoom'
      )}`
    );
  }

  if (localChangeCount > 0) {
    changes.push({
      id: 'local-changes',
      title: t('dashboard.roomsWorkspace.impact.localTitle'),
      description: t(
        localChangeCount === 1
          ? 'dashboard.roomsWorkspace.counts.localChanges.one'
          : 'dashboard.roomsWorkspace.counts.localChanges.other',
        { count: localChangeCount }
      ),
      tone: removedCount > 0 ? 'warning' : 'neutral',
    });
  }
  if (providerChangeCount > 0) {
    changes.push({
      id: 'provider-changes',
      title: t('dashboard.roomsWorkspace.impact.providerTitle'),
      description: t(
        providerChangeCount === 1
          ? 'dashboard.roomsWorkspace.counts.providerChanges.one'
          : 'dashboard.roomsWorkspace.counts.providerChanges.other',
        { count: providerChangeCount }
      ),
      details: providerChangeDetails,
      tone: pendingProviderDeletions.length > 0 ? 'critical' : 'neutral',
    });
  }
  if (saveOutcome.kind === 'partial' || saveOutcome.kind === 'error') {
    changes.unshift({
      id: 'save-failures',
      title: t('dashboard.roomsWorkspace.impactTitle'),
      description:
        saveOutcome.kind === 'partial'
          ? t('dashboard.roomsWorkspace.save.partial')
          : t('dashboard.roomsWorkspace.save.failure'),
      tone: 'critical',
    });
  }

  return changes;
}

function countWorkspaceChanges({
  committedWorkspace,
  draftWorkspace,
  pendingPlacements,
  pendingProviderDeletions,
}: {
  committedWorkspace: RoomWorkspaceV2 | null;
  draftWorkspace: RoomWorkspaceV2 | null;
  pendingPlacements: Record<string, RoomWorkspaceRoomId | null>;
  pendingProviderDeletions: PendingProviderRoomDeletion[];
}): number {
  if (!draftWorkspace) {
    return 0;
  }

  const committedRooms = new Map(
    (committedWorkspace?.rooms ?? []).map((room) => [room.id, room] as const)
  );
  const draftRoomIds = new Set(draftWorkspace.rooms.map((room) => room.id));
  const createdCount = draftWorkspace.rooms.filter((room) => !committedRooms.has(room.id)).length;
  const removedCount = (committedWorkspace?.rooms ?? []).filter(
    (room) => !draftRoomIds.has(room.id)
  ).length;
  const editedCount = draftWorkspace.rooms.filter((room) => {
    const previous = committedRooms.get(room.id);
    return previous && JSON.stringify(previous) !== JSON.stringify(room);
  }).length;
  const groupChangeCount =
    JSON.stringify(committedWorkspace?.groups ?? []) === JSON.stringify(draftWorkspace.groups)
      ? 0
      : 1;

  return (
    createdCount +
    removedCount +
    editedCount +
    groupChangeCount +
    Object.keys(pendingPlacements).length +
    pendingProviderDeletions.length
  );
}

export function useRoomWorkspaceController({
  isOpen,
  manageableRooms,
  roomEntityCounts,
  dashboardEntityIds,
  dashboardVisibleEntityIds,
  onRoomOrderChange,
  onHiddenRoomsChange,
}: RoomWorkspaceControllerInput): RoomWorkspaceController {
  const { t } = useI18n();
  const normalizedRoomsByCanonicalId = useIntegrationStore((state) =>
    isOpen ? integrationSelectors.normalizedRoomsByCanonicalId(state) : EMPTY_PROVIDER_ROOMS
  );
  const entitiesByCanonicalId = useIntegrationStore((state) =>
    isOpen ? integrationSelectors.providerEntitiesByCanonicalId(state) : EMPTY_PROVIDER_ENTITIES
  );
  const roomIdsByEntityId = useEntityRoomOverridesStore((state) =>
    isOpen ? state.roomIdsByEntityId : EMPTY_ROOM_OVERRIDES
  );
  const hiddenDashboardEntityIds = useDashboardEntitiesStore((state) => state.hiddenEntityIds);
  const { explicitlyShownEntityIds } = useDashboardEntityVisibility();
  const shownSensorEntityIds = useDashboardEntitiesStore((state) => state.shownSensorEntityIds);
  const hideDashboardEntity = useDashboardEntitiesStore((state) => state.hideEntity);
  const showDashboardEntity = useDashboardEntitiesStore((state) => state.showEntity);
  const setRoomOverride = useEntityRoomOverridesStore((state) => state.setRoomOverride);
  const clearRoomOverride = useEntityRoomOverridesStore((state) => state.clearRoomOverride);
  const initializeWorkspace = useRoomWorkspaceStore((state) => state.initialize);
  const replaceWorkspace = useRoomWorkspaceStore((state) => state.replaceWorkspace);
  const persistedWorkspace = useRoomWorkspaceStore((state) => (isOpen ? state.workspace : null));
  const discoveredRooms = useMemo(
    () => createDiscoveredRooms(normalizedRoomsByCanonicalId),
    [normalizedRoomsByCanonicalId]
  );
  const manageableRoomById = useMemo(
    () => new Map(manageableRooms.map((room) => [room.id, room] as const)),
    [manageableRooms]
  );
  const [editorSession, dispatchEditorSession] = useReducer(
    roomWorkspaceEditorSessionReducer,
    persistedWorkspace,
    createRoomWorkspaceEditorSession
  );
  const {
    committedWorkspace,
    draftWorkspace,
    isSaving,
    pendingOperation,
    pendingPlacements,
    pendingProviderDeletions,
    roomNameDrafts,
    saveOutcome,
    selectedRoomId,
    stage,
  } = editorSession;
  const [mode, setMode] = useState<RoomWorkspaceMode>('browse');
  const [query, setQuery] = useState('');
  const [deviceQuery, setDeviceQuery] = useState('');
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<RoomWorkspaceGroupId>>(
    () => new Set()
  );
  const setDraftWorkspace = useCallback(
    (
      update: RoomWorkspaceV2 | null | ((current: RoomWorkspaceV2 | null) => RoomWorkspaceV2 | null)
    ) => dispatchEditorSession({ type: 'set-draft', update }),
    []
  );
  const setStage = useCallback(
    (nextStage: RoomWorkspaceStage) =>
      dispatchEditorSession({ type: 'set-stage', stage: nextStage }),
    []
  );
  const setSelectedRoomId = useCallback(
    (roomId: RoomWorkspaceRoomId | null) =>
      dispatchEditorSession({ type: 'set-selected-room', roomId }),
    []
  );
  const setPendingPlacements = useCallback(
    (
      update:
        | Record<string, RoomWorkspaceRoomId | null>
        | ((
            current: Record<string, RoomWorkspaceRoomId | null>
          ) => Record<string, RoomWorkspaceRoomId | null>)
    ) => dispatchEditorSession({ type: 'set-pending-placements', update }),
    []
  );
  const setRoomNameDrafts = useCallback(
    (
      update:
        | Partial<Record<RoomWorkspaceRoomId, string>>
        | ((
            current: Partial<Record<RoomWorkspaceRoomId, string>>
          ) => Partial<Record<RoomWorkspaceRoomId, string>>)
    ) => dispatchEditorSession({ type: 'set-room-name-drafts', update }),
    []
  );
  const setPendingProviderDeletions = useCallback(
    (
      update:
        | PendingProviderRoomDeletion[]
        | ((current: PendingProviderRoomDeletion[]) => PendingProviderRoomDeletion[])
    ) => dispatchEditorSession({ type: 'set-provider-deletions', update }),
    []
  );
  const setPendingOperation = useCallback(
    (operation: RoomWorkspacePendingOperation | null) =>
      dispatchEditorSession({ type: 'set-operation', operation }),
    []
  );
  const markSessionDirty = useCallback(() => dispatchEditorSession({ type: 'mark-dirty' }), []);
  const initializedForOpenSessionRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      initializedForOpenSessionRef.current = false;
      return;
    }
    if (initializedForOpenSessionRef.current) {
      return;
    }
    initializedForOpenSessionRef.current = true;

    const workspace = initializeWorkspace(discoveredRooms, {
      legacyAllName: ALL_ROOMS_ID,
    });
    const orderedRooms = getRoomWorkspaceRoomsInDisplayOrderV2(workspace);
    const firstRoom =
      orderedRooms.find((room) => room.metadata.favoriteRank !== undefined) ??
      orderedRooms[0] ??
      null;

    dispatchEditorSession({
      type: 'opened',
      workspace,
      selectedRoomId: firstRoom?.id ?? null,
    });
    setMode('browse');
    setQuery('');
    setDeviceQuery('');
  }, [discoveredRooms, initializeWorkspace, isOpen]);

  const orderedRooms = useMemo(
    () => (draftWorkspace ? getRoomWorkspaceRoomsInDisplayOrderV2(draftWorkspace) : []),
    [draftWorkspace]
  );
  const draftIndex = useMemo(
    () => (draftWorkspace ? buildRoomWorkspaceIndexV2(draftWorkspace) : null),
    [draftWorkspace]
  );
  const committedIndex = useMemo(
    () => (committedWorkspace ? buildRoomWorkspaceIndexV2(committedWorkspace) : null),
    [committedWorkspace]
  );
  const entities = useMemo(
    () =>
      Object.values(entitiesByCanonicalId).sort((left, right) =>
        left.name.localeCompare(right.name)
      ),
    [entitiesByCanonicalId]
  );

  const resolvedRoomIdByEntityId = useMemo(() => {
    const roomIds = new Map<string, RoomWorkspaceRoomId | null>();
    if (!draftIndex) {
      return roomIds;
    }

    for (const entity of entities) {
      const pendingRoomId = Object.hasOwn(pendingPlacements, entity.canonicalId)
        ? pendingPlacements[entity.canonicalId]
        : undefined;
      roomIds.set(
        entity.canonicalId,
        pendingRoomId !== undefined
          ? pendingRoomId
          : resolveEntityWorkspaceRoomId(entity, draftIndex, roomIdsByEntityId)
      );
    }
    return roomIds;
  }, [draftIndex, entities, pendingPlacements, roomIdsByEntityId]);
  const committedRoomIdByEntityId = useMemo(() => {
    const roomIds = new Map<string, RoomWorkspaceRoomId | null>();
    if (!committedIndex) {
      return roomIds;
    }
    for (const entity of entities) {
      roomIds.set(
        entity.canonicalId,
        resolveEntityWorkspaceRoomId(entity, committedIndex, roomIdsByEntityId)
      );
    }
    return roomIds;
  }, [committedIndex, entities, roomIdsByEntityId]);

  const deviceCountByRoomId = useMemo(() => {
    const counts = new Map<RoomWorkspaceRoomId, number>();
    resolvedRoomIdByEntityId.forEach((roomId) => {
      if (roomId) {
        counts.set(roomId, (counts.get(roomId) ?? 0) + 1);
      }
    });
    return counts;
  }, [resolvedRoomIdByEntityId]);

  const queryValue = normalizeSearchValue(query);
  const filteredRooms = useMemo(() => {
    if (!queryValue || !draftWorkspace) {
      return orderedRooms;
    }

    const groupNames = new Map(
      draftWorkspace.groups.map((group) => [group.id, normalizeSearchValue(group.displayName)])
    );
    return orderedRooms.filter((room) => {
      const groupName = room.metadata.groupId ? (groupNames.get(room.metadata.groupId) ?? '') : '';
      return (
        normalizeSearchValue(room.displayName).includes(queryValue) ||
        groupName.includes(queryValue) ||
        room.sourceRefs.some((sourceRef) =>
          providerLabel(sourceRef.providerId).toLocaleLowerCase().includes(queryValue)
        )
      );
    });
  }, [draftWorkspace, orderedRooms, queryValue]);

  useEffect(() => {
    if (queryValue && selectedRoomId && !filteredRooms.some((room) => room.id === selectedRoomId)) {
      setSelectedRoomId(filteredRooms[0]?.id ?? null);
    }
  }, [filteredRooms, queryValue, selectedRoomId]);

  const roomViewModels = useMemo<RoomWorkspaceRoomViewModel[]>(() => {
    if (!draftWorkspace) {
      return [];
    }

    const roomNameCounts = new Map<string, number>();
    for (const room of draftWorkspace.rooms) {
      const normalizedName = normalizeSearchValue(room.displayName);
      roomNameCounts.set(normalizedName, (roomNameCounts.get(normalizedName) ?? 0) + 1);
    }

    return filteredRooms.map((room) => {
      const count = roomEntityCounts.get(room.displayName) ?? deviceCountByRoomId.get(room.id) ?? 0;
      const hasDuplicateName =
        (roomNameCounts.get(normalizeSearchValue(room.displayName)) ?? 0) > 1;
      const nameValidationMessage =
        roomNameDrafts[room.id] !== undefined && !roomNameDrafts[room.id]?.trim()
          ? t('dashboard.roomsWorkspace.validation.nameRequired')
          : hasDuplicateName
            ? t('dashboard.roomsWorkspace.validation.duplicateRoom', {
                name: room.displayName,
              })
            : undefined;
      const reviewIssue = draftWorkspace.reviewIssues.find(
        (issue) => issue.placeholderRoomId === room.id || issue.candidateRoomIds.includes(room.id)
      );
      const canDeleteProviderRoom =
        room.sourceRefs.length === 1 &&
        manageableRoomById.get(room.sourceRefs[0].canonicalId)?.canDelete === true;

      return {
        id: room.id,
        name: room.displayName,
        nameDraft: roomNameDrafts[room.id] ?? room.displayName,
        groupId: room.metadata.groupId ?? null,
        symbol: room.metadata.symbol,
        image: room.metadata.image?.value,
        nameValidationMessage,
        description:
          room.sourceRefs.length > 0
            ? room.sourceRefs
                .map((sourceRef) => providerLabel(sourceRef.providerId))
                .filter((label, index, labels) => labels.indexOf(label) === index)
                .join(' · ')
            : t('dashboard.roomsWorkspace.impact.localTitle'),
        deviceSummary: formatDeviceCount(t, count),
        attentionSummary: reviewIssue
          ? t('dashboard.roomsWorkspace.reviewChanges')
          : nameValidationMessage
            ? nameValidationMessage
            : undefined,
        statusLabel:
          room.metadata.visibility === 'hidden'
            ? t('dashboard.roomNav.reorderDialog.roomHidden')
            : undefined,
        statusTone: room.metadata.visibility === 'hidden' ? 'neutral' : undefined,
        isVisible: room.metadata.visibility === 'visible',
        isFavorite: room.metadata.favoriteRank !== undefined,
        canDelete:
          (room.origin === 'navet' && room.sourceRefs.length === 0) || canDeleteProviderRoom,
        canMerge: draftWorkspace.rooms.length > 1,
        canSplit: count > 1,
      };
    });
  }, [
    deviceCountByRoomId,
    draftWorkspace,
    filteredRooms,
    manageableRoomById,
    roomEntityCounts,
    roomNameDrafts,
    t,
  ]);
  const hasValidationErrors = useMemo(() => {
    if (Object.values(roomNameDrafts).some((name) => !name?.trim())) {
      return true;
    }
    const names = (draftWorkspace?.rooms ?? []).map((room) =>
      normalizeSearchValue(room.displayName)
    );
    return names.some((name) => !name) || new Set(names).size !== names.length;
  }, [draftWorkspace, roomNameDrafts]);

  const groupViewModels = useMemo<RoomWorkspaceGroupViewModel[]>(() => {
    if (!draftWorkspace) {
      return [];
    }
    const visibleRoomIds = new Set(filteredRooms.map((room) => room.id));

    return [...draftWorkspace.groups]
      .sort((left, right) => left.order - right.order)
      .map((group) => {
        const roomIds = orderedRooms
          .filter((room) => room.metadata.groupId === group.id && visibleRoomIds.has(room.id))
          .map((room) => room.id);
        return {
          id: group.id,
          name: group.displayName,
          symbol: group.symbol,
          summary: formatRoomCount(t, roomIds.length),
          roomIds,
          isCollapsed: collapsedGroupIds.has(group.id),
          canRename: true,
          canDelete: true,
        };
      });
  }, [collapsedGroupIds, draftWorkspace, filteredRooms, orderedRooms, queryValue, t]);

  const deviceQueryValue = normalizeSearchValue(deviceQuery);
  const hiddenDashboardEntityIdSet = useMemo(
    () => new Set(hiddenDashboardEntityIds),
    [hiddenDashboardEntityIds]
  );
  const explicitlyShownEntityIdSet = useMemo(
    () => new Set(explicitlyShownEntityIds),
    [explicitlyShownEntityIds]
  );
  const shownSensorEntityIdSet = useMemo(
    () => new Set(shownSensorEntityIds),
    [shownSensorEntityIds]
  );
  const dashboardEntityIdSet = useMemo(
    () => (dashboardEntityIds ? new Set(dashboardEntityIds) : null),
    [dashboardEntityIds]
  );
  const dashboardVisibleEntityIdSet = useMemo(
    () => (dashboardVisibleEntityIds ? new Set(dashboardVisibleEntityIds) : null),
    [dashboardVisibleEntityIds]
  );
  const deviceViewModels = useMemo<RoomWorkspaceDeviceViewModel[]>(
    () =>
      entities
        .filter((entity) => {
          if (!deviceQueryValue) {
            return true;
          }
          return (
            normalizeSearchValue(entity.name).includes(deviceQueryValue) ||
            normalizeSearchValue(entity.type).includes(deviceQueryValue) ||
            normalizeSearchValue(providerLabel(entity.providerId)).includes(deviceQueryValue)
          );
        })
        .map((entity) => {
          const roomId = resolvedRoomIdByEntityId.get(entity.canonicalId) ?? null;
          const isDashboardDevice =
            dashboardEntityIdSet === null || setContainsEntityId(entity, dashboardEntityIdSet);
          return {
            id: entity.canonicalId,
            name: entity.name,
            entityType: entity.type,
            deviceClass:
              typeof entity.attributes.device_class === 'string'
                ? entity.attributes.device_class
                : undefined,
            description: providerLabel(entity.providerId),
            stateLabel: entity.primaryState === null ? undefined : String(entity.primaryState),
            roomId,
            roomName: roomId ? draftIndex?.roomById.get(roomId)?.displayName : undefined,
            isUnavailable: entity.availability === 'unavailable',
            isDashboardDevice,
            isShownOnDashboard:
              isDashboardDevice &&
              (dashboardVisibleEntityIdSet
                ? setContainsEntityId(entity, dashboardVisibleEntityIdSet)
                : isEntityShownOnDashboard(
                    entity,
                    hiddenDashboardEntityIdSet,
                    shownSensorEntityIdSet,
                    explicitlyShownEntityIdSet
                  )),
          };
        }),
    [
      dashboardEntityIdSet,
      dashboardVisibleEntityIdSet,
      deviceQueryValue,
      draftIndex,
      entities,
      hiddenDashboardEntityIdSet,
      resolvedRoomIdByEntityId,
      shownSensorEntityIdSet,
      explicitlyShownEntityIdSet,
    ]
  );

  const selectedDeviceIds = useMemo(
    () =>
      selectedRoomId
        ? entities
            .filter((entity) => resolvedRoomIdByEntityId.get(entity.canonicalId) === selectedRoomId)
            .map((entity) => entity.canonicalId)
        : [],
    [entities, resolvedRoomIdByEntityId, selectedRoomId]
  );
  const changes = useMemo(
    () =>
      buildWorkspaceChanges({
        committedWorkspace,
        draftWorkspace,
        entitiesByCanonicalId,
        committedRoomIdByEntityId,
        pendingPlacements,
        pendingProviderDeletions,
        saveOutcome,
        t,
      }),
    [
      committedWorkspace,
      committedRoomIdByEntityId,
      draftWorkspace,
      entitiesByCanonicalId,
      pendingPlacements,
      pendingProviderDeletions,
      saveOutcome,
      t,
    ]
  );
  const hasUnsavedChanges =
    !areWorkspacesEqual(committedWorkspace, draftWorkspace) ||
    Object.keys(pendingPlacements).length > 0 ||
    Object.keys(roomNameDrafts).length > 0 ||
    pendingProviderDeletions.length > 0;
  const unsavedChangeCount = useMemo(
    () =>
      countWorkspaceChanges({
        committedWorkspace,
        draftWorkspace,
        pendingPlacements,
        pendingProviderDeletions,
      }) + Object.keys(roomNameDrafts).length,
    [
      committedWorkspace,
      draftWorkspace,
      pendingPlacements,
      pendingProviderDeletions,
      roomNameDrafts,
    ]
  );

  const dismissOperation = useCallback(() => setPendingOperation(null), []);

  const confirmNameOperation = useCallback(
    (name: string) => {
      if (!draftWorkspace || !pendingOperation || !name.trim()) {
        return;
      }

      switch (pendingOperation.kind) {
        case 'create-room':
        case 'split-room': {
          const result = createNavetRoomWorkspaceRoomV2(draftWorkspace, {
            displayName: name,
          });
          let nextWorkspace = result.workspace;
          if (result.roomId && pendingOperation.kind === 'create-room') {
            nextWorkspace = assignRoomWorkspaceGroupV2(
              nextWorkspace,
              result.roomId,
              pendingOperation.groupId ?? null
            );
          }
          if (result.roomId && pendingOperation.kind === 'split-room') {
            const sourceRoom = draftIndex?.roomById.get(pendingOperation.sourceRoomId);
            nextWorkspace = assignRoomWorkspaceGroupV2(
              nextWorkspace,
              result.roomId,
              sourceRoom?.metadata.groupId ?? null
            );
            setSelectedRoomId(result.roomId);
            setMode('manage');
            setStage('device-selection');
          } else if (result.roomId) {
            setSelectedRoomId(result.roomId);
            setMode('manage');
            setStage('room-details');
          }
          setDraftWorkspace(nextWorkspace);
          break;
        }
        case 'create-group': {
          setDraftWorkspace(
            createRoomWorkspaceGroupV2(draftWorkspace, { displayName: name }).workspace
          );
          break;
        }
        case 'rename-group': {
          setDraftWorkspace(
            renameRoomWorkspaceGroupV2(draftWorkspace, pendingOperation.groupId, name)
          );
          break;
        }
        default:
          return;
      }

      setPendingOperation(null);
      markSessionDirty();
    },
    [draftIndex, draftWorkspace, pendingOperation]
  );

  const confirmMerge = useCallback(
    (targetRoomIdValue: string) => {
      if (!draftWorkspace || pendingOperation?.kind !== 'merge-room') {
        return;
      }
      const targetRoomId = targetRoomIdValue as RoomWorkspaceRoomId;
      const sourceRoom = draftIndex?.roomById.get(pendingOperation.sourceRoomId);
      if (
        !sourceRoom ||
        !draftIndex?.roomById.has(targetRoomId) ||
        targetRoomId === sourceRoom.id
      ) {
        return;
      }

      let nextWorkspace = draftWorkspace;
      for (const sourceRef of sourceRoom.sourceRefs) {
        nextWorkspace = unlinkRoomWorkspaceSourceV2(
          nextWorkspace,
          sourceRoom.id,
          sourceRef.canonicalId
        );
        nextWorkspace = linkRoomWorkspaceSourceV2(nextWorkspace, targetRoomId, sourceRef);
      }
      nextWorkspace = removeRoomWorkspaceMetadataV2(nextWorkspace, sourceRoom.id);
      const persistedLocalEntityIds = entities
        .filter((entity) => getEntityOverrideId(entity, roomIdsByEntityId) === sourceRoom.id)
        .map((entity) => entity.canonicalId);
      setPendingPlacements((current) => ({
        ...Object.fromEntries(
          Object.entries(current).map(([entityId, roomId]) => [
            entityId,
            roomId === sourceRoom.id ? targetRoomId : roomId,
          ])
        ),
        ...Object.fromEntries(persistedLocalEntityIds.map((entityId) => [entityId, targetRoomId])),
      }));
      setDraftWorkspace(nextWorkspace);
      setSelectedRoomId(targetRoomId);
      setPendingOperation(null);
      markSessionDirty();
    },
    [draftIndex, draftWorkspace, entities, pendingOperation, roomIdsByEntityId]
  );

  const confirmDeviceMove = useCallback(
    (targetRoomIdValue: string) => {
      if (!draftWorkspace || pendingOperation?.kind !== 'move-device') {
        return;
      }
      const targetRoomId = targetRoomIdValue as RoomWorkspaceRoomId;
      if (
        !draftIndex?.roomById.has(targetRoomId) ||
        targetRoomId === pendingOperation.sourceRoomId
      ) {
        return;
      }

      setPendingPlacements((current) => {
        const next = { ...current };
        if ((committedRoomIdByEntityId.get(pendingOperation.deviceId) ?? null) === targetRoomId) {
          delete next[pendingOperation.deviceId];
        } else {
          next[pendingOperation.deviceId] = targetRoomId;
        }
        return next;
      });
      setPendingOperation(null);
      markSessionDirty();
    },
    [committedRoomIdByEntityId, draftIndex, draftWorkspace, pendingOperation]
  );

  const confirmAppearance = useCallback(
    ({ symbol, image }: { symbol: string | null; image: RoomWorkspaceImageReferenceV2 | null }) => {
      if (!draftWorkspace || !pendingOperation) {
        return;
      }

      if (pendingOperation.kind === 'appearance') {
        setDraftWorkspace(
          setRoomWorkspaceRoomImageV2(
            setRoomWorkspaceRoomSymbolV2(draftWorkspace, pendingOperation.roomId, symbol),
            pendingOperation.roomId,
            image
          )
        );
      } else if (pendingOperation.kind === 'appearance-group') {
        setDraftWorkspace(
          setRoomWorkspaceGroupSymbolV2(draftWorkspace, pendingOperation.groupId, symbol)
        );
      } else {
        return;
      }
      setPendingOperation(null);
      markSessionDirty();
    },
    [draftWorkspace, pendingOperation]
  );

  const confirmDelete = useCallback(
    (destinationRoomIdValue: string | null = null) => {
      if (!draftWorkspace || !pendingOperation) {
        return;
      }

      if (pendingOperation.kind === 'delete-group') {
        setDraftWorkspace(deleteRoomWorkspaceGroupV2(draftWorkspace, pendingOperation.groupId));
        setPendingOperation(null);
        markSessionDirty();
        return;
      }
      if (pendingOperation.kind !== 'delete-room') {
        return;
      }

      const room = draftIndex?.roomById.get(pendingOperation.roomId);
      if (!room) {
        return;
      }
      const destinationRoomId = destinationRoomIdValue as RoomWorkspaceRoomId | null;
      if (
        destinationRoomId &&
        (destinationRoomId === room.id || !draftIndex?.roomById.has(destinationRoomId))
      ) {
        return;
      }
      const affectedEntityIds = entities
        .filter(
          (entity) => resolvedRoomIdByEntityId.get(entity.canonicalId) === pendingOperation.roomId
        )
        .map((entity) => entity.canonicalId);
      setPendingPlacements((current) => {
        const next = { ...current };
        for (const entityId of affectedEntityIds) {
          if (destinationRoomId) {
            next[entityId] = destinationRoomId;
            continue;
          }

          if (room.origin === 'navet' && room.sourceRefs.length === 0) {
            const entity = entitiesByCanonicalId[entityId];
            if (entity && getEntityOverrideId(entity, roomIdsByEntityId) === room.id) {
              next[entityId] = null;
            } else {
              delete next[entityId];
            }
            continue;
          }

          next[entityId] = null;
        }
        return next;
      });

      if (room.origin === 'navet' && room.sourceRefs.length === 0) {
        setDraftWorkspace(deleteNavetRoomWorkspaceRoomV2(draftWorkspace, room.id));
      } else if (
        room.sourceRefs.length === 1 &&
        manageableRoomById.get(room.sourceRefs[0].canonicalId)?.canDelete === true
      ) {
        const sourceRef = room.sourceRefs[0];
        setPendingProviderDeletions((current) => [
          ...current,
          {
            room,
            sourceRef,
            memberIds:
              normalizedRoomsByCanonicalId[sourceRef.canonicalId]?.memberIds ?? affectedEntityIds,
          },
        ]);
        setDraftWorkspace(removeRoomWorkspaceMetadataV2(draftWorkspace, room.id));
      }

      setSelectedRoomId(null);
      setStage('structure');
      setPendingOperation(null);
      markSessionDirty();
    },
    [
      draftIndex,
      draftWorkspace,
      entities,
      entitiesByCanonicalId,
      manageableRoomById,
      normalizedRoomsByCanonicalId,
      pendingOperation,
      resolvedRoomIdByEntityId,
      roomIdsByEntityId,
    ]
  );

  const handleSave = useCallback(async () => {
    if (!draftWorkspace || isSaving || hasValidationErrors) {
      return;
    }

    dispatchEditorSession({ type: 'save-started' });
    const result = await executeRoomWorkspaceMutationTransaction(
      {
        committedWorkspace,
        draftWorkspace,
        entitiesByCanonicalId,
        pendingPlacements,
        pendingProviderDeletions,
        roomIdsByEntityId,
      },
      {
        clearRoomOverride,
        replaceWorkspace,
        setRoomOverride,
      }
    );

    if (result.kind !== 'saved') {
      dispatchEditorSession({
        type: 'save-failed',
        outcome: { kind: result.kind, failureCount: result.failureCount },
        pendingPlacements: result.pendingPlacements,
        pendingProviderDeletions: result.pendingProviderDeletions,
      });
      return;
    }

    const nextRooms = getRoomWorkspaceRoomsInDisplayOrderV2(result.workspace);
    onRoomOrderChange?.(nextRooms.map((room) => room.displayName));
    onHiddenRoomsChange?.(
      nextRooms
        .filter((room) => room.metadata.visibility === 'hidden')
        .map((room) => room.displayName)
    );
    dispatchEditorSession({ type: 'save-succeeded', workspace: result.workspace });
  }, [
    clearRoomOverride,
    committedWorkspace,
    draftWorkspace,
    entitiesByCanonicalId,
    hasValidationErrors,
    isSaving,
    onHiddenRoomsChange,
    onRoomOrderChange,
    pendingPlacements,
    pendingProviderDeletions,
    replaceWorkspace,
    roomIdsByEntityId,
    setRoomOverride,
  ]);

  const handleDiscard = useCallback(() => {
    const committedRooms = committedWorkspace
      ? getRoomWorkspaceRoomsInDisplayOrderV2(committedWorkspace)
      : [];
    const nextSelectedRoomId =
      committedRooms.find((room) => room.id === selectedRoomId)?.id ??
      committedRooms[0]?.id ??
      null;
    dispatchEditorSession({ type: 'discarded', selectedRoomId: nextSelectedRoomId });
  }, [committedWorkspace, selectedRoomId]);

  const actions = useMemo<RoomWorkspaceActions>(
    () => ({
      onModeChange: (nextMode) => {
        if (nextMode === 'browse' && hasUnsavedChanges) {
          setStage('impact-review');
          return;
        }
        setMode(nextMode);
        if (nextMode === 'manage') {
          setStage('structure');
        } else if (!selectedRoomId) {
          setSelectedRoomId(orderedRooms[0]?.id ?? null);
        }
      },
      onStageChange: setStage,
      onQueryChange: setQuery,
      onDeviceQueryChange: setDeviceQuery,
      onSelectRoom: (roomId) => setSelectedRoomId(roomId as RoomWorkspaceRoomId | null),
      onAddRoom: (groupId) =>
        setPendingOperation({
          kind: 'create-room',
          ...(groupId ? { groupId: groupId as RoomWorkspaceGroupId } : {}),
        }),
      onAddGroup: () => setPendingOperation({ kind: 'create-group' }),
      onMoveGroup: (groupId, direction) => {
        setDraftWorkspace((current) => {
          if (!current) {
            return current;
          }
          const orderedIds = [...current.groups]
            .sort((left, right) => left.order - right.order)
            .map((group) => group.id);
          const currentIndex = orderedIds.indexOf(groupId as RoomWorkspaceGroupId);
          const nextIndex = currentIndex + (direction === 'earlier' ? -1 : 1);
          if (currentIndex < 0 || nextIndex < 0 || nextIndex >= orderedIds.length) {
            return current;
          }
          const nextIds = [...orderedIds];
          const [movedId] = nextIds.splice(currentIndex, 1);
          nextIds.splice(nextIndex, 0, movedId);
          return reorderRoomWorkspaceGroupsV2(current, nextIds);
        });
        markSessionDirty();
      },
      onRenameGroup: (groupId) =>
        setPendingOperation({
          kind: 'rename-group',
          groupId: groupId as RoomWorkspaceGroupId,
        }),
      onChooseGroupAppearance: (groupId) =>
        setPendingOperation({
          kind: 'appearance-group',
          groupId: groupId as RoomWorkspaceGroupId,
        }),
      onRequestGroupDeletion: (groupId) =>
        setPendingOperation({
          kind: 'delete-group',
          groupId: groupId as RoomWorkspaceGroupId,
        }),
      onRoomNameChange: (roomId, name) => {
        const roomIdV2 = roomId as RoomWorkspaceRoomId;
        if (!name.trim()) {
          setRoomNameDrafts((current) => ({ ...current, [roomIdV2]: name }));
          markSessionDirty();
          return;
        }
        setRoomNameDrafts((current) => {
          const next = { ...current };
          delete next[roomIdV2];
          return next;
        });
        setDraftWorkspace((current) =>
          current ? renameRoomWorkspaceRoomV2(current, roomIdV2, name) : current
        );
        markSessionDirty();
      },
      onRoomGroupChange: (roomId, groupId) => {
        setDraftWorkspace((current) =>
          current
            ? assignRoomWorkspaceGroupV2(
                current,
                roomId as RoomWorkspaceRoomId,
                groupId as RoomWorkspaceGroupId | null
              )
            : current
        );
        markSessionDirty();
      },
      onRoomVisibilityChange: (roomId, visible) => {
        setDraftWorkspace((current) =>
          current
            ? setRoomWorkspaceVisibilityV2(
                current,
                roomId as RoomWorkspaceRoomId,
                visible ? 'visible' : 'hidden'
              )
            : current
        );
        markSessionDirty();
      },
      onRoomFavoriteChange: (roomId, favorite) => {
        setDraftWorkspace((current) => {
          if (!current) {
            return current;
          }
          const nextRank = favorite
            ? Math.max(-1, ...current.rooms.map((room) => room.metadata.favoriteRank ?? -1)) + 1
            : null;
          return setRoomWorkspaceFavoriteRankV2(current, roomId as RoomWorkspaceRoomId, nextRank);
        });
        markSessionDirty();
      },
      onChooseRoomAppearance: (roomId) =>
        setPendingOperation({
          kind: 'appearance',
          roomId: roomId as RoomWorkspaceRoomId,
        }),
      onRequestRoomMerge: (roomId) =>
        setPendingOperation({
          kind: 'merge-room',
          sourceRoomId: roomId as RoomWorkspaceRoomId,
        }),
      onRequestRoomSplit: (roomId) =>
        setPendingOperation({
          kind: 'split-room',
          sourceRoomId: roomId as RoomWorkspaceRoomId,
        }),
      onRequestRoomDeletion: (roomId) =>
        setPendingOperation({
          kind: 'delete-room',
          roomId: roomId as RoomWorkspaceRoomId,
        }),
      onDropRoom: (roomId, targetRoomId) => {
        setDraftWorkspace((current) => {
          if (!current || roomId === targetRoomId) {
            return current;
          }

          const roomIdV2 = roomId as RoomWorkspaceRoomId;
          const targetRoomIdV2 = targetRoomId as RoomWorkspaceRoomId;
          const orderedIds = getRoomWorkspaceRoomsInDisplayOrderV2(current).map((room) => room.id);
          const currentIndex = orderedIds.indexOf(roomIdV2);
          const targetIndex = orderedIds.indexOf(targetRoomIdV2);
          const targetRoom = current.rooms.find((room) => room.id === targetRoomIdV2);
          if (currentIndex < 0 || targetIndex < 0 || !targetRoom) {
            return current;
          }

          const nextIds = [...orderedIds];
          nextIds.splice(currentIndex, 1);
          nextIds.splice(targetIndex, 0, roomIdV2);
          const groupedWorkspace = assignRoomWorkspaceGroupV2(
            current,
            roomIdV2,
            targetRoom.metadata.groupId ?? null
          );
          return reorderRoomWorkspaceRoomsV2(groupedWorkspace, nextIds);
        });
        markSessionDirty();
      },
      onToggleGroup: (groupId, collapsed) => {
        setCollapsedGroupIds((current) => {
          const next = new Set(current);
          if (collapsed) {
            next.add(groupId as RoomWorkspaceGroupId);
          } else {
            next.delete(groupId as RoomWorkspaceGroupId);
          }
          return next;
        });
      },
      onDeviceVisibilityChange: (deviceId, visible) => {
        if (visible) {
          showDashboardEntity(deviceId);
        } else {
          hideDashboardEntity(deviceId);
        }
      },
      onRequestDeviceMove: (deviceId) => {
        if (!selectedRoomId || !selectedDeviceIds.includes(deviceId)) {
          return;
        }
        setPendingOperation({
          kind: 'move-device',
          deviceId,
          sourceRoomId: selectedRoomId,
        });
      },
      onDeviceSelectionChange: (deviceId, selected) => {
        if (!selectedRoomId) {
          return;
        }
        const nextRoomId = selected ? selectedRoomId : null;
        setPendingPlacements((current) => {
          const next = { ...current };
          if ((committedRoomIdByEntityId.get(deviceId) ?? null) === nextRoomId) {
            delete next[deviceId];
          } else {
            next[deviceId] = nextRoomId;
          }
          return next;
        });
        markSessionDirty();
      },
      onDiscard: handleDiscard,
      onSave: () => {
        void handleSave();
      },
      onRetry: () => {
        void handleSave();
      },
    }),
    [
      committedRoomIdByEntityId,
      handleDiscard,
      handleSave,
      hasUnsavedChanges,
      hideDashboardEntity,
      orderedRooms,
      selectedDeviceIds,
      selectedRoomId,
      showDashboardEntity,
    ]
  );

  const status: RoomWorkspaceViewModel['status'] =
    orderedRooms.length === 0
      ? {
          kind: 'empty',
          title: t('dashboard.roomsWorkspace.status.emptyTitle'),
          description: t('dashboard.roomsWorkspace.status.emptyDescription'),
          actionLabel: t('dashboard.roomsWorkspace.createRoom.action'),
        }
      : { kind: 'ready' };
  const viewModel: RoomWorkspaceViewModel = {
    status,
    mode,
    stage,
    query,
    deviceQuery,
    inventorySummary: formatRoomCount(t, orderedRooms.length),
    resultSummary: queryValue ? formatRoomCount(t, filteredRooms.length) : undefined,
    selectionSummary: formatSelectedCount(t, selectedDeviceIds.length),
    groups: groupViewModels,
    rooms: roomViewModels,
    selectedRoomId,
    devices: deviceViewModels,
    selectedDeviceIds,
    changes,
    unsavedChangeCount,
    hasUnsavedChanges,
    hasValidationErrors,
    isSaving,
  };

  return {
    viewModel,
    roomDeviceCounts: deviceCountByRoomId,
    actions,
    draftWorkspace,
    pendingOperation,
    saveOutcome,
    dismissOperation,
    confirmNameOperation,
    confirmMerge,
    confirmDeviceMove,
    confirmAppearance,
    confirmDelete,
  };
}
