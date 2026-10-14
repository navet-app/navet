import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import durableStorage from '@docker/njs/chore-durable-storage.js';
import { createChoreExperienceState } from '@navet/core/chore-experience';
import { createViteChoreStoreRequestHandler } from '@scripts/vite-chore-store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  continuousMaterializationFixture,
  loneStaleRepeatFixture,
  longIntervalRepairFixture,
} from '../../../../../testing/chore-storage-fixture';

const TENANT_ID = `hat_${'a'.repeat(64)}`;
const PRINCIPAL = {
  providerId: 'home_assistant',
  tenantId: TENANT_ID,
  sessionId: 'nas_chore_test',
  userId: 'ha-user-1',
  userName: 'Vishal',
};
const tempDirs: string[] = [];

function createRequest(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body = ''
) {
  return {
    method,
    url,
    headers: { host: 'navet.example', origin: 'http://navet.example', ...headers },
    async *[Symbol.asyncIterator]() {
      if (body) yield Buffer.from(body);
    },
  } as unknown as IncomingMessage;
}

function createResponse() {
  const headers = new Map<string, string>();
  let body = '';
  const response = {
    statusCode: 200,
    setHeader: vi.fn((name: string, value: string | number) => {
      headers.set(name.toLowerCase(), String(value));
      return response;
    }),
    end: vi.fn((value?: string) => {
      body = value ?? '';
      return response;
    }),
  } as unknown as ServerResponse;
  return {
    response,
    get status() {
      return response.statusCode;
    },
    get body() {
      return body;
    },
    header(name: string) {
      return headers.get(name.toLowerCase());
    },
  };
}

const fixtureTimestamp = '2026-08-10T08:00:00.000Z';
const fixtureDefinition = {
  id: 'dishes',
  title: 'Empty dishes',
  enabled: true,
  assignment: { mode: 'person' as const, participantIds: ['maya'] },
  schedule: {
    frequency: 'once' as const,
    date: '2026-08-10',
    time: '10:00',
    timeZone: 'UTC',
  },
  dueWindowMinutes: 120,
  approval: { required: false, approverIds: [] },
  createdAt: fixtureTimestamp,
  updatedAt: fixtureTimestamp,
};
const OCCURRENCE_ID = 'dishes:2026-08-10T10:00:00.000Z:maya';

function participantActionBody(commandId: string, baseRevision: number, id = 'maya') {
  return JSON.stringify({
    commandId,
    baseRevision,
    action: {
      type: 'participant_create',
      participant: {
        id,
        displayName: id === 'maya' ? 'Maya' : 'Sofia',
        capabilities: ['complete', 'approve', 'manage'],
        createdAt: fixtureTimestamp,
        updatedAt: fixtureTimestamp,
      },
    },
  });
}

function definitionActionBody(commandId: string, baseRevision: number) {
  return JSON.stringify({
    commandId,
    baseRevision,
    action: {
      type: 'definition_create',
      actorParticipantId: 'maya',
      definition: fixtureDefinition,
    },
  });
}

function experienceActionBody(commandId: string, baseRevision: number) {
  return JSON.stringify({
    commandId,
    baseRevision,
    action: {
      type: 'experience_update',
      actorParticipantId: 'maya',
      experience: {
        ...createChoreExperienceState(),
        setupStartedAt: fixtureTimestamp,
        gamificationMode: 'off',
        presentationByDefinitionId: {},
        missionsById: {},
        rewardGoalsById: {},
        earnedPointsByParticipant: {},
        householdBonusPoints: 0,
        awardedMissionIds: [],
      },
    },
  });
}

function pointAdjustmentActionBody(commandId: string, baseRevision: number) {
  return JSON.stringify({
    commandId,
    baseRevision,
    action: {
      type: 'experience_points_adjust',
      actorParticipantId: 'maya',
      participantId: 'maya',
      pointsDelta: -12,
    },
  });
}

function materializeActionBody(commandId: string, baseRevision: number) {
  return JSON.stringify({
    commandId,
    baseRevision,
    action: {
      type: 'materialize_occurrences',
      rangeStart: '2026-08-10T00:00:00.000Z',
      rangeEnd: '2026-08-11T00:00:00.000Z',
    },
  });
}

