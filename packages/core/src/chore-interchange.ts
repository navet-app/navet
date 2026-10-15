import { type ChoreExperienceState, createChoreExperienceState } from './chore-experience.ts';
import {
  type ChoreActivity,
  type ChoreDefinition,
  type ChoreParticipant,
  type ChoreWorkspaceData,
  createEmptyChoreWorkspace,
  isChoreWorkspaceData,
  isWorkspaceMissionComplete,
  migrateChoreWorkspaceData,
} from './chores.ts';
import { setOwnRecordValue } from './record-safety.ts';

export const CHORE_INTERCHANGE_VERSION = 1 as const;

export interface ChoreInterchangeDocument {
  contract: 'navet.chores';
  version: typeof CHORE_INTERCHANGE_VERSION;
  exportedAt: string;
  workspace: ChoreWorkspaceData;
  events: ChoreActivity[];
}

export interface ChoreImportCollision {
  kind: 'participant' | 'definition' | 'occurrence' | 'event';
  sourceId: string;
  targetId: string;
}

export interface ChoreImportMergeResult {
  data: ChoreWorkspaceData;
  events: ChoreActivity[];
  collisions: ChoreImportCollision[];
  imported: { participants: number; definitions: number; occurrences: number; events: number };
}

export interface HomeAssistantTodoImportItem {
  uid?: string;
  summary: string;
  description?: string;
  status?: 'needs_action' | 'completed';
  due?: string;
}

