# Issue 312: chores recovery after Home Assistant restore

Research date: 2026-10-21. Checked Navet commit
`0ed6c68fa882cdbd86b0ff3ed997ffa107c1c4bc`, in the existing checkout.
Unrelated local changes were preserved. This is an investigation record, not a
production fix or evidence of acceptance on the reporter's installation.

## Assessment

[Issue 312](https://github.com/navet-app/navet/issues/312) reports a chores
corruption screen after restoring Home Assistant and an ineffective **Start over**
action. The report does not identify Navet/HA versions, deployment type, storage
contents, logs, or the failed request response. The issue was retrieved live and
had no comments at the time of investigation.

Two defects are established in current source: the frontend hides failed recovery
errors, and the Docker/add-on authority can reject recovery before reaching its
explicit damaged-management-file recovery branch. Neither establishes why the
reporter's restored chores became unreadable. A damaged management file by itself
produces `storage_unavailable`, which the frontend normally does not classify as
the corruption recovery state; reproducing the exact reported screen still needs
the reporter's versions and request evidence.

## Confirmed backend behavior

The native HA integration uses HA `Store` keys `navet.chores`,
`navet.chores.last_good`, `navet.chores.history`, `navet.chores.journal`,
`navet.chores.security`, and `navet.chores.alert_key`, with immutable
`navet.chores.chunk.<hash>` files. Initialization validates/hydrates the primary,
tries the last healthy copy, then exposes `workspace_invalid` if neither is usable.
Recovery reset accepts `action: reset` and `confirmation: RESET CHORES`; a
configured management PIN requires a valid management session. Reset writes an
empty workspace, removes history/journal/last-good/security, and collects unused
chunks. Sources: [keys and stores](https://github.com/navet-app/navet/blob/0ed6c68fa882cdbd86b0ff3ed997ffa107c1c4bc/platform/home-assistant/custom_components/navet/chore_store.py#L37-L43),
[initialization](https://github.com/navet-app/navet/blob/0ed6c68fa882cdbd86b0ff3ed997ffa107c1c4bc/platform/home-assistant/custom_components/navet/chore_store.py#L1956-L2053),
[reset](https://github.com/navet-app/navet/blob/0ed6c68fa882cdbd86b0ff3ed997ffa107c1c4bc/platform/home-assistant/custom_components/navet/chore_store.py#L2325-L2348),
[recovery handler](https://github.com/navet-app/navet/blob/0ed6c68fa882cdbd86b0ff3ed997ffa107c1c4bc/platform/home-assistant/custom_components/navet/chore_store.py#L2726-L2758).

The add-on and standalone Docker runtime use a separate NJS authority. Its files
are `/data/navet-chore-workspace.json`,
`/data/navet-chore-workspace.last-good.json`,
`/data/navet-chore-command-journal.json`, `/data/navet-chore-events.json`,
`/data/navet-chore-management.json`, and
`/data/navet-chore-workspace.json.chunk-<hash>`. It automatically tries the healthy
copy when the primary is unreadable. Recovery reset preserves the primary as
`.failed-<timestamp>`, removes the four sidecars, and writes empty state.
Sources: [paths](https://github.com/navet-app/navet/blob/0ed6c68fa882cdbd86b0ff3ed997ffa107c1c4bc/docker/njs/chore-store.js#L18-L23),
[load](https://github.com/navet-app/navet/blob/0ed6c68fa882cdbd86b0ff3ed997ffa107c1c4bc/docker/njs/chore-store.js#L3192-L3243),
[recovery](https://github.com/navet-app/navet/blob/0ed6c68fa882cdbd86b0ff3ed997ffa107c1c4bc/docker/njs/chore-store.js#L3611-L3685).

### Reproduced NJS recovery obstruction

Every request calls `rebindManagementSecurityToAuthorizedTenant` before route
dispatch, including `POST /__navet_chores__/recovery`. That function reads and
parses the management file without tolerating malformed JSON. Consequently, a
damaged management file throws before `recoverWorkspace` can run its own intended
fallback, which permits reset when the management file cannot be read. The outer
handler returns HTTP 503 with `reason: storage_unavailable` and
`pinConfigured: false`. Sources:
[pre-dispatch call](https://github.com/navet-app/navet/blob/0ed6c68fa882cdbd86b0ff3ed997ffa107c1c4bc/docker/njs/chore-store.js#L3936-L3955),
[rebind](https://github.com/navet-app/navet/blob/0ed6c68fa882cdbd86b0ff3ed997ffa107c1c4bc/docker/njs/chore-store.js#L3302-L3328),
[intended recovery tolerance](https://github.com/navet-app/navet/blob/0ed6c68fa882cdbd86b0ff3ed997ffa107c1c4bc/docker/njs/chore-store.js#L3631-L3645),
[error response](https://github.com/navet-app/navet/blob/0ed6c68fa882cdbd86b0ff3ed997ffa107c1c4bc/docker/njs/chore-store.js#L4081-L4100).

Reproduction used a temporary sibling copy of the existing
`packages/app/src/services/__tests__/chore-store.test.ts` harness, then removed
that temporary file. Append this case using its existing helpers:

```ts
it('issue 312 research reproduces malformed management recovery block', () => {
  const mockFs = createMockFs();
  mockFs.writeFileSync(CHORE_PATH, '{');
  mockFs.writeFileSync('/data/navet-chore-management.json', '{');
  choreStore.setChoreStoreFsForTests(mockFs);
  choreStore.setChoreStorePrincipalResolverForTests(() => PRINCIPAL);
  const request = () => createRequest({
    method: 'POST', uri: '/__navet_chores__/recovery',
    requestText: JSON.stringify({ action: 'reset', confirmation: 'RESET CHORES' }),
  });
  const failed = request();
  choreStore.handle(failed);
  expect(failed.return).toHaveBeenCalledWith(503, expect.any(String));
  expect(parseResponse(failed)).toMatchObject({
    recovery: { pinConfigured: false, reason: 'storage_unavailable' },
  });
  expect(mockFs.getFile(CHORE_PATH)).toBe('{');
  mockFs.unlinkSync('/data/navet-chore-management.json');
  const retry = request();
  choreStore.handle(retry);
  expect(retry.return).toHaveBeenCalledWith(200, expect.any(String));
});
```

Command: `pnpm exec vitest --config vitest.unit.config.ts --project unit-browser --run packages/app/src/services/__tests__/issue-312-research.test.ts -t 'issue 312 research'`.
Result: **1 passed, 93 skipped**. This is a source-level mock-filesystem
reproduction; native nginx/NJS and a restored household installation remain
unverified.

## Frontend recovery feedback

Recovery sets the workspace status to `loading`, which unmounts the unavailable
view and its dialog. A rejected recovery records an error and returns to the
unavailable view, whose static description does not display the error. This
explains how a failed backend request can appear to do nothing. The recovery UI
does include a PIN unlock flow; the need to unlock after restart is not itself a
proven defect. Sources: [store recovery](https://github.com/navet-app/navet/blob/0ed6c68fa882cdbd86b0ff3ed997ffa107c1c4bc/packages/app/src/features/chores/chore-workspace-store.ts#L404),
[view selection](https://github.com/navet-app/navet/blob/0ed6c68fa882cdbd86b0ff3ed997ffa107c1c4bc/packages/app/src/features/chores/components/household-section.tsx#L688).
Existing frontend checks passed **46 tests** using
`pnpm test --run packages/app/src/features/chores/chore-workspace-store.test.ts packages/app/src/services/__tests__/chore-workspace.service.test.ts`.

## Recovery paths and what SSH can access

First establish whether this is the native custom integration or the add-on.
Their data locations differ; removing browser storage cannot reset either durable
authority. Preserve the current files before troubleshooting, and stop the owning
runtime before moving storage so its scheduler cannot write concurrently.

- **Native HA integration:** files are in `<HA configuration directory>/.storage/`,
  normally `/config/.storage/` on HA OS. Move the exact `navet.chores` file and all
  `navet.chores.*` files together to a backup directory outside `.storage`, then
  start HA for an intentional full chores reset. Moving only the primary can
  restore the last-good copy instead of clearing chores. This discards chores,
  profiles, PIN, history and points from active storage; retain the backup for
  investigation. Never move unrelated `.storage` files. HA source establishes
  [Store.path](https://github.com/home-assistant/core/blob/dev/homeassistant/helpers/storage.py#L318-L321)
  and [.storage](https://github.com/home-assistant/core/blob/dev/homeassistant/helpers/storage.py#L37);
  official docs explain [configuration location](https://www.home-assistant.io/docs/configuration/#to-find-the-configuration-directory)
  and [HA OS shell controls](https://www.home-assistant.io/common-tasks/os/).
- **Add-on:** the files above are in the Navet app container's private `/data`.
  The configured `addon_config:rw` mapping does not make that directory equivalent
  to the HA configuration folder; startup uses `/data` directly and has no storage
  symlink. Ordinary Terminal/SSH access to `/config` is therefore insufficient to
  prescribe the same reset path. Identify the actual app storage mount and access
  method before providing commands; a suitable full add-on backup or confirmed
  host/container access is needed. Sources: [mapping](../../platform/home-assistant/addons/navet/config.yaml),
  [startup](https://github.com/navet-app/navet/blob/0ed6c68fa882cdbd86b0ff3ed997ffa107c1c4bc/platform/home-assistant/addons/navet/run.sh#L35).
- **Standalone Docker:** `/data` is mounted from `navet-data` in the supplied
  [Compose file](https://github.com/navet-app/navet/blob/0ed6c68fa882cdbd86b0ff3ed997ffa107c1c4bc/docker-compose.yml#L13). Stop Navet and move only the
  listed chores files/chunks to a retained backup using that volume's actual
  mount/access method. Preserve dashboard workspace, installation keys, setup
  data and provider credentials.

For an intentional file-level reset of NJS storage, moving all listed chores
files/chunks together prevents old sidecars from surviving. If attempting repair
instead, preserve the primary, healthy copy and every referenced chunk as a set;
do not hand-edit the compressed envelope or drop missing accounting chunks.
These operational paths are code-derived, not verified on the reporter's device.

## Regression gaps and next evidence

The existing HA unrecoverable-primary reset regression passes:
`python3 -m unittest discover -s platform/home-assistant/tests -p test_chore_store.py -k 'unrecoverable_primary'`
(**1 passed**). It covers schema-invalid data with no configured PIN and uses an
in-memory HA Store fake, not HA's on-disk envelope or restore process. The NJS
existing unreadable-workspace reset case also has no damaged management sidecar.
Sources: [HA case](https://github.com/navet-app/navet/blob/0ed6c68fa882cdbd86b0ff3ed997ffa107c1c4bc/platform/home-assistant/tests/test_chore_store.py#L2551),
[Store fake](https://github.com/navet-app/navet/blob/0ed6c68fa882cdbd86b0ff3ed997ffa107c1c4bc/platform/home-assistant/tests/test_chore_store.py#L31),
[NJS case](https://github.com/navet-app/navet/blob/0ed6c68fa882cdbd86b0ff3ed997ffa107c1c4bc/packages/app/src/services/__tests__/chore-store.test.ts#L1721).

A selected fix should cover malformed-management-file reset through the full
dispatcher, preserve PIN authorization when the security file is valid, and make
failed recovery visible without silently losing dialog state. Frontend acceptance
needs a submitted failure case; the existing recovery story only opens its dialog
and the store recovery test covers success.

Before naming the reporter's root cause, obtain deployment/version details, the
failed recovery HTTP/WebSocket response and HA/Navet logs. Inspect retained
storage privately, including file existence, permissions, schema/envelope validity
and missing chunk references. A partial/inconsistent restore, malformed storage,
missing chunks, unsupported schema, or storage-write failure are hypotheses only.
No production code, external issue comment, release, or household acceptance was
performed by this investigation.
