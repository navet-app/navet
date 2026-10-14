import type { EnergyConsumerCategory, EnergySourceConfig } from '@navet/core/energy-types';
import type { PlatformMessageClient } from '@navet/core/provider-feature-models';
import type { HaEnergyPrefs } from './homeassistant-energy-helpers';

export async function getEnergyPrefs(messageClient: PlatformMessageClient): Promise<HaEnergyPrefs> {
  return messageClient.sendMessagePromise({ type: 'energy/get_prefs' }) as Promise<HaEnergyPrefs>;
}

const DEVICE_CATEGORY_HINTS: [string, EnergyConsumerCategory][] = [
  ['ev_charger', 'ev_charger'],
  ['ev', 'ev_charger'],
  ['charger', 'ev_charger'],
  ['hvac', 'hvac'],
  ['heat_pump', 'hvac'],
  ['heat pump', 'hvac'],
  ['aircon', 'hvac'],
  ['water_heater', 'water_heater'],
  ['boiler', 'water_heater'],
  ['floor_heating', 'floor_heating'],
  ['underfloor', 'floor_heating'],
  ['dishwasher', 'dishwasher'],
  ['washer', 'washer'],
  ['washing_machine', 'washer'],
  ['dryer', 'dryer'],
  ['toilet_heater', 'toilet_heater'],
  ['bathroom_heater', 'bathroom_heater'],
];

function guessDeviceCategory(name: string): EnergyConsumerCategory {
  const lc = name.toLowerCase();
  return DEVICE_CATEGORY_HINTS.find(([key]) => lc.includes(key))?.[1] ?? 'other';
}

export function mapPrefsToConfig(prefs: HaEnergyPrefs): EnergySourceConfig {
  const config: EnergySourceConfig = {
    devices: [],
  };

  for (const source of prefs.energy_sources) {
    switch (source.type) {
      case 'solar':
        config.solarEnergyEntityId = source.stat_energy_from;
        config.solarPowerEntityId = source.stat_rate;
        break;
      case 'grid':
        config.gridImportEnergyEntityId =
          source.stat_energy_from ?? source.flow_from?.[0]?.stat_energy_from;
        config.gridExportEnergyEntityId =
          source.stat_energy_to ?? source.flow_to?.[0]?.stat_energy_to;
        config.gridImportPowerEntityId = source.stat_rate ?? source.flow_from?.[0]?.stat_rate;
        break;
      case 'battery':
        config.batteryPowerEntityId = source.stat_rate;
        break;
      case 'gas':
        config.gasEnergyEntityId = source.stat_energy_from;
        break;
      case 'water':
        config.hotWaterEnergyEntityId = source.stat_energy_from;
        break;
    }
  }

  config.devices = prefs.device_consumption.map((device) => ({
    entityId: device.stat_consumption,
    name: device.name ?? device.stat_consumption,
    category: guessDeviceCategory(device.name ?? device.stat_consumption),
    powerEntityId: device.stat_rate,
  }));

  if (prefs.device_consumption_water?.length) {
    config.devices.push(
      ...prefs.device_consumption_water.map((device) => ({
        entityId: device.stat_consumption,
        name: device.name ?? device.stat_consumption,
        category: 'water_heater' as const,
        powerEntityId: device.stat_rate,
      }))
    );
  }

  return config;
}
