import fs from 'node:fs';
import process from 'node:process';
import { relative, resolve } from 'node:path';
import { homeAssistantPaths, repoRoot } from './repo-paths.mjs';

export const root = repoRoot;
export const packageJsonPath = resolve(root, 'package.json');
export const changelogPath = resolve(root, 'CHANGELOG.md');
export const manifestPath = homeAssistantPaths.platformNavetManifest;
export const addonConfigPath = homeAssistantPaths.addonConfig;
export const addonChangelogPath = homeAssistantPaths.addonChangelog;
export const addonDevConfigPath = resolve(homeAssistantPaths.addonNavetDev, 'config.yaml');
export const versioningDocPath = resolve(root, 'docs/VERSIONING.md');
export const appVersionPath = resolve(root, 'packages/app/src/constants/app-version.ts');
export const repositoryMetadataPath = homeAssistantPaths.rootRepositoryMetadata;

const versionPattern = /^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/;

export function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

export function writeText(filePath, value) {
  fs.writeFileSync(filePath, value, 'utf8');
}

export function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

export function readYaml(filePath) {
  const content = readText(filePath);
  const result = new Map();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result.set(key, value);
  }

  return Object.assign(Object.create(null), Object.fromEntries(result));
}

export function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function getPackageVersion() {
  const packageJson = readJson(packageJsonPath);
  const version = packageJson.version?.trim();

  if (!version) {
    throw new Error('package.json is missing a version.');
  }

  return version;
}

export function assertValidVersion(version, context = 'version') {
  if (!versionPattern.test(version)) {
    throw new Error(`Invalid ${context}: "${version}". Expected pre-1.0 semver or prerelease.`);
  }
}

export function readAddonVersion(filePath = addonConfigPath) {
  const match = readText(filePath).match(/^version:\s*"?(.*?)"?\s*$/m);
  if (!match?.[1]) {
    throw new Error(`Unable to read version from ${filePath}.`);
  }

  return match[1].trim();
}

export function updateAddonVersion(version, filePath = addonConfigPath) {
  const content = readText(filePath);
  const versionLinePattern = /^version:\s*"?.*?"?\s*$/m;

  if (!versionLinePattern.test(content)) {
    throw new Error(`Unable to update version in ${filePath}.`);
  }

  const nextContent = content.replace(versionLinePattern, `version: "${version}"`);

  if (nextContent === content) {
    return;
  }

  writeText(filePath, nextContent);
}

export function formatUtcTimestamp(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');

  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

export function buildDevAddonVersion(packageVersion, date = new Date()) {
  return `${packageVersion}-dev.${formatUtcTimestamp(date)}`;
}

export function isValidDevAddonVersion(version, packageVersion) {
  const basePattern = packageVersion
    ? packageVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    : '\\d+\\.\\d+\\.\\d+';
  const pattern = new RegExp(`^${basePattern}-dev\\.\\d{14}$`);
  return pattern.test(version);
}

export function hasChangelogVersion(version, filePath = changelogPath) {
  const changelog = readText(filePath).replace(/\r\n/g, '\n');
  const headingPattern = /^##\s+(\d+\.\d+\.\d+(?:[-+][^\s]+)?)(?:\s+.*)?$/gm;
  return [...changelog.matchAll(headingPattern)].some((heading) => heading[1]?.trim() === version);
}

export function readVersioningCurrentVersion() {
  const match = readText(versioningDocPath).match(/^- current version:\s*`([^`]+)`\s*$/m);
  if (!match?.[1]) {
    throw new Error('Unable to read current version from docs/VERSIONING.md.');
  }

  return match[1].trim();
}

export function updateVersioningCurrentVersion(version) {
  const content = readText(versioningDocPath);
  const currentVersionPattern = /^- current version:\s*`[^`]+`\s*$/m;

  if (!currentVersionPattern.test(content)) {
    throw new Error('Unable to update current version in docs/VERSIONING.md.');
  }

  const nextContent = content.replace(currentVersionPattern, `- current version: \`${version}\``);

  if (nextContent === content) {
    return;
  }

  writeText(versioningDocPath, nextContent);
}

export function normalizeTagVersion(tag) {
  return tag.startsWith('v') ? tag.slice(1) : tag;
}

export function fail(message) {
  console.error(message);
  process.exit(1);
}

function findFilesNamed(directory, filename) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return findFilesNamed(entryPath, filename);
    }

    return entry.isFile() && entry.name === filename ? [entryPath] : [];
  });
}

export function assertMainRepositoryMetadata() {
  if (!fs.existsSync(repositoryMetadataPath)) {
    throw new Error(`Required root repository.yaml is missing: ${repositoryMetadataPath}.`);
  }

  const metadata = readYaml(repositoryMetadataPath);
  if (metadata?.url !== 'https://github.com/navet-app/navet') {
    throw new Error(
      `repository.yaml url must point to https://github.com/navet-app/navet, received ${metadata?.url ?? 'undefined'}.`
    );
  }
}

export function assertHacsExport(exportRoot, { expectedVersion = getPackageVersion() } = {}) {
  const manifestFile = resolve(exportRoot, 'custom_components/navet/manifest.json');
  if (!fs.existsSync(manifestFile)) {
    throw new Error(`HACS export is missing manifest.json: ${manifestFile}`);
  }

  const manifest = readJson(manifestFile);
  if (manifest.domain !== 'navet') {
    throw new Error(`HACS export manifest domain must be "navet", received "${manifest.domain}".`);
  }

  if (manifest.version !== expectedVersion) {
    throw new Error(
      `HACS export manifest version ${manifest.version} does not match expected version ${expectedVersion}.`
    );
  }

  if (manifest.config_flow !== true) {
    throw new Error('HACS export manifest must set config_flow to true.');
  }

  const hacsFile = resolve(exportRoot, 'hacs.json');
  if (!fs.existsSync(hacsFile)) {
    throw new Error(`HACS export is missing hacs.json: ${hacsFile}`);
  }

  const licenseFile = resolve(exportRoot, 'LICENSE');
  if (!fs.existsSync(licenseFile)) {
    throw new Error(`HACS export is missing its license: ${licenseFile}`);
  }

  const validationWorkflow = resolve(exportRoot, '.github/workflows/validate.yml');
  if (!fs.existsSync(validationWorkflow)) {
    throw new Error(`HACS export is missing its validation workflow: ${validationWorkflow}`);
  }

  const requiredPanelFiles = [
    'custom_components/navet/frontend/navet-panel.js',
    'custom_components/navet/frontend/navet-ha-shell.js',
    'custom_components/navet/frontend/logo.svg',
  ];
  for (const entry of requiredPanelFiles) {
    if (!fs.existsSync(resolve(exportRoot, entry))) {
      throw new Error(`HACS export is missing generated panel asset: ${resolve(exportRoot, entry)}`);
    }
  }

  const manifestFiles = findFilesNamed(exportRoot, 'manifest.json').map((entry) =>
    relative(exportRoot, entry)
  );
  if (manifestFiles.length !== 1 || manifestFiles[0] !== 'custom_components/navet/manifest.json') {
    throw new Error(
      `HACS export must contain only the integration manifest.json, received: ${manifestFiles.join(', ')}`
    );
  }

  const forbiddenPaths = ['repository.yaml', 'platform'];
  for (const entry of forbiddenPaths) {
    if (fs.existsSync(resolve(exportRoot, entry))) {
      throw new Error(`HACS export must not contain ${entry}: ${resolve(exportRoot, entry)}`);
    }
  }
}
