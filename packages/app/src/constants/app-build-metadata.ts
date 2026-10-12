import { APP_VERSION } from '@navet/app/constants/app-version';
import { DASHBOARD_CONFIG_VERSION } from '@navet/app/constants/dashboard-config-version';

declare const __APP_GIT_SHA__: string;
declare const __APP_BUILD_DATE__: string;
declare const __APP_RELEASE_CHANNEL__: string;
declare const __APP_BUILD_VERSION__: string;

const appGitSha = typeof __APP_GIT_SHA__ === 'string' ? __APP_GIT_SHA__ : 'local';
const appBuildDate =
  typeof __APP_BUILD_DATE__ === 'string' ? __APP_BUILD_DATE__ : new Date(0).toISOString();
const appReleaseChannel =
  typeof __APP_RELEASE_CHANNEL__ === 'string' ? __APP_RELEASE_CHANNEL__ : 'development';
const appBuildVersion =
  typeof __APP_BUILD_VERSION__ === 'string' ? __APP_BUILD_VERSION__ : APP_VERSION;

export const APP_BUILD_METADATA = Object.freeze({
  gitSha: appGitSha,
  gitShaShort: appGitSha.slice(0, 7),
  buildDate: appBuildDate,
  releaseChannel: appReleaseChannel,
  buildVersion: appBuildVersion,
  dashboardConfigVersion: DASHBOARD_CONFIG_VERSION,
});

export function isAppPreV1(version = APP_VERSION) {
  const match = version.trim().match(/^(\d+)\./);
  return match ? Number(match[1]) < 1 : false;
}

export function getAppReleaseBadgeLabel(version = APP_VERSION) {
  switch (APP_BUILD_METADATA.releaseChannel) {
    case 'edge':
      return 'Edge';
    case 'beta':
      return 'Beta';
    default:
      if (version.includes('-beta') || version.includes('-rc') || isAppPreV1(version)) {
        return 'Beta';
      }

      return null;
  }
}

export function getAppBuildChannelLabel(version = APP_VERSION) {
  switch (APP_BUILD_METADATA.releaseChannel) {
    case 'edge':
      return 'Edge';
    case 'development':
    case 'dev':
      return 'Dev';
    case 'beta':
      return 'Beta';
    case 'stable':
      return 'Stable';
    default:
      if (version.includes('-beta') || version.includes('-rc') || isAppPreV1(version)) {
        return 'Beta';
      }

      return 'Stable';
  }
}

export function isLocalDevelopmentBuild(
  channel = APP_BUILD_METADATA.releaseChannel,
  hostname = typeof window === 'undefined' ? '' : window.location.hostname
) {
  const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  return isLoopback && ['development', 'local'].includes(channel);
}
