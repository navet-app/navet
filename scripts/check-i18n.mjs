import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const stableTypeScriptApi = require('typescript');
const scannerApi =
  typeof stableTypeScriptApi.createScanner === 'function'
    ? stableTypeScriptApi
    : await import('typescript/unstable/ast');
const astApi = scannerApi;
let nativeCompilerApi = null;
let nativeSnapshot = null;
let nativeProgram = null;

if (typeof stableTypeScriptApi.createSourceFile !== 'function') {
  const { API } = await import('typescript/unstable/sync');
  nativeCompilerApi = new API({ cwd: root });
  nativeSnapshot = nativeCompilerApi.updateSnapshot({
    openProjects: [path.join(root, 'tsconfig.json')],
  });
  nativeProgram = nativeSnapshot.getProject(path.join(root, 'tsconfig.json'))?.program ?? null;
  if (!nativeProgram) {
    nativeSnapshot.dispose();
    nativeCompilerApi.close();
    throw new Error('Unable to load the TypeScript project for the i18n checker');
  }
}
const messagesDirectory = path.join(root, 'packages/app/src/i18n/messages');
const languages = ['en', 'sv', 'de', 'fr', 'es', 'it', 'nl', 'pl', 'pt', 'no', 'da', 'fi', 'zh'];
const failures = [];

function parseSourceFile(file, source, scriptKind) {
  if (typeof stableTypeScriptApi.createSourceFile === 'function') {
    return stableTypeScriptApi.createSourceFile(
      file,
      source,
      stableTypeScriptApi.ScriptTarget.Latest,
      true,
      scriptKind
    );
  }

  const sourceFile = nativeProgram.getSourceFile(file);
  if (!sourceFile) {
    throw new Error(`Unable to parse ${path.relative(root, file)} for i18n validation`);
  }
  return sourceFile;
}

function visitChildren(node, visitor) {
  if (typeof stableTypeScriptApi.forEachChild === 'function') {
    stableTypeScriptApi.forEachChild(node, visitor);
    return;
  }
  node.forEachChild(visitor);
}

function isStringLiteralLike(node) {
  return typeof astApi.isStringLiteralLike === 'function'
    ? astApi.isStringLiteralLike(node)
    : astApi.isStringLiteral(node) || astApi.isNoSubstitutionTemplateLiteral(node);
}

function createMessageScanner(source) {
  if (typeof stableTypeScriptApi.createScanner === 'function') {
    return stableTypeScriptApi.createScanner(
      stableTypeScriptApi.ScriptTarget.Latest,
      true,
      stableTypeScriptApi.LanguageVariant.Standard,
      source
    );
  }

  // TypeScript 7's native package intentionally exposes only version metadata
  // from its root entry point. Its tokenizer lives in the unstable AST module
  // and uses the newer scanner signature.
  return scannerApi.createScanner(true, scannerApi.LanguageVariant.Standard, source);
}

function parseMessages(language) {
  const file = path.join(messagesDirectory, `${language}.ts`);
  const source = fs.readFileSync(file, 'utf8');
  const scanner = createMessageScanner(source);
  const syntaxKind = scannerApi.SyntaxKind;
  const endOfFileToken = syntaxKind.EndOfFileToken ?? syntaxKind.EndOfFile;
  const messages = new Map();
  let token = scanner.scan();

  while (token !== endOfFileToken) {
    if (token !== syntaxKind.StringLiteral) {
      token = scanner.scan();
      continue;
    }

    const key = scanner.getTokenValue();
    const separator = scanner.scan();
    if (separator !== syntaxKind.ColonToken) {
      token = separator;
      continue;
    }

    const valueToken = scanner.scan();
    if (
      valueToken === syntaxKind.StringLiteral ||
      valueToken === syntaxKind.NoSubstitutionTemplateLiteral
    ) {
      messages.set(key, scanner.getTokenValue());
    }
    token = scanner.scan();
  }

  return messages;
}

