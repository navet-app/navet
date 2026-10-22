import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import type { EntityCardDialogControl } from '@navet/app/components/shared/entity-card-dialog';
import { SwitchCard } from '@navet/app/features/lighting/components/switch-card';
import { useI18n, useProviderEntityModel } from '@navet/app/hooks';
import { readNavetRemoteState } from '@navet/core/household-device-state';
import type { IntegrationProviderId } from '@navet/core/integration-providers';
import { useDeviceCommand } from '../hooks/use-device-command';

export function RemoteCard(props: {
  id: string;
  name: string;
  room?: string;
  providerId: IntegrationProviderId;
  size: CardSize;
  isEditMode: boolean;
  dialog?: EntityCardDialogControl;
}) {
  return <RemoteCardContent key={`${props.providerId}:${props.id}`} {...props} />;
}

function RemoteCardContent({
  id,
  name,
  providerId,
  size,
  isEditMode,
  dialog,
}: {
  id: string;
  name: string;
  room?: string;
  providerId: IntegrationProviderId;
  size: CardSize;
  isEditMode: boolean;
  dialog?: EntityCardDialogControl;
}) {
  const { t } = useI18n();
  const entity = useProviderEntityModel(id);
  const state = readNavetRemoteState(entity ?? undefined);
  const action = useDeviceCommand({
    entityId: id,
    providerId,
    stateKey: String(state?.isOn ?? 'unknown'),
  });
  const canToggle = state?.isOn ? state.canTurnOff : state?.canTurnOn;
  const toggle = () => {
    if (!canToggle || isEditMode || action.pending) return;
    const next = !state?.isOn;
    void action.execute(
      { type: next ? 'turn_on' : 'turn_off', entityId: id },
      (key) => key === String(next)
    );
  };
  const statusLabel = action.error
    ? t('deviceControls.failed')
    : action.pending
      ? t('helpers.updating')
      : entity?.availability !== 'available'
        ? t(entity?.availability === 'unknown' ? 'providerDetails.unknown' : 'common.unavailable')
        : state?.isOn === null || !state
          ? t('providerDetails.unknown')
          : null;
  return (
    <SwitchCard
      dialog={dialog}
      id={id}
      name={name}
      providerId={providerId}
      size={size}
      isEditMode={isEditMode}
      entityType={t('deviceType.remote')}
      serviceDomain="remote"
      binaryControl={{
        isOn: entity?.availability === 'available' && state?.isOn === true,
        disabled: !canToggle || action.pending,
        onToggle: toggle,
        status: statusLabel ? (
          <div aria-live="polite" className={size === 'tiny' ? 'sr-only' : 'text-xs'}>
            <span role={action.error ? 'alert' : undefined}>{statusLabel}</span>
          </div>
        ) : undefined,
      }}
    />
  );
}
