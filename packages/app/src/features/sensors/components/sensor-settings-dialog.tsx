import { BaseCardDialog } from '@navet/app/components/primitives';
import { IconPicker } from '@navet/app/components/shared/device-editor';
import { useI18n, useTheme } from '@navet/app/hooks';
import { Palette } from 'lucide-react';
import { memo } from 'react';

interface SensorSettingsDialogProps {
  onCloseAutoFocus?: (event: Event) => void;
  entityId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  entityType: string;
  selectedIcon: string;
  onIconChange: (iconName: string) => void;
}

export const SensorSettingsDialog = memo(function SensorSettingsDialog({
  onCloseAutoFocus,
  entityId,
  isOpen,
  onOpenChange,
  name,
  entityType,
  selectedIcon,
  onIconChange,
}: SensorSettingsDialogProps) {
  const { t } = useI18n();
  const { theme } = useTheme();

  return (
    <BaseCardDialog
      onCloseAutoFocus={onCloseAutoFocus}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={name}
      description={entityType}
      entityId={entityId}
      entityType="sensor"
      theme={theme}
      disableOpenAutoFocus
      maxWidth="md"
      mobileFitContent
      tabs={[
        {
          key: 'card',
          label: t('common.customize'),
          icon: Palette,
          content: (
            <IconPicker
              selectedIcon={selectedIcon}
              onIconChange={onIconChange}
              isLightOn={false}
              label={t('sensors.card.icon')}
            />
          ),
        },
      ]}
    />
  );
});
