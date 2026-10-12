# Agent composition recipes

Start card work with the canonical foundations, primitives, patterns and same-family feature
references in the source catalog. Name the real imports and executable Storybook reference before
coding. Reuse existing slots, sizes, states and theme helpers. A new visual pattern needs explicit
maintainer approval before implementation.

Discover editable compositions by family and intended behavior through shadcn MCP or **Concepts / UI Kit Recipes**.
Check catalog level, owner and review status. Building blocks explain controls and layout; product
compositions reuse a specific feature. Inspect current contracts, context and states, then review
the executable example and same-family reference. Only maintainer-approved product compositions
establish accepted design guidance. See the [registry workflow](REGISTRY.md) for authoring,
review status, local commands and matching hosted evidence.

When no accepted recipe fits, follow the reference-first sequence below and record the coverage
gap. Existing feature UI takes precedence over a generic building-block example. Features own
capabilities, provider routing, validation and persistence; templates use Navet's app authoring seams.

## Select a composition

| Intended behavior | Starting composition | Source example and review targets |
| --- | --- | --- |
| Compact device controls | `BaseCard` with its `title`, `header` or `actionRow` slots | [BaseCard](../../packages/app/src/components/primitives/base-card.stories.tsx): all supported sizes, long names, active/inactive and unavailable behavior. Keep one primary control path. |
| Controls with secondary configuration | Card variant of `BaseCardDialog`, `navigation="overflow"`, controls tab first | [Controls-first dialog](../../packages/app/src/components/patterns/card-dialog-overflow-menu.stories.tsx): More actions, edit name/room, secondary section, Back to controls, close/reopen. |
| Mobile detail or command sheet | `SheetSurface` directly containing `SheetSurfaceHeader` and body | [Sheet surface](../../packages/app/src/components/primitives/sheet-surface.stories.tsx): open on a phone, dismissal, scroll, long content and desktop visibility. |
| Sidebar-to-detail navigation | `NavigationWorkspace.Frame` with its named parts; catalog query: `NavigationWorkspace.Frame` | [Navigation workspace](../../packages/app/src/components/patterns/navigation-workspace.stories.tsx): frame context, labeled navigation, `aria-current`, explicit sidebar/detail grid and owned scroll regions. The namespace is a composition object. |
| Settings form | Existing settings-dialog shell; `FieldBlock` around control primitives | [Field states](../../packages/app/src/components/patterns/field-block.stories.tsx): hint, required, error and disabled. Inspect a neighboring feature's settings dialog for save and cancellation behavior. |
| Dashboard summary | Existing feature summary inside the shared dashboard layout | [Dashboard guidance](../product/dashboard-principles.md) and the nearest summary implementation: reading order, condensed/expanded presentation and no-data behavior. |
| Empty card or section | `CardEmptyState` inside `BaseCard`; `DashboardEmptyState` for sections | [Card empty states](../../packages/app/src/components/patterns/card-empty-state.stories.tsx) and [dashboard empty states](../../packages/app/src/components/patterns/dashboard-empty-state.stories.tsx): small/large sizes, optional action, no matches versus unconfigured content. |
| Unavailable device | Existing entity-card unavailable composition with normalized state | [Vacuum states](../../packages/app/src/features/vacuum/components/vacuum-card/entity-card-vacuum.stories.tsx): unavailable and missing data. Inspect the actual target device family; unavailable is distinct from empty or switched off. |

Use `@navet/app/ui-kit/primitives` and `@navet/app/ui-kit/patterns` for these imports. The
source-derived catalog records the import actually exported by each entrypoint. Source links
describe the composition; the running Storybook index supplies current story IDs.

## Controls-first dialog

`BaseCardDialog` moves focus inside on opening and restores its connected opener on dismissal.
With `disableOpenAutoFocus`, focus lands on the dialog container so form inputs are not selected
automatically. Tab and Shift+Tab remain within the modal; Escape closes it. A caller-supplied close
focus handler takes precedence, and a downstream dialog retains focus.


Choose one `BaseCardDialog` union variant. The card variant takes `tabs`; the modal, sheet and
fullscreen variants have different contracts. The overflow menu is owned by the card dialog.

Use the [controls-first-dialog template](../../packages/app/src/composition-recipes/overlays/controls-first-dialog/template.tsx)
and inspect its executable story under **Concepts / Composition recipes / Building blocks**.

Connect entity controls to Navet-owned state and commands routed to their owning provider. Use the
existing device editor for persisted name/room changes; this skeleton only composes supplied
content. Verify tab order, keyboard dismissal, focus containment and return, overflow navigation,
and reopened state. Record actual findings rather than assuming the shared shell proves them.

## Navigation and selection contracts

