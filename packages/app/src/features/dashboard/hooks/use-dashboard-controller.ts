import {
  ALL_ROOMS_ID,
  ENERGY_WIDGET_ROOM,
  HOME_WIDGET_ROOM,
  isAllRooms,
} from '@navet/app/constants/rooms';
import { STORAGE_KEYS } from '@navet/app/constants/storage-keys';
import { isSecurityDashboardDevice } from '@navet/app/features/security/utils/security-camera-dashboard-model';
import type { DeviceCollectionKey } from '@navet/app/hooks';
import {
  buildDashboardVisibilityResult,
  DEVICE_COLLECTION_KEYS,
  useAggregatedDevices,
  useAggregatedRooms,
  useCardState,
  useDeviceCollectionsByKeys,
  useDeviceMap,
  useEditMode,
  useI18n,
  useIntegrationStore,
  useNavigation,
  usePersistedState,
  useRoomNavigation,
} from '@navet/app/hooks';
import { useAdaptiveEffectsQuality } from '@navet/app/hooks/use-adaptive-effects-quality';
import type { Section } from '@navet/app/navigation/sections';
import { isStandaloneMode } from '@navet/app/runtime/app-mode';
import {
  integrationSelectors,
  providerRuntimeSelectors,
  settingsSelectors,
} from '@navet/app/stores/selectors';
import { type EffectsQuality, useSettingsStore } from '@navet/app/stores/settings-store';
import type { DeviceCollection, DeviceWithType } from '@navet/app/types/device.types';
import { detectDeviceTier } from '@navet/app/utils/detect-device-tier';
import { logPerformanceDecision } from '@navet/app/utils/performance-diagnostics';
import { buildAggregatedRooms } from '@navet/app/utils/provider-rooms';
import { normalizeRoomName, roomNamesMatch } from '@navet/app/utils/room-name';
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { getClimateDashboardGroup } from '../../climate/utils/climate-dashboard-group';
import type { AllViewGrouping } from '../all-view-grid';
import {
  normalizeMediaStackWidgetData,
  shouldShowMediaStackWidget,
} from '../components/widgets/media-stack-widget-data';
import { resolveDashboardNavigationRooms } from '../dashboards/dashboard-collection';
import { useDashboardCollectionStore } from '../dashboards/dashboard-collection-store';
import {
  buildDashboardPackLayout,
  DASHBOARD_PACKS,
  type DashboardPackId,
} from '../packs/dashboard-packs';
import { useRoomWorkspaceStore } from '../rooms/room-workspace-store';
import { useCustomCardsStore } from '../stores/custom-cards-store';
import { resolveDashboardRoomPreferences } from './dashboard-room-preferences';
import { useAvailableRooms } from './use-available-rooms';
import { useCardOrdering } from './use-card-ordering';
import { useCardZones } from './use-card-zones';
import { useDashboardCardActions } from './use-dashboard-card-actions';
import type {
  DashboardClimateSectionGroup,
  DashboardComposition,
  DashboardController,
  DashboardSectionData,
} from './use-dashboard-controller.types';
import { useDashboardDerivedState } from './use-dashboard-derived-state';
import { useDashboardDevicesLoaded } from './use-dashboard-devices-loaded';
import { useDashboardDialogs } from './use-dashboard-dialogs';
import { useDashboardEntityVisibility } from './use-dashboard-entity-visibility';
import { resolveDashboardPerformanceProfile } from './use-dashboard-performance-mode';
import { useDashboardRoomCounts } from './use-dashboard-room-counts';
import { useDashboardRoomNavigation } from './use-dashboard-room-navigation';
import { useEditModeBeforeUnload } from './use-edit-mode-beforeunload';
import { useHomeDashboardLayout } from './use-home-dashboard-layout';
import { useHomeLayoutHydrated } from './use-home-layout-hydrated';
import {
  getRoomSecurityAlertCount,
  useHomeSecurityAlertCount,
} from './use-home-security-alert-count';
import { useOnboardingController } from './use-onboarding-controller';

const DASHBOARD_DEVICE_SECTION_IDS = new Set(['home', 'lights', 'climate']);
const EMPTY_PROVIDER_ENTITY_VIEWS: ReturnType<
  typeof integrationSelectors.providerEntityViewsByProviderId
