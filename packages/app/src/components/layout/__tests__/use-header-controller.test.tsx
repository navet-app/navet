import { integrationStore } from '@navet/app/stores/integration-store';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { renderHookWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useProviderResourceMock } = vi.hoisted(() => ({
  useProviderResourceMock: vi.fn(),
}));

vi.mock('@navet/app/hooks', async () => {
  const actual = await vi.importActual<typeof import('@navet/app/hooks')>('@navet/app/hooks');
  return {
    ...actual,
    useProviderResource: useProviderResourceMock,
  };
});

vi.mock('../use-header-search', () => ({
  useHeaderSearch: () => ({
    closeMobileSearch: vi.fn(),
    handleClearSearch: vi.fn(),
    handleSearchChange: vi.fn(),
    handleToggleMobileSearch: vi.fn(),
    isMobileSearchOpen: false,
    isSearchActive: false,
    isSearchFocused: false,
    mobileSearchInputRef: { current: null },
    searchQuery: '',
    setIsMobileSearchOpen: vi.fn(),
    setIsSearchFocused: vi.fn(),
  }),
}));

vi.mock(
  '@navet/app/features/notifications/components/notifications/use-notification-badge-count',
  () => ({
    useNotificationBadgeCount: () => 0,
  })
);

import { useHeaderController } from '../use-header-controller';

