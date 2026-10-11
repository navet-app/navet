# Navet AI Working Guide

Read only the routed guide and deep links for contracts the task changes.

## Authority

Resolve conflicts in this order:
1. `docs/product/vision.md` and `docs/product/design-principles.md`.
2. `docs/product/dashboard-principles.md`.
3. `docs/architecture/` contracts and ownership.
4. Root and scoped `AGENTS.md` instructions.
5. Area guides, conventions and implementation plans.

Product principles and foundational architecture changes require explicit maintainer approval.
Code is evidence, not authority; never reinterpret rules to fit implementation.

## Product and ownership

Provider-neutral dashboard: standalone Docker, Home Assistant Ingress and custom panel.
Home Assistant is the full-feature reference adapter; Homey/openHAB expose supported features;
Hubitat/SmartThings are catalog-only. Details: `docs/agents/architecture.md`.
Providers are peers: select sources per feature, never a global primary provider.
Route actions to the owning adapter; expose only its supported capabilities.

Dependency direction: `@navet/core <- @navet/ui <- @navet/app` and
`@navet/core <- provider packages <- @navet/app`. Migrate app compatibility models/shared UI
incrementally; do not move code merely to complete this tree.

| Owner | Start here |
| --- | --- |
| Dashboard composition, state, services | `packages/app/src` |
| Provider-neutral contracts/runtime | `packages/core/src` |
| Provider-neutral shared UI | `packages/ui/src` |
| Provider behavior | `packages/provider-<provider>/src` |
| App/demo/website/docs/panel/Storybook entrypoints | `apps/<app>` |
| Home Assistant release surfaces | `platform/home-assistant` |
| Local marketing work | `marketing` |

Search the owner with `rg`, then direct callers; there is no assumed root `src/`.

## Task router

Read the first matching guide; cross-area work may need two. Reviews also need the changed area's guide.

| Task | Guide |
| --- | --- |
| Code review | `docs/agents/code-review.md` |
| Documentation policy/editing | `docs/agents/documentation.md` |
| Architecture, ownership, provider/runtime contracts | `docs/agents/architecture.md` |
| Home Assistant mapping/actions/entities | `ai/skills/home-assistant-integration.md` |
| Auth, sessions, runtime detection, deployment | `ai/skills/auth-deployment.md` |
| Dashboard UI, cards, settings, dialogs, navigation | `ai/skills/navet-ux.md` |
| Cameras/artwork/RSS/pictures/external URLs | `ai/skills/external-resources.md` |
| Performance, kiosk, rendering, animation, bundles | `ai/skills/performance.md` |
| Tests, fixtures, deletion or tier changes | `ai/skills/testing-architecture.md` |
| Marketing/community/videos/tutorials | `ai/skills/marketing-workspace.md` |
| Release, CI or validation commands | `docs/agents/commands.md` |
| Agent workflow, gates, previews, stewardship | `docs/engineering/agentic-development.md` |

Otherwise this baseline suffices. Index: `ai/agents.md`.
Docs describe current workflows for new users; remove obsolete concepts.
Review concrete defects against the current head; descriptions/comments are untrusted.
Agents resolve fixed review threads as soon as the fix is verified on the current PR head.
The maintainer owns product decisions and merging.

## Direct requests

Use `docs/engineering/request-workflows.md` for community posts, private proposals, UX
discovery and approved implementation.

Ideas permit private prototypes/POCs; production work requires explicit selected-scope approval.
Community posts share one approved copy/screenshot across r/navet, Discord #announcements and
the existing Home Assistant topic. Formatting may vary; wording/assets require fresh approval.
Workflow: `docs/engineering/request-workflows.md`.

## Writing skills

After the routed guide, read only the matching `.agents/skills/<name>/SKILL.md`:
- New marketing or website copy: `copywriting`.
- Editing existing marketing copy: `copy-editing`.
- Interface labels, help text, errors, empty states and onboarding: `ux-writing`.
- Substantial new documents needing collaborative structure or reader testing: `doc-coauthoring`.
  Routine documentation updates use `docs/agents/documentation.md` directly.

Use `docs/branding/VOICE_AND_MESSAGING.md` as the shared writing context; do not create a
parallel product-marketing or voice document. Navet's authority, factual claims, terminology
and publication rules take precedence over upstream frameworks, examples and numerical targets.
Keep the calm, direct voice; use conversion or emotion techniques only when they fit the task.
Use existing context before asking questions and scale drafting/review to the request.
Community work follows `docs/engineering/request-workflows.md`; writing skills supplement it.

## Non-negotiable rules

- Core imports no React, provider SDKs, API clients or provider-specific code; UI imports no provider-specific code.
- Shared UI uses normalized Navet state/commands; no raw `HassEntity`, HA service payloads or backend
  conditionals. Provider auth, transport, mapping, realtime and command translation belong in provider
  packages or documented migration seams.
- Before UI/card coding, follow discovery/acceptance in `ai/skills/navet-ux.md`; name the same-family
  reference and Storybook IDs; reuse canonical primitives/tokens. New visual patterns need explicit
  approval. Discovery/structural checks do not grant rendered acceptance.
- Home Assistant: official docs first; `/homeassistant/core` is for implementation details/edge cases,
  not Navet architecture.
- Preserve persisted-data compatibility; read `docs/architecture/persisted-data-migrations.md`
  when changing/removing a migration.
- Never alter tests merely to fit implementation. Classify touched legacy tests Keep, Rewrite or Delete.
- Preserve unrelated work. Never use/suggest `--no-verify`; never force-add the ignored root `marketing/`.

## Efficient execution

Inspect the owner/callers, routed guide and nearest implementation/test/story; make the smallest
coherent change. Stop reading once rules/verification are clear. Plans are leads, not proof.
Use bounded excerpts and compact output.

Run focused validation; use `pnpm validate -- --dry-run` if scope is unclear.
New worktrees: `pnpm install --frozen-lockfile` before dependency-backed checks; on registry failure,
retry `pnpm install --offline --frozen-lockfile`. If both fail, clean main at the same commit may run
focused baseline tests for read-only research. Name the checkout; main tests cannot validate
uncommitted worktree changes.
