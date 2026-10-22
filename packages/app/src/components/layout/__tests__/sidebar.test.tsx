import { Sidebar } from '@navet/app/components/layout/sidebar';
import {
  createDashboardDefinition,
  createLegacyDashboardCollection,
  sanitizeDashboardCollection,
} from '@navet/app/features/dashboard/dashboards/dashboard-collection';
import { useDashboardCollectionStore } from '@navet/app/features/dashboard/dashboards/dashboard-collection-store';
import type { NavetHomeAssistantShellListener } from '@navet/app/infrastructure/home-assistant/runtime/navet-ha-shell-api';
import { NAVET_HOME_ASSISTANT_SHELL_GLOBAL } from '@navet/app/infrastructure/home-assistant/runtime/navet-ha-shell-api';
import { resetRuntimeContextForTests } from '@navet/app/infrastructure/home-assistant/runtime/runtime-detector';
import { useEditModeStore, useNavigationStore, useSettingsStore } from '@navet/app/stores';
import { setMediaQueryMatch } from '@navet/app/test/browser-mocks';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mobileRoomNavigation = {
  activeRoom: 'Living room',
  onRoomChange: () => {},
  rooms: ['Living room', 'Kitchen'],
};

describe('Sidebar mobile navigation', () => {
  beforeEach(async () => {
    await resetAppStores();
    setMediaQueryMatch('(max-width: 767px)', true);
    window.__NAVET_PANEL__ = false;
    resetRuntimeContextForTests();
    vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  function getMobileDock(container: HTMLElement) {
    const dock = container.querySelector<HTMLElement>('.mobile-bottom-dock-offset');

    if (!dock) {
      throw new Error('Mobile dock not found');
    }

    return dock;
  }

  function setParentHomeAssistantShell({
    href = 'http://ha.local:8123/navet',
    locationAssign = vi.fn(),
    openSidebar = vi.fn(async () => true),
    setKioskEnabled = vi.fn(async () => true),
    kioskEnabled = false,
    includeShell = true,
    panel = true,
  }: {
    href?: string;
    locationAssign?: (href: string) => void;
    openSidebar?: () => Promise<boolean>;
    setKioskEnabled?: (enabled: boolean) => Promise<boolean>;
    kioskEnabled?: boolean;
    includeShell?: boolean;
    panel?: boolean;
  } = {}) {
    const parentDocument = document.implementation.createHTMLDocument('ha-parent');
    const homeAssistantRoot = parentDocument.createElement('home-assistant') as HTMLElement & {
      hass?: Record<string, unknown>;
    };
    const homeAssistantShadowRoot = homeAssistantRoot.attachShadow({ mode: 'open' });
    const homeAssistantMain = parentDocument.createElement('home-assistant-main');
    const homeAssistantMainShadowRoot = homeAssistantMain.attachShadow({ mode: 'open' });
    const drawer = parentDocument.createElement('ha-drawer');
    const drawerShadowRoot = drawer.attachShadow({ mode: 'open' });
    const layout = parentDocument.createElement('div');
    const sidebarShell = parentDocument.createElement('div');
    const appContent = parentDocument.createElement('div');
    const sidebarSlot = parentDocument.createElement('slot');
    const appContentSlot = parentDocument.createElement('slot');
    const sidebar = parentDocument.createElement('ha-sidebar');
    const panelResolver = parentDocument.createElement('partial-panel-resolver');
    const panelApp = parentDocument.createElement('ha-panel-app');
    const panelAppShadowRoot = panelApp.attachShadow({ mode: 'open' });
    const panelAppHeader = parentDocument.createElement('div');
    const panelAppFrame = parentDocument.createElement('iframe');

    homeAssistantRoot.hass = {
      states: { 'light.kitchen': { entity_id: 'light.kitchen', state: 'on' } },
      config: { location_name: 'Parent Home' },
      user: { name: 'Parent User' },
      connection: {
        sendMessagePromise: vi.fn(async () => ({ ok: true })),
        subscribeMessage: vi.fn(async () => vi.fn()),
      },
      callService: vi.fn(async () => undefined),
      callWS: vi.fn(async () => ({ ok: true })),
    };

    layout.className = 'layout';
    sidebarShell.className = 'sidebar-shell';
    appContent.className = 'app-content';
    panelResolver.slot = 'appContent';
    panelAppHeader.className = 'header';
    panelAppHeader.textContent = 'Navet';
    panelAppFrame.className = 'loaded';

    sidebarShell.append(sidebarSlot);
    appContent.append(appContentSlot);
    panelAppShadowRoot.append(panelAppHeader, panelAppFrame);
    panelResolver.append(panelApp);
    layout.append(sidebarShell, appContent);
    drawerShadowRoot.append(layout);
    drawer.append(sidebar, panelResolver);
    homeAssistantMainShadowRoot.append(drawer);
    homeAssistantShadowRoot.append(homeAssistantMain);
    parentDocument.body.append(homeAssistantRoot);

    const parentWindowValue: Window & typeof globalThis = {
      document: parentDocument,
      location: { href, origin: 'http://ha.local:8123', assign: locationAssign },
    } as Window & typeof globalThis;

    if (includeShell) {
      parentWindowValue[NAVET_HOME_ASSISTANT_SHELL_GLOBAL] = {
        available: true,
        getSnapshot: () => ({ active: true, available: true, kioskEnabled }),
        isKioskEnabled: () => kioskEnabled,
        setKioskEnabled,
        openSidebar,
        navigateHome: vi.fn(async () => {
          locationAssign('/');
          return true;
        }),
        subscribe: (listener: NavetHomeAssistantShellListener) => {
          listener({ active: true, available: true, kioskEnabled });
          return () => {};
        },
      };
    }

    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: parentWindowValue,
    });

    window.__NAVET_PANEL__ = panel;
    resetRuntimeContextForTests();

    return {
      appContent,
      drawer,
      locationAssign,
      openSidebar,
      panelAppHeader,
      parentDocument,
      setKioskEnabled,
      sidebar,
      sidebarShell,
    };
  }

  it('renders a more launcher that exposes household, climate, lights, and media', () => {
    const { container } = renderWithProviders(
      <Sidebar mobileRoomNavigation={mobileRoomNavigation} />
    );
    const dock = getMobileDock(container);

    fireEvent.click(within(dock).getByRole('button', { name: 'More' }));

    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('button', { name: /^Household/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^Climate/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^Lights/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^Media/ })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /^Household/ }));

    expect(useNavigationStore.getState().activeSection).toBe('tasks');
    expect(screen.queryByText('Recent sections')).not.toBeInTheDocument();
  });

  it('labels the household destination as routines when chores are disabled', () => {
    useSettingsStore.getState().updateSettings({ choresEnabled: false });
    const { container } = renderWithProviders(
      <Sidebar mobileRoomNavigation={mobileRoomNavigation} />
    );

    fireEvent.click(within(getMobileDock(container)).getByRole('button', { name: 'More' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /^Routines/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^Household/ })).not.toBeInTheDocument();
  });

  it('renders home, more, and search in the centered dock', () => {
    const { container } = renderWithProviders(
      <Sidebar mobileRoomNavigation={mobileRoomNavigation} />
    );
    const dock = getMobileDock(container);

    expect(within(dock).getByRole('button', { name: 'Living room' })).toBeInTheDocument();
    expect(within(dock).getByRole('button', { name: 'More' })).toBeInTheDocument();
    expect(within(dock).getByRole('button', { name: 'Search' })).toBeInTheDocument();
    expect(within(dock).queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('adds dashboards above rooms in the mobile Home menu only when multiple exist', async () => {
    const home = createDashboardDefinition({ id: 'home', name: 'Home' });
    const upstairs = createDashboardDefinition({ id: 'upstairs', name: 'Upstairs lights' });
    useDashboardCollectionStore.setState({
      collection: sanitizeDashboardCollection(
        {
          schemaVersion: 1,
          defaultDashboardId: 'home',
          order: ['home', 'upstairs'],
          dashboardsById: { home, upstairs },
          dashboardIdByClientId: {},
        },
        createLegacyDashboardCollection({ homeLayout: null })
      ),
      activeDashboardId: 'home',
    });

    renderWithProviders(<Sidebar mobileRoomNavigation={mobileRoomNavigation} />);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Rooms' }));

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Upstairs lights/ })).toBeInTheDocument();
    expect(within(menu).getByText('Rooms')).toBeInTheDocument();
    const menuText = menu.textContent ?? '';
    expect(menuText.indexOf('Dashboards')).toBeLessThan(menuText.indexOf('Rooms'));
  });

  it('closes the more sheet after section selection', () => {
    const { container } = renderWithProviders(
      <Sidebar mobileRoomNavigation={mobileRoomNavigation} />
    );
    const dock = getMobileDock(container);

    fireEvent.click(within(dock).getByRole('button', { name: 'More' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Media/ }));

    expect(useNavigationStore.getState().activeSection).toBe('media');
    expect(screen.queryByText('Sections')).not.toBeInTheDocument();
  });

  it('does not render recent sections or current room in the more sheet', () => {
    const { container } = renderWithProviders(
      <Sidebar mobileRoomNavigation={mobileRoomNavigation} />
    );
    const dock = getMobileDock(container);

    fireEvent.click(within(dock).getByRole('button', { name: 'More' }));

    expect(screen.queryByText('Recent sections')).not.toBeInTheDocument();
    expect(screen.queryByText('Current room')).not.toBeInTheDocument();
  });

  it('renders saved custom sidebar actions in the more sheet when advanced customization is enabled', () => {
    useSettingsStore.getState().updateSettings({
      advancedCustomizationEnabled: true,
      customSidebarActions: [
        {
          id: 'movie-status',
          label: 'Movie status',
          icon: 'link',
          targetType: 'url',
          targetUrl: 'https://example.com/status',
          visibility: 'always',
        },
      ],
    });

    const { container } = renderWithProviders(
      <Sidebar mobileRoomNavigation={mobileRoomNavigation} />
    );
    const dock = getMobileDock(container);

    fireEvent.click(within(dock).getByRole('button', { name: 'More' }));

    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: /^Movie status/ })
    ).toBeInTheDocument();
  });

  it('navigates to embedded custom sidebar actions from the more sheet without opening a new tab', () => {
    useSettingsStore.getState().updateSettings({
      advancedCustomizationEnabled: true,
      customSidebarActions: [
        {
          id: 'movie-status',
          label: 'Movie status',
          icon: 'link',
          targetType: 'iframe',
          targetUrl: 'https://example.com/status',
          visibility: 'always',
        },
      ],
    });

    const { container } = renderWithProviders(
      <Sidebar mobileRoomNavigation={mobileRoomNavigation} />
    );
    const dock = getMobileDock(container);

    fireEvent.click(within(dock).getByRole('button', { name: 'More' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /^Movie status/ })
    );

    expect(useNavigationStore.getState().activeCustomSidebarActionId).toBe('movie-status');
    expect(window.open).not.toHaveBeenCalled();
  });

  it('renders a customize sidebar action in the more sheet', () => {
    useEditModeStore.getState().setEditMode(true);
    const { container } = renderWithProviders(
      <Sidebar mobileRoomNavigation={mobileRoomNavigation} />
    );
    const dock = getMobileDock(container);

    fireEvent.click(within(dock).getByRole('button', { name: 'More' }));

    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: /^Customize sidebar/ })
    ).toBeInTheDocument();
  });

  it('does not render the desktop customize sidebar button outside edit mode', () => {
    setMediaQueryMatch('(max-width: 767px)', false);

    renderWithProviders(<Sidebar mobileRoomNavigation={mobileRoomNavigation} />);

    expect(screen.queryByRole('button', { name: 'Customize sidebar' })).not.toBeInTheDocument();
  });

  it('renders a pencil affordance for custom desktop sidebar actions in edit mode', () => {
    setMediaQueryMatch('(max-width: 767px)', false);
    useEditModeStore.getState().setEditMode(true);
    useSettingsStore.getState().updateSettings({
      advancedCustomizationEnabled: true,
      customSidebarActions: [
        {
          id: 'movie-status',
          label: 'Movie status',
          icon: 'link',
          targetType: 'url',
          targetUrl: 'https://example.com/status',
          visibility: 'always',
        },
      ],
    });

    renderWithProviders(<Sidebar mobileRoomNavigation={mobileRoomNavigation} />);

    expect(screen.getByRole('button', { name: 'Edit Movie status' })).toBeInTheDocument();
  });

  it('uses compact desktop rail spacing when custom actions would crowd the sidebar', () => {
    setMediaQueryMatch('(max-width: 767px)', false);
    useEditModeStore.getState().setEditMode(true);
    useSettingsStore.getState().updateSettings({
      advancedCustomizationEnabled: true,
      customSidebarActions: Array.from({ length: 4 }, (_, index) => ({
        id: `custom-action-${index}`,
        label: `Custom action ${index + 1}`,
        icon: 'link',
        targetType: 'url' as const,
        targetUrl: `https://example.com/${index}`,
        visibility: 'always' as const,
      })),
    });

    renderWithProviders(<Sidebar mobileRoomNavigation={mobileRoomNavigation} />);

    expect(screen.getByTestId('desktop-sidebar')).toHaveAttribute('data-density', 'compact');
    expect(screen.getByRole('button', { name: 'Customize sidebar' })).toBeInTheDocument();
  });

  it('uses compact desktop rail spacing on short screens', () => {
    setMediaQueryMatch('(max-width: 767px)', false);
    setMediaQueryMatch('(max-height: 800px)', true);

    renderWithProviders(<Sidebar mobileRoomNavigation={mobileRoomNavigation} />);

    const desktopSidebar = screen.getByTestId('desktop-sidebar');
    expect(desktopSidebar).toHaveAttribute('data-density', 'compact');
    expect(within(desktopSidebar).getByRole('button', { name: 'Home' })).toHaveClass(
      'h-10',
      'w-10'
    );
  });

  it('opens external-link custom sidebar actions in a new tab on desktop', () => {
    setMediaQueryMatch('(max-width: 767px)', false);
    useSettingsStore.getState().updateSettings({
      advancedCustomizationEnabled: true,
      customSidebarActions: [
        {
          id: 'movie-status',
          label: 'Movie status',
          icon: 'link',
          targetType: 'url',
          targetUrl: 'https://example.com/status',
          visibility: 'always',
        },
      ],
    });

    renderWithProviders(<Sidebar mobileRoomNavigation={mobileRoomNavigation} />);

    fireEvent.click(screen.getByRole('button', { name: 'Movie status' }));

    expect(window.open).toHaveBeenCalledWith(
      'https://example.com/status',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('opens the customization dialog instead of triggering a custom desktop sidebar action in edit mode', async () => {
    setMediaQueryMatch('(max-width: 767px)', false);
    useEditModeStore.getState().setEditMode(true);
    useSettingsStore.getState().updateSettings({
      advancedCustomizationEnabled: true,
      customSidebarActions: [
        {
          id: 'movie-status',
          label: 'Movie status',
          icon: 'link',
          targetType: 'section',
          targetSection: 'media',
          visibility: 'always',
        },
      ],
    });

    renderWithProviders(<Sidebar mobileRoomNavigation={mobileRoomNavigation} />);

    fireEvent.click(screen.getByRole('button', { name: 'Movie status' }));

    expect(useNavigationStore.getState().activeSection).toBe('home');
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getAllByText('Edit sidebar action').length).toBeGreaterThan(0);
    expect(within(dialog).getByDisplayValue('Movie status')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('does not render a customize sidebar action in the more sheet outside edit mode', () => {
    const { container } = renderWithProviders(
      <Sidebar mobileRoomNavigation={mobileRoomNavigation} />
    );
    const dock = getMobileDock(container);

    fireEvent.click(within(dock).getByRole('button', { name: 'More' }));

    expect(
      within(screen.getByRole('dialog')).queryByRole('button', { name: /^Customize sidebar/ })
    ).not.toBeInTheDocument();
  });

  it('renders the desktop Home Assistant kiosk toggle when the parent shell is available in panel mode', () => {
    setMediaQueryMatch('(max-width: 767px)', false);

    renderWithProviders(<Sidebar mobileRoomNavigation={mobileRoomNavigation} />);
    expect(
      screen.queryByRole('button', { name: 'Toggle Home Assistant kiosk' })
    ).not.toBeInTheDocument();

    setParentHomeAssistantShell();
    renderWithProviders(<Sidebar mobileRoomNavigation={mobileRoomNavigation} />);
    expect(screen.getByRole('button', { name: 'Toggle Home Assistant kiosk' })).toBeInTheDocument();
  });

  it('renders the desktop Home Assistant kiosk toggle when the parent shell is available in add-on mode', () => {
    setMediaQueryMatch('(max-width: 767px)', false);
    window.history.replaceState({}, '', '/api/hassio_ingress/navet_dev/dashboard');
    setParentHomeAssistantShell({ panel: false });

    renderWithProviders(<Sidebar mobileRoomNavigation={mobileRoomNavigation} />);

    expect(screen.getByRole('button', { name: 'Toggle Home Assistant kiosk' })).toBeInTheDocument();
  });

  it('renders the desktop Home Assistant kiosk toggle in add-on mode without the parent shell module', () => {
    setMediaQueryMatch('(max-width: 767px)', false);
    window.history.replaceState({}, '', '/api/hassio_ingress/navet_dev/dashboard');
    setParentHomeAssistantShell({ includeShell: false, panel: false });

    renderWithProviders(<Sidebar mobileRoomNavigation={mobileRoomNavigation} />);

    expect(screen.getByRole('button', { name: 'Toggle Home Assistant kiosk' })).toBeInTheDocument();
  });

  it('toggles Home Assistant kiosk from the desktop sidebar in add-on mode', () => {
    setMediaQueryMatch('(max-width: 767px)', false);
    window.history.replaceState({}, '', '/api/hassio_ingress/navet_dev/dashboard');
    const setKioskEnabled = vi.fn(async () => true);
    setParentHomeAssistantShell({ panel: false, setKioskEnabled, kioskEnabled: false });

    renderWithProviders(<Sidebar mobileRoomNavigation={mobileRoomNavigation} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Toggle Home Assistant kiosk' }));
    });
    expect(setKioskEnabled).toHaveBeenCalledWith(true);
  });

  it('toggles the direct parent DOM fallback from the desktop sidebar in add-on mode', () => {
    setMediaQueryMatch('(max-width: 767px)', false);
    window.history.replaceState({}, '', '/api/hassio_ingress/navet_dev/dashboard');
    const { appContent, drawer, panelAppHeader, sidebar, sidebarShell } =
      setParentHomeAssistantShell({
        includeShell: false,
        panel: false,
      });

    renderWithProviders(<Sidebar mobileRoomNavigation={mobileRoomNavigation} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Toggle Home Assistant kiosk' }));
    });

    expect(sidebar.style.display).toBe('none');
    expect(sidebarShell.style.display).toBe('none');
    expect(drawer.style.getPropertyValue('--ha-sidebar-width')).toBe('0px');
    expect(appContent.style.paddingLeft).toBe('0px');
    expect(panelAppHeader.style.display).toBe('none');
  });

  it('navigates back to Home Assistant from the mobile more sheet in add-on mode', () => {
    window.history.replaceState({}, '', '/api/hassio_ingress/navet_dev/dashboard');
    const setKioskEnabled = vi.fn(async () => true);
    const locationAssign = vi.fn();
    setParentHomeAssistantShell({
      panel: false,
      setKioskEnabled,
      kioskEnabled: false,
      locationAssign,
    });

    const { container } = renderWithProviders(
      <Sidebar mobileRoomNavigation={mobileRoomNavigation} />
    );
    const dock = getMobileDock(container);

    fireEvent.click(within(dock).getByRole('button', { name: 'More' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Exit to Home Assistant',
      })
    );

    expect(locationAssign).toHaveBeenCalledWith('/');
    expect(setKioskEnabled).not.toHaveBeenCalled();
  });

  it('uses parent-location navigation in the mobile more sheet when the shell API is unavailable', () => {
    window.history.replaceState({}, '', '/api/hassio_ingress/navet_dev/dashboard');
    const { locationAssign } = setParentHomeAssistantShell({
      includeShell: false,
      panel: false,
    });

    const { container } = renderWithProviders(
      <Sidebar mobileRoomNavigation={mobileRoomNavigation} />
    );
    const dock = getMobileDock(container);

    fireEvent.click(within(dock).getByRole('button', { name: 'More' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Exit to Home Assistant',
      })
    );

    expect(locationAssign).toHaveBeenCalledWith('/');
  });
  it('keeps companion collapse independent from the existing Home Assistant control', () => {
    setMediaQueryMatch('(max-width: 767px)', false);
    const originalParent = window.parent;
    const originalPanel = window.__NAVET_PANEL__;
    const setKioskEnabled = vi.fn(async () => true);
    setParentHomeAssistantShell({ setKioskEnabled });
    const toggleCompanion = vi.fn();
    const { unmount } = renderWithProviders(
      <Sidebar
        companionExpanded
        onToggleCompanion={toggleCompanion}
        companion={<p>Home overview</p>}
      />
    );
    const companionToggle = screen.getByRole('button', { name: 'Hide side panel' });
    const homeAssistantToggle = screen.getByRole('button', { name: 'Toggle Home Assistant kiosk' });
    expect(companionToggle).toHaveAttribute('aria-expanded', 'true');
    expect(companionToggle).not.toHaveAttribute('aria-pressed');
    expect(companionToggle.querySelector('svg')?.innerHTML).not.toBe(
      homeAssistantToggle.querySelector('svg')?.innerHTML
    );
    fireEvent.click(companionToggle);
    expect(toggleCompanion).toHaveBeenCalledOnce();
    expect(setKioskEnabled).not.toHaveBeenCalled();
    unmount();
    Object.defineProperty(window, 'parent', { configurable: true, value: originalParent });
    window.__NAVET_PANEL__ = originalPanel;
    resetRuntimeContextForTests();
  });
});
