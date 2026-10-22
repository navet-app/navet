import { createContext, useSyncExternalStore } from 'react';

export const DashboardSidebarWidthContext = createContext(0);

import { settingsSelectors } from '../stores/selectors';
import { useSettingsStore } from '../stores/settings-store';

const MD_BREAKPOINT = 768;
const XL_BREAKPOINT = 1280;
const XXL_BREAKPOINT = 1700;
const FOUR_XL_BREAKPOINT = 2500;

type BaseBreakpointCols = 2 | 4 | 6 | 8 | 12;

const breakpointListeners = new Set<() => void>();
let baseBreakpointColsSnapshot = 0;
let viewportFrameId: number | null = null;
let subscribedVisualViewport: VisualViewport | null = null;

function resolveBaseBreakpointCols(logicalViewportWidth: number): BaseBreakpointCols {
  if (logicalViewportWidth >= FOUR_XL_BREAKPOINT) return 12;
  if (logicalViewportWidth >= XXL_BREAKPOINT) return 8;
  if (logicalViewportWidth >= XL_BREAKPOINT) return 6;
  if (logicalViewportWidth >= MD_BREAKPOINT) return 4;
  return 2;
}

function readBaseBreakpointCols(): number {
  if (typeof window === 'undefined') {
    return 2;
  }

  return Math.max(window.innerWidth, window.visualViewport?.width ?? 0);
}

function syncBaseBreakpointCols() {
  const nextSnapshot = readBaseBreakpointCols();
  if (nextSnapshot === baseBreakpointColsSnapshot) {
    return;
  }

  baseBreakpointColsSnapshot = nextSnapshot;
  breakpointListeners.forEach((listener) => {
    listener();
  });
}

function handleViewportResize() {
  if (viewportFrameId !== null) {
    return;
  }

  viewportFrameId = window.requestAnimationFrame(() => {
    viewportFrameId = null;
    syncBaseBreakpointCols();
  });
}

function subscribeToBreakpointCols(listener: () => void) {
  breakpointListeners.add(listener);

  if (breakpointListeners.size === 1) {
    baseBreakpointColsSnapshot = readBaseBreakpointCols();
    subscribedVisualViewport = window.visualViewport;
    window.addEventListener('resize', handleViewportResize);
    subscribedVisualViewport?.addEventListener('resize', handleViewportResize);
  }

  return () => {
    breakpointListeners.delete(listener);
    if (breakpointListeners.size > 0) {
      return;
    }

    window.removeEventListener('resize', handleViewportResize);
    subscribedVisualViewport?.removeEventListener('resize', handleViewportResize);
    subscribedVisualViewport = null;
    if (viewportFrameId !== null) {
      window.cancelAnimationFrame(viewportFrameId);
      viewportFrameId = null;
    }
  };
}

function getBaseBreakpointColsSnapshot() {
  if (breakpointListeners.size === 0) {
    baseBreakpointColsSnapshot = readBaseBreakpointCols();
  }
  return baseBreakpointColsSnapshot;
}

function getServerBreakpointColsSnapshot(): number {
  return 0;
}

/**
 * Returns the zone grid column count for the current viewport, matching the
 * same breakpoints used by room views across the dashboard.
 *
 * | Breakpoint | Width    | Default | More space |
 * |----------- |----------|---------|------------|
 * | base       | < 768px  | 2       | 2          |
 * | md         | 768px+   | 4       | 6          |
 * | xl         | 1280px+  | 6       | 8          |
 * | 2xl        | 1700px+  | 8       | 10         |
 * | 4xl        | 2500px+  | 12      | 14         |
 *
 * More-space mode increases dashboard density by two logical columns at each
 * non-mobile breakpoint.
 */
export function useBreakpointCols(): number {
  const viewportWidth = useSyncExternalStore(
    subscribeToBreakpointCols,
    getBaseBreakpointColsSnapshot,
    getServerBreakpointColsSnapshot
  );
  // Grid fitting already scales both axes to the available content width. Reapplying
  // viewport breakpoints after subtracting the companion drops columns too early,
  // leaving fewer 1fr tracks to stretch across the dashboard.
  const baseBreakpointCols = resolveBaseBreakpointCols(viewportWidth);
  const dashboardSpaceMode = useSettingsStore(settingsSelectors.dashboardSpaceMode);
  const isMoreSpace = dashboardSpaceMode === 'more_space';

  return isMoreSpace && baseBreakpointCols > 2 ? baseBreakpointCols + 2 : baseBreakpointCols;
}
