import { createProviderScopedId } from '@navet/core/ids';
import type { PlatformMessageClient } from '@navet/core/provider-feature-models';
import type { ProviderTodoListFeatureService } from '@navet/core/provider-feature-services';
import type { NavetTodoItem, NavetTodoItemInput, NavetTodoList } from '@navet/core/todo-types';
import {
  addHomeAssistantListener,
  getHomeAssistantConnection,
  getHomeAssistantEntities,
  getHomeAssistantEntityRegistry,
  getHomeAssistantPanelHass,
  isHomeAssistantConnected,
} from './homeassistant-service-bridge';

let panelSource: { transport: unknown; userId: string | undefined } | undefined;
function sourceIdentity() {
  const panel = getHomeAssistantPanelHass() as {
    connection?: unknown;
    callWS?: unknown;
    user?: { id?: string } | null;
  } | null;
  if (!panel) return getHomeAssistantConnection();
  const transport = panel.connection ?? panel.callWS;
  if (!transport) return null;
  // State wrappers change frequently; transport and authenticated user define the panel session.
  if (panelSource?.transport !== transport || panelSource.userId !== panel.user?.id)
    panelSource = { transport, userId: panel.user?.id };
  return panelSource;
}

type ItemTarget = { value: string | null; removable: boolean };
const summaryTargets = new Map<string, Map<string, ItemTarget>>();
const snapshotRevisions = new Map<string, number>();
const nativeSnapshotOwners = new Map<string, Set<object>>();
const nativeSnapshots = new Map<string, NavetTodoItem[]>();

function advanceSnapshot(listId: string) {
  const revision = (snapshotRevisions.get(listId) ?? 0) + 1;
  snapshotRevisions.set(listId, revision);
  return revision;
}

let sessionSource: unknown;
let sessionGeneration = 0;
function sessionKey() {
  const source = isHomeAssistantConnected() ? sourceIdentity() : null;
  if (source !== sessionSource) {
    summaryTargets.clear();
    snapshotRevisions.clear();
    nativeSnapshotOwners.clear();
    nativeSnapshots.clear();
    sessionSource = source;
    sessionGeneration++;
  }
  return `todo-session-${sessionGeneration}`;
}

function getList(listId: string): NavetTodoList {
  const entity = getHomeAssistantEntities()?.[listId];
  if (!listId.startsWith('todo.') || !entity) throw new Error('Shared list is no longer available');
  const features =
    typeof entity.attributes.supported_features === 'number'
      ? entity.attributes.supported_features
      : 0;
  const registry = getHomeAssistantEntityRegistry().find((entry) => entry.entity_id === listId);
  return {
    id: createProviderScopedId('home_assistant', listId),
    providerId: 'home_assistant',
    externalId: listId,
    sessionKey: sessionKey(),
    name:
      registry?.name ||
      String(entity.attributes.friendly_name || registry?.original_name || listId.slice(5)),
    available:
      entity.state !== 'unavailable' &&
      entity.state !== 'unknown' &&
      getHomeAssistantConnection() !== null &&
      isHomeAssistantConnected(),
    capabilities: {
      add: !!(features & 1),
      remove: !!(features & 2),
      update: !!(features & 4),
      dueDate: !!(features & 16),
      dueDateTime: !!(features & 32),
      description: !!(features & 64),
    },
  };
}

function normalizeItems(listId: string, result: unknown): NavetTodoItem[] {
  if (
    !result ||
    typeof result !== 'object' ||
    !Array.isArray((result as { items?: unknown }).items)
  )
    throw new Error('Invalid shared list response');
  const rawItems = (result as { items: unknown[] }).items;
  const usedIds = new Set(rawItems.map((item) => (item as { uid?: unknown } | null)?.uid));
  const targets = new Map<string, ItemTarget>();
  const occurrences = new Map<string, number>();
  const items = rawItems.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid shared list item');
    const raw = item as Record<string, unknown>;
    if (
      (raw.uid != null && typeof raw.uid !== 'string') ||
      typeof raw.summary !== 'string' ||
      (raw.status !== 'needs_action' && raw.status !== 'completed')
    )
      throw new Error('Invalid shared list item');
    let uid = typeof raw.uid === 'string' && raw.uid ? raw.uid : undefined;
    if (!uid) {
      const occurrence = occurrences.get(raw.summary) ?? 0;
      occurrences.set(raw.summary, occurrence + 1);
      uid = `navet-summary:${encodeURIComponent(raw.summary)}:${occurrence}`;
      while (usedIds.has(uid)) uid += ':';
      usedIds.add(uid);
      // HA resolves summaries to the first matching item. Reject ambiguous actions.
      const matches = rawItems.filter((other) => {
        const candidate = other as { summary?: unknown; uid?: unknown } | null;
        return candidate?.summary === raw.summary || candidate?.uid === raw.summary;
      });
      targets.set(uid, { value: matches.length === 1 ? raw.summary : null, removable: false });
    } else {
      // HA's _find_by_uid_or_summary uses the first match, even for a real UID.
      const firstMatch = rawItems.find((other) => {
        const candidate = other as { summary?: unknown; uid?: unknown } | null;
        return candidate?.uid === uid || candidate?.summary === uid;
      });
      targets.set(uid, { value: firstMatch === raw ? uid : null, removable: firstMatch === raw });
    }
    const due = typeof raw.due === 'string' ? raw.due : undefined;
    return {
      uid,
      ...(targets.get(uid)?.removable === false ? { removable: false } : {}),
      ...(targets.get(uid)?.value === null ? { updatable: false } : {}),
      summary: raw.summary,
      completed: raw.status === 'completed',
      ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
      ...(due ? (/^\d{4}-\d{2}-\d{2}$/.test(due) ? { dueDate: due } : { dueDateTime: due }) : {}),
    };
  });
  summaryTargets.set(listId, targets);
  return items;
}

