import { dispatchEntityCommand } from '@navet/app/commands';
import { BaseCardDialog, type BaseCardDialogTab } from '@navet/app/components/primitives';
import {
  DeviceControlRow,
  DeviceTargetControl,
  DialogSectionRow,
} from '@navet/app/components/shared/device-editor';
import { DeviceControlOptions } from '@navet/app/components/shared/device-editor/device-control-options';
import { getCardReadableTextTokens } from '@navet/app/components/shared/theme/card-readable-text-tokens';
import { resolveClimateModeControlOptions } from '@navet/app/features/climate/utils/climate-mode-control-options';
import { getClimateGaugeColor } from '@navet/app/features/climate/utils/climate-styles';
import { convertCelsiusPresetToSourceUnit } from '@navet/app/features/climate/utils/climate-temperature-presets';
import { getClimateTemperatureStatusLabel } from '@navet/app/features/climate/utils/climate-temperature-status-label';
import { useI18n, useTheme } from '@navet/app/hooks';
import { invokeIntegrationNativeAction } from '@navet/app/services/integration-native-action.service';
import { settingsSelectors } from '@navet/app/stores/selectors';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import {
  compactRepeatedDeviceLabel,
  compactRepeatedLabelGroup,
} from '@navet/app/utils/compact-device-label';
import { getEntityTypeLabel } from '@navet/app/utils/entity-type-label';
import {
  convertDisplayTemperatureToSourceUnit,
  convertTemperatureUnitValue,
  formatTemperatureFromSourceUnit,
  formatTemperatureValueFromSourceUnit,
} from '@navet/app/utils/temperature';
import { Fan, Sliders, Thermometer } from 'lucide-react';
import { memo, useCallback } from 'react';
import { climateModeIcons } from '../climate-card/climate-mode-controls';
import { ClimateTempControls } from '../climate-card/climate-temp-controls';
import { useClimateVisualMode } from '../climate-card/use-climate-visual-mode';
import { ClimateAdvancedControls } from './climate-advanced-controls';
import { getClimateSettingsDialogStyles } from './styles';
import type { ClimateSettingsDialogProps } from './types';

function normalizeDisplayControlValue(value: number, temperatureUnit: 'celsius' | 'fahrenheit') {
  return temperatureUnit === 'fahrenheit' ? Math.round(value) : value;
}

function normalizeDisplayControlStep(
  step: number,
  temperatureUnit: 'celsius' | 'fahrenheit',
  sourceTemperatureUnit: 'celsius' | 'fahrenheit'
) {
  if (temperatureUnit !== 'fahrenheit' || sourceTemperatureUnit !== 'fahrenheit') {
    return step;
  }

  return Math.max(1, Math.round(step));
}

function snapTemperatureToSourceStep(value: number, step: number, min: number) {
  if (!Number.isFinite(step) || step <= 0) {
    return value;
  }

  const snapped = min + Math.round((value - min) / step) * step;
  return Number(snapped.toFixed(3));
}

