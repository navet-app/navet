import type {
  DashboardComposition,
  DashboardController,
} from '@navet/app/features/dashboard/hooks/use-dashboard-controller.types';
import { useErrorStore } from '@navet/app/stores';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboardCollectionStore } from '../../dashboards/dashboard-collection-store';
import { useScreensaverStore } from '../../screensaver/screensaver-store';

const { getControllerMock, getProfileSyncMock, toastWarningMock } = vi.hoisted(() => ({
  getControllerMock: vi.fn(),
  getProfileSyncMock: vi.fn(),
  toastWarningMock: vi.fn(),
}));

vi.mock('../../hooks/use-dashboard-controller', () => ({
  useDashboardController: getControllerMock,
}));

vi.mock('../../hooks/use-dashboard-profile-sync', () => ({
  useDashboardProfileSync: getProfileSyncMock,
}));

vi.mock('../../components/dashboard-section-router', () => ({
  DashboardSectionRouter: () => <main>dashboard ready</main>,
}));

vi.mock('../../components/dashboard-overlays', () => ({
  DashboardOverlays: () => null,
}));

vi.mock('../../components/dashboard-arrival-reveal', () => ({
  DashboardArrivalReveal: () => null,
}));

vi.mock('sonner', () => ({
  toast: {
    warning: toastWarningMock,
  },
}));

import { DashboardPage } from '../index';

describe('DashboardPage loading recovery', () => {
  beforeEach(async () => {
    await resetAppStores();
    getControllerMock.mockReturnValue(createController());
    getProfileSyncMock.mockReturnValue({ profileLoadCompleted: true });
    toastWarningMock.mockReset();
  });

  afterEach(() => {
    getControllerMock.mockReset();
    getProfileSyncMock.mockReset();
  });

  it('does not render the loading devices spinner when dashboard loading is blocked', () => {
    renderWithProviders(<DashboardPage />);

    expect(screen.queryByText('Loading devices...')).not.toBeInTheDocument();
    expect(useErrorStore.getState().error?.message).toBe('Still loading devices');
  });

  it('sets the global error immediately when dashboard loading is blocked', () => {
    renderWithProviders(<DashboardPage />);

    expect(useErrorStore.getState().error?.message).toBe('Still loading devices');
    expect(useErrorStore.getState().error?.details).toContain(
      'Navet could not finish preparing the dashboard'
    );
  });

  it('does not set an error if the dashboard becomes ready before the grace period', () => {
    const controller = createController();
    getControllerMock.mockReturnValue(controller);
    const { rerender } = renderWithProviders(<DashboardPage />);

    getControllerMock.mockReturnValue(createController({ homeLayoutHydrated: true }));
    rerender(<DashboardPage />);

    expect(screen.getByText('dashboard ready')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#dashboard-main-content'
    );
  });

  it('waits for profile sync before rendering the dashboard shell', () => {
    getControllerMock.mockReturnValue(createController({ homeLayoutHydrated: true }));
    getProfileSyncMock.mockReturnValue({ profileLoadCompleted: false });

    renderWithProviders(<DashboardPage />);

    expect(screen.queryByText('dashboard ready')).not.toBeInTheDocument();
    expect(useErrorStore.getState().error).toBeNull();
  });

  it('clears the loading recovery error once the dashboard becomes ready', () => {
    const controller = createController();
    getControllerMock.mockReturnValue(controller);
    const { rerender } = renderWithProviders(<DashboardPage />);

    expect(useErrorStore.getState().error?.message).toBe('Still loading devices');

    getControllerMock.mockReturnValue(createController({ homeLayoutHydrated: true }));
    rerender(<DashboardPage />);

    expect(screen.getByText('dashboard ready')).toBeInTheDocument();
    expect(useErrorStore.getState().error).toBeNull();
  });

  it('keeps the connecting spinner while still connecting', () => {
    getControllerMock.mockReturnValue(createController({ connecting: true }));
    renderWithProviders(<DashboardPage />);

    expect(screen.getByText('Connecting to your smart home...')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#dashboard-main-content'
    );
    expect(useErrorStore.getState().error).toBeNull();
  });

  it('falls back cleanly and announces an unavailable direct dashboard link', () => {
    window.history.replaceState({}, '', '/dashboard/missing');
    getControllerMock.mockReturnValue(createController({ homeLayoutHydrated: true }));
    const locationChanged = vi.fn();
    window.addEventListener('location-changed', locationChanged);

    renderWithProviders(<DashboardPage />);

    expect(screen.getByText('dashboard ready')).toBeInTheDocument();
    expect(toastWarningMock).toHaveBeenCalledWith(
      'That dashboard is no longer available. Showing your default.',
      { id: 'dashboard-not-found' }
    );
    expect(window.location.pathname).toBe('/dashboard/home');
    expect(locationChanged).toHaveBeenCalledOnce();
    window.removeEventListener('location-changed', locationChanged);
  });

  it('does not replace a non-home route during dashboard profile startup', () => {
    window.history.replaceState({}, '', '/settings');
    getControllerMock.mockReturnValue(
      createController({ activeSection: 'settings', homeLayoutHydrated: true })
    );

    renderWithProviders(<DashboardPage />);

    expect(screen.getByText('dashboard ready')).toBeInTheDocument();
    expect(toastWarningMock).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/settings');
  });

  it('keeps the dashboard visible beneath the Add Entity backdrop', () => {
    getControllerMock.mockReturnValue(
      createController({ homeLayoutHydrated: true, showAddEntityDialog: true })
    );

    renderWithProviders(<DashboardPage />);

    const dashboard = screen.getByText('dashboard ready').parentElement;
    expect(dashboard).toHaveAttribute('aria-hidden', 'true');
    expect(dashboard).not.toHaveStyle({ visibility: 'hidden' });
    expect(dashboard).not.toHaveStyle({ contentVisibility: 'hidden' });
  });

  it('defers a remote dashboard assignment while screensaver mode is active', () => {
    const state = useDashboardCollectionStore.getState();
    state.createDashboard({ id: 'evening', name: 'Evening' });
    state.activateDashboard('home');
    useScreensaverStore.getState().start();
    useDashboardCollectionStore.setState({ pendingAssignedDashboardId: 'evening' });
    getControllerMock.mockReturnValue(createController({ homeLayoutHydrated: true }));
    renderWithProviders(<DashboardPage />);
    expect(useDashboardCollectionStore.getState().activeDashboardId).toBe('home');
    act(() => useScreensaverStore.getState().stop());
    expect(useDashboardCollectionStore.getState().activeDashboardId).toBe('evening');
  });

  it('defers a remote dashboard assignment while the companion editor is open', () => {
    const state = useDashboardCollectionStore.getState();
    state.createDashboard({ id: 'evening', name: 'Evening' });
    state.activateDashboard('home');
    useDashboardCollectionStore.setState({
      pendingAssignedDashboardId: 'evening',
      companionCustomizationOpen: true,
    });
    getControllerMock.mockReturnValue(createController({ homeLayoutHydrated: true }));
    renderWithProviders(<DashboardPage />);
    expect(useDashboardCollectionStore.getState().activeDashboardId).toBe('home');
    act(() => useDashboardCollectionStore.getState().setCompanionCustomizationOpen(false));
    expect(useDashboardCollectionStore.getState().activeDashboardId).toBe('evening');
  });

  it('does not let a stale dashboard link override an active non-home section', () => {
    window.history.replaceState({}, '', '/dashboard/missing');
    getControllerMock.mockReturnValue(
      createController({ activeSection: 'settings', homeLayoutHydrated: true })
    );

    renderWithProviders(<DashboardPage />);

    expect(toastWarningMock).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/dashboard/missing');
  });
});

