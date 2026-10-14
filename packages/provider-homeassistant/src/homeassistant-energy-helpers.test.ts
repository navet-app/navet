import legacyGridPreferences from '@navet/app/test/fixtures/home-assistant/energy/legacy-grid-preferences.json';
import { describe, expect, it } from 'vitest';
import {
  augmentConfigWithLivePowerEntities,
  type HaEnergyPrefs,
} from './homeassistant-energy-helpers';
import { mapPrefsToConfig } from './homeassistant-energy-source-config';

describe('mapPrefsToConfig', () => {
  it('maps top-level grid import and export energy statistics from Home Assistant prefs', () => {
    const config = mapPrefsToConfig({
      energy_sources: [
        {
          type: 'grid',
          stat_energy_from: 'sensor.develco_zhemi101_summation_delivered',
          stat_energy_to: 'sensor.develco_zhemi101_summation_received',
        },
      ],
      device_consumption: [],
    });

    expect(config.gridImportEnergyEntityId).toBe('sensor.develco_zhemi101_summation_delivered');
    expect(config.gridExportEnergyEntityId).toBe('sensor.develco_zhemi101_summation_received');
    expect(config.gridImportPowerEntityId).toBeUndefined();
    expect(config.gridExportPowerEntityId).toBeUndefined();
  });

  it('maps flow-based grid energy statistics from Home Assistant prefs', () => {
    const config = mapPrefsToConfig(legacyGridPreferences as HaEnergyPrefs);

    expect(config.gridImportEnergyEntityId).toBe('sensor.grid_import_energy');
    expect(config.gridExportEnergyEntityId).toBe('sensor.grid_export_energy');
    expect(config.gridImportPowerEntityId).toBeUndefined();
    expect(config.gridExportPowerEntityId).toBeUndefined();
  });

  it('maps solar energy statistics without guessing a live power sensor', () => {
    const config = mapPrefsToConfig({
      energy_sources: [{ type: 'solar', stat_energy_from: 'sensor.solar_energy' }],
      device_consumption: [],
    });

    expect(config.solarEnergyEntityId).toBe('sensor.solar_energy');
    expect(config.solarPowerEntityId).toBeUndefined();
  });

  it('maps device consumption from Home Assistant Energy prefs only', () => {
    const config = mapPrefsToConfig({
      energy_sources: [],
      device_consumption: [
        { stat_consumption: 'sensor.ev_charger_energy', name: 'EV charger' },
        { stat_consumption: 'sensor.dishwasher_energy' },
      ],
      device_consumption_water: [{ stat_consumption: 'sensor.hot_water_meter' }],
    });

    expect(config.devices).toEqual([
      {
        entityId: 'sensor.ev_charger_energy',
        name: 'EV charger',
        category: 'ev_charger',
      },
      {
        entityId: 'sensor.dishwasher_energy',
        name: 'sensor.dishwasher_energy',
        category: 'dishwasher',
      },
      {
        entityId: 'sensor.hot_water_meter',
        name: 'sensor.hot_water_meter',
        category: 'water_heater',
      },
    ]);
  });

  it('returns no configured sources for empty Home Assistant Energy prefs', () => {
    const emptyPrefs: HaEnergyPrefs = { energy_sources: [], device_consumption: [] };

    expect(mapPrefsToConfig(emptyPrefs)).toEqual({ devices: [] });
  });

  it('maps gas and water energy statistics from Home Assistant prefs', () => {
    const config = mapPrefsToConfig({
      energy_sources: [
        { type: 'gas', stat_energy_from: 'sensor.gas_energy' },
        { type: 'water', stat_energy_from: 'sensor.hot_water_energy' },
      ],
      device_consumption: [],
    });

    expect(config.gasEnergyEntityId).toBe('sensor.gas_energy');
    expect(config.hotWaterEnergyEntityId).toBe('sensor.hot_water_energy');
  });
});

