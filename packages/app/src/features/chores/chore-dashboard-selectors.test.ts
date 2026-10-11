import { createChoreExperienceState } from '@navet/core/chore-experience';
import type { ChoreDefinition, ChoreOccurrence, ChoreWorkspaceData } from '@navet/core/chores';
import { describe, expect, it } from 'vitest';
import {
  getHousePulse,
  getMissedScheduledChoreHistory,
  getMissionProgressList,
  getNextChores,
  getParticipantPointHistory,
  getRewardProgressList,
  getRoomChoreSummaries,
  getRoomTodayChores,
  getTodayChoresForParticipant,
  getUpcomingChores,
} from './chore-dashboard-selectors';

const now = new Date('2026-08-15T10:00:00.000Z');
const createdAt = '2026-08-01T08:00:00.000Z';

function definition(id: string, room: string, participantId = 'maya'): ChoreDefinition {
  return {
    id,
    title: id,
    roomRef: { canonicalId: `room:${room}`, label: room },
    enabled: true,
    assignment: { mode: 'person', participantIds: [participantId] },
    schedule: {
      frequency: 'once',
      date: '2026-08-15',
      time: '09:00',
      timeZone: 'UTC',
    },
    dueWindowMinutes: 60,
    approval: { required: false, approverIds: [] },
    createdAt,
    updatedAt: createdAt,
  };
}

function occurrence(
  id: string,
  definitionId: string,
  status: ChoreOccurrence['status'],
  completedBy?: string
): ChoreOccurrence {
  return {
    id,
    definitionId,
    scheduledAt: '2026-08-15T09:00:00.000Z',
    dueAt: '2026-08-15T10:00:00.000Z',
    assigneeIds: ['maya'],
    assignmentSlot: 'maya',
    status,
    completedBy,
    completedAt: completedBy ? '2026-08-15T09:30:00.000Z' : undefined,
    updatedAt: '2026-08-15T09:30:00.000Z',
  };
}

function workspace(): ChoreWorkspaceData {
  const experience = createChoreExperienceState();
  experience.gamificationMode = 'family';
  experience.earnedPointsByParticipant = { maya: 15 };
  experience.presentationByDefinitionId = {
    dishes: { points: 15, estimatedMinutes: 4 },
    toys: { points: 10, estimatedMinutes: 5 },
    shoes: { points: 5, estimatedMinutes: 2 },
  };
  experience.missionsById.reset = {
    id: 'reset',
    title: 'Saturday reset',
    definitionIds: ['dishes', 'toys'],
    status: 'active',
    rewardPoints: 100,
    createdAt,
    updatedAt: createdAt,
  };
  experience.rewardGoalsById.lego = {
    id: 'lego',
    title: 'LEGO set',
    type: 'saving',
    participantId: 'maya',
    targetPoints: 800,
    startingPoints: 275,
    enabled: true,
    createdAt,
    updatedAt: createdAt,
  };
  return {
    schemaVersion: 2,
    participantsById: {
      maya: {
        id: 'maya',
        displayName: 'Maya',
        capabilities: ['complete'],
        createdAt,
        updatedAt: createdAt,
      },
    },
    definitionsById: {
      dishes: definition('dishes', 'Kitchen'),
      toys: definition('toys', "Maya's room"),
      shoes: definition('shoes', 'Hallway'),
    },
    occurrencesById: {
      dishes: occurrence('dishes', 'dishes', 'done', 'maya'),
      toys: occurrence('toys', 'toys', 'available'),
      shoes: occurrence('shoes', 'shoes', 'available'),
    },
    activity: [],
    outbox: [],
    experience,
  };
}

