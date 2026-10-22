import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import { STORAGE_KEYS } from '@navet/app/constants/storage-keys';
import { getDashboardClientIdentity } from '@navet/app/features/dashboard/clients/dashboard-client-identity';
import { pathToDashboardId } from '@navet/app/navigation/sections';
import {
  readLocalStorageWithMigration,
  removeLocalStorageWithMigration,
  writeLocalStorageWithMigration,
} from '@navet/app/utils/local-storage-migration';
import { storage } from '@navet/app/utils/storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { isRoomWorkspaceRoomId } from '../rooms/room-workspace-v2';
import { useCardZonesStore } from '../stores/card-zones-store';
import { type CardType, type CustomCard, useCustomCardsStore } from '../stores/custom-cards-store';
import {
  DEFAULT_HOME_DASHBOARD_LAYOUT,
  type HomeDashboardLayoutState,
  useHomeDashboardLayoutStore,
} from '../stores/home-dashboard-layout-store';
import type { ZoneName } from '../zones/zone-types';
import {
  createDashboardDefinition,
  createLegacyDashboardCollection,
  type DashboardActivationSource,
  type DashboardCompanionSettings,
  type DashboardCreateInput,
  type DashboardId,
  deleteDashboardFromCollection,
  MAX_DASHBOARD_COUNT,
  type NavetDashboardCollection,
  normalizeHomeDashboardLayout,
  type RoomCompanionMode,
  resolveDashboard,
  sanitizeDashboardCollection,
  sanitizeDashboardCompanion,
  sanitizeDashboardName,
} from './dashboard-collection';

const ACTIVE_DASHBOARD_SESSION_KEY = 'navet-active-dashboard';
const HOME_LAYOUT_HISTORY_LIMIT = 50;

interface LayoutHistory {
  future: HomeDashboardLayoutState[];
  past: HomeDashboardLayoutState[];
}

interface DashboardCollectionState {
  collection: NavetDashboardCollection;
  activeDashboardId: DashboardId;
  activeSource: DashboardActivationSource;
  pendingAssignedDashboardId: DashboardId | null;
  companionCustomizationOpen: boolean;
  setCompanionCustomizationOpen: (open: boolean) => void;
  layoutHistory: LayoutHistory;
  replaceCollection: (collection: NavetDashboardCollection) => void;
  resetCollection: () => void;
  activateDashboard: (
    dashboardId: DashboardId,
    source?: DashboardActivationSource,
    options?: { rememberPreview?: boolean }
  ) => void;
  applyPendingAssignment: () => void;
  syncDashboardFromLocation: () => void;
  createDashboard: (input: DashboardCreateInput) => NavetDashboardDefinitionResult;
  renameDashboard: (dashboardId: DashboardId, name: string) => void;
  duplicateDashboard: (dashboardId: DashboardId, name?: string) => DashboardId | null;
  deleteDashboard: (dashboardId: DashboardId) => void;
  reorderDashboards: (order: DashboardId[]) => void;
  setDefaultDashboard: (dashboardId: DashboardId) => void;
  assignDashboard: (clientId: string, dashboardId: DashboardId) => void;
  clearDashboardAssignment: (clientId: string) => void;
  updateCompanion: (dashboardId: DashboardId, settings: DashboardCompanionSettings) => void;
  updateRoomCompanion: (
    dashboardId: DashboardId,
    roomId: string,
    settings: DashboardCompanionSettings | null
  ) => void;
  selectRoomCompanion: (dashboardId: DashboardId, roomId: string, mode: RoomCompanionMode) => void;
  updateActiveHomeLayout: (
    updater:
      | HomeDashboardLayoutState
      | ((previous: HomeDashboardLayoutState) => HomeDashboardLayoutState)
  ) => void;
  replaceActiveHomeLayout: (layout: HomeDashboardLayoutState) => void;
  undoActiveHomeLayout: () => void;
  redoActiveHomeLayout: () => void;
  updateActiveCardSize: (cardId: string, size: CardSize) => void;
  updateActiveCardZone: (cardId: string, zone: ZoneName) => void;
  addActiveCustomCard: (
    type: CardType,
    size: CardSize,
    room: string,
    data?: Record<string, unknown>
  ) => CustomCard;
  removeActiveCustomCard: (cardId: string) => void;
  updateActiveCustomCard: (
    cardId: string,
    updates: Partial<Omit<CustomCard, 'id' | 'createdAt'>>
  ) => void;
}

