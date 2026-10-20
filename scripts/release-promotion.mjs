import { execFileSync } from 'node:child_process';
import { appendFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateEvidence } from './release-evidence.mjs';

const versionPattern = '(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)';
const releasePattern = new RegExp(`^v${versionPattern}(?:-(beta|rc)\\.([1-9]\\d*))?$`);
const devPattern = new RegExp(`^navet-dev-${versionPattern}-dev\\.(\\d{14})$`);

/** Append only to existing runner command files, never an arbitrary environment path. */
export function appendActionsFile(filePath, content, runnerTemp = process.env.RUNNER_TEMP) {
  if (!runnerTemp) throw new Error('Actions output requires RUNNER_TEMP.');
  const commandRoot = realpathSync(path.join(runnerTemp, '_runner_file_commands'));
  const destination = realpathSync(path.resolve(filePath));
  if (!destination.startsWith(`${commandRoot}${path.sep}`) ||
      !statSync(destination).isFile()) {
    throw new Error('Actions output must be a runner command file.');
  }
  appendFileSync(destination, content);
}

/**
 * Parse a supported Dev, beta, RC, or stable tag into sortable version fields.
 * Return null for malformed tags or numeric fields outside the safe integer range.
 * @param {string} tag Git tag name to inspect.
 * @returns {object|null} Parsed tag identity, base version, channel, and sequence.
 */
export function parsePromotionTag(tag) {
  const release = releasePattern.exec(tag);
  const dev = devPattern.exec(tag);
  const match = release ?? dev;
  if (!match) return null;
  const version = match.slice(1, 4).map(Number);
  const sequence = Number(dev ? dev[4] : (release[5] ?? 0));
  if (!version.every(Number.isSafeInteger) || !Number.isSafeInteger(sequence)) return null;
  return {
    tag,
    version,
    base: version.join('.'),
    channel: dev ? 'dev' : (release[4] ?? 'stable'),
    sequence,
  };
}

/** Compare parsed tags by major, minor, then patch version in ascending order. */
const compareVersion = (a, b) => {
  for (let i = 0; i < 3; i += 1)
    if (a.version[i] !== b.version[i]) return a.version[i] - b.version[i];
  return 0;
};
/** Order candidates by base version, then RC above beta, then candidate number. */
const compareCandidate = (a, b) =>
  compareVersion(a, b) ||
  (a.channel === b.channel ? a.sequence - b.sequence : a.channel === 'rc' ? 1 : -1);

/**
 * Resolve an eligible source and unused target without mutating Git or publishing.
 * Blank overrides select channel defaults; all existing tags reserve their numbers.
 * @param {object} options Channel, optional overrides, known tags, and verified sources.
 * @returns {object} Promotion plan, or a no_promotion result requiring stable publication verification.
 * @throws {Error} If no eligible source exists or the requested promotion is invalid.
 */
