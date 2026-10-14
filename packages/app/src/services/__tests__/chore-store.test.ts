import { createHash } from 'node:crypto';
import choreCalendarPolicy from '@docker/njs/chore-calendar-policy.js';
import durableStorage from '@docker/njs/chore-durable-storage.js';
import choreOccurrencePolicy from '@docker/njs/chore-occurrence-policy.js';
import choreStore from '@docker/njs/chore-store.js';
import conformanceVectors from '@navet/core/chore-conformance-vectors.json';
import { createChoreExperienceState } from '@navet/core/chore-experience';
import type { ApplyChoreCommandInput, ChoreOccurrence } from '@navet/core/chores';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  continuousMaterializationFixture,
  loneStaleRepeatFixture,
  longIntervalRepairFixture,
} from '../../../../../testing/chore-storage-fixture';
import { fileDescriptorFixture } from '../../../../../testing/file-descriptors';
import {
  getChoreMaterializationRange,
  materializeChoreWorkspace,
} from '../../features/chores/chore-workspace-model';

const WORKSPACE_PATH = '/data/navet-dashboard-workspace.json';
const CHORE_PATH = '/data/navet-chore-workspace.json';
const CHORE_LAST_GOOD_PATH = '/data/navet-chore-workspace.last-good.json';
const JOURNAL_PATH = '/data/navet-chore-command-journal.json';
const EVENT_HISTORY_PATH = '/data/navet-chore-events.json';
const OCCURRENCE_ID = 'dishes:2026-08-10T10:00:00.000Z:maya';
const TENANT_ID = `hat_${'a'.repeat(64)}`;
const REBOUND_TENANT_ID = `hat_${'b'.repeat(64)}`;
const PRINCIPAL = {
  providerId: 'home_assistant',
  tenantId: TENANT_ID,
  sessionId: 'nas_chore_test',
  userId: 'ha-user-1',
  userName: 'Vishal',
};

function createRequest(
  overrides: Partial<{
    method: string;
    uri: string;
    args: string;
    headersIn: Record<string, string>;
    requestText: string;
  }> = {}
) {
  return {
    method: 'GET',
    uri: '/__navet_chores__/workspace',
    headersOut: {} as Record<string, string>,
    requestText: '',
    args: '',
    return: vi.fn(),
    ...overrides,
    headersIn: {
      Host: 'navet.example',
      Origin: 'http://navet.example',
      ...overrides.headersIn,
    },
  };
}

function createMockFs() {
  const files = new Map<string, string>();
  const missing = (path: string) => {
    const error = new Error(`ENOENT: ${path}`);
    // @ts-expect-error test-only file-system error shape
    error.code = 'ENOENT';
    return error;
  };
  return {
    ...fileDescriptorFixture((path) => {
      const content = files.get(path);
      if (content === undefined) throw missing(path);
      return content;
    }),
    statSync: vi.fn((path: string) => {
      const value = files.get(path);
      if (value === undefined) throw missing(path);
      return { size: value.length };
    }),
    readFileSync: vi.fn((path: string) => {
      const value = files.get(path);
      if (value === undefined) throw missing(path);
      return value;
    }),
    writeFileSync: vi.fn((path: string, value: string) => files.set(path, value)),
    renameSync: vi.fn((source: string, destination: string) => {
      const value = files.get(source);
      if (value === undefined) throw missing(source);
      files.set(destination, value);
      files.delete(source);
    }),
    unlinkSync: vi.fn((path: string) => {
      if (!files.delete(path)) throw missing(path);
    }),
    getFile: (path: string) => files.get(path),
    listFiles: () => [...files.keys()],
    readdirSync: vi.fn((directory: string) =>
      [...files.keys()]
        .filter((path) => path.startsWith(`${directory}/`))
        .map((path) => path.slice(directory.length + 1))
    ),
  };
}

function createMockSharedDict() {
  const values = new Map<string, string>();
  const dictionary = {
    delete: vi.fn((key: string) => values.delete(key)),
    get: vi.fn((key: string) => values.get(key)),
    set: vi.fn((key: string, value: string) => {
      values.set(key, value);
      return dictionary;
    }),
  };
  return dictionary;
}

