# Marketing Workspace

Read this file before creating or changing community content, marketing videos, tutorials,
publication records, media plans, or campaign assets.

## Storage boundaries

The root `marketing/` directory is a local workspace and is fully ignored by Git.

Use exactly these local boundaries:

```text
marketing/
├── private/
├── planning/
│   ├── community/
│   ├── tutorials/
│   └── videos/
├── wip/
│   ├── community/<task-id>/
│   ├── tutorials/<task-id>/
│   └── videos/<task-id>/
└── deliverables/
    ├── community/<task-id>/
    ├── tutorials/<task-id>/
    └── videos/<task-id>/
```

- `planning/` contains long-lived internal backlogs and roadmaps that span multiple production
  tasks. It is ignored local state, not a Git documentation surface.
- `wip/` contains briefs, plans, scripts, drafts, raw captures, audio, render dependencies,
  intermediate exports, review frames, and temporary delivery metadata.
- `deliverables/` contains retained local masters, editable archives, captions, posters,
  checksums, final public copy, and publication receipts.
- Important masters and editable archives need durable storage outside the repository. An ignored
  local deliverable is not a backup.
- `marketing/private/` holds local publishing secrets in permission-600 files. Keep secrets
  outside task artifacts, deliverable copies, logs and screenshots.

## Git boundary

- Never stage or commit anything under the root `marketing/` directory.
- Never use `git add -f` or an ignore override for marketing workspace files.
- Never move a brief, plan, draft, review note, publication receipt, or local delivery manifest to
  another tracked directory as a workaround.
- Do not commit raw or rendered campaign-specific media.
- Do not commit credentials, tokens, private URLs, real-household captures, or local absolute paths.
- Executable workflow code, tests, and stable configuration may remain tracked under `scripts/`.
- Only reusable canonical product captures consumed by the website or public documentation belong
  in tracked `assets/reference/marketing/`.

## Task lifecycle

1. Consult the relevant `marketing/planning/<area>/` roadmap when one exists.
2. Create one direct task directory under the appropriate `marketing/wip/<area>/` directory.
3. Keep every task-specific planning and production artifact inside it.
4. Use provider-free demo data or an exact public-safe Storybook fixture for product proof.
5. Before completion, verify the final exports, checksums, captions, provenance, and public metadata.
6. Copy only retained local outputs into `marketing/deliverables/<area>/<task-id>/`.
7. Update the long-lived roadmap only when task status or ordering changed.
8. Confirm important masters have durable external storage when the task requires preservation.
9. Remove the completed task's WIP directory:

```bash
pnpm marketing:wip:clean -- --area <community|tutorials|videos> --id <task-id>
```

Cleanup applies only to the selected WIP task; retain its deliverables and long-lived roadmap.

## Publication boundary

- Publication requires one explicit approval of the shared master post, screenshot, alt text
  and intended destinations. Default to r/navet, Navet Discord #announcements and the configured
  existing Home Assistant topic. Show one post and preview; one approval covers all three.
  Adapt only platform formatting and title placement. Changes to wording or assets require fresh
  approval. Use the [community communication workflow](../../docs/engineering/request-workflows.md)
  for releases, features, tips and general Navet discussion.
- Store the final public URL, public copy, timestamps, platform status, and media checksums beside
  the local deliverable when useful.
- External-community submissions and moderation actions remain user-controlled unless the user
  explicitly authorizes the exact action.

## Completion report

Report:

- the WIP directory that was cleaned;
- the deliverables directory that was retained;
- which integrity checks passed;
- whether important masters were archived externally or remain local-only;
- any publication step that still requires user action.
