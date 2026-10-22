import { getDashboardClientIdentity } from '@navet/app/features/dashboard/clients/dashboard-client-identity';
import { useDashboardProfileRuntimeStore } from '@navet/app/features/dashboard/clients/dashboard-profile-runtime-store';
import { emptyDeviceDisplayProfilePolicy } from '@navet/app/features/dashboard/clients/device-display-profile';
import { useDeviceDisplayProfileRuntimeStore } from '@navet/app/features/dashboard/clients/device-display-profile-runtime-store';
import { getSettingsSectionStyles } from '@navet/app/features/settings/hooks/settings-section-styles';
import type { SettingsSectionController } from '@navet/app/features/settings/hooks/use-settings-section-controller';
import { resetRuntimeContextForTests } from '@navet/app/infrastructure/home-assistant/runtime/runtime-detector';
import { renderWithProviders } from '@navet/app/test/render';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsSystemSection } from '../settings-system-section';

function createController(): SettingsSectionController {
  return {
    activeProviderId: 'home_assistant',
    config: { url: 'https://ha.example.com' },
    confirmLogout: vi.fn(),
    customPrimaryColor: null,
    disableAnimations: false,
    effectsQuality: 'high',
    effectsQualityUserOverride: false,
    entityInteractionMode: 'toggle-first',
    followSystemTheme: false,
    setFollowSystemTheme: vi.fn(),
    handleConnectProvider: vi.fn(),
    handleDisconnectProvider: vi.fn(),
    handleExportDashboardConfig: vi.fn(),
    handleImportDashboardConfig: vi.fn(),
    handleLogout: vi.fn(),
    handleResetLocalSettings: vi.fn(),
    handleRemoveWallpaper: vi.fn(),
    handleResetConnection: vi.fn(),
    handleRestartOnboarding: vi.fn(),
    handleSelectWallpaper: vi.fn(),
    handleWallpaperUpload: vi.fn(),
    hiddenEntityIds: [],
    importInputRef: { current: null },
    kioskMode: false,
    keepDeviceAwake: false,
    language: 'en',
    languageOptions: [],
    lowPowerMode: false,
    manualTheme: 'glass',
    primaryColor: 'yellow',
    providerCards: [
      {
        id: 'home_assistant',
        label: 'Home Assistant',
        loginMode: 'url_oauth',
        status: 'connected',
        isActive: true,
        isConnected: true,
        canConnect: true,
        canDisconnect: true,
        baseUrl: 'https://ha.example.com',
        error: null,
        implementationStatus: 'implemented',
        featureMatrix: {
          rooms: true,
          lighting: true,
          sensors: true,
          climate: true,
          mediaControls: true,
          mediaBrowse: true,
          mediaArtwork: true,
          cameraSnapshot: true,
          cameraStreams: true,
          energyNow: true,
          calendar: true,
          weather: true,
          notifications: true,
        },
      },
      {
        id: 'homey',
        label: 'Homey',
        loginMode: 'oauth',
        status: 'disconnected',
        isActive: false,
        isConnected: false,
        canConnect: true,
        canDisconnect: false,
        baseUrl: null,
        error: null,
        implementationStatus: 'implemented',
        featureMatrix: {
          rooms: true,
          lighting: true,
          sensors: true,
          climate: false,
          mediaControls: false,
          mediaBrowse: false,
          mediaArtwork: false,
          cameraSnapshot: false,
          cameraStreams: false,
          energyNow: false,
          calendar: false,
          weather: false,
          notifications: false,
        },
      },
      {
        id: 'openhab',
        label: 'openHAB',
        loginMode: 'url_session',
        status: 'disconnected',
        isActive: false,
        isConnected: false,
        canConnect: true,
        canDisconnect: false,
        baseUrl: null,
        error: null,
        implementationStatus: 'implemented',
        featureMatrix: {
          rooms: false,
          lighting: false,
          sensors: false,
          climate: false,
          mediaControls: false,
          mediaBrowse: false,
          mediaArtwork: false,
          cameraSnapshot: false,
          cameraStreams: false,
          energyNow: false,
          calendar: false,
          weather: false,
          notifications: false,
        },
      },
    ],
    reopenOnboarding: vi.fn(),
    setActiveProvider: vi.fn(),
    setCustomPrimaryColor: vi.fn(),
    setPrimaryColor: vi.fn(),
    setShowLicense: vi.fn(),
    setShowLogoutConfirm: vi.fn(),
    setShowRestartOnboardingConfirm: vi.fn(),
    setShowRestoreEntities: vi.fn(),
    setShowTerms: vi.fn(),
    setTheme: vi.fn(),
    showHomeSummaryBar: true,
    showLicense: false,
    showLogoutConfirm: false,
    showRestartOnboardingConfirm: false,
    showRestoreEntities: false,
    showTerms: false,
    styles: getSettingsSectionStyles('glass', 'yellow'),
    temperatureUnit: 'celsius',
    theme: 'glass',
    themeOptions: [],
    colorOptions: [],
    updateSettings: vi.fn(),
    use24HourTime: true,
    wallpaper: null,
    ambientLightBleed: true,
  } as unknown as SettingsSectionController;
}

