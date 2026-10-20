import { useSettingsStore } from '@navet/app/stores/settings-store';
import { setMediaQueryMatch } from '@navet/app/test/browser-mocks';
import { resetAppStores } from '@navet/app/test/store-reset';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDashboardChromeLayout } from '../use-dashboard-sidebar-width';

const spaciousLandscape =
  '(min-width: 1100px) and (min-height: 600px) and (orientation: landscape)';

// Keep: shared eligibility governs the shell, card grid and fixed editing controls.
describe('dashboard chrome layout', () => {
  beforeEach(async () => {
    await resetAppStores();
    setMediaQueryMatch('(min-width: 768px)', false);
    setMediaQueryMatch(spaciousLandscape, false);
  });

  it('adds the companion only with sufficient landscape space', () => {
    setMediaQueryMatch('(min-width: 768px)', true);
    setMediaQueryMatch(spaciousLandscape, true);
    const { result } = renderHook(useDashboardChromeLayout);
    expect(result.current).toMatchObject({
      sidebarWidth: 340,
      expanded: true,
      companionAvailable: true,
    });
    act(() => useSettingsStore.getState().updateSettings({ companionCollapsed: true }));
    expect(result.current).toMatchObject({
      sidebarWidth: 64,
      expanded: false,
      companionAvailable: true,
    });
  });

  it('falls back to the original rail when rotated or resized and preserves collapse preference', () => {
    setMediaQueryMatch('(min-width: 768px)', true);
    setMediaQueryMatch(spaciousLandscape, true);
    const { result } = renderHook(useDashboardChromeLayout);
    act(() => setMediaQueryMatch(spaciousLandscape, false));
    expect(result.current).toMatchObject({
      sidebarWidth: 64,
      expanded: false,
      companionAvailable: false,
    });
    expect(useSettingsStore.getState().companionCollapsed).toBe(false);
    act(() => setMediaQueryMatch(spaciousLandscape, true));
    expect(result.current.sidebarWidth).toBe(340);
  });

  it('leaves phone chrome untouched regardless of the collapse setting', () => {
    const { result } = renderHook(useDashboardChromeLayout);
    expect(result.current).toMatchObject({
      sidebarWidth: 0,
      companionAvailable: false,
      expanded: false,
    });
    act(() => useSettingsStore.getState().updateSettings({ companionCollapsed: true }));
    expect(result.current.sidebarWidth).toBe(0);
  });

  it('keeps kiosk chrome hidden even on spacious landscape screens', () => {
    setMediaQueryMatch('(min-width: 768px)', true);
    setMediaQueryMatch(spaciousLandscape, true);
    useSettingsStore.getState().updateSettings({ kioskMode: true });
    const { result } = renderHook(useDashboardChromeLayout);
    expect(result.current).toMatchObject({
      sidebarWidth: 0,
      expanded: false,
      companionAvailable: false,
    });
  });
});