interface NavetDashboardDefinitionResult {
  dashboardId: DashboardId;
  created: boolean;
}

function readSessionDashboardId() {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.sessionStorage.getItem(ACTIVE_DASHBOARD_SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSessionDashboardId(dashboardId: string | null) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (dashboardId) {
      window.sessionStorage.setItem(ACTIVE_DASHBOARD_SESSION_KEY, dashboardId);
    } else {
      window.sessionStorage.removeItem(ACTIVE_DASHBOARD_SESSION_KEY);
    }
  } catch {
    // Session storage is an enhancement; assignment/default resolution still works without it.
  }
}

function getDirectDashboardId() {
  if (typeof window === 'undefined') {
    return null;
  }
  return pathToDashboardId(window.location.pathname);
}

function legacyCollection() {
  const customCards = useCustomCardsStore.getState().cards;
  const homeLayout = useHomeDashboardLayoutStore.getState();
  const cardZones = useCardZonesStore.getState().cardZones;
  return createLegacyDashboardCollection({
    homeLayout,
    customCards,
    cardZones,
    cardSizes: storage.get<Record<string, unknown>>(STORAGE_KEYS.cardSizes, {}),
  });
}

function resolveInitialActive(collection: NavetDashboardCollection) {
  const client = getDashboardClientIdentity();
  return resolveDashboard(collection, {
    clientId: client.id,
    directDashboardId: getDirectDashboardId(),
    previewDashboardId: readSessionDashboardId(),
  });
}

function pickLayout(layout: HomeDashboardLayoutState): HomeDashboardLayoutState {
  return {
    mode: layout.mode,
    showHero: layout.showHero,
    cardIds: [...layout.cardIds],
    sections: layout.sections.map((section) => ({ ...section })),
    cardSectionAssignments: { ...layout.cardSectionAssignments },
  };
}

