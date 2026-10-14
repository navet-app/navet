import type { ChorePointTransaction } from '@navet/core/chore-experience';
import type { ChoreInterchangeDocument } from '@navet/core/chore-interchange';
import type {
  ChoreActivity,
  ChoreActivityType,
  ChoreDefinition,
  ChoreOccurrence,
  ChoreWorkspaceAction,
  ChoreWorkspaceData,
} from '@navet/core/chores';

export const CHORE_WORKSPACE_ENDPOINTS = {
  current: '/__navet_chores__/workspace',
  commands: '/__navet_chores__/commands',
  actions: '/__navet_chores__/actions',
  definitions: '/__navet_chores__/definitions',
  occurrences: '/__navet_chores__/occurrences',
  events: '/__navet_chores__/events',
  history: '/__navet_chores__/history',
  points: '/__navet_chores__/points',
  backup: '/__navet_chores__/backup',
  restore: '/__navet_chores__/restore',
  reset: '/__navet_chores__/reset',
  recovery: '/__navet_chores__/recovery',
  managementPin: '/__navet_chores__/management/pin',
  managementVerify: '/__navet_chores__/management/verify',
} as const;

export const CHORE_WORKSPACE_HEADERS = {
  revision: 'X-Navet-Chore-Revision',
  baseRevision: 'X-Navet-Base-Revision',
  managementSession: 'X-Navet-Chore-Management-Session',
} as const;

export interface ChoreWorkspaceDocument {
  revision: number;
  updatedAt: string;
  data: ChoreWorkspaceData;
  management: {
    pinConfigured: boolean;
  };
}

export interface ChoreManagementPinRequest {
  actorParticipantId: string;
  pin: string;
}

export interface ChoreManagementPinRemoveRequest {
  actorParticipantId: string;
}

export interface ChoreManagementPinStateDocument {
  pinConfigured: boolean;
}

export interface ChoreManagementVerifyRequest {
  pin: string;
}

export interface ChoreManagementSessionDocument {
  pinConfigured: boolean;
  sessionToken: string;
  expiresAt: string;
}

export interface ChoreWorkspaceRecoveryInfo {
  backupAvailable: boolean;
  pinConfigured: boolean;
  reason: 'storage_unavailable' | 'workspace_invalid' | 'workspace_too_large';
}

export interface ChoreWorkspaceRecoveryRequest {
  action: 'restore_backup' | 'reset';
  confirmation: 'REPAIR CHORES' | 'RESET CHORES';
  managementSessionToken?: string;
}

export const CHORE_AUTOMATION_EVENT_TYPES = [
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
] as const satisfies readonly ChoreActivityType[];

export type ChoreAutomationEventType = (typeof CHORE_AUTOMATION_EVENT_TYPES)[number];
export type ChoreAutomationEvent = ChoreActivity & { type: ChoreAutomationEventType };

export interface ChoreDefinitionListDocument {
  contractVersion: 1;
  revision: number;
  definitions: ChoreDefinition[];
}

export interface ChoreOccurrenceListDocument {
  contractVersion: 1;
  revision: number;
  occurrences: ChoreOccurrence[];
}

export interface ChoreEventFeedDocument {
  contractVersion: 1;
  cursor: string;
  hasMore: boolean;
  events: ChoreAutomationEvent[];
}

export interface ChoreHistoryDocument {
  contractVersion: 1;
  events: ChoreActivity[];
}

export interface ChoreWorkspaceRestoreRequest extends ChoreWorkspaceCommandRequestBase {
  actorParticipantId: string;
  mode: 'merge' | 'replace';
  document: ChoreInterchangeDocument;
}

export interface ChoreWorkspaceResetRequest extends ChoreWorkspaceCommandRequestBase {
  actorParticipantId: string;
  confirmation: 'DELETE ALL CHORES';
}

interface ChoreWorkspaceCommandRequestBase {
  commandId: string;
  baseRevision: number;
  managementSessionToken?: string;
}

export interface ChoreWorkspaceCommandRequest extends ChoreWorkspaceCommandRequestBase {
  action: ChoreWorkspaceAction;
}

export interface ChorePointHistoryPage {
  contractVersion: 1;
  revision: number;
  cursor: string;
  hasMore: boolean;
  points: ChorePointTransaction[];
}
