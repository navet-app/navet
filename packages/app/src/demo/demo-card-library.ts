import type { CardTemplateId } from '@navet/app/features/dashboard/components/add-entity-dialog/types';
import type { DashboardLibraryCard } from '@navet/app/features/dashboard/components/dashboard-library-list';
import { getPreviewRuntimeScenario } from '@navet/app/preview/runtime';

const DEMO_LIBRARY_TYPES: Record<string, string> = {
  light: 'Light',
  fan: 'Fan',
  hvac: 'Climate',
  climate: 'Humidifier',
  media_player: 'Media player',
  weather: 'Weather',
  switch: 'Switch',
  helper: 'Helper',
  cover: 'Cover',
  lock: 'Lock',
  scene: 'Scene',
  camera: 'Camera',
  person: 'Person',
  vacuum: 'Vacuum',
  calendar: 'Calendar',
};

export const demoHomeLibraryCards: DashboardLibraryCard[] = getPreviewRuntimeScenario('demo')
  .entities.filter((entity) => entity.type in DEMO_LIBRARY_TYPES)
  .map((entity) => ({
    id: entity.canonicalId,
    title: entity.name,
    subtitle: entity.room ?? 'Home',
    room: entity.room,
    meta: DEMO_LIBRARY_TYPES[entity.type],
    kind: 'device',
    entityType: entity.type,
    entityTypeLabel: DEMO_LIBRARY_TYPES[entity.type],
    idSearchText: entity.externalId,
  }));

export const DEMO_CARD_TEMPLATE_IDS: CardTemplateId[] = [
  'note',
  'info',
  'ups',
  'battery',
  'photo',
  'button',
  'map',
];
