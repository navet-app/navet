# Companion panel scope and contextual editing

Research date: 2026-10-22. UX recommendation; the editing flow below is a proposal,
not a description of verified implementation.

## Scope model

Keep one common companion panel per saved dashboard, with optional room-specific
panels. Home uses that dashboard's common panel. Rooms use it by default; Energy,
Security and other feature sections also use it initially. A separately saved
dashboard owns its own common panel. Avoid another inheritance layer between
dashboards until repeated maintenance becomes an observed problem.

**Editing follows the panel currently displayed, wherever the user is.** Opening
Customize in Kitchen while viewing the dashboard panel edits that shared panel
normally. Navigation location determines which panel is shown; it does not
restrict where shared content can be edited. Selecting a different panel and
editing the visible panel are separate operations.

## Evidence from primary sources

- **Shared editing can start where content is used.** WordPress 7.0 documents
  an Edit original action on synced patterns. It opens an isolated editor with
  navigation back to the originating document; changes apply globally. This
  supports access from the use site with explicit shared scope, rather than a
  privileged Home location. Its isolated editor does not establish that Navet
  should add an editor layer or use identical inline controls.
  [WordPress: pattern editing in 7.0](https://make.wordpress.org/core/2026/03/15/pattern-editing-in-wordpress-7-0/)
- **Copying and inheriting differ.** Figma documents that detaching retains
  current layers and properties, removes the component link and stops future
  updates from that component. This is a useful analogy for starting a room
  panel from the common panel; it does not imply Navet needs component-level
  override machinery.
  [Figma: detach an instance](https://help.figma.com/hc/en-us/articles/360038665754-Detach-an-instance-from-the-component)
- **Secondary configuration can be disclosed on demand.** NN/g recommends
  keeping primary tasks visible and deferring specialized options, while making
  their entry points discoverable. This supports keeping normal editing
  prominent and room assignment secondary. It is design guidance, not a Navet
  usability result.
  [NN/g: progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)
- **Supporting information can follow context.** Android defines supporting
  panes as contextual information or tools alongside primary content. It does
  not require a unique panel for every destination.
  [Android: supporting pane](https://developer.android.com/develop/adaptive-apps/guides/build-a-supporting-pane-layout)
- **Dashboard and local defaults can coexist.** Home Assistant defines views
  as tabs within dashboards and documents background precedence from view to
  dashboard to theme. This is precedent for explicit local fallback, not evidence
  of companion-panel behavior or preferred household scope.
  [Home Assistant: views](https://www.home-assistant.io/dashboards/views/)

These sources establish patterns and tradeoffs. They contain no comparative
household study demonstrating the best companion-panel design for Navet.

## Recommended interaction

These are Navet design inferences, to validate with users:

1. Enter Customize from any room. Keep existing inline content controls
   available for the visible panel. Shared edits update Home and every room
   using that dashboard panel; room-panel edits affect that room only.
2. In edit mode, show one compact scope control: **Dashboard panel** or
   **Kitchen panel**, with the room's actual name. For shared content, a short
   hint says **Changes apply wherever this dashboard panel is used.** Keep
   scope available during editing; avoid repeated confirmation for routine edits.
3. Opening that control reveals panel assignment. In a room using the common
   panel, offer **Create room panel**. Copy the visible common panel as an
   independent starting point and continue editing there. Identify the copy as
   room-only; subsequent common-panel edits do not update it.
4. If a room panel already exists, offer **Use dashboard panel** or **Use room
   panel**. Switching changes assignment and retains the inactive room panel.
   Deleting that saved room panel is a separate explicit action, with
   confirmation explaining the loss. An intentionally empty custom panel stays
   empty rather than falling back to shared content.

This keeps familiar editing immediate, but shared-edit scope must remain clear.
Hiding assignment too deeply risks discovery; a permanent full selector and
explanation add clutter. Retaining inactive room panels makes switching
reversible but requires distinguishing selection from deletion. This proposal
needs separate assignment state: existing behavior currently deletes a room
configuration when returning to the dashboard panel. Compatibility must preserve
existing configurations; a general library of named panels is unnecessary here.

## Validation

Ask household members to edit shared weather from Kitchen, create a Kitchen-only
panel, change the common panel from another room, and switch Kitchen back and
forth. Before each edit, ask where they expect changes to appear. Observe scope
prediction, assignment discovery and recovery of their custom panel. Include a
second saved dashboard to check that users expect it to remain independent.
