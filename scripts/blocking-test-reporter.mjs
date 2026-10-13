import path from 'node:path';
import { TEST_TIERS } from './test-tier-manifest.mjs';

// Keep per-tier evidence while executing the complete union in a single process.
export function blockingCoverage(modules, root = process.cwd()) {
  const byFile = new Map();
  for (const module of modules) {
    const file = path.relative(root, module.moduleId).split(path.sep).join('/');
    if (byFile.has(file)) throw new Error(`Duplicate blocking test file: ${file}`);
    byFile.set(file, module);
  }
  const expected = new Set([...TEST_TIERS.tier1.files, ...TEST_TIERS.tier2.files]);
  if (byFile.size !== expected.size || [...byFile.keys()].some((file) => !expected.has(file))) {
    throw new Error('Blocking test run must include exactly the Tier 1/2 union.');
  }
  const coverage = {};
  for (const name of ['tier1', 'tier2']) {
    let count = 0;
    for (const file of TEST_TIERS[name].files) {
      const module = byFile.get(file);
      const tests = module ? [...module.children.allTests()] : [];
      if (!module || module.state() !== 'passed' || !tests.length ||
          tests.some((test) => test.result().state !== 'passed')) {
        throw new Error(`Incomplete passing blocking coverage: ${file}`);
      }
      count += tests.length;
    }
    coverage[name] = { files: TEST_TIERS[name].files.length, tests: count };
  }
  return coverage;
}

export default class BlockingTestReporter {
  onTestRunEnd(modules, errors, reason) {
    if (reason !== 'passed' || errors.length) return;
    console.log(`Navet blocking coverage: ${JSON.stringify(blockingCoverage(modules))}`);
  }
}