> = {};
const SECURITY_SECTION_DEVICE_KEYS = [
  'cameras',
  'covers',
  'locks',
  'sensors',
  'persons',
  'helpers',
  'timers',
  'counters',
  'valves',
  'remotes',
] as const;
const MEDIA_SECTION_DEVICE_KEYS = ['media'] as const;
const CLIMATE_SECTION_DEVICE_KEYS = [
  'climate',
  'hvac',
  'fans',
  'switches',
  'sensors',
  'weather',
] as const;
const LIGHTS_SECTION_DEVICE_KEYS = ['lights', 'scenes'] as const;
const EMPTY_SECTION_DEVICE_KEYS: readonly DeviceCollectionKey[] = [];
const FEATURE_COLLECTION_ENTITY_ID_PATTERN = /(?:^|:)(?:calendar|weather)\./;
const CLIMATE_DASHBOARD_GROUPS: DashboardClimateSectionGroup[] = [
  {
    key: 'climate',
    titleKey: 'sections.climate.title',
    orderedIds: [],
  },
  {
    key: 'fans',
    titleKey: 'sections.climate.fans.title',
    orderedIds: [],
  },
  {
    key: 'temperature',
    titleKey: 'sections.climate.temperature.title',
    orderedIds: [],
  },
  {
    key: 'humidity',
    titleKey: 'sections.climate.humidity.title',
    orderedIds: [],
  },
  {
    key: 'airQuality',
    titleKey: 'sections.climate.airQuality.title',
    orderedIds: [],
  },
  {
    key: 'pressure',
    titleKey: 'sections.climate.pressure.title',
    orderedIds: [],
  },
];

