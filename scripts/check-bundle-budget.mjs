import { readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { appPaths } from './repo-paths.mjs';
import { readViteDynamicPreloadAssetPaths } from './vite-preload-graph.mjs';

// Keep enough headroom for normal dependency drift without allowing the low-power
// startup graph to return to multi-megabyte parsing and compilation costs.
const MAX_ENTRY_JS_BYTES = 48 * 1024;
const MAX_EAGER_CHUNK_BYTES = 256 * 1024;
// The patched dependency baseline is ~788 KiB; retain a small margin for dependency drift.
const MAX_TOTAL_EAGER_JS_BYTES = 800 * 1024;
const MAX_AUTHENTICATED_TRANSITION_JS_BYTES = 320 * 1024;
// Assist adds the shared conversation surface while keeping the stylesheet below 560 KiB.
const MAX_MAIN_CSS_BYTES = 560 * 1024;
const FORBIDDEN_AUTHENTICATED_TRANSITION_PREFIXES = ['dnd-vendor', 'primitives-'];
const LAZY_CHUNK_PREFIXES = [
  'timer-card-',
  'counter-card-',
  'valve-card-',
  'remote-card-',
  'dashboard-card-item-draggable-',
  'dashboard-widget-battery-',
  'dashboard-widget-button-',
  'dashboard-widget-energy-',
  'dashboard-widget-map-',
  'dashboard-widget-note-',
  'dashboard-widget-photo-',
  'dashboard-widget-rss-',
  'dashboard-widget-shared-',
  'dashboard-widgets-',
  'dnd-vendor-',
  'energy-',
  'entity-card-calendar-',
  'entity-card-camera-',
  'entity-card-climate-',
  'entity-card-cover-',
  'entity-card-lighting-',
  'entity-card-lock-',
  'entity-card-media-',
  'entity-card-person-',
  'entity-card-scenes-',
  'entity-card-security-',
  'entity-card-sensors-',
  'entity-card-vacuum-',
  'entity-card-weather-',
  'home-dashboard-overview-edit-',
  'leaflet-vendor-',
  'locale-',
  'sections-',
  'settings-',
];

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${bytes} B`;
}

function getSingleMatch(input, pattern, label) {
  const match = input.match(pattern);
  if (!match?.[1]) {
    throw new Error(`Unable to find ${label} in apps/standalone/dist/index.html`);
  }

  return match[1];
}

function assertWithinBudget(label, value, limit) {
  if (value > limit) {
    throw new Error(`${label} exceeds budget: ${formatBytes(value)} > ${formatBytes(limit)}`);
  }
}

const standaloneDist = process.argv[2] ? resolve(process.argv[2]) : appPaths.standaloneDist;
const indexHtmlPath = join(standaloneDist, 'index.html');
const assetsDir = join(standaloneDist, 'assets');
const indexHtml = readFileSync(indexHtmlPath, 'utf8');

const entryScriptPath = getSingleMatch(
  indexHtml,
  /<script[^>]+type="module"[^>]+src="\.\/(assets\/[^"]+\.js)"/,
  'entry module'
);
const mainCssPath = getSingleMatch(
  indexHtml,
  /<link[^>]+rel="stylesheet"[^>]+href="\.\/(assets\/index-[^"]+\.css)"/,
  'main stylesheet'
);

const entryScriptFilePath = join(standaloneDist, entryScriptPath);
const entryScriptSize = statSync(entryScriptFilePath).size;
const mainCssSize = statSync(join(standaloneDist, mainCssPath)).size;

assertWithinBudget(`Entry bundle ${basename(entryScriptPath)}`, entryScriptSize, MAX_ENTRY_JS_BYTES);
assertWithinBudget(`Main stylesheet ${basename(mainCssPath)}`, mainCssSize, MAX_MAIN_CSS_BYTES);

const entrySource = readFileSync(entryScriptFilePath, 'utf8');
const readStaticImportPaths = (source) =>
  Array.from(
    source.matchAll(/(?:import|export)(?:[^'"]*?from)?["'](\.\/[^"']+\.js)["']/g)
  )
    .map((match) => match[1])
    .filter(Boolean);
const staticImportPaths = readStaticImportPaths(entrySource);

for (const importPath of staticImportPaths) {
  const importSize = statSync(join(assetsDir, importPath.replace('./', ''))).size;
  assertWithinBudget(`Eager chunk ${basename(importPath)}`, importSize, MAX_EAGER_CHUNK_BYTES);
}

const eagerAssetPaths = new Set([basename(entryScriptPath)]);
const pendingEagerAssetPaths = staticImportPaths.map((importPath) => importPath.replace('./', ''));

while (pendingEagerAssetPaths.length > 0) {
  const assetPath = pendingEagerAssetPaths.pop();
  if (!assetPath || eagerAssetPaths.has(assetPath)) {
    continue;
  }

  eagerAssetPaths.add(assetPath);
  const source = readFileSync(join(assetsDir, assetPath), 'utf8');
  for (const importPath of readStaticImportPaths(source)) {
    pendingEagerAssetPaths.push(importPath.replace('./', ''));
  }
}

const totalEagerJsSize = Array.from(eagerAssetPaths).reduce(
  (total, assetPath) => total + statSync(join(assetsDir, assetPath)).size,
  0
);
assertWithinBudget('Total eager JavaScript', totalEagerJsSize, MAX_TOTAL_EAGER_JS_BYTES);

const authenticatedPreloadGraph = readViteDynamicPreloadAssetPaths(
  entrySource,
  'authenticated-app-'
);
const authenticatedTransitionAssetPaths = Array.from(
  new Set(
    authenticatedPreloadGraph.assetPaths.filter(
      (assetPath) => assetPath.endsWith('.js') && !eagerAssetPaths.has(assetPath)
    )
  )
);
const forbiddenAuthenticatedAssets = authenticatedTransitionAssetPaths.filter((assetPath) =>
  FORBIDDEN_AUTHENTICATED_TRANSITION_PREFIXES.some((prefix) => assetPath.startsWith(prefix))
);
if (forbiddenAuthenticatedAssets.length > 0) {
  throw new Error(
    `Authenticated transition eagerly loads dashboard-only chunks: ${forbiddenAuthenticatedAssets.join(', ')}`
  );
}
const authenticatedTransitionJsSize = authenticatedTransitionAssetPaths.reduce(
  (total, assetPath) => total + statSync(join(assetsDir, assetPath)).size,
  0
);
assertWithinBudget(
  'Authenticated transition JavaScript',
  authenticatedTransitionJsSize,
  MAX_AUTHENTICATED_TRANSITION_JS_BYTES
);

const eagerLazyImports = staticImportPaths.filter((importPath) => {
  const importFileName = basename(importPath);
  return LAZY_CHUNK_PREFIXES.some((prefix) => importFileName.startsWith(prefix));
});

if (eagerLazyImports.length > 0) {
  console.warn(`Warning: entry bundle still eagerly imports lazy chunks: ${eagerLazyImports.join(', ')}`);
}

console.log(
  `Bundle budgets passed: ${basename(entryScriptPath)} ${formatBytes(entryScriptSize)}, total eager JavaScript ${formatBytes(totalEagerJsSize)}, authenticated transition JavaScript ${formatBytes(authenticatedTransitionJsSize)}, ${basename(mainCssPath)} ${formatBytes(mainCssSize)}`
);
