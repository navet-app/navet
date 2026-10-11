import {
  detailedTodoItems,
  duplicateUidlessShoppingListItems,
  sameCountShoppingListUpdate,
  shoppingListEntity,
  shoppingListItems,
  uidlessShoppingListItems,
} from '@navet/app/test/fixtures/home-assistant/todo/shared-list';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { homeAssistantTodoListFeatureService as service } from './homeassistant-todo-feature.service';

const bridge = vi.hoisted(() => ({
  client: null as {
    sendMessagePromise: ReturnType<typeof vi.fn>;
    subscribeMessage: ReturnType<typeof vi.fn>;
  } | null,
  entities: {} as Record<string, unknown>,
  listeners: new Map<string, Set<() => void>>(),
  connected: true,
  panel: null as { connection?: unknown; callWS: ReturnType<typeof vi.fn> } | null,
}));
vi.mock('./homeassistant-service-bridge', () => ({
  getHomeAssistantConnection: () =>
    bridge.panel && bridge.client ? { ...bridge.client } : bridge.client,
  getHomeAssistantEntities: () => bridge.entities,
  getHomeAssistantEntityRegistry: () => [],
  getHomeAssistantPanelHass: () => (bridge.panel ? { ...bridge.panel } : null),
  isHomeAssistantConnected: () => bridge.connected,
  addHomeAssistantListener: (event: string, listener: () => void) => {
    const listeners = bridge.listeners.get(event) ?? new Set();
    bridge.listeners.set(event, listeners);
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
}));

beforeEach(() => {
  bridge.entities = { 'todo.shopping_list': structuredClone(shoppingListEntity) };
  bridge.listeners.clear();
  bridge.connected = true;
  bridge.panel = null;
  bridge.client = {
    sendMessagePromise: vi.fn(async () => ({
      response: { 'todo.shopping_list': shoppingListItems },
    })),
    subscribeMessage: vi.fn(async () => vi.fn()),
  };
});
afterEach(() => vi.useRealTimers());

function emit(event: string) {
  for (const listener of bridge.listeners.get(event) ?? []) listener();
}

describe('Home Assistant shared lists', () => {
  it('displays UID-less items and routes changes by summary', async () => {
    bridge.client?.sendMessagePromise.mockResolvedValueOnce({
      response: {
        'todo.shopping_list': uidlessShoppingListItems,
      },
    });
    const items = await service.getItems('todo.shopping_list');
    expect(items).toMatchObject([
      { summary: 'Milk', completed: false, removable: false },
      { summary: 'Bread', completed: true, removable: false },
    ]);
    expect(items[0].uid).not.toBe(items[1].uid);
    await service.updateItem('todo.shopping_list', items[0].uid, { completed: true });
    expect(bridge.client?.sendMessagePromise).toHaveBeenLastCalledWith(
      expect.objectContaining({ service_data: { item: 'Milk', status: 'completed' } })
    );
    await expect(service.removeItem('todo.shopping_list', items[1].uid)).rejects.toThrow(
      'This item does not support removal'
    );
    expect(bridge.client?.sendMessagePromise).toHaveBeenCalledTimes(2);
  });

  it('updates and removes an opaque real UID that uses the synthetic ID prefix', async () => {
    const uid = 'navet-summary:Milk:0';
    bridge.client?.sendMessagePromise.mockResolvedValueOnce({
      response: {
        'todo.shopping_list': {
          items: [{ uid, summary: 'Milk', status: 'needs_action' }],
        },
      },
    });
    expect(await service.getItems('todo.shopping_list')).toEqual([
      { uid, summary: 'Milk', completed: false },
    ]);
    await service.updateItem('todo.shopping_list', uid, { completed: true });
    expect(bridge.client?.sendMessagePromise).toHaveBeenLastCalledWith(
      expect.objectContaining({ service_data: { item: uid, status: 'completed' } })
    );
    await service.removeItem('todo.shopping_list', uid);
    expect(bridge.client?.sendMessagePromise).toHaveBeenLastCalledWith(
      expect.objectContaining({ service: 'remove_item', service_data: { item: uid } })
    );
    await expect(
      service.updateItem('todo.shopping_list', 'navet-summary:Missing:0', { completed: true })
    ).rejects.toThrow('Shared list item changed');
    expect(bridge.client?.sendMessagePromise).toHaveBeenCalledTimes(3);
  });

  it('rejects a removed real UID even when it becomes another item summary', async () => {
    bridge.client?.sendMessagePromise.mockResolvedValueOnce({
      response: {
        'todo.shopping_list': {
          items: [{ uid: 'old-uid', summary: 'Milk', status: 'needs_action' }],
        },
      },
    });
    const previous = await service.getItems('todo.shopping_list');
    let push: (result: unknown) => void = () => {};
    bridge.client?.subscribeMessage.mockImplementationOnce(async (callback) => {
      push = callback;
      return vi.fn();
    });
    const listener = vi.fn();
    const unsubscribe = await service.subscribeItems('todo.shopping_list', listener);
    push({ items: [{ uid: 'other-uid', summary: 'old-uid', status: 'needs_action' }] });
    await expect(
      service.updateItem('todo.shopping_list', previous[0].uid, { summary: 'Changed' })
    ).rejects.toThrow('Shared list item changed');
    await expect(service.removeItem('todo.shopping_list', previous[0].uid)).rejects.toThrow(
      'Shared list item changed'
    );
    expect(bridge.client?.sendMessagePromise).toHaveBeenCalledTimes(1);
    const current = listener.mock.lastCall?.[0][0];
    await service.updateItem('todo.shopping_list', current.uid, { completed: true });
    expect(bridge.client?.sendMessagePromise).toHaveBeenLastCalledWith(
      expect.objectContaining({ service_data: { item: 'other-uid', status: 'completed' } })
    );
    await service.removeItem('todo.shopping_list', current.uid);
    expect(bridge.client?.sendMessagePromise).toHaveBeenLastCalledWith(
      expect.objectContaining({ service: 'remove_item', service_data: { item: 'other-uid' } })
    );
    unsubscribe();
  });

  it('displays duplicate UID-less summaries without targeting an ambiguous item', async () => {
    bridge.client?.sendMessagePromise.mockResolvedValueOnce({
      response: {
        'todo.shopping_list': duplicateUidlessShoppingListItems,
      },
    });
    const items = await service.getItems('todo.shopping_list');
    expect(new Set(items.map((item) => item.uid)).size).toBe(2);
    expect(items.every((item) => item.updatable === false && item.removable === false)).toBe(true);
    await expect(
      service.updateItem('todo.shopping_list', items[0].uid, { completed: true })
    ).rejects.toThrow('Item name is ambiguous');
    await expect(service.removeItem('todo.shopping_list', items[1].uid)).rejects.toThrow(
      'Item name is ambiguous'
    );
    expect(bridge.client?.sendMessagePromise).toHaveBeenCalledTimes(1);
  });

  it('rejects summary updates that could resolve to another item UID', async () => {
    bridge.client?.sendMessagePromise.mockResolvedValueOnce({
      response: {
        'todo.shopping_list': {
          items: [
            { uid: 'Milk', summary: 'Bread', status: 'needs_action' },
            { summary: 'Milk', status: 'needs_action' },
          ],
        },
      },
    });
    const items = await service.getItems('todo.shopping_list');
    expect(items[1].updatable).toBe(false);
    await expect(
      service.updateItem('todo.shopping_list', items[1].uid, { completed: true })
    ).rejects.toThrow('Item name is ambiguous');
    expect(bridge.client?.sendMessagePromise).toHaveBeenCalledTimes(1);
  });

  it('disables and rejects UID actions shadowed by an earlier item summary', async () => {
    bridge.client?.sendMessagePromise.mockResolvedValueOnce({
      response: {
        'todo.shopping_list': {
          items: [
            { uid: 'first-uid', summary: 'second-uid', status: 'needs_action' },
            { uid: 'second-uid', summary: 'Bread', status: 'needs_action' },
          ],
        },
      },
    });
    const items = await service.getItems('todo.shopping_list');
    expect(items[0].updatable).not.toBe(false);
    expect(items[0].removable).not.toBe(false);
    expect(items[1]).toMatchObject({ uid: 'second-uid', updatable: false, removable: false });
    await expect(
      service.updateItem('todo.shopping_list', items[1].uid, { completed: true })
    ).rejects.toThrow('Item name is ambiguous');
    await expect(
      service.updateItem('todo.shopping_list', items[1].uid, { summary: 'New name' })
    ).rejects.toThrow('Item name is ambiguous');
    await expect(service.removeItem('todo.shopping_list', items[1].uid)).rejects.toThrow(
      'Item name is ambiguous'
    );
    expect(bridge.client?.sendMessagePromise).toHaveBeenCalledTimes(1);
    await service.updateItem('todo.shopping_list', items[0].uid, { completed: true });
    expect(bridge.client?.sendMessagePromise).toHaveBeenLastCalledWith(
      expect.objectContaining({ service_data: { item: 'first-uid', status: 'completed' } })
    );
  });

  it('keeps a UID actionable when its match precedes another item with that summary', async () => {
    bridge.client?.sendMessagePromise.mockResolvedValueOnce({
      response: {
        'todo.shopping_list': {
          items: [
            { uid: 'first-uid', summary: 'Bread', status: 'needs_action' },
            { uid: 'second-uid', summary: 'first-uid', status: 'needs_action' },
          ],
        },
      },
    });
    const items = await service.getItems('todo.shopping_list');
    expect(items[0].updatable).not.toBe(false);
    expect(items[0].removable).not.toBe(false);
    await service.updateItem('todo.shopping_list', items[0].uid, { completed: true });
    expect(bridge.client?.sendMessagePromise).toHaveBeenLastCalledWith(
      expect.objectContaining({ service_data: { item: 'first-uid', status: 'completed' } })
    );
    await service.removeItem('todo.shopping_list', items[0].uid);
    expect(bridge.client?.sendMessagePromise).toHaveBeenLastCalledWith(
      expect.objectContaining({ service_data: { item: 'first-uid' } })
    );
  });

  it('discovers normalized lists and gates each supported capability', async () => {
    expect(await service.getLists()).toEqual([
      {
        id: 'home_assistant:todo.shopping_list',
        providerId: 'home_assistant',
        externalId: 'todo.shopping_list',
        sessionKey: expect.any(String),
        name: 'Shopping list',
        available: true,
        capabilities: {
          add: true,
          update: true,
          remove: true,
          description: false,
          dueDate: false,
          dueDateTime: false,
        },
      },
    ]);
    bridge.connected = false;
    expect((await service.getLists())[0].available).toBe(false);
  });

  it('keeps the session for state wrappers and rotates it for transport replacement and disconnect', async () => {
    const callWS = vi.fn();
    bridge.panel = { callWS };
    const first = (await service.getLists())[0].sessionKey;
    bridge.panel = { callWS };
    expect((await service.getLists())[0].sessionKey).toBe(first);
    bridge.panel = { callWS: vi.fn() };
    const replaced = (await service.getLists())[0].sessionKey;
    expect(replaced).not.toBe(first);
    bridge.connected = false;
    const disconnected = (await service.getLists())[0].sessionKey;
    expect(disconnected).not.toBe(replaced);
    bridge.connected = true;
    expect((await service.getLists())[0].sessionKey).not.toBe(disconnected);
  });

  it('rotates the session when an injected panel changes its connection with the same callWS', async () => {
    const callWS = vi.fn();
    const connection = {};
    bridge.panel = { callWS, connection };
    const previous = (await service.getLists())[0].sessionKey;
    bridge.panel = { callWS, connection };
    expect((await service.getLists())[0].sessionKey).toBe(previous);
    bridge.panel = { callWS, connection: {} };
    expect((await service.getLists())[0].sessionKey).not.toBe(previous);
  });

  it.each(['add', 'update', 'remove'] as const)(
    'rejects %s against a replaced session before sending and accepts the current session',
    async (action) => {
      const previousSession = (await service.getLists())[0].sessionKey;
      bridge.client = {
        sendMessagePromise: vi.fn(async () => ({})),
        subscribeMessage: vi.fn(async () => vi.fn()),
      };
      const invoke = (key?: string) =>
        action === 'add'
          ? service.addItem('todo.shopping_list', { summary: 'Milk' }, key)
          : action === 'update'
            ? service.updateItem('todo.shopping_list', 'uid', { summary: 'Milk' }, key)
            : service.removeItem('todo.shopping_list', 'uid', key);
      await expect(invoke(previousSession)).rejects.toThrow('connection changed');
      expect(bridge.client.sendMessagePromise).not.toHaveBeenCalled();
      const currentSession = (await service.getLists())[0].sessionKey;
      await invoke(currentSession);
      expect(bridge.client.sendMessagePromise).toHaveBeenCalledTimes(1);
    }
  );

  it('keeps current UID-less subscription targets when an older read resolves', async () => {
    let resolveRead: (result: unknown) => void = () => {};
    bridge.client?.sendMessagePromise.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        })
    );
    const oldRead = service.getItems('todo.shopping_list');
    let push: (result: unknown) => void = () => {};
    bridge.client?.subscribeMessage.mockImplementationOnce(async (callback) => {
      push = callback;
      return vi.fn();
    });
    const listener = vi.fn();
    const unsubscribe = await service.subscribeItems('todo.shopping_list', listener);
    push({ items: [{ summary: 'Coffee', status: 'needs_action' }] });
    const currentItem = listener.mock.lastCall?.[0][0];
    resolveRead({ response: { 'todo.shopping_list': uidlessShoppingListItems } });
    expect(await oldRead).toEqual([currentItem]);
    await service.updateItem('todo.shopping_list', currentItem.uid, { completed: true });
    expect(bridge.client?.sendMessagePromise).toHaveBeenLastCalledWith(
      expect.objectContaining({ service_data: { item: 'Coffee', status: 'completed' } })
    );
    unsubscribe();
  });

  it('keeps the newer read targets when reads resolve out of order', async () => {
    let resolveRead: (result: unknown) => void = () => {};
    bridge.client?.sendMessagePromise.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        })
    );
    const oldRead = service.getItems('todo.shopping_list');
    const rejection = expect(oldRead).rejects.toThrow('Shared list items changed');
    bridge.client?.sendMessagePromise.mockResolvedValueOnce({
      response: {
        'todo.shopping_list': { items: [{ summary: 'Coffee', status: 'needs_action' }] },
      },
    });
    const current = await service.getItems('todo.shopping_list');
    resolveRead({ response: { 'todo.shopping_list': uidlessShoppingListItems } });
    await rejection;
    await service.updateItem('todo.shopping_list', current[0].uid, { completed: true });
    expect(bridge.client?.sendMessagePromise).toHaveBeenLastCalledWith(
      expect.objectContaining({ service_data: { item: 'Coffee', status: 'completed' } })
    );
  });

  it('returns the actionable live snapshot for reads started after a native publication', async () => {
    let push: (result: unknown) => void = () => {};
    bridge.client?.subscribeMessage.mockImplementationOnce(async (callback) => {
      push = callback;
      return vi.fn();
    });
    const listener = vi.fn();
    const unsubscribe = await service.subscribeItems('todo.shopping_list', listener);
    push({ items: [{ summary: 'Coffee', status: 'needs_action' }] });
    bridge.client?.sendMessagePromise.mockResolvedValueOnce({
      response: { 'todo.shopping_list': uidlessShoppingListItems },
    });
    const displayed = await service.getItems('todo.shopping_list');
    expect(displayed).toEqual(listener.mock.lastCall?.[0]);
    expect(displayed[0].summary).toBe('Coffee');
    await service.updateItem('todo.shopping_list', displayed[0].uid, { completed: true });
    expect(bridge.client?.sendMessagePromise).toHaveBeenLastCalledWith(
      expect.objectContaining({ service_data: { item: 'Coffee', status: 'completed' } })
    );
    unsubscribe();
  });

  it('discards a direct read after its live subscription is disposed', async () => {
    let push: (result: unknown) => void = () => {};
    bridge.client?.subscribeMessage.mockImplementationOnce(async (callback) => {
      push = callback;
      return vi.fn();
    });
    const listener = vi.fn();
    const unsubscribe = await service.subscribeItems('todo.shopping_list', listener);
    push({ items: [{ summary: 'Coffee', status: 'needs_action' }] });
    const current = listener.mock.lastCall?.[0][0];
    let resolveRead: (result: unknown) => void = () => {};
    bridge.client?.sendMessagePromise.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        })
    );
    const read = service.getItems('todo.shopping_list');
    const rejection = expect(read).rejects.toThrow('Shared list items changed');
    unsubscribe();
    resolveRead({ response: { 'todo.shopping_list': uidlessShoppingListItems } });
    await rejection;
    await service.updateItem('todo.shopping_list', current.uid, { completed: true });
    expect(bridge.client?.sendMessagePromise).toHaveBeenLastCalledWith(
      expect.objectContaining({ service_data: { item: 'Coffee', status: 'completed' } })
    );
  });

  it('discards a fallback refresh after its subscription is disposed', async () => {
    vi.useFakeTimers();
    bridge.client?.sendMessagePromise.mockResolvedValueOnce({
      response: { 'todo.shopping_list': uidlessShoppingListItems },
    });
    const current = await service.getItems('todo.shopping_list');
    bridge.client?.subscribeMessage.mockRejectedValueOnce(new Error('unknown_command'));
    let resolveRead: (result: unknown) => void = () => {};
    bridge.client?.sendMessagePromise.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        })
    );
    const listener = vi.fn();
    const unsubscribe = await service.subscribeItems('todo.shopping_list', listener);
    unsubscribe();
    resolveRead({
      response: {
        'todo.shopping_list': { items: [{ summary: 'Coffee', status: 'needs_action' }] },
      },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(listener).not.toHaveBeenCalled();
    await service.updateItem('todo.shopping_list', current[0].uid, { completed: true });
    expect(bridge.client?.sendMessagePromise).toHaveBeenLastCalledWith(
      expect.objectContaining({ service_data: { item: 'Milk', status: 'completed' } })
    );
  });

  it('reads completed items even when the backend defaults to incomplete items', async () => {
    bridge.client?.sendMessagePromise.mockImplementationOnce(async (message) => {
      const statuses = message.service_data.status ?? ['needs_action'];
      return {
        response: {
          'todo.shopping_list': {
            items: shoppingListItems.items.filter((item) => statuses.includes(item.status)),
          },
        },
      };
    });
    const items = await service.getItems('todo.shopping_list');
    expect(items).toHaveLength(shoppingListItems.items.length);
    expect(items.some((item) => item.completed)).toBe(true);
  });

  it('reads both completed and incomplete items using authenticated service responses', async () => {
    expect(await service.getItems('todo.shopping_list')).toEqual(
      shoppingListItems.items.map((item) => ({
        uid: item.uid,
        summary: item.summary,
        completed: item.status === 'completed',
      }))
    );
    expect(bridge.client?.sendMessagePromise).toHaveBeenCalledWith({
      type: 'call_service',
      domain: 'todo',
      service: 'get_items',
      service_data: { status: ['needs_action', 'completed'] },
      target: { entity_id: 'todo.shopping_list' },
      return_response: true,
    });
    bridge.client?.sendMessagePromise.mockResolvedValue({
      response: { 'todo.shopping_list': detailedTodoItems },
    });
    expect(await service.getItems('todo.shopping_list')).toEqual([
      {
        uid: 'task-date',
        summary: 'Collect parcel',
        completed: false,
        dueDate: '2026-10-12',
        description: 'Bring ID',
      },
      {
        uid: 'task-datetime',
        summary: 'Call plumber',
        completed: true,
        dueDateTime: '2026-10-12T15:30:00+02:00',
      },
    ]);
  });

  it('uses stable UIDs for completion, rename and removal when labels repeat', async () => {
    await service.addItem('todo.shopping_list', { summary: ' Milk ' });
    await service.updateItem('todo.shopping_list', shoppingListItems.items[0].uid, {
      completed: true,
      summary: 'Oat milk',
    });
    await service.removeItem('todo.shopping_list', shoppingListItems.items[0].uid);
    expect(bridge.client?.sendMessagePromise.mock.calls.map(([call]) => call)).toEqual([
      {
        type: 'call_service',
        domain: 'todo',
        service: 'add_item',
        service_data: { item: 'Milk' },
        target: { entity_id: 'todo.shopping_list' },
      },
      {
        type: 'call_service',
        domain: 'todo',
        service: 'update_item',
        service_data: {
          item: shoppingListItems.items[0].uid,
          status: 'completed',
          rename: 'Oat milk',
        },
        target: { entity_id: 'todo.shopping_list' },
      },
      {
        type: 'call_service',
        domain: 'todo',
        service: 'remove_item',
        service_data: { item: shoppingListItems.items[0].uid },
        target: { entity_id: 'todo.shopping_list' },
      },
    ]);
  });

  it('rejects unsupported item fields and read-only actions before transport', async () => {
    await expect(
      service.addItem('todo.shopping_list', { summary: 'Milk', description: 'Organic' })
    ).rejects.toThrow('item field');
    bridge.entities['todo.shopping_list'] = {
      ...shoppingListEntity,
      attributes: { ...shoppingListEntity.attributes, supported_features: 0 },
    };
    await expect(
      service.updateItem('todo.shopping_list', 'uid', { completed: true })
    ).rejects.toThrow('action');
    expect(bridge.client?.sendMessagePromise).not.toHaveBeenCalled();
  });

  it('publishes same-count native item updates and preserves the last useful snapshot on malformed data', async () => {
    let push!: (event: unknown) => void;
    const release = vi.fn();
    bridge.client?.subscribeMessage.mockImplementation(async (callback) => {
      push = callback;
      return release;
    });
    const snapshots: unknown[] = [];
    const onError = vi.fn();
    const unsubscribe = await service.subscribeItems(
      'todo.shopping_list',
      (items) => snapshots.push(items),
      onError
    );
    push(shoppingListItems);
    push(sameCountShoppingListUpdate);
    push({ items: [{ summary: 'Missing UID' }] });
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]).toMatchObject([
      { summary: 'Oat milk' },
      { summary: 'Bread' },
      { summary: 'Coffee' },
    ]);
    expect(onError).toHaveBeenCalledTimes(1);
    unsubscribe();
    push(shoppingListItems);
    expect(snapshots).toHaveLength(2);
    expect(release).toHaveBeenCalledTimes(1);
    expect(bridge.listeners.get('connection')?.size).toBe(0);
  });

  it('updates descriptors when an external list is renamed or removed', async () => {
    const snapshots: unknown[] = [];
    const unsubscribe = await service.subscribeLists((lists) => snapshots.push(lists));
    await Promise.resolve();
    bridge.entities = {
      'todo.shopping_list': {
        ...shoppingListEntity,
        attributes: { ...shoppingListEntity.attributes, friendly_name: 'Groceries' },
      },
    };
    emit('entities');
    await Promise.resolve();
    expect(snapshots[1]).toMatchObject([{ name: 'Groceries' }]);
    bridge.entities = {};
    emit('entities');
    await Promise.resolve();
    expect(snapshots[2]).toEqual([]);
    unsubscribe();
    expect(bridge.listeners.get('entities')?.size).toBe(0);
  });

  it('clears household items on session replacement and discards old callbacks', async () => {
    const callbacks: ((value: unknown) => void)[] = [];
    bridge.client?.subscribeMessage.mockImplementation(async (callback) => {
      callbacks.push(callback);
      return vi.fn();
    });
    const snapshots: unknown[] = [];
    const unsubscribe = await service.subscribeItems('todo.shopping_list', (items) =>
      snapshots.push(items)
    );
    callbacks[0](shoppingListItems);
    bridge.client = {
      sendMessagePromise: vi.fn(),
      subscribeMessage: vi.fn(async (callback) => {
        callbacks.push(callback);
        return vi.fn();
      }),
    };
    emit('connection');
    await Promise.resolve();
    callbacks[0](sameCountShoppingListUpdate);
    callbacks[1]({ items: [] });
    expect(snapshots).toHaveLength(3);
    expect(snapshots[1]).toEqual([]);
    expect(snapshots[2]).toEqual([]);
    unsubscribe();
  });

  it('polls older HA APIs for same-count edits and retains items across read failures', async () => {
    vi.useFakeTimers();
    bridge.client?.subscribeMessage.mockRejectedValueOnce(new Error('unknown_command'));
    const snapshots: unknown[] = [];
    const onError = vi.fn();
    const unsubscribe = await service.subscribeItems(
      'todo.shopping_list',
      (items) => snapshots.push(items),
      onError
    );
    await vi.advanceTimersByTimeAsync(0);
    bridge.client?.sendMessagePromise.mockRejectedValueOnce(new Error('offline'));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(snapshots).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
    bridge.client?.sendMessagePromise.mockResolvedValue({
      response: { 'todo.shopping_list': sameCountShoppingListUpdate },
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(snapshots[1]).toMatchObject([
      { summary: 'Oat milk' },
      { summary: 'Bread' },
      { summary: 'Coffee' },
    ]);
    unsubscribe();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(snapshots).toHaveLength(2);
  });
  it('reads and polls a panel callWS bridge without a native socket while hass wrappers change', async () => {
    vi.useFakeTimers();
    if (!bridge.client) throw new Error('Fixture client missing');
    bridge.panel = { callWS: bridge.client.sendMessagePromise };
    bridge.client.subscribeMessage.mockRejectedValue(
      new Error('Home Assistant panel connection cannot subscribe')
    );
    expect(await service.getItems('todo.shopping_list')).toHaveLength(3);
    const snapshots: unknown[] = [];
    const unsubscribe = await service.subscribeItems('todo.shopping_list', (items) =>
      snapshots.push(items)
    );
    await vi.advanceTimersByTimeAsync(0);
    bridge.client.sendMessagePromise.mockResolvedValue({
      response: { 'todo.shopping_list': sameCountShoppingListUpdate },
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]).toMatchObject([
      { summary: 'Oat milk' },
      { summary: 'Bread' },
      { summary: 'Coffee' },
    ]);
    unsubscribe();
  });

  it('reports denied subscriptions without silently starting a polling loop', async () => {
    vi.useFakeTimers();
    bridge.client?.subscribeMessage.mockRejectedValue({
      code: 'unauthorized',
      message: 'Not allowed',
    });
    await expect(service.subscribeItems('todo.shopping_list', vi.fn())).rejects.toMatchObject({
      code: 'unauthorized',
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(bridge.client?.sendMessagePromise).not.toHaveBeenCalled();
    expect(bridge.listeners.get('connection')?.size).toBe(0);
  });

  it('translates optional due fields and explicit clears only when supported', async () => {
    bridge.entities['todo.shopping_list'] = {
      ...shoppingListEntity,
      attributes: { ...shoppingListEntity.attributes, supported_features: 127 },
    };
    await service.addItem('todo.shopping_list', {
      summary: 'Parcel',
      description: 'Bring ID',
      dueDate: '2026-10-12',
    });
    await service.updateItem('todo.shopping_list', 'task-date', {
      description: null,
      dueDate: null,
    });
    expect(bridge.client?.sendMessagePromise.mock.calls[0][0].service_data).toEqual({
      item: 'Parcel',
      description: 'Bring ID',
      due_date: '2026-10-12',
    });
    expect(bridge.client?.sendMessagePromise.mock.calls[1][0].service_data).toEqual({
      item: 'task-date',
      description: null,
      due_date: null,
    });
    await expect(
      service.addItem('todo.shopping_list', {
        summary: 'Parcel',
        dueDate: '2026-10-12',
        dueDateTime: '2026-10-12T15:30:00+02:00',
      })
    ).rejects.toThrow('date or');
  });
  it('reports descriptor refresh failures without clearing the last lists', async () => {
    const listener = vi.fn();
    const onError = vi.fn();
    const unsubscribe = await service.subscribeLists(listener, onError);
    await Promise.resolve();
    const discovery = vi
      .spyOn(service, 'getLists')
      .mockRejectedValueOnce(new Error('registry temporarily unavailable'));
    emit('registries');
    await Promise.resolve();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    discovery.mockRestore();
    unsubscribe();
  });

  it('releases native subscriptions established after their session was replaced', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const oldUnsubscribe = vi.fn();
    bridge.client?.subscribeMessage.mockImplementation(async () => {
      await gate;
      return oldUnsubscribe;
    });
    const snapshots = vi.fn();
    const subscribing = service.subscribeItems('todo.shopping_list', snapshots);
    bridge.client = null;
    emit('connection');
    release();
    const unsubscribe = await subscribing;
    expect(oldUnsubscribe).toHaveBeenCalledTimes(1);
    expect(snapshots).toHaveBeenCalledWith([]);
    unsubscribe();
  });
  it.each(['native', 'fallback'] as const)(
    'keeps household B subscribed after stale household A %s subscription failure',
    async (phase) => {
      let rejectA!: (error: unknown) => void;
      const oldSubscription = new Promise<() => void>((_resolve, reject) => {
        rejectA = reject;
      });
      if (!bridge.client) throw new Error('Fixture client missing');
      if (phase === 'fallback')
        bridge.client.subscribeMessage.mockRejectedValueOnce({ code: 'unknown_command' });
      bridge.client.subscribeMessage.mockImplementationOnce(() => oldSubscription);
      const snapshots = vi.fn();
      const onError = vi.fn();
      const subscribing = service.subscribeItems('todo.shopping_list', snapshots, onError);
      // Let A enter its fallback event subscription before replacing the source.
      await Promise.resolve();
      let publishB!: (event: unknown) => void;
      const unsubscribeB = vi.fn();
      bridge.client = {
        sendMessagePromise: vi.fn(),
        subscribeMessage: vi.fn(async (callback) => {
          publishB = callback;
          return unsubscribeB;
        }),
      };
      emit('connection');
      await Promise.resolve();
      publishB(shoppingListItems);
      rejectA({ code: 'connection_lost' });
      const unsubscribe = await subscribing;
      expect(bridge.listeners.get('connection')?.size).toBe(1);
      expect(unsubscribeB).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      publishB(sameCountShoppingListUpdate);
      expect(snapshots.mock.lastCall?.[0][0].summary).toBe('Oat milk');
      unsubscribe();
      expect(unsubscribeB).toHaveBeenCalledTimes(1);
      expect(bridge.listeners.get('connection')?.size).toBe(0);
    }
  );
});
