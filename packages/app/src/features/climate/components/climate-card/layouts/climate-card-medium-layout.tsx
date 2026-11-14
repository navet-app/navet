import { CardActionRow, CardActionRowGroup } from '@navet/app/components/patterns/card-action-row';
import { CardSettingsActionButton } from '@navet/app/components/shared/card-settings-action-button';
import type { ThemeType } from '@navet/app/hooks';
import { memo } from 'react';
import { ClimateModeControls } from '../climate-mode-controls';
import { ClimateTempControls } from '../climate-temp-controls';
import type { ClimateCardController } from '../use-climate-card-controller';

interface ClimateCardMediumLayoutProps {
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

export const ClimateCardMediumLayout = memo(function ClimateCardMediumLayout({
  controller,
  targetTemperatureLabel,
  readableTokens,
  stateSurface,
  theme,
}: ClimateCardMediumLayoutProps) {
  return (
    <div className="relative flex h-full flex-col">
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
