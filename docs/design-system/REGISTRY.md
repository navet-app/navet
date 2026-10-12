# Navet design-system registry

The registry exposes Navet’s canonical foundations, primitives, patterns, feature components and
all executable Storybook examples. It also distributes editable app composition templates.
Storybook renders the same implementations that registry entries describe.

## Source catalog

The source catalog is generated from the tokens, primitives and patterns barrels and local exports
imported by Storybook stories across `packages/`. Each contract records its import path, export,
source location, TypeScript contract and direct imports. Every story and documentation entry in Storybook’s
current index belongs to an example item, including story-local demonstrations, diagnostics and
documentation-only foundation references.
Example names are the available reference states; they are not promises of unsupported behavior.
Inspect the feature’s capability and runtime contracts before using a control.

Use **Concepts / UI Kit Recipes / Source catalog** to search canonical sources and open their
payloads and rendered references. Search through shadcn uses the same items. Source items use
stable `source-` names; example items use stable `example-` names, with a hash of their source
identity to distinguish duplicate names. Item descriptions carry their catalog role and review
status. The index is compact; individual item endpoints contain the exact source and full contracts.

Source catalog items are `registry:item` references. Reuse their canonical imports in Navet.
Their installation writes an inert text snapshot under `.cache/agent-design/references/` for
inspection; editable composition recipes install React files under the existing app authoring seam.
Dependency metadata describes source imports, including owning-provider and runtime requirements;
it does not install packages. Navet supplies themes, translations, settings and feature runtime.
External-project packaging is outside this workflow.

Catalog discovery preserves authority: source entries are `unclassified`; recipe entries retain
their recorded review status and acceptance evidence. Storybook presence or successful generation
does not establish maintainer design acceptance. Marketing and diagnostic examples are discoverable
for their own purpose; use same-family product references for dashboard work.

## Build a card with existing Navet UI

1. Discover the closest same-family feature card, relevant primitives and patterns, and foundation
   tokens through the registry. Name the primary reference and its actual Storybook IDs before coding.
2. Inspect the canonical source, imports, slots, sizes, states, theme helpers and feature ownership.
3. Compose existing components: `BaseCard`, its existing slots, metric/layout primitives and action
   patterns. Resolve typography, spacing, surfaces, controls and motion through shared tokens/helpers.
4. Record any coverage gap. New arrangements of existing primitives are permitted; a new visual
   pattern requires explicit maintainer approval before implementation.
5. Exercise relevant keyboard and touch interactions. Prepare rendered references for the
   maintainer's comparison under the [UX handoff rules](../../ai/skills/navet-ux.md#review-before-handoff).

Card-consumer guards in `pnpm check:ui-kit` reject detectable copied surfaces and literal foundation
values in arbitrary Tailwind classes and inline styles. An occurrence-specific baseline records
existing feature debt; it cannot authorize new occurrences or recipe violations. Static guards
cannot prove dynamic CSS equivalence or visual fidelity. Maintainer review owns visual acceptance.

## Discover and inspect

Before composing UI:

1. Discover a recipe by family and intended behavior through shadcn MCP or **Concepts / UI Kit Recipes**. Start with canonical source references for card work.
2. Inspect the template, required context, supported states, and current source-generated contracts.
3. Open its executable example and exact component reference. Review the interaction and responsive behavior.
4. Adapt caller-owned translated labels, normalized data and callbacks. Keep provider routing,
   capability decisions, validation rules and persistence in the consuming feature.

## Editable compositions and review

The [manifest](../../packages/app/src/composition-recipes/recipes.json) indexes editable recipes. Each
family/recipe folder contains `template.tsx`, `recipe.stories.tsx` and `README.md`. The manifest
records their exact paths and exports, search terms, required context, supported states, owner,
review status and primary reference. Story links resolve against Storybook's actual index.

**Building blocks** demonstrate fields, form groups, modal/sheet shells, selection, layout, tabs,
feedback and tables. They are draft usage patterns. Establish the consuming feature's reference
before adapting them. **Product compositions** import existing feature components: the switch card
and Weather card configuration. Their controllers, translations, metric bounds, capabilities,
provider routing and persistence retain feature ownership. They await maintainer design review.
Use **Concepts / Composition recipes / Product compositions** or **Concepts / Composition recipes / Building blocks**
in Storybook. Each recipe has its own state stories; diagnostics live in a separate section.
The searchable browser is **Concepts / UI Kit Recipes**, with level, family and review filters.

