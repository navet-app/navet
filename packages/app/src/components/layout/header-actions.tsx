import { NotificationPanel } from '@navet/app/features/notifications';
import { useI18n } from '@navet/app/hooks';
import { Bell } from 'lucide-react';
import type { RefObject } from 'react';
import { UserDropdown } from './user-dropdown';

interface HeaderActionsProps {
  activeColorValue: string;
  avatarUrl: string | null;
  desktopNotificationButtonRef: RefObject<HTMLButtonElement | null>;
  hoverBg: string;
  isNotificationOpen: boolean;
  mobileNotificationButtonRef: RefObject<HTMLButtonElement | null>;
  setIsNotificationOpen: (open: boolean) => void;
  textSecondary: string;
  unreadCount: number;
}

export function HeaderDesktopActions({
  activeColorValue,
  avatarUrl,
  desktopNotificationButtonRef,
  hoverBg,
  isNotificationOpen,
  mobileNotificationButtonRef,
  renderPanel = true,
  userMenuSide,
  userMenuVariant,
  setIsNotificationOpen,
  textSecondary,
  unreadCount,
}: HeaderActionsProps & {
  renderPanel?: boolean;
  userMenuSide?: 'top' | 'bottom';
  userMenuVariant?: 'desktop' | 'mobile';
}) {
  return (
    <>
      <HeaderNotificationButton
        activeColorValue={activeColorValue}
        desktopNotificationButtonRef={desktopNotificationButtonRef}
        hoverBg={hoverBg}
        isNotificationOpen={isNotificationOpen}
        mobileNotificationButtonRef={mobileNotificationButtonRef}
        renderPanel={renderPanel}
        setIsNotificationOpen={setIsNotificationOpen}
        textSecondary={textSecondary}
        unreadCount={unreadCount}
      />
      <UserDropdown avatarUrl={avatarUrl} menuSide={userMenuSide} variant={userMenuVariant} />
    </>
  );
}

export function HeaderNotificationButton({
  activeColorValue,
  desktopNotificationButtonRef,
  hoverBg,
  isNotificationOpen,
  mobile = false,
  mobileNotificationButtonRef,
  renderPanel = false,
  setIsNotificationOpen,
  textSecondary,
  unreadCount,
}: {
  activeColorValue: string;
  desktopNotificationButtonRef: RefObject<HTMLButtonElement | null>;
  hoverBg: string;
  isNotificationOpen: boolean;
  mobile?: boolean;
  mobileNotificationButtonRef: RefObject<HTMLButtonElement | null>;
  renderPanel?: boolean;
  setIsNotificationOpen: (open: boolean) => void;
  textSecondary: string;
  unreadCount: number;
}) {
  const buttonRef = mobile ? mobileNotificationButtonRef : desktopNotificationButtonRef;
  const { t } = useI18n();

  return (
    <div className={mobile ? 'relative h-9 w-9' : 'relative'}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={t('notifications.title')}
        aria-expanded={isNotificationOpen}
        onClick={() => setIsNotificationOpen(!isNotificationOpen)}
        className={
          mobile
            ? `relative flex h-9 w-9 items-center justify-center rounded-[22px] ${hoverBg} transition-colors`
            : `relative rounded-[22px] p-2 ${hoverBg} transition-colors`
        }
      >
        <Bell className={`h-5 w-5 ${textSecondary}`} />
        {unreadCount > 0 ? (
          <span
            className="absolute right-1 top-1 h-2 w-2 rounded-full"
            style={{ backgroundColor: activeColorValue }}
          />
        ) : null}
      </button>

      {renderPanel && isNotificationOpen ? (
        <NotificationPanel
          isOpen={isNotificationOpen}
          onClose={() => setIsNotificationOpen(false)}
          triggerRefs={[mobileNotificationButtonRef, desktopNotificationButtonRef]}
        />
      ) : null}
    </div>
  );
}
