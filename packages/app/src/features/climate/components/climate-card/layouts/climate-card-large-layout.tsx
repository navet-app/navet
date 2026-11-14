import { CardActionRow, CardActionRowGroup } from '@navet/app/components/patterns/card-action-row';
import { CardSettingsActionButton } from '@navet/app/components/shared/card-settings-action-button';
import { cn } from '@navet/app/components/ui/utils';
import { convertCelsiusPresetToSourceUnit } from '@navet/app/features/climate/utils/climate-temperature-presets';
import type { ThemeType } from '@navet/app/hooks';
import { formatTemperatureValueFromSourceUnit } from '@navet/app/utils/temperature';
import { memo } from 'react';
import { ClimateModeControls } from '../climate-mode-controls';
import { ClimateTempControls } from '../climate-temp-controls';
import type { ClimateCardController } from '../use-climate-card-controller';

interface ClimateCardLargeLayoutProps {
  controller: ClimateCardController;
  targetTemperatureLabel: string;
  readableTokens: {
    titleColor: string;
    subtitleColor: string;
  };
  stateSurface: {
    primaryTextClassName: string;
    secondaryTextClassName: string;
    containerClassName: string;
  };
  theme: ThemeType;
}

const TEMPERATURE_PRESETS = [18, 21, 24] as const;

export const ClimateCardLargeLayout = memo(function ClimateCardLargeLayout({
  controller,
  targetTemperatureLabel,
  readableTokens,
  stateSurface,
  theme,
}: ClimateCardLargeLayoutProps) {
  return (
    <div className="relative flex h-full flex-col">
      {/* Gauge would be rendered here - kept in parent for positioning */}
      <div className="flex flex-1 flex-col">
        <div className="mt-4 inline-flex w-fit max-w-[58%] flex-col">
          <div
            className={`mb-1 text-4xl font-bold leading-none transition-colors duration-500 ${stateSurface.primaryTextClassName}`}
            style={{ color: readableTokens.titleColor }}
          >
            {controller.formatTemperature(controller.currentTemp)}
          </div>
          <div
            className={`text-sm ${stateSurface.secondaryTextClassName}`}
            style={{ color: readableTokens.subtitleColor }}
          >
            {targetTemperatureLabel}
          </div>
        </div>

        <div className="mt-auto">
          <div className="mb-4 flex max-w-[72%] items-center gap-1.5">
            {TEMPERATURE_PRESETS.map((preset) => {
              const sourcePresetValue = convertCelsiusPresetToSourceUnit(
                preset,
                controller.sourceTemperatureUnit
              );
              const isSelected = Math.abs(controller.targetTemp - sourcePresetValue) < 0.05;

              return (
                <button
                  type="button"
                  disabled={!controller.canSetTemperature}
                  key={preset}
                  onClick={(event) => {
                    event.stopPropagation();
                    controller.commitTargetTemp(sourcePresetValue);
                  }}
                  className={cn(
                    'relative z-[3] min-w-[4.5rem] rounded-2xl border px-3 py-2 text-sm font-semibold transition-[color,background-color,border-color,box-shadow,opacity,transform,filter]',
                    isSelected
                      ? 'border-white/20 bg-white/16'
                      : 'border-white/10 bg-white/6 hover:bg-white/10'
                  )}
                  style={{
                    color: isSelected ? readableTokens.titleColor : readableTokens.subtitleColor,
                  }}
                >
                  {formatTemperatureValueFromSourceUnit(
                    sourcePresetValue,
                    controller.sourceTemperatureUnit,
                    controller.temperatureUnit
                  )}
                  °
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="pt-4">
        <CardActionRow
          theme={theme}
          size="medium"
          leftContent={
            <div className="relative z-[3]">
              <CardActionRowGroup>
                <ClimateTempControls
                  targetTemp={controller.controlDisplayTargetTemp}
                  onTempChange={controller.setDisplayTargetTemp}
                  onTempCommit={controller.commitDisplayTargetTemp}
                  isOn={controller.isOn && controller.canSetTemperature}
                  size="medium"
                  minTemp={controller.controlDisplayMinTemp}
                  maxTemp={controller.controlDisplayMaxTemp}
                  step={controller.controlDisplayStep}
                />
                <ClimateModeControls
                  mode={controller.mode}
                  isOn={controller.isOn}
                  disabled={!controller.available}
                  onModeChange={controller.setMode}
                  supportedClimateModes={controller.supportedClimateModes}
                  size="medium"
                />
              </CardActionRowGroup>
            </div>
          }
          rightContent={
            <div className="relative z-[3]">
              <CardSettingsActionButton
                {...controller.cardInteraction.settingsButtonProps}
                theme={theme}
                size="medium"
                tone={controller.isOn ? 'default' : 'muted'}
                variant="soft"
              />
            </div>
          }
        />
      </div>
    </div>
  );
});
