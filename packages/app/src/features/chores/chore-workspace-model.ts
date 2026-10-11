import { shouldPruneChoreOccurrence } from '@navet/core/chore-recurrence-policy';
import { type ChoreWorkspaceData, materializeChoreOccurrences } from '@navet/core/chores';

const RETENTION_DAYS = 90;
const MATERIALIZATION_DAYS = 45;

export function getChoreMaterializationRange(now = new Date()) {
  return {
    rangeStart: new Date(now.getTime() - RETENTION_DAYS * 86_400_000).toISOString(),
    rangeEnd: new Date(now.getTime() + MATERIALIZATION_DAYS * 86_400_000).toISOString(),
  };
}

export function createChoreCommandId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `chore:${crypto.randomUUID()}`;
  }
  return `chore:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

export function materializeChoreWorkspace(
  data: ChoreWorkspaceData,
  now = new Date()
): { changed: boolean; data: ChoreWorkspaceData } {
  const { rangeStart, rangeEnd } = getChoreMaterializationRange(now);
  const occurrencesById = { ...data.occurrencesById };
  const scheduledOccurrenceIdsByDefinition = new Map<string, Set<string>>();
  const rangeStartTime = Date.parse(rangeStart);
  const rangeEndTime = Date.parse(rangeEnd);
  let changed = false;

  for (const definition of Object.values(data.definitionsById)) {
    const latestCompletedAt = Object.values(occurrencesById)
      .filter(
        (occurrence) =>
          occurrence.definitionId === definition.id && occurrence.completedAt !== undefined
      )
      .map((occurrence) => occurrence.completedAt as string)
      .sort()
      .at(-1);
    const occurrences = materializeChoreOccurrences({
      definition,
      participantsById: data.participantsById,
      existingOccurrences: occurrencesById,
      latestCompletedAt,
      rangeStart,
      rangeEnd,
    });
    scheduledOccurrenceIdsByDefinition.set(
      definition.id,
      new Set(occurrences.map((occurrence) => occurrence.id))
    );
    for (const occurrence of occurrences) {
      if (!occurrencesById[occurrence.id]) {
        occurrencesById[occurrence.id] = occurrence;
        changed = true;
      }
    }
  }

  const removedOccurrenceIds = new Set<string>();
  for (const [id, occurrence] of Object.entries(occurrencesById)) {
    const scheduledIds = scheduledOccurrenceIdsByDefinition.get(occurrence.definitionId);
    const scheduledAt = Date.parse(occurrence.scheduledAt);
    if (
      scheduledIds &&
      scheduledAt >= rangeStartTime &&
      scheduledAt <= rangeEndTime &&
      !scheduledIds.has(id) &&
      occurrence.status === 'available' &&
      scheduledAt > now.getTime() &&
      occurrence.carriedForwardFrom === undefined
    ) {
      delete occurrencesById[id];
      removedOccurrenceIds.add(id);
      changed = true;
    }
  }

  const retentionBoundary = now.getTime() - RETENTION_DAYS * 86_400_000;
  for (const occurrence of Object.values(occurrencesById)) {
    if (
      shouldPruneChoreOccurrence(
        occurrence,
        data.definitionsById,
        occurrencesById,
        retentionBoundary
      )
    ) {
      delete occurrencesById[occurrence.id];
      changed = true;
    }
  }

  return changed
    ? {
        changed,
        data: {
          ...data,
          occurrencesById,
          outbox:
            removedOccurrenceIds.size === 0
              ? data.outbox
              : data.outbox.filter(
                  (item) =>
                    item.status === 'delivered' ||
                    !item.occurrenceId ||
                    !removedOccurrenceIds.has(item.occurrenceId)
                ),
        },
      }
    : { changed, data };
}
