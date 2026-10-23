# Documentation Workspace

This workspace builds the public Navet documentation site at `https://docs.navet.app` with Astro
Starlight.

## Content model

Public pages are loaded from their canonical repository locations.
`src/content.config.ts` maps explicitly selected pages to their public routes and automatically
loads `docs/how-to/**/*.md`. How-to files publish under `/guide/` with the same directory structure;
directory `index.md` files become section landing pages, and `docs/how-to/index.md` becomes
`/guide/how-to/`. Add new task guides in that tree without duplicating content in this workspace.
Files under `ai/` and internal maintainer, release, testing, and audit paths are not published unless
they are deliberately added to that map.

Every published Markdown file needs Starlight frontmatter with at least `title`, `description`, and
an exact GitHub `editUrl`.

The sidebar groups product guides under separate **Navet** and **Navet Cards** parents.
Navet contains installation, dashboard guides, reference, and discovery pages. Navet Cards
loads its Home Assistant card guides from `docs/cards/` at `/cards/`.
Developer, brand, and support resources appear alongside the product groups.

## Discovery pages

- `/changelog/` loads current stable entries directly from the GitHub Releases API and follows them
  with the historical `CHANGELOG.md` archive through `src/components/ChangelogFeed.astro`. GitHub
  Releases are the canonical source for published release notes.
- `/resources/` is curated in `src/components/ResourcesHub.astro`. Add real showcases, guides, and
  videos there as they are published. Planned walkthroughs may appear as non-interactive entries
  clearly marked **Planned**, without invented dates, durations, or placeholder links. Do not
  duplicate guide content.

## Writing and navigation

- Overview pages help readers choose a next step; keep detailed instructions in the task guide.
- Begin each guide with its outcome and prerequisites. Use numbered lists for ordered steps,
  exact interface labels for actions, and a short expected result.
- Keep paragraphs focused and headings in sentence case. Explain provider limits where they
  affect the task; link to the compatibility matrix for the complete comparison.
- Put common tasks directly in the sidebar. Keep technical references separate from getting started.
- Add a sidebar entry in `astro.config.mjs` when introducing a common task guide; loading a page
  into the content collection makes it searchable but does not add it to the sidebar.
- Set an explicit `next` link when the learning path differs from sidebar order.
- Preserve public routes and heading anchors when editing; update incoming links when an anchor changes.
- Keep one Starlight `Search` instance in the shared header. Its search index mount uses a fixed ID.

## Local commands

The docs workspace requires Node.js 22.12 or newer, matching the supported Astro runtime.

- `pnpm docs:dev`
- `pnpm docs:build`
- `pnpm docs:preview`

Astro telemetry is disabled in all three commands.

## Cloudflare Pages

Create a separate Pages project for the documentation site with:

- project root: `apps/docs`
- build command: `pnpm --dir ../.. docs:build`
- output directory: `dist`
- production branch: `main`
- custom domain: `docs.navet.app`
- environment variable: `NODE_VERSION=22`

The output is fully static and includes Pagefind search data and a sitemap. Cloudflare should not
run a second framework preset or HTML minifier over the generated output.
The build also emits `_redirects` rules that keep duplicate screenshot URLs serving identical
images after their extra copies are removed from `dist`.
