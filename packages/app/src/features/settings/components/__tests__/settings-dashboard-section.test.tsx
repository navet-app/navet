import { getDashboardClientIdentity } from '@navet/app/features/dashboard/clients/dashboard-client-identity';
import { useDashboardProfileRuntimeStore } from '@navet/app/features/dashboard/clients/dashboard-profile-runtime-store';
import {
  createDashboardDefinition,
  createLegacyDashboardCollection,
  sanitizeDashboardCollection,
} from '@navet/app/features/dashboard/dashboards/dashboard-collection';
import { useDashboardCollectionStore } from '@navet/app/features/dashboard/dashboards/dashboard-collection-store';
import { useSettingsSectionController } from '@navet/app/features/settings/hooks/use-settings-section-controller';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsDashboardSection } from '../settings-dashboard-section';

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
  return <SettingsDashboardSection controller={controller} />;
}

describe('SettingsDashboardSection', () => {
  beforeEach(async () => {
    await resetAppStores();
    activateFallbackMock.mockReset();
    useKeepDeviceAwakeSnapshotMock.mockReturnValue({
      enabled: false,
      mode: 'disabled',
      canActivateFallback: false,
    });
  });

  it('groups dashboard controls by task', () => {
    renderWithProviders(<TestSection />);

    expect(screen.getByRole('heading', { name: 'Dashboard setup' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Home content' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Wall display' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Maintenance' })).toBeInTheDocument();
  });

  it('turns the companion off and on without changing the saved collapse preference', () => {
    useSettingsStore.getState().updateSettings({ companionCollapsed: true });
    renderWithProviders(<TestSection />);
    const group = screen.getByRole('group', { name: 'Companion panel' });
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

  it('updates the keep-awake setting from dashboard settings', () => {
    renderWithProviders(<TestSection />);

    const keepAwakeGroup = screen.getByRole('group', { name: 'Keep device awake' });
    fireEvent.click(within(keepAwakeGroup).getByRole('button', { name: 'On' }));

    expect(useSettingsStore.getState().keepDeviceAwake).toBe(true);
  });

  it('disables chores without changing its default-on behavior', () => {
    renderWithProviders(<TestSection />);

    const choresGroup = screen.getByRole('group', { name: 'Household chores' });
    expect(useSettingsStore.getState().choresEnabled).toBe(true);

    fireEvent.click(within(choresGroup).getByRole('button', { name: 'Off' }));

    expect(useSettingsStore.getState().choresEnabled).toBe(false);
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

  it('does not render space usage controls in dashboard settings', () => {
    renderWithProviders(<TestSection />);

    expect(screen.queryByText('Space usage')).not.toBeInTheDocument();
  });

  it('assigns another registered display without changing this device', async () => {
    const currentClientId = getDashboardClientIdentity().id;
    const now = new Date().toISOString();
    useDashboardProfileRuntimeStore.getState().setClients([
      {
        id: 'sonoff-upstairs',
        name: 'Sonoff upstairs',
        kind: 'wall_panel',
        firstSeenAt: now,
        lastSeenAt: now,
        lastRevision: 1,
      },
    ]);
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

    renderWithProviders(<TestSection />);

    const homeDashboard = screen.getByTestId('dashboard-manager-home');
    const upstairsDashboard = screen.getByTestId('dashboard-manager-upstairs');
    expect(within(homeDashboard).getByText('Default')).toHaveClass(
      'rounded-full',
      'border',
      'px-2',
      'py-0.5',
      'text-[10px]'
    );
    expect(homeDashboard).toHaveTextContent('Used by 2 displays');
    expect(within(homeDashboard).queryByText('Sonoff upstairs')).not.toBeInTheDocument();
    expect(within(homeDashboard).queryByText('This display')).not.toBeInTheDocument();
    expect(upstairsDashboard).toHaveTextContent('Not assigned');

    const dashboardActions = screen.getByRole('button', {
      name: 'Dashboard actions for Upstairs lights',
    });
    expect(dashboardActions).toHaveClass('h-9', 'w-9', 'rounded-full');
    fireEvent.pointerDown(dashboardActions);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Assign displays' }));

    const dialog = await screen.findByRole('dialog', { name: 'Assign Upstairs lights' });
    expect(within(dialog).getByRole('button', { name: 'Sonoff upstairs' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sonoff upstairs' }));

    const assignments = useDashboardCollectionStore.getState().collection.dashboardIdByClientId;
    expect(assignments['sonoff-upstairs']).toBe('upstairs');
    expect(assignments[currentClientId]).toBeUndefined();
    expect(homeDashboard).toHaveTextContent('Used by 1 display');
    expect(upstairsDashboard).toHaveTextContent('Used by 1 display');
  });
});