function interpolationTokens(value) {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

const dictionaries = Object.fromEntries(languages.map((language) => [language, parseMessages(language)]));
const english = dictionaries.en;
const providerNeutralMessageKeys = [
  'household.unavailable.description',
  'household.unauthorized.description',
  'dashboard.addEntity.descriptionWithHidden',
  'dashboard.addEntity.descriptionDefault',
  'dashboard.addEntity.defaultDescriptionAll',
  'dashboard.addCard.libraryDescription',
  'dashboard.addCard.tab.cardsHint',
  'dashboard.roomNav.reorderDialog.description',
  'dashboard.roomNav.reorderDialog.deleteDescription',
  'dashboard.shell.noLightsEmpty',
  'dashboard.page.connectingHomeAssistant',
  'dashboard.loadingRecovery.description',
  'dashboard.onboarding.route.all.body',
  'weather.settings.locationManaged',
  'vacuum.plan.mapHint',
  'entityRoomSelector.createPrompt',
  'energy.widgets.now.sparklineDescription',
  'energy.widgets.batteryDevices.empty',
  'energy.demo.hint',
  'energy.demo.connect',
  'energy.dashboard.flow.simpleDescription',
  'userDropdown.connected',
  'errorDisplay.connectionInterruptedDescription',
  'errorDisplay.issue.2',
  'errorDisplay.issue.5',
];
const providerBrandPattern = /home assistant|homey|openhab/i;

for (const language of languages) {
  for (const key of providerNeutralMessageKeys) {
    const value = dictionaries[language].get(key);
    if (value && providerBrandPattern.test(value)) {
      failures.push(`${language}: provider-specific wording in shared message ${key}`);
    }
  }
}

for (const language of languages.slice(1)) {
  const dictionary = dictionaries[language];
  const missing = [...english.keys()].filter((key) => !dictionary.has(key));
  const extra = [...dictionary.keys()].filter((key) => !english.has(key));

  if (missing.length > 0) failures.push(`${language}: missing keys: ${missing.join(', ')}`);
  if (extra.length > 0) failures.push(`${language}: extra keys: ${extra.join(', ')}`);

  for (const [key, englishValue] of english) {
    const localizedValue = dictionary.get(key);
    if (localizedValue === undefined) continue;
    const expected = interpolationTokens(englishValue);
    const actual = interpolationTokens(localizedValue);
    if (expected.join('\0') !== actual.join('\0')) {
      failures.push(
        `${language}: interpolation mismatch for ${key}: expected {${expected.join('}, {')}}, received {${actual.join('}, {')}}`
      );
    }
  }
}

const universallyAllowedIdenticalValues = new Set([
  'Navet',
  'UV',
  'Spotify',
  'Spotify Connect',
  'TV',
  'WebRTC',
  'MSE',
  'HLS',
  'MJPEG',
  'URL',
  '—',
  'U',
]);
const allowedIdenticalValuesByLanguage = {
  sv: new Set([
    // Native household-control terms shared with English.
    'Timer', 'Position',
    'System', 'Auto', 'Standard', 'Celsius', 'Fahrenheit', 'Medium', 'Version', 'Status',
    'Media', 'Receiver', 'Soundbar', 'Sensor', 'Max', 'Live', 'tv', 'Radio', 'Person',
    'Widget', 'Normal', 'Album', 'Orange', 'Neutral', 'Gas', 'period',
  ]),
  de: new Set([
    // Native household-control terms shared with English.
    'Timer', 'Position',
    'System', 'Auto', 'Standard', 'Celsius', 'Fahrenheit', 'Routine', 'Version', 'Status',
    'Widgets', 'Details', 'Wind', 'Shuffle', 'Soundbar', 'Sensor', 'Max', 'Live', 'Radio',
    'Administrator', 'Person', 'Widget', 'Info', 'Optional', 'Name', 'Link', 'Normal',
    'Streams', 'Album', 'Alarm', 'Feeds', 'Orange', 'Neutral', 'Solar', 'Gas', 'In Navet',
  ]),
  fr: new Set([
    // Native household-control terms shared with English.
    'Pause', 'Position',
    'Description',
    'Interaction', 'Auto', 'Standard', 'Celsius', 'Fahrenheit', 'Routine', 'Action',
    'Suggestions', 'Version', 'Photo', 'Widgets', 'Volume', 'Source', 'Mode', 'Zones',
    'Notifications', 'Important', 'Sections', 'Routines', 'Scripts', 'scripts', 'Total',
    'Sources', 'Radio', 'Conditions', 'Widget', 'Photos', 'pagination', 'Modes', 'charge',
    'Usage', 'source', 'Menu', 'Destination', 'Attention', 'Album', 'Orange', 'Type', 'Actions',
  ]),
  es: new Set([
    'Experimental', 'Auto', 'Manual', 'Celsius', 'Fahrenheit', 'Error', 'Total', 'Radio',
    'Sensor', 'Normal', 'Solar', 'Gas',
  ]),
  it: new Set([
    // Native household-control terms shared with English.
    'Timer',
    'Auto', 'Standard', 'Fahrenheit', 'Routine', 'Volume', 'Media', 'Radio', 'Menu',
    'Eco', 'Album', 'Comfort', 'Relax', 'Gas', 'In Navet',
  ]),
  nl: new Set([
    // Native household-control terms shared with English.
    'Timer', 'Open',
    'Items',
    'week',
    'Week {week}', 'Dashboard', 'Project', 'Celsius', 'Fahrenheit', 'Status', 'Widgets',
    'Details', 'Wind', 'Volume', 'Media', 'Soundbar', 'Sensor', 'Water', 'Zones', 'Max',
    'Later', 'Updates', 'camera', 'Routines', 'Scripts', 'scripts', 'Recent', 'Fans',
    'Radio', 'Script', 'Helper', 'Camera', 'Triggers', 'Stop', 'Open {name}', 'Widget',
    'Info', 'Week', 'Eco', '{count} live', 'Album', 'Alarm', 'Comfort', 'Feeds', 'Gas',
    'kW import', 'In Navet',
  ]),
  pl: new Set([
    'System',
    'Media',
    'Soundbar',
    'Radio',
    'Administrator',
    'Menu',
    'Link',
    'Album',
    'Liquid Glass',
  ]),
  pt: new Set([
    'Experimental', 'Auto', 'Manual', 'Celsius', 'Fahrenheit', 'Status', 'Widgets',
    'Volume', 'Sensor', 'Total', 'Radio', 'Widget', 'Link', 'Menu', 'Normal', 'Solar',
  ]),
  no: new Set([
    // Native household-control terms shared with English.
    'Timer', 'Start', 'Pause',
    'System', 'Auto', 'Standard', 'Celsius', 'Fahrenheit', 'Type', 'Status', 'Analytics',
    'Widgets', 'Media', 'Soundbar', 'Sensor', 'Live', 'tv', 'Radio', 'Administrator',
    'Scene', 'Person', 'Widget', 'Home Assistant Media', 'Home Assistant media', 'Info',
    'Fit', 'info', 'Normal', 'Album', 'Alarm', 'Dim', '{value} kW import', '{count} live',
    'kW live', 'kW import',
  ]),
  da: new Set([
    // Native household-control terms shared with English.
    'Timer', 'Start', 'Pause', 'Position', 'Position for {name}',
    'Dashboard', 'System', 'Auto', 'Standard', 'Celsius', 'Fahrenheit', 'Medium', 'Type',
    'Status', 'Analytics', 'Widgets', 'Soundbar', 'Sensor', 'Stop {order}', 'Live',
    'Scripts', 'script', 'scripts', 'tv', 'Radio', 'Administrator', 'Scene', 'Person',
    'Script', 'Stop', 'Widget', 'Home Assistant Media', 'Runtime', 'Info', 'Snapshot',
    'Live stream', 'Stream', 'Snapshot fallback', 'info', 'Menu', 'Link', 'Peak', 'Normal',
    'Snapshots', 'Album', 'Alarm', 'Feeds', 'Orange', 'Neutral', 'Dim', 'Solar', 'Gas',
    '{value} kW import', '{count} live', '{count} normal', 'kW live', 'kW import',
  ]),
  fi: new Set([
    'Auto', 'Celsius', 'Fahrenheit', 'Media', 'Soundbar', 'Max', 'tv', 'Radio', 'Widget',
    'Eco',
  ]),
  zh: new Set([]),
};
const allowedIdenticalKeys = new Set([
  'login.providerUrlLabel',
  'security.alarm.action.pending',
  'widgets.assist.title',
  'dashboard.addCard.templates.assist.name',
  // Homey product terminology and the commonly shared app abbreviation.
  'providerDetails.sections.automations',
  'providerDetails.sections.history',
  'providerDetails.sections.apps',
  // This message contains only interpolated values and punctuation.
  'energy.dashboard.usageShareStatus',
]);

function isAllowedIdentical(language, key, value) {
  return (
    universallyAllowedIdenticalValues.has(value) ||
    allowedIdenticalValuesByLanguage[language]?.has(value) ||
    allowedIdenticalKeys.has(key) ||
    (language === 'sv' && key === 'providerDetails.period' && value === 'Period') ||
    /^(?:https?:\/\/|media-source:\/\/|sensor\.|\{domain\}\.|extra-|tiny$|small$|medium$|large$)/.test(value) ||
    key.startsWith('dashboard.addCard.size.') ||
    (language === 'sv' && value === '{count} live') ||
    (language === 'de' && /^\{count\} (?:live|normal)$/.test(value)) ||
    (language === 'fr' && /^\{count\} (?:suggestions|attention|normal)$/.test(value)) ||
    (language === 'es' && value === '{count} normal') ||
    (language === 'pt' && value === '{count} item')
  );
}

for (const language of languages.slice(1)) {
  for (const [key, englishValue] of english) {
    const localizedValue = dictionaries[language].get(key);
    if (
      localizedValue === englishValue &&
      !isAllowedIdentical(language, key, englishValue)
    ) {
      failures.push(
        `${language}: untranslated English value for ${key}: ${JSON.stringify(englishValue)}`
      );
    }
  }
}

const productionRoot = path.join(root, 'packages/app/src');
const skippedPathParts = [
  '/__tests__/', '/marketing/', '/demo/', '/preview/', '/ui-kit/', '/components/system/',
];
const checkedAttributes = new Set(['aria-label', 'title', 'placeholder', 'alt', 'description', 'emptyLabel']);
const allowedLiteralValues = new Set([
  'OK', 'kWh', 'kW', 'W', 'Navet', 'openHAB', 'Alert', 'Continue', 'Selected', 'Home',
  'Language', 'Loading', 'awesomestvi', 'OSM', 'CARTO',
  'OpenStreetMap copyright', 'OpenStreetMap contributors', 'CARTO attributions',
  '© OpenMapTiles', '© OpenStreetMap',
]);

function isProductionTsx(file) {
  const normalized = file.split(path.sep).join('/');
  return (
    normalized.endsWith('.tsx') &&
    !normalized.endsWith('.stories.tsx') &&
    !normalized.endsWith('.story-fixtures.tsx') &&
    !normalized.endsWith('.test.tsx') &&
    !skippedPathParts.some((part) => normalized.includes(part))
  );
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(resolved) : [resolved];
  });
}

