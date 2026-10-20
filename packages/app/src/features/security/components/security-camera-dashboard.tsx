import { DashboardEmptyState, DashboardGroupingNavigation } from '@navet/app/components/patterns';
import { BaseCard } from '@navet/app/components/primitives';
import { CardEditActionButton } from '@navet/app/components/shared/card-edit-action-button';
import {
  type CardSize,
  getCardGridAutoRowsStyle,
  getCardSpanClass,
  getResponsiveCardSize,
} from '@navet/app/components/shared/card-size-selector';
import type { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { STORAGE_KEYS } from '@navet/app/constants/storage-keys';
import { readNavetCameraState } from '@navet/app/core/navet-device-state';
import { DashboardCardItem, DashboardEditActions } from '@navet/app/features/dashboard';
import { BatteryOverviewWidget } from '@navet/app/features/dashboard/components/widgets/battery-overview-widget';
import { packDashboardGridItems } from '@navet/app/features/dashboard/device-grid/device-grid-layout';
import { useFitDashboardGrid } from '@navet/app/features/dashboard/hooks/use-fit-dashboard-grid';
import { useProgressiveBatching } from '@navet/app/features/dashboard/hooks/use-progressive-batching';
import { normalizeCameraDirectStreamUrl } from '@navet/app/features/security/hooks/use-camera-playback-plan';
import type { HomeStatusSummaryItem } from '@navet/app/features/sensors/components/home-status-summary-model';
import {
  SummaryBar,
  SummaryBarStack,
} from '@navet/app/features/sensors/components/info-badge-strip';
import { useProviderCameraTopology } from '@navet/app/hooks';
import { useBreakpointCols } from '@navet/app/hooks/use-breakpoint-cols';
import { usePersistedState } from '@navet/app/hooks/use-persisted-state';
import { useProviderEntityModel } from '@navet/app/hooks/use-provider-device';
import { useResourceUrl } from '@navet/app/hooks/use-resource-url';
import { useTheme } from '@navet/app/hooks/use-theme';
import { useI18n } from '@navet/app/i18n';
import { integrationCameraFeatureService } from '@navet/app/services/integration-camera-feature.service';
import { settingsSelectors } from '@navet/app/stores/selectors';
import {
  type CameraFitMode,
  type CameraStreamPreference,
  type CameraViewMode,
  isDirectCameraStreamSource,
  useSettingsStore,
} from '@navet/app/stores/settings-store';
import type { CameraDevice, DeviceWithType } from '@navet/app/types/device.types';
import { detectDeviceTier } from '@navet/app/utils/detect-device-tier';
import type { NavetAlarmEntity } from '@navet/core/alarm-types';
import {
  CircleAlert,
  CircleOff,
  Pin,
  Radio,
  ShieldCheck,
  TriangleAlert,
  Video,
  X,
} from 'lucide-react';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { resolveDashboardPerformanceProfile } from '../../dashboard/hooks/use-dashboard-performance-mode';
import { buildSecurityBatteryRows, isSecurityBatteryDevice } from '../utils/security-battery-rows';
import type {
  CameraDashboardModel,
  SecurityGroupSummary,
} from '../utils/security-camera-dashboard-model';
import {
  buildSecurityRoomGroupSummaries,
  getSecuritySeverity,
} from '../utils/security-camera-dashboard-model';
import {
  DEFAULT_SECURITY_QUICKVIEW_PREFERENCE,
  normalizeSecurityQuickviewPreference,
  placeSecurityQuickviewEntity,
  resolveSecurityQuickviewEntities,
} from '../utils/security-quickview-preferences';
import { CameraCard } from './camera-card';
import { CameraLiveViewer } from './camera-card/camera-live-viewer';
import {
  appendCameraCacheBuster,
  normalizeCameraSnapshotUrl,
  resolveViewerInitialCameraViewMode,
} from './camera-card/camera-view-mode';
import { useProviderCameraLiveData } from './camera-card/use-provider-camera-live-data';
import { SecurityCommandCenter } from './security-command-center';
import {
  SecurityQuickviewCard,
  SecurityQuickviewDropZone,
  SecurityQuickviewEditor,
} from './security-quickview-editor';

interface SecurityCameraDashboardProps {
  model: CameraDashboardModel;
  isEditMode: boolean;
  onToggleEditMode?: () => void;
  onAddEntity?: () => void;
  alarms?: NavetAlarmEntity[];
  cardSizes: Record<string, CardSize>;
  updateCardSize: (id: string, size: CardSize) => void;
  onRemoveEntity?: (entityId: string) => void;
  surface: ReturnType<typeof getThemeSurfaceTokens>;
}

const SECURITY_DASHBOARD_SELECTED_GROUP_KEY = 'navet-security-dashboard-selected-group';
type SecurityGroupingMode = 'type' | 'room';

function getGroupIndicatorTone(group: SecurityGroupSummary) {
  if (group.critical > 0) return 'critical' as const;
  if (group.warning > 0 || group.unknown > 0) return 'attention' as const;
  return undefined;
}

function readImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function SummaryCameraViewer({
  camera,
  isOpen,
  onOpenChange,
}: {
  camera: CameraDevice;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const providerEntity = useProviderEntityModel(camera.id);
  const { siblingIds: deviceEntityIds } = useProviderCameraTopology(camera.id);
  const { cameraState, liveEntity, liveState } = useProviderCameraLiveData(
    camera.id,
    deviceEntityIds
  );
  const preferredTransport = useSettingsStore(
    settingsSelectors.cameraStreamPreferenceForEntity(camera.id)
  );
  const updateCameraStreamPreference = useSettingsStore(
    settingsSelectors.updateCameraStreamPreference
  );
  const webRtcStreamSource = useSettingsStore(
    settingsSelectors.cameraWebRtcStreamSourceForEntity(camera.id)
  );
  const directStreamUrl = useSettingsStore(
    settingsSelectors.cameraDirectStreamUrlForEntity(camera.id)
  );
  const cameraFitMode = useSettingsStore(settingsSelectors.cameraFitModeForEntity(camera.id));
  const updateCameraFitMode = useSettingsStore(settingsSelectors.updateCameraFitMode);
  const hasConfiguredDirectStream =
    isDirectCameraStreamSource(webRtcStreamSource) &&
    normalizeCameraDirectStreamUrl(directStreamUrl) !== null;
  const [refreshKey, setRefreshKey] = useState(0);
  const [cameraViewMode, setCameraViewMode] = useState<CameraViewMode>('live');

  const liveAttrs = liveEntity?.attributes as Record<string, unknown> | undefined;
  const providerState = readNavetCameraState(providerEntity);
  const liveEntityPicture =
    readImageUrl(liveAttrs?.entity_picture_local) ?? readImageUrl(liveAttrs?.entity_picture);
  const initialSnapshotUrl =
    readImageUrl(camera.entityPicture) ??
    readImageUrl(
      typeof providerState?.entityPicture === 'string' ? providerState.entityPicture : undefined
    );
  const baseSnapshotUrl = normalizeCameraSnapshotUrl(liveEntityPicture ?? initialSnapshotUrl);
  const snapshotUrl =
    useResourceUrl(appendCameraCacheBuster(baseSnapshotUrl, refreshKey), 'home_assistant') ??
    undefined;
  const hasSnapshot = Boolean(liveEntityPicture ?? initialSnapshotUrl);
  const isStreamCapable =
    liveState.isStreamCapable ||
    providerState?.isStreamCapable === true ||
    (camera.isStreamCapable ?? false);
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setCameraViewMode(
      resolveViewerInitialCameraViewMode({
        isStreamCapable: isStreamCapable || hasConfiguredDirectStream,
        hasSnapshot,
      })
    );
  }, [hasConfiguredDirectStream, hasSnapshot, isOpen, isStreamCapable]);

  const handleRefresh = () => {
    setRefreshKey((key) => key + 1);
    void integrationCameraFeatureService.refreshCameraSnapshot?.(camera.id).catch(() => undefined);
  };
  const handlePreferredTransportChange = useCallback(
    (transport: CameraStreamPreference) => {
      updateCameraStreamPreference(camera.id, transport);
      setRefreshKey((key) => key + 1);
    },
    [camera.id, updateCameraStreamPreference]
  );
  const handleCameraFitModeChange = useCallback(
    (mode: CameraFitMode) => {
      updateCameraFitMode(camera.id, mode);
    },
    [camera.id, updateCameraFitMode]
  );

  return (
    <CameraLiveViewer
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      entityId={camera.id}
      name={camera.name}
      room={camera.room}
      cameraState={cameraState}
      snapshotUrl={snapshotUrl}
      cameraViewMode={cameraViewMode}
      preferredTransport={preferredTransport}
      webRtcStreamSource={webRtcStreamSource}
      directStreamUrl={directStreamUrl}
      cameraFitMode={cameraFitMode}
      isStreamCapable={isStreamCapable}
      motionDetectionEnabled={liveState.motionDetectionEnabled}
      initialStreamResource={null}
      onRefresh={handleRefresh}
      onCameraViewModeChange={setCameraViewMode}
      onPreferredTransportChange={handlePreferredTransportChange}
      onCameraFitModeChange={handleCameraFitModeChange}
    />
  );
}

