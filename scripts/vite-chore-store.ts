import { getChoreSchedulerDeadline, compactChoreHistory, compactChoreWorkspace, isChoreBookkeeping, isChoreMaterializationUnchanged, readChoreHistoryPage, type CompactChoreHistory } from '../packages/core/src/chore-storage-policy.ts'
import fileSystem from 'node:fs'
import boundedFile from '../docker/shared/bounded-file.js'
import choreDurableStorage from '../docker/njs/chore-durable-storage.js'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type {
  ChoreWorkspaceAction,
  ChoreOccurrence,
  ChoreActivity,
  ChoreWorkspaceData,
} from '../packages/core/src/chores.ts'
import {
  applyChoreWorkspaceAction,
  CHORE_WORKSPACE_SCHEMA_VERSION,
  createChoreOutboxItem,
  createEmptyChoreWorkspace,
  DEFAULT_CHORE_HISTORY_RETENTION,
  migrateChoreWorkspaceData,
  materializeChoreOccurrences,
  isChoreParticipantPausedAt,
  runChoreWorkspaceScheduler,
} from '../packages/core/src/chores.ts'
import { applyChoreHistoryRetention } from '../packages/core/src/chore-insights.ts'
import { isChoreExperienceState } from '../packages/core/src/chore-experience.ts'
import { createChoreInterchangeDocument } from '../packages/core/src/chore-interchange.ts'
import {
  mergeChoreInterchange,
  parseChoreInterchangeDocument,
} from '../packages/core/src/chore-interchange.ts'
import {
  CHORE_AUTOMATION_EVENT_TYPES,
  CHORE_WORKSPACE_HEADERS,
  type ChoreWorkspaceCommandRequest,
  type ChoreWorkspaceDocument,
  type ChoreWorkspaceResetRequest,
  type ChoreWorkspaceRestoreRequest,
} from '../packages/app/src/services/chore-workspace.contract.ts'
export interface ViteChorePrincipal {
  sessionId: string
}
import { isViteStrictSameOriginMutation } from './vite-provider-session-store.ts'

const CONTRACT_VERSION = 1
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024
const MAX_JOURNAL_BYTES = 512 * 1024
const MAX_JOURNAL_ITEMS = 500
const MAX_OUTBOX_ITEMS = 5000
const MAX_EVENT_HISTORY_BYTES = 64 * 1024 * 1024
const MAX_IMPORT_BYTES = 64 * 1024 * 1024
const MAX_MANAGEMENT_SECURITY_BYTES = 16 * 1024
const MANAGEMENT_SESSION_DURATION_MS = 30 * 60 * 1000
const MANAGEMENT_PIN_PATTERN = /^\d{4,8}$/

interface PersistedChoreWorkspaceDocument extends Omit<ChoreWorkspaceDocument, 'management'> {
  contractVersion: typeof CONTRACT_VERSION
  tenantId: string
  storageMaintenanceVersion?: number
}

interface ChoreManagementSecurityDocument {
  contractVersion: typeof CONTRACT_VERSION
  tenantId: string
  salt: string
  pinHash: string
  updatedAt: string
}

interface ChoreManagementSession {
  token: string
  tenantId: string
  expiresAt: number
}

interface ChoreCommandJournal {
  contractVersion: typeof CONTRACT_VERSION
  commands: Array<{ commandId: string; revision: number; timestamp: string }>
}

type ChoreEventHistory = CompactChoreHistory

function emptyChoreWorkspace(): ChoreWorkspaceData {
  return createEmptyChoreWorkspace()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isChoreWorkspaceAction(value: unknown): value is ChoreWorkspaceAction {
  if (!isRecord(value) || typeof value.type !== 'string') return false
  if (value.type === 'occurrence_action') {
    if (
      !(
      typeof value.occurrenceId === 'string' &&
      Boolean(value.occurrenceId) &&
      isRecord(value.action) &&
      typeof value.action.participantId === 'string' &&
      Boolean(value.action.participantId) &&
      ['claim', 'complete', 'approve', 'reject', 'skip', 'reopen', 'reassign'].includes(
        String(value.action.type)
      )
      )
    ) return false
    if (value.action.type === 'skip' || value.action.type === 'reopen') {
      return typeof value.action.reason === 'string' && Boolean(value.action.reason.trim())
    }
    if (value.action.type === 'reassign') {
      return (
        typeof value.action.reason === 'string' &&
        Boolean(value.action.reason.trim()) &&
        Array.isArray(value.action.assigneeIds) &&
        value.action.assigneeIds.every((id) => typeof id === 'string' && Boolean(id))
      )
    }
    return (
      (value.action.managerOverride === undefined ||
        typeof value.action.managerOverride === 'boolean') &&
      (value.action.reason === undefined || typeof value.action.reason === 'string')
    )
  }
  if (value.type === 'participant_create') {
    return isRecord(value.participant) &&
      (value.actorParticipantId === undefined || typeof value.actorParticipantId === 'string')
  }
  if (value.type === 'participant_update') {
    return isRecord(value.participant) && typeof value.actorParticipantId === 'string'
  }
  if (value.type === 'definition_create' || value.type === 'definition_update') {
    return isRecord(value.definition) && typeof value.actorParticipantId === 'string'
  }
  if (
    value.type === 'definition_archive' ||
    value.type === 'definition_restore' ||
    value.type === 'definition_delete'
  ) {
    return typeof value.definitionId === 'string' && typeof value.actorParticipantId === 'string'
  }
  if (value.type === 'retention_update') {
    return (
      typeof value.actorParticipantId === 'string' &&
      isRecord(value.policy) &&
      Number.isSafeInteger(value.policy.maxAgeDays) &&
      Number.isSafeInteger(value.policy.maxEvents)
    )
  }
  if (value.type === 'experience_update') {
    return (
      typeof value.actorParticipantId === 'string' &&
      isChoreExperienceState(value.experience)
    )
  }
  if (value.type === 'experience_points_adjust') {
    return (
      typeof value.actorParticipantId === 'string' &&
      typeof value.participantId === 'string' &&
      Number.isSafeInteger(value.pointsDelta) &&
      value.pointsDelta !== 0 &&
      Math.abs(Number(value.pointsDelta)) <= 10_000 &&
      (value.reason === undefined || typeof value.reason === 'string')
    )
  }
  if (value.type === 'reminder_acknowledge') {
    return typeof value.outboxId === 'string' && typeof value.actorParticipantId === 'string'
  }
  if (value.type === 'outbox_delivery_update') {
    return (
      typeof value.outboxId === 'string' &&
      ['delivered', 'failed'].includes(String(value.status)) &&
      (value.error === undefined || typeof value.error === 'string')
    )
  }
  return (
    value.type === 'materialize_occurrences' &&
    typeof value.rangeStart === 'string' &&
    typeof value.rangeEnd === 'string'
  )
}

function isMissingFile(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}

function readJson<T>(filePath: string, fallback: T, maxBytes: number): T {
  try {
    return JSON.parse(boundedFile.readBoundedText(fileSystem, filePath, maxBytes, () =>
      new Error('Chore storage exceeds its safe read limit'))) as T
  } catch (error) {
    if (isMissingFile(error)) {
      return fallback
    }
    throw error
  }
}

function writeJson(filePath: string, value: unknown, maxBytes: number): void {
  const serialized = JSON.stringify(value)
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    throw new Error('Chore workspace is too large')
  }
  mkdirSync(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.tmp`
  writeFileSync(temporaryPath, serialized, 'utf8')
  renameSync(temporaryPath, filePath)
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function requiresManagementSession(action: ChoreWorkspaceAction): boolean {
  return [
    'participant_create',
    'participant_update',
    'definition_create',
    'definition_update',
    'definition_archive',
    'definition_restore',
    'definition_delete',
    'retention_update',
    'experience_update',
    'experience_points_adjust',
  ].includes(action.type)
}

function pinHash(pin: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${pin}`).digest('hex')
}

function hashesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex')
  const rightBuffer = Buffer.from(right, 'hex')
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function publicDocument(
  document: PersistedChoreWorkspaceDocument,
  pinConfigured: boolean
): ChoreWorkspaceDocument {
  return {
    revision: document.revision,
    updatedAt: document.updatedAt,
    data: document.data,
    management: { pinConfigured },
  }
}

function getHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

async function readBody(req: IncomingMessage, maxBytes = MAX_DOCUMENT_BYTES): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > maxBytes) {
      throw new Error('Chore command is too large')
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function normalizeRoute(req: IncomingMessage): string {
  const rawUrl = (req.url ?? '/').split('?')[0].replace(/\/+$/, '') || '/'
  return rawUrl.startsWith('/__navet_chores__')
    ? rawUrl.slice('/__navet_chores__'.length) || '/'
    : rawUrl
}

function requestSearchParams(req: IncomingMessage): URLSearchParams {
  return new URL(req.url ?? '/', 'http://navet.local').searchParams
}

export function createViteChoreStoreRequestHandler(options: {
  filePath?: string
  resolvePrincipal: (
    request: IncomingMessage
  ) => ViteChorePrincipal | null | Promise<ViteChorePrincipal | null>
}) {
  const filePath =
    options.filePath ?? path.resolve(process.cwd(), '.cache', 'navet-chore-workspace.json')
  const journalPath = `${filePath}.journal`
  const eventHistoryPath = `${filePath}.events`
  const lastGoodWorkspacePath = `${filePath}.last-good`
  const managementSecurityPath = `${filePath}.management`
  let schedulerCheckpoint: { revision: number; checkedAt: number; nextAt: number; identity: string } | null = null
  const schedulerIdentity = () => [filePath, eventHistoryPath].map((candidate) => {
    try {
      const stat = fileSystem.statSync(candidate)
      return [stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return 'missing'
    }
  }).join('|')
  let managementSessions: ChoreManagementSession[] = []
  let failedManagementAttempts = 0
  let managementBlockedUntil = 0

  const workspaceKey = () => {
    const identityPath = `${filePath}.identity`
    const missing = Symbol('missing')
    const identity = readJson<unknown>(identityPath, missing, 1024)
    if (identity !== missing && (typeof identity !== 'string' || !/^hat_[a-f0-9]{64}$/.test(identity))) {
      throw new Error('Chore workspace identity is invalid')
    }
    if (typeof identity === 'string') return identity
    const created = `hat_${randomBytes(32).toString('hex')}`
    writeJson(identityPath, created, 1024)
    return created
  }

  const readManagementSecurity = (
    tenantId: string
  ): ChoreManagementSecurityDocument | null => {
    const security = readJson<ChoreManagementSecurityDocument | null>(
      managementSecurityPath,
      null,
      MAX_MANAGEMENT_SECURITY_BYTES
    )
    if (!security) return null
    if (
      security.contractVersion !== CONTRACT_VERSION ||
      typeof security.tenantId !== 'string' ||
      !/^hat_[a-f0-9]{64}$/.test(security.tenantId) ||
      typeof security.salt !== 'string' ||
      typeof security.pinHash !== 'string'
    ) {
      throw new Error('Chore management security is invalid')
    }
    if (security.tenantId !== tenantId) {
      const migrated = { ...security, tenantId, updatedAt: new Date().toISOString() }
      writeJson(managementSecurityPath, migrated, MAX_MANAGEMENT_SECURITY_BYTES)
      managementSessions = []
      return migrated
    }
    return security
  }

  const managementSessionIsValid = (req: IncomingMessage, tenantId: string): boolean => {
    const now = Date.now()
    managementSessions = managementSessions.filter((session) => session.expiresAt > now)
    const token = getHeader(req, CHORE_WORKSPACE_HEADERS.managementSession)
    return Boolean(
      token &&
      managementSessions.some(
        (session) => session.token === token && session.tenantId === tenantId
      )
    )
  }

  const createManagementSession = (tenantId: string) => {
    const token = randomBytes(32).toString('hex')
    const expiresAt = Date.now() + MANAGEMENT_SESSION_DURATION_MS
    managementSessions = [
      ...managementSessions.filter((session) => session.tenantId !== tenantId),
      { token, tenantId, expiresAt },
    ].slice(-20)
    return { token, expiresAt }
  }

  const sendManagementSession = (res: ServerResponse, tenantId: string) => {
    const session = createManagementSession(tenantId)
    sendJson(res, 200, {
      pinConfigured: true,
      sessionToken: session.token,
      expiresAt: new Date(session.expiresAt).toISOString(),
    })
  }

  const readEventHistory = (fallbackEvents: ChoreActivity[] = []): ChoreEventHistory => {
    try {
      const stored = readJson<unknown>(
        eventHistoryPath,
        { contractVersion: CONTRACT_VERSION, events: [] },
        MAX_EVENT_HISTORY_BYTES,
      )
      const decoded = choreDurableStorage.unpack(
        stored,
        durableHash,
        MAX_EVENT_HISTORY_BYTES,
      ) as ChoreEventHistory
      if (decoded.contractVersion !== CONTRACT_VERSION || !Array.isArray(decoded.events)) {
        throw new Error('Chore event history is invalid')
      }
      const history = compactChoreHistory(decoded)
      if (history !== decoded || (isRecord(stored) && !stored.storageEncoding)) {
        const compact = choreDurableStorage.pack(history, durableHash)
        if (history !== decoded || compact !== history) {
          try {
            writeJson(eventHistoryPath, compact, MAX_EVENT_HISTORY_BYTES)
          } catch {
            /* An interrupted rewrite retains the original history; retry next read. */
          }
        }
      }
      return history
    } catch {
      const repaired = compactChoreHistory({
        contractVersion: CONTRACT_VERSION,
        events: applyChoreHistoryRetention(fallbackEvents, DEFAULT_CHORE_HISTORY_RETENTION),
      })
      writeJson(
        eventHistoryPath,
        choreDurableStorage.pack(repaired, durableHash),
        MAX_EVENT_HISTORY_BYTES,
      )
      return repaired
    }
  }

  const appendEventHistory = (
    events: ChoreActivity[],
    policy = DEFAULT_CHORE_HISTORY_RETENTION,
  ): void => {
    if (events.length === 0) return
    const history = readEventHistory(events)
    const existingIds = new Set(history.events.map((event) => event.id))
    const additions = events.filter((event) => !isChoreBookkeeping(event.type) && !existingIds.has(event.id))
    if (additions.length === 0) return
    writeJson(
      eventHistoryPath,
      choreDurableStorage.pack(compactChoreHistory({
        ...history,
        events: applyChoreHistoryRetention([...history.events, ...additions], policy),
      }), durableHash),
      MAX_EVENT_HISTORY_BYTES,
    )
  }

  const replaceEventHistory = (events: ChoreActivity[]): void => {
    writeJson(
      eventHistoryPath,
      choreDurableStorage.pack(compactChoreHistory({ contractVersion: CONTRACT_VERSION, events }), durableHash),
      MAX_EVENT_HISTORY_BYTES,
    )
  }

  const normalizeDocument = (
    value: unknown,
    tenantId: string
  ): PersistedChoreWorkspaceDocument | null => {
    if (
      !isRecord(value) ||
      value.contractVersion !== CONTRACT_VERSION ||
      (value.tenantId !== undefined &&
        (typeof value.tenantId !== 'string' || !/^hat_[a-f0-9]{64}$/.test(value.tenantId))) ||
      !Number.isSafeInteger(value.revision) ||
      Number(value.revision) < 0 ||
      typeof value.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(value.updatedAt))
    ) {
      return null
    }
    try {
      return {
        contractVersion: CONTRACT_VERSION,
        tenantId,
        revision: Number(value.revision),
        updatedAt: value.updatedAt,
        data: migrateChoreWorkspaceData(value.data),
        ...([1, 2].includes(Number(value.storageMaintenanceVersion)) ? { storageMaintenanceVersion: Number(value.storageMaintenanceVersion) } : {}),
      }
    } catch {
      return null
    }
  }

  const durableHash = (value: string): string => createHash('sha256').update(value).digest('hex')
  const readStoredDocument = (candidatePath: string, fallback: unknown): unknown =>
    choreDurableStorage.decode(readJson<unknown>(candidatePath, fallback, MAX_DOCUMENT_BYTES), durableHash,
      (key) => readJson<unknown>(`${filePath}.chunk-${key}`, null, choreDurableStorage.CHUNK_BYTES))
  const writeStoredDocument = (candidatePath: string, document: PersistedChoreWorkspaceDocument): void => {
    const stored = choreDurableStorage.encode(document, MAX_DOCUMENT_BYTES, durableHash,
      (key, chunk) => writeJson(`${filePath}.chunk-${key}`, chunk, choreDurableStorage.CHUNK_BYTES))
    writeJson(candidatePath, stored, MAX_DOCUMENT_BYTES)
  }

  const readDocumentCandidate = (
    candidatePath: string,
    tenantId: string
  ): PersistedChoreWorkspaceDocument | null => {
    try {
      return normalizeDocument(readStoredDocument(candidatePath, null), tenantId)
    } catch {
      return null
    }
  }

  const persistDocument = (
    previous: PersistedChoreWorkspaceDocument,
    next: PersistedChoreWorkspaceDocument,
  ): void => {
    next.storageMaintenanceVersion = 2
    next.data = compactChoreWorkspace(next.data)
    writeStoredDocument(lastGoodWorkspacePath, { ...previous, data: compactChoreWorkspace(previous.data) })
    writeStoredDocument(filePath, next)
    collectUnreferencedChunks()
  }

  const collectUnreferencedChunks = (): void => {
    try {
      const retained = new Set<string>()
      for (const candidatePath of [filePath, lastGoodWorkspacePath]) {
        const stored = choreDurableStorage.unpack(
          readJson<unknown>(candidatePath, null, MAX_DOCUMENT_BYTES),
          durableHash,
          MAX_DOCUMENT_BYTES,
        )
        if (!isRecord(stored)) return
        const manifest = stored.durableCollections
        if (!manifest) continue
        if (!isRecord(manifest) || manifest.version !== 1) return
        for (const [name, keys] of Object.entries(manifest)) {
          if (name === 'version') continue
          if (!Array.isArray(keys)) return
          for (const key of keys) retained.add(key)
        }
      }
      const prefix = path.basename(filePath) + '.chunk-'
      const entries = fileSystem.readdirSync(path.dirname(filePath))
      if (entries.some((name) => name.startsWith(path.basename(filePath) + '.failed-'))) return
      for (const name of entries) {
        if (!name.startsWith(prefix)) continue
        const key = name.slice(prefix.length)
        if (/^[a-f0-9]{64}$/.test(key) && !retained.has(key))
          unlinkSync(path.join(path.dirname(filePath), name))
      }
    } catch {
      /* Retry collection after the next successful write. */
    }
  }

  const readDocument = (tenantId: string): PersistedChoreWorkspaceDocument => {
    const missing = Symbol('missing-chore-workspace')
    let rawDocument: unknown | typeof missing
    try {
      rawDocument = readStoredDocument(filePath, missing)
    } catch {
      rawDocument = null
    }
    if (rawDocument === missing) {
      return {
        contractVersion: CONTRACT_VERSION,
        tenantId,
        revision: 0,
        updatedAt: new Date().toISOString(),
        data: emptyChoreWorkspace(),
      }
    }
    let document = normalizeDocument(rawDocument, tenantId)
    let documentNeedsMigration = Boolean(
      document &&
        isRecord(rawDocument) &&
        (rawDocument.tenantId !== tenantId || document.data !== rawDocument.data),
    )
    if (!document) {
      const backup = readDocumentCandidate(lastGoodWorkspacePath, tenantId)
      if (!backup) {
        const invalidWorkspace = new Error('Chore workspace data needs repair')
        Object.assign(invalidWorkspace, { code: 'NAVET_CHORE_WORKSPACE_INVALID' })
        throw invalidWorkspace
      }
      document = {
        ...backup,
        revision: backup.revision + 1,
        updatedAt: new Date().toISOString(),
      }
      writeStoredDocument(filePath, document)
      documentNeedsMigration = false
    }
    const timestamp = new Date().toISOString()
    if (document.storageMaintenanceVersion !== 2) {
      appendEventHistory(document.data.activity, document.data.historyRetention)
      const definitionsById = document.data.definitionsById
      const participantsById = document.data.participantsById
      const repairRecurrence = document.storageMaintenanceVersion !== 1
      const needsRecomputation = (item: ChoreOccurrence): boolean =>
        repairRecurrence && definitionsById[item.definitionId]?.schedule.frequency === 'after_completion' &&
        item.status === 'available' && Date.parse(item.scheduledAt) > Date.parse(timestamp) &&
        item.carriedForwardFrom === undefined && !item.assigneeIds.some((participantId) => {
          const participant = participantsById[participantId]
          return participant && isChoreParticipantPausedAt(participant, item.scheduledAt)
        })
      const trustedOccurrences = Object.fromEntries(
        Object.entries(document.data.occurrencesById).filter(([, item]) => !needsRecomputation(item)),
      )
      const scheduledByDefinition = new Map<string, Set<string>>()
      for (const definition of Object.values(definitionsById)) {
        if (!repairRecurrence || definition.schedule.frequency !== 'after_completion') continue
        const latestCompletedAt = Object.values(document.data.occurrencesById)
          .filter((item) => item.definitionId === definition.id)
          .flatMap((item) => item.completedAt ? [item.completedAt] : [])
          .sort((left, right) => Date.parse(left) - Date.parse(right))
          .at(-1)
        const scheduled = materializeChoreOccurrences({
          definition, participantsById,
          existingOccurrences: trustedOccurrences, latestCompletedAt,
          rangeStart: new Date(Date.parse(timestamp) - 90 * 86400000).toISOString(),
          rangeEnd: new Date(Date.parse(timestamp) + 45 * 86400000).toISOString(),
        }, true)
        scheduledByDefinition.set(definition.id, new Set(scheduled.map((item) => item.id)))
      }
      const removed = new Set(
        Object.values(document.data.occurrencesById)
          .filter(
            (item) =>
              needsRecomputation(item) && !scheduledByDefinition.get(item.definitionId)?.has(item.id),
          )
          .map((item) => item.id),
      )
      const cleaned = compactChoreWorkspace(document.data)
      const changed = removed.size > 0 || documentNeedsMigration || cleaned !== document.data
      const next = {
        ...document,
        storageMaintenanceVersion: 2,
        revision: document.revision + (changed ? 1 : 0),
        updatedAt: changed ? timestamp : document.updatedAt,
        data:
          removed.size > 0
            ? {
                ...cleaned,
                occurrencesById: Object.fromEntries(
                  Object.entries(document.data.occurrencesById).filter(([id]) => !removed.has(id)),
                ),
                outbox: document.data.outbox.filter(
                  (item) => item.status === 'delivered' || !removed.has(item.occurrenceId ?? ''),
                ),
              }
            : cleaned,
      }
      persistDocument(document, next)
      appendEventHistory(next.data.activity, next.data.historyRetention)
      document = next
      documentNeedsMigration = false
    }
    const now = Date.parse(timestamp)
    if (!documentNeedsMigration && schedulerCheckpoint &&
        document.revision === schedulerCheckpoint.revision &&
        now >= schedulerCheckpoint.checkedAt && now < schedulerCheckpoint.nextAt &&
        schedulerIdentity() === schedulerCheckpoint.identity) return document
    const history = readEventHistory(document.data.activity)
    const scheduled = runChoreWorkspaceScheduler(document.data, timestamp, {
      existingEventIds: new Set(history.events.map((event) => event.id)),
    })
    if (
      !documentNeedsMigration &&
      scheduled.activities.length === 0 &&
      scheduled.outboxItems.length === 0 &&
      !Object.values(scheduled.data.occurrencesById).some(
        (occurrence) =>
          occurrence.supersededAt !== document.data.occurrencesById[occurrence.id]?.supersededAt,
      )
    ) {
      appendEventHistory(document.data.activity, document.data.historyRetention)
      schedulerCheckpoint = { revision: document.revision, checkedAt: now,
        nextAt: getChoreSchedulerDeadline(document.data, timestamp), identity: schedulerIdentity() }
      return document
    }

    const scheduledData =
      scheduled.activities.length === 0 && scheduled.outboxItems.length === 0
        ? scheduled.data
        : {
            ...scheduled.data,
            activity: [...scheduled.data.activity, ...scheduled.activities].slice(-5000),
            outbox: [
              ...scheduled.data.outbox,
              ...scheduled.activities.map(createChoreOutboxItem),
              ...scheduled.outboxItems,
            ].slice(-MAX_OUTBOX_ITEMS),
          }

    const migratedDocument: PersistedChoreWorkspaceDocument = {
      ...document,
      revision: document.revision + 1,
      updatedAt: timestamp,
      data: scheduledData,
    }
    persistDocument(document, migratedDocument)
    appendEventHistory(migratedDocument.data.activity, migratedDocument.data.historyRetention)
    return migratedDocument
  }

  const readJournal = (activity: ChoreActivity[] = []): ChoreCommandJournal => {
    try {
      const journal = readJson<ChoreCommandJournal>(
        journalPath,
        { contractVersion: CONTRACT_VERSION, commands: [] },
        MAX_JOURNAL_BYTES
      )
      if (journal.contractVersion !== CONTRACT_VERSION || !Array.isArray(journal.commands)) {
        throw new Error('Chore command journal is invalid')
      }
      return journal
    } catch {
      const seen = new Set<string>()
      const recoveredCommands = activity.filter((event) => {
        if (!event.commandId || seen.has(event.commandId)) return false
        seen.add(event.commandId)
        return true
      })
      const repaired: ChoreCommandJournal = {
        contractVersion: CONTRACT_VERSION,
        commands: recoveredCommands
          .map((event) => ({ commandId: event.commandId, revision: 0, timestamp: event.timestamp }))
          .slice(-MAX_JOURNAL_ITEMS),
      }
      writeJson(journalPath, repaired, MAX_JOURNAL_BYTES)
      return repaired
    }
  }

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const authenticated = await options.resolvePrincipal(req)
    if (!authenticated || !authenticated.sessionId) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    const method = req.method ?? 'GET'
    if (method !== 'GET' && !isViteStrictSameOriginMutation(req)) {
      sendJson(res, 403, { error: 'Cross-origin chore mutation is not allowed' })
      return
    }

    const route = normalizeRoute(req)
    let principal = { ...authenticated, tenantId: '' }
    try {
      principal = { ...authenticated, tenantId: workspaceKey() }
      let managementSecurity: ChoreManagementSecurityDocument | null = null
      let managementSecurityReadable = true
      try {
        managementSecurity = readManagementSecurity(principal.tenantId)
      } catch (error) {
        managementSecurityReadable = false
        if (route !== '/recovery' || method !== 'POST') throw error
      }
      const pinConfigured = Boolean(managementSecurity)

      if (route === '/capabilities' && method === 'GET') {
        sendJson(res, 200, {
          contractVersion: CONTRACT_VERSION,
          schemaVersion: CHORE_WORKSPACE_SCHEMA_VERSION,
          authority: 'standalone',
          backgroundScheduling: false,
          backgroundNotifications: false,
          projectionOwnedByAuthority: false,
          actionServices: false,
        })
        return
      }

      if (route === '/recovery' && method === 'POST') {
        let request: Record<string, unknown>
        try {
          request = JSON.parse(await readBody(req)) as Record<string, unknown>
        } catch {
          sendJson(res, 400, { error: 'Chore recovery request must be valid JSON' })
          return
        }
        if (managementSecurity && !managementSessionIsValid(req, principal.tenantId)) {
          sendJson(res, 403, { error: 'Unlock chore management to continue' })
          return
        }
        const restoreBackup =
          request.action === 'restore_backup' && request.confirmation === 'REPAIR CHORES'
        const resetWorkspace = request.action === 'reset' && request.confirmation === 'RESET CHORES'
        if (!restoreBackup && !resetWorkspace) {
          sendJson(res, 400, { error: 'Choose repair or start over to recover chores' })
          return
        }

        if (!managementSecurityReadable && restoreBackup) {
          sendJson(res, 409, {
            error: 'The management lock is damaged. Start over to recover chores.',
          })
          return
        }

        if (restoreBackup) {
          const backup = readDocumentCandidate(lastGoodWorkspacePath, principal.tenantId)
          if (!backup) {
            sendJson(res, 409, { error: 'No healthy chore backup is available' })
            return
          }
          const recovered: PersistedChoreWorkspaceDocument = {
            ...backup,
            revision: backup.revision + 1,
            updatedAt: new Date().toISOString(),
          }
          writeStoredDocument(filePath, recovered)
          replaceEventHistory(recovered.data.activity)
          try {
            unlinkSync(journalPath)
          } catch (error) {
            if (!isMissingFile(error)) throw error
          }
          res.setHeader(CHORE_WORKSPACE_HEADERS.revision, String(recovered.revision))
          sendJson(res, 200, publicDocument(recovered, pinConfigured))
          return
        }

        try {
          renameSync(filePath, `${filePath}.failed-${Date.now()}`)
        } catch (error) {
          if (!isMissingFile(error)) throw error
        }
        for (const stalePath of [journalPath, eventHistoryPath, lastGoodWorkspacePath, managementSecurityPath]) {
          try {
            unlinkSync(stalePath)
          } catch (error) {
            if (!isMissingFile(error)) throw error
          }
        }
        managementSessions = managementSessions.filter(
          (session) => session.tenantId !== principal.tenantId
        )
        const recovered: PersistedChoreWorkspaceDocument = {
          contractVersion: CONTRACT_VERSION,
          tenantId: principal.tenantId,
          revision: 0,
          updatedAt: new Date().toISOString(),
          data: emptyChoreWorkspace(),
        }
        writeStoredDocument(filePath, recovered)
        res.setHeader(CHORE_WORKSPACE_HEADERS.revision, '0')
        sendJson(res, 200, publicDocument(recovered, false))
        return
      }

      const document = readDocument(principal.tenantId)
      res.setHeader(CHORE_WORKSPACE_HEADERS.revision, String(document.revision))

      if (route === '/workspace' && method === 'GET') {
        const clientRevision = Number.parseInt(
          getHeader(req, CHORE_WORKSPACE_HEADERS.revision) ?? '',
          10
        )
        if (Number.isSafeInteger(clientRevision) && clientRevision === document.revision) {
          res.statusCode = 304
          res.setHeader('Cache-Control', 'no-store')
          res.end()
          return
        }
        sendJson(res, 200, publicDocument(document, pinConfigured))
        return
      }

      if (route === '/history' && method === 'GET') {
        const history = readEventHistory()
        if (history.contractVersion !== CONTRACT_VERSION || !Array.isArray(history.events)) {
          throw new Error('Chore event history is invalid')
        }
        sendJson(res, 200, { contractVersion: CONTRACT_VERSION, events: history.events })
        return
      }

      if (route === '/backup' && method === 'GET') {
        const history = readEventHistory()
        sendJson(res, 200, createChoreInterchangeDocument({
          workspace: document.data,
          events: history.events,
        }))
        return
      }

      if (route === '/definitions' && method === 'GET') {
        sendJson(res, 200, {
          contractVersion: CONTRACT_VERSION,
          revision: document.revision,
          definitions: Object.values(document.data.definitionsById).sort((left, right) =>
            left.title.localeCompare(right.title)
          ),
        })
        return
      }

      if (route === '/occurrences' && method === 'GET') {
        const search = requestSearchParams(req)
        const from = search.get('from')
        const to = search.get('to')
        const participantId = search.get('participantId')
        const definitionId = search.get('definitionId')
        if ((from && !Number.isFinite(Date.parse(from))) || (to && !Number.isFinite(Date.parse(to)))) {
          sendJson(res, 400, { error: 'Chore occurrence range is invalid' })
          return
        }
        const occurrences = Object.values(document.data.occurrencesById)
          .filter((occurrence) => !from || Date.parse(occurrence.scheduledAt) >= Date.parse(from))
          .filter((occurrence) => !to || Date.parse(occurrence.scheduledAt) <= Date.parse(to))
          .filter((occurrence) => !participantId || occurrence.assigneeIds.includes(participantId))
          .filter((occurrence) => !definitionId || occurrence.definitionId === definitionId)
          .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))
          .slice(0, 5000)
        sendJson(res, 200, {
          contractVersion: CONTRACT_VERSION,
          revision: document.revision,
          occurrences,
        })
        return
      }

      if (route === '/events' && method === 'GET') {
        const search = requestSearchParams(req)
        const after = Number.parseInt(search.get('after') ?? '0', 10)
        const requestedLimit = Number.parseInt(search.get('limit') ?? '200', 10)
        if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(requestedLimit)) {
          sendJson(res, 400, { error: 'Chore event cursor is invalid' })
          return
        }
        const limit = Math.min(500, Math.max(1, requestedLimit))
        const history = readEventHistory()
        const allowedTypes = new Set<string>(CHORE_AUTOMATION_EVENT_TYPES)
        const requestedTypes = (search.get('types') ?? '')
          .split(',')
          .filter((type) => allowedTypes.has(type))
        const typeFilter = requestedTypes.length > 0 ? new Set(requestedTypes) : allowedTypes
        const occurrenceId = search.get('occurrenceId')
        const definitionId = search.get('definitionId')
        sendJson(res, 200, readChoreHistoryPage(history, after, limit,
          [...typeFilter], occurrenceId, definitionId))
        return
      }

      if (route === '/management/verify' && method === 'POST') {
        let request: Record<string, unknown>
        try {
          request = JSON.parse(await readBody(req)) as Record<string, unknown>
        } catch {
          sendJson(res, 400, { error: 'Management PIN must be valid JSON' })
          return
        }
        if (!managementSecurity) {
          sendJson(res, 409, { error: 'A management PIN has not been configured' })
          return
        }
        if (Date.now() < managementBlockedUntil) {
          sendJson(res, 429, { error: 'Too many PIN attempts. Try again shortly.' })
          return
        }
        if (
          typeof request.pin !== 'string' ||
          !MANAGEMENT_PIN_PATTERN.test(request.pin) ||
          !hashesMatch(pinHash(request.pin, managementSecurity.salt), managementSecurity.pinHash)
        ) {
          failedManagementAttempts += 1
          if (failedManagementAttempts >= 5) {
            managementBlockedUntil = Date.now() + 30_000
            failedManagementAttempts = 0
          }
          sendJson(res, 403, { error: 'The management PIN is incorrect' })
          return
        }
        failedManagementAttempts = 0
        managementBlockedUntil = 0
        sendManagementSession(res, principal.tenantId)
        return
      }

      if (route === '/management/pin' && method === 'POST') {
        let request: Record<string, unknown>
        try {
          request = JSON.parse(await readBody(req)) as Record<string, unknown>
        } catch {
          sendJson(res, 400, { error: 'Management PIN must be valid JSON' })
          return
        }
        const actor =
          typeof request.actorParticipantId === 'string'
            ? document.data.participantsById[request.actorParticipantId]
            : undefined
        if (
          typeof request.pin !== 'string' ||
          !MANAGEMENT_PIN_PATTERN.test(request.pin) ||
          !actor?.capabilities.includes('manage') ||
          actor.pausedAt
        ) {
          sendJson(res, 400, { error: 'Use a 4 to 8 digit PIN for an active manager' })
          return
        }
        if (managementSecurity && !managementSessionIsValid(req, principal.tenantId)) {
          sendJson(res, 403, { error: 'Unlock chore management before changing its PIN' })
          return
        }
        const salt = randomBytes(24).toString('hex')
        writeJson(
          managementSecurityPath,
          {
            contractVersion: CONTRACT_VERSION,
            tenantId: principal.tenantId,
            salt,
            pinHash: pinHash(request.pin, salt),
            updatedAt: new Date().toISOString(),
          } satisfies ChoreManagementSecurityDocument,
          MAX_MANAGEMENT_SECURITY_BYTES
        )
        managementSessions = managementSessions.filter(
          (session) => session.tenantId !== principal.tenantId
        )
        sendManagementSession(res, principal.tenantId)
        return
      }

      if (route === '/management/pin' && method === 'DELETE') {
        let request: Record<string, unknown>
        try {
          request = JSON.parse(await readBody(req)) as Record<string, unknown>
        } catch {
          sendJson(res, 400, { error: 'Management PIN removal must be valid JSON' })
          return
        }
        const actor =
          typeof request.actorParticipantId === 'string'
            ? document.data.participantsById[request.actorParticipantId]
            : undefined
        if (!actor?.capabilities.includes('manage') || actor.pausedAt) {
          sendJson(res, 403, { error: 'Management PIN removal requires an active manager' })
          return
        }
        if (!managementSecurity) {
          sendJson(res, 409, { error: 'A management PIN has not been configured' })
          return
        }
        if (!managementSessionIsValid(req, principal.tenantId)) {
          sendJson(res, 403, { error: 'Unlock chore management before removing its PIN' })
          return
        }
        unlinkSync(managementSecurityPath)
        managementSessions = managementSessions.filter(
          (session) => session.tenantId !== principal.tenantId
        )
        failedManagementAttempts = 0
        managementBlockedUntil = 0
        sendJson(res, 200, { pinConfigured: false })
        return
      }

      if ((route === '/restore' || route === '/reset') && method === 'POST') {
        let request: Partial<ChoreWorkspaceRestoreRequest & ChoreWorkspaceResetRequest> &
          Record<string, unknown>
        try {
          request = JSON.parse(await readBody(req, MAX_IMPORT_BYTES)) as Partial<
            ChoreWorkspaceRestoreRequest & ChoreWorkspaceResetRequest
          > & Record<string, unknown>
        } catch {
          sendJson(res, 400, { error: 'Chore administration request must be valid JSON' })
          return
        }
        const baseRevision = Number.parseInt(
          getHeader(req, CHORE_WORKSPACE_HEADERS.baseRevision) ?? '',
          10
        )
        if (
          typeof request.commandId !== 'string' ||
          request.commandId.length === 0 ||
          request.commandId.length > 200 ||
          !Number.isSafeInteger(request.baseRevision) ||
          request.baseRevision !== baseRevision ||
          typeof request.actorParticipantId !== 'string'
        ) {
          sendJson(res, 400, { error: 'Chore administration request is invalid' })
          return
        }
        const journal = readJournal(document.data.activity)
        if (journal.commands.some((command) => command.commandId === request.commandId)) {
          sendJson(res, 200, publicDocument(document, pinConfigured))
          return
        }
        if (baseRevision !== document.revision) {
          sendJson(res, 412, {
            error: 'Chore workspace changed on another client',
            revision: document.revision,
          })
          return
        }
        if (managementSecurity && !managementSessionIsValid(req, principal.tenantId)) {
          sendJson(res, 403, { error: 'Unlock chore management to continue' })
          return
        }

        const currentActor = document.data.participantsById[request.actorParticipantId]
        let nextData: ChoreWorkspaceData
        let nextEvents: ChoreActivity[]
        const timestamp = new Date().toISOString()
        const activity: ChoreActivity = {
          id: `activity:${request.commandId}`,
          commandId: request.commandId,
          actorParticipantId: request.actorParticipantId,
          type: route === '/restore' ? 'workspace_imported' : 'workspace_reset',
          timestamp,
        }

        if (route === '/restore') {
          if (request.mode !== 'merge' && request.mode !== 'replace') {
            sendJson(res, 400, { error: 'Chore restore mode is invalid' })
            return
          }
          let imported
          try {
            imported = parseChoreInterchangeDocument(request.document)
          } catch (error) {
            sendJson(res, 400, {
              error: error instanceof Error ? error.message : 'Chore backup is invalid',
            })
            return
          }
          const importedActor = imported.workspace.participantsById[request.actorParticipantId]
          const actorCanRestore = Object.keys(document.data.participantsById).length === 0
            ? importedActor?.capabilities.includes('manage') && !importedActor.pausedAt
            : currentActor?.capabilities.includes('manage') && !currentActor.pausedAt
          if (!actorCanRestore) {
            sendJson(res, 403, { error: 'Only a household manager can restore chore data' })
            return
          }
          if (request.mode === 'replace') {
            nextEvents = [...imported.events, activity]
            nextData = {
              ...imported.workspace,
              activity: [...imported.workspace.activity, activity].slice(-5000),
              outbox: [createChoreOutboxItem(activity)],
            }
          } else {
            const merged = mergeChoreInterchange({
              current: document.data,
              currentEvents: readEventHistory().events,
              imported,
              importedAt: timestamp,
            })
            nextEvents = [...merged.events, activity]
            nextData = {
              ...merged.data,
              activity: [...merged.data.activity, activity].slice(-5000),
              outbox: [...merged.data.outbox, createChoreOutboxItem(activity)].slice(
                -MAX_OUTBOX_ITEMS
              ),
            }
          }
        } else {
          if (
            request.confirmation !== 'DELETE ALL CHORES' ||
            !currentActor?.capabilities.includes('manage') ||
            currentActor.pausedAt
          ) {
            sendJson(res, 403, { error: 'Chore reset requires an active manager confirmation' })
            return
          }
          nextData = createEmptyChoreWorkspace()
          nextEvents = []
        }

        const next: PersistedChoreWorkspaceDocument = {
          contractVersion: CONTRACT_VERSION,
          tenantId: principal.tenantId,
          revision: document.revision + 1,
          updatedAt: timestamp,
          data: nextData,
        }
        if (route === '/reset') {
          writeStoredDocument(filePath, next)
          for (const stalePath of [journalPath, eventHistoryPath, lastGoodWorkspacePath]) {
            try {
              unlinkSync(stalePath)
            } catch (error) {
              if (!isMissingFile(error)) throw error
            }
          }
          if (managementSecurity) unlinkSync(managementSecurityPath)
          managementSessions = managementSessions.filter(
            (session) => session.tenantId !== principal.tenantId
          )
        } else {
          const nextJournal: ChoreCommandJournal = {
            contractVersion: CONTRACT_VERSION,
            commands: [
              ...journal.commands,
              { commandId: request.commandId, revision: next.revision, timestamp },
            ].slice(-MAX_JOURNAL_ITEMS),
          }
          persistDocument(document, next)
          writeJson(journalPath, nextJournal, MAX_JOURNAL_BYTES)
          replaceEventHistory(nextEvents)
        }
        res.setHeader(CHORE_WORKSPACE_HEADERS.revision, String(next.revision))
        sendJson(res, 200, publicDocument(next, route === '/restore' && pinConfigured))
        return
      }

      if ((route === '/commands' || route === '/actions') && method === 'POST') {
        let request: Partial<ChoreWorkspaceCommandRequest> & Record<string, unknown>
        try {
          request = JSON.parse(await readBody(req)) as Partial<ChoreWorkspaceCommandRequest> &
            Record<string, unknown>
        } catch {
          sendJson(res, 400, { error: 'Chore command must be valid JSON' })
          return
        }
        const baseRevision = Number.parseInt(
          getHeader(req, CHORE_WORKSPACE_HEADERS.baseRevision) ?? '',
          10
        )
        if (
          typeof request.commandId !== 'string' ||
          request.commandId.length === 0 ||
          request.commandId.length > 200 ||
          !Number.isSafeInteger(request.baseRevision) ||
          request.baseRevision !== baseRevision ||
          !isChoreWorkspaceAction(request.action)
        ) {
          sendJson(res, 400, { error: 'Chore command is invalid' })
          return
        }

        const journal = readJournal(document.data.activity)
        if (
          document.data.activity.some(
            (activity: { commandId: string }) => activity.commandId === request.commandId
          ) ||
          journal.commands.some((command) => command.commandId === request.commandId)
        ) {
          sendJson(res, 200, publicDocument(document, pinConfigured))
          return
        }
        if (baseRevision !== document.revision) {
          sendJson(res, 412, {
            error: 'Chore workspace changed on another client',
            revision: document.revision,
          })
          return
        }
        if (!isChoreWorkspaceAction(request.action)) {
          sendJson(res, 400, { error: 'Chore command is invalid' })
          return
        }
        if (
          managementSecurity &&
          requiresManagementSession(request.action) &&
          !managementSessionIsValid(req, principal.tenantId)
        ) {
          sendJson(res, 403, { error: 'Unlock chore management to continue' })
          return
        }
        let nextData: ChoreWorkspaceData
        try {
          const result = applyChoreWorkspaceAction({
            commandId: request.commandId,
            action: request.action,
            timestamp: new Date().toISOString(),
            workspace: document.data,
          })
          if (request.action.type === 'materialize_occurrences' &&
              isChoreMaterializationUnchanged(document.data, result.data)) {
            sendJson(res, 200, publicDocument(document, pinConfigured))
            return
          }
          const activities = [...(result.additionalActivities ?? []), result.activity]
            .filter((activity) => !isChoreBookkeeping(activity.type))
          nextData = {
            ...result.data,
            activity: [...result.data.activity, ...activities].slice(-5000),
            outbox:
              result.activity.type === 'outbox_delivery_updated'
                ? result.data.outbox
                : [
                    ...result.data.outbox,
                    ...activities
                      .filter((activity) => activity.type !== 'points_adjusted')
                      .map(createChoreOutboxItem),
                  ].slice(-MAX_OUTBOX_ITEMS),
          }
        } catch (error) {
          sendJson(res, 409, {
            error: error instanceof Error ? error.message : 'Chore action could not be applied',
          })
          return
        }

        const next: PersistedChoreWorkspaceDocument = {
          contractVersion: CONTRACT_VERSION,
          tenantId: principal.tenantId,
          revision: document.revision + 1,
          updatedAt: new Date().toISOString(),
          data: nextData,
        }
        const nextJournal: ChoreCommandJournal = {
          contractVersion: CONTRACT_VERSION,
          commands: [
            ...journal.commands,
            {
              commandId: request.commandId,
              revision: next.revision,
              timestamp: next.updatedAt,
            },
          ].slice(-MAX_JOURNAL_ITEMS),
        }
        persistDocument(document, next)
        writeJson(journalPath, nextJournal, MAX_JOURNAL_BYTES)
        appendEventHistory(nextData.activity, nextData.historyRetention)
        res.setHeader(CHORE_WORKSPACE_HEADERS.revision, String(next.revision))
        sendJson(res, 200, publicDocument(next, pinConfigured))
        return
      }

      sendJson(res, 404, { error: 'Chore workspace resource not found' })
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error
          ? String((error as NodeJS.ErrnoException & { code?: string }).code ?? '')
          : ''
      let pinConfigured = false
      try {
        pinConfigured = Boolean(readManagementSecurity(principal.tenantId))
      } catch {
        // A damaged PIN file is handled by the explicit start-over recovery path.
      }
      sendJson(res, 503, {
        error:
          code === 'NAVET_CHORE_WORKSPACE_INVALID'
            ? 'Chore data could not be read. Repair it from the last healthy copy or start over.'
            : 'Chore storage could not finish the request. Your saved data has not been replaced.',
        recovery: {
          backupAvailable: Boolean(
            readDocumentCandidate(lastGoodWorkspacePath, principal.tenantId)
          ),
          pinConfigured,
          reason:
            code === 'NAVET_CHORE_WORKSPACE_INVALID'
              ? 'workspace_invalid'
              : code === 'NAVET_CHORE_WRITE_LIMIT'
                ? 'workspace_too_large'
                : 'storage_unavailable',
        },
      })
    }
  }
}
