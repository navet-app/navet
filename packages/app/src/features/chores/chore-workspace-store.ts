import type { ChoreWorkspaceRecoveryInfo } from '@navet/app/services/chore-workspace.contract';
import {
  configureChoreManagementPin,
  getChoreWorkspaceTransport,
  recoverChoreWorkspace,
  removeChoreManagementPin,
  resetChoreWorkspace,
  restoreChoreWorkspace,
  verifyChoreManagementPin,
} from '@navet/app/services/chore-workspace.service';
import type { ChoreInterchangeDocument } from '@navet/core/chore-interchange';
import {
  applyChoreWorkspaceAction,
  type ChoreWorkspaceAction,
  type ChoreWorkspaceData,
} from '@navet/core/chores';
import { create } from 'zustand';
import { createChoreCommandId } from './chore-workspace-model';

export type ChoreWorkspaceStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'saving'
  | 'unavailable'
  | 'unauthorized'
  | 'error';

interface ChoreWorkspaceState {
  data: ChoreWorkspaceData | null;
  error: string | null;
  managementError: string | null;
  managementPinConfigured: boolean;
  managementUnlocked: boolean;
  revision: number | null;
  recovery: ChoreWorkspaceRecoveryInfo | null;
  status: ChoreWorkspaceStatus;
  load: (options?: { force?: boolean }) => Promise<void>;
  execute: (action: ChoreWorkspaceAction) => Promise<boolean>;
  restoreBackup: (input: {
    actorParticipantId: string;
    document: ChoreInterchangeDocument;
    mode: 'merge' | 'replace';
  }) => Promise<boolean>;
  deleteAll: (actorParticipantId: string) => Promise<boolean>;
  recover: (action: 'restore_backup' | 'reset') => Promise<boolean>;
  configureManagementPin: (actorParticipantId: string, pin: string) => Promise<boolean>;
  removeManagementPin: (actorParticipantId: string) => Promise<boolean>;
  unlockManagement: (pin: string) => Promise<boolean>;
  lockManagement: () => void;
  reset: () => void;
  setPreviewDocument: (input: { data: ChoreWorkspaceData; revision?: number }) => void;
}

let loadPromise: Promise<void> | null = null;
let mutationQueue: Promise<boolean> = Promise.resolve(true);
let managementSessionToken: string | null = null;

const initialState = {
  data: null,
  error: null,
  managementError: null,
  managementPinConfigured: false,
  managementUnlocked: false,
  revision: null,
  recovery: null,
  status: 'idle' as ChoreWorkspaceStatus,
};

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'Chore workspace sync failed';
}

function relockManagementIfNeeded(error: string | null) {
  if (!error?.startsWith('Unlock chore management')) return false;
  managementSessionToken = null;
  return true;
}

