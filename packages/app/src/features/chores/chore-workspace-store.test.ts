import type { ChoreWorkspaceData } from '@navet/core/chores';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  sendChoreWorkspaceCommand,
  loadChoreWorkspace,
  restoreChoreWorkspace,
  resetChoreWorkspace,
  recoverChoreWorkspace,
  configureChoreManagementPin,
  removeChoreManagementPin,
} = vi.hoisted(() => ({
  sendChoreWorkspaceCommand: vi.fn(),
  loadChoreWorkspace: vi.fn(),
  restoreChoreWorkspace: vi.fn(),
  resetChoreWorkspace: vi.fn(),
  recoverChoreWorkspace: vi.fn(),
  configureChoreManagementPin: vi.fn(),
  removeChoreManagementPin: vi.fn(),
}));

vi.mock('@navet/app/services/chore-workspace.service', () => ({
  getChoreWorkspaceTransport: () => ({
    loadWorkspace: loadChoreWorkspace,
    sendCommand: sendChoreWorkspaceCommand,
  }),
  loadChoreWorkspace,
  resetChoreWorkspace,
  recoverChoreWorkspace,
  configureChoreManagementPin,
  removeChoreManagementPin,
  restoreChoreWorkspace,
  sendChoreWorkspaceCommand,
}));

import { useChoreWorkspaceStore } from './chore-workspace-store';

const emptyWorkspace: ChoreWorkspaceData = {
  schemaVersion: 2,
  participantsById: {},
  definitionsById: {},
  occurrencesById: {},
  activity: [],
  outbox: [],
};

