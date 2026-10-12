# Persisted Data Migration Retirement

Compatibility code that reads an older persisted shape is a supported upgrade interface. Do not
remove it merely because current writes use a newer schema. This ledger makes every retained
migration visible and gives it an explicit retirement gate.

## Retirement policy

A migration may be removed only when all of these are true:

1. The oldest release supported by Navet can reach the current release without that migration.
2. Upgrade tests no longer use the legacy shape as an input contract.
3. The release notes have announced the end of that upgrade path for at least one stable release.
4. The removal release and evidence are recorded in this ledger before the implementation is
   deleted.

The review release is a checkpoint, not an automatic deletion date. If evidence is incomplete,
keep the migration and move the review forward.

## Active ledger

| Compatibility seam | Current owner | Legacy input retained | Review release | Retirement evidence required |
| --- | --- | --- | --- | --- |
| Local-storage key namespace | `packages/app/src/utils/local-storage-migration.ts` | Pre-`navet:` application and store keys | 0.18 | Oldest supported upgrade fixture contains no legacy key; namespace migration tests can be removed together |
| Stored integration session | `packages/app/src/infrastructure/home-assistant/auth/auth-session-manager.ts` | `navet_auth_session` and legacy auth runtime mapping | 0.18 | All supported installations write the provider-scoped session contract; direct-upgrade auth coverage passes without the legacy key |
| Dashboard configuration | `packages/app/src/utils/dashboard-config.ts` | Dashboard versions 1, 2, and 3 | 0.19 | Supported-upgrade policy no longer includes a release that writes versions 1-3; import and endpoint fixtures are updated in the same change |
| Dashboard profile and base cache | `packages/app/src/services/dashboard-profile.service.ts` and `packages/app/src/features/dashboard/clients/dashboard-profile-base-cache.ts` | Profile version 3, preference binding migrations, and base-cache compatibility | 0.19 | File-store and endpoint conformance suites prove direct upgrades from the oldest supported profile shape without these branches |
| Dashboard helper visibility | `packages/app/src/features/dashboard/stores/dashboard-entities-store.ts` and `use-dashboard-entity-visibility.ts` | Dashboard entity state without `explicitlyShownEntityIds`; preserve unhidden helpers from each provider’s first hydrated snapshot, retaining pending providers across exports | 0.20 | Supported profiles always carry helper selections and no pending legacy providers; local hydration and profile round-trip upgrade fixtures retire together |
| Room workspace identity | `packages/app/src/features/dashboard/rooms/room-workspace-v2.ts` | Name-based order, visibility, grouping, and symbol fields | 0.19 | Provider-scoped room identity has shipped through the full support window; room-workspace migration fixtures retire with the branch |
| Duplicate room consolidation | `packages/app/src/features/dashboard/rooms/room-workspace-store.ts` and `room-workspace-v2.ts` | Separate workspace room IDs for matching provider room names and entity placements referencing those IDs | 0.20 | Supported-upgrade fixtures no longer contain duplicate room names; placement redirects and metadata preservation remain covered until that upgrade path retires |
| Chore durable storage | `docker/njs/chore-durable-storage.js`, `scripts/vite-chore-store.ts`, and `platform/home-assistant/custom_components/navet/chore_store.py` | Inline chore workspaces without a durable collection manifest | 0.20 | Supported-upgrade fixtures prove ledger, award identity, unfinished-work, backup, and recovery preservation before inline compatibility reads retire |
| Chore workspace schema | `packages/app/src/services/chore-workspace.service.ts` | Chore workspace schema version 1 | 0.19 | Every supported persisted workspace is schema version 2 and both service/store upgrade fixtures can be retired |
| Chore workspace authorization | `docker/njs/chore-store.js`, `scripts/vite-chore-store.ts` | Provider-derived `tenantId` in legacy chore documents and management PIN records | 0.20 | Oldest-supported upgrade fixtures no longer require provider-derived ownership reads; preservation coverage for chores, history, PIN salt/hash, and management protection remains. Dashboard tenant bindings follow their separate compatibility policy |
| Chore reminder destination | `packages/core/src/chores.ts`, `packages/app/src/features/chores`, and `platform/home-assistant/custom_components/navet/chore_store.py` | Provider-specific `home_assistant` destination value | 0.20 | Every supported workspace writes the provider-neutral `provider` destination and upgrade fixtures no longer contain the legacy value |
| Built-in wallpaper paths | `packages/app/src/constants/built-in-wallpapers.ts` | Previous built-in IDs and asset paths | 0.18 | No supported release writes the old identifiers and theme-store upgrade coverage is no longer required |
| OAuth callback parameter | `packages/app/src/auth/adapters/standaloneOAuthAuth.ts` | `auth_callback=1` | 0.18 | All supported OAuth initiators use the current callback marker and an end-to-end callback test covers that path |
| Home Assistant tenant namespace | `scripts/vite-auth-session-store.ts`, `docker/njs/auth-store.js`, and dashboard profile stores | OAuth records without `tenantId` and the unsuffixed dashboard profile files | 0.20 | Every supported session carries a tenant ID and each supported workspace has been opened through the tenant-aware store |

## Updating the ledger

- Add a row in the same change that introduces a compatibility read or migration.
- Name the implementation owner and the exact input being retained.
- When retiring a row, link the release or issue that establishes the support-window decision and
  delete the compatibility tests only with the compatibility implementation.
- Keep historical migration decisions in Git history after retirement; do not leave completed
  migration plans among current architecture guidance.
