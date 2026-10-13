/**
 * Calendar utilities
 */

import { LruCache } from '@navet/app/utils/lru-cache';

const CALENDAR_TIME_FORMATTER_CACHE_MAX_ENTRIES = 16;
const calendarTimeFormatterCache = new LruCache<string, Intl.DateTimeFormat>(
  CALENDAR_TIME_FORMATTER_CACHE_MAX_ENTRIES
);

export function parseCalendarDate(value: unknown): Date | null {
  const raw =
    typeof value === 'string'
      ? value
      : value && typeof value === 'object'
        ? ((value as Record<string, unknown>).dateTime ?? (value as Record<string, unknown>).date)
        : null;
  if (typeof raw === 'string' && raw) {
    // A calendar date is a household day, not midnight UTC in the display's zone.
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export function isAllDayCalendarValue(value: unknown): boolean {
  if (typeof value === 'string' && value) return /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return typeof record.date === 'string' && record.date.length > 0;
  }
  return false;
}

export function formatCalendarTime(
  date: Date | null,
  locale: string,
  use24HourTime = false
): string {
  if (!date) return '--';
  const formatterKey = `${locale}:${use24HourTime ? '24' : '12'}`;
  let formatter = calendarTimeFormatterCache.get(formatterKey);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: !use24HourTime,
    });
    calendarTimeFormatterCache.set(formatterKey, formatter);
  }
  return formatter.format(date);
}

export function inferCalendarEventType(title: string, location?: string) {
  const searchText = `${title} ${location ?? ''}`.toLowerCase();

  if (
    searchText.includes('zoom') ||
    searchText.includes('meet') ||
    searchText.includes('teams') ||
    searchText.includes('call') ||
    searchText.includes('video')
  ) {
    return 'call' as const;
  }

  if (
    searchText.includes('meeting') ||
    searchText.includes('standup') ||
    searchText.includes('review') ||
    searchText.includes('sync')
  ) {
    return 'meeting' as const;
  }

  return 'event' as const;
}
