# Idea Proposal Template

Use this template in the authorized idea hub. Fill only relevant sections, mark unknowns explicitly,
and keep confidential evidence in access-controlled storage. This repository copy is a schema,
not a storage location for confidential proposals.

## Choose The Detail Level

Keep the ticket readable in one pass. Detail follows uncertainty, user impact and the decision
needed. The sections below are available for fuller proposals, not mandatory fields in every
description. Keep execution IDs, receipts and agent progress in the existing private task record.

- **Small bug:** a short description of the user impact, reproduction steps or exact source
  evidence, actual and expected behavior, the smallest proposed repair and an acceptance check.
  Usually 100–200 words is enough. Add a risk or unknown only when it affects the fix. A known
  defect with an obvious repair does not need external research, alternatives or a prototype.
- **Bounded UX improvement:** explain the friction, evidence, recommended change and acceptance
  checks. Usually 200–400 words is enough. Include an alternative, sketch or effort estimate
  only when it helps the maintainer decide.
- **Exploratory or cross-cutting proposal:** use the relevant fuller sections below for options,
  research, interaction design, dependencies and compatibility risks. Lead with a short decision
  summary; link detailed research or retained artifacts when they would overwhelm the ticket.

These lengths are guides, not truncation limits. Keep essential reproduction and safety evidence.
Separate source-backed findings from rendered reproduction; name any missing verification.
Omit empty headings and repeated boilerplate. Updates state only a useful new result, blocker,
decision or delivery link rather than repeating the description or narrating agent activity.
Preserve human-authored context and decisions when updating an existing ticket. Any later
implementation approval must still identify the exact revision, selected scope and criteria.

## Record

- Stable ID and revision:
- Title and category: product opportunity / UX defect / design-system improvement
- Status, owner, and proposed priority:
- Next action, blocker, and next review date (when waiting):
- Visibility and permitted audience:
- Target journey and maturity milestone:

## Problem And Benefits

Describe the household problem, affected users, recurrence, evidence and sources, current behavior,
benefit, expected outcome, and success measure. Distinguish observation from hypothesis.

## Workflow

Describe entry, primary action, resulting state, secondary actions, recovery, and relevant
loading/empty/error/unavailable states. Include responsive and input differences when relevant.

## Options And Design Evidence

Compare the smallest useful solution, other credible options, and current behavior. Explain the
recommended choice and tradeoffs. Attach an annotated sketch, flow, or existing/reference screenshot.
Add a high-fidelity option or primitive-based prototype when needed to judge visual decisions.
Mark design evidence as not applicable for a nonvisual proposal and explain why.

Name the existing Navet reference, primitives, tokens, and recipes to reuse or extend. Keep all
confidential design artifacts private.

## Delivery Plan

List small implementation slices, owning modules, dependencies, compatibility and provider risks,
estimated effort range, acceptance criteria, verification matrix, and documentation impact.
Identify unanswered questions that affect scope or approval.

## UX Finding Evidence

For a defect, record source commit/build, route or story, viewport, theme, input mode, data state,
reproduction steps, actual/expected result, screenshots or measured geometry, violated reference,
severity, confidence, shared cause, and affected consumers. Include retest evidence after repair.

## Prioritization And Decision

Lead with the decision requested and a short reason for the proposed priority. For material
work, state the time appetite or effort range and what would make the proposal ready to select.

Explain user impact, recurrence, evidence confidence, 1.0 relevance, effort, and dependencies.
Record the maintainer's selected option, approved revision and scope, acceptance criteria,
approval identity/time, public visibility decision, and delivery links. Priority alone is not approval.
