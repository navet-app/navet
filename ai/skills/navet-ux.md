# Navet UX

Read this file before changing dashboard layout, card behavior, section composition, settings,
dialogs, navigation, or visual hierarchy. It is self-contained for ordinary UI work. Open
[`AI-DESIGN-CONTEXT.md`](../../docs/design-system/AI-DESIGN-CONTEXT.md) only when creating or
replacing a visual recipe. Open the [brand system](../../docs/branding/README.md) or
[product card grammar](../../docs/branding/CARD_GRAMMAR.md) only when the task changes those
foundations.

## Design From Evidence

Before writing JSX or styles:

1. Discover the closest same-family card or surface, primitives, patterns and foundation tokens
   through the [design-system registry](../../docs/design-system/REGISTRY.md). Inspect canonical
   imports, actual Storybook IDs, catalog level, owner, review status and executable references.
   Only maintainer-approved product compositions establish accepted guidance; draft/pending
   examples need same-family rendered review. Unsupported compositions use the
   [composition guide](../../docs/design-system/AGENT-COMPOSITION-RECIPES.md) and record gaps.
2. Inspect the exact screen and the components that currently render it.
3. Name one primary Navet reference and, when useful, one supporting reference.
4. Inspect the nearest primitive or pattern: imports, props, slots, sizes, states, tokens and
   theme helpers, together with its Storybook story.
5. Write a compact intent note: information priority, primary action, density, responsive change,
   and the one visual detail that makes the surface recognizably part of Navet.
6. Decide whether the work reuses, extends, or intentionally replaces an existing recipe. Record coverage gaps. A new visual pattern needs explicit maintainer approval before
   implementation; new arrangements of existing primitives may reuse their established contracts.

Reference order:

1. The same component family and its immediate neighbors on the target screen.
2. Home for dashboard outer spacing, section rhythm, summary-bar spacing, card-grid density, and
   responsive behavior.
3. The relevant shared primitive or pattern story.
4. UI-kit recipes and token stories.

Do not treat a marketing page, an isolated experimental story, or a generic design trend as a
dashboard reference.

## Product Direction

Navet is an operational smart-home surface. It should be:

- glanceable: live state and exceptions are understood before decoration
- compact but calm: useful density with clear grouping, not crowded controls
- direct: the common household action is obvious and available without entering edit mode
- tactile: controls read as controls on touch screens without depending on hover
- recognizably Navet: rounded, theme-native surfaces; restrained accent; strong live-state
  hierarchy; and consistent card geometry

"Premium" is an outcome of alignment, restraint, typography, state clarity, and interaction
quality. It is not permission to add glass, gradients, large hero copy, decorative charts, or
empty space.

## Hierarchy And Composition

- Start with content and state: identity, current value, exception, primary action, then secondary
  detail and settings.
- Preserve the target screen's existing outer shell and spacing mode. Do not add a feature-local
  max-width, page padding, or centered container to a dashboard section.
- Match Home's responsive rhythm when creating or reshaping a dashboard section: compact mobile
  spacing, denser card grids, and increased section separation at larger breakpoints.
- Prefer one clear surface over a card inside a panel inside a section card.
- A section heading should organize content, not become a decorative hero.
- Keep compact cards single-purpose. Put configuration and secondary controls in the established
  dialog or sheet pattern.
- Use existing card sizes and make every supported size an intentional layout, not a clipped
  desktop composition.

## Interaction And Copy

- Use Navet's shared interaction scale for focusable controls: 36 px compact minimum, 40 px
  standard, and 42 px only when extra separation or emphasis is genuinely needed.
- Treat 42 px as the ceiling for ordinary icon and single-line controls; content-rich rows and
  gesture surfaces may be taller only when their interaction genuinely requires it.
- Do not rely on hover, color alone, or motion alone to reveal state or affordance.
- Keep focus-visible and reduced-motion behavior when extending shared controls.
- Use progressive disclosure for configuration; do not hide useful live state behind it.
- For card-dialog advanced controls, reuse `DeviceControlRow` and `DeviceControlOptions` from
  `components/shared/device-editor`. Keep the main device value and segmented operating choices
  first. Use `DeviceTargetControl` for a labelled setpoint beside existing adjustment buttons,
  followed by the current reading and status. Climate and humidifier dialogs use
  `BaseCardDialog.mobileFitContent` to avoid reserving phone-sheet space for decoration.
  Secondary rows show the current value and expand their own editor. Single-choice option lists
  compose `SelectableRadioList` and `SelectableRadioRow`; checkbox rows are for independent
  selections. Boolean controls use
  an inline switch, and readings have no interactive affordance. The feature determines whether
  provider options are genuinely boolean and owns commands, pending/error states and validation.
  Keep editors mounted while collapsed to preserve drafts. The climate dialog is the first
  consuming reference (`cards-entity-climate--advanced-dialog-supported`); rendered maintainer
  acceptance remains pending.
- Use sentence case, short household language, and the existing translation system.
- Do not invent explanatory subtitles, status labels, badges, or calls to action merely to fill a
  composition. Every visible line must help the user understand state or act.
- Uppercase is an exception for established eyebrow tokens, external identifiers, and short
  technical codes; it is not a default heading style.

## Themes And Visual Treatment

- Preserve the theme model: `glass`, `dark`, `light`, `black`.
- Resolve surfaces, readable text, focus, controls, spacing, and motion through shared helpers
  before writing feature-local classes.
- Only `glass` uses frosted or translucent card treatments. `dark` and `black` remain dark-surface
  families; `light` remains a light-surface family.
- Layer accent through a shared tint, border, glow, icon, or text emphasis. Do not replace the
  current theme or lane surface with a one-off material recipe.
- Neighboring cards inherit the same surface family and geometry before expressing different
  semantic states.
- Do not introduce a new font, base type scale, palette, radius system, shadow language, or page
  shell unless the task explicitly redesigns that foundation.
- Use motion to explain state change or spatial continuity. Avoid ambient animation and expensive
  effects on always-visible or frequently updating surfaces.

## Architecture

- Shared UI consumes normalized Navet state and provider-neutral view models.
- Reuse current primitives from `packages/app/src/components/primitives/` and patterns from
  `packages/app/src/components/patterns/` before creating feature-local equivalents.
- Treat those app-owned paths as current authoring seams; do not move a component to `@navet/ui`
  unless provider-neutral extraction is part of the task.
- Keep provider payloads, service calls, and feature-specific state outside generic visual
  primitives.

## Review Before Handoff

Review the result against the named reference, not only against the request:

- normal, active, unavailable, loading, empty, and error states that the feature supports
- smallest and largest supported card sizes or viewport widths
- `glass`, `dark`, `light`, and `black`, including readable accent states
- touch, keyboard focus, reduced motion, and no-hover use
- realistic long names, translated copy, missing artwork, and missing optional data
- high and reduced effects quality when visual effects are involved

Compare rendered output with the named reference. Discovery preserves review status; structural
checks establish neither rendered acceptance nor design fidelity. If a visual review surface is
available, inspect it and correct visible hierarchy, overflow, alignment and theme mismatches
before calling the work complete.

For small UI-only tweaks, run the closest focused validation, usually a targeted Storybook test,
`pnpm check:stories`, or `pnpm test <path>`, and inspect the rendered state. For broader or
responsive UI work, follow `docs/agents/commands.md`, use the smallest routeable validation that
covers the change, and run `pnpm test:visual-review` when shared layout or overflow can change.

Record reproducible rendered findings with the affected surface, interaction, observed result
and expected behavior. Retest repairs within the accepted task scope and record actual coverage.
