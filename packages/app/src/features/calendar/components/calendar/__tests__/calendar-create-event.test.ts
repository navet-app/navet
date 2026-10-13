import { parseCalendarDate } from '@navet/app/hooks/entity-utils/calendar-utils';
import { describe, expect, it } from 'vitest';
import { buildCalendarCreateEvent, type CalendarEventDraft } from '../calendar-create-event';

const draft: CalendarEventDraft = {
  title: 'Holiday',
  allDay: true,
  start: '2026-10-25',
  end: '2026-10-25',
  location: '',
  description: '',
};

describe('household calendar event dates', () => {
  it('creates a single all-day event across a DST boundary without shifting dates', () => {
    expect(buildCalendarCreateEvent(draft)).toMatchObject({
      allDay: true,
      startDate: '2026-10-25',
      endDate: '2026-10-26',
    });
    expect(
      buildCalendarCreateEvent({ ...draft, start: '2026-12-31', end: '2027-01-02' })
    ).toMatchObject({ startDate: '2026-12-31', endDate: '2027-01-03' });
  });
  it('displays all-day service dates on the intended local day', () => {
    for (const value of ['2026-10-25', { date: '2026-10-25' }]) {
      const date = parseCalendarDate(value);
      expect([date?.getFullYear(), date?.getMonth(), date?.getDate(), date?.getHours()]).toEqual([
        2026, 9, 25, 0,
      ]);
    }
  });
  it('sends local timed events as explicit instants', () => {
    const event = buildCalendarCreateEvent({
      ...draft,
      allDay: false,
      start: '2026-10-15T09:00',
      end: '2026-10-15T10:00',
    });
    expect(event).toMatchObject({
      allDay: false,
      startDateTime: new Date('2026-10-15T09:00').toISOString(),
      endDateTime: new Date('2026-10-15T10:00').toISOString(),
    });
  });
  it.skipIf(Intl.DateTimeFormat().resolvedOptions().timeZone !== 'Europe/Stockholm')(
    'rejects a nonexistent time during the daylight-saving change',
    () => {
      expect(() =>
        buildCalendarCreateEvent({
          ...draft,
          allDay: false,
          start: '2026-03-29T02:30',
          end: '2026-03-29T04:00',
        })
      ).toThrow();
    }
  );
  it('rejects empty titles, invalid calendar dates and reversed or equal timed ranges', () => {
    for (const invalid of [
      { ...draft, title: ' ' },
      { ...draft, start: '2026-02-30' },
      { ...draft, end: '2026-10-24' },
      { ...draft, allDay: false, start: '2026-10-15T09:00', end: '2026-10-15T09:00' },
    ])
      expect(() => buildCalendarCreateEvent(invalid)).toThrow();
  });
});
