---
title: Customize your Home dashboard
description: Move, resize, hide, lock, and arrange Home cards without changing provider devices.
editUrl: https://github.com/navet-app/navet/edit/main/docs/how-to/dashboards/customize-home.md
---

Home edit mode changes the active dashboard layout. It does not reconfigure the underlying device
unless a separate dialog explicitly describes a provider change.

![Home in edit mode with card controls, layout choices, undo, redo, Add Card, and Done visible.](/docs/how-to/dashboards/customize-home-layout-edit-mode.webp)

## Watch the dashboard tutorial

Build on the included **Home** dashboard: add cards, choose sizes, arrange sections with mouse
drag and drop, and check the result on a phone. The recording uses Home Assistant as its example
provider; the dashboard workflow itself is provider-neutral.

<iframe class="navet-video" src="https://www.youtube-nocookie.com/embed/8xis2yjmul8" title="Navet Dashboard Guide: Add Cards and Arrange Home" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="fullscreen" allowfullscreen></iframe>

[Watch the dashboard tutorial on YouTube](https://youtu.be/8xis2yjmul8). New to Navet? Start with
[the setup guide](/getting-started/#watch-the-setup-guide).

## Enter edit mode

1. Open the Home dashboard you want to change.
2. Choose **Customize** in the companion panel on desktop, or **Customize** / **Edit dashboard** on smaller screens.
3. Confirm that the editing command bar appears.

On screens 1100px wide or narrower, choose **More actions** for room management, presets, layout
choices, and section controls. **Add Card**, **Undo**, **Redo**, and **Done** remain on the bar.

## Customize the companion panel

Use **Settings → Dashboard → Companion panel** to turn the panel on or off for this device.
Turning it off restores the existing header and navigation without changing your saved panel
content or collapse preference.

The panel beside the desktop navigation rail keeps the clock, weather, a camera snapshot and
security status visible while you switch rooms. Use **Collapse companion panel** to give that space
back to the dashboard, and **Expand companion panel** to restore it. This control is separate from
the Home Assistant kiosk control. The collapsed state is saved for this device.

Choose **Customize sidebar** beside **Home overview** to select a camera and weather source, hide
either item, or show security status. These choices belong to the active Home dashboard and stay
the same in every room. Other Home dashboards can use different selections. **Automatic** uses the
first source of that kind from your selected providers. If a selected source is unavailable, the
panel shows that state rather than replacing it with another source.

The companion panel is available on landscape screens at least 1100 pixels wide and 600 pixels
tall. All other screen sizes retain the existing header and navigation, including portrait
screens and phones. Resizing or rotating the screen preserves your companion collapse preference.
Search, notifications and your account controls use the same data and actions as the rest of Navet.

## Arrange cards

While editing, you can:

- Drag a card to another position.
- Change its supported size.
- Move it into another section or column.
- Optionally lock a card to disable its input outside edit mode, which can be useful for
  information cards. This does not lock its layout position.
- Hide an automatically added entity.
- Delete a Navet widget or manually added card.

Available sizes depend on the card type and screen width.

![The current phone card-size sheet with footprint choices and the selected size identified.](/docs/how-to/dashboards/card-size-selector.webp)

![Home in edit mode with Undo, Redo, Add Card, and Done in the command bar.](/docs/how-to/dashboards/customize-home-edit-mode.webp)

## Use undo and redo

Choose **Undo** to reverse the latest layout change and **Redo** to reapply it. These controls are
most useful before you leave edit mode.

## Finish

Choose **Done**. Navet saves the active Home layout to the dashboard profile. Enter content such
as a Quick Note after leaving edit mode.

If another registered device is editing the shared profile at the same time, Navet may ask which
version to keep. See [Resolve a synchronization conflict](/guide/dashboards/sync-conflicts/).

## Restore a hidden card

Open **Settings → Dashboard → Entity visibility** and use the restore action. See
[Restore removed entities](/guide/dashboards/restore-entities/).

## Before making a large change

Use [Back up and restore configuration](/guide/dashboards/backup-and-restore/) before replacing a
large layout or experimenting with several packs.
