import { useMediaQuery } from '@navet/app/hooks/use-media-query';
import { useNavigationStore } from '@navet/app/stores/navigation-store';
import { useSettingsStore } from '@navet/app/stores/settings-store';

export const NAVIGATION_RAIL_WIDTH = 64;
export const COMPANION_PANEL_WIDTH = 276;

/** Share eligibility and inset between the shell, dashboard grids and fixed edit controls. */
export function useDashboardChromeLayout() {
  const desktop = useMediaQuery('(min-width: 768px)');
  const spaciousLandscape = useMediaQuery(
    '(min-width: 1100px) and (min-height: 600px) and (orientation: landscape)'
  );
  const enabled = useSettingsStore((state) => state.companionEnabled);
  const collapsed = useSettingsStore((state) => state.companionCollapsed);
  const kiosk = useSettingsStore((state) => state.kioskMode);
  const customAction = useNavigationStore((state) => state.activeCustomSidebarActionId);
  const visible = desktop && (!kiosk || customAction !== null);
  const companionAvailable = enabled && spaciousLandscape && !kiosk;
  const expanded = visible && companionAvailable && !collapsed;
  return {
    companionAvailable,
    expanded,
    sidebarWidth: visible ? NAVIGATION_RAIL_WIDTH + (expanded ? COMPANION_PANEL_WIDTH : 0) : 0,
  };
}

export function useDashboardSidebarWidth() {
  return useDashboardChromeLayout().sidebarWidth;
}
