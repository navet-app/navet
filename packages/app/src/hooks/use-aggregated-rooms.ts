import { getProviderRoomNames } from '@navet/app/features/dashboard/rooms/room-hierarchy';
import type { PlatformRoom } from '@navet/app/platform/types';
import { integrationSelectors } from '@navet/app/stores/selectors';
import { normalizeRoomName } from '@navet/app/utils/room-name';
import { useMemo } from 'react';
import { useIntegrationStore } from './use-integration-store';

export function useAggregatedRooms(): PlatformRoom[] {
  const normalizedRoomsByCanonicalId = useIntegrationStore(
    integrationSelectors.normalizedRoomsByCanonicalId
  );

  return useMemo<PlatformRoom[]>(() => {
    const roomsByKey = new Map<string, PlatformRoom>();

    const names = getProviderRoomNames(normalizedRoomsByCanonicalId);
    for (const room of Object.values(normalizedRoomsByCanonicalId)) {
      const name = names.get(room.canonicalId) ?? room.name;
      const roomKey = normalizeRoomName(name);
      const existing = roomsByKey.get(roomKey);
      if (existing) {
        if (!existing.providerIds.includes(room.providerId)) {
          existing.providerIds.push(room.providerId);
        }
        for (const memberId of room.memberIds) {
          if (!existing.canonicalMemberIds.includes(memberId)) {
            existing.canonicalMemberIds.push(memberId);
          }
        }
        continue;
      }

      roomsByKey.set(roomKey, {
        id: roomKey,
        key: roomKey,
        name,
        providerIds: [room.providerId],
        canonicalMemberIds: [...room.memberIds],
      });
    }

    return Array.from(roomsByKey.values()).sort((left, right) =>
      left.name.localeCompare(right.name)
    );
  }, [normalizedRoomsByCanonicalId]);
}
