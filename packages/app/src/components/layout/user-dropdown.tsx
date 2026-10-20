import { SheetSurface } from '@navet/app/components/primitives';
import {
  getReadableAccentForeground,
  getThemeColorValue,
} from '@navet/app/components/shared/theme/theme-colors';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@navet/app/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@navet/app/components/ui/avatar';
import {
  useClickOutside,
  useI18n,
  useIntegrationStore,
  useLogout,
  useTheme,
} from '@navet/app/hooks';
import { refreshPwaApp } from '@navet/app/pwa/pwa-update-store';
import { integrationSelectors } from '@navet/app/stores/selectors';
import { INTEGRATION_PROVIDER_IDS, INTEGRATION_PROVIDERS } from '@navet/app/types/provider';
import { History, LogOut, RefreshCw } from 'lucide-react';
import { lazy, memo, Suspense, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

const ProviderHistoryDialog = lazy(async () => {
  const module = await import('@navet/app/features/history/components/provider-history-dialog');
  return { default: module.ProviderHistoryDialog };
});

interface UserDropdownProps {
  avatarUrl?: string | null;
  variant?: 'desktop' | 'mobile';
  menuSide?: 'top' | 'bottom';
}

export const UserDropdown = memo(function UserDropdown({
  avatarUrl,
  variant = 'desktop',
  menuSide = 'bottom',
}: UserDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const isMobile = variant === 'mobile';
  const dropdownRef = useClickOutside<HTMLDivElement>(() => setIsOpen(false), isOpen && !isMobile);
  const { theme, primaryColor } = useTheme();
  const { t } = useI18n();
  const surface = getThemeSurfaceTokens(theme);
  const user = useIntegrationStore(integrationSelectors.currentUser);
  const connectedProviderIds = useIntegrationStore(
    useShallow((state) =>
      INTEGRATION_PROVIDER_IDS.filter((providerId) => state.providerRuntime[providerId]?.connected)
    )
  );
  const performLogout = useLogout();

  const handleLogout = () => {
    setIsOpen(false);
    setShowLogoutConfirm(true);
  };

  const handleRefreshApp = () => {
    setIsOpen(false);
    void refreshPwaApp();
  };

  // Theme colors
  const textPrimary = surface.textPrimary;
  const textMuted = surface.textMuted;
  const divider = surface.border;
  const itemBg = surface.subtleBg;
  const accentColor = getThemeColorValue(primaryColor);
  const dropdownPanelClassName = `rounded-2xl border shadow-2xl ${surface.panel} ${surface.border} ${
    theme === 'glass' ? 'backdrop-blur-xl' : ''
  }`;
  const statusCardClassName = `rounded-xl border px-3 py-3 ${surface.border} ${itemBg}`;
  const refreshButtonClassName = `inline-flex w-full items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors ${surface.border} ${surface.hoverBg} ${textPrimary}`;
  const logoutButtonClassName =
    'inline-flex w-full items-center gap-2 rounded-full bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/15';

  const fullName = user?.name?.trim() || t('userDropdown.defaultUser');
  const connectedProviderLabels = connectedProviderIds.map(
    (providerId) => INTEGRATION_PROVIDERS[providerId].label
  );
  const connected = connectedProviderLabels.length > 0;
  const initials = useMemo(() => {
    const parts = fullName.split(/\s+/).filter(Boolean);
    return parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }, [fullName]);
  const roleLabel = user?.is_owner
    ? t('userDropdown.role.owner')
    : user?.is_admin
      ? t('userDropdown.role.administrator')
      : t('userDropdown.role.user');

  const content = (
    <>
      <div className={`border-b p-4 ${divider}`}>
        <div className="mb-3 flex items-center gap-3">
          <Avatar
            className="h-12 w-12"
            style={{
              backgroundColor: accentColor,
              boxShadow: connected
                ? `0 0 0 2px ${accentColor}66, 0 0 0 6px ${accentColor}1f`
                : `0 0 0 1px rgba(255,255,255,0.08)`,
              opacity: connected ? 1 : 0.84,
            }}
          >
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={fullName} /> : null}
            <AvatarFallback
              className="bg-transparent font-semibold"
              style={{ color: getReadableAccentForeground(accentColor) }}
            >
              {initials || t('userDropdown.defaultInitial')}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${textPrimary}`}>{fullName}</p>
            <p className={`mt-0.5 text-xs ${textMuted}`}>{roleLabel}</p>
          </div>
        </div>

        <div className={statusCardClassName}>
          <div className="min-w-0 flex-1">
            <p className={`text-xs ${textMuted}`}>{t('settings.system.connection.connectedTo')}</p>
            {connected ? (
              <div className="mt-1 space-y-1">
                {connectedProviderLabels.map((providerLabel) => (
                  <div key={providerLabel} className="flex items-start gap-2">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-green-500" />
                    <p className={`text-xs font-medium leading-snug ${textPrimary}`}>
                      {providerLabel}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-1 flex items-start gap-2">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gray-500" />
                <p className={`text-xs font-medium leading-snug ${textPrimary}`}>
                  {t('settings.system.connection.notConnected')}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={`space-y-2 border-t p-4 ${divider}`}>
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            setShowHistory(true);
          }}
          className={refreshButtonClassName}
        >
          <History aria-hidden="true" className="h-4 w-4" />
          <span className="text-sm font-medium">{t('history.title')}</span>
        </button>
        <button type="button" onClick={handleRefreshApp} className={refreshButtonClassName}>
          <RefreshCw className="h-4 w-4" />
          <span className="text-sm font-medium">{t('pwa.refreshApp')}</span>
        </button>
        <button type="button" onClick={handleLogout} className={logoutButtonClassName}>
          <LogOut className="h-4 w-4" />
          <span className="text-sm font-medium">{t('common.logout')}</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`group flex h-9 w-9 items-center justify-center rounded-[22px] transition-colors ${surface.hoverBg} md:h-10 md:w-10`}
        aria-label={t('userDropdown.openMenu')}
        aria-expanded={isOpen}
      >
        <Avatar
          className="h-8 w-8 transition-transform group-hover:scale-105 md:h-[34px] md:w-[34px]"
          style={{
            backgroundColor: accentColor,
            boxShadow: connected
              ? `0 0 0 1px ${accentColor}55, 0 0 0 2px ${accentColor}14`
              : undefined,
            opacity: connected ? 1 : 0.82,
          }}
        >
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={fullName} /> : null}
          <AvatarFallback
            className="bg-transparent text-xs font-semibold md:text-sm"
            style={{ color: getReadableAccentForeground(accentColor) }}
          >
            {initials || t('userDropdown.defaultInitial')}
          </AvatarFallback>
        </Avatar>
      </button>

      {isOpen && !isMobile ? (
        <div
          className={`absolute z-50 w-72 overflow-hidden ${menuSide === 'top' ? 'bottom-full left-0 mb-2' : 'top-full right-0 mt-2'} ${dropdownPanelClassName}`}
        >
          {content}
        </div>
      ) : null}

      {isMobile ? (
        <SheetSurface
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          title={t('userDropdown.openMenu')}
          description={fullName}
          accentColor={accentColor}
          overlayClassName={`animate-in fade-in bg-black/45 backdrop-blur-[2px] md:hidden ${surface.dialogBackdrop}`}
          contentClassName={`${surface.panel} ${surface.border}`}
        >
          {content}
        </SheetSurface>
      ) : null}

      {showHistory ? (
        <Suspense fallback={null}>
          <ProviderHistoryDialog onClose={() => setShowHistory(false)} />
        </Suspense>
      ) : null}
      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.feedback.logoutConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.system.logout.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={performLogout}>{t('common.logout')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});
