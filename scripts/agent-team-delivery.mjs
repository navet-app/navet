import { createTeamOperation } from './agent-team-operation.mjs';
import { isDeepStrictEqual } from 'node:util';
import { teamPlanComplete } from './agent-team-state.mjs';
import { runTeamTicketUpdate } from './agent-team-conversation.mjs';
import { linearResultBodyHash } from './agent-linear-result-reader.mjs';

const text = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 8192;
const url = (value) => text(value) && /^https:\/\/[^\s]+$/.test(value);
const entries = (value) => Array.isArray(value) && value.length > 0 && value.length <= 128 && value.every(text);
const bindingOf = (task) => task.proposal?.binding ?? task.planning?.binding;
const identityOf = (task) => ({ taskId: task.id, issueId: bindingOf(task)?.issueId, scopeRevision: bindingOf(task)?.revision,
  planRevision: task.team?.plan?.revision, head: task.head, revision: task.revision, phase: task.team?.plan?.phase });
const exact = (observation, identity) => Object.entries(identity).every(([key, value]) => observation?.[key] === value);
const fresh = (observation, startedAt, now) => observation?.status === 'available' && text(observation.reference) &&
  Number.isSafeInteger(observation.observedAt) && observation.observedAt >= startedAt && observation.observedAt <= now;

// Installed owning-service readers return the artifact contents and its manifest together.
// A boolean completion claim cannot stand in for sourced findings or actual deployed evidence.
function proposalManifest(artifact) {
  const manifest = artifact.manifest;
  if (!manifest || !entries(manifest.sources) || !entries(manifest.findings) || !entries(manifest.options) ||
      !text(manifest.recommendedScope) || !entries(manifest.implementationSlices) || !entries(manifest.risks) ||
      !entries(manifest.acceptanceCriteria) || !Array.isArray(manifest.unknowns) || !manifest.unknowns.every(text)) return false;
  const content = [...manifest.sources, ...manifest.findings, ...manifest.options, manifest.recommendedScope,
    ...manifest.implementationSlices, ...manifest.risks, ...manifest.acceptanceCriteria, ...manifest.unknowns];
  if (!content.every((item) => artifact.body.includes(item))) return false;
  const design = manifest.design;
  if (!design || !['applicable', 'not-applicable'].includes(design.status)) return false;
  if (design.status === 'not-applicable') return text(design.reason);
  return entries(design.references) && design.references.every((reference) => artifact.body.includes(reference)) &&
    text(design.explanation) && entries(design.states);
}
function deliveryManifest(artifact, task, startedAt, time) {
  const identity = identityOf(task);
  const { pr, preview, validation } = artifact;
  return fresh(pr, startedAt, time) && exact(pr, identity) && url(pr.url) &&
    /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(pr.url) && pr.state === 'open' &&
    pr.draft === false && pr.checks === 'pass' && pr.review === 'pass' && pr.unresolvedThreads === 0 &&
    (!task.team.pr || task.team.pr.url === pr.url) && fresh(preview, startedAt, time) && exact(preview, identity) &&
    url(preview.url) && preview.reachable === true && preview.buildHead === task.head &&
    Array.isArray(validation) && validation.length > 0 && validation.length <= 128 &&
    task.brief.acceptanceCriteria.every((criterion) => validation.some((item) => item.criterion === criterion)) &&
    validation.every((item) => fresh(item, startedAt, time) && exact(item, identity) && text(item.criterion) &&
      item.result === 'pass' && text(item.artifact) && artifact.body.includes(item.artifact)) &&
    artifact.body.includes(pr.url) && artifact.body.includes(preview.url);
}

async function bounded(options, action) {
  const { store, owner, taskId, adapters, now = Date.now, maxRunMs = 30_000, signal } = options;
  if (!store || !owner || !taskId || !adapters || !Number.isSafeInteger(maxRunMs) || maxRunMs < 1 || maxRunMs > 60_000) {
    throw new Error('Delivery configuration unavailable.');
  }
  const operation = createTeamOperation({ now, maxRunMs, signal });
  const { clock, remote } = operation;
  const current = async () => {
    const task = (await remote(() => store.list())).find((item) => item.id === taskId);
    if (!task || task.lease?.owner !== owner || task.lease.expiresAt <= clock() || !bindingOf(task) ||
        ['delivered', 'terminal-failure'].includes(task.state)) throw new Error('Delivery ownership unavailable.');
    return task;
  };
  try { return await action({ current, clock, remote, signal: operation.signal, now }); }
  catch { return { status: 'blocked', reason: 'delivery-observation-unverified' }; }
  finally { operation.close(); }
}

