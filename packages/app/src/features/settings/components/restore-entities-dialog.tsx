import { Button } from '@navet/app/components/primitives';
import { getDeviceTypeIcon } from '@navet/app/constants/device-type-icons';
import { ALL_ROOMS_ID } from '@navet/app/constants/rooms';
import { AddEntityDialogPrimitive } from '@navet/app/features/dashboard/components/add-entity-dialog';
import type { DashboardLibraryCard } from '@navet/app/features/dashboard/components/dashboard-library-list';
import { useDashboardEntitiesStore } from '@navet/app/features/dashboard/stores/dashboard-entities-store';
import { buildPreparedDashboardDevices } from '@navet/app/features/dashboard/utils/prepared-dashboard-devices';
import { useI18n, useIntegrationStore } from '@navet/app/hooks';
import { useDeviceMap } from '@navet/app/hooks/use-device-map';
import { useDevices } from '@navet/app/hooks/use-devices';
import { integrationSelectors } from '@navet/app/stores/selectors';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

export default function RestoreEntitiesDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const devices = useDevices({ includeFeatureCollections: true });
  const { deviceMap } = useDeviceMap(devices);
  const sessions = useIntegrationStore(integrationSelectors.providerSessions);
  const { hiddenEntityIds, showEntity, showAllEntities } = useDashboardEntitiesStore(
    useShallow((state) => ({
      hiddenEntityIds: state.hiddenEntityIds,
      showEntity: state.showEntity,
      showAllEntities: state.showAllEntities,
    }))
  );
  const libraryCards = useMemo<DashboardLibraryCard[]>(() => {
    const prepared = new Map(
      buildPreparedDashboardDevices(deviceMap, t, Object.keys(sessions).length).map((device) => [
        device.id,
        device,
      ])
    );
    return hiddenEntityIds.map((id) => {
      const item = prepared.get(id);
      return {
        id,
        title: item?.name ?? id,
        subtitle: item?.room ?? id,
        room: item?.room,
        meta: item?.typeLabel ?? '',
        kind: 'device',
        entityType: item?.device.type,
        entityTypeLabel: item?.entityTypeLabel,
        idSearchText: id,
        icon: item ? getDeviceTypeIcon(item.device.type) : undefined,
      };
    });
  }, [deviceMap, hiddenEntityIds, sessions, t]);

  return (
    <AddEntityDialogPrimitive
      open
      onClose={onClose}
      onAddCard={() => {}}
      onAddLibraryCard={showEntity}
      currentRoom={ALL_ROOMS_ID}
      libraryCards={libraryCards}
      libraryOnly
      title={t('settings.dashboard.entityVisibility.restore')}
      description={t('settings.dashboard.entityVisibility.restoreDescription')}
      actionLabel={t('settings.dashboard.entityVisibility.restoreAction')}
      libraryEmptyText={t('settings.dashboard.entityVisibility.empty')}
      footer={
        <Button
          variant="secondary"
          disabled={hiddenEntityIds.length === 0}
          onClick={() => {
            showAllEntities();
            onClose();
          }}
        >
          {t('settings.dashboard.entityVisibility.restoreAll')}
        </Button>
      }
    />
  );
}
