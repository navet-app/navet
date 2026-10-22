---
title: Keep dashboards synchronized across devices
description: Understand shared profile changes, device-owned settings, and connected-device status.
editUrl: https://github.com/navet-app/navet/edit/main/docs/how-to/dashboards/sync-across-devices.md
---

Supported standalone and server-backed installations can synchronize dashboard structure across
connected screens while preserving settings that belong to one physical screen. In standalone
Navet, each additional screen also needs access approval from a primary sign-in.

![System settings showing Authorized devices and the primary sign-in's device roster.](/docs/how-to/dashboards/authorized-devices.webp)

## Understand what synchronizes

- Dashboard layouts, dashboard collections, room workspace configuration, and other household
  structure can be shared.
- Display behavior such as kiosk mode, visual quality, and layout is independent on each device by
  default.
- Provider credentials stay within your Navet installation. An approved standalone screen has
  its own revocable Navet session and can use the providers it was approved to access.

Use the controls under **Device settings** when two or more screens should match.

## Connect another standalone screen

1. Open Navet on the new screen and choose **Connect with another device**.
2. Leave the one-time code visible on that screen.
3. On a primary signed-in screen, open **Settings → System → Authorized devices**. Enter the
   **Device connection code** and choose **Review code**.
4. Check the requesting screen name and providers, then choose **Approve**. The new screen
   connects automatically.

![System settings reviewing a Guest room tablet's one-time code before approval.](/docs/how-to/dashboards/device-approval.webp)

Only a primary sign-in can approve, rename, or remove authorized devices. An authorized screen can
view the roster. To end an old screen's access, choose **Remove** from the primary sign-in; the
screen immediately loses access and can be connected again with a new code.

The Home Assistant custom panel and Ingress use their host authentication instead of this
standalone device-approval flow.

## Name an authorized screen

On a primary standalone sign-in, open **Settings → System → Authorized devices**, open a screen's
menu, and choose **Rename device**. Give important wall displays and browsers recognizable names.
An authorized screen can view the roster but cannot rename devices.

The name identifies that screen in access management.

## Copy settings once

Use this when another screen should start with the same kiosk, visual-quality, and layout settings
but remain independent afterward.

1. Configure the source screen the way you want.
2. Open **Settings → Display & controls → Device settings**.
3. Choose **Copy settings once**.
4. Select the destination screens and choose **Copy settings**.

Later changes on either screen do not affect the other.

## Keep display settings linked

Use a sync group for wall panels that should continue to share kiosk mode, visual quality, and
layout.

1. Under **Device settings**, choose **Keep settings synced**.
2. Enter a recognizable group name such as **Wall displays**.
3. Select the devices that should share those settings.
4. Save the group.

Choose the group later to add or remove devices. A removed device keeps its current settings and
becomes independent.

## Check device settings

Under **Device settings**, **Not shared** means this screen keeps its own kiosk, visual-quality,
and layout choices. **Synced with** names the group sharing those settings. A failed copy or group
change shows a retryable error.

## Remove an old screen's access

On a primary standalone sign-in, open **Authorized devices**, find the old screen, and choose
**Remove**. It immediately loses access to Navet; removing it does not erase the dashboard
collection.

## If two devices edit at once

Follow [Resolve a synchronization conflict](/guide/dashboards/sync-conflicts/). Do not repeatedly
reload both screens while deciding which version should win.
