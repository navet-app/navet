import { create } from 'zustand';

// Runtime only: reloading always returns to the dashboard.
export const useScreensaverStore = create<{
  active: boolean;
  start: () => void;
  stop: () => void;
}>((set) => ({
  active: false,
  start: () => set({ active: true }),
  stop: () => set({ active: false }),
}));
