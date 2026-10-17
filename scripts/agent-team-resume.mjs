import { createTeamOperation } from './agent-team-operation.mjs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { validatePlanningRequestObservation, planningRequestMatchesTask } from './agent-planning-intake.mjs';
import { validateProposalRequestObservation, proposalRequestMatchesTask } from './agent-proposal-scope.mjs';

const boundStatuses = new Set(['running', 'completed', 'stopped', 'failed']);
const text = (value) => typeof value === 'string' && value.trim() && value.length <= 8192;
export const teamResumeId = (intentId, questionId, answerReference) => 'resume:' + createHash('sha256')
  .update(JSON.stringify({ intentId, questionId, answerReference })).digest('hex');

// A verified answer continues a known specialist from its retained checkpoint. Durable
// attempts reconcile by resume identity; observation loss never creates a replacement.
export async function resumeTeamWorker({ store, owner, taskId, intentId, questionId, adapters,
  resourceToken, now = Date.now, maxRunMs = 30_000, signal }) {
  if (!store || !text(owner) || !text(taskId) || !text(intentId) || !text(questionId) ||
      ['readIssue', 'readRequest', 'readWorker', 'resumeWorker', 'findResume'].some((key) => typeof adapters?.[key] !== 'function') ||
      !Number.isSafeInteger(maxRunMs) || maxRunMs < 1 || maxRunMs > 60_000) throw new Error('Team resume configuration unavailable.');
  const operation = createTeamOperation({ now, maxRunMs, signal });
  const { clock, remote } = operation;
  const fresh = (value, after) => text(value?.reference) && Number.isSafeInteger(value.observedAt) &&
    value.observedAt >= after && value.observedAt <= clock();
  const current = async () => {
    const task = (await remote(() => store.list())).find((item) => item.id === taskId); clock();
    const worker = task?.team?.workers.find((item) => item.intentId === intentId && item.planRevision === task.team.plan?.revision);
    const question = task?.team?.questions.find((item) => item.questionId === questionId);
    if (!task || task.lease?.owner !== owner || task.lease.expiresAt <= clock() ||
        ['delivered', 'terminal-failure'].includes(task.state) || !worker?.workerId ||
        !question?.answer || !text(question.answer.reference) || task.team.questions.some((item) => !item.answer)) {
      throw new Error('Owned answered specialist required.');
    }
    return { task, worker, question };
  };
  const event = async (input, authority) => {
    clock(); return store.mutate(taskId, 'team-event', { owner, event: input, authority, resourceToken });
  };
  try {
    let { task, worker, question } = await current();
    const resumeId = teamResumeId(intentId, questionId, question.answer.reference);
    const identity = { taskId, intentId, workerId: worker.workerId, resumeId };
    let resume = worker.resumes?.find((item) => item.resumeId === resumeId);
    if (resume?.status === 'running') {
      const after = clock();
      const observed = await remote(() => adapters.readWorker(identity, { signal: operation.signal }));
      if (!fresh(observed, after) || !boundStatuses.has(observed.status) || observed.runId !== resume.runId ||
          Object.entries(identity).some(([key, value]) => observed[key] !== value)) return { status: 'pending', reason: 'team-resume-incarnation-unverified' };
      return { status: 'resumed', taskId, intentId, workerId: worker.workerId, runId: resume.runId };
    }
    const bind = async (runId) => {
      const after = clock();
      const observation = await remote(() => adapters.readWorker(identity, { signal: operation.signal }));
      if (!fresh(observation, after) || !boundStatuses.has(observation.status) ||
          Object.entries(identity).some(([key, value]) => observation[key] !== value) || !text(observation.runId) ||
          observation.runId === resume.previousRunId || (runId && observation.runId !== runId)) throw new Error('Resumed incarnation unverified.');
      await event({ eventId: `resume-bind:${resumeId}`, type: 'worker-resume-bind', intentId, resumeId, observation });
      return { status: 'resumed', taskId, intentId, workerId: worker.workerId, runId: observation.runId };
    };
    if (resume?.attemptedAt) {
      const after = clock();
      const found = await remote(() => adapters.findResume(identity, { signal: operation.signal }));
      if (!fresh(found, after) || found.status !== 'found' || !text(found.runId) ||
          Object.entries(identity).some(([key, value]) => found[key] !== value)) return { status: 'pending', reason: 'team-resume-reconciliation-required' };
      return await bind(found.runId);
    }
    if (worker.status !== 'stopped' || worker.stop?.status !== 'stopped' || worker.stop.reason !== 'awaiting-input' || !worker.stop.questionIds?.includes(questionId) ||
        !Number.isSafeInteger(worker.stop.intentAt) || question.answer.observedAt < worker.stop.intentAt ||
        !worker.checkpoint?.reference || worker.checkpoint.head !== task.head) {
      return { status: 'blocked', reason: 'team-resume-checkpoint-required' };
    }
    const binding = task.proposal?.binding ?? task.planning?.binding;
    const scopeStarted = clock();
    const scope = await remote(() => adapters.readIssue(binding.issueId, { signal: operation.signal }));
    if (!fresh(scope, scopeStarted)) throw new Error('Resume scope unverified.');
    await store.mutate(taskId, task.proposal ? 'proposal-observation' : 'planning-observation', { owner, observation: scope });
    const requestStarted = clock(); const requestIdentity = { source: task.source, requestId: task.requestId };
    const requestObservation = await remote(() => adapters.readRequest(requestIdentity, { signal: operation.signal }));
    if (requestObservation?.status === 'withdrawn') await store.mutate(taskId, 'request-revocation', { owner,
      observation: { ...requestIdentity, status: 'withdrawn', reference: task.authority.reference, observedAt: clock() } });
    const validate = task.proposal ? validateProposalRequestObservation : validatePlanningRequestObservation;
    const match = task.proposal ? proposalRequestMatchesTask : planningRequestMatchesTask;
    const request = validate(requestObservation, requestIdentity, requestStarted, clock());
    if (!match(task, request)) throw new Error('Resume accepted scope changed.');
    const stoppedStarted = clock();
    const stopped = await remote(() => adapters.readWorker({ taskId, intentId, workerId: worker.workerId }, { signal: operation.signal }));
    if (!fresh(stopped, stoppedStarted) || stopped.status !== 'stopped' || stopped.taskId !== taskId ||
        stopped.intentId !== intentId || stopped.workerId !== worker.workerId || !text(stopped.runId) ||
        stopped.runId !== worker.observation?.runId) throw new Error('Stopped incarnation changed.');
    if (task.context) {
      if (typeof adapters.readCheckpoint !== 'function') throw new Error('Fresh Git checkpoint reader required.');
      const checkpointStarted = clock();
      const captured = await remote(() => adapters.readCheckpoint({ taskId, intentId, workerId: worker.workerId,
        runId: stopped.runId }, { signal: operation.signal }));
      const immutable = ['taskId', 'intentId', 'workerId', 'runId', 'reference', 'head', 'stateHash', 'branch', 'worktree', 'nextAction'];
      if (!fresh(captured, checkpointStarted) || captured.status !== 'verified' ||
          immutable.some((key) => captured[key] !== worker.checkpoint[key])) throw new Error('Git checkpoint changed before resume.');
      // Preserve the original receipt; a new observation verifies it without rewriting
      // checkpoint identity or renewing its capture timestamp.
      stopped.checkpoint = structuredClone(worker.checkpoint);
    } else if (!isDeepStrictEqual(stopped.checkpoint, worker.checkpoint)) throw new Error('Stopped checkpoint changed.');
    const latest = await current();
    if (latest.task.head !== task.head || latest.task.revision !== task.revision ||
        latest.worker.workerId !== worker.workerId || !isDeepStrictEqual(latest.worker.checkpoint, worker.checkpoint) ||
        latest.question.answer.reference !== question.answer.reference) throw new Error('Resume snapshot changed.');
    if (!resume) await event({ eventId: `resume-intent:${resumeId}`, type: 'worker-resume-intent', intentId, resumeId,
      questionId, answerReference: question.answer.reference, worker: stopped }, request.authority);
    const attempt = await event({ eventId: `resume-attempt:${resumeId}`, type: 'worker-resume-attempt', intentId, resumeId }, request.authority);
    if (attempt.teamDecision?.action !== 'send') return { status: 'pending', reason: 'team-resume-reconciliation-required' };
    resume = attempt.team.workers.find((item) => item.intentId === intentId).resumes.find((item) => item.resumeId === resumeId);
    clock();
    await remote(() => adapters.resumeWorker({ ...identity, previousRunId: stopped.runId,
      checkpoint: structuredClone(worker.checkpoint), answer: structuredClone(question.answer),
      revision: task.revision, head: task.head, brief: structuredClone(task.brief) }, { signal: operation.signal }));
    return await bind();
  } catch { return { status: 'pending', reason: 'team-resume-unverified' }; }
  finally { operation.close(); }
}
