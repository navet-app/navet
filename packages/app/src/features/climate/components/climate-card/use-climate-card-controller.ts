import { dispatchEntityCommand } from '@navet/app/commands';
import { isCompactCardSize } from '@navet/app/components/shared/card-size-selector';
import { useEditModeSettingsRequest } from '@navet/app/components/shared/edit-mode-settings-request';
import { useEntityCardInteractionController } from '@navet/app/components/shared/entity-card-interaction-controller';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { readNavetClimateState } from '@navet/app/core/navet-device-state';
import {
  useHaCommandQueue,
  useI18n,
  useProviderClimateTopology,
  useProviderEntitySnapshot,
  useProviderEntitySnapshotRecord,
  useProviderTemperatureUnit,
  useServiceActionHandler,
  useTheme,
} from '@navet/app/hooks';
import {
  parseNumberish,
  resolveClimateTargetTemperature,
  resolveClimateTemperatureUnit,
} from '@navet/app/hooks/entity-utils';
import { useIntegrationStore } from '@navet/app/hooks/use-integration-store';
import { useProviderEntityModel } from '@navet/app/hooks/use-provider-device';
import type { PlatformEntitySnapshot } from '@navet/app/platform/provider-feature-models';
import { integrationClimateFeatureService } from '@navet/app/services/integration-climate-feature.service';
import { settingsSelectors } from '@navet/app/stores/selectors';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { parseProviderScopedId } from '@navet/app/utils/provider-ids';
import {
  convertDisplayTemperatureToSourceUnit,
  convertTemperatureUnitValue,
  formatTemperature,
  formatTemperatureFromSourceUnit,
  formatTemperatureValue,
  formatTemperatureValueFromSourceUnit,
  type TemperatureUnit,
} from '@navet/app/utils/temperature';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ClimateCardProps } from './climate-card.types';
import { resolveClimateEntityState } from './climate-entity-state';
import { createClimateReconciliation } from './climate-reconciliation';
import { useClimateVisualMode } from './use-climate-visual-mode';

export interface ClimateSiblingEntity {
  id: string;
  entity: PlatformEntitySnapshot;
}

export type ClimateCardController = ReturnType<typeof useClimateCardController>;

// Stable empty references so the selector and useMemo don't create new objects
// when there are no siblings, which would break shallow equality.
const DEFAULT_MIN_TEMP = 16;
const DEFAULT_MAX_TEMP = 30;
const DEFAULT_TEMP_STEP = 0.5;
const DEFAULT_MIN_TEMP_FAHRENHEIT = 60;
const DEFAULT_MAX_TEMP_FAHRENHEIT = 86;
const DEFAULT_TEMP_STEP_FAHRENHEIT = 1;

function normalizeDisplayControlValue(value: number, temperatureUnit: TemperatureUnit) {
  return temperatureUnit === 'fahrenheit' ? Math.round(value) : value;
}

function normalizeDisplayControlStep(step: number, temperatureUnit: TemperatureUnit) {
  if (temperatureUnit !== 'fahrenheit') {
    return step;
  }

  return Math.max(1, Math.round(step));
}

function resolveDefaultTemperatureRange(sourceTemperatureUnit: TemperatureUnit | undefined) {
  if (sourceTemperatureUnit !== 'fahrenheit') {
    return {
      minTemp: DEFAULT_MIN_TEMP,
      maxTemp: DEFAULT_MAX_TEMP,
      step: DEFAULT_TEMP_STEP,
    };
  }

  return {
    minTemp: DEFAULT_MIN_TEMP_FAHRENHEIT,
    maxTemp: DEFAULT_MAX_TEMP_FAHRENHEIT,
    step: DEFAULT_TEMP_STEP_FAHRENHEIT,
  };
}