function layoutsEqual(left: HomeDashboardLayoutState, right: HomeDashboardLayoutState) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function updateDefinition(
  state: DashboardCollectionState,
  dashboardId: string,
  updater: (
    definition: NavetDashboardCollection['dashboardsById'][string]
  ) => NavetDashboardCollection['dashboardsById'][string]
) {
  const definition = state.collection.dashboardsById[dashboardId];
  if (!definition) {
    return state.collection;
  }
  return {
    ...state.collection,
    dashboardsById: {
      ...state.collection.dashboardsById,
      [dashboardId]: {
        ...updater(definition),
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

const initialLegacyCollection = legacyCollection();
const initialResolved = resolveInitialActive(initialLegacyCollection);

export const useDashboardCollectionStore = create<DashboardCollectionState>()(
  persist(
    (set, get) => ({
      collection: initialLegacyCollection,
      activeDashboardId: initialResolved.dashboardId,
      activeSource: initialResolved.source,
      pendingAssignedDashboardId: null,
      companionCustomizationOpen: false,
      setCompanionCustomizationOpen: (open) => set({ companionCustomizationOpen: open }),
      layoutHistory: { future: [], past: [] },
      replaceCollection: (nextCollection) =>
        set((state) => {
          const collection = sanitizeDashboardCollection(nextCollection, legacyCollection());
          const clientId = getDashboardClientIdentity().id;
          const previousAssignment =
            state.collection.dashboardIdByClientId[clientId] ?? state.collection.defaultDashboardId;
          const nextAssignment =
            collection.dashboardIdByClientId[clientId] ?? collection.defaultDashboardId;
          const directDashboardId = getDirectDashboardId();
          const directDashboardExists = Boolean(
            directDashboardId && collection.dashboardsById[directDashboardId]
          );
          const activeStillExists = Boolean(collection.dashboardsById[state.activeDashboardId]);
          const shouldDeferAssignment =
            previousAssignment !== nextAssignment &&
            (state.activeSource === 'assignment' || state.activeSource === 'default');
          const resolved =
            directDashboardId && directDashboardExists
              ? { dashboardId: directDashboardId, source: 'link' as const }
              : activeStillExists
                ? { dashboardId: state.activeDashboardId, source: state.activeSource }
                : resolveDashboard(collection, { clientId });
          return {
            collection,
            activeDashboardId: resolved.dashboardId,
            activeSource: resolved.source,
            pendingAssignedDashboardId:
              shouldDeferAssignment && !directDashboardExists ? nextAssignment : null,
            layoutHistory: { future: [], past: [] },
          };
        }),
      resetCollection: () =>
        set(() => {
          writeSessionDashboardId(null);
          const collection = createLegacyDashboardCollection({
            homeLayout: DEFAULT_HOME_DASHBOARD_LAYOUT,
          });
          const resolved = resolveInitialActive(collection);
          return {
            collection,
            activeDashboardId: resolved.dashboardId,
            activeSource: resolved.source,
            pendingAssignedDashboardId: null,
            layoutHistory: { future: [], past: [] },
          };
        }),
      activateDashboard: (
        dashboardId,
        source = 'preview',
        { rememberPreview = source === 'preview' } = {}
      ) =>
        set((state) => {
          if (!state.collection.dashboardsById[dashboardId]) {
            return state;
          }
          writeSessionDashboardId(rememberPreview ? dashboardId : null);
          return {
            activeDashboardId: dashboardId,
            activeSource: source,
            pendingAssignedDashboardId: null,
            layoutHistory: { future: [], past: [] },
          };
        }),
      applyPendingAssignment: () =>
        set((state) => {
          const dashboardId = state.pendingAssignedDashboardId;
          if (!dashboardId || !state.collection.dashboardsById[dashboardId]) {
            return { pendingAssignedDashboardId: null };
          }
          writeSessionDashboardId(null);
          return {
            activeDashboardId: dashboardId,
            activeSource: 'assignment' as const,
            pendingAssignedDashboardId: null,
            layoutHistory: { future: [], past: [] },
          };
        }),
      syncDashboardFromLocation: () =>
        set((state) => {
          const directDashboardId = getDirectDashboardId();
          if (directDashboardId && state.collection.dashboardsById[directDashboardId]) {
            return {
              activeDashboardId: directDashboardId,
              activeSource: 'link' as const,
              pendingAssignedDashboardId: null,
              layoutHistory: { future: [], past: [] },
            };
          }
          if (state.activeSource !== 'link') {
            return state;
          }
          const resolved = resolveDashboard(state.collection, {
            clientId: getDashboardClientIdentity().id,
            previewDashboardId: readSessionDashboardId(),
          });
          return {
            activeDashboardId: resolved.dashboardId,
            activeSource: resolved.source,
            pendingAssignedDashboardId: null,
            layoutHistory: { future: [], past: [] },
          };
        }),
      createDashboard: (input) => {
        const state = get();
        if (state.collection.order.length >= MAX_DASHBOARD_COUNT) {
          return { dashboardId: state.activeDashboardId, created: false };
        }
        const dashboard = createDashboardDefinition(input);
        set({
          collection: {
            ...state.collection,
            order: [...state.collection.order, dashboard.id],
            dashboardsById: {
              ...state.collection.dashboardsById,
              [dashboard.id]: dashboard,
            },
          },
        });
        return { dashboardId: dashboard.id, created: true };
      },
      renameDashboard: (dashboardId, name) =>
        set((state) => ({
          collection: updateDefinition(state, dashboardId, (definition) => ({
            ...definition,
            name: sanitizeDashboardName(name, definition.name),
          })),
        })),
      duplicateDashboard: (dashboardId, name) => {
        const state = get();
        const source = state.collection.dashboardsById[dashboardId];
        if (!source || state.collection.order.length >= MAX_DASHBOARD_COUNT) {
          return null;
        }
        const result = get().createDashboard({
          name: name ?? `${source.name} copy`,
          source: { kind: 'copy', dashboard: source },
        });
        return result.created ? result.dashboardId : null;
      },
      deleteDashboard: (dashboardId) =>
        set((state) => {
          const collection = deleteDashboardFromCollection(state.collection, dashboardId);
          if (collection === state.collection) {
            return state;
          }
          const activeDeleted = state.activeDashboardId === dashboardId;
          const clientId = getDashboardClientIdentity().id;
          const resolved = activeDeleted
            ? resolveDashboard(collection, { clientId })
            : { dashboardId: state.activeDashboardId, source: state.activeSource };
          if (activeDeleted) {
            writeSessionDashboardId(null);
          }
          return {
            collection,
            activeDashboardId: resolved.dashboardId,
            activeSource: resolved.source,
            pendingAssignedDashboardId: null,
            layoutHistory: { future: [], past: [] },
          };
        }),
      reorderDashboards: (order) =>
        set((state) => {
          const validOrder = [
            ...new Set(order.filter((dashboardId) => state.collection.dashboardsById[dashboardId])),
          ];
          for (const dashboardId of state.collection.order) {
            if (!validOrder.includes(dashboardId)) {
              validOrder.push(dashboardId);
            }
          }
          return { collection: { ...state.collection, order: validOrder } };
        }),
      setDefaultDashboard: (dashboardId) =>
        set((state) =>
          state.collection.dashboardsById[dashboardId]
            ? { collection: { ...state.collection, defaultDashboardId: dashboardId } }
            : state
        ),
      assignDashboard: (clientId, dashboardId) =>
        set((state) => {
          if (!clientId.trim() || !state.collection.dashboardsById[dashboardId]) {
            return state;
          }
          const isCurrentClient = clientId === getDashboardClientIdentity().id;
          if (isCurrentClient) {
            writeSessionDashboardId(null);
          }
          return {
            collection: {
              ...state.collection,
              dashboardIdByClientId: {
                ...state.collection.dashboardIdByClientId,
                [clientId]: dashboardId,
              },
            },
            ...(isCurrentClient
              ? {
                  activeDashboardId: dashboardId,
                  activeSource: 'assignment' as const,
                  pendingAssignedDashboardId: null,
                  layoutHistory: { future: [], past: [] },
                }
              : {}),
          };
        }),
      clearDashboardAssignment: (clientId) =>
        set((state) => {
          if (!Object.hasOwn(state.collection.dashboardIdByClientId, clientId)) {
            return state;
          }
          const dashboardIdByClientId = { ...state.collection.dashboardIdByClientId };
          delete dashboardIdByClientId[clientId];
          const isCurrentClient = clientId === getDashboardClientIdentity().id;
          if (isCurrentClient) {
            writeSessionDashboardId(null);
          }
          return {
            collection: { ...state.collection, dashboardIdByClientId },
            ...(isCurrentClient
              ? {
                  activeDashboardId: state.collection.defaultDashboardId,
                  activeSource: 'default' as const,
                  pendingAssignedDashboardId: null,
                  layoutHistory: { future: [], past: [] },
                }
              : {}),
          };
        }),
      updateCompanion: (dashboardId, settings) =>
        set((state) => ({
          collection: updateDefinition(state, dashboardId, (definition) => ({
            ...definition,
            companion: sanitizeDashboardCompanion(settings),
          })),
        })),
      updateRoomCompanion: (dashboardId, roomId, settings) =>
        set((state) => {
          if (!isRoomWorkspaceRoomId(roomId)) return state;
          return {
            collection: updateDefinition(state, dashboardId, (definition) => {
              const roomCompanions = { ...definition.roomCompanions };
              const roomCompanionModes = { ...definition.roomCompanionModes };
              if (settings === null) {
                delete roomCompanions[roomId];
                delete roomCompanionModes[roomId];
              } else roomCompanions[roomId] = sanitizeDashboardCompanion(settings);
              return { ...definition, roomCompanions, roomCompanionModes };
            }),
          };
        }),
      selectRoomCompanion: (dashboardId, roomId, mode) =>
        set((state) => {
          const definition = state.collection.dashboardsById[dashboardId];
          if (!isRoomWorkspaceRoomId(roomId) || !definition?.roomCompanions?.[roomId]) return state;
          return {
            collection: updateDefinition(state, dashboardId, (current) => ({
              ...current,
              roomCompanionModes: { ...current.roomCompanionModes, [roomId]: mode },
            })),
          };
        }),
      updateActiveHomeLayout: (updater) =>
        set((state) => {
          const definition = state.collection.dashboardsById[state.activeDashboardId];
          if (!definition) {
            return state;
          }
          const nextLayout = normalizeHomeDashboardLayout(
            typeof updater === 'function' ? updater(definition.homeLayout) : updater
          );
          if (layoutsEqual(definition.homeLayout, nextLayout)) {
            return state;
          }
          return {
            collection: updateDefinition(state, state.activeDashboardId, (current) => ({
              ...current,
              homeLayout: nextLayout,
            })),
            layoutHistory: {
              future: [],
              past: [...state.layoutHistory.past, pickLayout(definition.homeLayout)].slice(
                -HOME_LAYOUT_HISTORY_LIMIT
              ),
            },
          };
        }),
      replaceActiveHomeLayout: (layout) => get().updateActiveHomeLayout(layout),
      undoActiveHomeLayout: () =>
        set((state) => {
          const definition = state.collection.dashboardsById[state.activeDashboardId];
          const previousLayout = state.layoutHistory.past.at(-1);
          if (!definition || !previousLayout) {
            return state;
          }
          return {
            collection: updateDefinition(state, state.activeDashboardId, (current) => ({
              ...current,
              homeLayout: pickLayout(previousLayout),
            })),
            layoutHistory: {
              past: state.layoutHistory.past.slice(0, -1),
              future: [pickLayout(definition.homeLayout), ...state.layoutHistory.future].slice(
                0,
                HOME_LAYOUT_HISTORY_LIMIT
              ),
            },
          };
        }),
      redoActiveHomeLayout: () =>
        set((state) => {
          const definition = state.collection.dashboardsById[state.activeDashboardId];
          const nextLayout = state.layoutHistory.future[0];
          if (!definition || !nextLayout) {
            return state;
          }
          return {
            collection: updateDefinition(state, state.activeDashboardId, (current) => ({
              ...current,
              homeLayout: pickLayout(nextLayout),
            })),
            layoutHistory: {
              past: [...state.layoutHistory.past, pickLayout(definition.homeLayout)].slice(
                -HOME_LAYOUT_HISTORY_LIMIT
              ),
              future: state.layoutHistory.future.slice(1),
            },
          };
        }),
      updateActiveCardSize: (cardId, size) =>
        set((state) => ({
          collection: updateDefinition(state, state.activeDashboardId, (definition) => ({
            ...definition,
            homeCardSizes: { ...definition.homeCardSizes, [cardId]: size },
          })),
        })),
      updateActiveCardZone: (cardId, zone) =>
        set((state) => ({
          collection: updateDefinition(state, state.activeDashboardId, (definition) => ({
            ...definition,
            homeCardZones: { ...definition.homeCardZones, [cardId]: zone },
          })),
        })),
      addActiveCustomCard: (type, size, room, data) => {
        const card: CustomCard = {
          id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          type,
          size,
          room,
          data,
          createdAt: Date.now(),
        };
        set((state) => ({
          collection: updateDefinition(state, state.activeDashboardId, (definition) => ({
            ...definition,
            homeCustomCards: [...definition.homeCustomCards, card],
          })),
        }));
        return card;
      },
      removeActiveCustomCard: (cardId) =>
        set((state) => ({
          collection: updateDefinition(state, state.activeDashboardId, (definition) => ({
            ...definition,
            homeCustomCards: definition.homeCustomCards.filter((card) => card.id !== cardId),
            homeCardSizes: Object.fromEntries(
              Object.entries(definition.homeCardSizes).filter(([id]) => id !== cardId)
            ),
            homeCardZones: Object.fromEntries(
              Object.entries(definition.homeCardZones).filter(([id]) => id !== cardId)
            ),
          })),
        })),
      updateActiveCustomCard: (cardId, updates) =>
        set((state) => ({
          collection: updateDefinition(state, state.activeDashboardId, (definition) => ({
            ...definition,
            homeCustomCards: definition.homeCustomCards.map((card) =>
              card.id === cardId ? { ...card, ...updates } : card
            ),
          })),
        })),
    }),
    {
      name: STORAGE_KEYS.dashboardCollection,
      storage: createJSONStorage(() => ({
        getItem: (name) => readLocalStorageWithMigration(name, localStorage),
        setItem: (name, value) => writeLocalStorageWithMigration(name, value, localStorage),
        removeItem: (name) => removeLocalStorageWithMigration(name, localStorage),
      })),
      partialize: (state) => ({ collection: state.collection }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<DashboardCollectionState> | undefined;
        const collection = sanitizeDashboardCollection(
          persisted?.collection,
          currentState.collection
        );
        const resolved = resolveInitialActive(collection);
        return {
          ...currentState,
          collection,
          activeDashboardId: resolved.dashboardId,
          activeSource: resolved.source,
        };
      },
    }
  )
);
