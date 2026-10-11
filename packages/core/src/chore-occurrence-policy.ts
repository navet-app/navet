import type {
  ApplyChoreCommandInput,
  ApplyChoreCommandResult,
  ChoreActivity,
  ChoreActivityType,
  ChoreOccurrence,
  ChoreOccurrenceCommand,
} from './chores.ts';

function assertAssigned(occurrence: ChoreOccurrence, participantId: string) {
  if (!occurrence.assigneeIds.includes(participantId)) {
    throw new Error('Participant is not assigned to this chore occurrence');
  }
}

function buildActivity(input: ApplyChoreCommandInput, type: ChoreActivityType): ChoreActivity {
  const reason =
    'reason' in input.command && typeof input.command.reason === 'string'
      ? input.command.reason.trim()
      : undefined;
  return {
    id: `activity:${input.commandId}`,
    commandId: input.commandId,
    occurrenceId: input.occurrence.id,
    definitionId: input.definition.id,
    type,
    actorParticipantId: input.command.participantId,
    participantId: input.command.participantId,
    reason: reason || undefined,
    previousAssigneeIds:
      input.command.type === 'reassign' ? input.occurrence.assigneeIds : undefined,
    assigneeIds: input.command.type === 'reassign' ? input.command.assigneeIds : undefined,
    timestamp: input.timestamp,
  };
}

