import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(scriptsDir, '..');
export const marketingWipRoot = path.join(repoRoot, 'marketing', 'wip');
export const communityWipRoot = path.join(marketingWipRoot, 'community');
export const communityPublishedRoot = path.join(
  repoRoot,
  'marketing',
  'deliverables',
  'community',
  'publications'
);
export const channelConfigPath = path.join(repoRoot, 'scripts', 'config', 'marketing-channels.yml');

export const CONTENT_KINDS = new Set(['feature', 'release', 'how-to', 'tip', 'behind-the-scenes', 'general']);

export const PROVIDERS = new Set(['home-assistant', 'homey', 'openhab', 'provider-neutral']);

const ALLOWED_EVIDENCE_FILES = new Set([
  'CHANGELOG.md',
  '.changes/discord-community-invite.yaml',
  '.changes/chore-completion-recurrence.yaml',
  '.changes/chore-long-completion-interval.yaml',
  '.changes/documentation-stewardship.yaml',
  '.changes/garage-cover-security.yaml',
  '.changes/simple-cover-controls.yaml',
  'packages/app/src/constants/urls.ts',
  '.agents/product-marketing.md',
  'docs/integrations.md',
  'docs/branding/VOICE_AND_MESSAGING.md',
  'docs/branding/BRAND_FOUNDATIONS.md',
]);

const ALLOWED_EVIDENCE_PREFIXES = ['docs/guide/', 'docs/how-to/', 'docs/install/', 'docs/architecture/'];
const PLACEHOLDER_PATTERN = /\b(?:pending|todo|tbd|replace me|add your|your answer)\b/i;
const HYPE_PATTERNS = [
  /\bgame[ -]?chang(?:e|er|ing)\b/i,
  /\brevolutionary\b/i,
  /\bseamless(?:ly)?\b/i,
  /\buniversal\b/i,
  /\btransform the way you live\b/i,
  /\bsupercharge\b/i,
  /\bunlock(?:ing)? the (?:full )?power\b/i,
  /\bcoming soon\b/i,
];
const ENGAGEMENT_BAIT_PATTERNS = [
  /\bsmash that (?:like|subscribe)\b/i,
  /\blike and subscribe\b/i,
  /\bcomment below\b/i,
  /\bwhat do you think\??\s*$/i,
  /\byou won't believe\b/i,
];
const UNSAFE_LOCAL_FIRST_PATTERNS = [
  /\bnever sends any data anywhere\b/i,
  /\b100% private\b/i,
  /\bcompletely private\b/i,
  /\boffline-only\b/i,
];
const INVENTED_METRIC_PATTERN =
  /\b(?:\d[\d,.]*|thousands?|millions?)\s+(?:users?|customers?|households?|installs?|downloads?)\b/i;

