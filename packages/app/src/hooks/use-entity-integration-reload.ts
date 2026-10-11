import { getRegisteredProviderContract } from '@navet/app/provider-contract-registry';
import { integrationAdminService } from '@navet/app/services/integration-admin.service';
import { integrationStore } from '@navet/app/stores/integration-store';
import { parseProviderScopedId } from '@navet/core/ids';
import { isImplementedIntegrationProviderId } from '@navet/core/integration-providers';
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { useProviderId } from './use-integration-store';

/** Provider-neutral recovery state for the entity's owning integration. */
export function useEntityIntegrationReload(entityId?: string) {
  const providerId = useProviderId(parseProviderScopedId(entityId ?? '')?.providerId);
  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubscribeDashboard = integrationStore.subscribe(listener);
      const unsubscribeRecovery = entityId
        ? integrationAdminService.subscribeEntityIntegrationReload?.(entityId, listener)
        : undefined;
      // The merged dashboard can suppress registry-only and permission-only changes.
      const unsubscribeProvider =
        entityId && isImplementedIntegrationProviderId(providerId)
          ? getRegisteredProviderContract(providerId).subscribeState?.(listener)
          : undefined;
      return () => {
        unsubscribeDashboard();
        unsubscribeRecovery?.();
        unsubscribeProvider?.();
      };
    },
    [entityId, providerId]
  );
  const available = useSyncExternalStore(
    subscribe,
    () => Boolean(entityId && integrationAdminService.canReloadEntityIntegration(entityId)),
    () => false
  );
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);

  async function reload() {
    if (!entityId || pendingRef.current) return false;
    pendingRef.current = true;
    setPending(true);
    try {
      await integrationAdminService.reloadEntityIntegration(entityId);
      return true;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return { available, pending, reload };
}
