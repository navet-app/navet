import { dispatchEditModeSettingsRequest } from '@navet/app/components/shared/edit-mode-settings-request';
import { integrationStore } from '@navet/app/stores/integration-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import type { NavetValveState } from '@navet/core/household-device-state';
import type { NavetEntity } from '@navet/core/types';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteCard } from '../remote-card';
import { ValveCard, ValveControlPanel } from '../valve-card';

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock('@navet/app/commands', () => ({ dispatchEntityCommand: dispatch }));
const valve: NavetValveState = {
  phase: 'closed',
  position: 0,
  canOpen: true,
  canClose: true,
  canStop: false,
  canSetPosition: true,
};
const valveCapabilities: NavetEntity['capabilities'] = [
  'valve_open',
  'valve_close',
  'valve_stop',
  'position',
];
const props = {
  id: 'homey:valve.water',
  name: 'Water valve',
  providerId: 'homey' as const,
  size: 'small' as const,
  isEditMode: false,
};
function install(
  type: 'valve' | 'remote',
  attributes: Record<string, unknown>,
  capabilities: NavetEntity['capabilities'],
  availability: NavetEntity['availability'] = 'available'
) {
  const id = type === 'valve' ? props.id : 'homey:remote.living';
  const entity: NavetEntity = {
    id,
    canonicalId: id,
    externalId: id.split(':')[1],
    providerId: 'homey',
    name: type === 'valve' ? props.name : 'Living remote',
    type,
    primaryState: type === 'valve' ? (attributes.phase as string) : (attributes.isOn as boolean),
    availability,
    attributes,
    capabilities,
  };
  act(() =>
    integrationStore.setState({ providerEntitiesByProviderId: { homey: { [id]: entity } } })
  );
}
beforeEach(async () => {
  await resetAppStores();
  dispatch.mockReset().mockResolvedValue({ accepted: true, requiresEventConfirmation: true });
});

