import {
  getPortalActionDockAnchorRect,
  PortalActionDock,
  type PortalActionDockAnchorRect,
} from '@navet/app/components/patterns/portal-action-dock';
import { CardEditActionButton } from '@navet/app/components/shared/card-edit-action-button';
import {
  type CardSize,
  getCardSpanClass,
  getResponsiveCardSize,
} from '@navet/app/components/shared/card-size-selector';
import { dispatchEditModeSettingsRequest } from '@navet/app/components/shared/edit-mode-settings-request';
import { withTintAlpha } from '@navet/app/components/shared/theme/custom-card-tint-surface';
import {
  EffectiveEffectsQualityProvider,
  useEffectiveEffectsQuality,
} from '@navet/app/components/shared/theme/effective-effects-quality';
import { getBaseCardRadiusClassName } from '@navet/app/components/system/tokens';
import type { MediaDialogMediaStackSettings } from '@navet/app/features/media/components/media/media-dialog.types';
import { useAccentColor, useI18n, useTheme } from '@navet/app/hooks';
import { useBreakpointCols } from '@navet/app/hooks/use-breakpoint-cols';
import { settingsSelectors } from '@navet/app/stores/selectors';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import type { DeviceWithType } from '@navet/app/types/device.types';
import { detectDeviceTier } from '@navet/app/utils/detect-device-tier';
import { getLowestEffectsQuality } from '@navet/app/utils/effects-quality';
import { EyeOff, Lock, Settings2, SlidersHorizontal, Unlock, X } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { lazy, memo, Suspense, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { resolveDashboardPerformanceProfile } from '../hooks/use-dashboard-performance-mode';
import type { CustomCard } from '../stores/custom-cards-store';
import { useDashboardEntitiesStore } from '../stores/dashboard-entities-store';
import { renderCard } from '../utils/card-renderer';
import type { ZoneName } from '../zones/zone-types';
import { DashboardResizeTrigger } from './dashboard-edit-actions';
import { WidgetCard } from './widget-card';

interface DashboardCardItemProps {
  id: string;
  size: CardSize;
  isEditMode: boolean;
  handleSizeChange: (id: string, size: CardSize) => void;
  device?: DeviceWithType;
  card?: CustomCard;
  zone?: ZoneName;
  onDeleteCard?: (cardId: string) => void;
  onUpdateCard?: (cardId: string, data: Record<string, unknown>) => void;
  onRemoveFromLayout?: (cardId: string) => void;
  removeFromLayoutLabel?: string;
  onRemoveEntity?: (entityId: string) => void;
  allowEntityRemoval?: boolean;
  allowExtraLargeSizes?: boolean;
  usesHideAction?: boolean;
  densePerformanceMode?: boolean;
  optimizeOffscreenPaint?: boolean;
  headerSubtitleOverride?: string;
  presentationVariant?: 'media-stack';
  mediaStackSettings?: MediaDialogMediaStackSettings;
}

const DashboardCardItemDraggable = lazy(async () => {
  const module = await import('./dashboard-card-item-draggable');
  return { default: module.DashboardCardItemDraggable };
});

export const DashboardCardItem = memo(function DashboardCardItem({
  id,
  size,
  isEditMode,
  handleSizeChange,
  device,
  card,
  zone,
  onDeleteCard,
  onUpdateCard,
  onRemoveFromLayout,
  removeFromLayoutLabel,
  onRemoveEntity,
  allowEntityRemoval = false,
  allowExtraLargeSizes = zone === 'hero' || zone === undefined,
  usesHideAction = false,
  densePerformanceMode = false,
  optimizeOffscreenPaint = false,
  headerSubtitleOverride,
  presentationVariant,
  mediaStackSettings,
}: DashboardCardItemProps) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const inheritedEffectsQuality = useEffectiveEffectsQuality();
  const breakpointCols = useBreakpointCols();
  const accentColor = useAccentColor();
  const { ambientLightBleed, disableAnimations, effectsQuality, lowPowerMode } = useSettingsStore(
    useShallow((state) => ({
      ambientLightBleed: settingsSelectors.ambientLightBleed(state),
      disableAnimations: settingsSelectors.disableAnimations(state),
      effectsQuality: settingsSelectors.effectsQuality(state),
      lowPowerMode: settingsSelectors.lowPowerMode(state),
    }))
  );
  const isLocked = useDashboardEntitiesStore((state) => state.lockedCardIds.includes(id));
  const toggleCardLock = useDashboardEntitiesStore((state) => state.toggleCardLock);
  const [isTinyEditDockOpen, setIsTinyEditDockOpen] = useState(false);
  const [tinyEditDockOpener, setTinyEditDockOpener] = useState<HTMLButtonElement | null>(null);
  const [tinyEditDockAnchorRect, setTinyEditDockAnchorRect] =
    useState<PortalActionDockAnchorRect | null>(null);
  const [customCardSettingsRequestKey, setCustomCardSettingsRequestKey] = useState(0);
  const RemoveActionIcon = usesHideAction ? EyeOff : X;
  const removeAriaLabel = t('dashboard.edit.removeEntityFromDashboard');
  const performanceProfile = useMemo(
    () =>
      resolveDashboardPerformanceProfile({
        activeSection: 'home',
        deviceTier: detectDeviceTier(),
        effectsQuality,
        isEditMode,
        lowPowerMode,
        reducedEffectsEnabled: disableAnimations || lowPowerMode,
        visibleCardCount: 1,
        visibleDevices: device ? [device] : [],
      }),
    [device, disableAnimations, effectsQuality, isEditMode, lowPowerMode]
  );
  const resolvedEffectsQuality = getLowestEffectsQuality(
    inheritedEffectsQuality,
    densePerformanceMode || disableAnimations || lowPowerMode
      ? 'low'
      : performanceProfile.effectiveEffectsQuality
  );
  const resolvedAmbientLightBleed =
    !densePerformanceMode && ambientLightBleed && performanceProfile.allowAmbientBleed;
  const allowedSizes = getAllowedSizes(device, card, allowExtraLargeSizes);
  const resolvedSize = getResponsiveCardSize(
    resolveAllowedSize(size, allowedSizes),
    breakpointCols
  );
  const spanClass = getCardSpanClass(resolvedSize);
  const editControlSize =
    device?.type === 'media' && resolvedSize === 'medium-vertical' ? 'medium' : resolvedSize;
  const usesTinyEditDockLauncher = isEditMode && editControlSize === 'tiny';

  // Drag is only enabled in edit mode when the card is inside a zone band.
  const draggable = isEditMode && zone !== undefined;
  const isInteractionLocked = isLocked && !isEditMode;
  const lockAriaLabel = isLocked ? t('dashboard.edit.unlockCard') : t('dashboard.edit.lockCard');
  const handleLockToggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    toggleCardLock(id);
  };
  const canOpenEditModeSettings = device
    ? supportsEditModeSettingsDock(device)
    : supportsCustomCardEditModeSettingsDock(card);
  const tinyEditOverlayTitle = device?.name ?? getCustomCardEditLabel(card, t);
  const tinyEditOverlaySubtitle = device
    ? getDeviceTypeEditLabel(device.type, t)
    : t('widgets.common.widget');
  const handleEditModeSettingsOpen = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (card) {
      setCustomCardSettingsRequestKey((value) => value + 1);
    } else {
      dispatchEditModeSettingsRequest(id);
    }
    setIsTinyEditDockOpen(false);
  };
  useEffect(() => {
    if (!usesTinyEditDockLauncher) {
      setIsTinyEditDockOpen(false);
      setTinyEditDockAnchorRect(null);
    }
  }, [usesTinyEditDockLauncher]);
  const renderedCard = device ? (
    renderCard({
      device: device as Parameters<typeof renderCard>[0]['device'],
      size: resolvedSize as CardSize,
      handleSizeChange,
      isEditMode,
      headerSubtitleOverride,
      presentationVariant,
      mediaStackSettings,
      onRemoveCard: onRemoveFromLayout
        ? () => onRemoveFromLayout(id)
        : allowEntityRemoval && onRemoveEntity
          ? () => onRemoveEntity(id)
          : undefined,
      removeCardLabel: onRemoveFromLayout
        ? (removeFromLayoutLabel ?? t('dashboard.edit.removeFromHome'))
        : t(
            usesHideAction
              ? 'dashboard.roomsWorkspace.hideDevice'
              : 'dashboard.roomsWorkspace.removeDevice'
          ),
    })
  ) : card ? (
    <WidgetCard
      card={{ ...card, size: resolvedSize }}
      isEditMode={isEditMode}
      onUpdate={onUpdateCard}
      openSettingsRequestKey={customCardSettingsRequestKey}
    />
  ) : null;
  const lockedCardContent = (
    <LockedCardInteractionFrame
      isLocked={isInteractionLocked}
      label={t('dashboard.edit.lockedCard')}
    >
      {renderedCard}
    </LockedCardInteractionFrame>
  );

  const cardContent = (
    <>
      {isEditMode ? <EditModeCardBackdrop size={resolvedSize} /> : null}
      {isEditMode ? (
        usesTinyEditDockLauncher ? (
          <>
            <TinyEditModeDockLauncher
              theme={theme}
              onOpen={(event) => {
                setTinyEditDockOpener(event.currentTarget);
                setTinyEditDockAnchorRect(getPortalActionDockAnchorRect(event.currentTarget));
                setIsTinyEditDockOpen(true);
              }}
              title={t('common.moreActions')}
            />
            {isTinyEditDockOpen ? (
              <TinyEditModeDockOverlay
                accentColor={accentColor}
                anchorRect={tinyEditDockAnchorRect}
                returnFocusTo={tinyEditDockOpener}
                subtitle={tinyEditOverlaySubtitle}
                theme={theme}
                title={tinyEditOverlayTitle}
                onClose={() => {
                  setIsTinyEditDockOpen(false);
                  setTinyEditDockAnchorRect(null);
                }}
              >
                {renderEditModeDockActions({
                  allowedSizes,
                  allowEntityRemoval,
                  canOpenEditModeSettings,
                  card,
                  cardId: id,
                  cardSize: editControlSize,
                  entityName: device?.name ?? card?.id ?? '',
                  handleEditModeSettingsOpen,
                  handleLockToggle,
                  handleSizeChange,
                  hasDevice: Boolean(device),
                  isLocked,
                  lockAriaLabel,
                  onDeleteCard,
                  onRemoveEntity,
                  onRemoveFromLayout,
                  removeFromLayoutLabel,
                  removeAriaLabel,
                  RemoveActionIcon,
                  resolvedSize,
                  theme,
                  t,
                  usesHideAction,
                })}
              </TinyEditModeDockOverlay>
            ) : null}
          </>
        ) : (
          <EditModeActionDock
            cardSize={editControlSize}
            accentColor={accentColor}
            effectsQuality={resolvedEffectsQuality}
            theme={theme}
          >
            {renderEditModeDockActions({
              allowedSizes,
              allowEntityRemoval,
              canOpenEditModeSettings,
              card,
              cardId: id,
              cardSize: editControlSize,
              entityName: device?.name ?? card?.id ?? '',
              handleEditModeSettingsOpen,
              handleLockToggle,
              handleSizeChange,
              hasDevice: Boolean(device),
              isLocked,
              lockAriaLabel,
              onDeleteCard,
              onRemoveEntity,
              onRemoveFromLayout,
              removeFromLayoutLabel,
              removeAriaLabel,
              RemoveActionIcon,
              resolvedSize,
              theme,
              t,
              usesHideAction,
            })}
          </EditModeActionDock>
        )
      ) : null}
      {isLocked && !isEditMode ? <LockedCardBadge label={t('dashboard.edit.lockedCard')} /> : null}
      {isEditMode ? (
        <div inert className="pointer-events-none h-full w-full">
          {renderedCard}
        </div>
      ) : (
        lockedCardContent
      )}
    </>
  );

  const containerClassName = `relative h-full ${resolveDashboardCardContainmentClass(device, resolvedAmbientLightBleed)} ${spanClass} ${
    optimizeOffscreenPaint ? '[content-visibility:auto] [contain-intrinsic-block-size:10rem]' : ''
  } [&>*]:cursor-inherit`;

  if (draggable && zone) {
    return (
      <EffectiveEffectsQualityProvider value={resolvedEffectsQuality}>
        <Suspense
          fallback={
            <div
              className={`${containerClassName} touch-none cursor-grab active:cursor-grabbing`}
              data-navet-effects-quality={resolvedEffectsQuality}
            >
              {cardContent}
            </div>
          }
        >
          <DashboardCardItemDraggable
            id={id}
            zone={zone}
            spanClass={spanClass}
            ambientLightBleed={device?.type === 'lights' && resolvedAmbientLightBleed}
            effectsQuality={resolvedEffectsQuality}
          >
            {cardContent}
          </DashboardCardItemDraggable>
        </Suspense>
      </EffectiveEffectsQualityProvider>
    );
  }

  return (
    <EffectiveEffectsQualityProvider value={resolvedEffectsQuality}>
      <div
        className={`${containerClassName} cursor-inherit`}
        data-card-nodrag="true"
        data-navet-effects-quality={resolvedEffectsQuality}
      >
        {cardContent}
      </div>
    </EffectiveEffectsQualityProvider>
  );
}, areDashboardCardItemPropsEqual);