function seededData(commandId: string) {
  const timestamp = '2026-08-10T08:00:00.000Z';
  return {
    schemaVersion: 2,
    participantsById: {
      maya: {
        id: 'maya',
        displayName: 'Maya',
        capabilities: ['complete'],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    },
    definitionsById: {
      dishes: {
        id: 'dishes',
        title: 'Empty dishes',
        enabled: true,
        assignment: { mode: 'person', participantIds: ['maya'] },
        schedule: {
          frequency: 'once',
          date: '2026-08-10',
          time: '10:00',
          timeZone: 'UTC',
        },
        dueWindowMinutes: 120,
        approval: { required: false, approverIds: [] },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    },
    occurrencesById: {
      [OCCURRENCE_ID]: {
        id: OCCURRENCE_ID,
        definitionId: 'dishes',
        scheduledAt: '2026-08-10T10:00:00.000Z',
        dueAt: '2026-08-10T12:00:00.000Z',
        assigneeIds: ['maya'],
        assignmentSlot: 'maya',
        status: 'available',
        updatedAt: timestamp,
      },
    },
    activity: [
      {
        id: `activity:${commandId}`,
        commandId,
        type: 'workspace_materialized',
        timestamp,
      },
    ],
    outbox: [],
  };
}

function parseResponse(request: ReturnType<typeof createRequest>) {
  const body = request.return.mock.calls.at(-1)?.[1];
  return typeof body === 'string' ? JSON.parse(body) : null;
}

function createActionRequest(
  commandId: string,
  baseRevision: number,
  action: Record<string, unknown>
) {
  return createRequest({
    method: 'POST',
    uri: '/__navet_chores__/commands',
    headersIn: { 'X-Navet-Base-Revision': String(baseRevision) },
    requestText: JSON.stringify({ commandId, baseRevision, action }),
  });
}

function managerParticipant(id = 'maya') {
  return {
    id,
    displayName: id === 'maya' ? 'Maya' : 'Sofia',
    capabilities: ['complete', 'approve', 'manage'],
    createdAt: '2026-08-10T08:00:00.000Z',
    updatedAt: '2026-08-10T08:00:00.000Z',
  };
}

function seedOccurrenceWorkspace() {
  const source = seededData('unused');
  const participant = createActionRequest('participant', 0, {
    type: 'participant_create',
    participant: managerParticipant(),
  });
  choreStore.handle(participant);
  const definition = createActionRequest('definition', 1, {
    type: 'definition_create',
    actorParticipantId: 'maya',
    definition: source.definitionsById.dishes,
  });
  choreStore.handle(definition);
  const materialize = createActionRequest('materialize', 2, {
    type: 'materialize_occurrences',
    rangeStart: '2026-08-10T00:00:00.000Z',
    rangeEnd: '2026-08-11T00:00:00.000Z',
  });
  choreStore.handle(materialize);
}

afterEach(() => {
  choreStore.resetChoreStoreForTests();
  delete process.env.SUPERVISOR_TOKEN;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('NJS chore workspace store', () => {
  it.each([
    [14, '2026-10-18T16:00:00.000Z'],
    [365, '2027-10-04T16:00:00.000Z'],
    [3650, '2036-10-01T16:00:00.000Z'],
  ])(
    'persists and reloads the next date for a %i-day completion interval',
    (intervalDays, nextDate) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-04T10:00:00.000Z'));
      const mockFs = createMockFs();
      choreStore.setChoreStoreFsForTests(mockFs);
      choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
      seedOccurrenceWorkspace();
      const document = JSON.parse(mockFs.getFile(CHORE_PATH) ?? '{}');
      document.data.definitionsById.dishes.schedule = {
        frequency: 'after_completion',
        startDate: '2026-10-08',
        time: '18:00',
        timeZone: 'Europe/Stockholm',
        intervalDays,
      };
      const id = 'dishes:2026-10-08T16:00:00.000Z:maya';
      document.data.occurrencesById = {
        [id]: {
          ...document.data.occurrencesById[OCCURRENCE_ID],
          id,
          scheduledAt: '2026-10-08T16:00:00.000Z',
          dueAt: '2026-10-08T17:00:00.000Z',
        },
      };
      mockFs.writeFileSync(CHORE_PATH, JSON.stringify(document));
      const complete = createActionRequest('early-completion', document.revision, {
        type: 'occurrence_action',
        occurrenceId: id,
        action: { type: 'complete', participantId: 'maya' },
      });
      choreStore.handle(complete);
      expect(complete.return).toHaveBeenCalledWith(200, expect.any(String));
      const saved = JSON.parse(mockFs.getFile(CHORE_PATH) ?? '{}');
      expect(
        Object.values(saved.data.occurrencesById as Record<string, ChoreOccurrence>)
          .filter((item: ChoreOccurrence) => item.status === 'available')
          .map((item: ChoreOccurrence) => item.scheduledAt)
      ).toEqual([nextDate]);
      choreStore.resetChoreStoreForTests();
      choreStore.setChoreStoreFsForTests(mockFs);
      choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
      const reload = createRequest();
      choreStore.handle(reload);
      expect(parseResponse(reload).data.occurrencesById).toEqual(saved.data.occurrencesById);
      const reopen = createActionRequest('reopen-completion', saved.revision, {
        type: 'occurrence_action',
        occurrenceId: id,
        action: { type: 'reopen', participantId: 'maya', reason: 'Completed by mistake' },
      });
      choreStore.handle(reopen);
      expect(reopen.return).toHaveBeenCalledWith(200, expect.any(String));
      expect(
        Object.values(parseResponse(reopen).data.occurrencesById as Record<string, ChoreOccurrence>)
          .filter((item) => item.status === 'available')
          .map((item) => item.scheduledAt)
      ).toEqual(['2026-10-08T16:00:00.000Z']);
    }
  );

  it('keeps large accounting and unfinished work durable across commands, restarts and backup recovery', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T08:00:00.000Z'));
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
    seedOccurrenceWorkspace();
    const document = JSON.parse(mockFs.getFile(CHORE_PATH) ?? '{}');
    document.data.experience = createChoreExperienceState();
    document.data.experience.earnedPointsByParticipant = { maya: 12000 };
    document.data.experience.pointTransactions = Array.from({ length: 12000 }, (_, index) => ({
      id: `transaction:${index}:${'x'.repeat(150)}`,
      participantId: 'maya',
      pointsDelta: 1,
      kind: 'adjustment',
      timestamp: document.updatedAt,
    }));
    document.data.experience.pointTransactions[0].id += 'é'.repeat(140000);
    document.data.experience.progressAwards = [
      {
        id: 'earned',
        targetId: 'target',
        participantId: 'maya',
        cycleKey: 'lifetime',
        awardedAt: document.updatedAt,
      },
    ];
    const occurrence = document.data.occurrencesById[OCCURRENCE_ID];
    for (let index = 0; index < 6000; index++) {
      const id = `unfinished:${index}`;
      document.data.occurrencesById[id] = { ...occurrence, id };
    }
    expect(JSON.stringify(document).length).toBeGreaterThan(2 * 1024 * 1024);
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    const stored = durableStorage.encode(document, 2 * 1024 * 1024, hash, (key, chunk) =>
      mockFs.writeFileSync(`${CHORE_PATH}.chunk-${key}`, JSON.stringify(chunk))
    );
    mockFs.writeFileSync(CHORE_PATH, JSON.stringify(stored));
    const adjust = createActionRequest('large-ledger-adjust', document.revision, {
      type: 'experience_points_adjust',
      actorParticipantId: 'maya',
      participantId: 'maya',
      pointsDelta: 10,
    });
    choreStore.handle(adjust);
    expect(adjust.return).toHaveBeenCalledWith(200, expect.any(String));
    const updated = parseResponse(adjust);
    expect(updated.data.experience.pointTransactions).toHaveLength(12001);
    expect(updated.data.experience.earnedPointsByParticipant.maya).toBe(12010);
    expect(updated.data.experience.progressAwards).toEqual(document.data.experience.progressAwards);
    expect(Object.keys(updated.data.occurrencesById)).toHaveLength(6001);
    expect(mockFs.getFile(CHORE_PATH)?.length).toBeLessThan(2 * 1024 * 1024);
    choreStore.resetChoreStoreForTests();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
    const reload = createRequest();
    choreStore.handle(reload);
    expect(parseResponse(reload).data.experience).toEqual(updated.data.experience);
    const backup = createRequest({ uri: '/__navet_chores__/backup' });
    choreStore.handle(backup);
    expect(parseResponse(backup).workspace.experience.pointTransactions).toHaveLength(12001);
    const failWrite = mockFs.renameSync.getMockImplementation();
    mockFs.renameSync.mockImplementation((source, destination) => {
      if (destination.includes('.chunk-')) throw new Error('Interrupted chunk write');
      failWrite?.(source, destination);
    });
    const failed = createActionRequest('interrupted-adjust', updated.revision, {
      type: 'experience_points_adjust',
      actorParticipantId: 'maya',
      participantId: 'maya',
      pointsDelta: 10,
    });
    choreStore.handle(failed);
    expect(failed.return.mock.calls.at(-1)?.[0]).toBeGreaterThanOrEqual(400);
    if (!failWrite) throw new Error('Expected file rename implementation');
    mockFs.renameSync.mockImplementation(failWrite);
    const afterFailure = createRequest();
    choreStore.handle(afterFailure);
    expect(parseResponse(afterFailure).data.experience).toEqual(updated.data.experience);
    const materialize = createActionRequest('large-workspace-materialize', updated.revision, {
      type: 'materialize_occurrences',
      rangeStart: '2026-08-10T00:00:00.000Z',
      rangeEnd: '2026-08-11T00:00:00.000Z',
    });
    choreStore.handle(materialize);
    expect(materialize.return).toHaveBeenCalledWith(200, expect.any(String));
    expect(Object.keys(parseResponse(materialize).data.occurrencesById)).toHaveLength(6001);
    const primary = JSON.parse(mockFs.getFile(CHORE_PATH) ?? '{}');
    mockFs.writeFileSync(`${CHORE_PATH}.chunk-${primary.durableCollections.activity.at(-1)}`, '{');
    const recovered = createRequest();
    choreStore.handle(recovered);
    expect(parseResponse(recovered).data.experience.pointTransactions).toHaveLength(12001);
  }, 15_000);

  it('persists fixed missed history through successor retention and frequency edits, then clears it on reopen', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T08:00:00.000Z'));
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
    seedOccurrenceWorkspace();
    const stored = JSON.parse(mockFs.getFile(CHORE_PATH) ?? '{}');
    stored.data.definitionsById.dishes.schedule = {
      frequency: 'weekly',
      startDate: '2026-08-10',
      time: '10:00',
      timeZone: 'UTC',
      daysOfWeek: [1],
    };
    const older = stored.data.occurrencesById[OCCURRENCE_ID];
    older.status = 'missed';
    stored.data.occurrencesById.successor = {
      ...older,
      id: 'successor',
      scheduledAt: '2026-08-17T10:00:00.000Z',
      dueAt: '2026-08-17T12:00:00.000Z',
      status: 'done',
      completedAt: '2026-08-17T12:00:00.000Z',
      updatedAt: '2026-08-17T12:00:00.000Z',
    };
    mockFs.writeFileSync(CHORE_PATH, JSON.stringify(stored));
    vi.setSystemTime(new Date('2026-12-01T08:00:00.000Z'));
    const read = createRequest();
    choreStore.handle(read);
    const materialize = createActionRequest(
      'prune-historical-successor',
      parseResponse(read).revision,
      {
        type: 'materialize_occurrences',
        rangeStart: '2026-12-01T00:00:00.000Z',
        rangeEnd: '2026-12-02T00:00:00.000Z',
      }
    );
    choreStore.handle(materialize);
    const retained = parseResponse(materialize);
    expect(retained.data.occurrencesById.successor).toBeUndefined();
    expect(retained.data.occurrencesById[OCCURRENCE_ID]).toMatchObject({
      status: 'missed',
      supersededAt: '2026-08-17T10:00:00.000Z',
    });
    expect(
      JSON.parse(mockFs.getFile(CHORE_PATH) ?? '{}').data.occurrencesById[OCCURRENCE_ID]
        .supersededAt
    ).toBe('2026-08-17T10:00:00.000Z');
    const edit = createActionRequest('edit-historical-frequency', retained.revision, {
      type: 'definition_update',
      actorParticipantId: 'maya',
      definition: {
        ...retained.data.definitionsById.dishes,
        schedule: {
          frequency: 'after_completion',
          startDate: '2026-12-01',
          time: '10:00',
          timeZone: 'UTC',
          intervalDays: 7,
        },
      },
    });
    choreStore.handle(edit);
    const edited = parseResponse(edit);
    expect(edited.data.occurrencesById[OCCURRENCE_ID].supersededAt).toBe(
      '2026-08-17T10:00:00.000Z'
    );
    const reopen = createActionRequest('reopen-historical-work', edited.revision, {
      type: 'occurrence_action',
      occurrenceId: OCCURRENCE_ID,
      action: { type: 'reopen', participantId: 'maya', reason: 'Again' },
    });
    choreStore.handle(reopen);
    expect(parseResponse(reopen).data.occurrencesById[OCCURRENCE_ID]).toMatchObject({
      status: 'available',
    });
    expect(parseResponse(reopen).data.occurrencesById[OCCURRENCE_ID].supersededAt).toBeUndefined();
  });

  it('matches standby and fair rotation assignment in the packaged policy', () => {
    const timestamp = '2026-08-01T00:00:00.000Z';
    const alice = {
      id: 'alice',
      displayName: 'Alice',
      capabilities: ['complete' as const],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const participants = {
      alice: { ...alice, pausedAt: timestamp },
      bob: {
        id: 'bob',
        displayName: 'Bob',
        capabilities: ['complete' as const],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    };
    expect(
      choreCalendarPolicy.resolveAssignmentSlots(
        { mode: 'person', participantIds: ['alice'], standbyParticipantIds: ['bob'] },
        participants,
        0
      )
    ).toEqual([{ assignmentSlot: 'standby', assigneeIds: ['bob'] }]);
    expect(
      choreCalendarPolicy.resolveAssignmentSlots(
        { mode: 'rotation', participantIds: ['alice', 'bob'], rotationStrategy: 'fair' },
        { ...participants, alice },
        0,
        { alice: 2, bob: 1 }
      )
    ).toEqual([{ assignmentSlot: 'bob', assigneeIds: ['bob'] }]);
  });

  it('rejects malformed progress and ledger values at the Docker storage boundary', () => {
    const mutations = [
      (experience: ReturnType<typeof createChoreExperienceState>) => {
        experience.badgesById.bad = { id: 'bad', title: 'Bad', metric: 'count', target: 0 };
      },
      (experience: ReturnType<typeof createChoreExperienceState>) => {
        experience.achievementsById.bad = {
          id: 'bad',
          title: 'Bad',
          metric: 'count',
          target: 1,
          awardPoints: '50' as unknown as number,
        };
      },
      (experience: ReturnType<typeof createChoreExperienceState>) => {
        experience.progressAwards.push({ id: 'bad' } as never);
      },
      (experience: ReturnType<typeof createChoreExperienceState>) => {
        experience.pointTransactions.push({
          id: 'bad',
          participantId: 'maya',
          pointsDelta: 1,
          timestamp: '2026-08-10T08:00:00.000Z',
          kind: 'invalid' as never,
        });
      },
      (experience: ReturnType<typeof createChoreExperienceState>) => {
        const item = {
          id: 'same',
          participantId: 'maya',
          pointsDelta: 1,
          timestamp: '2026-08-10T08:00:00.000Z',
          kind: 'completion' as const,
        };
        experience.pointTransactions.push(item, item);
      },
    ];
    for (const mutate of mutations) {
      const data = { ...seededData('validation'), experience: createChoreExperienceState() };
      expect(choreStore.isValidChoreWorkspaceData(data)).toBe(true);
      mutate(data.experience);
      expect(choreStore.isValidChoreWorkspaceData(data)).toBe(false);
    }
  });

  it('keeps fair rotation stable with personal date and time overrides in Docker', () => {
    const vector = conformanceVectors.materialization.find((item) =>
      item.name.startsWith('fair rotation')
    );
    if (!vector) throw new Error('Expected fair rotation vector');
    const definition = {
      ...vector.definition,
      assignment: {
        ...vector.definition.assignment,
        participantScheduleOverrides: {
          alice: { dueDateOffsetDays: 1, times: ['19:00'] },
          bob: { times: ['20:00'] },
        },
      },
    };
    const participants = Object.fromEntries(vector.participants.map((item) => [item.id, item]));
    const first = choreStore.materializeDefinitionForTests(
      definition,
      participants,
      vector.rangeStart,
      vector.rangeEnd,
      {},
      undefined
    );
    const existing = Object.fromEntries(first.map((item: { id: string }) => [item.id, item]));
    expect(
      choreStore.materializeDefinitionForTests(
        definition,
        participants,
        vector.rangeStart,
        vector.rangeEnd,
        existing,
        undefined
      )
    ).toEqual(first);
  });

  it('keeps paused future work available for reviewed vacation rescheduling in Docker', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T08:00:00.000Z'));
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
    choreStore.handle(
      createActionRequest('manager', 0, {
        type: 'participant_create',
        participant: managerParticipant(),
      })
    );
    choreStore.handle(
      createActionRequest('sofia', 1, {
        type: 'participant_create',
        actorParticipantId: 'maya',
        participant: managerParticipant('sofia'),
      })
    );
    const definition = {
      ...seededData('vacation').definitionsById.dishes,
      assignment: { mode: 'person', participantIds: ['sofia'] },
    };
    choreStore.handle(
      createActionRequest('definition', 2, {
        type: 'definition_create',
        actorParticipantId: 'maya',
        definition,
      })
    );
    choreStore.handle(
      createActionRequest('materialize', 3, {
        type: 'materialize_occurrences',
        rangeStart: '2026-08-01T00:00:00.000Z',
        rangeEnd: '2026-08-12T00:00:00.000Z',
      })
    );
    const pause = createActionRequest('pause', 4, {
      type: 'participant_update',
      actorParticipantId: 'maya',
      participant: {
        ...managerParticipant('sofia'),
        pausedAt: '2026-08-02T00:00:00.000Z',
        resumeAt: '2026-08-12T00:00:00.000Z',
      },
    });
    choreStore.handle(pause);
    expect(pause.return).toHaveBeenCalledWith(200, expect.any(String));
    const id = Object.keys(parseResponse(pause).data.occurrencesById)[0];
    expect(id).toBeDefined();
    vi.setSystemTime(new Date('2026-08-12T08:00:00.000Z'));
    const move = createActionRequest('vacation-review', 5, {
      type: 'vacation_reschedule',
      actorParticipantId: 'maya',
      participantId: 'sofia',
      occurrenceIds: [id],
      startDate: '2026-08-13',
    });
    choreStore.handle(move);
    expect(move.return).toHaveBeenCalledWith(200, expect.any(String));
    expect(
      Object.values(parseResponse(move).data.occurrencesById).some(
        (item) => (item as { carriedForwardFrom?: string }).carriedForwardFrom === id
      )
    ).toBe(true);
  });

  it('materializes hourly chores across DST in the Docker policy', () => {
    const definition = {
      id: 'dishes',
      title: 'Dishes',
      enabled: true,
      assignment: { mode: 'person', participantIds: ['maya'] },
      schedule: {
        frequency: 'hourly',
        startDate: '2026-10-25',
        time: '01:00',
        timeZone: 'Europe/Stockholm',
        intervalHours: 2,
      },
      dueWindowMinutes: 60,
    };
    const occurrences = choreStore.materializeDefinitionForTests(
      definition,
      { maya: { capabilities: ['complete'] } },
      '2026-10-24T22:00:00.000Z',
      '2026-10-25T06:00:00.000Z',
      {},
      undefined
    );
    expect(
      occurrences.map((occurrence: { scheduledAt: string }) => occurrence.scheduledAt)
    ).toEqual([
      '2026-10-24T23:00:00.000Z',
      '2026-10-25T01:00:00.000Z',
      '2026-10-25T03:00:00.000Z',
      '2026-10-25T05:00:00.000Z',
    ]);
  });
  for (const vector of conformanceVectors.materialization) {
    it(`matches shared conformance: ${vector.name}`, () => {
      const participantsById = Object.fromEntries(
        vector.participants.map((participant) => [participant.id, participant])
      );
      const occurrences = choreStore.materializeDefinitionForTests(
        vector.definition,
        participantsById,
        vector.rangeStart,
        vector.rangeEnd,
        {},
        undefined
      );
      expect(
        occurrences.map((occurrence: { scheduledAt: string; assigneeIds: string[] }) => ({
          scheduledAt: occurrence.scheduledAt,
          assigneeIds: occurrence.assigneeIds,
        }))
      ).toEqual(vector.expected);
    });
  }

  it.each([{ rotationCadence: 'weekly' }, { rotationDayOfWeek: 0 }])(
    'reconciles unstarted occurrences after a rotation edit: %j',
    (change) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-28T08:00:00.000Z'));
      const mockFs = createMockFs();
      choreStore.setChoreStoreFsForTests(mockFs);
      choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
      let revision = 0;
      const send = (action: Record<string, unknown>) => {
        let request = createActionRequest(`command-${revision}`, revision, action);
        choreStore.handle(request);
        if (request.return.mock.calls.at(-1)?.[0] === 412) {
          revision = parseResponse(request).revision;
          request = createActionRequest(`command-${revision}`, revision, action);
          choreStore.handle(request);
        }
        expect(request.return).toHaveBeenCalledWith(200, expect.any(String));
        const result = parseResponse(request);
        revision = result.revision;
        return result.data;
      };
      send({ type: 'participant_create', participant: managerParticipant() });
      send({
        type: 'participant_create',
        actorParticipantId: 'maya',
        participant: managerParticipant('sofia'),
      });
      const definition = {
        ...seededData('fixture').definitionsById.dishes,
        assignment: {
          mode: 'rotation',
          participantIds: ['maya', 'sofia'],
          ...('rotationDayOfWeek' in change ? { rotationCadence: 'weekly' } : {}),
        },
        schedule: { frequency: 'daily', startDate: '2026-09-28', time: '18:00', timeZone: 'UTC' },
      };
      send({ type: 'definition_create', actorParticipantId: 'maya', definition });
      send({
        type: 'materialize_occurrences',
        rangeStart: '2026-09-28T00:00:00.000Z',
        rangeEnd: '2026-10-07T00:00:00.000Z',
      });
      const stored = JSON.parse(mockFs.getFile(CHORE_PATH) ?? '{}');
      const occurrences = Object.values(stored.data.occurrencesById) as Array<
        Record<string, unknown>
      >;
      const preserved: Record<string, unknown> = {};
      ['done', 'claimed', 'awaiting_approval', 'skipped', 'missed'].forEach((status, index) => {
        occurrences[index].status = status;
        preserved[String(occurrences[index].id)] = { ...occurrences[index] };
      });
      occurrences[5].carriedForwardFrom = 'earlier';
      preserved[String(occurrences[5].id)] = { ...occurrences[5] };
      preserved[String(occurrences[6].id)] = { ...occurrences[6] };
      vi.setSystemTime(new Date('2026-10-05T08:00:00.000Z'));
      const staleId = occurrences.at(-1)?.id;
      stored.data.outbox = ['pending', 'delivered'].map((status) => ({
        id: `reminder-${status}`,
        activityId: 'reminder',
        eventType: 'reminder_due',
        occurrenceId: staleId,
        status,
        attempts: 0,
        createdAt: '2026-09-28T08:00:00.000Z',
        nextAttemptAt: '2026-09-28T08:00:00.000Z',
      }));
      mockFs.writeFileSync(CHORE_PATH, JSON.stringify(stored));
      const tick = createRequest();
      choreStore.handle(tick);
      const scheduled = JSON.parse(mockFs.getFile(CHORE_PATH) ?? '{}');
      for (const id of Object.keys(preserved)) preserved[id] = scheduled.data.occurrencesById[id];
      const updated = send({
        type: 'definition_update',
        actorParticipantId: 'maya',
        definition: {
          ...definition,
          assignment: { ...definition.assignment, ...change },
        },
      });
      expect(updated.occurrencesById).toEqual(preserved);
      expect(
        updated.outbox.filter((item: { occurrenceId?: string }) => item.occurrenceId === staleId)
      ).toEqual([expect.objectContaining({ status: 'delivered' })]);
      const result = send({
        type: 'materialize_occurrences',
        rangeStart: '2026-10-04T00:00:00.000Z',
        rangeEnd: '2026-10-07T00:00:00.000Z',
      });
      expect(result.occurrencesById).toMatchObject(preserved);
      const future = Object.entries(result.occurrencesById).filter(([id]) => !preserved[id]);
      expect(future).toHaveLength(2);
      expect(
        new Set(future.map(([, occurrence]) => (occurrence as { scheduledAt: string }).scheduledAt))
          .size
      ).toBe(2);
    }
  );

  it('adds an everyone participant for a past time without duplicating existing work', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T08:00:00.000Z'));
    choreStore.setChoreStoreFsForTests(createMockFs());
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
    let revision = 0;
    const send = (action: Record<string, unknown>) => {
      let request = createActionRequest(`command-${revision}`, revision, action);
      choreStore.handle(request);
      if (request.return.mock.calls.at(-1)?.[0] === 412) {
        revision = parseResponse(request).revision;
        request = createActionRequest(`command-${revision}`, revision, action);
        choreStore.handle(request);
      }
      expect(request.return).toHaveBeenCalledWith(200, expect.any(String));
      const result = parseResponse(request);
      revision = result.revision;
      return result.data;
    };
    send({ type: 'participant_create', participant: managerParticipant() });
    send({
      type: 'participant_create',
      actorParticipantId: 'maya',
      participant: managerParticipant('sofia'),
    });
    const definition = {
      ...seededData('fixture').definitionsById.dishes,
      assignment: { mode: 'everyone', participantIds: ['maya'] },
    };
    send({ type: 'definition_create', actorParticipantId: 'maya', definition });
    const materialize = {
      type: 'materialize_occurrences',
      rangeStart: '2026-08-10T00:00:00.000Z',
      rangeEnd: '2026-08-11T00:00:00.000Z',
    };
    const first = send(materialize);
    const existing = Object.values(first.occurrencesById)[0] as { id: string };
    vi.setSystemTime(new Date('2026-08-11T08:00:00.000Z'));
    send({
      type: 'definition_update',
      actorParticipantId: 'maya',
      definition: {
        ...definition,
        assignment: { mode: 'everyone', participantIds: ['maya', 'sofia'] },
      },
    });
    const updated = send(materialize);
    expect(updated.occurrencesById[existing.id]).toEqual(first.occurrencesById[existing.id]);
    expect(
      Object.values(updated.occurrencesById)
        .map((item) => (item as { assignmentSlot: string }).assignmentSlot)
        .sort()
    ).toEqual(['maya', 'sofia']);
    expect(send(materialize).occurrencesById).toEqual(updated.occurrencesById);
  });

  it('reports runtime capabilities without enabling browser background work in standalone mode', () => {
    choreStore.setChoreStoreFsForTests(createMockFs());
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);

    const standalone = createRequest({ uri: '/__navet_chores__/capabilities' });
    choreStore.handle(standalone);
    expect(parseResponse(standalone)).toMatchObject({
      contractVersion: 1,
      schemaVersion: 2,
      authority: 'standalone',
      backgroundScheduling: false,
      backgroundNotifications: false,
    });

    const ingress = createRequest({ uri: '/__navet_chores__/capabilities' });
    choreStore.handleIngress(ingress);
    expect(parseResponse(ingress)).toMatchObject({
      authority: 'navet_addon',
      backgroundScheduling: true,
      backgroundNotifications: true,
    });
  });

  it('periodically materializes and delivers reminders without losing concurrent UI writes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T08:00:00.000Z'));
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
    choreStore.handle(
      createActionRequest('periodic-manager', 0, {
        type: 'participant_create',
        participant: {
          ...managerParticipant(),
          reminderPreferences: {
            enabled: true,
            destination: { type: 'home_assistant', target: 'mobile_app_phone' },
          },
        },
      })
    );
    const definition = seededData('periodic').definitionsById.dishes;
    choreStore.handle(
      createActionRequest('periodic-definition', 1, {
        type: 'definition_create',
        actorParticipantId: 'maya',
        definition: {
          ...definition,
          reminderPolicy: { enabled: true, beforeDueMinutes: [], atDue: true },
        },
      })
    );

    await choreStore.runPeriodic({});
    expect(JSON.parse(mockFs.getFile(CHORE_PATH) ?? '{}').data.occurrencesById).toHaveProperty(
      OCCURRENCE_ID
    );

    vi.setSystemTime(new Date('2026-08-10T12:00:00.000Z'));
    process.env.SUPERVISOR_TOKEN = 'supervisor-token';
    const fetchMock = vi.fn(async () => {
      const current = JSON.parse(mockFs.getFile(CHORE_PATH) ?? '{}');
      choreStore.handle(
        createActionRequest('concurrent-sofia', current.revision, {
          type: 'participant_create',
          actorParticipantId: 'maya',
          participant: managerParticipant('sofia'),
        })
      );
      return { ok: true, status: 200 };
    });
    vi.stubGlobal('ngx', { fetch: fetchMock });

    await choreStore.runPeriodic({});

    const stored = JSON.parse(mockFs.getFile(CHORE_PATH) ?? '{}');
    expect(stored.data.participantsById).toHaveProperty('sofia');
    expect(
      stored.data.outbox.find((item: { eventType: string }) => item.eventType === 'reminder_due')
    ).toMatchObject({ status: 'delivered', attempts: 1 });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://supervisor/core/api/services/notify/mobile_app_phone',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('resolves daylight-saving offsets without unavailable packaged APIs', () => {
    expect(
      choreStore.getNjsTimeZoneOffsetMinutesForTests(
        Date.parse('2026-08-01T12:00:00.000Z'),
        'Europe/Stockholm'
      )
    ).toBe(120);
    expect(
      choreStore.getNjsTimeZoneOffsetMinutesForTests(
        Date.parse('2026-01-01T12:00:00.000Z'),
        'Europe/Stockholm'
      )
    ).toBe(60);
    expect(
      choreStore.getNjsTimeZoneOffsetMinutesForTests(
        Date.parse('2026-07-01T12:00:00.000Z'),
        'America/New_York'
      )
    ).toBe(-240);
    expect(() =>
      choreStore.getNjsTimeZoneOffsetMinutesForTests(
        Date.parse('2026-08-01T12:00:00.000Z'),
        'Atlantic/Unsupported'
      )
    ).toThrow(/Unsupported chore time zone/);
  });

  it('requires authentication and only trusts ingress in its explicit handler', () => {
    choreStore.setChoreStoreFsForTests(createMockFs());
    choreStore.setChoreStorePrincipalResolverForTests((_request, options) =>
      options.trustIngressHeaders ? PRINCIPAL : null
    );

    const normal = createRequest();
    choreStore.handle(normal);
    expect(normal.return).toHaveBeenCalledWith(
      401,
      JSON.stringify({ error: 'Authentication required' })
    );

    const ingress = createRequest();
    choreStore.handleIngress(ingress);
    expect(ingress.return).toHaveBeenCalledWith(200, expect.any(String));
  });

  it('commits once, rejects stale writes, and makes retries idempotent', () => {
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);

    const commandId = 'command-1';
    const first = createActionRequest(commandId, 0, {
      type: 'participant_create',
      participant: managerParticipant(),
    });
    choreStore.handle(first);
    expect(first.return).toHaveBeenCalledWith(200, expect.any(String));
    expect(parseResponse(first).revision).toBe(1);
    expect(mockFs.getFile(WORKSPACE_PATH)).toBeDefined();
    expect(mockFs.getFile(CHORE_PATH)).toBeDefined();
    expect(mockFs.getFile(JOURNAL_PATH)).toBeDefined();
    expect(mockFs.getFile(EVENT_HISTORY_PATH)).toBeDefined();

    const stale = createActionRequest('command-2', 0, {
      type: 'participant_create',
      participant: managerParticipant('sofia'),
    });
    choreStore.handle(stale);
    expect(stale.return).toHaveBeenCalledWith(412, expect.any(String));

    const retry = createRequest({
      method: 'POST',
      uri: '/__navet_chores__/commands',
      headersIn: { 'X-Navet-Base-Revision': '0' },
      requestText: first.requestText,
    });
    choreStore.handle(retry);
    expect(retry.return).toHaveBeenCalledWith(200, expect.any(String));
    expect(parseResponse(retry).revision).toBe(1);

    const history = createRequest({ uri: '/__navet_chores__/history' });
    choreStore.handle(history);
    expect(history.return).toHaveBeenCalledWith(200, expect.any(String));
    expect(parseResponse(history).events).toEqual([
      expect.objectContaining({ commandId, type: 'participant_created' }),
    ]);
  });

  it('rebuilds damaged sidecars and restores the last healthy workspace', () => {
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);

    const first = createActionRequest('first-person', 0, {
      type: 'participant_create',
      participant: managerParticipant(),
    });
    choreStore.handle(first);
    mockFs.writeFileSync(EVENT_HISTORY_PATH, '{');

    const second = createActionRequest('second-person', 1, {
      type: 'participant_create',
      actorParticipantId: 'maya',
      participant: {
        ...managerParticipant('sofia'),
        capabilities: ['complete'],
      },
    });
    choreStore.handle(second);
    expect(second.return).toHaveBeenCalledWith(200, expect.any(String));
    expect(mockFs.getFile(CHORE_LAST_GOOD_PATH)).toBeDefined();

    mockFs.writeFileSync(CHORE_PATH, '{');
    const loaded = createRequest();
    choreStore.handle(loaded);

    expect(loaded.return).toHaveBeenCalledWith(200, expect.any(String));
    expect(parseResponse(loaded)).toMatchObject({
      revision: 2,
      data: { participantsById: { maya: { displayName: 'Maya' } } },
    });
    expect(parseResponse(loaded).data.participantsById).not.toHaveProperty('sofia');
  });

  it('returns recovery details and can start over from an unreadable workspace', () => {
    const mockFs = createMockFs();
    mockFs.writeFileSync(CHORE_PATH, '{');
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);

    const unavailable = createRequest();
    choreStore.handle(unavailable);
    expect(unavailable.return).toHaveBeenCalledWith(503, expect.any(String));
    expect(parseResponse(unavailable)).toMatchObject({
      recovery: { backupAvailable: false, pinConfigured: false, reason: 'workspace_invalid' },
    });

    const recovered = createRequest({
      method: 'POST',
      uri: '/__navet_chores__/recovery',
      requestText: JSON.stringify({ action: 'reset', confirmation: 'RESET CHORES' }),
    });
    choreStore.handle(recovered);
    expect(recovered.return).toHaveBeenCalledWith(200, expect.any(String));
    expect(parseResponse(recovered)).toMatchObject({
      revision: 0,
      data: { participantsById: {}, definitionsById: {} },
    });
  });

  it('rejects cross-origin mutations before changing workspace data', () => {
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
    const request = createRequest({
      method: 'POST',
      uri: '/__navet_chores__/commands',
      headersIn: {
        Origin: 'https://attacker.example',
        'X-Navet-Base-Revision': '0',
      },
      requestText: JSON.stringify({
        commandId: 'command-1',
        baseRevision: 0,
        action: {
          type: 'participant_create',
          participant: managerParticipant(),
        },
      }),
    });

    choreStore.handle(request);
    expect(request.return).toHaveBeenCalledWith(403, expect.any(String));
    expect(mockFs.getFile(CHORE_PATH)).toBeUndefined();
  });

  it('applies occurrence actions against authoritative stored state', () => {
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);

    seedOccurrenceWorkspace();

    const experience = createActionRequest('experience', 3, {
      type: 'experience_update',
      actorParticipantId: 'maya',
      experience: {
        ...createChoreExperienceState(),
        gamificationMode: 'light',
        presentationByDefinitionId: { dishes: { points: 15 } },
        missionsById: {},
        rewardGoalsById: {},
        earnedPointsByParticipant: {},
        householdBonusPoints: 0,
        awardedMissionIds: [],
      },
    });
    choreStore.handle(experience);

    const actionBody = JSON.stringify({
      commandId: 'complete',
      baseRevision: 4,
      action: {
        type: 'occurrence_action',
        occurrenceId: OCCURRENCE_ID,
        action: { type: 'complete', participantId: 'maya' },
      },
    });
    const complete = createRequest({
      method: 'POST',
      uri: '/__navet_chores__/commands',
      headersIn: { 'X-Navet-Base-Revision': '4' },
      requestText: actionBody,
    });
    choreStore.handle(complete);

    const completedDocument = parseResponse(complete);
    expect(complete.return).toHaveBeenCalledWith(200, expect.any(String));
    expect(completedDocument.revision).toBe(5);
    expect(completedDocument.data.occurrencesById[OCCURRENCE_ID]).toMatchObject({
      status: 'done',
      completedBy: 'maya',
    });
    expect(completedDocument.data.activity.at(-1)).toMatchObject({
      commandId: 'complete',
      type: 'completed',
      actorParticipantId: 'maya',
      participantId: 'maya',
      pointsDelta: 15,
    });
    expect(completedDocument.data.experience.earnedPointsByParticipant).toEqual({ maya: 15 });
    expect(completedDocument.data.outbox.at(-1)).toMatchObject({
      activityId: 'activity:complete',
      eventType: 'completed',
      status: 'pending',
    });

    const retry = createRequest({
      method: 'POST',
      uri: '/__navet_chores__/commands',
      headersIn: { 'X-Navet-Base-Revision': '4' },
      requestText: actionBody,
    });
    choreStore.handle(retry);
    expect(parseResponse(retry).revision).toBe(5);

    const reopen = createActionRequest('reopen', 5, {
      type: 'occurrence_action',
      occurrenceId: OCCURRENCE_ID,
      action: { type: 'reopen', participantId: 'maya', reason: 'Redo' },
    });
    choreStore.handle(reopen);
    expect(parseResponse(reopen).data.activity.at(-1)).toMatchObject({
      type: 'reopened',
      participantId: 'maya',
      pointsDelta: -15,
    });
    expect(parseResponse(reopen).data.experience.earnedPointsByParticipant).toEqual({ maya: 0 });
  });

  it('records a missed occurrence as completed late', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T08:00:00.000Z'));
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
    seedOccurrenceWorkspace();

    const stored = JSON.parse(mockFs.getFile(CHORE_PATH) ?? '{}');
    stored.data.definitionsById.dishes.claimPolicy = { required: true };
    stored.data.occurrencesById[OCCURRENCE_ID] = {
      ...stored.data.occurrencesById[OCCURRENCE_ID],
      status: 'missed',
      missedAt: '2026-08-10T13:00:00.000Z',
    };
    mockFs.writeFileSync(CHORE_PATH, JSON.stringify(stored));

    const complete = createActionRequest('complete-missed', 3, {
      type: 'occurrence_action',
      occurrenceId: OCCURRENCE_ID,
      action: { type: 'complete', participantId: 'maya' },
    });
    choreStore.handle(complete);

    expect(complete.return).toHaveBeenCalledWith(200, expect.any(String));
    const document = parseResponse(complete);
    expect(document.data.occurrencesById[OCCURRENCE_ID]).toMatchObject({
      status: 'done',
      completedBy: 'maya',
      completedAt: '2026-08-11T08:00:00.000Z',
    });
    expect(document.data.occurrencesById[OCCURRENCE_ID].missedAt).toBeUndefined();
    expect(document.data.activity.at(-1)).toMatchObject({
      commandId: 'complete-missed',
      type: 'completed',
    });
  });

  it('serves definitions, filtered occurrences, and cursor-based lifecycle events', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T13:00:00.000Z'));
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
    seedOccurrenceWorkspace();

    const definitions = createRequest({ uri: '/__navet_chores__/definitions' });
    choreStore.handle(definitions);
    expect(parseResponse(definitions)).toMatchObject({
      contractVersion: 1,
      revision: 3,
      definitions: [{ id: 'dishes', title: 'Empty dishes' }],
    });

    const occurrences = createRequest({
      uri: '/__navet_chores__/occurrences',
      args: 'participantId=maya&definitionId=dishes',
    });
    choreStore.handle(occurrences);
    expect(parseResponse(occurrences).occurrences).toEqual([
      expect.objectContaining({ id: OCCURRENCE_ID, status: 'available' }),
    ]);

    const firstEvents = createRequest({
      uri: '/__navet_chores__/events',
      args: 'after=0&limit=2',
    });
    choreStore.handle(firstEvents);
    expect(parseResponse(firstEvents)).toMatchObject({
      contractVersion: 1,
      cursor: '4',
      hasMore: true,
      events: [
        expect.objectContaining({ type: 'occurrence_created' }),
        expect.objectContaining({ type: 'due' }),
      ],
    });

    const nextEvents = createRequest({
      uri: '/__navet_chores__/events',
      args: `after=${parseResponse(firstEvents).cursor}`,
    });
    choreStore.handle(nextEvents);
    expect(parseResponse(nextEvents).events.map((event: { type: string }) => event.type)).toEqual([
      'overdue',
    ]);

    const backup = createRequest({ uri: '/__navet_chores__/backup' });
    choreStore.handle(backup);
    expect(parseResponse(backup)).toMatchObject({
      contract: 'navet.chores',
      version: 1,
      workspace: { schemaVersion: 2 },
    });
    expect(parseResponse(backup).events).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'participant_created' })])
    );

    const reset = createRequest({
      method: 'POST',
      uri: '/__navet_chores__/reset',
      headersIn: { 'X-Navet-Base-Revision': '3' },
      requestText: JSON.stringify({
        commandId: 'reset-all',
        baseRevision: 3,
        actorParticipantId: 'maya',
        confirmation: 'DELETE ALL CHORES',
      }),
    });
    choreStore.handle(reset);
    expect(parseResponse(reset)).toMatchObject({
      revision: 4,
      data: {
        participantsById: {},
        definitionsById: {},
        occurrencesById: {},
        activity: [],
        outbox: [],
      },
    });
    expect(mockFs.getFile('/data/navet-chore-workspace.last-good.json')).toBeUndefined();
    expect(mockFs.getFile('/data/navet-chore-command-journal.json')).toBeUndefined();
    expect(mockFs.getFile('/data/navet-chore-events.json')).toBeUndefined();

    const restore = createRequest({
      method: 'POST',
      uri: '/__navet_chores__/restore',
      headersIn: { 'X-Navet-Base-Revision': '4' },
      requestText: JSON.stringify({
        commandId: 'restore-all',
        baseRevision: 4,
        actorParticipantId: 'maya',
        mode: 'replace',
        document: parseResponse(backup),
      }),
    });
    choreStore.handle(restore);
    expect(parseResponse(restore)).toMatchObject({
      revision: 5,
      data: { participantsById: { maya: { displayName: 'Maya' } } },
    });

    const alias = createRequest({
      method: 'POST',
      uri: '/__navet_chores__/actions',
      headersIn: { 'X-Navet-Base-Revision': '5' },
      requestText: JSON.stringify({
        commandId: 'complete-through-alias',
        baseRevision: 5,
        action: {
          type: 'occurrence_action',
          occurrenceId: OCCURRENCE_ID,
          action: { type: 'complete', participantId: 'maya' },
        },
      }),
    });
    choreStore.handle(alias);
    expect(parseResponse(alias).data.occurrencesById[OCCURRENCE_ID]).toMatchObject({
      status: 'done',
    });
  });

  it('permanently deletes a chore and its generated data', () => {
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
    seedOccurrenceWorkspace();

    const remove = createActionRequest('delete-definition', 3, {
      type: 'definition_delete',
      actorParticipantId: 'maya',
      definitionId: 'dishes',
    });
    choreStore.handle(remove);

    expect(remove.return).toHaveBeenCalledWith(200, expect.any(String));
    expect(parseResponse(remove)).toMatchObject({
      revision: 4,
      data: {
        definitionsById: {},
        occurrencesById: {},
      },
    });
    expect(parseResponse(remove).data.activity.at(-1)).toMatchObject({
      type: 'definition_deleted',
      definitionId: 'dishes',
    });
  });

  it('rejects invalid occurrence actions without changing the workspace', () => {
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);

    seedOccurrenceWorkspace();

    const invalid = createRequest({
      method: 'POST',
      uri: '/__navet_chores__/commands',
      headersIn: { 'X-Navet-Base-Revision': '3' },
      requestText: JSON.stringify({
        commandId: 'bad-complete',
        baseRevision: 3,
        action: {
          type: 'occurrence_action',
          occurrenceId: 'missing',
          action: { type: 'complete', participantId: 'maya' },
        },
      }),
    });
    choreStore.handle(invalid);

    expect(invalid.return).toHaveBeenCalledWith(
      409,
      JSON.stringify({ error: 'Chore occurrence is no longer available' })
    );
    expect(JSON.parse(mockFs.getFile(CHORE_PATH) ?? '{}').revision).toBe(3);
  });

  it('applies audited manager reassignment and rejects reasonless overrides', () => {
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);

    seedOccurrenceWorkspace();
    const addSofia = createActionRequest('add-sofia', 3, {
      type: 'participant_create',
      actorParticipantId: 'maya',
      participant: managerParticipant('sofia'),
    });
    choreStore.handle(addSofia);

    const reasonless = createActionRequest('skip-without-reason', 4, {
      type: 'occurrence_action',
      occurrenceId: OCCURRENCE_ID,
      action: { type: 'skip', participantId: 'maya' },
    });
    choreStore.handle(reasonless);
    expect(reasonless.return).toHaveBeenCalledWith(400, expect.any(String));

    const reassign = createActionRequest('reassign', 4, {
      type: 'occurrence_action',
      occurrenceId: OCCURRENCE_ID,
      action: {
        type: 'reassign',
        participantId: 'maya',
        assigneeIds: ['sofia'],
        reason: 'Maya is away',
      },
    });
    choreStore.handle(reassign);

    expect(parseResponse(reassign).data.occurrencesById[OCCURRENCE_ID]).toMatchObject({
      assigneeIds: ['sofia'],
      assignmentSlot: 'manager:sofia',
      status: 'available',
    });
    expect(parseResponse(reassign).data.activity.at(-1)).toMatchObject({
      type: 'reassigned',
      reason: 'Maya is away',
      previousAssigneeIds: ['maya'],
      assigneeIds: ['sofia'],
    });
  });

  it('runs missed-work policies from durable state when the workspace is read', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T13:00:00.000Z'));
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
    seedOccurrenceWorkspace();

    const stored = JSON.parse(mockFs.getFile(CHORE_PATH) ?? '{}');
    stored.data.definitionsById.dishes.missedPolicy = {
      graceMinutes: 30,
      action: 'carry_forward',
      carryForwardDays: 1,
    };
    mockFs.writeFileSync(CHORE_PATH, JSON.stringify(stored));

    const read = createRequest();
    choreStore.handle(read);
    const document = parseResponse(read);

    expect(document.revision).toBe(4);
    expect(document.data.occurrencesById[OCCURRENCE_ID]).toMatchObject({
      status: 'missed',
      missedAt: '2026-08-11T13:00:00.000Z',
    });
    const occurrences = Object.values(document.data.occurrencesById) as Array<{
      carriedForwardFrom?: string;
      status: string;
    }>;
    const outbox = document.data.outbox as Array<{ eventType: string }>;
    expect(
      occurrences.find((occurrence) => occurrence.carriedForwardFrom === OCCURRENCE_ID)
    ).toMatchObject({ status: 'available' });
    expect(outbox.slice(-2).map((item) => item.eventType)).toEqual([
      'missed',
      'occurrence_created',
    ]);
  });

  it('materializes advanced schedules inside the storage authority', () => {
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
    choreStore.handle(
      createActionRequest('manager', 0, {
        type: 'participant_create',
        participant: managerParticipant(),
      })
    );
    choreStore.handle(
      createActionRequest('advanced-definition', 1, {
        type: 'definition_create',
        actorParticipantId: 'maya',
        definition: {
          id: 'advanced',
          title: 'Advanced schedule',
          enabled: true,
          assignment: { mode: 'person', participantIds: ['maya'] },
          schedule: {
            frequency: 'daily',
            startDate: '2026-08-01',
            endDate: '2026-08-05',
            excludedDates: ['2026-08-03'],
            intervalDays: 2,
            time: '09:00',
            times: ['09:00', '18:00'],
            timeZone: 'Europe/Stockholm',
          },
          dueWindowMinutes: 60,
          approval: { required: false, approverIds: [] },
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      })
    );
    const materialize = createActionRequest('advanced-materialize', 2, {
      type: 'materialize_occurrences',
      rangeStart: '2026-08-01T00:00:00.000Z',
      rangeEnd: '2026-08-06T00:00:00.000Z',
    });
    choreStore.handle(materialize);

    const scheduled = Object.values(parseResponse(materialize).data.occurrencesById) as Array<{
      scheduledAt: string;
    }>;
    expect(scheduled.map((occurrence) => occurrence.scheduledAt)).toEqual([
      '2026-08-01T07:00:00.000Z',
      '2026-08-01T16:00:00.000Z',
      '2026-08-05T07:00:00.000Z',
      '2026-08-05T16:00:00.000Z',
    ]);
  });

  it('migrates a persisted schema version 1 workspace before serving it', () => {
    const mockFs = createMockFs();
    mockFs.writeFileSync(
      CHORE_PATH,
      JSON.stringify({
        contractVersion: 1,
        revision: 4,
        updatedAt: '2026-08-10T08:00:00.000Z',
        data: {
          schemaVersion: 1,
          participantsById: {},
          definitionsById: {},
          occurrencesById: {},
          activity: [],
        },
      })
    );
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);

    const request = createRequest();
    choreStore.handle(request);

    expect(request.return).toHaveBeenCalledWith(200, expect.any(String));
    expect(parseResponse(request)).toMatchObject({
      revision: 5,
      data: { schemaVersion: 2, outbox: [] },
    });
  });

  it('creates profiles and definitions through authoritative manager actions', () => {
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
    const source = seededData('unused');
    const manager = {
      ...source.participantsById.maya,
      capabilities: ['complete', 'approve', 'manage'],
    };

    const createManager = createRequest({
      method: 'POST',
      uri: '/__navet_chores__/commands',
      headersIn: { 'X-Navet-Base-Revision': '0' },
      requestText: JSON.stringify({
        commandId: 'create-manager',
        baseRevision: 0,
        action: { type: 'participant_create', participant: manager },
      }),
    });
    choreStore.handle(createManager);
    expect(createManager.return).toHaveBeenCalledWith(200, expect.any(String));

    const createDefinition = createRequest({
      method: 'POST',
      uri: '/__navet_chores__/commands',
      headersIn: { 'X-Navet-Base-Revision': '1' },
      requestText: JSON.stringify({
        commandId: 'create-definition',
        baseRevision: 1,
        action: {
          type: 'definition_create',
          actorParticipantId: 'maya',
          definition: source.definitionsById.dishes,
        },
      }),
    });
    choreStore.handle(createDefinition);

    expect(createDefinition.return).toHaveBeenCalledWith(200, expect.any(String));
    expect(parseResponse(createDefinition)).toMatchObject({
      revision: 2,
      data: {
        definitionsById: { dishes: { title: 'Empty dishes' } },
      },
    });
    expect(parseResponse(createDefinition).data.outbox).toHaveLength(2);
  });

  it('persists chores setup progress in the installation-owned experience state', () => {
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
    const source = seededData('setup-definition');
    choreStore.handle(
      createActionRequest('setup-manager', 0, {
        type: 'participant_create',
        participant: managerParticipant(),
      })
    );
    choreStore.handle(
      createActionRequest('setup-definition', 1, {
        type: 'definition_create',
        actorParticipantId: 'maya',
        definition: source.definitionsById.dishes,
      })
    );

    const setupProgress = createActionRequest('setup-progress', 2, {
      type: 'experience_update',
      actorParticipantId: 'maya',
      experience: {
        ...createChoreExperienceState(),
        setupStartedAt: '2026-08-15T08:00:00.000Z',
        setupCompletedAt: '2026-08-15T08:10:00.000Z',
        gamificationMode: 'off',
        presentationByDefinitionId: { dishes: { color: '#2563eb' } },
        missionsById: {},
        rewardGoalsById: {},
        earnedPointsByParticipant: {},
        householdBonusPoints: 0,
        awardedMissionIds: [],
      },
    });
    choreStore.handle(setupProgress);

    expect(setupProgress.return).toHaveBeenCalledWith(200, expect.any(String));
    expect(parseResponse(setupProgress).data.experience).toMatchObject({
      setupStartedAt: '2026-08-15T08:00:00.000Z',
      setupCompletedAt: '2026-08-15T08:10:00.000Z',
      presentationByDefinitionId: { dishes: { color: '#2563eb' } },
    });
  });

  it('keeps reward request, approval, refund, and replay accounting durable', () => {
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
    const created = createActionRequest('create-manager', 0, {
      type: 'participant_create',
      participant: managerParticipant(),
    });
    choreStore.handle(created);
    const experience = createChoreExperienceState();
    experience.gamificationMode = 'family';
    experience.rewardGoalsById.movie = {
      id: 'movie',
      title: 'Movie',
      type: 'instant',
      targetPoints: 40,
      enabled: true,
      createdAt: '2026-08-10T08:00:00.000Z',
      updatedAt: '2026-08-10T08:00:00.000Z',
    };
    const setup = createActionRequest('setup', 1, {
      type: 'experience_update',
      actorParticipantId: 'maya',
      experience,
    });
    choreStore.handle(setup);
    expect(setup.return).toHaveBeenCalledWith(200, expect.any(String));
    const points = createActionRequest('points', 2, {
      type: 'experience_points_adjust',
      actorParticipantId: 'maya',
      participantId: 'maya',
      pointsDelta: 100,
    });
    choreStore.handle(points);
    expect(points.return).toHaveBeenCalledWith(200, expect.any(String));
    const request = createActionRequest('request', 3, {
      type: 'reward_request',
      requestId: 'r1',
      rewardId: 'movie',
      participantId: 'maya',
    });
    choreStore.handle(request);
    expect(parseResponse(request).data.experience.earnedPointsByParticipant.maya).toBe(100);
    const approve = createActionRequest('approve', 4, {
      type: 'reward_decision',
      requestId: 'r1',
      actorParticipantId: 'maya',
      decision: 'approve',
    });
    choreStore.handle(approve);
    expect(parseResponse(approve).data.experience.earnedPointsByParticipant.maya).toBe(60);
    const replay = createActionRequest('approve', 5, {
      type: 'reward_decision',
      requestId: 'r1',
      actorParticipantId: 'maya',
      decision: 'approve',
    });
    choreStore.handle(replay);
    expect(parseResponse(replay).data.experience.pointTransactions).toHaveLength(2);
    const refund = createActionRequest('refund', 5, {
      type: 'reward_decision',
      requestId: 'r1',
      actorParticipantId: 'maya',
      decision: 'refund',
    });
    choreStore.handle(refund);
    expect(parseResponse(refund).data.experience.earnedPointsByParticipant.maya).toBe(100);
  });

  it('persists signed point adjustments and their immutable audit details', () => {
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
    choreStore.handle(
      createActionRequest('points-manager', 0, {
        type: 'participant_create',
        participant: managerParticipant(),
      })
    );
    const adjustment = createActionRequest('points-adjustment', 1, {
      type: 'experience_points_adjust',
      actorParticipantId: 'maya',
      participantId: 'maya',
      pointsDelta: -25,
      reason: 'Replacement cost',
    });
    choreStore.handle(adjustment);

    expect(adjustment.return).toHaveBeenCalledWith(200, expect.any(String));
    expect(parseResponse(adjustment).data.experience.earnedPointsByParticipant).toEqual({
      maya: -25,
    });
    expect(parseResponse(adjustment).data.activity.at(-1)).toMatchObject({
      type: 'points_adjusted',
      participantId: 'maya',
      actorParticipantId: 'maya',
      pointsDelta: -25,
      reason: 'Replacement cost',
    });
    expect(parseResponse(adjustment).data.outbox).toHaveLength(1);

    const retry = createActionRequest('points-adjustment', 1, {
      type: 'experience_points_adjust',
      actorParticipantId: 'maya',
      participantId: 'maya',
      pointsDelta: -25,
      reason: 'Replacement cost',
    });
    choreStore.handle(retry);
    expect(parseResponse(retry).data.experience.earnedPointsByParticipant).toEqual({ maya: -25 });
  });

  it('requires a verified management PIN for point adjustments', () => {
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
    choreStore.handle(
      createActionRequest('setup-manager', 0, {
        type: 'participant_create',
        participant: managerParticipant(),
      })
    );

    const configure = createRequest({
      method: 'POST',
      uri: '/__navet_chores__/management/pin',
      requestText: JSON.stringify({ actorParticipantId: 'maya', pin: '2468' }),
    });
    choreStore.handle(configure);
    expect(configure.return).toHaveBeenCalledWith(200, expect.any(String));
    const sessionToken = parseResponse(configure).sessionToken;
    expect(sessionToken).toEqual(expect.any(String));

    const blocked = createActionRequest('blocked-adjustment', 1, {
      type: 'experience_points_adjust',
      actorParticipantId: 'maya',
      participantId: 'maya',
      pointsDelta: 20,
      reason: 'Bonus',
    });
    choreStore.handle(blocked);
    expect(blocked.return).toHaveBeenCalledWith(
      403,
      JSON.stringify({ error: 'Unlock chore management to continue' })
    );

    const unlocked = createRequest({
      method: 'POST',
      uri: '/__navet_chores__/commands',
      headersIn: {
        'X-Navet-Base-Revision': '1',
        'X-Navet-Chore-Management-Session': sessionToken,
      },
      requestText: JSON.stringify({
        commandId: 'unlocked-adjustment',
        baseRevision: 1,
        action: {
          type: 'experience_points_adjust',
          actorParticipantId: 'maya',
          participantId: 'maya',
          pointsDelta: 20,
        },
      }),
    });
    choreStore.handle(unlocked);
    expect(unlocked.return).toHaveBeenCalledWith(200, expect.any(String));
    expect(parseResponse(unlocked).data.experience.earnedPointsByParticipant.maya).toBe(20);
    expect(parseResponse(unlocked).data.activity.at(-1)).not.toHaveProperty('reason');
  });

  it('changes the management PIN only for an unlocked manager session', () => {
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
    choreStore.handle(
      createActionRequest('setup-manager', 0, {
        type: 'participant_create',
        participant: managerParticipant(),
      })
    );

    const configure = createRequest({
      method: 'POST',
      uri: '/__navet_chores__/management/pin',
      requestText: JSON.stringify({ actorParticipantId: 'maya', pin: '2468' }),
    });
    choreStore.handle(configure);
    const sessionToken = parseResponse(configure).sessionToken;

    const blockedChange = createRequest({
      method: 'POST',
      uri: '/__navet_chores__/management/pin',
      requestText: JSON.stringify({ actorParticipantId: 'maya', pin: '1357' }),
    });
    choreStore.handle(blockedChange);
    expect(blockedChange.return).toHaveBeenCalledWith(
      403,
      JSON.stringify({ error: 'Unlock chore management before changing its PIN' })
    );

    const change = createRequest({
      method: 'POST',
      uri: '/__navet_chores__/management/pin',
      headersIn: { 'X-Navet-Chore-Management-Session': sessionToken },
      requestText: JSON.stringify({ actorParticipantId: 'maya', pin: '1357' }),
    });
    choreStore.handle(change);
    expect(change.return).toHaveBeenCalledWith(200, expect.any(String));

    const oldPin = createRequest({
      method: 'POST',
      uri: '/__navet_chores__/management/verify',
      requestText: JSON.stringify({ pin: '2468' }),
    });
    choreStore.handle(oldPin);
    expect(oldPin.return).toHaveBeenCalledWith(
      403,
      JSON.stringify({ error: 'The management PIN is incorrect' })
    );

    const newPin = createRequest({
      method: 'POST',
      uri: '/__navet_chores__/management/verify',
      requestText: JSON.stringify({ pin: '1357' }),
    });
    choreStore.handle(newPin);
    expect(newPin.return).toHaveBeenCalledWith(200, expect.any(String));
  });

  it.each(['home_assistant', 'homey', 'openhab'])(
    'preserves legacy chores and PIN after switching to %s',
    (providerId) => {
      const mockFs = createMockFs();
      choreStore.setChoreStoreFsForTests(mockFs);
      choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
      choreStore.handle(
        createActionRequest('setup-manager', 0, {
          type: 'participant_create',
          participant: managerParticipant(),
        })
      );
      choreStore.handle(
        createRequest({
          method: 'POST',
          uri: '/__navet_chores__/management/pin',
          requestText: JSON.stringify({ actorParticipantId: 'maya', pin: '2468' }),
        })
      );

      const workspace = JSON.parse(mockFs.getFile(WORKSPACE_PATH) ?? '{}');
      const pinPath = '/data/navet-chore-management.json';
      const originalPin = JSON.parse(mockFs.getFile(pinPath) ?? '{}');
      mockFs.writeFileSync(pinPath, JSON.stringify({ ...originalPin, tenantId: TENANT_ID }));
      mockFs.writeFileSync(
        WORKSPACE_PATH,
        JSON.stringify({
          ...workspace,
          tenantBinding: {
            providerId: 'home_assistant',
            tenantId: TENANT_ID,
            enrolledAt: '2026-09-09T18:00:00.000Z',
          },
        })
      );
      choreStore.setChoreStorePrincipalResolverForTests(() => ({
        ...PRINCIPAL,
        providerId,
        tenantId: REBOUND_TENANT_ID,
      }));

      const load = createRequest();
      choreStore.handle(load);

      expect(load.return).toHaveBeenCalledWith(200, expect.any(String));
      expect(parseResponse(load)).toMatchObject({
        data: { participantsById: { maya: { displayName: 'Maya' } } },
        management: { pinConfigured: true },
      });
      expect(JSON.parse(mockFs.getFile(pinPath) ?? '{}')).toMatchObject({
        salt: originalPin.salt,
        pinHash: originalPin.pinHash,
        tenantId: originalPin.tenantId,
      });
      expect(JSON.parse(mockFs.getFile(WORKSPACE_PATH) ?? '{}').tenantBinding.tenantId).toBe(
        TENANT_ID
      );

      const verify = createRequest({
        method: 'POST',
        uri: '/__navet_chores__/management/verify',
        requestText: JSON.stringify({ pin: '2468' }),
      });
      choreStore.handle(verify);
      expect(verify.return).toHaveBeenCalledWith(200, expect.any(String));
    }
  );

  it('removes management PIN protection only for an unlocked active manager', () => {
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
    choreStore.handle(
      createActionRequest('setup-manager', 0, {
        type: 'participant_create',
        participant: managerParticipant(),
      })
    );
    const configure = createRequest({
      method: 'POST',
      uri: '/__navet_chores__/management/pin',
      requestText: JSON.stringify({ actorParticipantId: 'maya', pin: '2468' }),
    });
    choreStore.handle(configure);
    const sessionToken = parseResponse(configure).sessionToken;

    const blockedRemoval = createRequest({
      method: 'DELETE',
      uri: '/__navet_chores__/management/pin',
      requestText: JSON.stringify({ actorParticipantId: 'maya' }),
    });
    choreStore.handle(blockedRemoval);
    expect(blockedRemoval.return).toHaveBeenCalledWith(
      403,
      JSON.stringify({ error: 'Unlock chore management before removing its PIN' })
    );

    const removal = createRequest({
      method: 'DELETE',
      uri: '/__navet_chores__/management/pin',
      headersIn: { 'X-Navet-Chore-Management-Session': sessionToken },
      requestText: JSON.stringify({ actorParticipantId: 'maya' }),
    });
    choreStore.handle(removal);
    expect(removal.return).toHaveBeenCalledWith(200, JSON.stringify({ pinConfigured: false }));

    const workspace = createRequest({ method: 'GET', uri: '/__navet_chores__/workspace' });
    choreStore.handle(workspace);
    expect(parseResponse(workspace).management).toEqual({ pinConfigured: false });
  });

  it('keeps a verified management session across isolated njs request contexts', () => {
    const mockFs = createMockFs();
    const sharedSessions = createMockSharedDict();
    vi.stubGlobal('ngx', {
      shared: { navet_chore_management_sessions: sharedSessions },
    });
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
    choreStore.handle(
      createActionRequest('setup-manager', 0, {
        type: 'participant_create',
        participant: managerParticipant(),
      })
    );

    const configure = createRequest({
      method: 'POST',
      uri: '/__navet_chores__/management/pin',
      requestText: JSON.stringify({ actorParticipantId: 'maya', pin: '2468' }),
    });
    choreStore.handle(configure);
    const sessionToken = parseResponse(configure).sessionToken;
    const workspaceKey = JSON.parse(
      mockFs.getFile('/data/navet-chore-management.json') ?? '{}'
    ).tenantId;
    expect(sharedSessions.set).toHaveBeenCalledWith(workspaceKey, sessionToken, 30 * 60 * 1000);

    // Production njs creates a fresh JavaScript VM for the next request.
    choreStore.resetChoreStoreForTests();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);

    const protectedCommand = createRequest({
      method: 'POST',
      uri: '/__navet_chores__/commands',
      headersIn: {
        'X-Navet-Base-Revision': '1',
        'X-Navet-Chore-Management-Session': sessionToken,
      },
      requestText: JSON.stringify({
        commandId: 'protected-profile',
        baseRevision: 1,
        action: {
          type: 'participant_create',
          actorParticipantId: 'maya',
          participant: managerParticipant('sofia'),
        },
      }),
    });
    choreStore.handle(protectedCommand);

    expect(protectedCommand.return).toHaveBeenCalledWith(200, expect.any(String));
    expect(parseResponse(protectedCommand).data.participantsById.sofia.displayName).toBe('Sofia');
  });
});