describe('normalized valve controls', () => {
  it('opens a stopped partial valve without treating its unchanged open phase as confirmation', async () => {
    install('valve', { phase: 'open', position: 35 }, valveCapabilities);
    renderWithProviders(<ValveCard {...props} />);
    expect(screen.getByRole('button', { name: 'Open' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Controls for Water valve' }));
    const dialog = within(
      within(screen.getByRole('dialog')).getByRole('group', { name: 'Controls' })
    );
    expect(dialog.getByRole('button', { name: 'Open' })).toBeEnabled();
    fireEvent.click(dialog.getByRole('button', { name: 'Open' }));
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'open', entityId: props.id }, 'homey')
    );
    expect(dialog.getByRole('button', { name: 'Open' })).toBeDisabled();
    expect(dialog.getByRole('button', { name: 'Close' })).toBeDisabled();
    install('valve', { phase: 'open', position: 50 }, valveCapabilities);
    expect(dialog.getByRole('button', { name: 'Close' })).toBeDisabled();
    install('valve', { phase: 'open', position: 100 }, valveCapabilities);
    expect(dialog.getByRole('button', { name: 'Close' })).toBeEnabled();
    expect(dialog.getByRole('button', { name: 'Open' })).toBeDisabled();
  });

  it('omits unsupported controls and routes supported open only to the owning provider', async () => {
    install('valve', { phase: 'closed', position: null }, ['valve_open']);
    renderWithProviders(<ValveCard {...props} />);
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'open', entityId: props.id }, 'homey')
    );
    expect(screen.getByRole('button', { name: 'Open' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Controls for Water valve' }));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Open' })).toBeDisabled();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('confirms movement and keeps supported Stop reachable', async () => {
    install('valve', { phase: 'closed', position: 0 }, valveCapabilities);
    renderWithProviders(<ValveCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await act(async () => {
      await Promise.resolve();
    });
    install('valve', { phase: 'opening', position: 30 }, valveCapabilities);
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await waitFor(() =>
      expect(dispatch).toHaveBeenLastCalledWith({ type: 'stop', entityId: props.id }, 'homey')
    );
  });

  it('retains a failed position draft across different live updates and retries it', async () => {
    dispatch.mockResolvedValueOnce({ accepted: false, requiresEventConfirmation: false });
    const view = renderWithProviders(
      <ValveControlPanel
        id={props.id}
        name={props.name}
        providerId="homey"
        state={valve}
        capabilities={valveCapabilities}
      />
    );
    const field = screen.getByRole('spinbutton');
    fireEvent.change(field, { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    view.rerender(
      <ValveControlPanel
        id={props.id}
        name={props.name}
        providerId="homey"
        state={{ ...valve, position: 20 }}
        capabilities={valveCapabilities}
      />
    );
    expect(field).toHaveValue(45);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(dispatch).toHaveBeenLastCalledWith(
        { type: 'set_position', entityId: props.id, position: 45 },
        'homey'
      )
    );
    view.rerender(
      <ValveControlPanel
        id={props.id}
        name={props.name}
        providerId="homey"
        state={{ ...valve, position: 45 }}
        capabilities={valveCapabilities}
      />
    );
    expect(field).toBeEnabled();
  });

  it('supersedes a stalled position write with Stop and ignores its late failure', async () => {
    let reject!: (error: Error) => void;
    dispatch.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        })
    );
    renderWithProviders(
      <ValveControlPanel
        id={props.id}
        name={props.name}
        providerId="homey"
        state={{ ...valve, phase: 'opening', position: 20, canStop: true }}
        capabilities={valveCapabilities}
      />
    );
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    });
    await act(async () => {
      reject(new Error('Old position failed'));
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'stop', entityId: props.id }, 'homey');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('resets drafts for a new valve and ignores old request results', async () => {
    let reject!: (error: Error) => void;
    dispatch.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        })
    );
    const view = renderWithProviders(
      <ValveControlPanel
        id={props.id}
        name={props.name}
        providerId="homey"
        state={valve}
        capabilities={valveCapabilities}
      />
    );
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    view.rerender(
      <ValveControlPanel
        id="homey:valve.other"
        name="Other valve"
        providerId="homey"
        state={{ ...valve, position: 80 }}
        capabilities={valveCapabilities}
      />
    );
    await act(async () => {
      reject(new Error('Old valve failed'));
    });
    expect(screen.getByRole('spinbutton')).toHaveValue(80);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('disables advertised actions for unavailable entities and in edit mode', () => {
    install('valve', { phase: 'open', position: 100 }, valveCapabilities, 'unavailable');
    renderWithProviders(<ValveCard {...props} />);
    expect(screen.getByRole('button', { name: 'Open' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });
});

describe('normalized remote on/off controls', () => {
  it('disables live remote actions in the edit-dock dialog instead of offering a no-op', () => {
    install('remote', { isOn: false }, ['toggle']);
    renderWithProviders(
      <RemoteCard {...props} id="homey:remote.living" name="Living remote" isEditMode />
    );
    act(() => dispatchEditModeSettingsRequest('homey:remote.living'));
    const dialog = within(screen.getByRole('dialog', { name: 'Living remote' }));
    const button = dialog.getByRole('button', { name: 'Turn on Living remote' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('keeps live off until confirmation and routes on/off to its owner', async () => {
    install('remote', { isOn: false }, ['toggle']);
    renderWithProviders(<RemoteCard {...props} id="homey:remote.living" name="Living remote" />);
    fireEvent.click(screen.getByRole('button', { name: 'Turn on Living remote' }));
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(
        { type: 'turn_on', entityId: 'homey:remote.living' },
        'homey'
      )
    );
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn on Living remote' })).toBeDisabled();
    install('remote', { isOn: true }, ['toggle']);
    fireEvent.click(screen.getByRole('button', { name: 'Turn off Living remote' }));
    await waitFor(() =>
      expect(dispatch).toHaveBeenLastCalledWith(
        { type: 'turn_off', entityId: 'homey:remote.living' },
        'homey'
      )
    );
  });

  it('omits unsupported on/off and disables unknown advertised state', () => {
    install('remote', { isOn: false }, []);
    const view = renderWithProviders(
      <RemoteCard {...props} id="homey:remote.living" name="Living remote" />
    );
    expect(screen.queryByRole('button', { name: 'Turn on Living remote' })).not.toBeInTheDocument();
    install('remote', { isOn: null }, ['toggle']);
    view.rerender(<RemoteCard {...props} id="homey:remote.living" name="Living remote" />);
    expect(screen.getByRole('button', { name: 'Turn on Living remote' })).toBeDisabled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