function resolveDashboardCardContainmentClass(
  device: DeviceWithType | undefined,
  ambientLightBleed: boolean
) {
  if (device?.type === 'lights' && ambientLightBleed) {
    return '[contain:layout_style]';
  }

  // Paint containment can interfere with live video composition on camera cards.
  if (device?.type === 'cameras') {
    return '[contain:layout_style]';
  }

  return '[contain:layout_style_paint]';
}

function EditModeCardBackdrop({ size }: { size: CardSize }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 z-300 ${getBaseCardRadiusClassName(size)} bg-[radial-gradient(circle_at_top_left,rgba(0,0,0,0.52),transparent_54%),radial-gradient(circle_at_top_right,rgba(0,0,0,0.56),transparent_50%),linear-gradient(to_bottom,rgba(0,0,0,0.28),rgba(0,0,0,0.12)_30%,rgba(0,0,0,0.16)_56%,rgba(0,0,0,0.52))]`}
      aria-hidden="true"
    />
  );
}

export function DashboardCardEditBackdrop({ size }: { size: CardSize }) {
  return <EditModeCardBackdrop size={size} />;
}

export function DashboardCardEditDock({
  cardSize,
  children,
}: {
  cardSize: CardSize;
  children: ReactNode;
}) {
  const accentColor = useAccentColor();
  const { theme } = useTheme();
  const effectsQuality = useEffectiveEffectsQuality();

  return (
    <EditModeActionDock
      cardSize={cardSize}
      accentColor={accentColor}
      effectsQuality={effectsQuality}
      theme={theme}
    >
      {children}
    </EditModeActionDock>
  );
}

function EditModeActionDock({
  cardSize,
  accentColor,
  effectsQuality,
  theme,
  children,
}: {
  cardSize: CardSize;
  accentColor: string;
  effectsQuality: 'high' | 'medium' | 'low';
  theme: ReturnType<typeof useTheme>['theme'];
  children: ReactNode;
}) {
  const compact = cardSize === 'tiny' || cardSize === 'extra-small';
  const narrowDock = compact || cardSize === 'small';
  const radiusClassName = getBaseCardRadiusClassName(cardSize);
  const overlayBackground =
    theme === 'glass'
      ? 'linear-gradient(to top, rgba(4,8,18,0.56), rgba(8,12,20,0.3) 24%, rgba(10,14,24,0.1) 52%, transparent 78%)'
      : 'linear-gradient(to top, rgba(0,0,0,0.88), rgba(0,0,0,0.78) 24%, rgba(0,0,0,0.42) 52%, transparent 78%)';
  const dockStyle =
    theme === 'glass'
      ? {
          border: '1px solid rgba(255,255,255,0.16)',
          background:
            effectsQuality === 'high'
              ? 'linear-gradient(180deg, rgba(255,255,255,0.2), rgba(255,255,255,0.08) 22%, rgba(255,255,255,0.03) 100%)'
              : 'rgba(18,24,34,0.88)',
          boxShadow:
            effectsQuality === 'high'
              ? '0 18px 38px -24px rgba(4,10,22,0.82), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -10px 18px rgba(255,255,255,0.03)'
              : '0 12px 24px -18px rgba(4,10,22,0.58)',
          backdropFilter: effectsQuality === 'high' ? 'blur(24px) saturate(1.05)' : 'none',
          WebkitBackdropFilter: effectsQuality === 'high' ? 'blur(24px) saturate(1.05)' : 'none',
        }
      : {
          border: `1px solid ${withTintAlpha(accentColor, 0.12)}`,
          background: '#161619',
          boxShadow: '0 12px 24px -18px rgba(0,0,0,0.72)',
        };

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-500 h-24 overflow-hidden ${radiusClassName}`}
      data-card-edit-dock="true"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: overlayBackground,
        }}
        aria-hidden="true"
      />
      <div
        className={`relative flex h-full items-end justify-center ${narrowDock ? 'px-2' : 'px-3'} ${compact ? 'pb-2.5' : 'pb-3'}`}
      >
        <div
          className={`pointer-events-auto inline-flex max-w-full items-center justify-center ${narrowDock ? 'gap-2 px-2 py-1.5' : 'gap-3 px-3 py-2'} rounded-full`}
          style={dockStyle}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function TinyEditModeDockLauncher({
  theme,
  onOpen,
  title,
}: {
  theme: ReturnType<typeof useTheme>['theme'];
  onOpen: (event: MouseEvent<HTMLButtonElement>) => void;
  title: string;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-500 flex justify-center px-2 pb-2">
      <CardEditActionButton
        cardSize="tiny"
        Icon={SlidersHorizontal}
        inline
        theme={theme}
        variant="accent"
        aria-label={title}
        title={title}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpen(event);
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
      />
    </div>
  );
}

