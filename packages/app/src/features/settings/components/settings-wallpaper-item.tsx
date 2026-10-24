import { Button } from '@navet/app/components/primitives/button';
import {
  isBuiltInWallpaperToken,
  resolveBuiltInWallpaperDescriptor,
} from '@navet/app/constants/built-in-wallpapers';
import { getSolidWallpaper } from '@navet/app/constants/solid-wallpapers';
import { useI18n } from '@navet/app/hooks';
import { type MouseEvent, useRef, useState } from 'react';
import type { SettingsSectionController } from '../hooks/use-settings-section-controller';
import {
  AppearanceBackgroundDialog,
  type AppearanceBackgroundTarget,
} from './appearance-background-dialog';
import { AppearanceWallpaperPreview } from './appearance-wallpaper-preview';
import { SettingsItem } from './settings-section-shell';

export function AppearanceWallpaperItem({ controller }: { controller: SettingsSectionController }) {
  const { t } = useI18n();
  const { styles, wallpaper, screensaverEnabled, screensaverBackground, screensaverIdleMinutes } =
    controller;
  const [target, setTarget] = useState<AppearanceBackgroundTarget | null>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const open = (value: AppearanceBackgroundTarget, event: MouseEvent<HTMLButtonElement>) => {
    returnFocus.current = event.currentTarget;
    setTarget(value);
  };
  const solid = getSolidWallpaper(screensaverBackground);
  const builtIn = isBuiltInWallpaperToken(screensaverBackground)
    ? resolveBuiltInWallpaperDescriptor(screensaverBackground)
    : null;
  const backgroundName = solid
    ? t(solid.labelKey)
    : builtIn
      ? builtIn.id.replace(/-/g, ' ').replace(/^./, (letter) => letter.toUpperCase())
      : t('screensaver.customBackground');
  const status = !screensaverEnabled
    ? t('common.off')
    : screensaverBackground === 'automatic'
      ? t('screensaver.automatic')
      : backgroundName;
  return (
    <SettingsItem
      title={t('settings.appearance.wallpaper.title')}
      description={t('settings.appearance.wallpaper.description')}
      styles={styles}
    >
      <div className="space-y-3">
        <AppearanceWallpaperPreview wallpaper={wallpaper} styles={styles} />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={(event) => open('wallpaper', event)}>
            {t('wallpaper.change')}
          </Button>
          <Button variant="secondary" onClick={(event) => open('screensaver', event)}>
            {t('screensaver.title')}
          </Button>
        </div>
        <p className={`text-sm ${styles.subtleColor}`} aria-live="polite">
          {t('screensaver.title')} · {status}
          {screensaverEnabled
            ? ` · ${t('screensaver.startsAfter', { delay: t(screensaverIdleMinutes === 1 ? 'screensaver.minute' : 'screensaver.minutes', { count: screensaverIdleMinutes }) })}`
            : ''}
        </p>
      </div>
      {target ? (
        <AppearanceBackgroundDialog
          target={target}
          controller={controller}
          onClose={() => setTarget(null)}
          returnFocusRef={returnFocus}
        />
      ) : null}
    </SettingsItem>
  );
}
