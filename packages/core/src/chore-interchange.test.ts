import { describe, expect, it } from 'vitest';
import {
  convertChoreOpsChores,
  convertHomeAssistantTodoItems,
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
