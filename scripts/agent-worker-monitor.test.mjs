import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { AgentTaskStore, resourceStatus } from './agent-task-store.mjs';
import { createPlanningBinding } from './agent-planning-scope.mjs';
import { dispatchPlanningDelivery } from './agent-planning-delivery-dispatch.mjs';
import { monitorPlanningWorker } from './agent-worker-monitor.mjs';
import { directorySeed } from './test-fixtures/directory-seed.mjs';

const directories = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });
// Keep: all monitor scenarios still use the real durable store after isolated setup.
const monitorSeed = directorySeed(async (directory) => {
  let time = 1_700_000_000_000;
  const now = () => time;
  const tick = () => ++time;
  const store = new AgentTaskStore(directory, { now });
  const issue = { uuid: 'proposal', teamId: 'team', projectId: 'project', title: 'Proposal', description: 'Private notes',
    attachments: [], labels: ['Approved'], archivedAt: null, canceledAt: null };
  const planningBinding = createPlanningBinding(issue);
  const request = { source: 'human-source', requestId: 'accepted-event', mode: 'implement', revision: 'scope-a', planningBinding,
    requiredGates: ['quality'], authority: { actor: 'maintainer', reference: 'human-decision', revision: 'scope-a',
      planningRevision: planningBinding.revision, observedAt: time },
    brief: { selectedOption: 'Repair setting', permittedChanges: ['Fix persistence'], visibility: 'public-delivery-approved',
      acceptanceCriteria: ['Save and reopen preserves value'] },
    resourceLimits: { maxElapsedMs: 100_000, maxModelTokens: 1000, maxToolCalls: 100 } };
  const task = await store.enqueue(request);
  const owner = 'coordinator';
  const act = (action, input = {}) => store.mutate(task.id, action, { owner, ...input });
  await act('claim', { durationMs: 100_000 });
  const readRequest = async () => ({ status: 'authorized', request: { ...structuredClone(request),
    authority: { ...request.authority, observedAt: tick() } } });
  const readIssue = async () => ({ status: 'available', issue: structuredClone(issue), reference: 'live-proposal', observedAt: tick() });
  await act('planning-observation', { observation: await readIssue() });
  await act('resource-usage', { usage: { modelTokens: 10, toolCalls: 1, reference: 'initial-usage', observedAt: tick() } });
  const reservation = await act('reserve-resources', { event: 'worker-creation', modelTokens: 100, toolCalls: 1 });
  const result = await dispatchPlanningDelivery({ store, owner, taskId: task.id, now, readRequest, readIssue,
    resourceToken: reservation.resourceDecision.reservation.token, createDelivery: async () => ({ threadId: 'worker' }),
    findDelivery: async () => ({ status: 'missing' }) });
  expect(result.status).toBe('bound');
  const identity = { taskId: task.id, dispatchToken: result.dispatch.token, threadId: 'worker', runId: 'run-1' };
  return { time, task, request, issue, identity };
}, { stateFiles: ['tasks.json'] });

async function setup() {
  const directory = await mkdtemp(path.join(tmpdir(), 'navet-worker-monitor-'));
  directories.push(directory);
  const seed = await monitorSeed(directory);
  let { time } = seed;
  const { task, request, issue, identity } = seed;
  const now = () => time; const tick = () => ++time;
  const store = new AgentTaskStore(directory, { now });
  const owner = 'coordinator';
  const act = (action, input = {}) => store.mutate(task.id, action, { owner, ...input });
  const readRequest = async () => ({ status: 'authorized', request: { ...structuredClone(request),
    authority: { ...request.authority, observedAt: tick() } } });
  const readIssue = async () => ({ status: 'available', issue: structuredClone(issue), reference: 'live-proposal', observedAt: tick() });
  const commands = [];
  let stopped = false;
  const worker = () => ({ ...identity, status: stopped ? 'stopped' : 'running', reference: 'worker-service', observedAt: tick(),
    ...(stopped ? { checkpoint: { reference: 'saved-checkpoint', head: null, nextAction: 'Review changes', privatePrompt: 'secret' } } : {}) });
  const options = { store, owner, taskId: task.id, now, readRequest, readIssue, maxStopAttempts: 2,
    readWorker: async () => worker(),
    readUsage: async () => ({ taskId: task.id, complete: true, modelTokens: 20, toolCalls: 2, reference: 'aggregate-usage', observedAt: tick() }),
    interruptWorker: async (input) => { commands.push(input); stopped = true; } };
  return { store, task, act, options, commands, identity, tick, now, worker,
    snapshot: async () => (await store.list())[0], stop: () => { stopped = true; }, advance: (ms) => { time += ms; } };
}

