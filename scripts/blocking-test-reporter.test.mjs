import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import BlockingTestReporter, { blockingCoverage } from './blocking-test-reporter.mjs';
import { TEST_TIERS } from './test-tier-manifest.mjs';

const modules = () => [...new Set([...TEST_TIERS.tier1.files, ...TEST_TIERS.tier2.files])].map((file) => ({
  moduleId: path.resolve(file),
  state: () => 'passed',
  children: { allTests: () => [{ result: () => ({ state: 'passed' }) }] },
}));

// Keep: push evidence must distinguish complete passing coverage from filtered runs.
describe('blocking test evidence', () => {
  it('counts every manifest file and its executed tests under its owning tier', () => {
    expect(blockingCoverage(modules())).toEqual({
      tier1: { files: TEST_TIERS.tier1.files.length, tests: TEST_TIERS.tier1.files.length },
      tier2: { files: TEST_TIERS.tier2.files.length, tests: TEST_TIERS.tier2.files.length },
    });
  });
  it.each(['missing', 'duplicate', 'unexpected', 'failed-module', 'skipped', 'pending', 'failed-test', 'empty'])('rejects %s coverage', (kind) => {
    const files = modules();
    if (kind === 'missing') files.pop();
    if (kind === 'duplicate') files.push(files[0]);
    if (kind === 'unexpected') files[0].moduleId = path.resolve('unexpected.test.ts');
    if (kind === 'failed-module') files[0].state = () => 'failed';
    if (['skipped', 'pending', 'failed-test'].includes(kind)) {
      files[0].children.allTests = () => [{ result: () => ({ state: kind === 'failed-test' ? 'failed' : kind }) }];
    }
    if (kind === 'empty') files[0].children.allTests = () => [];
    expect(() => blockingCoverage(files)).toThrow();
  });
  it.each([['failed', []], ['interrupted', []], ['passed', [new Error('unhandled')]]])('emits no passing evidence for %s with errors=%j', (reason, errors) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      new BlockingTestReporter().onTestRunEnd(modules(), errors, reason);
      expect(log).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});
