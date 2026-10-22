# Thermostat temperature hierarchy

Research date: 2026-10-22. Comparative UX research and a proposal for Navet;
no product change or user validation is implied.

## Finding

Established products use both current-first and target-first presentations.
The clearest distinction is the task: observing room conditions versus adjusting
the setpoint. A temporary setpoint display followed by a return to current
temperature has a documented physical-thermostat precedent, but this research
does not establish it as the prevailing mobile-app convention.

## Evidence

| Product and surface | Verified presentation | Adjustment and return behavior | Evidence boundary |
| --- | --- | --- | --- |
| Google Nest Learning Thermostat, 3rd/4th generation; Thermostat E, normal temperature screen | Target is the large central number; measured current temperature is smaller near the edge. | Turning the ring adjusts the target. With inactivity, the device sleeps or enters the selected Farsight view. | Explicit official documentation. This is the physical control screen; Farsight is a separate glanceable surface. [Nest displays](https://support.google.com/googlehome/answer/9243193?hl=en). |
| Nest Learning Thermostat, 3rd/4th generation, Farsight | Can show current room temperature or target temperature, alongside other face choices. | Exiting Farsight to operate the thermostat requires pressing or turning the ring. | This supports separating observation from control, rather than claiming every Nest screen is target-first. The same help article describes differences in the Nest/Google Home apps, so device hierarchy should not be assumed identical across all app versions. [Nest Farsight and app differences](https://support.google.com/googlehome/answer/9243193?hl=en). |
| tado° app, room tiles in Home Screen | Current temperature is large; target is smaller. The target remains visible whether or not the room is actively heating/cooling. | Selecting a room opens detail and manual adjustment. | Explicit current help text, hosted in the V3+ help center but also discussing X-device indicators. No app build number is given; this source does not establish the adjustment screen's number hierarchy or a timed swap. [tado° app overview](https://support.tado.com/en/articles/4190245-how-can-i-get-started-with-the-tado-app). |
| Honeywell Home series 2000, physical thermostat | The display returns to current room temperature after displaying the chosen setpoint, identified by “Set.” | Official instructions specifically say: choose the desired setpoint, press Hold, then the display returns to current temperature after five seconds. | Direct evidence for the requested temporary-target pattern, within this documented Hold workflow. It does not establish that all thermostat models or every adjustment use that timing. [Series 2000 support](https://www.honeywellhome.com/blogs/support/how-do-i-bypass-the-schedule-on-the-series-2000-thermostat). |
| Home Assistant thermostat dashboard card | Target is primary by default; `show_current_as_primary: true` makes current primary and target secondary. | Official design guidance recommends target-first for frequent adjustment and current-first for checking room warmth. | Strong digital-dashboard analogue. A configurable static hierarchy is documented, not an automatic timed switch. [Card documentation](https://www.home-assistant.io/dashboards/thermostat/), [thermostat design guidance](https://contributors.home-assistant.io/design/dashboards/thermostat-card/). |
| ecobee SMART, older physical model; residential Web Portal | Official help describes current temperature and a separate setpoint/adjustment slider; portal help describes both measured temperature and setpoint. | Slider changes create a Hold. | Search-indexed first-party help was readable, but opening it returned a CSS error. It verifies separate values and action roles, not a reliable current-version visual hierarchy. Do not generalize this older SMART model to Premium/Enhanced or today's app. [SMART setup guide](https://support.ecobee.com/s/articles/ecobee-smart-installation-and-setup-guide?language=en_US), [Web Portal](https://support.ecobee.com/s/articles/Using-the-ecobee-Web-Portal?language=en_US). |
| Apple Home, iPhone | Apple documents opening an accessory's controls and browsing Climate devices. | Accessory-specific controls vary. | The inspected first-party guide does not specify thermostat number prominence or temporary swaps; Apple Home is therefore excluded from claims about which pattern is common. [Control accessories](https://support.apple.com/en-gb/guide/iphone/iph0a717a8fd/27/ios/27). |

Home Assistant's inspected development-branch implementation also selects the
primary number using `showCurrentAsPrimary`; its button handler updates the
target without introducing a temporary prominence swap. This is a source
snapshot, not a versioned-release guarantee.
[HA climate temperature control](https://github.com/home-assistant/frontend/blob/dev/src/state-control/climate/ha-state-control-climate-temperature.ts).

## Recommendation for Navet

Use **current temperature as the main number on dashboard overview surfaces**,
with an explicit target and activity state alongside it. This fits Navet's
[information order](../product/dashboard-principles.md): current state/value
precedes the primary action. A focused dialog may give the adjustment task a
stronger composition without changing that product principle.

For the **climate adjustment dialog**, prefer a stable, explicitly labeled
target between − and +, with **Current 20.5°C** and **Heating** clearly visible
below. Keep both values visible even when numerically equal: their meanings
differ. This follows the control relationship documented by Nest and the task
distinction in Home Assistant, while addressing the observed Navet confusion
about current temperature and operating state. This is a design inference, not
proof that target-first is universally superior.

Treat **large current at rest → large target during adjustment → small target
afterward** as a viable alternative to test, rather than a researched default:

- Keep explicit **Current** and **Target** labels whenever prominence changes.
- Keep −/+ associated with the target. They should never appear to edit the
  measured current value.
- Preserve both numbers, stable control placement and the activity state.
- If using an adjustment state, make entering/leaving it apparent. Avoid
  silently changing the meaning of one unlabeled number. A deliberate **Done**
  action is easier to assess than copying a hardware timeout without testing.
- Show pending/error feedback honestly; changing the setpoint does not mean
  that the room's measured temperature has changed or the equipment is heating.

General interaction guidance favors clear state signaling, but a visual
prominence change alone is not necessarily a mode error. It becomes problematic
when people misunderstand what a control or displayed value means.
[NN/g: modes](https://www.nngroup.com/articles/modes/).

## What remains to validate

This is a purposive sample of official documentation, not a market survey or
comparative usability study. Physical displays have different space, power and
distance constraints from Navet's dialog. Inaccessible ecobee help and Apple's
non-specific guide limit conclusions; third-party screenshots were not used to
fill these gaps.

Compare the stable target-first dialog with the temporary-target alternative.
Ask people to identify the room temperature, identify the target, set a new
target, then report both values and whether the system is running. Include
equal readings, a large target/current difference, Idle, Off, active heating,
heat/cool ranges and unavailable measurements. Measure interpretation mistakes
and adjustment success; visual preference alone cannot establish clarity.
