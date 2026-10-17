import { createTeamOperation } from './agent-team-operation.mjs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { observeCodexUsage } from './agent-codex-usage.mjs';

const text = (value) => typeof value === 'string' && value.trim() && value.length <= 4096;
const unitPolicy = 'native-observed-operations-v1';
const terminal = new Set(['completed', 'failed', 'missing', 'stopped']);

// This boundary observes dedicated native sessions. Its installed inventory adapter must
// authenticate whole-task membership and the already accepted operation-unit policy.
// It neither estimates billing nor increases any resource limit.
export async function runTeamAccounting({ store, owner, taskId, adapters, now = Date.now,
  maxRunMs = 30_000, signal }) {
  if (!store || typeof store.list !== 'function' || typeof store.mutate !== 'function' ||
      !text(owner) || !text(taskId) || typeof adapters?.readTeamInventory !== 'function' ||
      typeof now !== 'function' || !Number.isSafeInteger(maxRunMs) || maxRunMs < 1 || maxRunMs > 60_000) {
    throw new Error('Team accounting configuration unavailable.');
  }
  const operation = createTeamOperation({ now, maxRunMs, signal });
  const { clock, remote: bounded } = operation;
  let receipt;
  const current = async () => {
    const task = (await bounded(() => store.list())).find((item) => item.id === taskId);
    if (!task?.team?.plan || !task.resources || task.lease?.owner !== owner || task.lease.expiresAt <= clock()) {
      throw new Error('Owned bounded team required.');
    }
    if (task.team.workers.some((worker) => worker.attemptedAt && !worker.workerId)) throw new Error('Uncertain workers require reconciliation before accounting.');
    return task;
  };
  try {
    const task = await current();
    const inventory = async () => {
      const readStartedAt = clock();
      const value = await bounded(() => adapters.readTeamInventory({ taskId, revision: task.revision,
        planRevision: task.team.plan.revision, owner }, { signal: operation.signal }));
      if (value?.status !== 'verified' || value.complete !== true || value.taskId !== taskId ||
          value.revision !== task.revision || value.planRevision !== task.team.plan.revision ||
          !text(value.reference) || !Number.isSafeInteger(value.observedAt) || value.observedAt < readStartedAt ||
          value.observedAt > clock() || value.policy?.status !== 'accepted' || value.policy.unit !== unitPolicy ||
          value.policy.taskRevision !== task.revision || !text(value.policy.reference) ||
          !['active', 'stopped'].includes(value.phase) || !Array.isArray(value.members) ||
          value.members.length < 1) throw new Error('Complete authenticated team inventory required.');
      const members = value.members.map((member) => {
        if (!['coordinator', 'worker'].includes(member.role) || !['running', 'stopped'].includes(member.status) ||
            member.dedicated !== true || !text(member.threadId) || !text(member.runId) ||
            !text(member.sessionFile) || !path.isAbsolute(member.sessionFile)) throw new Error('Dedicated native session required.');
        if (member.role === 'worker' && (!text(member.workerId) || !text(member.intentId))) throw new Error('Exact team worker identity required.');
        return { role: member.role, threadId: member.threadId, runId: member.runId, status: member.status,
          sessionFile: path.resolve(member.sessionFile), ...(member.role === 'worker' ? { workerId: member.workerId, intentId: member.intentId } : {}) };
      }).sort((a, b) => a.threadId.localeCompare(b.threadId));
      const coordinators = members.filter((member) => member.role === 'coordinator');
      const workers = members.filter((member) => member.role === 'worker');
      const bound = task.team.workers.filter((worker) => worker.workerId);
      if (new Set(members.map((member) => member.threadId)).size !== members.length ||
          !coordinators.some((member) => member.threadId === owner) ||
          (value.phase === 'active' ? coordinators.filter((member) => member.status === 'running').length !== 1 ||
            !coordinators.some((member) => member.threadId === owner && member.status === 'running') : members.some((member) => member.status !== 'stopped')) ||
          workers.length !== bound.length || bound.some((worker) => !workers.some((member) =>
            member.intentId === worker.intentId && member.workerId === worker.workerId &&
            (!worker.observation?.runId || member.runId === worker.observation.runId) &&
            (terminal.has(worker.status) ? member.status === 'stopped' : true)))) throw new Error('Exact complete coordinator and specialist coverage required.');
      return { phase: value.phase, policyReference: value.policy.reference, members };
    };
    const first = await inventory();
    const measurements = [];
    for (const member of first.members) {
      const usage = await bounded(() => observeCodexUsage({ sessionFile: member.sessionFile, threadId: member.threadId },
        { now: clock(), signal: operation.signal }));
      if (usage.source.ignoredPartialTail || usage.nativeTurn?.runId !== member.runId ||
          usage.source.line <= usage.nativeTurn.startLine || usage.source.observedAt < usage.nativeTurn.startedAt ||
          (member.status === 'running' && (usage.nativeTurn.status !== 'running' || usage.source.observedAt < clock() - 60_000)) ||
          (member.status === 'stopped' && !['completed', 'interrupted'].includes(usage.nativeTurn.status))) {
        throw new Error('Native current-turn team coverage unavailable.');
      }
      measurements.push({ ...member, modelTokens: usage.modelTokens, toolCalls: usage.observedOperationUnits,
        measurementAt: usage.source.observedAt, nativeStatus: usage.nativeTurn.status, nativeObservedAt: usage.nativeTurn.observedAt });
    }
    if (!isDeepStrictEqual(first, await inventory())) throw new Error('Team inventory changed during metering.');
    const latest = await current();
    if (!isDeepStrictEqual(task.team, latest.team) || task.revision !== latest.revision ||
        !isDeepStrictEqual(task.resources, latest.resources)) throw new Error('Team changed during metering.');
    const previous = task.resources.accounting;
    if (previous && (previous.policyReference !== first.policyReference || previous.members.some((old) => {
      const next = measurements.find((member) => member.threadId === old.threadId);
      return !next || next.role !== old.role || next.sessionFile !== old.sessionFile ||
        next.intentId !== old.intentId || next.workerId !== old.workerId || next.modelTokens < old.modelTokens ||
        next.toolCalls < old.toolCalls || next.measurementAt < old.measurementAt;
    }))) throw new Error('Team accounting cannot drop participants or regress counters.');
    const active = measurements.filter((member) => member.status === 'running');
    if (active.some((member) => member.measurementAt < clock() - 60_000)) throw new Error('Active team measurements aged.');
    const observedAt = active.length ? Math.min(...active.map((member) => member.measurementAt)) : clock();
    const modelTokens = measurements.reduce((total, member) => total + member.modelTokens, 0);
    const toolCalls = measurements.reduce((total, member) => total + member.toolCalls, 0);
    if (![modelTokens, toolCalls].every((value) => Number.isSafeInteger(value) && value >= 0)) throw new Error('Team usage overflow.');
    const reference = 'team-native-usage:sha256:' + createHash('sha256').update(JSON.stringify({ taskId, revision: task.revision, ...first, measurements })).digest('hex');
    const settledReservations = teamAccountingSettlements(task, measurements, owner, observedAt);
    const usage = { modelTokens, toolCalls, reference, observedAt };
    const accounting = { taskId, revision: task.revision, planRevision: task.team.plan.revision, complete: true,
      phase: first.phase, unitPolicy, policyReference: first.policyReference, members: measurements, reference, observedAt: active.length ? clock() : observedAt };
    clock();
    const saved = await store.mutate(taskId, 'team-accounting', { owner, accounting, usage, settledReservations });
    receipt = saved.resources.accounting;
    clock();
    if (active.some((member) => member.measurementAt < clock() - 60_000)) throw new Error('Team measurements aged during acknowledgement.');
    return { status: 'verified', complete: true, ...usage, verifiedAt: clock(), settledReservations };
  } catch {
    // A durable local mutation must be acknowledged even when cancellation ends
    // the remote read. The store's mutex is bounded; abandoning its Promise could
    // leave an unknown commit racing the next operation under the same owner.
    let invalidation = 'unverified';
    try {
      const task = (await store.list()).find((item) => item.id === taskId);
      const observedAt = now();
      if (task?.resources && task.lease?.owner === owner && task.lease.expiresAt > observedAt &&
          Number.isSafeInteger(observedAt) && observedAt > 0) {
        await store.mutate(taskId, 'resource-unavailable', { owner, observation: {
          reference: 'team-native-usage-unverified', observedAt,
        } });
        invalidation = 'persisted';
      }
    } catch { /* The result explicitly reports failure to persist the stop boundary. */ }
    return { status: 'pending', complete: false, reason: 'team-native-usage-unverified', invalidation,
      ...(receipt ? { accountingReference: receipt.reference } : {}) };
  } finally { operation.close(); }
}

