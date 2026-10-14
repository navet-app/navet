import { isHomeAssistantPanelMode } from '@navet/app/runtime/app-mode';
import { resolveAddonLocalEndpointUrl } from '@navet/app/utils/home-assistant-connection-target';
import {
  type ChoreInterchangeDocument,
  parseChoreInterchangeDocument,
} from '@navet/core/chore-interchange';
import {
  type ChoreDefinition,
  type ChoreOccurrence,
  type ChoreWorkspaceAction,
  migrateChoreWorkspaceData,
} from '@navet/core/chores';
import {
  CHORE_WORKSPACE_ENDPOINTS,
  CHORE_WORKSPACE_HEADERS,
  type ChoreAutomationEvent,
  type ChoreDefinitionListDocument,
  type ChoreEventFeedDocument,
  type ChoreHistoryDocument,
  type ChoreManagementPinRemoveRequest,
  type ChoreManagementPinRequest,
  type ChoreManagementPinStateDocument,
  type ChoreManagementSessionDocument,
  type ChoreManagementVerifyRequest,
  type ChoreOccurrenceListDocument,
  type ChorePointHistoryPage,
  type ChoreWorkspaceCommandRequest,
  type ChoreWorkspaceDocument,
  type ChoreWorkspaceRecoveryInfo,
  type ChoreWorkspaceRecoveryRequest,
  type ChoreWorkspaceResetRequest,
  type ChoreWorkspaceRestoreRequest,
} from './chore-workspace.contract';
import { homeAssistantService } from './home-assistant.service';

export interface ChoreWorkspaceLoadResult {
  available: boolean;
  unauthorized: boolean;
  notModified: boolean;
  failureKind?: 'unsupported' | 'invalid_data' | 'unreachable';
  error: string | null;
  recovery: ChoreWorkspaceRecoveryInfo | null;
  revision: number | null;
  document: ChoreWorkspaceDocument | null;
}

export interface ChoreWorkspaceCommandResult {
  saved: boolean;
  unauthorized: boolean;
  preconditionFailed: boolean;
  error: string | null;
  revision: number | null;
  document: ChoreWorkspaceDocument | null;
  retryable?: boolean;
}

export interface ChoreAutomationReadResult<T> {
  available: boolean;
  unauthorized: boolean;
  value: T | null;
}

export interface ChoreRuntimeCapabilities {
  contractVersion: 1;
  schemaVersion: 2;
  authority: 'home_assistant_panel' | 'navet_addon' | 'standalone';
  backgroundScheduling: boolean;
  backgroundNotifications: boolean;
  projectionOwnedByAuthority: boolean;
  actionServices: boolean;
  lastSchedulerRunAt?: string;
  pendingDeliveryCount?: number;
  lastDeliveryError?: string | null;
}

export interface ChoreWorkspaceTransport {
  kind: 'home_assistant_websocket' | 'http';
  loadCapabilities: () => Promise<ChoreRuntimeCapabilities | null>;
  loadWorkspace: (revision?: number) => Promise<ChoreWorkspaceLoadResult>;
  subscribe: (callback: (document: ChoreWorkspaceDocument) => void) => Promise<() => void>;
  sendCommand: (request: ChoreWorkspaceCommandRequest) => Promise<ChoreWorkspaceCommandResult>;
}

/** Provider-neutral entry point used by the household store and background hooks. */
export function getChoreWorkspaceTransport(): ChoreWorkspaceTransport {
  return {
    kind: isHomeAssistantPanelMode() ? 'home_assistant_websocket' : 'http',
    loadCapabilities: loadChoreRuntimeCapabilities,
    loadWorkspace: loadChoreWorkspace,
    subscribe: subscribeChoreWorkspace,
    sendCommand: sendChoreWorkspaceCommand,
  };
}

const PANEL_COMMANDS = {
  capabilities: 'navet/chores/info',
  workspace: 'navet/chores/workspace/get',
  subscribe: 'navet/chores/workspace/subscribe',
  definitions: 'navet/chores/definitions/get',
  occurrences: 'navet/chores/occurrences/get',
  events: 'navet/chores/events/get',
  history: 'navet/chores/history/get',
  points: 'navet/chores/points/get',
  backup: 'navet/chores/backup/get',
  command: 'navet/chores/command',
  restore: 'navet/chores/restore',
  reset: 'navet/chores/reset',
  recovery: 'navet/chores/recovery',
  pin: 'navet/chores/management/pin',
  removePin: 'navet/chores/management/pin/remove',
  verify: 'navet/chores/management/verify',
} as const;

