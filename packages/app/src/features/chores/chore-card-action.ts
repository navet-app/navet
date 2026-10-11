import type { TranslateFn } from '@navet/app/i18n';
import type { ChoreDefinition, ChoreOccurrence, ChoreWorkspaceAction } from '@navet/core/chores';
import type { ChoreCardAction } from './components/chore-card';

export function getChoreCardAction(
  occurrence: ChoreOccurrence,
  definition: ChoreDefinition,
  participantId: string,
  execute: (action: ChoreWorkspaceAction) => Promise<boolean>,
  t: TranslateFn
): ChoreCardAction | undefined {
  if (definition.archivedAt || occurrence.status === 'done') {
    return undefined;
  }

  const run = (type: 'claim' | 'complete' | 'approve', actionParticipantId: string) => () => {
    void execute({
      type: 'occurrence_action',
      occurrenceId: occurrence.id,
      action: { type, participantId: actionParticipantId },
    });
  };
  const buildAction = (
    type: 'claim' | 'complete' | 'approve',
    participantIds: string[]
  ): ChoreCardAction | undefined => {
    const eligibleParticipantIds = [...new Set(participantIds)].filter(Boolean);
    if (eligibleParticipantIds.length === 0) return undefined;
    const label =
      type === 'approve'
        ? t('household.actions.approve')
        : type === 'claim'
          ? t('household.actions.claim')
          : t('household.actions.complete');
    const kind = type === 'approve' ? 'approve' : type === 'claim' ? 'claim' : 'complete';

    if (eligibleParticipantIds.length === 1) {
      return { label, kind, onSelect: run(type, eligibleParticipantIds[0]) };
    }
    return {
      label,
      kind,
      participantIds: eligibleParticipantIds,
      onSelectParticipant: (selectedParticipantId) => {
        if (!eligibleParticipantIds.includes(selectedParticipantId)) return;
        run(type, selectedParticipantId)();
      },
    };
  };

  if (participantId === 'all') {
    if (occurrence.status === 'awaiting_approval') {
      return buildAction('approve', definition.approval.approverIds);
    }
    if (occurrence.status === 'missed') {
      return buildAction(
        'complete',
        occurrence.claimedBy ? [occurrence.claimedBy] : occurrence.assigneeIds
      );
    }
    if (occurrence.status === 'claimed') {
      return occurrence.claimedBy ? buildAction('complete', [occurrence.claimedBy]) : undefined;
    }
    if (occurrence.status === 'available') {
      return buildAction(
        definition.claimPolicy?.required ? 'claim' : 'complete',
        occurrence.assigneeIds
      );
    }
    return undefined;
  }

  const actionParticipantId =
    participantId === 'all' && occurrence.assigneeIds.length === 1
      ? occurrence.assigneeIds[0]
      : participantId;
  if (!actionParticipantId || actionParticipantId === 'all') return undefined;
  if (
    occurrence.status === 'awaiting_approval' &&
    definition.approval.approverIds.includes(actionParticipantId)
  ) {
    return {
      label: t('household.actions.approve'),
      kind: 'approve',
      onSelect: run('approve', actionParticipantId),
    };
  }
  if (!occurrence.assigneeIds.includes(actionParticipantId)) return undefined;
  if (definition.claimPolicy?.required && occurrence.status === 'available') {
    return {
      label: t('household.actions.claim'),
      kind: 'claim',
      onSelect: run('claim', actionParticipantId),
    };
  }
  if (
    occurrence.status === 'available' ||
    (occurrence.status === 'missed' &&
      (!occurrence.claimedBy || occurrence.claimedBy === actionParticipantId)) ||
    (occurrence.status === 'claimed' && occurrence.claimedBy === actionParticipantId)
  ) {
    return {
      label: t('household.actions.complete'),
      kind: 'complete',
      onSelect: run('complete', actionParticipantId),
    };
  }
  return undefined;
}