describe('chore workspace store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChoreWorkspaceStore.getState().reset();
  });

  it('keeps the last usable workspace visible when a stale occurrence action is rejected', async () => {
    useChoreWorkspaceStore.getState().setPreviewDocument({ data: emptyWorkspace, revision: 4 });
    sendChoreWorkspaceCommand.mockResolvedValue({
      saved: false,
      unauthorized: false,
      preconditionFailed: false,
      error: 'This chore occurrence is stale',
      revision: 4,
      document: null,
    });

    const saved = await useChoreWorkspaceStore.getState().execute({
      type: 'occurrence_action',
      occurrenceId: 'stale-occurrence',
      action: { type: 'complete', participantId: 'participant-manager' },
    });

    expect(saved).toBe(false);
    expect(useChoreWorkspaceStore.getState()).toMatchObject({
      data: emptyWorkspace,
      error: 'This chore occurrence is stale',
      revision: 4,
      status: 'ready',
    });
  });

  it('relocks management when the session expires before changing the PIN', async () => {
    useChoreWorkspaceStore.setState({
      managementPinConfigured: true,
      managementUnlocked: true,
    });
    configureChoreManagementPin.mockResolvedValue({
      unlocked: false,
      unauthorized: true,
      error: 'Unlock chore management before changing its PIN',
      document: null,
    });

    const saved = await useChoreWorkspaceStore.getState().configureManagementPin('maya', '1357');

    expect(saved).toBe(false);
    expect(useChoreWorkspaceStore.getState()).toMatchObject({
      managementError: 'Unlock chore management before changing its PIN',
      managementPinConfigured: true,
      managementUnlocked: false,
    });
  });

  it('removes management PIN protection and clears the browser session', async () => {
    configureChoreManagementPin.mockResolvedValue({
      unlocked: true,
      unauthorized: false,
      error: null,
      document: {
        pinConfigured: true,
        sessionToken: 'manager-session',
        expiresAt: '2026-08-15T20:30:00.000Z',
      },
    });
    removeChoreManagementPin.mockResolvedValue({
      removed: true,
      unauthorized: false,
      error: null,
      document: { pinConfigured: false },
    });

    await useChoreWorkspaceStore.getState().configureManagementPin('maya', '2468');
    const removed = await useChoreWorkspaceStore.getState().removeManagementPin('maya');

    expect(removed).toBe(true);
    expect(removeChoreManagementPin).toHaveBeenCalledWith(
      { actorParticipantId: 'maya' },
      'manager-session'
    );
    expect(useChoreWorkspaceStore.getState()).toMatchObject({
      managementError: null,
      managementPinConfigured: false,
      managementUnlocked: false,
    });
  });

  it('shows a valid occurrence completion immediately while the authority saves', async () => {
    const scheduledAt = '2026-08-15T08:00:00.000Z';
    const workspace: ChoreWorkspaceData = {
      ...emptyWorkspace,
      participantsById: {
        maya: {
          id: 'maya',
          displayName: 'Maya',
          capabilities: ['complete'],
          createdAt: scheduledAt,
          updatedAt: scheduledAt,
        },
      },
      definitionsById: {
        dishes: {
          id: 'dishes',
          title: 'Unload dishwasher',
          enabled: true,
          assignment: { mode: 'person', participantIds: ['maya'] },
          schedule: {
            frequency: 'once',
            date: '2026-08-15',
            time: '10:00',
            timeZone: 'Europe/Stockholm',
          },
          dueWindowMinutes: 60,
          approval: { required: false, approverIds: [] },
          createdAt: scheduledAt,
          updatedAt: scheduledAt,
        },
      },
      occurrencesById: {
        dishes: {
          id: 'dishes',
          definitionId: 'dishes',
          scheduledAt,
          dueAt: '2026-08-15T09:00:00.000Z',
          assigneeIds: ['maya'],
          assignmentSlot: 'maya',
          status: 'available',
          updatedAt: scheduledAt,
        },
      },
    };
    let resolveSave: ((value: unknown) => void) | undefined;
    sendChoreWorkspaceCommand.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      })
    );
    useChoreWorkspaceStore.getState().setPreviewDocument({ data: workspace, revision: 4 });

    const saving = useChoreWorkspaceStore.getState().execute({
      type: 'occurrence_action',
      occurrenceId: 'dishes',
      action: { type: 'complete', participantId: 'maya' },
    });
    await vi.waitFor(() => {
      expect(useChoreWorkspaceStore.getState().data?.occurrencesById.dishes?.status).toBe('done');
    });

    resolveSave?.({
      saved: true,
      unauthorized: false,
      preconditionFailed: false,
      error: null,
      revision: 5,
      document: { data: workspace, revision: 5 },
    });
    await saving;
  });

  it('reports an unavailable authority without replacing it with preview data', async () => {
    loadChoreWorkspace.mockResolvedValue({
      available: false,
      unauthorized: false,
      notModified: false,
      revision: null,
      document: null,
    });

    await useChoreWorkspaceStore.getState().load({ force: true });

    expect(useChoreWorkspaceStore.getState()).toMatchObject({
      data: null,
      error: null,
      revision: null,
      status: 'unavailable',
    });
  });

  it('reports malformed chore data as an actionable sync error', async () => {
    loadChoreWorkspace.mockResolvedValue({
      available: false,
      unauthorized: false,
      notModified: false,
      failureKind: 'invalid_data',
      error: 'Navet received chore data it could not safely read.',
      recovery: null,
      revision: null,
      document: null,
    });

    await useChoreWorkspaceStore.getState().load({ force: true });

    expect(useChoreWorkspaceStore.getState()).toMatchObject({
      data: null,
      error: 'Navet received chore data it could not safely read.',
      status: 'error',
    });
  });

  it('does not expose destructive recovery for temporary storage failures', async () => {
    loadChoreWorkspace.mockResolvedValue({
      available: false,
      unauthorized: false,
      notModified: false,
      failureKind: 'unreachable',
      error: 'Chore storage could not finish the request.',
      recovery: { backupAvailable: true, pinConfigured: true, reason: 'storage_unavailable' },
      revision: null,
      document: null,
    });

    await useChoreWorkspaceStore.getState().load({ force: true });

    expect(useChoreWorkspaceStore.getState()).toMatchObject({
      error: 'Chore storage could not finish the request.',
      managementPinConfigured: true,
      recovery: null,
      status: 'error',
    });
  });

  it('preserves recovery details and replaces the broken workspace after repair', async () => {
    loadChoreWorkspace.mockResolvedValue({
      available: false,
      unauthorized: false,
      notModified: false,
      error: 'Chore data could not be read',
      recovery: { backupAvailable: true, pinConfigured: false, reason: 'workspace_invalid' },
      revision: null,
      document: null,
    });
    recoverChoreWorkspace.mockResolvedValue({
      saved: true,
      unauthorized: false,
      preconditionFailed: false,
      error: null,
      revision: 7,
      document: {
        data: emptyWorkspace,
        management: { pinConfigured: false },
        revision: 7,
        updatedAt: '2026-08-15T20:00:00.000Z',
      },
    });

    await useChoreWorkspaceStore.getState().load({ force: true });
    expect(useChoreWorkspaceStore.getState()).toMatchObject({
      error: 'Chore data could not be read',
      recovery: { backupAvailable: true, reason: 'workspace_invalid' },
      status: 'unavailable',
    });

    await expect(useChoreWorkspaceStore.getState().recover('restore_backup')).resolves.toBe(true);
    expect(recoverChoreWorkspace).toHaveBeenCalledWith({
      action: 'restore_backup',
      confirmation: 'REPAIR CHORES',
      managementSessionToken: undefined,
    });
    expect(useChoreWorkspaceStore.getState()).toMatchObject({
      data: emptyWorkspace,
      error: null,
      recovery: null,
      revision: 7,
      status: 'ready',
    });
  });

  it('refreshes once and retries an action after a concurrent write', async () => {
    useChoreWorkspaceStore.getState().setPreviewDocument({ data: emptyWorkspace, revision: 4 });
    sendChoreWorkspaceCommand
      .mockResolvedValueOnce({
        saved: false,
        unauthorized: false,
        preconditionFailed: true,
        error: 'Revision changed',
        revision: 5,
        document: null,
      })
      .mockResolvedValueOnce({
        saved: true,
        unauthorized: false,
        preconditionFailed: false,
        error: null,
        revision: 6,
        document: { data: emptyWorkspace, revision: 6 },
      });
    loadChoreWorkspace.mockResolvedValue({
      available: true,
      unauthorized: false,
      notModified: false,
      revision: 5,
      document: {
        data: emptyWorkspace,
        revision: 5,
        updatedAt: '2026-08-14T00:00:00.000Z',
      },
    });

    const saved = await useChoreWorkspaceStore.getState().execute({
      type: 'materialize_occurrences',
      rangeStart: '2026-08-14T00:00:00.000Z',
      rangeEnd: '2026-08-15T00:00:00.000Z',
    });

    expect(saved).toBe(true);
    expect(sendChoreWorkspaceCommand).toHaveBeenCalledTimes(2);
    expect(sendChoreWorkspaceCommand.mock.calls[1]?.[0]).toMatchObject({ baseRevision: 5 });
    expect(useChoreWorkspaceStore.getState()).toMatchObject({ revision: 6, status: 'ready' });
  });

  it('reconciles a transient error when the authority already committed the command', async () => {
    useChoreWorkspaceStore.getState().setPreviewDocument({ data: emptyWorkspace, revision: 4 });
    let committedCommandId = '';
    sendChoreWorkspaceCommand.mockImplementation(async (request) => {
      committedCommandId = request.commandId;
      return {
        saved: false,
        unauthorized: false,
        preconditionFailed: false,
        retryable: true,
        error: 'Chore storage could not finish the request',
        revision: 4,
        document: null,
      };
    });
    loadChoreWorkspace.mockImplementation(async () => ({
      available: true,
      unauthorized: false,
      notModified: false,
      error: null,
      recovery: null,
      revision: 5,
      document: {
        data: {
          ...emptyWorkspace,
          activity: [
            {
              id: `activity:${committedCommandId}`,
              commandId: committedCommandId,
              timestamp: '2026-08-15T20:00:00.000Z',
              type: 'workspace_materialized' as const,
            },
          ],
        },
        revision: 5,
        updatedAt: '2026-08-15T20:00:00.000Z',
      },
    }));

    await expect(
      useChoreWorkspaceStore.getState().execute({
        type: 'materialize_occurrences',
        rangeStart: '2026-08-15T00:00:00.000Z',
        rangeEnd: '2026-08-16T00:00:00.000Z',
      })
    ).resolves.toBe(true);
    expect(sendChoreWorkspaceCommand).toHaveBeenCalledTimes(1);
    expect(useChoreWorkspaceStore.getState()).toMatchObject({
      error: null,
      revision: 5,
      status: 'ready',
    });
  });

  it('replaces the visible workspace after restoring a backup', async () => {
    const restoredWorkspace = { ...emptyWorkspace };
    useChoreWorkspaceStore.getState().setPreviewDocument({ data: emptyWorkspace, revision: 4 });
    restoreChoreWorkspace.mockResolvedValue({
      saved: true,
      unauthorized: false,
      preconditionFailed: false,
      error: null,
      document: { data: restoredWorkspace, revision: 5 },
    });

    const saved = await useChoreWorkspaceStore.getState().restoreBackup({
      actorParticipantId: 'participant-manager',
      document: {
        contract: 'navet.chores',
        version: 1,
        exportedAt: '2026-08-14T00:00:00.000Z',
        workspace: emptyWorkspace,
        events: [],
      },
      mode: 'replace',
    });

    expect(saved).toBe(true);
    expect(restoreChoreWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ baseRevision: 4, mode: 'replace' })
    );
    expect(useChoreWorkspaceStore.getState()).toMatchObject({
      data: restoredWorkspace,
      error: null,
      revision: 5,
      status: 'ready',
    });
  });

  it('refreshes and retries a reset once with the same command identity after a conflict', async () => {
    useChoreWorkspaceStore.getState().setPreviewDocument({ data: emptyWorkspace, revision: 5 });
    resetChoreWorkspace
      .mockResolvedValueOnce({
        saved: false,
        unauthorized: false,
        preconditionFailed: true,
        error: 'Chore workspace changed on another client',
        document: null,
      })
      .mockResolvedValueOnce({
        saved: true,
        unauthorized: false,
        preconditionFailed: false,
        error: null,
        document: { data: emptyWorkspace, revision: 7 },
      });
    loadChoreWorkspace.mockResolvedValue({
      available: true,
      unauthorized: false,
      notModified: false,
      document: { data: emptyWorkspace, revision: 6 },
    });
    expect(await useChoreWorkspaceStore.getState().deleteAll('participant-manager')).toBe(true);
    expect(resetChoreWorkspace).toHaveBeenCalledTimes(2);
    const first = resetChoreWorkspace.mock.calls[0][0];
    expect(resetChoreWorkspace.mock.calls[1][0]).toEqual({ ...first, baseRevision: 6 });
    expect(loadChoreWorkspace).toHaveBeenCalledWith(undefined);
    expect(useChoreWorkspaceStore.getState()).toMatchObject({
      revision: 7,
      error: null,
      status: 'ready',
    });
  });

  it('stops after a second reset conflict and preserves the refreshed workspace', async () => {
    useChoreWorkspaceStore.getState().setPreviewDocument({ data: emptyWorkspace, revision: 5 });
    resetChoreWorkspace.mockResolvedValue({
      saved: false,
      unauthorized: false,
      preconditionFailed: true,
      error: 'Revision changed',
      document: null,
    });
    loadChoreWorkspace.mockResolvedValue({
      available: true,
      unauthorized: false,
      notModified: false,
      document: { data: emptyWorkspace, revision: 6 },
    });
    expect(await useChoreWorkspaceStore.getState().deleteAll('participant-manager')).toBe(false);
    expect(resetChoreWorkspace).toHaveBeenCalledTimes(2);
    expect(useChoreWorkspaceStore.getState()).toMatchObject({
      data: emptyWorkspace,
      revision: 6,
      error: 'Revision changed',
      status: 'ready',
    });
  });

  it('clears the visible workspace after a manager reset', async () => {
    useChoreWorkspaceStore.getState().setPreviewDocument({ data: emptyWorkspace, revision: 5 });
    resetChoreWorkspace.mockResolvedValue({
      saved: true,
      unauthorized: false,
      preconditionFailed: false,
      error: null,
      document: { data: emptyWorkspace, revision: 6 },
    });

    const saved = await useChoreWorkspaceStore.getState().deleteAll('participant-manager');

    expect(saved).toBe(true);
    expect(resetChoreWorkspace).toHaveBeenCalledWith({
      actorParticipantId: 'participant-manager',
      baseRevision: 5,
      commandId: expect.any(String),
      confirmation: 'DELETE ALL CHORES',
    });
    expect(useChoreWorkspaceStore.getState()).toMatchObject({
      data: emptyWorkspace,
      error: null,
      revision: 6,
      status: 'ready',
    });
  });
});