function getPanelConnection() {
  return homeAssistantService.getConnection();
}

async function sendPanelCommand<T>(type: string, payload: Record<string, unknown> = {}) {
  const connection = getPanelConnection();
  if (!connection) throw new Error('Home Assistant panel connection is unavailable');
  return await connection.sendMessagePromise<T>({ type, ...payload });
}

function panelErrorMessage(error: unknown, fallback: string) {
  const message =
    error instanceof Error
      ? error.message
      : error &&
          typeof error === 'object' &&
          typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : fallback;
  if (/unknown command|not[_ ]ready|not found|unsupported.*navet\/chores/i.test(message)) {
    return 'Update the Navet Home Assistant integration before using chores in the custom panel.';
  }
  if (/panel connection is unavailable/i.test(message)) {
    return 'The Home Assistant panel connection is not ready. Reload Navet and try again.';
  }
  return message;
}

function panelFailureKind(
  error: unknown,
  recovery: ChoreWorkspaceRecoveryInfo | null
): ChoreWorkspaceLoadResult['failureKind'] {
  const message =
    error instanceof Error
      ? error.message
      : error &&
          typeof error === 'object' &&
          typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : '';
  if (/unknown command|not[_ ]ready|not found|unsupported.*navet\/chores/i.test(message)) {
    return 'unsupported';
  }
  if (recovery?.reason === 'workspace_invalid' || recovery?.reason === 'workspace_too_large') {
    return 'invalid_data';
  }
  return 'unreachable';
}

function panelRecoveryInfo(error: unknown): ChoreWorkspaceRecoveryInfo | null {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as {
    data?: { recovery?: Partial<ChoreWorkspaceRecoveryInfo> };
    error?: { data?: { recovery?: Partial<ChoreWorkspaceRecoveryInfo> } };
  };
  const recovery = candidate.data?.recovery ?? candidate.error?.data?.recovery;
  const reason = recovery?.reason;
  if (
    typeof recovery?.backupAvailable !== 'boolean' ||
    typeof recovery.pinConfigured !== 'boolean' ||
    (reason !== 'storage_unavailable' &&
      reason !== 'workspace_invalid' &&
      reason !== 'workspace_too_large')
  ) {
    return null;
  }
  return {
    backupAvailable: recovery.backupAvailable,
    pinConfigured: recovery.pinConfigured,
    reason,
  };
}

function panelErrorDetails(error: unknown): { code: string | null; revision: number | null } {
  if (!error || typeof error !== 'object') return { code: null, revision: null };
  const candidate = error as {
    code?: unknown;
    data?: { revision?: unknown };
    error?: { code?: unknown; data?: { revision?: unknown } };
  };
  const code = candidate.code ?? candidate.error?.code;
  const revision = candidate.data?.revision ?? candidate.error?.data?.revision;
  return {
    code: typeof code === 'string' ? code : null,
    revision: typeof revision === 'number' && Number.isSafeInteger(revision) ? revision : null,
  };
}

function panelCommandForEndpoint(endpoint: string) {
  if (endpoint === CHORE_WORKSPACE_ENDPOINTS.definitions) return PANEL_COMMANDS.definitions;
  if (endpoint === CHORE_WORKSPACE_ENDPOINTS.occurrences) return PANEL_COMMANDS.occurrences;
  if (endpoint === CHORE_WORKSPACE_ENDPOINTS.events) return PANEL_COMMANDS.events;
  if (endpoint === CHORE_WORKSPACE_ENDPOINTS.history) return PANEL_COMMANDS.history;
  if (endpoint === CHORE_WORKSPACE_ENDPOINTS.points) return PANEL_COMMANDS.points;
  if (endpoint === CHORE_WORKSPACE_ENDPOINTS.backup) return PANEL_COMMANDS.backup;
  throw new Error(`Unsupported panel chore endpoint: ${endpoint}`);
}