describe('chore dashboard selectors', () => {
  it('builds a real household pulse from current task state', () => {
    expect(getHousePulse(workspace(), now)).toMatchObject({
      completed: 1,
      total: 3,
      remaining: 2,
      overdue: 0,
      percent: 33,
      pointsEarned: 15,
      strongDays: 0,
      streakDays: 1,
    });
  });

  it('counts overdue unfinished chores in the household pulse', () => {
    expect(getHousePulse(workspace(), new Date('2026-08-15T10:01:00.000Z'))).toMatchObject({
      remaining: 2,
      overdue: 2,
    });
  });

  it('keeps participant focus and room summaries derived from the same occurrences', () => {
    const data = workspace();
    expect(getTodayChoresForParticipant(data, 'maya', now)).toHaveLength(3);
    expect(getRoomChoreSummaries(data, now)).toEqual([
      { canonicalId: 'room:Hallway', label: 'Hallway', total: 1, remaining: 1, completed: 0 },
      {
        canonicalId: "room:Maya's room",
        label: "Maya's room",
        total: 1,
        remaining: 1,
        completed: 0,
      },
      { canonicalId: 'room:Kitchen', label: 'Kitchen', total: 1, remaining: 0, completed: 1 },
    ]);
  });

  it('matches room chores by canonical room id when the dashboard room has a custom name', () => {
    expect(
      getRoomTodayChores(
        workspace(),
        { label: 'Cooking', canonicalIds: ['room:Kitchen'] },
        now
      ).map((item) => item.id)
    ).toEqual(['dishes']);
  });

  it('derives cooperative mission and saving-goal progress without a leaderboard', () => {
    const data = workspace();
    expect(getMissionProgressList(data, now)[0]).toMatchObject({
      completed: 1,
      total: 2,
      percent: 50,
    });
    expect(getRewardProgressList(data)[0]).toMatchObject({ points: 290, percent: 36 });

    const toys = data.occurrencesById.toys;
    if (!toys) throw new Error('Expected toys occurrence');
    data.occurrencesById.toys = {
      ...toys,
      status: 'done',
      completedBy: 'maya',
      completedAt: '2026-08-15T10:10:00.000Z',
    };
    expect(getMissionProgressList(data, now)[0]).toMatchObject({
      completed: 2,
      total: 2,
      percent: 100,
    });
    // Completing work updates the persisted balance through the authority.
    if (!data.experience) throw new Error('Expected chore experience');
    data.experience.earnedPointsByParticipant = { maya: 25 };
    expect(getRewardProgressList(data)[0]).toMatchObject({ points: 300, percent: 38 });

    if (!data.experience) throw new Error('Expected chore experience');
    data.experience.earnedPointsByParticipant = { maya: 300 };
    data.occurrencesById = {};
    expect(getRewardProgressList(data)[0]).toMatchObject({ points: 575, percent: 72 });

    const lego = data.experience.rewardGoalsById.lego;
    if (!lego) throw new Error('Expected LEGO reward goal');
    data.experience.rewardGoalsById.lego = {
      ...lego,
      type: 'family',
      participantId: undefined,
      targetPoints: 100,
      startingPoints: undefined,
    };
    data.experience.earnedPointsByParticipant = { maya: 25 };
    data.experience.householdBonusPoints = 50;
    expect(getRewardProgressList(data)[0]).toMatchObject({ points: 75, percent: 75 });
    data.experience.earnedPointsByParticipant = { maya: -25 };
    data.experience.householdBonusPoints = 0;
    expect(getRewardProgressList(data)[0]).toMatchObject({ points: -25, percent: 0 });
  });

  it('builds isolated participant point history with an inferred earlier balance', () => {
    const data = workspace();
    if (!data.experience) throw new Error('Expected chore experience');
    data.experience.earnedPointsByParticipant = { maya: -5, alex: 50 };
    data.activity = [
      {
        id: 'activity:earned',
        commandId: 'earned',
        type: 'completed',
        participantId: 'maya',
        definitionId: 'dishes',
        pointsDelta: 15,
        timestamp: '2026-08-15T09:00:00.000Z',
      },
      {
        id: 'activity:adjusted',
        commandId: 'adjusted',
        type: 'points_adjusted',
        participantId: 'maya',
        actorParticipantId: 'alex',
        reason: 'Replacement cost',
        pointsDelta: -30,
        timestamp: '2026-08-15T10:00:00.000Z',
      },
      {
        id: 'activity:other',
        commandId: 'other',
        type: 'points_adjusted',
        participantId: 'alex',
        pointsDelta: 50,
        reason: 'Bonus',
        timestamp: '2026-08-15T11:00:00.000Z',
      },
    ];
    expect(getParticipantPointHistory(data, 'maya')).toEqual({
      balance: -5,
      entries: [
        expect.objectContaining({ id: 'activity:adjusted', pointsDelta: -30 }),
        expect.objectContaining({ id: 'activity:earned', pointsDelta: 15 }),
        expect.objectContaining({
          id: 'points-earlier:maya',
          pointsDelta: 10,
          type: 'earlier',
        }),
      ],
    });
  });

  it('keeps chores without a room in Today without inventing a room summary', () => {
    const data = workspace();
    const shoes = data.definitionsById.shoes;
    if (!shoes) throw new Error('Expected shoes chore');
    data.definitionsById.shoes = { ...shoes, roomRef: undefined };

    expect(getTodayChoresForParticipant(data, 'maya', now)).toHaveLength(3);
    expect(
      getRoomChoreSummaries(data, now).some((room) => room.canonicalId === 'room:Hallway')
    ).toBe(false);
  });
});

