import { useSettingsSectionController } from '@navet/app/features/settings/hooks/use-settings-section-controller';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { fireEvent, screen } from '@testing-library/react';
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
