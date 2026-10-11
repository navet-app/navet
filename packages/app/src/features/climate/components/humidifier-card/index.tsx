import { dispatchEntityCommand } from '@navet/app/commands';
import { CardActionRow, CardActionRowGroup } from '@navet/app/components/patterns/card-action-row';
import { BaseCardDialog, RotaryKnob } from '@navet/app/components/primitives';
import { EntityCardHeader } from '@navet/app/components/primitives/entity-card-header';
import { EntityCardHeaderIcon } from '@navet/app/components/primitives/entity-card-header-icon';
import { RoundControlButton } from '@navet/app/components/primitives/round-control-button';
import { getCardActionControlSizes } from '@navet/app/components/shared/card-action-control-sizes';
import { CardSettingsActionButton } from '@navet/app/components/shared/card-settings-action-button';
import { type CardSize, isCompactCardSize } from '@navet/app/components/shared/card-size-selector';
import { useEditModeSettingsRequest } from '@navet/app/components/shared/edit-mode-settings-request';
import { useEntityCardInteractionController } from '@navet/app/components/shared/entity-card-interaction-controller';
import { getCardReadableTextTokens } from '@navet/app/components/shared/theme/card-readable-text-tokens';
import { getCardShellSurfaceTokens } from '@navet/app/components/shared/theme/card-shell-surface-tokens';
import {
  getCardStateSurfaceStyleTokens,
  getCardStateSurfaceTokens,
} from '@navet/app/components/shared/theme/card-state-surface-tokens';
import { CardWrapper } from '@navet/app/components/ui/card-wrapper';
import { useSwitchCardAppearance } from '@navet/app/features/lighting/components/use-switch-card-appearance';
import {
  useI18n,
  useProviderEntityModel,
  useServiceActionHandler,
  useTheme,
} from '@navet/app/hooks';
import { invokeIntegrationNativeAction } from '@navet/app/services/integration-native-action.service';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import {
  Droplets,
  Home,
  Leaf,
  Minus,
  MoonStar,
  Plus,
  Sliders,
  ThermometerSun,
  Wind,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';

interface HumidifierCardProps {
  id: string;
  name: string;
  room: string;
  providerId?: IntegrationProviderId;
  entityType?: string;
  deviceClass?: string;
  initialState?: boolean;
  initialTargetHumidity?: number;
  minHumidity?: number;
  maxHumidity?: number;
  targetHumidityStep?: number;
  initialMode?: string;
  availableModes?: string[];
  size: CardSize;
  onSizeChange: (id: string, size: CardSize) => void;
  isEditMode: boolean;
}

function clampHumidity(value: number | null | undefined, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function resolveCardSize(size: CardSize): 'small' | 'medium' {
  return size === 'small' ? 'small' : 'medium';
}

function normalizeModeLabel(mode: string): string {
  return mode.replace(/_/g, ' ').replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function getHumidityAccentColor(deviceClass: string | undefined): string {
  return deviceClass === 'dehumidifier' ? '#14b8a6' : '#60a5fa';
}

function getHumidityGlowClassName(deviceClass: string | undefined): string {
  return deviceClass === 'dehumidifier' ? 'bg-teal-400' : 'bg-sky-400';
}

function getHumidifierCardColors(
  isOn: boolean,
  deviceClass: string | undefined,
  theme: 'light' | 'dark' | 'glass' | 'black'
) {
  if (!isOn) {
    if (theme === 'light') {
      return {
        border: 'border-gray-200',
        glow: 'transparent',
        gradient: 'from-gray-100 to-gray-200',
      };
    }

    if (theme === 'glass') {
      return {
        border: 'border-white/22',
        glow: 'transparent',
        gradient:
          'from-[rgba(255,255,255,0.18)] via-[rgba(255,255,255,0.08)] to-[rgba(8,14,24,0.08)]',
      };
    }

    if (theme === 'black') {
      return {
        border: 'border-white/6',
        glow: 'transparent',
        gradient: 'from-black via-black to-zinc-950',
      };
    }

    return {
      border: 'border-zinc-700',
      glow: 'transparent',
      gradient: 'from-zinc-800 to-zinc-900',
    };
  }

  if (theme === 'light') {
    return deviceClass === 'dehumidifier'
      ? {
          border: 'border-teal-300/26',
          glow: 'from-teal-400/28 via-cyan-300/14',
          gradient: 'from-teal-100 to-cyan-200',
        }
      : {
          border: 'border-sky-300/26',
          glow: 'from-sky-400/28 via-blue-300/14',
          gradient: 'from-sky-100 to-blue-200',
        };
  }

  if (theme === 'glass') {
    return deviceClass === 'dehumidifier'
      ? {
          border: 'border-teal-300/20',
          glow: 'from-teal-400/18 via-cyan-300/10',
          gradient: 'from-teal-800/80 to-cyan-900/90',
        }
      : {
          border: 'border-sky-300/20',
          glow: 'from-sky-400/18 via-blue-300/10',
          gradient: 'from-sky-800/80 to-blue-900/90',
        };
  }

  if (theme === 'black') {
    return deviceClass === 'dehumidifier'
      ? {
          border: 'border-teal-800',
          glow: 'transparent',
          gradient: 'from-teal-950 to-cyan-900',
        }
      : {
          border: 'border-sky-800',
          glow: 'transparent',
          gradient: 'from-sky-950 to-blue-900',
        };
  }

  return deviceClass === 'dehumidifier'
    ? {
        border: 'border-teal-700',
        glow: 'transparent',
        gradient: 'from-teal-900 to-cyan-950',
      }
    : {
        border: 'border-sky-700',
        glow: 'transparent',
        gradient: 'from-sky-900 to-blue-950',
      };
}

function getHumidifierDialogSurface(
  isOn: boolean,
  deviceClass: string | undefined,
  theme: 'light' | 'dark' | 'glass' | 'black'
): { panel: string; border: string } {
  if (theme === 'light') {
    const colors = getHumidifierCardColors(isOn, deviceClass, theme);
    return { panel: `bg-gradient-to-br ${colors.gradient}`, border: colors.border };
  }

  if (!isOn) {
    return {
      panel: 'bg-gradient-to-br from-zinc-900 to-zinc-950 bg-zinc-950',
      border: 'border-white/10',
    };
  }

  return deviceClass === 'dehumidifier'
    ? {
        panel: 'bg-gradient-to-br from-teal-950 to-cyan-950 bg-teal-950',
        border: 'border-teal-700/45',
      }
    : {
        panel: 'bg-gradient-to-br from-sky-950 to-blue-950 bg-sky-950',
        border: 'border-sky-700/45',
      };
}

function getHumidityCardTone(
  isOn: boolean,
  deviceClass: string | undefined
): 'neutral' | 'cyan' | 'blue' {
  if (!isOn) {
    return 'neutral';
  }

  return deviceClass === 'dehumidifier' ? 'cyan' : 'blue';
}

function formatHumidityValue(value: number) {
  return `${Math.round(value)}%`;
}

function getHumidifierModeIcon(mode: string) {
  switch (mode.toLowerCase()) {
    case 'auto':
      return ThermometerSun;
    case 'eco':
      return Leaf;
    case 'home':
      return Home;
    case 'sleep':
      return MoonStar;
    default:
      return null;
  }
}

function getHumidifierModeButtonClass(
  buttonMode: string,
  currentMode: string | undefined,
  isOn: boolean,
  theme: 'light' | 'dark' | 'glass' | 'black'
) {
  const normalizedButtonMode = buttonMode.toLowerCase();
  const normalizedCurrentMode = currentMode?.toLowerCase();
  const isActive = normalizedCurrentMode === normalizedButtonMode;

  if (!isActive || !isOn) {
    return theme === 'light'
      ? 'bg-gray-900/10 text-slate-700 hover:bg-gray-900/20'
      : 'bg-white/10 text-white/78 hover:bg-white/20';
  }

  switch (normalizedButtonMode) {
    case 'eco':
      return '!border-0 shadow-none bg-gradient-to-br from-emerald-400 to-green-600 text-white';
    case 'home':
      return '!border-0 shadow-none bg-gradient-to-br from-sky-400 to-cyan-600 text-white';
    case 'sleep':
      return '!border-0 shadow-none bg-gradient-to-br from-indigo-400 to-violet-600 text-white';
    case 'auto':
      return '!border-0 shadow-none bg-gradient-to-br from-cyan-400 to-blue-600 text-white';
    default:
      return theme === 'light' ? 'bg-gray-100 text-gray-700' : 'bg-white/16 text-white';
  }
}

function HumidifierGauge({
  id,
  isOn,
  targetHumidity,
  minHumidity,
  maxHumidity,
  step,
  size,
  accentColor,
  glowClassName,
  readableTokens,
  onTargetHumidityChange,
  onTargetHumidityCommit,
  label,
}: {
  id: string;
  isOn: boolean;
  targetHumidity: number;
  minHumidity: number;
  maxHumidity: number;
  step: number;
  size: 'small' | 'medium';
  accentColor: string;
  glowClassName: string;
  readableTokens: {
    titleColor: string;
    subtitleColor: string;
  };
  onTargetHumidityChange: (value: number) => void;
  onTargetHumidityCommit: (value: number) => void;
  label: string;
}) {
  const gaugeDockClassName = size === 'small' ? 'right-[-1.9rem]' : 'right-[-0.25rem]';

  return (
    <div
      className={`pointer-events-auto absolute top-1/2 z-[2] h-[7.25rem] w-[2.5rem] -translate-y-1/2 overflow-visible ${gaugeDockClassName}`}
    >
      <RotaryKnob
        id={id}
        value={targetHumidity}
        min={minHumidity}
        max={maxHumidity}
        step={step}
        isOn={isOn}
        ariaLabel={label}
        ariaValueText={formatHumidityValue(targetHumidity)}
        glowClassName={glowClassName}
        bandStrokeWidth={30}
        tickOffsetRem={7.9}
        bandPrimaryColor={readableTokens.titleColor}
        bandSecondaryColor={readableTokens.subtitleColor}
        bandGlowColor={`${accentColor}66`}
        onValueChange={onTargetHumidityChange}
        onValueCommit={onTargetHumidityCommit}
        className="absolute right-[-5.6rem] top-1/2 h-[11.5rem] w-[11.5rem] -translate-y-1/2"
      />
    </div>
  );
}

function HumidifierHumidityControls({
  targetHumidity,
  minHumidity,
  maxHumidity,
  step,
  isOn,
  size,
  onCommit,
}: {
  targetHumidity: number;
  minHumidity: number;
  maxHumidity: number;
  step: number;
  isOn: boolean;
  size: 'small' | 'medium';
  onCommit: (value: number) => void;
}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const controlSizes = getCardActionControlSizes(size);
  const hoverScale = size === 'small' ? 'hover:scale-105' : '';
  const nextDown = clampHumidity(targetHumidity - step, minHumidity, maxHumidity);
  const nextUp = clampHumidity(targetHumidity + step, minHumidity, maxHumidity);

  return (
    <div className="flex items-center gap-2">
      <RoundControlButton
        theme={theme}
        size={size}
        variant="soft"
        onClick={(event) => {
          event.stopPropagation();
          onCommit(nextDown);
        }}
        aria-label={t('climate.humidifier.decreaseTarget')}
        disabled={!isOn}
        className={`${hoverScale} disabled:opacity-50`}
      >
        <Minus className={controlSizes.icon} />
      </RoundControlButton>
      <RoundControlButton
        theme={theme}
        size={size}
        variant="soft"
        onClick={(event) => {
          event.stopPropagation();
          onCommit(nextUp);
        }}
        aria-label={t('climate.humidifier.increaseTarget')}
        disabled={!isOn}
        className={`${hoverScale} disabled:opacity-50`}
      >
        <Plus className={controlSizes.icon} />
      </RoundControlButton>
    </div>
  );
}

function HumidifierModeControls({
  availableModes,
  currentMode,
  isOn,
  size,
  onModeChange,
}: {
  availableModes: string[];
  currentMode: string | undefined;
  isOn: boolean;
  size: 'small' | 'medium';
  onModeChange: (mode: string) => void;
}) {
  const { theme } = useTheme();
  const actionSize = getCardActionControlSizes(size);

  return (
    <CardActionRowGroup>
      {availableModes.map((availableMode) => {
        const active = currentMode === availableMode;
        const ModeIcon = getHumidifierModeIcon(availableMode);

        if (ModeIcon) {
          return (
            <RoundControlButton
              key={availableMode}
              theme={theme}
              size={size}
              variant="soft"
              aria-label={normalizeModeLabel(availableMode)}
              aria-pressed={active}
              onClick={(event) => {
                event.stopPropagation();
                onModeChange(availableMode);
              }}
              className={`disabled:opacity-50 ${getHumidifierModeButtonClass(
                availableMode,
                currentMode,
                isOn,
                theme
              )}`}
            >
              <ModeIcon className={actionSize.icon} />
            </RoundControlButton>
          );
        }

        return (
          <button
            key={availableMode}
            type="button"
            aria-label={normalizeModeLabel(availableMode)}
            aria-pressed={active}
            onClick={(event) => {
              event.stopPropagation();
              onModeChange(availableMode);
            }}
            className={`${actionSize.button} rounded-full border px-3 text-[11px] font-semibold tracking-[0.08em] uppercase transition-[color,background-color,border-color,box-shadow,opacity,transform,filter] duration-300 ${
              active
                ? 'border-white/22 bg-white/16 text-white'
                : 'border-white/10 bg-white/[0.04] text-white/72 hover:bg-white/10'
            }`}
          >
            {normalizeModeLabel(availableMode)}
          </button>
        );
      })}
    </CardActionRowGroup>
  );
}

function HumidifierDialogGauge({
  id,
  isOn,
  targetHumidity,
  currentHumidity,
  minHumidity,
  maxHumidity,
  step,
  accentColor,
  glowClassName,
  readableTokens,
  helperText,
  onTargetHumidityChange,
  onTargetHumidityCommit,
}: {
  id: string;
  isOn: boolean;
  targetHumidity: number;
  currentHumidity: number;
  minHumidity: number;
  maxHumidity: number;
  step: number;
  accentColor: string;
  glowClassName: string;
  readableTokens: {
    titleColor: string;
    subtitleColor: string;
  };
  helperText: string;
  onTargetHumidityChange: (value: number) => void;
  onTargetHumidityCommit: (value: number) => void;
}) {
  return (
    <div className="relative h-[17rem] w-full overflow-hidden">
      <div
        className="pointer-events-none absolute right-[-8.5rem] top-1/2 h-[18rem] w-[18rem] -translate-y-1/2 rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle, ${accentColor}66 0%, ${accentColor}33 42%, transparent 72%)`,
        }}
      />
      <div
        className="pointer-events-none absolute right-[-3.25rem] top-1/2 h-[13rem] w-[10rem] -translate-y-1/2 rounded-full blur-2xl"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${accentColor}2f 42%, ${accentColor}55 100%)`,
        }}
      />
      <div className="absolute bottom-0 left-0 z-[2] inline-flex max-w-[55%] flex-col px-6 pb-12 max-sm:px-3.5">
        <div
          className="text-3xl font-bold leading-none"
          style={{
            color: readableTokens.titleColor,
            textShadow: isOn ? `0 0 14px ${accentColor}55` : 'none',
          }}
        >
          {formatHumidityValue(currentHumidity)}
        </div>

        <div className="mt-0.5 text-xs" style={{ color: readableTokens.subtitleColor }}>
          {helperText}
        </div>
      </div>

      <RotaryKnob
        id={id}
        value={targetHumidity}
        min={minHumidity}
        max={maxHumidity}
        step={step}
        isOn={isOn}
        ariaLabel="Target humidity"
        ariaValueText={formatHumidityValue(targetHumidity)}
        glowClassName={glowClassName}
        tickOffsetRem={10.6}
        bandPrimaryColor={readableTokens.titleColor}
        bandSecondaryColor={readableTokens.subtitleColor}
        bandGlowColor={`${accentColor}66`}
        faceTreatment="soft"
        faceTintColor={accentColor}
        onValueChange={onTargetHumidityChange}
        onValueCommit={onTargetHumidityCommit}
        className="absolute right-[-9.25rem] top-[54%] h-[17rem] w-[17rem] -translate-y-1/2"
      />
    </div>
  );
}

const HumidifierSettingsDialog = memo(function HumidifierSettingsDialog({
  entityId,
  isOpen,
  onOpenChange,
  name,
  entityType,
  isOn,
  targetHumidity,
  minHumidity,
  maxHumidity,
  step,
  mode,
  availableModes,
  currentHumidity,
  statusLabel,
  contentSurface,
  accentColor,
  glowClassName,
  readableTokens,
  onTargetHumidityCommit,
  onTargetHumidityChange,
  onModeChange,
}: {
  entityId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  entityType: string;
  isOn: boolean;
  targetHumidity: number;
  minHumidity: number;
  maxHumidity: number;
  step: number;
  mode: string | undefined;
  availableModes: string[];
  currentHumidity: number;
  statusLabel: string;
  contentSurface: { panel: string; border: string };
  accentColor: string;
  glowClassName: string;
  readableTokens: {
    titleColor: string;
    subtitleColor: string;
  };
  onTargetHumidityCommit: (humidity: number) => void;
  onTargetHumidityChange: (humidity: number) => void;
  onModeChange: (mode: string) => void;
}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const controls = (
    <div className="relative -mx-6 max-sm:-mx-3.5">
      <HumidifierDialogGauge
        id={`${entityId}-dialog`}
        isOn={isOn}
        targetHumidity={targetHumidity}
        currentHumidity={currentHumidity}
        minHumidity={minHumidity}
        maxHumidity={maxHumidity}
        step={step}
        accentColor={accentColor}
        glowClassName={glowClassName}
        readableTokens={readableTokens}
        helperText={statusLabel}
        onTargetHumidityChange={onTargetHumidityChange}
        onTargetHumidityCommit={onTargetHumidityCommit}
      />
      <div className="relative z-10 -mt-6 px-6 max-sm:px-3.5">
        <CardActionRow
          theme={theme}
          size="medium"
          leftContent={
            <div className="flex flex-wrap items-center gap-2">
              <HumidifierHumidityControls
                targetHumidity={targetHumidity}
                minHumidity={minHumidity}
                maxHumidity={maxHumidity}
                step={step}
                isOn={isOn}
                size="medium"
                onCommit={onTargetHumidityCommit}
              />
              <HumidifierModeControls
                availableModes={availableModes}
                currentMode={mode}
                isOn={isOn}
                size="medium"
                onModeChange={onModeChange}
              />
            </div>
          }
        />
      </div>
    </div>
  );

  return (
    <BaseCardDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={name}
      entityId={entityId}
      description={entityType}
      theme={theme}
      navigation="overflow"
      height="capped"
      disableOpenAutoFocus
      contentSurface={contentSurface}
      contentClassName="max-w-[30rem]"
      bodyClassName="px-6 pt-0 pb-6 max-sm:px-3.5 max-sm:pt-0 max-sm:pb-3"
      tabs={[{ key: 'controls', label: t('common.controls'), icon: Sliders, content: controls }]}
    />
  );
});

export const HumidifierCard = memo(function HumidifierCard({
  id,
  name,
  room: _room,
  providerId,
  entityType,
  deviceClass,
  initialState = false,
  initialTargetHumidity = 45,
  minHumidity = 0,
  maxHumidity = 100,
  targetHumidityStep = 1,
  initialMode,
  availableModes = [],
  size,
  onSizeChange: _onSizeChange,
  isEditMode,
}: HumidifierCardProps) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const runAction = useServiceActionHandler();
  const providerEntity = useProviderEntityModel(id);
  const providerState = providerEntity?.attributes as Record<string, unknown> | undefined;
  const resolvedSize = resolveCardSize(size);
  const isSmall = isCompactCardSize(resolvedSize);
  const resolvedMinHumidity = typeof minHumidity === 'number' ? minHumidity : 0;
  const resolvedMaxHumidity = typeof maxHumidity === 'number' ? maxHumidity : 100;
  const sliderStep =
    typeof targetHumidityStep === 'number' && targetHumidityStep > 0 ? targetHumidityStep : 1;
  const [isOn, setIsOn] = useState(initialState);
  const [targetHumidity, setTargetHumidity] = useState(
    clampHumidity(initialTargetHumidity, resolvedMinHumidity, resolvedMaxHumidity)
  );
  const [currentHumidity, setCurrentHumidity] = useState<number | undefined>(undefined);
  const [mode, setMode] = useState(initialMode);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { HeaderIconComponent, headerIconText } = useSwitchCardAppearance({
    id,
    isScript: false,
    defaultIconName: deviceClass === 'dehumidifier' ? 'Wind' : 'Droplets',
  });

  useEffect(() => {
    if (!providerState) {
      setIsOn(initialState);
      setTargetHumidity(
        clampHumidity(initialTargetHumidity, resolvedMinHumidity, resolvedMaxHumidity)
      );
      setCurrentHumidity(undefined);
      setMode(initialMode);
      return;
    }

    setIsOn(providerEntity?.primaryState === 'on' || providerState.value === 'on');
    setTargetHumidity(
      clampHumidity(
        typeof providerState.targetHumidity === 'number'
          ? providerState.targetHumidity
          : initialTargetHumidity,
        resolvedMinHumidity,
        resolvedMaxHumidity
      )
    );
    setCurrentHumidity(
      typeof providerState.currentHumidity === 'number' ? providerState.currentHumidity : undefined
    );
    setMode(typeof providerState.mode === 'string' ? providerState.mode : initialMode);
  }, [
    initialMode,
    initialState,
    initialTargetHumidity,
    providerEntity?.primaryState,
    providerState,
    resolvedMaxHumidity,
    resolvedMinHumidity,
  ]);

  const resolvedAvailableModes = useMemo(() => {
    if (providerState && Array.isArray(providerState.availableModes)) {
      return providerState.availableModes.filter(
        (entry): entry is string => typeof entry === 'string'
      );
    }

    return availableModes;
  }, [availableModes, providerState]);

  const subtitle =
    entityType ??
    (deviceClass === 'dehumidifier'
      ? t('humidifier.type.dehumidifier')
      : t('humidifier.type.humidifier'));
  const humidityAccentColor = getHumidityAccentColor(deviceClass);
  const cardColors = getHumidifierCardColors(isOn, deviceClass, theme);
  const cardShell = getCardShellSurfaceTokens(theme);
  const stateSurface = getCardStateSurfaceTokens(theme, isOn);
  const tone = getHumidityCardTone(isOn, deviceClass);
  const glowClassName = getHumidityGlowClassName(deviceClass);
  const readableTokens = getCardReadableTextTokens({
    theme,
    tone,
    accentColor: humidityAccentColor,
  });
  const stateSurfaceStyle = getCardStateSurfaceStyleTokens({
    theme,
    isActive: isOn,
    baseColor: humidityAccentColor,
    borderAlphaHex: deviceClass === 'dehumidifier' ? '36' : '3a',
    tintMidAlphaHex: deviceClass === 'dehumidifier' ? '10' : '12',
    tintEndAlphaHex: deviceClass === 'dehumidifier' ? '1d' : '20',
    radialAlphaHex: deviceClass === 'dehumidifier' ? '22' : '24',
  });
  const HumidityIcon = HeaderIconComponent ?? (deviceClass === 'dehumidifier' ? Wind : Droplets);
  const targetHumidityValue = clampHumidity(
    targetHumidity,
    resolvedMinHumidity,
    resolvedMaxHumidity
  );
  const currentHumidityValue =
    typeof currentHumidity === 'number'
      ? clampHumidity(currentHumidity, resolvedMinHumidity, resolvedMaxHumidity)
      : undefined;
  const visibleModes = isSmall
    ? resolvedAvailableModes.slice(0, 2)
    : resolvedAvailableModes.slice(0, 3);
  const statusLabel =
    deviceClass === 'dehumidifier'
      ? t('humidifier.status.dryingTo', { humidity: targetHumidityValue })
      : t('humidifier.status.humidifyingTo', { humidity: targetHumidityValue });
  const lightOverlay =
    theme === 'light'
      ? isOn
        ? deviceClass === 'dehumidifier'
          ? 'bg-cyan-50/45'
          : 'bg-sky-50/45'
        : 'bg-white/60'
      : undefined;

  const updatePower = useCallback(
    (nextIsOn: boolean) => {
      setIsOn(nextIsOn);
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
    [id, providerId, runAction, t]
  );

  const updateHumidity = useCallback(
    (nextHumidity: number) => {
      const clampedHumidity = clampHumidity(nextHumidity, resolvedMinHumidity, resolvedMaxHumidity);
      const previousHumidity = targetHumidity;
      const previousIsOn = isOn;
      setTargetHumidity(clampedHumidity);
      setIsOn(true);
      void runAction(
        async () => {
          await invokeIntegrationNativeAction({
            providerId,
            entityId: id,
            domain: 'humidifier',
            service: 'set_humidity',
            serviceData: { humidity: clampedHumidity },
          });
        },
        t('humidifier.feedback.updateHumidityFailed'),
        {
          onError: () => {
            setTargetHumidity(previousHumidity);
            setIsOn(previousIsOn);
          },
        }
      );
    },
    [id, isOn, providerId, resolvedMaxHumidity, resolvedMinHumidity, runAction, t, targetHumidity]
  );

  const updateMode = useCallback(
    (nextMode: string) => {
      const previousMode = mode;
      setMode(nextMode);
      setIsOn(true);
      void runAction(
        async () => {
          await invokeIntegrationNativeAction({
            providerId,
            entityId: id,
            domain: 'humidifier',
            service: 'set_mode',
            serviceData: { mode: nextMode },
          });
        },
        t('humidifier.feedback.updateModeFailed'),
        {
          onError: () => setMode(previousMode),
        }
      );
    },
    [id, mode, providerId, runAction, t]
  );

  const cardInteraction = useEntityCardInteractionController({
    ariaLabel: name,
    ariaPressed: isOn,
    isEditMode,
    onToggle: () => updatePower(!isOn),
    onOpenControls: () => undefined,
    onOpenSettings: () => setIsSettingsOpen(true),
  });
  useEditModeSettingsRequest(id, () => setIsSettingsOpen(true), isEditMode);

  return (
    <>
      <CardWrapper
        interactionProps={cardInteraction.cardProps}
        isActive={isOn}
        activeColor={humidityAccentColor}
        className={`bg-gradient-to-br ${cardColors.gradient} ${cardColors.border} ${stateSurface.containerClassName}`}
        style={stateSurfaceStyle.cardStyle}
        lightOverlayClassName={lightOverlay}
        showShadow={isOn && theme !== 'light'}
      >
        {isOn ? (
          <div
            className={`absolute inset-0 bg-gradient-to-br ${cardColors.glow} to-transparent transition-[color,background-color,border-color,box-shadow,opacity,transform,filter] duration-500`}
          />
        ) : null}
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
        {stateSurface.overlayClassName ? (
          <div className={`absolute inset-0 ${stateSurface.overlayClassName}`} />
        ) : null}

        <div className="relative z-[2] h-full flex flex-col p-3">
          <EntityCardHeader
            title={name}
            subtitle={subtitle}
            layout="eyebrow-first"
            size={resolvedSize}
            tone={tone}
            titleClassName={stateSurface.primaryTextClassName}
            subtitleClassName={stateSurface.mutedTextClassName}
            leading={
              <EntityCardHeaderIcon
                IconComponent={HumidityIcon}
                iconText={headerIconText ?? undefined}
                isActive={isOn}
                size={resolvedSize}
                tone={tone}
                baseColor={humidityAccentColor}
                ariaLabel={cardInteraction.iconButtonProps['aria-label']}
                onClick={cardInteraction.iconButtonProps.onClick}
              />
            }
          />

          <HumidifierGauge
            id={`${id}-humidity`}
            isOn={isOn}
            targetHumidity={targetHumidityValue}
            minHumidity={resolvedMinHumidity}
            maxHumidity={resolvedMaxHumidity}
            step={sliderStep}
            size={isSmall ? 'small' : 'medium'}
            accentColor={humidityAccentColor}
            glowClassName={glowClassName}
            readableTokens={readableTokens}
            onTargetHumidityChange={setTargetHumidity}
            onTargetHumidityCommit={updateHumidity}
            label={t('humidifier.targetHumidity')}
          />

          <div className="flex-1">
            <div className={`relative flex h-full flex-col ${isSmall ? 'gap-1.5' : ''}`}>
              <div className="mt-auto inline-flex w-fit flex-col self-start">
                <div className="min-w-0">
                  <div
                    className={`mb-1 text-3xl font-bold leading-none transition-colors duration-500 ${stateSurface.primaryTextClassName}`}
                    style={{ color: readableTokens.titleColor }}
                  >
                    {formatHumidityValue(currentHumidityValue ?? targetHumidityValue)}
                  </div>
                  <div
                    className={`text-xs ${stateSurface.secondaryTextClassName}`}
                    style={{ color: readableTokens.subtitleColor }}
                  >
                    {statusLabel}
                  </div>
                </div>
              </div>

              <div className={isSmall ? 'pt-2' : 'pt-4'}>
                <CardActionRow
                  theme={theme}
                  size={isSmall ? 'small' : 'medium'}
                  leftContent={
                    <div className="relative z-[3]">
                      <CardActionRowGroup>
                        <HumidifierHumidityControls
                          targetHumidity={targetHumidityValue}
                          minHumidity={resolvedMinHumidity}
                          maxHumidity={resolvedMaxHumidity}
                          step={sliderStep}
                          isOn={isOn}
                          size={isSmall ? 'small' : 'medium'}
                          onCommit={updateHumidity}
                        />
                        <HumidifierModeControls
                          availableModes={visibleModes}
                          currentMode={mode}
                          isOn={isOn}
                          size={isSmall ? 'small' : 'medium'}
                          onModeChange={updateMode}
                        />
                      </CardActionRowGroup>
                    </div>
                  }
                  rightContent={
                    <div className="relative z-[3]">
                      <CardSettingsActionButton
                        {...cardInteraction.settingsButtonProps}
                        theme={theme}
                        size={isSmall ? 'small' : 'medium'}
                        tone={isOn ? 'default' : 'muted'}
                        variant="soft"
                        accentColor={humidityAccentColor}
                      />
                    </div>
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </CardWrapper>

      <HumidifierSettingsDialog
        entityId={id}
        isOpen={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        name={name}
        entityType={subtitle}
        isOn={isOn}
        targetHumidity={targetHumidityValue}
        currentHumidity={currentHumidityValue ?? targetHumidityValue}
        minHumidity={resolvedMinHumidity}
        maxHumidity={resolvedMaxHumidity}
        step={sliderStep}
        mode={mode}
        availableModes={resolvedAvailableModes}
        statusLabel={statusLabel}
        contentSurface={getHumidifierDialogSurface(isOn, deviceClass, theme)}
        accentColor={humidityAccentColor}
        glowClassName={glowClassName}
        readableTokens={readableTokens}
        onTargetHumidityChange={setTargetHumidity}
        onTargetHumidityCommit={updateHumidity}
        onModeChange={updateMode}
      />
    </>
  );
});
