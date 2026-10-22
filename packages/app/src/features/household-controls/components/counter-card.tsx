import { CardActionRow } from '@navet/app/components/patterns/card-action-row';
import { Button } from '@navet/app/components/primitives/button';
import { BaseCardDialog } from '@navet/app/components/primitives/Cards/BaseCardDialog';
import { Input } from '@navet/app/components/primitives/input';
import { RoundControlButton } from '@navet/app/components/primitives/round-control-button';
import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import { useEditModeSettingsRequest } from '@navet/app/components/shared/edit-mode-settings-request';
import {
  type EntityCardDialogControl,
  useEntityCardDialogState,
} from '@navet/app/components/shared/entity-card-dialog';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { SensorCard } from '@navet/app/features/sensors/components/sensor-card';
import { useI18n, useProviderEntityModel, useTheme } from '@navet/app/hooks';
import { useProviderControlSession } from '@navet/app/hooks/use-provider-control-session';
import { type NavetCounterState, readNavetCounterState } from '@navet/core/household-device-state';
import type { IntegrationProviderId } from '@navet/core/integration-providers';
import type { NavetEntity } from '@navet/core/types';
import { Hash, Minus, Plus, RotateCcw } from 'lucide-react';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { useDeviceCommand } from '../hooks/use-device-command';

