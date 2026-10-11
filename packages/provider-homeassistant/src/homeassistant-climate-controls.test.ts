import { advancedClimateEntityFactory } from '@navet/app/test/fixtures/home-assistant/entities/advanced-climate';
import { readNavetClimateControlState } from '@navet/core/climate-controls';
import type { NavetCommand } from '@navet/core/types';
import { describe, expect, it } from 'vitest';
import { getHomeAssistantClimateControlCommandRoute } from './homeassistant-climate-controls';
import { mapHomeAssistantEntitiesToNavetEntities } from './homeassistant-mappers';

function mapped(attributes: Record<string, unknown> = {}, state = 'cool') {
  const raw = advancedClimateEntityFactory(attributes, state);
  return mapHomeAssistantEntitiesToNavetEntities({
    entities: { [raw.entity_id]: raw },
    areas: [],
    entityRegistry: [],
    deviceRegistry: [],
  })[0];
}

describe('advanced climate adapter boundary', () => {
  it('normalizes advertised controls while retaining HVAC state and temperature', () => {
    const entity = mapped();
    expect(entity).toMatchObject({
      type: 'climate',
      primaryState: 'cool',
      attributes: {
        temperature: 22,
        currentTemperature: 24,
        mode: 'cool',
        supportedHvacModes: ['off', 'cool', 'heat', 'dry', 'fan_only'],
      },
    });
    expect(readNavetClimateControlState(entity)).toEqual({
      writable: true,
      preset: { value: 'eco', options: ['none', 'eco', 'sleep'] },
      fanMode: { value: 'auto', options: ['auto', 'quiet', 'high'] },
      swingMode: { value: 'off', options: ['off', 'vertical'] },
      swingHorizontalMode: { value: 'off', options: ['off', 'on'] },
      targetHumidity: { value: 45, min: 30, max: 70, step: 5 },
      currentHumidity: 55,
    });
  });
  it.each([
    [{ type: 'set_climate_preset', preset: 'sleep' }, 'set_preset_mode', { preset_mode: 'sleep' }],
    [{ type: 'set_climate_fan_mode', mode: 'quiet' }, 'set_fan_mode', { fan_mode: 'quiet' }],
    [
      { type: 'set_climate_swing_mode', mode: 'vertical' },
      'set_swing_mode',
      { swing_mode: 'vertical' },
    ],
    [
      { type: 'set_climate_swing_horizontal_mode', mode: 'on' },
      'set_swing_horizontal_mode',
      { swing_horizontal_mode: 'on' },
    ],
    [{ type: 'set_climate_humidity', humidity: 50 }, 'set_humidity', { humidity: 50 }],
  ])('translates %j to an exact HA service', (command, service, data) => {
    const entity = mapped();
    expect(
      getHomeAssistantClimateControlCommandRoute(entity, {
        ...command,
        entityId: entity.id,
      } as NavetCommand)
    ).toEqual({ service, data });
  });
  it.each([
    { type: 'set_climate_preset', preset: 'invalid' },
    { type: 'set_climate_fan_mode', mode: 'invalid' },
    { type: 'set_climate_swing_mode', mode: 'both' },
    { type: 'set_climate_swing_horizontal_mode', mode: 'vertical' },
    { type: 'set_climate_humidity', humidity: 29 },
    { type: 'set_climate_humidity', humidity: 71 },
    { type: 'set_climate_humidity', humidity: Number.NaN },
    { type: 'set_climate_humidity', humidity: 40.5 },
  ])('rejects unsupported options and humidity %j', (command) => {
    const entity = mapped();
    expect(() =>
      getHomeAssistantClimateControlCommandRoute(entity, {
        ...command,
        entityId: entity.id,
      } as NavetCommand)
    ).toThrow();
  });
  it('accepts bounded integer humidity with fractional limits without truncating fractional writes', () => {
    const entity = mapped({ min_humidity: 30.5, max_humidity: 70.5, target_humidity_step: 1 });
    for (const humidity of [31, 70]) {
      expect(
        getHomeAssistantClimateControlCommandRoute(entity, {
          type: 'set_climate_humidity',
          entityId: entity.id,
          humidity,
        })
      ).toEqual({ service: 'set_humidity', data: { humidity } });
    }
    for (const humidity of [30, 31.5, 71]) {
      expect(() =>
        getHomeAssistantClimateControlCommandRoute(entity, {
          type: 'set_climate_humidity',
          entityId: entity.id,
          humidity,
        })
      ).toThrow();
    }
  });
  it('requires feature flags even when attributes include option lists', () => {
    const entity = mapped({ supported_features: 1 });
    expect(entity.capabilities).toEqual(['temperature_setpoint']);
    expect(readNavetClimateControlState(entity)).toEqual({ writable: true, currentHumidity: 55 });
    expect(() =>
      getHomeAssistantClimateControlCommandRoute(entity, {
        type: 'set_climate_preset',
        preset: 'eco',
        entityId: entity.id,
      })
    ).toThrow();
  });
  it('treats horizontal swing as independent and keeps combined swing options intact', () => {
    const entity = mapped({
      supported_features: 1 | 32,
      swing_modes: ['off', 'both', 'horizontal', 'vertical'],
    });
    expect(readNavetClimateControlState(entity)).toMatchObject({
      swingMode: { options: ['off', 'both', 'horizontal', 'vertical'] },
    });
    expect(readNavetClimateControlState(entity)?.swingHorizontalMode).toBeUndefined();
  });
  it.each(['unavailable', 'unknown'])('disables controls for %s state', (state) => {
    const entity = mapped({}, state);
    expect(readNavetClimateControlState(entity)?.writable).toBe(false);
    expect(() =>
      getHomeAssistantClimateControlCommandRoute(entity, {
        type: 'set_climate_fan_mode',
        mode: 'quiet',
        entityId: entity.id,
      })
    ).toThrow();
  });
  it('rejects malformed lists/bounds and ignores missing advertised capabilities', () => {
    const entity = mapped({
      preset_modes: ['eco', 1],
      fan_modes: [],
      swing_modes: null,
      swing_horizontal_modes: [''],
      min_humidity: 80,
      max_humidity: 70,
    });
    expect(entity.capabilities).toEqual(['temperature_setpoint']);
    expect(readNavetClimateControlState(entity)).toEqual({ writable: true, currentHumidity: 55 });
    expect(readNavetClimateControlState({ ...mapped(), capabilities: [] })).toEqual({
      writable: true,
      currentHumidity: 55,
    });
  });
  it('uses an integer humidity step when the optional backend step is absent', () => {
    expect(
      readNavetClimateControlState(mapped({ target_humidity_step: undefined }))?.targetHumidity
        ?.step
    ).toBe(1);
    expect(
      readNavetClimateControlState(mapped({ target_humidity_step: -1 }))?.targetHumidity
    ).toBeUndefined();
  });
  it('never routes advanced climate commands to sibling fans, water heaters or humidifiers', () => {
    for (const domain of ['fan', 'water_heater', 'humidifier']) {
      const entity = { ...mapped(), externalId: `${domain}.living_room` };
      expect(() =>
        getHomeAssistantClimateControlCommandRoute(entity, {
          type: 'set_climate_fan_mode',
          mode: 'quiet',
          entityId: entity.id,
        })
      ).toThrow();
    }
  });
});
