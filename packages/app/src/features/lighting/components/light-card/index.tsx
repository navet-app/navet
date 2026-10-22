import { BaseCard } from '@navet/app/components/primitives';
import { type CardSize, isCompactCardSize } from '@navet/app/components/shared/card-size-selector';
import type { CompanionRowPresentation } from '@navet/app/components/shared/companion-row-presentation';
import { getCardShellSurfaceTokens } from '@navet/app/components/shared/theme/card-shell-surface-tokens';
import { useTheme } from '@navet/app/hooks';
import { useSettingsStore } from '@navet/app/stores';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import { resolveEffectsQuality } from '@navet/app/utils/effects-quality';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { isColorCyclingLightEffect } from './light-card-effect-utils';
import { LightCardMedium } from './light-card-medium';
import { LightCardSmall } from './light-card-small';
import { getLightCardSurfaceTokens } from './light-card-surface-tokens';
import { LightCardTableRow } from './light-card-table-row';
import { kelvinToColor } from './light-card-utils';
import { LightSettingsDialog } from './light-settings-dialog';
import { useLightCardController } from './use-light-card-controller';

const CARD_VISUAL_TRANSITION_CLASS =
  'transition-[background-color,border-color,box-shadow,color,opacity,transform,filter] duration-500';

interface LightCardProps {
  id: string;
  name: string;
  room: string;
  providerId?: IntegrationProviderId;
  initialState?: boolean;
  initialBrightness?: number;
  initialTemp?: number;
  size: CardSize;
  onSizeChange: (id: string, size: CardSize) => void;
  isEditMode: boolean;
  cardTapAction?: 'toggle' | 'controls';
  presentation?: 'card' | 'table-row';
  companion?: CompanionRowPresentation;
  onRemoveCard?: () => void;
  removeCardLabel?: string;
}

function resolveLightCardSize(size: CardSize): CardSize {
  return size === 'large' || size === 'extra-large' || size === 'medium-vertical' ? 'medium' : size;
}

