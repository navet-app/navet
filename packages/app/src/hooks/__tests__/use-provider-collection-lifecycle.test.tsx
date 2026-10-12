import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useHydratingProviderCollection,
  useProviderCollectionData,
} from '../use-provider-collection-lifecycle';

let refresh: () => Promise<void>;
const unsubscribe = vi.fn();
vi.mock('@navet/app/utils/visibility-aware-scheduler', () => ({
  subscribeVisibilityAwareAsyncTask: (task: () => Promise<void>) => {
    refresh = task;
    return unsubscribe;
  },
}));
const empty: string[] = [];

describe('provider collection lifecycle', () => {
  beforeEach(() => unsubscribe.mockClear());

  it('does not commit a second empty state when mounted disabled', () => {
    let renderCount = 0;
    const load = vi.fn<() => Promise<string[]>>();
    const { result } = renderHook(() => {
      renderCount += 1;
      return useProviderCollectionData({
        providerId: 'home_assistant',
        enabled: false,
        interval: 1000,
        empty,
        load,
      });
    });

    expect(result.current).toBe(empty);
    expect(renderCount).toBe(1);
    expect(load).not.toHaveBeenCalled();
  });

  it('clears previously loaded data when disabled', async () => {
    const load = vi.fn<() => Promise<string[]>>().mockResolvedValue(['forecast']);
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useProviderCollectionData({
          providerId: 'home_assistant',
          enabled,
          interval: 1000,
          empty,
          load,
        }),
      { initialProps: { enabled: true } }
    );

    await act(async () => refresh());
    expect(result.current).toEqual(['forecast']);

    rerender({ enabled: false });
    expect(result.current).toBe(empty);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('retains successful data on failure and ignores a superseded provider request', async () => {
    const load = vi.fn<() => Promise<string[]>>().mockResolvedValue(['forecast']);
    let providerId: 'home_assistant' | 'homey' = 'home_assistant';
    const { result, rerender } = renderHook(() =>
      useProviderCollectionData({
        providerId,
        enabled: true,
        interval: 1000,
        empty,
        load,
      })
    );
    await act(async () => refresh());
    expect(result.current).toEqual(['forecast']);
    load.mockRejectedValueOnce(new Error('offline'));
    await act(async () => refresh());
    expect(result.current).toEqual(['forecast']);

    let resolve: (value: string[]) => void = () => {};
    load.mockReturnValueOnce(
      new Promise<string[]>((done) => {
        resolve = done;
      })
    );
    const pending = refresh();
    providerId = 'homey';
    rerender();
    expect(result.current).toEqual([]);
    await act(async () => {
      resolve(['old provider']);
      await pending;
    });
    expect(result.current).toEqual([]);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('can retain paused data without exposing it to a different provider', async () => {
    const load = vi.fn<() => Promise<string[]>>().mockResolvedValue(['forecast']);
    const { result, rerender } = renderHook(
      ({ enabled, providerId }: { enabled: boolean; providerId: 'home_assistant' | 'homey' }) =>
        useProviderCollectionData({
          providerId,
          enabled,
          interval: 1000,
          empty,
          load,
          retainWhenDisabled: true,
        }),
      { initialProps: { enabled: true, providerId: 'home_assistant' } }
    );
    await act(async () => refresh());
    rerender({ enabled: false, providerId: 'home_assistant' });
    expect(result.current).toBe(empty);
    rerender({ enabled: true, providerId: 'home_assistant' });
    expect(result.current).toEqual(['forecast']);
    rerender({ enabled: true, providerId: 'homey' });
    expect(result.current).toBe(empty);
    load.mockRejectedValueOnce(new Error('offline'));
    await act(async () => refresh());
    expect(result.current).toBe(empty);
  });

  it('retains reconnecting collections only for their own provider', () => {
    let providerId: 'home_assistant' | 'homey' = 'home_assistant';
    let devices = ['weather'];
    const { result, rerender } = renderHook(() =>
      useHydratingProviderCollection(providerId, devices, true, false, empty)
    );
    devices = empty;
    rerender();
    expect(result.current).toEqual(['weather']);
    providerId = 'homey';
    rerender();
    expect(result.current).toEqual([]);
  });
});
