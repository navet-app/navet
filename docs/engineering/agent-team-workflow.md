# Coordinated Agent Team

The team develops private proposals and delivers explicitly approved scope through the existing
private task store. The private GitHub Project holds proposals, questions and decisions; one GitHub PR holds approved
public delivery. Maintainer acceptance, merge and release remain separate decisions.

## UI ticket support

For UI tickets, design and implementation specialists use the
[composition recipes](../design-system/AGENT-COMPOSITION-RECIPES.md) and
`pnpm agent:components <name>` to inspect current shared contracts. Test and review specialists
use the [UX evidence guidance](../../ai/skills/navet-ux.md) for reproducible rendered
evidence and `pnpm check:ui-kit` for focused source guardrails. Attach findings and retest evidence
to the existing ticket and approval package. Choose coverage from the changed surface, its direct
consumers and acceptance criteria.

## Source Ownership

| Module | Responsibility |
| --- | --- |
| `agent-task-store.mjs` | Shared atomic ownership, deduplication, resources, execution guards and recovery history |
| `agent-proposal-scope.mjs` | Private idea authority, exact private Project destination and proposal intake |
| `agent-planning-intake.mjs` | Human approval bound to the selected delivery brief and proposal revision |
| `agent-team-state.mjs` | Specialist plans, dependencies, file ownership, attempts, evidence and waiting states |
| `agent-team-operation.mjs` | Shared cancellation, deadlines and bounded observation reads; durable mutations remain awaited by their owning workflow |
| `agent-team-coordinator.mjs` | One specialist execution or observation per bounded invocation |
| `agent-team-ticket.mjs` | Ticket transport, durable send permission and independent readback; Project adapter requires a pilot |
| `agent-team-conversation.mjs` | Store-backed ticket publication and verified answer resumption |
| `agent-team-delivery.mjs` | Artifact/acceptance contracts; Project publication adapter requires a pilot |
| `agent-team-checkpoint.mjs` | Read-only, stable Git checkpoints for the exact worker run |
| `agent-team-monitor.mjs` | Bounded interruption and terminal reconciliation of existing specialists |
| `agent-team-resume.mjs` | Verified answers continue the same worker from its retained checkpoint |
| `agent-team-accounting.mjs` | Complete native coordinator/worker accounting and reservation settlement |
| `agent-team-completion.mjs` | Fresh output/stage readback, accounting and terminal ownership release |
| `agent-team-run.mjs` | Explicit command entry point using locally installed trusted adapters |

Public planning execution retains its explicit visibility requirement. Private proposal tasks use
`proposalBinding` and `github-project-proposal`, with research mode, `maintainer-idea-request` authority,
`proposalRevision`, `purpose: proposal-development`, private visibility and an exact private Project
item/organization/project destination. Captured and Developing proposal permit this work. Priority and
agent-authored stage changes grant no implementation authority. Approved delivery uses the existing
`planningBinding` contract and a new verified human request identity.

Project drafts have no comment threads. Interactive skills retain questions, verified answers and
results in draft history and use the active Codex conversation for authenticated decisions. The
coordinated ticket callbacks require Project adapters for draft editing and human provenance.
Install and verify those adapters through an authorized pilot before using this destination.

## Run One Operation

From the repository root:

```sh
CODEX_THREAD_ID=<coordinator-handle> \
NAVET_TEAM_ADAPTER_MODULE=/absolute/private/installed-team-adapters.mjs \
node scripts/agent-team-run.mjs /absolute/private/team-state /absolute/private/input.json
```

The adapter module exports `createTeamAdapters()`. Configure its source outside ticket content;
loading it executes trusted local code. It supplies authenticated issue/request readers, exact
worker create/find/read/resume/interrupt callbacks, native session inventory and scoped ticket callbacks.
Configure `maxStopAttempts` within 1–10, an accepted `leaseDurationMs`, and the existing
`native-observed-operations-v1` resource policy. The default checkpoint reader captures local Git;
workers must supply exact task, intent, worker and run identities. Native usage requires a dedicated
coordinator session and every historical worker session, with complete authenticated inventory.
The private Project reader can supply issue reads; the installed human decision reader remains a
separate authentication boundary. Credential contents belong in a private credential manager.

