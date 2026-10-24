import { navetTypographyTokens } from '@navet/app/components/system/tokens';
import { resolveWallpaperBackgroundImage } from '@navet/app/constants/built-in-wallpapers';
import { useI18n } from '@navet/app/hooks';
import { Palette } from 'lucide-react';
import type { SettingsSectionStyles } from '../hooks/settings-section-styles';

export function AppearanceWallpaperPreview({
  wallpaper,
  styles,
}: {
  wallpaper: string | null;
  styles: SettingsSectionStyles;
}) {
  const { t } = useI18n();
  return (
    <div
      role="img"
      aria-label={t(
        wallpaper ? 'settings.appearance.wallpaper.previewAlt' : 'wallpaper.themeBackground'
      )}
      className={`relative aspect-video w-full overflow-hidden rounded-xl border ${styles.cardBg} ${styles.borderColor}`}
      style={{
        backgroundImage: resolveWallpaperBackgroundImage(wallpaper) ?? undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {!wallpaper ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
          <Palette aria-hidden className={`mb-1 h-6 w-6 ${styles.subtleColor}`} />
          <p className={`${navetTypographyTokens.label} ${styles.textColor}`}>
            {t('wallpaper.themeBackground')}
          </p>
          <p className={`${navetTypographyTokens.caption} ${styles.subtleColor}`}>
            {t('wallpaper.noneSelected')}
          </p>
        </div>
      ) : null}
    </div>
  );
}
