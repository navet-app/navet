# Rollback

Navet release rollback is artifact-based. Do not rely on `latest` as the rollback mechanism.

## Docker

Prefer exact image tags in production:

- `ghcr.io/awesomestvi/navet:v0.x.y`
- or a pinned image digest

Rollback options:

1. change the deployed image tag back to the previous known-good release
2. redeploy the previous digest if your environment pins digests
3. restart the container after the image change

Example:

```yaml
services:
  navet:
    image: ghcr.io/awesomestvi/navet:v0.18.7
    volumes:
      - navet-data:/data

volumes:
  navet-data:
```

Keep the same named volume and Compose project when rolling backward or forward. Never use
`docker compose down -v` for a normal rollback because it deletes Navet's credential sessions,
dashboard profile, device preferences, and chores workspace.

Use the selected release's `navet-release-evidence.json` asset to identify the published image
digest and source commit. The [release workflow](release-workflow.md#container-registry) owns image
namespaces; source repository moves do not change these image paths.
Standalone stable and beta/RC image tags include the leading `v`; add-on image versions omit it.
Navet Dev uses its exact published development image tag instead.

## Home Assistant Add-on

Rollback the add-on by moving back to the previous published release image for the matching
architecture.

If the repository metadata or UI still points at a newer version, use the previous GitHub release
to identify the earlier exact add-on image tag and redeploy that version explicitly.

## Home Assistant Custom Panel

Rollback by reinstalling the previous GitHub release custom panel asset bundle.

Because release workflows build the panel assets per tag, the authoritative rollback point is the
earlier release tag and its attached artifact, not the current `main` branch tip.

## Demo, Storybook, Docs, Website

These sites deploy from `main` through their own Cloudflare Pages projects.

If a Cloudflare Pages deployment must be reverted, roll back the affected Pages project to its
earlier known-good deployment. The marketing website, demo, Storybook, and docs are independent
projects even though they build from the same connected branch.

## Operator Guidance

- keep a record of the last known-good stable tag
- prefer exact Docker tags or digests in production setups
- verify Home Assistant ingress, panel, and add-on behavior after every rollback
- update release notes or follow-up docs if users need a public rollback recommendation
