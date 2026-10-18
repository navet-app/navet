#!/usr/bin/env node
import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const API_ROOT = 'https://api.github.com';
const DEFAULT_REPOSITORY = 'navet-app/navet';
const REACTIONS = new Set(['+1', '-1', 'laugh', 'confused', 'heart', 'hooray', 'rocket', 'eyes']);
const REQUEST_LABELS = new Map([
  ['research', 'navet: research'],
  ['implement', 'navet: implement'],
]);

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function numeric(value, label) {
  if (!/^\d+$/.test(value ?? '')) throw new Error(`${label} must be a numeric GitHub ID.`);
  return value;
}

export function createAppJwt({ appId, privateKey, now = Date.now() }) {
  const issuedAt = Math.floor(now / 1000) - 60;
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({ iat: issuedAt, exp: issuedAt + 600, iss: String(appId) })
  );
  const unsigned = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(privateKey, 'base64url')}`;
}

async function fetchWithTimeout(url, init, fetchImpl) {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new Error('GitHub request timed out after 30 seconds.');
    }
    throw error;
  }
}

function validateRepository(repository) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error('NAVET_NISSE_REPOSITORY must use the owner/repository format.');
  }
  return repository;
}

export async function createInstallationToken({ appId, installationId, privateKey, repository = DEFAULT_REPOSITORY, fetchImpl = fetch }) {
  const repositoryName = validateRepository(repository).split('/')[1];
  const jwt = createAppJwt({ appId, privateKey });
  const response = await fetchWithTimeout(
    `${API_ROOT}/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${jwt}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      // An organization installation can cover other integrations. This runner
      // receives access only to Navet issues and read-only PR monitoring.
      body: JSON.stringify({
        repositories: [repositoryName],
        permissions: { issues: 'write', pull_requests: 'read', metadata: 'read' },
      }),
    },
    fetchImpl
  );
  if (!response.ok) {
    throw new Error(`GitHub App token request failed with ${response.status}.`);
  }
  const result = await response.json();
  if (!result.token) throw new Error('GitHub App token response did not include a token.');
  return result.token;
}

export function parseOperation(args, repository = DEFAULT_REPOSITORY) {
  validateRepository(repository);
  const [operation, first, second, third] = args;
  if (operation === 'comment' && second === '--body-file' && third && args.length === 4) {
    const number = numeric(first, 'Issue number');
    return {
      method: 'POST',
      path: `/repos/${repository}/issues/${number}/comments`,
      bodyFile: third,
    };
  }
  if (operation === 'react' && args.length === 3) {
    const commentId = numeric(first, 'Comment ID');
    if (!REACTIONS.has(second)) throw new Error(`Unsupported GitHub reaction: ${second}.`);
    return {
      method: 'POST',
      path: `/repos/${repository}/issues/comments/${commentId}/reactions`,
      body: { content: second },
    };
  }
  if (operation === 'unreact' && args.length === 3) {
    const commentId = numeric(first, 'Comment ID');
    const reactionId = numeric(second, 'Reaction ID');
    return {
      method: 'DELETE',
      path: `/repos/${repository}/issues/comments/${commentId}/reactions/${reactionId}`,
    };
  }
  if (operation === 'remove-request-label' && args.length === 3) {
    const number = numeric(first, 'Issue number');
    const label = REQUEST_LABELS.get(second);
    if (!label) throw new Error(`Unsupported request mode: ${second}.`);
    return {
      method: 'DELETE',
      path: `/repos/${repository}/issues/${number}/labels/${encodeURIComponent(label)}`,
    };
  }
  throw new Error(
    'Usage: run-as-navet-nisse.mjs comment <number> --body-file <path> | react <comment-id> <reaction> | unreact <comment-id> <reaction-id> | remove-request-label <number> <research|implement>'
  );
}

async function requireIssueTarget(token, operation, fetchImpl) {
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28' };
  const match = /^\/repos\/([\w.-]+\/[\w.-]+)\/issues\/(\d+|comments\/\d+)\/(comments|labels\/[^/]+|reactions(?:\/\d+)?)$/.exec(operation.path);
  if (!match) throw new Error('Unsupported Navet Nisse mutation target.');
  const prefix = `/repos/${match[1]}/issues/`;
  let target = match[2];
  if (target.startsWith('comments/')) {
    const response = await fetchWithTimeout(`${API_ROOT}${prefix}${target}`, { method: 'GET', headers }, fetchImpl);
    if (!response.ok) throw new Error(`Navet Nisse comment target read failed with ${response.status}.`);
    const comment = await response.json();
    const issuePrefix = `${API_ROOT}${prefix}`;
    if (String(comment.id) !== target.slice('comments/'.length) || typeof comment.issue_url !== 'string' ||
        !comment.issue_url.startsWith(issuePrefix) || !/^\d+$/.test(comment.issue_url.slice(issuePrefix.length))) {
      throw new Error('Navet Nisse comment target identity mismatch.');
    }
    target = comment.issue_url.slice(issuePrefix.length);
  }
  const response = await fetchWithTimeout(`${API_ROOT}${prefix}${target}`, { method: 'GET', headers }, fetchImpl);
  if (!response.ok) throw new Error(`Navet Nisse issue target read failed with ${response.status}.`);
  const issue = await response.json();
  if (String(issue.number) !== target) throw new Error('Navet Nisse issue target identity mismatch.');
  if (Object.hasOwn(issue, 'pull_request')) throw new Error('Navet Nisse mutations are restricted to issues; PR replies use the maintainer identity.');
}

export async function performOperation({ token, operation, fetchImpl = fetch }) {
  await requireIssueTarget(token, operation, fetchImpl);
  const body = operation.bodyFile
    ? { body: await readFile(operation.bodyFile, 'utf8') }
    : operation.body;
  const response = await fetchWithTimeout(
    `${API_ROOT}${operation.path}`,
    {
      method: operation.method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    fetchImpl
  );
  if (!response.ok) {
    throw new Error(`Navet Nisse GitHub operation failed with ${response.status}.`);
  }
  return response.status === 204 ? null : response.json();
}

async function readConfiguration() {
  if (!process.env.NAVET_NISSE_CONFIG_PATH) return {};
  return JSON.parse(await readFile(process.env.NAVET_NISSE_CONFIG_PATH, 'utf8'));
}

async function main() {
  const configuration = await readConfiguration();
  const appId = process.env.NAVET_NISSE_APP_ID ?? configuration.appId;
  const installationId =
    process.env.NAVET_NISSE_INSTALLATION_ID ?? configuration.installationId;
  const privateKeyPath =
    process.env.NAVET_NISSE_PRIVATE_KEY_PATH ?? configuration.privateKeyPath;
  const repository =
    process.env.NAVET_NISSE_REPOSITORY ?? configuration.repository ?? DEFAULT_REPOSITORY;
  if (!appId || !installationId) {
    throw new Error('NAVET_NISSE_APP_ID and NAVET_NISSE_INSTALLATION_ID are required.');
  }
  const privateKey = process.env.NAVET_NISSE_PRIVATE_KEY
    ? process.env.NAVET_NISSE_PRIVATE_KEY
    : privateKeyPath
      ? await readFile(privateKeyPath, 'utf8')
      : null;
  if (!privateKey) {
    throw new Error('NAVET_NISSE_PRIVATE_KEY or NAVET_NISSE_PRIVATE_KEY_PATH is required.');
  }

  const operation = parseOperation(process.argv.slice(2), repository);
  const token = await createInstallationToken({ appId, installationId, privateKey, repository });
  const result = await performOperation({ token, operation });
  if (result?.id) process.stdout.write(`${result.id}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
