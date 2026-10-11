import { advancedClimateEntityFactory } from '@navet/app/test/fixtures/home-assistant/entities/advanced-climate';
import { householdControlEntityFactory } from '@navet/app/test/fixtures/home-assistant/entities/household-controls';
import { writableHelperEntities } from '@navet/app/test/fixtures/home-assistant/entities/writable-helper';
import { createProviderScopedId } from '@navet/core/ids';
import type { NavetCommand } from '@navet/core/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createHomeAssistantContractAdapter,
  createHomeAssistantProviderContract,
} from './homeassistant-adapter';
import {
  configureHomeAssistantServiceBridge,
  type HomeAssistantServiceBridge,
} from './homeassistant-service-bridge';

function lightEntityFactory() {
  return {
    entity_id: 'light.kitchen',
    state: 'on',
    attributes: {
      friendly_name: 'Kitchen Light',
      brightness: 128,
      supported_color_modes: ['brightness'],
    },
    last_changed: '2026-05-30T10:00:00.000Z',
    last_updated: '2026-05-30T10:00:00.000Z',
    context: { id: 'ctx-1', parent_id: null, user_id: null },
  };
}

function alarmEntityFactory() {
  return {
    entity_id: 'alarm_control_panel.home',
    state: 'disarmed',
    attributes: {
      friendly_name: 'Home Alarm',
      supported_features: 1,
    },
    last_changed: '2026-05-30T10:00:00.000Z',
    last_updated: '2026-05-30T10:00:00.000Z',
    context: { id: 'ctx-2', parent_id: null, user_id: null },
  };
}

function vacuumEntityFactory() {
  return {
    entity_id: 'vacuum.roborock',
    state: 'idle',
    attributes: {
      friendly_name: 'Roborock',
      supported_features: 4 | 16 | 32 | 512 | 1024 | 8192 | 16384,
    },
    last_changed: '2026-05-30T10:00:00.000Z',
    last_updated: '2026-05-30T10:00:00.000Z',
    context: { id: 'ctx-3', parent_id: null, user_id: null },
  };
}

function lawnMowerEntityFactory() {
  return {
    entity_id: 'lawn_mower.backyard',
    state: 'docked',
    attributes: {
      friendly_name: 'Backyard Mower',
      supported_features: 1 | 2 | 4,
    },
    last_changed: '2026-05-30T10:00:00.000Z',
    last_updated: '2026-05-30T10:00:00.000Z',
    context: { id: 'ctx-4', parent_id: null, user_id: null },
  };
}

function mediaPlayerEntityFactory(state: 'playing' | 'paused' = 'playing') {
  return {
    entity_id: 'media_player.spotify',
    state,
    attributes: {
      friendly_name: 'Spotify',
      supported_features: 1 | 4 | 8 | 512 | 16384,
    },
    last_changed: '2026-05-30T10:00:00.000Z',
    last_updated: '2026-05-30T10:00:00.000Z',
    context: { id: 'ctx-5', parent_id: null, user_id: null },
  };
}

const { callHomeAssistantServiceMock, resolveArtworkMock } = vi.hoisted(() => ({
  callHomeAssistantServiceMock: vi.fn(async () => undefined),
  resolveArtworkMock: vi.fn(async (entityId: string) => ({
    id: entityId,
    kind: 'image' as const,
    cacheKey: entityId,
    authStrategy: 'none' as const,
  })),
}));

