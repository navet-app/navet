import { InteractivePill } from '@navet/app/components/primitives/interactive-pill';
import { getThemeDropdownSurfaceClasses } from '@navet/app/components/shared/theme/dropdown-surface-tokens';
import { getReadableAccentForeground } from '@navet/app/components/shared/theme/theme-colors';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@navet/app/components/ui/dropdown-menu';
import { cn } from '@navet/app/components/ui/utils';
import { getDashboardRoomLabel, isAllRooms } from '@navet/app/constants/rooms';
import type { AllViewGrouping } from '@navet/app/features/dashboard';
import {
  DashboardSwitcherPill,
  useDashboardSwitcher,
} from '@navet/app/features/dashboard/dashboards/dashboard-switcher';
import { RoomSymbolIcon } from '@navet/app/features/dashboard/rooms/components/room-symbol-icon';
import { useI18n, useIntegrationStore, useTheme } from '@navet/app/hooks';
import { integrationSelectors } from '@navet/app/stores/selectors';
import { normalizeRoomName, roomNamesMatch } from '@navet/app/utils/room-name';
import {
  Check,
  ChevronDown,
  Edit3,
  Layers3,
  LayoutGrid,
  type Lightbulb,
  Plus,
  SlidersHorizontal,
} from 'lucide-react';
import {
  type ButtonHTMLAttributes,
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getManageableRoomOrder } from './mobile-layout-helpers';
import {
  getVisibleRoomNavRooms,
  type RoomNavigationGroup,
  resolveRoomNavigationGroups,
} from './room-nav.utils';
import { useRoomNavActions } from './room-nav-actions-context';
import { RoomOrderDialog } from './room-order-dialog';

const ROOM_NAV_GAP_PX = 8;
const ROOM_NAV_MEGAMENU_THRESHOLD = 10;
const ROOM_NAV_FONT_SIZE_REM = 0.875;
const ROOM_NAV_FONT_WEIGHT = 500;
const ROOM_NAV_ROOM_CHROME_PX = 30;
const ROOM_NAV_GROUP_CHROME_PX = 78;
const ROOM_NAV_OVERFLOW_CHROME_PX = 50;

interface RoomNavProps {
  rooms?: string[];
  hiddenRoomNames?: string[];
  roomHiddenItemCounts?: Map<string, number>;
  roomItemCounts?: Map<string, number>;
  dashboardEntityIds?: readonly string[];
  dashboardVisibleEntityIds?: readonly string[];
  roomGroups?: readonly RoomNavigationGroup[];
  activeRoom: string;
  onRoomChange: (room: string) => void;
  allViewGrouping?: AllViewGrouping;
  isEditMode: boolean;
  onRoomOrderChange?: (rooms: string[]) => void;
  onHiddenRoomsChange?: (rooms: string[]) => void;
  onAllViewGroupingChange?: (grouping: AllViewGrouping) => void;
  onToggleEditMode: () => void;
  onAddEntity?: () => void;
  addEntityLabel?: string;
  suppressEditActions?: boolean;
  showCustomizeButton?: boolean;
}

interface RoomNavItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  room: string;
  activeRoom: string;
  allLabel: string;
  activeClassName: string;
  inactiveClassName: string;
  onRoomChange?: (room: string) => void;
}

interface RoomNavMenuButtonProps {
  icon: typeof Lightbulb;
  label: string;
  textSecondary: string;
  className: string;
}

interface RoomLayoutState {
  visibleRooms: string[];
  overflowRooms: string[];
}

type RoomNavEntry =
  | {
      id: string;
      kind: 'room';
      label: string;
      room: string;
    }
  | {
      id: string;
      kind: 'group';
      label: string;
      group: RoomNavigationGroup;
    };

function areRoomListsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function getInlineWidth(widths: number[]) {
  if (widths.length === 0) {
    return 0;
  }

  return widths.reduce((total, width) => total + width, 0) + ROOM_NAV_GAP_PX * (widths.length - 1);
}