describe('shared occurrence transition conformance', () => {
  for (const vector of conformanceVectors.occurrenceTransitions) {
    it(vector.name, () => {
      const fixture = conformanceVectors.occurrenceFixture;
      const input = {
        definition: { ...fixture.definition, ...vector.definition },
        occurrence: { ...fixture.occurrence, ...vector.occurrence },
        command: vector.command,
        timestamp: fixture.timestamp,
        commandId: 'conformance',
      } as ApplyChoreCommandInput;
      if (vector.error) {
        expect(() => choreOccurrencePolicy.applyChoreOccurrenceCommand(input)).toThrow(
          vector.error
        );
      } else {
        const result = choreOccurrencePolicy.applyChoreOccurrenceCommand(input);
        expect(result.activity.type).toBe(vector.event);
        for (const [key, value] of Object.entries(vector.expected)) {
          expect((result.occurrence as unknown as Record<string, unknown>)[key] ?? null).toEqual(
            value
          );
        }
      }
    });
  }
});

describe('NJS outstanding after-completion intervals', () => {
  afterEach(() => {
    choreStore.resetChoreStoreForTests();
    vi.useRealTimers();
  });
  it('removes legacy future repeats once, preserving outstanding work and stopping browser rescheduling', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T10:00:00.000Z'));
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
    seedOccurrenceWorkspace();
    const document = JSON.parse(mockFs.getFile(CHORE_PATH) ?? '{}');
    document.data.definitionsById.dishes.schedule = {
      frequency: 'after_completion',
      startDate: '2026-08-10',
      time: '10:00',
      timeZone: 'UTC',
      intervalDays: 14,
    };
    const outstanding = document.data.occurrencesById[OCCURRENCE_ID];
    outstanding.status = 'missed';
    const staleId = 'dishes:2026-10-20T10:00:00.000Z:maya';
    document.data.occurrencesById[staleId] = {
      ...outstanding,
      id: staleId,
      status: 'available',
      scheduledAt: '2026-10-20T10:00:00.000Z',
      dueAt: '2026-10-20T11:00:00.000Z',
    };
    document.data.outbox = ['pending', 'delivered'].map((status) => ({
      id: `legacy-${status}`,
      activityId: 'legacy-reminder',
      eventType: 'reminder_due',
      occurrenceId: staleId,
      status,
      attempts: 0,
      createdAt: '2026-10-13T10:00:00.000Z',
      nextAttemptAt: '2026-10-13T10:00:00.000Z',
    }));
    mockFs.writeFileSync(CHORE_PATH, JSON.stringify(document));
    const now = new Date();
    const before = materializeChoreWorkspace(document.data, now);
    expect(before.changed).toBe(true);
    const request = createActionRequest('reconcile-legacy-repeats', document.revision, {
      type: 'materialize_occurrences',
      ...getChoreMaterializationRange(now),
    });
    choreStore.handle(request);
    expect(request.return).toHaveBeenCalledWith(200, expect.any(String));
    const saved = parseResponse(request);
    expect(saved.data.occurrencesById[staleId]).toBeUndefined();
    expect(saved.data.occurrencesById[OCCURRENCE_ID].status).toBe('missed');
    expect(
      saved.data.outbox.filter((item: { occurrenceId?: string }) => item.occurrenceId === staleId)
    ).toEqual([expect.objectContaining({ status: 'delivered' })]);
    expect(materializeChoreWorkspace(saved.data, now).changed).toBe(false);
    const complete = createActionRequest('complete-after-reconciliation', saved.revision, {
      type: 'occurrence_action',
      occurrenceId: OCCURRENCE_ID,
      action: { type: 'complete', participantId: 'maya' },
    });
    choreStore.handle(complete);
    expect(complete.return).toHaveBeenCalledWith(200, expect.any(String));
    expect(parseResponse(complete).data.occurrencesById[OCCURRENCE_ID].status).toBe('done');
  });
  it('persists completion of work older than 90 days and its next interval after reload', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-11T10:00:00.000Z'));
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
    seedOccurrenceWorkspace();
    const document = JSON.parse(mockFs.getFile(CHORE_PATH) ?? '{}');
    document.data.definitionsById.dishes.schedule = {
      frequency: 'after_completion',
      startDate: '2026-08-10',
      time: '10:00',
      timeZone: 'UTC',
      intervalDays: 14,
    };
    document.data.occurrencesById[OCCURRENCE_ID].status = 'missed';
    mockFs.writeFileSync(CHORE_PATH, JSON.stringify(document));
    const complete = createActionRequest('complete-old', document.revision, {
      type: 'occurrence_action',
      occurrenceId: OCCURRENCE_ID,
      action: { type: 'complete', participantId: 'maya' },
    });
    choreStore.handle(complete);
    expect(complete.return).toHaveBeenCalledWith(200, expect.any(String));
    const saved = parseResponse(complete);
    expect(saved.data.occurrencesById[OCCURRENCE_ID]).toMatchObject({
      status: 'done',
      completedAt: '2026-12-11T10:00:00.000Z',
    });
    expect(
      Object.values(saved.data.occurrencesById as Record<string, ChoreOccurrence>)
        .filter((item) => item.status === 'available')
        .map((item) => item.scheduledAt)
    ).toEqual(['2026-12-25T10:00:00.000Z']);
    choreStore.resetChoreStoreForTests();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
    const reload = createRequest();
    choreStore.handle(reload);
    expect(parseResponse(reload).data.occurrencesById).toEqual(saved.data.occurrencesById);
  });
  it('keeps everyone clocks independent and holds missed work outside the rolling window', () => {
    const source = seededData('everyone');
    const definition = {
      ...source.definitionsById.dishes,
      assignment: { mode: 'everyone', participantIds: ['maya', 'sofia'] },
      schedule: {
        frequency: 'after_completion',
        startDate: '2026-08-10',
        time: '10:00',
        timeZone: 'UTC',
        intervalDays: 14,
      },
    };
    const original = source.occurrencesById[OCCURRENCE_ID];
    const existing = {
      maya: { ...original, status: 'done', completedAt: '2026-12-11T10:00:00.000Z' },
      sofia: {
        ...original,
        id: 'old-sofia',
        assignmentSlot: 'sofia',
        assigneeIds: ['sofia'],
        status: 'missed',
      },
    };
    const result = choreStore.materializeDefinitionForTests(
      definition,
      { maya: managerParticipant(), sofia: managerParticipant('sofia') },
      '2026-09-12T00:00:00.000Z',
      '2027-01-25T00:00:00.000Z',
      existing,
      '2026-12-11T10:00:00.000Z',
      true
    );
    expect(result.map((item) => [item.assigneeIds, item.scheduledAt])).toEqual([
      [['maya'], '2026-12-25T10:00:00.000Z'],
      [['sofia'], '2026-08-10T10:00:00.000Z'],
    ]);
  });
});