| Level | Items |
| --- | --- |
| Product compositions, pending | `compact-device-card` (Switch card), `weather-settings` |
| Form building blocks | `settings-field` (Text field with validation), `settings-section` (Text field group), `settings-dialog` (Form modal with save and cancel) |
| Overlay building blocks | `controls-first-dialog` (Device dialog with secondary settings), `detail-sheet` |
| Other building blocks | `empty-card`, `searchable-selection`, `checkbox-list`, `dashboard-section`, `dashboard-grouping`, `metric-action-row`, `status-feedback`, `tabs`, `navigation-workspace`, `sortable-table` |

`detail-sheet` is one template with **Phone only** and **Phone and desktop** stories. The
`responsive` flag enables desktop display. `settings-dialog` is a Save/Cancel form building block;
its feature decides validation, dirty-edit confirmation and pending/error policy. Weather's actual
configuration workflow uses forecast/metric choices and its existing dialog. Attach a connected
`returnFocusRef` for overlays; provide a feature fallback when the launcher may disappear.

## Maintain a recipe

1. Find the nearest existing feature and its same-family Storybook reference. Record intended use
   and the coverage gap before creating a composition.
2. Create the family/recipe folder, importing canonical components. Declare template and story
   paths/exports in the manifest and update the adjacent README.
3. Mark a building block `draft` or a feature-derived product `pending`. Include the owner and
   executable reference. A product item must declare a source-derived feature contract and a
   reference from that feature family.
4. Exercise relevant states and interactions, run structural checks, and prepare the named
   reference across relevant sizes and themes for maintainer review.
5. Maintainer design acceptance changes `reviewStatus` to `approved` and records an `acceptance`
   evidence link. Automated checks cannot grant this acceptance. Deprecated items retain an
   explicit status and are excluded from approved discovery.
6. Publish the registry and Storybook from the same revision, then verify the exact hosted preview.

MCP and CLI search see level, review status and owner in descriptions and categories. Search identifies candidates; inspect the exact `meta.level` and `meta.reviewStatus` values
to establish eligibility. The pinned CLI uses fuzzy search, so query matches are not review-status
filters. Use Storybook’s exact review filter for approved discovery. If no accepted item fits,
follow the reference-first workflow and identify the coverage gap. Pending and draft examples are inspection material, not accepted design.
A recipe's published name is its stable installation address; folder and display title express
its actual purpose.