export async function loadChoreRuntimeCapabilities(): Promise<ChoreRuntimeCapabilities | null> {
  if (isHomeAssistantPanelMode()) {
    try {
      return await sendPanelCommand<ChoreRuntimeCapabilities>(PANEL_COMMANDS.capabilities);
    } catch {
      return null;
    }
  }

  try {
    const response = await fetch(resolveAddonLocalEndpointUrl('/__navet_chores__/capabilities'), {
      credentials: 'same-origin',
    });
    if (!response.ok) return null;
    const value = (await response.json()) as Partial<ChoreRuntimeCapabilities>;
    if (value.contractVersion !== 1 || value.schemaVersion !== 2) return null;
    return value as ChoreRuntimeCapabilities;
  } catch {
    return null;
  }
}

export async function subscribeChoreWorkspace(
  callback: (document: ChoreWorkspaceDocument) => void
): Promise<() => void> {
  if (!isHomeAssistantPanelMode()) return () => {};
  const connection = getPanelConnection();
  if (!connection?.subscribeMessage) {
    throw new Error('Home Assistant panel connection cannot subscribe to chores');
  }
  return await connection.subscribeMessage(
    (value: ChoreWorkspaceDocument) => {
      const document = parsePanelDocument(value);
      if (document) callback(document);
    },
    { type: PANEL_COMMANDS.subscribe }
  );
}

function endpointWithQuery(endpoint: string, query: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && String(value).length > 0) search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized ? `${endpoint}?${serialized}` : endpoint;
}

async function loadAutomationResource<T>(endpoint: string): Promise<ChoreAutomationReadResult<T>> {
  if (isHomeAssistantPanelMode()) {
    try {
      const query = endpoint.includes('?')
        ? Object.fromEntries(new URLSearchParams(endpoint.split('?', 2)[1]))
        : {};
      const value = await sendPanelCommand<T>(
        panelCommandForEndpoint(endpoint.split('?', 1)[0]),
        query
      );
      return { available: true, unauthorized: false, value };
    } catch {
      return { available: false, unauthorized: false, value: null };
    }
  }
  try {
    const response = await fetch(resolveAddonLocalEndpointUrl(endpoint), {
      credentials: 'same-origin',
    });
    if (response.status === 401 || response.status === 403) {
      return { available: false, unauthorized: true, value: null };
    }
    if (!response.ok) return { available: false, unauthorized: false, value: null };
    return { available: true, unauthorized: false, value: (await response.json()) as T };
  } catch {
    return { available: false, unauthorized: false, value: null };
  }
}

export async function loadChoreDefinitions(): Promise<
  ChoreAutomationReadResult<{ revision: number; definitions: ChoreDefinition[] }>
> {
  const result = await loadAutomationResource<ChoreDefinitionListDocument>(
    CHORE_WORKSPACE_ENDPOINTS.definitions
  );
  return {
    ...result,
    value: result.value
      ? { revision: result.value.revision, definitions: result.value.definitions }
      : null,
  };
}

export async function loadChoreOccurrences(
  filters: { from?: string; to?: string; participantId?: string; definitionId?: string } = {}
): Promise<ChoreAutomationReadResult<{ revision: number; occurrences: ChoreOccurrence[] }>> {
  const result = await loadAutomationResource<ChoreOccurrenceListDocument>(
    endpointWithQuery(CHORE_WORKSPACE_ENDPOINTS.occurrences, filters)
  );
  return {
    ...result,
    value: result.value
      ? { revision: result.value.revision, occurrences: result.value.occurrences }
      : null,
  };
}

export async function loadChoreEvents(
  filters: {
    after?: string;
    limit?: number;
    types?: string;
    occurrenceId?: string;
    definitionId?: string;
  } = {}
): Promise<
  ChoreAutomationReadResult<{
    cursor: string;
    hasMore: boolean;
    events: ChoreAutomationEvent[];
  }>
> {
  const result = await loadAutomationResource<ChoreEventFeedDocument>(
    endpointWithQuery(CHORE_WORKSPACE_ENDPOINTS.events, filters)
  );
  return {
    ...result,
    value: result.value
      ? {
          cursor: result.value.cursor,
          hasMore: result.value.hasMore,
          events: result.value.events,
        }
      : null,
  };
}

export async function loadChoreHistory(): Promise<ChoreAutomationReadResult<ChoreHistoryDocument>> {
  return loadAutomationResource<ChoreHistoryDocument>(CHORE_WORKSPACE_ENDPOINTS.history);
}

