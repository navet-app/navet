import type {
  ChorePointProgress,
  ChorePointTransaction,
  ChoreProgressAward,
  ChoreProgressTarget,
} from './chore-experience.ts';
import type { ChoreOccurrence } from './chores.ts';
import { setOwnRecordValue } from './record-safety.ts';

const hasOwn = Object.prototype.hasOwnProperty;

/** Legacy generated IDs retain their definition even after the occurrence is pruned. */
export function chorePointDefinitionId(
  transaction: ChorePointTransaction,
  occurrences: Record<string, Pick<ChoreOccurrence, 'definitionId'>>
): string | undefined {
  const id = transaction.occurrenceId;
  if (transaction.definitionId) return transaction.definitionId;
  if (id && hasOwn.call(occurrences, id)) return occurrences[id].definitionId;
  const match = id && /^(.+?):\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z:/.exec(id);
  return match ? match[1] : undefined;
}

/** Increment a read model only when records move from the recent ledger into history. */
export function archiveChorePointProgress(
  previous: ChorePointProgress | undefined,
  transactions: readonly ChorePointTransaction[],
  occurrenceIds: readonly string[],
  liveOccurrences: Record<string, Pick<ChoreOccurrence, 'definitionId'>> = {}
): ChorePointProgress {
  const totals = Object.assign(Object.create(null), previous?.totals || {});
  const definitions = Object.assign(Object.create(null), previous?.definitions || {});
  const occurrences: ChorePointProgress['occurrences'] = Object.create(null);
  const present: Record<string, boolean> = Object.create(null);
  for (let index = 0; index < occurrenceIds.length; index++) {
    const id = occurrenceIds[index];
    setOwnRecordValue(present, id, true);
    if (previous && hasOwn.call(previous.occurrences, id))
      setOwnRecordValue(occurrences, id, previous.occurrences[id]);
  }
  function add(
    groups: ChorePointProgress['totals'],
    period: string,
    person: string,
    delta: number
  ) {
    const group = Object.assign(Object.create(null), groups[period] || {});
    const next = (group[person] || 0) + delta;
    if (!Number.isSafeInteger(next)) throw new Error('Chore progress points are too large');
    setOwnRecordValue(group, person, next);
    setOwnRecordValue(groups, period, group);
  }
  for (let index = 0; index < transactions.length; index++) {
    const transaction = transactions[index];
    if (transaction.kind !== 'completion' && transaction.kind !== 'reopen') continue;
    const periods = [
      'once',
      'weekly:' + progressCycleKey('weekly', transaction.timestamp),
      'monthly:' + progressCycleKey('monthly', transaction.timestamp),
    ];
    const id = transaction.occurrenceId;
    const definitionId = chorePointDefinitionId(transaction, liveOccurrences);
    const definitionGroups = definitionId
      ? Object.assign(Object.create(null), definitions[definitionId] || {})
      : null;
    const groups =
      id && present[id] ? Object.assign(Object.create(null), occurrences[id] || {}) : null;
    for (let period = 0; period < periods.length; period++) {
      add(totals, periods[period], transaction.participantId, transaction.pointsDelta);
      if (groups) add(groups, periods[period], transaction.participantId, transaction.pointsDelta);
      if (definitionGroups)
        add(definitionGroups, periods[period], transaction.participantId, transaction.pointsDelta);
    }
    if (id && groups) setOwnRecordValue(occurrences, id, groups);
    if (definitionId && definitionGroups)
      setOwnRecordValue(definitions, definitionId, definitionGroups);
  }
  return { version: 1, totals, occurrences, definitions };
}

export function isChorePointProgress(value: unknown): value is ChorePointProgress {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isRecord(value.totals) ||
    !isRecord(value.occurrences)
  )
    return false;
  function groupsValid(groups: unknown): boolean {
    if (!isRecord(groups)) return false;
    const periods = Object.values(groups);
    return periods.every(
      (group) => isRecord(group) && Object.values(group).every(Number.isSafeInteger)
    );
  }
  return (
    groupsValid(value.totals) &&
    Object.values(value.occurrences).every(groupsValid) &&
    (value.definitions === undefined ||
      (isRecord(value.definitions) && Object.values(value.definitions).every(groupsValid)))
  );
}

