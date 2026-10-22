import { STORAGE_KEYS } from '@navet/app/constants/storage-keys';
import {
  useCardZonesStore,
  useCustomCardsStore,
  useDashboardCollectionStore,
  useDashboardEntitiesStore,
  useHomeDashboardLayoutStore,
} from '@navet/app/features/dashboard';
import { getDashboardProfileChangedPaths } from '@navet/app/features/dashboard/clients/dashboard-profile-diff';
import { useNavigationStore } from '@navet/app/stores/navigation-store';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { useThemeStore } from '@navet/app/stores/theme-store';
import {
  exportDashboardConfig,
  importDashboardConfig,
  importDashboardConfigFromUrl,
} from '@navet/app/utils/dashboard-config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const baseConfig = {
  version: 3,
  app: 'navet',
  theme: {
    theme: 'dark',
    primaryColor: 'orange',
  },
  settings: {},
  navigation: {
    currentRoom: 'all',
    activeSection: 'home',
  },
};

describe('dashboard-config import hardening', () => {
  beforeEach(() => {
    localStorage.clear();
    useCustomCardsStore.setState(useCustomCardsStore.getInitialState(), true);
    useDashboardCollectionStore.setState(useDashboardCollectionStore.getInitialState(), true);
    useDashboardEntitiesStore.setState(useDashboardEntitiesStore.getInitialState(), true);
    useCardZonesStore.setState(useCardZonesStore.getInitialState(), true);
    useHomeDashboardLayoutStore.setState(useHomeDashboardLayoutStore.getInitialState(), true);
    useNavigationStore.setState(useNavigationStore.getInitialState(), true);
    useSettingsStore.setState(useSettingsStore.getInitialState(), true);
    useThemeStore.setState(useThemeStore.getInitialState(), true);
  });

  it('drops unsafe custom card URLs and service calls', () => {
    importDashboardConfig({
      ...baseConfig,
      customCards: [
        {
          id: 'rss-card',
          type: 'rss',
          size: 'medium',
          room: 'all',
          data: {
            customProviders: [
              {
                id: 'bad',
                name: 'Bad',
                type: 'url',
                feedUrl: 'http://localhost/feed.xml',
              },
              {
                id: 'good',
                name: 'Good',
                type: 'url',
                feedUrl: 'https://example.com/feed.xml',
              },
            ],
          },
        },
        {
          id: 'button-card',
          type: 'button',
          size: 'medium',
          room: 'all',
          data: {
            service: 'javascript:alert(1)',
            entityId: '../light.kitchen',
          },
        },
      ],
    });

    const cards = useCustomCardsStore.getState().cards;
    expect(cards[0]?.data?.customProviders).toEqual([
      {
        id: 'good',
        name: 'Good',
        type: 'url',
        feedUrl: 'https://example.com/feed.xml',
      },
    ]);
    expect(cards[1]?.data?.service).toBeUndefined();
    expect(cards[1]?.data?.entityId).toBeUndefined();
    expect(cards[1]?.size).toBe('small');
  });

  it('keeps only provider binding and pipeline preferences for Assist cards', () => {
    importDashboardConfig({
      ...baseConfig,
      customCards: [
        {
          id: 'assist-card',
          type: 'assist',
          size: 'extra-small',
          room: 'all',
          data: {
            providerId: 'home_assistant',
            pipelineId: 'pipeline-1',
            label: 'Ask the house',
            tintColor: '#f97316',
            transcript: [{ role: 'user', text: 'unlock the door' }],
            audio: 'private recording',
          },
        },
      ],
    });

    expect(useCustomCardsStore.getState().cards).toEqual([
      expect.objectContaining({
        id: 'assist-card',
        type: 'assist',
        size: 'extra-small',
        data: {
          providerId: 'home_assistant',
          pipelineId: 'pipeline-1',
          label: 'Ask the house',
          tintColor: '#f97316',
        },
      }),
    ]);
  });

  it('sanitizes imported storage records before persistence', () => {
    importDashboardConfig({
      ...baseConfig,
      dashboardEntities: {
        hiddenEntityIds: ['light.hidden'],
        lockedCardIds: ['light.kitchen', 123, 'custom-note'],
        onboardingCompleted: true,
      },
      cardSizes: {
        'light.kitchen': 'large',
        bad: { nested: true },
      },
      cardOrders: {
        all: ['light.kitchen', 123, 'switch.kettle'],
      },
      homeDashboardLayout: ['not-an-object'],
    });

    expect(localStorage.getItem(STORAGE_KEYS.cardSizes)).toContain('light.kitchen');
    expect(localStorage.getItem(STORAGE_KEYS.cardSizes)).not.toContain('nested');
    expect(localStorage.getItem(STORAGE_KEYS.cardOrders)).toContain('switch.kettle');
    expect(useHomeDashboardLayoutStore.getState().cardIds).toEqual([]);
    expect(useDashboardEntitiesStore.getState().lockedCardIds).toEqual([
      'light.kitchen',
      'custom-note',
    ]);
  });

  it('applies imported persisted dashboard state to live stores', () => {
    importDashboardConfig({
      ...baseConfig,
      cardZones: {
        'light.kitchen': 'actions',
      },
      homeDashboardLayout: {
        mode: 'sectioned',
        showHero: false,
        cardIds: ['light.kitchen'],
        sections: [
          {
            id: 'main',
            title: 'Main',
            x: 0,
            y: 0,
            w: 12,
            h: 1,
          },
        ],
        cardSectionAssignments: {
          'light.kitchen': 'main',
        },
      },
      roomOrder: ['Kitchen'],
    });

    expect(useCardZonesStore.getState().cardZones).toEqual({
      'home_assistant:light.kitchen': 'actions',
    });
    expect(useHomeDashboardLayoutStore.getState()).toMatchObject({
      mode: 'sectioned',
      showHero: false,
      cardIds: ['home_assistant:light.kitchen'],
      cardSectionAssignments: {
        'home_assistant:light.kitchen': 'main',
      },
    });
  });

  it('keeps derived card orders local while card zones round-trip through JSON transport', () => {
    useDashboardEntitiesStore.getState().markOnboardingCompleted();
    const localCardOrders = {
      Kitchen: ['home_assistant:light.kitchen'],
      'Living Room': ['custom-media-stack'],
    };
    localStorage.setItem(STORAGE_KEYS.cardOrders, JSON.stringify(localCardOrders));
    useCardZonesStore.getState().replaceCardZones({
      'light.kitchen': 'actions',
    });

    const transported = JSON.parse(JSON.stringify(exportDashboardConfig())) as ReturnType<
      typeof exportDashboardConfig
    >;

    expect(transported).not.toHaveProperty('cardOrders');
    expect(transported.cardZones).toEqual({
      'home_assistant:light.kitchen': 'actions',
    });
    expect(transported.cardZones).not.toHaveProperty('state');
    expect(transported.cardZones).not.toHaveProperty('version');

    importDashboardConfig(transported);

    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.cardOrders) ?? '{}')).toEqual(
      localCardOrders
    );
    const roundTripped = JSON.parse(JSON.stringify(exportDashboardConfig())) as ReturnType<
      typeof exportDashboardConfig
    >;

    expect(getDashboardProfileChangedPaths(transported, roundTripped)).toEqual([]);
  });

  it('imports home dashboard layout from legacy persisted storage wrappers', () => {
    importDashboardConfig({
      ...baseConfig,
      customCards: [
        {
          id: 'custom-note',
          type: 'note',
          size: 'medium',
          room: '__home__',
          createdAt: 1,
        },
      ],
      homeDashboardLayout: {
        state: {
          mode: 'flow',
          showHero: true,
          cardIds: ['custom-note'],
          sections: [],
          cardSectionAssignments: {},
        },
        version: 0,
      },
    });

    expect(useHomeDashboardLayoutStore.getState().cardIds).toEqual(['custom-note']);
    expect(useCustomCardsStore.getState().cards).toEqual([]);
    expect(
      useDashboardCollectionStore.getState().collection.dashboardsById.home.homeCustomCards
    ).toEqual([
      expect.objectContaining({
        id: 'custom-note',
        room: '__home__',
      }),
    ]);
  });

  it('imports legacy sensor-group cards as canonical info cards', () => {
    importDashboardConfig({
      ...baseConfig,
      customCards: [
        {
          id: 'custom-sensor-group',
          type: 'sensor-group',
          size: 'medium',
          room: 'Kitchen',
          createdAt: 1,
          data: {
            name: 'Kitchen sensors',
            sensorEntityIds: ['sensor.kitchen_temperature', 'sensor.kitchen_humidity'],
            accentColor: 'teal',
          },
        },
      ],
    });

    expect(useCustomCardsStore.getState().cards).toEqual([
      expect.objectContaining({
        id: 'custom-sensor-group',
        type: 'info',
        data: {
          name: 'Kitchen sensors',
          sensorEntityIds: ['sensor.kitchen_temperature', 'sensor.kitchen_humidity'],
          accentColor: 'teal',
        },
      }),
    ]);

    expect(exportDashboardConfig().customCards).toEqual([
      expect.objectContaining({
        id: 'custom-sensor-group',
        type: 'info',
      }),
    ]);
  });

  it('exports home dashboard layout without the persisted storage wrapper', () => {
    useHomeDashboardLayoutStore.getState().replaceLayout({
      mode: 'flow',
      showHero: true,
      cardIds: ['light.kitchen'],
      sections: [],
      cardSectionAssignments: {},
    });

    const exported = exportDashboardConfig();

    expect(exported.homeDashboardLayout).toMatchObject({
      mode: 'flow',
      showHero: true,
      cardIds: ['home_assistant:light.kitchen'],
      sections: [],
      cardSectionAssignments: {},
    });
    expect(exported.homeDashboardLayout).not.toHaveProperty('state');
    expect(exported.homeDashboardLayout).not.toHaveProperty('version');
  });

  it('round-trips dashboard companion selections without sharing the device collapse state', () => {
    const state = useDashboardCollectionStore.getState();
    state.updateCompanion(state.activeDashboardId, {
      cameraEntityId: 'home_assistant:camera.front',
      weatherEntityId: null,
      showSecurity: false,
    });
    state.updateRoomCompanion(state.activeDashboardId, 'room_kitchen1', {
      cards: [],
      showSecurity: false,
    });
    state.selectRoomCompanion(state.activeDashboardId, 'room_kitchen1', 'dashboard');
    useSettingsStore.getState().updateSettings({ companionCollapsed: true });
    const exported = exportDashboardConfig();
    expect(exported.dashboards?.dashboardsById.home.companion).toEqual({
      cameraEntityId: 'home_assistant:camera.front',
      weatherEntityId: null,
      showSecurity: false,
    });
    useDashboardCollectionStore.getState().resetCollection();
    importDashboardConfig({ ...baseConfig, dashboards: exported.dashboards });
    expect(useDashboardCollectionStore.getState().collection.dashboardsById.home.companion).toEqual(
      { cameraEntityId: 'home_assistant:camera.front', weatherEntityId: null, showSecurity: false }
    );
    expect(useSettingsStore.getState().companionCollapsed).toBe(true);
    expect(
      useDashboardCollectionStore.getState().collection.dashboardsById.home.roomCompanions
    ).toEqual({
      room_kitchen1: { cards: [], showSecurity: false },
    });
    expect(
      useDashboardCollectionStore.getState().collection.dashboardsById.home.roomCompanionModes
    ).toEqual({ room_kitchen1: 'dashboard' });
  });

  it('round-trips each dashboard room-navigation scope', () => {
    useDashboardCollectionStore.getState().createDashboard({
      id: 'upstairs',
      name: 'Upstairs',
      source: {
        kind: 'rooms',
        roomNames: ['Living Room', 'Office', 'Guest Room'],
        include: 'common',
        devices: [],
      },
    });

    const exported = exportDashboardConfig();
    expect(exported.dashboards?.dashboardsById.upstairs.homeRoomNames).toEqual([
      'Living Room',
      'Office',
      'Guest Room',
    ]);

    useDashboardCollectionStore.getState().resetCollection();
    importDashboardConfig({
      ...baseConfig,
      dashboards: exported.dashboards,
    });

    expect(
      useDashboardCollectionStore.getState().collection.dashboardsById.upstairs.homeRoomNames
    ).toEqual(['Living Room', 'Office', 'Guest Room']);
  });

  it('round-trips helper selections and retains pending legacy migration across exports', () => {
    useDashboardEntitiesStore.getState().showEntity('input_number.target');
    const exported = exportDashboardConfig();
    expect(exported.dashboardEntities?.explicitlyShownEntityIds).toEqual([
      'home_assistant:input_number.target',
    ]);
    useDashboardEntitiesStore.getState().hideEntity('input_number.target');
    importDashboardConfig(exported);
    expect(useDashboardEntitiesStore.getState().explicitlyShownEntityIds).toEqual([
      'home_assistant:input_number.target',
    ]);
    importDashboardConfig(baseConfig);
    expect(useDashboardEntitiesStore.getState().legacyHelperVisibilityProviderIds).toContain(
      'home_assistant'
    );
    const legacyExport = exportDashboardConfig();
    importDashboardConfig(legacyExport);
    useDashboardEntitiesStore
      .getState()
      .migrateLegacyHelperVisibility('home_assistant', ['home_assistant:input_number.target']);
    expect(useDashboardEntitiesStore.getState().explicitlyShownEntityIds).toEqual([
      'home_assistant:input_number.target',
    ]);
    importDashboardConfig({
      ...baseConfig,
      dashboardEntities: {
        hiddenEntityIds: [],
        lockedCardIds: [],
        onboardingCompleted: true,
        explicitlyShownEntityIds: [],
      },
    });
    expect(useDashboardEntitiesStore.getState().legacyHelperVisibilityProviderIds).toEqual([]);
  });

  it('exports locked card ids with dashboard entity state', () => {
    useDashboardEntitiesStore.getState().lockCard('light.kitchen');

    const exported = exportDashboardConfig();

    expect(exported.dashboardEntities?.lockedCardIds).toEqual(['light.kitchen']);
  });

  it('round-trips the summary bar dashboard setting', () => {
    useSettingsStore.getState().updateSettings({ showHomeSummaryBar: false });

    const exported = exportDashboardConfig();

    expect(exported.settings.showHomeSummaryBar).toBe(false);

    useSettingsStore.getState().updateSettings({ showHomeSummaryBar: true });

    importDashboardConfig({
      ...baseConfig,
      settings: {
        showHomeSummaryBar: false,
      },
    });

    expect(useSettingsStore.getState().showHomeSummaryBar).toBe(false);
  });

  it('exports shared settings while preserving fixed device settings', () => {
    useSettingsStore.getState().updateSettings({
      dashboardSpaceMode: 'more_space',
      keepDeviceAwake: true,
      kioskMode: true,
      weatherForecastMode: 'hourly',
    });

    const exported = exportDashboardConfig();

    expect(exported.settings).not.toHaveProperty('dashboardSpaceMode');
    expect(exported.settings).not.toHaveProperty('keepDeviceAwake');
    expect(exported.settings).not.toHaveProperty('kioskMode');
    expect(exported.settings.weatherForecastMode).toBe('hourly');

    useSettingsStore.getState().updateSettings({
      dashboardSpaceMode: 'default',
      keepDeviceAwake: false,
      kioskMode: false,
      weatherForecastMode: 'weekly',
    });

    importDashboardConfig({
      ...baseConfig,
      settings: {
        dashboardSpaceMode: 'more_space',
        keepDeviceAwake: true,
        kioskMode: true,
        weatherForecastMode: 'hourly',
      },
    });

    expect(useSettingsStore.getState().kioskMode).toBe(false);
    expect(useSettingsStore.getState().keepDeviceAwake).toBe(false);
    expect(useSettingsStore.getState().dashboardSpaceMode).toBe('default');
    expect(useSettingsStore.getState().weatherForecastMode).toBe('hourly');
  });

  it('never exports or imports credential and account fields through the shared profile', () => {
    useSettingsStore.getState().updateSettings({
      username: 'Vishal',
      email: 'vishal@example.com',
      language: 'sv',
      cameraDirectStreamUrls: {
        'home_assistant:camera.front': 'https://user:secret@example.com/live?token=private',
      },
    });

    const exported = exportDashboardConfig();

    expect(exported.settings).not.toHaveProperty('username');
    expect(exported.settings).not.toHaveProperty('email');
    expect(exported.settings).not.toHaveProperty('language');
    expect(exported.settings).not.toHaveProperty('cameraDirectStreamUrls');
    expect(JSON.stringify(exported)).not.toContain('private');
    expect(JSON.stringify(exported)).not.toContain('secret');

    importDashboardConfig({
      ...baseConfig,
      settings: {
        username: 'Attacker',
        email: 'attacker@example.com',
        language: 'de',
        cameraDirectStreamUrls: {
          'camera.front': 'https://attacker.example.com/live?token=stolen',
        },
      },
    });

    expect(useSettingsStore.getState()).toMatchObject({
      username: 'Vishal',
      email: 'vishal@example.com',
      language: 'sv',
      cameraDirectStreamUrls: {
        'home_assistant:camera.front': 'https://user:secret@example.com/live?token=private',
      },
    });
  });

  it('removes signed URLs and nested credentials from every shared profile surface', () => {
    useThemeStore
      .getState()
      .setWallpaper('/api/camera_proxy/camera.front?authSig=wallpaper-private');
    useCustomCardsStore.setState({
      cards: [
        {
          id: 'photo-card',
          type: 'photo',
          size: 'medium',
          room: 'all',
          createdAt: 1,
          data: {
            photoUrls: [
              'https://example.com/photo.jpg',
              '/api/camera_proxy/camera.front?authSig=photo-private',
              '/photo.jpg#access_token=fragment-private',
            ],
          },
        },
        {
          id: 'button-card',
          type: 'button',
          size: 'small',
          room: 'all',
          createdAt: 2,
          data: {
            service: 'light.turn_on',
            serviceData: {
              access_token: 'service-private',
              code: 'alarm-private',
              jwt: 'jwt-private',
              'X-API-Key': 'header-private',
              brightness_pct: 50,
              nested: {
                callback: '/api/callback?api_key=callback-private',
                transition: 2,
              },
            },
          },
        },
      ],
    });

    const exported = exportDashboardConfig();
    const serialized = JSON.stringify(exported);

    expect(exported.theme).not.toHaveProperty('wallpaper');
    expect(exported.customCards?.[0]?.data?.photoUrls).toEqual(['https://example.com/photo.jpg']);
    expect(exported.customCards?.[1]?.data?.serviceData).toEqual({
      brightness_pct: 50,
      nested: { transition: 2 },
    });
    expect(serialized).not.toContain('private');
    expect(serialized).not.toContain('access_token');
    expect(serialized).not.toContain('authSig');
  });

  it('keeps header presentation on the current dashboard client', () => {
    useSettingsStore.getState().updateSettings({
      headerTitleMode: 'custom_text',
      headerCustomText: 'Movie night',
    });

    const exported = exportDashboardConfig();

    expect(exported.settings).not.toHaveProperty('headerTitleMode');
    expect(exported.settings).not.toHaveProperty('headerCustomText');

    importDashboardConfig({
      ...baseConfig,
      settings: {
        headerTitleMode: 'custom_text',
        headerCustomText: '  Wind down  ',
      },
    });

    expect(useSettingsStore.getState().headerTitleMode).toBe('custom_text');
    expect(useSettingsStore.getState().headerCustomText).toBe('Movie night');
  });

  it('keeps camera transport and preview settings on the current dashboard client', () => {
    useSettingsStore.getState().updateSettings({ cameraDashboardViewMode: 'auto' });

    const exported = exportDashboardConfig();

    expect(exported.settings).not.toHaveProperty('cameraDashboardViewMode');

    importDashboardConfig({
      ...baseConfig,
      settings: {
        cameraDashboardViewMode: 'auto',
      },
    });

    expect(useSettingsStore.getState().cameraDashboardViewMode).toBe('auto');
  });

  it('can import shared profile data without replacing current navigation', () => {
    useNavigationStore.getState().applyNavigationState({
      currentRoom: 'Kitchen',
      activeSection: 'home',
    });

    importDashboardConfig(
      {
        ...baseConfig,
        navigation: {
          currentRoom: 'Unassigned',
          activeSection: 'settings',
        },
      },
      { applyNavigation: false }
    );

    expect(useNavigationStore.getState().currentRoom).toBe('Kitchen');
    expect(useNavigationStore.getState().activeSection).toBe('home');
  });

  it('imports dashboard config from a runtime URL', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        [
          'version: 3',
          'app: navet',
          'theme:',
          '  theme: dark',
          '  primaryColor: orange',
          'settings: {}',
          'navigation:',
          '  currentRoom: all',
          '  activeSection: home',
          'dashboardEntities:',
          '  onboardingCompleted: true',
        ].join('\n'),
        { status: 200 }
      )
    );

    await importDashboardConfigFromUrl('/navet-dashboard.yaml');

    expect(fetch).toHaveBeenCalledWith('/navet-dashboard.yaml', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    expect(localStorage.getItem('navet-dashboard-entities')).toContain('onboardingCompleted');
  });
});
