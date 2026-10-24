import type { TranslateFn, TranslationKey } from '@navet/app/i18n';
import type { SettingsSearchItem } from './settings-navigation-shell';

type SearchSectionId =
  | 'appearance'
  | 'localization'
  | 'interaction'
  | 'dashboard'
  | 'system'
  | 'project';

interface SearchSectionDefinition {
  descriptionKey: TranslationKey;
  id: SearchSectionId;
  labelKey: TranslationKey;
}

interface SearchSettingDefinition {
  descriptionKey: TranslationKey;
  id: string;
  labelKey: TranslationKey;
  sectionId: SearchSectionId;
  targetLabelKey?: TranslationKey;
  available?: keyof SettingsSearchAvailability;
}

export interface SettingsSearchAvailability {
  authorizedDevices: boolean;
  browserZoom: boolean;
  kioskSwipeRooms: boolean;
}

const SECTIONS: SearchSectionDefinition[] = [
  {
    id: 'appearance',
    labelKey: 'settings.appearance.sectionTitle',
    descriptionKey: 'settings.appearance.sectionDescription',
  },
  {
    id: 'localization',
    labelKey: 'settings.localization.sectionTitle',
    descriptionKey: 'settings.localization.sectionDescription',
  },
  {
    id: 'interaction',
    labelKey: 'settings.interaction.sectionTitle',
    descriptionKey: 'settings.interaction.sectionDescription',
  },
  {
    id: 'dashboard',
    labelKey: 'settings.dashboard.sectionTitle',
    descriptionKey: 'settings.dashboard.sectionDescription',
  },
  {
    id: 'system',
    labelKey: 'settings.system.sectionTitle',
    descriptionKey: 'settings.system.sectionDescription',
  },
  {
    id: 'project',
    labelKey: 'settings.project.sectionTitle',
    descriptionKey: 'settings.project.sectionDescription',
  },
];

