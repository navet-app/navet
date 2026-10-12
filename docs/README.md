# Navet Docs

Use this page as the map for the documentation set.

For edits, follow the [documentation policy and drift audit](agents/documentation.md).

## Start Here

- If you want to run Navet: start with the provider setup guides.
- If you want to contribute code: start with [../CONTRIBUTING.md](../CONTRIBUTING.md).
- If you need maintainer or release guidance: jump to the maintainer section below.
- For AI tasks: start with [root AGENTS.md](../AGENTS.md) and its single routed guide.

## User Docs

| Guide | Purpose |
| --- | --- |
| [Product overview](../README.md) | Product, support and development overview. |
| [Home assistant](HOME_ASSISTANT.md) | HACS panel, add-on and standalone setup. |
| [Navet dev](NAVET_DEV.md) | Development builds: add-on, Docker or manual panel. |
| [Homey](HOMEY.md) | Homey standalone setup. |
| [Openhab](OPENHAB.md) | openHAB standalone setup. |
| [Widgets](WIDGETS.md) | Widget reference: types, sizes, placement, and limits. |
| [Integrations](integrations.md) | Provider status, capabilities and source selection. |
| [User guide](user-guide.md) | Sections, profiles, editing and kiosk use. |
| [Roadmap](ROADMAP.md) | Public roadmap. |
| [Security](../SECURITY.md) | Security and public deployment guidance. |

## Contributor Docs

| Guide | Purpose |
| --- | --- |
| [Vision](product/vision.md) | Purpose, audience and non-goals. |
| [Design principles](product/design-principles.md) | Product design authority. |
| [Dashboard principles](product/dashboard-principles.md) | Hierarchy, density, controls and responsiveness. |
| [Contributing](../CONTRIBUTING.md) | Local setup and contribution checks. |
| [Commands](agents/commands.md) | Focused validation and commit policy. |
| [Architecture](agents/architecture.md) | Short architecture overview. |
| [Package boundaries](architecture/package-boundaries.md) | Core/UI/provider/app ownership. |
| [Provider contract](architecture/provider-contract.md) | Adapter state, commands and services. |
| [Provider neutral UI](architecture/provider-neutral-ui.md) | Shared UI boundary rules. |
| [Dashboard runtime](architecture/dashboard-runtime.md) | Composition, queries, sync, rooms and media. |
| [Household chores](architecture/household-chores.md) | Scheduling, workflow, rewards, storage and projections. |
| [RSS transport](architecture/rss-transport.md) | Feed authentication and public-network boundary. |
| [Dashboard profile ownership](architecture/dashboard-profile-ownership.md) | Settings, revisions, sync and session boundaries. |
| [Persisted data migrations](architecture/persisted-data-migrations.md) | Compatibility reads and retirement evidence. |
| [Media dashboard provider limitations](architecture/media-dashboard-provider-limitations.md) | Media contracts, artwork and capability limits. |
| [Marketing website](architecture/marketing-website.md) | Website structure and reuse. |
| [Design system](design-system/README.md) | Shared UI layers, exports and review. |
| [UI guidelines](design-system/UI-GUIDELINES.md) | Visual and interaction rules. |
| [AI design context](design-system/AI-DESIGN-CONTEXT.md) | Source-derived components, tokens and story discovery. |
| [Agent composition recipes](design-system/AGENT-COMPOSITION-RECIPES.md) | Cards, sheets, forms, summaries and states. |
| [Storybook workflow](STORYBOOK_WORKFLOW.md) | Story placement and review workflow. |
| [Provider testing strategy](testing/provider-testing-strategy.md) | Testing layers and boundary expectations. |
| [Test tier inventory](testing/test-tier-inventory.md) | Current tier inventory by subsystem. |

## Maintainer Docs

| Guide | Purpose |
| --- | --- |
| [Agent delivery](engineering/agentic-development.md) | Delivery, roles and acceptance. |
| [Runner operations](engineering/agent-runner-operations.md) | Request authority, runner identities, review dispatch and repository setup. |
| [Task lifecycle](engineering/agent-task-lifecycle.md) | Ownership, authority, recovery and evidence. |
| [Queue protocol](engineering/agent-queue-state-protocol.md) | Dispatch, reconciliation and verified completion. |
| [Private planning](engineering/github-project-planning.md) | Private access, revisions and visibility. |
| [Coordinated team](engineering/agent-team-workflow.md) | Source owners and live acceptance gates. |
| [Private home testing](engineering/private-home-testing.md) | Authorized private Home Assistant testing. |
| [Release workflow](release-workflow.md) | Lanes, artifacts, versions and rollout. |
| [Release and publishing](agents/release-and-publishing.md) | Release authority and notes. |
| [Rollback](rollback.md) | Docker, add-on and panel rollback. |
| [Versioning](VERSIONING.md) | Release-line and versioning policy. |
| [Provider platform roadmap](roadmap/provider-platform-roadmap.md) | Internal provider-platform follow-up roadmap. |

## Open Roadmaps

| Guide | Purpose |
| --- | --- |
| [Autonomy roadmap](engineering/autonomous-builder-plan.md) | Unapproved future autonomy and readiness outcomes. |

## AI And Agent Docs

| Guide | Purpose |
| --- | --- |
| [Task router](../AGENTS.md) | Authority, ownership and task routing. |
| [AI navigation](../ai/agents.md) | Optional deeper-context navigation. |
| [Home assistant integration](../ai/skills/home-assistant-integration.md) | Reference |
| [Auth deployment](../ai/skills/auth-deployment.md) | Reference |
| [Testing architecture](../ai/skills/testing-architecture.md) | Reference |
| [Entity fixtures](../ai/skills/entity-fixtures.md) | Reference |
| [External resources](../ai/skills/external-resources.md) | Reference |
| [Navet UX](../ai/skills/navet-ux.md) | Reference |
| [Performance](../ai/skills/performance.md) | Reference |

## Repo Map

Use [root ownership routing](../AGENTS.md#product-and-ownership) to find the owner and direct
callers. `apps/docs/src/content.config.ts` selects public Markdown.
[Shared UI layers](design-system/README.md#current-shared-ui-layers) distinguish current app-owned
paths and stable imports from the incremental `@navet/ui` target.

## Design, Brand, Legal

| Guide | Purpose |
| --- | --- |
| [Code of conduct](../CODE_OF_CONDUCT.md) | Reference |
| [Security](../SECURITY.md) | Reference |
| [Features](design-system/FEATURES.md) | Reference |
| [Brand system](branding/README.md) | Identity, voice, cards, assets and governance. |
| [Branding assets](branding/BRANDING_ASSETS.md) | Quick asset-path reference. |
| [Trademark policy](branding/TRADEMARK_POLICY.md) | Reference |
| [Terms of use](TERMS_OF_USE.md) | Reference |
| [Attributions](ATTRIBUTIONS.md) | Reference |
