import { InteractivePill } from '@navet/app/components/primitives/interactive-pill';
import { ThemeAppearancePicker } from '@navet/app/components/shared/theme/theme-appearance-picker';
import { useI18n } from '@navet/app/hooks';
import type { EffectsQuality } from '@navet/app/stores/settings-store';
import { detectDeviceTier } from '@navet/app/utils/detect-device-tier';
import {
  getLegacyReducedEffectsFlags,
  resolveEffectsQuality,
} from '@navet/app/utils/effects-quality';
import { AlertTriangle } from 'lucide-react';
import { useMemo } from 'react';
import type { SettingsSectionController } from '../hooks/use-settings-section-controller';
import { SettingsItem } from './settings-section-shell';

export function AppearanceThemeAccentItem({
  controller,
}: {
  controller: SettingsSectionController;
}) {
  const { t } = useI18n();
  const {
    colorOptions,
    customPrimaryColor,
    followSystemTheme,
    manualTheme,
    primaryColor,
    setCustomPrimaryColor,
    setFollowSystemTheme,
    setPrimaryColor,
    setTheme,
    styles,
    theme,
    themeOptions,
  } = controller;

  return (
    <SettingsItem
      title={t('settings.appearance.themeAccent.title')}
      description={t('settings.appearance.themeAccent.description')}
      styles={styles}
    >
      <ThemeAppearancePicker
        colorOptions={colorOptions}
        customAccent={customPrimaryColor}
        selectedAccent={primaryColor}
        selectedTheme={manualTheme}
        effectiveTheme={theme}
        themeOptions={themeOptions}
        onAccentChange={setPrimaryColor}
        onCustomAccentChange={setCustomPrimaryColor}
        onThemeChange={setTheme}
        followSystemTheme={followSystemTheme}
        onFollowSystemThemeChange={setFollowSystemTheme}
      />
    </SettingsItem>
  );
}

export function AppearanceSpaceModeItem({ controller }: { controller: SettingsSectionController }) {
  const { t } = useI18n();
  const { dashboardSpaceMode, styles, updateScopedSettings } = controller;
  const showMoreSpaceWarning = dashboardSpaceMode === 'more_space';

  return (
    <SettingsItem
      title={t('settings.dashboard.spaceMode.title')}
      description={t('settings.dashboard.spaceMode.description')}
      styles={styles}
    >
      <div className="space-y-3">
        <fieldset className="w-fit">
          <legend className="sr-only">{t('settings.dashboard.spaceMode.title')}</legend>
          <div className="flex flex-wrap gap-2">
            {[
              {
                value: 'default' as const,
                label: t('settings.dashboard.spaceMode.default'),
              },
              {
                value: 'more_space' as const,
                label: t('settings.dashboard.spaceMode.moreSpace'),
              },
            ].map((option) => {
              const isActive = dashboardSpaceMode === option.value;

              return (
                <InteractivePill
                  key={option.value}
                  active={isActive}
                  size="small"
                  onClick={() => {
                    if (isActive) {
                      return;
                    }

                    updateScopedSettings({ dashboardSpaceMode: option.value }, [
                      'dashboardSpaceMode',
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

        {showMoreSpaceWarning ? (
          <div className={`flex items-start gap-2 text-sm ${styles.subtleColor}`}>
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{t('settings.dashboard.spaceMode.warningBody')}</p>
          </div>
        ) : null}
      </div>
    </SettingsItem>
  );
}

export function AppearanceEffectsQualityItem({
  controller,
}: {
  controller: SettingsSectionController;
}) {
  const { t } = useI18n();
  const { effectsQuality, effectsQualityUserOverride, styles, updateScopedSettings } = controller;
  const detectedTier = useMemo(() => detectDeviceTier(), []);
  const qualityOptions: Array<{ value: EffectsQuality | 'auto'; label: string }> = [
    { value: 'auto', label: t('settings.system.effectsQuality.auto') },
    { value: 'high', label: t('settings.system.effectsQuality.high') },
    { value: 'medium', label: t('settings.system.effectsQuality.medium') },
    { value: 'low', label: t('settings.system.effectsQuality.low') },
  ];

  return (
    <SettingsItem
      title={t('settings.system.effectsQuality.title')}
      description={t('settings.system.effectsQuality.description')}
      styles={styles}
    >
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {qualityOptions.map((option) => {
            const isActive =
              option.value === 'auto'
                ? !effectsQualityUserOverride
                : effectsQualityUserOverride && effectsQuality === option.value;
            const resolvedQuality = option.value === 'auto' ? detectedTier : option.value;
            return (
              <InteractivePill
                key={option.label}
                active={isActive}
                size="small"
                onClick={() =>
                  updateScopedSettings(
                    {
                      effectsQuality: resolvedQuality,
                      effectsQualityUserOverride: option.value !== 'auto',
                      ...getLegacyReducedEffectsFlags(resolvedQuality),
                    },
                    ['effectsQuality']
                  )
                }
                aria-pressed={isActive}
              >
                {option.label}
              </InteractivePill>
            );
          })}
        </div>
        <p className={`text-sm ${styles.subtleColor}`}>
          {t('settings.system.effectsQuality.recommended')}:{' '}
          {qualityOptions.find((option) => option.value === detectedTier)?.label}
        </p>
      </div>
    </SettingsItem>
  );
}

export function AppearanceAmbienceItem({ controller }: { controller: SettingsSectionController }) {
  const { t } = useI18n();
  const {
    ambientLightBleed,
    disableAnimations,
    effectsQuality,
    lowPowerMode,
    styles,
    updateSettings,
  } = controller;
  const ambienceDisabled =
    resolveEffectsQuality(effectsQuality, disableAnimations || lowPowerMode) !== 'high';
  const effectiveAmbientLightBleed = ambientLightBleed && !ambienceDisabled;

  return (
    <SettingsItem
      title={t('settings.appearance.ambience.title')}
      description={t('settings.appearance.ambience.description')}
      styles={styles}
    >
      <div className="space-y-3">
        <div className="flex w-fit flex-wrap gap-2">
          {[
            { value: true, label: t('settings.appearance.ambience.ambientBleed') },
            { value: false, label: t('settings.appearance.ambience.contained') },
          ].map((option) => {
            const isActive = effectiveAmbientLightBleed === option.value;
            return (
              <InteractivePill
                key={option.label}
                active={isActive}
                size="small"
                onClick={() => updateSettings({ ambientLightBleed: option.value })}
                disabled={ambienceDisabled}
                aria-pressed={isActive}
              >
                {option.label}
              </InteractivePill>
            );
          })}
        </div>

        {ambienceDisabled ? (
          <p className={`text-sm ${styles.subtleColor}`}>
            {t('settings.appearance.ambience.disabledInLowPower')}
          </p>
        ) : null}
      </div>
    </SettingsItem>
  );
}

export { AppearanceWallpaperItem } from './settings-wallpaper-item';
