import { dispatchEntityCommand } from '@navet/app/commands';
import { BaseCardDialog, Slider } from '@navet/app/components/primitives';
import { SheetSurface, SheetSurfaceHeader } from '@navet/app/components/primitives/sheet-surface';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { navetControlTokens, navetIconSizeTokens } from '@navet/app/components/system/tokens';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@navet/app/components/ui/dropdown-menu';
import { useEntityProviderFeatureMatrix, useI18n, useMediaQuery, useTheme } from '@navet/app/hooks';
import type { TranslationKey } from '@navet/app/i18n';
import type {
  PlatformCameraState,
  PlatformCameraTransport,
} from '@navet/app/platform/provider-feature-models';
import type { ResolvedPlatformResource } from '@navet/app/platform/resources';
import type {
  CameraFitMode,
  CameraStreamPreference,
  CameraViewMode,
  CameraWebRtcStreamSource,
} from '@navet/app/stores/settings-store';
import { isDirectCameraStreamSource } from '@navet/app/stores/settings-store';
import {
  compactRepeatedDeviceLabel,
  compactRepeatedLabelGroup,
} from '@navet/app/utils/compact-device-label';
import * as Popover from '@radix-ui/react-popover';
import {
  Activity,
  Camera,
  ChevronDown,
  Ellipsis,
  Expand,
  Lightbulb,
  Minimize,
  RefreshCw,
  Scaling,
  Settings2,
  Sparkles,
  ToggleLeft,
  Video,
  X,
} from 'lucide-react';
import { type ElementType, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  normalizeCameraDirectStreamUrl,
  useCameraPlaybackPlan,
} from '../../hooks/use-camera-playback-plan';
import {
  getCameraAccessoryDisplayName,
  getCameraAccessoryDomain,
  isCameraFullscreenTelemetryAccessory,
} from './camera-accessory-visibility';
import {
  CAMERA_FIT_MODE_OPTIONS,
  CAMERA_STREAM_PREFERENCE_OPTIONS,
  CAMERA_VIEW_MODE_OPTIONS,
} from './camera-control-options';
import { CameraSnapshotImage } from './camera-snapshot-image';
import { CameraStreamHostSlot } from './camera-stream-host-slot';
import { CameraStreamPlayer } from './camera-stream-player';
import type { CameraImageSourceKind } from './camera-view-mode';
import { isOpaqueGo2RtcStreamResource } from './go2rtc-viewer-presentation';
import type { CameraAccessoryEntity, CameraCardImageSource } from './types';

interface CameraLiveViewerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  name: string;
  room: string;
  cameraState: PlatformCameraState;
  snapshotUrl: string | undefined;
  snapshotSources?: readonly CameraCardImageSource[];
  cameraViewMode: CameraViewMode;
  preferredTransport: CameraStreamPreference;
  webRtcStreamSource?: CameraWebRtcStreamSource;
  directStreamUrl?: string;
  cameraFitMode?: CameraFitMode;
  isStreamCapable: boolean;
  motionDetectionEnabled: boolean | null;
  motionDetected?: boolean;
  initialStreamResource: ResolvedPlatformResource | null;
  initialStreamTransport?: PlatformCameraTransport | null;
  initialStreamReady?: boolean;
  retainedStreamHost?: HTMLDivElement | null;
  accessoryEntities?: CameraAccessoryEntity[];
  onRefresh: () => void;
  onOpenSettings?: () => void;
  onCameraViewModeChange: (mode: CameraViewMode) => void;
  onPreferredTransportChange: (transport: CameraStreamPreference) => void;
  onCameraFitModeChange: (mode: CameraFitMode) => void;
}

const CAMERA_VIEWER_ACTION_BUTTON_CLASS_NAME = `pointer-events-auto relative flex ${navetControlTokens.iconButton.sizes.compact.className} shrink-0 items-center justify-center rounded-full border border-white/12 bg-black/45 text-white backdrop-blur-xl transition-colors before:absolute before:-inset-0.5 before:content-[''] hover:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70`;
const CAMERA_VIEWER_PILL_TRIGGER_CLASS_NAME = `pointer-events-auto relative flex ${navetControlTokens.button.apiSizes.default.heightClassName} min-w-0 max-w-48 cursor-pointer items-center gap-2 rounded-full border border-white/12 bg-black/45 px-3 text-xs font-semibold text-white backdrop-blur-xl transition-colors before:absolute before:inset-0 before:content-[''] hover:bg-white/12 data-[state=open]:bg-white/14 [&>*]:pointer-events-none`;

