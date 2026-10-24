# Navet feature map

Current product/UI ownership. Root `AGENTS.md`
owns package direction and the [shared UI map](README.md#current-shared-ui-layers) owns authoring
and import locations. Use [provider coverage](../integrations.md#capability-matrix) for capabilities.

## Active Feature Folders

Under `packages/app/src/features/`: `auth`, `calendar`, `chores`, `climate`, `dashboard`, `energy`,
`history`, `household-controls`, `lighting`, `media`, `notifications`, `person`, `rss`, `scenes`,
`security`, `sensors`, `settings`, `tasks`, `vacuum`, `weather`. Search the owning feature, then its
direct callers.

## App Shell

`packages/app/src/App.tsx`, `packages/app/src/components/layout/` and
`packages/app/src/features/dashboard/page/index.tsx` compose auth/login, network/global errors,
section/room navigation, mobile sheets and top-level transitions.

## Top-Level Sections

`home`, `energy`, `climate`, `security`, `lights`, `media`, `tasks` (Household) and `settings` route
through `packages/app/src/features/dashboard/components/dashboard-section-router.tsx`.

## Dashboard Ownership

Owns card registration/rendering, visibility, placement, sizing/order, room-driven Home, overview
layout, add-card/entity flows and the edit bar's undo/redo, section-add and room management.
Preserve saved six-column `extra-wide` compatibility and narrower fallbacks. Layout packs include
command center, security monitor and energy wall; the manual entity catalog supplies normalized
entities without richer dedicated cards.

Start within `packages/app/src/features/dashboard/`:

| Path | Responsibility |
| --- | --- |
| `hooks/use-dashboard-controller.ts` | Dashboard composition/controller |
| `utils/card-renderer.tsx` | Card rendering |
| `components/`, `stores/` | UI and layout state |
| `packs/` | Home layout packs |
| `utils/manual-entity-card-catalog.ts` | Manual normalized-entity fallback catalog |

## Widget Ownership

Dashboard owns registration/placement; domain features may own behavior. Types: `info`, `rss`,
`photo`, `note`, `battery`, `ups`, `energy-now`, `button`, `assist`, `map`, `entity`.
Stored/imported `media-stack` remains supported but is absent from Add card. Scene/energy metric
chooser presets reuse `button`/`info`. Generic `entity` is a normalized fallback; prefer dedicated
provider-neutral cards for meaningful domain controls/presentation.

## Household And Routines

Chores owns participants, definitions, occurrences, schedules, workflow/activity and Today, Chores,
Progress and Settings. Optional motivation owns points, missions, rewards, badges and achievements;
Missions/Rewards appear when enabled. Participants are attribution/workflow profiles, not accounts.
Shared revisioned installation storage comes from Docker, the add-on or custom-panel integration;
see [chores architecture](../architecture/household-chores.md).

Tasks owns provider routines under Household. Automation details summarize triggers, conditions,
actions, diagnostics and dependent entities from provider configuration.
Tasks also owns provider-backed shopping and to-do lists and the **Routines**/**Lists** selector.
With chores enabled, lists are reached through **Household → Routines → Lists**; otherwise Tasks
mounts directly. Household controls owns timer, counter, valve and remote cards; lighting owns
helper value controls.

## Energy Dashboard

Energy owns the model, coverage state, live flow, configurable KPIs and usage workspace. Normalized
provider history groups devices, rooms or sources by day/week/month/year/custom range.
Overview-derived explanations identify consumer IDs when referring to tracked devices.

## Calendars And History

Calendar owns source selection, event details and timed/all-day event creation. Writable source
capabilities gate creation; the owning adapter translates normalized event input.
History owns the user-menu explorer, entity and range selection, state/activity views and record
limits. It uses provider history services; numeric energy statistics remain owned by Energy.

## Settings Profiles

Settings owns `standard`/`wall_display` presets: scoped changes to spacing, header title,
keep-awake, kiosk and Home summary. It also owns device preferences for side-panel visibility,
collapse state and screensaver enablement, idle delay and background selection.
Dashboard's `companion/` owns panel composition and room overrides; `screensaver/` owns the idle
gate and overlay. Panel content belongs to each saved dashboard; see
[profile ownership](../architecture/dashboard-profile-ownership.md#shared-profile).
Settings also owns providers, four themes, accents, wallpapers,
interaction/effects policy, sidebar extensions, import/export, experiments and runtime information.

## Shared UI Ownership

Use the [shared UI layer table](README.md#current-shared-ui-layers); extraction to `@navet/ui`
requires scoped provider-neutral reuse and valid dependencies.

## Provider-Aware Behavior

App `core/`, `platform/`, `stores/` and `hooks/` expose normalized state. Multiple provider sessions
aggregate selected collections while retaining scoped/canonical IDs; feature operations resolve
through the owning runtime registration. Provider packages own auth, transport, media and resource
behavior. `packages/app/src/services/` and `packages/app/src/infrastructure/home-assistant/` are
compatibility seams where extraction is incomplete. See [dashboard runtime](../architecture/dashboard-runtime.md).

## Testing And Stories

Colocate feature/shared UI stories and tests (`__tests__/`); aggregate card/product scenarios use
dashboard and UI-kit stories. Keep standalone interaction stories for primary card families,
including Climate/Humidifier and Camera/Cover/Lock/Alarm Panel.
