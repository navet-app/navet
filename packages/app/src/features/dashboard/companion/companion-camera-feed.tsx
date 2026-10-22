import { readNavetCameraState } from '@navet/app/core/navet-device-state';
import { CameraCardContainer } from '@navet/app/features/security/components/camera-card/container';
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
  return (
    <div className="aspect-video overflow-hidden rounded-xl">
      <CameraCardContainer
        id={entity.canonicalId}
        name={entity.name}
        room={entity.room ?? ''}
        entityPicture={state?.entityPicture}
        isStreamCapable={state?.isStreamCapable}
        size="small"
        onSizeChange={keepPanelSize}
        isEditMode={editing}
        presentation="mosaic-tile"
      />
    </div>
  );
}
