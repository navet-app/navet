import { dispatchEntityCommand } from '@navet/app/commands';
import {
  CardDialogSection,
  SelectableCheckboxList,
  SelectableCheckboxRow,
} from '@navet/app/components/patterns';
import { BaseCardDialog, type BaseCardDialogTab } from '@navet/app/components/primitives';
import {
  CustomCardTintPicker,
  DialogSectionRow,
  IconPicker,
} from '@navet/app/components/shared/device-editor';
import {
  NEUTRAL_DIALOG_CONTROL_ACCENT,
  normalizeCustomCardTint,
} from '@navet/app/components/shared/theme/custom-card-tint-surface';
import {
  getAccentDialogSurface,
  getThemeColorValue,
  resolvePrimaryColorToken,
} from '@navet/app/components/shared/theme/theme-colors';
import { useI18n, useTheme } from '@navet/app/hooks';
import type { DeviceMetric } from '@navet/app/types/device.types';
import {
  compactRepeatedDeviceLabel,
  compactRepeatedLabelGroup,
} from '@navet/app/utils/compact-device-label';
import { getEntityTypeLabel } from '@navet/app/utils/entity-type-label';
import { Palette, Sliders, ToggleLeft } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { memo, useCallback } from 'react';
import type { SwitchSiblingEntity } from './use-switch-card-controller';

interface SwitchSettingsDialogProps {
  onCloseAutoFocus?: (event: Event) => void;
  entityId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  labelContextName?: string;
  entityType: string;
  isOn: boolean;
  metricSectionTitle: string;
  metricSectionDescription: string;
  metricLimit: number;
  availableMetrics: DeviceMetric[];
  selectedMetricLabels: string[];
  getMetricLabel: (metric: DeviceMetric) => string;
  onMetricToggle: (label: string) => void;
  selectedIcon: string;
  onIconChange: (iconName: string) => void;
  siblingEntities: SwitchSiblingEntity[];
  customControls?: ReactNode;
  tintColor: string;
  onTintColorChange: (color: string) => void;
  dialogTintColor?: string;
  dialogSurfaceClassName?: string;
  dialogSurfaceStyle?: CSSProperties;
}