function occurrenceActionBody(commandId: string, baseRevision: number) {
  return JSON.stringify({
    commandId,
    baseRevision,
    action: {
      type: 'occurrence_action',
      occurrenceId: OCCURRENCE_ID,
      action: { type: 'complete', participantId: 'maya' },
    },
  });
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('Vite chore workspace store', () => {
  it('does not persist unchanged materialization with fresh command IDs', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'navet-chores-noop-'));
    tempDirs.push(directory);
    const filePath = join(directory, 'chores.json');
    const handler = createViteChoreStoreRequestHandler({
      filePath,
      resolvePrincipal: () => PRINCIPAL,
    });
    const first = createResponse();
    await handler(createRequest('GET', '/workspace'), first.response);
    const revision = JSON.parse(first.body).revision;
    const disk = () =>
      readdirSync(directory).map((name) => {
        const stat = statSync(join(directory, name));
        return { name, inode: stat.ino, modified: stat.mtimeMs };
      });
    const before = disk();
    for (let index = 0; index < 5; index++) {
      const response = createResponse();
      await handler(
        createRequest(
          'POST',
          '/commands',
          { 'x-navet-base-revision': String(revision) },
          JSON.stringify({
            commandId: `redundant:${index}`,
            baseRevision: revision,
            action: {
              type: 'materialize_occurrences',
              rangeStart: '2026-08-10T00:00:00.000Z',
              rangeEnd: '2026-08-11T00:00:00.000Z',
            },
          })
        ),
        response.response
      );
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body).revision).toBe(revision);
    }
    expect(disk()).toEqual(before);
  });

  it('persists legacy marker-only scheduler backfill without requiring new activities', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-18T08:00:00.000Z'));
    const directory = mkdtempSync(join(tmpdir(), 'navet-chore-marker-'));
    tempDirs.push(directory);
    const filePath = join(directory, 'chores.json');
    const handler = createViteChoreStoreRequestHandler({
      filePath,
      resolvePrincipal: () => PRINCIPAL,
    });
    const participant = createResponse();
    await handler(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': '0' },
        participantActionBody('marker-manager', 0)
      ),
      participant.response
    );
    const document = JSON.parse(readFileSync(filePath, 'utf8'));
    document.data.definitionsById.dishes = fixtureDefinition;
    document.data.occurrencesById[OCCURRENCE_ID] = {
      id: OCCURRENCE_ID,
      definitionId: 'dishes',
      scheduledAt: '2026-08-10T10:00:00.000Z',
      dueAt: '2026-08-20T12:00:00.000Z',
      assigneeIds: ['maya'],
      assignmentSlot: 'maya',
      status: 'missed',
      updatedAt: '2026-08-17T10:00:00.000Z',
    };
    document.data.activity.push({
      id: 'legacy-missed',
      commandId: 'legacy-missed',
      type: 'missed',
      occurrenceId: OCCURRENCE_ID,
      definitionId: 'dishes',
      reason: 'Next scheduled occurrence started',
      timestamp: '2026-08-17T10:00:00.000Z',
    });
    writeFileSync(filePath, JSON.stringify(document));
    const read = createResponse();
    await handler(createRequest('GET', '/workspace'), read.response);
    expect(read.status).toBe(200);
    const updated = JSON.parse(read.body);
    expect(updated.data.activity).toEqual(document.data.activity);
    expect(updated.data.occurrencesById[OCCURRENCE_ID].supersededAt).toBe(
      '2026-08-17T10:00:00.000Z'
    );
    expect(
      JSON.parse(readFileSync(filePath, 'utf8')).data.occurrencesById[OCCURRENCE_ID].supersededAt
    ).toBe('2026-08-17T10:00:00.000Z');
  });

  it('reports authenticated standalone runtime capabilities', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'navet-chore-store-'));
    tempDirs.push(directory);
    const handler = createViteChoreStoreRequestHandler({
      filePath: join(directory, 'chores.json'),
      resolvePrincipal: () => PRINCIPAL,
    });

    const capabilities = createResponse();
    await handler(createRequest('GET', '/capabilities'), capabilities.response);

    expect(capabilities.status).toBe(200);
    expect(JSON.parse(capabilities.body)).toEqual({
      contractVersion: 1,
      schemaVersion: 2,
      authority: 'standalone',
      backgroundScheduling: false,
      backgroundNotifications: false,
      projectionOwnedByAuthority: false,
      actionServices: false,
    });

    const unauthorizedHandler = createViteChoreStoreRequestHandler({
      filePath: join(directory, 'unauthorized-chores.json'),
      resolvePrincipal: () => null,
    });
    const unauthorized = createResponse();
    await unauthorizedHandler(createRequest('GET', '/capabilities'), unauthorized.response);

    expect(unauthorized.status).toBe(401);
    expect(JSON.parse(unauthorized.body)).toEqual({ error: 'Authentication required' });
  });

  it('mirrors revision, conditional reads, conflict, and idempotency behavior', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'navet-chore-store-'));
    tempDirs.push(directory);
    const handler = createViteChoreStoreRequestHandler({
      filePath: join(directory, 'chores.json'),
      resolvePrincipal: () => PRINCIPAL,
    });

    const initial = createResponse();
    await handler(createRequest('GET', '/workspace'), initial.response);
    expect(initial.status).toBe(200);
    expect(JSON.parse(initial.body).revision).toBe(0);

    const committed = createResponse();
    await handler(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': '0' },
        participantActionBody('one', 0)
      ),
      committed.response
    );
    expect(committed.status).toBe(200);
    expect(JSON.parse(committed.body).revision).toBe(1);

    const unchanged = createResponse();
    await handler(
      createRequest('GET', '/workspace', { 'x-navet-chore-revision': '1' }),
      unchanged.response
    );
    expect(unchanged.status).toBe(304);

    const stale = createResponse();
    await handler(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': '0' },
        participantActionBody('two', 0, 'sofia')
      ),
      stale.response
    );
    expect(stale.status).toBe(412);

    const retry = createResponse();
    await handler(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': '0' },
        participantActionBody('one', 0)
      ),
      retry.response
    );
    expect(retry.status).toBe(200);
    expect(JSON.parse(retry.body).revision).toBe(1);
  });

  it('returns client errors for invalid JSON and cross-origin writes', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'navet-chore-store-'));
    tempDirs.push(directory);
    const handler = createViteChoreStoreRequestHandler({
      filePath: join(directory, 'chores.json'),
      resolvePrincipal: () => PRINCIPAL,
    });

    const invalid = createResponse();
    await handler(
      createRequest('POST', '/commands', { 'x-navet-base-revision': '0' }, '{'),
      invalid.response
    );
    expect(invalid.status).toBe(400);

    const crossOrigin = createResponse();
    await handler(
      createRequest(
        'POST',
        '/commands',
        { origin: 'https://attacker.example', 'x-navet-base-revision': '0' },
        participantActionBody('one', 0)
      ),
      crossOrigin.response
    );
    expect(crossOrigin.status).toBe(403);
  });

  it('keeps setup experience data readable after it is committed', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'navet-chore-store-'));
    tempDirs.push(directory);
    const handler = createViteChoreStoreRequestHandler({
      filePath: join(directory, 'chores.json'),
      resolvePrincipal: () => PRINCIPAL,
    });

    const participant = createResponse();
    await handler(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': '0' },
        participantActionBody('create-manager', 0)
      ),
      participant.response
    );
    expect(participant.status).toBe(200);

    const experience = createResponse();
    await handler(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': '1' },
        experienceActionBody('start-setup', 1)
      ),
      experience.response
    );
    expect(experience.status).toBe(200);

    const reloaded = createResponse();
    await handler(createRequest('GET', '/workspace'), reloaded.response);
    expect(reloaded.status).toBe(200);
    expect(JSON.parse(reloaded.body)).toMatchObject({
      revision: 2,
      data: {
        experience: { setupStartedAt: fixtureTimestamp },
        activity: [
          { type: 'participant_created' },
          { type: 'experience_updated', actorParticipantId: 'maya' },
        ],
      },
    });
  });

  it('serializes concurrent additive actions without lost updates or client retries', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'navet-chore-concurrency-'));
    tempDirs.push(directory);
    const handler = createViteChoreStoreRequestHandler({
      filePath: join(directory, 'chores.json'),
      resolvePrincipal: () => PRINCIPAL,
    });
    const manager = createResponse();
    await handler(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': '0' },
        participantActionBody('manager', 0)
      ),
      manager.response
    );
    const responses = [createResponse(), createResponse()];
    await Promise.all(
      responses.map((response, index) =>
        handler(
          createRequest(
            'POST',
            '/commands',
            { 'x-navet-base-revision': '1' },
            pointAdjustmentActionBody('parallel:' + index, 1)
          ),
          response.response
        )
      )
    );
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const latest = createResponse();
    await handler(createRequest('GET', '/workspace'), latest.response);
    expect(JSON.parse(latest.body).data.experience.earnedPointsByParticipant.maya).toBe(-24);
    expect(JSON.parse(latest.body).data.experience.pointTransactions).toHaveLength(2);
  });

  it('upgrades a nearly full inline ledger and keeps its complete history through restart and backup', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'navet-chore-store-'));
    tempDirs.push(directory);
    const filePath = join(directory, 'chores.json');
    const makeHandler = () =>
      createViteChoreStoreRequestHandler({ filePath, resolvePrincipal: () => PRINCIPAL });
    let handler = makeHandler();
    const participant = createResponse();
    await handler(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': '0' },
        participantActionBody('large-manager', 0)
      ),
      participant.response
    );
    const document = JSON.parse(readFileSync(filePath, 'utf8'));
    document.data.experience.pointTransactions = Array.from({ length: 6000 }, (_, index) => ({
      id: `old:${index}:${'x'.repeat(150)}`,
      participantId: 'maya',
      pointsDelta: 1,
      kind: 'adjustment',
      timestamp: fixtureTimestamp,
    }));
    document.data.experience.earnedPointsByParticipant = { maya: 6000 };
    const maxBytes = 2 * 1024 * 1024;
    const spare = maxBytes - 100 - Buffer.byteLength(JSON.stringify(document), 'utf8');
    document.data.experience.pointTransactions.forEach((item: { id: string }, index: number) => {
      item.id += 'x'.repeat(Math.floor(spare / 6000) + (index < spare % 6000 ? 1 : 0));
    });
    writeFileSync(filePath, JSON.stringify(document));
    // Rewrite: the migration changes the public projection once, preserving the full export.
    const working = createResponse();
    await handler(createRequest('GET', '/workspace'), working.response);
    const workingRevision = JSON.parse(working.body).revision;
    const adjusted = createResponse();
    await handler(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': String(workingRevision) },
        pointAdjustmentActionBody('large-adjustment', workingRevision)
      ),
      adjusted.response
    );
    expect(adjusted.status).toBe(200);
    const data = JSON.parse(adjusted.body).data;
    expect(data.experience.pointTransactions.length).toBeLessThanOrEqual(128);
    expect(data.experience.earnedPointsByParticipant.maya).toBe(5988);
    expect(Buffer.byteLength(readFileSync(filePath, 'utf8'), 'utf8')).toBeLessThan(maxBytes);
    handler = makeHandler();
    const reloaded = createResponse();
    await handler(createRequest('GET', '/workspace'), reloaded.response);
    expect(JSON.parse(reloaded.body).data.experience).toEqual(data.experience);
    const backup = createResponse();
    await handler(createRequest('GET', '/backup'), backup.response);
    expect(JSON.parse(backup.body).workspace.experience.pointTransactions).toHaveLength(6001);
    const points = createResponse();
    await handler(createRequest('GET', '/points?after=5990&limit=20'), points.response);
    expect(JSON.parse(points.body).points).toHaveLength(11);
    expect(JSON.parse(points.body).hasMore).toBe(false);
    const revision = JSON.parse(adjusted.body).revision;
    const partial = createResponse();
    await handler(
      createRequest(
        'POST',
        '/restore',
        { 'x-navet-base-revision': String(revision) },
        JSON.stringify({
          commandId: 'reject-partial-import',
          baseRevision: revision,
          actorParticipantId: 'maya',
          mode: 'replace',
          document: { ...JSON.parse(backup.body), workspace: data },
        })
      ),
      partial.response
    );
    expect(partial.status).toBe(400);
    const restore = createResponse();
    await handler(
      createRequest(
        'POST',
        '/restore',
        { 'x-navet-base-revision': String(revision) },
        JSON.stringify({
          commandId: 'restore-large-ledger',
          baseRevision: revision,
          actorParticipantId: 'maya',
          mode: 'replace',
          document: JSON.parse(backup.body),
        })
      ),
      restore.response
    );
    expect(restore.status).toBe(200);
    expect(JSON.parse(restore.body).data.experience).toEqual(data.experience);
  });

  it('persists signed manager point adjustments', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'navet-chore-store-'));
    tempDirs.push(directory);
    const handler = createViteChoreStoreRequestHandler({
      filePath: join(directory, 'chores.json'),
      resolvePrincipal: () => PRINCIPAL,
    });
    const participant = createResponse();
    await handler(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': '0' },
        participantActionBody('point-manager', 0)
      ),
      participant.response
    );
    const adjustment = createResponse();
    await handler(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': '1' },
        pointAdjustmentActionBody('point-adjustment', 1)
      ),
      adjustment.response
    );
    expect(adjustment.status).toBe(200);
    expect(JSON.parse(adjustment.body)).toMatchObject({
      revision: 2,
      data: {
        experience: { earnedPointsByParticipant: { maya: -12 } },
        activity: [
          { type: 'participant_created' },
          {
            type: 'points_adjusted',
            participantId: 'maya',
            pointsDelta: -12,
          },
        ],
        outbox: [{ eventType: 'participant_created' }],
      },
    });
    expect(JSON.parse(adjustment.body).data.activity.at(-1)).not.toHaveProperty('reason');
  });

  it('applies occurrence actions against authoritative stored state', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'navet-chore-store-'));
    tempDirs.push(directory);
    const handler = createViteChoreStoreRequestHandler({
      filePath: join(directory, 'chores.json'),
      resolvePrincipal: () => PRINCIPAL,
    });

    const participant = createResponse();
    await handler(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': '0' },
        participantActionBody('participant', 0)
      ),
      participant.response
    );
    expect(participant.status).toBe(200);

    const definition = createResponse();
    await handler(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': '1' },
        definitionActionBody('definition', 1)
      ),
      definition.response
    );
    expect(definition.status).toBe(200);

    const materialize = createResponse();
    await handler(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': '2' },
        materializeActionBody('materialize', 2)
      ),
      materialize.response
    );
    expect(materialize.status).toBe(200);

    const complete = createResponse();
    await handler(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': '3' },
        occurrenceActionBody('complete', 3)
      ),
      complete.response
    );

    const completedDocument = JSON.parse(complete.body);
    expect(complete.status).toBe(200);
    expect(completedDocument.revision).toBe(4);
    expect(completedDocument.data.occurrencesById[OCCURRENCE_ID]).toMatchObject({
      status: 'done',
      completedBy: 'maya',
    });
    expect(completedDocument.data.activity.at(-1)).toMatchObject({
      commandId: 'complete',
      type: 'completed',
      actorParticipantId: 'maya',
    });
    expect(completedDocument.data.outbox.at(-1)).toMatchObject({
      activityId: 'activity:complete',
      eventType: 'completed',
      status: 'pending',
    });

    const replay = createResponse();
    await handler(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': '3' },
        occurrenceActionBody('complete', 3)
      ),
      replay.response
    );
    expect(replay.status).toBe(200);
    expect(JSON.parse(replay.body).revision).toBe(4);

    const history = createResponse();
    await handler(createRequest('GET', '/history'), history.response);
    expect(history.status).toBe(200);
    expect(JSON.parse(history.body).events.map((event: { type: string }) => event.type)).toEqual([
      'participant_created',
      'definition_created',
      'occurrence_created',
      'due',
      'overdue',
      'completed',
    ]);

    const backup = createResponse();
    await handler(createRequest('GET', '/backup'), backup.response);
    expect(JSON.parse(backup.body)).toMatchObject({
      contract: 'navet.chores',
      version: 1,
      workspace: { schemaVersion: 2 },
    });
    expect(JSON.parse(backup.body).events).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'participant_created' })])
    );

    const reset = createResponse();
    await handler(
      createRequest(
        'POST',
        '/reset',
        { 'x-navet-base-revision': '4' },
        JSON.stringify({
          commandId: 'reset-all',
          baseRevision: 4,
          actorParticipantId: 'maya',
          confirmation: 'DELETE ALL CHORES',
        })
      ),
      reset.response
    );
    expect(JSON.parse(reset.body)).toMatchObject({
      revision: 5,
      data: {
        participantsById: {},
        definitionsById: {},
        occurrencesById: {},
        activity: [],
        outbox: [],
      },
    });
    expect(existsSync(join(directory, 'chores.json.last-good'))).toBe(false);
    expect(existsSync(join(directory, 'chores.json.journal'))).toBe(false);
    expect(existsSync(join(directory, 'chores.json.events'))).toBe(false);

    const restore = createResponse();
    await handler(
      createRequest(
        'POST',
        '/restore',
        { 'x-navet-base-revision': '5' },
        JSON.stringify({
          commandId: 'restore-all',
          baseRevision: 5,
          actorParticipantId: 'maya',
          mode: 'replace',
          document: JSON.parse(backup.body),
        })
      ),
      restore.response
    );
    expect(JSON.parse(restore.body)).toMatchObject({
      revision: 6,
      data: {
        participantsById: { maya: { displayName: 'Maya' } },
        definitionsById: { dishes: { title: 'Empty dishes' } },
      },
    });

    const definitions = createResponse();
    await handler(createRequest('GET', '/definitions'), definitions.response);
    expect(JSON.parse(definitions.body)).toMatchObject({
      contractVersion: 1,
      revision: 6,
      definitions: [{ id: 'dishes', title: 'Empty dishes' }],
    });

    const occurrences = createResponse();
    await handler(
      createRequest('GET', '/occurrences?participantId=maya&definitionId=dishes'),
      occurrences.response
    );
    expect(JSON.parse(occurrences.body).occurrences).toEqual([
      expect.objectContaining({ id: OCCURRENCE_ID, status: 'done' }),
    ]);

    const firstEvents = createResponse();
    await handler(createRequest('GET', '/events?after=0&limit=2'), firstEvents.response);
    expect(JSON.parse(firstEvents.body)).toMatchObject({
      contractVersion: 1,
      cursor: '4',
      hasMore: true,
      events: [
        expect.objectContaining({ type: 'occurrence_created' }),
        expect.objectContaining({ type: 'due' }),
      ],
    });

    const nextEvents = createResponse();
    await handler(
      createRequest('GET', `/events?after=${JSON.parse(firstEvents.body).cursor}`),
      nextEvents.response
    );
    expect(JSON.parse(nextEvents.body).events.map((event: { type: string }) => event.type)).toEqual(
      ['overdue', 'completed']
    );
  });

  it('protects management mutations after a PIN is configured', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'navet-chore-store-'));
    tempDirs.push(directory);
    const handler = createViteChoreStoreRequestHandler({
      filePath: join(directory, 'chores.json'),
      resolvePrincipal: () => PRINCIPAL,
    });

    const participant = createResponse();
    await handler(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': '0' },
        participantActionBody('participant', 0)
      ),
      participant.response
    );

    const configure = createResponse();
    await handler(
      createRequest(
        'POST',
        '/management/pin',
        {},
        JSON.stringify({ actorParticipantId: 'maya', pin: '2468' })
      ),
      configure.response
    );
    expect(configure.status).toBe(200);

    const workspace = createResponse();
    await handler(createRequest('GET', '/workspace'), workspace.response);
    expect(JSON.parse(workspace.body).management).toEqual({ pinConfigured: true });

    const blocked = createResponse();
    await handler(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': '1' },
        pointAdjustmentActionBody('blocked-adjustment', 1)
      ),
      blocked.response
    );
    expect(blocked.status).toBe(403);

    const verify = createResponse();
    await handler(
      createRequest('POST', '/management/verify', {}, JSON.stringify({ pin: '2468' })),
      verify.response
    );
    const managementSession = JSON.parse(verify.body).sessionToken;
    expect(verify.status).toBe(200);
    expect(managementSession).toEqual(expect.any(String));

    const allowed = createResponse();
    await handler(
      createRequest(
        'POST',
        '/commands',
        {
          'x-navet-base-revision': '1',
          'x-navet-chore-management-session': managementSession,
        },
        pointAdjustmentActionBody('allowed-adjustment', 1)
      ),
      allowed.response
    );
    expect(allowed.status).toBe(200);
    expect(JSON.parse(allowed.body).data.experience.earnedPointsByParticipant).toEqual({
      maya: -12,
    });

    const remove = createResponse();
    await handler(
      createRequest(
        'DELETE',
        '/management/pin',
        { 'x-navet-chore-management-session': managementSession },
        JSON.stringify({ actorParticipantId: 'maya' })
      ),
      remove.response
    );
    expect(remove.status).toBe(200);
    expect(JSON.parse(remove.body)).toEqual({ pinConfigured: false });

    const unprotected = createResponse();
    const currentExperience = JSON.parse(allowed.body).data.experience;
    await handler(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': '2' },
        JSON.stringify({
          commandId: 'unprotected-experience',
          baseRevision: 2,
          action: {
            type: 'experience_update',
            actorParticipantId: 'maya',
            experience: { ...currentExperience, setupStartedAt: fixtureTimestamp },
          },
        })
      ),
      unprotected.response
    );
    expect(unprotected.status).toBe(200);
  });

  it('keeps an existing workspace across provider identity changes and server restarts', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'navet-chore-identity-'));
    tempDirs.push(directory);
    const filePath = join(directory, 'chores.json');
    const original = createViteChoreStoreRequestHandler({
      filePath,
      resolvePrincipal: () => PRINCIPAL,
    });
    const setup = createResponse();
    await original(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': '0' },
        participantActionBody('setup', 0)
      ),
      setup.response
    );
    expect(setup.status).toBe(200);
    const configure = createResponse();
    await original(
      createRequest(
        'POST',
        '/management/pin',
        {},
        JSON.stringify({ actorParticipantId: 'maya', pin: '2468' })
      ),
      configure.response
    );
    expect(configure.status).toBe(200);
    const originalPin = JSON.parse(readFileSync(`${filePath}.management`, 'utf8'));
    writeFileSync(
      `${filePath}.management`,
      JSON.stringify({ ...originalPin, tenantId: TENANT_ID })
    );
    const before = JSON.parse(readFileSync(filePath, 'utf8'));
    // Supported persisted format from before installation-owned authorization.
    writeFileSync(filePath, JSON.stringify({ ...before, tenantId: TENANT_ID }));
    const restarted = createViteChoreStoreRequestHandler({
      filePath,
      resolvePrincipal: () => ({ sessionId: 'a-different-authorized-provider-session' }),
    });
    const loaded = createResponse();
    await restarted(createRequest('GET', '/workspace'), loaded.response);
    expect(loaded.status).toBe(200);
    expect(JSON.parse(loaded.body).data).toEqual(before.data);
    expect(JSON.parse(readFileSync(filePath, 'utf8')).tenantId).toBe(before.tenantId);
    expect(JSON.parse(readFileSync(`${filePath}.management`, 'utf8'))).toMatchObject({
      salt: originalPin.salt,
      pinHash: originalPin.pinHash,
      tenantId: originalPin.tenantId,
    });
    expect(JSON.parse(loaded.body).management.pinConfigured).toBe(true);
    const unlock = createResponse();
    await restarted(
      createRequest('POST', '/management/verify', {}, JSON.stringify({ pin: '2468' })),
      unlock.response
    );
    expect(unlock.status).toBe(200);
    const protectedAction = createResponse();
    await restarted(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': String(JSON.parse(loaded.body).revision) },
        participantActionBody('without-pin', JSON.parse(loaded.body).revision, 'sofia')
      ),
      protectedAction.response
    );
    expect(protectedAction.status).toBe(403);

    const revoked = createViteChoreStoreRequestHandler({ filePath, resolvePrincipal: () => null });
    const denied = createResponse();
    await revoked(createRequest('GET', '/workspace'), denied.response);
    expect(denied.status).toBe(401);
    expect(JSON.parse(readFileSync(filePath, 'utf8')).data).toEqual(before.data);
  });

  it('migrates a persisted schema version 1 workspace before serving it', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'navet-chore-store-'));
    tempDirs.push(directory);
    const filePath = join(directory, 'chores.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        contractVersion: 1,
        tenantId: TENANT_ID,
        revision: 4,
        updatedAt: '2026-08-10T08:00:00.000Z',
        data: {
          schemaVersion: 1,
          participantsById: {},
          definitionsById: {},
          occurrencesById: {},
          activity: [],
        },
      })
    );
    const handler = createViteChoreStoreRequestHandler({
      filePath,
      resolvePrincipal: () => PRINCIPAL,
    });

    const response = createResponse();
    await handler(createRequest('GET', '/workspace'), response.response);

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      revision: 5,
      data: { schemaVersion: 2, outbox: [] },
    });
  });

  it('rebuilds damaged event history without taking the workspace offline', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'navet-chore-store-'));
    tempDirs.push(directory);
    const filePath = join(directory, 'chores.json');
    const handler = createViteChoreStoreRequestHandler({
      filePath,
      resolvePrincipal: () => PRINCIPAL,
    });

    const createPerson = createResponse();
    await handler(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': '0' },
        participantActionBody('person-before-history-error', 0)
      ),
      createPerson.response
    );
    writeFileSync(`${filePath}.events`, '{');

    const loaded = createResponse();
    await handler(createRequest('GET', '/workspace'), loaded.response);

    expect(loaded.status).toBe(200);
    expect(JSON.parse(loaded.body)).toMatchObject({
      data: { participantsById: { maya: { displayName: 'Maya' } } },
    });
  });

  it('restores the last healthy workspace when the primary file is damaged', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'navet-chore-store-'));
    tempDirs.push(directory);
    const filePath = join(directory, 'chores.json');
    const handler = createViteChoreStoreRequestHandler({
      filePath,
      resolvePrincipal: () => PRINCIPAL,
    });

    const first = createResponse();
    await handler(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': '0' },
        participantActionBody('first-person', 0)
      ),
      first.response
    );
    const second = createResponse();
    await handler(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': '1' },
        JSON.stringify({
          commandId: 'second-person',
          baseRevision: 1,
          action: {
            type: 'participant_create',
            actorParticipantId: 'maya',
            participant: {
              id: 'sofia',
              displayName: 'Sofia',
              capabilities: ['complete'],
              createdAt: fixtureTimestamp,
              updatedAt: fixtureTimestamp,
            },
          },
        })
      ),
      second.response
    );
    expect(second.status).toBe(200);
    writeFileSync(filePath, '{');

    const loaded = createResponse();
    await handler(createRequest('GET', '/workspace'), loaded.response);

    expect(loaded.status).toBe(200);
    expect(JSON.parse(loaded.body)).toMatchObject({
      revision: 2,
      data: { participantsById: { maya: { displayName: 'Maya' } } },
    });
    expect(JSON.parse(loaded.body).data.participantsById).not.toHaveProperty('sofia');
  });

  it('offers an explicit start-over recovery when no healthy copy exists', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'navet-chore-store-'));
    tempDirs.push(directory);
    const filePath = join(directory, 'chores.json');
    writeFileSync(filePath, '{');
    const handler = createViteChoreStoreRequestHandler({
      filePath,
      resolvePrincipal: () => PRINCIPAL,
    });

    const unavailable = createResponse();
    await handler(createRequest('GET', '/workspace'), unavailable.response);
    expect(unavailable.status).toBe(503);
    expect(JSON.parse(unavailable.body)).toMatchObject({
      recovery: { backupAvailable: false, pinConfigured: false, reason: 'workspace_invalid' },
    });

    const recovered = createResponse();
    await handler(
      createRequest(
        'POST',
        '/recovery',
        {},
        JSON.stringify({ action: 'reset', confirmation: 'RESET CHORES' })
      ),
      recovered.response
    );
    expect(recovered.status).toBe(200);
    expect(JSON.parse(recovered.body)).toMatchObject({
      revision: 0,
      data: { participantsById: {}, definitionsById: {} },
    });
  });
});

