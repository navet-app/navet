# Navet household chores

Language for household chores data control.

## Language

**Chores history**:
Records of past household work and activity. Some historical information remains necessary to preserve ongoing chore behavior and earned progress.

**Eligible chores history**:
Older activity, completed or skipped chore records, and detailed point transactions that can be removed without changing current household work, ongoing chore behavior, or earned progress. Missed work that can still be completed and information needed to honor existing obligations are not eligible.

**Earned progress**:
The points, achievements, and rewards a household has earned through chores. Removing older history detail does not erase that progress.

**History cleanup**:
Removal of eligible older chores history while preserving people, chore definitions, settings, current work, ongoing chore behavior, and earned progress.
_Avoid_: Reset chores

**Automatic retention**:
A household's chosen limit on how long eligible chores history is kept. History beyond that limit is cleaned up without another manual deletion request.

**Chores recovery copy**:
A Navet-managed copy of household chores data used to recover from a storage problem. History removed by cleanup is also removed from recovery copies.
_Avoid_: Exported backup
