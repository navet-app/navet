import {
  companionEntityNameTypography,
  companionEntityRowClassName,
} from '@navet/app/components/shared/companion-row-presentation';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { getChoreCardAction } from '@navet/app/features/chores/chore-card-action';
import { getHouseholdTodayOccurrences } from '@navet/app/features/chores/chore-dashboard-selectors';
import { useChoreWorkspaceStore } from '@navet/app/features/chores/chore-workspace-store';
import { ChoreActionControl } from '@navet/app/features/chores/components/chore-card';
import { useChoreClock } from '@navet/app/features/chores/use-chore-clock';
import { useChoreWorkspaceSync } from '@navet/app/features/chores/use-chore-workspace-sync';
import { useI18n, useTheme } from '@navet/app/hooks';
import { getChoreTiming } from '@navet/core/chores';
import { CompanionRowLoading } from './companion-row-loading';

export function CompanionChores({ editing }: { editing: boolean }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const data = useChoreWorkspaceStore((state) => state.data);
  const status = useChoreWorkspaceStore((state) => state.status);
  const error = useChoreWorkspaceStore((state) => state.error);
  const execute = useChoreWorkspaceStore((state) => state.execute);
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
      {!available ? (
        status === 'loading' || status === 'idle' ? (
          <CompanionRowLoading name={t('household.tabs.chores')} />
        ) : (
          <p className={`text-xs ${surface.textMuted}`} role="status">
            {t('common.unavailable')}
          </p>
        )
      ) : !occurrences.length ? (
        <p className={`text-sm ${surface.textMuted}`}>{t('household.today.emptyTitle')}</p>
      ) : (
        occurrences.map((occurrence) => {
          const definition = data?.definitionsById[occurrence.definitionId];
          if (!definition || !data) return null;
          const action = getChoreCardAction(occurrence, definition, 'all', execute, t);
          const timing = getChoreTiming(occurrence, now);
          const names = occurrence.assigneeIds
            .map((id) => data.participantsById[id]?.displayName)
            .filter(Boolean)
            .join(', ');
          return (
            <div key={occurrence.id} className={companionEntityRowClassName}>
              <div className="min-w-0 flex-1">
                <p className={`break-words ${companionEntityNameTypography}`}>{definition.title}</p>
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
              {action ? (
                <ChoreActionControl
                  action={{ ...action, disabled: editing || status === 'saving' }}
                  participantsById={data.participantsById}
                  compact
                  accessibleLabel={`${action.label}: ${definition.title}`}
                />
              ) : null}
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
