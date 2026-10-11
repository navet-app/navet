import {
  readNavetCounterState,
  readNavetRemoteState,
  readNavetTimerState,
  readNavetValveState,
} from '@navet/core/household-device-state';
import type { NavetCommand, NavetEntity } from '@navet/core/types';

export function getHomeAssistantHouseholdCommandRoute(
  entity: NavetEntity,
  command: NavetCommand
): { domain: string; service: string; data: Record<string, unknown> } {
  const domain = entity.externalId.split('.')[0];
  const unsupported = () => {
    throw new Error('Household control is unavailable or unsupported');
  };
  if (entity.type !== domain) return unsupported();
  if (domain === 'timer') {
    const state = readNavetTimerState(entity);
    if (!state) return unsupported();
    switch (command.type) {
      case 'timer_start':
        if (!state.canStart) return unsupported();
        if (
          command.durationSeconds !== undefined &&
          (!Number.isSafeInteger(command.durationSeconds) || command.durationSeconds <= 0)
        )
          throw new Error('Timer duration must be a positive whole number of seconds');
        return {
          domain,
          service: 'start',
          data: command.durationSeconds === undefined ? {} : { duration: command.durationSeconds },
        };
      case 'timer_pause':
        if (state.canPause) return { domain, service: 'pause', data: {} };
        break;
      case 'timer_cancel':
        if (state.canCancel) return { domain, service: 'cancel', data: {} };
        break;
      case 'timer_finish':
        if (state.canFinish) return { domain, service: 'finish', data: {} };
        break;
    }
  }
  if (domain === 'counter') {
    const state = readNavetCounterState(entity);
    if (!state) return unsupported();
    switch (command.type) {
      case 'counter_increment':
        if (state.canIncrement) return { domain, service: 'increment', data: {} };
        break;
      case 'counter_decrement':
        if (state.canDecrement) return { domain, service: 'decrement', data: {} };
        break;
      case 'counter_reset':
        if (state.canReset) return { domain, service: 'reset', data: {} };
        break;
      case 'set_counter_value':
        if (!state.canSetValue) return unsupported();
        if (
          !Number.isSafeInteger(command.value) ||
          (state.min !== null && command.value < state.min) ||
          (state.max !== null && command.value > state.max) ||
          state.step === null ||
          command.value % state.step !== 0
        )
          throw new Error('Counter value is outside the supported range or step');
        return { domain, service: 'set_value', data: { value: command.value } };
    }
  }
  if (domain === 'valve') {
    const state = readNavetValveState(entity);
    if (!state) return unsupported();
    switch (command.type) {
      case 'open':
        if (state.canOpen) return { domain, service: 'open_valve', data: {} };
        break;
      case 'close':
        if (state.canClose) return { domain, service: 'close_valve', data: {} };
        break;
      case 'stop':
        if (state.canStop) return { domain, service: 'stop_valve', data: {} };
        break;
      case 'set_position':
        if (!state.canSetPosition) return unsupported();
        if (!Number.isInteger(command.position) || command.position < 0 || command.position > 100)
          throw new Error('Valve position must be a whole percentage from 0 to 100');
        return { domain, service: 'set_valve_position', data: { position: command.position } };
    }
  }
  if (domain === 'remote') {
    const state = readNavetRemoteState(entity);
    if (command.type === 'turn_on' && state?.canTurnOn)
      return { domain, service: 'turn_on', data: {} };
    if (command.type === 'turn_off' && state?.canTurnOff)
      return { domain, service: 'turn_off', data: {} };
  }
  return unsupported();
}
