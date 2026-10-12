# Changelog

## 0.18.0

## New features

- Use supported thermostat modes and humidity controls, and manage Home Assistant shopping and to-do lists separately from routines and chores.
- Added integration reload for Home Assistant entities, including unavailable cards.
- Home Assistant timers, counters, valves, and remotes now have dashboard cards with their supported controls.
- Control supported household helpers and refresh room and entity metadata after external Home Assistant edits.

## Improvements and bug fixes

- Keep after-completion chores actionable until finished, restart each person's interval independently, and move superseded scheduled chores into missed history.
- Device dialogs gain consistent, accessible controls and weather forecasts recover reliably. The demo adds advanced controls, helpers, and cards.
- Deployed Dev builds show their version in About Navet; published Dev builds retain their identity on loopback addresses too.
- Fixed stale provider state after reconnecting and missed openHAB live updates.

## 0.17.8

## Improvements and bug fixes

- Household guides explain that See rewards appears after creating a mission or enabled reward goal.
- Hide unsupported Stop controls on cover cards and use the standard card surface for covers without position controls.
- Keep keyboard focus inside device controls dialogs and return it to the opener on dismissal.
- Restore keyboard tab switching and card-action focus, separate lighting-row controls, and keep lighting previews consistent after brightness edits.
- Scroll long light-effect menus and keep animated colors inside the card's rounded corners.
- Restore keyboard focus after card settings and disable unavailable overflow actions.
- Improve search touch targets and keyboard focus, hide unsupported speaker actions, and retain failed chore imports for retry.

## Security

- Harden session storage, imported household data, media URLs and legacy resource redirects, and update vulnerable dependencies.

## 0.17.7

## Improvements and bug fixes

- Update the next occurrence immediately when a chore that repeats after completion is marked done or reopened.
- Persist the next chore date immediately for long completion-based intervals and reconcile it when a completion is reopened.
- Discord community links now open a permanent invite so new members can join.
- Clarify where to find card entity IDs and how to enable household missions and rewards.
- Garage doors, gates, doors, and window covers appear in Security and report open states even without position data.
- Show clear open and closed states for garage doors and let each cover use simple controls without percentages.

## 0.17.6

## Improvements and bug fixes

- Keep card controls easy to reach with shared settings menus, compact light and fan controls, and clearer blind positioning.

## 0.17.5

## New features

- Add actionable chore alerts, shareable weekly reports, and Home Assistant calendar and automation actions.
- Add recurring badges and personal achievements with durable progress awards and optional points.
- Request household rewards, review them, and track point spending, fulfillment, and refunds in shared chore history.
- Add fair rotation, standby coverage, flexible schedules, claim rules, and reviewed vacation rescheduling.

## Improvements and bug fixes

- Preserve large chore ledgers and unfinished work in durable storage so accumulated history cannot block household actions.
- Room chore summaries open the Household dashboard, keeping device controls in predictable positions.

## 0.17.4

## New features

- Group media players into one swipeable card that surfaces the active player and supports drag ordering.
- Add quality-aware ambient motion to weather cards for clouds, rain, snow, sun, wind, fog, and storms.

## Improvements and bug fixes

- Chore participant initials and icons use readable text colours on orange and custom avatar backgrounds.
- Chore cards show the number of days between completions for after-completion schedules.
- Align chore cards with the shared card header and let card headers grow with enlarged text.
- Choose shared chore participants, rotation starting person, and weekly handover day while keeping managers available for approval.
- Entity dialogs show the provider entity ID to help distinguish entities with similar names.
- Lawn mower cards show a Navet-branded robot mower with animated grass and wheel treads, respecting reduced-motion settings.
- Media dialog text and controls stay readable when album artwork has a bright palette.
- Mobile notifications now clear the safe area, show Done, and keep Update or Restart above View changes and Hide.
- Fixed individual notification dismissal and redesigned the center with separate update views, clearer rows, and expandable details.
- See upcoming chores for the next seven days in Today and the next scheduled date and time on chore cards.
- Robot vacuum cards have a refreshed illustration with a defined bumper, lidar sensor, and subtle Navet branding.

## 0.17.3

## Improvements and bug fixes

