# Companion panel scope and contextual editing

Research date: 2026-10-22. Design rationale for dashboard panels with optional room
overrides. The implemented ownership and editing rules are defined in the
[dashboard profile contract](../architecture/dashboard-profile-ownership.md#shared-profile).
Household usability and rendered maintainer acceptance remain pending.

## Scope model

Rooms share their Home dashboard's common panel unless the user explicitly
chooses a room override. Selecting a panel and editing the visible panel are
separate operations. This keeps shared editing accessible from the room where
content is used while making room-only content an explicit choice.

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

## Interaction tradeoffs

The current scope control identifies the dashboard panel or the named room panel
and exposes assignment separately from inline editing. Shared-edit scope must remain clear.
Hiding assignment too deeply risks discovery; a permanent full selector and
explanation add clutter. Retaining inactive room panels makes switching
reversible but requires distinguishing selection from deletion. Separate assignment
state now retains saved room configurations when switching panels. A general library
of named panels remains outside this scope.

## Validation

Ask household members to edit shared weather from Kitchen, create a Kitchen-only
panel, change the common panel from another room, and switch Kitchen back and
forth. Before each edit, ask where they expect changes to appear. Observe scope
prediction, assignment discovery and recovery of their custom panel. Include a
second saved dashboard to check that users expect it to remain independent.
