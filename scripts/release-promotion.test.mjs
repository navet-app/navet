import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  appendActionsFile,
  collectPromotionSources,
  candidatePublicationSucceeded,
  parsePromotionTag,
  resolvePromotion,
  resolveVerifiedPromotion,
} from './release-promotion.mjs';

// Keep the existing promotion contracts; add coverage for the runner-file boundary.
it('appends runner outputs but rejects traversal, sibling paths and symlink escapes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'navet-actions-output-'));
  try {
    const commands = path.join(root, '_runner_file_commands');
    fs.mkdirSync(commands);
    const output = path.join(commands, 'step_summary_test');
    const outside = path.join(root, 'outside');
    fs.writeFileSync(output, 'before\n');
    fs.writeFileSync(outside, 'unchanged');
    const link = path.join(commands, 'link');
    fs.symlinkSync(outside, link);
    const sibling = path.join(root, '_runner_file_commands-other');
    fs.mkdirSync(sibling);
    fs.writeFileSync(path.join(sibling, 'output'), 'unchanged');
    appendActionsFile(output, 'after\n', root);
    expect(fs.readFileSync(output, 'utf8')).toBe('before\nafter\n');
    for (const destination of [outside, path.join(commands, '..', 'outside'), link,
      path.join(sibling, 'output'), commands]) {
      expect(() => appendActionsFile(destination, 'bad', root)).toThrow('runner command file');
    }
    expect(fs.readFileSync(outside, 'utf8')).toBe('unchanged');
    expect(fs.readFileSync(path.join(sibling, 'output'), 'utf8')).toBe('unchanged');
    expect(() => appendActionsFile(output, 'bad', '')).toThrow('RUNNER_TEMP');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it.each(['before-open', 'after-open'])('does not follow a replacement output symlink %s', (timing) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'navet-actions-race-'));
  const commands = path.join(root, '_runner_file_commands');
  fs.mkdirSync(commands);
  const output = path.join(commands, 'step_summary_test');
  const original = path.join(commands, 'original');
  const outside = path.join(root, 'outside');
  fs.writeFileSync(output, 'before\n');
  fs.writeFileSync(outside, 'unchanged');
  const replaceOutput = () => {
    fs.renameSync(output, original);
    fs.symlinkSync(outside, output);
  };
  const method = timing === 'before-open' ? 'openSync' : 'fstatSync';
  const operation = fs[method];
  const spy = vi.spyOn(fs, method).mockImplementationOnce((...args) => {
    replaceOutput();
    return operation(...args);
  });
  try {
    if (timing === 'before-open') {
      expect(() => appendActionsFile(output, 'after\n', root)).toThrow();
      expect(fs.readFileSync(original, 'utf8')).toBe('before\n');
    } else {
      appendActionsFile(output, 'after\n', root);
      expect(fs.readFileSync(original, 'utf8')).toBe('before\nafter\n');
    }
    expect(fs.readFileSync(outside, 'utf8')).toBe('unchanged');
  } finally {
    spy.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const dev = 'navet-dev-0.17.1-dev.20260920120000';
const olderDev = 'navet-dev-0.17.1-dev.20260919120000';
const sha = 'a'.repeat(40);
const source = (tag) => ({ tag, sha });
const plan = (options = {}) =>
  resolvePromotion({
    tags: ['v0.17.1'],
    sources: [source(dev)],
    ...options,
  });

describe('promotion defaults', () => {
  it('selects newest eligible Dev by timestamp and advances beyond reserved beta tags', () => {
    expect(
      plan({
        sources: [source(dev), source(olderDev)],
        tags: ['v0.17.1', 'v0.17.2-beta.1', 'v0.17.2-beta.3'],
      }),
    ).toEqual({ source_tag: dev, release_tag: 'v0.17.2-beta.4', source_sha: sha });
  });
  it('uses newer Dev base versions and supports the first release', () => {
    expect(plan({ sources: [source('navet-dev-0.18.0-dev.20260920120000')] }).release_tag).toBe(
      'v0.18.0-beta.1',
    );
    expect(plan({ tags: [] }).release_tag).toBe('v0.17.1-beta.1');
  });
  it('supports exact source and target overrides', () => {
    expect(
      plan({
        sourceTag: olderDev,
        releaseTag: 'v0.18.0-beta.1',
        sources: [source(dev), source(olderDev)],
      }),
    ).toMatchObject({ source_tag: olderDev, release_tag: 'v0.18.0-beta.1' });
  });
  it('advances RC for the highest candidate, falling back to Dev only without candidates', () => {
    expect(
      plan({
        channel: 'rc',
        sources: [source(dev), source('v0.17.2-beta.4')],
        tags: ['v0.17.1', 'v0.17.2-rc.2'],
      }).release_tag,
    ).toBe('v0.17.2-rc.3');
    expect(plan({ channel: 'rc' }).release_tag).toBe('v0.17.2-rc.1');
  });
  it.each(['beta', 'rc'])('rejects a %s override below a reserved number', (channel) => {
    const tags = ['v0.17.1', `v0.17.2-${channel}.5`];
    expect(() => plan({ channel, tags, releaseTag: `v0.17.2-${channel}.3` })).toThrow(
      'number must advance',
    );
    expect(plan({ channel, tags, releaseTag: `v0.17.2-${channel}.6` }).release_tag).toBe(
      `v0.17.2-${channel}.6`,
    );
  });
  it('checks RC overrides against all tags, not just the selected source', () => {
    expect(() =>
      plan({
        channel: 'rc',
        sourceTag: 'v0.17.2-rc.1',
        sources: [source('v0.17.2-rc.1')],
        tags: ['v0.17.2-rc.5'],
        releaseTag: 'v0.17.2-rc.3',
      }),
    ).toThrow('RC number must advance');
  });
  it('keeps numbering scoped to the target version and channel', () => {
    expect(
      plan({ tags: ['v0.17.1', 'v0.17.2-rc.9', 'v0.18.0-beta.9'], releaseTag: 'v0.17.2-beta.1' })
        .release_tag,
    ).toBe('v0.17.2-beta.1');
    expect(
      plan({
        channel: 'stable',
        sources: [source('v0.17.2-rc.9')],
        tags: ['v0.17.1', 'v0.17.2-rc.9'],
      }).release_tag,
    ).toBe('v0.17.2');
  });
  it('prefers RC to beta for stable and never selects already stable versions', () => {
    expect(
      plan({
        channel: 'stable',
        sources: [
          source(dev),
          source('v0.17.1-rc.9'),
          source('v0.17.2-beta.10'),
          source('v0.17.2-rc.2'),
        ],
      }),
    ).toEqual({ source_tag: 'v0.17.2-rc.2', release_tag: 'v0.17.2', source_sha: sha });
    expect(plan({ channel: 'stable', sources: [source('v0.17.1-rc.9')] })).toEqual({
      no_promotion: true, latest_stable: 'v0.17.1',
    });
  });
  it('matches automatic source to an explicit target base', () => {
    expect(
      plan({
        channel: 'stable',
        releaseTag: 'v0.17.2',
        sources: [source('v0.18.0-beta.1'), source('v0.17.2-beta.2')],
      }).source_tag,
    ).toBe('v0.17.2-beta.2');
  });
  it.each([
    [{ sources: [] }, 'No successfully published source'],
    [{ sourceTag: olderDev }, 'not a successfully published'],
    [{ channel: 'stable', tags: [] }, 'No successfully published source'],
    [{ channel: 'stable', sourceTag: dev }, 'Stable must promote'],
    [{ sourceTag: 'v0.17.2-beta.1', sources: [source('v0.17.2-beta.1')] }, 'Beta must promote'],
    [{ releaseTag: 'v0.18.0' }, 'match the selected channel'],
    [{ releaseTag: 'v0.17.1-beta.1' }, 'newer than the latest stable'],
    [{ releaseTag: 'v0.17.2-beta.1', tags: ['v0.17.2-beta.1'] }, 'already exists'],
    [
      {
        channel: 'stable',
        sourceTag: 'v0.17.2-beta.1',
        releaseTag: 'v0.18.0',
        sources: [source('v0.17.2-beta.1')],
      },
      'same base version',
    ],
    [
      {
        channel: 'rc',
        sourceTag: 'v0.17.2-rc.2',
        releaseTag: 'v0.17.2-rc.1',
        sources: [source('v0.17.2-rc.2')],
      },
      'RC number must advance',
    ],
    [{ channel: 'other' }, 'Choose beta'],
  ])('rejects unsafe or unavailable selection %j', (options, message) => {
    expect(() => plan(options)).toThrow(message);
  });
  it.each([
    'v01.2.3',
    'v1.2.3-beta.0',
    'v1.2.3-beta.99999999999999999',
    'v1.2.3\ninjected=true',
    '../main',
    'v1.2.3-rc.1; echo unsafe',
  ])('rejects malformed tag %s', (tag) => {
    expect(parsePromotionTag(tag)).toBeNull();
  });
});

describe('automatic stable promotion with nothing newer', () => {
  // Keep: publication evidence, explicit overrides, and API failures remain safety boundaries.
  const options = {
    channel: 'stable', tags: ['v0.18.4', 'v0.18.5'],
    sources: [source('v0.18.5-beta.1')],
  };
  it('reports the latest verified stable as already published', async () => {
    expect(await resolveVerifiedPromotion(options, async (tag) => tag === 'v0.18.5')).toEqual({
      no_promotion: true, latest_stable: 'v0.18.5',
      message: 'v0.18.5 is already published. No newer successfully published beta/RC is available to promote.',
    });
  });
  it('directs an incomplete stable publication to recovery', async () => {
    await expect(resolveVerifiedPromotion(options, async () => false)).rejects.toThrow(
      'v0.18.5 is tagged, but successful publication could not be verified. Use Publish Release to recover it.',
    );
  });
  it('propagates verification outages', async () => {
    await expect(resolveVerifiedPromotion(options, async () => { throw new Error('API unavailable'); }))
      .rejects.toThrow('API unavailable');
  });
  it('keeps explicit unavailable selections as errors', async () => {
    await expect(resolveVerifiedPromotion({ ...options, releaseTag: 'v0.18.6' }, async () => true))
      .rejects.toThrow('No successfully published source');
    await expect(resolveVerifiedPromotion({ ...options, sourceTag: 'v0.18.5-beta.1' }, async () => true))
      .rejects.toThrow('Target tag already exists');
  });
  it('continues to select a newer candidate without checking the old stable publication', async () => {
    expect(await resolveVerifiedPromotion({
      ...options, sources: [...options.sources, source('v0.18.6-rc.1')],
    }, async () => { throw new Error('should not verify old stable'); })).toEqual({
      source_tag: 'v0.18.6-rc.1', release_tag: 'v0.18.6', source_sha: sha,
    });
  });
});

describe('published source discovery', () => {
  const release = (tag, extra = {}) => ({
    tag_name: tag,
    draft: false,
    prerelease: true,
    ...extra,
  });
  it('excludes drafts, stable, unverified commits, and failed publications', async () => {
    const sources = await collectPromotionSources({
      releases: [
        release(dev),
        release(olderDev),
        release('v0.17.2-beta.1'),
        release('v0.17.2-rc.1'),
        release('v0.17.2'),
        release('invalid'),
        release(dev, { draft: true }),
        release(dev, { prerelease: false }),
        release('navet-dev-0.17.1-dev.20260918120000'),
      ],
      inspectTag: ({ tag }) => (tag.includes('20260918') ? null : sha),
      devSucceeded: (tag) => tag === dev,
      candidateSucceeded: (r) => r.tag_name === 'v0.17.2-rc.1',
    });
    expect(sources).toEqual([source(dev), source('v0.17.2-rc.1')]);
  });
  it('fails closed on API errors instead of silently selecting an older build', async () => {
    await expect(
      collectPromotionSources({
        releases: [release(dev)],
        inspectTag: () => sha,
        devSucceeded: () => {
          throw new Error('API unavailable');
        },
      }),
    ).rejects.toThrow('API unavailable');
  });
});

describe('candidate publication verification', () => {
  const tag = 'v0.17.8-beta.1';
  const version = '0.17.8-beta.1';
  const digest = `sha256:${'b'.repeat(64)}`;
  const release = {
    tag_name: tag,
    assets: [{ name: 'navet-release-evidence.json', id: 1 }, { name: 'navet-release-notes.json', id: 2 }],
  };
  const evidence = () => ({
    schema: 1, tag, sha, version, channel: 'beta', runId: 123,
    panelDigest: digest, notesDigest: digest,
    images: ['navet', 'amd64-navet-addon', 'aarch64-navet-addon'].map((name) => ({
      image: `ghcr.io/awesomestvi/${name}`, tag: name === 'navet' ? tag : version,
      sha, version, channel: 'beta', digest,
    })),
  });
  const verify = (record = evidence(), run = { conclusion: 'success', path: '.github/workflows/release.yml' }) =>
    candidatePublicationSucceeded(release, sha, { readEvidence: () => record, readRun: () => run });

  it('accepts the published beta namespace independently of repository ownership', async () => {
    expect(await verify()).toBe(true);
  });
  it('verifies stable publication using its own tag, version, channel, and successful run', async () => {
    const record = evidence();
    record.tag = 'v0.17.8';
    record.version = '0.17.8';
    record.channel = 'stable';
    record.images = record.images.map((image) => ({
      ...image, version: record.version, channel: 'stable',
      tag: image.image.endsWith('/navet') ? record.tag : record.version,
    }));
    const stable = { ...release, tag_name: record.tag };
    const check = (run) => candidatePublicationSucceeded(stable, sha, {
      readEvidence: () => record, readRun: () => run,
    });
    expect(await check({ conclusion: 'success', path: '.github/workflows/release.yml' })).toBe(true);
    expect(await check({ conclusion: null, path: '.github/workflows/release.yml' })).toBe(false);
  });
  it.each(['other', 'navet-app'])('rejects evidence for an unpublished namespace %s', async (owner) => {
    const record = evidence();
    record.images = record.images.map((image) => ({ ...image, image: image.image.replace('awesomestvi', owner) }));
    expect(await verify(record)).toBe(false);
  });
  it('retains commit and artifact identity requirements', async () => {
    expect(await verify({ ...evidence(), sha: 'c'.repeat(40) })).toBe(false);
    expect(await verify({ ...evidence(), images: evidence().images.slice(1) })).toBe(false);
    expect(await verify({ ...evidence(), notesDigest: undefined })).toBe(false);
  });
  it.each([
    { conclusion: 'failure', path: '.github/workflows/release.yml' },
    { conclusion: 'success', path: '.github/workflows/other.yml' },
  ])('requires a successful publication workflow %j', async (run) => {
    expect(await verify(evidence(), run)).toBe(false);
  });
  it('propagates API failure instead of excluding a potentially valid source', async () => {
    await expect(candidatePublicationSucceeded(release, sha, {
      readEvidence: () => { throw new Error('API unavailable'); }, readRun: () => ({}),
    })).rejects.toThrow('API unavailable');
  });
});