export function parseCliArgs(argv) {
  const options = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') continue;
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected argument "${argument}".`);
    }

    const equalsIndex = argument.indexOf('=');
    if (equalsIndex !== -1) {
      options.set(argument.slice(2, equalsIndex), argument.slice(equalsIndex + 1));
      continue;
    }

    const key = argument.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      options.set(key, next);
      index += 1;
    } else {
      options.set(key, true);
    }
  }

  return Object.assign(Object.create(null), Object.fromEntries(options));
}

export function readYaml(filePath) {
  return parseYaml(fs.readFileSync(filePath, 'utf8'));
}

export function writeYaml(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, stringifyYaml(value, { lineWidth: 100 }), 'utf8');
}

export function loadChannelConfig(filePath = channelConfigPath) {
  const config = readYaml(filePath);
  if (config?.schemaVersion !== 1 || !config.channels || typeof config.channels !== 'object') {
    throw new Error(`${path.relative(repoRoot, filePath)} is not a version 1 channel config.`);
  }
  return config;
}

export function loadBrief(filePath) {
  const absolutePath = path.resolve(repoRoot, filePath);
  const relativePath = path.relative(repoRoot, absolutePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Content briefs must be inside the Navet repository.');
  }
  const brief = readYaml(absolutePath);
  return { brief, absolutePath, relativePath };
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function toIsoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10);
  }
  return hasText(value) ? value : '';
}

function validateMaintainerSeed(seed, errors) {
  const fields = [
    ['problem', 'problem being solved'],
    ['whyItMatters', 'personal reason this matters'],
    ['specificDetail', 'specific detail or tradeoff'],
    ['limitation', 'current limitation'],
    ['desiredConversation', 'useful next conversation or action'],
  ];

  for (const [field, label] of fields) {
    const value = seed?.[field];
    if (!hasText(value)) {
      errors.push(`Maintainer seed is missing the ${label}.`);
    } else if (PLACEHOLDER_PATTERN.test(value)) {
      errors.push(`Maintainer seed ${field} still contains a placeholder.`);
    }
  }
}

function isEvidenceSourceAllowed(source) {
  if (!hasText(source)) return false;
  if (source.split(/[\\/]/).includes('..')) return false;
  if (ALLOWED_EVIDENCE_FILES.has(source)) return true;
  return ALLOWED_EVIDENCE_PREFIXES.some((prefix) => source.startsWith(prefix));
}

function resolveEvidence(evidence, errors, sourceRoot = repoRoot) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    errors.push('At least one evidence reference is required.');
    return [];
  }

  const ids = new Set();
  return evidence.map((entry, index) => {
    const label = `Evidence ${index + 1}`;
    if (!hasText(entry?.id)) errors.push(`${label} is missing an id.`);
    if (ids.has(entry?.id)) errors.push(`${label} duplicates evidence id "${entry.id}".`);
    ids.add(entry?.id);

    if (!isEvidenceSourceAllowed(entry?.source)) {
      errors.push(`${label} source "${entry?.source ?? ''}" is not allowlisted.`);
    }
    if (!hasText(entry?.locator)) errors.push(`${label} is missing an exact locator.`);
    if (!hasText(entry?.claim)) errors.push(`${label} is missing a claim.`);
    if (!toIsoDate(entry?.verifiedOn).match(/^\d{4}-\d{2}-\d{2}$/)) {
      errors.push(`${label} must include verifiedOn as YYYY-MM-DD.`);
    }

    const sourcePath =
      hasText(entry?.source) && isEvidenceSourceAllowed(entry.source)
        ? path.resolve(sourceRoot, entry.source)
        : '';
    const relativeSource = sourcePath ? path.relative(sourceRoot, sourcePath) : '';
    if (sourcePath && (relativeSource.startsWith('..') || path.isAbsolute(relativeSource))) {
      errors.push(`${label} source must stay within its source checkout.`);
      return { ...entry, locatorFound: false };
    }
    let locatorFound = false;
    if (sourcePath && fs.existsSync(sourcePath) && fs.statSync(sourcePath).isFile()) {
      locatorFound = fs.readFileSync(sourcePath, 'utf8').includes(entry.locator ?? '');
      if (!locatorFound) {
        errors.push(`${label} locator was not found in ${entry.source}.`);
      }
    } else if (sourcePath) {
      errors.push(`${label} source ${entry.source} does not exist.`);
    }

    return {
      ...entry,
      verifiedOn: toIsoDate(entry?.verifiedOn),
      locatorFound,
    };
  });
}

function ageInDays(dateText, now) {
  const checkedAt = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(checkedAt.valueOf())) return Number.POSITIVE_INFINITY;
  return Math.floor((now.valueOf() - checkedAt.valueOf()) / 86_400_000);
}

export function validateBrief(brief, channelConfig, options = {}) {
  const errors = [];
  const warnings = [];
  const now = options.now ?? new Date();
  const sourceRoot = path.resolve(options.sourceRoot ?? repoRoot);

  if (brief?.schemaVersion !== 1) errors.push('Brief schemaVersion must be 1.');
  if (!hasText(brief?.id) || !/^[a-z0-9][a-z0-9-]*$/.test(brief?.id ?? '')) {
    errors.push('Brief id must use lowercase letters, numbers, and hyphens.');
  }
  if (!toIsoDate(brief?.createdOn).match(/^\d{4}-\d{2}-\d{2}$/)) {
    errors.push('Brief createdOn must be YYYY-MM-DD.');
  }
  if (!CONTENT_KINDS.has(brief?.kind)) errors.push(`Unsupported content kind "${brief?.kind}".`);
  if (brief?.sharedPost !== undefined && typeof brief.sharedPost !== 'boolean')
    errors.push('Brief sharedPost must be a boolean.');
  for (const field of ['title', 'oneIdea', 'audience']) {
    if (!hasText(brief?.[field])) errors.push(`Brief ${field} is required.`);
  }

  if (brief?.sourceContext) {
    for (const field of ['problem', 'benefit', 'specificDetail', 'limitation', 'nextAction']) {
      if (
        !hasText(brief.sourceContext[field]) ||
        PLACEHOLDER_PATTERN.test(brief.sourceContext[field])
      ) {
        errors.push(`Source context ${field} requires a concrete, evidence-backed value.`);
      }
    }
  } else {
    validateMaintainerSeed(brief?.maintainerSeed, errors);
  }

  const providerScope = Array.isArray(brief?.providerScope) ? brief.providerScope : [];
  if (providerScope.length === 0)
    errors.push('Brief providerScope must contain at least one value.');
  for (const provider of providerScope) {
    if (!PROVIDERS.has(provider)) errors.push(`Unsupported provider scope "${provider}".`);
  }

  const resolvedEvidence = resolveEvidence(brief?.evidence, errors, sourceRoot);

  if (!hasText(brief?.cta?.label) || !hasText(brief?.cta?.url)) {
    errors.push('Brief CTA requires a label and URL.');
  } else {
    validateAllowedUrl(brief.cta.url, channelConfig.allowedLinkHosts ?? [], errors, 'Brief CTA');
  }

  if (!hasText(brief?.asset?.altText)) errors.push('Brief asset requires accessible alt text.');
  if (brief?.asset?.sourcePolicy !== 'provider-free-demo-only') {
    errors.push('Brief asset sourcePolicy must be provider-free-demo-only.');
  }
  if (!hasText(brief?.asset?.scenario)) {
    errors.push('Brief asset requires a named demo capture scenario.');
  } else {
    const captureSource = fs.readFileSync(
      path.join(sourceRoot, 'scripts/capture-marketing-media.mjs'),
      'utf8'
    );
    const hasRegisteredCapture = captureSource.includes(`name: '${brief.asset.scenario}'`);
    const fixtureSource = brief?.asset?.fixtureSource;
    const fixtureLocator = brief?.asset?.fixtureLocator;
    let hasVerifiedFixture = false;

    if (hasText(fixtureSource) || hasText(fixtureLocator)) {
      if (!hasText(fixtureSource) || !hasText(fixtureLocator)) {
        errors.push('Brief asset fixture requires both fixtureSource and fixtureLocator.');
      } else {
        const absoluteFixturePath = path.resolve(sourceRoot, fixtureSource);
        const relativeFixturePath = path.relative(sourceRoot, absoluteFixturePath);
        const isRepositoryFile =
          !relativeFixturePath.startsWith('..') && !path.isAbsolute(relativeFixturePath);

        if (!isRepositoryFile) {
          errors.push('Brief asset fixtureSource must be inside the Navet repository.');
        } else if (
          !fs.existsSync(absoluteFixturePath) ||
          !fs.statSync(absoluteFixturePath).isFile()
        ) {
          errors.push(`Brief asset fixtureSource ${fixtureSource} does not exist.`);
        } else if (!fs.readFileSync(absoluteFixturePath, 'utf8').includes(fixtureLocator)) {
          errors.push(`Brief asset fixtureLocator was not found in ${fixtureSource}.`);
        } else {
          hasVerifiedFixture = true;
        }
      }
    }

    if (!hasRegisteredCapture && !hasVerifiedFixture) {
      errors.push(
        `Asset scenario "${brief.asset.scenario}" is not a registered capture or verified repository fixture.`
      );
    }
  }

  if (!Array.isArray(brief?.channels) || brief.channels.length === 0) {
    errors.push('Brief must select at least one channel.');
  }

  const selectedChannels = [];
  for (const channelId of brief?.channels ?? []) {
    const profile = channelConfig.channels[channelId];
    if (!profile) {
      errors.push(`Unknown channel "${channelId}".`);
      continue;
    }

    selectedChannels.push({ id: channelId, ...profile });
    if (profile.provider && !providerScope.includes(profile.provider)) {
      errors.push(
        `${profile.label} requires provider scope ${profile.provider}, but the brief does not include it.`
      );
    }
    if (profile.requiresRulePreflight) {
      if (!hasText(profile.rulesUrl) || !toIsoDate(profile.rulesCheckedOn)) {
        errors.push(`${profile.label} requires a rules URL and rulesCheckedOn date.`);
      } else {
        const checkedAge = ageInDays(toIsoDate(profile.rulesCheckedOn), now);
        if (checkedAge < 0 || checkedAge > 30) {
          errors.push(
            `${profile.label} rules check is stale; verify the rules again before drafting.`
          );
        }
      }
    }
  }

  if (brief?.kind === 'how-to') {
    if (!hasText(brief?.canonicalDocs?.path)) {
      errors.push('How-to briefs require a canonical docs path.');
    } else if (!brief.canonicalDocs.path.startsWith('docs/')) {
      errors.push('Canonical how-to content must live under docs/.');
    }
    if (brief?.canonicalDocs?.status !== 'existing') {
      errors.push(
        'Canonical how-to content must exist before the pack can become publish-eligible.'
      );
    }
  }

  if (brief?.canonicalDocs?.status === 'planned') {
    warnings.push('Canonical docs content is planned and must be completed before publication.');
  }
  return {
    errors,
    warnings,
    resolvedEvidence,
    selectedChannels,
  };
}

export function validateAllowedUrl(urlValue, allowedHosts, errors, label) {
  try {
    const url = new URL(urlValue);
    const allowed = allowedHosts.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`)
    );
    if (url.protocol !== 'https:' || !allowed) {
      errors.push(`${label} must use HTTPS on an allowlisted Navet or GitHub host.`);
    }
  } catch {
    errors.push(`${label} is not a valid URL.`);
  }
}

