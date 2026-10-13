import path from 'node:path';
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import sharedConfig from './vitest.shared.config.ts';

// These owners contain Node scripts and provider-neutral, DOM-free contracts.
const nodeTests = [
  'scripts/**/*.{test,spec}.{js,mjs,ts}',
  'packages/core/**/*.{test,spec}.{ts,tsx}',
];

export const unitProjects = [
  // Vitest consumes define entries during resolution; each project needs its own copy.
  mergeConfig({ ...sharedConfig, define: { ...sharedConfig.define } }, {
    test: {
      name: 'unit-node',
      environment: 'node',
      include: nodeTests,
    },
  }),
  mergeConfig({ ...sharedConfig, define: { ...sharedConfig.define } }, {
    test: {
      name: 'unit-browser',
      environment: 'jsdom',
      setupFiles: [path.resolve(import.meta.dirname, './packages/app/src/setupTests.ts')],
      include: [
        'packages/**/*.{test,spec}.{ts,tsx}',
        'apps/**/*.{test,spec}.{ts,tsx}',
        'assets/**/*.{test,spec}.{ts,tsx}',
      ],
      exclude: [...configDefaults.exclude, ...nodeTests],
    },
  }),
];

export default mergeConfig(sharedConfig, defineConfig({ test: { projects: unitProjects } }));
