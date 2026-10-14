import type { EnergySourceConfig } from '@navet/core/energy-types';
import type { PlatformMessageClient } from '@navet/core/provider-feature-models';
import type { ProviderEnergyFeatureService } from '@navet/core/provider-feature-services';
import {
  augmentConfigWithLivePowerEntities,
  type HaEnergyEntityMap,
  type HaEnergyEntityRegistryEntry,
} from './homeassistant-energy-helpers';

export const homeAssistantEnergyFeatureService: ProviderEnergyFeatureService = {
  async getSourceConfig(messageClient: PlatformMessageClient): Promise<EnergySourceConfig> {
    const { getEnergyPrefs, mapPrefsToConfig } = await import(
      './homeassistant-energy-source-config'
    );
    const prefs = await getEnergyPrefs(messageClient);
    return mapPrefsToConfig(prefs);
  },

  augmentSourceConfig(
    config: EnergySourceConfig,
    entities: HaEnergyEntityMap,
    entityRegistry: HaEnergyEntityRegistryEntry[] = []
  ): EnergySourceConfig {
    return augmentConfigWithLivePowerEntities(config, entities, entityRegistry);
  },
};
