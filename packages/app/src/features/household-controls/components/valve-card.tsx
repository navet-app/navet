import { BaseCard, BaseCardDialog } from '@navet/app/components/primitives';
import { Button } from '@navet/app/components/primitives/button';
import { CardMetric } from '@navet/app/components/primitives/card-metric';
import { EntityCardHeader } from '@navet/app/components/primitives/entity-card-header';
import { EntityCardHeaderIcon } from '@navet/app/components/primitives/entity-card-header-icon';
import { Input } from '@navet/app/components/primitives/input';
import { CardSettingsActionButton } from '@navet/app/components/shared/card-settings-action-button';
import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import { useEditModeSettingsRequest } from '@navet/app/components/shared/edit-mode-settings-request';
import {
  type EntityCardDialogControl,
  useEntityCardDialogState,
} from '@navet/app/components/shared/entity-card-dialog';
import { getCardReadableTextTokens } from '@navet/app/components/shared/theme/card-readable-text-tokens';
import { getOpenDeviceCardSurface } from '@navet/app/components/shared/theme/open-device-card-surface';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { CoverControlButton } from '@navet/app/features/security/components/cover-card/cover-control-button';
import { CoverPositionFill } from '@navet/app/features/security/components/cover-card/cover-position-fill';
import { getCoverPositionTone } from '@navet/app/features/security/components/cover-card/cover-position-tone';
import { useI18n, useProviderEntityModel, useTheme } from '@navet/app/hooks';
import { useProviderControlSession } from '@navet/app/hooks/use-provider-control-session';
import type { NavetCapabilityId } from '@navet/core/capabilities';
import { type NavetValveState, readNavetValveState } from '@navet/core/household-device-state';
import type { IntegrationProviderId } from '@navet/core/integration-providers';
import type { NavetEntity } from '@navet/core/types';
import { ChevronDown, ChevronUp, Droplets, Sliders, Square } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useDeviceCommand } from '../hooks/use-device-command';

const EMPTY_VALVE: NavetValveState = {
  phase: 'unknown',
  position: null,
  canOpen: false,
  canClose: false,
  canStop: false,
  canSetPosition: false,
};

function isFullyOpen(state: Pick<NavetValveState, 'phase' | 'position'>) {
  return state.phase === 'open' && (state.position === null || state.position === 100);
}

function useValveControls(id: string, providerId: IntegrationProviderId, state: NavetValveState) {
  const action = useDeviceCommand({
    entityId: id,
    providerId,
    stateKey: JSON.stringify({ phase: state.phase, position: state.position }),
  });
  const phase = (key: string) => (JSON.parse(key) as { phase: string }).phase;
  return {
    ...action,
    open: () =>
      action.execute({ type: 'open', entityId: id }, (key) => {
        const latest = JSON.parse(key) as NavetValveState;
        return latest.phase === 'opening' || isFullyOpen(latest);
      }),
    close: () =>
      action.execute({ type: 'close', entityId: id }, (key) =>
        ['closed', 'closing'].includes(phase(key))
      ),
    stop: () =>
      action.execute(
        { type: 'stop', entityId: id },
        (key) => ['open', 'closed'].includes(phase(key)),
        true
      ),
    position: (position: number) => {
      const direction =
        state.position === null || position === state.position
          ? undefined
          : position > state.position
            ? 'opening'
            : 'closing';
      return action.execute({ type: 'set_position', entityId: id, position }, (key) => {
        const latest = JSON.parse(key) as Pick<NavetValveState, 'phase' | 'position'>;
        return (
          latest.position === position || (direction !== undefined && latest.phase === direction)
        );
      });
    },
  };
}

function ValveStatus({ pending, error }: { pending: boolean; error: boolean }) {
  const { t } = useI18n();
  return (
    <div aria-live="polite" className="text-xs">
      {error ? (
        <span role="alert">{t('deviceControls.failed')}</span>
      ) : pending ? (
        t('helpers.updating')
      ) : null}
    </div>
  );
}

export function ValveControlPanel({
  id,
  name,
  providerId,
  state,
  capabilities,
  action,
  availability,
}: {
  id: string;
  name: string;
  providerId: IntegrationProviderId;
  state: NavetValveState;
  capabilities: readonly NavetCapabilityId[];
  action?: ReturnType<typeof useValveControls>;
  availability?: NavetEntity['availability'];
}) {
  const { key } = useProviderControlSession(id, providerId);
  return (
    <ValveControlPanelContent
      key={key}
      {...{ id, name, providerId, state, capabilities, action, availability }}
    />
  );
}

