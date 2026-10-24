import { useEditModeStore } from '@navet/app/stores/edit-mode-store';
import { useNavigationStore } from '@navet/app/stores/navigation-store';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { resetAppStores } from '@navet/app/test/store-reset';
import { act, cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScreensaverStore } from './screensaver-store';
import { SCREENSAVER_IDLE_MS, useScreensaver } from './use-screensaver';

const advance = (ms = SCREENSAVER_IDLE_MS) => act(() => vi.advanceTimersByTime(ms));
const visibility = (value: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
  fireEvent(document, new Event('visibilitychange'));
};

describe('screensaver lifecycle', () => {
  beforeEach(async () => {
    await resetAppStores();
    useScreensaverStore.getState().stop();
    visibility('visible');
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    document.querySelector('[data-test-dialog]')?.remove();
    useScreensaverStore.getState().stop();
    vi.useRealTimers();
    visibility('visible');
  });

  it('is off by default and arms only when enabled on this device', () => {
    const { result } = renderHook(() => useScreensaver());
    advance();
    expect(result.current).toBe(false);
    act(() => useSettingsStore.getState().updateSettings({ screensaverEnabled: true }));
    advance(SCREENSAVER_IDLE_MS - 1);
    expect(result.current).toBe(false);
    advance(1);
    expect(result.current).toBe(true);
    act(() => useSettingsStore.getState().updateSettings({ screensaverEnabled: false }));
    expect(result.current).toBe(false);
    expect(useScreensaverStore.getState().active).toBe(false);
  });

  it('uses the chosen delay and restarts the idle interval when it changes', () => {
    useSettingsStore
      .getState()
      .updateSettings({ screensaverEnabled: true, screensaverIdleMinutes: 1 });
    const { result } = renderHook(() => useScreensaver());
    advance(59_999);
    expect(result.current).toBe(false);
    advance(1);
    expect(result.current).toBe(true);
    act(() => useScreensaverStore.getState().stop());
    act(() => useSettingsStore.getState().updateSettings({ screensaverIdleMinutes: 10 }));
    advance(60_000);
    expect(result.current).toBe(false);
    advance(540_000);
    expect(result.current).toBe(true);
  });

  it.each(['pointermove', 'keydown', 'wheel', 'scroll', 'focusin'])(
    'restarts the full idle delay after %s activity',
    (event) => {
      useSettingsStore.getState().updateSettings({ screensaverEnabled: true });
      const { result } = renderHook(() => useScreensaver());
      advance(SCREENSAVER_IDLE_MS - 1);
      fireEvent(window, new Event(event));
      advance(SCREENSAVER_IDLE_MS - 1);
      expect(result.current).toBe(false);
      advance(1);
      expect(result.current).toBe(true);
    }
  );

  it('does not interrupt a held pointer or dismiss on pointerdown', () => {
    useSettingsStore.getState().updateSettings({ screensaverEnabled: true });
    const { result } = renderHook(() => useScreensaver());
    fireEvent.pointerDown(window);
    advance();
    expect(result.current).toBe(false);
    fireEvent.pointerUp(window);
    advance();
    expect(result.current).toBe(true);
    fireEvent.pointerDown(window);
    expect(result.current).toBe(true);
  });

  it('inhibits entry during editing and custom iframe navigation', () => {
    useSettingsStore.getState().updateSettings({ screensaverEnabled: true });
    useEditModeStore.getState().setEditMode(true);
    const { result } = renderHook(() => useScreensaver());
    advance();
    expect(result.current).toBe(false);
    act(() => {
      useEditModeStore.getState().setEditMode(false);
      useNavigationStore.setState({ activeCustomSidebarActionId: 'custom-frame' });
    });
    advance();
    expect(result.current).toBe(false);
    act(() => useNavigationStore.setState({ activeCustomSidebarActionId: null }));
    advance();
    expect(result.current).toBe(true);
  });

  it('waits while a dialog or focused form is open', () => {
    useSettingsStore.getState().updateSettings({ screensaverEnabled: true });
    const { result } = renderHook(() => useScreensaver());
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('data-test-dialog', '');
    document.body.append(dialog);
    advance();
    expect(result.current).toBe(false);
    dialog.remove();
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    advance();
    expect(result.current).toBe(false);
    input.remove();
    advance();
    expect(result.current).toBe(true);
  });

  it('closes when hidden and grants a fresh delay on return', () => {
    useSettingsStore.getState().updateSettings({ screensaverEnabled: true });
    const { result } = renderHook(() => useScreensaver());
    advance();
    expect(result.current).toBe(true);
    act(() => visibility('hidden'));
    advance();
    expect(result.current).toBe(false);
    act(() => visibility('visible'));
    advance(SCREENSAVER_IDLE_MS - 1);
    expect(result.current).toBe(false);
    advance(1);
    expect(result.current).toBe(true);
  });

  it('stops runtime state and removes timers on unmount', () => {
    useSettingsStore.getState().updateSettings({ screensaverEnabled: true });
    const { unmount } = renderHook(() => useScreensaver());
    unmount();
    advance();
    expect(useScreensaverStore.getState().active).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