function createController(overrides: Partial<DashboardController> = {}): DashboardComposition {
  const controller = {
    activeRoom: 'All',
    activeSection: 'home',
    addableEntityIds: [],
    allCustomCards: [],
    allEntityIds: [],
    allViewGrouping: 'custom',
    availableDeviceMap: new Map(),
    cardOrders: new Map(),
    cardSizes: {},
    cardZones: {},
    changeRoom: vi.fn(),
    customCards: [],
    deviceMap: new Map(),
    connecting: false,
    densePerformanceMode: false,
    denseVisibleCardCount: 0,
    dashboardRooms: [],
    devicesLoaded: true,
    handleAddCard: vi.fn(),
    handleAddLibraryCard: vi.fn(),
    handleAddEntity: vi.fn(),
    handleDeleteCard: vi.fn(),
    handleRemoveEntity: vi.fn(),
    handleUpdateCard: vi.fn(),
    hiddenEntityIds: [],
    hiddenRoomNames: [],
    homeLayout: {
      mode: 'personal',
      showHero: true,
      cardIds: ['light.missing'],
      sections: [],
      cardSectionAssignments: {},
    },
    homeLayoutHydrated: false,
    addHomeCard: vi.fn(),
    removeHomeCard: vi.fn(),
    moveHomeCard: vi.fn(),
    setHomeLayoutMode: vi.fn(),
    addHomeSection: vi.fn(),
    addHomeColumnSection: vi.fn(),
    addHomeSectionBelow: vi.fn(),
    moveHomeSection: vi.fn(),
    moveHomeColumn: vi.fn(),
    renameHomeSection: vi.fn(),
    removeHomeSection: vi.fn(),
    resizeHomeSection: vi.fn(),
    isEditMode: false,
    lightDeviceMap: new Map(),
    lightRooms: [],
    onToggleEditMode: vi.fn(),
    orderedCardIds: [],
    onSetRoomOrder: vi.fn(),
    onSetAllViewGrouping: vi.fn(),
    onSetHiddenRoomNames: vi.fn(),
    roomHiddenItemCounts: new Map(),
    roomItemCounts: new Map(),
    rooms: [],
    sectionData: {
      isOverviewSection: true,
      energyCustomCards: [],
      energyOrderedCardIds: [],
      hiddenLightEntityIds: [],
      allLightDeviceMap: new Map(),
      climateDeviceMap: new Map(),
      allClimateDeviceMap: new Map(),
      hiddenClimateEntityIds: [],
      climateSections: [],
    },
    setActiveSection: vi.fn(),
    updateCardSize: vi.fn(),
    updateCardZone: vi.fn(),
    showAddCardDialog: false,
    showAddEntityDialog: false,
    showDeviceSettingsDialog: false,
    addCardTargetSectionId: undefined,
    selectedDevice: null,
    selectedCardType: null,
    closeAddCardDialog: vi.fn(),
    closeAddEntityDialog: vi.fn(),
    closeDeviceSettingsDialog: vi.fn(),
    openAddCardDialog: vi.fn(),
    openAddEntityDialog: vi.fn(),
    openDeviceSettingsDialog: vi.fn(),
    dashboardArrivalVariant: null,
    isOnboardingClosing: false,
    isOnboardingOpen: false,
    onCloseOnboarding: vi.fn(),
    onDismissImportedDashboardReveal: vi.fn(),
    onFinishOnboarding: vi.fn(),
    onOpenOnboarding: vi.fn(),
    showImportedDashboardReveal: false,
    ...overrides,
  } as DashboardController;
  return {
    page: controller,
    overlays: controller,
    section: controller,
  };
}