export function applyChoreOccurrenceCommand(
  input: ApplyChoreCommandInput
): ApplyChoreCommandResult {
  const command = input.command;
  const definition = input.definition;
  const occurrence = input.occurrence;
  const timestamp = input.timestamp;
  const participantId = command.participantId;
  let nextOccurrence: ChoreOccurrence;

  switch (command.type) {
    case 'claim': {
      assertAssigned(occurrence, participantId);
      if (
        definition.claimPolicy?.opensBeforeMinutes !== undefined &&
        Date.parse(timestamp) <
          Date.parse(occurrence.scheduledAt) - definition.claimPolicy.opensBeforeMinutes * 60_000
      ) {
        throw new Error('This chore cannot be claimed yet');
      }
      const canStealExpiredClaim =
        occurrence.status === 'claimed' &&
        definition.claimPolicy?.allowSteal === true &&
        definition.claimPolicy.expiresAfterMinutes !== undefined &&
        occurrence.claimedAt !== undefined &&
        Date.parse(timestamp) >=
          Date.parse(occurrence.claimedAt) + definition.claimPolicy.expiresAfterMinutes * 60_000;
      if (occurrence.status !== 'available' && !canStealExpiredClaim) {
        throw new Error('Only available chores can be claimed');
      }
      nextOccurrence = Object.assign({}, occurrence, {
        status: 'claimed',
        claimedBy: participantId,
        claimedAt: timestamp,
        updatedAt: timestamp,
      });
      break;
    }
    case 'complete': {
      assertAssigned(occurrence, participantId);
      if (
        occurrence.status !== 'available' &&
        occurrence.status !== 'claimed' &&
        occurrence.status !== 'missed'
      ) {
        throw new Error('Only available, claimed, or missed chores can be completed');
      }
      if (
        (occurrence.status === 'claimed' || occurrence.status === 'missed') &&
        occurrence.claimedBy &&
        occurrence.claimedBy !== participantId
      ) {
        throw new Error('A claimed chore can only be completed by its claimant');
      }
      if (occurrence.status === 'available' && definition.claimPolicy?.required) {
        throw new Error('This chore must be claimed before it can be completed');
      }
      nextOccurrence = Object.assign({}, occurrence, {
        status: definition.approval.required ? 'awaiting_approval' : 'done',
        claimedBy: occurrence.claimedBy ?? participantId,
        claimedAt: occurrence.claimedAt ?? timestamp,
        completedBy: participantId,
        completedAt: timestamp,
        missedAt: undefined,
        updatedAt: timestamp,
      });
      break;
    }
    case 'approve': {
      const managerOverride = command.managerOverride === true;
      if (
        !definition.approval.required ||
        (!definition.approval.approverIds.includes(participantId) && !managerOverride)
      ) {
        throw new Error('Participant cannot approve this chore');
      }
      if (managerOverride && !command.reason?.trim()) {
        throw new Error('A manager approval override requires a reason');
      }
      if (occurrence.status !== 'awaiting_approval') {
        throw new Error('Only completed chores awaiting approval can be approved');
      }
      nextOccurrence = Object.assign({}, occurrence, {
        status: 'done',
        approvedBy: participantId,
        approvedAt: timestamp,
        updatedAt: timestamp,
      });
      break;
    }
    case 'reject': {
      const managerOverride = command.managerOverride === true;
      if (
        !definition.approval.required ||
        (!definition.approval.approverIds.includes(participantId) && !managerOverride)
      ) {
        throw new Error('Participant cannot reject this chore');
      }
      if (managerOverride && !command.reason?.trim()) {
        throw new Error('A manager rejection override requires a reason');
      }
      if (occurrence.status !== 'awaiting_approval') {
        throw new Error('Only completed chores awaiting approval can be rejected');
      }
      const keepClaim = definition.approval.resetClaimOnReject === false && !!occurrence.claimedBy;
      nextOccurrence = Object.assign({}, occurrence, {
        status: keepClaim ? 'claimed' : 'available',
        claimedBy: keepClaim ? occurrence.claimedBy : undefined,
        claimedAt: keepClaim ? occurrence.claimedAt : undefined,
        completedBy: undefined,
        completedAt: undefined,
        approvedBy: undefined,
        approvedAt: undefined,
        updatedAt: timestamp,
      });
      break;
    }
    case 'skip': {
      if (!command.reason.trim()) throw new Error('Skipping a chore requires a reason');
      if (occurrence.status === 'done' || occurrence.status === 'skipped') {
        throw new Error('Completed or skipped chores cannot be skipped');
      }
      nextOccurrence = Object.assign({}, occurrence, {
        status: 'skipped',
        skippedBy: participantId,
        skippedAt: timestamp,
        updatedAt: timestamp,
      });
      break;
    }
    case 'reopen': {
      if (!command.reason.trim()) throw new Error('Reopening a chore requires a reason');
      if (
        occurrence.status !== 'done' &&
        occurrence.status !== 'skipped' &&
        occurrence.status !== 'missed'
      ) {
        throw new Error('Only completed, skipped, or missed chores can be reopened');
      }
      nextOccurrence = Object.assign({}, occurrence, {
        status: 'available',
        claimedBy: undefined,
        claimedAt: undefined,
        completedBy: undefined,
        completedAt: undefined,
        approvedBy: undefined,
        approvedAt: undefined,
        skippedBy: undefined,
        skippedAt: undefined,
        missedAt: undefined,
        supersededAt: undefined,
        carriedForwardTo: undefined,
        updatedAt: timestamp,
      });
      break;
    }
    case 'reassign': {
      if (!command.reason.trim()) throw new Error('Reassigning a chore requires a reason');
      const assigneeIds = command.assigneeIds.filter(
        (id, index, values) => values.indexOf(id) === index
      );
      if (assigneeIds.length === 0) {
        throw new Error('Reassigning a chore requires an eligible participant');
      }
      if (occurrence.status !== 'available' && occurrence.status !== 'claimed') {
        throw new Error('Only available or claimed chores can be reassigned');
      }
      nextOccurrence = Object.assign({}, occurrence, {
        assigneeIds,
        assignmentSlot: `manager:${assigneeIds.slice().sort().join(',')}`,
        status: 'available',
        claimedBy: undefined,
        claimedAt: undefined,
        updatedAt: timestamp,
      });
      break;
    }
  }

  const activityType: Record<ChoreOccurrenceCommand['type'], ChoreActivityType> = {
    claim: 'claimed',
    complete: 'completed',
    approve: 'approved',
    reject: 'rejected',
    skip: 'skipped',
    reopen: 'reopened',
    reassign: 'reassigned',
  };

  return {
    occurrence: nextOccurrence,
    activity: buildActivity(input, activityType[command.type]),
  };
}
