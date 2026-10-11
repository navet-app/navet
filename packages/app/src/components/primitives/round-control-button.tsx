import { getCardActionControlSizes } from '@navet/app/components/shared/card-action-control-sizes';
import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import { getRoundControlStyles } from '@navet/app/components/shared/theme/round-control-styles';
import { navetSizeTokens } from '@navet/app/components/system/tokens';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import { type ButtonHTMLAttributes, type CSSProperties, forwardRef, type ReactNode } from 'react';

interface RoundControlButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  theme: ThemeType;
  size?: CardSize | 'large';
  /** Explicit interaction tier for dialog actions; card controls keep their responsive size. */
  controlSize?: keyof typeof navetSizeTokens.iconButton;
  variant?: 'neutral' | 'soft' | 'emphasis';
  iconClassName?: string;
  iconStyle?: CSSProperties;
  className?: string;
  children: ReactNode;
}

export const RoundControlButton = forwardRef<HTMLButtonElement, RoundControlButtonProps>(
  function RoundControlButton(
    {
      theme,
      size = 'medium',
      controlSize,
      variant = 'neutral',
      iconClassName = '',
      iconStyle,
      className = '',
      children,
      ...props
    },
    ref
  ) {
    const controlSizes = getCardActionControlSizes(size);
    const styles = getRoundControlStyles(theme);
    const buttonClasses =
      variant === 'emphasis'
        ? styles.emphasisButton
        : variant === 'soft'
          ? styles.softButton
          : styles.defaultButton;
    const iconClasses =
      variant === 'emphasis'
        ? styles.emphasisIcon
        : variant === 'soft'
          ? styles.softIcon
          : styles.defaultIcon;
    const resolvedAriaLabel =
      props['aria-label'] ?? (typeof props.title === 'string' ? props.title : undefined);

    return (
      <button
        ref={ref}
        type="button"
        aria-label={resolvedAriaLabel}
        className={`${controlSize ? navetSizeTokens.iconButton[controlSize] : controlSizes.button} flex shrink-0 items-center justify-center rounded-full transition-[color,background-color,border-color,box-shadow,opacity,transform,filter] duration-300 ${buttonClasses} ${className}`}
        {...props}
      >
        <span
          className={`flex h-full w-full items-center justify-center leading-none ${iconClasses} ${iconClassName}`}
          style={iconStyle}
        >
          {children}
        </span>
      </button>
    );
  }
);
