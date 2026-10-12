# Test Tier Inventory

This file is the human-readable map of which Navet test suites matter, why they exist, and whether
they are keep, rewrite, or delete candidates.

The executable Tier 1 and Tier 2 file lists live in
[`../../scripts/test-tier-manifest.mjs`](../../scripts/test-tier-manifest.mjs). Keep this document
as the rationale map and update the manifest when changing a runnable gate.

## Tier 1: Release-Critical

These suites block release-oriented workflows and should stay intentionally small.

| Group | Why it exists | Status |
|---|---|---|
| `scripts/agent-validation-receipt.test.mjs` | Native validation receipt provenance, exact commit/hook identity and redaction | Keep |
| `scripts/agent-codex-usage.test.mjs` | Private execution accounting verifies thread identity, cumulative counter integrity, incomplete-write handling and redacted observations | Keep |
| `scripts/agent-task-usage.test.mjs` | Verified participant inventory, accepted observable units and complete native turn coverage protect aggregate budgets; historical participants and per-thread monotonic counters survive restart | Keep |
| `scripts/agent-team-*.test.mjs`, `scripts/agent-proposal-scope.test.mjs` | Coordinated team authority, role ownership, durable publication, verified accounting, interruption, recovery and terminal release | Keep |
| `scripts/agent-task-store.test.mjs`, `scripts/agent-planning-scope.test.mjs`, `scripts/agent-linear-event.test.mjs`, `scripts/agent-linear-inbox.test.mjs`, `scripts/agent-linear-refresh.test.mjs` | Private lifecycle authority, signed planning events, durable receipt acknowledgement, fresh service-read reconciliation, scope withdrawal and duplicate/recovery boundaries | Keep |
| `scripts/agent-linear-intake-run.test.mjs` | Authenticated planning intake preserves independent human authority, scoped proposal agreement, duplicate suppression, cancellation and durable queue receipts through token cleanup | Keep |
| `scripts/agent-planning-dispatch.test.mjs` | Coordinator dispatch joins current ownership, exact human scope, fresh planning state and resource reservations; withdrawal latches block new execution while preserving receipt recovery | Keep |
| `scripts/agent-planning-delivery-dispatch.test.mjs` | Durable first-send receipts connect accepted scope to worker creation and verified handle binding; uncertainty, legacy intents, withdrawal and cancellation cannot authorize duplicate creation | Keep |
| `scripts/agent-worker-monitor.test.mjs` | Exact worker stop receipts require fresh stopped observations and saved checkpoints; failed aggregate usage invalidates cached evidence and retries remain bounded | Keep |
| `scripts/agent-worker-checkpoint.test.mjs` | Actual Git recovery snapshots bind stopped turns to durable context, detect changed staged/unstaged/untracked state and survive coordinator restart and cancellation | Keep |
| `scripts/agent-codex-worker.test.mjs` | Native thread and latest-turn observations must agree; exact-turn interruption cannot target a successor and checkpoint verification remains independent | Keep |
| `scripts/agent-codex-app-server.test.mjs` | Owned local-socket proxy initialization, scoped RPC parameters, response correlation, output limits and cancellation preserve the runtime boundary | Keep |
| `scripts/agent-planning-intake.test.mjs`, `scripts/agent-planning-result.test.mjs`, `scripts/agent-planning-result-delivery.test.mjs` | Scope and visibility authorization, durable result publication and acknowledgement recovery protect private planning at delivery boundaries | Keep |
| `scripts/agent-linear-auth.test.mjs`, `scripts/agent-linear-reader.test.mjs`, `scripts/agent-linear-result-reader.test.mjs`, `scripts/agent-linear-result-writer.test.mjs`, `scripts/agent-linear-refresh-run.test.mjs` | Credential isolation and cleanup, scoped service reads and writes, private result publication and refreshed authority belong in release-critical validation | Keep |
| `scripts/agent-linear-connector-reader.test.mjs` | Connected read tools preserve workspace/account/team/project identity, complete stable proposal scope and cancellation without inferring human approval | Keep |
| `assets/public/boot-i18n.test.ts`, `scripts/vite-preload-graph.test.mjs` | Low-power startup and authenticated-transition preload graph remain parseable and release-gated | Keep |
| `packages/provider-*/src/*.test.*` | Provider contract conformance for Home Assistant, Homey, openHAB, and planned-provider boundaries | Keep |
| `packages/app/src/auth/__tests__/adapters.test.ts`, `runtime.test.ts`, `homeAssistantDiscovery.test.ts`, `homey-oauth-auth.test.ts` | Auth/runtime bootstrap and provider login flows | Keep |
| `packages/app/src/infrastructure/home-assistant/resources/__tests__/resource-resolver.test.ts` | Signed URLs, proxy rewriting, unsafe URL rejection | Keep |
| `packages/app/src/utils/__tests__/home-assistant-url.test.ts`, `rss-proxy-security.test.ts` | URL safety, ingress/panel URL normalization, RSS proxy hardening | Keep |
| `packages/app/src/features/auth/__tests__/login-page.test.tsx` | User-facing OAuth login flow | Keep |
| `packages/app/src/features/media/components/media-card/__tests__/use-media-artwork-resolution.test.tsx` | Authenticated artwork resolution and runtime-specific fallbacks | Keep |
| `packages/app/src/features/security/components/camera-card/__tests__/camera-stream-player.test.tsx` | Camera stream runtime behavior across supported modes | Keep |
| `packages/app/src/features/rss/components/rss-feed-card/__tests__/use-rss-feed-items.test.tsx` | Ingress-aware RSS proxy behavior and feed ordering | Keep |
| `packages/app/src/provider-package-registry.initialization.test.ts` | Provider package startup with existing sessions and cycle-safe registry initialization | Keep |
| `packages/app/src/pwa/pwa-update-store.test.tsx`, `packages/app/src/pwa/standalone-manifest-http-config.test.ts` | Production service-worker update recovery, bounded prompts, and revalidated standalone manifest delivery | Keep |
| `packages/app/src/stores/__tests__/integration-store.test.ts` | Core provider-to-app state wiring | Keep |
| `packages/app/src/services/__tests__/integration-registry.service.test.ts`, `packages/app/src/commands.test.ts` | Provider registration and shared command dispatch | Keep |

