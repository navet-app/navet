import process from 'node:process';
import { readFileSync } from 'node:fs';
import {
  listAddedReleaseFragmentFiles,
  isDependabotPullRequest,
  readReleaseFragments,
} from './release-fragments.mjs';

const args = process.argv.slice(2);
const baseIndex = args.indexOf('--base');
const headIndex = args.indexOf('--head');
const base = baseIndex === -1 ? null : args[baseIndex + 1];
const head = headIndex === -1 ? 'HEAD' : args[headIndex + 1];

try {
  if (!base) throw new Error('Missing --base Git ref.');
  if (!head) throw new Error('Missing --head Git ref.');

  const files = listAddedReleaseFragmentFiles(base, head);
  const event = process.env.GITHUB_EVENT_PATH
    ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
    : null;
  if (files.length === 0 && isDependabotPullRequest(base, head, event)) {
    console.log('Validated dependency-only Dependabot update; no user-facing release note is required.');
    process.exit(0);
  }
  if (files.length === 0) {
    throw new Error(
      'Pull requests other than dependency-only Dependabot updates must add a .changes/*.yaml fragment. Use type: internal with audiences: [] when no user-facing note is needed.'
    );
  }

  readReleaseFragments(files, head);
  console.log(`Validated ${files.length} release fragment(s): ${files.join(', ')}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
