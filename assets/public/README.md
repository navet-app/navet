# Navet Public Assets

This folder contains Navet's public logos, install icons, social-preview asset, web manifest, and
small runtime bootstrap/fallback files. Brand guidance applies to the logo, font, and social assets;
`config.js`, `boot-i18n.js`, `offline.html`, and `site.webmanifest` are application runtime files.

Use the [visual identity guide](../../docs/branding/VISUAL_IDENTITY.md#space-and-size) for logo
placement, clear space and size; the [asset system](../../docs/branding/ASSET_SYSTEM.md) owns exports.

## Files

### Logos

- **logo.svg** (120x120) - Square logo for general use
- **logo-horizontal.svg** (200x60) - Horizontal logo with text (dark text)
- **logo-horizontal-light.svg** (200x60) - Horizontal logo with text (white text)

### Favicons

- **favicon.svg** (32x32) - Modern SVG favicon for web browsers
- **favicon-32x32.svg** (32x32) - Alternative 32px favicon
- **apple-touch-icon.svg** (180x180) - Rounded compatibility preview of the install icon
- **apple-touch-icon.png** (180x180) - Rasterized iOS home screen icon
- **pwa-192.png** - PWA install icon referenced by the web manifest as 192x192
- **pwa-512.png** - Large PWA install icon referenced by the web manifest as 512x512
- **pwa-maskable-192.png** / **pwa-maskable-512.png** - Full-bleed maskable install icons

### Social Preview

- **navet-social-card.jpg** - Open Graph and social-link preview image

### Typography

- **fonts/inter/** - Self-hosted Latin and Latin-extended variable Inter webfont subsets,
  shared stylesheet, and the upstream SIL Open Font License 1.1. The subset binaries come from
  Fontsource's open-source font-files distribution of Inter.
- Keep the font license file with redistributed font files. Navet's code license does not replace the font
  license.

### Runtime Files

- **config.js** - deployment/runtime configuration bootstrap
- **boot-i18n.js** - localized boot and loading messages
- **boot-i18n.d.ts** and **boot-i18n.test.ts** - type surface and regression coverage for the boot
  catalog
- **offline.html** - PWA offline fallback
- **site.webmanifest** - canonical install metadata consumed by the standalone PWA build

## Generation and validation

Do not edit raster outputs by hand. From the repository root:

```bash
pnpm brand:generate
pnpm check:brand
```

The source/output contract is in [`../brand/source/asset-manifest.json`](../brand/source/asset-manifest.json).

## License

These logo files are **not** covered by the repository code license.

They are governed by Navet brand usage rules:

- [../../docs/branding/README.md](../../docs/branding/README.md)
- [../../docs/branding/ASSET_SYSTEM.md](../../docs/branding/ASSET_SYSTEM.md)
- [../../docs/branding/TRADEMARK_POLICY.md](../../docs/branding/TRADEMARK_POLICY.md)
