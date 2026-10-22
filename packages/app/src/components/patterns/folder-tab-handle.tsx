import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { cn } from '@navet/app/components/ui/utils';
import { useTheme } from '@navet/app/hooks';
import type { HTMLAttributes, ReactNode } from 'react';

export interface FolderTabHandleProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  /** A keyboard-accessible drag activator; keep its touch target at least 36px. */
  handle: ReactNode;
  actions?: ReactNode;
  size?: 'default' | 'compact';
}

/** Folder tab and baseline shared by section and companion editors. Callers own drag behavior. */
export function FolderTabHandle({
  title,
  handle,
  actions,
  size = 'default',
  className,
  ...props
}: FolderTabHandleProps) {
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const compact = size === 'compact';
  return (
    <div className={cn('flex min-w-0 items-end', className)} {...props}>
      <span
        aria-hidden="true"
        data-folder-tab-rule="start"
        className={cn(compact ? 'w-1' : 'w-2.5', 'shrink-0 border-b', surface.borderStrong)}
      />
      <div
        data-folder-tab
        className={cn(
          'inline-flex min-w-0 items-center border border-b-0',
          compact
            ? 'max-w-[calc(100%_-_0.25rem)] gap-0 rounded-t-lg pr-2'
            : 'max-w-[calc(100%_-_0.625rem)] gap-2 rounded-t-xl px-1.5 pt-0.5',
          surface.borderStrong,
          compact ? surface.panelMuted : theme === 'light' ? 'bg-white/70' : 'bg-white/8'
        )}
      >
        {handle}
        <span
          className={cn(
            'min-w-0 truncate text-xs',
            surface.textMuted,
            compact ? 'font-medium' : 'pr-2 font-semibold uppercase tracking-[0.14em]'
          )}
        >
          {title}
        </span>
      </div>
      <span
        aria-hidden="true"
        data-folder-tab-rule="end"
        className={cn('min-w-0 flex-1 border-b', surface.borderStrong)}
      />
      {actions ? (
        <div className={cn('flex shrink-0 items-center gap-1 border-b', surface.borderStrong)}>
          {actions}
        </div>
      ) : null}
    </div>
  );
}
