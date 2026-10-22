import { companionRowHighlight } from '@navet/app/components/shared/companion-row-presentation';
import { BrightnessSlider } from '@navet/app/components/shared/device-editor';
import { getEntityIconPillStyles } from '@navet/app/components/shared/theme/entity-icon-pill-styles';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { getThemeFocusRingClassName } from '@navet/app/components/system/tokens';
import { cn } from '@navet/app/components/ui/utils';
import { useI18n, useTheme } from '@navet/app/hooks';
import { Lightbulb, type LucideIcon } from 'lucide-react';
import { memo } from 'react';
import type { LightCardController } from './light-card-controller.types';
import type { HeaderIconButtonProps } from './light-card-types';

interface LightCardTableRowProps {
  name: string;
  isOn: boolean;
  brightness: number;
  supportsBrightness: boolean;
  activeColor?: string | null;
  IconComponent?: LucideIcon | null;
  iconText?: string | null;
  iconButtonProps: HeaderIconButtonProps;
  cardInteraction?: Pick<LightCardController['cardInteraction'], 'settingsButtonProps'>;
  compact?: boolean;
  disabled?: boolean;
  toggleDisabled?: boolean;
  secondaryText?: string;
  showToggle?: boolean;
  stateLabel?: string;
  onBrightnessChange: (value: number) => void;
  onBrightnessCommit: (value: number) => void;
  isEditMode: boolean;
}

export const LightCardTableRow = memo(function LightCardTableRow({
  name,
  isOn,
  brightness,
  supportsBrightness,
  activeColor,
  IconComponent,
  iconText,
  iconButtonProps,
  cardInteraction,
  onBrightnessChange,
  onBrightnessCommit,
  isEditMode,
  compact = false,
  disabled = false,
  toggleDisabled = false,
  secondaryText,
  showToggle = true,
  stateLabel,
}: LightCardTableRowProps) {
  const { t } = useI18n();
  const { theme, accentColor, primaryColor } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const controlsDisabled = isEditMode || disabled;
  const displayStateLabel =
    stateLabel ??
    (isOn && supportsBrightness
      ? `${Math.round(brightness)}%`
      : isOn
        ? t('common.on')
        : t('common.off'));
  const ToggleIcon = IconComponent ?? Lightbulb;
  const iconPill = getEntityIconPillStyles({
    isActive: isOn,
    isInteractive: false,
    primaryColor,
    accentColor,
    baseColor: activeColor,
    size: 'extra-small',
    theme,
    tone: isOn ? 'primary' : 'neutral',
  });

  return (
    <div
      className={cn(
        'flex w-full min-w-0 items-center py-1 text-left transition-colors motion-reduce:transition-none',
        compact ? '@container/light-row min-h-10 gap-2' : 'min-h-12 gap-3',
        !isEditMode && !compact && 'cursor-pointer rounded-xl',
        compact && companionRowHighlight,
        !controlsDisabled && surface.hoverBg
      )}
      data-light-table-row
    >
      {showToggle ? (
        <button
          type="button"
          aria-label={iconButtonProps['aria-label']}
          aria-pressed={isOn}
          disabled={controlsDisabled || toggleDisabled}
          onClick={iconButtonProps.onClick}
          onPointerDown={iconButtonProps.onPointerDown}
          className={cn(
            '-ml-[5px] flex shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-75',
            compact ? 'h-9 w-9' : 'h-11 w-11',
            getThemeFocusRingClassName(theme)
          )}
        >
          <span
            className={cn(iconPill.badgeClassName, 'navet-card-header-control-dense')}
            style={iconPill.badgeStyle}
            data-light-row-icon-pill
          >
            {iconText ? (
              <span
                className={cn('text-xs font-semibold', iconPill.iconClassName)}
                style={iconPill.iconStyle}
              >
                {iconText}
              </span>
            ) : (
              <ToggleIcon
                className={iconPill.iconClassName}
                style={iconPill.iconStyle}
                aria-hidden="true"
              />
            )}
          </span>
        </button>
      ) : null}

      {cardInteraction ? (
        <button
          {...cardInteraction.settingsButtonProps}
          aria-haspopup="dialog"
          disabled={controlsDisabled}
          className={cn(
            `min-h-9 min-w-0 flex-1 ${compact ? 'break-words' : 'truncate'} rounded-lg text-left text-sm font-medium ${
              isOn ? surface.textPrimary : surface.textSecondary
            }`,
            showToggle && '-ml-[3px]',
            compact && 'flex items-center justify-between gap-2',
            getThemeFocusRingClassName(theme)
          )}
        >
          <span className="min-w-0">
            {secondaryText ? (
              <>
                <span className="block">{name}</span>
                <span className={cn('block text-xs font-normal', surface.textMuted)}>
                  {secondaryText}
                </span>
              </>
            ) : (
              name
            )}
          </span>
          {compact && stateLabel !== '' ? (
            <span
              className={cn(
                'max-w-[45%] shrink-0 text-right text-xs font-normal tabular-nums',
                surface.textSecondary
              )}
            >
              {displayStateLabel}
            </span>
          ) : null}
        </button>
      ) : (
        <span
          className={cn(
            '-ml-[3px] min-w-0 flex-1 break-words text-sm font-medium',
            isOn ? surface.textPrimary : surface.textSecondary
          )}
        >
          {name}
        </span>
      )}

      {isOn && supportsBrightness ? (
        <div
          className={
            compact ? 'hidden w-14 shrink-0 @min-[14rem]/light-row:block' : 'w-20 min-w-16 sm:w-24'
          }
        >
          <BrightnessSlider
            value={brightness}
            onChange={onBrightnessChange}
            onCommit={onBrightnessCommit}
            isOn
            size="extra-small"
            showLabel={false}
            activeColor={activeColor}
            inverseSurface={false}
            disabled={controlsDisabled}
            ariaLabel={`${t('lighting.brightness')}: ${name}`}
          />
        </div>
      ) : null}

      {stateLabel !== '' && !(compact && cardInteraction) ? (
        <span
          className={cn(
            compact ? 'max-w-[45%] shrink-0' : 'w-8 shrink-0',
            'text-right text-xs tabular-nums',
            surface.textSecondary
          )}
        >
          {displayStateLabel}
        </span>
      ) : null}
    </div>
  );
});
