import { Button } from '@navet/app/components/primitives/button';
import { useEditModeStore, useNavigationStore } from '@navet/app/stores';
import { Pencil } from 'lucide-react';
import { HeaderDesktopActions } from './header-actions';
import { HeaderAssistAction } from './header-assist-action';
import { HeaderSearchAction } from './header-search-action';
import type { MobileHeaderEditActions } from './mobile-header-actions';
import type { HeaderController } from './use-header-controller';

/** The same actions sit beside rooms or the greeting, according to available space. */
export function HeaderDashboardActions({
  controller,
  editActions,
}: {
  controller: HeaderController;
  editActions?: MobileHeaderEditActions;
}) {
  const storeEditing = useEditModeStore((state) => state.isEditMode);
  const toggleEditing = useEditModeStore((state) => state.toggleEditMode);
  const section = useNavigationStore((state) => state.activeSection);
  const editing = editActions?.isEditMode ?? storeEditing;
  const canCustomize =
    Boolean(editActions) || (storeEditing && section !== 'tasks' && section !== 'settings');
  return (
    <div data-header-dashboard-actions className="flex shrink-0 self-start items-center gap-2">
      {canCustomize ? (
        <Button
          size="compact"
          variant={editing ? 'primary' : 'ghost'}
          aria-pressed={editing}
          iconOnly
          label={controller.t('dashboard.roomNav.customize')}
          onClick={editActions?.onToggleEditMode ?? toggleEditing}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ) : null}
      <HeaderSearchAction controller={controller} />
      <HeaderAssistAction hoverBg={controller.hoverBg} textSecondary={controller.textSecondary} />
      <HeaderDesktopActions {...controller} renderPanel={false} userMenuSide="bottom" />
    </div>
  );
}
