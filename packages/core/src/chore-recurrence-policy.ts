import type { ChoreActivity, ChoreDefinition, ChoreOccurrence } from './chores';

/** Parse accepted ISO instants in runtimes whose Date parser lacks numeric offsets. */
export function parseChoreInstant(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  if (Number.isFinite(parsed)) return parsed;
  const offset = /([+-])(\d{2}):(\d{2})$/.exec(timestamp);
  if (!offset) return parsed;
  const hours = Number(offset[2]);
  const minutes = Number(offset[3]);
  if (hours > 23 || minutes > 59) return NaN;
  const utc = Date.parse(`${timestamp.slice(0, -6)}Z`);
  return utc - (offset[1] === '+' ? 1 : -1) * (hours * 60 + minutes) * 60000;
}

/** Retain evidenced fixed-work history before its successor or definition can change. */
export function retainChoreSupersession(
  occurrences: Record<string, ChoreOccurrence>,
  definitions: Record<string, ChoreDefinition>,
  timestamp: string,
  activities?: readonly ChoreActivity[],
  knownParticipantIds?: readonly string[]
): Record<string, ChoreOccurrence> {
  const events = activities ?? [];
  let result = occurrences;
  const items = Object.values(occurrences);
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.status !== 'missed' || item.supersededAt) continue;
    const definition = definitions[item.definitionId];
    const next =
      definition &&
      getSupersedingChoreOccurrence(item, definition, occurrences, timestamp, knownParticipantIds);
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
    .sort((a, b) => parseChoreInstant(a.scheduledAt) - parseChoreInstant(b.scheduledAt))[0];
}

/** Assignment can change who performs work without moving its original recurrence clock. */
function getRecurrenceParticipantIds(
  occurrence: ChoreOccurrence,
  participantIds: readonly string[]
): readonly string[] {
  const prefix = `${occurrence.definitionId}:`;
  let id = occurrence.id;
  let hasLineage = false;
  while (id.startsWith(prefix)) {
    const instant = id.slice(prefix.length, prefix.length + 24);
    const instantTime = parseChoreInstant(instant);
    if (
      !Number.isFinite(instantTime) ||
      new Date(instantTime).toISOString() !== instant ||
      id.charAt(prefix.length + 24) !== ':'
    )
      break;
    const slot = id.slice(prefix.length + 25);
    if (
      id === occurrence.id &&
      occurrence.carriedForwardFrom &&
      (slot === `vacation:${occurrence.carriedForwardFrom}` ||
        slot === `carry:${occurrence.carriedForwardFrom}`)
    ) {
      id = occurrence.carriedForwardFrom;
      hasLineage = true;
    } else if (participantIds.includes(slot)) {
      return [slot];
    } else if (hasLineage && slot.startsWith(`vacation:${prefix}`)) {
      id = slot.slice(9);
    } else if (hasLineage && slot.startsWith(`carry:${prefix}`)) {
      id = slot.slice(6);
    } else {
      return occurrence.assigneeIds;
    }
  }
  // Older imported noncanonical IDs do not contain an evidenced original slot.
  return occurrence.assigneeIds;
}

/** Everyone assignments have separate clocks; rotation and shared work have one. */
export function getParticipantChoreOccurrences(
  definition: ChoreDefinition,
  occurrences: Record<string, ChoreOccurrence>,
  participantId: string,
  knownParticipantIds?: readonly string[]
): Record<string, ChoreOccurrence> {
  const result: Record<string, ChoreOccurrence> = Object.create(null);
  const items = Object.values(occurrences);
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (
      item.definitionId === definition.id &&
      getRecurrenceParticipantIds(
        item,
        knownParticipantIds ?? definition.assignment.participantIds
      ).includes(participantId)
    ) {
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
    .sort((a, b) => parseChoreInstant(a) - parseChoreInstant(b));
  return completions[completions.length - 1];
}

export function getSupersedingChoreOccurrence(
  occurrence: ChoreOccurrence,
  definition: ChoreDefinition,
  occurrences: Record<string, ChoreOccurrence>,
  timestamp: string,
  knownParticipantIds?: readonly string[]
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
        parseChoreInstant(next.scheduledAt) > parseChoreInstant(occurrence.scheduledAt) &&
        parseChoreInstant(next.scheduledAt) <= parseChoreInstant(timestamp) &&
        (definition.assignment.mode !== 'everyone' ||
          getRecurrenceParticipantIds(
            next,
            knownParticipantIds ?? definition.assignment.participantIds
          ).some((id) =>
            getRecurrenceParticipantIds(
              occurrence,
              knownParticipantIds ?? definition.assignment.participantIds
            ).includes(id)
          ))
    )
    .sort((a, b) => parseChoreInstant(a.scheduledAt) - parseChoreInstant(b.scheduledAt))[0];
}

/** Keep the current completion anchor even when its next interval is very long. */
export function shouldPruneChoreOccurrence(
  occurrence: ChoreOccurrence,
  definitions: Record<string, ChoreDefinition>,
  occurrences: Record<string, ChoreOccurrence>,
  boundary: number,
  knownParticipantIds?: readonly string[]
): boolean {
  if (occurrence.status !== 'done' && occurrence.status !== 'skipped') return false;
  const resolvedAt = occurrence.completedAt ?? occurrence.skippedAt ?? occurrence.updatedAt;
  if (parseChoreInstant(resolvedAt) >= boundary) return false;
  const definition = definitions[occurrence.definitionId];
  if (definition?.schedule.frequency === 'after_completion' && occurrence.completedAt) {
    const newer = Object.values(occurrences).some(
      (next) =>
        next.definitionId === occurrence.definitionId &&
        next.completedAt &&
        parseChoreInstant(next.completedAt) > parseChoreInstant(occurrence.completedAt as string) &&
        next.status === 'done' &&
        (definition.assignment.mode !== 'everyone' ||
          getRecurrenceParticipantIds(
            next,
            knownParticipantIds ?? definition.assignment.participantIds
          ).includes(
            getRecurrenceParticipantIds(
              occurrence,
              knownParticipantIds ?? definition.assignment.participantIds
            )[0]
          ))
    );
    if (!newer) return false;
  }
  return true;
}
