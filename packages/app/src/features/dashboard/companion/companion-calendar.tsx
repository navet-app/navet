import {
  companionEntityDisabledClassName,
  companionEntityNameTypography,
} from '@navet/app/components/shared/companion-row-presentation';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { CalendarEventDialog } from '@navet/app/features/calendar/components/calendar/calendar-event-dialog';
import {
  getCalendarEventSortValue,
  isCalendarEventVisibleInWindow,
} from '@navet/app/features/calendar/components/calendar/calendar-event-visibility';
import { CalendarAgendaList } from '@navet/app/features/calendar/components/calendar/calendar-primitives';
import type { CalendarEvent } from '@navet/app/features/calendar/components/calendar/types';
import { useCalendarData } from '@navet/app/features/calendar/components/calendar/use-calendar-data';
import { useCalendarTheme } from '@navet/app/features/calendar/components/calendar/use-calendar-theme';
import {
  useI18n,
  useIntegrationStore,
  useProviderCalendarDevicesCollection,
  useTheme,
} from '@navet/app/hooks';
import { subscribeVisibilityAwareTask } from '@navet/app/utils/visibility-aware-scheduler';
import type { NavetEntity } from '@navet/core/types';
import { useEffect, useMemo, useState } from 'react';

export function CompanionCalendar({ entity, editing }: { entity: NavetEntity; editing: boolean }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const colors = useCalendarTheme(theme);
  const connected = useIntegrationStore(
    (state) => state.providerRuntime[entity.providerId]?.connected
  );
  const available = Boolean(connected && entity.availability === 'available');
  const calendars = useProviderCalendarDevicesCollection(entity.providerId, { enabled: available });
  const sourceUnavailable = calendars.some((calendar) =>
    calendar.sources?.some(
      (source) => source.id === entity.canonicalId && source.available === false
    )
  );
  const [now, setNow] = useState(() => new Date());
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  useEffect(() => subscribeVisibilityAwareTask(() => setNow(new Date()), 60_000), []);
  // A selected source never silently becomes a different calendar or inherits dashboard-card preferences.
  const events = useMemo(() => {
    if (!available || sourceUnavailable) return [];
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    return calendars
      .flatMap((calendar) => {
        const sources = calendar.sources?.length ? calendar.sources : [calendar];
        return sources
          .filter((source) => source.id === entity.canonicalId)
          .flatMap((source) => source.events);
      })
      .filter((event) => isCalendarEventVisibleInWindow(event, now, end))
      .sort((a, b) => getCalendarEventSortValue(a).localeCompare(getCalendarEventSortValue(b)))
      .slice(0, 3);
  }, [available, calendars, entity.canonicalId, now, sourceUnavailable]);
  const { smallGroups } = useCalendarData(events);
  return (
    <div
      className={`space-y-2 ${editing || !available || sourceUnavailable ? companionEntityDisabledClassName : ''}`}
    >
      <h3 className={`break-words ${companionEntityNameTypography} ${surface.textSecondary}`}>
        {entity.name}
      </h3>
      {!available || sourceUnavailable ? (
        <p className={`text-sm ${surface.textMuted}`}>{t('common.unavailable')}</p>
      ) : events.length ? (
        <CalendarAgendaList
          dayGroups={smallGroups}
          {...colors}
          density="compact"
          onEventClick={editing ? undefined : setSelected}
        />
      ) : (
        <p className={`text-sm ${surface.textMuted}`}>{t('calendar.noUpcomingEvents')}</p>
      )}
      <CalendarEventDialog
        event={available && !sourceUnavailable && !editing ? selected : null}
        isOpen={available && !sourceUnavailable && !editing && selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        theme={theme}
      />
    </div>
  );
}
