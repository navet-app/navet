import { BaseCard } from '@navet/app/components/primitives';
import { EntityCardHeader } from '@navet/app/components/primitives/entity-card-header';
import { EntityCardTitleBlock } from '@navet/app/components/primitives/entity-card-title-block';
import { type CardSize, isCompactCardSize } from '@navet/app/components/shared/card-size-selector';
import { companionEntityNameTypography } from '@navet/app/components/shared/companion-row-presentation';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { useI18n } from '@navet/app/hooks';
import { useTheme } from '@navet/app/hooks/use-theme';
import type { TranslationKey } from '@navet/app/i18n';
import type { PlatformCameraState } from '@navet/app/platform/provider-feature-models';
import type { CameraFitMode, CameraViewMode } from '@navet/app/stores/settings-store';
import { Camera, Eye, PersonStanding, Radio, RefreshCw, Settings2 } from 'lucide-react';
import { type KeyboardEvent, type RefObject, useEffect, useState } from 'react';
import { CameraSnapshotImage } from './camera-snapshot-image';
import { CameraStreamHostSlot } from './camera-stream-host-slot';
import type { CameraImageSourceKind, CameraStreamType } from './camera-view-mode';
import type { CameraCardImageSource } from './types';

interface CameraCardViewProps {
  id: string;
  name: string;
  room: string;
  cardRef?: RefObject<HTMLDivElement | null>;
  imageUrl: string | undefined;
  imageSources?: readonly CameraCardImageSource[];
  streamHost?: HTMLDivElement | null;
  cameraState: PlatformCameraState;
  statusChangedAt: number | null;
  motionDetected: boolean;
  motionDetectionTarget: 'motion' | 'person';
  motionChangedAt: number | null;
  motionDetectionEnabled: boolean | null;
  now: number;
  size: CardSize;
  isEditMode: boolean;
  presentation?: 'card' | 'mosaic-tile';
  cameraViewMode: CameraViewMode;
  fitMode: CameraFitMode;
  isStreamCapable: boolean;
  frontendStreamTypes: readonly CameraStreamType[];
  streamKind: CameraImageSourceKind;
  streamLabelOverride?: string;
  isStreamReady?: boolean;
  isStreamReadinessOpaque?: boolean;
  isStreamFallback: boolean;
  onRefresh: () => void;
  onImageError: () => void;
  onOpenSettings: () => void;
  onOpenViewer: () => void;
  onToggleMotionDetection: () => void;
}