- Expose the startup and session-recovery screen as the main app content.
- Expose a main landmark while the authenticated dashboard connects.
- Browser Zoom choices now persist on this device after a reload.
- Confirmation alerts now appear as centered dialogs on phones and larger screens instead of phone cover sheets.
- Climate now shows environmental readings from devices that also have controls, such as air purifiers and thermostats.
- Thermostat cards show the target temperature while idle or off, so setpoint changes stay visible.
- Climate and humidifier knobs no longer show a solid glow shape on low-effects devices.
- Climate, Media, and Security grouping controls use a compact icon menu, leaving more room for section tabs.
- Name the dashboard section editor, show keyboard focus, and translate the skip link.
- Keep dashboard card grids within narrow screen widths.
- Expose a main landmark for each authenticated dashboard section.
- Add a keyboard shortcut to skip dashboard navigation and reach its content.
- Give dashboard dialogs one accessible title and a semantic visible heading.
- Improve contrast of the Energy source link in light mode.
- Keep keyboard and screen-reader focus on the error screen while recovery is needed.
- Keep dashboard views tied to a chosen provider steady when the current provider changes.
- Reuse entity alias lookups across dashboard card updates.
- Avoid duplicate Home dashboard collection work while editing sections.
- Reuse one lookup for stored dashboard icon names and components.
- Keep chore date and time fields inside the editor on iPhone Safari.
- Make mobile dashboard scroll areas keyboard accessible and restore main landmarks in Household and Settings.
- Reduced app distribution size by excluding documentation-only screenshots from runtime builds.
- Load a smaller Homey logo in sign-in and provider settings.
- Fixed mobile dashboard cards, media controls, chore fields, and the browser zoom preference in Safari.
- Give Security controls and activity scrolling useful screen reader roles while keeping media sliders correctly named.
- Limit dashboard chore updates to the active room view.
- Avoid room placement updates in disabled device collections.
- Keep closed notification panels from doing dashboard work and expose the bell state.
- Improve text contrast on accent-colored actions and navigation.
- Keep unrelated dashboard sections steady when room groups change while preserving kiosk navigation.
- Keep invalid article URLs out of RSS card links in every card size.
- Reduce the app stylesheet by generating marketing-only styles for the website alone.

## Security

- Reject malformed relative image paths that could resolve to another host.

## 0.17.2

## Improvements and bug fixes

- Fixed the Home security summary badge counting ordinary open covers, such as blinds, as security warnings.
- Verified release notes across distribution channels and kept public changelogs readable when release information cannot be refreshed.

## 0.17.1

## Improvements and bug fixes

- Hidden room entities can now be restored with Add Entity without showing entities from other rooms.
- Improved dashboard syncing during connectivity changes and preserved successful room edits after partial provider failures.
- Improved media metadata, portrait camera editing, and authorized-device badges across screen sizes.

## 0.17.0

## New features

- Added shared provider management so connected sources work together without a global primary provider.
- Expanded Homey with locks, covers, thermostats, speakers, flows, moods, people, notifications, Insights history, and app browsing.
- Expanded openHAB with fans, climate setpoints, speakers, locks, covers, security sensors, batteries, and utility measurements.
- Added completion-anchored chores that schedule their next occurrence from the latest completion.
- Added a per-device browser zoom setting to prevent unwanted input zoom.

## Improvements and bug fixes

- Improved multi-provider rooms, source routing, energy readings, battery health, security activity, and dashboard grouping.
- Kept Undo, Redo, Add Card, and Done visible on narrower edit bars and restored card edit actions.
- Improved chore setup with guided steps, inline validation, preserved drafts, and clearer repeat schedules.
- Fixed provider availability feedback and cleared stale sessions after disconnecting.

## 0.16.3

## New features

- Added short-code approval for additional devices, with access management in System settings.

## Improvements and bug fixes

- Added searchable entity selection with room filters, sorting, and device-type navigation across dashboards.
- Energy cards can now be rearranged directly, with controls to hide or restore KPIs.
- Today's Energy history now shows five-minute intervals.
- Security quickview now supports pinning and drag-and-drop arrangement, with linked motion events opening their camera.
- Security activity now shows failed refreshes, the last successful update, and a retry action.
- Improved portrait camera viewing and distinguished verified live playback from snapshot load age.
- Added larger theme and wallpaper previews with responsive appearance controls.

