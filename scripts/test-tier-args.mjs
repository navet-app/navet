import { TEST_TIER_CONFIG, TEST_TIERS } from './test-tier-manifest.mjs';

export function testTierArgs(tierName, extraArgs = []) {
  const tier = tierName === 'blocking'
    ? { files: [...new Set([...TEST_TIERS.tier1.files, ...TEST_TIERS.tier2.files])] }
    : TEST_TIERS[tierName];
  if (!tier) throw new Error(`Unknown test tier ${tierName}.`);
  const passthrough = extraArgs[0] === '--' ? extraArgs.slice(1) : extraArgs;
  const excludeBlocking = passthrough.includes('--exclude-blocking');
  if (excludeBlocking && tierName !== 'tier3')
    throw new Error('Only the CI Tier 3 remainder can exclude blocking tiers.');
  const args = [
    'vitest',
    '--config',
    TEST_TIER_CONFIG.config,
    '--project',
    TEST_TIER_CONFIG.project,
    '--run',
    ...tier.files,
  ];
  if (excludeBlocking) {
    for (const file of new Set([...TEST_TIERS.tier1.files, ...TEST_TIERS.tier2.files]))
      args.push('--exclude', file);
  }
  if (tierName === 'blocking') {
    args.push('--reporter=default', '--reporter=./scripts/blocking-test-reporter.mjs');
  }
  return [...args, ...passthrough.filter((arg) => arg !== '--exclude-blocking')];
}
