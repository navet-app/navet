function doc(overview: string, covers: string[], usage: string[], review: string[]) {
  return [
    overview,
    '',
    'What this story proves:',
    ...covers.map((item) => `- ${item}`),
    '',
    'Use this story when:',
    ...usage.map((item) => `- ${item}`),
    '',
    'Review before merging:',
    ...review.map((item) => `- ${item}`),
  ].join('\n');
}

const STORY_DOCS: Record<string, string> = {
  'App Shell/Header/Header Actions': doc(
    'Desktop header action cluster for dashboard-level controls such as view switching, adding content, and entering customize mode.',
    [
      'The spacing and grouping between primary, secondary, and overflow-style header actions.',
      'How action density behaves when the top bar carries several competing controls.',
    ],
    [
      'Use this story when changing the action hierarchy in the dashboard header.',
      'Compare it with the topbar and search stories before adding another header-specific action variant.',
    ],
    [
      'Check that the highest-priority actions stay easy to scan at a glance.',
      'Check that the action row still feels balanced on narrower dashboard widths.',
    ]
  ),
  'App Shell/Header/Search Input': doc(
    'Topbar search input for filtering content from the main application chrome rather than from a feature-local form.',
    [
      'The shared search field treatment used in the header area.',
      'How placeholder text, icon treatment, and focus state behave in the shell.',
    ],
    [
      'Use this story when adjusting the global search affordance or its shell-specific styling.',
      'Keep search-field changes aligned with the header stories so the chrome still reads as one system.',
    ],
    [
      'Check focus visibility, placeholder legibility, and icon alignment.',
      'Check that the field remains usable without overpowering neighboring header actions.',
    ]
  ),
  'App Shell/Header/Topbar': doc(
    'Main dashboard topbar shell that brings together title, search, account controls, and primary actions.',
    [
      'The structure of the full top-level header rather than any single child control.',
      'How the header balances information, navigation, and actions in one row.',
    ],
    [
      'Use this story when changing the overall header layout or the relationship between its child elements.',
      'Review this before making isolated tweaks to header children so the whole shell still works together.',
    ],
    [
      'Check visual balance, scanability, and alignment across the complete header.',
      'Check that the header still feels stable on dashboard hardware where space is tighter.',
    ]
  ),
  'App Shell/Navigation/Room Nav': doc(
    'Room-switching navigation strip used to move between dashboard spaces quickly.',
    [
      'The active, inactive, and overflow behavior of the room navigation pattern.',
      'How the control reads when there are multiple peer destinations in the same navigation band.',
    ],
    [
      'Use this story when changing room labels, chip treatment, spacing, or active-state styling.',
      'Prefer updating this shared navigation surface over creating a room selector inside a feature.',
    ],
    [
      'Check that the selected room is obvious immediately.',
      'Check that the navigation remains comfortable to tap on touch-first displays.',
    ]
  ),
  'App Shell/Kiosk/Kiosk Control Center': doc(
    'Fullscreen kiosk workspace for navigating dashboards, sections, and rooms while keeping management and display behavior out of the always-visible dashboard.',
    [
      'The desktop sidebar, mobile grouped index, room ribbon, and grouped room navigation.',
      'The handoff to Room Workspace and the separation between navigation, customization, and kiosk behavior.',
      'Stable full-height layout at desktop, tablet, and phone viewports.',
    ],
    [
      'Use this story when changing kiosk navigation, room switching, display controls, or kiosk management entrypoints.',
      'Keep routine navigation in the Navigate panel and configuration in its dedicated panels.',
    ],
    [
      'Check touch targets, focus order, close and back behavior, and the absence of nested sidebars at tablet widths.',
      'Check long room lists, grouped rooms, all four themes, reduced motion, and low-effects presentation.',
    ]
  ),
  'App Shell/Section Customize Button': doc(
    'Small entrypoint button for section-level customization actions on the dashboard.',
    [
      'The compact affordance used to enter section customization from a local context.',
      'How the control signals editability without overwhelming the surrounding card or section content.',
    ],
    [
      'Use this story when changing the affordance for entering section customization.',
      'Keep this aligned with the section customize shell so entry and destination feel connected.',
    ],
    [
      'Check that the button reads as editable tooling rather than regular content.',
      'Check that the control remains visible but does not dominate the section.',
    ]
  ),
  'App Shell/Section Customize Shell': doc(
    'Container shell for section-level customization controls and supporting actions.',
    [
      'How section-editing affordances are grouped and framed once customization is open.',
      'The visual relationship between edit tools and the section content they act on.',
    ],
    [
      'Use this story when changing section-editing layout, spacing, or supporting controls.',
      'Review it alongside the entry button story when section customization behavior changes.',
    ],
    [
      'Check that edit tools are clearly separated from normal dashboard content.',
      'Check that the shell feels lightweight enough for frequent use in edit mode.',
    ]
  ),
  'App Shell/Navigation/Sidebar': doc(
    'Primary sidebar navigation for moving between top-level areas of Navet.',
    [
      'The hierarchy of destinations, current selection treatment, and overall sidebar density.',
      'How the sidebar presents app-level navigation instead of room-level navigation.',
    ],
    [
      'Use this story when changing main navigation labels, spacing, icons, or grouping.',
      'Review it before adding another top-level destination so the main navigation stays cohesive.',
    ],
    [
      'Check active-state clarity and label scanability.',
      'Check that the sidebar still feels balanced when several destinations compete for attention.',
    ]
  ),
  'App Shell/Header/User Dropdown': doc(
    'Account and session menu surfaced from the header avatar area.',
    [
      'The dropdown trigger, menu hierarchy, and account-action presentation for user controls.',
      'How session-oriented actions are separated from the rest of the header tools.',
    ],
    [
      'Use this story when changing account-menu content, wording, or trigger styling.',
      'Keep account actions here rather than mixing them into general dashboard action groups.',
    ],
    [
      'Check menu clarity, item ordering, and trigger affordance.',
      'Check that account actions remain easy to find without adding chrome noise.',
    ]
  ),
  'Components/Primitives/Cards/Card Metric Action Layout': doc(
    'Card-layout primitive that pairs a compact metric readout with a trailing action affordance.',
    [
      'The shared internal layout used when a metric and a local action need to coexist in a card.',
      'How spacing and alignment hold together when cards become denser.',
    ],
    [
      'Use this story before inventing a one-off metric-plus-action arrangement inside a card.',
      'Prefer evolving this layout primitive when several cards need the same structure.',
    ],
    [
      'Check that the metric stays dominant while the action remains easy to reach.',
      'Check that the layout still works at compact card sizes.',
    ]
  ),
  'Components/Primitives/Cards/Card Metric': doc(
    'Compact metric primitive for showing one key value, label, or status readout inside a card.',
    [
      'The baseline formatting and hierarchy for a single emphasized metric.',
      'How numeric or short textual values are presented without full chart or table structure.',
    ],
    [
      'Use this story when a card needs a compact primary measurement rather than free-form text.',
      'Keep metric styling shared here when multiple cards need the same readout pattern.',
    ],
    [
      'Check numeral emphasis, label clarity, and truncation behavior.',
      'Check that the value remains readable from normal dashboard viewing distance.',
    ]
  ),
  'Components/Primitives/Body Text': doc(
    'Shared body-text primitive for compact supporting copy and lower-emphasis labels.',
    [
      'The baseline paragraph-style text treatment for dense UI surfaces.',
      'How supporting copy reads when placed beside cards, dialogs, or settings rows.',
    ],
    [
      'Use this story when repeated helper copy needs a shared typography primitive.',
      'Prefer this over ad-hoc text classes when the same tone treatment is reused across features.',
    ],
    [
      'Check tone contrast, line-height, and scanability.',
      'Check that the text still reads well on tinted or glass surfaces.',
    ]
  ),
  'Components/Primitives/Cards/BaseCard': doc(
    'Shared entity-card shell primitive that brings together theme-aware surface tokens, header composition, size-aware spacing, and reusable footer action layouts.',
    [
      'The default neutral card surface across dark, light, glass, and black themes.',
      'How readable text adapts from the resolved card surface instead of hard-coded per-card text choices.',
      'Reusable footer compositions for action rows and settings-only rows across the full CardSize union.',
    ],
    [
      'Use this as the starting shell before building a new entity-card layout in a feature.',
      'Prefer composing feature-specific content into BaseCard instead of cloning switch-card shell markup.',
      'Keep new card header and footer conventions here so cards do not drift apart by domain.',
    ],
    [
      'Check the dark default against the switch-card inactive baseline.',
      'Check header and footer rhythm across tiny, extra-small, and larger dashboard sizes.',
      'Check tinted surfaces keep title and supporting text readable without local text-color overrides.',
    ]
  ),
  'Components/Primitives/Checkbox': doc(
    'Shared checkbox primitive for boolean selection in dialogs, forms, and settings sections.',
    [
      'The base selected, unselected, and disabled behavior for checkbox inputs.',
      'How the control reads when paired with shared labels and supporting text.',
    ],
    [
      'Use this story before creating a boolean toggle that does not need switch semantics.',
      'Pair it with the shared field and label patterns instead of hand-building checkbox layouts.',
    ],
    [
      'Check focus clarity, checked-state visibility, and disabled contrast.',
      'Check that the hit target still feels comfortable on touch-first devices.',
    ]
  ),
  'Components/Patterns/Selectable Checkbox Row': doc(
    'Shared dialog selection-row pattern that combines the checkbox primitive with consistent row spacing, text hierarchy, and optional leading, trailing, or action content.',
    [
      'The standard full-row checkbox selector used in settings dialogs and card configuration lists.',
      'How checked and unchecked rows behave when labels, descriptions, metrics, or extra actions are present.',
    ],
    [
      'Use this story before hand-rolling another selectable row in a feature dialog.',
      'Keep feature-specific tinting and metadata inside this shared row instead of duplicating checkbox row markup per card type.',
    ],
    [
      'Check that the whole row remains easy to click while the checkbox still reads clearly as the selection affordance.',
      'Check that long labels, trailing values, and secondary actions stay aligned without collapsing the row structure.',
    ]
  ),
  'Components/Primitives/Color Input Swatch': doc(
    'Compact swatch control used when color selection needs a visual chip rather than a full picker.',
    [
      'The selected and unselected presentation of a reusable color-choice surface.',
      'How color identity is communicated even in dense card or dialog layouts.',
    ],
    [
      'Use this story when editing color-preset selection behavior or swatch styling.',
      'Keep simple color-selection affordances here instead of introducing feature-local swatch variants.',
    ],
    [
      'Check selected-state clarity even for similar hues.',
      'Check that the control stays legible in both dark and light themes.',
    ]
  ),
  'Components/Primitives/Combobox': doc(
    'Shared combobox primitive for searchable selection inside forms and dialogs.',
    [
      'The base searchable-select behavior for longer or filterable option lists.',
      'How text input and option picking work together in a single shared control.',
    ],
    [
      'Use this story when a plain select is too rigid and users need to search or narrow options.',
      'Reuse this combobox before introducing another feature-local searchable picker.',
    ],
    [
      'Check input clarity, option readability, and keyboard-friendly interaction.',
      'Check that the control still feels predictable when empty, focused, or filtering results.',
    ]
  ),
  'Components/Primitives/Cards/Entity Card Header Icon': doc(
    'Shared icon treatment used in entity-card headers before card-specific content begins.',
    [
      'The icon sizing, framing, and visual emphasis used by card headers.',
      'How icon surfaces integrate with shared card tokens instead of feature-local styling.',
    ],
    [
      'Use this story when multiple cards need the same icon treatment change.',
      'Adjust the shared header icon here instead of restyling one domain card in isolation.',
    ],
    [
      'Check icon legibility and contrast across themes.',
      'Check that the icon surface still feels aligned with the broader card chrome.',
    ]
  ),
  'Components/Primitives/Cards/Entity Card Header': doc(
    'Shared card-header composition that brings together icon, title, subtitle, and leading context.',
    [
      'The baseline structure at the top of many entity cards.',
      'How textual hierarchy and supporting context are arranged before control content begins.',
    ],
    [
      'Use this story before changing card title placement or header spacing across several cards.',
      'Prefer evolving the shared header composition here rather than drifting card headers apart by domain.',
    ],
    [
      'Check title prominence, subtitle readability, and alignment with icon surfaces.',
      'Check that the header still works at smaller card sizes.',
    ]
  ),
  'Components/Primitives/Cards/Entity Card Title Block': doc(
    'Reusable title-and-subtitle block used inside cards when full header chrome is not needed.',
    [
      'The text-only hierarchy for compact card titles and supporting metadata.',
      'How title blocks behave when cards need lightweight labeling without extra controls.',
    ],
    [
      'Use this story when card titles need shared typography or truncation adjustments.',
      'Keep shared title hierarchy here so card text treatment remains consistent.',
    ],
    [
      'Check title truncation, subtitle contrast, and overall vertical rhythm.',
      'Check that supporting text remains secondary without becoming too faint.',
    ]
  ),
  'Components/Primitives/Heading': doc(
    'Shared heading primitive for section titles and content hierarchy across dialogs, settings, and pages.',
    [
      'The standard heading scale and emphasis available to shared UI.',
      'How headings establish hierarchy without custom typography in each feature.',
    ],
    [
      'Use this story before introducing a new section-title style in a feature.',
      'Prefer shared heading levels over local text-class combinations whenever the semantics match.',
    ],
    [
      'Check scale contrast between heading levels.',
      'Check that headings stay readable without overpowering nearby content.',
    ]
  ),
  'Components/Primitives/Input': doc(
    'Shared text-input primitive for short single-line form values.',
    [
      'The default text-field styling, spacing, and input behavior used across forms.',
      'How the base input fits into shared label and field structures.',
    ],
    [
      'Use this story when changing the standard text-field shell or its basic states.',
      'Keep short free-form entry cases on this primitive instead of spawning feature-local inputs.',
    ],
    [
      'Check focus visibility, placeholder readability, and disabled styling.',
      'Check that the control remains comfortable at dashboard viewing and tapping distances.',
    ]
  ),
  'Components/Primitives/Interactive Pill': doc(
    'Compact pill-shaped action or navigation surface used for small contextual selections.',
    [
      'The active and inactive treatment for pills used in previews, filters, and compact actions.',
      'How a small control can signal state without full button chrome.',
    ],
    [
      'Use this story when editing pill emphasis, density, or active-state behavior.',
      'Prefer this control for compact segmented or contextual actions before inventing another chip style.',
    ],
    [
      'Check selected-state clarity and label legibility.',
      'Check that the pill remains obviously clickable at smaller sizes.',
    ]
  ),
  'Components/Primitives/Loading Spinner': doc(
    'Shared loading indicator for lightweight pending states where the surrounding layout should stay intact.',
    [
      'The baseline spinner treatment used for waiting states in shared UI.',
      'How loading feedback is communicated without replacing the whole surface.',
    ],
    [
      'Use this story when adjusting loading feedback that appears inside existing layouts.',
      'Keep small loading affordances consistent here instead of styling them per feature.',
    ],
    [
      'Check visibility against light and dark surfaces.',
      'Check that the spinner communicates waiting without drawing too much attention.',
    ]
  ),
  'Components/Primitives/MessageBar': doc(
    'Shared inline feedback bar for short success, warning, or informational messages.',
    [
      'The standard structure for lightweight status communication inside flows and panels.',
      'How color, icon, and copy work together in a reusable message surface.',
    ],
    [
      'Use this story when a flow needs inline feedback rather than a toast or blocking dialog.',
      'Keep reusable feedback behavior here instead of creating feature-specific message banners.',
    ],
    [
      'Check message contrast, icon clarity, and text hierarchy.',
      'Check that the bar remains readable without feeling heavier than the surrounding content.',
    ]
  ),
  'Components/Primitives/Panel': doc(
    'Shared panel primitive for framed content sections that need more structure than plain layout wrappers.',
    [
      'The baseline framed-surface treatment for reusable content containers.',
      'How borders, padding, and surface styling support grouped content.',
    ],
    [
      'Use this story when shared content needs a framed container rather than a feature-only wrapper.',
      'Keep common panel treatments here to avoid diverging section containers.',
    ],
    [
      'Check padding rhythm, border visibility, and surface contrast.',
      'Check that panels still feel lightweight enough for dense dashboards.',
    ]
  ),
  'Components/Primitives/Radio': doc(
    'Shared radio input primitive for single-choice selection among a small set of options.',
    [
      'The base selected, unselected, and disabled states for radio controls.',
      'How the control is expected to look when paired with shared labels and field layouts.',
    ],
    [
      'Use this story when a choice should be mutually exclusive and visible all at once.',
      'Prefer this shared radio styling instead of local option-circle implementations.',
    ],
    [
      'Check selection visibility, focus state, and spacing next to labels.',
      'Check that the tap target remains comfortable in touch contexts.',
    ]
  ),
  'Components/Primitives/Rotary Knob': doc(
    'Shared rotary control for dense analog-style adjustments such as volume or intensity.',
    [
      'The interaction surface and visual framing for knob-style input.',
      'How this control communicates adjustable value in a more tactile way than a plain slider.',
    ],
    [
      'Use this story when changing compact analog controls used in dashboards or media surfaces.',
      'Review this before introducing another knob variant with slightly different chrome or sizing.',
    ],
    [
      'Check value legibility and grip affordance.',
      'Check that the control remains usable on touch screens and low-power devices.',
    ]
  ),
  'Components/Primitives/Round Control Button': doc(
    'Circular control button used for compact card actions and media-style controls.',
    [
      'The shared round action treatment used when the control itself is part of the visual language.',
      'How size, icon placement, and emphasis behave in compact control groups.',
    ],
    [
      'Use this story when altering circular action affordances shared by multiple features.',
      'Keep compact round-action styling centralized here so cards do not drift apart.',
    ],
    [
      'Check icon centering, hit target quality, and disabled-state clarity.',
      'Check that the control remains distinct from decorative circular elements.',
    ]
  ),
  'Components/Primitives/Select': doc(
    'Shared select primitive for choosing from a fixed list of options without search.',
    [
      'The baseline dropdown trigger and value presentation for standard option lists.',
      'How fixed-choice selection is styled in forms and settings surfaces.',
    ],
    [
      'Use this story when a fixed option list does not need the extra behavior of a combobox.',
      'Reuse this primitive before introducing another feature-specific dropdown shell.',
    ],
    [
      'Check selected-value readability and trigger affordance.',
      'Check that the field still reads clearly when empty or disabled.',
    ]
  ),
  'Components/Primitives/Slide Action': doc(
    'Slide-to-confirm action primitive for deliberate destructive or high-confidence interactions.',
    [
      'The gesture-driven confirmation pattern used when a tap is too easy to trigger accidentally.',
      'How track, thumb, and completion state work together in a shared action surface.',
    ],
    [
      'Use this story when evaluating whether a high-intent confirmation should use sliding instead of a standard button.',
      'Keep slide-confirm patterns centralized here rather than building feature-specific variants.',
    ],
    [
      'Check that the control clearly communicates both action and required gesture.',
      'Check that the gesture remains smooth and readable on touch hardware.',
    ]
  ),
  'Components/Primitives/Switch': doc(
    'Shared switch primitive for immediate on-off toggles where state changes directly.',
    [
      'The base toggle treatment for immediate binary actions.',
      'How the switch differs from checkbox semantics in both form and card contexts.',
    ],
    [
      'Use this story when a boolean action should change state immediately rather than represent form selection.',
      'Prefer the shared switch here over ad-hoc toggle visuals inside features.',
    ],
    [
      'Check on-off clarity, focus state, and disabled behavior.',
      'Check that the control still reads as an immediate toggle at small sizes.',
    ]
  ),
  'Components/Primitives/Tabs': doc(
    'Shared tabs primitive for switching between a small number of peer views inside the same surface.',
    [
      'The tab list, active indicator, and content-switching treatment used across shared UI.',
      'How segmented navigation should look when the user stays in the same broader flow.',
    ],
    [
      'Use this story when adjusting internal view switching rather than top-level app navigation.',
      'Keep tab affordances here instead of inventing feature-specific segmented controls.',
    ],
    [
      'Check active-state clarity and label scanability.',
      'Check that inactive tabs remain discoverable without competing with the active one.',
    ]
  ),
  'Components/Primitives/Tag': doc(
    'Shared tag primitive for lightweight labeling, status, or metadata chips.',
    [
      'The compact labeling treatment used when content needs low-emphasis categorization.',
      'How tags differ from interactive pills or action controls.',
    ],
    [
      'Use this story for passive metadata labels, not for primary actions.',
      'Keep tag styling shared here so small labels remain visually consistent.',
    ],
    [
      'Check label legibility and visual restraint.',
      'Check that tags remain clearly non-interactive unless explicitly paired with action behavior.',
    ]
  ),
  'Components/Primitives/Text': doc(
    'Shared text primitive for body copy, supporting copy, and lower-level content hierarchy.',
    [
      'The standard body-text styles used across shared and feature-level UI.',
      'How supporting copy should be expressed without custom text classes in every file.',
    ],
    [
      'Use this story before inventing another text treatment for regular UI copy.',
      'Prefer the shared text primitive when the need is hierarchy, tone, or readability rather than special branding.',
    ],
    [
      'Check readability, line-height, and contrast.',
      'Check that lower-emphasis copy stays readable on tinted or glass surfaces.',
    ]
  ),
  'Components/Primitives/Textarea': doc(
    'Shared multiline text input for notes, longer descriptions, and free-form editing.',
    [
      'The multiline input shell used when content exceeds a single line.',
      'How longer user-entered text sits inside shared field styling.',
    ],
    [
      'Use this story when longer input needs the same visual language as the standard input.',
      'Keep shared multiline-field behavior here instead of styling per feature form.',
    ],
    [
      'Check resizing behavior, vertical rhythm, and placeholder readability.',
      'Check that the field remains easy to use for longer text on tablet-sized dashboards.',
    ]
  ),
  'Components/Primitives/Tooltip': doc(
    'Shared tooltip primitive for short contextual explanations without persistent UI weight.',
    [
      'The hover or focus helper surface used to expose small amounts of extra context.',
      'How supplemental explanation is styled without becoming a full popover.',
    ],
    [
      'Use this story when a control needs brief clarification that should stay out of the main layout.',
      'Prefer tooltips for compact help, not for core instructions that users should always see.',
    ],
    [
      'Check readability, timing, and anchor alignment.',
      'Check that critical information is not hidden only inside the tooltip.',
    ]
  ),
  'Components/Shared/Card Size Selector': doc(
    'Navet-specific selector for choosing dashboard card footprint presets.',
    [
      'The control users rely on when resizing cards in edit and configuration flows.',
      'How card-size options are presented as product-specific choices rather than generic form values.',
    ],
    [
      'Use this story when changing supported size labels, order, or affordance.',
      'Keep card-resizing behavior centralized here so resize UX stays consistent across dialogs and edit mode.',
    ],
    [
      'Check that the currently selected size is obvious.',
      'Check that labels make sense to users who are thinking in layout terms, not internal implementation terms.',
    ]
  ),
  'Components/Shared/Device Editor/Dialog Section Row': doc(
    'Reusable row structure for grouped sections inside device-editor dialogs.',
    [
      'The local layout pattern used to organize editable device settings into readable sections.',
      'How labels, controls, and row spacing are framed in device-editing flows.',
    ],
    [
      'Use this story when changing how device-editor sections are grouped or aligned.',
      'Prefer reusing this row pattern over creating slightly different dialog section rows in each editor.',
    ],
    [
      'Check row spacing, alignment, and scanability.',
      'Check that the row supports dense settings without feeling cramped.',
    ]
  ),
  'Components/Shared/Device Editor/Icon Picker': doc(
    'Navet-specific icon picker used when editing device presentation inside the app.',
    [
      'The browsing and selection surface for choosing an icon in device-editing flows.',
      'How icon options are organized for app-specific editing rather than general asset browsing.',
    ],
    [
      'Use this story when changing icon selection workflow, option density, or search/browse behavior.',
      'Keep icon-picking UX shared here so device editors remain consistent.',
    ],
    [
      'Check icon discoverability and selected-state clarity.',
      'Check that the picker remains usable without overwhelming the dialog with too many choices at once.',
    ]
  ),
  'Components/Shared/Entity Room Selector': doc(
    'Navet-specific room assignment control for placing entities in dashboard spaces.',
    [
      'How rooms are selected and displayed in app-specific assignment flows.',
      'The product-specific language and hierarchy behind room placement.',
    ],
    [
      'Use this story when changing room-assignment behavior in settings or add-card workflows.',
      'Keep room-assignment affordances here instead of building local selectors around individual features.',
    ],
    [
      'Check that the current room and available destinations are easy to understand.',
      'Check that the control feels like placement within the dashboard, not a generic taxonomy picker.',
    ]
  ),
  'Components/Shared/Network Status Banner': doc(
    'Shared app-specific banner for connection and network state at the application level.',
    [
      'How connection problems or degraded status are communicated without blocking the whole UI.',
      'The visual severity and tone used for app-wide network awareness.',
    ],
    [
      'Use this story when changing wording, severity styling, or banner prominence for connectivity states.',
      'Keep network-status communication shared here rather than restyling it in each feature.',
    ],
    [
      'Check urgency, readability, and dismissibility expectations.',
      'Check that the banner is noticeable without permanently dominating the layout.',
    ]
  ),
  'Cards/Entity/Calendar': doc(
    'Entity card for upcoming calendar events rendered as a dashboard card rather than a full agenda view.',
    [
      'How upcoming events, time labels, and event metadata are summarized in a card footprint.',
      'The balance between immediacy and detail for calendar information on the dashboard.',
    ],
    [
      'Use this story when changing event density, time presentation, or the overall card hierarchy.',
      'Review it before expanding the card toward a full calendar list that would overwhelm the dashboard.',
    ],
    [
      'Check at-a-glance readability and event prioritization.',
      'Check that the card remains useful even when events are sparse or brief.',
    ]
  ),
  'Cards/Entity/Climate': doc(
    'Entity card for Climate control and status, focused on current mode, action, and target temperature.',
    [
      'The core thermostat states users need to read quickly from the dashboard.',
      'How setpoint, ambient temperature, and operating mode fit into one card.',
    ],
    [
      'Use this story when changing climate-card hierarchy, controls, or mode emphasis.',
      'Treat it as the domain-level review page before broader card-matrix checks.',
    ],
    [
      'Check that current mode and active heating or cooling state are obvious at a glance.',
      'Check that temperature values remain readable and well spaced across sizes.',
    ]
  ),
  'Cards/Entity/Humidifier': doc(
    'Entity card for humidifiers and dehumidifiers, combining target humidity control, current reading, and quick mode switching.',
    [
      'How humidity target, current humidity, and live power state fit into a compact climate card.',
      'The shared treatment for both humidifier and dehumidifier variants without splitting the UI model.',
    ],
    [
      'Use this story when changing humidity-card hierarchy, gauge behavior, or quick mode controls.',
      'Review both humidifier and dehumidifier variants before changing climate-card styling or wording.',
    ],
    [
      'Check that the target humidity remains obvious before the secondary controls.',
      'Check that humidifier and dehumidifier variants stay visually distinct without looking like separate products.',
    ]
  ),
  'Cards/Custom/Action': doc(
    'Custom dashboard action card for quick-trigger interactions that are not direct HA entity cards.',
    [
      'The compact widget treatment for a dashboard-native action surface.',
      'How a custom call-to-action card fits into the same dashboard language as entity cards.',
    ],
    [
      'Use this story when changing the visual weight or affordance of action-oriented custom cards.',
      'Review it before adding more one-off shortcut widgets that overlap with this pattern.',
    ],
    [
      'Check that the card reads like an actionable shortcut, not passive information.',
      'Check that the card stays concise enough for dashboard use.',
    ]
  ),
  'Cards/Custom/Assist': doc(
    'Home Assistant Assist card for opening Navet’s text and microphone conversation surface.',
    [
      'The tiny, extra-small, and small treatments for a provider-bound conversation action.',
      'How Assist availability and its primary tap affordance fit the existing custom-card grammar.',
    ],
    [
      'Use this story when changing Assist card hierarchy, status copy, or compact sizing.',
      'Review it with the Action card before changing shared shortcut-card geometry.',
    ],
    [
      'Check that the card reads as a conversation entry point rather than a generic service button.',
      'Check light, dark, glass, touch, keyboard focus, and all three supported sizes.',
    ]
  ),
  'Cards/Custom/Map': doc(
    'Custom map card rendering person and device_tracker entities with GPS on an interactive MapLibre map backed by OpenFreeMap vector tiles.',
    [
      'How GPS-bearing entities are aggregated into a single spatial overview card.',
      'The full-bleed map layout and overlay conventions for non-entity custom cards.',
    ],
    [
      'Use this story when changing map tile styles, marker design, or GPS accuracy visualisation.',
      'Review when adjusting the bottom overlay or empty-state treatment.',
    ],
    [
      'Check that markers are readable at all three supported sizes (small, medium, large).',
      'Check that the dark/light tile variant switches correctly with the active theme.',
      'Check the empty state when no entities have GPS attributes.',
    ]
  ),
  'Cards/Custom/Battery Overview': doc(
    'Custom dashboard card for summarizing battery status across devices.',
    [
      'How aggregate health information is condensed into one at-a-glance card.',
      'The balance between overview value and dashboard footprint for maintenance-heavy information.',
    ],
    [
      'Use this story when changing aggregate-status presentation or maintenance-oriented dashboard summaries.',
      'Keep battery-overview logic and hierarchy here instead of scattering summary widgets.',
    ],
    [
      'Check that low-battery urgency stands out appropriately.',
      'Check that the card remains readable without turning into a dense list.',
    ]
  ),
  'Cards/Custom/Energy Now': doc(
    'Custom dashboard energy snapshot card with a full-bleed live trend backdrop and current power as the primary reading.',
    [
      'How a chart-first energy card can still read clearly inside the custom-card system.',
      'The full-bleed sparkline treatment used to make live usage feel ambient and glanceable.',
    ],
    [
      'Use this story when changing hierarchy, overlay placement, or chart emphasis for the energy-now custom card.',
      'Review it before adjusting other chart-led custom cards so the full-bleed treatment stays coherent.',
    ],
    [
      'Check that current power remains the dominant reading at all three supported sizes.',
      'Check that the chart still reads as the main surface rather than background decoration.',
    ]
  ),
  'Cards/Custom/Photo': doc(
    'Custom photo-frame card used to surface imagery as a dashboard-native visual widget.',
    [
      'The presentation of photo content inside the card system.',
      'How decorative or ambient visual content is balanced against the rest of the dashboard.',
    ],
    [
      'Use this story when adjusting image treatment, framing, or supporting chrome for photo content.',
      'Review it before adding richer media decoration that could hurt dashboard performance.',
    ],
    [
      'Check cropping, readability of any overlaid content, and overall visual restraint.',
      'Check that the card still feels intentional within a functional dashboard layout.',
    ]
  ),
  'Cards/Custom/Quick Note': doc(
    'Custom quick-note card for lightweight personal text pinned directly into the dashboard.',
    [
      'The balance between editable note content and a compact dashboard footprint.',
      'How a text-first custom card should feel inside a predominantly device-oriented layout.',
    ],
    [
      'Use this story when changing note density, hierarchy, or supporting affordances.',
      'Keep note-card presentation here instead of inventing parallel text-widget variants.',
    ],
    [
      'Check readability for short and medium-length notes.',
      'Check that the note still feels lightweight enough for regular dashboard placement.',
    ]
  ),
  'Cards/Overview/All Sizes': doc(
    'Cross-card comparison page for checking how supported card sizes behave across the dashboard system.',
    [
      'The relative density and content balance of cards at each supported size.',
      'How shared sizing decisions ripple across different card families.',
    ],
    [
      'Use this page after changing card padding, spacing, or size support.',
      'Review it before adding a new size option or shifting a card to a different minimum size.',
    ],
    [
      'Check that compact sizes remain usable and larger sizes do not feel underfilled.',
      'Check that card families still look like part of the same dashboard language.',
    ]
  ),
  'Cards/Overview/Catalog': doc(
    'Runtime inventory page for the card types Navet currently exposes in the dashboard.',
    [
      'The list of runtime-registered card types and how they are grouped.',
      'The boundary between entity cards, custom cards, and Storybook-only support surfaces.',
    ],
    [
      'Use this page before adding or renaming a card type.',
      'Use it to confirm whether a new story belongs in entity coverage, custom coverage, or overview coverage.',
    ],
    [
      'Check that new card types are represented in the right family.',
      'Check that custom cards are not silently treated as runtime entity cards.',
    ]
  ),
  'Cards/Overview/Extended State Matrix': doc(
    'Broader card-review matrix for comparing more entity-card families and edge states in one place.',
    [
      'A wide visual audit surface for cards beyond the core state matrix.',
      'How less-common card families hold together under the shared dashboard language.',
    ],
    [
      'Use this page for broader regression sweeps after shared card changes.',
      'Review it when a visual-system change could affect many card families at once.',
    ],
    [
      'Check cross-card consistency in spacing, header treatment, and state emphasis.',
      'Check that uncommon cards still feel like first-class members of the dashboard.',
    ]
  ),
  'Cards/Overview/Core State Matrix': doc(
    'Focused regression page for the most important card states across the core dashboard families.',
    [
      'On, off, playback, mode, and edit-mode states for the most common cards.',
      'A side-by-side comparison surface for spotting regressions quickly.',
    ],
    [
      'Use this page right after changing shared card tokens, chrome, or core interactions.',
      'Keep it as the first cross-card QA stop before the broader extended matrix.',
    ],
    [
      'Check that state changes remain immediately readable.',
      'Check that edit-mode tooling does not crowd out the runtime state of each card.',
    ]
  ),
  'Cards/Entity/Switch': doc(
    'Entity card for binary switch-style devices with a compact on-off interaction model.',
    [
      'How a simple device domain is represented without unnecessary extra chrome.',
      'The shared card behavior for immediate binary state changes.',
    ],
    [
      'Use this story when changing the layout or interaction of simple switch entities.',
      'Keep binary-card simplifications here rather than letting switch cards drift toward heavier light-card behavior.',
    ],
    [
      'Check that on-off state is obvious instantly.',
      'Check that the compact layout still feels intentional rather than underspecified.',
    ]
  ),
  'Cards/Entity/Light': doc(
    'Entity card for lighting with power, brightness, and color-temperature awareness in one dashboard surface.',
    [
      'The core light states and controls users expect to adjust quickly.',
      'How brightness and warmth information coexist with the main on-off state.',
    ],
    [
      'Use this story when changing light-card hierarchy, card sizes, or interaction behavior.',
      'Review this page before validating the card inside broader dashboard matrices.',
    ],
    [
      'Check that power state remains the first thing users see.',
      'Check that secondary lighting details do not clutter the card at smaller sizes.',
    ]
  ),
  'Cards/Entity/Fan': doc(
    'Entity card for standalone fan devices with card-level power and quick speed selection.',
    [
      'The light-card-adjacent surface treatment for fan entities.',
      'Low, medium, and high speed actions using the shared card action row.',
      'The settings affordance and fan-specific card customization surface.',
    ],
    [
      'Use this story when changing fan-card styling, speed actions, or dialog accent behavior.',
      'Review the card beside light stories because standalone fans intentionally share that visual family.',
    ],
    [
      'Check that card click still reads as power control.',
      'Check that speed buttons feel like Navet controls and do not reintroduce an off action.',
      'Check that dialog accents match the fan card surface instead of the global primary color.',
    ]
  ),
  'Cards/Entity/Media': doc(
    'Entity card for media playback with transport state, progress, and device grouping context.',
    [
      'How currently playing information, playback state, and transport affordances fit into one card.',
      'The balance between information richness and dashboard density for media surfaces.',
      'TV variant: remote-style controls, one fixed-size D-pad (104×104) across all card sizes, small tile uses a header toggle to show or hide the pad with settings pinned when the pad is open.',
    ],
    [
      'Use this story when changing media hierarchy, progress treatment, or playback-control layout.',
      'Review it before extending the card toward a heavier full-player interface.',
      'Use the TV stories when changing `MediaTvView`, remote affordances, or D-pad layout.',
    ],
    [
      'Check that playback state and current content are immediately recognizable.',
      'Check that progress and secondary metadata remain readable without cluttering the card.',
      'For TV: check small vs wide layouts, source row, and D-pad visibility without overlapping controls.',
    ]
  ),
  'App Shell/Notifications/Panel': doc(
    'Notification-panel surface used from the app shell to review recent alerts and messages.',
    [
      'How individual notifications are grouped and presented inside the panel.',
      'The balance between recency, density, and readability in the notification center.',
    ],
    [
      'Use this story when changing notification layout, grouping, or panel-level framing.',
      'Keep notification-center behavior here instead of diverging across different entry points.',
    ],
    [
      'Check scanability, severity communication, and row density.',
      'Check that the panel remains easy to skim when several notifications are present.',
    ]
  ),
  'Cards/Entity/Person': doc(
    'Entity card for person presence, location, and home-state awareness.',
    [
      'How a person entity is summarized for quick dashboard awareness.',
      'The relationship between status, identity, and supporting presence context.',
    ],
    [
      'Use this story when changing presence emphasis, avatar treatment, or location metadata hierarchy.',
      'Keep person-card presentation concise enough for dashboard use rather than drifting into profile UI.',
    ],
    [
      'Check that home, away, or status changes are clear at a glance.',
      'Check that identity and presence remain balanced inside the card.',
    ]
  ),
  'Cards/Custom/RSS Feed': doc(
    'Custom dashboard card for a short RSS/news feed preview inside the dashboard.',
    [
      'How multiple feed items are summarized in a compact custom card.',
      'The tradeoff between content density and dashboard readability for feed content.',
    ],
    [
      'Use this story when changing article density, metadata hierarchy, or card framing for feed content.',
      'Review it before making the card behave like a full reading surface instead of a dashboard preview.',
    ],
    [
      'Check headline legibility and item scannability.',
      'Check that the card still feels like a quick-glance surface, not a dense content list.',
    ]
  ),
  'Cards/Entity/Scene': doc(
    'Entity card for scenes, optimized around recognition and triggering rather than ongoing status control.',
    [
      'How a scene is represented as a triggerable dashboard surface.',
      'The visual language for a card that acts more like an action than a continuously changing device.',
    ],
    [
      'Use this story when changing scene-card emphasis, copy, or trigger affordance.',
      'Keep scene cards clearly action-oriented instead of forcing them into device-status patterns.',
    ],
    [
      'Check that the card reads as a scene trigger immediately.',
      'Check that action emphasis is clear without feeling destructive or risky.',
    ]
  ),
  'Cards/Entity/Camera': doc(
    'Entity card for camera feeds with enough framing to preview a security surface inside the dashboard.',
    [
      'How camera imagery, identity, and supporting status fit into a card footprint.',
      'The shared treatment for a visually rich card inside the broader dashboard system.',
    ],
    [
      'Use this story when changing preview framing, overlay treatment, or supporting camera metadata.',
      'Review it before adding heavier visual effects that could hurt performance on dashboard hardware.',
    ],
    [
      'Check preview clarity, overlay readability, and card balance.',
      'Check that the card still feels part of the same system as non-visual entity cards.',
    ]
  ),
  'Cards/Entity/Cover': doc(
    'Entity card for covers such as blinds or shades, centered on position and motion-oriented state.',
    [
      'How open-close state and cover context are summarized in a compact dashboard card.',
      'The interaction model for a device that lives between binary and continuous control.',
    ],
    [
      'Use this story when changing cover-state emphasis, control placement, or compact hierarchy.',
      'Keep cover-card behavior distinct from both simple switches and richer climate/media cards.',
    ],
    [
      'Check that current cover state is immediately understandable.',
      'Check that any motion or partial-position cues stay readable without extra clutter.',
    ]
  ),
  'Cards/Entity/Lock': doc(
    'Entity card for locks where security state must be obvious and actionable at a glance.',
    [
      'The lock and unlock presentation for a high-confidence security-oriented surface.',
      'How state emphasis and action readiness are balanced in a compact card.',
    ],
    [
      'Use this story when changing the lock-card hierarchy, action styling, or state wording.',
      'Keep security-state communication especially clear here before checking broader card matrices.',
    ],
    [
      'Check that locked and unlocked states are unmistakable.',
      'Check that the card feels secure and deliberate rather than casual.',
    ]
  ),
  'Cards/Entity/Alarm Panel': doc(
    'Entity card for alarm-control panels, centered on arming state, supported actions, and disarm requirements.',
    [
      'How armed, pending, triggered, and unavailable alarm states are communicated in a dedicated security surface.',
      'The action hierarchy for arming modes, disarming, and optional code requirements.',
    ],
    [
      'Use this story when changing alarm-state emphasis, action grouping, or code-entry expectations.',
      'Review it alongside the broader security dashboard stories before changing security language or visual severity.',
    ],
    [
      'Check that the current alarm state reads immediately from normal dashboard distance.',
      'Check that the supported actions remain clear without making the card feel noisy or unsafe.',
    ]
  ),
  'Cards/Entity/Grouped Sensor': doc(
    'Entity card for a grouped sensor summary, combining several related readings into one dashboard surface.',
    [
      'How several sensor values are summarized without turning into a dense table.',
      'The hierarchy between the headline state and the supporting grouped readings.',
    ],
    [
      'Use this story when changing grouped-sensor density, ordering, or emphasis.',
      'Keep grouped sensor presentation shared here instead of creating one-off summary cards by domain.',
    ],
    [
      'Check that the primary reading stands out while supporting values remain easy to compare.',
      'Check that the card stays readable at the smaller supported sizes.',
    ]
  ),
  'Cards/Entity/Info': doc(
    'Read-only entity card for a single provider sensor, binary sensor, timestamp, or passive status value.',
    [
      'How numeric readings and binary status values share one visual language.',
      'The compact icon, type eyebrow, entity name, and large value hierarchy used by info cards.',
    ],
    [
      'Use this story when changing sensor mapping, binary status wording, or info card styling.',
      'Keep passive entity presentation here instead of treating it as a custom widget surface.',
    ],
    [
      'Check that temperature, humidity, air quality, motion, leak, and window examples remain distinct.',
      'Check that long names and unavailable states stay readable at small card sizes.',
    ]
  ),
  'Cards/Entity/Info Badge Strip': doc(
    'Navet summary strip for important dashboard areas such as energy, climate, security, lights, media, and routines.',
    [
      'How section-level home status is summarized without adding layout cards.',
      'The compact chip treatment used above the home dashboard content.',
    ],
    [
      'Use this story when changing summary labels, density, or section navigation targets.',
      'Keep summaries glanceable and separate from normal dashboard card layout.',
    ],
    [
      'Check that important areas remain easy to scan and tap.',
      'Check that long labels truncate cleanly on narrow dashboard widths.',
    ]
  ),
  'Cards/Entity/Vacuum': doc(
    'Entity card for vacuum devices, including cleaning status and maintenance-oriented context.',
    [
      'How operational state, progress, and supporting device context are summarized in one card.',
      'The dashboard representation of a more workflow-oriented device domain.',
    ],
    [
      'Use this story when changing vacuum-card states, status hierarchy, or compact controls.',
      'Review it before broad dashboard-state checks so the domain-specific behavior is solid first.',
    ],
    [
      'Check that cleaning, docked, and paused states are easy to distinguish.',
      'Check that supporting maintenance details do not crowd the primary status.',
    ]
  ),
  'Cards/Entity/Lawn Mower': doc(
    'Entity card for robotic lawn mowers, using a dedicated mower presentation and control surface.',
    [
      'How mowing, paused, returning, docked, and error states read when mapped into the shared maintenance-device card.',
      'The mower-specific subset of controls where vacuum-only actions stay hidden.',
    ],
    [
      'Use this story when changing mower presentation, status mapping, or mower-specific control behavior.',
      'Review it alongside the vacuum story when modifying shared maintenance-card controls.',
    ],
    [
      'Check that mower states remain readable without vacuum-only metrics crowding the card.',
      'Check that only start, pause, and return-home style behavior is implied by the story variants.',
    ]
  ),
  'Cards/Entity/Weather': doc(
    'Entity card for current weather conditions and compact forecast context.',
    [
      'How ambient conditions are summarized for fast reading on the dashboard.',
      'The balance between atmosphere, iconography, and concise weather data.',
    ],
    [
      'Use this story when changing condition hierarchy, supporting metrics, or forecast emphasis.',
      'Keep weather-card presentation concise enough for dashboard scanning.',
    ],
    [
      'Check condition legibility, icon clarity, and value emphasis.',
      'Check that the card remains readable across themes with visually expressive weather content.',
    ]
  ),
};

