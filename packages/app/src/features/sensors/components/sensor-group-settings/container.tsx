import { BaseCardDialogWithState } from '@navet/app/components/primitives';
import { useI18n, useTheme } from '@navet/app/hooks';
import { memo } from 'react';
import { iconMap } from '../sensors';
import { SENSOR_GROUP_COLOR_MAP } from './data';
import type { SensorGroupSettingsDialogProps } from './types';
import { useSensorGroupSettings } from './use-sensor-group-settings';
import { SensorGroupSettingsView } from './view';

export const SensorGroupSettingsContainer = memo(function SensorGroupSettingsContainer({
  isOpen,
  onClose,
  onCloseAutoFocus,
  groupName,
  roomValue,
  roomLabel,
  roomOptions,
  currentSensors,
  maxSensors,
  accentColor,
  availableSensors,
  showRoomSelector = true,
  closeOnSelect = false,
  onNameChange,
  onRoomChange,
  onSensorsUpdate,
}: SensorGroupSettingsDialogProps) {
  const colors = SENSOR_GROUP_COLOR_MAP[accentColor];
  const { t } = useI18n();
  const { theme } = useTheme();
  const controller = useSensorGroupSettings({
    currentSensors,
    maxSensors,
    onClose,
    onSensorsUpdate,
    availableSensors,
    closeOnSelect,
  });

  return (
    <BaseCardDialogWithState
      onCloseAutoFocus={onCloseAutoFocus}
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          controller.handleCancel();
        }
      }}
      title={groupName}
      description={t('widgets.common.widget')}
      roomSelector={
        showRoomSelector && roomValue && roomLabel && roomOptions
          ? {
              value: roomValue,
              label: roomLabel,
              options: roomOptions,
              onChange: onRoomChange,
            }
          : undefined
      }
      editableTitle={Boolean(onNameChange)}
      onTitleChange={onNameChange}
      controlsTabContent={
        <SensorGroupSettingsView
          selectedSensors={controller.selectedSensors}
          maxSensors={maxSensors}
          searchQuery={controller.searchQuery}
          setSearchQuery={controller.setSearchQuery}
          highlightedIndex={controller.highlightedIndex}
          setHighlightedIndex={controller.setHighlightedIndex}
          inputRef={controller.inputRef}
          colors={colors}
          theme={theme}
          filteredSensors={controller.filteredSensors}
          iconMap={iconMap}
          handleAddSensor={controller.handleAddSensor}
          handleRemoveSensor={controller.handleRemoveSensor}
          isSensorSelected={controller.isSensorSelected}
        />
      }
      theme={theme}
      maxWidth="md"
      height="capped"
      scrollClassName="max-h-[85vh] w-full min-w-0"
      bodyClassName="max-h-[85vh] w-full min-w-0"
    />
  );
});
