import { BaseCard } from '@navet/app/components/primitives';
import { Button } from '@navet/app/components/primitives/button';
import { EntityCardHeader } from '@navet/app/components/primitives/entity-card-header';
import { EntityCardHeaderIcon } from '@navet/app/components/primitives/entity-card-header-icon';
import { EntityCardTitleBlock } from '@navet/app/components/primitives/entity-card-title-block';
import { CardSettingsActionButton } from '@navet/app/components/shared/card-settings-action-button';
import { isTinyCardSize } from '@navet/app/components/shared/card-size-selector';
import { DeviceControlRow } from '@navet/app/components/shared/device-editor/device-control-row';
import { getCardReadableTextTokens } from '@navet/app/components/shared/theme/card-readable-text-tokens';
import { getCardShellSurfaceTokens } from '@navet/app/components/shared/theme/card-shell-surface-tokens';
import {
  getCardStateSurfaceStyleTokens,
  getCardStateSurfaceTokens,
} from '@navet/app/components/shared/theme/card-state-surface-tokens';
import { getCustomCardTintSurface } from '@navet/app/components/shared/theme/custom-card-tint-surface';
import { TinyCardWatermark } from '@navet/app/components/shared/tiny-card-watermark';
import { LightCardTableRow } from '@navet/app/features/lighting/components/light-card/light-card-table-row';
import { useI18n } from '@navet/app/hooks';
import { memo } from 'react';
import type { SwitchCardProps } from './switch-card.types';
import { SwitchSettingsDialog } from './switch-settings-dialog';
import { useSwitchCardController } from './use-switch-card-controller';

const ignoreRowBrightness = () => {};

const CARD_VISUAL_TRANSITION_CLASS =
  'transition-[background-color,border-color,box-shadow,color,opacity,transform,filter] duration-500';
const OVERLAY_VISUAL_TRANSITION_CLASS = 'transition-[background,opacity,filter] duration-500';

