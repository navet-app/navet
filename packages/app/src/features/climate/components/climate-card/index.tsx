import { EntityCardHeader } from '@navet/app/components/primitives/entity-card-header';
import { EntityCardHeaderIcon } from '@navet/app/components/primitives/entity-card-header-icon';
import { getCardReadableTextTokens } from '@navet/app/components/shared/theme/card-readable-text-tokens';
import { getCardShellSurfaceTokens } from '@navet/app/components/shared/theme/card-shell-surface-tokens';
import {
  getCardStateSurfaceStyleTokens,
  getCardStateSurfaceTokens,
} from '@navet/app/components/shared/theme/card-state-surface-tokens';
import { CardWrapper } from '@navet/app/components/ui/card-wrapper';
import { getClimateTemperatureStatusLabel } from '@navet/app/features/climate/utils/climate-temperature-status-label';
import { LightCardTableRow } from '@navet/app/features/lighting/components/light-card/light-card-table-row';
import { useI18n, useTheme } from '@navet/app/hooks';
import { Flame, Snowflake, Thermometer, Wind } from 'lucide-react';
import { memo } from 'react';
import { ClimateSettingsDialog } from '../climate-settings-dialog';
import type { ClimateCardProps } from './climate-card.types';
import { ClimateGauge } from './climate-gauge';
import { ClimateCardLargeLayout, ClimateCardMediumLayout, ClimateCardSmallLayout } from './layouts';
import { useClimateCardController } from './use-climate-card-controller';

const ignoreRowBrightness = () => {};

function resolveClimateCardSize(size: ClimateCardProps['size']): 'small' | 'medium' | 'large' {
  return size === 'small' || size === 'large' ? size : 'medium';
}

