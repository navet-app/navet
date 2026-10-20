import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it, vi } from 'vitest';
import { authorizeCi, dispatchReviewedCi, reviewedPullRequest } from './reviewed-ci.mjs';

const head = 'a'.repeat(40);
const base = 'b'.repeat(40);
const codex = { login: 'chatgpt-codex-connector[bot]', id: 199175422, type: 'Bot' };
function harness() {
  const pr = { number: 310, state: 'open', draft: false, mergeable: true, merge_commit_sha: 'c'.repeat(40), user: { login: 'dependabot[bot]', type: 'Bot' },
    head: { sha: head, ref: 'feature/example', repo: { full_name: 'navet-app/navet' } },
    base: { sha: base, ref: 'main' } };
  const github = {
    paginate: vi.fn(async (method, args) => method(args)),
    graphql: vi.fn(async () => ({ repository: { pullRequest: { reviewThreads: {
      nodes: [{ isResolved: true }], pageInfo: { hasNextPage: false, endCursor: null },
    } } } })),
    rest: {
      pulls: {
        get: vi.fn(async () => ({ data: pr })),
        listReviews: vi.fn(async () => [{ user: codex, commit_id: head, state: 'COMMENTED', submitted_at: '2026-10-20T12:00:00Z' }]),
      },
      issues: { listComments: vi.fn(async () => []) },
      actions: { listWorkflowRuns: vi.fn(async () => [{ id: 123, head_sha: head, event: 'pull_request', status: 'completed', conclusion: 'failure', run_attempt: 1 }]), reRunWorkflow: vi.fn() },
    },
  };
  const context = { repo: { owner: 'navet-app', repo: 'navet' }, eventName: 'workflow_dispatch', sha: head,
    payload: { issue: { number: 310 }, inputs: { pull_request_number: '310', head_sha: head } } };
  const core = { notice: vi.fn(), setOutput: vi.fn() };
  return { github, context, core, pr, owner: 'navet-app', repo: 'navet', number: 310 };
}