export const SwitchCard = memo(function SwitchCard(props: Omit<SwitchCardProps, 'room'>) {
  const controller = useSwitchCardController(props);
  const { t } = useI18n();
  const cardShell = getCardShellSurfaceTokens(controller.theme);
  const stateSurface = getCardStateSurfaceTokens(controller.theme, controller.isOn);
  const isTiny = isTinyCardSize(props.size);
  const tintSurface = getCustomCardTintSurface(controller.theme, controller.tintColor);
  const tinyTextTokens = getCardReadableTextTokens({
    theme: controller.theme,
    tone: controller.isOn ? 'primary' : 'neutral',
    accentColor: controller.accentColor,
  });
  const metricTextTokens = getCardReadableTextTokens({
    theme: controller.theme,
    tone: controller.isOn ? 'primary' : 'neutral',
    accentColor: controller.accentColor,
    baseColor: controller.isOn ? controller.tintColor || controller.accentColor : undefined,
  });
  const stateOverlay = stateSurface.overlayClassName ? (
    <div className={`absolute inset-0 ${stateSurface.overlayClassName}`} />
  ) : null;
  const sheenOverlay = cardShell.sheenOverlayClassName ? (
    <div className={cardShell.sheenOverlayClassName} />
  ) : null;
  const lightOverlay =
    controller.theme !== 'light' ? null : <div className="absolute inset-0 bg-white/58" />;
  const tintOverlay = tintSurface.overlayClassName ? (
    <div className={`absolute inset-0 ${tintSurface.overlayClassName}`} />
  ) : null;
  const tintGlow = tintSurface.glowStyle ? (
    <div className="absolute inset-0" style={tintSurface.glowStyle} />
  ) : null;
  const blackActiveSurface =
    controller.theme === 'black' && controller.isOn
      ? getCardStateSurfaceStyleTokens({
          theme: controller.theme,
          isActive: true,
          baseColor: controller.tintColor || controller.accentColor,
          borderAlphaHex: controller.tintColor ? '33' : '47',
        })
      : null;
  const activeShellBackgroundClassName = controller.isOn
    ? `bg-linear-to-br ${controller.cardColors.gradient}`
    : '';
  const frameClassName = `${cardShell.rootFrameClassName} ${activeShellBackgroundClassName} ${controller.cardColors.border} ${stateSurface.containerClassName}`;

  const controlsDialog =
    controller.hasControlsDialog && controller.isDialogOpen ? (
      <SwitchSettingsDialog
        onCloseAutoFocus={props.dialog?.onCloseAutoFocus}
        entityId={props.id}
        isOpen={controller.isDialogOpen && !props.companion?.disabled}
        onOpenChange={controller.setIsDialogOpen}
        name={controller.displayName}
        labelContextName={props.name}
        entityType={controller.entityType}
        isOn={controller.isOn}
        metricSectionTitle={controller.metricSectionTitle}
        metricSectionDescription={controller.metricSectionDescription}
        metricLimit={controller.metricLimit}
        availableMetrics={controller.availableMetrics}
        selectedMetricLabels={controller.selectedMetricLabels}
        getMetricLabel={controller.getMetricLabel}
        onMetricToggle={controller.handleMetricToggle}
        selectedIcon={controller.selectedIcon}
        onIconChange={controller.setSelectedIcon}
        siblingEntities={controller.siblingEntities}
        customControls={
          props.binaryControl ? (
            <DeviceControlRow
              kind="toggle"
              theme="dark"
              label={props.name}
              checked={controller.isOn}
              disabled={controller.toggleDisabled}
              onCheckedChange={props.binaryControl.onToggle}
              status={props.binaryControl.status}
            />
          ) : controller.isScript ? (
            <Button onClick={controller.handleToggle} disabled={controller.toggleDisabled}>
              {t('common.run')}
            </Button>
          ) : undefined
        }
        tintColor={controller.tintColor}
        onTintColorChange={controller.setTintColor}
      />
    ) : null;
  if (props.dialog) return controlsDialog;
  if (props.companion)
    return (
      <>
        <LightCardTableRow
          compact
          name={controller.displayName}
          isOn={controller.isOn}
          brightness={0}
          supportsBrightness={false}
          IconComponent={controller.HeaderIconComponent}
          isEditMode={Boolean(props.isEditMode)}
          disabled={props.companion.disabled || controller.toggleDisabled}
          unavailable={props.companion.unavailable}
          stateLabel={props.companion.value}
          cardInteraction={controller.cardInteraction}
          iconButtonProps={controller.cardInteraction.iconButtonProps}
          onBrightnessChange={ignoreRowBrightness}
          onBrightnessCommit={ignoreRowBrightness}
        />
        {controlsDialog}
      </>
    );
  if (isTiny) {
    return (
      <>
        <BaseCard
          size="tiny"
          {...controller.cardInteraction.cardProps}
          aria-disabled={controller.toggleDisabled || props.isEditMode}
          interactive={!props.isEditMode}
          className={`${CARD_VISUAL_TRANSITION_CLASS} ${!props.isEditMode ? 'cursor-pointer' : ''}`}
          frameClassName={frameClassName}
          style={blackActiveSurface?.cardStyle ?? tintSurface.panelStyle}
          disableDefaultSheen
          disableDefaultLightOverlay
          overlay={
            <>
              {controller.isOn ? (
                <div
                  className={`absolute inset-0 bg-linear-to-br ${controller.cardColors.glow} to-transparent opacity-90 ${OVERLAY_VISUAL_TRANSITION_CLASS}`}
                />
              ) : null}
              {tintGlow}
              {lightOverlay}
              {blackActiveSurface?.innerOverlayClassName ? (
                <div
                  className={blackActiveSurface.innerOverlayClassName}
                  style={blackActiveSurface.innerOverlayStyle}
                />
              ) : null}
              {sheenOverlay}
              {blackActiveSurface?.shineOverlayClassName ? (
                <div className={blackActiveSurface.shineOverlayClassName} />
              ) : null}
              {stateOverlay}
              {tintOverlay}
            </>
          }
          contentClassName="h-full"
        >
          <TinyCardWatermark
            IconComponent={controller.HeaderIconComponent}
            iconText={controller.headerIconText}
            color={tinyTextTokens.titleColor}
            className={controller.isOn ? 'opacity-18' : 'opacity-12'}
          />

          <div className="relative flex h-full w-full flex-col justify-between text-left">
            <div className="min-w-0 w-full">
              <EntityCardTitleBlock
                title={controller.displayName}
                subtitle={controller.entityType}
                layout="eyebrow-first"
                titleClassName={`mt-1 line-clamp-2 text-xs font-semibold leading-tight ${stateSurface.primaryTextClassName}`}
                subtitleClassName={`truncate text-xs tracking-normal ${stateSurface.mutedTextClassName}`}
                titleStyle={{ color: tinyTextTokens.titleColor }}
                subtitleStyle={{ color: tinyTextTokens.subtitleColor }}
              />
            </div>
            <span />
          </div>
          {props.binaryControl?.status}
        </BaseCard>

        {controlsDialog}
      </>
    );
  }

  if (controller.isExtraSmall) {
    return (
      <>
        <BaseCard
          size="extra-small"
          {...controller.cardInteraction.cardProps}
          aria-disabled={controller.toggleDisabled || props.isEditMode}
          interactive={!props.isEditMode}
          className={`${CARD_VISUAL_TRANSITION_CLASS} ${!props.isEditMode ? 'cursor-pointer' : ''}`}
          frameClassName={frameClassName}
          style={blackActiveSurface?.cardStyle ?? tintSurface.panelStyle}
          disableDefaultSheen
          disableDefaultLightOverlay
          overlay={
            <>
              {controller.isOn ? (
                <div
                  className={`absolute inset-0 bg-linear-to-r ${controller.cardColors.glow} via-transparent to-transparent opacity-90 ${OVERLAY_VISUAL_TRANSITION_CLASS}`}
                />
              ) : null}
              {tintGlow}
              {lightOverlay}
              {blackActiveSurface?.innerOverlayClassName ? (
                <div
                  className={blackActiveSurface.innerOverlayClassName}
                  style={blackActiveSurface.innerOverlayStyle}
                />
              ) : null}
              {sheenOverlay}
              {blackActiveSurface?.shineOverlayClassName ? (
                <div className={blackActiveSurface.shineOverlayClassName} />
              ) : null}
              {stateOverlay}
              {tintOverlay}
            </>
          }
          contentClassName="flex items-start"
        >
          <div className="relative w-full">
            <EntityCardHeader
              title={controller.displayName}
              subtitle={controller.entityType}
              size="extra-small"
              compact
              layout="eyebrow-first"
              tone={controller.isOn ? 'primary' : 'neutral'}
              titleClassName={stateSurface.primaryTextClassName}
              subtitleClassName={stateSurface.mutedTextClassName}
              className="w-full"
              marginBottomClassName="mb-0"
              leading={
                <EntityCardHeaderIcon
                  IconComponent={controller.HeaderIconComponent}
                  iconText={controller.headerIconText}
                  isActive={controller.isOn}
                  size="tiny"
                  tone={controller.isOn ? 'primary' : 'neutral'}
                  ariaLabel={controller.cardInteraction.iconButtonProps['aria-label']}
                  disabled={controller.toggleDisabled}
                  onClick={controller.cardInteraction.iconButtonProps.onClick}
                />
              }
            />
          </div>
          {props.binaryControl?.status}
        </BaseCard>

        {controlsDialog}
      </>
    );
  }

  return (
    <>
      <BaseCard
        size={controller.isExtraSmall ? 'extra-small' : 'small'}
        {...controller.cardInteraction.cardProps}
        aria-disabled={controller.toggleDisabled || props.isEditMode}
        interactive={!props.isEditMode}
        className={`${CARD_VISUAL_TRANSITION_CLASS} ${!props.isEditMode ? 'cursor-pointer' : ''}`}
        frameClassName={frameClassName}
        style={blackActiveSurface?.cardStyle ?? tintSurface.panelStyle}
        disableDefaultSheen
        disableDefaultLightOverlay
        overlay={
          <>
            {controller.isOn && (
              <div
                className={`absolute inset-0 bg-linear-to-br ${controller.cardColors.glow} to-transparent ${OVERLAY_VISUAL_TRANSITION_CLASS}`}
              />
            )}
            {tintGlow}
            {controller.theme === 'light' && <div className="absolute inset-0 bg-white/60" />}
            {blackActiveSurface?.innerOverlayClassName ? (
              <div
                className={blackActiveSurface.innerOverlayClassName}
                style={blackActiveSurface.innerOverlayStyle}
              />
            ) : null}
            {sheenOverlay}
            {blackActiveSurface?.shineOverlayClassName ? (
              <div className={blackActiveSurface.shineOverlayClassName} />
            ) : null}
            {stateOverlay}
            {tintOverlay}
          </>
        }
        contentClassName="h-full"
      >
        <div className="relative h-full flex flex-col">
          <EntityCardHeader
            title={controller.displayName}
            subtitle={controller.entityType}
            layout="eyebrow-first"
            size={controller.isExtraSmall ? 'extra-small' : 'small'}
            tone={controller.isOn ? 'primary' : 'neutral'}
            titleClassName={`${stateSurface.primaryTextClassName} transition-colors duration-500 text-left`}
            subtitleClassName={`${stateSurface.mutedTextClassName} text-left`}
            className={`${controller.isExtraSmall ? 'mb-1.5' : 'mb-2'}`}
            leading={
              <EntityCardHeaderIcon
                IconComponent={controller.HeaderIconComponent}
                iconText={controller.headerIconText}
                isActive={controller.isOn}
                size={controller.isExtraSmall ? 'extra-small' : 'small'}
                tone={controller.isOn ? 'primary' : 'neutral'}
                ariaLabel={controller.cardInteraction.iconButtonProps['aria-label']}
                disabled={controller.toggleDisabled}
                onClick={controller.cardInteraction.iconButtonProps.onClick}
              />
            }
          />

          <div className="flex-1" />

          <div className="relative">
            {controller.showSettingsButton && !controller.isExtraSmall && (
              <div className="absolute bottom-0 right-0">
                <CardSettingsActionButton
                  theme={controller.theme}
                  size="small"
                  variant="soft"
                  tone={controller.isOn ? 'default' : 'muted'}
                  {...controller.cardInteraction.settingsButtonProps}
                />
              </div>
            )}
            {controller.selectedMetrics.length > 0 && (
              <div className={controller.isExtraSmall ? 'space-y-1' : 'space-y-1.5'}>
                {controller.selectedMetrics.map((metric, i) => (
                  <div
                    key={metric.label}
                    className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-xs ${i === controller.selectedMetrics.length - 1 && controller.showSettingsButton && !controller.isExtraSmall ? 'pr-10' : ''}`}
                  >
                    <span
                      className={`${stateSurface.secondaryTextClassName} flex min-w-0 items-center gap-1.5 overflow-hidden text-[12px] leading-tight`}
                      style={{ color: metricTextTokens.subtitleColor }}
                    >
                      {controller.renderMetricIcon(
                        metric,
                        `${controller.isExtraSmall ? 'h-2.5 w-2.5' : 'h-3 w-3'} shrink-0`
                      )}
                      <span className="min-w-0 truncate">{controller.getMetricLabel(metric)}</span>
                    </span>
                    <span
                      className={`${stateSurface.primaryTextClassName} shrink-0 whitespace-nowrap text-right text-[12px] font-medium tabular-nums`}
                      style={{ color: metricTextTokens.titleColor }}
                    >
                      {controller.formatMetricValue(metric)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {props.binaryControl?.status}
      </BaseCard>

      {controlsDialog}
    </>
  );
});
