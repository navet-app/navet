import { Button } from '@navet/app/components/primitives';
import { InteractivePill } from '@navet/app/components/primitives/interactive-pill';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@navet/app/components/ui/alert-dialog';
import { DashboardManager } from '@navet/app/features/dashboard/dashboards/dashboard-manager';
import { useI18n } from '@navet/app/hooks';
import {
  activateKeepDeviceAwakeFallback,
  useKeepDeviceAwakeSnapshot,
} from '@navet/app/hooks/use-keep-device-awake';
import { HEADER_CUSTOM_TEXT_MAX_LENGTH } from '@navet/app/stores/settings-store';
import { Download, LayoutGrid, Monitor, Scale, Upload } from 'lucide-react';
import { lazy, Suspense } from 'react';
import {
  DASHBOARD_PROFILE_MODE_OPTIONS,
  DASHBOARD_PROFILE_MODE_SCOPE_KEYS,
  getDashboardProfileModeOption,
} from '../dashboard-profile-modes';
import type { SettingsSectionController } from '../hooks/use-settings-section-controller';
import { OnOffPillToggle } from './settings-pill-toggle';
import { SettingsItem, SettingsSectionGroup, SettingsSectionShell } from './settings-section-shell';

const RestoreEntitiesDialog = lazy(() => import('./restore-entities-dialog'));

interface SettingsDashboardSectionProps {
  controller: SettingsSectionController;
}

export function SettingsDashboardSection({ controller }: SettingsDashboardSectionProps) {
  const { t } = useI18n();
  const keepAwakeSnapshot = useKeepDeviceAwakeSnapshot();
  const {
    headerCustomText,
    headerTitleMode,
    handleExportDashboardConfig,
    handleImportDashboardConfig,
    handleRestartOnboarding,
    hiddenEntityIds,
    importInputRef,
    keepDeviceAwake,
    kioskMode,
    kioskSwipeRooms,
    dashboardProfileMode,
    setShowRestartOnboardingConfirm,
    setShowRestoreEntities,
    showHomeSummaryBar,
    choresEnabled,
    showRestartOnboardingConfirm,
    showRestoreEntities,
    styles,
  } = controller;

  return (
    <SettingsSectionShell
      id="dashboard"
      icon={LayoutGrid}
      title={t('settings.dashboard.sectionTitle')}
      description={t('settings.dashboard.sectionDescription')}
      styles={styles}
      grouped
    >
      <SettingsSectionGroup
        id="dashboard-setup"
        title={t('settings.dashboard.group.setup')}
        styles={styles}
      >
        <SettingsItem
          title={t('dashboard.multiple.manager.title')}
          description={t('dashboard.multiple.manager.description')}
          styles={styles}
        >
          <DashboardManager styles={styles} />
        </SettingsItem>

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
        id="dashboard-home-content"
        title={t('settings.dashboard.group.homeContent')}
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
          title={t('settings.dashboard.homeSummaryBar.title')}
          description={t('settings.dashboard.homeSummaryBar.description')}
          styles={styles}
        >
          <OnOffPillToggle
            value={showHomeSummaryBar}
            onChange={(checked) =>
              controller.updateScopedSettings({ showHomeSummaryBar: checked }, [
                'showHomeSummaryBar',
              ])
            }
            ariaLabel={t('settings.dashboard.homeSummaryBar.title')}
          />
        </SettingsItem>

        <SettingsItem
          title={t('settings.dashboard.chores.title')}
          description={t('settings.dashboard.chores.description')}
          styles={styles}
        >
          <OnOffPillToggle
            value={choresEnabled}
            onChange={(checked) =>
              controller.updateScopedSettings({ choresEnabled: checked }, ['choresEnabled'])
            }
            ariaLabel={t('settings.dashboard.chores.title')}
          />
        </SettingsItem>
      </SettingsSectionGroup>

      <SettingsSectionGroup
        id="dashboard-wall-display"
        title={t('settings.dashboard.group.wallDisplay')}
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
            <p className={`max-w-2xl text-sm leading-relaxed ${styles.subtleColor}`}>
              {t('settings.dashboard.kioskMode.recoveryHint')}
            </p>
          </div>
        </SettingsItem>

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
              <p className={`max-w-2xl text-sm leading-relaxed ${styles.subtleColor}`}>
                {t('settings.dashboard.keepAwake.caveat')}
              </p>
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
        id="dashboard-maintenance"
        title={t('settings.dashboard.group.maintenance')}
        styles={styles}
      >
        <SettingsItem
          title={t('settings.dashboard.entityVisibility.title')}
          description={t('settings.dashboard.entityVisibility.description')}
          styles={styles}
        >
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="small"
              leading={<LayoutGrid className="h-4 w-4" />}
              onClick={() => setShowRestoreEntities(true)}
              disabled={hiddenEntityIds.length === 0}
              className="rounded-full"
            >
              {t('settings.dashboard.entityVisibility.restore')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="small"
              leading={<Scale className="h-4 w-4" />}
              onClick={() => setShowRestartOnboardingConfirm(true)}
              className="rounded-full"
            >
              {t('settings.dashboard.entityVisibility.restartOnboarding')}
            </Button>
          </div>
          <p className={`mt-3 text-sm leading-relaxed ${styles.subtleColor}`}>
            {t('settings.dashboard.entityVisibility.hiddenSummary', {
              count: hiddenEntityIds.length,
            })}
          </p>

          {showRestoreEntities ? (
            <Suspense fallback={null}>
              <RestoreEntitiesDialog onClose={() => setShowRestoreEntities(false)} />
            </Suspense>
          ) : null}

          <AlertDialog
            open={showRestartOnboardingConfirm}
            onOpenChange={setShowRestartOnboardingConfirm}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('settings.dashboard.confirmRestart.title')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('settings.dashboard.confirmRestart.description')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={handleRestartOnboarding}>
                  {t('common.restart')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </SettingsItem>

        <SettingsItem
          title={t('settings.dashboard.backup.title')}
          description={t('settings.dashboard.backup.description')}
          styles={styles}
        >
          <p className={`max-w-2xl text-sm leading-relaxed ${styles.subtleColor}`}>
            {t('settings.dashboard.backup.body')}
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row md:mt-5">
            <button
              type="button"
              onClick={handleExportDashboardConfig}
              className={`inline-flex h-9 items-center justify-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors ${styles.borderColor} ${styles.softBg} ${styles.hoverBg} ${styles.textColor}`}
            >
              <Upload className="h-4 w-4" />
              <span>{t('settings.dashboard.backup.export')}</span>
            </button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className={`inline-flex h-9 items-center justify-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors ${styles.borderColor} ${styles.softBg} ${styles.hoverBg} ${styles.textColor}`}
            >
              <Download className="h-4 w-4" />
              <span>{t('settings.dashboard.backup.import')}</span>
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".yaml,.yml,application/yaml,text/yaml"
              className="hidden"
              onChange={handleImportDashboardConfig}
            />
          </div>
        </SettingsItem>
      </SettingsSectionGroup>
    </SettingsSectionShell>
  );
}
