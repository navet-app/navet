import type { NavetProviderRoom } from '@navet/core/types';
import type { RoomWorkspaceDiscoveredRoom } from './room-workspace-v2';

export function createDiscoveredRooms(
  roomsByCanonicalId: Record<string, NavetProviderRoom>
): RoomWorkspaceDiscoveredRoom[] {
  return Object.values(roomsByCanonicalId)
    .map((room) => ({
      displayName: room.name,
      sourceRef: {
        providerId: room.providerId,
        canonicalId: room.canonicalId,
        sourceType: 'provider_managed' as const,
      },
    }))
    .sort((left, right) => left.sourceRef.canonicalId.localeCompare(right.sourceRef.canonicalId));
}