export function useDashboardController(): DashboardComposition {
  const { activeSection, setActiveSection } = useNavigation();
  useAdaptiveEffectsQuality(activeSection);
  const { t } = useI18n();
  const dialogs = useDashboardDialogs();
  const disableAnimations = useSettingsStore(settingsSelectors.disableAnimations);
  const lowPowerMode = useSettingsStore(settingsSelectors.lowPowerMode);
  const effectsQuality = useSettingsStore(settingsSelectors.effectsQuality);
  const showHomeSummaryBar = useSettingsStore(settingsSelectors.showHomeSummaryBar);
  const showFeatureCollectionSummary = useSettingsStore(
    (state) =>
      state.showHomeSummaryBar &&
      state.advancedCustomizationEnabled &&
      state.customSummaryPills.some(
        (pill) =>
          pill.valueSourceType === 'entity' &&
          typeof pill.entityId === 'string' &&
          FEATURE_COLLECTION_ENTITY_ID_PATTERN.test(pill.entityId)
      )
  );
  const currentProviderRuntime = useIntegrationStore(
    providerRuntimeSelectors.currentProviderRuntime
  );
  const selectedProviderIds = useIntegrationStore(integrationSelectors.selectedProviderIds);
  const shouldTrackManualEntityViews = dialogs.showAddCardDialog;
  const providerEntityViewsByProviderId = useIntegrationStore(
    useCallback(
      (state) =>
        shouldTrackManualEntityViews
          ? integrationSelectors.providerEntityViewsByProviderId(state)
          : EMPTY_PROVIDER_ENTITY_VIEWS,
      [shouldTrackManualEntityViews]
    )
  );
  const connected = currentProviderRuntime.connected;
  const connecting = currentProviderRuntime.connecting;
  const entitiesHydrated = currentProviderRuntime.entitiesHydrated;
  const registriesHydrated = currentProviderRuntime.registriesHydrated;
  const [devicesLoaded, setDevicesLoaded] = useState(false);
  const [allViewGrouping, setAllViewGrouping] = usePersistedState<AllViewGrouping>(
    STORAGE_KEYS.allViewGrouping,
    'custom'
  );
  const [roomOrder, setRoomOrder] = usePersistedState<string[]>(STORAGE_KEYS.roomOrder, []);
  const [hiddenRoomNames, setHiddenRoomNames] = usePersistedState<string[]>(
    STORAGE_KEYS.hiddenRooms,
    []
  );
  const roomWorkspace = useRoomWorkspaceStore((state) => state.workspace);

  const {
    hiddenEntityIds,
    shownSensorEntityIds,
    explicitlyShownEntityIds,
    hideAutoEntity,
    showAutoEntity,
  } = useDashboardEntityVisibility();

  const activeDashboard = useDashboardCollectionStore(
    (state) => state.collection.dashboardsById[state.activeDashboardId]
  );
  const homeLayoutCardIds = activeDashboard?.homeLayout.cardIds ?? [];
  const isDeviceHeavySection =
    DASHBOARD_DEVICE_SECTION_IDS.has(activeSection) ||
    !['energy', 'media', 'security', 'settings', 'tasks'].includes(activeSection);
  const shouldIncludeFeatureCollections = resolveShouldIncludeFeatureCollections({
    activeSection,
    effectsQuality,
    homeLayoutCardIds,
    lowPowerMode,
    showAddCardDialog: dialogs.showAddCardDialog,
    showAddEntityDialog: dialogs.showAddEntityDialog,
    showFeatureCollectionSummary,
  });
  const sectionDeviceKeys = useMemo(
    () => resolveDashboardSectionDeviceKeys(activeSection),
    [activeSection]
  );
  const allDevices = useDeviceCollectionsByKeys(sectionDeviceKeys, {
    enabled: sectionDeviceKeys.length > 0,
    includeFeatureCollections:
      sectionDeviceKeys.includes('calendars') || sectionDeviceKeys.includes('weather')
        ? shouldIncludeFeatureCollections
        : false,
  });
  const dashboardVisibility = useMemo(
    () =>
      buildDashboardVisibilityResult(
        allDevices,
        hiddenEntityIds,
        resolveDashboardShownSensorEntityIds(activeSection, allDevices, shownSensorEntityIds),
        explicitlyShownEntityIds
      ),
    [activeSection, allDevices, hiddenEntityIds, shownSensorEntityIds, explicitlyShownEntityIds]
  );
  const devices = dashboardVisibility.visibleDevices;
  const availableDevices = dashboardVisibility.availableDevices;
  const countableDevices = useMemo(() => availableDevices, [availableDevices]);
  const aggregatedRooms = useAggregatedRooms();
  const shouldPrepareRoomCounts = sectionDeviceKeys === DEVICE_COLLECTION_KEYS;
  const countableRooms = useMemo(
    () =>
      shouldPrepareRoomCounts ? buildAggregatedRooms(countableDevices) : EMPTY_AGGREGATED_ROOMS,
    [countableDevices, shouldPrepareRoomCounts]
  );
  const visibleRoomsState = useMemo(
    () => (shouldPrepareRoomCounts ? buildAggregatedRooms(devices) : EMPTY_AGGREGATED_ROOMS),
    [devices, shouldPrepareRoomCounts]
  );

  const { roomItemCounts, roomHiddenItemCounts } = useDashboardRoomCounts(
    countableRooms,
    visibleRoomsState
  );

  const { availableRooms } = useAvailableRooms(aggregatedRooms);
  const roomPreferences = useMemo(
    () =>
      resolveDashboardRoomPreferences({
        availableRooms,
        hiddenRoomNames,
        roomOrder,
        workspace: roomWorkspace,
      }),
    [availableRooms, hiddenRoomNames, roomOrder, roomWorkspace]
  );
  const rooms = roomPreferences.rooms;
  const effectiveHiddenRoomNames = roomPreferences.hiddenRoomNames;
  const dashboardRooms = useMemo(
    () => resolveDashboardNavigationRooms(rooms, activeDashboard?.homeRoomNames),
    [activeDashboard?.homeRoomNames, rooms]
  );
  const visibleRooms = useMemo(() => {
    const hiddenRooms = new Set(effectiveHiddenRoomNames.map(normalizeRoomName));
    return dashboardRooms.filter((room) => !hiddenRooms.has(normalizeRoomName(room)));
  }, [dashboardRooms, effectiveHiddenRoomNames]);

  const { activeRoom, preferredRoom, changeRoom, fallbackRoom } = useRoomNavigation(
    ALL_ROOMS_ID,
    roomWorkspace
  );
  const standaloneMode = isStandaloneMode();

  useDashboardRoomNavigation(
    activeRoom,
    preferredRoom,
    visibleRooms,
    changeRoom,
    fallbackRoom,
    entitiesHydrated,
    devicesLoaded,
    registriesHydrated,
    connected,
    connecting,
    standaloneMode
  );
  useDashboardDevicesLoaded({ connected, connecting, setDevicesLoaded });

  const { isEditMode, toggleEditMode } = useEditMode();
  const handleToggleEditMode = useCallback(() => {
    startTransition(toggleEditMode);
  }, [toggleEditMode]);
  useEditModeBeforeUnload(isEditMode);
  const globalCards = useCustomCardsStore((state) => state.cards);
  const activeHomeCustomCards = activeDashboard?.homeCustomCards ?? [];
  const allCards = useMemo(
    () => [
      ...globalCards.filter((card) => card.room !== HOME_WIDGET_ROOM && !isAllRooms(card.room)),
      ...activeHomeCustomCards,
    ],
    [activeHomeCustomCards, globalCards]
  );
  const shouldTrackMediaDevices = resolveShouldTrackMediaDevices({
    activeSection,
    cards: allCards,
    isEditMode,
  });
  const mediaDevices = useDeviceCollectionsByKeys(['media'], { enabled: shouldTrackMediaDevices });
  const mediaDevicesById = useMemo(
    () => new Map(mediaDevices.media.map((device) => [device.id, device])),
    [mediaDevices.media]
  );
  const visibleCards = useMemo(
    () =>
      allCards.filter((card) => {
        if (!shouldTrackMediaDevices || isEditMode || card.type !== 'media-stack') {
          return true;
        }

        const data = normalizeMediaStackWidgetData(card.data);
        const configuredDevices = (data?.entityIds ?? [])
          .map((entityId) => mediaDevicesById.get(entityId))
          .filter((device): device is NonNullable<typeof device> => Boolean(device));

        return shouldShowMediaStackWidget(configuredDevices, data);
      }),
    [allCards, isEditMode, mediaDevicesById, shouldTrackMediaDevices]
  );
  const allCustomCards = useMemo(() => {
    const visibleCardIds = new Set(visibleCards.map((card) => card.id));
    return activeHomeCustomCards.filter((card) => visibleCardIds.has(card.id));
  }, [activeHomeCustomCards, visibleCards]);
  const customCards = useMemo(
    () =>
      visibleCards.filter(
        (card) =>
          card.room !== HOME_WIDGET_ROOM &&
          (roomNamesMatch(card.room, activeRoom) || isAllRooms(card.room)) &&
          !activeHomeCustomCards.includes(card)
      ),
    [activeHomeCustomCards, activeRoom, visibleCards]
  );
  const { cardSizes: sharedCardSizes, updateCardSize: updateSharedCardSize } =
    useCardState(devices);
  const homeCardSizes = activeDashboard?.homeCardSizes ?? {};
  const isHomeOverview = activeSection === 'home' && isAllRooms(activeRoom);
  const cardSizes = useMemo(
    () => (isHomeOverview ? { ...sharedCardSizes, ...homeCardSizes } : sharedCardSizes),
    [homeCardSizes, isHomeOverview, sharedCardSizes]
  );
  const updateActiveCardSize = useDashboardCollectionStore((state) => state.updateActiveCardSize);
  const updateCardSize = useCallback(
    (cardId: string, size: Parameters<typeof updateSharedCardSize>[1]) => {
      if (isHomeOverview) {
        updateActiveCardSize(cardId, size);
        return;
      }
      updateSharedCardSize(cardId, size);
    },
    [isHomeOverview, updateActiveCardSize, updateSharedCardSize]
  );
  const { cardOrders } = useCardOrdering(devices, rooms, visibleCards);
  const { cardZones: sharedCardZones, updateCardZone: updateSharedCardZone } = useCardZones();
  const homeCardZones = activeDashboard?.homeCardZones ?? {};
  const cardZones = useMemo(
    () => (isHomeOverview ? { ...sharedCardZones, ...homeCardZones } : sharedCardZones),
    [homeCardZones, isHomeOverview, sharedCardZones]
  );
  const updateActiveCardZone = useDashboardCollectionStore((state) => state.updateActiveCardZone);
  const updateCardZone = useCallback(
    (cardId: string, zone: Parameters<typeof updateSharedCardZone>[1]) => {
      if (isHomeOverview) {
        updateActiveCardZone(cardId, zone);
        return;
      }
      updateSharedCardZone(cardId, zone);
    },
    [isHomeOverview, updateActiveCardZone, updateSharedCardZone]
  );
  const { deviceMap } = useDeviceMap(isDeviceHeavySection ? devices : EMPTY_DEVICE_COLLECTION);
  const { deviceMap: availableDeviceMap } = useDeviceMap(
    isDeviceHeavySection ? availableDevices : EMPTY_DEVICE_COLLECTION
  );
  const availableDeviceMapRef = useRef(availableDeviceMap);
  useLayoutEffect(() => {
    availableDeviceMapRef.current = availableDeviceMap;
  }, [availableDeviceMap]);
  const manualDevices = useAggregatedDevices({
    enabled: dialogs.showAddCardDialog && activeSection !== 'energy',
    includeFeatureCollections: shouldIncludeFeatureCollections,
  });
  const { deviceMap: manualDeviceMap } = useDeviceMap(manualDevices);
  const manualEntityViewsByCanonicalId = useMemo(
    () =>
      Object.assign(
        {},
        ...selectedProviderIds.map(
          (providerId) => providerEntityViewsByProviderId[providerId] ?? {}
        )
      ),
    [providerEntityViewsByProviderId, selectedProviderIds]
  );

  const homeLayoutValidIds = useHomeLayoutValidIds(availableDeviceMap, allCustomCards);
  const homeLayoutController = useHomeDashboardLayout(homeLayoutValidIds, cardSizes);
  const {
    addCard: addHomeLayoutCard,
    addSection: addHomeLayoutSection,
    applyLayout: applyHomeLayout,
    removeCard: removeHomeLayoutCard,
    resetLayout: resetHomeLayout,
  } = homeLayoutController;
  const homeLayoutHydrated = useHomeLayoutHydrated({
    cardIds: homeLayoutController.layout.cardIds,
    availableDeviceMap,
    allCustomCards,
  });

  const { addableEntityIds, allEntityIds, lightDeviceMap, lightRooms, orderedCardIds } =
    useDashboardDerivedState({
      activeRoom,
      absorbedEntityIds: dashboardVisibility.absorbedEntityIds,
      includeLightState: activeSection === 'lights',
      includeOrderedCardIds: isDeviceHeavySection,
      availableDeviceMap,
      cardOrders,
      deviceMap,
      hiddenEntityIds,
      rooms,
    });
  const deviceTier = useMemo(() => detectDeviceTier(), []);
  const sectionData = useDashboardSectionData({
    activeSection,
    allCustomCards: visibleCards,
    availableDeviceMap,
    cardOrders,
    deviceMap,
    hiddenEntityIds,
  });
  const denseVisibleCardCount = useMemo(
    () =>
      resolveDenseVisibleCardCount({
        activeRoom,
        activeSection,
        customCards,
        deviceMap,
        lightDeviceMap,
        orderedCardIds,
        sectionData,
        homeLayoutCardIds: homeLayoutController.layout.cardIds,
      }),
    [
      activeRoom,
      activeSection,
      customCards,
      deviceMap,
      homeLayoutController.layout.cardIds,
      lightDeviceMap,
      orderedCardIds,
      sectionData,
    ]
  );
  const performanceProfile = useMemo(
    () =>
      resolveDashboardPerformanceProfile({
        activeSection,
        deviceTier,
        effectsQuality,
        isEditMode,
        lowPowerMode,
        reducedEffectsEnabled: disableAnimations || lowPowerMode,
        visibleCardCount: denseVisibleCardCount,
        visibleDevices:
          activeSection === 'lights'
            ? lightDeviceMap.values()
            : activeSection === 'climate'
              ? sectionData.climateDeviceMap.values()
              : deviceMap.values(),
      }),
    [
      activeSection,
      denseVisibleCardCount,
      deviceMap,
      deviceTier,
      disableAnimations,
      effectsQuality,
      isEditMode,
      lightDeviceMap,
      lowPowerMode,
      sectionData.climateDeviceMap,
    ]
  );
  const densePerformanceMode = performanceProfile.densePerformanceMode;
  useEffect(() => {
    logPerformanceDecision('DashboardController', {
      activeSection,
      deviceTier,
      denseMode: performanceProfile.densePerformanceMode,
      denseReason: performanceProfile.densePerformanceModeReason,
      effectiveEffectsQuality: performanceProfile.effectiveEffectsQuality,
      heavyDeviceCount: performanceProfile.heavyDeviceCount,
      visibleCardCount: denseVisibleCardCount,
    });
  }, [activeSection, denseVisibleCardCount, deviceTier, performanceProfile]);
  const securityAlertCount = useHomeSecurityAlertCount({
    devices: allDevices,
    enabled: showHomeSummaryBar && sectionData.isOverviewSection,
    hiddenEntityIds,
  });
  const activeRoomSecurityAlertCount = useMemo(
    () =>
      isAllRooms(activeRoom)
        ? securityAlertCount
        : getRoomSecurityAlertCount(allDevices, hiddenEntityIds, activeRoom),
    [activeRoom, allDevices, hiddenEntityIds, securityAlertCount]
  );

  const resetDashboard = useResetDashboard(resetHomeLayout);
  const onboarding = useOnboardingController({ allEntityIds, changeRoom, resetDashboard });
  const handleApplyDashboardPack = useCallback(
    (packId: DashboardPackId) => {
      const nextLayout = buildDashboardPackLayout(
        packId,
        availableDeviceMapRef.current.values(),
        t
      );
      const packLabelKey =
        DASHBOARD_PACKS.find((pack) => pack.id === packId)?.labelKey ?? 'dashboard.packs.title';

      if (nextLayout.cardIds.length === 0) {
        toast.warning(t('dashboard.feedback.packEmpty', { name: t(packLabelKey) }));
        return;
      }

      applyHomeLayout(nextLayout);
      toast.success(t('dashboard.feedback.packApplied', { name: t(packLabelKey) }));
    },
    [applyHomeLayout, t]
  );

  const {
    addCard: addSharedCard,
    removeCard: removeSharedCard,
    updateCard: updateSharedCard,
  } = useCustomCardsStore(
    useShallow((state) => ({
      addCard: state.addCard,
      removeCard: state.removeCard,
      updateCard: state.updateCard,
    }))
  );
  const { addActiveCustomCard, removeActiveCustomCard, updateActiveCustomCard } =
    useDashboardCollectionStore(
      useShallow((state) => ({
        addActiveCustomCard: state.addActiveCustomCard,
        removeActiveCustomCard: state.removeActiveCustomCard,
        updateActiveCustomCard: state.updateActiveCustomCard,
      }))
    );
  const addCard = isHomeOverview ? addActiveCustomCard : addSharedCard;
  const removeCard = isHomeOverview ? removeActiveCustomCard : removeSharedCard;
  const updateCard = isHomeOverview ? updateActiveCustomCard : updateSharedCard;
  const {
    handleAddCard,
    handleAddLibraryCard,
    handleAddGenericEntityCard,
    handleDeleteCard,
    handleAddEntity,
    handleRemoveEntity,
    handleUpdateCard,
  } = useDashboardCardActions({
    activeRoom,
    activeSection,
    isEditMode,
    addCard,
    removeCard,
    updateCard,
    hideAutoEntity,
    showAutoEntity,
    t,
    addCardTargetSectionId: dialogs.addCardTargetSectionId,
    homeLayoutMode: homeLayoutController.layout.mode,
    homeLayoutSections: homeLayoutController.layout.sections,
    addHomeLayoutCard,
    removeHomeLayoutCard,
    addHomeLayoutSection,
  });

  const state: DashboardController = {
    activeRoom,
    activeSection,
    addableEntityIds,
    allCustomCards,
    allEntityIds,
    allViewGrouping,
    availableDeviceMap,
    cardOrders,
    cardSizes,
    cardZones,
    changeRoom,
    customCards,
    deviceMap,
    connecting,
    densePerformanceMode,
    denseVisibleCardCount,
    optimizeOffscreenPaint: performanceProfile.optimizeOffscreenPaint,
    devicesLoaded,
    handleAddCard,
    handleAddLibraryCard,
    handleAddGenericEntityCard,
    handleAddEntity,
    handleDeleteCard,
    handleApplyDashboardPack,
    handleRemoveEntity,
    handleUpdateCard,
    hiddenEntityIds,
    hiddenRoomNames: effectiveHiddenRoomNames,
    homeLayout: homeLayoutController.layout,
    canRedoHomeLayout: homeLayoutController.canRedo,
    canUndoHomeLayout: homeLayoutController.canUndo,
    homeLayoutHydrated,
    addHomeCard: homeLayoutController.addCard,
    removeHomeCard: homeLayoutController.removeCard,
    moveHomeCard: homeLayoutController.moveCard,
    setHomeLayoutMode: homeLayoutController.setMode,
    addHomeSection: homeLayoutController.addSection,
    addHomeColumnSection: homeLayoutController.addColumnSection,
    addHomeSectionBelow: homeLayoutController.addSectionBelow,
    moveHomeSection: homeLayoutController.moveSection,
    moveHomeColumn: homeLayoutController.moveColumn,
    renameHomeSection: homeLayoutController.renameSection,
    removeHomeSection: homeLayoutController.removeSection,
    redoHomeLayout: homeLayoutController.redoLayout,
    resizeHomeSection: homeLayoutController.resizeSection,
    undoHomeLayout: homeLayoutController.undoLayout,
    isEditMode,
    lightDeviceMap,
    lightRooms,
    manualDeviceMap,
    manualEntityViewsByCanonicalId,
    onSetAllViewGrouping: setAllViewGrouping,
    onSetHiddenRoomNames: setHiddenRoomNames,
    onToggleEditMode: handleToggleEditMode,
    onSetRoomOrder: setRoomOrder,
    orderedCardIds,
    roomHiddenItemCounts,
    roomItemCounts,
    dashboardRooms,
    rooms,
    sectionData,
    securityAlertCount,
    activeRoomSecurityAlertCount,
    setActiveSection,
    updateCardSize,
    updateCardZone,
    ...onboarding,
    ...dialogs,
  };

  return {
    page: state,
    overlays: state,
    section: state,
  };
}