function isAllowedLiteral(value) {
  return (
    allowedLiteralValues.has(value) ||
    /^(?:https?:\/\/|sensor\.|media-source:\/\/)/.test(value)
  );
}

for (const file of walk(productionRoot).filter(isProductionTsx)) {
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = parseSourceFile(file, source, astApi.ScriptKind.TSX);

  function report(node, kind, value) {
    if (!/[A-Za-z]{2}/.test(value) || isAllowedLiteral(value)) return;
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    failures.push(`${path.relative(root, file)}:${line + 1}: hardcoded ${kind}: ${JSON.stringify(value)}`);
  }

  function visit(node) {
    if (astApi.isJsxText(node)) report(node, 'JSX text', node.text.trim());
    if (
      astApi.isJsxAttribute(node) &&
      checkedAttributes.has(node.name.text) &&
      node.initializer &&
      astApi.isStringLiteral(node.initializer)
    ) {
      report(node, node.name.text, node.initializer.text);
    }
    if (
      astApi.isJsxAttribute(node) &&
      checkedAttributes.has(node.name.text) &&
      node.initializer &&
      astApi.isJsxExpression(node.initializer) &&
      astApi.isTemplateExpression(node.initializer.expression)
    ) {
      const expression = node.initializer.expression;
      const staticText = [
        expression.head.text,
        ...expression.templateSpans.map((span) => span.literal.text),
      ].join('{}');
      report(node, `${node.name.text} template`, staticText.trim());
    }
    visitChildren(node, visit);
  }

  visit(sourceFile);
}

