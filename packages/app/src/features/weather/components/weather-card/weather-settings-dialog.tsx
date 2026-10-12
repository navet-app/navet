import {
  CardDialogSection,
  SelectableCheckboxList,
  SelectableCheckboxRow,
  SelectableRadioList,
  SelectableRadioRow,
} from '@navet/app/components/patterns';
import { BaseCardDialogWithState } from '@navet/app/components/primitives';
import { normalizeCustomCardTint } from '@navet/app/components/shared/theme/custom-card-tint-surface';
import { useI18n } from '@navet/app/hooks';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import type { WeatherForecastMode, WeatherMetricId } from '@navet/app/stores/settings-store';
import { getEntityTypeLabel } from '@navet/app/utils/entity-type-label';
import { useId } from 'react';

interface WeatherSettingsDialogProps {
  onCloseAutoFocus?: (event: Event) => void;
  entityId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  theme: ThemeType;
  accentColorValue: string;
  title: string;
  forecastMode: WeatherForecastMode;
  onForecastModeChange: (mode: WeatherForecastMode) => void;
  metricIds: WeatherMetricId[];
  onMetricIdsChange: (metricIds: WeatherMetricId[]) => void;
  availableMetricIds: WeatherMetricId[];
  tintColor?: string;
  onTintColorChange?: (color: string) => void;
}

const WEATHER_METRIC_OPTIONS: WeatherMetricId[] = [
  'precipitation',
  'humidity',
  'wind',
  'feelsLike',
  'windGust',
  'pressure',
  'uvIndex',
  'cloudCover',
];
const MAX_WEATHER_METRICS = 5;

function getWeatherMetricLabelKey(metricId: WeatherMetricId) {
  return `weather.metric.${metricId}` as const;
}

export function WeatherSettingsDialog({
  onCloseAutoFocus,
  entityId,
  isOpen,
  onOpenChange,
  theme,
  accentColorValue,
  title,
  forecastMode,
  onForecastModeChange,
  metricIds,
  onMetricIdsChange,
  availableMetricIds,
  tintColor,
  onTintColorChange,
}: WeatherSettingsDialogProps) {
  const { t } = useI18n();
  const forecastGroupName = useId();
  const entityType = getEntityTypeLabel(entityId);
  const resolvedTintColor = normalizeCustomCardTint(tintColor);
  const activeAccentColor = resolvedTintColor ?? accentColorValue;
  const availableMetricIdSet = new Set(availableMetricIds);
  const metricOptions = WEATHER_METRIC_OPTIONS.filter((metricId) =>
    availableMetricIdSet.has(metricId)
  );
  const selectedAvailableMetricIds = metricIds.filter((metricId) =>
    availableMetricIdSet.has(metricId)
  );
  const handleMetricChange = (metricId: WeatherMetricId, checked: boolean) => {
    if (checked) {
      if (
        selectedAvailableMetricIds.includes(metricId) ||
        selectedAvailableMetricIds.length >= MAX_WEATHER_METRICS
      ) {
        return;
      }

      onMetricIdsChange([...selectedAvailableMetricIds, metricId]);
      return;
    }

    if (selectedAvailableMetricIds.length <= 1) {
      return;
    }

    onMetricIdsChange(selectedAvailableMetricIds.filter((id) => id !== metricId));
  };

  return (
    <BaseCardDialogWithState
      onCloseAutoFocus={onCloseAutoFocus}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={title}
      entityId={entityId}
      entityType={entityType}
      theme={theme}
      tintColor={tintColor}
      onTintColorChange={onTintColorChange}
      defaultTintAccent={accentColorValue}
      controlsTabContent={
        <>
          <CardDialogSection label={t('weather.settings.forecast')} className="mb-4">
            <SelectableRadioList aria-label={t('weather.settings.forecast')}>
              {(['hourly', 'weekly'] as const).map((option) => (
                <li key={option}>
                  <SelectableRadioRow
                    size="compact"
                    name={forecastGroupName}
                    value={option}
                    checked={forecastMode === option}
                    radioColor={activeAccentColor}
                    onValueChange={() => onForecastModeChange(option)}
                    label={
                      option === 'hourly'
                        ? t('weather.settings.hourly')
                        : t('weather.settings.weekly')
                    }
                  />
                </li>
              ))}
            </SelectableRadioList>
          </CardDialogSection>

          <CardDialogSection
            label={t('weather.settings.metrics')}
            helperText={
              selectedAvailableMetricIds.length >= MAX_WEATHER_METRICS
                ? t('weather.settings.metricsLimit')
                : undefined
            }
          >
            <SelectableCheckboxList aria-label={t('weather.settings.metrics')}>
              {metricOptions.map((metricId) => {
                const checked = selectedAvailableMetricIds.includes(metricId);
                const disabled = checked
                  ? selectedAvailableMetricIds.length <= 1
                  : selectedAvailableMetricIds.length >= MAX_WEATHER_METRICS;
                return (
                  <li key={metricId}>
                    <SelectableCheckboxRow
                      size="compact"
                      checked={checked}
                      checkboxPaletteColor={activeAccentColor}
                      disabled={disabled}
                      onCheckedChange={(nextChecked) => handleMetricChange(metricId, nextChecked)}
                      label={t(getWeatherMetricLabelKey(metricId))}
                    />
                  </li>
                );
              })}
            </SelectableCheckboxList>
          </CardDialogSection>
        </>
      }
    />
  );
}
