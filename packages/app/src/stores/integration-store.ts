import { integrationSessionRuntime } from '@navet/app/integration-session-runtime';
import type { ProviderHealth } from '@navet/app/platform/types';
import { getRegisteredProviderContract } from '@navet/app/provider-contract-registry';
import { getProviderRuntimeRegistration } from '@navet/app/provider-runtime-registry';
import type {
  IntegrationProviderRoomModel,
  IntegrationProviderRuntimeState,
  IntegrationRoomDescriptor,
} from '@navet/app/stores/integration-models';
import type { DeviceCollection } from '@navet/app/types/device.types';
import type { IntegrationUser } from '@navet/app/types/integration-user';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import {
  IMPLEMENTED_INTEGRATION_PROVIDER_IDS,
  INTEGRATION_PROVIDER_IDS,
  INTEGRATION_PROVIDERS,
  isImplementedIntegrationProviderId,
} from '@navet/app/types/provider';
import type { NavetProviderSession } from '@navet/core/provider-contract';
import type { PlatformManageableRoomReference } from '@navet/core/provider-feature-models';
import { createProviderRoomManagementCapabilities } from '@navet/core/provider-room-management';
import type {
  NavetEntity,
  NavetEntityEvent,
  NavetProviderRoom,
  NavetProviderState,
} from '@navet/core/types';
import type { DashboardEntityView } from '@navet/ui/dashboard-entity-view';
import { createStore } from 'zustand/vanilla';
import { type HomeAssistantStore, homeAssistantStore } from './home-assistant-store';
import {
  buildManageableRoomsByProviderId,
  buildProviderScopedState,
  buildRoomDescriptors,
  collectProviderEntityEvents,
  flattenProviderRecords,
  type ProviderScopedState,
  replaceFlattenedProviderRecord,
  reuseValue,
} from './provider-state-pipeline';

interface IntegrationRuntimeState {
  availableProviderIds: IntegrationProviderId[];
  selectedProviderIds: IntegrationProviderId[];
  providerHealth: Record<IntegrationProviderId, ProviderHealth>;
  providerRuntime: Record<IntegrationProviderId, IntegrationProviderRuntimeState>;
  providers: IntegrationProviderId[];
  currentProviderId: IntegrationProviderId;
  providerSessions: Partial<Record<IntegrationProviderId, NavetProviderSession>>;
  providerEntitiesByProviderId: Partial<Record<IntegrationProviderId, Record<string, NavetEntity>>>;
  providerEntityLookupByProviderId: Partial<Record<IntegrationProviderId, Record<string, string>>>;
  providerEntitiesByCanonicalId: Record<string, NavetEntity>;
  providerEntityViewsByProviderId: Partial<
    Record<IntegrationProviderId, Record<string, DashboardEntityView>>
  >;
  providerEntityViewsByCanonicalId: Record<string, DashboardEntityView>;
  providerEvents: NavetEntityEvent[];
  providerDeviceCollectionsByProviderId: Partial<Record<IntegrationProviderId, DeviceCollection>>;
  providerNormalizedRoomsByProviderId: Partial<
    Record<IntegrationProviderId, Record<string, NavetProviderRoom>>
  >;
  manageableRoomsByProviderId: Partial<
    Record<IntegrationProviderId, PlatformManageableRoomReference[]>
  >;
  providerRoomsByProviderId: Partial<
    Record<IntegrationProviderId, Record<string, IntegrationProviderRoomModel>>
  >;
  normalizedRoomsByCanonicalId: Record<string, NavetProviderRoom>;
  roomsByCanonicalId: Record<string, IntegrationProviderRoomModel>;
  roomDescriptors: IntegrationRoomDescriptor[];
  currentUser: IntegrationUser | null;
  setSelectedProviders: (providerIds: IntegrationProviderId[]) => void;
  setIntegrationUser: (user: IntegrationUser | null) => void;
  setCurrentProviderId: (providerId: IntegrationProviderId) => void;
  setProviderSessions: (
    sessions: Partial<Record<IntegrationProviderId, NavetProviderSession>>
  ) => void;
  applyPreviewProviderState: (
    providerId: IntegrationProviderId,
    options: {
      homeAssistantState: Pick<
        HomeAssistantStore,
        | 'areas'
        | 'config'
        | 'connected'
        | 'connecting'
        | 'connection'
        | 'deviceRegistry'
        | 'entities'
        | 'entityRegistry'
        | 'error'
        | 'reconnecting'
        | 'registriesHydrated'
        | 'user'
      >;
      currentProviderId?: IntegrationProviderId;
      selectedProviderIds?: IntegrationProviderId[];
      currentUser?: IntegrationUser | null;
    }
  ) => void;
}