function resolveDenseVisibleCardCount({
  activeRoom,
  activeSection,
  customCards,
  deviceMap,
  lightDeviceMap,
  orderedCardIds,
  sectionData,
  homeLayoutCardIds,
}: {
  activeRoom: string;
  activeSection: Section;
  customCards: DashboardController['customCards'];
  deviceMap: DashboardController['deviceMap'];
  lightDeviceMap: DashboardController['lightDeviceMap'];
  orderedCardIds: DashboardController['orderedCardIds'];
  sectionData: DashboardController['sectionData'];
  homeLayoutCardIds: string[];
}): number {
  if (activeSection === 'lights') {
    return lightDeviceMap.size;
  }

  if (activeSection === 'climate') {
    return sectionData.climateSections.reduce(
      (count, section) => count + section.orderedIds.length,
      0
    );
  }

  if (activeSection === 'home' && isAllRooms(activeRoom)) {
    return homeLayoutCardIds.length;
  }

  return orderedCardIds.length > 0 ? orderedCardIds.length : deviceMap.size + customCards.length;
}

export function resolveDashboardShownSensorEntityIds(
  activeSection: string,
  devices: DeviceCollection,
  shownSensorEntityIds: string[]
): string[] {
  if (activeSection !== 'climate' && activeSection !== 'security') return shownSensorEntityIds;
  return [
    ...new Set([
      ...shownSensorEntityIds,
      ...devices.sensors
        .filter((sensor) =>
          activeSection === 'security'
            ? isSecurityDashboardDevice(sensor)
            : getClimateDashboardGroup({ ...sensor, type: 'sensors' }) !== null
        )
        .map((sensor) => sensor.id),
    ]),
  ];
}

