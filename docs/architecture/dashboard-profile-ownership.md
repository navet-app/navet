# Dashboard Profile Ownership

Navet treats a dashboard installation, a signed-in account, a browser or wall panel, and an
authentication session as different owners. They must not share one undifferentiated local-storage
or server file.

## Identity Layers

| Layer | Example | Owns |
|---|---|---|
| Installation workspace | Navet on a Raspberry Pi | Shared dashboard collection, default dashboard, client assignments, revisions, history, and registered clients |
| Provider account | A Home Assistant user | Language, units, notification visibility, and interaction preference |
| Dashboard client | Kitchen panel or Vishal's phone | Browser-local identity, display preset, kiosk/panel mode, keep-awake, local density, effects quality, and camera transport preference |
| Credential session | One browser's Home Assistant OAuth grant | Access and refresh tokens for that browser only |

A dashboard client has a random browser-local ID and a user-editable display name. Those values are
useful for activity attribution, but they are not authentication. The profile server separately
issues an opaque, `HttpOnly`, same-site browser binding and stores only that binding beside the
client registry record. Device preference lookup and client-record mutation use the server-issued
binding; changing `X-Navet-Client-Id` cannot select another browser's preferences. The private
binding is never included in client-list responses.

The server accepts user attribution only from server-controlled identity data. Today that means
trusted Home Assistant Ingress headers; standalone OAuth sessions remain intentionally
unattributed because their token response does not contain a server-verifiable Home Assistant user
ID. The server never trusts a caller-supplied user ID.

Device preferences are keyed by the durable browser binding, not by the replaceable OAuth session,
so signing in again does not turn the same panel into a new device. The public client ID remains in
preference documents and revision metadata as a label. A browser can forget only its own bound
client record; Navet does not expose remote client deletion because a client list is not an
authorization mechanism. Forgetting removes registry metadata and saved device preferences, but
does not alter revision history, sign the dashboard out, or revoke provider credentials.

Legacy registry and preference records did not contain a browser binding. On upgrade, the first
authenticated browser presenting a legacy client ID claims that record and its saved preferences.
This one-time trust-on-first-use migration preserves existing wall-panel settings; eliminating that
window requires an explicit pairing or recovery flow.

The registry and bound client-preference collection each retain at most 200 browser records, and
each preference collection is capped at 4 MiB. Registry clients idle for 90 days are removed
together with their bound or legacy preference record. When all 200 clients are still active, a
new browser receives a retryable `client-capacity-reached` response; Navet does not evict an active
wall panel or mislabel capacity as a binding mismatch, so the browser keeps its client identity and
retries with the normal sync backoff. Workspace, state, history, registry, bootstrap, profile, and
preference files are size-checked before synchronous reads so damaged or oversized storage cannot
stall the single Nginx worker or be silently overwritten.

## Shared Profile

The installation has one revisioned shared profile. It contains the household-facing dashboard
collection: named Home dashboards, their order, the workspace default, and assignments from
registered dashboard-client IDs to dashboard IDs. Each dashboard owns its Home card membership,
room-navigation scope, layout, sections, card sizes, custom-card instances, zone assignments, and
companion-panel camera/weather selections and security-status visibility. Companion selections
stay the same between rooms and can differ between Home dashboards. The panel’s enabled and
collapsed states are device preferences; enabling, disabling, opening or collapsing it never writes
the shared dashboard profile.
Theme, room organization, weather presentation defaults, and shared custom actions that pass export
security filtering remain workspace-wide. Camera transport and presentation preferences remain
device-owned because panel capabilities differ.

Opening a dashboard is not an assignment. A direct link has the highest priority for that
navigation, followed by a browser-session preview, the workspace assignment for that dashboard
client, the workspace default, and finally the first valid dashboard. Preview state is
session-local and never enters the shared profile. Assignments are convenience defaults, not
authorization boundaries.

Remote assignment changes are applied only at a safe Home navigation point. Navet defers the
switch while the client is editing or a blocking customization surface is open, so shared profile
sync cannot interrupt a drag or in-progress form.

The server stores:

- installation and workspace identity
- a monotonically increasing revision
- the client and authenticated principal that produced the revision
- changed JSON paths
- a bounded recoverable history
- an explicit reset marker

Clients write against the revision they loaded. A stale write receives a precondition failure
instead of silently replacing a newer dashboard.

The production Nginx runtime uses one event-driven worker because the local profile store performs
its revision check and atomic file replacement synchronously. This keeps concurrent browser writes
serialized without reducing the number of WebSocket or HTTP connections the worker can serve.

The workspace is also bound to the Home Assistant tenant that enrolled it. The server stores an
opaque tenant ID in the credential session; the raw URL is not stored in profile documents or
returned to clients. Each tenant has isolated profile, history, preference, and client files. The
legacy unsuffixed files remain assigned to their enrolled tenant so upgrades preserve existing
dashboard data.

A connection URL is not a canonical Home Assistant installation identity. Changing it starts a
fresh OAuth grant at the candidate route. Navet then presents only that candidate token to the
previously trusted route. Acceptance proves that the routes reach the same Home Assistant and
preserves the tenant ID. Rejection or an unreachable old route keeps the candidate under a tenant
ID derived from its normalized route, preventing an unverified server from reading another home's
workspace.

The profile workspace binds on first authenticated use. Home Assistant itself authenticates every
standalone connection, so entering a new address proceeds directly to its OAuth login. A different
installation receives an isolated tenant workspace. `NAVET_HASS_URL` optionally pins the upstream
used for token exchange and API traffic.