export async function loadChorePointHistory(
  filters: { after?: string; limit?: number } = {}
): Promise<ChoreAutomationReadResult<ChorePointHistoryPage>> {
  return loadAutomationResource<ChorePointHistoryPage>(
    endpointWithQuery(CHORE_WORKSPACE_ENDPOINTS.points, filters)
  );
}

export async function loadChoreBackup(): Promise<
  ChoreAutomationReadResult<ChoreInterchangeDocument>
> {
  const result = await loadAutomationResource<unknown>(CHORE_WORKSPACE_ENDPOINTS.backup);
  if (!result.value) return { ...result, value: null };
  try {
    return { ...result, value: parseChoreInterchangeDocument(result.value) };
  } catch {
    return { available: false, unauthorized: false, value: null };
  }
}

async function sendChoreAdministrationRequest(
  endpoint: string,
  request: ChoreWorkspaceRestoreRequest | ChoreWorkspaceResetRequest
): Promise<ChoreWorkspaceCommandResult> {
  if (isHomeAssistantPanelMode()) {
    try {
      const type =
        endpoint === CHORE_WORKSPACE_ENDPOINTS.restore
          ? PANEL_COMMANDS.restore
          : PANEL_COMMANDS.reset;
      const document = await sendPanelCommand<ChoreWorkspaceDocument>(
        type,
        request as unknown as Record<string, unknown>
      );
      return {
        saved: Boolean(document),
        unauthorized: false,
        preconditionFailed: false,
        error: null,
        revision: document?.revision ?? null,
        document: document ? parsePanelDocument(document) : null,
      };
    } catch (error) {
      const details = panelErrorDetails(error);
      return {
        saved: false,
        unauthorized: false,
        preconditionFailed: details.code === 'stale_revision',
        error: panelErrorMessage(error, 'Chore workspace administration failed'),
        revision: details.revision,
        document: null,
        retryable: details.code !== 'stale_revision',
      };
    }
  }
  try {
    const response = await fetch(resolveAddonLocalEndpointUrl(endpoint), {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        [CHORE_WORKSPACE_HEADERS.baseRevision]: String(request.baseRevision),
        ...(request.managementSessionToken
          ? {
              [CHORE_WORKSPACE_HEADERS.managementSession]: request.managementSessionToken,
            }
          : {}),
      },
      body: JSON.stringify(request),
    });
    const document = response.ok ? await parseDocument(response) : null;
    return {
      saved: response.ok && document !== null,
      unauthorized: response.status === 401,
      preconditionFailed: response.status === 412,
      error: response.ok ? null : await parseError(response),
      revision: document?.revision ?? parseRevision(response),
      document,
      retryable: response.status >= 500,
    };
  } catch {
    return {
      saved: false,
      unauthorized: false,
      preconditionFailed: false,
      error: 'Chore workspace administration failed',
      revision: null,
      document: null,
      retryable: true,
    };
  }
}

export function restoreChoreWorkspace(request: ChoreWorkspaceRestoreRequest) {
  return sendChoreAdministrationRequest(CHORE_WORKSPACE_ENDPOINTS.restore, request);
}

export function resetChoreWorkspace(request: ChoreWorkspaceResetRequest) {
  return sendChoreAdministrationRequest(CHORE_WORKSPACE_ENDPOINTS.reset, request);
}

export interface ChoreManagementSessionResult {
  unlocked: boolean;
  unauthorized: boolean;
  error: string | null;
  document: ChoreManagementSessionDocument | null;
}

