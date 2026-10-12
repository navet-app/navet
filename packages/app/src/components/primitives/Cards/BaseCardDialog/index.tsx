import {
  CardDialogBody,
  CardDialogFooter,
  CardDialogHeader,
  CardDialogSection,
  CardDialogTabList,
  CardDialogTabTrigger,
} from '@navet/app/components/patterns/card-dialog';
import { CardDialogOverflowMenu } from '@navet/app/components/patterns/card-dialog-overflow-menu';
import { Button } from '@navet/app/components/primitives/button';
import {
  coverSheetHeaderClassName,
  settingsDialogContentClass,
} from '@navet/app/components/primitives/dialog-primitives';
import { TabPanel, Tabs } from '@navet/app/components/primitives/tabs';
import { CompactRoomSelector } from '@navet/app/components/shared/device-editor/compact-room-selector';
import { CustomCardTintPicker } from '@navet/app/components/shared/device-editor/custom-card-tint-picker';
import { CustomScrollbar } from '@navet/app/components/shared/device-editor/custom-scrollbar';
import { EntityHelperControls } from '@navet/app/components/shared/device-editor/entity-helper-controls';
import { getDialogReturnFocus } from '@navet/app/components/shared/dialog-return-focus';
import { EntityRoomSelector } from '@navet/app/components/shared/entity-room-selector';
import { getBaseCardDialogSurface } from '@navet/app/components/shared/theme/base-card-dialog-surface';
import { getInheritedDialogSectionStyle } from '@navet/app/components/shared/theme/custom-card-tint-surface';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { cn } from '@navet/app/components/ui/utils';
import { useI18n, useTheme } from '@navet/app/hooks';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowLeft, type LucideIcon, MapPin, Palette, Sliders, X } from 'lucide-react';
import type { CSSProperties, ReactNode, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

export type BaseCardDialogVariant = 'card' | 'modal' | 'sheet' | 'fullscreen';

export interface BaseCardDialogTab {
  key: string;
  label: string;
  icon: LucideIcon;
  content: ReactNode;
}

export interface BaseCardDialogRoomSelector {
  value: string;
  label: string;
  options: Array<{ label: string; value: string }>;
  onChange?: (room: string) => void;
}

interface BaseCardDialogSharedProps {
  onCloseAutoFocus?: (event: Event) => void;
  variant?: BaseCardDialogVariant;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** The dialog content renders its own Radix title, such as CardDialogHeader. */
  titleInContent?: boolean;
  theme: ThemeType;
  overlayClassName?: string;
  contentClassName?: string;
  contentStyle?: CSSProperties;
  contentGlowClassName?: string;
  contentGlowStyle?: CSSProperties;
  contentOverlayClassName?: string | null;
  contentOverlayStyle?: CSSProperties;
  disableOpenAutoFocus?: boolean;
  maxWidth?: 'sm' | 'md' | 'lg';
  height?: 'tall' | 'capped';
  scrollClassName?: string;
  shellBodyClassName?: string;
  bodyClassName?: string;
  footerContent?: ReactNode;
  footerActionLabel?: string;
  children?: ReactNode;
}

interface BaseCardDialogCardProps extends BaseCardDialogSharedProps {
  variant?: 'card';
  /** Fit the phone sheet to its content, capped at the usual resting sheet height. */
  mobileFitContent?: boolean;
  entityId?: string;
  entityType?: string;
  /** Helpers already rendered by the consuming dialog's existing controls. */
  excludeHelperEntityIds?: string[];
  helperControlsTheme?: ThemeType;
  tabs: BaseCardDialogTab[];
  tintColor?: string;
  onTintColorChange?: (color: string) => void;
  defaultTintAccent?: string;
  roomSelector?: BaseCardDialogRoomSelector;
  roomSelectorFallbackRoomName?: string;
  editableTitle?: boolean;
  onTitleChange?: (title: string) => void | Promise<void>;
  headerEyebrow?: ReactNode;
  headerPresentation?: 'default' | 'compact';
  titleEditing?: boolean;
  onTitleEditingChange?: (editing: boolean) => void;
  showTabList?: boolean;
  /** Defaults to overflow: controls first, secondary sections and card management in More actions. */
  navigation?: 'tabs' | 'overflow';
  onRemoveCard?: () => void;
  removeCardLabel?: string;
  mobileCoverSheetActions?: ReactNode;
  headerSupportingContent?: ReactNode;
  headerTrailing?: ReactNode;
  headerClassName?: string;
  showHeaderDivider?: boolean;
  contentSurface?: { panel: string; border: string };
  activeTab?: string;
  defaultTab?: string;
  onActiveTabChange?: (key: string) => void;
}

interface BaseCardDialogModalProps extends BaseCardDialogSharedProps {
  variant: 'modal';
  contentTitle?: string;
  contentDescription?: string;
  bodyPadding?: boolean;
  mobileCoverSheet?: boolean;
  persistentMobileDismiss?: boolean;
  mobileCoverSheetActions?: ReactNode;
}

interface BaseCardDialogSheetProps extends BaseCardDialogSharedProps {
  variant: 'sheet';
  contentTitle?: string;
  contentDescription?: string;
  accentColor?: string;
  closeLabel?: string;
  persistentMobileDismiss?: boolean;
}

interface BaseCardDialogFullscreenProps extends BaseCardDialogSharedProps {
  variant: 'fullscreen';
  contentTitle?: string;
  contentDescription?: string;
  mobileCoverSheet?: boolean;
  persistentMobileDismiss?: boolean;
}

export type BaseCardDialogProps =
  | BaseCardDialogCardProps
  | BaseCardDialogModalProps
  | BaseCardDialogSheetProps
  | BaseCardDialogFullscreenProps;

interface BaseCardDialogRootProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  overlayClassName: string;
  contentClassName: string;
  contentAriaDescribedBy?: string;
  contentTitle?: string;
  contentDescription?: string;
  disableOpenAutoFocus?: boolean;
  onCloseAutoFocus?: (event: Event) => void;
  mobileCoverSheet?: boolean;
  mobileFitContent?: boolean;
  persistentMobileDismiss?: boolean;
  mobileCoverSheetActions?: ReactNode;
  mobileDismissLabel?: string;
  mobileDismissStyle?: CSSProperties;
  contentStyle?: CSSProperties;
  contentGlowClassName?: string;
  contentGlowStyle?: CSSProperties;
  contentOverlayClassName?: string | null;
  contentOverlayStyle?: CSSProperties;
  bodyClassName?: string;
  children: ReactNode;
}

