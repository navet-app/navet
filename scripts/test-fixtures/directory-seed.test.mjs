import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { AgentTaskStore } from '../agent-task-store.mjs';
import { directorySeed } from './directory-seed.mjs';

const directories = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });
const git = (directory, ...args) => execFileSync('git', ['-C', directory, ...args], {
  encoding: 'utf8', env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
}).trim();
const now = () => 1_700_000_000_000;
let builds = 0;
const copy = directorySeed(async (directory) => {
  builds++;
  const repository = path.join(directory, 'repository'); await mkdir(repository);
  git(repository, 'init', '-q', '-b', 'feature/fixture');
  git(repository, 'config', 'user.name', 'Fixture');
  git(repository, 'config', 'user.email', 'fixture@example.invalid');
  git(repository, 'config', 'core.hooksPath', '/dev/null');
  git(repository, 'config', 'commit.gpgSign', 'false');
  await writeFile(path.join(repository, 'tracked.txt'), 'original\n');
  git(repository, 'add', '.'); git(repository, 'commit', '-qm', 'fixture');
  const store = new AgentTaskStore(directory, { now });
  const task = await store.enqueue({ source: 'fixture', requestId: 'isolated', mode: 'implement', revision: 'scope',
    authority: { actor: 'human', reference: 'fixture-request', revision: 'scope', observedAt: now() },
    brief: { acceptanceCriteria: ['Preserve fixture isolation'] } });
  await store.mutate(task.id, 'claim', { owner: 'coordinator', durationMs: 60_000 });
  await store.mutate(task.id, 'context', { owner: 'coordinator', context: { worktree: repository, nextAction: 'Review changes' } });
  return { taskId: task.id, repository, head: git(repository, 'rev-parse', 'HEAD'), nested: { values: ['original'] } };
}, { stateFiles: ['tasks.json'] });

// Keep: changes to one scenario must not contaminate another scenario or the seed.
it('isolates real persisted state, Git history/index and mutable metadata between fixture copies', async () => {
  const fresh = async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'navet-seed-isolation-')); directories.push(directory);
    return { directory, metadata: await copy(directory), store: new AgentTaskStore(directory, { now }) };
  };
  const [first, second] = await Promise.all([fresh(), fresh()]);
  first.metadata.nested.values.push('changed');
  await first.store.mutate(first.metadata.taskId, 'context', { owner: 'coordinator', context: { nextAction: 'Changed action' } });
  await writeFile(path.join(first.metadata.repository, 'tracked.txt'), 'changed\n');
  git(first.metadata.repository, 'add', '.'); git(first.metadata.repository, 'commit', '-qm', 'changed');
  const third = await fresh();
  expect(builds).toBe(1);
  expect(git(first.metadata.repository, 'rev-parse', 'HEAD')).not.toBe(first.metadata.head);
  for (const fixture of [second, third]) {
    const task = (await new AgentTaskStore(fixture.directory, { now }).list())[0];
    expect(task.context).toMatchObject({ worktree: fixture.metadata.repository, nextAction: 'Review changes' });
    expect(fixture.metadata.nested.values).toEqual(['original']);
    expect(git(fixture.metadata.repository, 'rev-parse', 'HEAD')).toBe(fixture.metadata.head);
    expect(git(fixture.metadata.repository, 'status', '--porcelain')).toBe('');
    expect(await readFile(path.join(fixture.metadata.repository, 'tracked.txt'), 'utf8')).toBe('original\n');
  }
});
