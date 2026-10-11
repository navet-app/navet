import { integrationReloadFixture } from '@navet/app/test/fixtures/home-assistant/integration-reload';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callService: vi.fn(),
  getRegistry: vi.fn(),
  getState: vi.fn(),
  getConnection: vi.fn(),
  sendMessage: vi.fn(),
  subscribeStore: vi.fn(),
  subscribeMessage: vi.fn(),
  liveRegistry: vi.fn(),
}));
vi.mock('./homeassistant-service-bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./homeassistant-service-bridge')>()),
  callHomeAssistantService: mocks.callService,
  getHomeAssistantEntityRegistry: mocks.getRegistry,
  getHomeAssistantStoreState: mocks.getState,
  getHomeAssistantConnection: mocks.getConnection,
  subscribeHomeAssistantStore: mocks.subscribeStore,
}));

import { homeAssistantAdminFeatureService as service } from './homeassistant-admin-feature.service';

// Keep: recovery payload, permissions and unavailable-entity behavior at the adapter boundary.
describe('Home Assistant integration reload', () => {
  const cleanups: (() => void)[] = [];
  let events: Record<string, (event: unknown) => void>;
  let storeListeners: Set<() => void>;
  let backendCleanups: ReturnType<typeof vi.fn>[];
  async function watchAvailability() {
    cleanups.push(service.subscribeEntityIntegrationReload('light.kitchen', () => {}));
    await vi.waitFor(() => expect(service.canReloadEntityIntegration('light.kitchen')).toBe(true));
  }
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getState.mockReturnValue({ connected: true, user: { is_admin: true } });
    mocks.getRegistry.mockReturnValue([integrationReloadFixture.registryEntry]);
    mocks.liveRegistry.mockReturnValue([integrationReloadFixture.registryEntry]);
    mocks.callService.mockResolvedValue(undefined);
    events = {};
    storeListeners = new Set();
    backendCleanups = [];
    mocks.getConnection.mockReturnValue({
      sendMessagePromise: mocks.sendMessage,
      subscribeMessage: mocks.subscribeMessage,
    });
    mocks.subscribeStore.mockImplementation((listener) => {
      storeListeners.add(listener);
      return () => storeListeners.delete(listener);
    });
    mocks.subscribeMessage.mockImplementation(async (listener, message) => {
      events[message.event_type ?? message.type] = listener;
      const cleanup = vi.fn();
      backendCleanups.push(cleanup);
      return cleanup;
    });
    mocks.sendMessage.mockImplementation(async (message) => {
      if (message.type === 'config/entity_registry/get') {
        const entry = mocks
          .liveRegistry()
          .find((entry: { entity_id: string }) => entry.entity_id === message.entity_id);
        if (!entry) throw new Error('Integration reload is unavailable for this entity');
        return entry;
      }
      return { config_entry: integrationReloadFixture.configEntry };
    });
  });

  it.each([false, null, undefined])(
    'keeps unsupported unload %s hidden after resolving availability',
    async (supportsUnload) => {
      mocks.sendMessage
        .mockResolvedValueOnce(integrationReloadFixture.registryEntry)
        .mockResolvedValue({
          config_entry: {
            ...integrationReloadFixture.configEntry,
            supports_unload: supportsUnload,
          },
        });
      const notify = vi.fn();
      cleanups.push(service.subscribeEntityIntegrationReload('light.kitchen', notify));
      expect(service.canReloadEntityIntegration('light.kitchen')).toBe(false);
      await vi.waitFor(() => expect(notify).toHaveBeenCalled());
      expect(service.canReloadEntityIntegration('light.kitchen')).toBe(false);
      expect(mocks.callService).not.toHaveBeenCalled();
    }
  );

  it('uses live ownership when the bootstrap registry lacks a new entity', async () => {
    mocks.getRegistry.mockReturnValue([]);
    expect(service.canReloadEntityIntegration('light.kitchen')).toBe(false);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    await watchAvailability();
    await service.reloadEntityIntegration('light.kitchen');
    expect(mocks.getRegistry).not.toHaveBeenCalled();
    expect(mocks.callService).toHaveBeenCalledWith('homeassistant', 'reload_config_entry', {
      entry_id: integrationReloadFixture.configEntry.entry_id,
    });
  });

  it('refreshes availability when an entity is added and removed during the session', async () => {
    mocks.liveRegistry.mockReturnValue([]);
    const notify = vi.fn();
    cleanups.push(service.subscribeEntityIntegrationReload('light.kitchen', notify));
    await vi.waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
    expect(service.canReloadEntityIntegration('light.kitchen')).toBe(false);
    mocks.liveRegistry.mockReturnValue([integrationReloadFixture.registryEntry]);
    events.entity_registry_updated({ data: { action: 'create', entity_id: 'light.kitchen' } });
    await vi.waitFor(() => expect(service.canReloadEntityIntegration('light.kitchen')).toBe(true));
    mocks.liveRegistry.mockReturnValue([]);
    events.entity_registry_updated({ data: { action: 'remove', entity_id: 'light.kitchen' } });
    expect(service.canReloadEntityIntegration('light.kitchen')).toBe(false);
  });

  it('updates confirmed unload support and handles config-entry removal', async () => {
    await watchAvailability();
    for (const supported of [false, true]) {
      events['config_entries/subscribe']([
        {
          type: 'updated',
          entry: { ...integrationReloadFixture.configEntry, supports_unload: supported },
        },
      ]);
      expect(service.canReloadEntityIntegration('light.kitchen')).toBe(supported);
    }
    events['config_entries/subscribe']([
      { type: 'removed', entry: integrationReloadFixture.configEntry },
    ]);
    expect(service.canReloadEntityIntegration('light.kitchen')).toBe(false);
  });

  it('shares a watcher and releases subscriptions and cache after the final consumer leaves', async () => {
    await watchAvailability();
    const stopSecond = service.subscribeEntityIntegrationReload(
      'home_assistant:light.kitchen',
      () => {}
    );
    expect(mocks.subscribeMessage).toHaveBeenCalledTimes(2);
    cleanups.pop()?.();
    expect(service.canReloadEntityIntegration('light.kitchen')).toBe(true);
    expect(backendCleanups.every((cleanup) => cleanup.mock.calls.length === 0)).toBe(true);
    stopSecond();
    expect(service.canReloadEntityIntegration('light.kitchen')).toBe(false);
    expect(backendCleanups.every((cleanup) => cleanup.mock.calls.length === 1)).toBe(true);
    expect(storeListeners.size).toBe(0);
  });

  it('shares config-entry subscriptions across different unavailable entities and fans out updates', async () => {
    mocks.liveRegistry.mockReturnValue([
      integrationReloadFixture.registryEntry,
      { ...integrationReloadFixture.registryEntry, entity_id: 'light.bedroom' },
    ]);
    await watchAvailability();
    cleanups.push(service.subscribeEntityIntegrationReload('light.bedroom', () => {}));
    await vi.waitFor(() => expect(service.canReloadEntityIntegration('light.bedroom')).toBe(true));
    expect(
      mocks.subscribeMessage.mock.calls.filter(
        ([, message]) => message.type === 'config_entries/subscribe'
      )
    ).toHaveLength(1);
    events['config_entries/subscribe']([
      {
        type: 'updated',
        entry: { ...integrationReloadFixture.configEntry, supports_unload: false },
      },
    ]);
    expect(service.canReloadEntityIntegration('light.kitchen')).toBe(false);
    expect(service.canReloadEntityIntegration('light.bedroom')).toBe(false);
    cleanups.pop()?.();
    expect(backendCleanups.every((cleanup) => cleanup.mock.calls.length === 0)).toBe(true);
    cleanups.pop()?.();
    expect(backendCleanups.every((cleanup) => cleanup.mock.calls.length === 1)).toBe(true);
  });

  it('hydrates support from the shared initial snapshot and only notifies entities affected by an update', async () => {
    const bedroomEntryId = '01J7Q8TYE0CNCSBWQ6GHEVQ1Z2';
    mocks.liveRegistry.mockReturnValue([
      integrationReloadFixture.registryEntry,
      {
        ...integrationReloadFixture.registryEntry,
        entity_id: 'light.bedroom',
        config_entry_id: bedroomEntryId,
      },
    ]);
    const subscribe = mocks.subscribeMessage.getMockImplementation();
    if (!subscribe) throw new Error('Missing subscription fixture');
    mocks.subscribeMessage.mockImplementation(async (listener, message) => {
      const cleanup = await subscribe(listener, message);
      if (message.type === 'config_entries/subscribe') {
        listener([
          { type: null, entry: integrationReloadFixture.configEntry },
          {
            type: null,
            entry: {
              ...integrationReloadFixture.configEntry,
              entry_id: bedroomEntryId,
              supports_unload: false,
            },
          },
        ]);
      }
      return cleanup;
    });
    const kitchenChanged = vi.fn();
    const bedroomChanged = vi.fn();
    cleanups.push(service.subscribeEntityIntegrationReload('light.kitchen', kitchenChanged));
    cleanups.push(service.subscribeEntityIntegrationReload('light.bedroom', bedroomChanged));
    await vi.waitFor(() => expect(service.canReloadEntityIntegration('light.kitchen')).toBe(true));
    await vi.waitFor(() => expect(bedroomChanged).toHaveBeenCalled());
    expect(service.canReloadEntityIntegration('light.bedroom')).toBe(false);
    expect(
      mocks.sendMessage.mock.calls.every(
        ([message]) => message.type === 'config/entity_registry/get'
      )
    ).toBe(true);
    kitchenChanged.mockClear();
    bedroomChanged.mockClear();
    events['config_entries/subscribe']([
      {
        type: 'updated',
        entry: { ...integrationReloadFixture.configEntry, entry_id: bedroomEntryId },
      },
    ]);
    expect(service.canReloadEntityIntegration('light.bedroom')).toBe(true);
    expect(kitchenChanged).not.toHaveBeenCalled();
    expect(bedroomChanged).toHaveBeenCalledOnce();
  });

  it('replaces the shared subscriptions and cache on connection change and ignores old events', async () => {
    await watchAvailability();
    const oldConfigEvents = events['config_entries/subscribe'];
    const oldCleanups = [...backendCleanups];
    mocks.getConnection.mockReturnValue({
      sendMessagePromise: mocks.sendMessage,
      subscribeMessage: mocks.subscribeMessage,
    });
    for (const listener of storeListeners) listener();
    expect(oldCleanups.every((cleanup) => cleanup.mock.calls.length === 1)).toBe(true);
    expect(service.canReloadEntityIntegration('light.kitchen')).toBe(false);
    await vi.waitFor(() => expect(service.canReloadEntityIntegration('light.kitchen')).toBe(true));
    expect(
      mocks.subscribeMessage.mock.calls.filter(
        ([, message]) => message.type === 'config_entries/subscribe'
      )
    ).toHaveLength(2);
    oldConfigEvents([{ type: 'removed', entry: integrationReloadFixture.configEntry }]);
    expect(service.canReloadEntityIntegration('light.kitchen')).toBe(true);
  });

  it('clears cached support on permission loss and refreshes it when permission returns', async () => {
    await watchAvailability();
    mocks.getState.mockReturnValue({ connected: true, user: { is_admin: false } });
    for (const listener of storeListeners) listener();
    expect(service.canReloadEntityIntegration('light.kitchen')).toBe(false);
    mocks.getState.mockReturnValue({ connected: true, user: { is_admin: true } });
    for (const listener of storeListeners) listener();
    expect(service.canReloadEntityIntegration('light.kitchen')).toBe(false);
    await vi.waitFor(() => expect(service.canReloadEntityIntegration('light.kitchen')).toBe(true));
  });

  it('ignores a delayed support response from a disconnected session', async () => {
    let resolveSupport: (value: unknown) => void = () => {};
    mocks.sendMessage
      .mockResolvedValueOnce(integrationReloadFixture.registryEntry)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSupport = resolve;
          })
      );
    cleanups.push(service.subscribeEntityIntegrationReload('light.kitchen', () => {}));
    await vi.waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(2));
    mocks.getState.mockReturnValue({ connected: false, user: { is_admin: true } });
    for (const listener of storeListeners) listener();
    resolveSupport({ config_entry: integrationReloadFixture.configEntry });
    await Promise.resolve();
    expect(service.canReloadEntityIntegration('light.kitchen')).toBe(false);
    mocks.getState.mockReturnValue({ connected: true, user: { is_admin: true } });
    for (const listener of storeListeners) listener();
    expect(service.canReloadEntityIntegration('light.kitchen')).toBe(false);
    await vi.waitFor(() => expect(service.canReloadEntityIntegration('light.kitchen')).toBe(true));
  });

  it('releases subscriptions that finish attaching after the consumer leaves', async () => {
    let resolveSubscription: (cleanup: () => void) => void = () => {};
    const lateCleanup = vi.fn();
    mocks.subscribeMessage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSubscription = resolve;
        })
    );
    const stop = service.subscribeEntityIntegrationReload('light.kitchen', () => {});
    stop();
    resolveSubscription(lateCleanup);
    await vi.waitFor(() => expect(lateCleanup).toHaveBeenCalledOnce());
    expect(service.canReloadEntityIntegration('light.kitchen')).toBe(false);
  });

  it('does not reload after permission is revoked during the support lookup', async () => {
    let resolveSupport: (value: unknown) => void = () => {};
    mocks.sendMessage
      .mockResolvedValueOnce(integrationReloadFixture.registryEntry)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSupport = resolve;
          })
      );
    const reload = service.reloadEntityIntegration('light.kitchen');
    await vi.waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(2));
    mocks.getState.mockReturnValue({ connected: true, user: { is_admin: false } });
    resolveSupport({ config_entry: integrationReloadFixture.configEntry });
    await expect(reload).rejects.toThrow('unavailable');
    expect(mocks.callService).not.toHaveBeenCalled();
  });

  it('reloads exactly the entry behind an unavailable entity using its native registry ID', async () => {
    mocks.getState.mockReturnValue({
      connected: true,
      user: { is_admin: true },
      entities: { 'light.kitchen': integrationReloadFixture.entity },
    });
    await watchAvailability();
    mocks.sendMessage.mockClear();
    await service.reloadEntityIntegration('home_assistant:light.kitchen');
    expect(mocks.callService).toHaveBeenCalledExactlyOnceWith(
      'homeassistant',
      'reload_config_entry',
      { entry_id: integrationReloadFixture.registryEntry.config_entry_id }
    );
    expect(mocks.sendMessage).toHaveBeenCalledTimes(3);
    expect(mocks.sendMessage).toHaveBeenCalledWith({
      type: 'config_entries/get_single',
      entry_id: integrationReloadFixture.configEntry.entry_id,
    });
  });

  it.each([false, null, undefined])(
    'rejects unload support %s before calling the reload service',
    async (supportsUnload) => {
      mocks.sendMessage.mockResolvedValueOnce(integrationReloadFixture.registryEntry);
      mocks.sendMessage.mockResolvedValue({
        config_entry: { ...integrationReloadFixture.configEntry, supports_unload: supportsUnload },
      });
      await expect(service.reloadEntityIntegration('light.kitchen')).rejects.toThrow(
        'does not support reload'
      );
      expect(mocks.callService).not.toHaveBeenCalled();
    }
  );

  it.each(['failed_unload', 'setup_error', 'setup_retry', 'not_loaded', 'setup_in_progress'])(
    'rejects a completed service call when the entry is %s',
    async (state) => {
      mocks.sendMessage.mockResolvedValueOnce(integrationReloadFixture.registryEntry);
      mocks.sendMessage.mockResolvedValue({
        config_entry: { ...integrationReloadFixture.configEntry, state },
      });
      await expect(service.reloadEntityIntegration('light.kitchen')).rejects.toThrow(
        'did not complete successfully'
      );
      expect(mocks.callService).toHaveBeenCalledTimes(1);
    }
  );

  it('reports a verification failure and permits retry', async () => {
    mocks.sendMessage
      .mockResolvedValueOnce(integrationReloadFixture.registryEntry)
      .mockResolvedValueOnce({ config_entry: integrationReloadFixture.configEntry })
      .mockRejectedValueOnce(new Error('Connection lost'));
    await expect(service.reloadEntityIntegration('light.kitchen')).rejects.toThrow(
      'Connection lost'
    );
    await expect(service.reloadEntityIntegration('light.kitchen')).resolves.toBeUndefined();
    expect(mocks.callService).toHaveBeenCalledTimes(2);
  });

  it('does not dispatch reload when the unload support lookup fails', async () => {
    mocks.sendMessage
      .mockResolvedValueOnce(integrationReloadFixture.registryEntry)
      .mockRejectedValueOnce(new Error('Connection lost'));
    await expect(service.reloadEntityIntegration('light.kitchen')).rejects.toThrow(
      'Connection lost'
    );
    expect(mocks.callService).not.toHaveBeenCalled();
  });

  it('rejects when the session has no message connection', async () => {
    mocks.getConnection.mockReturnValue(null);
    await expect(service.reloadEntityIntegration('light.kitchen')).rejects.toThrow('unavailable');
    expect(mocks.callService).not.toHaveBeenCalled();
  });

  it.each([
    { connected: true, user: { is_admin: false } },
    { connected: true, user: null },
    { connected: false, user: { is_admin: true } },
  ])('rejects unauthorized or disconnected sessions: %j', async (state) => {
    mocks.getState.mockReturnValue(state);
    expect(service.canReloadEntityIntegration('light.kitchen')).toBe(false);
    await expect(service.reloadEntityIntegration('light.kitchen')).rejects.toThrow('unavailable');
    expect(mocks.callService).not.toHaveBeenCalled();
  });

  it.each([null, undefined, ''])(
    'hides entities without a configuration entry: %s',
    async (configEntryId) => {
      mocks.getRegistry.mockReturnValue([
        { ...integrationReloadFixture.registryEntry, config_entry_id: configEntryId },
      ]);
      mocks.liveRegistry.mockReturnValue(mocks.getRegistry());
      expect(service.canReloadEntityIntegration('light.kitchen')).toBe(false);
      await expect(service.reloadEntityIntegration('light.kitchen')).rejects.toThrow('unavailable');
    }
  );

  it('rejects missing entities and entities owned by another provider', async () => {
    for (const id of ['light.missing', 'homey:light.kitchen']) {
      expect(service.canReloadEntityIntegration(id)).toBe(false);
      await expect(service.reloadEntityIntegration(id)).rejects.toThrow('unavailable');
    }
    expect(mocks.callService).not.toHaveBeenCalled();
  });

  it('rechecks permissions when executing', async () => {
    await watchAvailability();
    expect(service.canReloadEntityIntegration('light.kitchen')).toBe(true);
    mocks.getState.mockReturnValue({ connected: true, user: { is_admin: false } });
    await expect(service.reloadEntityIntegration('light.kitchen')).rejects.toThrow('unavailable');
    expect(mocks.callService).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent requests for an entry and allows retry after failure', async () => {
    let rejectRequest!: (error: Error) => void;
    mocks.callService.mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          rejectRequest = reject;
        })
    );
    const first = service.reloadEntityIntegration('light.kitchen');
    const second = service.reloadEntityIntegration('home_assistant:light.kitchen');
    const results = Promise.allSettled([first, second]);
    await vi.waitFor(() => expect(mocks.callService).toHaveBeenCalledTimes(1));
    rejectRequest(new Error('Connection lost'));
    expect((await results).map((result) => result.status)).toEqual(['rejected', 'rejected']);
    await service.reloadEntityIntegration('light.kitchen');
    expect(mocks.callService).toHaveBeenCalledTimes(2);
  });
});
