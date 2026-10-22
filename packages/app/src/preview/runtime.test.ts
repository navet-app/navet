import { dispatchEntityCommand } from '@navet/app/commands';
import { getProviderRuntimeRegistration } from '@navet/app/provider-runtime-registry';
import { integrationStore } from '@navet/app/stores/integration-store';
import { afterEach, describe, expect, it } from 'vitest';
import { maybeHandlePreviewServiceCall } from './preview-action-bridge';
import {
  createPreviewLightEntity,
  getPreviewDeviceCollection,
  getPreviewHomeAssistantCompatibilityState,
  getPreviewRuntimeScenario,
  installPreviewRuntime,
  resetPreviewRuntime,
  withPreviewEntities,
} from './runtime';

describe('preview runtime', () => {
  afterEach(() => {
    resetPreviewRuntime();
    delete document.documentElement.dataset.navetPreviewRuntime;
  });

  it('hydrates the integration store from the preview scenario', () => {
    installPreviewRuntime(getPreviewRuntimeScenario('default'));

    const state = integrationStore.getState();
    const helperCollection = state.providerDeviceCollectionsByProviderId.home_assistant?.helpers;

    expect(state.currentProviderId).toBe('home_assistant');
    expect(state.selectedProviderIds).toEqual(['home_assistant']);
    expect(helperCollection).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'home_assistant:input_boolean.guest_mode',
        }),
      ])
    );
  });

  it('routes provider commands through the preview adapter', async () => {
    installPreviewRuntime(getPreviewRuntimeScenario('default'));

    const adapter = getProviderRuntimeRegistration('home_assistant').providerContractAdapter;

    await adapter.execute({
      type: 'turn_off',
      entityId: 'home_assistant:light.living_room',
    });

    const nextEntity =
      integrationStore.getState().providerEntitiesByProviderId.home_assistant?.[
        'home_assistant:light.living_room'
      ];

    expect(nextEntity?.primaryState).toBe('off');
    expect(nextEntity?.attributes.value).toBe('off');
  });

  it('keeps normalized brightness and compatibility snapshots aligned after acknowledged edits', async () => {
    document.documentElement.dataset.navetPreviewRuntime = 'storybook';
    const base = getPreviewRuntimeScenario('default');
    const plant = createPreviewLightEntity('light.kitchen_plants', { brightnessPct: 48 });
    installPreviewRuntime(withPreviewEntities(base, [...base.entities, plant]));
    const runtime = getProviderRuntimeRegistration('home_assistant');
    expect(
      runtime.entityRuntimeService?.getEntitySnapshot?.('light.kitchen_island')?.attributes
        .brightness_pct
    ).toBe(72);
    const result = await dispatchEntityCommand({
      type: 'set_brightness',
      entityId: 'home_assistant:light.kitchen_plants',
      brightness: 47,
    });
    expect(result.accepted).toBe(true);
    expect(
      integrationStore.getState().providerEntitiesByCanonicalId[
        'home_assistant:light.kitchen_plants'
      ]?.attributes.brightnessPct
    ).toBe(47);
    expect(
      runtime.entityRuntimeService?.getEntitySnapshot?.('light.kitchen_plants')?.attributes
        .brightness_pct
    ).toBe(47);
    expect(plant.attributes.brightnessPct).toBe(48);
    resetPreviewRuntime();
    installPreviewRuntime(base);
    expect(
      getProviderRuntimeRegistration('home_assistant').entityRuntimeService?.getEntitySnapshot?.(
        'light.kitchen_plants'
      )
    ).toBeUndefined();
  });

  it('keeps installed preview playback and volume actions aligned across readers', async () => {
    document.documentElement.dataset.navetPreviewRuntime = 'storybook';
    installPreviewRuntime(getPreviewRuntimeScenario('default'));
    const entityId = 'home_assistant:media_player.living_room_speaker';
    const readEntity = () => integrationStore.getState().providerEntitiesByCanonicalId[entityId];
    const readSnapshot = () =>
      getPreviewHomeAssistantCompatibilityState()?.entities?.['media_player.living_room_speaker'];

    await dispatchEntityCommand({ type: 'play_pause', entityId });
    expect(readEntity()?.primaryState).toBe('paused');
    expect(readSnapshot()?.state).toBe('paused');
    await dispatchEntityCommand({ type: 'set_volume', entityId, volume: 27 });
    expect(readEntity()?.attributes.volume).toBe(27);
    expect(readSnapshot()?.attributes.volume_level).toBe(0.27);
    await maybeHandlePreviewServiceCall({
      entityId,
      domain: 'media_player',
      service: 'volume_mute',
      serviceData: { is_volume_muted: true },
    });
    expect(readEntity()?.attributes.isMuted).toBe(true);
    expect(readSnapshot()?.attributes.is_volume_muted).toBe(true);
  });

  it('keeps missing targets and unsupported installed commands as accepted no-ops', async () => {
    document.documentElement.dataset.navetPreviewRuntime = 'demo';
    installPreviewRuntime(getPreviewRuntimeScenario('default'));
    const before = integrationStore.getState().providerEntitiesByCanonicalId;
    expect(
      await dispatchEntityCommand({ type: 'turn_off', entityId: 'home_assistant:light.absent' })
    ).toEqual({ accepted: true, requiresEventConfirmation: false });
    expect(
      await dispatchEntityCommand({
        type: 'timer_finish',
        entityId: 'home_assistant:light.living_room',
      })
    ).toEqual({ accepted: true, requiresEventConfirmation: false });
    expect(integrationStore.getState().providerEntitiesByCanonicalId).toEqual(before);
  });

  it('provides deterministic media browsing for isolated previews', async () => {
    installPreviewRuntime(getPreviewRuntimeScenario('default'));

    const mediaService = getProviderRuntimeRegistration('home_assistant').mediaFeatureService;
    const library = await mediaService?.browseMediaPlayer('media_player.living_room_speaker');
    const recentlyPlayed = await mediaService?.browseMediaPlayer(
      'media_player.living_room_speaker',
      { mediaContentId: 'preview:recently-played', mediaContentType: 'track' }
    );

    expect(library?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Recently played', canExpand: true }),
      ])
    );
    expect(recentlyPlayed?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Olalla',
          artist: 'Blanco White',
          album: 'On the Other Side',
        }),
      ])
    );
  });

  it('exposes supported preview capabilities for compact device controls', () => {
    const entities = getPreviewRuntimeScenario('demo').entities;
    expect(
      entities.find((entity) => entity.externalId === 'light.kitchen_island')?.capabilities
    ).toEqual(expect.arrayContaining(['toggle', 'brightness']));
    expect(
      entities.find((entity) => entity.externalId === 'climate.main_floor')?.capabilities
    ).toContain('temperature_setpoint');
    const media = entities.find(
      (entity) => entity.externalId === 'media_player.living_room_speaker'
    );
    expect(media?.capabilities).toContain('media_playback');
    expect(media?.attributes.mediaCapabilities).toMatchObject({
      canPlay: true,
      canPause: true,
      canNextTrack: true,
    });
  });

  it('serves upcoming demo calendar events through the same feature service as the panel', async () => {
    installPreviewRuntime(getPreviewRuntimeScenario('demo'));
    const calendar = getProviderRuntimeRegistration('home_assistant').calendarFeatureService;
    expect(calendar?.getCapabilities?.('calendar.home')).toEqual({
      canCreate: false,
      available: true,
    });
    const events = await calendar?.getEvents('calendar.home');
    expect(events?.[0]).toMatchObject({ title: 'School pickup' });
    expect(Date.parse(String(events?.[0].start))).toBeGreaterThan(Date.now());
    expect(await calendar?.getEvents('calendar.removed')).toEqual([]);
  });

  it('retains a demo temperature adjustment in the provider snapshot', async () => {
    installPreviewRuntime(getPreviewRuntimeScenario('demo'));
    const climate = getProviderRuntimeRegistration('home_assistant').climateFeatureService;
    expect(climate).toBeDefined();
    if (!climate) throw new Error('Expected preview climate service');
    await climate.setTargetTemperature('climate.main_floor', {
      serviceDomain: 'climate',
      temperature: 22.5,
    });
    const entity =
      integrationStore.getState().providerEntitiesByProviderId.home_assistant?.[
        'home_assistant:climate.main_floor'
      ];
    expect(entity?.attributes.temperature).toBe(22.5);
    expect(entity?.attributes.currentTemperature).toBe(21);
  });

  it('provides artwork for the featured demo media card', () => {
    const devices = getPreviewDeviceCollection(getPreviewRuntimeScenario('demo'));
    const featuredSpeaker = devices.media.find((device) =>
      device.id.endsWith('media_player.living_room_speaker')
    );

    expect(featuredSpeaker?.entityPicture).toContain('artworks-original');
  });

  it('provides staggered security history for realistic activity previews', async () => {
    installPreviewRuntime(getPreviewRuntimeScenario('demo'));

    const historyService = getProviderRuntimeRegistration('home_assistant').historyFeatureService;
    const histories = await historyService?.getEntityHistories?.({
      entityIds: ['binary_sensor.driveway_motion', 'lock.front_door', 'sensor.temperature'],
      startTime: '2026-08-25T10:00:00.000Z',
      endTime: '2026-08-25T12:00:00.000Z',
    });

    expect(histories).toEqual([
      {
        entityId: 'binary_sensor.driveway_motion',
        points: [
          { state: 'off', changedAt: '2026-08-25T11:50:00.000Z' },
          { state: 'on', changedAt: '2026-08-25T11:52:00.000Z' },
        ],
      },
      {
        entityId: 'lock.front_door',
        points: [
          { state: 'unlocked', changedAt: '2026-08-25T10:38:00.000Z' },
          { state: 'locked', changedAt: '2026-08-25T10:48:00.000Z' },
        ],
      },
      { entityId: 'sensor.temperature', points: [] },
    ]);
  });
});