function getFallbackTextWidth(label: string, fontSizePx: number) {
  let widthInEm = 0;

  for (const character of Array.from(label)) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (/\s/.test(character)) {
      widthInEm += 0.34;
    } else if (
      (codePoint >= 0x2e80 && codePoint <= 0x9fff) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7af) ||
      codePoint >= 0x1f000
    ) {
      widthInEm += 1;
    } else if (/[ilI1.,'|!:;]/.test(character)) {
      widthInEm += 0.34;
    } else if (/[MW@#%&]/.test(character)) {
      widthInEm += 0.9;
    } else if (/[A-Z0-9]/.test(character)) {
      widthInEm += 0.64;
    } else {
      widthInEm += 0.55;
    }
  }

  return widthInEm * fontSizePx;
}

function measureRoomNavLabel(
  label: string,
  context: CanvasRenderingContext2D | null,
  fontSizePx: number
) {
  const measuredWidth = context?.measureText(label).width;
  return Number.isFinite(measuredWidth) && (measuredWidth ?? 0) > 0
    ? (measuredWidth ?? 0)
    : getFallbackTextWidth(label, fontSizePx);
}

function buildRoomNavEntries(
  rooms: readonly string[],
  groups: readonly RoomNavigationGroup[]
): RoomNavEntry[] {
  const { visibleGroups } = resolveRoomNavigationGroups(rooms, groups);
  const groupByRoom = new Map<string, RoomNavigationGroup>();

  for (const group of visibleGroups) {
    for (const room of group.rooms) {
      if (!groupByRoom.has(normalizeRoomName(room))) {
        groupByRoom.set(normalizeRoomName(room), group);
      }
    }
  }

  const emittedGroupIds = new Set<string>();
  const emittedRoomIds = new Set<string>();
  const entries: RoomNavEntry[] = [];
  for (const room of rooms) {
    const group = groupByRoom.get(normalizeRoomName(room));
    if (group) {
      if (!emittedGroupIds.has(group.id)) {
        emittedGroupIds.add(group.id);
        entries.push({
          id: `group:${group.id}`,
          kind: 'group',
          label: group.name,
          group,
        });
      }
      continue;
    }
    const roomEntryId = `room:${normalizeRoomName(room)}`;
    if (emittedRoomIds.has(roomEntryId)) {
      continue;
    }
    emittedRoomIds.add(roomEntryId);
    entries.push({
      id: roomEntryId,
      kind: 'room',
      label: room,
      room,
    });
  }

  return entries;
}

function getRoomGroupTriggerLabel(
  group: RoomNavigationGroup,
  activeRoom: string,
  rememberedRoom: string | undefined
) {
  const activeDisplayName = group.rooms.find((room) => roomNamesMatch(room, activeRoom));
  if (activeDisplayName) return activeDisplayName;
  const rememberedDisplayName = rememberedRoom
    ? group.rooms.find((room) => roomNamesMatch(room, rememberedRoom))
    : undefined;
  if (rememberedDisplayName) return rememberedDisplayName;
  return group.rooms[0] ?? group.name;
}

function resolveRoomLayout({
  activeRoom,
  availableWidth,
  overflowWidth,
  rooms,
  roomWidths,
}: {
  activeRoom: string;
  availableWidth: number;
  overflowWidth: number;
  rooms: string[];
  roomWidths: Map<string, number>;
}): RoomLayoutState {
  if (rooms.length === 0 || availableWidth <= 0) {
    return { visibleRooms: rooms, overflowRooms: [] };
  }

  const widths = rooms.map((room) => roomWidths.get(room) ?? 0);

  if (widths.some((width) => width <= 0)) {
    return { visibleRooms: rooms, overflowRooms: [] };
  }

  if (getInlineWidth(widths) <= availableWidth) {
    return { visibleRooms: rooms, overflowRooms: [] };
  }

  const nextVisibleRooms: string[] = [];

  for (let index = 0; index < rooms.length; index += 1) {
    const room = rooms[index];
    const visibleWidths = [...nextVisibleRooms, room].map((value) => roomWidths.get(value) ?? 0);
    const remainingCount = rooms.length - index - 1;
    const projectedWidth =
      getInlineWidth(visibleWidths) + (remainingCount > 0 ? ROOM_NAV_GAP_PX + overflowWidth : 0);

    if (projectedWidth <= availableWidth || nextVisibleRooms.length === 0) {
      nextVisibleRooms.push(room);
      continue;
    }

    break;
  }

  if (nextVisibleRooms.includes(activeRoom)) {
    return {
      visibleRooms: nextVisibleRooms,
      overflowRooms: rooms.filter((room) => !nextVisibleRooms.includes(room)),
    };
  }

  const activeWidth = roomWidths.get(activeRoom);

  if (!activeWidth) {
    return {
      visibleRooms: nextVisibleRooms,
      overflowRooms: rooms.filter((room) => !nextVisibleRooms.includes(room)),
    };
  }

  for (let cutIndex = nextVisibleRooms.length - 1; cutIndex >= 0; cutIndex -= 1) {
    const candidateVisibleRooms = [...nextVisibleRooms.slice(0, cutIndex), activeRoom];
    const candidateWidths = candidateVisibleRooms.map((room) => roomWidths.get(room) ?? 0);

    if (getInlineWidth(candidateWidths) + ROOM_NAV_GAP_PX + overflowWidth <= availableWidth) {
      return {
        visibleRooms: candidateVisibleRooms,
        overflowRooms: rooms.filter((room) => !candidateVisibleRooms.includes(room)),
      };
    }
  }

  return {
    visibleRooms: [activeRoom],
    overflowRooms: rooms.filter((room) => room !== activeRoom),
  };
}