function itemTarget(listId: string, uid: string) {
  const targets = summaryTargets.get(listId);
  if (!targets?.has(uid)) {
    if (targets || uid.startsWith('navet-summary:')) throw new Error('Shared list item changed');
    return uid;
  }
  const target = targets.get(uid);
  if (target?.value == null) throw new Error('Item name is ambiguous');
  return target.value;
}

function clientFor(
  listId: string,
  capability?: 'add' | 'update' | 'remove',
  expectedSessionKey?: string
) {
  const list = getList(listId);
  if (expectedSessionKey !== undefined && expectedSessionKey !== list.sessionKey)
    throw new Error('Shared list connection changed');
  const client = getHomeAssistantConnection();
  if (!client || !list.available) throw new Error('Shared list is unavailable');
  if (capability && !list.capabilities[capability])
    throw new Error('This list does not support this action');
  return { client, list };
}

function optionalFields(list: NavetTodoList, input: Partial<NavetTodoItemInput>) {
  if (input.dueDate !== undefined && input.dueDateTime !== undefined)
    throw new Error('Choose a date or a date and time');
  const data: Record<string, unknown> = {};
  for (const [field, serviceField] of [
    ['description', 'description'],
    ['dueDate', 'due_date'],
    ['dueDateTime', 'due_datetime'],
  ] as const) {
    if (input[field] !== undefined) {
      if (!list.capabilities[field]) throw new Error('This list does not support this item field');
      data[serviceField] = input[field];
    }
  }
  return data;
}

function summary(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Item name is required');
  return trimmed;
}

async function call(
  client: PlatformMessageClient,
  listId: string,
  service: string,
  data: Record<string, unknown>
) {
  await client.sendMessagePromise({
    type: 'call_service',
    domain: 'todo',
    service,
    service_data: data,
    target: { entity_id: listId },
  });
}

async function readItems(listId: string, isCurrent: () => boolean = () => true) {
  const { client, list } = clientFor(listId);
  const source = sourceIdentity();
  const revision = advanceSnapshot(listId);
  const result = await client.sendMessagePromise<{ response?: Record<string, unknown> }>({
    type: 'call_service',
    domain: 'todo',
    service: 'get_items',
    service_data: { status: ['needs_action', 'completed'] },
    target: { entity_id: listId },
    return_response: true,
  });
  if (source !== sourceIdentity() || list.sessionKey !== sessionKey())
    throw new Error('Shared list connection changed');
  if (!isCurrent()) throw new Error('Shared list items changed');
  // Return the live snapshot with its target map when a subscription owns the visible list.
  if (nativeSnapshotOwners.get(listId)?.size) return nativeSnapshots.get(listId) ?? [];
  if (snapshotRevisions.get(listId) !== revision) throw new Error('Shared list items changed');
  return normalizeItems(listId, result.response?.[listId]);
}

