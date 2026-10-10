# Provider Contract

This document describes the shared contract that all providers plug into.

## The Goal

Navet's shared UI should not care which connected provider owns an entity or selected feature source.
Providers normalize their state into Navet types and translate Navet commands back into native
requests.

## Shared Shape

At a high level, a provider package provides three related layers:

- A small state/resource contract used by app/runtime wiring.
- A command adapter (`SmartHomeProviderAdapter`) used by UI interactions to execute commands.
- A runtime registration that declares capability flags, a feature matrix, and optional richer
  feature services.

The contract API is currently:

```ts
type NavetProviderContract = {
  providerId: IntegrationProviderId;
  bootstrapSession?: (sessions: NavetProviderSessionMap) => NavetProviderSession | null;
  initializeSession?: (session: NavetProviderSessionInput) => Promise<void>;
  attachRuntimeBridge?: (bridge: unknown) => void;
  teardownSession?: () => void;
  getState(): NavetProviderState;
  subscribeState?: (listener: () => void) => () => void;
  resolveResource?: (
    request: NavetResourceResolveRequest
  ) => Promise<ResolvedPlatformResource> | ResolvedPlatformResource;
  normalizeResourceUrl?: (resourceUrl: string) => string | null;
};
```

`createSnapshotBackedProviderAdapter` in `@navet/core` currently turns contract state into a
`SmartHomeProviderAdapter` with `connect/disconnect/listEntities/getEntity/execute/subscribeToEvents`.

## What The Small Contract Carries

- normalized entities
- normalized rooms, including whether each room is provider-managed or derived and whether its
  source supports ordering or deletion
- provider-neutral runtime status: connected, connecting, reconnecting, entity hydration,
  registry hydration, errors, and optional unreachable state
- entity lookup
- generic command execution
- live updates through subscriptions

The app derives provider health, dashboard runtime status, room descriptors, and manageable-room
references from this normalized state plus the provider runtime registration. It does not subscribe
to Home Assistant, Homey, or openHAB snapshots separately.

## What Runtime Registration Adds

`IntegrationProviderRuntimeRegistration` sits beside the small contract. It declares whether a
provider is implemented or planned, publishes the dashboard feature matrix, and may register
provider-owned services for media, lights, native actions, cameras, security, climate, rooms and
entities, history, energy, calendars, weather, notifications, tasks, conversations, and entity
runtime access.

History services can declare entity-level availability through `supportsEntityHistory`. Shared
history routing skips unsupported entities while preserving failures from supported requests.

Administrative services expose entity integration reload through an availability predicate,
an optional availability subscription and an execution method. Unknown support stays unavailable
until the owning provider confirms it. Home Assistant resolves ownership from the live entity
registry, watches entity-registry and config-entry changes, and rechecks unload support before
execution. Subscriptions release their cache and backend listeners when the last consumer leaves.
Home Assistant shares one config-entry stream and cache across watched entities in each session.

Keeping these services out of `NavetProviderContract` prevents the base contract from growing into
a mirror of Home Assistant. Shared feature UI asks the app/runtime seam for an optional service and
must handle its absence.

## What It Does Not Carry

- Home Assistant `domain/service/entity_id` payloads
- provider SDK clients
- deployment-specific auth details
- compatibility snapshots used only inside the app shell

## Package Responsibilities

### `@navet/core`

Owns:

- `NavetEntity`
- `NavetCommand`
- `CommandResult`
- provider IDs and identifier helpers
- shared provider contract types
- contract test helpers

### Provider packages

Own:

- session bootstrap appropriate to that provider
- raw payload mapping
- command translation
- event and subscription translation
- provider-local runtime helpers
- provider feature-service implementations, including native automation inspection and creation
  where the provider supports those operations

### `@navet/app`

Owns:

- provider registration
- runtime selection
- settings and persistence
- session bootstrap wiring
- any remaining compatibility-only derived state

## Current Providers

- Home Assistant: implemented (reference adapter)
- Homey: implemented
- openHAB: implemented
- Hubitat: planned metadata only; no adapter package
- SmartThings: planned metadata only; no adapter package

Current runtime feature scope:

| Capability group | Home Assistant | Homey | openHAB |
|---|---:|---:|---:|
| rooms, realtime entities, lighting, switches, sensors | Yes | Yes | Yes |
| climate and media controls | Yes | Yes | Yes |
| lock and cover controls, security sensors | Yes | Yes | Yes |
| device power and energy measurements | Yes | Yes | Yes |
| cameras, energy statistics, calendar, weather forecasts | Yes | No | No |
| notifications, entity history, hub resources | Yes | Yes | No |
| automation configuration and alarm-panel controls | Yes | No | No |
| Assist conversations | Yes | No | No |

The app may keep multiple implemented sessions connected at once. Provider-scoped IDs and
provider-owned state remain separate; selected provider collections are merged for dashboard use,
and entity-scoped operations resolve to the selected source's owning provider. Feature availability
considers connected providers.

openHAB associations use semantic equipment metadata first, with conventional related item names
as a fallback. Its normalized measurements retain units, source identity, and security categories.
The current app compatibility mapper accepts `retainSensorCard` for measurements that must remain
available alongside their device's control card. openHAB feature services translate Navet controls
to native item commands; cover percentages are converted between Navet openness and openHAB closure.

## Testing Expectations

Every implemented provider should cover:

- state retrieval
- bootstrap/initialize session and disconnect lifecycle
- entity lookup and entity diffing through state subscriptions
- add, update, remove, and unsubscribe behavior in state updates
- resource resolution and fallback behavior where supported
- feature-service behavior exposed by that provider, such as task automation details and
  automation triggering
- provider unavailable and malformed payload behavior

Every adapter-layer command surface should cover:

- supported command execution
- unsupported command rejection

The contract should stay small. Do not widen it just to mirror one backend.
