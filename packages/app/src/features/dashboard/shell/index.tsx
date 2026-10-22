import { CompanionPanel } from '@navet/app/components/layout/companion-panel';
import { Header } from '@navet/app/components/layout/header';
import { HeaderDashboardActions } from '@navet/app/components/layout/header-dashboard-actions';
import { RoomNavActionsContext } from '@navet/app/components/layout/room-nav-actions-context';
import { getSectionNavigationItems } from '@navet/app/components/layout/section-navigation';
import { Sidebar } from '@navet/app/components/layout/sidebar';
import { useDashboardChromeLayout } from '@navet/app/components/layout/use-dashboard-sidebar-width';
import { useHeaderController } from '@navet/app/components/layout/use-header-controller';
import { useEffectiveEffectsQuality } from '@navet/app/components/shared/theme/effective-effects-quality';
import { getThemeColorValue } from '@navet/app/components/shared/theme/theme-colors';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { resolveWallpaperBackgroundImage } from '@navet/app/constants/built-in-wallpapers';
import { NotificationPanel } from '@navet/app/features/notifications';
import { useMediaQuery, usePrimaryColor, useThemeMode, useWallpaper } from '@navet/app/hooks';
import { DashboardSidebarWidthContext } from '@navet/app/hooks/use-breakpoint-cols';
import { useEditModeStore, useNavigationStore, useSettingsStore } from '@navet/app/stores';
import { editModeSelectors, settingsSelectors } from '@navet/app/stores/selectors';
import { detectDeviceTier } from '@navet/app/utils/detect-device-tier';
import { getLowestEffectsQuality } from '@navet/app/utils/effects-quality';
import { type CSSProperties, lazy, memo, Suspense, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useDashboardCollectionStore } from '../dashboards/dashboard-collection-store';
import { resolveDashboardPerformanceProfile } from '../hooks/use-dashboard-performance-mode';
import { ScreensaverGate } from '../screensaver/screensaver-gate';
import type { DashboardLayoutProps } from './types';
import { useKioskRoomSwipeNavigation } from './use-kiosk-room-swipe-navigation';

const KioskControlCenter = lazy(async () => {
  const module = await import('./kiosk-control-center');
  return { default: module.KioskControlCenter };
});

const CustomExtensionsDialog = lazy(async () => {
  const module = await import('@navet/app/features/settings/components/custom-extensions-dialog');
  return { default: module.CustomExtensionsDialog };
});

/**
 * Dashboard Layout Component
 * Provides consistent layout structure with sidebar and header
 * Memoized to prevent unnecessary re-renders
 */