function emojiCount(text) {
  return (text.match(/\p{Extended_Pictographic}/gu) ?? []).length;
}

function normalizedWords(text) {
  return new Set(
    text
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2)
  );
}

export function jaccardSimilarity(left, right) {
  const leftWords = normalizedWords(left);
  const rightWords = normalizedWords(right);
  const union = new Set([...leftWords, ...rightWords]);
  if (union.size === 0) return 1;
  let intersection = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) intersection += 1;
  }
  return intersection / union.size;
}

function draftText(draft) {
  return [draft.title, draft.body, draft.script, draft.description].filter(Boolean).join('\n');
}

export function createSharedDrafts(master, channelIds) {
  const supported = new Set(['navet-subreddit', 'navet-discord', 'homeassistant-community']);
  if (!hasText(master?.title) || !hasText(master?.body) || !Array.isArray(channelIds) ||
      !channelIds.length || new Set(channelIds).size !== channelIds.length ||
      channelIds.some(id => !supported.has(id)))
    throw new Error('A shared master requires title, body and supported unique destinations.');
  return channelIds.map(channelId => ({ ...master, channelId, script: '',
    body: channelId === 'navet-subreddit' ? master.body : `${master.title}\n\n${master.body}` }));
}

export function validateDrafts(drafts, brief, channelConfig) {
  const errors = [];
  const warnings = [];
  const selected = new Set(brief.channels ?? []);
  const evidenceIds = new Set((brief.evidence ?? []).map((entry) => entry.id));
  const seenChannels = new Set();

  if (!Array.isArray(drafts)) return { errors: ['Generated drafts must be an array.'], warnings };

  for (const draft of drafts) {
    const channelId = draft?.channelId;
    const profile = channelConfig.channels[channelId];
    if (!selected.has(channelId)) errors.push(`Generated unexpected channel "${channelId}".`);
    if (seenChannels.has(channelId)) errors.push(`Generated duplicate channel "${channelId}".`);
    seenChannels.add(channelId);
    if (!profile) continue;

    const text = draftText(draft);
    if (!hasText(draft?.title)) errors.push(`${profile.label} draft is missing a title.`);
    if (!hasText(draft?.body) && !hasText(draft?.script)) {
      errors.push(`${profile.label} draft is missing body or script content.`);
    }
    if (text.length > profile.maxCharacters) {
      errors.push(`${profile.label} draft exceeds ${profile.maxCharacters} characters.`);
    }
    if (
      Number.isInteger(profile.maxTitleCharacters) &&
      (draft?.title?.trim().length ?? 0) > profile.maxTitleCharacters
    ) {
      errors.push(`${profile.label} title exceeds ${profile.maxTitleCharacters} characters.`);
    }
    if (
      Number.isInteger(brief.sharedPost ? profile.maxSharedBodyCharacters ?? profile.maxBodyCharacters : profile.maxBodyCharacters) &&
      (draft?.body?.trim().length ?? 0) > (brief.sharedPost ? profile.maxSharedBodyCharacters ?? profile.maxBodyCharacters : profile.maxBodyCharacters)
    ) {
      errors.push(
        `${profile.label} body exceeds the ${brief.sharedPost ? profile.maxSharedBodyCharacters ?? profile.maxBodyCharacters : profile.maxBodyCharacters}-character scan limit.`
      );
    }
    if (!hasText(draft?.assetAltText)) errors.push(`${profile.label} draft is missing alt text.`);
    if (!hasText(draft?.description))
      errors.push(`${profile.label} draft is missing a description.`);
    if (!hasText(draft?.cta?.label) || !hasText(draft?.cta?.url)) {
      errors.push(`${profile.label} draft requires a CTA label and URL.`);
    }
    if (PLACEHOLDER_PATTERN.test(text))
      errors.push(`${profile.label} draft contains a placeholder.`);
    for (const pattern of [...HYPE_PATTERNS, ...ENGAGEMENT_BAIT_PATTERNS]) {
      if (pattern.test(text))
        errors.push(`${profile.label} draft contains disallowed promotional copy.`);
    }
    for (const pattern of UNSAFE_LOCAL_FIRST_PATTERNS) {
      if (pattern.test(text))
        errors.push(`${profile.label} draft contains an unsafe privacy claim.`);
    }
    if (INVENTED_METRIC_PATTERN.test(text)) {
      errors.push(`${profile.label} draft contains an unsupported adoption metric.`);
    }
    if (emojiCount(text) > 2) errors.push(`${profile.label} draft uses more than two emoji.`);

    if (profile.requiresAffiliationDisclosure) {
      const required = profile.requiredDisclosure ?? 'I work on Navet';
      if (!text.toLowerCase().includes(required.toLowerCase())) {
        errors.push(`${profile.label} draft is missing the required affiliation disclosure.`);
      }
    }

    if (!Array.isArray(draft?.evidenceIds) || draft.evidenceIds.length === 0) {
      errors.push(`${profile.label} draft must cite at least one evidence id.`);
    } else {
      for (const evidenceId of draft.evidenceIds) {
        if (!evidenceIds.has(evidenceId)) {
          errors.push(`${profile.label} draft cites unknown evidence "${evidenceId}".`);
        }
      }
    }

    if (draft?.cta?.url) {
      validateAllowedUrl(
        draft.cta.url,
        channelConfig.allowedLinkHosts ?? [],
        errors,
        `${profile.label} CTA`
      );
    }
  }

  for (const channelId of selected) {
    if (!seenChannels.has(channelId)) errors.push(`Missing generated draft for "${channelId}".`);
  }

  if (brief.sharedPost) {
    const master = drafts[0];
    const body = (draft) => draft.body?.startsWith(`${draft.title}\n\n`) ? draft.body.slice(draft.title.length + 2) : draft.body;
    for (const draft of drafts) {
      if (draft.title !== master.title || body(draft) !== body(master) ||
          draft.assetAltText !== master.assetAltText || JSON.stringify(draft.cta) !== JSON.stringify(master.cta))
        errors.push('Shared post drafts must preserve the same title, body, CTA and alt text.');
    }
  }
  for (let left = 0; !brief.sharedPost && left < drafts.length; left += 1) {
    for (let right = left + 1; right < drafts.length; right += 1) {
      const similarity = jaccardSimilarity(draftText(drafts[left]), draftText(drafts[right]));
      if (similarity >= 0.82) {
        errors.push(
          `${drafts[left].channelId} and ${drafts[right].channelId} are too similar (${Math.round(similarity * 100)}%).`
        );
      }
    }
  }

  return { errors: [...new Set(errors)], warnings };
}