function TinyEditModeDockOverlay({
  accentColor,
  anchorRect,
  children,
  onClose,
  subtitle,
  theme,
  title,
  returnFocusTo,
}: {
  accentColor: string;
  anchorRect: PortalActionDockAnchorRect | null;
  children: ReactNode;
  onClose: () => void;
  subtitle: string;
  theme: ReturnType<typeof useTheme>['theme'];
  title: string;
  returnFocusTo: HTMLElement | null;
}) {
  return (
    <PortalActionDock
      accentColor={accentColor}
      anchorRect={anchorRect}
      returnFocusTo={returnFocusTo}
      onClose={onClose}
      subtitle={subtitle}
      theme={theme}
      title={title}
    >
      <div className="flex flex-wrap items-center justify-center gap-3">{children}</div>
    </PortalActionDock>
  );
}

function renderEditModeDockActions({
  allowedSizes,
  allowEntityRemoval,
  canOpenEditModeSettings,
  card,
  cardId,
  cardSize,
  entityName,
  handleEditModeSettingsOpen,
  handleLockToggle,
  handleSizeChange,
  hasDevice,
  isLocked,
  lockAriaLabel,
  onDeleteCard,
  onRemoveEntity,
  onRemoveFromLayout,
  removeFromLayoutLabel,
  removeAriaLabel,
  RemoveActionIcon,
  resolvedSize,
  theme,
  t,
  usesHideAction,
}: {
  allowedSizes: CardSize[];
  allowEntityRemoval: boolean;
  canOpenEditModeSettings: boolean;
  card?: CustomCard;
  cardId: string;
  cardSize: CardSize;
  entityName: string;
  handleEditModeSettingsOpen: (event: MouseEvent<HTMLButtonElement>) => void;
  handleLockToggle: (event: MouseEvent<HTMLButtonElement>) => void;
  handleSizeChange: (id: string, size: CardSize) => void;
  hasDevice: boolean;
  isLocked: boolean;
  lockAriaLabel: string;
  onDeleteCard?: (cardId: string) => void;
  onRemoveEntity?: (entityId: string) => void;
  onRemoveFromLayout?: (cardId: string) => void;
  removeFromLayoutLabel?: string;
  removeAriaLabel: string;
  RemoveActionIcon: typeof EyeOff;
  resolvedSize: CardSize;
  theme: ReturnType<typeof useTheme>['theme'];
  t: ReturnType<typeof useI18n>['t'];
  usesHideAction: boolean;
}) {
  return (
    <>
      {!onRemoveFromLayout && hasDevice && allowEntityRemoval && onRemoveEntity ? (
        <CardEditActionButton
          cardSize={cardSize}
          Icon={RemoveActionIcon}
          inline
          theme={theme}
          variant={usesHideAction ? 'warning' : 'destructive'}
          data-dashboard-edit-action="remove-entity"
          data-card-id={cardId}
          aria-label={removeAriaLabel}
        />
      ) : null}
      {onRemoveFromLayout ? (
        <CardEditActionButton
          cardSize={cardSize}
          Icon={X}
          inline
          theme={theme}
          variant="warning"
          data-dashboard-edit-action="remove-layout"
          data-card-id={cardId}
          aria-label={removeFromLayoutLabel ?? t('dashboard.edit.removeFromHome')}
        />
      ) : null}
      {!onRemoveFromLayout && card && onDeleteCard ? (
        <CardEditActionButton
          cardSize={cardSize}
          Icon={X}
          inline
          theme={theme}
          variant="destructive"
          data-dashboard-edit-action="delete-card"
          data-card-id={cardId}
          aria-label={t('widgets.delete')}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDeleteCard(cardId);
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
        />
      ) : null}
      <CardEditActionButton
        cardSize={cardSize}
        Icon={isLocked ? Lock : Unlock}
        inline
        theme={theme}
        variant={isLocked ? 'locked' : 'success'}
        aria-pressed={isLocked}
        aria-label={lockAriaLabel}
        title={lockAriaLabel}
        onClick={handleLockToggle}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
      />
      <DashboardResizeTrigger
        cardSize={resolvedSize}
        triggerSize={cardSize}
        allowedSizes={allowedSizes}
        onSizeChange={(nextSize) => handleSizeChange(cardId, nextSize)}
        inline
      />
      {canOpenEditModeSettings ? (
        <CardEditActionButton
          cardSize={cardSize}
          Icon={Settings2}
          inline
          theme={theme}
          variant="accent"
          aria-label={t('entityCardInteraction.openSettings', {
            name: entityName,
          })}
          title={t('entityCardInteraction.openSettings', {
            name: entityName,
          })}
          onClick={handleEditModeSettingsOpen}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
        />
      ) : null}
    </>
  );
}

