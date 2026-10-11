import { describe, expect, it } from 'vitest';
import { createChoreExperienceState } from './chore-experience';
import {
  applyChoreOccurrenceCommand,
  applyChoreWorkspaceAction,
  applyChoreWorkspaceOccurrenceCommand,
  type ChoreDefinition,
  type ChoreOccurrence,
  type ChoreParticipant,
  type ChoreWorkspaceData,
  createChoreOutboxItem,
  createEmptyChoreWorkspace,
  getChoreTiming,
  isChoreWorkspaceData,
  materializeChoreOccurrences,
  migrateChoreWorkspaceData,
  runChoreWorkspaceScheduler,
} from './chores';

const alice: ChoreParticipant = {
  id: 'alice',
  displayName: 'Alice',
  capabilities: ['complete', 'approve', 'manage'],
  createdAt: '2026-08-01T08:00:00.000Z',
  updatedAt: '2026-08-01T08:00:00.000Z',
};

const bob: ChoreParticipant = {
  id: 'bob',
  displayName: 'Bob',
  capabilities: ['complete'],
  createdAt: '2026-08-01T08:00:00.000Z',
  updatedAt: '2026-08-01T08:00:00.000Z',
};

function makeDefinition(overrides: Partial<ChoreDefinition> = {}): ChoreDefinition {
  return {
    id: 'take-out-recycling',
    title: 'Take out recycling',
    enabled: true,
    assignment: {
      mode: 'rotation',
      participantIds: ['alice', 'bob'],
    },
    schedule: {
      frequency: 'weekly',
      startDate: '2026-08-01',
      time: '18:00',
      timeZone: 'Europe/Stockholm',
      daysOfWeek: [1],
    },
    dueWindowMinutes: 180,
    approval: { required: false, approverIds: [] },
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-01T08:00:00.000Z',
    ...overrides,
  };
}

function makeOccurrence(overrides: Partial<ChoreOccurrence> = {}): ChoreOccurrence {
  return {
    id: 'take-out-recycling:2026-08-10T16:00:00.000Z:alice',
    definitionId: 'take-out-recycling',
    scheduledAt: '2026-08-10T16:00:00.000Z',
    dueAt: '2026-08-10T19:00:00.000Z',
    assigneeIds: ['alice'],
    assignmentSlot: 'alice',
    status: 'available',
    updatedAt: '2026-08-10T16:00:00.000Z',
    ...overrides,
  };
}