function CameraAccessoryRail({
  accessories,
  cameraName,
}: {
  accessories: CameraAccessoryEntity[];
  cameraName: string;
}) {
  const { t } = useI18n();
  const [pendingEntityId, setPendingEntityId] = useState<string | null>(null);
  const telemetryAccessories = useMemo(
    () => accessories.filter(isCameraFullscreenTelemetryAccessory),
    [accessories]
  );
  const orderedAccessories = useMemo(
    () =>
      [...telemetryAccessories].sort((left, right) => {
        const priority = (accessory: CameraAccessoryEntity) => {
          if (accessory.entity.state === 'unavailable') return 4;
          const domain = getCameraAccessoryDomain(accessory);
          if (domain === 'light' || domain === 'switch') return 0;
          if (domain === 'binary_sensor' || domain === 'scene') return 1;
          if (domain === 'sensor') return 2;
          return 3;
        };
        return priority(left) - priority(right);
      }),
    [telemetryAccessories]
  );
  const compactLabels = useMemo(() => {
    const labels = orderedAccessories.map(getCameraAccessoryDisplayName);
    return new Map(
      orderedAccessories.map((accessory, index) => [
        accessory.id,
        compactRepeatedLabelGroup(
          compactRepeatedDeviceLabel(labels[index] ?? '', cameraName, labels),
          labels
        ),
      ])
    );
  }, [cameraName, orderedAccessories]);

  if (orderedAccessories.length === 0) return null;

  const handleAction = async (accessory: CameraAccessoryEntity) => {
    const domain = getCameraAccessoryDomain(accessory);
    const nextCommand =
      domain === 'scene' || accessory.entity.state !== 'on' ? 'turn_on' : 'turn_off';
    setPendingEntityId(accessory.id);
    try {
      await dispatchEntityCommand({ type: nextCommand, entityId: accessory.id });
    } finally {
      setPendingEntityId(null);
    }
  };

  return (
    <fieldset
      aria-label={t('camera.settings.title')}
      className="pointer-events-auto m-0 flex min-w-0 gap-2 overflow-x-auto border-0 p-0 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {orderedAccessories.map((accessory) => {
        const domain = getCameraAccessoryDomain(accessory);
        const deviceClass = accessory.entity.attributes?.device_class;
        const isToggle = domain === 'switch' || domain === 'light';
        const isScene = domain === 'scene';
        const isInteractive = isToggle || isScene;
        const isOn = accessory.entity.state === 'on';
        const unit = accessory.entity.attributes?.unit_of_measurement;
        const brightness = accessory.entity.attributes?.brightness;
        const brightnessPercent =
          domain === 'light' && typeof brightness === 'number'
            ? Math.round((brightness / 255) * 100)
            : null;
        const value =
          accessory.entity.state === 'unavailable'
            ? t('camera.status.unavailable')
            : domain === 'binary_sensor' && deviceClass === 'motion'
              ? isOn
                ? t('camera.motion.detected')
                : t('camera.motion.clear')
              : domain === 'binary_sensor'
                ? isOn
                  ? t('common.on')
                  : t('common.off')
                : isToggle
                  ? `${isOn ? t('common.on') : t('common.off')}${brightnessPercent !== null ? ` · ${brightnessPercent}%` : ''}`
                  : `${accessory.entity.state}${typeof unit === 'string' ? ` ${unit}` : ''}`;
        const label = compactLabels.get(accessory.id) ?? getCameraAccessoryDisplayName(accessory);
        const Icon =
          domain === 'light' || (domain === 'binary_sensor' && deviceClass === 'light')
            ? Lightbulb
            : domain === 'switch'
              ? ToggleLeft
              : domain === 'scene'
                ? Sparkles
                : Activity;
        const content = (
          <>
            <Icon className={`h-3.5 w-3.5 shrink-0 ${isOn ? 'text-amber-300' : 'text-white/65'}`} />
            <span className="max-w-36 truncate text-xs font-medium text-white/78">{label}</span>
            <span className="shrink-0 text-xs font-semibold text-white">
              {isScene ? t('scene.activate') : value}
            </span>
          </>
        );

        return isInteractive ? (
          <button
            key={accessory.id}
            type="button"
            disabled={pendingEntityId === accessory.id || accessory.entity.state === 'unavailable'}
            aria-label={`${label}: ${isScene ? t('scene.activate') : isOn ? t('common.on') : t('common.off')}`}
            aria-pressed={isToggle ? isOn : undefined}
            onClick={() => void handleAction(accessory)}
            className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-white/12 bg-black/55 px-3 text-white backdrop-blur-xl transition-colors hover:bg-white/14 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-50"
          >
            {content}
          </button>
        ) : (
          <div
            key={accessory.id}
            className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-white/12 bg-black/55 px-3 text-white backdrop-blur-xl"
          >
            {content}
          </div>
        );
      })}
    </fieldset>
  );
}

