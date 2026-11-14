import type { NavetProviderRoom } from '@navet/core/types';
import { getProviderRoomNames } from './room-hierarchy';
import type { RoomWorkspaceDiscoveredRoom } from './room-workspace-v2';

export function createDiscoveredRooms(
  roomsByCanonicalId: Record<string, NavetProviderRoom>
): RoomWorkspaceDiscoveredRoom[] {
  const names = getProviderRoomNames(roomsByCanonicalId);
  return Object.values(roomsByCanonicalId)
    .map((room) => ({
      displayName: names.get(room.canonicalId) ?? room.name,
      distinctZone: names.get(room.canonicalId) !== room.name,
      sourceRef: {
        providerId: room.providerId,
        canonicalId: room.canonicalId,
        sourceType: 'provider_managed' as const,
      },
    }))
    .sort((left, right) => left.sourceRef.canonicalId.localeCompare(right.sourceRef.canonicalId));
}
