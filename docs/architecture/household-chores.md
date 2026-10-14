# Household Chores

Navet chores are an app-owned, provider-neutral household domain. They are not Home Assistant todo
entities and do not expose provider service payloads to shared UI.

## Ownership

- `@navet/core` owns participant, definition, schedule, occurrence, timing, workflow, and activity
  contracts plus deterministic recurrence and workflow transitions.
- `@navet/app` owns shared-workspace synchronization, feature state, and the Household UI.
- NJS owns durable Docker and add-on storage under `/data`.
- the standalone Vite runtime mirrors the same HTTP contract for development and preview.

Provider automations and scripts remain in the existing routines feature. The Household **Routines**
tab is a navigation composition boundary, not a merge of the two command models.

## Scheduling

Definitions support once, daily, weekly, monthly, hourly, and after-completion schedules. Bi-weekly and
tri-weekly choices are weekly schedules with an interval of two or three. A schedule stores an
IANA time zone and local due time. Date ranges, exclusions, every-N-day or every-N-week intervals,
multiple due times, nth-weekday monthly rules, and per-participant weekday/time and due-date offsets deepen that
same model. Assignment stores an explicit ordered participant list independently of manager and
approver capabilities. Optional `rotationCadence` selects `scheduled_day` (the default for saved
chores without the field) or `weekly`. Scheduled-day rotation can preserve its cursor indefinitely
or reset within a week or month. Weekly rotation advances on the local `rotationDayOfWeek`
(0 = Sunday, default 1 = Monday) from the week containing the schedule start date, including empty
or excluded weeks, and ignores `rotationReset`.
`rotationCursor` offsets the first participant in either cadence.
Fair rotation chooses the active participant with the fewest assigned or completed turns; ties use
the ordered list from `rotationCursor`. A person assignment may name active standby participants
for dates when the primary person is paused. Hourly schedules advance by elapsed hours from the
first local start time, while completion-date repeats retain the configured local clock time.
After-completion chores retain one outstanding interval per assignment; everyone assignments
restart each participant's interval independently when they submit completion, including work
awaiting approval. Automatic missed-work skip and carry-forward settings do not replace these
outstanding chores. The latest completed occurrence remains a durable recurrence anchor even
beyond occurrence retention, and retention ages final work from its resolution time.
Fixed schedules continue on their saved dates. When a later scheduled occurrence starts, earlier
available or claimed work becomes missed; submitted work remains awaiting approval. Missed fixed
work leaves Today and remains completable in Progress history without changing future dates.
Occurrence IDs are deterministic from definition, scheduled instant, and assignment slot so repeated
materialization preserves completed state.

Editing a schedule, assignment, or due window discards future unstarted available occurrences and
their undelivered reminders before the next materialization. Past work, claimed work, approval
requests, completed history, and carried-forward work remain intact. Restored definitions validate
rotation cadence and handover weekdays before the workspace is persisted.

Assignment modes are:

- `person`: one selected active participant
- `anyone`: one shared occurrence claimable or completable by an eligible participant
- `everyone`: one occurrence for every selected active participant
- `rotation`: one occurrence assigned by deterministic schedule-day or calendar-week index

Workflow status (`available`, `claimed`, `awaiting_approval`, `done`, `skipped`, or `missed`) stays separate
from timing (`upcoming`, `due`, or `overdue`). Definitions may require an explicit claim, allow an
expired claim to be taken over, and define a missed-work grace period. The storage authority applies
an optional claim-opening window, pending-approval claim rule, and claim reset choice on rejection.
Person pauses can include a return timestamp. Scheduled work assigned during the pause does not
produce overdue or missed events or reminders. A reviewed manager command can move selected,
unclaimed occurrences to consecutive future days while retaining the originals as skipped history.
The storage authority applies missed, automatic skip, or carry-forward rules from durable state whenever it serves the workspace;
the scheduler therefore recovers after a browser or device restart.

## Persistence And Concurrency

