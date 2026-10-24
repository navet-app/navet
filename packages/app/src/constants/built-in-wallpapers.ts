import generatedWallpaperManifest from '@assets/public/wallpapers/generated/manifest.json';
import { getPublicAssetUrl } from '@navet/app/utils/public-assets';
import { getSolidWallpaper } from './solid-wallpapers';

export const BUILT_IN_WALLPAPER_IDS = [
  'aurora-haze-01',
  'aurora-haze-02',
  'aurora-haze-03',
  'aurora-haze-04',
  'cinematic-glow-01',
  'cinematic-glow-02',
  'cinematic-glow-03',
  'cinematic-glow-04',
  'cinematic-glow-05',
  'nocturne-01',
  'nocturne-02',
  'nocturne-03',
  'nocturne-04',
  'nocturne-05',
  'nocturne-06',
  'nocturne-07',
] as const;

export type BuiltInWallpaperId = (typeof BUILT_IN_WALLPAPER_IDS)[number];
export type BuiltInWallpaperToken = `builtin:${BuiltInWallpaperId}`;

export interface BuiltInWallpaperDescriptor {
  id: BuiltInWallpaperId;
  token: BuiltInWallpaperToken;
  avifSrc: string;
  webpSrc: string;
  width: number;
  height: number;
}

export type WallpaperPreviewSources =
  | {
      kind: 'builtin';
      token: BuiltInWallpaperToken;
      avifSrc: string;
      webpSrc: string;
      imgSrc: string;
    }
  | {
      kind: 'custom';
      imgSrc: string;
    };

interface GeneratedWallpaperManifestEntry {
  id: string;
  avifSrc: string;
  webpSrc: string;
  width: number;
  height: number;
}

interface GeneratedWallpaperManifest {
  wallpapers: GeneratedWallpaperManifestEntry[];
}

const generatedManifest = generatedWallpaperManifest as GeneratedWallpaperManifest;

const BUILT_IN_WALLPAPER_ID_SET = new Set<string>(BUILT_IN_WALLPAPER_IDS);

export function toBuiltInWallpaperToken(id: BuiltInWallpaperId): BuiltInWallpaperToken {
  return `builtin:${id}`;
}

function resolveManifestAssetSrc(src: string) {
  return getPublicAssetUrl(src.replace(/^\/+/, ''));
}

const manifestEntriesById = new Map(
  generatedManifest.wallpapers.map((entry) => [entry.id, entry] as const)
);
const missingManifestIds = BUILT_IN_WALLPAPER_IDS.filter((id) => !manifestEntriesById.has(id));

if (missingManifestIds.length > 0) {
  throw new Error(
    `Missing generated wallpaper manifest entries for: ${missingManifestIds.join(', ')}`
  );
}

export const BUILT_IN_WALLPAPERS = Object.freeze(
  BUILT_IN_WALLPAPER_IDS.map((id) => {
    const entry = manifestEntriesById.get(id);

    if (!entry) {
      throw new Error(`Missing generated wallpaper manifest entry for "${id}".`);
    }

    return {
      id,
      token: toBuiltInWallpaperToken(id),
      avifSrc: resolveManifestAssetSrc(entry.avifSrc),
      webpSrc: resolveManifestAssetSrc(entry.webpSrc),
      width: entry.width,
      height: entry.height,
    } satisfies BuiltInWallpaperDescriptor;
  })
);

const builtInWallpapersById = new Map(
  BUILT_IN_WALLPAPERS.map((wallpaper) => [wallpaper.id, wallpaper] as const)
);
const builtInWallpapersByToken = new Map(
  BUILT_IN_WALLPAPERS.map((wallpaper) => [wallpaper.token, wallpaper] as const)
);

const LEGACY_BUILT_IN_WALLPAPER_IDS = [
  'soft-dark-gradient',
  'frosted-glass-abstract',
  'blurred-forest-mood',
  'luxury-living-room-ambient',
  'matte-concrete-texture',
  'muted-nebula-space',
  'scandinavian-warm-neutral',
  'subtle-smart-grid',
  'pure-oled-black-luxury',
  'dynamic-sunrise-gradient',
] as const;

const LEGACY_BUILT_IN_WALLPAPER_ID_MAP = Object.freeze(
  LEGACY_BUILT_IN_WALLPAPER_IDS.reduce<Record<string, BuiltInWallpaperId>>(
    (map, legacyId, index) => {
      map[legacyId] = BUILT_IN_WALLPAPERS[index]?.id ?? BUILT_IN_WALLPAPERS[0].id;
      return map;
    },
    {}
  )
);

