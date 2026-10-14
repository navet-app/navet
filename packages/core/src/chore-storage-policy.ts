import type { ChoreActivity, ChoreOutboxItem, ChoreWorkspaceData } from './chores.ts';
import { setOwnRecordValue } from './record-safety.ts';

// Keep the ES5 ownership check: native NJS does not implement Object.hasOwn.
const hasOwn = Object.prototype.hasOwnProperty;

export interface CompactChoreHistory {
  contractVersion: 1;
  events: ChoreActivity[];
  eventCursors?: Record<string, number>;
  nextCursor?: number;
}

export function isChoreBookkeeping(type: string): boolean {
  return type === 'workspace_materialized' || type === 'outbox_delivery_updated';
}

/** Stable IDs identify retries; separate actions with different IDs remain distinct. */
export function compactChoreActivity(events: ChoreActivity[]): ChoreActivity[] {
  const seen = Object.create(null) as Record<string, boolean>;
  const retained: ChoreActivity[] = [];
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    if (isChoreBookkeeping(event.type) || seen[event.id]) continue;
    setOwnRecordValue(seen, event.id, true);
    retained.push(event);
  }
  return retained.length === events.length ? events : retained;
}

export function compactChoreOutbox(items: ChoreOutboxItem[]): ChoreOutboxItem[] {
  const positions = Object.create(null) as Record<string, number>;
  const retained: ChoreOutboxItem[] = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (isChoreBookkeeping(item.eventType)) continue;
    const position = positions[item.id];
    if (position === undefined) {
      setOwnRecordValue(positions, item.id, retained.length);
      retained.push(item);
    } else {
      const previous = retained[position];
      // Never replay a delivered notification when duplicate pending rows exist.
      if (
        previous.status !== 'delivered' &&
        (item.status === 'delivered' || item.attempts > previous.attempts)
      )
        retained[position] = item;
    }
  }
  return retained.length === items.length ? items : retained;
}

export function compactChoreWorkspace(data: ChoreWorkspaceData): ChoreWorkspaceData {
  const activity = compactChoreActivity(data.activity);
  const outbox = compactChoreOutbox(data.outbox || []);
  if (activity === data.activity && outbox === data.outbox) return data;
  return Object.assign({}, data, { activity, outbox });
}

export function isChoreMaterializationUnchanged(
  before: ChoreWorkspaceData,
  after: ChoreWorkspaceData
): boolean {
  const ids = Object.keys(before.occurrencesById);
  if (ids.length !== Object.keys(after.occurrencesById).length) return false;
  for (let index = 0; index < ids.length; index++) {
    const id = ids[index];
    if (!hasOwn.call(after.occurrencesById, id)) return false;
    if (
      before.occurrencesById[id] !== after.occurrencesById[id] &&
      JSON.stringify(before.occurrencesById[id]) !== JSON.stringify(after.occurrencesById[id])
    )
      return false;
  }
  return (
    before.outbox === after.outbox || JSON.stringify(before.outbox) === JSON.stringify(after.outbox)
  );
}

/** Retained events keep their old feed positions even when the intervening noise is removed. */
export function compactChoreHistory(history: CompactChoreHistory): CompactChoreHistory {
  const events = compactChoreActivity(history.events);
  const cursors = Object.create(null) as Record<string, number>;
  const sequenced = history.eventCursors !== undefined && history.nextCursor !== undefined;
  const existingCursors = history.eventCursors ?? (Object.create(null) as Record<string, number>);
  const previousEnd = history.nextCursor ?? history.events.length;
  if (
    (history.eventCursors !== undefined || history.nextCursor !== undefined) &&
    (!sequenced ||
      !history.eventCursors ||
      typeof history.eventCursors !== 'object' ||
      Array.isArray(history.eventCursors) ||
      !Number.isSafeInteger(previousEnd) ||
      previousEnd < 0)
  ) {
    throw new Error('Chore history cursors are invalid');
  }
  let nextCursor = previousEnd;
  const originals = Object.create(null) as Record<string, number>;
  let lastSaved = 0;
  for (let index = 0; index < history.events.length; index++) {
    const event = history.events[index];
    if (originals[event.id] !== undefined) continue;
    const saved =
      sequenced && hasOwn.call(existingCursors, event.id) ? existingCursors[event.id] : undefined;
    if (saved !== undefined) {
      if (!Number.isSafeInteger(saved) || saved <= lastSaved || saved > previousEnd) {
        throw new Error('Chore history cursors are invalid');
      }
      lastSaved = saved;
    }
    setOwnRecordValue(
      originals,
      event.id,
      saved !== undefined ? saved : sequenced ? ++nextCursor : index + 1
    );
  }
  for (let index = 0; index < events.length; index++)
    setOwnRecordValue(cursors, events[index].id, originals[events[index].id]);
  if (
    events === history.events &&
    sequenced &&
    nextCursor === history.nextCursor &&
    Object.keys(existingCursors).length === events.length
  )
    return history;
  return { contractVersion: history.contractVersion, events, eventCursors: cursors, nextCursor };
}

export function readChoreHistoryPage(
  history: CompactChoreHistory,
  after: number,
  limit: number,
  types: string[],
  occurrenceId?: string | null,
  definitionId?: string | null
) {
  const end = history.nextCursor ?? history.events.length;
  let cursor = Math.min(after, end);
  const events: ChoreActivity[] = [];
  let index = 0;
  while (index < history.events.length && events.length < limit) {
    const event = history.events[index];
    const position = history.eventCursors?.[event.id] ?? index + 1;
    index++;
    if (position <= cursor) continue;
    cursor = position;
    if (
      types.indexOf(event.type) === -1 ||
      (occurrenceId && event.occurrenceId !== occurrenceId) ||
      (definitionId && event.definitionId !== definitionId)
    )
      continue;
    events.push(event);
  }
  if (index === history.events.length && events.length < limit) cursor = end;
  return {
    contractVersion: history.contractVersion,
    cursor: String(cursor),
    hasMore: cursor < end,
    events,
  };
}