function ValveControlPanelContent({
  id,
  name,
  providerId,
  state,
  capabilities,
  action: sharedAction,
  availability,
}: {
  id: string;
  name: string;
  providerId: IntegrationProviderId;
  state: NavetValveState;
  capabilities: readonly NavetCapabilityId[];
  action?: ReturnType<typeof useValveControls>;
  availability?: NavetEntity['availability'];
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const inputId = useId();
  const ownAction = useValveControls(id, providerId, state);
  const action = sharedAction ?? ownAction;
  const [draft, setDraft] = useState(state.position === null ? '' : String(state.position));
  const dirty = useRef(false);
  useEffect(() => {
    if (draft !== '' && Number(draft) === state.position) dirty.current = false;
    if (!dirty.current) setDraft(state.position === null ? '' : String(state.position));
  }, [draft, state.position]);
  const invalid =
    draft === '' || !Number.isInteger(Number(draft)) || Number(draft) < 0 || Number(draft) > 100;
  return (
    <div className={`space-y-4 ${surface.textPrimary}`}>
      <fieldset className="flex flex-wrap gap-2" aria-label={t('common.controls')}>
        {capabilities.includes('valve_open') ? (
          <Button
            disabled={
              !state.canOpen || isFullyOpen(state) || state.phase === 'opening' || action.pending
            }
            onClick={() => {
              void action.open();
            }}
          >
            {t('cover.open')}
          </Button>
        ) : null}
        {capabilities.includes('valve_stop') ? (
          <Button
            disabled={!state.canStop || action.pendingCommand === 'stop'}
            onClick={() => {
              void action.stop();
            }}
          >
            {t('cover.stop')}
          </Button>
        ) : null}
        {capabilities.includes('valve_close') ? (
          <Button
            disabled={
              !state.canClose ||
              state.phase === 'closed' ||
              state.phase === 'closing' ||
              action.pending
            }
            onClick={() => {
              void action.close();
            }}
          >
            {t('cover.close')}
          </Button>
        ) : null}
      </fieldset>
      {capabilities.includes('position') ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (invalid || !state.canSetPosition || action.pending) return;
            dirty.current = true;
            void action.position(Number(draft));
          }}
        >
          <label htmlFor={inputId} className="block space-y-1 text-sm">
            <span>{t('valve.position')}</span>
            <Input
              id={inputId}
              aria-label={t('valve.positionFor', { name })}
              type="number"
              min={0}
              max={100}
              step={1}
              required
              trailing="%"
              value={draft}
              disabled={!state.canSetPosition || action.pending}
              onChange={(event) => {
                dirty.current = true;
                setDraft(event.target.value);
              }}
            />
          </label>
          <Button
            type="submit"
            disabled={
              invalid ||
              !state.canSetPosition ||
              action.pending ||
              (Number(draft) === state.position && !action.error)
            }
          >
            {t('common.save')}
          </Button>
        </form>
      ) : null}
      <ValveStatus pending={action.pending} error={action.error} />
      {state.phase === 'unknown' ? (
        <p role="status">
          {t(availability === 'unknown' ? 'providerDetails.unknown' : 'common.unavailable')}
        </p>
      ) : null}
    </div>
  );
}

export function ValveCard(props: {
  id: string;
  name: string;
  room?: string;
  providerId: IntegrationProviderId;
  size: CardSize;
  isEditMode: boolean;
  dialog?: EntityCardDialogControl;
}) {
  const { key } = useProviderControlSession(props.id, props.providerId);
  return <ValveCardContent key={key} {...props} />;
}

