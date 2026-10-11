import { integrationStore } from '@navet/app/stores/integration-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import type { NavetClimateControlState } from '@navet/core/climate-controls';
import type { NavetEntity } from '@navet/core/types';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClimateAdvancedControls } from '../climate-advanced-controls';

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock('@navet/app/commands', () => ({ dispatchEntityCommand: dispatch }));

const controls: NavetClimateControlState = {
  writable: true,
  preset: { value: 'Comfort', options: ['Comfort', 'Away'] },
  fanMode: { value: 'Auto', options: ['Auto', 'Low'] },
  swingMode: { value: 'Off', options: ['Off', 'Vertical'] },
  swingHorizontalMode: { value: 'Off', options: ['Off', 'Horizontal'] },
  targetHumidity: { value: 45, min: 30, max: 70, step: 1 },
  currentHumidity: 42,
};
function installEntity(overrides: Partial<NavetEntity> = {}) {
  const entity: NavetEntity = {
    id: 'homey:climate.hall',
    canonicalId: 'homey:climate.hall',
    externalId: 'climate.hall',
    providerId: 'homey',
    name: 'Hall climate',
    type: 'climate',
    primaryState: 'heat',
    availability: 'available',
    attributes: { climateControls: controls },
    capabilities: [
      'climate_preset',
      'climate_fan_mode',
      'climate_swing_mode',
      'climate_swing_horizontal_mode',
      'climate_target_humidity',
    ],
    ...overrides,
  };
  act(() =>
    integrationStore.setState({
      providerEntitiesByProviderId: { homey: { [entity.canonicalId]: entity } },
    })
  );
  return entity;
}
function renderControls() {
  renderWithProviders(<ClimateAdvancedControls entityId="homey:climate.hall" />);
  openControls();
}
function openControls() {
  for (const button of screen.queryAllByRole('button')) {
    if (button.getAttribute('aria-expanded') === 'false') fireEvent.click(button);
  }
}
function option(label: string, value: string) {
  return within(screen.getByRole('group', { name: label })).getByRole('radio', { name: value });
}

