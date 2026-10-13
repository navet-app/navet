import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { completeTeamTask } from './agent-team-completion.mjs';
import { runTeamAccounting } from './agent-team-accounting.mjs';
import { AgentTaskStore } from './agent-task-store.mjs';
import { createPlanningBinding } from './agent-planning-scope.mjs';
import { linearResultBodyHash } from './agent-linear-result-reader.mjs';
import { invalidateTeamHeadEvidence } from './agent-team-state.mjs';
import { finishTeamArtifact, acceptTeamDelivery } from './agent-team-delivery.mjs';
import { directorySeed } from './test-fixtures/directory-seed.mjs';
const directories = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// Keep: completion assertions and native accounting run against isolated real stores.
const completionSeed = directorySeed(async (directory, key) => {
  const [proposal, settleWorkers] = JSON.parse(key);
  return (await completionHarness(directory, proposal, settleWorkers)).seedMetadata;
}, { stateFiles: ['tasks.json'] });
async function setup(proposal = false, settleWorkers = true) {
  const directory = await mkdtemp(path.join(tmpdir(), 'navet-team-delivery-')); directories.push(directory);
  const seed = await completionSeed(directory, JSON.stringify([proposal, settleWorkers]));
  return completionHarness(directory, proposal, settleWorkers, seed);
}
async function completionHarness(directory, proposal, settleWorkers, seed = null) {
  let time = seed?.time ?? 1_700_000_000_000; const now = () => time; const tick = () => ++time;
  const store = new AgentTaskStore(directory, { now }); const owner = 'coordinator';
  const issue = { uuid: id(7), teamId: id(2), projectId: id(3), title: 'Private idea', description: 'Scope',
    attachments: [], labels: [proposal ? 'Captured' : 'Approved'], archivedAt: null, canceledAt: null };
  const binding = createPlanningBinding(issue);
  const request = seed?.request ?? { resourceLimits: { maxElapsedMs: 100_000, maxModelTokens: 10_000, maxToolCalls: 100 }, source: 'human', requestId: proposal ? 'idea' : 'approved', revision: 'scope', mode: proposal ? 'research' : 'implement',
    ...(proposal ? { proposalBinding: binding } : { planningBinding: binding }),
    authority: { actor: id(6), reference: 'human:request', revision: 'scope', observedAt: time,
      ...(proposal ? { kind: 'maintainer-idea-request', proposalRevision: binding.revision } : { planningRevision: binding.revision }) },
    brief: { selectedOption: 'Selected option', permittedChanges: ['Authorized scope'], acceptanceCriteria: ['Intended behavior'],
      visibility: proposal ? 'private-planning' : 'public-delivery-approved',
      ...(proposal ? { purpose: 'proposal-development', resultDestination: 'linear-proposal',
        destination: { kind: 'linear', issueId: id(7), teamId: id(2), projectId: id(3) } } : {}) } };
  const task = seed?.task ?? await store.enqueue(request);
  const act = (action, input) => store.mutate(task.id, action, { owner, ...input });
  if (!seed) await act('claim', { durationMs: 100_000 });
  const policy = { organizationId: id(1), teamId: id(2), projectId: id(3), readerAppUserId: id(4), writerAppUserId: id(5), humanActorIds: [id(6)] };
  const identity = { taskId: task.id, issueId: id(7), scopeRevision: binding.revision, planRevision: 'plan-a',
    head: proposal ? null : 'head-a', revision: 'scope', phase: proposal ? 'proposal' : 'delivery' };
  const receipt = () => ({ status: 'available', reference: 'service:readback', observedAt: tick(), ...identity });
  const destination = () => ({ status: 'available', ...policy, issueId: id(7), readerIsApp: true, private: true, active: true, synced: false, observedAt: tick() });
  const writes = []; let available = true; const members = seed?.members ?? []; let inventoryComplete = true;
  const writeSession = async (member, total = 100) => {
    const at = tick();
    const event = (type, timestamp, payload) => ({ type: 'event_msg', timestamp: new Date(timestamp).toISOString(), payload: { type, ...payload } });
    const records = [{ type: 'session_meta', payload: { id: member.threadId } },
      event('task_started', at - 2, { turn_id: member.runId }),
      { type: 'response_item', payload: { type: 'custom_tool_call', call_id: 'call', input: 'Private fixture input' } },
      event('token_count', at, { info: { total_token_usage: { input_tokens: total - 1, output_tokens: 1, cached_input_tokens: 0, reasoning_output_tokens: 0, total_tokens: total } } })];
    if (member.status === 'stopped') records.push(event('task_complete', at, { turn_id: member.runId }));
    await writeFile(member.sessionFile, records.map((record) => JSON.stringify(record)).join('\n') + '\n');
  };
  const body = proposal ? 'source:observation Observed friction Keep current Selected option Owning module Compatibility Intended behavior private:prototype' : 'https://github.com/owner/repo/pull/1 https://preview.example check:behavior';
  const artifact = seed?.artifact ?? {
    body, bodyHash: linearResultBodyHash(body),
    manifest: { sources: ['source:observation'], findings: ['Observed friction'], options: ['Keep current', 'Selected option'],
      recommendedScope: 'Selected option', implementationSlices: ['Owning module'], risks: ['Compatibility'], acceptanceCriteria: ['Intended behavior'],
      unknowns: [], design: { status: 'applicable', references: ['private:prototype'], explanation: 'Sketch of intended interaction', states: ['empty', 'success', 'error'] } },
    pr: { ...receipt(), url: 'https://github.com/owner/repo/pull/1', state: 'open', draft: false, checks: 'pass', review: 'pass', unresolvedThreads: 0 },
    preview: { ...receipt(), url: 'https://preview.example', reachable: true, buildHead: 'head-a' },
    validation: [{ ...receipt(), criterion: 'Intended behavior', artifact: 'check:behavior', result: 'pass' }],
  };
  const adapters = {
    readTeamInventory: async () => ({ status: 'verified', complete: inventoryComplete, taskId: task.id, revision: 'scope', planRevision: 'plan-a',
      reference: 'native:inventory', observedAt: tick(), phase: 'active', policy: { status: 'accepted', unit: 'native-observed-operations-v1', taskRevision: 'scope', reference: 'fixture:accepted-policy' }, members: structuredClone(members) }),
    readIssue: async () => ({ status: 'available', issue: structuredClone(issue), reference: 'linear:issue', observedAt: tick() }),
    readRequest: async () => ({ status: 'authorized', request: { ...structuredClone(request), authority: { ...request.authority, observedAt: tick() } } }),
    readDestination: async () => destination(),
    readAuthority: async () => ({ ...receipt(), active: true, kind: proposal ? 'discovery' : 'implementation',
      actorIsApp: false, actorId: id(6), reference: 'human:request', expiresAt: time + 1000 }),
    writeUpdate: async (value) => {
      writes.push(value);
      if (value.receipt.kind === 'stage') issue.labels = [value.receipt.stage];
    },
    readUpdate: async (update) => {
      const value = writes.some((item) => item.receipt.updateId === update.updateId) && available
        ? { ...destination(), ...update, status: 'available', writerIsApp: true, onBehalfOf: null, url: 'https://linear.app/navet/issue/NAV-1', observedAt: tick() }
        : { status: available ? 'absent' : 'unavailable', observedAt: tick() };
      // The native coordinator session records the actual fixture read before accounting.
      if (members[0]) await writeSession(members[0], 1000);
      return value;
    },
    readAnswer: async () => ({ status: 'unavailable' }),
    readDelivery: async () => ({ ...structuredClone(artifact), ...receipt(),
      pr: { ...artifact.pr, observedAt: tick() }, preview: { ...artifact.preview, observedAt: tick() },
      validation: artifact.validation.map((item) => ({ ...item, observedAt: tick() })) }),
    readAcceptance: async () => ({ ...receipt(), prUrl: artifact.pr.url, actor: id(6), actorIsApp: false,
      result: 'accepted', kind: 'merge', merged: true, checks: 'pass', review: 'pass', unresolvedThreads: 0 }),
  };
  const accountingOptions = { store, owner, taskId: task.id, adapters, now };
  if (!seed) {
    await act(proposal ? 'proposal-observation' : 'planning-observation', { observation: await adapters.readIssue() });
    if (!proposal) await act('head', { head: identity.head });
    const assignments = proposal ? [{ id: 'research', role: 'researcher', dependsOn: [], files: [], brief: { purpose: 'Sourced options' } }]
      : [{ id: 'build', role: 'developer', dependsOn: [], files: ['scripts/example.mjs'], brief: { purpose: 'Approved scope' } },
        { id: 'test', role: 'tester', dependsOn: ['build'], files: [], brief: { purpose: 'Intended behavior' } },
        { id: 'review', role: 'independent-reviewer', dependsOn: ['test'], files: [], brief: { purpose: 'Independent assessment' } }];
    await act('team-event', { event: { eventId: 'plan', type: 'plan', revision: identity.planRevision, phase: identity.phase, assignments } });
    members.push({ role: 'coordinator', threadId: owner, runId: 'coordinator-turn', status: 'running', dedicated: true, sessionFile: path.join(directory, 'coordinator.jsonl') });
    await writeSession(members[0]);
    expect(await runTeamAccounting(accountingOptions)).toMatchObject({ complete: true });
    for (const assignment of assignments) {
      const allocation = await act('reserve-resources', { event: `fixture-worker:${assignment.id}`, modelTokens: 100, toolCalls: 1 });
      const event = (value) => act('team-event', { event: value, resourceToken: allocation.resourceDecision.reservation.token, authority: { ...request.authority, observedAt: tick() } });
      const intentId = assignment.id;
      await event({ eventId: `intent:${intentId}`, type: 'worker-intent', assignmentId: assignment.id, intentId });
      await event({ eventId: `attempt:${intentId}`, type: 'worker-attempt', intentId });
      await event({ eventId: `bind:${intentId}`, type: 'worker-bind', intentId, workerId: `worker:${intentId}` });
      members.push({ role: 'worker', threadId: `worker:${intentId}`, workerId: `worker:${intentId}`, intentId, runId: `${intentId}-turn`, status: 'stopped', dedicated: true, sessionFile: path.join(directory, `${intentId}.jsonl`) });
      await writeSession(members.at(-1));
      await writeSession(members[0], 100 + members.length);
      await event({ eventId: `complete:${intentId}`, type: 'worker-observation', intentId,
        observation: { status: 'completed', reference: 'worker:result', observedAt: tick(), workerId: `worker:${intentId}` },
        evidence: [{ gate: assignment.role === 'independent-reviewer' ? 'independent-review' : 'focused-check', result: 'pass', artifact: 'check:behavior',
          head: identity.head, revision: identity.revision, observedAt: tick() }] });
      if (settleWorkers) expect(await runTeamAccounting(accountingOptions)).toMatchObject({ complete: true });
    }
  }
  let reservationNumber = seed?.reservationNumber ?? 0;
  const reserve = async () => { const value = await act('reserve-resources', { event: `fixture-ticket:${reservationNumber++}`, modelTokens: 0, toolCalls: 1 }); return value.resourceDecision.reservation.token; };
  const resourceToken = seed?.resourceToken ?? await reserve(); const stageResourceToken = seed?.stageResourceToken ?? await reserve();
  return { seedMetadata: { time, task, request, members, artifact, reservationNumber, resourceToken, stageResourceToken },
    store, task, request, act, now, tick, members, reserve, writeSession, accountingOptions, setInventoryComplete: (value) => { inventoryComplete = value; }, artifact, adapters, writes, directory, identity,
    setAvailable: (value) => { available = value; }, options: { store, owner, taskId: task.id, adapters, policy, now, resourceToken, stageResourceToken } };
}
async function prepared(proposal, settleWorkers = true) {
  const h = await setup(proposal, settleWorkers);
  const output = await finishTeamArtifact(h.options);
  expect(output.status).toBe('verified');
  let stageUpdateId = output.stageUpdateId;
  if (!proposal) {
    const resourceToken = await h.reserve();
    const accepted = await acceptTeamDelivery({ ...h.options, stageResourceToken: resourceToken });
    expect(accepted.status).toBe('acceptance-recorded');
    stageUpdateId = accepted.stageUpdateId;
  }
  await h.writeSession(h.members[0], 1000);
  const failures = [];
  const tracedStore = { list: (...args) => h.store.list(...args), mutate: async (...args) => { try { return await h.store.mutate(...args); } catch (error) { failures.push(error.message); throw error; } } };
  return { ...h, failures, completion: { ...h.options, store: tracedStore, outputUpdateId: output.outputUpdateId, stageUpdateId } };
}
it('completes a private proposal only after exact Linear readbacks and actual native whole-team accounting, then releases ownership', async () => {
  const h = await prepared(true);
  const result = await completeTeamTask(h.completion);
  expect(h.failures).toEqual([]);
  expect(result).toMatchObject({ status: 'delivered' });
  const saved = (await new AgentTaskStore(h.directory, { now: h.now }).list())[0];
  expect(saved.state).toBe('delivered'); expect(saved.lease).toBeNull();
  expect(saved.team.status).toBe('proposal-complete');
  expect(saved.resources.accounting.members).toHaveLength(2);
  expect(saved.resources.usage.modelTokens).toBe(1100);
  expect(saved.resources.reservations.filter((item) => item.operation).every((item) => item.settledAt)).toBe(true);
  expect(await completeTeamTask(h.completion)).toMatchObject({ status: 'delivered' });
});
it('completes one approved delivery after exact human merge, Validated readback and developer/test/reviewer session coverage', async () => {
  const h = await prepared(false);
  expect(await completeTeamTask(h.completion)).toMatchObject({ status: 'delivered' });
  const saved = (await h.store.list())[0];
  expect(saved.team.status).toBe('accepted'); expect(saved.lease).toBeNull();
  expect(saved.resources.accounting.members).toHaveLength(4);
  expect(saved.resources.usage.modelTokens).toBe(1300);
  expect(saved.team.pr.url).toBe('https://github.com/owner/repo/pull/1');
});
it('blocks completion on unavailable exact readback, a missing output ID, or an unaccounted worker', async () => {
  const h = await prepared(true);
  h.setAvailable(false);
  expect(await completeTeamTask(h.completion)).not.toMatchObject({ status: 'delivered' });
  h.setAvailable(true);
  expect(await completeTeamTask({ ...h.completion, outputUpdateId: 'unknown' })).not.toMatchObject({ status: 'delivered' });
  const adapters = { ...h.adapters, readTeamInventory: async (...args) => {
    const inventory = await h.adapters.readTeamInventory(...args); inventory.members.pop(); return inventory;
  } };
  expect(await completeTeamTask({ ...h.completion, adapters })).not.toMatchObject({ status: 'delivered' });
  const saved = (await h.store.list())[0];
  expect(saved.state).not.toBe('delivered'); expect(saved.lease.owner).toBe('coordinator');
});
it('blocks terminal completion when the head changes after the delivery evidence', async () => {
  const h = await prepared(false);
  await h.act('head', { head: 'head-b' });
  expect(await completeTeamTask(h.completion)).not.toMatchObject({ status: 'delivered' });
  expect((await h.store.list())[0].state).not.toBe('delivered');
});
it('does not settle a bound worker allocation when native counters precede its reservation', async () => {
  const h = await prepared(true, false);
  // The persisted terminal worker is real, but its native counter measurement no longer
  // covers the owning reservation. A fresh inventory alone must not settle that operation.
  const worker = h.members[1];
  const saved = (await h.store.list())[0];
  const reservation = saved.resources.reservations.find((item) => item.operation === 'team-worker:research');
  const staleAt = reservation.reservedAt - 10;
  const records = [{ type: 'session_meta', payload: { id: worker.threadId } },
    { type: 'event_msg', timestamp: new Date(staleAt - 1).toISOString(), payload: { type: 'task_started', turn_id: worker.runId } },
    { type: 'event_msg', timestamp: new Date(staleAt).toISOString(), payload: { type: 'token_count', info: { total_token_usage: {
      input_tokens: 99, output_tokens: 1, cached_input_tokens: 0, reasoning_output_tokens: 0, total_tokens: 100 } } } },
    { type: 'event_msg', timestamp: new Date(staleAt).toISOString(), payload: { type: 'task_complete', turn_id: worker.runId } }];
  await writeFile(worker.sessionFile, records.map((record) => JSON.stringify(record)).join('\n') + '\n');
  expect(await completeTeamTask(h.completion)).not.toMatchObject({ status: 'delivered' });
  const current = (await h.store.list())[0];
  expect(current.state).not.toBe('delivered');
  expect(current.resources.accounting.complete).toBe(true);
  expect(current.resources.reservations.find((item) => item.token === reservation.token).settledAt).toBeUndefined();
  expect(h.failures).toContain('Team completion requires complete native accounting and reconciled reservations.');
});
it('keeps an uncertain Linear publication owned and nonterminal until exact publication readback exists', async () => {
  const h = await setup(true);
  const adapters = { ...h.adapters, writeUpdate: async (value) => { h.writes.push(value); h.setAvailable(false); throw new Error('Lost fixture acknowledgement'); } };
  expect(await finishTeamArtifact({ ...h.options, adapters })).toMatchObject({ status: 'uncertain' });
  const waiting = (await h.store.list())[0];
  const update = waiting.team.updates.find((item) => item.receipt.kind === 'proposal');
  expect(update.status).toBe('uncertain');
  expect(await completeTeamTask({ ...h.options, outputUpdateId: update.updateId, stageUpdateId: 'not-published' }))
    .not.toMatchObject({ status: 'delivered' });
  const saved = (await h.store.list())[0];
  expect(saved.state).not.toBe('delivered'); expect(saved.lease.owner).toBe('coordinator');
  expect(h.writes).toHaveLength(1);
});

