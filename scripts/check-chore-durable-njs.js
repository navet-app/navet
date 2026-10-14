import storage from '/etc/nginx/njs/chore-durable-storage.js';
import choreStore from '/etc/nginx/njs/chore-store.js';
import recurrence from '/etc/nginx/njs/chore-recurrence-policy.js';
import storagePolicy from '/etc/nginx/njs/chore-storage-policy.js';
import crypto from 'crypto';
import zlib from 'zlib';
let assertions = 0;
function assert(value, message) {
  assertions++;
  if (!value) throw new Error(message);
}
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const files = {};
const timestamp = new Date().toISOString();
const doc = {
  contractVersion: 1,
  revision: 1,
  updatedAt: timestamp,
  data: {
    schemaVersion: 2,
    participantsById: {
      manager: {
        id: 'manager',
        displayName: 'Manager',
        capabilities: ['complete', 'manage'],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    },
    definitionsById: {},
    occurrencesById: {},
    activity: [],
    outbox: [],
    historyRetention: { maxAgeDays: 730, maxEvents: 50000 },
    experience: {
      version: 2,
      gamificationMode: 'off',
      presentationByDefinitionId: {},
      householdBonusPoints: 0,
      missionsById: {},
      rewardGoalsById: {},
      rewardRequestsById: {},
      earnedPointsByParticipant: { manager: 12000 },
      awardedMissionIds: [],
      badgesById: {},
      achievementsById: {},
      progressAwards: [],
      pointTransactions: [],
    },
  },
};
for (let index = 0; index < 12000; index++)
  doc.data.experience.pointTransactions.push({
    id: 'transaction:' + index + ':' + 'x'.repeat(150),
    participantId: 'manager',
    pointsDelta: 1,
    kind: 'adjustment',
    timestamp,
  });
doc.data.experience.pointTransactions[0].id += 'é'.repeat(140000);
assert(
  choreStore.isValidChoreWorkspaceData(doc.data),
  'Native authority must accept valid large ledger'
);
const manifest = storage.encode(doc, 2 * 1024 * 1024, hash, (key, chunk) => {
  files[key] = chunk;
  assert(Buffer.byteLength(JSON.stringify(chunk)) <= storage.CHUNK_BYTES, 'Chunk stays bounded');
});
assert(Buffer.byteLength(JSON.stringify(manifest)) < 2 * 1024 * 1024, 'Manifest stays bounded');
const restored = storage.decode(manifest, hash, (key) => files[key]);
assert(
  JSON.stringify(restored.data.experience.pointTransactions) ===
    JSON.stringify(doc.data.experience.pointTransactions),
  'Ledger preserved through native framing'
);
const historyRows = [];
for (let index = 0; index < 2000; index++) historyRows.push({
  id: 'activity:legacy:' + index, commandId: 'legacy:' + index,
  type: 'workspace_materialized', timestamp, reason: 'Preserve åäö and event order',
});
const historyDocument = { contractVersion: 1, events: historyRows };
const meaningfulEvent = { id: 'completion:keep', commandId: 'complete:keep', type: 'completed', timestamp };
const cleanedHistory = storagePolicy.compactChoreHistory({ contractVersion: 1,
  events: historyRows.concat([meaningfulEvent, meaningfulEvent]) });
assert(cleanedHistory.events.length === 1 && cleanedHistory.events[0].id === meaningfulEvent.id,
  'Native cleanup removes internal chatter and duplicate IDs, retaining completion');
assert(storagePolicy.readChoreHistoryPage(cleanedHistory, 1999, 1, ['completed']).cursor === '2001',
  'Native cleanup preserves legacy cursor positions');
assert(storagePolicy.readChoreHistoryPage(cleanedHistory, 2001, 10, ['completed']).cursor === '2002',
  'Native cursor advances past removed duplicates');
const notification = { id: 'notification', eventType: 'completed', status: 'pending', attempts: 0 };
const cleanedWorkspace = storagePolicy.compactChoreWorkspace(Object.assign({}, doc.data, {
  activity: historyRows.slice(0, 5).concat([meaningfulEvent, meaningfulEvent]),
  outbox: [notification, Object.assign({}, notification, { status: 'delivered' })],
}));
assert(cleanedWorkspace.experience === doc.data.experience && cleanedWorkspace.experience.pointTransactions.length === 12000,
  'Native cleanup preserves the complete accounting ledger');
assert(cleanedWorkspace.activity.length === 1 && cleanedWorkspace.outbox.length === 1 && cleanedWorkspace.outbox[0].status === 'delivered',
  'Native cleanup retains a delivered notification rather than replaying a duplicate');
const compressedHistory = storage.pack(historyDocument, hash);
assert(compressedHistory.storageEncoding === 'deflate-v1', 'Native history uses deflate');
assert(JSON.stringify(compressedHistory).length < JSON.stringify(historyDocument).length * 0.3, 'Native history compression shrinks repeated writes');
assert(JSON.stringify(storage.unpack(compressedHistory, hash)) === JSON.stringify(historyDocument), 'Native deflate preserves every event and UTF-8 text');
// Exercise stored, fixed-Huffman, and dynamic-Huffman blocks in the native runtime.
const deflateText = JSON.stringify({ text: 'abc åäö '.repeat(20000) });
const deflateOptions = [{ level: 0 }, { strategy: zlib.constants.Z_FIXED },
  { strategy: zlib.constants.Z_HUFFMAN_ONLY }, { strategy: zlib.constants.Z_RLE }, {}];
for (let index = 0; index < deflateOptions.length; index++) {
  const envelope = {
    storageEncoding: 'deflate-v1', uncompressedBytes: Buffer.byteLength(deflateText),
    checksum: hash(deflateText), payload: zlib.deflateSync(deflateText, deflateOptions[index]).toString('base64'),
  };
  assert(JSON.stringify(storage.unpack(envelope, hash)) === deflateText, 'All native deflate block types round-trip');
  const inflate = zlib.inflateSync;
  let nativeInflations = 0;
  zlib.inflateSync = function () { nativeInflations++; throw new Error('Unexpected native inflation'); };
  let sizeError = '';
  try { storage.unpack(Object.assign({}, envelope, { uncompressedBytes: 128 }), hash); }
  catch (error) { sizeError = error.message; }
  zlib.inflateSync = inflate;
  assert(nativeInflations === 0 && sizeError.indexOf('exceeds expanded size') !== -1,
    'Underdeclared expansion is rejected before allocating native output');
}
// Skewed frequencies exercise long Huffman codes; short streams exercise the
// end-of-input fallback where the nine-bit lookup cannot safely peek ahead.
let skewed = '';
for (let index = 0; index < 14; index++) skewed += String.fromCharCode(65 + index).repeat(1 << index);
const edgeTexts = [JSON.stringify({ text: skewed }), '0', '{}', '"å"'];
for (let index = 0; index < edgeTexts.length; index++) {
  const text = edgeTexts[index];
  const envelope = {
    storageEncoding: 'deflate-v1', uncompressedBytes: Buffer.byteLength(text),
    checksum: hash(text), payload: zlib.deflateSync(text, {
      strategy: zlib.constants.Z_HUFFMAN_ONLY,
    }).toString('base64'),
  };
  assert(JSON.stringify(storage.unpack(envelope, hash)) === text,
    'Long Huffman codes and short final blocks round-trip');
}
const truncatedEnvelope = Object.assign({}, compressedHistory, {
  payload: Buffer.from(compressedHistory.payload, 'base64').subarray(0, 10).toString('base64'),
});
let truncatedRejected = false;
try { storage.unpack(truncatedEnvelope, hash); }
catch (_error) { truncatedRejected = true; }
assert(truncatedRejected, 'Truncated native deflate streams are rejected');
const reservedEnvelope = Object.assign({}, compressedHistory, {
  payload: Buffer.from([0x78, 0x9c, 0x07, 0, 0, 0, 0]).toString('base64'),
});
let reservedRejected = false;
try { storage.unpack(reservedEnvelope, hash); }
catch (_error) { reservedRejected = true; }
assert(reservedRejected, 'Reserved native deflate block types are rejected');
let deflateRejected = false;
try { storage.unpack(Object.assign({}, compressedHistory, { checksum: '0'.repeat(64) }), hash); }
catch (_error) { deflateRejected = true; }
assert(deflateRejected, 'Native compressed storage rejects corrupt checksums');
deflateRejected = false;
try { storage.unpack(compressedHistory, hash, 1024); }
catch (_error) { deflateRejected = true; }
assert(deflateRejected, 'Native compressed storage validates expanded size before decoding');
const paths = { '/data/navet-chore-workspace.json': JSON.stringify(manifest) };
for (const key in files)
  paths['/data/navet-chore-workspace.json.chunk-' + key] = JSON.stringify(files[key]);
function missing() {
  const err = new Error('Missing');
  err.code = 'ENOENT';
  throw err;
}
let failChunk = false;
const descriptors = {};
let nextDescriptor = 1;
choreStore.setChoreStoreFsForTests({
  openSync: (path) => {
    if (paths[path] === undefined) missing();
    const descriptor = nextDescriptor++;
    descriptors[descriptor] = { bytes: Buffer.from(paths[path]), offset: 0 };
    return descriptor;
  },
  readSync: (descriptor, buffer, offset, length) => {
    const entry = descriptors[descriptor];
    const count = Math.min(length, entry.bytes.length - entry.offset);
    entry.bytes.copy(buffer, offset, entry.offset, entry.offset + count);
    entry.offset += count;
    return count;
  },
  closeSync: (descriptor) => {
    delete descriptors[descriptor];
  },
  readdirSync: (directory) => Object.keys(paths)
    .filter(function (path) { return path.indexOf(directory + '/') === 0; })
    .map(function (path) { return path.slice(directory.length + 1); }),
  statSync: (path) =>
    paths[path] === undefined ? missing() : { size: Buffer.byteLength(paths[path]) },
  readFileSync: (path) => (paths[path] === undefined ? missing() : paths[path]),
  writeFileSync: (path, value) => {
    if (failChunk && path.indexOf('.chunk-') !== -1) throw new Error('Interrupted chunk write');
    paths[path] = value;
  },
  renameSync: (source, destination) => {
    if (paths[source] === undefined) missing();
    paths[destination] = paths[source];
    delete paths[source];
  },
  unlinkSync: (path) => {
    if (paths[path] === undefined) missing();
    delete paths[path];
  },
});
choreStore.setChoreStorePrincipalResolverForTests(() => ({
  providerId: 'home_assistant',
  tenantId: 'hat_' + 'a'.repeat(64),
  sessionId: 'native',
}));
function request(method, uri, command) {
  const r = {
    method,
    uri,
    args: '',
    headersOut: {},
    headersIn: { Host: 'navet.example', Origin: 'http://navet.example' },
    requestText: command ? JSON.stringify(command) : '',
    return: (code, body) => {
      r.status = code;
      r.body = JSON.parse(body);
    },
  };
  if (command) r.headersIn['X-Navet-Base-Revision'] = String(command.baseRevision);
  choreStore.handle(r);
  return r;
}
let result = request('POST', '/__navet_chores__/commands', {
  commandId: 'native-adjust',
  baseRevision: 1,
  action: {
    type: 'experience_points_adjust',
    actorParticipantId: 'manager',
    participantId: 'manager',
    pointsDelta: 10,
  },
});
assert(result.status === 200, 'Native authority commits large ledger: ' + JSON.stringify(result));
assert(
  result.body.data.experience.pointTransactions.length === 12001,
  'Native authority retains transactions'
);
assert(
  result.body.data.experience.earnedPointsByParticipant.manager === 12010,
  'Native balance correct'
);
result = request('POST', '/__navet_chores__/commands', {
  commandId: 'native-adjust',
  baseRevision: 1,
  action: {
    type: 'experience_points_adjust',
    actorParticipantId: 'manager',
    participantId: 'manager',
    pointsDelta: 10,
  },
});
assert(result.status === 200, 'Committed command replay is accepted');
assert(
  result.body.data.experience.pointTransactions.length === 12001,
  'Command replay retains one transaction'
);
assert(
  result.body.data.experience.earnedPointsByParticipant.manager === 12010,
  'Command replay does not spend or award points twice'
);
failChunk = true;
result = request('POST', '/__navet_chores__/commands', {
  commandId: 'failed-adjust',
  baseRevision: 2,
  action: {
    type: 'experience_points_adjust',
    actorParticipantId: 'manager',
    participantId: 'manager',
    pointsDelta: 10,
  },
});
assert(result.status === 503, 'Interrupted write returns recoverable error');
failChunk = false;
result = request('GET', '/__navet_chores__/workspace');
assert(
  result.body.data.experience.earnedPointsByParticipant.manager === 12010,
  'Committed balance survives interruption'
);
const key = manifest.durableCollections.pointTransactions[0];
files[key] = { version: 1, collection: 'pointTransactions', items: [] };
let rejected = false;
try {
  storage.decode(manifest, hash, (key) => files[key]);
} catch (_) {
  rejected = true;
}
assert(rejected, 'Corrupt hash rejected');
print('Passed ' + assertions + ' native NJS durable-storage assertions');

const repeatDefinition = { id: 'repeat', enabled: true, assignment: { mode: 'everyone', participantIds: ['manager', 'other'] }, schedule: { frequency: 'after_completion', startDate: '2026-01-01', time: '10:00', timeZone: 'UTC', intervalDays: 14 }, dueWindowMinutes: 60, approval: { required: false, approverIds: [] } };
const completed = { id: 'old-manager', definitionId: 'repeat', scheduledAt: '2026-01-01T10:00:00.000Z', dueAt: '2026-01-01T11:00:00.000Z', assignmentSlot: 'manager', assigneeIds: ['manager'], status: 'done', completedAt: '2026-10-11T10:00:00.000Z', updatedAt: '2026-10-11T10:00:00.000Z' };
const unfinished = Object.assign({}, completed, { id: 'old-other', assignmentSlot: 'other', assigneeIds: ['other'], status: 'missed', completedAt: undefined });
const previous = { manager: completed, other: unfinished };
const people = { manager: doc.data.participantsById.manager, other: Object.assign({}, doc.data.participantsById.manager, { id: 'other' }) };
const next = choreStore.materializeDefinitionForTests(repeatDefinition, people, '2026-07-13T00:00:00.000Z', '2026-11-25T00:00:00.000Z', previous, completed.completedAt, true);
assert(next.length === 2, 'Everyone keeps one interval per person');
assert(next[0].scheduledAt === '2026-10-25T10:00:00.000Z' && next[1].id === 'old-other', 'Only the completed person advances');
assert(!recurrence.shouldPruneChoreOccurrence(completed, { repeat: repeatDefinition }, previous, Date.parse('2027-02-01T10:00:00.000Z')), 'Old completion anchor survives retention');
const outstandingAfterAnchor = Object.assign({}, completed, { id: 'started-manager', scheduledAt: '2026-10-25T10:00:00.000Z', dueAt: '2026-10-25T11:00:00.000Z', status: 'available', completedAt: undefined });
const editedRepeat = Object.assign({}, repeatDefinition, { assignment: { mode: 'person', participantIds: ['manager'] }, schedule: Object.assign({}, repeatDefinition.schedule, { intervalDays: 7, time: '11:00' }) });
const editedNext = choreStore.materializeDefinitionForTests(editedRepeat, people, '2026-10-26T00:00:00.000Z', '2026-11-25T00:00:00.000Z', { anchor: completed, started: outstandingAfterAnchor }, completed.completedAt, true);
assert(editedNext.length === 1 && editedNext[0].id === outstandingAfterAnchor.id, 'Schedule edits preserve the started completion interval instead of materializing duplicate work');
const fixedDefinition = Object.assign({}, repeatDefinition, { schedule: { frequency: 'weekly' } });
assert(recurrence.getSupersedingChoreOccurrence(unfinished, fixedDefinition, { old: unfinished, next: Object.assign({}, unfinished, { id: 'new', scheduledAt: '2026-10-11T10:00:00.000Z' }) }, '2026-10-11T10:00:00.000Z').id === 'new', 'Scheduled work is superseded when the next interval starts');
const vacationPlaceholder = Object.assign({}, unfinished, { id: 'vacation-placeholder', scheduledAt: '2026-10-12T10:00:00.000Z', status: 'skipped', carriedForwardTo: 'vacation-replacement' });
const vacationReplacement = Object.assign({}, unfinished, { id: 'vacation-replacement', scheduledAt: '2026-10-18T10:00:00.000Z', status: 'available', carriedForwardFrom: vacationPlaceholder.id });
const vacationWork = { previous: unfinished, placeholder: vacationPlaceholder, replacement: vacationReplacement };
assert(recurrence.getSupersedingChoreOccurrence(unfinished, fixedDefinition, vacationWork, vacationPlaceholder.scheduledAt) === undefined, 'Vacation placeholder must not supersede older work');
assert(recurrence.getSupersedingChoreOccurrence(unfinished, fixedDefinition, vacationWork, vacationReplacement.scheduledAt).id === vacationReplacement.id, 'Moved calendar work supersedes only when its replacement starts');
delete vacationWork.placeholder;
assert(recurrence.getSupersedingChoreOccurrence(unfinished, fixedDefinition, vacationWork, vacationReplacement.scheduledAt).id === vacationReplacement.id, 'Moved calendar boundary survives pruned placeholder history');
const carriedWork = Object.assign({}, vacationReplacement, { id: 'automatic-carry', assignmentSlot: 'carry:old-other' });
assert(recurrence.getSupersedingChoreOccurrence(unfinished, Object.assign({}, fixedDefinition, { assignment: { mode: 'rotation' } }), { previous: unfinished, carried: carriedWork }, carriedWork.scheduledAt) === undefined, 'Automatic carry-forward remains the same work, including after a vacation move');
const manuallySkipped = Object.assign({}, vacationReplacement, { id: 'calendar-skip', carriedForwardFrom: undefined, status: 'skipped' });
assert(recurrence.getSupersedingChoreOccurrence(unfinished, fixedDefinition, { previous: unfinished, skipped: manuallySkipped }, manuallySkipped.scheduledAt).id === manuallySkipped.id, 'Manual skip without a forwarded replacement remains a calendar boundary');
const legacyMissed = {};
legacyMissed[unfinished.id] = unfinished;
legacyMissed[manuallySkipped.id] = manuallySkipped;
const durableMissed = recurrence.retainChoreSupersession(legacyMissed, { repeat: fixedDefinition }, manuallySkipped.scheduledAt);
assert(durableMissed[unfinished.id].supersededAt === manuallySkipped.scheduledAt, 'Legacy supersession is retained before calendar history disappears');
delete durableMissed[manuallySkipped.id];
assert(recurrence.retainChoreSupersession(durableMissed, { repeat: repeatDefinition }, '2027-01-01T10:00:00.000Z')[unfinished.id].supersededAt === manuallySkipped.scheduledAt, 'Supersession survives pruned successors and frequency edits');
assert(recurrence.getOutstandingChoreOccurrence(repeatDefinition, durableMissed) === undefined, 'Historical fixed missed work does not become outstanding completion work');
assert(recurrence.getOutstandingChoreOccurrence(repeatDefinition, { old: unfinished }).id === unfinished.id, 'Early missed completion work remains actionable');
const transferredAnchor = Object.assign({}, completed, { id: 'repeat:' + completed.scheduledAt + ':manager', assigneeIds: ['other'], assignmentSlot: 'manager:other', completedBy: 'other' });
const originalOther = Object.assign({}, unfinished, { id: 'repeat:' + unfinished.scheduledAt + ':other' });
const transferredHistory = {};
transferredHistory[transferredAnchor.id] = transferredAnchor;
transferredHistory[originalOther.id] = originalOther;
const transferredNext = choreStore.materializeDefinitionForTests(repeatDefinition, people, '2026-10-11T00:00:00.000Z', '2026-11-25T00:00:00.000Z', transferredHistory, transferredAnchor.completedAt, true);
assert(transferredNext.length === 2 && transferredNext[0].assigneeIds[0] === 'manager' && transferredNext[0].scheduledAt === '2026-10-25T10:00:00.000Z' && transferredNext[1].id === originalOther.id, 'Completing reassigned everyone work advances its original clock while preserving the recipient own work');
const laterOther = Object.assign({}, originalOther, { status: 'done', completedAt: '2026-10-13T10:00:00.000Z' });
transferredHistory[originalOther.id] = laterOther;
assert(!recurrence.shouldPruneChoreOccurrence(transferredAnchor, { repeat: repeatDefinition }, transferredHistory, Date.parse('2027-02-01T10:00:00.000Z')), 'Reassigned original completion anchor survives newer recipient completion and retention');
const sharedOutstanding = Object.assign({}, originalOther, { id: 'repeat:' + originalOther.scheduledAt + ':shared', status: 'available', assignmentSlot: 'shared', assigneeIds: ['manager', 'other'] });
const sharedHistory = {};
sharedHistory[sharedOutstanding.id] = sharedOutstanding;
const adoptedShared = choreStore.materializeDefinitionForTests(repeatDefinition, people, '2026-10-11T00:00:00.000Z', '2026-11-25T00:00:00.000Z', sharedHistory, undefined, true);
assert(adoptedShared.length === 2 && adoptedShared[0].id === sharedOutstanding.id && adoptedShared[1].id === sharedOutstanding.id, 'Everyone adopts an outstanding shared interval without creating duplicate participant work');
const literalParticipant = 'carry:repeat:2026-01-01T10:00:00.000Z:manager';
const literalWork = Object.assign({}, transferredAnchor, { id: 'repeat:' + transferredAnchor.scheduledAt + ':' + literalParticipant });
const literalHistory = {};
literalHistory[literalWork.id] = literalWork;
assert(recurrence.getParticipantChoreOccurrences(repeatDefinition, literalHistory, literalParticipant, [literalParticipant, 'other'])[literalWork.id] === literalWork, 'Opaque participant identity resembling carry ancestry remains its own clock');
const nestedSourceId = 'repeat:2026-10-12T10:00:00.000Z:carry:' + originalOther.id;
const nestedWork = Object.assign({}, originalOther, { id: 'repeat:2026-10-13T10:00:00.000Z:vacation:' + nestedSourceId, carriedForwardFrom: nestedSourceId, assigneeIds: ['manager'], assignmentSlot: 'manager:manager' });
const nestedHistory = {};
nestedHistory[nestedWork.id] = nestedWork;
assert(recurrence.getParticipantChoreOccurrences(repeatDefinition, nestedHistory, 'other', ['manager', 'other'])[nestedWork.id] === nestedWork, 'Nested forwarded original clock survives missing ancestor rows and reassignment');
const archiveDefinition = Object.assign({}, repeatDefinition, { id: 'archive-fixed', title: 'Archive fixed chore', assignment: { mode: 'person', participantIds: ['manager'] }, schedule: { frequency: 'weekly', startDate: '2026-01-01', time: '10:00', timeZone: 'UTC', daysOfWeek: [0] }, createdAt: timestamp, updatedAt: timestamp });
const historicalMissed = Object.assign({}, originalOther, { id: 'archive-fixed:2026-01-01T10:00:00.000Z:manager', definitionId: archiveDefinition.id, assigneeIds: ['manager'], assignmentSlot: 'manager', status: 'missed', supersededAt: '2026-01-08T10:00:00.000Z' });
const unfinishedArchiveWork = Object.assign({}, historicalMissed, { id: 'unfinished-archive', status: 'available', supersededAt: undefined, scheduledAt: new Date(Date.now() + 86400000).toISOString(), dueAt: new Date(Date.now() + 90000000).toISOString() });
const archiveData = Object.assign({}, doc.data, { definitionsById: { 'archive-fixed': archiveDefinition }, occurrencesById: {}, activity: [], outbox: [], experience: Object.assign({}, doc.data.experience, { pointTransactions: [], earnedPointsByParticipant: { manager: 0 } }) });
archiveData.occurrencesById[historicalMissed.id] = historicalMissed;
archiveData.occurrencesById[unfinishedArchiveWork.id] = unfinishedArchiveWork;
const archiveCarriedOriginal = Object.assign({}, historicalMissed, { id: 'archive-carried-original', supersededAt: undefined, carriedForwardTo: unfinishedArchiveWork.id });
archiveData.occurrencesById[archiveCarriedOriginal.id] = archiveCarriedOriginal;
archiveData.occurrencesById[unfinishedArchiveWork.id] = Object.assign({}, unfinishedArchiveWork, { carriedForwardFrom: archiveCarriedOriginal.id, assignmentSlot: 'carry:' + archiveCarriedOriginal.id });
paths['/data/navet-chore-workspace.json'] = JSON.stringify(Object.assign({}, doc, { data: archiveData, revision: 1 }));
let archiveRead = request('GET', '/__navet_chores__/workspace');
assert(archiveRead.status === 200, 'Native archive regression starts from valid historical snapshot');
let archiveResult = request('POST', '/__navet_chores__/commands', { commandId: 'native-archive-history', baseRevision: archiveRead.body.revision, action: { type: 'definition_archive', actorParticipantId: 'manager', definitionId: archiveDefinition.id } });
assert(archiveResult.status === 200 && archiveResult.body.data.occurrencesById[historicalMissed.id].supersededAt === historicalMissed.supersededAt, 'Native archive retains superseded missed history');
assert(JSON.stringify(archiveResult.body.data.occurrencesById[archiveCarriedOriginal.id]) === JSON.stringify(archiveCarriedOriginal), 'Native archive keeps original carry-forward history without supersession marker');
assert(archiveResult.body.data.occurrencesById[unfinishedArchiveWork.id] === undefined, 'Native archive still removes currently unfinished work');
const archivedWrite = request('POST', '/__navet_chores__/commands', { commandId: 'native-reject-archived-history', baseRevision: archiveResult.body.revision, action: { type: 'occurrence_action', occurrenceId: historicalMissed.id, action: { type: 'complete', participantId: 'manager' } } });
assert(archivedWrite.status >= 400 && archivedWrite.status < 500, 'Native archived definition still blocks history completion');
archiveRead = request('GET', '/__navet_chores__/workspace');
assert(archiveRead.body.data.occurrencesById[historicalMissed.id].supersededAt === historicalMissed.supersededAt, 'Native archive persists missed history across subsequent reads');
assert(archiveRead.body.data.occurrencesById[archiveCarriedOriginal.id].carriedForwardTo === unfinishedArchiveWork.id, 'Restart retains archived carry history after replacement removal');
archiveResult = request('POST', '/__navet_chores__/commands', { commandId: 'native-restore-history', baseRevision: archiveRead.body.revision, action: { type: 'definition_restore', actorParticipantId: 'manager', definitionId: archiveDefinition.id } });
assert(archiveResult.body.data.occurrencesById[archiveCarriedOriginal.id].carriedForwardTo === unfinishedArchiveWork.id, 'Restore retains original carry history without recreating removed replacement');
assert(archiveResult.status === 200 && archiveResult.body.data.occurrencesById[historicalMissed.id].supersededAt === historicalMissed.supersededAt, 'Native restore preserves missed history');
['2026-08-17T01:00:00+02:00', '2026-08-16T23:00:00-00:30', '2026-08-17T00:30:00+00:00', '2026-08-17T02:00:00.123+01:30'].forEach(function (iso, index) {
  const expected = ['2026-08-16T23:00:00.000Z', '2026-08-16T23:30:00.000Z', '2026-08-17T00:30:00.000Z', '2026-08-17T00:30:00.123Z'][index];
  assert(recurrence.parseChoreInstant(iso) === Date.parse(expected), 'Native parser preserves offset instant: ' + iso);
});
const offsetEarlier = Object.assign({}, completed, { id: 'offset-earlier', completedAt: '2026-08-17T01:00:00+02:00' });
const offsetLater = Object.assign({}, completed, { id: 'offset-later', completedAt: '2026-08-17T00:30:00Z' });
const offsetHistory = {};
offsetHistory[offsetEarlier.id] = offsetEarlier;
offsetHistory[offsetLater.id] = offsetLater;
assert(recurrence.getLatestChoreCompletion(offsetHistory, repeatDefinition.id) === offsetLater.completedAt, 'Offset completion anchors are ordered by instant without rewriting wire timestamps');
assert(recurrence.shouldPruneChoreOccurrence(offsetEarlier, { repeat: repeatDefinition }, offsetHistory, Date.parse('2026-12-01T00:00:00Z'), ['manager', 'other']), 'Older offset completion is prunable when a chronologically newer anchor exists');
assert(!recurrence.shouldPruneChoreOccurrence(offsetLater, { repeat: repeatDefinition }, offsetHistory, Date.parse('2026-12-01T00:00:00Z'), ['manager', 'other']), 'Chronologically newest offset completion remains an anchor');
const offsetDefinition = Object.assign({}, repeatDefinition, { title: 'Offset completion history', assignment: { mode: 'person', participantIds: ['manager'] }, schedule: Object.assign({}, repeatDefinition.schedule, { startDate: '2026-01-01', intervalDays: 14 }), createdAt: timestamp, updatedAt: timestamp });
const offsetData = Object.assign({}, archiveData, { definitionsById: { repeat: offsetDefinition }, occurrencesById: offsetHistory });
paths['/data/navet-chore-workspace.json'] = JSON.stringify(Object.assign({}, doc, { data: offsetData, revision: 1 }));
const offsetRead = request('GET', '/__navet_chores__/workspace');
assert(offsetRead.status === 200, 'Native offset regression reads a valid restored workspace');
const offsetMaterialized = request('POST', '/__navet_chores__/commands', { commandId: 'native-offset-materialize', baseRevision: offsetRead.body.revision, action: { type: 'materialize_occurrences', rangeStart: '2026-08-18T00:00:00.000Z', rangeEnd: '2026-09-03T00:00:00.000Z' } });
assert(offsetMaterialized.status === 200, 'Native offset recurrence materialization succeeds');
const offsetAvailable = Object.values(offsetMaterialized.body.data.occurrencesById).filter(function (item) { return item.status === 'available'; });
assert(offsetAvailable.length === 1 && offsetAvailable[0].scheduledAt === '2026-08-31T10:00:00.000Z', 'Native personal recurrence selects the latest completion instant from restored offset history');
const offsetOriginal = Object.assign({}, originalOther, { id: 'repeat:2026-08-16T10:00:00.000Z:manager', assigneeIds: ['other'], assignmentSlot: 'manager:other', status: 'available', scheduledAt: '2026-08-16T10:00:00.000Z' });
const offsetOtherBoundary = Object.assign({}, originalOther, { id: 'repeat:2026-08-16T23:00:00.000Z:other', scheduledAt: '2026-08-16T23:00:00.000Z' });
const offsetOwnBoundary = Object.assign({}, offsetOriginal, { id: 'repeat:2026-08-17T00:30:00.000Z:manager', scheduledAt: '2026-08-17T01:30:00+01:00', assignmentSlot: 'manager', assigneeIds: ['manager'] });
const offsetFixed = Object.assign({}, fixedDefinition, { assignment: { mode: 'everyone', participantIds: ['other'] } });
const offsetFixedHistory = {};
offsetFixedHistory[offsetOriginal.id] = offsetOriginal;
offsetFixedHistory[offsetOtherBoundary.id] = offsetOtherBoundary;
offsetFixedHistory[offsetOwnBoundary.id] = offsetOwnBoundary;
assert(recurrence.getSupersedingChoreOccurrence(offsetOriginal, offsetFixed, offsetFixedHistory, offsetOtherBoundary.scheduledAt, ['manager', 'other']) === undefined, 'Reassigned fixed work is not superseded by recipient clock');
assert(recurrence.getSupersedingChoreOccurrence(offsetOriginal, offsetFixed, offsetFixedHistory, '2026-08-17T00:30:00Z', ['manager', 'other']).id === offsetOwnBoundary.id, 'Original roster clock supersedes at the actual offset instant after reassignment and membership edit');
const offsetSchedulerDefinition = Object.assign({}, offsetFixed, { title: 'Offset fixed boundary', createdAt: timestamp, updatedAt: timestamp });
const offsetSchedulerData = Object.assign({}, archiveData, { participantsById: people, definitionsById: { repeat: offsetSchedulerDefinition }, occurrencesById: offsetFixedHistory });
paths['/data/navet-chore-workspace.json'] = JSON.stringify(Object.assign({}, doc, { data: offsetSchedulerData, revision: 1 }));
const offsetScheduled = request('GET', '/__navet_chores__/workspace');
assert(offsetScheduled.status === 200 && offsetScheduled.body.data.occurrencesById[offsetOriginal.id].status === 'missed', 'Native scheduler marks reassigned original work missed at its offset successor boundary');
assert(offsetScheduled.body.data.occurrencesById[offsetOriginal.id].supersededAt === offsetOwnBoundary.scheduledAt, 'Native scheduler retains exact original offset boundary in history');
// A restarted VM must accept the actual offset marker from both durable copies.
paths['/data/navet-chore-workspace.json'] = JSON.stringify(offsetScheduled.body);
paths['/data/navet-chore-workspace.last-good.json'] = JSON.stringify(offsetScheduled.body);
const offsetRestart = request('GET', '/__navet_chores__/workspace');
assert(offsetRestart.status === 200 && offsetRestart.body.data.occurrencesById[offsetOriginal.id].supersededAt === offsetOwnBoundary.scheduledAt, 'Restart accepts offset supersession in both primary and last-good snapshots');
const offsetPersisted = request('POST', '/__navet_chores__/commands', { commandId: 'native-offset-persist', baseRevision: offsetRestart.body.revision, action: { type: 'experience_points_adjust', actorParticipantId: 'manager', participantId: 'manager', pointsDelta: 1 } });
assert(offsetPersisted.status === 200, 'Offset-marked workspace accepts a durable mutation');
const offsetPersistedRead = request('GET', '/__navet_chores__/workspace');
assert(offsetPersistedRead.status === 200 && offsetPersistedRead.body.revision === offsetPersisted.body.revision && offsetPersistedRead.body.data.occurrencesById[offsetOriginal.id].supersededAt === offsetOwnBoundary.scheduledAt, 'Persisted offset marker survives the next read without recovery');
paths['/data/navet-chore-workspace.json'] = '{broken';
const offsetBackupRead = request('GET', '/__navet_chores__/workspace');
assert(offsetBackupRead.status === 200 && offsetBackupRead.body.data.occurrencesById[offsetOriginal.id].supersededAt === offsetOwnBoundary.scheduledAt, 'Offset-marked last-good snapshot restores corrupted primary');
// A quiet legacy backfill must still reach durable persistence, from either evidence source.
const quietEvidenceSources = ['successor', 'history'];
for (let quietIndex = 0; quietIndex < quietEvidenceSources.length; quietIndex += 1) {
  const evidenceSource = quietEvidenceSources[quietIndex];
  const quietBoundary = new Date(Date.now() - 3600000).toISOString();
  const quietDefinition = Object.assign({}, offsetSchedulerDefinition, { enabled: false, assignment: { mode: 'person', participantIds: ['manager'] } });
  const quietOriginal = Object.assign({}, offsetOriginal, { id: 'quiet-original', status: 'missed', assigneeIds: ['manager'], assignmentSlot: 'manager', scheduledAt: new Date(Date.now() - 86400000).toISOString(), dueAt: new Date(Date.now() + 86400000).toISOString(), missedAt: quietBoundary, supersededAt: undefined });
  const quietSuccessor = Object.assign({}, quietOriginal, { id: 'quiet-successor', status: 'done', scheduledAt: quietBoundary, completedAt: quietBoundary });
  const quietOccurrences = {};
  quietOccurrences[quietOriginal.id] = quietOriginal;
  if (evidenceSource === 'successor') quietOccurrences[quietSuccessor.id] = quietSuccessor;
  const quietActivity = evidenceSource === 'history' ? [{ id: 'quiet-missed', commandId: 'quiet-history', type: 'missed', occurrenceId: quietOriginal.id, definitionId: 'repeat', timestamp: quietBoundary, reason: 'Next scheduled occurrence started' }] : [];
  const quietData = Object.assign({}, archiveData, { definitionsById: { repeat: quietDefinition }, occurrencesById: quietOccurrences, activity: quietActivity, outbox: [] });
  const quietDocument = Object.assign({}, doc, { data: quietData, revision: 10 });
  paths['/data/navet-chore-workspace.json'] = JSON.stringify(quietDocument);
  paths['/data/navet-chore-workspace.last-good.json'] = JSON.stringify(quietDocument);
  const quietRead = request('GET', '/__navet_chores__/workspace');
  assert(quietRead.status === 200 && quietRead.body.data.occurrencesById[quietOriginal.id].supersededAt === quietBoundary, 'Quiet ' + evidenceSource + ' backfill reaches workspace response');
  assert(quietRead.body.revision === 11 && JSON.stringify(quietRead.body.data.activity) === JSON.stringify(quietActivity) && quietRead.body.data.outbox.length === 0, 'Marker-only backfill persists one revision without activity or reminders');
  const quietRestart = request('GET', '/__navet_chores__/workspace');
  assert(quietRestart.body.revision === 11 && quietRestart.body.data.occurrencesById[quietOriginal.id].supersededAt === quietBoundary, 'Quiet marker survives restart without repeated revision');
  const quietPersisted = JSON.parse(paths['/data/navet-chore-workspace.json']);
  assert(quietPersisted.data.occurrencesById[quietOriginal.id].supersededAt === quietBoundary, 'Quiet marker is in the actual persisted primary');
  delete quietPersisted.data.occurrencesById[quietSuccessor.id];
  quietPersisted.data.activity = [];
  paths['/data/navet-chore-workspace.json'] = JSON.stringify(quietPersisted);
  paths['/data/navet-chore-workspace.last-good.json'] = JSON.stringify(quietPersisted);
  const withoutEvidence = request('GET', '/__navet_chores__/workspace');
  assert(withoutEvidence.status === 200 && withoutEvidence.body.data.occurrencesById[quietOriginal.id].supersededAt === quietBoundary, 'Restart retains history after successor and event pruning');
  paths['/data/navet-chore-workspace.json'] = '{broken';
  const quietRecovered = request('GET', '/__navet_chores__/workspace');
  assert(quietRecovered.status === 200 && quietRecovered.body.data.occurrencesById[quietOriginal.id].supersededAt === quietBoundary, 'Backup recovery retains quiet durable history without successor');
}
print('Passed native NJS chore recurrence assertions');
