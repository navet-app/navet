import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

// Build common preconditions with the real implementation once, then give each
// scenario an independent copy. Never share a live store or Git index.
export function directorySeed(build, { stateFiles = [] } = {}) {
  const seeds = new Map();
  const directories = [];
  afterAll(async () => {
    await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })));
  });
  return async (destination, key = 'default') => {
    if (!seeds.has(key)) {
      seeds.set(key, (async () => {
        const directory = await mkdtemp(path.join(tmpdir(), 'navet-fixture-seed-'));
        directories.push(directory);
        const metadata = await build(directory, key);
        return { directory, metadata };
      })());
    }
    const seed = await seeds.get(key);
    const relocate = (value) => {
      if (typeof value === 'string') {
        return value === seed.directory ? destination : value.startsWith(seed.directory + path.sep)
          ? destination + value.slice(seed.directory.length) : value;
      }
      if (Array.isArray(value)) return value.map(relocate);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, relocate(item)]));
      return value;
    };
    await cp(seed.directory, destination, { recursive: true });
    for (const relative of stateFiles) {
      const file = path.join(destination, relative);
      await writeFile(file, JSON.stringify(relocate(JSON.parse(await readFile(file, 'utf8'))), null, 2) + '\n');
    }
    return relocate(structuredClone(seed.metadata));
  };
}
