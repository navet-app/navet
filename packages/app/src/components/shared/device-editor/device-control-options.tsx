import {
  SelectableRadioList,
  SelectableRadioRow,
} from '@navet/app/components/patterns/selectable-radio-row';
import { Radio } from '@navet/app/components/primitives/radio';
import { getRoundControlStyles } from '@navet/app/components/shared/theme/round-control-styles';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { getThemeFocusRingClassName } from '@navet/app/components/system/tokens';
import { cn } from '@navet/app/components/ui/utils';
import { useTheme } from '@navet/app/hooks';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import { type ReactNode, useId } from 'react';

interface DeviceControlOptionsProps {
  label: string;
  theme?: ThemeType;
  selectionColor?: string;
  value: string | null;
  options: { value: string; label: string; icon?: ReactNode }[];
  disabled?: boolean;
  pending?: boolean;
  statusId?: string;
  variant?: 'list' | 'segmented';
  onValueChange: (value: string) => void;
}

/** Single-choice device controls: segmented radios or the canonical selectable row list. */
export function DeviceControlOptions({
  label,
  theme: themeOverride,
  selectionColor,
  value,
  options,
  disabled,
  pending,
  statusId,
  variant = 'list',
  onValueChange,
}: DeviceControlOptionsProps) {
  const name = useId();
  const { theme: appTheme, accentColor } = useTheme();
  const theme = themeOverride ?? appTheme;
  const surface = getThemeSurfaceTokens(theme);
  const softControl = getRoundControlStyles(theme);
  const selectedColor = selectionColor ?? accentColor;
  if (variant === 'list') {
    return (
      <fieldset
        disabled={disabled}
        aria-label={label}
        aria-busy={pending}
        aria-describedby={statusId}
        className="min-w-0"
      >
        <SelectableRadioList theme={theme}>
          {options.map((option) => (
            <li key={option.value}>
              <SelectableRadioRow
                size="compact"
                theme={theme}
                checked={value === option.value}
                disabled={disabled}
                label={option.label}
                labelClassName="break-words"
                leading={option.icon ? <span aria-hidden="true">{option.icon}</span> : undefined}
                name={name}
                value={option.value}
                radioColor={selectedColor}
                onValueChange={onValueChange}
              />
            </li>
          ))}
        </SelectableRadioList>
      </fieldset>
    );
  }
  return (
    <fieldset
      disabled={disabled}
      aria-label={label}
      aria-busy={pending}
      aria-describedby={statusId}
      className="min-w-0"
    >
      <div className={cn('flex flex-wrap gap-1 rounded-full border p-1', surface.border)}>
        {options.map((option, index) => (
          <label
            key={option.value}
            htmlFor={`${name}-${index}`}
            className={cn(
              'relative flex min-h-9 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-2 py-1.5 text-xs',
              softControl.softButton,
              disabled && 'cursor-not-allowed opacity-50'
            )}
          >
            <Radio
              id={`${name}-${index}`}
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onValueChange(option.value)}
              className="peer sr-only"
            />
            {option.icon ? (
              <span aria-hidden="true" className="shrink-0">
                {option.icon}
              </span>
            ) : null}
            <span className="min-w-0 break-words">{option.label}</span>
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute inset-0 rounded-full',
                getThemeFocusRingClassName(theme).replaceAll(
                  'focus-visible:',
                  'peer-focus-visible:'
                )
              )}
              style={
                value === option.value
                  ? {
                      border: `1px solid ${selectedColor}`,
                      backgroundColor: `${selectedColor}12`,
                    }
                  : undefined
              }
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