describe('chores domain', () => {
  it('accepts legacy and weekly rotation backups and rejects unknown cadence values', () => {
    const data = createEmptyChoreWorkspace();
    const definition = makeDefinition();
    data.participantsById = { alice, bob };
    data.definitionsById = { [definition.id]: definition };
    expect(isChoreWorkspaceData(data)).toBe(true);
    definition.assignment.rotationCadence = 'weekly';
    expect(isChoreWorkspaceData(data)).toBe(true);
    expect(
      isChoreWorkspaceData({
        ...data,
        definitionsById: {
          [definition.id]: {
            ...definition,
            assignment: { ...definition.assignment, rotationCadence: 'yearly' },
          },
        },
      })
    ).toBe(false);
  });

  it('validates weekly handover weekdays while allowing legacy defaults', () => {
    for (const rotationDayOfWeek of [undefined, 0, 1, 6, -1, 7, 1.5, '1', null, true]) {
      const data = createEmptyChoreWorkspace();
      const definition = makeDefinition();
      data.participantsById = { alice, bob };
      data.definitionsById = { [definition.id]: definition };
      Object.assign(definition.assignment, { rotationCadence: 'weekly', rotationDayOfWeek });
      expect(isChoreWorkspaceData(data)).toBe(
        rotationDayOfWeek === undefined || [0, 1, 6].includes(rotationDayOfWeek as number)
      );
    }
  });

  it('creates an empty versioned workspace', () => {
    expect(createEmptyChoreWorkspace()).toEqual({
      schemaVersion: 2,
      participantsById: {},
      definitionsById: {},
      occurrencesById: {},
      activity: [],
      outbox: [],
      historyRetention: { maxAgeDays: 730, maxEvents: 50_000 },
      experience: createChoreExperienceState(),
    });
  });

  it('materializes weekly rotation occurrences with DST-safe local times', () => {
    const occurrences = materializeChoreOccurrences({
      definition: makeDefinition(),
      participantsById: { alice, bob },
      rangeStart: '2026-08-01T00:00:00.000Z',
      rangeEnd: '2026-08-17T00:00:00.000Z',
    });

    expect(occurrences).toHaveLength(2);
    expect(occurrences.map((occurrence) => occurrence.assigneeIds)).toEqual([['alice'], ['bob']]);
    expect(occurrences.map((occurrence) => occurrence.scheduledAt)).toEqual([
      '2026-08-03T16:00:00.000Z',
      '2026-08-10T16:00:00.000Z',
    ]);

    const laterOccurrence = materializeChoreOccurrences({
      definition: makeDefinition(),
      participantsById: { alice, bob },
      rangeStart: '2026-08-17T00:00:00.000Z',
      rangeEnd: '2026-08-18T00:00:00.000Z',
    });
    expect(laterOccurrence[0]?.assigneeIds).toEqual(['alice']);
  });

  it('uses standby coverage and completed history for fair rotation', () => {
    const person = makeDefinition({
      assignment: { mode: 'person', participantIds: ['alice'], standbyParticipantIds: ['bob'] },
    });
    const standby = materializeChoreOccurrences({
      definition: person,
      participantsById: { alice: { ...alice, pausedAt: '2026-08-01T08:00:00.000Z' }, bob },
      rangeStart: '2026-08-01T00:00:00.000Z',
      rangeEnd: '2026-08-11T00:00:00.000Z',
    });
    expect(standby[0]).toMatchObject({ assignmentSlot: 'standby', assigneeIds: ['bob'] });

    const fair = makeDefinition({
      assignment: { mode: 'rotation', participantIds: ['alice', 'bob'], rotationStrategy: 'fair' },
    });
    const completed = makeOccurrence({ status: 'done', completedBy: 'alice' });
    const next = materializeChoreOccurrences({
      definition: fair,
      participantsById: { alice, bob },
      existingOccurrences: { [completed.id]: completed },
      rangeStart: '2026-08-17T00:00:00.000Z',
      rangeEnd: '2026-08-18T00:00:00.000Z',
    });
    expect(next[0]?.assigneeIds).toEqual(['bob']);
  });

  it('enforces claim windows and retains a claim when review sends work back', () => {
    const definition = makeDefinition({
      claimPolicy: { required: true, allowSteal: false, opensBeforeMinutes: 30 },
      approval: { required: true, approverIds: ['alice'], resetClaimOnReject: false },
    });
    const occurrence = makeOccurrence({
      scheduledAt: '2026-08-10T16:00:00.000Z',
      assigneeIds: ['bob'],
    });
    expect(() =>
      applyChoreOccurrenceCommand({
        definition,
        occurrence,
        command: { type: 'claim', participantId: 'bob' },
        commandId: 'early',
        timestamp: '2026-08-10T15:29:00.000Z',
      })
    ).toThrow('cannot be claimed yet');
    const claimed = applyChoreOccurrenceCommand({
      definition,
      occurrence,
      command: { type: 'claim', participantId: 'bob' },
      commandId: 'claim',
      timestamp: '2026-08-10T15:30:00.000Z',
    }).occurrence;
    const pending = applyChoreOccurrenceCommand({
      definition,
      occurrence: claimed,
      command: { type: 'complete', participantId: 'bob' },
      commandId: 'complete',
      timestamp: '2026-08-10T16:10:00.000Z',
    }).occurrence;
    const sentBack = applyChoreOccurrenceCommand({
      definition,
      occurrence: pending,
      command: { type: 'reject', participantId: 'alice' },
      commandId: 'reject',
      timestamp: '2026-08-10T16:20:00.000Z',
    }).occurrence;
    expect(sentBack).toMatchObject({ status: 'claimed', claimedBy: 'bob' });
    expect(sentBack.completedBy).toBeUndefined();
  });

  it('keeps elapsed hourly intervals through DST and applies personal due offsets', () => {
    const hourly = makeDefinition({
      assignment: { mode: 'person', participantIds: ['alice'] },
      schedule: {
        frequency: 'hourly',
        startDate: '2026-10-25',
        time: '01:00',
        timeZone: 'Europe/Stockholm',
        intervalHours: 2,
      },
    });
    const hourlyOccurrences = materializeChoreOccurrences({
      definition: hourly,
      participantsById: { alice },
      rangeStart: '2026-10-24T22:00:00.000Z',
      rangeEnd: '2026-10-25T06:00:00.000Z',
    });
    expect(hourlyOccurrences.map((occurrence) => occurrence.scheduledAt)).toEqual([
      '2026-10-24T23:00:00.000Z',
      '2026-10-25T01:00:00.000Z',
      '2026-10-25T03:00:00.000Z',
      '2026-10-25T05:00:00.000Z',
    ]);

    const personal = makeDefinition({
      assignment: {
        mode: 'everyone',
        participantIds: ['alice', 'bob'],
        participantScheduleOverrides: { bob: { dueDateOffsetDays: 1 } },
      },
    });
    const occurrences = materializeChoreOccurrences({
      definition: personal,
      participantsById: { alice, bob },
      rangeStart: '2026-08-01T00:00:00.000Z',
      rangeEnd: '2026-08-11T00:00:00.000Z',
    });
    expect(occurrences.find((occurrence) => occurrence.assigneeIds[0] === 'bob')?.scheduledAt).toBe(
      '2026-08-04T16:00:00.000Z'
    );
  });

  it('keeps the chosen wall clock time for completion-date recurrence', () => {
    const definition = makeDefinition({
      assignment: { mode: 'person', participantIds: ['alice'] },
      schedule: {
        frequency: 'after_completion',
        startDate: '2026-10-24',
        time: '18:00',
        timeZone: 'Europe/Stockholm',
        intervalDays: 2,
      },
    });
    const occurrences = materializeChoreOccurrences({
      definition,
      participantsById: { alice },
      latestCompletedAt: '2026-10-24T18:00:00.000Z',
      rangeStart: '2026-10-25T00:00:00.000Z',
      rangeEnd: '2026-10-27T00:00:00.000Z',
    });
    expect(occurrences[0]?.scheduledAt).toBe('2026-10-26T17:00:00.000Z');
  });

  it('supersedes older work at the reviewed vacation replacement date', () => {
    const definition = makeDefinition({ missedPolicy: { graceMinutes: 0, action: 'none' } });
    const previous = makeOccurrence({
      id: 'previous',
      scheduledAt: '2026-08-03T16:00:00.000Z',
      dueAt: '2026-08-03T19:00:00.000Z',
    });
    const original = makeOccurrence({
      id: 'vacation-next',
      assigneeIds: ['bob'],
      assignmentSlot: 'bob',
    });
    const workspace = {
      ...createEmptyChoreWorkspace(),
      participantsById: {
        alice,
        bob: { ...bob, pausedAt: '2026-08-05T00:00:00.000Z', resumeAt: '2026-08-12T00:00:00.000Z' },
      },
      definitionsById: { [definition.id]: definition },
      occurrencesById: { [previous.id]: previous, [original.id]: original },
    };
    const moved = applyChoreWorkspaceAction({
      workspace,
      timestamp: '2026-08-06T08:00:00.000Z',
      commandId: 'move-next',
      action: {
        type: 'vacation_reschedule',
        actorParticipantId: 'alice',
        participantId: 'bob',
        occurrenceIds: [original.id],
        startDate: '2026-08-13',
      },
    }).data;
    const replacement = Object.values(moved.occurrencesById).find(
      (item) => item.carriedForwardFrom === original.id
    ) as ChoreOccurrence;
    expect(
      runChoreWorkspaceScheduler(moved, original.scheduledAt).data.occurrencesById[previous.id]
        .status
    ).toBe('available');
    expect(
      runChoreWorkspaceScheduler(moved, '2026-08-13T15:59:59.000Z').data.occurrencesById[
        previous.id
      ].status
    ).toBe('available');
    const superseded = runChoreWorkspaceScheduler(moved, replacement.scheduledAt);
    expect(superseded.data.occurrencesById[previous.id]).toMatchObject({
      status: 'missed',
      missedAt: replacement.scheduledAt,
    });
    expect(superseded.data.occurrencesById[original.id]).toEqual(
      moved.occurrencesById[original.id]
    );
    // Resolved history may age out before a far-future reviewed replacement starts.
    const withoutPlaceholder = {
      ...moved,
      occurrencesById: { [previous.id]: previous, [replacement.id]: replacement },
    };
    expect(
      runChoreWorkspaceScheduler(withoutPlaceholder, replacement.scheduledAt).data.occurrencesById[
        previous.id
      ].status
    ).toBe('missed');
  });

  it('does not use automatic carry-forward work as a new fixed-schedule boundary', () => {
    const definition = makeDefinition({ missedPolicy: { graceMinutes: 0, action: 'none' } });
    const previous = makeOccurrence({ id: 'previous' });
    const carried = makeOccurrence({
      id: 'carried',
      scheduledAt: '2026-08-11T16:00:00.000Z',
      carriedForwardFrom: 'older-missed',
      assignmentSlot: 'carry:older-missed',
    });
    const movedCarry = {
      ...carried,
      id: 'moved-carry',
      scheduledAt: '2026-08-13T16:00:00.000Z',
      carriedForwardFrom: carried.id,
    };
    const workspace = {
      ...createEmptyChoreWorkspace(),
      participantsById: { alice, bob },
      definitionsById: { [definition.id]: definition },
      occurrencesById: {
        [previous.id]: previous,
        [carried.id]: { ...carried, status: 'skipped' as const, carriedForwardTo: movedCarry.id },
        [movedCarry.id]: movedCarry,
      },
    };
    expect(
      runChoreWorkspaceScheduler(workspace, movedCarry.scheduledAt).data.occurrencesById[
        previous.id
      ].status
    ).toBe('available');
    const calendarSkip = {
      ...movedCarry,
      id: 'calendar-skip',
      assignmentSlot: 'alice',
      carriedForwardFrom: undefined,
      status: 'skipped' as const,
    };
    const withCalendarSkip = {
      ...workspace,
      occurrencesById: { ...workspace.occurrencesById, [calendarSkip.id]: calendarSkip },
    };
    expect(
      runChoreWorkspaceScheduler(withCalendarSkip, calendarSkip.scheduledAt).data.occurrencesById[
        previous.id
      ].status
    ).toBe('missed');
  });

  it('keeps vacation work through participant updates and rematerialization for review', () => {
    const definition = makeDefinition({ assignment: { mode: 'person', participantIds: ['bob'] } });
    const occurrence = makeOccurrence({
      id: 'vacation-future',
      assigneeIds: ['bob'],
      scheduledAt: '2026-08-10T16:00:00.000Z',
    });
    let workspace = {
      ...createEmptyChoreWorkspace(),
      participantsById: { alice, bob },
      definitionsById: { [definition.id]: definition },
      occurrencesById: { [occurrence.id]: occurrence },
    };
    workspace = applyChoreWorkspaceAction({
      workspace,
      commandId: 'pause-bob',
      timestamp: '2026-08-01T08:00:00.000Z',
      action: {
        type: 'participant_update',
        actorParticipantId: 'alice',
        participant: {
          ...bob,
          pausedAt: '2026-08-02T00:00:00.000Z',
          resumeAt: '2026-08-12T00:00:00.000Z',
        },
      },
    }).data as typeof workspace;
    workspace = applyChoreWorkspaceAction({
      workspace,
      commandId: 'paused-materialize',
      timestamp: '2026-08-01T08:00:00.000Z',
      action: {
        type: 'materialize_occurrences',
        rangeStart: '2026-08-01T00:00:00.000Z',
        rangeEnd: '2026-08-12T00:00:00.000Z',
      },
    }).data as typeof workspace;
    expect(workspace.occurrencesById[occurrence.id]).toBeDefined();
    const moved = applyChoreWorkspaceAction({
      workspace,
      commandId: 'vacation-review',
      timestamp: '2026-08-12T08:00:00.000Z',
      action: {
        type: 'vacation_reschedule',
        actorParticipantId: 'alice',
        participantId: 'bob',
        occurrenceIds: [occurrence.id],
        startDate: '2026-08-13',
      },
    }).data;
    expect(
      Object.values(moved.occurrencesById).some((item) => item.carriedForwardFrom === occurrence.id)
    ).toBe(true);
  });

  it('keeps fair rotation assignments stable when the same range is materialized again', () => {
    const definition = makeDefinition({
      schedule: { frequency: 'daily', startDate: '2026-08-03', time: '16:00', timeZone: 'UTC' },
      assignment: { mode: 'rotation', participantIds: ['alice', 'bob'], rotationStrategy: 'fair' },
    });
    const input = {
      definition,
      participantsById: { alice, bob },
      rangeStart: '2026-08-03T00:00:00.000Z',
      rangeEnd: '2026-08-07T00:00:00.000Z',
    };
    const first = materializeChoreOccurrences(input);
    expect(first.map((item) => item.assigneeIds[0])).toEqual(['alice', 'bob', 'alice', 'bob']);
    const existingOccurrences = Object.fromEntries(first.map((item) => [item.id, item]));
    expect(materializeChoreOccurrences({ ...input, existingOccurrences })).toEqual(first);
  });

  it('keeps fair rotation stable with personal dates and times', () => {
    const definition = makeDefinition({
      schedule: { frequency: 'daily', startDate: '2026-08-03', time: '16:00', timeZone: 'UTC' },
      assignment: {
        mode: 'rotation',
        participantIds: ['alice', 'bob'],
        rotationStrategy: 'fair',
        participantScheduleOverrides: {
          alice: { dueDateOffsetDays: 1, times: ['18:00'] },
          bob: { times: ['19:00'] },
        },
      },
    });
    const input = {
      definition,
      participantsById: { alice, bob },
      rangeStart: '2026-08-03T00:00:00.000Z',
      rangeEnd: '2026-08-07T00:00:00.000Z',
    };
    const first = materializeChoreOccurrences(input);
    const existingOccurrences = Object.fromEntries(first.map((item) => [item.id, item]));
    expect(first.map((item) => item.assigneeIds[0])).toEqual(['alice', 'bob', 'alice', 'bob']);
    expect(materializeChoreOccurrences({ ...input, existingOccurrences })).toEqual(first);
  });

  it('preserves a large reward transaction in a valid persisted workspace', () => {
    const experience = createChoreExperienceState();
    experience.gamificationMode = 'family';
    experience.earnedPointsByParticipant = { bob: 20000 };
    experience.rewardRequestsById.large = {
      id: 'large',
      rewardId: 'goal',
      rewardTitle: 'Large reward',
      cost: 15000,
      participantId: 'bob',
      status: 'requested',
      requestedAt: alice.createdAt,
      updatedAt: alice.createdAt,
    };
    const result = applyChoreWorkspaceAction({
      workspace: { ...createEmptyChoreWorkspace(), participantsById: { alice, bob }, experience },
      action: {
        type: 'reward_decision',
        actorParticipantId: 'alice',
        requestId: 'large',
        decision: 'approve',
      },
      commandId: 'large-approve',
      timestamp: '2026-08-01T09:00:00.000Z',
    });
    const persisted = { ...result.data, activity: [result.activity] };
    expect(isChoreWorkspaceData(persisted)).toBe(true);
    expect(persisted.experience?.pointTransactions[0]?.pointsDelta).toBe(-15000);
  });

  it('counts reused hourly occurrences only once against the workspace cap', () => {
    const definition = makeDefinition({
      assignment: { mode: 'person', participantIds: ['alice'] },
      schedule: {
        frequency: 'hourly',
        startDate: '2026-08-01',
        time: '00:00',
        timeZone: 'UTC',
        intervalHours: 1,
      },
    });
    const workspace = {
      ...createEmptyChoreWorkspace(),
      participantsById: { alice },
      definitionsById: { [definition.id]: definition },
    };
    const action = {
      type: 'materialize_occurrences' as const,
      rangeStart: '2026-08-01T00:00:00.000Z',
      rangeEnd: '2026-11-15T00:00:00.000Z',
    };
    const first = applyChoreWorkspaceAction({
      workspace,
      action,
      commandId: 'hourly-first',
      timestamp: action.rangeStart,
    }).data;
    expect(Object.keys(first.occurrencesById).length).toBeGreaterThan(2500);
    expect(() =>
      applyChoreWorkspaceAction({
        workspace: first,
        action,
        commandId: 'hourly-again',
        timestamp: action.rangeStart,
      })
    ).not.toThrow();
  });

  it('continues hourly materialization beyond 5000 retained unfinished occurrences', () => {
    const definition = makeDefinition({
      assignment: { mode: 'person', participantIds: ['alice'] },
      schedule: {
        frequency: 'hourly',
        startDate: '2026-08-01',
        time: '00:00',
        timeZone: 'UTC',
        intervalHours: 1,
      },
    });
    let workspace: ChoreWorkspaceData = {
      ...createEmptyChoreWorkspace(),
      participantsById: { alice },
      definitionsById: { [definition.id]: definition },
    };
    for (const [index, [rangeStart, rangeEnd]] of [
      ['2026-08-01T00:00:00.000Z', '2026-11-15T00:00:00.000Z'],
      ['2026-11-15T00:00:00.000Z', '2027-03-01T00:00:00.000Z'],
    ].entries()) {
      workspace = applyChoreWorkspaceAction({
        workspace,
        action: { type: 'materialize_occurrences', rangeStart, rangeEnd },
        commandId: `retained-hourly:${index}`,
        timestamp: '2026-08-01T00:00:00.000Z',
      }).data;
    }
    expect(Object.keys(workspace.occurrencesById).length).toBeGreaterThan(5000);
    expect(
      Object.values(workspace.occurrencesById).every((item) => item.status === 'available')
    ).toBe(true);
  });

  it('moves only reviewed vacation work and preserves claimed work', () => {
    const definition = makeDefinition({ assignment: { mode: 'person', participantIds: ['bob'] } });
    const pausedBob = {
      ...bob,
      pausedAt: '2026-08-01T00:00:00.000Z',
      resumeAt: '2026-08-12T00:00:00.000Z',
    };
    const eligible = makeOccurrence({
      id: 'vacation-work',
      assigneeIds: ['bob'],
      scheduledAt: '2026-08-10T16:00:00.000Z',
    });
    const claimed = makeOccurrence({
      id: 'claimed-work',
      assigneeIds: ['bob'],
      status: 'claimed',
      claimedBy: 'bob',
      claimedAt: '2026-08-10T16:00:00.000Z',
    });
    const workspace = createEmptyChoreWorkspace();
    workspace.participantsById = { alice, bob: pausedBob };
    workspace.definitionsById = { [definition.id]: definition };
    workspace.occurrencesById = { [eligible.id]: eligible, [claimed.id]: claimed };
    const result = applyChoreWorkspaceAction({
      workspace,
      action: {
        type: 'vacation_reschedule',
        actorParticipantId: 'alice',
        participantId: 'bob',
        occurrenceIds: [eligible.id],
        startDate: '2026-08-13',
      },
      commandId: 'move-vacation',
      timestamp: '2026-08-12T08:00:00.000Z',
    });
    expect(result.data.occurrencesById[eligible.id]).toMatchObject({ status: 'skipped' });
    expect(result.data.occurrencesById[claimed.id]).toMatchObject({ status: 'claimed' });
    const moved = Object.values(result.data.occurrencesById).find(
      (item) => item.carriedForwardFrom === eligible.id
    );
    expect(moved).toMatchObject({ status: 'available', scheduledAt: '2026-08-13T16:00:00.000Z' });
    const afterReturn = runChoreWorkspaceScheduler(result.data, '2026-08-13T09:00:00.000Z');
    expect(
      afterReturn.activities.some(
        (activity) => activity.type === 'overdue' || activity.type === 'missed'
      )
    ).toBe(false);
    expect(afterReturn.outboxItems).toHaveLength(0);
    const afterDue = runChoreWorkspaceScheduler(result.data, '2026-08-14T09:00:00.000Z');
    expect(
      afterDue.activities.some(
        (activity) => activity.occurrenceId === moved?.id && activity.type === 'overdue'
      )
    ).toBe(true);
  });

  it.each([
    [2, ['2026-08-03T09:00:00.000Z', '2026-08-17T09:00:00.000Z']],
    [3, ['2026-08-03T09:00:00.000Z', '2026-08-24T09:00:00.000Z']],
  ])('materializes every %s week schedules', (intervalWeeks, expected) => {
    const occurrences = materializeChoreOccurrences({
      definition: makeDefinition({
        assignment: { mode: 'person', participantIds: ['alice'] },
        schedule: {
          frequency: 'weekly',
          startDate: '2026-08-01',
          time: '09:00',
          timeZone: 'UTC',
          daysOfWeek: [1],
          intervalWeeks,
        },
      }),
      participantsById: { alice },
      rangeStart: '2026-08-01T00:00:00.000Z',
      rangeEnd: '2026-08-31T00:00:00.000Z',
    });

    expect(occurrences.map((occurrence) => occurrence.scheduledAt)).toEqual(expected);
  });

  it.each([
    [2, ['2026-08-27T09:00:00.000Z', '2026-09-10T09:00:00.000Z', '2026-09-24T09:00:00.000Z']],
    [3, ['2026-08-27T09:00:00.000Z', '2026-09-17T09:00:00.000Z']],
    [4, ['2026-08-27T09:00:00.000Z', '2026-09-24T09:00:00.000Z']],
  ])(
    'keeps an every-%s-weeks schedule anchored to its August 27 start',
    (intervalWeeks, expected) => {
      const occurrences = materializeChoreOccurrences({
        definition: makeDefinition({
          assignment: { mode: 'person', participantIds: ['alice'] },
          schedule: {
            frequency: 'weekly',
            startDate: '2026-08-27',
            time: '09:00',
            timeZone: 'UTC',
            daysOfWeek: [4],
            intervalWeeks,
          },
        }),
        participantsById: { alice },
        rangeStart: '2026-08-27T00:00:00.000Z',
        rangeEnd: '2026-09-30T00:00:00.000Z',
      });

      expect(occurrences.map((occurrence) => occurrence.scheduledAt)).toEqual(expected);
      expect(
        occurrences.some((occurrence) => occurrence.scheduledAt.startsWith('2026-09-02'))
      ).toBe(false);
    }
  );

  it('creates one occurrence per active participant for everyone assignments', () => {
    const occurrences = materializeChoreOccurrences({
      definition: makeDefinition({
        assignment: { mode: 'everyone', participantIds: ['alice', 'bob'] },
        schedule: {
          frequency: 'once',
          date: '2026-08-10',
          time: '18:00',
          timeZone: 'Europe/Stockholm',
        },
      }),
      participantsById: { alice, bob },
      rangeStart: '2026-08-10T00:00:00.000Z',
      rangeEnd: '2026-08-11T00:00:00.000Z',
    });

    expect(occurrences.map((occurrence) => occurrence.assignmentSlot)).toEqual(['alice', 'bob']);
  });

  it('keeps after-completion schedules to the single next occurrence', () => {
    const occurrences = materializeChoreOccurrences({
      definition: makeDefinition({
        assignment: { mode: 'person', participantIds: ['alice'] },
        schedule: {
          frequency: 'after_completion',
          startDate: '2026-08-01',
          time: '18:00',
          timeZone: 'Europe/Stockholm',
          intervalDays: 3,
        },
      }),
      participantsById: { alice },
      rangeStart: '2026-08-01T00:00:00.000Z',
      rangeEnd: '2026-09-01T00:00:00.000Z',
      latestCompletedAt: '2026-08-10T19:00:00.000Z',
    });

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]?.scheduledAt).toBe('2026-08-13T16:00:00.000Z');
  });

  it('supports bounded every-N-day schedules, exclusions, and multiple times', () => {
    const occurrences = materializeChoreOccurrences({
      definition: makeDefinition({
        assignment: { mode: 'person', participantIds: ['alice'] },
        schedule: {
          frequency: 'daily',
          startDate: '2026-08-01',
          endDate: '2026-08-05',
          excludedDates: ['2026-08-03'],
          intervalDays: 2,
          time: '09:00',
          times: ['09:00', '18:00'],
          timeZone: 'UTC',
        },
      }),
      participantsById: { alice },
      rangeStart: '2026-08-01T00:00:00.000Z',
      rangeEnd: '2026-08-06T00:00:00.000Z',
    });

    expect(occurrences.map((occurrence) => occurrence.scheduledAt)).toEqual([
      '2026-08-01T09:00:00.000Z',
      '2026-08-01T18:00:00.000Z',
      '2026-08-05T09:00:00.000Z',
      '2026-08-05T18:00:00.000Z',
    ]);
  });

  it('supports nth-weekday monthly schedules and per-participant time variants', () => {
    const monthly = materializeChoreOccurrences({
      definition: makeDefinition({
        assignment: { mode: 'person', participantIds: ['alice'] },
        schedule: {
          frequency: 'monthly',
          startDate: '2026-08-01',
          time: '18:00',
          timeZone: 'UTC',
          nthWeekday: { weekday: 2, ordinal: 2 },
        },
      }),
      participantsById: { alice },
      rangeStart: '2026-08-01T00:00:00.000Z',
      rangeEnd: '2026-09-01T00:00:00.000Z',
    });
    expect(monthly.map((occurrence) => occurrence.scheduledAt)).toEqual([
      '2026-08-11T18:00:00.000Z',
    ]);

    const everyone = materializeChoreOccurrences({
      definition: makeDefinition({
        assignment: {
          mode: 'everyone',
          participantIds: ['alice', 'bob'],
          participantScheduleOverrides: { bob: { times: ['20:00'] } },
        },
        schedule: {
          frequency: 'once',
          date: '2026-08-10',
          time: '18:00',
          timeZone: 'UTC',
        },
      }),
      participantsById: { alice, bob },
      rangeStart: '2026-08-10T00:00:00.000Z',
      rangeEnd: '2026-08-11T00:00:00.000Z',
    });
    expect(everyone.map((occurrence) => occurrence.scheduledAt)).toEqual([
      '2026-08-10T18:00:00.000Z',
      '2026-08-10T20:00:00.000Z',
    ]);
  });

  it('rejects malformed nested workspace data', () => {
    expect(
      isChoreWorkspaceData({
        ...createEmptyChoreWorkspace(),
        participantsById: {
          alice: { ...alice, capabilities: ['admin'] },
        },
      })
    ).toBe(false);
  });

  it('accepts provider-neutral and legacy reminder destinations', () => {
    for (const type of ['provider', 'home_assistant'] as const) {
      expect(
        isChoreWorkspaceData({
          ...createEmptyChoreWorkspace(),
          participantsById: {
            alice: {
              ...alice,
              reminderPreferences: {
                enabled: true,
                destination: { type, target: 'mobile_app_alice' },
              },
            },
          },
        })
      ).toBe(true);
    }
  });

  it('persists bounded Lucide avatar names for participants', () => {
    expect(
      isChoreWorkspaceData({
        ...createEmptyChoreWorkspace(),
        participantsById: {
          alice: { ...alice, avatarIcon: 'UserRound' },
        },
      })
    ).toBe(true);
    expect(
      isChoreWorkspaceData({
        ...createEmptyChoreWorkspace(),
        participantsById: {
          alice: { ...alice, avatarIcon: 'x'.repeat(65) },
        },
      })
    ).toBe(false);
  });

  it('migrates schema version 1 without discarding household state', () => {
    const legacy = {
      schemaVersion: 1,
      participantsById: { alice },
      definitionsById: {},
      occurrencesById: {},
      activity: [],
    };

    expect(migrateChoreWorkspaceData(legacy)).toEqual({
      ...legacy,
      schemaVersion: 2,
      outbox: [],
      historyRetention: { maxAgeDays: 730, maxEvents: 50_000 },
      experience: createChoreExperienceState(),
    });
    expect(() => migrateChoreWorkspaceData({ schemaVersion: 0 })).toThrow('Unsupported');
  });

  it('migrates saved experience balances into the reward transaction model', () => {
    const current = createEmptyChoreWorkspace();
    const legacy = {
      ...current,
      participantsById: { alice, bob },
      experience: {
        version: 1,
        gamificationMode: 'family',
        presentationByDefinitionId: {},
        missionsById: {},
        rewardGoalsById: {},
        earnedPointsByParticipant: { bob: 35 },
      },
    };
    const migrated = migrateChoreWorkspaceData(legacy);
    expect(migrated.experience).toMatchObject({
      version: 2,
      earnedPointsByParticipant: { bob: 35 },
      pointTransactions: [{ id: 'opening:bob', participantId: 'bob', pointsDelta: 35 }],
    });
    expect(migrateChoreWorkspaceData(migrated)).toEqual(migrated);
  });

  it('repairs a corrupted rotation cursor without discarding the workspace', () => {
    const definition = makeDefinition();
    const corrupted = {
      ...createEmptyChoreWorkspace(),
      participantsById: { alice, bob },
      definitionsById: {
        [definition.id]: {
          ...definition,
          assignment: { ...definition.assignment, rotationCursor: null },
        },
      },
    };

    expect(isChoreWorkspaceData(corrupted)).toBe(false);
    expect(
      migrateChoreWorkspaceData(corrupted).definitionsById[definition.id]?.assignment.rotationCursor
    ).toBe(0);
  });

  it('accepts a persisted experience update in workspace activity and outbox data', () => {
    const workspace = {
      ...createEmptyChoreWorkspace(),
      participantsById: { alice },
    };
    const experience = {
      ...createChoreExperienceState(),
      setupStartedAt: '2026-08-01T09:00:00.000Z',
    };
    const updated = applyChoreWorkspaceAction({
      commandId: 'start-setup',
      action: { type: 'experience_update', actorParticipantId: 'alice', experience },
      timestamp: '2026-08-01T09:00:00.000Z',
      workspace,
    });
    const persisted = {
      ...updated.data,
      activity: [...updated.data.activity, updated.activity],
      outbox: [...updated.data.outbox, createChoreOutboxItem(updated.activity)],
    };

    expect(isChoreWorkspaceData(persisted)).toBe(true);
    expect(migrateChoreWorkspaceData(persisted).experience?.setupStartedAt).toBe(
      '2026-08-01T09:00:00.000Z'
    );
  });

  it('removes stale available occurrences and undelivered reminders when a schedule changes', () => {
    const currentDefinition = makeDefinition({
      assignment: { mode: 'person', participantIds: ['alice'] },
      schedule: {
        frequency: 'weekly',
        startDate: '2026-08-01',
        time: '09:00',
        timeZone: 'UTC',
        daysOfWeek: [3],
      },
    });
    const staleOccurrence = makeOccurrence({
      id: `${currentDefinition.id}:2026-09-02T09:00:00.000Z:alice`,
      scheduledAt: '2026-09-02T09:00:00.000Z',
      dueAt: '2026-09-02T12:00:00.000Z',
      assigneeIds: ['alice'],
      assignmentSlot: 'alice',
    });
    const workspace = {
      ...createEmptyChoreWorkspace(),
      participantsById: { alice },
      definitionsById: { [currentDefinition.id]: currentDefinition },
      occurrencesById: { [staleOccurrence.id]: staleOccurrence },
      outbox: [
        {
          id: 'outbox:stale-reminder',
          activityId: 'activity:stale-reminder',
          eventType: 'reminder_due' as const,
          status: 'pending' as const,
          attempts: 0,
          createdAt: '2026-09-02T09:00:00.000Z',
          nextAttemptAt: '2026-09-02T09:00:00.000Z',
          occurrenceId: staleOccurrence.id,
          participantId: 'alice',
          destination: 'home_assistant' as const,
        },
      ],
    };
    const updatedDefinition = {
      ...currentDefinition,
      schedule: {
        frequency: 'weekly' as const,
        startDate: '2026-08-27',
        time: '09:00',
        timeZone: 'UTC',
        daysOfWeek: [4],
        intervalWeeks: 2,
      },
      updatedAt: '2026-08-27T10:00:00.000Z',
    };

    const result = applyChoreWorkspaceAction({
      commandId: 'update-every-two-weeks',
      action: {
        type: 'definition_update',
        actorParticipantId: 'alice',
        definition: updatedDefinition,
      },
      timestamp: '2026-08-27T10:00:00.000Z',
      workspace,
    });

    expect(result.data.occurrencesById).toEqual({});
    expect(result.data.outbox).toEqual([]);
  });

  it('reconciles a persisted stale September 2 occurrence against the current schedule', () => {
    const definition = makeDefinition({
      assignment: { mode: 'person', participantIds: ['alice'] },
      schedule: {
        frequency: 'weekly',
        startDate: '2026-08-27',
        time: '09:00',
        timeZone: 'UTC',
        daysOfWeek: [4],
        intervalWeeks: 2,
      },
    });
    const staleOccurrence = makeOccurrence({
      id: `${definition.id}:2026-09-02T09:00:00.000Z:alice`,
      scheduledAt: '2026-09-02T09:00:00.000Z',
      dueAt: '2026-09-02T12:00:00.000Z',
      assigneeIds: ['alice'],
      assignmentSlot: 'alice',
    });
    const result = applyChoreWorkspaceAction({
      commandId: 'reconcile-every-two-weeks',
      action: {
        type: 'materialize_occurrences',
        rangeStart: '2026-08-27T00:00:00.000Z',
        rangeEnd: '2026-09-30T00:00:00.000Z',
      },
      timestamp: '2026-09-02T08:00:00.000Z',
      workspace: {
        ...createEmptyChoreWorkspace(),
        participantsById: { alice },
        definitionsById: { [definition.id]: definition },
        occurrencesById: { [staleOccurrence.id]: staleOccurrence },
      },
    });

    expect(result.data.occurrencesById[staleOccurrence.id]).toBeUndefined();
    expect(
      Object.values(result.data.occurrencesById).map((occurrence) => occurrence.scheduledAt)
    ).toEqual(['2026-08-27T09:00:00.000Z', '2026-09-10T09:00:00.000Z', '2026-09-24T09:00:00.000Z']);
  });

  it('replaces future dates after each repeated edit of the same saved chore', () => {
    const definition = makeDefinition({
      assignment: { mode: 'person', participantIds: ['alice'] },
    });
    let workspace: ChoreWorkspaceData = {
      ...createEmptyChoreWorkspace(),
      participantsById: { alice },
      definitionsById: { [definition.id]: definition },
    };
    const timestamp = '2026-09-01T08:00:00.000Z';
    const schedules: Array<{
      schedule: ChoreDefinition['schedule'];
      dates: string[];
    }> = [
      {
        schedule: {
          frequency: 'weekly',
          startDate: '2026-09-14',
          time: '18:00',
          timeZone: 'UTC',
          daysOfWeek: [1],
          intervalWeeks: 1,
        },
        dates: ['2026-09-14', '2026-09-21', '2026-09-28'],
      },
      {
        schedule: {
          frequency: 'daily',
          startDate: '2026-09-14',
          time: '18:00',
          timeZone: 'UTC',
          intervalDays: 3,
        },
        dates: ['2026-09-14', '2026-09-17', '2026-09-20', '2026-09-23', '2026-09-26', '2026-09-29'],
      },
      {
        schedule: {
          frequency: 'monthly',
          startDate: '2026-09-14',
          time: '18:00',
          timeZone: 'UTC',
          dayOfMonth: 14,
        },
        dates: ['2026-09-14'],
      },
      {
        schedule: {
          frequency: 'weekly',
          startDate: '2026-09-16',
          time: '18:00',
          timeZone: 'UTC',
          daysOfWeek: [3],
          intervalWeeks: 2,
        },
        dates: ['2026-09-16', '2026-09-30'],
      },
    ];
    for (const [index, { schedule, dates }] of schedules.entries()) {
      workspace = applyChoreWorkspaceAction({
        commandId: `edit-${index}`,
        action: {
          type: 'definition_update',
          actorParticipantId: 'alice',
          definition: {
            ...workspace.definitionsById[definition.id],
            schedule,
            updatedAt: timestamp,
          },
        },
        timestamp,
        workspace,
      }).data;
      workspace = applyChoreWorkspaceAction({
        commandId: `materialize-${index}`,
        action: {
          type: 'materialize_occurrences',
          rangeStart: '2026-09-14T00:00:00.000Z',
          rangeEnd: '2026-10-01T00:00:00.000Z',
        },
        timestamp,
        workspace,
      }).data;
      expect(
        Object.values(workspace.occurrencesById)
          .map((item) => item.scheduledAt)
          .sort()
      ).toEqual(dates.map((date) => `${date}T18:00:00.000Z`));
    }
  });

  it('keeps overdue assignments when rotation changes and rematerializes the past', () => {
    const definition = makeDefinition({
      schedule: { frequency: 'daily', startDate: '2026-09-28', time: '18:00', timeZone: 'UTC' },
    });
    const original = materializeChoreOccurrences({
      definition,
      participantsById: { alice, bob },
      rangeStart: '2026-10-04T00:00:00.000Z',
      rangeEnd: '2026-10-07T00:00:00.000Z',
    });
    const overdue = original.find((item) => item.scheduledAt === '2026-10-04T18:00:00.000Z');
    if (!overdue) throw new Error('Expected an overdue chore occurrence');
    const workspace = {
      ...createEmptyChoreWorkspace(),
      participantsById: { alice, bob },
      definitionsById: { [definition.id]: definition },
      occurrencesById: Object.fromEntries(original.map((item) => [item.id, item])),
    };
    const updated = applyChoreWorkspaceAction({
      commandId: 'change-rotation',
      action: {
        type: 'definition_update',
        actorParticipantId: 'alice',
        definition: {
          ...definition,
          assignment: { ...definition.assignment, rotationCadence: 'weekly' },
        },
      },
      timestamp: '2026-10-05T08:00:00.000Z',
      workspace,
    });
    expect(updated.data.occurrencesById[overdue.id]).toEqual(overdue);
    expect(Object.keys(updated.data.occurrencesById)).toHaveLength(1);
    const materialized = applyChoreWorkspaceAction({
      commandId: 'rematerialize',
      action: {
        type: 'materialize_occurrences',
        rangeStart: '2026-10-04T00:00:00.000Z',
        rangeEnd: '2026-10-07T00:00:00.000Z',
      },
      timestamp: '2026-10-05T08:00:00.000Z',
      workspace: updated.data,
    });
    const values = Object.values(materialized.data.occurrencesById);
    expect(values.filter((item) => item.scheduledAt === overdue.scheduledAt)).toEqual([overdue]);
    expect(values).toHaveLength(3);
    expect(
      materialized.additionalActivities?.filter((item) => item.occurrenceId === overdue.id)
    ).toEqual([]);
  });

  it('still materializes every participant when a past scheduled time is new', () => {
    const definition = makeDefinition({
      assignment: { mode: 'everyone', participantIds: ['alice', 'bob'] },
      schedule: { frequency: 'once', date: '2026-09-28', time: '18:00', timeZone: 'UTC' },
    });
    const result = applyChoreWorkspaceAction({
      commandId: 'first-materialization',
      action: {
        type: 'materialize_occurrences',
        rangeStart: '2026-09-28T00:00:00.000Z',
        rangeEnd: '2026-09-29T00:00:00.000Z',
      },
      timestamp: '2026-09-29T08:00:00.000Z',
      workspace: {
        ...createEmptyChoreWorkspace(),
        participantsById: { alice, bob },
        definitionsById: { [definition.id]: definition },
      },
    });
    expect(
      Object.values(result.data.occurrencesById)
        .map((item) => item.assignmentSlot)
        .sort()
    ).toEqual(['alice', 'bob']);
  });

  it('adds a missing everyone assignment for a past scheduled time without duplicating the existing one', () => {
    const definition = makeDefinition({
      assignment: { mode: 'everyone', participantIds: ['alice', 'bob'] },
      schedule: { frequency: 'once', date: '2026-09-28', time: '18:00', timeZone: 'UTC' },
    });
    const existing = makeOccurrence({
      id: `${definition.id}:2026-09-28T18:00:00.000Z:alice`,
      scheduledAt: '2026-09-28T18:00:00.000Z',
      dueAt: '2026-09-28T21:00:00.000Z',
    });
    const action = {
      type: 'materialize_occurrences' as const,
      rangeStart: '2026-09-28T00:00:00.000Z',
      rangeEnd: '2026-09-29T00:00:00.000Z',
    };
    const result = applyChoreWorkspaceAction({
      commandId: 'add-bob',
      action,
      timestamp: '2026-09-29T08:00:00.000Z',
      workspace: {
        ...createEmptyChoreWorkspace(),
        participantsById: { alice, bob },
        definitionsById: { [definition.id]: definition },
        occurrencesById: { [existing.id]: existing },
      },
    });
    expect(result.data.occurrencesById[existing.id]).toEqual(existing);
    expect(
      Object.values(result.data.occurrencesById)
        .map((item) => item.assignmentSlot)
        .sort()
    ).toEqual(['alice', 'bob']);
    const repeated = applyChoreWorkspaceAction({
      commandId: 'repeat',
      action,
      timestamp: '2026-09-29T08:00:00.000Z',
      workspace: result.data,
    });
    expect(repeated.data.occurrencesById).toEqual(result.data.occurrencesById);
    expect(repeated.additionalActivities).toEqual([]);
  });

  it('preserves an existing occurrence when a range is materialized again', () => {
    const existing = makeOccurrence({ status: 'done', completedBy: 'alice' });
    const occurrences = materializeChoreOccurrences({
      definition: makeDefinition({
        assignment: { mode: 'person', participantIds: ['alice'] },
        schedule: {
          frequency: 'once',
          date: '2026-08-10',
          time: '18:00',
          timeZone: 'Europe/Stockholm',
        },
      }),
      participantsById: { alice },
      rangeStart: '2026-08-10T00:00:00.000Z',
      rangeEnd: '2026-08-11T00:00:00.000Z',
      existingOccurrences: { [existing.id]: existing },
    });

    expect(occurrences).toEqual([existing]);
  });

  it('keeps timing separate from workflow status', () => {
    const occurrence = makeOccurrence();
    expect(getChoreTiming(occurrence, new Date('2026-08-10T15:00:00.000Z'))).toBe('upcoming');
    expect(getChoreTiming(occurrence, new Date('2026-08-10T17:00:00.000Z'))).toBe('due');
    expect(getChoreTiming(occurrence, new Date('2026-08-10T20:00:00.000Z'))).toBe('overdue');
    expect(
      getChoreTiming({ ...occurrence, status: 'done' }, new Date('2026-08-10T20:00:00.000Z'))
    ).toBe('due');
  });

  it('routes completion through approval when required', () => {
    const definition = makeDefinition({
      assignment: { mode: 'person', participantIds: ['bob'] },
      approval: { required: true, approverIds: ['alice'] },
    });
    const occurrence = makeOccurrence({
      id: 'take-out-recycling:2026-08-10T16:00:00.000Z:bob',
      assigneeIds: ['bob'],
      assignmentSlot: 'bob',
    });

    const completed = applyChoreOccurrenceCommand({
      commandId: 'command-complete',
      command: { type: 'complete', participantId: 'bob' },
      definition,
      occurrence,
      timestamp: '2026-08-10T18:10:00.000Z',
    });
    expect(completed.occurrence.status).toBe('awaiting_approval');

    const approved = applyChoreOccurrenceCommand({
      commandId: 'command-approve',
      command: { type: 'approve', participantId: 'alice' },
      definition,
      occurrence: completed.occurrence,
      timestamp: '2026-08-10T18:15:00.000Z',
    });
    expect(approved.occurrence.status).toBe('done');
    expect(approved.activity.type).toBe('approved');
  });

  it('allows an assigned participant to record a missed chore as completed late', () => {
    const completed = applyChoreOccurrenceCommand({
      commandId: 'command-complete-missed',
      command: { type: 'complete', participantId: 'bob' },
      definition: makeDefinition({
        assignment: { mode: 'person', participantIds: ['bob'] },
        approval: { required: true, approverIds: ['alice'] },
        claimPolicy: { required: true, allowSteal: false },
      }),
      occurrence: makeOccurrence({
        assigneeIds: ['bob'],
        assignmentSlot: 'bob',
        status: 'missed',
        missedAt: '2026-08-10T20:00:00.000Z',
      }),
      timestamp: '2026-08-11T08:00:00.000Z',
    });

    expect(completed.occurrence).toMatchObject({
      status: 'awaiting_approval',
      completedBy: 'bob',
      completedAt: '2026-08-11T08:00:00.000Z',
    });
    expect(completed.occurrence.missedAt).toBeUndefined();
    expect(completed.activity.type).toBe('completed');
  });

  it('does not let another participant complete a claimed occurrence', () => {
    expect(() =>
      applyChoreOccurrenceCommand({
        commandId: 'command-complete',
        command: { type: 'complete', participantId: 'bob' },
        definition: makeDefinition({
          assignment: { mode: 'anyone', participantIds: ['alice', 'bob'] },
        }),
        occurrence: makeOccurrence({
          assigneeIds: ['alice', 'bob'],
          assignmentSlot: 'shared',
          status: 'claimed',
          claimedBy: 'alice',
        }),
        timestamp: '2026-08-10T18:15:00.000Z',
      })
    ).toThrow('claimant');
  });

  it('enforces required claims and permits configured claim expiry takeover', () => {
    const definition = makeDefinition({
      assignment: { mode: 'anyone', participantIds: ['alice', 'bob'] },
      claimPolicy: { required: true, allowSteal: true, expiresAfterMinutes: 30 },
    });
    const occurrence = makeOccurrence({
      assigneeIds: ['alice', 'bob'],
      assignmentSlot: 'shared',
    });

    expect(() =>
      applyChoreOccurrenceCommand({
        commandId: 'complete-unclaimed',
        command: { type: 'complete', participantId: 'alice' },
        definition,
        occurrence,
        timestamp: '2026-08-10T18:00:00.000Z',
      })
    ).toThrow('claimed');

    const claimed = applyChoreOccurrenceCommand({
      commandId: 'claim-alice',
      command: { type: 'claim', participantId: 'alice' },
      definition,
      occurrence,
      timestamp: '2026-08-10T18:00:00.000Z',
    });
    const takenOver = applyChoreOccurrenceCommand({
      commandId: 'claim-bob',
      command: { type: 'claim', participantId: 'bob' },
      definition,
      occurrence: claimed.occurrence,
      timestamp: '2026-08-10T18:31:00.000Z',
    });
    expect(takenOver.occurrence).toMatchObject({ claimedBy: 'bob', status: 'claimed' });
  });

  it('marks missed work and carries it forward exactly once', () => {
    const definition = makeDefinition({
      assignment: { mode: 'person', participantIds: ['alice'] },
      missedPolicy: { graceMinutes: 30, action: 'carry_forward', carryForwardDays: 2 },
    });
    const occurrence = makeOccurrence();
    const workspace = {
      ...createEmptyChoreWorkspace(),
      participantsById: { alice },
      definitionsById: { [definition.id]: definition },
      occurrencesById: { [occurrence.id]: occurrence },
    };
    const result = runChoreWorkspaceScheduler(workspace, '2026-08-10T20:00:00.000Z');
    const original = result.data.occurrencesById[occurrence.id];
    const carried = Object.values(result.data.occurrencesById).find(
      (candidate) => candidate.carriedForwardFrom === occurrence.id
    );

    expect(original).toMatchObject({ status: 'missed', missedAt: '2026-08-10T20:00:00.000Z' });
    expect(carried).toMatchObject({
      scheduledAt: '2026-08-12T16:00:00.000Z',
      dueAt: '2026-08-12T19:00:00.000Z',
      status: 'available',
    });
    expect(result.activities.map((activity) => activity.type)).toEqual([
      'due',
      'overdue',
      'missed',
      'occurrence_created',
    ]);
    expect(
      runChoreWorkspaceScheduler(result.data, '2026-08-10T20:05:00.000Z', {
        existingEventIds: new Set(result.activities.map((activity) => activity.id)),
      }).activities
    ).toEqual([]);
  });

  it('schedules deduplicated reminders, defers quiet hours, and supports acknowledgement', () => {
    const remindedAlice: ChoreParticipant = {
      ...alice,
      reminderPreferences: {
        enabled: true,
        quietHours: { start: '21:00', end: '07:00', timeZone: 'Europe/Stockholm' },
        destination: { type: 'provider', target: 'mobile_app_alice' },
      },
    };
    const definition = makeDefinition({
      assignment: { mode: 'person', participantIds: ['alice'] },
      reminderPolicy: {
        enabled: true,
        beforeDueMinutes: [60],
        atDue: true,
        overdueEveryMinutes: 30,
        maxOverdueReminders: 2,
      },
    });
    const occurrence = makeOccurrence({ dueAt: '2026-08-10T21:00:00.000Z' });
    const workspace = {
      ...createEmptyChoreWorkspace(),
      participantsById: { alice: remindedAlice },
      definitionsById: { [definition.id]: definition },
      occurrencesById: { [occurrence.id]: occurrence },
    };

    const beforeDue = runChoreWorkspaceScheduler(workspace, '2026-08-10T20:15:00.000Z');
    expect(beforeDue.outboxItems).toEqual([
      expect.objectContaining({
        eventType: 'reminder_before_due',
        participantId: 'alice',
        destination: 'provider',
        destinationTarget: 'mobile_app_alice',
        nextAttemptAt: '2026-08-11T05:00:00.000Z',
      }),
    ]);

    const persisted = {
      ...beforeDue.data,
      outbox: [...beforeDue.data.outbox, ...beforeDue.outboxItems],
    };
    expect(runChoreWorkspaceScheduler(persisted, '2026-08-10T20:20:00.000Z').outboxItems).toEqual(
      []
    );

    const acknowledged = applyChoreWorkspaceAction({
      commandId: 'ack-reminder',
      action: {
        type: 'reminder_acknowledge',
        outboxId: persisted.outbox[0].id,
        actorParticipantId: 'alice',
      },
      timestamp: '2026-08-10T20:30:00.000Z',
      workspace: persisted,
    });
    expect(acknowledged.data.outbox[0]).toMatchObject({
      status: 'delivered',
      deliveredAt: '2026-08-10T20:30:00.000Z',
    });
    expect(acknowledged.activity).toMatchObject({
      type: 'reminder_acknowledged',
      outboxId: persisted.outbox[0].id,
    });
  });

  it('records retryable outbox delivery outcomes without creating another delivery item', () => {
    const workspace = {
      ...createEmptyChoreWorkspace(),
      outbox: [
        {
          id: 'outbox:reminder:due:occurrence:alice',
          activityId: 'scheduler:due:occurrence',
          eventType: 'reminder_due' as const,
          status: 'pending' as const,
          attempts: 0,
          createdAt: '2026-08-10T18:00:00.000Z',
          nextAttemptAt: '2026-08-10T18:00:00.000Z',
          occurrenceId: 'occurrence',
          participantId: 'alice',
          destination: 'home_assistant' as const,
        },
      ],
    };
    const failed = applyChoreWorkspaceAction({
      commandId: 'delivery-failed',
      action: {
        type: 'outbox_delivery_update',
        outboxId: workspace.outbox[0].id,
        status: 'failed',
        error: 'Home Assistant is offline',
      },
      timestamp: '2026-08-10T18:01:00.000Z',
      workspace,
    });
    expect(failed.data.outbox).toHaveLength(1);
    expect(failed.data.outbox[0]).toMatchObject({
      status: 'failed',
      attempts: 1,
      lastError: 'Home Assistant is offline',
      nextAttemptAt: '2026-08-10T18:02:00.000Z',
    });
    expect(failed.activity).toMatchObject({
      type: 'outbox_delivery_updated',
      outboxId: workspace.outbox[0].id,
    });
  });

  it('applies actions through the workspace control boundary', () => {
    const definition = makeDefinition({
      assignment: { mode: 'person', participantIds: ['bob'] },
      approval: { required: true, approverIds: ['alice'] },
    });
    const occurrence = makeOccurrence({ assigneeIds: ['bob'], assignmentSlot: 'bob' });
    const workspace = {
      ...createEmptyChoreWorkspace(),
      participantsById: { alice, bob },
      definitionsById: { [definition.id]: definition },
      occurrencesById: { [occurrence.id]: occurrence },
    };

    const completed = applyChoreWorkspaceOccurrenceCommand({
      commandId: 'command-workspace-complete',
      command: { type: 'complete', participantId: 'bob' },
      occurrenceId: occurrence.id,
      timestamp: '2026-08-10T18:10:00.000Z',
      workspace,
    });

    expect(completed.occurrence.status).toBe('awaiting_approval');
    expect(completed.data.occurrencesById[occurrence.id]).toBe(completed.occurrence);
    expect(completed.data.activity).toEqual([]);

    const approved = applyChoreWorkspaceOccurrenceCommand({
      commandId: 'command-workspace-approve',
      command: { type: 'approve', participantId: 'alice' },
      occurrenceId: occurrence.id,
      timestamp: '2026-08-10T18:15:00.000Z',
      workspace: completed.data,
    });

    expect(approved.occurrence.status).toBe('done');
    expect(approved.activity).toMatchObject({
      actorParticipantId: 'alice',
      type: 'approved',
    });
  });

  it('rejects paused or under-privileged actors at the workspace boundary', () => {
    const definition = makeDefinition({
      assignment: { mode: 'person', participantIds: ['bob'] },
      approval: { required: true, approverIds: ['bob'] },
    });
    const occurrence = makeOccurrence({
      assigneeIds: ['bob'],
      assignmentSlot: 'bob',
      status: 'awaiting_approval',
      completedBy: 'bob',
      completedAt: '2026-08-10T18:10:00.000Z',
    });
    const workspace = {
      ...createEmptyChoreWorkspace(),
      participantsById: { bob },
      definitionsById: { [definition.id]: definition },
      occurrencesById: { [occurrence.id]: occurrence },
    };

    expect(() =>
      applyChoreWorkspaceOccurrenceCommand({
        commandId: 'command-unprivileged-approve',
        command: { type: 'approve', participantId: 'bob' },
        occurrenceId: occurrence.id,
        timestamp: '2026-08-10T18:15:00.000Z',
        workspace,
      })
    ).toThrow('cannot approve');

    expect(() =>
      applyChoreWorkspaceOccurrenceCommand({
        commandId: 'command-paused-complete',
        command: { type: 'complete', participantId: 'bob' },
        occurrenceId: occurrence.id,
        timestamp: '2026-08-10T18:15:00.000Z',
        workspace: {
          ...workspace,
          participantsById: {
            bob: { ...bob, pausedAt: '2026-08-10T18:14:00.000Z' },
          },
        },
      })
    ).toThrow('not active');
  });

  it('requires a manager reason for skip, reopen, and reassignment actions', () => {
    const definition = makeDefinition({
      assignment: { mode: 'person', participantIds: ['bob'] },
    });
    const occurrence = makeOccurrence({ assigneeIds: ['bob'], assignmentSlot: 'bob' });
    const workspace = {
      ...createEmptyChoreWorkspace(),
      participantsById: { alice, bob },
      definitionsById: { [definition.id]: definition },
      occurrencesById: { [occurrence.id]: occurrence },
    };

    expect(() =>
      applyChoreWorkspaceOccurrenceCommand({
        commandId: 'command-bob-skip',
        command: { type: 'skip', participantId: 'bob', reason: 'Away' },
        occurrenceId: occurrence.id,
        timestamp: '2026-08-10T18:15:00.000Z',
        workspace,
      })
    ).toThrow('cannot skip');

    expect(() =>
      applyChoreWorkspaceOccurrenceCommand({
        commandId: 'command-empty-reason',
        command: { type: 'skip', participantId: 'alice', reason: ' ' },
        occurrenceId: occurrence.id,
        timestamp: '2026-08-10T18:15:00.000Z',
        workspace,
      })
    ).toThrow('requires a reason');

    const reassigned = applyChoreWorkspaceOccurrenceCommand({
      commandId: 'command-reassign',
      command: {
        type: 'reassign',
        participantId: 'alice',
        assigneeIds: ['alice'],
        reason: 'Bob is away',
      },
      occurrenceId: occurrence.id,
      timestamp: '2026-08-10T18:15:00.000Z',
      workspace,
    });

    expect(reassigned.occurrence).toMatchObject({
      assigneeIds: ['alice'],
      assignmentSlot: 'manager:alice',
      status: 'available',
    });
    expect(reassigned.activity).toMatchObject({
      type: 'reassigned',
      reason: 'Bob is away',
      previousAssigneeIds: ['bob'],
      assigneeIds: ['alice'],
    });
  });

  it('allows a manager to override an approval only with an audited reason', () => {
    const definition = makeDefinition({
      assignment: { mode: 'person', participantIds: ['bob'] },
      approval: { required: true, approverIds: ['bob'] },
    });
    const occurrence = makeOccurrence({
      assigneeIds: ['bob'],
      assignmentSlot: 'bob',
      status: 'awaiting_approval',
      completedBy: 'bob',
      completedAt: '2026-08-10T18:10:00.000Z',
    });
    const workspace = {
      ...createEmptyChoreWorkspace(),
      participantsById: { alice, bob },
      definitionsById: { [definition.id]: definition },
      occurrencesById: { [occurrence.id]: occurrence },
    };

    expect(() =>
      applyChoreWorkspaceOccurrenceCommand({
        commandId: 'manager-approve-without-reason',
        command: {
          type: 'approve',
          participantId: 'alice',
          managerOverride: true,
        },
        occurrenceId: occurrence.id,
        timestamp: '2026-08-10T18:15:00.000Z',
        workspace,
      })
    ).toThrow('requires a reason');

    const approved = applyChoreWorkspaceOccurrenceCommand({
      commandId: 'manager-approve',
      command: {
        type: 'approve',
        participantId: 'alice',
        managerOverride: true,
        reason: 'Verified in person',
      },
      occurrenceId: occurrence.id,
      timestamp: '2026-08-10T18:15:00.000Z',
      workspace,
    });
    expect(approved.occurrence.status).toBe('done');
    expect(approved.activity.reason).toBe('Verified in person');
  });

  it('rejects malformed optional occurrence fields in persisted data', () => {
    const occurrence = makeOccurrence();
    expect(
      isChoreWorkspaceData({
        ...createEmptyChoreWorkspace(),
        occurrencesById: {
          [occurrence.id]: { ...occurrence, completedAt: 'not-a-date' },
        },
      })
    ).toBe(false);
  });

  it('applies profile, definition, materialization, and archive actions through manager policy', () => {
    const createdManager = applyChoreWorkspaceAction({
      commandId: 'create-alice',
      action: { type: 'participant_create', participant: alice },
      timestamp: '2026-08-01T08:00:00.000Z',
      workspace: createEmptyChoreWorkspace(),
    });
    const createdBob = applyChoreWorkspaceAction({
      commandId: 'create-bob',
      action: {
        type: 'participant_create',
        participant: bob,
        actorParticipantId: 'alice',
      },
      timestamp: '2026-08-01T08:01:00.000Z',
      workspace: createdManager.data,
    });
    const definition = makeDefinition({
      assignment: { mode: 'person', participantIds: ['bob'] },
    });
    const createdDefinition = applyChoreWorkspaceAction({
      commandId: 'create-definition',
      action: { type: 'definition_create', definition, actorParticipantId: 'alice' },
      timestamp: '2026-08-01T08:02:00.000Z',
      workspace: createdBob.data,
    });
    const occurrence = makeOccurrence({
      id: 'take-out-recycling:2026-08-10T16:00:00.000Z:bob',
      assigneeIds: ['bob'],
      assignmentSlot: 'bob',
    });
    const materialized = applyChoreWorkspaceAction({
      commandId: 'materialize',
      action: {
        type: 'materialize_occurrences',
        rangeStart: '2026-08-10T00:00:00.000Z',
        rangeEnd: '2026-08-11T00:00:00.000Z',
      },
      timestamp: '2026-08-01T08:03:00.000Z',
      workspace: createdDefinition.data,
    });
    const archived = applyChoreWorkspaceAction({
      commandId: 'archive-definition',
      action: {
        type: 'definition_archive',
        definitionId: definition.id,
        actorParticipantId: 'alice',
      },
      timestamp: '2026-08-01T08:04:00.000Z',
      workspace: materialized.data,
    });

    expect(createdBob.data.participantsById.bob).toEqual(bob);
    expect(createdDefinition.data.definitionsById[definition.id]).toEqual(definition);
    expect(materialized.data.occurrencesById[occurrence.id]).toEqual(occurrence);
    expect(archived.data.definitionsById[definition.id]).toMatchObject({
      enabled: false,
      archivedAt: '2026-08-01T08:04:00.000Z',
    });
    expect(archived.data.occurrencesById[occurrence.id]).toBeUndefined();
  });

  it('requires a manager for household configuration actions', () => {
    const workspace = {
      ...createEmptyChoreWorkspace(),
      participantsById: { alice, bob },
    };
    expect(() =>
      applyChoreWorkspaceAction({
        commandId: 'create-definition',
        action: {
          type: 'definition_create',
          definition: makeDefinition(),
          actorParticipantId: 'bob',
        },
        timestamp: '2026-08-01T08:00:00.000Z',
        workspace,
      })
    ).toThrow('Only a household manager');

    const updated = applyChoreWorkspaceAction({
      commandId: 'retention',
      action: {
        type: 'retention_update',
        actorParticipantId: 'alice',
        policy: { maxAgeDays: 365, maxEvents: 10_000 },
      },
      timestamp: '2026-08-01T08:00:00.000Z',
      workspace,
    });
    expect(updated.data.historyRetention).toEqual({ maxAgeDays: 365, maxEvents: 10_000 });
    expect(updated.activity.type).toBe('retention_updated');
  });

  it('deletes a chore and its live dependent data while retaining immutable activity', () => {
    const definition = makeDefinition();
    const occurrence = makeOccurrence();
    const priorActivity = {
      id: 'activity:completed',
      commandId: 'completed',
      occurrenceId: occurrence.id,
      definitionId: definition.id,
      type: 'completed' as const,
      timestamp: '2026-08-10T19:00:00.000Z',
    };
    const workspace = {
      ...createEmptyChoreWorkspace(),
      participantsById: { alice, bob },
      definitionsById: { [definition.id]: definition },
      occurrencesById: { [occurrence.id]: occurrence },
      activity: [priorActivity],
      outbox: [createChoreOutboxItem(priorActivity)],
      experience: {
        ...createChoreExperienceState(),
        presentationByDefinitionId: { [definition.id]: { points: 10 } },
        missionsById: {
          reset: {
            id: 'reset',
            title: 'Weekend reset',
            definitionIds: [definition.id],
            status: 'active' as const,
            createdAt: '2026-08-01T08:00:00.000Z',
            updatedAt: '2026-08-01T08:00:00.000Z',
          },
        },
        awardedMissionIds: ['reset'],
      },
    };

    const deleted = applyChoreWorkspaceAction({
      commandId: 'delete-definition',
      action: {
        type: 'definition_delete',
        definitionId: definition.id,
        actorParticipantId: 'alice',
      },
      timestamp: '2026-08-11T08:00:00.000Z',
      workspace,
    });

    expect(deleted.activity).toMatchObject({
      type: 'definition_deleted',
      definitionId: definition.id,
    });
    expect(deleted.data.definitionsById).toEqual({});
    expect(deleted.data.occurrencesById).toEqual({});
    expect(deleted.data.outbox).toEqual([]);
    const deletedExperience = deleted.data.experience;
    expect(deletedExperience).toBeDefined();
    if (!deletedExperience) throw new Error('Expected deletion to retain chore experience state');
    expect(deletedExperience.presentationByDefinitionId).toEqual({});
    expect(deletedExperience.missionsById).toEqual({});
    expect(deletedExperience.awardedMissionIds).toEqual([]);
    expect(deleted.data.activity).toEqual([priorActivity]);
  });

  it('updates versioned experience data through manager policy and validates references', () => {
    const definition = makeDefinition();
    const workspace = {
      ...createEmptyChoreWorkspace(),
      participantsById: { alice, bob },
      definitionsById: { [definition.id]: definition },
    };
    const experience = {
      ...createChoreExperienceState(),
      gamificationMode: 'family' as const,
      presentationByDefinitionId: {
        [definition.id]: { estimatedMinutes: 5, points: 10 },
      },
      missionsById: {
        reset: {
          id: 'reset',
          title: 'Weekend reset',
          definitionIds: [definition.id],
          status: 'active' as const,
          createdAt: '2026-08-01T08:00:00.000Z',
          updatedAt: '2026-08-01T08:00:00.000Z',
        },
      },
      rewardGoalsById: {
        outing: {
          id: 'outing',
          title: 'Family outing',
          type: 'family' as const,
          targetPoints: 200,
          participantId: 'bob',
          enabled: true,
          createdAt: '2026-08-01T08:00:00.000Z',
          updatedAt: '2026-08-01T08:00:00.000Z',
        },
      },
    };

    const updated = applyChoreWorkspaceAction({
      commandId: 'update-experience',
      action: { type: 'experience_update', actorParticipantId: 'alice', experience },
      timestamp: '2026-08-01T09:00:00.000Z',
      workspace,
    });

    expect(updated.data.experience).toEqual(experience);
    expect(updated.activity.type).toBe('experience_updated');
    expect(() =>
      applyChoreWorkspaceAction({
        commandId: 'invalid-experience',
        action: {
          type: 'experience_update',
          actorParticipantId: 'alice',
          experience: {
            ...experience,
            presentationByDefinitionId: { missing: { points: 5 } },
          },
        },
        timestamp: '2026-08-01T09:01:00.000Z',
        workspace,
      })
    ).toThrow('unavailable chore');
  });

  it('requests rewards without spending and records one spend or refund per reviewed request', () => {
    const experience = createChoreExperienceState();
    experience.gamificationMode = 'family';
    experience.earnedPointsByParticipant = { bob: 100 };
    experience.rewardGoalsById.movie = {
      id: 'movie',
      title: 'Movie',
      type: 'instant',
      targetPoints: 40,
      enabled: true,
      createdAt: '2026-08-01T08:00:00.000Z',
      updatedAt: '2026-08-01T08:00:00.000Z',
    };
    const initial = {
      ...createEmptyChoreWorkspace(),
      participantsById: { alice, bob },
      experience,
    };
    const apply = (
      workspace: ChoreWorkspaceData,
      commandId: string,
      action: Parameters<typeof applyChoreWorkspaceAction>[0]['action']
    ) =>
      applyChoreWorkspaceAction({
        workspace,
        commandId,
        action,
        timestamp: '2026-08-01T09:00:00.000Z',
      }).data;
    const requested = apply(initial, 'request-1', {
      type: 'reward_request',
      requestId: 'r1',
      rewardId: 'movie',
      participantId: 'bob',
    });
    expect(requested.experience?.earnedPointsByParticipant?.bob).toBe(100);
    expect(requested.experience?.pointTransactions).toEqual([]);
    const approved = apply(requested, 'approve-1', {
      type: 'reward_decision',
      requestId: 'r1',
      actorParticipantId: 'alice',
      decision: 'approve',
    });
    expect(approved.experience?.earnedPointsByParticipant?.bob).toBe(60);
    expect(approved.experience?.pointTransactions).toMatchObject([
      { id: 'points:reward:r1:approve', pointsDelta: -40, kind: 'reward' },
    ]);
    expect(() =>
      apply(approved, 'approve-again', {
        type: 'reward_decision',
        requestId: 'r1',
        actorParticipantId: 'alice',
        decision: 'approve',
      })
    ).toThrow('already changed');
    const fulfilled = apply(approved, 'fulfill-1', {
      type: 'reward_decision',
      requestId: 'r1',
      actorParticipantId: 'alice',
      decision: 'fulfill',
    });
    const refunded = apply(fulfilled, 'refund-1', {
      type: 'reward_decision',
      requestId: 'r1',
      actorParticipantId: 'alice',
      decision: 'refund',
    });
    expect(refunded.experience?.earnedPointsByParticipant?.bob).toBe(100);
    expect(refunded.experience?.pointTransactions).toHaveLength(3);
    const second = apply(refunded, 'request-2', {
      type: 'reward_request',
      requestId: 'r2',
      rewardId: 'movie',
      participantId: 'bob',
    });
    const declined = apply(second, 'decline-2', {
      type: 'reward_decision',
      requestId: 'r2',
      actorParticipantId: 'alice',
      decision: 'decline',
    });
    expect(declined.experience?.earnedPointsByParticipant?.bob).toBe(100);
    expect(declined.experience?.pointTransactions).toHaveLength(4);
  });

  it('persists earned points across occurrence retention and reverses reopened work', () => {
    const definition = makeDefinition({
      assignment: { mode: 'person', participantIds: ['bob'] },
    });
    const occurrence = makeOccurrence({ assigneeIds: ['bob'], assignmentSlot: 'bob' });
    const experience = createEmptyChoreWorkspace().experience;
    if (!experience) throw new Error('Expected chore experience');
    const workspace = {
      ...createEmptyChoreWorkspace(),
      participantsById: { alice, bob },
      definitionsById: { [definition.id]: definition },
      occurrencesById: { [occurrence.id]: occurrence },
      experience: {
        ...experience,
        gamificationMode: 'family' as const,
        presentationByDefinitionId: { [definition.id]: { points: 15 } },
        missionsById: {
          reset: {
            id: 'reset',
            title: 'One-chore reset',
            definitionIds: [definition.id],
            status: 'active' as const,
            rewardPoints: 50,
            createdAt: '2026-08-01T08:00:00.000Z',
            updatedAt: '2026-08-01T08:00:00.000Z',
          },
        },
      },
    };

    const completed = applyChoreWorkspaceAction({
      commandId: 'complete-for-points',
      action: {
        type: 'occurrence_action',
        occurrenceId: occurrence.id,
        action: { type: 'complete', participantId: 'bob' },
      },
      timestamp: '2026-08-10T17:00:00.000Z',
      workspace,
    });
    expect(completed.data.experience?.earnedPointsByParticipant).toEqual({ bob: 15 });
    expect(completed.activity).toMatchObject({ participantId: 'bob', pointsDelta: 15 });
    expect(completed.data.experience).toMatchObject({
      householdBonusPoints: 50,
      awardedMissionIds: ['reset'],
    });

    const reopened = applyChoreWorkspaceAction({
      commandId: 'reopen-points',
      action: {
        type: 'occurrence_action',
        occurrenceId: occurrence.id,
        action: { type: 'reopen', participantId: 'alice', reason: 'Needs another pass' },
      },
      timestamp: '2026-08-10T17:05:00.000Z',
      workspace: completed.data,
    });
    expect(reopened.data.experience?.earnedPointsByParticipant).toEqual({ bob: 0 });
    expect(reopened.activity).toMatchObject({ participantId: 'bob', pointsDelta: -15 });
    expect(reopened.data.experience?.householdBonusPoints).toBe(50);
  });

  it('lets managers add or remove participant points with an auditable reason', () => {
    const workspace = {
      ...createEmptyChoreWorkspace(),
      participantsById: { alice, bob },
      experience: {
        ...createChoreExperienceState(),
        gamificationMode: 'light' as const,
        earnedPointsByParticipant: { bob: 5 },
      },
    };
    const adjusted = applyChoreWorkspaceAction({
      commandId: 'adjust-bob-points',
      action: {
        type: 'experience_points_adjust',
        actorParticipantId: 'alice',
        participantId: 'bob',
        pointsDelta: -15,
        reason: 'Replaced broken item',
      },
      timestamp: '2026-08-10T18:00:00.000Z',
      workspace,
    });
    expect(adjusted.data.experience?.earnedPointsByParticipant).toEqual({ bob: -10 });
    expect(adjusted.activity).toMatchObject({
      type: 'points_adjusted',
      participantId: 'bob',
      actorParticipantId: 'alice',
      pointsDelta: -15,
      reason: 'Replaced broken item',
    });
  });

  it.each([0, 1.5, 10_001, -10_001])('rejects invalid point adjustment %s', (pointsDelta) => {
    expect(() =>
      applyChoreWorkspaceAction({
        commandId: `invalid-adjustment-${pointsDelta}`,
        action: {
          type: 'experience_points_adjust',
          actorParticipantId: 'alice',
          participantId: 'bob',
          pointsDelta,
          reason: 'Invalid',
        },
        timestamp: '2026-08-10T18:00:00.000Z',
        workspace: { ...createEmptyChoreWorkspace(), participantsById: { alice, bob } },
      })
    ).toThrow('non-zero whole number');
  });

  it('rejects point adjustments without a manager or participant', () => {
    const workspace = { ...createEmptyChoreWorkspace(), participantsById: { alice, bob } };
    const action = {
      type: 'experience_points_adjust' as const,
      actorParticipantId: 'alice',
      participantId: 'bob',
      pointsDelta: 5,
      reason: 'Bonus',
    };
    expect(() =>
      applyChoreWorkspaceAction({
        commandId: 'non-manager-adjustment',
        action: { ...action, actorParticipantId: 'bob' },
        timestamp: '2026-08-10T18:00:00.000Z',
        workspace,
      })
    ).toThrow('manager');
    expect(() =>
      applyChoreWorkspaceAction({
        commandId: 'missing-person-adjustment',
        action: { ...action, participantId: 'missing' },
        timestamp: '2026-08-10T18:00:00.000Z',
        workspace,
      })
    ).toThrow('no longer available');
  });

  it('allows point adjustments without a reason', () => {
    const adjusted = applyChoreWorkspaceAction({
      commandId: 'adjustment-without-reason',
      action: {
        type: 'experience_points_adjust',
        actorParticipantId: 'alice',
        participantId: 'bob',
        pointsDelta: 5,
      },
      timestamp: '2026-08-10T18:00:00.000Z',
      workspace: { ...createEmptyChoreWorkspace(), participantsById: { alice, bob } },
    });
    expect(adjusted.data.experience?.earnedPointsByParticipant).toEqual({ bob: 5 });
    expect(adjusted.activity).toMatchObject({
      type: 'points_adjusted',
      participantId: 'bob',
      pointsDelta: 5,
    });
    expect(adjusted.activity.reason).toBeUndefined();
  });
});