export type IntegrationStore = IntegrationRuntimeState;

function getProviderSessionsSnapshot(): Partial<
  Record<IntegrationProviderId, NavetProviderSession>
> {
  const snapshot = integrationSessionRuntime.getSnapshot();
  const sessions = snapshot.sessions ?? {};
  const sessionEntries = (Object.keys(sessions) as IntegrationProviderId[])
    .map((providerId): [IntegrationProviderId, NavetProviderSession | null] => [
      providerId,
      getRegisteredProviderContract(providerId).bootstrapSession?.(sessions) ?? null,
    ])
    .filter((entry): entry is [IntegrationProviderId, NavetProviderSession] => entry[1] !== null);

  return Object.fromEntries(sessionEntries) as Partial<
    Record<IntegrationProviderId, NavetProviderSession>
  >;
}

function resolveInitialCurrentProviderId(
  sessions: Partial<Record<IntegrationProviderId, NavetProviderSession>>
): IntegrationProviderId {
  const providerOrder = INTEGRATION_PROVIDER_IDS;
  return providerOrder.find((providerId) => sessions[providerId]) ?? 'home_assistant';
}

function resolveInitialSelectedProviderIds(
  sessions: Partial<Record<IntegrationProviderId, NavetProviderSession>>
): IntegrationProviderId[] {
  const providerOrder = INTEGRATION_PROVIDER_IDS.filter((providerId) => sessions[providerId]);
  return providerOrder.length > 0 ? providerOrder : ['home_assistant', 'homey'];
}

function getProviderState(providerId: IntegrationProviderId): NavetProviderState | null {
  try {
    const contract = getRegisteredProviderContract(providerId);
    return typeof contract.getState === 'function' ? contract.getState() : null;
  } catch {
    // Some startup and unit-test paths still initialize the store before provider registrations.
    return null;
  }
}

function buildCurrentProviderScopedState(
  providerId: IntegrationProviderId,
  previousState?: ProviderScopedState
) {
  return buildProviderScopedState({
    providerId,
    providerState: getProviderState(providerId),
    previousState,
  });
}

function buildCurrentRoomDescriptors(
  normalizedRoomsByCanonicalId: Record<string, NavetProviderRoom>
) {
  return buildRoomDescriptors({ normalizedRoomsByCanonicalId });
}

function createProviderRuntimeState(
  providerId: IntegrationProviderId,
  options: Omit<IntegrationProviderRuntimeState, 'providerId'>
): IntegrationProviderRuntimeState {
  return {
    providerId,
    ...options,
  };
}

function buildProviderRuntimeState(
  providerId: IntegrationProviderId,
  providerState: NavetProviderState | null
): IntegrationProviderRuntimeState {
  return createProviderRuntimeState(providerId, {
    connected: providerState?.connected ?? false,
    connecting: providerState?.connecting ?? false,
    reconnecting: providerState?.reconnecting ?? false,
    entitiesHydrated: providerState?.entitiesHydrated ?? false,
    registriesHydrated: providerState?.registriesHydrated ?? false,
  });
}

function buildProviderRuntime(
  providerStateByProviderId: Record<IntegrationProviderId, ProviderScopedState>
): Record<IntegrationProviderId, IntegrationProviderRuntimeState> {
  return Object.fromEntries(
    INTEGRATION_PROVIDER_IDS.map((providerId) => [
      providerId,
      buildProviderRuntimeState(
        providerId,
        providerStateByProviderId[providerId].sourceProviderState
      ),
    ])
  ) as Record<IntegrationProviderId, IntegrationProviderRuntimeState>;
}

function buildProviderHealth(
  providerId: IntegrationProviderId,
  providerState: NavetProviderState | null
): ProviderHealth {
  return {
    providerId,
    connected: providerState?.connected ?? false,
    connecting: providerState?.connecting ?? false,
    reconnecting: providerState?.reconnecting ?? false,
    implementationStatus: INTEGRATION_PROVIDERS[providerId].implementationStatus,
    lastError: providerState?.error ?? null,
    ...(providerState?.unreachable !== undefined ? { unreachable: providerState.unreachable } : {}),
  };
}

