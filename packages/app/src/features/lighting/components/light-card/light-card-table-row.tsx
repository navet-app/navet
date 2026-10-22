import {
  companionEntityDisabledClassName,
  companionEntityIconClassName,
  companionEntityNameTypography,
  companionEntityRowClassName,
  companionEntityValueClassName,
  companionRowHighlight,
} from '@navet/app/components/shared/companion-row-presentation';
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
  unavailable?: boolean;
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
  unavailable = false,
  toggleDisabled = false,
  secondaryText,
  showToggle = true,
  stateLabel,
}: LightCardTableRowProps) {
  const { t } = useI18n();
  const { theme, accentColor, primaryColor } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const controlsDisabled = isEditMode || disabled || unavailable;
  const displaySecondaryText = unavailable ? undefined : secondaryText;
  const displayStateLabel = unavailable
    ? t('common.unavailable')
    : (stateLabel ??
      (isOn && supportsBrightness
        ? `${Math.round(brightness)}%`
        : isOn
          ? t('common.on')
          : t('common.off')));
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
        compact ? `@container/light-row ${companionEntityRowClassName}` : 'min-h-12 gap-3',
        !isEditMode && !compact && 'cursor-pointer rounded-xl',
        compact && `relative ${companionRowHighlight}`,
        compact && controlsDisabled && companionEntityDisabledClassName,
        !controlsDisabled && surface.hoverBg
      )}
      data-light-table-row
    >
      {showToggle ? (
        <button
          type="button"
          aria-label={iconButtonProps['aria-label']}
          aria-pressed={unavailable ? undefined : isOn}
          disabled={controlsDisabled || toggleDisabled}
          onClick={iconButtonProps.onClick}
          onPointerDown={iconButtonProps.onPointerDown}
          className={cn(
            'flex shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-75',
            compact ? 'relative z-10 -mx-2.5 h-9 w-9' : '-ml-[5px] h-11 w-11',
            getThemeFocusRingClassName(theme)
          )}
        >
          <span
            className={
              compact
                ? `flex items-center justify-center ${surface.textMuted}`
                : cn(iconPill.badgeClassName, 'navet-card-header-control-dense')
            }
            style={compact ? undefined : iconPill.badgeStyle}
            data-light-row-icon-pill={compact ? undefined : true}
          >
            {iconText ? (
              <span
                className={
                  compact
                    ? 'text-xs font-medium'
                    : cn('text-xs font-semibold', iconPill.iconClassName)
                }
                style={compact ? undefined : iconPill.iconStyle}
              >
                {iconText}
              </span>
            ) : (
              <ToggleIcon
                className={compact ? companionEntityIconClassName : iconPill.iconClassName}
                style={compact ? undefined : iconPill.iconStyle}
                aria-hidden="true"
              />
            )}
          </span>
        </button>
      ) : compact ? (
        <ToggleIcon
          aria-hidden="true"
          className={`${companionEntityIconClassName} ${surface.textMuted}`}
        />
      ) : null}

      {cardInteraction ? (
        <button
          {...cardInteraction.settingsButtonProps}
          aria-haspopup="dialog"
          disabled={controlsDisabled}
          className={cn(
            `min-h-9 min-w-0 flex-1 ${compact ? 'break-words' : 'truncate'} rounded-lg text-left ${
              compact || isOn ? surface.textPrimary : surface.textSecondary
            }`,
            compact ? companionEntityNameTypography : 'text-sm font-medium',
            showToggle && !compact && '-ml-[3px]',
            compact &&
              'flex items-center justify-between gap-2 after:absolute after:inset-0 after:rounded-lg after:content-[""]',
            getThemeFocusRingClassName(theme)
          )}
        >
          <span className="min-w-0">
            {displaySecondaryText ? (
              <>
                <span className="block">{name}</span>
                <span className={cn('block text-xs font-normal', surface.textMuted)}>
                  {displaySecondaryText}
                </span>
              </>
            ) : (
              name
            )}
          </span>
          {compact && (unavailable || stateLabel !== '') ? (
            <span className={cn(companionEntityValueClassName, surface.textPrimary)}>
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
