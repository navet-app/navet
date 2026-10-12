import { CardActionRow } from '@navet/app/components/patterns/card-action-row';
import { RoundControlButton } from '@navet/app/components/primitives/round-control-button';
import { CardControlNumberBadge } from '@navet/app/components/shared/card-control-number-badge';
import { CardSettingsActionButton } from '@navet/app/components/shared/card-settings-action-button';
import { useI18n } from '@navet/app/hooks';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import type { LucideIcon } from 'lucide-react';
import { Crosshair, Fan, HousePlug, Pause, Play, ScanSearch, Square } from 'lucide-react';
import type { VacuumCapabilities } from './vacuum-features';
import type { VacuumStatus } from './vacuum-utils';

interface VacuumControlsSmallProps {
  currentStatus: VacuumStatus;
  isLawnMower?: boolean;
  onStartCleaning: () => void;
  onPause: () => void;
  onStop: () => void;
  onReturnHome: () => void;
  onLocate: () => void;
  onCleanSpot: () => void;
  onCycleFanSpeed: (fanSpeed: string) => void;
  onOpenSettings: () => void;
  theme: ThemeType;
  capabilities: VacuumCapabilities;
  isUpdatingFanSpeed: boolean;
  disabled?: boolean;
}

interface VacuumActionDefinition {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
}

export function VacuumControlsSmall({
  currentStatus,
  isLawnMower = false,
  onStartCleaning,
  onPause,
  onStop,
  onReturnHome,
  onLocate,
  onCleanSpot,
  onCycleFanSpeed,
  onOpenSettings,
  theme,
  capabilities,
  isUpdatingFanSpeed,
  disabled = false,
}: VacuumControlsSmallProps) {
  const { t } = useI18n();
  const isRunning = currentStatus === 'cleaning' || currentStatus === 'mopping';
  const currentFanSpeed = capabilities.currentFanSpeed;
  const canCycleFanSpeed = capabilities.canCycleFanSpeed;

  const handleCycleFanSpeed = () => {
    if (!canCycleFanSpeed || disabled) {
      return;
    }

    const options = capabilities.fanSpeedOptions;
    const currentIndex = currentFanSpeed == null ? -1 : options.indexOf(currentFanSpeed);
    const nextSpeed = options[(currentIndex + 1 + options.length) % options.length];
    if (nextSpeed) {
      onCycleFanSpeed(nextSpeed);
    }
  };

  const fanSpeedValue =
    currentFanSpeed && currentFanSpeed.length > 0
      ? currentFanSpeed.charAt(0).toUpperCase() + currentFanSpeed.slice(1)
      : undefined;
  const currentFanSpeedIndex =
    currentFanSpeed == null ? -1 : capabilities.fanSpeedOptions.indexOf(currentFanSpeed);
  const fanSpeedBadge = currentFanSpeedIndex >= 0 ? String(currentFanSpeedIndex + 1) : undefined;
  const fanSpeedLabel = fanSpeedValue
    ? `${t('vacuum.summary.speed')}: ${fanSpeedValue}`
    : t('vacuum.summary.speed');
  const runningActionLabel = capabilities.canStop
    ? t('vacuum.action.stop')
    : t('vacuum.action.pause');
  const startActionLabel = t(
    isLawnMower ? 'lawnMower.action.startMowing' : 'vacuum.action.startCleaning'
  );
  const returnActionLabel = t(
    isLawnMower ? 'lawnMower.action.returnToBase' : 'vacuum.action.returnToDock'
  );
  const runningActionIcon = capabilities.canStop ? Square : Pause;
  const handleRunningAction = capabilities.canStop ? onStop : onPause;

  const actions: VacuumActionDefinition[] = [];

  if (isRunning ? capabilities.canPause || capabilities.canStop : capabilities.canStart) {
    actions.push({
      key: isRunning ? (capabilities.canStop ? 'stop' : 'pause') : 'start',
      label: isRunning ? runningActionLabel : startActionLabel,
      icon: isRunning ? runningActionIcon : Play,
      onSelect: isRunning ? handleRunningAction : onStartCleaning,
      disabled,
    });
  }

  if (capabilities.canReturnHome) {
    actions.push({
      key: 'return-home',
      label: returnActionLabel,
      icon: HousePlug,
      onSelect: onReturnHome,
      disabled,
    });
  }

  if (capabilities.canLocate) {
    actions.push({
      key: 'locate',
      label: t('vacuum.action.locate'),
      icon: Crosshair,
      onSelect: onLocate,
      disabled,
    });
  }

  if (capabilities.canCleanSpot) {
    actions.push({
      key: 'clean-spot',
      label: t('vacuum.action.cleanSpot'),
      icon: ScanSearch,
      onSelect: onCleanSpot,
      disabled,
    });
  }

  if (canCycleFanSpeed) {
    actions.push({
      key: 'fan-speed',
      label: fanSpeedLabel,
      icon: Fan,
      onSelect: handleCycleFanSpeed,
      disabled: disabled || isUpdatingFanSpeed,
    });
  }

  const shouldShowOverflow = actions.length > 3;
  const inlineActions = shouldShowOverflow ? actions.slice(0, 2) : actions;
  const overflowActions = shouldShowOverflow ? actions.slice(2) : [];

  return (
    <CardActionRow
      theme={theme}
      size="small"
      leftContent={inlineActions.map((action) => {
        const Icon = action.icon;

        return (
          <RoundControlButton
            key={action.key}
            theme={theme}
            size="small"
            variant="soft"
            onClick={action.onSelect}
            aria-label={action.label}
            title={action.label}
            disabled={action.disabled}
            className="relative transition-colors"
          >
            <Icon className="h-3 w-3" />
            {action.key === 'fan-speed' && fanSpeedBadge ? (
              <CardControlNumberBadge value={fanSpeedBadge} />
            ) : null}
          </RoundControlButton>
        );
      })}
      overflowItems={overflowActions.map((action) => ({
        key: action.key,
        label: action.label,
        icon: action.icon,
        onSelect: action.onSelect,
        disabled: action.disabled,
      }))}
      rightContent={
        <CardSettingsActionButton
          theme={theme}
          size="small"
          variant="soft"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onOpenSettings();
          }}
        />
      }
    />
  );
}