export async function finishTeamArtifact(options) {
  return bounded(options, async ({ current, clock, remote, signal, now }) => {
    const { store, owner, taskId, adapters } = options;
    const task = await current();
    if (!teamPlanComplete(task) || task.team.questions.some((item) => !item.answer)) return { status: 'blocked', reason: 'team-evidence-incomplete' };
    const identity = identityOf(task);
    const proposal = identity.phase === 'proposal';
    const startedAt = clock();
    const artifact = await remote((signal) => adapters.readDelivery(identity, { signal }));
    if (!fresh(artifact, startedAt, clock()) || !exact(artifact, identity) || !text(artifact.body) ||
        artifact.bodyHash !== linearResultBodyHash(artifact.body) ||
        (proposal ? !proposalManifest(artifact) : !deliveryManifest(artifact, task, startedAt, clock()))) {
      return { status: 'blocked', reason: 'delivery-readback-unverified' };
    }
    const latest = await current();
    if (!isDeepStrictEqual(identityOf(latest), identity) || !teamPlanComplete(latest) || latest.team.questions.some((item) => !item.answer)) {
      return { status: 'blocked', reason: 'delivery-snapshot-changed' };
    }
    clock();
    const prior = proposal ? latest.team.proposal : latest.team.pr;
    if (prior?.reference !== artifact.reference || prior?.head !== task.head || prior?.revision !== task.revision) {
      await store.mutate(taskId, 'team-event', { owner, event: { eventId: `artifact:${artifact.reference}:${artifact.observedAt}`, type: proposal ? 'proposal' : 'pr',
        reference: artifact.reference, observedAt: artifact.observedAt, manifest: artifact.manifest ?? null, bodyHash: artifact.bodyHash,
        head: task.head, revision: task.revision,
        ...(!proposal ? { url: artifact.pr.url, preview: artifact.preview.url, validation: artifact.validation } : {}) } });
    }
    clock();
    const linked = await remote(() => runTeamTicketUpdate({ ...options, signal, now, kind: proposal ? 'proposal' : 'pr-evidence', body: artifact.body }));
    if (linked.status !== 'verified') return linked;
    const stage = await remote(() => runTeamTicketUpdate({ ...options, signal, now, resourceToken: options.stageResourceToken, kind: 'stage',
      stage: proposal ? 'Ready for prioritization' : 'In delivery',
      body: proposal ? 'Proposal evidence is ready for prioritization.' : 'The linked delivery is ready for maintainer review.' }));
    return stage.status === 'verified' ? { status: 'verified', taskId, artifact: artifact.reference, link: linked.reference, stage: stage.reference, outputUpdateId: linked.updateId, stageUpdateId: stage.updateId } : stage;
  });
}

export async function acceptTeamDelivery(options) {
  return bounded(options, async ({ current, clock, remote, signal, now }) => {
    const { store, owner, taskId, adapters } = options;
    const task = await current();
    if (!task.team?.pr || task.team.pr.head !== task.head || task.team.pr.revision !== task.revision || !teamPlanComplete(task) || task.team.questions.some((item) => !item.answer) ||
        !task.team.updates.some((item) => item.status === 'verified' && item.receipt.kind === 'pr-evidence')) {
      return { status: 'blocked', reason: 'delivery-evidence-incomplete' };
    }
    const identity = identityOf(task);
    const expected = { ...identity, prUrl: task.team.pr.url };
    const startedAt = clock();
    const acceptance = await remote((signal) => adapters.readAcceptance(expected, { signal }));
    if (!fresh(acceptance, startedAt, clock()) || !exact(acceptance, expected) || !Array.isArray(options.policy?.humanActorIds) || !options.policy.humanActorIds.includes(acceptance.actor) ||
        acceptance.actorIsApp !== false || acceptance.result !== 'accepted' || acceptance.kind !== 'merge' ||
        acceptance.merged !== true || acceptance.checks !== 'pass' || acceptance.review !== 'pass' || acceptance.unresolvedThreads !== 0) {
      return { status: 'blocked', reason: 'maintainer-acceptance-unverified' };
    }
    const latest = await current();
    if (!isDeepStrictEqual(identityOf(latest), identity) || latest.team.pr?.url !== expected.prUrl || !teamPlanComplete(latest) ||
        latest.team.questions.some((item) => !item.answer)) return { status: 'blocked', reason: 'delivery-snapshot-changed' };
    clock();
    if (latest.team.acceptance?.reference !== acceptance.reference) await store.mutate(taskId, 'team-event', { owner,
      event: { ...acceptance, eventId: `accepted:${acceptance.reference}`, type: 'acceptance', verified: true } });
    clock();
    const linked = await remote(() => runTeamTicketUpdate({ ...options, signal, now, resourceToken: options.stageResourceToken ?? options.resourceToken, kind: 'stage', stage: 'Validated',
      body: 'The maintainer accepted the current delivery against its approved criteria.' }));
    return linked.status === 'verified' ? { status: 'acceptance-recorded', taskId, reference: acceptance.reference, stage: linked.reference, stageUpdateId: linked.updateId } : linked;
  });
}