Tier 1 companion checks:

- `pnpm check:provider-boundaries`
- `pnpm check:docker`

## Tier 2: Blocking App Contracts

These suites block main CI because they protect stable app behavior, but they are not release-only.

| Group | Why it exists | Status |
|---|---|---|
| `packages/app/src/services/__tests__/dashboard-endpoints.test.ts` | Dashboard persistence and endpoint contract behavior | Keep |
| `packages/app/src/services/__tests__/ha-connection.service.test.ts`, `ha-entity-service.test.ts`, `ha-registry.service.test.ts`, `home-assistant-panel-adapter.test.ts` | Home Assistant app-layer service contracts | Keep |
| `packages/app/src/services/__tests__/home-assistant-energy-feature.service.test.ts`, `homey.service.test.ts` | Provider-specific app-owned feature/runtime seams | Keep |
| `packages/app/src/services/__tests__/integration-*.test.ts` except Tier 1 runtime/registry/action | Shared feature-service contracts for calendar, camera, history, light, media, notification, resource, security, task, weather, admin, and bootstrap flows | Keep |
| `packages/app/src/platform/__tests__/provider-room-management.test.ts` | Shared provider room normalization and room management contract | Keep |
| `packages/app/src/stores/__tests__/home-assistant-store.test.ts`, `settings-store.test.ts` | Stable store contracts with meaningful downstream impact | Keep |

Default rule:

- service/store/platform tests are Tier 2 when they protect normalized app contracts or provider
  wiring that many features depend on

## Tier 3: Broad Regression

Broad unit regression blocks runtime-impacting PRs in `.github/workflows/ci.yml`; it is not
rerun as a tagged-release publishing gate. Storybook browser coverage is a separate surface.

