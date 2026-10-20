const CODEX = 'chatgpt-codex-connector[bot]';
const CODEX_ID = 199175422;
const SUMMARY = '<!-- codex-pull-request-review-summary -->';

export function isCodex(user) {
  return user?.login === CODEX && user.id === CODEX_ID && user.type === 'Bot';
}

export function completedHead(body, repository, number) {
  if (typeof body !== 'string' || !body.startsWith(SUMMARY)) return null;
  const metadata = body.match(/<!-- codex-security-review:v1 (\{[^\n]*\}) -->/);
  if (!metadata) return null;
  let review;
  try {
    review = JSON.parse(metadata[1]);
  } catch {
    return null;
  }
  if (
    review.repository !== repository || review.pullRequestNumber !== number ||
    !/^[a-f0-9]{40}$/.test(review.headSha)
  ) return null;

  // Security Review has its own status. Only the Code Review row authorizes this receipt.
  const rows = body.split('\n').filter((line) => /^\| 📝 \*\*Code Review\*\* \|/.test(line));
  if (rows.length !== 1) return null;
  const cells = rows[0].split('|').map((cell) => cell.trim());
  const sha = /^`([a-f0-9]{7,40})`$/.exec(cells[3]);
  if (!/^✅ \*\*Completed\*\*(?:\s|$)/.test(cells[2]) || !sha) return null;
  return review.headSha.startsWith(sha[1]) ? review.headSha : null;
}

export async function recordCodexReviewCompletion({ github, context, core }) {
  const { issue, comment } = context.payload;
  if (!issue?.pull_request || !isCodex(comment?.user)) return;
  const { owner, repo } = context.repo;
  const pull_number = issue.number;
  const args = { owner, repo, pull_number };
  // Queued edit events can be stale. Fetch the current comment instead of trusting the payload.
  let current;
  try {
    ({ data: current } = await github.rest.issues.getComment({ owner, repo, comment_id: comment.id }));
  } catch (error) {
    if (error.status === 404) return;
    throw error;
  }
  if (!isCodex(current.user)) return;
  const head = completedHead(current.body, `${owner}/${repo}`, pull_number);
  if (!head) return;
  const { data: pr } = await github.rest.pulls.get(args);
  if (pr.state !== 'open' || pr.draft || pr.head.sha !== head) return;

  const marker = `<!-- navet-codex-review-completion:v1 ${head} -->`;
  const reviews = await github.paginate(github.rest.pulls.listReviews, { ...args, per_page: 100 });
  if (reviews.some((review) => review.commit_id === head && (
    (isCodex(review.user) && review.submitted_at) ||
    (review.user?.login === 'github-actions[bot]' && review.user.type === 'Bot' &&
      review.body?.includes(marker))
  ))) {
    core.notice(`Codex review for ${head} is already recorded.`);
    return;
  }

  // Recheck after pagination and pin the review to this SHA, even if a push races the API write.
  const { data: latest } = await github.rest.pulls.get(args);
  if (latest.state !== 'open' || latest.draft || latest.head.sha !== head) return;
  const summaryUrl = `https://github.com/${owner}/${repo}/pull/${pull_number}#issuecomment-${comment.id}`;
  await github.rest.pulls.createReview({
    ...args,
    commit_id: head,
    event: 'COMMENT',
    body: `${marker}\nCodex Code Review completed for commit ${head}. See the [Codex Review Summary](${summaryUrl}) for its result and any findings.\n\nThis workflow records completion; maintainer acceptance remains separate.`,
  });
  core.notice(`Recorded Codex review completion for ${head}.`);
}
