import { CardDialogSection } from '@navet/app/components/patterns';
import { Button } from '@navet/app/components/primitives/button';
import {
  BaseCardDialog,
  type BaseCardDialogTab,
} from '@navet/app/components/primitives/Cards/BaseCardDialog';
import { CustomCardTintPicker } from '@navet/app/components/shared/device-editor';
import {
  getInheritedDialogSectionStyle,
  normalizeCustomCardTint,
  withTintAlpha,
} from '@navet/app/components/shared/theme/custom-card-tint-surface';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { useI18n } from '@navet/app/hooks';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import { getEntityTypeLabel } from '@navet/app/utils/entity-type-label';
import { Map as MapIcon, Palette, Sliders } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { VacuumCleaningControls } from './vacuum-cleaning-controls';
import type { VacuumCleaningArea } from './vacuum-features';
import { VacuumPlannerSection } from './vacuum-planner-section';
import { getVacuumStatusLabelKey, type VacuumStatus } from './vacuum-utils';

const DEFAULT_VACUUM_ACCENT_COLOR = '#06b6d4';
type VacuumSettingsTab = 'controls' | 'map' | 'card';

function isVacuumSettingsTab(value: string): value is VacuumSettingsTab {
  return value === 'controls' || value === 'map' || value === 'card';
}

interface VacuumSettingsDialogProps {
  entityId: string;
  isOpen: boolean;
  disabled?: boolean;
  onClose: () => void;
  isLawnMower?: boolean;
  onStartCleaning: () => void;
  onStartAreaCleaning?: (areaIds: string[]) => void;
  onPauseCleaning?: () => void;
  onStopCleaning?: () => void;
  onReturnHome: () => void;
  onLocate?: () => void;
  onCleanSpot?: () => void;
  onSetFanSpeed?: (fanSpeed: string) => void;
  name: string;
  room: string;
  theme: ThemeType;
  accentColorValue: string;
  currentStatus?: VacuumStatus;
  fanSpeed?: string;
  fanSpeeds?: string[];
  supportsFanSpeed?: boolean;
  isUpdatingFanSpeed?: boolean;
  capabilities?: import('./vacuum-features').VacuumCapabilities;
  availableCleaningAreas?: VacuumCleaningArea[];
  tintColor?: string;
  onTintColorChange?: (color: string) => void;
}