`NavigationWorkspace` exports named parts such as `Frame` and `Item`; render those members rather
than the namespace object. Query `pnpm agent:components NavigationWorkspace.Frame` for the frame
contract or `pnpm agent:components NavigationWorkspace` for the cataloged workspace exports.
Query `pnpm agent:components NavigationWorkspace.ScrollArea` for the member props, source and
story references. `ScrollArea` is available as `NavigationWorkspace.ScrollArea`; inspect its definition in
[the workspace source](../../packages/app/src/components/patterns/navigation-workspace.tsx).
It accepts div attributes and supplies full-height vertical scrolling, overscroll containment and
touch panning. The caller must provide a bounded-height region; it does not create a scroll landmark
or manage focus. The frame provides app theme-derived context to grouped surfaces,
headers, sidebar and rows. Callers own responsive column layout, the labeled navigation landmark,
selection callbacks and `aria-current`. `Item`'s `active` prop controls visual state; provide an
`ItemButton` with a meaningful name and navigation behavior. `Content` renders a main region, so
choose its placement with the page's existing main landmark in mind. The source story uses an
explicit detail scroll region rather than relying on the frame to scroll.

The existing `Tabs` contract requires `defaultValue`, including in controlled compositions, and
supplies selection context and generated IDs. Each `TabTrigger` value links to its `TabPanel`.
Tab enters the selected trigger. Left/Right Arrow moves focus and automatically selects the next
enabled sibling, skips disabled triggers and wraps at either end. Direction follows the rendered
text direction. Tab then leaves the tablist through native focus navigation. Caller key handlers
can prevent the default navigation; controlled compositions must update their value in response
to `onValueChange`. Verify the consumer's panel focus path and callback effects.
`preserveLayout` retains an inactive panel's geometry while making it invisible and inert.

`PortalActionDock` is a named modal action overlay. Its first enabled action receives focus,
Tab/Shift+Tab remain inside, and Escape or outside dismissal closes it. Pass `returnFocusTo` when
opening from a control whose focus may change before mounting. Dismissal restores a connected
opener unless a selected action has already moved focus to its next dialog or destination.

`CardDialogTabList` is a layout wrapper and `CardDialogTabTrigger` is a controlled pill; they do not
supply the `Tabs` context or linked panel semantics. Choose the actual interaction contract required
by the composition. For controls-first device dialogs, the existing overflow recipe supplies
secondary navigation and the return path.

Dialog close actions require the surrounding Radix dialog context. The card dialog's
`onCloseAutoFocus` callback lets the controls-first template return focus to its supplied launch-button
ref. Closing a dialog does not save settings. Keep persistence and save-error handling in the
feature's existing workflow. When using
`CardDialogHeader`, an entity ID can enable entity-name persistence through app administration;
use its callback contract deliberately and route entities to their owning provider.

## Sheet header and body

Use the [detail-sheet template](../../packages/app/src/composition-recipes/overlays/detail-sheet/template.tsx)
and inspect its executable story under **Concepts / Composition recipes / Building blocks**.

Attach the template's `returnFocusRef` to its launch button. The localized close label reaches both
the shell and its direct-child header. The header owns its chrome spacing. Apply body spacing to the
body composition, not an extra wrapper around the header. Default sheets are mobile-only; use
`responsive` when the same focused detail surface is intentionally available on desktop. Inspect
both behaviors in a rendered preview.

## Form messaging

`FieldBlock` supplies visible label, hint and error layout. Associate the input ID with `htmlFor`,
use `Input`'s `invalid` prop, and associate descriptive text explicitly. A `required` indicator on
the wrapper does not set the control's native requirement.

Use the [settings-field template](../../packages/app/src/composition-recipes/forms/settings-field/template.tsx)
and inspect its executable story under **Concepts / Composition recipes / Building blocks**.

`useId` gives each field instance its own label and message associations. The caller owns validation,
save, cancellation and persistence; pair this field with the existing settings workflow rather than
adding a separate save mechanism.

## Empty card with an optional action

Keep the card shell and empty-state pattern together. The caller owns card dimensions and the
configuration workflow. Supply both `actionLabel` and `onAction` for an action; omit them when
there is no supported destination. Import icons explicitly. Storybook test helpers belong only
in test stories, while a product caller supplies its own handler.

Use the [empty-card template](../../packages/app/src/composition-recipes/card/empty-card/template.tsx)
and inspect its executable story under **Concepts / Composition recipes / Building blocks**.

Review the existing small and large/no-action stories before adapting the pattern to another
card. Template stories exercise composition and API compatibility; provider configuration, saved choices
and other card sizes need their own journey evidence. Product copy follows the feature's existing
translation workflow.

## Compact device card

Use the [Switch card adapter](../../packages/app/src/composition-recipes/devices/compact-device-card/template.tsx)
for the existing Navet switch family. Review **Cards / Entity / Switch** at the same size and state.
The feature controller retains identity, power controls, metrics, capabilities, commands and persisted
appearance. Other device families need their own existing feature reference. This product recipe
awaits maintainer design acceptance; it is not a generic template for sensors, lights or other devices.

## Evidence for a UI approval package

Record the selected recipe, source contract, current commit and actual story IDs. Review realistic
data, the relevant sizes, touch and keyboard behavior, reduced motion and all four themes: glass,
dark, light and black. Include empty, unavailable, error and permission states where applicable.
Run relevant checks on the changed surface and direct consumers of modified shared components.
Use the [UX handoff rules](../../ai/skills/navet-ux.md#review-before-handoff) for maintainer visual
comparison. State which cases were inspected and which remain outstanding.
