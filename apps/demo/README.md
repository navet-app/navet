# Demo Workspace

This workspace builds the public Navet demo at `https://demo.navet.app`.

The sample home includes fan direction and oscillation, advanced Main floor climate controls,
linked Kitchen island helpers, and a configured UPS monitor. Named rooms contain household devices
and readings: laundry and UPS in Basement, bathroom ventilation and floor heating, bedroom comfort
controls, an office workspace, and outdoor security. Room cards share provider-backed sample state
with the rest of the demo. Numbered Demo Rooms exercise navigation with placeholder cards.
Home edit mode exposes sample
entities and content card templates through Add card. Controls and widget settings update local
sample state; reloading restores the demo defaults.

**Settings → Dashboard → Maintenance → Entity visibility** starts with three hidden sample
entities: weather, Guest mode, and living-room temperature. Use **Restore entities** to restore them
individually or choose **Restore all**. Reload the demo to try again.

## Local commands

- `pnpm demo:dev`
- `pnpm build:demo`

## Cloudflare Pages

- project root: `apps/demo`
- build command: `pnpm --dir ../.. build:demo`
- output directory: `dist`
- production branch: `main`
- custom domain: `demo.navet.app`
- environment variable: `NODE_VERSION=22`; use the pnpm version pinned in root `package.json`

The production build uses `/` as its Vite base because the demo is deployed at the root of its own
origin. The demo contains sample data only and must not include real provider credentials.