export const ClimateCard = memo(function ClimateCard({
  id,
  name,
  room: _room,
  headerSubtitle,
  initialTemp = 21,
  initialCurrentTemp = 22,
  temperatureUnit,
  initialMode = 'cool',
  initialAction,
  supportedClimateModes,
  initialState = true,
  size,
  onSizeChange: _onSizeChange,
  isEditMode,
  companion,
  dialog,
}: ClimateCardProps) {
  const { t } = useI18n();
  const { accentColor } = useTheme();
  const resolvedSize = resolveClimateCardSize(size);
  const controller = useClimateCardController({
    id,
    name,
    initialTemp,
    initialCurrentTemp,
    sourceTemperatureUnit: temperatureUnit,
    initialMode,
    initialAction,
    supportedClimateModes,
    initialState,
    isEditMode,
    size: resolvedSize,
  });
  const isSurfaceActive =
    controller.isOn && controller.visualMode !== 'idle' && controller.visualMode !== 'off';
  const cardShell = getCardShellSurfaceTokens(controller.theme);
  const stateSurface = getCardStateSurfaceTokens(controller.theme, isSurfaceActive);
  const targetTemperatureLabel = getClimateTemperatureStatusLabel(
    t,
    controller.formatTemperature(controller.targetTemp),
    controller.formatTemperature(controller.currentTemp),
    controller.visualMode,
    controller.targetTemp,
    controller.currentTemp,
    controller.hasTargetTemperature
  );
  const tone =
    !controller.isOn || controller.visualMode === 'idle'
      ? 'neutral'
      : controller.visualMode === 'heat'
        ? 'orange'
        : controller.visualMode === 'cool'
          ? 'cyan'
          : 'blue';
  const readableTokens = getCardReadableTextTokens({
    theme: controller.theme,
    tone,
    accentColor,
  });
  const stateSurfaceStyle = getCardStateSurfaceStyleTokens({
    theme: controller.theme,
    isActive: isSurfaceActive,
    baseColor:
      controller.visualMode === 'heat'
        ? '#f97316'
        : controller.visualMode === 'cool'
          ? '#06b6d4'
          : controller.visualMode === 'fan' || controller.visualMode === 'fan_only'
            ? '#3b82f6'
            : accentColor,
    borderAlphaHex:
      controller.visualMode === 'heat'
        ? '40'
        : controller.visualMode === 'cool'
          ? '3a'
          : controller.visualMode === 'fan' || controller.visualMode === 'fan_only'
            ? '36'
            : '47',
    tintMidAlphaHex:
      controller.visualMode === 'heat'
        ? '12'
        : controller.visualMode === 'cool'
          ? '10'
          : controller.visualMode === 'fan' || controller.visualMode === 'fan_only'
            ? '10'
            : '14',
    tintEndAlphaHex:
      controller.visualMode === 'heat'
        ? '24'
        : controller.visualMode === 'cool'
          ? '1f'
          : controller.visualMode === 'fan' || controller.visualMode === 'fan_only'
            ? '1d'
            : '26',
    radialAlphaHex:
      controller.visualMode === 'heat'
        ? '28'
        : controller.visualMode === 'cool'
          ? '24'
          : controller.visualMode === 'fan' || controller.visualMode === 'fan_only'
            ? '22'
            : '30',
  });
  const HeaderIcon =
    controller.visualMode === 'heat'
      ? Flame
      : controller.visualMode === 'cool'
        ? Snowflake
        : controller.visualMode === 'fan' || controller.visualMode === 'fan_only'
          ? Wind
          : Thermometer;
  return (
    <>
      {dialog ? null : companion ? (
        <LightCardTableRow
          compact
          name={name}
          isOn={controller.isOn}
          brightness={0}
          supportsBrightness={false}
          IconComponent={HeaderIcon}
          isEditMode={isEditMode}
          disabled={companion.disabled}
          unavailable={companion.unavailable}
          toggleDisabled={
            controller.supportedClimateModes !== undefined &&
            !controller.supportedClimateModes.includes('off')
          }
          stateLabel={companion.value}
          secondaryText={targetTemperatureLabel}
          cardInteraction={controller.cardInteraction}
          iconButtonProps={controller.cardInteraction.iconButtonProps}
          onBrightnessChange={ignoreRowBrightness}
          onBrightnessCommit={ignoreRowBrightness}
        />
      ) : (
        <CardWrapper
          interactionProps={controller.cardInteraction.cardProps}
          isActive={isSurfaceActive}
          activeColor={
            controller.visualMode === 'heat'
              ? '#f97316'
              : controller.visualMode === 'cool'
                ? '#06b6d4'
                : controller.visualMode === 'fan' || controller.visualMode === 'fan_only'
                  ? '#3b82f6'
                  : accentColor
          }
          className={`bg-gradient-to-br ${controller.cardColors.gradient} ${controller.cardColors.border} ${stateSurface.containerClassName}`}
          style={stateSurfaceStyle.cardStyle}
          lightOverlayClassName={controller.lightOverlay}
          showShadow={isSurfaceActive && controller.theme !== 'light'}
        >
          {isSurfaceActive && (
            <div
              className={`absolute inset-0 bg-gradient-to-br ${controller.cardColors.glow} to-transparent transition-[color,background-color,border-color,box-shadow,opacity,transform,filter] duration-500`}
            />
          )}

          {cardShell.sheenOverlayClassName ? (
            <div className={cardShell.sheenOverlayClassName} />
          ) : null}
          {stateSurfaceStyle.innerOverlayClassName ? (
            <div
              className={stateSurfaceStyle.innerOverlayClassName}
              style={stateSurfaceStyle.innerOverlayStyle}
            />
          ) : null}
          {stateSurfaceStyle.shineOverlayClassName ? (
            <div className={stateSurfaceStyle.shineOverlayClassName} />
          ) : null}

          {stateSurface.overlayClassName && (
            <div className={`absolute inset-0 ${stateSurface.overlayClassName}`} />
          )}

          <div className="relative z-[2] h-full flex flex-col p-3">
            <EntityCardHeader
              title={name}
              subtitle={headerSubtitle ?? t('climate.subtitle')}
              layout="eyebrow-first"
              size={resolvedSize}
              tone={tone}
              titleClassName={stateSurface.primaryTextClassName}
              subtitleClassName={stateSurface.mutedTextClassName}
              leading={
                <EntityCardHeaderIcon
                  IconComponent={HeaderIcon}
                  isActive={controller.isOn}
                  size={resolvedSize}
                  tone={tone}
                  ariaLabel={controller.cardInteraction.iconButtonProps['aria-label']}
                  onClick={controller.cardInteraction.iconButtonProps.onClick}
                />
              }
            />

            <div className="flex-1">
              {controller.isSmall ? (
                <>
                  <ClimateGauge
                    id={id}
                    mode={controller.visualMode}
                    targetTemp={controller.displayTargetTemp}
                    currentTemp={controller.displayCurrentTemp}
                    isOn={controller.isOn}
                    minTemp={controller.displayMinTemp}
                    maxTemp={controller.displayMaxTemp}
                    step={controller.displayStep}
                    temperatureUnit={controller.temperatureUnit}
                    onTargetTempChange={controller.setDisplayTargetTemp}
                    onTargetTempCommit={controller.commitDisplayTargetTemp}
                    variant="docked-card-small"
                    className="pointer-events-auto absolute right-[-4rem] top-1/2 z-[2] -translate-y-1/2"
                  />
                  <ClimateCardSmallLayout
                    controller={controller}
                    targetTemperatureLabel={targetTemperatureLabel}
                    readableTokens={readableTokens}
                    stateSurface={stateSurface}
                    theme={controller.theme}
                  />
                </>
              ) : controller.isMedium ? (
                <>
                  <ClimateGauge
                    id={id}
                    mode={controller.visualMode}
                    targetTemp={controller.displayTargetTemp}
                    currentTemp={controller.displayCurrentTemp}
                    isOn={controller.isOn}
                    minTemp={controller.displayMinTemp}
                    maxTemp={controller.displayMaxTemp}
                    step={controller.displayStep}
                    temperatureUnit={controller.temperatureUnit}
                    onTargetTempChange={controller.setDisplayTargetTemp}
                    onTargetTempCommit={controller.commitDisplayTargetTemp}
                    variant="docked-card-small"
                    className="pointer-events-auto absolute right-[-0.25rem] top-1/2 z-[2] -translate-y-1/2"
                  />
                  <ClimateCardMediumLayout
                    controller={controller}
                    targetTemperatureLabel={targetTemperatureLabel}
                    readableTokens={readableTokens}
                    stateSurface={stateSurface}
                    theme={controller.theme}
                  />
                </>
              ) : (
                <>
                  <ClimateGauge
                    id={id}
                    mode={controller.visualMode}
                    targetTemp={controller.displayTargetTemp}
                    currentTemp={controller.displayCurrentTemp}
                    isOn={controller.isOn}
                    minTemp={controller.displayMinTemp}
                    maxTemp={controller.displayMaxTemp}
                    step={controller.displayStep}
                    temperatureUnit={controller.temperatureUnit}
                    onTargetTempChange={controller.setDisplayTargetTemp}
                    onTargetTempCommit={controller.commitDisplayTargetTemp}
                    variant="docked-card"
                    className="pointer-events-auto absolute right-[-3.4rem] top-1/2 z-[2] -translate-y-1/2"
                  />
                  <ClimateCardLargeLayout
                    controller={controller}
                    targetTemperatureLabel={targetTemperatureLabel}
                    readableTokens={readableTokens}
                    stateSurface={stateSurface}
                    theme={controller.theme}
                  />
                </>
              )}
            </div>
          </div>
        </CardWrapper>
      )}

      {(dialog?.isOpen ?? controller.isSettingsOpen) ? (
        <ClimateSettingsDialog
          entityId={id}
          isOpen={(dialog?.isOpen ?? controller.isSettingsOpen) && !companion?.disabled}
          onOpenChange={dialog?.onOpenChange ?? controller.setIsSettingsOpen}
          onCloseAutoFocus={dialog?.onCloseAutoFocus}
          name={name}
          isOn={controller.isOn}
          mode={controller.mode}
          action={controller.action}
          targetTemp={controller.targetTemp}
          currentTemp={controller.currentTemp}
          sourceTemperatureUnit={controller.sourceTemperatureUnit}
          minTemp={controller.minTemp}
          maxTemp={controller.maxTemp}
          step={controller.step}
          siblingEntities={controller.siblingEntities}
          supportedClimateModes={controller.supportedClimateModes}
          onTargetTempChange={controller.setTargetTemp}
          onTargetTempCommit={controller.commitTargetTemp}
          onModeChange={controller.setMode}
        />
      ) : null}
    </>
  );
});
