# Changelog

## 0.18.2-beta.1

## Improvements and bug fixes

- Reduce chore scheduling and concurrent write costs with paged accounting storage, preserving scores, rewards, history, and recovery.

## 0.18.1-beta.1

## New features

- Create timed and all-day events from calendar cards when the selected calendar supports writing.
- Explore entity state history and recorded Home Assistant activity for a selected date range from the user menu.

## Improvements and bug fixes

- Fix stuck chore completion and reset, and automatically repair and compress affected storage on upgrade without losing history.

## 0.18.0-beta.2

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

## 0.18.0-beta.1

## New features

- Use supported thermostat modes and humidity controls, and manage Home Assistant shopping and to-do lists separately from routines and chores.
- Added integration reload for Home Assistant entities, including unavailable cards.
- Home Assistant timers, counters, valves, and remotes now have dashboard cards with their supported controls.
- Control supported household helpers and refresh room and entity metadata after external Home Assistant edits.

## Improvements and bug fixes

- Keep after-completion chores actionable until finished, restart each person's interval independently, and move superseded scheduled chores into missed history.
- Fixed stale provider state after reconnecting and missed openHAB live updates.

## 0.17.8-beta.2

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

## 0.17.8-beta.1

## Improvements and bug fixes

- Household guides explain that See rewards appears after creating a mission or enabled reward goal.
- Hide unsupported Stop controls on cover cards and use the standard card surface for covers without position controls.
- Keep keyboard focus inside device controls dialogs and return it to the opener on dismissal.
- Restore keyboard tab switching and card-action focus, separate lighting-row controls, and keep lighting previews consistent after brightness edits.
- Scroll long light-effect menus and keep animated colors inside the card's rounded corners.
- Restore keyboard focus after card settings and disable unavailable overflow actions.
- Improve search touch targets and keyboard focus, hide unsupported speaker actions, and retain failed chore imports for retry.

## 0.17.7-beta.1

## Improvements and bug fixes

- Update the next occurrence immediately when a chore that repeats after completion is marked done or reopened.
- Persist the next chore date immediately for long completion-based intervals and reconcile it when a completion is reopened.
- Discord community links now open a permanent invite so new members can join.
- Clarify where to find card entity IDs and how to enable household missions and rewards.
- Garage doors, gates, doors, and window covers appear in Security and report open states even without position data.
- Show clear open and closed states for garage doors and let each cover use simple controls without percentages.

## 0.17.6-beta.1

## Improvements and bug fixes

- Keep card controls easy to reach with shared settings menus, compact light and fan controls, and clearer blind positioning.

## 0.17.5-beta.2

## New features

- Add actionable chore alerts, shareable weekly reports, and Home Assistant calendar and automation actions.
- Add recurring badges and personal achievements with durable progress awards and optional points.
- Request household rewards, review them, and track point spending, fulfillment, and refunds in shared chore history.
- Add fair rotation, standby coverage, flexible schedules, claim rules, and reviewed vacation rescheduling.

## Improvements and bug fixes

- Preserve large chore ledgers and unfinished work in durable storage so accumulated history cannot block household actions.
- Room chore summaries open the Household dashboard, keeping device controls in predictable positions.

## 0.17.5-beta.1

## New features

- Add actionable chore alerts, shareable weekly reports, and Home Assistant calendar and automation actions.
- Add recurring badges and personal achievements with durable progress awards and optional points.
- Request household rewards, review them, and track point spending, fulfillment, and refunds in shared chore history.
- Add fair rotation, standby coverage, flexible schedules, claim rules, and reviewed vacation rescheduling.

## Improvements and bug fixes

- Preserve large chore ledgers and unfinished work in durable storage so accumulated history cannot block household actions.
- Room chore summaries open the Household dashboard, keeping device controls in predictable positions.

## 0.17.4-beta.1

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

## 0.17.3-beta.1

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

## 0.17.2-beta.4

## Improvements and bug fixes

- Fixed the Home security summary badge counting ordinary open covers, such as blinds, as security warnings.
- Verified release notes across distribution channels and kept public changelogs readable when release information cannot be refreshed.

## 0.17.2-beta.3

## Improvements and bug fixes

- Fixed the Home security summary badge counting ordinary open covers, such as blinds, as security warnings.
- Verified release notes across distribution channels and kept public changelogs readable when release information cannot be refreshed.

## In Progress

- Current Navet Dev scope since `v0.17.1`.
- Align cover security badges (#179)
- Improve agent approval and communication (#178)
- Simplify contribution workflow (#177)
- Queue work without public bot prompts (#176)
- Add agentic development control plane (#175)
