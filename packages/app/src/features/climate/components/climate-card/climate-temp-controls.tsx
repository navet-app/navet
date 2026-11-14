import { RoundControlButton } from '@navet/app/components/primitives/round-control-button';
import { getCardActionControlSizes } from '@navet/app/components/shared/card-action-control-sizes';
import { type CardSize, isCompactCardSize } from '@navet/app/components/shared/card-size-selector';
import { navetSpacingTokens } from '@navet/app/components/system/tokens';
import { useI18n, useTheme } from '@navet/app/hooks';
import { Minus, Plus } from 'lucide-react';
import { memo, type ReactNode } from 'react';

interface ClimateTempControlsProps {
  children?: ReactNode;
  targetTemp: number;
  onTempChange: (temp: number) => void;
  onTempCommit?: (temp: number) => void;
  isOn: boolean;
  size?: CardSize;
  controlSize?: 'sm' | 'md' | 'lg';
  minTemp?: number;
  maxTemp?: number;
  step?: number;
  targetLabel?: string;
  lowerLimit?: number;
  upperLimit?: number;
}

function snapTemperature(value: number, minTemp: number, maxTemp: number, step: number) {
  const safeStep = step > 0 ? step : 0.5;
  const snappedValue = Math.round((value - minTemp) / safeStep) * safeStep + minTemp;
  return Number(Math.min(maxTemp, Math.max(minTemp, snappedValue)).toFixed(3));
}

export const ClimateTempControls = memo(function ClimateTempControls({
  targetTemp,
  onTempChange,
  onTempCommit,
  isOn,
  size = 'medium',
  controlSize,
  minTemp = 16,
  maxTemp = 30,
  step = 0.5,
  targetLabel,
  lowerLimit,
  upperLimit,
  children,
}: ClimateTempControlsProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const isCompact = isCompactCardSize(size);
  const primitiveSize = isCompact ? 'small' : size === 'large' ? 'large' : 'medium';
  const controlSizes = getCardActionControlSizes(primitiveSize);
  const hoverScale = isCompact ? 'hover:scale-105' : '';

  const decrease = snapTemperature(targetTemp - step, minTemp, maxTemp, step);
  const increase = snapTemperature(targetTemp + step, minTemp, maxTemp, step);
  const decreaseLabel = t('climate.decreaseTemperature');
  const increaseLabel = t('climate.increaseTemperature');

  return (
    <div className={`flex items-center ${children ? 'gap-4' : navetSpacingTokens.inline.xs}`}>
      <RoundControlButton
        theme={theme}
        size={primitiveSize}
        controlSize={controlSize}
        variant="soft"
        onClick={(e) => {
          e.stopPropagation();
          (onTempCommit ?? onTempChange)(decrease);
        }}
        aria-label={targetLabel ? `${decreaseLabel} · ${targetLabel}` : decreaseLabel}
        disabled={
          !isOn ||
          (lowerLimit !== undefined &&
            (targetTemp - step < lowerLimit - 0.000001 ||
              decrease >= targetTemp ||
              decrease < lowerLimit))
        }
        className={`${hoverScale} disabled:opacity-50`}
      >
        <Minus className={controlSize === 'lg' ? 'h-5 w-5' : controlSizes.icon} />
      </RoundControlButton>
      {children}
      <RoundControlButton
        theme={theme}
        size={primitiveSize}
        controlSize={controlSize}
        variant="soft"
        onClick={(e) => {
          e.stopPropagation();
          (onTempCommit ?? onTempChange)(increase);
        }}
        aria-label={targetLabel ? `${increaseLabel} · ${targetLabel}` : increaseLabel}
        disabled={
          !isOn ||
          (upperLimit !== undefined &&
            (targetTemp + step > upperLimit + 0.000001 ||
              increase <= targetTemp ||
              increase > upperLimit))
        }
        className={`${hoverScale} disabled:opacity-50`}
      >
        <Plus className={controlSize === 'lg' ? 'h-5 w-5' : controlSizes.icon} />
      </RoundControlButton>
    </div>
  );
});
