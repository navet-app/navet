import choreDurableStorage from './chore-durable-storage.js';
import recordSafety from '../shared/record-safety.js';
import boundedFile from '../shared/bounded-file.js';
import choreCalendarPolicy from './chore-calendar-policy.js';
import choreOccurrencePolicy from './chore-occurrence-policy.js';
import choreProgressPolicy from './chore-progress-policy.js';
import choreRecurrencePolicy from './chore-recurrence-policy.js';
import fs from 'fs';
import hashCrypto from 'crypto';
import authStore from './auth-store.js';
import homeyStore from './homey-store.js';
import openhabStore from './openhab-store.js';
import providerSessionStore from './provider-session-store.js';

const CONTRACT_VERSION = 1;
const SCHEMA_VERSION = 2;
const WORKSPACE_PATH = '/data/navet-dashboard-workspace.json';
const CHORE_WORKSPACE_PATH = '/data/navet-chore-workspace.json';
const CHORE_LAST_GOOD_WORKSPACE_PATH = '/data/navet-chore-workspace.last-good.json';
const CHORE_JOURNAL_PATH = '/data/navet-chore-command-journal.json';
const CHORE_EVENT_HISTORY_PATH = '/data/navet-chore-events.json';
const CHORE_MANAGEMENT_SECURITY_PATH = '/data/navet-chore-management.json';
const MAX_WORKSPACE_BYTES = 128 * 1024;
const MAX_CHORE_WORKSPACE_BYTES = 2 * 1024 * 1024;
const MAX_CHORE_JOURNAL_BYTES = 512 * 1024;
const MAX_CHORE_EVENT_HISTORY_BYTES = 64 * 1024 * 1024;
const MAX_CHORE_MANAGEMENT_SECURITY_BYTES = 16 * 1024;
const MAX_ACTIVITY_ITEMS = 5000;
const MAX_OUTBOX_ITEMS = 5000;
const MAX_COMMAND_JOURNAL_ITEMS = 500;
const DEFAULT_HISTORY_RETENTION = { maxAgeDays: 730, maxEvents: 50000 };
const TENANT_ID_PATTERN = /^hat_[a-f0-9]{64}$/;
const MANAGEMENT_PIN_PATTERN = /^\d{4,8}$/;
const MANAGEMENT_SESSION_DURATION_MS = 30 * 60 * 1000;
const CHORE_AUTOMATION_EVENT_TYPES = [
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
];

const HEADERS = {
  revision: 'X-Navet-Chore-Revision',
  baseRevision: 'X-Navet-Base-Revision',
  managementSession: 'X-Navet-Chore-Management-Session',
};

let managementSessions = [];
let failedManagementAttempts = 0;
let managementBlockedUntil = 0;
let lastSchedulerRunAt = null;
let lastDeliveryError = null;

let fsModule = fs;
function resolveChorePrincipal(r, options) {
  const principal = authStore.resolveAuthenticatedPrincipal(r, options);
  if (principal) return principal;
  const homey = homeyStore.resolveHomeySession(r);
  if (homey) return { providerId: 'homey', sessionId: homey.cookieId };
  const openhab = openhabStore.resolveOpenHABSession(r);
  return openhab ? { providerId: 'openhab', sessionId: openhab.cookieId } : null;
}

let principalResolver = resolveChorePrincipal;

function setChoreStoreFsForTests(mockFs) {
  fsModule = mockFs;
}

function setChoreStorePrincipalResolverForTests(resolver) {
  principalResolver = resolver;
}

function resetChoreStoreForTests() {
  fsModule = fs;
  managementSessions = [];
  failedManagementAttempts = 0;
  managementBlockedUntil = 0;
  lastSchedulerRunAt = null;
  lastDeliveryError = null;
  principalResolver = resolveChorePrincipal;
}

function nowIso() {
  return new Date().toISOString();
}

function createOpaqueId(prefix) {
  const timestamp = Date.now().toString(36);
  let random = '';
  for (let index = 0; index < 4; index += 1) {
    random += Math.random().toString(36).slice(2, 10);
  }
  return `${prefix}_${timestamp}${random}`.slice(0, 52);
}

function getHeader(r, name) {
  const headers = (r && r.headersIn) || {};
  if (headers[name] !== undefined) {
    return headers[name];
  }
  const lowerName = name.toLowerCase();
  for (const key in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, key) && key.toLowerCase() === lowerName) {
      return headers[key];
    }
  }
  return '';
}

function getSharedManagementSessions() {
  if (
    typeof ngx !== 'undefined' &&
    ngx &&
    ngx.shared &&
    ngx.shared.navet_chore_management_sessions
  ) {
    return ngx.shared.navet_chore_management_sessions;
  }
  return null;
}

function clearManagementSession(tenantId) {
  const sharedSessions = getSharedManagementSessions();
  if (sharedSessions) {
    sharedSessions.delete(tenantId);
    return;
  }
  managementSessions = managementSessions.filter(function (session) {
    return session.tenantId !== tenantId;
  });
}

function sendJson(r, statusCode, payload) {
  r.headersOut['Cache-Control'] = 'no-store';
  r.headersOut['Content-Type'] = 'application/json; charset=utf-8';
  r.return(statusCode, JSON.stringify(payload));
}

function parseQueryArgs(value) {
  const result = Object.create(null);
  if (typeof value !== 'string' || value.length === 0) return result;
  const pairs = value.split('&');
  for (let index = 0; index < pairs.length; index += 1) {
    const separator = pairs[index].indexOf('=');
    const rawKey = separator === -1 ? pairs[index] : pairs[index].slice(0, separator);
    const rawValue = separator === -1 ? '' : pairs[index].slice(separator + 1);
    try {
      result[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.replace(/\+/g, ' '));
    } catch (_error) {
      result[rawKey] = rawValue;
    }
  }
  return result;
}

function readJson(path, fallback, maxBytes) {
  try {
    return JSON.parse(boundedFile.readBoundedText(fsModule, path, maxBytes, function () {
      return new Error('Chore storage exceeds its safe read limit');
    }));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

function writeJson(path, value, maxBytes) {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    const error = new Error('Chore workspace is too large');
    error.code = 'NAVET_CHORE_WRITE_LIMIT';
    throw error;
  }
  const temporaryPath = path + '.tmp';
  fsModule.writeFileSync(temporaryPath, serialized, 'utf8');
  fsModule.renameSync(temporaryPath, path);
}

function deleteFile(path) {
  try {
    fsModule.unlinkSync(path);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isParticipantPausedAt(participant, timestamp) {
  return Boolean(participant.pausedAt && Date.parse(timestamp) >= Date.parse(participant.pausedAt) &&
    (!participant.resumeAt || Date.parse(timestamp) < Date.parse(participant.resumeAt)));
}

function occurrenceHasActiveAssignee(occurrence, data, timestamp) {
  return occurrence.assigneeIds.some(function (id) {
    const participant = data.participantsById[id];
    return isRecord(participant) && !isParticipantPausedAt(participant, timestamp) &&
      !isParticipantPausedAt(participant, occurrence.scheduledAt);
  });
}

function isValidTenantBinding(value) {
  return (
    isRecord(value) &&
    value.providerId === 'home_assistant' &&
    typeof value.tenantId === 'string' &&
    TENANT_ID_PATTERN.test(value.tenantId) &&
    typeof value.enrolledAt === 'string' &&
    Number.isFinite(Date.parse(value.enrolledAt))
  );
}

function isValidWorkspace(value) {
  return (
    isRecord(value) &&
    value.contractVersion === CONTRACT_VERSION &&
    typeof value.installationId === 'string' &&
    value.installationId.length > 4 &&
    typeof value.workspaceId === 'string' &&
    value.workspaceId.length > 4 &&
    value.defaultProfileId === 'default' &&
    typeof value.createdAt === 'string' &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    (value.tenantBinding === undefined || isValidTenantBinding(value.tenantBinding))
  );
}

function readOrCreateWorkspace() {
  const missing = {};
  const current = readJson(WORKSPACE_PATH, missing, MAX_WORKSPACE_BYTES);
  if (current !== missing) {
    if (!isValidWorkspace(current)) {
      throw new Error('Dashboard workspace is invalid');
    }
    return current;
  }
  const workspace = {
    contractVersion: CONTRACT_VERSION,
    installationId: createOpaqueId('nvi'),
    workspaceId: createOpaqueId('nvw'),
    defaultProfileId: 'default',
    createdAt: nowIso(),
  };
  writeJson(WORKSPACE_PATH, workspace, MAX_WORKSPACE_BYTES);
  return workspace;
}

function authorizeWorkspacePrincipal(principal) {
  if (!principal || typeof principal.sessionId !== 'string' || !principal.sessionId) return null;
  // Chores belong to this persisted Navet workspace, not a provider URL.
  // Retain the legacy dashboard tenant binding for dashboard compatibility.
  return readOrCreateWorkspace();
}

function isValidActivity(value) {
  return (
    isRecord(value) &&
    typeof value.commandId === 'string' &&
    value.commandId.length > 0 &&
    value.commandId.length <= 200 &&
    (value.occurrenceId === undefined || typeof value.occurrenceId === 'string') &&
    (value.definitionId === undefined || typeof value.definitionId === 'string') &&
    (value.participantId === undefined || typeof value.participantId === 'string') &&
    (value.actorParticipantId === undefined || typeof value.actorParticipantId === 'string') &&
    (value.reason === undefined || typeof value.reason === 'string') &&
    (value.pointsDelta === undefined ||
      (Number.isSafeInteger(value.pointsDelta) && Math.abs(value.pointsDelta) <= 10000)) &&
    typeof value.type === 'string' &&
    typeof value.timestamp === 'string' &&
    Number.isFinite(Date.parse(value.timestamp))
  );
}

function isValidOutboxItem(value) {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.activityId === 'string' &&
    value.activityId.length > 0 &&
    typeof value.eventType === 'string' &&
    ['pending', 'delivered', 'failed'].indexOf(value.status) !== -1 &&
    Number.isSafeInteger(value.attempts) &&
    value.attempts >= 0 &&
    typeof value.createdAt === 'string' &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    typeof value.nextAttemptAt === 'string' &&
    Number.isFinite(Date.parse(value.nextAttemptAt))
  );
}

function isValidChoreWorkspaceDataVersion(value, schemaVersion) {
  if (
    !isRecord(value) ||
    value.schemaVersion !== schemaVersion ||
    !isRecord(value.participantsById) ||
    !isRecord(value.definitionsById) ||
    !isRecord(value.occurrencesById) ||
    !Array.isArray(value.activity) ||
    value.activity.length > MAX_ACTIVITY_ITEMS ||
    (schemaVersion === SCHEMA_VERSION &&
      (!Array.isArray(value.outbox) || value.outbox.length > MAX_OUTBOX_ITEMS)) ||
    (value.historyRetention !== undefined && !isValidHistoryRetention(value.historyRetention)) ||
    (value.experience !== undefined && !isValidChoreExperience(value.experience))
  ) {
    return false;
  }
  const occurrenceIds = Object.keys(value.occurrencesById);
  for (let occurrenceIndex = 0; occurrenceIndex < occurrenceIds.length; occurrenceIndex += 1) {
    const occurrence = value.occurrencesById[occurrenceIds[occurrenceIndex]];
    if (occurrence && occurrence.supersededAt !== undefined && (typeof occurrence.supersededAt !== 'string' || !Number.isFinite(choreRecurrencePolicy.parseChoreInstant(occurrence.supersededAt)))) return false;
  }
  for (let index = 0; index < value.activity.length; index += 1) {
    if (!isValidActivity(value.activity[index])) {
      return false;
    }
  }
  if (schemaVersion === SCHEMA_VERSION) {
    for (let index = 0; index < value.outbox.length; index += 1) {
      if (!isValidOutboxItem(value.outbox[index])) return false;
    }
  }
  return true;
}

function isValidChoreWorkspaceData(value) {
  return isValidChoreWorkspaceDataVersion(value, SCHEMA_VERSION);
}

function migrateChoreWorkspaceData(value) {
  recordSafety.assertSafeRecord(value);
  if (isRecord(value) && value.schemaVersion === SCHEMA_VERSION &&
      isRecord(value.experience) && value.experience.version === 1) {
    const oldExperience = value.experience;
    const balances = Object.assign({}, oldExperience.earnedPointsByParticipant || {});
    if (oldExperience.gamificationMode !== 'off' && Object.keys(balances).length === 0 &&
      isRecord(value.occurrencesById)) {
      Object.keys(value.occurrencesById).forEach(function (occurrenceId) {
        const occurrence = value.occurrencesById[occurrenceId];
        if (!isRecord(occurrence) || occurrence.status !== 'done' ||
          typeof occurrence.completedBy !== 'string') return;
        const metadata = oldExperience.presentationByDefinitionId[occurrence.definitionId];
        recordSafety.setOwnRecordValue(balances, occurrence.completedBy, (balances[occurrence.completedBy] || 0) +
          (isRecord(metadata) && Number.isSafeInteger(metadata.points) ? metadata.points : 0));
      });
    }
    const pointTransactions = Object.keys(balances).map(function (participantId) {
      return { id: 'opening:' + participantId, participantId,
        pointsDelta: balances[participantId], kind: 'opening_balance',
        timestamp: '1970-01-01T00:00:00.000Z' };
    });
    value = Object.assign({}, value, { experience: Object.assign({}, createEmptyChoreExperience(),
      oldExperience, { version: 2, earnedPointsByParticipant: balances, pointTransactions }) });
  }
  if (isValidChoreWorkspaceData(value)) {
    if (value.historyRetention && value.experience) return value;
    return Object.assign({}, value, {
      historyRetention: value.historyRetention || Object.assign({}, DEFAULT_HISTORY_RETENTION),
      experience: value.experience || createEmptyChoreExperience(),
    });
  }
  if (isValidChoreWorkspaceDataVersion(value, 1)) {
    return Object.assign({}, value, {
      schemaVersion: SCHEMA_VERSION,
      outbox: [],
      historyRetention: Object.assign({}, DEFAULT_HISTORY_RETENTION),
      experience: createEmptyChoreExperience(),
    });
  }
  return null;
}

function isValidHistoryRetention(value) {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.maxAgeDays) &&
    value.maxAgeDays >= 30 &&
    value.maxAgeDays <= 3650 &&
    Number.isSafeInteger(value.maxEvents) &&
    value.maxEvents >= 1000 &&
    value.maxEvents <= 100000
  );
}

function createEmptyChoreExperience() {
  return {
    version: 2,
    gamificationMode: 'off',
    presentationByDefinitionId: {},
    missionsById: {},
    rewardGoalsById: {},
    earnedPointsByParticipant: {},
    householdBonusPoints: 0,
    awardedMissionIds: [],
    rewardRequestsById: {},
    pointTransactions: [],
    badgesById: {},
    achievementsById: {},
    progressAwards: [],
  };
}

function isOptionalBoundedInteger(value, maximum) {
  return value === undefined || (Number.isSafeInteger(value) && value >= 0 && value <= maximum);
}

function isOptionalSignedBoundedInteger(value, maximum) {
  return value === undefined || (Number.isSafeInteger(value) && Math.abs(value) <= maximum);
}

function isValidChoreExperience(value) {
  if (
    !isRecord(value) ||
    value.version !== 2 ||
    (value.setupStartedAt !== undefined &&
      (typeof value.setupStartedAt !== 'string' || !Number.isFinite(Date.parse(value.setupStartedAt)))) ||
    (value.setupCompletedAt !== undefined &&
      (typeof value.setupCompletedAt !== 'string' || !Number.isFinite(Date.parse(value.setupCompletedAt)))) ||
    ['off', 'light', 'family', 'adventure'].indexOf(value.gamificationMode) === -1 ||
    !isRecord(value.presentationByDefinitionId) ||
    !isRecord(value.missionsById) ||
    !isRecord(value.rewardGoalsById) ||
    !isRecord(value.rewardRequestsById) ||
    !Array.isArray(value.pointTransactions) ||
    !isRecord(value.badgesById) ||
    !isRecord(value.achievementsById) ||
    !Array.isArray(value.progressAwards) ||
    (value.earnedPointsByParticipant !== undefined && !isRecord(value.earnedPointsByParticipant)) ||
    !isOptionalBoundedInteger(value.householdBonusPoints, 1000000000) ||
    (value.awardedMissionIds !== undefined &&
      (!Array.isArray(value.awardedMissionIds) ||
        !value.awardedMissionIds.every(function (id) { return typeof id === 'string' && id.length > 0; })))
  ) {
    return false;
  }
  for (const definitionId in value.presentationByDefinitionId) {
    if (!Object.prototype.hasOwnProperty.call(value.presentationByDefinitionId, definitionId)) continue;
    const metadata = value.presentationByDefinitionId[definitionId];
    if (
      !isRecord(metadata) ||
      !isOptionalBoundedInteger(metadata.estimatedMinutes, 1440) ||
      !isOptionalBoundedInteger(metadata.points, 10000) ||
      (metadata.childTitle !== undefined && typeof metadata.childTitle !== 'string') ||
      (metadata.category !== undefined && typeof metadata.category !== 'string') ||
      (metadata.icon !== undefined && typeof metadata.icon !== 'string') ||
      (metadata.color !== undefined &&
        (typeof metadata.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(metadata.color)))
    ) return false;
  }
  for (const missionId in value.missionsById) {
    if (!Object.prototype.hasOwnProperty.call(value.missionsById, missionId)) continue;
    const mission = value.missionsById[missionId];
    if (
      !isRecord(mission) || mission.id !== missionId || typeof mission.title !== 'string' ||
      mission.title.trim().length === 0 || !Array.isArray(mission.definitionIds) ||
      mission.definitionIds.length === 0 ||
      !mission.definitionIds.every(function (id) { return typeof id === 'string' && id.length > 0; }) ||
      ['upcoming', 'active', 'complete'].indexOf(mission.status) === -1 ||
      (mission.description !== undefined && typeof mission.description !== 'string') ||
      (mission.startsAt !== undefined &&
        (typeof mission.startsAt !== 'string' || !Number.isFinite(Date.parse(mission.startsAt)))) ||
      (mission.endsAt !== undefined &&
        (typeof mission.endsAt !== 'string' || !Number.isFinite(Date.parse(mission.endsAt)))) ||
      !isOptionalBoundedInteger(mission.rewardPoints, 100000) ||
      typeof mission.createdAt !== 'string' || !Number.isFinite(Date.parse(mission.createdAt)) ||
      typeof mission.updatedAt !== 'string' || !Number.isFinite(Date.parse(mission.updatedAt))
    ) return false;
  }
  for (const rewardId in value.rewardGoalsById) {
    if (!Object.prototype.hasOwnProperty.call(value.rewardGoalsById, rewardId)) continue;
    const reward = value.rewardGoalsById[rewardId];
    if (
      !isRecord(reward) || reward.id !== rewardId || typeof reward.title !== 'string' ||
      reward.title.trim().length === 0 ||
      ['instant', 'saving', 'family', 'experience'].indexOf(reward.type) === -1 ||
      !Number.isSafeInteger(reward.targetPoints) || reward.targetPoints <= 0 ||
      reward.targetPoints > 1000000 ||
      (reward.participantId !== undefined && typeof reward.participantId !== 'string') ||
      !isOptionalBoundedInteger(reward.startingPoints, 1000000) ||
      typeof reward.enabled !== 'boolean' ||
      typeof reward.createdAt !== 'string' || !Number.isFinite(Date.parse(reward.createdAt)) ||
      typeof reward.updatedAt !== 'string' || !Number.isFinite(Date.parse(reward.updatedAt))
    ) return false;
  }
  if (value.earnedPointsByParticipant !== undefined) {
    for (const participantId in value.earnedPointsByParticipant) {
      if (!Object.prototype.hasOwnProperty.call(value.earnedPointsByParticipant, participantId)) continue;
      if (!isOptionalSignedBoundedInteger(value.earnedPointsByParticipant[participantId], 1000000000)) {
        return false;
      }
    }
  }
  for (const requestId in value.rewardRequestsById) {
    const request = value.rewardRequestsById[requestId];
    if (!isRecord(request) || request.id !== requestId ||
      typeof request.rewardId !== 'string' || typeof request.rewardTitle !== 'string' ||
      typeof request.participantId !== 'string' || !Number.isSafeInteger(request.cost) ||
      request.cost < 1 || request.cost > 1000000 ||
      ['requested', 'approved', 'declined', 'fulfilled', 'refunded'].indexOf(request.status) === -1 ||
      !Number.isFinite(Date.parse(request.requestedAt)) ||
      !Number.isFinite(Date.parse(request.updatedAt))) return false;
  }
  for (const targetId in value.badgesById) {
    if (!choreProgressPolicy.isProgressTarget(value.badgesById[targetId], targetId)) return false;
  }
  for (const targetId in value.achievementsById) {
    if (!choreProgressPolicy.isProgressTarget(value.achievementsById[targetId], targetId)) return false;
  }
  if (!value.progressAwards.every(choreProgressPolicy.isProgressAward)) return false;
  const transactionIds = [];
  for (let index = 0; index < value.pointTransactions.length; index += 1) {
    const transaction = value.pointTransactions[index];
    if (!choreProgressPolicy.isPointTransaction(transaction) ||
      transactionIds.indexOf(transaction.id) !== -1) return false;
    transactionIds.push(transaction.id);
  }
  return true;
}

