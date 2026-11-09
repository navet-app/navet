import { DashboardGroupingNavigation } from '@navet/app/components/patterns';
import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import { STORAGE_KEYS } from '@navet/app/constants/storage-keys';
import { DeviceGrid } from '@navet/app/features/dashboard/device-grid';
import { useRoomWorkspaceStore } from '@navet/app/features/dashboard/rooms/room-workspace-store';
import {
  SummaryBar,
  SummaryBarStack,
} from '@navet/app/features/sensors/components/info-badge-strip';
import { useI18n } from '@navet/app/hooks';
import { usePersistedState } from '@navet/app/hooks/use-persisted-state';
import type { DeviceWithType } from '@navet/app/types/device.types';
import { getDeviceRoomLabel } from '@navet/app/utils/device-location';
import { groupByRoomName, normalizeRoomName } from '@navet/app/utils/room-name';
import type { TemperatureUnit } from '@navet/app/utils/temperature';
import { memo, useMemo } from 'react';
import type { ClimateDashboardSection } from '../types/climate-dashboard';
import { buildClimateDashboardOverview } from '../utils/climate-dashboard-overview';
import { ClimateComfortBanner } from './climate-comfort-banner';
import { ClimateRoomContext, getClimateRoomContextKey } from './climate-room-context';

interface ClimateDashboardProps {
  deviceMap: Map<string, DeviceWithType>;
  sections: ClimateDashboardSection[];
  temperatureUnit: TemperatureUnit;
  cardSizes: Record<string, CardSize>;
  updateCardSize: (id: string, size: CardSize) => void;
  isEditMode: boolean;
  onRemoveEntity: (entityId: string) => void;
  densePerformanceMode: boolean;
  optimizeOffscreenPaint: boolean;
}

type ClimateGroupingMode = 'type' | 'room';
type ClimateGroupPriority = 'critical' | 'attention' | null;

interface ClimateCardGroup {
  id: string;
  label: string;
  orderedIds: string[];
  priority: ClimateGroupPriority;
  roomContextKey?: string;
}

function getGroupPriority(
  orderedIds: string[],
  attentionByDeviceId: ReadonlyMap<string, Exclude<ClimateGroupPriority, null>>
): ClimateGroupPriority {
  let hasAttention = false;
  for (const id of orderedIds) {
    const priority = attentionByDeviceId.get(id);
    if (priority === 'critical') return 'critical';
    if (priority === 'attention') hasAttention = true;
  }
  return hasAttention ? 'attention' : null;
}

const DEFAULT_NAVIGATION = { mode: 'type' as ClimateGroupingMode, type: '', room: '' };

