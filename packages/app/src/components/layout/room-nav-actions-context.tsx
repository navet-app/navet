import { createContext, type ReactNode, useContext } from 'react';

/** The shell owns app actions; room navigation only provides their layout slot. */
export const RoomNavActionsContext = createContext<ReactNode>(null);
export const useRoomNavActions = () => useContext(RoomNavActionsContext);
