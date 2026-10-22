import { Button } from '@navet/app/components/primitives/button';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@navet/app/components/ui/dropdown-menu';
import { useI18n, useTheme } from '@navet/app/hooks';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import {
  getCompanionCards,
  isRoomCompanionSelected,
  type NavetDashboardDefinition,
  resolveDashboardCompanion,
} from '../dashboards/dashboard-collection';
import { useDashboardCollectionStore } from '../dashboards/dashboard-collection-store';

export function CompanionPanelScope({
  dashboard,
  roomId,
  roomName,
}: {
  dashboard: NavetDashboardDefinition;
  roomId: string | null;
  roomName: string;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const hintId = useId();
  const labelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const updateRoomCompanion = useDashboardCollectionStore((state) => state.updateRoomCompanion);
  const selectRoomCompanion = useDashboardCollectionStore((state) => state.selectRoomCompanion);
  const custom = isRoomCompanionSelected(dashboard, roomId);
  const hasRoomPanel = Boolean(roomId && dashboard.roomCompanions?.[roomId]);
  const hint = t('sidebar.companion.sharedPanelHint');
  const label = custom
    ? t('sidebar.companion.roomPanel', { room: roomName })
    : t('sidebar.companion.dashboardPanel');

  if (!roomId)
    return (
      <span
        className={`min-w-0 flex-1 truncate text-xs font-medium ${surface.textSecondary}`}
        title={hint}
      >
        {label}
      </span>
    );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            variant="secondary"
            size="compact"
            className="min-w-0 flex-1 justify-between [&>span]:truncate"
            aria-label={t('sidebar.companion.roomScope', { room: roomName })}
            aria-describedby={custom ? labelId : `${labelId} ${hintId}`}
            trailing={<ChevronDown className="h-4 w-4 shrink-0" />}
          >
            <span id={labelId} className="truncate">
              {label}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {!custom ? (
            <DropdownMenuLabel
              className={`max-w-64 whitespace-normal text-xs font-normal ${surface.textSecondary}`}
            >
              {hint}
            </DropdownMenuLabel>
          ) : null}
          <DropdownMenuRadioGroup
            value={custom ? 'room' : 'dashboard'}
            onValueChange={(value) => {
              if (value === 'dashboard' || value === 'room')
                selectRoomCompanion(dashboard.id, roomId, value);
            }}
          >
            <DropdownMenuRadioItem value="dashboard">
              {t('sidebar.companion.dashboardPanel')}
            </DropdownMenuRadioItem>
            {hasRoomPanel ? (
              <DropdownMenuRadioItem value="room">
                {t('sidebar.companion.roomPanel', { room: roomName })}
              </DropdownMenuRadioItem>
            ) : null}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          {hasRoomPanel ? (
            <DropdownMenuItem onSelect={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
              {t('sidebar.companion.deleteRoomPanel')}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={() => {
                const common = resolveDashboardCompanion(dashboard);
                updateRoomCompanion(dashboard.id, roomId, {
                  ...common,
                  cards: getCompanionCards(common).map((card) => ({ ...card })),
                });
                selectRoomCompanion(dashboard.id, roomId, 'room');
              }}
            >
              <Plus className="h-4 w-4" />
              {t('sidebar.companion.createRoomPanel')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {!custom ? (
        <span id={hintId} className="sr-only">
          {hint}
        </span>
      ) : null}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sidebar.companion.deleteRoomTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('sidebar.companion.deleteRoomDescription', { room: roomName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => updateRoomCompanion(dashboard.id, roomId, null)}>
              {t('sidebar.companion.deleteRoomPanel')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