function CameraLightControl({
  cameraName,
  lights,
  embedded = false,
}: {
  cameraName: string;
  lights: CameraAccessoryEntity[];
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const isPhone = useMediaQuery('(max-width: 639px)');
  const [isOpen, setIsOpen] = useState(false);
  const [pendingEntityId, setPendingEntityId] = useState<string | null>(null);
  const [brightnessByEntityId, setBrightnessByEntityId] = useState<Record<string, number>>({});
  const labels = useMemo(() => lights.map(getCameraAccessoryDisplayName), [lights]);
  const isAnyLightOn = lights.some((light) => light.entity.state === 'on');
  const controlLabel =
    lights.length === 1
      ? compactRepeatedDeviceLabel(labels[0] ?? '', cameraName, labels)
      : t('lighting.type.light');

  useEffect(() => {
    setBrightnessByEntityId(
      Object.fromEntries(
        lights.map((light) => {
          const brightness = light.entity.attributes?.brightness;
          return [
            light.id,
            typeof brightness === 'number' ? Math.round((brightness / 255) * 100) : 100,
          ];
        })
      )
    );
  }, [lights]);

  if (lights.length === 0) return null;

  const toggleLight = async (light: CameraAccessoryEntity) => {
    setPendingEntityId(light.id);
    try {
      await dispatchEntityCommand({
        type: light.entity.state === 'on' ? 'turn_off' : 'turn_on',
        entityId: light.id,
      });
    } finally {
      setPendingEntityId(null);
    }
  };

  const controls = (
    <div className="space-y-4">
      {lights.map((light, index) => {
        const label = compactRepeatedDeviceLabel(labels[index] ?? '', cameraName, labels);
        const isOn = light.entity.state === 'on';
        const brightness = brightnessByEntityId[light.id] ?? 100;
        return (
          <div key={light.id} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-medium">{label}</span>
              <button
                type="button"
                disabled={pendingEntityId === light.id}
                aria-label={`${label}: ${isOn ? t('common.on') : t('common.off')}`}
                aria-pressed={isOn}
                onClick={() => void toggleLight(light)}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/60 disabled:opacity-50 ${
                  isOn
                    ? 'border-amber-300/35 bg-amber-400/18 text-amber-200'
                    : 'border-current/15 bg-current/8 text-current/72'
                }`}
              >
                <Lightbulb className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <Slider
                value={brightness}
                min={1}
                max={100}
                ariaLabel={`${label} ${t('lighting.brightness')}`}
                onValueChange={(value) =>
                  setBrightnessByEntityId((current) => ({ ...current, [light.id]: value }))
                }
                onValueCommit={(value) =>
                  void dispatchEntityCommand({
                    type: 'set_brightness',
                    entityId: light.id,
                    brightness: value,
                  })
                }
                rootClassName="relative flex h-9 min-w-0 flex-1 touch-none items-center select-none"
                trackClassName="relative h-1.5 grow rounded-full bg-current/15"
                rangeClassName="absolute h-full rounded-full bg-amber-400"
                thumbClassName="block h-4 w-4 rounded-full border-2 border-white bg-amber-400 shadow-md outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              />
              <span className="w-10 text-right text-xs font-semibold tabular-nums">
                {brightness}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
  const trigger = (
    <button
      type="button"
      className={CAMERA_VIEWER_PILL_TRIGGER_CLASS_NAME}
      aria-label={`${controlLabel}: ${isAnyLightOn ? t('common.on') : t('common.off')}`}
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      onClick={isPhone ? () => setIsOpen(true) : undefined}
    >
      <Lightbulb
        className={`h-3.5 w-3.5 shrink-0 ${isAnyLightOn ? 'text-amber-300' : 'text-white/72'}`}
        aria-hidden="true"
      />
      <span className="min-w-0 truncate">{controlLabel}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/58" aria-hidden="true" />
    </button>
  );

  if (embedded) {
    return controls;
  }

  return (
    <>
      {isPhone ? (
        trigger
      ) : (
        <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
          <Popover.Trigger asChild>{trigger}</Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="top"
              align="end"
              sideOffset={8}
              className="z-50 w-72 rounded-2xl border border-white/12 bg-zinc-950/95 p-3 text-white shadow-2xl backdrop-blur-xl"
            >
              {controls}
              <Popover.Arrow className="fill-zinc-950" />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
      {isPhone ? (
        <SheetSurface
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          title={controlLabel}
          description={cameraName}
          accentColor="#f59e0b"
          contentClassName="border-white/12 bg-zinc-950 text-white"
          bodyClassName="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <div className="space-y-4">
            <SheetSurfaceHeader
              title={controlLabel}
              description={cameraName}
              closeLabel={t('common.closeDialog')}
              onClose={() => setIsOpen(false)}
            />
            {controls}
          </div>
        </SheetSurface>
      ) : null}
    </>
  );
}

function CameraViewerOptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="space-y-2 border-0 p-0">
      <legend className="text-xs font-semibold text-white/58">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChange(option.value)}
              className={`min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                isSelected
                  ? 'border-white/30 bg-white/18 text-white'
                  : 'border-white/12 bg-white/6 text-white/72 hover:bg-white/12'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function CameraViewerMobileMoreControls({
  cameraName,
  lights,
  showTransport,
  transportLabel,
  transportOptions,
  transportValue,
  onTransportChange,
  showFitMode,
  fitModeLabel,
  fitModeOptions,
  fitModeValue,
  onFitModeChange,
  viewModeLabel,
  viewModeOptions,
  viewModeValue,
  onViewModeChange,
}: {
  cameraName: string;
  lights: CameraAccessoryEntity[];
  showTransport: boolean;
  transportLabel: string;
  transportOptions: readonly { value: CameraStreamPreference; label: string }[];
  transportValue: CameraStreamPreference;
  onTransportChange: (value: CameraStreamPreference) => void;
  showFitMode: boolean;
  fitModeLabel: string;
  fitModeOptions: readonly { value: CameraFitMode; label: string }[];
  fitModeValue: CameraFitMode;
  onFitModeChange: (value: CameraFitMode) => void;
  viewModeLabel: string;
  viewModeOptions: readonly { value: CameraViewMode; label: string }[];
  viewModeValue: CameraViewMode;
  onViewModeChange: (value: CameraViewMode) => void;
}) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={t('common.moreActions')}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setIsOpen(true)}
        className={CAMERA_VIEWER_ACTION_BUTTON_CLASS_NAME}
      >
        <Ellipsis className={navetIconSizeTokens.sm} aria-hidden="true" />
      </button>
      <SheetSurface
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title={t('common.moreActions')}
        description={cameraName}
        closeLabel={t('common.closeDialog')}
        accentColor="#ffffff"
        contentClassName="border-white/12 bg-zinc-950 text-white"
        bodyClassName="pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <SheetSurfaceHeader
          title={t('common.moreActions')}
          description={cameraName}
          closeLabel={t('common.closeDialog')}
          onClose={() => setIsOpen(false)}
          className="border-b border-white/12"
        />
        <div className="space-y-5 px-4 pt-4">
          {lights.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-white/58">{t('lighting.type.light')}</div>
              <CameraLightControl cameraName={cameraName} lights={lights} embedded />
            </div>
          ) : null}
          {showTransport ? (
            <CameraViewerOptionGroup
              label={transportLabel}
              options={transportOptions}
              value={transportValue}
              onChange={onTransportChange}
            />
          ) : null}
          {showFitMode ? (
            <CameraViewerOptionGroup
              label={fitModeLabel}
              options={fitModeOptions}
              value={fitModeValue}
              onChange={onFitModeChange}
            />
          ) : null}
          <CameraViewerOptionGroup
            label={viewModeLabel}
            options={viewModeOptions}
            value={viewModeValue}
            onChange={onViewModeChange}
          />
        </div>
      </SheetSurface>
    </>
  );
}

function CameraViewerDropdown<T extends string>({
  icon: Icon,
  label,
  options,
  value,
  onChange,
}: {
  icon: ElementType;
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? value;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${selectedLabel}`}
          className={CAMERA_VIEWER_PILL_TRIGGER_CLASS_NAME}
        >
          <Icon className="h-3.5 w-3.5 shrink-0 text-white/72" />
          <span className="min-w-0 truncate">{selectedLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/58" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" sideOffset={8} className="min-w-44">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(nextValue) => onChange(nextValue as T)}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CameraLiveViewer({
  isOpen,
  onOpenChange,
  entityId,
  name,
  room,
  cameraState,
  snapshotUrl,
  snapshotSources,
  cameraViewMode,
  preferredTransport,
  webRtcStreamSource,
  directStreamUrl,
  cameraFitMode = 'contain',
  isStreamCapable,
  motionDetectionEnabled,
  motionDetected = false,
  initialStreamResource,
  initialStreamTransport = null,
  initialStreamReady = false,
  retainedStreamHost = null,
  accessoryEntities = [],
  onRefresh,
  onOpenSettings,
  onCameraViewModeChange,
  onPreferredTransportChange,
  onCameraFitModeChange,
}: CameraLiveViewerProps) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const isPhone = useMediaQuery('(max-width: 639px)');
  const isPortrait = useMediaQuery('(orientation: portrait)');
  const surface = getThemeSurfaceTokens(theme);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const featureMatrix = useEntityProviderFeatureMatrix(entityId);
  const [failedStreamTypes, setFailedStreamTypes] = useState<PlatformCameraTransport[]>([]);
  const [directStreamFailed, setDirectStreamFailed] = useState(false);
  const [readyStreamIdentity, setReadyStreamIdentity] = useState<string | null>(null);
  const supportsCameraStreams = featureMatrix.cameraStreams;
  const supportsCameraSnapshot = featureMatrix.cameraSnapshot;
  const cameraLights = useMemo(
    () =>
      accessoryEntities.filter(
        (accessory) =>
          accessory.entity.state !== 'unavailable' &&
          accessory.id.replace(/^[^:]+:/, '').startsWith('light.')
      ),
    [accessoryEntities]
  );
  const usesDirectStream = isDirectCameraStreamSource(webRtcStreamSource ?? 'provider');
  const hasConfiguredDirectStream =
    usesDirectStream && normalizeCameraDirectStreamUrl(directStreamUrl) !== null;
  const canUseCameraStreams = usesDirectStream ? hasConfiguredDirectStream : supportsCameraStreams;
  const playbackModel = useCameraPlaybackPlan({
    entityId,
    webRtcStreamSource,
    directStreamUrl,
    cameraState,
    preferredMode: canUseCameraStreams ? cameraViewMode : 'snapshot',
    preferredTransport,
    snapshotUrl: supportsCameraSnapshot ? snapshotUrl : undefined,
    isStreamCapable: usesDirectStream
      ? hasConfiguredDirectStream
      : supportsCameraStreams && isStreamCapable,
    motionDetectionEnabled,
    failedTransports: new Set(failedStreamTypes),
    directStreamFailed,
  });
  const selectedTransport = playbackModel?.selectedTransport ?? null;
  const snapshotSourceUrl = playbackModel?.snapshotResource?.url;
  const selectedStreamResource = playbackModel?.selectedStreamResource ?? null;
  const isDirectStreamResource =
    selectedStreamResource?.kind === 'webrtc_stream' &&
    selectedStreamResource.metadata?.source === 'direct_stream_url';

  useEffect(() => {
    setFailedStreamTypes([]);
    setDirectStreamFailed(false);
  }, [
    cameraState,
    cameraViewMode,
    directStreamUrl,
    isOpen,
    isStreamCapable,
    preferredTransport,
    webRtcStreamSource,
  ]);

  useEffect(() => {
    if (!isOpen || cameraState === 'unavailable' || !selectedTransport) {
      setReadyStreamIdentity(null);
    }
  }, [cameraState, isOpen, selectedTransport]);

  const handleStreamError = useCallback(
    (kind: CameraImageSourceKind) => {
      if (kind === 'snapshot') {
        return;
      }

      setReadyStreamIdentity(null);
      if (kind === 'web_rtc' && isDirectStreamResource) {
        setDirectStreamFailed(true);
        return;
      }
      setFailedStreamTypes((current) => (current.includes(kind) ? current : [...current, kind]));
    },
    [isDirectStreamResource]
  );
  const handleRefresh = useCallback(() => {
    setFailedStreamTypes([]);
    setDirectStreamFailed(false);
    setReadyStreamIdentity(null);
    onRefresh();
  }, [onRefresh]);

  const supportedModes = useMemo<CameraViewMode[]>(() => {
    const canStream = usesDirectStream
      ? hasConfiguredDirectStream
      : supportsCameraStreams && isStreamCapable;
    const canShowSnapshot = supportsCameraSnapshot && Boolean(snapshotUrl);
    const modes = CAMERA_VIEW_MODE_OPTIONS.filter((mode) =>
      mode === 'snapshot' ? canShowSnapshot : canStream
    );
    return modes.length > 0 ? modes : ['snapshot'];
  }, [
    hasConfiguredDirectStream,
    isStreamCapable,
    snapshotUrl,
    supportsCameraSnapshot,
    supportsCameraStreams,
    usesDirectStream,
  ]);
  const availableTransportPreferences = useMemo<CameraStreamPreference[]>(() => {
    const supportedTransports =
      playbackModel?.supportedTransports ?? playbackModel?.liveTransports ?? [];

    return CAMERA_STREAM_PREFERENCE_OPTIONS.filter(
      (preference) =>
        preference === 'auto' || supportedTransports.includes(preference as PlatformCameraTransport)
    );
  }, [playbackModel?.liveTransports, playbackModel?.supportedTransports]);
  const effectiveViewMode = supportedModes.includes(cameraViewMode)
    ? cameraViewMode
    : supportedModes[0];
  const effectivePreferredTransport = availableTransportPreferences.includes(preferredTransport)
    ? preferredTransport
    : 'auto';
  const viewModeOptions = supportedModes.map((mode) => ({
    value: mode,
    label: t(`camera.settings.viewMode.${mode}` as TranslationKey),
  }));
  const transportOptions = availableTransportPreferences.map((transport) => ({
    value: transport,
    label: t(`camera.settings.streamPreference.${transport}` as TranslationKey),
  }));
  const fitModeOptions = CAMERA_FIT_MODE_OPTIONS.map((mode) => ({
    value: mode,
    label: t(`camera.settings.fitMode.${mode}` as TranslationKey),
  }));

  const initialResourceMatchesSelectedTransport =
    initialStreamResource?.cacheKey === selectedStreamResource?.cacheKey;
  const activeStreamResource = initialResourceMatchesSelectedTransport
    ? initialStreamResource
    : selectedStreamResource;
  const activeStreamIdentity = selectedTransport
    ? `${selectedTransport}:${activeStreamResource?.cacheKey ?? entityId}`
    : null;
  const canReuseInitialStream = Boolean(
    retainedStreamHost &&
      initialStreamTransport === selectedTransport &&
      initialResourceMatchesSelectedTransport
  );
  const isStreamReady = canReuseInitialStream
    ? initialStreamReady
    : activeStreamIdentity !== null && readyStreamIdentity === activeStreamIdentity;
  const handleStreamLoad = useCallback(() => {
    if (activeStreamIdentity) {
      setReadyStreamIdentity(activeStreamIdentity);
    }
  }, [activeStreamIdentity]);
  const isStreamReadinessOpaque = isOpaqueGo2RtcStreamResource(
    activeStreamResource,
    window.location.href
  );
  const isShowingSnapshot =
    !selectedTransport && Boolean(snapshotSourceUrl) && cameraState !== 'unavailable';
  const showNoSignal = !selectedTransport && !snapshotSourceUrl && cameraState !== 'unavailable';
  const isFeedRunning =
    Boolean(selectedTransport) &&
    cameraState !== 'unavailable' &&
    !isStreamReadinessOpaque &&
    isStreamReady;
  const isStreamPending =
    Boolean(selectedTransport) &&
    cameraState !== 'unavailable' &&
    !isStreamReadinessOpaque &&
    !isStreamReady;
  const streamTypeLabel = useMemo(() => {
    if (isStreamReadinessOpaque) {
      return t('camera.settings.webRtcStreamSource.direct');
    }
    if (!playbackModel) {
      return canUseCameraStreams
        ? t('camera.viewer.streamCapable')
        : t('camera.viewer.snapshotOnly');
    }
    if (playbackModel.isSnapshotFallback) {
      return t('camera.viewer.snapshotFallback');
    }
    if (
      selectedTransport === 'hls' ||
      selectedTransport === 'mse' ||
      selectedTransport === 'web_rtc' ||
      selectedTransport === 'mjpeg'
    ) {
      if (
        selectedTransport === 'web_rtc' &&
        selectedStreamResource?.metadata?.source === 'direct_stream_url'
      ) {
        return t('camera.settings.webRtcStreamSource.direct');
      }
      return selectedTransport === 'web_rtc' ? 'RTC' : selectedTransport.toUpperCase();
    }
    return playbackModel.supportsStreaming
      ? t('camera.viewer.streamCapable')
      : t('camera.viewer.snapshotOnly');
  }, [
    playbackModel,
    isStreamReadinessOpaque,
    selectedStreamResource?.metadata?.source,
    selectedTransport,
    canUseCameraStreams,
    t,
  ]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsNativeFullscreen(
        Boolean(
          document.fullscreenElement && viewerRef.current?.contains(document.fullscreenElement)
        )
      );
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleNativeFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    const viewer = viewerRef.current;
    if (!viewer) return;
    const video = viewer.querySelector('video') as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;
    // Safari's video fullscreen must run directly in the user gesture, before
    // awaiting a container request that can consume fullscreen activation.
    if (video?.webkitEnterFullscreen) {
      try {
        video.webkitEnterFullscreen();
        return;
      } catch {
        // Fall back when this video's current transport cannot enter native fullscreen.
      }
    }
    if (video?.requestFullscreen) {
      try {
        await video.requestFullscreen();
        return;
      } catch {
        // Snapshot and unsupported video transports can use the viewer container.
      }
    }
    if (viewer.requestFullscreen) {
      try {
        await viewer.requestFullscreen();
      } catch {
        // Keep the in-page viewer usable when the browser disallows fullscreen.
      }
    }
  }, []);

  const viewerStatusLabel = isStreamReadinessOpaque
    ? t('camera.settings.webRtcStreamSource.direct')
    : isFeedRunning
      ? t('camera.status.live')
      : isStreamPending
        ? t('camera.loadingFeed')
        : cameraState === 'off'
          ? t('common.off')
          : cameraState === 'unavailable'
            ? t('camera.status.unavailable')
            : t('common.on');

  return (
    <BaseCardDialog
      variant="fullscreen"
      mobileCoverSheet={false}
      persistentMobileDismiss={false}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={name}
      description={t('camera.viewer.description')}
      theme={theme}
      disableOpenAutoFocus
      contentTitle={name}
      contentDescription={t('camera.viewer.description')}
      overlayClassName={`animate-in fade-in ${surface.dialogBackdrop}`}
      contentClassName={
        isPortrait
          ? '!inset-auto !top-1/2 !left-1/2 !h-auto !max-h-[calc(100dvh-1.5rem)] !w-[calc(100%-1.5rem)] !max-w-[72rem] !-translate-x-1/2 !-translate-y-1/2 md:!max-h-[calc(100dvh-4rem)] md:!w-[calc(100%-4rem)]'
          : undefined
      }
      shellBodyClassName="h-full"
    >
      <div
        ref={viewerRef}
        className={`relative isolate flex min-h-0 flex-col overflow-hidden bg-black text-white ${
          isPortrait && !isNativeFullscreen ? 'h-auto' : 'h-full'
        }`}
      >
        <div
          data-testid="camera-viewer-media"
          className={`relative order-2 z-0 min-h-0 overflow-hidden bg-black ${
            isPortrait && !isNativeFullscreen ? 'aspect-video w-full flex-none' : 'flex-1'
          }`}
        >
          {selectedTransport && cameraState !== 'unavailable' ? (
            canReuseInitialStream && retainedStreamHost ? (
              <CameraStreamHostSlot host={retainedStreamHost} />
            ) : (
              <CameraStreamPlayer
                entityId={entityId}
                kind={selectedTransport}
                posterUrl={snapshotSourceUrl}
                streamResource={activeStreamResource}
                fitMode={cameraFitMode}
                loadingLabel={t('camera.loadingFeed')}
                webRtcTitle={t('camera.webRtcStreamTitle')}
                onLoad={handleStreamLoad}
                onError={handleStreamError}
              />
            )
          ) : snapshotSourceUrl && cameraState !== 'unavailable' ? (
            <CameraSnapshotImage
              src={snapshotSourceUrl}
              sources={snapshotSources}
              alt={name}
              className={`h-full w-full ${
                cameraFitMode === 'cover' ? 'object-cover' : 'object-contain'
              }`}
              onError={() => undefined}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-950">
              <Camera className="h-12 w-12 text-white/35" />
              <span className="text-sm text-white/58">
                {cameraState === 'unavailable'
                  ? t('camera.status.unavailable')
                  : showNoSignal
                    ? t('camera.status.noSignal')
                    : t('common.off')}
              </span>
            </div>
          )}
        </div>

        <div
          data-testid="camera-viewer-top-controls"
          className={`pointer-events-none relative order-1 z-20 shrink-0 border-white/10 border-b bg-zinc-950/95 pl-[calc(env(safe-area-inset-left,0px)+1rem)] pr-[calc(env(safe-area-inset-right,0px)+1rem)] md:pl-[calc(env(safe-area-inset-left,0px)+1.25rem)] md:pr-[calc(env(safe-area-inset-right,0px)+1.25rem)] ${
            isNativeFullscreen
              ? 'pt-[calc(max(env(safe-area-inset-top,0px),0px)+0.75rem)] pb-3'
              : 'py-3'
          }`}
        >
          <div
            data-testid="camera-viewer-header-layout"
            className="pointer-events-auto flex items-start justify-end gap-3"
          >
            <div className="flex shrink-0 items-center gap-3">
              {isShowingSnapshot ? (
                <button
                  type="button"
                  onClick={handleRefresh}
                  className={CAMERA_VIEWER_ACTION_BUTTON_CLASS_NAME}
                  aria-label={t('camera.actions.refreshSnapshot')}
                >
                  <RefreshCw className={navetIconSizeTokens.sm} />
                </button>
              ) : null}
              {onOpenSettings ? (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className={CAMERA_VIEWER_ACTION_BUTTON_CLASS_NAME}
                  aria-label={t('camera.actions.openSettings')}
                >
                  <Settings2 className={navetIconSizeTokens.sm} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void handleNativeFullscreen()}
                className={CAMERA_VIEWER_ACTION_BUTTON_CLASS_NAME}
                aria-label={`${t(isNativeFullscreen ? 'common.close' : 'common.open')} ${t(
                  'camera.viewer.description'
                )}`}
              >
                {isNativeFullscreen ? (
                  <Minimize className={navetIconSizeTokens.sm} />
                ) : (
                  <Expand className={navetIconSizeTokens.sm} />
                )}
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className={CAMERA_VIEWER_ACTION_BUTTON_CLASS_NAME}
                aria-label={t('common.close')}
              >
                <X className={navetIconSizeTokens.sm} />
              </button>
            </div>
          </div>
        </div>

        <div
          data-testid="camera-viewer-bottom-controls"
          className={`pointer-events-none relative order-3 z-20 shrink-0 border-white/10 border-t bg-zinc-950/95 pl-[calc(env(safe-area-inset-left,0px)+1rem)] pr-[calc(env(safe-area-inset-right,0px)+1rem)] md:pl-[calc(env(safe-area-inset-left,0px)+1.25rem)] md:pr-[calc(env(safe-area-inset-right,0px)+1.25rem)] ${
            isNativeFullscreen ? 'pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]' : 'py-3'
          }`}
        >
          <div className="flex min-w-0 flex-col gap-3">
            <CameraAccessoryRail accessories={accessoryEntities} cameraName={name} />
            <div className="flex min-w-0 items-end justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span
                  data-testid="camera-viewer-name"
                  className="block truncate text-xs font-semibold text-white/92"
                >
                  {name}
                </span>
                <div
                  data-testid="camera-viewer-eyebrow"
                  className="mt-1 flex min-w-0 items-center gap-2 whitespace-nowrap text-xs font-medium text-white/76"
                >
                  <span className="min-w-0 truncate">{room}</span>
                  <span className="h-1 w-1 shrink-0 rounded-full bg-white/35" />
                  <span className="shrink-0">{streamTypeLabel}</span>
                  <span className="h-1 w-1 shrink-0 rounded-full bg-white/35" />
                  <span
                    data-testid="camera-viewer-live-status"
                    className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap font-semibold text-white/92"
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isFeedRunning
                          ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.68)]'
                          : 'bg-white/45'
                      }`}
                    />
                    {viewerStatusLabel}
                  </span>
                </div>
                {motionDetected ? (
                  <div className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full border border-amber-300/25 bg-amber-400/16 px-3 text-xs font-semibold text-amber-100 backdrop-blur-xl">
                    <Activity className="h-3.5 w-3.5" />
                    <span>{t('camera.motion.detected')}</span>
                  </div>
                ) : null}
              </div>
              <div className="ml-auto flex max-w-[60%] shrink-0 flex-wrap justify-end gap-2 sm:max-w-full">
                {isPhone ? (
                  <CameraViewerMobileMoreControls
                    cameraName={name}
                    lights={cameraLights}
                    showTransport={!usesDirectStream && availableTransportPreferences.length > 1}
                    transportLabel={t('camera.settings.streamPreference')}
                    transportOptions={transportOptions}
                    transportValue={effectivePreferredTransport}
                    onTransportChange={onPreferredTransportChange}
                    showFitMode={!isStreamReadinessOpaque}
                    fitModeLabel={t('camera.settings.fitMode')}
                    fitModeOptions={fitModeOptions}
                    fitModeValue={cameraFitMode}
                    onFitModeChange={onCameraFitModeChange}
                    viewModeLabel={t('camera.settings.viewMode')}
                    viewModeOptions={viewModeOptions}
                    viewModeValue={effectiveViewMode}
                    onViewModeChange={onCameraViewModeChange}
                  />
                ) : (
                  <>
                    <CameraLightControl cameraName={name} lights={cameraLights} />
                    {!usesDirectStream && availableTransportPreferences.length > 1 ? (
                      <CameraViewerDropdown
                        icon={Video}
                        label={t('camera.settings.streamPreference')}
                        options={transportOptions}
                        value={effectivePreferredTransport}
                        onChange={onPreferredTransportChange}
                      />
                    ) : null}
                    {!isStreamReadinessOpaque ? (
                      <CameraViewerDropdown
                        icon={Scaling}
                        label={t('camera.settings.fitMode')}
                        options={fitModeOptions}
                        value={cameraFitMode}
                        onChange={onCameraFitModeChange}
                      />
                    ) : null}
                    <CameraViewerDropdown
                      icon={Camera}
                      label={t('camera.settings.viewMode')}
                      options={viewModeOptions}
                      value={effectiveViewMode}
                      onChange={onCameraViewModeChange}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </BaseCardDialog>
  );
}