describe('useHeaderController', () => {
  beforeEach(async () => {
    await resetAppStores();
    vi.clearAllMocks();
    useSettingsStore.getState().updateSettings({ lowPowerMode: false });
    useProviderResourceMock.mockImplementation(({ deviceId }: { deviceId: string }) =>
      deviceId
        ? {
            kind: 'image',
            url: `resolved:${deviceId}`,
          }
        : null
    );
  });

  it('resolves avatar resources in low-power mode without rerendering for unrelated provider updates', () => {
    useSettingsStore.getState().updateSettings({ lowPowerMode: true });
    integrationStore.setState({
      ...integrationStore.getState(),
      currentProviderId: 'home_assistant',
      currentUser: {
        id: 'user-1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        avatarUrl: null,
      },
      providerDeviceCollectionsByProviderId: {
        ...integrationStore.getState().providerDeviceCollectionsByProviderId,
        home_assistant: {
          ...(integrationStore.getState().providerDeviceCollectionsByProviderId.home_assistant ?? {
            lights: [],
            fans: [],
            hvac: [],
            climate: [],
            media: [],
            weather: [],
            switches: [],
            timers: [],
            counters: [],
            valves: [],
            remotes: [],
            helpers: [],
            covers: [],
            locks: [],
            scenes: [],
            persons: [],
            sensors: [],
            vacuums: [],
            calendars: [],
            cameras: [],
            'grouped-sensors': [],
          }),
          persons: [
            {
              id: 'home_assistant:person.jane_doe',
              canonicalId: 'home_assistant:person.jane_doe',
              nativeId: 'person.jane_doe',
              providerId: 'home_assistant',
              name: 'Jane Doe',
              room: 'Home',
              location: 'Home',
              size: 'small',
              state: 'home',
            },
          ],
        },
      },
      providerEntitiesByProviderId: {
        ...integrationStore.getState().providerEntitiesByProviderId,
        home_assistant: {
          'home_assistant:person.jane_doe': {
            id: 'home_assistant:person.jane_doe',
            canonicalId: 'home_assistant:person.jane_doe',
            providerId: 'home_assistant',
            externalId: 'person.jane_doe',
            type: 'person',
            name: 'Jane Doe',
            room: 'Home',
            primaryState: 'home',
            availability: 'available',
            capabilities: [],
            attributes: {},
            resources: {
              primary_image: {
                kind: 'primary_image',
                providerId: 'home_assistant',
                entityId: 'home_assistant:person.jane_doe',
                path: '/api/image/serve/jane',
              },
            },
          },
        },
      },
      providerEntityLookupByProviderId: {
        ...integrationStore.getState().providerEntityLookupByProviderId,
        home_assistant: {
          'person.jane_doe': 'home_assistant:person.jane_doe',
          'home_assistant:person.jane_doe': 'home_assistant:person.jane_doe',
        },
      },
    });

    let renderCount = 0;
    const { result } = renderHookWithProviders(() => {
      renderCount += 1;
      return useHeaderController();
    });

    expect(result.current.avatarUrl).toBe('resolved:home_assistant:person.jane_doe');
    expect(useProviderResourceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: 'home_assistant:person.jane_doe',
        providerId: 'home_assistant',
      })
    );

    const renderCountBeforeProviderUpdate = renderCount;
    const resourceCallCountBeforeProviderUpdate = useProviderResourceMock.mock.calls.length;

    act(() => {
      integrationStore.setState({
        ...integrationStore.getState(),
        providerEntitiesByProviderId: {
          ...integrationStore.getState().providerEntitiesByProviderId,
          home_assistant: {
            ...(integrationStore.getState().providerEntitiesByProviderId.home_assistant ?? {}),
            'home_assistant:light.kitchen': {
              id: 'home_assistant:light.kitchen',
              canonicalId: 'home_assistant:light.kitchen',
              providerId: 'home_assistant',
              externalId: 'light.kitchen',
              type: 'light',
              name: 'Kitchen Light',
              room: 'Kitchen',
              primaryState: 'on',
              availability: 'available',
              capabilities: [],
              attributes: {},
            },
          },
        },
        providerEntityLookupByProviderId: {
          ...integrationStore.getState().providerEntityLookupByProviderId,
          home_assistant: {
            ...(integrationStore.getState().providerEntityLookupByProviderId.home_assistant ?? {}),
            'light.kitchen': 'home_assistant:light.kitchen',
            'home_assistant:light.kitchen': 'home_assistant:light.kitchen',
          },
        },
      });
    });

    expect(renderCount).toBe(renderCountBeforeProviderUpdate);
    expect(useProviderResourceMock).toHaveBeenCalledTimes(resourceCallCountBeforeProviderUpdate);
    expect(result.current.avatarUrl).toBe('resolved:home_assistant:person.jane_doe');
  });

  it('falls back to a unique first-name person match when the full names differ', () => {
    integrationStore.setState({
      ...integrationStore.getState(),
      currentProviderId: 'home_assistant',
      currentUser: {
        id: 'user-1',
        name: 'Jane',
        email: 'jane@example.com',
        avatarUrl: null,
      },
      providerDeviceCollectionsByProviderId: {
        ...integrationStore.getState().providerDeviceCollectionsByProviderId,
        home_assistant: {
          ...(integrationStore.getState().providerDeviceCollectionsByProviderId.home_assistant ?? {
            lights: [],
            fans: [],
            hvac: [],
            climate: [],
            media: [],
            weather: [],
            switches: [],
            timers: [],
            counters: [],
            valves: [],
            remotes: [],
            helpers: [],
            covers: [],
            locks: [],
            scenes: [],
            persons: [],
            sensors: [],
            vacuums: [],
            calendars: [],
            cameras: [],
            'grouped-sensors': [],
          }),
          persons: [
            {
              id: 'home_assistant:person.jane_doe',
              canonicalId: 'home_assistant:person.jane_doe',
              nativeId: 'person.jane_doe',
              providerId: 'home_assistant',
              name: 'Jane Doe',
              room: 'Home',
              location: 'Home',
              size: 'small',
              state: 'home',
            },
          ],
        },
      },
      providerEntitiesByProviderId: {
        ...integrationStore.getState().providerEntitiesByProviderId,
        home_assistant: {
          'home_assistant:person.jane_doe': {
            id: 'home_assistant:person.jane_doe',
            canonicalId: 'home_assistant:person.jane_doe',
            providerId: 'home_assistant',
            externalId: 'person.jane_doe',
            type: 'person',
            name: 'Jane Doe',
            room: 'Home',
            primaryState: 'home',
            availability: 'available',
            capabilities: [],
            attributes: {},
            resources: {
              primary_image: {
                kind: 'primary_image',
                providerId: 'home_assistant',
                entityId: 'home_assistant:person.jane_doe',
                path: '/api/image/serve/jane',
              },
            },
          },
        },
      },
      providerEntityLookupByProviderId: {
        ...integrationStore.getState().providerEntityLookupByProviderId,
        home_assistant: {
          'person.jane_doe': 'home_assistant:person.jane_doe',
          'home_assistant:person.jane_doe': 'home_assistant:person.jane_doe',
        },
      },
    });

    const { result } = renderHookWithProviders(() => useHeaderController());

    expect(result.current.avatarUrl).toBe('resolved:home_assistant:person.jane_doe');
    expect(useProviderResourceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: 'home_assistant:person.jane_doe',
        providerId: 'home_assistant',
      })
    );
  });

  it('exposes the first name and configured title mode without clock-driven header text', () => {
    integrationStore.setState({
      ...integrationStore.getState(),
      currentUser: {
        id: 'user-1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        avatarUrl: null,
      },
    });
    useSettingsStore.getState().updateSettings({ headerTitleMode: 'clock' });

    const { result } = renderHookWithProviders(() => useHeaderController());

    expect(result.current.firstName).toBe('Jane');
    expect(result.current.headerTitleMode).toBe('clock');
    expect(result.current.headerCustomText).toBe('');
  });

  // Keep: authenticated avatar URLs still route through the current provider.
  it('resolves direct Home Assistant avatar URLs for the current provider', async () => {
    integrationStore.setState({
      ...integrationStore.getState(),
      currentProviderId: 'home_assistant',
      currentUser: {
        id: 'user-1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        avatarUrl: '/api/image/serve/jane/512x512',
      },
    });

    const { result } = renderHookWithProviders(() => useHeaderController());

    await waitFor(() =>
      expect(result.current.avatarUrl).toBe('/__navet_ha_proxy__/api/image/serve/jane/512x512')
    );
    expect(useProviderResourceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: '',
        kind: 'primary_image',
      })
    );
  });

  it('resolves the avatar from a single provider person when the current user is unavailable', () => {
    integrationStore.setState({
      ...integrationStore.getState(),
      currentProviderId: 'home_assistant',
      currentUser: null,
      providerDeviceCollectionsByProviderId: {
        ...integrationStore.getState().providerDeviceCollectionsByProviderId,
        home_assistant: {
          ...(integrationStore.getState().providerDeviceCollectionsByProviderId.home_assistant ?? {
            lights: [],
            fans: [],
            hvac: [],
            climate: [],
            media: [],
            weather: [],
            switches: [],
            timers: [],
            counters: [],
            valves: [],
            remotes: [],
            helpers: [],
            covers: [],
            locks: [],
            scenes: [],
            persons: [],
            sensors: [],
            vacuums: [],
            calendars: [],
            cameras: [],
            'grouped-sensors': [],
          }),
          persons: [
            {
              id: 'home_assistant:person.jane_doe',
              canonicalId: 'home_assistant:person.jane_doe',
              nativeId: 'person.jane_doe',
              providerId: 'home_assistant',
              name: 'Jane Doe',
              room: 'Home',
              location: 'Home',
              size: 'small',
              state: 'home',
              entityPicture: '/api/image/serve/jane',
              resources: {
                primaryImage: {
                  kind: 'primary_image',
                  providerId: 'home_assistant',
                  entityId: 'home_assistant:person.jane_doe',
                  path: '/api/image/serve/jane',
                },
              },
            },
          ],
        },
      },
      providerEntitiesByProviderId: {
        ...integrationStore.getState().providerEntitiesByProviderId,
        home_assistant: {
          'home_assistant:person.jane_doe': {
            id: 'home_assistant:person.jane_doe',
            canonicalId: 'home_assistant:person.jane_doe',
            providerId: 'home_assistant',
            externalId: 'person.jane_doe',
            type: 'person',
            name: 'Jane Doe',
            room: 'Home',
            primaryState: 'home',
            availability: 'available',
            capabilities: [],
            attributes: {},
            resources: {
              primary_image: {
                kind: 'primary_image',
                providerId: 'home_assistant',
                entityId: 'home_assistant:person.jane_doe',
                path: '/api/image/serve/jane',
              },
            },
          },
        },
      },
      providerEntityLookupByProviderId: {
        ...integrationStore.getState().providerEntityLookupByProviderId,
        home_assistant: {
          'person.jane_doe': 'home_assistant:person.jane_doe',
          'home_assistant:person.jane_doe': 'home_assistant:person.jane_doe',
        },
      },
    });

    const { result } = renderHookWithProviders(() => useHeaderController());

    expect(result.current.avatarUrl).toBe('resolved:home_assistant:person.jane_doe');
    expect(useProviderResourceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: 'home_assistant:person.jane_doe',
        providerId: 'home_assistant',
      })
    );
  });
});
