#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const SCOPES = new Set(['brand', 'dashboard', 'provider', 'ui', 'workflow', 'release']);

const SCOPE_COMMANDS = {
  brand: [
    ['pnpm', ['check:brand']],
    ['pnpm', ['docs:build']],
  ],
  dashboard: [
    ['pnpm', ['check:ui-kit']],
    ['pnpm', ['check:stories']],
    ['pnpm', ['exec', 'vitest', '--config', 'vitest.unit.config.ts', '--project', 'unit*', '--run', 'packages/app/src/features/dashboard']],
  ],
  provider: [
    ['pnpm', ['check:provider-boundaries']],
    ['pnpm', ['check:runtime-policies']],
    ['pnpm', ['check:rss-transport']],
    ['pnpm', ['test:tier1']],
  ],
  ui: [
    ['pnpm', ['test:registry']],
    ['pnpm', ['check:ui-kit']],
    ['pnpm', ['check:stories']],
  ],
  workflow: [
    ['pnpm', ['test:registry']],
    ['pnpm', ['check:stories']],
    ['pnpm', ['check:ui-kit']],
    ['pnpm', ['check:provider-boundaries']],
    ['pnpm', ['check:runtime-policies']],
    ['pnpm', ['check:rss-transport']],
  ],
  release: [
    ['pnpm', ['release:check']],
    ['pnpm', ['check:provider-boundaries']],
    ['pnpm', ['check:runtime-policies']],
    ['pnpm', ['check:rss-transport']],
    ['pnpm', ['test:ha-integration']],
    ['pnpm', ['check:docker']],
  ],
};

function parseArgs(argv) {
  const options = {
    dryRun: false,
    scope: null,
    files: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--') {
      continue;
    }

    if (arg === '--dry-run' || arg === '--list') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--scope') {
      options.scope = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg.startsWith('--scope=')) {
      options.scope = arg.slice('--scope='.length);
      continue;
    }

    if (arg === '--file') {
      const file = argv[index + 1];
      if (file) {
        options.files.push(file);
      }
      index += 1;
      continue;
    }

    if (arg.startsWith('--file=')) {
      options.files.push(arg.slice('--file='.length));
      continue;
    }

    throw new Error(`Unknown argument "${arg}".`);
  }

  return options;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: options.stdio ?? 'pipe',
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function getChangedFiles() {
  const diff = run('git', ['diff', '--name-only', '--diff-filter=ACMRTUXB', 'HEAD']);
  const untracked = run('git', ['ls-files', '--others', '--exclude-standard']);
  const output = `${diff.stdout ?? ''}\n${untracked.stdout ?? ''}`;

  return Array.from(
    new Set(
      output
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    )
  );
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function inferScopes(files) {
  const scopes = new Set();

  for (const rawFile of files) {
    const file = normalizePath(rawFile);

    if (
      file.startsWith('assets/brand/') ||
      file === '.agents/product-marketing.md' ||
      file === 'apps/docs/astro.config.mjs' ||
      file === 'apps/docs/src/content.config.ts' ||
      file === 'apps/demo/index.html' ||
      file === 'apps/standalone/index.html' ||
      file === 'apps/standalone/vite.config.ts' ||
      file === 'apps/website/index.html' ||
      file === 'packages/app/src/marketing/data/marketingContent.ts' ||
      file === 'packages/app/src/marketing/seo/marketingMetadata.ts' ||
      file === 'assets/public/README.md' ||
      file.startsWith('assets/public/logo') ||
      file.startsWith('assets/public/favicon') ||
      file.startsWith('assets/public/apple-touch-icon') ||
      file.startsWith('assets/public/pwa-') ||
      file === 'assets/public/navet-social-card.jpg' ||
      file === 'assets/public/site.webmanifest' ||
      file.startsWith('docs/branding/') ||
      file.startsWith('platform/home-assistant/addons/navet/') ||
      file.startsWith('platform/home-assistant/addons/navet-dev/') ||
      file.startsWith('platform/home-assistant/custom_components/navet/brand/') ||
      file === 'scripts/brand-assets.mjs' ||
      file === 'scripts/generate-brand-reference-visuals.mjs' ||
      file === 'apps/website/scripts/generate-social-card.mjs'
    ) {
      scopes.add('brand');
    }

    if (
      file.startsWith('packages/provider-') ||
      file.startsWith('packages/core/') ||
      file.startsWith('testing/provider-lab/') ||
      file === 'scripts/install-provider-lab.mjs' ||
      file.includes('provider-contract') ||
      file.includes('provider-runtime') ||
      file.includes('integration-store') ||
      file === 'packages/app/src/commands.ts' ||
      file === 'packages/app/src/commands.test.ts' ||
      file.includes('integration-registry.service')
    ) {
      scopes.add('provider');
    }

    if (
      file.startsWith('packages/app/src/features/dashboard/') ||
      file.startsWith('packages/app/src/hooks/') ||
      file.startsWith('packages/app/src/stores/')
    ) {
      scopes.add('dashboard');
    }

    if (
      file.startsWith('packages/ui/') ||
      file.startsWith('packages/app/src/components/') ||
      file.startsWith('packages/app/src/ui-kit/') ||
      file.startsWith('packages/app/src/composition-recipes/') ||
      file.startsWith('docs/design-system/')
    ) {
      scopes.add('ui');
    }

    if (
      file.startsWith('scripts/') ||
      file === 'package.json' ||
      file === 'pnpm-lock.yaml' ||
      file.startsWith('docs/agents/') ||
      file.startsWith('docs/testing/')
    ) {
      scopes.add('workflow');
    }

    if (
      file.startsWith('.github/workflows/') ||
      file.startsWith('apps/ha-panel/') ||
      file.startsWith('hacs/') ||
      file.startsWith('custom_components/') ||
      (file.startsWith('platform/home-assistant/custom_components/') && file.endsWith('.py')) ||
      file.includes('release')
    ) {
      scopes.add('release');
    }
  }

  if (scopes.size === 0) {
    scopes.add('workflow');
  }

  return Array.from(scopes).filter((scope) => SCOPES.has(scope));
}

function formatCommand([command, args]) {
  return [command, ...args].join(' ');
}

function uniqueCommands(scopes) {
  const seen = new Set();
  const commands = [];

  for (const scope of scopes) {
    for (const command of SCOPE_COMMANDS[scope] ?? []) {
      const key = formatCommand(command);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      commands.push(command);
    }
  }

  return commands;
}

function printPlan(scopes, files, commands) {
  console.log(`Validation scopes: ${scopes.join(', ')}`);

  if (files.length > 0) {
    console.log('\nChanged files considered:');
    for (const file of files) {
      console.log(`- ${file}`);
    }
  }

  console.log('\nCommands:');
  for (const command of commands) {
    console.log(`- ${formatCommand(command)}`);
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.scope && !SCOPES.has(options.scope)) {
    throw new Error(`Unknown scope "${options.scope}". Expected one of: ${Array.from(SCOPES).join(', ')}.`);
  }

  const files = options.files.length > 0 ? options.files : getChangedFiles();
  const scopes = options.scope ? [options.scope] : inferScopes(files);
  const commands = uniqueCommands(scopes);

  printPlan(scopes, files, commands);

  if (options.dryRun) {
    process.exit(0);
  }

  for (const [command, args] of commands) {
    console.log(`\n> ${formatCommand([command, args])}`);
    const result = spawnSync(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if ((result.status ?? 1) !== 0) {
      process.exit(result.status ?? 1);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
