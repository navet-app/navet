import { createContext, useContext, useEffect } from 'react';
import { useChoreWorkspaceStore } from './chore-workspace-store';

const VISIBLE_REFRESH_INTERVAL_MS = 30_000;

export const ChoreWorkspaceSyncContext = createContext(true);

export function useChoreWorkspaceSync(enabled = true) {
  const syncAllowed = useContext(ChoreWorkspaceSyncContext);
  const load = useChoreWorkspaceStore((state) => state.load);

  const subscribeWorkspace = useChoreWorkspaceStore((state) => state.subscribeWorkspace);

  useEffect(() => {
    if (!enabled || !syncAllowed) return;
    void load();
    const unsubscribe = subscribeWorkspace();
    let lastRefreshDay = new Date().toDateString();
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      const currentDay = new Date().toDateString();
      const force = currentDay !== lastRefreshDay;
      lastRefreshDay = currentDay;
      void load(force ? { force: true } : undefined);
    };
    const interval = window.setInterval(refresh, VISIBLE_REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      unsubscribe();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [enabled, syncAllowed, load, subscribeWorkspace]);
}