describe('completion-based recurrence updates', () => {
  it.each([
    [14, '2026-10-18T16:00:00.000Z', '2026-10-19T16:00:00.000Z'],
    [365, '2027-10-04T16:00:00.000Z', '2027-10-05T16:00:00.000Z'],
    [3650, '2036-10-01T16:00:00.000Z', '2036-10-02T16:00:00.000Z'],
  ])(
    'persists and reconciles the next occurrence for a %i-day completion interval',
    (intervalDays, nextDate, repeatedDate) => {
      const definition = makeDefinition({
        assignment: { mode: 'person', participantIds: ['alice'] },
        schedule: {
          frequency: 'after_completion',
          startDate: '2026-10-08',
          time: '18:00',
          timeZone: 'Europe/Stockholm',
          intervalDays,
        },
      });
      const occurrence = materializeChoreOccurrences({
        definition,
        participantsById: { alice },
        rangeStart: '2026-10-01T00:00:00.000Z',
        rangeEnd: '2026-11-01T00:00:00.000Z',
      })[0];
      const workspace = {
        ...createEmptyChoreWorkspace(),
        participantsById: { alice },
        definitionsById: { [definition.id]: definition },
        occurrencesById: { [occurrence.id]: occurrence },
      };
      const result = applyChoreWorkspaceAction({
        workspace,
        commandId: 'early-completion',
        timestamp: '2026-10-04T10:00:00.000Z',
        action: {
          type: 'occurrence_action',
          occurrenceId: occurrence.id,
          action: { type: 'complete', participantId: 'alice' },
        },
      });
      expect(result.data.occurrencesById[occurrence.id].completedAt).toBe(
        '2026-10-04T10:00:00.000Z'
      );
      expect(
        Object.values(result.data.occurrencesById)
          .filter((item) => item.status === 'available')
          .map((item) => item.scheduledAt)
      ).toEqual([nextDate]);
      const reopened = applyChoreWorkspaceAction({
        workspace: result.data,
        commandId: 'reopen-early-completion',
        timestamp: '2026-10-04T11:00:00.000Z',
        action: {
          type: 'occurrence_action',
          occurrenceId: occurrence.id,
          action: { type: 'reopen', participantId: 'alice', reason: 'Completed by mistake' },
        },
      });
      expect(
        Object.values(reopened.data.occurrencesById)
          .filter((item) => item.status === 'available')
          .map((item) => item.scheduledAt)
      ).toEqual(['2026-10-08T16:00:00.000Z']);
      const completedAgain = applyChoreWorkspaceAction({
        workspace: reopened.data,
        commandId: 'complete-again',
        timestamp: '2026-10-05T10:00:00.000Z',
        action: {
          type: 'occurrence_action',
          occurrenceId: occurrence.id,
          action: { type: 'complete', participantId: 'alice' },
        },
      });
      expect(
        Object.values(completedAgain.data.occurrencesById)
          .filter((item) => item.status === 'available')
          .map((item) => item.scheduledAt)
      ).toEqual([repeatedDate]);
    }
  );
});

