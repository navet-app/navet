import { lightEntityFactory } from './entities/light';

/** Entity registry metadata survives when a config-entry-backed entity is unavailable. */
export const integrationReloadFixture = {
  entity: { ...lightEntityFactory(), state: 'unavailable' },
  configEntry: {
    entry_id: '01J7Q8TYE0CNCSBWQ6GHEVQ1ZF',
    domain: 'hue',
    title: 'Hue Bridge',
    state: 'loaded',
    supports_unload: true,
  },
  registryEntry: {
    entity_id: 'light.kitchen',
    config_entry_id: '01J7Q8TYE0CNCSBWQ6GHEVQ1ZF',
    platform: 'hue',
    device_id: 'a8c14bc87a654d7a99fe5142eb40501c',
    area_id: 'kitchen',
    name: null,
    original_name: 'Kitchen Light',
    entity_category: null,
  },
};
