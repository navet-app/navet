import { completedHead, isCodex } from './codex-review-completion.mjs';

class ReviewPending extends Error {}

/** Read current review evidence; stale summaries and unresolved outdated threads block CI. */
export async function reviewedPullRequest({ github, owner, repo, number, expectedHead }) {
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid PR number.');
  const args = { owner, repo, pull_number: number };
  const { data: pr } = await github.rest.pulls.get(args);
  if (pr.state !== 'open' || pr.draft || pr.base.ref !== 'main' ||
      (expectedHead && pr.head.sha !== expectedHead)) {
    throw new ReviewPending('CI requires an open, non-draft main PR at the selected commit.');
  }
  if (pr.mergeable !== true || !/^[a-f0-9]{40}$/.test(pr.merge_commit_sha ?? '')) {
    throw new ReviewPending('Waiting for a conflict-free PR merge commit.');
  }
  const comments = await github.paginate(github.rest.issues.listComments,
    { owner, repo, issue_number: number, per_page: 100 });
  const reviews = await github.paginate(github.rest.pulls.listReviews, { ...args, per_page: 100 });
  const completed = comments.some((comment) => isCodex(comment.user) &&
    completedHead(comment.body, `${owner}/${repo}`, number) === pr.head.sha) ||
    reviews.some((review) => isCodex(review.user) && review.commit_id === pr.head.sha &&
      review.submitted_at && ['COMMENTED', 'APPROVED'].includes(review.state));
  if (!completed) throw new ReviewPending('Waiting for Codex Code Review of the current commit.');

  const decisions = new Map();
  for (const review of reviews) {
    if (['APPROVED', 'CHANGES_REQUESTED'].includes(review.state)) {
      decisions.set(review.user.id, review.state);
    }
  }
  if ([...decisions.values()].includes('CHANGES_REQUESTED')) {
    throw new ReviewPending('A reviewer still requests changes.');
  }
  let cursor = null;
  do {
    const result = await github.graphql(`query($owner:String!, $repo:String!, $number:Int!, $cursor:String) {
      repository(owner:$owner, name:$repo) { pullRequest(number:$number) {
        reviewThreads(first:100, after:$cursor) {
          nodes { isResolved }
          pageInfo { hasNextPage endCursor }
        }
      } }
    }`, { owner, repo, number, cursor });
    const threads = result.repository.pullRequest.reviewThreads;
    if (threads.nodes.some((thread) => !thread.isResolved)) {
      throw new ReviewPending('Waiting for all review findings to be resolved.');
    }
    cursor = threads.pageInfo.hasNextPage ? threads.pageInfo.endCursor : null;
  } while (cursor);

  const { data: latest } = await github.rest.pulls.get(args);
  if (latest.state !== 'open' || latest.draft || latest.head.sha !== pr.head.sha ||
      latest.base.sha !== pr.base.sha || latest.base.ref !== 'main' ||
      latest.mergeable !== true || latest.merge_commit_sha !== pr.merge_commit_sha) {
    throw new ReviewPending('PR changed while review eligibility was checked.');
  }
  return latest;
}

/** Resume the existing PR-scoped run without executing PR code in a dispatch context. */
export async function dispatchReviewedCi({ github, context, core }) {
  const number = context.payload.issue?.number ?? context.payload.pull_request?.number ??
    Number(context.payload.inputs?.pull_request_number);
  const { owner, repo } = context.repo;
  let pr;
  try {
    pr = await reviewedPullRequest({ github, owner, repo, number });
  } catch (error) {
    // Eligibility waits are expected; API failures must remain visible.
    if (!(error instanceof ReviewPending)) throw error;
    core.notice(error.message);
    return;
  }
  const runs = await github.paginate(github.rest.actions.listWorkflowRuns, {
    owner, repo, workflow_id: 'ci.yml', head_sha: pr.head.sha, event: 'pull_request', per_page: 100,
  });
  const run = runs.filter((entry) => entry.head_sha === pr.head.sha && entry.event === 'pull_request')
    .sort((left, right) => right.id - left.id)[0];
  if (!run || run.status !== 'completed' || run.conclusion === 'success') {
    core.notice('PR CI is not yet waiting, is already running, or has passed.');
    return;
  }
  if (run.run_attempt > 1 && context.eventName !== 'workflow_dispatch') {
    core.notice('CI was already resumed; use the manual resume or rerun control to retry.');
    return;
  }
  await github.rest.actions.reRunWorkflow({ owner, repo, run_id: run.id });
}

/** Both automatic and manual CI runs recheck current reviews before running tests. */
export async function authorizeCi({ github, context, core, expectedCheckout }) {
  const number = context.payload.pull_request?.number ?? Number(context.payload.inputs?.pull_request_number);
  const expectedHead = context.payload.pull_request?.head.sha ?? (context.payload.inputs?.head_sha || context.sha);
  if (!/^[a-f0-9]{40}$/.test(expectedHead ?? '')) throw new Error('Invalid reviewed head SHA.');
  const { owner, repo } = context.repo;
  const pr = await reviewedPullRequest({ github, owner, repo, number, expectedHead });
  if (expectedCheckout && pr.merge_commit_sha !== expectedCheckout) {
    throw new ReviewPending('PR merge commit changed during CI; review eligibility must be checked again.');
  }
  if (context.eventName === 'workflow_dispatch' &&
      (context.sha !== pr.head.sha || pr.head.repo?.full_name !== `${owner}/${repo}`)) {
    throw new Error('Dispatch must target the reviewed same-repository branch commit.');
  }
  core.setOutput('base_sha', pr.base.sha);
  core.setOutput('head_sha', pr.head.sha);
  core.setOutput('checkout_sha', pr.merge_commit_sha);
  core.setOutput('number', String(number));
  core.setOutput('author', JSON.stringify(pr.user));
}