This organization follows [shadcn registry authoring](https://ui.shadcn.com/docs/registry/getting-started),
[item metadata](https://ui.shadcn.com/docs/registry/registry-item-json),
[Storybook hierarchy](https://storybook.js.org/docs/writing-stories/naming-components-and-hierarchy)
and [review tags](https://storybook.js.org/docs/writing-stories/tags). Keep the pinned CLI compatibility
check before adopting new registry-format features.

## Local development

Run from the Navet checkout whose source contracts you want to inspect:

```bash
pnpm install --frozen-lockfile
pnpm registry:dev
```

The coordinated command starts Storybook on `6006` and the registry on `7331`. It regenerates
contracts, story links and payloads after relevant source/configuration changes. Rebuilds publish a
complete replacement directory, removing stale items. Changed, failed or stopped builds are
unavailable until a successful rebuild; they cannot masquerade as current registry content.
Ctrl+C or SIGTERM shuts down both child process groups. Occupied ports fail clearly. For a second
review server, explicitly select `NAVET_STORYBOOK_PORT`; changing `NAVET_REGISTRY_PORT` also requires
an explicit matching client registry URL.

The root and app-workspace `components.json` retain local resolution. The app config is required by shadcn 4.21.0 when it routes installation through the workspace package:

```json
{ "registries": { "@navet": "http://127.0.0.1:7331/r/{name}.json" } }
```

```bash
pnpm dlx shadcn@4.21.0 list @navet
pnpm dlx shadcn@4.21.0 search @navet --query 'keyboard selection'
pnpm dlx shadcn@4.21.0 view @navet/settings-dialog
pnpm dlx shadcn@4.21.0 add @navet/settings-dialog --dry-run
```

Run installation in a disposable Navet checkout before adapting a new template. The target is
`packages/app/src/components/recipes/<name>.tsx`, resolved through Navet's existing aliases.
Compile the installed template and exercise its reference-equivalent interactions. Preserve
`package.json`, the lockfile and theme files. External-project portability is outside this registry.

`pnpm registry:build` generates `.cache/ui-registry/r`; `pnpm registry:serve` serves a one-shot build.
`pnpm storybook` prepares payloads for a standalone development session; use `registry:dev` for
coordinated live regeneration. The browser reports endpoint failures and exposes source, contracts,
revision and example links only when payload coverage matches its manifest.

## Codex MCP

Keep client configuration in the user's Codex configuration, outside Git. Add the pinned shadcn
server with the Navet working directory:

```toml
[mcp_servers.shadcn]
command = "pnpm"
args = ["dlx", "shadcn@4.21.0", "mcp", "--cwd", "/absolute/path/to/navet"]
cwd = "/absolute/path/to/navet"
```

Start the matching local registry before discovery. Use shadcn registry search/view tools to
discover recipes. In pinned 4.21.0, `view_items_in_registries` returns a summary; use
`get_item_examples_from_registries` with the exact recipe name to inspect template source.
Inspect generated `meta.contracts`, context and exact story links through the registry JSON or
Storybook recipe browser, then review rendered examples through Storybook. Reload the Codex
client or start a fresh session after changing MCP configuration; configuration presence alone does
not establish a connection in an already-running session. Keep `4.21.0` until CLI/MCP discovery,
view, dry-run and disposable installation compatibility have been exercised with a proposed pin.

## Matching hosted Storybook

Every Storybook build publishes `/r/registry.json` and `/r/<name>.json` alongside its rendered
examples and generated source catalog. Publication validates links against the built `index.json`. Metadata records commit,
dirty status, source/contract/template/story/composition fingerprints, and a fingerprint of the
built Storybook index and iframe entry document (including its content-hashed asset references).
Local dirty builds are explicitly identified. Hosted completion requires a clean exact PR revision.

Use the immutable Storybook deployment URL from the current-head Cloudflare check. Do not substitute
the production domain or an ancestor deployment accepted by the general Pages gate.

```bash
pnpm registry:preview https://EXACT-DEPLOYMENT.navet-app-storybook.pages.dev EXPECTED_FULL_SHA
```

The verifier rejects revision, source, rendered-entry, indexed-story and item/index mismatches and
prints CLI commands bound to that URL. It compares current local contracts to hosted content;
commit current source before running it. Test hosted list/search/view/dry-run against the printed
URL. Hosted verification never changes the checked-in local `@navet` URL or falls back to another
revision. A passing general CI or Pages gate alone is insufficient evidence.

## Structural and rendered checks

```bash
pnpm test:registry
pnpm check:ui-kit
pnpm check:stories
pnpm typecheck
pnpm test:storybook packages/app/src/composition-recipes packages/app/src/ui-kit/recipes.stories.tsx --run
pnpm storybook:build
```

AST/symbol checks validate manifest coverage, permitted named imports and aliases, component
exports, template exports and exact example/reference exports. Official shadcn JSON Schema
snapshots validate payloads offline; update them with pinned-CLI compatibility evidence.

Composition guards cover application sources, templates and stories. They detect known static
copied shells, nested `SheetSurfaceHeader` usage and missing explicit recipe close-focus handlers.
Canonical shell implementation modules own their shell classes. Dynamic CSS equivalence and
handler behavior require separate review. The occurrence-specific baseline records unrelated
existing defects; new occurrences fail and removed entries must be deleted. Never baseline recipes
or their direct examples to make a new composition pass.

These checks do not establish visual acceptance. Exercise relevant supported states and keyboard
interactions for every recipe. Review a recorded representative matrix spanning all four themes,
card sizes, phone, tablet portrait/landscape, desktop, long labels and reduced motion. Review
risk-specific combinations exhaustively. Maintainer visual acceptance, merge and production release
remain separate delivery gates.

Hosted verification permits Cloudflare Pages’ canonical `/iframe.html` to `/iframe` 308 redirect only on the identical deployment. Registry redirects and all other HTML redirect destinations are rejected.
