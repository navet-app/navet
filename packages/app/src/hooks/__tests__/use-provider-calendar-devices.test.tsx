import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProviderCalendarDevices } from '../use-provider-calendar-devices';

let mockEntities: Record<string, { state: string; attributes?: Record<string, unknown> }> | null =
  null;
let mockProviderRuntime = {
  connected: true,
  connecting: false,
  reconnecting: false,
  entitiesHydrated: true,
  registriesHydrated: true,
};

vi.mock('@navet/app/hooks/device-mappers', () => ({
  mapCalendarSources: vi.fn((id: string, _entity: unknown, name: string, room: string) => [
    {
      id,
      name,
      room,
      events: [],
    },
  ]),
}));

vi.mock('@navet/app/i18n', () => ({
  useI18n: () => ({
    locale: 'en',
    t: (key: string) => key,
  }),
}));

vi.mock('@navet/app/services/integration-calendar-feature.service', () => ({
  subscribeCalendarChanges: () => () => undefined,
  integrationCalendarFeatureService: {
    getEvents: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@navet/app/stores/selectors', () => ({
  settingsSelectors: {
    use24HourTime: (state: { use24HourTime: boolean }) => state.use24HourTime,
  },
}));

vi.mock('@navet/app/stores/settings-store', () => ({
  useSettingsStore: (selector: (state: { use24HourTime: boolean }) => unknown) =>
    selector({
      use24HourTime: true,
    }),
}));

vi.mock('../use-integration-store', () => ({
  useProviderId: (providerId?: string) => providerId ?? 'home_assistant',
  useIntegrationStore: (
    selector: (state: {
      currentProviderId: string;
      providerRuntime: Record<string, typeof mockProviderRuntime>;
      providerEntitiesByCanonicalId: Record<string, { room?: string }>;
    }) => unknown
  ) =>
    selector({
      currentProviderId: 'home_assistant',
      providerRuntime: {
        home_assistant: mockProviderRuntime,
      },
      providerEntitiesByCanonicalId: {},
    }),
}));

vi.mock('../use-provider-entity', () => ({
  useProviderEntityRegistryEntries: () => [],
  useProviderEntitySnapshotsByPrefix: (
    _prefixes: readonly string[],
    options?: { enabled?: boolean }
  ) => (options?.enabled === false ? {} : (mockEntities ?? {})),
}));

vi.mock('../use-provider-feature-support', () => ({
  useProviderFeature: () => true,
}));

describe('useProviderCalendarDevices', () => {
  beforeEach(() => {
    mockEntities = {
      'calendar.family': {
        state: 'on',
        attributes: {
          friendly_name: 'Family Calendar',
        },
      },
    };
    mockProviderRuntime = {
      connected: true,
      connecting: false,
      reconnecting: false,
      entitiesHydrated: true,
      registriesHydrated: true,
    };
  });

  it('keeps the last resolved calendar device while provider entities are rehydrating', () => {
    const { result, rerender } = renderHook(() => useProviderCalendarDevices('home_assistant'));

    expect(result.current).toEqual([
      expect.objectContaining({ id: 'home_assistant:calendar.navet_overview' }),
    ]);

    mockEntities = null;
    mockProviderRuntime = {
      ...mockProviderRuntime,
      entitiesHydrated: false,
      reconnecting: true,
    };
    rerender();

    expect(result.current).toEqual([
      expect.objectContaining({ id: 'home_assistant:calendar.navet_overview' }),
    ]);
  });

  it('clears the cached calendar device once hydration completes without calendar entities', () => {
    const { result, rerender } = renderHook(() => useProviderCalendarDevices('home_assistant'));

    expect(result.current).toHaveLength(1);

    mockEntities = {};
    mockProviderRuntime = {
      ...mockProviderRuntime,
      entitiesHydrated: true,
      reconnecting: false,
    };
    rerender();

    expect(result.current).toEqual([]);
  });

  it('returns no calendar devices when disabled', () => {
    const { result } = renderHook(() =>
      useProviderCalendarDevices('home_assistant', { enabled: false })
    );

    expect(result.current).toEqual([]);
  });
});
