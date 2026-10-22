import { Button } from '@navet/app/components/primitives';
import { EntityCardHeaderIcon } from '@navet/app/components/primitives/entity-card-header-icon';
import { getCardReadableTextTokens } from '@navet/app/components/shared/theme/card-readable-text-tokens';
import {
  getReadableAccentForeground,
  themeColorValues,
} from '@navet/app/components/shared/theme/theme-colors';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { Avatar, AvatarFallback, AvatarImage } from '@navet/app/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@navet/app/components/ui/dropdown-menu';
import { cn } from '@navet/app/components/ui/utils';
import { isEmojiLightIcon, resolveLightIconComponent } from '@navet/app/constants/icon-map';
import { useI18n, useTheme } from '@navet/app/hooks';
import type { ChorePresentationMetadata } from '@navet/core/chore-experience';
import {
  type ChoreDefinition,
  type ChoreOccurrence,
  type ChoreParticipant,
  getChoreTiming,
} from '@navet/core/chores';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDashed,
  Clock3,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { resolveChoreColorPalette } from '../chore-color-palette';
import { ChoreBaseCard } from './chore-base-card';
import { resolveChoreIconComponent } from './chore-icon';
import { ChorePointsToken } from './chore-points-token';

export interface ChoreCardAction {
  label: string;
  onSelect?: () => void;
  participantIds?: string[];
  onSelectParticipant?: (participantId: string) => void;
  kind: 'complete' | 'claim' | 'approve' | 'reopen';
  disabled?: boolean;
}