it.each([true, false])('latches human withdrawal and retains owned nonterminal work before final completion (proposal=%s)', async (proposal) => {
  const h = await prepared(proposal);
  const adapters = { ...h.adapters, readRequest: async () => ({ status: 'withdrawn' }) };
  expect(await completeTeamTask({ ...h.completion, adapters })).toMatchObject({ status: 'pending' });
  const saved = (await h.store.list())[0];
  expect(saved.requestRevocation).toMatchObject({ source: h.request.source, requestId: h.request.requestId,
    reference: h.request.authority.reference, status: 'withdrawn' });
  expect(saved.state).not.toBe('delivered'); expect(saved.lease.owner).toBe('coordinator');
});
it.each(['unavailable', 'changed-request', 'stale-authority'])('blocks completion after final accepted request read is %s', async (kind) => {
  const h = await prepared(true);
  const adapters = { ...h.adapters, readRequest: async () => {
    if (kind === 'unavailable') return { status: 'unavailable' };
    const observed = await h.adapters.readRequest();
    if (kind === 'changed-request') observed.request.brief.selectedOption = 'Different scope';
    if (kind === 'stale-authority') observed.request.authority.observedAt = h.now() - 60_001;
    return observed;
  } };
  expect(await completeTeamTask({ ...h.completion, adapters })).toMatchObject({ status: 'pending' });
  expect((await h.store.list())[0].state).not.toBe('delivered');
});
it('blocks final completion if the authoritative head changes during accepted request verification', async () => {
  const h = await prepared(false);
  const adapters = { ...h.adapters, readRequest: async () => {
    const observed = await h.adapters.readRequest();
    await h.act('head', { head: 'head-b' }); return observed;
  } };
  expect(await completeTeamTask({ ...h.completion, adapters })).toMatchObject({ status: 'pending' });
  const saved = (await h.store.list())[0]; expect(saved.head).toBe('head-b'); expect(saved.state).not.toBe('delivered');
});
it('records the final authority read before native whole-team accounting', async () => {
  const h = await prepared(true); const reads = [];
  const adapters = { ...h.adapters, readIssue: async (...args) => { reads.push('scope'); return h.adapters.readIssue(...args); },
    readRequest: async (...args) => { reads.push('authority'); return h.adapters.readRequest(...args); },
    readTeamInventory: async (...args) => { reads.push('accounting'); return h.adapters.readTeamInventory(...args); } };
  expect(await completeTeamTask({ ...h.completion, adapters })).toMatchObject({ status: 'delivered' });
  expect(reads).toEqual(['scope', 'authority', 'accounting', 'accounting']);
});

