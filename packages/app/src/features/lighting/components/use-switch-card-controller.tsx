import {
  isExtraSmallCardSize,
  isTinyCardSize,
} from '@navet/app/components/shared/card-size-selector';
import { useEditModeSettingsRequest } from '@navet/app/components/shared/edit-mode-settings-request';
import { useEntityCardInteractionController } from '@navet/app/components/shared/entity-card-interaction-controller';
import {
  useI18n,
  useProviderEntityModel,
  useProviderEntitySnapshot,
  useProviderEntitySnapshotRecord,
  useProviderSwitchTopology,
  useTheme,
} from '@navet/app/hooks';
import { useIntegrationStore } from '@navet/app/hooks/use-integration-store';
import type { PlatformEntitySnapshot } from '@navet/app/platform/provider-feature-models';
import { compactRepeatedDeviceLabel } from '@navet/app/utils/compact-device-label';
import { parseProviderScopedId } from '@navet/app/utils/provider-ids';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SwitchCardProps } from './switch-card.types';
import { useSwitchCardAppearance } from './use-switch-card-appearance';
import { useSwitchMetricFormatters } from './use-switch-metric-formatters';
import { useSwitchMetricState } from './use-switch-metric-state';
import { useSwitchResetTimerCleanup } from './use-switch-reset-timer-cleanup';
import { useSwitchToggleAction } from './use-switch-toggle-action';

export interface SwitchSiblingEntity {
  id: string;
  entity: PlatformEntitySnapshot;
}

export function useSwitchCardController({
  id,
  name,
  size,
  providerId,
  initialState = false,
  binaryControl,
  entityType,
  serviceDomain,
  serviceAction,
  power,
  voltage,
  energy,
  metrics,
  isEditMode = false,
}: Omit<SwitchCardProps, 'room'>) {
  const [localIsOn, setIsOn] = useState(initialState);
  const isOn = binaryControl?.isOn ?? localIsOn;
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const resetTimerRef = useRef<number | null>(null);
  const providerEntity = useProviderEntityModel(id);
  const currentProviderId = useIntegrationStore((state) => state.currentProviderId);
  const resolvedProviderId =
    providerEntity?.providerId ??
    providerId ??
    parseProviderScopedId(id)?.providerId ??
    currentProviderId;
  const isHomeAssistantProvider = resolvedProviderId === 'home_assistant';

  useSwitchResetTimerCleanup(resetTimerRef);

  const liveEntity = useProviderEntitySnapshot(id);
  const { siblingIds: siblingEntityIds } = useProviderSwitchTopology(id);
  const { accentColor, colors, theme } = useTheme();
  const { t } = useI18n();
  const resolvedEntityType = entityType || t('lighting.type.switch');
  const resolvedServiceDomain = serviceDomain || id.split('.')[0];
  const resolvedServiceAction = providerEntity?.capabilities.includes('press')
    ? 'press'
    : serviceAction || 'binary';
  const isScript = resolvedServiceDomain === 'script';
  const isTiny = isTinyCardSize(size);
  const isExtraSmall = isExtraSmallCardSize(size);
  const appearance = useSwitchCardAppearance({ id, isScript });

  useEffect(() => {
    if (liveEntity) {
      setIsOn(liveEntity.state === 'on');
      return;
    }
    setIsOn(initialState);
  }, [initialState, liveEntity]);

  const metricState = useSwitchMetricState({
    id,
    size,
    power,
    voltage,
    energy,
    metrics,
  });

  const siblingEntityRecord = useProviderEntitySnapshotRecord(siblingEntityIds, {
    providerId: resolvedProviderId,
    enabled: isHomeAssistantProvider,
  });

  const siblingEntities = useMemo<SwitchSiblingEntity[]>(
    () =>
      siblingEntityIds
        .map((eid) => {
          const entity = siblingEntityRecord[eid];
          return entity ? { id: eid, entity } : null;
        })
        .filter((entry): entry is SwitchSiblingEntity => entry !== null),
    [siblingEntityIds, siblingEntityRecord]
  );
  const displayName = useMemo(() => {
    const siblingNames = siblingEntities
      .map((entry) => {
        const friendlyName = entry.entity.attributes?.friendly_name;
        return typeof friendlyName === 'string' ? friendlyName : '';
      })
      .filter((label) => label.trim().length > 0);

    return compactRepeatedDeviceLabel(name, name, siblingNames);
  }, [name, siblingEntities]);

  const cardColors = isOn ? colors.switch.on : colors.switch.off;
  const hasControlsDialog = true;
  const defaultToggle = useSwitchToggleAction({
    id,
    providerId: resolvedProviderId,
    isOn,
    setIsOn,
    resetTimerRef,
    resolvedServiceAction,
    updateSwitchFailedMessage: t('lighting.feedback.updateSwitchFailed'),
  });

  const toggleDisabled = isEditMode || binaryControl?.disabled === true;
  const handleToggle = useCallback(() => {
    if (toggleDisabled) return;
    if (binaryControl) binaryControl.onToggle();
    else defaultToggle();
  }, [binaryControl, defaultToggle, toggleDisabled]);

  const cardInteraction = useEntityCardInteractionController({
    ariaLabel: name,
    ariaPressed: isOn,
    isEditMode,
    onToggle: handleToggle,
    onOpenControls: () => {
      if (hasControlsDialog) setIsDialogOpen(true);
    },
    onOpenSettings: () => {
      if (hasControlsDialog) setIsDialogOpen(true);
    },
  });

  const showSettingsButton = isEditMode && hasControlsDialog;

  useEditModeSettingsRequest(
    id,
    () => {
      if (hasControlsDialog) {
        setIsDialogOpen(true);
      }
    },
    isEditMode
  );

  const { formatMetricValue, getMetricLabel, renderMetricIcon } = useSwitchMetricFormatters({
    deviceName: name,
    metricLabels: metricState.availableMetrics.map((metric) => metric.label),
    labels: {
      power: t('lighting.metrics.power'),
      voltage: t('lighting.metrics.voltage'),
      current: t('lighting.metrics.current'),
      energy: t('lighting.metrics.energy'),
    },
  });

  return {
    availableMetrics: metricState.availableMetrics,
    accentColor,
    cardColors,
    cardInteraction,
    displayName,
    entityType: resolvedEntityType,
    formatMetricValue,
    getMetricLabel,
    handleMetricToggle: metricState.handleMetricToggle,
    HeaderIconComponent: appearance.HeaderIconComponent,
    hasControlsDialog,
    hasMetrics: metricState.hasMetrics,
    headerIconText: appearance.headerIconText,
    isDialogOpen,
    isOn,
    isScript,
    isTiny,
    metricLimit: metricState.metricLimit,
    metricSectionDescription:
      metricState.metricLimit === 1
        ? t('lighting.switch.metricLimit.one', { count: metricState.metricLimit })
        : t('lighting.switch.metricLimit.other', { count: metricState.metricLimit }),
    metricSectionTitle: t('lighting.switch.cardMetric'),
    renderMetricIcon,
    selectedMetricLabels: metricState.selectedMetricLabels,
    selectedMetrics: metricState.selectedMetrics,
    selectedIcon: appearance.selectedIcon,
    siblingEntities,
    setIsDialogOpen,
    setSelectedIcon: appearance.setSelectedIcon,
    setTintColor: appearance.setTintColor,
    showSettingsButton,
    isExtraSmall,
    theme,
    toggleDisabled,
    tintColor: appearance.tintColor,
  };
}