export const useChoreWorkspaceStore = create<ChoreWorkspaceState>((set, get) => ({
  ...initialState,
  load: async (options) => {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      const current = get();
      if (!current.data) set({ error: null, status: 'loading' });
      try {
        const result = await getChoreWorkspaceTransport().loadWorkspace(
          options?.force ? undefined : (current.revision ?? undefined)
        );
        if (result.unauthorized) {
          set({ error: result.error, recovery: null, status: 'unauthorized' });
          return;
        }
        if (!result.available) {
          const pinConfigured = result.recovery?.pinConfigured ?? current.managementPinConfigured;
          const actionableRecovery =
            result.recovery?.reason === 'storage_unavailable' ? null : (result.recovery ?? null);
          set({
            error: result.error ?? null,
            managementPinConfigured: pinConfigured,
            managementUnlocked: pinConfigured && Boolean(managementSessionToken),
            recovery: actionableRecovery,
            status:
              actionableRecovery || !result.failureKind || result.failureKind === 'unsupported'
                ? 'unavailable'
                : 'error',
          });
          return;
        }
        if (result.notModified) {
          set({
            error: null,
            recovery: null,
            revision: result.revision ?? current.revision,
            status: 'ready',
          });
          return;
        }
        if (result.document) {
          set({
            data: result.document.data,
            error: null,
            managementPinConfigured: result.document.management?.pinConfigured === true,
            managementUnlocked:
              result.document.management?.pinConfigured === true && Boolean(managementSessionToken),
            recovery: null,
            revision: result.document.revision,
            status: 'ready',
          });
        }
      } catch (error) {
        set({ error: errorMessage(error), recovery: null, status: 'error' });
      }
    })().finally(() => {
      loadPromise = null;
    });
    return loadPromise;
  },
  execute: async (action) => {
    const run = async () => {
      const commandId = createChoreCommandId();
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const current = get();
        if (!current.data || current.revision === null) return false;
        const optimisticData = (() => {
          if (action.type !== 'occurrence_action') return current.data;
          try {
            return applyChoreWorkspaceAction({
              action,
              commandId,
              timestamp: new Date().toISOString(),
              workspace: current.data,
            }).data;
          } catch {
            return current.data;
          }
        })();
        set({ data: optimisticData, error: null, status: 'saving' });
        const result = await getChoreWorkspaceTransport().sendCommand({
          action,
          commandId,
          baseRevision: current.revision,
          managementSessionToken: managementSessionToken ?? undefined,
        });
        if (result.saved && result.document) {
          const pinConfigured = result.document.management?.pinConfigured === true;
          if (!pinConfigured) managementSessionToken = null;
          set({
            data: result.document.data,
            error: null,
            managementPinConfigured: pinConfigured,
            managementUnlocked: pinConfigured && Boolean(managementSessionToken),
            recovery: null,
            revision: result.document.revision,
            status: 'ready',
          });
          return true;
        }
        if ((result.preconditionFailed || result.retryable) && attempt === 0) {
          await get().load({ force: true });
          const refreshed = get();
          if (refreshed.data?.activity.some((activity) => activity.commandId === commandId)) {
            set({ error: null, status: 'ready' });
            return true;
          }
          if (refreshed.status === 'ready') continue;
        }
        const managementLocked = relockManagementIfNeeded(result.error);
        set({
          data: current.data,
          error: result.unauthorized ? null : (result.error ?? 'Chore workspace sync failed'),
          managementError: managementLocked ? result.error : get().managementError,
          managementUnlocked: managementLocked ? false : get().managementUnlocked,
          status: result.unauthorized ? 'unauthorized' : get().data ? 'ready' : 'error',
        });
        return false;
      }
      return false;
    };
    const queued = mutationQueue.then(run, run);
    mutationQueue = queued;
    return queued;
  },
  restoreBackup: async ({ actorParticipantId, document, mode }) => {
    const current = get();
    if (!current.data || current.revision === null) return false;
    set({ error: null, status: 'saving' });
    const result = await restoreChoreWorkspace({
      commandId: createChoreCommandId(),
      baseRevision: current.revision,
      actorParticipantId,
      document,
      mode,
      managementSessionToken: managementSessionToken ?? undefined,
    });
    if (result.saved && result.document) {
      const pinConfigured = result.document.management?.pinConfigured === true;
      if (!pinConfigured) managementSessionToken = null;
      set({
        data: result.document.data,
        error: null,
        managementPinConfigured: pinConfigured,
        managementUnlocked: pinConfigured && Boolean(managementSessionToken),
        recovery: null,
        revision: result.document.revision,
        status: 'ready',
      });
      return true;
    }
    const managementLocked = relockManagementIfNeeded(result.error);
    set({
      error: result.unauthorized ? null : (result.error ?? 'Chore workspace restore failed'),
      managementError: managementLocked ? result.error : get().managementError,
      managementUnlocked: managementLocked ? false : get().managementUnlocked,
      status: result.unauthorized ? 'unauthorized' : 'ready',
    });
    return false;
  },
  deleteAll: async (actorParticipantId) => {
    const run = async () => {
      const commandId = createChoreCommandId();
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const current = get();
        if (!current.data || current.revision === null) return false;
        set({ error: null, status: 'saving' });
        const result = await resetChoreWorkspace({
          commandId,
          baseRevision: current.revision,
          actorParticipantId,
          confirmation: 'DELETE ALL CHORES',
          managementSessionToken: managementSessionToken ?? undefined,
        });
        if (result.saved && result.document) {
          const pinConfigured = result.document.management?.pinConfigured === true;
          if (!pinConfigured) managementSessionToken = null;
          set({
            data: result.document.data,
            error: null,
            managementPinConfigured: pinConfigured,
            managementUnlocked: pinConfigured && Boolean(managementSessionToken),
            recovery: null,
            revision: result.document.revision,
            status: 'ready',
          });
          return true;
        }
        if (result.preconditionFailed && attempt === 0) {
          await get().load({ force: true });
          if (get().status === 'ready') continue;
        }
        const managementLocked = relockManagementIfNeeded(result.error);
        set({
          error: result.unauthorized ? null : (result.error ?? 'Chore workspace reset failed'),
          managementError: managementLocked ? result.error : get().managementError,
          managementUnlocked: managementLocked ? false : get().managementUnlocked,
          status: result.unauthorized ? 'unauthorized' : 'ready',
        });
        return false;
      }
      return false;
    };
    const queued = mutationQueue.then(run, run);
    mutationQueue = queued;
    return queued;
  },
  recover: async (action) => {
    set({ error: null, status: 'loading' });
    const result = await recoverChoreWorkspace({
      action,
      confirmation: action === 'restore_backup' ? 'REPAIR CHORES' : 'RESET CHORES',
      managementSessionToken: managementSessionToken ?? undefined,
    });
    if (result.saved && result.document) {
      const pinConfigured = result.document.management?.pinConfigured === true;
      if (!pinConfigured) managementSessionToken = null;
      set({
        data: result.document.data,
        error: null,
        managementPinConfigured: pinConfigured,
        managementUnlocked: pinConfigured && Boolean(managementSessionToken),
        recovery: null,
        revision: result.document.revision,
        status: 'ready',
      });
      return true;
    }
    const managementLocked = relockManagementIfNeeded(result.error);
    set({
      error: result.error ?? 'Chore recovery could not be completed',
      managementError: managementLocked ? result.error : get().managementError,
      managementUnlocked: managementLocked ? false : get().managementUnlocked,
      status: result.unauthorized ? 'unauthorized' : 'unavailable',
    });
    return false;
  },
  configureManagementPin: async (actorParticipantId, pin) => {
    set({ managementError: null });
    const result = await configureChoreManagementPin(
      { actorParticipantId, pin },
      managementSessionToken ?? undefined
    );
    if (!result.unlocked || !result.document) {
      const managementLocked = relockManagementIfNeeded(result.error);
      set({
        managementError: result.error ?? 'Management PIN could not be saved',
        managementUnlocked: managementLocked ? false : get().managementUnlocked,
      });
      return false;
    }
    managementSessionToken = result.document.sessionToken;
    set({
      managementError: null,
      managementPinConfigured: result.document.pinConfigured,
      managementUnlocked: true,
    });
    return true;
  },
  removeManagementPin: async (actorParticipantId) => {
    set({ managementError: null });
    if (!managementSessionToken) {
      set({
        managementError: 'Unlock chore management before removing its PIN',
        managementUnlocked: false,
      });
      return false;
    }
    const result = await removeChoreManagementPin({ actorParticipantId }, managementSessionToken);
    if (!result.removed || !result.document) {
      const managementLocked = relockManagementIfNeeded(result.error);
      set({
        managementError: result.error ?? 'Management PIN could not be removed',
        managementUnlocked: managementLocked ? false : get().managementUnlocked,
      });
      return false;
    }
    managementSessionToken = null;
    set({
      managementError: null,
      managementPinConfigured: false,
      managementUnlocked: false,
    });
    return true;
  },
  unlockManagement: async (pin) => {
    set({ managementError: null });
    const result = await verifyChoreManagementPin({ pin });
    if (!result.unlocked || !result.document) {
      set({ managementError: result.error ?? 'PIN was not accepted' });
      return false;
    }
    managementSessionToken = result.document.sessionToken;
    set({ managementError: null, managementPinConfigured: true, managementUnlocked: true });
    return true;
  },
  lockManagement: () => {
    managementSessionToken = null;
    set({ managementError: null, managementUnlocked: false });
  },
  reset: () => {
    managementSessionToken = null;
    set(initialState);
  },
  setPreviewDocument: ({ data, revision = 1 }) =>
    set({ data, error: null, recovery: null, revision, status: 'ready' }),
}));
