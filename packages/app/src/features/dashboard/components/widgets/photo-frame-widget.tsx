import { CardEmptyState } from '@navet/app/components/patterns';
import { BaseCard, RoundControlButton } from '@navet/app/components/primitives';
import { type CardSize, isCompactCardSize } from '@navet/app/components/shared/card-size-selector';
import { getThemeColorValue } from '@navet/app/components/shared/theme/theme-colors';
import { useAreaRooms, useI18n, useTheme } from '@navet/app/hooks';
import { useDeferredVisibility } from '@navet/app/hooks/use-deferred-visibility';
import { useResourceUrl } from '@navet/app/hooks/use-resource-url';
import { subscribeVisibilityAwareTask } from '@navet/app/utils/visibility-aware-scheduler';
import { ChevronLeft, ChevronRight, ImageIcon, Settings2, Shuffle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PhotoFrameImage } from './photo-frame-image';
import { PhotoFrameSettingsDialog } from './photo-frame-settings-dialog';
import { type PhotoFrameSourceMode, resolvePhotoFrameSourceMode } from './photo-frame-types';
import { usePhotoFrameSources } from './use-photo-frame-sources';
import { useDashboardWidgetRoomOptions } from './use-widget-room-options';
import { getDashboardWidgetSurfaceTokens } from './widget-surface-tokens';

const PHOTO_SHUFFLE_INTERVAL_MS = 8000;

interface PhotoFrameWidgetProps {
  size?: CardSize;
  room?: string;
  onRoomChange?: (room: string) => void;
  sourceMode?: PhotoFrameSourceMode;
  photoUrls?: string[];
  photoImages?: readonly PhotoFrameImage[];
  mediaSourceId?: string;
  shuffleEnabled?: boolean;
  onUpdateUrls?: (urls: string[]) => void;
  onSourceModeChange?: (mode: PhotoFrameSourceMode) => void;
  onMediaSourceIdChange?: (mediaSourceId: string) => void;
  onShuffleEnabledChange?: (enabled: boolean) => void;
  tintColor?: string;
  onTintColorChange?: (color: string) => void;
  isEditMode?: boolean;
  openSettingsRequestKey?: number;
}

