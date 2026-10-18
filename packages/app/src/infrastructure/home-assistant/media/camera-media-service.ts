import type {
  PlatformCameraCapabilities,
  PlatformCameraPlaybackModel,
  PlatformCameraState,
  PlatformCameraStream,
  PlatformCameraTransport,
} from '@navet/app/platform/provider-feature-models';
import type { ResolvedPlatformResource } from '@navet/app/platform/resources';
import { LruCache } from '@navet/app/utils/lru-cache';
import { getProviderNativeId } from '@navet/core/ids';
import type { HomeAssistantResourceResolver } from '../resources/resource-resolver';

interface CameraPlaybackPlanInput {
  entityId: string;
  webRtcStreamSource?: 'provider' | 'direct';
  directStreamUrl?: string;
  cameraState: PlatformCameraState;
  preferredMode: 'auto' | 'live' | 'snapshot';
  preferredTransport: 'auto' | PlatformCameraTransport;
  snapshotUrl?: string;
  isStreamCapable: boolean;
  motionDetectionEnabled: boolean | null;
  failedTransports?: ReadonlySet<PlatformCameraTransport>;
}

const CAMERA_RETRY_DELAYS_MS = [1_000, 3_000, 7_000];
const CAMERA_SNAPSHOT_REFRESH_MS = 10_000;
const CAMERA_FALLBACK_REFRESH_MS = 30_000;
const CAMERA_CAPABILITIES_TIMEOUT_MS = 750;
const CAMERA_CAPABILITIES_REFRESH_MS = 1_000;
const CAMERA_CAPABILITIES_CACHE_MAX_ENTRIES = 64;

function canAttemptLivePlayback(
  cameraState: PlatformCameraState,
  preferredMode: 'auto' | 'live' | 'snapshot'
) {
  return preferredMode !== 'snapshot' && cameraState !== 'unavailable' && cameraState !== 'off';
}

function cameraStateCanExposeStreamPreferences(cameraState: PlatformCameraState) {
  return cameraState !== 'unavailable' && cameraState !== 'off';
}

function normalizeDirectStreamUrl(value: string | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const streamUrl = new URL(trimmed, window.location.href);
    return streamUrl.protocol === 'http:' || streamUrl.protocol === 'https:'
      ? streamUrl.toString()
      : null;
  } catch {
    return null;
  }
}

function resolveDirectStreamResource(input: {
  entityId: string;
  directStreamUrl?: string;
}): ResolvedPlatformResource | null {
  const streamUrl = normalizeDirectStreamUrl(input.directStreamUrl);
  if (!streamUrl) {
    return null;
  }

  return {
    id: `${input.entityId}:direct:${streamUrl}`,
    kind: 'webrtc_stream',
    url: streamUrl,
    cacheKey: `${input.entityId}:direct:${streamUrl}`,
    authStrategy: 'none',
    metadata: { source: 'direct_stream_url' },
  };
}

export class CameraMediaService {
  private cachedStreamTypes = new LruCache<string, PlatformCameraTransport[]>(
    CAMERA_CAPABILITIES_CACHE_MAX_ENTRIES
  );
  private pendingStreamTypes = new Map<
    string,
    Promise<{
      streamTypes: PlatformCameraTransport[];
      shouldRetry: boolean;
    }>
  >();

  constructor(
    private resolver: HomeAssistantResourceResolver,
    private getCameraCapabilities: (entityId: string) => Promise<PlatformCameraCapabilities>,
    private getCameraStream: (entityId: string, format: 'hls') => Promise<PlatformCameraStream>,
    private getCameraStreamPaths: (
      entityId: string
    ) => Promise<Partial<Record<PlatformCameraTransport, string>>>
  ) {}

