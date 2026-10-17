import { createTeamOperation } from './agent-team-operation.mjs';
import { randomUUID } from 'node:crypto';
import { resourceStatus } from './agent-task-store.mjs';
import { validatePlanningRequestObservation, planningRequestMatchesTask } from './agent-planning-intake.mjs';
import { validateProposalRequestObservation, proposalRequestMatchesTask } from './agent-proposal-scope.mjs';

// Monitor one existing specialist. Observation failures retain its handle; interruption targets
// an exact runtime incarnation and is never a replacement-worker instruction.
export async function monitorTeamWorker({ store, owner, taskId, intentId, adapters, maxStopAttempts,
  now = Date.now, maxRunMs = 30_000, signal }) {
  if (!Number.isSafeInteger(maxStopAttempts) || maxStopAttempts < 1 || maxStopAttempts > 10 ||
      !Number.isSafeInteger(maxRunMs) || maxRunMs < 1 || maxRunMs > 60_000 ||
      ['readWorker', 'interruptWorker', 'readIssue', 'readRequest'].some((key) => typeof adapters?.[key] !== 'function')) {
    return { status: 'blocked', reason: 'team-monitor-policy-unconfigured' };
  }
  const operation = createTeamOperation({ now, maxRunMs, signal });
  const { clock, remote } = operation;
  let stop;
  const current = async () => {
    const task = (await remote(() => store.list())).find((item) => item.id === taskId);
    clock();
    const worker = task?.team?.workers.find((item) => item.intentId === intentId);
    if (!task || task.lease?.owner !== owner || task.lease.expiresAt <= now() || !worker?.workerId || ['delivered', 'terminal-failure'].includes(task.state)) throw new Error('Exact owned specialist required.');
    return { task, worker };
  };
  const event = async (input) => {
    clock(); return store.mutate(taskId, 'team-event', { owner, event: input });
  };
  try {
    let { task, worker } = await current(); stop = worker.stop;
    const identity = { taskId, intentId, workerId: worker.workerId };
    const observe = async () => {
      const observedAfter = clock();
      const observed = await remote(() => adapters.readWorker(identity, { signal: operation.signal }));
      if (observed?.taskId !== taskId || observed.intentId !== intentId || observed.workerId !== identity.workerId ||
          !['running', 'stopped', 'completed', 'failed', 'missing'].includes(observed.status) || !observed.runId || !observed.reference ||
          !Number.isSafeInteger(observed.observedAt) || observed.observedAt < observedAfter || observed.observedAt > clock()) throw new Error('Exact live incarnation unavailable.');
      return observed;
    };
    let observed = await observe();
    if (stop && stop.runId !== observed.runId) throw new Error('Pending stop targets another incarnation.');
    const capture = async () => {
      const latest = await current();
      if (!latest.task.context) return;
      if (typeof adapters.readCheckpoint !== 'function') throw new Error('Team checkpoint reader unavailable.');
      const observedAfter = clock();
      const checkpoint = await remote(() => adapters.readCheckpoint({ ...identity, runId: observed.runId }, { signal: operation.signal }));
      if (checkpoint?.status !== 'verified' || checkpoint.observedAt < observedAfter || checkpoint.observedAt > clock()) throw new Error('Stopped recovery checkpoint unverified.');
      await store.mutate(taskId, 'team-checkpoint', { owner, checkpoint });
      observed.checkpoint = checkpoint;
      observed.stateHash = checkpoint.stateHash;
    };
    const saveStop = async () => {
      if (['stopped', 'completed'].includes(observed.status)) await capture();
      const saved = await event({ eventId: `stop-observed:${intentId}:${observed.reference}:${observed.observedAt}`,
        type: 'worker-stop-observation', intentId, worker: observed });
      const currentWorker = saved.team.workers.find((item) => item.intentId === intentId);
      return { status: currentWorker.stop.status === 'stopped' ? currentWorker.status : 'pending', taskId, intentId };
    };
    const saveNaturalTerminal = async () => {
      if (['stopped', 'completed'].includes(observed.status)) await capture();
      // A naturally stopped run is recovery evidence; completed output still needs
      // exact passing/failing evidence through the store's completion boundary.
      await event({ eventId: `${observed.status}:${intentId}:${observed.reference}:${observed.observedAt}`, type: 'worker-observation', intentId,
        observation: observed, evidence: observed.status === 'completed' ? observed.evidence ?? [] : [] });
      return { status: observed.status, taskId, intentId };
    };
    if (['stopped', 'completed', 'failed', 'missing'].includes(observed.status)) {
      if (stop) return await saveStop();
      return await saveNaturalTerminal();
    }
    let reason = stop?.status !== 'stopped' ? stop?.reason : undefined;
    if (!reason) {
      if (task.team.questions.some((question) => !question.answer)) reason = 'awaiting-input';
      if (task.requestRevocation) reason = 'request-withdrawn';
      const binding = task.proposal?.binding ?? task.planning?.binding;
      const action = task.proposal ? 'proposal-observation' : 'planning-observation';
      let scope;
      try {
        const observedAfter = clock();
        scope = await remote(() => adapters.readIssue(binding.issueId, { signal: operation.signal }));
        if (!Number.isSafeInteger(scope?.observedAt) || scope.observedAt < observedAfter || scope.observedAt > clock()) throw new Error('Scope read stale.');
        const saved = await store.mutate(taskId, action, { owner, observation: scope });
        if ((saved.proposal ?? saved.planning).observation.result !== 'pass') reason ??= 'scope-unverified';
      } catch {
        await store.mutate(taskId, action, { owner, observation: { status: 'unavailable', reference: 'team-monitor-scope-unavailable', observedAt: now() } });
        reason ??= 'scope-unverified';
      }
      try {
        const requestStarted = clock(); const requestIdentity = { source: task.source, requestId: task.requestId };
        const authority = await remote(() => adapters.readRequest(requestIdentity, { signal: operation.signal }));
        if (authority?.status === 'withdrawn') {
          await store.mutate(taskId, 'request-revocation', { owner, observation: { ...requestIdentity, status: 'withdrawn', reference: task.authority.reference, observedAt: clock() } });
          reason = 'request-withdrawn';
        } else {
          const validate = task.proposal ? validateProposalRequestObservation : validatePlanningRequestObservation;
          const match = task.proposal ? proposalRequestMatchesTask : planningRequestMatchesTask;
          if (!match(task, validate(authority, requestIdentity, requestStarted, clock()))) throw new Error('Authority changed.');
        }
      } catch { reason ??= 'request-unverified'; }
      ({ task, worker } = await current());
      const resources = resourceStatus(task, clock());
      if (!resources.bounded || !resources.measurementFresh) reason ??= 'usage-unverified';
      else if (resources.exceeded) reason ??= 'resource-exhausted';
      if (!reason) return { status: 'within-policy', taskId, intentId, runId: observed.runId };
      observed = await observe();
      if (['stopped', 'completed', 'failed', 'missing'].includes(observed.status)) return await saveNaturalTerminal();
      const saved = await event({ eventId: `stop-intent:${intentId}:${observed.runId}`, type: 'worker-stop-intent', intentId,
        worker: observed, reason, maxAttempts: maxStopAttempts, stopToken: randomUUID() });
      stop = saved.team.workers.find((item) => item.intentId === intentId).stop;
    }
    observed = await observe();
    if (observed.runId !== stop.runId) throw new Error('Worker changed before interruption.');
    if (['stopped', 'completed', 'failed', 'missing'].includes(observed.status)) return await saveStop();
    const attempt = await event({ eventId: `stop-attempt:${stop.token}:${stop.attempts}`, type: 'worker-stop-attempt',
      intentId, stopToken: stop.token, worker: observed });
    if (attempt.teamDecision.action === 'send') {
      try { await remote(() => adapters.interruptWorker({ ...identity, runId: stop.runId, stopToken: stop.token }, { signal: operation.signal })); }
      catch { clock(); }
    }
    observed = await observe();
    return await saveStop();
  } catch {
    return { status: 'pending', taskId, intentId, reason: 'team-monitor-unverified', ...(stop ? { stop } : {}) };
  } finally { operation.close(); }
}
