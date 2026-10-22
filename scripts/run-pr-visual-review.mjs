#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import { repoRoot } from './repo-paths.mjs';

const HOST = '127.0.0.1';
const PORT = 4181;
const BASE_URL = `http://${HOST}:${PORT}`;
const OUTPUT_DIR = resolve(repoRoot, process.env.NAVET_PR_REVIEW_OUTPUT ?? '.cache/pr-review');

async function verifyStableHeaderActions(page) {
  const actions = page.locator('[data-header-dashboard-actions]').filter({ visible: true });
  const initial = await actions.boundingBox();
  if (!initial) throw new Error('Desktop header actions are missing.');

  for (const [toggle, nextToggle] of [
    ['Hide side panel', 'Show side panel'],
    ['Show side panel', 'Hide side panel'],
  ]) {
    await page.getByRole('button', { name: toggle, exact: true }).click();
    await page.getByRole('button', { name: nextToggle, exact: true }).waitFor();
    const current = await actions.boundingBox();
    if (!current || Math.abs(current.x - initial.x) > 1 || Math.abs(current.y - initial.y) > 1) {
      throw new Error(`Header actions moved after ${toggle}: ${JSON.stringify({ initial, current })}`);
    }
  }
}

const scenarios = [
  { name: 'phone-home', path: '/demo/home', viewport: { width: 390, height: 844 } },
  {
    name: 'phone-room-living-room',
    path: '/demo/home',
    viewport: { width: 390, height: 844 },
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Rooms', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Living Room', exact: true }).click();
      await page.getByText('Living Room Air', { exact: true }).first().waitFor();
      await page.getByRole('navigation', { name: 'Summary bar', exact: true }).waitFor();
    },
  },
  { name: 'tablet-portrait-home', path: '/demo/home', viewport: { width: 1024, height: 1366 } },
  { name: 'tablet-landscape-home', path: '/demo/home', viewport: { width: 1366, height: 1024 }, prepare: verifyStableHeaderActions },
  { name: 'desktop-home', path: '/demo/home', viewport: { width: 1440, height: 900 }, prepare: verifyStableHeaderActions },
  { name: 'tablet-landscape-lights', path: '/demo/lights', viewport: { width: 1366, height: 1024 } },
  { name: 'tablet-landscape-climate', path: '/demo/climate', viewport: { width: 1366, height: 1024 } },
  { name: 'tablet-landscape-media', path: '/demo/media', viewport: { width: 1366, height: 1024 } },
  { name: 'tablet-landscape-energy', path: '/demo/energy', viewport: { width: 1366, height: 1024 } },
  { name: 'tablet-landscape-security', path: '/demo/security', viewport: { width: 1366, height: 1024 } },
  { name: 'tablet-landscape-tasks', path: '/demo/tasks', viewport: { width: 1366, height: 1024 } },
  { name: 'desktop-settings-dark', path: '/demo/settings', viewport: { width: 1440, height: 900 } },
  {
    name: 'desktop-settings-light',
    path: '/demo/settings',
    viewport: { width: 1440, height: 900 },
    prepare: async (page) => {
      const lightTheme = page.getByRole('button', { name: 'Light', exact: true });
      await lightTheme.click();
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll('button')).some(
          (button) => button.textContent?.trim() === 'Light' && button.ariaPressed === 'true'
        )
      );
    },
  },
];

