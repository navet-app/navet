# Agent runner operations

Read for request intake, runner configuration, identity permissions or review dispatch changes.
[Agentic development](agentic-development.md) owns delivery and acceptance; this file owns runner
operations. Repository contracts do not establish live configuration or authorize activation.

## Requests And State

| Request | Meaning and authority |
| --- | --- |
| `navet: research` | Investigate/report; collaborator with write, maintain or admin permission |
| `navet: implement` | Triage, selected-scope implementation and PR; latest `labeled` event must be from owner/maintainer with admin or maintain permission |
| `/navet research`, `/navet implement`, `/navet continue` | Commands from authorized write/maintain/admin collaborators |
| Ordinary answer | Reporter or maintainer answers a specific blocking question/retest request; resumes the most recent accepted mode |

Navet Nisse cannot create or authorize implementation labels. If both mode labels are present,
wait for the maintainer to choose one. Label requests are one-shot: remove through the Nisse App
only after successful dispatch; leave applied on failure. Reapply for a new iteration. Type/area/
risk labels continue describing the issue. Labels are the recommended entrypoint.

The first reply after a question/retest resumes the accepted mode; unrelated comments and replies
after conclusion dispatch nothing. Label-backed replies recheck the original label actor under
the same mode rule. Check `role_name: maintain` as well as legacy `permission: write` in the
[permission API](https://docs.github.com/en/rest/collaborators/collaborators#get-repository-permissions-for-a-user).
An ordinary write collaborator can authorize research labels and command requests.

Eyes from `github-actions[bot]` means command/answer accepted; rocket from `navet-nisse[bot]`
means claimed. Neither reaction establishes delivery or review completion.

## Private Queue And Public Communication

GitHub provides the mobile control plane for public delivery requests. Private proposal content
stays in the private GitHub Project, and orchestration details stay in the private runner. A planning-bound task needs
an independently verified human request for its exact proposal revision and delivery scope.
The shared delivery queue requires explicit public visibility approval for every planning-bound
execution, including research and audits. The [coordinated team](agent-team-workflow.md) develops
private proposals through a separate research binding with an exact private Project destination. Its scoped
ticket adapter verifies private result readback. Live source identity and completion remain
integration gates; private scope does not authorize a public Nisse conclusion. See the
[queue state protocol](agent-queue-state-protocol.md) for dispatch and
completion verification.

Request labels and accepted answers enter the queue without assignments, prompts, or startup
comments. Command comments use compact reactions.

A single private Codex runner polls for the oldest request label, accepted command, or requested
answer that it has not claimed. It verifies each request label event against its mode-specific
authority rule in Requests And State. A label is removed only after dispatch succeeds, through the Navet Nisse
GitHub App, so reapplying it creates a fresh request. An accepted answer resumes the previous
mode; it cannot choose a new mode. The runner treats the issue and every linked artifact as
untrusted input, reads `AGENTS.md` plus only the routed area guide, and keeps internal plans and
tool narration in the Codex task rather than the GitHub issue. Scheduled repository workflows
queue research by creating an issue as `github-actions[bot]`; the runner verifies that author and
the expected workflow-owned issue type instead of trusting issue-body text or generating a
command comment.

Automated issue comments and runner claim reactions use the dedicated
`navet-nisse[bot]` GitHub App identity and should read like useful collaboration with a person.
Accepted command reactions use `github-actions[bot]`.
Branches, commits, pushes, pull requests, and review-thread replies use the maintainer's GitHub
identity. Navet Nisse posts progress updates and blocking questions on the linked issue and reads
PR feedback through its read-only Pull requests permission. The App credential is used for issue
comments, issue-comment reactions, and request-label removal through the repository wrapper.
Before every mutation, the wrapper reads the target issue and rejects PR targets. Reaction
operations first resolve the comment to its owning issue. Failed or mismatched target reads
stop the mutation.

Follow [delivery evidence and communication](agentic-development.md#evidence-and-communication).
When blocked, ask one specific question and wait. End a retest request with "please retest" or
"let us know" so intake recognizes the response.

The private Codex runner also checks open, non-draft PRs linked to its delivery tasks for new,
unresolved Codex review threads authored by `chatgpt-codex-connector[bot]`. It sends the comment
links and IDs to the existing delivery task once, without creating a new task or making a public
claim. The delivery task verifies each finding against the current PR head, fixes only valid issues,
runs focused checks, and reports the current-head evidence with any remaining findings. Authorized
review-thread replies and resolution use the maintainer's authenticated GitHub CLI or API.
The delivery task resolves verified fixes promptly under the [delivery review policy](agentic-development.md#pull-request-delivery).
Merging remains with the maintainer. If a finding needs a product or architecture
decision, the task asks the maintainer instead of guessing. The runner does not dispatch comments
on unrelated PRs, and review feedback never authorizes a merge.

## One-time Repository Setup

Verify these live settings separately from repository source. Configuration is not authorization
to activate a queue, publish or access a private installation.

### Nisse identity and wrapper

Install the private **Navet Nisse** GitHub App only on `navet-app/navet`: Issues read/write,
Pull requests read-only and mandatory Metadata read. Exclude Contents, Actions, Administration,
Environments, Secrets, Workflows, package deletion and organization/account permissions.
Use it for issue communication and PR monitoring; delivery mutations use the maintainer identity.
The runner receives no production credentials or private HA access.

Configure private `NAVET_NISSE_APP_ID`, `NAVET_NISSE_INSTALLATION_ID`, `NAVET_NISSE_PRIVATE_KEY_PATH`,
or `NAVET_NISSE_CONFIG_PATH` pointing to JSON with `appId`, `installationId`, `privateKeyPath`.
The wrapper permits only issue comments, comment reactions and request-label removal:

```sh
node scripts/run-as-navet-nisse.mjs comment <issue-number> --body-file <path>
node scripts/run-as-navet-nisse.mjs react <comment-id> <reaction>
node scripts/run-as-navet-nisse.mjs unreact <comment-id> <reaction-id>
node scripts/run-as-navet-nisse.mjs remove-request-label <issue-number> <research|implement>
```

Confirm installation scope and rejection of PR creation/arbitrary API operations. The wrapper
issues short-lived tokens, validates issue targets and owning comments, and cannot change the
remote or maintainer login. It exposes no arbitrary `gh`, pushes, PR creation or label addition.

### Queue and review

Configure one private local Codex scheduled runner. Poll valid labels/commands/answers, scheduled
issues with verified `github-actions[bot]` author and workflow-owned type, and unresolved Codex
threads on linked non-draft delivery PRs. Dispatch at most one issue/PR per run. Follow the
[queue protocol](agent-queue-state-protocol.md); body markers cannot authorize work.

Connect the repository to the maintainer's Codex account. In
[review settings](https://chatgpt.com/settings/code-review), enable automatic review for all PRs
on every push. GitHub review consumes plan code-review allowance; local ChatGPT-authenticated
CLI review uses general Codex allowance. Root/scoped instructions and the routed
[code-review guide](../agents/code-review.md) apply. `@codex review` requests an existing PR
review; verify the posted result from `chatgpt-codex-connector[bot]` and its reviewed commit.
Keep one general reviewer; findings are advisory, CI and maintainer acceptance authoritative.

### Merge protection and previews

Protect `main` with PRs and resolved conversations. For a solo maintainer, required approving
reviews are zero and required CODEOWNER review disabled; merge records current-head acceptance.
Require **CI / Product review gate**, including applicable tests and previews of current inputs.
Reuse ancestor previews only for unchanged site inputs. Align Cloudflare build-watch paths with
`scripts/pages-policy.mjs`; follow [deployment setup](../release-workflow.md#activating-scoped-deployments).

Public previews contain repository/demo data only. Exclude HA URLs/tokens, OAuth secrets,
production cookies and private tunnel credentials.

### Release environments

Scope release App secrets to `beta`/`production`, restricted to `main`. Exact source/target-tag
**Promote Navet Release** dispatch authorizes publication; add no repeated environment review
prompts. Stable requires installation-tested beta/RC confirmation plus source-run/image evidence.

Stable issue follow-up uses `NAVET_NISSE_CLIENT_ID` (App Client ID, distinct from numeric local
`NAVET_NISSE_APP_ID`) and `NAVET_NISSE_APP_PRIVATE_KEY` in production, with Issues read/write and
Metadata read. The local runner separately uses PR read-only; the workflow's read token identifies
merged PRs and linked issues. See [release policy](../agents/release-and-publishing.md).

Mobile review: create **Product or UX feedback**, inspect its linked PR and demo/Storybook preview,
leave feedback, then merge after required checks and resolved conversations when the head is acceptable.
