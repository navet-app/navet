# Provider Testing Strategy

This is the testing map for Navet's package and provider architecture.

## Tier Model

Navet's automated test surface is split into four tiers:

- `Tier 1: Release-critical`
  Small blocking gate for provider/runtime/auth/resource correctness and release validation.
- `Tier 2: Blocking app contracts`
  Blocking app-layer contracts around stores, services, and adapter wiring.
- `Tier 3: Broad regression`
  Wide feature, UI, hook, and component coverage that blocks pull requests but is not rerun as a
  tagged-release publishing gate.
- `Tier 4: Rewrite/Delete candidates`
  Existing suites that should be rewritten against stronger fixtures or removed.

Use [test-tier-inventory.md](test-tier-inventory.md) for the grouped inventory.

## Test Layers

### `@navet/core`

Test:

- shared contract behavior
- IDs and identifier helpers
- contract test harnesses

Do not test:

- React rendering
- provider SDK integration
- backend payload details

### `@navet/ui`

Target shared-UI package boundary.

Test:

- rendering from fake normalized entities
- command emission from UI interactions
- layout, filtering, and room behavior
- unavailable and malformed normalized state handling

Do not test:

- backend-native payload fields
- provider-native service calls

Current-state note:

- `packages/ui/src` is still a small export surface today
- most current UI regression coverage still lives in app-owned tests under
  `packages/app/src/components/**`, `packages/app/src/features/**`, `packages/app/src/hooks/**`,
  and Storybook coverage

### Provider packages

Test:

- raw payload mapping
- command translation
- state update and subscription behavior
- provider-local runtime behavior
- provider feature services such as media, energy, notification, task, and admin bridges
- shared contract conformance

Implemented providers today:

- `@navet/provider-homeassistant`
- `@navet/provider-homey`
- `@navet/provider-openhab`

Their expected matrices differ. Home Assistant covers the broad advanced feature-service set.
Homey also covers climate, speaker, lock, cover, Flows and Moods through the shared scene contract,
presence, notification, Insights, favorite, and hub-resource behavior. openHAB also covers fans,
climate setpoints, speaker controls, locks, covers, security sensors, batteries, and utility
measurements. Tests must assert each provider's declared runtime registration rather than treating
`implemented` as feature parity.

These suites are Tier 1 by default.

### `@navet/app`

Test:

- provider registration and wiring
- runtime selection and session bootstrap
- simultaneous session bootstrap, selected-provider aggregation, and provider-scoped identity
- integration store behavior
- app service fallbacks when a provider feature service is missing or optional
- deployment entrypoints such as standalone, ingress, and panel wiring
- compatibility-only derived state that still matters internally

Typical tier split inside `@navet/app`:

- Tier 1 for runtime, auth, resource, and security edges
- Tier 2 for shared stores and service contracts
- Tier 3 for broad feature and UI regression coverage
- Tier 4 for weak fixture-driven or implementation-shaped tests

## Fixture Rules

- use provider-neutral fixtures in shared-layer tests
- use realistic provider fixtures in provider package tests
- include `unknown`, `unavailable`, missing fields, malformed payloads, and resource differences
  when relevant

## Boundary Checks

Validation should keep failing if:

- shared code imports provider-specific code
- provider packages use app-internal compatibility seams as a primary input model
- shared UI depends on raw backend payload models

## Release Validation

The focused release-oriented workflow lives in
[../agents/release-and-publishing.md](../agents/release-and-publishing.md).