function createOutboxItem(activity) {
  return {
    id: 'outbox:' + activity.id,
    activityId: activity.id,
    eventType: activity.type,
    status: 'pending',
    attempts: 0,
    createdAt: activity.timestamp,
    nextAttemptAt: activity.timestamp,
  };
}

function readEventHistory(fallbackEvents) {
  try {
    const history = readJson(
      CHORE_EVENT_HISTORY_PATH,
      { contractVersion: CONTRACT_VERSION, events: [] },
      MAX_CHORE_EVENT_HISTORY_BYTES
    );
    if (
      !isRecord(history) ||
      history.contractVersion !== CONTRACT_VERSION ||
      !Array.isArray(history.events)
    ) {
      throw new Error('Chore event history is invalid');
    }
    return history;
  } catch (_error) {
    const repaired = {
      contractVersion: CONTRACT_VERSION,
      events: Array.isArray(fallbackEvents) ? fallbackEvents.slice(-DEFAULT_HISTORY_RETENTION.maxEvents) : [],
    };
    writeJson(CHORE_EVENT_HISTORY_PATH, repaired, MAX_CHORE_EVENT_HISTORY_BYTES);
    return repaired;
  }
}

function appendEventHistory(events, policy) {
  if (!Array.isArray(events) || events.length === 0) return;
  const history = readEventHistory(events);
  const existingIds = Object.create(null);
  for (let index = 0; index < history.events.length; index += 1) {
    recordSafety.setOwnRecordValue(existingIds, history.events[index].id, true);
  }
  const additions = [];
  for (let index = 0; index < events.length; index += 1) {
    if (!existingIds[events[index].id]) {
      recordSafety.setOwnRecordValue(existingIds, events[index].id, true);
      additions.push(events[index]);
    }
  }
  if (additions.length === 0) return;
  const retention = isValidHistoryRetention(policy) ? policy : DEFAULT_HISTORY_RETENTION;
  const boundary = Date.now() - retention.maxAgeDays * 86400000;
  const retainedEvents = history.events.concat(additions).filter(function (event) {
    return Date.parse(event.timestamp) >= boundary;
  }).slice(-retention.maxEvents);
  writeJson(
    CHORE_EVENT_HISTORY_PATH,
    { contractVersion: CONTRACT_VERSION, events: retainedEvents },
    MAX_CHORE_EVENT_HISTORY_BYTES
  );
}

function replaceEventHistory(events) {
  writeJson(
    CHORE_EVENT_HISTORY_PATH,
    { contractVersion: CONTRACT_VERSION, events },
    MAX_CHORE_EVENT_HISTORY_BYTES
  );
}

function parseInterchangeDocument(value) {
  if (
    !isRecord(value) ||
    value.contract !== 'navet.chores' ||
    value.version !== 1 ||
    typeof value.exportedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.exportedAt)) ||
    !Array.isArray(value.events)
  ) {
    throw new Error('Unsupported chore interchange document');
  }
  const workspace = migrateChoreWorkspaceData(value.workspace);
  if (!workspace) throw new Error('Unsupported chore workspace schema');
  for (let index = 0; index < value.events.length; index += 1) {
    if (!isValidActivity(value.events[index])) throw new Error('Chore event history is invalid');
  }
  return { workspace, events: value.events };
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function nextImportedId(sourceId, occupied) {
  if (!occupied[sourceId]) return sourceId;
  let index = 2;
  while (occupied[sourceId + '~import-' + index]) index += 1;
  return sourceId + '~import-' + index;
}

function mergeImportedWorkspace(current, currentEvents, imported, timestamp) {
  const participantsById = cloneValue(current.participantsById);
  const participantMap = Object.create(null);
  const participantIds = Object.create(null);
  Object.keys(participantsById).forEach(function (id) { recordSafety.setOwnRecordValue(participantIds, id, true); });
  Object.values(imported.workspace.participantsById).forEach(function (participant) {
    if (
      participantsById[participant.id] &&
      JSON.stringify(participantsById[participant.id]) === JSON.stringify(participant)
    ) {
      participantMap[participant.id] = participant.id;
      return;
    }
    const targetId = nextImportedId(participant.id, participantIds);
    participantIds[targetId] = true;
    participantMap[participant.id] = targetId;
    participantsById[targetId] = Object.assign({}, participant, {
      id: targetId,
      updatedAt: timestamp,
    });
  });

  const definitionsById = cloneValue(current.definitionsById);
  const definitionMap = Object.create(null);
  const definitionIds = Object.create(null);
  Object.keys(definitionsById).forEach(function (id) { recordSafety.setOwnRecordValue(definitionIds, id, true); });
  Object.values(imported.workspace.definitionsById).forEach(function (definition) {
    const remapped = cloneValue(definition);
    remapped.assignment.participantIds = remapped.assignment.participantIds.map(function (id) {
      return participantMap[id] || id;
    });
    if (Array.isArray(remapped.assignment.standbyParticipantIds)) {
      remapped.assignment.standbyParticipantIds = remapped.assignment.standbyParticipantIds.map(function (id) {
        return participantMap[id] || id;
      });
    }
    if (isRecord(remapped.assignment.participantScheduleOverrides)) {
      const overrides = Object.create(null);
      Object.keys(remapped.assignment.participantScheduleOverrides).forEach(function (id) {
        overrides[participantMap[id] || id] = remapped.assignment.participantScheduleOverrides[id];
      });
      remapped.assignment.participantScheduleOverrides = overrides;
    }
    remapped.approval.approverIds = remapped.approval.approverIds.map(function (id) {
      return participantMap[id] || id;
    });
    remapped.updatedAt = timestamp;
    if (
      definitionsById[definition.id] &&
      JSON.stringify(definitionsById[definition.id]) === JSON.stringify(remapped)
    ) {
      definitionMap[definition.id] = definition.id;
      return;
    }
    const targetId = nextImportedId(definition.id, definitionIds);
    definitionIds[targetId] = true;
    definitionMap[definition.id] = targetId;
    remapped.id = targetId;
    definitionsById[targetId] = remapped;
  });

  const occurrencesById = cloneValue(current.occurrencesById);
  const occurrenceMap = Object.create(null);
  const occurrenceIds = Object.create(null);
  Object.keys(occurrencesById).forEach(function (id) { recordSafety.setOwnRecordValue(occurrenceIds, id, true); });
  Object.values(imported.workspace.occurrencesById).forEach(function (occurrence) {
    const targetId = nextImportedId(occurrence.id, occurrenceIds);
    occurrenceIds[targetId] = true;
    occurrenceMap[occurrence.id] = targetId;
    const remapped = Object.assign({}, occurrence, {
      id: targetId,
      definitionId: definitionMap[occurrence.definitionId] || occurrence.definitionId,
      assigneeIds: occurrence.assigneeIds.map(function (id) { return participantMap[id] || id; }),
      updatedAt: timestamp,
    });
    ['claimedBy', 'completedBy', 'approvedBy', 'skippedBy'].forEach(function (key) {
      if (remapped[key]) remapped[key] = participantMap[remapped[key]] || remapped[key];
    });
    occurrencesById[targetId] = remapped;
  });
  Object.values(occurrencesById).forEach(function (occurrence) {
    if (occurrenceMap[occurrence.carriedForwardFrom]) {
      occurrence.carriedForwardFrom = occurrenceMap[occurrence.carriedForwardFrom];
    }
    if (occurrenceMap[occurrence.carriedForwardTo]) {
      occurrence.carriedForwardTo = occurrenceMap[occurrence.carriedForwardTo];
    }
  });

  const events = cloneValue(currentEvents);
  const eventIds = Object.create(null);
  events.forEach(function (event) { recordSafety.setOwnRecordValue(eventIds, event.id, true); });
  imported.events.forEach(function (event) {
    const remapped = cloneValue(event);
    remapped.id = nextImportedId(event.id, eventIds);
    eventIds[remapped.id] = true;
    remapped.commandId = 'import:' + event.commandId;
    if (remapped.occurrenceId) remapped.occurrenceId = occurrenceMap[remapped.occurrenceId] || remapped.occurrenceId;
    if (remapped.definitionId) remapped.definitionId = definitionMap[remapped.definitionId] || remapped.definitionId;
    if (remapped.participantId) remapped.participantId = participantMap[remapped.participantId] || remapped.participantId;
    if (remapped.actorParticipantId) remapped.actorParticipantId = participantMap[remapped.actorParticipantId] || remapped.actorParticipantId;
    if (Array.isArray(remapped.assigneeIds)) remapped.assigneeIds = remapped.assigneeIds.map(function (id) { return participantMap[id] || id; });
    if (Array.isArray(remapped.previousAssigneeIds)) remapped.previousAssigneeIds = remapped.previousAssigneeIds.map(function (id) { return participantMap[id] || id; });
    events.push(remapped);
  });
  return {
    data: Object.assign({}, current, {
      participantsById,
      definitionsById,
      occurrencesById,
      activity: current.activity.concat(events.slice(currentEvents.length)).slice(-MAX_ACTIVITY_ITEMS),
      outbox: current.outbox,
    }),
    events,
  };
}

function choreTimeToMinutes(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new Error('Invalid chore time');
  return Number(match[1]) * 60 + Number(match[2]);
}

function nextReminderDeliveryAt(timestamp, participant, fallbackTimeZone) {
  const preferences = isRecord(participant.reminderPreferences)
    ? participant.reminderPreferences
    : {};
  const quietHours = isRecord(preferences.quietHours) ? preferences.quietHours : null;
  if (!quietHours || quietHours.start === quietHours.end) return timestamp;
  const timeZone = quietHours.timeZone || fallbackTimeZone;
  const parts = getTimeZoneParts(choreRecurrencePolicy.parseChoreInstant(timestamp), timeZone);
  const localMinutes = Number(parts.hour) * 60 + Number(parts.minute);
  const startMinutes = choreTimeToMinutes(quietHours.start);
  const endMinutes = choreTimeToMinutes(quietHours.end);
  const crossesMidnight = startMinutes > endMinutes;
  const insideQuietHours = crossesMidnight
    ? localMinutes >= startMinutes || localMinutes < endMinutes
    : localMinutes >= startMinutes && localMinutes < endMinutes;
  if (!insideQuietHours) return timestamp;
  let quietEndDate = parts.year + '-' + parts.month + '-' + parts.day;
  if (crossesMidnight && localMinutes >= startMinutes) {
    quietEndDate = choreCalendarPolicy.addCalendarDays(quietEndDate, 1);
  }
  return localDateTimeToIso(quietEndDate, quietHours.end, timeZone);
}

function createReminderOutboxItem(definition, occurrence, participant, eventType, eventKey, timestamp) {
  const preferences = isRecord(participant.reminderPreferences)
    ? participant.reminderPreferences
    : {};
  const destination = isRecord(preferences.destination) ? preferences.destination : {};
  return {
    id: 'outbox:reminder:' + eventKey + ':' + participant.id,
    activityId: 'scheduler:' + eventKey,
    eventType,
    status: 'pending',
    attempts: 0,
    createdAt: timestamp,
    nextAttemptAt: nextReminderDeliveryAt(timestamp, participant, definition.schedule.timeZone),
    occurrenceId: occurrence.id,
    occurrenceUpdatedAt: occurrence.updatedAt,
    participantId: participant.id,
    destination: destination.type || 'in_app',
    destinationTarget: destination.target,
  };
}

