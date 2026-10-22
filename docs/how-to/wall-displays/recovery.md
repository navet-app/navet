---
title: Recover kiosk access and keep-awake
description: Exit kiosk mode, activate wake-lock fallback, and recover embedded-display problems.
editUrl: https://github.com/navet-app/navet/edit/main/docs/how-to/wall-displays/recovery.md
---

Use this guide when normal navigation is hidden, the screen still sleeps, or an embedded page will
not load.

![Kiosk behavior with Swipe between rooms and Exit kiosk mode.](/docs/how-to/wall-displays/kiosk-recovery-route.webp)

## Exit kiosk mode

1. Use the bottom-right **More** button to open **Kiosk control**.
2. Choose **Kiosk behavior**.
3. Choose **Exit kiosk mode**.

You can also open **Settings → Display & controls**, then choose **Standard** under **Display preset** or
turn off **Kiosk mode**.

If Home Assistant's outer chrome is also hidden, change or remove the optional shell module
configuration from Home Assistant.

## Check keep-awake

Open **Settings → Display & controls → Keep device awake** and read the status:

- **Active via browser wake lock** needs no action.
- **Active via silent audio fallback** is working through the fallback.
- **Pending activation** requires a user gesture.
- **Blocked** means the browser or device denied the method.
- **Unsupported** means neither path is available.

Choose **Tap to activate fallback audio** when shown.

![Dashboard settings showing the Keep device awake control and fallback behavior.](/docs/how-to/wall-displays/keep-awake-status.webp)

Keep-awake is best effort. Some embedded browsers, power-saving modes, and operating-system rules
can still turn off a display.

## Embedded page is blocked

When a custom sidebar page reports that it may be blocking embedding:

1. Choose **Retry** once.
2. Choose **Open externally** if the site still refuses to load.
3. Edit the shortcut to open a new browser tab instead of an embedded page.

Sites can block framing through their own security headers; Navet cannot override that policy.

## Prevent getting locked out

- Test **Kiosk control** before mounting the display.
- Keep browser or operating-system access available.
- Keep the display independent until its kiosk behavior is confirmed; link it to a Device settings
  group afterward if needed.
- Record the Navet address outside the kiosk.
