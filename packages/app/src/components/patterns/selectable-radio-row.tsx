import { Radio } from '@navet/app/components/primitives/radio';
import { getSelectableControlTintStyle } from '@navet/app/components/shared/theme/selectable-control-tint';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { getThemeFocusRingClassName } from '@navet/app/components/system/tokens';
import { cn } from '@navet/app/components/ui/utils';
import { useTheme } from '@navet/app/hooks';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import { type CSSProperties, type HTMLAttributes, type ReactNode, useId } from 'react';

export type SelectableRadioListProps = HTMLAttributes<HTMLUListElement> & { theme?: ThemeType };

export function SelectableRadioList({
  children,
  className,
  theme: themeOverride,
  ...props
}: SelectableRadioListProps) {
  const { theme: appTheme } = useTheme();
  const theme = themeOverride ?? appTheme;
  const surface = getThemeSurfaceTokens(theme);

  return (
    <ul
      className={cn(
        'min-w-0 max-w-full divide-y overflow-x-hidden rounded-[24px] border',
        surface.border,
        surface.divider,
        className
      )}
      {...props}
    >
      {children}
    </ul>
  );
}

export interface SelectableRadioRowProps {
  size?: 'default' | 'compact';
  theme?: ThemeType;
  name: string;
  value: string;
  checked: boolean;
  onValueChange: (value: string) => void;
  label: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  action?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
  rowClassName?: string;
  labelClassName?: string;
  descriptionClassName?: string;
  radioClassName?: string;
  /** Tint the indicator and hover to match the owning surface. */
  radioColor?: string;
  style?: CSSProperties;
  selectedStyle?: CSSProperties;
  unselectedStyle?: CSSProperties;
  selectedClassName?: string;
  unselectedClassName?: string;
}

export function SelectableRadioRow({
  size = 'default',
  theme: themeOverride,
  name,
  value,
  checked,
  onValueChange,
  label,
  description,
  leading,
  trailing,
  action,
  disabled = false,
  id,
  className,
  rowClassName,
  labelClassName,
  descriptionClassName,
  radioClassName,
  radioColor,
  style,
  selectedStyle,
  unselectedStyle,
  selectedClassName,
  unselectedClassName,
}: SelectableRadioRowProps) {
  const generatedId = useId();
  const radioId = id ?? generatedId;
  const { theme: appTheme } = useTheme();
  const theme = themeOverride ?? appTheme;
  const surface = getThemeSurfaceTokens(theme);

  return (
    <div
      className={cn(
        'flex min-w-0 max-w-full items-center transition-colors motion-reduce:transition-none',
        size === 'compact' ? 'min-h-10 gap-2 px-3 py-1' : 'min-h-14 gap-3 px-4 py-3',
        surface.textPrimary,
        !disabled && (radioColor ? 'hover:bg-[var(--selectable-control-hover)]' : surface.hoverBg),
        disabled && 'opacity-50',
        className,
        rowClassName,
        checked ? selectedClassName : unselectedClassName
      )}
      style={{
        ...(radioColor ? getSelectableControlTintStyle(radioColor) : {}),
        ...style,
        ...(checked ? selectedStyle : unselectedStyle),
      }}
    >
      <label
        htmlFor={radioId}
        className={cn(
          'flex min-w-0 flex-1 cursor-pointer items-center text-left',
          size === 'compact' ? 'gap-2' : 'gap-3',
          disabled && 'cursor-not-allowed'
        )}
      >
        <span
          className={cn(
            'flex shrink-0 items-center justify-center',
            size === 'compact' ? 'h-8 w-8' : 'h-9 w-9'
          )}
        >
          <Radio
            id={radioId}
            name={name}
            value={value}
            checked={checked}
            onChange={() => onValueChange(value)}
            disabled={disabled}
            aria-labelledby={`${radioId}-label`}
            aria-describedby={description ? `${radioId}-description` : undefined}
            style={radioColor ? { accentColor: radioColor } : undefined}
            className={cn(
              'shrink-0',
              radioColor &&
                'appearance-none rounded-full border border-[var(--selectable-control-border)] bg-transparent checked:border-[var(--selectable-control-accent)] checked:bg-[radial-gradient(circle,var(--selectable-control-accent)_0_40%,transparent_45%)]',
              getThemeFocusRingClassName(theme),
              radioClassName
            )}
          />
        </span>

        {leading ? <div className="shrink-0">{leading}</div> : null}

        <div className="min-w-0 flex-1">
          <div
            id={`${radioId}-label`}
            className={cn('min-w-0 text-sm font-medium', labelClassName)}
          >
            {label}
          </div>
          {description ? (
            <div
              id={`${radioId}-description`}
              className={cn('mt-0.5 min-w-0 text-xs', surface.textSecondary, descriptionClassName)}
            >
              {description}
            </div>
          ) : null}
        </div>

        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </label>

      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