function resolveClimateTemperatureRange(
  liveEntity: PlatformEntitySnapshot | undefined,
  sourceTemperatureUnit: TemperatureUnit | undefined
) {
  const attrs = liveEntity?.attributes;
  const fallbackRange = resolveDefaultTemperatureRange(sourceTemperatureUnit);
  const minTemp = parseNumberish(attrs?.min_temp) ?? fallbackRange.minTemp;
  const maxTemp = parseNumberish(attrs?.max_temp) ?? fallbackRange.maxTemp;
  const step = parseNumberish(attrs?.target_temp_step) ?? fallbackRange.step;

  return {
    minTemp,
    maxTemp,
    step: step > 0 ? step : fallbackRange.step,
  };
}

function snapClimateTemperature(value: number, minTemp: number, maxTemp: number, step: number) {
  const snappedValue = Math.round((value - minTemp) / step) * step + minTemp;
  return Number(Math.min(maxTemp, Math.max(minTemp, snappedValue)).toFixed(3));
}

function resolveClimateTemperatureServiceData(
  entityId: string,
  liveEntity: PlatformEntitySnapshot | undefined,
  nextTemp: number,
  operatingState?: {
    mode?: string;
    action?: string;
  }
): {
  serviceDomain: 'climate' | 'water_heater';
  temperature?: number;
  targetTemperatureLow?: number;
  targetTemperatureHigh?: number;
} {
  const nativeEntityId = parseProviderScopedId(entityId)?.nativeId ?? entityId;
  if (!liveEntity || nativeEntityId.startsWith('water_heater.')) {
    return {
      serviceDomain: nativeEntityId.startsWith('water_heater.') ? 'water_heater' : 'climate',
      temperature: nextTemp,
    };
  }

  const attrs = liveEntity.attributes;
  const targetLow = parseNumberish(attrs?.target_temp_low);
  const targetHigh = parseNumberish(attrs?.target_temp_high);
  const hasOperatingModeOverride = typeof operatingState?.mode === 'string';

  if (targetLow === null && targetHigh === null) {
    return { serviceDomain: 'climate', temperature: nextTemp };
  }

  const action =
    typeof operatingState?.action === 'string'
      ? operatingState.action.toLowerCase()
      : hasOperatingModeOverride
        ? ''
        : typeof attrs?.hvac_action === 'string'
          ? attrs.hvac_action.toLowerCase()
          : '';
  const mode =
    typeof operatingState?.mode === 'string'
      ? operatingState.mode.toLowerCase()
      : typeof liveEntity.state === 'string'
        ? liveEntity.state.toLowerCase()
        : '';

  if ((action.includes('cool') || mode === 'cool') && targetHigh !== null) {
    return { serviceDomain: 'climate', targetTemperatureHigh: nextTemp };
  }

  if ((action.includes('heat') || mode === 'heat') && targetLow !== null) {
    return { serviceDomain: 'climate', targetTemperatureLow: nextTemp };
  }

  const currentTarget = resolveClimateTargetTemperature(liveEntity);
  if (currentTarget !== null && targetLow !== null && targetHigh !== null) {
    const delta = nextTemp - currentTarget;
    return {
      serviceDomain: 'climate',
      targetTemperatureLow: Number((targetLow + delta).toFixed(3)),
      targetTemperatureHigh: Number((targetHigh + delta).toFixed(3)),
    };
  }

  return targetHigh !== null
    ? { serviceDomain: 'climate', targetTemperatureHigh: nextTemp }
    : { serviceDomain: 'climate', targetTemperatureLow: nextTemp };
}

