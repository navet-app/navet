import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHeaderSearch } from './use-header-search';

const SEARCH_DEVICE_KEYS = [
  'lights',
  'climate',
  'hvac',
  'switches',
  'helpers',
  'timers',
  'counters',
  'valves',
  'remotes',
  'covers',
  'locks',
  'media',
  'persons',
  'sensors',
  'vacuums',
  'weather',
];

const {
  activeDeviceCollection,
  emptyDeviceCollection,
  useDeviceCollectionsByKeysMock,
  searchState,
  setFilteredDeviceIdsMock,
  setSearchQueryMock,
  clearSearchMock,
} = vi.hoisted(() => {
  const emptyDeviceCollection = {
    lights: [],
    fans: [],
    hvac: [],
    climate: [],
    media: [],
    weather: [],
    switches: [],
    helpers: [],
    timers: [],
    counters: [],
    valves: [],
    remotes: [],
    covers: [],
    locks: [],
    scenes: [],
    persons: [],
    sensors: [],
    vacuums: [],
    calendars: [],
    cameras: [],
    'grouped-sensors': [],
  };
  const activeDeviceCollection = {
    ...emptyDeviceCollection,
    lights: [{ id: 'light.kitchen_pendant', name: 'Kitchen pendant', room: 'Kitchen' }],
    sensors: [{ id: 'sensor.outdoor_temperature', name: 'Outdoor temperature', room: 'Garden' }],
    helpers: [
      'number',
      'input_number',
      'select',
      'input_select',
      'text',
      'input_text',
      'date',
      'time',
      'datetime',
      'input_datetime',
    ].map((domain, index) => ({
      id: `home_assistant:${domain}.value`,
      name: `Value control ${index}`,
      room: `Utility room ${index}`,
      entityType: domain,
    })),
    timers: [{ id: 'homey:tea', name: 'Steeping', room: 'Pantry' }],
    counters: [{ id: 'homey:visits', name: 'Visits', room: 'Workshop' }],
    valves: [{ id: 'homey:irrigation', name: 'Water supply', room: 'Greenhouse' }],
    remotes: [{ id: 'homey:television', name: 'Television', room: 'Cinema' }],
  };
  const searchState = {
    searchQuery: '',
    filteredDeviceIds: [] as string[],
  };

  return {
    activeDeviceCollection,
    emptyDeviceCollection,
    useDeviceCollectionsByKeysMock: vi.fn(
      (_keys: readonly string[], options?: { enabled?: boolean }) =>
        options?.enabled ? activeDeviceCollection : emptyDeviceCollection
    ),
    searchState,
    setFilteredDeviceIdsMock: vi.fn(),
    setSearchQueryMock: vi.fn((value: string) => {
      searchState.searchQuery = value;
    }),
    clearSearchMock: vi.fn(() => {
      searchState.searchQuery = '';
      searchState.filteredDeviceIds = [];
    }),
  };
});

vi.mock('@navet/app/hooks', () => ({
  useDeviceCollectionsByKeys: useDeviceCollectionsByKeysMock,
  useSearch: () => ({
    searchQuery: searchState.searchQuery,
    filteredDeviceIds: searchState.filteredDeviceIds,
    setSearchQuery: setSearchQueryMock,
    setFilteredDeviceIds: setFilteredDeviceIdsMock,
    clearSearch: clearSearchMock,
    isSearchActive: searchState.searchQuery.trim().length > 0,
  }),
}));

describe('useHeaderSearch', () => {
  it.each([
    ['homey:tea', 'Steeping', 'Pantry', 'timer'],
    ['homey:visits', 'Visits', 'Workshop', 'counter'],
    ['homey:irrigation', 'Water supply', 'Greenhouse', 'valve'],
    ['homey:television', 'Television', 'Cinema', 'remote'],
  ])('finds %s by name, room, domain and provider identity', async (id, name, room, domain) => {
    const { result, rerender } = renderHook(() => useHeaderSearch());
    for (const query of [name, room, domain, id]) {
      act(() => result.current.handleSearchChange(query));
      rerender();
      await waitFor(() => expect(setFilteredDeviceIdsMock).toHaveBeenLastCalledWith([id]));
    }
  });

  it.each([
    'number',
    'input_number',
    'select',
    'input_select',
    'text',
    'input_text',
    'date',
    'time',
    'datetime',
    'input_datetime',
  ])('finds %s helpers by name, room, domain and provider identity', async (domain) => {
    const device = activeDeviceCollection.helpers.find((helper) => helper.entityType === domain);
    if (!device) throw new Error(`Missing ${domain} helper fixture`);
    const { result, rerender } = renderHook(() => useHeaderSearch());
    for (const query of [device.name, device.room, device.id]) {
      act(() => result.current.handleSearchChange(query));
      rerender();
      await waitFor(() => expect(setFilteredDeviceIdsMock).toHaveBeenLastCalledWith([device.id]));
    }
    act(() => result.current.handleSearchChange(domain));
    rerender();
    await waitFor(() => {
      expect(setFilteredDeviceIdsMock).toHaveBeenLastCalledWith(
        expect.arrayContaining([device.id])
      );
    });
  });

  beforeEach(() => {
    useDeviceCollectionsByKeysMock.mockClear();
    setFilteredDeviceIdsMock.mockClear();
    setSearchQueryMock.mockClear();
    clearSearchMock.mockClear();
    searchState.searchQuery = '';
    searchState.filteredDeviceIds = [];
  });

  it('does not track device collections while search is closed and idle', () => {
    const { result, rerender } = renderHook(() => useHeaderSearch());

    expect(useDeviceCollectionsByKeysMock).toHaveBeenCalledWith(SEARCH_DEVICE_KEYS, {
      enabled: false,
      includeFeatureCollections: false,
    });
    expect(useDeviceCollectionsByKeysMock).toHaveLastReturnedWith(emptyDeviceCollection);

    rerender();

    expect(useDeviceCollectionsByKeysMock).toHaveBeenCalledTimes(2);
    expect(result.current.isSearchFocused).toBe(false);
    expect(result.current.isMobileSearchOpen).toBe(false);
  });

  it('loads collections on focus so the first query is ready immediately', () => {
    const { result } = renderHook(() => useHeaderSearch());

    act(() => {
      result.current.setIsSearchFocused(true);
    });

    expect(useDeviceCollectionsByKeysMock).toHaveBeenLastCalledWith(SEARCH_DEVICE_KEYS, {
      enabled: true,
      includeFeatureCollections: false,
    });
    expect(useDeviceCollectionsByKeysMock).toHaveLastReturnedWith(activeDeviceCollection);
  });

  it('loads collections as soon as the mobile search sheet opens', () => {
    const { result } = renderHook(() => useHeaderSearch());

    act(() => {
      result.current.setIsMobileSearchOpen(true);
    });

    expect(useDeviceCollectionsByKeysMock).toHaveBeenLastCalledWith(SEARCH_DEVICE_KEYS, {
      enabled: true,
      includeFeatureCollections: false,
    });
  });

  it('loads and filters active search results by device metadata', async () => {
    const { result, rerender } = renderHook(() => useHeaderSearch());

    act(() => {
      result.current.handleSearchChange('kitchen');
    });
    rerender();

    expect(useDeviceCollectionsByKeysMock).toHaveBeenLastCalledWith(SEARCH_DEVICE_KEYS, {
      enabled: true,
      includeFeatureCollections: false,
    });
    await waitFor(() => {
      expect(setFilteredDeviceIdsMock).toHaveBeenLastCalledWith(['light.kitchen_pendant']);
    });
  });
});