The shared endpoint exposes a revisioned document:

- `GET /__navet_chores__/workspace`
- `GET /__navet_chores__/history`
- `POST /__navet_chores__/commands`
- `GET /__navet_chores__/definitions`
- `GET /__navet_chores__/occurrences`
- `GET /__navet_chores__/events`
- `POST /__navet_chores__/actions`
- `GET /__navet_chores__/backup`
- `POST /__navet_chores__/restore`
- `POST /__navet_chores__/reset`
- `POST /__navet_chores__/recovery`
- `POST /__navet_chores__/management/pin`
- `POST /__navet_chores__/management/verify`
- `X-Navet-Chore-Revision` for conditional reads
- `X-Navet-Base-Revision` for compare-and-swap writes
- `X-Navet-Chore-Management-Session` for PIN-unlocked management writes

Every mutation has an idempotent command ID; household actions have a matching activity entry. Materialization
may additionally append one occurrence-created lifecycle event per new occurrence. A stale write
returns `412`; the client loads the newest document, rebuilds the mutation against it, and retries
once. The command journal and activity log detect retries after a partially successful durable
write. Internal materialization and delivery-status bookkeeping use the bounded command journal
without retaining separate audit or outbox records.
An explicit materialization command that leaves occurrences and delivery work unchanged returns
the current revision without rewriting the workspace, history, or journal, even if a client sends
fresh command IDs. Background authorities rebuild the 90-day past/45-day future window once per
UTC day or when definitions or participants change; restart, restore, and recovery invalidate the
window cache. After a settled scheduling pass, the authority retains a disposable in-memory
checkpoint with the next scheduled, due, overdue, missed-work, reminder, participant pause/resume,
delivery-retry, or UTC-day boundary. Reads and background ticks skip scheduling until that deadline
or a workspace change. NJS shares this small checkpoint across request VMs and checks the workspace
and history file identities, sizes, and modification/change timestamps before reusing it. A changed
file, unsupported metadata, clock rollback, or lost checkpoint falls back to normal reconciliation.
The 60-second background timer remains a lightweight wake-up check; unchanged ticks do not hydrate
storage, scan history, or write timer records. A pass that changes domain state remains uncached
until a subsequent pass settles, preserving catch-up after downtime and carry-forward work.
Completing an after-completion chore still creates its next date synchronously.

The workspace revision is the authority. Small workspaces are stored inline. When the hydrated
workspace exceeds 2 MiB, the storage authority writes occurrences, point transactions, progress
awards, reward requests, activity, and delivery work into immutable chunks targeting 256 KiB, with
a 2 MiB hard limit per hydrated chunk to preserve large legacy records. The manifest records each
chunk's SHA-256 identity. Records are written before the manifest is committed; reads verify and
hydrate every referenced chunk before accepting the revision.

Workspace documents, chunks, recovery copies, and immutable history use a versioned deflate
storage envelope when records exceed 32 KiB and compression saves at least 10%. The envelope
records the expanded byte count and SHA-256 checksum. Readers bound expansion before allocating
the decoded payload; NJS preflights the DEFLATE stream because its native inflater has no output
limit. Home Assistant prepares, compresses, and decodes storage in its executor, keeping Store
calls on the event loop. Readers retain support for uncompressed
inline documents and chunk manifests. Public workspace, history, and backup formats remain
complete hydrated JSON; compression does not remove or reorder events or change automation
cursor offsets.

