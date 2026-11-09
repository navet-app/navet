import { CardActionRow, CardActionRowGroup } from '@navet/app/components/patterns/card-action-row';
import { CardSettingsActionButton } from '@navet/app/components/shared/card-settings-action-button';
import type { ThemeType } from '@navet/app/hooks';
import { memo } from 'react';
import { ClimateTempControls } from '../climate-temp-controls';
import type { ClimateCardController } from '../use-climate-card-controller';

interface ClimateCardSmallLayoutProps {
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

export const ClimateCardSmallLayout = memo(function ClimateCardSmallLayout({
  controller,
  targetTemperatureLabel,
  readableTokens,
  stateSurface,
  theme,
}: ClimateCardSmallLayoutProps) {
  return (
    <div className="relative flex h-full flex-col gap-1.5">
      {/* Gauge would be rendered here - kept in parent for positioning */}
      <div className="mt-auto inline-flex w-fit flex-col self-start">
        <div className="min-w-0">
          <div
            className={`mb-1 text-3xl font-bold leading-none transition-colors duration-500 ${stateSurface.primaryTextClassName}`}
            style={{ color: readableTokens.titleColor }}
          >
            {controller.formatTemperature(controller.currentTemp)}
          </div>
          <div
            className={`text-xs ${stateSurface.secondaryTextClassName}`}
            style={{ color: readableTokens.subtitleColor }}
          >
            {targetTemperatureLabel}
          </div>
        </div>
      </div>

      <div className="pt-2">
        <CardActionRow
          theme={theme}
          size="small"
          leftContent={
            <CardActionRowGroup>
              <div className="relative z-[3]">
                <ClimateTempControls
                  targetTemp={controller.controlDisplayTargetTemp}
                  onTempChange={controller.setDisplayTargetTemp}
                  onTempCommit={controller.commitDisplayTargetTemp}
                  isOn={controller.isOn && controller.canSetTemperature}
                  size="small"
                  minTemp={controller.controlDisplayMinTemp}
                  maxTemp={controller.controlDisplayMaxTemp}
                  step={controller.controlDisplayStep}
                />
              </div>
            </CardActionRowGroup>
          }
          rightContent={
            <div className="relative z-[3]">
              <CardSettingsActionButton
                {...controller.cardInteraction.settingsButtonProps}
                theme={theme}
                size="small"
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
