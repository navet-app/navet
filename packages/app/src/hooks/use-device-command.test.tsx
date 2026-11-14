import { HA_PENDING_ECHO_WINDOW_MS } from '@navet/app/constants/interaction-timing';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDeviceCommand } from './use-device-command';

const accepted = { accepted: true, requiresEventConfirmation: true };
afterEach(() => vi.useRealTimers());

describe('device command confirmation', () => {
  it('keeps reported and requested values separate until a provider echo confirms the command', async () => {
    const action = vi.fn(async () => accepted);
    const { result, rerender } = renderHook(
      ({ value }) => useDeviceCommand('ha:thermostat', value, true),
      { initialProps: { value: 21 } }
    );
    await act(async () => {
      await result.current.send(24, action);
    });
    expect(result.current).toMatchObject({
      reported: 21,
      requested: 24,
      pending: true,
      failed: false,
    });
    await act(async () => {
      await result.current.send(24, action);
    });
    expect(action).toHaveBeenCalledOnce();
    rerender({ value: 24 });
    expect(result.current).toMatchObject({
      reported: 24,
      requested: undefined,
      pending: false,
      failed: false,
    });
  });

  it('retains a failed draft after a conflicting echo and retries only by explicit request', async () => {
    vi.useFakeTimers();
    const action = vi.fn(async () => accepted);
    const { result, rerender } = renderHook(
      ({ value }) => useDeviceCommand('ha:fan', value, true),
      { initialProps: { value: 25 } }
    );
    await act(async () => {
      await result.current.send(75, action);
    });
    rerender({ value: 50 });
    act(() => vi.advanceTimersByTime(HA_PENDING_ECHO_WINDOW_MS));
    expect(result.current).toMatchObject({
      reported: 50,
      requested: 75,
      pending: false,
      failed: true,
      unconfirmed: true,
    });
    expect(action).toHaveBeenCalledOnce();
    await act(async () => {
      result.current.retry();
    });
    expect(action).toHaveBeenCalledTimes(2);
    rerender({ value: 75 });
    expect(result.current).toMatchObject({ pending: false, failed: false });
  });

  it('isolates owners from late failures and disables retry while unavailable', async () => {
    let reject!: (error: Error) => void;
    const oldAction = () =>
      new Promise<never>((_, no) => {
        reject = no;
      });
    const { result, rerender } = renderHook(
      ({ owner, writable }) => useDeviceCommand<number>(owner, 20, writable),
      { initialProps: { owner: 'ha:first', writable: true } }
    );
    act(() => {
      void result.current.send(25, oldAction);
    });
    rerender({ owner: 'homey:second', writable: true });
    await act(async () => {
      reject(new Error('old failure'));
    });
    expect(result.current).toMatchObject({ pending: false, failed: false, requested: undefined });
    const action = vi.fn(async () => ({ accepted: false, requiresEventConfirmation: false }));
    await act(async () => {
      await result.current.send(22, action);
    });
    expect(result.current.failed).toBe(true);
    rerender({ owner: 'homey:second', writable: false });
    await act(async () => {
      result.current.retry();
    });
    expect(action).toHaveBeenCalledOnce();
  });

  it('does not require an echo when the owning adapter explicitly confirms completion', async () => {
    const { result } = renderHook(() => useDeviceCommand<number>('openhab:setpoint', 20, true));
    await act(async () => {
      await result.current.send(21, async () => ({
        accepted: true,
        requiresEventConfirmation: false,
      }));
    });
    expect(result.current).toMatchObject({ pending: false, failed: false });
  });
});