export function useClimateCardController({
  id,
  name,
  providerId,
  initialTemp = 21,
  initialCurrentTemp = 22,
  sourceTemperatureUnit,
  initialMode = 'cool',
  initialAction,
  supportedClimateModes: initialSupportedClimateModes,
  initialState = true,
  isEditMode,
  size,
}: Pick<
  ClimateCardProps,
  | 'id'
  | 'name'
  | 'providerId'
  | 'initialTemp'
  | 'initialCurrentTemp'
  | 'temperatureUnit'
  | 'initialMode'
  | 'initialAction'
  | 'supportedClimateModes'
  | 'initialState'
  | 'isEditMode'
  | 'size'
> & { sourceTemperatureUnit?: TemperatureUnit }) {
  const { t } = useI18n();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const lastActiveModeRef = useRef(
    initialMode !== 'off'
      ? initialMode
      : initialSupportedClimateModes?.find((entry) => entry !== 'off')
  );
  const { colors, theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const providerEntity = useProviderEntityModel(id);
  const currentProviderId = useIntegrationStore((state) => state.currentProviderId);
  const providerState = readNavetClimateState(providerEntity);
  const resolvedProviderId =
    providerEntity?.providerId ??
    providerId ??
    parseProviderScopedId(id)?.providerId ??
    currentProviderId;
  const isHomeAssistantProvider = resolvedProviderId === 'home_assistant';
  const liveEntity = useProviderEntitySnapshot(id);
  const homeAssistantTemperatureUnit = useProviderTemperatureUnit(resolvedProviderId);
  const temperatureUnit = useSettingsStore(settingsSelectors.temperatureUnit);
  const effectiveSourceTemperatureUnit = useMemo(
    () =>
      sourceTemperatureUnit ??
      (providerState?.temperatureUnit === 'celsius' ||
      providerState?.temperatureUnit === 'fahrenheit'
        ? providerState.temperatureUnit
        : undefined) ??
      resolveClimateTemperatureUnit(liveEntity, homeAssistantTemperatureUnit),
    [
      homeAssistantTemperatureUnit,
      liveEntity,
      providerState?.temperatureUnit,
      sourceTemperatureUnit,
    ]
  );
  const temperatureRange = useMemo(
    () => resolveClimateTemperatureRange(liveEntity, effectiveSourceTemperatureUnit),
    [effectiveSourceTemperatureUnit, liveEntity]
  );
  const { siblingIds: siblingEntityIds } = useProviderClimateTopology(id);
  const initial = useMemo(
    () => ({
      targetTemp: initialTemp,
      currentTemp: initialCurrentTemp,
      mode: initialMode,
      action: initialAction,
      supportedClimateModes: initialSupportedClimateModes,
      isOn: initialState,
    }),
    [
      initialTemp,
      initialCurrentTemp,
      initialMode,
      initialAction,
      initialSupportedClimateModes,
      initialState,
    ]
  );
  // Each owner gets independent pending work and rollback callbacks.
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const owner = `${resolvedProviderId}:${id}`;
  const { reconciliation } = useMemo(
    () => ({ owner, reconciliation: createClimateReconciliation(initialRef.current) }),
    [owner]
  );
  const { targetTemp, currentTemp, mode, action, supportedClimateModes, isOn } =
    useSyncExternalStore(
      reconciliation.subscribe,
      reconciliation.getSnapshot,
      reconciliation.getSnapshot
    );
  useEffect(() => () => reconciliation.dispose(), [reconciliation]);
  useEffect(() => {
    reconciliation.observe(resolveClimateEntityState({ liveEntity, providerState, initial }));
  }, [reconciliation, liveEntity, providerState, initial]);
  useEffect(() => {
    lastActiveModeRef.current =
      initialMode !== 'off'
        ? initialMode
        : initialSupportedClimateModes?.find((entry) => entry !== 'off');
  }, [id, resolvedProviderId]);

  const runTemperatureAction = useServiceActionHandler();
  const runModeAction = useServiceActionHandler();
  const { queue: queueTargetTempSync, cancel: cancelTargetTempSync } = useHaCommandQueue(
    (request: { send: () => Promise<void>; rollback: () => void }) =>
      runTemperatureAction(request.send, t('climate.feedback.updateTemperatureFailed'), {
        onError: request.rollback,
      })
  );
  useEffect(() => cancelTargetTempSync, [reconciliation, cancelTargetTempSync]);

  const updateTargetTemp = useCallback(
    (nextTemp: number, immediate = false) => {
      const temperature = snapClimateTemperature(
        nextTemp,
        temperatureRange.minTemp,
        temperatureRange.maxTemp,
        temperatureRange.step
      );
      const rollback = reconciliation.requestTemperature(temperature);
      queueTargetTempSync(
        {
          rollback,
          send: async () => {
            const pendingState = reconciliation.getSnapshot();
            const temperatureUpdate = resolveClimateTemperatureServiceData(
              id,
              liveEntity,
              temperature,
              {
                mode: pendingState.mode,
                action: pendingState.action,
              }
            );
            await integrationClimateFeatureService.setTargetTemperature(id, temperatureUpdate);
          },
        },
        immediate
      );
    },
    [id, liveEntity, reconciliation, queueTargetTempSync, temperatureRange]
  );

  const updateMode = useCallback(
    (nextMode: string) => {
      if (nextMode !== 'off') lastActiveModeRef.current = nextMode;
      const rollback = reconciliation.requestOperatingState({
        mode: nextMode,
        isOn: nextMode !== 'off',
        action: nextMode === 'off' ? 'idle' : undefined,
        supportedClimateModes: reconciliation.getSnapshot().supportedClimateModes,
      });
      void runModeAction(
        async () => {
          await dispatchEntityCommand(
            { type: 'set_climate_mode', entityId: id, mode: nextMode },
            resolvedProviderId
          );
        },
        t('climate.feedback.updateModeFailed'),
        { onError: rollback }
      );
    },
    [id, resolvedProviderId, reconciliation, runModeAction, t]
  );

  const togglePower = useCallback(() => {
    if (isOn) {
      updateMode('off');
      return;
    }

    const restoreMode =
      lastActiveModeRef.current ??
      supportedClimateModes?.find((entry) => entry !== 'off') ??
      (initialMode !== 'off' ? initialMode : 'cool');
    updateMode(restoreMode);
  }, [initialMode, isOn, supportedClimateModes, updateMode]);

  const isSmall = isCompactCardSize(size);
  const isMedium = size === 'medium';

  // Subscribe to only the sibling entity states rather than the full entities dict.
  // `shallow` does a key-wise === comparison: home-assistant-js-websocket preserves
  // entity object references for unchanged entities, so this will not re-render when
  // unrelated entities update elsewhere in HA.
  const siblingEntityRecord = useProviderEntitySnapshotRecord(siblingEntityIds, {
    providerId: resolvedProviderId,
    enabled: isHomeAssistantProvider,
  });

  const siblingEntities = useMemo<ClimateSiblingEntity[]>(
    () =>
      siblingEntityIds
        .map((eid) => {
          const entity = siblingEntityRecord[eid];
          return entity ? { id: eid, entity } : null;
        })
        .filter((entry): entry is ClimateSiblingEntity => entry !== null),
    [siblingEntityIds, siblingEntityRecord]
  );

  const visualMode = useClimateVisualMode({
    action,
    currentTemp,
    isOn,
    mode,
    preferExplicitAction: true,
    supportedClimateModes,
    targetTemp,
  });

  const cardColors = !isOn
    ? colors.climate.off
    : visualMode === 'cool'
      ? colors.climate.cooling
      : visualMode === 'heat'
        ? colors.climate.heating
        : colors.climate.off;

  const textColor =
    theme === 'light'
      ? isOn
        ? 'text-gray-900'
        : 'text-gray-300'
      : isOn
        ? 'text-white'
        : 'text-gray-300';
  const secondaryTextColor = surface.textSecondary;

  const canTogglePower =
    supportedClimateModes === undefined || supportedClimateModes.includes('off');
  const interaction = useEntityCardInteractionController({
    ariaLabel: `${name} ${t('climate.subtitle').toLowerCase()}`,
    ariaPressed: canTogglePower ? isOn : undefined,
    isEditMode,
    onToggle: canTogglePower ? togglePower : undefined,
    onOpenControls: () => setIsSettingsOpen(true),
    onOpenSettings: () => setIsSettingsOpen(true),
  });
  const cardInteraction = canTogglePower
    ? interaction
    : {
        ...interaction,
        iconButtonProps: interaction.settingsButtonProps,
      };
  useEditModeSettingsRequest(id, () => setIsSettingsOpen(true), isEditMode);

  const lightOverlay =
    theme === 'light'
      ? isOn
        ? visualMode === 'cool'
          ? 'bg-cyan-50/45'
          : visualMode === 'heat'
            ? 'bg-orange-50/45'
            : 'bg-white/60'
        : 'bg-white/60'
      : undefined;
  const displayMinTemp = convertTemperatureUnitValue(
    temperatureRange.minTemp,
    effectiveSourceTemperatureUnit,
    temperatureUnit
  );
  const displayMaxTemp = convertTemperatureUnitValue(
    temperatureRange.maxTemp,
    effectiveSourceTemperatureUnit,
    temperatureUnit
  );
  const displayStep = Math.abs(
    convertTemperatureUnitValue(
      temperatureRange.step,
      effectiveSourceTemperatureUnit,
      temperatureUnit
    ) - convertTemperatureUnitValue(0, effectiveSourceTemperatureUnit, temperatureUnit)
  );
  const displayTargetTemp = convertTemperatureUnitValue(
    targetTemp,
    effectiveSourceTemperatureUnit,
    temperatureUnit
  );
  const displayCurrentTemp = convertTemperatureUnitValue(
    currentTemp,
    effectiveSourceTemperatureUnit,
    temperatureUnit
  );
  const controlDisplayMinTemp = normalizeDisplayControlValue(displayMinTemp, temperatureUnit);
  const controlDisplayMaxTemp = normalizeDisplayControlValue(displayMaxTemp, temperatureUnit);
  const controlDisplayStep = normalizeDisplayControlStep(displayStep, temperatureUnit);
  const controlDisplayTargetTemp = normalizeDisplayControlValue(displayTargetTemp, temperatureUnit);

  const updateDisplayTargetTemp = (nextTemp: number, immediate = false) => {
    updateTargetTemp(
      convertDisplayTemperatureToSourceUnit(
        nextTemp,
        temperatureUnit,
        effectiveSourceTemperatureUnit
      ),
      immediate
    );
  };

  return {
    action,
    cardColors,
    cardInteraction,
    currentTemp,
    controlDisplayMaxTemp,
    controlDisplayMinTemp,
    controlDisplayStep,
    controlDisplayTargetTemp,
    displayCurrentTemp,
    displayMaxTemp,
    displayMinTemp,
    displayStep,
    displayTargetTemp,
    formatTemperature: (value: number) =>
      effectiveSourceTemperatureUnit
        ? formatTemperatureFromSourceUnit(value, effectiveSourceTemperatureUnit, temperatureUnit)
        : formatTemperature(value, temperatureUnit),
    formatTemperatureValue: (value: number) =>
      effectiveSourceTemperatureUnit
        ? formatTemperatureValueFromSourceUnit(
            value,
            effectiveSourceTemperatureUnit,
            temperatureUnit
          )
        : formatTemperatureValue(value, temperatureUnit),
    hasTargetTemperature: liveEntity
      ? resolveClimateTargetTemperature(liveEntity) !== null
      : providerState
        ? typeof providerState.temperature === 'number' &&
          Number.isFinite(providerState.temperature)
        : true,
    isMedium,
    isOn,
    isSettingsOpen,
    isSmall,
    lightOverlay,
    maxTemp: temperatureRange.maxTemp,
    minTemp: temperatureRange.minTemp,
    mode,
    visualMode,
    secondaryTextColor,
    siblingEntities,
    supportedClimateModes,
    setIsSettingsOpen,
    setMode: updateMode,
    setTargetTemp: (nextTemp: number) => updateTargetTemp(nextTemp),
    setDisplayTargetTemp: (nextTemp: number) => updateDisplayTargetTemp(nextTemp),
    commitTargetTemp: (nextTemp: number) => updateTargetTemp(nextTemp, true),
    commitDisplayTargetTemp: (nextTemp: number) => updateDisplayTargetTemp(nextTemp, true),
    step: temperatureRange.step,
    targetTemp,
    temperatureUnit,
    sourceTemperatureUnit: effectiveSourceTemperatureUnit,
    textColor,
    theme,
  };
}