describe('review eligibility', () => {
  it('authorizes the exact reviewed head and emits verified metadata for both CI entrypoints', async () => {
    const h = harness();
    await authorizeCi(h);
    expect(h.core.setOutput).toHaveBeenCalledWith('head_sha', head);
    expect(h.core.setOutput).toHaveBeenCalledWith('base_sha', base);
    expect(h.core.setOutput).toHaveBeenCalledWith('checkout_sha', 'c'.repeat(40));
    expect(h.core.setOutput).toHaveBeenCalledWith('author', JSON.stringify(h.pr.user));
    h.context.eventName = 'pull_request_review';
    h.context.sha = 'c'.repeat(40); // PR event checks out its merge commit.
    h.context.payload.pull_request = h.pr;
    await authorizeCi(h);
  });

  it.each(['draft', 'closed', 'other-base', 'conflict', 'old-review', 'pending-review', 'spoofed-author', 'unresolved'])('blocks %s', async (condition) => {
    const h = harness();
    if (condition === 'draft') h.pr.draft = true;
    if (condition === 'closed') h.pr.state = 'closed';
    if (condition === 'other-base') h.pr.base.ref = 'feature/parent';
    if (condition === 'conflict') h.pr.mergeable = false;
    if (condition === 'old-review') h.github.rest.pulls.listReviews.mockResolvedValue([{ user: codex, commit_id: base, state: 'COMMENTED', submitted_at: 'yesterday' }]);
    if (condition === 'pending-review') h.github.rest.pulls.listReviews.mockResolvedValue([{ user: codex, commit_id: head, state: 'PENDING' }]);
    if (condition === 'spoofed-author') h.github.rest.pulls.listReviews.mockResolvedValue([{ user: { ...codex, id: 1 }, commit_id: head, state: 'APPROVED', submitted_at: 'today' }]);
    if (condition === 'unresolved') h.github.graphql.mockResolvedValue({ repository: { pullRequest: { reviewThreads: {
      nodes: [{ isResolved: false }], pageInfo: { hasNextPage: false },
    } } } });
    await expect(authorizeCi(h)).rejects.toThrow();
    expect(h.core.setOutput).not.toHaveBeenCalled();
  });

  it('reads every thread page, including unresolved outdated findings', async () => {
    const h = harness();
    h.github.graphql.mockResolvedValueOnce({ repository: { pullRequest: { reviewThreads: {
      nodes: [{ isResolved: true }], pageInfo: { hasNextPage: true, endCursor: 'next-page' },
    } } } }).mockResolvedValueOnce({ repository: { pullRequest: { reviewThreads: {
      nodes: [{ isResolved: false }], pageInfo: { hasNextPage: false },
    } } } });
    await expect(reviewedPullRequest(h)).rejects.toThrow('findings');
    expect(h.github.graphql.mock.calls[1][1].cursor).toBe('next-page');
  });

  it('blocks requests for changes until that reviewer approves or dismisses them', async () => {
    const h = harness();
    const completed = await h.github.rest.pulls.listReviews();
    const reviewer = { id: 7, login: 'reviewer' };
    h.github.rest.pulls.listReviews.mockResolvedValue([...completed, { user: reviewer, state: 'CHANGES_REQUESTED' }]);
    await expect(reviewedPullRequest(h)).rejects.toThrow('requests changes');
    h.github.rest.pulls.listReviews.mockResolvedValue([...completed, { user: reviewer, state: 'DISMISSED' }]);
    await expect(reviewedPullRequest(h)).resolves.toBe(h.pr);
    h.github.rest.pulls.listReviews.mockResolvedValue([...completed,
      { user: reviewer, state: 'CHANGES_REQUESTED' }, { user: reviewer, state: 'APPROVED' }]);
    await expect(reviewedPullRequest(h)).resolves.toBe(h.pr);
  });

  it('rejects a head or base update during the eligibility read', async () => {
    for (const update of [{ head: { sha: base } }, { base: { sha: head, ref: 'main' } }]) {
      const h = harness();
      h.github.rest.pulls.get.mockResolvedValueOnce({ data: h.pr }).mockResolvedValueOnce({ data: { ...h.pr, ...update } });
      await expect(reviewedPullRequest(h)).rejects.toThrow('changed');
    }
  });

  it('cannot manually dispatch main or another branch in place of the reviewed head', async () => {
    const h = harness();
    h.context.sha = base;
    await expect(authorizeCi(h)).rejects.toThrow('reviewed same-repository');
    h.context.payload.inputs.head_sha = '';
    await expect(authorizeCi(h)).rejects.toThrow('selected commit');
  });

  it('rejects completion if the tested merge commit changed during CI', async () => {
    const h = harness();
    await expect(authorizeCi({ ...h, expectedCheckout: base })).rejects.toThrow('changed during CI');
  });

  it('accepts a verified completed summary even when Codex posts no formal review', async () => {
    const h = harness();
    h.github.rest.pulls.listReviews.mockResolvedValue([]);
    h.github.rest.issues.listComments.mockResolvedValue([{ user: codex, body:
      `<!-- codex-pull-request-review-summary -->\n<!-- codex-security-review:v1 ${JSON.stringify({ repository: 'navet-app/navet', pullRequestNumber: 310, headSha: head })} -->\n| 📝 **Code Review** | ✅ **Completed** | \`${head.slice(0, 7)}\` | New commits |` }]);
    await expect(reviewedPullRequest(h)).resolves.toBe(h.pr);
  });
});