it.each(['pr-evidence', 'Validated', 'Ready for prioritization'])('atomically rejects %s publication after same-head evidence invalidation', async (kind) => {
  const proposal = kind === 'Ready for prioritization';
  const h = await setup(proposal);
  const originalMutate = h.store.mutate.bind(h.store);
  let fenced = false;
  h.store.mutate = async (taskId, action, input) => {
    if (action === 'team-event' && input.event.type === 'ticket-attempt') {
      const saved = (await h.store.list())[0];
      const update = saved.team.updates.find(item => item.updateId === input.event.updateId);
      if (update.receipt.kind === kind || update.receipt.stage === kind) {
        await h.store.transaction(state => {
          const current = state.tasks.find(item => item.id === taskId);
          // The checkpoint transaction uses this same invalidation when stateHash changes.
          invalidateTeamHeadEvidence(current);
        });
        fenced = true;
      }
    }
    return originalMutate(taskId, action, input);
  };
  if (kind === 'Validated') {
    expect(await finishTeamArtifact(h.options)).toMatchObject({ status: 'verified' });
    const token = await h.reserve();
    expect(await acceptTeamDelivery({ ...h.options, stageResourceToken: token })).not.toMatchObject({ status: 'acceptance-recorded' });
  } else {
    expect(await finishTeamArtifact(h.options)).not.toMatchObject({ status: 'verified' });
  }
  expect(fenced).toBe(true);
  const saved = (await h.store.list())[0];
  const rejected = saved.team.updates.find(item => item.receipt.kind === kind || item.receipt.stage === kind);
  expect(rejected.receipt.attemptedAt).toBeNull();
  expect(h.writes.some(item => item.receipt.updateId === rejected.updateId)).toBe(false);
  expect(saved.resources.reservations.some(item => item.operation === `team-ticket:${rejected.updateId}`)).toBe(false);
});

