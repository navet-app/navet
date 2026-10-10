import { integrationReloadFixture } from '@navet/app/test/fixtures/home-assistant/integration-reload';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callService: vi.fn(),
  getRegistry: vi.fn(),
  getState: vi.fn(),
  getConnection: vi.fn(),
  sendMessage: vi.fn(),
}));
vi.mock('./homeassistant-service-bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./homeassistant-service-bridge')>()),
  callHomeAssistantService: mocks.callService,
  getHomeAssistantEntityRegistry: mocks.getRegistry,
  getHomeAssistantStoreState: mocks.getState,
  getHomeAssistantConnection: mocks.getConnection,
}));

import { homeAssistantAdminFeatureService as service } from './homeassistant-admin-feature.service';

// Keep: recovery payload, permissions and unavailable-entity behavior at the adapter boundary.
describe('Home Assistant integration reload', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getState.mockReturnValue({ connected: true, user: { is_admin: true } });
    mocks.getRegistry.mockReturnValue([integrationReloadFixture.registryEntry]);
    mocks.callService.mockResolvedValue(undefined);
    mocks.getConnection.mockReturnValue({ sendMessagePromise: mocks.sendMessage });
    mocks.sendMessage.mockResolvedValue({ config_entry: integrationReloadFixture.configEntry });
  });

  it('reloads exactly the entry behind an unavailable entity using its native registry ID', async () => {
    mocks.getState.mockReturnValue({
      connected: true,
      user: { is_admin: true },
      entities: { 'light.kitchen': integrationReloadFixture.entity },
    });
    expect(service.canReloadEntityIntegration('home_assistant:light.kitchen')).toBe(true);
    await service.reloadEntityIntegration('home_assistant:light.kitchen');
    expect(mocks.callService).toHaveBeenCalledExactlyOnceWith(
      'homeassistant',
      'reload_config_entry',
      { entry_id: integrationReloadFixture.registryEntry.config_entry_id }
    );
    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
    expect(mocks.sendMessage).toHaveBeenCalledWith({
      type: 'config_entries/get_single',
      entry_id: integrationReloadFixture.configEntry.entry_id,
    });
  });

  it.each([false, null, undefined])(
    'rejects unload support %s before calling the reload service',
    async (supportsUnload) => {
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
      .mockResolvedValueOnce({ config_entry: integrationReloadFixture.configEntry })
      .mockRejectedValueOnce(new Error('Connection lost'));
    await expect(service.reloadEntityIntegration('light.kitchen')).rejects.toThrow(
      'Connection lost'
    );
    await expect(service.reloadEntityIntegration('light.kitchen')).resolves.toBeUndefined();
    expect(mocks.callService).toHaveBeenCalledTimes(2);
  });

  it('does not dispatch reload when the unload support lookup fails', async () => {
    mocks.sendMessage.mockRejectedValueOnce(new Error('Connection lost'));
    await expect(service.reloadEntityIntegration('light.kitchen')).rejects.toThrow(
      'Connection lost'
    );
    expect(mocks.callService).not.toHaveBeenCalled();
  });

  it('rejects when the session has no message connection', async () => {
    mocks.getConnection.mockReturnValue(null);
    await expect(service.reloadEntityIntegration('light.kitchen')).rejects.toThrow('not connected');
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
    (configEntryId) => {
      mocks.getRegistry.mockReturnValue([
        { ...integrationReloadFixture.registryEntry, config_entry_id: configEntryId },
      ]);
      expect(service.canReloadEntityIntegration('light.kitchen')).toBe(false);
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