async function sendChoreManagementRequest(
  endpoint: string,
  request: ChoreManagementPinRequest | ChoreManagementVerifyRequest,
  managementSessionToken?: string
): Promise<ChoreManagementSessionResult> {
  if (isHomeAssistantPanelMode()) {
    try {
      const type =
        endpoint === CHORE_WORKSPACE_ENDPOINTS.managementPin
          ? PANEL_COMMANDS.pin
          : PANEL_COMMANDS.verify;
      const document = await sendPanelCommand<ChoreManagementSessionDocument>(type, {
        ...request,
        ...(managementSessionToken ? { managementSessionToken } : {}),
      });
      return {
        unlocked: Boolean(document?.sessionToken),
        unauthorized: false,
        error: null,
        document: document ?? null,
      };
    } catch (error) {
      return {
        unlocked: false,
        unauthorized: false,
        error: error instanceof Error ? error.message : 'Chore management could not be unlocked',
        document: null,
      };
    }
  }
  try {
    const response = await fetch(resolveAddonLocalEndpointUrl(endpoint), {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(managementSessionToken
          ? {
              [CHORE_WORKSPACE_HEADERS.managementSession]: managementSessionToken,
            }
          : {}),
      },
      body: JSON.stringify(request),
    });
    const document = response.ok
      ? ((await response.json()) as ChoreManagementSessionDocument)
      : null;
    return {
      unlocked: response.ok && Boolean(document?.sessionToken),
      unauthorized: response.status === 401 || response.status === 403 || response.status === 429,
      error: response.ok ? null : await parseError(response),
      document,
    };
  } catch {
    return {
      unlocked: false,
      unauthorized: false,
      error: 'Chore management could not be unlocked',
      document: null,
    };
  }
}

export function configureChoreManagementPin(
  request: ChoreManagementPinRequest,
  managementSessionToken?: string
) {
  return sendChoreManagementRequest(
    CHORE_WORKSPACE_ENDPOINTS.managementPin,
    request,
    managementSessionToken
  );
}

export function verifyChoreManagementPin(request: ChoreManagementVerifyRequest) {
  return sendChoreManagementRequest(CHORE_WORKSPACE_ENDPOINTS.managementVerify, request);
}

export interface ChoreManagementPinRemovalResult {
  removed: boolean;
  unauthorized: boolean;
  error: string | null;
  document: ChoreManagementPinStateDocument | null;
}

export async function removeChoreManagementPin(
  request: ChoreManagementPinRemoveRequest,
  managementSessionToken: string
): Promise<ChoreManagementPinRemovalResult> {
  if (isHomeAssistantPanelMode()) {
    try {
      const document = await sendPanelCommand<ChoreManagementPinStateDocument>(
        PANEL_COMMANDS.removePin,
        { ...request, managementSessionToken }
      );
      return {
        removed: document?.pinConfigured === false,
        unauthorized: false,
        error: null,
        document: document ?? null,
      };
    } catch (error) {
      return {
        removed: false,
        unauthorized: false,
        error: error instanceof Error ? error.message : 'Management PIN could not be removed',
        document: null,
      };
    }
  }

  try {
    const response = await fetch(
      resolveAddonLocalEndpointUrl(CHORE_WORKSPACE_ENDPOINTS.managementPin),
      {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          [CHORE_WORKSPACE_HEADERS.managementSession]: managementSessionToken,
        },
        body: JSON.stringify(request),
      }
    );
    const document = response.ok
      ? ((await response.json()) as ChoreManagementPinStateDocument)
      : null;
    return {
      removed: response.ok && document?.pinConfigured === false,
      unauthorized: response.status === 401 || response.status === 403,
      error: response.ok ? null : await parseError(response),
      document,
    };
  } catch {
    return {
      removed: false,
      unauthorized: false,
      error: 'Management PIN could not be removed',
      document: null,
    };
  }
}

function parseRevision(response: Response) {
  const revision = Number.parseInt(
    response.headers.get(CHORE_WORKSPACE_HEADERS.revision) ?? '',
    10
  );
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

async function parseDocument(response: Response): Promise<ChoreWorkspaceDocument | null> {
  try {
    const body = (await response.json()) as Partial<ChoreWorkspaceDocument>;
    if (
      typeof body.revision !== 'number' ||
      !Number.isSafeInteger(body.revision) ||
      typeof body.updatedAt !== 'string'
    ) {
      return null;
    }
    return {
      revision: body.revision,
      updatedAt: body.updatedAt,
      data: migrateChoreWorkspaceData(body.data),
      management: {
        pinConfigured: body.management?.pinConfigured === true,
      },
    };
  } catch {
    return null;
  }
}

function parsePanelDocument(value: unknown): ChoreWorkspaceDocument | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Partial<ChoreWorkspaceDocument>;
  if (
    typeof body.revision !== 'number' ||
    !Number.isSafeInteger(body.revision) ||
    typeof body.updatedAt !== 'string'
  ) {
    return null;
  }
  try {
    return {
      revision: body.revision,
      updatedAt: body.updatedAt,
      data: migrateChoreWorkspaceData(body.data),
      management: { pinConfigured: body.management?.pinConfigured === true },
    };
  } catch {
    return null;
  }
}