function useDashboardSectionData({
  activeSection,
  allCustomCards,
  availableDeviceMap,
  cardOrders,
  deviceMap,
  hiddenEntityIds,
}: {
  activeSection: DashboardController['activeSection'];
  allCustomCards: DashboardController['allCustomCards'];
  availableDeviceMap: DashboardController['availableDeviceMap'];
  cardOrders: DashboardController['cardOrders'];
  deviceMap: DashboardController['deviceMap'];
  hiddenEntityIds: string[];
}): DashboardSectionData {
  const hiddenLightEntityIds = useMemo(
    () =>
      activeSection === 'lights'
        ? hiddenEntityIds.filter((entityId) => availableDeviceMap.get(entityId)?.type === 'lights')
        : [],
    [activeSection, availableDeviceMap, hiddenEntityIds]
  );
  const allLightDeviceMap = useMemo(
    () =>
      activeSection === 'lights'
        ? new Map(
            Array.from(availableDeviceMap.entries()).filter(
              ([, device]) => device.type === 'lights'
            )
          )
        : new Map<string, DeviceWithType>(),
    [activeSection, availableDeviceMap]
  );
  const climateDeviceMap = useMemo(
    () =>
      activeSection === 'climate'
        ? new Map(
            Array.from(deviceMap.entries()).filter(
              ([, device]) => getClimateDashboardGroup(device) !== null || device.type === 'weather'
            )
          )
        : new Map<string, DeviceWithType>(),
    [activeSection, deviceMap]
  );
  const allClimateDeviceMap = useMemo(
    () =>
      activeSection === 'climate'
        ? new Map(
            Array.from(availableDeviceMap.entries()).filter(
              ([, device]) => getClimateDashboardGroup(device) !== null || device.type === 'weather'
            )
          )
        : new Map<string, DeviceWithType>(),
    [activeSection, availableDeviceMap]
  );
  const hiddenClimateEntityIds = useMemo(
    () =>
      activeSection === 'climate'
        ? Array.from(allClimateDeviceMap.keys()).filter(
            (entityId) => !climateDeviceMap.has(entityId)
          )
        : [],
    [activeSection, allClimateDeviceMap, climateDeviceMap]
  );
  const climateSections = useMemo(() => {
    if (activeSection !== 'climate') {
      return [];
    }

    const groupedIds: Record<DashboardClimateSectionGroup['key'], string[]> = {
      climate: [],
      fans: [],
      temperature: [],
      humidity: [],
      airQuality: [],
      pressure: [],
    };

    climateDeviceMap.forEach((device) => {
      const group = getClimateDashboardGroup(device);
      if (group) {
        groupedIds[group].push(device.id);
      }
    });

    return CLIMATE_DASHBOARD_GROUPS.map((group) => ({
      ...group,
      orderedIds: groupedIds[group.key],
    })).filter((group) => group.orderedIds.length > 0);
  }, [activeSection, climateDeviceMap]);
  const energyCustomCards = useMemo(
    () => allCustomCards.filter((card) => card.room === ENERGY_WIDGET_ROOM),
    [allCustomCards]
  );
  const energyOrderedCardIds = useMemo(
    () =>
      activeSection === 'energy'
        ? (cardOrders[ENERGY_WIDGET_ROOM]?.filter((id) =>
            energyCustomCards.some((card) => card.id === id)
          ) ?? energyCustomCards.map((card) => card.id))
        : [],
    [activeSection, cardOrders, energyCustomCards]
  );

  return useMemo(
    () => ({
      isOverviewSection: ![
        'security',
        'energy',
        'tasks',
        'climate',
        'lights',
        'media',
        'settings',
      ].includes(activeSection),
      energyCustomCards,
      energyOrderedCardIds,
      hiddenLightEntityIds,
      allLightDeviceMap,
      climateDeviceMap,
      allClimateDeviceMap,
      hiddenClimateEntityIds,
      climateSections,
    }),
    [
      activeSection,
      allClimateDeviceMap,
      allLightDeviceMap,
      climateDeviceMap,
      climateSections,
      energyCustomCards,
      energyOrderedCardIds,
      hiddenClimateEntityIds,
      hiddenLightEntityIds,
    ]
  );
}

