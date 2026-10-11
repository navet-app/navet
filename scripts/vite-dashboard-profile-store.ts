import { setOwnRecordValue } from '../packages/core/src/record-safety.ts'
import fileSystem from 'node:fs'
import boundedFile from '../docker/shared/bounded-file.js'
import profilePolicy from '../docker/shared/dashboard-profile-policy.js'
import { createHash, randomBytes } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { InstallationCookieNames } from './installation-cookie-scope.ts'
import { isViteStrictSameOriginMutation } from './vite-provider-session-store.ts'
import {
  DASHBOARD_PROFILE_ERROR_CODES,
  DASHBOARD_PROFILE_CONTRACT_VERSION,
  DASHBOARD_PROFILE_HEADERS,
  DASHBOARD_PROFILE_HISTORY_LIMIT,
  DASHBOARD_PROFILE_ID,
  type DashboardClientKind,
  type DashboardClientRegistryEntry,
  type DashboardDisplayProfileDocument,
  type DashboardPreferenceDocument,
  type DashboardPreferenceScope,
  type DashboardProfileAuthor,
  type DashboardProfileClient,
  type DashboardProfileHistoryEntry,
  type DashboardProfilePatchOperation,
  type DashboardProfilePrincipal,
  type DashboardProfileRecovery,
  type DashboardProfileRevisionMetadata,
  type DashboardWorkspaceIdentity,
} from '../packages/app/src/services/dashboard-profile.contract.ts'

const {
  isValidProfile: isValidDashboardProfileData,
  sanitizeDashboardProfile: sanitizeDashboardProfileData,
  areDashboardProfilesEquivalent,
  pickDisplayProfileSettings,
  sanitizePreferenceValues: sanitizeDashboardPreferenceValues,
  sanitizeDisplayProfilePolicy,
  applyDashboardProfilePatch,
  DISPLAY_PROFILE_ID_PATTERN,
} = profilePolicy

export {
  isValidDashboardProfileData,
  sanitizeDashboardProfileData,
  sanitizeDashboardPreferenceValues,
  applyDashboardProfilePatch,
}

export type { DashboardProfileData } from '../docker/shared/dashboard-profile-policy.js'
import type { DashboardProfileData, SanitizedDisplayProfilePolicy } from '../docker/shared/dashboard-profile-policy.js'

export interface DashboardProfileMetadata {
  etag: string
  lastModified: string
}

export interface ViteDashboardProfilePrincipal extends DashboardProfilePrincipal {
  tenantId: string
  sessionId: string
}

interface DashboardWorkspaceTenantBinding {
  providerId: 'home_assistant'
  tenantId: string
  enrolledAt: string
}

interface PersistedDashboardWorkspace extends DashboardWorkspaceIdentity {
  tenantBinding?: DashboardWorkspaceTenantBinding
}

interface PersistedProfileState {
  contractVersion: typeof DASHBOARD_PROFILE_CONTRACT_VERSION
  revision: number
  generation: string
  status: 'uninitialized' | 'active' | 'reset'
  resetRevision: number | null
  metadata: DashboardProfileRevisionMetadata | null
  profileHash?: string | null
  latestRecoverableRevision?: number | null
}

interface PersistedHistoryEntry {
  metadata: DashboardProfileRevisionMetadata
  profile: DashboardProfileData | null
  profileHash?: string | null
}

interface PreferenceCollection {
  contractVersion: typeof DASHBOARD_PROFILE_CONTRACT_VERSION
  records: Record<string, DashboardPreferenceDocument>
}

interface PreferenceRequestContext {
  scope: DashboardPreferenceScope
  collection: PreferenceCollection
}



interface BoundDashboardProfileClient extends DashboardProfileClient {
  bindingId: string
}

interface PersistedDashboardClientRegistryEntry
  extends DashboardClientRegistryEntry {
  bindingId?: string
}

interface RegistryCollection {
  contractVersion: typeof DASHBOARD_PROFILE_CONTRACT_VERSION
  workspaceId: string
  clients: PersistedDashboardClientRegistryEntry[]
  preferenceCollectionVersion?: 1
}

interface ClientBindingBootstrapRecord {
  key: string
  bindingId: string
  expiresAt: number
}

interface ClientBindingBootstrapCollection {
  contractVersion: typeof DASHBOARD_PROFILE_CONTRACT_VERSION
  records: ClientBindingBootstrapRecord[]
}

interface StorePaths {
  profile: string
  workspace: string
  state: string
  history: string
  accountPreferences: string
  clientPreferences: string
  displayProfiles: string
  clients: string
  clientBindingBootstrap: string
}

const MAX_PROFILE_BYTES = 1024 * 1024
const MAX_HISTORY_BYTES = 4 * 1024 * 1024
const MAX_PREFERENCE_BYTES = 256 * 1024
const MAX_PREFERENCE_COLLECTION_BYTES = 4 * 1024 * 1024
const MAX_DISPLAY_PROFILES_BYTES = 256 * 1024
const MAX_WORKSPACE_BYTES = 128 * 1024
const MAX_PROFILE_STATE_BYTES = 128 * 1024
const MAX_CLIENT_REGISTRY_BYTES = 512 * 1024
const MAX_CLIENT_BINDING_BOOTSTRAP_BYTES = 128 * 1024
const CLIENT_REGISTRY_LIMIT = 200
const PROFILE_HASH_PATTERN = /^[a-f0-9]{64}$/
const CLIENT_TOUCH_INTERVAL_MS = 15 * 60 * 1000
const TENANT_ID_PATTERN = /^hat_[a-f0-9]{64}$/
const CLIENT_BINDING_COOKIE_NAME = 'navet_profile_client'
const CLIENT_BINDING_PATTERN = /^[a-f0-9]{64}$/
const CLIENT_BINDING_MAX_AGE_SECONDS = 365 * 24 * 60 * 60
const CLIENT_STALE_AFTER_MS = 90 * 24 * 60 * 60 * 1000
// Tolerate brief host clock skew, but reset timestamps beyond this window to
// the current server time so they cannot retain a registry slot indefinitely.
const CLIENT_FUTURE_SKEW_MS = 5 * 60 * 1000
const CLIENT_BINDING_BOOTSTRAP_TTL_MS = 5 * 1000
const CLIENT_BINDING_BOOTSTRAP_LIMIT = 256
const SYSTEM_AUTHOR: DashboardProfileAuthor = {
  id: 'legacy-import',
  name: 'Imported dashboard',
  kind: 'unknown',
  providerId: 'system',
  userId: null,
  userName: null,
}

export function createDashboardProfileGeneration(): string {
  return `nvg_${randomBytes(20).toString('hex')}`
}

