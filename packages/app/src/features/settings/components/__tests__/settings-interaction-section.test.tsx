import { getDashboardClientIdentity } from '@navet/app/features/dashboard/clients/dashboard-client-identity';
import { useDashboardProfileRuntimeStore } from '@navet/app/features/dashboard/clients/dashboard-profile-runtime-store';
import { emptyDeviceDisplayProfilePolicy } from '@navet/app/features/dashboard/clients/device-display-profile';
import { useDeviceDisplayProfileRuntimeStore } from '@navet/app/features/dashboard/clients/device-display-profile-runtime-store';
import { useSettingsSectionController } from '@navet/app/features/settings/hooks/use-settings-section-controller';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsInteractionSection } from '../settings-interaction-section';

vi.mock('@navet/app/runtime/app-mode', () => ({
  isHomeAssistantPanelMode: () => false,
}));

const dashboardProfileServiceMocks = vi.hoisted(() => ({
  copyDashboardDisplaySettings: vi.fn(),
}));

vi.mock('@navet/app/services/dashboard-profile.service', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@navet/app/services/dashboard-profile.service')>();
  return {
    ...original,
    ...dashboardProfileServiceMocks,
  };
});

const { activateFallbackMock, useKeepDeviceAwakeSnapshotMock } = vi.hoisted(() => ({
  activateFallbackMock: vi.fn(),
  useKeepDeviceAwakeSnapshotMock: vi.fn(),
}));

vi.mock('@navet/app/hooks/use-keep-device-awake', () => ({
  activateKeepDeviceAwakeFallback: activateFallbackMock,
  useKeepDeviceAwakeSnapshot: useKeepDeviceAwakeSnapshotMock,
}));

function TestSection() {
  const controller = useSettingsSectionController();
  return <SettingsInteractionSection controller={controller} />;
}

