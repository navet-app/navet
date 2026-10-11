import { Button } from '@navet/app/components/primitives/button';
import type { BaseCardDialogTab } from '@navet/app/components/primitives/Cards/BaseCardDialog';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@navet/app/components/ui/dropdown-menu';
import { useI18n } from '@navet/app/hooks';
import { useEntityIntegrationReload } from '@navet/app/hooks/use-entity-integration-reload';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import { getProviderNativeId } from '@navet/app/utils/provider-ids';
import { MoreHorizontal, Pencil, RotateCw, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

/** Secondary card-dialog destinations, identity editing, and contextual removal. */
export function CardDialogOverflowMenu({
  theme,
  sections,
  onSectionChange,
  onEditName,
  entityId,
  onRemoveCard,
  removeCardLabel,
}: {
  theme: ThemeType;
  sections: Pick<BaseCardDialogTab, 'key' | 'label' | 'icon'>[];
  onSectionChange: (key: string) => void;
  onEditName?: () => void;
  entityId?: string;
  onRemoveCard?: () => void;
  removeCardLabel?: string;
}) {
  const { t } = useI18n();
  const editAfterClose = useRef(false);
  const reloadAfterClose = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [confirmReload, setConfirmReload] = useState(false);
  const [reloadFailed, setReloadFailed] = useState(false);
  const recovery = useEntityIntegrationReload(entityId);
  const roomSections = sections.filter((section) => section.key === 'room');
  const configurationSections = sections.filter((section) => section.key !== 'room');
  const hasIdentityActions = roomSections.length > 0 || Boolean(onEditName);
  const hasConfigurationActions = configurationSections.length > 0;

  async function handleReload() {
    setReloadFailed(false);
    try {
      if (await recovery.reload()) {
        setConfirmReload(false);
        toast.success(t('entityIntegrationReload.success'));
      }
    } catch {
      setReloadFailed(true);
    }
  }
  const separatorClassName = theme === 'light' ? undefined : 'bg-white/12';
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            iconOnly
            variant="soft"
            label={t('common.moreActions')}
            className="pointer-events-auto h-10 w-10 rounded-full"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className={`w-56 ${theme === 'light' ? 'shadow-xl' : 'border-white/20 bg-zinc-800 bg-none shadow-xl'}`}
          onCloseAutoFocus={(event) => {
            if (reloadAfterClose.current) {
              event.preventDefault();
              reloadAfterClose.current = false;
              setConfirmReload(true);
            } else if (editAfterClose.current) {
              event.preventDefault();
              editAfterClose.current = false;
              onEditName?.();
            }
          }}
        >
          {roomSections.map(({ key, label, icon: Icon }) => (
            <DropdownMenuItem key={key} onSelect={() => onSectionChange(key)}>
              <Icon className="h-4 w-4" />
              {label}
            </DropdownMenuItem>
          ))}
          {onEditName && (
            <DropdownMenuItem
              onSelect={() => {
                editAfterClose.current = true;
              }}
            >
              <Pencil className="h-4 w-4" />
              {t('entityNameEditor.editCardName')}
            </DropdownMenuItem>
          )}
          {hasIdentityActions && hasConfigurationActions && (
            <DropdownMenuSeparator className={separatorClassName} />
          )}
          {configurationSections.map(({ key, label, icon: Icon }) => (
            <DropdownMenuItem key={key} onSelect={() => onSectionChange(key)}>
              <Icon className="h-4 w-4" />
              {label}
            </DropdownMenuItem>
          ))}
          {recovery.available && (
            <>
              {(hasIdentityActions || hasConfigurationActions) && (
                <DropdownMenuSeparator className={separatorClassName} />
              )}
              <DropdownMenuItem
                disabled={recovery.pending}
                onSelect={() => {
                  reloadAfterClose.current = true;
                }}
              >
                <RotateCw className="h-4 w-4" aria-hidden="true" />
                {t('entityIntegrationReload.action')}
              </DropdownMenuItem>
            </>
          )}
          {onRemoveCard && (
            <>
              <DropdownMenuSeparator className={separatorClassName} />
              <DropdownMenuItem variant="destructive" onSelect={onRemoveCard}>
                <Trash2 className="h-4 w-4" />
                {removeCardLabel ?? t('dashboard.roomsWorkspace.hideDevice')}
              </DropdownMenuItem>
            </>
          )}
          {entityId && (
            <>
              <DropdownMenuSeparator className={separatorClassName} />
              <DropdownMenuLabel className="space-y-1 font-normal">
                <span className="block text-xs text-muted-foreground">{t('common.entityId')}</span>
                <code className="block select-text break-all text-xs">
                  {getProviderNativeId(entityId)}
                </code>
              </DropdownMenuLabel>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog
        open={confirmReload}
        onOpenChange={(open) => {
          if (!recovery.pending) {
            setConfirmReload(open);
            if (!open) setReloadFailed(false);
          }
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{t('entityIntegrationReload.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('entityIntegrationReload.description')}
              {reloadFailed && (
                <span role="alert" className="mt-2 block">
                  {t('entityIntegrationReload.error')}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="max-sm:flex-wrap">
            <AlertDialogCancel className="shrink-0 whitespace-nowrap" disabled={recovery.pending}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="shrink-0 whitespace-nowrap"
              disabled={recovery.pending || !recovery.available}
              onClick={(event) => {
                event.preventDefault();
                void handleReload();
              }}
            >
              {t(
                recovery.pending
                  ? 'entityIntegrationReload.pending'
                  : 'entityIntegrationReload.action'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