function LockedCardBadge({ label }: { label: string }) {
  return (
    <div
      className="pointer-events-none absolute right-3 bottom-3 z-400 flex h-8 w-8 items-center justify-center rounded-full border border-white/18 bg-black/78 text-white shadow-[0_12px_26px_-14px_rgba(0,0,0,0.95)] ring-1 ring-black/35 backdrop-blur-xl"
      aria-label={label}
      role="img"
      title={label}
    >
      <Lock className="h-4 w-4 drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]" aria-hidden="true" />
    </div>
  );
}

function LockedCardInteractionFrame({
  children,
  isLocked,
  label,
}: {
  children: ReactNode;
  isLocked: boolean;
  label: string;
}) {
  if (!isLocked) {
    return <>{children}</>;
  }

  return (
    <div className="relative h-full w-full" data-card-locked="true">
      <div inert className="h-full w-full">
        {children}
      </div>
      <button
        type="button"
        className="absolute inset-0 z-300 cursor-not-allowed rounded-[inherit] border-0 bg-transparent p-0"
        data-card-lock-overlay="true"
        aria-label={label}
        tabIndex={-1}
        title={label}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      />
    </div>
  );
}

function getAllowedSizes(
  device?: DeviceWithType,
  card?: CustomCard,
  extraLargeAllowed = true
): CardSize[] {
  if (card) {
    if (card.type === 'info' && isSingleSensorInfoCard(card)) {
      return ['extra-small', 'small', 'medium', 'large'];
    }
    if (card.type === 'button' || card.type === 'assist') {
      return ['tiny', 'extra-small', 'small'];
    }
    if (extraLargeAllowed && (card.type === 'photo' || card.type === 'rss')) {
      return ['small', 'medium', 'large', 'extra-large'];
    }
    if (card.type === 'energy-now' || card.type === 'media-stack') {
      return ['small', 'medium', 'large'];
    }
    if (card.type === 'map') {
      return ['small', 'medium', 'large'];
    }
    if (card.type === 'entity') {
      return ['extra-small', 'small', 'medium', 'large'];
    }
    if (card.type === 'ups') {
      return ['small', 'medium', 'large'];
    }
    return ['small', 'medium', 'large'];
  }

  if (
    device?.type === 'sensors' &&
    (device.securityKind === 'alarm' || device.deviceClass === 'alarm_control_panel')
  ) {
    return ['medium', 'large'];
  }

  switch (device?.type) {
    case 'cameras':
      return ['medium', 'large', 'extra-large'];
    case 'media':
      return ['small', 'medium', 'medium-vertical', 'large'];
    case 'grouped-sensors':
      return ['small', 'medium'];
    case 'sensors':
      return ['extra-small', 'small'];
    case 'climate':
    case 'hvac':
      return ['small', 'medium', 'large'];
    case 'calendars':
      return ['small', 'medium', 'large'];
    case 'weather':
      return ['small', 'medium', 'large'];
    case 'vacuums':
      return ['small', 'medium'];
    case 'switches':
      if (device.serviceDomain === 'humidifier') {
        return ['small', 'medium'];
      }
      return ['tiny', 'extra-small', 'small'];
    case 'timers':
    case 'counters':
      return ['extra-small', 'small'];
    case 'helpers':
    case 'valves':
    case 'remotes':
      return ['tiny', 'extra-small', 'small'];
    case 'lights':
      return ['extra-small', 'small', 'medium'];
    case 'fans':
      return ['extra-small', 'small', 'medium'];
    case 'persons':
      return ['tiny', 'extra-small', 'small'];
    case 'locks':
      return ['small'];
    case 'scenes':
      return ['tiny', 'extra-small', 'small', 'medium'];
    default:
      return ['extra-small', 'small', 'medium', 'large'];
  }
}