export const homeAssistantTodoListFeatureService: ProviderTodoListFeatureService = {
  async getLists() {
    sessionKey();
    return Object.keys(getHomeAssistantEntities() ?? {})
      .filter((id) => id.startsWith('todo.'))
      .map(getList);
  },
  async subscribeLists(listener, onError) {
    let disposed = false;
    let generation = 0;
    const publish = () => {
      const attempt = ++generation;
      const source = sourceIdentity();
      void homeAssistantTodoListFeatureService
        .getLists()
        .then((lists) => {
          if (!disposed && attempt === generation && source === sourceIdentity()) listener(lists);
        })
        .catch((error) => {
          if (!disposed && attempt === generation) onError?.(error);
        });
    };
    const unsubscribers = ['entities', 'registries', 'connection'].map((event) =>
      addHomeAssistantListener(event as 'entities' | 'registries' | 'connection', publish)
    );
    publish();
    return () => {
      disposed = true;
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  },
  getItems: readItems,
  async subscribeItems(listId, listener, onError) {
    let disposed = false;
    let generation = 0;
    let currentSource: unknown;
    let activeUnsubscribe: (() => void) | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    const snapshotOwner = {};
    const stop = (invalidateReads = true) => {
      if (invalidateReads) advanceSnapshot(listId);
      const owners = nativeSnapshotOwners.get(listId);
      owners?.delete(snapshotOwner);
      if (owners?.size === 0) {
        nativeSnapshotOwners.delete(listId);
        nativeSnapshots.delete(listId);
      }
      if (activeUnsubscribe)
        void Promise.resolve(activeUnsubscribe()).catch((error) => onError?.(error));
      activeUnsubscribe = null;
      if (poll !== null) clearInterval(poll);
      poll = null;
    };
    const bind = async () => {
      const source = sourceIdentity();
      if (disposed || source === currentSource) return;
      const replacedSource = currentSource !== undefined;
      currentSource = source;
      const attempt = ++generation;
      stop(replacedSource);
      if (replacedSource && source) listener([]);
      if (!source) {
        listener([]);
        return;
      }
      const { client } = clientFor(listId);
      const publish = (result: unknown) => {
        if (disposed || attempt !== generation || source !== sourceIdentity()) return;
        try {
          const items = normalizeItems(listId, result);
          advanceSnapshot(listId);
          const owners = nativeSnapshotOwners.get(listId) ?? new Set();
          owners.add(snapshotOwner);
          nativeSnapshotOwners.set(listId, owners);
          nativeSnapshots.set(listId, items);
          listener(items);
        } catch (error) {
          onError?.(error);
        }
      };
      let unsubscribe: () => void = () => {};
      try {
        if (!client.subscribeMessage)
          throw new Error('Home Assistant panel connection cannot subscribe');
        unsubscribe = await client.subscribeMessage(publish, {
          type: 'todo/item/subscribe',
          entity_id: listId,
        });
      } catch (error) {
        if (disposed || attempt !== generation || source !== sourceIdentity()) return;
        const code =
          error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
        const message = error instanceof Error ? error.message : '';
        const cannotSubscribe = message === 'Home Assistant panel connection cannot subscribe';
        if (code !== 'unknown_command' && message !== 'unknown_command' && !cannotSubscribe)
          throw error;
        // Older HA versions expose only the list read API; polling also catches same-count edits.
        let refreshing = false;
        const refresh = async () => {
          if (refreshing || disposed || attempt !== generation) return;
          refreshing = true;
          try {
            const items = await readItems(
              listId,
              () => !disposed && attempt === generation && source === sourceIdentity()
            );
            if (!disposed && attempt === generation) listener(items);
          } catch (error) {
            if (!disposed && attempt === generation) onError?.(error);
          } finally {
            refreshing = false;
          }
        };
        if (!cannotSubscribe && client.subscribeMessage) {
          try {
            unsubscribe = await client.subscribeMessage<{ data?: { entity_id?: string } }>(
              (event) => {
                if (event.data?.entity_id === listId) void refresh();
              },
              { type: 'subscribe_events', event_type: 'state_changed' }
            );
          } catch (error) {
            if (disposed || attempt !== generation || source !== sourceIdentity()) return;
            throw error;
          }
        }
        if (!disposed && attempt === generation) {
          poll = setInterval(() => {
            void refresh();
          }, 30_000);
          void refresh();
        }
      }
      if (disposed || attempt !== generation || source !== sourceIdentity())
        void Promise.resolve(unsubscribe()).catch((error) => onError?.(error));
      else activeUnsubscribe = unsubscribe;
    };
    const stopConnectionListener = addHomeAssistantListener('connection', () => {
      const binding = bind();
      const attempt = generation;
      void binding.catch((error) => {
        if (!disposed && attempt === generation) onError?.(error);
      });
    });
    const initialBinding = bind();
    const initialAttempt = generation;
    const initialSource = currentSource;
    try {
      await initialBinding;
    } catch (error) {
      if (!disposed && initialAttempt === generation && initialSource === sourceIdentity()) {
        stopConnectionListener();
        stop();
        throw error;
      }
    }
    return () => {
      disposed = true;
      generation += 1;
      stopConnectionListener();
      stop();
    };
  },
  async addItem(listId, input, expectedSessionKey) {
    const { client, list } = clientFor(listId, 'add', expectedSessionKey);
    await call(client, listId, 'add_item', {
      item: summary(input.summary),
      ...optionalFields(list, input),
    });
  },
  async updateItem(listId, uid, input, expectedSessionKey) {
    const { client, list } = clientFor(listId, 'update', expectedSessionKey);
    if (!uid) throw new Error('Item identifier is required');
    const data: Record<string, unknown> = { ...optionalFields(list, input) };
    if (input.summary !== undefined) data.rename = summary(input.summary);
    if (input.completed !== undefined) data.status = input.completed ? 'completed' : 'needs_action';
    if (!Object.keys(data).length) throw new Error('An item change is required');
    await call(client, listId, 'update_item', { item: itemTarget(listId, uid), ...data });
  },
  async removeItem(listId, uid, expectedSessionKey) {
    const { client } = clientFor(listId, 'remove', expectedSessionKey);
    if (!uid) throw new Error('Item identifier is required');
    const target = itemTarget(listId, uid);
    if (summaryTargets.get(listId)?.get(uid)?.removable === false)
      throw new Error('This item does not support removal');
    await call(client, listId, 'remove_item', { item: target });
  },
};
