import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it, vi } from 'vitest';
import { recordCodexReviewCompletion } from './codex-review-completion.mjs';

const head = 'df925d4b20e259c3c6e6f874e1bbc9dd7de85e91';
const otherHead = '515936f0000000000000000000000000000000000';
const codex = { login: 'chatgpt-codex-connector[bot]', id: 199175422, type: 'Bot' };
const actions = { login: 'github-actions[bot]', type: 'Bot' };
const marker = `<!-- navet-codex-review-completion:v1 ${head} -->`;

function summary({ codeStatus = '✅ **Completed**', securityStatus = 'in_progress', sha = head, rowSha = sha.slice(0, 7), repository = 'navet-app/navet', number = 277 } = {}) {
  return `<!-- codex-pull-request-review-summary -->
<!-- codex-security-review:v1 ${JSON.stringify({ headSha: sha, repository, pullRequestNumber: number, status: securityStatus })} -->
## Codex Review Summary

| Review | Status | Commit | Review trigger |
| --- | --- | --- | --- |
| 📝 **Code Review** | ${codeStatus} <relative-time datetime="2026-10-12T19:24:20.663417Z">2026-10-12T19:24:20.663417Z</relative-time> | \`${rowSha}\` | New commits |
| 🔒 **Security Review** | ${securityStatus} | \`${rowSha}\` | New commits |`;
}

function harness({ body = summary(), user = codex, reviews = [], pr = {}, latest = {} } = {}) {
  const comment = { id: 6130891857, user, body };
  const pull = { state: 'open', draft: false, head: { sha: head }, ...pr };
  const github = {
    paginate: vi.fn(async (method, args) => method(args)),
    rest: {
      issues: { getComment: vi.fn(async () => ({ data: comment })) },
      pulls: {
        get: vi.fn().mockResolvedValueOnce({ data: pull }).mockResolvedValue({ data: { ...pull, ...latest } }),
        listReviews: vi.fn(async () => reviews),
        createReview: vi.fn(async () => ({})),
      },
    },
  };
  const context = {
    repo: { owner: 'navet-app', repo: 'navet' },
    payload: { issue: { number: 277, pull_request: {} }, comment: { ...comment } },
  };
  return { github, context, core: { notice: vi.fn() } };
}