function createId(prefix: string): string {
  return `${prefix}_${randomBytes(20).toString('hex')}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hashDashboardProfile(profile: DashboardProfileData): string {
  return createHash('sha256').update(JSON.stringify(profile)).digest('hex')
}

export function buildDashboardProfileMetadata(
  serializedProfile: string,
  stat: { mtimeMs: number; mtime: Date }
): DashboardProfileMetadata {
  const parsed = JSON.parse(serializedProfile) as Partial<DashboardProfileData>
  const exportedAt = typeof parsed.exportedAt === 'string' ? parsed.exportedAt : 'unknown'

  return {
    etag: `"${stat.mtimeMs}-${serializedProfile.length}-${exportedAt}"`,
    lastModified: stat.mtime.toUTCString(),
  }
}

function buildRevisionMetadata(
  workspace: DashboardWorkspaceIdentity,
  state: PersistedProfileState
): DashboardProfileMetadata {
  const candidateUpdatedAt = state.metadata?.updatedAt ?? workspace.createdAt
  const updatedAt = Number.isFinite(Date.parse(candidateUpdatedAt))
    ? candidateUpdatedAt
    : new Date().toISOString()
  return {
    etag: `"navet-${workspace.workspaceId}-${state.revision}"`,
    lastModified: new Date(updatedAt).toUTCString(),
  }
}

function resolveStorePaths(profileFilePath: string): StorePaths {
  return {
    profile: profileFilePath,
    workspace: `${profileFilePath}.workspace`,
    state: `${profileFilePath}.state`,
    history: `${profileFilePath}.history`,
    accountPreferences: `${profileFilePath}.account-preferences`,
    clientPreferences: `${profileFilePath}.client-preferences`,
    displayProfiles: `${profileFilePath}.display-profiles`,
    clients: `${profileFilePath}.clients`,
    clientBindingBootstrap: `${profileFilePath}.client-binding-bootstrap`,
  }
}

class DashboardProfileStorageReadError extends Error {}

class DashboardProfileStorageCapacityError extends Error {}

class DashboardClientCapacityError extends Error {}

class DashboardProfileWriteLimitError extends Error {}

type StoredProfileResult =
  | {
      status: 'present'
      profile: DashboardProfileData
      profileHash: string
      needsRewrite: boolean
    }
  | {
      status: 'missing' | 'invalid'
      profile: null
      profileHash: null
      needsRewrite: false
    }

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}

function readJson<T>(filePath: string, fallback: T, maxBytes: number): T {
  try {
    return JSON.parse(boundedFile.readBoundedText(fileSystem, filePath, maxBytes, () =>
      new DashboardProfileStorageReadError(`Dashboard profile storage cannot be read safely: ${filePath}`))) as T
  } catch (error) {
    if (isMissingFileError(error)) {
      return fallback
    }
    if (error instanceof DashboardProfileStorageReadError) {
      throw error
    }
    throw new DashboardProfileStorageReadError(
      `Dashboard profile storage cannot be read safely: ${filePath}`
    )
  }
}

function writeJson(filePath: string, value: unknown): void {
  const directory = path.dirname(filePath)
  const temporaryPath = `${filePath}.tmp`
  mkdirSync(directory, { recursive: true })
  writeFileSync(temporaryPath, JSON.stringify(value), 'utf8')
  renameSync(temporaryPath, filePath)
}

function pruneHistoryBySerializedSize(
  history: PersistedHistoryEntry[]
): PersistedHistoryEntry[] {
  const candidates = history.slice(-DASHBOARD_PROFILE_HISTORY_LIMIT)
  const retained: PersistedHistoryEntry[] = []
  let serializedBytes = 2
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const entryBytes = Buffer.byteLength(JSON.stringify(candidates[index]), 'utf8')
    const nextBytes = serializedBytes + entryBytes + (retained.length > 0 ? 1 : 0)
    if (retained.length > 0 && nextBytes > MAX_HISTORY_BYTES) {
      break
    }
    retained.unshift(candidates[index])
    serializedBytes = nextBytes
  }
  return retained
}

function validWorkspace(value: unknown): value is PersistedDashboardWorkspace {
  const workspace = value as Partial<PersistedDashboardWorkspace> | null
  return Boolean(
    workspace &&
      typeof workspace === 'object' &&
      !Array.isArray(workspace) &&
      workspace.contractVersion === DASHBOARD_PROFILE_CONTRACT_VERSION &&
      typeof workspace.installationId === 'string' &&
      workspace.installationId.length > 4 &&
      typeof workspace.workspaceId === 'string' &&
      workspace.workspaceId.length > 4 &&
      workspace.defaultProfileId === DASHBOARD_PROFILE_ID &&
      typeof workspace.createdAt === 'string' &&
      Number.isFinite(Date.parse(workspace.createdAt)) &&
      (workspace.tenantBinding === undefined ||
        validTenantBinding(workspace.tenantBinding))
  )
}

function validTenantBinding(value: unknown): value is DashboardWorkspaceTenantBinding {
  const binding = value as Partial<DashboardWorkspaceTenantBinding> | null
  return Boolean(
    binding &&
      binding.providerId === 'home_assistant' &&
      typeof binding.tenantId === 'string' &&
      TENANT_ID_PATTERN.test(binding.tenantId) &&
      typeof binding.enrolledAt === 'string' &&
      Number.isFinite(Date.parse(binding.enrolledAt))
  )
}

function publicWorkspace(
  workspace: PersistedDashboardWorkspace
): DashboardWorkspaceIdentity {
  return {
    contractVersion: workspace.contractVersion,
    installationId: workspace.installationId,
    workspaceId: workspace.workspaceId,
    defaultProfileId: workspace.defaultProfileId,
    createdAt: workspace.createdAt,
  }
}

function validRevisionMetadata(
  value: unknown,
  workspace?: PersistedDashboardWorkspace
): value is DashboardProfileRevisionMetadata {
  const metadata = value as Partial<DashboardProfileRevisionMetadata> | null
  return Boolean(
    metadata &&
      metadata.contractVersion === DASHBOARD_PROFILE_CONTRACT_VERSION &&
      typeof metadata.installationId === 'string' &&
      typeof metadata.workspaceId === 'string' &&
      metadata.profileId === DASHBOARD_PROFILE_ID &&
      Number.isSafeInteger(metadata.revision) &&
      Number(metadata.revision) > 0 &&
      typeof metadata.generation === 'string' &&
      (metadata.kind === 'update' ||
        metadata.kind === 'patch' ||
        metadata.kind === 'reset' ||
        metadata.kind === 'restore') &&
      typeof metadata.updatedAt === 'string' &&
      Number.isFinite(Date.parse(metadata.updatedAt)) &&
      metadata.author &&
      typeof metadata.author.id === 'string' &&
      typeof metadata.author.name === 'string' &&
      typeof metadata.author.kind === 'string' &&
      typeof metadata.author.providerId === 'string' &&
      Array.isArray(metadata.changedPaths) &&
      metadata.changedPaths.every(
        (entry) => typeof entry === 'string' && entry.startsWith('/')
      ) &&
      (!workspace ||
        (metadata.installationId === workspace.installationId &&
          metadata.workspaceId === workspace.workspaceId))
  )
}

function validState(
  value: unknown,
  workspace?: PersistedDashboardWorkspace
): value is PersistedProfileState {
  const state = value as Partial<PersistedProfileState> | null
  if (
    !state ||
    state.contractVersion !== DASHBOARD_PROFILE_CONTRACT_VERSION ||
    !Number.isSafeInteger(state.revision) ||
    Number(state.revision) < 0 ||
    typeof state.generation !== 'string' ||
    (state.status !== 'uninitialized' &&
      state.status !== 'active' &&
      state.status !== 'reset')
  ) {
    return false
  }
  if (
    state.metadata !== null &&
    (!validRevisionMetadata(state.metadata, workspace) ||
      state.metadata.revision !== state.revision ||
      state.metadata.generation !== state.generation)
  ) {
    return false
  }
  if (
    state.revision === 0
      ? state.status !== 'uninitialized' || state.metadata !== null
      : state.metadata === null || state.status === 'uninitialized'
  ) {
    return false
  }
  if (
    state.status === 'reset'
      ? state.resetRevision !== state.revision
      : state.resetRevision !== null
  ) {
    return false
  }
  if (
    state.metadata &&
    (state.status === 'reset'
      ? state.metadata.kind !== 'reset'
      : state.metadata.kind === 'reset')
  ) {
    return false
  }
  if (
    Object.hasOwn(state, 'profileHash') &&
    (state.status === 'active'
      ? typeof state.profileHash !== 'string' ||
        !PROFILE_HASH_PATTERN.test(state.profileHash)
      : state.profileHash !== null)
  ) {
    return false
  }
  if (
    Object.hasOwn(state, 'latestRecoverableRevision') &&
    state.latestRecoverableRevision !== null &&
    (!Number.isSafeInteger(state.latestRecoverableRevision) ||
      Number(state.latestRecoverableRevision) <= 0 ||
      Number(state.latestRecoverableRevision) > Number(state.revision))
  ) {
    return false
  }
  return true
}

function publicPrincipal(principal: ViteDashboardProfilePrincipal): DashboardProfilePrincipal {
  return {
    providerId: principal.providerId.slice(0, 64),
    userId: principal.userId?.slice(0, 128) ?? null,
    userName: principal.userName?.slice(0, 120) ?? null,
  }
}

function principalKey(principal: ViteDashboardProfilePrincipal): string {
  const identity = principal.userId
    ? `user:${principal.userId.slice(0, 128)}`
    : `session:${principal.sessionId.slice(0, 128)}`
  return `${principal.providerId.slice(0, 64)}|${identity}`
}

export function createViteDashboardProfileStore(
  profileFilePath = path.resolve(process.cwd(), '.cache', 'navet-dashboard-profile.json')
) {
  const paths = resolveStorePaths(profileFilePath)

  const readOrCreateWorkspace = (): PersistedDashboardWorkspace => {
    const missingWorkspace = Symbol('missing-dashboard-workspace')
    const existing = readJson<unknown | typeof missingWorkspace>(
      paths.workspace,
      missingWorkspace,
      MAX_WORKSPACE_BYTES
    )
    if (existing === missingWorkspace) {
      const workspace: PersistedDashboardWorkspace = {
        contractVersion: DASHBOARD_PROFILE_CONTRACT_VERSION,
        installationId: createId('nvi'),
        workspaceId: createId('nvw'),
        defaultProfileId: DASHBOARD_PROFILE_ID,
        createdAt: new Date().toISOString(),
      }
      writeJson(paths.workspace, workspace)
      return workspace
    }
    if (validWorkspace(existing)) {
      return existing
    }
    throw new DashboardProfileStorageReadError(
      `Dashboard profile storage cannot be read safely: ${paths.workspace}`
    )
  }

  const authorizePrincipal = (
    principal: ViteDashboardProfilePrincipal
  ): boolean => {
    if (
      principal.providerId !== 'home_assistant' ||
      !TENANT_ID_PATTERN.test(principal.tenantId)
    ) {
      return false
    }

    const workspace = readOrCreateWorkspace()
    if (workspace.tenantBinding === undefined) {
      // Legacy workspaces did not persist an HA tenant. Enroll only from the
      // server-resolved authenticated principal; request headers and client IDs
      // are intentionally excluded from this trust decision.
      writeJson(paths.workspace, {
        ...workspace,
        tenantBinding: {
          providerId: 'home_assistant',
          tenantId: principal.tenantId,
          enrolledAt: new Date().toISOString(),
        },
      } satisfies PersistedDashboardWorkspace)
      return true
    }

    return (
      validTenantBinding(workspace.tenantBinding) &&
      workspace.tenantBinding.providerId === principal.providerId &&
      workspace.tenantBinding.tenantId === principal.tenantId
    )
  }

  const readProfileFile = (): StoredProfileResult => {
    try {
      const serialized = boundedFile.readBoundedText(fileSystem, paths.profile, MAX_PROFILE_BYTES, () =>
        new DashboardProfileStorageReadError(`Dashboard profile storage cannot be read safely: ${paths.profile}`))
      const parsed = JSON.parse(serialized)
      if (!isValidDashboardProfileData(parsed)) {
        return {
          status: 'invalid',
          profile: null,
          profileHash: null,
          needsRewrite: false,
        }
      }
      const sanitized = sanitizeDashboardProfileData(parsed)
      return {
        status: 'present',
        profile: sanitized,
        profileHash: hashDashboardProfile(sanitized),
        needsRewrite: JSON.stringify(sanitized) !== JSON.stringify(parsed),
      }
    } catch (error) {
      if (isMissingFileError(error)) {
        return {
          status: 'missing',
          profile: null,
          profileHash: null,
          needsRewrite: false,
        }
      }
      if (error instanceof DashboardProfileStorageReadError) {
        throw error
      }
      throw new DashboardProfileStorageReadError(
        `Dashboard profile storage cannot be read safely: ${paths.profile}`
      )
    }
  }

  const getHistory = (): PersistedHistoryEntry[] => {
    const history = readJson<unknown>(
      paths.history,
      [],
      MAX_HISTORY_BYTES
    )
    if (!Array.isArray(history)) {
      return []
    }
    let changed = false
    const sanitizedCandidates: PersistedHistoryEntry[] = []
    for (const entry of history as PersistedHistoryEntry[]) {
      if (!entry || !validRevisionMetadata(entry.metadata)) {
        changed = true
        continue
      }
      if (entry.profile === null) {
        if (entry.profileHash !== null) {
          changed = true
        }
        sanitizedCandidates.push({
          metadata: entry.metadata,
          profile: null,
          profileHash: null,
        })
        continue
      }
      if (!isValidDashboardProfileData(entry.profile)) {
        changed = true
        continue
      }
      const profile = sanitizeDashboardProfileData(entry.profile)
      const serializedProfile = JSON.stringify(profile)
      if (Buffer.byteLength(serializedProfile, 'utf8') > MAX_PROFILE_BYTES) {
        changed = true
        continue
      }
      const profileHash = hashDashboardProfile(profile)
      if (
        serializedProfile !== JSON.stringify(entry.profile) ||
        entry.profileHash !== profileHash
      ) {
        changed = true
      }
      sanitizedCandidates.push({
        metadata: entry.metadata,
        profile,
        profileHash,
      })
    }
    const sanitizedHistory = pruneHistoryBySerializedSize(sanitizedCandidates)
    if (sanitizedHistory.length !== history.length) {
      changed = true
    }
    if (changed) {
      writeJson(paths.history, sanitizedHistory)
    }
    return sanitizedHistory
  }

  const historyEntryMatchesState = (
    entry: PersistedHistoryEntry,
    state: PersistedProfileState
  ): boolean => {
    if (
      !state.metadata ||
      entry.metadata.installationId !== state.metadata.installationId ||
      entry.metadata.workspaceId !== state.metadata.workspaceId ||
      entry.metadata.profileId !== state.metadata.profileId ||
      entry.metadata.revision !== state.revision ||
      entry.metadata.generation !== state.generation
    ) {
      return false
    }
    if (state.status === 'reset') {
      return entry.profile === null
    }
    if (state.status !== 'active' || !entry.profile) {
      return false
    }
    return (
      typeof state.profileHash !== 'string' ||
      !PROFILE_HASH_PATTERN.test(state.profileHash) ||
      entry.profileHash === state.profileHash
    )
  }

  const getCommittedHistory = (
    state: PersistedProfileState
  ): PersistedHistoryEntry[] =>
    getHistory().filter(
      (entry) =>
        Boolean(
          state.metadata &&
            entry.metadata.installationId === state.metadata.installationId &&
            entry.metadata.workspaceId === state.metadata.workspaceId &&
            entry.metadata.profileId === state.metadata.profileId &&
            (entry.metadata.revision < state.revision ||
              (entry.metadata.revision === state.revision &&
                historyEntryMatchesState(entry, state)))
        )
    )

  const latestRecoverableRevision = (
    state: PersistedProfileState
  ): number | null => {
    if (
      Number.isSafeInteger(state.latestRecoverableRevision) &&
      Number(state.latestRecoverableRevision) > 0 &&
      Number(state.latestRecoverableRevision) <= state.revision
    ) {
      return Number(state.latestRecoverableRevision)
    }
    return (
      getCommittedHistory(state)
        .slice()
        .reverse()
        .find((entry) => entry.profile)?.metadata.revision ?? null
    )
  }

  const stageHistoryRevision = (
    currentState: PersistedProfileState,
    currentProfile: DashboardProfileData | null,
    metadata: DashboardProfileRevisionMetadata,
    nextProfile: DashboardProfileData | null
  ): void => {
    const newestByRevision = new Map<number, PersistedHistoryEntry>()
    for (const entry of getHistory()) {
      if (
        entry.metadata.installationId === metadata.installationId &&
        entry.metadata.workspaceId === metadata.workspaceId &&
        entry.metadata.profileId === metadata.profileId &&
        entry.metadata.revision < metadata.revision
      ) {
        newestByRevision.set(entry.metadata.revision, entry)
      }
    }
    const retained = [...newestByRevision.values()]
    if (
      currentState.revision < metadata.revision &&
      currentState.status === 'active' &&
      currentProfile
    ) {
      const currentProfileHash = hashDashboardProfile(currentProfile)
      const hasCurrentSnapshot = retained.some(
        (entry) =>
          entry.metadata.revision === currentState.revision &&
          entry.metadata.generation === currentState.generation &&
          entry.profileHash === currentProfileHash
      )
      if (!hasCurrentSnapshot && currentState.metadata) {
        retained.push({
          metadata: currentState.metadata,
          profile: currentProfile,
          profileHash: currentProfileHash,
        })
      }
    }
    const nextProfileHash = nextProfile
      ? hashDashboardProfile(nextProfile)
      : null
    retained.push({
      metadata,
      profile: nextProfile,
      profileHash: nextProfileHash,
    })
    retained.sort(
      (left, right) => left.metadata.revision - right.metadata.revision
    )
    const staged = pruneHistoryBySerializedSize(retained)
    const candidateRetained = staged.some(
      (entry) =>
        entry.metadata.revision === metadata.revision &&
        entry.metadata.generation === metadata.generation &&
        entry.profileHash === nextProfileHash
    )
    const currentRetained =
      currentState.status !== 'active' ||
      currentState.revision >= metadata.revision ||
      (currentProfile !== null &&
        staged.some(
          (entry) =>
            entry.metadata.revision === currentState.revision &&
            entry.metadata.generation === currentState.generation &&
            entry.profileHash === hashDashboardProfile(currentProfile)
        ))
    if (!candidateRetained || !currentRetained) {
      throw new DashboardProfileStorageCapacityError(
        'Dashboard profile history cannot retain the commit boundary'
      )
    }
    writeJson(paths.history, staged)
  }

  const getState = (): PersistedProfileState => {
    const workspace = readOrCreateWorkspace()
    const existing = readJson<unknown>(
      paths.state,
      null,
      MAX_PROFILE_STATE_BYTES
    )
    if (validState(existing, workspace)) {
      return existing
    }

    const history = getHistory()
      .filter(
        (entry) =>
          entry.metadata.installationId === workspace.installationId &&
          entry.metadata.workspaceId === workspace.workspaceId &&
          entry.metadata.profileId === DASHBOARD_PROFILE_ID
      )
      .slice()
      .sort((left, right) => left.metadata.revision - right.metadata.revision)
    const latest = history.at(-1)
    if (latest) {
      const recovered: PersistedProfileState = {
        contractVersion: DASHBOARD_PROFILE_CONTRACT_VERSION,
        revision: latest.metadata.revision,
        generation: latest.metadata.generation,
        status: latest.profile ? 'active' : 'reset',
        resetRevision: latest.profile ? null : latest.metadata.revision,
        metadata: latest.metadata,
        profileHash: latest.profileHash ?? null,
        latestRecoverableRevision:
          history
            .slice()
            .reverse()
            .find((entry) => entry.profile)?.metadata.revision ?? null,
      }
      if (latest.profile) {
        writeJson(paths.profile, latest.profile)
      } else {
        rmSync(paths.profile, { force: true })
      }
      writeJson(paths.state, recovered)
      return recovered
    }

    const legacyProfileResult = readProfileFile()
    if (legacyProfileResult.status === 'present') {
      const legacyProfile = legacyProfileResult.profile
      const metadata: DashboardProfileRevisionMetadata = {
        contractVersion: DASHBOARD_PROFILE_CONTRACT_VERSION,
        installationId: workspace.installationId,
        workspaceId: workspace.workspaceId,
        profileId: DASHBOARD_PROFILE_ID,
        revision: 1,
        generation: createDashboardProfileGeneration(),
        kind: 'update',
        updatedAt:
          legacyProfile.exportedAt && Number.isFinite(Date.parse(legacyProfile.exportedAt))
            ? legacyProfile.exportedAt
            : new Date().toISOString(),
        author: SYSTEM_AUTHOR,
        changedPaths: ['/'],
      }
      const migrated: PersistedProfileState = {
        contractVersion: DASHBOARD_PROFILE_CONTRACT_VERSION,
        revision: 1,
        generation: metadata.generation,
        status: 'active',
        resetRevision: null,
        metadata,
        profileHash: legacyProfileResult.profileHash,
        latestRecoverableRevision: 1,
      }
      stageHistoryRevision(
        {
          contractVersion: DASHBOARD_PROFILE_CONTRACT_VERSION,
          revision: 0,
          generation: createDashboardProfileGeneration(),
          status: 'uninitialized',
          resetRevision: null,
          metadata: null,
          profileHash: null,
          latestRecoverableRevision: null,
        },
        null,
        metadata,
        legacyProfile
      )
      writeJson(paths.profile, legacyProfile)
      writeJson(paths.state, migrated)
      return migrated
    }

    const initial: PersistedProfileState = {
      contractVersion: DASHBOARD_PROFILE_CONTRACT_VERSION,
      revision: 0,
      generation: createDashboardProfileGeneration(),
      status: 'uninitialized',
      resetRevision: null,
      metadata: null,
      profileHash: null,
      latestRecoverableRevision: null,
    }
    writeJson(paths.state, initial)
    return initial
  }

  const getProfileForState = (
    state: PersistedProfileState
  ): DashboardProfileData | null => {
    if (state.status !== 'active') {
      return null
    }
    const profileResult = readProfileFile()
    if (
      typeof state.profileHash === 'string' &&
      PROFILE_HASH_PATTERN.test(state.profileHash) &&
      profileResult.status === 'present' &&
      profileResult.profileHash === state.profileHash
    ) {
      if (profileResult.needsRewrite) {
        try {
          writeJson(paths.profile, profileResult.profile)
        } catch {
          // The sanitized profile still matches the committed digest.
        }
      }
      return profileResult.profile
    }

    const history = getHistory().filter(
      (entry) =>
        state.metadata &&
        entry.metadata.installationId === state.metadata.installationId &&
        entry.metadata.workspaceId === state.metadata.workspaceId &&
        entry.metadata.profileId === state.metadata.profileId
    )
    const historyEntry = history
      .slice()
      .reverse()
      .find((entry) => historyEntryMatchesState(entry, state))
    if (historyEntry?.profile) {
      try {
        writeJson(paths.profile, historyEntry.profile)
      } catch {
        // The exact history snapshot remains safe to serve.
      }
      if (
        typeof state.profileHash !== 'string' ||
        !PROFILE_HASH_PATTERN.test(state.profileHash)
      ) {
        try {
          writeJson(paths.state, {
            ...state,
            profileHash: historyEntry.profileHash,
            latestRecoverableRevision: state.revision,
          } satisfies PersistedProfileState)
        } catch {
          // Legacy state remains readable through the exact history snapshot.
        }
      }
      return historyEntry.profile
    }

    if (
      (typeof state.profileHash !== 'string' ||
        !PROFILE_HASH_PATTERN.test(state.profileHash)) &&
      profileResult.status === 'present' &&
      !history.some((entry) => entry.metadata.revision > state.revision) &&
      state.metadata
    ) {
      try {
        const legacyState = {
          ...state,
          profileHash: profileResult.profileHash,
          latestRecoverableRevision: state.revision,
        } satisfies PersistedProfileState
        stageHistoryRevision(
          legacyState,
          profileResult.profile,
          state.metadata,
          profileResult.profile
        )
        writeJson(paths.state, legacyState)
      } catch {
        // The legacy profile remains the only available committed snapshot.
      }
      return profileResult.profile
    }
    return null
  }

  const getProfile = (): DashboardProfileData | null =>
    getProfileForState(getState())

  const getRecovery = (): DashboardProfileRecovery => {
    const state = getState()
    if (state.status === 'reset') {
      return {
        status: 'reset',
        resetRevision: state.resetRevision,
        latestRecoverableRevision: latestRecoverableRevision(state),
      }
    }
    if (state.status === 'uninitialized') {
      return {
        status: 'uninitialized',
        resetRevision: null,
        latestRecoverableRevision: latestRecoverableRevision(state),
      }
    }
    if (getProfileForState(state)) {
      return {
        status: 'active',
        resetRevision: null,
        latestRecoverableRevision: state.revision,
      }
    }
    const recoverableRevision = latestRecoverableRevision(state)
    return {
      status: recoverableRevision === null ? 'missing' : 'recoverable',
      resetRevision: null,
      latestRecoverableRevision: recoverableRevision,
    }
  }

  const persistRevision = (
    profile: DashboardProfileData | null,
    author: DashboardProfileAuthor,
    kind: DashboardProfileRevisionMetadata['kind'],
    changedPaths: string[],
    restoredFromRevision?: number
  ) => {
    const workspace = readOrCreateWorkspace()
    const current = getState()
    const currentProfile = getProfileForState(current)
    const metadata: DashboardProfileRevisionMetadata = {
      contractVersion: DASHBOARD_PROFILE_CONTRACT_VERSION,
      installationId: workspace.installationId,
      workspaceId: workspace.workspaceId,
      profileId: DASHBOARD_PROFILE_ID,
      revision: current.revision + 1,
      generation:
        kind === 'reset' ? createDashboardProfileGeneration() : current.generation,
      kind,
      updatedAt: new Date().toISOString(),
      author,
      changedPaths,
      ...(restoredFromRevision === undefined ? {} : { restoredFromRevision }),
    }
    const sanitizedProfile = profile ? sanitizeDashboardProfileData(profile) : null
    if (
      sanitizedProfile &&
      Buffer.byteLength(JSON.stringify(sanitizedProfile), 'utf8') >
        MAX_PROFILE_BYTES
    ) {
      throw new DashboardProfileWriteLimitError('Dashboard profile is too large')
    }
    const next: PersistedProfileState = {
      contractVersion: DASHBOARD_PROFILE_CONTRACT_VERSION,
      revision: metadata.revision,
      generation: metadata.generation,
      status: sanitizedProfile ? 'active' : 'reset',
      resetRevision: sanitizedProfile ? null : metadata.revision,
      metadata,
      profileHash: sanitizedProfile
        ? hashDashboardProfile(sanitizedProfile)
        : null,
      latestRecoverableRevision: sanitizedProfile
        ? metadata.revision
        : current.status === 'active'
          ? current.revision
          : latestRecoverableRevision(current),
    }
    try {
      stageHistoryRevision(current, currentProfile, metadata, sanitizedProfile)
      if (sanitizedProfile) {
        writeJson(paths.profile, sanitizedProfile)
      } else {
        rmSync(paths.profile, { force: true })
      }
      writeJson(paths.state, next)
    } catch (error) {
      if (
        error instanceof DashboardProfileStorageReadError ||
        error instanceof DashboardProfileStorageCapacityError
      ) {
        throw error
      }
      throw new DashboardProfileStorageCapacityError(
        'Dashboard profile commit could not be persisted'
      )
    }
    return next
  }

  const invalidRegistry = (): DashboardProfileStorageReadError =>
    new DashboardProfileStorageReadError(
      `Dashboard profile storage cannot be read safely: ${paths.clients}`
    )

  const parseRegistryClient = (
    candidate: unknown
  ): {
    entry: PersistedDashboardClientRegistryEntry
    parsedFirstSeenAt: number
    parsedLastSeenAt: number
  } => {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate)
    ) {
      throw invalidRegistry()
    }
    const entry = candidate as Record<string, unknown>
    const parsedFirstSeenAt =
      typeof entry.firstSeenAt === 'string'
        ? Date.parse(entry.firstSeenAt)
        : Number.NaN
    const parsedLastSeenAt =
      typeof entry.lastSeenAt === 'string'
        ? Date.parse(entry.lastSeenAt)
        : Number.NaN
    const principal =
      entry.principal &&
      typeof entry.principal === 'object' &&
      !Array.isArray(entry.principal)
        ? (entry.principal as Record<string, unknown>)
        : null
    if (
      typeof entry.id !== 'string' ||
      !/^(?!(?:__proto__|constructor|prototype)$)[A-Za-z0-9_-]{8,128}$/.test(entry.id) ||
      entry.id.includes('..') ||
      typeof entry.name !== 'string' ||
      (entry.kind !== 'desktop' &&
        entry.kind !== 'phone' &&
        entry.kind !== 'tablet' &&
        entry.kind !== 'wall_panel' &&
        entry.kind !== 'unknown') ||
      !Number.isFinite(parsedFirstSeenAt) ||
      !Number.isFinite(parsedLastSeenAt) ||
      (entry.lastRevision !== undefined &&
        entry.lastRevision !== null &&
        (!Number.isSafeInteger(entry.lastRevision) ||
          Number(entry.lastRevision) < 0)) ||
      !principal ||
      typeof principal.providerId !== 'string' ||
      (principal.userId !== null && typeof principal.userId !== 'string') ||
      (principal.userName !== null &&
        typeof principal.userName !== 'string') ||
      (entry.bindingId !== undefined &&
        entry.bindingId !== null &&
        (typeof entry.bindingId !== 'string' ||
          !CLIENT_BINDING_PATTERN.test(entry.bindingId)))
    ) {
      throw invalidRegistry()
    }
    return {
      entry: candidate as PersistedDashboardClientRegistryEntry,
      parsedFirstSeenAt,
      parsedLastSeenAt,
    }
  }

  const normalizeRegistryBinding = (
    entry: PersistedDashboardClientRegistryEntry
  ): string | undefined =>
    typeof entry.bindingId === 'string' &&
    CLIENT_BINDING_PATTERN.test(entry.bindingId)
      ? entry.bindingId
      : undefined

  const normalizeRegistryLastRevision = (
    entry: PersistedDashboardClientRegistryEntry
  ): number | null =>
    Number.isSafeInteger(entry.lastRevision) &&
    Number(entry.lastRevision) >= 0
      ? Number(entry.lastRevision)
      : null

  const readRegistry = (): RegistryCollection => {
    const workspace = readOrCreateWorkspace()
    const missingRegistry = Symbol('missing-dashboard-client-registry')
    const candidate = readJson<unknown | typeof missingRegistry>(
      paths.clients,
      missingRegistry,
      MAX_CLIENT_REGISTRY_BYTES
    )
    if (candidate === missingRegistry) {
      return {
        contractVersion: DASHBOARD_PROFILE_CONTRACT_VERSION,
        workspaceId: workspace.workspaceId,
        clients: [],
      }
    }
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate) ||
      (candidate as Partial<RegistryCollection>).contractVersion !==
        DASHBOARD_PROFILE_CONTRACT_VERSION ||
      !Array.isArray((candidate as Partial<RegistryCollection>).clients)
    ) {
      throw new DashboardProfileStorageReadError(
        `Dashboard profile storage cannot be read safely: ${paths.clients}`
      )
    }
    const registry = candidate as RegistryCollection
    for (const client of registry.clients) {
      parseRegistryClient(client)
    }
    return {
      contractVersion: DASHBOARD_PROFILE_CONTRACT_VERSION,
      workspaceId: workspace.workspaceId,
      clients: registry.clients,
      ...(registry.preferenceCollectionVersion === 1
        ? { preferenceCollectionVersion: 1 as const }
        : {}),
    }
  }

  const readPreferenceCollection = (
    file: string,
    normalize = true
  ): PreferenceCollection => {
    const missingCollection = Symbol('missing-dashboard-preference-collection')
    const candidate = readJson<unknown | typeof missingCollection>(
      file,
      missingCollection,
      MAX_PREFERENCE_COLLECTION_BYTES
    )
    if (candidate === missingCollection) {
      return {
        contractVersion: DASHBOARD_PROFILE_CONTRACT_VERSION,
        records: {},
      }
    }
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate) ||
      (candidate as Partial<PreferenceCollection>).contractVersion !==
        DASHBOARD_PROFILE_CONTRACT_VERSION ||
      !(candidate as Partial<PreferenceCollection>).records ||
      typeof (candidate as Partial<PreferenceCollection>).records !== 'object' ||
      Array.isArray((candidate as Partial<PreferenceCollection>).records)
    ) {
      throw new DashboardProfileStorageReadError(
        `Dashboard profile storage cannot be read safely: ${file}`
      )
    }
    const collection = candidate as PreferenceCollection
    const scope =
      file === paths.clientPreferences ? 'client' : 'account'
    const validRecordKey = (key: string): boolean => {
      if (
        key.length === 0 ||
        key.length > 512 ||
        key === '__proto__' ||
        key === 'prototype' ||
        key === 'constructor'
      ) {
        return false
      }
      return (
        scope !== 'client' ||
        !key.startsWith('client-binding:') ||
        CLIENT_BINDING_PATTERN.test(key.slice('client-binding:'.length))
      )
    }
    const validDocument = (
      value: unknown
    ): value is DashboardPreferenceDocument => {
      if (!isRecord(value)) {
        return false
      }
      const document = value as Partial<DashboardPreferenceDocument>
      const principal = document.principal
      if (
        document.contractVersion !==
          DASHBOARD_PROFILE_CONTRACT_VERSION ||
        !Number.isSafeInteger(document.schemaVersion) ||
        Number(document.schemaVersion) < 1 ||
        document.scope !== scope ||
        !Number.isSafeInteger(document.revision) ||
        Number(document.revision) < 1 ||
        typeof document.updatedAt !== 'string' ||
        !Number.isFinite(Date.parse(document.updatedAt)) ||
        !isRecord(document.values) ||
        !isRecord(principal) ||
        typeof principal.providerId !== 'string' ||
        principal.providerId.length === 0 ||
        (principal.userId !== null &&
          typeof principal.userId !== 'string') ||
        (principal.userName !== null &&
          typeof principal.userName !== 'string')
      ) {
        return false
      }
      if (scope === 'account') {
        return document.clientId === null
      }
      return (
        typeof document.clientId === 'string' &&
        /^(?!(?:__proto__|constructor|prototype)$)[A-Za-z0-9_-]{8,128}$/.test(document.clientId) &&
        !document.clientId.includes('..')
      )
    }
    for (const [key, document] of Object.entries(collection.records)) {
      if (!validRecordKey(key) || !validDocument(document)) {
        throw new DashboardProfileStorageReadError(
          `Dashboard profile storage cannot be read safely: ${file}`
        )
      }
    }
    if (!normalize) {
      return collection
    }
    return normalizePreferenceCollection(file, collection)
  }

  const normalizePreferenceCollection = (
    file: string,
    collection: PreferenceCollection
  ): PreferenceCollection => {
    const scope =
      file === paths.clientPreferences ? 'client' : 'account'
    let changed = false
    for (const [key, document] of Object.entries(collection.records)) {
      const values = sanitizeDashboardPreferenceValues(
        document.values,
        document.scope
      )
      if (JSON.stringify(values) !== JSON.stringify(document.values)) {
        document.values = values
        changed = true
      }
      if (
        document.scope === 'client' &&
        !key.startsWith('client-binding:')
      ) {
        const canonicalKey = `client:${document.clientId}`
        if (key !== canonicalKey) {
          const canonical = collection.records[canonicalKey]
          if (!canonical || document.revision > canonical.revision) {
            setOwnRecordValue(collection.records, canonicalKey, document)
          }
          delete collection.records[key]
          changed = true
        }
      }
    }
    if (changed && preferenceCollectionFits(collection, scope)) {
      writeJson(file, collection)
    }
    return collection
  }

  const normalizeRegistryClients = (
    clients: readonly unknown[],
    now: number,
    newestFirst = false
  ): PersistedDashboardClientRegistryEntry[] => {
    const compareText = (left: string, right: string): number => {
      if (left < right) {
        return -1
      }
      if (left > right) {
        return 1
      }
      return 0
    }
    const bindingSortValue = (
      entry: PersistedDashboardClientRegistryEntry
    ): { bound: boolean; value: string } => {
      const value = typeof entry.bindingId === 'string' ? entry.bindingId : ''
      return {
        bound: CLIENT_BINDING_PATTERN.test(value),
        value,
      }
    }
    const compareClients = (
      left: PersistedDashboardClientRegistryEntry,
      right: PersistedDashboardClientRegistryEntry,
      newestFirst: boolean
    ): number => {
      const leftBinding = bindingSortValue(left)
      const rightBinding = bindingSortValue(right)
      if (
        left.id === right.id &&
        leftBinding.bound !== rightBinding.bound
      ) {
        return leftBinding.bound ? -1 : 1
      }
      const timestampComparison = compareText(left.lastSeenAt, right.lastSeenAt)
      if (timestampComparison !== 0) {
        return newestFirst ? -timestampComparison : timestampComparison
      }
      const idComparison = compareText(left.id, right.id)
      if (idComparison !== 0) {
        return idComparison
      }
      if (leftBinding.bound !== rightBinding.bound) {
        return leftBinding.bound ? -1 : 1
      }
      return compareText(leftBinding.value, rightBinding.value)
    }
    const futureBoundary = now + CLIENT_FUTURE_SKEW_MS
    const normalized: PersistedDashboardClientRegistryEntry[] = []
    for (const candidate of clients) {
      const { entry, parsedFirstSeenAt, parsedLastSeenAt } =
        parseRegistryClient(candidate)
      const boundedLastSeenAt =
        parsedLastSeenAt > futureBoundary ? now : parsedLastSeenAt
      if (now - boundedLastSeenAt > CLIENT_STALE_AFTER_MS) {
        continue
      }
      const boundedFirstSeenAt = Math.min(
        parsedFirstSeenAt,
        boundedLastSeenAt
      )
      normalized.push({
        ...entry,
        firstSeenAt: new Date(boundedFirstSeenAt).toISOString(),
        lastSeenAt: new Date(boundedLastSeenAt).toISOString(),
        lastRevision: normalizeRegistryLastRevision(entry),
        bindingId: normalizeRegistryBinding(entry),
      })
    }

    const seenIds = new Set<string>()
    const seenBindings = new Set<string>()
    return normalized
      .sort((left, right) => compareClients(left, right, true))
      .filter((entry) => {
        const bindingId =
          typeof entry.bindingId === 'string' &&
          CLIENT_BINDING_PATTERN.test(entry.bindingId)
            ? entry.bindingId
            : null
        if (seenIds.has(entry.id) || (bindingId && seenBindings.has(bindingId))) {
          return false
        }
        seenIds.add(entry.id)
        if (bindingId) {
          seenBindings.add(bindingId)
        }
        return true
      })
      .sort((left, right) => compareClients(left, right, newestFirst))
  }

  const reconcileClientPreferences = (
    registry: RegistryCollection,
    allowEmptyRegistry = false,
    preloadedCollection?: PreferenceCollection
  ): PreferenceCollection => {
    const collection =
      preloadedCollection ??
      readPreferenceCollection(paths.clientPreferences)
    const originalRecordCount = Object.keys(collection.records).length
    if (!allowEmptyRegistry && registry.clients.length === 0 && originalRecordCount > 0) {
      throw new DashboardProfileStorageReadError(
        `Dashboard profile storage cannot be reconciled safely: ${paths.clientPreferences}`
      )
    }
    const records: Record<string, DashboardPreferenceDocument> = Object.create(null)
    for (const client of registry.clients) {
      const legacyKey = `client:${client.id}`
      const canonicalKey =
        client.bindingId && CLIENT_BINDING_PATTERN.test(client.bindingId)
          ? `client-binding:${client.bindingId}`
          : legacyKey
      const boundDocument = client.bindingId
        ? collection.records[canonicalKey]
        : undefined
      const legacyDocument = collection.records[legacyKey]
      if (boundDocument?.scope === 'client') {
        // Device preferences belong to the durable browser binding. Keep the
        // replaceable public client label aligned when that same binding rekeys.
        records[canonicalKey] =
          boundDocument.clientId === client.id
            ? boundDocument
            : { ...boundDocument, clientId: client.id }
      } else if (
        legacyDocument?.scope === 'client' &&
        legacyDocument.clientId === client.id
      ) {
        records[canonicalKey] = legacyDocument
      }
    }
    if (JSON.stringify(records) !== JSON.stringify(collection.records)) {
      const reconciled = {
        contractVersion: DASHBOARD_PROFILE_CONTRACT_VERSION,
        records,
      } satisfies PreferenceCollection
      if (preferenceCollectionFits(reconciled, 'client')) {
        writeJson(paths.clientPreferences, reconciled)
        return reconciled
      } else if (originalRecordCount > CLIENT_REGISTRY_LIMIT) {
        throw new DashboardProfileStorageReadError(
          `Dashboard profile storage cannot be reconciled safely: ${paths.clientPreferences}`
        )
      }
    }
    return collection
  }

  const preferenceCollectionFits = (
    collection: PreferenceCollection,
    scope: DashboardPreferenceScope
  ): boolean =>
    (scope !== 'client' ||
      Object.keys(collection.records).length <= CLIENT_REGISTRY_LIMIT) &&
    Buffer.byteLength(JSON.stringify(collection), 'utf8') <=
      MAX_PREFERENCE_COLLECTION_BYTES

  const resolveRegisteredClientBinding = (
    clientId: string,
    candidates: string[]
  ): {
    clientExists: boolean
    bindingId: string | null
    expectedBindingId: string | null
  } => {
    const registry = readRegistry()
    const existing = registry.clients.find((entry) => entry.id === clientId)
    if (
      existing?.bindingId &&
      CLIENT_BINDING_PATTERN.test(existing.bindingId)
    ) {
      return {
        clientExists: true,
        bindingId: candidates.includes(existing.bindingId)
          ? existing.bindingId
          : null,
        expectedBindingId: existing.bindingId,
      }
    }
    const continuity = candidates.find((candidate) =>
      registry.clients.some((entry) => entry.bindingId === candidate)
    )
    return {
      clientExists: Boolean(existing),
      bindingId: continuity ?? null,
      expectedBindingId: null,
    }
  }

  const readDisplayProfiles = ():
    | DashboardDisplayProfileDocument<SanitizedDisplayProfilePolicy>
    | null => {
    const missing = Symbol('missing-display-profiles')
    const value = readJson<unknown | typeof missing>(
      paths.displayProfiles,
      missing,
      MAX_DISPLAY_PROFILES_BYTES
    )
    if (value === missing) {
      return null
    }
    if (
      !isRecord(value) ||
      value.contractVersion !== DASHBOARD_PROFILE_CONTRACT_VERSION ||
      !Number.isSafeInteger(value.schemaVersion) ||
      !Number.isSafeInteger(value.revision) ||
      Number(value.revision) < 1 ||
      typeof value.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(value.updatedAt)) ||
      !isRecord(value.values) ||
      !isRecord(value.author) ||
      typeof value.author.id !== 'string' ||
      typeof value.author.name !== 'string' ||
      typeof value.author.kind !== 'string'
    ) {
      throw new DashboardProfileStorageReadError(
        `Dashboard display profile storage cannot be read safely: ${paths.displayProfiles}`
      )
    }
    const document = value as unknown as DashboardDisplayProfileDocument<
      SanitizedDisplayProfilePolicy
    >
    const values = sanitizeDisplayProfilePolicy(document.values)
    if (JSON.stringify(values) !== JSON.stringify(document.values)) {
      const sanitized = { ...document, values }
      writeJson(paths.displayProfiles, sanitized)
      return sanitized
    }
    return document
  }

  const remapDisplayProfileClient = (
    previousClientId: string,
    nextClientId: string | null
  ): void => {
    if (previousClientId === nextClientId) {
      return
    }
    const current = readDisplayProfiles()
    const profileId = current?.values.profileIdByClientId?.[previousClientId]
    if (!current || typeof profileId !== 'string') {
      return
    }
    const profileIdByClientId: Record<string, string> = Object.assign(
      Object.create(null), current.values.profileIdByClientId
    )
    delete profileIdByClientId[previousClientId]
    if (nextClientId) {
      setOwnRecordValue(profileIdByClientId, nextClientId, profileId)
    }
    writeJson(paths.displayProfiles, {
      ...current,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
      values: sanitizeDisplayProfilePolicy({
        ...current.values,
        profileIdByClientId,
      }),
      author: SYSTEM_AUTHOR,
    } satisfies DashboardDisplayProfileDocument)
  }

  return {
    getPaths: () => paths,
    resolveRegisteredClientBinding,
    authorizePrincipal,
    ownsClient(client: BoundDashboardProfileClient): boolean {
      return readRegistry().clients.some(
        (entry) => entry.id === client.id && entry.bindingId === client.bindingId
      )
    },
    rebindWorkspace(
      principal: ViteDashboardProfilePrincipal,
      client: BoundDashboardProfileClient,
      profile: DashboardProfileData
    ) {
      if (
        principal.providerId !== 'home_assistant' ||
        !TENANT_ID_PATTERN.test(principal.tenantId) ||
        !readRegistry().clients.some(
          (entry) => entry.id === client.id && entry.bindingId === client.bindingId
        )
      ) {
        return null
      }

      const workspace = readOrCreateWorkspace()
      const reboundWorkspace = {
        ...workspace,
        tenantBinding: {
          providerId: 'home_assistant',
          tenantId: principal.tenantId,
          enrolledAt: new Date().toISOString(),
        },
      } satisfies PersistedDashboardWorkspace
      writeJson(paths.workspace, reboundWorkspace)
      try {
        const state = persistRevision(
          profile,
          createAuthor(principal, client),
          'update',
          ['/']
        )
        return state
      } catch (error) {
        writeJson(paths.workspace, workspace)
        throw error
      }
    },
    createPreferenceRequestContext(
      scope: DashboardPreferenceScope
    ): PreferenceRequestContext {
      return {
        scope,
        collection: readPreferenceCollection(
          scope === 'account'
            ? paths.accountPreferences
            : paths.clientPreferences,
          false
        ),
      }
    },
    getWorkspace: () => publicWorkspace(readOrCreateWorkspace()),
    getState,
    getRecovery,
    getGeneration(): string {
      return getState().generation
    },
    getSerializedProfile(): string | null {
      const profile = getProfile()
      return profile ? JSON.stringify(profile) : null
    },
    getProfile,
    getProfileMetadata(): DashboardProfileMetadata {
      return buildRevisionMetadata(readOrCreateWorkspace(), getState())
    },
    getHistory(): DashboardProfileHistoryEntry[] {
      return getCommittedHistory(getState())
        .slice()
        .reverse()
        .map((entry) => ({ ...entry.metadata, hasProfile: Boolean(entry.profile) }))
    },
    getRevision(revision: number): PersistedHistoryEntry | null {
      return (
        getCommittedHistory(getState()).find(
          (entry) => entry.metadata.revision === revision
        ) ?? null
      )
    },
    saveProfile(
      profile: DashboardProfileData,
      options: {
        author?: DashboardProfileAuthor
        changedPaths?: string[]
        kind?: 'update' | 'patch'
      } = {}
    ) {
      const sanitizedProfile = sanitizeDashboardProfileData(profile)
      const current = getProfile()
      if (current && areDashboardProfilesEquivalent(current, sanitizedProfile)) {
        return getState()
      }
      return persistRevision(
        sanitizedProfile,
        options.author ?? SYSTEM_AUTHOR,
        options.kind ?? 'update',
        options.changedPaths ?? ['/']
      )
    },
    patchProfile(
      operations: DashboardProfilePatchOperation[],
      author: DashboardProfileAuthor
    ) {
      const current = getProfile()
      if (!current) {
        throw new Error('There is no active dashboard profile to patch')
      }
      const patchedProfile = sanitizeDashboardProfileData(
        applyDashboardProfilePatch(current, operations)
      )
      if (areDashboardProfilesEquivalent(current, patchedProfile)) {
        return getState()
      }
      return persistRevision(
        patchedProfile,
        author,
        'patch',
        operations.map((operation) => operation.path || '/')
      )
    },
    restoreRevision(revision: number, author: DashboardProfileAuthor) {
      const entry = getCommittedHistory(getState()).find(
        (candidate) => candidate.metadata.revision === revision && candidate.profile
      )
      if (!entry?.profile) {
        return null
      }
      return persistRevision(entry.profile, author, 'restore', ['/'], revision)
    },
    rotateGeneration() {
      const state = getState()
      const generation = createDashboardProfileGeneration()
      if (state.revision === 0 || !state.metadata) {
        writeJson(paths.state, { ...state, generation })
        return generation
      }
      const profile = getProfileForState(state)
      const metadata = { ...state.metadata, generation }
      const next = { ...state, generation, metadata }
      stageHistoryRevision(next, profile, metadata, profile)
      writeJson(paths.state, next)
      return generation
    },
    clearProfile() {
      rmSync(paths.profile, { force: true })
    },
    resetProfile(author: DashboardProfileAuthor = SYSTEM_AUTHOR) {
      return persistRevision(null, author, 'reset', ['/'])
    },
    getDisplayProfiles(): DashboardDisplayProfileDocument | null {
      return readDisplayProfiles()
    },
    saveDisplayProfiles(
      schemaVersion: number,
      values: Record<string, unknown>,
      author: DashboardProfileAuthor
    ): DashboardDisplayProfileDocument {
      const current = readDisplayProfiles()
      const document: DashboardDisplayProfileDocument = {
        contractVersion: DASHBOARD_PROFILE_CONTRACT_VERSION,
        schemaVersion,
        revision: (current?.revision ?? 0) + 1,
        updatedAt: new Date().toISOString(),
        values: sanitizeDisplayProfilePolicy(values),
        author,
      }
      if (
        Buffer.byteLength(JSON.stringify(document), 'utf8') >
        MAX_DISPLAY_PROFILES_BYTES
      ) {
        throw new DashboardProfileStorageCapacityError(
          'Dashboard display profiles exceed storage capacity'
        )
      }
      writeJson(paths.displayProfiles, document)
      return document
    },
    copyDisplaySettings(
      settings: Record<string, unknown>,
      targetClientIds: readonly string[]
    ): { updatedClientIds: string[]; skippedClientIds: string[] } {
      const sanitizedSettings = pickDisplayProfileSettings(settings)
      const registry = readRegistry()
      const collection = readPreferenceCollection(paths.clientPreferences)
      const nextCollection: PreferenceCollection = {
        contractVersion: DASHBOARD_PROFILE_CONTRACT_VERSION,
        records: { ...collection.records },
      }
      const updatedClientIds: string[] = []
      const skippedClientIds: string[] = []
      for (const clientId of [...new Set(targetClientIds)].slice(0, CLIENT_REGISTRY_LIMIT)) {
        const registered = registry.clients.find((entry) => entry.id === clientId)
        if (!registered) {
          skippedClientIds.push(clientId)
          continue
        }
        const key =
          registered.bindingId && CLIENT_BINDING_PATTERN.test(registered.bindingId)
            ? `client-binding:${registered.bindingId}`
            : `client:${registered.id}`
        const current = collection.records[key] ?? collection.records[`client:${registered.id}`]
        const currentValues = sanitizeDashboardPreferenceValues(
          current?.values ?? {},
          'client'
        )
        const currentSettings = {
          ...(isRecord(currentValues.settings) ? currentValues.settings : currentValues),
        }
        if (sanitizedSettings.effectsQualityUserOverride === false) {
          delete currentSettings.effectsQuality
        }
        const document: DashboardPreferenceDocument = {
          contractVersion: DASHBOARD_PROFILE_CONTRACT_VERSION,
          schemaVersion: 1,
          scope: 'client',
          revision: (current?.revision ?? 0) + 1,
          updatedAt: new Date().toISOString(),
          values: {
            schemaVersion: 1,
            settings: { ...currentSettings, ...sanitizedSettings },
          },
          principal: current?.principal ?? registered.principal,
          clientId: registered.id,
        }
        const legacyKey = `client:${registered.id}`
        if (legacyKey !== key) {
          delete nextCollection.records[legacyKey]
        }
        nextCollection.records[key] = document
        updatedClientIds.push(clientId)
      }
      if (!preferenceCollectionFits(nextCollection, 'client')) {
        throw new DashboardProfileStorageCapacityError(
          'Copied display settings exceed device preference storage capacity'
        )
      }
      writeJson(paths.clientPreferences, nextCollection)
      return { updatedClientIds, skippedClientIds }
    },
    getPreference(
      scope: DashboardPreferenceScope,
      principal: ViteDashboardProfilePrincipal,
      client?: BoundDashboardProfileClient,
      preferenceContext?: PreferenceRequestContext
    ): DashboardPreferenceDocument | null {
      const file =
        scope === 'account' ? paths.accountPreferences : paths.clientPreferences
      const collection = preferenceContext
        ? normalizePreferenceCollection(file, preferenceContext.collection)
        : readPreferenceCollection(file)
      if (preferenceContext) {
        preferenceContext.collection = collection
      }
      const key =
        scope === 'client'
          ? `client-binding:${client?.bindingId ?? ''}`
          : principalKey(principal)
      if (
        scope === 'client' &&
        client &&
        !collection.records[key] &&
        collection.records[`client:${client.id}`]
      ) {
        const nextCollection: PreferenceCollection = {
          contractVersion: DASHBOARD_PROFILE_CONTRACT_VERSION,
          records: { ...collection.records },
        }
        nextCollection.records[key] = nextCollection.records[`client:${client.id}`]
        delete nextCollection.records[`client:${client.id}`]
        if (preferenceCollectionFits(nextCollection, 'client')) {
          collection.records = nextCollection.records
          writeJson(file, nextCollection)
        }
      }
      let document =
        collection.records[key] ??
        (scope === 'client' && client
          ? collection.records[`client:${client.id}`]
          : null) ??
        null
      if (
        scope === 'client' &&
        client &&
        document &&
        collection.records[key] === document &&
        document.clientId !== client.id
      ) {
        const relabeledDocument = { ...document, clientId: client.id }
        const nextCollection = {
          contractVersion: DASHBOARD_PROFILE_CONTRACT_VERSION,
          records: {
            ...collection.records,
            [key]: relabeledDocument,
          },
        } satisfies PreferenceCollection
        if (!preferenceCollectionFits(nextCollection, 'client')) {
          throw new DashboardProfileStorageCapacityError(
            'Dashboard client preference relabel exceeds storage capacity'
          )
        }
        writeJson(file, nextCollection)
        collection.records = nextCollection.records
        if (preferenceContext) {
          preferenceContext.collection = collection
        }
        document = relabeledDocument
      }
      return document
    },
    savePreference(
      scope: DashboardPreferenceScope,
      principal: ViteDashboardProfilePrincipal,
      schemaVersion: number,
      values: Record<string, unknown>,
      client?: BoundDashboardProfileClient,
      preferenceContext?: PreferenceRequestContext
    ): DashboardPreferenceDocument {
      const file =
        scope === 'account' ? paths.accountPreferences : paths.clientPreferences
      const collection = preferenceContext
        ? normalizePreferenceCollection(file, preferenceContext.collection)
        : readPreferenceCollection(file)
      if (preferenceContext) {
        preferenceContext.collection = collection
      }
      const key =
        scope === 'client'
          ? `client-binding:${client?.bindingId ?? ''}`
          : principalKey(principal)
      if (
        scope === 'client' &&
        client &&
        !collection.records[key] &&
        collection.records[`client:${client.id}`]
      ) {
        collection.records[key] = collection.records[`client:${client.id}`]
        delete collection.records[`client:${client.id}`]
      }
      const current = collection.records[key]
      const document: DashboardPreferenceDocument = {
        contractVersion: DASHBOARD_PROFILE_CONTRACT_VERSION,
        schemaVersion,
        scope,
        revision: (current?.revision ?? 0) + 1,
        updatedAt: new Date().toISOString(),
        values: sanitizeDashboardPreferenceValues(values, scope),
        principal: publicPrincipal(principal),
        clientId: scope === 'client' ? (client?.id ?? null) : null,
      }
      const nextCollection: PreferenceCollection = {
        contractVersion: DASHBOARD_PROFILE_CONTRACT_VERSION,
        records: {
          ...collection.records,
          [key]: document,
        },
      }
      if (!preferenceCollectionFits(nextCollection, scope)) {
        if (scope === 'client') {
          throw new DashboardClientCapacityError(
            'Dashboard client preference capacity reached'
          )
        }
        throw new DashboardProfileStorageCapacityError(
          'Dashboard preference storage capacity reached'
        )
      }
      writeJson(file, nextCollection)
      return document
    },
    touchClient(
      principal: ViteDashboardProfilePrincipal,
      client: BoundDashboardProfileClient,
      lastRevision: number | null = null,
      preferenceContext?: PreferenceRequestContext
    ): DashboardClientRegistryEntry | null {
      const preferenceValidationScope = preferenceContext?.scope
      let routedPreferenceValidated = Boolean(preferenceContext)
      let clientPreferenceCollection =
        preferenceContext?.scope === 'client'
          ? preferenceContext.collection
          : undefined
      let clientPreferenceCollectionNormalized = false
      const registry = readRegistry()
      const hadRegistryClients = registry.clients.length > 0
      const normalizedClients = normalizeRegistryClients(
        registry.clients,
        Date.now()
      )
      const registryChanged =
        JSON.stringify(normalizedClients) !== JSON.stringify(registry.clients)
      if (registryChanged) {
        registry.clients = normalizedClients
      }
      const current = registry.clients.find((entry) => entry.id === client.id)
      const bindingContinuity = registry.clients.find(
        (entry) => entry.bindingId === client.bindingId
      )
      if (
        current?.bindingId &&
        CLIENT_BINDING_PATTERN.test(current.bindingId) &&
        current.bindingId !== client.bindingId
      ) {
        return null
      }
      const continuity = current ?? bindingContinuity
      if (!continuity && registry.clients.length >= CLIENT_REGISTRY_LIMIT) {
        throw new DashboardClientCapacityError(
          'Dashboard client registry capacity reached'
        )
      }
      if (
        !continuity?.bindingId ||
        !CLIENT_BINDING_PATTERN.test(continuity.bindingId)
      ) {
        clientPreferenceCollection ??= readPreferenceCollection(
          paths.clientPreferences,
          false
        )
        if (Object.entries(clientPreferenceCollection.records).some(
          ([key, document]) =>
            key.startsWith('client-binding:') &&
            key !== `client-binding:${client.bindingId}` &&
            document.clientId === client.id
        )) {
          return null
        }
      }
      if (registry.preferenceCollectionVersion !== 1 || registryChanged) {
        if (
          clientPreferenceCollection &&
          !clientPreferenceCollectionNormalized
        ) {
          clientPreferenceCollection = normalizePreferenceCollection(
            paths.clientPreferences,
            clientPreferenceCollection
          )
          clientPreferenceCollectionNormalized = true
          if (
            preferenceValidationScope === 'client' &&
            preferenceContext
          ) {
            preferenceContext.collection = clientPreferenceCollection
          }
        }
        if (preferenceValidationScope && !routedPreferenceValidated) {
          readPreferenceCollection(paths.accountPreferences, false)
          routedPreferenceValidated = true
        }
        clientPreferenceCollection = reconcileClientPreferences(
          registry,
          registryChanged && hadRegistryClients,
          clientPreferenceCollection
        )
        clientPreferenceCollectionNormalized = true
        if (
          preferenceValidationScope === 'client' &&
          preferenceContext
        ) {
          preferenceContext.collection = clientPreferenceCollection
          routedPreferenceValidated = true
        }
        registry.preferenceCollectionVersion = 1
        writeJson(paths.clients, registry)
      }
      const timestamp = new Date().toISOString()
      const nextPrincipal = publicPrincipal(principal)
      const nextRevision = lastRevision ?? continuity?.lastRevision ?? null
      if (
        continuity &&
        continuity.id === client.id &&
        continuity.name === client.name &&
        continuity.kind === client.kind &&
        continuity.lastRevision === nextRevision &&
        continuity.principal.providerId === nextPrincipal.providerId &&
        continuity.principal.userId === nextPrincipal.userId &&
        continuity.principal.userName === nextPrincipal.userName &&
        continuity.bindingId === client.bindingId &&
        Number.isFinite(Date.parse(continuity.lastSeenAt)) &&
        Date.now() - Date.parse(continuity.lastSeenAt) < CLIENT_TOUCH_INTERVAL_MS
      ) {
        return continuity
      }
      const entry: DashboardClientRegistryEntry = {
        id: client.id,
        name: client.name,
        kind: client.kind,
        firstSeenAt: continuity?.firstSeenAt ?? timestamp,
        lastSeenAt: timestamp,
        lastRevision: nextRevision,
        principal: nextPrincipal,
      }
      const persistedEntry: PersistedDashboardClientRegistryEntry = {
        ...entry,
        bindingId: client.bindingId,
      }
      const retainedClients = registry.clients.filter(
        (candidate) =>
          candidate.id !== client.id &&
          candidate.bindingId !== client.bindingId
      )
      if (!continuity && retainedClients.length >= CLIENT_REGISTRY_LIMIT) {
        throw new DashboardClientCapacityError(
          'Dashboard client registry capacity reached'
        )
      }
      registry.clients = normalizeRegistryClients(
        [...retainedClients, persistedEntry],
        Date.now()
      )
      const rekeysExistingClient =
        Boolean(continuity) && continuity?.id !== client.id
      if (rekeysExistingClient) {
        clientPreferenceCollection ??= readPreferenceCollection(
          paths.clientPreferences,
          false
        )
        if (!clientPreferenceCollectionNormalized) {
          clientPreferenceCollection = normalizePreferenceCollection(
            paths.clientPreferences,
            clientPreferenceCollection
          )
          clientPreferenceCollectionNormalized = true
        }
        if (preferenceValidationScope === 'client' && preferenceContext) {
          preferenceContext.collection = clientPreferenceCollection
          routedPreferenceValidated = true
        }
      }
      if (preferenceValidationScope && !routedPreferenceValidated) {
        readPreferenceCollection(
          preferenceValidationScope === 'account'
            ? paths.accountPreferences
            : paths.clientPreferences,
          false
        )
      }
      writeJson(paths.clients, registry)
      if (continuity && continuity.id !== client.id) {
        clientPreferenceCollection = reconcileClientPreferences(
          registry,
          false,
          clientPreferenceCollection
        )
        if (preferenceValidationScope === 'client' && preferenceContext) {
          preferenceContext.collection = clientPreferenceCollection
        }
        remapDisplayProfileClient(continuity.id, client.id)
      }
      return entry
    },
    listClients(): DashboardClientRegistryEntry[] {
      return normalizeRegistryClients(readRegistry().clients, Date.now(), true)
        .map(({ bindingId: _bindingId, ...client }) => client)
    },
    forgetClient(clientId: string, requestingClient: BoundDashboardProfileClient): boolean {
      const registry = readRegistry()
      const ownedClient = registry.clients.find(
        (entry) =>
          entry.id === clientId &&
          requestingClient.id === clientId &&
          entry.bindingId === requestingClient.bindingId
      )
      if (!ownedClient) {
        return false
      }
      const preferences = readPreferenceCollection(paths.clientPreferences)
      const previousLength = registry.clients.length
      registry.clients = registry.clients.filter((entry) => entry.id !== clientId)
      preferences.records = Object.fromEntries(
        Object.entries(preferences.records).filter(
          ([key, document]) =>
            key !== `client-binding:${ownedClient.bindingId}` &&
            key !== `client:${clientId}` &&
            !key.endsWith(`|client:${clientId}`) &&
            document.clientId !== clientId
        )
      )
      writeJson(paths.clients, registry)
      writeJson(paths.clientPreferences, preferences)
      remapDisplayProfileClient(clientId, null)
      return registry.clients.length !== previousLength
    },
  }
}

type ViteDashboardProfileStore = ReturnType<typeof createViteDashboardProfileStore>

function getHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

function readCookieValues(
  value: string | undefined,
  cookieName: string
): string[] {
  return [
    ...new Set(
      (value ?? '')
        .split(';')
        .map((entry) => entry.trim())
        .flatMap((entry) => {
          const separator = entry.indexOf('=')
          return separator > 0 &&
            entry.slice(0, separator).trim() === cookieName
            ? [entry.slice(separator + 1).trim()]
            : []
        })
    ),
  ]
}

function normalizeIngressPath(value: string | undefined): string {
  const normalized = (value ?? '').trim().replace(/\/+$/, '')
  let decoded = ''
  try {
    decoded = decodeURIComponent(normalized)
  } catch {
    return ''
  }
  if (
    !normalized ||
    normalized === '/' ||
    !normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    !/^\/[A-Za-z0-9._~!$&'()*+,=:@%/-]+$/.test(normalized) ||
    decoded.startsWith('//') ||
    !/^\/[A-Za-z0-9._~!$&'()*+,=:@%/-]+$/.test(decoded) ||
    normalized.includes('..') ||
    decoded.includes('..') ||
    decoded.includes('\\')
  ) {
    return ''
  }
  return normalized
}

function requestUsesHttps(req: IncomingMessage): boolean {
  return (
    (getHeader(req, 'X-Forwarded-Proto') ?? '')
      .split(',')[0]
      ?.trim()
      .toLowerCase() === 'https'
  )
}

function readClientBindingBootstraps(
  filePath: string,
  now: number
): ClientBindingBootstrapRecord[] {
  const persisted = readJson<unknown>(
    filePath,
    null,
    MAX_CLIENT_BINDING_BOOTSTRAP_BYTES
  )
  const candidates =
    persisted &&
    typeof persisted === 'object' &&
    !Array.isArray(persisted) &&
    (persisted as Partial<ClientBindingBootstrapCollection>).contractVersion ===
      DASHBOARD_PROFILE_CONTRACT_VERSION &&
    Array.isArray((persisted as Partial<ClientBindingBootstrapCollection>).records)
      ? (persisted as ClientBindingBootstrapCollection).records
      : []
  return candidates
    .filter(
      (candidate): candidate is ClientBindingBootstrapRecord =>
        Boolean(
          candidate &&
            typeof candidate.key === 'string' &&
            CLIENT_BINDING_PATTERN.test(candidate.key) &&
            typeof candidate.bindingId === 'string' &&
            CLIENT_BINDING_PATTERN.test(candidate.bindingId) &&
            Number.isFinite(candidate.expiresAt) &&
            candidate.expiresAt > now
        )
    )
    .sort((left, right) => left.expiresAt - right.expiresAt)
    .slice(-CLIENT_BINDING_BOOTSTRAP_LIMIT)
}

function resolvePersistedClientBinding(
  filePath: string,
  bootstrapKey: string,
  now: number
): string {
  const records = readClientBindingBootstraps(filePath, now)
  const bindingId =
    records.find((candidate) => candidate.key === bootstrapKey)?.bindingId ??
    randomBytes(32).toString('hex')
  const nextRecords = [
    ...records.filter((candidate) => candidate.key !== bootstrapKey),
    {
      key: bootstrapKey,
      bindingId,
      expiresAt: now + CLIENT_BINDING_BOOTSTRAP_TTL_MS,
    },
  ].slice(-CLIENT_BINDING_BOOTSTRAP_LIMIT)
  writeJson(filePath, {
    contractVersion: DASHBOARD_PROFILE_CONTRACT_VERSION,
    records: nextRecords,
  } satisfies ClientBindingBootstrapCollection)
  return bindingId
}

function resolveClientBinding(
  req: IncomingMessage,
  res: ServerResponse,
  principal: ViteDashboardProfilePrincipal,
  clientId: string,
  store: ViteDashboardProfileStore,
  cookieNames: InstallationCookieNames
): string {
  const currentCookieBindings = readCookieValues(
    getHeader(req, 'Cookie'),
    cookieNames.currentName
  ).filter((candidate) => CLIENT_BINDING_PATTERN.test(candidate))
  const legacyCookieBindings = cookieNames.scoped
    ? readCookieValues(
        getHeader(req, 'Cookie'),
        cookieNames.legacyName
      ).filter((candidate) => CLIENT_BINDING_PATTERN.test(candidate))
    : currentCookieBindings
  const cookieBindings = [
    ...currentCookieBindings,
    ...legacyCookieBindings.filter(
      (candidate) => !currentCookieBindings.includes(candidate)
    ),
  ]
  const now = Date.now()
  const remoteAddress =
    (getHeader(req, 'X-Forwarded-For') ?? '').split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    ''
  const userAgent = (getHeader(req, 'User-Agent') ?? '').slice(0, 512)
  const bootstrapKey = createHash('sha256')
    .update(
      JSON.stringify([
        principal.sessionId,
        clientId,
        remoteAddress,
        userAgent,
      ])
    )
    .digest('hex')
  const registered = store.resolveRegisteredClientBinding(
    clientId,
    cookieBindings
  )
  if (registered.bindingId) {
    setClientBindingCookie(req, res, registered.bindingId, cookieNames)
    return registered.bindingId
  }
  if (registered.clientExists) {
    const concurrentBootstrap = readClientBindingBootstraps(
      store.getPaths().clientBindingBootstrap,
      now
    ).find(
      (record) =>
        record.key === bootstrapKey &&
        record.bindingId === registered.expectedBindingId
    )
    if (concurrentBootstrap) {
      setClientBindingCookie(
        req,
        res,
        concurrentBootstrap.bindingId,
        cookieNames
      )
      return concurrentBootstrap.bindingId
    }
    // Do not overwrite a registered browser binding because a duplicate,
    // stale, or malformed parent-path cookie was presented.
    return currentCookieBindings[0] ?? randomBytes(32).toString('hex')
  }
  if (currentCookieBindings.length > 0) {
    setClientBindingCookie(
      req,
      res,
      currentCookieBindings[0],
      cookieNames
    )
    return currentCookieBindings[0]
  }

  const bindingId = resolvePersistedClientBinding(
    store.getPaths().clientBindingBootstrap,
    bootstrapKey,
    now
  )

  setClientBindingCookie(req, res, bindingId, cookieNames)
  return bindingId
}

function setClientBindingCookie(
  req: IncomingMessage,
  res: ServerResponse,
  bindingId: string,
  cookieNames: InstallationCookieNames
): void {
  const ingressPath = normalizeIngressPath(getHeader(req, 'X-Ingress-Path'))
  const attributes = [
    `${cookieNames.currentName}=${bindingId}`,
    `Path=${ingressPath || '/'}`,
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${CLIENT_BINDING_MAX_AGE_SECONDS}`,
  ]
  if (requestUsesHttps(req)) {
    attributes.push('Secure')
  }
  res.setHeader('Set-Cookie', attributes.join('; '))
}