const semanticProperties = new Set([
  'label',
  'title',
  'description',
  'placeholder',
  'emptyLabel',
  'message',
  'caption',
  'ariaLabel',
]);
const semanticSkippedPathParts = [
  ...skippedPathParts,
  '/i18n/',
  '/assets/',
  '/storybook/',
  '/test/',
  '/data/mock-',
];
const allowedSemanticValues = new Set([
  'Navet dashboard config',
  'Power',
  'Voltage',
  'Current',
  'Energy',
]);

function isProductionSemanticFile(file) {
  const normalized = file.split(path.sep).join('/');
  return (
    (normalized.endsWith('.ts') || normalized.endsWith('.tsx')) &&
    !normalized.endsWith('.stories.tsx') &&
    !normalized.endsWith('.story-fixtures.tsx') &&
    !normalized.includes('.test.') &&
    !semanticSkippedPathParts.some((part) => normalized.includes(part))
  );
}

function isAllowedSemanticValue(value) {
  return (
    allowedSemanticValues.has(value) ||
    /^(?:placeholder-|(?:max-w|whitespace|text|leading|pr)-)/.test(value)
  );
}

for (const file of walk(productionRoot).filter(isProductionSemanticFile)) {
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = parseSourceFile(
    file,
    source,
    file.endsWith('.tsx') ? astApi.ScriptKind.TSX : astApi.ScriptKind.TS
  );

  function visit(node) {
    if (astApi.isPropertyAssignment(node)) {
      const propertyName =
        astApi.isIdentifier(node.name) || astApi.isStringLiteral(node.name) ? node.name.text : '';
      if (
        semanticProperties.has(propertyName) &&
        isStringLiteralLike(node.initializer) &&
        /[A-Za-z]{2}/.test(node.initializer.text) &&
        !isAllowedSemanticValue(node.initializer.text)
      ) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        failures.push(
          `${path.relative(root, file)}:${line + 1}: hardcoded semantic ${propertyName}: ${JSON.stringify(node.initializer.text)}`
        );
      }
    }
    visitChildren(node, visit);
  }

  visit(sourceFile);
}

nativeSnapshot?.dispose();
nativeCompilerApi?.close();

if (failures.length > 0) {
  console.error(`i18n check failed (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`i18n check passed for ${languages.length} locales and production JSX.`);
