---
title: Add notes, photos, and RSS feeds
description: Place lightweight household content on a Home or room dashboard.
editUrl: https://github.com/navet-app/navet/edit/main/docs/how-to/everyday-control/notes-photos-rss.md
---

Notes, photo frames, and RSS feeds are Navet widgets. They are saved with the dashboard profile and
included in configuration export.

![The Custom cards library with note, photo, and feed widgets.](/docs/how-to/everyday-control/content-widget-chooser.webp)

## Add a note

1. Enter Home edit mode and choose **Add Card → Custom cards**.
2. Choose **Quick Note**.
3. Enter a title and concise household text.
4. Choose a supported size and placement.
5. Save.

## Add a photo frame

Choose **Photo**, then select or enter the available image sources. Use images you are allowed to
display and that the browser can reach.

Open the photo card's settings to manage its sources and shuffle setting. Use **More actions**
to **Edit room** or **Customize** its appearance. Select **Back to controls** to return to sources,
and **Done** when finished.

## Add an RSS feed

1. Choose **RSS Feed**.
2. Enter the feed address.
3. Choose how many items to show where available.
4. Save and wait for the feed to load.

In the RSS card's settings, open **More actions** and choose **Add feed** to add a feed or adjust the
article count. **Edit room** and **Customize** are available in the same menu. Select
**Back to controls** to return to your feeds. A card with no saved feeds opens directly in the feed form.

Live feeds require a public HTTPS address and a signed-in Navet session. The Home Assistant add-on
uses your authenticated Ingress session. If feed loading stops after signing out, reconnect your
provider or reopen Navet through Home Assistant.

## If an external source fails

- For a photo, use an `http` or `https` address reachable from the browser.
- For an RSS feed, use a public HTTPS address reachable from the Navet installation. Local-network
  feed addresses are unsupported, including public hostnames that resolve to private addresses.
- Authenticated or expiring image links may not be suitable for a persistent photo frame.
- A feed can reject server requests or return invalid RSS.