// ---------------------------------------------------------------------------
// Additional story documentation entries
// ---------------------------------------------------------------------------

const ADDITIONAL_STORY_DOCS: Record<string, string> = {
  'Pages/Household/Today': doc(
    'Complete Household workspace for daily chores, planning, progress, settings, and the neighboring provider-routine surface.',
    [
      'Attention-first ordering across overdue, due, remaining, and completed chores for today.',
      'Responsive tablet, phone, wide-screen, empty, approval, completion, and recovery states.',
      'Independent room-nav-style destinations for Today, Chores, Missions, Rewards, Progress, Settings, and Routines.',
      'Missions and rewards stay out of Today until See rewards is opened from the Chores today banner.',
    ],
    [
      'Use this story when the Household information hierarchy, navigation, shared-screen behavior, or management views change.',
      'Compare its outer rhythm with Home and its inner surfaces with shared card, tab, dialog, and settings patterns.',
    ],
    [
      'Check all four themes, phone and wall-display widths, reduced motion, long names, and no-hover operation.',
      'Check that what needs doing, who owns it, when it is due, and whether it is done remain clear before motivation or setup detail.',
    ]
  ),
  'Pages/Household/Chore Onboarding': doc(
    'Six-step first-run flow for establishing people, appearance and reminders, initial chores, optional motivation, and management protection.',
    [
      'The requirement to keep at least one household manager.',
      'Progressive person and chore creation without presenting every advanced field at once.',
      'Desktop and phone behavior for the shared navigation-workspace dialog pattern.',
    ],
    [
      'Use this story when setup order, validation, participant creation, or initial chore creation changes.',
      'Keep advanced scheduling and motivation optional so setup can stay focused on the first useful household list.',
    ],
    [
      'Check keyboard focus, step announcements, narrow-screen scrolling, and safe back and close behavior.',
      'Check that setup can finish with motivation and the PIN skipped.',
    ]
  ),
  'Pages/Household/Add Chore Dialog': doc(
    'Four-step creation surface for adding a chore after onboarding, with the same fields available as one navigable editor when the chore is changed later.',
    [
      'Chore identity, Lucide icon preview, automatic or custom card color, room, estimated time, points, and optional instructions.',
      'Assignment, once/daily/weekly/every-2-weeks/every-3-weeks/monthly/after-completion schedules, reminders, and missed-work behavior.',
      'Phone and desktop behavior for long configuration forms.',
    ],
    [
      'Use this story when chore fields, profile fields, validation, or step order changes.',
      'Prefer the shared dialog, field, stepper, and navigation-workspace patterns over feature-local form shells.',
    ],
    [
      'Check touch targets, focus order, validation copy, overflow, and translated labels.',
      'Check that the first decision stays obvious even when every optional control is available.',
    ]
  ),
  'Cards/Household/Chore': doc(
    'Primary operational card and compact row for one scheduled household chore.',
    [
      'Due, overdue, awaiting-approval, completed, claimed, and child-friendly states.',
      'Room and timing state, title, optional instructions, assignment, effort, earned points, and one secondary completion action in the ChoreBaseCard hierarchy.',
      'Stable ID-based automatic color palettes, edit-time color overrides, overdue red, and completed green.',
    ],
    [
      'Use this story when chore state language, actions, presentation metadata, or compact-list behavior changes.',
      'Compare geometry and theme treatment with BaseCard and neighboring Home card stories.',
    ],
    [
      'Check active and unavailable contrast across all themes, keyboard focus, and touch use.',
      'Check long names and missing optional room or presentation data without weakening the primary action.',
    ]
  ),
  'Cards/Household/Support': doc(
    'Supporting progress cards for the one-row Chores today banner, missions, and optional reward goals.',
    [
      'Full-height metric cells for earned points, streak, completion, and the See rewards disclosure.',
      'Mission and reward progress that remains secondary to operational work and hidden from Today until requested.',
    ],
    [
      'Use this story when Household summary calculations or supporting card compositions change.',
      'Keep these cards in the same theme-native surface family as Home rather than introducing a chores-only shell.',
    ],
    [
      'Check incomplete and complete states, light and black themes, and compact grid behavior.',
      'Check that optional points and goals never overpower due work.',
    ]
  ),
  'Components/Patterns/Card Action Row': doc(
    'Composed action-row pattern for card footers and control strips that combine primary controls, utility actions, and overflow commands.',
    [
      'How shared card actions are grouped into a predictable footer layout.',
      'Density behavior across compact and touch-forward card sizes.',
    ],
    [
      'Use this story when adjusting shared action-row spacing, control balance, or overflow affordances.',
      'Prefer evolving this shared pattern instead of rebuilding card footers inside each feature.',
    ],
    [
      'Check that the primary control group stays dominant while utility actions remain easy to reach.',
      'Check that density changes preserve tap comfort and visual rhythm.',
    ]
  ),
  'Components/Patterns/CardDialog': doc(
    'Shared composition layer for card settings dialogs, including header, sections, tab navigation, and done-footer structure.',
    [
      'How card configuration surfaces are assembled from reusable dialog primitives.',
      'The relationship between dialog header context, tabbed sections, and closing actions.',
    ],
    [
      'Use this story when changing the shared structure of card settings dialogs.',
      'Keep card-dialog layout decisions here so feature dialogs stay in the same family.',
    ],
    [
      'Check that the dialog reads clearly before feature-specific controls are added.',
      'Check that tabs, sections, and footer actions feel balanced rather than over-contained.',
    ]
  ),
  'Components/Patterns/Card Empty State': doc(
    'Compact empty-state pattern for cards that have no configured data, sources, or selected entities yet.',
    [
      'The shared card-scale layout for an icon, short explanation, and optional action.',
      'How empty states adapt across supported card sizes without turning into a full-page fallback.',
    ],
    [
      'Use this story when changing card-level fallback copy, spacing, or action treatment.',
      'Prefer this pattern over feature-local empty-card layouts when the structure is the same.',
    ],
    [
      'Check that the empty state remains readable and centered at smaller sizes.',
      'Check that optional actions feel helpful without overpowering the message.',
    ]
  ),
  'Components/Patterns/Empty State': doc(
    'Shared dashboard-scale empty-state pattern for broader surfaces that need guidance when no content is available yet.',
    [
      'How title, supporting copy, and optional actions scale up beyond card-level fallback states.',
      'The shared visual language for empty dashboards and larger layout regions.',
    ],
    [
      'Use this story when changing empty-state hierarchy for section- or page-level surfaces.',
      'Keep larger fallback layouts aligned here rather than styling them independently in each feature.',
    ],
    [
      'Check that the message is understandable at a glance.',
      'Check that the action path is clear without making the empty state feel like a marketing panel.',
    ]
  ),
  'Components/Patterns/Dashboard Hero Section': doc(
    'Shared hero-section pattern for dashboard summaries that combine a headline, supporting metrics, and primary actions.',
    [
      'How high-priority dashboard context is framed before the main card grid begins.',
      'The balance between overview content and action entrypoints in a calm first-screen section.',
    ],
    [
      'Use this story when changing hero hierarchy, spacing, or summary/action composition.',
      'Keep dashboard hero treatment shared here rather than creating feature-specific hero variants.',
    ],
    [
      'Check that the headline and supporting information are easy to scan from a distance.',
      'Check that the hero remains useful without crowding the cards beneath it.',
    ]
  ),
  'Components/Primitives/Icon Button': doc(
    'Accessible icon-only action used where a text label would make a card header, toolbar, or dialog control too crowded.',
    [
      'Compact, small, and default hit-target tiers without changing the icon scale arbitrarily.',
      'Subtle, ghost, secondary, pending, and unavailable action states.',
    ],
    [
      'Choose an icon-only action only when the symbol is familiar in context.',
      'Provide a specific `label`; it is the control name announced by assistive technology.',
    ],
    [
      'Confirm every example has a meaningful accessible name and visible keyboard focus.',
      'Confirm compact controls remain comfortable on touch-first dashboard hardware.',
    ]
  ),
  'Components/Patterns/Form Field': doc(
    'Shared field-block pattern for form labels, helper text, and the control body they describe.',
    [
      'How field titles, optional descriptions, and inputs are grouped into one reusable layout.',
      'The baseline rhythm for settings and dialog forms across the app.',
    ],
    [
      'Use this story when changing shared form spacing or helper-copy hierarchy.',
      'Prefer this pattern instead of hand-assembling labels and inputs in each settings surface.',
    ],
    [
      'Check that the relationship between label, helper text, and control is obvious.',
      'Check that dense settings lists still feel calm and readable.',
    ]
  ),
  'Components/Patterns/Preview Cards': doc(
    'Shared preview-card pattern for showing live appearance or interaction examples inside settings and onboarding flows.',
    [
      'How a preview surface can stay informative without becoming a second full runtime.',
      'The framing used for glanceable previews of visual or behavioral choices.',
    ],
    [
      'Use this story when changing preview-shell styling, spacing, or supporting chrome.',
      'Keep settings previews shared here so they feel consistent across features.',
    ],
    [
      'Check that the preview reads as a sample, not a full interactive card.',
      'Check that preview framing stays secondary to the settings content around it.',
    ]
  ),
  'Components/Patterns/Portal Action Dock': doc(
    'Floating action-dock pattern for contextual controls anchored to a selected item or region.',
    [
      'How contextual actions are grouped when they need to hover near a focused target.',
      'The balance between prominence, reachability, and keeping the rest of the UI visible.',
    ],
    [
      'Use this story when changing floating contextual-action presentation.',
      'Keep portal-dock behavior shared here instead of rebuilding anchored toolbars per feature.',
    ],
    [
      'Check anchor alignment, spacing, and readability of clustered actions.',
      'Check that the dock feels connected to its target without obscuring too much content.',
    ]
  ),
  'Components/Patterns/Section Card': doc(
    'Shared section-card pattern for grouping related content blocks inside settings, dashboards, and overview pages.',
    [
      'How larger content groupings are framed without looking like ordinary entity cards.',
      'The surface rhythm used for multi-item sections with their own title and body.',
    ],
    [
      'Use this story when adjusting the shell for grouped section content.',
      'Prefer this shared section framing over feature-local bordered containers.',
    ],
    [
      'Check that the section feels organized and lightweight.',
      'Check that nested content still has enough room without the shell becoming visually heavy.',
    ]
  ),
  'Components/Patterns/Table Cell Content': doc(
    'Dense table-cell content pattern for pairing a primary label with compact supporting metadata.',
    [
      'How structured row data is presented without resorting to ad-hoc text stacks.',
      'The hierarchy between a cell headline and its secondary supporting values.',
    ],
    [
      'Use this story when changing compact table/list row formatting.',
      'Keep shared cell-content hierarchy here so admin and settings tables stay consistent.',
    ],
    [
      'Check label scanability and secondary-text readability.',
      'Check that the pattern stays legible in denser table layouts.',
    ]
  ),
  'Components/Primitives/Cards/BaseCardDialog': doc(
    'Shared base dialog shell for entity cards and custom-card settings surfaces.',
    [
      'How the baseline dialog frame behaves before feature-specific sections are layered in.',
      'The reusable structure for tabs, body content, and closing actions.',
    ],
    [
      'Use this story when changing the foundational card-dialog shell.',
      'Keep cross-card settings framing aligned here rather than duplicating dialog structure in each feature.',
    ],
    [
      'Check shell spacing, title hierarchy, and footer behavior.',
      'Check that the dialog still feels appropriate for both compact and richer card settings.',
    ]
  ),
  'Components/Primitives/Badge': doc(
    'Compact badge primitive for short status labels, counts, and contextual metadata.',
    [
      'The small emphasis surface used for lightweight status communication.',
      'How badges sit alongside headings, metrics, and dense list content.',
    ],
    [
      'Use this story when changing short-form status chips or label treatments.',
      'Keep compact metadata styling shared here instead of creating feature-local badge variants.',
    ],
    [
      'Check readability, padding, and contrast at small sizes.',
      'Check that the badge stays supportive rather than becoming the dominant element.',
    ]
  ),
  'Components/Primitives/Button': doc(
    'Shared button primitive for primary, secondary, and utility actions across the app.',
    [
      'The baseline action treatment for buttons before feature-specific context is layered on.',
      'How variants, sizing, and emphasis levels fit into the broader Navet control language.',
    ],
    [
      'Use this story when changing common button styling or hierarchy rules.',
      'Prefer evolving the shared button over adding one-off action styling in features.',
    ],
    [
      'Check emphasis, hover states, and touch target comfort.',
      'Check that button variants remain distinct without drifting into separate design systems.',
    ]
  ),
  'Components/Primitives/CardShell': doc(
    'Reusable card-shell primitive for framing card content with shared radius, spacing, and surface treatment.',
    [
      'The structural shell used before a card gains domain-specific content and actions.',
      'How shared card chrome behaves across themes and densities.',
    ],
    [
      'Use this story when adjusting shared card radius, borders, or internal framing.',
      'Keep base card-shell behavior shared here instead of duplicating shell classes across cards.',
    ],
    [
      'Check that the shell feels consistent across themes.',
      'Check that content has enough space without making the shell feel oversized.',
    ]
  ),
  'Components/Primitives/DialogActions': doc(
    'Shared dialog-action primitives for done, cancel, and footer arrangements used across settings surfaces.',
    [
      'The common closing and confirmation affordances used in Navet dialogs.',
      'How dialog footers maintain consistent rhythm even when features vary in complexity.',
    ],
    [
      'Use this story when changing shared dialog action buttons or footer structure.',
      'Keep dialog action behavior shared here instead of letting each feature invent its own footer layout.',
    ],
    [
      'Check button hierarchy, spacing, and dismissal clarity.',
      'Check that footer actions stay easy to understand in both simple and richer dialogs.',
    ]
  ),
  'Components/Primitives/Cards/Entity/Header Icon': doc(
    'Shared entity-card header icon primitive for compact domain identity and active-state emphasis.',
    [
      'How leading card icons are framed inside the shared header area.',
      'The relationship between icon treatment, active state, and card identity.',
    ],
    [
      'Use this story when changing icon-pill sizing, framing, or active-state treatment.',
      'Keep entity-card icon behavior shared here so cards stay visually related across domains.',
    ],
    [
      'Check active and inactive readability across themes.',
      'Check that icon emphasis supports the title instead of competing with it.',
    ]
  ),
  'Components/Primitives/Cards/Entity/Header': doc(
    'Shared entity-card header primitive for titles, subtitles, identity icons, and secondary header actions.',
    [
      'How card identity and quick metadata are arranged in the top band of a card.',
      'The balance between title prominence and compact supporting context.',
    ],
    [
      'Use this story when changing card header spacing, title hierarchy, or supporting affordances.',
      'Keep header structure shared here instead of rebuilding it for each entity card family.',
    ],
    [
      'Check title scanability and subtitle clarity.',
      'Check that header controls do not crowd the entity identity area.',
    ]
  ),
  'Components/Primitives/Link': doc(
    'Shared link primitive for inline navigation and lightweight call-to-action text.',
    [
      'The baseline text-link treatment used across settings, docs, and supporting UI.',
      'How links stay readable and interactive on Navet surfaces.',
    ],
    [
      'Use this story when changing text-link styling or emphasis.',
      'Keep links shared here instead of mixing browser-default styling with feature-local overrides.',
    ],
    [
      'Check contrast, hover treatment, and focus visibility.',
      'Check that links remain distinct from ordinary body text.',
    ]
  ),
  'Components/Primitives/Alert Dialog': doc(
    'Confirmation dialog primitive for high-consequence actions that should interrupt the current flow.',
    [
      'The blocking dialog treatment used for destructive or confirmation-heavy actions.',
      'How emphasis, copy, and action hierarchy communicate caution.',
    ],
    [
      'Use this story when a flow needs confirmation strong enough to block until the user decides.',
      'Keep destructive confirmation behavior here rather than styling custom modal warnings per feature.',
    ],
    [
      'Check danger emphasis, action ordering, and readability.',
      'Check that the dialog is reserved for truly consequential actions.',
    ]
  ),
  'Components/Primitives/Dropdown Menu': doc(
    'Shared dropdown-menu wrapper for contextual action lists, nested submenus, and wider grouped mega-menu surfaces.',
    [
      'The menu shell used for compact actions as well as richer grouped destinations.',
      'How triggers, nested items, shortcuts, and larger layout variants behave inside one shared primitive.',
    ],
    [
      'Use this story when changing the shared dropdown shell, submenu behavior, or richer grouped-menu presentation.',
      'Keep contextual menu behavior here instead of rebuilding one-off floating action surfaces in each feature.',
    ],
    [
      'Check trigger clarity, focus movement, and submenu affordance.',
      'Check that the wider mega-menu example still feels lightweight and menu-like.',
    ]
  ),
  'Components/Primitives/Toast': doc(
    'Transient feedback surface for short non-blocking messages triggered by user actions.',
    [
      'How brief success or status messages are presented outside the main layout flow.',
      'The shared toast behavior used for ephemeral confirmation and feedback.',
    ],
    [
      'Use this story when changing the presentation of temporary feedback that should not block interaction.',
      'Keep one toast language here instead of spawning feature-specific transient banners.',
    ],
    [
      'Check message readability, timing, and visual intrusion.',
      'Check that important feedback stays noticeable without feeling noisy.',
    ]
  ),
  'Components/Primitives/Modal Surface': doc(
    'Shared modal-surface primitive for centered overlays that need stronger separation from the underlying UI.',
    [
      'The base framed surface used for modal dialogs and focused overlays.',
      'How modal chrome behaves across the active theme set.',
    ],
    [
      'Use this story when changing modal framing, padding, or surface tokens.',
      'Keep modal-surface treatment shared here rather than styling each overlay independently.',
    ],
    [
      'Check contrast against the backdrop and surrounding content.',
      'Check that the modal still feels part of Navet rather than a generic browser overlay.',
    ]
  ),
  'Components/Primitives/Overlay Scroll Area': doc(
    'Shared scroll-area primitive for overlay and dialog content that needs custom scroll chrome.',
    [
      'How longer overlay content scrolls without dropping back to browser-default framing.',
      'The shared treatment for scrollable modal and sheet bodies.',
    ],
    [
      'Use this story when changing scroll-area styling or overflow behavior inside overlays.',
      'Keep overlay scrolling shared here instead of restyling it separately in each dialog.',
    ],
    [
      'Check scrollbar subtlety, visibility, and pointer comfort.',
      'Check that scroll regions do not visually fight with the surrounding shell.',
    ]
  ),
  'Components/Primitives/Room Eyebrow': doc(
    'Compact room-eyebrow primitive for showing location context above or beside primary card content.',
    [
      'The lightweight location label treatment used in cards and summaries.',
      'How room context is surfaced without competing with the main title.',
    ],
    [
      'Use this story when changing room-label typography or spacing.',
      'Keep room-context styling shared here so cards stay consistent across domains.',
    ],
    [
      'Check that the eyebrow reads as supporting context rather than a second title.',
      'Check that long room names remain compact and legible.',
    ]
  ),
  'Components/Primitives/Sheet Surface': doc(
    'Shared sheet-surface primitive for edge-anchored overlays and drawer-style interaction.',
    [
      'The baseline shell used when content should slide in rather than appear as a centered modal.',
      'How sheet framing, header area, and internal spacing fit the Navet surface system.',
    ],
    [
      'Use this story when changing drawer-like overlay surfaces or header framing.',
      'Keep sheet treatment shared here instead of inventing feature-local side panels.',
    ],
    [
      'Check edge anchoring, surface contrast, and content spacing.',
      'Check that the sheet remains comfortable on touch-first hardware.',
    ]
  ),
  'Components/Primitives/Slider': doc(
    'Shared slider primitive for continuous adjustments such as brightness, volume, and numeric ranges.',
    [
      'The baseline drag interaction and track/thumb treatment for continuous controls.',
      'How sliders stay legible and touch-friendly across themes.',
    ],
    [
      'Use this story when changing shared range-control styling or interaction states.',
      'Keep slider behavior shared here rather than rebuilding it in feature code.',
    ],
    [
      'Check thumb visibility, track contrast, and drag comfort.',
      'Check that the control remains easy to use on touch devices.',
    ]
  ),
  'Components/Primitives/Stepper': doc(
    'Shared stepper primitive for progress-style sequences and short multi-step flows, including selectable workspace steps.',
    [
      'How ordered steps, active progress, and completion state are presented.',
      'Horizontal, compact, and summary-rich vertical layouts for guided Navet surfaces.',
    ],
    [
      'Use this story when changing step progression styling or hierarchy.',
      'Keep sequence indicators shared here instead of creating custom progress rows in each feature.',
    ],
    [
      'Check that current, complete, and upcoming steps are easy to distinguish.',
      'Check compact widths, disabled steps, touch targets, and keyboard focus.',
    ]
  ),
  'Components/Primitives/Surface Panel': doc(
    'Shared surface-panel primitive for lightweight framed containers that are not full cards.',
    [
      'The panel treatment used for grouped supporting content and inline framed sections.',
      'How panel surfaces relate to heavier card shells and dialog surfaces.',
    ],
    [
      'Use this story when changing supporting container surfaces or internal framing.',
      'Prefer this shared panel over ad-hoc bordered boxes in feature code.',
    ],
    [
      'Check border, padding, and contrast across themes.',
      'Check that the panel stays visually lighter than a full card shell.',
    ]
  ),
  'Cards/Theme/Accent Card Shell': doc(
    'Accent-aware shell-token reference for cards that need stronger theme-color emphasis without leaving the shared surface family.',
    [
      'How accent tinting, borders, and glow layers are applied to card shells.',
      'The shared accent treatment used instead of feature-local gradient experiments.',
    ],
    [
      'Use this story when changing accent shell emphasis or card tint behavior.',
      'Keep accent-aware shell logic shared here so neighboring cards stay in the same material family.',
    ],
    [
      'Check that accent emphasis remains readable across all themes.',
      'Check that tinted shells still feel like Navet cards rather than separate visual systems.',
    ]
  ),
  'Cards/Theme/Card Shell Surface': doc(
    'Shared card-shell surface tokens for the baseline material treatment of dashboard cards.',
    [
      'How card backgrounds, borders, and overlays are resolved for each theme.',
      'The base shell surface before domain-specific state or accent layers are added.',
    ],
    [
      'Use this story when changing core card-surface recipes.',
      'Keep shell-surface decisions shared here so card families stay visually aligned.',
    ],
    [
      'Check contrast, border clarity, and material balance across themes.',
      'Check that adjacent cards still feel like part of one coherent surface system.',
    ]
  ),
  'Cards/Theme/Card State Surface': doc(
    'State-aware card-surface token reference for semantic emphasis such as active, warning, or unavailable card states.',
    [
      'How semantic state layers modify the shared card surface without changing the overall material family.',
      'The shared treatment for state communication across different card domains.',
    ],
    [
      'Use this story when changing card-state emphasis or semantic surface layering.',
      'Keep state surfaces shared here instead of introducing feature-local warning or active treatments.',
    ],
    [
      'Check that state emphasis remains obvious without overwhelming content.',
      'Check that semantic states stay readable in both dark and light themes.',
    ]
  ),
  'Cards/Theme/Entity Icon Pill Styles': doc(
    'Reference story for the shared icon-pill styling used in entity-card headers and compact status chips.',
    [
      'How icon pills balance shape, tint, and active-state contrast.',
      'The shared visual treatment for domain identity markers across cards.',
    ],
    [
      'Use this story when changing icon-pill radius, tint, or active-state styling.',
      'Keep icon-pill behavior shared here rather than letting each card domain invent its own badge treatment.',
    ],
    [
      'Check icon readability and active-state distinction.',
      'Check that pills stay balanced beside card titles and metrics.',
    ]
  ),
  'Cards/Custom/UPS Monitor': doc(
    'Custom dashboard UPS card for power-backup health, load, runtime, and outage status at a glance.',
    [
      'How UPS state is summarized as a maintenance-focused dashboard widget.',
      'The balance between battery health, current status, and supporting electrical context.',
    ],
    [
      'Use this story when changing UPS hierarchy, outage states, or maintenance-oriented metrics.',
      'Keep UPS-specific presentation here instead of folding it into generic info-card behavior.',
    ],
    [
      'Check that normal, on-battery, low-battery, and unavailable states are unmistakable.',
      'Check that runtime and load metrics stay readable without crowding the card.',
    ]
  ),
  'Cards/Entity/Helper': doc(
    'Entity card for Home Assistant helper entities using the shared lightweight switch-style interaction model.',
    [
      'How helpers such as input booleans map into the dashboard card system.',
      'The balance between generic helper behavior and clear card identity.',
    ],
    [
      'Use this story when changing helper-card wording, hierarchy, or switch-style behavior.',
      'Keep helper treatment aligned with simple switch interactions while preserving helper identity.',
    ],
    [
      'Check that helper state is obvious at a glance.',
      'Check that the card stays lightweight and does not overcomplicate simple toggles.',
    ]
  ),
  'Cards/Entity/Summary Bar': doc(
    'Dashboard summary strip for high-priority sections such as energy, climate, security, lighting, media, and routines.',
    [
      'How important dashboard areas are condensed into a horizontal summary surface.',
      'The compact chip-like treatment used above the main dashboard content.',
    ],
    [
      'Use this story when changing section-summary labels, density, or navigation affordances.',
      'Keep summary-strip behavior shared here instead of recreating section overviews in each page.',
    ],
    [
      'Check that each section remains easy to scan and tap.',
      'Check that long labels and alert states stay readable without breaking the strip rhythm.',
    ]
  ),
  // Energy charts
  'Cards/Charts/Energy Area Chart': doc(
    'Stacked area chart for visualizing energy consumption or production over time.',
    [
      'The multi-series area chart treatment for energy data.',
      'How stacked values and time-based trends are presented.',
    ],
    [
      'Use this story when changing energy chart styling, stacking behavior, or time scale.',
      'Keep chart styling consistent across all energy visualization components.',
    ],
    [
      'Check series differentiation and legend clarity.',
      'Check that the chart remains readable with many data points.',
    ]
  ),
  'Cards/Charts/Energy Bar Chart': doc(
    'Bar chart for comparing energy values across categories or time periods.',
    [
      'The categorical comparison treatment for energy data.',
      'How bar height and color communicate relative values.',
    ],
    [
      'Use this story when changing bar chart density, spacing, or value labels.',
      'Keep bar chart styling aligned with other energy visualization components.',
    ],
    [
      'Check bar spacing and value label readability.',
      'Check that the chart works well with both few and many categories.',
    ]
  ),
  'Cards/Charts/Energy Gauge': doc(
    'Gauge visualization for showing current energy usage as a proportion of capacity.',
    [
      'The radial gauge treatment for at-a-glance energy status.',
      'How fill level and color zones communicate usage intensity.',
    ],
    [
      'Use this story when changing gauge styling, zones, or threshold indicators.',
      'Keep gauge design consistent with the broader energy visualization language.',
    ],
    [
      'Check gauge readability and zone clarity.',
      'Check that the gauge communicates status quickly without precise reading.',
    ]
  ),
  'Cards/Charts/Energy Quality Bar': doc(
    'Horizontal bar showing energy quality metrics such as efficiency or power factor.',
    [
      'The linear progress-style treatment for energy quality indicators.',
      'How fill level and color communicate quality status.',
    ],
    [
      'Use this story when changing quality bar styling or threshold markers.',
      'Keep quality bar design aligned with other energy metrics.',
    ],
    [
      'Check bar fill clarity and label positioning.',
      'Check that quality status is immediately understandable.',
    ]
  ),
  'Cards/Charts/Energy Sparkline': doc(
    'Compact line chart for showing energy trend in a small footprint.',
    [
      'The minimal line chart treatment for trend visualization.',
      'How sparklines provide context without dominating the card.',
    ],
    [
      'Use this story when changing sparkline styling or trend emphasis.',
      'Keep sparkline design consistent across all compact energy displays.',
    ],
    [
      'Check trend line visibility and smoothness.',
      'Check that the sparkline works well as a background element.',
    ]
  ),
  'Cards/Widgets/Energy Widget Shell': doc(
    'Container shell for energy dashboard widgets with consistent framing.',
    [
      'The widget container treatment for energy dashboard components.',
      'How widget shells provide consistent spacing and surface styling.',
    ],
    [
      'Use this story when changing widget shell padding, border, or surface treatment.',
      'Keep widget shell styling consistent across all energy dashboard widgets.',
    ],
    [
      'Check shell surface clarity and content spacing.',
      'Check that the shell works well with different widget content types.',
    ]
  ),
  'Cards/Widgets/Energy Consumers': doc(
    'Widget showing energy consumption breakdown by device or category.',
    [
      'The consumption list treatment for device-level energy data.',
      'How individual consumers are ranked and presented.',
    ],
    [
      'Use this story when changing consumer list density or ranking behavior.',
      'Keep consumer widget styling aligned with other energy widgets.',
    ],
    [
      'Check consumer name truncation and value alignment.',
      'Check that high-consumption devices are easy to identify.',
    ]
  ),
  'Cards/Widgets/Energy Flow': doc(
    'Widget visualizing energy flow between grid, solar, battery, and home.',
    [
      'The flow diagram treatment for energy distribution.',
      'How direction and magnitude of energy flow are communicated.',
    ],
    [
      'Use this story when changing flow visualization or animation behavior.',
      'Keep flow widget design consistent with the energy dashboard language.',
    ],
    [
      'Check flow direction clarity and value readability.',
      'Check that the flow diagram is understandable at a glance.',
    ]
  ),
  // Dashboard widgets
  'Cards/Widgets/Battery Overview Widget': doc(
    'Dashboard widget for quick battery status overview across multiple devices.',
    [
      'The compact battery summary treatment for dashboard placement.',
      'How multiple battery levels are aggregated into one widget.',
    ],
    [
      'Use this story when changing battery widget density or aggregation logic.',
      'Keep battery widget styling aligned with other dashboard widgets.',
    ],
    [
      'Check battery level visibility and low-battery emphasis.',
      'Check that the widget remains compact while showing multiple devices.',
    ]
  ),
  'Cards/Widgets/Energy Now Dashboard Widget': doc(
    'Dashboard widget showing current real-time energy usage or production.',
    [
      'The instant energy readout treatment for dashboard placement.',
      'How live power values are presented with minimal latency.',
    ],
    [
      'Use this story when changing energy widget value formatting or update behavior.',
      'Keep energy widget styling consistent with other dashboard widgets.',
    ],
    [
      'Check value readability and unit clarity.',
      'Check that the widget updates smoothly without flickering.',
    ]
  ),
  'Cards/Widgets/Photo Frame Settings': doc(
    'Settings dialog for configuring the photo frame widget source and behavior.',
    [
      'The configuration surface for photo widget customization.',
      'How image source and display options are organized.',
    ],
    [
      'Use this story when changing photo widget settings structure.',
      'Keep photo settings aligned with other widget configuration dialogs.',
    ],
    [
      'Check source selection clarity and option grouping.',
      'Check that settings are easy to understand without technical jargon.',
    ]
  ),
  // Lighting
  'Cards/Entity/Script': doc(
    'Entity card for script execution with trigger-oriented interaction.',
    [
      'The script card treatment for action-oriented entities.',
      'How script cards differ from continuous device control cards.',
    ],
    [
      'Use this story when changing script card emphasis or trigger behavior.',
      'Keep script card design distinct from stateful device cards.',
    ],
    [
      'Check that the card reads as an action trigger.',
      'Check that execution feedback is clear without being disruptive.',
    ]
  ),
  'Cards/Entity/Switch': doc(
    'Entity card for binary switch devices with simple on-off control.',
    [
      'The switch card treatment for binary device control.',
      'How on-off state is communicated without extra chrome.',
    ],
    [
      'Use this story when changing switch card layout or interaction.',
      'Keep switch card design consistent with other entity cards.',
    ],
    [
      'Check that on-off state is immediately obvious.',
      'Check that the card works well at all supported sizes.',
    ]
  ),
  // Media
  'Cards/Entity/Media': doc(
    'Entity card for media playback with transport controls and progress.',
    [
      'The media card treatment for playback control and status.',
      'How transport controls and progress are integrated into the card.',
    ],
    [
      'Use this story when changing media card layout or control placement.',
      'Keep media card design consistent with other entity cards.',
    ],
    [
      'Check playback state clarity and control accessibility.',
      'Check that progress is visible without dominating the card.',
    ]
  ),
  // Notifications
  'App Shell/Notifications/Panel': doc(
    'Notification panel for reviewing recent alerts and system messages.',
    [
      'The notification list treatment for alert review.',
      'How notifications are grouped and prioritized.',
    ],
    [
      'Use this story when changing notification panel layout or filtering.',
      'Keep notification panel design aligned with the app shell.',
    ],
    [
      'Check notification scanability and action clarity.',
      'Check that the panel handles many notifications without becoming overwhelming.',
    ]
  ),
  // Settings sections
  'Settings/Appearance Section': doc(
    'Settings section for theme, accent color, and visual appearance configuration.',
    [
      'The appearance settings treatment for theme customization.',
      'How theme options and accent colors are organized.',
    ],
    [
      'Use this story when changing appearance settings layout or options.',
      'Keep appearance settings aligned with other settings sections.',
    ],
    [
      'Check option clarity and preview visibility.',
      'Check that theme changes are immediately apparent.',
    ]
  ),
  'Settings/Dashboard Section': doc(
    'Settings section for dashboard behavior and layout preferences.',
    [
      'The dashboard settings treatment for layout and behavior options.',
      'How dashboard-specific preferences are organized.',
    ],
    [
      'Use this story when changing dashboard settings structure.',
      'Keep dashboard settings aligned with other settings sections.',
    ],
    [
      'Check setting clarity and option grouping.',
      'Check that dashboard changes are easy to preview.',
    ]
  ),
  'Settings/Interaction Section': doc(
    'Settings section for interaction preferences such as animations and haptics.',
    [
      'The interaction settings treatment for behavior customization.',
      'How animation and feedback options are organized.',
    ],
    [
      'Use this story when changing interaction settings or options.',
      'Keep interaction settings aligned with other settings sections.',
    ],
    [
      'Check option clarity and immediate feedback.',
      'Check that interaction changes are easy to understand.',
    ]
  ),
  'Settings/Localization Section': doc(
    'Settings section for language and regional preferences.',
    [
      'The localization settings treatment for language selection.',
      'How regional options such as time format and units are organized.',
    ],
    [
      'Use this story when changing localization settings or language options.',
      'Keep localization settings aligned with other settings sections.',
    ],
    [
      'Check language selector clarity and option completeness.',
      'Check that regional changes are applied consistently.',
    ]
  ),
  'Settings/Project Section': doc(
    'Settings section for project-level configuration and metadata.',
    [
      'The project settings treatment for instance-specific configuration.',
      'How project name, URL, and connection settings are organized.',
    ],
    [
      'Use this story when changing project settings structure.',
      'Keep project settings aligned with other settings sections.',
    ],
    [
      'Check field clarity and validation feedback.',
      'Check that connection settings are easy to configure.',
    ]
  ),
  'Settings/Section': doc(
    'Base settings section container for consistent section framing.',
    [
      'The section container treatment for settings organization.',
      'How sections provide consistent spacing and grouping.',
    ],
    [
      'Use this story when changing settings section container styling.',
      'Keep section container consistent across all settings pages.',
    ],
    [
      'Check section spacing and header clarity.',
      'Check that sections provide clear visual separation.',
    ]
  ),
  'Settings/System Section': doc(
    'Settings section for system-level preferences and advanced options.',
    [
      'The system settings treatment for advanced configuration.',
      'How system-level options are organized and presented.',
    ],
    [
      'Use this story when changing system settings structure.',
      'Keep system settings aligned with other settings sections.',
    ],
    [
      'Check option grouping and warning clarity.',
      'Check that advanced options are clearly marked.',
    ]
  ),
  // Dashboard
  'Dashboard/Add Card Dialog': doc(
    'Dialog for adding new cards to the dashboard with category browsing.',
    [
      'The add card dialog treatment for card selection.',
      'How card categories and options are organized.',
    ],
    [
      'Use this story when changing add card dialog layout or filtering.',
      'Keep add card dialog aligned with other dashboard dialogs.',
    ],
    [
      'Check card option scanability and category clarity.',
      'Check that the dialog handles many card types without becoming overwhelming.',
    ]
  ),
  'Dashboard/Edit Actions': doc(
    'Dashboard edit mode action cluster for layout manipulation.',
    [
      'The edit actions treatment for dashboard customization.',
      'How layout controls are organized in edit mode.',
    ],
    [
      'Use this story when changing edit mode action layout.',
      'Keep edit actions aligned with dashboard edit mode design.',
    ],
    [
      'Check action clarity and discoverability.',
      'Check that edit mode controls are distinct from normal dashboard content.',
    ]
  ),
  'Dashboard/Hero Section': doc(
    'Dashboard hero section for prominent content placement.',
    [
      'The hero section treatment for featured dashboard content.',
      'How hero sections provide visual hierarchy.',
    ],
    [
      'Use this story when changing hero section layout or styling.',
      'Keep hero section design aligned with dashboard language.',
    ],
    [
      'Check hero prominence and content framing.',
      'Check that hero sections work well with different content types.',
    ]
  ),
  'Dashboard/Onboarding Dialog': doc(
    'Onboarding dialog for first-time dashboard setup.',
    [
      'The onboarding dialog treatment for initial configuration.',
      'How setup steps are organized and presented.',
    ],
    [
      'Use this story when changing onboarding flow or step content.',
      'Keep onboarding dialog aligned with other dashboard dialogs.',
    ],
    [
      'Check step clarity and progress indication.',
      'Check that onboarding is easy to complete without being tedious.',
    ]
  ),
  'Dashboard/State Matrix': doc(
    'Matrix view of all card states for regression testing.',
    [
      'The state matrix treatment for visual regression testing.',
      'How card states are organized for comparison.',
    ],
    [
      'Use this story for visual regression testing after card changes.',
      'Keep state matrix updated with new card types and states.',
    ],
    [
      'Check state differentiation and matrix organization.',
      'Check that all card states are clearly visible.',
    ]
  ),
  'Dashboard/Extended State Matrix': doc(
    'Extended matrix view for comprehensive card state testing.',
    [
      'The extended matrix treatment for broader regression testing.',
      'How additional card variants and edge cases are included.',
    ],
    [
      'Use this story for comprehensive visual regression testing.',
      'Keep extended matrix updated with new card families.',
    ],
    ['Check matrix completeness and state coverage.', 'Check that edge cases are represented.']
  ),
  'Dashboard/Card Catalog': doc(
    'Catalog view of all available card types in the dashboard.',
    [
      'The card catalog treatment for card type inventory.',
      'How card types are organized and presented.',
    ],
    [
      'Use this story for card type reference and documentation.',
      'Keep card catalog updated with new card types.',
    ],
    [
      'Check card type organization and description clarity.',
      'Check that all card types are represented.',
    ]
  ),
  'Dashboard/All Sizes': doc(
    'Size comparison view showing cards at all supported sizes.',
    [
      'The size comparison treatment for card size reference.',
      'How card sizes are organized for comparison.',
    ],
    [
      'Use this story for card size reference and spacing validation.',
      'Keep size comparison updated with new card types.',
    ],
    [
      'Check size differentiation and spacing consistency.',
      'Check that all sizes are usable and well-proportioned.',
    ]
  ),
  'Pages/Security/Dashboard/Page': doc(
    'Complete security dashboard for monitoring alarms, cameras, locks, and openings from one calm household surface.',
    [
      'Normal, issue, snapshot-only, empty, and black-theme dashboard states.',
      'How high-severity information is prioritized without turning the whole page into an alarm state.',
    ],
    [
      'Use this story when changing security hierarchy, dashboard spacing, or cross-card status language.',
      'Review the relevant entity-card stories before changing a control that is shared with another dashboard.',
    ],
    [
      'Confirm the current security state reads immediately at dashboard distance.',
      'Confirm unavailable devices and urgent conditions remain distinct in every theme.',
    ]
  ),
  'Pages/Lights/Room first': doc(
    'Room-first lighting dashboard showing how Navet groups everyday controls around the household space people recognize.',
    [
      'Populated, empty, unavailable, non-dimmable, light-theme, and black-theme room states.',
      'The relationship between room summary, card density, and direct lighting actions.',
    ],
    [
      'Use this story when changing the lighting page composition or room-level control hierarchy.',
      'Keep examples named like real rooms and fixtures instead of backend entity identifiers.',
    ],
    [
      'Confirm the most common lighting actions remain one glance and one tap away.',
      'Confirm the grid stays legible on both wall displays and narrower touch screens.',
    ]
  ),
  'Pages/Energy/Dashboard/Page': doc(
    'Complete energy dashboard that turns live power, cost, production, storage, and history into a readable household overview.',
    [
      'Normal, loading, empty, partial-data, peak-demand, compact, light, and black-theme states.',
      'How summary metrics, charts, and flow information establish a clear reading order.',
    ],
    [
      'Use this story when changing energy-page hierarchy, responsive layout, or missing-data behavior.',
      'Validate chart-level changes in their focused stories before judging the full page.',
    ],
    [
      'Confirm units, time ranges, and cost context are unambiguous.',
      'Confirm partial provider data remains honest and useful rather than looking broken.',
    ]
  ),
  'Pages/Energy/Dashboard/Flow Map': doc(
    'Household energy-flow map connecting grid, solar, battery, and home consumption with directional context.',
    [
      'Importing, exporting, solar-surplus, battery-charging, grid-only, and partial-data flows.',
      'How direction, magnitude, labels, and reduced-motion behavior work together.',
    ],
    [
      'Use this story when changing flow semantics, connector motion, or source and destination labels.',
      'Keep color as supporting information; direction and text must carry the meaning too.',
    ],
    [
      'Confirm every flow is understandable with motion reduced.',
      'Confirm values and directions agree across all source combinations.',
    ]
  ),
  'Pages/Marketing/Hero': doc(
    'Navet website hero that introduces the product through calm household control, privacy, and immediate product context.',
    [
      'The primary promise, supporting proof, calls to action, and first product impression.',
      'How website storytelling inherits Navet typography, orange emphasis, and dark atmospheric surfaces.',
    ],
    [
      'Use this story when changing the first-screen product promise or call-to-action hierarchy.',
      'Keep claims concrete and demonstrable in the product or documentation.',
    ],
    [
      'Confirm a new visitor can explain what Navet is after one scan.',
      'Confirm the product remains the focal point rather than decorative effects.',
    ]
  ),
  'Pages/Marketing/FeatureGrid': doc(
    'Feature grid that translates Navet capabilities into recognizable household outcomes rather than a checklist of technology.',
    [
      'Feature grouping, supporting copy, icons, and responsive reading order.',
      'The balance between breadth and scanability on the website.',
    ],
    [
      'Use this story when adding or reprioritizing a product capability.',
      'Describe what the household can do before naming the implementation detail.',
    ],
    [
      'Confirm every feature is distinct and supported by the current product.',
      'Confirm the grid remains easy to skim on narrow screens.',
    ]
  ),
  'Pages/Marketing/ProductPreview': doc(
    'Website product preview that shows the real Navet dashboard language in context.',
    [
      'Dashboard framing, device examples, and the transition from marketing copy to product proof.',
      'How representative household data makes the preview credible.',
    ],
    [
      'Use this story when changing the website product mock or the examples shown inside it.',
      'Match current dashboard UI instead of inventing a parallel marketing-only interface.',
    ],
    [
      'Confirm labels and states look like real Navet data.',
      'Confirm the preview remains readable without pretending to be a fully interactive dashboard.',
    ]
  ),
  'Pages/Marketing/HouseholdChores': doc(
    'Website section presenting Household chores as a Navet-owned workspace alongside every supported provider.',
    [
      'A hands-on sample household using the product summary bar, chore, mission, and reward cards.',
      'The runtime boundary between Navet-owned chore data and connected smart-home platforms.',
    ],
    [
      'Use this story when changing how Household chores are introduced on the public website.',
      'Explain that chores, RSS feeds, photos, and notes are built-in Navet features.',
    ],
    [
      'Confirm card internals retain their product layout and completion updates summary, mission, and reward totals together.',
      'Confirm the copy does not imply provider-owned chore storage or unsupported runtime parity.',
    ]
  ),
  'Pages/Marketing/Privacy': doc(
    'Privacy section explaining Navet’s local-first approach in plain, verifiable language.',
    [
      'The privacy promise, supporting evidence, and relationship to provider connections.',
      'How reassurance is delivered without fear-based framing.',
    ],
    [
      'Use this story when changing privacy positioning or local-control explanations.',
      'Prefer specific product behavior over broad security claims.',
    ],
    [
      'Confirm claims match the current architecture and documentation.',
      'Confirm the section is understandable without smart-home infrastructure knowledge.',
    ]
  ),
  'Pages/Marketing/CurrentSupport': doc(
    'Current integration-support section setting accurate expectations about what works today.',
    [
      'Implemented providers, capability depth, and honest status language.',
      'How support breadth is communicated without implying feature parity.',
    ],
    [
      'Use this story when provider support or capability coverage changes.',
      'Keep status language synchronized with the public documentation.',
    ],
    [
      'Confirm every listed capability is currently available.',
      'Confirm planned providers cannot be mistaken for implemented support.',
    ]
  ),
  'Pages/Marketing/ThemeShowcase': doc(
    'Theme showcase demonstrating how the same Navet product language adapts across supported household appearances.',
    [
      'Dark, glass, light, and black theme framing with consistent product hierarchy.',
      'How wallpaper and accent color support rather than redefine the interface.',
    ],
    [
      'Use this story when changing website theme examples or appearance positioning.',
      'Use real theme behavior and shared tokens in every example.',
    ],
    [
      'Confirm the examples remain recognizably the same product.',
      'Confirm text and controls retain contrast across every showcased theme.',
    ]
  ),
  'Pages/Marketing/Roadmap': doc(
    'Roadmap section describing Navet’s direction while separating current capability from planned work.',
    [
      'Near-term themes, sequencing, and expectation-setting language.',
      'How future direction supports the current product story.',
    ],
    [
      'Use this story when public roadmap priorities change.',
      'Frame direction as intent unless delivery is already confirmed.',
    ],
    [
      'Confirm planned work is visibly distinct from available functionality.',
      'Confirm roadmap copy stays useful without promising dates the team cannot support.',
    ]
  ),
  'Pages/Marketing/DemoCTA': doc(
    'Closing call to action that helps visitors choose between trying Navet and reading the documentation.',
    [
      'Primary and secondary conversion paths, supporting reassurance, and end-of-page rhythm.',
      'How the CTA closes the product story without introducing a new promise.',
    ],
    [
      'Use this story when changing the website’s final action hierarchy.',
      'Keep each action label explicit about what happens next.',
    ],
    [
      'Confirm the primary path is obvious and the documentation remains easy to reach.',
      'Confirm the section stays calm and credible rather than urgent.',
    ]
  ),
};

