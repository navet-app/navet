import { renderWithProviders } from '@navet/app/test/render';
import type { NavetCounterState, NavetTimerState } from '@navet/core/household-device-state';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CounterControls } from './counter-card';
import { TimerControls } from './timer-card';

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock('@navet/app/commands', () => ({ dispatchEntityCommand: dispatch }));
const timer: NavetTimerState = {
  phase: 'active',
  durationSeconds: 120,
  remainingSeconds: 90,
  finishesAt: '2026-10-11T12:01:30.000Z',
  canStart: true,
  canPause: true,
  canCancel: true,
  canFinish: true,
};
const counter: NavetCounterState = {
  value: 4,
  min: 3,
  max: 10,
  step: 2,
  initial: 4,
  canIncrement: true,
  canDecrement: true,
  canReset: true,
  canSetValue: true,
};
beforeEach(() => {
  dispatch.mockReset();
  dispatch.mockResolvedValue({ accepted: true, requiresEventConfirmation: true });
});
afterEach(() => vi.useRealTimers());
describe('timer and counter household controls', () => {
  it('confirms reset at the backend-clamped initial value and disables an unchanged reset', async () => {
    const bounded = { ...counter, value: 12, min: 10, max: 20, initial: 0 };
    const view = renderWithProviders(
      <CounterControls
        id="home_assistant:counter.bounded"
        providerId="home_assistant"
        counter={bounded}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(dispatch).toHaveBeenCalledWith(
      { type: 'counter_reset', entityId: 'home_assistant:counter.bounded' },
      'home_assistant'
    );
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Increase' })).toBeDisabled();
    view.rerender(
      <CounterControls
        id="home_assistant:counter.bounded"
        providerId="home_assistant"
        counter={{ ...bounded, value: 10 }}
      />
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Increase' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();
  });
  it('starts a configured zero-duration timer using its default without waiting for a transient active echo', async () => {
    const zero = {
      ...timer,
      phase: 'idle' as const,
      durationSeconds: 0,
      remainingSeconds: null,
      finishesAt: null,
      canPause: false,
      canCancel: false,
      canFinish: false,
    };
    renderWithProviders(
      <TimerControls id="home_assistant:timer.zero" providerId="home_assistant" timer={zero} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(dispatch).toHaveBeenCalledWith(
      { type: 'timer_start', entityId: 'home_assistant:timer.zero' },
      'home_assistant'
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('blocks an explicit zero override while empty duration starts the native default', async () => {
    renderWithProviders(
      <TimerControls id="home_assistant:timer.tea" providerId="home_assistant" timer={timer} />
    );
    const duration = screen.getByLabelText('Duration (seconds)');
    expect(duration).toHaveAttribute('min', '1');
    fireEvent.change(duration, { target: { value: '0' } });
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    const form = duration.closest('form');
    if (!form) throw new Error('Timer duration must remain inside its form');
    fireEvent.submit(form);
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.change(duration, { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(dispatch).toHaveBeenCalledWith(
      { type: 'timer_start', entityId: 'home_assistant:timer.tea' },
      'home_assistant'
    );
    await act(async () => {});
  });
  it('counts down from the backend finish instant and freezes the paused remaining value', () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-10-11T12:00:00.000Z');
    const view = renderWithProviders(
      <TimerControls id="home_assistant:timer.tea" providerId="home_assistant" timer={timer} />
    );
    expect(screen.getByText('00:01:30')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('00:01:25')).toBeInTheDocument();
    view.rerender(
      <TimerControls
        id="home_assistant:timer.tea"
        providerId="home_assistant"
        timer={{
          ...timer,
          phase: 'paused',
          finishesAt: null,
          remainingSeconds: 85,
          canPause: false,
        }}
      />
    );
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('00:01:25')).toBeInTheDocument();
  });
  it('resumes a paused timer without replacing its duration and permits finish while paused', async () => {
    const paused = { ...timer, phase: 'paused' as const, finishesAt: null, canPause: false };
    const view = renderWithProviders(
      <TimerControls id="home_assistant:timer.tea" providerId="home_assistant" timer={paused} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(dispatch).toHaveBeenCalledWith(
      { type: 'timer_start', entityId: 'home_assistant:timer.tea' },
      'home_assistant'
    );
    expect(screen.getByRole('button', { name: 'Finish timer' })).toBeDisabled();
    view.rerender(
      <TimerControls id="home_assistant:timer.tea" providerId="home_assistant" timer={timer} />
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Finish timer' })).toBeEnabled());
    view.rerender(
      <TimerControls id="home_assistant:timer.tea" providerId="home_assistant" timer={paused} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Finish timer' }));
    expect(dispatch).toHaveBeenLastCalledWith(
      { type: 'timer_finish', entityId: 'home_assistant:timer.tea' },
      'home_assistant'
    );
  });
  it('waits for a fresh finish instant when restarting an already active timer', async () => {
    const view = renderWithProviders(
      <TimerControls id="home_assistant:timer.tea" providerId="home_assistant" timer={timer} />
    );
    fireEvent.change(screen.getByLabelText('Duration (seconds)'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    expect(dispatch).toHaveBeenCalledWith(
      { type: 'timer_start', entityId: 'home_assistant:timer.tea', durationSeconds: 60 },
      'home_assistant'
    );
    view.rerender(
      <TimerControls
        id="home_assistant:timer.tea"
        providerId="home_assistant"
        timer={{ ...timer, finishesAt: '2026-10-11T12:02:00.000Z' }}
      />
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled());
  });
  it('accepts zero-anchored step values even when the minimum is not a step multiple', async () => {
    renderWithProviders(
      <CounterControls
        id="home_assistant:counter.visits"
        providerId="home_assistant"
        counter={counter}
      />
    );
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '6' } });
    expect((screen.getByLabelText('Value') as HTMLInputElement).checkValidity()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Set value' }));
    expect(dispatch).toHaveBeenCalledWith(
      { type: 'set_counter_value', entityId: 'home_assistant:counter.visits', value: 6 },
      'home_assistant'
    );
  });
  it('blocks out-of-step values, clears changed step validity and respects counter bounds/reset no-ops', () => {
    const view = renderWithProviders(
      <CounterControls
        id="home_assistant:counter.visits"
        providerId="home_assistant"
        counter={counter}
      />
    );
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '5' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Use a multiple of 2.');
    expect(screen.getByRole('button', { name: 'Set value' })).toBeDisabled();
    view.rerender(
      <CounterControls
        id="home_assistant:counter.visits"
        providerId="home_assistant"
        counter={{ ...counter, value: 10, step: 1, canIncrement: false }}
      />
    );
    expect(screen.getByRole('button', { name: 'Increase' })).toBeDisabled();
    expect((screen.getByLabelText('Value') as HTMLInputElement).checkValidity()).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('preserves a failed counter draft through a remote update and retries the intended value', async () => {
    dispatch.mockRejectedValueOnce(new Error('offline'));
    const view = renderWithProviders(
      <CounterControls
        id="home_assistant:counter.visits"
        providerId="home_assistant"
        counter={counter}
      />
    );
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set value' }));
    await screen.findByRole('alert');
    view.rerender(
      <CounterControls
        id="home_assistant:counter.visits"
        providerId="home_assistant"
        counter={{ ...counter, value: 6 }}
      />
    );
    expect(screen.getByLabelText('Value')).toHaveValue(8);
    fireEvent.click(screen.getByRole('button', { name: 'Set value' }));
    expect(dispatch).toHaveBeenLastCalledWith(
      { type: 'set_counter_value', entityId: 'home_assistant:counter.visits', value: 8 },
      'home_assistant'
    );
  });
  it('resets counter drafts on an owner change and ignores the old operation failure', async () => {
    let reject!: (error: Error) => void;
    dispatch.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        })
    );
    const view = renderWithProviders(
      <CounterControls
        id="home_assistant:counter.a"
        providerId="home_assistant"
        counter={counter}
      />
    );
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set value' }));
    view.rerender(
      <CounterControls
        id="home_assistant:counter.b"
        providerId="home_assistant"
        counter={{ ...counter, value: 6 }}
      />
    );
    await act(async () => reject(new Error('old source')));
    expect(screen.getByLabelText('Value')).toHaveValue(6);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Increase' }));
    expect(dispatch).toHaveBeenLastCalledWith(
      { type: 'counter_increment', entityId: 'home_assistant:counter.b' },
      'home_assistant'
    );
  });
  it('disables timer and counter actions while their source is unavailable', () => {
    renderWithProviders(
      <>
        <TimerControls
          id="home_assistant:timer.tea"
          providerId="home_assistant"
          timer={timer}
          unavailable
        />
        <CounterControls
          id="home_assistant:counter.visits"
          providerId="home_assistant"
          counter={counter}
          unavailable
        />
      </>
    );
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
