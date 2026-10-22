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
import { beforeEach, describe, expect, it } from 'vitest';
import { SettingsDashboardSection } from '../settings-dashboard-section';

function TestSection() {
  const controller = useSettingsSectionController();
  return <SettingsDashboardSection controller={controller} />;
}

describe('SettingsDashboardSection', () => {
  beforeEach(async () => {
    await resetAppStores();
  });

  it('groups dashboard controls by task', () => {
    renderWithProviders(<TestSection />);

    expect(screen.getByRole('heading', { name: 'Manage dashboards' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Content' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Visibility' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Setup' })).toBeInTheDocument();
  });

  it('disables chores without changing its default-on behavior', () => {
    renderWithProviders(<TestSection />);

    const choresGroup = screen.getByRole('group', { name: 'Household chores' });
    expect(useSettingsStore.getState().choresEnabled).toBe(true);

    fireEvent.click(within(choresGroup).getByRole('button', { name: 'Off' }));

    expect(useSettingsStore.getState().choresEnabled).toBe(false);
  });

  it('keeps device presentation controls outside dashboard content', () => {
    renderWithProviders(<TestSection />);

    for (const name of [
      'Space usage',
      'Display preset',
      'Header title',
      'Companion panel',
      'Screensaver',
      'Keep device awake',
      'Local config backup',
    ]) {
      expect(screen.queryByRole('heading', { name })).not.toBeInTheDocument();
    }
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
  it('keeps restarting setup separate from restoring hidden entities', () => {
    renderWithProviders(<TestSection />);
    const visibility = screen.getByRole('region', { name: 'Visibility' });
    expect(
      within(visibility).getByRole('button', { name: 'Restore entities' })
    ).toBeInTheDocument();
    expect(
      within(visibility).queryByRole('button', { name: 'Restart onboarding' })
    ).not.toBeInTheDocument();
    const setup = screen.getByRole('region', { name: 'Setup' });
    fireEvent.click(within(setup).getByRole('button', { name: 'Restart onboarding' }));
    expect(screen.getByRole('alertdialog', { name: 'Restart onboarding?' })).toBeInTheDocument();
  });
});