  async getPlaybackPlan(input: CameraPlaybackPlanInput): Promise<PlatformCameraPlaybackModel> {
    const nativeEntityId = getProviderNativeId(input.entityId);
    const failedTransports = input.failedTransports ?? new Set<PlatformCameraTransport>();

    const snapshotResource = input.snapshotUrl
      ? await this.resolver.resolve({
          kind: 'camera_snapshot',
          entityId: input.entityId,
          rawPath: input.snapshotUrl,
        })
      : null;

    const supportsSnapshot = Boolean(snapshotResource?.url);
    const canPlayLive = canAttemptLivePlayback(input.cameraState, input.preferredMode);
    const supportedTransports: PlatformCameraTransport[] = [];
    const liveTransports: PlatformCameraTransport[] = [];
    const fallbackTransports: PlatformCameraTransport[] = [];
    let selectedTransport: PlatformCameraTransport | null = null;
    let selectedStreamResource: ResolvedPlatformResource | null = null;
    let capabilitiesRefreshMs: number | undefined;
    let orderedStreamTypes: PlatformCameraTransport[] = [];
    let hlsStreamResourcePromise: Promise<ResolvedPlatformResource> | undefined;
    const resolveProviderHlsStream = () => {
      hlsStreamResourcePromise ??= (async () => {
        let hlsPath: string | undefined;
        try {
          const stream = await this.getCameraStream(nativeEntityId, 'hls');
          hlsPath = stream.url;
        } catch {
          const streamPaths = await this.getCameraStreamPaths(nativeEntityId);
          hlsPath = streamPaths.hls;
          if (!hlsPath) {
            throw new Error('No HLS stream path available');
          }
        }

        return await this.resolver.resolve({
          kind: 'camera_stream',
          entityId: input.entityId,
          stream: 'hls',
          rawPath: hlsPath,
        });
      })();
      return hlsStreamResourcePromise;
    };

    if (
      cameraStateCanExposeStreamPreferences(input.cameraState) &&
      (canPlayLive || input.isStreamCapable)
    ) {
      const streamTypeResult = await this.readOrderedStreamTypes(
        nativeEntityId,
        input.isStreamCapable
      );
      orderedStreamTypes = streamTypeResult.streamTypes;
      supportedTransports.push(...this.addMsePreference(orderedStreamTypes));
      capabilitiesRefreshMs = streamTypeResult.capabilitiesPending
        ? CAMERA_CAPABILITIES_REFRESH_MS
        : undefined;
    }

    if (canPlayLive) {
      const directWebRtcSelected =
        input.preferredTransport === 'web_rtc' && input.webRtcStreamSource === 'direct';
      const directStreamResource = directWebRtcSelected
        ? resolveDirectStreamResource({
            entityId: input.entityId,
            directStreamUrl: input.directStreamUrl,
          })
        : null;
      const candidateStreamTypes: PlatformCameraTransport[] =
        directWebRtcSelected && !directStreamResource
          ? []
          : directStreamResource
            ? ['web_rtc', ...orderedStreamTypes.filter((transport) => transport !== 'web_rtc')]
            : orderedStreamTypes;
      const fallbackAwareStreamTypes = failedTransports.has('web_rtc')
        ? this.addMsePreference(candidateStreamTypes)
        : candidateStreamTypes;
      const streamTypes = this.applyPreferredTransport(
        fallbackAwareStreamTypes,
        input.preferredTransport
      );
      for (const transport of streamTypes) {
        if (failedTransports.has(transport)) {
          continue;
        }

        // Resolve only the transport we will play. Fallbacks are attempted by a
        // new plan after playback fails; starting them here delays a ready stream.
        if (liveTransports.length > 0) {
          liveTransports.push(transport);
          continue;
        }

        if (transport === 'web_rtc') {
          liveTransports.push('web_rtc');
          if (!selectedStreamResource && directStreamResource) {
            selectedStreamResource = directStreamResource;
          }
          continue;
        }

        try {
          if (transport === 'mjpeg') {
            const streamPaths = await this.getCameraStreamPaths(nativeEntityId);
            const mjpegPath = streamPaths.mjpeg;
            if (!mjpegPath) {
              continue;
            }

            const resolvedStream = await this.resolver.resolve({
              kind: 'camera_stream',
              entityId: input.entityId,
              stream: 'mjpeg',
              rawPath: mjpegPath,
            });
            liveTransports.push('mjpeg');
            if (!selectedStreamResource) {
              selectedStreamResource = {
                ...resolvedStream,
                kind: 'mjpeg_stream',
              };
            }
            continue;
          }

          const resolvedStream = await resolveProviderHlsStream();
          liveTransports.push(transport);
          if (!selectedStreamResource) {
            selectedStreamResource = {
              ...resolvedStream,
              kind: 'hls_stream',
              metadata:
                transport === 'mse'
                  ? {
                      ...resolvedStream.metadata,
                      source: 'provider_hls',
                      mode: 'mse',
                    }
                  : resolvedStream.metadata,
            };
          }
        } catch {
          // Continue through the advertised fallback chain.
        }
      }

      if (liveTransports.length > 0) {
        selectedTransport = liveTransports[0] ?? null;
        fallbackTransports.push(...liveTransports.slice(1));
      }
    }

    if (selectedTransport === 'web_rtc' && selectedStreamResource?.kind !== 'webrtc_stream') {
      selectedStreamResource = null;
    } else if (
      selectedTransport !== 'web_rtc' &&
      selectedTransport !== 'mse' &&
      selectedTransport !== 'hls' &&
      selectedTransport !== 'mjpeg'
    ) {
      selectedStreamResource = null;
    }

    const isSnapshotFallback =
      input.preferredMode !== 'snapshot' &&
      canPlayLive &&
      selectedTransport === null &&
      supportsSnapshot;
    const shouldStartWithSnapshot =
      input.preferredMode === 'snapshot' || (selectedTransport === null && supportsSnapshot);

    return {
      cameraState: input.cameraState,
      snapshotResource,
      supportsSnapshot,
      supportedTransports,
      liveTransports,
      fallbackTransports,
      selectedTransport,
      selectedStreamResource,
      supportsStreaming: liveTransports.length > 0,
      isSnapshotFallback,
      shouldStartWithSnapshot,
      motionDetectionEnabled: input.motionDetectionEnabled,
      refreshPolicy: {
        capabilitiesRefreshMs,
        snapshotRefreshMs:
          selectedTransport === null && supportsSnapshot
            ? input.preferredMode === 'snapshot'
              ? CAMERA_SNAPSHOT_REFRESH_MS
              : CAMERA_FALLBACK_REFRESH_MS
            : undefined,
        retryDelaysMs: CAMERA_RETRY_DELAYS_MS,
      },
    };
  }

