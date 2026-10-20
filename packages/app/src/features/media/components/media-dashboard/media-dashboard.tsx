import { dispatchEntityCommand } from '@navet/app/commands';
import { Input } from '@navet/app/components/primitives';
import { getDashboardCardFootprint } from '@navet/app/components/shared/card-size';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { navetRadiusTokens } from '@navet/app/components/system/tokens';
import { STORAGE_KEYS } from '@navet/app/constants/storage-keys';
import { EMPTY_NAVET_MEDIA_CAPABILITIES } from '@navet/app/core/navet-device-state';
import { useFitDashboardGrid } from '@navet/app/features/dashboard/hooks/use-fit-dashboard-grid';
import {
  getResolvedMediaBrowserAlbum,
  getResolvedMediaBrowserArtist,
  getSpotifyTrackId,
  isAlbumMediaItem,
  isArtistMediaItem,
  mediaCatalog,
  type SpotifyTrackMetadata,
} from '@navet/app/features/media/catalog/media-catalog';
import { useMediaCatalogItem } from '@navet/app/features/media/catalog/use-media-catalog-item';
import {
  useProviderMediaEntityRegistry,
  useProviderMediaPlayerEntities,
} from '@navet/app/features/media/hooks/use-provider-media-playback-data';
import { normalizeMediaPlaybackState } from '@navet/app/features/media/media-state';
import {
  useEntityProviderFeature,
  useI18n,
  useMediaQuery,
  usePersistedState,
  useServiceActionHandler,
  useTheme,
} from '@navet/app/hooks';
import { useBreakpointCols } from '@navet/app/hooks/use-breakpoint-cols';
import { useResourceUrl } from '@navet/app/hooks/use-resource-url';
import type {
  PlatformMediaBrowseResult,
  PlatformMediaItem,
} from '@navet/app/platform/provider-feature-models';
import { integrationMediaFeatureService } from '@navet/app/services/integration-media-feature.service';
import type { MediaDevice } from '@navet/app/types/device.types';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import { getProviderNativeId } from '@navet/app/utils/provider-ids';
import { isSafeRelativePath, sanitizeImageUrl } from '@navet/app/utils/url-security';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  Bookmark,
  Camera,
  Clock3,
  DiscAlbum,
  Folder,
  Heart,
  Image as ImageIcon,
  Images,
  Library,
  ListMusic,
  Podcast,
  RadioTower,
  Search,
  Sparkles,
  TrendingUp,
  Upload,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { MediaCard } from '../media-card';

type MediaDashboardDevice = MediaDevice & { type: 'media' };

const EMPTY_MEDIA_DASHBOARD_DEVICE: MediaDashboardDevice = {
  id: '',
  name: '',
  room: '',
  size: 'small',
  title: '',
  artist: '',
  state: 'idle',
  volume: 0,
  isMuted: false,
  type: 'media',
};

interface MediaDashboardProps {
  devices: MediaDashboardDevice[];
  initialDeviceId?: string;
  onPromotedEntitiesChange?: (entityIds: string[]) => void;
}

type MediaFeedbackKey =
  | 'media.feedback.updatePlaybackFailed'
  | 'media.feedback.browseMediaFailed'
  | 'media.feedback.playMediaFailed'
  | 'media.feedback.seekFailed';

type MediaDefaultBrowseView = Pick<
  PlatformMediaItem,
  'title' | 'mediaClass' | 'mediaContentId' | 'mediaContentType' | 'canExpand' | 'canPlay'
>;

interface RememberedMediaSession {
  version: 1 | 2;
  device: MediaDashboardDevice;
  mediaLibraryEntityId?: string;
  transportEntityId?: string;
  playbackProviderLabel?: string;
  rememberedAt: string;
}

interface MediaDashboardDeviceIndex {
  audioOutputTargets: MediaDashboardDevice[];
  browsablePlaybackDevices: MediaDashboardDevice[];
  byId: Map<string, MediaDashboardDevice>;
  byNativeId: Map<string, MediaDashboardDevice>;
  spotifyAccountDevice?: MediaDashboardDevice;
}

const SPOTIFY_ICON_PATH =
  'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z';
