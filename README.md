<div align="center">
  <h1>
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/navet-app/navet/main/assets/public/logo-horizontal-light.svg">
      <img src="https://raw.githubusercontent.com/navet-app/navet/main/assets/public/logo-horizontal.svg" alt="Navet" width="220">
    </picture>
  </h1>

  <p><strong>A smart home dashboard for every screen.</strong></p>

  <p>
    Navet turns Home Assistant, Homey, or openHAB into a calmer, room-first interface<br>
    for everyday control across wall panels, tablets, desktops, and phones.
  </p>

  <p>
    <a href="https://demo.navet.app/"><strong>Explore the demo</strong></a>
    ·
    <a href="https://www.youtube.com/watch?v=FmdQCJASTZA">Watch the Navet teaser</a>
    ·
    <a href="https://docs.navet.app/install/">Choose an installation</a>
    ·
    <a href="https://docs.navet.app/">Read the docs</a>
  </p>

  <p>
    <a href="https://docs.navet.app/security/"><img src="https://img.shields.io/badge/local--first-self--hosted-14b8a6" alt="Local-first and self-hosted"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-f97316" alt="AGPL-3.0 license"></a>
    <a href="https://github.com/navet-app/navet/stargazers"><img src="https://img.shields.io/github/stars/navet-app/navet?style=flat" alt="GitHub stars"></a>
  </p>
</div>