export const DashboardLayout = memo(function DashboardLayout({
  children,
  densePerformanceMode = false,
  mobileEditActions,
  mobileRoomNavigation,
}: DashboardLayoutProps) {
  const theme = useThemeMode();
  const inheritedEffectsQuality = useEffectiveEffectsQuality();
  const wallpaper = useWallpaper();
  const primaryColor = usePrimaryColor();
  const { disableAnimations, lowPowerMode, effectsQuality } = useSettingsStore(
    useShallow((state) => ({
      disableAnimations: state.disableAnimations,
      lowPowerMode: state.lowPowerMode,
      effectsQuality: state.effectsQuality,
    }))
  );
  const kioskMode = useSettingsStore(settingsSelectors.kioskMode);
  const kioskSwipeRooms = useSettingsStore(settingsSelectors.kioskSwipeRooms);
  const isEditMode = useEditModeStore(editModeSelectors.isEditMode);
  const activeCustomSidebarActionId = useNavigationStore(
    (state) => state.activeCustomSidebarActionId
  );
  const dashboardSpaceMode = useSettingsStore(settingsSelectors.dashboardSpaceMode);
  const useReducedTabletPadding = useMediaQuery('(min-width: 768px) and (max-width: 1024px)');
  const showNavetSidebar = !kioskMode || activeCustomSidebarActionId !== null;
  const showNavetHeader = !kioskMode;
  const isGlass = theme === 'glass';
  const isBlack = theme === 'black';
  const performanceProfile = useMemo(
    () =>
      resolveDashboardPerformanceProfile({
        activeSection: 'home',
        deviceTier: detectDeviceTier(),
        effectsQuality,
        isEditMode: false,
        lowPowerMode,
        reducedEffectsEnabled: disableAnimations || lowPowerMode,
        visibleCardCount: 0,
        visibleDevices: [],
      }),
    [disableAnimations, effectsQuality, lowPowerMode]
  );
  const resolvedEffectsQuality = getLowestEffectsQuality(
    inheritedEffectsQuality,
    densePerformanceMode ? 'low' : performanceProfile.effectiveEffectsQuality
  );
  const surface = getThemeSurfaceTokens(theme, resolvedEffectsQuality);
  const isMediumEffects = resolvedEffectsQuality === 'medium';
  const isLowEffects = resolvedEffectsQuality === 'low';
  const showSharedGlassBlur = isGlass && resolvedEffectsQuality !== 'low';
  const [editingSidebarActionId, setEditingSidebarActionId] = useState<string | null>(null);
  const [isSidebarCustomizationOpen, setIsSidebarCustomizationOpen] = useState(false);
  const [isKioskControlCenterOpen, setIsKioskControlCenterOpen] = useState(false);
  const kioskSwipeHandlers = useKioskRoomSwipeNavigation({
    enabled:
      kioskMode &&
      kioskSwipeRooms &&
      !isEditMode &&
      !isKioskControlCenterOpen &&
      activeCustomSidebarActionId === null,
    navigation: mobileRoomNavigation,
  });
  const wallpaperBackgroundImage = resolveWallpaperBackgroundImage(wallpaper);
  const accentColorValue = getThemeColorValue(primaryColor);
  const contentSpacingClassName = useReducedTabletPadding
    ? showNavetSidebar
      ? 'gap-4 px-4 py-5 pb-6'
      : 'gap-4 px-3 py-4 pb-24'
    : !showNavetSidebar
      ? dashboardSpaceMode === 'more_space'
        ? 'gap-3 px-1.5 py-2 pb-24 md:gap-4 md:px-3 md:py-4 md:pb-24 lg:px-4 lg:py-5 lg:pb-24'
        : 'gap-3 p-2 pb-24 md:gap-4 md:p-4 md:pb-24 lg:p-5 lg:pb-24'
      : dashboardSpaceMode === 'more_space'
        ? 'gap-3.5 px-2.5 py-3 pb-20 md:gap-6 md:px-4 md:py-6 md:pb-6 lg:px-5 lg:py-8 lg:pb-8'
        : 'gap-3.5 p-3 pb-20 md:gap-6 md:p-6 md:pb-6 lg:p-8 lg:pb-8';

  const bgColor =
    theme === 'light'
      ? 'bg-gray-50'
      : isBlack
        ? 'bg-black'
        : isGlass
          ? 'bg-slate-950'
          : 'bg-[#0a0a0a]';
  const textColor = surface.textPrimary;

  return (
    <div
      data-testid="dashboard-document-surface"
      data-navet-effects-quality={resolvedEffectsQuality}
      className={`relative min-h-[100dvh] overflow-x-clip ${bgColor} ${textColor}`}
    >
      {/* Background Wallpaper with Theme-Specific Overlay */}
      {wallpaperBackgroundImage && (
        <div className="fixed inset-0 z-0">
          {/* Wallpaper Image */}
          <div
            data-testid="dashboard-wallpaper-image"
            className="absolute inset-0"
            style={{
              backgroundImage: wallpaperBackgroundImage,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
          />

          {/* Color Blend Overlay — skipped in LOW: no mixBlendMode is applied and
              the readability layer above it is opaque enough to cover it fully,
              so rendering this div in LOW mode is wasted paint work. */}
          {!isLowEffects && !densePerformanceMode && performanceProfile.allowAnimatedGradients && (
            <div
              data-testid="dashboard-wallpaper-accent-overlay"
              className="absolute inset-0"
              style={{
                background:
                  theme === 'light'
                    ? `radial-gradient(circle at 14% 14%, rgba(255,255,255,0.34) 0%, transparent 24%), linear-gradient(135deg, ${accentColorValue}2e 0%, ${accentColorValue}16 40%, rgba(255,255,255,0.10) 76%, transparent 100%)`
                    : isBlack
                      ? 'linear-gradient(180deg, rgba(0,0,0,0.68), rgba(0,0,0,0.46) 42%, rgba(0,0,0,0.74))'
                      : isGlass
                        ? resolvedEffectsQuality === 'high'
                          ? `radial-gradient(circle at 14% 14%, rgba(255,255,255,0.24) 0%, transparent 18%), radial-gradient(circle at 16% 18%, ${accentColorValue}52 0%, transparent 34%), radial-gradient(circle at 84% 12%, rgba(255,255,255,0.22) 0%, transparent 24%), linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04) 24%, transparent 58%)`
                          : `linear-gradient(135deg, ${accentColorValue}28, rgba(255,255,255,0.08), rgba(15,23,42,0.18) 72%)`
                        : `linear-gradient(135deg, ${accentColorValue}40, ${accentColorValue}20, transparent 60%)`,
                mixBlendMode: isGlass ? 'screen' : undefined,
              }}
            />
          )}

          {/* Shared readability/glass layer */}
          <div
            data-testid="dashboard-wallpaper-readability-layer"
            className={`absolute inset-0 ${showSharedGlassBlur ? 'backdrop-blur-sm' : ''}`}
            style={{
              backgroundColor:
                theme === 'light'
                  ? isLowEffects
                    ? 'rgba(249, 250, 251, 0.86)'
                    : 'rgba(249, 250, 251, 0.68)'
                  : isBlack
                    ? isLowEffects
                      ? 'rgba(0, 0, 0, 0.74)'
                      : isMediumEffects
                        ? 'rgba(0, 0, 0, 0.62)'
                        : 'rgba(0, 0, 0, 0.52)'
                    : isGlass
                      ? resolvedEffectsQuality === 'high'
                        ? 'rgba(7, 12, 22, 0.40)'
                        : isMediumEffects
                          ? 'rgba(8, 13, 22, 0.66)'
                          : 'rgba(8, 12, 20, 0.82)'
                      : 'rgba(10, 10, 10, 0.55)',
            }}
          />
        </div>
      )}

      {isGlass && !wallpaperBackgroundImage && (
        <div className="fixed inset-0 z-0 overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              background:
                performanceProfile.allowAnimatedGradients && !densePerformanceMode
                  ? 'radial-gradient(circle at 12% 10%, rgba(255,255,255,0.20) 0%, transparent 18%), radial-gradient(circle at 14% 18%, rgba(255,255,255,0.10) 0%, transparent 26%), radial-gradient(circle at 18% 80%, rgba(59,130,246,0.20) 0%, transparent 28%), radial-gradient(circle at 82% 14%, rgba(255,255,255,0.10) 0%, transparent 24%), radial-gradient(circle at 78% 72%, rgba(255,255,255,0.06) 0%, transparent 22%), linear-gradient(180deg, rgba(12,18,32,0.95), rgba(7,10,18,0.98))'
                  : isMediumEffects
                    ? 'linear-gradient(180deg, rgba(18,24,38,0.96), rgba(10,14,24,0.98)), linear-gradient(135deg, rgba(255,255,255,0.05), transparent 42%)'
                    : 'linear-gradient(180deg, rgba(12,18,32,0.98), rgba(7,10,18,0.99))',
            }}
          />
          {showSharedGlassBlur ? (
            <div className="absolute inset-0 transform-[translateZ(0)] backdrop-blur-[28px]" />
          ) : null}
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 min-h-[100dvh] overflow-x-clip">
        <DashboardChrome
          contentSpacingClassName={contentSpacingClassName}
          kioskMode={kioskMode}
          kioskSwipeHandlers={kioskSwipeHandlers}
          kioskSwipeRooms={kioskSwipeRooms}
          mobileEditActions={mobileEditActions}
          mobileRoomNavigation={mobileRoomNavigation}
          showNavetHeader={showNavetHeader}
          showNavetSidebar={showNavetSidebar}
        >
          {children}
        </DashboardChrome>
        {kioskMode && !showNavetSidebar ? (
          <Suspense fallback={null}>
            <KioskControlCenter
              editActions={mobileEditActions}
              open={isKioskControlCenterOpen}
              onOpenChange={setIsKioskControlCenterOpen}
              onCustomizeSidebar={() => {
                setEditingSidebarActionId(null);
                setIsSidebarCustomizationOpen(true);
              }}
              onEditSidebarItem={(id) => {
                setEditingSidebarActionId(id);
                setIsSidebarCustomizationOpen(true);
              }}
              roomNavigation={mobileRoomNavigation}
            />
          </Suspense>
        ) : null}
        {isSidebarCustomizationOpen ? (
          <Suspense fallback={null}>
            <CustomExtensionsDialog
              editingActionId={editingSidebarActionId}
              isOpen
              onOpenChange={(open) => {
                setIsSidebarCustomizationOpen(open);
                if (!open) {
                  setEditingSidebarActionId(null);
                }
              }}
              mode="sidebar"
            />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
});

function DashboardChrome({
  children,
  contentSpacingClassName,
  kioskMode,
  kioskSwipeHandlers,
  kioskSwipeRooms,
  mobileEditActions,
  mobileRoomNavigation,
  showNavetHeader,
  showNavetSidebar,
}: Pick<DashboardLayoutProps, 'children' | 'mobileEditActions' | 'mobileRoomNavigation'> & {
  contentSpacingClassName: string;
  kioskMode: boolean;
  kioskSwipeHandlers: ReturnType<typeof useKioskRoomSwipeNavigation>;
  kioskSwipeRooms: boolean;
  showNavetHeader: boolean;
  showNavetSidebar: boolean;
}) {
  const headerController = useHeaderController();
  const activeSection = useNavigationStore((state) => state.activeSection);
  const customAction = useNavigationStore((state) => state.activeCustomSidebarActionId);
  const choresEnabled = useSettingsStore((state) => state.choresEnabled);
  const storeEditing = useEditModeStore((state) => state.isEditMode);
  const panelEditing = useDashboardCollectionStore((state) => state.companionCustomizationOpen);
  const { sidebarWidth, expanded, companionAvailable } = useDashboardChromeLayout();
  const collapsed = useSettingsStore((state) => state.companionCollapsed);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const companion = (
    <CompanionPanel
      controller={headerController}
      editing={mobileEditActions?.isEditMode ?? storeEditing}
    />
  );
  const actionsBesideRooms =
    showNavetHeader && expanded && activeSection === 'home' && customAction === null;

  return (
    <div
      className="min-h-[100dvh]"
      style={{ '--dashboard-sidebar-width': `${sidebarWidth}px` } as CSSProperties}
    >
      {showNavetSidebar ? (
        <Sidebar
          companion={expanded ? companion : undefined}
          companionControlsId="dashboard-companion-panel"
          companionExpanded={expanded}
          onToggleCompanion={
            kioskMode || !companionAvailable
              ? undefined
              : () => {
                  updateSettings({ companionCollapsed: !collapsed });
                }
          }
          activeColorValue={headerController.activeColorValue}
          handleClearSearch={headerController.handleClearSearch}
          handleSearchChange={headerController.handleSearchChange}
          handleToggleMobileSearch={headerController.handleToggleMobileSearch}
          hoverBg={headerController.hoverBg}
          inputBg={headerController.inputBg}
          isMobileSearchOpen={headerController.isMobileSearchOpen}
          isSearchActive={headerController.isSearchActive}
          isSearchFocused={headerController.isSearchFocused}
          mobileRoomNavigation={mobileRoomNavigation}
          mobileSearchInputRef={headerController.mobileSearchInputRef}
          searchQuery={headerController.searchQuery}
          setIsSearchFocused={headerController.setIsSearchFocused}
          textPrimary={headerController.textPrimary}
          textSecondary={headerController.textSecondary}
        />
      ) : null}

      <div
        data-testid="dashboard-layout-content"
        data-kiosk-room-swipe={kioskMode && kioskSwipeRooms ? 'enabled' : undefined}
        onPointerCancel={kioskSwipeHandlers.onPointerCancel}
        onPointerDown={kioskSwipeHandlers.onPointerDown}
        onPointerUp={kioskSwipeHandlers.onPointerUp}
        style={{ marginLeft: sidebarWidth }}
        className={`safe-area-pt-5 min-w-0 flex flex-col overflow-x-clip ${contentSpacingClassName}`}
      >
        {showNavetHeader && !actionsBesideRooms ? (
          <Header
            controller={headerController}
            renderNotifications={false}
            mobileEditActions={mobileEditActions}
            mobileRoomNavigation={mobileRoomNavigation}
          />
        ) : null}
        {actionsBesideRooms ? (
          <h1 className="sr-only">
            {
              getSectionNavigationItems(headerController.t, choresEnabled).find(
                (item) => item.section === activeSection
              )?.label
            }
          </h1>
        ) : null}
        <span id="dashboard-main-content" tabIndex={-1} className="sr-only" />
        <DashboardSidebarWidthContext.Provider value={sidebarWidth}>
          <RoomNavActionsContext.Provider
            value={
              actionsBesideRooms ? (
                <HeaderDashboardActions
                  controller={headerController}
                  editActions={mobileEditActions}
                />
              ) : null
            }
          >
            {children}
          </RoomNavActionsContext.Provider>
        </DashboardSidebarWidthContext.Provider>
      </div>
      <ScreensaverGate editing={Boolean(mobileEditActions?.isEditMode || panelEditing)} />
      {headerController.isNotificationOpen ? (
        <NotificationPanel
          isOpen
          onClose={headerController.closeNotifications}
          triggerRefs={[
            headerController.desktopNotificationButtonRef,
            headerController.mobileNotificationButtonRef,
          ]}
        />
      ) : null}
    </div>
  );
}

export type { DashboardLayoutProps } from './types';