Inputs select one operation:

- `proposal-intake` or `delivery-intake`: `identity: {source, requestId}`. Intake verifies source,
  current issue and source again, then deduplicates through the existing store.
- `claim`: `taskId`. The installed accepted `leaseDurationMs` supplies the lease; `readOwner`
  verifies former-owner termination when recovering expired ownership.
- `plan`: `taskId`, `event` with type `plan`, immutable event/revision, phase and assignments.
  Assignments name role, dependencies, repository-relative file ownership and scoped brief.
- `context`: `taskId`, `context` containing the saved `worktree`, `branch` and `nextAction`.
- `usage`: `taskId`. Native session counters and two authenticated participant inventories produce
  an observed cumulative measurement. Reservations settle only after their exact operation is
  covered by that measurement; caller-supplied settlement lists grant no credit.
- `reserve`: `taskId`, stable `eventId`, `modelTokens`, `toolCalls`. This consumes the accepted
  request's existing limits and returns its reservation token.
- `step`: `taskId`, `resourceToken`. It performs at most one creation, reconciliation or observation.
- `ticket-update`: `taskId`, `kind`, `body`, optional `stage`/`questionId`, `resourceToken`.
- `ticket-answer`: `taskId`, verified question `updateId`, `answerId`. This observes an answer and
  resumes the same team record when the accepted scope remains current.
- `artifact`: `taskId`, `resourceToken`. `readDelivery` supplies current artifact/validation facts
  and a scoped ticket body. Private proposals require a sourced `proposalManifest`, including
  options, recommended scope, implementation slices, risks, acceptance criteria, unknowns and
  proportionate design evidence. Its contents and hash must match the ticket body. Public delivery
  requires actual PR/head/preview/validation readback covering every accepted criterion. Publication uses `resourceToken`; the stage update uses a separate `stageResourceToken`.
  Reruns reconcile retained receipts without resending.
- `acceptance`: `taskId`, `stageResourceToken`. `readAcceptance` observes a human merge of the
  exact PR/head/scope by a human in the installed maintainer policy, with passing checks and
  review. It records that receipt and verifies the Validated ticket update.
- `monitor`: `taskId`, `intentId`. Rechecks authorization/resources and interrupts the exact run
  within the accepted stop-attempt bound, retaining checkpoint and acknowledgement uncertainty.
- `resume-worker`: `taskId`, `intentId`, `questionId`, `resourceToken`. Continues the same
  stopped worker after its matching verified answer and a fresh unchanged Git checkpoint.
  `step` also performs this continuation when appropriate.
- `complete`: `taskId`, `outputUpdateId`, `stageUpdateId`. Fresh output/stage readback, current
  issue scope and human request verification, and complete native accounting release ownership.
  The final store transaction rechecks the exact issue revision, lifecycle and completion stage.
  Proposal completion requires Ready for prioritization; delivery completion requires the recorded
  human merge and Validated. Completion stages permit ownership release without authorizing new work.

A plan needs a researcher for proposal development. Delivery needs an independent reviewer after
builders and testers; each assignment binds a distinct worker. UX, security and architecture roles
are selected according to the task. The coordinator supplies the accepted brief and completed
dependency evidence. Installed workers must enforce their role's tools and file scope, use the
proposal/work/approval templates, and return actual evidence rather than assertions of success.

## Recovery And Ticket Decisions

Worker creation and ticket writes persist an attempt before sending. Lost acknowledgements use
owning-service lookup/readback with the same identity. An absent, unavailable or timed-out read
never authorizes replacement. Failed or missing workers require a deliberately revised plan;
restarts retain evidence and next actions. Reservations bind distinct worker/update identities.
A failed or missing observation for the exact interrupted run settles its pending stop and
retains the terminal outcome for replanning. Its reservation settles only after complete
native accounting verifies that its owning session stopped. Observed accounting must include
all specialists before unused capacity can be relied on.