function formatElapsedCompact(now: number, since: number | null) {
  if (!since) {
    return null;
  }

  const diffSeconds = Math.max(0, Math.floor((now - since) / 1000));
  if (diffSeconds < 60) {
    return `${diffSeconds}s`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  return `${Math.floor(diffHours / 24)}d`;
}

function getCameraStatusLabel(
  t: (key: TranslationKey) => string,
  cameraState: PlatformCameraState,
  isFeedRunning: boolean,
  isStreamPending: boolean
) {
  if (isFeedRunning) {
    return t('camera.status.live');
  }

  if (isStreamPending) {
    return t('camera.loadingFeed');
  }

  if (cameraState === 'off') {
    return t('common.off');
  }

  return null;
}

export function CameraCardView({
  id,
  name,
  room,
  cardRef,
  imageUrl,
  imageSources,
  streamHost,
  cameraState,
  statusChangedAt: _statusChangedAt,
  motionDetected,
  motionDetectionTarget,
  motionChangedAt,
  motionDetectionEnabled,
  now,
  size,
  isEditMode,
  presentation = 'card',
  cameraViewMode,
  fitMode,
  isStreamCapable,
  frontendStreamTypes,
  streamKind,
  streamLabelOverride,
  isStreamReady = false,
  isStreamReadinessOpaque = false,
  isStreamFallback,
  onRefresh,
  onImageError,
  onOpenSettings,
  onOpenViewer,
  onToggleMotionDetection,
}: CameraCardViewProps) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const [snapshotFailed, setSnapshotFailed] = useState(false);

  useEffect(() => {
    setSnapshotFailed(false);
  }, [imageUrl]);

  const surface = getThemeSurfaceTokens(theme);
  const isMosaicTile = presentation === 'mosaic-tile';
  const isCompact = isCompactCardSize(size);
  const isLightTheme = theme === 'light';
  const isGlassTheme = theme === 'glass';
  const isUnavailable = cameraState === 'unavailable';
  const isRunning = cameraState !== 'off' && !isUnavailable;
  const effectiveImageUrl = snapshotFailed ? undefined : imageUrl;
  const hasVisualBackground = Boolean(streamHost) || Boolean(effectiveImageUrl);
  const showRefreshButton =
    isRunning &&
    !isEditMode &&
    (cameraViewMode === 'snapshot' || isStreamFallback || !isStreamCapable);
  const hasLiveStream = Boolean(streamHost) && !isUnavailable;
  const motionLabel = motionDetected ? t('camera.motion.detected') : null;
  const MotionDetectedIcon = motionDetectionTarget === 'person' ? PersonStanding : Radio;
  const [snapshotLoadedAt, setSnapshotLoadedAt] = useState<number | null>(null);
  useEffect(() => {
    setSnapshotLoadedAt(null);
  }, [id]);
  const snapshotAge = formatElapsedCompact(now, snapshotLoadedAt);
  const motionElapsed = formatElapsedCompact(now, motionChangedAt);
  let streamLabel = isStreamCapable
    ? t('camera.viewer.streamCapable')
    : t('camera.viewer.snapshotOnly');
  if (streamKind === 'snapshot') {
    streamLabel = t('camera.settings.viewMode.snapshot');
  } else if (frontendStreamTypes.length > 0) {
    streamLabel = frontendStreamTypes.join('/').toUpperCase();
  }
  if (streamKind === 'hls') {
    streamLabel = 'HLS';
  } else if (streamKind === 'mse') {
    streamLabel = 'MSE';
  } else if (streamKind === 'web_rtc') {
    streamLabel = 'RTC';
  }
  const resolvedStreamLabel = isStreamFallback
    ? t('camera.viewer.snapshotFallback')
    : (streamLabelOverride ?? streamLabel);
  const isFeedRunning =
    hasLiveStream && streamKind !== 'snapshot' && !isStreamReadinessOpaque && isStreamReady;
  const isStreamPending =
    hasLiveStream && streamKind !== 'snapshot' && !isStreamReadinessOpaque && !isStreamReady;
  const statusLabel = isUnavailable
    ? t('camera.status.unavailable')
    : cameraState === 'off'
      ? t('common.off')
      : !hasLiveStream
        ? t('camera.settings.viewMode.snapshot')
        : isStreamReadinessOpaque
          ? resolvedStreamLabel
          : getCameraStatusLabel(t, cameraState, isFeedRunning, isStreamPending);
  const showStreamLabel = Boolean(
    hasLiveStream &&
      !isStreamReadinessOpaque &&
      resolvedStreamLabel &&
      (streamKind === 'snapshot' || isStreamFallback)
  );
  const snapshotFitClassName = fitMode === 'contain' ? 'object-contain' : 'object-cover';
  const overlayButtonClassName = isLightTheme
    ? 'border border-slate-300/80 bg-white/92 text-slate-900 shadow-sm backdrop-blur-sm transition-colors hover:bg-white'
    : 'bg-black/38 text-white/82 backdrop-blur-sm transition-colors hover:bg-black/58 hover:text-white';
  const motionButtonClassName =
    motionDetectionEnabled && !isLightTheme
      ? 'bg-emerald-500/58 hover:bg-emerald-500/75'
      : motionDetectionEnabled
        ? 'border border-emerald-300/80 bg-white/92 text-emerald-700 shadow-sm hover:bg-white'
        : overlayButtonClassName;
  const usesLightOverlayText = !isLightTheme || hasVisualBackground;
  const statusTextClassName = isLightTheme ? surface.textPrimary : 'text-white';
  const statusMutedTextClassName = isLightTheme ? surface.textSecondary : 'text-white/78';
  const statusSubtleTextClassName = isLightTheme ? surface.textMuted : 'text-white/58';
  const motionTextClassName = motionDetected
    ? !isLightTheme && usesLightOverlayText
      ? 'text-emerald-100'
      : 'text-emerald-700'
    : !isLightTheme && usesLightOverlayText
      ? 'text-white/68'
      : surface.textSecondary;
  const titleClassName = usesLightOverlayText
    ? 'leading-tight text-white drop-shadow-[0_4px_14px_rgba(0,0,0,0.92)]'
    : `leading-tight ${surface.textPrimary}`;
  const subtitleClassName = usesLightOverlayText
    ? 'text-white/92 drop-shadow-[0_3px_10px_rgba(0,0,0,0.88)]'
    : surface.textSecondary;
  const emptyStateClassName = isLightTheme
    ? 'absolute inset-0 flex flex-col items-center justify-center gap-1'
    : 'absolute inset-0 flex flex-col items-center justify-center gap-1';
  const emptyStateIconClassName = isLightTheme
    ? 'h-8 w-8 text-slate-400'
    : isGlassTheme
      ? 'h-8 w-8 text-white/42'
      : 'h-8 w-8 text-zinc-500';
  const emptyStateTextClassName = isLightTheme
    ? 'text-xs text-slate-500'
    : isGlassTheme
      ? 'text-xs text-white/58'
      : 'text-xs text-zinc-500';
  const snapshotFallback = (
    <div className={emptyStateClassName} data-testid="camera-snapshot-fallback">
      <Camera className={emptyStateIconClassName} />
      {!isUnavailable ? (
        <span className={emptyStateTextClassName}>{t('camera.status.noSnapshot')}</span>
      ) : null}
    </div>
  );

  return (
    <div ref={cardRef} className="h-full w-full" data-entity-id={id}>
      <BaseCard
        size={size}
        className={`isolate ${isMosaicTile ? 'rounded-none border-0' : ''}`}
        fullBleed
        interactive={!isEditMode}
        frameClassName={isLightTheme ? surface.cardShadow : isGlassTheme ? '' : 'bg-zinc-900'}
        disableDefaultSheen={isMosaicTile || !isGlassTheme}
        role={!isEditMode ? 'button' : undefined}
        tabIndex={!isEditMode ? 0 : undefined}
        onClick={!isEditMode ? onOpenViewer : undefined}
        onKeyDown={
          !isEditMode
            ? (event: KeyboardEvent<HTMLDivElement>) => {
                if (event.target !== event.currentTarget) {
                  return;
                }
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onOpenViewer();
                }
              }
            : undefined
        }
        aria-label={!isEditMode ? `${t('camera.actions.openViewer')}: ${name}` : undefined}
        overlay={
          <div className="absolute inset-0 z-0 overflow-hidden">
            {effectiveImageUrl && !hasLiveStream ? (
              <CameraSnapshotImage
                src={effectiveImageUrl}
                sources={imageSources}
                alt={name}
                className={`absolute inset-0 h-full w-full ${snapshotFitClassName}`}
                fallback={snapshotFallback}
                onLoad={() => setSnapshotLoadedAt(Date.now())}
                onError={() => {
                  setSnapshotFailed(true);
                  onImageError();
                }}
              />
            ) : null}

            {hasLiveStream && streamHost ? (
              <CameraStreamHostSlot host={streamHost} transparentMediaSurface={isGlassTheme} />
            ) : (
              !effectiveImageUrl && snapshotFallback
            )}
          </div>
        }
        contentClassName="relative z-10 h-full"
      >
        {hasVisualBackground ? (
          <>
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b to-transparent ${
                isGlassTheme ? 'from-slate-950/38 via-slate-950/12' : 'from-black/55 via-black/20'
              }`}
            />
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t to-transparent ${
                isGlassTheme ? 'from-slate-950/58 via-slate-950/24' : 'from-black/75 via-black/40'
              }`}
            />
          </>
        ) : null}

        {showRefreshButton && !isMosaicTile && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRefresh();
            }}
            aria-label={t('camera.actions.refreshSnapshot')}
            className={`absolute top-3 left-3 z-30 flex h-8 w-8 items-center justify-center rounded-full ${overlayButtonClassName}`}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )}

        <div
          className={`absolute top-3 right-3 z-30 inline-flex max-w-[calc(100%-3.75rem)] items-center gap-1.5 text-xs font-medium ${
            !isLightTheme && usesLightOverlayText ? '[text-shadow:0_1px_2px_rgba(0,0,0,0.98)]' : ''
          } ${statusTextClassName}`}
        >
          <div className="inline-flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isFeedRunning
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.72)]'
                  : !isLightTheme && usesLightOverlayText
                    ? 'bg-white/45'
                    : 'bg-slate-400'
              }`}
            />
            {statusLabel ? (
              <span className={isMosaicTile && isFeedRunning ? 'sr-only' : undefined}>
                {statusLabel}
              </span>
            ) : null}
          </div>
          {!hasLiveStream && !isUnavailable && snapshotAge ? (
            <span className={statusMutedTextClassName}>
              {t('camera.snapshot.loaded', { age: snapshotAge })}
            </span>
          ) : null}
          {motionLabel ? (
            <>
              <span className={statusSubtleTextClassName}>/</span>
              <span
                className={`inline-flex items-center gap-1 ${motionTextClassName}`}
                data-testid="camera-motion-indicator"
                data-motion-target={motionDetectionTarget}
              >
                <MotionDetectedIcon
                  aria-hidden="true"
                  className="h-3 w-3 shrink-0 opacity-80"
                  data-testid={
                    motionDetectionTarget === 'person'
                      ? 'camera-person-motion-icon'
                      : 'camera-motion-icon'
                  }
                />
                <span>{motionLabel}</span>
                {motionElapsed ? <span className="text-current/62"> {motionElapsed}</span> : null}
              </span>
            </>
          ) : null}
          {showStreamLabel ? (
            <>
              <span className={statusSubtleTextClassName}>/</span>
              <span className={`min-w-0 truncate ${statusMutedTextClassName}`}>
                {resolvedStreamLabel}
              </span>
            </>
          ) : null}
        </div>

        <div
          data-testid="camera-card-identity"
          className="absolute inset-x-0 bottom-0 z-20 px-3 pt-10 pb-3"
        >
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0 flex-1">
              {isMosaicTile ? (
                <EntityCardTitleBlock
                  title={name}
                  subtitle=""
                  titleClassName={`truncate ${companionEntityNameTypography} ${titleClassName} opacity-50`}
                />
              ) : (
                <EntityCardHeader
                  title={name}
                  subtitle={isCompact ? '' : room}
                  layout="eyebrow-first"
                  size={size}
                  titleClassName={titleClassName}
                  subtitleClassName={subtitleClassName}
                  className="!mb-0 min-w-0"
                  contentClassName="text-left"
                />
              )}
            </div>

            {!isEditMode && !isMosaicTile && (
              <div className="flex shrink-0 items-center gap-2">
                {motionDetectionEnabled !== null ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleMotionDetection();
                    }}
                    aria-label={
                      motionDetectionEnabled
                        ? t('camera.actions.disableMotionDetection')
                        : t('camera.actions.enableMotionDetection')
                    }
                    className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-sm transition-colors ${motionButtonClassName}`}
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenSettings();
                  }}
                  aria-label={t('camera.actions.openSettings')}
                  className={`flex h-8 w-8 items-center justify-center rounded-full ${overlayButtonClassName}`}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </BaseCard>
    </div>
  );
}