export function archivedChoreTargetPoints(
  summary: ChorePointProgress | undefined,
  cycle: ChoreProgressTarget['cycle'],
  participantId: string,
  occurrenceIds: readonly string[] | null,
  at: string,
  definitionIds?: readonly string[]
): number {
  if (!summary) return 0;
  const period =
    cycle === 'weekly' || cycle === 'monthly' ? cycle + ':' + progressCycleKey(cycle, at) : 'once';
  function points(groups: ChorePointProgress['totals'] | undefined): number {
    const group = groups?.[period];
    return group && hasOwn.call(group, participantId) ? group[participantId] : 0;
  }
  if (!occurrenceIds) return points(summary.totals);
  if (definitionIds && summary.definitions) {
    let total = 0;
    const seen = Object.create(null);
    for (let index = 0; index < definitionIds.length; index++) {
      const id = definitionIds[index];
      if (seen[id]) continue;
      setOwnRecordValue(seen, id, true);
      total += points(summary.definitions[id]);
    }
    return total;
  }
  let total = 0;
  for (let index = 0; index < occurrenceIds.length; index++)
    total += points(summary.occurrences[occurrenceIds[index]]);
  return total;
}

export function progressCycleKey(cycle: ChoreProgressTarget['cycle'], at: string): string {
  if (cycle === 'monthly') return at.slice(0, 7);
  if (cycle === 'weekly') {
    const date = new Date(at);
    const monday = Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() - ((date.getUTCDay() + 6) % 7)
    );
    return new Date(monday).toISOString().slice(0, 10);
  }
  return 'once';
}

function inCycle(cycle: ChoreProgressTarget['cycle'], at: string, cycleKey: string): boolean {
  return progressCycleKey(cycle, at) === cycleKey;
}

/** A streak advances on a completed due day, resets on a missed due day, and ignores days without due work. */
export function choreTargetProgress(
  target: ChoreProgressTarget,
  participantId: string,
  occurrences: readonly ChoreOccurrence[],
  transactions: readonly ChorePointTransaction[],
  at: string,
  pointProgress?: ChorePointProgress
): number {
  const cycleKey = progressCycleKey(target.cycle, at);
  const relevant = occurrences.filter(
    (occurrence) =>
      (!target.definitionIds?.length || target.definitionIds.includes(occurrence.definitionId)) &&
      inCycle(target.cycle, occurrence.completedAt ?? occurrence.scheduledAt, cycleKey)
  );
  const completed = relevant.filter(
    (occurrence) => occurrence.status === 'done' && occurrence.completedBy === participantId
  );
  if (target.metric === 'selected_chore' || target.metric === 'count') return completed.length;
  if (target.metric === 'points') {
    const byId: Record<string, Pick<ChoreOccurrence, 'definitionId'>> = Object.create(null);
    for (let index = 0; index < occurrences.length; index++)
      setOwnRecordValue(byId, occurrences[index].id, occurrences[index]);
    return Math.max(
      0,
      archivedChoreTargetPoints(
        pointProgress,
        target.cycle,
        participantId,
        target.definitionIds?.length ? relevant.map((item) => item.id) : null,
        at,
        target.definitionIds
      ) +
        transactions
          .filter(
            (item) =>
              item.participantId === participantId &&
              (item.kind === 'completion' || item.kind === 'reopen') &&
              inCycle(target.cycle, item.timestamp, cycleKey) &&
              (!target.definitionIds?.length ||
                target.definitionIds.includes(chorePointDefinitionId(item, byId) ?? ''))
          )
          .reduce((sum, item) => sum + item.pointsDelta, 0)
    );
  }
  if (target.metric === 'days') {
    const days: string[] = [];
    for (let index = 0; index < completed.length; index += 1) {
      const occurrence = completed[index];
      const day = occurrence.completedAt?.slice(0, 10);
      if (day && !days.includes(day)) days.push(day);
    }
    return days.length;
  }
  const days: Record<string, 'done' | 'missed'> = {};
  for (let index = 0; index < relevant.length; index += 1) {
    const occurrence = relevant[index];
    if (occurrence.status === 'missed' && occurrence.assigneeIds.includes(participantId)) {
      days[occurrence.scheduledAt.slice(0, 10)] = 'missed';
    } else if (occurrence.status === 'done' && occurrence.completedBy === participantId) {
      const day = occurrence.scheduledAt.slice(0, 10);
      if (days[day] !== 'missed') days[day] = 'done';
    }
  }
  let streak = 0;
  const sortedDays = Object.keys(days).sort();
  for (let index = 0; index < sortedDays.length; index += 1) {
    const day = sortedDays[index];
    streak = days[day] === 'done' ? streak + 1 : 0;
  }
  return streak;
}