export function teamAccountingSettlements(task, members, owner, observedAt) {
  return task.resources.reservations.filter((reservation) => {
      if (reservation.settledAt || reservation.reservedAt > observedAt) return false;
      const worker = task.team.workers.find((item) => reservation.operation === `team-worker:${item.intentId}` ||
        item.resumes?.some((resume) => reservation.operation === `team-resume:${resume.resumeId}`));
      const member = worker && members.find((item) => item.role === 'worker' && item.intentId === worker.intentId && item.workerId === worker.workerId);
      const resume = worker?.resumes?.find((item) => reservation.operation === `team-resume:${item.resumeId}`);
      if (member) return (!resume || (resume.status === 'running' && resume.runId === member.runId)) && terminal.has(worker.status) && member.status === 'stopped' &&
        worker.observation?.observedAt >= reservation.reservedAt && member.measurementAt >= reservation.reservedAt &&
        member.nativeObservedAt >= reservation.reservedAt;
      const update = task.team.updates?.find((item) => reservation.operation === `team-ticket:${item.updateId}`);
      return update?.status === 'verified' && update.observation?.observedAt >= reservation.reservedAt &&
        members.some((item) => item.role === 'coordinator' && item.threadId === owner && item.measurementAt >= update.observation.observedAt);
  }).map((reservation) => reservation.token);
}

