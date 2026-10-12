import { BaseCardDialog } from '@navet/app/components/primitives';
import { EntityRoomSelector } from '@navet/app/components/shared/entity-room-selector';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { useI18n, useTheme } from '@navet/app/hooks';
import { Palette, Sliders } from 'lucide-react';
import type { ReactNode } from 'react';

/** Compact controls-first shell shared by device dialogs with secondary configuration. */
export function DeviceControlsDialog({
  entityId,
  excludeHelperEntityIds,
  name,
  room,
  status,
  isOpen,
  onOpenChange,
  controls,
  customize,
  tintColor,
}: {
  entityId: string;
  excludeHelperEntityIds?: string[];
  name: string;
  room?: string;
  status: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  controls: ReactNode;
  customize: ReactNode;
  tintColor?: string;
}) {
  const { t } = useI18n();
  const { theme, accentColor } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  return (
    <BaseCardDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      roomSelectorFallbackRoomName={room}
      title={name}
      entityId={entityId}
      excludeHelperEntityIds={excludeHelperEntityIds}
      theme={theme}
      tintColor={tintColor}
      defaultTintAccent={accentColor}
      headerEyebrow={
        <div
          className={`flex min-w-0 items-center gap-1.5 text-xs font-medium ${surface.textSecondary}`}
        >
          <EntityRoomSelector
            entityId={entityId}
            fallbackRoomName={room}
            readOnly
            className="truncate"
          />
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{status}</span>
        </div>
      }
      tabs={[
        { key: 'controls', label: t('common.controls'), icon: Sliders, content: controls },
        { key: 'customize', label: t('common.customize'), icon: Palette, content: customize },
      ]}
      disableOpenAutoFocus
      maxWidth="md"
      height="capped"
      scrollClassName="max-sm:min-h-0 max-sm:flex-1"
    />
  );
}