describe('next scheduled chores', () => {
  it('orders and deduplicates future work, including dates beyond the next week', () => {
    const data = workspace();
    const localNow = new Date(2026, 7, 15, 10);
    const future = (id: string, definitionId: string, date: string) => ({
      ...occurrence(id, definitionId, 'available'),
      scheduledAt: date,
    });
    data.occurrencesById = {
      later: future('later', 'dishes', new Date(2026, 8, 10, 9).toISOString()),
      next: future('next', 'dishes', new Date(2026, 7, 20, 9).toISOString()),
      toys: future('toys', 'toys', new Date(2026, 7, 18, 9).toISOString()),
      today: future('today', 'shoes', new Date(2026, 7, 15, 15).toISOString()),
    };
    expect(getNextChores(data, 'all', localNow).map((item) => item.id)).toEqual([
      'today',
      'toys',
      'next',
    ]);
    expect(getNextChores(data, 'all', localNow, true).map((item) => item.id)).toEqual([
      'toys',
      'next',
    ]);
    delete data.occurrencesById.next;
    expect(getNextChores(data, 'all', localNow, true).at(-1)?.id).toBe('later');
  });

  it('excludes paused, archived, finished, skipped and unrelated work', () => {
    const data = workspace();
    data.definitionsById.dishes.enabled = false;
    data.definitionsById.toys.archivedAt = createdAt;
    data.occurrencesById = Object.fromEntries(
      ['dishes', 'toys', 'shoes'].map((id) => [
        id,
        {
          ...occurrence(id, id, 'available'),
          scheduledAt: '2026-08-20T09:00:00Z',
        },
      ])
    );
    expect(getNextChores(data, 'all', now).map((item) => item.id)).toEqual(['shoes']);
    expect(getNextChores(data, 'other', now)).toEqual([]);
    data.definitionsById.shoes.approval.approverIds = ['other'];
    expect(getNextChores(data, 'other', now)).toHaveLength(1);
    data.occurrencesById.shoes.status = 'done';
    expect(getNextChores(data, 'all', now)).toEqual([]);
    data.occurrencesById.shoes.status = 'skipped';
    expect(getNextChores(data, 'all', now)).toEqual([]);
  });
});

// Keep the library preview broader than the compact Today window.
describe('upcoming week', () => {
  it('includes tomorrow through day seven, excluding today, later dates and paused work', () => {
    const data = workspace();
    const localNow = new Date(2026, 7, 15, 10);
    data.occurrencesById = Object.fromEntries(
      [0, 1, 7, 8, 12].map((offset) => {
        const id = `day-${offset}`;
        return [
          id,
          {
            ...occurrence(id, 'dishes', 'available'),
            scheduledAt: new Date(2026, 7, 15 + offset, 16, 30).toISOString(),
          },
        ];
      })
    );
    expect(getUpcomingChores(data, 'all', localNow).map((item) => item.id)).toEqual([
      'day-1',
      'day-7',
    ]);
    data.definitionsById.dishes.enabled = false;
    expect(getUpcomingChores(data, 'all', localNow)).toEqual([]);
  });
});

it('keeps missed fixed chores in history and missed after-completion chores in Today', () => {
  const data = workspace();
  data.definitionsById.dishes.schedule = {
    frequency: 'weekly',
    startDate: '2026-08-01',
    time: '09:00',
    timeZone: 'UTC',
    daysOfWeek: [6],
  };
  data.definitionsById.toys.schedule = {
    frequency: 'after_completion',
    startDate: '2026-08-01',
    time: '09:00',
    timeZone: 'UTC',
    intervalDays: 14,
  };
  data.occurrencesById = {
    fixed: { ...occurrence('fixed', 'dishes', 'missed'), scheduledAt: '2026-08-08T09:00:00.000Z' },
    repeat: occurrence('repeat', 'toys', 'missed'),
    pending: occurrence('pending', 'dishes', 'awaiting_approval'),
  };
  expect(getTodayChoresForParticipant(data, 'all', now).map((item) => item.id)).toEqual([
    'pending',
    'repeat',
  ]);
  expect(data.occurrencesById.fixed.status).toBe('missed');
});

it('keeps an existing early-missed scheduled chore actionable until its successor starts', () => {
  const data = workspace();
  data.definitionsById.dishes.schedule = {
    frequency: 'daily',
    startDate: '2026-08-01',
    time: '09:00',
    timeZone: 'UTC',
  };
  const previous = {
    ...occurrence('previous', 'dishes', 'missed'),
    scheduledAt: '2026-08-14T09:00:00.000Z',
    dueAt: '2026-08-14T10:00:00.000Z',
  };
  const next = {
    ...occurrence('next', 'dishes', 'available'),
    scheduledAt: '2026-08-15T11:00:00.000Z',
    dueAt: '2026-08-15T12:00:00.000Z',
  };
  data.occurrencesById = { previous, next };
  expect(getTodayChoresForParticipant(data, 'all', now).map((item) => item.id)).toContain(
    'previous'
  );
  expect(getMissedScheduledChoreHistory(data, now)).toEqual([]);
  const started = new Date(next.scheduledAt);
  expect(getTodayChoresForParticipant(data, 'all', started).map((item) => item.id)).not.toContain(
    'previous'
  );
  expect(getMissedScheduledChoreHistory(data, started)).toEqual([previous]);
});
