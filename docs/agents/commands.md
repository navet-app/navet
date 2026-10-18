# Commands

Use the smallest check that proves the changed contract, then applicable required gates. Run
routine validation yourself. Broad build/type/unit/browser suites run when scope or a gate needs
them; command existence alone is not a reason. Definitions live in root `package.json`.

`pnpm release:*`, `pnpm sync:hacs` and publishing require task authorization. Release automation
builds the HA panel; `pnpm build:ha-panel` is not a standard local release-preparation step.

## Quick Picks

| Change | Focused check |
| --- | --- |
| App contracts | `pnpm test:tier2` or nearest test |
| Provider/auth/runtime | `pnpm test:tier1` |
| Profile HTTP body handling | `node scripts/profile-http-smoke.mjs` (Docker; tests the add-on's Alpine/nginx runtime with synthetic profiles) |
| Storybook/shared UI | `pnpm check:stories`, relevant `pnpm test:storybook` |
| Composition registry | `pnpm test:registry`, `pnpm check:ui-kit`, focused recipe browser tests, `pnpm typecheck`, `pnpm storybook:build` |
| Hosted registry | `pnpm registry:preview <immutable-preview-URL> <full-SHA>` |
| Website/marketing | `pnpm website:build` |
| Public docs | `pnpm docs:build` |
| Brand/assets | `pnpm check:brand` |
| Bundle investigation | `pnpm check:bundle-budget`, `pnpm report:bundle` |
| Release surfaces | `pnpm release:check` |

For small UI polish, use the closest story/test. Responsive layout,
overflow or shared dashboard composition changes need `pnpm test:visual-review`. Structural checks
alone do not establish rendered acceptance; follow the [UX guide](../../ai/skills/navet-ux.md).

## Routeable validation

Use `pnpm validate -- --dry-run` to inspect selection or `pnpm validate -- --scope <scope>`:

| Scope | Coverage |
| --- | --- |
| `brand` | Brand guidance, artwork and generated assets |
| `ui` | Shared UI, tokens and Storybook structure |
| `dashboard` | Dashboard layout, cards and hooks |
| `provider` | Provider contracts, runtime, state and adapters |
| `workflow` | Scripts, tiers and agent commands |

## Local entrypoints

- App: `pnpm dev`, `pnpm preview`; Storybook: `pnpm storybook`.
- Sites: `pnpm website:dev`, `pnpm website:preview`, `pnpm docs:dev`, `pnpm docs:preview`.
- Marketing cleanup: `pnpm marketing:wip:clean -- --area <community|tutorials|videos> --id <task-id>`.
- Other command arguments: inspect the specific script in `package.json`, then its implementation.

## Commit Rules

Use Conventional Commits: `<type>[optional scope][optional !]: <description>`, with optional body
and footers. `feat` adds behavior; `fix` repairs it; `build`, `chore`, `ci`, `docs`, `perf`,
`refactor`, `style` and `test` are valid. Breaking changes need `!` or a `BREAKING CHANGE:` footer.
Fix TypeScript errors from normal hooks before retrying.

[Storybook workflow](../STORYBOOK_WORKFLOW.md) owns story authoring;
[release policy](release-and-publishing.md) owns publication.