function runWorkspaceScheduler(data, timestamp) {
  const now = Date.parse(timestamp);
  const retainedOccurrences = choreRecurrencePolicy.retainChoreSupersession(data.occurrencesById, data.definitionsById, timestamp, data.activity, Object.keys(data.participantsById));
  const occurrencesById = Object.assign({}, retainedOccurrences);
  const activities = [];
  const reminderItems = [];
  const existingOutboxIds = Object.create(null);
  const existingEventIds = Object.create(null);
  const history = readEventHistory();
  for (let historyIndex = 0; historyIndex < history.events.length; historyIndex += 1) {
    recordSafety.setOwnRecordValue(existingEventIds, history.events[historyIndex].id, true);
  }
  for (let activityIndex = 0; activityIndex < data.activity.length; activityIndex += 1) {
    recordSafety.setOwnRecordValue(existingEventIds, data.activity[activityIndex].id, true);
  }
  for (let outboxIndex = 0; outboxIndex < data.outbox.length; outboxIndex += 1) {
    recordSafety.setOwnRecordValue(existingOutboxIds, data.outbox[outboxIndex].id, true);
  }
  const lifecycleOccurrenceIds = Object.keys(data.occurrencesById);
  for (let lifecycleIndex = 0; lifecycleIndex < lifecycleOccurrenceIds.length; lifecycleIndex += 1) {
    const lifecycleOccurrence = data.occurrencesById[lifecycleOccurrenceIds[lifecycleIndex]];
    const dueAt = Date.parse(lifecycleOccurrence.dueAt);
    if (!Number.isFinite(dueAt) || now < dueAt) continue;
    if (!occurrenceHasActiveAssignee(lifecycleOccurrence, data, timestamp)) continue;
    const dueId = 'activity:scheduler:due:' + lifecycleOccurrence.id;
    if (!existingEventIds[dueId]) {
      existingEventIds[dueId] = true;
      activities.push({
        id: dueId,
        commandId: 'scheduler:due:' + lifecycleOccurrence.id,
        occurrenceId: lifecycleOccurrence.id,
        definitionId: lifecycleOccurrence.definitionId,
        assigneeIds: lifecycleOccurrence.assigneeIds,
        type: 'due',
        timestamp: lifecycleOccurrence.dueAt,
      });
    }
    const resolvedAt = lifecycleOccurrence.completedAt || lifecycleOccurrence.skippedAt || lifecycleOccurrence.missedAt;
    const overdueId = 'activity:scheduler:overdue:' + lifecycleOccurrence.id;
    if (
      now > dueAt &&
      (!resolvedAt || Date.parse(resolvedAt) > dueAt) &&
      !existingEventIds[overdueId]
    ) {
      existingEventIds[overdueId] = true;
      activities.push({
        id: overdueId,
        commandId: 'scheduler:overdue:' + lifecycleOccurrence.id,
        occurrenceId: lifecycleOccurrence.id,
        definitionId: lifecycleOccurrence.definitionId,
        assigneeIds: lifecycleOccurrence.assigneeIds,
        type: 'overdue',
        timestamp: lifecycleOccurrence.dueAt,
      });
    }
  }
  const occurrenceIds = Object.keys(data.occurrencesById);
  for (let index = 0; index < occurrenceIds.length; index += 1) {
    const occurrence = data.occurrencesById[occurrenceIds[index]];
    if (occurrence.status !== 'available' && occurrence.status !== 'claimed') continue;
    if (!occurrenceHasActiveAssignee(occurrence, data, timestamp)) continue;
    const definition = data.definitionsById[occurrence.definitionId];
    if (!definition || definition.schedule.frequency === 'after_completion') continue;
    const superseding = choreRecurrencePolicy.getSupersedingChoreOccurrence(occurrence, definition, data.occurrencesById, timestamp, Object.keys(data.participantsById));
    const policy = superseding ? { graceMinutes: 0, action: 'none' } : definition.missedPolicy;
    if (!policy || (!superseding && policy.action === 'none' && definition.schedule.frequency !== 'once') || !Number.isFinite(policy.graceMinutes)) continue;
    const missedBoundary = superseding ? choreRecurrencePolicy.parseChoreInstant(superseding.scheduledAt) : Date.parse(occurrence.dueAt) + policy.graceMinutes * 60000;
    if (!Number.isFinite(missedBoundary) || now < missedBoundary) continue;

    const activity = {
      id: 'activity:scheduler:missed:' + occurrence.id + ':' + missedBoundary,
      commandId: 'scheduler:missed:' + occurrence.id + ':' + missedBoundary,
      occurrenceId: occurrence.id,
      definitionId: definition.id,
      type: policy.action === 'skip' ? 'skipped' : 'missed',
      reason: superseding ? 'Next scheduled occurrence started' : 'Missed-work policy',
      timestamp,
    };
    const nextOccurrence = Object.assign({}, occurrence, {
      status: policy.action === 'skip' ? 'skipped' : 'missed',
      updatedAt: timestamp,
    });
    if (policy.action === 'skip') nextOccurrence.skippedAt = timestamp;
    else nextOccurrence.missedAt = timestamp;
    if (superseding) nextOccurrence.supersededAt = superseding.scheduledAt;
    activities.push(activity);

    if (policy.action === 'carry_forward') {
      const carryDays = Number.isSafeInteger(policy.carryForwardDays)
        ? policy.carryForwardDays
        : 1;
      const scheduledAt = new Date(Date.parse(occurrence.scheduledAt) + carryDays * 86400000);
      const dueAt = new Date(Date.parse(occurrence.dueAt) + carryDays * 86400000);
      const assignmentSlot = 'carry:' + occurrence.id;
      const carriedId =
        definition.id + ':' + scheduledAt.toISOString() + ':' + assignmentSlot;
      const carriedOccurrence = {
        id: carriedId,
        definitionId: definition.id,
        scheduledAt: scheduledAt.toISOString(),
        dueAt: dueAt.toISOString(),
        assigneeIds: occurrence.assigneeIds,
        assignmentSlot,
        status: 'available',
        carriedForwardFrom: occurrence.id,
        updatedAt: timestamp,
      };
      nextOccurrence.carriedForwardTo = carriedId;
      if (!occurrencesById[carriedId]) occurrencesById[carriedId] = carriedOccurrence;
      activities.push({
        id: 'activity:scheduler:created:' + carriedId,
        commandId: 'scheduler:created:' + carriedId,
        occurrenceId: carriedId,
        definitionId: definition.id,
        type: 'occurrence_created',
        assigneeIds: carriedOccurrence.assigneeIds,
        reason: 'Carried forward from missed chore',
        timestamp,
      });
    }
    recordSafety.setOwnRecordValue(occurrencesById, occurrence.id, nextOccurrence);
  }

  function addReminder(definition, occurrence, participantId, eventType, eventKey) {
    const participant = data.participantsById[participantId];
    const preferences = isRecord(participant) && isRecord(participant.reminderPreferences)
      ? participant.reminderPreferences
      : {};
    if (!isRecord(participant) || isParticipantPausedAt(participant, timestamp) || preferences.enabled === false) {
      return;
    }
    const item = createReminderOutboxItem(
      definition,
      occurrence,
      participant,
      eventType,
      eventKey,
      timestamp
    );
    if (existingOutboxIds[item.id]) return;
    existingOutboxIds[item.id] = true;
    reminderItems.push(item);
  }

  const scheduledOccurrenceIds = Object.keys(occurrencesById);
  for (let occurrenceIndex = 0; occurrenceIndex < scheduledOccurrenceIds.length; occurrenceIndex += 1) {
    const occurrence = occurrencesById[scheduledOccurrenceIds[occurrenceIndex]];
    const definition = data.definitionsById[occurrence.definitionId];
    const policy = isRecord(definition) && isRecord(definition.reminderPolicy)
      ? definition.reminderPolicy
      : null;
    if (!policy || policy.enabled !== true || definition.archivedAt !== undefined) continue;
    if (!occurrenceHasActiveAssignee(occurrence, data, timestamp)) continue;
    if (occurrence.status === 'available' || occurrence.status === 'claimed') {
      const dueAt = Date.parse(occurrence.dueAt);
      const beforeDue = Array.isArray(policy.beforeDueMinutes) ? policy.beforeDueMinutes : [];
      const seenOffsets = Object.create(null);
      for (let offsetIndex = 0; offsetIndex < beforeDue.length; offsetIndex += 1) {
        const offset = beforeDue[offsetIndex];
        if (seenOffsets[offset] || now < dueAt - offset * 60000 || now >= dueAt) continue;
        recordSafety.setOwnRecordValue(seenOffsets, offset, true);
        for (let participantIndex = 0; participantIndex < occurrence.assigneeIds.length; participantIndex += 1) {
          addReminder(definition, occurrence, occurrence.assigneeIds[participantIndex], 'reminder_before_due', 'before:' + occurrence.id + ':' + offset);
        }
      }
      if (policy.atDue === true && now >= dueAt) {
        for (let participantIndex = 0; participantIndex < occurrence.assigneeIds.length; participantIndex += 1) {
          addReminder(definition, occurrence, occurrence.assigneeIds[participantIndex], 'reminder_due', 'due:' + occurrence.id);
        }
      }
      if (Number.isFinite(policy.overdueEveryMinutes) && now >= dueAt + policy.overdueEveryMinutes * 60000) {
        const elapsedSlots = Math.floor((now - dueAt) / (policy.overdueEveryMinutes * 60000));
        const slotCount = Math.min(elapsedSlots, Number.isFinite(policy.maxOverdueReminders) ? policy.maxOverdueReminders : elapsedSlots);
        for (let slot = 1; slot <= slotCount; slot += 1) {
          for (let participantIndex = 0; participantIndex < occurrence.assigneeIds.length; participantIndex += 1) {
            addReminder(definition, occurrence, occurrence.assigneeIds[participantIndex], 'reminder_overdue', 'overdue:' + occurrence.id + ':' + slot);
          }
        }
      }
    }
    if (
      occurrence.status === 'awaiting_approval' &&
      typeof occurrence.completedAt === 'string' &&
      Number.isFinite(policy.approvalAfterMinutes) &&
      now >= Date.parse(occurrence.completedAt) + policy.approvalAfterMinutes * 60000
    ) {
      for (let approverIndex = 0; approverIndex < definition.approval.approverIds.length; approverIndex += 1) {
        addReminder(definition, occurrence, definition.approval.approverIds[approverIndex], 'reminder_approval', 'approval:' + occurrence.id);
      }
    }
  }

  if (activities.length === 0 && reminderItems.length === 0 && retainedOccurrences === data.occurrencesById) {
    return { activities, outboxItems: reminderItems, data };
  }
  return {
    activities,
    outboxItems: reminderItems,
    data: Object.assign({}, data, {
      occurrencesById,
      activity: data.activity.concat(activities).slice(-MAX_ACTIVITY_ITEMS),
      outbox: data.outbox
        .concat(activities.map(createOutboxItem))
        .concat(reminderItems)
        .slice(-MAX_OUTBOX_ITEMS),
    }),
  };
}

function nthSundayUtc(year, month, ordinal) {
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return 1 + ((7 - firstDay) % 7) + (ordinal - 1) * 7;
}

function lastSundayUtc(year, month) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  return lastDay.getUTCDate() - lastDay.getUTCDay();
}

function isBetween(timestamp, start, end) {
  return timestamp >= start && timestamp < end;
}

function getNjsTimeZoneOffsetMinutes(timestamp, timeZone) {
  if (timeZone === 'UTC' || timeZone === 'Etc/UTC' || timeZone === 'GMT') return 0;

  const fixedOffsets = {
    'Africa/Cairo': 120,
    'Africa/Johannesburg': 120,
    'Africa/Lagos': 60,
    'Africa/Nairobi': 180,
    'America/Argentina/Buenos_Aires': -180,
    'America/Bogota': -300,
    'America/Honolulu': -600,
    'America/Lima': -300,
    'America/Mexico_City': -360,
    'America/Phoenix': -420,
    'America/Sao_Paulo': -180,
    'Asia/Bangkok': 420,
    'Asia/Dhaka': 360,
    'Asia/Dubai': 240,
    'Asia/Hong_Kong': 480,
    'Asia/Jakarta': 420,
    'Asia/Kathmandu': 345,
    'Asia/Kolkata': 330,
    'Asia/Seoul': 540,
    'Asia/Shanghai': 480,
    'Asia/Singapore': 480,
    'Asia/Tokyo': 540,
    'Australia/Brisbane': 600,
    'Australia/Darwin': 570,
    'Australia/Perth': 480,
    'Europe/Istanbul': 180,
    'Europe/Moscow': 180,
    'Pacific/Honolulu': -600,
  };
  if (fixedOffsets[timeZone] !== undefined) return fixedOffsets[timeZone];

  const year = new Date(timestamp).getUTCFullYear();
  const europeanBases = {
    'Europe/Amsterdam': 60,
    'Europe/Athens': 120,
    'Europe/Belgrade': 60,
    'Europe/Berlin': 60,
    'Europe/Brussels': 60,
    'Europe/Bucharest': 120,
    'Europe/Budapest': 60,
    'Europe/Copenhagen': 60,
    'Europe/Dublin': 0,
    'Europe/Helsinki': 120,
    'Europe/Kyiv': 120,
    'Europe/Lisbon': 0,
    'Europe/London': 0,
    'Europe/Madrid': 60,
    'Europe/Oslo': 60,
    'Europe/Paris': 60,
    'Europe/Prague': 60,
    'Europe/Riga': 120,
    'Europe/Rome': 60,
    'Europe/Sofia': 120,
    'Europe/Stockholm': 60,
    'Europe/Tallinn': 120,
    'Europe/Vienna': 60,
    'Europe/Vilnius': 120,
    'Europe/Warsaw': 60,
    'Europe/Zurich': 60,
  };
  if (europeanBases[timeZone] !== undefined) {
    const starts = Date.UTC(year, 2, lastSundayUtc(year, 2), 1);
    const ends = Date.UTC(year, 9, lastSundayUtc(year, 9), 1);
    return europeanBases[timeZone] + (isBetween(timestamp, starts, ends) ? 60 : 0);
  }

  const northAmericanBases = {
    'America/Anchorage': -540,
    'America/Chicago': -360,
    'America/Denver': -420,
    'America/Detroit': -300,
    'America/Edmonton': -420,
    'America/Halifax': -240,
    'America/Los_Angeles': -480,
    'America/New_York': -300,
    'America/St_Johns': -210,
    'America/Toronto': -300,
    'America/Vancouver': -480,
    'America/Winnipeg': -360,
  };
  if (northAmericanBases[timeZone] !== undefined) {
    const base = northAmericanBases[timeZone];
    const starts = Date.UTC(year, 2, nthSundayUtc(year, 2, 2), 2) - base * 60000;
    const ends = Date.UTC(year, 10, nthSundayUtc(year, 10, 1), 2) - (base + 60) * 60000;
    return base + (isBetween(timestamp, starts, ends) ? 60 : 0);
  }

  const australianBases = {
    'Australia/Adelaide': 570,
    'Australia/Canberra': 600,
    'Australia/Hobart': 600,
    'Australia/Melbourne': 600,
    'Australia/Sydney': 600,
  };
  if (australianBases[timeZone] !== undefined) {
    const base = australianBases[timeZone];
    const ends = Date.UTC(year, 3, nthSundayUtc(year, 3, 1), 3) - (base + 60) * 60000;
    const starts = Date.UTC(year, 9, nthSundayUtc(year, 9, 1), 2) - base * 60000;
    return base + (timestamp < ends || timestamp >= starts ? 60 : 0);
  }

  if (timeZone === 'Pacific/Auckland') {
    const base = 720;
    const ends = Date.UTC(year, 3, nthSundayUtc(year, 3, 1), 3) - (base + 60) * 60000;
    const starts = Date.UTC(year, 8, lastSundayUtc(year, 8), 2) - base * 60000;
    return base + (timestamp < ends || timestamp >= starts ? 60 : 0);
  }

  const etcMatch = /^Etc\/GMT([+-])(\d{1,2})$/.exec(timeZone);
  if (etcMatch) {
    const hours = Number(etcMatch[2]);
    if (hours <= 14) return (etcMatch[1] === '+' ? -1 : 1) * hours * 60;
  }
  throw new Error('Unsupported chore time zone in packaged runtime: ' + timeZone);
}

function getTimeZoneParts(timestamp, timeZone) {
  const root = (function () { return this; })();
  const dateTimeApi = root && root['In' + 'tl'];
  if (dateTimeApi && dateTimeApi.DateTimeFormat) {
    const parts = new dateTimeApi.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(timestamp));
    const result = Object.create(null);
    for (let index = 0; index < parts.length; index += 1) {
      result[parts[index].type] = parts[index].value;
    }
    return result;
  }

  const date = new Date(timestamp + getNjsTimeZoneOffsetMinutes(timestamp, timeZone) * 60000);
  return {
    year: String(date.getUTCFullYear()).padStart(4, '0'),
    month: String(date.getUTCMonth() + 1).padStart(2, '0'),
    day: String(date.getUTCDate()).padStart(2, '0'),
    hour: String(date.getUTCHours()).padStart(2, '0'),
    minute: String(date.getUTCMinutes()).padStart(2, '0'),
    second: String(date.getUTCSeconds()).padStart(2, '0'),
  };
}

function localDateTimeToIso(dateKey, time, timeZone) {
  const date = choreCalendarPolicy.parseDateKey(dateKey);
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw new Error('Invalid chore time');
  const desiredUtc = Date.UTC(date.year, date.month - 1, date.day, Number(match[1]), Number(match[2]));
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

function getZonedDateKey(timestamp, timeZone) {
  const parts = getTimeZoneParts(choreRecurrencePolicy.parseChoreInstant(timestamp), timeZone);
  return parts.year + '-' + parts.month + '-' + parts.day;
}

function materializeDefinition(definition, participantsById, rangeStart, rangeEnd, existing, latestCompletedAt, materializeNextAfterCompletion) {
  if (!definition.enabled || definition.archivedAt !== undefined) return [];
  const startTime = Date.parse(rangeStart);
  const endTime = Date.parse(rangeEnd);
  if (definition.schedule.frequency === 'after_completion') {
    if (definition.assignment.mode === 'everyone') {
      const personal = [];
      for (let index = 0; index < definition.assignment.participantIds.length; index += 1) {
        const participantId = definition.assignment.participantIds[index];
        const personalOccurrences = choreRecurrencePolicy.getParticipantChoreOccurrences(definition, existing, participantId, Object.keys(participantsById));
        const personalDefinition = Object.assign({}, definition, { assignment: Object.assign({}, definition.assignment, {mode: 'person', participantIds: [participantId]}) });
        const next = materializeDefinition(personalDefinition, participantsById, rangeStart, rangeEnd, personalOccurrences, choreRecurrencePolicy.getLatestChoreCompletion(personalOccurrences), materializeNextAfterCompletion);
        for (let nextIndex = 0; nextIndex < next.length; nextIndex += 1) personal.push(next[nextIndex]);
      }
      return personal;
    }
    const outstanding = choreRecurrencePolicy.getOutstandingChoreOccurrence(definition, existing);
    if (outstanding) return [outstanding];
  }
  const completionCountsByParticipant = Object.create(null);
  if (definition.assignment.rotationStrategy === 'fair') {
    for (const occurrenceId in existing) {
      if (!Object.prototype.hasOwnProperty.call(existing, occurrenceId)) continue;
      const occurrence = existing[occurrenceId];
      if (occurrence.definitionId !== definition.id || includesValue(['skipped', 'missed'], occurrence.status)) continue;
      const ids = occurrence.status === 'done' && occurrence.completedBy ? [occurrence.completedBy] : occurrence.assigneeIds;
      for (let index = 0; index < ids.length; index += 1) recordSafety.setOwnRecordValue(completionCountsByParticipant, ids[index], (completionCountsByParticipant[ids[index]] || 0) + 1);
    }
  }
  function assignmentSlotsAt(at, index) {
    if (definition.assignment.rotationStrategy === 'fair') {
      const saved = Object.values(existing).filter(function (item) {
        if (item.definitionId !== definition.id) return false;
        if (definition.schedule.frequency === 'hourly') return item.scheduledAt === at;
        const participantId = item.assigneeIds[0];
        const override = (definition.assignment.participantScheduleOverrides || {})[participantId] || {};
        return choreCalendarPolicy.addCalendarDays(getZonedDateKey(item.scheduledAt, definition.schedule.timeZone), -(override.dueDateOffsetDays || 0)) === getZonedDateKey(at, definition.schedule.timeZone);
      }).filter(function (item, index, items) {
        return items.findIndex(function (candidate) { return candidate.assignmentSlot === item.assignmentSlot; }) === index;
      });
      if (saved.length) return saved.map(function (item) { return { assignmentSlot: item.assignmentSlot, assigneeIds: item.assigneeIds }; });
    }
    return choreCalendarPolicy.resolveAssignmentSlots(definition.assignment, participantsById, index, completionCountsByParticipant, at);
  }
  function countAssignment(id, assigneeIds) {
    if (!existing[id] && definition.assignment.rotationStrategy === 'fair') {
      for (let index = 0; index < assigneeIds.length; index += 1) recordSafety.setOwnRecordValue(completionCountsByParticipant, assigneeIds[index], (completionCountsByParticipant[assigneeIds[index]] || 0) + 1);
    }
  }
  const schedule = definition.schedule;
  if (schedule.frequency === 'hourly') {
    const anchor = Date.parse(localDateTimeToIso(schedule.startDate, schedule.time, schedule.timeZone));
    const interval = schedule.intervalHours * 3600000;
    const firstIndex = Math.max(0, Math.ceil((startTime - anchor) / interval));
    const hourlyResults = [];
    for (let index = firstIndex; anchor + index * interval <= endTime; index += 1) {
      const scheduledAt = new Date(anchor + index * interval).toISOString();
      const localDate = getZonedDateKey(scheduledAt, schedule.timeZone);
      if ((schedule.endDate && localDate > schedule.endDate) || includesValue(schedule.excludedDates, localDate)) continue;
      const slots = assignmentSlotsAt(scheduledAt, index);
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
        const slot = slots[slotIndex];
        const id = definition.id + ':' + scheduledAt + ':' + slot.assignmentSlot;
        countAssignment(id, slot.assigneeIds);
        hourlyResults.push(existing[id] || {
          id, definitionId: definition.id, scheduledAt,
          dueAt: new Date(Date.parse(scheduledAt) + Math.max(0, definition.dueWindowMinutes) * 60000).toISOString(),
          assigneeIds: slot.assigneeIds, assignmentSlot: slot.assignmentSlot,
          status: 'available', updatedAt: scheduledAt,
        });
      }
    }
    return hourlyResults;
  }
  const rangeStartDate = getZonedDateKey(rangeStart, schedule.timeZone);
  const finalDate = getZonedDateKey(rangeEnd, schedule.timeZone);
  const dates = [];
  if (schedule.frequency === 'after_completion') {
    const anchor = latestCompletedAt ? getZonedDateKey(latestCompletedAt, schedule.timeZone) : schedule.startDate;
    const nextDate = latestCompletedAt ? choreCalendarPolicy.addCalendarDays(anchor, schedule.intervalDays) : anchor;
    if (
      (materializeNextAfterCompletion || nextDate < rangeStartDate || (nextDate >= rangeStartDate && nextDate <= finalDate)) &&
      (schedule.endDate === undefined || nextDate <= schedule.endDate) &&
      !includesValue(schedule.excludedDates, nextDate)
    ) dates.push(nextDate);
  } else {
    let dateKey = choreCalendarPolicy.scheduleStartDate(schedule);
    while (dateKey <= finalDate) {
      if (choreCalendarPolicy.isScheduledOnDate(schedule, dateKey)) dates.push(dateKey);
      dateKey = choreCalendarPolicy.addCalendarDays(dateKey, 1);
    }
  }
  const results = [];
  for (let dateIndex = 0; dateIndex < dates.length; dateIndex += 1) {
    const slots = assignmentSlotsAt(
      localDateTimeToIso(dates[dateIndex], schedule.time, schedule.timeZone),
      choreCalendarPolicy.rotationIndexForDate(dates, dateIndex, definition.assignment.rotationReset, definition.assignment.rotationCadence, choreCalendarPolicy.scheduleStartDate(schedule), definition.assignment.rotationDayOfWeek)
    );
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const slot = slots[slotIndex];
      const overrides = isRecord(definition.assignment.participantScheduleOverrides)
        ? definition.assignment.participantScheduleOverrides
        : {};
      const override = slot.assigneeIds.length === 1 && isRecord(overrides[slot.assigneeIds[0]])
        ? overrides[slot.assigneeIds[0]]
        : null;
      if (override && Array.isArray(override.daysOfWeek) && !includesValue(override.daysOfWeek, choreCalendarPolicy.getDayOfWeek(dates[dateIndex]))) continue;
      const times = override && Array.isArray(override.times)
        ? override.times
        : Array.isArray(schedule.times) && schedule.times.length > 0
          ? schedule.times
          : [schedule.time];
      for (let timeIndex = 0; timeIndex < times.length; timeIndex += 1) {
        const personalDate = override && override.dueDateOffsetDays
          ? choreCalendarPolicy.addCalendarDays(dates[dateIndex], override.dueDateOffsetDays)
          : dates[dateIndex];
        const scheduledAt = localDateTimeToIso(personalDate, times[timeIndex], schedule.timeZone);
        const scheduledTime = Date.parse(scheduledAt);
        if (!(schedule.frequency === 'after_completion' && (materializeNextAfterCompletion || scheduledTime < startTime)) &&
          (scheduledTime < startTime || scheduledTime > endTime)) continue;
        const id = definition.id + ':' + scheduledAt + ':' + slot.assignmentSlot;
        countAssignment(id, slot.assigneeIds);
        results.push(
          existing[id] || {
            id,
            definitionId: definition.id,
            scheduledAt,
            dueAt: new Date(scheduledTime + Math.max(0, definition.dueWindowMinutes) * 60000).toISOString(),
            assigneeIds: slot.assigneeIds,
            assignmentSlot: slot.assignmentSlot,
            status: 'available',
            updatedAt: scheduledAt,
          }
        );
      }
    }
  }
  return results;
}

