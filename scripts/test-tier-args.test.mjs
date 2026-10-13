import { describe, expect, it } from 'vitest';
import { TEST_TIERS } from './test-tier-manifest.mjs';
import { testTierArgs } from './test-tier-args.mjs';

describe('CI test partition', () => {
  // Keep: combining execution must preserve the exact blocking file selection.
  it('runs the complete blocking union once across both unit environments', () => {
    const args = testTierArgs('blocking');
    const files = args.slice(args.indexOf('--run') + 1).filter((arg) => !arg.startsWith('--'));
    expect(files).toEqual([...new Set([...TEST_TIERS.tier1.files, ...TEST_TIERS.tier2.files])]);
    expect(args[args.indexOf('--project') + 1]).toBe('unit*');
    expect(args).toContain('--reporter=./scripts/blocking-test-reporter.mjs');
    expect(() => testTierArgs('blocking', ['--exclude-blocking'])).toThrow();
  });
  it('keeps the local broad regression command complete', () => {
    expect(testTierArgs('tier3')).toContain('--run');
    expect(testTierArgs('tier3')).not.toContain('--exclude');
  });
  it('excludes exactly the test files owned by the other required lanes', () => {
    const args = testTierArgs('tier3', ['--', '--exclude-blocking', '--reporter=dot']);
    const excluded = args.flatMap((value, index) =>
      value === '--exclude' ? [args[index + 1]] : [],
    );
    expect(excluded).toEqual([...new Set([...TEST_TIERS.tier1.files, ...TEST_TIERS.tier2.files])]);
    expect(args).toContain('--reporter=dot');
    expect(args).not.toContain('--exclude-blocking');
    expect(excluded).not.toContain('scripts/pipeline-impact.test.mjs');
  });
  it.each(['tier1', 'tier2'])('does not allow excluding critical coverage from %s', (tier) => {
    expect(() => testTierArgs(tier, ['--exclude-blocking'])).toThrow();
    expect(testTierArgs(tier)).toEqual(expect.arrayContaining(TEST_TIERS[tier].files));
  });
});
