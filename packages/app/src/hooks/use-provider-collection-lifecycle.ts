import type { IntegrationProviderId } from '@navet/app/types/provider';
import { areDataEqual } from '@navet/app/utils/structural-equality';
import { subscribeVisibilityAwareAsyncTask } from '@navet/app/utils/visibility-aware-scheduler';
import { startTransition, useDeferredValue, useEffect, useRef, useState } from 'react';

/** Own refresh cancellation and scheduling; domain loaders own failure policy. */
export function useProviderCollectionData<T>({
  providerId,
  enabled,
  interval,
  empty,
  load,
  merge,
  retainWhenDisabled = false,
}: {
  providerId: IntegrationProviderId;
  enabled: boolean;
  interval: number;
  empty: T;
  load: () => Promise<T>;
  merge?: (previous: T, next: T) => T;
  retainWhenDisabled?: boolean;
}): T {
  const [state, setState] = useState({ providerId, data: empty });
  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      if (retainWhenDisabled) return;
      startTransition(() =>
        setState((previous) =>
          previous.providerId === providerId && Object.is(previous.data, empty)
            ? previous
            : { providerId, data: empty }
        )
      );
      return;
    }
    const unsubscribe = subscribeVisibilityAwareAsyncTask(
      async () => {
        try {
          const next = await load();
          if (cancelled) return;
          startTransition(() => {
            setState((previous) => {
              const data = merge
                ? merge(previous.providerId === providerId ? previous.data : empty, next)
                : next;
              return previous.providerId === providerId && areDataEqual(previous.data, data)
                ? previous
                : { providerId, data };
            });
          });
        } catch {
          // Retain the last successful result unless the domain loader supplied a fallback.
        }
      },
      interval,
      { runImmediately: true }
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [empty, enabled, interval, load, merge, providerId, retainWhenDisabled]);
  const deferred = useDeferredValue(state);
  return enabled && deferred.providerId === providerId ? deferred.data : empty;
}

/** Retain a collection during reconnect hydration, scoped to its provider. */
export function useHydratingProviderCollection<T>(
  providerId: IntegrationProviderId,
  devices: T[],
  enabled: boolean,
  hydrated: boolean,
  empty: T[]
): T[] {
  const lastResolved = useRef({ providerId, devices: empty });
  useEffect(() => {
    if (
      devices.length > 0 ||
      !enabled ||
      hydrated ||
      lastResolved.current.providerId !== providerId
    ) {
      lastResolved.current = { providerId, devices: devices.length > 0 ? devices : empty };
    }
  }, [devices, empty, enabled, hydrated, providerId]);
  if (devices.length > 0) return devices;
  return enabled && !hydrated && lastResolved.current.providerId === providerId
    ? lastResolved.current.devices
    : empty;
}