describe('normalized advanced climate controls', () => {
  beforeEach(async () => {
    await resetAppStores();
    dispatch.mockReset().mockResolvedValue({ accepted: true, requiresEventConfirmation: false });
  });
  it('shows live values before disclosure and preserves a humidity draft when collapsed', () => {
    installEntity();
    renderWithProviders(<ClimateAdvancedControls entityId="homey:climate.hall" />);
    expect(screen.getByRole('button', { name: 'Fan mode' })).toHaveTextContent('Auto');
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Current humidity' })).not.toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'Target humidity' });
    fireEvent.click(trigger);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '55' } });
    fireEvent.click(trigger);
    expect(trigger).toHaveTextContent('45%');
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByRole('spinbutton')).toHaveValue(55);
  });
  it('keeps the selected row checked when clicked again without sending a command', () => {
    installEntity();
    renderControls();
    const selected = option('Preset', 'Comfort');
    expect(selected).toBeChecked();
    fireEvent.click(selected);
    expect(selected).toBeChecked();
    expect(option('Preset', 'Away')).not.toBeChecked();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('uses an inline toggle only for explicit boolean options and confirms the live update', async () => {
    dispatch.mockResolvedValue({ accepted: true, requiresEventConfirmation: true });
    installEntity({
      attributes: {
        climateControls: { ...controls, swingMode: { value: 'Off', options: ['Off', 'On'] } },
      },
    });
    renderControls();
    const toggle = screen.getByRole('switch', { name: 'Vertical swing' });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(dispatch).toHaveBeenCalledWith(
      { type: 'set_climate_swing_mode', entityId: 'homey:climate.hall', mode: 'On' },
      'homey'
    );
    expect(toggle).toBeDisabled();
    expect(toggle).not.toBeChecked();
    await waitFor(() => expect(dispatch).toHaveBeenCalled());
    installEntity({
      attributes: {
        climateControls: { ...controls, swingMode: { value: 'On', options: ['Off', 'On'] } },
      },
    });
    expect(toggle).toBeChecked();
    expect(toggle).toBeEnabled();
    installEntity({
      availability: 'unavailable',
      attributes: {
        climateControls: { ...controls, swingMode: { value: 'On', options: ['Off', 'On'] } },
      },
    });
    expect(toggle).toBeDisabled();
  });
  it('keeps an unknown option visible without selecting a different supported value', () => {
    installEntity({
      attributes: {
        climateControls: { ...controls, preset: { value: 'Custom', options: ['Comfort', 'Away'] } },
      },
    });
    renderControls();
    expect(screen.getByRole('button', { name: 'Preset' })).toHaveTextContent('Custom');
    expect(option('Preset', 'Comfort')).not.toBeChecked();
    expect(option('Preset', 'Away')).not.toBeChecked();
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('omits controls without advertised capabilities or supported options', () => {
    installEntity({
      capabilities: ['climate_fan_mode'],
      attributes: { climateControls: { ...controls, fanMode: { value: 'Auto', options: [] } } },
    });
    renderControls();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
  });
  it('routes each option action to the owning adapter and leaves the current value visible', async () => {
    installEntity();
    renderControls();
    const cases = [
      ['Preset', 'Away', { type: 'set_climate_preset', preset: 'Away' }],
      ['Fan mode', 'Low', { type: 'set_climate_fan_mode', mode: 'Low' }],
      ['Vertical swing', 'Vertical', { type: 'set_climate_swing_mode', mode: 'Vertical' }],
      [
        'Horizontal swing',
        'Horizontal',
        { type: 'set_climate_swing_horizontal_mode', mode: 'Horizontal' },
      ],
    ] as const;
    for (const [label, value, command] of cases) {
      fireEvent.click(option(label, value));
      await waitFor(() =>
        expect(dispatch).toHaveBeenCalledWith(
          { ...command, entityId: 'homey:climate.hall' },
          'homey'
        )
      );
    }
    expect(option('Preset', 'Comfort')).toBeChecked();
  });
  it('prevents duplicate pending writes and confirms the provider update', async () => {
    dispatch.mockResolvedValue({ accepted: true, requiresEventConfirmation: true });
    installEntity();
    renderControls();
    const field = option('Fan mode', 'Low');
    fireEvent.click(field);
    fireEvent.click(field);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(field).toBeDisabled();
    expect(screen.getByText('Updating…')).toBeInTheDocument();
    await waitFor(() => expect(dispatch).toHaveBeenCalled());
    installEntity({
      attributes: {
        climateControls: { ...controls, fanMode: { ...controls.fanMode, value: 'Low' } },
      },
    });
    expect(field).toBeChecked();
    expect(field).toBeEnabled();
    expect(screen.queryByText('Updating…')).not.toBeInTheDocument();
  });
  it('shows a rejected selection and allows retry without changing live state', async () => {
    dispatch.mockResolvedValue({ accepted: false, requiresEventConfirmation: false });
    installEntity();
    renderControls();
    const field = option('Preset', 'Away');
    fireEvent.click(field);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to update the climate control. Try again.'
    );
    expect(option('Preset', 'Comfort')).toBeChecked();
    expect(field).toBeEnabled();
    fireEvent.click(field);
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(2));
  });
  it('refreshes backend options and disables all supported actions when unavailable', () => {
    installEntity();
    renderControls();
    installEntity({
      attributes: {
        climateControls: {
          ...controls,
          preset: { value: 'Comfort', options: ['Comfort', 'Sleep'] },
        },
      },
    });
    expect(option('Preset', 'Sleep')).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Away' })).not.toBeInTheDocument();
    installEntity({ availability: 'unavailable' });
    for (const field of screen.getAllByRole('radio')) expect(field).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: 'Target humidity' })).toBeDisabled();
  });
  it('allows integer humidity within fractional bounds without a native step mismatch', async () => {
    installEntity({
      attributes: {
        climateControls: {
          ...controls,
          targetHumidity: { value: 45, min: 30.5, max: 70.5, step: 1 },
        },
      },
    });
    renderControls();
    const field = screen.getByRole('spinbutton', { name: 'Target humidity' }) as HTMLInputElement;
    fireEvent.change(field, { target: { value: '31' } });
    expect(field.checkValidity()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(
        { type: 'set_climate_humidity', entityId: 'homey:climate.hall', humidity: 31 },
        'homey'
      )
    );
    fireEvent.change(field, { target: { value: '31.5' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.change(field, { target: { value: '30' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.change(field, { target: { value: '71' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
  it('cannot submit humidity when fractional bounds contain no integer', () => {
    installEntity({
      attributes: {
        climateControls: {
          ...controls,
          targetHumidity: { value: null, min: 30.2, max: 30.8, step: 1 },
        },
      },
    });
    renderControls();
    const field = screen.getByRole('spinbutton', { name: 'Target humidity' });
    for (const value of ['30', '30.5', '31']) {
      fireEvent.change(field, { target: { value } });
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    }
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('uses humidity bounds, blocks fractional writes and preserves a rejected draft', async () => {
    dispatch.mockResolvedValue({ accepted: false, requiresEventConfirmation: false });
    installEntity();
    renderControls();
    const field = screen.getByRole('spinbutton', { name: 'Target humidity' });
    expect(field).toHaveAttribute('min', '30');
    expect(field).toHaveAttribute('max', '70');
    fireEvent.change(field, { target: { value: '50.5' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.change(field, { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(
        { type: 'set_climate_humidity', entityId: 'homey:climate.hall', humidity: 50 },
        'homey'
      )
    );
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(field).toHaveValue(50);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
  it('preserves humidity edits across realtime updates and follows later updates after confirmation', async () => {
    dispatch.mockResolvedValue({ accepted: true, requiresEventConfirmation: true });
    installEntity();
    renderControls();
    const field = screen.getByRole('spinbutton', { name: 'Target humidity' });
    fireEvent.change(field, { target: { value: '50' } });
    installEntity({
      attributes: {
        climateControls: { ...controls, targetHumidity: { ...controls.targetHumidity, value: 46 } },
      },
    });
    expect(field).toHaveValue(50);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(dispatch).toHaveBeenCalled());
    installEntity({
      attributes: {
        climateControls: { ...controls, targetHumidity: { ...controls.targetHumidity, value: 50 } },
      },
    });
    expect(field).toBeEnabled();
    installEntity({
      attributes: {
        climateControls: { ...controls, targetHumidity: { ...controls.targetHumidity, value: 51 } },
      },
    });
    expect(field).toHaveValue(51);
  });
  it('allows retry after a stalled request and ignores a late failure from that request', async () => {
    let rejectFirst!: (error: Error) => void;
    dispatch.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectFirst = reject;
        })
    );
    installEntity();
    renderControls();
    const field = option('Preset', 'Away');
    vi.useFakeTimers();
    try {
      fireEvent.click(field);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(field).toBeEnabled();
      expect(screen.getByRole('alert')).toBeInTheDocument();
      fireEvent.click(field);
      await act(async () => {
        await Promise.resolve();
      });
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      await act(async () => {
        rejectFirst(new Error('Old request failed'));
        await Promise.resolve();
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
  it('resets drafts and pending actions when switching entities and ignores the old result', async () => {
    let rejectOld!: (error: Error) => void;
    dispatch.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectOld = reject;
        })
    );
    const entityA = installEntity();
    const entityB: NavetEntity = {
      ...entityA,
      id: 'homey:climate.bedroom',
      canonicalId: 'homey:climate.bedroom',
      externalId: 'climate.bedroom',
      attributes: {
        climateControls: {
          ...controls,
          targetHumidity: { ...controls.targetHumidity, value: 60 },
          preset: { value: 'Sleep', options: ['Sleep', 'Away'] },
        },
      },
    };
    act(() =>
      integrationStore.setState({
        providerEntitiesByProviderId: {
          homey: { [entityA.canonicalId]: entityA, [entityB.canonicalId]: entityB },
        },
      })
    );
    const { rerender } = renderWithProviders(
      <ClimateAdvancedControls entityId={entityA.canonicalId} />
    );
    openControls();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Target humidity' }), {
      target: { value: '55' },
    });
    fireEvent.click(option('Preset', 'Away'));
    expect(option('Preset', 'Away')).toBeDisabled();
    rerender(<ClimateAdvancedControls entityId={entityB.canonicalId} />);
    openControls();
    const humidityB = screen.getByRole('spinbutton', { name: 'Target humidity' });
    expect(humidityB).toHaveValue(60);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(option('Preset', 'Sleep')).toBeChecked();
    expect(option('Preset', 'Away')).toBeEnabled();
    expect(screen.queryByText('Updating…')).not.toBeInTheDocument();
    await act(async () => {
      rejectOld(new Error('Old entity request rejected'));
      await Promise.resolve();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.change(humidityB, { target: { value: '61' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(dispatch).toHaveBeenLastCalledWith(
        { type: 'set_climate_humidity', entityId: entityB.canonicalId, humidity: 61 },
        'homey'
      )
    );
  });
  it.each([
    ['session', 'accepted'],
    ['session', 'rejected'],
    ['connection', 'accepted'],
    ['connection', 'rejected'],
  ] as const)(
    'resets same-entity climate controls on %s replacement and ignores old %s results',
    async (change, outcome) => {
      const oldResults: (() => void)[] = [];
      for (let index = 0; index < 5; index += 1) {
        dispatch.mockImplementationOnce(
          () =>
            new Promise((resolve, reject) => {
              oldResults.push(() =>
                outcome === 'accepted'
                  ? resolve({ accepted: true, requiresEventConfirmation: false })
                  : reject(new Error('Previous household failed'))
              );
            })
        );
      }
      dispatch.mockResolvedValue({ accepted: true, requiresEventConfirmation: true });
      installEntity();
      renderControls();
      const selections = [
        ['Preset', 'Away'],
        ['Fan mode', 'Low'],
        ['Vertical swing', 'Vertical'],
        ['Horizontal swing', 'Horizontal'],
      ] as const;
      for (const [label, value] of selections) {
        fireEvent.click(option(label, value));
      }
      fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '55' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(dispatch).toHaveBeenCalledTimes(5);
      const nextControls = {
        ...controls,
        preset: { value: 'Sleep', options: ['Sleep', 'Away'] },
        targetHumidity: { value: 60, min: 30, max: 70, step: 1 },
      };
      act(() => {
        if (change === 'session') {
          integrationStore
            .getState()
            .setProviderSessions({ homey: { providerId: 'homey', connected: true } });
        } else {
          const runtime = integrationStore.getState().providerRuntime;
          integrationStore.setState({
            providerRuntime: {
              ...runtime,
              homey: { ...runtime.homey, connected: !runtime.homey.connected },
            },
          });
        }
      });
      installEntity({ attributes: { climateControls: nextControls } });
      openControls();
      expect(screen.getByRole('spinbutton')).toHaveValue(60);
      expect(screen.getByRole('spinbutton')).toBeEnabled();
      expect(option('Preset', 'Sleep')).toBeChecked();
      expect(screen.queryByText('Updating…')).not.toBeInTheDocument();
      for (const [label, value] of selections) {
        expect(option(label, value)).toBeEnabled();
        fireEvent.click(option(label, value));
      }
      fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '61' } });
      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
      await act(async () => {
        for (const finish of oldResults) finish();
      });
      expect(dispatch).toHaveBeenCalledTimes(10);
      expect(dispatch).toHaveBeenLastCalledWith(
        { type: 'set_climate_humidity', entityId: 'homey:climate.hall', humidity: 61 },
        'homey'
      );
      expect(screen.getByRole('spinbutton')).toHaveValue(61);
      expect(screen.getByRole('spinbutton')).toBeDisabled();
      for (const [label, value] of selections) expect(option(label, value)).toBeDisabled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      installEntity({
        attributes: {
          climateControls: {
            ...nextControls,
            preset: { ...nextControls.preset, value: 'Away' },
            fanMode: { value: 'Low', options: ['Auto', 'Low'] },
            swingMode: { value: 'Vertical', options: ['Off', 'Vertical'] },
            swingHorizontalMode: { value: 'Horizontal', options: ['Off', 'Horizontal'] },
            targetHumidity: { ...nextControls.targetHumidity, value: 61 },
          },
        },
      });
      expect(screen.getByRole('spinbutton')).toBeEnabled();
      for (const [label, value] of selections) expect(option(label, value)).toBeEnabled();
    }
  );
});
