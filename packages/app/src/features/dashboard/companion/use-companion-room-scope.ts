import { ALL_ROOMS_ID, isAllRooms } from '@navet/app/constants/rooms';
import { useIntegrationStore } from '@navet/app/hooks';
import { useRoomNavigation } from '@navet/app/hooks/use-room-navigation';
import { useNavigationStore } from '@navet/app/stores/navigation-store';
import { integrationSelectors } from '@navet/app/stores/selectors';
import { normalizeRoomName } from '@navet/app/utils/room-name';
import { useEffect } from 'react';
import { createDiscoveredRooms } from '../rooms/room-workspace-discovery';
import { useRoomWorkspaceStore } from '../rooms/room-workspace-store';
import { createNavetRoomWorkspaceRoomV2 } from '../rooms/room-workspace-v2';

export function useCompanionRoomScope(editing: boolean) {
  const activeSection = useNavigationStore((state) => state.activeSection);
  const customAction = useNavigationStore((state) => state.activeCustomSidebarActionId);
  const workspace = useRoomWorkspaceStore((state) => state.workspace);
  const initialize = useRoomWorkspaceStore((state) => state.initialize);
  const replaceWorkspace = useRoomWorkspaceStore((state) => state.replaceWorkspace);
  const { activeRoom, activeRoomId } = useRoomNavigation(ALL_ROOMS_ID, workspace);
  const isRoom = activeSection === 'home' && !customAction && !isAllRooms(activeRoom);
  const normalizedRooms = useIntegrationStore(integrationSelectors.normalizedRoomsByCanonicalId);

  useEffect(() => {
    if (!editing || !isRoom || activeRoomId) return;
    // Room management is otherwise initialized lazily. Reuse its upgrade path before
    // saving room preferences so a fresh installation gets the same stable identities.
    const initialized = initialize(createDiscoveredRooms(normalizedRooms), {
      legacyAllName: ALL_ROOMS_ID,
    });
    if (
      !initialized.rooms.some(
        (room) => normalizeRoomName(room.displayName) === normalizeRoomName(activeRoom)
      )
    ) {
      const created = createNavetRoomWorkspaceRoomV2(initialized, { displayName: activeRoom });
      if (created.roomId) replaceWorkspace(created.workspace);
    }
  }, [activeRoom, activeRoomId, editing, initialize, isRoom, normalizedRooms, replaceWorkspace]);

  return { isRoom, roomId: isRoom ? activeRoomId : null, roomName: activeRoom };
}
