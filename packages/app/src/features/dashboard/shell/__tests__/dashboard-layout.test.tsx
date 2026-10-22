import { EffectiveEffectsQualityProvider } from '@navet/app/components/shared/theme/effective-effects-quality';
import * as themeSurfaceTokens from '@navet/app/components/shared/theme/theme-surface-tokens';
import { useNavigationStore, useSettingsStore } from '@navet/app/stores';
import { useThemeStore } from '@navet/app/stores/theme-store';
import { setMediaQueryMatch } from '@navet/app/test/browser-mocks';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboardCollectionStore } from '../../dashboards/dashboard-collection-store';
import { useScreensaverStore } from '../../screensaver/screensaver-store';
import { SCREENSAVER_IDLE_MS } from '../../screensaver/use-screensaver';
import { DashboardLayout } from '../index';

vi.mock('@navet/app/utils/detect-device-tier', () => ({
  detectDeviceTier: () => 'high',
}));

vi.mock('@navet/app/components/layout/header', () => ({
  Header: () => <header data-testid="header">Header</header>,
}));

vi.mock('@navet/app/components/layout/sidebar', () => ({
  Sidebar: () => <aside data-testid="sidebar">Sidebar</aside>,
}));

vi.mock('@navet/app/components/layout/use-header-controller', () => ({
  useHeaderController: () => ({
    headerCustomText: useSettingsStore((state) => state.headerCustomText),
    activeColorValue: '#f97316',
    handleClearSearch: vi.fn(),
    handleSearchChange: vi.fn(),
    handleToggleMobileSearch: vi.fn(),
    hoverBg: '',
    inputBg: '',
    isMobileSearchOpen: false,
    isSearchActive: false,
    isSearchFocused: false,
    mobileSearchInputRef: { current: null },
    searchQuery: '',
    setIsSearchFocused: vi.fn(),
    textPrimary: '',
    textSecondary: '',
  }),
}));

function setPath(path: string) {
  window.history.replaceState(null, '', path);
}

