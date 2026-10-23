---
title: Manage shopping and to-do lists
description: Add, complete, edit, and remove items in lists supplied by Home Assistant.
editUrl: https://github.com/navet-app/navet/edit/main/docs/how-to/everyday-control/shared-lists.md
---

Use **Household → Routines → Lists** for shopping and to-do items from a connected Home Assistant source.
Create the list in Home Assistant first. Navet shows the lists that source makes available;
Homey and openHAB do not currently supply lists to Navet.

## Choose a list

1. Open **Household → Routines → Lists**.
2. Use **Choose a list** to select the shopping or to-do list you want.
3. Review its items. Checked items are completed.

When household chores are turned off, the outer **Routines** tab is omitted; choose **Lists**
in the tasks workspace directly.

Changes are saved to the selected list's owning provider and appear on other screens using that
list. Lists are separate from Navet's [recurring household chores](/guide/chores/) and
[provider routines](/guide/everyday-control/automations-and-scripts/).

## Add or edit an item

1. Choose **Add item**, or the item's **Edit item** action.
2. Enter an **Item name**.
3. Add a description or due date if the list offers those fields. For **Due date and time**, use
   the current display's local time.
4. Choose **Add item** for a new item or **Save** for an edit.

Only the fields and actions supported by the list are shown. Some individual items may also be
read-only. If saving fails, the editor keeps your changes so you can retry.

## Complete, reopen, or remove an item

- Check an item to mark it complete.
- Clear its checkbox to reopen it.
- Choose **Remove item** to delete it when the list supports removal.

Wait for a pending change to finish before making another change to that list.

## If a list is missing or unavailable

Confirm the Home Assistant source is connected and that the list exists there. Use **Try again**
if loading fails. An unavailable list keeps its controls disabled until its source is available.
See [provider compatibility](/integrations/) for the supported list features.