describe('SettingsSystemSection', () => {
  let controller: SettingsSectionController;

  it('explains when a signed-in Homey hub is offline', () => {
    const offlineController = createController();
    offlineController.providerCards = offlineController.providerCards.map((provider) =>
      provider.id === 'homey'
        ? {
            ...provider,
            status: 'offline',
            isConnected: true,
            baseUrl: 'https://homey.example.com',
            error: null,
          }
        : provider
    );

    renderWithProviders(<SettingsSystemSection controller={offlineController} />);

    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(
      screen.getByText('Homey is offline or unreachable. Check the hub and network connection.')
    ).toBeInTheDocument();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useDashboardProfileRuntimeStore.getState().reset();
    useDeviceDisplayProfileRuntimeStore.setState({
      error: null,
      lastSyncedAt: null,
      loaded: false,
      policy: emptyDeviceDisplayProfilePolicy(),
      revision: 0,
      status: 'disabled',
    });
    const client = getDashboardClientIdentity({
      environment: { userAgent: 'Mozilla/5.0 (iPhone; Mobile)' },
      now: () => new Date('2026-07-25T08:00:00.000Z'),
      randomUUID: () => '12345678-1234-1234-1234-123456785555',
    });
    useDashboardProfileRuntimeStore.getState().setClient(client);
    controller = createController();
  });

  afterEach(() => {
    window.__NAVET_PANEL__ = undefined;
    window.__NAVET_CONFIG__ = undefined;
    resetRuntimeContextForTests();
  });

  it('shows connected providers immediately and keeps disconnected ones in provider management', () => {
    renderWithProviders(<SettingsSystemSection controller={controller} />);

    expect(screen.getByText('Providers')).toBeInTheDocument();
    expect(screen.getByText('Home Assistant')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument();
    const providerActions = screen.getByRole('button', { name: 'More actions: Home Assistant' });
    expect(providerActions).toHaveClass('self-center');
    fireEvent.pointerDown(providerActions);
    expect(screen.getByRole('menuitem', { name: 'Open' })).toHaveAttribute(
      'href',
      'https://ha.example.com'
    );
    expect(screen.getByRole('menuitem', { name: 'Edit URL' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Disconnect' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manage 2 other providers' })).toBeInTheDocument();
    expect(screen.queryByText('openHAB')).not.toBeInTheDocument();
    expect(screen.queryByText('Camera live streams')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View supported entities' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Manage 2 other providers' }));

    expect(screen.getByText('Homey')).toBeInTheDocument();
    expect(screen.getByText('openHAB')).toBeInTheDocument();
    expect(screen.getAllByText('Not connected on this device').length).toBeGreaterThan(0);
    const connectedBadge = screen.getAllByText('Connected')[0];
    expect(connectedBadge).toBeInTheDocument();
    expect(connectedBadge).toHaveClass(
      'rounded-full',
      'border',
      'px-2',
      'py-0.5',
      'text-[10px]',
      'border-emerald-500/30',
      'bg-emerald-500/10'
    );
    expect(screen.queryByText('Primary')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make primary' })).not.toBeInTheDocument();
    expect(screen.queryByText('Lighting')).not.toBeInTheDocument();
    expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View supported entities' })).not.toBeInTheDocument();
  });

  it.each([
    ['Home Assistant add-on', () => (window.__NAVET_CONFIG__ = { runtime: 'ha-ingress' })],
    ['HACS panel', () => (window.__NAVET_PANEL__ = true)],
  ])('hides Homey and openHAB for a %s installation', (_installation, configureRuntime) => {
    configureRuntime();
    resetRuntimeContextForTests();

    renderWithProviders(<SettingsSystemSection controller={controller} />);

    expect(screen.getByText('Home Assistant')).toBeInTheDocument();
    expect(screen.queryByText('Homey')).not.toBeInTheDocument();
    expect(screen.queryByText('openHAB')).not.toBeInTheDocument();
    expect(screen.queryByText('Authorized devices')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh now' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Manage .* other providers/ })
    ).not.toBeInTheDocument();
  });

  it.each([
    ['home_assistant', 'Home Assistant'],
    ['homey', 'Homey'],
    ['openhab', 'openHAB'],
  ] as const)('requires confirmation before disconnecting %s', async (providerId, label) => {
    controller.providerCards = controller.providerCards.map((provider) =>
      provider.id === providerId
        ? { ...provider, isConnected: true, canDisconnect: true, status: 'connected' }
        : provider
    );
    renderWithProviders(<SettingsSystemSection controller={controller} />);

    fireEvent.pointerDown(screen.getByRole('button', { name: `More actions: ${label}` }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Disconnect' }));

    expect(screen.getByRole('alertdialog', { name: `Disconnect ${label}?` })).toBeInTheDocument();
    expect(
      screen.getByText(
        `This disconnects ${label} on all connected devices. You can connect it again later.`
      )
    ).toBeInTheDocument();
    expect(controller.handleDisconnectProvider).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(controller.handleDisconnectProvider).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByRole('button', { name: `More actions: ${label}` }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Disconnect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    expect(controller.handleDisconnectProvider).toHaveBeenCalledExactlyOnceWith(providerId);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('starts a fresh Home Assistant connection from its current address', async () => {
    renderWithProviders(<SettingsSystemSection controller={controller} />);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions: Home Assistant' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit URL' }));
    const urlInput = screen.getByLabelText('URL');
    expect(urlInput).toHaveValue('https://ha.example.com');
    fireEvent.change(urlInput, {
      target: { value: 'http://100.77.118.32:8123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(controller.handleConnectProvider).toHaveBeenCalledWith(
      'home_assistant',
      'http://100.77.118.32:8123',
      undefined,
      undefined
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('uses the configured Home Assistant URL when the connected provider omits its base URL', () => {
    controller.providerCards = controller.providerCards.map((provider) =>
      provider.id === 'home_assistant' ? { ...provider, baseUrl: null } : provider
    );

    renderWithProviders(<SettingsSystemSection controller={controller} />);

    expect(screen.getByText('https://ha.example.com')).toBeInTheDocument();
  });

  it('shows all connected providers without hiding them behind provider management', async () => {
    controller.providerCards = [
      {
        id: 'home_assistant',
        label: 'Home Assistant',
        loginMode: 'url_oauth',
        status: 'connected',
        isActive: false,
        isConnected: true,
        canConnect: true,
        canDisconnect: true,
        baseUrl: 'https://ha.example.com',
        error: null,
        implementationStatus: 'implemented',
        featureMatrix: {
          rooms: true,
          lighting: true,
          sensors: true,
          climate: true,
          mediaControls: true,
          mediaBrowse: true,
          mediaArtwork: true,
          cameraSnapshot: true,
          cameraStreams: true,
          energyNow: true,
          calendar: true,
          weather: true,
          notifications: true,
        },
      },
      {
        id: 'homey',
        label: 'Homey',
        loginMode: 'oauth',
        status: 'connected',
        isActive: true,
        isConnected: true,
        canConnect: true,
        canDisconnect: true,
        baseUrl: 'https://homey.example.com',
        error: null,
        implementationStatus: 'implemented',
        featureMatrix: {
          rooms: true,
          lighting: true,
          sensors: true,
          climate: false,
          mediaControls: false,
          mediaBrowse: false,
          mediaArtwork: false,
          cameraSnapshot: false,
          cameraStreams: false,
          energyNow: false,
          calendar: false,
          weather: false,
          notifications: false,
        },
      },
    ] as typeof controller.providerCards;

    renderWithProviders(<SettingsSystemSection controller={controller} />);

    expect(screen.getByText('Home Assistant')).toBeInTheDocument();
    expect(screen.getByText('Homey')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Manage .* other providers/ })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Primary')).not.toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions: Home Assistant' }));
    expect(screen.getByRole('menuitem', { name: 'Open' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Make primary' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Disconnect' }));
    expect(controller.handleDisconnectProvider).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(controller.handleDisconnectProvider).toHaveBeenCalledWith('home_assistant');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('submits a Home Assistant URL and disconnects connected providers', async () => {
    controller.providerCards = [
      {
        id: 'home_assistant',
        label: 'Home Assistant',
        loginMode: 'url_oauth',
        status: 'disconnected',
        isActive: true,
        isConnected: false,
        canConnect: true,
        canDisconnect: false,
        baseUrl: null,
        error: null,
        implementationStatus: 'implemented',
        featureMatrix: {
          rooms: true,
          lighting: true,
          sensors: true,
          climate: true,
          mediaControls: true,
          mediaBrowse: true,
          mediaArtwork: true,
          cameraSnapshot: true,
          cameraStreams: true,
          energyNow: true,
          calendar: true,
          weather: true,
          notifications: true,
        },
      },
      {
        id: 'homey',
        label: 'Homey',
        loginMode: 'oauth',
        status: 'connected',
        isActive: false,
        isConnected: true,
        canConnect: true,
        canDisconnect: true,
        baseUrl: 'https://homey.example.com',
        error: null,
        implementationStatus: 'implemented',
        featureMatrix: {
          rooms: true,
          lighting: true,
          sensors: true,
          climate: false,
          mediaControls: false,
          mediaBrowse: false,
          mediaArtwork: false,
          cameraSnapshot: false,
          cameraStreams: false,
          energyNow: false,
          calendar: false,
          weather: false,
          notifications: false,
        },
      },
    ] as typeof controller.providerCards;

    renderWithProviders(<SettingsSystemSection controller={controller} />);

    fireEvent.click(screen.getByRole('button', { name: 'Manage 1 other providers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    fireEvent.change(screen.getByPlaceholderText('https://homeassistant.local:8123'), {
      target: { value: 'https://ha.example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(controller.handleConnectProvider).toHaveBeenCalledWith(
      'home_assistant',
      'https://ha.example.com',
      undefined,
      undefined
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions: Homey' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Disconnect' }));
    expect(controller.handleDisconnectProvider).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(controller.handleDisconnectProvider).toHaveBeenCalledWith('homey');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it.each([undefined, 'Unable to reach openHAB'])(
    'shows openHAB connection progress until the request settles (%s)',
    async (connectionError) => {
      let finishConnection!: (error: string | undefined) => void;
      vi.mocked(controller.handleConnectProvider).mockReturnValueOnce(
        new Promise<string | undefined>((resolve) => {
          finishConnection = resolve;
        })
      );
      controller.providerCards = [
        {
          id: 'openhab',
          label: 'openHAB',
          loginMode: 'url_session',
          status: 'disconnected',
          isActive: false,
          isConnected: false,
          canConnect: true,
          canDisconnect: false,
          baseUrl: null,
          error: null,
          implementationStatus: 'implemented',
          featureMatrix: {
            rooms: true,
            lighting: true,
            sensors: true,
            climate: true,
            mediaControls: false,
            mediaBrowse: false,
            mediaArtwork: false,
            cameraSnapshot: false,
            cameraStreams: false,
            energyNow: false,
            calendar: false,
            weather: false,
            notifications: false,
          },
        },
      ] as typeof controller.providerCards;

      renderWithProviders(<SettingsSystemSection controller={controller} />);

      fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

      fireEvent.change(screen.getByPlaceholderText('http://openhab.local:8080'), {
        target: { value: 'http://openhab.local:8080' },
      });
      fireEvent.change(screen.getByLabelText('Username'), {
        target: { value: 'navet' },
      });
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'secret' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

      expect(controller.handleConnectProvider).toHaveBeenCalledWith(
        'openhab',
        'http://openhab.local:8080',
        'navet',
        'secret'
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Connecting...' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      expect(screen.getByLabelText('Username')).toBeDisabled();
      expect(screen.getByLabelText('Password')).toBeDisabled();
      const form = screen.getByRole('button', { name: 'Connecting...' }).closest('form');
      if (!form) throw new Error('Connection form is missing');
      fireEvent.submit(form);
      expect(controller.handleConnectProvider).toHaveBeenCalledTimes(1);

      await act(async () => {
        finishConnection(connectionError);
      });
      if (connectionError) {
        expect(screen.getByRole('alert')).toHaveTextContent(connectionError);
        expect(screen.getByLabelText('Username')).toHaveValue('navet');
        expect(screen.getByLabelText('Password')).toHaveValue('secret');
        expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();
        fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(controller.handleConnectProvider).toHaveBeenCalledTimes(2);
      } else {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      }
    }
  );

  it('uses authorized devices as the only device roster', () => {
    renderWithProviders(<SettingsSystemSection controller={controller} />);

    expect(screen.queryByText('Connected displays')).not.toBeInTheDocument();
    expect(screen.getByText('Authorized devices')).toBeInTheDocument();
    expect(screen.queryByText('Device settings')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Access' })).toHaveTextContent('Authorized devices');
  });

  it('groups config backup and reset under recovery and keeps logout in session', () => {
    renderWithProviders(<SettingsSystemSection controller={controller} />);
    const recovery = screen.getByRole('region', { name: 'Backup and recovery' });
    expect(within(recovery).getByText('Local config backup')).toBeInTheDocument();
    expect(within(recovery).getByText('Local data')).toBeInTheDocument();
    fireEvent.click(within(recovery).getByRole('button', { name: 'Export config' }));
    expect(controller.handleExportDashboardConfig).toHaveBeenCalledOnce();
    const fileInput = recovery.querySelector('input[type="file"]');
    expect(fileInput).toBeInstanceOf(HTMLInputElement);
    if (!(fileInput instanceof HTMLInputElement)) return;
    fireEvent.change(fileInput, {
      target: { files: [new File(['layout: {}'], 'navet.yaml', { type: 'text/yaml' })] },
    });
    expect(controller.handleImportDashboardConfig).toHaveBeenCalledOnce();
    const session = screen.getByRole('region', { name: 'Session' });
    fireEvent.click(within(session).getByRole('button', { name: 'Logout' }));
    expect(controller.handleLogout).toHaveBeenCalledOnce();
  });
});
