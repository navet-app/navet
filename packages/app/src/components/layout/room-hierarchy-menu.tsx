import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@navet/app/components/ui/dropdown-menu';
import type { RoomNavigationNode } from '@navet/app/features/dashboard/rooms/room-hierarchy';
import { roomNamesMatch } from '@navet/app/utils/room-name';
import { Check } from 'lucide-react';

export function RoomHierarchyMenu({
  node,
  activeRoom,
  onRoomChange,
  itemClassName,
}: {
  node: RoomNavigationNode;
  activeRoom: string;
  onRoomChange: (room: string) => void;
  itemClassName: string;
}) {
  const item = (
    <DropdownMenuItem className={itemClassName} onSelect={() => onRoomChange(node.room)}>
      <span className="min-w-0 flex-1 truncate">{node.room}</span>
      {roomNamesMatch(node.room, activeRoom) ? <Check className="h-4 w-4" /> : null}
    </DropdownMenuItem>
  );
  if (!node.children.length) return item;
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className={itemClassName}>{node.room}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-44 max-w-[80vw]">
        {item}
        {node.children.map((child) => (
          <RoomHierarchyMenu
            key={child.room}
            node={child}
            activeRoom={activeRoom}
            onRoomChange={onRoomChange}
            itemClassName={itemClassName}
          />
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
