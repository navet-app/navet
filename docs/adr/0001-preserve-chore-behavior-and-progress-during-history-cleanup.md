---
status: accepted
date: 2026-10-14
---

# Preserve chore behavior and earned progress during history cleanup

Household chores history contains both removable detail and information still needed for
recurrence, fair rotation, progress, balances, rewards, refunds, and protection against repeated
awards. Cleanup may remove eligible older detail, including activity, completed or skipped
occurrences, and detailed point transactions, only while retaining the summaries or supporting
records needed to preserve existing behavior and earned progress. The maintainer confirmed this
design on 14 October 2026; implementation is pending.

Keeping all detailed history would prevent meaningful storage reduction, while deleting by age
alone could change ongoing household work or erase earned progress. Restricting cleanup to audit
activity would leave other growing history untouched. We accept that cleanup removes the ability
to inspect or export deleted detail in exchange for reduced storage, without changing current
behavior or earned progress.

## Consequences

- Required supporting records can survive the cutoff; cleanup is not a promise to erase every
  older record. The preview explains retained data.
- Existing summaries do not preserve every calculation. Delivery must retain the missing evidence
  or add compatible summaries before removing source detail, without redefining existing rules.
- Navet-managed recovery copies must reflect deletion so recovery cannot restore removed detail.
  Previously downloaded or external backups remain outside Navet's control.
- Confirmed cleanup has no in-product undo. A previously exported complete backup can deliberately
  restore older detail.

The [confirmed design](../architecture/household-chores-data-control.md) owns the controls,
eligibility rules, retention behavior, permissions, and acceptance criteria.
