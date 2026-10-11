import { DeviceControlOptions } from '@navet/app/components/shared/device-editor/device-control-options';
import { DeviceControlRow } from '@navet/app/components/shared/device-editor/device-control-row';
import { useI18n } from '@navet/app/hooks';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import { Crosshair, Fan, Home, Pause, Sparkles, Square } from 'lucide-react';
import type { VacuumCapabilities } from './vacuum-features';

interface VacuumCleaningControlsProps {
  isLawnMower?: boolean;
  fanSpeed: string;
  onFanSpeedChange?: (speed: string) => void;
  fanSpeedOptions: string[];
  supportsFanSpeed: boolean;
  isUpdatingFanSpeed?: boolean;
  onReturnHome: () => void;
  onLocate?: () => void;
  onCleanSpot?: () => void;
  capabilities?: VacuumCapabilities;
  accentColor?: string;
  theme: ThemeType;
  disabled?: boolean;
  isRunning?: boolean;
  onPauseCleaning?: () => void;
  onStopCleaning?: () => void;
}

export function VacuumCleaningControls({
  isLawnMower = false,
  fanSpeed,
  onFanSpeedChange,
  fanSpeedOptions,
  supportsFanSpeed,
  isUpdatingFanSpeed = false,
  onReturnHome,
  onLocate,
  onCleanSpot,
  capabilities,
  accentColor,
  theme,
  disabled = false,
  isRunning = false,
  onPauseCleaning,
  onStopCleaning,
}: VacuumCleaningControlsProps) {
  const { t } = useI18n();
  const returnActionLabel = t(
    isLawnMower ? 'lawnMower.action.returnToBase' : 'vacuum.action.returnToDock'
  );
  const hasFanSpeedChoices = supportsFanSpeed && fanSpeedOptions.length > 1;

  return (
    <div>
      {isRunning && capabilities?.canPause && onPauseCleaning ? (
        <DeviceControlRow
          kind="action"
          theme={theme}
          label={t('vacuum.action.pause')}
          icon={<Pause className="h-4 w-4" />}
          disabled={disabled}
          onAction={onPauseCleaning}
        />
      ) : null}
      {isRunning && capabilities?.canStop && onStopCleaning ? (
        <DeviceControlRow
          kind="action"
          theme={theme}
          label={t('vacuum.action.stop')}
          icon={<Square className="h-4 w-4" />}
          disabled={disabled}
          onAction={onStopCleaning}
        />
      ) : null}
      {capabilities?.canReturnHome ? (
        <DeviceControlRow
          kind="action"
          theme={theme}
          label={returnActionLabel}
          icon={<Home className="h-4 w-4" />}
          disabled={disabled}
          onAction={onReturnHome}
        />
      ) : null}
      {capabilities?.canLocate ? (
        <DeviceControlRow
          kind="action"
          theme={theme}
          label={t('vacuum.action.locate')}
          icon={<Crosshair className="h-4 w-4" />}
          disabled={disabled || !onLocate}
          onAction={() => onLocate?.()}
        />
      ) : null}
      {capabilities?.canCleanSpot ? (
        <DeviceControlRow
          kind="action"
          theme={theme}
          label={t('vacuum.action.cleanSpot')}
          icon={<Sparkles className="h-4 w-4" />}
          disabled={disabled || !onCleanSpot}
          onAction={() => onCleanSpot?.()}
        />
      ) : null}

      {hasFanSpeedChoices ? (
        <DeviceControlRow
          kind="disclosure"
          theme={theme}
          label={t('vacuum.settings.fanSpeed')}
          value={fanSpeed || t('providerDetails.unknown')}
          icon={<Fan className="h-4 w-4" />}
        >
          <DeviceControlOptions
            label={t('vacuum.settings.fanSpeed')}
            theme={theme}
            selectionColor={accentColor}
            value={fanSpeed || null}
            options={fanSpeedOptions.map((speed) => ({ value: speed, label: speed }))}
            disabled={disabled || isUpdatingFanSpeed || !onFanSpeedChange}
            pending={isUpdatingFanSpeed}
            onValueChange={(speed) => {
              if (
                !disabled &&
                !isUpdatingFanSpeed &&
                fanSpeedOptions.includes(speed) &&
                speed !== fanSpeed
              ) {
                onFanSpeedChange?.(speed);
              }
            }}
          />
        </DeviceControlRow>
      ) : null}
    </div>
  );
}
