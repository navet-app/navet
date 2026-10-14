import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProviderMapMarkers } from '../use-provider-map-markers';

const { state, subscribe, cleanup, listeners, mapEntities, snapshots } = vi.hoisted(() => ({
  state: { selectedProviderIds: ['home_assistant', 'homey'], currentProviderId: 'homey' },
  listeners: new Set<() => void>(),
  subscribe: vi.fn(),
  cleanup: vi.fn(),
  snapshots: { current: { name: 'Alex', latitude: 55 } },
  mapEntities: vi.fn((snapshot: { name: string; latitude: number }) => [
    {
      id: 'person.alex',
      name: snapshot.name,
      latitude: snapshot.latitude,
      longitude: 13,
      state: 'home',
    },
  ]),
}));
vi.mock('@navet/app/hooks', () => ({
  useIntegrationStore: (selector: (value: typeof state) => unknown) => selector(state),
}));
vi.mock('@navet/app/provider-runtime-registry', () => ({
  getProviderRuntimeRegistration: (provider: string) => ({
    mapFeatureService:
      provider === 'home_assistant' ? { entityPrefixes: ['person.'], mapEntities } : undefined,
  }),
}));
vi.mock('@navet/app/provider-runtime-query', () => ({
  getProviderRuntimeQuery: () => ({
    subscribeSnapshots: subscribe,
    selectSnapshotsByPrefixes: () => snapshots.current,
  }),
}));

describe('selected-provider map subscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listeners.clear();
    state.selectedProviderIds = ['home_assistant', 'homey'];
    snapshots.current = { name: 'Alex', latitude: 55 };
    subscribe.mockImplementation((listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        cleanup();
      };
    });
  });
  it('shows the selected owning source even when another provider is current', () => {
    const { result, unmount } = renderHook(() => useProviderMapMarkers());
    expect(result.current[0]).toMatchObject({
      id: 'home_assistant:person.alex',
      providerId: 'home_assistant',
      latitude: 55,
    });
    expect(subscribe).toHaveBeenCalledTimes(1);
    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
  it('updates names and coordinates from realtime snapshots', () => {
    const { result } = renderHook(() => useProviderMapMarkers());
    act(() => {
      snapshots.current = { name: 'Alex renamed', latitude: 56 };
      for (const listener of listeners) listener();
    });
    expect(result.current[0]).toMatchObject({ name: 'Alex renamed', latitude: 56 });
  });
  it('does not subscribe to inactive maps or unsupported sources', () => {
    const { result } = renderHook(() => useProviderMapMarkers(false));
    expect(result.current).toEqual([]);
    expect(subscribe).not.toHaveBeenCalled();
    state.selectedProviderIds = ['homey'];
    const unsupported = renderHook(() => useProviderMapMarkers());
    expect(unsupported.result.current).toEqual([]);
    expect(subscribe).not.toHaveBeenCalled();
  });
});
