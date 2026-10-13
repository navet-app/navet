#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { TEST_TIERS } from './test-tier-manifest.mjs';
import { testTierArgs } from './test-tier-args.mjs';

const [tierName, ...extraArgs] = process.argv.slice(2);
const tier = tierName === 'blocking'
  ? { files: [...new Set([...TEST_TIERS.tier1.files, ...TEST_TIERS.tier2.files])] }
  : TEST_TIERS[tierName];

if (!tier) {
  const tierNames = [...Object.keys(TEST_TIERS), 'blocking'].join(', ');
  console.error(`Unknown test tier "${tierName ?? ''}". Expected one of: ${tierNames}`);
  process.exit(1);
}

const missingFiles = tier.files.filter((file) => !fs.existsSync(file));

if (missingFiles.length > 0) {
  console.error(`Test tier ${tierName} references missing files:`);
  for (const file of missingFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

const args = testTierArgs(tierName, extraArgs);

const result = spawnSync('pnpm', ['exec', ...args], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
