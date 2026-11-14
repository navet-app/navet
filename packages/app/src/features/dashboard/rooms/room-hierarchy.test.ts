import type { NavetProviderRoom } from '@navet/core/types';
import { describe, expect, it } from 'vitest';
import { buildRoomNavigationTree, flattenRoomNavigation } from './room-hierarchy';
import { createDiscoveredRooms } from './room-workspace-discovery';
import { reconcileRoomWorkspaceV2 } from './room-workspace-v2';

function zone(id: string, name: string, parent?: string): NavetProviderRoom {
  const canonicalId = `homey:${id}`;
  return {
    id: canonicalId,
    canonicalId,
    providerId: 'homey',
    externalId: id,
    name,
    normalizedName: name.toLowerCase(),
    parentCanonicalId: parent ? `homey:${parent}` : undefined,
    memberIds: [],
    sourceType: 'provider_managed',
    supportsOrdering: true,
    supportsDeletion: false,
  };
}

const rooms = Object.fromEntries(
  [
    zone('home', 'Home'),
    zone('up', 'Upstairs', 'home'),
    zone('down', 'Downstairs', 'home'),
    zone('upper-hall', 'Hall', 'up'),
    zone('lower-hall', 'Hall', 'down'),
  ].map((room) => [room.canonicalId, room])
);

describe('provider room hierarchy', () => {
  it('keeps distinct Hall scopes and excludes hidden rooms from a parent', () => {
    const names = createDiscoveredRooms(rooms).map(({ displayName }) => displayName);
    const tree = buildRoomNavigationTree(
      rooms,
      names.filter((name) => name !== 'Home / Downstairs / Hall'),
      new Map()
    );
    expect(tree).toHaveLength(1);
    expect(tree[0].children.find((node) => node.room === 'Upstairs')?.children).toEqual([
      { room: 'Home / Upstairs / Hall', children: [] },
    ]);
    expect(flattenRoomNavigation(tree[0])).not.toContain('Home / Downstairs / Hall');
  });

  it('splits previously merged zone sources while keeping the original workspace ID', () => {
    const oldRooms = Object.fromEntries(
      Object.values(rooms).map((room) => [
        room.canonicalId,
        { ...room, parentCanonicalId: undefined },
      ])
    );
    const before = reconcileRoomWorkspaceV2(null, createDiscoveredRooms(oldRooms));
    const merged = before.rooms.find((room) => room.displayName === 'Hall');
    expect(merged?.sourceRefs).toHaveLength(2);
    const after = reconcileRoomWorkspaceV2(before, createDiscoveredRooms(rooms));
    const halls = after.rooms.filter((room) => room.displayName.endsWith(' / Hall'));
    expect(halls.map((room) => room.sourceRefs.length)).toEqual([1, 1]);
    expect(halls.some((room) => room.id === merged?.id)).toBe(true);
  });
});
