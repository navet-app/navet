import { HeaderSearchInput } from '@navet/app/components/layout/header-search-input';
import { MobileSectionOrbitSheet } from '@navet/app/components/layout/mobile-section-orbit-sheet';
import { Button } from '@navet/app/components/primitives';
import { InteractivePill } from '@navet/app/components/primitives/interactive-pill';
import { getCardShellSurfaceTokens } from '@navet/app/components/shared/theme/card-shell-surface-tokens';
import { getInteractivePillStyles } from '@navet/app/components/shared/theme/interactive-pill-styles';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@navet/app/components/ui/dropdown-menu';
import { getDashboardRoomLabel, isAllRooms } from '@navet/app/constants/rooms';
import { DashboardCreateDialog } from '@navet/app/features/dashboard/dashboards/dashboard-create-dialog';
import {
  DashboardSwitcherMenuContent,
  useDashboardSwitcher,
} from '@navet/app/features/dashboard/dashboards/dashboard-switcher';
import { useHomeAssistantPanelShell, useI18n, useMediaQuery, useTheme } from '@navet/app/hooks';
import { useEditModeStore, useNavigationStore, useSettingsStore } from '@navet/app/stores';
import { settingsSelectors } from '@navet/app/stores/selectors';
import { getCustomExtensionIcon } from '@navet/app/utils/custom-extension-icons';
import {
  ADVANCED_CUSTOM_SIDEBAR_ACTION_LIMIT,
  isSidebarActionVisible,
  openCustomExtensionUrl,
} from '@navet/app/utils/custom-extensions';
import { resolveEffectsQuality } from '@navet/app/utils/effects-quality';
import { getPublicAssetUrl } from '@navet/app/utils/public-assets';
import { roomNamesMatch } from '@navet/app/utils/room-name';
import {
  Check,
  ChevronDown,
  Compass,
  DoorOpen,
  LayoutPanelLeft,
  LogOut,
  type LucideIcon,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  X,
} from 'lucide-react';
import {
  lazy,
  memo,
  type ReactNode,
  type RefObject,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { HeaderAssistAction } from './header-assist-action';
import type { MobileRoomNavigation } from './mobile-room-dropdown';
import { filterHiddenRooms, getVisibleRoomNavRooms } from './room-nav.utils';
import {
  getOrderedSectionNavigationItems,
  getSectionNavigationItems,
  MOBILE_SECTION_DOCK_ORDER,
} from './section-navigation';

const CustomExtensionsDialog = lazy(async () => {
  const module = await import('../../features/settings/components/custom-extensions-dialog');
  return { default: module.CustomExtensionsDialog };
});

interface SidebarProps {
  companion?: ReactNode;
  companionControlsId?: string;
  companionExpanded?: boolean;
  onToggleCompanion?: () => void;
  activeColorValue?: string;
  handleClearSearch?: () => void;
  handleSearchChange?: (value: string) => void;
  handleToggleMobileSearch?: () => void;
  hoverBg?: string;
  inputBg?: string;
  isMobileSearchOpen?: boolean;
  isSearchActive?: boolean;
  isSearchFocused?: boolean;
  mobileRoomNavigation?: MobileRoomNavigation;
  mobileSearchInputRef?: RefObject<HTMLInputElement | null>;
  searchQuery?: string;
  setIsSearchFocused?: (focused: boolean) => void;
  textPrimary?: string;
  textSecondary?: string;
}

export const Sidebar = memo(function Sidebar({
  companion,
  companionControlsId = 'dashboard-companion-panel',
  companionExpanded = false,
  onToggleCompanion,
  activeColorValue,
  handleClearSearch = () => {},
  handleSearchChange = () => {},
  handleToggleMobileSearch = () => {},
  hoverBg,
  inputBg,
  isMobileSearchOpen = false,
  isSearchActive = false,
  isSearchFocused = false,
  mobileRoomNavigation,
  mobileSearchInputRef,
  searchQuery = '',
  setIsSearchFocused = () => {},
  textPrimary,
  textSecondary,
}: SidebarProps) {
  const { theme, primaryColor } = useTheme();
  const { t } = useI18n();
  const { activeDashboard, dashboards } = useDashboardSwitcher();
  const hasMultipleDashboards = dashboards.length > 1;
  const [isDashboardCreateOpen, setIsDashboardCreateOpen] = useState(false);
  const {
    activeCustomSidebarActionId,
    activeSection,
    setActiveSection,
    setActiveCustomSidebarAction,
  } = useNavigationStore(
    useShallow((state) => ({
      activeCustomSidebarActionId: state.activeCustomSidebarActionId,
      activeSection: state.activeSection,
      setActiveSection: state.setActiveSection,
      setActiveCustomSidebarAction: state.setActiveCustomSidebarAction,
    }))
  );
  const { choresEnabled, effectsQuality, lowPowerMode } = useSettingsStore(
    useShallow((state) => ({
      choresEnabled: state.choresEnabled,
      effectsQuality: state.effectsQuality,
      lowPowerMode: state.lowPowerMode,
    }))
  );
  const advancedCustomizationEnabled = useSettingsStore(
    settingsSelectors.advancedCustomizationEnabled
  );
  const customSidebarActions = useSettingsStore(settingsSelectors.customSidebarActions);
  const isEditMode = useEditModeStore((state) => state.isEditMode);
  const resolvedEffectsQuality = resolveEffectsQuality(effectsQuality, lowPowerMode);
  const surface = useMemo(
    () => getThemeSurfaceTokens(theme, resolvedEffectsQuality),
    [resolvedEffectsQuality, theme]
  );
  const cardShell = useMemo(() => getCardShellSurfaceTokens(theme), [theme]);
  const isGlass = theme === 'glass';
  const isLight = theme === 'light';
  const isHighEffects = resolvedEffectsQuality === 'high';
  const resolvedHoverBg = hoverBg ?? surface.hoverBg;
  const resolvedInputBg = inputBg ?? surface.inputBg;
  const resolvedTextPrimary = textPrimary ?? surface.textPrimary;
  const resolvedTextSecondary = textSecondary ?? surface.textSecondary;
  const inactiveColor = `${surface.textMuted} ${resolvedHoverBg}`;
  const sidebarDividerClass = theme === 'light' ? 'bg-slate-300/90' : 'bg-white/14';
  const [isMobileNavHidden, setIsMobileNavHidden] = useState(false);
  const [isOrbitOpen, setIsOrbitOpen] = useState(false);
  const [isSidebarCustomizationOpen, setIsSidebarCustomizationOpen] = useState(false);
  const [editingSidebarActionId, setEditingSidebarActionId] = useState<string | null>(null);
  const lastScrollYRef = useRef(0);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isShortDesktopViewport = useMediaQuery('(max-height: 800px)');
  const homeAssistantShell = useHomeAssistantPanelShell();

  useEffect(() => {
    if (!isMobile) {
      setIsMobileNavHidden(false);
      setIsOrbitOpen(false);
      return;
    }

    const showThreshold = 96;
    const hideThreshold = 120;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY <= showThreshold) {
        setIsMobileNavHidden(false);
      } else if (currentScrollY > lastScrollYRef.current && currentScrollY > hideThreshold) {
        setIsMobileNavHidden(true);
      }

      lastScrollYRef.current = currentScrollY;
    };

    lastScrollYRef.current = window.scrollY;
    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMobile]);

  const menuItems = useMemo(
    () =>
      getSectionNavigationItems(t, choresEnabled).map((item) => ({
        id: item.section,
        ...item,
        onClick: () => setActiveSection(item.section),
      })),
    [choresEnabled, setActiveSection, t]
  );
  const customMenuItems = useMemo(
    () =>
      (advancedCustomizationEnabled ? customSidebarActions : [])
        .filter((item) => isSidebarActionVisible(item, isMobile))
        .map((item) => ({
          active:
            item.targetType === 'section'
              ? activeCustomSidebarActionId === null && item.targetSection === activeSection
              : item.targetType === 'iframe'
                ? activeCustomSidebarActionId === item.id
                : false,
          id: item.id,
          icon: getCustomExtensionIcon(item.icon),
          label: item.label,
          section: item.targetType === 'section' ? item.targetSection : undefined,
          onEdit: () => {
            setEditingSidebarActionId(item.id);
            setIsSidebarCustomizationOpen(true);
          },
          onClick: () => {
            if (isEditMode) {
              setEditingSidebarActionId(item.id);
              setIsSidebarCustomizationOpen(true);
              return;
            }

            if (item.targetType === 'section' && item.targetSection) {
              setActiveSection(item.targetSection);
              return;
            }

            if (item.targetType === 'iframe') {
              setActiveCustomSidebarAction(item.id);
              return;
            }

            if (item.targetType === 'url' && item.targetUrl) {
              openCustomExtensionUrl(item.targetUrl);
            }
          },
        })),
    [
      advancedCustomizationEnabled,
      customSidebarActions,
      isEditMode,
      isMobile,
      activeCustomSidebarActionId,
      setActiveSection,
      setActiveCustomSidebarAction,
      setIsSidebarCustomizationOpen,
    ]
  );
  const canAddCustomSidebarAction =
    isEditMode && customSidebarActions.length < ADVANCED_CUSTOM_SIDEBAR_ACTION_LIMIT;
  const useCompactDesktopRail =
    isShortDesktopViewport || customMenuItems.length + (canAddCustomSidebarAction ? 1 : 0) >= 4;
  const dockItems = useMemo(
    () =>
      getOrderedSectionNavigationItems(t, MOBILE_SECTION_DOCK_ORDER, choresEnabled).map((item) => ({
        ...item,
        onClick: () => setActiveSection(item.section),
      })),
    [choresEnabled, setActiveSection, t]
  );
  const HomeAssistantSidebarIcon =
    homeAssistantShell.isKioskEnabled === true ? PanelLeftOpen : PanelLeftClose;
  const visibleMobileRooms = useMemo(
    () =>
      mobileRoomNavigation
        ? getVisibleRoomNavRooms(
            filterHiddenRooms(
              mobileRoomNavigation.rooms,
              mobileRoomNavigation.hiddenRoomNames ?? []
            )
          )
        : [],
    [mobileRoomNavigation]
  );
  const searchAccessoryBackground = undefined;
  const mobileDockShadow = isGlass
    ? isHighEffects
      ? 'inset 0 1px 0 rgba(255,255,255,0.14), 0 24px 44px -24px rgba(0,0,0,0.62), 0 10px 20px -16px rgba(0,0,0,0.42)'
      : undefined
    : isLight
      ? '0 20px 36px -24px rgba(15,23,42,0.2), 0 8px 16px -14px rgba(15,23,42,0.12)'
      : '0 24px 40px -24px rgba(0,0,0,0.62), 0 10px 18px -14px rgba(0,0,0,0.36)';
  const mobileSearchFieldBg = resolvedInputBg;
  const mobileSearchFieldText = resolvedTextPrimary;
  const mobileSearchFieldIcon = resolvedTextSecondary;
  const getMobileTabPill = (isActive: boolean) =>
    getInteractivePillStyles({
      intent: 'navigation',
      isActive,
      primaryColor,
      theme,
      variant: isActive ? 'default' : 'ghost',
    });

  return (
    <>
      {/* Desktop Sidebar */}
      <div
        data-testid="desktop-sidebar"
        data-density={useCompactDesktopRail ? 'compact' : 'comfortable'}
        className={`fixed left-0 top-0 hidden h-full w-[var(--dashboard-sidebar-width,64px)] ${surface.shellPanel} border-r md:flex z-50`}
      >
        <div
          className={`flex w-16 shrink-0 flex-col items-center justify-between px-0 ${
            useCompactDesktopRail ? 'py-3' : 'py-5'
          }`}
        >
          <div className="flex h-10 w-10 items-center justify-center">
            <ImageWithFallback
              src={getPublicAssetUrl('logo.svg')}
              alt={t('sidebar.brandLogoAlt')}
              width={40}
              height={40}
              className="h-10 w-10"
            />
          </div>
          <div className={`flex flex-col ${useCompactDesktopRail ? 'gap-2' : 'gap-4'}`}>
            {menuItems.map((item) => (
              <InteractivePill
                key={item.id}
                onClick={item.onClick}
                aria-label={item.label}
                aria-current={
                  activeCustomSidebarActionId === null &&
                  item.section &&
                  activeSection === item.section
                    ? 'page'
                    : undefined
                }
                title={item.label}
                active={Boolean(
                  activeCustomSidebarActionId === null &&
                    item.section &&
                    activeSection === item.section
                )}
                variant="ghost"
                className={`flex h-10 w-10 items-center justify-center rounded-[22px] gap-0 px-0 py-0 md:gap-0 md:px-0 transition-colors ${
                  activeCustomSidebarActionId === null &&
                  item.section &&
                  activeSection === item.section
                    ? ''
                    : inactiveColor
                }`}
              >
                <item.icon className="h-5 w-5" />
              </InteractivePill>
            ))}
            {customMenuItems.length > 0 && !useCompactDesktopRail ? (
              <div
                aria-hidden="true"
                className={`mx-auto h-px w-6 rounded-full ${sidebarDividerClass}`}
              />
            ) : null}
            {customMenuItems.map((item) => (
              <div key={item.id} className="relative">
                <InteractivePill
                  onClick={item.onClick}
                  aria-label={item.label}
                  aria-current={item.active ? 'page' : undefined}
                  title={item.label}
                  active={item.active}
                  variant="ghost"
                  className={`flex h-10 w-10 items-center justify-center rounded-[22px] gap-0 px-0 py-0 md:gap-0 md:px-0 transition-colors ${
                    item.active ? '' : inactiveColor
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                </InteractivePill>
                {isEditMode ? (
                  <button
                    type="button"
                    aria-label={t('common.editItem', { item: item.label })}
                    title={t('common.editItem', { item: item.label })}
                    className={`absolute -right-1 -top-1 flex h-4.5 w-4.5 items-center justify-center rounded-full border ${
                      theme === 'light'
                        ? 'border-slate-300 bg-white text-slate-700'
                        : 'border-white/16 bg-black/75 text-white/82'
                    }`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setEditingSidebarActionId(item.id);
                      setIsSidebarCustomizationOpen(true);
                    }}
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </button>
                ) : null}
              </div>
            ))}
            {canAddCustomSidebarAction ? (
              <>
                <div
                  aria-hidden="true"
                  className={`mx-auto h-px w-6 rounded-full ${sidebarDividerClass}`}
                />
                <InteractivePill
                  onClick={() => {
                    setEditingSidebarActionId(null);
                    setIsSidebarCustomizationOpen(true);
                  }}
                  aria-label={t('sidebar.customize')}
                  title={t('sidebar.customize')}
                  active={false}
                  variant="ghost"
                  className={`flex h-10 w-10 items-center justify-center rounded-[22px] gap-0 px-0 py-0 md:gap-0 md:px-0 transition-colors ${inactiveColor}`}
                >
                  <Plus className="h-5 w-5" />
                </InteractivePill>
              </>
            ) : null}
          </div>
          <div className="flex flex-col gap-4">
            {onToggleCompanion ? (
              <InteractivePill
                onClick={onToggleCompanion}
                aria-label={t(
                  companionExpanded ? 'sidebar.companion.collapse' : 'sidebar.companion.expand'
                )}
                title={t(
                  companionExpanded ? 'sidebar.companion.collapse' : 'sidebar.companion.expand'
                )}
                aria-expanded={companionExpanded}
                aria-controls={companionControlsId}
                active={companionExpanded}
                variant="ghost"
                className={`flex h-10 w-10 items-center justify-center rounded-[22px] gap-0 px-0 py-0 md:gap-0 md:px-0 transition-colors ${companionExpanded ? '' : inactiveColor}`}
              >
                <LayoutPanelLeft className="h-5 w-5" />
              </InteractivePill>
            ) : null}
            {homeAssistantShell.canToggleKiosk ? (
              <InteractivePill
                onClick={() => {
                  void homeAssistantShell.toggleHomeAssistantKiosk();
                }}
                aria-label={t('sidebar.toggleHomeAssistantKiosk')}
                title={t('sidebar.toggleHomeAssistantKiosk')}
                active={false}
                variant="ghost"
                className={`flex h-10 w-10 items-center justify-center rounded-[22px] gap-0 px-0 py-0 md:gap-0 md:px-0 transition-colors ${inactiveColor}`}
              >
                <HomeAssistantSidebarIcon className="h-5 w-5" />
              </InteractivePill>
            ) : null}
          </div>
        </div>
        <div
          id="dashboard-companion-panel"
          className={
            companion
              ? `hidden h-full min-h-0 w-[276px] shrink-0 border-l min-[1100px]:block ${surface.border}`
              : 'hidden'
          }
        >
          {companion}
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <div
        className="mobile-bottom-dock-offset fixed inset-x-0 z-50 flex justify-center px-[1.3125rem] transition-[transform,opacity] duration-300 md:hidden"
        style={{
          opacity: isMobileNavHidden ? 0 : 1,
          pointerEvents: isMobileNavHidden ? 'none' : 'auto',
          transform: isMobileNavHidden
            ? 'translateY(calc(100% + var(--mobile-bottom-dock-offset) + var(--mobile-bottom-dock-viewport-overlap) + 1rem))'
            : 'translateY(0)',
        }}
      >
        {isMobileSearchOpen ? (
          <div
            className={`relative flex w-full max-w-[26rem] items-center gap-2 overflow-hidden rounded-[22px] border ${surface.borderStrong} p-0.75 ${surface.panel} ${cardShell.backdropClassName} ${surface.cardShadow}`}
            style={{ boxShadow: mobileDockShadow }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />
            <div className="min-w-0 flex-1">
              <HeaderSearchInput
                activeColorValue={activeColorValue ?? 'currentColor'}
                hoverBg={resolvedHoverBg}
                inputBg={mobileSearchFieldBg}
                inputRef={mobileSearchInputRef}
                isSearchActive={isSearchActive}
                isSearchFocused={isSearchFocused}
                onBlur={() => setIsSearchFocused(false)}
                onChange={handleSearchChange}
                onClear={handleClearSearch}
                onFocus={() => setIsSearchFocused(true)}
                placeholder={t('header.searchPlaceholder')}
                query={searchQuery}
                textPrimary={mobileSearchFieldText}
                textSecondary={mobileSearchFieldIcon}
                widthClassName="w-full"
              />
            </div>

            <Button
              iconOnly
              variant="secondary"
              size="small"
              onClick={handleToggleMobileSearch}
              label={t('common.close')}
              className="h-11 w-11 shrink-0 border-transparent!"
              style={{ background: searchAccessoryBackground }}
            >
              <X className={`h-4 w-4 ${resolvedTextSecondary}`} />
            </Button>
          </div>
        ) : (
          <div
            className={`relative overflow-hidden rounded-3xl border ${surface.borderStrong} ${surface.panel} ${cardShell.backdropClassName} ${surface.cardShadow}`}
            style={{ boxShadow: mobileDockShadow }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />
            {isGlass ? (
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),transparent_42%)]" />
            ) : null}

            <div className="relative flex min-h-12.5 items-stretch gap-1 px-0.75 py-0.75">
              {dockItems.map((item) => {
                const isActive =
                  activeCustomSidebarActionId === null && activeSection === item.section;
                const activeHomeRoomNavigation =
                  item.section === 'home' && isActive ? mobileRoomNavigation : undefined;
                const showHomeRoomDropdown = Boolean(activeHomeRoomNavigation);
                const activeHomeLabel =
                  activeHomeRoomNavigation?.activeRoom &&
                  !isAllRooms(activeHomeRoomNavigation.activeRoom)
                    ? (visibleMobileRooms.find((room) =>
                        roomNamesMatch(room, activeHomeRoomNavigation.activeRoom)
                      ) ?? activeHomeRoomNavigation.activeRoom)
                    : hasMultipleDashboards
                      ? (activeDashboard?.name ?? item.label)
                      : item.label;
                const ActiveHomeIcon =
                  activeHomeRoomNavigation?.activeRoom &&
                  !isAllRooms(activeHomeRoomNavigation.activeRoom)
                    ? DoorOpen
                    : item.icon;

                return showHomeRoomDropdown ? (
                  <div
                    key={item.section}
                    className={`relative min-h-11 min-w-[5.1rem] shrink-0 rounded-[20px] transition-[color,background-color,border-color,box-shadow,opacity,transform,filter] ${getMobileTabPill(true).className}`}
                    style={getMobileTabPill(true).style}
                  >
                    <button
                      type="button"
                      onClick={item.onClick}
                      aria-current="page"
                      aria-label={activeHomeLabel}
                      className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 py-1.5 pr-7"
                    >
                      <ActiveHomeIcon className="h-4 w-4 shrink-0" />
                      <span className="max-w-full truncate px-0.5 text-[11px] leading-none tracking-[-0.01em] font-semibold">
                        {activeHomeLabel}
                      </span>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={t('dashboard.roomNav.openRooms')}
                          className="absolute right-1 top-1/2 flex h-8 w-6 -translate-y-1/2 items-center justify-center rounded-[14px] bg-black/10"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        side="top"
                        sideOffset={10}
                        className="w-56 md:hidden"
                      >
                        {hasMultipleDashboards ? (
                          <>
                            <DashboardSwitcherMenuContent
                              showManage
                              onCreate={() => setIsDashboardCreateOpen(true)}
                            />
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel>
                              {t('dashboard.multiple.group.rooms')}
                            </DropdownMenuLabel>
                          </>
                        ) : null}
                        {visibleMobileRooms.map((room) => {
                          const label = getDashboardRoomLabel(room, t('dashboard.roomNav.all'));

                          return (
                            <DropdownMenuItem
                              key={room}
                              className={surface.textPrimary}
                              onSelect={() => activeHomeRoomNavigation?.onRoomChange(room)}
                            >
                              <span className="min-w-0 flex-1 truncate">{label}</span>
                              {roomNamesMatch(activeHomeRoomNavigation?.activeRoom ?? '', room) ? (
                                <Check className="h-4 w-4" style={{ color: activeColorValue }} />
                              ) : null}
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ) : (
                  <MobileDockButton
                    key={item.section}
                    icon={item.icon}
                    isActive={isActive}
                    label={item.label}
                    onClick={item.onClick}
                    pill={getMobileTabPill(isActive)}
                  />
                );
              })}

              <MobileDockButton
                icon={Compass}
                isActive={isOrbitOpen}
                label={t('sidebar.orbit')}
                onClick={() => setIsOrbitOpen(true)}
                pill={getMobileTabPill(isOrbitOpen)}
                ariaExpanded={isOrbitOpen}
              />
              <MobileDockButton
                icon={Search}
                isActive={isMobileSearchOpen}
                label={t('sidebar.search')}
                onClick={handleToggleMobileSearch}
                pill={getMobileTabPill(isMobileSearchOpen)}
                ariaExpanded={isMobileSearchOpen}
              />
              {isMobile ? (
                <HeaderAssistAction
                  renderTrigger={({ isOpen, onClick }) => (
                    <MobileDockButton
                      icon={MessageCircle}
                      isActive={isOpen}
                      label={t('widgets.assist.title')}
                      onClick={onClick}
                      pill={getMobileTabPill(isOpen)}
                      ariaExpanded={isOpen}
                      ariaHasPopup="dialog"
                    />
                  )}
                />
              ) : null}
            </div>
          </div>
        )}
      </div>
      <DashboardCreateDialog
        isOpen={isDashboardCreateOpen}
        onOpenChange={setIsDashboardCreateOpen}
      />

      <MobileSectionOrbitSheet
        activeSection={activeSection}
        choresEnabled={choresEnabled}
        hasCustomActiveDestination={activeCustomSidebarActionId !== null}
        customItems={customMenuItems}
        homeAssistantAction={
          homeAssistantShell.canNavigateHome
            ? {
                icon: LogOut,
                label: t('sidebar.exitHomeAssistant'),
                onClick: () => {
                  void homeAssistantShell.navigateToHomeAssistantHome();
                },
              }
            : homeAssistantShell.canToggleKiosk
              ? {
                  icon: HomeAssistantSidebarIcon,
                  label: t('sidebar.toggleHomeAssistantKiosk'),
                  onClick: () => {
                    void homeAssistantShell.toggleHomeAssistantKiosk();
                  },
                }
              : undefined
        }
        isOpen={isOrbitOpen}
        onOpenChange={setIsOrbitOpen}
        onSelectSection={setActiveSection}
        onCustomizeSidebar={
          isEditMode
            ? () => {
                setIsOrbitOpen(false);
                setEditingSidebarActionId(null);
                setIsSidebarCustomizationOpen(true);
              }
            : undefined
        }
      />
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
    </>
  );
});

function MobileDockButton({
  ariaExpanded,
  ariaHasPopup,
  icon: Icon,
  isActive,
  label,
  onClick,
  pill,
}: {
  ariaExpanded?: boolean;
  ariaHasPopup?: 'dialog';
  icon: LucideIcon;
  isActive: boolean;
  label: string;
  onClick: () => void;
  pill: ReturnType<typeof getInteractivePillStyles>;
}) {
  return (
    <button
      onClick={onClick}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      type="button"
      className={`flex min-h-11 min-w-[4.25rem] shrink-0 flex-col items-center justify-center gap-1 rounded-[20px] px-2 py-1.5 transition-[color,background-color,border-color,box-shadow,opacity,transform,filter] ${pill.className}`}
      style={pill.style}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span
        className={`max-w-full whitespace-nowrap px-0.5 text-[11px] leading-none tracking-[-0.01em] ${
          isActive ? 'font-semibold' : 'font-medium'
        }`}
      >
        {label}
      </span>
    </button>
  );
}
