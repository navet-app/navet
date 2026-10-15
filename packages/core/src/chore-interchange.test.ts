import { describe, expect, it } from 'vitest';
import {
  convertChoreOpsChores,
  convertHomeAssistantTodoItems,
  createChoreConfigurationDocument,
  createChoreInterchangeDocument,
  mergeChoreInterchange,
  parseChoreInterchangeDocument,
} from './chore-interchange';
import { type ChoreParticipant, createEmptyChoreWorkspace } from './chores';

const participant: ChoreParticipant = {
  id: 'maya',
  displayName: 'Maya',
  capabilities: ['complete', 'approve', 'manage'],
  createdAt: '2026-08-10T08:00:00.000Z',
  updatedAt: '2026-08-10T08:00:00.000Z',
};

describe('chore interchange', () => {
  it('exports importable configuration without occurrences, delivery work, or earned progress', () => {
    const original = convertChoreOpsChores({
      chores: [
        {
          id: 'plants',
          name: 'Water plants',
          assigneeIds: ['maya'],
          recurring: 'weekly',
          points: 5,
        },
      ],
      participants: [participant],
      timeZone: 'Europe/Stockholm',
    });
    const workspace = original.workspace;
    const definition = Object.values(workspace.definitionsById)[0];
    definition.assignment.rotationCursor = 4;
    definition.reminderPolicy = { enabled: true, atDue: true, beforeDueMinutes: [30] };
    const experience = workspace.experience;
    if (!experience) throw new Error('Expected chore experience settings');
    experience.setupCompletedAt = participant.createdAt;
    experience.gamificationMode = 'family';
    experience.presentationByDefinitionId[definition.id] = {
      icon: 'leaf',
      color: '#00aa00',
      estimatedMinutes: 5,
      points: 5,
    };
    experience.missionsById.garden = {
      id: 'garden',
      title: 'Garden',
      definitionIds: [definition.id],
      status: 'complete',
      createdAt: participant.createdAt,
      updatedAt: participant.updatedAt,
    };
    experience.rewardGoalsById.movie = {
      id: 'movie',
      title: 'Movie',
      type: 'saving',
      targetPoints: 100,
      startingPoints: 10,
      enabled: true,
      createdAt: participant.createdAt,
      updatedAt: participant.updatedAt,
    };
    experience.earnedPointsByParticipant = { maya: 15 };
    experience.householdBonusPoints = 20;
    experience.awardedMissionIds = ['garden'];
    experience.badgesById.water = { id: 'water', title: 'Water', metric: 'count', target: 3 };
    experience.achievementsById.gardener = {
      id: 'gardener',
      title: 'Gardener',
      metric: 'days',
      target: 5,
    };
    experience.progressAwards = [
      {
        id: 'award',
        targetId: 'water',
        participantId: 'maya',
        cycleKey: 'once',
        awardedAt: participant.createdAt,
      },
    ];
    experience.pointTransactions = [
      {
        id: 'earned',
        participantId: 'maya',
        pointsDelta: 15,
        kind: 'completion',
        timestamp: participant.createdAt,
      },
    ];
    experience.pointProgress = { version: 1, totals: { maya: { once: 10 } }, occurrences: {} };
    experience.rewardRequestsById.request = {
      id: 'request',
      rewardId: 'movie',
      rewardTitle: 'Movie',
      cost: 100,
      participantId: 'maya',
      status: 'fulfilled',
      requestedAt: participant.createdAt,
      updatedAt: participant.updatedAt,
    };
    workspace.activity = [
      {
        id: 'completed',
        commandId: 'completion',
        type: 'completed',
        timestamp: participant.createdAt,
      },
    ];
    workspace.occurrencesById.completed = {
      id: 'completed',
      definitionId: definition.id,
      scheduledAt: participant.createdAt,
      dueAt: participant.createdAt,
      assignmentSlot: 'maya',
      assigneeIds: ['maya'],
      status: 'done',
      completedBy: 'maya',
      completedAt: participant.createdAt,
      updatedAt: participant.updatedAt,
    };
    workspace.outbox = [
      {
        id: 'delivery',
        activityId: 'completed',
        eventType: 'completed',
        status: 'pending',
        attempts: 0,
        createdAt: participant.createdAt,
        nextAttemptAt: participant.createdAt,
      },
    ];
    const before = JSON.stringify(workspace);
    const exported = createChoreConfigurationDocument({ workspace });
    const restored = parseChoreInterchangeDocument(JSON.parse(JSON.stringify(exported)));
    expect(restored.events).toEqual([]);
    expect(restored.workspace.occurrencesById).toEqual({});
    expect(restored.workspace.activity).toEqual([]);
    expect(restored.workspace.outbox).toEqual([]);
    expect(restored.workspace.participantsById).toEqual(workspace.participantsById);
    expect(restored.workspace.definitionsById[definition.id]).toEqual({
      ...definition,
      assignment: { ...definition.assignment, rotationCursor: undefined },
    });
    expect(restored.workspace.historyRetention).toEqual(workspace.historyRetention);
    expect(restored.workspace.experience).toMatchObject({
      gamificationMode: 'family',
      presentationByDefinitionId: experience.presentationByDefinitionId,
      badgesById: experience.badgesById,
      achievementsById: experience.achievementsById,
      earnedPointsByParticipant: {},
      householdBonusPoints: 0,
      awardedMissionIds: [],
      progressAwards: [],
      pointTransactions: [],
      rewardRequestsById: {},
    });
    expect(restored.workspace.experience?.pointProgress).toBeUndefined();
    expect(restored.workspace.experience?.missionsById.garden.status).toBe('active');
    expect(restored.workspace.experience?.rewardGoalsById.movie).toEqual({
      ...experience.rewardGoalsById.movie,
      startingPoints: undefined,
    });
    const merged = mergeChoreInterchange({
      current: createEmptyChoreWorkspace(),
      currentEvents: [],
      imported: restored,
      importedAt: restored.workspace.definitionsById[definition.id].updatedAt,
    });
    expect(merged.data.definitionsById[definition.id]).toEqual(
      restored.workspace.definitionsById[definition.id]
    );
    expect(merged.events).toEqual([]);
    expect(JSON.stringify(workspace)).toBe(before);
  });

  it('exports legacy configuration without optional settings and rejects invalid data', () => {
    const workspace = createEmptyChoreWorkspace();
    delete workspace.experience;
    delete workspace.historyRetention;
    expect(
      parseChoreInterchangeDocument(createChoreConfigurationDocument({ workspace })).events
    ).toEqual([]);
    expect(() =>
      createChoreConfigurationDocument({ workspace: { ...workspace, schemaVersion: 99 } as never })
    ).toThrow('Invalid chore workspace export');
  });

  it('rejects a working-state projection as a complete backup', () => {
    const workspace = createEmptyChoreWorkspace();
    if (!workspace.experience) throw new Error('Expected experience');
    workspace.experience.pointProgress = { version: 1, totals: {}, occurrences: {} };
    expect(() => createChoreInterchangeDocument({ workspace, events: [] })).toThrow(
      'Invalid chore workspace export'
    );
    expect(() =>
      parseChoreInterchangeDocument({
        contract: 'navet.chores',
        version: 1,
        exportedAt: '2026-10-14T00:00:00.000Z',
        workspace,
        events: [],
      })
    ).toThrow();
  });

  it('round-trips a versioned backup and rejects unsupported documents', () => {
    const workspace = createEmptyChoreWorkspace();
    workspace.participantsById.maya = participant;
    const document = createChoreInterchangeDocument({
      workspace,
      events: [],
      exportedAt: '2026-08-14T08:00:00.000Z',
    });
    expect(parseChoreInterchangeDocument(JSON.parse(JSON.stringify(document)))).toEqual(document);
    expect(() => parseChoreInterchangeDocument({ ...document, version: 2 })).toThrow(
      'Unsupported chore interchange document'
    );
  });

  it('merges colliding IDs by renaming and remaps every reference without replaying outbox work', () => {
    const current = createEmptyChoreWorkspace();
    current.participantsById.maya = participant;
    const importedWorkspace = createEmptyChoreWorkspace();
    importedWorkspace.participantsById.maya = { ...participant, displayName: 'Other Maya' };
    importedWorkspace.definitionsById.dishes = {
      id: 'dishes',
      title: 'Dishes',
      enabled: true,
      assignment: { mode: 'person', participantIds: ['maya'] },
      schedule: { frequency: 'once', date: '2026-08-15', time: '18:00', timeZone: 'UTC' },
      dueWindowMinutes: 0,
      approval: { required: false, approverIds: [] },
      createdAt: '2026-08-10T08:00:00.000Z',
      updatedAt: '2026-08-10T08:00:00.000Z',
    };
    const imported = createChoreInterchangeDocument({
      workspace: importedWorkspace,
      events: [],
      exportedAt: '2026-08-14T08:00:00.000Z',
    });
    const result = mergeChoreInterchange({
      current,
      currentEvents: [],
      imported,
      importedAt: '2026-08-14T09:00:00.000Z',
    });
    expect(result.collisions).toContainEqual({
      kind: 'participant',
      sourceId: 'maya',
      targetId: 'maya~import-2',
    });
    expect(result.data.definitionsById.dishes.assignment.participantIds).toEqual(['maya~import-2']);
    expect(result.data.outbox).toEqual([]);
  });

  it('converts Home Assistant todo items and normalized ChoreOps exports', () => {
    const todo = convertHomeAssistantTodoItems({
      items: [
        { uid: 'one', summary: 'Buy milk', status: 'completed', due: '2026-08-14T18:00:00.000Z' },
      ],
      participant,
      timeZone: 'Europe/Stockholm',
      importedAt: '2026-08-14T12:00:00.000Z',
    });
    expect(Object.values(todo.workspace.occurrencesById)[0]).toMatchObject({ status: 'done' });
    const choreOps = convertChoreOpsChores({
      chores: [{ id: 'trash', name: 'Take trash out', recurring: 'weekly', assigneeIds: ['maya'] }],
      participants: [participant],
      timeZone: 'UTC',
      importedAt: '2026-08-14T12:00:00.000Z',
    });
    expect(choreOps.workspace.definitionsById['choreops-trash']).toMatchObject({
      title: 'Take trash out',
      schedule: { frequency: 'weekly' },
    });
  });
});
