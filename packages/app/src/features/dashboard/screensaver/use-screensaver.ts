import { useEditModeStore } from '@navet/app/stores/edit-mode-store';
import { useNavigationStore } from '@navet/app/stores/navigation-store';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { useEffect } from 'react';
import { useScreensaverStore } from './screensaver-store';

export const SCREENSAVER_IDLE_MS = 5 * 60 * 1000;

function hasInteractionInProgress() {
  return Boolean(
    document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], dialog[open]') ||
      document.activeElement?.matches('input, textarea, select, [contenteditable="true"], iframe')
  );
}

export function useScreensaver({ editing = false }: { editing?: boolean } = {}) {
  const enabled = useSettingsStore((state) => state.screensaverEnabled);
  const idleMinutes = useSettingsStore((state) => state.screensaverIdleMinutes);
  const storeEditing = useEditModeStore((state) => state.isEditMode);
  const customAction = useNavigationStore((state) => state.activeCustomSidebarActionId);
  const active = useScreensaverStore((state) => state.active);
  const blocked = editing || storeEditing || customAction !== null;

  useEffect(() => {
    const { start, stop } = useScreensaverStore.getState();
    if (!enabled || blocked) {
      stop();
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pointerHeld = false;
    const clear = () => {
      clearTimeout(timer);
      timer = undefined;
    };
    const schedule = () => {
      clear();
      if (document.visibilityState === 'hidden' || useScreensaverStore.getState().active) return;
      timer = setTimeout(
        () => {
          if (pointerHeld || hasInteractionInProgress()) schedule();
          else start();
        },
        idleMinutes * 60 * 1000
      );
    };
    const activity = (event: Event) => {
      // The modal consumes its own dismissal click. Never remove it on pointerdown:
      // the remaining pointerup/click must not reach a device control underneath.
      if (useScreensaverStore.getState().active) return;
      if (event.type === 'pointerdown') pointerHeld = true;
      if (event.type === 'pointerup' || event.type === 'pointercancel') pointerHeld = false;
      schedule();
    };
    const visibility = () => {
      pointerHeld = false;
      if (document.visibilityState === 'hidden') {
        clear();
        stop();
      } else schedule();
    };
    const events = [
      'pointerdown',
      'pointerup',
      'pointercancel',
      'pointermove',
      'keydown',
      'wheel',
      'scroll',
      'focusin',
    ];
    for (const event of events)
      window.addEventListener(event, activity, { capture: true, passive: true });
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', stop);
    schedule();
    return () => {
      clear();
      for (const event of events) window.removeEventListener(event, activity, true);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', stop);
    };
  }, [enabled, idleMinutes, blocked, active]);

  useEffect(() => () => useScreensaverStore.getState().stop(), []);
  return enabled && !blocked && active;
}
