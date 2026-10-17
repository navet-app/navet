import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useChoreWorkspaceStore } from './chore-workspace-store';
import { useChoreWorkspaceSync } from './use-chore-workspace-sync';

const originalLoad = useChoreWorkspaceStore.getState().load;
const originalSubscribe = useChoreWorkspaceStore.getState().subscribeWorkspace;

afterEach(() => {
  useChoreWorkspaceStore.setState({ load: originalLoad, subscribeWorkspace: originalSubscribe });
  vi.useRealTimers();
});

describe('chore workspace sync', () => {
  it('requests a full workspace after local midnight so new occurrences can materialize', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 14, 23, 59, 45));
    const load = vi.fn(async () => {});
    useChoreWorkspaceStore.setState({ load, subscribeWorkspace: () => () => {} });

    const { unmount } = renderHook(() => useChoreWorkspaceSync());
    expect(load).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledWith();

    act(() => vi.advanceTimersByTime(30_000));
    expect(load).toHaveBeenNthCalledWith(2, { force: true });

    act(() => vi.advanceTimersByTime(30_000));
    expect(load).toHaveBeenNthCalledWith(3, undefined);
    unmount();
  });

  it('starts workspace synchronization only while enabled and disposes it on disable', () => {
    const load = vi.fn(async () => {});
    const dispose = vi.fn();
    const subscribeWorkspace = vi.fn(() => dispose);
    useChoreWorkspaceStore.setState({ load, subscribeWorkspace });
    const { rerender, unmount } = renderHook(({ enabled }) => useChoreWorkspaceSync(enabled), {
      initialProps: { enabled: false },
    });
    expect(load).not.toHaveBeenCalled();
    expect(subscribeWorkspace).not.toHaveBeenCalled();
    rerender({ enabled: true });
    expect(load).toHaveBeenCalledOnce();
    expect(subscribeWorkspace).toHaveBeenCalledOnce();
    rerender({ enabled: false });
    expect(dispose).toHaveBeenCalledOnce();
    unmount();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