const EMPTY_DEVICE_COLLECTION: DeviceCollection = {
  lights: [],
  fans: [],
  hvac: [],
  climate: [],
  media: [],
  weather: [],
  switches: [],
  helpers: [],
  timers: [],
  counters: [],
  valves: [],
  remotes: [],
  covers: [],
  locks: [],
  scenes: [],
  persons: [],
  sensors: [],
  vacuums: [],
  calendars: [],
  cameras: [],
  'grouped-sensors': [],
};
const EMPTY_AGGREGATED_ROOMS = buildAggregatedRooms(EMPTY_DEVICE_COLLECTION);

function useHomeLayoutValidIds(
  availableDeviceMap: Map<string, DeviceWithType>,
  allCustomCards: Array<{ id: string }>
) {
  return useMemo(
    () => [...availableDeviceMap.keys(), ...allCustomCards.map((card) => card.id)],
    [availableDeviceMap, allCustomCards]
  );
}

function useResetDashboard(resetHomeLayout: () => void) {
  return useCallback(() => {
    resetHomeLayout();
    useCustomCardsStore.getState().replaceCards([]);
  }, [resetHomeLayout]);
}

export { getClimateDashboardGroup } from '../../climate/utils/climate-dashboard-group';

export function resolveShouldTrackMediaDevices({
  activeSection,
  cards,
  isEditMode,
}: {
  activeSection: Section;
  cards: Array<{ type: string }>;
  isEditMode: boolean;
}) {
  if (isEditMode || activeSection === 'media') {
    return true;
  }

  return activeSection === 'home' && cards.some((card) => card.type === 'media-stack');
}