it('keeps a freshly authorized, measured worker running without a stop receipt', async () => {
  const h = await setup();
  expect(await monitorPlanningWorker(h.options)).toMatchObject({ status: 'within-policy' });
  expect(h.commands).toEqual([]);
  expect((await h.snapshot()).workerStop).toBeUndefined();
});
it.each(['modelTokens', 'toolCalls'])('stops on exhausted %s and verifies the checkpoint without completing the task', async (counter) => {
  const h = await setup();
  const result = await monitorPlanningWorker({ ...h.options, readUsage: async () => ({ taskId: h.task.id, complete: true,
    modelTokens: 20, toolCalls: 2, [counter]: counter === 'modelTokens' ? 1000 : 100, reference: 'aggregate-usage', observedAt: h.tick() }) });
  expect(result).toMatchObject({ status: 'stopped', stop: { reason: 'resource-exhausted', attempts: 1,
    checkpoint: { reference: 'saved-checkpoint', head: null, nextAction: 'Review changes' } } });
  expect(h.commands).toEqual([{ ...h.identity, stopToken: result.stop.token }]);
  expect(result.stop.checkpoint).not.toHaveProperty('privatePrompt');
  expect((await h.snapshot()).state).not.toBe('delivered');
  expect((await h.snapshot()).dispatch.threadId).toBe('worker');
});
it.each(['throw', 'incomplete', 'rollback', 'stale'])('invalidates cached usage on %s while preserving cumulative counters', async (kind) => {
  const h = await setup();
  const result = await monitorPlanningWorker({ ...h.options, readUsage: async () => {
    if (kind === 'throw') throw new Error('unavailable');
    return { taskId: h.task.id, complete: kind !== 'incomplete', modelTokens: kind === 'rollback' ? 0 : 20,
      toolCalls: 2, reference: 'aggregate', observedAt: kind === 'stale' ? h.now() - 1 : h.tick() };
  } });
  expect(result).toMatchObject({ status: 'stopped', stop: { reason: 'usage-unverified' } });
  const task = await h.snapshot();
  expect(task.resources.usage.modelTokens).toBe(10);
  expect(resourceStatus(task, h.now()).measurementFresh).toBe(false);
  await expect(h.act('resource-usage', { usage: { modelTokens: 20, toolCalls: 2, reference: 'tie',
    observedAt: task.resources.unavailable.observedAt } })).rejects.toThrow('monotonic');
  await h.act('resource-usage', { usage: { modelTokens: 20, toolCalls: 2, reference: 'fresh', observedAt: h.tick() } });
  expect(resourceStatus(await h.snapshot(), h.now()).measurementFresh).toBe(true);
});
it.each(['withdrawn', 'unavailable', 'changed-proposal'])('stops when authority becomes %s', async (kind) => {
  const h = await setup();
  const result = await monitorPlanningWorker({ ...h.options,
    ...(kind === 'changed-proposal' ? { readIssue: async () => ({ status: 'unavailable', reference: 'failed', observedAt: h.tick() }) }
      : { readRequest: async () => ({ status: kind }) }) });
  expect(result.status).toBe('stopped');
  expect(h.commands).toHaveLength(1);
  expect((await h.snapshot()).requestRevocation !== undefined).toBe(kind === 'withdrawn');
});
it('does not equate an interrupt acknowledgement with stopping and caps retries using the same receipt', async () => {
  const h = await setup();
  const options = { ...h.options, readRequest: async () => ({ status: 'withdrawn' }),
    interruptWorker: async (input) => { h.commands.push(input); } };
  const first = await monitorPlanningWorker(options);
  expect(first).toMatchObject({ status: 'pending', stop: { status: 'unverified', attempts: 1 } });
  await expect(h.act('reserve-resources', { event: 'followup', modelTokens: 1, toolCalls: 1 })).rejects.toThrow();
  expect(await monitorPlanningWorker(options)).toMatchObject({ status: 'pending', stop: { token: first.stop.token, attempts: 2 } });
  expect(await monitorPlanningWorker(options)).toMatchObject({ status: 'pending' });
  expect(h.commands).toHaveLength(2);
  expect(h.commands[0]).toEqual(h.commands[1]);
  h.stop();
  expect(await monitorPlanningWorker(options)).toMatchObject({ status: 'stopped', stop: { token: first.stop.token, attempts: 2 } });
});
it('verifies stopping even when the command acknowledgement is lost', async () => {
  const h = await setup();
  expect(await monitorPlanningWorker({ ...h.options, readRequest: async () => ({ status: 'withdrawn' }),
    interruptWorker: async () => { h.stop(); throw new Error('Lost acknowledgement'); } })).toMatchObject({ status: 'stopped' });
});
it.each(['foreign', 'stale', 'unknown'])('rejects %s worker evidence without interruption', async (kind) => {
  const h = await setup();
  expect(await monitorPlanningWorker({ ...h.options, readWorker: async () => ({ ...h.worker(),
    ...(kind === 'foreign' ? { threadId: 'other' } : kind === 'unknown' ? { status: 'unknown' } : { observedAt: h.now() - 2 }) }) }))
    .toMatchObject({ status: 'blocked' });
  expect(h.commands).toEqual([]);
});
it('retains an unresolved stop when the service cannot prove a saved checkpoint', async () => {
  const h = await setup();
  expect(await monitorPlanningWorker({ ...h.options, readRequest: async () => ({ status: 'withdrawn' }),
    readWorker: async () => { const worker = h.worker(); if (worker.status === 'stopped') delete worker.checkpoint; return worker; } }))
    .toMatchObject({ status: 'pending' });
  expect((await h.snapshot()).workerStop.status).toBe('pending');
});
it('rejects pre-cancellation and foreign leases without interrupting', async () => {
  const h = await setup(); const controller = new AbortController(); controller.abort();
  expect(await monitorPlanningWorker({ ...h.options, signal: controller.signal })).toMatchObject({ status: 'blocked' });
  expect(await monitorPlanningWorker({ ...h.options, owner: 'other' })).toMatchObject({ status: 'blocked' });
  expect(h.commands).toEqual([]);
});
it('preserves a committed stop intent if cancellation arrives during its acknowledgement', async () => {
  const h = await setup(); const controller = new AbortController();
  const store = { list: () => h.store.list(), mutate: async (...args) => {
    const task = await h.store.mutate(...args);
    if (args[1] === 'worker-stop-intent') controller.abort();
    return task;
  } };
  const result = await monitorPlanningWorker({ ...h.options, store, signal: controller.signal,
    readRequest: async () => ({ status: 'withdrawn' }) });
  expect(result).toMatchObject({ status: 'pending', stop: { attempts: 0 } });
  expect((await h.snapshot()).workerStop.token).toBe(result.stop.token);
  expect(h.commands).toEqual([]);
  expect(await monitorPlanningWorker(h.options)).toMatchObject({ status: 'stopped', stop: { token: result.stop.token } });
});
it('never interrupts a replacement run while an earlier stop is unresolved', async () => {
  const h = await setup();
  await monitorPlanningWorker({ ...h.options, readRequest: async () => ({ status: 'withdrawn' }), interruptWorker: async () => {} });
  const receipt = (await h.snapshot()).workerStop;
  expect(await monitorPlanningWorker({ ...h.options, readWorker: async () => ({ ...h.worker(), runId: 'replacement' }) }))
    .toMatchObject({ status: 'pending', stop: { token: receipt.token, runId: 'run-1' } });
  expect(h.commands).toEqual([]);
});
it('reconciles a stopped run before sending a command', async () => {
  const h = await setup(); let reads = 0;
  expect(await monitorPlanningWorker({ ...h.options, readRequest: async () => ({ status: 'withdrawn' }),
    readWorker: async () => { if (++reads === 3) h.stop(); return h.worker(); } }))
    .toMatchObject({ status: 'stopped', stop: { attempts: 0 } });
  expect(h.commands).toEqual([]);
});
it('bounds an unresponsive service without guessing worker status', async () => {
  const h = await setup();
  expect(await monitorPlanningWorker({ ...h.options, maxRunMs: 30, readWorker: async () => new Promise(() => {}) }))
    .toMatchObject({ status: 'blocked' });
  expect(h.commands).toEqual([]);
});
it('refuses to replace an unresolved stop or enlarge its retry budget', async () => {
  const h = await setup();
  const result = await monitorPlanningWorker({ ...h.options, readRequest: async () => ({ status: 'unavailable' }), interruptWorker: async () => {} });
  await expect(h.act('worker-stop-intent', { worker: h.worker(), reason: 'usage-unverified', maxAttempts: 3 }))
    .rejects.toThrow('cannot be replaced');
  await expect(h.act('worker-stop-intent', { worker: { ...h.worker(), runId: 'replacement' },
    reason: 'usage-unverified', maxAttempts: 2 })).rejects.toThrow('cannot be replaced');
  expect((await h.snapshot()).workerStop.token).toBe(result.stop.token);
});
it('requires a stop observation after its interruption attempt and validates checkpoint fields', async () => {
  const h = await setup();
  await monitorPlanningWorker({ ...h.options, readRequest: async () => ({ status: 'unavailable' }), interruptWorker: async () => {} });
  const receipt = (await h.snapshot()).workerStop;
  await expect(h.act('worker-stop-observation', { token: receipt.token, worker: { ...h.worker(), status: 'stopped',
    observedAt: receipt.intentAt - 1, checkpoint: { head: null, reference: 'saved', nextAction: 'Review' } } }))
    .rejects.toThrow('fresh exact run');
  for (const checkpoint of [{ reference: 'saved', nextAction: 'Review' }, { head: null, reference: '', nextAction: 'Review' },
    { head: null, reference: 'saved', nextAction: '' }]) {
    await expect(h.act('worker-stop-observation', { token: receipt.token, worker: { ...h.worker(), status: 'stopped', checkpoint } }))
      .rejects.toThrow();
  }
  expect((await h.snapshot()).workerStop.status).toBe('unverified');
});
it('blocks further execution on pending stop even without permanent authority withdrawal', async () => {
  const h = await setup();
  await monitorPlanningWorker({ ...h.options, readRequest: async () => ({ status: 'unavailable' }), interruptWorker: async () => {} });
  expect((await h.snapshot()).requestRevocation).toBeUndefined();
  await expect(h.act('reserve-resources', { event: 'followup', modelTokens: 1, toolCalls: 1 }))
    .rejects.toThrow('worker-stop-unverified');
  await h.act('resource-usage', { usage: { modelTokens: 30, toolCalls: 3, reference: 'recovery-accounting', observedAt: h.tick() } });
  expect((await h.snapshot()).resources.usage.modelTokens).toBe(30);
});
it('stops after the elapsed execution limit despite a still-valid ownership lease', async () => {
  const h = await setup();
  await h.act('claim', { durationMs: 200_000 });
  h.advance(100_000);
  expect(await monitorPlanningWorker(h.options)).toMatchObject({ status: 'stopped', stop: { reason: 'resource-exhausted' } });
  expect((await h.snapshot()).lease.expiresAt).toBeGreaterThan(h.now());
});