const mobileCoverSheetClassName = [
  'max-sm:!top-[var(--mobile-cover-sheet-top)] max-sm:!right-0 max-sm:!bottom-0 max-sm:!left-0',
  'max-sm:!mx-0 max-sm:!w-auto max-sm:!max-w-none',
  'max-sm:[--navet-safe-area-top-offset:0px]',
  'max-sm:!flex max-sm:!flex-col',
  'max-sm:![translate:0_var(--mobile-cover-sheet-drag-y)] max-sm:!rounded-t-[30px] max-sm:!rounded-b-none',
  'max-sm:!transition-[height,top,translate] max-sm:!duration-200 max-sm:!ease-out',
].join(' ');

const mobileCoverSheetFullscreenClassName = [
  'max-sm:!h-auto max-sm:!max-h-[100dvh]',
  'max-sm:!transition-[height,top,translate] max-sm:!duration-200 max-sm:!ease-out',
].join(' ');

const mobileCoverSheetDraggingClassName = 'max-sm:!transition-none';
const mobileCoverSheetTopInsetPx = 8;
const mobileCoverSheetFullscreenTopInset = 'calc(max(env(safe-area-inset-top, 0px), 0px) + 0.5rem)';

function blurActiveElement() {
  if (typeof document === 'undefined') {
    return;
  }

  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement) {
    activeElement.blur();
  }
}

function getMobileCoverSheetStyle(
  contentStyle: CSSProperties | undefined,
  dragOffset: number,
  topInset: string
): CSSProperties {
  return {
    ...contentStyle,
    '--mobile-cover-sheet-drag-y': `${dragOffset}px`,
    '--mobile-cover-sheet-top': topInset,
  } as CSSProperties;
}