export const ClimateSettingsDialog = memo(function ClimateSettingsDialog({
  entityId,
  isOpen,
  onOpenChange,
  name,
  isOn,
  mode,
  action,
  targetTemp,
  currentTemp,
  sourceTemperatureUnit,
  minTemp = 16,
  maxTemp = 30,
  step = 0.5,
  temperaturePresets = [{ value: 18 }, { value: 21 }, { value: 24 }],
  siblingEntities = [],
  supportedClimateModes,
  onModeChange,
  onTargetTempChange,
  onTargetTempCommit,
}: ClimateSettingsDialogProps) {
  const { t } = useI18n();
  const { theme, accentColor } = useTheme();
  const temperatureUnit = useSettingsStore(settingsSelectors.temperatureUnit);
  const entityType = getEntityTypeLabel(entityId);
  const visualMode = useClimateVisualMode({
    action,
    currentTemp,
    isOn,
    mode,
    targetTemp,
  });
  const textTone =
    !isOn || visualMode === 'idle'
      ? 'neutral'
      : visualMode === 'heat'
        ? 'orange'
        : visualMode === 'cool'
          ? 'cyan'
          : 'blue';
  const dialogTextTokens = getCardReadableTextTokens({
    theme,
    tone: textTone,
    accentColor,
  });
  const styles = getClimateSettingsDialogStyles(visualMode, isOn);
  const dialogGlowColors = getClimateGaugeColor(visualMode);
  const contentInsetClassName = 'px-6 max-sm:px-3.5';
  const effectiveSourceTemperatureUnit = sourceTemperatureUnit ?? 'celsius';
  const displayTargetTemp = convertTemperatureUnitValue(
    targetTemp,
    effectiveSourceTemperatureUnit,
    temperatureUnit
  );
  const displayMinTemp = convertTemperatureUnitValue(
    minTemp,
    effectiveSourceTemperatureUnit,
    temperatureUnit
  );
  const displayMaxTemp = convertTemperatureUnitValue(
    maxTemp,
    effectiveSourceTemperatureUnit,
    temperatureUnit
  );
  const displayStep = Math.abs(
    convertTemperatureUnitValue(step, effectiveSourceTemperatureUnit, temperatureUnit) -
      convertTemperatureUnitValue(0, effectiveSourceTemperatureUnit, temperatureUnit)
  );
  const controlDisplayTargetTemp = normalizeDisplayControlValue(displayTargetTemp, temperatureUnit);
  const controlDisplayMinTemp = normalizeDisplayControlValue(displayMinTemp, temperatureUnit);
  const controlDisplayMaxTemp = normalizeDisplayControlValue(displayMaxTemp, temperatureUnit);
  const controlDisplayStep = normalizeDisplayControlStep(
    displayStep,
    temperatureUnit,
    effectiveSourceTemperatureUnit
  );
  const toSnappedSourceTemperature = (nextTemp: number) =>
    snapTemperatureToSourceStep(
      convertDisplayTemperatureToSourceUnit(
        nextTemp,
        temperatureUnit,
        effectiveSourceTemperatureUnit
      ),
      step,
      minTemp
    );
  const handleDisplayTargetTempChange = (nextTemp: number) => {
    onTargetTempChange(toSnappedSourceTemperature(nextTemp));
  };
  const handleDisplayTargetTempCommit = (nextTemp: number) => {
    (onTargetTempCommit ?? onTargetTempChange)(toSnappedSourceTemperature(nextTemp));
  };
  const siblingLabels = siblingEntities
    .map((entry) => entry.entity.attributes?.friendly_name)
    .filter((label): label is string => typeof label === 'string' && label.trim().length > 0);
  const contentGlowStyle = isOn
    ? {
        background: `radial-gradient(ellipse at 100% 43%, ${dialogGlowColors.secondary}70 0%, ${dialogGlowColors.primary}45 28%, ${dialogGlowColors.primary}22 48%, transparent 72%)`,
      }
    : undefined;
  const contentOverlayClassName = isOn ? 'pointer-events-none absolute inset-0 z-0' : null;
  const contentOverlayStyle = isOn
    ? {
        background: `linear-gradient(90deg, transparent 0%, transparent 44%, ${dialogGlowColors.primary}12 68%, ${dialogGlowColors.secondary}22 100%)`,
      }
    : undefined;

  const modeOptions = resolveClimateModeControlOptions(supportedClimateModes);
  const temperaturePresetOptions = temperaturePresets.map((preset) => {
    const sourceValue = convertCelsiusPresetToSourceUnit(preset.value, sourceTemperatureUnit);
    return {
      value: String(sourceValue),
      sourceValue,
      label: `${formatTemperatureValueFromSourceUnit(sourceValue, sourceTemperatureUnit, temperatureUnit)}°`,
    };
  });
  const climateTabContent = (
    <div className="space-y-4">
      <DeviceTargetControl
        label={t('climate.target')}
        value={formatTemperatureFromSourceUnit(targetTemp, sourceTemperatureUnit, temperatureUnit)}
        currentReading={t('climate.currentTemperature', {
          temp: formatTemperatureFromSourceUnit(
            currentTemp,
            sourceTemperatureUnit,
            temperatureUnit
          ),
        })}
        status={getClimateTemperatureStatusLabel(
          t,
          formatTemperatureFromSourceUnit(targetTemp, sourceTemperatureUnit, temperatureUnit),
          formatTemperatureFromSourceUnit(currentTemp, sourceTemperatureUnit, temperatureUnit),
          visualMode,
          targetTemp,
          currentTemp
        )}
        readableTokens={dialogTextTokens}
        controls={
          <ClimateTempControls
            targetTemp={controlDisplayTargetTemp}
            onTempChange={handleDisplayTargetTempChange}
            onTempCommit={handleDisplayTargetTempCommit}
            isOn={isOn}
            size="medium"
            controlSize="lg"
            minTemp={controlDisplayMinTemp}
            maxTemp={controlDisplayMaxTemp}
            step={controlDisplayStep}
          />
        }
      />

      {modeOptions.length > 1 ? (
        <DeviceControlOptions
          label={t('climate.mode')}
          variant="segmented"
          theme={theme === 'light' ? 'dark' : theme}
          selectionColor={dialogTextTokens.titleColor}
          value={isOn ? mode : null}
          options={modeOptions.map((option) => {
            const Icon = climateModeIcons[option.key];
            return {
              value: option.mode,
              label:
                option.key === 'auto'
                  ? t('settings.appearance.systemTheme.auto')
                  : t(`climate.mode.${option.key}`),
              icon: <Icon className="h-4 w-4" />,
            };
          })}
          onValueChange={onModeChange}
        />
      ) : null}

      <div>
        {temperaturePresets.length > 0 ? (
          <DeviceControlRow
            kind="disclosure"
            theme="dark"
            label={t('climate.advanced.temperaturePresets')}
            value={formatTemperatureFromSourceUnit(
              targetTemp,
              sourceTemperatureUnit,
              temperatureUnit
            )}
            icon={<Thermometer className="h-4 w-4" />}
          >
            <DeviceControlOptions
              label={t('climate.advanced.temperaturePresets')}
              value={
                temperaturePresetOptions.find(
                  (option) => Math.abs(targetTemp - option.sourceValue) < 0.05
                )?.value ?? null
              }
              disabled={!isOn}
              selectionColor={dialogTextTokens.titleColor}
              theme={theme === 'light' ? 'dark' : theme}
              options={temperaturePresetOptions}
              onValueChange={(value) => {
                const preset = temperaturePresetOptions.find((option) => option.value === value);
                if (preset) (onTargetTempCommit ?? onTargetTempChange)(preset.sourceValue);
              }}
            />
          </DeviceControlRow>
        ) : null}
        <ClimateAdvancedControls entityId={entityId} selectionColor={dialogTextTokens.titleColor} />
      </div>
    </div>
  );

  const controlsTabContent = (
    <div className={`py-6 max-sm:py-3 ${contentInsetClassName}`}>
      {siblingEntities.length > 0 ? (
        <DialogSectionRow label={t('common.controls')}>
          <div className="space-y-2">
            {siblingEntities.map(({ id, entity }) => (
              <ClimateSiblingControlRow
                key={id}
                entityId={id}
                label={getSiblingDisplayName(
                  name,
                  siblingLabels,
                  id,
                  entity.attributes?.friendly_name
                )}
                typeLabel={getEntityTypeLabel(id)}
                state={entity.state}
                attributes={entity.attributes}
              />
            ))}
          </div>
        </DialogSectionRow>
      ) : (
        <DialogSectionRow label={t('common.controls')}>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/78">
            {t('climate.settings.noExtraControls')}
          </div>
        </DialogSectionRow>
      )}
    </div>
  );

  const tabs: BaseCardDialogTab[] = [
    {
      key: 'climate',
      label: t('climate.subtitle'),
      icon: Thermometer,
      content: climateTabContent,
    },
    {
      key: 'controls',
      label: t('common.controls'),
      icon: Sliders,
      content: controlsTabContent,
    },
  ];

  return (
    <BaseCardDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={name}
      entityId={entityId}
      description={entityType}
      tabs={tabs}
      theme={theme}
      disableOpenAutoFocus
      maxWidth="md"
      height="capped"
      mobileFitContent
      defaultTintAccent={dialogGlowColors.primary}
      contentSurface={styles.contentSurface}
      contentClassName={styles.contentClassName}
      contentGlowClassName={isOn ? 'pointer-events-none absolute inset-0 z-0' : undefined}
      contentGlowStyle={contentGlowStyle}
      contentOverlayClassName={contentOverlayClassName}
      contentOverlayStyle={contentOverlayStyle}
      scrollClassName="max-sm:min-h-0 max-sm:flex-1"
      bodyClassName={`relative pt-6 pb-6 max-sm:pt-2 max-sm:pb-3 ${contentInsetClassName}`}
    />
  );
});