const STORY_DOC_ALIASES: Record<string, string> = {
  'App Shell/Header/Section Customize Button': 'App Shell/Section Customize Button',
  'App Shell/Header/Section Customize Shell': 'App Shell/Section Customize Shell',
  'App Shell/Header/Notification Panel': 'App Shell/Notifications/Panel',
  'Pages/Dashboard/Add Card Dialog': 'Dashboard/Add Card Dialog',
  'Pages/Dashboard/Edit Actions': 'Dashboard/Edit Actions',
  'Pages/Dashboard/Onboarding Dialog': 'Dashboard/Onboarding Dialog',
  'Pages/Energy/Charts/Area': 'Cards/Charts/Energy Area Chart',
  'Pages/Energy/Charts/Bar': 'Cards/Charts/Energy Bar Chart',
  'Pages/Energy/Charts/Gauge': 'Cards/Charts/Energy Gauge',
  'Pages/Energy/Charts/Quality Bar': 'Cards/Charts/Energy Quality Bar',
  'Pages/Energy/Charts/Sparkline': 'Cards/Charts/Energy Sparkline',
  'Pages/Energy/Primitives/Widget Shell': 'Cards/Widgets/Energy Widget Shell',
  'Pages/Energy/Widgets/Consumers': 'Cards/Widgets/Energy Consumers',
  'Pages/Energy/Widgets/Flow': 'Cards/Widgets/Energy Flow',
  'Pages/Settings/Appearance': 'Settings/Appearance Section',
  'Pages/Settings/Dashboard': 'Settings/Dashboard Section',
  'Pages/Settings/Interaction': 'Settings/Interaction Section',
  'Pages/Settings/Localization': 'Settings/Localization Section',
  'Pages/Settings/Project': 'Settings/Project Section',
  'Pages/Settings/Section Shell': 'Settings/Section',
  'Pages/Settings/System': 'Settings/System Section',
};

export function getStoryDocsDescription(title: string) {
  const resolvedTitle = STORY_DOC_ALIASES[title] ?? title;
  return STORY_DOCS[resolvedTitle] ?? ADDITIONAL_STORY_DOCS[resolvedTitle] ?? '';
}
