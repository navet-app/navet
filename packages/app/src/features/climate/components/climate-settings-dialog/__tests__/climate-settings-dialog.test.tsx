import { useSettingsStore } from '@navet/app/stores/settings-store';
import { renderWithProviders } from '@navet/app/test/render';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClimateSettingsDialog } from '../index';
import type { ClimateSettingsDialogProps } from '../types';

const { serviceMock } = vi.hoisted(() => ({
  serviceMock: {
    callService: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@navet/app/commands', () => ({
  dispatchEntityCommand: async ({
    type,
    entityId,
  }: {
    type: 'turn_on' | 'turn_off';
    entityId: string;
  }) => {
    const nativeEntityId = entityId.replace(/^[^:]+:/, '');
    const domain = nativeEntityId.includes('.')
      ? nativeEntityId.split('.', 1)[0] || 'homeassistant'
      : 'homeassistant';
    await serviceMock.callService(domain, type, {}, { entity_id: nativeEntityId });
    return {
      accepted: true,
      requiresEventConfirmation: true,
    };
  },
}));

vi.mock('@navet/app/services/integration-native-action.service', () => ({
  invokeIntegrationNativeAction: async ({
    entityId,
    domain,
    service,
    serviceData = {},
  }: {
    entityId?: string;
    domain: string;
    service: string;
    serviceData?: Record<string, unknown>;
  }) =>
    await serviceMock.callService(
      domain,
      service,
      serviceData,
      entityId ? { entity_id: entityId } : {}
    ),
}));

function renderDialog(overrides: Partial<ClimateSettingsDialogProps> = {}) {
  const props: ClimateSettingsDialogProps = {
    entityId: 'climate.hallway',
    isOpen: true,
    onOpenChange: vi.fn(),
    name: 'Hallway',
    isOn: true,
    mode: 'heat',
    targetTemp: 72,
    currentTemp: 70,
    sourceTemperatureUnit: 'fahrenheit',
    minTemp: 60,
    maxTemp: 86,
    step: 1,
    supportedClimateModes: ['heat', 'cool', 'off'],
    onModeChange: vi.fn(),
    onTargetTempChange: vi.fn(),
    onTargetTempCommit: vi.fn(),
    ...overrides,
  };

  renderWithProviders(<ClimateSettingsDialog {...props} />);
  return props;
}

describe('ClimateSettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({ temperatureUnit: 'fahrenheit' });
  });

  it('shows supported operating modes as direct choices and preserves the provider mode value', () => {
    const props = renderDialog({
      supportedClimateModes: ['heat', 'heat_cool', 'off'],
    });
    expect(screen.getByRole('radio', { name: 'Heat' })).toBeChecked();
    expect(screen.queryByRole('radio', { name: 'Cool' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Auto' }));
    expect(props.onModeChange).toHaveBeenCalledWith('heat_cool');
  });

  it('omits operating choices when only one mode is available', () => {
    renderDialog({ supportedClimateModes: ['heat', 'off'] });
    expect(screen.queryByRole('group', { name: 'Mode' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Heat' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Increase temperature' })).toBeEnabled();
  });

  it('allows choosing an operating mode when the device is off', () => {
    const props = renderDialog({ isOn: false });
    expect(screen.getByRole('radio', { name: 'Heat' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Heat' }));
    expect(props.onModeChange).toHaveBeenCalledWith('heat');
  });

  it('disables target adjustment and shortcuts while off', () => {
    renderDialog({ isOn: false });
    expect(screen.getByRole('button', { name: 'Increase temperature' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decrease temperature' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Temperature presets' }));
    expect(screen.getByRole('radio', { name: '69.8°' })).toBeDisabled();
    expect(screen.getByText('72°F', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText('Current 70°F')).toBeInTheDocument();
  });

  it('keeps Fahrenheit source temperatures unchanged when Navet display is Fahrenheit', () => {
    const props = renderDialog();

    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(screen.getByText('72°F', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText('Current 70°F')).toBeInTheDocument();
    expect(screen.queryByText('162')).not.toBeInTheDocument();
    expect(screen.queryByText('Current 158°F')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Increase temperature'));

    expect(props.onTargetTempCommit).toHaveBeenCalledWith(73);
  });

  it('uses cooling visuals when target is below current even if the climate action says heat', () => {
    useSettingsStore.setState({ temperatureUnit: 'celsius' });
    renderDialog({
      mode: 'heat',
      action: 'heating',
      targetTemp: 20,
      currentTemp: 25,
      sourceTemperatureUnit: 'celsius',
      minTemp: 16,
      maxTemp: 30,
      step: 1,
    });

    expect(screen.getByRole('dialog')).toHaveClass('from-blue-900/95');
    expect(screen.getByText('Cooling down to 20°C')).toBeInTheDocument();
  });

  it('renders Celsius comfort presets as Fahrenheit display values and commits Fahrenheit source values', () => {
    const props = renderDialog();

    const presets = screen.getByRole('button', { name: 'Temperature presets' });
    expect(presets).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('radio', { name: '69.8°' })).not.toBeInTheDocument();
    fireEvent.click(presets);
    expect(presets).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('radio', { name: '18°' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: '21°' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: '24°' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '64.4°' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '69.8°' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '75.2°' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: '69.8°' }));

    expect(props.onTargetTempCommit).toHaveBeenCalledWith(expect.closeTo(69.8));
  });

  it('converts Fahrenheit source temperatures when Navet display is Celsius', () => {
    useSettingsStore.setState({ temperatureUnit: 'celsius' });
    const props = renderDialog();

    expect(screen.getByText('22.2°C', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText('Current 21.1°C')).toBeInTheDocument();
    expect(screen.queryByText('70°F')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Increase temperature'));

    expect(props.onTargetTempCommit).toHaveBeenCalledWith(expect.closeTo(73));
  });

  it('keeps Celsius source temperatures unchanged when Navet display is Celsius', () => {
    useSettingsStore.setState({ temperatureUnit: 'celsius' });
    const props = renderDialog({
      targetTemp: 22,
      currentTemp: 21,
      sourceTemperatureUnit: 'celsius',
      minTemp: 16,
      maxTemp: 30,
      step: 0.5,
    });

    expect(screen.getByText('22°C', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText('Current 21°C')).toBeInTheDocument();
    expect(screen.queryByText('69.8°F')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Increase temperature'));

    expect(props.onTargetTempCommit).toHaveBeenCalledWith(22.5);
  });

  it('converts Celsius source temperatures when Navet display is Fahrenheit', () => {
    const props = renderDialog({
      targetTemp: 22,
      currentTemp: 21,
      sourceTemperatureUnit: 'celsius',
      minTemp: 16,
      maxTemp: 30,
      step: 0.5,
    });

    expect(screen.getByText('71.6°F', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText('Current 69.8°F')).toBeInTheDocument();
    expect(screen.queryByText('21°C')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Increase temperature'));

    expect(props.onTargetTempCommit).toHaveBeenCalledWith(expect.closeTo(22.5));
  });

  it('renders fan sibling controls and calls Home Assistant fan services', () => {
    renderDialog({
      name: 'Hallway Boost',
      siblingEntities: [
        {
          id: 'fan.hallway',
          entity: {
            entityId: 'fan.hallway',
            state: 'on',
            attributes: {
              friendly_name: 'Hallway Fan',
              percentage: 50,
              percentage_step: 25,
              preset_mode: 'auto',
              preset_modes: ['auto', 'sleep'],
            },
            lastChanged: '2026-05-17T00:00:00.000Z',
            lastUpdated: '2026-05-17T00:00:00.000Z',
          },
        },
      ],
    });

    fireEvent.keyDown(screen.getAllByRole('button', { name: 'More actions' })[0], { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: /^Controls$/ }));

    expect(screen.getByText('Fan')).toBeInTheDocument();
    expect(screen.getByText('Fan · 50%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Fan/i }));
    expect(serviceMock.callService).toHaveBeenCalledWith(
      'fan',
      'turn_off',
      {},
      { entity_id: 'fan.hallway' }
    );

    fireEvent.click(screen.getByRole('button', { name: '75%' }));
    expect(serviceMock.callService).toHaveBeenCalledWith(
      'fan',
      'set_percentage',
      { percentage: 75 },
      { entity_id: 'fan.hallway' }
    );

    fireEvent.click(screen.getByRole('button', { name: 'sleep' }));
    expect(serviceMock.callService).toHaveBeenCalledWith(
      'fan',
      'set_preset_mode',
      { preset_mode: 'sleep' },
      { entity_id: 'fan.hallway' }
    );
  });

  it('runs script sibling controls through the generic command path', () => {
    renderDialog({
      siblingEntities: [
        {
          id: 'script.goodnight',
          entity: {
            entityId: 'script.goodnight',
            state: 'off',
            attributes: {
              friendly_name: 'Good night',
            },
            lastChanged: '2026-05-17T00:00:00.000Z',
            lastUpdated: '2026-05-17T00:00:00.000Z',
          },
        },
      ],
    });

    fireEvent.keyDown(screen.getAllByRole('button', { name: 'More actions' })[0], { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: /^Controls$/ }));
    fireEvent.click(screen.getByRole('button', { name: /Good night/i }));

    expect(serviceMock.callService).toHaveBeenCalledWith(
      'script',
      'turn_on',
      {},
      { entity_id: 'script.goodnight' }
    );
  });
});