A blocking question enters local awaiting-input before publication. Uncertain publication retains
that wait. Only readback of the exact question followed by a distinct answer from a human in
the installed maintainer policy with unchanged scope resumes work. Answers and merges may come
from any configured maintainer; the original request authority remains bound to its author.
Changed scope requires a new decision; elapsed time is never an answer.
Waiting and review are local team statuses. Keep proposal stage In delivery during unfinished PR
review; Captured/Developing proposal remain private discovery stages.

Evidence is captured against the accepted revision and current Git checkpoint. It declares
`applicability: scope`, `output` or `head` (the default). Scope research and implementation output
retain their original head as historical provenance. Head-sensitive checks become unverified after
code or checkpoint changes. Testers and independent reviewers always supply head-sensitive
evidence; required final gates and acceptance must match the current head. Plans must place those
checks after the changes they assess. Acceptance becomes stale after any head/checkpoint change.
A PR and its private Project
link establish reviewable delivery, not Validated status, merge authority or release readiness.

## Verification And Live Gates

Focused deterministic fixtures cover private intake, duplicate/restarted ownership, concurrent
creation, uncertain send reconciliation, withdrawal/unavailable reads, specialist dependencies,
independent review and head invalidation. Ticket fixtures cover exact destination/author/content
readback, uncertain writes, cancellation and human answer provenance. Native session fixtures
prove whole-team accounting, unsettled reservation refusal and terminal
ownership release. Temporary Git repositories verify dirty/committed checkpoint recovery. CLI
subprocess fixtures exercise intake through one reserved handoff and cheap execution preflight.
They exercise local callback contracts; they do not prove that those callbacks are installed or authenticated live.

Remaining live gates are:

- Authenticated Project access, a verified private destination and installed draft write/readback adapters.
- A human-source reader that distinguishes maintainer decisions from agent writes and binds exact
  proposal revision, selected option, permitted changes, visibility and acceptance criteria.
- Installed worker creation, lookup, checkpoint, role permissions, interruption and accounting
  callbacks with observed identity and recovery evidence.
- Accepted numerical resources and current measured participant usage; fixtures set no live policy.
- An explicitly authorized real idea-to-proposal run, its separately approved delivery, actual
  ticket question/answer recovery and verified PR/preview/Project receipts.

The command executes one operation. [Autonomy rollout](autonomous-builder-plan.md) and Navet
1.0 acceptance require separate scope, authorization and evidence.

## Infrastructure Acceptance Ledger

| Requirement | Deterministic source evidence | Operational evidence |
| --- | --- | --- |
| Private idea intake, sourced proposal and exact destination | `agent-proposal-scope.test.mjs`, `agent-team-delivery.test.mjs` | Live Project proposal unverified |
| Exact human approval; priority/agent writes grant no authority | Planning intake/scope regressions, ticket provenance fixtures | Dedicated human-source authentication unverified |
| Specialist dependencies, ownership and independent review | Coordinator/state fixtures and CLI subprocess handoff | Installed role/tool restrictions unverified |
| Durable creation and write-loss reconciliation | Coordinator, conversation and ticket fixtures | Owning runtime/service receipts unverified |
| Ticket question and same-worker answer continuation | Conversation/resume fixtures, fresh Git checkpoint fixtures | Real ticket answer/resume unverified |
| Withdrawal, unavailable usage and bounded interruption | Coordinator monitor and native accounting fixtures | Live runtime interruption unverified |
| One PR, current preview/criteria evidence and private planning links | Delivery fixtures reject stale/false readback | Live PR/preview/Project aggregate adapter unverified |
| Terminal acceptance and ownership release | Completion fixtures use real task storage and native session JSONL | Human merge and live completion receipts unverified |
| Measured specialist usage within accepted caps | Accounting fixtures cover full inventory and allocation settlement | Dedicated sessions and accepted live policy unverified |

Operational acceptance requires the live gates above. Autonomy rollout and product release
acceptance use their own evidence and authorization.
