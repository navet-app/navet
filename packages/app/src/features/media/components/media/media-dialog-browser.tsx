import { Input } from '@navet/app/components/primitives';
import { useI18n, useServiceActionHandler } from '@navet/app/hooks';
import { useResourceUrls } from '@navet/app/hooks/use-resource-url';
import type {
  PlatformMediaBrowseResult,
  PlatformMediaItem,
} from '@navet/app/platform/provider-feature-models';
import { integrationMediaFeatureService } from '@navet/app/services/integration-media-feature.service';
import { parseProviderScopedId } from '@navet/app/utils/provider-ids';
import { sanitizeImageUrl } from '@navet/app/utils/url-security';
import { ArrowLeft, Folder, ListMusic, Play, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type MediaDialogBrowserMetadata,
  resolveMediaDialogBrowserMetadata,
} from './media-dialog-browser-metadata';
import type { MediaDialogController } from './use-media-dialog-controller';

interface MediaDialogBrowserProps {
  canPlayMedia: boolean;
  canSearchMedia: boolean;
  controller: MediaDialogController;
  entityId: string;
  isActive: boolean;
}

const SPOTIFY_ICON_PATH =
  'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z';
const SPOTIFY_IMAGE_ID_PATTERN = /(?:^|\/)image\/(ab[a-zA-Z0-9]{20,})(?:[/?#].*)?$/;

function inferMediaContentType(item: PlatformMediaItem) {
  if (item.mediaContentType) return item.mediaContentType;
  const contentId = item.mediaContentId?.toLowerCase() ?? '';
  if (contentId.includes(':playlist:') || contentId.includes('/playlist/')) return 'playlist';
  if (contentId.includes(':album:') || contentId.includes('/album/')) return 'album';
  if (contentId.includes(':episode:') || contentId.includes('/episode/')) return 'episode';
  return 'music';
}

function resolveBrowserThumbnail(thumbnail: string | null | undefined) {
  if (!thumbnail) return null;
  const spotifyImageMatch = thumbnail.trim().match(SPOTIFY_IMAGE_ID_PATTERN);
  if (spotifyImageMatch?.[1]) {
    return sanitizeImageUrl(`https://i.scdn.co/image/${spotifyImageMatch[1]}`);
  }
  const baseUrl = typeof window === 'undefined' ? undefined : window.location.origin;
  return sanitizeImageUrl(thumbnail, baseUrl, { allowDataImage: true });
}

function isSpotifyBrowseItem(item: PlatformMediaItem) {
  return [item.mediaContentId, item.mediaContentType, item.thumbnail, item.title].some((value) =>
    value?.toLowerCase().includes('spotify')
  );
}

function isArtworkDirectory(item: PlatformMediaItem) {
  const mediaClass = item.mediaClass?.toLowerCase() ?? '';
  return ['album', 'artist', 'playlist', 'podcast', 'show'].includes(mediaClass);
}

export function MediaDialogBrowser({
  canPlayMedia,
  canSearchMedia,
  controller,
  entityId,
  isActive,
}: MediaDialogBrowserProps) {
  const { t } = useI18n();
  const runAction = useServiceActionHandler();
  const [browseResult, setBrowseResult] = useState<PlatformMediaBrowseResult | null>(null);
  const [history, setHistory] = useState<PlatformMediaItem[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(() => new Set());
  const [metadataByItemKey, setMetadataByItemKey] = useState<
    Record<string, MediaDialogBrowserMetadata>
  >({});

  const browse = useCallback(
    (item?: PlatformMediaItem, nextHistory?: PlatformMediaItem[]) => {
      setIsLoading(true);
      void runAction(async () => {
        try {
          const result = await integrationMediaFeatureService.browseMediaPlayer(entityId, {
            mediaContentId: item?.mediaContentId,
            mediaContentType: item?.mediaContentType,
          });
          setBrowseResult(result);
          if (nextHistory) setHistory(nextHistory);
        } finally {
          setIsLoading(false);
        }
      }, t('media.feedback.browseMediaFailed'));
    },
    [entityId, runAction, t]
  );

  useEffect(() => {
    if (!isActive || browseResult || isLoading) return;
    browse();
  }, [browse, browseResult, isActive, isLoading]);

  useEffect(() => {
    setBrowseResult(null);
    setHistory([]);
    setQuery('');
    setFailedThumbnails(new Set());
    setMetadataByItemKey({});
  }, [entityId]);

  const play = (item: PlatformMediaItem) => {
    if (!canPlayMedia || !item.canPlay || !item.mediaContentId) return;
    void runAction(
      () =>
        integrationMediaFeatureService.playMedia(entityId, {
          mediaContentId: item.mediaContentId ?? '',
          mediaContentType: inferMediaContentType(item),
        }),
      t('media.feedback.playMediaFailed')
    );
  };

  const search = () => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return;
    setIsLoading(true);
    void runAction(async () => {
      try {
        const result = await integrationMediaFeatureService.searchMediaPlayer(
          entityId,
          normalizedQuery
        );
        setBrowseResult(result);
        setHistory([]);
      } finally {
        setIsLoading(false);
      }
    }, t('media.feedback.searchMediaFailed'));
  };

  const items = (browseResult?.children ?? []).filter(
    (item) => item.mediaContentId || item.canExpand
  );
  const resolvedThumbnails = useResourceUrls(
    items.map((item) => resolveBrowserThumbnail(item.thumbnail)),
    parseProviderScopedId(entityId)?.providerId
  );

  const itemSignature = useMemo(
    () => items.map((item) => `${item.mediaContentType}:${item.mediaContentId}`).join('|'),
    [items]
  );

  useEffect(() => {
    let cancelled = false;
    items.forEach((item) => {
      const itemKey = `${item.mediaContentType ?? 'media'}:${item.mediaContentId ?? item.title}`;
      void resolveMediaDialogBrowserMetadata(item).then((metadata) => {
        if (cancelled || Object.keys(metadata).length === 0) return;
        setMetadataByItemKey((current) => ({ ...current, [itemKey]: metadata }));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [itemSignature]);
  const itemClassName = `flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${controller.surface.border} ${controller.surface.textPrimary} ${
    controller.isGlass ? 'bg-white/8 hover:bg-white/12' : 'bg-white/5 hover:bg-white/10'
  }`;

  return (
    <div className="space-y-3 pt-2">
      {canSearchMedia ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            search();
          }}
        >
          <Input
            type="search"
            size="small"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('media.search.placeholder')}
            aria-label={t('media.search')}
            variant="soft"
          />
          <button
            type="submit"
            aria-label={t('media.search')}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${controller.surface.border} ${controller.surface.textPrimary} ${
              controller.isGlass ? 'bg-white/8' : 'bg-white/5'
            }`}
          >
            <Search className="h-4 w-4" />
          </button>
        </form>
      ) : null}

      <div className="flex min-h-9 items-center gap-2">
        {history.length > 0 ? (
          <button
            type="button"
            aria-label={t('dashboard.onboarding.back')}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${controller.surface.border}`}
            onClick={() => {
              const nextHistory = history.slice(0, -1);
              browse(nextHistory.at(-1), nextHistory);
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : null}
        <h3
          className="min-w-0 truncate text-sm font-semibold"
          style={controller.readableForeground.titleStyle}
        >
          {history.at(-1)?.title ?? browseResult?.title ?? t('media.browse')}
        </h3>
      </div>

      {isLoading && items.length === 0 ? (
        <p className={`py-8 text-center text-sm ${controller.surface.textSecondary}`}>
          {t('common.loading')}
        </p>
      ) : items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => {
            const isDirectory = item.canExpand && !item.canPlay;
            const itemKey = `${item.mediaContentType ?? 'media'}:${item.mediaContentId ?? item.title}`;
            const isSpotify = history.length === 0 && isDirectory && isSpotifyBrowseItem(item);
            const shouldShowArtwork = !isDirectory || isArtworkDirectory(item);
            const resolvedMetadata = metadataByItemKey[itemKey];
            const providerThumbnailUrl = failedThumbnails.has(itemKey)
              ? null
              : (resolvedThumbnails.get(resolveBrowserThumbnail(item.thumbnail) ?? '') ?? null);
            const thumbnailUrl =
              isSpotify || !shouldShowArtwork
                ? null
                : (providerThumbnailUrl ?? resolvedMetadata?.artworkUrl ?? null);
            const itemSubtitle =
              item.artist ??
              resolvedMetadata?.artistName ??
              item.album ??
              resolvedMetadata?.albumTitle;
            return (
              <button
                key={itemKey}
                type="button"
                className={itemClassName}
                onClick={() => (isDirectory ? browse(item, [...history, item]) : play(item))}
              >
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/12">
                  {isSpotify ? (
                    <svg
                      data-testid="spotify-browse-icon"
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-7 w-7 text-[#1DB954]"
                      fill="currentColor"
                    >
                      <path d={SPOTIFY_ICON_PATH} />
                    </svg>
                  ) : thumbnailUrl ? (
                    <img
                      data-testid="media-browse-artwork"
                      src={thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={() =>
                        setFailedThumbnails((current) => new Set(current).add(itemKey))
                      }
                    />
                  ) : isDirectory ? (
                    <Folder className="h-4 w-4" />
                  ) : (
                    <ListMusic className="h-4 w-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  {itemSubtitle ? (
                    <span className={`block truncate text-xs ${controller.surface.textSecondary}`}>
                      {itemSubtitle}
                    </span>
                  ) : null}
                </span>
                {!isDirectory && item.canPlay ? <Play className="h-4 w-4 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <p className={`py-8 text-center text-sm ${controller.surface.textSecondary}`}>
          {t('media.dashboard.browserEmpty')}
        </p>
      )}
    </div>
  );
}
