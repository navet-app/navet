import { dispatchNavetCommand } from '@navet/app/commands';
import { homeAssistantStore } from '@navet/app/stores/home-assistant-store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invokeIntegrationNativeAction } from '../integration-native-action.service';

vi.mock('@navet/app/provider-contract-registry', () => ({
  getRegisteredProviderContract: (providerId: 'home_assistant' | 'homey' | 'openhab') => ({
    providerId,
    getState: () => ({
      providerId,
      connected: false,
      connecting: false,
      reconnecting: false,
      entitiesHydrated: false,
      registriesHydrated: false,
      error: null,
      entities: [],
      rooms: [],
    }),
    subscribeState: () => () => {},
  }),
  getRegisteredSmartHomeProviderAdapter: vi.fn(() => {
    throw new Error('preview runtime should not use the live provider adapter');
  }),
}));

vi.mock('@navet/app/provider-runtime-registry', () => ({
  getProviderRuntimeRegistration: vi.fn(() => ({
    nativeActionFeatureService: {
      invokeAction: vi.fn(() => {
        throw new Error('preview runtime should not invoke the live provider runtime');
      }),
    },
  })),
}));

describe('preview action bridge', () => {
  const originalPreviewRuntime = document.documentElement.dataset.navetPreviewRuntime;
  const originalStoreState = homeAssistantStore.getState();

  beforeEach(() => {
    document.documentElement.dataset.navetPreviewRuntime = 'storybook';
    homeAssistantStore.setState({
      ...originalStoreState,
      connected: true,
      entities: {
        'light.kitchen': {
          entity_id: 'light.kitchen',
          state: 'on',
          attributes: {
            friendly_name: 'Kitchen',
            brightness: 255,
          },
          last_changed: '2026-06-10T08:00:00.000Z',
          last_updated: '2026-06-10T08:00:00.000Z',
          context: { id: 'light-kitchen', parent_id: null, user_id: null },
        },
        'scene.movie_mode': {
          entity_id: 'scene.movie_mode',
          state: 'idle',
          attributes: {
            friendly_name: 'Movie Mode',
          },
          last_changed: '2026-06-10T08:00:00.000Z',
          last_updated: '2026-06-10T08:00:00.000Z',
          context: { id: 'scene-movie-mode', parent_id: null, user_id: null },
        },
      },
    });
  });

  afterEach(() => {
    if (originalPreviewRuntime) {
      document.documentElement.dataset.navetPreviewRuntime = originalPreviewRuntime;
    } else {
      delete document.documentElement.dataset.navetPreviewRuntime;
    }
    homeAssistantStore.setState(originalStoreState);
  });

  it('short-circuits provider command dispatch in preview runtime', async () => {
    const result = await dispatchNavetCommand({
      type: 'turn_off',
      entityId: 'light.kitchen',
    });

    expect(result).toEqual({
      accepted: true,
      requiresEventConfirmation: false,
    });
    expect(homeAssistantStore.getState().entities?.['light.kitchen']?.state).toBe('off');
  });

  it('handles service calls through preview state instead of the live integration runtime', async () => {
    await invokeIntegrationNativeAction({
      entityId: 'scene.movie_mode',
      domain: 'scene',
      service: 'turn_on',
    });

    expect(homeAssistantStore.getState().entities?.['scene.movie_mode']?.state).toBe('scening');
  });

  it('switches raw-only RGB fixtures to temperature mode after a temperature command', async () => {
    const entity = homeAssistantStore.getState().entities?.['light.kitchen'];
    if (!entity) throw new Error('Expected kitchen fixture');
    homeAssistantStore.setState({
      entities: { 'light.kitchen': { ...entity, attributes: { color_mode: 'rgb' } } },
    });
    await dispatchNavetCommand({
      type: 'set_color_temperature',
      entityId: 'light.kitchen',
      kelvin: 3000,
    });
    expect(homeAssistantStore.getState().entities?.['light.kitchen']?.attributes).toMatchObject({
      color_mode: 'color_temp',
      color_temp_kelvin: 3000,
    });
  });
  it.each(['open', 'close', 'open_cover', 'close_cover'] as const)(
    'updates the raw-only cover position after %s',
    async (action) => {
      const base = homeAssistantStore.getState().entities?.['light.kitchen'];
      if (!base) throw new Error('Expected kitchen fixture');
      homeAssistantStore.setState({
        entities: {
          'cover.kitchen': {
            ...base,
            entity_id: 'cover.kitchen',
            state: 'open',
            attributes: { current_position: 40 },
          },
        },
      });
      if (action === 'open' || action === 'close') {
        await dispatchNavetCommand({ type: action, entityId: 'cover.kitchen' });
      } else {
        await invokeIntegrationNativeAction({
          entityId: 'cover.kitchen',
          domain: 'cover',
          service: action,
        });
      }
      const opening = action === 'open' || action === 'open_cover';
      expect(homeAssistantStore.getState().entities?.['cover.kitchen']).toMatchObject({
        state: opening ? 'open' : 'closed',
        attributes: { current_position: opening ? 100 : 0 },
      });
    }
  );

  it('retains raw-only fixture updates for fan, vacuum and media commands', async () => {
    const base = homeAssistantStore.getState().entities?.['light.kitchen'];
    if (!base) throw new Error('Expected kitchen fixture');
    homeAssistantStore.setState({
      entities: {
        ...homeAssistantStore.getState().entities,
        'cover.kitchen': { ...base, entity_id: 'cover.kitchen', state: 'open', attributes: {} },
        'fan.office': { ...base, entity_id: 'fan.office', attributes: { percentage: 0 } },
        'vacuum.downstairs': {
          ...base,
          entity_id: 'vacuum.downstairs',
          state: 'docked',
          attributes: {},
        },
        'media_player.kitchen': {
          ...base,
          entity_id: 'media_player.kitchen',
          state: 'playing',
          attributes: { volume_level: 0.4, is_volume_muted: false, group_members: [] },
        },
      },
    });
    await invokeIntegrationNativeAction({
      entityId: 'cover.kitchen',
      domain: 'cover',
      service: 'turn_off',
    });
    expect(homeAssistantStore.getState().entities?.['cover.kitchen']?.state).toBe('closed');
    await dispatchNavetCommand({ type: 'set_fan_speed', entityId: 'fan.office', percentage: 65 });
    expect(homeAssistantStore.getState().entities?.['fan.office']).toMatchObject({
      state: 'on',
      attributes: { percentage: 65 },
    });
    await dispatchNavetCommand({ type: 'start', entityId: 'vacuum.downstairs' });
    expect(homeAssistantStore.getState().entities?.['vacuum.downstairs']?.state).toBe('cleaning');
    await dispatchNavetCommand({ type: 'stop', entityId: 'vacuum.downstairs' });
    expect(homeAssistantStore.getState().entities?.['vacuum.downstairs']?.state).toBe('idle');
    await dispatchNavetCommand({ type: 'play_pause', entityId: 'media_player.kitchen' });
    await dispatchNavetCommand({
      type: 'join_group',
      entityId: 'media_player.kitchen',
      members: ['media_player.living_room'],
    });
    await invokeIntegrationNativeAction({
      entityId: 'media_player.kitchen',
      domain: 'media_player',
      service: 'volume_set',
      serviceData: { volume_level: 0.3 },
    });
    expect(homeAssistantStore.getState().entities?.['media_player.kitchen']).toMatchObject({
      state: 'paused',
      attributes: { volume_level: 0.3, group_members: ['media_player.living_room'] },
    });
  });

  it('preserves accepted no-ops for missing targets and unsupported preview commands', async () => {
    const before = homeAssistantStore.getState().entities;
    expect(await dispatchNavetCommand({ type: 'turn_off', entityId: 'light.absent' })).toEqual({
      accepted: true,
      requiresEventConfirmation: false,
    });
    expect(await dispatchNavetCommand({ type: 'timer_finish', entityId: 'light.kitchen' })).toEqual(
      { accepted: true, requiresEventConfirmation: false }
    );
    expect(homeAssistantStore.getState().entities).toEqual(before);
  });
});