## Security

- Provider credentials stay within your Navet installation while approved devices receive individually revocable sessions.

## 0.16.2

## Improvements and bug fixes

- Hidden entities no longer appear in Home climate and security summaries.
- Simplified Settings by clarifying dashboards, connected displays, sync history, and device controls, and removing unfinished Local Habits.

## 0.16.1

## Improvements and bug fixes

- Added optional direct access to the Home Assistant add-on while preserving its authenticated Ingress route.
- Simplified add-on setup by removing obsolete provider fields, clarifying options, and replacing technical introduction copy.

## 0.16.0

## New features

- Added a redesigned Energy workspace with flexible ranges, configurable KPIs, comparisons, and device-level usage details.
- Added Household links to Home Assistant people and companion-app devices for chore reminders.
- Added search, sorting, and size filters to the custom-card library.

## Improvements and bug fixes

- Dashboard updates now synchronize across browser sessions without stale tabs overwriting newer changes.
- Fixed light controls reverting during provider updates and kept ambient effects out of dashboard editing.
- Improved media cards with accessible seeking and safe handling when no player is active.
- Improved compact sensor cards by prioritizing readable values and reserving history graphs for larger sizes.
- Fixed Household forms accepting invalid schedules or numbers and preserved data during temporary storage failures.
- Fixed root routes opening the standalone sign-in flow instead of the Home Assistant add-on.
- Hardened authenticated RSS loading against private-network targets, redirects, oversized feeds, and invalid content.

## 0.15.8

No user-facing changes in this release.

## 0.15.7

## Improvements and bug fixes

- Improved chore management with accurate multi-day schedules, cleaner point history, and controls that respect motivation settings.

## 0.15.6

## New features

- Added permanent chore deletion with confirmation and cleanup of linked schedules and missions.

## Improvements and bug fixes

- Resetting chores now clears saved history, backups, and management protection for a clean restart.
- Chore templates now stay selected while household data refreshes.
- Successful setup and backup imports now return to Today.

## 0.15.5

## New features

- Added per-person point histories and manager controls to add or remove points.

## Improvements and bug fixes

- Future chores and reminders now update when schedules, assignments, or due times change.

## 0.15.4

## New features

- Added Home Assistant Assist with text, voice, selectable pipelines, and access from navigation or dashboard widgets.

## 0.15.3

## Hotfix

- Fixed an Nginx startup error that prevented the Home Assistant add-on from starting.

## 0.15.2

## New features

- Added controls to set, change, or remove chore management PIN protection after onboarding.
- Added every-four-weeks scheduling for recurring chores.

## Improvements and bug fixes

- Made chore and mission management easier to scan with compact search, filters, and action controls.
- Refined media browsing with clearer folder rows, artwork, subtitles, and active playback styling.
- Improved glass-theme legibility across cameras, people, calendar, media, RSS, and vacuum cards.

## 0.15.1

## New features

- Added backup import to first-time chore setup, restoring the household without repeating onboarding.

## Improvements and bug fixes

- Added bug fixes and safeguards that recover chore setup if a management PIN error leaves it unusable.

## 0.15.0

## New features

- Redesigned the Climate dashboard with comfort guidance, room and device grouping, trend charts, and faster mode controls.
- Expanded shared chores with Home Assistant persistence plus weekday, weekend, and custom interval schedules.

## Improvements and bug fixes

- Improved the Lights dashboard with room controls, whole-home shutoff, and responsive layouts.
- Upgraded live maps and cameras with clearer locations, automatic framing, and smoother playback recovery.
- Improved dashboard creation and profile recovery across phones, tablets, and shared displays.

## 0.14.0

## New features

- Redesigned the Energy dashboard with live demand, historical trends, period comparisons, and breakdowns by source, room, and device.
- Redesigned the Security dashboard with a status command center, activity history, customizable overview, and responsive camera browsing.

## Improvements and bug fixes

