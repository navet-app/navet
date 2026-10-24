import { describe, expect, it } from 'vitest';
import {
  resolveWallpaperBackgroundImage,
  resolveWallpaperPreviewSources,
} from '../built-in-wallpapers';
import {
  isScreensaverBackground,
  isScreensaverIdleMinutes,
  resolveScreensaverAppearance,
} from '../screensaver-options';

describe('screensaver backgrounds and delays', () => {
  it.each([null, undefined, 0, -1, 1.5, 100, '5'])('rejects invalid idle delay %s', (value) => {
    expect(isScreensaverIdleMinutes(value)).toBe(false);
  });

  it.each([
    'javascript:alert(1)',
    'https://example.com/image.jpg',
    'builtin:missing',
    'solid:missing',
    null,
  ])('rejects unsupported background %s', (value) => {
    expect(isScreensaverBackground(value)).toBe(false);
  });

  it('follows the current wallpaper in automatic mode, including solid colors and the empty default', () => {
    expect(resolveScreensaverAppearance('automatic', 'builtin:aurora-haze-01').background).toBe(
      resolveWallpaperBackgroundImage('builtin:aurora-haze-01')
    );
    expect(resolveScreensaverAppearance('automatic', 'solid:mint')).toMatchObject({
      background: null,
      color: '#bce8d1',
      foreground: '#000000',
    });
    expect(resolveScreensaverAppearance('automatic', null).background).toBe(
      resolveWallpaperBackgroundImage('builtin:nocturne-01')
    );
  });

  it('keeps explicit screensaver backgrounds independent of the dashboard', () => {
    expect(resolveScreensaverAppearance('builtin:aurora-haze-02', 'solid:black').background).toBe(
      resolveWallpaperBackgroundImage('builtin:aurora-haze-02')
    );
    expect(resolveScreensaverAppearance('solid:black', 'solid:mint')).toMatchObject({
      background: null,
      color: '#000000',
      foreground: '#ffffff',
    });
  });

  it('renders solid wallpaper tokens as colors without requesting an image URL', () => {
    expect(resolveWallpaperBackgroundImage('solid:mint')).toBe('linear-gradient(#bce8d1, #bce8d1)');
    expect(resolveWallpaperPreviewSources('solid:mint')).toBeNull();
  });
});
