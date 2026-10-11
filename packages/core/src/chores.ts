import {
  addCalendarDays,
  getDayOfWeek,
  isScheduledOnDate,
  parseDateKey,
  resolveAssignmentSlots,
  rotationIndexForDate,
  scheduleStartDate,
  scheduleTimes,
} from './chore-calendar-policy.ts';
import { applyChoreOccurrenceCommand } from './chore-occurrence-policy.ts';
import { earnChoreProgressAwards } from './chore-progress-policy.ts';
import {
  getLatestChoreCompletion,
  getOutstandingChoreOccurrence,
  getParticipantChoreOccurrences,
  getSupersedingChoreOccurrence,
  shouldPruneChoreOccurrence,
} from './chore-recurrence-policy.ts';
import { assertSafeRecord, setOwnRecordValue } from './record-safety.ts';

export { applyChoreOccurrenceCommand } from './chore-occurrence-policy.ts';

import {
  type ChoreExperienceState,
  type ChoreMission,
  createChoreExperienceState,
  isChoreExperienceState,
  normalizeChoreExperienceState,
} from './chore-experience.ts';

export const CHORE_WORKSPACE_SCHEMA_VERSION = 2 as const;

export type ChoreParticipantCapability = 'complete' | 'approve' | 'manage';
export type ChoreReminderDestinationType =
  | 'in_app'
  | 'provider'
  /** Legacy persisted value. Current writes use `provider`. */
  | 'home_assistant';

export interface ChoreParticipant {
  id: string;
  displayName: string;
  color?: string;
  avatarUrl?: string;
  avatarIcon?: string;
  capabilities: ChoreParticipantCapability[];
  pausedAt?: string;
  resumeAt?: string;
  linkedAccountId?: string;
  linkedPersonEntityId?: string;
  reminderPreferences?: {
    enabled: boolean;
    quietHours?: {
      start: string;
      end: string;
      timeZone?: string;
    };
    destination?: {
      type: ChoreReminderDestinationType;
      target?: string;
    };
  };
  createdAt: string;
  updatedAt: string;
}

export function isChoreParticipantPausedAt(
  participant: ChoreParticipant,
  timestamp: string
): boolean {
  return Boolean(
    participant.pausedAt &&
      Date.parse(timestamp) >= Date.parse(participant.pausedAt) &&
      (!participant.resumeAt || Date.parse(timestamp) < Date.parse(participant.resumeAt))
  );
}

export type ChoreAssignmentMode = 'person' | 'anyone' | 'everyone' | 'rotation';

export interface ChoreAssignment {
  mode: ChoreAssignmentMode;
  participantIds: string[];
  standbyParticipantIds?: string[];
  rotationStrategy?: 'ordered' | 'fair';
  rotationCadence?: 'scheduled_day' | 'weekly';
  /** Local weekday for weekly handover, Sunday = 0. Defaults to Monday. */
  rotationDayOfWeek?: number;
  rotationCursor?: number;
  rotationReset?: 'never' | 'weekly' | 'monthly';
  participantScheduleOverrides?: Record<
    string,
    {
      daysOfWeek?: number[];
      times?: string[];
      dueDateOffsetDays?: number;
    }
  >;
}

export interface ChoreScheduleOptions {
  endDate?: string;
  excludedDates?: string[];
  times?: string[];
}

export type ChoreSchedule = ChoreScheduleOptions &
  (
    | {
        frequency: 'once';
        date: string;
        time: string;
        timeZone: string;
      }
    | {
        frequency: 'daily';
        startDate: string;
        time: string;
        timeZone: string;
        daysOfWeek?: number[];
        intervalDays?: number;
      }
    | {
        frequency: 'weekly';
        startDate: string;
        time: string;
        timeZone: string;
        daysOfWeek: number[];
        intervalWeeks?: number;
      }
    | {
        frequency: 'monthly';
        startDate: string;
        time: string;
        timeZone: string;
        dayOfMonth?: number;
        nthWeekday?: {
          weekday: number;
          ordinal: 1 | 2 | 3 | 4 | 5 | -1;
        };
      }
    | {
        frequency: 'after_completion';
        startDate: string;
        time: string;
        timeZone: string;
        intervalDays: number;
      }
    | {
        frequency: 'hourly';
        startDate: string;
        time: string;
        timeZone: string;
        intervalHours: number;
      }
  );

export interface ChoreClaimPolicy {
  required: boolean;
  expiresAfterMinutes?: number;
  allowSteal: boolean;
  opensBeforeMinutes?: number;
  pendingApproval?: 'allow' | 'block';
}

export interface ChoreMissedPolicy {
  graceMinutes: number;
  action: 'none' | 'skip' | 'carry_forward';
  carryForwardDays?: number;
}

export interface ChoreReminderPolicy {
  enabled: boolean;
  beforeDueMinutes: number[];
  atDue: boolean;
  overdueEveryMinutes?: number;
  maxOverdueReminders?: number;
  approvalAfterMinutes?: number;
  notifyOn?: Array<'claimed' | 'completed' | 'approved' | 'rejected' | 'skipped'>;
}

export interface ChoreApprovalPolicy {
  required: boolean;
  approverIds: string[];
  resetClaimOnReject?: boolean;
}

export interface ChoreDefinition {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  roomRef?: {
    canonicalId: string;
    label: string;
  };
  enabled: boolean;
  assignment: ChoreAssignment;
  schedule: ChoreSchedule;
  dueWindowMinutes: number;
  approval: ChoreApprovalPolicy;
  claimPolicy?: ChoreClaimPolicy;
  missedPolicy?: ChoreMissedPolicy;
  reminderPolicy?: ChoreReminderPolicy;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export type ChoreOccurrenceStatus =
  | 'available'
  | 'claimed'
  | 'awaiting_approval'
  | 'done'
  | 'skipped'
  | 'missed';

export type ChoreTiming = 'upcoming' | 'due' | 'overdue';

export interface ChoreOccurrence {
  id: string;
  definitionId: string;
  scheduledAt: string;
  dueAt: string;
  assigneeIds: string[];
  assignmentSlot: string;
  status: ChoreOccurrenceStatus;
  claimedBy?: string;
  claimedAt?: string;
  completedBy?: string;
  completedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  skippedBy?: string;
  skippedAt?: string;
  missedAt?: string;
  carriedForwardTo?: string;
  carriedForwardFrom?: string;
  updatedAt: string;
}

export type ChoreActivityType =
  | 'participant_created'
  | 'participant_updated'
  | 'definition_created'
  | 'definition_updated'
  | 'definition_archived'
  | 'definition_deleted'
  | 'workspace_materialized'
  | 'workspace_imported'
  | 'workspace_reset'
  | 'retention_updated'
  | 'experience_updated'
  | 'points_adjusted'
  | 'reward_requested'
  | 'reward_approved'
  | 'reward_declined'
  | 'reward_fulfilled'
  | 'reward_refunded'
  | 'vacation_rescheduled'
  | 'occurrence_created'
  | 'due'
  | 'overdue'
  | 'claimed'
  | 'completed'
  | 'approved'
  | 'rejected'
  | 'skipped'
  | 'reopened'
  | 'reassigned'
  | 'missed'
  | 'reminder_acknowledged'
  | 'outbox_delivery_updated';

export interface ChoreActivity {
  id: string;
  commandId: string;
  occurrenceId?: string;
  definitionId?: string;
  participantId?: string;
  type: ChoreActivityType;
  actorParticipantId?: string;
  reason?: string;
  pointsDelta?: number;
  previousAssigneeIds?: string[];
  assigneeIds?: string[];
  outboxId?: string;
  timestamp: string;
}

export type ChoreOutboxStatus = 'pending' | 'delivered' | 'failed';
export type ChoreReminderEventType =
  | 'reminder_before_due'
  | 'reminder_due'
  | 'reminder_overdue'
  | 'reminder_approval';
export type ChoreOutboxEventType = ChoreActivityType | ChoreReminderEventType;

export interface ChoreOutboxItem {
  id: string;
  activityId: string;
  eventType: ChoreOutboxEventType;
  status: ChoreOutboxStatus;
  attempts: number;
  createdAt: string;
  nextAttemptAt: string;
  lastAttemptAt?: string;
  deliveredAt?: string;
  lastError?: string;
  occurrenceId?: string;
  occurrenceUpdatedAt?: string;
  participantId?: string;
  destination?: ChoreReminderDestinationType;
  destinationTarget?: string;
}

export interface ChoreWorkspaceData {
  schemaVersion: typeof CHORE_WORKSPACE_SCHEMA_VERSION;
  participantsById: Record<string, ChoreParticipant>;
  definitionsById: Record<string, ChoreDefinition>;
  occurrencesById: Record<string, ChoreOccurrence>;
  activity: ChoreActivity[];
  outbox: ChoreOutboxItem[];
  historyRetention?: ChoreHistoryRetentionPolicy;
  /** Optional additive household presentation, mission, and reward data. */
  experience?: ChoreExperienceState;
}

export interface ChoreHistoryRetentionPolicy {
  maxAgeDays: number;
  maxEvents: number;
}

export const DEFAULT_CHORE_HISTORY_RETENTION: ChoreHistoryRetentionPolicy = {
  maxAgeDays: 730,
  maxEvents: 50_000,
};

export type ChoreOccurrenceCommand =
  | { type: 'claim'; participantId: string }
  | { type: 'complete'; participantId: string }
  | { type: 'approve'; participantId: string; managerOverride?: boolean; reason?: string }
  | { type: 'reject'; participantId: string; managerOverride?: boolean; reason?: string }
  | { type: 'skip'; participantId: string; reason: string }
  | { type: 'reopen'; participantId: string; reason: string }
  | { type: 'reassign'; participantId: string; assigneeIds: string[]; reason: string };

export interface ChoreWorkspaceOccurrenceAction {
  type: 'occurrence_action';
  occurrenceId: string;
  expectedOccurrenceUpdatedAt?: string;
  action: ChoreOccurrenceCommand;
}

export interface ChoreWorkspaceParticipantCreateAction {
  type: 'participant_create';
  participant: ChoreParticipant;
  actorParticipantId?: string;
}

export interface ChoreWorkspaceParticipantUpdateAction {
  type: 'participant_update';
  participant: ChoreParticipant;
  actorParticipantId: string;
}

export interface ChoreWorkspaceDefinitionCreateAction {
  type: 'definition_create';
  definition: ChoreDefinition;
  actorParticipantId: string;
}

export interface ChoreWorkspaceDefinitionUpdateAction {
  type: 'definition_update';
  definition: ChoreDefinition;
  actorParticipantId: string;
}

export interface ChoreWorkspaceDefinitionArchiveAction {
  type: 'definition_archive';
  definitionId: string;
  actorParticipantId: string;
}

export interface ChoreWorkspaceDefinitionRestoreAction {
  type: 'definition_restore';
  definitionId: string;
  actorParticipantId: string;
}

export interface ChoreWorkspaceDefinitionDeleteAction {
  type: 'definition_delete';
  definitionId: string;
  actorParticipantId: string;
}

export interface ChoreWorkspaceMaterializeAction {
  type: 'materialize_occurrences';
  rangeStart: string;
  rangeEnd: string;
}

export interface ChoreWorkspaceReminderAcknowledgeAction {
  type: 'reminder_acknowledge';
  outboxId: string;
  actorParticipantId: string;
}

export interface ChoreWorkspaceOutboxDeliveryAction {
  type: 'outbox_delivery_update';
  outboxId: string;
  status: 'delivered' | 'failed';
  error?: string;
}

export interface ChoreWorkspaceRetentionUpdateAction {
  type: 'retention_update';
  actorParticipantId: string;
  policy: ChoreHistoryRetentionPolicy;
}

export interface ChoreWorkspaceExperienceUpdateAction {
  type: 'experience_update';
  actorParticipantId: string;
  experience: ChoreExperienceState;
}

export interface ChoreWorkspaceExperiencePointsAdjustAction {
  type: 'experience_points_adjust';
  actorParticipantId: string;
  participantId: string;
  pointsDelta: number;
  reason?: string;
}

export interface ChoreWorkspaceRewardRequestAction {
  type: 'reward_request';
  requestId: string;
  rewardId: string;
  participantId: string;
}

export interface ChoreWorkspaceRewardDecisionAction {
  type: 'reward_decision';
  requestId: string;
  actorParticipantId: string;
  decision: 'approve' | 'decline' | 'fulfill' | 'refund';
  reason?: string;
}

export interface ChoreWorkspaceVacationRescheduleAction {
  type: 'vacation_reschedule';
  actorParticipantId: string;
  participantId: string;
  occurrenceIds: string[];
  startDate: string;
}

export type ChoreWorkspaceAction =
  | ChoreWorkspaceOccurrenceAction
  | ChoreWorkspaceParticipantCreateAction
  | ChoreWorkspaceParticipantUpdateAction
  | ChoreWorkspaceDefinitionCreateAction
  | ChoreWorkspaceDefinitionUpdateAction
  | ChoreWorkspaceDefinitionArchiveAction
  | ChoreWorkspaceDefinitionRestoreAction
  | ChoreWorkspaceDefinitionDeleteAction
  | ChoreWorkspaceMaterializeAction
  | ChoreWorkspaceReminderAcknowledgeAction
  | ChoreWorkspaceOutboxDeliveryAction
  | ChoreWorkspaceRetentionUpdateAction
  | ChoreWorkspaceExperienceUpdateAction
  | ChoreWorkspaceExperiencePointsAdjustAction
  | ChoreWorkspaceRewardRequestAction
  | ChoreWorkspaceRewardDecisionAction
  | ChoreWorkspaceVacationRescheduleAction;

export interface ApplyChoreCommandInput {
  commandId: string;
  command: ChoreOccurrenceCommand;
  definition: ChoreDefinition;
  occurrence: ChoreOccurrence;
  timestamp: string;
}

export interface ApplyChoreCommandResult {
  occurrence: ChoreOccurrence;
  activity: ChoreActivity;
}

export interface ApplyChoreWorkspaceOccurrenceCommandInput {
  commandId: string;
  command: ChoreOccurrenceCommand;
  occurrenceId: string;
  timestamp: string;
  workspace: ChoreWorkspaceData;
}

export interface ApplyChoreWorkspaceOccurrenceCommandResult {
  activity: ChoreActivity;
  data: ChoreWorkspaceData;
  occurrence: ChoreOccurrence;
}

export interface ApplyChoreWorkspaceActionInput {
  commandId: string;
  action: ChoreWorkspaceAction;
  timestamp: string;
  workspace: ChoreWorkspaceData;
}

export interface ApplyChoreWorkspaceActionResult {
  activity: ChoreActivity;
  /** Additional immutable lifecycle events produced by one authoritative action. */
  additionalActivities?: ChoreActivity[];
  data: ChoreWorkspaceData;
}

export interface RunChoreWorkspaceSchedulerResult {
  activities: ChoreActivity[];
  data: ChoreWorkspaceData;
  outboxItems: ChoreOutboxItem[];
}

export interface RunChoreWorkspaceSchedulerOptions {
  /** IDs already committed to the authority's append-only event history. */
  existingEventIds?: ReadonlySet<string>;
}

export interface MaterializeChoreOccurrencesInput {
  definition: ChoreDefinition;
  participantsById: Record<string, ChoreParticipant>;
  rangeStart: string;
  rangeEnd: string;
  existingOccurrences?: Record<string, ChoreOccurrence>;
  latestCompletedAt?: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function getTimeZoneParts(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function localDateTimeToIso(dateKey: string, time: string, timeZone: string) {
  const date = parseDateKey(dateKey);
  const timeMatch = TIME_PATTERN.exec(time);
  if (!timeMatch) {
    throw new Error(`Invalid chore time: ${time}`);
  }

  const desiredUtc = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    Number(timeMatch[1]),
    Number(timeMatch[2])
  );
  let candidate = desiredUtc;
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = getTimeZoneParts(candidate, timeZone);
    const representedUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    candidate += desiredUtc - representedUtc;
  }

