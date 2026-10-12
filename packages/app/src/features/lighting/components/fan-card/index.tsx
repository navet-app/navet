import { dispatchEntityCommand } from '@navet/app/commands';
import { CardActionRow, CardActionRowGroup } from '@navet/app/components/patterns/card-action-row';
import {
  getPortalActionDockAnchorRect,
  PortalActionDock,
  type PortalActionDockAnchorRect,
} from '@navet/app/components/patterns/portal-action-dock';
import { BaseCard } from '@navet/app/components/primitives';
import { Button } from '@navet/app/components/primitives/button';
import { EntityCardHeader } from '@navet/app/components/primitives/entity-card-header';
import { EntityCardHeaderIcon } from '@navet/app/components/primitives/entity-card-header-icon';
import { getCardActionControlSizes } from '@navet/app/components/shared/card-action-control-sizes';
import { CardSettingsActionButton } from '@navet/app/components/shared/card-settings-action-button';
import { type CardSize, isCompactCardSize } from '@navet/app/components/shared/card-size-selector';
import { BrightnessSlider } from '@navet/app/components/shared/device-editor';
import { getBrightnessPresetSelectedStyle } from '@navet/app/components/shared/device-editor/brightness-preset-styles';
import { selectRelatedHelpers } from '@navet/app/components/shared/device-editor/entity-helper-controls';
import { useEditModeSettingsRequest } from '@navet/app/components/shared/edit-mode-settings-request';
import { useEntityCardInteractionController } from '@navet/app/components/shared/entity-card-interaction-controller';
import { getCardShellSurfaceTokens } from '@navet/app/components/shared/theme/card-shell-surface-tokens';
import { getCardStateSurfaceTokens } from '@navet/app/components/shared/theme/card-state-surface-tokens';
import { getRoundControlStyles } from '@navet/app/components/shared/theme/round-control-styles';
import {
  useI18n,
  useIntegrationStore,
  useProviderClimateTopology,
  useProviderEntitySnapshot,
  useProviderEntitySnapshotRecord,
  useServiceActionHandler,
  useTheme,
} from '@navet/app/hooks';
import { useProviderEntityModel } from '@navet/app/hooks/use-provider-device';
import type { TranslationKey } from '@navet/app/i18n';
import { invokeIntegrationNativeAction } from '@navet/app/services/integration-native-action.service';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import { parseProviderScopedId } from '@navet/app/utils/provider-ids';
import { Fan, MoreHorizontal, RotateCcw, RotateCw, Wind } from 'lucide-react';
import { type MouseEvent, memo, useCallback, useEffect, useState } from 'react';
import { getLightCardSurfaceTokens } from '../light-card/light-card-surface-tokens';
import { useSwitchCardAppearance } from '../use-switch-card-appearance';
import type { SwitchSiblingEntity } from '../use-switch-card-controller';
import { FanSettingsDialog } from './fan-settings-dialog';

interface FanCardProps {
  id: string;
  name: string;
  room: string;
  providerId?: IntegrationProviderId;
  initialState?: boolean;
  initialPercentage?: number;
  size: CardSize;
  onSizeChange: (id: string, size: CardSize) => void;
  isEditMode: boolean;
}

type FanSpeed = 'low' | 'medium' | 'high';

const FAN_SPEED_PERCENTAGES: Record<FanSpeed, number> = {
  low: 33,
  medium: 66,
  high: 100,
};

const FAN_SPEED_ACTIONS: Array<{
  speed: FanSpeed;
  labelKey: TranslationKey;
}> = [
  { speed: 'low', labelKey: 'lighting.fanSpeed.low' },
  { speed: 'medium', labelKey: 'lighting.fanSpeed.medium' },
  { speed: 'high', labelKey: 'lighting.fanSpeed.high' },
];

const CARD_VISUAL_TRANSITION_CLASS =
  'transition-[background-color,border-color,box-shadow,color,opacity,transform,filter] duration-500';