export const ClimateDashboard = memo(function ClimateDashboard({
  deviceMap,
  sections,
  temperatureUnit,
  cardSizes,
  updateCardSize,
  isEditMode,
  onRemoveEntity,
  densePerformanceMode,
  optimizeOffscreenPaint,
}: ClimateDashboardProps) {
  const { t } = useI18n();
  const roomWorkspace = useRoomWorkspaceStore((state) => state.workspace);
  const [weatherSourceId] = usePersistedState<string | null>(
    STORAGE_KEYS.climateWeatherSource,
    null
  );
  const weatherDevices = useMemo(
    () => [...deviceMap.values()].filter((device) => device.type === 'weather'),
    [deviceMap]
  );
  const resolvedWeatherSourceId =
    weatherSourceId !== null
      ? weatherDevices.some((device) => device.id === weatherSourceId)
        ? weatherSourceId
        : null
      : weatherDevices.length === 1
        ? weatherDevices[0].id
        : null;
  const overview = useMemo(
    () =>
      buildClimateDashboardOverview(
        deviceMap.values(),
        temperatureUnit,
        t,
        resolvedWeatherSourceId
      ),
    [deviceMap, t, temperatureUnit, resolvedWeatherSourceId]
  );
  const [navigation, setNavigation] = usePersistedState(
    STORAGE_KEYS.climateNavigation,
    DEFAULT_NAVIGATION
  );
  const groupingMode: ClimateGroupingMode = navigation?.mode === 'room' ? 'room' : 'type';
  const attentionByDeviceId = useMemo(
    () => new Map(overview.attentionItems.map((item) => [item.deviceId, item.priority] as const)),
    [overview.attentionItems]
  );
  const typeGroups = useMemo<ClimateCardGroup[]>(() => {
    const seenIds = new Set<string>();
    return sections.flatMap((section) => {
      const orderedIds = section.orderedIds.filter((entityId) => {
        if (!deviceMap.has(entityId) || seenIds.has(entityId)) return false;
        seenIds.add(entityId);
        return true;
      });
      if (orderedIds.length === 0) return [];
      return [
        {
          id: `type-${section.key}`,
          label: t(section.titleKey),
          orderedIds,
          priority: getGroupPriority(orderedIds, attentionByDeviceId),
        },
      ];
    });
  }, [attentionByDeviceId, deviceMap, sections, t]);
  const roomGroups = useMemo<ClimateCardGroup[]>(() => {
    const devices = [...new Set(sections.flatMap((section) => section.orderedIds))].flatMap(
      (id) => {
        const device = deviceMap.get(id);
        return device ? [device] : [];
      }
    );
    return groupByRoomName(devices, getDeviceRoomLabel)
      .sort((left, right) => left.room.localeCompare(right.room))
      .map(({ room, items }) => {
        const orderedIds = items.map((device) => device.id);
        return {
          id: `room-${encodeURIComponent(room)}`,
          roomContextKey:
            roomWorkspace?.rooms.find(
              (entry) => normalizeRoomName(entry.displayName) === normalizeRoomName(room)
            )?.id ?? getClimateRoomContextKey(room, items),
          label: room,
          orderedIds,
          priority: getGroupPriority(orderedIds, attentionByDeviceId),
        };
      });
  }, [attentionByDeviceId, deviceMap, sections, roomWorkspace]);
  const groups = groupingMode === 'type' ? typeGroups : roomGroups;
  const requestedGroupId = navigation?.[groupingMode] ?? '';
  const selectedGroup = groups.find((group) => group.id === requestedGroupId) ?? groups[0] ?? null;
  const cardDeviceMap = useMemo(() => {
    if (!['type-temperature', 'type-humidity', 'type-pressure'].includes(selectedGroup?.id ?? '')) {
      return deviceMap;
    }
    return new Map(
      Array.from(deviceMap, ([id, device]) => [
        id,
        device.type === 'sensors' && device.sourceDeviceName
          ? { ...device, name: device.sourceDeviceName }
          : device,
      ])
    );
  }, [deviceMap, selectedGroup?.id]);
  const handleGroupingModeChange = (mode: ClimateGroupingMode) => {
    setNavigation((current) => ({ ...DEFAULT_NAVIGATION, ...current, mode }));
  };
  const handleGroupChange = (groupId: string) => {
    setNavigation((current) => ({ ...DEFAULT_NAVIGATION, ...current, [groupingMode]: groupId }));
  };
  const renderGrid = (orderedIds: string[]) => (
    <DeviceGrid
      orderedCardIds={orderedIds}
      deviceMap={cardDeviceMap}
      isEditMode={isEditMode}
      cardSizes={cardSizes}
      updateCardSize={updateCardSize}
      onRemoveEntity={onRemoveEntity}
      allowEntityRemoval
      usesHideAction
      densePerformanceMode={densePerformanceMode}
      optimizeOffscreenPaint={optimizeOffscreenPaint}
      getDeviceHeaderSubtitle={getDeviceRoomLabel}
    />
  );

  return (
    <div className="space-y-3 md:space-y-7" data-testid="climate-dashboard">
      <SummaryBarStack>
        <SummaryBar
          items={overview.summaryItems}
          ariaLabel={t('homeSummary.climate')}
          className="ios-pwa-scroll-repaint"
        />
        <ClimateComfortBanner overview={overview} />
      </SummaryBarStack>
      {selectedGroup ? (
        <div className="space-y-4">
          <DashboardGroupingNavigation
            keyboardNavigation
            ariaLabel={t('homeSummary.climate')}
            groupingLabel={t('dashboard.roomNav.grouping.label')}
            idPrefix="climate-group"
            items={groups.map((group) => ({
              id: group.id,
              label: group.label,
              indicatorTone: group.priority ?? undefined,
            }))}
            modes={[
              { id: 'type', label: t('dashboard.roomNav.grouping.type') },
              { id: 'room', label: t('dashboard.roomNav.grouping.room') },
            ]}
            selectedItemId={selectedGroup.id}
            selectedModeId={groupingMode}
            onModeChange={(modeId) => {
              if (modeId === 'type' || modeId === 'room') handleGroupingModeChange(modeId);
            }}
            onItemChange={handleGroupChange}
          />
          <section
            className="space-y-4"
            role="tabpanel"
            id={`climate-group-panel-${selectedGroup.id}`}
            aria-labelledby={`climate-group-tab-${selectedGroup.id}`}
            data-climate-group-panel={selectedGroup.id}
          >
            {groupingMode === 'room' && selectedGroup.roomContextKey ? (
              <ClimateRoomContext
                key={selectedGroup.roomContextKey}
                room={selectedGroup.label}
                roomKey={selectedGroup.roomContextKey}
                deviceMap={deviceMap}
                temperatureUnit={temperatureUnit}
                isEditMode={isEditMode}
              />
            ) : null}
            {renderGrid(selectedGroup.orderedIds)}
          </section>
        </div>
      ) : null}
    </div>
  );
});
