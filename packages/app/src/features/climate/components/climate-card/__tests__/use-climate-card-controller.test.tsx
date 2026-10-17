import { climateEntityFactory } from '@navet/app/test/fixtures/home-assistant/entities/climate';
import { renderHookWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { act } from '@testing-library/react';
import type { HassConfig } from 'home-assistant-js-websocket';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { runActionMock, serviceMock } = vi.hoisted(() => ({
  runActionMock: vi.fn(async (action: () => Promise<void>) => action()),
  serviceMock: {
    callService: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@navet/app/hooks', async () => {
  const actual = await vi.importActual<typeof import('@navet/app/hooks')>('@navet/app/hooks');

  return {
    ...actual,
    useProviderClimateTopology: () => ({ deviceId: null, siblingIds: [] }),
    useServiceActionHandler: () => runActionMock,
  };
});

vi.mock('@navet/app/commands', () => ({
  dispatchEntityCommand: async (command: {
    type: 'set_climate_mode';
    entityId: string;
    mode: string;
  }) => {
    const { entityId, mode } = command;
    const isWaterHeater = entityId.startsWith('water_heater.');
    await serviceMock.callService(
      isWaterHeater ? 'water_heater' : 'climate',
      isWaterHeater ? 'set_operation_mode' : 'set_hvac_mode',
      isWaterHeater ? { operation_mode: mode } : { hvac_mode: mode },
      { entity_id: entityId }
    );
    return {
      accepted: true,
      requiresEventConfirmation: true,
    };
  },
}));

vi.mock('@navet/app/services/integration-climate-feature.service', () => ({
  integrationClimateFeatureService: {
    setTargetTemperature: async (
      entityId: string,
      update: {
        serviceDomain?: 'climate' | 'water_heater';
        temperature?: number;
        targetTemperatureLow?: number;
        targetTemperatureHigh?: number;
      }
    ) => {
      const serviceData =
        typeof update.temperature === 'number'
          ? { temperature: update.temperature }
          : {
              ...(typeof update.targetTemperatureLow === 'number'
                ? { target_temp_low: update.targetTemperatureLow }
                : {}),
              ...(typeof update.targetTemperatureHigh === 'number'
                ? { target_temp_high: update.targetTemperatureHigh }
                : {}),
            };

      await serviceMock.callService(
        update.serviceDomain ?? (entityId.startsWith('water_heater.') ? 'water_heater' : 'climate'),
        'set_temperature',
        serviceData,
        { entity_id: entityId }
      );
    },
  },
}));

import { homeAssistantStore } from '@navet/app/stores/home-assistant-store';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { useClimateCardController } from '../use-climate-card-controller';

function createClimateEntity(attributes: Record<string, unknown>, state = 'heat') {
  const entity = climateEntityFactory(attributes);
  entity.entity_id = 'climate.hallway';
  entity.state = state;
  if (
    ('target_temp_low' in attributes || 'target_temp_high' in attributes) &&
    !('temperature' in attributes)
  ) {
    delete (entity.attributes as Record<string, unknown>).temperature;
  }
  return entity;
}

describe('useClimateCardController', () => {
  it('resets pending state and cancels an unsent temperature command when the owner changes', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHookWithProviders(
      ({ id, temperature }) =>
        useClimateCardController({
          id,
          name: id,
          initialTemp: temperature,
          initialCurrentTemp: temperature,
          initialMode: 'heat',
          initialState: true,
          isEditMode: false,
          size: 'medium',
        }),
      { initialProps: { id: 'climate.first', temperature: 21 } }
    );
    act(() => {
      result.current.setTargetTemp(24);
    });
    expect(result.current.targetTemp).toBe(24);
    rerender({ id: 'climate.second', temperature: 18 });
    expect(result.current.targetTemp).toBe(18);
    act(() => {
      vi.runAllTimers();
    });
    expect(serviceMock.callService).not.toHaveBeenCalled();
    expect(result.current.targetTemp).toBe(18);
  });

  it('keeps fractional current and target temperatures in Celsius card labels', () => {
    useSettingsStore.setState({ temperatureUnit: 'celsius' });
    const { result } = renderHookWithProviders(() =>
      useClimateCardController({
        id: 'homey:bedroom-radiator',
        name: 'Bedroom radiator valve',
        initialTemp: 19.5,
        initialCurrentTemp: 18.8,
        sourceTemperatureUnit: 'celsius',
        initialMode: 'heat',
        initialState: true,
        isEditMode: false,
        size: 'medium',
      })
    );
    expect(result.current.formatTemperature(result.current.currentTemp)).toBe('18.8°C');
    expect(result.current.formatTemperature(result.current.targetTemp)).toBe('19.5°C');
    expect(result.current.formatTemperatureValue(result.current.targetTemp)).toBe('19.5');
  });

  it('opens controls for a setpoint without inventing a power command', async () => {
    useSettingsStore.setState({ entityInteractionMode: 'toggle-first' });
    const { result } = renderHookWithProviders(() =>
      useClimateCardController({
        id: 'openhab:RadiatorTarget',
        name: 'Radiator',
        initialTemp: 19.5,
        initialCurrentTemp: 18.8,
        initialMode: 'auto',
        supportedClimateModes: [],
        initialState: true,
        isEditMode: false,
        size: 'medium',
      })
    );
    await act(async () =>
      result.current.cardInteraction.iconButtonProps.onClick({
        stopPropagation: () => {},
      } as React.MouseEvent<HTMLButtonElement>)
    );
    expect(result.current.isSettingsOpen).toBe(true);
    expect(serviceMock.callService).not.toHaveBeenCalled();
    expect(result.current.isOn).toBe(true);
  });

  beforeEach(async () => {
    await resetAppStores();
    vi.clearAllMocks();
    useSettingsStore.setState({ temperatureUnit: 'fahrenheit' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not double-convert Fahrenheit source temperatures for display or service calls', async () => {
    const { result } = renderHookWithProviders(() =>
      useClimateCardController({
        id: 'climate.hallway',
        name: 'Hallway',
        initialTemp: 72,
        initialCurrentTemp: 70,
        sourceTemperatureUnit: 'fahrenheit',
        initialMode: 'heat',
        initialState: true,
        isEditMode: false,
        size: 'medium',
      })
    );

    expect(result.current.displayTargetTemp).toBe(72);
    expect(result.current.displayCurrentTemp).toBe(70);
    expect(result.current.formatTemperature(result.current.targetTemp)).toBe('72°F');

    await act(async () => {
      result.current.commitDisplayTargetTemp(73);
    });

    expect(serviceMock.callService).toHaveBeenCalledWith(
      'climate',
      'set_temperature',
      { temperature: 73 },
      { entity_id: 'climate.hallway' }
    );
  });

  it('uses the live entity temperature unit when the initial card props omit it', async () => {
    homeAssistantStore.setState({
      entities: {
        'climate.hallway': createClimateEntity({
          temperature: 72,
          current_temperature: 70,
          temperature_unit: '°F',
        }),
      },
    });

    const { result } = renderHookWithProviders(() =>
      useClimateCardController({
        id: 'climate.hallway',
        name: 'Hallway',
        initialTemp: 21,
        initialCurrentTemp: 20,
        initialMode: 'heat',
        initialState: true,
        isEditMode: false,
        size: 'medium',
      })
    );

    expect(result.current.sourceTemperatureUnit).toBe('fahrenheit');
    expect(result.current.displayTargetTemp).toBe(72);
    expect(result.current.displayCurrentTemp).toBe(70);
    expect(result.current.formatTemperature(result.current.targetTemp)).toBe('72°F');

    await act(async () => {
      result.current.commitDisplayTargetTemp(73);
    });

    expect(serviceMock.callService).toHaveBeenCalledWith(
      'climate',
      'set_temperature',
      { temperature: 73 },
      { entity_id: 'climate.hallway' }
    );
  });

  it('falls back to the Home Assistant config temperature unit when the entity omits it', async () => {
    homeAssistantStore.setState({
      config: {
        unit_system: {
          temperature: '°F',
        },
      } as HassConfig,
      entities: {
        'climate.hallway': createClimateEntity({
          temperature: 72,
          current_temperature: 70,
        }),
      },
    });

    const { result } = renderHookWithProviders(() =>
      useClimateCardController({
        id: 'climate.hallway',
        name: 'Hallway',
        initialTemp: 21,
        initialCurrentTemp: 20,
        initialMode: 'heat',
        initialState: true,
        isEditMode: false,
        size: 'medium',
      })
    );

    expect(result.current.sourceTemperatureUnit).toBe('fahrenheit');
    expect(result.current.displayTargetTemp).toBe(72);
    expect(result.current.displayCurrentTemp).toBe(70);
    expect(result.current.formatTemperature(result.current.targetTemp)).toBe('72°F');

    await act(async () => {
      result.current.commitDisplayTargetTemp(73);
    });

    expect(serviceMock.callService).toHaveBeenCalledWith(
      'climate',
      'set_temperature',
      { temperature: 73 },
      { entity_id: 'climate.hallway' }
    );
  });

  it('normalizes Fahrenheit control steps for Celsius-backed thermostats', () => {
    homeAssistantStore.setState({
      config: {
        unit_system: {
          temperature: '°F',
        },
      } as HassConfig,
      entities: {
        'climate.hallway': createClimateEntity({
          temperature: 23,
          current_temperature: 23,
          target_temp_step: 0.5,
          temperature_unit: '°C',
        }),
      },
    });

    const { result } = renderHookWithProviders(() =>
      useClimateCardController({
        id: 'climate.hallway',
        name: 'Hallway',
        initialTemp: 21,
        initialCurrentTemp: 21,
        initialMode: 'cool',
        initialState: true,
        isEditMode: false,
        size: 'medium',
      })
    );

    expect(result.current.displayTargetTemp).toBeCloseTo(73.4, 1);
    expect(result.current.controlDisplayTargetTemp).toBe(73);
    expect(result.current.controlDisplayMinTemp).toBe(61);
    expect(result.current.controlDisplayStep).toBe(1);
  });

  it('syncs numeric string temperatures from live Home Assistant entities', () => {
    homeAssistantStore.setState({
      entities: {
        'climate.hallway': createClimateEntity({
          temperature: '21.5',
          current_temperature: '20.25',
          temperature_unit: '°C',
        }),
      },
    });

    const { result } = renderHookWithProviders(() =>
      useClimateCardController({
        id: 'climate.hallway',
        name: 'Hallway',
        initialTemp: 18,
        initialCurrentTemp: 18,
        initialMode: 'heat',
        initialState: true,
        isEditMode: false,
        size: 'medium',
      })
    );

    expect(result.current.targetTemp).toBe(21.5);
    expect(result.current.currentTemp).toBe(20.25);
  });

  it('syncs Nest-style heat-cool target range temperatures from live entities', () => {
    homeAssistantStore.setState({
      entities: {
        'climate.hallway': createClimateEntity(
          {
            current_temperature: 23,
            target_temp_low: 20,
            target_temp_high: 24,
            hvac_action: 'cooling',
            hvac_modes: ['heat', 'cool', 'heat_cool', 'off'],
            temperature_unit: '°C',
          },
          'heat_cool'
        ),
      },
    });

    const { result } = renderHookWithProviders(() =>
      useClimateCardController({
        id: 'climate.hallway',
        name: 'Hallway',
        initialTemp: 0,
        initialCurrentTemp: 0,
        initialMode: 'heat_cool',
        initialState: true,
        isEditMode: false,
        size: 'medium',
      })
    );

    expect(result.current.targetTemp).toBe(24);
    expect(result.current.currentTemp).toBe(23);
    expect(result.current.mode).toBe('heat_cool');
    expect(result.current.visualMode).toBe('heat');
  });

  it('does not flip a heat-only thermostat into a cooling visual state', () => {
    homeAssistantStore.setState({
      entities: {
        'climate.hallway': createClimateEntity(
          {
            temperature: 20,
            current_temperature: 25,
            hvac_action: 'heating',
            hvac_modes: ['heat', 'cool', 'off'],
            temperature_unit: '°C',
          },
          'heat'
        ),
      },
    });

    const { result } = renderHookWithProviders(() =>
      useClimateCardController({
        id: 'climate.hallway',
        name: 'Hallway',
        initialTemp: 22,
        initialCurrentTemp: 22,
        initialMode: 'heat',
        initialAction: 'heating',
        initialState: true,
        isEditMode: false,
        size: 'medium',
      })
    );

    expect(result.current.targetTemp).toBe(20);
    expect(result.current.currentTemp).toBe(25);
    expect(result.current.visualMode).toBe('heat');
  });

  it('uses an idle visual mode when a cool-only thermostat is already below target', () => {
    homeAssistantStore.setState({
      entities: {
        'climate.hallway': createClimateEntity(
          {
            temperature: 76,
            current_temperature: 75,
            hvac_action: 'idle',
            hvac_modes: ['cool', 'off'],
            temperature_unit: '°F',
          },
          'cool'
        ),
      },
    });

    const { result } = renderHookWithProviders(() =>
      useClimateCardController({
        id: 'climate.hallway',
        name: 'Hallway',
        initialTemp: 76,
        initialCurrentTemp: 76,
        initialMode: 'cool',
        initialAction: 'idle',
        initialState: true,
        isEditMode: false,
        size: 'medium',
      })
    );

    expect(result.current.targetTemp).toBe(76);
    expect(result.current.currentTemp).toBe(75);
    expect(result.current.visualMode).toBe('idle');
  });

  it('uses an idle visual mode when Home Assistant reports idle in auto mode', () => {
    homeAssistantStore.setState({
      entities: {
        'climate.hallway': createClimateEntity(
          {
            temperature: 20,
            current_temperature: 23,
            hvac_action: 'idle',
            hvac_modes: ['heat', 'cool', 'heat_cool', 'off'],
            temperature_unit: '°C',
          },
          'heat_cool'
        ),
      },
    });

    const { result } = renderHookWithProviders(() =>
      useClimateCardController({
        id: 'climate.hallway',
        name: 'Hallway',
        initialTemp: 20,
        initialCurrentTemp: 23,
        initialMode: 'heat_cool',
        initialAction: 'idle',
        initialState: true,
        isEditMode: false,
        size: 'medium',
      })
    );

    expect(result.current.visualMode).toBe('idle');
  });

  it('does not treat the fallback setpoint as a target when the live entity has none', () => {
    const entity = createClimateEntity({ current_temperature: 20, hvac_action: 'idle' }, 'heat');
    delete (entity.attributes as Record<string, unknown>).temperature;
    homeAssistantStore.setState({ entities: { 'climate.hallway': entity } });

    const { result } = renderHookWithProviders(() =>
      useClimateCardController({
        id: 'climate.hallway',
        name: 'Hallway',
        initialTemp: 21,
        initialCurrentTemp: 20,
        initialMode: 'heat',
        initialAction: 'idle',
        initialState: true,
        isEditMode: false,
        size: 'medium',
      })
    );

    expect(result.current.visualMode).toBe('idle');
    expect(result.current.targetTemp).toBe(21);
    expect(result.current.hasTargetTemperature).toBe(false);
  });

  it('commits Nest-style cooling changes through target_temp_high', async () => {
    homeAssistantStore.setState({
      entities: {
        'climate.hallway': createClimateEntity(
          {
            current_temperature: 23,
            target_temp_low: 20,
            target_temp_high: 24,
            hvac_action: 'cooling',
            hvac_modes: ['heat', 'cool', 'heat_cool', 'off'],
            temperature_unit: '°C',
          },
          'heat_cool'
        ),
      },
    });

    const { result } = renderHookWithProviders(() =>
      useClimateCardController({
        id: 'climate.hallway',
        name: 'Hallway',
        initialTemp: 24,
        initialCurrentTemp: 23,
        initialMode: 'heat_cool',
        initialState: true,
        isEditMode: false,
        size: 'medium',
      })
    );

    await act(async () => {
      result.current.commitTargetTemp(25);
    });

    expect(serviceMock.callService).toHaveBeenCalledWith(
      'climate',
      'set_temperature',
      { target_temp_high: 25 },
      { entity_id: 'climate.hallway' }
    );
    expect(serviceMock.callService).toHaveBeenCalledTimes(1);
  });

  it('uses the optimistic Climate mode when sending a temperature update before the entity echo arrives', async () => {
    homeAssistantStore.setState({
      entities: {
        'climate.hallway': createClimateEntity(
          {
            current_temperature: 23,
            target_temp_low: 20,
            target_temp_high: 24,
            hvac_action: 'cooling',
            hvac_modes: ['heat', 'cool', 'heat_cool', 'off'],
            temperature_unit: '°C',
          },
          'heat_cool'
        ),
      },
    });

    const { result } = renderHookWithProviders(() =>
      useClimateCardController({
        id: 'climate.hallway',
        name: 'Hallway',
        initialTemp: 24,
        initialCurrentTemp: 23,
        initialMode: 'heat_cool',
        initialAction: 'cooling',
        initialState: true,
        isEditMode: false,
        size: 'medium',
      })
    );

    await act(async () => {
      result.current.setMode('heat');
      result.current.commitTargetTemp(21);
    });

    expect(serviceMock.callService).toHaveBeenCalledWith(
      'climate',
      'set_temperature',
      { target_temp_low: 21 },
      { entity_id: 'climate.hallway' }
    );
  });

  it('dispatches water heater mode changes through operation-mode services', async () => {
    const { result } = renderHookWithProviders(() =>
      useClimateCardController({
        id: 'water_heater.boiler',
        name: 'Boiler',
        initialTemp: 48,
        initialCurrentTemp: 48,
        initialMode: 'eco',
        initialState: true,
        isEditMode: false,
        size: 'medium',
      })
    );

    await act(async () => {
      result.current.setMode('performance');
    });

    expect(serviceMock.callService).toHaveBeenCalledWith(
      'water_heater',
      'set_operation_mode',
      { operation_mode: 'performance' },
      { entity_id: 'water_heater.boiler' }
    );
  });

  it('treats the entity state as the canonical live Climate mode', () => {
    homeAssistantStore.setState({
      entities: {
        'climate.hallway': createClimateEntity(
          {
            temperature: 21,
            current_temperature: 20,
            hvac_mode: 'heat',
          },
          'cool'
        ),
      },
    });

    const { result } = renderHookWithProviders(() =>
      useClimateCardController({
        id: 'climate.hallway',
        name: 'Hallway',
        initialTemp: 18,
        initialCurrentTemp: 18,
        initialMode: 'heat',
        initialState: true,
        isEditMode: false,
        size: 'medium',
      })
    );

    expect(result.current.mode).toBe('cool');

    act(() => {
      homeAssistantStore.setState({
        entities: {
          'climate.hallway': createClimateEntity(
            {
              temperature: 21,
              current_temperature: 20,
              hvac_mode: 'cool',
            },
            'heat'
          ),
        },
      });
    });

    expect(result.current.mode).toBe('heat');
  });

  it('reconciles a clamped Home Assistant target temperature after the pending echo window', async () => {
    vi.useFakeTimers();
    homeAssistantStore.setState({
      entities: {
        'climate.hallway': createClimateEntity({
          temperature: 21,
          current_temperature: 20,
          temperature_unit: '°C',
        }),
      },
    });

    const { result } = renderHookWithProviders(() =>
      useClimateCardController({
        id: 'climate.hallway',
        name: 'Hallway',
        initialTemp: 21,
        initialCurrentTemp: 20,
        initialMode: 'heat',
        initialState: true,
        isEditMode: false,
        size: 'medium',
      })
    );

    await act(async () => {
      result.current.commitTargetTemp(21.5);
    });

    expect(result.current.targetTemp).toBe(21.5);

    act(() => {
      homeAssistantStore.setState({
        entities: {
          'climate.hallway': createClimateEntity({
            temperature: 21,
            current_temperature: 20,
            temperature_unit: '°C',
          }),
        },
      });
    });

    expect(result.current.targetTemp).toBe(21.5);

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(result.current.targetTemp).toBe(21);
  });

  it('holds the optimistic Climate mode until the pending echo window resolves', async () => {
    vi.useFakeTimers();
    homeAssistantStore.setState({
      entities: {
        'climate.hallway': createClimateEntity(
          {
            temperature: 21,
            current_temperature: 20,
            temperature_unit: '°C',
            hvac_action: 'cooling',
          },
          'cool'
        ),
      },
    });

    const { result } = renderHookWithProviders(() =>
      useClimateCardController({
        id: 'climate.hallway',
        name: 'Hallway',
        initialTemp: 21,
        initialCurrentTemp: 20,
        initialMode: 'cool',
        initialAction: 'cooling',
        initialState: true,
        isEditMode: false,
        size: 'medium',
      })
    );

    await act(async () => {
      result.current.setMode('heat');
    });

    expect(result.current.mode).toBe('heat');
    expect(result.current.isOn).toBe(true);

    act(() => {
      homeAssistantStore.setState({
        entities: {
          'climate.hallway': createClimateEntity(
            {
              temperature: 21,
              current_temperature: 20,
              temperature_unit: '°C',
              hvac_action: 'cooling',
            },
            'cool'
          ),
        },
      });
    });

    expect(result.current.mode).toBe('heat');

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(result.current.mode).toBe('cool');
  });

  it('holds the optimistic off state until the pending echo window resolves', async () => {
    vi.useFakeTimers();
    homeAssistantStore.setState({
      entities: {
        'climate.hallway': createClimateEntity(
          {
            temperature: 21,
            current_temperature: 20,
            temperature_unit: '°C',
            hvac_action: 'cooling',
          },
          'cool'
        ),
      },
    });

    const { result } = renderHookWithProviders(() =>
      useClimateCardController({
        id: 'climate.hallway',
        name: 'Hallway',
        initialTemp: 21,
        initialCurrentTemp: 20,
        initialMode: 'cool',
        initialAction: 'cooling',
        initialState: true,
        isEditMode: false,
        size: 'medium',
      })
    );

    await act(async () => {
      result.current.setMode('off');
    });

    expect(result.current.mode).toBe('off');
    expect(result.current.isOn).toBe(false);

    act(() => {
      homeAssistantStore.setState({
        entities: {
          'climate.hallway': createClimateEntity(
            {
              temperature: 21,
              current_temperature: 20,
              temperature_unit: '°C',
              hvac_action: 'cooling',
            },
            'cool'
          ),
        },
      });
    });

    expect(result.current.mode).toBe('off');
    expect(result.current.isOn).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(result.current.mode).toBe('cool');
    expect(result.current.isOn).toBe(true);
  });

  it('toggles Climate power instead of opening controls in toggle-first mode', async () => {
    useSettingsStore.setState({ entityInteractionMode: 'toggle-first' });
    const { result } = renderHookWithProviders(() =>
      useClimateCardController({
        id: 'climate.hallway',
        name: 'Hallway',
        initialTemp: 21,
        initialCurrentTemp: 20,
        initialMode: 'cool',
        initialState: true,
        isEditMode: false,
        size: 'medium',
      })
    );
    const cardElement = document.createElement('div');

    await act(async () => {
      result.current.cardInteraction.cardProps.onClick?.({
        currentTarget: cardElement,
        target: cardElement,
      } as never);
    });

    expect(serviceMock.callService).toHaveBeenCalledWith(
      'climate',
      'set_hvac_mode',
      { hvac_mode: 'off' },
      { entity_id: 'climate.hallway' }
    );
    expect(result.current.isOn).toBe(false);
    expect(result.current.isSettingsOpen).toBe(false);
  });

  it('restores the last active Climate mode when toggled back on', async () => {
    useSettingsStore.setState({ entityInteractionMode: 'toggle-first' });
    const { result } = renderHookWithProviders(() =>
      useClimateCardController({
        id: 'climate.hallway',
        name: 'Hallway',
        initialTemp: 21,
        initialCurrentTemp: 20,
        initialMode: 'off',
        initialState: false,
        supportedClimateModes: ['cool', 'heat', 'off'],
        isEditMode: false,
        size: 'medium',
      })
    );
    const cardElement = document.createElement('div');

    await act(async () => {
      result.current.cardInteraction.cardProps.onClick?.({
        currentTarget: cardElement,
        target: cardElement,
      } as never);
    });

    expect(serviceMock.callService).toHaveBeenCalledWith(
      'climate',
      'set_hvac_mode',
      { hvac_mode: 'cool' },
      { entity_id: 'climate.hallway' }
    );
    expect(result.current.isSettingsOpen).toBe(false);
  });

  it('renders active water heater operating modes with the heat visual tone', () => {
    const { result } = renderHookWithProviders(() =>
      useClimateCardController({
        id: 'water_heater.boiler',
        name: 'Boiler',
        initialTemp: 48,
        initialCurrentTemp: 48,
        initialMode: 'eco',
        initialState: true,
        isEditMode: false,
        size: 'medium',
      })
    );

    expect(result.current.mode).toBe('eco');
    expect(result.current.visualMode).toBe('heat');
  });
});