// Store boundary: validate the whole accounting/usage/settlement transaction before
// mutating either ledger. A later reducer rejection must leave all three unchanged.
export function validateTeamAccounting(task, input, now) {
  const { accounting, usage, settledReservations } = input;
  const members = accounting?.members;
  const fresh = (value) => Number.isSafeInteger(value) && value > 0 && value <= now && value >= now - 60_000;
  if (!task.team?.plan || !task.resources || !fresh(accounting?.observedAt) ||
      accounting.taskId !== task.id || accounting.revision !== task.revision ||
      accounting.planRevision !== task.team.plan.revision || accounting.complete !== true ||
      accounting.unitPolicy !== unitPolicy || !text(accounting.policyReference) || !text(accounting.reference) ||
      !['active', 'stopped'].includes(accounting.phase) || !Array.isArray(members) || members.length < 1 ||
      task.team.workers.some((worker) => worker.attemptedAt && !worker.workerId)) throw new Error('Exact complete team accounting required.');
  for (const member of members) {
    if (!['coordinator', 'worker'].includes(member.role) || !['running', 'stopped'].includes(member.status) ||
        !text(member.threadId) || !text(member.runId) || !text(member.sessionFile) || !path.isAbsolute(member.sessionFile) ||
        !['modelTokens', 'toolCalls'].every((key) => Number.isSafeInteger(member[key]) && member[key] >= 0) ||
        !Number.isSafeInteger(member.measurementAt) || member.measurementAt <= 0 || member.measurementAt > now ||
        !Number.isSafeInteger(member.nativeObservedAt) || member.nativeObservedAt <= 0 || member.nativeObservedAt > now ||
        (member.status === 'running' ? member.nativeStatus !== 'running' || !fresh(member.measurementAt)
          : !['completed', 'interrupted'].includes(member.nativeStatus)) ||
        (member.role === 'worker' && (!text(member.workerId) || !text(member.intentId)))) throw new Error('Invalid native team member.');
  }
  const coordinators = members.filter((member) => member.role === 'coordinator');
  const workers = members.filter((member) => member.role === 'worker');
  const bound = task.team.workers.filter((worker) => worker.workerId);
  if (new Set(members.map((member) => member.threadId)).size !== members.length ||
      !coordinators.some((member) => member.threadId === input.owner) ||
      (accounting.phase === 'active' ? coordinators.filter((member) => member.status === 'running').length !== 1 ||
        !coordinators.some((member) => member.threadId === input.owner && member.status === 'running') : members.some((member) => member.status !== 'stopped')) ||
      workers.length !== bound.length || bound.some((worker) => !workers.some((member) =>
        member.intentId === worker.intentId && member.workerId === worker.workerId &&
        (!worker.observation?.runId || member.runId === worker.observation.runId) &&
        (terminal.has(worker.status) ? member.status === 'stopped' : true)))) throw new Error('Exact coordinator and specialist coverage required.');
  const previous = task.resources.accounting;
  if (previous && (previous.policyReference !== accounting.policyReference || previous.observedAt > accounting.observedAt || previous.members.some((old) => {
    const next = members.find((member) => member.threadId === old.threadId);
    return !next || next.role !== old.role || next.sessionFile !== old.sessionFile || next.intentId !== old.intentId ||
      next.workerId !== old.workerId || next.modelTokens < old.modelTokens || next.toolCalls < old.toolCalls ||
      next.measurementAt < old.measurementAt || (old.nativeObservedAt != null && next.nativeObservedAt < old.nativeObservedAt);
  }))) throw new Error('Team accounting cannot drop participants, change policy or regress counters.');
  const active = members.filter((member) => member.status === 'running');
  if (!fresh(usage?.observedAt) || usage.reference !== accounting.reference ||
      usage.modelTokens !== members.reduce((total, member) => total + member.modelTokens, 0) ||
      usage.toolCalls !== members.reduce((total, member) => total + member.toolCalls, 0) ||
      !['modelTokens', 'toolCalls'].every((key) => Number.isSafeInteger(usage[key]) && usage[key] >= 0) ||
      usage.observedAt !== (active.length ? Math.min(...active.map((member) => member.measurementAt)) : accounting.observedAt) ||
      (task.resources.unavailable && usage.observedAt <= task.resources.unavailable.observedAt) ||
      (task.resources.usage && (usage.modelTokens < task.resources.usage.modelTokens ||
        usage.toolCalls < task.resources.usage.toolCalls || usage.observedAt < task.resources.usage.observedAt))) throw new Error('Fresh monotonic native team usage required.');
  const expected = teamAccountingSettlements(task, members, input.owner, usage.observedAt);
  if (!Array.isArray(settledReservations) || new Set(settledReservations).size !== settledReservations.length ||
      settledReservations.some((token) => !expected.includes(token))) throw new Error('Team settlement requires owning terminal operation evidence.');
  return { accounting: structuredClone(accounting), usage: structuredClone(usage), settledReservations: [...settledReservations] };
}
