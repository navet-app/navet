import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createTeamCheckpointReader } from './agent-team-checkpoint.mjs';
import { directorySeed } from './test-fixtures/directory-seed.mjs';

const directories = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });
// Keep: every reader scenario retains its own actual Git repository.
const repositorySeed = directorySeed(async (worktree) => {
  const git = (...args) => execFileSync('git', args, { cwd: worktree, encoding: 'utf8',
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } }).trim();
  git('init', '-q', '-b', 'feature/team'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.com');
  git('config', 'commit.gpgSign', 'false'); git('config', 'core.hooksPath', '/dev/null');
  await writeFile(path.join(worktree, 'tracked.txt'), 'original\n'); git('add', '.'); git('commit', '-qm', 'fixture');
});
async function setup() {
  const worktree = await mkdtemp(path.join(tmpdir(), 'navet-team-checkpoint-')); directories.push(worktree);
  await repositorySeed(worktree);
  const git = (...args) => execFileSync('git', args, { cwd: worktree, encoding: 'utf8',
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } }).trim();
  let time = Date.now(); const now = () => time; const tick = () => ++time;
  const identity = { taskId: 'task', intentId: 'intent', workerId: 'worker', runId: 'turn' };
  const task = { id: 'task', state: 'investigating', head: git('rev-parse', 'HEAD'),
    lease: { owner: 'coordinator', expiresAt: time + 60_000 },
    context: { worktree, branch: 'feature/team', nextAction: 'Review saved specialist work' },
    team: { workers: [{ intentId: 'intent', workerId: 'worker', status: 'running' }] } };
  let mutations = 0; const calls = [];
  const store = { list: async () => [task], mutate: () => { mutations++; throw new Error('Reader may not mutate'); } };
  const readWorker = async (requested) => { calls.push(requested); return { ...identity, status: 'stopped', reference: 'runtime:stopped', observedAt: tick() }; };
  const options = { store, owner: 'coordinator', readWorker, now };
  return { worktree, git, now, tick, identity, task, options, calls, mutations: () => mutations, read: createTeamCheckpointReader(options) };
}
it.each(['stopped', 'completed'])('captures actual Git fenced by two fresh exact %s observations without store mutations', async (status) => {
  const h = await setup();
  const read = createTeamCheckpointReader({ ...h.options, readWorker: async (identity) => {
    h.calls.push(identity); return { ...identity, status, reference: `runtime:${status}`, observedAt: h.tick() };
  } });
  const taskBefore = structuredClone(h.task);
  const result = await read(h.identity);
  expect(result).toMatchObject({ status: 'verified', ...h.identity, ...h.task.context, head: h.task.head });
  expect(result.stateHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(result.reference).toMatch(/^git-team-checkpoint:sha256:[a-f0-9]{64}$/);
  expect(h.calls).toEqual([h.identity, h.identity]); expect(h.mutations()).toBe(0); expect(h.task).toEqual(taskBefore);
});
it.each(['unstaged', 'staged', 'untracked', 'deleted', 'committed'])('captures %s specialist work and distinguishes recovery state at the same head', async (kind) => {
  const h = await setup(); const before = await h.read(h.identity);
  if (kind === 'deleted') await rm(path.join(h.worktree, 'tracked.txt'));
  else await writeFile(path.join(h.worktree, kind === 'untracked' ? 'new.txt' : 'tracked.txt'), 'private unfinished work\n');
  if (kind === 'staged' || kind === 'committed') h.git('add', '.');
  if (kind === 'committed') h.git('commit', '-qm', 'specialist result');
  const result = await h.read(h.identity);
  expect(result.status).toBe('verified'); expect(result.stateHash).not.toBe(before.stateHash);
  expect(result.head).toBe(h.git('rev-parse', 'HEAD'));
  expect(result.head === before.head).toBe(kind !== 'committed');
  expect(JSON.stringify(result)).not.toContain('private unfinished work'); expect(h.mutations()).toBe(0);
});
it.each(['taskId', 'intentId', 'workerId', 'runId', 'status', 'reference', 'stale', 'future'])('rejects runtime %s mismatches', async (kind) => {
  const h = await setup();
  const read = createTeamCheckpointReader({ ...h.options, readWorker: async () => {
    const value = { ...h.identity, status: 'stopped', reference: 'runtime', observedAt: h.tick() };
    if (['taskId', 'intentId', 'workerId', 'runId'].includes(kind)) value[kind] = 'foreign';
    if (kind === 'status') value.status = 'running'; if (kind === 'reference') value.reference = '';
    if (kind === 'stale') value.observedAt = h.now() - 100; if (kind === 'future') value.observedAt = h.now() + 1;
    return value;
  } });
  expect(await read(h.identity)).toEqual({ status: 'unavailable' });
});
it.each(['owner', 'lease', 'worker', 'run', 'branch', 'action', 'terminal'])('rejects saved %s mismatches', async (kind) => {
  const h = await setup();
  if (kind === 'owner') h.task.lease.owner = 'foreign'; if (kind === 'lease') h.task.lease.expiresAt = h.now();
  if (kind === 'worker') h.task.team.workers[0].workerId = 'foreign';
  if (kind === 'run') h.task.team.workers[0].stop = { runId: 'other-turn' };
  if (kind === 'branch') h.task.context.branch = 'other-branch'; if (kind === 'action') h.task.context.nextAction = '';
  if (kind === 'terminal') h.task.state = 'delivered';
  expect(await h.read(h.identity)).toEqual({ status: 'unavailable' });
});
it('rejects a successor runtime run or changed status at the final fence', async () => {
  const h = await setup();
  for (const change of [{ runId: 'successor' }, { status: 'completed' }]) {
    let reads = 0;
    const read = createTeamCheckpointReader({ ...h.options, readWorker: async () => ({ ...h.identity, status: 'stopped',
      reference: 'runtime', observedAt: h.tick(), ...(++reads === 2 ? change : {}) }) });
    expect(await read(h.identity)).toEqual({ status: 'unavailable' }); expect(reads).toBe(2);
  }
});
it('rejects recovery context or worker changes during Git capture', async () => {
  const h = await setup(); let reads = 0;
  const read = createTeamCheckpointReader({ ...h.options, store: { list: async () => {
    if (++reads === 2) h.task.context.nextAction = 'Different recovery'; return [h.task];
  } } });
  expect(await read(h.identity)).toEqual({ status: 'unavailable' }); expect(reads).toBe(2);
});
it('pins caller identity across asynchronous reads', async () => {
  const h = await setup(); const original = structuredClone(h.identity);
  const read = createTeamCheckpointReader({ ...h.options, readWorker: async (identity) => {
    h.calls.push(identity); return { ...identity, status: 'stopped', reference: 'runtime', observedAt: h.tick() };
  } });
  const pending = read(h.identity); h.identity.runId = 'another-caller-mutation';
  expect(await pending).toMatchObject({ status: 'verified', runId: original.runId });
});
it('bounds stalled store/runtime reads and rejects cancellation while preserving dirty work', async () => {
  const h = await setup(); await writeFile(path.join(h.worktree, 'tracked.txt'), 'saved dirty work');
  const before = await h.read(h.identity);
  for (const source of ['store', 'runtime']) {
    const read = createTeamCheckpointReader({ ...h.options, maxReadMs: 20,
      ...(source === 'store' ? { store: { list: async () => new Promise(() => {}) } } : { readWorker: async () => new Promise(() => {}) }) });
    expect(await read(h.identity)).toEqual({ status: 'unavailable' });
  }
  const controller = new AbortController(); controller.abort();
  expect(await h.read(h.identity, { signal: controller.signal })).toEqual({ status: 'unavailable' });
  const during = new AbortController();
  const cancelRead = createTeamCheckpointReader({ ...h.options, readWorker: async (identity) => {
    during.abort(); return { ...identity, status: 'stopped', reference: 'runtime', observedAt: h.tick() };
  } });
  expect(await cancelRead(h.identity, { signal: during.signal })).toEqual({ status: 'unavailable' });
  expect((await h.read(h.identity)).stateHash).toBe(before.stateHash); expect(h.mutations()).toBe(0);
});