function ValveCardContent({
  id,
  name,
  room,
  providerId,
  size,
  isEditMode,
  dialog: dialogControl,
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
  const { theme, colors, accentColor } = useTheme();
  const entity = useProviderEntityModel(id);
  const state = readNavetValveState(entity ?? undefined) ?? EMPTY_VALVE;
  const capabilities = entity?.capabilities ?? [];
  const action = useValveControls(id, providerId, state);
  const [dialog, setDialog] = useEntityCardDialogState(dialogControl);
  useEditModeSettingsRequest(id, () => setDialog(true), isEditMode);
  const compact = size === 'tiny' || size === 'extra-small';
  const unavailable = entity?.availability !== 'available';
  const position = unavailable
    ? 0
    : Math.max(
        0,
        Math.min(
          100,
          state.position ?? (state.phase === 'open' || state.phase === 'opening' ? 100 : 0)
        )
      );
  const showPosition = state.position !== null;
  const fullyOpen = !unavailable && position === 100;
  const openSurface = fullyOpen
    ? getOpenDeviceCardSurface(theme, colors.switch.on, accentColor, size)
    : undefined;
  const openColors = colors.cover.open;
  const headerTone = !unavailable && (showPosition || fullyOpen) ? 'primary' : 'neutral';
  const stateTone = getCoverPositionTone(position, showPosition, unavailable);
  const stateText = getCardReadableTextTokens({ theme, tone: stateTone, accentColor });
  const toggleCloses = position > 0;
  const toggleDisabled =
    isEditMode ||
    unavailable ||
    action.pending ||
    (toggleCloses
      ? !capabilities.includes('valve_close') || !state.canClose || state.phase === 'closing'
      : !capabilities.includes('valve_open') || !state.canOpen || state.phase === 'opening');
  const label = unavailable
    ? t(entity?.availability === 'unknown' ? 'providerDetails.unknown' : 'common.unavailable')
    : t(`valve.state.${state.phase}`);
  const value = !unavailable && state.position !== null ? `${state.position}%` : label;
  const settings = (
    <CardSettingsActionButton
      theme={theme}
      size={size}
      variant="soft"
      disabled={isEditMode}
      aria-label={t('providerDetails.controls', { name })}
      onClick={() => setDialog(true)}
    />
  );
  return (
    <>
      {!dialogControl ? (
        <BaseCard
          size={size}
          title={name}
          subtitle={room}
          header={
            size !== 'tiny' ? (
              <EntityCardHeader
                title={name}
                subtitle={t('deviceType.valve')}
                layout="eyebrow-first"
                size={size}
                compact={size === 'extra-small'}
                tone={headerTone}
                leading={
                  <EntityCardHeaderIcon
                    IconComponent={Droplets}
                    isActive={headerTone === 'primary'}
                    size={size === 'extra-small' ? 'tiny' : size}
                    tone={headerTone}
                    ariaLabel={t('entityCardInteraction.toggle', { name })}
                    disabled={toggleDisabled}
                    onClick={() => {
                      if (toggleDisabled) return;
                      void (toggleCloses ? action.close() : action.open());
                    }}
                  />
                }
                trailing={compact ? settings : undefined}
              />
            ) : undefined
          }
          interactive={size === 'tiny' && !isEditMode}
          role={size === 'tiny' && !isEditMode ? 'button' : undefined}
          tabIndex={size === 'tiny' && !isEditMode ? 0 : undefined}
          aria-label={
            size === 'tiny'
              ? `${t('providerDetails.controls', { name })}, ${value}${value === label ? '' : `, ${label}`}`
              : undefined
          }
          onClick={() => {
            if (size === 'tiny' && !isEditMode) setDialog(true);
          }}
          frameClassName={openSurface?.frameClassName}
          style={openSurface?.style}
          disableDefaultSheen={fullyOpen || showPosition}
          disableDefaultLightOverlay={fullyOpen}
          overlay={
            openSurface ? (
              openSurface.overlay
            ) : showPosition ? (
              <CoverPositionFill
                position={position}
                theme={theme}
                coverageGradient={openColors.gradient}
                cardSize={size}
                showSlats={false}
              />
            ) : undefined
          }
          headerTrailing={compact ? settings : undefined}
          headerCompact={size === 'extra-small'}
          contentClassName="flex h-full flex-col"
          actionRow={
            compact
              ? undefined
              : {
                  leftContent: (
                    <div className="flex gap-1.5">
                      {capabilities.includes('valve_open') ? (
                        <CoverControlButton
                          theme={theme}
                          size="small"
                          label={t('cover.open')}
                          disabled={
                            isEditMode ||
                            action.pending ||
                            !state.canOpen ||
                            isFullyOpen(state) ||
                            state.phase === 'opening'
                          }
                          onClick={() => {
                            void action.open();
                          }}
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </CoverControlButton>
                      ) : null}
                      {capabilities.includes('valve_stop') ? (
                        <CoverControlButton
                          theme={theme}
                          size="small"
                          label={t('cover.stop')}
                          disabled={
                            isEditMode || !state.canStop || action.pendingCommand === 'stop'
                          }
                          onClick={() => {
                            void action.stop();
                          }}
                        >
                          <Square className="h-3.5 w-3.5" />
                        </CoverControlButton>
                      ) : null}
                      {capabilities.includes('valve_close') ? (
                        <CoverControlButton
                          theme={theme}
                          size="small"
                          label={t('cover.close')}
                          disabled={
                            isEditMode ||
                            action.pending ||
                            !state.canClose ||
                            state.phase === 'closed' ||
                            state.phase === 'closing'
                          }
                          onClick={() => {
                            void action.close();
                          }}
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </CoverControlButton>
                      ) : null}
                    </div>
                  ),
                  rightContent: settings,
                }
          }
        >
          {size !== 'tiny' ? (
            <CardMetric
              value={value}
              label={!unavailable && state.position !== null ? label : undefined}
              theme={theme}
              isActive={!unavailable && position > 0}
              accentClassName={openColors.accent}
              labelStyle={stateTone === 'primary' ? { color: stateText.subtitleColor } : undefined}
              className="mt-auto"
              valueClassName={
                !showPosition ? 'text-2xl font-light leading-tight break-words' : undefined
              }
            />
          ) : null}
          <div className={size === 'tiny' ? 'sr-only' : undefined}>
            <ValveStatus pending={action.pending} error={action.error} />
          </div>
        </BaseCard>
      ) : null}
      {dialog ? (
        <BaseCardDialog
          onCloseAutoFocus={dialogControl?.onCloseAutoFocus}
          isOpen
          onOpenChange={setDialog}
          title={name}
          entityId={id}
          entityType="valve"
          theme={theme}
          tabs={[
            {
              key: 'controls',
              label: t('common.controls'),
              icon: Sliders,
              content: (
                <ValveControlPanel
                  id={id}
                  name={name}
                  providerId={providerId}
                  state={state}
                  capabilities={capabilities}
                  action={action}
                  availability={entity?.availability}
                />
              ),
            },
          ]}
        />
      ) : null}
    </>
  );
}
