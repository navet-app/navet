import { BaseCard, BaseCardDialog } from '@navet/app/components/primitives';
import { Button } from '@navet/app/components/primitives/button';
import { CardMetric } from '@navet/app/components/primitives/card-metric';
import { RoundControlButton } from '@navet/app/components/primitives/round-control-button';
import { CardSettingsActionButton } from '@navet/app/components/shared/card-settings-action-button';
import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import { useEditModeSettingsRequest } from '@navet/app/components/shared/edit-mode-settings-request';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { useI18n, useProviderEntityModel, useTheme } from '@navet/app/hooks';
import { readNavetRemoteState } from '@navet/core/household-device-state';
import type { IntegrationProviderId } from '@navet/core/integration-providers';
import { Power, Sliders } from 'lucide-react';
import { useState } from 'react';
import { useDeviceCommand } from '../hooks/use-device-command';

export function RemoteCard(props: {
  id: string;
  name: string;
  room?: string;
  providerId: IntegrationProviderId;
  size: CardSize;
  isEditMode: boolean;
}) {
  return <RemoteCardContent key={`${props.providerId}:${props.id}`} {...props} />;
}

function RemoteCardContent({
  id,
  name,
  room,
  providerId,
  size,
  isEditMode,
}: {
  id: string;
  name: string;
  room?: string;
  providerId: IntegrationProviderId;
  size: CardSize;
  isEditMode: boolean;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const entity = useProviderEntityModel(id);
  const state = readNavetRemoteState(entity ?? undefined);
  const action = useDeviceCommand({
    entityId: id,
    providerId,
    stateKey: String(state?.isOn ?? 'unknown'),
  });
  const [dialog, setDialog] = useState(false);
  useEditModeSettingsRequest(id, () => setDialog(true), isEditMode);
  const supported = entity?.capabilities.includes('toggle');
  const available = entity?.availability === 'available';
  const canToggle = state?.isOn ? state.canTurnOff : state?.canTurnOn;
  const label = !available
    ? t('common.unavailable')
    : state?.isOn === null || !state
      ? t('providerDetails.unknown')
      : t(state.isOn ? 'common.on' : 'common.off');
  const toggle = () => {
    if (!canToggle || isEditMode || action.pending) return;
    const next = !state?.isOn;
    void action.execute(
      { type: next ? 'turn_on' : 'turn_off', entityId: id },
      (key) => key === String(next)
    );
  };
  const status = (
    <div aria-live="polite" className={`text-xs ${surface.textSecondary}`}>
      {action.error ? (
        <span role="alert">{t('deviceControls.failed')}</span>
      ) : action.pending ? (
        t('helpers.updating')
      ) : null}
    </div>
  );
  const compact = size === 'tiny' || size === 'extra-small';
  const power = supported ? (
    <RoundControlButton
      theme={theme}
      size="small"
      variant={state?.isOn ? 'emphasis' : 'soft'}
      aria-label={t(state?.isOn ? 'remote.turnOff' : 'remote.turnOn', { name })}
      aria-pressed={state?.isOn === true}
      disabled={!canToggle || isEditMode || action.pending}
      onClick={toggle}
    >
      <Power className="h-4 w-4" />
    </RoundControlButton>
  ) : null;
  return (
    <>
      <BaseCard
        size={size}
        title={name}
        subtitle={room}
        interactive={size === 'tiny' && !isEditMode}
        role={size === 'tiny' && !isEditMode ? 'button' : undefined}
        tabIndex={size === 'tiny' && !isEditMode ? 0 : undefined}
        aria-label={
          size === 'tiny' ? `${t('providerDetails.controls', { name })}, ${label}` : undefined
        }
        onClick={() => {
          if (size === 'tiny' && !isEditMode) setDialog(true);
        }}
        isActive={available && state?.isOn === true}
        headerTrailing={compact ? power : undefined}
        actionRow={
          compact
            ? undefined
            : {
                leftContent: power,
                rightContent: (
                  <CardSettingsActionButton
                    theme={theme}
                    size={size}
                    disabled={isEditMode}
                    aria-label={t('providerDetails.controls', { name })}
                    onClick={() => setDialog(true)}
                  />
                ),
              }
        }
      >
        {size !== 'tiny' ? (
          <CardMetric
            value={label}
            theme={theme}
            isActive={false}
            accentClassName="text-current"
            valueClassName={compact ? 'text-sm font-semibold' : undefined}
          />
        ) : null}
        <div className={size === 'tiny' ? 'sr-only' : undefined}>{status}</div>
      </BaseCard>
      {dialog ? (
        <BaseCardDialog
          isOpen
          onOpenChange={setDialog}
          title={name}
          entityId={id}
          entityType="remote"
          theme={theme}
          tabs={[
            {
              key: 'controls',
              label: t('common.controls'),
              icon: Sliders,
              content: (
                <div className={`space-y-4 ${surface.textPrimary}`}>
                  <p>{label}</p>
                  {supported ? (
                    <Button disabled={!canToggle || isEditMode || action.pending} onClick={toggle}>
                      {t(state?.isOn ? 'remote.turnOff' : 'remote.turnOn', { name })}
                    </Button>
                  ) : null}
                  {status}
                </div>
              ),
            },
          ]}
        />
      ) : null}
    </>
  );
}
