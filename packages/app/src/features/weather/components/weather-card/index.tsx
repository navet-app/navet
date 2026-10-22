import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import type { EntityCardDialogControl } from '@navet/app/components/shared/entity-card-dialog';
import { CardWrapper } from '@navet/app/components/ui/card-wrapper';
import { useAccentColor, useI18n } from '@navet/app/hooks';
import { settingsSelectors } from '@navet/app/stores/selectors';
import { useSettingsStore, type WeatherForecastMode } from '@navet/app/stores/settings-store';
import {
  formatTemperatureFromSourceUnit,
  formatTemperatureValueFromSourceUnit,
  type TemperatureUnit,
} from '@navet/app/utils/temperature';
import { Navigation } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useWeatherCardController } from './use-weather-card-controller';
import { WeatherBackground } from './weather-card-overlays';
import { WeatherDetails } from './weather-details';
import { WeatherForecastRow } from './weather-forecast-row';
import { formatWeatherConditionLabel, type WeatherCondition, WeatherIcon } from './weather-icon';
import { WeatherSettingsDialog } from './weather-settings-dialog';
import { WeatherSunTimes } from './weather-sun-times';

// Re-export types
export type { WeatherCondition };
export type ForecastDay = {
  day: string;
  condition: string;
  high: number;
  highUnit?: TemperatureUnit;
  low: number;
  lowUnit?: TemperatureUnit;
};

interface WeatherCardProps {
  dialog?: EntityCardDialogControl;
  id: string;
  location: string;
  temperature: number;
  temperatureUnit?: TemperatureUnit;
  feelsLikeTemperature?: number;
  feelsLikeTemperatureUnit?: TemperatureUnit;
  condition: WeatherCondition | string;
  humidity: number;
  windSpeed: number;
  windSpeedUnit?: string;
  windGustSpeed?: number;
  pressure?: number;
  pressureUnit?: string;
  uvIndex?: number;
  cloudCoverage?: number;
  precipitation: number;
  precipitationUnit: string;
  sunrise: string;
  sunset: string;
  daylight: string;
  rainForecast: string;
  forecast: ForecastDay[];
  forecastMode: WeatherForecastMode;
  highTemp: number;
  highTempUnit?: TemperatureUnit;
  lowTemp: number;
  lowTempUnit?: TemperatureUnit;
  size: CardSize;
  onSizeChange: (id: string, size: CardSize) => void;
  isEditMode: boolean;
}