function isValidWorkspaceAction(value) {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  if (value.type === 'occurrence_action') {
    if (
      !(
      typeof value.occurrenceId === 'string' &&
      value.occurrenceId.length > 0 &&
      (value.expectedOccurrenceUpdatedAt === undefined || typeof value.expectedOccurrenceUpdatedAt === 'string') &&
      isRecord(value.action) &&
      typeof value.action.participantId === 'string' &&
      value.action.participantId.length > 0 &&
      ['claim', 'complete', 'approve', 'reject', 'skip', 'reopen', 'reassign'].indexOf(
        value.action.type
      ) !== -1
      )
    ) {
      return false;
    }
    if (value.action.type === 'skip' || value.action.type === 'reopen') {
      return typeof value.action.reason === 'string' && value.action.reason.trim().length > 0;
    }
    if (value.action.type === 'reassign') {
      return (
        typeof value.action.reason === 'string' &&
        value.action.reason.trim().length > 0 &&
        Array.isArray(value.action.assigneeIds) &&
        value.action.assigneeIds.every(function (id) {
          return typeof id === 'string' && id.length > 0;
        })
      );
    }
    return (
      (value.action.managerOverride === undefined ||
        typeof value.action.managerOverride === 'boolean') &&
      (value.action.reason === undefined || typeof value.action.reason === 'string')
    );
  }
  if (value.type === 'participant_create') {
    return (
      isRecord(value.participant) &&
      (value.actorParticipantId === undefined || typeof value.actorParticipantId === 'string')
    );
  }
  if (value.type === 'participant_update') {
    return isRecord(value.participant) && typeof value.actorParticipantId === 'string';
  }
  if (value.type === 'definition_create' || value.type === 'definition_update') {
    return isRecord(value.definition) && typeof value.actorParticipantId === 'string';
  }
  if (
    value.type === 'definition_archive' ||
    value.type === 'definition_restore' ||
    value.type === 'definition_delete'
  ) {
    return typeof value.definitionId === 'string' && typeof value.actorParticipantId === 'string';
  }
  if (value.type === 'retention_update') {
    return typeof value.actorParticipantId === 'string' && isValidHistoryRetention(value.policy);
  }
  if (value.type === 'experience_update') {
    return (
      typeof value.actorParticipantId === 'string' &&
      isValidChoreExperience(value.experience)
    );
  }
  if (value.type === 'experience_points_adjust') {
    return (
      typeof value.actorParticipantId === 'string' &&
      typeof value.participantId === 'string' &&
      Number.isSafeInteger(value.pointsDelta) &&
      value.pointsDelta !== 0 &&
      Math.abs(value.pointsDelta) <= 10000 &&
      (value.reason === undefined || typeof value.reason === 'string')
    );
  }
  if (value.type === 'reward_request') {
    return typeof value.requestId === 'string' && value.requestId.length > 0 &&
      typeof value.rewardId === 'string' && typeof value.participantId === 'string';
  }
  if (value.type === 'reward_decision') {
    return typeof value.requestId === 'string' && typeof value.actorParticipantId === 'string' &&
      ['approve', 'decline', 'fulfill', 'refund'].indexOf(value.decision) !== -1 &&
      (value.reason === undefined || typeof value.reason === 'string');
  }
  if (value.type === 'vacation_reschedule') {
    return typeof value.actorParticipantId === 'string' && typeof value.participantId === 'string' &&
      Array.isArray(value.occurrenceIds) && value.occurrenceIds.length > 0 &&
      value.occurrenceIds.length <= 100 && value.occurrenceIds.every(function (id) {
        return typeof id === 'string' && id.length > 0;
      }) && typeof value.startDate === 'string';
  }
  if (value.type === 'reminder_acknowledge') {
    return typeof value.outboxId === 'string' && typeof value.actorParticipantId === 'string';
  }
  if (value.type === 'outbox_delivery_update') {
    return (
      typeof value.outboxId === 'string' &&
      ['delivered', 'failed'].indexOf(value.status) !== -1 &&
      (value.error === undefined || typeof value.error === 'string')
    );
  }
  return (
    value.type === 'materialize_occurrences' &&
    typeof value.rangeStart === 'string' &&
    typeof value.rangeEnd === 'string'
  );
}

function includesValue(values, expected) {
  return Array.isArray(values) && values.indexOf(expected) !== -1;
}

function compareStrings(left, right) {
  const leftValue = String(left);
  const rightValue = String(right);
  if (leftValue < rightValue) return -1;
  if (leftValue > rightValue) return 1;
  return 0;
}

function getExperiencePointBalances(data, experience) {
  const persisted = experience.earnedPointsByParticipant;
  if (isRecord(persisted)) {
    return Object.assign({}, persisted);
  }
  const balances = Object.create(null);
  for (const occurrenceId in data.occurrencesById) {
    if (!Object.prototype.hasOwnProperty.call(data.occurrencesById, occurrenceId)) continue;
    const occurrence = data.occurrencesById[occurrenceId];
    if (occurrence.status !== 'done' || typeof occurrence.completedBy !== 'string') continue;
    const metadata = experience.presentationByDefinitionId[occurrence.definitionId];
    const points = isRecord(metadata) && Number.isSafeInteger(metadata.points) ? metadata.points : 0;
    recordSafety.setOwnRecordValue(balances, occurrence.completedBy, (balances[occurrence.completedBy] || 0) + points);
  }
  return balances;
}

function isWorkspaceMissionComplete(data, mission) {
  const startsAt = Date.parse(mission.startsAt || mission.createdAt);
  const endsAt = mission.endsAt ? Date.parse(mission.endsAt) : Number.POSITIVE_INFINITY;
  const completedDefinitionIds = Object.create(null);
  for (const occurrenceId in data.occurrencesById) {
    if (!Object.prototype.hasOwnProperty.call(data.occurrencesById, occurrenceId)) continue;
    const occurrence = data.occurrencesById[occurrenceId];
    const scheduledAt = Date.parse(occurrence.scheduledAt);
    if (occurrence.status === 'done' && scheduledAt >= startsAt && scheduledAt <= endsAt) {
      recordSafety.setOwnRecordValue(completedDefinitionIds, occurrence.definitionId, true);
    }
  }
  return mission.definitionIds.every(function (definitionId) {
    return completedDefinitionIds[definitionId] === true;
  });
}

function updateExperiencePoints(data, previousOccurrence, nextOccurrence, commandId, timestamp) {
  const experience = isValidChoreExperience(data.experience)
    ? data.experience
    : createEmptyChoreExperience();
  if (experience.gamificationMode === 'off') return experience;
  const metadata = experience.presentationByDefinitionId[previousOccurrence.definitionId];
  const points = isRecord(metadata) && Number.isSafeInteger(metadata.points) ? metadata.points : 0;
  const becameFinal = previousOccurrence.status !== 'done' && nextOccurrence.status === 'done';
  const stoppedBeingFinal = previousOccurrence.status === 'done' && nextOccurrence.status !== 'done';
  const participantId = becameFinal
    ? nextOccurrence.completedBy
    : stoppedBeingFinal
      ? previousOccurrence.completedBy
      : undefined;
  let nextExperience = experience;
  if (points && typeof participantId === 'string' && (becameFinal || stoppedBeingFinal)) {
    const balances = getExperiencePointBalances(data, experience);
    recordSafety.setOwnRecordValue(balances, participantId, (balances[participantId] || 0) + (becameFinal ? points : -points));
    nextExperience = Object.assign({}, nextExperience, { earnedPointsByParticipant: balances,
      pointTransactions: experience.pointTransactions.concat([{
        id: 'points:' + commandId, participantId,
        pointsDelta: becameFinal ? points : -points,
        kind: becameFinal ? 'completion' : 'reopen', timestamp, commandId,
        occurrenceId: previousOccurrence.id,
      }]) });
  }
  const awardedMissionIds = (experience.awardedMissionIds || []).slice();
  let householdBonusPoints = experience.householdBonusPoints || 0;
  const dataWithNextOccurrence = Object.assign({}, data, {
    occurrencesById: Object.assign({}, data.occurrencesById),
  });
  recordSafety.setOwnRecordValue(dataWithNextOccurrence.occurrencesById, nextOccurrence.id, nextOccurrence);
  for (const missionId in experience.missionsById) {
    if (!Object.prototype.hasOwnProperty.call(experience.missionsById, missionId)) continue;
    const mission = experience.missionsById[missionId];
    if (
      !mission.rewardPoints ||
      mission.status === 'complete' ||
      awardedMissionIds.indexOf(mission.id) !== -1 ||
      isWorkspaceMissionComplete(data, mission) ||
      !isWorkspaceMissionComplete(dataWithNextOccurrence, mission)
    ) continue;
    awardedMissionIds.push(mission.id);
    householdBonusPoints += mission.rewardPoints;
  }
  if (
    householdBonusPoints !== (experience.householdBonusPoints || 0) ||
    awardedMissionIds.length !== (experience.awardedMissionIds || []).length
  ) {
    nextExperience = Object.assign({}, nextExperience, {
      householdBonusPoints,
      awardedMissionIds,
    });
  }
  if (becameFinal) {
    const progress = choreProgressPolicy.earnChoreProgressAwards({
      badges: nextExperience.badgesById,
      achievements: nextExperience.achievementsById,
      participantIds: Object.keys(data.participantsById),
      occurrences: Object.values(dataWithNextOccurrence.occurrencesById),
      transactions: nextExperience.pointTransactions,
      existingAwards: nextExperience.progressAwards,
      at: timestamp,
    });
    if (progress.awards.length > 0) {
      const balances = getExperiencePointBalances(dataWithNextOccurrence, nextExperience);
      for (let index = 0; index < progress.transactions.length; index += 1) {
        const transaction = progress.transactions[index];
        balances[transaction.participantId] =
          (balances[transaction.participantId] || 0) + transaction.pointsDelta;
      }
      nextExperience = Object.assign({}, nextExperience, {
        earnedPointsByParticipant: balances,
        progressAwards: nextExperience.progressAwards.concat(progress.awards),
        pointTransactions: nextExperience.pointTransactions.concat(progress.transactions),
      });
    }
  }
  return nextExperience;
}

function applyOccurrenceAction(data, commandId, workspaceAction, timestamp) {
  const occurrence = data.occurrencesById[workspaceAction.occurrenceId];
  if (!isRecord(occurrence) || typeof occurrence.id !== 'string') {
    throw new Error('Chore occurrence is no longer available');
  }
  if (workspaceAction.expectedOccurrenceUpdatedAt &&
    occurrence.updatedAt !== workspaceAction.expectedOccurrenceUpdatedAt) {
    throw new Error('This chore alert is out of date');
  }
  const definition = data.definitionsById[occurrence.definitionId];
  if (
    !isRecord(definition) ||
    typeof definition.id !== 'string' ||
    definition.archivedAt !== undefined
  ) {
    throw new Error('Chore definition is no longer available');
  }
  const action = workspaceAction.action;
  const participant = data.participantsById[action.participantId];
  if (!isRecord(participant) || isParticipantPausedAt(participant, timestamp)) {
    throw new Error('Chore participant is not active');
  }
  const requiredCapability =
    action.type === 'approve' || action.type === 'reject'
      ? action.managerOverride
        ? 'manage'
        : 'approve'
      : action.type === 'skip' || action.type === 'reopen' || action.type === 'reassign'
        ? 'manage'
        : 'complete';
  if (!includesValue(participant.capabilities, requiredCapability)) {
    throw new Error('Chore participant cannot ' + action.type + ' chores');
  }
  if (action.type === 'claim' && isRecord(definition.claimPolicy) &&
    definition.claimPolicy.pendingApproval === 'block') {
    for (const candidateId in data.occurrencesById) {
      const candidate = data.occurrencesById[candidateId];
      if (candidateId !== occurrence.id && candidate.definitionId === definition.id &&
        candidate.status === 'awaiting_approval' && includesValue(candidate.assigneeIds, action.participantId)) {
        throw new Error('Review the previous claim before starting this chore');
      }
    }
  }
  if (action.type === 'reassign') {
    for (let index = 0; index < action.assigneeIds.length; index += 1) {
      const assignee = data.participantsById[action.assigneeIds[index]];
      if (
        !isRecord(assignee) ||
        isParticipantPausedAt(assignee, timestamp) ||
        !includesValue(assignee.capabilities, 'complete')
      ) {
        throw new Error('Chore reassignment includes an ineligible participant');
      }
    }
  }

  const result = choreOccurrencePolicy.applyChoreOccurrenceCommand({
    definition,
    occurrence,
    command: action,
    commandId,
    timestamp,
  });
  const nextOccurrence = result.occurrence;
  const activity = result.activity;
  const experience = updateExperiencePoints(data, occurrence, nextOccurrence, commandId, timestamp);
  const pointRecipientId =
    occurrence.status !== 'done' && nextOccurrence.status === 'done'
      ? nextOccurrence.completedBy
      : occurrence.status === 'done' && nextOccurrence.status !== 'done'
        ? occurrence.completedBy
        : undefined;
  const pointMetadata = isRecord(data.experience) && isRecord(data.experience.presentationByDefinitionId)
    ? data.experience.presentationByDefinitionId[definition.id]
    : null;
  const awardedPoints = isRecord(pointMetadata) && Number.isSafeInteger(pointMetadata.points)
    ? pointMetadata.points
    : 0;
  if (awardedPoints && typeof pointRecipientId === 'string') {
    activity.participantId = pointRecipientId;
    activity.pointsDelta = nextOccurrence.status === 'done' ? awardedPoints : -awardedPoints;
  }
  if (typeof action.reason === 'string' && action.reason.trim().length > 0) {
    activity.reason = action.reason.trim();
  }
  if (action.type === 'reassign') {
    activity.previousAssigneeIds = occurrence.assigneeIds;
    activity.assigneeIds = nextOccurrence.assigneeIds;
  }
  const nextOccurrences = Object.assign({}, data.occurrencesById);
  recordSafety.setOwnRecordValue(nextOccurrences, nextOccurrence.id, nextOccurrence);
  const outbox = data.outbox.filter(function (item) {
    return item.occurrenceId !== occurrence.id || item.status === 'delivered' || !item.destination;
  });
  outbox.push(createOutboxItem(activity));
  const reminderPolicy = isRecord(definition.reminderPolicy) ? definition.reminderPolicy : null;
  if (reminderPolicy && reminderPolicy.enabled === true &&
    includesValue(reminderPolicy.notifyOn || [], activity.type)) {
    const recipients = (activity.type === 'claimed' || activity.type === 'completed') &&
      definition.approval.approverIds.length > 0
      ? definition.approval.approverIds : nextOccurrence.assigneeIds;
    const seen = Object.create(null);
    for (let index = 0; index < recipients.length; index += 1) {
      const recipientId = recipients[index];
      if (seen[recipientId]) continue;
      recordSafety.setOwnRecordValue(seen, recipientId, true);
      const recipient = data.participantsById[recipientId];
      if (!isRecord(recipient) || isParticipantPausedAt(recipient, timestamp) ||
        (isRecord(recipient.reminderPreferences) && recipient.reminderPreferences.enabled === false)) continue;
      const item = createReminderOutboxItem(definition, nextOccurrence, recipient,
        activity.type, 'event:' + activity.id, timestamp);
      item.activityId = activity.id;
      outbox.push(item);
    }
  }
  return Object.assign({}, data, {
    occurrencesById: nextOccurrences,
    experience,
    activity: data.activity.concat([activity]).slice(-MAX_ACTIVITY_ITEMS),
    outbox: outbox.slice(-MAX_OUTBOX_ITEMS),
  });
}

function isValidParticipantInput(participant) {
  return (
    isRecord(participant) &&
    typeof participant.id === 'string' &&
    participant.id.length > 0 &&
    typeof participant.displayName === 'string' &&
    participant.displayName.trim().length > 0 &&
    Array.isArray(participant.capabilities) &&
    participant.capabilities.every(function (capability) {
      return ['complete', 'approve', 'manage'].indexOf(capability) !== -1;
    }) &&
    (participant.avatarIcon === undefined ||
      (typeof participant.avatarIcon === 'string' && participant.avatarIcon.length <= 64)) &&
    typeof participant.createdAt === 'string' &&
    Number.isFinite(Date.parse(participant.createdAt)) &&
    typeof participant.updatedAt === 'string' &&
    Number.isFinite(Date.parse(participant.updatedAt)) &&
    (participant.pausedAt === undefined || Number.isFinite(Date.parse(participant.pausedAt))) &&
    (participant.resumeAt === undefined ||
      (participant.pausedAt !== undefined && Number.isFinite(Date.parse(participant.resumeAt)) &&
        Date.parse(participant.resumeAt) > Date.parse(participant.pausedAt)))
  );
}

