import { integrationStore } from '@navet/app/stores/integration-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CounterControls } from './counter-card';
import { TimerControls } from './timer-card';
import { ValveControlPanel } from './valve-card';

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock('@navet/app/commands', () => ({ dispatchEntityCommand: dispatch }));

function control(kind: string, value: number) {
  const props = { id: `home_assistant:${kind}.kitchen`, providerId: 'home_assistant' as const };
  if (kind === 'timer')
    return (
      <TimerControls
        {...props}
        timer={{
          phase: 'idle',
          durationSeconds: value,
          remainingSeconds: null,
          finishesAt: null,
          canStart: true,
          canPause: false,
          canCancel: false,
          canFinish: false,
        }}
      />
    );
  if (kind === 'counter')
    return (
      <CounterControls
        {...props}
        counter={{
          value,
          min: 0,
          max: 1000,
          step: 1,
          initial: 0,
          canIncrement: true,
          canDecrement: true,
          canReset: true,
          canSetValue: true,
        }}
      />
    );
  return (
    <ValveControlPanel
      {...props}
      name="Kitchen"
      capabilities={['position']}
      state={{
        phase: 'open',
        position: value,
        canOpen: true,
        canClose: true,
        canStop: true,
        canSetPosition: true,
      }}
    />
  );
}

beforeEach(async () => {
  await resetAppStores();
  dispatch.mockReset().mockResolvedValue({ accepted: true, requiresEventConfirmation: true });
});

describe('household control provider session drafts', () => {
  it.each(['timer', 'counter', 'valve'])(
    'resets dirty %s drafts when its owning session changes',
    (kind) => {
      const view = renderWithProviders(control(kind, 20));
      fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '25' } });
      act(() =>
        integrationStore.getState().setProviderSessions({
          home_assistant: { providerId: 'home_assistant', connected: true },
        })
      );
      view.rerender(control(kind, 30));
      expect(screen.getByRole('spinbutton')).toHaveValue(30);
      expect(dispatch).not.toHaveBeenCalled();
    }
  );
  it.each(['timer', 'counter', 'valve'])(
    'resets pending %s drafts on disconnect and ignores an old rejection',
    async (kind) => {
      let rejectOld = () => {};
      dispatch.mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectOld = () => reject(new Error('Previous session'));
          })
      );
      const view = renderWithProviders(control(kind, 20));
      fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '25' } });
      const form = screen.getByRole('spinbutton').closest('form');
      if (!form) throw new Error('Control form missing');
      fireEvent.submit(form);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('spinbutton')).toBeDisabled();
      act(() => {
        const runtime = integrationStore.getState().providerRuntime;
        integrationStore.setState({
          providerRuntime: {
            ...runtime,
            home_assistant: {
              ...runtime.home_assistant,
              connected: !runtime.home_assistant.connected,
            },
          },
        });
      });
      view.rerender(control(kind, 30));
      expect(screen.getByRole('spinbutton')).toHaveValue(30);
      expect(screen.getByRole('spinbutton')).toBeEnabled();
      await act(async () => rejectOld());
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('spinbutton')).toHaveValue(30);
    }
  );
});