function disclosure(profile) {
  return profile.requiresAffiliationDisclosure
    ? `${profile.requiredDisclosure ?? 'I work on Navet'}.\n\n`
    : '';
}

function fallbackDraft(channel, brief) {
  const seed = brief.maintainerSeed ?? {
    ...brief.sourceContext,
    whyItMatters: brief.sourceContext?.benefit,
    desiredConversation: brief.sourceContext?.nextAction,
  };
  const evidenceIds = (brief.evidence ?? []).map((entry) => entry.id);
  const limitation = `Current boundary: ${seed.limitation}`;
  const cta = brief.cta;

  if (brief.sharedPost) {
    const master = `${brief.oneIdea}\n\n${seed.specificDetail}\n\n${seed.whyItMatters}\n\n${seed.limitation}\n\n${cta.label}: ${cta.url}`;
    return { channelId: channel.id, title: brief.title,
      body: channel.id === 'navet-subreddit' ? master : `${brief.title}\n\n${master}`,
      script: '', description: 'Shared Navet community post.', evidenceIds, cta, assetAltText: brief.asset.altText };
  }

  if (channel.id === 'navet-discord') {
    return {
      channelId: channel.id,
      title: brief.title,
      body: `${brief.oneIdea}\n\n${seed.specificDetail}\n\n${limitation}\n\n${seed.desiredConversation}\n\n${cta.label}: ${cta.url}`,
      script: '',
      description: 'Compact community update for an active conversation.',
      evidenceIds,
      cta,
      assetAltText: brief.asset.altText,
    };
  }

  if (channel.id === 'youtube') {
    return {
      channelId: channel.id,
      title: brief.title,
      body: `See ${brief.title.toLowerCase()} in a current, public-safe Navet demo.\n\n${limitation}\n\n${cta.label}: ${cta.url}`,
      script: `[0:00 — Show the result]\n${brief.oneIdea}\n\n[0:15 — Why it exists]\n${seed.problem}\n${seed.whyItMatters}\n\n[0:45 — Walk through the real flow]\n${seed.specificDetail}\n\n[2:15 — State the boundary]\n${limitation}\n\n[2:35 — Invite a useful response]\n${seed.desiredConversation}`,
      description: 'Narrated screen demonstration; show the working result before setup detail.',
      evidenceIds,
      cta,
      assetAltText: brief.asset.altText,
    };
  }

  const body = `${disclosure(channel)}${seed.problem}\n\n${brief.oneIdea}\n\nThe detail I want to show is simple: ${seed.specificDetail}\n\n${seed.whyItMatters}\n\n${limitation}\n\n${seed.desiredConversation}\n\n${cta.label}: ${cta.url}`;
  return {
    channelId: channel.id,
    title: brief.title,
    body,
    script: '',
    description:
      channel.kind === 'external-community'
        ? 'Native external-community post with affiliation disclosure and provider scope.'
        : 'Complete native update for the Navet subreddit.',
    evidenceIds,
    cta,
    assetAltText: brief.asset.altText,
  };
}

