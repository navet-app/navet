import { ALL_ROOMS_ID, isAllRooms } from '@navet/app/constants/rooms';
import type { RoomNavigationNode } from '@navet/app/features/dashboard/rooms/room-hierarchy';
import { normalizeRoomName } from '@navet/app/utils/room-name';

export interface RoomNavigationGroup {
  id: string;
  name: string;
  rooms: string[];
  symbol?: string;
  hierarchy?: RoomNavigationNode;
}

export function getVisibleRoomNavRooms(rooms: string[]): string[] {
  const uniqueRooms = new Map<string, string>([[normalizeRoomName(ALL_ROOMS_ID), ALL_ROOMS_ID]]);
  for (const room of rooms) {
    const key = normalizeRoomName(room);
    if (!isAllRooms(room) && !uniqueRooms.has(key)) uniqueRooms.set(key, room);
  }
  return [...uniqueRooms.values()];
}

export function resolveRoomNavigationGroups(
  visibleRooms: readonly string[],
  groups: readonly RoomNavigationGroup[]
) {
  const namesByKey = new Map(visibleRooms.map((room) => [normalizeRoomName(room), room]));
  const groupedRooms = new Set<string>();
  const visibleGroups = groups.flatMap((group) => {
    const rooms = group.rooms.flatMap((room) => {
      const key = normalizeRoomName(room);
      const displayName = namesByKey.get(key);
      if (!displayName || groupedRooms.has(key)) return [];
      groupedRooms.add(key);
      return [displayName];
    });
    return rooms.length > 0 ? [{ ...group, rooms }] : [];
  });
  return {
    visibleGroups,
    standaloneRooms: visibleRooms.filter((room) => !groupedRooms.has(normalizeRoomName(room))),
  };
}

export function filterHiddenRooms(rooms: string[], hiddenRoomNames: string[]): string[] {
  const hiddenRooms = new Set(hiddenRoomNames.map(normalizeRoomName));
  return rooms.filter((room) => !hiddenRooms.has(normalizeRoomName(room)));
}