function isValidDefinitionInput(definition) {
  return (
    isRecord(definition) &&
    typeof definition.id === 'string' &&
    definition.id.length > 0 &&
    typeof definition.title === 'string' &&
    definition.title.trim().length > 0 &&
    typeof definition.enabled === 'boolean' &&
    isRecord(definition.assignment) &&
    ['person', 'anyone', 'everyone', 'rotation'].indexOf(definition.assignment.mode) !== -1 &&
    (definition.assignment.standbyParticipantIds === undefined ||
      (Array.isArray(definition.assignment.standbyParticipantIds) &&
        definition.assignment.standbyParticipantIds.every(function (id) { return typeof id === 'string' && id.length > 0; }))) &&
    (definition.assignment.rotationStrategy === undefined ||
      ['ordered', 'fair'].indexOf(definition.assignment.rotationStrategy) !== -1) &&
    (definition.assignment.rotationDayOfWeek === undefined ||
      (Number.isInteger(definition.assignment.rotationDayOfWeek) &&
        definition.assignment.rotationDayOfWeek >= 0 && definition.assignment.rotationDayOfWeek <= 6)) &&
    (definition.assignment.rotationCadence === undefined ||
      ['scheduled_day', 'weekly'].indexOf(definition.assignment.rotationCadence) !== -1) &&
    Array.isArray(definition.assignment.participantIds) &&
    definition.assignment.participantIds.length > 0 &&
    (definition.assignment.participantScheduleOverrides === undefined ||
      (isRecord(definition.assignment.participantScheduleOverrides) &&
        Object.values(definition.assignment.participantScheduleOverrides).every(function (override) {
          return isRecord(override) && (override.dueDateOffsetDays === undefined ||
            (Number.isSafeInteger(override.dueDateOffsetDays) && override.dueDateOffsetDays >= 0 &&
              override.dueDateOffsetDays <= 365));
        }))) &&
    isRecord(definition.schedule) &&
    ['once', 'daily', 'weekly', 'monthly', 'after_completion', 'hourly'].indexOf(
      definition.schedule.frequency
    ) !== -1 &&
    (definition.schedule.frequency !== 'hourly' ||
      (Number.isSafeInteger(definition.schedule.intervalHours) &&
        definition.schedule.intervalHours >= 1 && definition.schedule.intervalHours <= 8760)) &&
    Number.isFinite(definition.dueWindowMinutes) &&
    definition.dueWindowMinutes >= 0 &&
    isRecord(definition.approval) &&
    typeof definition.approval.required === 'boolean' &&
    Array.isArray(definition.approval.approverIds) &&
    (definition.approval.resetClaimOnReject === undefined ||
      typeof definition.approval.resetClaimOnReject === 'boolean') &&
    (definition.claimPolicy === undefined ||
      (isRecord(definition.claimPolicy) &&
        (definition.claimPolicy.opensBeforeMinutes === undefined ||
          (Number.isSafeInteger(definition.claimPolicy.opensBeforeMinutes) &&
            definition.claimPolicy.opensBeforeMinutes >= 0)) &&
        (definition.claimPolicy.pendingApproval === undefined ||
          ['allow', 'block'].indexOf(definition.claimPolicy.pendingApproval) !== -1))) &&
    (definition.reminderPolicy === undefined ||
      (isRecord(definition.reminderPolicy) &&
        (definition.reminderPolicy.notifyOn === undefined ||
          (Array.isArray(definition.reminderPolicy.notifyOn) &&
            definition.reminderPolicy.notifyOn.every(function (event) {
              return ['claimed', 'completed', 'approved', 'rejected', 'skipped'].indexOf(event) !== -1;
            }))))) &&
    typeof definition.createdAt === 'string' &&
    Number.isFinite(Date.parse(definition.createdAt)) &&
    typeof definition.updatedAt === 'string' &&
    Number.isFinite(Date.parse(definition.updatedAt))
  );
}

function activeManagerCount(participantsById, timestamp) {
  let count = 0;
  for (const participantId in participantsById) {
    if (!Object.prototype.hasOwnProperty.call(participantsById, participantId)) continue;
    const participant = participantsById[participantId];
    if (
      isRecord(participant) &&
      !isParticipantPausedAt(participant, timestamp) &&
      includesValue(participant.capabilities, 'manage')
    ) {
      count += 1;
    }
  }
  return count;
}

function assertManager(data, actorParticipantId, timestamp) {
  const participant = data.participantsById[actorParticipantId];
  if (!isRecord(participant) || isParticipantPausedAt(participant, timestamp)) {
    throw new Error('An active household manager is required');
  }
  if (activeManagerCount(data.participantsById, timestamp) > 0 && !includesValue(participant.capabilities, 'manage')) {
    throw new Error('Only a household manager can change chores and profiles');
  }
}

function assertDefinitionReferences(data, definition, timestamp) {
  for (let index = 0; index < definition.assignment.participantIds.length; index += 1) {
    const participant = data.participantsById[definition.assignment.participantIds[index]];
    if (
      !isRecord(participant) ||
      isParticipantPausedAt(participant, timestamp) ||
      !includesValue(participant.capabilities, 'complete')
    ) {
      throw new Error('Chore assignment includes an ineligible participant');
    }
  }
  const standbyIds = definition.assignment.standbyParticipantIds || [];
  for (let index = 0; index < standbyIds.length; index += 1) {
    const participant = data.participantsById[standbyIds[index]];
    if (!isRecord(participant) || !includesValue(participant.capabilities, 'complete') ||
      includesValue(definition.assignment.participantIds, standbyIds[index])) {
      throw new Error('Chore standby includes an ineligible participant');
    }
  }
  for (let index = 0; index < definition.approval.approverIds.length; index += 1) {
    const approver = data.participantsById[definition.approval.approverIds[index]];
    if (
      !isRecord(approver) ||
      isParticipantPausedAt(approver, timestamp) ||
      !includesValue(approver.capabilities, 'approve')
    ) {
      throw new Error('Chore approval includes an ineligible participant');
    }
  }
  if (definition.approval.required && definition.approval.approverIds.length === 0) {
    throw new Error('A chore requiring approval needs an approver');
  }
}

function buildWorkspaceActivity(commandId, timestamp, type, details) {
  return Object.assign(
    {
      id: 'activity:' + commandId,
      commandId,
      timestamp,
      type,
    },
    details || {}
  );
}

function appendWorkspaceActivity(data, activity, enqueue) {
  return Object.assign({}, data, {
    activity: data.activity.concat([activity]).slice(-MAX_ACTIVITY_ITEMS),
    outbox: enqueue === false
      ? data.outbox
      : data.outbox.concat([createOutboxItem(activity)]).slice(-MAX_OUTBOX_ITEMS),
  });
}

function appendWorkspaceActivities(data, activities) {
  let next = data;
  for (let index = 0; index < activities.length; index += 1) {
    next = appendWorkspaceActivity(next, activities[index]);
  }
  return next;
}

