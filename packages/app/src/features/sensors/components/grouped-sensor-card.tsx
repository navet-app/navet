import { CardEmptyState } from '@navet/app/components/patterns';
import { BaseCard, OverlayScrollArea } from '@navet/app/components/primitives';
import { EntityCardHeader } from '@navet/app/components/primitives/entity-card-header';
import { EntityCardHeaderIcon } from '@navet/app/components/primitives/entity-card-header-icon';
import { type CardSize, isCompactCardSize } from '@navet/app/components/shared/card-size-selector';
import { useEditModeSettingsRequest } from '@navet/app/components/shared/edit-mode-settings-request';
import type { EntityCardDialogControl } from '@navet/app/components/shared/entity-card-dialog';
import { getAccentCardShellTokens } from '@navet/app/components/shared/theme/accent-card-shell-tokens';
import { getCardReadableTextTokens } from '@navet/app/components/shared/theme/card-readable-text-tokens';
import { getCardShellSurfaceTokens } from '@navet/app/components/shared/theme/card-shell-surface-tokens';
import { useAreaRooms, useI18n, useTheme } from '@navet/app/hooks';
import { useDashboardWidgetRoomOptions } from '@navet/app/hooks/use-dashboard-widget-room-options';
import { Gauge, Plus } from 'lucide-react';
import { type KeyboardEvent, memo } from 'react';
import { SensorGroupSettingsDialog } from './sensor-group-settings';
import type { AvailableSensor } from './sensor-group-settings/types';
import { iconMap, type SensorReading, SmallSensorDisplay, useSensorGroup } from './sensors';

const GROUPED_SENSOR_MAX_SENSORS = 6;

interface GroupedSensorCardProps {
  dialog?: EntityCardDialogControl;
  id: string;
  name: string;
  room: string;
  sensors: SensorReading[];
  size: CardSize;
  onSizeChange: (id: string, size: CardSize) => void;
  isEditMode: boolean;
  accentColor?: 'teal' | 'blue' | 'purple' | 'amber' | 'emerald';
  availableSensors?: AvailableSensor[];
  emptyText?: string;
  showRoomSelector?: boolean;
  onNameChange?: (name: string) => void;
  onRoomChange?: (room: string) => void;
  onSensorsUpdate?: (sensors: SensorReading[]) => void;
  onOpenSettings?: () => void;
  disableBuiltInSettingsDialog?: boolean;
}

