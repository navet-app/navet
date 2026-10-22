import { Button } from '@navet/app/components/primitives';
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
import { LayoutGrid, Scale } from 'lucide-react';
import { lazy, Suspense } from 'react';
import type { SettingsSectionController } from '../hooks/use-settings-section-controller';
import { OnOffPillToggle } from './settings-pill-toggle';
import { SettingsItem, SettingsSectionGroup, SettingsSectionShell } from './settings-section-shell';

const RestoreEntitiesDialog = lazy(() => import('./restore-entities-dialog'));

interface SettingsDashboardSectionProps {
  controller: SettingsSectionController;
}

export function SettingsDashboardSection({ controller }: SettingsDashboardSectionProps) {
  const { t } = useI18n();
  const {
    handleRestartOnboarding,
    hiddenEntityIds,
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
        id="dashboard-manage"
        title={t('settings.dashboard.group.manage')}
        styles={styles}
      >
        <SettingsItem
          title={t('dashboard.multiple.manager.title')}
          description={t('dashboard.multiple.manager.description')}
          styles={styles}
        >
          <DashboardManager styles={styles} />
        </SettingsItem>
      </SettingsSectionGroup>

      <SettingsSectionGroup
        id="dashboard-content"
        title={t('settings.dashboard.group.homeContent')}
        styles={styles}
      >
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
        id="dashboard-visibility"
        title={t('settings.dashboard.group.visibility')}
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
        </SettingsItem>
      </SettingsSectionGroup>

      <SettingsSectionGroup
        id="dashboard-setup"
        title={t('settings.dashboard.group.setup')}
        styles={styles}
      >
        <SettingsItem
          title={t('settings.dashboard.entityVisibility.restartOnboarding')}
          description={t('settings.dashboard.onboarding.description')}
          styles={styles}
        >
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
      </SettingsSectionGroup>
    </SettingsSectionShell>
  );
}