export function ChoreActionControl({
  action,
  participantsById,
  compact = false,
  accessibleLabel,
}: {
  compact?: boolean;
  accessibleLabel?: string;
  action: ChoreCardAction;
  participantsById: Record<string, ChoreParticipant>;
}) {
  const choices = (action.participantIds ?? [])
    .map((id) => participantsById[id])
    .filter((participant): participant is ChoreParticipant => Boolean(participant));
  const ActionIcon =
    action.kind === 'approve' ? ShieldCheck : action.kind === 'claim' ? Sparkles : Check;
  const chooseParticipant = choices.length > 0 && Boolean(action.onSelectParticipant);
  const button = (
    <Button
      size="compact"
      variant={compact ? 'ghost' : action.kind === 'approve' ? 'primary' : 'secondary'}
      className={compact ? '-mr-3 shrink-0' : 'min-w-28 justify-center px-4'}
      aria-label={accessibleLabel}
      leading={compact ? undefined : <ActionIcon className="h-4 w-4" aria-hidden="true" />}
      trailing={
        chooseParticipant ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : null
      }
      disabled={action.disabled}
      onClick={chooseParticipant ? undefined : action.onSelect}
    >
      {action.label}
    </Button>
  );

  if (!chooseParticipant) return button;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-52">
        <DropdownMenuLabel>{action.label}</DropdownMenuLabel>
        {choices.map((participant) => (
          <DropdownMenuItem
            key={participant.id}
            onSelect={() => action.onSelectParticipant?.(participant.id)}
          >
            <ChoreAssigneeAvatar participant={participant} />
            <span className="min-w-0 flex-1 truncate">{participant.displayName}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const blackThemeCardEdge = {
  borderColor: 'rgba(255,255,255,0.16)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.055)',
} as const;

function isSameLocalDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function localDayNumber(value: Date) {
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86_400_000;
}

function occurrenceScheduleLabel(
  occurrence: ChoreOccurrence,
  now: Date,
  i18n: ReturnType<typeof useI18n>
) {
  const scheduledAt = new Date(occurrence.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) return i18n.t('household.today.upcoming');

  const daysAway = localDayNumber(scheduledAt) - localDayNumber(now);
  const day = isSameLocalDay(scheduledAt, now)
    ? i18n.t('household.tabs.today')
    : daysAway === -1
      ? new Intl.RelativeTimeFormat(i18n.locale, { numeric: 'auto' }).format(-1, 'day')
      : daysAway > 0 && daysAway < 7
        ? i18n.formatDate(scheduledAt, { weekday: 'short', month: 'short', day: 'numeric' })
        : i18n.formatDate(scheduledAt, {
            month: 'short',
            day: 'numeric',
            ...(scheduledAt.getFullYear() !== now.getFullYear()
              ? { year: 'numeric' as const }
              : {}),
          });

  return `${day} · ${i18n.formatTime(scheduledAt)}`;
}

function statusDetails(occurrence: ChoreOccurrence, now: Date, i18n: ReturnType<typeof useI18n>) {
  const { t } = i18n;
  const timing = getChoreTiming(occurrence, now);
  if (occurrence.status === 'done') {
    return { label: t('household.today.done'), tone: 'success' as const, Icon: CheckCircle2 };
  }
  if (occurrence.status === 'awaiting_approval') {
    return {
      label: t('household.today.awaitingApproval'),
      tone: 'warning' as const,
      Icon: ShieldCheck,
    };
  }
  if (occurrence.status === 'claimed') {
    return { label: t('household.today.claimed'), tone: 'accent' as const, Icon: CircleDashed };
  }
  if (occurrence.status === 'missed') {
    return { label: t('household.today.missed'), tone: 'danger' as const, Icon: RotateCcw };
  }
  if (timing === 'overdue') {
    return { label: t('household.today.overdue'), tone: 'danger' as const, Icon: Clock3 };
  }
  return {
    label:
      timing === 'due' ? t('household.today.due') : occurrenceScheduleLabel(occurrence, now, i18n),
    tone: 'neutral' as const,
    Icon: Circle,
  };
}

function assigneeLabel(
  occurrence: ChoreOccurrence,
  participantsById: Record<string, ChoreParticipant>,
  t: ReturnType<typeof useI18n>['t']
) {
  if (occurrence.assigneeIds.length === 0) return t('household.assignment.anyone');
  return occurrence.assigneeIds
    .map((id) => participantsById[id]?.displayName)
    .filter(Boolean)
    .join(', ');
}

function participantInitials(displayName: string) {
  return displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function ChoreAssigneeAvatar({ participant }: { participant?: ChoreParticipant }) {
  const { accentColor } = useTheme();
  const AvatarIcon = participant?.avatarIcon
    ? resolveLightIconComponent(participant.avatarIcon)
    : null;

  return (
    <Avatar
      className="h-8 w-8 shrink-0 border"
      style={{
        backgroundColor: participant?.color ?? accentColor,
        borderColor: participant?.color ?? accentColor,
      }}
      title={participant?.displayName}
      aria-hidden="true"
    >
      {participant?.avatarUrl ? <AvatarImage src={participant.avatarUrl} alt="" /> : null}
      <AvatarFallback
        className="bg-transparent text-xs font-semibold"
        style={{ color: getReadableAccentForeground(participant?.color ?? accentColor) }}
      >
        {participant ? (
          AvatarIcon ? (
            <AvatarIcon className="h-3.5 w-3.5" aria-hidden="true" />
          ) : participant.avatarIcon && isEmojiLightIcon(participant.avatarIcon) ? (
            <span aria-hidden="true">{participant.avatarIcon.trim()}</span>
          ) : (
            participantInitials(participant.displayName)
          )
        ) : (
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </AvatarFallback>
    </Avatar>
  );
}

function ChoreAssigneeSummary({
  occurrence,
  participantsById,
}: {
  occurrence: ChoreOccurrence;
  participantsById: Record<string, ChoreParticipant>;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const assignees = occurrence.assigneeIds
    .map((id) => participantsById[id])
    .filter((participant): participant is ChoreParticipant => Boolean(participant));

  return (
    <div data-chore-assignment="true" className="flex min-w-0 items-center gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex shrink-0 -space-x-2">
          {assignees.length > 0 ? (
            assignees
              .slice(0, 3)
              .map((participant) => (
                <ChoreAssigneeAvatar key={participant.id} participant={participant} />
              ))
          ) : (
            <ChoreAssigneeAvatar />
          )}
        </div>
        <div className="min-w-0 @max-[160px]/chore-footer:hidden" data-chore-assignee-name="true">
          <p className={cn('truncate text-xs font-normal leading-4', surface.textSecondary)}>
            {assigneeLabel(occurrence, participantsById, t)}
          </p>
        </div>
      </div>
    </div>
  );
}

function ChoreEarnedPoints({ points }: { points: number }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const earnedLabel = t('household.card.earned');
  const pointsLabel = t('household.card.points', { count: points });
  const readableColor = getCardReadableTextTokens({
    theme,
    tone: 'green',
    baseColor: themeColorValues.green,
  }).titleColor;

  return (
    <span
      data-chore-earned-points="true"
      className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border pr-2 pl-1 text-xs font-semibold leading-none tabular-nums"
      style={{
        backgroundColor: `${themeColorValues.green}14`,
        borderColor: `${themeColorValues.green}52`,
        color: readableColor,
      }}
      title={`${pointsLabel} · ${earnedLabel}`}
    >
      <span
        aria-hidden="true"
        className="flex h-4 w-4 items-center justify-center rounded-full text-white shadow-sm"
        style={{ backgroundColor: themeColorValues.green }}
      >
        <Check className="h-2.5 w-2.5 stroke-[2.5]" />
      </span>
      <span aria-hidden="true">+{points}</span>
      <span className="sr-only">{`${pointsLabel} · ${earnedLabel}`}</span>
    </span>
  );
}

export function ChoreFocusCard({
  size = 'medium',
  definition,
  occurrence,
  participantsById,
  presentation,
  action,
  childMode = false,
  now = new Date(),
}: {
  size?: 'small' | 'medium';
  definition: ChoreDefinition;
  occurrence: ChoreOccurrence;
  participantsById: Record<string, ChoreParticipant>;
  presentation?: ChorePresentationMetadata;
  action?: ChoreCardAction;
  childMode?: boolean;
  now?: Date;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const status = statusDetails(occurrence, now, i18n);
  const missedScheduleLabel =
    occurrence.status === 'missed' ? occurrenceScheduleLabel(occurrence, now, i18n) : undefined;
  const completed = occurrence.status === 'done';
  const title = childMode && presentation?.childTitle ? presentation.childTitle : definition.title;
  const ChoreIcon = resolveChoreIconComponent(presentation?.icon);
  const choreGradient = resolveChoreColorPalette(definition.id, presentation?.color);
  const stateGradient = completed
    ? { primary: themeColorValues.green, secondary: themeColorValues.teal }
    : status.tone === 'danger'
      ? { primary: themeColorValues.red, secondary: themeColorValues.orange }
      : choreGradient;
  const gradientOpacity =
    theme === 'glass'
      ? { primary: '1c', secondary: '14', bridge: '08' }
      : theme === 'light'
        ? { primary: '12', secondary: '0b', bridge: '06' }
        : theme === 'black'
          ? { primary: '14', secondary: '10', bridge: '06' }
          : { primary: '16', secondary: '12', bridge: '07' };
  const isOverdue =
    occurrence.status === 'available' && getChoreTiming(occurrence, now) === 'overdue';
  const statusColor =
    status.tone === 'danger'
      ? themeColorValues.red
      : status.tone === 'warning'
        ? themeColorValues.yellow
        : status.tone === 'success'
          ? themeColorValues.green
          : status.tone === 'accent'
            ? themeColorValues.purple
            : undefined;
  const statusReadableColor = statusColor
    ? getCardReadableTextTokens({
        theme,
        tone:
          status.tone === 'danger'
            ? 'red'
            : status.tone === 'warning'
              ? 'yellow'
              : status.tone === 'success'
                ? 'green'
                : 'purple',
        baseColor: statusColor,
      }).titleColor
    : undefined;
  const metricReadableColor = getCardReadableTextTokens({
    theme,
    tone: 'primary',
    baseColor: stateGradient.primary,
  }).titleColor;
  const cardEdgeStyle = isOverdue
    ? {
        borderColor: themeColorValues.red,
        boxShadow: `inset 0 1px 0 ${themeColorValues.red}24, 0 0 0 1px ${themeColorValues.red}14`,
      }
    : theme === 'black'
      ? blackThemeCardEdge
      : undefined;

  return (
    <ChoreBaseCard
      size={size}
      title={title}
      eyebrow={
        <>
          {definition.roomRef?.label ? (
            <span className="hidden min-[420px]:inline">
              <span>{definition.roomRef.label}</span>
              <span aria-hidden="true"> · </span>
            </span>
          ) : null}
          <span data-chore-status="true" style={{ color: statusReadableColor }}>
            {status.label}
          </span>
          {missedScheduleLabel ? (
            <>
              <span aria-hidden="true"> · </span>
              <span data-chore-scheduled-time="true">{missedScheduleLabel}</span>
            </>
          ) : null}
        </>
      }
      leading={
        <EntityCardHeaderIcon
          IconComponent={ChoreIcon}
          isActive={!completed}
          size="small"
          tone={status.tone === 'danger' ? 'red' : status.tone === 'warning' ? 'amber' : 'primary'}
          baseColor={stateGradient.primary}
        />
      }
      metrics={
        completed ? undefined : (
          <>
            {presentation?.estimatedMinutes ? (
              <span
                className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-xs font-semibold tabular-nums"
                style={{
                  backgroundColor: `${stateGradient.primary}14`,
                  borderColor: `${stateGradient.primary}52`,
                  color: metricReadableColor,
                }}
                title={t('household.card.minutes', {
                  count: presentation.estimatedMinutes,
                })}
              >
                <Clock3 className="h-3 w-3" aria-hidden="true" />
                <span>
                  {t('household.card.compactMinutes', {
                    count: presentation.estimatedMinutes,
                  })}
                </span>
              </span>
            ) : null}
            {presentation?.points ? (
              <ChorePointsToken points={presentation.points} color={stateGradient.primary} />
            ) : null}
          </>
        )
      }
      instructions={
        definition.description ? (
          <p className={cn('line-clamp-2 text-xs leading-5', surface.textSecondary)}>
            {definition.description}
          </p>
        ) : undefined
      }
      footerLeading={
        <ChoreAssigneeSummary occurrence={occurrence} participantsById={participantsById} />
      }
      footerAction={
        completed && presentation?.points ? (
          <ChoreEarnedPoints points={presentation.points} />
        ) : action ? (
          <ChoreActionControl action={action} participantsById={participantsById} />
        ) : undefined
      }
      surfaceVariant={completed ? 'muted' : 'default'}
      style={cardEdgeStyle}
      overlay={
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(circle at 0% 0%, ${stateGradient.primary}${gradientOpacity.primary}, transparent 48%), radial-gradient(circle at 100% 100%, ${stateGradient.secondary}${gradientOpacity.secondary}, transparent 52%), linear-gradient(135deg, ${stateGradient.primary}${gradientOpacity.bridge} 0%, transparent 52%, ${stateGradient.secondary}${gradientOpacity.bridge} 100%)`,
          }}
        />
      }
      className={cn(completed && 'opacity-75')}
    />
  );
}

export function ChoreListItem({
  size = 'medium',
  definition,
  occurrence,
  participantsById,
  presentation,
  action,
  now = new Date(),
}: {
  size?: 'small' | 'medium';
  definition: ChoreDefinition;
  occurrence: ChoreOccurrence;
  participantsById: Record<string, ChoreParticipant>;
  presentation?: ChorePresentationMetadata;
  action?: ChoreCardAction;
  now?: Date;
}) {
  return (
    <ChoreFocusCard
      size={size}
      definition={definition}
      occurrence={occurrence}
      participantsById={participantsById}
      presentation={presentation}
      action={action}
      now={now}
    />
  );
}
