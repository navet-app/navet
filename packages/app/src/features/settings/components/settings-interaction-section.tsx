import { InteractionPreviewCard } from '@navet/app/components/patterns/interaction-preview-card';
import { Button } from '@navet/app/components/primitives/button';
import { InteractivePill } from '@navet/app/components/primitives/interactive-pill';
import { useI18n } from '@navet/app/hooks';
import {
  activateKeepDeviceAwakeFallback,
  useKeepDeviceAwakeSnapshot,
} from '@navet/app/hooks/use-keep-device-awake';
import { isHomeAssistantPanelMode } from '@navet/app/runtime/app-mode';
import { HEADER_CUSTOM_TEXT_MAX_LENGTH } from '@navet/app/stores/settings-store';
import { LayoutGrid, Monitor } from 'lucide-react';
import {
  DASHBOARD_PROFILE_MODE_OPTIONS,
  DASHBOARD_PROFILE_MODE_SCOPE_KEYS,
  getDashboardProfileModeOption,
} from '../dashboard-profile-modes';
import type {
  SettingsInteractionOption,
  SettingsSectionController,
} from '../hooks/use-settings-section-controller';
import { SettingsDeviceSettings } from './settings-device-settings';
import { OnOffPillToggle } from './settings-pill-toggle';
import { SettingsItem, SettingsSectionGroup, SettingsSectionShell } from './settings-section-shell';

interface SettingsInteractionSectionProps {
  controller: SettingsSectionController;
}

