# Navet UI Guidelines

This document describes the current visual and interaction rules for Navet's shared UI.

The [Navet brand system](../branding/README.md) owns durable identity. The
[product card grammar](../branding/CARD_GRAMMAR.md) defines how the demo and product cards express
that identity; this guide owns their implementation rules.

Architecture note:

- `@navet/ui` is the target provider-neutral shared UI package boundary.
- The app-owned paths below are the current implementation surface for most shared UI and token
  work while that extraction continues.

## Product Goals

Navet should feel:

- glanceable on wall panels and tablets
- dense enough for real smart-home state
- deliberate rather than generic
- consistent across cards, settings, dialogs, and section views

These are observable qualities, not prompts to invent a style. In particular, "premium" means
precise alignment, restrained effects, legible state, and dependable interaction. It does not mean
more glass, gradients, shadows, hero copy, or whitespace.

## Canonical References

Use references in this order:

1. The same component family and immediate neighbors on the target screen.
2. Home for dashboard outer spacing, section rhythm, summary-bar spacing, card-grid density, and
   responsive behavior.
3. The relevant primitive or pattern in Storybook.
4. UI-kit recipes and token stories.

Marketing pages and isolated experimental stories are not dashboard references. When creating a
new surface, record the primary reference and describe why an existing recipe is being reused,
extended, or replaced.

## Current Theme Model

Supported themes:

- `glass`
- `dark`
- `light`
- `black`

Rules:

- resolve shared surfaces through theme helpers before writing feature-local theme branches
- keep `black` as a distinct high-contrast treatment
- use readable-text and surface-token helpers for tinted or accent-heavy surfaces
- keep card backgrounds theme-aware: `dark` and `black` should remain dark surfaces, while `glass` is the only theme that should use frosted or translucent glass-like card treatments
- when adding semantic or accent state styling, tint the current theme surface with border, glow, overlay, or text changes instead of replacing it with a different surface family
- when a card needs to become accent-aware, prefer shared accent/tinted surface helpers before introducing feature-local gradients or theme branches
- when a card appears inside an established dashboard lane or neighboring card group, match the adjacent cards' surface treatment for the active theme before introducing any custom state styling
- custom state styling should layer on top of the inherited lane/card surface recipe, not replace it with a separate material treatment unless the exception is intentional and documented

## Shared Foundations

Current shared token foundations live in:

- `packages/app/src/components/system/tokens/foundations.ts`
- `packages/app/src/components/system/tokens/`
- `packages/app/src/components/shared/theme/`

Prefer these surfaces for:

- spacing
- typography roles
- border radii
- icon sizing
- motion and focus treatment
- semantic surface decisions

Typography rules:

- prefer sentence case and natural capitalization for visible UI text
- avoid all-uppercase labels, buttons, headings, and metadata as a default style
- use weight, color, spacing, and layout hierarchy for emphasis before `uppercase` or wide letter spacing
- reserve all-uppercase only for established external identifiers, short technical codes, or rare cases where the copy is already conventionally uppercase

Target ownership:

- long-term provider-neutral token and shared UI ownership belongs under `@navet/ui`
- until that extraction happens, keep docs explicit about which guidance refers to current
  implementation paths versus target package ownership

## Density And Input Rules

- optimize for mixed-input tablets and wall displays first
- keep touch targets comfortable and obvious
- do not rely on hover as the primary interaction affordance
- reduce simultaneous controls in compact card sizes
- preserve the shared dashboard shell and its user-selected spacing mode
- do not introduce feature-local page padding, max-width containers, or centered shells inside a
  dashboard section
- follow Home's compact mobile rhythm and wider-breakpoint section separation unless the target
  feature already has a more specific established layout

## Information Hierarchy

Order content by user value:

1. identity
2. current state or value
3. exception or warning
4. primary household action
5. secondary detail and configuration

Visual hierarchy is functional, not decorative. A person should be able to scan a surface and tell
what the section contains, what each control changes, and which supporting text explains it before
reading every word.

- Keep hierarchy levels distinct: a section heading names the group, a control title names the
  setting or action, and a description explains its consequence.
- Do not use a section heading as a silent replacement for the first control's title. Every control
  row needs its own visible title when adjacent rows have titles, even when that wording repeats the
  group context.
- Never leave helper or description text visually orphaned. It must sit beneath or beside the title
  it explains, with visibly lower emphasis.
- Use typography, spacing, alignment, and grouping before adding more borders, backgrounds, badges,
  or decorative containers.
- Give sibling controls parallel anatomy. If one option has an icon, title, description, and state
  control, comparable options in the same group should preserve that reading order.
- Check the hierarchy at a glance, in every supported theme and at narrow widths. It must remain
  understandable without relying on color, hover, or prior knowledge of the screen.

Do not add labels, badges, descriptions, or calls to action solely to fill space. Section headings
organize operational content; they should not become marketing-style hero blocks.

## Card Rules

- communicate the device or widget identity immediately
- keep the main control path obvious
- degrade cleanly across supported card sizes
- do not duplicate the same action in multiple parts of the card
- move overflow controls into dialogs rather than overloading compact card surfaces
- make every supported card size an intentional composition rather than clipping or scaling a
  desktop layout
- prefer one semantic surface; avoid placing a card inside a panel inside another section card

## Interaction, Accessibility, And Copy

- use the shared interaction scale for focusable controls: 36 px compact minimum, 40 px standard,
  and 42 px only for exceptional touch-forward controls that need extra separation or emphasis
- apply the 42 px ceiling to ordinary icon and single-line controls; content-rich rows and gesture
  surfaces may be taller when their content or interaction genuinely requires it
- preserve focus-visible behavior and provide a reduced-motion path
- do not use hover, color, or motion as the only affordance or state signal
- use sentence case, concise household language, and existing translation keys
- reserve uppercase for established eyebrow tokens, external identifiers, and short technical
  codes
- test realistic long names, translated text, missing artwork, and missing optional values

## Shared UI Placement

- new generic reusable UI currently starts in `packages/app/src/components/primitives/` or
  `patterns/` unless the task is explicitly extracting UI into `@navet/ui`
- app-specific shared UI belongs in `packages/app/src/components/shared/`
- `packages/app/src/components/system/` is the curated export layer, not the default authoring location
- docs and story examples should prefer `@navet/app/ui-kit/*` when a stable shared export exists
- provider-neutral shared UI should still be treated as `@navet/ui` work in the long-term package
  model, even when the current implementation lives under `packages/app/src/components/*`

## Performance Rules

- avoid expensive visual treatment in frequently updating or always-visible dashboard surfaces
- be careful with blur, nested layers, and animation on low-power hardware
- prefer CSS transforms and shared token logic over heavy per-card custom effects

## Visual Acceptance

For maintainer visual acceptance, prepare the named canonical reference and coverage across:

- normal, active, unavailable, loading, empty, and error states supported by the feature
- smallest and largest card sizes or viewport widths
- `glass`, `dark`, `light`, and `black`
- accent contrast, keyboard focus, touch/no-hover use, and reduced motion
- high and reduced effects quality when effects are present

Follow the [UX handoff rules](../../ai/skills/navet-ux.md#review-before-handoff) for automated
checks, manual comparison and acceptance.
