import { dispatchEntityCommand } from '@navet/app/commands';
import { Button } from '@navet/app/components/primitives/button';
import { Input } from '@navet/app/components/primitives/input';
import { Select } from '@navet/app/components/primitives/select';
import { DialogSectionRow } from '@navet/app/components/shared/device-editor/dialog-section-row';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { useI18n, useProviderEntityModel } from '@navet/app/hooks';
import { useProviderControlSession } from '@navet/app/hooks/use-provider-control-session';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import {
  type NavetClimateControlState,
  type NavetClimateOptionControl,
  readNavetClimateControlState,
} from '@navet/core/climate-controls';
import type { NavetUiCommand } from '@navet/core/types';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';

// The existing climate dialog uses dark mode-colored surfaces in every app theme.
// Fields resolve their own theme; surrounding copy follows the actual dialog surface.
const CLIMATE_CONTROL_SURFACE = getThemeSurfaceTokens('dark');

type OptionKey = 'preset' | 'fanMode' | 'swingMode' | 'swingHorizontalMode';

function optionCommand(entityId: string, key: OptionKey, value: string): NavetUiCommand {
  switch (key) {
    case 'preset':
      return { type: 'set_climate_preset', entityId, preset: value };
    case 'fanMode':
      return { type: 'set_climate_fan_mode', entityId, mode: value };
    case 'swingMode':
      return { type: 'set_climate_swing_mode', entityId, mode: value };
    case 'swingHorizontalMode':
      return { type: 'set_climate_swing_horizontal_mode', entityId, mode: value };
  }
}

function useClimateControlAction(
  current: string,
  writable: boolean,
  providerId: IntegrationProviderId
) {
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const requestGeneration = useRef(0);
  useEffect(
    () => () => {
      requestGeneration.current += 1;
      inFlight.current = false;
    },
    []
  );
  useEffect(() => {
    if (pending !== null && pending === current) {
      setPending(null);
      inFlight.current = false;
      requestGeneration.current += 1;
    }
  }, [current, pending]);
  useEffect(() => {
    if (pending === null) return;
    const timeout = setTimeout(() => {
      setPending(null);
      setFailed(true);
      inFlight.current = false;
      requestGeneration.current += 1;
    }, 10000);
    return () => clearTimeout(timeout);
  }, [pending]);
  async function send(command: NavetUiCommand, expected: string) {
    if (!writable || pending !== null || inFlight.current) return;
    inFlight.current = true;
    const generation = ++requestGeneration.current;
    setFailed(false);
    setPending(expected);
    try {
      const result = await dispatchEntityCommand(command, providerId);
      if (generation !== requestGeneration.current) return;
      if (!result.accepted) throw new Error('Rejected');
      if (!result.requiresEventConfirmation) setPending(null);
    } catch {
      if (generation !== requestGeneration.current) return;
      setPending(null);
      setFailed(true);
    } finally {
      if (generation === requestGeneration.current) inFlight.current = false;
    }
  }
  return { pending: pending !== null, failed, send, disabled: !writable || pending !== null };
}

function ControlStatus({
  pending,
  failed,
  writable,
  id,
}: {
  pending: boolean;
  failed: boolean;
  writable: boolean;
  id: string;
}) {
  const { t } = useI18n();
  return (
    <div id={id} aria-live="polite" className={`text-sm ${CLIMATE_CONTROL_SURFACE.textSecondary}`}>
      {!writable ? (
        t('common.unavailable')
      ) : failed ? (
        <span role="alert">{t('climate.advanced.updateFailed')}</span>
      ) : pending ? (
        t('climate.advanced.updating')
      ) : null}
    </div>
  );
}

