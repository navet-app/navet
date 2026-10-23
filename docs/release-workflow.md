# Release Workflow

Navet has two independent delivery paths: continuous public sites and versioned installable
releases. A product release does not redeploy or smoke-test the public sites.

## GitHub Ownership And Access

The `navet-app` organization owns `navet`, `navet-cards`, and `navet-home-assistant`.
Release workflows run from `navet-app/navet` and synchronize the Home Assistant integration
to `navet-app/navet-home-assistant`.

Before publishing, install the GitHub Apps used by `NAVET_HACS_APP_ID` and
`NAVET_NISSE_CLIENT_ID` in `navet-app` with access to the repositories their workflows target.
Connect Cloudflare Pages to the organization repositories and verify its checks on a pull request.
GitHub App credentials identify an app; repository access comes from its organization installation.

## Container Registry

Published images use `ghcr.io/awesomestvi/navet` and
`ghcr.io/awesomestvi/{arch}-navet-addon`. These package paths remain stable for Docker users
and Home Assistant installations. Repository ownership and package namespaces are independent.
Publishing to the personal package namespace requires `NAVET_GHCR_TOKEN`, a classic personal
access token owned by `awesomestvi` with `write:packages` access, stored as a GitHub Actions
secret in `navet-app/navet`. Runtime verification pulls the public images anonymously.

## Pull Requests And Public Sites

Every pull request adds a validated `.changes/*.yaml` fragment. Use `internal` and an empty
audience list when there is no user-facing change.
Use `pnpm release:status` to see the pending fragments against the last completed stable release;
add `--all` to see released files as well. The command reads publication evidence and does not
change repository files.

CI always runs quality checks, type checking, release-fragment validation, and script tests
(through the product test lanes for runtime changes, or a focused script lane otherwise).
A conservative changed-input policy selects product tests, builds, and public-site previews.
Unknown inputs, shared code, dependency changes, and build-tool changes take the broad path.
The Product review gate fails if an applicable lane fails, is cancelled, or is unexpectedly
skipped. An unaffected lane is deliberately skipped.

Runtime changes run Tier 1, Tier 2, Tier 3, Docker checks, and responsive visual review. CI's Tier 3
lane excludes only the files already covered by its required Tier 1 and Tier 2 lanes; the local
`pnpm test:tier3` command still runs the complete suite. Visual
review downloads the demo built by the quality job rather than building it again. Storybook's
browser interaction suite supplies local interaction diagnostics; affected Storybook builds
are required by CI. Verify baseline failures against the current `main` commit.

Cloudflare Pages owns site deployment:

| Project | Build command | Output |
| --- | --- | --- |
| `navet-app` | `pnpm website:build:app` | `apps/website/dist` |
| `navet-app-demo` | `pnpm build:demo` | `apps/demo/dist` |
| `navet-app-storybook` | `pnpm storybook:build` | `apps/storybook/dist` |
| `navet-app-docs` | `pnpm docs:build` | `apps/docs/dist` |

Affected branch pushes produce previews. Affected pushes to `main` update production.
CI build checks and Cloudflare builds are separate: CI verifies the change; Cloudflare owns
the deployed artifact.

`scripts/pages-policy.mjs` defines the shared conservative path policy. The merge gate checks
successful Cloudflare check runs from the Cloudflare app for affected projects. It uses the exact
PR head, or an ancestor only after proving every watched input is unchanged. This handles a
fragment-only follow-up commit for which Cloudflare correctly skips a new preview. A current
pending or failed check cannot be bypassed by an older success. Keep live build-watch configuration
synchronized with `scripts/pages-policy.mjs`. Public-site availability monitoring is separate
from release publication.

## Dev Builds

`Prepare Navet Dev Publish` runs after a PR merges into protected `main`. It classifies the merged
diff and creates an annotated `navet-dev-0.x.y-dev.YYYYMMDDHHMMSS` tag only for runtime-impacting
changes. Version-only add-on metadata, changelog fragments, website, docs, and automation-only
changes do not create another product image.

A maintainer can dispatch that workflow from `main` to request a Dev build explicitly.
Named-branch builds remain available through `pnpm release:dev-publish -- --push` from a clean,
validated branch. Publishing requires explicit maintainer authorization.

`Publish Navet Dev` validates tag provenance and runs the release-critical source checks once.
It builds exact-version standalone and add-on images, pulls the resulting digests, and runs the
runtime suite against those images on AMD64 and ARM64. This checks the installed product,
including Ingress and persisted restart, without building another pair of test images.

After verification, main-backed builds can advance `dev` and `edge`. An older queued build
cannot roll those aliases back to an ancestor commit. Named-branch builds publish exact versions
without moving shared aliases. Dev builds do not publish HACS or update supervised App metadata.

## Beta, Release Candidates, And Stable