export const SwitchSettingsDialog = memo(function SwitchSettingsDialog({
  entityId,
  isOpen,
  onOpenChange,
  onCloseAutoFocus,
  name,
  labelContextName,
  entityType,
  isOn,
  metricSectionTitle,
  metricSectionDescription,
  metricLimit,
  availableMetrics,
  selectedMetricLabels,
  getMetricLabel,
  onMetricToggle,
  selectedIcon,
  onIconChange,
  siblingEntities,
  customControls,
  tintColor,
  onTintColorChange,
  dialogTintColor,
  dialogSurfaceClassName,
  dialogSurfaceStyle,
}: SwitchSettingsDialogProps) {
  const { primaryColor, theme } = useTheme();
  const { t } = useI18n();
  const hasControls = siblingEntities.length > 0 || customControls != null;
  const hasMetrics = availableMetrics.length > 0;

  const activeDialogColors = getAccentDialogSurface(resolvePrimaryColorToken(primaryColor));
  const activeAccentColor =
    normalizeCustomCardTint(tintColor) ??
    normalizeCustomCardTint(dialogTintColor) ??
    getThemeColorValue(primaryColor);
  const dialogSurface = isOn
    ? {
        panel: `bg-linear-to-br ${activeDialogColors.from} ${activeDialogColors.to}`,
        border: activeDialogColors.border,
      }
    : {
        panel: 'bg-linear-to-br from-gray-900/95 to-gray-950/95',
        border: 'border-gray-500/10',
      };
  const dialogSurfaceOverrideClassName = isOn ? (dialogSurfaceClassName ?? '') : undefined;
  const resolvedDialogSurfaceStyle = isOn ? dialogSurfaceStyle : undefined;
  const siblingLabels = siblingEntities
    .map((entry) => entry.entity.attributes?.friendly_name)
    .filter((label): label is string => typeof label === 'string' && label.trim().length > 0);

  const tabs: BaseCardDialogTab[] = [
    ...(hasControls
      ? [
          {
            key: 'controls',
            label: t('common.controls'),
            icon: ToggleLeft,
            content: (
              <div className="space-y-6">
                <DialogSectionRow
                  label={t('camera.settings.switches')}
                  labelClassName="mb-1 text-white"
                >
                  <div className="space-y-2">
                    {customControls}
                    {siblingEntities.map(({ id, entity }) => (
                      <SwitchControlRow
                        key={id}
                        entityId={id}
                        label={getSiblingDisplayName(
                          labelContextName ?? name,
                          siblingLabels,
                          id,
                          entity
                        )}
                        typeLabel={getEntityTypeLabel(id)}
                        isOn={entity.state === 'on'}
                      />
                    ))}
                  </div>
                </DialogSectionRow>
              </div>
            ),
          } satisfies BaseCardDialogTab,
        ]
      : []),
    ...(hasMetrics
      ? [
          {
            key: 'metrics',
            label: t('common.metrics'),
            icon: Sliders,
            content: (
              <div className="space-y-6">
                <CardDialogSection label={metricSectionTitle}>
                  <SelectableCheckboxList className="max-h-72 overflow-y-auto">
                    {availableMetrics.map((metric) => {
                      const isSelected = selectedMetricLabels.includes(metric.label);
                      const isDisabled = !isSelected && selectedMetricLabels.length >= metricLimit;

                      return (
                        <li key={`dialog-${metric.label}`}>
                          <SelectableCheckboxRow
                            checked={isSelected}
                            disabled={isDisabled}
                            onCheckedChange={(nextChecked) => {
                              if (nextChecked === isSelected) return;
                              onMetricToggle(metric.label);
                            }}
                            label={getMetricLabel(metric)}
                            description={isDisabled ? metricSectionDescription : undefined}
                            checkboxAppearance="secondary"
                            checkboxPaletteColor={activeAccentColor}
                            rowClassName="text-white hover:bg-white/5"
                            descriptionClassName="text-white/58"
                          />
                        </li>
                      );
                    })}
                  </SelectableCheckboxList>
                </CardDialogSection>
              </div>
            ),
          } satisfies BaseCardDialogTab,
        ]
      : []),
    {
      key: 'card',
      label: t('common.customize'),
      icon: Palette,
      content: (
        <div className="space-y-6">
          <CustomCardTintPicker
            value={tintColor}
            onChange={onTintColorChange}
            isOn={isOn}
            defaultColor={activeAccentColor}
            pickerRingColor={activeAccentColor}
          />
          <IconPicker
            selectedIcon={selectedIcon}
            onIconChange={onIconChange}
            isLightOn={isOn}
            label={t('lighting.switch.icon')}
            accentColor={activeAccentColor}
          />
        </div>
      ),
    },
  ];

  return (
    <BaseCardDialog
      onCloseAutoFocus={onCloseAutoFocus}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={name}
      entityId={entityId}
      description={entityType}
      tabs={tabs}
      theme={theme}
      tintColor={isOn ? tintColor : NEUTRAL_DIALOG_CONTROL_ACCENT}
      contentSurface={dialogSurface}
      contentClassName={dialogSurfaceOverrideClassName}
      contentStyle={resolvedDialogSurfaceStyle}
      disableOpenAutoFocus
      maxWidth="md"
      height="capped"
      scrollClassName="max-sm:min-h-0 max-sm:flex-1"
      bodyClassName="w-full"
    />
  );
});

function getSiblingDisplayName(
  primaryLabel: string,
  siblingLabels: readonly string[],
  entityId: string,
  entity: SwitchSiblingEntity['entity']
): string {
  const friendly = entity.attributes?.friendly_name;
  if (typeof friendly === 'string' && friendly.trim().length > 0) {
    const compactByPrimaryLabel = compactRepeatedDeviceLabel(friendly, primaryLabel, siblingLabels);
    if (compactByPrimaryLabel !== friendly) {
      return compactByPrimaryLabel;
    }

    return compactRepeatedLabelGroup(friendly, siblingLabels);
  }

  return entityId
    .replace(/^[^.]+\./, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function SwitchControlRow({
  entityId,
  label,
  typeLabel,
  isOn,
}: {
  entityId: string;
  label: string;
  typeLabel: string;
  isOn: boolean;
}) {
  const handleToggle = useCallback(async () => {
    await dispatchEntityCommand({
      type: isOn ? 'turn_off' : 'turn_on',
      entityId,
    });
  }, [entityId, isOn]);

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-transparent bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/10"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-white">{label}</span>
        <span className="block text-xs text-white/72">{typeLabel}</span>
      </span>
      <div
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          isOn ? 'bg-blue-500' : 'bg-white/20'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
            isOn ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </div>
    </button>
  );
}
