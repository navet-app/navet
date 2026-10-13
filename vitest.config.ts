import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { unitProjects } from './vitest.unit.config.ts';

const dirname = import.meta.dirname;
const storybookConfigDir = path.join(dirname, 'apps/storybook/.storybook');

export default defineConfig({
  test: {
    projects: [
      ...unitProjects,
      {
        extends: './vitest.shared.config.ts',
        plugins: [
          storybookTest({
            configDir: storybookConfigDir,
            storybookScript: 'pnpm storybook',
          }),
        ],
        test: {
          name: `storybook:${storybookConfigDir}`,
          dir: dirname,
          setupFiles: [path.join(dirname, 'packages/app/src/setupTests.ts')],
          coverage: {
            exclude: ['**/*.json', '**/package.json'],
          },
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
