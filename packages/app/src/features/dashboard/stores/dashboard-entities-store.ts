import {
  ensureCanonicalEntityId,
  ensureCanonicalEntityIds,
} from '@navet/app/utils/provider-entity-id';
import { getProviderNativeId } from '@navet/app/utils/provider-ids';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface DashboardEntitiesState {
  hiddenEntityIds: string[];
  shownSensorEntityIds: string[];
  explicitlyShownEntityIds: string[];
  lockedCardIds: string[];
  onboardingCompleted: boolean;
  replaceDashboardEntitiesState: (state: {
    hiddenEntityIds: string[];
    shownSensorEntityIds?: string[];
    explicitlyShownEntityIds?: string[];
    lockedCardIds?: string[];
    onboardingCompleted: boolean;
  }) => void;
  completeOnboarding: (entityIds: string[], startBlank: boolean) => void;
  markOnboardingCompleted: () => void;
  hideEntity: (entityId: string) => void;
  showEntity: (entityId: string) => void;
  showAllEntities: () => void;
  resetHiddenEntities: () => void;
  lockCard: (cardId: string) => void;
  unlockCard: (cardId: string) => void;
  toggleCardLock: (cardId: string) => void;
  reopenOnboarding: () => void;
}

function normalizeLockedCardIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string')));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return ensureCanonicalEntityIds(value.filter((item): item is string => typeof item === 'string'));
}

function isSensorEntityId(entityId: string) {
  const nativeId = getProviderNativeId(entityId);
  return nativeId.startsWith('sensor.') || nativeId.startsWith('binary_sensor.');
}

export const useDashboardEntitiesStore = create<DashboardEntitiesState>()(
  persist(
    (set) => ({
      hiddenEntityIds: [],
      shownSensorEntityIds: [],
      explicitlyShownEntityIds: [],
      lockedCardIds: [],
      onboardingCompleted: false,
      replaceDashboardEntitiesState: ({
        hiddenEntityIds,
        shownSensorEntityIds = [],
        explicitlyShownEntityIds = [],
        lockedCardIds = [],
        onboardingCompleted,
      }) =>
        set({
          hiddenEntityIds: ensureCanonicalEntityIds(hiddenEntityIds),
          shownSensorEntityIds: normalizeStringArray(shownSensorEntityIds),
          explicitlyShownEntityIds: normalizeStringArray(explicitlyShownEntityIds),
          lockedCardIds: normalizeLockedCardIds(lockedCardIds),
          onboardingCompleted,
        }),
      completeOnboarding: (entityIds, startBlank) =>
        set({
          hiddenEntityIds: startBlank ? ensureCanonicalEntityIds(entityIds) : [],
          shownSensorEntityIds: startBlank
            ? []
            : ensureCanonicalEntityIds(entityIds.filter(isSensorEntityId)),
          explicitlyShownEntityIds: [],
          onboardingCompleted: true,
        }),
      markOnboardingCompleted: () => set({ onboardingCompleted: true }),
      hideEntity: (entityId) =>
        set((state) => {
          const canonicalEntityId = ensureCanonicalEntityId(entityId);
          return {
            explicitlyShownEntityIds: state.explicitlyShownEntityIds.filter(
              (id) => id !== canonicalEntityId
            ),
            hiddenEntityIds: state.hiddenEntityIds.includes(canonicalEntityId)
              ? state.hiddenEntityIds
              : [...state.hiddenEntityIds, canonicalEntityId],
            shownSensorEntityIds: isSensorEntityId(canonicalEntityId)
              ? state.shownSensorEntityIds.filter((id) => id !== canonicalEntityId)
              : state.shownSensorEntityIds,
          };
        }),
      showEntity: (entityId) =>
        set((state) => {
          const canonicalEntityId = ensureCanonicalEntityId(entityId);
          return {
            explicitlyShownEntityIds: state.explicitlyShownEntityIds.includes(canonicalEntityId)
              ? state.explicitlyShownEntityIds
              : [...state.explicitlyShownEntityIds, canonicalEntityId],
            hiddenEntityIds: state.hiddenEntityIds.filter((id) => id !== canonicalEntityId),
            shownSensorEntityIds:
              isSensorEntityId(canonicalEntityId) &&
              !state.shownSensorEntityIds.includes(canonicalEntityId)
                ? [...state.shownSensorEntityIds, canonicalEntityId]
                : state.shownSensorEntityIds,
          };
        }),
      showAllEntities: () => set({ hiddenEntityIds: [] }),
      resetHiddenEntities: () => set({ hiddenEntityIds: [] }),
      lockCard: (cardId) =>
        set((state) => ({
          lockedCardIds: state.lockedCardIds.includes(cardId)
            ? state.lockedCardIds
            : [...state.lockedCardIds, cardId],
        })),
      unlockCard: (cardId) =>
        set((state) => ({
          lockedCardIds: state.lockedCardIds.filter((id) => id !== cardId),
        })),
      toggleCardLock: (cardId) =>
        set((state) => ({
          lockedCardIds: state.lockedCardIds.includes(cardId)
            ? state.lockedCardIds.filter((id) => id !== cardId)
            : [...state.lockedCardIds, cardId],
        })),
      reopenOnboarding: () => set({ onboardingCompleted: false }),
    }),
    {
      name: 'navet-dashboard-entities',
      storage: createJSONStorage(() => localStorage),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Record<string, unknown> | null) ?? {};
        const hiddenEntityIds = Array.isArray(persisted.hiddenEntityIds)
          ? ensureCanonicalEntityIds(
              persisted.hiddenEntityIds.filter((item): item is string => typeof item === 'string')
            )
          : [];
        const shownSensorEntityIds = normalizeStringArray(persisted.shownSensorEntityIds);
        const lockedCardIds = normalizeLockedCardIds(persisted.lockedCardIds);

        const onboardingCompleted =
          typeof persisted.onboardingCompleted === 'boolean'
            ? persisted.onboardingCompleted
            : hiddenEntityIds.length > 0;

        return {
          ...currentState,
          ...persisted,
          hiddenEntityIds,
          shownSensorEntityIds,
          explicitlyShownEntityIds: normalizeStringArray(persisted.explicitlyShownEntityIds),
          lockedCardIds,
          onboardingCompleted,
        };
      },
    }
  )
);