describe('outstanding chore intervals', () => {
  const timestamp = '2026-10-11T10:00:00.000Z';
  const range = { rangeStart: '2026-07-13T00:00:00.000Z', rangeEnd: '2026-11-25T00:00:00.000Z' };
  function repeatWorkspace(intervalDays = 14, everyone = false) {
    const definition = makeDefinition({
      assignment: {
        mode: everyone ? 'everyone' : 'person',
        participantIds: everyone ? ['alice', 'bob'] : ['alice'],
      },
      schedule: {
        frequency: 'after_completion',
        startDate: '2026-01-01',
        time: '18:00',
        timeZone: 'UTC',
        intervalDays,
      },
      missedPolicy: { graceMinutes: 0, action: 'carry_forward' },
    });
    const first = makeOccurrence({
      id: 'old-alice',
      scheduledAt: '2026-01-01T18:00:00.000Z',
      dueAt: '2026-01-01T19:00:00.000Z',
      status: 'missed',
      missedAt: '2026-01-02T00:00:00.000Z',
    });
    const second = { ...first, id: 'old-bob', assignmentSlot: 'bob', assigneeIds: ['bob'] };
    return {
      ...createEmptyChoreWorkspace(),
      participantsById: { alice, bob },
      definitionsById: { [definition.id]: definition },
      occurrencesById: everyone
        ? { [first.id]: first, [second.id]: second }
        : { [first.id]: first },
    };
  }
  it.each(['interval', 'time', 'assignment'] as const)(
    'preserves the started after-completion interval when its %s changes',
    (change) => {
      const workspace = repeatWorkspace();
      const completed = applyChoreWorkspaceAction({
        workspace,
        timestamp,
        commandId: 'complete-anchor',
        action: {
          type: 'occurrence_action',
          occurrenceId: 'old-alice',
          action: { type: 'complete', participantId: 'alice' },
        },
      }).data;
      const outstanding = Object.values(completed.occurrencesById).find(
        (item) => !item.completedAt
      );
      expect(outstanding?.scheduledAt).toBe('2026-10-25T18:00:00.000Z');
      const definition = completed.definitionsById['take-out-recycling'];
      const edited = applyChoreWorkspaceAction({
        workspace: completed,
        timestamp: '2026-10-26T10:00:00.000Z',
        commandId: 'edit-repeat',
        action: {
          type: 'definition_update',
          actorParticipantId: 'alice',
          definition: {
            ...definition,
            schedule: {
              ...definition.schedule,
              ...(change === 'interval' ? { intervalDays: 7 } : {}),
              ...(change === 'time' ? { time: '19:00' } : {}),
            },
            assignment:
              change === 'assignment'
                ? { mode: 'person', participantIds: ['bob'] }
                : definition.assignment,
          },
        },
      }).data;
      const refreshed = applyChoreWorkspaceAction({
        workspace: edited,
        timestamp: '2026-10-26T10:00:00.000Z',
        commandId: 'refresh-edited-repeat',
        action: { type: 'materialize_occurrences', ...range },
      }).data;
      expect(Object.values(refreshed.occurrencesById).filter((item) => !item.completedAt)).toEqual([
        outstanding,
      ]);
    }
  );
  it.each(['none', 'skip', 'carry_forward'] as const)(
    'keeps after-completion work actionable despite automatic %s policy',
    (action) => {
      const workspace = repeatWorkspace();
      workspace.definitionsById['take-out-recycling'].missedPolicy = { graceMinutes: 0, action };
      workspace.occurrencesById['old-alice'].status = 'available';
      const scheduled = runChoreWorkspaceScheduler(workspace, timestamp);
      expect(scheduled.data.occurrencesById).toEqual(workspace.occurrencesById);
      const result = applyChoreWorkspaceAction({
        workspace,
        timestamp,
        commandId: 'refresh',
        action: { type: 'materialize_occurrences', ...range },
      });
      expect(
        Object.values(result.data.occurrencesById).filter((item) => !item.completedAt)
      ).toEqual([workspace.occurrencesById['old-alice']]);
    }
  );
  it.each([14, 365])(
    'retains the completion anchor and next interval for an old chore (%i days)',
    (intervalDays) => {
      const workspace = repeatWorkspace(intervalDays);
      const result = applyChoreWorkspaceAction({
        workspace,
        timestamp,
        commandId: 'late-complete',
        action: {
          type: 'occurrence_action',
          occurrenceId: 'old-alice',
          action: { type: 'complete', participantId: 'alice' },
        },
      });
      expect(result.data.occurrencesById['old-alice']).toMatchObject({
        status: 'done',
        completedAt: timestamp,
      });
      const expected =
        intervalDays === 14 ? '2026-10-25T18:00:00.000Z' : '2027-10-11T18:00:00.000Z';
      expect(
        Object.values(result.data.occurrencesById)
          .filter((item) => item.status === 'available')
          .map((item) => item.scheduledAt)
      ).toEqual([expected]);
      const reloaded = applyChoreWorkspaceAction({
        workspace: result.data,
        timestamp,
        commandId: 'reload',
        action: { type: 'materialize_occurrences', ...range },
      });
      expect(reloaded.data.occurrencesById).toEqual(result.data.occurrencesById);
      if (intervalDays === 365) {
        const monthsLater = applyChoreWorkspaceAction({
          workspace: reloaded.data,
          timestamp: '2027-02-01T10:00:00.000Z',
          commandId: 'months-later',
          action: {
            type: 'materialize_occurrences',
            rangeStart: '2026-11-03T00:00:00.000Z',
            rangeEnd: '2027-03-18T00:00:00.000Z',
          },
        });
        expect(monthsLater.data.occurrencesById['old-alice'].completedAt).toBe(timestamp);
      }
    }
  );
  it('starts each everyone interval independently, including approval submissions', () => {
    const workspace = repeatWorkspace(14, true);
    workspace.definitionsById['take-out-recycling'].approval = {
      required: true,
      approverIds: ['alice'],
    };
    const completed = applyChoreWorkspaceAction({
      workspace,
      timestamp,
      commandId: 'alice-submit',
      action: {
        type: 'occurrence_action',
        occurrenceId: 'old-alice',
        action: { type: 'complete', participantId: 'alice' },
      },
    });
    expect(completed.data.occurrencesById['old-alice'].status).toBe('awaiting_approval');
    expect(completed.data.occurrencesById['old-bob']).toEqual(workspace.occurrencesById['old-bob']);
    expect(
      Object.values(completed.data.occurrencesById)
        .filter((item) => item.status === 'available')
        .map((item) => [item.assigneeIds, item.scheduledAt])
    ).toEqual([[['alice'], '2026-10-25T18:00:00.000Z']]);
    const bobCompleted = applyChoreWorkspaceAction({
      workspace: completed.data,
      timestamp: '2026-10-13T10:00:00.000Z',
      commandId: 'bob-submit',
      action: {
        type: 'occurrence_action',
        occurrenceId: 'old-bob',
        action: { type: 'complete', participantId: 'bob' },
      },
    });
    expect(
      Object.values(bobCompleted.data.occurrencesById)
        .filter((item) => item.status === 'available')
        .map((item) => [item.assigneeIds, item.scheduledAt])
    ).toEqual([
      [['alice'], '2026-10-25T18:00:00.000Z'],
      [['bob'], '2026-10-27T18:00:00.000Z'],
    ]);
  });
  it('marks scheduled unfinished work missed only when the next occurrence starts', () => {
    const definition = makeDefinition({ missedPolicy: { graceMinutes: 0, action: 'none' } });
    const previous = makeOccurrence({ status: 'claimed', claimedBy: 'alice' });
    const next = makeOccurrence({
      id: 'next',
      scheduledAt: '2026-08-17T16:00:00.000Z',
      dueAt: '2026-08-17T19:00:00.000Z',
    });
    const submitted = makeOccurrence({
      id: 'submitted',
      scheduledAt: '2026-08-03T16:00:00.000Z',
      status: 'awaiting_approval',
      completedAt: '2026-08-04T10:00:00.000Z',
    });
    const workspace = {
      ...createEmptyChoreWorkspace(),
      participantsById: { alice, bob },
      definitionsById: { [definition.id]: definition },
      occurrencesById: { [previous.id]: previous, next, submitted },
    };
    expect(
      runChoreWorkspaceScheduler(workspace, '2026-08-17T15:59:59.000Z').data.occurrencesById[
        previous.id
      ].status
    ).toBe('claimed');
    const superseded = runChoreWorkspaceScheduler(workspace, next.scheduledAt);
    expect(superseded.data.occurrencesById[previous.id]).toMatchObject({
      status: 'missed',
      claimedBy: 'alice',
      missedAt: next.scheduledAt,
    });
    expect(superseded.data.occurrencesById.submitted).toEqual(submitted);
    expect(
      runChoreWorkspaceScheduler(
        { ...superseded.data, activity: superseded.activities },
        next.scheduledAt
      ).activities
    ).toEqual([]);
    const late = applyChoreWorkspaceAction({
      workspace: superseded.data,
      timestamp: '2026-08-18T10:00:00.000Z',
      commandId: 'history-complete',
      action: {
        type: 'occurrence_action',
        occurrenceId: previous.id,
        action: { type: 'complete', participantId: 'alice' },
      },
    });
    expect(late.data.occurrencesById.next).toEqual(next);
    expect(late.data.occurrencesById[previous.id].status).toBe('done');
  });
});