  private async readOrderedStreamTypes(
    entityId: string,
    isStreamCapable: boolean
  ): Promise<{
    streamTypes: PlatformCameraTransport[];
    capabilitiesPending: boolean;
  }> {
    const cachedTypes = this.cachedStreamTypes.get(entityId);
    if (cachedTypes && cachedTypes.length > 0) {
      return {
        streamTypes: this.addMjpegFallback(cachedTypes, isStreamCapable),
        capabilitiesPending: false,
      };
    }

    let capabilityTypesPromise = this.pendingStreamTypes.get(entityId);
    if (!capabilityTypesPromise) {
      capabilityTypesPromise = this.getCameraCapabilities(entityId)
        .then((capabilities) => {
          const orderedTypes: PlatformCameraTransport[] = capabilities.streamTypes.filter(
            (type) => type === 'web_rtc' || type === 'hls' || type === 'mjpeg'
          );
          if (orderedTypes.length === 0) {
            return {
              streamTypes: [],
              shouldRetry: false,
            };
          }

          const prioritizedTypes = this.prioritizeHomeAssistantCameraTransports(orderedTypes);
          this.cachedStreamTypes.set(entityId, prioritizedTypes);
          return {
            streamTypes: prioritizedTypes,
            shouldRetry: false,
          };
        })
        .catch(() => ({
          streamTypes: [] as PlatformCameraTransport[],
          shouldRetry: true,
        }));
      this.pendingStreamTypes.set(entityId, capabilityTypesPromise);
      void capabilityTypesPromise.finally(() => {
        if (this.pendingStreamTypes.get(entityId) === capabilityTypesPromise) {
          this.pendingStreamTypes.delete(entityId);
        }
      });
    }
    const activeCapabilityTypesPromise = capabilityTypesPromise;
    let capabilityTimeout: number | null = null;
    const capabilityResult = await Promise.race([
      activeCapabilityTypesPromise.then(({ streamTypes, shouldRetry }) => ({
        streamTypes,
        capabilitiesPending: shouldRetry,
      })),
      new Promise<{
        streamTypes: PlatformCameraTransport[];
        capabilitiesPending: boolean;
      }>((resolve) => {
        capabilityTimeout = window.setTimeout(() => {
          if (this.pendingStreamTypes.get(entityId) === activeCapabilityTypesPromise) {
            this.pendingStreamTypes.delete(entityId);
          }
          resolve({ streamTypes: [], capabilitiesPending: true });
        }, CAMERA_CAPABILITIES_TIMEOUT_MS);
      }),
    ]);
    if (capabilityTimeout !== null) {
      window.clearTimeout(capabilityTimeout);
    }
    if (capabilityResult.streamTypes.length > 0) {
      return {
        streamTypes: this.addMjpegFallback(capabilityResult.streamTypes, isStreamCapable),
        capabilitiesPending: false,
      };
    }

    // STREAM only means that the entity can stream; it does not advertise WebRTC.
    // A late successful capability response is cached and the mounted plan requests a refresh.
    return {
      streamTypes: isStreamCapable ? ['hls', 'mjpeg'] : [],
      capabilitiesPending: capabilityResult.capabilitiesPending,
    };
  }

