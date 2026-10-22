# TV card controls and touch fit

Research date: 2026-10-22. Source inspection at `3a261ee9` and first-party
remote documentation. The selected placement changes are implemented locally; rendered acceptance
and household-device validation remain pending. The reported touch overflow has not been reproduced
on the household display.

## Design direction

Retain the existing TV card's appearance, D-pad placement, control sizes and
spacing. The selected changes use vertical volume +/− and channel +/− pairs at
every supported TV card size. Medium places these in the first and second
columns. Large places volume to the left of the D-pad and channel to the right.
Other controls use the remaining space without adding new visual patterns.

## External evidence

| Source | Documented behavior | Implication and boundary |
| --- | --- | --- |
| [Samsung Smart Remote](https://www.samsung.com/sa_en/support/tv-audio-video/how-to-use-smart-remote-control/) | Volume and channel use up/down movements. Pressing the volume control mutes; pressing channel opens the guide. | Direct precedent for vertical paired adjustments. Physical press/rocker behavior does not establish the best touchscreen hit areas. |
| [Apple remote guide](https://support.apple.com/en-ie/102337) | The oblong volume control has increase on top and decrease below; mute, playback and navigation are distinct controls. Volume/mute depend on the audio setup. | Supports vertical volume grouping and capability-aware controls, not a universal channel rocker. |
| [Google TV Streamer remote](https://support.google.com/chromecast/answer/15323195?hl=en) | Volume uses the top/bottom of a long button; D-pad, mute, Home and Back have separate roles. | Reinforces separating navigation from sound. Streaming devices do not establish a universal need for channel controls. |
| [W3C target minimum, SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) | WCAG 2.2 AA specifies 24 × 24 CSS px, with exceptions including spacing. | A compliance floor is not a comfort target for repeated wall-display operation. |
| [W3C enhanced targets, SC 2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) | AAA specifies 44 × 44 CSS px, subject to exceptions. | Each actionable half needs its own target; a 44 px tall rocker split in two does not provide two 44 px targets. |

This is a purposive sample, not a market survey or comparative usability study.
It supports the directional convention, not a claim that the proposed layout
will be faster for Navet households.

## Baseline source evidence at `3a261ee9`

- [TV view](../../packages/app/src/features/media/components/media/media-tv-view.tsx):
  the small tile expands volume/channel controls inside its fixed-height
  layout. Its four transport buttons may wrap, adding another row. Opening
  navigation replaces the utility/transport content with a fixed 104 px D-pad.
- [Volume/channel controls](../../packages/app/src/features/media/components/media/tv-volume-controls.tsx):
  both pairs currently run horizontally; volume includes mute between − and +.
  Volume changes are currently 10 percentage points per activation. Keep that
  behavior out of a layout-only change unless separately selected.
- [Shared touch CSS](../../packages/app/src/styles/theme.css): action controls
  grow from 32 to 36 CSS px under `any-pointer: coarse`.
  Four controls plus three 6 px gaps require 162 px on touch versus 146 px
  with the default rule. This makes a wrapped transport row a plausible
  contributor to the reported height overflow.
- [Card geometry](../../packages/app/src/components/shared/card-size.ts): the
  target phone small footprint is 168 × 168 logical px; standard padding is
  12 px per side. At that footprint, a standard padded content area is only
  144 × 144 px. Actual runtime dimensions still need measurement.
- [TV dialog](../../packages/app/src/features/media/components/media/media-dialog-sections.tsx)
  already composes navigation, transport, source and utility controls. Reuse
  that destination rather than introducing a second remote system.
- Existing component tests cover toggles and capability visibility; they do
  not establish browser geometry or touch-device fit.

Source inspection identifies fit risks. It does not establish which specific
state, card dimensions, browser zoom or touch configuration caused the report.

## Navet reference

The current `MediaTvView` is the design reference. Its actual Storybook IDs are
`cards-entity-media--tv`, `cards-entity-media--tv-small`,
`cards-entity-media--tv-medium-vertical`, `cards-entity-media--tv-large`, and
`cards-entity-media--tv-long-name`. Retain its header, D-pad, source selector,
buttons and theme surfaces. Separate geometric defect repairs from layout
redesign, and leave rendered acceptance to the maintainer.

## Validation before implementation acceptance

1. Reproduce the report: record viewport, actual card content rectangle, browser
   zoom, touch/pointer mode, and the expanded control state.
2. Check the smallest grid footprint and real wall/tablet dimensions, including
   `any-pointer: coarse` and hybrid devices. Measure every target rectangle:
   inside its intended surface, no adjacent-target overlap, no hidden or
   clipped focusable controls. Include focus indicators in the fit review.
3. Cover rest, volume/channel open and D-pad open in the current design;
   compare the proposed quick-actions/remote flow through household tasks:
   lower sound, mute, change channel, navigate and return Home.
4. Cover long/translated names, missing source, unavailable/off state, muted
   state, volume bounds, partial capabilities and command failure. Preserve
   keyboard operation, accessible names and focus return from the sheet.
5. Exercise glass, dark, light and black. Keep command-routing tests when
   implementing; add browser containment checks rather than tests that merely
   assert layout classes. Existing tests would need Keep/Rewrite/Delete
   classification if their expected interaction changes.
6. Ask the maintainer to compare rendered output against the named Media
   references on phone, tablet and desktop. Automated fit checks cannot grant
   visual or household-device acceptance.

## Local implementation

- Vertical pairs keep increase above decrease. Channel buttons display localized
  short labels with existing accessible names; command routing and volume steps
  remain unchanged.
- Medium uses volume in column one, channel in column two, and a compact
  navigation/playback grid beside them. Mute joins this grid. Pause and Return
  sit below Mute and Menu, leaving the source selector room to stretch toward
  settings at the bottom right.
- Large and extra-large flank the existing D-pad with volume at left and channel
  at right. Mute sits below volume; the existing action row stays below.
- Small initially shows volume and channel toggles plus settings. Selecting a
  toggle replaces both toggles with its vertical adjustment pair, plus Mute for
  volume. Settings stays visible. Outside click, Escape or three seconds of
  inactivity restores the initial state, following the light card's temporary
  adjustment behavior. Other controls remain available in the TV dialog.
- Tall places volume in the upper/lower left corners around the D-pad and
  channel in the upper/lower right corners. Menu and Return share the volume
  column; Pause shares the channel column; Home and Mute remain centered.
  Source and settings stay below. The tall card fits without scrolling.
- D-pad shell sizes and center positions stay unchanged. A ResizeObserver
  measures the rendered directional/center targets and moves the edge buttons
  outward only as much as necessary to remove intersection. This responds to
  native touch sizing and desktop preview sizing without changing shared tokens.
- Source selectors are constrained to available width, and action rows reserve
  their transport group so source selection cannot overlap adjacent controls.

Existing capability tests are retained where their contract is unchanged.
Small-card interaction tests are rewritten for the selected toggle behavior,
including inactivity and outside-click dismissal. Browser regressions check
visible control separation and reachability, excluding the intentionally
overlapping card-wide background action. Tall-card regressions also check
column alignment and absence of scrolling. Native touch browser checks
complement Storybook's regular-input regressions.

Maintainer manual comparison against the named TV stories and review on the
household touch display are still required. No commit, push or PR is included.