  return new Date(candidate).toISOString();
}

function getZonedDateKey(timestamp: string, timeZone: string) {
  const parts = getTimeZoneParts(new Date(timestamp).getTime(), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function definitionMaterializationChanged(current: ChoreDefinition, next: ChoreDefinition) {
  return (
    JSON.stringify(current.schedule) !== JSON.stringify(next.schedule) ||
    JSON.stringify(current.assignment) !== JSON.stringify(next.assignment) ||
    current.dueWindowMinutes !== next.dueWindowMinutes
  );
}

function canDiscardForRematerialization(occurrence: ChoreOccurrence) {
  return occurrence.status === 'available' && occurrence.carriedForwardFrom === undefined;
}

function buildOccurrenceId(definitionId: string, scheduledAt: string, assignmentSlot: string) {
  return `${definitionId}:${scheduledAt}:${assignmentSlot}`;
}

function createOccurrence(
  definition: ChoreDefinition,
  scheduledAt: string,
  assignmentSlot: string,
  assigneeIds: string[]
): ChoreOccurrence {
  return {
    id: buildOccurrenceId(definition.id, scheduledAt, assignmentSlot),
    definitionId: definition.id,
    scheduledAt,
    dueAt: new Date(
      new Date(scheduledAt).getTime() + Math.max(0, definition.dueWindowMinutes) * 60_000
    ).toISOString(),
    assigneeIds,
    assignmentSlot,
    status: 'available',
    updatedAt: scheduledAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isChoreParticipant(value: unknown, expectedId: string) {
  if (!isRecord(value)) return false;
  const reminderPreferences = value.reminderPreferences;
  const validReminderPreferences =
    reminderPreferences === undefined ||
    (isRecord(reminderPreferences) &&
      typeof reminderPreferences.enabled === 'boolean' &&
      (reminderPreferences.quietHours === undefined ||
        (isRecord(reminderPreferences.quietHours) &&
          typeof reminderPreferences.quietHours.start === 'string' &&
          TIME_PATTERN.test(reminderPreferences.quietHours.start) &&
          typeof reminderPreferences.quietHours.end === 'string' &&
          TIME_PATTERN.test(reminderPreferences.quietHours.end) &&
          (reminderPreferences.quietHours.timeZone === undefined ||
            (typeof reminderPreferences.quietHours.timeZone === 'string' &&
              reminderPreferences.quietHours.timeZone.length > 0)))) &&
      (reminderPreferences.destination === undefined ||
        (isRecord(reminderPreferences.destination) &&
          ['in_app', 'provider', 'home_assistant'].includes(
            String(reminderPreferences.destination.type)
          ) &&
          (reminderPreferences.destination.target === undefined ||
            typeof reminderPreferences.destination.target === 'string'))));
  return (
    value.id === expectedId &&
    typeof value.displayName === 'string' &&
    value.displayName.trim().length > 0 &&
    isStringArray(value.capabilities) &&
    value.capabilities.every((capability) =>
      ['complete', 'approve', 'manage'].includes(capability)
    ) &&
    (value.color === undefined || typeof value.color === 'string') &&
    (value.avatarUrl === undefined || typeof value.avatarUrl === 'string') &&
    (value.avatarIcon === undefined ||
      (typeof value.avatarIcon === 'string' && value.avatarIcon.length <= 64)) &&
    (value.linkedAccountId === undefined || typeof value.linkedAccountId === 'string') &&
    (value.linkedPersonEntityId === undefined || typeof value.linkedPersonEntityId === 'string') &&
    validReminderPreferences &&
    isIsoTimestamp(value.createdAt) &&
    isIsoTimestamp(value.updatedAt) &&
    (value.pausedAt === undefined || isIsoTimestamp(value.pausedAt)) &&
    (value.resumeAt === undefined ||
      (typeof value.resumeAt === 'string' &&
        typeof value.pausedAt === 'string' &&
        isIsoTimestamp(value.resumeAt) &&
        isIsoTimestamp(value.pausedAt) &&
        Date.parse(value.resumeAt) > Date.parse(value.pausedAt)))
  );
}

function isChoreSchedule(value: unknown): value is ChoreSchedule {
  if (!isRecord(value) || typeof value.frequency !== 'string') return false;
  if (
    typeof value.time !== 'string' ||
    !TIME_PATTERN.test(value.time) ||
    typeof value.timeZone !== 'string' ||
    value.timeZone.length === 0
  ) {
    return false;
  }
  if (
    (value.endDate !== undefined &&
      (typeof value.endDate !== 'string' || !DATE_PATTERN.test(value.endDate))) ||
    (value.excludedDates !== undefined &&
      (!Array.isArray(value.excludedDates) ||
        !value.excludedDates.every(
          (date) => typeof date === 'string' && DATE_PATTERN.test(date)
        ))) ||
    (value.times !== undefined &&
      (!Array.isArray(value.times) ||
        value.times.length === 0 ||
        !value.times.every((time) => typeof time === 'string' && TIME_PATTERN.test(time))))
  ) {
    return false;
  }
  if (value.frequency === 'once') {
    return typeof value.date === 'string' && DATE_PATTERN.test(value.date);
  }
  if (typeof value.startDate !== 'string' || !DATE_PATTERN.test(value.startDate)) return false;
  if (value.frequency === 'daily') {
    return (
      (value.daysOfWeek === undefined ||
        (Array.isArray(value.daysOfWeek) &&
          value.daysOfWeek.every(
            (day) => Number.isSafeInteger(day) && Number(day) >= 0 && Number(day) <= 6
          ))) &&
      (value.intervalDays === undefined ||
        (Number.isSafeInteger(value.intervalDays) && Number(value.intervalDays) > 0))
    );
  }
  if (value.frequency === 'weekly') {
    return (
      Array.isArray(value.daysOfWeek) &&
      value.daysOfWeek.length > 0 &&
      value.daysOfWeek.every(
        (day) => Number.isSafeInteger(day) && Number(day) >= 0 && Number(day) <= 6
      ) &&
      (value.intervalWeeks === undefined ||
        (Number.isSafeInteger(value.intervalWeeks) && Number(value.intervalWeeks) > 0))
    );
  }
  if (value.frequency === 'monthly') {
    const validDayOfMonth =
      value.dayOfMonth !== undefined &&
      Number.isSafeInteger(value.dayOfMonth) &&
      Number(value.dayOfMonth) >= 1 &&
      Number(value.dayOfMonth) <= 31;
    const validNthWeekday =
      isRecord(value.nthWeekday) &&
      Number.isSafeInteger(value.nthWeekday.weekday) &&
      Number(value.nthWeekday.weekday) >= 0 &&
      Number(value.nthWeekday.weekday) <= 6 &&
      [1, 2, 3, 4, 5, -1].includes(Number(value.nthWeekday.ordinal));
    return validDayOfMonth || validNthWeekday;
  }
  if (value.frequency === 'after_completion') {
    return Number.isSafeInteger(value.intervalDays) && Number(value.intervalDays) > 0;
  }
  if (value.frequency === 'hourly') {
    return (
      Number.isSafeInteger(value.intervalHours) &&
      Number(value.intervalHours) >= 1 &&
      Number(value.intervalHours) <= 8760
    );
  }
  return false;
}

function isChoreDefinition(value: unknown, expectedId: string) {
  if (!isRecord(value) || !isRecord(value.assignment) || !isRecord(value.approval)) return false;
  return (
    value.id === expectedId &&
    typeof value.title === 'string' &&
    value.title.trim().length > 0 &&
    (value.description === undefined || typeof value.description === 'string') &&
    (value.icon === undefined || typeof value.icon === 'string') &&
    (value.roomRef === undefined ||
      (isRecord(value.roomRef) &&
        typeof value.roomRef.canonicalId === 'string' &&
        typeof value.roomRef.label === 'string')) &&
    typeof value.enabled === 'boolean' &&
    ['person', 'anyone', 'everyone', 'rotation'].includes(String(value.assignment.mode)) &&
    isStringArray(value.assignment.participantIds) &&
    (value.assignment.standbyParticipantIds === undefined ||
      isStringArray(value.assignment.standbyParticipantIds)) &&
    (value.assignment.rotationStrategy === undefined ||
      ['ordered', 'fair'].includes(String(value.assignment.rotationStrategy))) &&
    (value.assignment.rotationCursor === undefined ||
      (Number.isSafeInteger(value.assignment.rotationCursor) &&
        Number(value.assignment.rotationCursor) >= 0)) &&
    (value.assignment.rotationCadence === undefined ||
      ['scheduled_day', 'weekly'].includes(String(value.assignment.rotationCadence))) &&
    (value.assignment.rotationDayOfWeek === undefined ||
      (Number.isInteger(value.assignment.rotationDayOfWeek) &&
        Number(value.assignment.rotationDayOfWeek) >= 0 &&
        Number(value.assignment.rotationDayOfWeek) <= 6)) &&
    (value.assignment.rotationReset === undefined ||
      ['never', 'weekly', 'monthly'].includes(String(value.assignment.rotationReset))) &&
    (value.assignment.participantScheduleOverrides === undefined ||
      (isRecord(value.assignment.participantScheduleOverrides) &&
        Object.values(value.assignment.participantScheduleOverrides).every(
          (override) =>
            isRecord(override) &&
            (override.daysOfWeek === undefined ||
              (Array.isArray(override.daysOfWeek) &&
                override.daysOfWeek.every(
                  (day) => Number.isSafeInteger(day) && Number(day) >= 0 && Number(day) <= 6
                ))) &&
            (override.times === undefined ||
              (Array.isArray(override.times) &&
                override.times.length > 0 &&
                override.times.every(
                  (time) => typeof time === 'string' && TIME_PATTERN.test(time)
                ))) &&
            (override.dueDateOffsetDays === undefined ||
              (Number.isSafeInteger(override.dueDateOffsetDays) &&
                Number(override.dueDateOffsetDays) >= 0 &&
                Number(override.dueDateOffsetDays) <= 365))
        ))) &&
    isChoreSchedule(value.schedule) &&
    Number.isFinite(value.dueWindowMinutes) &&
    Number(value.dueWindowMinutes) >= 0 &&
    typeof value.approval.required === 'boolean' &&
    isStringArray(value.approval.approverIds) &&
    (value.approval.resetClaimOnReject === undefined ||
      typeof value.approval.resetClaimOnReject === 'boolean') &&
    (value.claimPolicy === undefined ||
      (isRecord(value.claimPolicy) &&
        typeof value.claimPolicy.required === 'boolean' &&
        typeof value.claimPolicy.allowSteal === 'boolean' &&
        (value.claimPolicy.expiresAfterMinutes === undefined ||
          (Number.isSafeInteger(value.claimPolicy.expiresAfterMinutes) &&
            Number(value.claimPolicy.expiresAfterMinutes) > 0)) &&
        (value.claimPolicy.opensBeforeMinutes === undefined ||
          (Number.isSafeInteger(value.claimPolicy.opensBeforeMinutes) &&
            Number(value.claimPolicy.opensBeforeMinutes) >= 0)) &&
        (value.claimPolicy.pendingApproval === undefined ||
          ['allow', 'block'].includes(String(value.claimPolicy.pendingApproval))))) &&
    (value.missedPolicy === undefined ||
      (isRecord(value.missedPolicy) &&
        Number.isSafeInteger(value.missedPolicy.graceMinutes) &&
        Number(value.missedPolicy.graceMinutes) >= 0 &&
        ['none', 'skip', 'carry_forward'].includes(String(value.missedPolicy.action)) &&
        (value.missedPolicy.carryForwardDays === undefined ||
          (Number.isSafeInteger(value.missedPolicy.carryForwardDays) &&
            Number(value.missedPolicy.carryForwardDays) > 0)))) &&
    (value.reminderPolicy === undefined ||
      (isRecord(value.reminderPolicy) &&
        typeof value.reminderPolicy.enabled === 'boolean' &&
        Array.isArray(value.reminderPolicy.beforeDueMinutes) &&
        value.reminderPolicy.beforeDueMinutes.every(
          (minutes) => Number.isSafeInteger(minutes) && Number(minutes) > 0
        ) &&
        typeof value.reminderPolicy.atDue === 'boolean' &&
        (value.reminderPolicy.overdueEveryMinutes === undefined ||
          (Number.isSafeInteger(value.reminderPolicy.overdueEveryMinutes) &&
            Number(value.reminderPolicy.overdueEveryMinutes) > 0)) &&
        (value.reminderPolicy.maxOverdueReminders === undefined ||
          (Number.isSafeInteger(value.reminderPolicy.maxOverdueReminders) &&
            Number(value.reminderPolicy.maxOverdueReminders) > 0)) &&
        (value.reminderPolicy.approvalAfterMinutes === undefined ||
          (Number.isSafeInteger(value.reminderPolicy.approvalAfterMinutes) &&
            Number(value.reminderPolicy.approvalAfterMinutes) >= 0)) &&
        (value.reminderPolicy.notifyOn === undefined ||
          (Array.isArray(value.reminderPolicy.notifyOn) &&
            value.reminderPolicy.notifyOn.every((event) =>
              ['claimed', 'completed', 'approved', 'rejected', 'skipped'].includes(String(event))
            ))))) &&
    isIsoTimestamp(value.createdAt) &&
    isIsoTimestamp(value.updatedAt) &&
    (value.archivedAt === undefined || isIsoTimestamp(value.archivedAt))
  );
}

function isChoreOccurrence(value: unknown, expectedId: string) {
  if (!isRecord(value)) return false;
  return (
    value.id === expectedId &&
    typeof value.definitionId === 'string' &&
    isIsoTimestamp(value.scheduledAt) &&
    isIsoTimestamp(value.dueAt) &&
    isStringArray(value.assigneeIds) &&
    typeof value.assignmentSlot === 'string' &&
    ['available', 'claimed', 'awaiting_approval', 'done', 'skipped', 'missed'].includes(
      String(value.status)
    ) &&
    (value.claimedBy === undefined || typeof value.claimedBy === 'string') &&
    (value.claimedAt === undefined || isIsoTimestamp(value.claimedAt)) &&
    (value.completedBy === undefined || typeof value.completedBy === 'string') &&
    (value.completedAt === undefined || isIsoTimestamp(value.completedAt)) &&
    (value.approvedBy === undefined || typeof value.approvedBy === 'string') &&
    (value.approvedAt === undefined || isIsoTimestamp(value.approvedAt)) &&
    (value.skippedBy === undefined || typeof value.skippedBy === 'string') &&
    (value.skippedAt === undefined || isIsoTimestamp(value.skippedAt)) &&
    (value.missedAt === undefined || isIsoTimestamp(value.missedAt)) &&
    (value.carriedForwardTo === undefined || typeof value.carriedForwardTo === 'string') &&
    (value.carriedForwardFrom === undefined || typeof value.carriedForwardFrom === 'string') &&
    isIsoTimestamp(value.updatedAt)
  );
}

function isChoreActivity(value: unknown) {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.commandId === 'string' &&
    value.commandId.length > 0 &&
    [
      'participant_created',
      'participant_updated',
      'definition_created',
      'definition_updated',
      'definition_archived',
      'definition_deleted',
      'workspace_materialized',
      'workspace_imported',
      'workspace_reset',
      'retention_updated',
      'experience_updated',
      'points_adjusted',
      'reward_requested',
      'reward_approved',
      'reward_declined',
      'reward_fulfilled',
      'reward_refunded',
      'vacation_rescheduled',
      'occurrence_created',
      'due',
      'overdue',
      'claimed',
      'completed',
      'approved',
      'rejected',
      'skipped',
      'reopened',
      'reassigned',
      'missed',
      'reminder_acknowledged',
      'outbox_delivery_updated',
    ].includes(String(value.type)) &&
    isIsoTimestamp(value.timestamp) &&
    (value.occurrenceId === undefined || typeof value.occurrenceId === 'string') &&
    (value.definitionId === undefined || typeof value.definitionId === 'string') &&
    (value.participantId === undefined || typeof value.participantId === 'string') &&
    (value.actorParticipantId === undefined || typeof value.actorParticipantId === 'string') &&
    (value.reason === undefined || typeof value.reason === 'string') &&
    (value.pointsDelta === undefined ||
      (Number.isSafeInteger(value.pointsDelta) && Math.abs(Number(value.pointsDelta)) <= 10_000)) &&
    (value.previousAssigneeIds === undefined ||
      (Array.isArray(value.previousAssigneeIds) &&
        value.previousAssigneeIds.every((id) => typeof id === 'string'))) &&
    (value.assigneeIds === undefined ||
      (Array.isArray(value.assigneeIds) &&
        value.assigneeIds.every((id) => typeof id === 'string'))) &&
    (value.outboxId === undefined || typeof value.outboxId === 'string')
  );
}

function isChoreOutboxItem(value: unknown) {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.activityId === 'string' &&
    value.activityId.length > 0 &&
    [
      'participant_created',
      'participant_updated',
      'definition_created',
      'definition_updated',
      'definition_archived',
      'definition_deleted',
      'workspace_materialized',
      'workspace_imported',
      'workspace_reset',
      'retention_updated',
      'experience_updated',
      'points_adjusted',
      'reward_requested',
      'reward_approved',
      'reward_declined',
      'reward_fulfilled',
      'reward_refunded',
      'vacation_rescheduled',
      'occurrence_created',
      'due',
      'overdue',
      'claimed',
      'completed',
      'approved',
      'rejected',
      'skipped',
      'reopened',
      'reassigned',
      'missed',
      'reminder_acknowledged',
      'outbox_delivery_updated',
      'reminder_before_due',
      'reminder_due',
      'reminder_overdue',
      'reminder_approval',
    ].includes(String(value.eventType)) &&
    ['pending', 'delivered', 'failed'].includes(String(value.status)) &&
    Number.isSafeInteger(value.attempts) &&
    Number(value.attempts) >= 0 &&
    isIsoTimestamp(value.createdAt) &&
    isIsoTimestamp(value.nextAttemptAt) &&
    (value.lastAttemptAt === undefined || isIsoTimestamp(value.lastAttemptAt)) &&
    (value.deliveredAt === undefined || isIsoTimestamp(value.deliveredAt)) &&
    (value.lastError === undefined || typeof value.lastError === 'string') &&
    (value.occurrenceId === undefined || typeof value.occurrenceId === 'string') &&
    (value.participantId === undefined || typeof value.participantId === 'string') &&
    (value.destination === undefined ||
      ['in_app', 'provider', 'home_assistant'].includes(String(value.destination))) &&
    (value.destinationTarget === undefined || typeof value.destinationTarget === 'string')
  );
}

function hasValidChoreWorkspaceCollections(value: Record<string, unknown>) {
  if (
    !isRecord(value.participantsById) ||
    !isRecord(value.definitionsById) ||
    !isRecord(value.occurrencesById) ||
    !Array.isArray(value.activity)
  ) {
    return false;
  }

  return (
    Object.entries(value.participantsById).every(([id, participant]) =>
      isChoreParticipant(participant, id)
    ) &&
    Object.entries(value.definitionsById).every(([id, definition]) =>
      isChoreDefinition(definition, id)
    ) &&
    Object.entries(value.occurrencesById).every(([id, occurrence]) =>
      isChoreOccurrence(occurrence, id)
    ) &&
    value.activity.every(isChoreActivity)
  );
}

export function createEmptyChoreWorkspace(): ChoreWorkspaceData {
  return {
    schemaVersion: CHORE_WORKSPACE_SCHEMA_VERSION,
    participantsById: {},
    definitionsById: {},
    occurrencesById: {},
    activity: [],
    outbox: [],
    historyRetention: { ...DEFAULT_CHORE_HISTORY_RETENTION },
    experience: createChoreExperienceState(),
  };
}

export function isChoreWorkspaceData(value: unknown): value is ChoreWorkspaceData {
  return (
    isRecord(value) &&
    value.schemaVersion === CHORE_WORKSPACE_SCHEMA_VERSION &&
    hasValidChoreWorkspaceCollections(value) &&
    Array.isArray(value.outbox) &&
    value.outbox.every(isChoreOutboxItem) &&
    (value.historyRetention === undefined ||
      isChoreHistoryRetentionPolicy(value.historyRetention)) &&
    (value.experience === undefined || isChoreExperienceState(value.experience))
  );
}

export function migrateChoreWorkspaceData(value: unknown): ChoreWorkspaceData {
  assertSafeRecord(value);
  if (
    isRecord(value) &&
    value.schemaVersion === CHORE_WORKSPACE_SCHEMA_VERSION &&
    isRecord(value.experience) &&
    value.experience.version === 1
  ) {
    if (
      !isChoreExperienceState({
        ...createChoreExperienceState(),
        ...value.experience,
        version: 2,
      })
    ) {
      throw new Error('Unsupported or invalid chore workspace schema');
    }
    const experience = normalizeChoreExperienceState(value.experience);
    const balances = { ...(experience.earnedPointsByParticipant ?? {}) };
    if (
      experience.gamificationMode !== 'off' &&
      Object.keys(balances).length === 0 &&
      isRecord(value.occurrencesById)
    ) {
      for (const occurrence of Object.values(value.occurrencesById)) {
        if (
          !isRecord(occurrence) ||
          occurrence.status !== 'done' ||
          typeof occurrence.completedBy !== 'string' ||
          typeof occurrence.definitionId !== 'string'
        )
          continue;
        balances[occurrence.completedBy] =
          (balances[occurrence.completedBy] ?? 0) +
          (experience.presentationByDefinitionId[occurrence.definitionId]?.points ?? 0);
      }
    }
    experience.earnedPointsByParticipant = balances;
    experience.pointTransactions = Object.entries(balances).map(([participantId, pointsDelta]) => ({
      id: `opening:${participantId}`,
      participantId,
      pointsDelta,
      kind: 'opening_balance',
      timestamp: '1970-01-01T00:00:00.000Z',
    }));
    const migrated = { ...value, experience };
    if (isChoreWorkspaceData(migrated)) return migrated;
  }
  if (isChoreWorkspaceData(value)) {
    return value.experience ? value : { ...value, experience: createChoreExperienceState() };
  }

  const repaired = repairInvalidRotationCursors(value);
  if (repaired !== value && isChoreWorkspaceData(repaired)) {
    return repaired.experience
      ? repaired
      : { ...repaired, experience: createChoreExperienceState() };
  }

  if (
    isRecord(repaired) &&
    repaired.schemaVersion === 1 &&
    hasValidChoreWorkspaceCollections(repaired)
  ) {
    const migrated: ChoreWorkspaceData = {
      schemaVersion: CHORE_WORKSPACE_SCHEMA_VERSION,
      participantsById: repaired.participantsById as Record<string, ChoreParticipant>,
      definitionsById: repaired.definitionsById as Record<string, ChoreDefinition>,
      occurrencesById: repaired.occurrencesById as Record<string, ChoreOccurrence>,
      activity: repaired.activity as ChoreActivity[],
      outbox: [],
      historyRetention: { ...DEFAULT_CHORE_HISTORY_RETENTION },
      experience: createChoreExperienceState(),
    };
    return migrated;
  }

  throw new Error('Unsupported or invalid chore workspace schema');
}

function repairInvalidRotationCursors(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.definitionsById)) {
    return value;
  }

  let repaired = false;
  const definitionsById = Object.fromEntries(
    Object.entries(value.definitionsById).map(([id, definition]) => {
      if (!isRecord(definition) || !isRecord(definition.assignment)) {
        return [id, definition];
      }
      const cursor = definition.assignment.rotationCursor;
      if (cursor === undefined || (Number.isSafeInteger(cursor) && Number(cursor) >= 0)) {
        return [id, definition];
      }

      repaired = true;
      const assignment = { ...definition.assignment };
      if (assignment.mode === 'rotation') {
        assignment.rotationCursor = 0;
      } else {
        delete assignment.rotationCursor;
      }
      return [id, { ...definition, assignment }];
    })
  );

  return repaired ? { ...value, definitionsById } : value;
}

export function isChoreHistoryRetentionPolicy(
  value: unknown
): value is ChoreHistoryRetentionPolicy {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.maxAgeDays) &&
    Number(value.maxAgeDays) >= 30 &&
    Number(value.maxAgeDays) <= 3650 &&
    Number.isSafeInteger(value.maxEvents) &&
    Number(value.maxEvents) >= 1000 &&
    Number(value.maxEvents) <= 100_000
  );
}