function buildProviderHealthRecord(
  providerStateByProviderId: Record<IntegrationProviderId, ProviderScopedState>
): Record<IntegrationProviderId, ProviderHealth> {
  return Object.fromEntries(
    INTEGRATION_PROVIDER_IDS.map((providerId) => [
      providerId,
      buildProviderHealth(providerId, providerStateByProviderId[providerId].sourceProviderState),
    ])
  ) as Record<IntegrationProviderId, ProviderHealth>;
}

function resolveProviderRoomManagementCapabilities(providerId: IntegrationProviderId) {
  if (!isImplementedIntegrationProviderId(providerId)) {
    return createProviderRoomManagementCapabilities(providerId);
  }

  const registration = getProviderRuntimeRegistration(providerId);
  return (
    registration?.roomManagementCapabilities ??
    createProviderRoomManagementCapabilities(providerId, {
      discover: registration?.featureMatrix?.rooms ?? false,
    })
  );
}

export const integrationStore = createStore<IntegrationStore>()((set) => {
  const providerScopedStateByProviderId = {} as Record<IntegrationProviderId, ProviderScopedState>;

  const buildInitialProviderScopedState = () => {
    const providerStateByProviderId = Object.fromEntries(
      INTEGRATION_PROVIDER_IDS.map((providerId) => [
        providerId,
        buildCurrentProviderScopedState(providerId),
      ])
    ) as Record<IntegrationProviderId, ProviderScopedState>;

    Object.assign(providerScopedStateByProviderId, providerStateByProviderId);

    return {
      providerDeviceCollectionsByProviderId: Object.fromEntries(
        INTEGRATION_PROVIDER_IDS.map((providerId) => [
          providerId,
          providerStateByProviderId[providerId].deviceCollection,
        ])
      ) as Record<IntegrationProviderId, DeviceCollection>,
      providerEntitiesByProviderId: Object.fromEntries(
        INTEGRATION_PROVIDER_IDS.map((providerId) => [
          providerId,
          providerStateByProviderId[providerId].entitiesByCanonicalId,
        ])
      ) as Record<IntegrationProviderId, Record<string, NavetEntity>>,
      providerEntityLookupByProviderId: Object.fromEntries(
        INTEGRATION_PROVIDER_IDS.map((providerId) => [
          providerId,
          providerStateByProviderId[providerId].entityLookupByCanonicalId,
        ])
      ) as Record<IntegrationProviderId, Record<string, string>>,
      providerEntityViewsByProviderId: Object.fromEntries(
        INTEGRATION_PROVIDER_IDS.map((providerId) => [
          providerId,
          providerStateByProviderId[providerId].entityViewsByCanonicalId,
        ])
      ) as Record<IntegrationProviderId, Record<string, DashboardEntityView>>,
      providerNormalizedRoomsByProviderId: Object.fromEntries(
        INTEGRATION_PROVIDER_IDS.map((providerId) => [
          providerId,
          providerStateByProviderId[providerId].normalizedRoomsByCanonicalId,
        ])
      ) as Record<IntegrationProviderId, Record<string, NavetProviderRoom>>,
      providerRoomsByProviderId: Object.fromEntries(
        INTEGRATION_PROVIDER_IDS.map((providerId) => [
          providerId,
          providerStateByProviderId[providerId].roomsByCanonicalId,
        ])
      ) as Record<IntegrationProviderId, Record<string, IntegrationProviderRoomModel>>,
    };
  };

  const syncProviderState = (
    current: IntegrationStore,
    providerId: IntegrationProviderId,
    nextProviderScopedState: ProviderScopedState,
    nextProviderRuntime: IntegrationProviderRuntimeState,
    nextProviderHealth: ProviderHealth,
    extraState: Partial<IntegrationStore> = {},
    options: {
      shouldRebuildRoomDescriptors?: boolean;
    } = {}
  ): IntegrationStore => {
    const previousEntities = current.providerEntitiesByProviderId[providerId] ?? {};
    const previousViews = current.providerEntityViewsByProviderId[providerId] ?? {};
    const previousLookup = current.providerEntityLookupByProviderId[providerId] ?? {};
    const previousCollections = current.providerDeviceCollectionsByProviderId[providerId];
    const previousNormalizedRooms = current.providerNormalizedRoomsByProviderId[providerId] ?? {};
    const previousRooms = current.providerRoomsByProviderId[providerId] ?? {};

    providerScopedStateByProviderId[providerId] = nextProviderScopedState;

    const providerEntitiesByProviderId =
      previousEntities === nextProviderScopedState.entitiesByCanonicalId
        ? current.providerEntitiesByProviderId
        : {
            ...current.providerEntitiesByProviderId,
            [providerId]: nextProviderScopedState.entitiesByCanonicalId,
          };
    const providerEntityViewsByProviderId =
      previousViews === nextProviderScopedState.entityViewsByCanonicalId
        ? current.providerEntityViewsByProviderId
        : {
            ...current.providerEntityViewsByProviderId,
            [providerId]: nextProviderScopedState.entityViewsByCanonicalId,
          };
    const providerEntityLookupByProviderId =
      previousLookup === nextProviderScopedState.entityLookupByCanonicalId
        ? current.providerEntityLookupByProviderId
        : {
            ...current.providerEntityLookupByProviderId,
            [providerId]: nextProviderScopedState.entityLookupByCanonicalId,
          };
    const providerDeviceCollectionsByProviderId =
      previousCollections === nextProviderScopedState.deviceCollection
        ? current.providerDeviceCollectionsByProviderId
        : {
            ...current.providerDeviceCollectionsByProviderId,
            [providerId]: nextProviderScopedState.deviceCollection,
          };
    const providerNormalizedRoomsByProviderId =
      previousNormalizedRooms === nextProviderScopedState.normalizedRoomsByCanonicalId
        ? current.providerNormalizedRoomsByProviderId
        : {
            ...current.providerNormalizedRoomsByProviderId,
            [providerId]: nextProviderScopedState.normalizedRoomsByCanonicalId,
          };
    const providerRoomsByProviderId =
      previousRooms === nextProviderScopedState.roomsByCanonicalId
        ? current.providerRoomsByProviderId
        : {
            ...current.providerRoomsByProviderId,
            [providerId]: nextProviderScopedState.roomsByCanonicalId,
          };

    const providerEntitiesByCanonicalId = replaceFlattenedProviderRecord(
      current.providerEntitiesByCanonicalId,
      previousEntities,
      nextProviderScopedState.entitiesByCanonicalId,
      nextProviderScopedState.entityDeltaIds
    );
    const providerEntityViewsByCanonicalId = replaceFlattenedProviderRecord(
      current.providerEntityViewsByCanonicalId,
      previousViews,
      nextProviderScopedState.entityViewsByCanonicalId,
      nextProviderScopedState.entityDeltaIds
    );
    const normalizedRoomsByCanonicalId = replaceFlattenedProviderRecord(
      current.normalizedRoomsByCanonicalId,
      previousNormalizedRooms,
      nextProviderScopedState.normalizedRoomsByCanonicalId
    );
    const roomsByCanonicalId = replaceFlattenedProviderRecord(
      current.roomsByCanonicalId,
      previousRooms,
      nextProviderScopedState.roomsByCanonicalId
    );
    const providerEvents = collectProviderEntityEvents(
      providerId,
      previousEntities,
      nextProviderScopedState.entitiesByCanonicalId,
      nextProviderScopedState.entityDeltaIds
    );
    const shouldRebuildRoomDescriptors =
      options.shouldRebuildRoomDescriptors === true ||
      previousNormalizedRooms !== nextProviderScopedState.normalizedRoomsByCanonicalId;
    const roomDescriptors = shouldRebuildRoomDescriptors
      ? reuseValue(
          current.roomDescriptors,
          buildCurrentRoomDescriptors(normalizedRoomsByCanonicalId)
        )
      : current.roomDescriptors;
    const manageableRoomsByProviderId =
      roomDescriptors === current.roomDescriptors
        ? current.manageableRoomsByProviderId
        : reuseValue(
            current.manageableRoomsByProviderId,
            buildManageableRoomsByProviderId(
              roomDescriptors,
              resolveProviderRoomManagementCapabilities
            )
          );
    const mergedProviderRuntime = reuseValue(
      current.providerRuntime[providerId],
      nextProviderRuntime
    );
    const providerRuntime =
      mergedProviderRuntime === current.providerRuntime[providerId]
        ? current.providerRuntime
        : {
            ...current.providerRuntime,
            [providerId]: mergedProviderRuntime,
          };
    const mergedProviderHealth = reuseValue(current.providerHealth[providerId], nextProviderHealth);
    const providerHealth =
      mergedProviderHealth === current.providerHealth[providerId]
        ? current.providerHealth
        : {
            ...current.providerHealth,
            [providerId]: mergedProviderHealth,
          };

    const hasExtraStateChanges = Object.entries(extraState).some(
      ([key, value]) => current[key as keyof IntegrationStore] !== value
    );
    const hasProviderChanges =
      providerDeviceCollectionsByProviderId !== current.providerDeviceCollectionsByProviderId ||
      providerNormalizedRoomsByProviderId !== current.providerNormalizedRoomsByProviderId ||
      providerEntityLookupByProviderId !== current.providerEntityLookupByProviderId ||
      providerEntitiesByProviderId !== current.providerEntitiesByProviderId ||
      providerEntityViewsByProviderId !== current.providerEntityViewsByProviderId ||
      providerRoomsByProviderId !== current.providerRoomsByProviderId ||
      providerEntitiesByCanonicalId !== current.providerEntitiesByCanonicalId ||
      providerEntityViewsByCanonicalId !== current.providerEntityViewsByCanonicalId ||
      normalizedRoomsByCanonicalId !== current.normalizedRoomsByCanonicalId ||
      manageableRoomsByProviderId !== current.manageableRoomsByProviderId ||
      providerRuntime !== current.providerRuntime ||
      roomsByCanonicalId !== current.roomsByCanonicalId ||
      roomDescriptors !== current.roomDescriptors ||
      providerHealth !== current.providerHealth ||
      providerEvents.length > 0;

    if (!hasExtraStateChanges && !hasProviderChanges) {
      return current;
    }

    return {
      ...current,
      ...extraState,
      providerDeviceCollectionsByProviderId,
      providerNormalizedRoomsByProviderId,
      providerEntityLookupByProviderId,
      providerEntitiesByProviderId,
      providerEntityViewsByProviderId,
      providerRoomsByProviderId,
      providerEntitiesByCanonicalId,
      providerEntityViewsByCanonicalId,
      normalizedRoomsByCanonicalId,
      manageableRoomsByProviderId,
      providerEvents:
        providerEvents.length > 0
          ? [...current.providerEvents, ...providerEvents].slice(-100)
          : current.providerEvents,
      providerRuntime,
      roomsByCanonicalId,
      roomDescriptors,
      providerHealth,
    };
  };

  const currentHomeAssistantState = homeAssistantStore.getState();
  let homeAssistantControlConnection = currentHomeAssistantState.connection;
  const initialCanonicalState = buildInitialProviderScopedState();
  const initialProviderRuntime = buildProviderRuntime(providerScopedStateByProviderId);
  const initialProviderEntitiesByCanonicalId = flattenProviderRecords(
    initialCanonicalState.providerEntitiesByProviderId
  );
  const initialProviderEntityViewsByCanonicalId = flattenProviderRecords(
    initialCanonicalState.providerEntityViewsByProviderId
  );
  const initialNormalizedRoomsByCanonicalId = flattenProviderRecords(
    initialCanonicalState.providerNormalizedRoomsByProviderId
  );
  const initialRoomsByCanonicalId = flattenProviderRecords(
    initialCanonicalState.providerRoomsByProviderId
  );
  const initialRoomDescriptors = buildCurrentRoomDescriptors(initialNormalizedRoomsByCanonicalId);
  const initialManageableRoomsByProviderId = buildManageableRoomsByProviderId(
    initialRoomDescriptors,
    resolveProviderRoomManagementCapabilities
  );
  const initialProviderSessions = getProviderSessionsSnapshot();
  const initialProviderHealth = buildProviderHealthRecord(providerScopedStateByProviderId);

  const syncRegisteredProviderState = (providerId: IntegrationProviderId) => {
    const nextProviderScopedState = buildCurrentProviderScopedState(
      providerId,
      providerScopedStateByProviderId[providerId]
    );
    const providerState = nextProviderScopedState.sourceProviderState;
    const homeAssistantState =
      providerId === 'home_assistant' ? homeAssistantStore.getState() : null;
    // The panel adapter replaces this bridge for transport or authenticated-user changes.
    // Publish that boundary through the existing normalized owner session used by controls.
    const replaceHomeAssistantSession = Boolean(
      homeAssistantState?.connected &&
        homeAssistantState.connection &&
        homeAssistantControlConnection !== homeAssistantState.connection
    );
    if (homeAssistantState) homeAssistantControlConnection = homeAssistantState.connection;

    set((current) =>
      syncProviderState(
        current,
        providerId,
        nextProviderScopedState,
        buildProviderRuntimeState(providerId, providerState),
        buildProviderHealth(providerId, providerState),
        providerId === 'home_assistant'
          ? {
              currentUser: replaceHomeAssistantSession
                ? (homeAssistantState?.user ?? current.currentUser)
                : (current.currentUser ?? homeAssistantState?.user ?? null),
              ...(replaceHomeAssistantSession
                ? {
                    providerSessions: {
                      ...current.providerSessions,
                      home_assistant: {
                        ...current.providerSessions.home_assistant,
                        providerId: 'home_assistant',
                        connected: true,
                      },
                    },
                  }
                : {}),
            }
          : undefined
      )
    );
  };

  for (const providerId of IMPLEMENTED_INTEGRATION_PROVIDER_IDS) {
    getRegisteredProviderContract(providerId).subscribeState?.(() =>
      syncRegisteredProviderState(providerId)
    );
  }

  return {
    currentUser: currentHomeAssistantState.user,
    availableProviderIds: Object.keys(INTEGRATION_PROVIDERS) as IntegrationProviderId[],
    providers: Object.keys(INTEGRATION_PROVIDERS) as IntegrationProviderId[],
    currentProviderId: resolveInitialCurrentProviderId(initialProviderSessions),
    selectedProviderIds: resolveInitialSelectedProviderIds(initialProviderSessions),
    providerSessions: initialProviderSessions,
    providerEntitiesByProviderId: initialCanonicalState.providerEntitiesByProviderId,
    providerEntityLookupByProviderId: initialCanonicalState.providerEntityLookupByProviderId,
    providerEntitiesByCanonicalId: initialProviderEntitiesByCanonicalId,
    providerEntityViewsByProviderId: initialCanonicalState.providerEntityViewsByProviderId,
    providerEntityViewsByCanonicalId: initialProviderEntityViewsByCanonicalId,
    providerEvents: [],
    providerRuntime: initialProviderRuntime,
    providerDeviceCollectionsByProviderId:
      initialCanonicalState.providerDeviceCollectionsByProviderId,
    providerNormalizedRoomsByProviderId: initialCanonicalState.providerNormalizedRoomsByProviderId,
    manageableRoomsByProviderId: initialManageableRoomsByProviderId,
    providerRoomsByProviderId: initialCanonicalState.providerRoomsByProviderId,
    normalizedRoomsByCanonicalId: initialNormalizedRoomsByCanonicalId,
    roomsByCanonicalId: initialRoomsByCanonicalId,
    roomDescriptors: initialRoomDescriptors,
    providerHealth: initialProviderHealth,
    setSelectedProviders: (providerIds) =>
      set({
        selectedProviderIds: Array.from(new Set(providerIds)),
      }),
    setIntegrationUser: (user) => set({ currentUser: user }),
    setCurrentProviderId: (providerId) => set({ currentProviderId: providerId }),
    setProviderSessions: (sessions) =>
      set((current) => ({
        providerSessions: {
          ...current.providerSessions,
          ...sessions,
        },
      })),
    applyPreviewProviderState: (providerId, options) => {
      const nextProviderScopedState = buildCurrentProviderScopedState(
        providerId,
        providerScopedStateByProviderId[providerId]
      );
      const providerState = nextProviderScopedState.sourceProviderState;

      set((current) =>
        syncProviderState(
          current,
          providerId,
          nextProviderScopedState,
          buildProviderRuntimeState(providerId, providerState),
          buildProviderHealth(providerId, providerState),
          {
            currentProviderId: options.currentProviderId ?? current.currentProviderId,
            selectedProviderIds: options.selectedProviderIds ?? current.selectedProviderIds,
            currentUser:
              options.currentUser ?? options.homeAssistantState.user ?? current.currentUser,
          },
          { shouldRebuildRoomDescriptors: true }
        )
      );
    },
  };
});