export function createFallbackDrafts(brief, selectedChannels) {
  return selectedChannels.map((channel) => fallbackDraft(channel, brief));
}

export function loadPublishedVoiceExamples(
  channelIds,
  limitPerChannel = 3,
  publishedRoot = communityPublishedRoot
) {
  if (!fs.existsSync(publishedRoot)) return [];
  const selected = new Set(channelIds);
  const records = [];

  for (const contentEntry of fs.readdirSync(publishedRoot, { withFileTypes: true })) {
    if (!contentEntry.isDirectory()) continue;
    const directory = path.join(publishedRoot, contentEntry.name);
    for (const fileName of fs.readdirSync(directory)) {
      if (!fileName.endsWith('.json')) continue;
      try {
        const record = JSON.parse(fs.readFileSync(path.join(directory, fileName), 'utf8'));
        if (
          record?.humanReviewed === true &&
          record?.publishedManually === true &&
          selected.has(record?.channelId) &&
          hasText(record?.finalCopy)
        ) {
          records.push(record);
        }
      } catch {
        // Invalid records are handled by repository validation; never use them as voice examples.
      }
    }
  }

  return channelIds.flatMap((channelId) =>
    records
      .filter((record) => record.channelId === channelId)
      .sort((left, right) => String(right.publishedAt).localeCompare(String(left.publishedAt)))
      .slice(0, limitPerChannel)
      .map((record) => ({
        channelId,
        publishedAt: record.publishedAt,
        publicUrl: record.publicUrl,
        finalCopy: record.finalCopy,
      }))
  );
}

const draftJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['drafts'],
  properties: {
    drafts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'channelId',
          'title',
          'body',
          'script',
          'description',
          'evidenceIds',
          'cta',
          'assetAltText',
        ],
        properties: {
          channelId: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          script: { type: 'string' },
          description: { type: 'string' },
          evidenceIds: { type: 'array', items: { type: 'string' } },
          cta: {
            type: 'object',
            additionalProperties: false,
            required: ['label', 'url'],
            properties: { label: { type: 'string' }, url: { type: 'string' } },
          },
          assetAltText: { type: 'string' },
        },
      },
    },
  },
};

function getResponseText(payload) {
  if (hasText(payload?.output_text)) return payload.output_text;
  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (hasText(content?.text)) return content.text;
    }
  }
  throw new Error('The generation response did not contain structured text output.');
}

