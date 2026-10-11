import { dispatchEntityCommand } from '@navet/app/commands';
import { useIntegrationStore } from '@navet/app/hooks/use-integration-store';
import type { IntegrationProviderId } from '@navet/core/integration-providers';
import type { NavetUiCommand } from '@navet/core/types';
import { useEffect, useRef, useState } from 'react';

/** Keeps live device state authoritative while allowing recovery from stalled writes. */
export function useDeviceCommand({
  entityId,
  providerId,
  stateKey,
}: {
  entityId: string;
  providerId: IntegrationProviderId;
  stateKey: string;
}) {
  const session = useIntegrationStore((store) => store.providerSessions[providerId]);
  const connected = useIntegrationStore((store) => store.providerRuntime[providerId]?.connected);
  const lifecycle = useRef({ session, connected, revision: 0 });
  if (lifecycle.current.session !== session || lifecycle.current.connected !== connected) {
    lifecycle.current = { session, connected, revision: lifecycle.current.revision + 1 };
  }
  const owner = `${providerId}:${entityId}:${lifecycle.current.revision}`;
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const generation = useRef(0);
  const inFlight = useRef(false);
  const confirmation = useRef<((state: string) => boolean) | undefined>(undefined);
  const commandType = useRef<NavetUiCommand['type'] | null>(null);
  const [state, setState] = useState({ owner, pending: false, error: false, request: 0 });

  useEffect(() => {
    generation.current++;
    inFlight.current = false;
    confirmation.current = undefined;
    setState({ owner, pending: false, error: false, request: generation.current });
    return () => {
      generation.current++;
      inFlight.current = false;
    };
  }, [owner]);

  useEffect(() => {
    if (state.owner === owner && state.pending && confirmation.current?.(stateKey)) {
      generation.current++;
      inFlight.current = false;
      confirmation.current = undefined;
      setState({ owner, pending: false, error: false, request: generation.current });
    }
  }, [owner, state.owner, state.pending, state.request, stateKey]);

  useEffect(() => {
    if (state.owner !== owner || !state.pending) return;
    const attempt = generation.current;
    const timeout = setTimeout(() => {
      if (attempt !== generation.current || owner !== currentOwner.current) return;
      generation.current++;
      inFlight.current = false;
      confirmation.current = undefined;
      setState({ owner, pending: false, error: true, request: generation.current });
    }, 10_000);
    return () => clearTimeout(timeout);
  }, [owner, state.owner, state.pending, state.request]);

  async function execute(
    command: NavetUiCommand,
    confirm?: (current: string) => boolean,
    interrupt = false
  ) {
    if (!interrupt && (inFlight.current || (state.owner === owner && state.pending))) return false;
    inFlight.current = true;
    confirmation.current = confirm;
    commandType.current = command.type;
    const attempt = ++generation.current;
    setState({ owner, pending: true, error: false, request: attempt });
    try {
      const result = await dispatchEntityCommand(command, providerId);
      if (attempt !== generation.current || owner !== currentOwner.current) return false;
      if (!result.accepted) throw new Error('Device rejected the command');
      if (!result.requiresEventConfirmation || !confirm) {
        confirmation.current = undefined;
        setState({ owner, pending: false, error: false, request: attempt });
      }
      return true;
    } catch {
      if (attempt !== generation.current || owner !== currentOwner.current) return false;
      confirmation.current = undefined;
      setState({ owner, pending: false, error: true, request: attempt });
      return false;
    } finally {
      if (attempt === generation.current && owner === currentOwner.current)
        inFlight.current = false;
    }
  }

  return {
    pending: state.owner === owner && state.pending,
    pendingCommand: state.owner === owner && state.pending ? commandType.current : null,
    error: state.owner === owner && state.error,
    execute,
  };
}
