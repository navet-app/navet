import { HOME_WIDGET_ROOM, isAllRooms } from '@navet/app/constants/rooms';
import { STORAGE_KEYS } from '@navet/app/constants/storage-keys';
import type { Device, DeviceCollection } from '@navet/app/types/device.types';
import { getDeviceRoomLabel } from '@navet/app/utils/device-location';
import {
  notifyPersistedStateChanged,
  PERSISTED_STATE_EVENT,
} from '@navet/app/utils/persisted-state-events';
import { ensureCanonicalEntityId } from '@navet/app/utils/provider-entity-id';
import { normalizeRoomName, roomNamesMatch } from '@navet/app/utils/room-name';
import { storage } from '@navet/app/utils/storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CustomCard } from './use-custom-cards';

function areRoomOrdersEqual(
  left: Record<string, string[]>,
  right: Record<string, string[]>
): boolean {
  const leftRooms = Object.keys(left);
  const rightRooms = Object.keys(right);

  if (leftRooms.length !== rightRooms.length) {
    return false;
  }

  return rightRooms.every((room) => {
    const leftOrder = left[room] ?? [];
    const rightOrder = right[room] ?? [];

    return (
      leftOrder.length === rightOrder.length &&
      leftOrder.every((id, index) => id === rightOrder[index])
    );
  });
}

