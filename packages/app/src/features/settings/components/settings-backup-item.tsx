import { useI18n } from '@navet/app/hooks';
import { Download, Upload } from 'lucide-react';
import type { SettingsSectionController } from '../hooks/use-settings-section-controller';
import { SettingsItem } from './settings-section-shell';

export function SettingsBackupItem({ controller }: { controller: SettingsSectionController }) {
  const { t } = useI18n();
  const { handleExportDashboardConfig, handleImportDashboardConfig, importInputRef, styles } =
    controller;
  return (
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
  );
}
