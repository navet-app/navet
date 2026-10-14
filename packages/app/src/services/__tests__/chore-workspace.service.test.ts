import { resetRuntimeContextForTests } from '@navet/app/infrastructure/home-assistant/runtime/runtime-detector';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getChoreWorkspaceTransport,
  loadChoreBackup,
  loadChoreDefinitions,
  loadChoreEvents,
  loadChoreHistory,
  loadChoreOccurrences,
  loadChorePointHistory,
  loadChoreRuntimeCapabilities,
  loadChoreWorkspace,
  recoverChoreWorkspace,
  removeChoreManagementPin,
  resetChoreWorkspace,
  restoreChoreWorkspace,
  sendChoreWorkspaceCommand,
  subscribeChoreWorkspace,
} from '../chore-workspace.service';
import { homeAssistantService } from '../home-assistant.service';

const emptyData = {
  schemaVersion: 2 as const,
  participantsById: {},
  definitionsById: {},
  occurrencesById: {},
  activity: [],
  outbox: [],
};

afterEach(() => {
  window.__NAVET_PANEL__ = false;
  resetRuntimeContextForTests();
  homeAssistantService.disconnect();
  vi.restoreAllMocks();
});

describe('chore workspace service', () => {
  it('reads a bounded point history page without loading the workspace', async () => {
    const value = { contractVersion: 1, revision: 4, cursor: '6000', hasMore: true, points: [] };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(value), { status: 200 }));
    await expect(loadChorePointHistory({ after: '5900', limit: 100 })).resolves.toMatchObject({
      available: true,
      value,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/__navet_chores__/points?after=5900&limit=100'
    );
  });

  it('uses the authenticated Home Assistant WebSocket transport in custom-panel mode', async () => {
    window.__NAVET_PANEL__ = true;
    resetRuntimeContextForTests();
    const callWS = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === 'navet/chores/info') {
        return {
          contractVersion: 1,
          schemaVersion: 2,
          authority: 'home_assistant_panel',
          backgroundScheduling: true,
          backgroundNotifications: true,
          projectionOwnedByAuthority: true,
          actionServices: true,
        };
      }
      return {
        contractVersion: 1,
        revision: message.type === 'navet/chores/command' ? 2 : 1,
        updatedAt: '2026-08-28T08:00:00.000Z',
        data: emptyData,
        management: { pinConfigured: false },
      };
    });
    const subscribeMessage = vi.fn(async (callback: (value: unknown) => void) => {
      callback({
        contractVersion: 1,
        revision: 3,
        updatedAt: '2026-08-28T08:01:00.000Z',
        data: emptyData,
        management: { pinConfigured: false },
      });
      return vi.fn();
    });
    homeAssistantService.setPanelHass({
      states: {},
      config: {},
      callService: vi.fn(),
      callWS,
      connection: { subscribeMessage },
    } as never);

    expect(getChoreWorkspaceTransport().kind).toBe('home_assistant_websocket');

    await expect(loadChoreRuntimeCapabilities()).resolves.toMatchObject({
      authority: 'home_assistant_panel',
      backgroundScheduling: true,
    });
    await expect(loadChoreWorkspace()).resolves.toMatchObject({
      available: true,
      document: { revision: 1 },
    });
    await expect(
      sendChoreWorkspaceCommand({
        commandId: 'panel-command',
        baseRevision: 1,
        action: {
          type: 'participant_create',
          participant: {
            id: 'panel-manager',
            displayName: 'Panel manager',
            capabilities: ['complete', 'approve', 'manage'],
            createdAt: '2026-08-28T08:00:00.000Z',
            updatedAt: '2026-08-28T08:00:00.000Z',
          },
        },
      })
    ).resolves.toMatchObject({ saved: true, revision: 2 });
    const update = vi.fn();
    await subscribeChoreWorkspace(update);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ revision: 3 }));
    expect(callWS.mock.calls.map(([message]) => message.type)).toEqual([
      'navet/chores/info',
      'navet/chores/workspace/get',
      'navet/chores/command',
    ]);
    expect(subscribeMessage).toHaveBeenCalledWith(
      expect.any(Function),
      { type: 'navet/chores/workspace/subscribe' },
      undefined
    );
  });

  it('shows an integration-upgrade error when the panel backend lacks chores', async () => {
    window.__NAVET_PANEL__ = true;
    resetRuntimeContextForTests();
    homeAssistantService.setPanelHass({
      states: {},
      config: {},
      callService: vi.fn(),
      callWS: vi.fn().mockRejectedValue(new Error('Unknown command navet/chores/workspace/get')),
    } as never);

    await expect(loadChoreWorkspace()).resolves.toMatchObject({
      available: false,
      failureKind: 'unsupported',
      error: expect.stringContaining('Update the Navet Home Assistant integration'),
    });
  });

  it('preserves structured recovery metadata from the panel authority', async () => {
    window.__NAVET_PANEL__ = true;
    resetRuntimeContextForTests();
    homeAssistantService.setPanelHass({
      states: {},
      config: {},
      callService: vi.fn(),
      callWS: vi.fn().mockRejectedValue({
        code: 'workspace_invalid',
        message: 'Chore data could not be read',
        data: {
          recovery: {
            backupAvailable: false,
            pinConfigured: true,
            reason: 'workspace_invalid',
          },
        },
      }),
    } as never);

    await expect(loadChoreWorkspace()).resolves.toMatchObject({
      available: false,
      failureKind: 'invalid_data',
      error: 'Chore data could not be read',
      recovery: {
        backupAvailable: false,
        pinConfigured: true,
        reason: 'workspace_invalid',
      },
    });
  });

  it('returns the current revision for stale panel commands', async () => {
    window.__NAVET_PANEL__ = true;
    resetRuntimeContextForTests();
    homeAssistantService.setPanelHass({
      states: {},
      config: {},
      callService: vi.fn(),
      callWS: vi.fn().mockRejectedValue({
        code: 'stale_revision',
        message: 'Chore workspace changed on another client',
        data: { revision: 9 },
      }),
    } as never);

    await expect(
      sendChoreWorkspaceCommand({
        commandId: 'stale-panel-command',
        baseRevision: 8,
        action: {
          type: 'participant_create',
          participant: {
            id: 'manager',
            displayName: 'Manager',
            capabilities: ['complete', 'approve', 'manage'],
            createdAt: '2026-08-28T08:00:00.000Z',
            updatedAt: '2026-08-28T08:00:00.000Z',
          },
        },
      })
    ).resolves.toMatchObject({
      saved: false,
      preconditionFailed: true,
      revision: 9,
      retryable: false,
    });
  });

  it('does not automatically retry an expired panel command', async () => {
    window.__NAVET_PANEL__ = true;
    resetRuntimeContextForTests();
    homeAssistantService.setPanelHass({
      states: {},
      config: {},
      callService: vi.fn(),
      callWS: vi.fn().mockRejectedValue({
        code: 'command_expired',
        message: 'Chore action could not be applied',
      }),
    } as never);
    await expect(
      sendChoreWorkspaceCommand({
        commandId: 'expired-adjustment',
        baseRevision: 1,
        action: {
          type: 'experience_points_adjust',
          actorParticipantId: 'manager',
          participantId: 'manager',
          pointsDelta: 10,
        },
      })
    ).resolves.toMatchObject({ saved: false, preconditionFailed: false, retryable: false });
  });

  it('loads and conditionally refreshes the shared document', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          revision: 2,
          updatedAt: '2026-08-10T08:00:00.000Z',
          data: emptyData,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'X-Navet-Chore-Revision': '2' },
        }
      )
    );

    await expect(loadChoreWorkspace(1)).resolves.toMatchObject({
      available: true,
      revision: 2,
      document: { revision: 2, data: emptyData },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${window.location.origin}/__navet_chores__/workspace`
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'same-origin',
      headers: { 'X-Navet-Chore-Revision': '1' },
    });
  });

  it('sends the base revision and classifies a concurrent write', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'changed' }), {
        status: 412,
        headers: { 'X-Navet-Chore-Revision': '4' },
      })
    );

    await expect(
      sendChoreWorkspaceCommand({
        commandId: 'command-1',
        baseRevision: 3,
        action: {
          type: 'participant_create',
          participant: {
            id: 'maya',
            displayName: 'Maya',
            capabilities: ['complete', 'approve', 'manage'],
            createdAt: '2026-08-10T08:00:00.000Z',
            updatedAt: '2026-08-10T08:00:00.000Z',
          },
        },
      })
    ).resolves.toMatchObject({
      saved: false,
      preconditionFailed: true,
      revision: 4,
    });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-Navet-Base-Revision': '3',
      },
    });
  });

  it('sends occurrence actions without a client-authored workspace replacement', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          revision: 4,
          updatedAt: '2026-08-10T08:10:00.000Z',
          data: emptyData,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'X-Navet-Chore-Revision': '4' },
        }
      )
    );

    await expect(
      sendChoreWorkspaceCommand({
        commandId: 'command-complete',
        baseRevision: 3,
        action: {
          type: 'occurrence_action',
          occurrenceId: 'occurrence-1',
          action: { type: 'complete', participantId: 'maya' },
        },
      })
    ).resolves.toMatchObject({ saved: true, revision: 4 });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody).toEqual({
      action: {
        type: 'occurrence_action',
        occurrenceId: 'occurrence-1',
        action: { type: 'complete', participantId: 'maya' },
      },
      baseRevision: 3,
      commandId: 'command-complete',
    });
    expect(requestBody).not.toHaveProperty('data');
  });

  it.each([true, false])('validates the workspace supplied with a conflict (%s)', async (valid) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          contractVersion: 1,
          revision: 4,
          updatedAt: '2026-08-10T08:00:00.000Z',
          data: valid ? emptyData : { invalid: true },
          error: 'changed',
        }),
        { status: 412, headers: { 'X-Navet-Chore-Revision': '4' } }
      )
    );
    const result = await sendChoreWorkspaceCommand({
      commandId: 'conflict',
      baseRevision: 3,
      action: {
        type: 'materialize_occurrences',
        rangeStart: '2026-08-10T00:00:00.000Z',
        rangeEnd: '2026-08-11T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({
      saved: false,
      preconditionFailed: true,
      revision: 4,
      error: 'changed',
    });
    if (valid) expect(result.document).toMatchObject({ revision: 4, data: emptyData });
    else expect(result.document).toBeNull();
  });

  it('returns the storage authority error for a rejected action', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Only available chores can be completed' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(
      sendChoreWorkspaceCommand({
        commandId: 'command-complete',
        baseRevision: 3,
        action: {
          type: 'occurrence_action',
          occurrenceId: 'occurrence-1',
          action: { type: 'complete', participantId: 'maya' },
        },
      })
    ).resolves.toMatchObject({
      error: 'Only available chores can be completed',
      saved: false,
    });
  });

  it('does not accept a malformed success document', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ revision: 1, updatedAt: 'invalid', data: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(loadChoreWorkspace()).resolves.toMatchObject({
      available: false,
      failureKind: 'invalid_data',
      error: expect.stringContaining('could not safely read'),
      document: null,
    });
  });

  it('returns actionable recovery details and sends an explicit recovery request', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: 'Chore data could not be read',
            recovery: {
              backupAvailable: true,
              pinConfigured: true,
              reason: 'workspace_invalid',
            },
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            revision: 5,
            updatedAt: '2026-08-15T20:00:00.000Z',
            data: emptyData,
            management: { pinConfigured: true },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    await expect(loadChoreWorkspace()).resolves.toMatchObject({
      available: false,
      failureKind: 'invalid_data',
      error: 'Chore data could not be read',
      recovery: { backupAvailable: true, pinConfigured: true, reason: 'workspace_invalid' },
    });
    await expect(
      recoverChoreWorkspace({
        action: 'restore_backup',
        confirmation: 'REPAIR CHORES',
        managementSessionToken: 'manager-session',
      })
    ).resolves.toMatchObject({ saved: true, revision: 5 });

    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${window.location.origin}/__navet_chores__/recovery`
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        'X-Navet-Chore-Management-Session': 'manager-session',
      }),
      body: JSON.stringify({ action: 'restore_backup', confirmation: 'REPAIR CHORES' }),
    });
  });

  it('does not present temporary storage failures as damaged chore data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error:
            'Chore storage could not finish the request. Your saved data has not been replaced.',
          recovery: {
            backupAvailable: true,
            pinConfigured: true,
            reason: 'storage_unavailable',
          },
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      )
    );

    await expect(loadChoreWorkspace()).resolves.toMatchObject({
      available: false,
      failureKind: 'unreachable',
      recovery: null,
    });
  });

  it('removes the management PIN with the active management session', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ pinConfigured: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(
      removeChoreManagementPin({ actorParticipantId: 'maya' }, 'manager-session')
    ).resolves.toMatchObject({
      removed: true,
      document: { pinConfigured: false },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${window.location.origin}/__navet_chores__/management/pin`,
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          'X-Navet-Chore-Management-Session': 'manager-session',
        }),
        body: JSON.stringify({ actorParticipantId: 'maya' }),
      })
    );
  });

  it('removes the management PIN through the authenticated panel transport', async () => {
    window.__NAVET_PANEL__ = true;
    resetRuntimeContextForTests();
    const callWS = vi.fn().mockResolvedValue({ pinConfigured: false });
    homeAssistantService.setPanelHass({
      states: {},
      config: {},
      callService: vi.fn(),
      callWS,
    } as never);

    await expect(
      removeChoreManagementPin({ actorParticipantId: 'maya' }, 'manager-session')
    ).resolves.toMatchObject({ removed: true });
    expect(callWS).toHaveBeenCalledWith({
      type: 'navet/chores/management/pin/remove',
      actorParticipantId: 'maya',
      managementSessionToken: 'manager-session',
    });
  });

  it('loads the provider-neutral automation resources with filters and cursors', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ contractVersion: 1, revision: 4, definitions: [] }))
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ contractVersion: 1, revision: 4, occurrences: [] }))
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ contractVersion: 1, cursor: '7', hasMore: false, events: [] })
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ contractVersion: 1, events: [] })));

    await expect(loadChoreDefinitions()).resolves.toMatchObject({
      available: true,
      value: { revision: 4, definitions: [] },
    });
    await expect(
      loadChoreOccurrences({ from: '2026-08-10T00:00:00.000Z', participantId: 'maya' })
    ).resolves.toMatchObject({ available: true, value: { revision: 4, occurrences: [] } });
    await expect(loadChoreEvents({ after: '4', limit: 50 })).resolves.toMatchObject({
      available: true,
      value: { cursor: '7', hasMore: false, events: [] },
    });
    await expect(loadChoreHistory()).resolves.toMatchObject({
      available: true,
      value: { contractVersion: 1, events: [] },
    });

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `${window.location.origin}/__navet_chores__/definitions`,
      `${window.location.origin}/__navet_chores__/occurrences?from=2026-08-10T00%3A00%3A00.000Z&participantId=maya`,
      `${window.location.origin}/__navet_chores__/events?after=4&limit=50`,
      `${window.location.origin}/__navet_chores__/history`,
    ]);
  });

  it('validates a versioned backup before returning it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          contract: 'navet.chores',
          version: 1,
          exportedAt: '2026-08-14T12:00:00.000Z',
          workspace: emptyData,
          events: [],
        })
      )
    );
    await expect(loadChoreBackup()).resolves.toMatchObject({
      available: true,
      value: { contract: 'navet.chores', version: 1 },
    });
  });

  it('sends explicit restore and destructive reset administration requests', async () => {
    const responseBody = JSON.stringify({
      revision: 5,
      updatedAt: '2026-08-14T12:00:00.000Z',
      data: emptyData,
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(responseBody, { status: 200, headers: { 'Content-Type': 'application/json' } })
      );
    const backup = {
      contract: 'navet.chores' as const,
      version: 1 as const,
      exportedAt: '2026-08-14T12:00:00.000Z',
      workspace: emptyData,
      events: [],
    };
    await restoreChoreWorkspace({
      commandId: 'restore',
      baseRevision: 4,
      actorParticipantId: 'maya',
      mode: 'merge',
      document: backup,
    });
    await resetChoreWorkspace({
      commandId: 'reset',
      baseRevision: 5,
      actorParticipantId: 'maya',
      confirmation: 'DELETE ALL CHORES',
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `${window.location.origin}/__navet_chores__/restore`,
      `${window.location.origin}/__navet_chores__/reset`,
    ]);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({ 'X-Navet-Base-Revision': '5' }),
    });
  });
});
