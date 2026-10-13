import { STORAGE_KEYS } from '@navet/app/constants/storage-keys';
import { useI18n, usePersistedState, useProviderCalendarDevicesCollection } from '@navet/app/hooks';
import { subscribeVisibilityAwareTask } from '@navet/app/utils/visibility-aware-scheduler';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getCalendarEventSortValue,
  isCalendarEventVisibleInWindow,
} from './calendar-event-visibility';
import type { CalendarEvent } from './types';

type PersistedCalendarSources = Record<string, string[]>;
type CalendarViewMode = 'week' | 'month';
type PersistedCalendarViewModes = Record<string, CalendarViewMode>;
type PersistedCalendarTintColors = Record<string, string>;

const SOURCE_COLOR_CLASSES = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-green-500',
  'bg-orange-500',
  'bg-indigo-500',
] as const;
const CALENDAR_TIME_WINDOW_REFRESH_MS = 60 * 1000;

export function useCalendarCardSources(cardId?: string, fallbackEvents: CalendarEvent[] = []) {
  const { t } = useI18n();
  const calendars = useProviderCalendarDevicesCollection();
  const [timeWindowTick, setTimeWindowTick] = useState(() => Date.now());
  const [calendarSources, setCalendarSources] = usePersistedState<PersistedCalendarSources>(
    STORAGE_KEYS.calendarCardSources,
    {}
  );
  const [calendarViewModes, setCalendarViewModes] = usePersistedState<PersistedCalendarViewModes>(
    STORAGE_KEYS.calendarCardViewModes,
    {}
  );
  const [calendarTintColors, setCalendarTintColors] =
    usePersistedState<PersistedCalendarTintColors>(STORAGE_KEYS.calendarCardTintColors, {});
  const lastResolvedSelectedEventsRef = useRef<CalendarEvent[]>(fallbackEvents);

  useEffect(() => {
    return subscribeVisibilityAwareTask(
      () => setTimeWindowTick(Date.now()),
      CALENDAR_TIME_WINDOW_REFRESH_MS
    );
  }, []);

  const availableCalendars = useMemo(
    () =>
      calendars.flatMap((calendar) => {
        const sources =
          Array.isArray(calendar.sources) && calendar.sources.length > 0
            ? calendar.sources
            : [calendar];

        return sources.map((source, index) => ({
          ...source,
          canCreate: 'canCreate' in source && source.canCreate === true,
          available: 'available' in source && source.available === true,
          color: SOURCE_COLOR_CLASSES[index % SOURCE_COLOR_CLASSES.length],
        }));
      }),
    [calendars]
  );

  const selectedCalendarIds = useMemo(() => {
    if (!cardId) {
      return [];
    }

    const stored = calendarSources[cardId];
    if (Array.isArray(stored) && stored.length > 0) {
      return stored;
    }

    const aggregateCard = calendars.find((calendar) => calendar.id === cardId);
    if (aggregateCard?.sourceIds?.length) {
      return aggregateCard.sourceIds;
    }

    return [cardId];
  }, [calendarSources, calendars, cardId]);
  const viewMode = useMemo<CalendarViewMode>(() => {
    if (!cardId) {
      return 'week';
    }

    return calendarViewModes[cardId] ?? 'week';
  }, [calendarViewModes, cardId]);
  const tintColor = useMemo(() => {
    if (!cardId) {
      return undefined;
    }

    return calendarTintColors[cardId];
  }, [calendarTintColors, cardId]);

  const selectedEvents = useMemo(() => {
    if (!cardId) {
      return fallbackEvents;
    }

    const selectedIdSet = new Set(selectedCalendarIds);
    const matchedCalendars = availableCalendars.filter((calendar) =>
      selectedIdSet.has(calendar.id)
    );
    if (matchedCalendars.length === 0) {
      if (fallbackEvents.length > 0) {
        return fallbackEvents;
      }

      return lastResolvedSelectedEventsRef.current;
    }

    const now = new Date(timeWindowTick);
    const endDate = new Date(now);
    endDate.setDate(now.getDate() + (viewMode === 'week' ? 7 : 31));

    return matchedCalendars
      .flatMap((calendar) =>
        calendar.events.map((event) => ({
          ...event,
          color: calendar.color,
        }))
      )
      .filter((event) => isCalendarEventVisibleInWindow(event, now, endDate))
      .sort((left, right) => {
        const leftKey = getCalendarEventSortValue(left);
        const rightKey = getCalendarEventSortValue(right);
        return leftKey.localeCompare(rightKey);
      })
      .slice(0, viewMode === 'week' ? 7 : 12);
  }, [availableCalendars, cardId, fallbackEvents, selectedCalendarIds, timeWindowTick, viewMode]);

  useEffect(() => {
    if (selectedEvents.length > 0 || fallbackEvents.length === 0) {
      lastResolvedSelectedEventsRef.current = selectedEvents;
    }
  }, [fallbackEvents.length, selectedEvents]);

  const selectedCalendarLabel = useMemo(() => {
    const matchedCalendars = availableCalendars.filter((calendar) =>
      selectedCalendarIds.includes(calendar.id)
    );

    if (matchedCalendars.length === 1) {
      return matchedCalendars[0].name;
    }

    if (matchedCalendars.length > 1) {
      return t('calendar.selectedCalendars', { count: matchedCalendars.length });
    }

    return t('calendar.defaultSourceName');
  }, [availableCalendars, selectedCalendarIds, t]);

  const setSelectedCalendarIds = (nextIds: string[]) => {
    if (!cardId) {
      return;
    }

    setCalendarSources((current) => ({
      ...current,
      [cardId]: nextIds,
    }));
  };

  const setViewMode = (nextViewMode: CalendarViewMode) => {
    if (!cardId) {
      return;
    }

    setCalendarViewModes((current) => ({
      ...current,
      [cardId]: nextViewMode,
    }));
  };

  const setTintColor = (nextTintColor?: string) => {
    if (!cardId) {
      return;
    }

    setCalendarTintColors((current) => {
      if (!nextTintColor) {
        const { [cardId]: _removedTintColor, ...rest } = current;
        return rest;
      }

      return {
        ...current,
        [cardId]: nextTintColor,
      };
    });
  };

  return {
    availableCalendars,
    selectedCalendarIds,
    selectedCalendarLabel,
    selectedEvents,
    setSelectedCalendarIds,
    setTintColor,
    setViewMode,
    tintColor,
    viewMode,
  };
}