| Group | Why it exists | Status |
|---|---|---|
| `scripts/codex-review-completion.test.mjs` | Verified Codex completion produces a current-head COMMENT receipt; stale summaries, forged authors and duplicate events cannot create extra reviews | Keep |
| `packages/app/src/features/dashboard/**` | Largest user-facing regression surface for layout, editing, widgets, and navigation | Keep |
| `packages/app/src/features/media/**`, `lighting/**`, `security/**`, `energy/**`, `climate/**`, `rss/**`, `tasks/**`, `settings/**`, `sensors/**`, `vacuum/**`, `calendar/**`, `notifications/**` | User-visible feature regressions and UI behavior | Keep |
| `packages/app/src/components/**` | Shared UI and interaction regressions | Keep |
| most `packages/app/src/hooks/**` | Hook-level regression coverage for app behavior and feature composition | Keep |
| most `packages/app/src/utils/**`, `packages/app/src/runtime/**`, `packages/app/src/navigation/**`, `packages/app/src/api/**` | Utility and runtime drift detection that is useful but not release-critical | Keep |
| `pnpm test:storybook` | Separate visual/story regression surface | Keep |

Default rule:

- if a suite is mainly protecting UI composition, interaction details, or feature behavior rather
  than a stable contract, it belongs in Tier 3 unless promoted explicitly

## Tier 4: Rewrite/Delete Candidates

These are test-quality review candidates. Recheck each current test against its contract before
rewriting or deleting it; this classification changes neither executable membership nor CI.

| Group | Why it is Tier 4 | Status |
|---|---|---|
| `packages/app/src/hooks/device-mappers/__tests__/map-sensor-device.test.ts` | Weak fixture assumptions for a high-risk domain | Rewrite |
| `packages/app/src/hooks/device-mappers/__tests__/map-weather-device.test.ts` | Needs real forecast/documented weather fixtures | Rewrite |
| `packages/app/src/features/vacuum/components/vacuum/__tests__/use-vacuum-control.test.tsx` | Vendor-sensitive behavior without strong fixtures | Rewrite |
| `packages/app/src/features/security/components/__tests__/lock-card.test.tsx` | Missing contract-backed lock states | Rewrite |
| `packages/app/src/features/security/components/cover-card/__tests__/cover-card.test.tsx` | Needs documented cover/tilt/partial-position behavior | Rewrite |
| `packages/app/src/features/lighting/components/light-card/__tests__/light-card.test.tsx` | Needs stronger grouped-light and malformed-attribute fixtures | Rewrite |
| `packages/app/src/features/climate/components/climate-card/__tests__/use-climate-card-controller.test.tsx` | Needs documented Climate mode/range coverage | Rewrite |
| `packages/app/src/features/tasks/components/__tests__/tasks-section.test.tsx` | Needs realistic automation/script/todo fixtures | Rewrite |
| `packages/app/src/features/calendar/components/calendar/__tests__/calendar-event-visibility.test.ts` | Needs real all-day and timed event payloads | Rewrite |
| `packages/app/src/hooks/__tests__/ha-entity-utils.test.ts` | Needs malformed and unavailable fixture coverage | Rewrite |

Default rule:

- Reclassify candidates when current fixtures and contract-backed assertions justify it.
- Tier 4 is a review label, not a runnable lane or permission to skip a required test.

## Admission Rules

- New Tier 1 tests need a release/runtime/security/provider justification.
- New Tier 2 tests need a stable store/service/platform contract justification.
- New Tier 3 tests are acceptable for useful regression coverage.
- New Tier 4 tests are not acceptable; rewrite the fixture model or do not add the test.

### UI ticket support (Tier 3, Keep)

- `scripts/agent-component-catalog.test.mjs`: source contracts, union props, namespace members,
  story association and compiler/source fingerprint freshness.
- `scripts/ui-feature-imports.test.mjs`: shared-layer feature dependencies through relative paths,
  aliases and supported import forms, with comments and quoted examples excluded.
- `scripts/ui-shell-recipes.test.mjs`: duplicated shell signatures across class order and syntax,
  with ordinary layout classes excluded.

Run these focused suites when their tools change; `pnpm check:ui-kit` applies the source guardrails.
