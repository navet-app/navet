import { CardDialogBody, CardDialogHeader } from '@navet/app/components/patterns/card-dialog';
import {
  BaseCard,
  EntityCardHeader,
  EntityCardHeaderIcon,
  SlideAction,
} from '@navet/app/components/primitives';
import { BaseCardDialog } from '@navet/app/components/primitives/Cards/BaseCardDialog';
import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import {
  type EntityCardDialogControl,
  useEntityCardDialogState,
} from '@navet/app/components/shared/entity-card-dialog';
import { useEntityCardInteractionController } from '@navet/app/components/shared/entity-card-interaction-controller';
import {
  getCardReadableTextTokens,
  resolveCardToneBaseColor,
} from '@navet/app/components/shared/theme/card-readable-text-tokens';
import { getCardShellSurfaceTokens } from '@navet/app/components/shared/theme/card-shell-surface-tokens';
import { getCardStateSurfaceStyleTokens } from '@navet/app/components/shared/theme/card-state-surface-tokens';
import { withTintAlpha } from '@navet/app/components/shared/theme/custom-card-tint-surface';
import { getEntityIconPillStyles } from '@navet/app/components/shared/theme/entity-icon-pill-styles';
import { getLightCardSurfaceTokens } from '@navet/app/components/shared/theme/light-card-surface-tokens';
import { readNavetLockState } from '@navet/app/core/navet-device-state';
import {
  useI18n,
  useIntegrationStore,
  useProviderEntityModel,
  useServiceActionHandler,
  useTheme,
} from '@navet/app/hooks';
import { integrationSecurityFeatureService } from '@navet/app/services/integration-security-feature.service';
import { CarFront, Check, Loader2, Lock, Unlock } from 'lucide-react';
import { type CSSProperties, memo, useEffect, useState } from 'react';
import { getSecurityCardSurfaceTokens } from './security-card-surface-tokens';

interface LockCardProps {
  dialog?: EntityCardDialogControl;
  id: string;
  name: string;
  room: string;
  initialState?: boolean; // true = locked, false = unlocked
  size?: CardSize;
  isEditMode?: boolean;
}

function resolveLockCardSize(_size: CardSize): 'small' {
  return 'small';
}

function isVehicleLockEntity(
  entityId: string,
  name: string,
  presentation: 'vehicle' | 'standard' | undefined
) {
  if (presentation === 'vehicle') {
    return true;
  }

  const haystack = `${entityId} ${name}`.toLowerCase();

  return [
    'car',
    'vehicle',
    'tesla',
    'volvo',
    'bmw',
    'audi',
    'mercedes',
    'trunk',
    'boot',
    'frunk',
  ].some((token) => haystack.includes(token));
}

function getLockSliderStyles(
  theme: 'light' | 'dark' | 'glass' | 'black',
  accentColor: string
): {
  progressFillStyle: CSSProperties;
  trackStyle: CSSProperties;
} {
  if (theme === 'light') {
    return {
      trackStyle: {
        backgroundColor: withTintAlpha(accentColor, 0.1),
        borderColor: withTintAlpha(accentColor, 0.22),
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.52)',
      },
      progressFillStyle: {
        backgroundColor: withTintAlpha(accentColor, 0.22),
      },
    };
  }

  if (theme === 'glass') {
    return {
      trackStyle: {
        backgroundColor: withTintAlpha(accentColor, 0.1),
        borderColor: withTintAlpha(accentColor, 0.18),
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
      },
      progressFillStyle: {
        backgroundColor: withTintAlpha(accentColor, 0.2),
      },
    };
  }

  if (theme === 'black') {
    return {
      trackStyle: {
        backgroundColor: withTintAlpha(accentColor, 0.1),
        borderColor: withTintAlpha(accentColor, 0.18),
      },
      progressFillStyle: {
        backgroundColor: withTintAlpha(accentColor, 0.18),
      },
    };
  }

  return {
    trackStyle: {
      backgroundColor: withTintAlpha(accentColor, 0.11),
      borderColor: withTintAlpha(accentColor, 0.2),
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
    },
    progressFillStyle: {
      backgroundColor: withTintAlpha(accentColor, 0.2),
    },
  };
}