export function resolvePromotion({
  channel = 'beta',
  sourceTag = '',
  releaseTag = '',
  tags,
  sources,
}) {
  if (!['beta', 'rc', 'stable'].includes(channel)) throw new Error('Choose beta, rc, or stable.');
  const parsedTags = tags.map(parsePromotionTag).filter(Boolean);
  const latestStable = parsedTags
    .filter((tag) => tag.channel === 'stable')
    .sort(compareVersion)
    .at(-1);
  const eligible = sources
    .map((source) => ({ ...source, ...parsePromotionTag(source.tag) }))
    .filter((source) => source.channel && source.channel !== 'stable');
  let source;
  if (sourceTag) {
    source = eligible.find((entry) => entry.tag === sourceTag);
    if (!source)
      throw new Error('The selected source is not a successfully published, main-backed release.');
  } else {
    const candidates = eligible
      .filter(
        (entry) =>
          ['beta', 'rc'].includes(entry.channel) &&
          (!releaseTag || entry.base === parsePromotionTag(releaseTag)?.base) &&
          (!latestStable || compareVersion(entry, latestStable) > 0),
      )
      .sort(compareCandidate);
    const devs = eligible
      .filter((entry) => entry.channel === 'dev')
      .sort((a, b) => a.sequence - b.sequence);
    source =
      channel === 'beta'
        ? devs.at(-1)
        : (candidates.at(-1) ?? (channel === 'rc' ? devs.at(-1) : undefined));
    if (!source) {
      if (channel === 'stable' && !releaseTag && latestStable)
        return { no_promotion: true, latest_stable: latestStable.tag };
      throw new Error(`No successfully published source is available for ${channel}.`);
    }
  }
  if (channel === 'beta' && source.channel !== 'dev') throw new Error('Beta must promote Dev.');
  if (channel === 'stable' && source.channel === 'dev')
    throw new Error('Stable must promote a tested beta or RC.');
  let base = source.base;
  if (source.channel === 'dev' && latestStable && compareVersion(source, latestStable) <= 0) {
    base = `${latestStable.version[0]}.${latestStable.version[1]}.${latestStable.version[2] + 1}`;
  }
  if (!releaseTag) {
    const sequence =
      Math.max(
        0,
        ...parsedTags
          .filter((entry) => entry.base === base && entry.channel === channel)
          .map((entry) => entry.sequence),
      ) + 1;
    releaseTag = `v${base}${channel === 'stable' ? '' : `-${channel}.${sequence}`}`;
  }
  const target = parsePromotionTag(releaseTag);
  if (!target || target.channel !== channel)
    throw new Error('Target tag must match the selected channel.');
  if (tags.includes(releaseTag))
    throw new Error('Target tag already exists. Recover it with Publish Release.');
  if (latestStable && compareVersion(target, latestStable) <= 0)
    throw new Error('Target version must be newer than the latest stable tag.');
  if (source.channel !== 'dev' && target.base !== source.base)
    throw new Error('Source and target must use the same base version.');
  if (source.channel === 'rc' && channel === 'rc' && target.sequence <= source.sequence)
    throw new Error('RC number must advance.');
  if (channel !== 'stable') {
    const highestSequence = Math.max(
      0,
      ...parsedTags
        .filter((entry) => entry.base === target.base && entry.channel === channel)
        .map((entry) => entry.sequence),
    );
    if (target.sequence <= highestSequence)
      throw new Error(
        `${channel === 'rc' ? 'RC' : 'Beta'} number must advance beyond every existing tag for this version.`,
      );
  }
  return { source_tag: source.tag, release_tag: releaseTag, source_sha: source.sha };
}

/** Confirm publication before reporting that automatic stable promotion has nothing to do. */
export async function resolveVerifiedPromotion(options, verifyStable) {
  const plan = resolvePromotion(options);
  if (!plan.no_promotion) return plan;
  if (!(await verifyStable(plan.latest_stable)))
    throw new Error(
      `${plan.latest_stable} is tagged, but successful publication could not be verified. Use Publish Release to recover it.`,
    );
  return {
    ...plan,
    message: `${plan.latest_stable} is already published. No newer successfully published beta/RC is available to promote.`,
  };
}

/**
 * Collect published prereleases whose commits and publication evidence are eligible.
 * Callbacks verify tag ancestry and channel-specific publication success; API errors
 * propagate so an unavailable check cannot silently select an older source.
 * @param {object} options Release records and injected verification callbacks.
 * @returns {Promise<Array<{tag: string, sha: string}>>} Eligible source identities.
 */
export async function collectPromotionSources({
  releases,
  inspectTag,
  devSucceeded,
  candidateSucceeded,
}) {
  const sources = [];
  for (const release of releases) {
    const parsed = parsePromotionTag(release.tag_name);
    if (release.draft || !release.prerelease || !parsed || parsed.channel === 'stable') continue;
    const sha = inspectTag(parsed);
    if (!sha) continue;
    const successful =
      parsed.channel === 'dev'
        ? await devSucceeded(parsed.tag, sha)
        : await candidateSucceeded(release, sha);
    if (successful) sources.push({ tag: parsed.tag, sha });
  }
  return sources;
}

/** Verify release evidence against the documented package namespace and publication run. */
export async function candidatePublicationSucceeded(release, sha, { readEvidence, readRun }) {
  const asset = release.assets?.find((entry) => entry.name === 'navet-release-evidence.json');
  if (!asset || !release.assets.some((entry) => entry.name === 'navet-release-notes.json'))
    return false;
  const evidence = await readEvidence(asset);
  try {
    // Repository ownership does not change the published container package namespace.
    validateEvidence(evidence, { tag: release.tag_name, sha, owner: 'awesomestvi' });
  } catch {
    return false;
  }
  const run = await readRun(evidence.runId);
  return run.conclusion === 'success' && run.path === '.github/workflows/release.yml';
}