const SPOTIFY_IMAGE_ID_PATTERN = /(?:^|\/)image\/(ab[a-zA-Z0-9]{20,})(?:[/?#].*)?$/;
const MEDIA_BROWSER_TABLE_ITEM_THRESHOLD = 30;
const DIRECTORY_COUNT_FETCH_CONCURRENCY = 3;
const MEDIA_BROWSER_TABLE_HEADER_HEIGHT = 50;
const MEDIA_BROWSER_TABLE_ROW_HEIGHT = 64;
const MEDIA_BROWSER_TABLE_OVERSCAN = 6;
const COMPACT_MOBILE_BROWSER_HEIGHT = 170;
const REMEMBERED_POSITION_WRITE_INTERVAL_SECONDS = 15;
const EMPTY_MEDIA_DEFAULT_BROWSE_VIEWS: Record<string, MediaDefaultBrowseView> = {};
const EMPTY_REMEMBERED_MEDIA_SESSION: RememberedMediaSession | null = null;

function isAudioDevice(device: MediaDashboardDevice) {
  const className = device.deviceClass?.toLowerCase() ?? '';
  return className !== 'tv';
}

function isSpotifyAccountDevice(device: MediaDashboardDevice) {
  return (
    device.id.toLowerCase().includes('spotify') || device.name.toLowerCase().includes('spotify')
  );
}

function isMusicAssistantDevice(device: MediaDashboardDevice, registryPlatform?: string | null) {
  const identity = `${device.id} ${device.name} ${device.source ?? ''}`.toLowerCase();
  return (
    registryPlatform === 'music_assistant' ||
    identity.includes('music assistant') ||
    device.id.toLowerCase().includes('media_player.mass_') ||
    device.id.toLowerCase().includes('media_player.music_assistant')
  );
}

function getPhysicalSpeakerKey(device: MediaDashboardDevice) {
  const normalizedRoom = device.room.trim().toLowerCase();
  if (
    normalizedRoom &&
    !['unknown', 'unassigned', 'no room', 'media', 'home'].includes(normalizedRoom)
  ) {
    return normalizedRoom;
  }

  return device.name
    .toLowerCase()
    .replace(/\bmusic assistant\b/g, '')
    .replace(/\bspeaker\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPlaybackProviderLabel(device: MediaDashboardDevice, registryPlatform?: string | null) {
  if (isMusicAssistantDevice(device, registryPlatform)) return 'Music Assistant';
  const identity = `${device.id} ${device.name} ${device.source ?? ''}`.toLowerCase();
  if (identity.includes('spotify')) return 'Spotify';
  if (identity.includes('apple music')) return 'Apple Music';
  if (identity.includes('youtube')) return 'YouTube';
  const source = device.source?.trim();
  return source && !['unknown', 'none', 'idle'].includes(source.toLowerCase()) ? source : undefined;
}

function hasCurrentMedia(device: MediaDashboardDevice) {
  return Boolean(
    (device.title.trim() &&
      device.title.trim().toLowerCase() !== device.name.trim().toLowerCase()) ||
      device.artist.trim() ||
      device.album?.trim() ||
      device.entityPicture ||
      (device.durationSeconds ?? 0) > 0
  );
}

function getMediaActivityTimestamp(device: MediaDashboardDevice) {
  if (!device.positionUpdatedAt) return 0;
  const timestamp = Date.parse(device.positionUpdatedAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function compareMediaActivity(left: MediaDashboardDevice, right: MediaDashboardDevice) {
  const timestampDifference = getMediaActivityTimestamp(right) - getMediaActivityTimestamp(left);
  return timestampDifference || (right.elapsedSeconds ?? 0) - (left.elapsedSeconds ?? 0);
}

function findPreferredDevice(
  devices: Iterable<MediaDashboardDevice>,
  predicate: (device: MediaDashboardDevice) => boolean,
  compare: (
    left: MediaDashboardDevice,
    right: MediaDashboardDevice
  ) => number = compareMediaActivity
) {
  let preferred: MediaDashboardDevice | undefined;

  for (const device of devices) {
    if (!predicate(device)) continue;
    if (!preferred || compare(device, preferred) < 0) {
      preferred = device;
    }
  }

  return preferred;
}

function getPlaybackStateRank(device: MediaDashboardDevice) {
  return device.state === 'playing' ? 2 : device.state === 'paused' ? 1 : 0;
}

function comparePhysicalTransportPreference(
  left: MediaDashboardDevice,
  right: MediaDashboardDevice
) {
  return (
    getPlaybackStateRank(right) - getPlaybackStateRank(left) || compareMediaActivity(left, right)
  );
}

function createMediaDashboardDeviceIndex(
  devices: MediaDashboardDevice[],
  isMusicAssistantPlaybackDevice: (device: MediaDashboardDevice) => boolean
): MediaDashboardDeviceIndex {
  const byId = new Map<string, MediaDashboardDevice>();
  const byNativeId = new Map<string, MediaDashboardDevice>();
  const audioDevices: MediaDashboardDevice[] = [];
  const audioOutputTargets: MediaDashboardDevice[] = [];
  let spotifyAccountDevice: MediaDashboardDevice | undefined;

  for (const device of devices) {
    byId.set(device.id, device);
    byNativeId.set(getProviderNativeId(device.id), device);

    if (!isAudioDevice(device)) continue;
    audioDevices.push(device);
    if (isSpotifyAccountDevice(device)) {
      spotifyAccountDevice ??= device;
    } else {
      audioOutputTargets.push(device);
    }
  }

  const browsablePlaybackDevices = audioDevices.filter((device) => {
    const isMusicAssistant = isMusicAssistantPlaybackDevice(device);
    return (
      (getDeviceCapabilities(device).canBrowseMedia || isMusicAssistant) &&
      (!spotifyAccountDevice || isMusicAssistant)
    );
  });

  return {
    audioOutputTargets,
    browsablePlaybackDevices,
    byId,
    byNativeId,
    spotifyAccountDevice,
  };
}

function isSameMediaSession(left: MediaDashboardDevice, right: MediaDashboardDevice) {
  const leftTitle = left.title.trim().toLowerCase();
  const rightTitle = right.title.trim().toLowerCase();
  const leftArtist = left.artist.trim().toLowerCase();
  const rightArtist = right.artist.trim().toLowerCase();
  if (
    leftTitle &&
    rightTitle &&
    leftTitle === rightTitle &&
    (!leftArtist || !rightArtist || leftArtist === rightArtist)
  ) {
    return true;
  }

  const leftContentId = left.mediaContentId?.trim();
  const rightContentId = right.mediaContentId?.trim();
  if (leftContentId && rightContentId) return leftContentId === rightContentId;

  return false;
}

function isRememberedSessionUsable(
  session: RememberedMediaSession | null,
  devicesById: ReadonlyMap<string, MediaDashboardDevice>
) {
  if (
    (session?.version !== 1 && session?.version !== 2) ||
    !session.device?.id ||
    !hasCurrentMedia(session.device)
  )
    return false;

  const currentDevice = devicesById.get(session.device.id);
  if (!currentDevice) return false;

  return (
    !session.device.providerId ||
    !currentDevice.providerId ||
    session.device.providerId === currentDevice.providerId
  );
}

function restoreRememberedDevice(
  session: RememberedMediaSession,
  currentDevice: MediaDashboardDevice
): MediaDashboardDevice {
  return {
    ...session.device,
    ...currentDevice,
    title: session.device.title,
    artist: session.device.artist,
    album: session.device.album,
    entityPicture: session.device.entityPicture,
    elapsedSeconds: session.device.elapsedSeconds,
    durationSeconds: session.device.durationSeconds,
    positionUpdatedAt: session.device.positionUpdatedAt,
    mediaContentId: session.device.mediaContentId,
    mediaContentType: session.device.mediaContentType,
    groupMembers:
      (currentDevice.groupMembers?.length ?? 0) > 1
        ? currentDevice.groupMembers
        : session.device.groupMembers,
    // Home Assistant's Spotify entity can collapse a paused session to idle and clear all media
    // attributes. Navet keeps presenting that last resumable session as paused.
    state: currentDevice.state === 'idle' ? 'paused' : currentDevice.state,
  };
}

function readLiveStringAttribute(attrs: Record<string, unknown> | undefined, key: string) {
  const value = attrs?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function findActiveSpotifyConnectTarget(
  spotifyDevice: MediaDashboardDevice | undefined,
  targets: MediaDashboardDevice[]
) {
  const playingTarget = targets.find((target) => target.state === 'playing');
  if (playingTarget) return playingTarget;

  const retainedTarget = findPreferredDevice(
    targets,
    (target) => (target.state === 'paused' || target.state === 'idle') && hasCurrentMedia(target)
  );
  if (retainedTarget) return retainedTarget;

  const spotifySource = spotifyDevice?.source?.trim().toLowerCase();
  if (spotifySource) {
    const sourceTarget = targets.find((target) => {
      const targetName = target.name.trim().toLowerCase();
      return spotifySource === targetName || spotifySource.includes(targetName);
    });
    if (sourceTarget) return sourceTarget;
  }

  return undefined;
}

function getDeviceCapabilities(device: MediaDashboardDevice) {
  return (
    device.mediaCapabilities ?? {
      ...EMPTY_NAVET_MEDIA_CAPABILITIES,
      canMuteVolume: true,
      canPause: true,
      canPlay: true,
      canSetVolume: true,
    }
  );
}

function inferMediaContentType(item: PlatformMediaItem) {
  if (item.mediaContentType) return item.mediaContentType;
  const value = item.mediaContentId?.toLowerCase() ?? '';
  if (value.includes(':playlist:') || value.includes('/playlist/')) return 'playlist';
  if (value.includes(':album:') || value.includes('/album/')) return 'album';
  if (value.includes(':episode:') || value.includes('/episode/')) return 'episode';
  return 'music';
}

function isSpotifyMediaItem(item: PlatformMediaItem) {
  const mediaContentId = item.mediaContentId?.trim().toLowerCase() ?? '';
  if (mediaContentId.startsWith('spotify:')) return true;
  try {
    return new URL(mediaContentId).hostname === 'open.spotify.com';
  } catch {
    return false;
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string') return message;
  }
  return typeof error === 'string' ? error : '';
}

function isRestrictedSpotifyPlaybackError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    /upnp(?: error)?\s*800/.test(message) ||
    message.includes('restricted') ||
    message.includes('restriction') ||
    /does not support.*play_media/.test(message) ||
    /not supported.*play_media/.test(message)
  );
}

function getMediaItemKey(item: PlatformMediaItem) {
  return `${item.mediaContentType}:${item.mediaContentId}:${item.title}`;
}

function deduplicateMediaItems(items: PlatformMediaItem[]) {
  const seenMediaIds = new Set<string>();

  return items.filter((item) => {
    const mediaContentId = item.mediaContentId?.trim().toLowerCase();
    if (!mediaContentId) return true;

    const key = `${item.mediaContentType?.trim().toLowerCase() ?? ''}:${mediaContentId}`;
    if (seenMediaIds.has(key)) return false;

    seenMediaIds.add(key);
    return true;
  });
}

function getDirectoryItemCountKey(entityId: string, item: PlatformMediaItem) {
  return `${entityId}:${getMediaItemKey(item)}`;
}

function isMediaDirectoryItem(item: PlatformMediaItem) {
  return Boolean(item.canExpand && !item.canPlay);
}

function isArtworkCollectionItem(item: PlatformMediaItem) {
  const mediaClass = item.mediaClass?.toLowerCase() ?? '';
  return (
    isArtistMediaItem(item) ||
    isAlbumMediaItem(item) ||
    ['playlist', 'podcast', 'show'].includes(mediaClass)
  );
}

function partitionMediaBrowserItems(items: PlatformMediaItem[], hideNestedArtwork: boolean) {
  const directories: PlatformMediaItem[] = [];
  const tiles: PlatformMediaItem[] = [];

  for (const item of items) {
    const isVisibleDirectory =
      isMediaDirectoryItem(item) && !(hideNestedArtwork && isArtworkCollectionItem(item));
    (isVisibleDirectory ? directories : tiles).push(item);
  }

  return { directories, tiles };
}

function isSpotifyProviderDirectory(item: PlatformMediaItem) {
  return [item.mediaContentId, item.mediaContentType, item.thumbnail, item.title].some((value) =>
    value?.toLowerCase().includes('spotify')
  );
}

function getMediaLibraryDirectoryIcon(item: PlatformMediaItem): LucideIcon {
  const identity = [item.title, item.mediaContentId, item.mediaContentType]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (identity.includes('top artist')) return UsersRound;
  if (identity.includes('top track')) return TrendingUp;
  if (identity.includes('recently played')) return Clock3;
  if (identity.includes('liked song')) return Heart;
  if (identity.includes('playlist')) return ListMusic;
  if (identity.includes('podcast')) return Podcast;
  if (identity.includes('artist')) return UserRound;
  if (identity.includes('album')) return DiscAlbum;
  if (identity.includes('favorite')) return Bookmark;
  if (identity.includes('upload')) return Upload;
  if (identity.includes('camera')) return Camera;
  if (identity.includes('radio')) return RadioTower;
  if (identity.includes('generated') || identity.includes('ai image')) return Sparkles;
  if (identity.includes('my media')) return Library;
  if (identity.includes('images')) return Images;
  if (identity.includes('image')) return ImageIcon;
  return Folder;
}

function getMediaItemInitials(item: PlatformMediaItem) {
  const title = item.title || item.mediaContentId || '';
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function shouldUseProviderMediaThumbnail(item: PlatformMediaItem) {
  if (!item.thumbnail) {
    return false;
  }

  return true;
}

function resolveSpotifyImageThumbnailUrl(thumbnail: string | null | undefined) {
  const match = thumbnail?.trim().match(SPOTIFY_IMAGE_ID_PATTERN);
  if (!match) {
    return null;
  }

  return sanitizeImageUrl(`https://i.scdn.co/image/${match[1]}`);
}

export function resolveMusicAssistantThumbnailSourceUrl(thumbnail: string | null | undefined) {
  const trimmedThumbnail = thumbnail?.trim();
  if (!trimmedThumbnail) {
    return null;
  }

  try {
    const thumbnailUrl = new URL(trimmedThumbnail, 'http://navet.local');
    if (!thumbnailUrl.pathname.toLowerCase().includes('/imageproxy')) {
      return null;
    }

    let sourceUrl = thumbnailUrl.searchParams.get('path');
    if (!sourceUrl) {
      return null;
    }

    for (let decodePass = 0; decodePass < 2; decodePass += 1) {
      const decodedSourceUrl = decodeURIComponent(sourceUrl);
      if (decodedSourceUrl === sourceUrl) {
        break;
      }
      sourceUrl = decodedSourceUrl;
    }

    return sanitizeImageUrl(sourceUrl);
  } catch {
    return null;
  }
}

export function resolveMediaBrowserThumbnailUrl(item: PlatformMediaItem) {
  if (!shouldUseProviderMediaThumbnail(item)) {
    return null;
  }

  return (
    resolveSpotifyImageThumbnailUrl(item.thumbnail) ??
    resolveMusicAssistantThumbnailSourceUrl(item.thumbnail) ??
    (isSafeRelativePath(item.thumbnail?.trim() ?? '')
      ? item.thumbnail?.trim()
      : sanitizeImageUrl(item.thumbnail ?? ''))
  );
}

interface MediaBrowserDirectoryTileProps {
  accentColor: string;
  item: PlatformMediaItem;
  className: string;
  onSelect: (item: PlatformMediaItem) => void;
  showSpotifyIcon?: boolean;
  statusLabel?: string;
  surface: ReturnType<typeof getThemeSurfaceTokens>;
  theme: ReturnType<typeof useTheme>['theme'];
}

function MediaBrowserDirectoryTile({
  accentColor,
  item,
  className,
  onSelect,
  showSpotifyIcon = false,
  statusLabel,
  surface,
  theme,
}: MediaBrowserDirectoryTileProps) {
  const DirectoryIcon = getMediaLibraryDirectoryIcon(item);
  const itemTitle = item.title ?? item.mediaContentId;
  const iconWellStyle = {
    background: `radial-gradient(120% 100% at 0% 0%, color-mix(in srgb, ${accentColor} ${
      theme === 'light' ? '7%' : '8%'
    }, transparent) 0%, transparent 62%)`,
  };
  const tileSurfaceClassName =
    theme === 'light'
      ? 'bg-white/72 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.32)] hover:border-slate-300 hover:bg-white'
      : theme === 'glass'
        ? 'bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_12px_28px_-26px_rgba(0,0,0,0.6)] backdrop-blur-xl hover:border-white/20 hover:bg-white/[0.075]'
        : theme === 'black'
          ? 'bg-black hover:border-zinc-700 hover:bg-zinc-950'
          : 'bg-[rgba(24,24,27,0.97)] hover:border-zinc-600 hover:bg-zinc-800';
  const iconWellClassName =
    theme === 'light'
      ? 'border-slate-200/80 bg-slate-100/72 text-slate-600'
      : theme === 'glass'
        ? 'border-white/10 bg-white/[0.045] text-white/78'
        : `${surface.borderStrong} ${surface.iconBg} text-white/78`;

  return (
    <button
      type="button"
      className={`group flex min-h-[72px] min-w-0 items-center gap-3 ${navetRadiusTokens.panelInset} border px-3 py-2.5 text-left transition-[background-color,border-color,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${surface.border} ${tileSurfaceClassName} ${
        theme === 'light'
          ? 'focus-visible:ring-slate-400 focus-visible:ring-offset-white'
          : 'focus-visible:ring-white/40 focus-visible:ring-offset-zinc-950'
      } ${className}`}
      onClick={() => onSelect(item)}
    >
      <span
        data-testid="media-library-directory-icon"
        className={`relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border ${iconWellClassName}`}
        style={iconWellStyle}
      >
        {showSpotifyIcon ? (
          <svg
            data-testid="spotify-library-icon"
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-5 w-5 text-[#1DB954]"
          >
            <path d={SPOTIFY_ICON_PATH} />
          </svg>
        ) : (
          <DirectoryIcon className="h-[18px] w-[18px]" aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`line-clamp-2 text-[13px] font-semibold leading-[1.15] ${surface.textPrimary}`}
        >
          {itemTitle}
        </span>
        {statusLabel ? (
          <span
            role="status"
            aria-label={statusLabel}
            className={`mt-1 block text-[11px] leading-none ${surface.textSecondary}`}
          >
            {statusLabel}
          </span>
        ) : null}
      </span>
    </button>
  );
}

interface MediaBrowserTileProps {
  compact?: boolean;
  item: PlatformMediaItem;
  mediaTileClassName: string;
  mediaTileArtworkClassName: string;
  onSelect: (item: PlatformMediaItem) => void;
  providerId?: IntegrationProviderId;
  surface: ReturnType<typeof getThemeSurfaceTokens>;
  theme: ReturnType<typeof useTheme>['theme'];
}

function MediaBrowserTile({
  compact = false,
  item,
  mediaTileClassName,
  mediaTileArtworkClassName,
  onSelect,
  providerId,
  surface,
  theme,
}: MediaBrowserTileProps) {
  const isDirectory = item.canExpand && !item.canPlay;
  const isArtist = isArtistMediaItem(item);
  const ItemIcon = isArtist ? UserRound : isDirectory ? Folder : ListMusic;
  const itemInitials = getMediaItemInitials(item);
  const providerThumbnailUrl = useResourceUrl(resolveMediaBrowserThumbnailUrl(item), providerId);
  const catalogItem = useMediaCatalogItem(item);
  const { openArtwork, spotifyMetadata } = catalogItem;
  const itemTitle = spotifyMetadata.title ?? item.title ?? item.mediaContentId;
  const resolvedItemSubtitle =
    getResolvedMediaBrowserArtist(item, catalogItem) ??
    getResolvedMediaBrowserAlbum(item, catalogItem) ??
    spotifyMetadata.albumTitle;
  const itemSubtitle = resolvedItemSubtitle;
  const [failedArtworkUrls, setFailedArtworkUrls] = useState<Set<string>>(() => new Set());
  const artworkUrl =
    [providerThumbnailUrl, ...spotifyMetadata.artworkUrls, ...openArtwork.artworkUrls].find(
      (candidateUrl): candidateUrl is string =>
        typeof candidateUrl === 'string' && !failedArtworkUrls.has(candidateUrl)
    ) ?? null;
  useEffect(() => {
    setFailedArtworkUrls(new Set());
  }, [
    item.mediaContentId,
    item.title,
    providerThumbnailUrl,
    spotifyMetadata.artworkUrls,
    openArtwork.artworkUrls,
  ]);

  return (
    <button type="button" className={mediaTileClassName} onClick={() => onSelect(item)}>
      <span className={mediaTileArtworkClassName}>
        {artworkUrl ? (
          <img
            src={artworkUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
            loading="lazy"
            decoding="async"
            onError={() =>
              setFailedArtworkUrls((current) => {
                const next = new Set(current);
                next.add(artworkUrl);
                return next;
              })
            }
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center">
            {isArtist ? (
              <span
                className={`absolute inset-0 flex items-center justify-center ${
                  theme === 'glass'
                    ? 'bg-[radial-gradient(circle_at_35%_28%,rgba(29,185,84,0.22),transparent_38%),linear-gradient(135deg,rgba(255,255,255,0.13),rgba(255,255,255,0.035))]'
                    : theme === 'light'
                      ? 'bg-slate-100'
                      : theme === 'black'
                        ? 'bg-black'
                        : 'bg-zinc-900'
                }`}
              >
                <span
                  className={`flex h-[58%] w-[58%] items-center justify-center rounded-full border text-2xl font-semibold shadow-inner ${
                    theme === 'light'
                      ? 'border-white/80 bg-white/72 text-slate-700'
                      : theme === 'glass'
                        ? 'border-white/16 bg-black/22 text-white/86'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-100'
                  }`}
                >
                  {itemInitials || <UserRound className="h-9 w-9" />}
                </span>
              </span>
            ) : (
              <ItemIcon className={`h-10 w-10 ${surface.textSecondary}`} />
            )}
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/42 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
      <span
        className={`${compact ? 'mt-1.5' : 'mt-2'} line-clamp-2 text-sm font-semibold leading-tight ${surface.textPrimary}`}
      >
        {itemTitle}
      </span>
      {itemSubtitle ? (
        <span
          className={`mt-0.5 block w-full whitespace-normal break-words text-xs leading-tight ${surface.textSecondary}`}
        >
          {itemSubtitle}
        </span>
      ) : null}
    </button>
  );
}

interface MediaBrowserTableRowProps {
  index: number;
  item: PlatformMediaItem;
  onSelect: (item: PlatformMediaItem) => void;
  providerId?: IntegrationProviderId;
  surface: ReturnType<typeof getThemeSurfaceTokens>;
  theme: ReturnType<typeof useTheme>['theme'];
}

function MediaBrowserTableRow({
  index,
  item,
  onSelect,
  providerId,
  surface,
  theme,
}: MediaBrowserTableRowProps) {
  const providerThumbnailUrl = useResourceUrl(resolveMediaBrowserThumbnailUrl(item), providerId);
  const catalogItem = useMediaCatalogItem(item);
  const { openArtwork, spotifyMetadata } = catalogItem;
  const itemTitle = spotifyMetadata.title ?? item.title ?? item.mediaContentId;
  const itemSubtitle = getResolvedMediaBrowserArtist(item, catalogItem);
  const FallbackIcon = isMediaDirectoryItem(item) ? getMediaLibraryDirectoryIcon(item) : ListMusic;
  const [failedArtworkUrls, setFailedArtworkUrls] = useState<Set<string>>(() => new Set());
  const artworkUrl =
    [providerThumbnailUrl, ...spotifyMetadata.artworkUrls, ...openArtwork.artworkUrls].find(
      (candidateUrl): candidateUrl is string =>
        typeof candidateUrl === 'string' && !failedArtworkUrls.has(candidateUrl)
    ) ?? null;

  useEffect(() => {
    setFailedArtworkUrls(new Set());
  }, [
    item.mediaContentId,
    item.title,
    providerThumbnailUrl,
    spotifyMetadata.artworkUrls,
    openArtwork.artworkUrls,
  ]);

  return (
    <button
      type="button"
      className={`flex h-16 w-full items-center px-3 text-left text-sm transition-colors md:px-4 ${
        index % 2 === 0 ? surface.subtleBg : ''
      } ${
        theme === 'light'
          ? 'hover:bg-white/78 focus-visible:bg-white/78'
          : 'hover:bg-white/[0.075] focus-visible:bg-white/[0.075]'
      } focus:outline-none focus-visible:ring-2 ${
        theme === 'light' ? 'focus-visible:ring-slate-400' : 'focus-visible:ring-white/35'
      }`}
      onClick={() => onSelect(item)}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-md border ${surface.border} ${
            theme === 'light' ? 'bg-slate-100' : 'bg-white/[0.06]'
          }`}
        >
          {artworkUrl ? (
            <img
              src={artworkUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              onError={() =>
                setFailedArtworkUrls((current) => {
                  const next = new Set(current);
                  next.add(artworkUrl);
                  return next;
                })
              }
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center">
              <FallbackIcon className={`h-4 w-4 ${surface.textMuted}`} />
            </span>
          )}
        </span>
        <span className="min-w-0">
          <span className={`block truncate text-sm font-medium ${surface.textPrimary}`}>
            {itemTitle}
          </span>
          {itemSubtitle ? (
            <span className={`block truncate text-xs ${surface.textSecondary}`}>
              {itemSubtitle}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

interface MediaBrowserVirtualTableProps {
  height: number;
  items: PlatformMediaItem[];
  onSelect: (item: PlatformMediaItem) => void;
  providerId?: IntegrationProviderId;
  surface: ReturnType<typeof getThemeSurfaceTokens>;
  theme: ReturnType<typeof useTheme>['theme'];
}

function MediaBrowserVirtualTable({
  height,
  items,
  onSelect,
  providerId,
  surface,
  theme,
}: MediaBrowserVirtualTableProps) {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMetadata, setSearchMetadata] = useState<Map<string, SpotifyTrackMetadata>>(
    () => new Map()
  );
  const [isResolvingSearchMetadata, setIsResolvingSearchMetadata] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const isSearchActive = normalizedSearchQuery.length > 0;
  const filteredItems = useMemo(() => {
    if (!normalizedSearchQuery) {
      return items;
    }

    return items.filter((item) => {
      const trackId = getSpotifyTrackId(item);
      const resolvedMetadata = trackId ? searchMetadata.get(trackId) : undefined;
      return [resolvedMetadata?.title, resolvedMetadata?.artistName, item.title, item.artist].some(
        (value) => value?.toLowerCase().includes(normalizedSearchQuery)
      );
    });
  }, [items, normalizedSearchQuery, searchMetadata]);

  useEffect(() => {
    if (!isSearchActive) {
      setIsResolvingSearchMetadata(false);
      return;
    }

    const trackIds = Array.from(
      new Set(
        items.map((item) => getSpotifyTrackId(item)).filter((id): id is string => Boolean(id))
      )
    );
    if (trackIds.length === 0) {
      setIsResolvingSearchMetadata(false);
      return;
    }

    let cancelled = false;
    setIsResolvingSearchMetadata(true);
    void Promise.all(
      trackIds.map(
        async (trackId) => [trackId, await mediaCatalog.resolveSpotifyTrack(trackId)] as const
      )
    ).then((entries) => {
      if (!cancelled) {
        setSearchMetadata(new Map(entries));
        setIsResolvingSearchMetadata(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isSearchActive, items]);

  useEffect(() => {
    setScrollTop(0);
    listRef.current?.scrollTo?.({ top: 0 });
  }, [normalizedSearchQuery]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const listHeight = Math.max(
    MEDIA_BROWSER_TABLE_ROW_HEIGHT,
    height - MEDIA_BROWSER_TABLE_HEADER_HEIGHT - 2
  );
  const visibleCount = Math.max(1, Math.ceil(listHeight / MEDIA_BROWSER_TABLE_ROW_HEIGHT));
  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / MEDIA_BROWSER_TABLE_ROW_HEIGHT) - MEDIA_BROWSER_TABLE_OVERSCAN
  );
  const endIndex = Math.min(
    filteredItems.length,
    startIndex + visibleCount + MEDIA_BROWSER_TABLE_OVERSCAN * 2
  );
  const virtualItems = filteredItems.slice(startIndex, endIndex);
  const topOffset = startIndex * MEDIA_BROWSER_TABLE_ROW_HEIGHT;
  const totalHeight = filteredItems.length * MEDIA_BROWSER_TABLE_ROW_HEIGHT;

  return (
    <div
      data-testid="media-browser-virtual-table-shell"
      className={`min-h-0 overflow-hidden rounded-[22px] border ${surface.border} ${
        theme === 'glass'
          ? surface.panelMuted
          : theme === 'light'
            ? 'bg-white'
            : theme === 'black'
              ? 'bg-black'
              : 'bg-zinc-950'
      }`}
      style={{ height: `${height}px` }}
    >
      <div className="min-w-0">
        <div className="min-w-0">
          <div data-card-nodrag="true" className="flex h-[50px] items-center px-3 py-2 md:px-4">
            <Input
              type="search"
              size="small"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t('media.search.placeholder')}
              aria-label={t('media.search')}
              leading={<Search className="h-3.5 w-3.5" />}
              variant="soft"
              containerClassName="w-full"
              inputClassName="h-8"
            />
          </div>
          <div
            ref={listRef}
            data-testid="media-browser-virtual-table"
            data-card-nodrag="true"
            className="touch-pan-y overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ height: `${listHeight}px` }}
            onTouchMove={(event) => event.stopPropagation()}
            onScroll={(event) => {
              if (rafRef.current !== null) {
                return;
              }

              const scrollContainer = event.currentTarget;
              rafRef.current = window.requestAnimationFrame(() => {
                rafRef.current = null;
                setScrollTop(scrollContainer.scrollTop);
              });
            }}
          >
            {filteredItems.length > 0 ? (
              <div className="relative" style={{ height: totalHeight }}>
                <div
                  className="absolute inset-x-0 top-0"
                  style={{ transform: `translateY(${topOffset}px)` }}
                >
                  {virtualItems.map((item, virtualIndex) => (
                    <MediaBrowserTableRow
                      key={`${startIndex + virtualIndex}:${getMediaItemKey(item)}`}
                      index={startIndex + virtualIndex}
                      item={item}
                      onSelect={onSelect}
                      providerId={providerId}
                      surface={surface}
                      theme={theme}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div
                className={`flex items-center justify-center px-4 text-center text-sm ${surface.textSecondary}`}
                style={{ height: `${listHeight}px` }}
              >
                {isResolvingSearchMetadata
                  ? t('common.loading')
                  : t('media.dashboard.browserEmpty')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MediaDashboard({
  devices,
  initialDeviceId,
  onPromotedEntitiesChange,
}: MediaDashboardProps) {
  const { t } = useI18n();
  const { accentColor, theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const runAction = useServiceActionHandler();
  const registryAnchorEntityId =
    devices.find((device) => device.deviceClass?.toLowerCase() === 'speaker')?.id ??
    devices.find((device) => getProviderNativeId(device.id).startsWith('media_player.'))?.id ??
    '';
  const mediaEntityRegistry = useProviderMediaEntityRegistry(registryAnchorEntityId);
  const liveMediaPlayerEntities = useProviderMediaPlayerEntities(registryAnchorEntityId, true);
  const resolvedDevices = useMemo(
    () =>
      devices.map((device) => {
        const liveEntity = liveMediaPlayerEntities?.[getProviderNativeId(device.id)];
        if (!liveEntity) return device;
        const attributes = liveEntity.attributes;
        const liveGroupMembers = Array.isArray(attributes.group_members)
          ? attributes.group_members.filter(
              (member): member is string => typeof member === 'string' && member.length > 0
            )
          : device.groupMembers;
        return {
          ...device,
          state: normalizeMediaPlaybackState(liveEntity.state, device.deviceClass),
          title: readLiveStringAttribute(attributes, 'media_title') ?? device.title,
          artist: readLiveStringAttribute(attributes, 'media_artist') ?? device.artist,
          album: readLiveStringAttribute(attributes, 'media_album_name') ?? device.album,
          source: readLiveStringAttribute(attributes, 'source') ?? device.source,
          entityPicture:
            readLiveStringAttribute(attributes, 'entity_picture') ?? device.entityPicture,
          durationSeconds:
            typeof attributes.media_duration === 'number'
              ? attributes.media_duration
              : device.durationSeconds,
          mediaContentId:
            readLiveStringAttribute(attributes, 'media_content_id') ?? device.mediaContentId,
          mediaContentType:
            readLiveStringAttribute(attributes, 'media_content_type') ?? device.mediaContentType,
          groupMembers: liveGroupMembers,
        } satisfies MediaDashboardDevice;
      }),
    [devices, liveMediaPlayerEntities]
  );
  const mediaPlatformByEntityId = useMemo(
    () => new Map(mediaEntityRegistry.map((entry) => [entry.entityId, entry.platform] as const)),
    [mediaEntityRegistry]
  );
  const getMediaPlatform = useCallback(
    (device: MediaDashboardDevice) => mediaPlatformByEntityId.get(getProviderNativeId(device.id)),
    [mediaPlatformByEntityId]
  );
  const isMusicAssistantPlaybackDevice = useCallback(
    (device: MediaDashboardDevice) => isMusicAssistantDevice(device, getMediaPlatform(device)),
    [getMediaPlatform]
  );
  const deviceIndex = useMemo(
    () => createMediaDashboardDeviceIndex(resolvedDevices, isMusicAssistantPlaybackDevice),
    [isMusicAssistantPlaybackDevice, resolvedDevices]
  );
  const isSingleRowMediaLayout = useMediaQuery('(max-width: 899px)');
  const breakpointCols = useBreakpointCols();
  const {
    gridStyle: dashboardGridStyle,
    innerContainerStyle,
    innerRef,
    isAutoScaled,
    outerContainerStyle,
    outerRef,
    renderedGridCols,
  } = useFitDashboardGrid(breakpointCols);
  const [rememberedSession, setRememberedSession] =
    usePersistedState<RememberedMediaSession | null>(
      STORAGE_KEYS.mediaNowPlayingSession,
      EMPTY_REMEMBERED_MEDIA_SESSION
    );
  const usableRememberedSession = isRememberedSessionUsable(rememberedSession, deviceIndex.byId)
    ? rememberedSession
    : null;
  const rememberedCurrentDevice = usableRememberedSession
    ? deviceIndex.byId.get(usableRememberedSession.device.id)
    : undefined;
  const initialDevice = initialDeviceId ? deviceIndex.byId.get(initialDeviceId) : undefined;
  const spotifyAccountDevice = deviceIndex.spotifyAccountDevice;
  const availableAudioOutputTargets = deviceIndex.audioOutputTargets;
  const browsablePlaybackDevices = deviceIndex.browsablePlaybackDevices;
  const resolveDeclaredPhysicalGroup = (device: MediaDashboardDevice) => {
    const physicalKeys = new Set([getPhysicalSpeakerKey(device)]);
    const entityIds = new Set([device.id]);
    for (const memberId of device.groupMembers ?? []) {
      const nativeMemberId = getProviderNativeId(memberId);
      const memberDevice = deviceIndex.byNativeId.get(nativeMemberId);
      physicalKeys.add(
        memberDevice ? getPhysicalSpeakerKey(memberDevice) : `entity:${nativeMemberId}`
      );
      if (memberDevice) entityIds.add(memberDevice.id);
    }
    return { entityIds, physicalKeys };
  };
  const activePlaybackClusters = Object.values(
    resolvedDevices.reduce<Record<string, MediaDashboardDevice[]>>((clusters, device) => {
      if (
        !isAudioDevice(device) ||
        !['playing', 'paused'].includes(device.state) ||
        !hasCurrentMedia(device)
      ) {
        return clusters;
      }
      const key = `${device.title.trim().toLowerCase()}::${device.artist.trim().toLowerCase()}`;
      if (!key.replaceAll(':', '')) return clusters;
      const cluster = clusters[key] ?? [];
      cluster.push(device);
      clusters[key] = cluster;
      return clusters;
    }, {})
  );
  const inferredMusicAssistantGroup = activePlaybackClusters.find((cluster) => {
    const roomCount = new Set(cluster.map(getPhysicalSpeakerKey)).size;
    const hasDeclaredGroup = cluster.some((device) => (device.groupMembers?.length ?? 0) > 1);
    const playingRoomCount = new Set(
      cluster.filter((device) => device.state === 'playing').map(getPhysicalSpeakerKey)
    ).size;
    return (
      roomCount > 1 &&
      cluster.length >= roomCount &&
      hasDeclaredGroup &&
      cluster.some(isMusicAssistantPlaybackDevice) &&
      playingRoomCount > 1
    );
  });
  const inferredMusicAssistantDevice =
    inferredMusicAssistantGroup?.find(isMusicAssistantPlaybackDevice) ??
    inferredMusicAssistantGroup?.find((device) => getDeviceCapabilities(device).canBrowseMedia) ??
    inferredMusicAssistantGroup?.[0];
  const activeDeclaredGroupedPlaybackDevice = resolvedDevices.find(
    (device) =>
      device.state === 'playing' &&
      isAudioDevice(device) &&
      !isMusicAssistantPlaybackDevice(device) &&
      hasCurrentMedia(device) &&
      resolveDeclaredPhysicalGroup(device).physicalKeys.size > 1
  );
  const retainedDeclaredGroupedPlaybackDevice = resolvedDevices.find(
    (device) =>
      (device.state === 'paused' || device.state === 'idle') &&
      isAudioDevice(device) &&
      !isMusicAssistantPlaybackDevice(device) &&
      hasCurrentMedia(device) &&
      resolveDeclaredPhysicalGroup(device).physicalKeys.size > 1
  );
  const declaredGroupedPlaybackDevice =
    activeDeclaredGroupedPlaybackDevice ?? retainedDeclaredGroupedPlaybackDevice;
  const activeBrowsableDevice =
    browsablePlaybackDevices.find(
      (device) =>
        device.state === 'playing' &&
        isMusicAssistantPlaybackDevice(device) &&
        hasCurrentMedia(device)
    ) ??
    browsablePlaybackDevices.find(
      (device) => device.state === 'playing' && isMusicAssistantPlaybackDevice(device)
    ) ??
    browsablePlaybackDevices.find(
      (device) => device.state === 'playing' && hasCurrentMedia(device)
    ) ??
    browsablePlaybackDevices.find((device) => device.state === 'playing') ??
    browsablePlaybackDevices.find(
      (device) =>
        device.state === 'paused' &&
        isMusicAssistantPlaybackDevice(device) &&
        hasCurrentMedia(device)
    ) ??
    browsablePlaybackDevices.find((device) => device.state === 'paused');
  const defaultDevice =
    declaredGroupedPlaybackDevice ??
    inferredMusicAssistantDevice ??
    activeBrowsableDevice ??
    (initialDevice && isSpotifyAccountDevice(initialDevice) ? initialDevice : undefined) ??
    spotifyAccountDevice ??
    initialDevice ??
    resolvedDevices.find((device) => device.state === 'playing' && isAudioDevice(device)) ??
    resolvedDevices.find((device) => device.state === 'paused' && isAudioDevice(device)) ??
    resolvedDevices.find(isAudioDevice) ??
    resolvedDevices[0];
  const selectedDeviceId = defaultDevice?.id ?? '';
  const [browseResult, setBrowseResult] = useState<PlatformMediaBrowseResult | null>(null);
  const [browseHistory, setBrowseHistory] = useState<PlatformMediaItem[]>([]);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [defaultBrowseViews, setDefaultBrowseViews] = usePersistedState<
    Record<string, MediaDefaultBrowseView>
  >(STORAGE_KEYS.mediaDefaultViews, EMPTY_MEDIA_DEFAULT_BROWSE_VIEWS);
  const defaultBrowseViewsRef = useRef(defaultBrowseViews);
  defaultBrowseViewsRef.current = defaultBrowseViews;
  const [directoryItemCounts, setDirectoryItemCounts] = useState<Record<string, number>>({});
  const directoryItemCountsRef = useRef<Record<string, number>>({});
  const directoryCountRequestsRef = useRef(new Set<string>());
  const selectedDevice = deviceIndex.byId.get(selectedDeviceId) ?? defaultDevice;
  const spotifyAccountControlsUnavailable =
    selectedDevice !== undefined && isSpotifyAccountDevice(selectedDevice);
  const activeSpotifyConnectTarget = findActiveSpotifyConnectTarget(
    selectedDevice,
    availableAudioOutputTargets
  );
  const fallbackAudioOutputTarget = availableAudioOutputTargets.find((device) => {
    const outputCapabilities = getDeviceCapabilities(device);
    return outputCapabilities.canBrowseMedia || outputCapabilities.canPlayMedia;
  });
  const rememberedSpotifyTarget = availableAudioOutputTargets.find(
    (device) =>
      device.id === usableRememberedSession?.transportEntityId ||
      device.id === usableRememberedSession?.device.id
  );
  const selectedSpotifyTarget =
    activeSpotifyConnectTarget ?? rememberedSpotifyTarget ?? fallbackAudioOutputTarget;
  const activeBrowsableNowPlayingDevice =
    browsablePlaybackDevices.find(
      (device) =>
        device.state === 'playing' &&
        isMusicAssistantPlaybackDevice(device) &&
        hasCurrentMedia(device)
    ) ??
    browsablePlaybackDevices.find(
      (device) => device.state === 'playing' && hasCurrentMedia(device)
    );
  const activeNowPlayingDevice = resolvedDevices.find(
    (device) =>
      device.state === 'playing' &&
      isAudioDevice(device) &&
      !isSpotifyAccountDevice(device) &&
      hasCurrentMedia(device)
  );
  const retainedNowPlayingDevice = findPreferredDevice(
    resolvedDevices,
    (device) =>
      (device.state === 'paused' || device.state === 'idle') &&
      isAudioDevice(device) &&
      !isSpotifyAccountDevice(device) &&
      hasCurrentMedia(device)
  );
  const liveNowPlayingDevice =
    activeDeclaredGroupedPlaybackDevice ??
    inferredMusicAssistantDevice ??
    activeBrowsableNowPlayingDevice ??
    activeNowPlayingDevice ??
    retainedDeclaredGroupedPlaybackDevice ??
    retainedNowPlayingDevice;
  const rememberedNowPlayingDevice =
    !liveNowPlayingDevice &&
    usableRememberedSession &&
    rememberedCurrentDevice?.state === 'idle' &&
    !hasCurrentMedia(rememberedCurrentDevice)
      ? restoreRememberedDevice(usableRememberedSession, rememberedCurrentDevice)
      : undefined;
  const usingRememberedSession = rememberedNowPlayingDevice !== undefined;
  const nowPlayingDevice =
    liveNowPlayingDevice ??
    rememberedNowPlayingDevice ??
    selectedDevice ??
    EMPTY_MEDIA_DASHBOARD_DEVICE;
  const matchingPhysicalTransportDevice = isMusicAssistantPlaybackDevice(nowPlayingDevice)
    ? findPreferredDevice(
        resolvedDevices,
        (device) =>
          device.id !== nowPlayingDevice.id &&
          isAudioDevice(device) &&
          !isSpotifyAccountDevice(device) &&
          !isMusicAssistantPlaybackDevice(device) &&
          getPhysicalSpeakerKey(device) === getPhysicalSpeakerKey(nowPlayingDevice) &&
          isSameMediaSession(device, nowPlayingDevice),
        comparePhysicalTransportPreference
      )
    : undefined;
  const rememberedTransportDevice = usableRememberedSession?.transportEntityId
    ? deviceIndex.byId.get(usableRememberedSession.transportEntityId)
    : undefined;
  const nowPlayingTransportDevice =
    matchingPhysicalTransportDevice ??
    (usingRememberedSession ? rememberedTransportDevice : undefined) ??
    nowPlayingDevice;
  const selectedDeviceUsesInferredMusicAssistantGroup = Boolean(
    inferredMusicAssistantGroup?.some((device) => device.id === nowPlayingDevice.id)
  );
  const rememberedMediaLibraryDevice = usableRememberedSession?.mediaLibraryEntityId
    ? deviceIndex.byId.get(usableRememberedSession.mediaLibraryEntityId)
    : undefined;
  const mediaLibraryDevice = usingRememberedSession
    ? (rememberedMediaLibraryDevice ?? rememberedCurrentDevice ?? selectedDevice)
    : spotifyAccountControlsUnavailable
      ? (selectedSpotifyTarget ?? selectedDevice)
      : selectedDevice;
  const mediaLibraryEntityId = mediaLibraryDevice?.id;
  const defaultBrowseView = mediaLibraryEntityId
    ? defaultBrowseViews[mediaLibraryEntityId]
    : undefined;
  const mediaLibraryCapabilities = mediaLibraryDevice
    ? getDeviceCapabilities(mediaLibraryDevice)
    : EMPTY_NAVET_MEDIA_CAPABILITIES;
  const providerSupportsMediaBrowse = useEntityProviderFeature(mediaLibraryEntityId, 'mediaBrowse');
  const canBrowseMedia = mediaLibraryCapabilities.canBrowseMedia || providerSupportsMediaBrowse;
  const dashboardTitleKey = 'media.dashboard.nowPlaying';
  const playbackProviderLabel = selectedDeviceUsesInferredMusicAssistantGroup
    ? 'Music Assistant'
    : usingRememberedSession
      ? usableRememberedSession?.playbackProviderLabel
      : getPlaybackProviderLabel(nowPlayingDevice, getMediaPlatform(nowPlayingDevice));
  const continuingRememberedDevice =
    rememberedSession && isSameMediaSession(rememberedSession.device, nowPlayingDevice)
      ? rememberedSession.device
      : undefined;
  const nextRememberedPlaybackState =
    nowPlayingDevice.state === 'idle' ? ('paused' as const) : nowPlayingDevice.state;
  const keepPreviousRememberedPosition = Boolean(
    continuingRememberedDevice &&
      continuingRememberedDevice.state === nextRememberedPlaybackState &&
      Math.abs(
        (nowPlayingDevice.elapsedSeconds ?? 0) - (continuingRememberedDevice.elapsedSeconds ?? 0)
      ) < REMEMBERED_POSITION_WRITE_INTERVAL_SECONDS
  );
  const sessionDeviceToRemember =
    !usingRememberedSession &&
    hasCurrentMedia(nowPlayingDevice) &&
    ['playing', 'paused', 'idle'].includes(nowPlayingDevice.state)
      ? {
          ...continuingRememberedDevice,
          ...nowPlayingDevice,
          artist: nowPlayingDevice.artist.trim() || continuingRememberedDevice?.artist || '',
          album: nowPlayingDevice.album?.trim() || continuingRememberedDevice?.album,
          entityPicture:
            nowPlayingDevice.entityPicture ?? continuingRememberedDevice?.entityPicture,
          durationSeconds:
            nowPlayingDevice.durationSeconds ?? continuingRememberedDevice?.durationSeconds,
          elapsedSeconds: keepPreviousRememberedPosition
            ? continuingRememberedDevice?.elapsedSeconds
            : (nowPlayingDevice.elapsedSeconds ?? continuingRememberedDevice?.elapsedSeconds),
          positionUpdatedAt: keepPreviousRememberedPosition
            ? continuingRememberedDevice?.positionUpdatedAt
            : (nowPlayingDevice.positionUpdatedAt ?? continuingRememberedDevice?.positionUpdatedAt),
          mediaContentId:
            nowPlayingDevice.mediaContentId ?? continuingRememberedDevice?.mediaContentId,
          mediaContentType:
            nowPlayingDevice.mediaContentType ?? continuingRememberedDevice?.mediaContentType,
          state: nextRememberedPlaybackState,
        }
      : null;
  const nextRememberedSessionKey = sessionDeviceToRemember
    ? JSON.stringify({
        device: sessionDeviceToRemember,
        mediaLibraryEntityId,
        transportEntityId: nowPlayingTransportDevice.id,
        playbackProviderLabel,
      })
    : '';
  const currentRememberedSessionKey = rememberedSession
    ? JSON.stringify({
        device: rememberedSession.device,
        mediaLibraryEntityId: rememberedSession.mediaLibraryEntityId,
        transportEntityId: rememberedSession.transportEntityId,
        playbackProviderLabel: rememberedSession.playbackProviderLabel,
      })
    : '';
  useEffect(() => {
    if (!sessionDeviceToRemember || nextRememberedSessionKey === currentRememberedSessionKey) {
      return;
    }

    setRememberedSession({
      version: 2,
      device: sessionDeviceToRemember,
      mediaLibraryEntityId,
      transportEntityId: nowPlayingTransportDevice.id,
      playbackProviderLabel,
      rememberedAt: new Date().toISOString(),
    });
  }, [
    currentRememberedSessionKey,
    mediaLibraryEntityId,
    nextRememberedSessionKey,
    nowPlayingTransportDevice.id,
    playbackProviderLabel,
    sessionDeviceToRemember,
    setRememberedSession,
  ]);
  const unfilteredPlayableItems = (browseResult?.children ?? []).filter(
    (item) => item.mediaContentId || item.canExpand
  );
  const currentBrowseItem = browseHistory.at(-1);
  const isRecentlyPlayedView =
    currentBrowseItem?.mediaContentId?.toLowerCase().includes('recently-played') ||
    currentBrowseItem?.title.toLowerCase() === 'recently played' ||
    browseResult?.title.toLowerCase() === 'recently played';
  const playableItems = isRecentlyPlayedView
    ? deduplicateMediaItems(unfilteredPlayableItems)
    : unfilteredPlayableItems;
  const useMediaBrowserTable = playableItems.length >= MEDIA_BROWSER_TABLE_ITEM_THRESHOLD;
  const { directories: browseDirectoryItems, tiles: browseTileItems } = partitionMediaBrowserItems(
    playableItems,
    browseHistory.length >= 2
  );
  const inferredGroupSize = selectedDeviceUsesInferredMusicAssistantGroup
    ? new Set(inferredMusicAssistantGroup?.map(getPhysicalSpeakerKey) ?? []).size
    : 1;
  const selectedDeviceIsMusicAssistant = isMusicAssistantPlaybackDevice(nowPlayingDevice);
  const selectedDeclaredGroup = resolveDeclaredPhysicalGroup(nowPlayingDevice);
  const selectedGroupSize = selectedDeviceUsesInferredMusicAssistantGroup
    ? inferredGroupSize
    : selectedDeviceIsMusicAssistant
      ? 1
      : selectedDeclaredGroup.physicalKeys.size;
  const selectedDeviceIsGrouped = selectedGroupSize > 1;
  const hasActiveMediaSession =
    (nowPlayingDevice.state === 'playing' || nowPlayingDevice.state === 'paused') &&
    hasCurrentMedia(nowPlayingDevice);
  const hasPromotedNowPlayingDevice = liveNowPlayingDevice !== undefined || usingRememberedSession;
  const promotedEntityIdKey = [
    ...(hasPromotedNowPlayingDevice ? [nowPlayingDevice.id, nowPlayingTransportDevice.id] : []),
    ...(selectedDeviceIsGrouped
      ? selectedDeviceUsesInferredMusicAssistantGroup
        ? (inferredMusicAssistantGroup?.map((device) => device.id) ?? [])
        : [...selectedDeclaredGroup.entityIds]
      : []),
  ]
    .filter((entityId, index, entityIds) => entityIds.indexOf(entityId) === index)
    .sort()
    .join('\n');
  useEffect(() => {
    onPromotedEntitiesChange?.(promotedEntityIdKey ? promotedEntityIdKey.split('\n') : []);
  }, [onPromotedEntitiesChange, promotedEntityIdKey]);
  const nowPlayingCardSize = 'large';
  const nowPlayingCardFootprint = getDashboardCardFootprint(nowPlayingCardSize, breakpointCols);
  const nowPlayingColumnSpan = Math.min(4, renderedGridCols);
  const browserColumnSpan = isSingleRowMediaLayout
    ? renderedGridCols
    : Math.max(2, renderedGridCols - nowPlayingColumnSpan);

  const runMediaCommand = useCallback(
    (
      action: () => Promise<unknown>,
      feedbackKey: MediaFeedbackKey = 'media.feedback.updatePlaybackFailed'
    ) => {
      void runAction(async () => {
        await action();
      }, t(feedbackKey));
    },
    [runAction, t]
  );

  const toggleNowPlaying = useCallback(() => {
    const currentDevice = deviceIndex.byId.get(nowPlayingTransportDevice.id);
    const shouldRecreateSession =
      currentDevice?.state === 'idle' && Boolean(nowPlayingDevice.mediaContentId?.trim());

    if (!shouldRecreateSession) {
      runMediaCommand(() =>
        dispatchEntityCommand({ type: 'play_pause', entityId: nowPlayingTransportDevice.id })
      );
      return;
    }

    runMediaCommand(async () => {
      try {
        await integrationMediaFeatureService.playMedia(nowPlayingTransportDevice.id, {
          mediaContentId: nowPlayingDevice.mediaContentId ?? '',
          mediaContentType:
            nowPlayingDevice.mediaContentType ??
            inferMediaContentType({
              title: nowPlayingDevice.title,
              mediaContentId: nowPlayingDevice.mediaContentId,
            }),
        });

        if (
          (nowPlayingDevice.elapsedSeconds ?? 0) > 0 &&
          getDeviceCapabilities(nowPlayingDevice).canSeek
        ) {
          await integrationMediaFeatureService.seekMediaPlayer(
            nowPlayingTransportDevice.id,
            nowPlayingDevice.elapsedSeconds ?? 0
          );
        }
      } catch {
        // Some players keep an internal queue despite reporting idle. Preserve that provider-native
        // recovery path when replaying the remembered media identifier is unsupported.
        await dispatchEntityCommand({
          type: 'play_pause',
          entityId: nowPlayingTransportDevice.id,
        });
      }
    });
  }, [deviceIndex.byId, nowPlayingDevice, nowPlayingTransportDevice.id, runMediaCommand]);

  const browseMedia = useCallback(
    (item?: PlatformMediaItem, nextHistory?: PlatformMediaItem[], fallbackToRoot = false) => {
      if (!mediaLibraryEntityId || !canBrowseMedia) return;

      setIsBrowsing(true);
      runMediaCommand(async () => {
        let resolvedHistory = nextHistory;
        try {
          let result: PlatformMediaBrowseResult;
          try {
            result = await integrationMediaFeatureService.browseMediaPlayer(mediaLibraryEntityId, {
              mediaContentId: item?.mediaContentId,
              mediaContentType: item?.mediaContentType,
            });
          } catch (error) {
            if (!fallbackToRoot) throw error;

            result = await integrationMediaFeatureService.browseMediaPlayer(
              mediaLibraryEntityId,
              {}
            );
            setDefaultBrowseViews((current) => {
              const next = { ...current };
              delete next[mediaLibraryEntityId];
              return next;
            });
            resolvedHistory = [];
          }
          setBrowseResult(result);
          if (resolvedHistory) {
            setBrowseHistory(resolvedHistory);
          }
        } finally {
          setIsBrowsing(false);
        }
      }, 'media.feedback.browseMediaFailed');
    },
    [canBrowseMedia, mediaLibraryEntityId, runMediaCommand, setDefaultBrowseViews]
  );

  const loadInitialBrowseView = useEffectEvent(() => {
    if (!mediaLibraryEntityId) return;
    const initialBrowseView = defaultBrowseViewsRef.current[mediaLibraryEntityId];
    if (initialBrowseView) {
      browseMedia(initialBrowseView, [initialBrowseView], true);
      return;
    }

    browseMedia();
  });

  useEffect(() => {
    setBrowseResult(null);
    setBrowseHistory([]);
    setDirectoryItemCounts({});
    directoryItemCountsRef.current = {};
    directoryCountRequestsRef.current.clear();
    if (!mediaLibraryEntityId || !canBrowseMedia) {
      setIsBrowsing(false);
      return;
    }

    // Reload for a different player, not when translated command feedback changes.
    loadInitialBrowseView();
  }, [canBrowseMedia, mediaLibraryEntityId, selectedDeviceId]);

  useEffect(() => {
    if (!mediaLibraryEntityId || !browseResult?.children) return;

    const pendingDirectories = (
      browseResult.children.length < MEDIA_BROWSER_TABLE_ITEM_THRESHOLD
        ? browseResult.children.filter(isMediaDirectoryItem)
        : []
    ).filter((item) => {
      if (!item.mediaContentId) return false;
      const key = getDirectoryItemCountKey(mediaLibraryEntityId, item);
      return (
        directoryItemCountsRef.current[key] === undefined &&
        !directoryCountRequestsRef.current.has(key)
      );
    });
    if (pendingDirectories.length === 0) return;

    pendingDirectories.forEach((item) => {
      directoryCountRequestsRef.current.add(getDirectoryItemCountKey(mediaLibraryEntityId, item));
    });
    let nextDirectoryIndex = 0;

    const loadNextDirectoryCount = async () => {
      while (nextDirectoryIndex < pendingDirectories.length) {
        const item = pendingDirectories[nextDirectoryIndex];
        nextDirectoryIndex += 1;
        if (!item) continue;

        const key = getDirectoryItemCountKey(mediaLibraryEntityId, item);
        try {
          const result = await integrationMediaFeatureService.browseMediaPlayer(
            mediaLibraryEntityId,
            {
              mediaContentId: item.mediaContentId,
              mediaContentType: item.mediaContentType,
            }
          );
          const count = result.children?.length;
          if (count !== undefined) {
            directoryItemCountsRef.current[key] = count;
            setDirectoryItemCounts((current) =>
              current[key] === count ? current : { ...current, [key]: count }
            );
          }
        } catch {
          // Folder counts are supplementary; browsing remains available if a count cannot load.
        } finally {
          directoryCountRequestsRef.current.delete(key);
        }
      }
    };

    const workerCount = Math.min(DIRECTORY_COUNT_FETCH_CONCURRENCY, pendingDirectories.length);
    void Promise.all(Array.from({ length: workerCount }, () => loadNextDirectoryCount()));
  }, [browseResult, mediaLibraryEntityId]);

  if (!selectedDevice) {
    return null;
  }

  const playMediaItem = (item: PlatformMediaItem) => {
    if (!item.mediaContentId || !mediaLibraryEntityId || !item.canPlay) return;

    runMediaCommand(async () => {
      try {
        await integrationMediaFeatureService.playMedia(mediaLibraryEntityId, {
          mediaContentId: item.mediaContentId ?? '',
          mediaContentType: inferMediaContentType(item),
        });
      } catch (error) {
        if (
          mediaLibraryDevice !== undefined &&
          isSpotifyAccountDevice(mediaLibraryDevice) &&
          isSpotifyMediaItem(item) &&
          isRestrictedSpotifyPlaybackError(error)
        ) {
          throw new Error(t('media.feedback.spotifyRestrictedPlayback'));
        }
        throw error;
      }
    }, 'media.feedback.playMediaFailed');
  };
  const browseMediaDirectory = (item: PlatformMediaItem) => {
    browseMedia(item, [...browseHistory, item]);
  };
  const browseBack = () => {
    const nextHistory = browseHistory.slice(0, -1);
    const previousItem = nextHistory[nextHistory.length - 1];
    browseMedia(previousItem, nextHistory);
  };
  const currentBrowseTitle =
    browseHistory[browseHistory.length - 1]?.title ??
    browseResult?.title ??
    t('media.dashboard.browser');
  const currentBrowseDirectory = browseHistory[browseHistory.length - 1];
  const isCurrentBrowseDefault = Boolean(
    currentBrowseDirectory?.mediaContentId &&
      defaultBrowseView?.mediaContentId === currentBrowseDirectory.mediaContentId &&
      defaultBrowseView?.mediaContentType === currentBrowseDirectory.mediaContentType
  );
  const showDefaultViewAction = Boolean(
    currentBrowseDirectory?.mediaContentId || defaultBrowseView
  );
  const defaultViewActionLabel = currentBrowseDirectory
    ? isCurrentBrowseDefault
      ? t('media.dashboard.defaultView.remove')
      : t('media.dashboard.defaultView.set', { title: currentBrowseTitle })
    : t('media.dashboard.defaultView.useLibrary');
  const toggleDefaultBrowseView = () => {
    if (!mediaLibraryEntityId) return;

    setDefaultBrowseViews((current) => {
      const next = { ...current };
      if (currentBrowseDirectory?.mediaContentId && !isCurrentBrowseDefault) {
        next[mediaLibraryEntityId] = {
          title: currentBrowseDirectory.title,
          mediaClass: currentBrowseDirectory.mediaClass,
          mediaContentId: currentBrowseDirectory.mediaContentId,
          mediaContentType: currentBrowseDirectory.mediaContentType,
          canExpand: true,
          canPlay: false,
        };
      } else {
        delete next[mediaLibraryEntityId];
      }
      return next;
    });
  };
  const useCompactFolderGrid = browseHistory.length > 0;
  const compactBrowserHeight = isSingleRowMediaLayout
    ? COMPACT_MOBILE_BROWSER_HEIGHT
    : nowPlayingCardFootprint.heightPx;
  const handleCardSizeChange = useCallback(() => undefined, []);
  const quietPanelClassName = `rounded-xl border p-4 ${surface.border} ${
    theme === 'light'
      ? 'bg-slate-50'
      : theme === 'glass'
        ? 'bg-black/18'
        : theme === 'black'
          ? 'bg-black'
          : 'bg-zinc-950'
  }`;
  const mediaTileClassName = `group self-start rounded-[1.375rem] text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
    theme === 'light'
      ? 'focus-visible:ring-slate-400 focus-visible:ring-offset-white'
      : 'focus-visible:ring-white/40 focus-visible:ring-offset-zinc-950'
  }`;
  const mediaTileArtworkClassName = `relative block h-[100px] max-h-[100px] w-[100px] max-w-[100px] overflow-hidden rounded-[1.375rem] border shadow-sm ${surface.border} ${
    theme === 'light'
      ? 'bg-linear-to-br from-slate-100 via-white to-slate-200 group-hover:border-slate-300'
      : theme === 'glass'
        ? 'bg-linear-to-br from-white/[0.08] via-white/[0.035] to-black/20 group-hover:border-white/22'
        : theme === 'black'
          ? 'bg-black group-hover:border-zinc-700'
          : 'bg-zinc-900 group-hover:border-zinc-600'
  }`;
  const compactMediaTileGridClassName = isSingleRowMediaLayout
    ? 'flex items-start gap-3 overflow-x-auto overflow-y-hidden pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
    : 'grid grid-cols-[repeat(auto-fill,100px)] content-start items-start gap-x-3 gap-y-3 lg:gap-x-4';
  const compactMediaTileWidthClassName = isSingleRowMediaLayout
    ? 'w-[100px] shrink-0'
    : 'w-[100px]';
  const mediaDirectoryGridClassName = isSingleRowMediaLayout
    ? 'flex items-stretch gap-2.5 overflow-x-auto overflow-y-hidden pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
    : 'grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] content-start items-stretch gap-3';
  const mediaDirectoryTileWidthClassName = isSingleRowMediaLayout ? 'w-[168px] shrink-0' : 'w-full';
  const selectBrowserItem = (item: PlatformMediaItem) => {
    const isDirectory = item.canExpand && !item.canPlay;
    if (isDirectory) {
      browseMediaDirectory(item);
      return;
    }

    playMediaItem(item);
  };

  const nowPlayingPanel = (
    <section className="min-w-0 space-y-3">
      <div
        data-testid="media-now-playing-card"
        className="w-full"
        style={{
          minHeight: `${nowPlayingCardFootprint.heightPx}px`,
          height: `${nowPlayingCardFootprint.heightPx}px`,
        }}
      >
        <MediaCard
          id={nowPlayingDevice.id}
          name={nowPlayingDevice.name}
          room={nowPlayingDevice.room}
          title={nowPlayingDevice.title}
          artist={nowPlayingDevice.artist}
          album={nowPlayingDevice.album}
          entityType={nowPlayingDevice.entityType}
          deviceClass={nowPlayingDevice.deviceClass}
          source={nowPlayingDevice.source}
          sourceList={nowPlayingDevice.sourceList}
          entityPicture={nowPlayingDevice.entityPicture}
          state={nowPlayingDevice.state}
          volume={nowPlayingDevice.volume}
          isMuted={nowPlayingDevice.isMuted}
          elapsedSeconds={nowPlayingDevice.elapsedSeconds}
          durationSeconds={nowPlayingDevice.durationSeconds}
          positionUpdatedAt={nowPlayingDevice.positionUpdatedAt}
          mediaCapabilities={nowPlayingDevice.mediaCapabilities}
          supportsGrouping={nowPlayingDevice.supportsGrouping}
          supportsPreviousTrack={nowPlayingDevice.supportsPreviousTrack}
          supportsNextTrack={nowPlayingDevice.supportsNextTrack}
          groupMembers={nowPlayingDevice.groupMembers}
          mediaStackAppearance={selectedDeviceIsGrouped}
          mediaStackCount={selectedDeviceIsGrouped ? selectedGroupSize - 1 : undefined}
          size={nowPlayingCardSize}
          onSizeChange={handleCardSizeChange}
          isEditMode={false}
          hideTransportControls={isSpotifyAccountDevice(nowPlayingDevice)}
          onTogglePlayback={toggleNowPlaying}
        />
      </div>
    </section>
  );

  const browserPanel = (
    <section
      data-testid="media-browser-panel"
      className="order-2 min-w-0 space-y-4"
      style={{ gridColumn: `span ${browserColumnSpan} / span ${browserColumnSpan}` }}
    >
      {canBrowseMedia ? (
        <div className="flex h-9 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {browseHistory.length > 0 ? (
              <button
                type="button"
                aria-label={t('dashboard.onboarding.back')}
                disabled={isBrowsing}
                onClick={browseBack}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${surface.border} ${
                  theme === 'light'
                    ? 'bg-white/72 hover:bg-slate-100'
                    : 'bg-white/[0.045] hover:bg-white/[0.09]'
                }`}
              >
                <ArrowLeft className={`h-4 w-4 ${surface.textSecondary}`} />
              </button>
            ) : null}
            <h2 className={`truncate text-lg font-semibold md:text-xl ${surface.textPrimary}`}>
              {currentBrowseTitle}
            </h2>
            {showDefaultViewAction ? (
              <button
                type="button"
                aria-label={defaultViewActionLabel}
                disabled={isBrowsing}
                onClick={toggleDefaultBrowseView}
                className={`inline-flex h-9 w-6 shrink-0 items-center justify-center transition-opacity hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-45 ${
                  isCurrentBrowseDefault ? surface.textPrimary : surface.textSecondary
                }`}
              >
                <Bookmark className={`h-4 w-4 ${isCurrentBrowseDefault ? 'fill-current' : ''}`} />
              </button>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2" />
        </div>
      ) : null}

      {canBrowseMedia ? (
        playableItems.length > 0 ? (
          useMediaBrowserTable ? (
            <MediaBrowserVirtualTable
              key={currentBrowseTitle}
              height={compactBrowserHeight}
              items={playableItems}
              onSelect={selectBrowserItem}
              providerId={selectedDevice.providerId}
              surface={surface}
              theme={theme}
            />
          ) : (
            <div className="space-y-4">
              {browseDirectoryItems.length > 0 ? (
                <div
                  data-testid="media-browser-directory-grid"
                  className={mediaDirectoryGridClassName}
                >
                  {browseDirectoryItems.map((item) => {
                    const directoryCount = mediaLibraryEntityId
                      ? directoryItemCounts[getDirectoryItemCountKey(mediaLibraryEntityId, item)]
                      : undefined;
                    const showSpotifyIcon =
                      browseHistory.length === 0 && isSpotifyProviderDirectory(item);
                    const statusLabel =
                      directoryCount === undefined
                        ? undefined
                        : `${directoryCount} ${directoryCount === 1 ? 'item' : 'items'}`;

                    return (
                      <MediaBrowserDirectoryTile
                        key={getMediaItemKey(item)}
                        accentColor={accentColor}
                        className={mediaDirectoryTileWidthClassName}
                        item={item}
                        onSelect={selectBrowserItem}
                        showSpotifyIcon={showSpotifyIcon}
                        statusLabel={statusLabel}
                        surface={surface}
                        theme={theme}
                      />
                    );
                  })}
                </div>
              ) : null}

              {browseTileItems.length > 0 ? (
                <div
                  data-testid={useCompactFolderGrid ? 'media-browser-compact-grid' : undefined}
                  className={
                    useCompactFolderGrid
                      ? compactMediaTileGridClassName
                      : 'grid grid-cols-[repeat(auto-fill,100px)] items-start gap-3 lg:gap-4'
                  }
                >
                  {browseTileItems.map((item, index) => (
                    <MediaBrowserTile
                      key={`${index}:${getMediaItemKey(item)}`}
                      compact={useCompactFolderGrid}
                      item={item}
                      mediaTileArtworkClassName={mediaTileArtworkClassName}
                      mediaTileClassName={`${mediaTileClassName} ${
                        useCompactFolderGrid ? compactMediaTileWidthClassName : 'w-[100px]'
                      }`}
                      onSelect={selectBrowserItem}
                      providerId={selectedDevice.providerId}
                      surface={surface}
                      theme={theme}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          )
        ) : (
          <div
            className={`${quietPanelClassName} flex min-h-40 items-center justify-center text-center`}
          >
            <div>
              <Search className={`mx-auto h-8 w-8 ${surface.textMuted}`} />
              <p className={`mt-3 text-sm ${surface.textSecondary}`}>
                {isBrowsing ? t('common.loading') : t('media.dashboard.browserEmpty')}
              </p>
            </div>
          </div>
        )
      ) : null}
    </section>
  );

  return (
    <section className="relative">
      <div className="pt-2">
        <div ref={outerRef} className="relative w-full" style={outerContainerStyle}>
          <div
            ref={innerRef}
            className={`w-full${isAutoScaled ? ' absolute left-0 top-0 origin-top-left' : ''}`}
            style={innerContainerStyle}
          >
            <div
              data-testid="media-dashboard-layout"
              className="grid w-full gap-3 lg:gap-4"
              style={{
                gap: dashboardGridStyle.gap,
                gridTemplateColumns: dashboardGridStyle.gridTemplateColumns,
              }}
            >
              <section
                className={`order-1 min-w-0 space-y-4 ${hasActiveMediaSession ? 'max-[899px]:sticky max-[899px]:top-2 max-[899px]:z-20' : ''}`}
                style={{
                  gridColumn: `span ${nowPlayingColumnSpan} / span ${nowPlayingColumnSpan}`,
                }}
              >
                <div className="flex h-9 items-center">
                  <h2 className={`text-lg font-semibold md:text-xl ${surface.textPrimary}`}>
                    {playbackProviderLabel ?? t(dashboardTitleKey)}
                  </h2>
                </div>
                {nowPlayingPanel}
              </section>
              {browserPanel}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
