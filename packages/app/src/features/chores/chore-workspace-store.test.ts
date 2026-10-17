import type { ChoreWorkspaceDocument } from '@navet/app/services/chore-workspace.contract';
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
  subscribeChoreWorkspace,
} = vi.hoisted(() => ({
  sendChoreWorkspaceCommand: vi.fn(),
  loadChoreWorkspace: vi.fn(),
  restoreChoreWorkspace: vi.fn(),
  resetChoreWorkspace: vi.fn(),
  recoverChoreWorkspace: vi.fn(),
  configureChoreManagementPin: vi.fn(),
  removeChoreManagementPin: vi.fn(),
  subscribeChoreWorkspace: vi.fn(),
}));

vi.mock('@navet/app/services/chore-workspace.service', () => ({
  getChoreWorkspaceTransport: () => ({
    loadWorkspace: loadChoreWorkspace,
    sendCommand: sendChoreWorkspaceCommand,
    subscribe: subscribeChoreWorkspace,
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

function authorityDocument(revision: number, pinConfigured = false): ChoreWorkspaceDocument {
  return {
    data: { ...emptyWorkspace, activity: [] },
    management: { pinConfigured },
    revision,
    updatedAt: '2026-08-15T20:00:00.000Z',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function subscribeToAuthority() {
  let publish!: (document: ChoreWorkspaceDocument) => void;
  const dispose = vi.fn();
  subscribeChoreWorkspace.mockImplementation(async (listener) => {
    publish = listener;
    return dispose;
  });
  const stop = useChoreWorkspaceStore.getState().subscribeWorkspace();
  return { publish: (document: ChoreWorkspaceDocument) => publish(document), stop, dispose };
}

describe('chore workspace store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChoreWorkspaceStore.getState().reset();
  });

  it('keeps a newer subscription snapshot when an earlier load completes', async () => {
    useChoreWorkspaceStore.getState().setPreviewDocument({ data: emptyWorkspace, revision: 4 });
    const pending = deferred<unknown>();
    loadChoreWorkspace.mockReturnValueOnce(pending.promise);
    const subscription = subscribeToAuthority();
    const loading = useChoreWorkspaceStore.getState().load();
    const newest = authorityDocument(6);
    subscription.publish(newest);
    pending.resolve({ available: true, document: authorityDocument(5), notModified: false });
    await loading;
    expect(useChoreWorkspaceStore.getState()).toMatchObject({
      data: newest.data,
      revision: 6,
      status: 'ready',
      error: null,
    });
    subscription.stop();
  });

  it('keeps recovery cleared when a delayed failed load follows a subscription snapshot', async () => {
    const pending = deferred<unknown>();
    loadChoreWorkspace.mockReturnValueOnce(pending.promise);
    const subscription = subscribeToAuthority();
    const loading = useChoreWorkspaceStore.getState().load();
    subscription.publish(authorityDocument(6));
    pending.resolve({
      available: false,
      recovery: {
        backupAvailable: true,
        pinConfigured: true,
        reason: 'workspace_invalid',
      },
      error: 'Old read failed',
    });
    await loading;
    expect(useChoreWorkspaceStore.getState()).toMatchObject({
      revision: 6,
      status: 'ready',
      error: null,
      recovery: null,
    });
    subscription.stop();
  });

  it('does not replace a newer subscription snapshot with a delayed successful command', async () => {
    useChoreWorkspaceStore.getState().setPreviewDocument({ data: emptyWorkspace, revision: 4 });
    const pending = deferred<unknown>();
    sendChoreWorkspaceCommand.mockReturnValueOnce(pending.promise);
    const subscription = subscribeToAuthority();
    const saving = useChoreWorkspaceStore.getState().execute({
      type: 'definition_archive',
      actorParticipantId: 'maya',
      definitionId: 'cleanup',
    });
    await Promise.resolve();
    const newest = authorityDocument(6);
    subscription.publish(newest);
    pending.resolve({ saved: true, document: authorityDocument(5) });
    await expect(saving).resolves.toBe(true);
    expect(useChoreWorkspaceStore.getState()).toMatchObject({
      data: newest.data,
      revision: 6,
      status: 'ready',
    });
    subscription.stop();
  });

  it('clears a removed PIN session on subscription and cannot resurrect it from a stale load', async () => {
    configureChoreManagementPin.mockResolvedValueOnce({
      unlocked: true,
      document: { pinConfigured: true, sessionToken: 'old-pin-session' },
    });
    await useChoreWorkspaceStore.getState().configureManagementPin('maya', '2468');
    const pending = deferred<unknown>();
    loadChoreWorkspace.mockReturnValueOnce(pending.promise);
    const subscription = subscribeToAuthority();
    const loading = useChoreWorkspaceStore.getState().load();
    subscription.publish(authorityDocument(6, false));
    pending.resolve({ available: true, document: authorityDocument(6, true) });
    await loading;
    subscription.publish(authorityDocument(7, true));
    expect(useChoreWorkspaceStore.getState()).toMatchObject({
      managementPinConfigured: true,
      managementUnlocked: false,
      revision: 7,
    });
    sendChoreWorkspaceCommand.mockResolvedValueOnce({
      saved: true,
      document: authorityDocument(8, true),
    });
    await useChoreWorkspaceStore.getState().execute({
      type: 'definition_archive',
      actorParticipantId: 'maya',
      definitionId: 'cleanup',
    });
    expect(sendChoreWorkspaceCommand).toHaveBeenLastCalledWith(
      expect.objectContaining({
        managementSessionToken: undefined,
      })
    );
    subscription.stop();
  });

  it('disposes a subscription that finishes connecting after reset and ignores its events', async () => {
    let publish!: (document: ChoreWorkspaceDocument) => void;
    const connection = deferred<() => void>();
    subscribeChoreWorkspace.mockImplementationOnce((listener) => {
      publish = listener;
      return connection.promise;
    });
    const stop = useChoreWorkspaceStore.getState().subscribeWorkspace();
    useChoreWorkspaceStore.getState().reset();
    const dispose = vi.fn();
    connection.resolve(dispose);
    await Promise.resolve();
    publish(authorityDocument(10));
    stop();
    expect(dispose).toHaveBeenCalledOnce();
    expect(useChoreWorkspaceStore.getState()).toMatchObject({
      data: null,
      revision: null,
      status: 'idle',
    });
  });

  it('keeps a newer subscription snapshot when a command fails after its optimistic update', async () => {
    useChoreWorkspaceStore.getState().setPreviewDocument({ data: emptyWorkspace, revision: 4 });
    const pending = deferred<unknown>();
    sendChoreWorkspaceCommand.mockReturnValueOnce(pending.promise);
    const subscription = subscribeToAuthority();
    const saving = useChoreWorkspaceStore.getState().execute({
      type: 'definition_archive',
      actorParticipantId: 'maya',
      definitionId: 'cleanup',
    });
    await Promise.resolve();
    const newest = authorityDocument(6);
    subscription.publish(newest);
    pending.resolve({ saved: false, error: 'Action rejected' });
    await expect(saving).resolves.toBe(false);
    expect(useChoreWorkspaceStore.getState()).toMatchObject({ data: newest.data, revision: 6 });
    subscription.stop();
  });

  it('does not repopulate a reset store when an earlier load finishes', async () => {
    const pending = deferred<unknown>();
    loadChoreWorkspace.mockReturnValueOnce(pending.promise);
    const loading = useChoreWorkspaceStore.getState().load();
    useChoreWorkspaceStore.getState().reset();
    pending.resolve({ available: true, document: authorityDocument(5) });
    await loading;
    expect(useChoreWorkspaceStore.getState()).toMatchObject({
      data: null,
      revision: null,
      status: 'idle',
    });
  });

  it('retries an uncommitted transient command after reconciling the same authority revision', async () => {
    useChoreWorkspaceStore.getState().setPreviewDocument({ data: emptyWorkspace, revision: 4 });
    sendChoreWorkspaceCommand
      .mockResolvedValueOnce({ saved: false, retryable: true, error: 'Temporary transport error' })
      .mockResolvedValueOnce({ saved: true, document: authorityDocument(5) });
    loadChoreWorkspace.mockResolvedValueOnce({ available: true, document: authorityDocument(4) });
    await expect(
      useChoreWorkspaceStore.getState().execute({
        type: 'definition_archive',
        actorParticipantId: 'maya',
        definitionId: 'cleanup',
      })
    ).resolves.toBe(true);
    expect(sendChoreWorkspaceCommand).toHaveBeenCalledTimes(2);
    const [first, second] = sendChoreWorkspaceCommand.mock.calls;
    expect(second[0]).toMatchObject({ commandId: first[0].commandId, baseRevision: 4 });
    expect(useChoreWorkspaceStore.getState()).toMatchObject({ revision: 5, status: 'ready' });
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
    configureChoreManagementPin.mockResolvedValueOnce({
      unlocked: true,
      document: { pinConfigured: true, sessionToken: 'old-pin-session' },
    });
    await useChoreWorkspaceStore.getState().configureManagementPin('maya', '2468');
    const subscription = subscribeToAuthority();

    const saving = useChoreWorkspaceStore.getState().execute({
      type: 'occurrence_action',
      occurrenceId: 'dishes',
      action: { type: 'complete', participantId: 'maya' },
    });
    await vi.waitFor(() => {
      expect(useChoreWorkspaceStore.getState().data?.occurrencesById.dishes?.status).toBe('done');
    });

    subscription.publish({ ...authorityDocument(4), data: workspace });
    expect(useChoreWorkspaceStore.getState().data?.occurrencesById.dishes?.status).toBe('done');
    expect(useChoreWorkspaceStore.getState().status).toBe('saving');
    expect(useChoreWorkspaceStore.getState().managementUnlocked).toBe(false);

    resolveSave?.({
      saved: true,
      unauthorized: false,
      preconditionFailed: false,
      error: null,
      revision: 5,
      document: { data: workspace, revision: 5 },
    });
    await saving;
    subscription.stop();
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

  it.each([false, true])(
    'retries a concurrent write using an authority snapshot when supplied (%s)',
    async (snapshot) => {
      useChoreWorkspaceStore.getState().setPreviewDocument({ data: emptyWorkspace, revision: 4 });
      sendChoreWorkspaceCommand
        .mockResolvedValueOnce({
          saved: false,
          unauthorized: false,
          preconditionFailed: true,
          error: 'Revision changed',
          revision: 5,
          document: snapshot
            ? { data: emptyWorkspace, revision: 5, updatedAt: '2026-08-14T00:00:00.000Z' }
            : null,
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
      expect(loadChoreWorkspace).toHaveBeenCalledTimes(snapshot ? 0 : 1);
      expect(sendChoreWorkspaceCommand.mock.calls[1]?.[0].commandId).toBe(
        sendChoreWorkspaceCommand.mock.calls[0]?.[0].commandId
      );
      expect(sendChoreWorkspaceCommand).toHaveBeenCalledTimes(2);
      expect(sendChoreWorkspaceCommand.mock.calls[1]?.[0]).toMatchObject({ baseRevision: 5 });
      expect(useChoreWorkspaceStore.getState()).toMatchObject({ revision: 6, status: 'ready' });
    }
  );

  it.each([true, false])(
    'bounds snapshot conflict retries and preserves command identity (success=%s)',
    async (succeed) => {
      useChoreWorkspaceStore.getState().setPreviewDocument({ data: emptyWorkspace, revision: 4 });
      sendChoreWorkspaceCommand.mockImplementation(async (request) => {
        const revision = request.baseRevision + 1;
        const saved = succeed && revision === 6;
        return {
          saved,
          unauthorized: false,
          preconditionFailed: !saved,
          error: saved ? null : 'changed',
          revision,
          document: { data: emptyWorkspace, revision, updatedAt: '2026-08-14T00:00:00.000Z' },
        };
      });
      vi.useFakeTimers();
      const pending = useChoreWorkspaceStore.getState().execute({
        type: 'materialize_occurrences',
        rangeStart: '2026-08-14T00:00:00.000Z',
        rangeEnd: '2026-08-15T00:00:00.000Z',
      });
      try {
        await vi.runAllTimersAsync();
        expect(await pending).toBe(succeed);
      } finally {
        vi.useRealTimers();
      }
      expect(sendChoreWorkspaceCommand).toHaveBeenCalledTimes(2);
      expect(
        new Set(sendChoreWorkspaceCommand.mock.calls.map(([request]) => request.commandId)).size
      ).toBe(1);
      expect(loadChoreWorkspace).not.toHaveBeenCalled();
    }
  );

  it("retains another user's participant edit instead of replaying a stale replacement", async () => {
    const original = {
      id: 'maya',
      displayName: 'Maya',
      capabilities: ['complete' as const],
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
    };
    const before = { ...emptyWorkspace, participantsById: { maya: original } };
    const latest = {
      ...before,
      participantsById: { maya: { ...original, displayName: 'Someone else edited this' } },
    };
    useChoreWorkspaceStore.getState().setPreviewDocument({ data: before, revision: 4 });
    sendChoreWorkspaceCommand.mockResolvedValue({
      saved: false,
      unauthorized: false,
      preconditionFailed: true,
      error: 'Revision changed',
      revision: 5,
      document: { data: latest, revision: 5, updatedAt: original.updatedAt },
    });
    expect(
      await useChoreWorkspaceStore.getState().execute({
        type: 'participant_update',
        actorParticipantId: 'manager',
        participant: { ...original, displayName: 'My edit' },
      })
    ).toBe(false);
    expect(sendChoreWorkspaceCommand).toHaveBeenCalledTimes(1);
    expect(loadChoreWorkspace).not.toHaveBeenCalled();
    expect(useChoreWorkspaceStore.getState()).toMatchObject({
      data: latest,
      revision: 5,
      error: 'Revision changed',
    });
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
