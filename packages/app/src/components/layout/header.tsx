import { AppReleaseBadge } from '@navet/app/components/shared/app-release-badge';
import { NotificationPanel } from '@navet/app/features/notifications';
import { useMediaQuery, useTheme } from '@navet/app/hooks';
import { useSettingsStore } from '@navet/app/stores';
import { settingsSelectors } from '@navet/app/stores/selectors';
import { Bell, CalendarDays, Check, Clock3, Edit3, Menu, Search } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { HeaderDesktopActions } from './header-actions';
import { HeaderAssistAction } from './header-assist-action';
import { HeaderSearchInput } from './header-search-input';
import { resolveHeaderTitle } from './header-title';
import type { MobileHeaderEditActions } from './mobile-header-actions';
import { MobileHeaderCommandSheet } from './mobile-header-command-sheet';
import { getMobileHeaderActionAvailability } from './mobile-layout-helpers';
import type { MobileRoomNavigation } from './mobile-room-dropdown';
import { SectionCustomizeButton } from './section-customize-button';
import { type HeaderController, useHeaderController } from './use-header-controller';
import { useHeaderDateTime } from './use-header-datetime';
import { UserDropdown } from './user-dropdown';

interface HeaderProps {
  controller?: HeaderController;
  renderNotifications?: boolean;
  mobileEditActions?: MobileHeaderEditActions;
  mobileRoomNavigation?: MobileRoomNavigation;
}

