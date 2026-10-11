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
  entryId: string | null;
  supported: boolean;
  version: number;
  listeners: Set<() => void>;
};
type Session = {
  connection: PlatformMessageClient;
  active: boolean;
  ready: Promise<void>;
  entries: Map<string, boolean>;
  revisions: Map<string, number>;
  requests: Map<string, Promise<boolean>>;
  cleanups: (() => void)[];
};
const watches = new Map<string, Watch>();
let session: Session | null = null;
let unsubscribeStore: (() => void) | null = null;

function notify(watch: Watch) {
  for (const listener of watch.listeners) listener();
}

function closeSession() {
  if (!session) return;
  session.active = false;
  for (const cleanup of session.cleanups) cleanup();
  session = null;
}

async function getEntrySupport(current: Session, entryId: string): Promise<boolean> {
  if (current.entries.has(entryId)) return current.entries.get(entryId) === true;
  const pending = current.requests.get(entryId);
  if (pending) return pending;
  const revision = current.revisions.get(entryId);
  const request = current.connection
    .sendMessagePromise<{
      config_entry: { supports_unload?: boolean | null };
    }>({ type: 'config_entries/get_single', entry_id: entryId })
    .then((result) => {
      if (current.active && current.revisions.get(entryId) === revision) {
        current.entries.set(entryId, result.config_entry?.supports_unload === true);
      }
      return current.entries.get(entryId) === true;
    });
  current.requests.set(entryId, request);
  try {
    return await request;
  } finally {
    current.requests.delete(entryId);
  }
}

async function refresh(nativeId: string, watch: Watch, current: Session) {
  const version = ++watch.version;
  watch.entryId = null;
  watch.supported = false;
  notify(watch);
  const isCurrent = () =>
    current.active &&
    watches.get(nativeId) === watch &&
    version === watch.version &&
    isReloadConnectionCurrent(nativeId, current.connection);
  try {
    await current.ready;
    if (!isCurrent()) return;
    const { connection, entryId } = await resolveReloadEntryId(nativeId);
    if (!isCurrent() || connection !== current.connection) return;
    watch.entryId = entryId;
    const supported = await getEntrySupport(current, entryId);
    if (!isCurrent()) return;
    watch.supported = supported;
    notify(watch);
  } catch {
    // Unknown support stays hidden. Registry/config updates can retry failed lookups.
  }
}

function startSubscriptions(current: Session) {
  const connection = current.connection;
  if (!connection.subscribeMessage) return;
  const retain = (cleanup: () => void) => {
    if (current.active) current.cleanups.push(cleanup);
    else cleanup();
  };
  const registrySubscription = connection
    .subscribeMessage<{
      data?: { entity_id?: string; old_entity_id?: string };
    }>(
      (event) => {
        if (!current.active) return;
        for (const id of new Set([event.data?.entity_id, event.data?.old_entity_id])) {
          if (!id) continue;
          const watch = watches.get(id);
          if (watch) void refresh(id, watch, current);
        }
      },
      { type: 'subscribe_events', event_type: 'entity_registry_updated' }
    )
    .then(retain);
  const configSubscription = connection
    .subscribeMessage<
      {
        type: string | null;
        entry: { entry_id: string; supports_unload?: boolean };
      }[]
    >(
      (updates) => {
        if (!current.active) return;
        const changed = new Set<string>();
        for (const update of updates) {
          const id = update.entry.entry_id;
          current.revisions.set(id, (current.revisions.get(id) ?? 0) + 1);
          current.entries.set(
            id,
            update.type !== 'removed' && update.entry.supports_unload === true
          );
          changed.add(id);
        }
        for (const watch of watches.values()) {
          if (!watch.entryId || !changed.has(watch.entryId)) continue;
          watch.supported = current.entries.get(watch.entryId) === true;
          notify(watch);
        }
      },
      { type: 'config_entries/subscribe' }
    )
    .then(retain);
  // One initial config-entry list per session; attach before resolving ownership.
  current.ready = Promise.allSettled([registrySubscription, configSubscription]).then(() => {});
}

function reconcileSession() {
  const nativeId = watches.keys().next().value;
  const connection = nativeId ? authorizedConnection(nativeId) : null;
  if (connection === session?.connection || (!connection && !session)) return false;
  closeSession();
  for (const watch of watches.values()) {
    ++watch.version;
    watch.entryId = null;
    watch.supported = false;
    notify(watch);
  }
  if (connection) {
    const current: Session = {
      connection,
      active: true,
      ready: Promise.resolve(),
      entries: new Map(),
      revisions: new Map(),
      requests: new Map(),
      cleanups: [],
    };
    session = current;
    startSubscriptions(current);
    for (const [id, watch] of watches) void refresh(id, watch, current);
  }
  return true;
}

export function canReloadEntityIntegration(entityId: string) {
  const watch = watches.get(getProviderNativeId(entityId));
  return Boolean(
    session?.active && isReloadConnectionCurrent(entityId, session.connection) && watch?.supported
  );
}

export function subscribeEntityIntegrationReload(entityId: string, listener: () => void) {
  const nativeId = getProviderNativeId(entityId);
  const scopedId = parseProviderScopedId(entityId);
  if (scopedId && scopedId.providerId !== 'home_assistant') return () => {};
  let watch = watches.get(nativeId);
  if (!watch) {
    watch = { entryId: null, supported: false, version: 0, listeners: new Set() };
    watches.set(nativeId, watch);
    unsubscribeStore ??= subscribeHomeAssistantStore(reconcileSession);
    const replacedSession = reconcileSession();
    if (!replacedSession && session) void refresh(nativeId, watch, session);
  }
  watch.listeners.add(listener);
  const current = watch;
  let subscribed = true;
  return () => {
    if (!subscribed) return;
    subscribed = false;
    current.listeners.delete(listener);
    if (current.listeners.size > 0) return;
    ++current.version;
    watches.delete(nativeId);
    if (watches.size === 0) {
      closeSession();
      unsubscribeStore?.();
      unsubscribeStore = null;
    }
  };
}