it.each([true, false].flatMap(proposal => ['archived', 'canceled', 'edited', 'stage', 'unavailable', 'stale'].map(change => [proposal, change])))('rechecks issue scope before terminal ownership release (proposal=%s, change=%s)', async (proposal, change) => {
    const h = await prepared(proposal);
    const adapters = { ...h.adapters, readIssue: async () => {
      const observed = await h.adapters.readIssue();
      if (change === 'archived') observed.issue.archivedAt = new Date(h.now()).toISOString();
      if (change === 'canceled') observed.issue.canceledAt = new Date(h.now()).toISOString();
      if (change === 'edited') observed.issue.description += ' Changed scope';
      if (change === 'stage') observed.issue.labels = ['Rejected'];
      if (change === 'unavailable') return { status: 'unavailable', reference: 'linear:unavailable', observedAt: h.tick() };
      if (change === 'stale') observed.observedAt -= 60_001;
      return observed;
    } };
    expect(await completeTeamTask({ ...h.completion, adapters })).toMatchObject({ status: 'pending' });
    const saved = (await h.store.list())[0];
    expect(saved.state).not.toBe('delivered');
    expect(saved.lease.owner).toBe('coordinator');
});
it.each([true, false])('requires a current exact issue observation in the finish transaction (proposal=%s)', async (proposal) => {
  const h = await prepared(proposal);
  await expect(h.act('team-event', { event: { eventId: 'unsafe-finish', type: 'finish',
    outputUpdateId: h.completion.outputUpdateId, stageUpdateId: h.completion.stageUpdateId } })).rejects.toThrow(/scope|observation/i);
  const scopeObservation = await h.adapters.readIssue();
  scopeObservation.issue.labels = ['Rejected'];
  await expect(h.act('team-event', { event: { eventId: 'unsafe-finish', type: 'finish', scopeObservation,
    outputUpdateId: h.completion.outputUpdateId, stageUpdateId: h.completion.stageUpdateId } })).rejects.toThrow(/scope/i);
  expect((await h.store.list())[0].lease.owner).toBe('coordinator');
});
