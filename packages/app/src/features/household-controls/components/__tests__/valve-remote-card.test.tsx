import { BaseCard } from '@navet/app/components/primitives/base-card';
import { dispatchEditModeSettingsRequest } from '@navet/app/components/shared/edit-mode-settings-request';
import { SwitchCard } from '@navet/app/features/lighting/components/switch-card';
import { CoverCard } from '@navet/app/features/security/components/cover-card';
import { integrationStore } from '@navet/app/stores/integration-store';
import { useThemeStore } from '@navet/app/stores/theme-store';
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
  it.each(['glass', 'dark', 'light', 'black'] as const)(
    'matches the switch-on surface for fully open and positionless open cards in %s',
    (theme) => {
      useThemeStore.setState({ theme, followSystemTheme: false });
      const switchView = renderWithProviders(
        <SwitchCard
          id="switch.reference"
          name="Reference switch"
          size="small"
          binaryControl={{ isOn: true, disabled: false, onToggle: () => {} }}
        />
      );
      const surfaceClasses = (element: Element | null) =>
        [...(element?.classList ?? [])].filter((name) => /^(bg-|border|shadow)/.test(name)).sort();
      const switchRoot = switchView.container.firstElementChild;
      for (const position of [100, null]) {
        install('valve', { phase: 'open', position }, valveCapabilities);
        const valveView = renderWithProviders(<ValveCard {...props} />);
        const coverView = renderWithProviders(
          <CoverCard
            id="cover.reference"
            name="Reference cover"
            room="Garden"
            initialState="open"
            initialPosition={100}
            hasPosition={position !== null}
            size="small"
            isEditMode={false}
            onSizeChange={() => {}}
          />
        );
        for (const view of [valveView, coverView]) {
          const root = view.container.firstElementChild;
          expect(surfaceClasses(root)).toEqual(surfaceClasses(switchRoot));
          expect(root?.getAttribute('style')).toBe(switchRoot?.getAttribute('style'));
          expect(view.container.querySelector('[data-cover-coverage]')).toBeNull();
          view.unmount();
        }
      }
    }
  );

  it.each(['glass', 'dark', 'light', 'black'] as const)(
    'matches the closed positionless cover surface in %s',
    (theme) => {
      useThemeStore.setState({ theme, followSystemTheme: false });
      install('valve', { phase: 'closed', position: null }, ['valve_open', 'valve_close']);
      const valveView = renderWithProviders(<ValveCard {...props} />);
      const coverView = renderWithProviders(
        <CoverCard
          id="cover.reference"
          name="Reference cover"
          room="Garden"
          initialState="closed"
          initialPosition={0}
          hasPosition={false}
          size="small"
          isEditMode={false}
          onSizeChange={() => {}}
        />
      );
      const surfaceClasses = (element: Element | null) =>
        [...(element?.classList ?? [])].filter((name) => /^(bg-|border|shadow)/.test(name)).sort();
      expect(surfaceClasses(valveView.container.firstElementChild)).toEqual(
        surfaceClasses(coverView.container.firstElementChild)
      );
      expect(valveView.container.querySelector('[data-cover-coverage]')).toBeNull();
      expect(Boolean(valveView.container.querySelector('[data-card-sheen]'))).toBe(
        Boolean(coverView.container.querySelector('[data-card-sheen]'))
      );
    }
  );

  it.each([
    { phase: 'closed', position: 0, command: 'open' },
    { phase: 'open', position: 30, command: 'close' },
    { phase: 'open', position: null, command: 'close' },
  ])(
    'toggles a $phase valve at $position from the header through its owner',
    async ({ phase, position, command }) => {
      install('valve', { phase, position }, valveCapabilities);
      renderWithProviders(<ValveCard {...props} />);
      const toggle = screen.getByRole('button', { name: 'Toggle Water valve' });
      fireEvent.click(toggle);
      await waitFor(() =>
        expect(dispatch).toHaveBeenCalledWith({ type: command, entityId: props.id }, 'homey')
      );
      expect(toggle).toBeDisabled();
    }
  );

  it('disables the header toggle when its target action is unsupported or the card is in edit mode', () => {
    install('valve', { phase: 'open', position: 30 }, ['valve_open']);
    const view = renderWithProviders(<ValveCard {...props} />);
    expect(screen.getByRole('button', { name: 'Toggle Water valve' })).toBeDisabled();
    install('valve', { phase: 'closed', position: 0 }, valveCapabilities);
    view.rerender(<ValveCard {...props} isEditMode />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Water valve' }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each(['glass', 'dark', 'light', 'black'] as const)(
    'keeps the base card background beneath the live position fill and clears stale position when unavailable in %s',
    (theme) => {
      useThemeStore.setState({ theme, followSystemTheme: false });
      install('valve', { phase: 'open', position: 30 }, valveCapabilities);
      const { container } = renderWithProviders(<ValveCard {...props} />);
      const coverage = () => container.querySelector('[data-cover-coverage]');
      expect(screen.getByText('30%')).toBeInTheDocument();
      expect(coverage()).toHaveStyle({ height: '70%' });
      const baseSurfaceClasses = container.firstElementChild?.className;
      const reference = renderWithProviders(<BaseCard size={props.size}>{null}</BaseCard>);
      const surfaceClasses = (element: Element | null) =>
        [...(element?.classList ?? [])].filter((name) => /^(bg-|border|shadow)/.test(name)).sort();
      expect(surfaceClasses(container.firstElementChild)).toEqual(
        surfaceClasses(reference.container.firstElementChild)
      );
      reference.unmount();
      const icon = screen.getByRole('button', { name: 'Toggle Water valve' }).querySelector('svg');
      expect(icon?.style.color).not.toBe('');
      const activeIconColor = icon?.style.color;
      const activeTitleColor = screen.getByText(props.name).style.color;

      install('valve', { phase: 'open', position: 70 }, valveCapabilities);
      expect(coverage()).toHaveStyle({ height: '30%' });
      expect(icon?.style.color).toBe(activeIconColor);
      expect(screen.getByText(props.name).style.color).toBe(activeTitleColor);
      expect(screen.getByText('Open').style.color).toBe('');

      install('valve', { phase: 'open', position: 100 }, valveCapabilities);
      expect(screen.getByText('100%')).toBeInTheDocument();
      expect(coverage()).toBeNull();
      expect(icon?.style.color).not.toBe('');

      install('valve', { phase: 'closed', position: 0 }, valveCapabilities);
      expect(coverage()).toHaveStyle({ height: '100%' });
      expect(container.firstElementChild?.className).toBe(baseSurfaceClasses);

      install('valve', { phase: 'open', position: 30 }, valveCapabilities, 'unavailable');
      expect(screen.queryByText('30%')).not.toBeInTheDocument();
      expect(coverage()).toHaveStyle({ height: '100%' });
      expect(container.firstElementChild?.className).toBe(baseSurfaceClasses);
      expect(screen.getByRole('button', { name: 'Toggle Water valve' })).toBeDisabled();
    }
  );

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

  it.each([
    { initial: 20, target: 80, direction: 'opening', opposite: 'closing' },
    { initial: 80, target: 20, direction: 'closing', opposite: 'opening' },
  ] as const)(
    'confirms a position write when the valve starts $direction toward its target',
    async ({ initial, target, direction, opposite }) => {
      install('valve', { phase: 'open', position: initial }, valveCapabilities);
      renderWithProviders(<ValveCard {...props} />);
      fireEvent.click(screen.getByRole('button', { name: 'Controls for Water valve' }));
      const dialog = within(screen.getByRole('dialog'));
      const field = dialog.getByRole('spinbutton');
      fireEvent.change(field, { target: { value: String(target) } });
      fireEvent.click(dialog.getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect(dispatch).toHaveBeenCalledWith(
          { type: 'set_position', entityId: props.id, position: target },
          'homey'
        )
      );
      expect(field).toBeDisabled();
      install('valve', { phase: opposite, position: initial }, valveCapabilities);
      expect(field).toBeDisabled();
      install('valve', { phase: direction, position: initial }, valveCapabilities);
      expect(field).toBeEnabled();
      expect(dialog.queryByRole('alert')).not.toBeInTheDocument();
      expect(field).toHaveValue(target);
    }
  );

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
  it('opens switch appearance settings in edit mode without allowing live actions', () => {
    install('remote', { isOn: false }, ['toggle']);
    renderWithProviders(
      <RemoteCard {...props} id="homey:remote.living" name="Living remote" isEditMode />
    );
    expect(screen.getByRole('button', { name: 'Toggle Living remote' })).toBeDisabled();
    act(() => dispatchEditModeSettingsRequest('homey:remote.living'));
    expect(screen.getByRole('dialog', { name: 'Living remote' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn on Living remote' })).not.toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each(['tiny', 'extra-small', 'small'] as const)(
    'keeps confirmed state and routes on/off at %s size',
    async (size) => {
      install('remote', { isOn: false }, ['toggle']);
      renderWithProviders(
        <RemoteCard {...props} size={size} id="homey:remote.living" name="Living remote" />
      );
      const card = screen.getByRole('button', { name: 'Living remote' });
      fireEvent.click(card);
      await waitFor(() =>
        expect(dispatch).toHaveBeenCalledWith(
          { type: 'turn_on', entityId: 'homey:remote.living' },
          'homey'
        )
      );
      expect(card).toHaveAttribute('aria-pressed', 'false');
      expect(card).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(card);
      expect(dispatch).toHaveBeenCalledTimes(1);
      install('remote', { isOn: true }, ['toggle']);
      expect(card).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(card);
      await waitFor(() =>
        expect(dispatch).toHaveBeenLastCalledWith(
          { type: 'turn_off', entityId: 'homey:remote.living' },
          'homey'
        )
      );
    }
  );

  it.each(['tiny', 'extra-small', 'small'] as const)(
    'blocks unsupported, unknown and unavailable actions at %s size',
    (size) => {
      install('remote', { isOn: false }, []);
      renderWithProviders(
        <RemoteCard {...props} size={size} id="homey:remote.living" name="Living remote" />
      );
      const card = screen.getByRole('button', { name: 'Living remote' });
      expect(card).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(card);
      install('remote', { isOn: null }, ['toggle']);
      expect(screen.getByText('Unknown')).toBeInTheDocument();
      fireEvent.keyDown(card, { key: 'Enter' });
      install('remote', { isOn: true }, ['toggle'], 'unavailable');
      expect(screen.getByText('Unavailable')).toBeInTheDocument();
      fireEvent.click(card);
      expect(dispatch).not.toHaveBeenCalled();
    }
  );
});
