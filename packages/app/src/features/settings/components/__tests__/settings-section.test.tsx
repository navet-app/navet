import { defaultTranslate } from '@navet/app/i18n';
import { setMediaQueryMatch } from '@navet/app/test/browser-mocks';
import { renderWithProviders } from '@navet/app/test/render';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSettingsSearchItems } from '../settings-search-items';
import { SettingsSection } from '../settings-section';

describe('SettingsSection', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.scrollbarGutter = '';
  });

  it('restores the persisted tab after remounting', async () => {
    const firstRender = renderWithProviders(<SettingsSection />);

    fireEvent.click(screen.getByRole('button', { name: 'System' }));

    await waitFor(() =>
      expect(localStorage.getItem('navet-settings-active-tab')).toBe(JSON.stringify('system'))
    );

    firstRender.unmount();
    renderWithProviders(<SettingsSection />);

    expect(screen.getByRole('heading', { name: 'System' })).toBeInTheDocument();
  });

  it('uses a settings sidebar without the former hero', () => {
    renderWithProviders(<SettingsSection />);

    expect(screen.getByRole('navigation', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Appearance' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.queryByText('A calmer place to tune Navet.')).not.toBeInTheDocument();
  });

  it('uses an overlay detail scrollbar without reserving permanent layout space', () => {
    document.documentElement.style.scrollbarGutter = 'auto';

    renderWithProviders(<SettingsSection />);

    const detailScroll = document.querySelector('[data-settings-detail-scroll]');
    expect(detailScroll).toHaveClass('scrollbar-hide');
    expect(detailScroll?.closest('.overlay-scroll-area')).toBeInTheDocument();
    expect(document.documentElement.style.scrollbarGutter).toBe('auto');
    expect((detailScroll as HTMLElement).style.scrollbarGutter).toBe('');
  });

  it('filters settings destinations from the sidebar search', () => {
    renderWithProviders(<SettingsSection />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), {
      target: { value: 'system' },
    });

    expect(screen.getByRole('button', { name: 'System, System' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Appearance' })).not.toBeInTheDocument();
  });

  it('finds a nested setting and navigates to it in the parent section', async () => {
    renderWithProviders(<SettingsSection />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), {
      target: { value: 'visual quality' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Visual quality, Appearance' }));

    const target = await screen.findByText('Visual quality', { selector: 'h3' });
    await waitFor(() => expect(target.closest('[data-settings-search-label]')).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Appearance' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it.each([
    ['Display preset', 'Display & controls'],
    ['Side panel', 'Display & controls'],
    ['Header title', 'Display & controls'],
    ['Screensaver', 'Display & controls'],
    ['Keep device awake', 'Display & controls'],
    ['Device settings', 'Display & controls'],
    ['Copy settings once', 'Display & controls', 'Device settings'],
    ['Keep settings synced', 'Display & controls', 'Device settings'],
    ['Authorized devices', 'System'],
    ['Local config backup', 'System'],
    ['Restart onboarding', 'Dashboard'],
  ])('finds %s in %s and focuses its control row', async (label, category, targetLabel = label) => {
    renderWithProviders(<SettingsSection />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), {
      target: { value: label },
    });
    fireEvent.click(screen.getByRole('button', { name: `${label}, ${category}` }));
    const target = await screen.findByRole('heading', { name: targetLabel ?? label, level: 3 });
    await waitFor(() => expect(target.closest('[data-settings-search-label]')).toHaveFocus());
    expect(
      within(screen.getByRole('main')).getByRole('heading', { name: category, level: 2 })
    ).toBeInTheDocument();
  });

  it('omits unavailable controls from search and exposes kiosk swiping only when applicable', () => {
    const unavailable = createSettingsSearchItems(defaultTranslate, {
      authorizedDevices: false,
      browserZoom: false,
      kioskSwipeRooms: false,
    });
    for (const label of ['Authorized devices', 'Browser zoom', 'Swipe between rooms']) {
      expect(unavailable.some((item) => item.label === label)).toBe(false);
    }
    const available = createSettingsSearchItems(defaultTranslate, {
      authorizedDevices: true,
      browserZoom: true,
      kioskSwipeRooms: true,
    });
    expect(available.find((item) => item.label === 'Authorized devices')?.sectionId).toBe('system');
    expect(available.find((item) => item.label === 'Browser zoom')?.sectionId).toBe('interaction');
    expect(available.find((item) => item.label === 'Swipe between rooms')?.sectionId).toBe(
      'interaction'
    );
  });

  it('uses list-to-detail navigation on mobile and returns to the category list', () => {
    setMediaQueryMatch('(max-width: 767px)', true);
    renderWithProviders(<SettingsSection />);

    const navigation = screen.getByRole('navigation', { name: 'Settings' });
    fireEvent.click(within(navigation).getByRole('button', { name: 'Language & units' }));

    expect(screen.queryByRole('navigation', { name: 'Settings' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Language & units' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(screen.getByRole('navigation', { name: 'Settings' })).toBeInTheDocument();
  });
});