- Improved camera alerts with clearer motion and person detection, status timing, and activity details.
- Improved dashboard layouts and controls across phones, tablets, and large displays, with more flexible card sizes.

## 0.13.2

## New features

- Expanded fullscreen camera views with configurable sensor details, motion state, and connected-light controls.
- Missed chores can now be completed late while preserving approvals and completion history.

## Improvements and bug fixes

- Dashboard sync now respects independent device layouts and keeps routine updates unobtrusive.
- Chores now hide points, missions, and rewards when motivation is off, with clearer add and edit forms.
- Improved room and card settings with palette-aware controls, easier navigation visibility, and resolved alerts from hidden unavailable cameras.

## 0.13.1

## New features

- Added entity navigation, room filtering, and sorting to the redesigned Add Card library.
- Camera cards can now bypass low-power snapshots when live streaming is needed.

## Improvements and bug fixes

- Improved chores onboarding with clearer guidance, consistent forms, flexible assignments, and complete recurring schedules.
- Made chore summaries and daily tasks denser and easier to use on phones and tablets.
- Kept light cards expanded by default and dashboard-change alerts dismissible above dialogs.

## 0.13.0

## New features

- Added shared household chores with recurring schedules, flexible assignments, approvals, reminders, and completion history.
- Added guided setup, optional points and rewards, progress reviews, and backup and recovery tools.
- Home Assistant now exposes chore summaries and actions for automations.

## Improvements and bug fixes

- Refined navigation, Settings, dashboard summaries, and controls for phones, tablets, and shared wall screens.

## 0.12.6

## Improvements and bug fixes

- Camera streams now fall back to MSE when WebRTC connects without displaying video.
- Fullscreen camera controls remain available while a stream is loading.
- Camera settings now keep all controls inside phone viewports.

## 0.12.5

No user-facing add-on changes in this release.

## 0.12.4

No user-facing add-on changes in this release.

## 0.12.3

No user-facing changes in this release.

## 0.12.2

## New features

- Added linked device profiles and one-time copying to sync device settings across selected devices.

## 0.12.1

## Improvements and bug fixes

- Redesigned Settings with grouped navigation and search across desktop, tablet, and mobile.
- Redesigned kiosk controls with room swipe navigation and mobile-safe layouts.
- Fixed dashboard synchronization recovery for profiles saved in the current format.

## 0.12.0

## New features

- Navet now supports multiple dashboards.

## Improvements and bug fixes

- Reduced rendering, media, and provider-update work on low-power wall displays.
- Dashboard changes now survive concurrent edits and browser identity recovery without losing device preferences.

## 0.11.1

## Improvements and bug fixes

- Fixed standalone Home Assistant sign-in redirects when Navet runs behind HTTPS proxies or custom ports.

## Security

- Hardened OAuth return paths by rejecting unsafe Home Assistant URLs and removing stale authorization codes and state values.

## 0.11.0

## New features

- Added a room workspace for creating, organizing, styling, moving, and removing rooms across supported providers.
- Dashboard layouts now sync safely across devices, with connected-device management and conflict recovery in Settings.
- Added Norwegian, Danish, Finnish, and Polish translations across the dashboard.

## Improvements and bug fixes

- Improved camera playback with direct go2rtc streams, MSE fallback, persistent stream settings, and clearer controls and errors.
- Improved automation rows and connected-device controls across mobile, tablet, and wide layouts.

## 0.10.3

## New features

- Added Dutch translations across the dashboard.

## Improvements and bug fixes

- Refreshed Navet's add-on and custom panel icons.
- Media folders now show every item, with compact artwork and responsive tables for larger libraries.

## 0.10.2

## Improvements and bug fixes

- Improved the Lights dashboard with cleaner room lists, quicker scene access, and compact controls for active lights.
- Light color and effect controls now stay in sync when switching modes or closing menus.
- Tasks tables can now be sorted by name, category, type, or status, with clearer responsive rows.

## 0.10.1

## Improvements and bug fixes

- Navet now adjusts visual effects and card loading to match each device, with manual controls in Settings.
- Added new translations across all supported languages, which now load only when needed.
- Improved the Music dashboard with search, clearer library categories, better track details, and smoother touch scrolling.
- Fixed unwanted transitions across cards, controls, and mobile navigation, and improved reduced-motion support.