![Navet Home dashboard in a tablet landscape layout](https://raw.githubusercontent.com/navet-app/navet/main/assets/reference/marketing/screenshots/navet-ipad-landscape-home.jpg)

## Everyday control without admin-screen clutter

Navet keeps live state and common actions close at hand while your connected platform remains the
source of truth. Rooms, lights, climate, media, energy, security, and routines stay easy to reach
without making every household member navigate a configuration interface.

- **Room-first control.** See what matters where it happens, then act without digging through
  entity lists.
- **Familiar across screens.** Wall panels, tablets, desktops, and phones keep the same interaction
  model while the layout adapts to each screen.
- **Local by default.** Provider data, dashboard state, and credentials stay on your device or
  server—not on Navet servers.
- **Open source.** Run it yourself, inspect the code, and help shape what comes next.

## See Navet in action

| Home at a glance | Focused energy view | Security without the noise |
|---|---|---|
| ![Navet home dashboard on an iPad](https://raw.githubusercontent.com/navet-app/navet/main/assets/reference/marketing/screenshots/navet-ipad-landscape-home.jpg) | ![Navet energy dashboard on an iPad](https://raw.githubusercontent.com/navet-app/navet/main/assets/reference/marketing/screenshots/navet-ipad-landscape-energy.jpg) | ![Navet security dashboard on an iPad](https://raw.githubusercontent.com/navet-app/navet/main/assets/reference/marketing/screenshots/navet-ipad-landscape-security.jpg) |

<div align="center">
  <a href="https://demo.navet.app/"><strong>Open the live demo →</strong></a>
</div>

## Focused controls when you need them

Open focused controls for lighting, climate, media, energy, security, and routines when your connected
platform supports them.

Shape the Home view around your household with editable layouts, dashboard profiles, widgets,
themes, wallpapers, adaptive visual effects, and localization. On larger landscape screens,
[customize a side panel](https://docs.navet.app/guide/dashboards/customize-home/#customize-the-side-panel)
with controls and information, or enable the optional
[screensaver](https://docs.navet.app/guide/dashboards/customize-home/#screensaver-mode) for idle displays.

[Household chores](https://docs.navet.app/guide/chores/) adds shared assignments, schedules, progress,
and optional rewards. With Home Assistant, manage
[shopping and to-do lists](https://docs.navet.app/guide/everyday-control/shared-lists/) and create
[calendar events](https://docs.navet.app/guide/everyday-control/calendar-events/). Explore
[history and activity](https://docs.navet.app/guide/everyday-control/history-and-activity/)
when the owning provider supplies records.

## Works with the platform you already use

| Provider | Current support | Ways to run Navet |
|---|---|---|
| **Home Assistant** | Navet's broadest integration, including advanced climate, media, camera, energy, weather, calendar, notification, task, history, security, and administration services | Custom panel via HACS, Home Assistant add-on, or standalone |
| **Homey** | Rooms, realtime entities, lights, switches, sensors, locks, covers, climate, speaker controls, Flows, Moods, people, notifications, Insights history, favorites, and app/device browsing | Standalone; optional additional provider when OAuth is configured |
| **openHAB** | Rooms, realtime entities, lights, switches, fans, climate setpoints, speaker controls, locks, covers, security sensors, batteries, and utility measurements | Standalone; optional additional provider from Settings |

Standalone Navet can retain connections to multiple supported providers and combine selected
providers in shared dashboard collections. Capabilities are not identical: Home Assistant is the
most mature integration today. Check the
[provider capability matrix](https://docs.navet.app/integrations/) before choosing a setup for
media, cameras, energy, weather, calendars, notifications, or tasks.

Hubitat and SmartThings are planned and are not supported today. Follow the
[public roadmap](https://docs.navet.app/roadmap/) for progress.

## Choose your installation

| If you use… | Start here |
|---|---|
| Home Assistant | [Choose a custom panel, add-on, or standalone installation](https://docs.navet.app/install/home-assistant/) |
| Homey | [Connect Navet through the Homey OAuth flow](https://docs.navet.app/install/homey/) |
| openHAB | [Connect Navet to your openHAB instance](https://docs.navet.app/install/openhab/) |
| A development build | [Install Navet Dev](https://docs.navet.app/install/navet-dev/) |

Not sure which route fits? [Compare every installation option](https://docs.navet.app/install/).

## Contribute to Navet

Navet is an AGPL-3.0 open-source project. Whether you want to fix a bug, improve a provider, refine
the dashboard, or document a setup, start with the [contribution guide](CONTRIBUTING.md).

```bash
git clone https://github.com/navet-app/navet.git
cd navet
pnpm install
pnpm dev
```

Prerequisites: Node.js `^20.19.0` or `>=22.12.0`, pnpm 11, and Git.

<details>
<summary><strong>Repository architecture</strong></summary>

Navet organizes shared contracts, provider adapters, and application composition into workspace
packages:

```text
packages/
  core/                       provider-neutral contracts and runtime types
  ui/                         target provider-neutral shared UI boundary
  provider-homeassistant/     Home Assistant adapter
  provider-homey/             Homey adapter
  provider-openhab/           openHAB adapter
  app/                        dashboard and app composition

apps/
  standalone/                 standalone application
  ha-panel/                   Home Assistant panel wrapper
  demo/                       public product demo
  website/                    navet.app
  docs/                       docs.navet.app
  storybook/                  shared UI review surface
```

Shared UI is authored in `packages/app/src/components/*` and exposed through
`packages/app/src/ui-kit/*`. `@navet/ui` is the target package for provider-neutral shared UI.
Read the [repository documentation map](docs/README.md) before making architecture changes.

</details>

## Project links

- [Website](https://navet.app/)
- [Live demo](https://demo.navet.app/)
- [Documentation](https://docs.navet.app/)
- [Storybook](https://storybook.navet.app/)
- [Roadmap](https://docs.navet.app/roadmap/)
- [Security policy](https://docs.navet.app/security/)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Trademark policy](docs/branding/TRADEMARK_POLICY.md)

## Disclaimers

Navet is an independent community project. It is not affiliated with, sponsored by, or endorsed
by Home Assistant, Homey, openHAB, or the organizations behind them. Use Navet at your own risk,
and review the installation and security guidance before connecting it to your home.

### AI-assisted development

AI tools support parts of Navet's design, implementation, documentation, review, and testing
workflow. They give maintainers more leverage across a complex codebase, but they do not set the
architecture or replace maintainer judgment. Human maintainers remain responsible for product
decisions, technical direction, and what is merged.

AI-assisted changes are held to the same review, testing, compatibility, and security expectations
as any other contribution. Provider-specific work must follow the relevant platform documentation
and behavior while preserving Navet's provider-neutral architecture. AI output can still be wrong;
please report anything that does not work as documented.

## License

Navet is licensed under the [GNU Affero General Public License v3.0](LICENSE). If you run a modified
version for users over a network, the AGPL requires you to make the corresponding source available
to those users. See the [terms of use](docs/TERMS_OF_USE.md) and
[trademark policy](docs/branding/TRADEMARK_POLICY.md) for details.
