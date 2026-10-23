---
title: Back up and restore Navet configuration
description: Export a local configuration backup and import it later.
editUrl: https://github.com/navet-app/navet/edit/main/docs/how-to/dashboards/backup-and-restore.md
---

Export a local configuration backup before a large layout change or before importing another
configuration.

![Local config backup with Export config and Import config.](/docs/how-to/dashboards/backup-controls.webp)

## Export a backup

1. Open **Settings → System**.
2. Find **Local config backup**.
3. Choose **Export config**.
4. Store the downloaded file somewhere you control.

The export contains dashboard configuration. Chores use their own **Export chores** and
**Download backup** actions in **Household → Settings → Data and recovery**; follow
[Manage and recover household chores](/guide/everyday-control/manage-household-chores/#export-chore-configuration).
Back up provider-owned data, including shopping lists and calendar events, through the provider.

## Import a backup

1. Return to **Local config backup**.
2. Choose **Import config**.
3. Select a Navet `.yaml` or `.yml` configuration export.
4. A valid file is applied immediately after selection. Wait for the success message and dashboard
   refresh.

Import can replace current local configuration. Export the current state first if you may want it
back.

The startup wizard also offers **Import a config file**. It restores configuration directly instead
of continuing through the language and appearance steps. Standalone Navet refreshes afterward;
the Home Assistant custom panel reveals the imported dashboard in place.