export const RoomNav = memo(function RoomNav({
  rooms = [],
  hiddenRoomNames = [],
  roomHiddenItemCounts = new Map(),
  roomItemCounts = new Map(),
  dashboardEntityIds,
  dashboardVisibleEntityIds,
  roomGroups = [],
  activeRoom,
  onRoomChange,
  allViewGrouping = 'custom',
  isEditMode,
  onRoomOrderChange,
  onHiddenRoomsChange,
  onAllViewGroupingChange,
  onToggleEditMode,
  onAddEntity,
  addEntityLabel = 'Add Entity',
  suppressEditActions = false,
  showCustomizeButton = true,
}: RoomNavProps) {
  const appActions = useRoomNavActions();
  const { t } = useI18n();
  const { theme, accentColor } = useTheme();
  const manageableRoomsByProviderId = useIntegrationStore(
    integrationSelectors.manageableRoomsByProviderId
  );
  const surface = getThemeSurfaceTokens(theme);
  const { activeDashboard, dashboards } = useDashboardSwitcher();
  const hasMultipleDashboards = dashboards.length > 1;
  const [isReorderDialogOpen, setIsReorderDialogOpen] = useState(false);
  const [roomLayout, setRoomLayout] = useState<RoomLayoutState>({
    visibleRooms: [],
    overflowRooms: [],
  });
  const [lastSelectedRoomByGroupId, setLastSelectedRoomByGroupId] = useState<
    Record<string, string>
  >({});
  const roomListRef = useRef<HTMLDivElement>(null);
  const measurementContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const measurementWidthCacheRef = useRef(new Map<string, number>());
  const manageableRooms = useMemo(
    () => Object.values(manageableRoomsByProviderId).flat(),
    [manageableRoomsByProviderId]
  );
  const orderedManageableRoomNames = useMemo(
    () => getManageableRoomOrder(rooms, manageableRooms),
    [manageableRooms, rooms]
  );
  const allLabel = t('dashboard.roomNav.all');
  const availableRooms = useMemo(
    () =>
      getVisibleRoomNavRooms(
        rooms.filter((room) => !hiddenRoomNames.some((name) => roomNamesMatch(name, room)))
      ),
    [hiddenRoomNames, rooms]
  );
  const roomNavEntries = useMemo(
    () => buildRoomNavEntries(availableRooms, roomGroups),
    [availableRooms, roomGroups]
  );
  const roomNavEntryById = useMemo(
    () => new Map(roomNavEntries.map((entry) => [entry.id, entry] as const)),
    [roomNavEntries]
  );
  const roomGroupTriggerLabelById = useMemo(
    () =>
      new Map(
        roomNavEntries.flatMap((entry) =>
          entry.kind === 'group'
            ? [
                [
                  entry.group.id,
                  getRoomGroupTriggerLabel(
                    entry.group,
                    activeRoom,
                    lastSelectedRoomByGroupId[entry.group.id]
                  ),
                ] as const,
              ]
            : []
        )
      ),
    [activeRoom, lastSelectedRoomByGroupId, roomNavEntries]
  );
  const activeRoomNavEntryId =
    roomNavEntries.find(
      (entry) =>
        (entry.kind === 'group' &&
          entry.group.rooms.some((room) => roomNamesMatch(room, activeRoom))) ||
        (entry.kind === 'room' && roomNamesMatch(entry.room, activeRoom))
    )?.id ?? `room:${normalizeRoomName(activeRoom)}`;
  const textSecondary = surface.textSecondary;
  const inactiveBg = surface.subtleBg;
  const hoverBg = surface.hoverBg;
  const dividerClass =
    theme === 'light' ? 'bg-slate-300/90' : theme === 'black' ? 'bg-white/30' : 'bg-white/14';
  const showAllViewGrouping = isAllRooms(activeRoom) && onAllViewGroupingChange;
  const showEditActions = !(isEditMode && suppressEditActions);
  const canReorderRooms =
    showEditActions &&
    isEditMode &&
    Boolean(onRoomOrderChange) &&
    orderedManageableRoomNames.length > 0;
  const hasEditMenus = Boolean(
    canReorderRooms ||
      (isEditMode && showAllViewGrouping) ||
      (showEditActions && isEditMode && onAddEntity)
  );
  const lightPillClassName =
    theme === 'light'
      ? 'border-slate-300/80 bg-white/92 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.3)]'
      : '';
  const inactiveRoomItemClassName =
    theme === 'light' ? `${textSecondary} ${hoverBg}` : `${textSecondary} ${hoverBg}`;
  const activeRoomItemClassName =
    theme === 'light'
      ? 'room-nav-item-active text-slate-950 shadow-[0_14px_28px_-20px_rgba(15,23,42,0.28)]'
      : 'room-nav-item-active text-white';
  const actionPillClassName = `flex items-center gap-2 rounded-[22px] px-3 py-2 text-sm md:gap-2.5 md:px-3.5 md:py-2 transition-colors ${inactiveBg} ${lightPillClassName} ${hoverBg}`;
  const dropdownItemClassName = `rounded-xl px-3 py-2 ${surface.textPrimary} ${hoverBg}`;
  const allViewGroupingOptions: Array<{ label: string; value: AllViewGrouping }> = [
    { label: t('dashboard.roomNav.grouping.custom'), value: 'custom' },
    { label: t('dashboard.roomNav.grouping.room'), value: 'room' },
    { label: t('dashboard.roomNav.grouping.type'), value: 'type' },
    { label: t('dashboard.roomNav.grouping.none'), value: 'none' },
  ];
  const overflowEntries = roomLayout.overflowRooms
    .map((entryId) => roomNavEntryById.get(entryId))
    .filter((entry): entry is RoomNavEntry => entry !== undefined);
  const overflowRoomCount = overflowEntries.reduce(
    (count, entry) => count + (entry.kind === 'group' ? entry.group.rooms.length : 1),
    0
  );
  const useOverflowMegamenu = overflowRoomCount > ROOM_NAV_MEGAMENU_THRESHOLD;
  const overflowLabel = t(
    overflowRoomCount === 1 ? 'dashboard.roomNav.overflow.one' : 'dashboard.roomNav.overflow.other',
    { count: overflowRoomCount }
  );
  const overflowMeasurementLabel = t(
    availableRooms.length === 1
      ? 'dashboard.roomNav.overflow.one'
      : 'dashboard.roomNav.overflow.other',
    { count: Math.max(1, availableRooms.length) }
  );

  const updateRoomLayout = useCallback(() => {
    const roomList = roomListRef.current;
    const containerWidth = roomList?.getBoundingClientRect().width ?? 0;
    if (containerWidth <= 0) {
      return;
    }

    const rootFontSize =
      Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
    const fontSizePx = rootFontSize * ROOM_NAV_FONT_SIZE_REM;
    const fontFamily = roomList
      ? window.getComputedStyle(roomList).fontFamily
      : '"Inter", system-ui';
    const font = `${ROOM_NAV_FONT_WEIGHT} ${fontSizePx}px ${fontFamily || '"Inter", system-ui'}`;

    if (!measurementContextRef.current && typeof CanvasRenderingContext2D !== 'undefined') {
      try {
        measurementContextRef.current = document.createElement('canvas').getContext('2d');
      } catch {
        measurementContextRef.current = null;
      }
    }
    if (measurementContextRef.current) {
      measurementContextRef.current.font = font;
    }

    const measureLabelWidth = (label: string) => {
      const cacheKey = `${font}:${label}`;
      const cachedWidth = measurementWidthCacheRef.current.get(cacheKey);
      if (cachedWidth !== undefined) {
        return cachedWidth;
      }
      const measuredWidth = measureRoomNavLabel(label, measurementContextRef.current, fontSizePx);
      measurementWidthCacheRef.current.set(cacheKey, measuredWidth);
      return measuredWidth;
    };

    const overflowWidth = measureLabelWidth(overflowMeasurementLabel) + ROOM_NAV_OVERFLOW_CHROME_PX;
    const roomWidths = new Map<string, number>();

    for (const entry of roomNavEntries) {
      const label =
        entry.kind === 'group'
          ? (roomGroupTriggerLabelById.get(entry.group.id) ?? entry.label)
          : isAllRooms(entry.room) && hasMultipleDashboards
            ? (activeDashboard?.name ?? allLabel)
            : getDashboardRoomLabel(entry.room, allLabel);
      roomWidths.set(
        entry.id,
        measureLabelWidth(label) +
          (entry.kind === 'group' ||
          (entry.kind === 'room' && isAllRooms(entry.room) && hasMultipleDashboards)
            ? ROOM_NAV_GROUP_CHROME_PX
            : ROOM_NAV_ROOM_CHROME_PX)
      );
    }

    const nextLayout = resolveRoomLayout({
      activeRoom: activeRoomNavEntryId,
      availableWidth: containerWidth,
      overflowWidth,
      rooms: roomNavEntries.map((entry) => entry.id),
      roomWidths,
    });

    setRoomLayout((currentLayout) =>
      areRoomListsEqual(currentLayout.visibleRooms, nextLayout.visibleRooms) &&
      areRoomListsEqual(currentLayout.overflowRooms, nextLayout.overflowRooms)
        ? currentLayout
        : nextLayout
    );
  }, [
    activeRoomNavEntryId,
    activeDashboard?.name,
    allLabel,
    hasMultipleDashboards,
    overflowMeasurementLabel,
    roomGroupTriggerLabelById,
    roomNavEntries,
  ]);

  useEffect(() => {
    const activeGroupEntry = roomNavEntries.find(
      (entry) =>
        entry.kind === 'group' && entry.group.rooms.some((room) => roomNamesMatch(room, activeRoom))
    );
    if (activeGroupEntry?.kind !== 'group') {
      return;
    }
    setLastSelectedRoomByGroupId((current) =>
      current[activeGroupEntry.group.id] === activeRoom
        ? current
        : { ...current, [activeGroupEntry.group.id]: activeRoom }
    );
  }, [activeRoom, roomNavEntries]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(updateRoomLayout);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [updateRoomLayout]);

  useEffect(() => {
    const roomList = roomListRef.current;
    if (roomList && typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateRoomLayout);
      observer.observe(roomList);
      return () => {
        observer.disconnect();
      };
    }

    window.addEventListener('resize', updateRoomLayout);
    return () => window.removeEventListener('resize', updateRoomLayout);
  }, [updateRoomLayout]);

  useEffect(() => {
    const fontsReady = document.fonts?.ready;
    if (!fontsReady) {
      return;
    }

    let cancelled = false;
    void fontsReady.then(() => {
      if (cancelled) {
        return;
      }
      measurementWidthCacheRef.current.clear();
      updateRoomLayout();
    });
    return () => {
      cancelled = true;
    };
  }, [updateRoomLayout]);

  return (
    <>
      <div className="hidden md:block">
        <div className="flex items-center gap-1.5 md:gap-2">
          <div ref={roomListRef} className="min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center gap-1 overflow-hidden">
              {roomLayout.visibleRooms.map((entryId) => {
                const entry = roomNavEntryById.get(entryId);
                if (!entry) {
                  return null;
                }
                return entry.kind === 'group' ? (
                  <RoomNavGroupItem
                    key={entry.id}
                    group={entry.group}
                    triggerLabel={roomGroupTriggerLabelById.get(entry.group.id) ?? entry.group.name}
                    activeRoom={activeRoom}
                    activeClassName={activeRoomItemClassName}
                    inactiveClassName={inactiveRoomItemClassName}
                    dropdownItemClassName={dropdownItemClassName}
                    onRoomChange={onRoomChange}
                  />
                ) : isAllRooms(entry.room) && hasMultipleDashboards ? (
                  <DashboardSwitcherPill
                    key={entry.id}
                    active={isAllRooms(activeRoom)}
                    className={
                      isAllRooms(activeRoom) ? activeRoomItemClassName : inactiveRoomItemClassName
                    }
                    onShowHome={() => onRoomChange(entry.room)}
                  />
                ) : (
                  <RoomNavItem
                    key={entry.id}
                    room={entry.room}
                    activeRoom={activeRoom}
                    allLabel={allLabel}
                    activeClassName={activeRoomItemClassName}
                    inactiveClassName={inactiveRoomItemClassName}
                    onRoomChange={onRoomChange}
                  />
                );
              })}
              {overflowEntries.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <InteractivePill
                      aria-label={t('dashboard.roomNav.openRooms')}
                      size="small"
                      variant="ghost"
                      className={`room-nav-item rounded-[22px] whitespace-nowrap shrink-0 transition-colors ${inactiveRoomItemClassName}`}
                    >
                      <span>{overflowLabel}</span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                    </InteractivePill>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    sideOffset={8}
                    className={cn(
                      getThemeDropdownSurfaceClasses(theme),
                      useOverflowMegamenu
                        ? 'flex max-h-[min(32rem,var(--radix-dropdown-menu-content-available-height))] w-[min(56rem,calc(100vw-2rem))] flex-col overflow-hidden p-2'
                        : 'w-56 overflow-visible p-1'
                    )}
                  >
                    {useOverflowMegamenu ? (
                      <>
                        <DropdownMenuLabel
                          className={`px-3 pb-2 pt-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] ${surface.textMuted}`}
                        >
                          {t('dashboard.roomNav.openRooms')}
                        </DropdownMenuLabel>
                        <div className={`mb-2 h-px ${dividerClass}`} />
                      </>
                    ) : null}
                    <div
                      className={cn(
                        useOverflowMegamenu &&
                          'grid min-h-0 grid-cols-2 gap-1 overflow-y-auto overscroll-contain pr-1 md:grid-cols-3 min-[1025px]:grid-cols-4'
                      )}
                    >
                      {overflowEntries.map((entry) =>
                        entry.kind === 'group' ? (
                          <div key={entry.id} className="col-span-full">
                            <DropdownMenuLabel className="flex items-center gap-2 pb-1 pt-2 text-xs font-semibold">
                              {entry.group.symbol ? (
                                <span aria-hidden="true">
                                  <RoomSymbolIcon
                                    value={entry.group.symbol}
                                    className="h-3.5 w-3.5"
                                  />
                                </span>
                              ) : (
                                <Layers3 className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                              <span className="truncate">{entry.group.name}</span>
                            </DropdownMenuLabel>
                            <div
                              className={cn(
                                useOverflowMegamenu
                                  ? 'grid grid-cols-2 gap-1 md:grid-cols-3 min-[1025px]:grid-cols-4'
                                  : 'space-y-1'
                              )}
                            >
                              {entry.group.rooms.map((room) => (
                                <DropdownMenuItem
                                  key={room}
                                  className={dropdownItemClassName}
                                  onClick={() => onRoomChange(room)}
                                >
                                  <span className="min-w-0 flex-1 truncate">
                                    {getDashboardRoomLabel(room, allLabel)}
                                  </span>
                                  {roomNamesMatch(activeRoom, room) ? (
                                    <Check className="h-4 w-4" />
                                  ) : null}
                                </DropdownMenuItem>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <DropdownMenuItem
                            key={entry.id}
                            className={dropdownItemClassName}
                            onClick={() => onRoomChange(entry.room)}
                          >
                            <span className="flex min-w-0 flex-1 items-center gap-2">
                              <span className="truncate">
                                {getDashboardRoomLabel(entry.room, allLabel)}
                              </span>
                            </span>
                            {roomNamesMatch(activeRoom, entry.room) ? (
                              <Check className="h-4 w-4" />
                            ) : null}
                          </DropdownMenuItem>
                        )
                      )}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 pl-1.5 md:gap-2 md:pl-2">
            {isEditMode && showAllViewGrouping ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <RoomNavMenuButton
                    icon={LayoutGrid}
                    label={t('dashboard.roomNav.view')}
                    textSecondary={textSecondary}
                    className={actionPillClassName}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  className={cn(getThemeDropdownSurfaceClasses(theme), 'overflow-visible p-2')}
                >
                  <DropdownMenuLabel className={`px-3 py-2 text-sm font-medium ${textSecondary}`}>
                    {t('dashboard.roomNav.groupBy')}
                  </DropdownMenuLabel>
                  {allViewGroupingOptions.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      className={dropdownItemClassName}
                      onClick={() => onAllViewGroupingChange(option.value)}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span>{option.label}</span>
                      </span>
                      {allViewGrouping === option.value ? <Check className="h-4 w-4" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            {canReorderRooms ? (
              <InteractivePill
                onClick={() => setIsReorderDialogOpen(true)}
                intent="action"
                size="small"
                className={actionPillClassName}
              >
                <SlidersHorizontal className={`h-4 w-4 ${textSecondary}`} />
                <span className={`hidden text-sm font-medium md:inline ${textSecondary}`}>
                  {t('dashboard.roomNav.reorder')}
                </span>
              </InteractivePill>
            ) : null}

            {showEditActions && isEditMode && onAddEntity ? (
              <InteractivePill
                onClick={onAddEntity}
                intent="action"
                size="small"
                className={actionPillClassName}
              >
                <Plus className={`h-4 w-4 ${textSecondary}`} />
                <span className={`hidden text-sm font-medium md:inline ${textSecondary}`}>
                  {addEntityLabel}
                </span>
              </InteractivePill>
            ) : null}

            {hasEditMenus ? (
              <div
                aria-hidden="true"
                className={`mx-1 h-6 w-px shrink-0 rounded-full ${dividerClass}`}
              />
            ) : null}

            {showEditActions && showCustomizeButton && !appActions ? (
              <InteractivePill
                onClick={onToggleEditMode}
                active={isEditMode}
                intent="action"
                size="small"
                className={`room-nav-action-pill hidden md:flex items-center gap-2 rounded-[22px] px-3 py-2 text-sm md:gap-2.5 md:px-3.5 md:py-2 transition-colors ${
                  isEditMode ? 'shadow-sm' : `${inactiveBg} ${lightPillClassName} ${hoverBg}`
                }`}
                style={
                  isEditMode
                    ? {
                        backgroundColor: accentColor,
                        color: getReadableAccentForeground(accentColor),
                        borderColor: `${accentColor}66`,
                        boxShadow: `0 14px 28px -18px ${accentColor}`,
                      }
                    : undefined
                }
              >
                {isEditMode ? (
                  <>
                    <Check className="h-4 w-4" />
                    <span className="hidden text-sm font-medium md:inline">
                      {t('dashboard.roomNav.doneEditing')}
                    </span>
                  </>
                ) : (
                  <>
                    <Edit3 className={`h-4 w-4 ${textSecondary}`} />
                    <span className={`hidden text-sm font-medium md:inline ${textSecondary}`}>
                      {t('dashboard.roomNav.customize')}
                    </span>
                  </>
                )}
              </InteractivePill>
            ) : null}
            {appActions}
          </div>
        </div>
      </div>

      {canReorderRooms ? (
        <RoomOrderDialog
          isOpen={isReorderDialogOpen}
          onOpenChange={setIsReorderDialogOpen}
          rooms={orderedManageableRoomNames}
          hiddenRoomNames={hiddenRoomNames}
          manageableRooms={manageableRooms}
          roomHiddenItemCounts={roomHiddenItemCounts}
          roomEntityCounts={roomItemCounts}
          dashboardEntityIds={dashboardEntityIds}
          dashboardVisibleEntityIds={dashboardVisibleEntityIds}
          onRoomOrderChange={onRoomOrderChange}
          onHiddenRoomsChange={onHiddenRoomsChange}
        />
      ) : null}
    </>
  );
});

const RoomNavMenuButton = memo(
  forwardRef<HTMLButtonElement, RoomNavMenuButtonProps & ButtonHTMLAttributes<HTMLButtonElement>>(
    function RoomNavMenuButton({ icon: Icon, label, textSecondary, className, ...props }, ref) {
      return (
        <InteractivePill ref={ref} intent="action" size="small" className={className} {...props}>
          <Icon className={`h-4 w-4 ${textSecondary}`} />
          <span className={`hidden text-sm font-medium md:inline ${textSecondary}`}>{label}</span>
          <ChevronDown className={`h-3.5 w-3.5 ${textSecondary}`} />
        </InteractivePill>
      );
    }
  )
);

const RoomNavGroupItem = memo(function RoomNavGroupItem({
  group,
  triggerLabel,
  activeRoom,
  activeClassName,
  inactiveClassName,
  dropdownItemClassName,
  onRoomChange,
}: {
  group: RoomNavigationGroup;
  triggerLabel: string;
  activeRoom: string;
  activeClassName: string;
  inactiveClassName: string;
  dropdownItemClassName: string;
  onRoomChange: (room: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isActive = group.rooms.some((room) => roomNamesMatch(room, activeRoom));
  const itemClassName = isActive ? activeClassName : inactiveClassName;

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <InteractivePill
          active={isActive}
          aria-current={isActive ? 'page' : undefined}
          onClick={(event) => {
            if (
              isRoomGroupChevronTarget(event.target) ||
              roomNamesMatch(activeRoom, triggerLabel)
            ) {
              return;
            }
            onRoomChange(triggerLabel);
          }}
          onKeyDown={(event) => {
            if (
              !roomNamesMatch(activeRoom, triggerLabel) &&
              (event.key === 'Enter' || event.key === ' ')
            ) {
              event.preventDefault();
              onRoomChange(triggerLabel);
            }
          }}
          onPointerDown={(event) => {
            if (
              !isRoomGroupChevronTarget(event.target) &&
              !roomNamesMatch(activeRoom, triggerLabel)
            ) {
              event.preventDefault();
            }
          }}
          size="small"
          variant="ghost"
          className={`room-nav-item shrink-0 whitespace-nowrap rounded-[22px] transition-colors ${itemClassName}`}
        >
          {group.symbol ? (
            <span aria-hidden="true">
              <RoomSymbolIcon value={group.symbol} className="h-3.5 w-3.5" />
            </span>
          ) : (
            <Layers3 className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
          )}
          <span>{triggerLabel}</span>
          <span data-room-group-chevron className="-mr-1 inline-flex px-1" aria-hidden="true">
            <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
          </span>
        </InteractivePill>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="w-60 overflow-visible p-1">
        <DropdownMenuLabel className="flex items-center gap-2 pb-1 text-xs font-semibold">
          {group.symbol ? (
            <span aria-hidden="true">
              <RoomSymbolIcon value={group.symbol} className="h-3.5 w-3.5" />
            </span>
          ) : (
            <Layers3 className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span className="truncate">{group.name}</span>
        </DropdownMenuLabel>
        {group.rooms.map((room) => (
          <DropdownMenuItem
            key={room}
            className={dropdownItemClassName}
            onClick={() => onRoomChange(room)}
          >
            <span className="min-w-0 flex-1 truncate">{room}</span>
            {roomNamesMatch(activeRoom, room) ? <Check className="h-4 w-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

function isRoomGroupChevronTarget(target: EventTarget | null) {
  return target instanceof Element && target.closest('[data-room-group-chevron]') !== null;
}

const RoomNavItem = memo(
  forwardRef<HTMLButtonElement, RoomNavItemProps>(function RoomNavItem(
    { room, activeRoom, allLabel, activeClassName, inactiveClassName, onRoomChange, ...props },
    ref
  ) {
    const isActive = roomNamesMatch(activeRoom, room);

    return (
      <InteractivePill
        ref={ref}
        active={isActive}
        aria-current={isActive ? 'page' : undefined}
        onClick={() => onRoomChange?.(room)}
        size="small"
        variant="ghost"
        className={`room-nav-item rounded-[22px] whitespace-nowrap shrink-0 transition-colors ${
          isActive ? activeClassName : inactiveClassName
        }`}
        {...props}
      >
        {getDashboardRoomLabel(room, allLabel)}
      </InteractivePill>
    );
  })
);
