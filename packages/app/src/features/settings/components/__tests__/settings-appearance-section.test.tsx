import { BUILT_IN_WALLPAPERS } from '@navet/app/constants/built-in-wallpapers';
import { useSettingsSectionController } from '@navet/app/features/settings/hooks/use-settings-section-controller';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { useThemeStore } from '@navet/app/stores/theme-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SettingsAppearanceSection } from '../settings-appearance-section';

function TestSection() {
  const controller = useSettingsSectionController();
  return <SettingsAppearanceSection controller={controller} />;
}

describe('SettingsAppearanceSection', () => {
  beforeEach(async () => {
    await resetAppStores();
  });

  it('groups appearance controls by visual purpose', () => {
    renderWithProviders(<TestSection />);

    expect(screen.getByRole('heading', { name: 'Theme and background' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Layout' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Effects' })).toBeInTheDocument();
  });

  it('opens wallpaper choices on demand and applies built-ins and solid colors', () => {
    renderWithProviders(<TestSection />);
    expect(screen.getByRole('img', { name: 'Theme background' })).toHaveTextContent(
      'No wallpaper selected.'
    );
    expect(screen.queryByRole('group', { name: 'Built-in wallpapers' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change wallpaper' }));
    const dialog = screen.getByRole('dialog', { name: 'Wallpaper' });
    const choices = within(dialog).getByRole('group', { name: 'Built-in wallpapers' });
    expect(within(choices).getAllByRole('button')).toHaveLength(BUILT_IN_WALLPAPERS.length);
    expect(
      within(dialog).queryByRole('button', { name: 'Show all wallpapers' })
    ).not.toBeInTheDocument();
    fireEvent.click(within(choices).getByRole('button', { name: 'Wallpaper nocturne-07' }));
    expect(useThemeStore.getState().wallpaper).toBe('builtin:nocturne-07');
    expect(within(dialog).queryByText('No wallpaper selected.')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Solid color' }));
    const colors = within(dialog).getByRole('group', { name: 'Solid colors' });
    expect(within(colors).getAllByRole('button')).toHaveLength(24);
    fireEvent.click(within(colors).getByRole('button', { name: 'Mint' }));
    expect(useThemeStore.getState().wallpaper).toBe('solid:mint');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove wallpaper' }));
    expect(useThemeStore.getState().wallpaper).toBeNull();
    expect(within(dialog).getByRole('img', { name: 'Theme background' })).toHaveTextContent(
      'No wallpaper selected.'
    );
  });

  it('configures the device screensaver without changing the dashboard wallpaper', () => {
    useThemeStore.getState().setWallpaper('builtin:nocturne-01');
    renderWithProviders(<TestSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Screensaver' }));
    const dialog = screen.getByRole('dialog', { name: 'Screensaver' });
    const toggle = within(dialog).getByRole('group', { name: 'Screensaver' });
    expect(within(toggle).getByRole('button', { name: 'Off' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(within(dialog).queryByLabelText('Start after')).not.toBeInTheDocument();
    fireEvent.click(within(toggle).getByRole('button', { name: 'On' }));
    expect(within(dialog).getByRole('button', { name: 'Automatic' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.change(within(dialog).getByLabelText('Start after'), { target: { value: '10' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Wallpaper' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Wallpaper aurora-haze-02' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Solid color' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sky' }));
    expect(useSettingsStore.getState()).toMatchObject({
      screensaverEnabled: true,
      screensaverIdleMinutes: 10,
      screensaverBackground: 'solid:sky',
    });
    expect(useThemeStore.getState().wallpaper).toBe('builtin:nocturne-01');
    fireEvent.click(within(toggle).getByRole('button', { name: 'Off' }));
    expect(useSettingsStore.getState().screensaverBackground).toBe('solid:sky');
    fireEvent.click(within(toggle).getByRole('button', { name: 'On' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Automatic' }));
    expect(useSettingsStore.getState().screensaverBackground).toBe('automatic');
  });

  it('switches dashboard space mode between default and more space', () => {
    renderWithProviders(<TestSection />);

    expect(
      screen.queryByText('Denser layout. Some touch controls may be harder to use.')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More space' }));
    expect(useSettingsStore.getState().dashboardSpaceMode).toBe('more_space');
    expect(
      screen.getByText('Denser layout. Some touch controls may be harder to use.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Default' }));
    expect(useSettingsStore.getState().dashboardSpaceMode).toBe('default');
    expect(
      screen.queryByText('Denser layout. Some touch controls may be harder to use.')
    ).not.toBeInTheDocument();
  });

  it('updates visual quality using its fixed device scope', () => {
    renderWithProviders(<TestSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Medium' }));

    expect(useSettingsStore.getState().effectsQuality).toBe('medium');
    expect(useSettingsStore.getState().effectsQualityUserOverride).toBe(true);
    expect(useSettingsStore.getState().disableAnimations).toBe(false);
    expect(useSettingsStore.getState().lowPowerMode).toBe(false);
  });

  it('returns visual quality to automatic device adaptation', () => {
    useSettingsStore.getState().updateSettings({
      effectsQuality: 'low',
      effectsQualityUserOverride: true,
    });
    renderWithProviders(<TestSection />);

    const qualityAutoButton = screen.getAllByRole('button', { name: 'Auto' }).at(-1);
    if (!qualityAutoButton) {
      throw new Error('Expected the automatic effects-quality control');
    }
    fireEvent.click(qualityAutoButton);

    expect(useSettingsStore.getState().effectsQualityUserOverride).toBe(false);
  });

  it('disables ambience controls when low-power mode forces effective low quality', () => {
    useSettingsStore.getState().updateSettings({
      effectsQuality: 'high',
      lowPowerMode: true,
      ambientLightBleed: true,
    });

    renderWithProviders(<TestSection />);

    expect(screen.getByRole('button', { name: 'Ambient bleed' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Contained' })).toBeDisabled();
    expect(
      screen.getByText(
        'Available only on High visual quality. Light cards use Contained mode on Medium and Low.'
      )
    ).toBeInTheDocument();
  });
});