describe('augmentConfigWithLivePowerEntities', () => {
  it('adds runtime-only live power sensors related to HA Energy statistics', () => {
    const config = mapPrefsToConfig({
      energy_sources: [
        {
          type: 'grid',
          stat_energy_from: 'sensor.develco_zhemi101_summation_delivered',
        },
      ],
      device_consumption: [
        { stat_consumption: 'sensor.bathroom_floor_energy_usage' },
        { stat_consumption: 'sensor.toilet_energy_usage' },
        { stat_consumption: 'sensor.ikea_of_sweden_inspelning_smart_plug_summation_delivered' },
      ],
    });

    const augmented = augmentConfigWithLivePowerEntities(config, {
      sensor: { state: 'unused' },
      'sensor.develco_zhemi101_instantaneous_demand': {
        state: '2424',
        attributes: { device_class: 'power', unit_of_measurement: 'W' },
      },
      'sensor.bathroom_floor_power': {
        state: '120',
        attributes: { device_class: 'power', unit_of_measurement: 'W' },
      },
      'sensor.toilet_power': {
        state: '60',
        attributes: { device_class: 'power', unit_of_measurement: 'W' },
      },
      'sensor.ikea_of_sweden_inspelning_smart_plug_power': {
        state: '450',
        attributes: { device_class: 'power', unit_of_measurement: 'W' },
      },
    });

    expect(augmented.homeLoadPowerEntityId).toBe('sensor.develco_zhemi101_instantaneous_demand');
    expect(augmented.gridImportPowerEntityId).toBe('sensor.develco_zhemi101_instantaneous_demand');
    expect(augmented.devices.map((device) => device.powerEntityId)).toEqual([
      'sensor.bathroom_floor_power',
      'sensor.toilet_power',
      'sensor.ikea_of_sweden_inspelning_smart_plug_power',
    ]);
  });

  it('does not persist or invent power sensors when no related HA entity exists', () => {
    const config = mapPrefsToConfig({
      energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid_import_energy' }],
      device_consumption: [{ stat_consumption: 'sensor.unknown_energy' }],
    });

    expect(augmentConfigWithLivePowerEntities(config, {})).toEqual(config);
  });

  it('matches live power sensors through the Home Assistant entity registry', () => {
    const config = mapPrefsToConfig({
      energy_sources: [
        { type: 'grid', stat_energy_from: 'sensor.meter_total_import' },
        { type: 'solar', stat_energy_from: 'sensor.roof_array_lifetime_production' },
      ],
      device_consumption: [{ stat_consumption: 'sensor.heat_pump_total_consumption' }],
    });

    const augmented = augmentConfigWithLivePowerEntities(
      config,
      {
        'sensor.meter_total_import': {
          state: '1400',
          attributes: { device_class: 'energy', unit_of_measurement: 'kWh' },
        },
        'sensor.meter_active_load': {
          state: '650',
          attributes: { device_class: 'power', unit_of_measurement: 'W' },
        },
        'sensor.roof_array_lifetime_production': {
          state: '9000',
          attributes: { device_class: 'energy', unit_of_measurement: 'kWh' },
        },
        'sensor.roof_array_output': {
          state: '1.8',
          attributes: { device_class: 'power', unit_of_measurement: 'kW' },
        },
        'sensor.heat_pump_total_consumption': {
          state: '120',
          attributes: { device_class: 'energy', unit_of_measurement: 'kWh' },
        },
        'sensor.heat_pump_live_draw': {
          state: '340',
          attributes: { device_class: 'power', unit_of_measurement: 'W' },
        },
      },
      [
        { entityId: 'sensor.meter_total_import', deviceId: 'meter-device' },
        { entityId: 'sensor.meter_active_load', deviceId: 'meter-device' },
        { entityId: 'sensor.roof_array_lifetime_production', deviceId: 'solar-device' },
        { entityId: 'sensor.roof_array_output', deviceId: 'solar-device' },
        { entityId: 'sensor.heat_pump_total_consumption', deviceId: 'heat-pump-device' },
        { entityId: 'sensor.heat_pump_live_draw', deviceId: 'heat-pump-device' },
      ]
    );

    expect(augmented.gridImportPowerEntityId).toBe('sensor.meter_active_load');
    expect(augmented.homeLoadPowerEntityId).toBe('sensor.meter_active_load');
    expect(augmented.solarPowerEntityId).toBe('sensor.roof_array_output');
    expect(augmented.devices[0]?.powerEntityId).toBe('sensor.heat_pump_live_draw');
  });
});
