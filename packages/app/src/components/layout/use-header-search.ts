import { useDeviceCollectionsByKeys, useSearch } from '@navet/app/hooks';
import { useDeferredValue, useEffect, useRef, useState } from 'react';

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
] as const;

const DEVICE_GROUPS = [
  { domain: 'light', type: 'lights', deviceKey: 'lights' },
  { domain: 'climate', type: 'climate', deviceKey: 'climate' },
  { domain: 'climate', type: 'hvac', deviceKey: 'hvac' },
  { domain: 'switch', type: 'switches', deviceKey: 'switches' },
  { domain: 'helper', type: 'helpers', deviceKey: 'helpers' },
  { domain: 'timer', type: 'timers', deviceKey: 'timers' },
  { domain: 'counter', type: 'counters', deviceKey: 'counters' },
  { domain: 'valve', type: 'valves', deviceKey: 'valves' },
  { domain: 'remote', type: 'remotes', deviceKey: 'remotes' },
  { domain: 'cover', type: 'covers', deviceKey: 'covers' },
  { domain: 'lock', type: 'locks', deviceKey: 'locks' },
  { domain: 'media_player', type: 'media', deviceKey: 'media' },
  { domain: 'person', type: 'persons', deviceKey: 'persons' },
  { domain: 'sensor', type: 'sensors', deviceKey: 'sensors' },
  { domain: 'vacuum', type: 'vacuums', deviceKey: 'vacuums' },
  { domain: 'weather', type: 'weather', deviceKey: 'weather' },
] as const;

export function useHeaderSearch() {
  const { searchQuery, setSearchQuery, setFilteredDeviceIds, clearSearch, isSearchActive } =
    useSearch();
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const shouldLoadDevices = isSearchFocused || isMobileSearchOpen || searchQuery.trim().length > 0;
  const devices = useDeviceCollectionsByKeys(SEARCH_DEVICE_KEYS, {
    enabled: shouldLoadDevices,
    includeFeatureCollections: false,
  });
  const deferredDevices = useDeferredValue(devices);

  useEffect(() => {
    const query = searchQuery.toLowerCase().trim();

    if (!query) {
      setFilteredDeviceIds([]);
      return;
    }

    const matchingIds = DEVICE_GROUPS.flatMap(({ domain, type, deviceKey }) =>
      deferredDevices[deviceKey].flatMap((device) => {
        const searchableValues = new Set<string>([
          device.id.toLowerCase(),
          domain,
          `${domain}.`,
          type,
          String(device.name).toLowerCase(),
        ]);

        if ('room' in device && typeof device.room === 'string') {
          searchableValues.add(device.room.toLowerCase());
        }

        if ('location' in device && typeof device.location === 'string') {
          searchableValues.add(device.location.toLowerCase());
        }

        if ('entityType' in device && typeof device.entityType === 'string') {
          searchableValues.add(device.entityType.toLowerCase());
        }

        const matches = Array.from(searchableValues).some((value) => {
          if (value === query) return true;
          if (value.startsWith(query)) return true;
          return value.includes(query);
        });

        return matches ? [device.id] : [];
      })
    );

    setFilteredDeviceIds(matchingIds);
  }, [deferredDevices, searchQuery, setFilteredDeviceIds]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
  };

  const handleClearSearch = () => {
    clearSearch();
    setIsMobileSearchOpen(false);
  };

  const handleToggleMobileSearch = () => {
    setIsMobileSearchOpen((current) => {
      const next = !current;
      if (next) {
        window.setTimeout(() => mobileSearchInputRef.current?.focus(), 0);
      } else {
        clearSearch();
      }
      return next;
    });
  };

  const openMobileSearch = () => {
    setIsMobileSearchOpen(true);
    window.setTimeout(() => mobileSearchInputRef.current?.focus(), 0);
  };

  const closeMobileSearch = () => {
    clearSearch();
    setIsMobileSearchOpen(false);
  };

  return {
    closeMobileSearch,
    handleClearSearch,
    handleSearchChange,
    handleToggleMobileSearch,
    isMobileSearchOpen,
    isSearchActive,
    isSearchFocused,
    mobileSearchInputRef,
    openMobileSearch,
    searchQuery,
    setIsMobileSearchOpen,
    setIsSearchFocused,
  };
}