export function PhotoFrameWidget({
  size = 'large',
  room,
  onRoomChange,
  sourceMode,
  photoUrls,
  photoImages,
  mediaSourceId,
  shuffleEnabled = true,
  onUpdateUrls,
  onSourceModeChange,
  onMediaSourceIdChange,
  onShuffleEnabledChange,
  tintColor,
  onTintColorChange,
  isEditMode: _isEditMode = false,
  openSettingsRequestKey = 0,
}: PhotoFrameWidgetProps) {
  const { theme, primaryColor } = useTheme();
  const { t } = useI18n();
  const rooms = useAreaRooms();
  const surface = getDashboardWidgetSurfaceTokens(theme, tintColor);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { roomValue, roomLabel, roomOptions } = useDashboardWidgetRoomOptions(room, rooms);
  const isCompact = isCompactCardSize(size);
  const { ref: viewportRef, isVisible } = useDeferredVisibility<HTMLDivElement>({
    freezeOnceVisible: false,
    initiallyVisible: false,
    rootMargin: '180px 0px',
  });
  const resolvedSourceMode = resolvePhotoFrameSourceMode(sourceMode, mediaSourceId);
  const { activePhotoImages, hasCustomPhotos } = usePhotoFrameSources({
    sourceMode: resolvedSourceMode,
    photoUrls,
    photoImages,
    mediaSourceId,
  });

  const photoCount = activePhotoImages.length;
  const safeIndex = Math.min(currentIndex, Math.max(0, photoCount - 1));
  const currentPhotoImage = activePhotoImages[safeIndex];
  const currentPhotoUrl = useResourceUrl(
    currentPhotoImage?.src,
    resolvedSourceMode === 'home-assistant' ? 'home_assistant' : undefined
  );
  const showShuffleControl = photoCount > 1 && !isCompact;
  const photoFrameConfig = useMemo(
    () =>
      onUpdateUrls && onSourceModeChange && onMediaSourceIdChange
        ? {
            onUpdateUrls,
            onSourceModeChange,
            onMediaSourceIdChange,
          }
        : null,
    [onMediaSourceIdChange, onSourceModeChange, onUpdateUrls]
  );
  const canConfigure = photoFrameConfig !== null;
  const hasQuickActions = currentPhotoImage ? showShuffleControl || canConfigure : false;
  const chromeSize = size === 'large' ? 'medium' : size;
  const shouldUseCustomCardSurface = theme === 'light' || theme === 'glass';
  const imageMotionClassName = useMemo(
    () => (hasCustomPhotos ? 'scale-[1.02] transition-transform duration-[1800ms] ease-out' : ''),
    [hasCustomPhotos]
  );

  const nextPhoto = () => {
    setCurrentIndex((prev) => (prev + 1) % photoCount);
  };

  const prevPhoto = () => {
    setCurrentIndex((prev) => (prev - 1 + photoCount) % photoCount);
  };

  const jumpToRandomPhoto = useCallback(() => {
    if (photoCount <= 1) {
      return;
    }

    setCurrentIndex((prev) => {
      const nextIndex = Math.floor(Math.random() * (photoCount - 1));
      return nextIndex >= prev ? nextIndex + 1 : nextIndex;
    });
  }, [photoCount]);

  useEffect(() => {
    if (!shuffleEnabled || photoCount <= 1 || !isVisible) {
      return;
    }

    return subscribeVisibilityAwareTask(jumpToRandomPhoto, PHOTO_SHUFFLE_INTERVAL_MS);
  }, [isVisible, jumpToRandomPhoto, photoCount, shuffleEnabled]);

  useEffect(() => {
    if (currentIndex > photoCount - 1) {
      setCurrentIndex(0);
    }
  }, [currentIndex, photoCount]);

  useEffect(() => {
    if (openSettingsRequestKey > 0 && canConfigure) {
      setIsSettingsOpen(true);
    }
  }, [canConfigure, openSettingsRequestKey]);

  return (
    <BaseCard
      size={size}
      fullBleed
      style={
        hasCustomPhotos
          ? {
              ...(shouldUseCustomCardSurface ? surface.panelStyle : undefined),
              background: 'transparent',
              boxShadow: 'none',
            }
          : shouldUseCustomCardSurface
            ? surface.panelStyle
            : undefined
      }
      frameClassName="overflow-hidden"
      disableDefaultSheen
      contentClassName="h-full"
    >
      <div className="relative z-[2] flex h-full flex-col">
        {hasQuickActions ? (
          <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
            {showShuffleControl ? (
              <RoundControlButton
                theme={theme}
                size={chromeSize === 'small' ? 'small' : 'medium'}
                variant="soft"
                aria-label={t('widgets.photoFrame.shuffle')}
                className="shrink-0"
                onClick={(event) => {
                  event.stopPropagation();
                  jumpToRandomPhoto();
                }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <Shuffle className="h-3.5 w-3.5" />
              </RoundControlButton>
            ) : null}
            {canConfigure ? (
              <RoundControlButton
                theme={theme}
                size={chromeSize === 'small' ? 'small' : 'medium'}
                variant="soft"
                aria-label={t('widgets.photoFrame.settings.title')}
                className="shrink-0"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsSettingsOpen(true);
                }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <Settings2 className="h-3.5 w-3.5" />
              </RoundControlButton>
            ) : null}
          </div>
        ) : null}
        <div ref={viewportRef} className="group relative flex-1 overflow-hidden rounded-[inherit]">
          {currentPhotoImage ? (
            <picture>
              {currentPhotoImage?.sources?.map((source) => (
                <source
                  key={`${source.type}-${source.srcSet}`}
                  srcSet={source.srcSet}
                  type={source.type}
                />
              ))}
              <img
                src={currentPhotoUrl ?? undefined}
                alt=""
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                className={`absolute inset-0 h-full w-full object-cover ${imageMotionClassName}`}
              />
            </picture>
          ) : (
            <div className="flex h-full items-center justify-center p-4">
              <CardEmptyState
                title={t('widgets.photoFrame.title')}
                description={t('widgets.photoFrame.settings.noPhotos')}
                icon={ImageIcon}
                actionLabel={canConfigure ? t('widgets.photoFrame.settings.title') : undefined}
                onAction={canConfigure ? () => setIsSettingsOpen(true) : undefined}
                actionIcon={canConfigure ? Settings2 : undefined}
                size={size}
                accentColor={tintColor}
              />
            </div>
          )}
          {currentPhotoImage ? (
            <>
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.02)_22%,rgba(0,0,0,0.12)_66%,rgba(2,6,23,0.44)_100%)]" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
            </>
          ) : null}

          {/* Navigation Buttons */}
          {!isCompact && currentPhotoImage ? (
            <>
              <button
                type="button"
                onClick={prevPhoto}
                className="absolute left-3 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/12 bg-black/28 text-white/90 opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100"
                aria-label={t('carousel.previousSlide')}
              >
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>
              <button
                type="button"
                onClick={nextPhoto}
                className="absolute right-3 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/12 bg-black/28 text-white/90 opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100"
                aria-label={t('carousel.nextSlide')}
              >
                <ChevronRight className="w-5 h-5 text-white" />
              </button>
            </>
          ) : null}
        </div>

        {/* Thumbnail Dots */}
        {!isCompact && currentPhotoImage && photoCount > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center gap-3">
            {Array.from({ length: photoCount }).map((_, index) => (
              <button
                type="button"
                key={`photo-dot-${index}`}
                onClick={() => setCurrentIndex(index)}
                aria-label={`${t('widgets.photoFrame.title')} ${index + 1} / ${photoCount}`}
                aria-current={index === safeIndex ? 'true' : undefined}
                className="pointer-events-auto h-2 w-2 rounded-full transition-[color,background-color,border-color,box-shadow,opacity,transform,filter]"
                style={{
                  backgroundColor:
                    index === safeIndex
                      ? getThemeColorValue(primaryColor)
                      : 'rgba(255, 255, 255, 0.45)',
                }}
              />
            ))}
          </div>
        )}

        {canConfigure ? (
          <PhotoFrameSettingsDialog
            isOpen={isSettingsOpen}
            onOpenChange={setIsSettingsOpen}
            roomValue={roomValue}
            roomLabel={roomLabel}
            roomOptions={roomOptions}
            onRoomChange={onRoomChange}
            sourceMode={resolvedSourceMode}
            onSourceModeChange={photoFrameConfig.onSourceModeChange}
            photoUrls={photoUrls ?? []}
            onUpdateUrls={photoFrameConfig.onUpdateUrls}
            mediaSourceId={mediaSourceId}
            onMediaSourceIdChange={photoFrameConfig.onMediaSourceIdChange}
            shuffleEnabled={shuffleEnabled}
            onShuffleEnabledChange={onShuffleEnabledChange}
            tintColor={tintColor}
            onTintColorChange={onTintColorChange}
          />
        ) : null}
      </div>
    </BaseCard>
  );
}