function readSecureSummaryGroupId(device: DeviceWithType): string | null {
  switch (device.id) {
    case 'security.aggregate.attention.alarms':
      return 'alarms';
    case 'security.aggregate.attention.doors-windows':
      return 'doors-windows';
    case 'security.aggregate.attention.locks':
      return 'locks';
    case 'security.aggregate.attention.motion-occupancy':
      return 'motion-occupancy';
    case 'security.aggregate.attention.hazards':
      return 'hazards';
    case 'security.aggregate.attention.cameras':
      return 'cameras';
    case 'security.aggregate.attention.sirens':
      return 'sirens';
    case 'security.aggregate.attention.system':
      return 'system';
    case 'security.aggregate.openings.secure':
      return 'doors-windows';
    case 'security.aggregate.locks.secure':
      return 'locks';
    case 'security.aggregate.motion.secure':
      return 'motion-occupancy';
    case 'security.aggregate.hazards.secure':
      return 'hazards';
    default:
      return null;
  }
}

function DetailsGrid({
  devices,
  cardSizes,
  updateCardSize,
  isEditMode,
  onRemoveEntity,
  onRemoveFromQuickview,
  allowEntityRemoval = true,
  embeddedColumnCount,
  location = 'devices',
}: {
  devices: DeviceWithType[];
  cardSizes: Record<string, CardSize>;
  updateCardSize: (id: string, size: CardSize) => void;
  isEditMode: boolean;
  onRemoveEntity?: (entityId: string) => void;
  onRemoveFromQuickview?: (entityId: string) => void;
  allowEntityRemoval?: boolean;
  embeddedColumnCount?: number;
  location?: 'quickview' | 'devices';
}) {
  const { t } = useI18n();
  const breakpointCols = useBreakpointCols();
  const { disableAnimations, effectsQuality, lowPowerMode } = useSettingsStore(
    useShallow((state) => ({
      disableAnimations: settingsSelectors.disableAnimations(state),
      effectsQuality: settingsSelectors.effectsQuality(state),
      lowPowerMode: settingsSelectors.lowPowerMode(state),
    }))
  );
  const {
    outerRef,
    innerRef,
    outerContainerStyle,
    innerContainerStyle,
    isAutoScaled,
    gridStyle,
    renderedGridCols,
  } = useFitDashboardGrid(breakpointCols, embeddedColumnCount === undefined);
  const performanceProfile = useMemo(
    () =>
      resolveDashboardPerformanceProfile({
        activeSection: 'security',
        deviceTier: detectDeviceTier(),
        effectsQuality,
        isEditMode,
        lowPowerMode,
        reducedEffectsEnabled: disableAnimations || lowPowerMode,
        visibleCardCount: devices.length,
        visibleDevices: devices,
      }),
    [devices, disableAnimations, effectsQuality, isEditMode, lowPowerMode]
  );
  const shouldBatch = performanceProfile.batchHeavyCards;
  const batchedVisibleCount = useProgressiveBatching(devices.length, isEditMode, {
    enabled: shouldBatch,
    initialBatch: performanceProfile.progressiveBatchInitialCount,
    batchSize: performanceProfile.progressiveBatchSize,
  });
  const visibleDevices = shouldBatch ? devices.slice(0, batchedVisibleCount) : devices;
  const optimizeOffscreenPaint = performanceProfile.optimizeOffscreenPaint;
  const columnCount = embeddedColumnCount ?? renderedGridCols;
  const batteryRows = useMemo(
    () => (location === 'devices' ? buildSecurityBatteryRows(devices) : []),
    [devices, location]
  );
  const resolvedCards = useMemo(
    () => [
      ...visibleDevices
        .filter((device) => location !== 'devices' || !isSecurityBatteryDevice(device))
        .map((device) => {
          const defaultSize = device.type === 'cameras' ? 'large' : device.size;
          const size = cardSizes[device.id] ?? defaultSize;

          return {
            id: device.id,
            device,
            batteryRows: null,
            size,
            gridSize: getResponsiveCardSize(size, breakpointCols),
          };
        }),
      ...(batteryRows.length > 0
        ? [
            {
              id: 'security.battery-overview',
              device: null,
              batteryRows,
              size: 'large' as CardSize,
              gridSize: getResponsiveCardSize('large', breakpointCols),
            },
          ]
        : []),
    ],
    [batteryRows, breakpointCols, cardSizes, location, visibleDevices]
  );
  const gridPlacements = useMemo(
    () =>
      packDashboardGridItems(
        resolvedCards.map(({ id, gridSize: size }) => ({ id, size })),
        columnCount,
        { placementPreference: 'leftmost' }
      ),
    [columnCount, resolvedCards]
  );
  const resolvedGridStyle =
    embeddedColumnCount === undefined
      ? gridStyle
      : {
          ...getCardGridAutoRowsStyle(breakpointCols),
          gridTemplateColumns: `repeat(${embeddedColumnCount}, minmax(0, 1fr))`,
        };

  return (
    <DashboardEditActions
      isEditMode={isEditMode}
      onRemoveEntity={onRemoveEntity}
      onRemoveFromLayout={onRemoveFromQuickview}
    >
      <div ref={outerRef} className="relative w-full" style={outerContainerStyle}>
        <div
          ref={innerRef}
          className={`w-full${isAutoScaled ? ' absolute left-0 top-0 origin-top-left' : ''}`}
          style={innerContainerStyle}
        >
          <div
            data-testid="security-card-grid"
            className="grid w-full grid-flow-row-dense gap-3 lg:gap-4"
            style={resolvedGridStyle as CSSProperties}
          >
            {resolvedCards.map(({ id, device, batteryRows, size, gridSize }) => {
              const placement = gridPlacements.get(id);

              if (batteryRows) {
                return (
                  <div
                    key={id}
                    data-testid="security-battery-overview"
                    className={`${getCardSpanClass(gridSize)} [&>*]:h-full`}
                    style={{ gridColumnStart: placement?.column, gridRowStart: placement?.row }}
                  >
                    <BatteryOverviewWidget size={size} batteryRows={batteryRows} />
                  </div>
                );
              }
              if (!device) return null;

              return (
                <SecurityQuickviewCard
                  device={device}
                  location={location}
                  isEditMode={isEditMode}
                  key={device.id}
                  data-security-entity-id={device.id}
                  tabIndex={-1}
                  className={`${getCardSpanClass(gridSize)} [&>*]:h-full${
                    optimizeOffscreenPaint
                      ? ' [content-visibility:auto] [contain-intrinsic-block-size:22rem]'
                      : ''
                  } rounded-[22px] focus:outline-none focus:ring-2 focus:ring-sky-400/70 focus:ring-offset-2 focus:ring-offset-transparent`}
                  style={{
                    gridColumnStart: placement?.column,
                    gridRowStart: placement?.row,
                  }}
                >
                  <DashboardCardItem
                    id={device.id}
                    device={device}
                    size={size}
                    isEditMode={isEditMode}
                    handleSizeChange={updateCardSize}
                    onRemoveFromLayout={onRemoveFromQuickview}
                    removeFromLayoutLabel={
                      onRemoveFromQuickview
                        ? t('security.quickview.unpin', { name: device.name })
                        : undefined
                    }
                    onRemoveEntity={onRemoveEntity}
                    allowEntityRemoval={allowEntityRemoval}
                    usesHideAction
                  />
                </SecurityQuickviewCard>
              );
            })}
          </div>
        </div>
      </div>
    </DashboardEditActions>
  );
}

