import { useMediaArtwork } from '@navet/app/features/media/hooks/use-media-artwork';
import { useResourceUrl } from '@navet/app/hooks/use-resource-url';
import type { ResolvedPlatformResource } from '@navet/app/platform/resources';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import { useCallback, useEffect, useState } from 'react';

interface UseMediaArtworkResolutionParams {
  entityId: string;
  providerId?: IntegrationProviderId;
  artworkKey?: string;
  artworkVersionKey?: string;
  liveEntityPicture?: string;
  liveArtworkKey?: string;
  liveAttrs?: Record<string, unknown>;
  homeAssistantUrl?: string;
}

const ARTWORK_CLEAR_DELAY_MS = 700;

export function useMediaArtworkResolution({
  entityId,
  providerId,
  artworkKey,
  artworkVersionKey,
  liveEntityPicture,
  liveArtworkKey,
  liveAttrs,
  homeAssistantUrl: _homeAssistantUrl,
}: UseMediaArtworkResolutionParams) {
  const [failedArtworkUrl, setFailedArtworkUrl] = useState<string | null>(null);
  const artworkRequestKey = [entityId, liveArtworkKey ?? artworkKey, artworkVersionKey]
    .filter(Boolean)
    .join('::');
  const artworkResource = useMediaArtwork({
    entityId,
    providerId,
    attrs: {
      ...liveAttrs,
      entity_picture: liveEntityPicture,
    },
    fallbackPicture: liveEntityPicture,
    artworkKey: artworkRequestKey,
  });
  const directArtwork = useResourceUrl(liveEntityPicture, providerId);
  const fallbackArtwork =
    artworkResource?.kind === 'image' ? (artworkResource.url ?? directArtwork) : directArtwork;

  useEffect(() => {
    if (!fallbackArtwork) {
      const timeoutId = window.setTimeout(() => {
        setFailedArtworkUrl(null);
      }, ARTWORK_CLEAR_DELAY_MS);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }
  }, [fallbackArtwork]);

  // Clear the failed URL only when the track/content actually changes — never on error state changes.
  // Previously this effect also depended on failedArtworkUrl, which caused a reset loop:
  // error → failedArtworkUrl set → effect re-ran → failedArtworkUrl cleared → artwork re-shown → error again.
  useEffect(() => {
    void artworkRequestKey;
    setFailedArtworkUrl(null);
  }, [artworkRequestKey]);

  // Derived: hide artwork only if the current URL is the one that just failed.
  const albumArt =
    failedArtworkUrl !== null && failedArtworkUrl === fallbackArtwork ? null : fallbackArtwork;

  const handleArtworkError = useCallback((imageUrl?: string | null) => {
    if (!imageUrl) return;
    setFailedArtworkUrl(imageUrl);
  }, []);

  const visibleArtworkResource: ResolvedPlatformResource | null =
    albumArt && artworkResource?.kind === 'image' && artworkResource.url === albumArt
      ? artworkResource
      : null;

  return { albumArt, artworkResource: visibleArtworkResource, handleArtworkError };
}