export function SettingsInteractionSection({ controller }: SettingsInteractionSectionProps) {
  const { t } = useI18n();
  const keepAwakeSnapshot = useKeepDeviceAwakeSnapshot();
  const {
    entityInteractionMode,
    preventBrowserZoom,
    styles,
    theme,
    updateSettings,
    headerCustomText,
    headerTitleMode,
    keepDeviceAwake,
    companionEnabled,
    kioskMode,
    kioskSwipeRooms,
    dashboardProfileMode,
  } = controller;
  const interactionOptions: SettingsInteractionOption[] = [
    { value: 'toggle-first', label: t('settings.dashboard.interaction.toggleFirst') },
    { value: 'control-first', label: t('settings.dashboard.interaction.controlFirst') },
  ];

  return (
    <SettingsSectionShell
      id="interaction"
      icon={Monitor}
      title={t('settings.interaction.sectionTitle')}
      description={t('settings.interaction.sectionDescription')}
      styles={styles}
      grouped
    >
      <SettingsSectionGroup
        id="interaction-display-setup"
        title={t('settings.interaction.group.displaySetup')}
        styles={styles}
      >
        <SettingsItem
          title={t('settings.dashboard.profileMode.title')}
          description={t('settings.dashboard.profileMode.description')}
          styles={styles}
        >
          <div className="space-y-3">
            <fieldset className="w-fit">
              <legend className="sr-only">{t('settings.dashboard.profileMode.title')}</legend>
              <div className="flex flex-wrap gap-2">
                {DASHBOARD_PROFILE_MODE_OPTIONS.map((option) => {
                  const isActive = dashboardProfileMode === option.id;
                  const Icon = option.id === 'wall_display' ? Monitor : LayoutGrid;

                  return (
                    <InteractivePill
                      key={option.id}
                      active={isActive}
                      size="small"
                      icon={Icon}
                      onClick={() => {
                        if (isActive) {
                          return;
                        }

                        controller.updateScopedSettings(
                          option.settings,
                          DASHBOARD_PROFILE_MODE_SCOPE_KEYS
                        );
                      }}
                      aria-pressed={isActive}
                    >
                      {t(option.labelKey)}
                    </InteractivePill>
                  );
                })}
              </div>
            </fieldset>
            <p className={`max-w-2xl text-sm leading-relaxed ${styles.subtleColor}`}>
              {t(
                getDashboardProfileModeOption(dashboardProfileMode)?.descriptionKey ??
                  'settings.dashboard.profileMode.custom.description'
              )}
            </p>
          </div>
        </SettingsItem>
      </SettingsSectionGroup>

      <SettingsSectionGroup
        id="interaction-layout"
        title={t('settings.interaction.group.layout')}
        styles={styles}
      >
        <SettingsItem
          title={t('settings.dashboard.headerTitle.title')}
          description={t('settings.dashboard.headerTitle.description')}
          styles={styles}
        >
          <div className="space-y-3">
            <fieldset className="w-fit">
              <legend className="sr-only">{t('settings.dashboard.headerTitle.title')}</legend>
              <div className="flex flex-wrap gap-2">
                {[
                  {
                    value: 'auto_greeting' as const,
                    label: t('settings.dashboard.headerTitle.autoGreeting'),
                  },
                  {
                    value: 'custom_text' as const,
                    label: t('settings.dashboard.headerTitle.customText'),
                  },
                  { value: 'clock' as const, label: t('settings.dashboard.headerTitle.dateTime') },
                ].map((option) => {
                  const isActive = headerTitleMode === option.value;
                  return (
                    <InteractivePill
                      key={option.value}
                      active={isActive}
                      size="small"
                      onClick={() => {
                        if (isActive) {
                          return;
                        }

                        controller.updateScopedSettings({ headerTitleMode: option.value }, [
                          'headerTitleMode',
                          'headerCustomText',
                        ]);
                      }}
                      aria-pressed={isActive}
                    >
                      {option.label}
                    </InteractivePill>
                  );
                })}
              </div>
            </fieldset>

            {headerTitleMode === 'custom_text' ? (
              <div className="max-w-xl space-y-2">
                <input
                  type="text"
                  maxLength={HEADER_CUSTOM_TEXT_MAX_LENGTH}
                  value={headerCustomText}
                  onChange={(event) =>
                    controller.updateSettings({ headerCustomText: event.currentTarget.value })
                  }
                  placeholder={t('settings.dashboard.headerTitle.customPlaceholder')}
                  aria-label={t('settings.dashboard.headerTitle.customText')}
                  className={`h-11 w-full rounded-[16px] border px-4 text-sm font-normal outline-none transition-colors ${styles.borderColor} ${styles.softBg} ${styles.textColor}`}
                />
                <p className={`text-sm leading-relaxed ${styles.subtleColor}`}>
                  {t('settings.dashboard.headerTitle.customHint')}
                </p>
              </div>
            ) : null}
          </div>
        </SettingsItem>

        <SettingsItem
          title={t('settings.dashboard.companion.title')}
          description={t('settings.dashboard.companion.description')}
          styles={styles}
        >
          <OnOffPillToggle
            value={companionEnabled}
            onChange={(checked) =>
              controller.updateScopedSettings({ companionEnabled: checked }, ['companionEnabled'])
            }
            ariaLabel={t('settings.dashboard.companion.title')}
          />
        </SettingsItem>
      </SettingsSectionGroup>

      <SettingsSectionGroup
        id="interaction-screen-behavior"
        title={t('settings.interaction.group.screenBehavior')}
        styles={styles}
      >
        <SettingsItem
          title={t('settings.dashboard.kioskMode.title')}
          description={t('settings.dashboard.kioskMode.description')}
          styles={styles}
        >
          <div className="flex flex-col gap-2">
            <OnOffPillToggle
              value={kioskMode}
              onChange={(checked) =>
                controller.updateScopedSettings({ kioskMode: checked }, ['kioskMode'])
              }
              ariaLabel={t('settings.dashboard.kioskMode.title')}
            />
          </div>
        </SettingsItem>

        {kioskMode ? (
          <SettingsItem
            title={t('dashboard.kiosk.swipeRooms.title')}
            description={t('dashboard.kiosk.swipeRooms.description')}
            styles={styles}
          >
            <OnOffPillToggle
              value={kioskSwipeRooms}
              onChange={(checked) =>
                controller.updateScopedSettings({ kioskSwipeRooms: checked }, ['kioskSwipeRooms'])
              }
              ariaLabel={t('dashboard.kiosk.swipeRooms.title')}
            />
          </SettingsItem>
        ) : null}

        <SettingsItem
          title={t('settings.dashboard.keepAwake.title')}
          description={t('settings.dashboard.keepAwake.description')}
          styles={styles}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <OnOffPillToggle
                value={keepDeviceAwake}
                onChange={(checked) =>
                  controller.updateScopedSettings({ keepDeviceAwake: checked }, ['keepDeviceAwake'])
                }
                ariaLabel={t('settings.dashboard.keepAwake.title')}
              />
              {keepDeviceAwake ? (
                <p className={`max-w-2xl text-sm leading-relaxed ${styles.subtleColor}`}>
                  {t('settings.dashboard.keepAwake.bestEffort')}
                </p>
              ) : null}
            </div>

            {keepDeviceAwake && keepAwakeSnapshot.mode === 'pending-activation' ? (
              <div className="flex flex-col gap-2">
                <p className={`max-w-2xl text-sm font-medium leading-relaxed ${styles.textColor}`}>
                  {t('settings.dashboard.keepAwake.status.pending-activation')}
                </p>
                {keepAwakeSnapshot.canActivateFallback ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Button
                      variant="secondary"
                      size="small"
                      className="rounded-full"
                      onClick={() => {
                        void activateKeepDeviceAwakeFallback();
                      }}
                    >
                      {t('settings.dashboard.keepAwake.activateFallback')}
                    </Button>
                    <p className={`text-sm leading-relaxed ${styles.subtleColor}`}>
                      {t('settings.dashboard.keepAwake.activationHint')}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </SettingsItem>
      </SettingsSectionGroup>

      <SettingsSectionGroup
        id="interaction-input"
        title={t('settings.interaction.group.input')}
        styles={styles}
      >
        <SettingsItem
          title={t('settings.interaction.cardBehavior.title')}
          description={t('settings.interaction.cardBehavior.description')}
          styles={styles}
        >
          <div className="grid items-start gap-4 md:gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="flex w-fit flex-wrap gap-2">
              {interactionOptions.map((option) => {
                const isActive = entityInteractionMode === option.value;
                return (
                  <InteractivePill
                    key={option.value}
                    active={isActive}
                    size="small"
                    onClick={() => updateSettings({ entityInteractionMode: option.value })}
                    aria-pressed={isActive}
                  >
                    {option.label}
                  </InteractivePill>
                );
              })}
            </div>

            <div className="hidden md:block">
              <InteractionPreviewCard
                mode={entityInteractionMode}
                accentColor={styles.accentColor}
                theme={theme}
              />
            </div>
          </div>
        </SettingsItem>

        {!isHomeAssistantPanelMode() ? (
          <SettingsItem
            title={t('settings.interaction.browserZoom.title')}
            description={t('settings.interaction.browserZoom.description')}
            styles={styles}
          >
            <div className="space-y-2">
              <fieldset>
                <legend className="sr-only">{t('settings.interaction.browserZoom.title')}</legend>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: false, label: t('settings.interaction.browserZoom.allow') },
                    { value: true, label: t('settings.interaction.browserZoom.limit') },
                  ].map((option) => (
                    <InteractivePill
                      key={String(option.value)}
                      active={preventBrowserZoom === option.value}
                      size="small"
                      aria-pressed={preventBrowserZoom === option.value}
                      onClick={() => updateSettings({ preventBrowserZoom: option.value })}
                    >
                      {option.label}
                    </InteractivePill>
                  ))}
                </div>
              </fieldset>
              <p className={`text-sm leading-5 ${styles.subtleColor}`}>
                {t('settings.interaction.browserZoom.warning')}
              </p>
            </div>
          </SettingsItem>
        ) : null}
      </SettingsSectionGroup>

      <SettingsSectionGroup
        id="interaction-sharing"
        title={t('settings.interaction.group.sharing')}
        styles={styles}
      >
        <SettingsItem
          title={t('settings.system.clients.displaySync.title')}
          description={t('settings.system.clients.displaySync.description')}
          styles={styles}
        >
          <SettingsDeviceSettings styles={styles} />
        </SettingsItem>
      </SettingsSectionGroup>
    </SettingsSectionShell>
  );
}