function BaseCardDialogRoot({
  isOpen,
  onOpenChange,
  overlayClassName,
  contentClassName,
  contentAriaDescribedBy,
  contentTitle,
  contentDescription,
  disableOpenAutoFocus = false,
  onCloseAutoFocus,
  mobileCoverSheet = true,
  mobileFitContent = false,
  persistentMobileDismiss = false,
  mobileCoverSheetActions,
  mobileDismissLabel,
  mobileDismissStyle,
  contentStyle,
  contentGlowClassName,
  contentGlowStyle,
  contentOverlayClassName,
  contentOverlayStyle,
  bodyClassName,
  children,
}: BaseCardDialogRootProps) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const generatedDescriptionId = useId();
  const [isMobileCoverSheetFullscreen, setIsMobileCoverSheetFullscreen] = useState(false);
  const [mobileCoverSheetDragOffset, setMobileCoverSheetDragOffset] = useState(0);
  const [mobileCoverSheetTopInset, setMobileCoverSheetTopInset] = useState('auto');
  const [isMobileCoverSheetDragging, setIsMobileCoverSheetDragging] = useState(false);
  const mobileCoverSheetContentRef = useRef<HTMLDivElement | null>(null);
  const [wasOpen, setWasOpen] = useState(false);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  // Capture before portal descendants (including autoFocus inputs) mount.
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setOpener(
        typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
          ? getDialogReturnFocus(document.activeElement)
          : null
      );
    }
  }
  const mobileCoverSheetDragStartYRef = useRef(0);
  const mobileCoverSheetDragStartTopRef = useRef(0);
  const mobileCoverSheetRestingTopRef = useRef(0);
  const mobileCoverSheetDragDeltaRef = useRef(0);
  const mobileCoverSheetPointerIdRef = useRef<number | null>(null);
  const suppressMobileCoverSheetHandleClickRef = useRef(false);
  const hasDecoratedContent = Boolean(
    contentGlowClassName || contentGlowStyle || contentOverlayClassName
  );
  const resolvedBodyClassName = [
    bodyClassName,
    mobileCoverSheet ? 'max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const resolvedAriaDescribedBy = contentDescription
    ? generatedDescriptionId
    : contentAriaDescribedBy;

  const resetMobileCoverSheetDragState = useCallback(() => {
    mobileCoverSheetDragDeltaRef.current = 0;
    mobileCoverSheetPointerIdRef.current = null;
    suppressMobileCoverSheetHandleClickRef.current = false;
    setMobileCoverSheetDragOffset(0);
    setMobileCoverSheetTopInset('auto');
    setIsMobileCoverSheetFullscreen(false);
    setIsMobileCoverSheetDragging(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      resetMobileCoverSheetDragState();
    }
  }, [isOpen, resetMobileCoverSheetDragState]);

  useEffect(() => {
    if (!mobileCoverSheet || !isMobileCoverSheetDragging) {
      return;
    }

    const closeThresholdPx = isMobileCoverSheetFullscreen
      ? Math.max(360, window.innerHeight * 0.7)
      : 72;
    const collapseThresholdPx = isMobileCoverSheetFullscreen
      ? Math.max(56, window.innerHeight * 0.1)
      : 72;
    const fullscreenThresholdPx = 56;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== mobileCoverSheetPointerIdRef.current) {
        return;
      }

      const deltaY = event.clientY - mobileCoverSheetDragStartYRef.current;
      if (Math.abs(deltaY) > 6) {
        suppressMobileCoverSheetHandleClickRef.current = true;
      }

      mobileCoverSheetDragDeltaRef.current = deltaY;
      if (isMobileCoverSheetFullscreen && deltaY > 0) {
        const restingTop =
          mobileCoverSheetRestingTopRef.current || mobileCoverSheetDragStartTopRef.current;
        const fullscreenTop = mobileCoverSheetDragStartTopRef.current;
        const topInset = Math.min(restingTop, fullscreenTop + deltaY);
        setMobileCoverSheetTopInset(`${Math.max(fullscreenTop, topInset)}px`);
        setMobileCoverSheetDragOffset(Math.max(0, deltaY - (restingTop - fullscreenTop)));
        return;
      }

      setMobileCoverSheetDragOffset(Math.max(0, deltaY));
      setMobileCoverSheetTopInset(
        deltaY < 0
          ? `max(${Math.max(
              mobileCoverSheetTopInsetPx,
              mobileCoverSheetDragStartTopRef.current + deltaY
            )}px, ${mobileCoverSheetFullscreenTopInset})`
          : 'auto'
      );
    };

    const finishDrag = (event: PointerEvent) => {
      if (event.pointerId !== mobileCoverSheetPointerIdRef.current) {
        return;
      }

      const dragDelta = mobileCoverSheetDragDeltaRef.current;
      setIsMobileCoverSheetDragging(false);
      mobileCoverSheetPointerIdRef.current = null;
      mobileCoverSheetDragDeltaRef.current = 0;
      setMobileCoverSheetDragOffset(0);

      if (dragDelta >= closeThresholdPx) {
        blurActiveElement();
        onOpenChange(false);
        return;
      }

      if (isMobileCoverSheetFullscreen && dragDelta >= collapseThresholdPx) {
        setIsMobileCoverSheetFullscreen(false);
        setMobileCoverSheetTopInset('auto');
        return;
      }

      if (dragDelta <= -fullscreenThresholdPx) {
        setMobileCoverSheetTopInset(mobileCoverSheetFullscreenTopInset);
        setIsMobileCoverSheetFullscreen(true);
      } else {
        setMobileCoverSheetTopInset(
          isMobileCoverSheetFullscreen ? mobileCoverSheetFullscreenTopInset : 'auto'
        );
      }

      window.setTimeout(() => {
        suppressMobileCoverSheetHandleClickRef.current = false;
      }, 0);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
    };
  }, [isMobileCoverSheetDragging, isMobileCoverSheetFullscreen, mobileCoverSheet, onOpenChange]);

  const handleMobileCoverSheetPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    event.preventDefault();
    mobileCoverSheetPointerIdRef.current = event.pointerId;
    mobileCoverSheetDragStartYRef.current = event.clientY;
    const measuredTop = mobileCoverSheetContentRef.current?.getBoundingClientRect().top;
    mobileCoverSheetDragStartTopRef.current =
      measuredTop && measuredTop > 0 ? measuredTop : mobileCoverSheetTopInsetPx;
    if (!isMobileCoverSheetFullscreen) {
      mobileCoverSheetRestingTopRef.current = mobileCoverSheetDragStartTopRef.current;
    }
    mobileCoverSheetDragDeltaRef.current = 0;
    suppressMobileCoverSheetHandleClickRef.current = false;
    setIsMobileCoverSheetDragging(true);
    setMobileCoverSheetDragOffset(0);
  };

  const handleMobileCoverSheetHandleClick = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.blur();
    if (suppressMobileCoverSheetHandleClickRef.current) {
      suppressMobileCoverSheetHandleClickRef.current = false;
      return;
    }

    onOpenChange(false);
  };

  const resolvedContentClassName = [
    contentClassName,
    mobileCoverSheet ? mobileCoverSheetClassName : '',
    mobileCoverSheet && !isMobileCoverSheetFullscreen
      ? mobileFitContent
        ? 'max-sm:!h-auto max-sm:!max-h-[80dvh]'
        : 'max-sm:!h-[80dvh] max-sm:!max-h-[100dvh]'
      : '',
    persistentMobileDismiss ? 'max-sm:[&_[data-cover-sheet-inline-dismiss]]:!hidden' : '',
    mobileCoverSheet && isMobileCoverSheetFullscreen ? mobileCoverSheetFullscreenClassName : '',
    mobileCoverSheet && isMobileCoverSheetDragging ? mobileCoverSheetDraggingClassName : '',
  ]
    .filter(Boolean)
    .join(' ');
  const resolvedContentStyle = mobileCoverSheet
    ? getMobileCoverSheetStyle(contentStyle, mobileCoverSheetDragOffset, mobileCoverSheetTopInset)
    : contentStyle;

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(nextOpen) => {
        blurActiveElement();
        onOpenChange(nextOpen);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={`fixed inset-0 z-50 ${overlayClassName}`} />
        <Dialog.Content
          onCloseAutoFocus={(event) => {
            onCloseAutoFocus?.(event);
            if (event.defaultPrevented) return;
            event.preventDefault();
            const activeDialog = document.activeElement?.closest('[role="dialog"]');
            if (activeDialog && activeDialog !== mobileCoverSheetContentRef.current) return;
            if (opener?.isConnected) opener.focus({ preventScroll: true });
          }}
          ref={mobileCoverSheetContentRef}
          className={resolvedContentClassName}
          style={resolvedContentStyle}
          aria-describedby={resolvedAriaDescribedBy}
          onOpenAutoFocus={(event) => {
            if (disableOpenAutoFocus) {
              event.preventDefault();
              mobileCoverSheetContentRef.current?.focus({ preventScroll: true });
            }
          }}
        >
          {contentTitle ? <Dialog.Title className="sr-only">{contentTitle}</Dialog.Title> : null}
          {contentDescription ? (
            <Dialog.Description id={generatedDescriptionId} className="sr-only">
              {contentDescription}
            </Dialog.Description>
          ) : null}
          {persistentMobileDismiss ? (
            <div className="pointer-events-none absolute top-3 right-3 z-30 hidden items-center gap-2 max-sm:flex">
              {mobileCoverSheetActions}
              <button
                type="button"
                data-mobile-cover-sheet-dismiss
                aria-label={mobileDismissLabel ?? t('common.close')}
                onClick={() => {
                  blurActiveElement();
                  onOpenChange(false);
                }}
                className={cn(
                  'pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-sm backdrop-blur-xl transition-colors',
                  surface.borderStrong,
                  surface.subtleBg,
                  surface.hoverBg,
                  surface.textPrimary
                )}
                style={mobileDismissStyle}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
          {mobileCoverSheet ? (
            <button
              type="button"
              onPointerDown={handleMobileCoverSheetPointerDown}
              onClick={handleMobileCoverSheetHandleClick}
              className="relative z-[3] mx-auto mt-1 mb-0 hidden h-9 w-20 touch-none items-center justify-center max-sm:flex"
              aria-label={
                isMobileCoverSheetFullscreen ? 'Close dialog' : 'Drag dialog to fullscreen or close'
              }
            >
              <span className="h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />
            </button>
          ) : null}
          {contentGlowClassName || contentGlowStyle ? (
            <div
              data-dialog-content-glow
              className={`absolute inset-0 ${contentGlowClassName ?? ''}`}
              style={contentGlowStyle}
            />
          ) : null}
          {contentOverlayClassName ? (
            <div
              className={`pointer-events-none absolute inset-0 ${contentOverlayClassName}`}
              style={contentOverlayStyle}
            />
          ) : null}
          {hasDecoratedContent ? (
            <div className={`relative z-[2] ${resolvedBodyClassName}`}>{children}</div>
          ) : mobileCoverSheet ? (
            <div className={resolvedBodyClassName}>{children}</div>
          ) : (
            children
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function getWidgetRoomSelector(roomSelector: BaseCardDialogRoomSelector, theme: ThemeType) {
  const isLightTheme = theme === 'light';

  return (
    <div className="relative inline-flex items-center">
      <div
        className={`inline-flex min-w-0 items-center text-xs font-medium ${
          isLightTheme ? 'text-slate-700' : 'text-white/82'
        }`}
      >
        <CompactRoomSelector
          value={roomSelector.value}
          label={roomSelector.label}
          options={roomSelector.options}
          onChange={roomSelector.onChange}
          contentClassName="gap-1 text-xs"
          labelClassName="max-w-[10rem]"
          iconClassName="h-3 w-3"
        />
      </div>
    </div>
  );
}

function BaseCardDialogCardVariant({
  isOpen,
  onOpenChange,
  onCloseAutoFocus,
  title,
  entityId,
  entityType,
  excludeHelperEntityIds,
  helperControlsTheme,
  description,
  tabs,
  theme,
  tintColor,
  defaultTintAccent,
  footerContent,
  footerActionLabel,
  roomSelector,
  roomSelectorFallbackRoomName,
  editableTitle = true,
  onTitleChange,
  headerEyebrow,
  headerPresentation,
  titleEditing,
  onTitleEditingChange,
  showTabList = true,
  navigation = 'overflow',
  onRemoveCard,
  removeCardLabel,
  mobileCoverSheetActions,
  headerSupportingContent,
  headerTrailing,
  headerClassName,
  showHeaderDivider = true,
  bodyClassName,
  scrollClassName,
  contentSurface,
  contentClassName,
  contentStyle,
  contentGlowClassName,
  contentGlowStyle,
  contentOverlayClassName,
  contentOverlayStyle,
  disableOpenAutoFocus = false,
  maxWidth = 'md',
  height,
  mobileFitContent = false,
  activeTab,
  defaultTab,
  onActiveTabChange,
}: BaseCardDialogCardProps) {
  const { t } = useI18n();
  const { accentColor } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const dialogSurface = contentSurface ?? getBaseCardDialogSurface(theme);
  const overflowNavigation = navigation === 'overflow';
  const [internalTitleEditing, setInternalTitleEditing] = useState(false);
  const resolvedTitleEditing = titleEditing ?? internalTitleEditing;
  const handleTitleEditingChange = (editing: boolean) => {
    setInternalTitleEditing(editing);
    onTitleEditingChange?.(editing);
  };
  const dialogTabs =
    overflowNavigation &&
    !tabs.some((tab) => tab.key === 'room') &&
    (entityId || roomSelector?.onChange)
      ? [
          ...tabs,
          {
            key: 'room',
            label: t('dashboard.roomsWorkspace.editRoom'),
            icon: MapPin,
            content: roomSelector ? (
              getWidgetRoomSelector(roomSelector, theme)
            ) : (
              <EntityRoomSelector
                entityId={entityId ?? ''}
                fallbackRoomName={roomSelectorFallbackRoomName}
              />
            ),
          },
        ]
      : tabs;
  const firstTabKey = dialogTabs[0]?.key;
  const shouldRenderTabs = dialogTabs.length > 1;
  const [internalActiveTab, setInternalActiveTab] = useState(defaultTab ?? firstTabKey ?? '');
  const requestedTab = activeTab ?? internalActiveTab;
  const resolvedActiveTab = dialogTabs.some((tab) => tab.key === requestedTab)
    ? requestedTab
    : (firstTabKey ?? '');
  const resolvedDescription = description ?? entityType;

  useEffect(() => {
    if (!firstTabKey) return;
    if (!defaultTab && activeTab === undefined) setInternalActiveTab(firstTabKey);
  }, [activeTab, defaultTab, firstTabKey]);

  useEffect(() => {
    if (!isOpen || activeTab !== undefined || !resolvedActiveTab) return;
    setInternalActiveTab(resolvedActiveTab);
  }, [activeTab, isOpen, resolvedActiveTab]);

  useEffect(() => {
    if (!isOpen && overflowNavigation) {
      setInternalActiveTab(firstTabKey ?? '');
      setInternalTitleEditing(false);
    }
  }, [isOpen, overflowNavigation, firstTabKey]);

  const handleActiveTabChange = (nextTab: string) => {
    if (activeTab === undefined) setInternalActiveTab(nextTab);
    onActiveTabChange?.(nextTab);
  };

  const paletteControlStyle = useMemo(
    () => getInheritedDialogSectionStyle(theme, tintColor, defaultTintAccent ?? accentColor),
    [accentColor, defaultTintAccent, theme, tintColor]
  );
  const widgetRoomSelector = useMemo(
    () => (roomSelector ? getWidgetRoomSelector(roomSelector, theme) : null),
    [roomSelector, theme]
  );

  const resolvedContentClassName = cn(
    settingsDialogContentClass(dialogSurface, {
      maxWidth,
      height,
      padding: false,
    }),
    contentClassName
  );

  const canEditName = Boolean(editableTitle && (entityId || onTitleChange));
  const hasOverflowActions = dialogTabs.length > 1 || canEditName || entityId || onRemoveCard;
  const menu =
    overflowNavigation && hasOverflowActions ? (
      <CardDialogOverflowMenu
        theme={theme}
        sections={dialogTabs.slice(1)}
        onSectionChange={handleActiveTabChange}
        onEditName={
          canEditName
            ? () => {
                handleActiveTabChange(firstTabKey ?? '');
                handleTitleEditingChange(true);
              }
            : undefined
        }
        entityId={entityId}
        onRemoveCard={
          onRemoveCard
            ? () => {
                onOpenChange(false);
                onRemoveCard();
              }
            : undefined
        }
        removeCardLabel={removeCardLabel}
      />
    ) : null;
  const readOnlyRoom = roomSelector ? (
    <span className={`truncate text-xs font-medium ${surface.textSecondary}`}>
      {roomSelector.label}
    </span>
  ) : entityId ? (
    <EntityRoomSelector
      entityId={entityId}
      fallbackRoomName={roomSelectorFallbackRoomName}
      readOnly
      className={`truncate text-xs font-medium ${surface.textSecondary}`}
    />
  ) : null;

  const cardHeader = (
    <header
      data-card-dialog-header
      className={cn(
        coverSheetHeaderClassName,
        'shrink-0 max-sm:pt-2 max-sm:pr-4',
        overflowNavigation && 'pb-0 sm:pb-0',
        !overflowNavigation && showHeaderDivider && ['border-b', dialogSurface.border]
      )}
    >
      <CardDialogHeader
        presentation={overflowNavigation ? 'compact' : headerPresentation}
        titleEditing={resolvedTitleEditing}
        onTitleEditingChange={handleTitleEditingChange}
        title={title}
        description={resolvedDescription}
        entityId={roomSelector ? undefined : entityId}
        eyebrow={headerEyebrow ?? (overflowNavigation ? readOnlyRoom : widgetRoomSelector)}
        showRoomSelector={!overflowNavigation && !roomSelector}
        theme={theme}
        roomSelectorFallbackRoomName={roomSelectorFallbackRoomName}
        editableTitle={editableTitle}
        onTitleChange={onTitleChange}
        supportingContent={headerSupportingContent}
        trailing={
          overflowNavigation ? <div className="hidden sm:block">{menu}</div> : headerTrailing
        }
        className={cn('mb-0', overflowNavigation ? 'max-sm:pr-24' : 'max-sm:pr-0', headerClassName)}
      />

      {shouldRenderTabs && showTabList && !overflowNavigation ? (
        <CardDialogTabList segmented className="mt-3 mb-0">
          {dialogTabs.map((tab) => (
            <CardDialogTabTrigger
              segmented
              key={tab.key}
              active={resolvedActiveTab === tab.key}
              icon={tab.icon}
              onClick={() => handleActiveTabChange(tab.key)}
            >
              {tab.label}
            </CardDialogTabTrigger>
          ))}
        </CardDialogTabList>
      ) : null}
    </header>
  );

  const renderControlsContent = (tab: BaseCardDialogTab) => (
    <>
      {tab.content}
      {tab.key === firstTabKey && entityId && isOpen ? (
        <EntityHelperControls
          entityId={entityId}
          excludeEntityIds={excludeHelperEntityIds}
          theme={helperControlsTheme ?? theme}
        />
      ) : null}
    </>
  );
  const renderSectionContent = (tab: BaseCardDialogTab) =>
    overflowNavigation && tab.key !== firstTabKey ? (
      <div className="space-y-4">
        <Button
          variant="soft"
          size="compact"
          leading={<ArrowLeft className="h-4 w-4" />}
          onClick={() => handleActiveTabChange(firstTabKey ?? '')}
        >
          {t('common.backToControls')}
        </Button>
        {renderControlsContent(tab)}
      </div>
    ) : (
      renderControlsContent(tab)
    );
  const cardBody = (
    <CardDialogBody className={bodyClassName}>
      {overflowNavigation
        ? dialogTabs.map((tab) => (
            <section key={tab.key} aria-label={tab.label} hidden={tab.key !== resolvedActiveTab}>
              {renderSectionContent(tab)}
            </section>
          ))
        : shouldRenderTabs
          ? dialogTabs.map((tab) => (
              <TabPanel key={tab.key} value={tab.key}>
                {renderControlsContent(tab)}
              </TabPanel>
            ))
          : dialogTabs[0]
            ? renderControlsContent(dialogTabs[0])
            : null}

      {footerContent ? (
        footerContent
      ) : (
        <CardDialogFooter>
          <Dialog.Close asChild>
            <Button variant="soft" style={paletteControlStyle}>
              {footerActionLabel ?? t('common.done')}
            </Button>
          </Dialog.Close>
        </CardDialogFooter>
      )}
    </CardDialogBody>
  );

  return (
    <BaseCardDialogRoot
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onCloseAutoFocus={onCloseAutoFocus}
      disableOpenAutoFocus={disableOpenAutoFocus}
      overlayClassName={surface.dialogBackdrop}
      contentClassName={resolvedContentClassName}
      contentStyle={contentStyle}
      contentGlowClassName={contentGlowClassName}
      contentGlowStyle={contentGlowStyle}
      contentOverlayClassName={contentOverlayClassName}
      contentOverlayStyle={contentOverlayStyle}
      mobileFitContent={mobileFitContent}
      persistentMobileDismiss
      mobileDismissStyle={paletteControlStyle}
      mobileCoverSheetActions={overflowNavigation ? menu : mobileCoverSheetActions}
    >
      <CustomScrollbar
        isOn={theme !== 'light'}
        className={cn('max-sm:min-h-0 max-sm:flex-1', scrollClassName)}
      >
        {shouldRenderTabs ? (
          <Tabs
            value={resolvedActiveTab}
            defaultValue={defaultTab ?? firstTabKey}
            onValueChange={handleActiveTabChange}
          >
            {cardHeader}
            {cardBody}
          </Tabs>
        ) : (
          <>
            {cardHeader}
            {cardBody}
          </>
        )}
      </CustomScrollbar>
    </BaseCardDialogRoot>
  );
}

function BaseCardDialogModalVariant({
  onCloseAutoFocus,
  isOpen,
  onOpenChange,
  title,
  description,
  theme,
  overlayClassName,
  contentClassName,
  contentStyle,
  contentGlowClassName,
  contentGlowStyle,
  contentOverlayClassName,
  contentOverlayStyle,
  disableOpenAutoFocus = false,
  maxWidth = 'md',
  height,
  bodyClassName,
  shellBodyClassName,
  children,
  contentTitle,
  contentDescription,
  titleInContent = false,
  bodyPadding = true,
  mobileCoverSheet = false,
  persistentMobileDismiss = false,
  mobileCoverSheetActions,
}: BaseCardDialogModalProps) {
  const surface = getThemeSurfaceTokens(theme);

  return (
    <BaseCardDialogRoot
      onCloseAutoFocus={onCloseAutoFocus}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      disableOpenAutoFocus={disableOpenAutoFocus}
      overlayClassName={overlayClassName ?? surface.dialogBackdrop}
      contentTitle={titleInContent ? undefined : (contentTitle ?? title)}
      contentDescription={contentDescription ?? description}
      contentClassName={cn(
        settingsDialogContentClass(surface, {
          maxWidth,
          height,
          overflow: Boolean(height),
          padding: false,
          animate: true,
        }),
        contentClassName
      )}
      contentStyle={contentStyle}
      contentGlowClassName={contentGlowClassName}
      contentGlowStyle={contentGlowStyle}
      contentOverlayClassName={contentOverlayClassName}
      contentOverlayStyle={contentOverlayStyle}
      bodyClassName={shellBodyClassName}
      mobileCoverSheet={mobileCoverSheet}
      persistentMobileDismiss={persistentMobileDismiss}
      mobileCoverSheetActions={mobileCoverSheetActions}
    >
      <div
        className={cn(
          bodyPadding ? 'p-6 max-sm:px-3.5 max-sm:pt-2 max-sm:pb-3' : '',
          bodyClassName
        )}
      >
        {children}
      </div>
    </BaseCardDialogRoot>
  );
}

function BaseCardDialogSheetVariant({
  isOpen,
  onOpenChange,
  title,
  description,
  theme,
  overlayClassName,
  contentClassName,
  contentStyle,
  contentGlowClassName,
  contentGlowStyle,
  bodyClassName,
  children,
  accentColor,
  contentTitle,
  contentDescription,
  titleInContent = false,
  persistentMobileDismiss = true,
  closeLabel,
  onCloseAutoFocus,
}: BaseCardDialogSheetProps) {
  const resolvedContentStyle: CSSProperties = {
    ...(theme === 'glass' && accentColor
      ? {
          boxShadow: `0 -24px 64px -40px ${accentColor}66, 0 24px 48px -36px rgba(0,0,0,0.72)`,
        }
      : {}),
    ...contentStyle,
  };

  return (
    <BaseCardDialogRoot
      onCloseAutoFocus={onCloseAutoFocus}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      contentTitle={titleInContent ? undefined : (contentTitle ?? title)}
      contentDescription={contentDescription ?? description}
      overlayClassName={overlayClassName ?? 'animate-in fade-in bg-black/55 backdrop-blur-sm'}
      contentClassName={cn(
        'fixed inset-x-0 bottom-0 z-50 mx-auto max-w-none overflow-hidden rounded-t-[30px] rounded-b-none border border-white/12 bg-zinc-950/96 shadow-2xl backdrop-blur-2xl outline-none sm:inset-x-2 sm:bottom-2 sm:max-w-xl sm:rounded-[30px]',
        contentClassName
      )}
      contentGlowClassName={contentGlowClassName}
      contentGlowStyle={contentGlowStyle}
      contentStyle={resolvedContentStyle}
      mobileCoverSheet
      persistentMobileDismiss={persistentMobileDismiss}
      mobileDismissLabel={closeLabel}
      bodyClassName={cn(
        'relative pb-[calc(env(safe-area-inset-bottom,0px)+0.9rem)] max-sm:overflow-y-auto max-sm:overscroll-contain max-sm:touch-pan-y',
        bodyClassName
      )}
    >
      {children}
    </BaseCardDialogRoot>
  );
}

function BaseCardDialogFullscreenVariant({
  onCloseAutoFocus,
  isOpen,
  onOpenChange,
  title,
  description,
  theme,
  overlayClassName,
  contentClassName,
  contentStyle,
  contentGlowClassName,
  contentGlowStyle,
  contentOverlayClassName,
  contentOverlayStyle,
  disableOpenAutoFocus = false,
  shellBodyClassName,
  children,
  contentTitle,
  contentDescription,
  titleInContent = false,
  mobileCoverSheet = true,
  persistentMobileDismiss = true,
}: BaseCardDialogFullscreenProps) {
  const surface = getThemeSurfaceTokens(theme);

  return (
    <BaseCardDialogRoot
      onCloseAutoFocus={onCloseAutoFocus}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      disableOpenAutoFocus={disableOpenAutoFocus}
      mobileCoverSheet={mobileCoverSheet}
      persistentMobileDismiss={persistentMobileDismiss}
      overlayClassName={overlayClassName ?? `animate-in fade-in ${surface.dialogBackdrop}`}
      contentTitle={titleInContent ? undefined : (contentTitle ?? title)}
      contentDescription={contentDescription ?? description}
      contentClassName={cn(
        'fixed inset-3 z-50 overflow-hidden rounded-[28px] border border-white/10 shadow-2xl outline-none animate-in fade-in zoom-in-95 duration-200 md:inset-8',
        theme === 'glass' ? 'bg-slate-950/55' : 'bg-black',
        contentClassName
      )}
      contentStyle={contentStyle}
      contentGlowClassName={contentGlowClassName}
      contentGlowStyle={contentGlowStyle}
      contentOverlayClassName={contentOverlayClassName}
      contentOverlayStyle={contentOverlayStyle}
      bodyClassName={shellBodyClassName}
    >
      {children}
    </BaseCardDialogRoot>
  );
}

export function BaseCardDialog(props: BaseCardDialogProps) {
  if (props.variant === 'modal') {
    return <BaseCardDialogModalVariant {...props} />;
  }

  if (props.variant === 'sheet') {
    return <BaseCardDialogSheetVariant {...props} />;
  }

  if (props.variant === 'fullscreen') {
    return <BaseCardDialogFullscreenVariant {...props} />;
  }

  return <BaseCardDialogCardVariant {...props} />;
}

export interface BaseCardDialogWithStateProps
  extends Omit<BaseCardDialogCardProps, 'tabs' | 'variant'> {
  controlsTabContent: ReactNode;
  controlsTabIcon?: LucideIcon;
  customizeTabContent?: ReactNode;
  extraTabs?: BaseCardDialogTab[];
}

export function BaseCardDialogWithState({
  controlsTabContent,
  controlsTabIcon = Sliders,
  customizeTabContent,
  extraTabs = [],
  ...props
}: BaseCardDialogWithStateProps) {
  const { t } = useI18n();

  const tabs: BaseCardDialogTab[] = [
    {
      key: 'controls',
      label: t('common.controls'),
      icon: controlsTabIcon,
      content: controlsTabContent,
    },
    ...(customizeTabContent || props.onTintColorChange
      ? [
          {
            key: 'card',
            label: t('common.customize'),
            icon: Palette,
            content: (
              <>
                {customizeTabContent}
                {props.onTintColorChange ? (
                  <CardDialogSection>
                    <CustomCardTintPicker
                      value={props.tintColor}
                      onChange={props.onTintColorChange}
                      defaultColor={props.defaultTintAccent ?? '#3b82f6'}
                      className={getThemeSurfaceTokens(props.theme).textMuted}
                    />
                  </CardDialogSection>
                ) : null}
              </>
            ),
          } as BaseCardDialogTab,
        ]
      : []),
    ...extraTabs,
  ];

  return <BaseCardDialog {...props} variant="card" tabs={tabs} />;
}