On the first load after upgrading, the authority reconciles obsolete future available
after-completion repeats and removes internal `workspace_materialized` and `outbox_delivery_updated`
records from history, projected activity, and delivery work. Repeated activity IDs retain their
first event; repeated outbox IDs retain a delivered result in preference to pending work. Distinct
action IDs remain distinct even when their descriptions match. Scores, point transactions, reward
requests and goals, badges, progress awards, completions, people, definitions, and recurrence
anchors remain intact. Writes apply the same cleanup so bookkeeping cannot accumulate again.
Recurrence repair computes the next schedule from
completions and retained outstanding work, excluding unprotected future available rows from that
calculation so a stale row cannot validate itself. The healthy recovery copy retains the previous
domain state with the same bookkeeping cleanup. The maintenance marker is committed only after
the recovery copy is written. Interrupted writes can retry the repair; cleaning projected activity
and delivery work advances the workspace revision once, while compression alone preserves it. After a successful write, the
serialized authority collects chunks referenced by neither the current manifest nor its recovery
copy. Failed-file diagnostic snapshots prevent collection when their references cannot be verified.
Core owns the unchanged domain contracts; Docker/NJS, Vite, and the Home Assistant integration own
this storage framing.

Command-journal and event-history files are reconstructable sidecars and cannot take the whole
feature offline. Durable record chunks are authoritative and must be included with the workspace
manifest in filesystem backups. Each successful workspace write
keeps the previous valid document as a last-known-good copy. Reads repair malformed sidecars from
the bounded activity log and automatically restore a malformed primary document from that healthy
copy when possible. The client also reconciles a retryable error by reloading and checking the
original command ID before it offers another write, preventing duplicate people or chores after an
ambiguous response.

If neither the primary document nor its last-known-good copy can be read, the authority returns
structured recovery metadata instead of a generic unavailable response. The Household recovery
surface can retry, restore the healthy copy, or explicitly start over. Start-over preserves the
damaged primary under a failed-file name for diagnosis before creating an empty workspace. Recovery
mutations require the existing management PIN session when the PIN state is readable; a damaged PIN
file can only be cleared through the explicit destructive start-over path.

Occurrence actions enter the domain through `applyChoreWorkspaceOccurrenceCommand`. The browser
sends a typed occurrence action rather than a replacement document; both the Vite and NJS storage
authorities resolve the current definition and active participant, verify the participant capability,
apply the state machine, append the activity entry, and enqueue a delivery-outbox item. Profile,
definition, archive/restore, and occurrence-materialization writes use the same authoritative action
envelope. Materialization accepts a bounded date range and derives occurrences from the authority's
stored definitions and profiles; clients cannot submit occurrence objects or replace the workspace
document.

Schema version 2 adds the delivery outbox. Both storage authorities migrate a valid schema version 1
document before serving it, increment the revision, and persist the migrated representation. The
outbox records delivery work separately from committed household actions.

The same authority schedules before-due, due, overdue, and approval reminders. Reminder IDs encode
the occurrence, reminder slot, and recipient, so a restart can recover elapsed reminder slots
without duplicating them. Participant quiet hours defer `nextAttemptAt`; delivery destination and
acknowledgement remain household-profile policy rather than browser state. In-app reminders are
acknowledged through the normal command envelope. Home Assistant delivery uses the optional
provider-neutral notification method, then commits a delivered or failed outbox result with bounded
exponential retry timing; Home Assistant does not receive ownership of the chore state.
Definitions may also select claim, completion, approval, and missed-work events for recipient
alerts. An alert records the occurrence revision. The authority rejects an action from an older
revision, removes pending alerts when the occurrence changes, and uses the same bounded outbox and
quiet-hour policy for delivery. Home Assistant mobile action IDs are signed with a private
installation key; the event handler checks the signature, recipient capability, and revision
before sending a command to the authority.

The capped workspace activity array is a rebuildable UI projection. Both authorities also append
each unique activity to a separate versioned event-history file. After a changed workspace or
history file, a lost checkpoint, or an elapsed deadline, reads reconcile the current projection into
that file. This closes the normal interrupted-write gap without making unchanged refreshes scan
history or making statistics/export depend on projection retention. NJS hydrates and verifies that
history at most once per synchronous request or scheduler transaction, reusing it during repair,
scheduling, and reconciliation. A committed history write updates the transaction's view. That view is discarded
before another request or an asynchronous notification delivery so concurrent writes and damaged
storage are observed on the next read.