function MobileQuickviewCarousel({
  devices,
  cardSizes,
  updateCardSize,
  isEditMode,
}: {
  devices: DeviceWithType[];
  cardSizes: Record<string, CardSize>;
  updateCardSize: (id: string, size: CardSize) => void;
  isEditMode: boolean;
}) {
  const { t } = useI18n();
  const hasMultipleCards = devices.length > 1;

  return (
    <section
      aria-label={t('security.quickview.label')}
      className="-mx-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-testid="security-quickview-carousel"
    >
      <div className="flex gap-3">
        {devices.map((device) => {
          const defaultSize = device.type === 'cameras' ? 'large' : device.size;
          const size = cardSizes[device.id] ?? defaultSize;

          return (
            <div
              key={device.id}
              className={`h-44 min-w-0 flex-none snap-start scroll-ml-1 [contain-intrinsic-size:auto_11rem] [content-visibility:auto] [&>*]:h-full ${
                hasMultipleCards ? 'w-[84%] max-w-96' : 'w-full'
              }`}
              data-security-entity-id={device.id}
              data-testid="security-quickview-carousel-item"
            >
              <DashboardCardItem
                id={device.id}
                device={device}
                size={size}
                isEditMode={isEditMode}
                handleSizeChange={updateCardSize}
                allowEntityRemoval={false}
                usesHideAction
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function getCameraMosaicCellClassName(index: number, count: number) {
  if (count === 3 && index === 0) {
    return 'row-span-2';
  }

  return '';
}

function CameraQuickviewMosaic({
  cameras,
  updateCardSize,
  isEditMode,
  columnCount,
  onRemoveFromQuickview,
}: {
  cameras: Array<CameraDevice & { type: 'cameras' }>;
  updateCardSize: (id: string, size: CardSize) => void;
  isEditMode: boolean;
  columnCount: number;
  onRemoveFromQuickview?: (entityId: string) => void;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const visibleCameras = cameras.slice(0, 4);
  const gridClassName =
    visibleCameras.length === 1
      ? 'grid-cols-1 grid-rows-1'
      : visibleCameras.length === 2
        ? 'grid-cols-2 grid-rows-1'
        : 'grid-cols-2 grid-rows-2';

  return (
    <DashboardEditActions isEditMode={isEditMode} onRemoveFromLayout={onRemoveFromQuickview}>
      <div
        data-testid="security-camera-mosaic-layout"
        className="grid w-full grid-flow-row-dense gap-3 lg:gap-4"
        style={{
          ...getCardGridAutoRowsStyle(columnCount),
          gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
        }}
      >
        <div className={`${getCardSpanClass('large')} [&>*]:h-full`}>
          <BaseCard size="large" fullBleed data-testid="security-camera-mosaic">
            <div className={`grid h-full w-full gap-px bg-black/70 ${gridClassName}`}>
              {visibleCameras.map((camera, index) => (
                <SecurityQuickviewCard
                  key={camera.id}
                  device={camera}
                  location="quickview"
                  isEditMode={isEditMode}
                  className={`min-h-0 min-w-0 overflow-hidden ${getCameraMosaicCellClassName(
                    index,
                    visibleCameras.length
                  )}`}
                  data-security-entity-id={camera.id}
                  data-testid="security-camera-mosaic-cell"
                >
                  <CameraCard
                    id={camera.id}
                    name={camera.name}
                    room={camera.room}
                    entityPicture={camera.entityPicture}
                    entityPictureSources={camera.entityPictureSources}
                    supportedFeatures={camera.supportedFeatures}
                    isStreamCapable={camera.isStreamCapable}
                    size="small"
                    onSizeChange={updateCardSize}
                    isEditMode={isEditMode}
                    presentation="mosaic-tile"
                  />
                  {isEditMode && onRemoveFromQuickview ? (
                    <CardEditActionButton
                      cardSize="small"
                      Icon={X}
                      theme={theme}
                      variant="warning"
                      data-dashboard-edit-action="remove-layout"
                      data-card-id={camera.id}
                      aria-label={t('security.quickview.unpin', { name: camera.name })}
                    />
                  ) : null}
                </SecurityQuickviewCard>
              ))}
            </div>
          </BaseCard>
        </div>
      </div>
    </DashboardEditActions>
  );
}

function DetailsSection({
  groupSummaries,
  selectedGroupId,
  groupingMode,
  onSelectGroup,
  onGroupingModeChange,
  cardSizes,
  updateCardSize,
  isEditMode,
  onRemoveEntity,
  embeddedColumnCount,
}: {
  groupSummaries: SecurityGroupSummary[];
  selectedGroupId: string;
  groupingMode: SecurityGroupingMode;
  onSelectGroup: (groupId: string) => void;
  onGroupingModeChange: (mode: SecurityGroupingMode) => void;
  cardSizes: Record<string, CardSize>;
  updateCardSize: (id: string, size: CardSize) => void;
  isEditMode: boolean;
  onRemoveEntity?: (entityId: string) => void;
  embeddedColumnCount?: number;
}) {
  const { t } = useI18n();
  const selectedGroup =
    groupSummaries.find((group) => group.id === selectedGroupId) ?? groupSummaries[0] ?? null;

  if (!selectedGroup) {
    return null;
  }

  return (
    <div className="space-y-4">
      <DashboardGroupingNavigation
        ariaLabel={t('security.overview.detailGroups')}
        groupingLabel={t('dashboard.roomNav.grouping.label')}
        idPrefix="security-details"
        items={groupSummaries.map((group) => ({
          id: group.id,
          label: group.label,
          indicatorTone: group.id === 'presence' ? undefined : getGroupIndicatorTone(group),
        }))}
        modes={[
          { id: 'type', label: t('dashboard.roomNav.grouping.type') },
          { id: 'room', label: t('dashboard.roomNav.grouping.room') },
        ]}
        selectedItemId={selectedGroup.id}
        selectedModeId={groupingMode}
        onModeChange={(modeId) => {
          if (modeId === 'type' || modeId === 'room') onGroupingModeChange(modeId);
        }}
        onItemChange={onSelectGroup}
      />

      <div
        role="tabpanel"
        id={`security-details-panel-${selectedGroup.id}`}
        aria-labelledby={`security-details-tab-${selectedGroup.id}`}
        className=""
      >
        <DetailsGrid
          devices={selectedGroup.entities}
          cardSizes={cardSizes}
          updateCardSize={updateCardSize}
          isEditMode={isEditMode}
          onRemoveEntity={onRemoveEntity}
          embeddedColumnCount={embeddedColumnCount}
        />
      </div>
    </div>
  );
}

export function SecurityCameraDashboard({
  model,
  isEditMode,
  alarms = [],
  cardSizes,
  updateCardSize,
  onRemoveEntity,
  surface,
}: SecurityCameraDashboardProps) {
  const { t } = useI18n();
  const [summaryFilter, setSummaryFilter] = useState<
    'critical' | 'attention' | 'unavailable' | 'cameras' | null
  >(null);
  const [viewerCamera, setViewerCamera] = useState<CameraDevice | null>(null);
  const detailsRef = useRef<HTMLDivElement | null>(null);
  const [pendingNavigationEntityId, setPendingNavigationEntityId] = useState<string | null>(null);
  const [storedQuickviewPreference, setStoredQuickviewPreference] = usePersistedState(
    STORAGE_KEYS.securityQuickviewPreferences,
    DEFAULT_SECURITY_QUICKVIEW_PREFERENCE
  );
  const quickviewPreference = useMemo(
    () => normalizeSecurityQuickviewPreference(storedQuickviewPreference),
    [storedQuickviewPreference]
  );
  const quickviewEntities = useMemo(
    () => resolveSecurityQuickviewEntities(quickviewPreference, model.allEntities),
    [model.allEntities, quickviewPreference]
  );
  const portraitMosaicCameras = useMemo(() => {
    const sourceEntities = quickviewEntities;

    return sourceEntities
      .filter(
        (entity): entity is Extract<DeviceWithType, { type: 'cameras' }> =>
          entity.type === 'cameras'
      )
      .slice(0, 4);
  }, [model.allEntities, quickviewEntities, quickviewPreference.mode]);
  const canUsePortraitMosaic =
    portraitMosaicCameras.length > 0 && portraitMosaicCameras.length === quickviewEntities.length;
  const roomGroupSummaries = useMemo(
    () => buildSecurityRoomGroupSummaries(model.allEntities, t),
    [model.allEntities, t]
  );
  const defaultTypeGroupId = useMemo(
    () =>
      model.summary.groupSummaries.find((group) => group.defaultExpanded)?.id ??
      model.summary.groupSummaries[0]?.id ??
      '',
    [model.summary.groupSummaries]
  );
  const [groupingMode, setGroupingMode] = useState<SecurityGroupingMode>('type');
  const [selectedTypeGroupId, setSelectedTypeGroupId] = usePersistedState(
    SECURITY_DASHBOARD_SELECTED_GROUP_KEY,
    defaultTypeGroupId
  );
  const [selectedRoomGroupId, setSelectedRoomGroupId] = useState(
    () => roomGroupSummaries[0]?.id ?? ''
  );
  const baseGroupSummaries =
    groupingMode === 'type' ? model.summary.groupSummaries : roomGroupSummaries;
  const filteredEntities =
    summaryFilter === 'critical'
      ? model.summary.attentionEntities.filter(
          (entity) => getSecuritySeverity(entity) === 'critical'
        )
      : summaryFilter === 'attention'
        ? model.summary.attentionEntities.filter(
            (entity) => getSecuritySeverity(entity) === 'warning'
          )
        : summaryFilter === 'unavailable'
          ? model.summary.unknownItems
          : model.summary.liveItems;
  const filterGroup: SecurityGroupSummary | null = summaryFilter
    ? {
        id: `filter-${summaryFilter}`,
        label: t(
          summaryFilter === 'critical'
            ? 'security.severity.critical'
            : summaryFilter === 'attention'
              ? 'security.severity.attention'
              : summaryFilter === 'unavailable'
                ? 'security.dashboard.unavailable'
                : 'security.dashboard.availableCameras'
        ),
        severity:
          summaryFilter === 'critical'
            ? 'critical'
            : summaryFilter === 'attention'
              ? 'warning'
              : summaryFilter === 'unavailable'
                ? 'unknown'
                : 'active',
        total: filteredEntities.length,
        critical: filteredEntities.filter((entity) => getSecuritySeverity(entity) === 'critical')
          .length,
        warning: filteredEntities.filter((entity) => getSecuritySeverity(entity) === 'warning')
          .length,
        active: filteredEntities.filter((entity) => getSecuritySeverity(entity) === 'active')
          .length,
        unknown: filteredEntities.filter((entity) => getSecuritySeverity(entity) === 'unknown')
          .length,
        normal: filteredEntities.filter((entity) => getSecuritySeverity(entity) === 'normal')
          .length,
        summaryText: '',
        entities: filteredEntities,
        defaultExpanded: true,
      }
    : null;
  const groupSummaries = filterGroup ? [filterGroup, ...baseGroupSummaries] : baseGroupSummaries;
  const selectedGroupId =
    filterGroup?.id ?? (groupingMode === 'type' ? selectedTypeGroupId : selectedRoomGroupId);
  const selectGroup = useCallback(
    (groupId: string) => {
      if (groupId.startsWith('filter-')) return;
      setSummaryFilter(null);
      if (groupingMode === 'type') {
        setSelectedTypeGroupId(groupId);
      } else {
        setSelectedRoomGroupId(groupId);
      }
    },
    [groupingMode, setSelectedTypeGroupId]
  );

  useEffect(() => {
    setSelectedTypeGroupId((current) => {
      if (current && model.summary.groupSummaries.some((group) => group.id === current)) {
        return current;
      }

      return defaultTypeGroupId;
    });
  }, [defaultTypeGroupId, model.summary.groupSummaries, setSelectedTypeGroupId]);

  useEffect(() => {
    setSelectedRoomGroupId((current) => {
      if (current && roomGroupSummaries.some((group) => group.id === current)) {
        return current;
      }

      return roomGroupSummaries[0]?.id ?? '';
    });
  }, [roomGroupSummaries]);

  useEffect(() => {
    if (!pendingNavigationEntityId) return;

    const frame = requestAnimationFrame(() => {
      const detailCards = detailsRef.current?.querySelectorAll<HTMLElement>(
        '[data-security-entity-id], [data-battery-entity-ids]'
      );
      const target = Array.from(detailCards ?? []).find(
        (card) =>
          card.dataset.securityEntityId === pendingNavigationEntityId ||
          card.dataset.batteryEntityIds?.split(' ').includes(pendingNavigationEntityId)
      );

      if (target) {
        target.focus({ preventScroll: true });
        target.scrollIntoView({
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
          block: 'center',
        });
      } else {
        detailsRef.current?.scrollIntoView({
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
          block: 'start',
        });
      }
      setPendingNavigationEntityId(null);
    });

    return () => cancelAnimationFrame(frame);
  }, [pendingNavigationEntityId, selectedGroupId]);

  const navigateToEntity = useCallback(
    (device: DeviceWithType) => {
      const secureSummaryGroupId =
        groupingMode === 'type' ? readSecureSummaryGroupId(device) : null;
      if (secureSummaryGroupId) {
        selectGroup(secureSummaryGroupId);
        setPendingNavigationEntityId(device.id);
        return;
      }

      const targetGroup = groupSummaries.find((group) =>
        group.entities.some((entity) => entity.id === device.id)
      );
      if (!targetGroup) {
        return;
      }

      selectGroup(targetGroup.id);
      setPendingNavigationEntityId(device.id);
    },
    [groupSummaries, groupingMode, selectGroup]
  );

  const handleAttentionItemClick = (device: DeviceWithType) => {
    if (device.securityKind === 'motion' || device.securityKind === 'occupancy') {
      const camera = model.allEntities.find(
        (entity): entity is CameraDevice & { type: 'cameras' } =>
          entity.type === 'cameras' &&
          Boolean(device.underlyingDeviceId) &&
          entity.underlyingDeviceId === device.underlyingDeviceId
      );
      if (camera) {
        setViewerCamera(camera);
        return;
      }
    }
    navigateToEntity(device);
  };

  const focusDetails = useCallback(() => {
    requestAnimationFrame(() => {
      detailsRef.current
        ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
        ?.focus({ preventScroll: true });
      detailsRef.current?.scrollIntoView({
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
        block: 'start',
      });
    });
  }, []);
  const showSummaryFilter = useCallback(
    (filter: 'critical' | 'attention' | 'unavailable' | 'cameras') => {
      setSummaryFilter(filter);
      focusDetails();
    },
    [focusDetails]
  );

  const summaryItems = useMemo<HomeStatusSummaryItem[]>(() => {
    const items: HomeStatusSummaryItem[] = [];
    const hasDangerAttention = model.summary.attentionEntities.some(
      (entity) => entity.type === 'locks' && entity.state === false
    );
    if (model.summary.liveItems.length > 0) {
      items.push({
        id: 'security-cameras',
        title: t('security.group.cameras'),
        value: t('security.summary.available', { count: model.summary.liveItems.length }),
        icon: Video,
        iconColor: '#94a3b8',
        onSelect: () => showSummaryFilter('cameras'),
      });
    }
    if (model.summary.criticalCount > 0) {
      items.push({
        id: 'security-critical',
        title: t('security.severity.critical'),
        value: String(model.summary.criticalCount),
        icon: TriangleAlert,
        iconColor: '#ef4444',
        priority: 'critical',
        tone: 'danger',
        onSelect: () => showSummaryFilter('critical'),
      });
    }
    if (model.summary.warningCount > 0) {
      items.push({
        id: 'security-attention',
        title: t('security.severity.attention'),
        value: t('security.summary.alerts', { count: model.summary.warningCount }),
        icon: hasDangerAttention ? TriangleAlert : CircleAlert,
        iconColor: hasDangerAttention ? '#ef4444' : '#f59e0b',
        priority: hasDangerAttention ? 'critical' : 'attention',
        tone: hasDangerAttention ? 'danger' : 'warning',
        onSelect: () => showSummaryFilter('attention'),
      });
    }
    if (model.summary.unknownCount > 0) {
      items.push({
        id: 'security-unavailable',
        title: t('security.dashboard.unavailable'),
        value: t('security.summary.unavailable', { count: model.summary.unknownCount }),
        icon: CircleOff,
        iconColor: '#94a3b8',
        priority: 'attention',
        tone: 'neutral',
        onSelect: () => showSummaryFilter('unavailable'),
      });
    }
    for (const group of model.summary.groupSummaries) {
      if (!['doors-windows', 'locks', 'hazards', 'motion-occupancy', 'system'].includes(group.id))
        continue;
      items.push({
        id: `security-group-${group.id}`,
        title: group.label,
        value: group.summaryText,
        icon: group.id === 'motion-occupancy' ? Radio : ShieldCheck,
        iconColor: group.critical > 0 ? '#ef4444' : group.warning > 0 ? '#f59e0b' : '#94a3b8',
        tone: group.critical > 0 ? 'danger' : group.warning > 0 ? 'warning' : 'neutral',
        onSelect: () => {
          setSummaryFilter(null);
          setGroupingMode('type');
          setSelectedTypeGroupId(group.id);
          focusDetails();
        },
      });
    }
    return items;
  }, [model.summary, t, showSummaryFilter, setSelectedTypeGroupId, focusDetails]);

  const quickviewIds =
    quickviewPreference.mode === 'custom'
      ? quickviewPreference.entityIds
      : quickviewEntities.map((entity) => entity.id);
  const pinQuickviewEntity = (entityId: string, beforeId?: string) => {
    setStoredQuickviewPreference(placeSecurityQuickviewEntity(quickviewIds, entityId, beforeId));
  };
  const unpinQuickviewEntity = (entityId: string) => {
    setStoredQuickviewPreference({
      mode: 'custom',
      entityIds: quickviewIds.filter((id) => id !== entityId),
    });
  };

  return (
    <SecurityQuickviewEditor
      entities={model.allEntities}
      entityIds={quickviewIds}
      onPin={pinQuickviewEntity}
      onUnpin={unpinQuickviewEntity}
    >
      <div className="space-y-7">
        <SummaryBarStack>
          <SummaryBar items={summaryItems} ariaLabel={t('homeSummary.security')} />
          <SecurityCommandCenter
            model={model}
            alarms={alarms}
            surface={surface}
            renderQuickviewContent={
              quickviewEntities.length === 0 && !isEditMode
                ? undefined
                : (columnCount, layout) => (
                    <SecurityQuickviewDropZone
                      location="quickview"
                      isEditMode={isEditMode}
                      showHeader={quickviewEntities.length > 0}
                    >
                      {quickviewEntities.length === 0 ? (
                        <DashboardEmptyState
                          compact
                          icon={Pin}
                          title={t('security.quickview.emptyTitle')}
                          description={t('security.quickview.dropHint')}
                          surface={surface}
                        />
                      ) : layout === 'portrait-mosaic' && canUsePortraitMosaic ? (
                        <CameraQuickviewMosaic
                          cameras={portraitMosaicCameras}
                          updateCardSize={updateCardSize}
                          isEditMode={isEditMode}
                          columnCount={columnCount}
                          onRemoveFromQuickview={unpinQuickviewEntity}
                        />
                      ) : isEditMode ? (
                        <DetailsGrid
                          devices={quickviewEntities}
                          cardSizes={cardSizes}
                          updateCardSize={updateCardSize}
                          isEditMode
                          allowEntityRemoval={false}
                          embeddedColumnCount={columnCount}
                          location="quickview"
                          onRemoveFromQuickview={unpinQuickviewEntity}
                        />
                      ) : layout === 'mobile-carousel' ? (
                        <MobileQuickviewCarousel
                          devices={quickviewEntities}
                          cardSizes={cardSizes}
                          updateCardSize={updateCardSize}
                          isEditMode={isEditMode}
                        />
                      ) : (
                        <DetailsGrid
                          devices={quickviewEntities}
                          cardSizes={cardSizes}
                          updateCardSize={updateCardSize}
                          isEditMode={isEditMode}
                          allowEntityRemoval={false}
                          embeddedColumnCount={columnCount}
                        />
                      )}
                    </SecurityQuickviewDropZone>
                  )
            }
            renderDetailsContent={
              model.summary.totalEntities > 0
                ? (columnCount) => (
                    <div ref={detailsRef}>
                      <SecurityQuickviewDropZone location="devices" isEditMode={isEditMode}>
                        <DetailsSection
                          groupSummaries={groupSummaries}
                          selectedGroupId={selectedGroupId}
                          groupingMode={groupingMode}
                          onSelectGroup={selectGroup}
                          onGroupingModeChange={(mode) => {
                            setSummaryFilter(null);
                            setGroupingMode(mode);
                          }}
                          cardSizes={cardSizes}
                          updateCardSize={updateCardSize}
                          isEditMode={isEditMode}
                          onRemoveEntity={onRemoveEntity}
                          embeddedColumnCount={columnCount}
                        />
                      </SecurityQuickviewDropZone>
                    </div>
                  )
                : undefined
            }
            onSelectEntity={handleAttentionItemClick}
            onSelectCamera={setViewerCamera}
          />
        </SummaryBarStack>

        {viewerCamera ? (
          <SummaryCameraViewer
            camera={viewerCamera}
            isOpen={viewerCamera !== null}
            onOpenChange={(open) => {
              if (!open) {
                setViewerCamera(null);
              }
            }}
          />
        ) : null}
      </div>
    </SecurityQuickviewEditor>
  );
}
