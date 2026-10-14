# Household chores data control

Status: design confirmed by the maintainer on 14 October 2026; not implemented.

This design adds household data controls to **Chores → Settings**. The first release focuses on
understanding stored data and safely reducing it while preserving ongoing chore behavior and
earned progress. Design confirmation does not establish implementation or rendered acceptance.

Current storage behavior remains documented in [Household chores](household-chores.md).
Domain terms live in the [glossary](../../GLOSSARY.md). The preservation decision is recorded in
[ADR 0001](../adr/0001-preserve-chore-behavior-and-progress-during-history-cleanup.md).

## Settings surface

Add **Data and history** using the existing chores settings and confirmation patterns.

| Control | Behavior |
| --- | --- |
| Storage usage | Show total stored size, category breakdown, record counts, history date ranges, and recovery storage where measurable. Distinguish measured values from estimates. |
| Clean up history | Choose a date and preview household-wide deletion before confirming. |
| Automatic cleanup | Off by default. Offer 90 days, 1 year, 2 years, or a custom duration. |
| Export backup | Reuse complete backup export, including an optional export before cleanup. |
| Reset chores | Keep full reset clearly separate from history cleanup. |

Existing settings already offer backup export, import, and reset. This design extends those
controls rather than replacing them. Storage information is installation-owned and remains
local; this feature does not introduce external data collection.

The overview explains where chores data is stored and what is taking up space. Measured stored
size and logical or estimated category sizes must be labeled distinctly: compression, shared
chunks, and recovery copies mean category estimates need not sum to physical storage usage.
Unavailable measurements must not appear as zero. Cleanup savings are estimates until the
operation completes and storage usage is refreshed.

## Cleanup eligibility and preservation

Cleanup covers eligible older activity, completed or skipped chore records, and detailed point
transactions. Age follows the work's resolution time or the transaction/activity timestamp,
rather than the original scheduled date. Completing an old chore today must not immediately make
it eligible for deletion.

Cleanup preserves:

- People, chore definitions, assignments, and settings.
- Current work, pending approvals, and missed work that remains available for late completion.
- Next due dates, recurrence anchors, and existing fair-rotation behavior.
- Point balances, earned rewards, achievements, and progress, including the information needed
  for their existing calculations.
- Existing obligations, including refundable reward requests, and protection against issuing
  earned awards again.

Required summaries or supporting records remain even when older visible detail is removed. The
preview explains what remains and why. Cleanup must not convert missed work into resolved work
or remove it solely because it is old.

The current implementation still derives some progress calculations and fair rotation from
occurrences. Point progress summaries alone do not preserve every behavior. Delivery must retain
the necessary evidence or add compatible summaries before deleting their source detail. Such
summaries must preserve existing calculation rules, including their existing windows; cleanup
does not redefine fairness or turn windowed progress into lifetime progress.

## Manual cleanup

1. A manager chooses **Delete history before** a date.
2. The preview shows deletion counts by category, estimated storage savings, the cutoff, and
   records or summaries that remain.
3. Offer **Export backup** without requiring it.
4. Explain that removed detail will no longer appear in history or detailed exports, and that
   Navet has no undo. Confirm with **Delete history**.
5. Show the completed result and refreshed storage usage.

Restoring a previously downloaded backup can reintroduce removed history. Export performed
after cleanup contains the retained state, not the removed detail.

Deletion must remain within the confirmed scope despite concurrent household changes. If the
preview can no longer describe the proposed deletion accurately, refresh it before confirmation
rather than deleting additional unreviewed data. Failed or retried cleanup must preserve current
behavior and earned progress, and must not be reported as successful before the current and
recovery state consistently satisfy the cleanup result.

## Automatic retention

Automatic cleanup is disabled by default. A manager can choose one household-wide age limit:
90 days, 1 year, 2 years, or a custom duration. It uses the same eligibility and preservation
rules as manual cleanup.

Enabling cleanup or shortening its duration shows a deletion preview and requires confirmation
before applying the policy. Offer the same optional backup export. Subsequent runs follow the
confirmed policy without prompting, including catching up after downtime; they must not depend
on an open browser.

Existing built-in history limits continue to apply. Disabling this new cleanup policy does not
mean retaining everything forever, and selecting a longer duration cannot restore previously
removed detail. Explain that relationship alongside the retention controls rather than
promising a minimum amount of available history.

## Access and recovery

Use existing manager permissions and management PIN protection when configured. Selecting a
household person is not account authentication; retain the existing installation/session
authorization boundary.

Cleanup removes the selected detail from Navet-managed recovery copies while retaining a usable
recovery state. Recovery must not bring the deleted detail back. Downloaded backups and external
system backups remain outside Navet's control.

## First-release boundaries

The controls apply to the whole household. The first release excludes per-person or per-chore
cleanup, individually selected records, chore performance analytics, and new export formats.

Use the owning storage authority across Docker/add-on, the Home Assistant custom panel, and the
development/preview runtime. Storage representation or provider differences must not weaken the
cleanup promise or imply unsupported measurements.

## Acceptance

- Across supported chores runtimes, cleanup preserves current work, recurrence, existing
  rotation behavior, balances, reward/refund obligations, earned identities, and progress.
- Previews identify eligible records accurately, explain retained data, and label size estimates
  honestly. Confirmed deletion covers the selected scope without silently extending it.
- Current and recovery copies consistently exclude deleted detail; failed, interrupted, retried,
  and concurrent operations cannot lose preserved state or replay awards.
- Automatic cleanup starts disabled, confirms enabling/shortening, respects its policy after
  downtime, and makes existing retention limits clear.
- Existing backup export/import remains compatible; export before cleanup can support deliberate
  restore, while export after cleanup excludes deleted detail.
- Manager and configured PIN boundaries remain enforced.
- Automated checks cover the affected behavior. The maintainer manually reviews the rendered
  settings and confirmation flow at relevant screen sizes and supported themes using the existing
  chores settings/data-recovery surface as the primary reference. Rendered acceptance remains
  pending until that review.
