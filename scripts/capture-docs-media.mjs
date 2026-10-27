import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { assetPaths } from './repo-paths.mjs';

// Capture exact public-safe fixtures. embed=true prevents story interaction tests
// from advancing the UI while a guide's state is being prepared.
const phone = { width: 430, height: 932 };
const scenarios = [
  {
    names: ['settings/sidebar-extension-dialog'],
    demoPath: '/demo/home',
    selector: 'button[aria-label="Customize"]',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Customize', exact: true }).click();
      await page.getByRole('button', { name: 'Customize sidebar', exact: true }).click();
      await page.getByRole('dialog').waitFor();
    },
  },
  {
    names: ['quick-start/mobile-navigation-sheets'],
    demoPath: '/demo/home',
    viewport: phone,
    selector: 'button[aria-label="Customize"]',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'More', exact: true }).click();
      await page.getByText('Sections', { exact: true }).first().waitFor();
    },
  },
  {
    names: ['settings/wallpaper-dialog'],
    story: 'pages-settings-appearance--default',
    ready: 'Theme and accent',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Change wallpaper', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Upload wallpaper' }).waitFor();
    },
  },
  {
    names: ['wall-displays/screensaver-settings'],
    story: 'pages-settings-appearance--default',
    ready: 'Theme and accent',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Screensaver', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'On', exact: true }).click();
      await page.getByLabel('Start after', { exact: true }).waitFor();
    },
  },
  {
    names: ['wall-displays/screensaver-preview'],
    story: 'app-shell-screensaver-screensaver--default',
    selector: '[data-screensaver-scene]',
  },
  {
    names: ['settings/localization'],
    story: 'pages-settings-localization--default',
    ready: 'Temperature unit',
  },
  {
    names: ['settings/card-interaction-settings'],
    story: 'pages-settings-interaction--default',
    ready: 'Tap opens controls',
    focus: 'Tap opens controls',
  },
  {
    names: ['wall-displays/wall-display-preset', 'wall-displays/keep-awake-status'],
    story: 'pages-settings-interaction--default',
    ready: 'Wall display',
  },
  {
    names: ['wall-displays/visual-quality'],
    story: 'pages-settings-appearance--default',
    ready: 'Visual quality',
    focus: 'Visual quality',
  },
  {
    names: ['dashboards/backup-controls'],
    story: 'pages-settings-system--default',
    ready: 'Export config',
    focus: 'Export config',
  },
  {
    names: ['troubleshooting/connection-status', 'troubleshooting/provider-capabilities', 'troubleshooting/missing-entity-checklist'],
    story: 'pages-settings-system--connected-provider',
    ready: 'Connections',
  },
  {
    names: ['dashboards/entity-visibility', 'troubleshooting/restore-missing-entity'],
    story: 'pages-settings-dashboard--default',
    ready: 'Entity visibility',
  },
  {
    names: ['dashboards/entity-visibility-confirmation'],
    story: 'pages-settings-dashboard--default',
    ready: 'Restart onboarding',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Restart onboarding', exact: true }).click();
      await page.getByRole('alertdialog').waitFor();
    },
  },
  {
    names: ['dashboards/create-dashboard-dialog'],
    story: 'pages-dashboard-multiple-dashboards-create-dialog--phone-sheet',
    viewport: phone,
    ready: 'Name your dashboard',
    prepare: async (page) => {
      await page.getByLabel('Name', { exact: true }).fill('Upstairs lights');
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByText('Choose what to include', { exact: true }).waitFor();
    },
  },
  {
    names: ['dashboards/dashboard-manager-actions'],
    story: 'pages-settings-dashboard--multiple-dashboards',
    ready: 'Home dashboards',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Dashboard actions for Upstairs lights', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Assign displays', exact: true }).waitFor();
    },
  },
  {
    names: ['dashboards/assign-dashboard-devices'],
    story: 'pages-settings-dashboard--multiple-dashboards',
    ready: 'Home dashboards',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Dashboard actions for Upstairs lights', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Assign displays', exact: true }).click();
      await page.getByRole('dialog').getByText('Sonoff upstairs', { exact: true }).waitFor();
    },
  },
  {
    names: ['dashboards/dashboard-switcher'],
    story: 'app-shell-navigation-room-nav--multiple-dashboards',
    selector: '[data-dashboard-switcher-chevron]',
    prepare: async (page) => {
      await page.locator('[data-dashboard-switcher-chevron]').click();
      await page.getByText('Manage dashboards', { exact: true }).waitFor();
    },
  },
  {
    names: ['dashboards/card-size-selector'],
    story: 'components-shared-card-size-selector--phone-sheet',
    viewport: phone,
    selector: 'button[aria-label="Resize card"]',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Resize card', exact: true }).click();
      await page.getByRole('dialog', { name: 'Resize card', exact: true }).waitFor();
    },
  },
  {
    names: ['rooms/rooms-workspace', 'rooms/organized-room-navigation', 'rooms/room-device-lists'],
    story: 'pages-rooms-workspace--browse-desktop',
    ready: 'Search rooms or groups',
    selector: '[data-room-workspace-outline-content]',
  },
  {
    names: ['rooms/advanced-room-actions'],
    story: 'pages-rooms-workspace--room-details',
    ready: 'Room settings',
  },
  {
    names: ['rooms/split-room-dialog'],
    story: 'pages-rooms-workspace--device-selection',
    selector: '[data-room-workspace-outline-content]',
  },
  {
    names: ['rooms/room-appearance-dialog'],
    story: 'pages-rooms-operation-dialogs--appearance',
    selector: '[role="dialog"]',
  },
  {
    names: ['wall-displays/kiosk-control-center'],
    story: 'app-shell-kiosk-kiosk-control-center--desktop-navigation',
    ready: 'Kiosk control',
  },
  {
    names: ['wall-displays/kiosk-recovery-route'],
    story: 'app-shell-kiosk-kiosk-control-center--kiosk-behavior',
    ready: 'Kiosk control',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Kiosk behavior', exact: true }).click();
      await page.getByText('Swipe between rooms', { exact: true }).waitFor();
    },
  },
  {
    names: ['troubleshooting/unavailable-section'],
    story: 'cards-entity-alarm-panel--unavailable',
    ready: 'Unavailable',
  },
  {
    names: ['troubleshooting/camera-error'],
    story: 'cards-entity-camera--stream-fallback',
    ready: 'Garage Cam',
  },
  {
    names: ['troubleshooting/camera-stream-settings'],
    story: 'cards-entity-camera--dialog-direct-stream',
    ready: 'Open camera dialog',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Open camera dialog', exact: true }).click();
      await page.getByRole('dialog').waitFor();
    },
  },
  {
    names: ['everyday-control/alarm-confirmation'],
    story: 'cards-entity-alarm-panel--all-supported-modes',
    viewport: phone,
    ready: 'Emergency Trigger',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Emergency Trigger', exact: true }).click();
      await page.getByRole('button', { name: 'Trigger alarm', exact: true }).waitFor();
    },
  },
  {
    names: ['everyday-control/notifications'],
    story: 'app-shell-header-notification-panel--empty',
    selector: '[role="dialog"]',
  },
  {
    names: ['everyday-control/household-data-recovery'],
    story: 'pages-household-today--settings-and-recovery',
    ready: 'Chores today',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('button', { name: 'Data and recovery', exact: true }).click();
      await page.getByRole('button', { name: 'Download backup', exact: true }).waitFor();
    },
  },
  {
    names: ['everyday-control/household-setup-people'],
    story: 'pages-household-chore-onboarding--desktop',
    ready: 'Create your chore list',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Create your chore list', exact: true }).click();
      await page.getByRole('dialog').waitFor();
    },
  },
];

