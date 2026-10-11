import { useIntegrationStore } from '@navet/app/hooks/use-integration-store';
import { useProviderEntityModel } from '@navet/app/hooks/use-provider-device';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import { parseProviderScopedId } from '@navet/app/utils/provider-ids';
import { useRef } from 'react';

/** Remount editable controls when their owning connection changes. */
export function useProviderControlSession(id: string, providerHint?: IntegrationProviderId) {
  const entity = useProviderEntityModel(id);
  const providerId = providerHint ?? entity?.providerId ?? parseProviderScopedId(id)?.providerId;
  const session = useIntegrationStore((store) =>
    providerId ? store.providerSessions[providerId] : undefined
  );
  const connected = useIntegrationStore((store) =>
    providerId ? store.providerRuntime[providerId]?.connected : undefined
  );
  const lifecycle = useRef({ session, connected, revision: 0 });
  if (lifecycle.current.session !== session || lifecycle.current.connected !== connected) {
    lifecycle.current = { session, connected, revision: lifecycle.current.revision + 1 };
  }
  return { providerId, key: `${providerId ?? ''}:${id}:${lifecycle.current.revision}` };
}
