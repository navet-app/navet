import type { HomeAssistantPanelHass } from '@navet/app/services/home-assistant-panel-adapter';
import { homeyService } from '@navet/app/services/homey.service';
import { lightEntityFactory } from '@navet/app/test/fixtures/home-assistant/entities/light';
import { resetAppStores } from '@navet/app/test/store-reset';
import { replaceOpenHABSnapshot } from '@navet/provider-openhab';
import { describe, expect, it, vi } from 'vitest';
import { homeAssistantStore } from '../home-assistant-store';
import { integrationStore } from '../integration-store';
import { homeAssistantSelectors } from '../selectors';

describe('integrationStore', () => {
  it.each(['callWS', 'connection'] as const)(
    'rotates only the owning normalized session when an actual panel user changes over %s',
    async (transport) => {
      await resetAppStores();
      const hass: HomeAssistantPanelHass = {
        states: {},
        config: {
          time_zone: 'UTC',
          location_name: 'Panel home',
          unit_system: { temperature: 'C' },
        } as HomeAssistantPanelHass['config'],
        user: {
          id: 'user-a',
          name: 'User A',
          is_admin: true,
          is_owner: true,
        } as HomeAssistantPanelHass['user'],
        callService: vi.fn(async () => undefined),
        callWS: vi.fn(async () => []) as HomeAssistantPanelHass['callWS'],
        ...(transport === 'connection'
          ? {
              connection: {
                subscribeMessage: vi.fn(async () => () => {}),
              } as unknown as HomeAssistantPanelHass['connection'],
            }
          : {}),
      };
      homeAssistantStore.getState().syncPanelHass(hass);
      const other = { providerId: 'homey' as const, connected: true };
      integrationStore.getState().setProviderSessions({
        home_assistant: {
          providerId: 'home_assistant',
          connected: true,
          runtime: 'ha-panel',
          authMode: 'ha_frontend_session',
        },
        homey: other,
      });
      const initial = integrationStore.getState().providerSessions.home_assistant;
      homeAssistantStore.getState().syncPanelHass({ ...hass, states: { ...hass.states } });
      expect(integrationStore.getState().providerSessions.home_assistant).toBe(initial);
      homeAssistantStore.getState().syncPanelHass({
        ...hass,
        user: { id: 'user-b', name: 'User B', is_admin: true, is_owner: true },
      });
      const replacement = integrationStore.getState().providerSessions.home_assistant;
      expect(replacement).not.toBe(initial);
      expect(replacement).toEqual(initial);
      expect(integrationStore.getState().providerSessions.homey).toBe(other);
      expect(integrationStore.getState().providerRuntime.home_assistant.connected).toBe(true);
      homeAssistantStore.setState({ entities: { ...homeAssistantStore.getState().entities } });
      expect(integrationStore.getState().providerSessions.home_assistant).toBe(replacement);
    }
  );

  it('tracks provider health for implemented providers', async () => {
    await resetAppStores();

    homeAssistantStore.setState({
      connected: true,
      connecting: false,
      reconnecting: false,
      error: null,
    });
    homeyService.replaceSnapshot({
      connected: true,
      devices: {},
      zones: {},
    });
    replaceOpenHABSnapshot({
      connected: true,
      items: {
        LivingRoom: {
          name: 'LivingRoom',
          type: 'Group',
          label: 'Living Room',
          tags: ['Location', 'LivingRoom'],
          groupNames: [],
        },
        LivingRoomLamp: {
          name: 'LivingRoomLamp',
          type: 'Switch',
          label: 'Living Room Lamp',
          state: 'ON',
          category: 'light',
          tags: ['Light'],
          groupNames: ['LivingRoom'],
        },
      },
      error: null,
    });

    expect(integrationStore.getState().providerHealth.home_assistant).toMatchObject({
      providerId: 'home_assistant',
      connected: true,
      connecting: false,
      reconnecting: false,
    });
    expect(integrationStore.getState().providerHealth.homey).toMatchObject({
      providerId: 'homey',
      connected: true,
      implementationStatus: 'implemented',
    });
    expect(integrationStore.getState().providerHealth.openhab).toMatchObject({
      providerId: 'openhab',
      connected: true,
      implementationStatus: 'implemented',
      lastError: null,
    });
    expect(integrationStore.getState().providerRuntime.home_assistant).toMatchObject({
      providerId: 'home_assistant',
      connected: true,
      connecting: false,
      reconnecting: false,
      entitiesHydrated: false,
      registriesHydrated: false,
    });
    expect(integrationStore.getState().providerRuntime.homey).toMatchObject({
      providerId: 'homey',
      connected: true,
      connecting: false,
      reconnecting: false,
      entitiesHydrated: false,
      registriesHydrated: true,
    });
    expect(integrationStore.getState().providerRuntime.openhab).toMatchObject({
      providerId: 'openhab',
      connected: true,
      connecting: false,
      reconnecting: false,
      entitiesHydrated: true,
      registriesHydrated: true,
    });
    expect(integrationStore.getState().currentProviderId).toBe('home_assistant');
  });

  it('publishes openHAB entities, lookups, and rooms into the shared store', async () => {
    await resetAppStores();

    replaceOpenHABSnapshot({
      connected: true,
      items: {
        LivingRoom: {
          name: 'LivingRoom',
          type: 'Group',
          label: 'Living Room',
          tags: ['Location', 'LivingRoom'],
          groupNames: [],
        },
        LivingRoomLamp: {
          name: 'LivingRoomLamp',
          type: 'Switch',
          label: 'Living Room Lamp',
          state: 'ON',
          category: 'light',
          tags: ['Light'],
          groupNames: ['LivingRoom'],
        },
      },
      error: null,
    });

    expect(
      integrationStore.getState().providerEntitiesByCanonicalId['openhab:LivingRoomLamp']
    ).toMatchObject({
      canonicalId: 'openhab:LivingRoomLamp',
      externalId: 'LivingRoomLamp',
      providerId: 'openhab',
      type: 'light',
      primaryState: 'on',
    });
    expect(
      integrationStore.getState().providerEntityLookupByProviderId.openhab?.LivingRoomLamp
    ).toBe('openhab:LivingRoomLamp');
    expect(
      integrationStore.getState().providerNormalizedRoomsByProviderId.openhab?.[
        'openhab:LivingRoom'
      ]
    ).toMatchObject({
      canonicalId: 'openhab:LivingRoom',
      externalId: 'LivingRoom',
      providerId: 'openhab',
      memberIds: ['openhab:LivingRoomLamp'],
    });
    expect(
      Object.values(integrationStore.getState().providerRoomsByProviderId.openhab ?? {})
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: 'openhab',
          name: 'Living Room',
          memberIds: ['openhab:LivingRoomLamp'],
        }),
      ])
    );
  });

  it('maps openHAB switch lights that report ON into active light devices', async () => {
    await resetAppStores();

    replaceOpenHABSnapshot({
      connected: true,
      items: {
        LivingRoom: {
          name: 'LivingRoom',
          type: 'Group',
          label: 'Living Room',
          tags: ['Location', 'LivingRoom'],
          groupNames: [],
        },
        LivingRoomLamp: {
          name: 'LivingRoomLamp',
          type: 'Switch',
          label: 'Living Room Lamp',
          state: 'ON',
          category: 'light',
          tags: ['Light'],
          groupNames: ['LivingRoom'],
        },
      },
      error: null,
    });

    expect(
      integrationStore.getState().providerDeviceCollectionsByProviderId.openhab?.lights
    ).toEqual([
      expect.objectContaining({
        canonicalId: 'openhab:LivingRoomLamp',
        name: 'Living Room Lamp',
        room: 'Living Room',
        state: true,
      }),
    ]);
  });

  it('maps openHAB dimmer lights at 0 brightness as off', async () => {
    await resetAppStores();

    replaceOpenHABSnapshot({
      connected: true,
      items: {
        Office: {
          name: 'Office',
          type: 'Group',
          label: 'Office',
          tags: ['Location', 'Office'],
          groupNames: [],
        },
        DeskLamp: {
          name: 'DeskLamp',
          type: 'Dimmer',
          label: 'Desk Lamp',
          state: '0',
          category: 'Light',
          tags: ['Light'],
          groupNames: ['Office'],
        },
      },
      error: null,
    });

    expect(
      integrationStore.getState().providerDeviceCollectionsByProviderId.openhab?.lights
    ).toEqual([
      expect.objectContaining({
        canonicalId: 'openhab:DeskLamp',
        state: false,
        brightness: 0,
      }),
    ]);
  });

  it('maps openHAB equipment control points into visible light devices', async () => {
    await resetAppStores();

    replaceOpenHABSnapshot({
      connected: true,
      items: {
        lOffice: {
          name: 'lOffice',
          type: 'Group',
          label: 'Office',
          tags: ['Office'],
          groupNames: ['lFloor_Second'],
          metadata: {
            semantics: {
              value: 'Location_Indoor_Room_Office',
              config: { isPartOf: 'lFloor_Second' },
            },
          },
        },
        Vishals_Desk_Lamp: {
          name: 'Vishals_Desk_Lamp',
          type: 'Group',
          label: 'Vishal’s Desk Lamp',
          tags: ['LightSource'],
          groupNames: ['lOffice'],
          metadata: {
            semantics: {
              value: 'Equipment_LightSource',
              config: {
                hasLocation: 'lOffice',
              },
            },
          },
        },
        Vishals_Desk_Lamp_Brightness: {
          name: 'Vishals_Desk_Lamp_Brightness',
          type: 'Dimmer',
          label: 'Vishal’s Desk Lamp Brightness',
          state: 'NULL',
          category: 'Light',
          tags: ['Brightness', 'Control'],
          groupNames: ['Vishals_Desk_Lamp'],
          metadata: {
            semantics: {
              value: 'Point_Control',
              config: {
                relatesTo: 'Property_Brightness',
                isPointOf: 'Vishals_Desk_Lamp',
              },
            },
          },
        },
        Vishals_Desk_Lamp_Color_Temperature: {
          name: 'Vishals_Desk_Lamp_Color_Temperature',
          type: 'Dimmer',
          label: 'Vishal’s Desk Lamp Color Temperature',
          state: 'NULL',
          category: 'ColorLight',
          tags: ['Control', 'ColorTemperature'],
          groupNames: ['Vishals_Desk_Lamp'],
          metadata: {
            semantics: {
              value: 'Point_Control',
              config: {
                relatesTo: 'Property_ColorTemperature',
                isPointOf: 'Vishals_Desk_Lamp',
              },
            },
          },
        },
      },
      error: null,
    });

    expect(
      integrationStore.getState().providerDeviceCollectionsByProviderId.openhab?.lights
    ).toEqual([
      expect.objectContaining({
        canonicalId: 'openhab:Vishals_Desk_Lamp_Brightness',
        name: 'Vishal’s Desk Lamp',
        room: 'Office',
        state: false,
        brightness: 0,
      }),
    ]);
  });

  it('skips integration-store fan-out for repeated Home Assistant entity references', async () => {
    await resetAppStores();

    const entity = lightEntityFactory({
      friendly_name: 'Kitchen',
    });
    entity.entity_id = 'light.kitchen';
    entity.state = 'on';

    homeAssistantStore.setState({
      connected: true,
      entities: {
        'light.kitchen': entity,
      },
    });

    const listener = vi.fn();
    const unsubscribe = integrationStore.subscribe(listener);

    homeAssistantStore.setState({
      entities: {
        'light.kitchen': entity,
      },
    });

    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it('marks openHAB as reconnecting while cached snapshot data remains available', async () => {
    await resetAppStores();

    replaceOpenHABSnapshot({
      connected: true,
      items: {
        LivingRoomLamp: {
          name: 'LivingRoomLamp',
          type: 'Switch',
          label: 'Living Room Lamp',
          state: 'ON',
          category: 'light',
          tags: ['Light'],
          groupNames: ['LivingRoom'],
        },
      },
      reconnecting: true,
      error: 'openHAB live updates disconnected. Cached UI is still available.',
    });

    expect(integrationStore.getState().providerHealth.openhab).toMatchObject({
      providerId: 'openhab',
      connected: true,
      reconnecting: true,
      lastError: 'openHAB live updates disconnected. Cached UI is still available.',
    });
  });

  it('updates the active provider id separately from provider session snapshots', async () => {
    await resetAppStores();

    integrationStore.getState().setCurrentProviderId('homey');

    expect(integrationStore.getState().currentProviderId).toBe('homey');
  });

  it('resolves canonical entity ids through the shared integration store', async () => {
    await resetAppStores();

    homeAssistantStore.setState({
      entities: {
        'light.kitchen': {
          entity_id: 'light.kitchen',
          state: 'on',
          attributes: { friendly_name: 'Kitchen Light' },
          last_changed: '2024-01-01T00:00:00.000Z',
          last_updated: '2024-01-01T00:00:00.000Z',
          context: { id: 'ctx', parent_id: null, user_id: null },
        },
      },
    });

    const entity = homeAssistantSelectors.entity('home_assistant:light.kitchen')(
      homeAssistantStore.getState()
    );
    expect(entity?.attributes.friendly_name).toBe('Kitchen Light');
  });

  it('publishes canonical provider entities, collections, and rooms', async () => {
    await resetAppStores();

    homeAssistantStore.setState({
      connected: true,
      areas: [{ area_id: 'kitchen', name: 'Kitchen' }],
      entities: {
        'light.kitchen': {
          entity_id: 'light.kitchen',
          state: 'on',
          attributes: { friendly_name: 'Kitchen Light', brightness: 255 },
          last_changed: '2024-01-01T00:00:00.000Z',
          last_updated: '2024-01-01T00:00:00.000Z',
          context: { id: 'ctx', parent_id: null, user_id: null },
        },
      },
    });
    homeyService.replaceSnapshot({
      connected: true,
      zones: {
        kitchen: { id: 'kitchen', name: 'Kitchen' },
      },
      devices: {
        'switch-1': {
          id: 'switch-1',
          name: 'Coffee Machine',
          class: 'socket',
          zone: 'kitchen',
          capabilitiesObj: {
            onoff: { value: false },
          },
        },
      },
    });

    expect(
      integrationStore.getState().providerEntitiesByCanonicalId['home_assistant:light.kitchen']
    ).toMatchObject({
      canonicalId: 'home_assistant:light.kitchen',
      externalId: 'light.kitchen',
      type: 'light',
      primaryState: 'on',
      capabilities: expect.arrayContaining(['toggle', 'brightness']),
    });
    expect(
      integrationStore.getState().providerEntityViewsByCanonicalId['home_assistant:light.kitchen']
    ).toMatchObject({
      canonicalId: 'home_assistant:light.kitchen',
      externalId: 'light.kitchen',
      type: 'light',
      size: 'small',
      attributes: expect.objectContaining({
        brightnessPct: 100,
      }),
    });
    expect(
      integrationStore.getState().providerDeviceCollectionsByProviderId.home_assistant
    ).toMatchObject(
      expect.objectContaining({
        lights: expect.arrayContaining([
          expect.objectContaining({
            canonicalId: 'home_assistant:light.kitchen',
            room: 'Unassigned',
          }),
        ]),
      })
    );
    expect(integrationStore.getState().providerDeviceCollectionsByProviderId.homey).toMatchObject(
      expect.objectContaining({
        switches: expect.arrayContaining([
          expect.objectContaining({
            canonicalId: 'homey:switch-1',
            name: 'Coffee Machine',
            providerId: 'homey',
            room: 'Kitchen',
            state: false,
          }),
        ]),
      })
    );
    expect(Object.values(integrationStore.getState().roomsByCanonicalId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalId: 'home_assistant:kitchen',
          providerId: 'home_assistant',
          memberIds: [],
        }),
        expect.objectContaining({
          canonicalId: 'homey:kitchen',
          providerId: 'homey',
          memberIds: ['homey:switch-1'],
        }),
      ])
    );
    expect(integrationStore.getState().roomDescriptors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Kitchen',
          providerIds: expect.arrayContaining(['home_assistant', 'homey']),
          sources: expect.arrayContaining([
            expect.objectContaining({
              providerId: 'home_assistant',
              nativeId: 'kitchen',
              sourceType: 'provider_managed',
              supportsOrdering: true,
              supportsDeletion: true,
            }),
            expect.objectContaining({
              providerId: 'homey',
              nativeId: 'kitchen',
              sourceType: 'provider_managed',
              supportsOrdering: true,
              supportsDeletion: false,
            }),
          ]),
        }),
      ])
    );
    expect(
      integrationStore.getState().roomDescriptors.some((room) => room.name === 'Unassigned')
    ).toBe(false);
    expect(integrationStore.getState().providerRuntime.home_assistant).toMatchObject({
      entitiesHydrated: true,
      registriesHydrated: false,
    });
  });

  it('records provider-neutral entity events from provider adapter updates', async () => {
    await resetAppStores();

    homeAssistantStore.setState({
      entities: {
        'light.kitchen': {
          entity_id: 'light.kitchen',
          state: 'off',
          attributes: { friendly_name: 'Kitchen Light' },
          last_changed: '2024-01-01T00:00:00.000Z',
          last_updated: '2024-01-01T00:00:00.000Z',
          context: { id: 'ctx', parent_id: null, user_id: null },
        },
      },
    });

    homeAssistantStore.setState({
      entities: {
        'light.kitchen': {
          entity_id: 'light.kitchen',
          state: 'on',
          attributes: { friendly_name: 'Kitchen Light', brightness: 255 },
          last_changed: '2024-01-01T00:00:00.000Z',
          last_updated: '2024-01-01T00:05:00.000Z',
          context: { id: 'ctx', parent_id: null, user_id: null },
        },
      },
    });

    expect(integrationStore.getState().providerEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'entity_updated',
          providerId: 'home_assistant',
          entityId: 'home_assistant:light.kitchen',
        }),
      ])
    );
  });

  it('reuses unchanged provider slices when Home Assistant publishes an equivalent payload', async () => {
    await resetAppStores();

    const kitchenEntity = {
      entity_id: 'light.kitchen',
      state: 'on',
      attributes: { friendly_name: 'Kitchen Light', brightness: 255 },
      last_changed: '2024-01-01T00:00:00.000Z',
      last_updated: '2024-01-01T00:00:00.000Z',
      context: { id: 'ctx', parent_id: null, user_id: null },
    };

    homeAssistantStore.setState({
      connected: true,
      areas: [{ area_id: 'kitchen', name: 'Kitchen' }],
      entities: {
        'light.kitchen': kitchenEntity,
      },
    });
    homeyService.replaceSnapshot({
      connected: true,
      devices: {},
      zones: {
        kitchen: { id: 'kitchen', name: 'Kitchen' },
      },
    });

    const previousState = integrationStore.getState();
    const previousEntity =
      previousState.providerEntitiesByCanonicalId['home_assistant:light.kitchen'];
    const previousView =
      previousState.providerEntityViewsByCanonicalId['home_assistant:light.kitchen'];
    const previousRoomDescriptors = previousState.roomDescriptors;
    const previousHomeyCollection = previousState.providerDeviceCollectionsByProviderId.homey;

    homeAssistantStore.setState({
      connected: true,
      areas: [{ area_id: 'kitchen', name: 'Kitchen' }],
      entities: {
        'light.kitchen': {
          ...kitchenEntity,
          attributes: { friendly_name: 'Kitchen Light', brightness: 255 },
        },
      },
    });

    const nextState = integrationStore.getState();

    expect(nextState.providerEntitiesByCanonicalId['home_assistant:light.kitchen']).toBe(
      previousEntity
    );
    expect(nextState.providerEntityViewsByCanonicalId['home_assistant:light.kitchen']).toBe(
      previousView
    );
    expect(nextState.roomDescriptors).toBe(previousRoomDescriptors);
    expect(nextState.providerDeviceCollectionsByProviderId.homey).toBe(previousHomeyCollection);
  });

  it('updates only changed derived entries for Home Assistant entities', async () => {
    await resetAppStores();

    homeAssistantStore.setState({
      connected: true,
      entities: {
        'light.kitchen': {
          entity_id: 'light.kitchen',
          state: 'off',
          attributes: { friendly_name: 'Kitchen Light' },
          last_changed: '2024-01-01T00:00:00.000Z',
          last_updated: '2024-01-01T00:00:00.000Z',
          context: { id: 'ctx-1', parent_id: null, user_id: null },
        },
        'light.hall': {
          entity_id: 'light.hall',
          state: 'on',
          attributes: { friendly_name: 'Hall Light', brightness: 200 },
          last_changed: '2024-01-01T00:00:00.000Z',
          last_updated: '2024-01-01T00:00:00.000Z',
          context: { id: 'ctx-2', parent_id: null, user_id: null },
        },
      },
    });

    const previousState = integrationStore.getState();
    const previousKitchenEntity =
      previousState.providerEntitiesByCanonicalId['home_assistant:light.kitchen'];
    const previousHallEntity =
      previousState.providerEntitiesByCanonicalId['home_assistant:light.hall'];
    const previousKitchenView =
      previousState.providerEntityViewsByCanonicalId['home_assistant:light.kitchen'];
    const previousHallView =
      previousState.providerEntityViewsByCanonicalId['home_assistant:light.hall'];

    homeAssistantStore.setState({
      connected: true,
      entities: {
        'light.kitchen': {
          entity_id: 'light.kitchen',
          state: 'on',
          attributes: { friendly_name: 'Kitchen Light', brightness: 255 },
          last_changed: '2024-01-01T00:00:00.000Z',
          last_updated: '2024-01-01T00:05:00.000Z',
          context: { id: 'ctx-1', parent_id: null, user_id: null },
        },
        'light.hall': {
          entity_id: 'light.hall',
          state: 'on',
          attributes: { friendly_name: 'Hall Light', brightness: 200 },
          last_changed: '2024-01-01T00:00:00.000Z',
          last_updated: '2024-01-01T00:00:00.000Z',
          context: { id: 'ctx-2', parent_id: null, user_id: null },
        },
      },
    });

    const nextState = integrationStore.getState();

    expect(nextState.providerEntitiesByCanonicalId['home_assistant:light.kitchen']).not.toBe(
      previousKitchenEntity
    );
    expect(nextState.providerEntityViewsByCanonicalId['home_assistant:light.kitchen']).not.toBe(
      previousKitchenView
    );
    expect(nextState.providerEntitiesByCanonicalId['home_assistant:light.hall']).toBe(
      previousHallEntity
    );
    expect(nextState.providerEntityViewsByCanonicalId['home_assistant:light.hall']).toBe(
      previousHallView
    );
  });

  it('reuses unchanged device entries inside a changed provider collection', async () => {
    await resetAppStores();

    homeAssistantStore.setState({
      connected: true,
      entities: {
        'light.kitchen': {
          entity_id: 'light.kitchen',
          state: 'off',
          attributes: { friendly_name: 'Kitchen Light', brightness: 0 },
          last_changed: '2024-01-01T00:00:00.000Z',
          last_updated: '2024-01-01T00:00:00.000Z',
          context: { id: 'ctx-1', parent_id: null, user_id: null },
        },
        'light.hall': {
          entity_id: 'light.hall',
          state: 'on',
          attributes: { friendly_name: 'Hall Light', brightness: 200 },
          last_changed: '2024-01-01T00:00:00.000Z',
          last_updated: '2024-01-01T00:00:00.000Z',
          context: { id: 'ctx-2', parent_id: null, user_id: null },
        },
      },
    });

    const previousLights =
      integrationStore.getState().providerDeviceCollectionsByProviderId.home_assistant?.lights ??
      [];
    const previousKitchenLight = previousLights.find(
      (device) => device.canonicalId === 'home_assistant:light.kitchen'
    );
    const previousHallLight = previousLights.find(
      (device) => device.canonicalId === 'home_assistant:light.hall'
    );

    homeAssistantStore.setState({
      connected: true,
      entities: {
        'light.kitchen': {
          entity_id: 'light.kitchen',
          state: 'on',
          attributes: { friendly_name: 'Kitchen Light', brightness: 255 },
          last_changed: '2024-01-01T00:00:00.000Z',
          last_updated: '2024-01-01T00:05:00.000Z',
          context: { id: 'ctx-1', parent_id: null, user_id: null },
        },
        'light.hall': {
          entity_id: 'light.hall',
          state: 'on',
          attributes: { friendly_name: 'Hall Light', brightness: 200 },
          last_changed: '2024-01-01T00:00:00.000Z',
          last_updated: '2024-01-01T00:00:00.000Z',
          context: { id: 'ctx-2', parent_id: null, user_id: null },
        },
      },
    });

    const nextLights =
      integrationStore.getState().providerDeviceCollectionsByProviderId.home_assistant?.lights ??
      [];
    const nextKitchenLight = nextLights.find(
      (device) => device.canonicalId === 'home_assistant:light.kitchen'
    );
    const nextHallLight = nextLights.find(
      (device) => device.canonicalId === 'home_assistant:light.hall'
    );

    expect(nextLights).not.toBe(previousLights);
    expect(nextKitchenLight).not.toBe(previousKitchenLight);
    expect(nextHallLight).toBe(previousHallLight);
  });

  it('updates only the changed provider slice when Homey publishes a device update', async () => {
    await resetAppStores();

    homeAssistantStore.setState({
      connected: true,
      entities: {
        'light.kitchen': {
          entity_id: 'light.kitchen',
          state: 'on',
          attributes: { friendly_name: 'Kitchen Light', brightness: 255 },
          last_changed: '2024-01-01T00:00:00.000Z',
          last_updated: '2024-01-01T00:00:00.000Z',
          context: { id: 'ctx-ha', parent_id: null, user_id: null },
        },
      },
    });
    homeyService.replaceSnapshot({
      connected: true,
      zones: {
        living_room: { id: 'living_room', name: 'Living Room' },
      },
      devices: {
        'switch-1': {
          id: 'switch-1',
          name: 'Coffee Machine',
          class: 'socket',
          zone: 'living_room',
          capabilitiesObj: {
            onoff: { value: false },
          },
        },
      },
    });

    const previousState = integrationStore.getState();
    const previousHomeAssistantSlice = previousState.providerEntitiesByProviderId.home_assistant;
    const previousHomeAssistantEntity =
      previousState.providerEntitiesByCanonicalId['home_assistant:light.kitchen'];
    const previousHomeyEntity = previousState.providerEntitiesByCanonicalId['homey:switch-1'];
    const previousRoomDescriptors = previousState.roomDescriptors;

    homeyService.replaceSnapshot({
      connected: true,
      zones: {
        living_room: { id: 'living_room', name: 'Living Room' },
      },
      devices: {
        'switch-1': {
          id: 'switch-1',
          name: 'Coffee Machine',
          class: 'socket',
          zone: 'living_room',
          capabilitiesObj: {
            onoff: { value: true },
          },
        },
      },
    });

    const nextState = integrationStore.getState();

    expect(nextState.providerEntitiesByProviderId.home_assistant).toBe(previousHomeAssistantSlice);
    expect(nextState.providerEntitiesByCanonicalId['home_assistant:light.kitchen']).toBe(
      previousHomeAssistantEntity
    );
    expect(nextState.providerEntitiesByCanonicalId['homey:switch-1']).not.toBe(previousHomeyEntity);
    expect(nextState.roomDescriptors).toBe(previousRoomDescriptors);
  });
});
