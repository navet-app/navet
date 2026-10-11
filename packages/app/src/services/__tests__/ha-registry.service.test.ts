import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  householdRegistryAfter,
  householdRegistryBefore,
} from '../../test/fixtures/home-assistant/registries/household';
import HARegistryService from '../ha-registry.service';

describe('HARegistryService', () => {
  const sendMessagePromise = vi.fn();

  it.each(['before', 'after'] as const)(
    'loads a replacement household independently when the obsolete request settles %s it',
    async (obsoleteSettles) => {
      let releaseA!: (areas: typeof householdRegistryBefore.areas) => void;
      let releaseB!: (areas: typeof householdRegistryAfter.areas) => void;
      const areasA = new Promise<typeof householdRegistryBefore.areas>((resolve) => {
        releaseA = resolve;
      });
      const areasB = new Promise<typeof householdRegistryAfter.areas>((resolve) => {
        releaseB = resolve;
      });
      const client = (
        snapshot: typeof householdRegistryBefore,
        areas: Promise<typeof snapshot.areas>
      ) => ({
        sendMessagePromise: vi.fn((message: { type: string }) => {
          if (message.type === 'config/area_registry/list') return areas;
          if (message.type === 'config/device_registry/list')
            return Promise.resolve(snapshot.devices);
          if (message.type === 'config/entity_registry/list')
            return Promise.resolve(snapshot.entities);
          return Promise.resolve([]);
        }),
      });
      const householdA = client(householdRegistryBefore, areasA);
      const householdB = client(householdRegistryAfter, areasB);
      let connection = householdA;
      const service = new HARegistryService(() => connection as never);
      const oldLoad = service.loadRegistries();
      service.resetRegistriesForSession();
      connection = householdB;
      const replacementLoad = service.loadRegistries();
      expect(householdB.sendMessagePromise).toHaveBeenCalledTimes(4);
      expect(replacementLoad).not.toBe(oldLoad);
      if (obsoleteSettles === 'before') {
        // A's loop/finalizer must neither consume B's pending refresh nor release B's lock.
        expect(service.loadRegistries()).toBe(replacementLoad);
        releaseA(householdRegistryBefore.areas);
        await oldLoad;
        expect(service.getAreas()).toEqual([]);
        expect(service.loadRegistries()).toBe(replacementLoad);
        expect(householdB.sendMessagePromise).toHaveBeenCalledTimes(4);
      }
      releaseB(householdRegistryAfter.areas);
      await replacementLoad;
      expect(service.getAreas()).toEqual(householdRegistryAfter.areas);
      expect(service.getDeviceRegistry()).toEqual(householdRegistryAfter.devices);
      expect(service.getEntityRegistry()).toEqual(householdRegistryAfter.entities);
      expect(householdB.sendMessagePromise).toHaveBeenCalledTimes(
        obsoleteSettles === 'before' ? 8 : 4
      );
      if (obsoleteSettles === 'after') {
        releaseA(householdRegistryBefore.areas);
        await oldLoad;
        expect(service.getAreas()).toEqual(householdRegistryAfter.areas);
        expect(householdB.sendMessagePromise).toHaveBeenCalledTimes(4);
      }
    }
  );

  beforeEach(() => {
    sendMessagePromise.mockReset();
    sendMessagePromise.mockImplementation((message: { type: string }) => {
      if (message.type === 'config/area_registry/list') {
        return Promise.resolve([]);
      }
      if (message.type === 'config/device_registry/list') {
        return Promise.resolve([]);
      }
      if (message.type === 'config/entity_registry/list') {
        return Promise.resolve([]);
      }
      if (message.type === 'config/category_registry/list') {
        return Promise.resolve([]);
      }

      return Promise.resolve({});
    });
  });

  it('loads automation categories from the scoped Home Assistant category registry', async () => {
    sendMessagePromise.mockImplementation((message: { type: string; scope?: string }) => {
      if (message.type === 'config/category_registry/list' && message.scope === 'automation') {
        return Promise.resolve([{ category_id: 'morning-id', name: 'Morning' }]);
      }
      return Promise.resolve([]);
    });
    const service = new HARegistryService(
      () =>
        ({
          sendMessagePromise,
        }) as never
    );

    await service.loadRegistries();

    expect(service.getAutomationCategories()).toEqual([
      { category_id: 'morning-id', name: 'Morning' },
    ]);
    expect(sendMessagePromise).toHaveBeenCalledWith({
      type: 'config/category_registry/list',
      scope: 'automation',
    });
  });

  it('updates an entity name through the Home Assistant entity registry', async () => {
    const service = new HARegistryService(
      () =>
        ({
          sendMessagePromise,
        }) as never
    );

    await service.updateEntityName('light.kitchen', 'Kitchen island');

    expect(sendMessagePromise).toHaveBeenCalledWith({
      type: 'config/entity_registry/update',
      entity_id: 'light.kitchen',
      name: 'Kitchen island',
    });
  });

  it('rejects empty entity names before calling Home Assistant', async () => {
    const service = new HARegistryService(
      () =>
        ({
          sendMessagePromise,
        }) as never
    );

    await expect(service.updateEntityName('light.kitchen', '   ')).rejects.toThrow(
      'Entity name is required'
    );
    expect(sendMessagePromise).not.toHaveBeenCalled();
  });

  it('renames an area through Home Assistant area registry update', async () => {
    sendMessagePromise.mockImplementation((message: { type: string }) => {
      if (message.type === 'config/area_registry/update') {
        return Promise.resolve({
          area_id: 'kitchen',
          name: 'Kitchen and dining',
        });
      }
      return Promise.resolve([]);
    });
    const service = new HARegistryService(
      () =>
        ({
          sendMessagePromise,
        }) as never
    );

    await expect(service.updateAreaName('kitchen', ' Kitchen and dining ')).resolves.toEqual({
      area_id: 'kitchen',
      name: 'Kitchen and dining',
    });
    expect(sendMessagePromise).toHaveBeenCalledWith({
      type: 'config/area_registry/update',
      area_id: 'kitchen',
      name: 'Kitchen and dining',
    });
  });

  it('rejects empty room names before calling Home Assistant', async () => {
    const service = new HARegistryService(
      () =>
        ({
          sendMessagePromise,
        }) as never
    );

    await expect(service.updateAreaName('kitchen', '   ')).rejects.toThrow('Room name is required');
    expect(sendMessagePromise).not.toHaveBeenCalled();
  });
  it('refreshes household registries when optional automation categories are unavailable', async () => {
    sendMessagePromise.mockImplementation((message: { type: string }) => {
      if (message.type === 'config/category_registry/list')
        return Promise.reject(new Error('unknown_command'));
      if (message.type === 'config/area_registry/list')
        return Promise.resolve([{ area_id: 'kitchen', name: 'Kitchen' }]);
      return Promise.resolve([]);
    });
    const service = new HARegistryService(() => ({ sendMessagePromise }) as never);
    await service.loadRegistries();
    expect(service.getAreas()).toEqual([{ area_id: 'kitchen', name: 'Kitchen' }]);
    expect(service.getAutomationCategories()).toEqual([]);
  });
});