function applyWorkspaceAction(data, commandId, action, timestamp, recurrenceDefinitionId) {
  recordSafety.assertSafeRecord(action);
  data = Object.assign({}, data, { occurrencesById: choreRecurrencePolicy.retainChoreSupersession(data.occurrencesById, data.definitionsById, timestamp, data.activity, Object.keys(data.participantsById)) });
  if (action.type === 'occurrence_action') {
    const next = applyOccurrenceAction(data, commandId, action, timestamp);
    const previous = data.occurrencesById[action.occurrenceId];
    const occurrence = next.occurrencesById[action.occurrenceId];
    const definition = occurrence && next.definitionsById[occurrence.definitionId];
    if (occurrence && previous.completedAt !== occurrence.completedAt &&
      definition && definition.schedule.frequency === 'after_completion') {
      const now = Date.parse(timestamp);
      return applyWorkspaceAction(next, commandId + ':recurrence', {
        type: 'materialize_occurrences',
        rangeStart: new Date(now - 90 * 86400000).toISOString(),
        rangeEnd: new Date(now + 45 * 86400000).toISOString(),
      }, timestamp, occurrence.definitionId);
    }
    return next;
  }

  if (action.type === 'participant_create') {
    const participant = action.participant;
    if (!isValidParticipantInput(participant)) throw new Error('Household profile is invalid');
    if (data.participantsById[participant.id]) throw new Error('Household profile already exists');
    if (Object.keys(data.participantsById).length === 0) {
      if (!includesValue(participant.capabilities, 'manage')) {
        throw new Error('The first household profile must be a manager');
      }
    } else {
      if (typeof action.actorParticipantId !== 'string') {
        throw new Error('A household manager is required');
      }
      assertManager(data, action.actorParticipantId, timestamp);
    }
    const participantsById = Object.assign({}, data.participantsById);
    participantsById[participant.id] = participant;
    return appendWorkspaceActivity(
      Object.assign({}, data, { participantsById }),
      buildWorkspaceActivity(commandId, timestamp, 'participant_created', {
        actorParticipantId: action.actorParticipantId,
        participantId: participant.id,
      })
    );
  }

  if (action.type === 'participant_update') {
    assertManager(data, action.actorParticipantId, timestamp);
    const participant = action.participant;
    const currentParticipant = isRecord(participant) ? data.participantsById[participant.id] : null;
    if (!isRecord(currentParticipant)) throw new Error('Household profile is no longer available');
    if (
      !isValidParticipantInput(participant) ||
      participant.createdAt !== currentParticipant.createdAt
    ) {
      throw new Error('Household profile update is invalid');
    }
    const participantsById = Object.assign({}, data.participantsById);
    participantsById[participant.id] = participant;
    if (activeManagerCount(participantsById, timestamp) === 0) {
      throw new Error('The household needs an active manager');
    }
    const pauseChanged = currentParticipant.pausedAt !== participant.pausedAt ||
      currentParticipant.resumeAt !== participant.resumeAt;
    const occurrencesById = Object.assign({}, data.occurrencesById);
    const removedIds = Object.create(null);
    if (pauseChanged) {
      for (const id in occurrencesById) {
        if (!Object.prototype.hasOwnProperty.call(occurrencesById, id)) continue;
        const occurrence = occurrencesById[id];
        const definition = data.definitionsById[occurrence.definitionId];
        const assignment = definition && definition.assignment;
        if (occurrence.status === 'available' && !occurrence.carriedForwardFrom &&
          !(includesValue(occurrence.assigneeIds, participant.id) && isParticipantPausedAt(participant, occurrence.scheduledAt)) &&
          Date.parse(occurrence.scheduledAt) > Date.parse(timestamp) && assignment &&
          (includesValue(assignment.participantIds || [], participant.id) ||
            includesValue(assignment.standbyParticipantIds || [], participant.id))) {
          recordSafety.setOwnRecordValue(removedIds, id, true);
          delete occurrencesById[id];
        }
      }
    }
    const outbox = data.outbox.filter(function (item) {
      return item.status === 'delivered' || !item.occurrenceId || !removedIds[item.occurrenceId];
    });
    return appendWorkspaceActivity(
      Object.assign({}, data, { participantsById, occurrencesById, outbox }),
      buildWorkspaceActivity(commandId, timestamp, 'participant_updated', {
        actorParticipantId: action.actorParticipantId,
        participantId: participant.id,
      })
    );
  }

  if (action.type === 'definition_create' || action.type === 'definition_update') {
    assertManager(data, action.actorParticipantId, timestamp);
    const definition = action.definition;
    if (!isValidDefinitionInput(definition)) throw new Error('Chore definition is invalid');
    const currentDefinition = data.definitionsById[definition.id];
    if (action.type === 'definition_create' && currentDefinition) throw new Error('Chore already exists');
    if (action.type === 'definition_update' && !isRecord(currentDefinition)) {
      throw new Error('Chore is no longer available');
    }
    if (
      action.type === 'definition_update' &&
      definition.createdAt !== currentDefinition.createdAt
    ) {
      throw new Error('Chore creation time cannot be changed');
    }
    assertDefinitionReferences(data, definition, timestamp);
    const definitionsById = Object.assign({}, data.definitionsById);
    definitionsById[definition.id] = definition;
    let occurrencesById = data.occurrencesById;
    let outbox = data.outbox;
    if (currentDefinition && (
      JSON.stringify(currentDefinition.schedule) !== JSON.stringify(definition.schedule) ||
      JSON.stringify(currentDefinition.assignment) !== JSON.stringify(definition.assignment) ||
      currentDefinition.dueWindowMinutes !== definition.dueWindowMinutes
    )) {
      occurrencesById = Object.create(null);
      const removedIds = Object.create(null);
      for (const id in data.occurrencesById) {
        if (!Object.prototype.hasOwnProperty.call(data.occurrencesById, id)) continue;
        const occurrence = data.occurrencesById[id];
        if (occurrence.definitionId === definition.id && Date.parse(occurrence.scheduledAt) > Date.parse(timestamp) && occurrence.status === 'available' && occurrence.carriedForwardFrom === undefined) {
          recordSafety.setOwnRecordValue(removedIds, id, true);
        } else {
          recordSafety.setOwnRecordValue(occurrencesById, id, occurrence);
        }
      }
      outbox = data.outbox.filter((item) => item.status === 'delivered' || !item.occurrenceId || !removedIds[item.occurrenceId]);
    }
    return appendWorkspaceActivity(
      Object.assign({}, data, { definitionsById, occurrencesById, outbox }),
      buildWorkspaceActivity(
        commandId,
        timestamp,
        action.type === 'definition_create' ? 'definition_created' : 'definition_updated',
        { actorParticipantId: action.actorParticipantId, definitionId: definition.id }
      )
    );
  }

  if (action.type === 'definition_archive' || action.type === 'definition_restore') {
    assertManager(data, action.actorParticipantId, timestamp);
    const definition = data.definitionsById[action.definitionId];
    if (!isRecord(definition)) throw new Error('Chore is no longer available');
    const nextDefinition = Object.assign({}, definition, { enabled: true, updatedAt: timestamp });
    if (action.type === 'definition_archive') {
      nextDefinition.enabled = false;
      nextDefinition.archivedAt = timestamp;
    } else {
      delete nextDefinition.archivedAt;
    }
    const definitionsById = Object.assign({}, data.definitionsById);
    definitionsById[action.definitionId] = nextDefinition;
    let occurrencesById = data.occurrencesById;
    if (action.type === 'definition_archive') {
      occurrencesById = Object.create(null);
      for (const occurrenceId in data.occurrencesById) {
        if (!Object.prototype.hasOwnProperty.call(data.occurrencesById, occurrenceId)) continue;
        const occurrence = data.occurrencesById[occurrenceId];
        if (
          occurrence.definitionId !== action.definitionId ||
          occurrence.status === 'done' ||
          occurrence.status === 'skipped' ||
          (occurrence.status === 'missed' && !!(occurrence.supersededAt || occurrence.carriedForwardTo))
        ) {
          recordSafety.setOwnRecordValue(occurrencesById, occurrenceId, occurrence);
        }
      }
    }
    return appendWorkspaceActivity(
      Object.assign({}, data, { definitionsById, occurrencesById }),
      buildWorkspaceActivity(
        commandId,
        timestamp,
        action.type === 'definition_archive' ? 'definition_archived' : 'definition_updated',
        { actorParticipantId: action.actorParticipantId, definitionId: action.definitionId }
      )
    );
  }

  if (action.type === 'definition_delete') {
    assertManager(data, action.actorParticipantId, timestamp);
    if (!isRecord(data.definitionsById[action.definitionId])) {
      throw new Error('Chore is no longer available');
    }
    const definitionsById = Object.assign({}, data.definitionsById);
    delete definitionsById[action.definitionId];
    const occurrencesById = Object.create(null);
    const removedOccurrenceIds = Object.create(null);
    for (const occurrenceId in data.occurrencesById) {
      if (!Object.prototype.hasOwnProperty.call(data.occurrencesById, occurrenceId)) continue;
      const occurrence = data.occurrencesById[occurrenceId];
      if (occurrence.definitionId === action.definitionId) {
        recordSafety.setOwnRecordValue(removedOccurrenceIds, occurrenceId, true);
      } else {
        recordSafety.setOwnRecordValue(occurrencesById, occurrenceId, occurrence);
      }
    }
    const removedActivityIds = Object.create(null);
    for (let activityIndex = 0; activityIndex < data.activity.length; activityIndex += 1) {
      const activity = data.activity[activityIndex];
      if (activity.occurrenceId && removedOccurrenceIds[activity.occurrenceId]) {
        recordSafety.setOwnRecordValue(removedActivityIds, activity.id, true);
      }
    }
    const presentationByDefinitionId = Object.assign(
      {},
      data.experience.presentationByDefinitionId
    );
    delete presentationByDefinitionId[action.definitionId];
    const missionsById = Object.create(null);
    for (const missionId in data.experience.missionsById) {
      if (!Object.prototype.hasOwnProperty.call(data.experience.missionsById, missionId)) continue;
      const mission = data.experience.missionsById[missionId];
      const definitionIds = mission.definitionIds.filter(function (definitionId) {
        return definitionId !== action.definitionId;
      });
      if (definitionIds.length > 0) {
        recordSafety.setOwnRecordValue(missionsById, missionId, Object.assign({}, mission, { definitionIds }));
      }
    }
    const experience = Object.assign({}, data.experience, {
      presentationByDefinitionId,
      missionsById,
      awardedMissionIds: Array.isArray(data.experience.awardedMissionIds)
        ? data.experience.awardedMissionIds.filter(function (missionId) {
            return Boolean(missionsById[missionId]);
          })
        : undefined,
    });
    return appendWorkspaceActivity(
      Object.assign({}, data, {
        definitionsById,
        occurrencesById,
        outbox: data.outbox.filter(function (item) {
          return (
            (!item.occurrenceId || !removedOccurrenceIds[item.occurrenceId]) &&
            !removedActivityIds[item.activityId]
          );
        }),
        experience,
      }),
      buildWorkspaceActivity(commandId, timestamp, 'definition_deleted', {
        actorParticipantId: action.actorParticipantId,
        definitionId: action.definitionId,
      })
    );
  }

  if (action.type === 'retention_update') {
    assertManager(data, action.actorParticipantId, timestamp);
    if (!isValidHistoryRetention(action.policy)) {
      throw new Error('Chore history retention policy is invalid');
    }
    return appendWorkspaceActivity(
      Object.assign({}, data, { historyRetention: Object.assign({}, action.policy) }),
      buildWorkspaceActivity(commandId, timestamp, 'retention_updated', {
        actorParticipantId: action.actorParticipantId,
      })
    );
  }

  if (action.type === 'experience_update') {
    assertManager(data, action.actorParticipantId, timestamp);
    if (!isValidChoreExperience(action.experience)) {
      throw new Error('Chore experience data is invalid');
    }
    const currentExperience = data.experience || createEmptyChoreExperience();
    if (JSON.stringify(action.experience.rewardRequestsById) !== JSON.stringify(currentExperience.rewardRequestsById) ||
      JSON.stringify(action.experience.pointTransactions) !== JSON.stringify(currentExperience.pointTransactions) ||
      JSON.stringify(action.experience.progressAwards) !== JSON.stringify(currentExperience.progressAwards) ||
      JSON.stringify(action.experience.earnedPointsByParticipant) !== JSON.stringify(currentExperience.earnedPointsByParticipant)) {
      throw new Error('Reward and point history can only change through household actions');
    }
    for (const definitionId in action.experience.presentationByDefinitionId) {
      if (!data.definitionsById[definitionId]) {
        throw new Error('Chore experience references an unavailable chore');
      }
    }
    for (const missionId in action.experience.missionsById) {
      const mission = action.experience.missionsById[missionId];
      if (mission.definitionIds.some(function (definitionId) { return !data.definitionsById[definitionId]; })) {
        throw new Error('Chore mission references an unavailable chore');
      }
    }
    for (const rewardId in action.experience.rewardGoalsById) {
      const reward = action.experience.rewardGoalsById[rewardId];
      if (reward.participantId && !data.participantsById[reward.participantId]) {
        throw new Error('Chore reward references an unavailable participant');
      }
    }
    if (action.experience.earnedPointsByParticipant) {
      for (const participantId in action.experience.earnedPointsByParticipant) {
        if (!data.participantsById[participantId]) {
          throw new Error('Chore experience points reference an unavailable participant');
        }
      }
    }
    return appendWorkspaceActivity(
      Object.assign({}, data, { experience: action.experience }),
      buildWorkspaceActivity(commandId, timestamp, 'experience_updated', {
        actorParticipantId: action.actorParticipantId,
      })
    );
  }

  if (action.type === 'experience_points_adjust') {
    assertManager(data, action.actorParticipantId, timestamp);
    if (!data.participantsById[action.participantId]) {
      throw new Error('Chore participant is no longer available');
    }
    if (
      !Number.isSafeInteger(action.pointsDelta) ||
      action.pointsDelta === 0 ||
      Math.abs(action.pointsDelta) > 10000
    ) {
      throw new Error('Point adjustment must be a non-zero whole number up to 10000');
    }
    const reason = typeof action.reason === 'string' ? action.reason.trim() || undefined : undefined;
    const experience = isValidChoreExperience(data.experience)
      ? data.experience
      : createEmptyChoreExperience();
    const balances = getExperiencePointBalances(data, experience);
    const nextBalance = (balances[action.participantId] || 0) + action.pointsDelta;
    if (Math.abs(nextBalance) > 1000000000) {
      throw new Error('Point balance must stay between -1000000000 and 1000000000');
    }
    balances[action.participantId] = nextBalance;
    return appendWorkspaceActivity(
      Object.assign({}, data, {
        experience: Object.assign({}, experience, { earnedPointsByParticipant: balances,
          pointTransactions: experience.pointTransactions.concat([{
            id: 'points:' + commandId, participantId: action.participantId,
            pointsDelta: action.pointsDelta, kind: 'adjustment', timestamp, commandId,
          }]) }),
      }),
      buildWorkspaceActivity(commandId, timestamp, 'points_adjusted', {
        actorParticipantId: action.actorParticipantId,
        participantId: action.participantId,
        reason,
        pointsDelta: action.pointsDelta,
      }),
      false
    );
  }

  if (action.type === 'reward_request') {
    const participant = data.participantsById[action.participantId];
    if (!isRecord(participant) || isParticipantPausedAt(participant, timestamp) ||
      !includesValue(participant.capabilities, 'complete')) throw new Error('Chore participant is not active');
    const experience = data.experience || createEmptyChoreExperience();
    if (experience.gamificationMode === 'off') throw new Error('Rewards are unavailable');
    if (experience.rewardRequestsById[action.requestId]) throw new Error('Reward request already exists');
    const reward = experience.rewardGoalsById[action.rewardId];
    if (!reward || !reward.enabled ||
      (reward.participantId && reward.participantId !== action.participantId)) throw new Error('Reward is unavailable');
    if ((getExperiencePointBalances(data, experience)[action.participantId] || 0) < reward.targetPoints) {
      throw new Error('Not enough points for this reward');
    }
    const requests = Object.assign({}, experience.rewardRequestsById);
    requests[action.requestId] = { id: action.requestId, rewardId: reward.id,
      rewardTitle: reward.title, cost: reward.targetPoints, participantId: action.participantId,
      status: 'requested', requestedAt: timestamp, updatedAt: timestamp };
    return appendWorkspaceActivity(Object.assign({}, data, { experience: Object.assign({}, experience,
      { rewardRequestsById: requests }) }), buildWorkspaceActivity(commandId, timestamp,
      'reward_requested', { actorParticipantId: action.participantId, participantId: action.participantId }));
  }
  if (action.type === 'reward_decision') {
    assertManager(data, action.actorParticipantId, timestamp);
    const experience = data.experience || createEmptyChoreExperience();
    const request = experience.rewardRequestsById[action.requestId];
    if (!request) throw new Error('Reward request is no longer available');
    const decision = action.decision;
    if ((decision === 'approve' || decision === 'decline') && request.status !== 'requested' ||
      decision === 'fulfill' && request.status !== 'approved' ||
      decision === 'refund' && ['approved', 'fulfilled'].indexOf(request.status) === -1) {
      throw new Error('Reward request has already changed');
    }
    const status = decision === 'approve' ? 'approved' : decision === 'decline' ? 'declined' :
      decision === 'fulfill' ? 'fulfilled' : 'refunded';
    const pointsDelta = decision === 'approve' ? -request.cost : decision === 'refund' ? request.cost : 0;
    const balances = getExperiencePointBalances(data, experience);
    if (pointsDelta < 0 && (balances[request.participantId] || 0) < request.cost) {
      throw new Error('Not enough points for this reward');
    }
    if (pointsDelta) recordSafety.setOwnRecordValue(balances, request.participantId, (balances[request.participantId] || 0) + pointsDelta);
    const requests = Object.assign({}, experience.rewardRequestsById);
    recordSafety.setOwnRecordValue(requests, request.id, Object.assign({}, request, { status, updatedAt: timestamp,
      managerParticipantId: action.actorParticipantId, reason: action.reason && action.reason.trim() }));
    const transactions = experience.pointTransactions.concat([{
      id: 'points:reward:' + request.id + ':' + decision,
      participantId: request.participantId, pointsDelta,
      kind: decision === 'approve' ? 'reward' : decision === 'refund' ? 'refund' : 'reward_decision', timestamp, commandId,
      rewardRequestId: request.id,
    }]);
    return appendWorkspaceActivity(Object.assign({}, data, { experience: Object.assign({}, experience,
      { rewardRequestsById: requests, earnedPointsByParticipant: balances, pointTransactions: transactions }) }),
      buildWorkspaceActivity(commandId, timestamp, 'reward_' + status, {
        actorParticipantId: action.actorParticipantId, participantId: request.participantId,
        reason: action.reason && action.reason.trim(), pointsDelta: Math.abs(pointsDelta) <= 10000 ? pointsDelta || undefined : undefined,
      }));
  }
  if (action.type === 'reminder_acknowledge') {
    let reminder = null;
    for (let index = 0; index < data.outbox.length; index += 1) {
      if (data.outbox[index].id === action.outboxId) reminder = data.outbox[index];
    }
    if (!reminder || String(reminder.eventType).indexOf('reminder_') !== 0) {
      throw new Error('Chore reminder is no longer available');
    }
    const actor = data.participantsById[action.actorParticipantId];
    if (!isRecord(actor) || isParticipantPausedAt(actor, timestamp)) {
      throw new Error('Chore participant is not active');
    }
    if (
      reminder.participantId !== action.actorParticipantId &&
      !includesValue(actor.capabilities, 'manage')
    ) {
      throw new Error('Participant cannot acknowledge this chore reminder');
    }
    const outbox = data.outbox.map(function (item) {
      return item.id === reminder.id
        ? Object.assign({}, item, {
            status: 'delivered',
            deliveredAt: timestamp,
            lastAttemptAt: timestamp,
          })
        : item;
    });
    const occurrence = data.occurrencesById[reminder.occurrenceId];
    return appendWorkspaceActivity(
      Object.assign({}, data, { outbox }),
      buildWorkspaceActivity(commandId, timestamp, 'reminder_acknowledged', {
        occurrenceId: reminder.occurrenceId,
        definitionId: isRecord(occurrence) ? occurrence.definitionId : undefined,
        participantId: reminder.participantId,
        actorParticipantId: action.actorParticipantId,
        outboxId: reminder.id,
      })
    );
  }

  if (action.type === 'outbox_delivery_update') {
    let target = null;
    for (let index = 0; index < data.outbox.length; index += 1) {
      if (data.outbox[index].id === action.outboxId) target = data.outbox[index];
    }
    if (!target) throw new Error('Chore outbox item is no longer available');
    const attempt = target.attempts + 1;
    const retryDelay = Math.min(60 * 60000, Math.pow(2, Math.min(attempt, 10)) * 30000);
    const outbox = data.outbox.map(function (item) {
      if (item.id !== target.id) return item;
      const next = Object.assign({}, item, {
        status: action.status,
        attempts: attempt,
        lastAttemptAt: timestamp,
      });
      if (action.status === 'delivered') {
        next.deliveredAt = timestamp;
        delete next.lastError;
      } else {
        delete next.deliveredAt;
        next.lastError = action.error && action.error.trim() ? action.error.trim() : 'Delivery failed';
        next.nextAttemptAt = new Date(Date.parse(timestamp) + retryDelay).toISOString();
      }
      return next;
    });
    const occurrence = data.occurrencesById[target.occurrenceId];
    return appendWorkspaceActivity(
      Object.assign({}, data, { outbox }),
      buildWorkspaceActivity(commandId, timestamp, 'outbox_delivery_updated', {
        occurrenceId: target.occurrenceId,
        definitionId: isRecord(occurrence) ? occurrence.definitionId : undefined,
        participantId: target.participantId,
        outboxId: target.id,
        reason:
          action.status === 'failed'
            ? action.error && action.error.trim() ? action.error.trim() : 'Delivery failed'
            : undefined,
      }),
      false
    );
  }

  if (action.type === 'vacation_reschedule') {
    assertManager(data, action.actorParticipantId, timestamp);
    const participant = data.participantsById[action.participantId];
    if (!isRecord(participant) || !participant.pausedAt || !participant.resumeAt) {
      throw new Error('A scheduled return is required');
    }
    choreCalendarPolicy.parseDateKey(action.startDate);
    let hasDuplicateIds = false;
    for (let index = 0; index < action.occurrenceIds.length; index += 1) {
      if (action.occurrenceIds.indexOf(action.occurrenceIds[index]) !== index) hasDuplicateIds = true;
    }
    if (action.occurrenceIds.length === 0 || action.occurrenceIds.length > 100 ||
      hasDuplicateIds) {
      throw new Error('Choose eligible chores to move');
    }
    const occurrencesById = Object.assign({}, data.occurrencesById);
    const selected = action.occurrenceIds.map(function (id) {
      const occurrence = occurrencesById[id];
      if (!isRecord(occurrence) || occurrence.status !== 'available' || occurrence.claimedAt ||
        occurrence.carriedForwardTo || !includesValue(occurrence.assigneeIds, participant.id) ||
        Date.parse(occurrence.scheduledAt) < Date.parse(participant.pausedAt) ||
        Date.parse(occurrence.scheduledAt) >= Date.parse(participant.resumeAt)) {
        throw new Error('A selected chore can no longer be moved');
      }
      return occurrence;
    }).sort(function (left, right) {
      return left.scheduledAt < right.scheduledAt ? -1 : left.scheduledAt > right.scheduledAt ? 1 : 0;
    });
    const activities = [];
    for (let index = 0; index < selected.length; index += 1) {
      const occurrence = selected[index];
      const definition = data.definitionsById[occurrence.definitionId];
      if (!isRecord(definition)) throw new Error('Chore definition is no longer available');
      const parts = getTimeZoneParts(Date.parse(occurrence.scheduledAt), definition.schedule.timeZone);
      const scheduledAt = localDateTimeToIso(choreCalendarPolicy.addCalendarDays(action.startDate, index),
        parts.hour + ':' + parts.minute, definition.schedule.timeZone);
      if (Date.parse(scheduledAt) <= Date.parse(timestamp) ||
        Date.parse(scheduledAt) < Date.parse(participant.resumeAt)) {
        throw new Error('Moved chores must begin after the return');
      }
      const id = definition.id + ':' + scheduledAt + ':vacation:' + occurrence.id;
      if (occurrencesById[id]) throw new Error('Moved chore already exists');
      recordSafety.setOwnRecordValue(occurrencesById, occurrence.id, Object.assign({}, occurrence, {
        status: 'skipped', skippedBy: action.actorParticipantId,
        skippedAt: timestamp, carriedForwardTo: id, updatedAt: timestamp,
      }));
      const moved = Object.assign({}, occurrence, {
        id, scheduledAt,
        dueAt: new Date(Date.parse(scheduledAt) + Date.parse(occurrence.dueAt) -
          Date.parse(occurrence.scheduledAt)).toISOString(),
        status: 'available', carriedForwardFrom: occurrence.id,
        updatedAt: timestamp,
      });
      delete moved.carriedForwardTo;
      delete moved.skippedBy;
      delete moved.skippedAt;
      occurrencesById[id] = moved;
      activities.push({ id: 'activity:' + commandId + ':created:' + id,
        commandId, occurrenceId: id, definitionId: definition.id,
        assigneeIds: occurrence.assigneeIds, type: 'occurrence_created',
        reason: 'Moved after vacation', timestamp });
    }
    const outbox = data.outbox.filter(function (item) {
      return item.status === 'delivered' || !includesValue(action.occurrenceIds, item.occurrenceId);
    });
    activities.push(buildWorkspaceActivity(commandId, timestamp, 'vacation_rescheduled', {
      actorParticipantId: action.actorParticipantId, participantId: participant.id,
    }));
    return appendWorkspaceActivities(Object.assign({}, data, { occurrencesById, outbox }), activities);
  }

  const rangeStart = Date.parse(action.rangeStart);
  const rangeEnd = Date.parse(action.rangeEnd);
  if (
    !Number.isFinite(rangeStart) ||
    !Number.isFinite(rangeEnd) ||
    rangeEnd < rangeStart ||
    rangeEnd - rangeStart > 180 * 86400000
  ) {
    throw new Error('Chore materialization range is invalid');
  }
  const occurrencesById = Object.assign({}, data.occurrencesById);
  const occurrenceCreatedActivities = [];
  const recurrenceIds = Object.create(null);
  const definitionIds = Object.keys(data.definitionsById);
  for (let definitionIndex = 0; definitionIndex < definitionIds.length; definitionIndex += 1) {
    const definition = data.definitionsById[definitionIds[definitionIndex]];
    const completed = Object.values(occurrencesById)
      .filter(function (occurrence) {
        return occurrence.definitionId === definition.id && typeof occurrence.completedAt === 'string';
      })
      .map(function (occurrence) { return occurrence.completedAt; })
      .sort(function (a, b) { return choreRecurrencePolicy.parseChoreInstant(a) - choreRecurrencePolicy.parseChoreInstant(b); });
    const materialized = materializeDefinition(
      definition,
      data.participantsById,
      action.rangeStart,
      action.rangeEnd,
      occurrencesById,
      completed.length > 0 ? completed[completed.length - 1] : undefined,
      definition.id === recurrenceDefinitionId
    );
    if (definition.id === recurrenceDefinitionId) {
      for (let index = 0; index < materialized.length; index += 1) recordSafety.setOwnRecordValue(recurrenceIds, materialized[index].id, true);
    }
    if (materialized.filter(function (item) { return !occurrencesById[item.id]; }).length > 5000) {
      throw new Error('Too many chore occurrences');
    }
    for (let index = 0; index < materialized.length; index += 1) {
      if (!occurrencesById[materialized[index].id]) {
        const occurrence = materialized[index];
        if (Date.parse(occurrence.scheduledAt) <= Date.parse(timestamp) && Object.values(data.occurrencesById).some(function (existing) {
          return existing.definitionId === occurrence.definitionId &&
            existing.scheduledAt === occurrence.scheduledAt &&
            (definition.assignment.mode !== 'everyone' || existing.assignmentSlot === occurrence.assignmentSlot);
        })) continue;
        recordSafety.setOwnRecordValue(occurrencesById, occurrence.id, occurrence);
        occurrenceCreatedActivities.push({
          id: 'activity:' + commandId + ':created:' + occurrence.id,
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
            id: 'activity:scheduler:due:' + occurrence.id,
            commandId: 'scheduler:due:' + occurrence.id,
            occurrenceId: occurrence.id,
            definitionId: occurrence.definitionId,
            assigneeIds: occurrence.assigneeIds,
            type: 'due',
            timestamp: occurrence.dueAt,
          });
        }
        if (Number.isFinite(dueAt) && materializedAt > dueAt) {
          occurrenceCreatedActivities.push({
            id: 'activity:scheduler:overdue:' + occurrence.id,
            commandId: 'scheduler:overdue:' + occurrence.id,
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
  const removedRecurrenceIds = Object.create(null);
  for (const id in occurrencesById) {
    const item = occurrencesById[id];
    if (item.definitionId === recurrenceDefinitionId && !recurrenceIds[id] &&
        item.status === 'available' && !item.carriedForwardFrom && Date.parse(item.scheduledAt) > Date.parse(timestamp) &&
        !item.assigneeIds.some(function (participantId) {
          const participant = data.participantsById[participantId];
          return participant && isParticipantPausedAt(participant, item.scheduledAt);
        })) {
      delete occurrencesById[id]; recordSafety.setOwnRecordValue(removedRecurrenceIds, id, true);
    }
  }
  const outbox = data.outbox.filter(function (item) {
    return item.status === 'delivered' || !item.occurrenceId || !removedRecurrenceIds[item.occurrenceId];
  });
  const retentionBoundary = Date.parse(timestamp) - 90 * 86400000;
  for (const occurrenceId in occurrencesById) {
    if (!Object.prototype.hasOwnProperty.call(occurrencesById, occurrenceId)) continue;
    const occurrence = occurrencesById[occurrenceId];
    if (
      choreRecurrencePolicy.shouldPruneChoreOccurrence(occurrence, data.definitionsById, occurrencesById, retentionBoundary, Object.keys(data.participantsById))
    ) {
      delete occurrencesById[occurrenceId];
    }
  }
  return appendWorkspaceActivities(
    Object.assign({}, data, { occurrencesById, outbox }),
    occurrenceCreatedActivities.concat([
      buildWorkspaceActivity(commandId, timestamp, 'workspace_materialized'),
    ])
  );
}

function emptyData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    participantsById: {},
    definitionsById: {},
    occurrencesById: {},
    activity: [],
    outbox: [],
    historyRetention: Object.assign({}, DEFAULT_HISTORY_RETENTION),
    experience: createEmptyChoreExperience(),
  };
}

function isValidDocument(value) {
  return (
    isRecord(value) &&
    value.contractVersion === CONTRACT_VERSION &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 0 &&
    typeof value.updatedAt === 'string' &&
    Number.isFinite(Date.parse(value.updatedAt)) &&
    isValidChoreWorkspaceData(value.data)
  );
}

function durableHash(value) {
  return hashCrypto.createHash('sha256').update(value).digest('hex');
}

function readStoredDocument(path, fallback) {
  return choreDurableStorage.decode(
    readJson(path, fallback, MAX_CHORE_WORKSPACE_BYTES), durableHash,
    function (key) { return readJson(CHORE_WORKSPACE_PATH + '.chunk-' + key, null, choreDurableStorage.CHUNK_BYTES); }
  );
}

function writeStoredDocument(path, document) {
  const stored = choreDurableStorage.encode(document, MAX_CHORE_WORKSPACE_BYTES, durableHash,
    function (key, chunk) { writeJson(CHORE_WORKSPACE_PATH + '.chunk-' + key, chunk, choreDurableStorage.CHUNK_BYTES); });
  writeJson(path, stored, MAX_CHORE_WORKSPACE_BYTES);
}

function readDocumentCandidate(path) {
  try {
    const value = readStoredDocument(path, null);
    if (isValidDocument(value)) return value;
    if (
      isRecord(value) &&
      value.contractVersion === CONTRACT_VERSION &&
      Number.isSafeInteger(value.revision) &&
      value.revision >= 0 &&
      typeof value.updatedAt === 'string' &&
      Number.isFinite(Date.parse(value.updatedAt))
    ) {
      const migratedData = migrateChoreWorkspaceData(value.data);
      if (migratedData) return Object.assign({}, value, { data: migratedData });
    }
  } catch (_error) {
    return null;
  }
  return null;
}

function persistDocument(previous, next) {
  writeStoredDocument(CHORE_LAST_GOOD_WORKSPACE_PATH, previous);
  writeStoredDocument(CHORE_WORKSPACE_PATH, next);
}

function applyScheduledState(document) {
  const timestamp = nowIso();
  lastSchedulerRunAt = timestamp;
  const scheduled = runWorkspaceScheduler(document.data, timestamp);
  if (scheduled.activities.length === 0 && scheduled.outboxItems.length === 0 && sameObjectKeys(scheduled.data.occurrencesById, document.data.occurrencesById)) {
    appendEventHistory(document.data.activity, document.data.historyRetention);
    return document;
  }
  const nextDocument = Object.assign({}, document, {
    revision: document.revision + 1,
    updatedAt: timestamp,
    data: scheduled.data,
  });
  persistDocument(document, nextDocument);
  appendEventHistory(nextDocument.data.activity, nextDocument.data.historyRetention);
  return nextDocument;
}

function sameObjectKeys(left, right) {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index += 1) {
    if (leftKeys[index] !== rightKeys[index] || left[leftKeys[index]].supersededAt !== right[rightKeys[index]].supersededAt) return false;
  }
  return true;
}

function materializePeriodicWindow(document, timestamp) {
  const now = Date.parse(timestamp);
  const commandId = 'periodic:materialize:' + timestamp;
  const candidate = applyWorkspaceAction(document.data, commandId, {
    type: 'materialize_occurrences',
    rangeStart: new Date(now - 90 * 86400000).toISOString(),
    rangeEnd: new Date(now + 45 * 86400000).toISOString(),
  }, timestamp);
  if (sameObjectKeys(candidate.occurrencesById, document.data.occurrencesById)) {
    return document;
  }
  const next = {
    contractVersion: CONTRACT_VERSION,
    revision: document.revision + 1,
    updatedAt: timestamp,
    data: candidate,
  };
  persistDocument(document, next);
  appendEventHistory(next.data.activity, next.data.historyRetention);
  return next;
}

function pendingHomeAssistantReminders(document, timestamp) {
  const now = Date.parse(timestamp);
  return document.data.outbox.filter(function (item) {
    const occurrence = document.data.occurrencesById[item.occurrenceId];
    return (
      item.destination === 'home_assistant' &&
      occurrence && (!item.occurrenceUpdatedAt || item.occurrenceUpdatedAt === occurrence.updatedAt) &&
      (item.status === 'pending' || item.status === 'failed') &&
      Date.parse(item.nextAttemptAt) <= now
    );
  }).slice(0, 10);
}

function reminderPayload(document, item) {
  const occurrence = document.data.occurrencesById[item.occurrenceId] || {};
  const definition = document.data.definitionsById[occurrence.definitionId] || {};
  const title = definition.title || 'Navet chore';
  return {
    title,
    message: title,
    data: {
      choreOccurrenceId: item.occurrenceId,
      choreDefinitionId: occurrence.definitionId,
      choreOccurrenceUpdatedAt: item.occurrenceUpdatedAt,
    },
  };
}

async function deliverHomeAssistantReminder(document, item) {
  const token = process.env.SUPERVISOR_TOKEN || '';
  if (!token) throw new Error('Home Assistant Supervisor access is unavailable');
  const target = typeof item.destinationTarget === 'string'
    ? item.destinationTarget.replace(/^notify\./, '')
    : '';
  if (target && !/^[a-z0-9_]{1,128}$/.test(target)) {
    throw new Error('Home Assistant notification target is invalid');
  }
  const servicePath = target
    ? '/api/services/notify/' + target
    : '/api/services/persistent_notification/create';
  const payload = reminderPayload(document, item);
  if (!target) payload.notification_id = 'navet_chore_' + item.id;
  const response = await ngx.fetch('http://supervisor/core' + servicePath, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error('Home Assistant reminder delivery failed with status ' + response.status);
  }
}

function recordPeriodicDelivery(item, status, errorMessage) {
  const current = readDocument();
  const currentItem = current.data.outbox.find(function (candidate) {
    return candidate.id === item.id;
  });
  if (!currentItem || (currentItem.status !== 'pending' && currentItem.status !== 'failed')) {
    return;
  }
  const timestamp = nowIso();
  const commandId = 'periodic:delivery:' + item.id + ':' + (currentItem.attempts + 1);
  const nextData = applyWorkspaceAction(current.data, commandId, {
    type: 'outbox_delivery_update',
    outboxId: item.id,
    status,
    error: errorMessage,
  }, timestamp);
  const next = {
    contractVersion: CONTRACT_VERSION,
    revision: current.revision + 1,
    updatedAt: timestamp,
    data: nextData,
  };
  persistDocument(current, next);
  appendEventHistory(next.data.activity, next.data.historyRetention);
}

async function runPeriodic(_session) {
  const timestamp = nowIso();
  lastSchedulerRunAt = timestamp;
  let document = materializePeriodicWindow(readDocument(), timestamp);
  document = applyScheduledState(document);
  const reminders = pendingHomeAssistantReminders(document, timestamp);
  for (let index = 0; index < reminders.length; index += 1) {
    try {
      await deliverHomeAssistantReminder(document, reminders[index]);
      recordPeriodicDelivery(reminders[index], 'delivered');
      lastDeliveryError = null;
    } catch (error) {
      lastDeliveryError = error && error.message ? error.message : 'Reminder delivery failed';
      try {
        recordPeriodicDelivery(reminders[index], 'failed', lastDeliveryError);
      } catch (_recordError) {
        // The next periodic run reloads the workspace and retries the pending item.
      }
    }
  }
}

function readDocument() {
  const missing = {};
  let document;
  try {
    document = readStoredDocument(CHORE_WORKSPACE_PATH, missing);
  } catch (_error) {
    document = null;
  }
  if (document === missing) {
    return {
      contractVersion: CONTRACT_VERSION,
      revision: 0,
      updatedAt: nowIso(),
      data: emptyData(),
    };
  }
  if (isValidDocument(document)) return applyScheduledState(document);
  if (
    isRecord(document) &&
    document.contractVersion === CONTRACT_VERSION &&
    Number.isSafeInteger(document.revision) &&
    document.revision >= 0 &&
    typeof document.updatedAt === 'string' &&
    Number.isFinite(Date.parse(document.updatedAt))
  ) {
    const migratedData = migrateChoreWorkspaceData(document.data);
    if (migratedData) {
      const timestamp = nowIso();
      const scheduled = runWorkspaceScheduler(migratedData, timestamp);
      const migratedDocument = Object.assign({}, document, {
        revision: document.revision + 1,
        updatedAt: timestamp,
        data: scheduled.data,
      });
      persistDocument(document, migratedDocument);
      appendEventHistory(migratedDocument.data.activity, migratedDocument.data.historyRetention);
      return migratedDocument;
    }
  }
  const backup = readDocumentCandidate(CHORE_LAST_GOOD_WORKSPACE_PATH);
  if (backup) {
    const recovered = Object.assign({}, backup, {
      revision: backup.revision + 1,
      updatedAt: nowIso(),
    });
    writeStoredDocument(CHORE_WORKSPACE_PATH, recovered);
    appendEventHistory(recovered.data.activity, recovered.data.historyRetention);
    return recovered;
  }
  const error = new Error('Chore workspace document is invalid');
  error.code = 'NAVET_CHORE_WORKSPACE_INVALID';
  throw error;
}

function readJournal(activity) {
  try {
    const journal = readJson(
      CHORE_JOURNAL_PATH,
      { contractVersion: CONTRACT_VERSION, commands: [] },
      MAX_CHORE_JOURNAL_BYTES
    );
    if (
      !isRecord(journal) ||
      journal.contractVersion !== CONTRACT_VERSION ||
      !Array.isArray(journal.commands)
    ) {
      throw new Error('Chore command journal is invalid');
    }
    return journal;
  } catch (_error) {
    const seen = Object.create(null);
    const commands = [];
    const source = Array.isArray(activity) ? activity : [];
    for (let index = 0; index < source.length; index += 1) {
      const event = source[index];
      if (!event || typeof event.commandId !== 'string' || seen[event.commandId]) continue;
      recordSafety.setOwnRecordValue(seen, event.commandId, true);
      commands.push({ commandId: event.commandId, revision: 0, timestamp: event.timestamp });
    }
    const repaired = {
      contractVersion: CONTRACT_VERSION,
      commands: commands.slice(-MAX_COMMAND_JOURNAL_ITEMS),
    };
    writeJson(CHORE_JOURNAL_PATH, repaired, MAX_CHORE_JOURNAL_BYTES);
    return repaired;
  }
}

function applyRevisionHeader(r, revision) {
  r.headersOut[HEADERS.revision] = String(revision);
}

function readManagementSecurity(tenantId) {
  const security = readJson(
    CHORE_MANAGEMENT_SECURITY_PATH,
    null,
    MAX_CHORE_MANAGEMENT_SECURITY_BYTES
  );
  if (security === null) return null;
  if (
    !isRecord(security) ||
    security.contractVersion !== CONTRACT_VERSION ||
    security.tenantId !== tenantId ||
    typeof security.salt !== 'string' ||
    typeof security.pinHash !== 'string'
  ) {
    throw new Error('Chore management security is invalid');
  }
  return security;
}

function rebindManagementSecurityToAuthorizedTenant(tenantId) {
  const security = readJson(
    CHORE_MANAGEMENT_SECURITY_PATH,
    null,
    MAX_CHORE_MANAGEMENT_SECURITY_BYTES
  );
  if (security === null || security.tenantId === tenantId) return;
  if (
    !isRecord(security) ||
    security.contractVersion !== CONTRACT_VERSION ||
    typeof security.tenantId !== 'string' ||
    !TENANT_ID_PATTERN.test(security.tenantId) ||
    typeof security.salt !== 'string' ||
    typeof security.pinHash !== 'string'
  ) {
    throw new Error('Chore management security is invalid');
  }

  const previousTenantId = security.tenantId;
  writeJson(
    CHORE_MANAGEMENT_SECURITY_PATH,
    Object.assign({}, security, { tenantId, updatedAt: nowIso() }),
    MAX_CHORE_MANAGEMENT_SECURITY_BYTES
  );
  clearManagementSession(previousTenantId);
  clearManagementSession(tenantId);
}

function hashManagementPin(pin, salt) {
  return hashCrypto.createHash('sha256').update(salt + ':' + pin).digest('hex');
}

function requiresManagementSession(action) {
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
    'reward_decision',
    'vacation_reschedule',
  ].indexOf(action.type) !== -1;
}

function managementSessionIsValid(r, tenantId) {
  const token = getHeader(r, HEADERS.managementSession);
  const sharedSessions = getSharedManagementSessions();
  if (sharedSessions) {
    return Boolean(token) && sharedSessions.get(tenantId) === token;
  }
  const timestamp = Date.now();
  managementSessions = managementSessions.filter(function (session) {
    return session.expiresAt > timestamp;
  });
  return Boolean(token) && managementSessions.some(function (session) {
    return session.token === token && session.tenantId === tenantId;
  });
}

function sendManagementSession(r, tenantId) {
  const token = createOpaqueId('cms') + createOpaqueId('cms');
  const expiresAt = Date.now() + MANAGEMENT_SESSION_DURATION_MS;
  const sharedSessions = getSharedManagementSessions();
  if (sharedSessions) {
    sharedSessions.set(tenantId, token, MANAGEMENT_SESSION_DURATION_MS);
  } else {
    managementSessions = managementSessions
      .filter(function (session) { return session.tenantId !== tenantId; })
      .concat([{ token, tenantId, expiresAt }])
      .slice(-20);
  }
  sendJson(r, 200, {
    pinConfigured: true,
    sessionToken: token,
    expiresAt: new Date(expiresAt).toISOString(),
  });
}

function publicDocument(document, tenantId) {
  return {
    contractVersion: CONTRACT_VERSION,
    revision: document.revision,
    updatedAt: document.updatedAt,
    data: document.data,
    management: { pinConfigured: Boolean(readManagementSecurity(tenantId)) },
  };
}

function loadWorkspace(r, principal) {
  const document = readDocument();
  applyRevisionHeader(r, document.revision);
  const clientRevision = Number.parseInt(getHeader(r, HEADERS.revision), 10);
  if (Number.isSafeInteger(clientRevision) && clientRevision === document.revision) {
    r.headersOut['Cache-Control'] = 'no-store';
    r.return(304);
    return;
  }
  sendJson(r, 200, publicDocument(document, principal.tenantId));
}

function loadEventHistory(r) {
  sendJson(r, 200, readEventHistory());
}

function loadBackup(r, document) {
  sendJson(r, 200, {
    contract: 'navet.chores',
    version: 1,
    exportedAt: nowIso(),
    workspace: document.data,
    events: readEventHistory().events,
  });
}

function loadDefinitions(r, document) {
  const definitions = Object.values(document.data.definitionsById).sort(function (left, right) {
    return compareStrings(left.title, right.title);
  });
  sendJson(r, 200, {
    contractVersion: CONTRACT_VERSION,
    revision: document.revision,
    definitions,
  });
}

function loadOccurrences(r, document) {
  const args = parseQueryArgs(r.args);
  if (
    (args.from && !Number.isFinite(Date.parse(args.from))) ||
    (args.to && !Number.isFinite(Date.parse(args.to)))
  ) {
    sendJson(r, 400, { error: 'Chore occurrence range is invalid' });
    return;
  }
  const occurrences = Object.values(document.data.occurrencesById)
    .filter(function (occurrence) {
      return !args.from || Date.parse(occurrence.scheduledAt) >= Date.parse(args.from);
    })
    .filter(function (occurrence) {
      return !args.to || Date.parse(occurrence.scheduledAt) <= Date.parse(args.to);
    })
    .filter(function (occurrence) {
      return !args.participantId || includesValue(occurrence.assigneeIds, args.participantId);
    })
    .filter(function (occurrence) {
      return !args.definitionId || occurrence.definitionId === args.definitionId;
    })
    .sort(function (left, right) {
      return compareStrings(left.scheduledAt, right.scheduledAt);
    })
    .slice(0, 5000);
  sendJson(r, 200, {
    contractVersion: CONTRACT_VERSION,
    revision: document.revision,
    occurrences,
  });
}

function loadAutomationEvents(r) {
  const args = parseQueryArgs(r.args);
  const after = Number.parseInt(args.after || '0', 10);
  const requestedLimit = Number.parseInt(args.limit || '200', 10);
  if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(requestedLimit)) {
    sendJson(r, 400, { error: 'Chore event cursor is invalid' });
    return;
  }
  const limit = Math.min(500, Math.max(1, requestedLimit));
  const history = readEventHistory();
  const requestedTypes = typeof args.types === 'string'
    ? args.types.split(',').filter(function (type) {
        return includesValue(CHORE_AUTOMATION_EVENT_TYPES, type);
      })
    : [];
  const allowedTypes = requestedTypes.length > 0 ? requestedTypes : CHORE_AUTOMATION_EVENT_TYPES;
  const events = [];
  let cursor = Math.min(after, history.events.length);
  while (cursor < history.events.length && events.length < limit) {
    const event = history.events[cursor];
    cursor += 1;
    if (!includesValue(allowedTypes, event.type)) continue;
    if (args.occurrenceId && event.occurrenceId !== args.occurrenceId) continue;
    if (args.definitionId && event.definitionId !== args.definitionId) continue;
    events.push(event);
  }
  sendJson(r, 200, {
    contractVersion: CONTRACT_VERSION,
    cursor: String(cursor),
    hasMore: cursor < history.events.length,
    events,
  });
}

