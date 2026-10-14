import { describe, expect, it } from 'vitest';
import njsProgress from '../../../docker/njs/chore-progress-policy.js';
import type { ChorePointTransaction, ChoreProgressTarget } from './chore-experience.ts';
import {
  archiveChorePointProgress,
  choreTargetProgress,
  earnChoreProgressAwards,
  isChorePointProgress,
  progressCycleKey,
} from './chore-progress-policy.ts';
import type { ChoreOccurrence } from './chores.ts';

function occurrence(
  id: string,
  status: ChoreOccurrence['status'],
  scheduledAt: string
): ChoreOccurrence {
  return {
    id,
    definitionId: 'dishes',
    assignmentSlot: 'maya',
    assigneeIds: ['maya'],
    scheduledAt,
    dueAt: scheduledAt,
    status,
    updatedAt: scheduledAt,
    completedBy: status === 'done' ? 'maya' : undefined,
    completedAt: status === 'done' ? scheduledAt : undefined,
  };
}

describe('chore progression', () => {
  it('keeps progress compact for 15000 live completions without losing scoped points', () => {
    const at = '2026-10-14T10:00:00.000Z';
    const rows: ChorePointTransaction[] = Array.from({ length: 15000 }, (_, index) => ({
      id: `points:${index}`,
      occurrenceId: `dishes:${at}:maya:${index}`,
      definitionId: 'dishes',
      participantId: 'maya',
      kind: 'completion',
      pointsDelta: 1,
      timestamp: at,
    }));
    const ids = rows.map((row) => row.occurrenceId ?? '');
    const summary = archiveChorePointProgress(undefined, rows, ids);
    expect(njsProgress.archiveChorePointProgress(undefined, rows, ids)).toEqual(summary);
    expect(Object.keys(summary.occurrences)).toHaveLength(0);
    expect(JSON.stringify(summary).length).toBeLessThan(1024);
    for (const cycle of ['once', 'weekly', 'monthly'] as const) {
      expect(
        choreTargetProgress(
          {
            id: 'target',
            title: 'Target',
            metric: 'points',
            target: 15000,
            cycle,
            definitionIds: ['dishes'],
          },
          'maya',
          [],
          [],
          at,
          summary
        )
      ).toBe(15000);
    }
    const old = { ...summary, occurrences: { legacy: summary.totals } };
    expect(archiveChorePointProgress(old, [], ids)).toEqual(summary);
  });

  it.each(['once', 'weekly', 'monthly'] as const)(
    'preserves %s point progress when historical rows are archived in multiple transactions',
    (cycle) => {
      const items = Array.from({ length: 90 }, (_, i) =>
        occurrence('task:' + i, 'done', new Date(Date.UTC(2026, 7, i + 1, 10)).toISOString())
      );
      const transactions: ChorePointTransaction[] = items.map((item, i) => ({
        id: 'points:' + i,
        participantId: i % 4 ? 'maya' : 'other',
        occurrenceId: item.id,
        pointsDelta: i % 7 ? 10 : -3,
        kind: i % 7 ? 'completion' : 'reopen',
        timestamp: item.scheduledAt,
      }));
      transactions.push({
        id: 'adjust',
        participantId: 'maya',
        pointsDelta: 1000,
        kind: 'adjustment',
        timestamp: items[0].scheduledAt,
      });
      const ids = items.map((item) => item.id);
      // Keep: compare full ledgers with the archived read model for every supported cycle.
      const byId = Object.fromEntries(items.map((item) => [item.id, item]));
      const first = archiveChorePointProgress(undefined, transactions.slice(0, 40), ids, byId);
      const summary = archiveChorePointProgress(first, transactions.slice(40, 80), ids, byId);
      const recent = transactions.slice(80);
      for (const selected of [false, true]) {
        const target: ChoreProgressTarget = {
          id: 'target',
          title: 'Target',
          metric: 'points',
          target: 1,
          cycle,
          ...(selected ? { definitionIds: ['dishes'] } : {}),
        };
        const at = '2026-10-28T12:00:00.000Z';
        const expected = choreTargetProgress(target, 'maya', items, transactions, at);
        expect(choreTargetProgress(target, 'maya', items, recent, at, summary)).toBe(expected);
        expect(njsProgress.choreTargetProgress(target, 'maya', items, recent, at, summary)).toBe(
          expected
        );
        expect(
          earnChoreProgressAwards({
            badges: { target },
            achievements: {},
            participantIds: ['maya'],
            occurrences: items,
            transactions: recent,
            existingAwards: [],
            pointProgress: summary,
            at,
          }).awards
        ).toEqual(
          earnChoreProgressAwards({
            badges: { target },
            achievements: {},
            participantIds: ['maya'],
            occurrences: items,
            transactions,
            existingAwards: [],
            at,
          }).awards
        );
      }
      expect(first.totals.once.maya).not.toBe(summary.totals.once.maya);
      expect(Object.keys(archiveChorePointProgress(summary, [], []).occurrences)).toHaveLength(0);
    }
  );

  it.each(['once', 'weekly', 'monthly'] as const)(
    'retains scoped %s points and awards after occurrences are pruned',
    (cycle) => {
      const at = '2026-01-05T10:00:00.000Z';
      const old = { ...occurrence('custom-old-id', 'done', at), definitionId: 'kitchen:dishes' };
      const rows: ChorePointTransaction[] = [
        {
          id: 'old',
          participantId: 'maya',
          occurrenceId: old.id,
          pointsDelta: 10,
          kind: 'completion',
          timestamp: at,
        },
        {
          id: 'reopen',
          participantId: 'maya',
          occurrenceId: `kitchen:dishes:${at}:maya`,
          pointsDelta: -3,
          kind: 'reopen',
          timestamp: at,
        },
        {
          id: 'unrelated',
          participantId: 'maya',
          definitionId: 'laundry',
          pointsDelta: 50,
          kind: 'completion',
          timestamp: at,
        },
        {
          id: 'adjustment',
          participantId: 'maya',
          definitionId: 'kitchen:dishes',
          pointsDelta: 999,
          kind: 'adjustment',
          timestamp: at,
        },
        {
          id: 'recent',
          participantId: 'maya',
          definitionId: 'kitchen:dishes',
          occurrenceId: 'custom-pruned-id',
          pointsDelta: 5,
          kind: 'completion',
          timestamp: at,
        },
      ];
      const first = archiveChorePointProgress(undefined, rows.slice(0, 1), [old.id], {
        [old.id]: old,
      });
      const summary = archiveChorePointProgress(first, rows.slice(1, 4), []);
      expect(Object.keys(summary.occurrences)).toEqual([]);
      const target: ChoreProgressTarget = {
        id: 'scoped',
        title: 'Dishes',
        metric: 'points',
        cycle,
        definitionIds: ['kitchen:dishes', 'kitchen:dishes'],
        target: 12,
        awardPoints: 2,
      };
      const now = cycle === 'once' ? '2026-10-14T12:00:00.000Z' : at;
      for (const policy of [{ choreTargetProgress, earnChoreProgressAwards }, njsProgress]) {
        expect(policy.choreTargetProgress(target, 'maya', [], rows.slice(4), now, summary)).toBe(
          12
        );
        expect(policy.choreTargetProgress(target, 'other', [], rows.slice(4), now, summary)).toBe(
          0
        );
        const input = {
          badges: { scoped: target },
          achievements: {},
          participantIds: ['maya'],
          occurrences: [],
          transactions: rows.slice(4),
          existingAwards: [],
          pointProgress: summary,
          at: now,
        };
        const earned = policy.earnChoreProgressAwards(input);
        expect(earned.awards).toHaveLength(1);
        expect(earned.transactions).toMatchObject([{ pointsDelta: 2 }]);
        expect(
          policy.earnChoreProgressAwards({ ...input, existingAwards: earned.awards }).awards
        ).toEqual([]);
      }
      expect(isChorePointProgress(summary)).toBe(true);
      expect(
        isChorePointProgress({ ...summary, definitions: { dishes: { once: { maya: '12' } } } })
      ).toBe(false);
    }
  );

  it('counts final completions, treats a missed due day as a streak break, and ignores an unscheduled pause', () => {
    const items = [
      occurrence('mon', 'done', '2026-09-28T10:00:00.000Z'),
      occurrence('tue', 'missed', '2026-09-29T10:00:00.000Z'),
      occurrence('thu', 'done', '2026-10-01T10:00:00.000Z'),
      occurrence('fri', 'done', '2026-10-02T10:00:00.000Z'),
    ];
    expect(
      choreTargetProgress(
        { id: 'streak', title: 'Streak', metric: 'streak', target: 2 },
        'maya',
        items,
        [],
        '2026-10-02T12:00:00.000Z'
      )
    ).toBe(2);
    expect(
      choreTargetProgress(
        { id: 'days', title: 'Days', metric: 'days', target: 3 },
        'maya',
        items,
        [],
        '2026-10-02T12:00:00.000Z'
      )
    ).toBe(3);
    expect(
      choreTargetProgress(
        { id: 'weekly', title: 'Week', metric: 'count', target: 1, cycle: 'weekly' },
        'maya',
        items,
        [],
        '2026-10-02T12:00:00.000Z'
      )
    ).toBe(3);
    expect(progressCycleKey('weekly', '2026-10-02T12:00:00.000Z')).toBe('2026-09-28');
    expect(
      njsProgress.choreTargetProgress(
        { id: 'streak', title: 'Streak', metric: 'streak', target: 2 },
        'maya',
        items,
        [],
        '2026-10-02T12:00:00.000Z'
      )
    ).toBe(2);
  });

  it('awards each person and cycle once from final state, with one point transaction', () => {
    const target = {
      id: 'badge',
      title: 'Dishes',
      metric: 'selected_chore' as const,
      target: 1,
      definitionIds: ['dishes'],
      cycle: 'weekly' as const,
      awardPoints: 5,
    };
    const input = {
      badges: { badge: target },
      achievements: {},
      participantIds: ['maya'],
      occurrences: [occurrence('mon', 'done', '2026-09-28T10:00:00.000Z')],
      transactions: [],
      existingAwards: [],
      at: '2026-09-28T11:00:00.000Z',
    };
    const first = earnChoreProgressAwards(input);
    expect(first.awards).toHaveLength(1);
    expect(first.transactions).toMatchObject([{ pointsDelta: 5, kind: 'progress_award' }]);
    expect(earnChoreProgressAwards({ ...input, existingAwards: first.awards }).awards).toEqual([]);
    expect(njsProgress.earnChoreProgressAwards(input)).toEqual(first);
    expect(earnChoreProgressAwards({ ...input, at: '2026-10-05T11:00:00.000Z' }).awards).toEqual(
      []
    );
  });
});
