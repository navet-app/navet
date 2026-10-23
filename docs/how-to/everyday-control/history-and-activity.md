---
title: Explore history and activity
description: Look up an entity's past states and recorded activity for a selected date and time range.
editUrl: https://github.com/navet-app/navet/edit/main/docs/how-to/everyday-control/history-and-activity.md
---

Use **History and activity** to investigate one entity over a selected period. Home Assistant
supplies state history and recorded activity; Homey supplies state history for supported Insights
entities. openHAB does not currently supply either view to Navet.

## Load records

1. Open the user menu and choose **History and activity**.
2. Use **Find an entity** to narrow the list, then choose the **Entity**. The list includes the
   source name to distinguish entities from different providers.
3. Set **Start** and **End** in the display's time zone, shown below the fields. Choose a later
   end, no more than 31 days after the start.
4. Under **View**, choose **State history** or **Activity**.
5. Choose **Load records**.

Requests go to the entity's owning source. Reconnect a disconnected source before loading records.

## Understand the results

**State history** includes numeric readings and states such as on, off, open, or closed. A retained
state at the range boundary is labelled **State at the start of the range**; it does not mean a
change happened at that moment.

**Activity** shows recorded events and cause details, such as an automation, service, or user
action, when Home Assistant supplies them. It follows Home Assistant's activity filters and can
omit frequently changing numeric sensors.

Use **Show more** to reveal additional rows. A query returns at most the newest 1,000 records;
choose a shorter range when the limit message appears. For energy totals and comparisons, use
[Energy history](/guide/everyday-control/energy/) instead.

## If records are empty or unavailable

An empty result can mean no changes occurred, the entity is excluded from recording, or the source
no longer retains that period. Navet cannot reconstruct deleted records. Confirm that the source
records the entity, check the connection, and try a recent, shorter range.

Some Homey entities have no supported Insights log. **Activity** requires Home Assistant even when
the selected source supports state history. See [provider compatibility](/integrations/) for coverage.
