import {
  companionEntityDisabledClassName,
  companionRowHighlight,
} from '@navet/app/components/shared/companion-row-presentation';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { getThemeFocusRingClassName } from '@navet/app/components/system/tokens';
import { cn } from '@navet/app/components/ui/utils';
import { useI18n, useIntegrationStore, useTheme } from '@navet/app/hooks';
import type { NavetEntity } from '@navet/core/types';
import { lazy, type ReactNode, Suspense, useRef, useState } from 'react';

const CompanionEntityDialog = lazy(async () => ({
  default: (await import('./companion-entity-dialog')).CompanionEntityDialog,
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
          'text-left transition-colors motion-reduce:transition-none',
          !disabled && surface.hoverBg,
          disabled && companionEntityDisabledClassName,
          getThemeFocusRingClassName(theme),
          className
        )}
      >
        {children}
      </button>
      {open && !disabled ? (
        <Suspense fallback={null}>
          <CompanionEntityDialog
            entity={entity}
            dialog={{
              isOpen: true,
              onOpenChange: setOpen,
              onCloseAutoFocus: (event) => {
                event.preventDefault();
                trigger.current?.focus();
              },
            }}
          />
        </Suspense>
      ) : null}
    </>
  );
}