const argument = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
};
const baseUrl = argument('base-url') ?? 'http://127.0.0.1:6006';
const demoBaseUrl = argument('demo-base-url') ?? 'http://127.0.0.1:5173';
const requested = argument('scenario');
const requestedNames = requested?.split(',');
if (requestedNames?.some((name) => !scenarios.some(({ names }) => names.includes(name)))) {
  throw new Error(`Unknown docs screenshot: ${requested}`);
}
const selected = requestedNames
  ? scenarios.filter(({ names }) => names.some((name) => requestedNames.includes(name)))
  : scenarios;
const index = selected.some(({ story }) => story)
  ? await (await fetch(new URL('/index.json', baseUrl))).json()
  : null;
const browser = await chromium.launch({ headless: true });
let failed = 0;
try {
  for (const scenario of selected) {
    const context = await browser.newContext({
      viewport: scenario.viewport ?? { width: 1366, height: 1024 },
      colorScheme: 'dark', reducedMotion: 'reduce', serviceWorkers: 'block',
    });
    try {
      if (scenario.story && index.entries[scenario.story]?.type !== 'story') {
        throw new Error(`Missing story ${scenario.story}`);
      }
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      const url = scenario.demoPath
        ? new URL(scenario.demoPath, demoBaseUrl)
        : new URL('/iframe.html', baseUrl);
      if (scenario.story) {
        url.search = new URLSearchParams({
          id: scenario.story, viewMode: 'story', embed: 'true', globals: 'theme:dark',
        });
      }
      await page.goto(url.href, { waitUntil: 'networkidle' });
      await page.locator(scenario.story ? '#storybook-root' : 'html[data-navet-preview-runtime="demo"]').waitFor({ state: 'visible' });
      if (scenario.selector) await page.locator(scenario.selector).first().waitFor();
      else await page.getByText(scenario.ready, { exact: true }).first().waitFor();
      if (scenario.prepare) await scenario.prepare(page);
      if (scenario.focus) await page.getByText(scenario.focus, { exact: true }).first().scrollIntoViewIfNeeded();
      await page.evaluate(async () => {
        await document.fonts.ready;
        const visibleImages = Array.from(document.images).filter((image) => {
          const bounds = image.getBoundingClientRect();
          return !image.complete && bounds.bottom > 0 && bounds.top < window.innerHeight;
        });
        await Promise.race([
          Promise.all(visibleImages.map((image) => new Promise((done) => {
            image.addEventListener('load', done, { once: true });
            image.addEventListener('error', done, { once: true });
          }))),
          new Promise((done) => setTimeout(done, 5_000)),
        ]);
      });
      await page.waitForTimeout(500);
      const bytes = await sharp(await page.screenshot({ animations: 'disabled' }))
        .webp({ quality: 90, effort: 5 }).toBuffer();
      for (const name of scenario.names) {
        const destination = resolve(assetPaths.public, 'docs/how-to', `${name}.webp`);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, bytes);
      }
      console.log(`Captured ${scenario.names.join(', ')} from ${scenario.story ?? scenario.demoPath}`);
    } catch (error) {
      failed += 1;
      console.error(`Failed ${scenario.names.join(', ')}: ${error.message}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
if (failed) {
  throw new Error(`${failed} docs screenshot scenario(s) failed; their previous files were preserved.`);
}