async function parseError(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === 'string' && body.error.trim() ? body.error : null;
  } catch {
    return null;
  }
}

async function parseWorkspaceFailure(response: Response): Promise<{
  error: string | null;
  recovery: ChoreWorkspaceRecoveryInfo | null;
}> {
  try {
    const body = (await response.json()) as {
      error?: unknown;
      recovery?: Partial<ChoreWorkspaceRecoveryInfo>;
    };
    const recovery = body.recovery;
    const reason = recovery?.reason;
    return {
      error: typeof body.error === 'string' && body.error.trim() ? body.error : null,
      recovery:
        typeof recovery?.backupAvailable === 'boolean' &&
        typeof recovery.pinConfigured === 'boolean' &&
        (reason === 'workspace_invalid' || reason === 'workspace_too_large')
          ? {
              backupAvailable: recovery.backupAvailable,
              pinConfigured: recovery.pinConfigured,
              reason,
            }
          : null,
    };
  } catch {
    return { error: null, recovery: null };
  }
}

export async function loadChoreWorkspace(revision?: number): Promise<ChoreWorkspaceLoadResult> {
  if (isHomeAssistantPanelMode()) {
    try {
      const result = await sendPanelCommand<ChoreWorkspaceDocument & { notModified?: boolean }>(
        PANEL_COMMANDS.workspace,
        revision === undefined ? {} : { revision }
      );
      if (result?.notModified) {
        return {
          available: true,
          unauthorized: false,
          notModified: true,
          error: null,
          recovery: null,
          revision: result.revision ?? revision ?? null,
          document: null,
        };
      }
      const document = parsePanelDocument(result);
      return {
        available: document !== null,
        unauthorized: false,
        notModified: false,
        failureKind: document ? undefined : 'invalid_data',
        error: document
          ? null
          : 'Navet received chore data it could not safely read. Your household data was left unchanged.',
        recovery: null,
        revision: document?.revision ?? null,
        document,
      };
    } catch (error) {
      const recovery = panelRecoveryInfo(error);
      return {
        available: false,
        unauthorized: false,
        notModified: false,
        failureKind: panelFailureKind(error, recovery),
        error: panelErrorMessage(error, 'Chore storage could not be reached'),
        recovery,
        revision: null,
        document: null,
      };
    }
  }

  try {
    const response = await fetch(resolveAddonLocalEndpointUrl(CHORE_WORKSPACE_ENDPOINTS.current), {
      credentials: 'same-origin',
      headers:
        revision === undefined
          ? undefined
          : { [CHORE_WORKSPACE_HEADERS.revision]: String(revision) },
    });
    if (response.status === 304) {
      return {
        available: true,
        unauthorized: false,
        notModified: true,
        error: null,
        recovery: null,
        revision: parseRevision(response) ?? revision ?? null,
        document: null,
      };
    }
    if (response.status === 401 || response.status === 403) {
      return {
        available: false,
        unauthorized: true,
        notModified: false,
        error: 'Authentication is required to load chores',
        recovery: null,
        revision: parseRevision(response),
        document: null,
      };
    }
    if (!response.ok) {
      const failure = await parseWorkspaceFailure(response);
      return {
        available: false,
        unauthorized: false,
        notModified: false,
        failureKind:
          failure.recovery?.reason === 'workspace_invalid' ||
          failure.recovery?.reason === 'workspace_too_large'
            ? 'invalid_data'
            : 'unreachable',
        error: failure.error,
        recovery: failure.recovery,
        revision: parseRevision(response),
        document: null,
      };
    }

    const document = await parseDocument(response);
    return {
      available: document !== null,
      unauthorized: false,
      notModified: false,
      failureKind: document ? undefined : 'invalid_data',
      error: document
        ? null
        : 'Navet received chore data it could not safely read. Your household data was left unchanged.',
      recovery: null,
      revision: document?.revision ?? parseRevision(response),
      document,
    };
  } catch {
    return {
      available: false,
      unauthorized: false,
      notModified: false,
      failureKind: 'unreachable',
      error: 'Chore storage could not be reached',
      recovery: null,
      revision: null,
      document: null,
    };
  }
}