function isSingleSensorInfoCard(card: CustomCard) {
  if (card.type !== 'info') {
    return false;
  }

  const sensorEntityIds = Array.isArray(card.data?.sensorEntityIds)
    ? card.data.sensorEntityIds.filter((value): value is string => typeof value === 'string')
    : [];

  if (sensorEntityIds.length > 0) {
    return sensorEntityIds.length === 1;
  }

  return typeof card.data?.entityId === 'string';
}

function supportsEditModeSettingsDock(device: DeviceWithType) {
  if (
    device.type === 'sensors' &&
    (device.securityKind === 'alarm' || device.deviceClass === 'alarm_control_panel')
  ) {
    return false;
  }

  return [
    'lights',
    'fans',
    'switches',
    'helpers',
    'timers',
    'counters',
    'valves',
    'remotes',
    'climate',
    'hvac',
    'weather',
    'cameras',
    'covers',
    'media',
    'vacuums',
    'calendars',
    'grouped-sensors',
    'sensors',
  ].includes(device.type);
}

function supportsCustomCardEditModeSettingsDock(card?: CustomCard) {
  if (!card) {
    return false;
  }

  return [
    'info',
    'rss',
    'photo',
    'battery',
    'ups',
    'energy-now',
    'media-stack',
    'button',
    'assist',
  ].includes(card.type);
}

