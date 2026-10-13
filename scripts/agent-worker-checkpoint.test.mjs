import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { AgentTaskStore } from './agent-task-store.mjs';
import { createGitWorkerCheckpointService } from './agent-worker-checkpoint.mjs';
import { createCodexWorkerAdapter } from './agent-codex-worker.mjs';
import { directorySeed } from './test-fixtures/directory-seed.mjs';

const directories = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });
// Keep: scenarios capture and verify actual Git and persisted checkpoint state.
const checkpointSeed = directorySeed(async (directory) => {
  const worktree = path.join(directory, 'worktree');
  const { mkdir } = await import('node:fs/promises'); await mkdir(worktree);
  const git = (...args) => execFileSync('git', args, { cwd: worktree, encoding: 'utf8',
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } }).trim();
  git('init', '-q', '-b', 'feature/worker'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.com');
  git('config', 'commit.gpgSign', 'false'); git('config', 'core.hooksPath', '/dev/null');
  await writeFile(path.join(worktree, 'tracked.txt'), 'original\n'); git('add', '.'); git('commit', '-qm', 'fixture');
  let time = Date.now(); const now = () => time; const tick = () => ++time;
  const store = new AgentTaskStore(path.join(directory, 'store'), { now });
  const authority = { actor: 'human', reference: 'trusted-event', revision: 'scope', observedAt: tick() };
  const task = await store.enqueue({ source: 'human-source', requestId: 'request', mode: 'implement', revision: 'scope', authority,
    requiredGates: ['quality'], brief: { acceptanceCriteria: ['Preserve saved work'] } });
  const act = (action, input = {}) => store.mutate(task.id, action, { owner: 'coordinator', ...input });
  await act('claim', { durationMs: 60_000 });
  const dispatched = await act('dispatch-intent', { authority: { ...authority, observedAt: tick() } });
  await act('bind', { token: dispatched.dispatch.token, threadId: 'worker' });
  await act('context', { context: { worktree, branch: 'feature/worker', nextAction: 'Review preserved changes' } });
  return { time, task, authority, dispatched };
}, { stateFiles: ['store/tasks.json'] });

async function setup() {
  const directory = await mkdtemp(path.join(tmpdir(), 'navet-checkpoint-')); directories.push(directory);
  const seed = await checkpointSeed(directory);
  let { time } = seed;
  const { task, dispatched } = seed;
  const worktree = path.join(directory, 'worktree');
  const git = (...args) => execFileSync('git', args, { cwd: worktree, encoding: 'utf8',
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } }).trim();
  const now = () => time; const tick = () => ++time;
  const store = new AgentTaskStore(path.join(directory, 'store'), { now });
  const act = (action, input = {}) => store.mutate(task.id, action, { owner: 'coordinator', ...input });
  const worker = () => ({ taskId: task.id, dispatchToken: dispatched.dispatch.token, threadId: 'worker', runId: 'turn',
    status: 'stopped', reference: 'native-stop-observation', observedAt: tick() });
  const service = createGitWorkerCheckpointService({ store, owner: 'coordinator', now, readWorker: async () => worker() });
  return { directory, worktree, git, store, act, worker, service, now, tick, snapshot: async () => (await store.list())[0] };
}
it('saves a durable checkpoint from actual Git and verifies it after restart without returning local paths or contents', async () => {
  const h = await setup(); await writeFile(path.join(h.worktree, 'tracked.txt'), 'private unfinished changes\n');
  await writeFile(path.join(h.worktree, 'new.txt'), 'private new file\n');
  const result = await h.service.captureCheckpoint(h.worker());
  expect(result.status).toBe('saved'); expect(result.checkpoint.head).toBe(h.git('rev-parse', 'HEAD'));
  expect((await h.snapshot()).workerCheckpoint).toEqual(result.checkpoint);
  expect((await h.snapshot()).head).toBe(result.checkpoint.head);
  const restarted = createGitWorkerCheckpointService({ store: new AgentTaskStore(path.join(h.directory, 'store'), { now: h.now }), owner: 'coordinator', now: h.now });
  const verified = await restarted.readCheckpoint(h.worker());
  expect(verified).toMatchObject({ status: 'verified', head: result.checkpoint.head, nextAction: 'Review preserved changes' });
  expect(JSON.stringify(verified)).not.toContain(h.worktree);
  expect(JSON.stringify(verified)).not.toContain('private');
});
it.each(['unstaged', 'staged', 'untracked'])('invalidates approval after capturing actual %s changes at the same Git head', async (kind) => {
  const h = await setup();
  const original = await h.service.captureCheckpoint(h.worker());
  expect(original.status).toBe('saved');
  await h.act('transition', { state: 'investigating', reason: 'Start.' });
  await h.act('transition', { state: 'verifying', reason: 'Verify commit.' });
  for (const gate of ['quality', 'output']) await h.act('evidence', { evidence: {
    gate, head: original.checkpoint.head, revision: 'scope', result: 'pass',
    artifact: `verified:${gate}`, observedAt: h.tick(),
  } });
  await h.act('transition', { state: 'awaiting-approval', reason: 'Review commit.' });
  await writeFile(path.join(h.worktree, kind === 'untracked' ? 'new.txt' : 'tracked.txt'), 'unfinished follow-up\n');
  if (kind === 'staged') h.git('add', '.');
  const changed = await h.service.captureCheckpoint(h.worker());
  expect(changed.status).toBe('saved');
  expect(changed.checkpoint.head).toBe(original.checkpoint.head);
  expect(changed.checkpoint.stateHash).not.toBe(original.checkpoint.stateHash);
  const restarted = new AgentTaskStore(path.join(h.directory, 'store'), { now: h.now });
  const saved = (await restarted.list())[0];
  expect(saved.state).toBe('verifying');
  expect(saved.evidence.every(item => item.result === 'unverified')).toBe(true);
  await expect(restarted.mutate(saved.id, 'transition', { owner: 'coordinator', state: 'delivered', reason: 'Old commit approved.',
    acceptance: { head: original.checkpoint.head, revision: 'scope', actor: 'human', reference: 'old-commit' },
  })).rejects.toThrow('incomplete');
});

