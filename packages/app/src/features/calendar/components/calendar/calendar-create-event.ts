import type { PlatformCalendarCreateEvent } from '@navet/core/provider-feature-models';

export interface CalendarEventDraft {
  title: string;
  allDay: boolean;
  start: string;
  end: string;
  location: string;
  description: string;
}

/** The form's all-day end is the last included day; providers receive an exclusive end. */
export function buildCalendarCreateEvent(draft: CalendarEventDraft): PlatformCalendarCreateEvent {
  const title = draft.title.trim();
  if (!title) throw new Error('title');
  const details = { title, location: draft.location.trim(), description: draft.description.trim() };
  if (draft.allDay) {
    const dates = [draft.start, draft.end].map((value) => {
      const date = new Date(`${value}T00:00:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
      )
        throw new Error('range');
      return date;
    });
    if (dates[1].getTime() < dates[0].getTime()) throw new Error('range');
    dates[1].setUTCDate(dates[1].getUTCDate() + 1);
    return {
      ...details,
      allDay: true,
      startDate: draft.start,
      endDate: dates[1].toISOString().slice(0, 10),
    };
  }
  const dates = [draft.start, draft.end].map((value) => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('range');
    const date = new Date(value);
    // Reject nonexistent local times (including the spring daylight-saving gap).
    const parts = [
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
    ];
    const inputParts = value.split(/[-T:]/).map(Number);
    if (Number.isNaN(date.getTime()) || parts.some((part, index) => part !== inputParts[index]))
      throw new Error('range');
    return date;
  });
  if (dates[1].getTime() <= dates[0].getTime()) throw new Error('range');
  return {
    ...details,
    allDay: false,
    startDateTime: dates[0].toISOString(),
    endDateTime: dates[1].toISOString(),
  };
}