function getDeviceTypeEditLabel(type: DeviceWithType['type'], t: ReturnType<typeof useI18n>['t']) {
  switch (type) {
    case 'lights':
      return t('lighting.type.light');
    case 'switches':
    case 'helpers':
      return t('lighting.type.switch');
    case 'timers':
      return t('deviceType.timer');
    case 'counters':
      return t('deviceType.counter');
    case 'valves':
      return t('deviceType.valve');
    case 'remotes':
      return t('deviceType.remote');
    case 'fans':
      return 'Fan';
    case 'climate':
    case 'hvac':
      return 'Climate';
    case 'weather':
      return t('deviceType.weather');
    case 'cameras':
      return t('deviceType.camera');
    case 'covers':
      return t('deviceType.cover');
    case 'media':
      return 'Media';
    case 'vacuums':
      return t('deviceType.vacuum');
    case 'calendars':
      return 'Calendar';
    case 'grouped-sensors':
      return t('deviceType.sensorGroup');
    case 'sensors':
      return t('deviceType.sensor');
    case 'persons':
      return t('deviceType.person');
    case 'scenes':
      return t('deviceType.scene');
    default:
      return t('widgets.common.widget');
  }
}

function getCustomCardEditLabel(card: CustomCard | undefined, t: ReturnType<typeof useI18n>['t']) {
  if (!card) {
    return t('widgets.common.widget');
  }

  const dataLabel =
    typeof card.data?.label === 'string' && card.data.label.trim().length > 0
      ? card.data.label.trim()
      : typeof card.data?.name === 'string' && card.data.name.trim().length > 0
        ? card.data.name.trim()
        : undefined;

  if (dataLabel) {
    return dataLabel;
  }

  return typeof card.id === 'string' && card.id.length > 0 ? card.id : t('widgets.common.widget');
}