describe('automatic chore storage upgrade', () => {
  afterEach(() => {
    choreStore.resetChoreStoreForTests();
    vi.useRealTimers();
  });
  function seedLegacy(schemaVersion = 2, longIntervals = false, staleInterval?: number) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T10:00:00.000Z'));
    const mockFs = createMockFs();
    choreStore.setChoreStoreFsForTests(mockFs);
    choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
    const { document, events } =
      staleInterval !== undefined
        ? loneStaleRepeatFixture(staleInterval)
        : longIntervals
          ? longIntervalRepairFixture()
          : continuousMaterializationFixture();
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    const legacyDocument =
      schemaVersion === 1
        ? { ...document, data: { ...document.data, schemaVersion: 1, outbox: undefined } }
        : document;
    const stored = durableStorage.encode(legacyDocument, 2 * 1024 * 1024, hash, (key, chunk) => {
      mockFs.writeFileSync(
        `${CHORE_PATH}.chunk-${key}`,
        JSON.stringify(durableStorage.unpack(chunk, hash))
      );
    });
    mockFs.writeFileSync(CHORE_PATH, JSON.stringify(durableStorage.unpack(stored, hash)));
    mockFs.writeFileSync(EVENT_HISTORY_PATH, JSON.stringify({ contractVersion: 1, events }));
    return { mockFs, document, events, hash };
  }

  it('deflates legacy records on load, preserves history/cursors and recovery, and repairs completion', () => {
    const { mockFs, document, events, hash } = seedLegacy();
    const orphanPath = `${CHORE_PATH}.chunk-${'f'.repeat(64)}`;
    mockFs.writeFileSync(orphanPath, 'obsolete');
    mockFs.writeFileSync(`${CHORE_PATH}.chunk-unrelated`, 'preserve');
    const bytes = () =>
      mockFs
        .listFiles()
        .reduce((sum, path) => sum + Buffer.byteLength(mockFs.getFile(path) ?? ''), 0);
    const beforeBytes = bytes();
    const read = createRequest();
    choreStore.handle(read);
    expect(read.return).toHaveBeenCalledWith(200, expect.any(String));
    const saved = parseResponse(read);
    const retained = Object.values(document.data.occurrencesById).filter(
      (item) => item.status !== 'available'
    );
    expect(Object.values(saved.data.occurrencesById)).toEqual(retained);
    expect(saved.data.participantsById).toEqual(document.data.participantsById);
    expect(saved.data.definitionsById).toEqual(document.data.definitionsById);
    expect(bytes()).toBeLessThan(beforeBytes * 0.3);
    expect(mockFs.getFile(orphanPath)).toBeUndefined();
    expect(mockFs.getFile(`${CHORE_PATH}.chunk-unrelated`)).toBe('preserve');
    const backupDocument = durableStorage.decode(
      JSON.parse(mockFs.getFile(CHORE_LAST_GOOD_PATH) ?? 'null'),
      hash,
      (key) => JSON.parse(mockFs.getFile(`${CHORE_PATH}.chunk-${key}`) ?? 'null')
    ) as { data: unknown };
    expect(backupDocument.data).toEqual(document.data);
    const history = createRequest({ uri: '/__navet_chores__/history' });
    choreStore.handle(history);
    expect(parseResponse(history).events).toEqual(events);
    const feed = createRequest({ uri: '/__navet_chores__/events', args: 'after=50&limit=1' });
    choreStore.handle(feed);
    expect(parseResponse(feed)).toMatchObject({ cursor: '101', events: [events[100]] });
    mockFs.writeFileSync.mockClear();
    const again = createRequest();
    choreStore.handle(again);
    expect(parseResponse(again).revision).toBe(saved.revision);
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    const outstanding = retained.find((item) => item.status === 'missed');
    if (!outstanding) throw new Error('Expected outstanding work in regression fixture');
    const complete = createActionRequest('complete-repaired-work', saved.revision, {
      type: 'occurrence_action',
      occurrenceId: outstanding.id,
      action: { type: 'complete', participantId: 'manager' },
    });
    choreStore.handle(complete);
    expect(complete.return).toHaveBeenCalledWith(200, expect.any(String));
    expect(parseResponse(complete).data.occurrencesById[outstanding.id].status).toBe('done');
  });

  // Keep: realistic oversized-history regression, including repair and fresh disk reads.
  it('hydrates history once per request and sees changes and corruption on the next request', () => {
    const { mockFs, events, hash } = seedLegacy();
    const open = vi.spyOn(mockFs, 'openSync');
    const read = createRequest();
    choreStore.handle(read);
    expect(read.return).toHaveBeenCalledWith(200, expect.any(String));
    expect(open.mock.calls.filter(([path]) => path === EVENT_HISTORY_PATH)).toHaveLength(1);

    const history = {
      contractVersion: 1,
      events: events.concat({
        id: 'activity:another-request',
        commandId: 'another-request',
        type: 'workspace_materialized',
        timestamp: '2026-10-13T10:00:00.000Z',
      }),
    };
    mockFs.writeFileSync(EVENT_HISTORY_PATH, JSON.stringify(durableStorage.pack(history, hash)));
    const changed = createRequest({ uri: '/__navet_chores__/history' });
    choreStore.handle(changed);
    expect(parseResponse(changed).events).toEqual(history.events);

    mockFs.writeFileSync(EVENT_HISTORY_PATH, '{broken');
    const repaired = createRequest();
    choreStore.handle(repaired);
    expect(repaired.return).toHaveBeenCalledWith(200, expect.any(String));
    const afterRepair = createRequest({ uri: '/__navet_chores__/history' });
    choreStore.handle(afterRepair);
    expect(parseResponse(afterRepair).events).toEqual(parseResponse(repaired).data.activity);
  });

  it('hydrates legacy history once during background repair and scheduling', async () => {
    const { mockFs, events } = seedLegacy();
    const open = vi.spyOn(mockFs, 'openSync');
    await choreStore.runPeriodic({});
    expect(open.mock.calls.filter(([path]) => path === EVENT_HISTORY_PATH)).toHaveLength(1);
    const history = createRequest({ uri: '/__navet_chores__/history' });
    choreStore.handle(history);
    expect(parseResponse(history).events.slice(0, events.length)).toEqual(events);
  });

  it('repairs supported schema-v1 data before recording maintenance as complete', () => {
    const { mockFs, document, events, hash } = seedLegacy(1);
    const read = createRequest();
    choreStore.handle(read);
    expect(read.return).toHaveBeenCalledWith(200, expect.any(String));
    const saved = parseResponse(read);
    expect(saved.data.schemaVersion).toBe(2);
    expect(Object.values(saved.data.occurrencesById)).toEqual(
      Object.values(document.data.occurrencesById).filter((item) => item.status !== 'available')
    );
    const persisted = durableStorage.decode(
      JSON.parse(mockFs.getFile(CHORE_PATH) ?? 'null'),
      hash,
      (key) => JSON.parse(mockFs.getFile(`${CHORE_PATH}.chunk-${key}`) ?? 'null')
    );
    expect(persisted).toMatchObject({ storageMaintenanceVersion: 1 });
    const history = createRequest({ uri: '/__navet_chores__/history' });
    choreStore.handle(history);
    expect(parseResponse(history).events).toEqual(events);
    mockFs.writeFileSync.mockClear();
    const again = createRequest();
    choreStore.handle(again);
    expect(parseResponse(again)).toEqual(saved);
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });

  it('reconciles obsolete long-interval repeats while preserving protected future work', () => {
    seedLegacy(2, true);
    const { document, obsoleteIds } = longIntervalRepairFixture();
    const read = createRequest();
    choreStore.handle(read);
    expect(read.return).toHaveBeenCalledWith(200, expect.any(String));
    expect(parseResponse(read).data.occurrencesById).toEqual(
      Object.fromEntries(
        Object.entries(document.data.occurrencesById).filter(([id]) => !obsoleteIds.includes(id))
      )
    );
  });

  it.each([14, 120])(
    'recomputes a lone stale future repeat for a %i-day interval',
    (intervalDays) => {
      const { mockFs } = seedLegacy(2, false, intervalDays);
      const { document, obsoleteIds } = loneStaleRepeatFixture(intervalDays);
      const read = createRequest();
      choreStore.handle(read);
      expect(read.return).toHaveBeenCalledWith(200, expect.any(String));
      const saved = parseResponse(read);
      expect(saved.data.occurrencesById).toEqual(
        Object.fromEntries(
          Object.entries(document.data.occurrencesById).filter(([id]) => !obsoleteIds.includes(id))
        )
      );
      mockFs.writeFileSync.mockClear();
      const again = createRequest();
      choreStore.handle(again);
      expect(parseResponse(again)).toEqual(saved);
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    }
  );

  it('retries an interrupted upgrade without losing the old workspace, history or chunks', () => {
    const { mockFs, document, events } = seedLegacy();
    const originalPrimary = mockFs.getFile(CHORE_PATH);
    const orphanPath = `${CHORE_PATH}.chunk-${'f'.repeat(64)}`;
    mockFs.writeFileSync(orphanPath, 'obsolete');
    const rename = mockFs.renameSync.getMockImplementation();
    if (!rename) throw new Error('Expected file-system fixture rename');
    mockFs.renameSync.mockImplementation((source, destination) => {
      if (destination === CHORE_PATH) throw new Error('Interrupted upgrade');
      rename(source, destination);
    });
    const failed = createRequest();
    choreStore.handle(failed);
    expect(failed.return.mock.calls.at(-1)?.[0]).toBe(503);
    expect(mockFs.getFile(CHORE_PATH)).toBe(originalPrimary);
    expect(mockFs.getFile(orphanPath)).toBe('obsolete');
    mockFs.renameSync.mockImplementation(rename);
    const retry = createRequest();
    choreStore.handle(retry);
    expect(retry.return).toHaveBeenCalledWith(200, expect.any(String));
    expect(parseResponse(retry).data.participantsById).toEqual(document.data.participantsById);
    const history = createRequest({ uri: '/__navet_chores__/history' });
    choreStore.handle(history);
    expect(parseResponse(history).events).toEqual(events);
  });

  it('rejects damaged compressed payloads and repairs from the healthy copy', () => {
    const { mockFs, hash } = seedLegacy();
    choreStore.handle(createRequest());
    const history = JSON.parse(mockFs.getFile(EVENT_HISTORY_PATH) ?? 'null');
    expect(history.storageEncoding).toBe('deflate-v1');
    expect(() => durableStorage.unpack({ ...history, checksum: '0'.repeat(64) }, hash)).toThrow();
    expect(() =>
      durableStorage.unpack({ ...history, uncompressedBytes: 65 * 1024 * 1024 }, hash)
    ).toThrow();
    const stored = JSON.parse(mockFs.getFile(CHORE_PATH) ?? 'null');
    const packed = durableStorage.pack({ ...stored, padding: 'x'.repeat(50_000) }, hash) as Record<
      string,
      unknown
    >;
    mockFs.writeFileSync(CHORE_PATH, JSON.stringify({ ...packed, checksum: '0'.repeat(64) }));
    const read = createRequest();
    choreStore.handle(read);
    expect(read.return).toHaveBeenCalledWith(200, expect.any(String));
    expect(parseResponse(read).data.participantsById.manager).toBeDefined();
  });
});