1. Run **Promote Navet Release** from `main`. Choose `beta`, `rc`, or `stable` in `channel`.
   Leave `source_tag` and `release_tag` blank for automatic selection, or enter exact tags to
   override the defaults.
   When starting from Dev, choose `patch` or `minor` in **Version bump** (`version_bump`) to
   advance from the latest stable tag. For `0.18.7 → 0.19.0`, choose `minor` and leave
   `release_tag` blank. The default `automatic` preserves automatic version selection.
2. Leave `preview_only` enabled to check the selected source, commit, target version, and eligible
   sources in the run summary without publishing. GitHub's form cannot load live tag choices;
   selection happens when the workflow runs.
3. Run again with `preview_only` disabled to publish. Automatic selection is recalculated each
   run. To reproduce the exact previewed plan, copy both selected tags into `source_tag` and
   `release_tag`. If another tag for the same version and channel appears before publishing,
   rerun the preview with `release_tag` blank and review the newly selected target before publishing.
   To promote an installed candidate with an automatic target, pin only `source_tag`.
4. Wait for **Publish Release** to complete. It builds correctly versioned artifacts, validates
   their actual registry digests, publishes HACS and the panel archive, and completes the
   protected Home Assistant metadata PR.
5. Install that exact beta/RC in your Docker/Home Assistant setup and test the relevant behavior.
6. To publish stable, select `stable`, disable `preview_only`, and enable `installation_tested`.
   This confirms you tested the selected source. Pin `source_tag` to your installed beta/RC if
   a newer candidate could have appeared since testing. The stable target version is automatic.

For beta, automatic selection uses the newest successfully published, main-backed Dev tag by
its build timestamp. RC uses the highest eligible beta/RC version, falling back to Dev when
there is no candidate. Stable uses the highest eligible beta/RC newer than the latest stable
version; RC ranks above beta for the same base version. Failed or incomplete publications are
not eligible. The full source-evidence check still runs before any tag is created.

When automatic stable selection finds no newer eligible beta/RC, it verifies the latest stable
release's evidence and successful publication run. If verified, the promotion succeeds with a
“Nothing to promote” summary naming the already-published version; it creates no tag and dispatches
no publication. If only the tag exists or publication is incomplete, the run fails with recovery
guidance for **Publish Release**. Explicit source or target overrides still require a valid new promotion.

Candidate numbers, including explicit overrides, must advance past every existing tag for that
version and channel, including tags from failed attempts. With `version_bump: automatic`, a Dev
build's version is used when it is newer than the latest stable tag; otherwise the next stable
patch version is used. For example, after `v0.17.1`, a Dev build based
on `0.17.1` targets `v0.17.2-beta.1`, or `v0.17.2-beta.2` if beta.1 already exists. Set
`version_bump` to `patch` or `minor` to calculate the next version from the latest stable tag;
these choices require an existing stable tag. An exact `release_tag` overrides the bump choice,
including when copying a previewed plan. Beta/RC sources retain their base version when promoted,
regardless of the bump choice. Existing tags cannot be overwritten; use **Publish Release** for
recovery of an already-created target.

Beta must start from Dev. An RC can start from Dev, beta, or another RC. Stable must start from a
successfully published beta/RC of the same base version. Source and target tags resolve to the
same commit already contained in protected `main`. The source release's evidence records the
tested image digests and publication run; missing, incomplete, or changed evidence blocks promotion.

The maintainer dispatch is the publication decision. The `beta` and `production` environments
hold release credentials and allow only trusted `main` workflows. Public-site checks do not gate this process.

### Artifact Identity

Each release version is built with its own version and channel metadata. Stable is a new,
verified package of the tested source commit, not a byte-identical retag of a beta image.
That distinction is intentional: Docker retagging cannot change embedded application metadata.
Both stable and candidate artifacts must pass the actual-image runtime checks.

Exact-version image tags are never overwritten by this process. A retry reuses the existing
digest, checks its version, channel and source commit, and runs its runtime validation again.
Registry authentication or connectivity errors fail the workflow; they are not interpreted as
permission to rebuild an existing version.

The Home Assistant panel is built once per version and reused in both the downloadable archive
and HACS export. Existing published panel archives are reused. Existing HACS tags are checked
against the expected payload, never force-moved.

The workflow creates a `navet-release-evidence.json` asset recording the source commit, version,
image digests, panel and release-note bundle digests, and publication run. It is verification metadata, not an application package;
a recovery run can refresh this record after rechecking the same immutable artifacts. A source
release is promotable only after the recorded run finishes successfully.

### Channels And Completion

Standalone image tags:

- Dev: exact `0.x.y-dev.YYYYMMDDHHMMSS`; main-backed builds also advance `dev` and `edge`.
- Prerelease: exact `vX.Y.Z-beta.N` or `vX.Y.Z-rc.N`, plus `beta` after verification.
- Stable: exact `vX.Y.Z`, plus `X.Y` and `latest` after verification.