describe('Vite automatic chore storage repair', () => {
  afterEach(() => vi.useRealTimers());
  function seedLegacy(longIntervals = false, staleInterval?: number) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T10:00:00.000Z'));
    const directory = mkdtempSync(join(tmpdir(), 'navet-chore-upgrade-'));
    tempDirs.push(directory);
    const filePath = join(directory, 'chores.json');
    const { document, events } =
      staleInterval !== undefined
        ? loneStaleRepeatFixture(staleInterval)
        : longIntervals
          ? longIntervalRepairFixture()
          : continuousMaterializationFixture();
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    const stored = durableStorage.encode(document, 2 * 1024 * 1024, hash, (key, chunk) =>
      writeFileSync(`${filePath}.chunk-${key}`, JSON.stringify(durableStorage.unpack(chunk, hash)))
    );
    writeFileSync(filePath, JSON.stringify(durableStorage.unpack(stored, hash)));
    writeFileSync(`${filePath}.events`, JSON.stringify({ contractVersion: 1, events }));
    return {
      filePath,
      directory,
      document,
      events,
      handler: createViteChoreStoreRequestHandler({ filePath, resolvePrincipal: () => PRINCIPAL }),
    };
  }

  it('repairs an affected workspace on upgrade while preserving event offsets and restart state', async () => {
    const { filePath, directory, document, events, handler } = seedLegacy();
    const orphan = `${filePath}.chunk-${'f'.repeat(64)}`;
    writeFileSync(orphan, 'obsolete');
    const bytes = () =>
      readdirSync(directory).reduce(
        (sum, name) => sum + readFileSync(join(directory, name)).length,
        0
      );
    const beforeBytes = bytes();
    const read = createResponse();
    await handler(createRequest('GET', '/workspace'), read.response);
    expect(read.status).toBe(200);
    const saved = JSON.parse(read.body);
    expect(Object.values(saved.data.occurrencesById)).toEqual(
      Object.values(document.data.occurrencesById).filter((item) => item.status !== 'available')
    );
    expect(bytes()).toBeLessThan(beforeBytes * 0.3);
    expect(existsSync(orphan)).toBe(false);
    const history = createResponse();
    await handler(createRequest('GET', '/history'), history.response);
    expect(JSON.parse(history.body).events).toEqual(
      events.filter((event) => event.type !== 'workspace_materialized')
    );
    const feed = createResponse();
    await handler(createRequest('GET', '/events?after=50&limit=1'), feed.response);
    expect(JSON.parse(feed.body)).toMatchObject({ cursor: '101', events: [events[100]] });
    const filesBeforeReload = readdirSync(directory).map((name) => {
      const stats = statSync(join(directory, name));
      return { name, inode: stats.ino, modified: stats.mtimeMs };
    });
    const restarted = createViteChoreStoreRequestHandler({
      filePath,
      resolvePrincipal: () => PRINCIPAL,
    });
    const reload = createResponse();
    await restarted(createRequest('GET', '/workspace'), reload.response);
    expect(JSON.parse(reload.body)).toEqual(saved);
    expect(
      readdirSync(directory).map((name) => {
        const stats = statSync(join(directory, name));
        return { name, inode: stats.ino, modified: stats.mtimeMs };
      })
    ).toEqual(filesBeforeReload);
    const outstanding = Object.values(document.data.occurrencesById).find(
      (item) => item.status === 'missed'
    );
    if (!outstanding) throw new Error('Expected outstanding work in regression fixture');
    const complete = createResponse();
    await restarted(
      createRequest(
        'POST',
        '/commands',
        { 'x-navet-base-revision': String(saved.revision) },
        JSON.stringify({
          commandId: 'complete-upgraded',
          baseRevision: saved.revision,
          action: {
            type: 'occurrence_action',
            occurrenceId: outstanding.id,
            action: { type: 'complete', participantId: 'manager' },
          },
        })
      ),
      complete.response
    );
    expect(complete.status).toBe(200);
    expect(JSON.parse(complete.body).data.occurrencesById[outstanding.id].status).toBe('done');
  });

  it('reconciles obsolete long-interval repeats while preserving protected future work', async () => {
    const { handler } = seedLegacy(true);
    const { document, obsoleteIds } = longIntervalRepairFixture();
    const read = createResponse();
    await handler(createRequest('GET', '/workspace'), read.response);
    expect(read.status).toBe(200);
    expect(JSON.parse(read.body).data.occurrencesById).toEqual(
      Object.fromEntries(
        Object.entries(document.data.occurrencesById).filter(([id]) => !obsoleteIds.includes(id))
      )
    );
  });

  it.each([14, 120])(
    'recomputes a lone stale future repeat for a %i-day interval',
    async (intervalDays) => {
      const { handler, filePath } = seedLegacy(false, intervalDays);
      const { document, obsoleteIds } = loneStaleRepeatFixture(intervalDays);
      const read = createResponse();
      await handler(createRequest('GET', '/workspace'), read.response);
      expect(read.status).toBe(200);
      const saved = JSON.parse(read.body);
      expect(saved.data.occurrencesById).toEqual(
        Object.fromEntries(
          Object.entries(document.data.occurrencesById).filter(([id]) => !obsoleteIds.includes(id))
        )
      );
      const restarted = createViteChoreStoreRequestHandler({
        filePath,
        resolvePrincipal: () => PRINCIPAL,
      });
      const reload = createResponse();
      await restarted(createRequest('GET', '/workspace'), reload.response);
      expect(JSON.parse(reload.body)).toEqual(saved);
    }
  );

  it('retains the legacy primary and retries a failed upgrade commit', async () => {
    const { filePath, document, events, handler } = seedLegacy();
    const primary = readFileSync(filePath, 'utf8');
    mkdirSync(`${filePath}.tmp`);
    const failed = createResponse();
    await handler(createRequest('GET', '/workspace'), failed.response);
    expect(failed.status).toBe(503);
    expect(readFileSync(filePath, 'utf8')).toBe(primary);
    rmSync(`${filePath}.tmp`, { recursive: true });
    const retry = createResponse();
    await handler(createRequest('GET', '/workspace'), retry.response);
    expect(retry.status).toBe(200);
    expect(JSON.parse(retry.body).data.participantsById).toEqual(document.data.participantsById);
    const history = createResponse();
    await handler(createRequest('GET', '/history'), history.response);
    expect(JSON.parse(history.body).events).toEqual(
      events.filter((event) => event.type !== 'workspace_materialized')
    );
  });
});