## 0.10.0

- Updated Navet to `0.10.0`
- Added a room-first Lights dashboard with room status, brightness and power controls, scene shortcuts, and responsive light lists
- Improved provider-backed Energy, Media, Security, Tasks, Habits, Settings, and home dashboard surfaces
- Improved recovery from provider changes, unavailable data, and page visibility transitions across dashboard entities and resources
- Expanded translation coverage across every supported language and added automated catalog consistency checks
- Reduced unnecessary dashboard work with bounded resource caches, visibility-aware scheduling, and deferred settings UI

## 0.9.1

- Updated Navet to `0.9.1`
- Fixed Now Playing session recovery when Home Assistant media entities become idle and clear their metadata
- Routed mirrored media controls through the matching physical player for more reliable pause and resume behavior
- Prevented active and grouped speakers from appearing twice in media sections
- Improved media artwork, volume, grouping synchronization, responsive browser layouts, and mobile grouping controls

## 0.9.0

- Updated Navet to `0.9.0`
- Added more flexible room and entity layouts, dashboard packs, manual entity cards, and a faster home-edit command bar
- Added discovery and room assignment for newly available provider entities
- Added provider-aware media browsing, search, source selection, playback queues, and richer speaker destinations
- Improved speaker grouping, destination selection, and playback reliability
- Improved room navigation, section customization, automation insights, and energy summaries
- Improved OAuth redirects and music-service authorization flows for hosted installs

## 0.8.0

- Updated Navet to `0.8.0`
- Continued the public beta dashboard line for the standalone app, Home Assistant custom panel, and Home Assistant add-on
- Included scoped dashboard profile settings so selected preferences can persist per device while shared profile values stay intact
- Included the refined automation dashboard with summary cards, state and room filters, attention states, recent-run metadata, and a clearer automations/scripts split
- Included direct stream URL support for camera cards when a setup exposes a playable stream endpoint
- Included the latest dashboard profile sync fixes for multi-device conflicts, the "Keep mine" popup, empty remote profile handling, and stale validators
- Included climate, media activity, room-grid refresh, and dashboard card hierarchy improvements from the latest beta line

## 0.7.12

- Updated Navet to `0.7.12`
- Added scoped dashboard profile settings so selected preferences can persist per device while shared profile values stay intact
- Refined the automation dashboard with summary cards, state and room filters, attention states, recent-run metadata, and a clearer automations/scripts split
- Fixed dashboard profile sync so multi-device conflicts resolve correctly, including "Keep mine", "Load remote", and stale validator handling after empty remote profiles
- Fixed climate summaries so target-only thermostat setpoints are not treated as current room temperature
- Fixed powered Home Assistant TVs so they count as active media without counting idle speakers as active
- Improved automation, quick-action, and habit insight card hierarchy and typography

## 0.7.11

- Updated Navet to `0.7.11`
- Added scoped dashboard profile settings so selected preferences can persist per device while shared profile values stay intact
- Refined the automation dashboard with summary cards, state and room filters, attention states, recent-run metadata, and a clearer automations/scripts split
- Fixed climate summaries so target-only thermostat setpoints are not treated as current room temperature
- Fixed powered Home Assistant TVs so they count as active media without counting idle speakers as active
- Improved automation, quick-action, and habit insight card hierarchy and typography

## 0.7.10

- Updated Navet to `0.7.10`
- Fixed alarm panel cards so the numeric keypad appears more reliably when needed
- Improved dashboard profile sync, persistence, and hosted profile-store handling
- Refined kiosk orbit navigation, section cards, and related energy/security dashboard surfaces
- Expanded Storybook inventory/docs coverage and removed obsolete UI stories

## 0.7.9

- Updated Navet to `0.7.9`
- Expanded advanced custom sidebar extensions to support up to five quick actions per item
- Improved compact device-card layouts across fans, covers, humidifiers, lights, switches, cameras, and related dashboard surfaces
- Added a megamenu-style room overflow picker for dashboards with more rooms than fit in the visible navigation row
- Updated cover cards with a cleaner compact layout and tap-to-toggle behavior outside edit mode

