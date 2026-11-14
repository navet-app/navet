import { getManageableRoomOrder } from '@navet/app/components/layout/mobile-layout-helpers';
import { RoomNav } from '@navet/app/components/layout/room-nav';
import type { RoomNavigationGroup } from '@navet/app/components/layout/room-nav.utils';
import { RoomOrderDialog } from '@navet/app/components/layout/room-order-dialog';
import { SectionCustomizeShell } from '@navet/app/components/layout/section-customize-shell';
import { DashboardEmptyState } from '@navet/app/components/patterns';
import { LoadingSpinner } from '@navet/app/components/primitives/loading-spinner';
import { RenderProfiler } from '@navet/app/components/shared/render-profiler';
import { ALL_ROOMS_ID, isAllRooms } from '@navet/app/constants/rooms';
import { STORAGE_KEYS } from '@navet/app/constants/storage-keys';
import { getRoomTodayChores } from '@navet/app/features/chores/chore-dashboard-selectors';
import { useChoreWorkspaceStore } from '@navet/app/features/chores/chore-workspace-store';
import { useChoreWorkspaceSync } from '@navet/app/features/chores/use-chore-workspace-sync';
import { getClimateDashboardGroup } from '@navet/app/features/climate/utils/climate-dashboard-group';
import { useRoomWorkspaceStore } from '@navet/app/features/dashboard/rooms/room-workspace-store';
import { getRoomWorkspaceSectionsV2 } from '@navet/app/features/dashboard/rooms/room-workspace-v2';
import { buildRoomStatusSummaryItems } from '@navet/app/features/sensors/components/home-status-summary-model';
import {
  SummaryBar,
  SummaryBarStack,
} from '@navet/app/features/sensors/components/info-badge-strip';
import { useTaskRoutines } from '@navet/app/features/tasks/hooks/use-task-automation-groups';
import { useI18n, useIntegrationStore, usePersistedState } from '@navet/app/hooks';
import { useNavigationStore, useSettingsStore } from '@navet/app/stores';
import { integrationSelectors, settingsSelectors } from '@navet/app/stores/selectors';
import { getDeviceRoomLabel } from '@navet/app/utils/device-location';
import { normalizeRoomName, roomNamesMatch } from '@navet/app/utils/room-name';
import { getChoreTiming } from '@navet/core/chores';
import { Thermometer } from 'lucide-react';
import { lazy, type ReactNode, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { DeviceGrid } from '../device-grid';
import type { DashboardSectionModel } from '../hooks/use-dashboard-controller.types';
import { getRoomScopedDashboardEntityIds } from '../hooks/use-dashboard-derived-state';
import { buildRoomNavigationTree, flattenRoomNavigation } from '../rooms/room-hierarchy';
import { DashboardLayout } from '../shell';
import { DashboardLightsSection } from './dashboard-lights-section';
import { EmbeddedSidebarPage } from './embedded-sidebar-page';
import { HomeEditCommandBar } from './home-edit-command-bar';

const SecuritySection = lazy(async () => {
  const module = await import('@navet/app/components/layout/security-section');
  return { default: module.SecuritySection };
});
const HomeDashboardOverview = lazy(async () => {
  const module = await import('./home-dashboard-overview');
  return { default: module.HomeDashboardOverview };
});
const HouseholdSection = lazy(async () => {
  const module = await import('@navet/app/features/chores/components/household-section');
  return { default: module.HouseholdSection };
});
const TasksSection = lazy(async () => {
  const module = await import('@navet/app/features/tasks/components/tasks-section');
  return { default: module.TasksSection };
});
const MediaSection = lazy(async () => {
  const module = await import('@navet/app/components/layout/media-section');
  return { default: module.MediaSection };
});
const EnergySection = lazy(async () => {
  const module = await import('@navet/app/features/energy/components/energy-section');
  return { default: module.EnergySection };
});
const SettingsSection = lazy(async () => {
  const module = await import('@navet/app/features/settings/components/settings-section');
  return { default: module.SettingsSection };
});
const ClimateDashboard = lazy(async () => {
  const module = await import('@navet/app/features/climate');
  return { default: module.ClimateDashboard };
});
const AddEntityDialog = lazy(async () => {
  const module = await import('./add-entity-dialog');
  return { default: module.AddEntityDialog };
});
const EMPTY_MANAGEABLE_ROOMS_BY_PROVIDER_ID: ReturnType<
  typeof integrationSelectors.manageableRoomsByProviderId
> = {};

interface DashboardSectionRouterProps {
  controller: DashboardSectionModel;
}

function isActiveRoutine(routine: { enabled?: boolean; state: string }) {
  return (
    routine.enabled === true ||
    ['active', 'on', 'scening'].includes(routine.state.trim().toLowerCase())
  );
}

export function shouldSubscribeTaskRoutines(
  activeSection: DashboardSectionModel['activeSection'],
  showSummaryBar: boolean
) {
  return activeSection === 'lights' || (activeSection === 'home' && showSummaryBar);
}

function DashboardSectionRouterComponent({ controller }: DashboardSectionRouterProps) {
  const { t } = useI18n();
  const manageableRoomsByProviderId = useIntegrationStore((state) =>
    controller.activeSection === 'home'
      ? integrationSelectors.manageableRoomsByProviderId(state)
      : EMPTY_MANAGEABLE_ROOMS_BY_PROVIDER_ID
  );
  const kioskMode = useSettingsStore(settingsSelectors.kioskMode);
  const roomWorkspace = useRoomWorkspaceStore((state) =>
    controller.activeSection === 'home' || kioskMode ? state.workspace : null
  );
  const providerRooms = useIntegrationStore(integrationSelectors.normalizedRoomsByCanonicalId);
  const showSummaryBar = useSettingsStore(settingsSelectors.showHomeSummaryBar);
  const choresEnabled = useSettingsStore(settingsSelectors.choresEnabled);
  const choreWorkspace = useChoreWorkspaceStore((state) =>
    controller.activeSection === 'home' && !isAllRooms(controller.activeRoom) ? state.data : null
  );
  const choreStatus = useChoreWorkspaceStore((state) =>
    controller.activeSection === 'home' && !isAllRooms(controller.activeRoom) ? state.status : null
  );
  const activeCustomSidebarActionId = useNavigationStore(
    (state) => state.activeCustomSidebarActionId
  );
  const setActiveSection = useNavigationStore((state) => state.setActiveSection);
  const customSidebarActions = useSettingsStore(settingsSelectors.customSidebarActions);
  const temperatureUnit = useSettingsStore(settingsSelectors.temperatureUnit);
  const routines = useTaskRoutines({
    enabled: shouldSubscribeTaskRoutines(controller.activeSection, showSummaryBar),
  });
  const [energyKpisHidden, setEnergyKpisHidden] = usePersistedState(
    STORAGE_KEYS.energyKpisHidden,
    false
  );
  const [isAddClimateEntityDialogOpen, setIsAddClimateEntityDialogOpen] = useState(false);
  const [isRoomManagementOpen, setIsRoomManagementOpen] = useState(false);
  const [securityAddEntityRequestKey, setSecurityAddEntityRequestKey] = useState(0);
  const [mediaAddEntityRequestKey, setMediaAddEntityRequestKey] = useState(0);
  const {
    activeRoom,
    activeSection,
    addableEntityIds,
    availableDeviceMap,
    cardOrders,
    cardSizes,
    changeRoom,
    customCards,
    dashboardRooms,
    deviceMap,
    handleAddEntity,
    handleDeleteCard,
    handleRemoveEntity,
    handleUpdateCard,
    hiddenEntityIds,
    isEditMode,
    lightDeviceMap,
    lightRooms,
    onOpenAddEntityDialog,
    onToggleEditMode,
    orderedCardIds,
    rooms,
    sectionData,
    updateCardSize,
  } = controller;
  useChoreWorkspaceSync(choresEnabled && activeSection === 'home' && !isAllRooms(activeRoom));
  const activeRoomWorkspace = useMemo(
    () => roomWorkspace?.rooms.find((room) => roomNamesMatch(room.displayName, activeRoom)),
    [activeRoom, roomWorkspace]
  );
  const roomChoreNow = useMemo(() => new Date(), [activeRoom, choreWorkspace]);
  const roomTodayChores = useMemo(
    () =>
      choresEnabled && choreWorkspace && !isAllRooms(activeRoom)
        ? getRoomTodayChores(
            choreWorkspace,
            {
              label: activeRoom,
              canonicalIds: activeRoomWorkspace?.sourceRefs.map((source) => source.canonicalId),
            },
            roomChoreNow
          )
        : [],
    [activeRoom, activeRoomWorkspace, choreWorkspace, choresEnabled, roomChoreNow]
  );
  const pendingRoomChores = useMemo(
    () => roomTodayChores.filter((occurrence) => occurrence.status !== 'done'),
    [roomTodayChores]
  );
  const overdueRoomChoreCount = useMemo(
    () =>
      pendingRoomChores.filter(
        (occurrence) => getChoreTiming(occurrence, roomChoreNow) === 'overdue'
      ).length,
    [pendingRoomChores, roomChoreNow]
  );
  const manageableRoomReferences = useMemo(
    () => Object.values(manageableRoomsByProviderId).flat(),
    [manageableRoomsByProviderId]
  );
  const manageableRooms = getManageableRoomOrder(rooms, manageableRoomReferences);
  const dashboardEntityIds = useMemo(
    () => Array.from(availableDeviceMap.keys()),
    [availableDeviceMap]
  );
  const dashboardVisibleEntityIds = useMemo(() => Array.from(deviceMap.keys()), [deviceMap]);
  const roomHierarchy = useMemo(() => {
    const workspaceNames = new Map(
      roomWorkspace?.rooms.flatMap((room) =>
        room.sourceRefs.map((source) => [source.canonicalId, room.displayName] as const)
      )
    );
    const hidden = new Set((controller.hiddenRoomNames ?? []).map(normalizeRoomName));
    return buildRoomNavigationTree(
      providerRooms,
      dashboardRooms.filter((room) => !hidden.has(normalizeRoomName(room))),
      workspaceNames
    );
  }, [providerRooms, dashboardRooms, controller.hiddenRoomNames, roomWorkspace]);
  const descendantRooms = useMemo(() => {
    const find = (nodes: typeof roomHierarchy): string[] => {
      for (const node of nodes) {
        if (roomNamesMatch(node.room, activeRoom))
          return node.children.flatMap(flattenRoomNavigation);
        const descendants = find(node.children);
        if (descendants.length) return descendants;
      }
      return [];
    };
    return find(roomHierarchy);
  }, [activeRoom, roomHierarchy]);
  const roomNavigationGroups = useMemo<RoomNavigationGroup[]>(() => {
    const availableRoomNames = new Map(
      dashboardRooms.map((room) => [normalizeRoomName(room), room])
    );

    const providerGroups = roomHierarchy.map((node) => ({
      id: `provider:${node.room}`,
      name: node.room,
      rooms: flattenRoomNavigation(node),
      hierarchy: node,
    }));
    const assigned = new Set(providerGroups.flatMap((group) => group.rooms.map(normalizeRoomName)));
    const customGroups = getRoomWorkspaceSectionsV2(roomWorkspace).flatMap((section) => {
      if (!section.group) {
        return [];
      }
      const groupedRoomNames = section.rooms.flatMap((room) => {
        const name = availableRoomNames.get(normalizeRoomName(room.displayName));
        return name && !assigned.has(normalizeRoomName(name)) ? [name] : [];
      });

      return groupedRoomNames.length > 0
        ? [
            {
              id: section.group.id,
              name: section.group.displayName,
              rooms: groupedRoomNames,
              symbol: section.group.symbol,
            },
          ]
        : [];
    });
    return [...providerGroups, ...customGroups];
  }, [dashboardRooms, roomHierarchy, roomWorkspace]);
  const roomManagement =
    activeSection === 'home' && manageableRooms.length > 0
      ? {
          rooms: manageableRooms,
          hiddenRoomNames: controller.hiddenRoomNames,
          manageableRooms: manageableRoomReferences,
          roomHiddenItemCounts: controller.roomHiddenItemCounts,
          roomItemCounts: controller.roomItemCounts,
          dashboardEntityIds,
          dashboardVisibleEntityIds,
          onRoomOrderChange: controller.onSetRoomOrder,
          onHiddenRoomsChange: controller.onSetHiddenRoomNames,
        }
      : undefined;
  const isHomeOverviewEditMode = activeSection === 'home' && isEditMode && isAllRooms(activeRoom);
  const sectionStackProps = {
    className: 'flex flex-col gap-2 md:gap-4 min-[1025px]:gap-6',
  };
  const totalRoutineCount =
    routines.automations.filter(isActiveRoutine).length +
    routines.quickActions.filter(isActiveRoutine).length;
  const roomClimateEntityIds = useMemo(() => {
    if (isAllRooms(activeRoom)) {
      return undefined;
    }

    return new Set(
      Array.from(deviceMap.values())
        .filter(
          (device) =>
            roomNamesMatch(getDeviceRoomLabel(device), activeRoom) &&
            getClimateDashboardGroup(device) !== null
        )
        .map((device) => device.id)
    );
  }, [activeRoom, deviceMap]);
  const roomStatusSummaryItems = useMemo(() => {
    if (!sectionData.isOverviewSection || isAllRooms(activeRoom)) {
      return [];
    }

    const routineCount =
      routines.automations.filter(
        (routine) => roomNamesMatch(routine.room, activeRoom) && isActiveRoutine(routine)
      ).length +
      routines.quickActions.filter(
        (routine) => roomNamesMatch(routine.room, activeRoom) && isActiveRoutine(routine)
      ).length;

    return buildRoomStatusSummaryItems(
      availableDeviceMap,
      activeRoom,
      {
        climateEntityIds: roomClimateEntityIds,
        pendingChoreCount: choresEnabled ? pendingRoomChores.length : undefined,
        overdueChoreCount: overdueRoomChoreCount,
        routineCount,
        securityAlertCount: controller.activeRoomSecurityAlertCount,
        temperatureUnit,
      },
      t
    )
      .filter((item) => showSummaryBar || item.id === 'chores')
      .map((item) =>
        item.id === 'chores'
          ? {
              ...item,
              value: choreWorkspace
                ? item.value
                : choreStatus === 'unavailable'
                  ? t('household.unavailable.title')
                  : choreStatus === 'unauthorized'
                    ? t('household.unauthorized.title')
                    : choreStatus === 'error'
                      ? t('household.error.title')
                      : t('common.loading'),
              iconColor: choreWorkspace ? item.iconColor : '#cbd5e1',
            }
          : item
      );
  }, [
    activeRoom,
    availableDeviceMap,
    choresEnabled,
    choreWorkspace,
    choreStatus,
    pendingRoomChores.length,
    overdueRoomChoreCount,
    roomClimateEntityIds,
    controller.activeRoomSecurityAlertCount,
    routines.automations,
    routines.quickActions,
    showSummaryBar,
    temperatureUnit,
    t,
    sectionData.isOverviewSection,
  ]);
  const openAddClimateEntityDialog = useCallback(() => setIsAddClimateEntityDialogOpen(true), []);
  const closeAddClimateEntityDialog = useCallback(() => setIsAddClimateEntityDialogOpen(false), []);
  const handleAddClimateEntity = useCallback(
    (entityId: string) => {
      handleAddEntity(entityId);
    },
    [handleAddEntity]
  );
  const openSecurityAddEntityDialog = useCallback(
    () => setSecurityAddEntityRequestKey((previous) => previous + 1),
    []
  );
  const scopedAddableEntityIds = useMemo(
    () =>
      activeSection === 'home' && !isAllRooms(activeRoom)
        ? getRoomScopedDashboardEntityIds(addableEntityIds, availableDeviceMap, activeRoom)
        : addableEntityIds,
    [activeRoom, activeSection, addableEntityIds, availableDeviceMap]
  );
  const canOpenAddEntityDialog = scopedAddableEntityIds.length > 0;
  const headerAddAction = (() => {
    if (!isEditMode) {
      return canOpenAddEntityDialog ? onOpenAddEntityDialog : undefined;
    }

    if ((activeSection === 'home' && isAllRooms(activeRoom)) || activeSection === 'energy') {
      return controller.onOpenAddCardDialog;
    }

    if (activeSection === 'security') {
      return openSecurityAddEntityDialog;
    }

    if (activeSection === 'media') {
      return () => setMediaAddEntityRequestKey((previous) => previous + 1);
    }

    if (activeSection === 'lights' && sectionData.hiddenLightEntityIds.length > 0) {
      return onOpenAddEntityDialog;
    }

    if (activeSection === 'climate' && sectionData.hiddenClimateEntityIds.length > 0) {
      return openAddClimateEntityDialog;
    }

    return canOpenAddEntityDialog ? onOpenAddEntityDialog : undefined;
  })();
  const headerAddLabel =
    isEditMode &&
    ((activeSection === 'home' && isAllRooms(activeRoom)) || activeSection === 'energy')
      ? t('dashboard.roomNav.addCard')
      : t('dashboard.addEntity.title');
  const embeddedSidebarAction =
    activeCustomSidebarActionId === null
      ? null
      : (customSidebarActions.find(
          (action) =>
            action.id === activeCustomSidebarActionId &&
            action.targetType === 'iframe' &&
            Boolean(action.targetUrl)
        ) ?? null);

  useEffect(() => {
    if (activeCustomSidebarActionId !== null && embeddedSidebarAction === null) {
      setActiveSection('home');
    }
  }, [activeCustomSidebarActionId, embeddedSidebarAction, setActiveSection]);

  let sectionContent: ReactNode;

  if (activeCustomSidebarActionId !== null && embeddedSidebarAction === null) {
    sectionContent = null;
  } else if (embeddedSidebarAction) {
    sectionContent = (
      <RenderProfiler id="EmbeddedSidebarPage">
        <EmbeddedSidebarPage
          title={embeddedSidebarAction.label}
          url={embeddedSidebarAction.targetUrl ?? ''}
        />
      </RenderProfiler>
    );
  } else if (activeSection === 'security') {
    sectionContent = (
      <Suspense fallback={<LoadingSpinner />}>
        <SecuritySection
          openAddEntityRequestKey={securityAddEntityRequestKey}
          suppressEditActions={isEditMode}
        />
      </Suspense>
    );
  } else if (activeSection === 'energy') {
    sectionContent = (
      <Suspense fallback={<LoadingSpinner />}>
        <RenderProfiler id="EnergySection">
          <div className="space-y-6">
            <EnergySection
              energyCustomCards={sectionData.energyCustomCards}
              energyOrderedCardIds={sectionData.energyOrderedCardIds}
              isEditMode={isEditMode}
              onDeleteCard={handleDeleteCard}
              onUpdateCard={handleUpdateCard}
            />
          </div>
        </RenderProfiler>
      </Suspense>
    );
  } else if (activeSection === 'tasks') {
    sectionContent = (
      <Suspense fallback={<LoadingSpinner />}>
        {choresEnabled ? <HouseholdSection /> : <TasksSection />}
      </Suspense>
    );
  } else if (activeSection === 'climate') {
    sectionContent = (
      <div {...sectionStackProps} className="relative flex flex-col gap-2 md:gap-6">
        {sectionData.climateDeviceMap.size > 0 ? (
          <SectionCustomizeShell
            isEditMode={isEditMode}
            onToggle={onToggleEditMode ?? (() => {})}
            className="relative"
            actions={null}
            showCustomizeButton={false}
          >
            <RenderProfiler id="ClimateSection">
              <Suspense fallback={<LoadingSpinner message={t('common.loading')} />}>
                <ClimateDashboard
                  deviceMap={sectionData.climateDeviceMap}
                  sections={sectionData.climateSections}
                  temperatureUnit={temperatureUnit}
                  cardSizes={cardSizes}
                  updateCardSize={updateCardSize}
                  isEditMode={isEditMode}
                  onRemoveEntity={handleRemoveEntity}
                  densePerformanceMode={controller.densePerformanceMode}
                  optimizeOffscreenPaint={controller.optimizeOffscreenPaint}
                />
              </Suspense>
            </RenderProfiler>
          </SectionCustomizeShell>
        ) : (
          <div className="flex h-full items-center justify-center p-6">
            <DashboardEmptyState
              icon={Thermometer}
              title={t('sections.climate.emptyTitle')}
              description={
                sectionData.hiddenClimateEntityIds.length > 0
                  ? t('sections.climate.emptyHiddenDescription')
                  : t('sections.climate.emptyDescription')
              }
              actionIcon={Thermometer}
              actionLabel={
                sectionData.hiddenClimateEntityIds.length > 0
                  ? t('dashboard.addEntity.title')
                  : undefined
              }
              onAction={
                sectionData.hiddenClimateEntityIds.length > 0
                  ? openAddClimateEntityDialog
                  : undefined
              }
              className="w-full max-w-md"
            />
          </div>
        )}

        {isAddClimateEntityDialogOpen ? (
          <Suspense fallback={<LoadingSpinner message={t('common.loading')} />}>
            <AddEntityDialog
              open={isAddClimateEntityDialogOpen}
              onClose={closeAddClimateEntityDialog}
              onAddEntity={handleAddClimateEntity}
              currentRoom={ALL_ROOMS_ID}
              deviceMap={sectionData.allClimateDeviceMap}
              addedEntityIds={[]}
              visibleEntityIds={sectionData.hiddenClimateEntityIds}
              title={t('dashboard.addEntity.title')}
              description={t('dashboard.addEntity.descriptionWithHidden')}
              actionLabel={t('dashboard.addEntity.action')}
            />
          </Suspense>
        ) : null}
      </div>
    );
  } else if (activeSection === 'lights') {
    sectionContent = (
      <DashboardLightsSection
        allLightDeviceMap={sectionData.allLightDeviceMap}
        cardOrders={cardOrders}
        handleAddEntity={handleAddEntity}
        handleRemoveEntity={handleRemoveEntity}
        hiddenLightEntityIds={sectionData.hiddenLightEntityIds}
        isEditMode={isEditMode}
        lightDeviceMap={lightDeviceMap}
        lightRooms={lightRooms}
        onToggleEditMode={onToggleEditMode}
      />
    );
  } else if (activeSection === 'media') {
    sectionContent = (
      <Suspense fallback={<LoadingSpinner />}>
        <MediaSection addEntityRequestKey={mediaAddEntityRequestKey} />
      </Suspense>
    );
  } else if (activeSection === 'settings') {
    sectionContent = (
      <Suspense fallback={<LoadingSpinner message={t('dashboard.shell.loadingSettings')} />}>
        <RenderProfiler id="SettingsSection">
          <SettingsSection />
        </RenderProfiler>
      </Suspense>
    );
  } else {
    sectionContent = (
      <div {...sectionStackProps}>
        {kioskMode ? null : (
          <RoomNav
            rooms={dashboardRooms}
            hiddenRoomNames={controller.hiddenRoomNames}
            roomHiddenItemCounts={controller.roomHiddenItemCounts}
            roomItemCounts={controller.roomItemCounts}
            dashboardEntityIds={dashboardEntityIds}
            dashboardVisibleEntityIds={dashboardVisibleEntityIds}
            roomGroups={roomNavigationGroups}
            activeRoom={activeRoom}
            onRoomChange={changeRoom}
            isEditMode={isEditMode}
            onRoomOrderChange={controller.onSetRoomOrder}
            onHiddenRoomsChange={controller.onSetHiddenRoomNames}
            onToggleEditMode={onToggleEditMode}
            onAddEntity={headerAddAction}
            addEntityLabel={headerAddLabel}
            suppressEditActions={isEditMode}
            showCustomizeButton={false}
          />
        )}

        {isAllRooms(activeRoom) ? (
          <RenderProfiler id="HomeDashboardOverview">
            <Suspense fallback={<LoadingSpinner message={t('common.loading')} />}>
              <HomeDashboardOverview
                deviceMap={controller.availableDeviceMap}
                summaryDeviceMap={controller.deviceMap}
                cardSizes={cardSizes}
                updateCardSize={updateCardSize}
                isEditMode={isEditMode}
                hiddenEntityCount={hiddenEntityIds.length}
                allCustomCards={controller.allCustomCards}
                homeLayout={controller.homeLayout}
                canRedoHomeLayout={controller.canRedoHomeLayout}
                canUndoHomeLayout={controller.canUndoHomeLayout}
                removeHomeCard={controller.removeHomeCard}
                moveHomeCard={controller.moveHomeCard}
                setHomeLayoutMode={controller.setHomeLayoutMode}
                addHomeSection={controller.addHomeSection}
                addHomeColumnSection={controller.addHomeColumnSection}
                addHomeSectionBelow={controller.addHomeSectionBelow}
                moveHomeSection={controller.moveHomeSection}
                moveHomeColumn={controller.moveHomeColumn}
                renameHomeSection={controller.renameHomeSection}
                removeHomeSection={controller.removeHomeSection}
                resizeHomeSection={controller.resizeHomeSection}
                redoHomeLayout={controller.redoHomeLayout}
                undoHomeLayout={controller.undoHomeLayout}
                onOpenAddCardDialog={controller.onOpenAddCardDialog}
                onApplyDashboardPack={controller.handleApplyDashboardPack}
                onUpdateCard={handleUpdateCard}
                onToggleEditMode={controller.onToggleEditMode}
                onNavigateSection={controller.setActiveSection}
                routineCount={totalRoutineCount}
                securityAlertCount={controller.securityAlertCount}
                densePerformanceMode={controller.densePerformanceMode}
              />
            </Suspense>
          </RenderProfiler>
        ) : (
          <RenderProfiler id={`DeviceGrid:${activeRoom}`}>
            <SummaryBarStack>
              <SummaryBar
                items={roomStatusSummaryItems}
                singleRow
                onNavigate={controller.setActiveSection}
                ariaLabel={t('settings.dashboard.homeSummaryBar.title')}
              />
              {[activeRoom, ...descendantRooms].map((room) => {
                const ids =
                  room === activeRoom
                    ? orderedCardIds
                    : (cardOrders[room] ?? []).filter((id) => deviceMap.has(id));
                if (descendantRooms.length && !ids.length) return null;
                return (
                  <div key={room} className="space-y-2">
                    {descendantRooms.length && ids.length ? (
                      <h2 className="text-base font-semibold">{room}</h2>
                    ) : null}
                    <DeviceGrid
                      orderedCardIds={ids}
                      deviceMap={deviceMap}
                      isEditMode={isEditMode}
                      cardSizes={cardSizes}
                      updateCardSize={updateCardSize}
                      customCards={room === activeRoom ? customCards : []}
                      onDeleteCard={handleDeleteCard}
                      onUpdateCard={handleUpdateCard}
                      onRemoveEntity={handleRemoveEntity}
                      allowEntityRemoval
                      usesHideAction
                      densePerformanceMode={controller.densePerformanceMode}
                      optimizeOffscreenPaint={controller.optimizeOffscreenPaint}
                    />
                  </div>
                );
              })}
            </SummaryBarStack>
          </RenderProfiler>
        )}
      </div>
    );
  }

  return (
    <DashboardLayout
      densePerformanceMode={controller.densePerformanceMode}
      mobileEditActions={
        isEditMode || activeSection === 'tasks' || activeSection === 'settings'
          ? undefined
          : {
              isEditMode,
              onToggleEditMode,
              onAddEntity: headerAddAction,
              addEntityLabel: headerAddLabel,
              ...(roomManagement ? { reorderRooms: roomManagement } : {}),
            }
      }
      mobileRoomNavigation={{
        activeRoom,
        onRoomChange: changeRoom,
        rooms: dashboardRooms,
        hiddenRoomNames: controller.hiddenRoomNames,
        groups: roomNavigationGroups,
      }}
    >
      {isEditMode && activeSection !== 'tasks' && activeSection !== 'settings' ? (
        <>
          <HomeEditCommandBar
            addActionLabel={headerAddLabel}
            canRedo={isHomeOverviewEditMode ? controller.canRedoHomeLayout : undefined}
            canUndo={isHomeOverviewEditMode ? controller.canUndoHomeLayout : undefined}
            homeLayoutMode={isHomeOverviewEditMode ? controller.homeLayout.mode : undefined}
            onAddCard={headerAddAction}
            onAddColumn={
              isHomeOverviewEditMode && controller.homeLayout.mode === 'sectioned'
                ? () => controller.addHomeColumnSection()
                : undefined
            }
            onAddRow={
              isHomeOverviewEditMode && controller.homeLayout.mode === 'sectioned'
                ? () => controller.addHomeSection()
                : undefined
            }
            onApplyPack={isHomeOverviewEditMode ? controller.handleApplyDashboardPack : undefined}
            energyKpisHidden={energyKpisHidden}
            onToggleEnergyKpis={
              activeSection === 'energy'
                ? () => setEnergyKpisHidden((hidden) => !hidden)
                : undefined
            }
            onManageRooms={roomManagement ? () => setIsRoomManagementOpen(true) : undefined}
            onRedo={isHomeOverviewEditMode ? controller.redoHomeLayout : undefined}
            onSetLayoutMode={isHomeOverviewEditMode ? controller.setHomeLayoutMode : undefined}
            onToggleEditMode={onToggleEditMode}
            onUndo={isHomeOverviewEditMode ? controller.undoHomeLayout : undefined}
          />
          {roomManagement ? (
            <RoomOrderDialog
              isOpen={isRoomManagementOpen}
              onOpenChange={setIsRoomManagementOpen}
              rooms={roomManagement.rooms}
              hiddenRoomNames={roomManagement.hiddenRoomNames}
              manageableRooms={roomManagement.manageableRooms}
              roomHiddenItemCounts={roomManagement.roomHiddenItemCounts}
              roomEntityCounts={roomManagement.roomItemCounts}
              dashboardEntityIds={roomManagement.dashboardEntityIds}
              dashboardVisibleEntityIds={roomManagement.dashboardVisibleEntityIds}
              onRoomOrderChange={roomManagement.onRoomOrderChange}
              onHiddenRoomsChange={roomManagement.onHiddenRoomsChange}
            />
          ) : null}
        </>
      ) : null}
      {activeSection === 'tasks' || activeSection === 'settings' ? (
        sectionContent
      ) : (
        <main className="min-w-0">{sectionContent}</main>
      )}
    </DashboardLayout>
  );
}

export const DashboardSectionRouter = DashboardSectionRouterComponent;
