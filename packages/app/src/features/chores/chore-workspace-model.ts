import { applyChoreWorkspaceAction, type ChoreWorkspaceData } from '@navet/core/chores';

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
  const result = applyChoreWorkspaceAction({
    workspace: data,
    commandId: 'materialization-preview',
    timestamp: now.toISOString(),
    action: { type: 'materialize_occurrences', ...getChoreMaterializationRange(now) },
  });
  // Preview the same reconciliation as the authority; never persist preview activity.
  const changed =
    JSON.stringify(result.data.occurrencesById) !== JSON.stringify(data.occurrencesById) ||
    result.data.outbox !== data.outbox;
  return { changed, data: changed ? result.data : data };
}
