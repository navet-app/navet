import type { NavetCapabilityId } from './capabilities';
import type { NavetEntity } from './types';

export interface NavetTimerState {
  phase: 'idle' | 'active' | 'paused' | 'unknown';
  durationSeconds: number | null;
  remainingSeconds: number | null;
  finishesAt: string | null;
  canStart: boolean;
  canPause: boolean;
  canCancel: boolean;
  canFinish: boolean;
}
export interface NavetCounterState {
  value: number | null;
  min: number | null;
  max: number | null;
  step: number | null;
  initial: number | null;
  canIncrement: boolean;
  canDecrement: boolean;
  canReset: boolean;
  canSetValue: boolean;
}
export interface NavetValveState {
  phase: 'open' | 'closed' | 'opening' | 'closing' | 'unknown';
  position: number | null;
  canOpen: boolean;
  canClose: boolean;
  canStop: boolean;
  canSetPosition: boolean;
}
export interface NavetRemoteState {
  isOn: boolean | null;
  canTurnOn: boolean;
  canTurnOff: boolean;
}

const number = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const integer = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
const can = (entity: NavetEntity, capability: NavetCapabilityId) =>
  entity.availability === 'available' && entity.capabilities.includes(capability);

export function readNavetTimerState(entity: NavetEntity | undefined): NavetTimerState | undefined {
  if (entity?.type !== 'timer') return undefined;
  const attrs = entity.attributes;
  const phase =
    attrs.phase === 'idle' || attrs.phase === 'active' || attrs.phase === 'paused'
      ? attrs.phase
      : 'unknown';
  const duration = number(attrs.durationSeconds);
  const remaining = number(attrs.remainingSeconds);
  const running = phase === 'active' || phase === 'paused';
  return {
    phase,
    durationSeconds: duration !== null && duration >= 0 ? duration : null,
    remainingSeconds: remaining !== null && remaining >= 0 ? remaining : null,
    finishesAt:
      typeof attrs.finishesAt === 'string' && Number.isFinite(Date.parse(attrs.finishesAt))
        ? attrs.finishesAt
        : null,
    canStart: phase !== 'unknown' && can(entity, 'timer_start'),
    canPause: phase === 'active' && can(entity, 'timer_pause'),
    canCancel: running && can(entity, 'timer_cancel'),
    canFinish: running && can(entity, 'timer_finish'),
  };
}

export function readNavetCounterState(
  entity: NavetEntity | undefined
): NavetCounterState | undefined {
  if (entity?.type !== 'counter') return undefined;
  const attrs = entity.attributes;
  const value = integer(attrs.value);
  const min = integer(attrs.min);
  const max = integer(attrs.max);
  const rawStep = integer(attrs.step);
  const step = rawStep !== null && rawStep > 0 ? rawStep : null;
  const valid =
    step !== null &&
    (attrs.min == null || min !== null) &&
    (attrs.max == null || max !== null) &&
    (min === null || max === null || min <= max);
  return {
    value,
    min,
    max,
    step,
    initial: integer(attrs.initial),
    canIncrement:
      valid && value !== null && (max === null || value < max) && can(entity, 'counter_increment'),
    canDecrement:
      valid && value !== null && (min === null || value > min) && can(entity, 'counter_decrement'),
    canReset: can(entity, 'counter_reset'),
    canSetValue: valid && can(entity, 'counter_value'),
  };
}

export function readNavetValveState(entity: NavetEntity | undefined): NavetValveState | undefined {
  if (entity?.type !== 'valve') return undefined;
  const attrs = entity.attributes;
  const phase =
    attrs.phase === 'open' ||
    attrs.phase === 'closed' ||
    attrs.phase === 'opening' ||
    attrs.phase === 'closing'
      ? attrs.phase
      : 'unknown';
  const position = integer(attrs.position);
  const known = phase !== 'unknown';
  return {
    phase,
    position: position !== null && position >= 0 && position <= 100 ? position : null,
    canOpen: known && can(entity, 'valve_open'),
    canClose: known && can(entity, 'valve_close'),
    canStop: known && (phase === 'opening' || phase === 'closing') && can(entity, 'valve_stop'),
    canSetPosition: known && can(entity, 'position'),
  };
}

export function readNavetRemoteState(
  entity: NavetEntity | undefined
): NavetRemoteState | undefined {
  if (entity?.type !== 'remote') return undefined;
  const isOn = typeof entity.attributes.isOn === 'boolean' ? entity.attributes.isOn : null;
  return {
    isOn,
    canTurnOn: isOn !== null && can(entity, 'toggle'),
    canTurnOff: isOn !== null && can(entity, 'toggle'),
  };
}