function decodeHeader(value: string | undefined): string {
  if (!value) {
    return ''
  }
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function readClient(
  req: IncomingMessage,
  res: ServerResponse,
  principal: ViteDashboardProfilePrincipal,
  store: ViteDashboardProfileStore,
  cookieNames: InstallationCookieNames,
  required: boolean
): BoundDashboardProfileClient | null {
  const id = getHeader(req, DASHBOARD_PROFILE_HEADERS.clientId)
  if (!id || !/^(?!(?:__proto__|constructor|prototype)$)[A-Za-z0-9_-]{8,128}$/.test(id) || id.includes('..')) {
    return required ? null : null
  }
  const kindValue = getHeader(req, DASHBOARD_PROFILE_HEADERS.clientKind)
  const kind: DashboardClientKind =
    kindValue === 'desktop' ||
    kindValue === 'phone' ||
    kindValue === 'tablet' ||
    kindValue === 'wall_panel'
      ? kindValue
      : 'unknown'
  return {
    id,
    name:
      decodeHeader(getHeader(req, DASHBOARD_PROFILE_HEADERS.clientName))
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 120) || 'Navet dashboard',
    kind,
    bindingId: resolveClientBinding(
      req,
      res,
      principal,
      id,
      store,
      cookieNames
    ),
  }
}

