import { HA_PENDING_ECHO_WINDOW_MS } from '@navet/app/constants/interaction-timing';
import type { CommandResult } from '@navet/core/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Value = string | number | boolean;
type Phase = 'idle' | 'pending' | 'failed' | 'unconfirmed';

/** One command lane: retain requested drafts until the owning adapter confirms completion. */
export function useDeviceCommand<T extends Value>(
  owner: string,
  reported: T | undefined,
  writable: boolean
) {
  const [state, setState] = useState<{ owner: string; requested?: T; phase: Phase }>({
    owner,
    phase: 'idle',
  });
  const current = state.owner === owner ? state : { owner, phase: 'idle' as const };
  const identity = useMemo(() => ({}), [owner]);
  const active = useRef(identity);
  active.current = identity;
  const generation = useRef(0);
  const pending = useRef<T | undefined>(undefined);
  const lastAction = useRef<(() => Promise<CommandResult | undefined>) | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clear = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  useEffect(() => {
    generation.current += 1;
    pending.current = undefined;
    lastAction.current = undefined;
    clear();
    setState({ owner, phase: 'idle' });
    return () => {
      generation.current += 1;
      pending.current = undefined;
      clear();
    };
  }, [owner, clear]);

  useEffect(() => {
    if (pending.current === undefined) {
      if (
        (current.phase === 'failed' || current.phase === 'unconfirmed') &&
        Object.is(reported, current.requested)
      )
        setState({ owner, phase: 'idle' });
      return;
    }
    if (Object.is(reported, pending.current)) {
      generation.current += 1;
      pending.current = undefined;
      clear();
      setState({ owner, phase: 'idle' });
    } else if (!writable) {
      generation.current += 1;
      pending.current = undefined;
      clear();
      setState((previous) => ({ ...previous, owner, phase: 'failed' }));
    }
  }, [owner, reported, writable, clear, current.phase, current.requested]);

  const send = useCallback(
    async (requested: T, action: () => Promise<CommandResult | undefined>) => {
      if (!writable || (pending.current !== undefined && Object.is(pending.current, requested)))
        return;
      clear();
      const request = ++generation.current;
      const requestOwner = identity;
      const stillCurrent = () => active.current === requestOwner && generation.current === request;
      pending.current = requested;
      lastAction.current = action;
      setState({ owner, requested, phase: 'pending' });
      const fail = (unconfirmed = false) => {
        if (!stillCurrent()) return;
        pending.current = undefined;
        clear();
        setState({ owner, requested, phase: unconfirmed ? 'unconfirmed' : 'failed' });
      };
      timer.current = setTimeout(() => fail(true), HA_PENDING_ECHO_WINDOW_MS);
      try {
        const result = await action();
        if (!stillCurrent()) return;
        if (result && !result.accepted) {
          fail();
          return;
        }
        if (result && !result.requiresEventConfirmation) {
          pending.current = undefined;
          clear();
          setState({ owner, phase: 'idle' });
        }
      } catch {
        fail();
      }
    },
    [owner, identity, writable, clear]
  );

  return {
    reported,
    requested: current.requested,
    pending: current.phase === 'pending',
    failed: current.phase === 'failed' || current.phase === 'unconfirmed',
    unconfirmed: current.phase === 'unconfirmed',
    send,
    retry: () => {
      if (
        (current.phase === 'failed' || current.phase === 'unconfirmed') &&
        current.requested !== undefined &&
        lastAction.current
      ) {
        void send(current.requested, lastAction.current);
      }
    },
  };
}
