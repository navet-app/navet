import { useEditModeSettingsRequest } from '@navet/app/components/shared/edit-mode-settings-request';
import { readNavetCameraState } from '@navet/app/core/navet-device-state';
import { resolveDashboardPerformanceProfile } from '@navet/app/features/dashboard/hooks/use-dashboard-performance-mode';
import {
  normalizeCameraDirectStreamUrl,
  useCameraPlaybackPlan,
} from '@navet/app/features/security/hooks/use-camera-playback-plan';
import { useI18n, useProviderCameraTopology } from '@navet/app/hooks';
import { useProviderEntityModel } from '@navet/app/hooks/use-provider-device';
import { useResourceUrl } from '@navet/app/hooks/use-resource-url';
import type {
  PlatformCameraTransport,
  PlatformEntitySnapshot,
} from '@navet/app/platform/provider-feature-models';
import { integrationCameraFeatureService } from '@navet/app/services/integration-camera-feature.service';
import { settingsSelectors } from '@navet/app/stores/selectors';
import {
  type CameraStreamPreference,
  type CameraViewMode,
  type CameraWebRtcStreamSource,
  isDirectCameraStreamSource,
  useSettingsStore,
} from '@navet/app/stores/settings-store';
import { detectDeviceTier } from '@navet/app/utils/detect-device-tier';
import {
  createProviderScopedId,
  getProviderNativeId,
  parseProviderScopedId,
} from '@navet/app/utils/provider-ids';
import { subscribeVisibilityAwareTask } from '@navet/app/utils/visibility-aware-scheduler';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import { isCameraFullscreenTelemetryAccessory } from './camera-accessory-visibility';
import {
  useCameraLiveStreamSlot,
  useRetainedCameraStreamVisibility,
} from './camera-live-stream-budget';
import { CameraLiveViewer } from './camera-live-viewer';
import { CameraSettingsDialog } from './camera-settings-dialog';
import { CameraStreamPlayer } from './camera-stream-player';
import {
  appendCameraCacheBuster,
  normalizeCameraSnapshotUrl,
  resolveDashboardCameraViewMode,
  resolveViewerInitialCameraViewMode,
} from './camera-view-mode';
import { isOpaqueGo2RtcStreamResource } from './go2rtc-viewer-presentation';
import type { CameraCardProps } from './types';
import { useProviderCameraLiveData } from './use-provider-camera-live-data';
import { CameraCardView } from './view';

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function readImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

const CAMERA_CLOCK_INTERVAL_MS = 30_000;
const CAMERA_STREAM_RETRY_DELAY_MS = 5_000;
const cameraClockSubscribers = new Set<() => void>();
let cameraClockNow = Date.now();
let cameraClockCleanup: (() => void) | null = null;

function subscribeToCameraClock(callback: () => void) {
  cameraClockSubscribers.add(callback);

  if (cameraClockCleanup === null) {
    cameraClockNow = Date.now();
    cameraClockCleanup = subscribeVisibilityAwareTask(() => {
      cameraClockNow = Date.now();
      for (const subscriber of cameraClockSubscribers) {
        subscriber();
      }
    }, CAMERA_CLOCK_INTERVAL_MS);
  }

  return () => {
    cameraClockSubscribers.delete(callback);

    if (cameraClockSubscribers.size === 0) {
      cameraClockCleanup?.();
      cameraClockCleanup = null;
    }
  };
}

function getCameraClockSnapshot() {
  return cameraClockNow;
}

function useCameraClock(enabled: boolean) {
  return useSyncExternalStore(
    enabled ? subscribeToCameraClock : () => () => {},
    getCameraClockSnapshot,
    getCameraClockSnapshot
  );
}

function useCameraCardVisibility() {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = cardRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry?.isIntersecting ?? true);
      },
      {
        rootMargin: '240px 0px',
        threshold: 0.01,
      }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { cardRef, isVisible };
}