function resolveAllowedSize(size: CardSize, allowedSizes: CardSize[]) {
  if (allowedSizes.includes(size)) {
    return size;
  }

  if (
    allowedSizes.length === 3 &&
    allowedSizes.includes('tiny') &&
    allowedSizes.includes('extra-small') &&
    allowedSizes.includes('small')
  ) {
    return 'small';
  }

  if (
    allowedSizes.length === 2 &&
    allowedSizes.includes('extra-small') &&
    allowedSizes.includes('small')
  ) {
    return 'small';
  }

  if (
    (size === 'large' || size === 'extra-large' || size === 'medium-vertical') &&
    allowedSizes.includes('medium')
  ) {
    return 'medium';
  }

  return allowedSizes[0] ?? size;
}

function areDashboardCardItemPropsEqual(
  previous: DashboardCardItemProps,
  next: DashboardCardItemProps
) {
  return (
    previous.id === next.id &&
    previous.size === next.size &&
    previous.isEditMode === next.isEditMode &&
    previous.device === next.device &&
    previous.card === next.card &&
    previous.zone === next.zone &&
    previous.handleSizeChange === next.handleSizeChange &&
    previous.onDeleteCard === next.onDeleteCard &&
    previous.onUpdateCard === next.onUpdateCard &&
    previous.onRemoveFromLayout === next.onRemoveFromLayout &&
    previous.removeFromLayoutLabel === next.removeFromLayoutLabel &&
    previous.onRemoveEntity === next.onRemoveEntity &&
    previous.allowEntityRemoval === next.allowEntityRemoval &&
    previous.allowExtraLargeSizes === next.allowExtraLargeSizes &&
    previous.usesHideAction === next.usesHideAction &&
    previous.densePerformanceMode === next.densePerformanceMode &&
    previous.optimizeOffscreenPaint === next.optimizeOffscreenPaint &&
    previous.headerSubtitleOverride === next.headerSubtitleOverride &&
    previous.presentationVariant === next.presentationVariant &&
    previous.mediaStackSettings === next.mediaStackSettings
  );
}