function getSiblingDisplayName(
  primaryLabel: string,
  siblingLabels: readonly string[],
  entityId: string,
  friendlyName: unknown
): string {
  if (typeof friendlyName === 'string' && friendlyName.trim().length > 0) {
    const compactByPrimaryLabel = compactRepeatedDeviceLabel(
      friendlyName,
      primaryLabel,
      siblingLabels
    );
    if (compactByPrimaryLabel !== friendlyName) {
      return compactByPrimaryLabel;
    }

    return compactRepeatedLabelGroup(friendlyName, siblingLabels);
  }

  return entityId
    .replace(/^[^.]+\./, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function ClimateSiblingControlRow({
  entityId,
  label,
  typeLabel,
  state,
  attributes,
}: {
  entityId: string;
  label: string;
  typeLabel: string;
  state: string;
  attributes: Record<string, unknown>;
}) {
  const { t } = useI18n();
  const domain = entityId.split('.')[0] ?? '';
  const isFan = domain === 'fan';
  const isToggle =
    isFan || domain === 'switch' || domain === 'input_boolean' || domain === 'script';
  const isOn = state === 'on';
  const fanPercentage = readFanPercentage(attributes.percentage);
  const fanPercentageStep = readFanPercentageStep(attributes.percentage_step);
  const fanPresetMode =
    typeof attributes.preset_mode === 'string' ? attributes.preset_mode : undefined;
  const fanPresetModes = readStringList(attributes.preset_modes);

  const handlePress = useCallback(async () => {
    if (domain === 'fan') {
      await dispatchEntityCommand({
        type: isOn ? 'turn_off' : 'turn_on',
        entityId,
      });
      return;
    }

    if (domain === 'button' || domain === 'input_button') {
      await invokeIntegrationNativeAction({
        entityId,
        domain,
        service: 'press',
      });
      return;
    }

    if (domain === 'script') {
      await dispatchEntityCommand({
        type: 'turn_on',
        entityId,
      });
      return;
    }

    await dispatchEntityCommand({
      type: isOn ? 'turn_off' : 'turn_on',
      entityId,
    });
  }, [domain, entityId, isOn]);

  const setFanPercentage = useCallback(
    async (percentage: number) => {
      await invokeIntegrationNativeAction({
        entityId,
        domain: 'fan',
        service: 'set_percentage',
        serviceData: { percentage: clampFanPercentage(percentage) },
      });
    },
    [entityId]
  );

  const setFanPresetMode = useCallback(
    async (presetMode: string) => {
      await invokeIntegrationNativeAction({
        entityId,
        domain: 'fan',
        service: 'set_preset_mode',
        serviceData: { preset_mode: presetMode },
      });
    },
    [entityId]
  );

  const nextLowerFanPercentage = clampFanPercentage((fanPercentage ?? 0) - fanPercentageStep);
  const nextHigherFanPercentage = clampFanPercentage((fanPercentage ?? 0) + fanPercentageStep);

  return (
    <div className="rounded-2xl border border-transparent bg-white/5 transition-colors hover:bg-white/10">
      <button
        type="button"
        onClick={handlePress}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-3">
          {isFan ? <Fan className="h-4 w-4 shrink-0 text-white/72" /> : null}
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-white">{label}</span>
            <span className="block text-xs text-white/72">
              {isFan && fanPercentage !== undefined
                ? `${typeLabel} · ${fanPercentage}%`
                : typeLabel}
            </span>
          </span>
        </span>
        {isToggle ? (
          <span
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${isOn ? 'bg-blue-500' : 'bg-white/20'}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${isOn ? 'translate-x-5' : 'translate-x-0.5'}`}
            />
          </span>
        ) : (
          <span className="rounded-full border border-white/12 bg-white/8 px-2.5 py-1 text-xs font-medium text-white/88">
            {t('climate.settings.run')}
          </span>
        )}
      </button>

      {isFan && (fanPercentage !== undefined || fanPresetModes.length > 0) ? (
        <div className="space-y-2 border-t border-white/10 px-4 pt-3 pb-3">
          {fanPercentage !== undefined ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-white/72">
                {t('climate.settings.speed')}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFanPercentage(nextLowerFanPercentage)}
                  disabled={!isOn || fanPercentage <= 0}
                  className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs font-semibold text-white/88 transition-colors hover:bg-white/14 disabled:opacity-40"
                >
                  {nextLowerFanPercentage}%
                </button>
                <span className="min-w-10 text-center text-xs font-semibold text-white">
                  {fanPercentage}%
                </span>
                <button
                  type="button"
                  onClick={() => setFanPercentage(nextHigherFanPercentage)}
                  disabled={!isOn || fanPercentage >= 100}
                  className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs font-semibold text-white/88 transition-colors hover:bg-white/14 disabled:opacity-40"
                >
                  {nextHigherFanPercentage}%
                </button>
              </div>
            </div>
          ) : null}

          {fanPresetModes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {fanPresetModes.map((presetMode) => (
                <button
                  type="button"
                  key={presetMode}
                  onClick={() => setFanPresetMode(presetMode)}
                  disabled={!isOn}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-40 ${
                    presetMode === fanPresetMode
                      ? 'border-blue-300/40 bg-blue-500/24 text-white'
                      : 'border-white/12 bg-white/8 text-white/80 hover:bg-white/14'
                  }`}
                >
                  {presetMode}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function readFanPercentage(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return clampFanPercentage(value);
}

function readFanPercentageStep(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 25;
  }

  return Math.min(100, Math.max(1, Math.round(value)));
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function clampFanPercentage(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}
