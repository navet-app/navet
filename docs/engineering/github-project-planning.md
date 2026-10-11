# Private GitHub Project planning

Current planning and access contract. For interactive requests, use the matching
[request workflow](request-workflows.md); for coordinated execution, use the
[team workflow](agent-team-workflow.md). Product scope requires an authenticated maintainer decision.


Use the organization-owned **Navet planning** Project with private visibility. Organization
visibility and Project visibility are independent. Verify the exact owner, Project and private
setting before reading or writing proposal material. A draft belongs to the Project and needs no
repository. Linked repository issues retain their own visibility.

Create a draft from the [proposal template](templates/idea-proposal.md), using only sections the
problem needs. A small, understood defect needs evidence, expected behavior, the smallest repair
and an acceptance check. Research, options and prototypes support uncertain or material decisions.
Check active and archived drafts for duplicates first. Use Proposal stage for the decision flow:

```text
Captured -> Developing proposal -> Ready for prioritization -> Approved -> In delivery -> Validated
```

Needs evidence, Deferred, Rejected and Superseded are dispositions. Status tracks work progress;
Priority ranks work. Neither field nor an agent-authored note authenticates approval. Imported
history records previous authors and dates as quoted source evidence, not new GitHub approvals.
Keep confidential screenshots, logs and prototypes in access-controlled durable storage. Verify
artifact access separately; a cache is not a backup.

Drafts do not have issue comment threads. Retain concise research results, questions, verified
answers and decision history in the draft body, preserving previous evidence. Ask the maintainer
in the active Codex conversation when blocked and record the authenticated answer against the
exact scope. Do not infer answers from elapsed time or agent-authored content.

For implementation, bind a direct maintainer instruction to the selected option, complete draft
revision, permitted changes, acceptance criteria and explicit public visibility. Prepare a
separate public issue containing only the approved delivery brief; keep private research and
conversation history in the draft. Link the issue, PR, validation and outstanding questions back
to the private draft. Keep In delivery during unfinished review. Validated requires the accepted
criteria and maintainer acceptance of the delivered head.

## Planning routine

Keep one private proposal per problem or opportunity. Link related feedback and duplicates to
that record. Break an approved cross-area effort into delivery slices only when each slice has
an owner and independently checkable outcome; retain the parent decision and dependencies.
Small defects keep the short proposal format.

### Fields and views

Use **Proposal stage** for decisions, **Status** for activity and **Priority** for relative order.
Keep one accountable owner, the next action, any blocker and the next review date in the draft
body. Reuse Assignees where useful; add custom fields only when a saved view needs them. Source
ID, Source status and imported Tags preserve history; historical stage tags never override the
current Proposal stage. Do not rename its options: the planning reader depends on them.

Arrange these saved views in workflow order. Each filters a different Proposal stage, so an
item appears in one of these views at a time:

| View | Filter | Purpose |
| --- | --- | --- |
| Intake | `proposal-stage:Captured` | Deduplicate feedback and select the next problem to develop |
| Developing proposals | `proposal-stage:"Developing proposal"` | Research and shape selected problems into decision-ready proposals |
| Needs evidence | `proposal-stage:"Needs evidence"` | Questions and missing evidence, each with an owner and next action |
| Decisions | `proposal-stage:"Ready for prioritization"` | Maintainer decisions on shaped proposals |
| Delivery board | `proposal-stage:Approved,"In delivery"` | Group selected delivery by Status; inspect criteria and PR evidence before completion |

Check each saved filter against known matching and excluded items. An empty delivery view is
valid when no work has selected-scope approval. Keep Deferred records available through search
or a temporary filter and retain completed records in the archive after acceptance and link
readback. Filtering a view does not change access to its items.

### Ready for a decision

Before Ready for prioritization, the proposal needs a clear problem, supporting evidence,
recommended bounded change, checkable acceptance criteria, material dependencies and open
questions. Name the decision requested. Include a rough effort range or time appetite when it
helps compare options; unknown effort stays unknown. Needs evidence names the missing fact and
how to obtain it. A priority or stage change never supplies missing approval.

Rank candidates using household impact, recurrence, evidence confidence, relevance to the
existing product goals, dependencies and effort. Write a brief reason for the proposed priority.
Community reactions are one signal; avoid automatic vote-based ranking or invented score precision.
The maintainer selects the order and scope. Prefer finishing or unblocking active work before
starting another delivery slice; start with one active slice per owner and adjust to actual capacity.

### Weekly review

Use a short maintainer review each week while work is active; this guidance creates no scheduler.
Review in this order:

1. **Acceptance:** inspect delivered work, outstanding criteria and maintainer acceptance. Link
   the accepted head and evidence before Validated; archive only after verifying retained links.
2. **Delivery:** inspect active PRs and dependencies. Record the blocker, accountable owner and
   next action. Finish or unblock work before pulling more into delivery.
3. **Decisions and evidence:** decide shaped proposals and answer the questions that prevent
   decisions. Record selected scope against the exact revision through the existing approval flow.
