import { fetchMediaThumbnailDataUrl } from '@navet/app/features/media/utils/media-thumbnail';
import { LruCache } from '@navet/app/utils/lru-cache';
import { sanitizeImageUrl } from '@navet/app/utils/url-security';
import type { HomeAssistantResourceResolver } from '../resources/resource-resolver';
import type { ResolvedMediaResource } from '../resources/resource-types';
import type { HomeAssistantHttpGateway } from '../transport/http-gateway';

const OBJECT_URL_TTL_MS = 5 * 60_000;
const NEGATIVE_CACHE_TTL_MS = 45_000;
const CACHE_ARTWORK_SIZE = 512;
const MUSICBRAINZ_LOOKUP_TTL_MS = 12 * 60 * 60_000;
const MUSICBRAINZ_LOOKUP_LIMIT = 5;
const THUMBNAIL_LOOKUP_TIMEOUT_MS = 1_200;
const COVER_ART_ARCHIVE_THUMBNAIL_SIZE = 500;
const MUSICBRAINZ_API_URL = 'https://musicbrainz.org/ws/2/release';
const COVER_ART_ARCHIVE_RELEASE_URL = 'https://coverartarchive.org/release';
const COVER_ART_ARCHIVE_RELEASE_GROUP_URL = 'https://coverartarchive.org/release-group';
const OBJECT_URL_CACHE_MAX_ENTRIES = 32;
const LOOKUP_CACHE_MAX_ENTRIES = 128;
const NEGATIVE_CACHE_MAX_ENTRIES = 128;

interface ObjectUrlEntry {
  expiresAt: number;
  url: string;
}

interface LookupCacheEntry {
  expiresAt: number;
  resource: ResolvedMediaResource | null;
}

interface MusicBrainzRelease {
  id?: string;
  title?: string;
  status?: string;
  disambiguation?: string;
  country?: string;
  score?: number | string;
  media?: Array<{ format?: string | null }>;
  'artist-credit'?: Array<{
    name?: string;
    artist?: {
      name?: string;
    };
  }>;
  'release-group'?: {
    id?: string;
    title?: string;
    'primary-type'?: string;
  };
}

interface MusicBrainzReleaseSearchResponse {
  releases?: MusicBrainzRelease[];
}

function isCanvas2DContext(
  context: OffscreenCanvasRenderingContext2D | RenderingContext | null
): context is CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  return Boolean(context && 'drawImage' in context);
}

async function cropImageToSquareBlob(blob: Blob): Promise<Blob | null> {
  if (!blob.type.startsWith('image/')) {
    return null;
  }

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      const width = bitmap.width;
      const height = bitmap.height;
      const squareSize = Math.min(width, height);
      if (Number.isFinite(squareSize) && squareSize > 0) {
        const x = Math.max(0, Math.floor((width - squareSize) / 2));
        const y = Math.max(0, Math.floor((height - squareSize) / 2));
        const canvas =
          typeof OffscreenCanvas !== 'undefined'
            ? new OffscreenCanvas(squareSize, squareSize)
            : document.createElement('canvas');
        canvas.width = squareSize;
        canvas.height = squareSize;
        const context = canvas.getContext('2d');
        if (isCanvas2DContext(context)) {
          context.drawImage(bitmap, x, y, squareSize, squareSize, 0, 0, squareSize, squareSize);
          bitmap.close();
          if ('convertToBlob' in canvas) {
            return await canvas.convertToBlob({
              type: blob.type || 'image/jpeg',
              quality: 0.92,
            });
          }

          return await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, blob.type || 'image/jpeg', 0.92);
          });
        }
      }
      bitmap.close();
      return null;
    } catch {
      return null;
    }
  }

  if (typeof Image === 'undefined') {
    return null;
  }

  const sourceUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.decoding = 'async';
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error('image decode failed'));
      nextImage.src = sourceUrl;
    });

    const squareSize = Math.min(image.naturalWidth, image.naturalHeight);
    if (squareSize <= 0) {
      return null;
    }

    const x = Math.max(0, Math.floor((image.naturalWidth - squareSize) / 2));
    const y = Math.max(0, Math.floor((image.naturalHeight - squareSize) / 2));
    const canvas = document.createElement('canvas');
    canvas.width = squareSize;
    canvas.height = squareSize;

    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }

    context.drawImage(image, x, y, squareSize, squareSize, 0, 0, squareSize, squareSize);

    const croppedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, blob.type || 'image/jpeg', 0.92);
    });

    return croppedBlob;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function isRenderableImageBlob(blob: Blob): Promise<boolean> {
  if (!blob.type.startsWith('image/')) {
    return false;
  }

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      bitmap.close();
      return true;
    } catch {
      return false;
    }
  }

  if (typeof Image === 'undefined') {
    return true;
  }

  const previewUrl = URL.createObjectURL(blob);

  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('image decode failed'));
      image.src = previewUrl;
    });
    return true;
  } catch {
    return false;
  } finally {
    URL.revokeObjectURL(previewUrl);
  }
}

