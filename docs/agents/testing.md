# Test execution and tiers

For assertions, fixtures and Keep/Rewrite/Delete decisions, use the
[testing guide](../../ai/skills/testing-architecture.md). For provider test layers, use the
[provider strategy](../testing/provider-testing-strategy.md).

| Tier | Purpose | Execution |
| --- | --- | --- |
| 1 | Release-critical provider/runtime/auth/resource/security contracts | Curated files in `scripts/test-tier-manifest.mjs` |
| 2 | Blocking app store/service/platform contracts | Curated files in the same manifest |
| 3 | Broad unit regression | Full unit suite locally; CI excludes files already run by tiers 1/2 |
| 4 | Test-quality rewrite/delete candidates | Review classification, not a separate executable lane |

- Runtime-impacting PRs require tiers 1, 2, 3 and Docker validation. Non-runtime PRs retain
  quality/script checks and affected site builds. Verify applicability in `.github/workflows/ci.yml`
  and `scripts/pipeline-impact.mjs` rather than inferring it from a tier name.
- The pre-push hook runs typecheck and `pnpm test:blocking`, which executes the complete Tier 1/2
  union once and reports passing file/test counts for each tier. Individual tier commands and CI
  lanes keep their existing membership.
- Unit tests use `unit-node` for scripts and pure core contracts, and `unit-browser` for remaining
  suites with jsdom and app browser setup. Use `--project 'unit*'` to select both environments;
  Storybook retains its separate browser project and setup.
- Local `pnpm test:tier3` runs the full unit suite; CI uses `--exclude-blocking` without deleting
  tests. Storybook interaction coverage is a separate browser surface.
- Dev publication runs Tier 1 source checks and verifies published image digests. Later release
  versions require successful source evidence and their own actual-image runtime verification.
  See the [release workflow](../release-workflow.md).
- Use the [command guide](commands.md) for focused local checks and the
  [tier inventory](../testing/test-tier-inventory.md) for rationale. Inspect the current test
  before applying a rewrite label; an inventory entry alone cannot justify deletion or weakening.
- Changing a runnable tier requires updating its manifest, rationale and affected CI together.
