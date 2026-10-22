import type { EntityCardDialogControl } from '@navet/app/components/shared/entity-card-dialog';
import { mapNavetEntitiesToDeviceCollection } from '@navet/app/core/navet-device-collections';
import { readNavetAlarmEntity } from '@navet/app/core/navet-device-state';
import { SecurityPanelCard } from '@navet/app/features/security/components/alarm-panel-card';
import type { NavetEntity } from '@navet/core/types';
import { renderCard } from '../utils/card-renderer';

const keepPanelSize = () => {};

/** Open the feature-owned dialog with the same mapping used by dashboard cards. */
export function CompanionEntityDialog({
  entity,
  dialog,
}: {
  entity: NavetEntity;
  dialog: EntityCardDialogControl;
}) {
  const alarm = readNavetAlarmEntity(entity);
  if (alarm) return <SecurityPanelCard alarms={[alarm]} dialog={dialog} />;
  const collection = mapNavetEntitiesToDeviceCollection([entity]);
  for (const type of Object.keys(collection) as (keyof typeof collection)[]) {
    const device = collection[type].find((item) => item.id === entity.canonicalId);
    if (device) {
      return renderCard({
        device: { ...device, type } as Parameters<typeof renderCard>[0]['device'],
        size: type === 'locks' ? 'small' : 'medium',
        handleSizeChange: keepPanelSize,
        isEditMode: false,
        dialog,
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
    dialog,
  });
}