export async function recoverChoreWorkspace(
  request: ChoreWorkspaceRecoveryRequest
): Promise<ChoreWorkspaceCommandResult> {
  if (isHomeAssistantPanelMode()) {
    try {
      const document = await sendPanelCommand<ChoreWorkspaceDocument>(
        PANEL_COMMANDS.recovery,
        request as unknown as Record<string, unknown>
      );
      const parsed = parsePanelDocument(document);
      return {
        saved: parsed !== null,
        unauthorized: false,
        preconditionFailed: false,
        error: parsed ? null : 'The Home Assistant recovery response was invalid',
        revision: parsed?.revision ?? null,
        document: parsed,
      };
    } catch (error) {
      return {
        saved: false,
        unauthorized: false,
        preconditionFailed: false,
        error: error instanceof Error ? error.message : 'Chore recovery could not be completed',
        revision: null,
        document: null,
        retryable: true,
      };
    }
  }
  try {
    const response = await fetch(resolveAddonLocalEndpointUrl(CHORE_WORKSPACE_ENDPOINTS.recovery), {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(request.managementSessionToken
          ? {
              [CHORE_WORKSPACE_HEADERS.managementSession]: request.managementSessionToken,
            }
          : {}),
      },
      body: JSON.stringify({ action: request.action, confirmation: request.confirmation }),
    });
    const document = response.ok ? await parseDocument(response) : null;
    return {
      saved: response.ok && document !== null,
      unauthorized: response.status === 401,
      preconditionFailed: false,
      error: response.ok ? null : await parseError(response),
      revision: document?.revision ?? parseRevision(response),
      document,
    };
  } catch {
    return {
      saved: false,
      unauthorized: false,
      preconditionFailed: false,
      error: 'Chore recovery could not be completed',
      revision: null,
      document: null,
    };
  }
}

export async function sendChoreWorkspaceCommand(
  request: ChoreWorkspaceCommandRequest
): Promise<ChoreWorkspaceCommandResult> {
  if (isHomeAssistantPanelMode()) {
    try {
      const document = await sendPanelCommand<ChoreWorkspaceDocument>(
        PANEL_COMMANDS.command,
        request as unknown as Record<string, unknown>
      );
      const parsed = parsePanelDocument(document);
      return {
        saved: parsed !== null,
        unauthorized: false,
        preconditionFailed: false,
        error: parsed ? null : 'The Home Assistant chore command response was invalid',
        revision: parsed?.revision ?? null,
        document: parsed,
      };
    } catch (error) {
      const message = panelErrorMessage(error, 'Chore workspace sync failed');
      const details = panelErrorDetails(error);
      return {
        saved: false,
        unauthorized: false,
        preconditionFailed:
          details.code === 'stale_revision' || /stale|revision|changed/i.test(message),
        error: message,
        revision: details.revision,
        document: null,
        retryable: details.code !== 'stale_revision',
      };
    }
  }

  try {
    const response = await fetch(resolveAddonLocalEndpointUrl(CHORE_WORKSPACE_ENDPOINTS.commands), {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        [CHORE_WORKSPACE_HEADERS.baseRevision]: String(request.baseRevision),
        ...(request.managementSessionToken
          ? {
              [CHORE_WORKSPACE_HEADERS.managementSession]: request.managementSessionToken,
            }
          : {}),
      },
      body: JSON.stringify(request),
    });
    const conflict: { error?: unknown } | null =
      response.status === 412 ? await response.json().catch(() => null) : null;
    const document = response.ok ? await parseDocument(response) : parsePanelDocument(conflict);
    const error = response.ok
      ? null
      : response.status === 412
        ? typeof conflict?.error === 'string' && conflict.error.trim()
          ? conflict.error
          : null
        : await parseError(response);
    return {
      saved: response.ok && document !== null,
      unauthorized: response.status === 401,
      preconditionFailed: response.status === 412,
      error,
      revision: document?.revision ?? parseRevision(response),
      document,
      retryable: response.status >= 500,
    };
  } catch {
    return {
      saved: false,
      unauthorized: false,
      preconditionFailed: false,
      error: 'Chore workspace sync failed',
      revision: null,
      document: null,
      retryable: true,
    };
  }
}

export function createChoreWorkspaceCommandRequest(input: {
  commandId: string;
  baseRevision: number;
  action: ChoreWorkspaceAction;
  managementSessionToken?: string;
}): ChoreWorkspaceCommandRequest {
  return input;
}
