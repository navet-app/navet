# Navet Home Assistant Panel

This custom integration registers Navet as a Home Assistant sidebar panel.
This directory is the canonical source exported to `navet-app/navet-home-assistant`.
Release export assembles the generated `frontend/` bundle in the HACS repository payload.

## Install With HACS

1. Add `https://github.com/navet-app/navet-home-assistant` as a HACS custom repository with
   category `Integration`.
2. Download `Navet`.
3. Restart Home Assistant.
4. Add the `Navet` integration from `Settings -> Devices & services`.
5. Open Navet from the Home Assistant sidebar.

## Current Behavior

- registers the `/navet` panel
- serves bundled assets from `/api/navet/static/`
- loads `navet-panel.js`
- also exposes `navet-ha-shell.js` for `frontend.extra_module_url` host-shell integration
- uses the current Home Assistant frontend session

## Development

Generate the publishable HACS repository payload from the repo root with:

```bash
pnpm sync:hacs
```

That command builds the current panel bundle first, then exports the publishable HACS payload into
`../navet-hacs` for local review.