export async function generateAiDrafts({
  brief,
  selectedChannels,
  publishedVoiceExamples = [],
  apiKey,
  model,
  fetchImpl = fetch,
}) {
  const publicContext = {
    brief,
    channels: selectedChannels.map((channel) => ({
      id: channel.id,
      label: channel.label,
      kind: channel.kind,
      audience: channel.audience,
      format: channel.format,
      maxCharacters: channel.maxCharacters,
      maxTitleCharacters: channel.maxTitleCharacters,
      maxBodyCharacters: channel.maxBodyCharacters,
      requiredDisclosure: channel.requiredDisclosure ?? null,
    })),
    publishedVoiceExamples,
    voice: {
      personality: ['calm', 'deliberate', 'warm', 'clear', 'open', 'practical'],
      pattern: 'one idea, one concrete proof point, one next action',
      rules: [
        'Use first person only where the maintainer seed supplies the point of view.',
        'Never invent a story, opinion, result, metric, customer, or future capability.',
        'Lead with a household outcome before implementation detail.',
        'State provider limitations plainly.',
        'Make every community draft useful without requiring the link.',
        brief.sharedPost ? 'Use one identical master title, body, CTA and alt text for all three Navet destinations; prepend title plus a blank line only for Discord and forum replies.' : 'Write channel-native drafts instead of paraphrasing one shared post.',
        'Keep each community post to one topic and one matching proof asset.',
        'For releases, use the maintainer-selected headline news in brief.oneIdea to drive the title and opening; summarize other verified changelog entries in at most three compact supporting points and link the full published changelog.',
        'Use one screenshot that matches the selected headline news; never attach a mixed screenshot gallery to a release recap.',
        'Write for a fast mobile scan: short title, opening outcome, at most three compact points, then one next action.',
        'Avoid hype, fake vulnerability, engagement bait, and emoji-heavy copy.',
      ],
    },
  };

  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      instructions:
        'Prepare Navet content scaffolding from the supplied verified evidence and maintainer seed. Return only the strict schema. Never add facts or personal experiences.',
      input: JSON.stringify(publicContext),
      text: {
        format: {
          type: 'json_schema',
          name: 'navet_content_pack',
          strict: true,
          schema: draftJsonSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Generation request failed with HTTP ${response.status}: ${message.slice(0, 300)}`
    );
  }

  const payload = await response.json();
  return JSON.parse(getResponseText(payload)).drafts;
}

function markdownDraft(draft, profile) {
  const content = draft.script || draft.body;
  return `# ${draft.title}\n\n**Channel:** ${profile.label}\n\n**Format:** ${profile.format}\n\n${content}\n\n## Description or posting note\n\n${draft.description}\n\n## CTA\n\n[${draft.cta.label}](${draft.cta.url})\n\n## Product-proof alt text\n\n${draft.assetAltText}\n\n## Evidence used\n\n${draft.evidenceIds.map((id) => `- \`${id}\``).join('\n')}\n`;
}

function evidenceMarkdown(resolvedEvidence) {
  return `# Evidence ledger\n\n${resolvedEvidence
    .map(
      (entry) =>
        `## ${entry.id}\n\n- **Claim:** ${entry.claim}\n- **Source:** \`${entry.source}\`\n- **Locator:** \`${entry.locator}\`\n- **Verified:** ${entry.verifiedOn}\n- **Locator found:** ${entry.locatorFound ? 'yes' : 'no'}\n`
    )
    .join('\n')}\n`;
}

function reviewMarkdown(pack, outputRoot) {
  if (pack.generator.mode === 'agent-authored') {
    const skillPath = path.relative(
      outputRoot,
      path.join(repoRoot, '.agents/skills/navet-release-communication/SKILL.md')
    );
    return `# Quality review\n\n**Status:** ${pack.publishEligible ? 'Content checks passed; publication requires request authorization and review evidence' : 'Not publishable'}\n\nReview the final title, body, CTA and actual asset against current product facts, Navet voice, visual identity, feed-size readability and accessible alt text. Record the exact reviewed hashes and evidence using the [community communication workflow](${skillPath}). A passing content check does not establish visual quality or authorize posting.\n`;
  }
  const status = pack.publishEligible ? 'Eligible after human review' : 'Not publishable';
  return `# Human review\n\n**Status:** ${status}\n\n## Blocking errors\n\n${
    pack.errors.length
      ? pack.errors.map((error) => `- [ ] ${error}`).join('\n')
      : '- [x] No automated blocking errors.'
  }\n\n## Warnings\n\n${
    pack.warnings.length
      ? pack.warnings.map((warning) => `- [ ] ${warning}`).join('\n')
      : '- [x] No automated warnings.'
  }\n\n## Required maintainer pass\n\n- [ ] I read every final draft aloud and rewrote anything I would not naturally say.\n- [ ] The post has one idea, one real proof point, and one primary action.\n- [ ] The opening states the useful outcome before release history or implementation detail.\n- [ ] The post is easy to scan on a phone: no more than three compact points before the action.\n- [ ] Every screenshot is current, belongs to this exact topic, and is understandable beside its caption.\n- [ ] A release leads with the maintainer-selected headline news, summarizes other changelog highlights, and links the full published changelog.\n- [ ] I verified every product and provider claim against the evidence ledger.\n- [ ] Any required affiliation disclosure matches the destination profile, and the post is useful without following the link.\n- [ ] I checked current community rules immediately before posting.\n- [ ] I reviewed the screenshot at feed size and played video with and without sound.\n- [ ] Product proof contains demo data only.\n- [ ] I will publish manually and stay available for useful replies.\n`;
}

function packReadme(pack) {
  return `# ${pack.brief.title}\n\n**Pack ID:** \`${pack.id}\`\n\n**Generation mode:** ${pack.generator.mode}\n\n**Content checks:** ${pack.publishEligible ? 'passed' : 'blocked'}\n\nReview [review.md](review.md), verify [evidence.md](evidence.md), and inspect the final copy and product proof. Publication requires the requested channel scope and review evidence. Publication records belong in the ignored local deliverables workspace.\n\n## Files\n\n- [Evidence ledger](evidence.md)\n- [Docs and update angle](content-angle.md)\n- [Product-proof plan](product-proof.md)\n- [Quality review](review.md)\n${pack.drafts.map((draft) => `- [${draft.channelId}](channels/${draft.channelId}.md)`).join('\n')}\n`;
}

export function writePack(pack, outputRoot) {
  for (const draft of pack.drafts) {
    if (!/^[a-z][a-z0-9-]*$/.test(draft.channelId) ||
        !pack.channels.some((channel) => channel.id === draft.channelId)) {
      throw new Error('Draft channel must match a configured channel.');
    }
  }
  fs.mkdirSync(path.join(outputRoot, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(outputRoot, 'pack.json'), `${JSON.stringify(pack, null, 2)}\n`);
  fs.writeFileSync(path.join(outputRoot, 'README.md'), packReadme(pack));
  fs.writeFileSync(path.join(outputRoot, 'evidence.md'), evidenceMarkdown(pack.evidence));
  fs.writeFileSync(
    path.join(outputRoot, 'content-angle.md'),
    `# Docs and update angle\n\n**Canonical path:** \`${pack.brief.canonicalDocs?.path ?? 'Not applicable'}\`\n\n**Status:** ${pack.brief.canonicalDocs?.status ?? 'not-applicable'}\n\n${pack.brief.canonicalDocs?.angle ?? pack.brief.oneIdea}\n\n## Search intent\n\n${pack.brief.searchIntent ?? 'No search intent supplied.'}\n`
  );
  fs.writeFileSync(
    path.join(outputRoot, 'product-proof.md'),
    `# Product-proof plan\n\n- **Kind:** ${pack.brief.asset.kind}\n- **Scenario:** ${pack.brief.asset.scenario}\n- **Fixture source:** ${pack.brief.asset.fixtureSource ? `\`${pack.brief.asset.fixtureSource}\`` : 'registered marketing capture'}\n- **Fixture locator:** ${pack.brief.asset.fixtureLocator ? `\`${pack.brief.asset.fixtureLocator}\`` : 'scenario name in capture registry'}\n- **Source policy:** ${pack.brief.asset.sourcePolicy}\n- **Alt text:** ${pack.brief.asset.altText}\n\nCapture the named registered scenario or exact fixture above. Show the result first, keep provider boundaries visible, and use only the fixture's public-safe demo data. Never point capture tooling at a real household.\n`
  );
  fs.writeFileSync(path.join(outputRoot, 'review.md'), reviewMarkdown(pack, outputRoot));
  for (const draft of pack.drafts) {
    const profile = pack.channels.find((channel) => channel.id === draft.channelId);
    fs.writeFileSync(
      path.join(outputRoot, 'channels', `${draft.channelId}.md`),
      markdownDraft(draft, profile)
    );
  }
}