it.each(['withdrawn', 'unavailable'])('rechecks %s authority for a naturally stopped worker and blocks fresh follow-ups', async (status) => {
  const h = await setup(); h.stop();
  expect(await monitorPlanningWorker({...h.options, readRequest: async () => ({status})})).toMatchObject({status:'inactive'});
  const saved = await h.snapshot();
  if(status==='withdrawn') expect(saved.requestRevocation).toBeDefined();
  else expect(saved.planning.observation.result).toBe('unverified');
  await expect(h.act('reserve-resources',{event:'stopped-followup',modelTokens:1,toolCalls:1})).rejects.toThrow();
  expect(h.commands).toEqual([]);
  expect(saved.resources.usage.modelTokens).toBe(20);
});
it('rechecks withdrawn proposal scope after natural completion without interrupting', async () => {
  const h = await setup(); h.stop();
  expect(await monitorPlanningWorker({...h.options,readIssue:async()=>{
    const observation=await h.options.readIssue();return {...observation,issue:{...observation.issue,labels:['Deferred']}};
  }})).toMatchObject({status:'inactive'});
  expect((await h.snapshot()).planning.revokedAt).toBeDefined();
  await expect(h.act('reserve-resources',{event:'stopped-followup',modelTokens:1,toolCalls:1})).rejects.toThrow();
  expect(h.commands).toEqual([]);
});
it('persists the complete final aggregate for a naturally stopped worker', async () => {
  const h = await setup(); h.stop();
  expect(await monitorPlanningWorker(h.options)).toMatchObject({status:'inactive'});
  const saved=await h.snapshot();
  expect(saved.resources.usage).toMatchObject({modelTokens:20,toolCalls:2,reference:'aggregate-usage'});
  expect(saved.resources.reservations.every(r=>!r.settledAt)).toBe(true);
  expect(saved.state).not.toBe('delivered');
  expect(h.commands).toEqual([]);
});
it('denies a follow-up when final stopped usage exhausts the token limit', async () => {
  const h = await setup(); h.stop();
  expect(await monitorPlanningWorker({...h.options,readUsage:async()=>({taskId:h.task.id,complete:true,
    modelTokens:1000,toolCalls:2,reference:'final-aggregate',observedAt:h.tick()})})).toMatchObject({status:'inactive'});
  expect((await h.snapshot()).resources.usage.modelTokens).toBe(1000);
  await expect(h.act('reserve-resources',{event:'stopped-followup',modelTokens:1,toolCalls:1})).rejects.toThrow();
  expect(h.commands).toEqual([]);
});
it.each(['throw','incomplete','rollback','stale'])('invalidates cached capacity when final stopped accounting is %s', async (kind) => {
  const h = await setup(); h.stop();
  expect(await monitorPlanningWorker({...h.options,readUsage:async()=>{
    if(kind==='throw')throw new Error('unavailable');
    return {taskId:h.task.id,complete:kind!=='incomplete',modelTokens:kind==='rollback'?0:20,toolCalls:2,
      reference:'final-aggregate',observedAt:kind==='stale'?h.now()-1:h.tick()};
  }})).toMatchObject({status:'inactive'});
  const saved=await h.snapshot();expect(saved.resources.usage.modelTokens).toBe(10);
  expect(resourceStatus(saved,h.now()).measurementFresh).toBe(false);
  await expect(h.act('reserve-resources',{event:'stopped-followup',modelTokens:1,toolCalls:1})).rejects.toThrow();
  expect(h.commands).toEqual([]);
});
it('closes cached planning permission before a stopped authority check can be canceled', async () => {
  const h=await setup();h.stop();const controller=new AbortController();let authorityEntered=false;
  expect(await monitorPlanningWorker({...h.options,signal:controller.signal,readRequest:async()=>{
    authorityEntered=true;controller.abort();return new Promise(()=>{});
  }})).toMatchObject({status:'blocked'});
  expect(authorityEntered).toBe(true);
  expect((await h.snapshot()).planning.observation.result).toBe('unverified');
  await expect(h.act('reserve-resources',{event:'stopped-followup',modelTokens:1,toolCalls:1})).rejects.toThrow();
  expect(h.commands).toEqual([]);
});
it('rejects a successor observed during final stopped reconciliation without interrupting it', async () => {
  const h=await setup();h.stop();let reads=0;
  expect(await monitorPlanningWorker({...h.options,readWorker:async()=>({...h.worker(),
    ...(++reads===1?{}:{runId:'successor',status:'running'})})})).toMatchObject({status:'blocked'});
  expect(resourceStatus(await h.snapshot(),h.now()).measurementFresh).toBe(false);
  expect(h.commands).toEqual([]);
});
