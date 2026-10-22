import { Button } from '@navet/app/components/primitives/button';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { getHouseholdTodayOccurrences } from '@navet/app/features/chores/chore-dashboard-selectors';
import { useChoreWorkspaceStore } from '@navet/app/features/chores/chore-workspace-store';
import { useChoreClock } from '@navet/app/features/chores/use-chore-clock';
import { useChoreWorkspaceSync } from '@navet/app/features/chores/use-chore-workspace-sync';
import { useI18n, useTheme } from '@navet/app/hooks';
import { useNavigationStore } from '@navet/app/stores';
import { getChoreTiming } from '@navet/core/chores';
import { ArrowUpRight } from 'lucide-react';

export function CompanionChores({ editing }: { editing: boolean }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const data = useChoreWorkspaceStore((state) => state.data);
  const status = useChoreWorkspaceStore((state) => state.status);
  const error = useChoreWorkspaceStore((state) => state.error);
  const navigate = useNavigationStore((state) => state.setActiveSection);
  const now = useChoreClock();
  useChoreWorkspaceSync();
  const available = Boolean(data && (status === 'ready' || status === 'saving'));
  const occurrences =
    available && data
      ? getHouseholdTodayOccurrences(data, now)
          .filter((item) => item.status !== 'done')
          .slice(0, 3)
      : [];
  return (
    <div className="space-y-1">
      <Button
        variant="ghost"
        size="compact"
        className="w-full justify-between px-0"
        disabled={editing}
        trailing={<ArrowUpRight className="h-4 w-4" />}
        onClick={() => navigate('tasks')}
      >
        {t('household.tabs.chores')}
      </Button>
      {!available ? (
        <p className={`text-sm ${surface.textMuted}`} role="status">
          {t(
            status === 'loading' || status === 'idle' ? 'household.loading' : 'common.unavailable'
          )}
        </p>
      ) : !occurrences.length ? (
        <p className={`text-sm ${surface.textMuted}`}>{t('household.today.emptyTitle')}</p>
      ) : (
        occurrences.map((occurrence) => {
          const definition = data?.definitionsById[occurrence.definitionId];
          if (!definition || !data) return null;
          const timing = getChoreTiming(occurrence, now);
          const names = occurrence.assigneeIds
            .map((id) => data.participantsById[id]?.displayName)
            .filter(Boolean)
            .join(', ');
          return (
            <div key={occurrence.id} className="flex min-h-10 items-center gap-2 py-1">
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm">{definition.title}</p>
                <p className={`break-words text-xs ${surface.textMuted}`}>
                  {[
                    occurrence.status === 'awaiting_approval'
                      ? t('household.today.awaitingApproval')
                      : timing === 'overdue'
                        ? t('household.today.overdue')
                        : names,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </div>
          );
        })
      )}
      {error ? (
        <p className={`text-xs ${surface.textMuted}`} role="alert">
          {t('notifications.action.failed')}
        </p>
      ) : null}
    </div>
  );
}