function normalizeCacheArtworkUrl(rawUrl: string) {
  if (!rawUrl.includes('{')) {
    return rawUrl;
  }

  if (rawUrl.includes('/{w}x{h}bb.{f}')) {
    return rawUrl.replace('/{w}x{h}bb.{f}', `/${CACHE_ARTWORK_SIZE}x${CACHE_ARTWORK_SIZE}bb.png`);
  }

  return rawUrl
    .replaceAll('{w}', String(CACHE_ARTWORK_SIZE))
    .replaceAll('{h}', String(CACHE_ARTWORK_SIZE))
    .replaceAll('{f}', 'png');
}

function extractMediaProxyCacheArtworkUrl(picture?: string) {
  if (!picture?.includes('/api/media_player_proxy/')) {
    return null;
  }

  try {
    const parsed = new URL(picture, 'http://navet.local');
    const cacheUrl = parsed.searchParams.get('cache');
    if (!cacheUrl?.startsWith('http://') && !cacheUrl?.startsWith('https://')) {
      return null;
    }

    return normalizeCacheArtworkUrl(cacheUrl);
  } catch {
    return null;
  }
}

function extractMediaProxyCacheValue(picture?: string) {
  if (!picture?.includes('/api/media_player_proxy/')) {
    return null;
  }

  try {
    const parsed = new URL(picture, 'http://navet.local');
    return parsed.searchParams.get('cache');
  } catch {
    return null;
  }
}

function isSameOriginMediaProxyUrl(resourceUrl?: string | null) {
  if (!resourceUrl) {
    return false;
  }

  return (
    resourceUrl.startsWith('/api/media_player_proxy/') ||
    resourceUrl.startsWith('/__navet_ha_proxy__/api/media_player_proxy/') ||
    resourceUrl.includes('/__navet_ha_proxy__/api/media_player_proxy/') ||
    resourceUrl.includes('/api/media_player_proxy/')
  );
}

function extractYouTubeMusicArtworkUrl(attrs: Record<string, unknown>) {
  const appName = typeof attrs.app_name === 'string' ? attrs.app_name : '';
  const mediaContentId =
    typeof attrs.media_content_id === 'string' ? attrs.media_content_id.trim() : '';

  if (!appName.toLowerCase().includes('youtube') || !mediaContentId) {
    return null;
  }

  if (!/^[A-Za-z0-9_-]{6,}$/.test(mediaContentId)) {
    return null;
  }

  return `https://i.ytimg.com/vi/${mediaContentId}/hqdefault.jpg`;
}