describe('Codex completion review', () => {
  it('posts a pinned COMMENT with no inline findings, without waiting for Security Review', async () => {
    const h = harness();
    await recordCodexReviewCompletion(h);
    expect(h.github.rest.pulls.createReview).toHaveBeenCalledExactlyOnceWith({
      owner: 'navet-app', repo: 'navet', pull_number: 277, commit_id: head, event: 'COMMENT',
      body: expect.stringContaining(marker),
    });
    expect(h.github.rest.pulls.createReview.mock.calls[0][0].body).toContain(
      'https://github.com/navet-app/navet/pull/277#issuecomment-6130891857'
    );
    expect(h.github.rest.pulls.get).toHaveBeenCalledTimes(2);
  });

  it('reads the latest summary rather than a queued event body', async () => {
    const h = harness({ body: summary({ codeStatus: '👀 **Running**' }) });
    h.context.payload.comment.body = summary();
    await recordCodexReviewCompletion(h);
    expect(h.github.rest.pulls.createReview).not.toHaveBeenCalled();
  });

  it.each([
    { login: 'maintainer', id: 1, type: 'User' },
    { ...codex, id: 1 },
    { ...codex, type: 'User' },
  ])('rejects an unverified comment author: %j', async (user) => {
    const h = harness({ user });
    await recordCodexReviewCompletion(h);
    expect(h.github.rest.issues.getComment).not.toHaveBeenCalled();
    expect(h.github.rest.pulls.createReview).not.toHaveBeenCalled();
  });

  it('verifies the fetched author too', async () => {
    const h = harness({ user: { ...codex, id: 1 } });
    h.context.payload.comment.user = codex;
    await recordCodexReviewCompletion(h);
    expect(h.github.rest.pulls.createReview).not.toHaveBeenCalled();
  });

  it.each([
    'ordinary comment',
    summary({ codeStatus: '❌ **Failed**', securityStatus: 'completed' }),
    summary({ codeStatus: '👀 **Running**', securityStatus: 'completed' }),
    summary({ sha: otherHead }),
    summary({ rowSha: '515936f' }),
    summary({ rowSha: 'df925d' }),
    summary({ repository: 'other/navet' }),
    summary({ number: 278 }),
    summary().replace(head, 'invalid'),
    summary().replace('"headSha"', 'bad-json'),
    summary().replace('codex-security-review:v1', 'codex-security-review:v2'),
  ])('skips incomplete, stale or malformed summaries: %s', async (body) => {
    const h = harness({ body });
    await recordCodexReviewCompletion(h);
    expect(h.github.rest.pulls.createReview).not.toHaveBeenCalled();
  });

  it.each([{ state: 'closed' }, { draft: true }, { head: { sha: otherHead } }])(
    'skips ineligible PRs on both reads: %j', async (pr) => {
      for (const option of [{ pr }, { latest: pr }]) {
        const h = harness(option);
        await recordCodexReviewCompletion(h);
        expect(h.github.rest.pulls.createReview).not.toHaveBeenCalled();
      }
    }
  );

  it('skips regular issue comments', async () => {
    const h = harness();
    delete h.context.payload.issue.pull_request;
    await recordCodexReviewCompletion(h);
    expect(h.github.rest.issues.getComment).not.toHaveBeenCalled();
  });

  it('deduplicates retries and later security summary edits through paginated reviews', async () => {
    const h = harness({ reviews: [{ user: actions, commit_id: head, body: marker, state: 'COMMENTED' }] });
    await recordCodexReviewCompletion(h);
    expect(h.github.paginate).toHaveBeenCalledWith(h.github.rest.pulls.listReviews, {
      owner: 'navet-app', repo: 'navet', pull_number: 277, per_page: 100,
    });
    expect(h.github.rest.pulls.createReview).not.toHaveBeenCalled();
  });

  it('skips an existing submitted Codex review with findings', async () => {
    const h = harness({ reviews: [{ user: codex, commit_id: head, submitted_at: '2026-10-12T19:24:20Z', body: 'Suggestions' }] });
    await recordCodexReviewCompletion(h);
    expect(h.github.rest.pulls.createReview).not.toHaveBeenCalled();
  });

  it.each([
    { user: actions, commit_id: otherHead, body: marker },
    { user: { login: 'maintainer', type: 'User' }, commit_id: head, body: marker },
    { user: actions, commit_id: head, body: 'Unrelated review' },
    { user: codex, commit_id: head, state: 'PENDING' },
  ])('does not suppress a completion because of an unrelated review: %j', async (review) => {
    const h = harness({ reviews: [review] });
    await recordCodexReviewCompletion(h);
    expect(h.github.rest.pulls.createReview).toHaveBeenCalledTimes(1);
  });

  it('skips a deleted summary, but propagates API failures', async () => {
    for (const status of [404, 403]) {
      const h = harness();
      h.github.rest.issues.getComment.mockRejectedValue({ status });
      if (status === 404) await recordCodexReviewCompletion(h);
      else await expect(recordCodexReviewCompletion(h)).rejects.toEqual({ status });
      expect(h.github.rest.pulls.createReview).not.toHaveBeenCalled();
    }
  });

  it('runs trusted code with narrow permissions and serializes each PR', () => {
    const workflow = parse(readFileSync('.github/workflows/codex-review-completion.yml', 'utf8'));
    expect(workflow.on).toEqual({ issue_comment: { types: ['created', 'edited'] } });
    expect(workflow.permissions).toEqual({ contents: 'read', 'pull-requests': 'write' });
    expect(workflow.concurrency).toEqual({
      group: 'codex-review-completion-${{ github.repository }}-${{ github.event.issue.number }}',
      'cancel-in-progress': false,
    });
    const checkout = workflow.jobs.record.steps.find((step) => step.uses === 'actions/checkout@v5');
    expect(checkout.with).toEqual({ 'persist-credentials': false });
    expect(workflow.jobs.record.if).toContain('199175422');
    expect(workflow.jobs.record.steps.at(-1).with.script).toContain('recordCodexReviewCompletion');
  });
});