// Rewrite: resume an existing PR event instead of executing PR code under workflow_dispatch.
describe('reviewed CI resumption', () => {
  it('reruns only the current head PR workflow, including forks', async () => {
    for (const repository of ['navet-app/navet', 'contributor/navet']) {
      const h = harness();
      h.pr.head.repo.full_name = repository;
      await dispatchReviewedCi(h);
      expect(h.github.rest.actions.reRunWorkflow).toHaveBeenCalledExactlyOnceWith({
        owner: h.owner, repo: h.repo, run_id: 123,
      });
      expect(h.github.rest.actions.listWorkflowRuns).toHaveBeenCalledWith(expect.objectContaining({
        head_sha: head, event: 'pull_request',
      }));
    }
  });

  it('waits for review and propagates API failures without rerunning tests', async () => {
    const h = harness();
    h.github.rest.pulls.listReviews.mockResolvedValueOnce([]);
    await dispatchReviewedCi(h);
    expect(h.github.rest.actions.reRunWorkflow).not.toHaveBeenCalled();
    h.github.graphql.mockRejectedValue(new Error('API unavailable'));
    await expect(dispatchReviewedCi(h)).rejects.toThrow('API unavailable');
    expect(h.github.rest.actions.reRunWorkflow).not.toHaveBeenCalled();
  });

  it.each([
    [],
    [{ id: 123, head_sha: base, event: 'pull_request', status: 'completed', conclusion: 'failure' }],
    [{ id: 123, head_sha: head, event: 'workflow_dispatch', status: 'completed', conclusion: 'failure' }],
    [{ id: 123, head_sha: head, event: 'pull_request', status: 'in_progress' }],
    [{ id: 123, head_sha: head, event: 'pull_request', status: 'completed', conclusion: 'success' }],
  ])('does not restart missing, unrelated, active or successful CI: %j', async (...runs) => {
    const h = harness();
    h.github.rest.actions.listWorkflowRuns.mockResolvedValue(runs);
    await dispatchReviewedCi(h);
    expect(h.github.rest.actions.reRunWorkflow).not.toHaveBeenCalled();
  });

  it('deduplicates automatic summary edits while allowing explicit manual retries', async () => {
    const h = harness();
    h.github.rest.actions.listWorkflowRuns.mockResolvedValue([
      { id: 123, head_sha: head, event: 'pull_request', status: 'completed', conclusion: 'failure', run_attempt: 2 },
    ]);
    h.context.eventName = 'issue_comment';
    await dispatchReviewedCi(h);
    expect(h.github.rest.actions.reRunWorkflow).not.toHaveBeenCalled();
    h.context.eventName = 'workflow_dispatch';
    delete h.context.payload.issue;
    await dispatchReviewedCi(h);
    expect(h.github.rest.actions.reRunWorkflow).toHaveBeenCalledExactlyOnceWith({
      owner: h.owner, repo: h.repo, run_id: 123,
    });
  });
});

it('keeps expensive lanes behind review and fails the required gate if review is skipped', () => {
  const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8'));
  expect(workflow.on.pull_request.branches).toEqual(['main']);
  expect(workflow.on.workflow_dispatch).toBeUndefined();
  expect(workflow.on.pull_request_target).toBeUndefined();
  expect(workflow.permissions).toEqual({ contents: 'read', checks: 'read', 'pull-requests': 'read' });
  expect(workflow.jobs.impact.needs).toBe('review');
  for (const job of Object.values(workflow.jobs).filter((job) => !['Review eligibility', 'Product review gate'].includes(job.name))) {
    expect([job.needs].flat()).toContain(job === workflow.jobs.impact ? 'review' : 'impact');
  }
  const gate = workflow.jobs['product-review-gate'];
  expect(gate.needs).toContain('review');
  expect(gate.steps[0].run).toContain('test "$REVIEW_RESULT" = success');
  expect(gate.steps.some((step) => step.with?.script?.includes('authorizeCi'))).toBe(true);
  const previews = gate.steps.find((step) => step.name === 'Require successful previews for affected sites');
  expect(previews.if).toBeUndefined();
  for (const [name, job] of Object.entries(workflow.jobs)) {
    if (['review', 'product-review-gate'].includes(name)) {
      const checkout = job.steps.find((step) => step.uses === 'actions/checkout@v5');
      expect(checkout.with.ref).toBe('2246837e02a5e3cea7b8671d532eaa4efdbca92c');
      expect(checkout.with['persist-credentials']).toBe(false);
      expect(job.steps.filter((step) => step.uses === 'actions/checkout@v5')).toHaveLength(1);
      continue;
    }
    if (job.uses) {
      expect(job.with.checkout_ref).toContain('outputs.checkout_sha');
    } else {
      const checkout = job.steps.find((step) => step.uses === 'actions/checkout@v5');
      expect(checkout.with.ref).toContain('outputs.checkout_sha');
    }
  }
});
