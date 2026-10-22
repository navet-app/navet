import { CardDialogHeader } from '@navet/app/components/patterns/card-dialog';
import { BaseCardDialog } from '@navet/app/components/primitives/Cards/BaseCardDialog';
import { companionRowHighlight } from '@navet/app/components/shared/companion-row-presentation';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { getThemeFocusRingClassName } from '@navet/app/components/system/tokens';
import { cn } from '@navet/app/components/ui/utils';
import { useI18n, useIntegrationStore, useTheme } from '@navet/app/hooks';
import type { NavetEntity } from '@navet/core/types';
import { lazy, type ReactNode, Suspense, useRef, useState } from 'react';

const CompanionEntityCard = lazy(async () => ({
  default: (await import('./companion-entity-card')).CompanionEntityCard,
}));

export function CompanionEntityDetails({
  entity,
  editing,
  children,
  className,
}: {
  entity: NavetEntity;
  editing: boolean;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const connected = useIntegrationStore(
    (state) => state.providerRuntime[entity.providerId]?.connected
  );
  const disabled = editing || !connected || entity.availability !== 'available';
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={t('entityCardInteraction.openSettings', { name: entity.name })}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          companionRowHighlight,
          'text-left',
          !disabled && surface.hoverBg,
          getThemeFocusRingClassName(theme),
          className
        )}
      >
        {children}
      </button>
      <BaseCardDialog
        variant="modal"
        title={entity.name}
        titleInContent
        bodyPadding={false}
        theme={theme}
        isOpen={open && !disabled}
        onOpenChange={setOpen}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger.current?.focus();
        }}
      >
        <CardDialogHeader
          title={entity.name}
          theme={theme}
          editableTitle={false}
          showRoomSelector={false}
        />
        <div className="px-4 pb-4">
          {open && !disabled ? (
            <Suspense fallback={null}>
              <CompanionEntityCard entity={entity} />
            </Suspense>
          ) : null}
        </div>
      </BaseCardDialog>
    </>
  );
}