export function createChoreOutboxItem(activity: ChoreActivity): ChoreOutboxItem {
  return {
    id: `outbox:${activity.id}`,
    activityId: activity.id,
    eventType: activity.type,
    status: 'pending',
    attempts: 0,
    createdAt: activity.timestamp,
    nextAttemptAt: activity.timestamp,
  };
}

export function getChoreTiming(occurrence: ChoreOccurrence, now = new Date()): ChoreTiming {
  const nowTime = now.getTime();
  if (nowTime < new Date(occurrence.scheduledAt).getTime()) {
    return 'upcoming';
  }
  if (nowTime > new Date(occurrence.dueAt).getTime() && occurrence.status !== 'done') {
    return 'overdue';
  }
  return 'due';
}

export function materializeChoreOccurrences(
  {
    definition,
    participantsById,
    rangeStart,
    rangeEnd,
    existingOccurrences = {},
    latestCompletedAt,
  }: MaterializeChoreOccurrencesInput,
  materializeNextAfterCompletion = false
): ChoreOccurrence[] {
  if (!definition.enabled || definition.archivedAt) {
    return [];
  }

  const rangeStartTime = new Date(rangeStart).getTime();
  const rangeEndTime = new Date(rangeEnd).getTime();
  if (
    !Number.isFinite(rangeStartTime) ||
    !Number.isFinite(rangeEndTime) ||
    rangeEndTime < rangeStartTime
  ) {
    throw new Error('Invalid chore occurrence range');
  }

  if (definition.schedule.frequency === 'after_completion') {
    if (definition.assignment.mode === 'everyone') {
      return definition.assignment.participantIds.flatMap((participantId) => {
        const personalOccurrences = getParticipantChoreOccurrences(
          definition,
          existingOccurrences,
          participantId
        );
        return materializeChoreOccurrences(
          {
            definition: {
              ...definition,
              assignment: {
                ...definition.assignment,
                mode: 'person',
                participantIds: [participantId],
              },
            },
            participantsById,
            rangeStart,
            rangeEnd,
            existingOccurrences: personalOccurrences,
            latestCompletedAt: getLatestChoreCompletion(personalOccurrences),
          },
          materializeNextAfterCompletion
        );
      });
    }
    const outstanding = getOutstandingChoreOccurrence(
      definition,
      existingOccurrences,
      latestCompletedAt
    );
    if (outstanding) return [outstanding];
  }

  const completionCountsByParticipant: Record<string, number> = Object.create(null);
  if (definition.assignment.rotationStrategy === 'fair') {
    for (const occurrence of Object.values(existingOccurrences)) {
      if (
        occurrence.definitionId !== definition.id ||
        ['skipped', 'missed'].includes(occurrence.status)
      )
        continue;
      for (const id of occurrence.status === 'done' && occurrence.completedBy
        ? [occurrence.completedBy]
        : occurrence.assigneeIds) {
        completionCountsByParticipant[id] = (completionCountsByParticipant[id] ?? 0) + 1;
      }
    }
  }
  const assignmentSlotsAt = (at: string, index: number) => {
    if (definition.assignment.rotationStrategy === 'fair') {
      const saved = Object.values(existingOccurrences)
        .filter((item) => {
          if (item.definitionId !== definition.id) return false;
          if (definition.schedule.frequency === 'hourly') return item.scheduledAt === at;
          const participantId = item.assigneeIds[0];
          const offset =
            definition.assignment.participantScheduleOverrides?.[participantId]
              ?.dueDateOffsetDays ?? 0;
          return (
            addCalendarDays(
              getZonedDateKey(item.scheduledAt, definition.schedule.timeZone),
              -offset
            ) === getZonedDateKey(at, definition.schedule.timeZone)
          );
        })
        .filter(
          (item, index, items) =>
            items.findIndex((candidate) => candidate.assignmentSlot === item.assignmentSlot) ===
            index
        );
      if (saved.length)
        return saved.map((item) => ({
          assignmentSlot: item.assignmentSlot,
          assigneeIds: item.assigneeIds,
        }));
    }
    return resolveAssignmentSlots(
      definition.assignment,
      participantsById,
      index,
      completionCountsByParticipant,
      at
    );
  };
  const schedule = definition.schedule;
  if (schedule.frequency === 'hourly') {
    const anchor = Date.parse(
      localDateTimeToIso(schedule.startDate, schedule.time, schedule.timeZone)
    );
    const interval = schedule.intervalHours * 3_600_000;
    const firstIndex = Math.max(0, Math.ceil((rangeStartTime - anchor) / interval));
    const hourlyOccurrences: ChoreOccurrence[] = [];
    for (let index = firstIndex; anchor + index * interval <= rangeEndTime; index += 1) {
      const scheduledAt = new Date(anchor + index * interval).toISOString();
      const localDate = getZonedDateKey(scheduledAt, schedule.timeZone);
      if (
        (schedule.endDate && localDate > schedule.endDate) ||
        schedule.excludedDates?.includes(localDate)
      )
        continue;
      const slots = assignmentSlotsAt(scheduledAt, index);
      for (const slot of slots) {
        const id = buildOccurrenceId(definition.id, scheduledAt, slot.assignmentSlot);
        if (!existingOccurrences[id] && definition.assignment.rotationStrategy === 'fair') {
          for (const participantId of slot.assigneeIds)
            completionCountsByParticipant[participantId] =
              (completionCountsByParticipant[participantId] ?? 0) + 1;
        }
        hourlyOccurrences.push(
          existingOccurrences[id] ??
            createOccurrence(definition, scheduledAt, slot.assignmentSlot, slot.assigneeIds)
        );
      }
    }
    return hourlyOccurrences;
  }
  const rangeStartDateKey = getZonedDateKey(rangeStart, schedule.timeZone);
  let dateKey = scheduleStartDate(schedule);
  const finalDateKey = getZonedDateKey(rangeEnd, schedule.timeZone);
  const scheduledDates: string[] = [];

  if (schedule.frequency === 'after_completion') {
    const anchor = latestCompletedAt
      ? getZonedDateKey(latestCompletedAt, schedule.timeZone)
      : schedule.startDate;
    const nextDate = latestCompletedAt ? addCalendarDays(anchor, schedule.intervalDays) : anchor;
    if (
      (materializeNextAfterCompletion ||
        nextDate < rangeStartDateKey ||
        (nextDate >= rangeStartDateKey && nextDate <= finalDateKey)) &&
      (schedule.endDate === undefined || nextDate <= schedule.endDate) &&
      !schedule.excludedDates?.includes(nextDate)
    ) {
      scheduledDates.push(nextDate);
    }
  } else {
    while (dateKey <= finalDateKey) {
      if (isScheduledOnDate(schedule, dateKey)) {
        scheduledDates.push(dateKey);
      }
      dateKey = addCalendarDays(dateKey, 1);
    }
  }

  const occurrences: ChoreOccurrence[] = [];
  for (const [scheduledIndex, scheduledDate] of scheduledDates.entries()) {
    const rotationIndex = rotationIndexForDate(
      scheduledDates,
      scheduledIndex,
      definition.assignment.rotationReset,
      definition.assignment.rotationCadence,
      scheduleStartDate(schedule),
      definition.assignment.rotationDayOfWeek
    );
    const assignmentAt = localDateTimeToIso(scheduledDate, schedule.time, schedule.timeZone);
    const slots = assignmentSlotsAt(assignmentAt, rotationIndex);
    for (const slot of slots) {
      const override =
        slot.assigneeIds.length === 1
          ? definition.assignment.participantScheduleOverrides?.[slot.assigneeIds[0]]
          : undefined;
      if (override?.daysOfWeek && !override.daysOfWeek.includes(getDayOfWeek(scheduledDate))) {
        continue;
      }
      for (const scheduledTimeValue of override?.times ?? scheduleTimes(schedule)) {
        const personalDate = override?.dueDateOffsetDays
          ? addCalendarDays(scheduledDate, override.dueDateOffsetDays)
          : scheduledDate;
        const scheduledAt = localDateTimeToIso(personalDate, scheduledTimeValue, schedule.timeZone);
        const scheduledTime = new Date(scheduledAt).getTime();
        if (
          !(
            schedule.frequency === 'after_completion' &&
            (materializeNextAfterCompletion || scheduledTime < rangeStartTime)
          ) &&
          (scheduledTime < rangeStartTime || scheduledTime > rangeEndTime)
        )
          continue;
        const id = buildOccurrenceId(definition.id, scheduledAt, slot.assignmentSlot);
        if (!existingOccurrences[id] && definition.assignment.rotationStrategy === 'fair') {
          for (const participantId of slot.assigneeIds)
            completionCountsByParticipant[participantId] =
              (completionCountsByParticipant[participantId] ?? 0) + 1;
        }
        occurrences.push(
          existingOccurrences[id] ??
            createOccurrence(definition, scheduledAt, slot.assignmentSlot, slot.assigneeIds)
        );
      }
    }
  }

  return occurrences;
}