// Verify named-room composition through navigation without comparing rendered images.
const namedRoomSamples = {
  Basement: 'Utility lights', Bathroom: 'Mirror lights', Bedroom: 'Bedroom fan',
  'Guest room': 'Window blind', Gym: 'Workout fan', Hallway: 'Main floor',
  Kitchen: 'Espresso machine', 'Living Room': 'Living Room Air', Office: 'Desk lamp',
  Outside: 'Outdoor temperature', Toilet: 'Extractor fan', Unassigned: 'Spare smart plug',
};
for (const [room, sample] of Object.entries(namedRoomSamples)) {
  scenarios.push({
    name: `desktop-room-${room.toLowerCase().replaceAll(' ', '-')}`,
    path: '/demo/home', viewport: { width: 1440, height: 900 },
    prepare: async (page) => {
      const direct = page.getByRole('button', { name: room, exact: true }).filter({ visible: true, hasText: room });
      if (await direct.count()) {
        await direct.click();
      } else {
        const group = ['Bedroom', 'Guest room', 'Office'].includes(room) ? 'Upstairs'
          : ['Kitchen', 'Living Room', 'Hallway'].includes(room) ? 'Shared spaces' : null;
        const groupButton = group ? page.getByRole('button', { name: group, exact: true }).filter({ visible: true }) : null;
        if (groupButton && await groupButton.count()) await groupButton.click();
        else await page.getByRole('button', { name: 'Rooms', exact: true }).click();
        await page.getByRole('menuitem', { name: room, exact: true }).click();
      }
      await page.getByText(sample, { exact: true }).first().waitFor();
      await page.getByRole('navigation', { name: 'Summary bar', exact: true }).waitFor();
    },
  });
}

// Exercise room inheritance through the actual navigation and panel editor.
for (const width of [1366, 1440]) {
  scenarios.push({
    name: `desktop-room-panel-editor-${width}`,
    path: '/demo/home', viewport: { width, height: 900 },
    prepare: async (page) => {
      const kitchenScenario = scenarios.find((scenario) => scenario.name === 'desktop-room-kitchen');
      await kitchenScenario.prepare(page);
      const panel = page.getByRole('region', { name: 'Side panel', exact: true });
      await page.getByRole('button', { name: 'Customize', exact: true }).click();
      const scope = panel.getByRole('button', { name: 'Panel for Kitchen', exact: true });
      await scope.waitFor();
      await panel.getByRole('button', { name: 'Add item', exact: true }).waitFor();
      await panel.getByRole('button', { name: 'Add item', exact: true }).click();
      const addDialog = page.getByRole('dialog', { name: 'Add item', exact: true });
      await addDialog.getByPlaceholder('Search entities', { exact: true }).fill('Note');
      await addDialog.getByRole('button', { name: 'Add item: Note', exact: true }).click();
      await page.getByLabel('Note text', { exact: true }).fill('Shared panel edited from Kitchen');
      await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
      await scope.click();
      await page.getByRole('menuitem', { name: 'Create room panel', exact: true }).click();
      await panel.getByRole('button', { name: 'Edit Note', exact: true }).click();
      await page.getByLabel('Note text', { exact: true }).fill('Saved Kitchen panel');
      await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
      await scope.click();
      await page.getByRole('menuitemradio', { name: 'Dashboard panel', exact: true }).click();
      if (await page.getByRole('alertdialog').count()) throw new Error('Switching panels must not request deletion.');
      await panel.getByText('Shared panel edited from Kitchen', { exact: true }).waitFor();
      if (await panel.getByText('Saved Kitchen panel', { exact: true }).count()) throw new Error('Shared panel was changed by room edits.');
      await page.reload({ waitUntil: 'networkidle' });
      await kitchenScenario.prepare(page);
      await page.getByRole('button', { name: 'Customize', exact: true }).click();
      await panel.getByText('Shared panel edited from Kitchen', { exact: true }).waitFor();
      await scope.click();
      await page.getByRole('menuitemradio', { name: 'Kitchen panel', exact: true }).click();
      await panel.getByText('Saved Kitchen panel', { exact: true }).waitFor();
    },
  });
}