export const GroupedSensorCard = memo(function GroupedSensorCard({
  id,
  name,
  room,
  sensors,
  size,
  onSizeChange: _onSizeChange,
  isEditMode,
  accentColor = 'teal',
  availableSensors,
  emptyText,
  showRoomSelector = true,
  onNameChange,
  onRoomChange,
  onSensorsUpdate,
  onOpenSettings,
  disableBuiltInSettingsDialog = false,
  dialog,
}: GroupedSensorCardProps) {
  const {
    selectedSensors,
    isSettingsOpen: localIsSettingsOpen,
    setIsSettingsOpen: setLocalIsSettingsOpen,
    handleSensorsUpdate,
    visibleSensors,
  } = useSensorGroup({ initialSensors: sensors, maxSensors: GROUPED_SENSOR_MAX_SENSORS });
  const isSettingsOpen = dialog?.isOpen ?? localIsSettingsOpen;
  const setIsSettingsOpen = dialog?.onOpenChange ?? setLocalIsSettingsOpen;
  const { theme } = useTheme();
  const { t } = useI18n();
  const rooms = useAreaRooms();
  const { roomValue, roomLabel, roomOptions } = useDashboardWidgetRoomOptions(room, rooms);
  const cardShell = getCardShellSurfaceTokens(theme);

  // Size-specific styling with intelligent layout adaptation
  const isSmall = isCompactCardSize(size);
  const isMedium = size === 'medium';
  const shell = getAccentCardShellTokens(theme, accentColor);
  const emptyAccentColor = {
    amber: '#f59e0b',
    blue: '#3b82f6',
    emerald: '#10b981',
    purple: '#a855f7',
    teal: '#14b8a6',
  }[accentColor];
  const readableText = getCardReadableTextTokens({
    theme,
    tone: accentColor,
    baseColor: emptyAccentColor,
  });

  // Get primary icon (first sensor's icon or default)
  const PrimaryIcon = selectedSensors[0]?.icon ? iconMap[selectedSensors[0].icon] : Gauge;

  const handleSettingsSensorsUpdate = (newSensors: SensorReading[]) => {
    handleSensorsUpdate(newSensors);
    onSensorsUpdate?.(newSensors);
  };
  const isEmpty = visibleSensors.length === 0;
  const openSettings = () => {
    if (onOpenSettings) {
      onOpenSettings();
      return;
    }

    if (!disableBuiltInSettingsDialog) {
      setIsSettingsOpen(true);
    }
  };
  useEditModeSettingsRequest(
    id,
    openSettings,
    isEditMode && !disableBuiltInSettingsDialog && onOpenSettings === undefined
  );
  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openSettings();
    }
  };

  return (
    <div className={dialog ? undefined : 'h-full w-full relative'}>
      {!dialog ? (
        <BaseCard
          size={size}
          role={isEmpty ? undefined : 'button'}
          tabIndex={isEmpty ? undefined : 0}
          aria-label={isEmpty ? undefined : t('entityCardInteraction.openSettings', { name })}
          onClick={isEmpty ? undefined : openSettings}
          onKeyDown={isEmpty ? undefined : handleCardKeyDown}
          interactive={!isEmpty}
          className="text-left"
          frameClassName={`${cardShell.rootFrameClassName} ${shell.containerClassName}`}
          disableDefaultSheen
          overlay={
            <>
              <div className={`absolute inset-0 ${shell.glowClassName}`} />
              {shell.overlayClassName ? (
                <div className={`absolute inset-0 ${shell.overlayClassName}`} />
              ) : null}
            </>
          }
          contentClassName="h-full"
        >
          <div className="relative h-full flex flex-col">
            {isEmpty ? null : (
              <EntityCardHeader
                title={name}
                titleOverflow="wrap"
                subtitle={t('widgets.common.widget')}
                layout="eyebrow-first"
                size={size}
                tone={accentColor}
                leading={
                  <EntityCardHeaderIcon
                    IconComponent={PrimaryIcon}
                    isActive={true}
                    size={size}
                    tone={accentColor}
                  />
                }
              />
            )}

            {/* Sensor Grid */}
            <div className="flex-1 flex items-end min-h-0">
              {isEmpty ? (
                <CardEmptyState
                  title={emptyText ?? t('sensors.group.emptyState')}
                  description={t('sensors.groupSettings.emptySelected')}
                  icon={Gauge}
                  actionLabel={t('sensors.groupSettings.addSensors')}
                  onAction={openSettings}
                  actionIcon={Plus}
                  size={size}
                  accentColor={emptyAccentColor}
                />
              ) : isSmall || isMedium ? (
                <SmallSensorDisplay
                  sensors={visibleSensors}
                  textPrimaryColor={readableText.titleColor}
                  textSecondaryColor={readableText.subtitleColor}
                  size={isMedium ? 'medium' : 'small'}
                />
              ) : (
                <OverlayScrollArea
                  className="flex flex-1 flex-col"
                  contentClassName="flex min-h-full flex-col pr-3"
                >
                  <div className="mt-auto">
                    <SmallSensorDisplay
                      sensors={visibleSensors}
                      textPrimaryColor={readableText.titleColor}
                      textSecondaryColor={readableText.subtitleColor}
                      size="medium"
                    />
                  </div>
                </OverlayScrollArea>
              )}
            </div>
          </div>
        </BaseCard>
      ) : null}

      {!disableBuiltInSettingsDialog && isSettingsOpen ? (
        <SensorGroupSettingsDialog
          onCloseAutoFocus={dialog?.onCloseAutoFocus}
          entityId={id}
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          groupName={name}
          roomValue={roomValue}
          roomLabel={roomLabel}
          roomOptions={roomOptions}
          currentSensors={selectedSensors}
          maxSensors={GROUPED_SENSOR_MAX_SENSORS}
          accentColor={accentColor}
          availableSensors={availableSensors}
          showRoomSelector={showRoomSelector}
          onNameChange={onNameChange}
          onRoomChange={onRoomChange}
          onSensorsUpdate={handleSettingsSensorsUpdate}
        />
      ) : null}
    </div>
  );
});
