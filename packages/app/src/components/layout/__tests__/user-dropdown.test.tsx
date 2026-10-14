import { integrationStore } from '@navet/app/stores/integration-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { UserDropdown } from '../user-dropdown';

describe('UserDropdown', () => {
  beforeEach(async () => {
    await resetAppStores();
  });

  it('shows each connected provider on its own status row', () => {
    integrationStore.getState().setIntegrationUser({
      name: 'Alex Johnson',
      is_admin: true,
    });
    integrationStore.getState().setCurrentProviderId('homey');
    integrationStore.setState((state) => ({
      ...state,
      providerRuntime: {
        ...state.providerRuntime,
        home_assistant: {
          ...state.providerRuntime.home_assistant,
          connected: true,
        },
        homey: {
          ...state.providerRuntime.homey,
          connected: true,
        },
        openhab: {
          ...state.providerRuntime.openhab,
          connected: true,
        },
      },
    }));

    renderWithProviders(<UserDropdown />);

    fireEvent.click(screen.getByRole('button', { name: 'Open user menu' }));

    expect(screen.getByText('Alex Johnson')).toBeInTheDocument();
    expect(screen.getByText('Home Assistant')).toBeInTheDocument();
    expect(screen.getByText('Homey')).toBeInTheDocument();
    expect(screen.getByText('openHAB')).toBeInTheDocument();
  });
  it('opens the general history explorer from the user menu', async () => {
    renderWithProviders(<UserDropdown />);
    fireEvent.click(screen.getByRole('button', { name: 'Open user menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'History and activity' }));
    expect(await screen.findByRole('dialog', { name: 'History and activity' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /^Entity/ })).toBeInTheDocument();
  });
});