export interface ChoreOpsImportChore {
  id?: string;
  name: string;
  description?: string;
  assigneeIds?: string[];
  due?: string;
  recurring?: 'none' | 'daily' | 'weekly' | 'monthly';
  points?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createChoreInterchangeDocument(input: {
  workspace: ChoreWorkspaceData;
  events: readonly ChoreActivity[];
  exportedAt?: string;
}): ChoreInterchangeDocument {
  const exportedAt = input.exportedAt ?? new Date().toISOString();
  if (!validTimestamp(exportedAt)) throw new Error('Invalid chore export timestamp');
  if (
    !isChoreWorkspaceData(input.workspace) ||
    input.workspace.experience?.pointProgress !== undefined
  )
    throw new Error('Invalid chore workspace export');
  const eventIds = new Set<string>();
  const events = input.events.filter((event) => {
    if (
      !event.id ||
      !event.commandId ||
      !validTimestamp(event.timestamp) ||
      eventIds.has(event.id)
    ) {
      return false;
    }
    eventIds.add(event.id);
    return true;
  });
  return {
    contract: 'navet.chores',
    version: CHORE_INTERCHANGE_VERSION,
    exportedAt,
    workspace: clone(input.workspace),
    events: clone(events),
  };
}

export function parseChoreInterchangeDocument(value: unknown): ChoreInterchangeDocument {
  if (
    !isRecord(value) ||
    value.contract !== 'navet.chores' ||
    value.version !== CHORE_INTERCHANGE_VERSION ||
    !validTimestamp(value.exportedAt) ||
    !Array.isArray(value.events)
  ) {
    throw new Error('Unsupported chore interchange document');
  }
  const workspace = migrateChoreWorkspaceData(value.workspace);
  return createChoreInterchangeDocument({
    workspace,
    events: value.events as ChoreActivity[],
    exportedAt: value.exportedAt,
  });
}

/** Export reusable household configuration without work instances or earned progress. */
export function createChoreConfigurationDocument(input: {
  workspace: ChoreWorkspaceData;
  exportedAt?: string;
}): ChoreInterchangeDocument {
  if (!isChoreWorkspaceData(input.workspace)) throw new Error('Invalid chore workspace export');
  const workspace = createEmptyChoreWorkspace();
  workspace.participantsById = clone(input.workspace.participantsById);
  workspace.definitionsById = clone(input.workspace.definitionsById);
  if (input.workspace.historyRetention) {
    workspace.historyRetention = clone(input.workspace.historyRetention);
  }
  for (const definition of Object.values(workspace.definitionsById)) {
    delete definition.assignment.rotationCursor;
  }
  const source = input.workspace.experience;
  if (source) {
    workspace.experience = {
      ...createChoreExperienceState(),
      setupStartedAt: source.setupStartedAt,
      setupCompletedAt: source.setupCompletedAt,
      gamificationMode: source.gamificationMode,
      presentationByDefinitionId: clone(source.presentationByDefinitionId),
      missionsById: clone(source.missionsById),
      rewardGoalsById: clone(source.rewardGoalsById),
      badgesById: clone(source.badgesById),
      achievementsById: clone(source.achievementsById),
    };
    const awardedMissionIds = new Set(source.awardedMissionIds ?? []);
    for (const mission of Object.values(workspace.experience.missionsById)) {
      if (
        mission.status === 'complete' ||
        awardedMissionIds.has(mission.id) ||
        (mission.definitionIds.length > 0 && isWorkspaceMissionComplete(input.workspace, mission))
      ) {
        mission.status = 'active';
        delete mission.startsAt;
        delete mission.endsAt;
      }
    }
    for (const reward of Object.values(workspace.experience.rewardGoalsById)) {
      delete reward.startingPoints;
    }
  }
  return createChoreInterchangeDocument({ workspace, events: [], exportedAt: input.exportedAt });
}

function nextImportedId(sourceId: string, occupied: Set<string>) {
  if (!occupied.has(sourceId)) return sourceId;
  let index = 2;
  while (occupied.has(`${sourceId}~import-${index}`)) index += 1;
  return `${sourceId}~import-${index}`;
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeExperienceConfiguration(
  current: ChoreExperienceState | undefined,
  imported: ChoreExperienceState | undefined,
  participantMap: Map<string, string>,
  definitionMap: Map<string, string>,
  adoptSettings: boolean
): ChoreExperienceState {
  const experience = clone(current ?? createChoreExperienceState());
  if (!imported) return experience;
  if (adoptSettings) {
    experience.gamificationMode = imported.gamificationMode;
    experience.setupStartedAt = imported.setupStartedAt;
    experience.setupCompletedAt = imported.setupCompletedAt;
  }
  for (const [id, metadata] of Object.entries(imported.presentationByDefinitionId)) {
    setOwnRecordValue(
      experience.presentationByDefinitionId,
      definitionMap.get(id) ?? id,
      clone(metadata)
    );
  }
  const progressTargetIds = new Set([
    ...Object.keys(experience.badgesById),
    ...Object.keys(experience.achievementsById),
    ...experience.progressAwards.map((award) => award.targetId),
  ]);
  const missionMap = new Map<string, string>();
  const progressTargetMap = new Map<string, string[]>();
  for (const name of [
    'missionsById',
    'rewardGoalsById',
    'badgesById',
    'achievementsById',
  ] as const) {
    const occupied =
      name === 'badgesById' || name === 'achievementsById'
        ? progressTargetIds
        : new Set([
            ...Object.keys(experience[name]),
            ...(name === 'missionsById' ? (experience.awardedMissionIds ?? []) : []),
          ]);
    for (const source of Object.values(imported[name])) {
      const item = clone(source);
      if ('definitionIds' in item && item.definitionIds) {
        item.definitionIds = item.definitionIds.map((id: string) => definitionMap.get(id) ?? id);
      }
      if ('participantId' in item && item.participantId) {
        item.participantId = participantMap.get(item.participantId) ?? item.participantId;
      }
      if (!sameValue(experience[name][item.id], item)) {
        item.id = nextImportedId(item.id, occupied);
        occupied.add(item.id);
        setOwnRecordValue(experience[name], item.id, item);
      }
      if (name === 'missionsById') missionMap.set(source.id, item.id);
      if (name === 'badgesById' || name === 'achievementsById') {
        progressTargetMap.set(source.id, [...(progressTargetMap.get(source.id) ?? []), item.id]);
      }
    }
  }
  const awardedMissionIds = new Set(experience.awardedMissionIds ?? []);
  for (const id of imported.awardedMissionIds ?? []) {
    const targetId = missionMap.get(id);
    if (targetId) awardedMissionIds.add(targetId);
  }
  experience.awardedMissionIds = [...awardedMissionIds];
  const awardIds = new Set(experience.progressAwards.map((award) => award.id));
  for (const award of imported.progressAwards) {
    const participantId = participantMap.get(award.participantId);
    if (!participantId) continue;
    for (const targetId of progressTargetMap.get(award.targetId) ?? []) {
      const id = `progress:${targetId}:${participantId}:${award.cycleKey}`;
      if (awardIds.has(id)) continue;
      awardIds.add(id);
      experience.progressAwards.push({ ...award, id, targetId, participantId });
    }
  }
  // Preserve award identities so imported work cannot earn the same points again.
  // Destination balances, ledgers and reward requests remain intact.
  return experience;
}

export function mergeChoreInterchange(input: {
  current: ChoreWorkspaceData;
  currentEvents: readonly ChoreActivity[];
  imported: ChoreInterchangeDocument;
  importedAt?: string;
}): ChoreImportMergeResult {
  const importedAt = input.importedAt ?? new Date().toISOString();
  if (!validTimestamp(importedAt)) throw new Error('Invalid chore import timestamp');
  const collisions: ChoreImportCollision[] = [];
  const participantsById = clone(input.current.participantsById);
  const participantIds = new Set(Object.keys(participantsById));
  const participantMap = new Map<string, string>();
  for (const participant of Object.values(input.imported.workspace.participantsById)) {
    if (
      participantsById[participant.id] &&
      sameValue(participantsById[participant.id], participant)
    ) {
      participantMap.set(participant.id, participant.id);
      continue;
    }
    const targetId = nextImportedId(participant.id, participantIds);
    participantIds.add(targetId);
    participantMap.set(participant.id, targetId);
    participantsById[targetId] = { ...participant, id: targetId, updatedAt: importedAt };
    if (targetId !== participant.id) {
      collisions.push({ kind: 'participant', sourceId: participant.id, targetId });
    }
  }

  const definitionsById = clone(input.current.definitionsById);
  const definitionIds = new Set(Object.keys(definitionsById));
  const definitionMap = new Map<string, string>();
  for (const definition of Object.values(input.imported.workspace.definitionsById)) {
    const remapped: ChoreDefinition = {
      ...definition,
      assignment: {
        ...definition.assignment,
        participantIds: definition.assignment.participantIds.map(
          (id) => participantMap.get(id) ?? id
        ),
        standbyParticipantIds: definition.assignment.standbyParticipantIds?.map(
          (id) => participantMap.get(id) ?? id
        ),
        participantScheduleOverrides: definition.assignment.participantScheduleOverrides
          ? Object.fromEntries(
              Object.entries(definition.assignment.participantScheduleOverrides).map(
                ([id, schedule]) => [participantMap.get(id) ?? id, schedule]
              )
            )
          : undefined,
      },
      approval: {
        ...definition.approval,
        approverIds: definition.approval.approverIds.map((id) => participantMap.get(id) ?? id),
      },
      updatedAt: importedAt,
    };
    if (definitionsById[definition.id] && sameValue(definitionsById[definition.id], remapped)) {
      definitionMap.set(definition.id, definition.id);
      continue;
    }
    const targetId = nextImportedId(definition.id, definitionIds);
    definitionIds.add(targetId);
    definitionMap.set(definition.id, targetId);
    definitionsById[targetId] = { ...remapped, id: targetId };
    if (targetId !== definition.id) {
      collisions.push({ kind: 'definition', sourceId: definition.id, targetId });
    }
  }

  const occurrencesById = clone(input.current.occurrencesById);
  const occurrenceIds = new Set(Object.keys(occurrencesById));
  const occurrenceMap = new Map<string, string>();
  for (const occurrence of Object.values(input.imported.workspace.occurrencesById)) {
    const targetId = nextImportedId(occurrence.id, occurrenceIds);
    occurrenceIds.add(targetId);
    occurrenceMap.set(occurrence.id, targetId);
    occurrencesById[targetId] = {
      ...occurrence,
      id: targetId,
      definitionId: definitionMap.get(occurrence.definitionId) ?? occurrence.definitionId,
      assigneeIds: occurrence.assigneeIds.map((id) => participantMap.get(id) ?? id),
      claimedBy: occurrence.claimedBy
        ? (participantMap.get(occurrence.claimedBy) ?? occurrence.claimedBy)
        : undefined,
      completedBy: occurrence.completedBy
        ? (participantMap.get(occurrence.completedBy) ?? occurrence.completedBy)
        : undefined,
      approvedBy: occurrence.approvedBy
        ? (participantMap.get(occurrence.approvedBy) ?? occurrence.approvedBy)
        : undefined,
      skippedBy: occurrence.skippedBy
        ? (participantMap.get(occurrence.skippedBy) ?? occurrence.skippedBy)
        : undefined,
      updatedAt: importedAt,
    };
    if (targetId !== occurrence.id) {
      collisions.push({ kind: 'occurrence', sourceId: occurrence.id, targetId });
    }
  }
  for (const occurrence of Object.values(occurrencesById)) {
    if (occurrence.carriedForwardFrom && occurrenceMap.has(occurrence.carriedForwardFrom)) {
      occurrence.carriedForwardFrom = occurrenceMap.get(occurrence.carriedForwardFrom);
    }
    if (occurrence.carriedForwardTo && occurrenceMap.has(occurrence.carriedForwardTo)) {
      occurrence.carriedForwardTo = occurrenceMap.get(occurrence.carriedForwardTo);
    }
  }

  const currentEvents = clone(input.currentEvents);
  const eventIds = new Set(currentEvents.map((event) => event.id));
  const importedEvents: ChoreActivity[] = [];
  for (const event of input.imported.events) {
    const targetId = nextImportedId(event.id, eventIds);
    eventIds.add(targetId);
    importedEvents.push({
      ...event,
      id: targetId,
      commandId: `import:${event.commandId}`,
      occurrenceId: event.occurrenceId
        ? (occurrenceMap.get(event.occurrenceId) ?? event.occurrenceId)
        : undefined,
      definitionId: event.definitionId
        ? (definitionMap.get(event.definitionId) ?? event.definitionId)
        : undefined,
      participantId: event.participantId
        ? (participantMap.get(event.participantId) ?? event.participantId)
        : undefined,
      actorParticipantId: event.actorParticipantId
        ? (participantMap.get(event.actorParticipantId) ?? event.actorParticipantId)
        : undefined,
      assigneeIds: event.assigneeIds?.map((id) => participantMap.get(id) ?? id),
      previousAssigneeIds: event.previousAssigneeIds?.map((id) => participantMap.get(id) ?? id),
    });
    if (targetId !== event.id) collisions.push({ kind: 'event', sourceId: event.id, targetId });
  }
  const activity = [...input.current.activity, ...importedEvents].slice(-5000);
  return {
    data: {
      ...input.current,
      participantsById,
      definitionsById,
      occurrencesById,
      activity,
      experience: mergeExperienceConfiguration(
        input.current.experience,
        input.imported.workspace.experience,
        participantMap,
        definitionMap,
        Object.keys(input.current.definitionsById).length === 0
      ),
      // Imported delivery work is intentionally not replayed.
      outbox: input.current.outbox,
    },
    events: [...currentEvents, ...importedEvents],
    collisions,
    imported: {
      participants:
        Object.keys(participantsById).length - Object.keys(input.current.participantsById).length,
      definitions:
        Object.keys(definitionsById).length - Object.keys(input.current.definitionsById).length,
      occurrences:
        Object.keys(occurrencesById).length - Object.keys(input.current.occurrencesById).length,
      events: importedEvents.length,
    },
  };
}

function safeId(prefix: string, value: string, index: number) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${prefix}-${normalized || index + 1}`.slice(0, 80);
}

function dueParts(due: string | undefined, fallback: string) {
  const timestamp = validTimestamp(due) ? due : fallback;
  return { timestamp, date: timestamp.slice(0, 10), time: timestamp.slice(11, 16) };
}

export function convertHomeAssistantTodoItems(input: {
  items: readonly HomeAssistantTodoImportItem[];
  participant: ChoreParticipant;
  timeZone: string;
  importedAt?: string;
}): ChoreInterchangeDocument {
  const importedAt = input.importedAt ?? new Date().toISOString();
  const workspace = createEmptyChoreWorkspace();
  workspace.participantsById[input.participant.id] = input.participant;
  input.items.forEach((item, index) => {
    const id = safeId('todo', item.uid ?? item.summary, index);
    const due = dueParts(item.due, importedAt);
    workspace.definitionsById[id] = {
      id,
      title: item.summary.trim() || `Imported task ${index + 1}`,
      description: item.description,
      enabled: item.status !== 'completed',
      assignment: { mode: 'person', participantIds: [input.participant.id] },
      schedule: { frequency: 'once', date: due.date, time: due.time, timeZone: input.timeZone },
      dueWindowMinutes: 0,
      approval: { required: false, approverIds: [] },
      createdAt: importedAt,
      updatedAt: importedAt,
    };
    const occurrenceId = `${id}:${due.timestamp}:${input.participant.id}`;
    workspace.occurrencesById[occurrenceId] = {
      id: occurrenceId,
      definitionId: id,
      scheduledAt: due.timestamp,
      dueAt: due.timestamp,
      assigneeIds: [input.participant.id],
      assignmentSlot: input.participant.id,
      status: item.status === 'completed' ? 'done' : 'available',
      completedBy: item.status === 'completed' ? input.participant.id : undefined,
      completedAt: item.status === 'completed' ? importedAt : undefined,
      updatedAt: importedAt,
    };
  });
  return createChoreInterchangeDocument({ workspace, events: [], exportedAt: importedAt });
}

export function convertChoreOpsChores(input: {
  chores: readonly ChoreOpsImportChore[];
  participants: readonly ChoreParticipant[];
  timeZone: string;
  importedAt?: string;
}): ChoreInterchangeDocument {
  const importedAt = input.importedAt ?? new Date().toISOString();
  const workspace = createEmptyChoreWorkspace();
  for (const participant of input.participants)
    workspace.participantsById[participant.id] = participant;
  const fallbackParticipant = input.participants[0];
  if (!fallbackParticipant) throw new Error('ChoreOps import needs at least one participant');
  input.chores.forEach((chore, index) => {
    const id = safeId('choreops', chore.id ?? chore.name, index);
    const participantIds = (chore.assigneeIds ?? [fallbackParticipant.id]).filter((participantId) =>
      Boolean(workspace.participantsById[participantId])
    );
    const due = dueParts(chore.due, importedAt);
    const recurring = chore.recurring ?? 'none';
    const schedule: ChoreDefinition['schedule'] =
      recurring === 'daily'
        ? { frequency: 'daily', startDate: due.date, time: due.time, timeZone: input.timeZone }
        : recurring === 'weekly'
          ? {
              frequency: 'weekly',
              startDate: due.date,
              time: due.time,
              timeZone: input.timeZone,
              daysOfWeek: [new Date(due.timestamp).getUTCDay()],
            }
          : recurring === 'monthly'
            ? {
                frequency: 'monthly',
                startDate: due.date,
                time: due.time,
                timeZone: input.timeZone,
                dayOfMonth: Number(due.date.slice(8, 10)),
              }
            : { frequency: 'once', date: due.date, time: due.time, timeZone: input.timeZone };
    workspace.definitionsById[id] = {
      id,
      title: chore.name.trim() || `Imported chore ${index + 1}`,
      description: chore.description,
      enabled: true,
      assignment: {
        mode: participantIds.length > 1 ? 'anyone' : 'person',
        participantIds: participantIds.length > 0 ? participantIds : [fallbackParticipant.id],
      },
      schedule,
      dueWindowMinutes: 0,
      approval: { required: false, approverIds: [] },
      createdAt: importedAt,
      updatedAt: importedAt,
    };
  });
  return createChoreInterchangeDocument({ workspace, events: [], exportedAt: importedAt });
}