describe('SettingsInteractionSection', () => {
  beforeEach(async () => {
    await resetAppStores();
    activateFallbackMock.mockReset();
    useKeepDeviceAwakeSnapshotMock.mockReturnValue({
      enabled: false,
      mode: 'disabled',
      canActivateFallback: false,
    });
    dashboardProfileServiceMocks.copyDashboardDisplaySettings.mockReset();
    useDeviceDisplayProfileRuntimeStore.setState({
      error: null,
      lastSyncedAt: null,
      loaded: false,
      policy: emptyDeviceDisplayProfilePolicy(),
      revision: 0,
      status: 'disabled',
    });
    useDashboardProfileRuntimeStore.getState().setClient(getDashboardClientIdentity());
  });

  it('keeps browser zoom available until the user opts in', () => {
    renderWithProviders(<TestSection />);

    const allowZoom = screen.getByRole('button', { name: 'Allow zoom' });
    const limitZoom = screen.getByRole('button', { name: 'Limit zoom' });
    expect(allowZoom).toHaveAttribute('aria-pressed', 'true');
    expect(limitZoom).toHaveAttribute('aria-pressed', 'false');
    expect(useSettingsStore.getState().preventBrowserZoom).toBe(false);

    fireEvent.click(limitZoom);
    expect(limitZoom).toHaveAttribute('aria-pressed', 'true');
    expect(useSettingsStore.getState().preventBrowserZoom).toBe(true);

    fireEvent.click(allowZoom);
    expect(allowZoom).toHaveAttribute('aria-pressed', 'true');
    expect(useSettingsStore.getState().preventBrowserZoom).toBe(false);
  });

  it('turns the companion off and on without changing the saved collapse preference', () => {
    useSettingsStore.getState().updateSettings({ companionCollapsed: true });
    renderWithProviders(<TestSection />);
    const group = screen.getByRole('group', { name: 'Side panel' });
    expect(within(group).getByRole('button', { name: 'On' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(within(group).getByRole('button', { name: 'Off' }));
    expect(useSettingsStore.getState().companionEnabled).toBe(false);
    expect(useSettingsStore.getState().companionCollapsed).toBe(true);
    fireEvent.click(within(group).getByRole('button', { name: 'On' }));
    expect(useSettingsStore.getState().companionEnabled).toBe(true);
    expect(useSettingsStore.getState().companionCollapsed).toBe(true);
  });

  it('updates the keep-awake setting from display settings', () => {
    renderWithProviders(<TestSection />);

    const keepAwakeGroup = screen.getByRole('group', { name: 'Keep device awake' });
    fireEvent.click(within(keepAwakeGroup).getByRole('button', { name: 'On' }));

    expect(useSettingsStore.getState().keepDeviceAwake).toBe(true);
  });

  it('renders the pending keep-awake fallback action when needed', () => {
    useKeepDeviceAwakeSnapshotMock.mockReturnValue({
      enabled: true,
      mode: 'pending-activation',
      canActivateFallback: true,
    });
    useSettingsStore.getState().updateSettings({ keepDeviceAwake: true });

    renderWithProviders(<TestSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Tap to activate fallback audio' }));

    expect(activateFallbackMock).toHaveBeenCalledTimes(1);
  });

  it('switches header title mode and shows the custom text input only for custom mode', () => {
    renderWithProviders(<TestSection />);

    expect(screen.queryByPlaceholderText('Welcome home')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Custom text' }));

    const input = screen.getByPlaceholderText('Welcome home');
    expect(input).toBeInTheDocument();
    expect(useSettingsStore.getState().headerTitleMode).toBe('custom_text');

    fireEvent.change(input, { target: { value: 'Dinner soon' } });

    expect(useSettingsStore.getState().headerCustomText).toBe('Dinner soon');

    fireEvent.click(screen.getByRole('button', { name: 'Date & Time' }));

    expect(useSettingsStore.getState().headerTitleMode).toBe('clock');
    expect(screen.queryByPlaceholderText('Welcome home')).not.toBeInTheDocument();
  });

  it('applies dashboard profile presets through scoped settings', () => {
    renderWithProviders(<TestSection />);

    const profileGroup = screen.getByRole('group', { name: 'Display preset' });
    expect(within(profileGroup).queryByRole('button', { name: 'Bedside' })).not.toBeInTheDocument();
    fireEvent.click(within(profileGroup).getByRole('button', { name: 'Wall display' }));

    expect(useSettingsStore.getState()).toEqual(
      expect.objectContaining({
        dashboardProfileMode: 'wall_display',
        dashboardSpaceMode: 'more_space',
        headerTitleMode: 'clock',
        keepDeviceAwake: true,
        kioskMode: true,
        showHomeSummaryBar: true,
      })
    );
    expect(screen.getByText(/Enables kiosk mode/)).toBeInTheDocument();
  });

  it('copies display settings once or creates an automatic linked profile', async () => {
    const currentClient = useDashboardProfileRuntimeStore.getState().client;
    expect(currentClient).not.toBeNull();
    if (!currentClient) return;
    const kitchenPanel = {
      id: 'kitchen_panel',
      name: 'Kitchen panel',
      kind: 'wall_panel' as const,
      userName: 'Vishal',
      firstSeenAt: '2026-07-24T08:00:00.000Z',
      lastSeenAt: '2026-07-25T09:00:00.000Z',
      lastRevision: 5,
    };
    useDashboardProfileRuntimeStore.getState().setClients([
      {
        id: currentClient.id,
        name: currentClient.name,
        kind: currentClient.kind,
        firstSeenAt: '2026-07-25T08:00:00.000Z',
        lastSeenAt: '2026-07-25T08:00:00.000Z',
        lastRevision: 5,
      },
      kitchenPanel,
    ]);
    useDeviceDisplayProfileRuntimeStore
      .getState()
      .replacePolicy(emptyDeviceDisplayProfilePolicy(), 0);
    dashboardProfileServiceMocks.copyDashboardDisplaySettings.mockResolvedValue({
      updatedClientIds: [kitchenPanel.id],
      skippedClientIds: [],
    });

    renderWithProviders(<TestSection />);

    expect(screen.getByText('Not shared — changes affect only this device')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy settings once' }));
    expect(screen.getByRole('button', { name: 'Copy settings' })).toBeDisabled();
    expect(screen.getByText(/Signed in as Vishal/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Kitchen panel/ })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    fireEvent.click(screen.getByRole('button', { name: /Kitchen panel/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy settings' }));
    await waitFor(() =>
      expect(dashboardProfileServiceMocks.copyDashboardDisplaySettings).toHaveBeenCalledWith(
        expect.objectContaining({ kioskMode: false, effectsQualityUserOverride: false }),
        [kitchenPanel.id],
        expect.objectContaining({ id: currentClient.id })
      )
    );

    fireEvent.click(screen.getByRole('button', { name: 'Keep settings synced' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Group name' }), {
      target: { value: 'Personal devices' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      Object.values(useDeviceDisplayProfileRuntimeStore.getState().policy.profilesById)
    ).toEqual([
      expect.objectContaining({
        name: 'Personal devices',
        settings: expect.objectContaining({
          kioskMode: false,
          effectsQualityUserOverride: false,
        }),
      }),
    ]);
    expect(
      useDeviceDisplayProfileRuntimeStore.getState().policy.profileIdByClientId[currentClient.id]
    ).toBeTruthy();
  });
  it('shows room swiping only with kiosk mode enabled', () => {
    renderWithProviders(<TestSection />);
    expect(screen.queryByText('Swipe between rooms')).not.toBeInTheDocument();
    const kiosk = screen.getByRole('group', { name: 'Kiosk mode' });
    fireEvent.click(within(kiosk).getByRole('button', { name: 'On' }));
    const swipe = screen.getByRole('group', { name: 'Swipe between rooms' });
    fireEvent.click(within(swipe).getByRole('button', { name: 'On' }));
    expect(useSettingsStore.getState().kioskSwipeRooms).toBe(true);
    fireEvent.click(within(kiosk).getByRole('button', { name: 'Off' }));
    expect(screen.queryByText('Swipe between rooms')).not.toBeInTheDocument();
    expect(useSettingsStore.getState().kioskSwipeRooms).toBe(true);
  });
});