export const CameraCardContainer = memo(function CameraCardContainer({
  id,
  name,
  room,
  entityPicture: initialEntityPicture,
  entityPictureSources: initialEntityPictureSources,
  isStreamCapable: initialIsStreamCapable,
  size,
  isEditMode,
  presentation = 'card',
}: CameraCardProps) {
  const { t } = useI18n();
  const providerEntity = useProviderEntityModel(id);
  const disableAnimations = useSettingsStore(settingsSelectors.disableAnimations);
  const lowPowerMode = useSettingsStore(settingsSelectors.lowPowerMode);
  const effectsQuality = useSettingsStore(settingsSelectors.effectsQuality);
  const cameraDashboardViewMode = useSettingsStore(
    settingsSelectors.cameraDashboardViewModeForEntity(id)
  );
  const hasCameraViewModeOverride = useSettingsStore(
    settingsSelectors.hasCameraViewModeOverrideForEntity(id)
  );
  const cameraStreamPreference = useSettingsStore(
    settingsSelectors.cameraStreamPreferenceForEntity(id)
  );
  const cameraWebRtcStreamSource = useSettingsStore(
    settingsSelectors.cameraWebRtcStreamSourceForEntity(id)
  );
  const cameraDirectStreamUrl = useSettingsStore(
    settingsSelectors.cameraDirectStreamUrlForEntity(id)
  );
  const hasConfiguredDirectStream =
    isDirectCameraStreamSource(cameraWebRtcStreamSource) &&
    normalizeCameraDirectStreamUrl(cameraDirectStreamUrl) !== null;
  const cameraFitMode = useSettingsStore(settingsSelectors.cameraFitModeForEntity(id));
  const cameraFullscreenVisibleAccessoryIds = useSettingsStore(
    settingsSelectors.cameraFullscreenVisibleAccessoryIdsForEntity(id)
  );
  const updateCameraViewMode = useSettingsStore(settingsSelectors.updateCameraViewMode);
  const updateCameraStreamPreference = useSettingsStore(
    settingsSelectors.updateCameraStreamPreference
  );
  const updateCameraWebRtcStreamSource = useSettingsStore(
    settingsSelectors.updateCameraWebRtcStreamSource
  );
  const updateCameraDirectStreamUrl = useSettingsStore(
    settingsSelectors.updateCameraDirectStreamUrl
  );
  const updateCameraFitMode = useSettingsStore(settingsSelectors.updateCameraFitMode);
  const updateCameraFullscreenAccessoryVisibility = useSettingsStore(
    settingsSelectors.updateCameraFullscreenAccessoryVisibility
  );
  const { siblingIds: deviceEntityIds } = useProviderCameraTopology(id);
  const { cameraState, companionStates, deviceEntities, liveEntity, liveState } =
    useProviderCameraLiveData(id, deviceEntityIds);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewerCameraViewMode, setViewerCameraViewMode] = useState<CameraViewMode>('live');
  const [failedStreamTypes, setFailedStreamTypes] = useState<PlatformCameraTransport[]>([]);
  const [directStreamFailed, setDirectStreamFailed] = useState(false);
  const [isStreamReady, setIsStreamReady] = useState(false);
  const [streamPortalHost] = useState(() => {
    if (typeof document === 'undefined') return null;
    const host = document.createElement('div');
    host.className = 'relative h-full w-full';
    host.dataset.cameraStreamHost = id;
    return host;
  });
  const streamRetryTimeoutRef = useRef<number | null>(null);
  const { cardRef, isVisible } = useCameraCardVisibility();
  const isStreamVisibilityRetained = useRetainedCameraStreamVisibility(isVisible);
  const now = useCameraClock(isVisible || isViewerOpen);

  const liveAttrs = liveEntity?.attributes as Record<string, unknown> | undefined;
  const providerState = readNavetCameraState(providerEntity);
  const liveEntityPicture =
    readImageUrl(liveAttrs?.entity_picture_local) ?? readImageUrl(liveAttrs?.entity_picture);
  const initialSnapshotUrl =
    readImageUrl(initialEntityPicture) ??
    readImageUrl(
      typeof providerState?.entityPicture === 'string' ? providerState.entityPicture : undefined
    );
  const baseSnapshotUrl = normalizeCameraSnapshotUrl(liveEntityPicture ?? initialSnapshotUrl);
  const imageSources = liveEntityPicture ? undefined : initialEntityPictureSources;
  const snapshotUrl =
    useResourceUrl(appendCameraCacheBuster(baseSnapshotUrl, refreshKey), 'home_assistant') ??
    undefined;
  const hasSnapshot = Boolean(liveEntityPicture ?? initialSnapshotUrl);
  const isStreamCapable =
    liveState.isStreamCapable ||
    providerState?.isStreamCapable === true ||
    (initialIsStreamCapable ?? false);
  const performanceProfile = useMemo(
    () =>
      resolveDashboardPerformanceProfile({
        activeSection: 'security',
        deviceTier: detectDeviceTier(),
        effectsQuality,
        isEditMode,
        lowPowerMode,
        reducedEffectsEnabled: disableAnimations || lowPowerMode,
        visibleCardCount: 1,
        visibleDevices: [],
      }),
    [disableAnimations, effectsQuality, isEditMode, lowPowerMode]
  );
  const effectiveDashboardCameraViewMode = resolveDashboardCameraViewMode({
    cameraDashboardViewMode,
    hasCameraViewModeOverride,
    lowPowerMode,
    effectsQuality,
    hasSnapshot,
  });
  const playbackModel = useCameraPlaybackPlan({
    entityId: id,
    webRtcStreamSource: cameraWebRtcStreamSource,
    directStreamUrl: cameraDirectStreamUrl,
    cameraState,
    preferredMode: effectiveDashboardCameraViewMode,
    preferredTransport: cameraStreamPreference,
    snapshotUrl,
    isStreamCapable,
    motionDetectionEnabled: liveState.motionDetectionEnabled,
    failedTransports: new Set(failedStreamTypes),
    directStreamFailed,
  });
  const supportedProviderTransports =
    playbackModel?.supportedTransports ?? playbackModel?.liveTransports ?? [];
  const effectiveCameraStreamPreference =
    cameraStreamPreference === 'auto' ||
    supportedProviderTransports.includes(cameraStreamPreference)
      ? cameraStreamPreference
      : 'auto';
  const isDirectStreamResource =
    playbackModel?.selectedStreamResource?.kind === 'webrtc_stream' &&
    playbackModel.selectedStreamResource.metadata?.source === 'direct_stream_url';
  const isStreamReadinessOpaque = isOpaqueGo2RtcStreamResource(
    playbackModel?.selectedStreamResource,
    window.location.href
  );

  useEditModeSettingsRequest(id, () => setIsSettingsOpen(true), isEditMode);

  useEffect(() => {
    if (!isViewerOpen) {
      return;
    }

    setViewerCameraViewMode(
      resolveViewerInitialCameraViewMode({
        isStreamCapable: isStreamCapable || hasConfiguredDirectStream,
        hasSnapshot,
      })
    );
  }, [hasConfiguredDirectStream, hasSnapshot, isStreamCapable, isViewerOpen]);

  useEffect(() => {
    return () => {
      if (streamRetryTimeoutRef.current !== null) {
        window.clearTimeout(streamRetryTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => () => streamPortalHost?.remove(), [streamPortalHost]);

  useEffect(() => {
    if (isVisible) {
      return;
    }

    if (streamRetryTimeoutRef.current !== null) {
      window.clearTimeout(streamRetryTimeoutRef.current);
      streamRetryTimeoutRef.current = null;
    }
  }, [isVisible]);

  useEffect(() => {
    setFailedStreamTypes([]);
    setDirectStreamFailed(false);
    setIsStreamReady(false);
  }, [
    cameraDirectStreamUrl,
    cameraWebRtcStreamSource,
    effectiveCameraStreamPreference,
    effectiveDashboardCameraViewMode,
    id,
  ]);

  useEffect(() => {
    setIsStreamReady(false);
  }, [playbackModel?.selectedStreamResource?.cacheKey, playbackModel?.selectedTransport]);

  useEffect(() => {
    const refreshIntervalMs = playbackModel?.refreshPolicy.snapshotRefreshMs ?? null;
    const effectiveRefreshIntervalMs =
      refreshIntervalMs === null
        ? null
        : performanceProfile.reducePolling
          ? Math.max(refreshIntervalMs, 45_000)
          : refreshIntervalMs;
    if (
      !effectiveRefreshIntervalMs ||
      !snapshotUrl ||
      !isVisible ||
      cameraState === 'unavailable' ||
      playbackModel?.selectedTransport
    ) {
      return;
    }

    return subscribeVisibilityAwareTask(
      () => setRefreshKey((key) => key + 1),
      effectiveRefreshIntervalMs
    );
  }, [
    cameraState,
    isVisible,
    performanceProfile.reducePolling,
    playbackModel?.refreshPolicy.snapshotRefreshMs,
    playbackModel?.selectedTransport,
    snapshotUrl,
  ]);

  const siblingEntities = useMemo(() => {
    return deviceEntityIds
      .filter((eid) => {
        const domain = getProviderNativeId(eid).split('.')[0];
        return (
          domain === 'sensor' ||
          domain === 'binary_sensor' ||
          domain === 'switch' ||
          domain === 'light' ||
          domain === 'select' ||
          domain === 'number' ||
          domain === 'scene'
        );
      })
      .map((eid) => {
        const nativeEntityId = getProviderNativeId(eid);
        const entity = deviceEntities[nativeEntityId];
        const cameraProviderId = parseProviderScopedId(id)?.providerId;
        const accessoryEntityId =
          parseProviderScopedId(eid) || !cameraProviderId
            ? eid
            : createProviderScopedId(cameraProviderId, nativeEntityId);
        return entity ? { id: accessoryEntityId, entity } : null;
      })
      .filter((entry): entry is { id: string; entity: PlatformEntitySnapshot } => entry !== null);
  }, [deviceEntities, deviceEntityIds, id]);

  const motionStates = companionStates.filter((state) => state.type === 'motion');
  const motionDetected = motionStates.some((state) => state.detected);
  const motionState =
    motionStates.find((state) => state.detected && state.detectionTarget === 'person') ??
    motionStates.find((state) => state.detected) ??
    motionStates[0] ??
    null;
  const motionDetectionTarget = motionState?.detectionTarget ?? 'motion';
  const motionChangedAt = parseTimestamp(motionState?.changedAt);
  const statusChangedAt =
    parseTimestamp(liveEntity?.lastChanged) ?? parseTimestamp(liveEntity?.lastUpdated);

  const handleRefresh = useCallback(() => {
    setFailedStreamTypes([]);
    setDirectStreamFailed(false);
    setIsStreamReady(false);
    setRefreshKey((key) => key + 1);

    void integrationCameraFeatureService
      .refreshCameraSnapshot?.(id)
      .catch(() => undefined)
      .finally(() => {
        setRefreshKey((key) => key + 1);
      });
  }, [id]);

  const handleCameraViewModeChange = useCallback(
    (mode: CameraViewMode) => {
      updateCameraViewMode(id, mode);
      setFailedStreamTypes([]);
      setDirectStreamFailed(false);
      setIsStreamReady(false);
      setRefreshKey((key) => key + 1);
    },
    [id, updateCameraViewMode]
  );

  const handleCameraStreamPreferenceChange = useCallback(
    (preference: CameraStreamPreference) => {
      updateCameraStreamPreference(id, preference);
      setFailedStreamTypes([]);
      setDirectStreamFailed(false);
      setIsStreamReady(false);
      setRefreshKey((key) => key + 1);
    },
    [id, updateCameraStreamPreference]
  );

  const handleCameraWebRtcStreamSourceChange = useCallback(
    (source: CameraWebRtcStreamSource) => {
      updateCameraWebRtcStreamSource(id, source);
      setFailedStreamTypes([]);
      setDirectStreamFailed(false);
      setIsStreamReady(false);
      setRefreshKey((key) => key + 1);
    },
    [id, updateCameraWebRtcStreamSource]
  );

  const handleCameraDirectStreamUrlChange = useCallback(
    (url: string) => {
      updateCameraDirectStreamUrl(id, url);
      setFailedStreamTypes([]);
      setDirectStreamFailed(false);
      setIsStreamReady(false);
      setRefreshKey((key) => key + 1);
    },
    [id, updateCameraDirectStreamUrl]
  );

  const handleCameraFitModeChange = useCallback(
    (mode: 'cover' | 'contain') => {
      updateCameraFitMode(id, mode);
    },
    [id, updateCameraFitMode]
  );

  const handleFullscreenAccessoryVisibilityChange = useCallback(
    (accessoryEntityId: string, visible: boolean) => {
      updateCameraFullscreenAccessoryVisibility(id, accessoryEntityId, visible);
    },
    [id, updateCameraFullscreenAccessoryVisibility]
  );

  const fullscreenAccessoryEntities = useMemo(() => {
    const visibleIds = new Set(cameraFullscreenVisibleAccessoryIds);
    return siblingEntities.filter(
      (accessory) =>
        accessory.id.replace(/^[^:]+:/, '').startsWith('light.') || visibleIds.has(accessory.id)
    );
  }, [cameraFullscreenVisibleAccessoryIds, siblingEntities]);
  const cameraFullscreenHiddenAccessoryIds = useMemo(() => {
    const visibleIds = new Set(cameraFullscreenVisibleAccessoryIds);
    return siblingEntities
      .filter(isCameraFullscreenTelemetryAccessory)
      .filter((accessory) => !visibleIds.has(accessory.id))
      .map((accessory) => accessory.id);
  }, [cameraFullscreenVisibleAccessoryIds, siblingEntities]);

  const handleStreamError = useCallback(
    (kind: PlatformCameraTransport | 'snapshot', options?: { retryable?: boolean }) => {
      if (kind === 'snapshot') {
        return;
      }

      setIsStreamReady(false);
      if (kind === 'web_rtc' && isDirectStreamResource) {
        setDirectStreamFailed(true);
      } else {
        setFailedStreamTypes((current) => (current.includes(kind) ? current : [...current, kind]));
      }

      if (options?.retryable === false || hasSnapshot) {
        return;
      }

      if (streamRetryTimeoutRef.current !== null) {
        return;
      }

      if (!isVisible || document.visibilityState !== 'visible') {
        return;
      }

      streamRetryTimeoutRef.current = window.setTimeout(() => {
        streamRetryTimeoutRef.current = null;
        setFailedStreamTypes([]);
        setDirectStreamFailed(false);
        setRefreshKey((key) => key + 1);
      }, CAMERA_STREAM_RETRY_DELAY_MS);
    },
    [hasSnapshot, isDirectStreamResource, isVisible]
  );

  const handleToggleMotionDetection = useCallback(() => {
    const motionDetectionEnabled =
      playbackModel?.motionDetectionEnabled ?? liveState.motionDetectionEnabled;
    if (motionDetectionEnabled === null) {
      return;
    }

    void (motionDetectionEnabled
      ? integrationCameraFeatureService.disableCameraMotionDetection(id)
      : integrationCameraFeatureService.enableCameraMotionDetection(id));
  }, [id, liveState.motionDetectionEnabled, playbackModel?.motionDetectionEnabled]);

  const imageUrl = playbackModel?.snapshotResource?.url ?? snapshotUrl;
  const selectedStreamLabelOverride = isStreamReadinessOpaque
    ? t('camera.settings.webRtcStreamSource.direct')
    : isDirectStreamResource
      ? t('camera.settings.webRtcStreamSource.direct')
      : undefined;
  const hasDirectStreamUrlError =
    isDirectCameraStreamSource(cameraWebRtcStreamSource) &&
    cameraDirectStreamUrl.trim().length > 0 &&
    (directStreamFailed || normalizeCameraDirectStreamUrl(cameraDirectStreamUrl) === null);
  const selectedLiveStream = playbackModel?.selectedTransport ?? null;
  const maxConcurrentDashboardStreams =
    performanceProfile.effectiveEffectsQuality === 'low'
      ? 1
      : performanceProfile.effectiveEffectsQuality === 'medium'
        ? 2
        : Number.POSITIVE_INFINITY;
  const hasLiveStreamSlot = useCameraLiveStreamSlot({
    enabled: Boolean(selectedLiveStream) && isStreamVisibilityRetained && !isViewerOpen,
    isVisible,
    maxConcurrent: maxConcurrentDashboardStreams,
  });
  const shouldRenderLiveStream =
    (isViewerOpen || hasLiveStreamSlot) && selectedLiveStream ? selectedLiveStream : null;
  const streamKind = shouldRenderLiveStream ?? 'snapshot';
  const streamLabelOverride = shouldRenderLiveStream ? selectedStreamLabelOverride : undefined;
  const isDashboardStreamReadinessOpaque =
    Boolean(shouldRenderLiveStream) && isStreamReadinessOpaque;
  const loadingLabel = t('camera.loadingFeed');
  const webRtcTitle = t('camera.webRtcStreamTitle');
  const handleStreamLoad = useCallback(() => setIsStreamReady(true), []);

  useEffect(() => {
    if (!shouldRenderLiveStream) {
      setIsStreamReady(false);
    }
  }, [shouldRenderLiveStream]);

  const streamElement = useMemo(() => {
    if (!shouldRenderLiveStream) {
      return undefined;
    }

    return (
      <CameraStreamPlayer
        entityId={id}
        kind={shouldRenderLiveStream}
        posterUrl={imageUrl}
        streamResource={playbackModel?.selectedStreamResource ?? null}
        fitMode={cameraFitMode}
        loadingLabel={loadingLabel}
        webRtcTitle={webRtcTitle}
        onLoad={handleStreamLoad}
        onError={handleStreamError}
      />
    );
  }, [
    cameraFitMode,
    handleStreamError,
    handleStreamLoad,
    id,
    imageUrl,
    loadingLabel,
    playbackModel?.selectedStreamResource,
    shouldRenderLiveStream,
    webRtcTitle,
  ]);

  return (
    <>
      <CameraCardView
        id={id}
        name={name}
        room={room}
        cardRef={cardRef}
        imageUrl={imageUrl}
        imageSources={imageSources}
        streamHost={!isViewerOpen && shouldRenderLiveStream ? streamPortalHost : null}
        cameraState={cameraState}
        statusChangedAt={statusChangedAt}
        motionDetected={motionDetected}
        motionDetectionTarget={motionDetectionTarget}
        motionChangedAt={motionChangedAt}
        motionDetectionEnabled={
          playbackModel?.motionDetectionEnabled ?? liveState.motionDetectionEnabled
        }
        now={now}
        size={size}
        isEditMode={isEditMode}
        presentation={presentation}
        cameraViewMode={effectiveDashboardCameraViewMode}
        fitMode={cameraFitMode}
        isStreamCapable={playbackModel?.supportsStreaming ?? isStreamCapable}
        frontendStreamTypes={playbackModel?.liveTransports ?? []}
        streamKind={streamKind}
        streamLabelOverride={streamLabelOverride}
        isStreamReady={isStreamReady}
        isStreamReadinessOpaque={isDashboardStreamReadinessOpaque}
        isStreamFallback={playbackModel?.isSnapshotFallback ?? false}
        onRefresh={handleRefresh}
        onImageError={() => undefined}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenViewer={() => setIsViewerOpen(true)}
        onToggleMotionDetection={handleToggleMotionDetection}
      />

      {isViewerOpen && (
        <CameraLiveViewer
          isOpen={isViewerOpen}
          onOpenChange={setIsViewerOpen}
          entityId={id}
          name={name}
          room={room}
          cameraState={cameraState}
          snapshotUrl={snapshotUrl}
          snapshotSources={imageSources}
          cameraViewMode={viewerCameraViewMode}
          preferredTransport={effectiveCameraStreamPreference}
          webRtcStreamSource={cameraWebRtcStreamSource}
          directStreamUrl={cameraDirectStreamUrl}
          cameraFitMode={cameraFitMode}
          isStreamCapable={isStreamCapable}
          motionDetectionEnabled={
            playbackModel?.motionDetectionEnabled ?? liveState.motionDetectionEnabled
          }
          motionDetected={motionDetected}
          initialStreamResource={playbackModel?.selectedStreamResource ?? null}
          initialStreamTransport={shouldRenderLiveStream}
          initialStreamReady={isStreamReady}
          retainedStreamHost={streamPortalHost}
          accessoryEntities={fullscreenAccessoryEntities}
          onRefresh={handleRefresh}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onCameraViewModeChange={setViewerCameraViewMode}
          onPreferredTransportChange={handleCameraStreamPreferenceChange}
          onCameraFitModeChange={handleCameraFitModeChange}
        />
      )}

      {isSettingsOpen && (
        <CameraSettingsDialog
          entityId={id}
          name={name}
          isOpen={isSettingsOpen}
          onOpenChange={setIsSettingsOpen}
          siblingEntities={siblingEntities}
          cameraViewMode={effectiveDashboardCameraViewMode}
          cameraStreamPreference={effectiveCameraStreamPreference}
          cameraWebRtcStreamSource={cameraWebRtcStreamSource}
          cameraDirectStreamUrl={cameraDirectStreamUrl}
          cameraDirectStreamUrlError={hasDirectStreamUrlError}
          supportedStreamPreferences={supportedProviderTransports}
          supportsStreaming={isStreamCapable}
          hasSnapshot={hasSnapshot}
          lowPowerMode={lowPowerMode}
          cameraFitMode={cameraFitMode}
          fullscreenHiddenAccessoryIds={cameraFullscreenHiddenAccessoryIds}
          onCameraViewModeChange={handleCameraViewModeChange}
          onCameraStreamPreferenceChange={handleCameraStreamPreferenceChange}
          onCameraWebRtcStreamSourceChange={handleCameraWebRtcStreamSourceChange}
          onCameraDirectStreamUrlChange={handleCameraDirectStreamUrlChange}
          onCameraFitModeChange={handleCameraFitModeChange}
          onFullscreenAccessoryVisibilityChange={handleFullscreenAccessoryVisibilityChange}
        />
      )}

      {streamPortalHost && streamElement ? createPortal(streamElement, streamPortalHost) : null}
    </>
  );
});