function clampPercentage(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function resolveFanSpeed(isOn: boolean, percentage: number): FanSpeed | null {
  if (!isOn || percentage <= 0) {
    return null;
  }

  if (percentage <= 45) {
    return 'low';
  }

  if (percentage <= 80) {
    return 'medium';
  }

  return 'high';
}

function resolveFanCardSize(size: CardSize): CardSize {
  return size === 'large' || size === 'extra-large' || size === 'medium-vertical' ? 'medium' : size;
}

function FanSpeedPresetContent({ speed, isSmall }: { speed: FanSpeed; isSmall: boolean }) {
  const iconSize = getCardActionControlSizes(isSmall ? 'small' : 'medium').icon;

  return (
    <span
      aria-hidden="true"
      className="relative isolate flex h-full w-full items-center justify-center overflow-hidden rounded-full"
    >
      <Fan className={`${iconSize} absolute z-0 opacity-[0.42]`} />
      <span
        className={`relative z-10 ${
          isSmall ? 'text-[10px]' : 'text-[11px]'
        } font-bold leading-none tracking-[-0.04em] drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)] tabular-nums`}
      >
        {FAN_SPEED_PERCENTAGES[speed]}
      </span>
    </span>
  );
}

function readFanDirection(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function supportsOscillation(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

interface FanPresetOverflowButtonProps {
  presets: typeof FAN_SPEED_ACTIONS;
  activeSpeed: FanSpeed | null;
  activeColor: string;
  buttonClassName: string;
  buttonIconClassName: string;
  isOn: boolean;
  isSmall: boolean;
  onSelect: (speed: FanSpeed) => void;
  theme: ReturnType<typeof useTheme>['theme'];
}

const FanPresetOverflowButton = memo(function FanPresetOverflowButton({
  presets,
  activeSpeed,
  activeColor,
  buttonClassName,
  buttonIconClassName,
  isOn,
  isSmall,
  onSelect,
  theme,
}: FanPresetOverflowButtonProps) {
  const { t } = useI18n();
  const roundControl = getRoundControlStyles(theme);
  const [isOpen, setIsOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<PortalActionDockAnchorRect | null>(null);

  const handleOpen = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setAnchorRect(getPortalActionDockAnchorRect(event.currentTarget));
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setAnchorRect(null);
  }, []);

  return (
    <>
      {isOpen ? (
        <PortalActionDock
          accentColor={activeColor}
          anchorRect={anchorRect}
          onClose={handleClose}
          title={t('lighting.fanSpeed')}
        >
          <fieldset
            className="flex flex-wrap items-center justify-center gap-2"
            aria-label={t('lighting.fanPresets')}
          >
            {presets.map(({ speed, labelKey }) => {
              const active = activeSpeed === speed;

              return (
                <button
                  key={speed}
                  type="button"
                  aria-label={t('lighting.fanPreset', { preset: t(labelKey) })}
                  aria-pressed={active}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(speed);
                    handleClose();
                  }}
                  style={
                    active ? getBrightnessPresetSelectedStyle(theme, activeColor, true) : undefined
                  }
                  className={`${buttonClassName} relative flex shrink-0 items-center justify-center rounded-full transition-[color,background-color,border-color,box-shadow,opacity,transform,filter] duration-300 ${
                    active
                      ? roundControl.selectedText
                      : `${roundControl.softButton} cursor-pointer hover:scale-105 active:scale-95`
                  }`}
                >
                  <FanSpeedPresetContent speed={speed} isSmall={isSmall} />
                </button>
              );
            })}
          </fieldset>
        </PortalActionDock>
      ) : null}
      <button
        type="button"
        disabled={!isOn}
        aria-label={t('lighting.moreFanPresets')}
        onClick={handleOpen}
        className={`${buttonClassName} rounded-full transition-[color,background-color,border-color,box-shadow,opacity,transform,filter] duration-300 flex items-center justify-center ${
          !isOn
            ? roundControl.softDisabledButton
            : `${roundControl.softButton} cursor-pointer hover:scale-105 active:scale-95`
        }`}
      >
        <MoreHorizontal className={buttonIconClassName} />
      </button>
    </>
  );
});

