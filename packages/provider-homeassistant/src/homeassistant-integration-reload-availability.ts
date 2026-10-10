import { getProviderNativeId, parseProviderScopedId } from '@navet/core/ids';
import type { PlatformMessageClient } from '@navet/core/provider-feature-models';
import {
  getHomeAssistantConnection,
  getHomeAssistantStoreState,
  subscribeHomeAssistantStore,
} from './homeassistant-service-bridge';

function authorizedConnection(entityId: string) {
  const scopedId = parseProviderScopedId(entityId);
  const state = getHomeAssistantStoreState();
  if (
    (scopedId && scopedId.providerId !== 'home_assistant') ||
    !state.connected ||
    state.reconnecting ||
    state.user?.is_admin !== true
  )
    return null;
  return getHomeAssistantConnection();
}

export function isReloadConnectionCurrent(entityId: string, connection: PlatformMessageClient) {
  return authorizedConnection(entityId) === connection;
}

/** Resolve ownership from HA, including entities added after session bootstrap. */
export async function resolveReloadEntryId(entityId: string) {
  const connection = authorizedConnection(entityId);
  if (!connection) throw new Error('Integration reload is unavailable for this entity or session');
  const entry = await connection.sendMessagePromise<{ config_entry_id?: string | null }>({
    type: 'config/entity_registry/get',
    entity_id: getProviderNativeId(entityId),
  });
  if (authorizedConnection(entityId) !== connection || !entry?.config_entry_id) {
    throw new Error('Integration reload is unavailable for this entity or session');
  }
  return { connection, entryId: entry.config_entry_id };
}

type Watch = {
  connection: PlatformMessageClient | null;
  entryId: string | null;
  supported: boolean;
  listeners: Set<() => void>;
  stop: () => void;
};
const watches = new Map<string, Watch>();

export function canReloadEntityIntegration(entityId: string) {
  const watch = watches.get(getProviderNativeId(entityId));
  const connection = authorizedConnection(entityId);
  return Boolean(connection && watch?.connection === connection && watch.supported);
}

export function subscribeEntityIntegrationReload(entityId: string, listener: () => void) {
  const nativeId = getProviderNativeId(entityId);
  const scopedId = parseProviderScopedId(entityId);
  if (scopedId && scopedId.providerId !== 'home_assistant') return () => {};
  let watch = watches.get(nativeId);
  if (!watch) {
    const current: Watch = {
      connection: null,
      entryId: null,
      supported: false,
      listeners: new Set(),
      stop: () => {},
    };
    watch = current;
    watches.set(nativeId, current);
    let version = 0;
    let epoch = 0;
    let cleanups: (() => void)[] = [];
    const notify = () => {
      for (const callback of current.listeners) callback();
    };
    const clearSubscriptions = () => {
      for (const cleanup of cleanups) cleanup();
      cleanups = [];
    };
    const refresh = async () => {
      const requestVersion = ++version;
      current.entryId = null;
      current.supported = false;
      notify();
      try {
        const { connection, entryId } = await resolveReloadEntryId(nativeId);
        if (requestVersion !== version || connection !== current.connection) return;
        current.entryId = entryId;
        const result = await connection.sendMessagePromise<{
          config_entry: { supports_unload?: boolean | null };
        }>({ type: 'config_entries/get_single', entry_id: entryId });
        if (
          requestVersion !== version ||
          connection !== current.connection ||
          authorizedConnection(nativeId) !== connection
        )
          return;
        current.supported = result.config_entry?.supports_unload === true;
        notify();
      } catch {
        // Unsupported or failed lookups stay hidden; live updates can retry them.
      }
    };
    const reconcile = () => {
      const connection = authorizedConnection(nativeId);
      if (connection === current.connection) return;
      ++version;
      ++epoch;
      clearSubscriptions();
      current.connection = connection;
      current.entryId = null;
      current.supported = false;
      notify();
      if (!connection) return;
      const subscriptionEpoch = epoch;
      const retain = (unsubscribe: () => void) => {
        if (subscriptionEpoch !== epoch || current.connection !== connection) unsubscribe();
        else cleanups.push(unsubscribe);
      };
      if (connection.subscribeMessage) {
        const registrySubscription = connection
          .subscribeMessage<{ data?: { entity_id?: string; old_entity_id?: string } }>(
            (event) => {
              if (subscriptionEpoch !== epoch || current.connection !== connection) return;
              if (event.data?.entity_id === nativeId || event.data?.old_entity_id === nativeId)
                void refresh();
            },
            { type: 'subscribe_events', event_type: 'entity_registry_updated' }
          )
          .then(retain);
        const configSubscription = connection
          .subscribeMessage<
            { type: string | null; entry: { entry_id: string; supports_unload?: boolean } }[]
          >(
            (updates) => {
              if (subscriptionEpoch !== epoch || current.connection !== connection) return;
              for (const update of updates) {
                if (update.entry.entry_id !== current.entryId) continue;
                ++version;
                current.supported =
                  update.type !== 'removed' && update.entry.supports_unload === true;
                notify();
              }
            },
            { type: 'config_entries/subscribe' }
          )
          .then(retain);
        // Subscribe before the first lookup so updates during hydration cannot be missed.
        void Promise.allSettled([registrySubscription, configSubscription]).then(() => {
          if (subscriptionEpoch === epoch && current.connection === connection) void refresh();
        });
      } else {
        void refresh();
      }
    };
    const unsubscribeStore = subscribeHomeAssistantStore(reconcile);
    current.stop = () => {
      ++version;
      ++epoch;
      unsubscribeStore();
      clearSubscriptions();
      current.connection = null;
    };
    reconcile();
  }
  watch.listeners.add(listener);
  const current = watch;
  return () => {
    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      current.stop();
      watches.delete(nativeId);
    }
  };
}