describe('homeassistant-adapter', () => {
  const getConnectionMock = vi.fn<HomeAssistantServiceBridge['getConnection']>(() => null);
  const connectMock = vi.fn(async () => undefined);
  const disconnectMock = vi.fn(async () => undefined);
  const syncPanelHassMock = vi.fn();
  let currentMediaPlayerState: 'playing' | 'paused' = 'playing';

  beforeEach(() => {
    getConnectionMock.mockReset();
    getConnectionMock.mockReturnValue(null);
    callHomeAssistantServiceMock.mockReset();
    resolveArtworkMock.mockReset();
    connectMock.mockReset();
    disconnectMock.mockReset();
    syncPanelHassMock.mockReset();
    currentMediaPlayerState = 'playing';
    configureHomeAssistantServiceBridge({
      callApi: vi.fn(async () => []) as unknown as HomeAssistantServiceBridge['callApi'],
      callService: callHomeAssistantServiceMock,
      signPath: vi.fn(async (path: string) => ({ path })),
      getCameraStreamUrl: vi.fn(async () => ({ url: '/stream' })),
      getCameraStreamPaths: vi.fn(async () => ({})),
      addListener: vi.fn(() => () => {}),
      isConnected: vi.fn(() => true),
      getPanelHass: vi.fn(() => null),
      getConnection: getConnectionMock,
      sendWebSocketBinary: vi.fn(),
      getEntities: vi.fn(() => ({
        ...writableHelperEntities,
        'climate.living_room': advancedClimateEntityFactory(),
        'light.kitchen': lightEntityFactory(),
        'alarm_control_panel.home': alarmEntityFactory(),
        'vacuum.roborock': vacuumEntityFactory(),
        'lawn_mower.backyard': lawnMowerEntityFactory(),
        'media_player.spotify': mediaPlayerEntityFactory(currentMediaPlayerState),
      })),
      getEntityRegistry: vi.fn(() => []),
      getConfig: vi.fn(() => null),
      updateLight: vi.fn(async () => undefined),
      playMedia: vi.fn(async () => undefined),
      browseMediaPlayer: vi.fn(async () => ({ title: 'Media' })),
      searchMediaPlayer: vi.fn(async () => ({ title: 'Media' })),
      selectMediaPlayerSource: vi.fn(async () => undefined),
      selectMediaPlayerSoundMode: vi.fn(async () => undefined),
      seekMediaPlayer: vi.fn(async () => undefined),
      clearMediaPlayerPlaylist: vi.fn(async () => undefined),
      updateMediaPlayerPower: vi.fn(async () => undefined),
      sendRemoteCommand: vi.fn(async () => undefined),
      browseMediaSource: vi.fn(async () => ({ title: 'Media' })),
      resolveMediaSource: vi.fn(async () => ({ url: '/media', mime_type: 'image/jpeg' })),
      getAutomationConfig: vi.fn(async () => ({ config: {} })),
      getCameraCapabilities: vi.fn(async () => ({ frontend_stream_types: [] })),
      enableCameraMotionDetection: vi.fn(async () => undefined),
      disableCameraMotionDetection: vi.fn(async () => undefined),
      getWebRtcClientConfiguration: vi.fn(async () => ({})),
      subscribeCameraWebRtcOffer: vi.fn(async () => () => {}),
      addCameraWebRtcCandidate: vi.fn(async () => undefined),
      createArea: vi.fn(async () => ({ area_id: 'kitchen', name: 'Kitchen' })),
      updateAreaName: vi.fn(async (areaId: string, name: string) => ({
        area_id: areaId,
        name,
      })),
      updateEntityArea: vi.fn(async () => undefined),
      updateEntityName: vi.fn(async () => undefined),
      deleteArea: vi.fn(async () => undefined),
      resolveArtwork: resolveArtworkMock,
      resolveProxyUrl: vi.fn((resourceUrl: string) => resourceUrl),
      getCameraPlaybackPlan: vi.fn(async () => ({ mode: 'snapshot' })),
      resolveCameraStreamResource: vi.fn(async (entityId: string) => ({
        id: entityId,
        kind: 'unavailable' as const,
        cacheKey: entityId,
        authStrategy: 'none' as const,
      })),
      getStoreState: vi.fn(() => ({
        connected: true,
        connecting: false,
        reconnecting: false,
        error: null,
        entities: {
          ...writableHelperEntities,
          ...Object.fromEntries(
            (['timer', 'counter', 'valve', 'remote'] as const).map((domain) => {
              const entity = householdControlEntityFactory(domain);
              return [entity.entity_id, entity];
            })
          ),
          'climate.living_room': advancedClimateEntityFactory(),
          'light.kitchen': lightEntityFactory(),
          'alarm_control_panel.home': alarmEntityFactory(),
          'vacuum.roborock': vacuumEntityFactory(),
          'lawn_mower.backyard': lawnMowerEntityFactory(),
          'media_player.spotify': mediaPlayerEntityFactory(currentMediaPlayerState),
        },
        config: null,
        areas: [],
        deviceRegistry: [],
        entityRegistry: [],
        registriesHydrated: true,
        syncPanelHass: syncPanelHassMock,
        connect: connectMock,
        disconnect: disconnectMock,
      })),
      subscribeStore: vi.fn(() => () => {}),
    });
  });

  it('rejects commands when the household changes during command loading', async () => {
    const previousConnection = { sendMessagePromise: vi.fn() };
    const replacementConnection = { sendMessagePromise: vi.fn() };
    getConnectionMock
      .mockReturnValueOnce(previousConnection)
      .mockReturnValue(replacementConnection);
    const adapter = createHomeAssistantContractAdapter();

    await expect(adapter.execute({ type: 'turn_on', entityId: 'light.kitchen' })).rejects.toThrow(
      'Home Assistant session changed'
    );
    expect(callHomeAssistantServiceMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      { type: 'timer_start', entityId: 'home_assistant:timer.household', durationSeconds: 90 },
      'timer',
      'start',
      { duration: 90 },
    ],
    [
      { type: 'counter_increment', entityId: 'home_assistant:counter.household' },
      'counter',
      'increment',
      {},
    ],
    [
      { type: 'set_position', entityId: 'home_assistant:valve.household', position: 50 },
      'valve',
      'set_valve_position',
      { position: 50 },
    ],
    [{ type: 'turn_on', entityId: 'home_assistant:remote.household' }, 'remote', 'turn_on', {}],
  ] as const)(
    'routes normalized household control %j to its owner with event confirmation',
    async (command, domain, service, data) => {
      const adapter = createHomeAssistantContractAdapter();
      await expect(adapter.execute(command as NavetCommand)).resolves.toMatchObject({
        accepted: true,
        requiresEventConfirmation: true,
      });
      expect(callHomeAssistantServiceMock).toHaveBeenCalledWith(domain, service, data, {
        entityId: `${domain}.household`,
      });
    }
  );
  it('rejects explicit zero timer duration before transport but retains the default start', async () => {
    const adapter = createHomeAssistantContractAdapter();
    await expect(
      adapter.execute({
        type: 'timer_start',
        entityId: 'home_assistant:timer.household',
        durationSeconds: 0,
      })
    ).rejects.toThrow();
    expect(callHomeAssistantServiceMock).not.toHaveBeenCalled();
    await expect(
      adapter.execute({ type: 'timer_start', entityId: 'home_assistant:timer.household' })
    ).resolves.toMatchObject({ accepted: true });
    expect(callHomeAssistantServiceMock).toHaveBeenCalledWith(
      'timer',
      'start',
      {},
      { entityId: 'timer.household' }
    );
  });
  it('rejects wrong-owner and incompatible household commands without service writes', async () => {
    const adapter = createHomeAssistantContractAdapter();
    await expect(
      adapter.execute({ type: 'timer_start', entityId: 'homey:timer.household' })
    ).rejects.toThrow();
    await expect(
      adapter.execute({ type: 'turn_on', entityId: 'timer.household' })
    ).rejects.toThrow();
    await expect(
      adapter.execute({ type: 'set_position', entityId: 'light.kitchen', position: 50 })
    ).rejects.toThrow();
    expect(callHomeAssistantServiceMock).not.toHaveBeenCalled();
  });
  it('preserves household transport failures for recovery', async () => {
    const adapter = createHomeAssistantContractAdapter();
    callHomeAssistantServiceMock.mockRejectedValueOnce(new Error('Device did not respond'));
    await expect(
      adapter.execute({ type: 'counter_reset', entityId: 'counter.household' })
    ).rejects.toThrow('Device did not respond');
    await expect(
      adapter.execute({ type: 'counter_reset', entityId: 'counter.household' })
    ).resolves.toMatchObject({ accepted: true, requiresEventConfirmation: true });
  });

  it('routes advanced climate commands to the owning entity with event confirmation', async () => {
    const adapter = createHomeAssistantContractAdapter();
    await expect(
      adapter.execute({
        type: 'set_climate_fan_mode',
        entityId: 'home_assistant:climate.living_room',
        mode: 'quiet',
      })
    ).resolves.toMatchObject({ accepted: true, requiresEventConfirmation: true });
    expect(callHomeAssistantServiceMock).toHaveBeenCalledWith(
      'climate',
      'set_fan_mode',
      { fan_mode: 'quiet' },
      { entityId: 'climate.living_room' }
    );
    callHomeAssistantServiceMock.mockClear();
    await expect(
      adapter.execute({
        type: 'set_climate_humidity',
        entityId: 'climate.living_room',
        humidity: 101,
      })
    ).rejects.toThrow();
    await expect(
      adapter.execute({ type: 'set_climate_fan_mode', entityId: 'light.kitchen', mode: 'quiet' })
    ).rejects.toThrow();
    expect(callHomeAssistantServiceMock).not.toHaveBeenCalled();
  });

  it('executes helper commands against the owning entity and rejects incompatible toggles', async () => {
    const adapter = createHomeAssistantContractAdapter();
    await expect(
      adapter.execute({
        type: 'set_number_value',
        entityId: 'home_assistant:input_number.target',
        value: 22,
      })
    ).resolves.toMatchObject({ accepted: true, requiresEventConfirmation: true });
    expect(callHomeAssistantServiceMock).toHaveBeenCalledWith(
      'input_number',
      'set_value',
      { value: 22 },
      { entityId: 'input_number.target' }
    );
    callHomeAssistantServiceMock.mockClear();
    await expect(
      adapter.execute({ type: 'set_number_value', entityId: 'input_number.target', value: 31 })
    ).rejects.toThrow();
    await expect(
      adapter.execute({ type: 'turn_on', entityId: 'input_number.target' })
    ).rejects.toThrow();
    expect(callHomeAssistantServiceMock).not.toHaveBeenCalled();
  });

  it('maps provider-neutral color temperature commands to color_temp_kelvin', async () => {
    const adapter = createHomeAssistantContractAdapter();

    await adapter.execute({
      type: 'set_color_temperature',
      entityId: createProviderScopedId('home_assistant', 'light.kitchen'),
      kelvin: 3200,
    });

    expect(callHomeAssistantServiceMock).toHaveBeenCalledWith(
      'light',
      'turn_on',
      { color_temp_kelvin: 3200 },
      { entityId: 'light.kitchen' }
    );
  });

  it('maps provider-neutral alarm commands to Home Assistant alarm services', async () => {
    const adapter = createHomeAssistantContractAdapter();

    await adapter.execute({
      type: 'arm_away',
      entityId: createProviderScopedId('home_assistant', 'alarm_control_panel.home'),
      code: '1234',
    });

    expect(callHomeAssistantServiceMock).toHaveBeenCalledWith(
      'alarm_control_panel',
      'alarm_arm_away',
      { code: '1234' },
      { entityId: 'alarm_control_panel.home' }
    );
  });

  it('maps provider-neutral vacuum commands to the documented Home Assistant services', async () => {
    const adapter = createHomeAssistantContractAdapter();

    await adapter.execute({
      type: 'pause',
      entityId: createProviderScopedId('home_assistant', 'vacuum.roborock'),
    });
    await adapter.execute({
      type: 'locate',
      entityId: createProviderScopedId('home_assistant', 'vacuum.roborock'),
    });
    await adapter.execute({
      type: 'clean_spot',
      entityId: createProviderScopedId('home_assistant', 'vacuum.roborock'),
    });

    expect(callHomeAssistantServiceMock).toHaveBeenNthCalledWith(
      1,
      'vacuum',
      'pause',
      {},
      { entityId: 'vacuum.roborock' }
    );
    expect(callHomeAssistantServiceMock).toHaveBeenNthCalledWith(
      2,
      'vacuum',
      'locate',
      {},
      { entityId: 'vacuum.roborock' }
    );
    expect(callHomeAssistantServiceMock).toHaveBeenNthCalledWith(
      3,
      'vacuum',
      'clean_spot',
      {},
      { entityId: 'vacuum.roborock' }
    );
  });

  it('maps provider-neutral vacuum fan-speed commands to vacuum.set_fan_speed', async () => {
    const adapter = createHomeAssistantContractAdapter();

    await adapter.execute({
      type: 'set_vacuum_fan_speed',
      entityId: createProviderScopedId('home_assistant', 'vacuum.roborock'),
      fanSpeed: 'turbo',
    });

    expect(callHomeAssistantServiceMock).toHaveBeenCalledWith(
      'vacuum',
      'set_fan_speed',
      { fan_speed: 'turbo' },
      { entityId: 'vacuum.roborock' }
    );
  });

  it('maps provider-neutral vacuum area-cleaning commands to vacuum.clean_area', async () => {
    const adapter = createHomeAssistantContractAdapter();

    await adapter.execute({
      type: 'clean_vacuum_areas',
      entityId: createProviderScopedId('home_assistant', 'vacuum.roborock'),
      areaIds: ['kitchen', 'hallway'],
    });

    expect(callHomeAssistantServiceMock).toHaveBeenCalledWith(
      'vacuum',
      'clean_area',
      { cleaning_area_id: ['kitchen', 'hallway'] },
      { entityId: 'vacuum.roborock' }
    );
  });

  it('maps mower start, pause, and return-home commands to lawn_mower services', async () => {
    const adapter = createHomeAssistantContractAdapter();

    await adapter.execute({
      type: 'start',
      entityId: createProviderScopedId('home_assistant', 'lawn_mower.backyard'),
    });
    await adapter.execute({
      type: 'pause',
      entityId: createProviderScopedId('home_assistant', 'lawn_mower.backyard'),
    });
    await adapter.execute({
      type: 'return_home',
      entityId: createProviderScopedId('home_assistant', 'lawn_mower.backyard'),
    });

    expect(callHomeAssistantServiceMock).toHaveBeenNthCalledWith(
      1,
      'lawn_mower',
      'start_mowing',
      {},
      { entityId: 'lawn_mower.backyard' }
    );
    expect(callHomeAssistantServiceMock).toHaveBeenNthCalledWith(
      2,
      'lawn_mower',
      'pause',
      {},
      { entityId: 'lawn_mower.backyard' }
    );
    expect(callHomeAssistantServiceMock).toHaveBeenNthCalledWith(
      3,
      'lawn_mower',
      'dock',
      {},
      { entityId: 'lawn_mower.backyard' }
    );
  });

  it('maps media playback toggles to explicit Home Assistant play and pause services', async () => {
    const adapter = createHomeAssistantContractAdapter();

    await adapter.execute({
      type: 'play_pause',
      entityId: createProviderScopedId('home_assistant', 'media_player.spotify'),
    });

    currentMediaPlayerState = 'paused';

    await adapter.execute({
      type: 'play_pause',
      entityId: createProviderScopedId('home_assistant', 'media_player.spotify'),
    });

    expect(callHomeAssistantServiceMock).toHaveBeenNthCalledWith(
      1,
      'media_player',
      'media_pause',
      {},
      { entityId: 'media_player.spotify' }
    );
    expect(callHomeAssistantServiceMock).toHaveBeenNthCalledWith(
      2,
      'media_player',
      'media_play',
      {},
      { entityId: 'media_player.spotify' }
    );
  });

  it('rejects vacuum-only commands for lawn mower entities', async () => {
    const adapter = createHomeAssistantContractAdapter();

    await expect(
      adapter.execute({
        type: 'stop',
        entityId: createProviderScopedId('home_assistant', 'lawn_mower.backyard'),
      })
    ).rejects.toThrow('Provider command is not supported yet: stop');
    await expect(
      adapter.execute({
        type: 'locate',
        entityId: createProviderScopedId('home_assistant', 'lawn_mower.backyard'),
      })
    ).rejects.toThrow('Provider command is not supported yet: locate');
    await expect(
      adapter.execute({
        type: 'clean_spot',
        entityId: createProviderScopedId('home_assistant', 'lawn_mower.backyard'),
      })
    ).rejects.toThrow('Provider command is not supported yet: clean_spot');
    await expect(
      adapter.execute({
        type: 'set_vacuum_fan_speed',
        entityId: createProviderScopedId('home_assistant', 'lawn_mower.backyard'),
        fanSpeed: 'turbo',
      })
    ).rejects.toThrow('Provider command is not supported yet: set_vacuum_fan_speed');
    await expect(
      adapter.execute({
        type: 'clean_vacuum_areas',
        entityId: createProviderScopedId('home_assistant', 'lawn_mower.backyard'),
        areaIds: ['front_lawn'],
      })
    ).rejects.toThrow('Provider command is not supported yet: clean_vacuum_areas');

    expect(callHomeAssistantServiceMock).not.toHaveBeenCalled();
  });

  it('resolves primary_image resources through the Home Assistant artwork resolver', async () => {
    const contract = createHomeAssistantProviderContract();
    expect(contract.resolveResource).toBeDefined();
    const resolveResource = contract.resolveResource;
    if (!resolveResource) {
      throw new Error('Expected resolveResource to be defined');
    }

    const result = await resolveResource({
      deviceId: 'home_assistant:person.vishal',
      providerId: 'home_assistant',
      kind: 'primary_image',
      attrs: {
        entity_picture: '/api/image/serve/person-vishal/512x512',
      },
      fallbackPicture: '/api/image/serve/person-vishal/fallback',
    });

    expect(resolveArtworkMock).toHaveBeenCalledWith(
      'person.vishal',
      {
        entity_picture: '/api/image/serve/person-vishal/512x512',
      },
      '/api/image/serve/person-vishal/fallback'
    );
    expect(result).toMatchObject({
      id: 'person.vishal',
      kind: 'image',
    });
  });

  it('attaches the parent Home Assistant runtime bridge without opening a second connection', () => {
    const contract = createHomeAssistantProviderContract();
    const parentHass = {
      states: { 'light.kitchen': lightEntityFactory() },
      config: { location_name: 'Parent Home' },
      connection: {
        sendMessagePromise: vi.fn(async () => ({ ok: true })),
        subscribeMessage: vi.fn(async () => vi.fn()),
      },
      callService: vi.fn(async () => undefined),
      callWS: vi.fn(async () => ({ ok: true })),
    };

    contract.attachRuntimeBridge?.(parentHass as never);

    expect(syncPanelHassMock).toHaveBeenCalledWith(parentHass);
    expect(connectMock).not.toHaveBeenCalled();
  });
});
