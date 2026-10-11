import { integrationStore } from '@navet/app/stores/integration-store';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDeviceCommand } from '../use-device-command';

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock('@navet/app/commands', () => ({ dispatchEntityCommand: dispatch }));
beforeEach(() => {
  dispatch.mockReset().mockResolvedValue({ accepted: true, requiresEventConfirmation: true });
});
afterEach(() => vi.useRealTimers());

it.each(['session', 'connection'] as const)(
  'invalidates a same-provider %s replacement and ignores its old rejection during retry',
  async (change) => {
    let rejectOld!: (error: Error) => void;
    dispatch.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectOld = reject;
        })
    );
    const previousSessions = integrationStore.getState().providerSessions;
    const previousRuntime = integrationStore.getState().providerRuntime;
    const { result, unmount } = renderHook(() =>
      useDeviceCommand({ entityId: 'homey:valve.water', providerId: 'homey', stateKey: 'closed' })
    );
    act(() => {
      void result.current.execute({ type: 'open', entityId: 'homey:valve.water' }, () => false);
    });
    expect(result.current.pending).toBe(true);
    act(() => {
      if (change === 'session')
        integrationStore
          .getState()
          .setProviderSessions({ homey: { providerId: 'homey', connected: true } });
      else
        integrationStore.setState({
          providerRuntime: {
            ...previousRuntime,
            homey: { ...previousRuntime.homey, connected: !previousRuntime.homey.connected },
          },
        });
    });
    expect(result.current.pending).toBe(false);
    await act(async () => {
      void result.current.execute({ type: 'open', entityId: 'homey:valve.water' }, () => false);
    });
    await act(async () => {
      rejectOld(new Error('old session'));
    });
    expect(result.current.pending).toBe(true);
    expect(result.current.error).toBe(false);
    unmount();
    integrationStore.setState({
      providerSessions: previousSessions,
      providerRuntime: previousRuntime,
    });
  }
);

it('gives an interrupting Stop its own timeout while ignoring the superseded write', async () => {
  vi.useFakeTimers();
  dispatch.mockImplementation(() => new Promise(() => {}));
  const { result } = renderHook(() =>
    useDeviceCommand({ entityId: 'homey:valve.water', providerId: 'homey', stateKey: 'opening' })
  );
  act(() => {
    void result.current.execute(
      { type: 'open', entityId: 'homey:valve.water' },
      (state) => state === 'open'
    );
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5_000);
  });
  act(() => {
    void result.current.execute(
      { type: 'stop', entityId: 'homey:valve.water' },
      (state) => state === 'closed',
      true
    );
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5_000);
  });
  expect(result.current.pending).toBe(true);
  expect(result.current.pendingCommand).toBe('stop');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5_000);
  });
  expect(result.current.pending).toBe(false);
  expect(result.current.error).toBe(true);
});

it('locks duplicate writes until the live echo and routes to the owning provider', async () => {
  const { result, rerender } = renderHook(
    ({ stateKey }) =>
      useDeviceCommand({ entityId: 'homey:valve.water', providerId: 'homey', stateKey }),
    { initialProps: { stateKey: 'closed' } }
  );
  await act(async () => {
    void result.current.execute(
      { type: 'open', entityId: 'homey:valve.water' },
      (state) => state === 'open'
    );
    void result.current.execute({ type: 'open', entityId: 'homey:valve.water' });
  });
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(dispatch).toHaveBeenCalledWith({ type: 'open', entityId: 'homey:valve.water' }, 'homey');
  expect(result.current.pending).toBe(true);
  rerender({ stateKey: 'open' });
  expect(result.current.pending).toBe(false);
});

it('unlocks a stalled write for retry and ignores the original late failure', async () => {
  vi.useFakeTimers();
  let reject!: (error: Error) => void;
  dispatch.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      })
  );
  const { result } = renderHook(() =>
    useDeviceCommand({ entityId: 'homey:valve.water', providerId: 'homey', stateKey: 'closed' })
  );
  act(() => {
    void result.current.execute(
      { type: 'open', entityId: 'homey:valve.water' },
      (state) => state === 'open'
    );
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(result.current.pending).toBe(false);
  expect(result.current.error).toBe(true);
  await act(async () => {
    void result.current.execute(
      { type: 'open', entityId: 'homey:valve.water' },
      (state) => state === 'open'
    );
  });
  await act(async () => {
    reject(new Error('Old request failed'));
  });
  expect(dispatch).toHaveBeenCalledTimes(2);
  expect(result.current.pending).toBe(true);
  expect(result.current.error).toBe(false);
});

it('clears a previous owner and ignores its late result', async () => {
  let reject!: (error: Error) => void;
  dispatch.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      })
  );
  const { result, rerender } = renderHook(
    ({ entityId }) => useDeviceCommand({ entityId, providerId: 'homey', stateKey: 'closed' }),
    { initialProps: { entityId: 'homey:valve.a' } }
  );
  act(() => {
    void result.current.execute(
      { type: 'open', entityId: 'homey:valve.a' },
      (state) => state === 'open'
    );
  });
  rerender({ entityId: 'homey:valve.b' });
  await act(async () => {
    reject(new Error('A failed'));
  });
  expect(result.current.pending).toBe(false);
  expect(result.current.error).toBe(false);
  await act(async () => {
    void result.current.execute({ type: 'open', entityId: 'homey:valve.b' });
  });
  expect(dispatch).toHaveBeenLastCalledWith({ type: 'open', entityId: 'homey:valve.b' }, 'homey');
});
