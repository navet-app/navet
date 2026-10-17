import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { cn } from '@navet/app/components/ui/utils';
import { useI18n, useMediaQuery, useTheme } from '@navet/app/hooks';
import type { Section } from '@navet/app/navigation/sections';
import { sortOperationalItems } from '@navet/app/types/operational-signal';
import { darkenColor } from '@navet/app/utils/color-utils';
import { openCustomExtensionUrl } from '@navet/app/utils/custom-extensions';
import { type HTMLAttributes, memo, type ReactNode } from 'react';
import type { HomeStatusSummaryItem } from './home-status-summary-model';

interface SummaryBarProps {
  items: HomeStatusSummaryItem[];
  onNavigate?: (section: Section) => void;
  className?: string;
  ariaLabel?: string;
  leadingContent?: ReactNode;
  trailingContent?: ReactNode;
  /** Preserve room control positions as summary items change. */
  singleRow?: boolean;
}

export const SummaryBar = memo(function SummaryBar({
  items,
  onNavigate,
  className = '',
  ariaLabel = 'Status summary',
  leadingContent,
  trailingContent,
  singleRow = false,
}: SummaryBarProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const isMobileViewport = useMediaQuery('(max-width: 767px)');
  const surface = getThemeSurfaceTokens(theme);
  const orderedItems = sortOperationalItems(items);

  if (items.length === 0 && !leadingContent && !trailingContent) {
    return null;
  }

  return (
    <nav className={`min-w-0 ${className}`} aria-label={ariaLabel}>
      {/* biome-ignore-start lint/a11y/noNoninteractiveTabindex: Static status chips need a focus target so keyboard users can scroll them on narrow screens. */}
      <div
        tabIndex={isMobileViewport || singleRow ? 0 : undefined}
        className={cn(
          'scrollbar-hide flex gap-1.5 overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 md:gap-2',
          singleRow ? 'flex-nowrap items-center md:h-11' : 'md:flex-wrap md:overflow-visible'
        )}
      >
        {/* biome-ignore-end lint/a11y/noNoninteractiveTabindex: End scroll region opening tag. */}
        {leadingContent}
        {orderedItems.map((item) => {
          const IconComponent = item.icon;
          const isDanger = item.tone === 'danger';
          const isWarning = item.tone === 'warning';
          const isSuccess = item.tone === 'success';
          const isActive = item.tone === 'active';
          const iconColor = isDanger
            ? theme === 'light'
              ? '#dc2626'
              : '#fca5a5'
            : theme === 'light'
              ? darkenColor(item.iconColor, 68)
              : item.iconColor;
          const isInteractive = Boolean(
            item.onSelect || item.targetUrl || (item.targetSection && onNavigate)
          );
          const contentGridClassName = 'grid-cols-[auto_minmax(0,1fr)]';
          const focusClassName = isDanger
            ? 'focus-visible:outline-red-400/60'
            : isWarning
              ? 'focus-visible:outline-amber-400/60'
              : 'focus-visible:outline-white/25';
          const chipClassName = isDanger
            ? theme === 'light'
              ? 'border-red-300/80 bg-red-50/88 text-red-800 hover:bg-red-100/92'
              : 'border-red-500/30 bg-red-500/10 text-red-100 hover:bg-red-500/16'
            : isWarning
              ? theme === 'light'
                ? 'border-amber-300/80 bg-amber-50/88 text-amber-900 hover:bg-amber-100/92'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/16'
              : isSuccess
                ? theme === 'light'
                  ? 'border-emerald-300/80 bg-emerald-50/88 text-emerald-900 hover:bg-emerald-100/92'
                  : 'border-emerald-500/28 bg-emerald-500/9 text-emerald-100 hover:bg-emerald-500/14'
                : isActive
                  ? theme === 'light'
                    ? 'border-sky-300/80 bg-sky-50/88 text-sky-900 hover:bg-sky-100/92'
                    : 'border-sky-500/28 bg-sky-500/9 text-sky-100 hover:bg-sky-500/14'
                  : theme === 'light'
                    ? 'border-slate-200/70 bg-white/55 text-slate-900 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.28)] hover:bg-white/75'
                    : theme === 'black'
                      ? 'border-white/10 bg-white/[0.035] text-white/88 hover:bg-white/[0.065]'
                      : 'border-white/10 bg-white/[0.055] text-white/88 backdrop-blur-xl hover:bg-white/[0.085]';
          const content = (
            <>
              <span
                data-testid={`info-badge-strip-icon-${item.id}`}
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-transform group-hover:scale-[1.03] md:h-6 md:w-6',
                  isDanger
                    ? 'relative border-red-400/45 bg-red-500/22'
                    : isWarning
                      ? 'border-amber-400/38 bg-amber-500/16'
                      : 'border-current/10 bg-current/[0.08]'
                )}
                style={{ color: iconColor }}
                aria-hidden="true"
              >
                {isDanger ? (
                  <span
                    data-testid={`info-badge-strip-icon-pulse-${item.id}`}
                    className="pointer-events-none absolute inset-0 rounded-full border border-red-400/50 bg-red-400/20 motion-safe:animate-ping motion-reduce:hidden"
                  />
                ) : null}
                <IconComponent className="relative z-10 h-3 w-3 md:h-3.5 md:w-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block max-w-[8rem] truncate text-[10px] font-semibold leading-3 tracking-normal md:max-w-[10rem] md:text-[11px] md:leading-3.5">
                  {item.title}
                </span>
                <span
                  className={cn(
                    'block truncate text-[10px] leading-3 md:text-[11px] md:leading-3.5',
                    isDanger
                      ? theme === 'light'
                        ? 'text-red-700/80'
                        : 'text-red-200/80'
                      : isWarning
                        ? theme === 'light'
                          ? 'text-amber-800/80'
                          : 'text-amber-200/80'
                        : surface.textMuted
                  )}
                >
                  {item.value}
                </span>
              </span>
            </>
          );

          if (!isInteractive) {
            return (
              <div
                key={item.id}
                className={cn(
                  'group inline-grid min-h-9 shrink-0 items-center gap-1 rounded-full border px-1.5 py-1 pr-2 text-left md:gap-1.5 md:px-2 md:py-1.5 md:pr-3',
                  contentGridClassName,
                  chipClassName
                )}
              >
                {content}
              </div>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.onSelect) {
                  item.onSelect();
                  return;
                }

                if (item.targetUrl) {
                  openCustomExtensionUrl(item.targetUrl);
                  return;
                }

                if (item.targetSection) {
                  onNavigate?.(item.targetSection);
                }
              }}
              className={cn(
                'group inline-grid min-h-9 shrink-0 items-center gap-1 rounded-full border px-1.5 py-1 pr-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 md:gap-1.5 md:px-2 md:py-1.5 md:pr-3',
                contentGridClassName,
                focusClassName,
                chipClassName
              )}
              aria-label={t('dashboard.summary.openSection', { name: item.title })}
            >
              {content}
            </button>
          );
        })}
        {trailingContent}
      </div>
    </nav>
  );
});

/** Canonical Home dashboard rhythm between a summary bar and its surrounding content. */
export function SummaryBarStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn('space-y-3', className)} />;
}

export const InfoBadgeStrip = SummaryBar;