function timeToMinutes(value: string) {
  const match = TIME_PATTERN.exec(value);
  if (!match) throw new Error(`Invalid chore time: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

function nextReminderDeliveryAt(
  timestamp: string,
  participant: ChoreParticipant,
  fallbackTimeZone: string
) {
  const quietHours = participant.reminderPreferences?.quietHours;
  if (!quietHours || quietHours.start === quietHours.end) return timestamp;
  const timeZone = quietHours.timeZone ?? fallbackTimeZone;
  const parts = getTimeZoneParts(Date.parse(timestamp), timeZone);
  const localMinutes = Number(parts.hour) * 60 + Number(parts.minute);
  const startMinutes = timeToMinutes(quietHours.start);
  const endMinutes = timeToMinutes(quietHours.end);
  const crossesMidnight = startMinutes > endMinutes;
  const insideQuietHours = crossesMidnight
    ? localMinutes >= startMinutes || localMinutes < endMinutes
    : localMinutes >= startMinutes && localMinutes < endMinutes;
  if (!insideQuietHours) return timestamp;

  let quietEndDate = `${parts.year}-${parts.month}-${parts.day}`;
  if (crossesMidnight && localMinutes >= startMinutes) {
    quietEndDate = addCalendarDays(quietEndDate, 1);
  }
  return localDateTimeToIso(quietEndDate, quietHours.end, timeZone);
}

function createReminderOutboxItem(input: {
  definition: ChoreDefinition;
  occurrence: ChoreOccurrence;
  participant: ChoreParticipant;
  eventType: ChoreOutboxEventType;
  eventKey: string;
  timestamp: string;
}): ChoreOutboxItem {
  const id = `outbox:reminder:${input.eventKey}:${input.participant.id}`;
  const destination = input.participant.reminderPreferences?.destination;
  return {
    id,
    activityId: `scheduler:${input.eventKey}`,
    eventType: input.eventType,
    status: 'pending',
    attempts: 0,
    createdAt: input.timestamp,
    nextAttemptAt: nextReminderDeliveryAt(
      input.timestamp,
      input.participant,
      input.definition.schedule.timeZone
    ),
    occurrenceId: input.occurrence.id,
    occurrenceUpdatedAt: input.occurrence.updatedAt,
    participantId: input.participant.id,
    destination: destination?.type ?? 'in_app',
    destinationTarget: destination?.target,
  };
}

function withOccurrenceEventNotifications(
  workspace: ChoreWorkspaceData,
  occurrence: ChoreOccurrence,
  activity: ChoreActivity,
  timestamp: string
): ChoreWorkspaceData {
  const definition = workspace.definitionsById[occurrence.definitionId];
  const outbox = workspace.outbox.filter(
    (item) =>
      item.occurrenceId !== occurrence.id || item.status === 'delivered' || !item.destination
  );
  if (
    !definition?.reminderPolicy?.enabled ||
    !definition.reminderPolicy.notifyOn?.includes(
      activity.type as 'claimed' | 'completed' | 'approved' | 'rejected' | 'skipped'
    )
  ) {
    return { ...workspace, outbox };
  }
  const recipients =
    activity.type === 'claimed' || activity.type === 'completed'
      ? definition.approval.approverIds.length
        ? definition.approval.approverIds
        : occurrence.assigneeIds
      : occurrence.assigneeIds;
  for (const participantId of new Set(recipients)) {
    const participant = workspace.participantsById[participantId];
    if (
      !participant ||
      isChoreParticipantPausedAt(participant, timestamp) ||
      participant.reminderPreferences?.enabled === false
    )
      continue;
    outbox.push({
      ...createReminderOutboxItem({
        definition,
        occurrence,
        participant,
        eventType: activity.type,
        eventKey: `event:${activity.id}`,
        timestamp,
      }),
      activityId: activity.id,
    });
  }
  return { ...workspace, outbox };
}

export function runChoreWorkspaceScheduler(
  workspace: ChoreWorkspaceData,
  timestamp = new Date().toISOString(),
  options: RunChoreWorkspaceSchedulerOptions = {}
): RunChoreWorkspaceSchedulerResult {
  const now = Date.parse(timestamp);
  if (!Number.isFinite(now)) throw new Error('Invalid chore scheduler timestamp');
  const occurrencesById = { ...workspace.occurrencesById };
  const activities: ChoreActivity[] = [];
  const outboxItems: ChoreOutboxItem[] = [];
  const existingOutboxIds = new Set(workspace.outbox.map((item) => item.id));
  const existingEventIds = new Set([
    ...workspace.activity.map((activity) => activity.id),
    ...(options.existingEventIds ?? []),
  ]);
  const hasAvailableAssignee = (occurrence: ChoreOccurrence) =>
    occurrence.assigneeIds.some((id) => {
      const participant = workspace.participantsById[id];
      return (
        participant &&
        !isChoreParticipantPausedAt(participant, timestamp) &&
        !isChoreParticipantPausedAt(participant, occurrence.scheduledAt)
      );
    });

  const addLifecycleEvent = (
    occurrence: ChoreOccurrence,
    type: Extract<ChoreActivityType, 'due' | 'overdue'>,
    eventTimestamp: string
  ) => {
    const id = `activity:scheduler:${type}:${occurrence.id}`;
    if (existingEventIds.has(id)) return;
    existingEventIds.add(id);
    activities.push({
      id,
      commandId: `scheduler:${type}:${occurrence.id}`,
      occurrenceId: occurrence.id,
      definitionId: occurrence.definitionId,
      assigneeIds: occurrence.assigneeIds,
      type,
      timestamp: eventTimestamp,
    });
  };

  for (const occurrence of Object.values(workspace.occurrencesById)) {
    const dueAt = Date.parse(occurrence.dueAt);
    if (!Number.isFinite(dueAt) || now < dueAt) continue;
    if (!hasAvailableAssignee(occurrence)) continue;
    addLifecycleEvent(occurrence, 'due', occurrence.dueAt);
    const resolvedAt = occurrence.completedAt ?? occurrence.skippedAt ?? occurrence.missedAt;
    if (now > dueAt && (!resolvedAt || Date.parse(resolvedAt) > dueAt)) {
      addLifecycleEvent(occurrence, 'overdue', occurrence.dueAt);
    }
  }

  for (const occurrence of Object.values(workspace.occurrencesById)) {
    if (occurrence.status !== 'available' && occurrence.status !== 'claimed') continue;
    if (!hasAvailableAssignee(occurrence)) continue;
    const definition = workspace.definitionsById[occurrence.definitionId];
    if (!definition || definition.schedule.frequency === 'after_completion') continue;
    const superseding = getSupersedingChoreOccurrence(
      occurrence,
      definition,
      occurrencesById,
      timestamp
    );
    const policy = superseding
      ? { graceMinutes: 0, action: 'none' as const }
      : definition.missedPolicy;
    if (
      !policy ||
      (!superseding && policy.action === 'none' && definition.schedule.frequency !== 'once')
    )
      continue;
    const missedBoundary = superseding
      ? Date.parse(superseding.scheduledAt)
      : Date.parse(occurrence.dueAt) + policy.graceMinutes * 60_000;
    if (!Number.isFinite(missedBoundary) || now < missedBoundary) continue;

    const activity: ChoreActivity = {
      id: `activity:scheduler:missed:${occurrence.id}:${missedBoundary}`,
      commandId: `scheduler:missed:${occurrence.id}:${missedBoundary}`,
      occurrenceId: occurrence.id,
      definitionId: definition.id,
      type: policy.action === 'skip' ? 'skipped' : 'missed',
      reason: superseding ? 'Next scheduled occurrence started' : 'Missed-work policy',
      timestamp,
    };
    const nextOccurrence: ChoreOccurrence = {
      ...occurrence,
      status: policy.action === 'skip' ? 'skipped' : 'missed',
      skippedAt: policy.action === 'skip' ? timestamp : occurrence.skippedAt,
      missedAt: policy.action === 'skip' ? occurrence.missedAt : timestamp,
      updatedAt: timestamp,
    };
    activities.push(activity);

    if (policy.action === 'carry_forward') {
      const carryDays = policy.carryForwardDays ?? 1;
      const scheduledAt = new Date(Date.parse(occurrence.scheduledAt) + carryDays * 86_400_000);
      const dueAt = new Date(Date.parse(occurrence.dueAt) + carryDays * 86_400_000);
      const assignmentSlot = `carry:${occurrence.id}`;
      const carriedOccurrence: ChoreOccurrence = {
        id: buildOccurrenceId(definition.id, scheduledAt.toISOString(), assignmentSlot),
        definitionId: definition.id,
        scheduledAt: scheduledAt.toISOString(),
        dueAt: dueAt.toISOString(),
        assigneeIds: occurrence.assigneeIds,
        assignmentSlot,
        status: 'available',
        carriedForwardFrom: occurrence.id,
        updatedAt: timestamp,
      };
      nextOccurrence.carriedForwardTo = carriedOccurrence.id;
      occurrencesById[carriedOccurrence.id] ??= carriedOccurrence;
      activities.push({
        id: `activity:scheduler:created:${carriedOccurrence.id}`,
        commandId: `scheduler:created:${carriedOccurrence.id}`,
        occurrenceId: carriedOccurrence.id,
        definitionId: definition.id,
        type: 'occurrence_created',
        assigneeIds: carriedOccurrence.assigneeIds,
        reason: 'Carried forward from missed chore',
        timestamp,
      });
    }

    occurrencesById[occurrence.id] = nextOccurrence;
  }

  const addReminder = (
    definition: ChoreDefinition,
    occurrence: ChoreOccurrence,
    participantId: string,
    eventType: ChoreReminderEventType,
    eventKey: string
  ) => {
    const participant = workspace.participantsById[participantId];
    if (
      !participant ||
      isChoreParticipantPausedAt(participant, timestamp) ||
      participant.reminderPreferences?.enabled === false
    ) {
      return;
    }
    const item = createReminderOutboxItem({
      definition,
      occurrence,
      participant,
      eventType,
      eventKey,
      timestamp,
    });
    if (existingOutboxIds.has(item.id)) return;
    existingOutboxIds.add(item.id);
    outboxItems.push(item);
  };

  for (const occurrence of Object.values(occurrencesById)) {
    const definition = workspace.definitionsById[occurrence.definitionId];
    const policy = definition?.reminderPolicy;
    if (!definition || !policy?.enabled || definition.archivedAt) continue;
    if (!hasAvailableAssignee(occurrence)) continue;

    if (occurrence.status === 'available' || occurrence.status === 'claimed') {
      const dueAt = Date.parse(occurrence.dueAt);
      for (const beforeDueMinutes of [...new Set(policy.beforeDueMinutes)]) {
        if (now < dueAt - beforeDueMinutes * 60_000 || now >= dueAt) continue;
        for (const participantId of occurrence.assigneeIds) {
          addReminder(
            definition,
            occurrence,
            participantId,
            'reminder_before_due',
            `before:${occurrence.id}:${beforeDueMinutes}`
          );
        }
      }
      if (policy.atDue && now >= dueAt) {
        for (const participantId of occurrence.assigneeIds) {
          addReminder(
            definition,
            occurrence,
            participantId,
            'reminder_due',
            `due:${occurrence.id}`
          );
        }
      }
      if (policy.overdueEveryMinutes && now >= dueAt + policy.overdueEveryMinutes * 60_000) {
        const elapsedSlots = Math.floor((now - dueAt) / (policy.overdueEveryMinutes * 60_000));
        const slotCount = Math.min(elapsedSlots, policy.maxOverdueReminders ?? elapsedSlots);
        for (let slot = 1; slot <= slotCount; slot += 1) {
          for (const participantId of occurrence.assigneeIds) {
            addReminder(
              definition,
              occurrence,
              participantId,
              'reminder_overdue',
              `overdue:${occurrence.id}:${slot}`
            );
          }
        }
      }
    }

    if (
      occurrence.status === 'awaiting_approval' &&
      occurrence.completedAt &&
      policy.approvalAfterMinutes !== undefined &&
      now >= Date.parse(occurrence.completedAt) + policy.approvalAfterMinutes * 60_000
    ) {
      for (const participantId of definition.approval.approverIds) {
        addReminder(
          definition,
          occurrence,
          participantId,
          'reminder_approval',
          `approval:${occurrence.id}`
        );
      }
    }
  }

  return {
    activities,
    outboxItems,
    data: activities.length === 0 ? workspace : { ...workspace, occurrencesById },
  };
}

function requiredCapabilityForCommand(command: ChoreOccurrenceCommand): ChoreParticipantCapability {
  if (command.type === 'approve' || command.type === 'reject') {
    return command.managerOverride ? 'manage' : 'approve';
  }
  if (command.type === 'skip' || command.type === 'reopen' || command.type === 'reassign') {
    return 'manage';
  }
  return 'complete';
}

/**
 * Applies an occurrence action through the complete workspace boundary.
 *
 * This is the preferred entry point for app and automation controls because it verifies that the
 * referenced occurrence, definition, and active household participant still exist before applying
 * the occurrence state machine. The returned activity is intentionally not appended here so the
 * persistence owner can enforce its own retention and exactly-once policy.
 */
export function applyChoreWorkspaceOccurrenceCommand(
  input: ApplyChoreWorkspaceOccurrenceCommandInput
): ApplyChoreWorkspaceOccurrenceCommandResult {
  assertSafeRecord(input.command);
  assertSafeRecord({ occurrenceId: input.occurrenceId });
  const occurrence = input.workspace.occurrencesById[input.occurrenceId];
  if (!occurrence) throw new Error('Chore occurrence is no longer available');

  const definition = input.workspace.definitionsById[occurrence.definitionId];
  if (!definition || definition.archivedAt) {
    throw new Error('Chore definition is no longer available');
  }

  const participant = input.workspace.participantsById[input.command.participantId];
  if (!participant || isChoreParticipantPausedAt(participant, input.timestamp)) {
    throw new Error('Chore participant is not active');
  }

  const requiredCapability = requiredCapabilityForCommand(input.command);
  if (!participant.capabilities.includes(requiredCapability)) {
    throw new Error(`Chore participant cannot ${input.command.type} chores`);
  }

  if (
    input.command.type === 'claim' &&
    definition.claimPolicy?.pendingApproval === 'block' &&
    Object.values(input.workspace.occurrencesById).some(
      (candidate) =>
        candidate.id !== occurrence.id &&
        candidate.definitionId === definition.id &&
        candidate.status === 'awaiting_approval' &&
        candidate.assigneeIds.includes(input.command.participantId)
    )
  ) {
    throw new Error('Review the previous claim before starting this chore');
  }

  if (input.command.type === 'reassign') {
    for (const assigneeId of [...new Set(input.command.assigneeIds)]) {
      const assignee = input.workspace.participantsById[assigneeId];
      if (
        !assignee ||
        isChoreParticipantPausedAt(assignee, input.timestamp) ||
        !assignee.capabilities.includes('complete')
      ) {
        throw new Error('Chore reassignment includes an ineligible participant');
      }
    }
  }

  const result = applyChoreOccurrenceCommand({
    commandId: input.commandId,
    command: input.command,
    definition,
    occurrence,
    timestamp: input.timestamp,
  });

  return {
    activity: result.activity,
    occurrence: result.occurrence,
    data: {
      ...input.workspace,
      occurrencesById: {
        ...input.workspace.occurrencesById,
        [result.occurrence.id]: result.occurrence,
      },
    },
  };
}

function buildWorkspaceActivity(input: {
  commandId: string;
  timestamp: string;
  type: ChoreActivityType;
  actorParticipantId?: string;
  participantId?: string;
  definitionId?: string;
  reason?: string;
  pointsDelta?: number;
}): ChoreActivity {
  return {
    id: `activity:${input.commandId}`,
    commandId: input.commandId,
    timestamp: input.timestamp,
    type: input.type,
    actorParticipantId: input.actorParticipantId,
    participantId: input.participantId,
    definitionId: input.definitionId,
    reason: input.reason,
    pointsDelta: input.pointsDelta,
  };
}

function assertWorkspaceManager(
  workspace: ChoreWorkspaceData,
  participantId: string,
  timestamp: string
) {
  const participant = workspace.participantsById[participantId];
  if (!participant || isChoreParticipantPausedAt(participant, timestamp)) {
    throw new Error('An active household manager is required');
  }
  const activeManagers = Object.values(workspace.participantsById).filter(
    (candidate) =>
      !isChoreParticipantPausedAt(candidate, timestamp) && candidate.capabilities.includes('manage')
  );
  if (activeManagers.length > 0 && !participant.capabilities.includes('manage')) {
    throw new Error('Only a household manager can change chores and profiles');
  }
}

function assertDefinitionReferences(
  workspace: ChoreWorkspaceData,
  definition: ChoreDefinition,
  timestamp: string
) {
  if (definition.assignment.participantIds.length === 0) {
    throw new Error('A chore needs at least one eligible participant');
  }
  for (const participantId of definition.assignment.participantIds) {
    const participant = workspace.participantsById[participantId];
    if (
      !participant ||
      isChoreParticipantPausedAt(participant, timestamp) ||
      !participant.capabilities.includes('complete')
    ) {
      throw new Error('Chore assignment includes an ineligible participant');
    }
  }
  for (const participantId of definition.assignment.standbyParticipantIds ?? []) {
    const participant = workspace.participantsById[participantId];
    if (
      !participant?.capabilities.includes('complete') ||
      definition.assignment.participantIds.includes(participantId)
    ) {
      throw new Error('Chore standby includes an ineligible participant');
    }
  }
  for (const approverId of definition.approval.approverIds) {
    const approver = workspace.participantsById[approverId];
    if (
      !approver ||
      isChoreParticipantPausedAt(approver, timestamp) ||
      !approver.capabilities.includes('approve')
    ) {
      throw new Error('Chore approval includes an ineligible participant');
    }
  }
  if (definition.approval.required && definition.approval.approverIds.length === 0) {
    throw new Error('A chore requiring approval needs an approver');
  }
}

function isWorkspaceMissionComplete(workspace: ChoreWorkspaceData, mission: ChoreMission) {
  const startsAt = Date.parse(mission.startsAt ?? mission.createdAt);
  const endsAt = mission.endsAt ? Date.parse(mission.endsAt) : Number.POSITIVE_INFINITY;
  const completedDefinitionIds = new Set(
    Object.values(workspace.occurrencesById)
      .filter((occurrence) => {
        const scheduledAt = Date.parse(occurrence.scheduledAt);
        return occurrence.status === 'done' && scheduledAt >= startsAt && scheduledAt <= endsAt;
      })
      .map((occurrence) => occurrence.definitionId)
  );
  return mission.definitionIds.every((definitionId) => completedDefinitionIds.has(definitionId));
}

/** Applies every Navet-owned household mutation against the storage authority's current data. */
export function applyChoreWorkspaceAction(
  input: ApplyChoreWorkspaceActionInput
): ApplyChoreWorkspaceActionResult {
  assertSafeRecord(input.action);
  const result = applyChoreWorkspaceActionWithoutRecurrence(input);
  const { action, commandId, timestamp, workspace } = input;
  if (action.type !== 'occurrence_action') return result;
  const previous = workspace.occurrencesById[action.occurrenceId];
  const occurrence = result.data.occurrencesById[action.occurrenceId];
  if (
    !occurrence ||
    previous?.completedAt === occurrence.completedAt ||
    result.data.definitionsById[occurrence.definitionId]?.schedule.frequency !== 'after_completion'
  )
    return result;

  const now = Date.parse(timestamp);
  // Materialize this definition's single next date even beyond the rolling window.
  const materialized = applyChoreWorkspaceActionWithoutRecurrence(
    {
      workspace: result.data,
      commandId: `${commandId}:recurrence`,
      timestamp,
      action: {
        type: 'materialize_occurrences',
        rangeStart: new Date(now - 90 * 86_400_000).toISOString(),
        rangeEnd: new Date(now + 45 * 86_400_000).toISOString(),
      },
    },
    occurrence.definitionId
  );
  return {
    ...result,
    data: materialized.data,
    additionalActivities: [
      ...(result.additionalActivities ?? []),
      ...(materialized.additionalActivities ?? []),
    ],
  };
}

function applyChoreWorkspaceActionWithoutRecurrence(
  input: ApplyChoreWorkspaceActionInput,
  recurrenceDefinitionId?: string
): ApplyChoreWorkspaceActionResult {
  const { action, commandId, timestamp, workspace } = input;
  if (action.type === 'occurrence_action') {
    const previousOccurrence = workspace.occurrencesById[action.occurrenceId];
    if (
      action.expectedOccurrenceUpdatedAt &&
      previousOccurrence?.updatedAt !== action.expectedOccurrenceUpdatedAt
    ) {
      throw new Error('This chore alert is out of date');
    }
    const result = applyChoreWorkspaceOccurrenceCommand({
      commandId,
      command: action.action,
      occurrenceId: action.occurrenceId,
      timestamp,
      workspace,
    });
    const eventData = withOccurrenceEventNotifications(
      result.data,
      result.occurrence,
      result.activity,
      timestamp
    );
    const experience = workspace.experience ?? createChoreExperienceState();
    if (!previousOccurrence || experience.gamificationMode === 'off') {
      return { activity: result.activity, data: eventData };
    }
    const points = experience.presentationByDefinitionId[previousOccurrence.definitionId]?.points;
    const becameFinal = previousOccurrence.status !== 'done' && result.occurrence.status === 'done';
    const stoppedBeingFinal =
      previousOccurrence.status === 'done' && result.occurrence.status !== 'done';
    const participantId = becameFinal
      ? result.occurrence.completedBy
      : stoppedBeingFinal
        ? previousOccurrence.completedBy
        : undefined;
    let nextExperience = experience;
    const pointsDelta =
      points && participantId ? (becameFinal ? points : stoppedBeingFinal ? -points : 0) : 0;
    if (points && participantId && (becameFinal || stoppedBeingFinal)) {
      const balances = getChoreExperiencePointBalances(workspace);
      setOwnRecordValue(balances, participantId, (balances[participantId] ?? 0) + pointsDelta);
      nextExperience = {
        ...nextExperience,
        earnedPointsByParticipant: balances,
        pointTransactions: [
          ...nextExperience.pointTransactions,
          {
            id: `points:${commandId}`,
            participantId,
            pointsDelta,
            kind: becameFinal ? 'completion' : 'reopen',
            timestamp,
            commandId,
            occurrenceId: previousOccurrence.id,
          },
        ],
      };
    }
    const awardedMissionIds = [...(experience.awardedMissionIds ?? [])];
    let householdBonusPoints = experience.householdBonusPoints ?? 0;
    for (const mission of Object.values(experience.missionsById)) {
      if (
        !mission.rewardPoints ||
        mission.status === 'complete' ||
        awardedMissionIds.includes(mission.id) ||
        isWorkspaceMissionComplete(workspace, mission) ||
        !isWorkspaceMissionComplete(result.data, mission)
      ) {
        continue;
      }
      awardedMissionIds.push(mission.id);
      householdBonusPoints += mission.rewardPoints;
    }
    if (
      householdBonusPoints !== (experience.householdBonusPoints ?? 0) ||
      awardedMissionIds.length !== (experience.awardedMissionIds ?? []).length
    ) {
      nextExperience = { ...nextExperience, householdBonusPoints, awardedMissionIds };
    }
    if (becameFinal) {
      const progress = earnChoreProgressAwards({
        badges: nextExperience.badgesById,
        achievements: nextExperience.achievementsById,
        participantIds: Object.keys(workspace.participantsById),
        occurrences: Object.values(eventData.occurrencesById),
        transactions: nextExperience.pointTransactions,
        existingAwards: nextExperience.progressAwards,
        at: timestamp,
      });
      if (progress.awards.length) {
        const balances = getChoreExperiencePointBalances({
          ...eventData,
          experience: nextExperience,
        });
        for (const transaction of progress.transactions) {
          balances[transaction.participantId] =
            (balances[transaction.participantId] ?? 0) + transaction.pointsDelta;
        }
        nextExperience = {
          ...nextExperience,
          earnedPointsByParticipant: balances,
          progressAwards: [...nextExperience.progressAwards, ...progress.awards],
          pointTransactions: [...nextExperience.pointTransactions, ...progress.transactions],
        };
      }
    }
    const activity = pointsDelta
      ? { ...result.activity, participantId, pointsDelta }
      : result.activity;
    if (nextExperience === experience) return { activity, data: eventData };
    return {
      activity,
      data: {
        ...eventData,
        experience: nextExperience,
      },
    };
  }

  if (action.type === 'participant_create') {
    if (!isChoreParticipant(action.participant, action.participant.id)) {
      throw new Error('Household profile is invalid');
    }
    if (workspace.participantsById[action.participant.id]) {
      throw new Error('Household profile already exists');
    }
    if (Object.keys(workspace.participantsById).length === 0) {
      if (!action.participant.capabilities.includes('manage')) {
        throw new Error('The first household profile must be a manager');
      }
    } else {
      if (!action.actorParticipantId) throw new Error('A household manager is required');
      assertWorkspaceManager(workspace, action.actorParticipantId, timestamp);
    }
    return {
      activity: buildWorkspaceActivity({
        commandId,
        timestamp,
        type: 'participant_created',
        actorParticipantId: action.actorParticipantId,
        participantId: action.participant.id,
      }),
      data: {
        ...workspace,
        participantsById: {
          ...workspace.participantsById,
          [action.participant.id]: action.participant,
        },
      },
    };
  }

  if (action.type === 'participant_update') {
    assertWorkspaceManager(workspace, action.actorParticipantId, timestamp);
    const current = workspace.participantsById[action.participant.id];
    if (!current) throw new Error('Household profile is no longer available');
    if (
      !isChoreParticipant(action.participant, action.participant.id) ||
      action.participant.createdAt !== current.createdAt
    ) {
      throw new Error('Household profile update is invalid');
    }
    const nextParticipants = {
      ...workspace.participantsById,
      [action.participant.id]: action.participant,
    };
    const activeManagerCount = Object.values(nextParticipants).filter(
      (participant) =>
        !isChoreParticipantPausedAt(participant, timestamp) &&
        participant.capabilities.includes('manage')
    ).length;
    if (activeManagerCount === 0) throw new Error('The household needs an active manager');
    const pauseChanged =
      current.pausedAt !== action.participant.pausedAt ||
      current.resumeAt !== action.participant.resumeAt;
    const removedOccurrenceIds = new Set<string>();
    if (pauseChanged) {
      for (const occurrence of Object.values(workspace.occurrencesById)) {
        const assignment = workspace.definitionsById[occurrence.definitionId]?.assignment;
        if (
          occurrence.status === 'available' &&
          !occurrence.carriedForwardFrom &&
          !(
            occurrence.assigneeIds.includes(action.participant.id) &&
            isChoreParticipantPausedAt(action.participant, occurrence.scheduledAt)
          ) &&
          Date.parse(occurrence.scheduledAt) > Date.parse(timestamp) &&
          (assignment?.participantIds.includes(action.participant.id) ||
            assignment?.standbyParticipantIds?.includes(action.participant.id))
        )
          removedOccurrenceIds.add(occurrence.id);
      }
    }
    return {
      activity: buildWorkspaceActivity({
        commandId,
        timestamp,
        type: 'participant_updated',
        actorParticipantId: action.actorParticipantId,
        participantId: action.participant.id,
      }),
      data: {
        ...workspace,
        participantsById: nextParticipants,
        occurrencesById: Object.fromEntries(
          Object.entries(workspace.occurrencesById).filter(([id]) => !removedOccurrenceIds.has(id))
        ),
        outbox: workspace.outbox.filter(
          (item) =>
            item.status === 'delivered' ||
            !item.occurrenceId ||
            !removedOccurrenceIds.has(item.occurrenceId)
        ),
      },
    };
  }

  if (action.type === 'definition_create' || action.type === 'definition_update') {
    assertWorkspaceManager(workspace, action.actorParticipantId, timestamp);
    if (!isChoreDefinition(action.definition, action.definition.id)) {
      throw new Error('Chore definition is invalid');
    }
    const current = workspace.definitionsById[action.definition.id];
    if (action.type === 'definition_create' && current) throw new Error('Chore already exists');
    if (action.type === 'definition_update' && !current) {
      throw new Error('Chore is no longer available');
    }
    if (
      action.type === 'definition_update' &&
      current &&
      action.definition.createdAt !== current.createdAt
    ) {
      throw new Error('Chore creation time cannot be changed');
    }
    assertDefinitionReferences(workspace, action.definition, timestamp);
    const shouldRematerialize =
      action.type === 'definition_update' &&
      current !== undefined &&
      definitionMaterializationChanged(current, action.definition);
    const removedOccurrenceIds = new Set<string>();
    const occurrencesById = shouldRematerialize
      ? Object.fromEntries(
          Object.entries(workspace.occurrencesById).filter(([id, occurrence]) => {
            const shouldRemove =
              occurrence.definitionId === action.definition.id &&
              Date.parse(occurrence.scheduledAt) > Date.parse(timestamp) &&
              canDiscardForRematerialization(occurrence);
            if (shouldRemove) removedOccurrenceIds.add(id);
            return !shouldRemove;
          })
        )
      : workspace.occurrencesById;
    const outbox =
      removedOccurrenceIds.size > 0
        ? workspace.outbox.filter(
            (item) =>
              item.status === 'delivered' ||
              !item.occurrenceId ||
              !removedOccurrenceIds.has(item.occurrenceId)
          )
        : workspace.outbox;
    return {
      activity: buildWorkspaceActivity({
        commandId,
        timestamp,
        type: action.type === 'definition_create' ? 'definition_created' : 'definition_updated',
        actorParticipantId: action.actorParticipantId,
        definitionId: action.definition.id,
      }),
      data: {
        ...workspace,
        occurrencesById,
        outbox,
        definitionsById: {
          ...workspace.definitionsById,
          [action.definition.id]: action.definition,
        },
      },
    };
  }

  if (action.type === 'definition_archive' || action.type === 'definition_restore') {
    assertWorkspaceManager(workspace, action.actorParticipantId, timestamp);
    const definition = workspace.definitionsById[action.definitionId];
    if (!definition) throw new Error('Chore is no longer available');
    const nextDefinition = { ...definition, enabled: true, updatedAt: timestamp };
    if (action.type === 'definition_archive') {
      nextDefinition.enabled = false;
      nextDefinition.archivedAt = timestamp;
    } else {
      delete nextDefinition.archivedAt;
    }
    const occurrencesById =
      action.type === 'definition_archive'
        ? Object.fromEntries(
            Object.entries(workspace.occurrencesById).filter(
              ([, occurrence]) =>
                occurrence.definitionId !== action.definitionId ||
                occurrence.status === 'done' ||
                occurrence.status === 'skipped'
            )
          )
        : workspace.occurrencesById;
    return {
      activity: buildWorkspaceActivity({
        commandId,
        timestamp,
        type: action.type === 'definition_archive' ? 'definition_archived' : 'definition_updated',
        actorParticipantId: action.actorParticipantId,
        definitionId: action.definitionId,
      }),
      data: {
        ...workspace,
        definitionsById: {
          ...workspace.definitionsById,
          [action.definitionId]: nextDefinition,
        },
        occurrencesById,
      },
    };
  }

  if (action.type === 'definition_delete') {
    assertWorkspaceManager(workspace, action.actorParticipantId, timestamp);
    if (!workspace.definitionsById[action.definitionId]) {
      throw new Error('Chore is no longer available');
    }

    const definitionsById = { ...workspace.definitionsById };
    delete definitionsById[action.definitionId];
    const removedOccurrenceIds = new Set(
      Object.values(workspace.occurrencesById)
        .filter((occurrence) => occurrence.definitionId === action.definitionId)
        .map((occurrence) => occurrence.id)
    );
    const removedActivityIds = new Set(
      workspace.activity
        .filter(
          (activity) => activity.occurrenceId && removedOccurrenceIds.has(activity.occurrenceId)
        )
        .map((activity) => activity.id)
    );
    const occurrencesById = Object.fromEntries(
      Object.entries(workspace.occurrencesById).filter(
        ([, occurrence]) => occurrence.definitionId !== action.definitionId
      )
    );
    const experience = workspace.experience ?? createChoreExperienceState();
    const presentationByDefinitionId = {
      ...experience.presentationByDefinitionId,
    };
    delete presentationByDefinitionId[action.definitionId];
    const missionsById: ChoreExperienceState['missionsById'] = Object.fromEntries(
      Object.entries(experience.missionsById).flatMap(([id, mission]) => {
        const definitionIds = mission.definitionIds.filter(
          (definitionId) => definitionId !== action.definitionId
        );
        return definitionIds.length > 0 ? [[id, { ...mission, definitionIds }]] : [];
      })
    );
    const awardedMissionIds = experience.awardedMissionIds?.filter((missionId) =>
      Boolean(missionsById[missionId])
    );

    return {
      activity: buildWorkspaceActivity({
        commandId,
        timestamp,
        type: 'definition_deleted',
        actorParticipantId: action.actorParticipantId,
        definitionId: action.definitionId,
      }),
      data: {
        ...workspace,
        definitionsById,
        occurrencesById,
        outbox: workspace.outbox.filter(
          (item) =>
            (!item.occurrenceId || !removedOccurrenceIds.has(item.occurrenceId)) &&
            !removedActivityIds.has(item.activityId)
        ),
        experience: {
          ...experience,
          presentationByDefinitionId,
          missionsById,
          awardedMissionIds,
        },
      },
    };
  }

  if (action.type === 'retention_update') {
    assertWorkspaceManager(workspace, action.actorParticipantId, timestamp);
    if (!isChoreHistoryRetentionPolicy(action.policy)) {
      throw new Error('Chore history retention policy is invalid');
    }
    return {
      activity: buildWorkspaceActivity({
        commandId,
        timestamp,
        type: 'retention_updated',
        actorParticipantId: action.actorParticipantId,
      }),
      data: { ...workspace, historyRetention: { ...action.policy } },
    };
  }

  if (action.type === 'experience_update') {
    assertWorkspaceManager(workspace, action.actorParticipantId, timestamp);
    if (!isChoreExperienceState(action.experience)) {
      throw new Error('Chore experience data is invalid');
    }
    const currentExperience = workspace.experience ?? createChoreExperienceState();
    if (
      JSON.stringify(action.experience.rewardRequestsById) !==
        JSON.stringify(currentExperience.rewardRequestsById) ||
      JSON.stringify(action.experience.pointTransactions) !==
        JSON.stringify(currentExperience.pointTransactions) ||
      JSON.stringify(action.experience.progressAwards) !==
        JSON.stringify(currentExperience.progressAwards) ||
      JSON.stringify(action.experience.earnedPointsByParticipant) !==
        JSON.stringify(currentExperience.earnedPointsByParticipant)
    ) {
      throw new Error('Reward and point history can only change through household actions');
    }
    for (const definitionId of Object.keys(action.experience.presentationByDefinitionId)) {
      if (!workspace.definitionsById[definitionId]) {
        throw new Error('Chore experience references an unavailable chore');
      }
    }
    for (const mission of Object.values(action.experience.missionsById)) {
      if (mission.definitionIds.some((definitionId) => !workspace.definitionsById[definitionId])) {
        throw new Error('Chore mission references an unavailable chore');
      }
    }
    for (const goal of Object.values(action.experience.rewardGoalsById)) {
      if (goal.participantId && !workspace.participantsById[goal.participantId]) {
        throw new Error('Chore reward references an unavailable participant');
      }
    }
    for (const participantId of Object.keys(action.experience.earnedPointsByParticipant ?? {})) {
      if (!workspace.participantsById[participantId]) {
        throw new Error('Chore experience points reference an unavailable participant');
      }
    }
    return {
      activity: buildWorkspaceActivity({
        commandId,
        timestamp,
        type: 'experience_updated',
        actorParticipantId: action.actorParticipantId,
      }),
      data: { ...workspace, experience: action.experience },
    };
  }

  if (action.type === 'experience_points_adjust') {
    assertWorkspaceManager(workspace, action.actorParticipantId, timestamp);
    if (!workspace.participantsById[action.participantId]) {
      throw new Error('Chore participant is no longer available');
    }
    if (
      !Number.isSafeInteger(action.pointsDelta) ||
      action.pointsDelta === 0 ||
      Math.abs(action.pointsDelta) > 10_000
    ) {
      throw new Error('Point adjustment must be a non-zero whole number up to 10000');
    }
    const reason = action.reason?.trim() || undefined;
    const experience = workspace.experience ?? createChoreExperienceState();
    const balances = getChoreExperiencePointBalances(workspace);
    const nextBalance = (balances[action.participantId] ?? 0) + action.pointsDelta;
    if (Math.abs(nextBalance) > 1_000_000_000) {
      throw new Error('Point balance must stay between -1000000000 and 1000000000');
    }
    balances[action.participantId] = nextBalance;
    return {
      activity: buildWorkspaceActivity({
        commandId,
        timestamp,
        type: 'points_adjusted',
        actorParticipantId: action.actorParticipantId,
        participantId: action.participantId,
        reason,
        pointsDelta: action.pointsDelta,
      }),
      data: {
        ...workspace,
        experience: {
          ...experience,
          earnedPointsByParticipant: balances,
          pointTransactions: [
            ...experience.pointTransactions,
            {
              id: `points:${commandId}`,
              participantId: action.participantId,
              pointsDelta: action.pointsDelta,
              kind: 'adjustment',
              timestamp,
              commandId,
            },
          ],
        },
      },
    };
  }

  if (action.type === 'reward_request') {
    if (!action.requestId.trim()) throw new Error('Reward request ID is required');
    const participant = workspace.participantsById[action.participantId];
    if (
      !participant ||
      isChoreParticipantPausedAt(participant, timestamp) ||
      !participant.capabilities.includes('complete')
    ) {
      throw new Error('Chore participant is not active');
    }
    const experience = workspace.experience ?? createChoreExperienceState();
    if (experience.gamificationMode === 'off') throw new Error('Rewards are unavailable');
    if (experience.rewardRequestsById[action.requestId])
      throw new Error('Reward request already exists');
    const reward = experience.rewardGoalsById[action.rewardId];
    if (
      !reward?.enabled ||
      (reward.participantId && reward.participantId !== action.participantId)
    ) {
      throw new Error('Reward is unavailable');
    }
    if (
      (getChoreExperiencePointBalances(workspace)[action.participantId] ?? 0) < reward.targetPoints
    ) {
      throw new Error('Not enough points for this reward');
    }
    return {
      activity: buildWorkspaceActivity({
        commandId,
        timestamp,
        type: 'reward_requested',
        actorParticipantId: action.participantId,
        participantId: action.participantId,
      }),
      data: {
        ...workspace,
        experience: {
          ...experience,
          rewardRequestsById: {
            ...experience.rewardRequestsById,
            [action.requestId]: {
              id: action.requestId,
              rewardId: reward.id,
              rewardTitle: reward.title,
              cost: reward.targetPoints,
              participantId: action.participantId,
              status: 'requested',
              requestedAt: timestamp,
              updatedAt: timestamp,
            },
          },
        },
      },
    };
  }

  if (action.type === 'reward_decision') {
    assertWorkspaceManager(workspace, action.actorParticipantId, timestamp);
    const experience = workspace.experience ?? createChoreExperienceState();
    const request = experience.rewardRequestsById[action.requestId];
    if (!request) throw new Error('Reward request is no longer available');
    const status =
      action.decision === 'approve'
        ? 'approved'
        : action.decision === 'decline'
          ? 'declined'
          : action.decision === 'fulfill'
            ? 'fulfilled'
            : 'refunded';
    if (
      ((action.decision === 'approve' || action.decision === 'decline') &&
        request.status !== 'requested') ||
      (action.decision === 'fulfill' && request.status !== 'approved') ||
      (action.decision === 'refund' && !['approved', 'fulfilled'].includes(request.status))
    ) {
      throw new Error('Reward request has already changed');
    }
    const pointsDelta =
      action.decision === 'approve'
        ? -request.cost
        : action.decision === 'refund'
          ? request.cost
          : 0;
    const balances = getChoreExperiencePointBalances(workspace);
    if (pointsDelta < 0 && (balances[request.participantId] ?? 0) < request.cost) {
      throw new Error('Not enough points for this reward');
    }
    if (pointsDelta)
      setOwnRecordValue(
        balances,
        request.participantId,
        (balances[request.participantId] ?? 0) + pointsDelta
      );
    const pointTransactions = [
      ...experience.pointTransactions,
      {
        id: `points:reward:${request.id}:${action.decision}`,
        participantId: request.participantId,
        pointsDelta,
        kind:
          action.decision === 'approve'
            ? ('reward' as const)
            : action.decision === 'refund'
              ? ('refund' as const)
              : ('reward_decision' as const),
        timestamp,
        commandId,
        rewardRequestId: request.id,
      },
    ];
    const activity = buildWorkspaceActivity({
      commandId,
      timestamp,
      type: `reward_${status}` as ChoreActivityType,
      actorParticipantId: action.actorParticipantId,
      participantId: request.participantId,
      reason: action.reason?.trim() || undefined,
      pointsDelta: Math.abs(pointsDelta) <= 10_000 ? pointsDelta || undefined : undefined,
    });
    return {
      activity,
      data: {
        ...workspace,
        experience: {
          ...experience,
          rewardRequestsById: {
            ...experience.rewardRequestsById,
            [request.id]: {
              ...request,
              status,
              updatedAt: timestamp,
              managerParticipantId: action.actorParticipantId,
              reason: action.reason?.trim() || undefined,
            },
          },
          earnedPointsByParticipant: balances,
          pointTransactions,
        },
      },
    };
  }

  if (action.type === 'reminder_acknowledge') {
    const reminder = workspace.outbox.find((item) => item.id === action.outboxId);
    if (!reminder?.eventType.startsWith('reminder_')) {
      throw new Error('Chore reminder is no longer available');
    }
    const actor = workspace.participantsById[action.actorParticipantId];
    if (!actor || isChoreParticipantPausedAt(actor, timestamp))
      throw new Error('Chore participant is not active');
    if (
      reminder.participantId !== action.actorParticipantId &&
      !actor.capabilities.includes('manage')
    ) {
      throw new Error('Participant cannot acknowledge this chore reminder');
    }
    const activity: ChoreActivity = {
      id: `activity:${commandId}`,
      commandId,
      occurrenceId: reminder.occurrenceId,
      definitionId: reminder.occurrenceId
        ? workspace.occurrencesById[reminder.occurrenceId]?.definitionId
        : undefined,
      participantId: reminder.participantId,
      actorParticipantId: action.actorParticipantId,
      outboxId: reminder.id,
      type: 'reminder_acknowledged',
      timestamp,
    };
    return {
      activity,
      data: {
        ...workspace,
        outbox: workspace.outbox.map((item) =>
          item.id === reminder.id
            ? {
                ...item,
                status: 'delivered' as const,
                deliveredAt: timestamp,
                lastAttemptAt: timestamp,
              }
            : item
        ),
      },
    };
  }

  if (action.type === 'outbox_delivery_update') {
    const target = workspace.outbox.find((item) => item.id === action.outboxId);
    if (!target) throw new Error('Chore outbox item is no longer available');
    const attempt = target.attempts + 1;
    const retryDelay = Math.min(60 * 60_000, 2 ** Math.min(attempt, 10) * 30_000);
    const activity: ChoreActivity = {
      id: `activity:${commandId}`,
      commandId,
      occurrenceId: target.occurrenceId,
      definitionId: target.occurrenceId
        ? workspace.occurrencesById[target.occurrenceId]?.definitionId
        : undefined,
      participantId: target.participantId,
      outboxId: target.id,
      type: 'outbox_delivery_updated',
      reason: action.status === 'failed' ? action.error?.trim() || 'Delivery failed' : undefined,
      timestamp,
    };
    return {
      activity,
      data: {
        ...workspace,
        outbox: workspace.outbox.map((item) =>
          item.id === target.id
            ? {
                ...item,
                status: action.status,
                attempts: attempt,
                lastAttemptAt: timestamp,
                deliveredAt: action.status === 'delivered' ? timestamp : undefined,
                lastError:
                  action.status === 'failed'
                    ? action.error?.trim() || 'Delivery failed'
                    : undefined,
                nextAttemptAt:
                  action.status === 'failed'
                    ? new Date(Date.parse(timestamp) + retryDelay).toISOString()
                    : item.nextAttemptAt,
              }
            : item
        ),
      },
    };
  }

  if (action.type === 'vacation_reschedule') {
    assertWorkspaceManager(workspace, action.actorParticipantId, timestamp);
    const participant = workspace.participantsById[action.participantId];
    if (!participant?.pausedAt || !participant.resumeAt) {
      throw new Error('A scheduled return is required');
    }
    parseDateKey(action.startDate);
    if (
      action.occurrenceIds.length === 0 ||
      action.occurrenceIds.length > 100 ||
      new Set(action.occurrenceIds).size !== action.occurrenceIds.length
    ) {
      throw new Error('Choose eligible chores to move');
    }
    const occurrencesById = { ...workspace.occurrencesById };
    const additionalActivities: ChoreActivity[] = [];
    const selected = action.occurrenceIds
      .map((id) => {
        const occurrence = occurrencesById[id];
        if (
          occurrence?.status !== 'available' ||
          occurrence.claimedAt ||
          occurrence.carriedForwardTo ||
          !occurrence.assigneeIds.includes(participant.id) ||
          Date.parse(occurrence.scheduledAt) < Date.parse(participant.pausedAt as string) ||
          Date.parse(occurrence.scheduledAt) >= Date.parse(participant.resumeAt as string)
        ) {
          throw new Error('A selected chore can no longer be moved');
        }
        return occurrence;
      })
      .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt));
    for (const [index, occurrence] of selected.entries()) {
      const definition = workspace.definitionsById[occurrence.definitionId];
      if (!definition) throw new Error('Chore definition is no longer available');
      const parts = getTimeZoneParts(
        Date.parse(occurrence.scheduledAt),
        definition.schedule.timeZone
      );
      const time = `${parts.hour}:${parts.minute}`;
      const scheduledAt = localDateTimeToIso(
        addCalendarDays(action.startDate, index),
        time,
        definition.schedule.timeZone
      );
      if (
        Date.parse(scheduledAt) <= Date.parse(timestamp) ||
        Date.parse(scheduledAt) < Date.parse(participant.resumeAt)
      ) {
        throw new Error('Moved chores must begin after the return');
      }
      const id = buildOccurrenceId(definition.id, scheduledAt, `vacation:${occurrence.id}`);
      if (occurrencesById[id]) throw new Error('Moved chore already exists');
      occurrencesById[occurrence.id] = {
        ...occurrence,
        status: 'skipped',
        skippedBy: action.actorParticipantId,
        skippedAt: timestamp,
        carriedForwardTo: id,
        updatedAt: timestamp,
      };
      occurrencesById[id] = {
        ...occurrence,
        id,
        scheduledAt,
        dueAt: new Date(
          Date.parse(scheduledAt) +
            Date.parse(occurrence.dueAt) -
            Date.parse(occurrence.scheduledAt)
        ).toISOString(),
        status: 'available',
        carriedForwardFrom: occurrence.id,
        carriedForwardTo: undefined,
        skippedBy: undefined,
        skippedAt: undefined,
        updatedAt: timestamp,
      };
      additionalActivities.push({
        id: `activity:${commandId}:created:${id}`,
        commandId,
        occurrenceId: id,
        definitionId: definition.id,
        assigneeIds: occurrence.assigneeIds,
        type: 'occurrence_created',
        reason: 'Moved after vacation',
        timestamp,
      });
    }
    return {
      activity: buildWorkspaceActivity({
        commandId,
        timestamp,
        type: 'vacation_rescheduled',
        actorParticipantId: action.actorParticipantId,
        participantId: participant.id,
      }),
      additionalActivities,
      data: {
        ...workspace,
        occurrencesById,
        outbox: workspace.outbox.filter(
          (item) =>
            item.status === 'delivered' || !action.occurrenceIds.includes(item.occurrenceId ?? '')
        ),
      },
    };
  }

  const rangeStart = Date.parse(action.rangeStart);
  const rangeEnd = Date.parse(action.rangeEnd);
  if (
    !Number.isFinite(rangeStart) ||
    !Number.isFinite(rangeEnd) ||
    rangeEnd < rangeStart ||
    rangeEnd - rangeStart > 180 * 86_400_000
  ) {
    throw new Error('Chore materialization range is invalid');
  }
  const occurrencesById = { ...workspace.occurrencesById };
  const scheduledOccurrenceIdsByDefinition = new Map<string, Set<string>>();
  const occurrenceCreatedActivities: ChoreActivity[] = [];
  for (const definition of Object.values(workspace.definitionsById)) {
    const latestCompletedAt = Object.values(occurrencesById)
      .filter(
        (occurrence) =>
          occurrence.definitionId === definition.id && occurrence.completedAt !== undefined
      )
      .map((occurrence) => occurrence.completedAt as string)
      .sort()
      .at(-1);
    const materialized = materializeChoreOccurrences(
      {
        definition,
        participantsById: workspace.participantsById,
        existingOccurrences: occurrencesById,
        latestCompletedAt,
        rangeStart: action.rangeStart,
        rangeEnd: action.rangeEnd,
      },
      definition.id === recurrenceDefinitionId
    );
    scheduledOccurrenceIdsByDefinition.set(
      definition.id,
      new Set(materialized.map((occurrence) => occurrence.id))
    );
    if (materialized.filter((item) => !occurrencesById[item.id]).length > 5000) {
      throw new Error('Too many chore occurrences');
    }
    for (const occurrence of materialized) {
      if (!occurrencesById[occurrence.id]) {
        if (
          Date.parse(occurrence.scheduledAt) <= Date.parse(timestamp) &&
          Object.values(workspace.occurrencesById).some(
            (existing) =>
              existing.definitionId === occurrence.definitionId &&
              existing.scheduledAt === occurrence.scheduledAt &&
              (definition.assignment.mode !== 'everyone' ||
                existing.assignmentSlot === occurrence.assignmentSlot)
          )
        ) {
          continue;
        }
        setOwnRecordValue(occurrencesById, occurrence.id, occurrence);
        occurrenceCreatedActivities.push({
          id: `activity:${commandId}:created:${occurrence.id}`,
          commandId,
          occurrenceId: occurrence.id,
          definitionId: occurrence.definitionId,
          type: 'occurrence_created',
          assigneeIds: occurrence.assigneeIds,
          timestamp,
        });
        const dueAt = Date.parse(occurrence.dueAt);
        const materializedAt = Date.parse(timestamp);
        if (Number.isFinite(dueAt) && materializedAt >= dueAt) {
          occurrenceCreatedActivities.push({
            id: `activity:scheduler:due:${occurrence.id}`,
            commandId: `scheduler:due:${occurrence.id}`,
            occurrenceId: occurrence.id,
            definitionId: occurrence.definitionId,
            assigneeIds: occurrence.assigneeIds,
            type: 'due',
            timestamp: occurrence.dueAt,
          });
        }
        if (Number.isFinite(dueAt) && materializedAt > dueAt) {
          occurrenceCreatedActivities.push({
            id: `activity:scheduler:overdue:${occurrence.id}`,
            commandId: `scheduler:overdue:${occurrence.id}`,
            occurrenceId: occurrence.id,
            definitionId: occurrence.definitionId,
            assigneeIds: occurrence.assigneeIds,
            type: 'overdue',
            timestamp: occurrence.dueAt,
          });
        }
      }
    }
  }
  const removedOccurrenceIds = new Set<string>();
  for (const [id, occurrence] of Object.entries(occurrencesById)) {
    const scheduledIds = scheduledOccurrenceIdsByDefinition.get(occurrence.definitionId);
    const scheduledAt = Date.parse(occurrence.scheduledAt);
    if (
      scheduledIds &&
      (occurrence.definitionId === recurrenceDefinitionId ||
        (scheduledAt >= rangeStart && scheduledAt <= rangeEnd)) &&
      scheduledAt > Date.parse(timestamp) &&
      !scheduledIds.has(id) &&
      !occurrence.assigneeIds.some((participantId) => {
        const participant = workspace.participantsById[participantId];
        return participant && isChoreParticipantPausedAt(participant, occurrence.scheduledAt);
      }) &&
      canDiscardForRematerialization(occurrence)
    ) {
      delete occurrencesById[id];
      removedOccurrenceIds.add(id);
    }
  }
  const retentionBoundary = Date.parse(timestamp) - 90 * 86_400_000;
  for (const occurrence of Object.values(occurrencesById)) {
    if (
      shouldPruneChoreOccurrence(
        occurrence,
        workspace.definitionsById,
        occurrencesById,
        retentionBoundary
      )
    ) {
      delete occurrencesById[occurrence.id];
    }
  }
  return {
    activity: buildWorkspaceActivity({ commandId, timestamp, type: 'workspace_materialized' }),
    additionalActivities: occurrenceCreatedActivities,
    data: {
      ...workspace,
      occurrencesById,
      outbox:
        removedOccurrenceIds.size === 0
          ? workspace.outbox
          : workspace.outbox.filter(
              (item) =>
                item.status === 'delivered' ||
                !item.occurrenceId ||
                !removedOccurrenceIds.has(item.occurrenceId)
            ),
    },
  };
}

export function getChoreExperiencePointBalances(
  workspace: ChoreWorkspaceData
): Record<string, number> {
  const experience = workspace.experience ?? createChoreExperienceState();
  const persisted = experience.earnedPointsByParticipant;
  if (persisted) return { ...persisted };
  const balances: Record<string, number> = Object.create(null);
  for (const occurrence of Object.values(workspace.occurrencesById)) {
    if (occurrence.status !== 'done' || !occurrence.completedBy) continue;
    const points = experience.presentationByDefinitionId[occurrence.definitionId]?.points ?? 0;
    balances[occurrence.completedBy] = (balances[occurrence.completedBy] ?? 0) + points;
  }
  return balances;
}
