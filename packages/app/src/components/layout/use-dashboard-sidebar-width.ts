import { useMediaQuery } from '@navet/app/hooks/use-media-query';
import { useNavigationStore } from '@navet/app/stores/navigation-store';
import { useSettingsStore } from '@navet/app/stores/settings-store';

export const NAVIGATION_RAIL_WIDTH = 64;
export const COMPANION_PANEL_WIDTH = 276;

/** The same inset drives dashboard grids and fixed edit controls. */
export function useDashboardSidebarWidth() {
  const desktop = useMediaQuery('(min-width: 768px)');
  const wide = useMediaQuery('(min-width: 1100px)');
  const collapsed = useSettingsStore((state) => state.companionCollapsed);
  const kiosk = useSettingsStore((state) => state.kioskMode);
  const customAction = useNavigationStore((state) => state.activeCustomSidebarActionId);
  if (!desktop || (kiosk && customAction === null)) return 0;
  return NAVIGATION_RAIL_WIDTH + (!kiosk && wide && !collapsed ? COMPANION_PANEL_WIDTH : 0);
}
