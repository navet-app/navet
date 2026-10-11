import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const workflowPath = resolve(process.cwd(), '.github/workflows/release-tag-publish.yml');
const workflow = parse(readFileSync(workflowPath, 'utf8'));
const releaseWorkflow = parse(
  readFileSync(resolve(process.cwd(), '.github/workflows/release.yml'), 'utf8'),
);

describe('production release tag publisher', () => {
  it('resolves optional tags and only publishes outside preview without advancing protected main', () => {
    expect(workflow.on.workflow_dispatch.inputs.source_tag).toMatchObject({
      type: 'string',
    });
    expect(workflow.on.workflow_dispatch.inputs.release_tag).toMatchObject({
      type: 'string',
    });
    expect(workflow.on.workflow_dispatch.inputs.source_tag.required).not.toBe(true);
    expect(workflow.on.workflow_dispatch.inputs.release_tag.required).not.toBe(true);
    expect(workflow.on.workflow_dispatch.inputs.channel).toMatchObject({
      type: 'choice',
      default: 'beta',
      options: ['beta', 'rc', 'stable'],
    });
    expect(workflow.on.workflow_dispatch.inputs.preview_only.default).toBe(true);
    expect(workflow.concurrency).toEqual({
      group: 'navet-release-promotion',
      'cancel-in-progress': false,
    });
    expect(workflow.permissions).toEqual({ actions: 'write', contents: 'write' });

    const job = workflow.jobs['promote-release'];
    const checkout = job.steps.find((step) => step.name === 'Checkout protected main');
    const validate = job.steps.find((step) => step.name === 'Validate promotion');
    const publish = job.steps.find((step) => step.name === 'Create and push promoted release tag');
    const dispatch = job.steps.find((step) => step.name === 'Dispatch artifact promotion');
    const selection = job.steps.find((step) => step.id === 'selection');
    const evidence = job.steps.find(
      (step) => step.name === 'Require successful source publication before creating a tag',
    );
    expect(selection.run).toContain('node scripts/release-promotion.mjs');
    expect(selection.run).toContain('git fetch --force origin main --tags');
    for (const step of [validate, publish, dispatch, evidence]) {
      expect(step.env.SOURCE_TAG).toBe('${{ steps.selection.outputs.source_tag }}');
    }
    for (const step of [validate, publish, dispatch]) {
      expect(step.env.RELEASE_TAG).toBe('${{ steps.selection.outputs.release_tag }}');
    }
    for (const step of [publish, dispatch]) expect(step.if).toBe('${{ !inputs.preview_only }}');
    expect(validate.run).toContain('"${PREVIEW_ONLY}" == true || "${INSTALLATION_TESTED}" == true');
    expect(evidence.run).toBe('node scripts/release-evidence.mjs verify-source');
    expect(job.steps.indexOf(evidence)).toBeLessThan(job.steps.indexOf(publish));

    expect(checkout.with.ref).toBe('main');
    expect(checkout.with['fetch-depth']).toBe(0);
    expect(validate.run).toContain('git merge-base --is-ancestor');
    expect(validate.run).toContain(
      'A stable release must promote a tested beta or release candidate.',
    );
    expect(publish.run).toContain('git tag -a');
    expect(publish.run).toContain('Promoted-From: ${SOURCE_TAG}');
    expect(publish.run).toContain(
      'git push origin "refs/tags/${RELEASE_TAG}:refs/tags/${RELEASE_TAG}"',
    );
    expect(publish.run).not.toContain('refs/heads/main');
    expect(dispatch.run).toBe(
      'gh workflow run release.yml --ref main -f release_tag="${RELEASE_TAG}" -f source_tag="${SOURCE_TAG}" -f installation_tested="${INSTALLATION_TESTED}"',
    );
  });

  it('builds version-correct artifacts and tests their digests before distribution', () => {
    expect(releaseWorkflow.on.workflow_dispatch.inputs.source_tag.required).toBe(true);

    const contextRun = releaseWorkflow.jobs['release-context'].steps.find(
      (step) => step.name === 'Resolve and validate promotion',
    ).run;
    expect(contextRun).toContain('Promoted-From:');
    expect(contextRun).toContain('scripts/release-notes-bundle.mjs');
    expect(contextRun).toContain('head -n 1 || true');
    expect(contextRun).not.toContain('scripts/check-release-surfaces.mjs');

    expect(releaseWorkflow.jobs.images.needs).toContain('source-evidence');
    expect(releaseWorkflow.jobs.images.with.sha).toContain('release_sha');
    expect(releaseWorkflow.jobs.runtime.needs).toContain('images');
    expect(releaseWorkflow.jobs.runtime.uses).toBe('./.github/workflows/release-runtime.yml');
    expect(releaseWorkflow.jobs['sync-hacs'].needs).toContain('runtime');
    expect(releaseWorkflow.jobs['publish-channels'].needs).toContain('verify-release');
    expect(releaseWorkflow.jobs['publish-channels'].needs).toContain('publish-addon-metadata');
    expect(releaseWorkflow.jobs['release-context'].if).toBe("github.ref == 'refs/heads/main'");
    expect(contextRun).toContain('INSTALLATION_TESTED');
    // Keep: user-selected release tags may execute only code already admitted to main.
    expect(contextRun).toContain('git merge-base --is-ancestor "${RELEASE_SHA}" refs/remotes/origin/main');
    const panelSteps = releaseWorkflow.jobs['custom-panel-artifact'].steps;
    expect(panelSteps.find((step) => step.name === 'Setup pnpm').with.cache).toBe(false);
    expect(releaseWorkflow.concurrency.group).toBe('navet-release-publication');
    const imageWorkflow = parse(readFileSync('.github/workflows/release-image.yml', 'utf8'));
    const build = imageWorkflow.jobs.image.steps.find(
      (step) => step.name === 'Build correctly versioned candidate',
    );
    expect(build.if).toContain("exists != 'true'");
    expect(build.with.tags).not.toMatch(/:beta|:latest|:sha-/);
    expect(build.with['build-args']).toContain('NAVET_VERSION=${{ inputs.version }}');
    expect(build.with['build-args']).toContain('NAVET_RELEASE_CHANNEL=${{ inputs.channel }}');
    expect(
      imageWorkflow.jobs.image.strategy.matrix.include.map((target) => target.platforms),
    ).toEqual(['linux/amd64,linux/arm64', 'linux/amd64', 'linux/arm64']);

    const exportStep = releaseWorkflow.jobs['sync-hacs'].steps.find(
      (step) => step.name === 'Export HACS payload',
    );
    expect(exportStep.env.NAVET_SKIP_HA_PANEL_BUILD).toBe('1');
    expect(releaseWorkflow.jobs['sync-hacs'].needs).toContain('custom-panel-artifact');
    const hacsCommands = releaseWorkflow.jobs['sync-hacs'].steps
      .map((step) => step.run ?? '')
      .join('\n');
    expect(hacsCommands).not.toMatch(/git tag -fa|git push.*--force/);
    expect(exportStep.env.NAVET_RELEASE_VERSION).toContain('package_version');
    expect(exportStep.env.NAVET_RELEASE_NOTES_FILE).toContain('release-notes/hacs.md');

    expect(releaseWorkflow.jobs['sync-addon-repository']).toBeUndefined();
    const metadataJob = releaseWorkflow.jobs['publish-addon-metadata'];
    const tokenStep = metadataJob.steps.find(
      (step) => step.name === 'Create GitHub App token for metadata PR',
    );
    const prepareStep = metadataJob.steps.find(
      (step) => step.name === 'Prepare and open metadata PR',
    );
    const mergeStep = metadataJob.steps.find(
      (step) => step.name === 'Wait for required checks and merge metadata PR',
    );
    expect(metadataJob.needs).toContain('verify-release');
    expect(tokenStep.with.repositories).toBe('navet');
    expect(prepareStep.run).toContain('scripts/prepare-addon-release-metadata.mjs');
    expect(prepareStep.run).toContain('gh pr create');
    expect(prepareStep.run).toContain('automation/release-metadata-${RELEASE_TAG}');
    expect(mergeStep.run).toContain('gh pr checks');
    expect(mergeStep.run).toContain('gh pr merge');
    expect(mergeStep.run).not.toContain('--admin');
    expect(mergeStep.run).toContain('--match-head-commit');
    expect(metadataJob.steps.find((step) => step.id === 'metadata_content').run).toContain(
      'verify-addon-release-metadata.mjs',
    );

    const verificationSteps = releaseWorkflow.jobs['verify-release'].steps;
    expect(releaseWorkflow.jobs['github-release'].needs).toContain('publish-addon-metadata');
    expect(releaseWorkflow.jobs['verify-release'].needs).not.toContain('github-release');
    expect(releaseWorkflow.jobs['verify-distribution'].needs).toContain('github-release');
    expect(releaseWorkflow.jobs['publish-channels'].needs).toContain('verify-distribution');
    expect(releaseWorkflow.jobs['publish-channels'].name).toBe('Verify Complete Release');
    const issueJob = releaseWorkflow.jobs['notify-included-issues'];
    expect(issueJob.needs).toEqual(['release-context', 'publish-channels']);
    expect(issueJob['continue-on-error']).toBe(true);
    expect(issueJob.if).toContain("prerelease == 'false'");
    expect(issueJob.environment).toBe('production');
    expect(issueJob.permissions).toEqual({
      contents: 'read',
      'pull-requests': 'read',
      issues: 'read',
    });
    expect(issueJob.steps.find((step) => step.id === 'nisse_token').with).toMatchObject({
      repositories: 'navet',
      'permission-issues': 'write',
      'client-id': '${{ secrets.NAVET_NISSE_CLIENT_ID }}',
      'private-key': '${{ secrets.NAVET_NISSE_APP_PRIVATE_KEY }}',
    });
    expect(issueJob.steps.at(-1).run).toBe('node scripts/notify-release-issues.mjs');
    expect(JSON.stringify(releaseWorkflow)).not.toContain('scripts/generate-release-notes.mjs');
    expect(verificationSteps.map((step) => step.run ?? '').join('\n')).not.toMatch(
      /https:\/\/(?:demo\.|docs\.|storybook\.)?navet\.app/,
    );
  });
});
