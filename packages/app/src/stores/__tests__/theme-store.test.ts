import { STORE_STORAGE_KEYS } from '@navet/app/constants/storage-keys';
import { resetAppStores } from '@navet/app/test/store-reset';
import { beforeEach, describe, expect, it } from 'vitest';
import { useThemeStore } from '../theme-store';

describe('useThemeStore', () => {
  beforeEach(async () => {
    document.querySelector('base')?.remove();
    window.history.replaceState(null, '', '/');
    await resetAppStores();
  });

  it('normalizes imported contrast themes and wallpaper paths', () => {
    useThemeStore.getState().applyImportedTheme({
      theme: 'black',
      primaryColor: 'orange',
      customPrimaryColor: null,
      wallpaper: '/wallpapers/sunrise.jpg',
    });

    expect(useThemeStore.getState().theme).toBe('black');
    expect(useThemeStore.getState().wallpaper).toBe('/wallpapers/sunrise.jpg');
  });

  it('retains a solid wallpaper across persistence and imported themes', async () => {
    useThemeStore.getState().setWallpaper('solid:mint');
    expect(useThemeStore.getState().wallpaper).toBe('solid:mint');
    await useThemeStore.persist.rehydrate();
    expect(useThemeStore.getState().wallpaper).toBe('solid:mint');
    useThemeStore.getState().applyImportedTheme({
      theme: 'dark',
      primaryColor: 'orange',
      customPrimaryColor: null,
      wallpaper: 'solid:sky',
    });
    expect(useThemeStore.getState().wallpaper).toBe('solid:sky');
  });

  it('normalizes same-origin wallpaper URLs when set directly', () => {
    useThemeStore.getState().setWallpaper(`${window.location.origin}/wallpapers/aurora.jpg`);

    expect(useThemeStore.getState().wallpaper).toBe('/wallpapers/aurora.jpg');
  });

  it('maps legacy adaptive wallpaper presets to the flat pack', () => {
    useThemeStore.getState().setWallpaper('preset:soft-dark-gradient');

    expect(useThemeStore.getState().wallpaper).toBe('builtin:aurora-haze-01');
  });

  it('normalizes built-in wallpapers under the Home Assistant add-on ingress base', () => {
    const base = document.createElement('base');
    base.href = `${window.location.origin}/api/hassio_ingress/navet_dev/`;
    document.head.append(base);

    useThemeStore.getState().setWallpaper('/wallpapers/luxury-living-room-ambient.svg');

    expect(useThemeStore.getState().wallpaper).toBe('builtin:aurora-haze-04');
  });

  it('migrates persisted built-in wallpaper paths to the current ingress base', async () => {
    const base = document.createElement('base');
    base.href = `${window.location.origin}/api/hassio_ingress/current_slug/`;
    document.head.append(base);
    localStorage.removeItem(STORE_STORAGE_KEYS.theme);
    localStorage.setItem(
      'ha-dashboard-theme',
      JSON.stringify({
        state: {
          wallpaper: '/api/hassio_ingress/old_slug/wallpapers/luxury-living-room-ambient.svg',
        },
        version: 0,
      })
    );

    await useThemeStore.persist.rehydrate();

    expect(useThemeStore.getState().wallpaper).toBe('builtin:aurora-haze-04');
    expect(localStorage.getItem(STORE_STORAGE_KEYS.theme)).toContain('old_slug');
    expect(localStorage.getItem('ha-dashboard-theme')).toBeNull();
  });

  it('normalizes current built-in wallpaper asset URLs to stable tokens', () => {
    useThemeStore
      .getState()
      .setWallpaper(`${window.location.origin}/wallpapers/generated/cinematic-glow-02.webp`);

    expect(useThemeStore.getState().wallpaper).toBe('builtin:cinematic-glow-02');
  });

  it('keeps non built-in wallpaper paths and uploaded data URLs unchanged', () => {
    useThemeStore.getState().setWallpaper('/wallpapers/custom-room-shot.jpg');
    expect(useThemeStore.getState().wallpaper).toBe('/wallpapers/custom-room-shot.jpg');

    useThemeStore.getState().setWallpaper('data:image/png;base64,Zm9v');
    expect(useThemeStore.getState().wallpaper).toBe('data:image/png;base64,Zm9v');
  });

  it('rehydrates normalized persisted values', async () => {
    localStorage.removeItem(STORE_STORAGE_KEYS.theme);
    localStorage.setItem(
      'ha-dashboard-theme',
      JSON.stringify({
        state: {
          theme: 'contrast',
          wallpaper: '/wallpapers/night.jpg',
          primaryColor: 'green',
        },
        version: 0,
      })
    );

    await useThemeStore.persist.rehydrate();

    expect(useThemeStore.getState().theme).toBe('black');
    expect(useThemeStore.getState().wallpaper).toBe('/wallpapers/night.jpg');
    expect(useThemeStore.getState().primaryColor).toBe('green');
  });

  it('prefers the navet theme key when both keys exist', async () => {
    localStorage.setItem(
      STORE_STORAGE_KEYS.theme,
      JSON.stringify({
        state: {
          theme: 'black',
          primaryColor: 'red',
        },
        version: 0,
      })
    );
    localStorage.setItem(
      'ha-dashboard-theme',
      JSON.stringify({
        state: {
          theme: 'contrast',
          primaryColor: 'green',
        },
        version: 0,
      })
    );

    await useThemeStore.persist.rehydrate();

    expect(useThemeStore.getState().theme).toBe('black');
    expect(useThemeStore.getState().primaryColor).toBe('red');
    expect(localStorage.getItem('ha-dashboard-theme')).toBeNull();
  });
});
