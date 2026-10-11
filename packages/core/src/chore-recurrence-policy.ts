import type { ChoreActivity, ChoreDefinition, ChoreOccurrence } from './chores';

/** Retain evidenced fixed-work history before its successor or definition can change. */
export function retainChoreSupersession(
  occurrences: Record<string, ChoreOccurrence>,
  definitions: Record<string, ChoreDefinition>,
  timestamp: string,
  activities?: readonly ChoreActivity[]
): Record<string, ChoreOccurrence> {
  const events = activities ?? [];
  let result = occurrences;
  const items = Object.values(occurrences);
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.status !== 'missed' || item.supersededAt) continue;
    const definition = definitions[item.definitionId];
    const next =
      definition && getSupersedingChoreOccurrence(item, definition, occurrences, timestamp);
    const event = events.find(
      (activity) =>
        activity.occurrenceId === item.id &&
        activity.type === 'missed' &&
        activity.reason === 'Next scheduled occurrence started'
    );
    const supersededAt = next?.scheduledAt ?? event?.timestamp;
    if (!supersededAt) continue;
    if (result === occurrences) result = Object.assign(Object.create(null), occurrences);
    result[item.id] = Object.assign({}, item, { supersededAt });
  }
  return result;
}

/** An unfinished completion-based interval remains the same piece of work. */
export function getOutstandingChoreOccurrence(
  definition: ChoreDefinition,
  occurrences: Record<string, ChoreOccurrence>
): ChoreOccurrence | undefined {
  return Object.values(occurrences)
    .filter(
      (item) =>
        item.definitionId === definition.id &&
        !item.completedAt &&
        !item.supersededAt &&
        !item.carriedForwardTo &&
        ['available', 'claimed', 'missed'].includes(item.status)
    )
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))[0];
}

/** Everyone assignments have separate clocks; rotation and shared work have one. */
export function getParticipantChoreOccurrences(
  definition: ChoreDefinition,
  occurrences: Record<string, ChoreOccurrence>,
  participantId: string
): Record<string, ChoreOccurrence> {
  const result: Record<string, ChoreOccurrence> = Object.create(null);
  const items = Object.values(occurrences);
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.definitionId === definition.id && item.assigneeIds.includes(participantId)) {
      result[item.id] = item;
    }
  }
  return result;
}

export function getLatestChoreCompletion(
  occurrences: Record<string, ChoreOccurrence>
): string | undefined {
  const completions = Object.values(occurrences)
    .map((item) => item.completedAt)
    .filter((value): value is string => Boolean(value))
    .sort();
  return completions[completions.length - 1];
}

export function getSupersedingChoreOccurrence(
  occurrence: ChoreOccurrence,
  definition: ChoreDefinition,
  occurrences: Record<string, ChoreOccurrence>,
  timestamp: string
): ChoreOccurrence | undefined {
  if (
    definition.schedule.frequency === 'after_completion' ||
    definition.schedule.frequency === 'once'
  )
    return undefined;
  return Object.values(occurrences)
    .filter(
      (next) =>
        next.definitionId === occurrence.definitionId &&
        !next.carriedForwardTo &&
        // Vacation moves retain the calendar slot; automatic carry-forward is the same work.
        (!next.carriedForwardFrom || !next.assignmentSlot.startsWith('carry:')) &&
        next.scheduledAt > occurrence.scheduledAt &&
        next.scheduledAt <= timestamp &&
        (definition.assignment.mode !== 'everyone' ||
          next.assignmentSlot === occurrence.assignmentSlot)
    )
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))[0];
}

/** Keep the current completion anchor even when its next interval is very long. */
export function shouldPruneChoreOccurrence(
  occurrence: ChoreOccurrence,
  definitions: Record<string, ChoreDefinition>,
  occurrences: Record<string, ChoreOccurrence>,
  boundary: number
): boolean {
  if (occurrence.status !== 'done' && occurrence.status !== 'skipped') return false;
  const resolvedAt = occurrence.completedAt ?? occurrence.skippedAt ?? occurrence.updatedAt;
  if (Date.parse(resolvedAt) >= boundary) return false;
  const definition = definitions[occurrence.definitionId];
  if (definition?.schedule.frequency === 'after_completion' && occurrence.completedAt) {
    const newer = Object.values(occurrences).some(
      (next) =>
        next.definitionId === occurrence.definitionId &&
        next.completedAt &&
        next.completedAt > (occurrence.completedAt as string) &&
        next.status === 'done' &&
        (definition.assignment.mode !== 'everyone' ||
          next.assigneeIds.includes(occurrence.assigneeIds[0]))
    );
    if (!newer) return false;
  }
  return true;
}
