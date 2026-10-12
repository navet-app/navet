import { cn } from '@navet/app/components/ui/utils';
import { useTheme } from '@navet/app/hooks';
import { type ButtonHTMLAttributes, forwardRef } from 'react';

export interface SwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'role' | 'aria-checked' | 'onChange'> {
  checked: boolean;
  size?: 'default' | 'compact';
  onCheckedChange?: (checked: boolean) => void;
}

// Status: proposed. Minimal switch primitive for boolean settings where checkbox semantics read awkwardly.
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, size = 'default', onCheckedChange, className, disabled, style, ...props },
  ref
) {
  const { theme, accentColor } = useTheme();

  return (
    <button
      {...props}
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(event) => {
        props.onClick?.(event);
        if (!event.defaultPrevented && !disabled) {
          onCheckedChange?.(!checked);
        }
      }}
      className={cn(
        'relative inline-flex items-center rounded-full border outline-none transition-[background-color,border-color,box-shadow,opacity] before:absolute before:-inset-y-1 before:inset-x-0 before:content-[""] focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'compact' ? 'h-5 w-9 px-1 before:-inset-y-2' : 'h-7 w-11 px-[5px]',
        theme === 'light'
          ? 'focus-visible:ring-gray-400 focus-visible:ring-offset-white'
          : 'focus-visible:ring-white/30 focus-visible:ring-offset-transparent',
        checked
          ? 'border-transparent'
          : theme === 'light'
            ? 'border-gray-300 bg-gray-200'
            : theme === 'black'
              ? 'border-white/16 bg-zinc-950'
              : theme === 'glass'
                ? 'border-white/16 bg-white/8'
                : 'border-zinc-800 bg-zinc-900',
        className
      )}
      style={checked ? { backgroundColor: accentColor, ...style } : style}
    >
      <span
        className={cn(
          'rounded-full bg-white transition-transform',
          size === 'compact' ? 'h-4 w-4' : 'h-5 w-5',
          checked
            ? size === 'compact'
              ? 'translate-x-2.5'
              : 'translate-x-[14px]'
            : 'translate-x-0'
        )}
      />
    </button>
  );
});