describe('durable fixed-work supersession', () => {
  function fixture(status: ChoreOccurrence['status'] = 'available'): ChoreWorkspaceData {
    const previous = makeOccurrence({ id: 'older', status });
    const next = makeOccurrence({
      id: 'next',
      scheduledAt: '2026-08-17T16:00:00.000Z',
      dueAt: '2026-08-17T19:00:00.000Z',
      status: 'done',
      completedBy: 'alice',
      completedAt: '2026-08-17T18:00:00.000Z',
      updatedAt: '2026-08-17T18:00:00.000Z',
    });
    return {
      ...createEmptyChoreWorkspace(),
      participantsById: { alice, bob },
      definitionsById: { 'take-out-recycling': makeDefinition() },
      occurrencesById: { older: previous, next },
    };
  }
  it('persists supersession at the fixed scheduler transition and clears it on reopen', () => {
    const result = runChoreWorkspaceScheduler(fixture(), '2026-08-17T18:00:00.000Z').data;
    expect(result.occurrencesById.older).toMatchObject({
      status: 'missed',
      supersededAt: '2026-08-17T16:00:00.000Z',
    });
    const reopened = applyChoreWorkspaceAction({
      workspace: result,
      timestamp: '2026-08-17T18:30:00.000Z',
      commandId: 'reopen-superseded',
      action: {
        type: 'occurrence_action',
        occurrenceId: 'older',
        action: { type: 'reopen', participantId: 'alice', reason: 'Do it again' },
      },
    }).data;
    expect(reopened.occurrencesById.older.status).toBe('available');
    expect(reopened.occurrencesById.older.supersededAt).toBeUndefined();
  });
  it('backfills legacy missed work before its successor is pruned', () => {
    const workspace = fixture('missed');
    const result = applyChoreWorkspaceAction({
      workspace,
      timestamp: '2026-12-01T18:00:00.000Z',
      commandId: 'prune-successor',
      action: {
        type: 'materialize_occurrences',
        rangeStart: '2026-12-01T00:00:00.000Z',
        rangeEnd: '2026-12-01T23:59:59.000Z',
      },
    }).data;
    expect(result.occurrencesById.next).toBeUndefined();
    expect(result.occurrencesById.older).toMatchObject({
      status: 'missed',
      supersededAt: '2026-08-17T16:00:00.000Z',
    });
  });
  it('backfills before changing frequency and keeps historical work out of completion-based clocks', () => {
    const workspace = fixture('missed');
    const definition = workspace.definitionsById['take-out-recycling'];
    const result = applyChoreWorkspaceAction({
      workspace,
      timestamp: '2026-08-18T18:00:00.000Z',
      commandId: 'change-fixed-frequency',
      action: {
        type: 'definition_update',
        actorParticipantId: 'alice',
        definition: {
          ...definition,
          schedule: {
            frequency: 'after_completion',
            startDate: '2026-08-18',
            time: '18:00',
            timeZone: 'UTC',
            intervalDays: 7,
          },
        },
      },
    }).data;
    expect(result.occurrencesById.older).toMatchObject({
      status: 'missed',
      supersededAt: '2026-08-17T16:00:00.000Z',
    });
    expect(
      materializeChoreOccurrences({
        definition: result.definitionsById[definition.id],
        participantsById: result.participantsById,
        existingOccurrences: result.occurrencesById,
        latestCompletedAt: '2026-08-17T18:00:00.000Z',
        rangeStart: '2026-08-18T00:00:00.000Z',
        rangeEnd: '2026-09-01T00:00:00.000Z',
      }).some((item) => item.id === 'older')
    ).toBe(false);
  });
  it('round-trips optional supersession markers and accepts legacy snapshots', () => {
    const legacy = fixture('missed');
    expect(isChoreWorkspaceData(legacy)).toBe(true);
    const marked = runChoreWorkspaceScheduler(fixture(), '2026-08-17T18:00:00.000Z').data;
    const restored = migrateChoreWorkspaceData(JSON.parse(JSON.stringify(marked)));
    expect(restored.occurrencesById.older.supersededAt).toBe('2026-08-17T16:00:00.000Z');
    restored.occurrencesById.older.supersededAt = 'invalid';
    expect(isChoreWorkspaceData(restored)).toBe(false);
  });
  it('keeps early missed completion-based work actionable without supersession evidence', () => {
    const workspace = fixture('missed');
    delete workspace.occurrencesById.next;
    const definition = makeDefinition({
      schedule: {
        frequency: 'after_completion',
        startDate: '2026-08-10',
        time: '18:00',
        timeZone: 'UTC',
        intervalDays: 7,
      },
    });
    workspace.definitionsById[definition.id] = definition;
    const result = applyChoreWorkspaceAction({
      workspace,
      timestamp: '2026-08-11T18:00:00.000Z',
      commandId: 'keep-early-missed',
      action: {
        type: 'materialize_occurrences',
        rangeStart: '2026-08-11T00:00:00.000Z',
        rangeEnd: '2026-08-25T00:00:00.000Z',
      },
    }).data;
    expect(result.occurrencesById.older).toEqual(workspace.occurrencesById.older);
    expect(
      Object.values(result.occurrencesById).filter((item) => item.status === 'available')
    ).toHaveLength(0);
  });
});
