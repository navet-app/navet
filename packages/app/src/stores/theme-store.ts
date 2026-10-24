import { resolveBuiltInWallpaperToken } from '@navet/app/constants/built-in-wallpapers';
import { getSolidWallpaper } from '@navet/app/constants/solid-wallpapers';
import { STORE_STORAGE_KEYS } from '@navet/app/constants/storage-keys';
import {
  readLocalStorageWithMigration,
  removeLocalStorageWithMigration,
  writeLocalStorageWithMigration,
} from '@navet/app/utils/local-storage-migration';
import { sanitizeImageUrl } from '@navet/app/utils/url-security';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'black' | 'glass';
export type PrimaryColor =
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'teal'
  | 'custom';

interface ThemeState {
  theme: ThemeMode;
  followSystemTheme: boolean;
  primaryColor: PrimaryColor;
  customPrimaryColor: string | null;
  wallpaper: string | null;
  applyImportedTheme: (theme: {
    theme: ThemeMode;
    primaryColor: PrimaryColor;
    customPrimaryColor: string | null;
    wallpaper: string | null;
  }) => void;
  setTheme: (theme: ThemeMode) => void;
  setFollowSystemTheme: (follow: boolean) => void;
  setPrimaryColor: (color: PrimaryColor) => void;
  setCustomPrimaryColor: (color: string | null) => void;
  setWallpaper: (wallpaper: string | null) => void;
}

function normalizeWallpaperPath(wallpaper: string | null | undefined) {
  if (!wallpaper) {
    return null;
  }

  const trimmed = wallpaper.trim();
  if (!trimmed) {
    return null;
  }

  if (getSolidWallpaper(trimmed)) return trimmed;
  const builtInWallpaperToken = resolveBuiltInWallpaperToken(trimmed);
  if (builtInWallpaperToken) {
    return builtInWallpaperToken;
  }

  if (trimmed.startsWith('/wallpapers/')) {
    return trimmed;
  }

  if (typeof window !== 'undefined') {
    try {
      const resolved = new URL(trimmed, window.location.href);
      if (resolved.origin === window.location.origin) {
        const sameOriginBuiltInWallpaper = resolveBuiltInWallpaperToken(resolved.pathname);
        if (sameOriginBuiltInWallpaper) {
          return sameOriginBuiltInWallpaper;
        }

        return `${resolved.pathname}${resolved.search}${resolved.hash}`;
      }
    } catch (error) {
      console.error('[ThemeStore] Wallpaper URL resolution failed:', error);
      return trimmed;
    }
  }

  return sanitizeImageUrl(trimmed, undefined, { allowDataImage: true }) ?? null;
}

function normalizeThemeMode(theme: ThemeMode | 'contrast' | null | undefined): ThemeMode {
  if (theme === 'contrast') {
    return 'black';
  }

  return theme ?? 'dark';
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      followSystemTheme: false,
      primaryColor: 'orange',
      customPrimaryColor: null,
      wallpaper: null,
      applyImportedTheme: (nextTheme) =>
        set({
          theme: normalizeThemeMode(nextTheme.theme),
          primaryColor: nextTheme.primaryColor,
          customPrimaryColor: nextTheme.customPrimaryColor,
          wallpaper: normalizeWallpaperPath(nextTheme.wallpaper),
        }),
      setTheme: (theme) => set({ theme }),
      setFollowSystemTheme: (followSystemTheme) => set({ followSystemTheme }),
      setPrimaryColor: (primaryColor) => set({ primaryColor }),
      setCustomPrimaryColor: (customPrimaryColor) => set({ customPrimaryColor }),
      setWallpaper: (wallpaper) => set({ wallpaper: normalizeWallpaperPath(wallpaper) }),
    }),
    {
      name: STORE_STORAGE_KEYS.theme,
      storage: createJSONStorage(() => ({
        getItem: (name) => readLocalStorageWithMigration(name, localStorage),
        setItem: (name, value) => writeLocalStorageWithMigration(name, value, localStorage),
        removeItem: (name) => removeLocalStorageWithMigration(name, localStorage),
      })),
      merge: (persisted, current) => {
        const next = (persisted as Partial<ThemeState> | null) ?? {};

        return {
          ...current,
          ...next,
          theme: normalizeThemeMode(next.theme ?? current.theme),
          wallpaper: normalizeWallpaperPath(next.wallpaper ?? current.wallpaper),
        };
      },
    }
  )
);