function hasCommand(document, journal, commandId) {
  for (let index = 0; index < document.data.activity.length; index += 1) {
    if (document.data.activity[index].commandId === commandId) {
      return true;
    }
  }
  for (let index = 0; index < journal.commands.length; index += 1) {
    if (journal.commands[index] && journal.commands[index].commandId === commandId) {
      return true;
    }
  }
  return false;
}

function verifyManagementPin(r, principal) {
  let request;
  try {
    request = JSON.parse(r.requestText || '');
  } catch (_error) {
    sendJson(r, 400, { error: 'Management PIN must be valid JSON' });
    return;
  }
  const security = readManagementSecurity(principal.tenantId);
  if (!security) {
    sendJson(r, 409, { error: 'A management PIN has not been configured' });
    return;
  }
  if (Date.now() < managementBlockedUntil) {
    sendJson(r, 429, { error: 'Too many PIN attempts. Try again shortly.' });
    return;
  }
  if (
    !isRecord(request) ||
    typeof request.pin !== 'string' ||
    !MANAGEMENT_PIN_PATTERN.test(request.pin) ||
    hashManagementPin(request.pin, security.salt) !== security.pinHash
  ) {
    failedManagementAttempts += 1;
    if (failedManagementAttempts >= 5) {
      managementBlockedUntil = Date.now() + 30000;
      failedManagementAttempts = 0;
    }
    sendJson(r, 403, { error: 'The management PIN is incorrect' });
    return;
  }
  failedManagementAttempts = 0;
  managementBlockedUntil = 0;
  sendManagementSession(r, principal.tenantId);
}