it.each(['unstaged', 'staged', 'untracked', 'deleted', 'branch', 'head', 'next-action', 'run'])('rejects a changed %s recovery snapshot', async (kind) => {
  const h = await setup(); await h.service.captureCheckpoint(h.worker());
  if (kind === 'unstaged' || kind === 'staged') { await writeFile(path.join(h.worktree, 'tracked.txt'), 'changed'); if (kind === 'staged') h.git('add', '.'); }
  if (kind === 'untracked') await writeFile(path.join(h.worktree, 'new.txt'), 'new');
  if (kind === 'deleted') await rm(path.join(h.worktree, 'tracked.txt'));
  if (kind === 'branch') h.git('switch', '-qc', 'other');
  if (kind === 'head') h.git('commit', '--allow-empty', '-qm', 'new head');
  if (kind === 'next-action') await h.act('context', { context: { nextAction: 'Different recovery' } });
  expect(await h.service.readCheckpoint({ ...h.worker(), ...(kind === 'run' ? { runId: 'successor' } : {}) })).toEqual({ status: 'unavailable' });
});
it('detects changes to untracked symlink targets without reading outside the worktree', async () => {
  const h = await setup(); const link = path.join(h.worktree, 'link'); await symlink('/private/nonexistent', link);
  expect((await h.service.captureCheckpoint(h.worker())).status).toBe('saved');
  await rm(link); await symlink('/private/other', link);
  expect(await h.service.readCheckpoint(h.worker())).toEqual({ status: 'unavailable' });
});
it('rejects running and foreign workers without saving a checkpoint', async () => {
  const h = await setup();
  for (const change of [{ status: 'running' }, { threadId: 'foreign' }, { observedAt: h.now() - 60_001 }]) {
    expect(await h.service.captureCheckpoint({ ...h.worker(), ...change })).toEqual({ status: 'unavailable' });
  }
  expect((await h.snapshot()).workerCheckpoint).toBeUndefined();
});
it('rejects hidden tracked changes and excessive file content', async () => {
  const h = await setup(); h.git('update-index', '--assume-unchanged', 'tracked.txt');
  expect(await h.service.captureCheckpoint(h.worker())).toEqual({ status: 'unavailable' });
  h.git('update-index', '--no-assume-unchanged', 'tracked.txt');
  await writeFile(path.join(h.worktree, 'huge'), Buffer.alloc(8_388_609));
  expect(await h.service.captureCheckpoint(h.worker())).toEqual({ status: 'unavailable' });
});
it('preserves a local checkpoint committed during cancellation for later verification', async () => {
  const h = await setup(); const controller = new AbortController();
  const store = { list: () => h.store.list(), mutate: async (...args) => {
    const saved = await h.store.mutate(...args); controller.abort(); return saved;
  } };
  const service = createGitWorkerCheckpointService({ store, owner: 'coordinator', now: h.now, readWorker: async () => h.worker() });
  expect(await service.captureCheckpoint(h.worker(), { signal: controller.signal })).toMatchObject({ status: 'saved' });
  expect(await h.service.readCheckpoint(h.worker())).toMatchObject({ status: 'verified' });
});
it('bounds stalled store reads and rejects cancellation before reading Git', async () => {
  const h = await setup(); const controller = new AbortController(); controller.abort();
  expect(await h.service.captureCheckpoint(h.worker(), { signal: controller.signal })).toEqual({ status: 'unavailable' });
  const service = createGitWorkerCheckpointService({ store: { list: async () => new Promise(() => {}), mutate: () => h.act('context') }, owner: 'coordinator', maxReadMs: 20 });
  expect(await service.readCheckpoint(h.worker())).toEqual({ status: 'unavailable' });
});
it.each(['idle', 'notLoaded'])('connects a native %s stopped observation to captured Git recovery and the runtime checkpoint reader', async (runtimeStatus) => {
  const h = await setup(); const identity = h.worker();
  const adapter = createCodexWorkerAdapter({ binding: identity, now: h.now, readCheckpoint: h.service.readCheckpoint,
    request: async (method) => { h.tick(); return method === 'thread/read'
      ? { thread: { id: identity.threadId, status: { type: runtimeStatus } } }
      : { data: [{ id: identity.runId, status: 'interrupted', items: [], itemsView: 'notLoaded' }] }; } });
  const stopped = await adapter.readWorker(identity);
  expect(stopped).not.toHaveProperty('checkpoint');
  const recorder = createGitWorkerCheckpointService({ store: h.store, owner: 'coordinator', now: h.now, readWorker: adapter.readWorker });
  expect(await recorder.captureCheckpoint(stopped)).toMatchObject({ status: 'saved' });
  expect(await adapter.readWorker(identity)).toMatchObject({ status: 'stopped', checkpoint: {
    head: h.git('rev-parse', 'HEAD'), nextAction: 'Review preserved changes' } });
});
it('pins checkpoint identity before asynchronous reads and refuses foreign ownership', async () => {
  const h = await setup(); const worker = h.worker();
  const result = h.service.captureCheckpoint(worker); worker.runId = 'other'; worker.status = 'running'; await result;
  expect((await h.snapshot()).workerCheckpoint.runId).toBe('turn');
  const foreign = createGitWorkerCheckpointService({ store: h.store, owner: 'other', now: h.now });
  expect(await foreign.readCheckpoint(h.worker())).toEqual({ status: 'unavailable' });
});
it('does not execute worktree clean filters while reading recovery state', async () => {
  const h = await setup(); const marker = path.join(h.directory, 'filter-executed');
  await writeFile(path.join(h.worktree, '.gitattributes'), '*.txt filter=unexpected\n');
  h.git('config', 'filter.unexpected.clean', `touch '${marker}'`);
  expect(await h.service.captureCheckpoint(h.worker())).toMatchObject({ status: 'saved' });
  const { access } = await import('node:fs/promises');
  await expect(access(marker)).rejects.toMatchObject({ code: 'ENOENT' });
});

