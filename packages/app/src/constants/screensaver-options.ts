import {
  type BuiltInWallpaperToken,
  isBuiltInWallpaperToken,
  resolveWallpaperBackgroundImage,
} from './built-in-wallpapers';
import {
  getSolidWallpaper,
  type SolidWallpaperToken,
  solidWallpaperForeground,
} from './solid-wallpapers';

export const SCREENSAVER_IDLE_MINUTES = [1, 2, 5, 10, 15, 30] as const;
export type ScreensaverIdleMinutes = (typeof SCREENSAVER_IDLE_MINUTES)[number];
export type ScreensaverBackground = 'automatic' | BuiltInWallpaperToken | SolidWallpaperToken;

export function isScreensaverIdleMinutes(value: unknown): value is ScreensaverIdleMinutes {
  return SCREENSAVER_IDLE_MINUTES.some((minutes) => minutes === value);
}

export function isScreensaverBackground(value: unknown): value is ScreensaverBackground {
  return (
    value === 'automatic' ||
    (typeof value === 'string' && isBuiltInWallpaperToken(value)) ||
    Boolean(getSolidWallpaper(value))
  );
}

export function resolveScreensaverAppearance(
  background: ScreensaverBackground,
  wallpaper: string | null
) {
  const value = background === 'automatic' ? (wallpaper ?? 'builtin:nocturne-01') : background;
  const solid = getSolidWallpaper(value);
  return {
    background: solid ? null : resolveWallpaperBackgroundImage(value),
    color: solid?.color,
    foreground: solid ? solidWallpaperForeground(solid.color) : undefined,
  };
}