4. **Intake:** merge duplicate signals into the original proposal and select a small amount of
   research that fits available capacity. Do not fully shape the entire backlog.
5. **Deferred work:** revisit items whose review date has arrived. Record why they remain deferred,
   need evidence, are rejected or are superseded, and retain useful history.

End with a short private note naming decisions, blockers and next actions. Set the next review
date when an item waits; age alone does not reject it or grant approval. Review the backlog monthly
for obsolete scope and duplicates. Measure decision wait, delivery time and repeated blockers
from actual dates when available; leave missing measurements unknown.

### Automation boundaries

Built-in workflows may organize Status for linked issues and PRs. Keep **Auto-close issue** off:
changing a Project field must not close a repository issue. Issue closure or PR merge may set
Status to Done, but neither sets Proposal stage to Validated. The weekly acceptance review must
still inspect Done records in Delivery board until acceptance is complete. Keep Proposal stage manual
and preserve the authenticated approval and current-head acceptance requirements.

Do not automatically convert private drafts to public issues, advance approval/validation stages,
archive unaccepted work or activate the execution queue. Native issue/sub-issue relationships
belong to approved public delivery; private draft bodies link their own dependencies. Add dates
or a roadmap view only for an actual planning need; target dates express expectations and require
review when scope changes.

### Research behind this routine

These primary sources were reviewed on 2026-10-10. The Navet practices above are adaptations
for a small maintainer-led project; they are not claims about these teams' effectiveness or
unpublished processes. Some board contents require sign-in or do not render in public fetches.

| Project | Documented GitHub Projects practice | Navet adaptation |
| --- | --- | --- |
| [Home Assistant / Open Home Foundation](https://github.com/OpenHomeFoundation/roadmap#-roadmap-process) | Community requests feed curated opportunities; approved opportunities enter project boards and delivery work | Link feedback to one shaped proposal and retain a separate approved delivery brief |
| [Wagtail](https://github.com/wagtail/roadmap#roadmap-reports) | Curates significant roadmap items and uses Project reports for releases and sponsorship | Use focused views of one item set; add release grouping only when needed |
| [Rust async working group](https://rust-lang.github.io/wg-async/triage.html#triage-process) | Reviews completed, active, blocked and claimed work before new intake | Review acceptance and blockers before starting more work; this is a documented group practice, not a verified current schedule |
| [GitHub public roadmap](https://github.com/github/roadmap#roadmap-stages) | Uses a Project board for expected shipping horizons and states that plans can change | Treat targets as expectations and review them when scope changes |

[VS Code issue tracking](https://github.com/microsoft/vscode/wiki/Issue-Tracking#iteration-planning)
also documents issue-based iteration plans and separate verification queues. It is a useful
adjacent example, rather than evidence here of a current Projects board configuration.

### Project access and scope

GitHub CLI must be authenticated with Projects access (`project` for updates, `read:project` for
reads). Keep the exact organization node ID/login, Project node ID, authenticated viewer node ID
and `stageField: "Proposal stage"` in an owner-private JSON configuration outside Git. Configure
these identities from trusted service discovery, not proposal content. Read privately with:

```sh
node scripts/agent-github-project.mjs /absolute/private/github.json list
node scripts/agent-github-project.mjs /absolute/private/github.json read /absolute/private/item.json
```

The read input is `{ "itemId": "<Project item node ID>" }`. Command output contains private
proposal bodies; keep it out of public logs. The reader verifies owner, visibility and viewer,
requires complete fields and two stable bounded reads, and normalizes draft content and lifecycle
into the existing planning observation contract. `issueId` is the Project item node ID, `teamId`
is the organization node ID, and `projectId` is the Project node ID. The SHA-256 binding covers
complete title, body and references; mutable stage and priority are separate observations.
Archived, Rejected and Superseded drafts withdraw execution scope. Missing fields, changed
content, pagination uncertainty and lost access fail closed. Re-read before execution.

Private proposal intake uses `resultDestination: github-project-proposal` and an exact destination
`{ kind: "github-project", issueId, teamId, projectId }`, with research mode and independently
verified `maintainer-idea-request` authority. Captured/Developing proposal permit requested
research only. Delivery intake requires a new independently authenticated human request naming
`authority.planningRevision`; a Project field cannot supply that request.

Interactive skills can use authenticated GitHub UI/API to create and update drafts, then read back
the exact content, fields and access. Reconcile uncertain writes by the existing item/request
identity before retrying. GitHub draft edits have no atomic revision precondition: re-read before
editing, preserve concurrent edits and verify afterward. The repository reader performs no writes.

Automatic Project approval intake, draft question/answer publication, remote withdrawal, worker
dispatch and completion require installed adapters and an authorized live pilot verifying human
provenance, exact revisions, reconciliation and recovery. The Project reader verifies scope; local
tests verify contracts. Task records retain their bound authority, request identity, revision and
receipt meaning across upgrades. See the [team acceptance gates](agent-team-workflow.md#infrastructure-acceptance-ledger).