export const LockCard = memo(function LockCard({
  id,
  name,
  initialState = true,
  size = 'small',
  isEditMode = false,
  dialog,
}: Omit<LockCardProps, 'room'>) {
  const [dialogOpen, setDialogOpen] = useEntityCardDialogState(dialog);
  const [isLocked, setIsLocked] = useState(initialState);
  const [pendingTargetLocked, setPendingTargetLocked] = useState<boolean | null>(null);
  const [isPendingAction, setIsPendingAction] = useState(false);
  const providerEntity = useProviderEntityModel(id);
  const providerState = readNavetLockState(providerEntity);
  const connected = useIntegrationStore((state) =>
    providerEntity ? state.providerRuntime[providerEntity.providerId]?.connected : true
  );
  const unavailable = Boolean(
    providerEntity && (!connected || providerEntity.availability !== 'available')
  );
  const interaction = useEntityCardInteractionController({
    ariaLabel: name,
    isEditMode: isEditMode || unavailable,
    onOpenControls: () => setDialogOpen(true),
    onOpenSettings: () => setDialogOpen(true),
  });
  const { t } = useI18n();
  const runAction = useServiceActionHandler();

  useEffect(() => {
    if (typeof providerState?.locked === 'boolean') {
      if (providerState.value !== 'locked' && providerState.value !== 'unlocked') {
        return;
      }

      const nextIsLocked = providerState.locked;
      setIsLocked(nextIsLocked);
      if (pendingTargetLocked === nextIsLocked) {
        setPendingTargetLocked(null);
        setIsPendingAction(false);
      }
      return;
    }

    setIsLocked(initialState);
    setPendingTargetLocked(null);
    setIsPendingAction(false);
  }, [initialState, pendingTargetLocked, providerState?.locked, providerState?.value]);

  const { theme, colors } = useTheme();
  const cardShell = getCardShellSurfaceTokens(theme);
  const securitySurface = getSecurityCardSurfaceTokens(theme);
  const resolvedSize = resolveLockCardSize(size);
  const isVehicleLock = isVehicleLockEntity(id, name, providerState?.presentation);
  const displayIsLocked = pendingTargetLocked ?? isLocked;
  const IconComponent = isVehicleLock ? CarFront : displayIsLocked ? Lock : Unlock;
  const pendingLabel =
    pendingTargetLocked === null
      ? null
      : pendingTargetLocked
        ? t('security.locking')
        : t('security.unlocking');
  const statusLabel =
    pendingLabel ?? (displayIsLocked ? t('security.locked') : t('security.unlocked'));
  const swipeLabel = isLocked ? t('security.slideToUnlock') : t('security.slideToLock');
  const cardColors = displayIsLocked ? colors.lock.locked : colors.lock.unlocked;
  const stateIconClassName =
    theme === 'light'
      ? displayIsLocked
        ? 'text-green-700'
        : 'text-red-700'
      : theme === 'glass'
        ? displayIsLocked
          ? 'text-green-100'
          : 'text-red-100'
        : displayIsLocked
          ? 'text-green-300'
          : 'text-red-300';
  const headerTone = displayIsLocked ? 'green' : 'red';
  const activeBaseColor = resolveCardToneBaseColor({ tone: headerTone });
  const effectiveTheme = theme === 'light' ? 'dark' : theme;
  const useInverseForeground = theme === 'light';
  const lockAccentColor = displayIsLocked ? '#22c55e' : '#ef4444';
  const lightThemeSurfaceTokens = getLightCardSurfaceTokens({
    isOn: true,
    selectedColor: null,
    currentColor: lockAccentColor,
    theme,
    lightColors: colors.light,
    accentColor: activeBaseColor,
  });
  const blackActiveSurface =
    theme === 'black'
      ? getCardStateSurfaceStyleTokens({
          theme,
          isActive: true,
          baseColor: activeBaseColor,
          borderAlphaHex: '47',
        })
      : null;

  const handleToggleLock = () => {
    if (isEditMode || isPendingAction || unavailable) {
      return;
    }

    const nextLocked = !isLocked;
    const nextState: 'locked' | 'unlocked' = nextLocked ? 'locked' : 'unlocked';
    setPendingTargetLocked(nextLocked);
    setIsPendingAction(true);

    void runAction(
      async () => {
        if (nextState === 'locked') {
          await integrationSecurityFeatureService.lockEntity(id);
        } else {
          await integrationSecurityFeatureService.unlockEntity(id);
        }
        if (typeof providerState?.locked !== 'boolean') {
          setIsLocked(nextLocked);
          setPendingTargetLocked(null);
          setIsPendingAction(false);
        }
      },
      t('security.feedback.updateLockFailed'),
      {
        onError: () => {
          setPendingTargetLocked(null);
          setIsPendingAction(false);
        },
      }
    ).finally(() => {
      if (typeof providerState?.locked !== 'boolean') {
        setIsPendingAction(false);
      }
    });
  };

  const topNameClassName = `${securitySurface.primaryTextClassName} truncate font-semibold tracking-[-0.02em]`;
  const overlayTintClassName = securitySurface.lockCardOverlay;
  const heroPlateClassName =
    theme === 'light'
      ? 'border-slate-200 bg-white shadow-[0_18px_36px_-24px_rgba(15,23,42,0.22)]'
      : 'border-white/10 bg-black/18 shadow-[0_18px_36px_-24px_rgba(0,0,0,0.66)]';
  const heroInnerRingClassName = theme === 'light' ? 'border-slate-200/80' : 'border-white/10';
  const headerLeading = (
    <EntityCardHeaderIcon
      IconComponent={IconComponent}
      isActive
      size={resolvedSize}
      tone={headerTone}
      baseColor={activeBaseColor}
      themeOverride={effectiveTheme}
      inverseSurface={useInverseForeground}
    />
  );
  const headerTitleClassName = displayIsLocked
    ? `${securitySurface.primaryTextClassName} tracking-[-0.02em]`
    : `${securitySurface.lockStatusText} tracking-[-0.02em]`;
  const headerSubtitleClassName = displayIsLocked
    ? stateIconClassName
    : `${securitySurface.lockStatusSubtext} font-semibold uppercase tracking-[0.16em]`;
  const headerTitleStyle = useInverseForeground ? { color: '#ffffff' } : undefined;
  const headerSubtitleStyle = useInverseForeground
    ? { color: 'rgba(255,255,255,0.76)' }
    : undefined;
  const slideThumbTokens = getEntityIconPillStyles({
    isActive: true,
    isInteractive: false,
    primaryColor: 'custom',
    baseColor: activeBaseColor,
    size: resolvedSize,
    theme: effectiveTheme,
    tone: headerTone,
    inverseSurface: useInverseForeground,
  });
  const slideLabelTokens = getCardReadableTextTokens({
    theme,
    tone: headerTone,
    baseColor: activeBaseColor,
  });
  const lockSliderStyles = getLockSliderStyles(theme, activeBaseColor);

  const lockControl = (
    <SlideAction
      actionLabel={swipeLabel}
      ariaLabel={swipeLabel}
      completionIcon={Check}
      disabled={isEditMode || isPendingAction || unavailable}
      labelStyle={{ color: slideLabelTokens.titleColor }}
      onComplete={handleToggleLock}
      progressFillClassName={securitySurface.lockSliderFillBg}
      progressFillStyle={lockSliderStyles.progressFillStyle}
      size="small"
      theme={theme}
      trackClassName={securitySurface.sliderTrackClassName}
      trackStyle={lockSliderStyles.trackStyle}
      thumbClassName={slideThumbTokens.badgeClassName}
      thumbIconClassName={slideThumbTokens.iconClassName}
      thumbIconStyle={slideThumbTokens.iconStyle}
      thumbStyle={slideThumbTokens.badgeStyle}
    />
  );
  return (
    <>
      {!dialog ? (
        <BaseCard
          {...interaction.cardProps}
          size="small"
          className={`${isPendingAction ? 'opacity-80' : ''}`}
          frameClassName={
            theme === 'light'
              ? `${cardShell.rootFrameClassName} ${lightThemeSurfaceTokens.cardClassName}`
              : `${cardShell.rootFrameClassName} bg-linear-to-br ${cardColors.gradient} ${cardColors.border} ${securitySurface.containerShadowClassName}`
          }
          style={
            theme === 'light'
              ? lightThemeSurfaceTokens.cardStyle
              : displayIsLocked && blackActiveSurface
                ? blackActiveSurface.cardStyle
                : undefined
          }
          disableDefaultSheen
          overlay={
            <>
              {theme === 'light' ? null : (
                <div
                  className={`absolute inset-0 bg-linear-to-b ${cardColors.glow} via-transparent to-transparent transition-[color,background-color,border-color,box-shadow,opacity,transform,filter] duration-500`}
                />
              )}
              {theme === 'light' ? null : displayIsLocked &&
                blackActiveSurface?.innerOverlayClassName ? (
                <div
                  className={blackActiveSurface.innerOverlayClassName}
                  style={blackActiveSurface.innerOverlayStyle}
                />
              ) : null}
              {theme === 'light' ? null : (
                <div className={`absolute inset-0 ${overlayTintClassName}`} />
              )}
              {theme === 'light' ? null : displayIsLocked &&
                blackActiveSurface?.shineOverlayClassName ? (
                <div className={blackActiveSurface.shineOverlayClassName} />
              ) : null}
            </>
          }
        >
          <div className="relative flex h-full min-h-0 flex-col">
            <EntityCardHeader
              title={name}
              subtitle={statusLabel}
              layout="eyebrow-first"
              size="small"
              tone={headerTone}
              accentColor={activeBaseColor}
              leading={headerLeading}
              titleClassName={`${topNameClassName} ${headerTitleClassName}`}
              subtitleClassName={headerSubtitleClassName}
              titleStyle={headerTitleStyle}
              subtitleStyle={headerSubtitleStyle}
              className="mb-1.5"
            />

            <div className="flex min-h-0 flex-1 items-center justify-center pt-2 pb-4">
              <div
                className={`relative flex h-16 w-16 items-center justify-center rounded-full border ${heroPlateClassName}`}
              >
                <div
                  className={`absolute inset-0 rounded-full bg-linear-to-br ${cardColors.glow} to-transparent`}
                />
                <div
                  className={`absolute inset-[8px] rounded-full border ${heroInnerRingClassName}`}
                />
                <div
                  className={`absolute inset-[14px] rounded-full ${securitySurface.lockButtonBg}`}
                />
                {isPendingAction ? (
                  <Loader2 className={`relative h-6.5 w-6.5 animate-spin ${stateIconClassName}`} />
                ) : (
                  <IconComponent className={`relative h-6.5 w-6.5 ${stateIconClassName}`} />
                )}
              </div>
            </div>

            <div className="mt-auto pt-1.5">{lockControl}</div>
          </div>
        </BaseCard>
      ) : null}
      <BaseCardDialog
        variant="modal"
        titleInContent
        title={name}
        theme={theme}
        isOpen={dialogOpen}
        onOpenChange={setDialogOpen}
        onCloseAutoFocus={dialog?.onCloseAutoFocus}
        maxWidth="sm"
        bodyPadding={false}
      >
        <CardDialogBody>
          <CardDialogHeader
            title={name}
            description={statusLabel}
            theme={theme}
            editableTitle={false}
            showRoomSelector={false}
          />
          {lockControl}
        </CardDialogBody>
      </BaseCardDialog>
    </>
  );
});
