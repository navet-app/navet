---
title: Restore removed entities
description: Add hidden dashboard entities back or restart the first-run dashboard choices.
editUrl: https://github.com/navet-app/navet/edit/main/docs/how-to/dashboards/restore-entities.md
---

Hiding a provider-backed card removes it from the dashboard presentation; it does not delete the
entity from the provider.

![Entity visibility settings showing a summary of removed entities.](/docs/how-to/dashboards/entity-visibility.webp)

## Add removed entities back

1. Open **Settings → Dashboard**.
2. Find **Entity visibility**.
3. Review the hidden-entity summary.
4. Choose **Restore entities**.
5. Restore an individual entity or choose **Restore all**.

Navet restores eligible automatically generated cards. You can hide individual cards again in Home
edit mode.

## Restart onboarding

1. Open **Settings → Dashboard**.
2. Under **Setup**, choose **Restart onboarding**.
3. Read the confirmation, then choose **Restart**.
4. Navet returns to Home and reopens the startup wizard when provider entities are loaded.

Choose **Start with all entities**, **Start with a blank dashboard**, or **Import a config file**.
The first two routes continue through language, formats, and appearance. Import applies a saved
Navet YAML configuration directly. See
[Complete the startup wizard](/guide/quick-start/first-15-minutes/#complete-the-startup-wizard).

![The confirmation shown before restarting onboarding.](/docs/how-to/dashboards/entity-visibility-confirmation.webp)

Restarting alone reopens setup; it does not reset provider credentials or clear your layout.
Finishing the **blank** route clears the Home layout and custom cards and hides the loaded entities.
Importing can replace current configuration. [Export a backup](/guide/dashboards/backup-and-restore/)
first if you want to preserve an existing setup.

The public demo renders a preset dashboard without the startup wizard. Use an installed Navet
instance to repeat onboarding.

## If one entity still does not appear

Open Add Card and search for it. Generic entity cards may be available even when the entity does
not have a dedicated Navet card.

If it is absent from both places, follow
[Rooms, devices, or entities are missing](/guide/troubleshooting/missing-entities/).