function normalizeMusicMetadataValue(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function stripEditionSuffixes(value: string) {
  return value
    .replace(/\((?:[^)]*(?:deluxe|remaster|version|edition|expanded|bonus)[^)]*)\)/gi, '')
    .replace(/\[(?:[^\]]*(?:deluxe|remaster|version|edition|expanded|bonus)[^\]]*)\]/gi, '')
    .replace(/\s+-\s+(?:remaster(?:ed)?|deluxe edition|expanded edition).*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function getMetadataString(attrs: Record<string, unknown>, key: string) {
  const value = attrs[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

function buildMusicBrainzLookupKey(attrs: Record<string, unknown>) {
  const artist = getMetadataString(attrs, 'media_artist');
  const album = getMetadataString(attrs, 'media_album_name');
  const title = getMetadataString(attrs, 'media_title');

  const primary = album || title;
  if (!artist || !primary) {
    return null;
  }

  return [artist, primary, album ? title : ''].map(normalizeMusicMetadataValue).join('::');
}

function escapeMusicBrainzQueryValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildMusicBrainzSearchUrls(attrs: Record<string, unknown>) {
  const artist = getMetadataString(attrs, 'media_artist');
  const album = getMetadataString(attrs, 'media_album_name');
  const title = getMetadataString(attrs, 'media_title');

  if (!artist) {
    return [];
  }

  const queries = new Set<string>();
  const albumCandidates = [album, stripEditionSuffixes(album)].filter(Boolean);

  for (const albumCandidate of albumCandidates) {
    queries.add(
      `release:"${escapeMusicBrainzQueryValue(albumCandidate)}" AND artist:"${escapeMusicBrainzQueryValue(artist)}"`
    );
    if (title) {
      queries.add(
        `release:"${escapeMusicBrainzQueryValue(albumCandidate)}" AND artist:"${escapeMusicBrainzQueryValue(artist)}" AND recording:"${escapeMusicBrainzQueryValue(title)}"`
      );
    }
  }

  if (!album && title) {
    queries.add(
      `recording:"${escapeMusicBrainzQueryValue(title)}" AND artist:"${escapeMusicBrainzQueryValue(artist)}"`
    );
  }

  return [...queries].map((query) => {
    const url = new URL(MUSICBRAINZ_API_URL);
    url.searchParams.set('query', query);
    url.searchParams.set('fmt', 'json');
    url.searchParams.set('limit', String(MUSICBRAINZ_LOOKUP_LIMIT));
    return url.toString();
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => resolve(null), timeoutMs);
    void promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch(() => {
        window.clearTimeout(timeoutId);
        resolve(null);
      });
  });
}

function shouldPreferMetadataFallback(picture: string | undefined, attrs: Record<string, unknown>) {
  const cacheValue = extractMediaProxyCacheValue(picture);
  if (!cacheValue) {
    return false;
  }

  const appName = getMetadataString(attrs, 'app_name').toLowerCase();
  const hasOpaqueCacheKey = /^[a-f0-9]{8,}$/i.test(cacheValue);
  return hasOpaqueCacheKey && appName.includes('youtube');
}

function scoreMusicBrainzRelease(release: MusicBrainzRelease, attrs: Record<string, unknown>) {
  const album = normalizeMusicMetadataValue(getMetadataString(attrs, 'media_album_name'));
  const artist = normalizeMusicMetadataValue(getMetadataString(attrs, 'media_artist'));
  const title = normalizeMusicMetadataValue(getMetadataString(attrs, 'media_title'));
  const releaseTitle = normalizeMusicMetadataValue(release.title ?? '');
  const releaseGroupTitle = normalizeMusicMetadataValue(release['release-group']?.title ?? '');
  const creditedArtists = (release['artist-credit'] ?? [])
    .flatMap((entry) => [entry.name ?? '', entry.artist?.name ?? ''])
    .map(normalizeMusicMetadataValue)
    .filter(Boolean);

  let score =
    typeof release.score === 'string' ? Number.parseInt(release.score, 10) : (release.score ?? 0);

  if (releaseTitle === album) {
    score += 100;
  } else if (releaseGroupTitle === album) {
    score += 80;
  }

  if (creditedArtists.includes(artist)) {
    score += 60;
  }

  if (release.status === 'Official') {
    score += 20;
  }

  if (release['release-group']?.['primary-type'] === 'Album') {
    score += 15;
  }

  if (release.media?.some((medium) => medium.format === 'Digital Media')) {
    score += 10;
  }

  if (title && release.disambiguation) {
    const disambiguation = normalizeMusicMetadataValue(release.disambiguation);
    if (disambiguation.includes('remaster')) {
      score -= 5;
    }
  }

  return score;
}

export class MediaArtworkService {
  private objectUrlCache = new LruCache<string, ObjectUrlEntry>(
    OBJECT_URL_CACHE_MAX_ENTRIES,
    (entry) => URL.revokeObjectURL(entry.url)
  );
  private lookupCache = new LruCache<string, LookupCacheEntry>(LOOKUP_CACHE_MAX_ENTRIES);
  private negativeCache = new LruCache<string, number>(NEGATIVE_CACHE_MAX_ENTRIES);

  constructor(
    private resolver: HomeAssistantResourceResolver,
    private httpGateway: HomeAssistantHttpGateway
  ) {}

  private evictExpiredEntries() {
    const now = Date.now();

    for (const [key, entry] of this.objectUrlCache.entries()) {
      if (entry.expiresAt >= now) {
        continue;
      }

      this.objectUrlCache.delete(key);
    }

    for (const [key, expiresAt] of this.negativeCache.entries()) {
      if (expiresAt < now) {
        this.negativeCache.delete(key);
      }
    }

    for (const [key, entry] of this.lookupCache.entries()) {
      if (entry.expiresAt < now) {
        this.lookupCache.delete(key);
      }
    }
  }

  private async resolveCacheArtworkFallback(
    fingerprint: string,
    picture?: string
  ): Promise<ResolvedMediaResource | null> {
    const fallbackUrl = extractMediaProxyCacheArtworkUrl(picture);
    if (!fallbackUrl) {
      return null;
    }

    const safeFallbackUrl = sanitizeImageUrl(fallbackUrl);
    if (!safeFallbackUrl) {
      return null;
    }

    return {
      id: safeFallbackUrl,
      kind: 'image',
      url: safeFallbackUrl,
      cacheKey: fingerprint,
      authStrategy: 'none',
      metadata: {
        source: 'media_proxy_cache_fallback',
      },
    };
  }

  private resolveHeuristicArtworkFallback(
    fingerprint: string,
    attrs: Record<string, unknown>
  ): ResolvedMediaResource | null {
    const fallbackUrl = extractYouTubeMusicArtworkUrl(attrs);
    if (!fallbackUrl) {
      return null;
    }

    const safeFallbackUrl = sanitizeImageUrl(fallbackUrl);
    if (!safeFallbackUrl) {
      return null;
    }

    return {
      id: safeFallbackUrl,
      kind: 'image',
      url: safeFallbackUrl,
      cacheKey: fingerprint,
      authStrategy: 'none',
      metadata: {
        source: 'youtube_music_artwork_fallback',
      },
    };
  }

  private async resolveYouTubeArtworkFallback(
    fingerprint: string,
    attrs: Record<string, unknown>
  ): Promise<ResolvedMediaResource | null> {
    const fallback = this.resolveHeuristicArtworkFallback(fingerprint, attrs);
    if (!fallback?.url) {
      return null;
    }

    try {
      const response = await fetch(fallback.url, {
        cache: 'force-cache',
      });
      if (!response.ok) {
        return fallback;
      }

      const blob = await response.blob();
      const normalizedBlob = (await cropImageToSquareBlob(blob)) ?? blob;
      if (!(await isRenderableImageBlob(normalizedBlob))) {
        return fallback;
      }

      const objectUrl = URL.createObjectURL(normalizedBlob);
      this.objectUrlCache.set(fingerprint, {
        url: objectUrl,
        expiresAt: Date.now() + OBJECT_URL_TTL_MS,
      });

      return {
        ...fallback,
        url: objectUrl,
        metadata: {
          ...fallback.metadata,
          mimeType: normalizedBlob.type,
          source: 'youtube_music_artwork_cropped',
        },
      };
    } catch {
      return fallback;
    }
  }

  private buildPublicArtworkResource(
    fingerprint: string,
    sourceUrl: string,
    metadata: ResolvedMediaResource['metadata']
  ): ResolvedMediaResource | null {
    const safeUrl = sanitizeImageUrl(sourceUrl);
    if (!safeUrl) {
      return null;
    }

    return {
      id: safeUrl,
      kind: 'image',
      url: safeUrl,
      cacheKey: fingerprint,
      authStrategy: 'none',
      metadata,
    };
  }

  private async resolveMusicBrainzArtworkFallback(
    fingerprint: string,
    attrs: Record<string, unknown>
  ): Promise<ResolvedMediaResource | null> {
    const lookupKey = buildMusicBrainzLookupKey(attrs);
    const searchUrls = buildMusicBrainzSearchUrls(attrs);
    if (!lookupKey || searchUrls.length === 0) {
      return null;
    }

    const cached = this.lookupCache.get(lookupKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.resource
        ? {
            ...cached.resource,
            cacheKey: fingerprint,
          }
        : null;
    }

    try {
      const candidates: MusicBrainzRelease[] = [];
      for (const searchUrl of searchUrls) {
        const response = await fetch(searchUrl, {
          headers: {
            Accept: 'application/json',
          },
          cache: 'force-cache',
        });
        if (!response.ok) {
          continue;
        }

        const payload = (await response.json()) as MusicBrainzReleaseSearchResponse;
        candidates.push(...(payload.releases ?? []));
      }

      const rankedCandidates = candidates
        .filter((release) => typeof release.id === 'string' && release.id)
        .sort(
          (left, right) =>
            scoreMusicBrainzRelease(right, attrs) - scoreMusicBrainzRelease(left, attrs)
        );

      for (const candidate of rankedCandidates) {
        const candidateResources = [
          {
            url: `${COVER_ART_ARCHIVE_RELEASE_URL}/${candidate.id}/front-${COVER_ART_ARCHIVE_THUMBNAIL_SIZE}`,
            metadata: {
              source: 'musicbrainz_cover_art_archive' as const,
              releaseId: candidate.id,
            },
          },
          ...(candidate['release-group']?.id
            ? [
                {
                  url: `${COVER_ART_ARCHIVE_RELEASE_GROUP_URL}/${candidate['release-group'].id}/front-${COVER_ART_ARCHIVE_THUMBNAIL_SIZE}`,
                  metadata: {
                    source: 'musicbrainz_cover_art_archive_release_group' as const,
                    releaseId: candidate.id,
                    releaseGroupId: candidate['release-group'].id,
                  },
                },
              ]
            : []),
        ];

        for (const candidateResource of candidateResources) {
          const resource = this.buildPublicArtworkResource(
            fingerprint,
            candidateResource.url,
            candidateResource.metadata
          );
          if (!resource) {
            continue;
          }

          this.lookupCache.set(lookupKey, {
            expiresAt: Date.now() + MUSICBRAINZ_LOOKUP_TTL_MS,
            resource,
          });
          return resource;
        }
      }
    } catch {
      this.lookupCache.set(lookupKey, {
        expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS,
        resource: null,
      });
      return null;
    }

    this.lookupCache.set(lookupKey, {
      expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS,
      resource: null,
    });
    return null;
  }

  async resolveArtwork(
    entityId: string,
    attrs: Record<string, unknown>,
    fallbackPicture?: string
  ): Promise<ResolvedMediaResource> {
    this.evictExpiredEntries();

    const picture =
      (typeof attrs.entity_picture_local === 'string' && attrs.entity_picture_local) ||
      (typeof attrs.entity_picture === 'string' && attrs.entity_picture) ||
      (typeof attrs.media_image_url === 'string' && attrs.media_image_url) ||
      fallbackPicture;
    const fingerprint = [
      entityId,
      picture,
      typeof attrs.media_content_id === 'string' ? attrs.media_content_id : '',
      typeof attrs.media_title === 'string' ? attrs.media_title : '',
      typeof attrs.media_artist === 'string' ? attrs.media_artist : '',
      typeof attrs.media_album_name === 'string' ? attrs.media_album_name : '',
    ].join('::');

    const cachedObjectUrl = this.objectUrlCache.get(fingerprint);
    if (cachedObjectUrl && cachedObjectUrl.expiresAt > Date.now()) {
      return {
        id: fingerprint,
        kind: 'image',
        url: cachedObjectUrl.url,
        cacheKey: fingerprint,
        authStrategy: 'none',
        metadata: { source: 'artwork_object_url_cache' },
      };
    }

    if (!picture) {
      return {
        id: entityId,
        kind: 'unavailable',
        cacheKey: fingerprint,
        authStrategy: 'none',
      };
    }

    const negativeCacheExpiry = this.negativeCache.get(fingerprint);
    if (negativeCacheExpiry && negativeCacheExpiry > Date.now()) {
      return {
        id: entityId,
        kind: 'unavailable',
        cacheKey: fingerprint,
        authStrategy: 'none',
      };
    }

    const prefersMetadataFallback = shouldPreferMetadataFallback(picture, attrs);
    const heuristicFallbackPromise = this.resolveYouTubeArtworkFallback(fingerprint, attrs);
    const preferredMetadataFallbackPromise = prefersMetadataFallback
      ? this.resolveMusicBrainzArtworkFallback(fingerprint, attrs)
      : null;

    const thumbnailDataUrl = await withTimeout(
      fetchMediaThumbnailDataUrl(entityId),
      THUMBNAIL_LOOKUP_TIMEOUT_MS
    );
    if (thumbnailDataUrl) {
      const fallbackResource = await this.resolver.resolve({
        kind: 'media_artwork',
        entityId,
        rawPath: picture,
      });

      return {
        id: `${entityId}:thumbnail`,
        kind: 'image',
        url: thumbnailDataUrl,
        cacheKey: fingerprint,
        authStrategy: 'none',
        fallback: fallbackResource.url
          ? {
              ...fallbackResource,
              cacheKey: fingerprint,
            }
          : undefined,
        metadata: { source: 'media_player_thumbnail' },
      };
    }

    if (preferredMetadataFallbackPromise) {
      const preferredMetadataFallback = await preferredMetadataFallbackPromise;
      if (preferredMetadataFallback) {
        return preferredMetadataFallback;
      }
    }

    const heuristicFallback = await heuristicFallbackPromise;
    if (heuristicFallback) {
      return heuristicFallback;
    }

    const resolved = await this.resolver.resolve({
      kind: 'media_artwork',
      entityId,
      rawPath: picture,
    });

    if (!resolved.url) {
      const cacheFallback = await this.resolveCacheArtworkFallback(fingerprint, picture);
      if (cacheFallback) {
        return cacheFallback;
      }

      const musicBrainzFallback = await this.resolveMusicBrainzArtworkFallback(fingerprint, attrs);
      if (musicBrainzFallback) {
        return musicBrainzFallback;
      }

      this.negativeCache.set(fingerprint, Date.now() + NEGATIVE_CACHE_TTL_MS);
      return resolved;
    }

    const shouldMaterializeSameOriginMediaProxy =
      resolved.authStrategy === 'none' && isSameOriginMediaProxyUrl(resolved.url);

    if (
      (resolved.authStrategy === 'none' && !shouldMaterializeSameOriginMediaProxy) ||
      resolved.url.startsWith('blob:') ||
      resolved.url.startsWith('data:')
    ) {
      return {
        ...resolved,
        cacheKey: fingerprint,
      };
    }

    try {
      const blob = await this.httpGateway.getBlob({
        url: resolved.url,
        authStrategy: shouldMaterializeSameOriginMediaProxy ? 'same_origin' : resolved.authStrategy,
        cache: 'force-cache',
      });

      if (!(await isRenderableImageBlob(blob))) {
        const cacheFallback = await this.resolveCacheArtworkFallback(fingerprint, picture);
        if (cacheFallback) {
          return cacheFallback;
        }

        return {
          ...resolved,
          cacheKey: fingerprint,
        };
      }

      const objectUrl = URL.createObjectURL(blob);
      this.objectUrlCache.set(fingerprint, {
        url: objectUrl,
        expiresAt: Date.now() + OBJECT_URL_TTL_MS,
      });

      return {
        ...resolved,
        url: objectUrl,
        expiresAt: undefined,
        authStrategy: 'none',
        cacheKey: fingerprint,
        metadata: {
          ...resolved.metadata,
          mimeType: blob.type,
          source: 'artwork_object_url',
        },
      };
    } catch {
      const cacheFallback = await this.resolveCacheArtworkFallback(fingerprint, picture);
      if (cacheFallback) {
        return cacheFallback;
      }

      return {
        ...resolved,
        cacheKey: fingerprint,
      };
    }
  }
}