const SETTINGS: SearchSettingDefinition[] = [
  {
    id: 'appearance-theme-accent',
    sectionId: 'appearance',
    labelKey: 'settings.appearance.themeAccent.title',
    descriptionKey: 'settings.appearance.themeAccent.description',
  },
  {
    id: 'appearance-space-usage',
    sectionId: 'appearance',
    labelKey: 'settings.dashboard.spaceMode.title',
    descriptionKey: 'settings.dashboard.spaceMode.description',
  },
  {
    id: 'appearance-visual-quality',
    sectionId: 'appearance',
    labelKey: 'settings.system.effectsQuality.title',
    descriptionKey: 'settings.system.effectsQuality.description',
  },
  {
    id: 'appearance-ambience',
    sectionId: 'appearance',
    labelKey: 'settings.appearance.ambience.title',
    descriptionKey: 'settings.appearance.ambience.description',
  },
  {
    id: 'appearance-wallpaper',
    sectionId: 'appearance',
    labelKey: 'settings.appearance.wallpaper.title',
    descriptionKey: 'settings.appearance.wallpaper.description',
  },
  {
    id: 'localization-language',
    sectionId: 'localization',
    labelKey: 'settings.localization.language.title',
    descriptionKey: 'settings.localization.language.description',
  },
  {
    id: 'localization-time-format',
    sectionId: 'localization',
    labelKey: 'settings.localization.timeFormat.title',
    descriptionKey: 'settings.localization.timeFormat.description',
  },
  {
    id: 'localization-temperature-unit',
    sectionId: 'localization',
    labelKey: 'settings.localization.temperatureUnit.title',
    descriptionKey: 'settings.localization.temperatureUnit.description',
  },
  {
    id: 'interaction-card-behavior',
    sectionId: 'interaction',
    labelKey: 'settings.interaction.cardBehavior.title',
    descriptionKey: 'settings.interaction.cardBehavior.description',
  },
  {
    id: 'interaction-browser-zoom',
    available: 'browserZoom',
    sectionId: 'interaction',
    labelKey: 'settings.interaction.browserZoom.title',
    descriptionKey: 'settings.interaction.browserZoom.description',
  },
  {
    id: 'dashboard-multiple-dashboards',
    sectionId: 'dashboard',
    labelKey: 'dashboard.multiple.manager.title',
    descriptionKey: 'dashboard.multiple.manager.description',
  },
  {
    id: 'interaction-companion',
    sectionId: 'interaction',
    labelKey: 'settings.dashboard.companion.title',
    descriptionKey: 'settings.dashboard.companion.description',
  },
  {
    id: 'interaction-profile-mode',
    sectionId: 'interaction',
    labelKey: 'settings.dashboard.profileMode.title',
    descriptionKey: 'settings.dashboard.profileMode.description',
  },
  {
    id: 'interaction-header-title',
    sectionId: 'interaction',
    labelKey: 'settings.dashboard.headerTitle.title',
    descriptionKey: 'settings.dashboard.headerTitle.description',
  },
  {
    id: 'dashboard-home-summary',
    sectionId: 'dashboard',
    labelKey: 'settings.dashboard.homeSummaryBar.title',
    descriptionKey: 'settings.dashboard.homeSummaryBar.description',
  },
  {
    id: 'dashboard-chores',
    sectionId: 'dashboard',
    labelKey: 'settings.dashboard.chores.title',
    descriptionKey: 'settings.dashboard.chores.description',
  },
  {
    id: 'appearance-screensaver',
    sectionId: 'appearance',
    labelKey: 'screensaver.title',
    targetLabelKey: 'settings.appearance.wallpaper.title',
    descriptionKey: 'settings.dashboard.screensaver.description',
  },
  {
    id: 'interaction-kiosk-mode',
    sectionId: 'interaction',
    labelKey: 'settings.dashboard.kioskMode.title',
    descriptionKey: 'settings.dashboard.kioskMode.description',
  },
  {
    id: 'interaction-kiosk-swipe-rooms',
    available: 'kioskSwipeRooms',
    sectionId: 'interaction',
    labelKey: 'dashboard.kiosk.swipeRooms.title',
    descriptionKey: 'dashboard.kiosk.swipeRooms.description',
  },
  {
    id: 'interaction-keep-awake',
    sectionId: 'interaction',
    labelKey: 'settings.dashboard.keepAwake.title',
    descriptionKey: 'settings.dashboard.keepAwake.description',
  },
  {
    id: 'dashboard-entity-visibility',
    sectionId: 'dashboard',
    labelKey: 'settings.dashboard.entityVisibility.title',
    descriptionKey: 'settings.dashboard.entityVisibility.description',
  },
  {
    id: 'system-backup',
    sectionId: 'system',
    labelKey: 'settings.dashboard.backup.title',
    descriptionKey: 'settings.dashboard.backup.description',
  },
  {
    id: 'dashboard-onboarding',
    sectionId: 'dashboard',
    labelKey: 'settings.dashboard.entityVisibility.restartOnboarding',
    descriptionKey: 'settings.dashboard.onboarding.description',
  },
  {
    id: 'interaction-device-settings',
    sectionId: 'interaction',
    labelKey: 'settings.system.clients.displaySync.title',
    descriptionKey: 'settings.system.clients.displaySync.description',
  },
  {
    id: 'interaction-copy-settings',
    sectionId: 'interaction',
    labelKey: 'settings.system.clients.displaySync.copy',
    descriptionKey: 'settings.system.clients.displaySync.copyDescription',
    targetLabelKey: 'settings.system.clients.displaySync.title',
  },
  {
    id: 'interaction-sync-settings',
    sectionId: 'interaction',
    labelKey: 'settings.system.clients.displaySync.create',
    descriptionKey: 'settings.system.clients.displaySync.createDescription',
    targetLabelKey: 'settings.system.clients.displaySync.title',
  },
  {
    id: 'system-authorized-devices',
    sectionId: 'system',
    available: 'authorizedDevices',
    labelKey: 'settings.system.authorizedDevices.title',
    descriptionKey: 'settings.system.authorizedDevices.description',
  },
  {
    id: 'system-providers',
    sectionId: 'system',
    labelKey: 'settings.system.providers.title',
    descriptionKey: 'settings.system.providers.description',
  },
  {
    id: 'system-local-data',
    sectionId: 'system',
    labelKey: 'settings.project.localData.title',
    descriptionKey: 'settings.project.localData.description',
  },
  {
    id: 'system-logout',
    sectionId: 'system',
    labelKey: 'settings.project.logout',
    descriptionKey: 'settings.system.logout.description',
  },
  {
    id: 'project-about',
    sectionId: 'project',
    labelKey: 'settings.project.about.title',
    descriptionKey: 'settings.project.about.description',
  },
  {
    id: 'project-credits',
    sectionId: 'project',
    labelKey: 'settings.project.credits.title',
    descriptionKey: 'settings.project.credits.description',
  },
  {
    id: 'project-community',
    sectionId: 'project',
    labelKey: 'settings.project.community.title',
    descriptionKey: 'settings.project.community.description',
  },
  {
    id: 'project-license',
    sectionId: 'project',
    labelKey: 'settings.project.license.title',
    descriptionKey: 'settings.project.license.description',
  },
  {
    id: 'project-terms',
    sectionId: 'project',
    labelKey: 'settings.project.terms.title',
    descriptionKey: 'settings.project.terms.description',
  },
];

export function createSettingsSearchItems(
  t: TranslateFn,
  availability: SettingsSearchAvailability
): SettingsSearchItem[] {
  const sectionById = new Map(SECTIONS.map((section) => [section.id, section]));
  const sectionItems = SECTIONS.map((section) => ({
    id: `section-${section.id}`,
    sectionId: section.id,
    sectionLabel: t(section.labelKey),
    label: t(section.labelKey),
    description: t(section.descriptionKey),
  }));
  const settingItems = SETTINGS.filter(
    (setting) =>
      sectionById.has(setting.sectionId) && (!setting.available || availability[setting.available])
  ).map((setting) => {
    const section = sectionById.get(setting.sectionId);
    const label = t(setting.labelKey);
    return {
      id: setting.id,
      sectionId: setting.sectionId,
      sectionLabel: section ? t(section.labelKey) : '',
      label,
      description: t(setting.descriptionKey),
      targetLabel: setting.targetLabelKey ? t(setting.targetLabelKey) : label,
    };
  });

  return [...sectionItems, ...settingItems];
}
