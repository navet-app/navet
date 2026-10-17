import { HA_PENDING_ECHO_WINDOW_MS } from '@navet/app/constants/interaction-timing';

export interface ClimateOperatingState {
  mode: string;
  isOn: boolean;
  action?: string;
  supportedClimateModes?: string[];
}

export interface ClimateObservedState extends ClimateOperatingState {
  targetTemp?: number;
  currentTemp?: number;
}

export interface ClimateControlState extends ClimateOperatingState {
  targetTemp: number;
  currentTemp: number;
}

/** Owns optimistic values, provider echoes and failures for one Climate owner. */
export function createClimateReconciliation(initial: ClimateControlState) {
  let state = initial;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<ClimateControlState>) => {
    const next = { ...state, ...patch };
    const modesEqual =
      next.supportedClimateModes === state.supportedClimateModes ||
      (next.supportedClimateModes !== undefined &&
        state.supportedClimateModes !== undefined &&
        next.supportedClimateModes.length === state.supportedClimateModes.length &&
        next.supportedClimateModes.every(
          (mode, index) => mode === state.supportedClimateModes?.[index]
        ));
    if (
      next.targetTemp === state.targetTemp &&
      next.currentTemp === state.currentTemp &&
      next.mode === state.mode &&
      next.isOn === state.isOn &&
      next.action === state.action &&
      modesEqual
    )
      return;
    state = next;
    for (const listener of listeners) listener();
  };

  function lane<T>(read: () => T, apply: (value: T) => void, matches: (a: T, b: T) => boolean) {
    let confirmed = read();
    let pending: { value: T; previous: T; deferred?: T } | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A request remains identifiable after echo expiry, but a newer request or
    // confirmed echo makes an old failure obsolete.
    let latestRequest: object | undefined;
    const clear = () => {
      clearTimeout(timer);
      timer = undefined;
      pending = undefined;
    };
    return {
      observe(value: T) {
        confirmed = value;
        if (pending && !matches(value, pending.value)) {
          pending.deferred = value;
          return;
        }
        latestRequest = undefined;
        clear();
        apply(value);
      },
      request(value: T) {
        const previous = confirmed;
        clear();
        const request = { value, previous };
        pending = request;
        latestRequest = request;
        apply(value);
        timer = setTimeout(() => {
          const deferred = pending?.deferred;
          clear();
          if (deferred !== undefined) {
            latestRequest = undefined;
            apply(deferred);
          }
        }, HA_PENDING_ECHO_WINDOW_MS);
        return () => {
          if (latestRequest !== request) return;
          const rollback = pending?.deferred ?? request.previous;
          latestRequest = undefined;
          clear();
          apply(rollback);
        };
      },
      dispose() {
        latestRequest = undefined;
        clear();
        // Reconnection starts from the retained snapshot with no outstanding command.
        confirmed = read();
      },
    };
  }

  const temperature = lane(
    () => state.targetTemp,
    (targetTemp) => publish({ targetTemp }),
    (left, right) => Math.abs(left - right) <= 0.05
  );
  const operating = lane<ClimateOperatingState>(
    () => ({
      mode: state.mode,
      isOn: state.isOn,
      action: state.action,
      supportedClimateModes: state.supportedClimateModes,
    }),
    publish,
    (left, right) => left.mode === right.mode && left.isOn === right.isOn
  );

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    observe(observed: ClimateObservedState) {
      if (observed.currentTemp !== undefined) publish({ currentTemp: observed.currentTemp });
      if (observed.targetTemp !== undefined) temperature.observe(observed.targetTemp);
      operating.observe({
        mode: observed.mode,
        isOn: observed.isOn,
        action: observed.action,
        supportedClimateModes: observed.supportedClimateModes,
      });
    },
    requestTemperature: temperature.request,
    requestOperatingState: operating.request,
    dispose() {
      temperature.dispose();
      operating.dispose();
    },
  };
}