function createAuthor(
  principal: ViteDashboardProfilePrincipal,
  client: DashboardProfileClient
): DashboardProfileAuthor {
  return {
    ...client,
    ...publicPrincipal(principal),
  }
}

function parseRevisionHeader(req: IncomingMessage): number | null {
  const value = getHeader(req, DASHBOARD_PROFILE_HEADERS.baseRevision)
  if (!value || !/^\d+$/.test(value)) {
    return null
  }
  const revision = Number.parseInt(value, 10)
  return Number.isSafeInteger(revision) ? revision : null
}

function writePrecondition(
  req: IncomingMessage,
  store: ViteDashboardProfileStore
): 'satisfied' | 'failed' | 'required' {
  const state = store.getState()
  const rawBaseRevision = getHeader(req, DASHBOARD_PROFILE_HEADERS.baseRevision)
  const baseRevision = parseRevisionHeader(req)
  if (rawBaseRevision !== undefined) {
    return baseRevision !== null && baseRevision === state.revision
      ? 'satisfied'
      : 'failed'
  }
  const ifMatch = getHeader(req, 'If-Match')
  if (ifMatch) {
    return ifMatch === store.getProfileMetadata().etag ? 'satisfied' : 'failed'
  }
  const ifUnmodifiedSince = getHeader(req, 'If-Unmodified-Since')
  if (ifUnmodifiedSince) {
    return ifUnmodifiedSince === store.getProfileMetadata().lastModified
      ? 'satisfied'
      : 'failed'
  }
  return state.revision === 0 ? 'satisfied' : 'required'
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function sendNoContent(res: ServerResponse): void {
  res.statusCode = 204
  res.setHeader('Cache-Control', 'no-store')
  res.end()
}

function sendClientCapacityUnavailable(res: ServerResponse): void {
  res.setHeader(
    DASHBOARD_PROFILE_HEADERS.errorCode,
    DASHBOARD_PROFILE_ERROR_CODES.clientCapacityReached
  )
  res.setHeader('Retry-After', '60')
  sendJson(res, 503, {
    error:
      'Dashboard client capacity is currently full; existing clients remain protected while Navet waits for an inactive slot',
  })
}

function sendProfileStorageUnavailable(res: ServerResponse): void {
  res.setHeader(
    DASHBOARD_PROFILE_HEADERS.errorCode,
    DASHBOARD_PROFILE_ERROR_CODES.profileStorageUnavailable
  )
  res.setHeader('Retry-After', '60')
  sendJson(res, 503, { error: 'Dashboard profile storage is unavailable' })
}

function applyWorkspaceHeaders(
  res: ServerResponse,
  store: ViteDashboardProfileStore
): void {
  const workspace = store.getWorkspace()
  res.setHeader(
    DASHBOARD_PROFILE_HEADERS.contractVersion,
    String(DASHBOARD_PROFILE_CONTRACT_VERSION)
  )
  res.setHeader(
    DASHBOARD_PROFILE_HEADERS.installationId,
    workspace.installationId
  )
  res.setHeader(DASHBOARD_PROFILE_HEADERS.workspaceId, workspace.workspaceId)
  res.setHeader(DASHBOARD_PROFILE_HEADERS.profileId, DASHBOARD_PROFILE_ID)
  res.setHeader('X-Navet-Workspace-Created-At', workspace.createdAt)
}

function applyStoreHeaders(res: ServerResponse, store: ViteDashboardProfileStore): void {
  applyWorkspaceHeaders(res, store)
  const state = store.getState()
  const recovery = store.getRecovery()
  const validators = store.getProfileMetadata()
  res.setHeader(DASHBOARD_PROFILE_HEADERS.generation, state.generation)
  res.setHeader(DASHBOARD_PROFILE_HEADERS.revision, String(state.revision))
  res.setHeader(DASHBOARD_PROFILE_HEADERS.recovery, recovery.status)
  res.setHeader('ETag', validators.etag)
  res.setHeader('Last-Modified', validators.lastModified)
  if (recovery.resetRevision !== null) {
    res.setHeader(DASHBOARD_PROFILE_HEADERS.resetRevision, String(recovery.resetRevision))
  }
  if (recovery.latestRecoverableRevision !== null) {
    res.setHeader(
      'X-Navet-Latest-Recoverable-Revision',
      String(recovery.latestRecoverableRevision)
    )
  }
  if (state.metadata) {
    res.setHeader(
      DASHBOARD_PROFILE_HEADERS.author,
      encodeURIComponent(JSON.stringify(state.metadata.author))
    )
    res.setHeader(
      DASHBOARD_PROFILE_HEADERS.changedPaths,
      encodeURIComponent(JSON.stringify(state.metadata.changedPaths))
    )
    res.setHeader('X-Navet-Profile-Change-Kind', state.metadata.kind)
    res.setHeader('X-Navet-Profile-Updated-At', state.metadata.updatedAt)
    if (state.metadata.restoredFromRevision !== undefined) {
      res.setHeader(
        'X-Navet-Restored-From-Revision',
        String(state.metadata.restoredFromRevision)
      )
    }
  }
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > maxBytes) {
      throw new Error('Request body is too large')
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function normalizedProfilePath(req: IncomingMessage): string {
  const rawUrl = (req.url ?? '/').split('?')[0].replace(/\/+$/, '') || '/'
  if (rawUrl.startsWith('/__navet_profile__')) {
    return rawUrl.slice('/__navet_profile__'.length) || '/'
  }
  return rawUrl
}

function sendPrecondition(
  req: IncomingMessage,
  res: ServerResponse,
  store: ViteDashboardProfileStore
): boolean {
  const result = writePrecondition(req, store)
  if (result === 'satisfied') {
    return false
  }
  applyStoreHeaders(res, store)
  sendJson(
    res,
    result === 'failed' ? 412 : 428,
    result === 'failed'
      ? { error: 'Dashboard profile changed before save', revision: store.getState().revision }
      : { error: 'A base revision or current ETag is required', revision: store.getState().revision }
  )
  return true
}

export function createViteDashboardProfileRequestHandler(options: {
  cookieNames?: InstallationCookieNames
  store?: ViteDashboardProfileStore
  profileFilePath?: string
  resolvePrincipal: (
    request: IncomingMessage
  ) => ViteDashboardProfilePrincipal | null | Promise<ViteDashboardProfilePrincipal | null>
}) {
  const tenantStores = new Map<string, ViteDashboardProfileStore>()
  const legacyProfileFilePath =
    options.profileFilePath ??
    path.resolve(process.cwd(), '.cache', 'navet-dashboard-profile.json')
  const resolveTenantStore = (tenantId: string) => {
    const existing = tenantStores.get(tenantId)
    if (existing) {
      return existing
    }

    let useLegacyPath = false
    try {
      const workspace = JSON.parse(
        readFileSync(`${legacyProfileFilePath}.workspace`, 'utf8')
      ) as PersistedDashboardWorkspace
      useLegacyPath = workspace.tenantBinding?.tenantId === tenantId
    } catch {
      // A missing legacy workspace means the first authenticated tenant owns
      // the historical profile path. Other tenants receive isolated files.
      useLegacyPath = tenantStores.size === 0
    }
    const profileFilePath = useLegacyPath
      ? legacyProfileFilePath
      : `${legacyProfileFilePath}.${tenantId}`
    const created = createViteDashboardProfileStore(profileFilePath)
    tenantStores.set(tenantId, created)
    return created
  }
  const cookieNames =
    options.cookieNames ?? {
      currentName: CLIENT_BINDING_COOKIE_NAME,
      legacyName: CLIENT_BINDING_COOKIE_NAME,
      scoped: false,
    }

  const handleRequest = async (
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> => {
    const principal = await options.resolvePrincipal(req)
    if (!principal) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    const store = options.store ?? resolveTenantStore(principal.tenantId)
    const route = normalizedProfilePath(req)
    const method = req.method ?? 'GET'
    if (route === '/workspace/rebind') {
      if (method !== 'POST') {
        res.setHeader('Allow', 'POST')
        sendJson(res, 405, { error: 'Method not allowed' })
        return
      }
      if (!isViteStrictSameOriginMutation(req)) {
        sendJson(res, 403, { error: 'Cross-origin profile mutation is not allowed' })
        return
      }
      const recoveryClient = readClient(
        req,
        res,
        principal,
        store,
        cookieNames,
        false
      )
      if (!recoveryClient || !store.ownsClient(recoveryClient)) {
        res.setHeader(
          DASHBOARD_PROFILE_HEADERS.errorCode,
          DASHBOARD_PROFILE_ERROR_CODES.clientBindingMismatch
        )
        sendJson(res, 403, {
          error: 'This dashboard client cannot recover this workspace',
        })
        return
      }
      const serialized = await readBody(req, MAX_PROFILE_BYTES)
      let profile: unknown = null
      try {
        profile = serialized ? JSON.parse(serialized) : null
      } catch {
        sendJson(res, 400, { error: 'Unable to recover dashboard sync' })
        return
      }
      if (!isValidDashboardProfileData(profile)) {
        sendJson(res, 400, { error: 'Unsupported dashboard profile' })
        return
      }
      const state = store.rebindWorkspace(principal, recoveryClient, profile)
      if (!state) {
        res.setHeader(
          DASHBOARD_PROFILE_HEADERS.errorCode,
          DASHBOARD_PROFILE_ERROR_CODES.clientBindingMismatch
        )
        sendJson(res, 403, {
          error: 'This dashboard client cannot recover this workspace',
        })
        return
      }
      applyStoreHeaders(res, store)
      sendJson(res, 200, {
        ok: true,
        revision: state.revision,
        updatedAt: state.metadata?.updatedAt ?? null,
      })
      return
    }
    if (!store.authorizePrincipal(principal)) {
      res.setHeader(
        DASHBOARD_PROFILE_HEADERS.errorCode,
        DASHBOARD_PROFILE_ERROR_CODES.workspaceTenantMismatch
      )
      sendJson(res, 403, {
        error:
          'This dashboard workspace belongs to a different Home Assistant installation',
      })
      return
    }

    if (method !== 'GET' && !isViteStrictSameOriginMutation(req)) {
      sendJson(res, 403, { error: 'Cross-origin profile mutation is not allowed' })
      return
    }
    const client = readClient(
      req,
      res,
      principal,
      store,
      cookieNames,
      false
    )
    const routedPreferenceMatch = route.match(
      /^\/preferences\/(account|client)$/
    )
    const routedPreferenceScope = routedPreferenceMatch?.[1] as
      | DashboardPreferenceScope
      | undefined
    const requestPreferenceScope =
      routedPreferenceScope &&
      (method === 'GET' || method === 'PUT') &&
      (routedPreferenceScope === 'account'
        ? Boolean(principal.userId)
        : Boolean(client))
        ? routedPreferenceScope
        : undefined
    let requestPreferenceInput:
      | {
          schemaVersion: number
          values: Record<string, unknown>
        }
      | undefined
    if (requestPreferenceScope && method === 'PUT') {
      let input: {
        schemaVersion?: number
        values?: Record<string, unknown>
      }
      try {
        const serialized = await readBody(req, MAX_PREFERENCE_BYTES)
        input = JSON.parse(serialized) as typeof input
      } catch (error) {
        sendJson(
          res,
          error instanceof Error &&
            error.message === 'Request body is too large'
            ? 413
            : 400,
          { error: 'Unable to save preferences' }
        )
        return
      }
      if (
        typeof input.schemaVersion !== 'number' ||
        !Number.isSafeInteger(input.schemaVersion) ||
        input.schemaVersion < 1 ||
        !input.values ||
        typeof input.values !== 'object' ||
        Array.isArray(input.values)
      ) {
        sendJson(res, 400, { error: 'Unsupported preference document' })
        return
      }
      requestPreferenceInput = {
        schemaVersion: input.schemaVersion,
        values: input.values,
      }
    }
    const preferenceContext = requestPreferenceScope
      ? store.createPreferenceRequestContext(requestPreferenceScope)
      : undefined
    const isClientDeleteRequest =
      method === 'DELETE' && /^\/clients\/[^/]+$/.test(route)
    if (
      client &&
      !isClientDeleteRequest &&
      !store.touchClient(
        principal,
        client,
        store.getState().revision,
        preferenceContext
      )
    ) {
      res.setHeader(
        DASHBOARD_PROFILE_HEADERS.errorCode,
        DASHBOARD_PROFILE_ERROR_CODES.clientBindingMismatch
      )
      sendJson(res, 403, {
        error: 'This dashboard client identity belongs to another browser',
      })
      return
    }

    if (route === '/default') {
      if (method === 'GET') {
        applyStoreHeaders(res, store)
        const recovery = store.getRecovery()
        if (recovery.status === 'recoverable' || recovery.status === 'missing') {
          sendJson(res, 409, {
            error: 'The current dashboard profile file is missing',
            recovery,
          })
          return
        }
        const serialized = store.getSerializedProfile()
        if (!serialized) {
          sendNoContent(res)
          return
        }
        const metadata = store.getProfileMetadata()
        if (
          getHeader(req, 'If-None-Match') === metadata.etag ||
          getHeader(req, 'If-Modified-Since') === metadata.lastModified
        ) {
          res.statusCode = 304
          res.setHeader('Cache-Control', 'no-store')
          res.end()
          return
        }
        res.statusCode = 200
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(serialized)
        return
      }

      if (method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
        if (sendPrecondition(req, res, store)) {
          return
        }
        const writeClient = client
        if (!writeClient) {
          sendJson(res, 400, { error: 'A valid dashboard client identity is required' })
          return
        }
        const author = createAuthor(principal, writeClient)
        try {
          if (method === 'DELETE') {
            store.resetProfile(author)
            applyStoreHeaders(res, store)
            sendNoContent(res)
            return
          }
          const serialized = await readBody(req, MAX_PROFILE_BYTES)
          if (!serialized) {
            sendJson(res, 400, { error: 'Missing dashboard profile body' })
            return
          }
          if (method === 'PUT') {
            const profile = JSON.parse(serialized)
            if (!isValidDashboardProfileData(profile)) {
              sendJson(res, 400, { error: 'Unsupported dashboard profile' })
              return
            }
            let changedPaths = ['/']
            const rawPaths = getHeader(req, DASHBOARD_PROFILE_HEADERS.changedPaths)
            if (rawPaths) {
              const parsed = JSON.parse(decodeHeader(rawPaths))
              if (Array.isArray(parsed)) {
                changedPaths = parsed.filter(
                  (entry): entry is string =>
                    typeof entry === 'string' && entry.startsWith('/')
                )
              }
            }
            if (sendPrecondition(req, res, store)) {
              return
            }
            store.saveProfile(profile, { author, changedPaths })
          } else {
            const operations = JSON.parse(serialized) as DashboardProfilePatchOperation[]
            if (sendPrecondition(req, res, store)) {
              return
            }
            store.patchProfile(operations, author)
          }
          applyStoreHeaders(res, store)
          try {
            store.touchClient(principal, writeClient, store.getState().revision)
          } catch {
            // Profile state is already committed; registry freshness is
            // secondary and must not turn success into an apparent failure.
          }
          sendJson(res, 200, {
            ok: true,
            revision: store.getState().revision,
            updatedAt: store.getState().metadata?.updatedAt ?? null,
          })
        } catch (error) {
          if (
            error instanceof DashboardProfileStorageReadError ||
            error instanceof DashboardProfileStorageCapacityError ||
            error instanceof DashboardClientCapacityError ||
            error instanceof DashboardProfileWriteLimitError
          ) {
            throw error
          }
          const message = error instanceof Error ? error.message : ''
          sendJson(res, message === 'Request body is too large' ? 413 : 400, {
            error:
              message === 'Request body is too large'
                ? 'Dashboard profile is too large'
                : 'Unable to save dashboard profile',
          })
        }
        return
      }

      res.setHeader('Allow', 'GET, PUT, PATCH, DELETE')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }

    if (route === '/default/history') {
      if (method !== 'GET') {
        res.setHeader('Allow', 'GET')
        sendJson(res, 405, { error: 'Method not allowed' })
        return
      }
      applyStoreHeaders(res, store)
      sendJson(res, 200, {
        workspace: store.getWorkspace(),
        entries: store.getHistory(),
      })
      return
    }

    const revisionMatch = route.match(/^\/default\/revisions\/(\d+)(\/restore)?$/)
    if (revisionMatch) {
      const revision = Number.parseInt(revisionMatch[1], 10)
      if (revisionMatch[2]) {
        if (method !== 'POST') {
          res.setHeader('Allow', 'POST')
          sendJson(res, 405, { error: 'Method not allowed' })
          return
        }
        if (sendPrecondition(req, res, store)) {
          return
        }
        const writeClient = client
        if (!writeClient) {
          sendJson(res, 400, { error: 'A valid dashboard client identity is required' })
          return
        }
        if (!store.restoreRevision(revision, createAuthor(principal, writeClient))) {
          sendJson(res, 404, { error: 'Recoverable dashboard profile revision not found' })
          return
        }
        applyStoreHeaders(res, store)
        sendJson(res, 200, {
          ok: true,
          revision: store.getState().revision,
          restoredFromRevision: revision,
        })
        return
      }
      if (method !== 'GET') {
        res.setHeader('Allow', 'GET')
        sendJson(res, 405, { error: 'Method not allowed' })
        return
      }
      const entry = store.getRevision(revision)
      if (!entry) {
        sendJson(res, 404, { error: 'Dashboard profile revision not found' })
        return
      }
      applyStoreHeaders(res, store)
      sendJson(res, 200, {
        workspace: store.getWorkspace(),
        metadata: entry.metadata,
        recovery: entry.profile
          ? {
              status: 'active',
              resetRevision: null,
              latestRecoverableRevision: revision,
            }
          : {
              status: 'reset',
              resetRevision: revision,
              latestRecoverableRevision: store.getRecovery().latestRecoverableRevision,
            },
        profile: entry.profile,
      })
      return
    }

    if (route === '/display-profiles/copy') {
      if (method !== 'POST') {
        res.setHeader('Allow', 'POST')
        sendJson(res, 405, { error: 'Method not allowed' })
        return
      }
      if (!client) {
        sendJson(res, 400, { error: 'A valid dashboard client identity is required' })
        return
      }
      try {
        const serialized = await readBody(req, MAX_PREFERENCE_BYTES)
        const input = JSON.parse(serialized) as {
          schemaVersion?: unknown
          settings?: unknown
          targetClientIds?: unknown
        }
        if (
          input.schemaVersion !== 1 ||
          !isRecord(input.settings) ||
          !Array.isArray(input.targetClientIds) ||
          input.targetClientIds.some(
            (entry) => typeof entry !== 'string' || !DISPLAY_PROFILE_ID_PATTERN.test(entry)
          )
        ) {
          sendJson(res, 400, { error: 'Unsupported display settings copy request' })
          return
        }
        const result = store.copyDisplaySettings(
          input.settings,
          input.targetClientIds as string[]
        )
        applyWorkspaceHeaders(res, store)
        sendJson(res, 200, result)
      } catch (error) {
        if (
          error instanceof DashboardProfileStorageReadError ||
          error instanceof DashboardProfileStorageCapacityError
        ) {
          throw error
        }
        sendJson(res, 400, { error: 'Unable to copy display settings' })
      }
      return
    }

    if (route === '/display-profiles') {
      applyWorkspaceHeaders(res, store)
      if (method === 'GET') {
        const document = store.getDisplayProfiles()
        if (!document) {
          sendNoContent(res)
          return
        }
        res.setHeader(
          DASHBOARD_PROFILE_HEADERS.preferenceRevision,
          String(document.revision)
        )
        res.setHeader('ETag', `"navet-display-profiles-${document.revision}"`)
        sendJson(res, 200, document)
        return
      }
      if (method === 'PUT') {
        if (!client) {
          sendJson(res, 400, { error: 'A valid dashboard client identity is required' })
          return
        }
        const current = store.getDisplayProfiles()
        const baseRevision = parseRevisionHeader(req)
        if (baseRevision === null && current) {
          res.setHeader(
            DASHBOARD_PROFILE_HEADERS.preferenceRevision,
            String(current.revision)
          )
          sendJson(res, 428, { error: 'A base display profile revision is required' })
          return
        }
        if (baseRevision !== null && baseRevision !== (current?.revision ?? 0)) {
          res.setHeader(
            DASHBOARD_PROFILE_HEADERS.preferenceRevision,
            String(current?.revision ?? 0)
          )
          sendJson(res, 412, { error: 'Display profiles changed before save' })
          return
        }
        try {
          const serialized = await readBody(req, MAX_DISPLAY_PROFILES_BYTES)
          const input = JSON.parse(serialized) as {
            schemaVersion?: unknown
            values?: unknown
          }
          if (
            !Number.isSafeInteger(input.schemaVersion) ||
            Number(input.schemaVersion) < 1 ||
            !isRecord(input.values)
          ) {
            sendJson(res, 400, { error: 'Unsupported display profile document' })
            return
          }
          const document = store.saveDisplayProfiles(
            Number(input.schemaVersion),
            input.values,
            createAuthor(principal, client)
          )
          res.setHeader(
            DASHBOARD_PROFILE_HEADERS.preferenceRevision,
            String(document.revision)
          )
          res.setHeader('ETag', `"navet-display-profiles-${document.revision}"`)
          sendJson(res, 200, document)
        } catch (error) {
          if (
            error instanceof DashboardProfileStorageReadError ||
            error instanceof DashboardProfileStorageCapacityError
          ) {
            throw error
          }
          sendJson(
            res,
            error instanceof Error && error.message === 'Request body is too large'
              ? 413
              : 400,
            { error: 'Unable to save display profiles' }
          )
        }
        return
      }
      res.setHeader('Allow', 'GET, PUT')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }

    const preferenceMatch = route.match(/^\/preferences\/(account|client)$/)
    if (preferenceMatch) {
      const scope = preferenceMatch[1] as DashboardPreferenceScope
      if (scope === 'account' && !principal.userId) {
        sendJson(res, 403, { error: 'A verified account identity is required' })
        return
      }
      const preferenceClient = client
      if (scope === 'client' && !preferenceClient) {
        sendJson(res, 400, { error: 'A valid dashboard client identity is required' })
        return
      }
      applyWorkspaceHeaders(res, store)
      res.setHeader(
        DASHBOARD_PROFILE_HEADERS.preferenceIdentity,
        encodeURIComponent(
          JSON.stringify({
            principal: publicPrincipal(principal),
            clientId: scope === 'client' ? preferenceClient?.id ?? null : null,
          })
        )
      )
      if (method === 'GET') {
        const document = store.getPreference(
          scope,
          principal,
          preferenceClient ?? undefined,
          preferenceContext
        )
        if (!document) {
          sendNoContent(res)
          return
        }
        res.setHeader(DASHBOARD_PROFILE_HEADERS.preferenceRevision, String(document.revision))
        res.setHeader('ETag', `"navet-preference-${scope}-${document.revision}"`)
        sendJson(res, 200, document)
        return
      }
      if (method === 'PUT') {
        try {
          const current = store.getPreference(
            scope,
            principal,
            preferenceClient ?? undefined,
            preferenceContext
          )
          const baseRevision = parseRevisionHeader(req)
          if (baseRevision === null && current) {
            res.setHeader(
              DASHBOARD_PROFILE_HEADERS.preferenceRevision,
              String(current.revision)
            )
            sendJson(res, 428, { error: 'A base preference revision is required' })
            return
          }
          if (baseRevision !== null && baseRevision !== (current?.revision ?? 0)) {
            res.setHeader(
              DASHBOARD_PROFILE_HEADERS.preferenceRevision,
              String(current?.revision ?? 0)
            )
            sendJson(res, 412, { error: 'Preferences changed before save' })
            return
          }
          const input = requestPreferenceInput
          if (!input) {
            sendJson(res, 400, { error: 'Unable to save preferences' })
            return
          }
          const document = store.savePreference(
            scope,
            principal,
            input.schemaVersion,
            input.values,
            preferenceClient ?? undefined,
            preferenceContext
          )
          res.setHeader(
            DASHBOARD_PROFILE_HEADERS.preferenceRevision,
            String(document.revision)
          )
          res.setHeader('ETag', `"navet-preference-${scope}-${document.revision}"`)
          sendJson(res, 200, document)
        } catch (error) {
          if (
            error instanceof DashboardProfileStorageReadError ||
            error instanceof DashboardProfileStorageCapacityError ||
            error instanceof DashboardClientCapacityError ||
            error instanceof DashboardProfileWriteLimitError
          ) {
            throw error
          }
          sendJson(
            res,
            error instanceof Error && error.message === 'Request body is too large'
              ? 413
              : 400,
            { error: 'Unable to save preferences' }
          )
        }
        return
      }
      res.setHeader('Allow', 'GET, PUT')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }

    if (route === '/clients') {
      if (method !== 'GET' && method !== 'PUT') {
        res.setHeader('Allow', 'GET, PUT')
        sendJson(res, 405, { error: 'Method not allowed' })
        return
      }
      const registryClient = client
      if (method === 'PUT' && !registryClient) {
        sendJson(res, 400, { error: 'A valid dashboard client identity is required' })
        return
      }
      if (registryClient) {
        store.touchClient(principal, registryClient)
      }
      sendJson(res, 200, {
        workspace: store.getWorkspace(),
        clients: store.listClients(),
      })
      return
    }

    const clientMatch = route.match(/^\/clients\/([^/]+)$/)
    if (clientMatch) {
      if (method !== 'DELETE') {
        res.setHeader('Allow', 'DELETE')
        sendJson(res, 405, { error: 'Method not allowed' })
        return
      }
      const clientId = decodeURIComponent(clientMatch[1])
      if (!/^(?!(?:__proto__|constructor|prototype)$)[A-Za-z0-9_-]{8,128}$/.test(clientId)) {
        sendJson(res, 400, { error: 'Invalid dashboard client identity' })
        return
      }
      if (!client || !store.forgetClient(clientId, client)) {
        res.setHeader(
          DASHBOARD_PROFILE_HEADERS.errorCode,
          DASHBOARD_PROFILE_ERROR_CODES.clientBindingMismatch
        )
        sendJson(res, 403, {
          error: 'This dashboard client identity belongs to another browser',
        })
        return
      }
      sendJson(res, 200, {
        ok: true,
        forgotten: true,
        credentialsRevoked: false,
      })
      return
    }

    sendJson(res, 404, { error: 'Dashboard profile resource not found' })
  }

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      await handleRequest(req, res)
    } catch (error) {
      if (error instanceof DashboardClientCapacityError) {
        sendClientCapacityUnavailable(res)
        return
      }
      if (
        error instanceof DashboardProfileStorageReadError ||
        error instanceof DashboardProfileStorageCapacityError
      ) {
        sendProfileStorageUnavailable(res)
        return
      }
      if (error instanceof DashboardProfileWriteLimitError) {
        sendJson(res, 413, { error: 'Dashboard profile is too large' })
        return
      }
      throw error
    }
  }
}