function configureManagementPin(r, principal) {
  let request;
  try {
    request = JSON.parse(r.requestText || '');
  } catch (_error) {
    sendJson(r, 400, { error: 'Management PIN must be valid JSON' });
    return;
  }
  const current = readDocument();
  const actor = isRecord(request) && typeof request.actorParticipantId === 'string'
    ? current.data.participantsById[request.actorParticipantId]
    : null;
  if (
    !isRecord(request) ||
    typeof request.pin !== 'string' ||
    !MANAGEMENT_PIN_PATTERN.test(request.pin) ||
    !isRecord(actor) ||
    isParticipantPausedAt(actor, nowIso()) ||
    !includesValue(actor.capabilities, 'manage')
  ) {
    sendJson(r, 400, { error: 'Use a 4 to 8 digit PIN for an active manager' });
    return;
  }
  const currentSecurity = readManagementSecurity(principal.tenantId);
  if (currentSecurity && !managementSessionIsValid(r, principal.tenantId)) {
    sendJson(r, 403, { error: 'Unlock chore management before changing its PIN' });
    return;
  }
  const salt = createOpaqueId('salt') + createOpaqueId('salt');
  writeJson(CHORE_MANAGEMENT_SECURITY_PATH, {
    contractVersion: CONTRACT_VERSION,
    tenantId: principal.tenantId,
    salt,
    pinHash: hashManagementPin(request.pin, salt),
    updatedAt: nowIso(),
  }, MAX_CHORE_MANAGEMENT_SECURITY_BYTES);
  clearManagementSession(principal.tenantId);
  sendManagementSession(r, principal.tenantId);
}

function removeManagementPin(r, principal) {
  let request;
  try {
    request = JSON.parse(r.requestText || '');
  } catch (_error) {
    sendJson(r, 400, { error: 'Management PIN removal must be valid JSON' });
    return;
  }
  const current = readDocument();
  const actor = isRecord(request) && typeof request.actorParticipantId === 'string'
    ? current.data.participantsById[request.actorParticipantId]
    : null;
  if (
    !isRecord(actor) ||
    isParticipantPausedAt(actor, nowIso()) ||
    !includesValue(actor.capabilities, 'manage')
  ) {
    sendJson(r, 403, { error: 'Management PIN removal requires an active manager' });
    return;
  }
  if (!readManagementSecurity(principal.tenantId)) {
    sendJson(r, 409, { error: 'A management PIN has not been configured' });
    return;
  }
  if (!managementSessionIsValid(r, principal.tenantId)) {
    sendJson(r, 403, { error: 'Unlock chore management before removing its PIN' });
    return;
  }
  deleteFile(CHORE_MANAGEMENT_SECURITY_PATH);
  clearManagementSession(principal.tenantId);
  failedManagementAttempts = 0;
  managementBlockedUntil = 0;
  sendJson(r, 200, { pinConfigured: false });
}

function recoverWorkspace(r, principal) {
  let request;
  try {
    request = JSON.parse(r.requestText || '');
  } catch (_error) {
    sendJson(r, 400, { error: 'Chore recovery request must be valid JSON' });
    return;
  }
  if (!isRecord(request)) {
    sendJson(r, 400, { error: 'Choose repair or start over to recover chores' });
    return;
  }
  const restoreBackup =
    request.action === 'restore_backup' && request.confirmation === 'REPAIR CHORES';
  const resetWorkspace = request.action === 'reset' && request.confirmation === 'RESET CHORES';
  if (!restoreBackup && !resetWorkspace) {
    sendJson(r, 400, { error: 'Choose repair or start over to recover chores' });
    return;
  }

  let managementSecurity = null;
  let managementSecurityReadable = true;
  try {
    managementSecurity = readManagementSecurity(principal.tenantId);
  } catch (_error) {
    managementSecurityReadable = false;
  }
  if (!managementSecurityReadable && restoreBackup) {
    sendJson(r, 409, { error: 'The management lock is damaged. Start over to recover chores.' });
    return;
  }
  if (managementSecurity && !managementSessionIsValid(r, principal.tenantId)) {
    sendJson(r, 403, { error: 'Unlock chore management to continue' });
    return;
  }

  if (restoreBackup) {
    const backup = readDocumentCandidate(CHORE_LAST_GOOD_WORKSPACE_PATH);
    if (!backup) {
      sendJson(r, 409, { error: 'No healthy chore backup is available' });
      return;
    }
    const recovered = Object.assign({}, backup, {
      revision: backup.revision + 1,
      updatedAt: nowIso(),
    });
    writeStoredDocument(CHORE_WORKSPACE_PATH, recovered);
    replaceEventHistory(recovered.data.activity);
    deleteFile(CHORE_JOURNAL_PATH);
    applyRevisionHeader(r, recovered.revision);
    sendJson(r, 200, publicDocument(recovered, principal.tenantId));
    return;
  }

  try {
    fsModule.renameSync(CHORE_WORKSPACE_PATH, CHORE_WORKSPACE_PATH + '.failed-' + Date.now());
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
  }
  deleteFile(CHORE_JOURNAL_PATH);
  deleteFile(CHORE_EVENT_HISTORY_PATH);
  deleteFile(CHORE_LAST_GOOD_WORKSPACE_PATH);
  deleteFile(CHORE_MANAGEMENT_SECURITY_PATH);
  clearManagementSession(principal.tenantId);
  const recovered = {
    contractVersion: CONTRACT_VERSION,
    revision: 0,
    updatedAt: nowIso(),
    data: emptyData(),
  };
  writeStoredDocument(CHORE_WORKSPACE_PATH, recovered);
  applyRevisionHeader(r, recovered.revision);
  sendJson(r, 200, publicDocument(recovered, principal.tenantId));
}

function commitCommand(r, principal) {
  const body = r.requestText || '';
  if (!body || body.length > MAX_CHORE_WORKSPACE_BYTES) {
    sendJson(r, 413, { error: 'Chore command is too large' });
    return;
  }

  let request;
  try {
    request = JSON.parse(body);
  } catch (_error) {
    sendJson(r, 400, { error: 'Chore command must be valid JSON' });
    return;
  }

  const baseRevision = Number.parseInt(getHeader(r, HEADERS.baseRevision), 10);
  const hasAction = isValidWorkspaceAction(request && request.action);
  if (
    !isRecord(request) ||
    typeof request.commandId !== 'string' ||
    request.commandId.length === 0 ||
    request.commandId.length > 200 ||
    !Number.isSafeInteger(request.baseRevision) ||
    request.baseRevision !== baseRevision ||
    !hasAction
  ) {
    sendJson(r, 400, { error: 'Chore command is invalid' });
    return;
  }

  const current = readDocument();
  const journal = readJournal(current.data.activity);
  applyRevisionHeader(r, current.revision);
  if (hasCommand(current, journal, request.commandId)) {
    sendJson(r, 200, publicDocument(current, principal.tenantId));
    return;
  }
  if (baseRevision !== current.revision) {
    sendJson(r, 412, {
      error: 'Chore workspace changed on another client',
      revision: current.revision,
    });
    return;
  }
  if (
    readManagementSecurity(principal.tenantId) &&
    requiresManagementSession(request.action) &&
    !managementSessionIsValid(r, principal.tenantId)
  ) {
    sendJson(r, 403, { error: 'Unlock chore management to continue' });
    return;
  }

  let nextData;
  try {
    nextData = applyWorkspaceAction(current.data, request.commandId, request.action, nowIso());
  } catch (error) {
    sendJson(r, 409, {
      error: error && error.message ? error.message : 'Chore action could not be applied',
    });
    return;
  }

  const next = {
    contractVersion: CONTRACT_VERSION,
    revision: current.revision + 1,
    updatedAt: nowIso(),
    data: nextData,
  };
  const nextJournal = {
    contractVersion: CONTRACT_VERSION,
    commands: journal.commands
      .concat([
        {
          commandId: request.commandId,
          revision: next.revision,
          timestamp: next.updatedAt,
        },
      ])
      .slice(-MAX_COMMAND_JOURNAL_ITEMS),
  };
  persistDocument(current, next);
  writeJson(CHORE_JOURNAL_PATH, nextJournal, MAX_CHORE_JOURNAL_BYTES);
  appendEventHistory(nextData.activity, nextData.historyRetention);
  applyRevisionHeader(r, next.revision);
  sendJson(r, 200, publicDocument(next, principal.tenantId));
}

function commitAdministration(r, principal, operation) {
  const body = r.requestText || '';
  if (!body || body.length > MAX_CHORE_EVENT_HISTORY_BYTES) {
    sendJson(r, 413, { error: 'Chore administration request is too large' });
    return;
  }
  let request;
  try {
    request = JSON.parse(body);
  } catch (_error) {
    sendJson(r, 400, { error: 'Chore administration request must be valid JSON' });
    return;
  }
  const baseRevision = Number.parseInt(getHeader(r, HEADERS.baseRevision), 10);
  if (
    !isRecord(request) ||
    typeof request.commandId !== 'string' ||
    request.commandId.length === 0 ||
    request.commandId.length > 200 ||
    !Number.isSafeInteger(request.baseRevision) ||
    request.baseRevision !== baseRevision ||
    typeof request.actorParticipantId !== 'string'
  ) {
    sendJson(r, 400, { error: 'Chore administration request is invalid' });
    return;
  }
  const current = readDocument();
  const journal = readJournal(current.data.activity);
  applyRevisionHeader(r, current.revision);
  if (hasCommand(current, journal, request.commandId)) {
    sendJson(r, 200, publicDocument(current, principal.tenantId));
    return;
  }
  if (baseRevision !== current.revision) {
    sendJson(r, 412, {
      error: 'Chore workspace changed on another client',
      revision: current.revision,
    });
    return;
  }
  if (
    readManagementSecurity(principal.tenantId) &&
    !managementSessionIsValid(r, principal.tenantId)
  ) {
    sendJson(r, 403, { error: 'Unlock chore management to continue' });
    return;
  }

  const currentActor = current.data.participantsById[request.actorParticipantId];
  const timestamp = nowIso();
  const activity = {
    id: 'activity:' + request.commandId,
    commandId: request.commandId,
    actorParticipantId: request.actorParticipantId,
    type: operation === 'restore' ? 'workspace_imported' : 'workspace_reset',
    timestamp,
  };
  let nextData;
  let nextEvents;
  if (operation === 'restore') {
    if (request.mode !== 'merge' && request.mode !== 'replace') {
      sendJson(r, 400, { error: 'Chore restore mode is invalid' });
      return;
    }
    let imported;
    try {
      imported = parseInterchangeDocument(request.document);
    } catch (error) {
      sendJson(r, 400, { error: error && error.message ? error.message : 'Chore backup is invalid' });
      return;
    }
    const importedActor = imported.workspace.participantsById[request.actorParticipantId];
    const isEmpty = Object.keys(current.data.participantsById).length === 0;
    const actorCanRestore = isEmpty
      ? isRecord(importedActor) && !isParticipantPausedAt(importedActor, nowIso()) && includesValue(importedActor.capabilities, 'manage')
      : isRecord(currentActor) && !isParticipantPausedAt(currentActor, nowIso()) && includesValue(currentActor.capabilities, 'manage');
    if (!actorCanRestore) {
      sendJson(r, 403, { error: 'Only a household manager can restore chore data' });
      return;
    }
    if (request.mode === 'replace') {
      nextEvents = imported.events.concat([activity]);
      nextData = Object.assign({}, imported.workspace, {
        activity: imported.workspace.activity.concat([activity]).slice(-MAX_ACTIVITY_ITEMS),
        outbox: [createOutboxItem(activity)],
      });
    } else {
      const merged = mergeImportedWorkspace(
        current.data,
        readEventHistory().events,
        imported,
        timestamp
      );
      nextEvents = merged.events.concat([activity]);
      nextData = Object.assign({}, merged.data, {
        activity: merged.data.activity.concat([activity]).slice(-MAX_ACTIVITY_ITEMS),
        outbox: merged.data.outbox.concat([createOutboxItem(activity)]).slice(-MAX_OUTBOX_ITEMS),
      });
    }
  } else {
    if (
      request.confirmation !== 'DELETE ALL CHORES' ||
      !isRecord(currentActor) ||
      isParticipantPausedAt(currentActor, nowIso()) ||
      !includesValue(currentActor.capabilities, 'manage')
    ) {
      sendJson(r, 403, { error: 'Chore reset requires an active manager confirmation' });
      return;
    }
    nextData = emptyData();
    nextEvents = [];
  }

  const next = {
    contractVersion: CONTRACT_VERSION,
    revision: current.revision + 1,
    updatedAt: timestamp,
    data: nextData,
  };
  if (operation === 'reset') {
    writeStoredDocument(CHORE_WORKSPACE_PATH, next);
    deleteFile(CHORE_JOURNAL_PATH);
    deleteFile(CHORE_EVENT_HISTORY_PATH);
    deleteFile(CHORE_LAST_GOOD_WORKSPACE_PATH);
    deleteFile(CHORE_MANAGEMENT_SECURITY_PATH);
    clearManagementSession(principal.tenantId);
  } else {
    const nextJournal = {
      contractVersion: CONTRACT_VERSION,
      commands: journal.commands.concat([{
        commandId: request.commandId,
        revision: next.revision,
        timestamp,
      }]).slice(-MAX_COMMAND_JOURNAL_ITEMS),
    };
    persistDocument(current, next);
    writeJson(CHORE_JOURNAL_PATH, nextJournal, MAX_CHORE_JOURNAL_BYTES);
    replaceEventHistory(nextEvents);
  }
  applyRevisionHeader(r, next.revision);
  sendJson(r, 200, publicDocument(next, principal.tenantId));
}

function routeRequest(r, principal, options) {
  if (r.method !== 'GET' && !providerSessionStore.isStrictSameOriginMutation(r)) {
    sendJson(r, 403, { error: 'Cross-origin chore mutation is not allowed' });
    return;
  }
  const workspace = authorizeWorkspacePrincipal(principal);
  if (!workspace) {
    sendJson(r, 403, { error: 'An authorized Navet session is required' });
    return;
  }
  // Keep the legacy field/namespace readable by older releases. Its value now
  // derives only from persistent Navet identity. PIN salt/hash remain unchanged.
  principal = Object.assign({}, principal, {
    tenantId: 'hat_' + hashCrypto.createHash('sha256')
      .update('navet-chores:' + workspace.installationId + ':' + workspace.workspaceId)
      .digest('hex'),
  });
  rebindManagementSecurityToAuthorizedTenant(principal.tenantId);

  const uri = typeof r.uri === 'string' ? r.uri.replace(/\/+$/, '') : '';
  if (uri === '/__navet_chores__/capabilities' && r.method === 'GET') {
    const document = readDocument();
    sendJson(r, 200, {
      contractVersion: CONTRACT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      authority: options && options.trustIngressHeaders ? 'navet_addon' : 'standalone',
      backgroundScheduling: Boolean(options && options.trustIngressHeaders),
      backgroundNotifications: Boolean(options && options.trustIngressHeaders),
      projectionOwnedByAuthority: false,
      actionServices: false,
      lastSchedulerRunAt,
      pendingDeliveryCount: document.data.outbox.filter(function (item) {
        return (
          item.destination === 'home_assistant' &&
          (item.status === 'pending' || item.status === 'failed')
        );
      }).length,
      lastDeliveryError,
    });
    return;
  }
  if (uri === '/__navet_chores__/workspace' && r.method === 'GET') {
    loadWorkspace(r, principal);
    return;
  }
  if (uri === '/__navet_chores__/history' && r.method === 'GET') {
    loadEventHistory(r);
    return;
  }
  if (uri === '/__navet_chores__/backup' && r.method === 'GET') {
    loadBackup(r, readDocument());
    return;
  }
  if (uri === '/__navet_chores__/definitions' && r.method === 'GET') {
    loadDefinitions(r, readDocument());
    return;
  }
  if (uri === '/__navet_chores__/occurrences' && r.method === 'GET') {
    loadOccurrences(r, readDocument());
    return;
  }
  if (uri === '/__navet_chores__/events' && r.method === 'GET') {
    loadAutomationEvents(r);
    return;
  }
  if (uri === '/__navet_chores__/management/verify' && r.method === 'POST') {
    verifyManagementPin(r, principal);
    return;
  }
  if (uri === '/__navet_chores__/management/pin' && r.method === 'POST') {
    configureManagementPin(r, principal);
    return;
  }
  if (uri === '/__navet_chores__/management/pin' && r.method === 'DELETE') {
    removeManagementPin(r, principal);
    return;
  }
  if (uri === '/__navet_chores__/recovery' && r.method === 'POST') {
    recoverWorkspace(r, principal);
    return;
  }
  if (
    (uri === '/__navet_chores__/commands' || uri === '/__navet_chores__/actions') &&
    r.method === 'POST'
  ) {
    commitCommand(r, principal);
    return;
  }
  if (uri === '/__navet_chores__/restore' && r.method === 'POST') {
    commitAdministration(r, principal, 'restore');
    return;
  }
  if (uri === '/__navet_chores__/reset' && r.method === 'POST') {
    commitAdministration(r, principal, 'reset');
    return;
  }
  sendJson(r, 404, { error: 'Chore workspace resource not found' });
}

function handleWithOptions(r, options) {
  const principal = principalResolver(r, {
    trustIngressHeaders: Boolean(options && options.trustIngressHeaders),
  });
  if (!principal) {
    sendJson(r, 401, { error: 'Authentication required' });
    return;
  }
  try {
    routeRequest(r, principal, options);
  } catch (error) {
    if (error && error.code === 'NAVET_CHORE_WRITE_LIMIT') {
      let pinConfigured = false;
      try {
        pinConfigured = Boolean(readManagementSecurity(principal.tenantId));
      } catch (_securityError) {
        pinConfigured = false;
      }
      sendJson(r, 413, {
        error: 'Chore workspace is too large',
        recovery: {
          backupAvailable: Boolean(readDocumentCandidate(CHORE_LAST_GOOD_WORKSPACE_PATH)),
          pinConfigured,
          reason: 'workspace_too_large',
        },
      });
      return;
    }
    let pinConfigured = false;
    try {
      pinConfigured = Boolean(readManagementSecurity(principal.tenantId));
    } catch (_securityError) {
      pinConfigured = false;
    }
    sendJson(r, 503, {
      error:
        error && error.code === 'NAVET_CHORE_WORKSPACE_INVALID'
          ? 'Chore data could not be read. Repair it from the last healthy copy or start over.'
          : 'Chore storage could not finish the request. Your saved data has not been replaced.',
      recovery: {
        backupAvailable: Boolean(readDocumentCandidate(CHORE_LAST_GOOD_WORKSPACE_PATH)),
        pinConfigured,
        reason:
          error && error.code === 'NAVET_CHORE_WORKSPACE_INVALID'
            ? 'workspace_invalid'
            : 'storage_unavailable',
      },
    });
  }
}

function handle(r) {
  handleWithOptions(r, { trustIngressHeaders: false });
}

function handleIngress(r) {
  handleWithOptions(r, { trustIngressHeaders: true });
}

export default {
  getNjsTimeZoneOffsetMinutesForTests: getNjsTimeZoneOffsetMinutes,
  handle,
  handleIngress,
  isValidChoreWorkspaceData,
  materializeDefinitionForTests: materializeDefinition,
  resetChoreStoreForTests,
  routeRequest,
  runPeriodic,
  setChoreStoreFsForTests,
  setChoreStorePrincipalResolverForTests,
};