export const WeatherCard = memo(function WeatherCard({
  id,
  location,
  temperature,
  temperatureUnit: sourceTemperatureUnit,
  feelsLikeTemperature,
  feelsLikeTemperatureUnit,
  condition,
  humidity,
  windSpeed,
  windSpeedUnit = 'km/h',
  windGustSpeed,
  pressure,
  pressureUnit = 'hPa',
  uvIndex,
  cloudCoverage,
  precipitation,
  precipitationUnit,
  sunrise,
  sunset,
  daylight,
  rainForecast,
  forecast,
  forecastMode: effectiveForecastMode,
  highTemp,
  highTempUnit,
  lowTemp,
  lowTempUnit,
  size,
  onSizeChange: _onSizeChange,
  isEditMode,
  dialog,
}: WeatherCardProps) {
  const { t } = useI18n();
  const accentColor = useAccentColor();
  const temperatureUnit = useSettingsStore(settingsSelectors.temperatureUnit);
  const {
    theme,
    effectiveEffectsQuality,
    surface,
    cardShell,
    shell,
    tintColor,
    tintSurface,
    hasCustomTint,
    weatherTintStyle,
    weatherTextTreatment,
    weatherShellClassName,
    isSettingsOpen: localIsSettingsOpen,
    setIsSettingsOpen: setLocalIsSettingsOpen,
    interaction,
    cityName,
    selectedForecastMode,
    selectedMetricIds,
    updateSettings,
    setTintColor,
  } = useWeatherCardController({ id, location, condition, isEditMode });

  const isSettingsOpen = dialog?.isOpen ?? localIsSettingsOpen;
  const setIsSettingsOpen = dialog?.onOpenChange ?? setLocalIsSettingsOpen;
  const isSmall = size === 'small';
  const isMedium = size === 'medium';
  const isLarge = size === 'large';
  const usesDetailedLayout = isMedium || isLarge;
  const visibleForecast = isSmall ? forecast.slice(0, 4) : forecast.slice(0, 7);
  const summaryLabel = formatWeatherConditionLabel(condition);
  const headerIconClassName = isSmall || usesDetailedLayout ? 'h-11 w-11' : 'h-10 w-10';
  const showHourlyForecast = effectiveForecastMode === 'hourly';
  const cardContentPaddingClassName = isMedium ? 'px-3 py-2.5' : 'p-3';
  const compactHeaderClassName = isSmall
    ? 'mb-1.5 gap-2'
    : isMedium
      ? 'mb-1.5 gap-3'
      : 'mb-3 gap-3';
  const compactLocationRowClassName = 'gap-1.5';
  const compactLocationTextClassName = isSmall ? 'text-[13px]' : 'text-sm';
  const compactTemperatureTextClassName = isSmall ? 'text-[2rem]' : 'text-3xl';
  const compactMetaTextClassName = isSmall ? 'text-xs' : 'text-sm';
  const compactSummaryTextClassName = isSmall ? 'text-xs' : 'text-sm';
  const compactHeaderIconClassName = isSmall ? 'h-9 w-9' : headerIconClassName;
  const compactTemperatureBlockClassName = isSmall ? 'mt-1' : isMedium ? 'mt-1' : 'mt-1.5';
  const compactTemperatureClassName = isSmall ? 'mb-0.5' : isMedium ? 'mb-0.5' : 'mb-1';
  const compactSummaryClassName = isSmall ? 'mt-0.5 max-w-18' : isMedium ? 'mt-0.5' : 'mt-1';
  const formatWeatherTemperature = (value: number, sourceUnit?: TemperatureUnit) =>
    formatTemperatureFromSourceUnit(value, sourceUnit, temperatureUnit);
  const formatWeatherTemperatureValue = (value: number, sourceUnit?: TemperatureUnit) =>
    formatTemperatureValueFromSourceUnit(value, sourceUnit, temperatureUnit);

  const textPrimary = weatherTextTreatment.primary;
  const textSecondary = weatherTextTreatment.secondary;
  const shellGlowOpacityClass =
    theme === 'black' ? 'opacity-18' : theme === 'dark' ? 'opacity-28' : 'opacity-55';
  const weatherOverlayClassName = hasCustomTint
    ? (tintSurface.overlayClassName ?? 'bg-transparent')
    : [surface.lightOverlay, shell.overlayClassName].filter(Boolean).join(' ');

  const gradientBackgroundStyle = useMemo(
    () =>
      ({
        background:
          theme === 'light'
            ? 'linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.05) 32%, rgba(248,250,252,0.14) 100%)'
            : theme === 'glass'
              ? 'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 32%, rgba(255,255,255,0.02) 100%)'
              : theme === 'black'
                ? 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 28%, rgba(0,0,0,0.14) 100%)'
                : 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 28%, rgba(2,6,23,0.12) 100%)',
      }) as React.CSSProperties,
    [theme]
  );

  const iconStylePrimary = useMemo(
    () => ({ color: textPrimary }) as React.CSSProperties,
    [textPrimary]
  );

  const iconStyleSecondary = useMemo(
    () => ({ color: textSecondary }) as React.CSSProperties,
    [textSecondary]
  );

  const titleStyle = useMemo(
    () =>
      ({
        color: textPrimary,
        textShadow: weatherTextTreatment.textShadow,
      }) as React.CSSProperties,
    [textPrimary, weatherTextTreatment.textShadow]
  );

  const subtitleStyle = useMemo(
    () =>
      ({
        color: textSecondary,
        textShadow: weatherTextTreatment.textShadow,
      }) as React.CSSProperties,
    [textSecondary, weatherTextTreatment.textShadow]
  );

  return (
    <>
      {!dialog ? (
        <CardWrapper
          className={`${cardShell.backdropClassName} ${weatherShellClassName} ${!isEditMode ? 'cursor-pointer' : ''}`}
          style={weatherTintStyle}
          lightOverlayClassName={weatherOverlayClassName || undefined}
          showShadow={false}
          interactionProps={interaction.cardProps}
        >
          <WeatherBackground
            condition={condition}
            effectsQuality={effectiveEffectsQuality}
            hasCustomTint={hasCustomTint}
            size={size}
            theme={theme}
          />

          {hasCustomTint ? (
            tintSurface.glowStyle ? (
              <div className="absolute inset-0" style={tintSurface.glowStyle} />
            ) : null
          ) : (
            <div className={`absolute inset-0 ${shell.glowClassName} ${shellGlowOpacityClass}`} />
          )}
          {!hasCustomTint ? (
            <div
              className="pointer-events-none absolute inset-0 z-[1]"
              style={gradientBackgroundStyle}
            />
          ) : null}

          <div
            className={`relative z-2 flex h-full min-h-0 flex-col ${cardContentPaddingClassName}`}
          >
            <div className={`flex items-start justify-between ${compactHeaderClassName}`}>
              <div className="min-w-0">
                <div className={`inline-flex min-w-0 items-center ${compactLocationRowClassName}`}>
                  <Navigation
                    className={`${isMedium || isSmall ? 'h-3.5 w-3.5' : 'h-4 w-4'} shrink-0`}
                    style={iconStyleSecondary}
                  />
                  <div
                    className={`truncate ${isMedium || isSmall ? compactLocationTextClassName : 'text-base'} font-semibold leading-none tracking-[-0.03em]`}
                    style={titleStyle}
                  >
                    {cityName}
                  </div>
                </div>

                {isMedium || isSmall ? (
                  <div className={compactTemperatureBlockClassName}>
                    <div
                      className={`font-bold leading-none ${compactTemperatureTextClassName} ${compactTemperatureClassName}`}
                      style={titleStyle}
                    >
                      {formatWeatherTemperature(temperature, sourceTemperatureUnit)}
                    </div>
                    <div className={compactMetaTextClassName} style={subtitleStyle}>
                      H:{formatWeatherTemperatureValue(highTemp, highTempUnit)}° L:
                      {formatWeatherTemperatureValue(lowTemp, lowTempUnit)}°
                      {typeof feelsLikeTemperature === 'number'
                        ? ` · ${t('weather.feelsLikeShort', {
                            temp: formatWeatherTemperature(
                              feelsLikeTemperature,
                              feelsLikeTemperatureUnit
                            ),
                          })}`
                        : ''}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <WeatherIcon
                  condition={condition}
                  className={`${isMedium || isSmall ? compactHeaderIconClassName : headerIconClassName} ml-auto shrink-0`}
                  style={iconStylePrimary}
                />
                <div
                  className={`${compactSummaryClassName} ${compactSummaryTextClassName} font-medium leading-tight`}
                  style={subtitleStyle}
                >
                  {summaryLabel}
                </div>
              </div>
            </div>

            {isSmall || isMedium ? (
              <div className="flex h-full flex-col">
                {visibleForecast.length > 0 ? (
                  <div className="mt-auto">
                    <WeatherForecastRow
                      forecast={visibleForecast}
                      temperatureUnit={temperatureUnit}
                      defaultTemperatureUnit={sourceTemperatureUnit}
                      showHourlyForecast={showHourlyForecast}
                      isSmall={isSmall}
                      isMedium={isMedium}
                      textPrimary={textPrimary}
                      textSecondary={textSecondary}
                      textShadow={weatherTextTreatment.textShadow}
                      titleStyle={titleStyle}
                      subtitleStyle={subtitleStyle}
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-auto flex min-h-0 flex-col">
                <div className="flex items-end justify-between gap-4">
                  <WeatherDetails
                    temperature={temperature}
                    temperatureUnit={sourceTemperatureUnit}
                    highTemp={highTemp}
                    highTempUnit={highTempUnit}
                    lowTemp={lowTemp}
                    lowTempUnit={lowTempUnit}
                    feelsLikeTemperature={feelsLikeTemperature}
                    feelsLikeTemperatureUnit={feelsLikeTemperatureUnit}
                    displayTemperatureUnit={temperatureUnit}
                    rainForecast={rainForecast}
                    precipitation={precipitation}
                    precipitationUnit={precipitationUnit}
                    humidity={humidity}
                    windSpeed={windSpeed}
                    windSpeedUnit={windSpeedUnit}
                    windGustSpeed={windGustSpeed}
                    pressure={pressure}
                    pressureUnit={pressureUnit}
                    uvIndex={uvIndex}
                    cloudCoverage={cloudCoverage}
                    selectedMetricIds={selectedMetricIds}
                    textPrimary={textPrimary}
                    textSecondary={textSecondary}
                    textShadow={weatherTextTreatment.textShadow}
                    titleStyle={titleStyle}
                    subtitleStyle={subtitleStyle}
                  />
                </div>

                <WeatherSunTimes
                  sunrise={sunrise}
                  sunset={sunset}
                  daylight={daylight}
                  textPrimary={textPrimary}
                  textSecondary={textSecondary}
                  textShadow={weatherTextTreatment.textShadow}
                  titleStyle={titleStyle}
                  subtitleStyle={subtitleStyle}
                  iconStyleSecondary={iconStyleSecondary}
                />

                {visibleForecast.length > 0 && (
                  <div className="flex justify-between gap-2">
                    <WeatherForecastRow
                      forecast={visibleForecast}
                      temperatureUnit={temperatureUnit}
                      defaultTemperatureUnit={sourceTemperatureUnit}
                      showHourlyForecast={showHourlyForecast}
                      isSmall={false}
                      isMedium={false}
                      textPrimary={textPrimary}
                      textSecondary={textSecondary}
                      textShadow={weatherTextTreatment.textShadow}
                      titleStyle={titleStyle}
                      subtitleStyle={subtitleStyle}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </CardWrapper>
      ) : null}

      {isSettingsOpen ? (
        <WeatherSettingsDialog
          onCloseAutoFocus={dialog?.onCloseAutoFocus}
          entityId={id}
          isOpen={isSettingsOpen}
          onOpenChange={setIsSettingsOpen}
          theme={theme}
          accentColorValue={accentColor}
          title={cityName}
          forecastMode={selectedForecastMode}
          onForecastModeChange={(mode) => updateSettings({ weatherForecastMode: mode })}
          metricIds={selectedMetricIds}
          onMetricIdsChange={(metricIds) => updateSettings({ weatherMetricIds: metricIds })}
          availableMetricIds={[
            'precipitation',
            'humidity',
            'wind',
            ...(typeof feelsLikeTemperature === 'number' ? (['feelsLike'] as const) : []),
            ...(typeof windGustSpeed === 'number' ? (['windGust'] as const) : []),
            ...(typeof pressure === 'number' && pressure > 0 ? (['pressure'] as const) : []),
            ...(typeof uvIndex === 'number' ? (['uvIndex'] as const) : []),
            ...(typeof cloudCoverage === 'number' ? (['cloudCover'] as const) : []),
          ]}
          tintColor={tintColor}
          onTintColorChange={setTintColor}
        />
      ) : null}
    </>
  );
});
