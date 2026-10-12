import { dispatchEntityCommand } from '@navet/app/commands';
import { CardDialogFooter } from '@navet/app/components/patterns/card-dialog';
import { Button } from '@navet/app/components/primitives/button';
import { Input } from '@navet/app/components/primitives/input';
import { Select } from '@navet/app/components/primitives/select';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { useI18n, useTheme } from '@navet/app/hooks';
import { useProviderControlSession } from '@navet/app/hooks/use-provider-control-session';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import type { NavetHelperState } from '@navet/core/helper-state';
import type { NavetUiCommand } from '@navet/core/types';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';

function inputValue(helper: NavetHelperState): string {
  const value = String(helper.value ?? '');
  return helper.helperType === 'datetime' ? value.replace(' ', 'T') : value;
}

function comparableValue(helper: NavetHelperState, value: string): string {
  if (helper.helperType === 'number') return String(Number(value));
  if (helper.helperType === 'time') return value.length === 5 ? `${value}:00` : value;
  if (helper.helperType === 'datetime') return value.length === 16 ? `${value}:00` : value;
  return value;
}

function helperCommand(id: string, helper: NavetHelperState, value: string): NavetUiCommand {
  switch (helper.helperType) {
    case 'number':
      return { type: 'set_number_value', entityId: id, value: Number(value) };
    case 'select':
      return { type: 'select_option', entityId: id, option: value };
    case 'text':
      return { type: 'set_text_value', entityId: id, value };
    default:
      return {
        type: 'set_datetime_value',
        entityId: id,
        value: comparableValue(helper, value).replace('T', ' '),
      };
  }
}

type HelperValueControlProps = {
  id: string;
  name: string;
  helper: NavetHelperState;
  providerId?: IntegrationProviderId;
  surfaceTheme?: ThemeType;
  unavailable?: boolean;
  onSaved?: () => void;
};

export function HelperValueControl(props: HelperValueControlProps) {
  const { providerId, key } = useProviderControlSession(props.id, props.providerId);
  return (
    <HelperValueControlContent
      key={`${key}:${props.helper.helperType}`}
      {...props}
      providerId={providerId}
    />
  );
}

function HelperValueControlContent({
  id,
  name,
  helper,
  providerId,
  surfaceTheme,
  unavailable = false,
  onSaved,
}: HelperValueControlProps) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(surfaceTheme ?? theme);
  const fieldId = useId();
  const [draft, setDraft] = useState(() => inputValue(helper));
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const submitted = useRef(false);
  const requestGeneration = useRef(0);
  const dirty = useRef(false);
  const current = inputValue(helper);
  const unchanged = comparableValue(helper, draft) === comparableValue(helper, current);
  useEffect(
    () => () => {
      requestGeneration.current++;
      submitted.current = false;
    },
    []
  );
  useEffect(() => {
    if (pending !== null && pending === comparableValue(helper, current)) {
      requestGeneration.current++;
      submitted.current = false;
      dirty.current = false;
      setPending(null);
      onSaved?.();
    }
  }, [current, helper, pending, onSaved]);
  useEffect(() => {
    if (!dirty.current) setDraft(current);
  }, [current]);
  useEffect(() => {
    if (pending === null) return;
    const timeout = setTimeout(() => {
      requestGeneration.current++;
      setPending(null);
      setError(true);
      dirty.current = true;
      submitted.current = false;
    }, 10000);
    return () => clearTimeout(timeout);
  }, [pending]);
  const disabled = unavailable || !helper.writable || pending !== null;
  const optionMissing = helper.helperType === 'select' && !helper.options.includes(draft);
  const textLength = Array.from(draft).length;
  const textLengthInvalid =
    helper.helperType === 'text' &&
    (textLength < helper.minLength || textLength > helper.maxLength);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (unchanged && onSaved && pending === null) {
      onSaved();
      return;
    }
    if (disabled || optionMissing || textLengthInvalid || submitted.current) return;
    const generation = ++requestGeneration.current;
    submitted.current = true;
    setError(false);
    dirty.current = true;
    setPending(comparableValue(helper, draft));
    try {
      const result = await dispatchEntityCommand(helperCommand(id, helper, draft), providerId);
      if (generation !== requestGeneration.current) return;
      if (!result.accepted) throw new Error('Rejected');
      onSaved?.();
      if (!result.requiresEventConfirmation) {
        dirty.current = false;
        setPending(null);
      }
    } catch {
      if (generation !== requestGeneration.current) return;
      setPending(null);
      setError(true);
      dirty.current = true;
    } finally {
      if (generation === requestGeneration.current) submitted.current = false;
    }
  }
  const saveButton = (
    <Button
      type="submit"
      disabled={
        onSaved && unchanged && pending === null
          ? false
          : disabled || optionMissing || textLengthInvalid || (draft === current && !error)
      }
    >
      {t('common.save')}
    </Button>
  );
  const descriptionId = `${fieldId}-status`;
  return (
    <form
      onSubmit={save}
      className={`space-y-3 ${surface.textPrimary}`}
      aria-busy={pending !== null}
    >
      <label htmlFor={fieldId} className="block text-sm font-medium">
        {helper.helperType === 'datetime' && helper.timeZone
          ? `${name} (${helper.timeZone})`
          : name}
      </label>
      {helper.helperType === 'select' ? (
        <Select
          id={fieldId}
          value={draft}
          disabled={disabled || helper.options.length === 0}
          aria-describedby={descriptionId}
          onChange={(event) => {
            dirty.current = true;
            setDraft(event.target.value);
            setError(false);
          }}
        >
          {optionMissing ? (
            <option value={draft} disabled>
              {draft || t('helpers.noOptions')}
            </option>
          ) : null}
          {helper.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          id={fieldId}
          value={draft}
          disabled={disabled}
          required={helper.helperType !== 'text'}
          aria-describedby={descriptionId}
          type={
            helper.helperType === 'number'
              ? 'number'
              : helper.helperType === 'datetime'
                ? 'datetime-local'
                : helper.helperType === 'text'
                  ? helper.mode
                  : helper.helperType
          }
          min={helper.helperType === 'number' ? helper.min : undefined}
          max={helper.helperType === 'number' ? helper.max : undefined}
          step={
            helper.helperType === 'number'
              ? helper.step
              : helper.helperType === 'time' || helper.helperType === 'datetime'
                ? 1
                : undefined
          }
          invalid={textLengthInvalid}
          pattern={helper.helperType === 'text' ? helper.pattern : undefined}
          trailing={helper.helperType === 'number' ? helper.unit : undefined}
          onChange={(event) => {
            dirty.current = true;
            setDraft(event.target.value);
            setError(false);
          }}
        />
      )}
      <div id={descriptionId} aria-live="polite" className="text-sm">
        {textLengthInvalid && helper.helperType === 'text' ? (
          t('helpers.textLength', { min: helper.minLength, max: helper.maxLength })
        ) : unavailable ? (
          t('common.unavailable')
        ) : error ? (
          <span role="alert">{t('helpers.updateFailed')}</span>
        ) : pending !== null ? (
          t('helpers.updating')
        ) : optionMissing ? (
          t(
            helper.helperType === 'select' && helper.options.length === 0
              ? 'helpers.noOptions'
              : 'helpers.chooseOption'
          )
        ) : null}
      </div>
      {onSaved ? <CardDialogFooter>{saveButton}</CardDialogFooter> : saveButton}
    </form>
  );
}