function startServer() {
  const child = spawn(
    'pnpm',
    [
      '--filter',
      '@navet/demo',
      'exec',
      'vite',
      'preview',
      '--host',
      HOST,
      '--port',
      String(PORT),
      '--strictPort',
    ],
    {
      cwd: repoRoot,
      env: { ...process.env, BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  child.stdout.on('data', (chunk) => process.stdout.write(`[demo] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[demo] ${chunk}`));
  return child;
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolveExit) => child.once('exit', resolveExit)),
    new Promise((resolveDelay) => setTimeout(resolveDelay, 3_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function waitForServer(timeoutMs = 45_000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${BASE_URL}/demo/home`);
      if (response.ok) return;
      lastError = new Error(`Demo returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`Demo did not start at ${BASE_URL}.`, { cause: lastError });
}

async function stabilize(page, path) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle' });
  await page.locator('html[data-navet-preview-runtime="demo"]').waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images)
        .filter((image) => {
          const bounds = image.getBoundingClientRect();
          return !image.complete && bounds.bottom > 0 && bounds.top < window.innerHeight;
        })
        .map(
          (image) =>
            Promise.race([
              new Promise((resolveImage) => {
                image.addEventListener('load', resolveImage, { once: true });
                image.addEventListener('error', resolveImage, { once: true });
              }),
              new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2_000)),
            ])
        )
    );
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(300);
}

async function inspectPage(page, scenario) {
  const [result, unnamedButtons] = await Promise.all([
    page.evaluate(() => {
      const root = document.documentElement;

      return {
        horizontalOverflow: root.scrollWidth - root.clientWidth,
        visibleButtons: Array.from(document.querySelectorAll('button')).filter(
          (button) => button.getBoundingClientRect().width > 0
        ).length,
      };
    }),
    page
      .getByRole('button', { name: '', exact: true })
      .filter({ visible: true })
      .evaluateAll((buttons) => buttons.map((button) => button.outerHTML.slice(0, 180))),
  ]);

  if (result.horizontalOverflow > 1) {
    throw new Error(`${scenario.name} has ${result.horizontalOverflow}px of horizontal overflow.`);
  }
  if (result.visibleButtons === 0) {
    throw new Error(`${scenario.name} rendered no visible controls.`);
  }
  if (unnamedButtons.length > 0) {
    throw new Error(
      `${scenario.name} rendered visible buttons without accessible names:\n${unnamedButtons.join('\n')}`
    );
  }
}

await mkdir(OUTPUT_DIR, { recursive: true });
const server = startServer();
let browser;

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  const requestedScenarios = process.env.NAVET_PR_REVIEW_SCENARIOS?.split(',');
  for (const name of requestedScenarios ?? []) {
    if (!scenarios.some((item) => item.name === name)) throw new Error(`Unknown review scenario: ${name}`);
  }
  for (const scenario of scenarios.filter((item) => !requestedScenarios || requestedScenarios.includes(item.name))) {
    const context = await browser.newContext({
      viewport: scenario.viewport,
      colorScheme: 'dark',
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    await context.route('https://cloudflareinsights.com/**', async (route) => {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
        },
      });
    });
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(message.text());
    });

    let failure;
    try {
      await stabilize(page, scenario.path);
      if (scenario.prepare) await scenario.prepare(page);
      await inspectPage(page, scenario);
      if (runtimeErrors.length > 0) {
        throw new Error(`${scenario.name} emitted runtime errors:\n${runtimeErrors.join('\n')}`);
      }
    } catch (error) {
      failure = error;
    } finally {
      try {
        await page.screenshot({
          path: resolve(OUTPUT_DIR, `${scenario.name}.png`),
          animations: 'disabled',
          fullPage: true,
        });
      } catch (error) {
        if (!failure) failure = error;
        else process.stderr.write(`Could not capture ${scenario.name}: ${error.message}\n`);
      }
      await context.close();
    }
    if (failure) throw failure;
    process.stdout.write(`Reviewed ${scenario.name} (${scenario.viewport.width}x${scenario.viewport.height}).\n`);
  }
} finally {
  await browser?.close();
  await stopServer(server);
}
