import {
  CardDialogBody,
  CardDialogFooter,
  CardDialogHeader,
  CardDialogSection,
  DashboardEmptyState,
  NavigationWorkspace,
  TableCellContent,
} from '@navet/app/components/patterns';
import {
  BaseCardDialog,
  Button,
  Input,
  Panel,
  Select,
  SheetSurface,
  SheetSurfaceHeader,
  Textarea,
} from '@navet/app/components/primitives';
import { EntityCardHeaderIcon } from '@navet/app/components/primitives/entity-card-header-icon';
import { getReadableAccentForeground } from '@navet/app/components/shared/theme/theme-colors';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { navetIconSizeTokens, navetTypographyTokens } from '@navet/app/components/system/tokens';
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
import {
  SettingsEmbeddedSurface,
  SettingsItem,
  SettingsSectionShell,
} from '@navet/app/features/settings/components/settings-section-shell';
import { getSettingsSectionStyles } from '@navet/app/features/settings/hooks/settings-section-styles';
import { useI18n, useMediaQuery, useTheme } from '@navet/app/hooks';
import {
  type ChoreMission,
  type ChoreProgressTarget,
  type ChoreRewardGoal,
  type ChoreRewardRequest,
  normalizeChoreExperienceState,
} from '@navet/core/chore-experience';
import { buildChoreWeeklyReport, formatChoreWeeklyReport } from '@navet/core/chore-insights';
import { choreTargetProgress, progressCycleKey } from '@navet/core/chore-progress-policy';
import {
  type ChoreDefinition,
  type ChoreParticipant,
  type ChoreWorkspaceAction,
  type ChoreWorkspaceData,
  getChoreExperiencePointBalances,
  isChoreParticipantPausedAt,
} from '@navet/core/chores';
import {
  Archive,
  ClipboardList,
  Clock3,
  Copy,
  DatabaseBackup,
  Gift,
  HeartHandshake,
  ListFilter,
  Minus,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { getChoreCardAction } from '../chore-card-action';
import {
  getMissedScheduledChoreHistory,
  getMissionProgressList,
  getNextChores,
  getParticipantPointHistory,
  getRewardProgressList,
} from '../chore-dashboard-selectors';
import { useChoreClock } from '../use-chore-clock';
import { ChoreBaseCard } from './chore-base-card';
import { ChoreListItem } from './chore-card';
import { ChoreDashboardGrid } from './chore-dashboard-grid';
import { ProgressTargetDialog } from './chore-experience-dialogs';
import {
  ChoreFieldError,
  isBoundedInteger,
  type NumericDraft,
  numericDraft,
} from './chore-form-validation';
import { resolveChoreIconComponent } from './chore-icon';
import { ChorePointsToken } from './chore-points-token';
import { MissionCard, RewardGoalCard } from './chore-support-cards';

function assignmentLabel(
  definition: ChoreDefinition,
  participants: Record<string, ChoreParticipant>,
  t: ReturnType<typeof useI18n>['t']
) {
  if (definition.assignment.mode === 'anyone') return t('household.assignment.anyone');
  if (definition.assignment.mode === 'everyone') return t('household.assignment.everyone');
  if (definition.assignment.mode === 'rotation') return t('household.assignment.rotation');
  return (
    participants[definition.assignment.participantIds[0] ?? '']?.displayName ??
    t('household.assignment.person')
  );
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

function ProgressParticipantAvatar({ participant }: { participant: ChoreParticipant }) {
  const { accentColor } = useTheme();
  const AvatarIcon = participant.avatarIcon
    ? resolveLightIconComponent(participant.avatarIcon)
    : null;

  return (
    <Avatar
      className="h-8 w-8 shrink-0 border"
      style={{
        backgroundColor: participant.color ?? accentColor,
        borderColor: participant.color ?? accentColor,
      }}
      aria-hidden="true"
    >
      {participant.avatarUrl ? <AvatarImage src={participant.avatarUrl} alt="" /> : null}
      <AvatarFallback
        className="bg-transparent text-xs font-semibold"
        style={{ color: getReadableAccentForeground(participant.color ?? accentColor) }}
      >
        {AvatarIcon ? (
          <AvatarIcon className="h-3.5 w-3.5" aria-hidden="true" />
        ) : participant.avatarIcon && isEmojiLightIcon(participant.avatarIcon) ? (
          <span aria-hidden="true">{participant.avatarIcon.trim()}</span>
        ) : (
          participantInitials(participant.displayName)
        )}
      </AvatarFallback>
    </Avatar>
  );
}

function choreScheduleLabel(definition: ChoreDefinition, t: ReturnType<typeof useI18n>['t']) {
  if (definition.schedule.frequency === 'once') return t('household.schedule.once');
  if (definition.schedule.frequency === 'daily') {
    const intervalDays = definition.schedule.intervalDays ?? 1;
    return intervalDays > 1
      ? t('household.schedule.everyDays', { count: intervalDays })
      : t('household.schedule.daily');
  }
  if (definition.schedule.frequency === 'weekly') {
    if (definition.schedule.intervalWeeks === 2) return t('household.schedule.biweekly');
    if (definition.schedule.intervalWeeks === 3) return t('household.schedule.triweekly');
    if (definition.schedule.intervalWeeks === 4) return t('household.schedule.fourWeekly');
    return t('household.schedule.weekly');
  }
  if (definition.schedule.frequency === 'monthly') return t('household.schedule.monthly');
  if (definition.schedule.frequency === 'hourly') {
    return t('household.schedule.everyHours', { count: definition.schedule.intervalHours });
  }
  return t(
    definition.schedule.intervalDays === 1
      ? 'household.schedule.dayAfterCompletion'
      : 'household.schedule.daysAfterCompletion',
    { count: definition.schedule.intervalDays }
  );
}

function LibraryAssignmentSummary({
  definition,
  participants,
}: {
  definition: ChoreDefinition;
  participants: Record<string, ChoreParticipant>;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const assignedParticipants = definition.assignment.participantIds
    .map((id) => participants[id])
    .filter((participant): participant is ChoreParticipant => Boolean(participant));

  return (
    <div className="flex min-w-0 items-center gap-2">
      {assignedParticipants.length > 0 ? (
        <div className="flex shrink-0 -space-x-2" aria-hidden="true">
          {assignedParticipants.slice(0, 3).map((participant) => (
            <ProgressParticipantAvatar key={participant.id} participant={participant} />
          ))}
        </div>
      ) : (
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-current/10 bg-current/[0.08]',
            surface.textSecondary
          )}
          aria-hidden="true"
        >
          <Users className="h-3.5 w-3.5" />
        </span>
      )}
      <span className={cn('min-w-0 truncate text-xs font-normal leading-4', surface.textSecondary)}>
        {assignmentLabel(definition, participants, t)}
      </span>
    </div>
  );
}

function ChoreFilterFields({
  room,
  onRoomChange,
  roomOptions,
  person,
  onPersonChange,
  participants,
  recurrence,
  onRecurrenceChange,
  status,
  onStatusChange,
}: {
  room: string;
  onRoomChange: (value: string) => void;
  roomOptions: ReadonlyArray<readonly [string, string]>;
  person: string;
  onPersonChange: (value: string) => void;
  participants: Record<string, ChoreParticipant>;
  recurrence: string;
  onRecurrenceChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
}) {
  const { t } = useI18n();

  return (
    <>
      <Select
        size="small"
        aria-label={t('household.filters.room')}
        value={room}
        onChange={(event) => onRoomChange(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <option value="all">{t('household.filters.allRooms')}</option>
        {roomOptions.map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </Select>
      <Select
        size="small"
        aria-label={t('household.filters.person')}
        value={person}
        onChange={(event) => onPersonChange(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <option value="all">{t('household.personPicker.all')}</option>
        {Object.values(participants).map((participant) => (
          <option key={participant.id} value={participant.id}>
            {participant.displayName}
          </option>
        ))}
      </Select>
      <Select
        size="small"
        aria-label={t('household.filters.recurrence')}
        value={recurrence}
        onChange={(event) => onRecurrenceChange(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <option value="all">{t('household.filters.allSchedules')}</option>
        <option value="once">{t('household.schedule.once')}</option>
        <option value="daily">{t('household.schedule.daily')}</option>
        <option value="weekly">{t('household.schedule.weekly')}</option>
        <option value="monthly">{t('household.schedule.monthly')}</option>
        <option value="after_completion">{t('household.schedule.afterCompletion')}</option>
      </Select>
      <Select
        size="small"
        aria-label={t('household.filters.status')}
        value={status}
        onChange={(event) => onStatusChange(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <option value="all">{t('household.filters.allStatuses')}</option>
        <option value="active">{t('household.chores.active')}</option>
        <option value="paused">{t('household.chores.paused')}</option>
        <option value="archived">{t('household.chores.archived')}</option>
      </Select>
    </>
  );
}

export function AllChoresView({
  data,
  initialRoomId,
  onAdd,
  onEdit,
  onDuplicate,
  onToggleEnabled,
  onArchive,
  onDelete,
  onRestore,
}: {
  data: ChoreWorkspaceData;
  initialRoomId?: string;
  onAdd: () => void;
  onEdit: (definition: ChoreDefinition) => void;
  onDuplicate: (definition: ChoreDefinition) => void;
  onToggleEnabled: (definition: ChoreDefinition) => void;
  onArchive: (definition: ChoreDefinition) => void;
  onDelete: (definition: ChoreDefinition) => void;
  onRestore: (definition: ChoreDefinition) => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const now = useChoreClock();
  const nextByDefinition = useMemo(
    () => new Map(getNextChores(data, 'all', now).map((item) => [item.definitionId, item])),
    [data, now]
  );
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const [query, setQuery] = useState('');
  const [room, setRoom] = useState('all');
  const [person, setPerson] = useState('all');
  const [recurrence, setRecurrence] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  useEffect(() => {
    if (initialRoomId) setRoom(initialRoomId);
  }, [initialRoomId]);
  const experience = normalizeChoreExperienceState(data.experience);
  const roomOptions = [
    ...new Map(
      Object.values(data.definitionsById).flatMap((definition) =>
        definition.roomRef
          ? [[definition.roomRef.canonicalId, definition.roomRef.label] as const]
          : []
      )
    ).entries(),
  ];
  const definitions = Object.values(data.definitionsById)
    .filter((definition) => !definition.archivedAt)
    .filter(
      (definition) =>
        statusFilter === 'all' ||
        (statusFilter === 'active' && definition.enabled) ||
        (statusFilter === 'paused' && !definition.enabled)
    )
    .filter(
      (definition) =>
        !query.trim() ||
        [definition.title, definition.description, definition.roomRef?.label]
          .filter(Boolean)
          .some((value) => value?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    )
    .filter((definition) => room === 'all' || definition.roomRef?.canonicalId === room)
    .filter(
      (definition) => person === 'all' || definition.assignment.participantIds.includes(person)
    )
    .filter((definition) => recurrence === 'all' || definition.schedule.frequency === recurrence)
    .sort((left, right) => left.title.localeCompare(right.title));
  const archivedDefinitions = Object.values(data.definitionsById)
    .filter((definition) => Boolean(definition.archivedAt))
    .sort((left, right) => left.title.localeCompare(right.title));
  const activeFilterCount =
    Number(room !== 'all') +
    Number(person !== 'all') +
    Number(recurrence !== 'all') +
    Number(statusFilter !== 'all');

  return (
    <div>
      <section
        aria-label={t('household.chores.title')}
        className="mb-4 flex min-w-0 items-center gap-2"
      >
        <Input
          type="search"
          size="small"
          aria-label={t('household.chores.search')}
          placeholder={t('household.chores.search')}
          leading={<Search className="h-4 w-4" aria-hidden="true" />}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          containerClassName="min-w-0 flex-1 sm:max-w-sm"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="small"
              variant="secondary"
              className="relative h-9 w-9 shrink-0 justify-center p-0"
              aria-label={t('dashboard.addCard.filter.label')}
            >
              <ListFilter className="h-4 w-4" aria-hidden="true" />
              {activeFilterCount > 0 ? (
                <span
                  data-active-filter-count="true"
                  className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none"
                  style={{
                    backgroundColor: theme === 'light' ? '#111827' : '#ffffff',
                    color: theme === 'light' ? '#ffffff' : '#111827',
                  }}
                >
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={8}
            className="w-80 max-w-[calc(100vw-2rem)] overflow-visible p-2"
          >
            <DropdownMenuLabel className="px-1 pt-1 pb-2 text-xs font-semibold">
              {t('dashboard.addCard.filter.label')}
            </DropdownMenuLabel>
            <div className="grid gap-2">
              <ChoreFilterFields
                room={room}
                onRoomChange={setRoom}
                roomOptions={roomOptions}
                person={person}
                onPersonChange={setPerson}
                participants={data.participantsById}
                recurrence={recurrence}
                onRecurrenceChange={setRecurrence}
                status={statusFilter}
                onStatusChange={setStatusFilter}
              />
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="small"
          className="shrink-0"
          leading={<Plus className="h-4 w-4" aria-hidden="true" />}
          onClick={onAdd}
        >
          {t('household.chores.add')}
        </Button>
      </section>
      {statusFilter === 'archived' ? null : definitions.length === 0 ? (
        <DashboardEmptyState
          compact
          variant="inline"
          icon={ClipboardList}
          title={query ? t('household.chores.noResults') : t('household.chores.empty')}
          description={
            query ? t('household.filters.tryAgain') : t('household.today.emptyDescription')
          }
          actionLabel={!query ? t('household.chores.add') : undefined}
          onAction={!query ? onAdd : undefined}
          actionIcon={Plus}
        />
      ) : (
        <ChoreDashboardGrid>
          {definitions.map((definition) => {
            const presentation = experience.presentationByDefinitionId[definition.id];
            const ChoreIcon = resolveChoreIconComponent(presentation?.icon);
            const next = nextByDefinition.get(definition.id);
            const scheduleLabel = choreScheduleLabel(definition, t);
            return (
              <ChoreBaseCard
                key={definition.id}
                title={definition.title}
                eyebrow={
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="min-w-0 truncate" title={scheduleLabel}>
                      {definition.roomRef?.label ? (
                        <>
                          <span>{definition.roomRef.label}</span>
                          <span aria-hidden="true"> · </span>
                        </>
                      ) : null}
                      <span className={cn(!definition.enabled && 'text-amber-400')}>
                        {definition.enabled ? scheduleLabel : t('household.chores.paused')}
                      </span>
                    </span>
                    {next ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <time className="shrink-0 tabular-nums" dateTime={next.scheduledAt}>
                          {t('household.chores.nextScheduled', {
                            date: `${i18n.formatDate(new Date(next.scheduledAt), { month: 'short', day: 'numeric' })} · ${i18n.formatTime(new Date(next.scheduledAt))}`,
                          })}
                        </time>
                      </>
                    ) : null}
                  </span>
                }
                leading={
                  <EntityCardHeaderIcon
                    IconComponent={ChoreIcon}
                    isActive={definition.enabled}
                    size="small"
                    tone="primary"
                  />
                }
                metrics={
                  <>
                    {presentation?.estimatedMinutes ? (
                      <span
                        className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-current/20 bg-current/[0.06] px-2 text-xs font-semibold tabular-nums"
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
                    {experience.gamificationMode !== 'off' && presentation?.points ? (
                      <ChorePointsToken points={presentation.points} />
                    ) : null}
                  </>
                }
                instructions={
                  definition.description ? (
                    <p className={cn('line-clamp-2 text-xs leading-5', surface.textSecondary)}>
                      {definition.description}
                    </p>
                  ) : undefined
                }
                footerLeading={
                  <LibraryAssignmentSummary
                    definition={definition}
                    participants={data.participantsById}
                  />
                }
                footerAction={
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="compact"
                      variant="secondary"
                      className="min-w-20 justify-center px-3"
                      leading={<Pencil className="h-4 w-4" aria-hidden="true" />}
                      onClick={() => onEdit(definition)}
                    >
                      {t('household.actions.edit')}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="compact"
                          variant="secondary"
                          className="h-9 w-9 justify-center p-0"
                          aria-label={t('common.moreActions')}
                        >
                          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" sideOffset={8}>
                        <DropdownMenuItem onSelect={() => onDuplicate(definition)}>
                          <Copy className="h-4 w-4 stroke-[2.25]" aria-hidden="true" />
                          {t('household.actions.duplicate')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onToggleEnabled(definition)}>
                          {definition.enabled ? (
                            <Pause className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Play className="h-4 w-4" aria-hidden="true" />
                          )}
                          {definition.enabled
                            ? t('household.chores.pause')
                            : t('household.chores.resume')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onArchive(definition)}>
                          <Archive className="h-4 w-4" aria-hidden="true" />
                          {t('household.chores.archive')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => onDelete(definition)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          {t('household.chores.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                }
                surfaceVariant={definition.enabled ? 'default' : 'muted'}
                className={cn(!definition.enabled && 'opacity-75')}
              />
            );
          })}
        </ChoreDashboardGrid>
      )}
      {archivedDefinitions.length > 0 && (statusFilter === 'all' || statusFilter === 'archived') ? (
        <details className="group mt-5" open={statusFilter === 'archived' || undefined}>
          <summary
            className={cn(
              'flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-xl text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden',
              surface.textSecondary
            )}
          >
            {t('household.chores.archived')} · {archivedDefinitions.length}
          </summary>
          <div className="mt-2 grid gap-2">
            {archivedDefinitions.map((definition) => (
              <Panel
                key={definition.id}
                muted
                className="flex min-h-14 items-center gap-3 px-4 py-2"
              >
                <span
                  className={cn('min-w-0 flex-1 truncate text-sm font-medium', surface.textPrimary)}
                >
                  {definition.title}
                </span>
                <Button
                  size="compact"
                  variant="ghost"
                  className="min-h-10"
                  leading={<RotateCcw className="h-3.5 w-3.5" />}
                  onClick={() => onRestore(definition)}
                >
                  {t('household.chores.restore')}
                </Button>
              </Panel>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function MissionsView({
  data,
  onAdd,
  onEdit,
  onDelete,
}: {
  data: ChoreWorkspaceData;
  onAdd: () => void;
  onEdit: (mission: ChoreMission) => void;
  onDelete: (mission: ChoreMission) => void;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ChoreMission['status']>('all');
  const allMissions = getMissionProgressList(data);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const missions = allMissions
    .filter(
      ({ mission }) =>
        !normalizedQuery ||
        [mission.title, mission.description]
          .filter(Boolean)
          .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))
    )
    .filter(({ mission }) => statusFilter === 'all' || mission.status === statusFilter);
  return (
    <div>
      <section
        aria-label={t('household.missions.title')}
        className="mb-4 flex min-w-0 items-center gap-2"
      >
        <Input
          type="search"
          size="small"
          aria-label={t('household.filters.search')}
          placeholder={t('household.filters.search')}
          leading={<Search className="h-4 w-4" aria-hidden="true" />}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          containerClassName="min-w-0 flex-1 sm:max-w-sm"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="small"
              variant="secondary"
              className="relative h-9 w-9 shrink-0 justify-center p-0"
              aria-label={t('dashboard.addCard.filter.label')}
            >
              <ListFilter className="h-4 w-4" aria-hidden="true" />
              {statusFilter !== 'all' ? (
                <span
                  data-active-filter-count="true"
                  className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none"
                  style={{
                    backgroundColor: theme === 'light' ? '#111827' : '#ffffff',
                    color: theme === 'light' ? '#ffffff' : '#111827',
                  }}
                >
                  1
                </span>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={8}
            className="w-80 max-w-[calc(100vw-2rem)] overflow-visible p-2"
          >
            <DropdownMenuLabel className="px-1 pt-1 pb-2 text-xs font-semibold">
              {t('dashboard.addCard.filter.label')}
            </DropdownMenuLabel>
            <Select
              size="small"
              aria-label={t('household.filters.status')}
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as 'all' | ChoreMission['status'])
              }
            >
              <option value="all">{t('household.filters.allStatuses')}</option>
              <option value="active">{t('household.missions.active')}</option>
              <option value="upcoming">{t('household.missions.upcoming')}</option>
              <option value="complete">{t('household.missions.complete')}</option>
            </Select>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="small"
          className="shrink-0"
          leading={<Plus className="h-4 w-4" aria-hidden="true" />}
          onClick={onAdd}
        >
          {t('household.missions.add')}
        </Button>
      </section>
      {missions.length === 0 ? (
        <DashboardEmptyState
          compact
          variant="inline"
          icon={HeartHandshake}
          title={t('household.missions.emptyTitle')}
          description={
            allMissions.length > 0
              ? t('household.filters.tryAgain')
              : t('household.missions.emptyDescription')
          }
          actionLabel={allMissions.length === 0 ? t('household.missions.add') : undefined}
          onAction={allMissions.length === 0 ? onAdd : undefined}
          actionIcon={Plus}
        />
      ) : (
        <ChoreDashboardGrid>
          {missions.map((progress) => (
            <MissionCard
              key={progress.mission.id}
              progress={progress}
              footer={
                <div className="flex items-center gap-1.5">
                  <Button
                    size="compact"
                    variant="secondary"
                    className="min-w-20 justify-center px-3"
                    leading={<Pencil className="h-4 w-4" />}
                    aria-label={t('household.missions.editNamed', { name: progress.mission.title })}
                    onClick={() => onEdit(progress.mission)}
                  >
                    {t('household.actions.edit')}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="compact"
                        variant="secondary"
                        className="h-9 w-9 justify-center p-0"
                        aria-label={t('common.moreActions')}
                      >
                        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={8}>
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => onDelete(progress.mission)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        {t('household.chores.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              }
            />
          ))}
        </ChoreDashboardGrid>
      )}
    </div>
  );
}

export function RewardsView({
  data,
  onAdd,
  onEdit,
  onDelete,
  selectedParticipantId,
  onRequest,
  onDecision,
}: {
  data: ChoreWorkspaceData;
  onAdd: () => void;
  onEdit: (reward: ChoreRewardGoal) => void;
  onDelete: (reward: ChoreRewardGoal) => void;
  selectedParticipantId: string;
  onRequest: (rewardId: string, participantId: string) => void;
  onDecision: (
    request: ChoreRewardRequest,
    decision: 'approve' | 'decline' | 'fulfill' | 'refund'
  ) => void;
}) {
  const { t } = useI18n();
  const now = useChoreClock();
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ChoreRewardGoal['type']>('all');
  const allRewards = getRewardProgressList(data);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const rewards = allRewards
    .filter(
      ({ goal }) => !normalizedQuery || goal.title.toLocaleLowerCase().includes(normalizedQuery)
    )
    .filter(({ goal }) => typeFilter === 'all' || goal.type === typeFilter);
  const eligibleParticipants = Object.values(data.participantsById).filter(
    (participant) =>
      !isChoreParticipantPausedAt(participant, now.toISOString()) &&
      participant.capabilities.includes('complete')
  );
  const [requestParticipantId, setRequestParticipantId] = useState('');
  const balances = getChoreExperiencePointBalances(data);
  const suggestedParticipantId =
    eligibleParticipants.find((participant) => (balances[participant.id] ?? 0) > 0)?.id ??
    eligibleParticipants[0]?.id;
  const activeParticipantId =
    selectedParticipantId !== 'all' &&
    eligibleParticipants.some((participant) => participant.id === selectedParticipantId)
      ? selectedParticipantId
      : requestParticipantId || suggestedParticipantId;
  const manager = Object.values(data.participantsById).some(
    (participant) =>
      !isChoreParticipantPausedAt(participant, now.toISOString()) &&
      participant.capabilities.includes('manage')
  );
  const requests = Object.values(data.experience?.rewardRequestsById ?? {})
    .filter(
      (request) =>
        selectedParticipantId === 'all' ||
        manager ||
        request.participantId === selectedParticipantId
    )
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  return (
    <div>
      <section
        aria-label={t('household.rewards.title')}
        className="mb-4 flex min-w-0 items-center gap-2"
      >
        <Input
          type="search"
          size="small"
          aria-label={t('household.filters.search')}
          placeholder={t('household.filters.search')}
          leading={<Search className="h-4 w-4" aria-hidden="true" />}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          containerClassName="min-w-0 flex-1 sm:max-w-sm"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="small"
              variant="secondary"
              className="relative h-9 w-9 shrink-0 justify-center p-0"
              aria-label={t('dashboard.addCard.filter.label')}
            >
              <ListFilter className="h-4 w-4" aria-hidden="true" />
              {typeFilter !== 'all' ? (
                <span
                  data-active-filter-count="true"
                  className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none"
                  style={{
                    backgroundColor: theme === 'light' ? '#111827' : '#ffffff',
                    color: theme === 'light' ? '#ffffff' : '#111827',
                  }}
                >
                  1
                </span>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={8}
            className="w-80 max-w-[calc(100vw-2rem)] overflow-visible p-2"
          >
            <DropdownMenuLabel className="px-1 pt-1 pb-2 text-xs font-semibold">
              {t('dashboard.addCard.filter.label')}
            </DropdownMenuLabel>
            <Select
              size="small"
              aria-label={t('household.rewardDialog.type')}
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value as 'all' | ChoreRewardGoal['type'])
              }
            >
              <option value="all">{t('household.rewards.allTypes')}</option>
              <option value="instant">{t('household.rewards.type.instant')}</option>
              <option value="saving">{t('household.rewards.type.saving')}</option>
              <option value="family">{t('household.rewards.type.family')}</option>
              <option value="experience">{t('household.rewards.type.experience')}</option>
            </Select>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="small"
          className="shrink-0"
          leading={<Plus className="h-4 w-4" aria-hidden="true" />}
          onClick={onAdd}
        >
          {t('household.rewards.add')}
        </Button>
      </section>
      {selectedParticipantId === 'all' && eligibleParticipants.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={cn('text-xs', theme === 'light' ? 'text-zinc-600' : 'text-white/70')}>
            {t('household.rewards.requestFor')}
          </span>
          <Select
            size="small"
            containerClassName="min-w-44 flex-1 sm:max-w-xs"
            aria-label={t('household.rewards.requestFor')}
            value={activeParticipantId}
            onChange={(event) => setRequestParticipantId(event.target.value)}
          >
            {eligibleParticipants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.displayName}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      {rewards.length === 0 ? (
        <DashboardEmptyState
          compact
          variant="inline"
          icon={Gift}
          title={t('household.rewards.emptyTitle')}
          description={
            allRewards.length > 0
              ? t('household.filters.tryAgain')
              : t('household.rewards.emptyDescription')
          }
          actionLabel={allRewards.length === 0 ? t('household.rewards.add') : undefined}
          onAction={allRewards.length === 0 ? onAdd : undefined}
          actionIcon={Plus}
        />
      ) : (
        <ChoreDashboardGrid>
          {rewards.map((progress) => (
            <RewardGoalCard
              key={progress.goal.id}
              progress={progress}
              footer={
                <div className="flex items-center gap-1.5">
                  {activeParticipantId &&
                  progress.goal.enabled &&
                  (!progress.goal.participantId ||
                    progress.goal.participantId === activeParticipantId) ? (
                    <Button
                      size="compact"
                      disabled={(balances[activeParticipantId] ?? 0) < progress.goal.targetPoints}
                      onClick={() => onRequest(progress.goal.id, activeParticipantId)}
                    >
                      {t('household.rewards.request')}
                    </Button>
                  ) : null}
                  <Button
                    size="compact"
                    variant="secondary"
                    className="min-w-20 justify-center px-3"
                    leading={<Pencil className="h-4 w-4" />}
                    aria-label={t('household.rewards.editNamed', { name: progress.goal.title })}
                    onClick={() => onEdit(progress.goal)}
                  >
                    {t('household.actions.edit')}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="compact"
                        variant="secondary"
                        className="h-9 w-9 justify-center p-0"
                        aria-label={t('common.moreActions')}
                      >
                        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={8}>
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => onDelete(progress.goal)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        {t('household.chores.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              }
            />
          ))}
        </ChoreDashboardGrid>
      )}
      {requests.length > 0 ? (
        <section
          aria-label={t('household.rewards.requests')}
          className={cn('mt-5 space-y-2', theme === 'light' ? 'text-zinc-900' : 'text-white')}
        >
          <h3 className="text-sm font-semibold">{t('household.rewards.requests')}</h3>
          {requests.map((request) => (
            <div
              key={request.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-current/10 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{request.rewardTitle}</p>
                <p className="text-xs opacity-70">
                  {data.participantsById[request.participantId]?.displayName} · {request.cost} ·{' '}
                  {t(`household.rewards.status.${request.status}`)}
                </p>
              </div>
              {manager ? (
                <div className="flex flex-wrap gap-1.5">
                  {request.status === 'requested' ? (
                    <>
                      <Button size="compact" onClick={() => onDecision(request, 'approve')}>
                        {t('household.rewards.approve')}
                      </Button>
                      <Button
                        size="compact"
                        variant="secondary"
                        onClick={() => onDecision(request, 'decline')}
                      >
                        {t('household.rewards.decline')}
                      </Button>
                    </>
                  ) : null}
                  {request.status === 'approved' ? (
                    <Button size="compact" onClick={() => onDecision(request, 'fulfill')}>
                      {t('household.rewards.fulfill')}
                    </Button>
                  ) : null}
                  {request.status === 'approved' || request.status === 'fulfilled' ? (
                    <Button
                      size="compact"
                      variant="secondary"
                      onClick={() => onDecision(request, 'refund')}
                    >
                      {t('household.rewards.refund')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

export function ProgressView({
  data,
  execute,
  onAdjustPoints,
  onSaveTarget,
  onDeleteTarget,
  requestManagementAccess,
}: {
  data: ChoreWorkspaceData;
  execute?: (action: ChoreWorkspaceAction) => Promise<boolean>;
  onAdjustPoints: (
    participant: ChoreParticipant,
    pointsDelta: number,
    reason: string
  ) => Promise<boolean>;
  onSaveTarget: (kind: 'badge' | 'achievement', target: ChoreProgressTarget) => Promise<boolean>;
  onDeleteTarget: (kind: 'badge' | 'achievement', target: ChoreProgressTarget) => void;
  requestManagementAccess: (action: () => void) => void;
}) {
  const { t } = useI18n();
  const now = useChoreClock();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [progressTarget, setProgressTarget] = useState<{
    kind: 'badge' | 'achievement';
    target?: ChoreProgressTarget;
  } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportFormat, setReportFormat] = useState<'markdown' | 'html'>('markdown');
  const [pointAdjustment, setPointAdjustment] = useState<{
    participantId: string;
    direction: 'add' | 'remove';
  } | null>(null);
  const gamificationEnabled =
    normalizeChoreExperienceState(data.experience).gamificationMode !== 'off';
  const experience = normalizeChoreExperienceState(data.experience);
  const progressTargets = [
    ...Object.values(experience.badgesById).map((target) => ({ kind: 'badge' as const, target })),
    ...Object.values(experience.achievementsById).map((target) => ({
      kind: 'achievement' as const,
      target,
    })),
  ];
  const weeklyReport = buildChoreWeeklyReport({
    workspace: data,
    events: data.activity,
    now: now.toISOString(),
  });
  const missedHistory = getMissedScheduledChoreHistory(data, now);
  const reportText = formatChoreWeeklyReport(weeklyReport, data.definitionsById, reportFormat);
  const completed = Object.values(data.occurrencesById).filter(
    (occurrence) => occurrence.status === 'done'
  );
  const balances = getChoreExperiencePointBalances(data);
  const people = Object.values(data.participantsById).map((participant) => {
    const completions = completed.filter(
      (occurrence) => occurrence.completedBy === participant.id
    ).length;
    return {
      participant,
      completions,
      points: balances[participant.id] ?? 0,
    };
  });
  const selectedParticipant = selectedParticipantId
    ? data.participantsById[selectedParticipantId]
    : undefined;
  const adjustmentParticipant = pointAdjustment
    ? data.participantsById[pointAdjustment.participantId]
    : undefined;
  const requestPointAdjustment = (participantId: string, direction: 'add' | 'remove') => {
    requestManagementAccess(() => setPointAdjustment({ participantId, direction }));
  };
  return (
    <>
      <ChoreDashboardGrid>
        {people.map(({ participant, completions, points }) => (
          <ChoreBaseCard
            key={participant.id}
            size="medium"
            surfaceVariant="muted"
            title={participant.displayName}
            eyebrow={t('household.progress.completedCount', { count: completions })}
            leading={<ProgressParticipantAvatar participant={participant} />}
            metrics={
              gamificationEnabled ? <ChorePointsToken points={points} showPlus={false} /> : null
            }
            footerLeading={
              gamificationEnabled ? (
                <div className="flex items-center gap-1.5" data-point-adjustment-control="true">
                  <Button
                    iconOnly
                    label={t('household.points.addFor', {
                      name: participant.displayName,
                    })}
                    size="compact"
                    variant="secondary"
                    onClick={() => requestPointAdjustment(participant.id, 'add')}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    iconOnly
                    label={t('household.points.removeFor', {
                      name: participant.displayName,
                    })}
                    size="compact"
                    variant="secondary"
                    onClick={() => requestPointAdjustment(participant.id, 'remove')}
                  >
                    <Minus className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              ) : null
            }
            footerAction={
              gamificationEnabled ? (
                <Button
                  size="compact"
                  variant="secondary"
                  className="min-w-20 justify-center px-3"
                  leading={<Clock3 className="h-4 w-4" />}
                  onClick={() => setSelectedParticipantId(participant.id)}
                >
                  {t('household.points.view')}
                </Button>
              ) : null
            }
          />
        ))}
      </ChoreDashboardGrid>
      {missedHistory.length > 0 ? (
        <section className="mt-6 space-y-3" aria-label={t('household.review.history')}>
          <h3 className={cn('text-base font-semibold', surface.textPrimary)}>
            {t('household.review.history')}
          </h3>
          <ChoreDashboardGrid>
            {missedHistory.map((occurrence) => {
              const definition = data.definitionsById[occurrence.definitionId];
              if (!definition) return null;
              return (
                <ChoreListItem
                  key={occurrence.id}
                  definition={definition}
                  occurrence={occurrence}
                  participantsById={data.participantsById}
                  now={now}
                  action={
                    execute
                      ? getChoreCardAction(occurrence, definition, 'all', execute, t)
                      : undefined
                  }
                />
              );
            })}
          </ChoreDashboardGrid>
        </section>
      ) : null}
      {gamificationEnabled ? (
        <section
          className={cn('mt-6 space-y-3', surface.textPrimary)}
          aria-label={t('household.progression.title')}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold">{t('household.progression.title')}</h3>
            <div className="flex flex-wrap gap-2">
              <Button
                size="compact"
                variant="secondary"
                onClick={() => requestManagementAccess(() => setProgressTarget({ kind: 'badge' }))}
              >
                {t('household.progression.addBadge')}
              </Button>
              <Button
                size="compact"
                variant="secondary"
                onClick={() =>
                  requestManagementAccess(() => setProgressTarget({ kind: 'achievement' }))
                }
              >
                {t('household.progression.addAchievement')}
              </Button>
            </div>
          </div>
          {progressTargets.length === 0 ? (
            <p className="text-sm opacity-70">{t('household.progression.empty')}</p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {progressTargets.map(({ kind, target }) => {
              const people = target.participantId
                ? [data.participantsById[target.participantId]].filter(Boolean)
                : Object.values(data.participantsById);
              const cycleKey = progressCycleKey(target.cycle, now.toISOString());
              return (
                <Panel key={`${kind}:${target.id}`} className="min-w-0 p-4">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{target.title}</p>
                      <p className="text-xs opacity-70">
                        {t(`household.progression.metric.${target.metric}`)} ·{' '}
                        {t(`household.progression.${target.cycle ?? 'once'}`)} · {target.target}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        iconOnly
                        size="compact"
                        variant="secondary"
                        label={t('household.progression.edit')}
                        onClick={() =>
                          requestManagementAccess(() => setProgressTarget({ kind, target }))
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        iconOnly
                        size="compact"
                        variant="secondary"
                        label={t('household.progression.delete')}
                        onClick={() => requestManagementAccess(() => onDeleteTarget(kind, target))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {people.map((person) => {
                      const achieved = experience.progressAwards.some(
                        (award) =>
                          award.targetId === target.id &&
                          award.participantId === person.id &&
                          award.cycleKey === cycleKey
                      );
                      const current = choreTargetProgress(
                        target,
                        person.id,
                        Object.values(data.occurrencesById),
                        experience.pointTransactions,
                        now.toISOString()
                      );
                      return (
                        <div
                          key={person.id}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="min-w-0 truncate">{person.displayName}</span>
                          <span className="shrink-0 tabular-nums">
                            {achieved
                              ? t('household.progression.earned')
                              : `${Math.min(current, target.target)}/${target.target}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              );
            })}
          </div>
        </section>
      ) : null}
      {progressTarget ? (
        <ProgressTargetDialog
          isOpen
          kind={progressTarget.kind}
          target={progressTarget.target}
          definitions={Object.values(data.definitionsById).filter(
            (definition) => !definition.archivedAt
          )}
          participants={Object.values(data.participantsById)}
          onOpenChange={(open) => {
            if (!open) setProgressTarget(null);
          }}
          onSave={(target) => onSaveTarget(progressTarget.kind, target)}
        />
      ) : null}
      <div className="mt-6">
        <Button variant="secondary" onClick={() => setReportOpen(true)}>
          {t('household.progression.weeklyReport')}
        </Button>
      </div>
      <BaseCardDialog
        variant="modal"
        titleInContent
        isOpen={reportOpen}
        onOpenChange={setReportOpen}
        title={t('household.progression.weeklyReport')}
        description={t('household.progression.reportDescription')}
        theme={theme}
        maxWidth="md"
        height="capped"
        bodyPadding={false}
      >
        <CardDialogBody>
          <CardDialogHeader
            title={t('household.progression.weeklyReport')}
            description={t('household.progression.reportDescription')}
            showRoomSelector={false}
          />
          <CardDialogSection label={t('household.progression.format')}>
            <Select
              value={reportFormat}
              onChange={(event) => setReportFormat(event.target.value as 'markdown' | 'html')}
            >
              <option value="markdown">{'Markdown'}</option>
              <option value="html">{'HTML'}</option>
            </Select>
          </CardDialogSection>
          <Textarea
            readOnly
            value={reportText}
            rows={12}
            aria-label={t('household.progression.weeklyReport')}
          />
          <CardDialogFooter>
            <Button type="button" onClick={() => void navigator.clipboard.writeText(reportText)}>
              {t('household.progression.copyReport')}
            </Button>
          </CardDialogFooter>
        </CardDialogBody>
      </BaseCardDialog>
      {selectedParticipant ? (
        <ParticipantPointsSheet
          data={data}
          participant={selectedParticipant}
          isOpen
          onOpenChange={(open) => {
            if (!open) setSelectedParticipantId(null);
          }}
        />
      ) : null}
      {adjustmentParticipant && pointAdjustment ? (
        <PointAdjustmentDialog
          isOpen
          participant={adjustmentParticipant}
          direction={pointAdjustment.direction}
          currentBalance={getChoreExperiencePointBalances(data)[adjustmentParticipant.id] ?? 0}
          onOpenChange={(open) => {
            if (!open) setPointAdjustment(null);
          }}
          onSave={(pointsDelta, reason) =>
            onAdjustPoints(adjustmentParticipant, pointsDelta, reason)
          }
        />
      ) : null}
    </>
  );
}

function ParticipantPointsSheet({
  data,
  participant,
  isOpen,
  onOpenChange,
}: {
  data: ChoreWorkspaceData;
  participant: ChoreParticipant;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const { accentColor, theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const history = useMemo(
    () => getParticipantPointHistory(data, participant.id),
    [data, participant.id]
  );
  const completedCount = Object.values(data.occurrencesById).filter(
    (occurrence) => occurrence.status === 'done' && occurrence.completedBy === participant.id
  ).length;
  return (
    <SheetSurface
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t('household.points.title', { name: participant.displayName })}
      description={t('household.points.description')}
      closeLabel={t('household.points.close')}
      accentColor={participant.color ?? accentColor}
      responsive
      contentClassName="sm:max-w-lg"
      bodyClassName="pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <SheetSurfaceHeader
        title={participant.displayName}
        description={t('household.points.description')}
        closeLabel={t('household.points.close')}
        onClose={() => onOpenChange(false)}
        className={cn('border-b', surface.border)}
      />
      <div className="px-4 pt-4 sm:px-5">
        <div
          className={cn(
            'flex items-center gap-3 rounded-2xl border p-4',
            surface.border,
            surface.subtleBg
          )}
        >
          <ProgressParticipantAvatar participant={participant} />
          <div className="min-w-0 flex-1">
            <p className={cn('text-sm font-semibold', surface.textPrimary)}>
              {t('household.points.currentBalance')}
            </p>
            <p className={cn('mt-0.5 text-xs', surface.textSecondary)}>
              {t('household.progress.completedCount', { count: completedCount })}
            </p>
          </div>
          <span className={cn('text-2xl font-semibold tabular-nums', surface.textPrimary)}>
            {history.balance}
          </span>
        </div>
        {history.entries.length > 0 ? (
          <section className="mt-6" aria-labelledby="participant-point-history-title">
            <h2
              id="participant-point-history-title"
              className={cn(navetTypographyTokens.sectionHeading, surface.textPrimary)}
            >
              {t('household.points.history')}
            </h2>
            <div
              className={cn(
                'mt-2 overflow-hidden rounded-[22px] border',
                surface.border,
                surface.panelMuted
              )}
            >
              <table className="w-full table-fixed text-left text-xs">
                <caption className="sr-only">{t('household.points.history')}</caption>
                <thead className="sr-only">
                  <tr>
                    <th scope="col">{t('household.points.history')}</th>
                    <th scope="col">{t('household.points.change')}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.entries.map((entry, index) => {
                    const definitionTitle = entry.definitionId
                      ? data.definitionsById[entry.definitionId]?.title
                      : undefined;
                    const label =
                      entry.type === 'earlier'
                        ? t('household.points.earlierBalance')
                        : entry.type === 'adjusted'
                          ? (entry.reason ?? t('household.points.manualAdjustment'))
                          : entry.type === 'reopened'
                            ? t('household.points.choreReopened', {
                                name: definitionTitle ?? t('household.points.chore'),
                              })
                            : t('household.points.choreCompleted', {
                                name: definitionTitle ?? t('household.points.chore'),
                              });
                    const timestamp = entry.timestamp ? new Date(entry.timestamp) : null;
                    return (
                      <tr
                        key={entry.id}
                        className={cn(
                          'h-14',
                          index > 0 && 'border-t',
                          index % 2 === 0 && surface.subtleBg,
                          surface.border
                        )}
                      >
                        <td className="min-w-0 px-3 py-2">
                          <TableCellContent
                            primary={label}
                            secondary={
                              timestamp
                                ? `${i18n.formatDate(timestamp, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })} · ${i18n.formatTime(timestamp)}`
                                : undefined
                            }
                          />
                        </td>
                        <td
                          className={cn(
                            'w-20 px-3 py-2 text-right text-sm font-semibold tabular-nums',
                            entry.pointsDelta >= 0 ? 'text-emerald-500' : 'text-rose-500'
                          )}
                        >
                          {entry.pointsDelta > 0 ? '+' : ''}
                          {entry.pointsDelta}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </SheetSurface>
  );
}

function PointAdjustmentDialog({
  isOpen,
  participant,
  direction,
  currentBalance,
  onOpenChange,
  onSave,
}: {
  isOpen: boolean;
  participant: ChoreParticipant;
  direction: 'add' | 'remove';
  currentBalance: number;
  onOpenChange: (open: boolean) => void;
  onSave: (pointsDelta: number, reason: string) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const [amount, setAmount] = useState<NumericDraft>(1);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    setAmount(1);
    setReason('');
    setSaveError(false);
  }, [direction, isOpen]);
  const pointsDelta = direction === 'add' ? Number(amount) : -Number(amount);
  const validAmount = isBoundedInteger(amount, 1, 10_000);
  const projectedBalance = currentBalance + (validAmount ? pointsDelta : 0);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validAmount) return;
    setSaving(true);
    setSaveError(false);
    const saved = await onSave(pointsDelta, reason.trim());
    setSaving(false);
    setSaveError(!saved);
    if (saved) onOpenChange(false);
  };
  return (
    <BaseCardDialog
      variant="modal"
      titleInContent
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t(direction === 'add' ? 'household.points.addFor' : 'household.points.removeFor', {
        name: participant.displayName,
      })}
      description={t('household.points.adjustDescription')}
      theme={theme}
      maxWidth="sm"
      bodyPadding={false}
    >
      <form onSubmit={submit}>
        <CardDialogBody>
          <CardDialogHeader
            title={t(
              direction === 'add' ? 'household.points.addFor' : 'household.points.removeFor',
              { name: participant.displayName }
            )}
            description={t('household.points.adjustDescription')}
            showRoomSelector={false}
          />
          <CardDialogSection label={t('household.points.amount')}>
            <Input
              autoFocus
              aria-describedby={validAmount ? undefined : 'point-adjustment-amount-error'}
              aria-label={t('household.points.amount')}
              type="number"
              min={1}
              max={10000}
              step={1}
              value={amount}
              invalid={!validAmount}
              required
              onChange={(event) => setAmount(numericDraft(event.target.value))}
            />
            {!validAmount ? (
              <ChoreFieldError id="point-adjustment-amount-error">
                {t('household.validation.wholeNumberRange', { min: 1, max: 10_000 })}
              </ChoreFieldError>
            ) : null}
          </CardDialogSection>
          <CardDialogSection label={t('household.points.reason')}>
            <Textarea
              aria-label={t('household.points.reason')}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </CardDialogSection>
          <output
            aria-live="polite"
            data-point-balance-preview="true"
            className={cn(
              'flex min-h-11 items-center rounded-xl border px-3 py-2.5 text-sm font-semibold tabular-nums',
              surface.borderStrong,
              surface.subtleBg,
              surface.textPrimary
            )}
          >
            {t('household.points.projectedBalance', { count: projectedBalance })}
          </output>
          {saveError ? (
            <p className="text-sm text-red-500" role="alert">
              {t('household.points.saveFailed')}
            </p>
          ) : null}
          <CardDialogFooter>
            <Button type="submit" loading={saving} disabled={!validAmount || saving}>
              {t(direction === 'add' ? 'household.points.saveAdd' : 'household.points.saveRemove')}
            </Button>
          </CardDialogFooter>
        </CardDialogBody>
      </form>
    </BaseCardDialog>
  );
}

export function ChoreSettingsView({
  data,
  onModeChange,
  onAddPerson,
  onEditPerson,
  onRescheduleVacation,
  managementPinConfigured,
  onManagePin,
  onRemovePin,
  recoveryContent,
}: {
  data: ChoreWorkspaceData;
  onModeChange: (mode: 'off' | 'light' | 'family' | 'adventure') => void;
  onAddPerson: () => void;
  onEditPerson: (participant: ChoreParticipant) => void;
  onRescheduleVacation: (
    participantId: string,
    occurrenceIds: string[],
    startDate: string
  ) => Promise<boolean>;
  managementPinConfigured: boolean;
  onManagePin: () => void;
  onRemovePin: () => void;
  recoveryContent?: ReactNode;
}) {
  const { t } = useI18n();
  const { theme, primaryColor } = useTheme();
  const styles = getSettingsSectionStyles(theme, primaryColor);
  const experience = normalizeChoreExperienceState(data.experience);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [activeSection, setActiveSection] = useState<
    'motivation' | 'people' | 'protection' | 'recovery'
  >('motivation');
  const [vacationParticipantId, setVacationParticipantId] = useState<string | null>(null);
  const [vacationOccurrenceIds, setVacationOccurrenceIds] = useState<string[]>([]);
  const [vacationStartDate, setVacationStartDate] = useState('');
  const [vacationSaving, setVacationSaving] = useState(false);
  const vacationParticipant = vacationParticipantId
    ? data.participantsById[vacationParticipantId]
    : undefined;
  const vacationCandidates =
    vacationParticipant?.pausedAt && vacationParticipant.resumeAt
      ? Object.values(data.occurrencesById)
          .filter(
            (occurrence) =>
              occurrence.status === 'available' &&
              !occurrence.claimedAt &&
              !occurrence.carriedForwardTo &&
              occurrence.assigneeIds.includes(vacationParticipant.id) &&
              Date.parse(occurrence.scheduledAt) >=
                Date.parse(vacationParticipant.pausedAt as string) &&
              Date.parse(occurrence.scheduledAt) <
                Date.parse(vacationParticipant.resumeAt as string)
          )
          .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))
      : [];
  const openVacationReview = (participant: ChoreParticipant) => {
    const candidates = Object.values(data.occurrencesById).filter(
      (occurrence) =>
        occurrence.status === 'available' &&
        !occurrence.claimedAt &&
        !occurrence.carriedForwardTo &&
        occurrence.assigneeIds.includes(participant.id) &&
        !!participant.pausedAt &&
        !!participant.resumeAt &&
        Date.parse(occurrence.scheduledAt) >= Date.parse(participant.pausedAt) &&
        Date.parse(occurrence.scheduledAt) < Date.parse(participant.resumeAt)
    );
    setVacationParticipantId(participant.id);
    setVacationOccurrenceIds(
      candidates
        .filter((occurrence) => {
          const frequency = data.definitionsById[occurrence.definitionId]?.schedule.frequency;
          return frequency === 'daily' || frequency === 'hourly';
        })
        .slice(0, 100)
        .map((occurrence) => occurrence.id)
    );
    const firstDay = new Date(
      Math.max(Date.now(), Date.parse(participant.resumeAt ?? '')) + 86_400_000
    );
    setVacationStartDate(
      new Date(firstDay.getTime() - firstDay.getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 10)
    );
  };
  const sections = [
    {
      id: 'motivation' as const,
      icon: Sparkles,
      label: t('household.settings.gamification'),
    },
    { id: 'people' as const, icon: Users, label: t('household.members.title') },
    {
      id: 'protection' as const,
      icon: ShieldCheck,
      label: t('household.management.pinLabel'),
    },
    { id: 'recovery' as const, icon: DatabaseBackup, label: t('household.data.title') },
  ];
  const activeSectionMeta = sections.find((section) => section.id === activeSection) ?? sections[0];
  const motivationExample = {
    off: t('household.settings.mode.offDescription'),
    light: t('household.settings.mode.lightDescription'),
    family: t('household.settings.mode.familyDescription'),
    adventure: t('household.settings.mode.adventureDescription'),
  }[experience.gamificationMode];

  const sectionContent =
    activeSection === 'motivation' ? (
      <SettingsEmbeddedSurface>
        <SettingsSectionShell
          id="household-motivation"
          icon={Sparkles}
          title={t('household.settings.gamification')}
          description={t('household.settings.gamificationDescription')}
          styles={styles}
        >
          <div className="p-4 md:p-5">
            <Select
              aria-label={t('household.settings.gamification')}
              value={experience.gamificationMode}
              onChange={(event) =>
                onModeChange(event.target.value as 'off' | 'light' | 'family' | 'adventure')
              }
            >
              <option value="off">{t('household.settings.mode.off')}</option>
              <option value="light">{t('household.settings.mode.light')}</option>
              <option value="family">{t('household.settings.mode.family')}</option>
              <option value="adventure">{t('household.settings.mode.adventure')}</option>
            </Select>
            <p
              key={experience.gamificationMode}
              className={cn('mt-3 text-sm leading-5', styles.subtleColor)}
              aria-live="polite"
            >
              {motivationExample}
            </p>
          </div>
        </SettingsSectionShell>
      </SettingsEmbeddedSurface>
    ) : activeSection === 'people' ? (
      <SettingsEmbeddedSurface>
        <SettingsSectionShell
          id="household-people"
          icon={Users}
          title={t('household.members.title')}
          description={t('household.members.description')}
          styles={styles}
        >
          <div className="flex justify-end px-4 py-3 md:px-5">
            <Button
              size="compact"
              variant="secondary"
              className="min-h-10"
              leading={<Plus className="h-4 w-4 shrink-0" />}
              onClick={onAddPerson}
            >
              {t('household.people.add')}
            </Button>
          </div>
          <div className={`divide-y ${styles.dividerColor}`}>
            {Object.values(data.participantsById).map((participant) => (
              <div
                key={participant.id}
                className="flex min-h-15 items-center gap-3 px-4 py-2.5 md:px-5"
              >
                <ProgressParticipantAvatar participant={participant} />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${styles.textColor}`}>
                    {participant.displayName}
                  </p>
                  <p className={`mt-0.5 truncate text-xs ${styles.subtleColor}`}>
                    {participant.capabilities.includes('manage')
                      ? t('household.personDialog.manager')
                      : t('household.personDialog.member')}
                  </p>
                </div>
                <Button
                  size="compact"
                  variant="ghost"
                  className="min-h-10 shrink-0"
                  onClick={() => onEditPerson(participant)}
                >
                  {t('household.actions.edit')}
                </Button>
                {participant.pausedAt && participant.resumeAt ? (
                  <Button
                    size="compact"
                    variant="secondary"
                    className="min-h-10 shrink-0"
                    onClick={() => openVacationReview(participant)}
                  >
                    {t('household.vacation.review')}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </SettingsSectionShell>
      </SettingsEmbeddedSurface>
    ) : activeSection === 'protection' ? (
      <SettingsEmbeddedSurface>
        <SettingsSectionShell
          id="household-protection"
          icon={ShieldCheck}
          title={t('household.management.pinLabel')}
          description={t('household.setup.securityDescription')}
          styles={styles}
        >
          <SettingsItem
            title={t('household.management.pinLabel')}
            description={t('household.setup.pinHelper')}
            styles={styles}
          >
            <div className="flex min-h-10 flex-wrap items-center justify-between gap-3">
              <span className={cn('text-sm font-medium', styles.subtleColor)}>
                {managementPinConfigured ? t('common.on') : t('common.off')}
              </span>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  size="compact"
                  variant="secondary"
                  className="min-h-10 shrink-0"
                  onClick={onManagePin}
                >
                  {managementPinConfigured
                    ? t('household.management.changePin')
                    : t('household.management.setPin')}
                </Button>
                {managementPinConfigured ? (
                  <Button
                    size="compact"
                    variant="destructive"
                    className="min-h-10 shrink-0"
                    onClick={onRemovePin}
                  >
                    {t('household.management.removePin')}
                  </Button>
                ) : null}
              </div>
            </div>
          </SettingsItem>
        </SettingsSectionShell>
      </SettingsEmbeddedSurface>
    ) : (
      <SettingsEmbeddedSurface>
        <SettingsSectionShell
          id="household-recovery"
          icon={DatabaseBackup}
          title={t('household.data.title')}
          description={t('household.data.description')}
          styles={styles}
        >
          <div className="p-4 md:p-5">{recoveryContent}</div>
        </SettingsSectionShell>
      </SettingsEmbeddedSurface>
    );

  return (
    <>
      <NavigationWorkspace.Frame
        aria-label={t('household.settings.title')}
        className="mx-auto h-[min(72dvh,46rem)] min-h-[34rem] max-w-6xl"
        data-chore-settings-workspace
      >
        <NavigationWorkspace.Header className="px-5 py-4 md:px-6">
          <h1 className={cn(navetTypographyTokens.pageHeading, styles.textColor)}>
            {t('household.settings.title')}
          </h1>
        </NavigationWorkspace.Header>

        <NavigationWorkspace.Body className={isMobile ? '' : 'grid-cols-[16rem_minmax(0,1fr)]'}>
          {!isMobile ? (
            <NavigationWorkspace.Sidebar>
              <nav aria-label={t('household.settings.title')} className="grid gap-1 px-3 py-4">
                {sections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <NavigationWorkspace.Item
                      key={section.id}
                      active={activeSection === section.id}
                      accentColor={styles.accentColor}
                    >
                      <NavigationWorkspace.ItemButton
                        aria-current={activeSection === section.id ? 'page' : undefined}
                        onClick={() => setActiveSection(section.id)}
                      >
                        <NavigationWorkspace.ItemIcon>
                          <Icon className={navetIconSizeTokens.sm} />
                        </NavigationWorkspace.ItemIcon>
                        <NavigationWorkspace.ItemText title={section.label} />
                      </NavigationWorkspace.ItemButton>
                    </NavigationWorkspace.Item>
                  );
                })}
              </nav>
            </NavigationWorkspace.Sidebar>
          ) : null}

          <NavigationWorkspace.Content aria-label={activeSectionMeta.label}>
            {isMobile ? (
              <nav
                aria-label={t('household.settings.title')}
                className={cn('flex gap-2 overflow-x-auto border-b px-3 py-3', styles.borderColor)}
              >
                {sections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <Button
                      key={section.id}
                      size="compact"
                      variant={activeSection === section.id ? 'primary' : 'secondary'}
                      className="min-h-10 shrink-0"
                      leading={<Icon className={navetIconSizeTokens.sm} />}
                      onClick={() => setActiveSection(section.id)}
                    >
                      {section.label}
                    </Button>
                  );
                })}
              </nav>
            ) : null}
            <NavigationWorkspace.ScrollArea>{sectionContent}</NavigationWorkspace.ScrollArea>
          </NavigationWorkspace.Content>
        </NavigationWorkspace.Body>
      </NavigationWorkspace.Frame>
      <BaseCardDialog
        isOpen={Boolean(vacationParticipant)}
        variant="modal"
        onOpenChange={(open) => {
          if (!open) setVacationParticipantId(null);
        }}
        title={t('household.vacation.review')}
        description={t('household.vacation.description')}
        theme={theme}
        maxWidth="sm"
        height="capped"
        bodyPadding={false}
      >
        <CardDialogBody>
          <CardDialogHeader
            title={t('household.vacation.review')}
            description={t('household.vacation.description')}
            showRoomSelector={false}
          />
          <div className="grid max-h-[50dvh] gap-2 overflow-y-auto py-3">
            {vacationCandidates.length === 0 ? (
              <p className={styles.subtleColor}>{t('household.vacation.empty')}</p>
            ) : (
              vacationCandidates.map((occurrence) => (
                <label
                  key={occurrence.id}
                  className={cn(
                    'flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2',
                    styles.borderColor,
                    styles.textColor
                  )}
                >
                  <input
                    type="checkbox"
                    checked={vacationOccurrenceIds.includes(occurrence.id)}
                    onChange={(event) =>
                      setVacationOccurrenceIds((current) =>
                        event.target.checked
                          ? [...current, occurrence.id].slice(0, 100)
                          : current.filter((id) => id !== occurrence.id)
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {data.definitionsById[occurrence.definitionId]?.title ??
                      occurrence.definitionId}
                  </span>
                  <span className={cn('shrink-0 text-xs', styles.subtleColor)}>
                    {new Date(occurrence.scheduledAt).toLocaleDateString()}
                  </span>
                </label>
              ))
            )}
          </div>
          <CardDialogSection className="mb-0" label={t('household.vacation.startDate')}>
            <Input
              aria-label={t('household.vacation.startDate')}
              type="date"
              value={vacationStartDate}
              onChange={(event) => setVacationStartDate(event.target.value)}
            />
          </CardDialogSection>
          <p className={cn('mt-2 text-sm', styles.subtleColor)}>
            {t('household.vacation.preview', { count: vacationOccurrenceIds.length })}
          </p>
          <CardDialogFooter>
            <Button variant="secondary" onClick={() => setVacationParticipantId(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={vacationSaving}
              disabled={
                !vacationParticipant || vacationOccurrenceIds.length === 0 || !vacationStartDate
              }
              onClick={async () => {
                if (!vacationParticipant) return;
                setVacationSaving(true);
                const saved = await onRescheduleVacation(
                  vacationParticipant.id,
                  vacationOccurrenceIds,
                  vacationStartDate
                );
                setVacationSaving(false);
                if (saved) setVacationParticipantId(null);
              }}
            >
              {t('household.vacation.move')}
            </Button>
          </CardDialogFooter>
        </CardDialogBody>
      </BaseCardDialog>
    </>
  );
}