export async function generateContentPack({
  briefPath,
  outputPath,
  env = process.env,
  fetchImpl = fetch,
  now = new Date(),
  suppliedDrafts,
  suppliedMaster,
  sourceRoot = repoRoot,
}) {
  const { brief, relativePath } = loadBrief(briefPath);
  if (suppliedMaster !== undefined) {
    if (!brief.sharedPost || suppliedDrafts !== undefined)
      throw new Error('Use a sharedPost brief and either a master or transport drafts.');
    suppliedDrafts = createSharedDrafts(suppliedMaster, brief.channels);
  }
  const channelConfig = loadChannelConfig();
  sourceRoot = path.resolve(sourceRoot);
  const briefValidation = validateBrief(brief, channelConfig, { now, sourceRoot });
  const generationEnabled = env.NAVET_CONTENT_GENERATION_ENABLED !== 'false';
  const apiKey = env.OPENAI_API_KEY;
  const model = env.NAVET_CONTENT_MODEL || 'gpt-5.4-mini';
  let mode = 'fallback';
  let reason = '';
  let drafts;

  if (suppliedDrafts !== undefined) {
    drafts = suppliedDrafts;
    mode = 'agent-authored';
  } else if (briefValidation.errors.length > 0) {
    reason = 'The brief has blocking validation errors.';
    drafts = createFallbackDrafts(brief, briefValidation.selectedChannels);
  } else if (!generationEnabled) {
    reason = 'NAVET_CONTENT_GENERATION_ENABLED is false.';
    drafts = createFallbackDrafts(brief, briefValidation.selectedChannels);
  } else if (!apiKey) {
    reason = 'OPENAI_API_KEY is not available.';
    drafts = createFallbackDrafts(brief, briefValidation.selectedChannels);
  } else {
    try {
      drafts = await generateAiDrafts({
        brief,
        selectedChannels: briefValidation.selectedChannels,
        publishedVoiceExamples: loadPublishedVoiceExamples(brief.channels ?? []),
        apiKey,
        model,
        fetchImpl,
      });
      mode = 'ai-structured';
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
      drafts = createFallbackDrafts(brief, briefValidation.selectedChannels);
    }
  }

  const draftValidation = validateDrafts(drafts, brief, channelConfig);
  const errors = [...briefValidation.errors, ...draftValidation.errors];
  if (suppliedDrafts !== undefined && errors.length > 0) {
    throw new Error(`Agent-authored content failed validation:\n${errors.join('\n')}`);
  }
  if (mode === 'fallback') errors.push(`Generated fallback is non-publishable: ${reason}`);

  const pack = {
    schemaVersion: 1,
    id: brief.id,
    createdAt: now.toISOString(),
    briefPath: relativePath,
    sourceRoot,
    brief: { ...brief, createdOn: toIsoDate(brief.createdOn) },
    channels: briefValidation.selectedChannels,
    evidence: briefValidation.resolvedEvidence,
    drafts,
    generator: { mode, model: mode === 'ai-structured' ? model : null, reason: reason || null },
    publishEligible: mode !== 'fallback' && errors.length === 0,
    requiresHumanReview: mode !== 'agent-authored',
    requiresQualityReview: true,
    errors: [...new Set(errors)],
    warnings: [...new Set([...briefValidation.warnings, ...draftValidation.warnings])],
  };

  const resolvedOutput = outputPath
    ? path.resolve(repoRoot, outputPath)
    : path.join(communityWipRoot, brief.id);
  writePack(pack, resolvedOutput);
  return { pack, outputPath: resolvedOutput };
}

export function loadPack(packPath) {
  const resolved = path.resolve(repoRoot, packPath);
  const jsonPath = fs.statSync(resolved).isDirectory()
    ? path.join(resolved, 'pack.json')
    : resolved;
  return { pack: JSON.parse(fs.readFileSync(jsonPath, 'utf8')), packRoot: path.dirname(jsonPath) };
}