## Reconciliation

Every active tab keeps the last server revision and profile generation that it observed as its
in-memory merge base. A generation change invalidates that ancestry.

Browser lifecycle timing and command sequencing are shared by the non-React dashboard sync
runtime. Profile and preference modules retain their separate reconciliation policies, while the
runtime owns named timers, visibility and connectivity events, disposal, and latest-only refresh
lanes. A queued newer refresh replaces an obsolete queued refresh instead of overlapping remote
I/O.

Merge bases are not persisted to shared browser storage: another tab must never advance a tab's
ancestry behind its back. A reload or duplicated tab therefore starts without a merge base. It
uses the explicit conflict flow only when its configured local profile cannot be proven clean;
this prevents real offline edits from being discarded without treating every stale device as a
competing editor.

The browser may persist a credential-free clean-state receipt containing the workspace, revision,
and a fingerprint of the last profile it successfully applied or saved. The receipt never contains
the profile itself and is not merge ancestry. It only lets a reloaded client prove that its current
local state has not changed since that acknowledged revision before applying a newer server profile.

1. A clean client applies a newer remote revision in place and shows a short attributed update.
2. Independent local and remote fields are merged automatically and saved as a new revision.
3. Only overlapping fields produce a conflict choice.
4. **Keep mine** rebases the local fields over the latest remote revision and carries that choice
   across stale-write retries until the compare-and-swap succeeds. The intent is bound to its
   installation, workspace, and profile generation; edits made while a retry is in flight are
   folded into the next attempt.
5. **Load remote** discards the pending local fields and applies the server revision.

Dashboard definitions reconcile by stable dashboard ID. Changes under different
`dashboardsById/<id>` paths and changes to different client-assignment keys are independent;
deleting a dashboard and remapping its assignments is one shared-profile mutation.

An empty server is not automatically destructive. An uninitialized workspace may be seeded from a
configured local dashboard. An explicit reset or a missing profile without a reset marker preserves
local state and exposes recovery/history instead of clearing the browser.

## Preferences And Secrets

Settings use one exhaustive classification:

- `shared`: serialized in the shared profile
- `account`: stored in an authenticated account preference document when the runtime provides a
  server-verifiable user identity
- `device`: stored in a client preference document and kept locally on that browser
- `secret`: never exported or copied to another client
- `legacy` or `ephemeral`: migration/runtime-only values

Standalone Home Assistant OAuth does not include a user identity in its token response. Home
Assistant exposes the current user through its authenticated WebSocket protocol, but the standalone
Nginx session runtime has no server-side WebSocket client. Navet therefore keeps standalone
`userId` and `userName` unset instead of trusting a browser assertion. Account preference endpoints
are unavailable in standalone mode; account-classified settings stay local, while the
shared household profile syncs between authenticated standalone clients. Add-on Ingress may
sync account preferences because Supervisor supplies the verified `X-Remote-User-*` identity.

Credential-bearing URLs, raw camera stream URLs, usernames, email addresses, and provider tokens
are excluded from the shared profile.

### Display profiles

Device settings are independent by default. Changing kiosk mode or visual quality on a phone must
not write the shared dashboard profile and must not change a wall panel or development browser.
Navet offers two explicit ways to coordinate the safe display subset:

- **Copy to devices** is a one-time server-side copy into the selected clients' durable device
  preference records. The devices remain independent after the copy.
- **Linked display profiles** are named policies such as `Wall displays`. Assigning clients to a
  policy makes later changes to the allowed display settings propagate between only those linked
  clients. Removing an assignment returns that client to independent behavior without deleting its
  current settings.

The link policy has its own revision and compare-and-swap endpoint. It is deliberately separate
from dashboard collection revisions and from each client's preference revision, so display policy
management cannot make a dashboard save stale. Assignments use public client IDs for UI and are
remapped when the server recognizes the same durable browser binding under a rotated client ID.
Forgetting a device also removes its linked-profile assignment.

Only allowlisted non-secret presentation settings can be copied or linked. Visual-quality
automatic detection remains local to each device unless the user explicitly chooses a quality in
the linked policy; camera URLs, provider credentials, language, and account preferences never enter
this domain. The custom-panel deployment stays local-only because it has no profile-store endpoint.

These controls use the same authenticated workspace authority as dashboard editing. They are a
coordination feature, not a device-management authorization boundary; Internet-facing deployments
still require the access controls described below.

## Deployment Modes

- Standalone Docker and development use a per-browser opaque `HttpOnly` cookie. The OAuth state,
  callback, refresh token, access token, and proxy requests are bound to that one server session.
- Standalone Home Assistant enrollment uses OAuth. An optional `NAVET_HASS_URL` pin sets the
  upstream for token exchange and API traffic; the browser authorization address must reach the
  same installation. Homey uses OAuth, and openHAB uses its base URL and credentials.
- Home Assistant add-on Ingress may use the official `X-Remote-User-*` identity headers only in the
  explicit Ingress handler.
- The Home Assistant custom panel has no Navet profile-store endpoint. Its dashboard collection and
  client assignment remain local-only until a provider-owned server persistence seam exists.

The normal standalone profile route never trusts Ingress headers and never accepts anonymous
profile access.

Keep provider-native authentication enabled, preserve `/data`, use HTTPS, and place externally
reachable standalone deployments behind appropriate network or reverse-proxy access control. openHAB credential
verification is rate-limited per direct source, but that throttle remains defense-in-depth.