export function earnChoreProgressAwards(input: {
  badges: Record<string, ChoreProgressTarget>;
  achievements: Record<string, ChoreProgressTarget>;
  participantIds: readonly string[];
  occurrences: readonly ChoreOccurrence[];
  transactions: readonly ChorePointTransaction[];
  existingAwards: readonly ChoreProgressAward[];
  pointProgress?: ChorePointProgress;
  at: string;
}): { awards: ChoreProgressAward[]; transactions: ChorePointTransaction[] } {
  const awards: ChoreProgressAward[] = [];
  const transactions: ChorePointTransaction[] = [];
  const targets = Object.values(input.badges).concat(Object.values(input.achievements));
  for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
    const target = targets[targetIndex];
    const cycleKey = progressCycleKey(target.cycle, input.at);
    for (
      let participantIndex = 0;
      participantIndex < input.participantIds.length;
      participantIndex += 1
    ) {
      const participantId = input.participantIds[participantIndex];
      if (target.participantId && target.participantId !== participantId) continue;
      const id = `progress:${target.id}:${participantId}:${cycleKey}`;
      if (
        input.existingAwards.some((award) => award.id === id) ||
        awards.some((award) => award.id === id)
      )
        continue;
      if (
        choreTargetProgress(
          target,
          participantId,
          input.occurrences,
          input.transactions,
          input.at,
          input.pointProgress
        ) < target.target
      )
        continue;
      awards.push({ id, targetId: target.id, participantId, cycleKey, awardedAt: input.at });
      if (target.awardPoints)
        transactions.push({
          id: `points:${id}`,
          participantId,
          pointsDelta: target.awardPoints,
          kind: 'progress_award',
          timestamp: input.at,
        });
    }
  }
  return { awards, transactions };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalTimestamp(value: unknown) {
  return value === undefined || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
}

function isOptionalBoundedInteger(value: unknown, maximum: number) {
  return (
    value === undefined ||
    (Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum)
  );
}

export function isPointTransaction(value: unknown): value is ChorePointTransaction {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.participantId === 'string' &&
    value.participantId.length > 0 &&
    Number.isSafeInteger(value.pointsDelta) &&
    Math.abs(Number(value.pointsDelta)) <= 1_000_000_000 &&
    [
      'opening_balance',
      'completion',
      'reopen',
      'adjustment',
      'reward',
      'refund',
      'reward_decision',
      'progress_award',
    ].includes(String(value.kind)) &&
    typeof value.timestamp === 'string' &&
    isOptionalTimestamp(value.timestamp) &&
    (value.commandId === undefined || typeof value.commandId === 'string') &&
    (value.rewardRequestId === undefined || typeof value.rewardRequestId === 'string') &&
    (value.occurrenceId === undefined || typeof value.occurrenceId === 'string') &&
    (value.definitionId === undefined || typeof value.definitionId === 'string')
  );
}

export function isProgressTarget(value: unknown, id: string): value is ChoreProgressTarget {
  return (
    isRecord(value) &&
    value.id === id &&
    typeof value.title === 'string' &&
    value.title.trim().length > 0 &&
    ['selected_chore', 'count', 'points', 'days', 'streak'].includes(String(value.metric)) &&
    Number.isSafeInteger(value.target) &&
    Number(value.target) > 0 &&
    (value.participantId === undefined || typeof value.participantId === 'string') &&
    (value.definitionIds === undefined ||
      (Array.isArray(value.definitionIds) &&
        value.definitionIds.every((item) => typeof item === 'string'))) &&
    (value.cycle === undefined || ['once', 'weekly', 'monthly'].includes(String(value.cycle))) &&
    isOptionalBoundedInteger(value.awardPoints, 100_000)
  );
}

export function isProgressAward(value: unknown): value is ChoreProgressAward {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.targetId === 'string' &&
    typeof value.participantId === 'string' &&
    typeof value.cycleKey === 'string' &&
    typeof value.awardedAt === 'string' &&
    isOptionalTimestamp(value.awardedAt)
  );
}
