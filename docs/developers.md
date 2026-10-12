---
title: Developers
description: Contribute to Navet and understand where shared and provider-specific work belongs.
editUrl: https://github.com/navet-app/navet/edit/main/docs/developers.md
---

Navet is organized as a pnpm workspace with deployable applications under `apps/` and product,
provider, core, and UI packages under `packages/`.

## Set up the repository

Use the [contributing guide](/developers/contributing/) for prerequisites, local development, and
validation expectations.

Maintainers can also send selected issues through Navet's
[agentic development workflow](/developers/agentic-development/).

## Architecture direction

- `@navet/core` owns provider-neutral contracts, IDs, and runtime semantics.
- `@navet/ui` is the target boundary for provider-neutral shared React UI.
- Provider packages own provider authentication, transport, mapping, and command translation.
- `@navet/app` owns product composition, runtime selection, settings, and persistence.

Home Assistant is the reference adapter. Shared work depends on Navet-owned contracts.

The app can retain multiple implemented provider sessions and aggregate selected provider
collections. Each adapter declares the services and controls it supports; see the
[capability matrix](/integrations/) when implementing or documenting a shared feature.

Detailed maintainer, architecture, testing, release, and AI-agent documents remain available in the
[repository documentation](https://github.com/navet-app/navet/tree/main/docs).
