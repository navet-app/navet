import { type CardSize, isCompactCardSize } from '@navet/app/components/shared/card-size-selector';
import {
  getCardReadableTextTokens,
  resolveCardToneBaseColor,
} from '@navet/app/components/shared/theme/card-readable-text-tokens';
import { getEntityIconPillStyles } from '@navet/app/components/shared/theme/entity-icon-pill-styles';
import { type ThemeType, useTheme } from '@navet/app/hooks';
import { ChevronsUpDown } from 'lucide-react';

/** Shared opening fill with a drag affordance outside card identity and actions. */
export function CoverPositionFill({
  position,
  coverageGradient,
  backgroundGradient,
  theme,
  showHandle = false,
  showSlats = true,
  cardSize,
  handleAlignment = 'right',
}: {
  position: number;
  coverageGradient: string;
  backgroundGradient?: string;
  theme: ThemeType;
  showHandle?: boolean;
  showSlats?: boolean;
  cardSize?: CardSize;
  handleAlignment?: 'center' | 'right';
}) {
  const value = Math.max(0, Math.min(100, position));
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${backgroundGradient ? `bg-linear-to-br ${backgroundGradient}` : ''}`}
    >
      <div
        className={`absolute inset-x-0 top-0 bg-linear-to-br ${coverageGradient}`}
        data-cover-coverage
        style={{ height: `${100 - value}%` }}
      >
        {showSlats ? (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `repeating-linear-gradient(to bottom, transparent 0px, transparent 7px, ${theme === 'light' ? 'rgba(0,0,0,0.045)' : 'rgba(255,255,255,0.05)'} 7px, ${theme === 'light' ? 'rgba(0,0,0,0.045)' : 'rgba(255,255,255,0.05)'} 8px)`,
            }}
          />
        ) : null}
      </div>
      {showHandle && (
        <CoverDragHandle
          position={value}
          theme={theme}
          cardSize={cardSize}
          handleAlignment={handleAlignment}
        />
      )}
    </div>
  );
}

export function CoverDragHandle({
  position,
  theme,
  cardSize,
  handleAlignment = 'right',
}: {
  position: number;
  theme: ThemeType;
  cardSize?: CardSize;
  handleAlignment?: 'center' | 'right';
}) {
  const { primaryColor, accentColor } = useTheme();
  const tone = position > 50 ? 'primary' : 'neutral';
  const { badgeClassName, badgeStyle } = getEntityIconPillStyles({
    isActive: position > 50,
    isInteractive: false,
    primaryColor,
    accentColor,
    size: cardSize ?? 'medium',
    theme,
    tone,
  });
  const { titleColor } = getCardReadableTextTokens({ theme, tone, accentColor });
  const surfaceColor =
    theme === 'light'
      ? '#ffffff'
      : theme === 'glass'
        ? '#334155'
        : theme === 'black'
          ? '#000000'
          : '#18181b';
  const baseColor = resolveCardToneBaseColor({ tone, accentColor });
  const backgroundColor =
    position > 50
      ? `color-mix(in srgb, ${baseColor} ${theme === 'light' ? 12 : 18}%, ${surfaceColor})`
      : theme === 'light'
        ? '#e5e7eb'
        : `color-mix(in srgb, white 10%, ${surfaceColor})`;
  const compact = cardSize !== undefined && isCompactCardSize(cardSize);
  const value = Math.max(0, Math.min(100, position));
  return (
    <div
      aria-hidden="true"
      data-cover-position-handle
      className={`absolute flex h-6 items-center ${handleAlignment === 'center' ? 'left-1/2' : compact ? 'right-0' : 'right-3'}`}
      style={{
        top: `clamp(12px, ${100 - value}%, calc(100% - 12px))`,
        transform: handleAlignment === 'center' ? 'translate(-50%, -50%)' : 'translateY(-50%)',
      }}
    >
      <span
        className={`pointer-events-auto relative ${badgeClassName}`}
        style={{
          ...badgeStyle,
          backgroundColor,
          width: compact ? 12 : 28,
          height: 24,
          padding: 0,
          color: titleColor,
        }}
      >
        <ChevronsUpDown className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      </span>
    </div>
  );
}
