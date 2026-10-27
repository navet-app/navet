---
title: Create actions, maps, and status widgets
description: Add a custom action, scene shortcut, location map, or household status summary.
editUrl: https://github.com/navet-app/navet/edit/main/docs/how-to/everyday-control/actions-maps-status.md
---

These widgets turn selected household actions or summaries into focused dashboard cards.

![The widget chooser with Action, Scene, Map, Battery, UPS, and Energy choices.](/docs/how-to/everyday-control/utility-widget-chooser.webp)

## Create an action

1. Enter edit mode and open **Add Card → Custom cards**.
2. Choose **Action**.
3. Select the supported target and action.
4. Give it a clear household label.
5. Choose a compact supported size and save.

Choose **Scene** to add a shortcut to a scene supplied by your provider.

## Add a map

Choose **Map** and select available people or tracker entities. Location data stays sourced from
the connected provider.

## Add status summaries

- **Battery overview** groups low-battery state.
- **UPS monitor** summarizes supported power backup entities.
- **Energy now** shows a live energy snapshot.
- **Info** can present a compact grouped summary.

## Keep actions safe

Use clear labels and avoid creating ambiguous shortcuts for locks, alarms, or other risky commands.
The available action model is bounded by Navet and the owning provider.