export const LightCard = memo(function LightCard({
  id,
  name,
  room,
  providerId,
  initialState = false,
  initialBrightness = 0,
  initialTemp = 4000,
  size,
  onSizeChange: _onSizeChange,
  isEditMode,
  cardTapAction,
  presentation = 'card',
  companion,
  onRemoveCard,
  removeCardLabel,
}: LightCardProps) {
  const { theme, colors, accentColor } = useTheme();
  const { ambientLightBleed, lowPowerMode, effectsQuality } = useSettingsStore(
    useShallow((state) => ({
      ambientLightBleed: state.ambientLightBleed,
      lowPowerMode: state.lowPowerMode,
      effectsQuality: state.effectsQuality,
    }))
  );
  const [isKelvinMode, setIsKelvinMode] = useState(false);
  const [isColorMode, setIsColorMode] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const kelvinResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvedSize = resolveLightCardSize(size);

  const scheduleKelvinReset = useCallback(() => {
    if (kelvinResetTimerRef.current) clearTimeout(kelvinResetTimerRef.current);
    kelvinResetTimerRef.current = setTimeout(() => {
      setIsKelvinMode(false);
      kelvinResetTimerRef.current = null;
    }, 3000);
  }, []);

  const controller = useLightCardController({
    id,
    name,
    room,
    providerId,
    initialState,
    initialBrightness,
    initialTemp,
    size: resolvedSize,
    isEditMode,
    cardTapAction,
  });
  const cardShell = getCardShellSurfaceTokens(theme);
  const resolvedEffectsQuality = resolveEffectsQuality(effectsQuality, lowPowerMode);
  const showAmbientLightBleed =
    !isEditMode && ambientLightBleed && resolvedEffectsQuality === 'high';
  const surfaceTokens = getLightCardSurfaceTokens({
    isOn: controller.isOn,
    isColorMode,
    selectedColor: controller.selectedColor,
    customColor: controller.customColor,
    currentColor: controller.currentColor,
    theme,
    lightColors: colors.light,
    accentColor,
  });
  const hasColorCyclingEffect = isColorCyclingLightEffect(controller.currentEffect);

  const handleKelvinToggle = useCallback(() => {
    if (!controller.isOn) return;
    setIsKelvinMode((prev) => {
      const next = !prev;
      if (next) {
        scheduleKelvinReset();
      } else if (kelvinResetTimerRef.current) {
        clearTimeout(kelvinResetTimerRef.current);
        kelvinResetTimerRef.current = null;
      }
      return next;
    });
  }, [controller.isOn, scheduleKelvinReset]);

  const handleColorActivate = useCallback(() => {
    if (!controller.isOn) return;
    setIsKelvinMode(false);
    if (kelvinResetTimerRef.current) {
      clearTimeout(kelvinResetTimerRef.current);
      kelvinResetTimerRef.current = null;
    }
    setIsColorMode(true);
  }, [controller.isOn]);

  const handleDialogColorChange = useCallback(
    (color: string) => {
      handleColorActivate();
      controller.onColorChange(color);
    },
    [controller.onColorChange, handleColorActivate]
  );

  const handleDialogCustomColorChange = useCallback(
    (color: string) => {
      handleColorActivate();
      controller.onCustomColorChange(color);
    },
    [controller.onCustomColorChange, handleColorActivate]
  );

  const handleEffectSelect = useCallback(
    (effectValue: string) => {
      setIsKelvinMode(false);
      setIsColorMode(false);
      if (kelvinResetTimerRef.current) {
        clearTimeout(kelvinResetTimerRef.current);
        kelvinResetTimerRef.current = null;
      }
      controller.onEffectSelect(effectValue);
    },
    [controller.onEffectSelect]
  );

  const handleTempChange = useCallback(
    (temp: number) => {
      setIsColorMode(false);
      setIsKelvinMode(true);
      controller.onTempChange(temp);
      scheduleKelvinReset();
    },
    [controller.onTempChange, scheduleKelvinReset]
  );

  const handleTempCommit = useCallback(
    (temp: number) => {
      setIsColorMode(false);
      setIsKelvinMode(true);
      controller.onTempCommit(temp);
      scheduleKelvinReset();
    },
    [controller.onTempCommit, scheduleKelvinReset]
  );

  // Kelvin is a temporary adjustment mode. A committed manual color remains active until
  // temperature or an effect explicitly takes over.
  useEffect(() => {
    if (!isKelvinMode) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setIsKelvinMode(false);
        if (kelvinResetTimerRef.current) {
          clearTimeout(kelvinResetTimerRef.current);
          kelvinResetTimerRef.current = null;
        }
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isKelvinMode]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (kelvinResetTimerRef.current) clearTimeout(kelvinResetTimerRef.current);
    };
  }, []);

  const isSmall = isCompactCardSize(resolvedSize);

  const currentTempColor = kelvinToColor(controller.colorTemp);

  return (
    <>
      <div ref={cardRef} className="relative h-full w-full overflow-visible">
        {!companion && presentation === 'card' && controller.isOn && showAmbientLightBleed && (
          <div
            data-ambient-light-bleed="true"
            aria-hidden="true"
            className={`pointer-events-none absolute -inset-full z-0 blur-3xl transition-[background,opacity,filter] duration-500 ${
              theme !== 'light' ? 'opacity-20' : 'opacity-40'
            }`}
            style={{
              background: `radial-gradient(circle, ${surfaceTokens.glowColor || 'transparent'} 0%, transparent 70%)`,
            }}
          />
        )}

        {companion || presentation === 'table-row' ? (
          <LightCardTableRow
            name={name}
            isOn={controller.isOn}
            brightness={controller.brightness}
            compact={Boolean(companion)}
            disabled={companion?.disabled}
            unavailable={companion?.unavailable}
            stateLabel={companion?.value}
            supportsBrightness={!companion && controller.supportsBrightness}
            activeColor={surfaceTokens.contentAccentColor}
            IconComponent={controller.IconComponent}
            iconText={controller.iconText}
            iconButtonProps={controller.iconButtonProps}
            cardInteraction={controller.cardInteraction}
            onBrightnessChange={controller.onBrightnessChange}
            onBrightnessCommit={controller.onBrightnessCommit}
            isEditMode={isEditMode}
          />
        ) : (
          <BaseCard
            size={resolvedSize}
            {...controller.cardInteraction.cardProps}
            interactive={!isEditMode}
            className={`relative z-10 ${CARD_VISUAL_TRANSITION_CLASS} ${!isEditMode ? 'cursor-pointer' : ''}`}
            frameClassName={`isolate ${cardShell.rootFrameClassName} ${surfaceTokens.cardClassName}`}
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
                {hasColorCyclingEffect ? (
                  <div
                    aria-hidden="true"
                    data-light-color-cycle-effect="true"
                    className="navet-light-card-color-cycle-effect absolute inset-0"
                  />
                ) : null}
              </>
            }
            contentClassName="h-full"
          >
            <div className="relative flex h-full flex-col">
              {isSmall ? (
                <LightCardSmall
                  name={name}
                  room={room}
                  size={resolvedSize}
                  brightness={controller.brightness}
                  currentColor={controller.currentColor}
                  currentEffect={controller.currentEffect}
                  colorSwatchColor={controller.colorSwatchColor}
                  currentTempColor={currentTempColor}
                  brightnessPresets={controller.brightnessPresets}
                  effectOptions={controller.effectOptions}
                  isOn={controller.isOn}
                  activeColor={surfaceTokens.contentAccentColor}
                  IconComponent={controller.IconComponent}
                  iconText={controller.iconText}
                  iconButtonProps={controller.iconButtonProps}
                  settingsButtonProps={controller.settingsButtonProps}
                  showSettingsButton={controller.showSettingsButton}
                  supportsBrightness={controller.supportsBrightness}
                  supportsEffects={controller.supportsEffects}
                  supportsColorControl={controller.supportsColorControl}
                  supportsColorTemperature={controller.supportsColorTemperature}
                  colorTemp={controller.colorTemp}
                  minColorTemp={controller.minColorTemp}
                  maxColorTemp={controller.maxColorTemp}
                  isKelvinMode={isKelvinMode}
                  isColorMode={isColorMode}
                  onKelvinToggle={handleKelvinToggle}
                  onColorActivate={handleColorActivate}
                  onBrightnessChange={controller.onBrightnessChange}
                  onBrightnessCommit={controller.onBrightnessCommit}
                  onColorChange={controller.onColorChange}
                  onEffectSelect={handleEffectSelect}
                  onTempChange={handleTempChange}
                  onTempCommit={handleTempCommit}
                />
              ) : (
                <LightCardMedium
                  name={name}
                  brightness={controller.brightness}
                  currentColor={controller.currentColor}
                  currentEffect={controller.currentEffect}
                  colorSwatchColor={controller.colorSwatchColor}
                  currentTempColor={currentTempColor}
                  brightnessPresets={controller.brightnessPresets}
                  effectOptions={controller.effectOptions}
                  isOn={controller.isOn}
                  activeColor={surfaceTokens.contentAccentColor}
                  IconComponent={controller.IconComponent}
                  iconText={controller.iconText}
                  iconButtonProps={controller.iconButtonProps}
                  settingsButtonProps={controller.settingsButtonProps}
                  showSettingsButton={controller.showSettingsButton}
                  showPresetOverflow={controller.showPresetOverflow}
                  supportsBrightness={controller.supportsBrightness}
                  supportsEffects={controller.supportsEffects}
                  supportsColorControl={controller.supportsColorControl}
                  supportsColorTemperature={controller.supportsColorTemperature}
                  colorTemp={controller.colorTemp}
                  minColorTemp={controller.minColorTemp}
                  maxColorTemp={controller.maxColorTemp}
                  isKelvinMode={isKelvinMode}
                  isColorMode={isColorMode}
                  onKelvinToggle={handleKelvinToggle}
                  onColorActivate={handleColorActivate}
                  onBrightnessChange={controller.onBrightnessChange}
                  onBrightnessCommit={controller.onBrightnessCommit}
                  onColorChange={controller.onColorChange}
                  onEffectSelect={handleEffectSelect}
                  onTempChange={handleTempChange}
                  onTempCommit={handleTempCommit}
                />
              )}
            </div>
          </BaseCard>
        )}
      </div>

      {controller.isOpen ? (
        <LightSettingsDialog
          onRemoveCard={onRemoveCard}
          removeCardLabel={removeCardLabel}
          entityId={id}
          isOpen={controller.isOpen && !companion?.disabled}
          onOpenChange={controller.onOpenChange}
          name={name}
          room={room}
          isOn={controller.isOn}
          onPowerChange={controller.onPowerChange}
          supportsBrightness={controller.supportsBrightness}
          supportsColorTemperature={controller.supportsColorTemperature}
          supportsColorControl={controller.supportsColorControl}
          minColorTemp={controller.minColorTemp}
          maxColorTemp={controller.maxColorTemp}
          colorTemp={controller.colorTemp}
          brightnessPresets={controller.brightnessPresets}
          currentEffect={controller.currentEffect}
          effectOptions={controller.effectOptions}
          selectedColor={controller.selectedColor}
          customColor={controller.customColor}
          brightness={controller.brightness}
          selectedIcon={controller.selectedIcon}
          tempOptions={controller.tempOptions}
          onTempChange={handleTempChange}
          onTempCommit={handleTempCommit}
          onColorChange={handleDialogColorChange}
          onCustomColorChange={handleDialogCustomColorChange}
          onEffectSelect={handleEffectSelect}
          onBrightnessChange={controller.onBrightnessChange}
          onBrightnessCommit={controller.onBrightnessCommit}
          applyBrightnessPresetsToAll={controller.applyBrightnessPresetsToAll}
          onApplyBrightnessPresetsToAllChange={controller.onApplyBrightnessPresetsToAllChange}
          onBrightnessPresetValueChange={controller.onBrightnessPresetValueChange}
          onBrightnessPresetOrderChange={controller.onBrightnessPresetOrderChange}
          onIconChange={controller.onIconChange}
          tintColor={controller.tintColor}
          onTintColorChange={controller.onTintColorChange}
          supportsEffects={controller.supportsEffects}
        />
      ) : null}
    </>
  );
});