## 0.7.8

- Updated Navet to `0.7.8`
- Added support for opening custom sidebar links inside Navet in an iframe-backed panel
- Fixed recent WebRTC camera live-stream regressions and improved stream fallback handling
- Fixed Home Assistant mobile safe-area spacing and overly transparent affected UI surfaces
- Improved room navigation and room management for larger dashboards
- Improved toast, banner, lock, and related dashboard UI contrast across mobile and kiosk flows
- Improved the Home Assistant panel and add-on shell flow, including optional native header and sidebar hiding when the Navet shell module is enabled

## 0.7.7

- Updated Navet to `0.7.7`
- Added more energy dashboard customization, including prepaid-style remaining-balance support
- Added dashboard support for lawn mower devices
- Fixed demo entities crashing Navet
- Improved climate, energy, and cleaning-device card layouts plus related settings flows
- Improved Liquid Glass and Light theme UI polish across shared dashboard surfaces and dialogs

## 0.7.6

- Updated Navet to `0.7.6`
- Added custom dashboard extensions, including sidebar links for more tailored navigation
- Improved the add-card dialog with denser browsing and pill-based navigation for faster dashboard editing
- Improved media card speaker grouping for cleaner multi-speaker control flows
- Improved framerates on low-energy devices when using `Low` visual settings

## 0.7.5

- Updated Navet to `0.7.5`
- Fixed Homey sign-in recovery for standalone and Docker installs
- Fixed missing artwork accent colors on media cards in standalone Docker installs
- Improved onboarding with wallpaper theme selection during setup

## 0.7.4

- Updated Navet to `0.7.4`
- Reduced unnecessary dashboard rerenders so larger dashboards stay steadier during routine updates
- Deferred heavier card work on dense or low-power dashboards for smoother loading
- Improved media cards so artwork palette and accent colors carry through more clearly in playback surfaces
- Improved media and camera card behavior under load

## 0.7.3

- Updated Navet to `0.7.3`
- Added clearer TV-focused media dialogs with better source badges and compact remote controls
- Cleaned up Home Assistant update release notes and restart-required update messaging
- Fixed vacuum status and current-room handling so active cleaning runs stay more accurate
- Improved dense-dashboard rendering and device update stability on heavier dashboards

## 0.7.2

- Updated Navet to `0.7.2`
- Added richer Roborock-friendly vacuum controls, including area cleaning support on supported devices
- Added repeat and shuffle controls across media cards, with cleaner TV control handling
- Fixed Apple Music and Music Assistant artwork recovery, including grouped-player cases
- Improved repeated device labels and room/media control readability on mixed-device dashboards

## 0.7.0

- Updated Navet to `0.7.0`
- Added richer vacuum card controls, status details, and Roborock-friendly presentation
- Fixed missing Apple Music and Music Assistant album artwork in affected media cards
- Improved security state colors, dashboard feedback, and deployment install guidance
- Reduced disruptive full-dashboard refresh behavior during routine updates

## 0.6.1

- Updated Navet to `0.6.1`
- Fixed Home dashboard weather and calendar cards so they stay visible more reliably on low-power displays

## 0.6.0

- Updated Navet to `0.6.0`
- Added dashboard support for alarm panel and humidifier entities
- Improved security dashboard organization, room navigation, and larger mixed-device layouts
- Improved provider-backed dashboard loading and camera stream fallback handling

## 0.5.3

- Updated Navet to `0.5.3`
- Fixed energy dashboard daily totals so they respect the source sensor unit instead of showing incorrect kWh values
- Fixed media card room pickers and speaker naming so dropdown entries stay readable and offline speakers keep better names
- Improved light card controls when brightness is not available on the device
- Improved energy dashboard statistics and current-usage presentation across more setups
- Refreshed dark, light, and liquid glass theme styling for clearer dashboard card and media surfaces
- Added bundled sample imagery for photo frame demos and previews
- Updated release and architecture documentation to match the current package layout

## 0.5.2

- Updated Navet to `0.5.2`
- Improved Home Assistant camera playback, session handling, and stream fallback reliability
- Fixed camera settings dialogs so large switch lists and smaller screens remain usable
- Kept tagged release and HACS export metadata aligned more reliably across Navet releases

