---
title: Integrations
description: Provider setup documentation and current support status.
editUrl: https://github.com/navet-app/navet/edit/main/docs/integrations.md
---

Navet connects to your smart-home providers and brings their supported devices and features into
one dashboard.

## Available providers

- [Home Assistant](/install/home-assistant/) is the reference adapter and supports the custom panel,
  add-on, and standalone deployment routes.
- [Homey](/install/homey/) uses the standalone cloud OAuth flow. A Home Assistant add-on can also
  connect Homey as an additional provider when its Homey client options are configured.
- [openHAB](/install/openhab/) uses the base-URL and credential flow. It can also be connected as an
  additional provider from Settings in a running multi-provider installation.

Follow the [roadmap](/roadmap/) for planned providers.

## Capability Matrix

This table shows the features available through each provider. Individual controls also depend
on the capabilities of your devices.

| Capability | Home Assistant | Homey | openHAB |
|---|---:|---:|---:|
| Rooms, realtime state, lighting, switches, and sensors | Yes | Yes | Yes |
| Lock state and lock/unlock controls | Yes | Writable lock capabilities | Supported lock items |
| Cover position and movement controls | Yes | Writable position, open/close, and supported stop commands | Position and movement for supported cover items |
| Climate dashboard services | Yes | Target temperature and operating modes | Target setpoint |
| Media playback and volume controls | Yes | Writable speaker capabilities | Playback and volume for supported items |
| Media browse, search, artwork, and grouping | Yes | No | No |
| Camera snapshots and live streams | Yes | No | No |
| Energy configuration and statistics | Yes | No | No |
| Entity state history | Yes | Supported Insights logs | No |
| Recorded activity | Yes | No | No |
| Map zones, geolocation and recorded locations | Yes | No | No |
| Calendar and weather data | Yes | No | No |
| Calendar event creation (writable calendars) | Yes | No | No |
| Notifications | Yes | Read and hide locally | No |
| Updates and restart actions | Yes | No | No |
| Runnable scenes, Flows, and Moods | Yes | Yes | No |
| Household presence | Yes | View people | No |
| Automation/task details and triggering | Yes | No | No |
| Shared to-do and shopping list items | Yes | No | No |
| Assist text, microphone, and response audio | Yes | No | No |
| Provider room and entity administration | Yes | No | No |

`No` means the feature is unavailable through that provider in Navet. The platform may support
it in its own interface.

### History and activity

Open the user menu → **History and activity**, choose an entity, select a date/time range,
and choose **State history** or **Activity**. Times use the display's time zone, shown in the form.
State history preserves numeric readings and nonnumeric states; a retained state supplied at the
range boundary is labelled **State at the start of the range**. Activity includes recorded cause
details, such as an automation, service, or user action, when the source supplies them. Numeric
energy statistics remain in Energy.

Each request targets the entity's owning source. Home Assistant supplies state history and recorded
activity; Homey supplies history for supported Insights entities. Unsupported sources show an
unavailable message. Activity follows Home Assistant's filters and can omit frequently changing
numeric sensors. An empty result can mean there were no records, the entity is excluded, or the
source no longer retains that period. Navet cannot reconstruct deleted records.

Queries cover up to 31 days. Navet reads recent records first, widens sparse requests, and stops
once the newest 1,000 records and the limit indicator are known. Sources such as Homey that return
a retained period are read once for the selected range. Results offer **Show more** for additional
rows within that limit. Choose a shorter range for more detail.
Home Assistant uses the existing authenticated transport in standalone, Ingress and custom panel.

### Map context and recorded locations

The map shows available people, device trackers, non-passive zones and geolocation entities from
supported selected sources. Home Assistant zones include their radius and people count;
geolocation markers show the source's distance value. Invalid or unavailable coordinates are omitted.
Marker pictures and recorded-location requests use the marker's owning provider.

Choose **Location history** on the map, select a person or tracker and a 6-hour or 24-hour period,
then **Load records** → **Show on map**. This requests retained coordinate attributes through the
existing authenticated transport in Docker, Ingress and custom panel. The overlay shows when
its data was recorded through; **Clear history** removes it.

Lines connect recorded samples rather than describe a travelled route. Missing coordinates,
unavailable states, gaps over an hour and antimeridian crossings break the line. A single location
or repeated identical locations cannot establish a path. Empty/expired/excluded history explains
why no path is shown; unsupported readers and failed requests have separate feedback.

Home Assistant floors and labels are not imported into Navet's room organization. Floors group
areas, while labels can span rooms and entity types. Adopting them requires a separately selected
product and provider-contract scope that preserves existing room identities.

### Home Assistant

Navet maps Home Assistant rooms and realtime entities for lights, switches, sensors, climate,
media players, cameras, energy, calendars, weather, notifications, updates, Assist pipelines, and
supported task or automation surfaces. Home Assistant also provides the advanced dashboard and administration
services marked **Yes** in the matrix above.

Calendar cards can create events in selected writable Home Assistant calendars. Read-only calendars
continue to show events. Timed events use the display's time zone, shown in the form; all-day events
use calendar dates with a last included day. A failed create keeps the form details for retry.
The owning adapter uses the existing authenticated transport in standalone, Ingress and custom panel.

Supported household helpers include toggles, buttons, numeric values, dropdown options, text,
and dates or times. Controls follow the entity's available options and limits.
Native `datetime` values display and save in UTC, with the zone shown on the control.
Date/time helpers use Home Assistant's local time.

Room names and entity assignments refresh after external Home Assistant registry edits and after
reconnection. A failed metadata refresh retains the last loaded rooms and entities. These features
work in standalone, Ingress, and custom panel installations.

Climate dialogs offer thermostat presets, climate fan modes, vertical and horizontal swing,
and target humidity when the owning device advertises them. These controls use the climate
device's options and limits.

Open **Household → Lists** to view a connected source's shopping or to-do items. Supported lists allow adding,
completing or reopening, editing, and removing items. Description and due-date fields appear only
when that list supports them.

### Homey

Navet maps Homey rooms, lights, switches, fans, sensors, locks, covers, thermostats, speakers, people, and
notifications. Locks show their current state and support lock/unlock through writable capabilities.
Cover cards show available position readings and offer writable percentage or movement controls;
stop depends on the device's capabilities, and tilt is unavailable.
Thermostats support target temperature and available operating modes; speaker
controls follow writable playback, volume, mute, and track capabilities. Runnable Flows,
Advanced Flows, and Moods are available as shared scene cards. People appear in presence cards,
and matching Insights logs provide entity history for the last 31 days. Availability depends on
Homey's version and granted permissions. See the capability matrix above for supported features.

### openHAB

Navet maps openHAB rooms and realtime items for lights, switches, fans, climate setpoints, speaker
playback and volume, locks, covers, security sensors, batteries, and utility measurements. It does
not register history, energy-statistics, alarm-panel, media-browser, camera, calendar, weather,
notification, Assist, task, or provider-administration services.

### Planned providers

Hubitat and SmartThings have catalog metadata only. They are not available as
runtime providers yet.

## Multiple Providers

Navet can store more than one implemented provider session in runtimes that expose provider
management. In **Settings → System** you can connect or disconnect providers. Shared features use
the entities you select and route commands to each entity's owning provider. Canonical,
provider-scoped IDs keep entities from different platforms
distinct when their native IDs match.