An active manager can choose a bounded immutable-history policy between 30 and 3,650 days and
between 1,000 and 100,000 events. The policy changes through the same command envelope and preserves
append order for meaningful events. Internal history cursor metadata retains original event
positions and the consumed upper bound when cleanup removes bookkeeping or duplicate IDs, so
existing automation cursors neither skip retained events nor replay them. New events advance
from that upper bound; public history and backup events do not expose the cursor metadata.
The Household review surface reads immutable
history, provides 7- and 30-day household/profile views, builds the weekly report, explains workload
imbalance without changing assignments, and exports filtered history as JSON or CSV.

The automation read surface lists definitions and bounded occurrence projections without exposing
the mutable workspace document. The action endpoint is a stable alias for the same authoritative,
revisioned command envelope. The event endpoint is an append-only cursor feed of occurrence-created,
due, overdue, claim, completion, approval, rejection, skip, reopen, reassignment, and missed events.
Household setup and configuration actions remain in audit history; internal scheduling and
delivery-status bookkeeping are discarded. Lifecycle timing
events use deterministic IDs and the authority reconciles them against immutable history, so a
restart does not duplicate them after the capped workspace projection rolls forward.

The workspace is bound to the persistent Navet installation and workspace identity. Normal routes
require an authenticated HttpOnly browser session for a supported provider. Add-on Ingress uses its
explicit trusted-headers handler. Mutations require strict same-origin requests.

The optional household management PIN is installation-owned security state stored separately from
the public chores document, immutable history, and backups. The authority stores only a salted PIN
hash. Successful verification creates a short-lived, browser-memory management session. Once a PIN
is configured, both storage authorities reject participant, definition, experience, retention,
restore, and reset writes without that session; ordinary occurrence completion remains available.

## Backup, Import, And Workspace Semantics

The versioned `navet.chores` interchange document contains one workspace and its immutable events.
Restore supports explicit merge and replace modes. Merge deterministically remaps participant,
definition, occurrence, and event ID collisions; imported outbox work is never replayed. Reset
requires an active manager, the current base revision, an idempotent command ID, and the exact
confirmation phrase. The UI accepts Navet backups, documented Home Assistant todo export objects,
and normalized ChoreOps export objects after validating every required field.

The optional multi-workspace directory contract is separately versioned and installation-owned. It
defines an explicit active workspace, embeds a complete backup per workspace, rejects data from
another installation, requires exact deletion confirmation, and never permits deletion of the final
workspace. Device-local presentation and browser credential sessions remain outside this directory.

## Home Assistant Projection

Home Assistant remains an optional projection, not the owner of chores. `@navet/core` builds one
bounded summary snapshot with due, overdue, approval, completed-today, and next-occurrence details.
`@navet/provider-homeassistant` publishes that snapshot as a `navet_chore_projection` event. The
Navet custom integration exposes one summary sensor backed by rich attributes, rather than one
entity per internal field.

Home Assistant publishes a bounded chores calendar beside the summary sensor. Actions
`navet.claim`, `navet.complete`, `navet.approve`, `navet.reject`, `navet.skip`, `navet.reopen`,
`navet.reassign`, `navet.reward_decision`, and `navet.adjust_points` route to the same authority
used by the UI. The authority verifies revision, participant, assignment, capability, manager
policy, and stable command identity. Reward decisions and point adjustments use Home Assistant
admin services, permitting administrator accounts and system automation contexts. `navet.weekly_report` returns Markdown or HTML for an
automation to deliver on its own schedule. The authenticated Navet HTTP action API provides the
corresponding unattended boundary for standalone deployments.

## Optional Motivation Domain

The workspace's versioned experience state owns the optional `off`, `light`, `family`, and
`adventure` presentation modes, per-chore time/point/child labels, optional icon and colour
overrides, missions, reward goals, and earned participant balances. Without an override, the UI
uses a stable hash of the chore definition ID to choose from twelve non-semantic card palettes;
category, icon, and dashboard accent do not affect that choice. Overdue red and completed green
remain semantic UI state and take priority over presentation metadata. Stored colour overrides are
validated six-digit hex values and travel with the versioned experience document and chores backup.