it.each(['running', 'successor', 'stale', 'unavailable'])('does not mutate recovery state when the stopped run becomes %s during Git capture', async (change) => {
  const h = await setup();
  const prior = await h.service.captureCheckpoint(h.worker());
  const before = await h.snapshot();
  h.git('commit', '--allow-empty', '-qm', 'successor work');
  let reads = 0;
  const service = createGitWorkerCheckpointService({ store: h.store, owner: 'coordinator', now: h.now,
    readWorker: async () => {
      const current = h.worker();
      if (++reads === 1) return current;
      if (change === 'unavailable') throw new Error('runtime unavailable');
      return { ...current, ...(change === 'running' ? {status: 'running'} : change === 'successor' ? {runId: 'successor'} : {observedAt: h.now() - 2}) };
    } });
  expect(await service.captureCheckpoint(h.worker())).toEqual({status: 'unavailable'});
  expect(reads).toBe(2);
  const after = await h.snapshot();
  expect(after.head).toBe(before.head);
  expect(after.workerCheckpoint).toEqual(prior.checkpoint);
});
it('refuses checkpoint capture without a trusted runtime reader', async () => {
  const h = await setup();
  const service = createGitWorkerCheckpointService({store: h.store, owner: 'coordinator', now: h.now});
  expect(await service.captureCheckpoint(h.worker())).toEqual({status: 'unavailable'});
  expect((await h.snapshot()).workerCheckpoint).toBeUndefined();
});
it('bounds an unavailable fresh runtime observation without committing a checkpoint', async () => {
  const h = await setup();
  const service = createGitWorkerCheckpointService({store: h.store, owner: 'coordinator', now: h.now, maxReadMs: 20,
    readWorker: async () => new Promise(() => {})});
  expect(await service.captureCheckpoint(h.worker())).toEqual({status: 'unavailable'});
  expect((await h.snapshot()).workerCheckpoint).toBeUndefined();
});