## 0.5.1

- Updated Navet to `0.5.1`
- Restored the Home Assistant custom-panel packaging needed for HACS to detect the repository correctly

## 0.5.0

- Updated Navet to `0.5.0`
- Camera cards can refresh Home Assistant snapshots directly and recover live playback more reliably
- Camera settings now focus on supported viewing controls instead of global go2rtc overrides

## 0.4.7

- Updated Navet to `0.4.7`
- Refreshed the website and marketing presentation with new screenshots and clearer product storytelling
- Added new wallpapers
- Improved settings actions and section management flows

## 0.4.6

- Updated Navet to `0.4.6`
- Provider login for Homey and openHAB in the add-on remains beta and may not work reliably yet
- Fixed widget and RSS cards so shared edit actions reopen their settings reliably
- Improved user avatar rendering

## 0.4.5

- Updated Navet to `0.4.5`
- Fixed switch cards so their settings reopen reliably in dashboard edit mode
- Fixed adding openHAB to an existing setup so it no longer crashes during connection setup
- Fixed Home Assistant alerts so they render correctly again in the dashboard

## 0.4.1

- Updated Navet to `0.4.1`
- Fixed a Home dashboard edit-mode render loop that could break card-grid editing
- Consolidated Home Assistant setup docs and moved public deployment hardening guidance into the main security policy

## 0.4.0

- Updated Navet to `0.4.0`
- Added clearer system/provider settings and a dedicated experimental keep-device-awake section
- Fixed weather and calendar cards disappearing from Home dashboards
- Improved dashboard responsiveness by deferring heavier map widget loading work
- Improved dashboard section loading, shared snapshot handling, and provider-backed card reliability

## 0.3.1

- Updated Navet to `0.3.1`
- Fixed custom action card fields clearing during editing
- Improved light button card brightness and color behavior
- Media cards now show artwork more efficiently

## 0.3.0

- Updated Navet to `0.3.0`
- Added UPS widgets, sensor history sparklines, and a keep-device-awake dashboard setting
- Fixed hosted OAuth session recovery and ingress Home Assistant connection reuse
- Improved Home Assistant proxy handling for camera snapshots and other authenticated resources
- Refined light effect controls, camera behavior, and dashboard profile sync reliability

## 0.2.5

- Updated Navet to `0.2.5`
- Fixed dashboard config imports so Home cards restore correctly from recent exports
- Fixed Home dashboards getting stuck on "Still loading devices" after stale imported card ids or removing the final card
- Improved Home summary spacing when the dashboard is empty or showing cards

## 0.2.4

- Updated Navet to `0.2.4`
- Added cleaner kiosk-mode dashboard behavior for wall panels and tablets
- Added direct dashboard cards for single sensors, binary sensors, scripts, scenes, and more device classes
- Added compact dashboard summaries for lights, climate, media, security, and energy
- Fixed HVAC card updates for Nest-style climate entities and Fahrenheit setups
- Fixed media playback commands for TV, Spotify, and Android TV integrations
- Fixed sensor timestamp display so local time is used instead of GMT
- Added hidden-room support without deleting dashboard content

## 0.2.3

- Updated Navet to `0.2.3`
- Replaced legacy long-lived token login with Home Assistant OAuth
- Fixed old dashboard config imports breaking the new OAuth session flow
- Improved add-on ingress websocket reliability after Home Assistant restarts
- Add-on installs now tolerate stale `hass_url` and `token` options from older releases

## 0.2.2

- Updated Navet to `0.2.2`
- Improved add-on login, ingress proxying, and media artwork loading
- Add-on users authenticate through Home Assistant Ingress without `hass_url` or `token` options
- Direct port `8099` users now sign in with Home Assistant OAuth instead of manually configured
  long-lived tokens
- Added direct go2rtc WebRTC camera feed support outside the Home Assistant custom panel

## 0.2.1