export const VacuumSettingsDialog = memo(function VacuumSettingsDialog({
  entityId,
  isOpen,
  disabled = false,
  onClose,
  isLawnMower = false,
  onStartCleaning,
  onPauseCleaning,
  onStopCleaning,
  currentStatus,
  onStartAreaCleaning,
  onReturnHome,
  onLocate,
  onCleanSpot,
  onSetFanSpeed,
  name,
  room,
  theme,
  accentColorValue,
  fanSpeed,
  fanSpeeds,
  supportsFanSpeed = true,
  isUpdatingFanSpeed = false,
  capabilities,
  availableCleaningAreas,
  tintColor,
  onTintColorChange,
}: VacuumSettingsDialogProps) {
  const { t } = useI18n();
  const startActionLabel = t(
    isLawnMower ? 'lawnMower.action.startMowing' : 'vacuum.action.startCleaning'
  );
  const surface = getThemeSurfaceTokens(theme);
  const entityType = getEntityTypeLabel(entityId);
  const cleaningAreas = useMemo(
    () => availableCleaningAreas ?? capabilities?.availableCleaningAreas ?? [],
    [availableCleaningAreas, capabilities?.availableCleaningAreas]
  );
  const shouldShowMapTab = (capabilities?.canShowMap ?? false) || cleaningAreas.length > 0;
  const speedOptions = useMemo(() => {
    if (!supportsFanSpeed || capabilities?.canSetFanSpeed === false) {
      return [];
    }

    return fanSpeeds ?? capabilities?.fanSpeedOptions ?? [];
  }, [fanSpeeds, supportsFanSpeed, capabilities?.fanSpeedOptions, capabilities?.canSetFanSpeed]);
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>([]);
  const [localTintColor, setLocalTintColor] = useState<string>(tintColor ?? accentColorValue);
  const [activeTab, setActiveTab] = useState<VacuumSettingsTab>('controls');
  const wasOpenRef = useRef(isOpen);

  useEffect(() => {
    const wasOpen = wasOpenRef.current;

    if (isOpen && !wasOpen) {
      setSelectedAreaIds([]);
      setLocalTintColor(tintColor ?? accentColorValue);
      setActiveTab('controls');
    }

    wasOpenRef.current = isOpen;
  }, [accentColorValue, isOpen, tintColor]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (activeTab === 'map' && !shouldShowMapTab) {
      setActiveTab('controls');
    }
  }, [activeTab, isOpen, shouldShowMapTab]);

  const resolvedTintColor =
    normalizeCustomCardTint(tintColor) ?? normalizeCustomCardTint(localTintColor);
  const sectionStyle = getInheritedDialogSectionStyle(theme, resolvedTintColor, accentColorValue);
  const activeControlColor =
    resolvedTintColor ?? normalizeCustomCardTint(accentColorValue) ?? DEFAULT_VACUUM_ACCENT_COLOR;
  const activePillStyle = activeControlColor
    ? {
        backgroundColor: withTintAlpha(activeControlColor, theme === 'light' ? 0.14 : 0.22),
        borderColor: withTintAlpha(activeControlColor, theme === 'light' ? 0.24 : 0.42),
        color: theme === 'light' ? undefined : withTintAlpha(activeControlColor, 0.96),
        boxShadow: `inset 0 0 0 1px ${withTintAlpha(activeControlColor, theme === 'light' ? 0.14 : 0.26)}`,
      }
    : sectionStyle;
  const handleTintChange = (color: string) => {
    setLocalTintColor(color);
    onTintColorChange?.(color);
  };

  const handleTabChange = (nextTab: string) => {
    if (isVacuumSettingsTab(nextTab)) {
      setActiveTab(nextTab);
    }
  };

  const handlePlannerStart = () => {
    if (selectedAreaIds.length > 0) {
      onStartAreaCleaning?.(selectedAreaIds);
      return;
    }

    onStartCleaning();
  };

  const statusControls = (
    <div className="flex items-center justify-between gap-4">
      <div
        className={`min-w-0 break-words text-lg font-semibold ${surface.textPrimary}`}
        aria-live="polite"
      >
        {disabled
          ? t('common.unavailable')
          : currentStatus
            ? t(getVacuumStatusLabelKey(currentStatus, { isLawnMower }))
            : t('providerDetails.unknown')}
      </div>
      {capabilities?.canStart !== false ? (
        <Button
          size="compact"
          variant="primary"
          className="shrink-0"
          onClick={handlePlannerStart}
          disabled={disabled || (selectedAreaIds.length > 0 && !onStartAreaCleaning)}
        >
          {startActionLabel}
        </Button>
      ) : null}
    </div>
  );

  const tabs: BaseCardDialogTab[] = [
    {
      key: 'controls',
      label: t('common.controls'),
      icon: Sliders,
      content: (
        <div className="space-y-4">
          {statusControls}
          <VacuumCleaningControls
            isLawnMower={isLawnMower}
            fanSpeed={fanSpeed ?? capabilities?.currentFanSpeed ?? ''}
            onFanSpeedChange={onSetFanSpeed}
            fanSpeedOptions={speedOptions}
            supportsFanSpeed={supportsFanSpeed}
            isUpdatingFanSpeed={isUpdatingFanSpeed}
            disabled={disabled}
            onReturnHome={onReturnHome}
            onLocate={onLocate}
            onCleanSpot={onCleanSpot}
            capabilities={capabilities}
            accentColor={activeControlColor}
            theme={theme}
            isRunning={currentStatus === 'cleaning' || currentStatus === 'mopping'}
            onPauseCleaning={onPauseCleaning}
            onStopCleaning={onStopCleaning}
          />
        </div>
      ),
    },
    ...(shouldShowMapTab
      ? [
          {
            key: 'map',
            label: t('vacuum.settings.map'),
            icon: MapIcon,
            content: (
              <div className="space-y-4">
                {statusControls}
                <CardDialogSection className="mb-0">
                  <div className={`text-sm font-medium ${surface.textPrimary}`}>
                    {t('vacuum.settings.plan')}
                  </div>
                  <VacuumPlannerSection
                    availableAreas={cleaningAreas}
                    selectedAreaIds={selectedAreaIds}
                    onSelectedAreaIdsChange={setSelectedAreaIds}
                    canOrderAreaCleaning={capabilities?.canOrderAreaCleaning ?? false}
                    accentColor={activeControlColor}
                    activePillStyle={activePillStyle}
                  />
                </CardDialogSection>
              </div>
            ),
          },
        ]
      : []),
    {
      key: 'card',
      label: t('common.customize'),
      icon: Palette,
      content: (
        <CustomCardTintPicker
          value={resolvedTintColor}
          onChange={handleTintChange}
          isOn={theme !== 'light'}
          defaultColor={accentColorValue}
        />
      ),
    },
  ];

  return (
    <BaseCardDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={name}
      entityId={entityId}
      entityType={entityType}
      roomSelectorFallbackRoomName={room}
      theme={theme}
      tintColor={resolvedTintColor}
      defaultTintAccent={accentColorValue}
      disableOpenAutoFocus
      height="capped"
      mobileFitContent
      maxWidth="md"
      tabs={tabs}
      activeTab={activeTab}
      onActiveTabChange={handleTabChange}
    />
  );
});