export function CounterControls(props: {
  id: string;
  providerId: IntegrationProviderId;
  counter: NavetCounterState;
  unavailable?: boolean;
  availability?: NavetEntity['availability'];
}) {
  const { key } = useProviderControlSession(props.id, props.providerId);
  return <CounterControlsContent key={key} {...props} />;
}
function CounterControlsContent({
  id,
  providerId,
  counter,
  unavailable = false,
  availability,
}: {
  id: string;
  providerId: IntegrationProviderId;
  counter: NavetCounterState;
  unavailable?: boolean;
  availability?: NavetEntity['availability'];
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(() => String(counter.value ?? ''));
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) setDraft(String(counter.value ?? ''));
  }, [counter.value]);
  const operation = useDeviceCommand({ entityId: id, providerId, stateKey: String(counter.value) });
  const disabled = unavailable || operation.pending;
  const resetValue =
    counter.initial === null
      ? null
      : Math.min(counter.max ?? Infinity, Math.max(counter.min ?? -Infinity, counter.initial));
  const value = Number(draft);
  const stepInvalid =
    draft !== '' &&
    counter.step !== null &&
    Number.isSafeInteger(value) &&
    value % counter.step !== 0;
  const invalid =
    draft === '' ||
    !Number.isSafeInteger(value) ||
    stepInvalid ||
    (counter.min !== null && value < counter.min) ||
    (counter.max !== null && value > counter.max);
  useEffect(() => {
    inputRef.current?.setCustomValidity(
      stepInvalid ? t('counter.stepError', { step: counter.step ?? 1 }) : ''
    );
  }, [stepInvalid, counter.step, t]);
  useEffect(() => {
    if (!operation.pending && !operation.error && counter.value === value) dirty.current = false;
  }, [operation.pending, operation.error, counter.value, value]);
  function setValue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || invalid || !counter.canSetValue || value === counter.value) return;
    void operation.execute(
      { type: 'set_counter_value', entityId: id, value },
      (key) => Number(key) === value
    );
  }
  return (
    <div className={`space-y-4 ${surface.textPrimary}`} aria-busy={operation.pending}>
      <p className="text-lg font-semibold tabular-nums">
        {counter.value ?? t('providerDetails.unknown')}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          leading={<Minus className="h-4 w-4" />}
          disabled={disabled || !counter.canDecrement}
          onClick={() => {
            const next =
              counter.value !== null && counter.step !== null
                ? Math.max(counter.min ?? -Infinity, counter.value - counter.step)
                : null;
            void operation.execute(
              { type: 'counter_decrement', entityId: id },
              next === null ? undefined : (key) => Number(key) === next
            );
          }}
        >
          {t('counter.decrement')}
        </Button>
        <Button
          leading={<Plus className="h-4 w-4" />}
          disabled={disabled || !counter.canIncrement}
          onClick={() => {
            const next =
              counter.value !== null && counter.step !== null
                ? Math.min(counter.max ?? Infinity, counter.value + counter.step)
                : null;
            void operation.execute(
              { type: 'counter_increment', entityId: id },
              next === null ? undefined : (key) => Number(key) === next
            );
          }}
        >
          {t('counter.increment')}
        </Button>
        <Button
          variant="secondary"
          leading={<RotateCcw className="h-4 w-4" />}
          disabled={
            disabled || !counter.canReset || (resetValue !== null && counter.value === resetValue)
          }
          onClick={() => {
            void operation.execute(
              { type: 'counter_reset', entityId: id },
              resetValue === null ? undefined : (key) => Number(key) === resetValue
            );
          }}
        >
          {t('common.reset')}
        </Button>
      </div>
      {counter.canSetValue ? (
        <form onSubmit={setValue} className="space-y-3">
          <label htmlFor={inputId} className="block text-sm font-medium">
            {t('counter.value')}
          </label>
          <Input
            ref={inputRef}
            id={inputId}
            type="number"
            required
            min={counter.min ?? undefined}
            max={counter.max ?? undefined}
            step={1}
            value={draft}
            disabled={disabled}
            invalid={dirty.current && invalid}
            aria-describedby={stepInvalid ? errorId : undefined}
            onChange={(event) => {
              dirty.current = true;
              setDraft(event.target.value);
              const number = Number(event.target.value);
              event.target.setCustomValidity(
                counter.step !== null && Number.isSafeInteger(number) && number % counter.step !== 0
                  ? t('counter.stepError', { step: counter.step })
                  : ''
              );
            }}
          />
          {stepInvalid ? (
            <p id={errorId} role="alert" className="text-sm">
              {t('counter.stepError', { step: counter.step ?? 1 })}
            </p>
          ) : null}
          <Button type="submit" disabled={disabled || invalid || value === counter.value}>
            {t('counter.setValue')}
          </Button>
        </form>
      ) : null}
      {unavailable ? (
        <p role="status">
          {t(availability === 'unknown' ? 'providerDetails.unknown' : 'common.unavailable')}
        </p>
      ) : null}
      {operation.pending ? (
        <p role="status" className={surface.textSecondary}>
          {t('helpers.updating')}
        </p>
      ) : null}
      {operation.error ? <p role="alert">{t('deviceControls.failed')}</p> : null}
    </div>
  );
}
export function CounterCard({
  id,
  name,
  room,
  counter: initial,
  providerId,
  size,
  isEditMode,
  dialog,
}: {
  id: string;
  name: string;
  counter?: NavetCounterState;
  room?: string;
  providerId: IntegrationProviderId;
  size: CardSize;
  isEditMode: boolean;
  dialog?: EntityCardDialogControl;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const entity = useProviderEntityModel(id);
  const live = entity?.providerId === providerId ? readNavetCounterState(entity) : undefined;
  const counter = live ?? {
    value: null,
    min: null,
    max: null,
    step: null,
    initial: null,
    ...initial,
    canIncrement: false,
    canDecrement: false,
    canReset: false,
    canSetValue: false,
  };
  const unavailable = !!entity && (!live || entity.availability !== 'available');
  const [open, setOpen] = useEntityCardDialogState(dialog);
  useEditModeSettingsRequest(id, () => setOpen(true), isEditMode);
  return (
    <>
      {!dialog ? (
        <SensorCard
          id={id}
          name={name}
          room={room ?? ''}
          size={size}
          isEditMode={isEditMode}
          unit=""
          subtitle={room || t('deviceType.counter')}
          value={
            !entity
              ? t('common.loading')
              : unavailable
                ? t(
                    entity.availability === 'unknown'
                      ? 'providerDetails.unknown'
                      : 'common.unavailable'
                  )
                : String(counter.value ?? t('providerDetails.unknown'))
          }
          status={!entity || unavailable ? 'unavailable' : 'measurement'}
          onSizeChange={() => undefined}
          onOpenSettings={() => {
            if (!isEditMode) setOpen(true);
          }}
          disableBuiltInSettingsDialog
          bottomActionBar={
            <CounterCardActions
              id={id}
              providerId={providerId}
              counter={counter}
              size={size}
              disabled={isEditMode || !entity || unavailable}
            />
          }
        />
      ) : null}
      {open ? (
        <BaseCardDialog
          onCloseAutoFocus={dialog?.onCloseAutoFocus}
          isOpen={open}
          onOpenChange={setOpen}
          title={name}
          theme={theme}
          entityId={id}
          entityType="counter"
          tabs={[
            {
              key: 'controls',
              label: t('providerDetails.controls', { name }),
              icon: Hash,
              content: (
                <CounterControls
                  id={id}
                  providerId={providerId}
                  counter={counter}
                  unavailable={!entity || unavailable}
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

function CounterCardActions({
  id,
  providerId,
  counter,
  size,
  disabled,
}: {
  id: string;
  providerId: IntegrationProviderId;
  counter: NavetCounterState;
  size: CardSize;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const operation = useDeviceCommand({ entityId: id, providerId, stateKey: String(counter.value) });
  const resetValue =
    counter.initial === null
      ? null
      : Math.min(counter.max ?? Infinity, Math.max(counter.min ?? -Infinity, counter.initial));
  const actions = [
    {
      type: 'counter_decrement' as const,
      label: t('counter.decrement'),
      Icon: Minus,
      enabled: counter.canDecrement,
      next:
        counter.value !== null && counter.step !== null
          ? Math.max(counter.min ?? -Infinity, counter.value - counter.step)
          : null,
    },
    {
      type: 'counter_increment' as const,
      label: t('counter.increment'),
      Icon: Plus,
      enabled: counter.canIncrement,
      next:
        counter.value !== null && counter.step !== null
          ? Math.min(counter.max ?? Infinity, counter.value + counter.step)
          : null,
    },
    {
      type: 'counter_reset' as const,
      label: t('common.reset'),
      Icon: RotateCcw,
      enabled: counter.canReset && (resetValue === null || counter.value !== resetValue),
      next: resetValue,
    },
  ];
  return (
    <div aria-busy={operation.pending}>
      <CardActionRow
        theme={theme}
        size={size === 'small' ? 'small' : 'default'}
        leftContent={actions.map(({ type, label, Icon, enabled, next }) => (
          <RoundControlButton
            key={type}
            theme={theme}
            size="small"
            aria-label={label}
            title={label}
            disabled={disabled || operation.pending || !enabled}
            onClick={(event) => {
              event.stopPropagation();
              void operation.execute(
                { type, entityId: id },
                next === null ? undefined : (key) => Number(key) === next
              );
            }}
          >
            <Icon className="h-4 w-4" />
          </RoundControlButton>
        ))}
      />
      {operation.error ? <p role="alert">{t('deviceControls.failed')}</p> : null}
    </div>
  );
}
