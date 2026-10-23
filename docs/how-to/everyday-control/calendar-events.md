---
title: View calendars and create events
description: Choose calendar sources and create timed or all-day events in writable Home Assistant calendars.
editUrl: https://github.com/navet-app/navet/edit/main/docs/how-to/everyday-control/calendar-events.md
---

Calendar cards show upcoming events from Home Assistant. To create an event, you need a selected
calendar that supports writing. Calendar data and event creation are currently unavailable through
Homey and openHAB in Navet.

## Choose calendars

1. Open Home or the room containing your calendar and choose **Customize** to enter edit mode.
2. If the calendar is not already there, find it in **Add Card → All cards** and add it.
3. Open the calendar card's settings.
4. Under **Calendars**, select the sources to show together.
5. Choose **This week** or **This month** for the view.
6. Close the settings dialog, then choose **Done** to leave edit mode.

Select an event on the card to read its details. You can also add a calendar to the
[side panel](/guide/dashboards/customize-home/#customize-the-side-panel) for a compact upcoming list.

## Create a timed event

1. Leave dashboard edit mode.
2. Choose the calendar card's **Add event** (+) button.
3. Enter an **Event title** and choose the destination calendar.
4. Set **Start** and **End**, using the time zone shown in the form. The end must be later than
   the start.
5. Optionally enter a location and description.
6. Choose **Create event**.

Navet sends the event to that calendar using your existing Home Assistant connection. The dialog
closes after a successful create. Events outside the card's current view may not appear there.

## Create an all-day event

Turn on **All day** in the event form, then choose the **Start** date and **Last day**. Last day
is the final included day; select the same date for a one-day event. Switching between timed and
all-day entry clears the previous dates, so enter them again before saving.

## If creation is unavailable

The **Add event** button appears only when the card includes a writable calendar, and is disabled
if all of its writable calendars are unavailable. Read-only calendars still display events.
Check the selected sources in the card's settings and their availability in Home Assistant.

If creation fails, your form details remain available for retry. Event editing, deletion, and
recurrence configuration should be managed in the calendar's own application.