export function resolveShouldIncludeFeatureCollections({
  activeSection,
  effectsQuality,
  homeLayoutCardIds,
  lowPowerMode,
  showAddCardDialog,
  showAddEntityDialog,
  showFeatureCollectionSummary,
}: {
  activeSection: Section;
  effectsQuality: EffectsQuality;
  homeLayoutCardIds: string[];
  lowPowerMode: boolean;
  showAddCardDialog: boolean;
  showAddEntityDialog: boolean;
  showFeatureCollectionSummary: boolean;
}) {
  if (!lowPowerMode && effectsQuality !== 'low') {
    return true;
  }

  if (
    activeSection === 'home' &&
    (showFeatureCollectionSummary ||
      showAddCardDialog ||
      showAddEntityDialog ||
      homeLayoutCardIds.some(
        (cardId) => cardId.includes('calendar.') || cardId.includes('weather.')
      ))
  ) {
    return true;
  }

  return false;
}

export function resolveDashboardSectionDeviceKeys(
  activeSection: Section
): readonly DeviceCollectionKey[] {
  if (activeSection === 'lights') {
    return LIGHTS_SECTION_DEVICE_KEYS;
  }

  if (activeSection === 'climate') {
    return CLIMATE_SECTION_DEVICE_KEYS;
  }

  if (activeSection === 'media') {
    return MEDIA_SECTION_DEVICE_KEYS;
  }

  if (activeSection === 'security') {
    return SECURITY_SECTION_DEVICE_KEYS;
  }

  if (['energy', 'settings', 'tasks'].includes(activeSection)) {
    return EMPTY_SECTION_DEVICE_KEYS;
  }

  return DEVICE_COLLECTION_KEYS;
}
export type {
  DashboardComposition,
  DashboardController,
} from './use-dashboard-controller.types';