  private addMjpegFallback(
    streamTypes: readonly PlatformCameraTransport[],
    isStreamCapable: boolean
  ): PlatformCameraTransport[] {
    const types = [...streamTypes];
    if (isStreamCapable && !types.includes('mjpeg')) {
      types.push('mjpeg');
    }
    return types;
  }

  private addMsePreference(
    streamTypes: readonly PlatformCameraTransport[]
  ): PlatformCameraTransport[] {
    const preferences: PlatformCameraTransport[] = [];
    for (const streamType of streamTypes) {
      if (streamType === 'hls') {
        preferences.push('mse');
      }
      preferences.push(streamType);
    }
    return preferences;
  }

  private prioritizeHomeAssistantCameraTransports(
    streamTypes: readonly PlatformCameraTransport[]
  ): PlatformCameraTransport[] {
    const prioritized: PlatformCameraTransport[] = [];
    if (streamTypes.includes('web_rtc')) {
      prioritized.push('web_rtc');
    }
    if (streamTypes.includes('hls')) {
      prioritized.push('hls');
      if (!streamTypes.includes('mjpeg')) {
        prioritized.push('mjpeg');
      }
    }
    if (streamTypes.includes('mjpeg')) {
      prioritized.push('mjpeg');
    }
    return prioritized;
  }

  private applyPreferredTransport(
    streamTypes: readonly PlatformCameraTransport[],
    preferredTransport: 'auto' | PlatformCameraTransport
  ): PlatformCameraTransport[] {
    if (preferredTransport === 'auto') {
      return [...streamTypes];
    }

    if (preferredTransport === 'mse') {
      const hlsIndex = streamTypes.indexOf('hls');
      return hlsIndex === -1 ? [...streamTypes] : ['mse', ...streamTypes.slice(hlsIndex)];
    }

    const preferredIndex = streamTypes.indexOf(preferredTransport);
    if (preferredIndex === -1) {
      return [...streamTypes];
    }

    return streamTypes.slice(preferredIndex);
  }
}