export const FanCard = memo(function FanCard({
  id,
  name,
  room,
  providerId,
  initialState = false,
  initialPercentage = 0,
  size,
  onSizeChange: _onSizeChange,
  isEditMode,
}: FanCardProps) {
  const { t } = useI18n();
  const { theme, colors, accentColor } = useTheme();
  const providerEntity = useProviderEntityModel(id);
  const providerState = providerEntity?.attributes as Record<string, unknown> | undefined;
  const currentProviderId = useIntegrationStore((state) => state.currentProviderId);
  const resolvedProviderId =
    providerEntity?.providerId ??
    providerId ??
    parseProviderScopedId(id)?.providerId ??
    currentProviderId;
  const rawEntity = useProviderEntitySnapshot(id);
  const rawAttributes = rawEntity?.attributes as Record<string, unknown> | undefined;
  const { siblingIds: siblingEntityIds } = useProviderClimateTopology(id);
  const siblingEntityRecord = useProviderEntitySnapshotRecord(siblingEntityIds, {
    providerId: resolvedProviderId,
    enabled: resolvedProviderId === 'home_assistant' && siblingEntityIds.length > 0,
  });
  const runAction = useServiceActionHandler();
  const resolvedSize = resolveFanCardSize(size);
  const [isOn, setIsOn] = useState(initialState);
  const [percentage, setPercentage] = useState(clampPercentage(initialPercentage));
  const [rememberedPercentage, setRememberedPercentage] = useState(() =>
    Math.max(1, clampPercentage(initialPercentage) || FAN_SPEED_PERCENTAGES.medium)
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { selectedIcon, setSelectedIcon, tintColor, setTintColor, HeaderIconComponent } =
    useSwitchCardAppearance({
      id,
      isScript: false,
      defaultIconName: 'Fan',
    });
  const isSmall = isCompactCardSize(resolvedSize);
  const supportsFanSpeed =
    providerEntity?.capabilities.includes('fan_speed') === true ||
    typeof rawAttributes?.percentage === 'number' ||
    typeof rawAttributes?.percentage_step === 'number';
  const fanDirection = readFanDirection(rawAttributes?.direction);
  const fanOscillating = supportsOscillation(rawAttributes?.oscillating)
    ? rawAttributes.oscillating
    : undefined;
  const livePercentage =
    typeof rawAttributes?.percentage === 'number'
      ? rawAttributes.percentage
      : rawEntity
        ? undefined
        : typeof providerState?.percentage === 'number'
          ? providerState.percentage
          : undefined;
  const liveIsOn =
    rawEntity?.state === 'on'
      ? true
      : rawEntity?.state === 'off'
        ? false
        : providerState?.value === 'on' || providerState?.on === true;
  const hasAdvancedFanControls = fanDirection !== undefined || fanOscillating !== undefined;
  const siblingEntities = siblingEntityIds
    .map((entityId) => {
      const entity = siblingEntityRecord[entityId];
      return entity ? { id: entityId, entity } : null;
    })
    .filter((entry): entry is SwitchSiblingEntity => entry !== null);
  const hasRelatedHelpers = useIntegrationStore(
    (state) =>
      selectRelatedHelpers(
        providerEntity,
        state.providerEntitiesByProviderId[resolvedProviderId] ?? {}
      ).length > 0
  );
  const showsSettingsButton =
    supportsFanSpeed ||
    hasAdvancedFanControls ||
    siblingEntities.length > 0 ||
    hasRelatedHelpers ||
    isEditMode;

  useEffect(() => {
    if (!providerState) {
      setIsOn(initialState);
      setPercentage(clampPercentage(initialPercentage));
      if (clampPercentage(initialPercentage) > 0) {
        setRememberedPercentage(clampPercentage(initialPercentage));
      }
      return;
    }

    setIsOn(liveIsOn);
    if (typeof livePercentage === 'number') {
      const nextPercentage = clampPercentage(livePercentage);
      setPercentage(nextPercentage);
      if (nextPercentage > 0) {
        setRememberedPercentage(nextPercentage);
      }
    }
  }, [initialPercentage, initialState, liveIsOn, livePercentage, providerState]);

  const updatePower = useCallback(
    (nextIsOn: boolean) => {
      setIsOn(nextIsOn);
      if (nextIsOn) {
        setPercentage((currentPercentage) =>
          currentPercentage > 0 ? currentPercentage : rememberedPercentage
        );
      }

      void runAction(
        async () => {
          await dispatchEntityCommand(
            {
              type: nextIsOn ? 'turn_on' : 'turn_off',
              entityId: id,
            },
            providerId
          );
        },
        t('lighting.feedback.updateSwitchFailed'),
        {
          onError: () => setIsOn(!nextIsOn),
        }
      );
    },
    [id, providerId, rememberedPercentage, runAction, t]
  );

  const updateSpeed = useCallback(
    (nextPercentage: number) => {
      const clampedPercentage = Math.max(1, clampPercentage(nextPercentage));
      const previousIsOn = isOn;
      setIsOn(true);
      setPercentage(clampedPercentage);
      setRememberedPercentage(clampedPercentage);
      void runAction(
        async () => {
          await dispatchEntityCommand(
            {
              type: 'set_fan_speed',
              entityId: id,
              percentage: clampedPercentage,
            },
            providerId
          );
        },
        t('lighting.feedback.updateSwitchFailed'),
        {
          onError: () => {
            setIsOn(previousIsOn);
            setPercentage(percentage);
          },
        }
      );
    },
    [id, isOn, percentage, providerId, runAction, t]
  );

  const updateSpeedPreset = useCallback(
    (speed: FanSpeed) => {
      updateSpeed(FAN_SPEED_PERCENTAGES[speed]);
    },
    [updateSpeed]
  );

  const previewSpeed = useCallback((nextPercentage: number) => {
    setIsOn(true);
    setPercentage(Math.max(1, clampPercentage(nextPercentage)));
  }, []);

  const cardInteraction = useEntityCardInteractionController({
    ariaLabel: name,
    ariaPressed: isOn,
    isEditMode,
    onToggle: () => updatePower(!isOn),
    onOpenControls: () => undefined,
    onOpenSettings: showsSettingsButton ? () => setIsSettingsOpen(true) : undefined,
  });
  useEditModeSettingsRequest(
    id,
    showsSettingsButton ? () => setIsSettingsOpen(true) : () => undefined,
    isEditMode
  );
  const cardShell = getCardShellSurfaceTokens(theme);
  const stateSurface = getCardStateSurfaceTokens(theme, isOn);
  const fanAccentColor = tintColor || '#38bdf8';
  const surfaceTokens = getLightCardSurfaceTokens({
    isOn,
    selectedColor: null,
    currentColor: isOn ? fanAccentColor : null,
    theme,
    lightColors: colors.light,
    accentColor,
  });
  const displayedPercentage = isOn
    ? Math.max(1, percentage || rememberedPercentage || FAN_SPEED_PERCENTAGES.low)
    : 0;
  const activeSpeed = resolveFanSpeed(isOn, displayedPercentage);
  const actionSize = getCardActionControlSizes(isSmall ? 'small' : 'medium');
  const activeSpeedColor = fanAccentColor;
  const FanIcon = HeaderIconComponent ?? Fan;
  const effectiveTheme = theme === 'light' && isOn ? 'dark' : theme;
  const useInverseForeground = theme === 'light' && isOn;
  const roundControl = getRoundControlStyles(effectiveTheme);
  const sliderSize = resolvedSize === 'extra-small' ? 'extra-small' : isSmall ? 'small' : 'medium';
  const disabledSelectedClasses = 'cursor-not-allowed text-white opacity-70';
  const showFanPresets = supportsFanSpeed && !hasAdvancedFanControls;
  const showPresetOverflow = supportsFanSpeed && hasAdvancedFanControls;
  const directionLabel = t(
    fanDirection === 'reverse' ? 'lighting.fanDirection.reverse' : 'lighting.fanDirection.forward'
  );
  const directionIsReverse = fanDirection === 'reverse';
  const isExtraSmall = resolvedSize === 'extra-small';
  const hasActionRowButtons =
    fanDirection !== undefined ||
    fanOscillating !== undefined ||
    showFanPresets ||
    showPresetOverflow;

  const setFanDirection = useCallback(
    async (direction: 'forward' | 'reverse') => {
      await invokeIntegrationNativeAction({
        entityId: id,
        domain: 'fan',
        service: 'set_direction',
        serviceData: { direction },
      });
    },
    [id]
  );

  const setFanOscillation = useCallback(
    async (oscillating: boolean) => {
      await invokeIntegrationNativeAction({
        entityId: id,
        domain: 'fan',
        service: 'oscillate',
        serviceData: { oscillating },
      });
    },
    [id]
  );

  return (
    <>
      <BaseCard
        size={resolvedSize}
        {...cardInteraction.cardProps}
        interactive={!isEditMode}
        isActive={isOn && theme !== 'black'}
        activeColor={surfaceTokens.glowColor}
        className={`relative z-10 ${CARD_VISUAL_TRANSITION_CLASS} ${!isEditMode ? 'cursor-pointer' : ''}`}
        frameClassName={`${cardShell.rootFrameClassName} ${surfaceTokens.cardClassName}`}
        style={surfaceTokens.cardStyle}
        disableDefaultSheen
        overlay={
          <>
            {surfaceTokens.activeGlowClassName ? (
              <div
                className={surfaceTokens.activeGlowClassName}
                style={surfaceTokens.activeGlowStyle}
              />
            ) : null}
            {surfaceTokens.innerOverlayClassName ? (
              <div
                className={surfaceTokens.innerOverlayClassName}
                style={surfaceTokens.innerOverlayStyle}
              />
            ) : null}
            {surfaceTokens.shineOverlayClassName ? (
              <div className={surfaceTokens.shineOverlayClassName} />
            ) : null}
          </>
        }
        contentClassName="h-full"
      >
        <div className="relative h-full flex flex-col">
          <EntityCardHeader
            title={name}
            subtitle={t('climate.mode.fan')}
            layout="eyebrow-first"
            size={isSmall ? resolvedSize : 'medium'}
            compact={isExtraSmall}
            tone={isOn ? 'primary' : 'neutral'}
            accentColor={surfaceTokens.contentAccentColor}
            titleClassName={stateSurface.primaryTextClassName}
            subtitleClassName={stateSurface.mutedTextClassName}
            titleStyle={useInverseForeground ? { color: '#ffffff' } : undefined}
            subtitleStyle={useInverseForeground ? { color: 'rgba(255,255,255,0.76)' } : undefined}
            leading={
              <EntityCardHeaderIcon
                IconComponent={FanIcon}
                isActive={isOn}
                size={isExtraSmall ? 'tiny' : isSmall ? resolvedSize : 'medium'}
                tone={isOn ? 'primary' : 'neutral'}
                baseColor={surfaceTokens.contentAccentColor}
                themeOverride={effectiveTheme}
                inverseSurface={useInverseForeground}
                ariaLabel={cardInteraction.iconButtonProps['aria-label']}
                onClick={cardInteraction.iconButtonProps.onClick}
              />
            }
          />

          <div className={`flex-1 flex flex-col justify-end ${isExtraSmall ? 'gap-2' : 'gap-4'}`}>
            {supportsFanSpeed ? (
              isExtraSmall ? (
                <div className="flex min-h-5 items-center gap-1.5">
                  <div className="min-w-0 flex-1">
                    <BrightnessSlider
                      value={displayedPercentage}
                      onChange={previewSpeed}
                      onCommit={updateSpeed}
                      isOn={isOn}
                      min={0}
                      size="extra-small"
                      showLabel={false}
                      activeColor={surfaceTokens.contentAccentColor}
                      labelKey="lighting.fanSpeed"
                    />
                  </div>

                  {showsSettingsButton ? (
                    <CardSettingsActionButton
                      {...cardInteraction.settingsButtonProps}
                      theme={effectiveTheme}
                      size="extra-small"
                      tone={isOn ? 'default' : 'muted'}
                      variant="soft"
                    />
                  ) : null}
                </div>
              ) : (
                <>
                  <BrightnessSlider
                    value={displayedPercentage}
                    onChange={previewSpeed}
                    onCommit={updateSpeed}
                    isOn={isOn}
                    min={0}
                    size={sliderSize}
                    showLabel
                    activeColor={surfaceTokens.contentAccentColor}
                    labelKey="lighting.fanSpeed"
                  />
                  <CardActionRow
                    theme={effectiveTheme}
                    size={isSmall ? 'small' : 'medium'}
                    leftContent={
                      hasActionRowButtons ? (
                        <CardActionRowGroup>
                          {fanDirection !== undefined ? (
                            <button
                              type="button"
                              aria-label={t('lighting.fanDirection', { direction: directionLabel })}
                              aria-pressed={isOn && directionIsReverse}
                              disabled={!isOn}
                              onClick={(event) => {
                                event.stopPropagation();
                                void setFanDirection(directionIsReverse ? 'forward' : 'reverse');
                              }}
                              style={
                                isOn && directionIsReverse
                                  ? getBrightnessPresetSelectedStyle(
                                      effectiveTheme,
                                      activeSpeedColor,
                                      isOn
                                    )
                                  : undefined
                              }
                              className={`${actionSize.button} relative flex shrink-0 items-center justify-center rounded-full transition-[color,background-color,border-color,box-shadow,opacity,transform,filter] duration-300 ${
                                !isOn
                                  ? directionIsReverse
                                    ? disabledSelectedClasses
                                    : roundControl.softDisabledButton
                                  : directionIsReverse
                                    ? roundControl.selectedText
                                    : `${roundControl.softButton} cursor-pointer hover:scale-105 active:scale-95`
                              }`}
                            >
                              {directionIsReverse ? (
                                <RotateCcw className={actionSize.icon} aria-hidden="true" />
                              ) : (
                                <RotateCw className={actionSize.icon} aria-hidden="true" />
                              )}
                            </button>
                          ) : null}
                          {fanOscillating !== undefined ? (
                            <button
                              type="button"
                              aria-label={t('lighting.fanOscillation', {
                                state: t(fanOscillating ? 'common.on' : 'common.off'),
                              })}
                              aria-pressed={isOn && fanOscillating}
                              disabled={!isOn}
                              onClick={(event) => {
                                event.stopPropagation();
                                void setFanOscillation(!fanOscillating);
                              }}
                              style={
                                isOn && fanOscillating
                                  ? getBrightnessPresetSelectedStyle(
                                      effectiveTheme,
                                      activeSpeedColor,
                                      isOn
                                    )
                                  : undefined
                              }
                              className={`${actionSize.button} relative flex shrink-0 items-center justify-center rounded-full transition-[color,background-color,border-color,box-shadow,opacity,transform,filter] duration-300 ${
                                !isOn
                                  ? fanOscillating
                                    ? disabledSelectedClasses
                                    : roundControl.softDisabledButton
                                  : fanOscillating
                                    ? roundControl.selectedText
                                    : `${roundControl.softButton} cursor-pointer hover:scale-105 active:scale-95`
                              }`}
                            >
                              <Wind className={actionSize.icon} aria-hidden="true" />
                            </button>
                          ) : null}
                          {showFanPresets
                            ? FAN_SPEED_ACTIONS.map(({ speed, labelKey }) => {
                                const active = activeSpeed === speed;

                                return (
                                  <button
                                    key={speed}
                                    type="button"
                                    aria-label={t('lighting.fanPreset', { preset: t(labelKey) })}
                                    aria-pressed={active}
                                    disabled={!isOn}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      updateSpeedPreset(speed);
                                    }}
                                    style={
                                      active
                                        ? getBrightnessPresetSelectedStyle(
                                            effectiveTheme,
                                            activeSpeedColor,
                                            isOn
                                          )
                                        : undefined
                                    }
                                    className={`${actionSize.button} relative flex shrink-0 items-center justify-center rounded-full transition-[color,background-color,border-color,box-shadow,opacity,transform,filter] duration-300 ${
                                      !isOn
                                        ? active
                                          ? disabledSelectedClasses
                                          : roundControl.softDisabledButton
                                        : active
                                          ? roundControl.selectedText
                                          : `${roundControl.softButton} cursor-pointer hover:scale-105 active:scale-95`
                                    }`}
                                  >
                                    <FanSpeedPresetContent speed={speed} isSmall={isSmall} />
                                  </button>
                                );
                              })
                            : null}
                          {showPresetOverflow ? (
                            <FanPresetOverflowButton
                              presets={FAN_SPEED_ACTIONS}
                              activeSpeed={activeSpeed}
                              activeColor={activeSpeedColor}
                              buttonClassName={actionSize.button}
                              buttonIconClassName={actionSize.icon}
                              isOn={isOn}
                              isSmall={isSmall}
                              onSelect={updateSpeedPreset}
                              theme={effectiveTheme}
                            />
                          ) : null}
                        </CardActionRowGroup>
                      ) : undefined
                    }
                    rightContent={
                      showsSettingsButton ? (
                        <div className="relative z-[3]">
                          <CardSettingsActionButton
                            {...cardInteraction.settingsButtonProps}
                            theme={effectiveTheme}
                            size={isSmall ? 'small' : 'medium'}
                            tone={isOn ? 'default' : 'muted'}
                            variant="soft"
                          />
                        </div>
                      ) : undefined
                    }
                  />
                </>
              )
            ) : showsSettingsButton ? (
              <CardActionRow
                theme={effectiveTheme}
                size={isSmall ? 'small' : 'medium'}
                rightContent={
                  showsSettingsButton ? (
                    <div className="relative z-[3]">
                      <CardSettingsActionButton
                        {...cardInteraction.settingsButtonProps}
                        theme={effectiveTheme}
                        size={isSmall ? 'small' : 'medium'}
                        tone={isOn ? 'default' : 'muted'}
                        variant="soft"
                      />
                    </div>
                  ) : undefined
                }
              />
            ) : null}
          </div>
        </div>
      </BaseCard>

      {showsSettingsButton ? (
        <FanSettingsDialog
          excludeHelperEntityIds={siblingEntities.map(({ id }) => id)}
          entityId={id}
          name={name}
          room={room}
          isOpen={isSettingsOpen}
          onOpenChange={setIsSettingsOpen}
          isOn={isOn}
          percentage={displayedPercentage}
          supportsSpeed={supportsFanSpeed}
          onPowerChange={updatePower}
          onSpeedPreview={previewSpeed}
          onSpeedCommit={updateSpeed}
          direction={fanDirection}
          oscillating={fanOscillating}
          onDirectionChange={() => {
            void runAction(
              () => setFanDirection(directionIsReverse ? 'forward' : 'reverse'),
              t('lighting.feedback.updateSwitchFailed')
            );
          }}
          onOscillationChange={() => {
            void runAction(
              () => setFanOscillation(!fanOscillating),
              t('lighting.feedback.updateSwitchFailed')
            );
          }}
          selectedIcon={selectedIcon}
          onIconChange={setSelectedIcon}
          tintColor={tintColor}
          onTintColorChange={setTintColor}
          siblingControls={
            siblingEntities.length > 0 ? (
              <div className="flex flex-col gap-2">
                {siblingEntities.map(({ id: siblingId, entity }) => (
                  <Button
                    key={siblingId}
                    variant="soft"
                    aria-pressed={entity.state === 'on'}
                    onClick={() => {
                      void runAction(async () => {
                        await dispatchEntityCommand(
                          {
                            type: entity.state === 'on' ? 'turn_off' : 'turn_on',
                            entityId: siblingId,
                          },
                          resolvedProviderId
                        );
                      }, t('lighting.feedback.updateSwitchFailed'));
                    }}
                  >
                    {String(entity.attributes?.friendly_name ?? siblingId)}
                  </Button>
                ))}
              </div>
            ) : undefined
          }
        />
      ) : null}
    </>
  );
});
