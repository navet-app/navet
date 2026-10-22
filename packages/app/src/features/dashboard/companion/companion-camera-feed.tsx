import { companionEntityDisabledClassName } from '@navet/app/components/shared/companion-row-presentation';
import { readNavetCameraState } from '@navet/app/core/navet-device-state';
import { CameraCardContainer } from '@navet/app/features/security/components/camera-card/container';
import { useIntegrationStore } from '@navet/app/hooks';
import type { NavetEntity } from '@navet/core/types';

const keepPanelSize = () => {};

/** Use the camera's existing transport, stream budget, visibility and snapshot fallback. */
export function CompanionCameraFeed({
  entity,
  editing,
}: {
  entity: NavetEntity;
  editing: boolean;
}) {
  const state = readNavetCameraState(entity);
  const connected = useIntegrationStore(
    (store) => store.providerRuntime[entity.providerId]?.connected
  );
  const disabled = editing || !connected || entity.availability !== 'available';
  return (
    <div
      className={`aspect-video overflow-hidden rounded-xl ${disabled ? companionEntityDisabledClassName : ''}`}
    >
      <CameraCardContainer
        id={entity.canonicalId}
        name={entity.name}
        room={entity.room ?? ''}
        entityPicture={state?.entityPicture}
        isStreamCapable={state?.isStreamCapable}
        size="small"
        onSizeChange={keepPanelSize}
        isEditMode={disabled}
        presentation="mosaic-tile"
      />
    </div>
  );
}