export const LEGACY_BUILT_IN_WALLPAPER_MAP = Object.freeze(
  Object.entries(LEGACY_BUILT_IN_WALLPAPER_ID_MAP).reduce<Record<string, BuiltInWallpaperToken>>(
    (map, [legacyId, nextId]) => {
      const token = toBuiltInWallpaperToken(nextId);
      map[`preset:${legacyId}`] = token;
      map[`/wallpapers/${legacyId}.svg`] = token;
      map[getPublicAssetUrl(`wallpapers/${legacyId}.svg`)] = token;
      return map;
    },
    {}
  )
);

function extractWallpaperPath(pathname: string) {
  const wallpaperPathStart = pathname.indexOf('/wallpapers/');
  if (wallpaperPathStart === -1) {
    return null;
  }

  return pathname.slice(wallpaperPathStart);
}

function resolveBuiltInWallpaperIdFromAssetPath(pathname: string): BuiltInWallpaperId | null {
  const wallpaperPath = extractWallpaperPath(pathname);
  if (!wallpaperPath) {
    return null;
  }

  const legacyToken = LEGACY_BUILT_IN_WALLPAPER_MAP[wallpaperPath];
  if (legacyToken) {
    return legacyToken.slice('builtin:'.length) as BuiltInWallpaperId;
  }

  const match = wallpaperPath.match(
    /^\/wallpapers(?:\/generated)?\/([a-z0-9-]+)\.(?:svg|png|jpe?g|webp|avif)$/i
  );

  if (!match) {
    return null;
  }

  const candidateId = match[1];
  if (BUILT_IN_WALLPAPER_ID_SET.has(candidateId)) {
    return candidateId as BuiltInWallpaperId;
  }

  const legacyId = LEGACY_BUILT_IN_WALLPAPER_ID_MAP[candidateId];
  return legacyId ?? null;
}

export function isBuiltInWallpaperToken(
  value: string | null | undefined
): value is BuiltInWallpaperToken {
  if (!value?.startsWith('builtin:')) {
    return false;
  }

  return builtInWallpapersByToken.has(value as BuiltInWallpaperToken);
}

export function resolveBuiltInWallpaperToken(
  value: string | null | undefined
): BuiltInWallpaperToken | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (isBuiltInWallpaperToken(trimmed)) {
    return trimmed;
  }

  const legacyToken = LEGACY_BUILT_IN_WALLPAPER_MAP[trimmed];
  if (legacyToken) {
    return legacyToken;
  }

  const directPathId = resolveBuiltInWallpaperIdFromAssetPath(trimmed);
  if (directPathId) {
    return toBuiltInWallpaperToken(directPathId);
  }

  if (typeof window !== 'undefined') {
    try {
      const resolved = new URL(trimmed, window.location.href);
      if (resolved.origin === window.location.origin) {
        const builtInId = resolveBuiltInWallpaperIdFromAssetPath(resolved.pathname);
        if (builtInId) {
          return toBuiltInWallpaperToken(builtInId);
        }
      }
    } catch {
      return null;
    }
  }

  return null;
}

export function resolveBuiltInWallpaperDescriptor(
  value: BuiltInWallpaperId | BuiltInWallpaperToken
): BuiltInWallpaperDescriptor | null {
  if (isBuiltInWallpaperToken(value)) {
    return builtInWallpapersByToken.get(value) ?? null;
  }

  return builtInWallpapersById.get(value) ?? null;
}

function escapeCssUrl(url: string) {
  return url.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

export function resolveWallpaperBackgroundImage(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const solid = getSolidWallpaper(trimmed);
  if (solid) return `linear-gradient(${solid.color}, ${solid.color})`;
  const builtInToken = resolveBuiltInWallpaperToken(trimmed);
  if (!builtInToken) {
    return `url("${escapeCssUrl(trimmed)}")`;
  }

  const descriptor = resolveBuiltInWallpaperDescriptor(builtInToken);
  if (!descriptor) {
    return null;
  }

  return `image-set(url("${escapeCssUrl(descriptor.avifSrc)}") type("image/avif") 1x, url("${escapeCssUrl(descriptor.webpSrc)}") type("image/webp") 1x)`;
}

export function resolveWallpaperPreviewSources(
  value: string | null | undefined
): WallpaperPreviewSources | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (getSolidWallpaper(trimmed)) return null;
  const builtInToken = resolveBuiltInWallpaperToken(trimmed);
  if (!builtInToken) {
    return {
      kind: 'custom',
      imgSrc: trimmed,
    };
  }

  const descriptor = resolveBuiltInWallpaperDescriptor(builtInToken);
  if (!descriptor) {
    return null;
  }

  return {
    kind: 'builtin',
    token: descriptor.token,
    avifSrc: descriptor.avifSrc,
    webpSrc: descriptor.webpSrc,
    imgSrc: descriptor.webpSrc,
  };
}