function ClimateOptionControl({
  entityId,
  providerId,
  control,
  kind,
  label,
  writable,
}: {
  entityId: string;
  providerId: IntegrationProviderId;
  control: NavetClimateOptionControl;
  kind: OptionKey;
  label: string;
  writable: boolean;
}) {
  const { t } = useI18n();
  const fieldId = useId();
  const action = useClimateControlAction(control.value ?? '', writable, providerId);
  const optionMissing = !control.options.includes(control.value ?? '');
  return (
    <DialogSectionRow
      label={<label htmlFor={fieldId}>{label}</label>}
      labelClassName={CLIMATE_CONTROL_SURFACE.textPrimary}
    >
      <Select
        id={fieldId}
        value={control.value ?? ''}
        disabled={action.disabled}
        aria-describedby={`${fieldId}-status`}
        aria-busy={action.pending}
        onChange={(event) => {
          const value = event.target.value;
          if (control.options.includes(value))
            void action.send(optionCommand(entityId, kind, value), value);
        }}
      >
        {optionMissing ? (
          <option value={control.value ?? ''} disabled>
            {control.value ?? t('providerDetails.unknown')}
          </option>
        ) : null}
        {control.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
      <ControlStatus {...action} writable={writable} id={`${fieldId}-status`} />
    </DialogSectionRow>
  );
}

function ClimateHumidityControl({
  entityId,
  providerId,
  control,
  writable,
}: {
  entityId: string;
  providerId: IntegrationProviderId;
  control: NonNullable<NavetClimateControlState['targetHumidity']>;
  writable: boolean;
}) {
  const { t } = useI18n();
  const fieldId = useId();
  const current = control.value === null ? '' : String(control.value);
  const [draft, setDraft] = useState(current);
  const dirty = useRef(false);
  const action = useClimateControlAction(current, writable, providerId);
  useEffect(() => {
    if (Number(draft) === control.value && draft !== '') dirty.current = false;
    if (!dirty.current) setDraft(current);
  }, [current, control.value, draft]);
  const value = Number(draft);
  const invalid =
    draft === '' || !Number.isInteger(value) || value < control.min || value > control.max;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invalid || action.disabled) return;
    await action.send({ type: 'set_climate_humidity', entityId, humidity: value }, String(value));
  }
  return (
    <DialogSectionRow
      label={<label htmlFor={fieldId}>{t('climate.advanced.targetHumidity')}</label>}
      labelClassName={CLIMATE_CONTROL_SURFACE.textPrimary}
    >
      <form onSubmit={save} className="space-y-2" aria-busy={action.pending}>
        <Input
          id={fieldId}
          type="number"
          value={draft}
          min={Math.ceil(control.min)}
          max={Math.floor(control.max)}
          step={control.step}
          required
          disabled={action.disabled}
          trailing="%"
          aria-describedby={`${fieldId}-status`}
          onChange={(event) => {
            dirty.current = true;
            setDraft(event.target.value);
          }}
        />
        <ControlStatus {...action} writable={writable} id={`${fieldId}-status`} />
        <Button
          type="submit"
          disabled={invalid || action.disabled || (value === control.value && !action.failed)}
        >
          {t('common.save')}
        </Button>
      </form>
    </DialogSectionRow>
  );
}

export function ClimateAdvancedControls({ entityId }: { entityId: string }) {
  const { t } = useI18n();
  const entity = useProviderEntityModel(entityId);
  const session = useProviderControlSession(entityId, entity?.providerId);
  const controls = readNavetClimateControlState(entity ?? undefined);
  if (!entity || !controls) return null;
  const labels = {
    preset: t('climate.advanced.preset'),
    fanMode: t('climate.advanced.fanMode'),
    swingMode: t('climate.advanced.swingMode'),
    swingHorizontalMode: t('climate.advanced.swingHorizontalMode'),
  };
  return (
    <>
      {(['preset', 'fanMode', 'swingMode', 'swingHorizontalMode'] as const).map((kind) =>
        controls[kind] ? (
          <ClimateOptionControl
            key={`${session.key}:${kind}`}
            entityId={entity.canonicalId}
            providerId={entity.providerId}
            control={controls[kind]}
            kind={kind}
            label={labels[kind]}
            writable={controls.writable}
          />
        ) : null
      )}
      {controls.targetHumidity ? (
        <ClimateHumidityControl
          key={`${session.key}:humidity`}
          entityId={entity.canonicalId}
          providerId={entity.providerId}
          control={controls.targetHumidity}
          writable={controls.writable}
        />
      ) : null}
      {controls.currentHumidity !== undefined ? (
        <DialogSectionRow
          label={t('climate.advanced.currentHumidity')}
          labelClassName={CLIMATE_CONTROL_SURFACE.textPrimary}
        >
          <span className={`text-sm ${CLIMATE_CONTROL_SURFACE.textPrimary}`}>
            {controls.currentHumidity}%
          </span>
        </DialogSectionRow>
      ) : null}
    </>
  );
}
