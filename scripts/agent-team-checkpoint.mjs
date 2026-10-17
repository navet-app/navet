import { createTeamOperation } from './agent-team-operation.mjs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { readGitWorkerSnapshot } from './agent-worker-checkpoint.mjs';

const text = (value) => typeof value === 'string' && value.trim() && value.length <= 4096;
const keys = ['taskId', 'intentId', 'workerId', 'runId'];
const matches = (left, right) => keys.every((key) => left?.[key] === right?.[key]);

// Runtime stop/completion observations fence a stable Git read. The caller saves
// this receipt through the task store; the reader never changes durable state.
export function createTeamCheckpointReader({ store, owner, readWorker, now = Date.now, maxReadMs = 15_000 }) {
  if (!store || typeof store.list !== 'function' || !text(owner) || typeof readWorker !== 'function' ||
      typeof now !== 'function' || !Number.isSafeInteger(maxReadMs) || maxReadMs < 1 || maxReadMs > 60_000) {
    throw new Error('Invalid team checkpoint reader.');
  }
  return async function readCheckpoint(identity, { signal: parentSignal } = {}) {
    const operation = createTeamOperation({ now, maxRunMs: maxReadMs, signal: parentSignal });
    try {
      if (!keys.every((key) => text(identity?.[key]))) throw new Error('Exact team checkpoint identity required.');
      identity = Object.fromEntries(keys.map((key) => [key, identity[key]]));
      const { signal, remainingMs: clock } = operation;
      const remote = async (read) => structuredClone(await operation.remote(read));
      const getTask = async () => {
        const tasks = await remote(() => store.list());
        const task = tasks.find((item) => item.id === identity.taskId);
        const worker = task?.team?.workers?.find((item) => item.intentId === identity.intentId);
        if (!task || task.lease?.owner !== owner || task.lease.expiresAt <= now() ||
            ['delivered', 'terminal-failure'].includes(task.state) || worker?.workerId !== identity.workerId ||
            !['running', 'uncertain', 'stopped', 'completed'].includes(worker.status) ||
            (worker.stop?.runId && worker.stop.runId !== identity.runId) ||
            (worker.observation?.runId && worker.observation.runId !== identity.runId) ||
            !text(task.context?.worktree) || !text(task.context.branch) || !text(task.context.nextAction)) {
          throw new Error('Exact owned team recovery context required.');
        }
        return { context: task.context, worker, lease: task.lease, state: task.state,
          head: task.head, revision: task.revision, planRevision: task.team.plan?.revision };
      };
      const observe = async () => {
        const observedAfter = now();
        const observed = await remote(() => readWorker(structuredClone(identity), { signal }));
        if (!matches(observed, identity) || !['stopped', 'completed'].includes(observed.status) ||
            !text(observed.reference) || !Number.isSafeInteger(observed.observedAt) ||
            observed.observedAt < observedAfter || observed.observedAt > now()) throw new Error('Exact stopped team incarnation required.');
        return observed;
      };
      const task = await getTask();
      const before = await observe();
      const first = await readGitWorkerSnapshot(task.context.worktree, { signal, clock });
      const second = await readGitWorkerSnapshot(task.context.worktree, { signal, clock });
      if (!isDeepStrictEqual(first, second) || first.branch !== task.context.branch) throw new Error('Changed team Git recovery state.');
      const current = await getTask();
      if (!isDeepStrictEqual(current, task)) throw new Error('Team recovery context changed.');
      const after = await observe();
      if (after.status !== before.status || after.observedAt < before.observedAt) throw new Error('Team runtime state changed.');
      clock();
      const checkpoint = { ...identity, ...first, worktree: task.context.worktree, nextAction: task.context.nextAction };
      return { status: 'verified', ...checkpoint,
        reference: 'git-team-checkpoint:sha256:' + createHash('sha256').update(JSON.stringify(checkpoint)).digest('hex'),
        observedAt: now() };
    } catch {
      return { status: 'unavailable' };
    } finally {
      operation.close();
    }
  };
}