- Updated Navet to `0.2.1`
- Fixed Home Assistant add-on Ingress proxy setup when Home Assistant URL config is blank
- Added fan dashboard cards with power, percentage, oscillation, direction, preset, and speed controls
- Added fan controls to supported HVAC card settings
- Fixed Fahrenheit climate readings being converted twice
- Improved empty states for dashboard widgets without configured data
- Added explicit camera feed choices for Auto, Live, and Snapshot view modes, plus Auto, WebRTC, HLS, and MJPEG live-feed selection with fallback

## 0.2.0

- Updated Navet to `0.2.0`
- Added Sensor Group widgets for compact multi-sensor dashboard summaries
- Added HVAC preset temperature controls
- Improved camera live-feed refresh behavior
- Improved cover card support and position controls
- Optimized dashboard loading with lazy card/widget chunks and reduced duplicate energy/RSS requests
- Updated release, setup, roadmap, and Storybook documentation for the current public beta

## 0.1.13

- Updated Navet to `0.1.3`
- Fixed Docker media artwork loading
- Fixed dashboard navigation unexpectedly returning to the unassigned room tab
- Added cover card drag controls, card locking, and editable custom card names
- Refined card dialogs, scrollbars, slide actions, and add-on setup guidance

## 0.1.12

- Updated Navet to `0.1.2`
- Published add-on images for stable version tags as well as beta tags
- Clarified when to use the HACS custom panel and when to use the add-on

## 0.1.11

- Updated Navet to `0.1.1`
- Published the current Navet release as a stable GitHub release for HACS users
- Fixed HACS update metadata so Home Assistant uses release versions instead of branch commit SHAs
- Fixed release announcement links opening a missing GitHub commit-based release page
- Included the custom panel loading, media artwork, localization, unit, time format, and room navigation fixes from the beta line

## 0.1.10

- Updated Navet to `0.1.1-beta.3`
- Fixed HACS update metadata so Home Assistant uses release versions instead of branch commit SHAs
- Fixed release announcement links opening a missing GitHub commit-based release page

## 0.1.9

- Updated Navet to `0.1.1-beta.2`
- Fixed media artwork loading in the Home Assistant custom panel
- Fixed dashboards getting stuck on "Loading devices..." for affected users
- Fixed Celsius/Fahrenheit and 12-hour/24-hour settings so units and time formats update correctly
- Added scrolling room navigation for dashboards with more rooms than available space
- Re-enabled the custom panel setup notice for Home Assistant add-on users
- Improved custom panel style loading, iframe embedding, and live update support
- Added Chinese, Italian, and Portuguese (Brazil) language support

## 0.1.8

- Updated Navet to `0.1.1-beta.1`
- Added section-focused dashboard surfaces for media, security, and device layouts
- Added Home Assistant `water_heater` entities to the HVAC card flow
- Improved hosted/authenticated app, login, and error-display behavior
- Added HACS repository metadata for custom repository installs (WIP)

## 0.1.7

- Updated Navet to `0.1.0-beta.4`
- Polished the login experience for hosted and authenticated Home Assistant setups
- Fixed Home Assistant add-on ingress routing for Navet internal endpoints, including dashboard profile/session APIs and RSS proxying
- Fixed runtime credential loading for Docker and add-on deployments
- Fixed authenticated media artwork and album art loading
- Improved HVAC mode controls, entity synchronization, and temperature/status labels
- Fixed lock, cover, RSS, and slide-action dashboard card interactions
- Fixed hosted demo and website bundle asset paths
- Added dashboard profile/session sync so deployed dashboards can persist state across browser sessions
- Expanded automated coverage for Home Assistant connections, dashboard endpoints, media artwork, cards, RSS feeds, and sessions

## 0.1.6

- Refreshed Home Assistant add-on bundle for release maintenance

## 0.1.5

- Added Home Assistant add-on presentation assets for the store view
- Added add-on changelog metadata
- Fixed ingress asset/logo path handling for the embedded Navet UI

## 0.1.4

- Fixed logo asset paths in the sidebar, onboarding dialog, and dashboard reveal

## 0.1.3

- Refreshed bundled add-on assets for Home Assistant ingress

## 0.1.2

- Fixed missing frontend chunk in the bundled add-on assets

## 0.1.1

- Forced add-on rebuild after ingress asset fixes

## 0.1.0

- Initial Home Assistant add-on packaging for Navet
