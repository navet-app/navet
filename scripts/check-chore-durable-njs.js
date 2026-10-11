import storage from '/etc/nginx/njs/chore-durable-storage.js';
import choreStore from '/etc/nginx/njs/chore-store.js';
import recurrence from '/etc/nginx/njs/chore-recurrence-policy.js';
import crypto from 'crypto';
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
const fixedDefinition = Object.assign({}, repeatDefinition, { schedule: { frequency: 'weekly' } });
assert(recurrence.getSupersedingChoreOccurrence(unfinished, fixedDefinition, { old: unfinished, next: Object.assign({}, unfinished, { id: 'new', scheduledAt: '2026-10-11T10:00:00.000Z' }) }, '2026-10-11T10:00:00.000Z').id === 'new', 'Scheduled work is superseded when the next interval starts');
print('Passed native NJS chore recurrence assertions');
