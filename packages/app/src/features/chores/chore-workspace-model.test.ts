import {
  type ChoreDefinition,
  type ChoreParticipant,
  createEmptyChoreWorkspace,
} from '@navet/core/chores';
import { describe, expect, it } from 'vitest';
import { materializeChoreWorkspace } from './chore-workspace-model';

describe('chore workspace materialization', () => {
  it('detects and removes a stale available occurrence after a recurrence edit', () => {
    const participant: ChoreParticipant = {
      id: 'alice',
      displayName: 'Alice',
      capabilities: ['complete', 'manage'],
      createdAt: '2026-08-01T08:00:00.000Z',
      updatedAt: '2026-08-01T08:00:00.000Z',
    };
    const definition: ChoreDefinition = {
      id: 'take-out-recycling',
      title: 'Take out recycling',
      enabled: true,
      assignment: { mode: 'person', participantIds: [participant.id] },
      schedule: {
        frequency: 'weekly',
        startDate: '2026-08-27',
        time: '09:00',
        timeZone: 'UTC',
        daysOfWeek: [4],
        intervalWeeks: 2,
      },
      dueWindowMinutes: 180,
      approval: { required: false, approverIds: [] },
      createdAt: '2026-08-01T08:00:00.000Z',
      updatedAt: '2026-08-27T08:00:00.000Z',
    };
    const staleOccurrenceId = `${definition.id}:2026-09-02T09:00:00.000Z:${participant.id}`;
    const workspace = {
      ...createEmptyChoreWorkspace(),
      participantsById: { [participant.id]: participant },
      definitionsById: { [definition.id]: definition },
      occurrencesById: {
        [staleOccurrenceId]: {
          id: staleOccurrenceId,
          definitionId: definition.id,
          scheduledAt: '2026-09-02T09:00:00.000Z',
          dueAt: '2026-09-02T12:00:00.000Z',
          assigneeIds: [participant.id],
          assignmentSlot: participant.id,
          status: 'available' as const,
          updatedAt: '2026-08-20T08:00:00.000Z',
        },
      },
      outbox: [
        {
          id: 'outbox:stale-reminder',
          activityId: 'activity:stale-reminder',
          eventType: 'reminder_due' as const,
          status: 'pending' as const,
          attempts: 0,
          createdAt: '2026-09-02T09:00:00.000Z',
          nextAttemptAt: '2026-09-02T09:00:00.000Z',
          occurrenceId: staleOccurrenceId,
          participantId: participant.id,
          destination: 'home_assistant' as const,
        },
      ],
    };

    const result = materializeChoreWorkspace(workspace, new Date('2026-09-02T08:00:00.000Z'));

    expect(result.changed).toBe(true);
    expect(result.data.occurrencesById[staleOccurrenceId]).toBeUndefined();
    expect(result.data.outbox).toEqual([]);
    expect(
      Object.values(result.data.occurrencesById).some(
        (occurrence) => occurrence.scheduledAt === '2026-09-10T09:00:00.000Z'
      )
    ).toBe(true);
  });
  it('does not request another write for a historical slot retained by the authority', () => {
    const participant: ChoreParticipant = {
      id: 'alice',
      displayName: 'Alice',
      capabilities: ['complete', 'manage'],
      createdAt: '2026-08-01T08:00:00.000Z',
      updatedAt: '2026-08-01T08:00:00.000Z',
    };
    const definition: ChoreDefinition = {
      id: 'once',
      title: 'Once',
      enabled: true,
      assignment: { mode: 'person', participantIds: [participant.id] },
      schedule: { frequency: 'once', date: '2026-09-02', time: '09:00', timeZone: 'UTC' },
      dueWindowMinutes: 60,
      approval: { required: false, approverIds: [] },
      createdAt: participant.createdAt,
      updatedAt: participant.updatedAt,
    };
    const workspace = {
      ...createEmptyChoreWorkspace(),
      participantsById: { alice: participant },
      definitionsById: { once: definition },
      occurrencesById: {
        'legacy-shared-slot': {
          id: 'legacy-shared-slot',
          definitionId: 'once',
          assignmentSlot: 'shared',
          assigneeIds: ['alice'],
          scheduledAt: '2026-09-02T09:00:00.000Z',
          dueAt: '2026-09-02T10:00:00.000Z',
          status: 'done' as const,
          completedBy: 'alice',
          completedAt: '2026-09-02T09:30:00.000Z',
          updatedAt: '2026-09-02T09:30:00.000Z',
        },
      },
    };
    const result = materializeChoreWorkspace(workspace, new Date('2026-09-03T08:00:00.000Z'));
    expect(result.changed).toBe(false);
    expect(result.data).toBe(workspace);
  });
});
