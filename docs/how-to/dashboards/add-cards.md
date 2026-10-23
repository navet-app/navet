---
title: Add cards, devices, and widgets
description: Find provider entities and Navet widgets, choose placement, and configure a new card.
editUrl: https://github.com/navet-app/navet/edit/main/docs/how-to/dashboards/add-cards.md
---

The Add Card library combines provider-backed entities with Navet-owned widgets. It excludes cards
already present in the target area where duplicates would not be useful.

![The phone Add Card sheet showing All cards, Custom cards, search, filters, and sample devices.](/docs/how-to/dashboards/add-card-library.webp)

Watch the [Add Card demonstration on YouTube](https://youtu.be/8xis2yjmul8?t=32), or follow the
[full dashboard tutorial](/guide/dashboards/customize-home/#watch-the-dashboard-tutorial).

## Open Add Card

1. Open the target dashboard and room.
2. Enter edit mode.
3. Choose **Add Card**.

Use this library to build Home’s overview layout and add cards to rooms.

## Find what you need

- Use **All cards** for devices and other provider entities.
- Use **Custom cards** for Navet content such as notes, RSS, photos, actions, maps, battery summaries,
  UPS status, and energy summaries.
- Search by the visible device or room name.
- Use an explicit native identifier when you need to find one exact provider entity.
- In **Custom cards**, search by card name, sort the results, or filter by supported card size.

![The phone Add Card sheet filtered to the Kitchen island light.](/docs/how-to/dashboards/add-card-search.webp)

![The Custom cards tab showing Navet note and information card templates.](/docs/how-to/dashboards/add-card-custom.webp)

On phones, Add Card opens as a tall sheet with its own close action. On larger
screens, the same library keeps the navigation and results visible side by side.

Generic entity cards are available when Navet recognizes an entity but has no richer dedicated
card for it.

Where a dashboard offers **Add entity**, it uses the same searchable library, room filter,
sorting, and device-type navigation as Home. The list contains entities eligible for that
dashboard; adding an entity keeps the dashboard’s existing behavior. Custom-card authoring
remains available through **Add Card**.

## Helpers

Helpers are added only when you choose them in **All cards**. Standalone helpers keep their own
cards and controls. Helpers attached to a device with a visible parent card appear in that
card’s dialog when it supports related helper controls. Helpers associated with lock or person
cards remain available in **All cards**. Expand a value row to edit it, then choose **Save**. Supported device
configuration value helpers are available there too.

## Timers, counters, valves, and remotes

Home Assistant timers, counters, valves, and remotes appear in **All cards**. Add one to
Home or a room, then open its card to use the controls supported by that entity.

- Timers support starting, pausing, resuming, canceling, and finishing. Enter a duration in
  seconds when starting with a different duration; leave it empty to use the configured duration.
- Counters support increasing, decreasing, resetting, and setting a value. The provider's
  configured limits and step apply, including negative values when allowed.
- Valves expose their supported open, close, stop, and position controls. Stop remains available
  while a supported valve moves. Position is a percentage from 0 to 100.
- Remotes support turning on and off. Device-specific buttons, activities, and command learning
  are not available from these cards.

Controls follow live provider state. While an update is pending, Navet prevents duplicate writes;
if an update fails or stalls, try the action again. Unavailable entities keep their controls disabled.
Tiny and Extra small cards open the same controls from their compact display.

## Configure the card

Depending on the card type, choose:

- The room or Home overview where it belongs.
- A supported size.
- A display name or icon.
- Widget-specific content, source, or action.

Choose the add or save action. Navet places the card in the target area.

Cover cards default to **Small**; climate and speaker cards default to **Medium**.
In edit mode, use the card's size control to choose
**Small**, **Medium**, or **Large**. Navet remembers the size you choose.

![A newly added card highlighted on Home.](/docs/how-to/dashboards/add-card-result.webp)

## If the entity is not listed

1. Clear the search.
2. Confirm that its provider is connected and selected.
3. Check **Settings → Dashboard → Entity visibility**.
4. Review [Rooms, devices, or entities are missing](/guide/troubleshooting/missing-entities/).

## Related guides

- [Add notes, photos, and RSS feeds](/guide/everyday-control/notes-photos-rss/)
- [Create actions, maps, and status widgets](/guide/everyday-control/actions-maps-status/)
- [View calendars and create events](/guide/everyday-control/calendar-events/)
- [Widget reference](/guide/widgets/)
