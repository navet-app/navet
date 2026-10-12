import { dispatchEntityCommand } from '@navet/app/commands';
import { useServiceActionHandler } from '@navet/app/hooks';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import { useCallback } from 'react';

interface UseSwitchToggleActionParams {
  id: string;
  providerId?: IntegrationProviderId;
  isOn: boolean;
  setIsOn: (next: boolean) => void;
  resetTimerRef: React.MutableRefObject<number | null>;
  resolvedServiceAction: string;
  updateSwitchFailedMessage: string;
}

function isStorybookRuntime() {
  if (typeof document === 'undefined') {
    return false;
  }

  return document.documentElement.dataset.navetStorybook === 'true';
}

export function useSwitchToggleAction({
  id,
  providerId,
  isOn,
  setIsOn,
  resetTimerRef,
  resolvedServiceAction,
  updateSwitchFailedMessage,
}: UseSwitchToggleActionParams) {
  const runAction = useServiceActionHandler();

  return useCallback(() => {
    if (isStorybookRuntime()) {
      if (resolvedServiceAction === 'turn_on') {
        setIsOn(true);
        resetTimerRef.current = window.setTimeout(() => setIsOn(false), 700);
        return;
      }

      if (resolvedServiceAction === 'press') {
        setIsOn(true);
        resetTimerRef.current = window.setTimeout(() => setIsOn(false), 500);
        return;
      }

      setIsOn(!isOn);
      return;
    }

    if (resolvedServiceAction === 'turn_on') {
      setIsOn(true);
      void runAction(
        async () => {
          await dispatchEntityCommand(
            {
              type: 'turn_on',
              entityId: id,
            },
            providerId
          );
          resetTimerRef.current = window.setTimeout(() => setIsOn(false), 700);
        },
        updateSwitchFailedMessage,
        {
          onError: () => setIsOn(false),
        }
      );
      return;
    }

    if (resolvedServiceAction === 'press') {
      setIsOn(true);
      void runAction(
        async () => {
          await dispatchEntityCommand({ type: 'press', entityId: id }, providerId);
          resetTimerRef.current = window.setTimeout(() => setIsOn(false), 500);
        },
        updateSwitchFailedMessage,
        {
          onError: () => setIsOn(false),
        }
      );
      return;
    }

    const nextIsOn = !isOn;
    setIsOn(nextIsOn);
    void runAction(
      async () => {
        await dispatchEntityCommand(
          {
            type: nextIsOn ? 'turn_on' : 'turn_off',
            entityId: id,
          },
          providerId
        );
      },
      updateSwitchFailedMessage,
      {
        onError: () => setIsOn(!nextIsOn),
      }
    );
  }, [
    id,
    providerId,
    isOn,
    runAction,
    resolvedServiceAction,
    resetTimerRef,
    setIsOn,
    updateSwitchFailedMessage,
  ]);
}