describe('DashboardLayout', () => {
  beforeEach(async () => {
    await resetAppStores();
  });

  afterEach(() => {
    document.querySelector('base')?.remove();
    setPath('/');
  });

  it('does not show an add-on topbar for Home Assistant add-on ingress users', () => {
    setPath('/api/hassio_ingress/navet_dev/dashboard');

    renderWithProviders(
      <DashboardLayout>
        <main>Dashboard content</main>
      </DashboardLayout>
    );

    expect(screen.queryByText(/custom panel/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /view setup steps/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('blocks idle screensaver activation for the independent panel editor', () => {
    vi.useFakeTimers();
    try {
      useSettingsStore.getState().updateSettings({ screensaverEnabled: true });
      useDashboardCollectionStore.getState().setCompanionCustomizationOpen(true);
      const view = renderWithProviders(
        <DashboardLayout>
          <main>Dashboard content</main>
        </DashboardLayout>
      );
      act(() => vi.advanceTimersByTime(SCREENSAVER_IDLE_MS + 1));
      expect(useScreensaverStore.getState().active).toBe(false);
      view.unmount();
    } finally {
      useDashboardCollectionStore.getState().setCompanionCustomizationOpen(false);
      vi.useRealTimers();
    }
  });

  it('renders the dashboard layout outside Home Assistant add-on mode', () => {
    setPath('/dashboard');

    renderWithProviders(
      <DashboardLayout>
        <main>Dashboard content</main>
      </DashboardLayout>
    );

    expect(screen.getByText('Dashboard content')).toBeInTheDocument();
    expect(document.getElementById('dashboard-main-content')).toHaveAttribute('tabindex', '-1');
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.queryByTestId('kiosk-orbit-menu')).not.toBeInTheDocument();
  });

  it('does not recalculate the dashboard surface for header-only updates', () => {
    const surfaceSpy = vi.spyOn(themeSurfaceTokens, 'getThemeSurfaceTokens');
    renderWithProviders(
      <DashboardLayout>
        <main>Dashboard content</main>
      </DashboardLayout>
    );
    surfaceSpy.mockClear();

    act(() => useSettingsStore.getState().updateSettings({ headerCustomText: 'Kitchen' }));

    expect(surfaceSpy).not.toHaveBeenCalled();
    surfaceSpy.mockRestore();
  });

  it('keeps the dashboard surface behind content taller than the viewport', () => {
    useThemeStore.getState().setWallpaper('/wallpapers/custom-room-shot.jpg');

    renderWithProviders(
      <DashboardLayout>
        <main style={{ minHeight: '180vh' }}>Long dashboard content</main>
      </DashboardLayout>
    );

    expect(screen.getByTestId('dashboard-document-surface')).toHaveClass('min-h-[100dvh]');
    expect(screen.getByTestId('dashboard-layout-content').parentElement).toHaveClass(
      'min-h-[100dvh]'
    );
    expect(screen.getByTestId('dashboard-wallpaper-image')).toHaveClass('absolute', 'inset-0');
  });

  it('uses tighter shell padding on 768px to 1024px screens', () => {
    setPath('/dashboard');
    setMediaQueryMatch('(min-width: 768px) and (max-width: 1024px)', true);
    useSettingsStore.getState().updateSettings({ dashboardSpaceMode: 'more_space' });

    renderWithProviders(
      <DashboardLayout>
        <main>Dashboard content</main>
      </DashboardLayout>
    );

    expect(screen.getByTestId('dashboard-layout-content')).toHaveClass('px-4', 'py-5');
    expect(screen.getByTestId('dashboard-layout-content')).not.toHaveClass('lg:px-5');
  });

  it('keeps the original shell padding above 1024px', () => {
    setPath('/dashboard');
    setMediaQueryMatch('(min-width: 768px) and (max-width: 1024px)', false);

    renderWithProviders(
      <DashboardLayout>
        <main>Dashboard content</main>
      </DashboardLayout>
    );

    expect(screen.getByTestId('dashboard-layout-content')).toHaveClass('md:p-6', 'lg:p-8');
    expect(screen.getByTestId('dashboard-layout-content')).not.toHaveClass('px-4', 'py-5');
  });

  it('hides the dashboard chrome and renders the kiosk more menu in kiosk mode', async () => {
    setPath('/dashboard');
    useSettingsStore.getState().updateSettings({ kioskMode: true });

    renderWithProviders(
      <DashboardLayout>
        <main>Dashboard content</main>
      </DashboardLayout>
    );

    expect(screen.getByText('Dashboard content')).toBeInTheDocument();
    expect(screen.queryByTestId('header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('kiosk-orbit-menu')).not.toBeInTheDocument();
    expect(await screen.findByTestId('kiosk-orbit-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-layout-content')).not.toHaveClass('md:ml-16');
    expect(screen.getByTestId('dashboard-layout-content')).toHaveClass('pb-24');
  });

  it('keeps settings route content reachable in kiosk mode', () => {
    setPath('/settings');
    useSettingsStore.getState().updateSettings({ kioskMode: true });

    renderWithProviders(
      <DashboardLayout>
        <main>Settings content</main>
      </DashboardLayout>
    );

    expect(screen.getByText('Settings content')).toBeInTheDocument();
    expect(screen.queryByTestId('header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument();
  });

  it('navigates home from the kiosk more menu', async () => {
    useSettingsStore.getState().updateSettings({ kioskMode: true });
    useNavigationStore.getState().setActiveSection('settings');

    renderWithProviders(
      <DashboardLayout>
        <main>Settings content</main>
      </DashboardLayout>
    );

    fireEvent.click(await screen.findByTestId('kiosk-orbit-trigger'));
    fireEvent.click(await screen.findByRole('button', { name: 'Home' }));

    expect(useNavigationStore.getState().activeSection).toBe('home');
  });

  it('navigates to settings from the kiosk more menu', async () => {
    useSettingsStore.getState().updateSettings({ kioskMode: true });
    useNavigationStore.getState().setActiveSection('home');

    renderWithProviders(
      <DashboardLayout>
        <main>Dashboard content</main>
      </DashboardLayout>
    );

    fireEvent.click(await screen.findByTestId('kiosk-orbit-trigger'));
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));

    expect(useNavigationStore.getState().activeSection).toBe('settings');
  });

  it('toggles customize from the kiosk more menu', async () => {
    const onToggleEditMode = vi.fn();
    useSettingsStore.getState().updateSettings({ kioskMode: true });

    renderWithProviders(
      <DashboardLayout mobileEditActions={{ isEditMode: false, onToggleEditMode }}>
        <main>Dashboard content</main>
      </DashboardLayout>
    );

    fireEvent.click(await screen.findByTestId('kiosk-orbit-trigger'));
    fireEvent.click(await screen.findByRole('button', { name: 'Customize' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Customize' }));

    expect(onToggleEditMode).toHaveBeenCalledTimes(1);
  });

  it('switches rooms from the kiosk more menu', async () => {
    const onRoomChange = vi.fn();
    useSettingsStore.getState().updateSettings({ kioskMode: true });
    useNavigationStore.getState().setActiveSection('home');

    renderWithProviders(
      <DashboardLayout
        mobileRoomNavigation={{
          activeRoom: 'All',
          onRoomChange,
          rooms: ['All', 'Kitchen'],
        }}
      >
        <main>Dashboard content</main>
      </DashboardLayout>
    );

    fireEvent.click(await screen.findByTestId('kiosk-orbit-trigger'));
    fireEvent.click(await screen.findByRole('button', { name: 'Home' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Kitchen' }));

    expect(onRoomChange).toHaveBeenCalledWith('Kitchen');
  });

  it('uses a light wallpaper readability treatment in light theme', () => {
    useThemeStore.getState().setTheme('light');
    useThemeStore.getState().setWallpaper('/wallpapers/custom-room-shot.jpg');
    useSettingsStore.setState({
      effectsQuality: 'high',
      disableAnimations: false,
      lowPowerMode: false,
    });

    renderWithProviders(
      <EffectiveEffectsQualityProvider value="high">
        <DashboardLayout>
          <main>Dashboard content</main>
        </DashboardLayout>
      </EffectiveEffectsQualityProvider>
    );

    expect(screen.getByTestId('dashboard-wallpaper-accent-overlay')).not.toHaveStyle({
      mixBlendMode: 'multiply',
    });
    expect(screen.getByTestId('dashboard-wallpaper-readability-layer')).toHaveStyle({
      backgroundColor: 'rgba(249, 250, 251, 0.68)',
    });
  });

  it('preserves light wallpaper readability without an accent overlay in low effects mode', () => {
    useThemeStore.getState().setTheme('light');
    useThemeStore.getState().setWallpaper('/wallpapers/custom-room-shot.jpg');
    useSettingsStore.setState({ effectsQuality: 'low' });

    renderWithProviders(
      <EffectiveEffectsQualityProvider value="low">
        <DashboardLayout>
          <main>Dashboard content</main>
        </DashboardLayout>
      </EffectiveEffectsQualityProvider>
    );

    expect(screen.getByTestId('dashboard-wallpaper-image')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-wallpaper-accent-overlay')).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-wallpaper-readability-layer')).toHaveStyle({
      backgroundColor: 'rgba(249, 250, 251, 0.86)',
    });
  });
});