Add-on images use `{arch}-navet-addon` repositories and exact versions without the leading `v`.
Use a version plus the recorded `sha256:` digest to identify an artifact.

Release publication is serialized because HACS and moving aliases are shared resources.
Moving channels are updated by verified digest only after artifacts and the metadata PR complete.
Older/equal-version retries cannot replace a channel with different bytes. Distribution across
GitHub, GHCR and Home Assistant is not atomic: an interrupted run may expose exact-version
artifacts before it completes. Treat the final successful run and evidence as completion, not
the presence of an individual tag.

### Recovery

Release orchestration runs from trusted `main`; `release_tag` is an input, not the workflow ref.
Build jobs explicitly check out the release commit. This allows a corrected orchestrator to
recover an older release without moving its Git tag.

To recover, dispatch **Publish Release** from `main` with the existing `release_tag`, its
annotated `source_tag`, and installation confirmation for stable. Rerunning an old Actions run
still uses its original workflow revision; it does not pick up newly merged fixes.

If an existing artifact has incorrect identity or conflicting contents, create a new candidate
version. Never delete or overwrite a published version to make a retry succeed. Releases created
without verified source evidence must be rebuilt as a new candidate before stable promotion.

## Changelog And Home Assistant Distribution

The release tag is the published version; GitHub Releases are the published changelog.
`package.json` describes the source line, not the latest published release.

Website and documentation clients read stable GitHub Releases directly and save validated notes
in versioned browser storage. If GitHub cannot be reached, they show saved notes or the bundled
historical archive, with a visible freshness warning instead of claiming that it is the latest
release. Browser storage is optional; unavailable storage does not prevent loading fresh notes.
Neither site requires a release-specific source update or redeploy. A release with no user-facing
changes still appears with its version and explanatory note. Combined improvement/bug-fix groups
appear under both documentation filters.
Dev notes describe the merged change; beta/RC/stable notes include all user-facing fragments
since the previous stable tag, filtered by audience where appropriate.

The release workflow reads fragment contents from the selected release commit, not the current
checkout. It generates one `navet-release-notes.json` bundle containing general, HACS, and Home
Assistant notes with source/base commits and content hashes. All distribution jobs consume that
same bundle. Existing release bodies, versioned changelog entries, and published note evidence
must match on recovery; conflicts stop the run rather than silently replacing published notes.

The monorepo owns Home Assistant integration and add-on sources under `platform/home-assistant`.
HACS receives the integration export in `navet-app/navet-home-assistant`. The Home Assistant App
repository is `navet-app/navet`, with root `repository.yaml`.

After artifact verification, automation opens the small App metadata PR and merges it through
normal branch protection without bypass privileges. This PR gets quality/script checks and
metadata-aware classification, not another full product release. Changes to config fields other
than the version take the product-validation path.

The main GitHub announcement is published only after the App metadata PR merges. Before moving
channels, publication verifies both GitHub release bodies, the tagged HACS changelog, the merged
App version and changelog, and the published notes bundle. Stable also checks the canonical
latest-release API. `Verify Complete Release` completes only after these checks and channel
updates succeed. Public-site availability does not gate installation releases; the sites consume
the verified canonical release record. HACS and App metadata can become visible before the last
step: distribution remains non-atomic, and the final successful workflow is the completion signal.

For stable releases, Navet Nisse comments on issues linked as closed by PRs merged between the
previous stable tag and the released commit. Each comment links to the stable GitHub release. This
runs after channel verification and skips comments already made for that tag, so a recovery run can
finish any missed replies. Notification failures remain visible in the job log but do not invalidate
an otherwise verified and published stable release.

## Activating Scoped Deployments

Configure hosted deployment settings from a checkout matching the reviewed workflows on `main`:

1. Require the GitHub Actions **Product review gate** in the active `main-published` ruleset.
2. Configure local `CLOUDFLARE_ACCOUNT_ID` and a `CLOUDFLARE_API_TOKEN` scoped to edit these Pages
   projects. Authenticate `gh` with repository administration access. Never commit these values.
3. Run `node scripts/pipeline-rollout.mjs` to inspect the dry-run policy.
4. With no release in progress, run `node scripts/pipeline-rollout.mjs --apply`.

The command checks that the reviewed gate files match `main`, saves a recovery snapshot, preserves
unrelated branch rules, and replaces unconditional Pages requirements with the affected-site
gate. It then configures the Pages filters and restricts beta/production environments to `main`.
It refuses unexpected existing protections rather than silently replacing them.

Validate the rollout with an automation-only PR (no site deployments), a docs-only PR (docs),
and a shared-runtime change (broad checks and dependent sites). Inspect the exact-head gate and
deployment results before declaring the hosted rollout complete.

## Manual Responsibilities

Maintainers choose versions, review release fragments, install and test candidates, authorize
stable publication, and decide whether a rollback or new fix release is appropriate.
Request grounded announcement drafts explicitly when needed; publication to community
channels requires separate approval.
