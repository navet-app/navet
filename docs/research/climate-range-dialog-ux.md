# Climate range dialog UX

Research date 2026-11-14. Scope is the thermostat adjustment dialog in Heat/Cool mode.

## Current dialog

The [Range Dialog story](../../packages/app/src/features/climate/components/climate-card/entity-card-climate.stories.tsx) renders two full target controls labelled “Lower target” and “Upper target.” The measured temperature and HVAC activity sit beneath the lower target, although both describe the device. There is no shared range heading to explain the relationship. Both sets of buttons use the same “increase temperature” and “decrease temperature” accessible names. These are observations from the implementation. [Dialog layout](../../packages/app/src/features/climate/components/climate-settings-dialog/index.tsx), [step buttons](../../packages/app/src/features/climate/components/climate-card/climate-temp-controls.tsx).

The controller detects a range from two ordered numeric endpoints and checks a general setpoint capability before sending. It submits both endpoints in one command and clamps the edited value against the other endpoint. At a bound, the buttons remain enabled and can submit an unchanged pair. Commands start from the last reported pair, so a quick edit to the other endpoint before the first echo can send the old value back. Verify active-mode and range-specific writability with the owning adapter, since valid-looking values alone do not establish that a device accepts a range command. [Controller](../../packages/app/src/features/climate/components/climate-card/use-climate-card-controller.ts), [Home Assistant climate entity contract](https://contributors.home-assistant.io/core/entities/climate/#supported-features).

## Product precedents

| Source | Observed behavior | Implication for Navet |
| --- | --- | --- |
| Home Assistant Climate More Info | A single dial presents both targets. Selecting one endpoint assigns the shared step buttons to it. Current temperature has its own label, and the two endpoints cannot cross. [Climate design guidance](https://contributors.home-assistant.io/design/more-info/climate/#variants). | Treat the pair as one adjustable range. A shared stepper saves space but requires a clear selected endpoint and an extra selection when switching targets. |
| Google Nest | Heat/Cool uses a user-set range to decide when to heat or cool. The app distinguishes measured and target temperatures and documents step buttons for fine adjustment. The help pages do not establish the exact two-target layout across app versions. [Temperature modes](https://support.google.com/googlehome/answer/9247301?hl=en), [app controls](https://support.google.com/googlehome/answer/9249866?hl=en). | Name endpoints for what they govern, and make the live reading independently identifiable. |
| ecobee | Auto mode can enforce a configurable minimum temperature difference between heat and cool setpoints. [Thermostat thresholds](https://support.ecobee.com/s/articles/Threshold-settings-for-ecobee-thermostats?language=en_US). | Enforce a minimum gap when the device contract advertises one. A fixed gap carried over from one thermostat would impose its device policy on others. |
| W3C | Multi-thumb sliders can be difficult to operate with touch assistive technology. WCAG guidance calls for a single-pointer alternative to dragging. [Multi-thumb slider](https://www.w3.org/WAI/ARIA/apg/patterns/slider-multithumb/), [Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html). | Make standard tap and keyboard actions the primary way to edit both endpoints. |

Home Assistant distinguishes `heat_cool`, where the device maintains a range, from `auto`, where the device follows its own logic or schedule. It exposes measured temperature separately and passes both setpoints when setting a range. The adapter should translate these contracts into a provider-neutral control state. [HVAC modes and climate methods](https://contributors.home-assistant.io/core/entities/climate/#hvac-modes).

## Proposed layout

Use one **Target range** group in the Climate tab with two compact, persistently labelled stepper rows. Show the measured temperature and HVAC activity once above the group. On narrow screens, keep the rows stacked with stable button positions. Keep the existing placement of mode and secondary settings. [Navet UX guide](../../ai/skills/navet-ux.md), [thermostat temperature hierarchy](thermostat-temperature-hierarchy.md).

```text
Current 21.5 °C · Idle

Target range
Heat to   [−]  19.0 °C  [+]
Cool to   [−]  24.0 °C  [+]
```

Use “Heat to” and “Cool to” where the provider-normalized mode represents those functions. The four buttons should have distinct accessible names such as “Increase heating target.” Reuse the dialog shell, text tokens, and step control treatment from `cards-entity-climate--advanced-dialog-supported` and its `DeviceTargetControl` composition. Review the existing `cards-entity-climate--range-dialog` story for the baseline. [Climate stories](../../packages/app/src/features/climate/components/climate-card/entity-card-climate.stories.tsx).

The alternative worth comparing is the Home Assistant pattern with both values always visible and one shared stepper for the selected endpoint. Start with the two-row proposal because both actions remain directly reachable and focus never silently changes which target a button edits. This is a design inference. The product documentation establishes the precedents, while the preferred layout for Navet still needs rendered review. [Home Assistant Climate More Info](https://contributors.home-assistant.io/design/more-info/climate/#variants).

## Acceptance checks

- In the phone and wall-tablet layouts, users can identify the measured temperature, device activity, heating target and cooling target, then adjust either endpoint without guessing which value a button changes. Check keyboard focus, touch and screen-reader labels, °C and °F, and longer translations.
- One step changes the intended endpoint by the device’s increment. Keep the other endpoint unchanged when editing a settled range. Disable directional buttons that cannot change the range because of the other endpoint, a known gap or a device limit. Send one paired range change through the owning adapter. For the first iteration, disable both steppers during the pending write and explain that the thermostat is confirming it. Verify rapid alternating taps cannot overwrite either endpoint with a stale value.
- Show the reported and requested ranges while pending. Confirm only on device echo, and keep retry available on failure or timeout while preserving the reported range and measured temperature. A missing current reading remains unknown.
- Verify a writable Heat/Cool range, an unsupported or read-only range, off/unavailable, and a transition from Heat/Cool to single-target mode. Prevent range writes when the active mode or capability does not permit them. Test on one live Home Assistant thermostat before accepting device behavior.
