import { Button } from '@navet/app/components/primitives/button';
import { DashboardCompanion } from '@navet/app/features/dashboard/companion/dashboard-companion';
import { useMediaQuery } from '@navet/app/hooks/use-media-query';
import { useEditModeStore } from '@navet/app/stores/edit-mode-store';
import { useNavigationStore } from '@navet/app/stores/navigation-store';
import { Check, Pencil } from 'lucide-react';
import { HeaderDesktopActions } from './header-actions';
import { HeaderAssistAction } from './header-assist-action';
import { HeaderSearchInput } from './header-search-input';
import type { MobileHeaderEditActions } from './mobile-header-actions';
import type { HeaderController } from './use-header-controller';
import { useHeaderDateTime } from './use-header-datetime';

export function CompanionPanel({
  controller,
  editActions,
  onCustomize,
}: {
  controller: HeaderController;
  editActions?: MobileHeaderEditActions;
  onCustomize?: () => void;
}) {
  const desktop = useMediaQuery('(min-width: 1100px)');
  const { formattedTime, formattedDate, greetingKey } = useHeaderDateTime();
  const storeEditing = useEditModeStore((state) => state.isEditMode);
  const toggleEditing = useEditModeStore((state) => state.toggleEditMode);
  const editing = editActions?.isEditMode ?? storeEditing;
  const activeSection = useNavigationStore((state) => state.activeSection);
  const canCustomize =
    Boolean(editActions) ||
    (storeEditing && activeSection !== 'tasks' && activeSection !== 'settings');
  const { surface, t } = controller;
  return (
    <div
      className={`grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] ${surface.textPrimary}`}
    >
      <div className="space-y-4 p-5">
        <div>
          <p className={`mb-2 truncate text-sm ${surface.textSecondary}`}>
            {controller.headerTitleMode === 'custom_text' && controller.headerCustomText.trim()
              ? controller.headerCustomText
              : t(greetingKey, { name: controller.firstName })}
          </p>
          <p className="text-3xl font-medium tracking-tight tabular-nums">{formattedTime}</p>
          <p className={`mt-1 text-xs ${surface.textMuted}`}>{formattedDate}</p>
        </div>
        <HeaderSearchInput
          activeColorValue={controller.activeColorValue}
          hoverBg={controller.hoverBg}
          inputBg={controller.inputBg}
          isSearchActive={controller.isSearchActive}
          isSearchFocused={controller.isSearchFocused}
          query={controller.searchQuery}
          onChange={controller.handleSearchChange}
          onClear={controller.handleClearSearch}
          onFocus={() => controller.setIsSearchFocused(true)}
          onBlur={() => controller.setIsSearchFocused(false)}
          placeholder={t('header.searchPlaceholder')}
          textPrimary={controller.textPrimary}
          textSecondary={controller.textSecondary}
        />
      </div>
      <div className={`min-h-0 overflow-y-auto border-t px-5 py-4 ${surface.border}`}>
        <DashboardCompanion />
      </div>
      <div className={`space-y-2 border-t p-4 ${surface.border}`}>
        {canCustomize ? (
          <Button
            variant={editing ? 'primary' : 'secondary'}
            className="w-full"
            leading={editing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            onClick={() => {
              (editActions?.onToggleEditMode ?? toggleEditing)();
              onCustomize?.();
            }}
          >
            {t(editing ? 'dashboard.roomNav.doneEditing' : 'dashboard.roomNav.customize')}
          </Button>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <HeaderDesktopActions
            {...controller}
            renderPanel={false}
            userMenuSide="top"
            userMenuVariant={desktop ? 'desktop' : 'mobile'}
          />
          <HeaderAssistAction />
        </div>
      </div>
    </div>
  );
}
