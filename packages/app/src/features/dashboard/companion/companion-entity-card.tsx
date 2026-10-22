import { mapNavetEntitiesToDeviceCollection } from '@navet/app/core/navet-device-collections';
import type { NavetEntity } from '@navet/core/types';
import { renderCard } from '../utils/card-renderer';

const keepPanelSize = () => {};

/** Reuse the dashboard's entity mapping and controls instead of routing to a section. */
export function CompanionEntityCard({ entity }: { entity: NavetEntity }) {
  const collection = mapNavetEntitiesToDeviceCollection([entity]);
  for (const type of Object.keys(collection) as (keyof typeof collection)[]) {
    const device = collection[type].find((item) => item.id === entity.canonicalId);
    if (device) {
      return renderCard({
        device: { ...device, type } as Parameters<typeof renderCard>[0]['device'],
        size: type === 'locks' ? 'small' : 'medium',
        handleSizeChange: keepPanelSize,
        isEditMode: false,
      });
    }
  }
  return renderCard({
    device: {
      id: entity.canonicalId,
      type: 'sensors',
      name: entity.name,
      providerId: entity.providerId,
      value: String(entity.primaryState ?? '—'),
      unit: typeof entity.attributes.unit === 'string' ? entity.attributes.unit : '',
    },
    size: 'medium',
    handleSizeChange: keepPanelSize,
    isEditMode: false,
  });
}
