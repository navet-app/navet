import { normalizeRoomName } from '@navet/app/utils/room-name';
import type { NavetProviderRoom } from '@navet/core/types';

export interface RoomNavigationNode {
  room: string;
  children: RoomNavigationNode[];
}

export function getProviderRoomNames(rooms: Record<string, NavetProviderRoom>) {
  const counts = new Map<string, number>();
  for (const room of Object.values(rooms)) {
    const key = normalizeRoomName(room.name);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const names = new Map<string, string>();
  const used = new Set(counts.keys());
  for (const room of Object.values(rooms).sort((a, b) =>
    a.canonicalId.localeCompare(b.canonicalId)
  )) {
    if (!room.parentCanonicalId || counts.get(normalizeRoomName(room.name)) === 1) {
      names.set(room.canonicalId, room.name);
      continue;
    }
    const segments = [room.name];
    const visited = new Set([room.canonicalId]);
    let parent: NavetProviderRoom | undefined = rooms[room.parentCanonicalId];
    while (parent && !visited.has(parent.canonicalId)) {
      visited.add(parent.canonicalId);
      segments.unshift(parent.name);
      parent = parent.parentCanonicalId ? rooms[parent.parentCanonicalId] : undefined;
    }
    const path = segments.join(' / ').slice(-110);
    let name = path;
    for (let suffix = 2; used.has(normalizeRoomName(name)); suffix++) name = `${path} (${suffix})`;
    used.add(normalizeRoomName(name));
    names.set(room.canonicalId, name);
  }
  return names;
}

export function flattenRoomNavigation(node: RoomNavigationNode): string[] {
  return [node.room, ...node.children.flatMap(flattenRoomNavigation)];
}

export function buildRoomNavigationTree(
  rooms: Record<string, NavetProviderRoom>,
  visibleRoomNames: readonly string[],
  workspaceNames: ReadonlyMap<string, string>
): RoomNavigationNode[] {
  const names = getProviderRoomNames(rooms);
  const ordered = new Map(visibleRoomNames.map((name, index) => [normalizeRoomName(name), index]));
  const nodes = new Map<string, RoomNavigationNode>();
  for (const room of Object.values(rooms)) {
    const label = workspaceNames.get(room.canonicalId) ?? names.get(room.canonicalId) ?? room.name;
    if (ordered.has(normalizeRoomName(label)))
      nodes.set(room.canonicalId, { room: label, children: [] });
  }
  const roots: RoomNavigationNode[] = [];
  for (const [id, node] of nodes) {
    const parentId = rooms[id].parentCanonicalId;
    if (!parentId) continue;
    const parent = nodes.get(parentId);
    if (parent && parent !== node) parent.children.push(node);
  }
  for (const [id, node] of nodes) {
    const parentId = rooms[id].parentCanonicalId;
    if (node.children.length && (!parentId || !nodes.has(parentId))) roots.push(node);
  }
  const sort = (nodes: RoomNavigationNode[]) => {
    nodes.sort(
      (a, b) =>
        (ordered.get(normalizeRoomName(a.room)) ?? 0) -
        (ordered.get(normalizeRoomName(b.room)) ?? 0)
    );
    for (const node of nodes) sort(node.children);
  };
  sort(roots);
  return roots;
}
