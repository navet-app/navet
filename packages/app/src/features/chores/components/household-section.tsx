import { DashboardEmptyState } from '@navet/app/components/patterns';
import {
  Button,
  InteractivePill,
  LoadingSpinner,
  MessageBar,
} from '@navet/app/components/primitives';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@navet/app/components/ui/alert-dialog';
import { TasksSection } from '@navet/app/features/tasks/components/tasks-section';
import { useI18n } from '@navet/app/hooks';
import { isHomeAssistantPanelMode } from '@navet/app/runtime/app-mode';
import {
  type ChoreRuntimeCapabilities,
  getChoreWorkspaceTransport,
} from '@navet/app/services/chore-workspace.service';
import {
  publishIntegrationChoreProjection,
  subscribeIntegrationChoreActionRequests,
} from '@navet/app/services/integration-chore-projection.service';
import { integrationStore } from '@navet/app/stores/integration-store';
import {
  type ChoreExperienceState,
  type ChoreGamificationMode,
  type ChoreMission,
  type ChorePresentationMetadata,
  type ChoreProgressTarget,
  type ChoreRewardGoal,
  normalizeChoreExperienceState,
} from '@navet/core/chore-experience';
import {
  type ChoreDefinition,
  type ChoreParticipant,
  type ChoreWorkspaceAction,
  isChoreParticipantPausedAt,
} from '@navet/core/chores';
import {
  AlertTriangle,
  ClipboardList,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { getChoreMaterializationRange, materializeChoreWorkspace } from '../chore-workspace-model';
import { useChoreWorkspaceStore } from '../chore-workspace-store';
import { useChoreClock } from '../use-chore-clock';
import { useChoreReminderDelivery } from '../use-chore-reminder-delivery';
import { useChoreWorkspaceSync } from '../use-chore-workspace-sync';
import { ChoreDataRecovery } from './chore-data-recovery';
import { MissionDialog, RewardDialog } from './chore-experience-dialogs';
import {
  AllChoresView,
  ChoreSettingsView,
  MissionsView,
  ProgressView,
  RewardsView,
} from './chore-management-views';
import { ChoreOnboardingDialog, ChoreOnboardingWelcome } from './chore-onboarding';
import {
  AddChoreDialog,
  AddPersonDialog,
  ChoreManagementPinDialog,
  ChoreManagementPinEditorDialog,
} from './chore-setup-dialogs';
import { ChoreTodayView } from './chore-today-view';

type HouseholdView =
  | 'today'
  | 'chores'
  | 'missions'
  | 'rewards'
  | 'progress'
  | 'settings'
  | 'routines';

function HouseholdViewPanel({
  value,
  activeValue,
  children,
}: {
  value: HouseholdView;
  activeValue: HouseholdView;
  children: ReactNode;
}) {
  const isActive = value === activeValue;
  return (
    <section
      id={`household-${value}-panel`}
      aria-labelledby={`household-${value}-navigation`}
      hidden={!isActive}
      className={isActive ? 'block' : 'hidden'}
    >
      {children}
    </section>
  );
}

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function HouseholdUnavailable({
  status,
  retry,
}: {
  status: 'unavailable' | 'unauthorized' | 'error';
  retry: () => void;
}) {
  const { t } = useI18n();
  const error = useChoreWorkspaceStore((state) => state.error);
  const recovery = useChoreWorkspaceStore((state) => state.recovery);
  const recover = useChoreWorkspaceStore((state) => state.recover);
  const managementUnlocked = useChoreWorkspaceStore((state) => state.managementUnlocked);
  const managementError = useChoreWorkspaceStore((state) => state.managementError);
  const unlockManagement = useChoreWorkspaceStore((state) => state.unlockManagement);
  const [pinOpen, setPinOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'repair' | 'reset' | null>(null);
  const unauthorized = status === 'unauthorized';
  const unavailable = status === 'unavailable';

  const continueRecovery = (action: 'repair' | 'reset') => {
    if (recovery?.pinConfigured && !managementUnlocked) {
      setPendingAction(action);
      setPinOpen(true);
      return;
    }
    if (action === 'reset') {
      setResetOpen(true);
      return;
    }
    void recover('restore_backup');
  };

  return (
    <div className="mx-auto grid max-w-xl gap-3">
      <DashboardEmptyState
        icon={unavailable ? ClipboardList : AlertTriangle}
        title={
          recovery
            ? t('household.recovery.title')
            : unavailable
              ? t('household.unavailable.title')
              : unauthorized
                ? t('household.unauthorized.title')
                : t('household.error.title')
        }
        description={
          recovery
            ? t('household.recovery.description')
            : unavailable
              ? t('household.unavailable.description')
              : unauthorized
                ? t('household.unauthorized.description')
                : error || t('household.error.description')
        }
        actionLabel={recovery ? undefined : t('household.retry')}
        onAction={recovery ? undefined : retry}
        actionIcon={RotateCcw}
      >
        {recovery ? (
          <div className="grid w-full max-w-md gap-3">
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="secondary"
                leading={<RotateCcw aria-hidden="true" className="h-4 w-4" />}
                onClick={retry}
              >
                {t('household.retry')}
              </Button>
              {recovery.backupAvailable ? (
                <Button
                  variant="secondary"
                  leading={<ShieldCheck aria-hidden="true" className="h-4 w-4" />}
                  onClick={() => continueRecovery('repair')}
                >
                  {t('household.recovery.repair')}
                </Button>
              ) : null}
              <Button
                variant="secondary"
                leading={<Trash2 aria-hidden="true" className="h-4 w-4" />}
                onClick={() => continueRecovery('reset')}
              >
                {t('household.recovery.startOver')}
              </Button>
            </div>
            {recovery.backupAvailable ? (
              <p className="text-xs text-muted-foreground">
                {t('household.recovery.backupAvailable')}
              </p>
            ) : null}
          </div>
        ) : null}
      </DashboardEmptyState>

      <ChoreManagementPinDialog
        isOpen={pinOpen}
        error={managementError}
        onOpenChange={(open) => {
          setPinOpen(open);
          if (!open) setPendingAction(null);
        }}
        onUnlock={async (pin) => {
          const unlocked = await unlockManagement(pin);
          if (unlocked && pendingAction) {
            const nextAction = pendingAction;
            setPendingAction(null);
            if (nextAction === 'reset') setResetOpen(true);
            else void recover('restore_backup');
          }
          return unlocked;
        }}
      />

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('household.recovery.resetTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('household.recovery.resetDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={async () => {
                const recovered = await recover('reset');
                if (recovered) setResetOpen(false);
              }}
            >
              {t('household.recovery.startOver')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function HouseholdSection({ syncEnabled = true }: { syncEnabled?: boolean }) {
  const { t } = useI18n();
  const now = useChoreClock();
  const [view, setView] = useState<HouseholdView>('today');
  const [selectedParticipantId, setSelectedParticipantId] = useState('all');
  const [personDialogOpen, setPersonDialogOpen] = useState(false);
  const [choreDialogOpen, setChoreDialogOpen] = useState(false);
  const [missionDialogOpen, setMissionDialogOpen] = useState(false);
  const [rewardDialogOpen, setRewardDialogOpen] = useState(false);
  const [setupDialogOpen, setSetupDialogOpen] = useState(false);
  const [managementPinDialogOpen, setManagementPinDialogOpen] = useState(false);
  const [managementPinEditorOpen, setManagementPinEditorOpen] = useState(false);
  const [managementPinRemovalOpen, setManagementPinRemovalOpen] = useState(false);
  const [removingManagementPin, setRemovingManagementPin] = useState(false);
  const [deletingChore, setDeletingChore] = useState(false);
  const [participantToEdit, setParticipantToEdit] = useState<ChoreParticipant | null>(null);
  const [definitionToEdit, setDefinitionToEdit] = useState<ChoreDefinition | null>(null);
  const [definitionToDelete, setDefinitionToDelete] = useState<ChoreDefinition | null>(null);
  const [missionToEdit, setMissionToEdit] = useState<ChoreMission | null>(null);
  const [rewardToEdit, setRewardToEdit] = useState<ChoreRewardGoal | null>(null);
  const data = useChoreWorkspaceStore((state) => state.data);
  const revision = useChoreWorkspaceStore((state) => state.revision);
  const error = useChoreWorkspaceStore((state) => state.error);
  const status = useChoreWorkspaceStore((state) => state.status);
  const load = useChoreWorkspaceStore((state) => state.load);
  const execute = useChoreWorkspaceStore((state) => state.execute);
  const managementPinConfigured = useChoreWorkspaceStore((state) => state.managementPinConfigured);
  const managementUnlocked = useChoreWorkspaceStore((state) => state.managementUnlocked);
  const managementError = useChoreWorkspaceStore((state) => state.managementError);
  const configureManagementPin = useChoreWorkspaceStore((state) => state.configureManagementPin);
  const removeManagementPin = useChoreWorkspaceStore((state) => state.removeManagementPin);
  const unlockManagement = useChoreWorkspaceStore((state) => state.unlockManagement);
  const restoreBackup = useChoreWorkspaceStore((state) => state.restoreBackup);
  const pendingManagementActionRef = useRef<(() => void) | null>(null);
  const roomDescriptors = useSyncExternalStore(
    integrationStore.subscribe,
    () => integrationStore.getState().roomDescriptors,
    () => integrationStore.getState().roomDescriptors
  );
  const [runtimeCapabilities, setRuntimeCapabilities] = useState<ChoreRuntimeCapabilities | null>(
    null
  );

  useEffect(() => {
    if (!syncEnabled) return;
    let active = true;
    void getChoreWorkspaceTransport()
      .loadCapabilities()
      .then((capabilities) => {
        if (active) setRuntimeCapabilities(capabilities);
      });
    return () => {
      active = false;
    };
  }, [syncEnabled]);

  const panelAuthority = isHomeAssistantPanelMode();
  const authoritySchedules = panelAuthority || runtimeCapabilities?.backgroundScheduling === true;
  const authorityDeliversNotifications =
    panelAuthority || runtimeCapabilities?.backgroundNotifications === true;
  const authorityPublishesProjection =
    panelAuthority || runtimeCapabilities?.projectionOwnedByAuthority === true;
  const authorityHandlesActions = panelAuthority || runtimeCapabilities?.actionServices === true;

  const roomOptions = useMemo(
    () =>
      roomDescriptors.map((room) => ({
        canonicalId: room.canonicalId,
        label: room.name,
      })),
    [roomDescriptors]
  );

  useChoreWorkspaceSync(syncEnabled);
  useChoreReminderDelivery(syncEnabled && !authorityDeliversNotifications);

  useEffect(() => {
    if (!syncEnabled || !data || authorityPublishesProjection) return;
    void publishIntegrationChoreProjection({
      workspace: data,
      revision: revision ?? undefined,
    }).catch(() => undefined);
  }, [authorityPublishesProjection, data, revision, syncEnabled]);

  useEffect(() => {
    if (!syncEnabled || authorityHandlesActions) return;
    let active = true;
    let unsubscribe = () => {};
    void subscribeIntegrationChoreActionRequests((request) => {
      const reason = request.reason?.trim() || 'Provider automation';
      const action =
        request.action === 'reassign'
          ? {
              type: 'reassign' as const,
              participantId: request.participantId,
              assigneeIds: request.assigneeIds ?? [],
              reason,
            }
          : request.action === 'skip' || request.action === 'reopen'
            ? { type: request.action, participantId: request.participantId, reason }
            : request.action === 'reject'
              ? { type: 'reject' as const, participantId: request.participantId, reason }
              : { type: request.action, participantId: request.participantId };
      void execute({
        type: 'occurrence_action',
        occurrenceId: request.occurrenceId,
        action,
      });
    }).then((dispose) => {
      if (active) unsubscribe = dispose;
      else dispose();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [authorityHandlesActions, execute, syncEnabled]);

  const allParticipants = useMemo(() => (data ? Object.values(data.participantsById) : []), [data]);
  const participants = useMemo(
    () =>
      allParticipants.filter(
        (participant) => !isChoreParticipantPausedAt(participant, now.toISOString())
      ),
    [allParticipants, now]
  );

  useEffect(() => {
    if (
      selectedParticipantId !== 'all' &&
      !participants.some((participant) => participant.id === selectedParticipantId)
    ) {
      setSelectedParticipantId('all');
    }
  }, [participants, selectedParticipantId]);

  useEffect(() => {
    if (
      !syncEnabled ||
      authoritySchedules ||
      status !== 'ready' ||
      !data ||
      Object.keys(data.definitionsById).length === 0
    ) {
      return;
    }
    const materialized = materializeChoreWorkspace(data);
    if (!materialized.changed) return;
    void execute({ type: 'materialize_occurrences', ...getChoreMaterializationRange() });
  }, [authoritySchedules, data, execute, status, syncEnabled]);

  const managerActorId =
    participants.find(
      (participant) =>
        participant.id === selectedParticipantId && participant.capabilities.includes('manage')
    )?.id ?? participants.find((participant) => participant.capabilities.includes('manage'))?.id;

  const saveParticipant = (participant: ChoreParticipant) => {
    const current = useChoreWorkspaceStore.getState().data;
    const existing = current?.participantsById[participant.id];
    const currentParticipants = Object.values(current?.participantsById ?? {});
    const currentManagerActorId =
      currentParticipants.find(
        (candidate) =>
          candidate.id === selectedParticipantId && candidate.capabilities.includes('manage')
      )?.id ??
      currentParticipants.find((candidate) => candidate.capabilities.includes('manage'))?.id;
    const action: ChoreWorkspaceAction = existing
      ? {
          type: 'participant_update',
          participant,
          actorParticipantId: currentManagerActorId ?? participant.id,
        }
      : {
          type: 'participant_create',
          participant,
          actorParticipantId: currentParticipants.length > 0 ? currentManagerActorId : undefined,
        };
    return execute(action);
  };

  const saveSetupParticipant = async (participant: ChoreParticipant) => {
    const saved = await saveParticipant(participant);
    if (!saved) return false;
    const current = useChoreWorkspaceStore.getState().data;
    if (!current) return false;
    const currentExperience = normalizeChoreExperienceState(current.experience);
    if (currentExperience.setupStartedAt) return true;
    const setupManager = Object.values(current.participantsById).find(
      (candidate) =>
        candidate.capabilities.includes('manage') &&
        !isChoreParticipantPausedAt(candidate, now.toISOString())
    );
    if (!setupManager) return false;
    return execute({
      type: 'experience_update',
      actorParticipantId: setupManager.id,
      experience: {
        ...currentExperience,
        setupStartedAt: new Date().toISOString(),
      },
    });
  };

  const updateExperience = async (
    change: (experience: ChoreExperienceState) => ChoreExperienceState
  ) => {
    const current = useChoreWorkspaceStore.getState().data;
    if (!current || !managerActorId) return false;
    const experience = normalizeChoreExperienceState(current.experience);
    const changed = change(experience);
    return execute({
      type: 'experience_update',
      actorParticipantId: managerActorId,
      experience: changed,
    });
  };

  const saveDefinition = async (
    definition: ChoreDefinition,
    presentation: ChorePresentationMetadata
  ) => {
    if (!managerActorId) return false;
    const current = useChoreWorkspaceStore.getState().data;
    const saved = await execute(
      current?.definitionsById[definition.id]
        ? { type: 'definition_update', actorParticipantId: managerActorId, definition }
        : { type: 'definition_create', actorParticipantId: managerActorId, definition }
    );
    if (!saved) return false;
    return updateExperience((experience) => ({
      ...experience,
      presentationByDefinitionId: {
        ...experience.presentationByDefinitionId,
        [definition.id]: presentation,
      },
    }));
  };

  const duplicateDefinition = async (definition: ChoreDefinition) => {
    if (!managerActorId) return;
    const timestamp = new Date().toISOString();
    const duplicate: ChoreDefinition = {
      ...definition,
      id: createId('chore'),
      title: t('household.chores.copyName', { name: definition.title }),
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: undefined,
    };
    const currentExperience = normalizeChoreExperienceState(
      useChoreWorkspaceStore.getState().data?.experience
    );
    const saved = await execute({
      type: 'definition_create',
      actorParticipantId: managerActorId,
      definition: duplicate,
    });
    if (!saved) return;
    const presentation = currentExperience.presentationByDefinitionId[definition.id];
    if (presentation) {
      await updateExperience((experience) => ({
        ...experience,
        presentationByDefinitionId: {
          ...experience.presentationByDefinitionId,
          [duplicate.id]: presentation,
        },
      }));
    }
  };

  const saveMission = (mission: ChoreMission) =>
    updateExperience((experience) => ({
      ...experience,
      missionsById: { ...experience.missionsById, [mission.id]: mission },
    }));
  const saveReward = (reward: ChoreRewardGoal) =>
    updateExperience((experience) => ({
      ...experience,
      rewardGoalsById: { ...experience.rewardGoalsById, [reward.id]: reward },
    }));

  const adjustParticipantPoints = (
    participant: ChoreParticipant,
    pointsDelta: number,
    reason: string
  ) => {
    if (!managerActorId) return Promise.resolve(false);
    return execute({
      type: 'experience_points_adjust',
      actorParticipantId: managerActorId,
      participantId: participant.id,
      pointsDelta,
      reason,
    });
  };

  const markSetupStarted = async () => {
    const current = useChoreWorkspaceStore.getState().data;
    if (!current) return false;
    const actor = Object.values(current.participantsById).find((participant) =>
      participant.capabilities.includes('manage')
    );
    if (!actor) return false;
    const currentExperience = normalizeChoreExperienceState(current.experience);
    if (currentExperience.setupStartedAt) return true;
    return execute({
      type: 'experience_update',
      actorParticipantId: actor.id,
      experience: { ...currentExperience, setupStartedAt: new Date().toISOString() },
    });
  };

  const saveSetupRewards = async (
    gamificationMode: ChoreGamificationMode,
    reward?: ChoreRewardGoal
  ) => {
    const current = useChoreWorkspaceStore.getState().data;
    if (!current) return false;
    const actor = Object.values(current.participantsById).find((participant) =>
      participant.capabilities.includes('manage')
    );
    if (!actor) return false;
    const currentExperience = normalizeChoreExperienceState(current.experience);
    return execute({
      type: 'experience_update',
      actorParticipantId: actor.id,
      experience: {
        ...currentExperience,
        gamificationMode,
        rewardGoalsById: reward
          ? { ...currentExperience.rewardGoalsById, [reward.id]: reward }
          : currentExperience.rewardGoalsById,
      },
    });
  };

  const completeSetup = async () => {
    const current = useChoreWorkspaceStore.getState().data;
    if (!current) return false;
    const actor = Object.values(current.participantsById).find((participant) =>
      participant.capabilities.includes('manage')
    );
    if (!actor || Object.keys(current.definitionsById).length === 0) return false;
    const currentExperience = normalizeChoreExperienceState(current.experience);
    const timestamp = new Date().toISOString();
    return execute({
      type: 'experience_update',
      actorParticipantId: actor.id,
      experience: {
        ...currentExperience,
        setupStartedAt: currentExperience.setupStartedAt ?? timestamp,
        setupCompletedAt: timestamp,
      },
    });
  };

  const choreStatus = status === 'saving' && data ? 'ready' : status;
  const workspaceUnavailable =
    choreStatus === 'unavailable' || choreStatus === 'unauthorized' || choreStatus === 'error';
  const loading = choreStatus === 'loading' || choreStatus === 'idle';
  const withManagementAccess = (action: () => void) => {
    if (managementPinConfigured && !managementUnlocked) {
      pendingManagementActionRef.current = action;
      setManagementPinDialogOpen(true);
      return;
    }
    action();
  };
  const openAddChore = () => {
    withManagementAccess(() => {
      setDefinitionToEdit(null);
      setChoreDialogOpen(true);
    });
  };

  const renderWorkspace = (content: ReactNode) => {
    if (loading) {
      return (
        <div
          className="flex min-h-64 items-center justify-center"
          role="status"
          aria-label={t('household.loading')}
        >
          <LoadingSpinner />
        </div>
      );
    }
    if (workspaceUnavailable) {
      return (
        <HouseholdUnavailable
          status={choreStatus as 'unavailable' | 'unauthorized' | 'error'}
          retry={() => void load({ force: true })}
        />
      );
    }
    if (!data || participants.length === 0) {
      return (
        <DashboardEmptyState
          icon={Users}
          title={t('household.people.emptyTitle')}
          description={t('household.people.emptyDescription')}
          actionLabel={t('household.people.add')}
          onAction={() => setPersonDialogOpen(true)}
          actionIcon={Plus}
          className="mx-auto max-w-xl"
        />
      );
    }
    return content;
  };

  const experience = normalizeChoreExperienceState(data?.experience);
  const motivationEnabled = experience.gamificationMode !== 'off';
  useEffect(() => {
    if (!motivationEnabled && (view === 'missions' || view === 'rewards')) {
      setView('today');
    }
  }, [motivationEnabled, view]);
  const activeDefinitions = Object.values(data?.definitionsById ?? {}).filter(
    (definition) => !definition.archivedAt
  );
  const legacySetupComplete =
    !experience.setupStartedAt && participants.length > 0 && activeDefinitions.length > 0;
  const setupComplete = Boolean(experience.setupCompletedAt) || legacySetupComplete;
  const previousSetupCompleteRef = useRef(setupComplete);
  useEffect(() => {
    if (!previousSetupCompleteRef.current && setupComplete) {
      setView('today');
    }
    previousSetupCompleteRef.current = setupComplete;
  }, [setupComplete]);

  if (loading) {
    return (
      <main>
        <div
          className="flex min-h-64 items-center justify-center"
          role="status"
          aria-label={t('household.loading')}
        >
          <LoadingSpinner />
        </div>
      </main>
    );
  }

  if (workspaceUnavailable) {
    return (
      <main>
        <HouseholdUnavailable
          status={choreStatus as 'unavailable' | 'unauthorized' | 'error'}
          retry={() => void load({ force: true })}
        />
      </main>
    );
  }

  if (!setupComplete) {
    return (
      <main className="h-full min-w-0 overflow-x-hidden overflow-y-auto pb-24 md:pb-0">
        {error && data ? (
          <MessageBar tone="error" title={t('household.error.title')} className="mb-4">
            {error}
          </MessageBar>
        ) : null}
        <ChoreOnboardingWelcome
          onStart={() => {
            setSetupDialogOpen(true);
            if (participants.length > 0) void markSetupStarted();
          }}
          onRestoreBackup={({ actorParticipantId, document }) =>
            restoreBackup({ actorParticipantId, document, mode: 'replace' })
          }
          restoreError={error}
        />
        <ChoreOnboardingDialog
          isOpen={setupDialogOpen}
          error={error}
          onOpenChange={setSetupDialogOpen}
          participants={participants}
          definitions={activeDefinitions}
          experience={experience}
          rooms={roomOptions}
          onSaveParticipant={saveSetupParticipant}
          onSaveChore={saveDefinition}
          onRemoveChore={async (definition) => {
            if (!managerActorId) return false;
            return execute({
              type: 'definition_archive',
              actorParticipantId: managerActorId,
              definitionId: definition.id,
            });
          }}
          onSaveRewards={saveSetupRewards}
          onConfigurePin={configureManagementPin}
          managementPinConfigured={managementPinConfigured}
          managementUnlocked={managementUnlocked}
          managementError={managementError}
          onUnlockManagement={unlockManagement}
          onComplete={completeSetup}
        />
      </main>
    );
  }

  return (
    <main className="h-full min-w-0 overflow-x-hidden overflow-y-auto pb-24 md:pb-0">
      {error && data ? (
        <MessageBar tone="error" title={t('household.error.title')} className="mb-4">
          {error}
        </MessageBar>
      ) : null}
      <nav aria-label={t('household.title')} className="mb-4 md:mb-5">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto scrollbar-hide md:flex-wrap md:overflow-visible">
          {[
            { value: 'today' as const, label: t('household.tabs.today') },
            { value: 'chores' as const, label: t('household.tabs.chores') },
            ...(motivationEnabled
              ? [
                  { value: 'missions' as const, label: t('household.tabs.missions') },
                  { value: 'rewards' as const, label: t('household.tabs.rewards') },
                ]
              : []),
            { value: 'progress' as const, label: t('household.tabs.progress') },
            { value: 'settings' as const, label: t('household.tabs.settings') },
            { value: 'routines' as const, label: t('household.tabs.routines') },
          ].map((item) => {
            const isActive = view === item.value;
            return (
              <InteractivePill
                key={item.value}
                id={`household-${item.value}-navigation`}
                active={isActive}
                aria-current={isActive ? 'page' : undefined}
                aria-controls={`household-${item.value}-panel`}
                size="small"
                variant="ghost"
                className="room-nav-item shrink-0 whitespace-nowrap rounded-[22px] transition-colors"
                onClick={() => {
                  if (['chores', 'missions', 'rewards', 'settings'].includes(item.value)) {
                    withManagementAccess(() => setView(item.value));
                    return;
                  }
                  setView(item.value);
                }}
              >
                {item.label}
              </InteractivePill>
            );
          })}
        </div>
      </nav>

      <HouseholdViewPanel value="today" activeValue={view}>
        {renderWorkspace(
          data ? (
            <ChoreTodayView
              data={data}
              participants={participants}
              selectedParticipantId={selectedParticipantId}
              onSelectedParticipantChange={setSelectedParticipantId}
              execute={execute}
              onAddChore={openAddChore}
            />
          ) : null
        )}
      </HouseholdViewPanel>
      <HouseholdViewPanel value="chores" activeValue={view}>
        {renderWorkspace(
          data ? (
            <AllChoresView
              data={data}
              onAdd={openAddChore}
              onEdit={(definition) => {
                setDefinitionToEdit(definition);
                setChoreDialogOpen(true);
              }}
              onDuplicate={(definition) => void duplicateDefinition(definition)}
              onToggleEnabled={(definition) => {
                if (!managerActorId) return;
                void execute({
                  type: 'definition_update',
                  actorParticipantId: managerActorId,
                  definition: {
                    ...definition,
                    enabled: !definition.enabled,
                    updatedAt: new Date().toISOString(),
                  },
                });
              }}
              onArchive={(definition) => {
                if (!managerActorId) return;
                void execute({
                  type: 'definition_archive',
                  actorParticipantId: managerActorId,
                  definitionId: definition.id,
                });
              }}
              onDelete={setDefinitionToDelete}
              onRestore={(definition) => {
                if (!managerActorId) return;
                void execute({
                  type: 'definition_restore',
                  actorParticipantId: managerActorId,
                  definitionId: definition.id,
                });
              }}
            />
          ) : null
        )}
      </HouseholdViewPanel>
      {motivationEnabled ? (
        <>
          <HouseholdViewPanel value="missions" activeValue={view}>
            {renderWorkspace(
              data ? (
                <MissionsView
                  data={data}
                  onAdd={() => {
                    setMissionToEdit(null);
                    setMissionDialogOpen(true);
                  }}
                  onEdit={(mission) => {
                    setMissionToEdit(mission);
                    setMissionDialogOpen(true);
                  }}
                  onDelete={(mission) =>
                    void updateExperience((current) => {
                      const missionsById = { ...current.missionsById };
                      delete missionsById[mission.id];
                      return { ...current, missionsById };
                    })
                  }
                />
              ) : null
            )}
          </HouseholdViewPanel>
          <HouseholdViewPanel value="rewards" activeValue={view}>
            {renderWorkspace(
              data ? (
                <RewardsView
                  data={data}
                  selectedParticipantId={selectedParticipantId}
                  onRequest={(rewardId, participantId) =>
                    void execute({
                      type: 'reward_request',
                      requestId: createId('reward-request'),
                      rewardId,
                      participantId,
                    })
                  }
                  onDecision={(request, decision) =>
                    withManagementAccess(() => {
                      if (!managerActorId) return;
                      void execute({
                        type: 'reward_decision',
                        requestId: request.id,
                        actorParticipantId: managerActorId,
                        decision,
                      });
                    })
                  }
                  onAdd={() => {
                    setRewardToEdit(null);
                    setRewardDialogOpen(true);
                  }}
                  onEdit={(reward) => {
                    setRewardToEdit(reward);
                    setRewardDialogOpen(true);
                  }}
                  onDelete={(reward) =>
                    void updateExperience((current) => {
                      const rewardGoalsById = { ...current.rewardGoalsById };
                      delete rewardGoalsById[reward.id];
                      return { ...current, rewardGoalsById };
                    })
                  }
                />
              ) : null
            )}
          </HouseholdViewPanel>
        </>
      ) : null}
      <HouseholdViewPanel value="progress" activeValue={view}>
        {renderWorkspace(
          data ? (
            <ProgressView
              data={data}
              execute={execute}
              onAdjustPoints={adjustParticipantPoints}
              onSaveTarget={(kind: 'badge' | 'achievement', target: ChoreProgressTarget) =>
                updateExperience((current) => ({
                  ...current,
                  [kind === 'badge' ? 'badgesById' : 'achievementsById']: {
                    ...(kind === 'badge' ? current.badgesById : current.achievementsById),
                    [target.id]: target,
                  },
                }))
              }
              onDeleteTarget={(kind: 'badge' | 'achievement', target: ChoreProgressTarget) =>
                void updateExperience((current) => {
                  const key = kind === 'badge' ? 'badgesById' : 'achievementsById';
                  const targets = { ...current[key] };
                  delete targets[target.id];
                  return { ...current, [key]: targets };
                })
              }
              requestManagementAccess={withManagementAccess}
            />
          ) : null
        )}
      </HouseholdViewPanel>
      <HouseholdViewPanel value="settings" activeValue={view}>
        {renderWorkspace(
          data ? (
            <ChoreSettingsView
              data={data}
              onModeChange={(gamificationMode) =>
                void updateExperience((current) => ({ ...current, gamificationMode }))
              }
              onAddPerson={() => {
                setParticipantToEdit(null);
                setPersonDialogOpen(true);
              }}
              onEditPerson={(participant) => {
                setParticipantToEdit(participant);
                setPersonDialogOpen(true);
              }}
              onRescheduleVacation={(participantId, occurrenceIds, startDate) =>
                managerActorId
                  ? execute({
                      type: 'vacation_reschedule',
                      actorParticipantId: managerActorId,
                      participantId,
                      occurrenceIds,
                      startDate,
                    })
                  : Promise.resolve(false)
              }
              managementPinConfigured={managementPinConfigured}
              onManagePin={() => withManagementAccess(() => setManagementPinEditorOpen(true))}
              onRemovePin={() => withManagementAccess(() => setManagementPinRemovalOpen(true))}
              recoveryContent={
                managerActorId ? (
                  <ChoreDataRecovery
                    managerActorId={managerActorId}
                    participants={allParticipants}
                    onImportComplete={() => setView('today')}
                  />
                ) : null
              }
            />
          ) : null
        )}
      </HouseholdViewPanel>
      <HouseholdViewPanel value="routines" activeValue={view}>
        <TasksSection />
      </HouseholdViewPanel>

      <AddPersonDialog
        isOpen={personDialogOpen}
        error={error}
        participant={participantToEdit}
        managerRequired={allParticipants.length === 0}
        onOpenChange={(open) => {
          setPersonDialogOpen(open);
          if (!open) setParticipantToEdit(null);
        }}
        onSave={saveParticipant}
      />
      <ChoreManagementPinDialog
        isOpen={managementPinDialogOpen}
        error={managementError}
        onOpenChange={(open) => {
          setManagementPinDialogOpen(open);
          if (!open) pendingManagementActionRef.current = null;
        }}
        onUnlock={async (pin) => {
          const unlocked = await unlockManagement(pin);
          if (unlocked) {
            const pendingAction = pendingManagementActionRef.current;
            pendingManagementActionRef.current = null;
            pendingAction?.();
          }
          return unlocked;
        }}
      />
      <AlertDialog open={managementPinRemovalOpen} onOpenChange={setManagementPinRemovalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('household.management.removePinTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('household.management.removePinDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {managementError ? (
            <p className="text-sm text-red-500" role="alert">
              {managementError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-10">{t('common.cancel')}</AlertDialogCancel>
            <Button
              variant="destructive"
              className="min-h-10"
              loading={removingManagementPin}
              disabled={removingManagementPin}
              onClick={async () => {
                if (!managerActorId) return;
                setRemovingManagementPin(true);
                const removed = await removeManagementPin(managerActorId);
                setRemovingManagementPin(false);
                if (removed) {
                  setManagementPinRemovalOpen(false);
                  return;
                }
                if (!useChoreWorkspaceStore.getState().managementUnlocked) {
                  setManagementPinRemovalOpen(false);
                  pendingManagementActionRef.current = () => setManagementPinRemovalOpen(true);
                  setManagementPinDialogOpen(true);
                }
              }}
            >
              {t('household.management.removePin')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(definitionToDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingChore) setDefinitionToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('household.chores.deleteTitle', { name: definitionToDelete?.title ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('household.chores.deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-10" disabled={deletingChore}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              className="min-h-10"
              loading={deletingChore}
              disabled={deletingChore}
              onClick={async () => {
                if (!managerActorId || !definitionToDelete) return;
                setDeletingChore(true);
                const deleted = await execute({
                  type: 'definition_delete',
                  actorParticipantId: managerActorId,
                  definitionId: definitionToDelete.id,
                });
                setDeletingChore(false);
                if (deleted) setDefinitionToDelete(null);
              }}
            >
              {t('household.chores.delete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ChoreManagementPinEditorDialog
        configured={managementPinConfigured}
        error={managementError}
        isOpen={managementPinEditorOpen}
        onOpenChange={setManagementPinEditorOpen}
        onSave={async (pin) => {
          if (!managerActorId) return false;
          const saved = await configureManagementPin(managerActorId, pin);
          if (!saved && !useChoreWorkspaceStore.getState().managementUnlocked) {
            setManagementPinEditorOpen(false);
            pendingManagementActionRef.current = () => setManagementPinEditorOpen(true);
            setManagementPinDialogOpen(true);
          }
          return saved;
        }}
      />
      <AddChoreDialog
        definition={definitionToEdit}
        presentation={
          definitionToEdit ? experience.presentationByDefinitionId[definitionToEdit.id] : undefined
        }
        isOpen={choreDialogOpen}
        onOpenChange={(open) => {
          setChoreDialogOpen(open);
          if (!open) setDefinitionToEdit(null);
        }}
        participants={participants}
        rooms={roomOptions}
        onSave={saveDefinition}
      />
      <MissionDialog
        isOpen={missionDialogOpen}
        mission={missionToEdit}
        definitions={activeDefinitions}
        onOpenChange={(open) => {
          setMissionDialogOpen(open);
          if (!open) setMissionToEdit(null);
        }}
        onSave={saveMission}
      />
      <RewardDialog
        isOpen={rewardDialogOpen}
        reward={rewardToEdit}
        participants={participants}
        onOpenChange={(open) => {
          setRewardDialogOpen(open);
          if (!open) setRewardToEdit(null);
        }}
        onSave={saveReward}
      />
    </main>
  );
}