export function verifyReleaseSource(sourceRoot, release, sourceFiles = [], requireTag = true) {
  if (typeof sourceRoot !== 'string' || !path.isAbsolute(sourceRoot)) {
    throw new Error('Release publication requires an explicit source checkout.');
  }
  const git = (args) =>
    execFileSync('git', ['-C', sourceRoot, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  if (
    git(['rev-parse', 'HEAD']) !== release.sourceHead ||
    (requireTag && git(['rev-parse', `${release.tag}^{commit}`]) !== release.sourceHead) ||
    git(['status', '--porcelain', '--untracked-files=all'])
  ) {
    throw new Error(
      'Release source checkout must be clean and match the published tag and source head.'
    );
  }
  for (const source of sourceFiles) {
    if (!hasText(source) || path.isAbsolute(source) || source.split(/[\\/]/).includes('..')) {
      throw new Error('Release evidence must name repository-relative committed files.');
    }
    let committed;
    try {
      committed = execFileSync(
        'git',
        ['-C', sourceRoot, 'cat-file', 'blob', `${release.sourceHead}:${source}`],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
    } catch {
      throw new Error(`Release evidence ${source} is not a file in the published commit.`);
    }
    if (!committed.equals(fs.readFileSync(path.join(sourceRoot, source)))) {
      throw new Error(`Release evidence ${source} differs from the published commit.`);
    }
  }
}

export function checkContentPack(pack, options = {}) {
  const channelConfig = loadChannelConfig();
  const briefValidation = validateBrief(pack.brief, channelConfig, {
    now: options.now ?? new Date(),
    sourceRoot: pack.sourceRoot,
  });
  const draftValidation = validateDrafts(pack.drafts, pack.brief, channelConfig);
  const errors = [...briefValidation.errors, ...draftValidation.errors];
  if (!['ai-structured', 'agent-authored'].includes(pack.generator?.mode)) {
    errors.push('Only a successfully generated structured pack can become publish-eligible.');
  }
  return {
    errors: [...new Set(errors)],
    warnings: [...new Set([...briefValidation.warnings, ...draftValidation.warnings])],
  };
}

export function validateFinalCopy({ body, channelId, pack, publicUrl }) {
  const channelConfig = loadChannelConfig();
  const draft = pack.drafts.find((entry) => entry.channelId === channelId);
  if (!draft) return { errors: [`Pack does not contain channel "${channelId}".`], warnings: [] };

  const finalDraft = { ...draft, body, script: channelId === 'youtube' ? body : '' };
  const brief = { ...pack.brief, channels: [channelId] };
  const briefValidation = validateBrief(brief, channelConfig, { sourceRoot: pack.sourceRoot });
  const draftValidation = validateDrafts([finalDraft], brief, channelConfig);
  const result = {
    errors: [...briefValidation.errors, ...draftValidation.errors],
    warnings: [...briefValidation.warnings, ...draftValidation.warnings],
  };
  if (publicUrl) {
    try {
      const url = new URL(publicUrl);
      if (url.protocol !== 'https:') result.errors.push('Published URL must use HTTPS.');
    } catch {
      result.errors.push('Published URL is invalid.');
    }
  }
  return result;
}

export function validatePublishedAsset(asset) {
  if (asset === undefined || asset === null) return [];
  if (typeof asset !== 'object' || Array.isArray(asset)) {
    return ['Published asset metadata must be a JSON object.'];
  }

  const errors = [];
  const allowedKeys = new Set([
    'kind',
    'publicUrl',
    'sha256',
    'altText',
    'width',
    'height',
    'durationSeconds',
  ]);
  for (const key of Object.keys(asset)) {
    if (!allowedKeys.has(key)) errors.push(`Unsupported published asset field "${key}".`);
  }
  if (!['image', 'video'].includes(asset.kind)) {
    errors.push('Published asset kind must be image or video.');
  }
  try {
    const url = new URL(asset.publicUrl);
    if (url.protocol !== 'https:') errors.push('Published asset URL must use HTTPS.');
  } catch {
    errors.push('Published asset URL is invalid.');
  }
  if (!/^[a-f0-9]{64}$/.test(asset.sha256 ?? '')) {
    errors.push('Published asset sha256 must be a lowercase 64-character digest.');
  }
  if (!hasText(asset.altText)) errors.push('Published asset altText is required.');
  for (const field of ['width', 'height', 'durationSeconds']) {
    const value = asset[field];
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
      errors.push(`Published asset ${field} must be a positive number when supplied.`);
    }
  }
  return errors;
}

export function createPublishedRecord({
  pack,
  channelId,
  publicUrl,
  finalCopy,
  publishedAt,
  metrics,
  asset,
}) {
  return {
    schemaVersion: 1,
    contentId: pack.id,
    channelId,
    publicUrl,
    publishedAt,
    recordedAt: new Date().toISOString(),
    finalCopy,
    contentHash: crypto.createHash('sha256').update(finalCopy).digest('hex'),
    asset: asset ?? null,
    evidenceIds: pack.drafts.find((draft) => draft.channelId === channelId)?.evidenceIds ?? [],
    metrics: metrics ?? { after24Hours: null, after7Days: null, notes: [] },
    humanReviewed: true,
    publishedManually: true,
  };
}

export function validateMetrics(metrics) {
  const errors = [];
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    return ['Metrics must be a JSON object.'];
  }
  const allowedKeys = new Set(['after24Hours', 'after7Days', 'notes']);
  for (const key of Object.keys(metrics)) {
    if (!allowedKeys.has(key)) errors.push(`Unsupported metrics field "${key}".`);
  }
  for (const key of ['after24Hours', 'after7Days']) {
    const value = metrics[key];
    if (
      value !== null &&
      value !== undefined &&
      (typeof value !== 'object' || Array.isArray(value))
    ) {
      errors.push(`${key} must be an object or null.`);
      continue;
    }
    for (const [metric, metricValue] of Object.entries(value ?? {})) {
      if (metricValue !== null && (typeof metricValue !== 'number' || metricValue < 0)) {
        errors.push(`${key}.${metric} must be a non-negative number or null.`);
      }
    }
  }
  if (metrics.notes !== undefined && !Array.isArray(metrics.notes)) {
    errors.push('Metrics notes must be an array of short strings.');
  } else if (metrics.notes?.some((note) => !hasText(note))) {
    errors.push('Metrics notes may contain only non-empty strings.');
  }
  return errors;
}