/**
 * Read workflow inputs, discover eligible releases through Git and GitHub, and emit
 * the resolved plan to stdout and optional Actions output and summary files.
 * This entrypoint never creates tags, dispatches workflows, or publishes releases.
 * @returns {Promise<void>}
 */
async function main() {
  const git = (...args) =>
    execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const repo = process.env.GITHUB_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '')) throw new Error('Invalid repository.');
  const api = (path) =>
    JSON.parse(execFileSync('gh', ['api', `repos/${repo}/${path}`], { encoding: 'utf8' }));
  const releases = JSON.parse(
    execFileSync('gh', ['api', '--paginate', '--slurp', `repos/${repo}/releases?per_page=100`], {
      encoding: 'utf8',
    }),
  ).flat();
  const sourceTag = (process.env.SOURCE_TAG ?? '').trim();
  const channel = process.env.RELEASE_CHANNEL || 'beta';
  const verifyPublication = (release, sha) =>
    candidatePublicationSucceeded(release, sha, {
      readEvidence: (asset) =>
        JSON.parse(execFileSync('gh', [
          'api', '-H', 'Accept: application/octet-stream',
          `repos/${repo}/releases/assets/${asset.id}`,
        ], { encoding: 'utf8' })),
      readRun: (id) => api(`actions/runs/${id}`),
    });
  if (sourceTag && !parsePromotionTag(sourceTag)) throw new Error('Invalid source tag.');
  const candidates = releases.filter((r) =>
    sourceTag
      ? r.tag_name === sourceTag
      : channel === 'beta'
        ? r.tag_name.startsWith('navet-dev-')
        : channel !== 'stable' || !r.tag_name.startsWith('navet-dev-'),
  );
  const sources = await collectPromotionSources({
    releases: candidates,
    inspectTag(parsed) {
      try {
        if (git('cat-file', '-t', `refs/tags/${parsed.tag}`) !== 'tag') return null;
        const sha = git('rev-parse', '--verify', `refs/tags/${parsed.tag}^{commit}`);
        git('merge-base', '--is-ancestor', sha, 'refs/remotes/origin/main');
        if (
          parsed.channel === 'dev' &&
          !/^Source-Branch: main$/m.test(
            git('for-each-ref', '--format=%(contents)', `refs/tags/${parsed.tag}`),
          )
        )
          return null;
        return sha;
      } catch {
        return null;
      }
    },
    devSucceeded(tag, sha) {
      return api(
        `actions/workflows/dev-tag-release.yml/runs?head_sha=${sha}&status=success&per_page=100`,
      ).workflow_runs.some(
        (run) => run.head_branch === tag && run.head_sha === sha && run.conclusion === 'success',
      );
    },
    candidateSucceeded: verifyPublication,
  });
  const plan = await resolveVerifiedPromotion(
    {
      channel,
      sourceTag,
      releaseTag: (process.env.RELEASE_TAG ?? '').trim(),
      tags: git('tag', '--list').split('\n'),
      sources,
    },
    async (tag) => {
      const release = releases.find(
        (entry) => entry.tag_name === tag && !entry.draft && !entry.prerelease,
      );
      if (!release) return false;
      const sha = git('rev-parse', '--verify', `refs/tags/${tag}^{commit}`);
      return verifyPublication(release, sha);
    },
  );
  console.log(JSON.stringify(plan, null, 2));
  if (process.env.GITHUB_OUTPUT)
    appendActionsFile(
      process.env.GITHUB_OUTPUT,
      Object.entries(plan)
        .map(([k, v]) => `${k}=${v}\n`)
        .join(''),
    );
  if (process.env.GITHUB_STEP_SUMMARY)
    appendActionsFile(
      process.env.GITHUB_STEP_SUMMARY,
      plan.no_promotion
        ? `## Nothing to promote\n\n${plan.message}\n\nNo tag was created and no publication was dispatched.\n`
        : `## Selected promotion\n\n- Source: \`${plan.source_tag}\`\n- Target: \`${plan.release_tag}\`\n- Commit: \`${plan.source_sha}\`\n\n${process.env.PREVIEW_ONLY === 'true' ? 'Preview only: no tag or release will be published. Pin these tags with the overrides when publishing.' : 'Publication requested. Source evidence is verified before creating the tag.'}\n\n### Eligible sources (up to 20)\n\n${sources
        .slice(0, 20)
        .map((s) => `- \`${s.tag}\``)
        .join('\n')}\n`,
    );
  if (plan.no_promotion) console.log(`::notice::${plan.message}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