Balances are awarded only when an occurrence first becomes final (after
approval when required), reverse when final work is reopened, and remain durable when old occurrence
rows are pruned. Existing experience documents without balances derive their starting snapshot from
retained final occurrences before the next experience mutation. A mission's shared bonus is awarded
once when its final required chore completes; the awarded mission ID is retained so reopening and
re-completing work cannot duplicate the household reward.

Each participant has a provider-neutral point-history projection built from automatic completion
and reopen deltas, manager-authored manual adjustments, and reward decisions. The experience state
holds an immutable point transaction for every balance change and reward decision. Manual adjustments require a non-zero
whole-number delta within 10,000 points and accept an optional reason. They can leave balances
negative and remain in activity history without entering the public automation event feed. When a stored balance
predates detailed point activities, the projection exposes the difference as one synthetic earlier
balance instead of inventing chore-level history.

Reward goals show savings progress. A participant can request an enabled reward when they have its
cost in points; requesting does not spend points. The request records the reward title and cost at
that moment, so editing or deleting the goal does not alter an existing request. A manager approves
or declines it. Approval spends the saved cost once, fulfillment records delivery, and a refund
returns the spent points once. Decisions use the same revisioned and idempotent command path as
other household actions. Badges and achievements share the versioned experience document; their
durable awards are distinct from reward requests. Progress is calculated from final occurrences and
immutable point transactions. A missed due day resets a due-day streak; a day without scheduled
work does not advance or break it. Award IDs contain the target, participant, and cycle key. Optional
award points create one transaction per award. Weekly cycles start Monday in UTC; monthly cycles use
the UTC calendar month. A later reopen does not remove an earned award, and replaying a completion
does not award it again.

## Identity Boundary

Household participants are workflow profiles, not authenticated accounts. Selecting a participant
attributes an action and applies household assignment or approval policy; it does not prove who is at
the screen. Account authentication protects access to the installation-level shared workspace and
its automation API. The participant included in an action remains attribution, not authorization.

The management PIN adds a household-screen authorization boundary on top of the authenticated
installation session. It prevents someone using a shared Navet screen from changing the household
plan while leaving assigned chore actions available. It is not an account identity and is not
exported with household data.

The first participant must be a manager. Active managers authorize profile and definition changes,
and the authority rejects profile updates that would leave the household without an active manager.
If legacy or damaged data contains no active manager, an active participant may make one profile a
manager as an explicit recovery path; that exception cannot be used for other management actions.

Archive, skip, reopen, and reassignment are manager actions. Skip, reopen, and reassignment require a
non-empty reason, which is retained on the activity entry; reassignment also records the previous and
new assignees. Manual point adjustments may include an optional reason, which is retained when
provided. A configured approver can approve or reject normally. An active manager outside the
approver list may override that decision only by declaring the override and supplying an audited
reason.

## Runtime Limits

Standalone Docker and the add-on provide a native chore workspace for authenticated Home Assistant,
Homey, and openHAB sessions. The Home Assistant custom panel uses the Navet custom integration
authority. Each runtime stores chores at installation scope; optional provider projections expose
a summary without owning the workspace.

Completed and skipped occurrences older than 90 days are pruned during materialization. Unfinished
work is retained. Materialization accepts at most 180 days and creates at most 5,000 new occurrences
per definition in one request; retained occurrences do not consume that creation allowance.
Point transactions and earned award identities have no age-based pruning. Immutable storage chunks
are retained, including those referenced by the last-known-good revision, so recovery preserves
accounting and replay protection. Activity is
capped at 5,000 entries in the client document, immutable event history uses the manager-selected
bounded policy (730 days and 50,000 events by default), and the idempotency journal retains the most
recent 500 commands.
