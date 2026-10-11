import { integrationStore } from '@navet/app/stores/integration-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import type { NavetClimateControlState } from '@navet/core/climate-controls';
import type { NavetEntity } from '@navet/core/types';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
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
}

describe('normalized advanced climate controls', () => {
  beforeEach(async () => {
    await resetAppStores();
    dispatch.mockReset().mockResolvedValue({ accepted: true, requiresEventConfirmation: false });
  });
  it('omits controls without advertised capabilities or supported options', () => {
    installEntity({
      capabilities: ['climate_fan_mode'],
      attributes: { climateControls: { ...controls, fanMode: { value: 'Auto', options: [] } } },
    });
    renderControls();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
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
      fireEvent.change(screen.getByRole('combobox', { name: label }), { target: { value } });
      await waitFor(() =>
        expect(dispatch).toHaveBeenCalledWith(
          { ...command, entityId: 'homey:climate.hall' },
          'homey'
        )
      );
    }
    expect(screen.getByRole('combobox', { name: 'Preset' })).toHaveValue('Comfort');
  });
  it('prevents duplicate pending writes and confirms the provider update', async () => {
    dispatch.mockResolvedValue({ accepted: true, requiresEventConfirmation: true });
    installEntity();
    renderControls();
    const field = screen.getByRole('combobox', { name: 'Fan mode' });
    fireEvent.change(field, { target: { value: 'Low' } });
    fireEvent.change(field, { target: { value: 'Low' } });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(field).toBeDisabled();
    expect(screen.getByText('Updating…')).toBeInTheDocument();
    await waitFor(() => expect(dispatch).toHaveBeenCalled());
    installEntity({
      attributes: {
        climateControls: { ...controls, fanMode: { ...controls.fanMode, value: 'Low' } },
      },
    });
    expect(field).toHaveValue('Low');
    expect(field).toBeEnabled();
    expect(screen.queryByText('Updating…')).not.toBeInTheDocument();
  });
  it('shows a rejected selection and allows retry without changing live state', async () => {
    dispatch.mockResolvedValue({ accepted: false, requiresEventConfirmation: false });
    installEntity();
    renderControls();
    const field = screen.getByRole('combobox', { name: 'Preset' });
    fireEvent.change(field, { target: { value: 'Away' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to update the climate control. Try again.'
    );
    expect(field).toHaveValue('Comfort');
    expect(field).toBeEnabled();
    fireEvent.change(field, { target: { value: 'Away' } });
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
    expect(screen.getByRole('option', { name: 'Sleep' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Away' })).not.toBeInTheDocument();
    installEntity({ availability: 'unavailable' });
    for (const field of screen.getAllByRole('combobox')) expect(field).toBeDisabled();
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
    const field = screen.getByRole('combobox', { name: 'Preset' });
    vi.useFakeTimers();
    try {
      fireEvent.change(field, { target: { value: 'Away' } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(field).toBeEnabled();
      expect(screen.getByRole('alert')).toBeInTheDocument();
      fireEvent.change(field, { target: { value: 'Away' } });
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
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Target humidity' }), {
      target: { value: '55' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Preset' }), {
      target: { value: 'Away' },
    });
    expect(screen.getByRole('combobox', { name: 'Preset' })).toBeDisabled();
    rerender(<ClimateAdvancedControls entityId={entityB.canonicalId} />);
    const humidityB = screen.getByRole('spinbutton', { name: 'Target humidity' });
    expect(humidityB).toHaveValue(60);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Preset' })).toHaveValue('Sleep');
    expect(screen.getByRole('combobox', { name: 'Preset' })).toBeEnabled();
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
        fireEvent.change(screen.getByRole('combobox', { name: label }), { target: { value } });
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
      expect(screen.getByRole('spinbutton')).toHaveValue(60);
      expect(screen.getByRole('spinbutton')).toBeEnabled();
      expect(screen.getByRole('combobox', { name: 'Preset' })).toHaveValue('Sleep');
      expect(screen.queryByText('Updating…')).not.toBeInTheDocument();
      for (const [label, value] of selections) {
        expect(screen.getByRole('combobox', { name: label })).toBeEnabled();
        fireEvent.change(screen.getByRole('combobox', { name: label }), { target: { value } });
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
      for (const [label] of selections)
        expect(screen.getByRole('combobox', { name: label })).toBeDisabled();
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
      for (const [label] of selections)
        expect(screen.getByRole('combobox', { name: label })).toBeEnabled();
    }
  );
});