function HeaderView({
  controller,
  mobileEditActions,
  renderNotifications = true,
}: Omit<HeaderProps, 'controller'> & { controller: HeaderController }) {
  const { theme } = useTheme();
  const kioskMode = useSettingsStore(settingsSelectors.kioskMode);
  const isMobileViewport = useMediaQuery('(max-width: 767px)');
  const [isDesktopSearchOpen, setIsDesktopSearchOpen] = useState(false);
  const desktopSearchContainerRef = useRef<HTMLDivElement | null>(null);
  const desktopSearchLauncherRef = useRef<HTMLButtonElement | null>(null);
  const restoreDesktopSearchFocusRef = useRef(false);
  const desktopSearchInputRef = useRef<HTMLInputElement | null>(null);
  const mobileAvailability = useMemo(
    () => getMobileHeaderActionAvailability(mobileEditActions),
    [mobileEditActions]
  );
  const hasOverflowUtilities = Boolean(
    mobileAvailability?.hasEditUtilities || mobileAvailability?.showAllViewGrouping
  );
  const {
    activeColorValue,
    avatarUrl,
    closeNotifications,
    desktopNotificationButtonRef,
    dividerColor,
    firstName,
    handleClearSearch,
    handleSearchChange,
    headerCustomText,
    headerTitleMode,
    hoverBg,
    inputBg,
    isMobileUtilityOpen,
    isNotificationOpen,
    isSearchActive,
    isSearchFocused,
    mobileNotificationButtonRef,
    openMobileUtility,
    openNotifications,
    searchQuery,
    setIsMobileUtilityOpen,
    setIsNotificationOpen,
    setIsSearchFocused,
    t,
    textPrimary,
    textSecondary,
    unreadCount,
  } = controller;
  const { formattedDate, formattedTime, greetingKey, weekNumber } = useHeaderDateTime();
  const greetingText = useMemo(
    () => t(greetingKey, { name: firstName }),
    [firstName, greetingKey, t]
  );
  const weekLabel = useMemo(() => t('header.weekLabel', { week: weekNumber }), [t, weekNumber]);
  const headerTitle = useMemo(
    () =>
      resolveHeaderTitle({
        mode: headerTitleMode,
        customText: headerCustomText,
        formattedDate,
        formattedTime,
        greetingText,
      }),
    [formattedDate, formattedTime, greetingText, headerCustomText, headerTitleMode]
  );
  const headerSecondaryText =
    headerTitle.mode === 'clock' ? `${greetingText} · ${weekLabel}` : headerTitle.secondaryText;
  const showTimeMetadata = headerTitle.showTimeMetadata;
  const headerTitleText = headerTitle.text;
  const mobileSummaryPillClassName =
    theme === 'light'
      ? 'border-slate-200/70 bg-white/55 text-slate-900 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.28)] hover:bg-white/75'
      : theme === 'black'
        ? 'border-white/10 bg-white/[0.035] text-white/88 hover:bg-white/[0.065]'
        : 'border-white/10 bg-white/[0.055] text-white/88 backdrop-blur-xl hover:bg-white/[0.085]';
  const openDesktopSearch = () => {
    setIsDesktopSearchOpen(true);
    window.setTimeout(() => desktopSearchInputRef.current?.focus(), 0);
  };

  const closeDesktopSearch = () => {
    handleClearSearch();
    restoreDesktopSearchFocusRef.current = true;
    setIsDesktopSearchOpen(false);
  };

  useEffect(() => {
    if (!isDesktopSearchOpen && restoreDesktopSearchFocusRef.current) {
      restoreDesktopSearchFocusRef.current = false;
      desktopSearchLauncherRef.current?.focus();
    }
  }, [isDesktopSearchOpen]);

  useEffect(() => {
    if (!isDesktopSearchOpen) {
      return undefined;
    }

    const handleDocumentClick = (event: MouseEvent) => {
      if (desktopSearchContainerRef.current?.contains(event.target as Node)) {
        return;
      }

      handleClearSearch();
      setIsDesktopSearchOpen(false);
    };

    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, [handleClearSearch, isDesktopSearchOpen]);

  return (
    <>
      <div className="flex items-center gap-2 md:hidden">
        {hasOverflowUtilities ? (
          <button
            type="button"
            onClick={openMobileUtility}
            className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${mobileSummaryPillClassName}`}
            aria-label={t('common.moreActions')}
            aria-expanded={isMobileUtilityOpen}
          >
            <Menu className="h-[1.05rem] w-[1.05rem]" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className={`truncate text-[1rem] leading-none font-semibold ${textPrimary}`}>
            {headerTitleText}
          </h1>
          {showTimeMetadata ? (
            <div
              className={`${textSecondary} mt-1 flex items-center gap-1 text-[0.72rem] leading-none`}
            >
              <span className="truncate">{formattedDate}</span>
              <span aria-hidden="true" className={dividerColor}>
                ·
              </span>
              <span className="shrink-0">{formattedTime}</span>
            </div>
          ) : headerSecondaryText ? (
            <div className="mt-1">
              <div className={`truncate text-[0.72rem] leading-none ${textSecondary}`}>
                {headerSecondaryText}
              </div>
            </div>
          ) : null}
        </div>
        {mobileAvailability && !kioskMode ? (
          <button
            type="button"
            onClick={mobileAvailability.onToggleEditMode}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${hoverBg} transition-colors ${
              mobileAvailability.isEditMode ? 'text-white' : textSecondary
            }`}
            aria-label={
              mobileAvailability.isEditMode
                ? t('dashboard.roomNav.doneEditing')
                : t('dashboard.roomNav.customize')
            }
            style={
              mobileAvailability.isEditMode
                ? {
                    backgroundColor: activeColorValue,
                    boxShadow: `0 14px 28px -18px ${activeColorValue}`,
                  }
                : undefined
            }
          >
            {mobileAvailability.isEditMode ? (
              <Check className="h-[1.05rem] w-[1.05rem]" />
            ) : (
              <Edit3 className="h-[1.05rem] w-[1.05rem]" />
            )}
          </button>
        ) : null}
        <button
          ref={mobileNotificationButtonRef}
          type="button"
          onClick={openNotifications}
          className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${hoverBg} transition-colors`}
          aria-label={t('notifications.title')}
          aria-expanded={isNotificationOpen}
        >
          <Bell className={`h-[1.05rem] w-[1.05rem] ${textSecondary}`} />
          {unreadCount > 0 ? (
            <span
              className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full"
              style={{ backgroundColor: activeColorValue }}
            />
          ) : null}
        </button>
        <UserDropdown avatarUrl={avatarUrl} variant="mobile" />
      </div>

      <div className="hidden md:flex md:flex-row md:items-center md:justify-between md:gap-4">
        <div className="flex min-w-0 flex-col gap-2 md:flex-1 md:flex-row md:items-center md:justify-between md:gap-4">
          <div className="min-w-0">
            <div className="min-w-0">
              <div className="mb-0.5 md:mb-1">
                <h1
                  className={`min-w-0 text-[1.55rem] leading-none font-bold md:text-[2rem] xl:text-4xl ${textPrimary}`}
                >
                  <span>{headerTitleText}</span>
                  <AppReleaseBadge className="ml-3 hidden shrink-0 align-middle -translate-y-0.75 lg:inline-flex" />
                </h1>
              </div>
              <div
                className={`${textSecondary} hidden md:flex ${showTimeMetadata ? 'flex-wrap items-center gap-x-3 gap-y-1 text-sm' : 'flex-col items-start gap-1 text-sm'}`}
              >
                {showTimeMetadata ? (
                  <div className="flex items-center gap-1.5">
                    <Clock3 className={`h-3.5 w-3.5 ${textSecondary}`} />
                    <span>{formattedDate}</span>
                    <span aria-hidden="true" className={dividerColor}>
                      ·
                    </span>
                    <span>{formattedTime}</span>
                  </div>
                ) : headerSecondaryText ? (
                  <div className={`truncate ${textSecondary}`}>{headerSecondaryText}</div>
                ) : null}
                {showTimeMetadata ? (
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className={`h-3.5 w-3.5 ${textSecondary}`} />
                    <span>{t('header.weekLabel', { week: weekNumber })}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            {mobileEditActions && !kioskMode ? (
              <SectionCustomizeButton
                isEditMode={mobileEditActions.isEditMode}
                onToggle={mobileEditActions.onToggleEditMode}
              />
            ) : null}

            <div ref={desktopSearchContainerRef} className="flex items-center">
              {isDesktopSearchOpen ? (
                <div className="relative flex-1 md:flex-none">
                  <HeaderSearchInput
                    activeColorValue={activeColorValue}
                    hoverBg={hoverBg}
                    inputBg={inputBg}
                    inputRef={desktopSearchInputRef}
                    isSearchActive={isSearchActive}
                    isSearchFocused={isSearchFocused}
                    onBlur={() => setIsSearchFocused(false)}
                    onChange={handleSearchChange}
                    onClear={closeDesktopSearch}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        event.stopPropagation();
                        closeDesktopSearch();
                      }
                    }}
                    onFocus={() => setIsSearchFocused(true)}
                    placeholder={t('header.searchPlaceholder')}
                    query={searchQuery}
                    textPrimary={textPrimary}
                    textSecondary={textSecondary}
                    widthClassName="w-full md:w-64"
                  />
                </div>
              ) : (
                <button
                  ref={desktopSearchLauncherRef}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openDesktopSearch();
                  }}
                  className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[22px] ${hoverBg} transition-colors`}
                  aria-label={t('header.searchPlaceholder')}
                  aria-expanded={false}
                >
                  <Search className={`h-5 w-5 ${textSecondary}`} />
                </button>
              )}
            </div>

            <HeaderAssistAction hoverBg={hoverBg} textSecondary={textSecondary} />

            <HeaderDesktopActions
              activeColorValue={activeColorValue}
              avatarUrl={avatarUrl}
              desktopNotificationButtonRef={desktopNotificationButtonRef}
              hoverBg={hoverBg}
              isNotificationOpen={isNotificationOpen}
              mobileNotificationButtonRef={mobileNotificationButtonRef}
              renderPanel={renderNotifications && !isMobileViewport}
              setIsNotificationOpen={setIsNotificationOpen}
              textSecondary={textSecondary}
              unreadCount={unreadCount}
            />
          </div>
        </div>
      </div>

      {renderNotifications && isMobileViewport && isNotificationOpen ? (
        <NotificationPanel
          isOpen={isNotificationOpen}
          onClose={closeNotifications}
          triggerRefs={[mobileNotificationButtonRef, desktopNotificationButtonRef]}
        />
      ) : null}
      <MobileHeaderCommandSheet
        controller={controller}
        actions={mobileEditActions}
        isOpen={isMobileUtilityOpen}
        onOpenChange={setIsMobileUtilityOpen}
      />
    </>
  );
}

function HeaderWithController(props: Omit<HeaderProps, 'controller'>) {
  const controller = useHeaderController();
  return <HeaderView controller={controller} {...props} />;
}

export const Header = memo(function Header({ controller, ...props }: HeaderProps) {
  if (controller) return <HeaderView controller={controller} {...props} />;
  return <HeaderWithController {...props} />;
});