export const useCardOrdering = (
  devices: DeviceCollection,
  rooms: string[],
  customCards: CustomCard[] = []
) => {
  const normalizeOrderIds = useCallback(
    (ids: string[]) => ids.map((id) => ensureCanonicalEntityId(id)),
    []
  );
  const safeCustomCards = Array.isArray(customCards) ? customCards : [];

  // Extract only id+room — stable across HA state-only updates (brightness, temperature, etc.)
  const deviceIdRoomPairs = useMemo(() => {
    const pairs: { id: string; room: string }[] = [];
    Object.values(devices).forEach((deviceArray) => {
      [...(deviceArray as Device[])]
        .sort((left, right) => left.id.localeCompare(right.id))
        .forEach((device: Device) => {
          pairs.push({ id: device.id, room: getDeviceRoomLabel(device) });
        });
    });
    return pairs;
  }, [devices]);

  // The serialized membership snapshot changes only when device ids or room assignments change.
  // Rehydrate it behind that key so state-only entity updates retain the same array reference
  // without mutating refs during render.
  const deviceIdentityKey = useMemo(() => JSON.stringify(deviceIdRoomPairs), [deviceIdRoomPairs]);
  const stableDeviceIdRoomPairs = useMemo(
    () => JSON.parse(deviceIdentityKey) as Array<{ id: string; room: string }>,
    [deviceIdentityKey]
  );

  const buildOrders = useCallback(() => {
    const orders: Record<string, string[]> = {};
    const roomNamesByKey = new Map<string, string>();
    for (const room of [
      ...rooms,
      ...safeCustomCards.map((card) => card.room).filter((room) => room !== HOME_WIDGET_ROOM),
    ]) {
      const key = normalizeRoomName(room);
      if (!roomNamesByKey.has(key)) roomNamesByKey.set(key, room);
    }
    const orderedRooms = Array.from(roomNamesByKey.values());

    orderedRooms.forEach((room) => {
      const roomCards: string[] = [];
      stableDeviceIdRoomPairs.forEach(({ id, room: deviceRoom }) => {
        if (roomNamesMatch(deviceRoom, room)) {
          roomCards.push(id);
        }
      });
      safeCustomCards.forEach((card) => {
        if (roomNamesMatch(card.room, room) || isAllRooms(card.room)) {
          roomCards.push(card.id);
        }
      });
      orders[room] = roomCards;
    });

    return orders;
  }, [rooms, safeCustomCards, stableDeviceIdRoomPairs]);

  const [cardOrders, setCardOrders] = useState<Record<string, string[]>>(() => {
    const stored = storage.get<Record<string, string[]> | null>(STORAGE_KEYS.cardOrders, null);
    if (stored) {
      const normalizedStored = Object.fromEntries(
        Object.entries(stored).map(([room, orderArray]) => [
          room,
          Array.isArray(orderArray) ? normalizeOrderIds(orderArray) : [],
        ])
      );
      const isValid = Object.values(stored).every(
        (orderArray) =>
          Array.isArray(orderArray) &&
          normalizeOrderIds(orderArray).every((id) => typeof id === 'string')
      );
      if (isValid) {
        return normalizedStored;
      }
    }

    return buildOrders();
  });

  useEffect(() => {
    const allDeviceIds = new Set(stableDeviceIdRoomPairs.map((pair) => pair.id));
    safeCustomCards.forEach((card) => {
      allDeviceIds.add(card.id);
    });

    setCardOrders((prev) => {
      const next = buildOrders();
      const mergedOrders: Record<string, string[]> = {};
      const allRooms = new Map<string, string>();
      for (const room of [...Object.keys(next), ...Object.keys(prev)]) {
        const roomKey = normalizeRoomName(room);
        if (!allRooms.has(roomKey)) allRooms.set(roomKey, room);
      }

      const previousPositions = new Map<string, number>();
      for (const ids of Object.values(prev)) {
        for (const [index, id] of ids.entries()) {
          if (!previousPositions.has(id)) previousPositions.set(id, index);
        }
      }
      allRooms.forEach((room) => {
        const savedOrders = Object.entries(prev).filter(([name]) => roomNamesMatch(name, room));
        const order = Array.from(
          new Set(savedOrders.flatMap(([, ids]) => (Array.isArray(ids) ? ids : [])))
        );
        if (savedOrders.length === 0) {
          mergedOrders[room] = [...(next[room] ?? [])].sort(
            (left, right) =>
              (previousPositions.get(left) ?? Infinity) - (previousPositions.get(right) ?? Infinity)
          );
          return;
        }

        const roomOrder = next[room] ?? [];
        const validRoomIds = new Set(roomOrder);
        // A provider can hydrate its entities after this hook initializes. Keep unknown IDs in
        // their saved positions so a partial startup snapshot cannot scramble and overwrite the
        // room order. Once an ID is known, a room move is still reconciled normally.
        const preserved = order.filter((id) => !allDeviceIds.has(id) || validRoomIds.has(id));
        const additions = roomOrder.filter((id) => !preserved.includes(id));
        mergedOrders[room] = [...preserved, ...additions];
      });

      const prevRooms = Object.keys(prev);
      const nextRooms = Object.keys(mergedOrders);
      const changed =
        prevRooms.length !== nextRooms.length ||
        nextRooms.some((room) => {
          const previousOrder = prev[room] ?? [];
          const nextOrder = mergedOrders[room] ?? [];

          return (
            previousOrder.length !== nextOrder.length ||
            previousOrder.some((id, index) => id !== nextOrder[index])
          );
        });

      if (!changed) {
        return prev;
      }

      return mergedOrders;
    });
  }, [buildOrders, safeCustomCards, stableDeviceIdRoomPairs]);

  useEffect(() => {
    storage.set(STORAGE_KEYS.cardOrders, cardOrders);
    notifyPersistedStateChanged(STORAGE_KEYS.cardOrders, cardOrders);
  }, [cardOrders]);

  useEffect(() => {
    const handlePersistedState = (event: Event) => {
      const customEvent = event as CustomEvent<{ key?: string; value?: Record<string, string[]> }>;
      if (customEvent.detail?.key !== STORAGE_KEYS.cardOrders) {
        return;
      }

      const nextValue = customEvent.detail.value ?? {};
      const normalizedValue = Object.fromEntries(
        Object.entries(nextValue).map(([room, orderArray]) => [
          room,
          Array.isArray(orderArray) ? normalizeOrderIds(orderArray) : [],
        ])
      );

      setCardOrders((previous) =>
        areRoomOrdersEqual(previous, normalizedValue) ? previous : normalizedValue
      );
    };

    window.addEventListener(PERSISTED_STATE_EVENT, handlePersistedState as EventListener);

    return () => {
      window.removeEventListener(PERSISTED_STATE_EVENT, handlePersistedState as EventListener);
    };
  }, [normalizeOrderIds]);

  return { cardOrders };
};
