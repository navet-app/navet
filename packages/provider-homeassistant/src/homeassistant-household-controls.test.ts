import { householdControlEntityFactory } from '@navet/app/test/fixtures/home-assistant/entities/household-controls';
import {
  readNavetCounterState,
  readNavetRemoteState,
  readNavetTimerState,
  readNavetValveState,
} from '@navet/core/household-device-state';
import type { NavetCommand } from '@navet/core/types';
import { describe, expect, it } from 'vitest';
import { getHomeAssistantHouseholdCommandRoute } from './homeassistant-household-commands';
import { mapHomeAssistantEntitiesToNavetEntities } from './homeassistant-mappers';

function mapped(
  domain: 'timer' | 'counter' | 'valve' | 'remote',
  attributes: Record<string, unknown> = {},
  state?: string
) {
  const raw = householdControlEntityFactory(domain, attributes, state);
  return mapHomeAssistantEntitiesToNavetEntities({
    entities: { [raw.entity_id]: raw },
    areas: [],
    entityRegistry: [],
    deviceRegistry: [],
  })[0];
}
function route(
  domain: 'timer' | 'counter' | 'valve' | 'remote',
  command: Omit<NavetCommand, 'entityId'>,
  attributes: Record<string, unknown> = {},
  state?: string
) {
  const entity = mapped(domain, attributes, state);
  return getHomeAssistantHouseholdCommandRoute(entity, {
    ...command,
    entityId: entity.id,
  } as NavetCommand);
}
describe('household controls adapter boundary', () => {
  it.each(['timer', 'counter', 'valve', 'remote'] as const)(
    'keeps configuration-category %s entities out of household controls',
    (domain) => {
      const raw = householdControlEntityFactory(domain);
      expect(
        mapHomeAssistantEntitiesToNavetEntities({
          entities: { [raw.entity_id]: raw },
          areas: [],
          deviceRegistry: [],
          entityRegistry: [{ entity_id: raw.entity_id, entity_category: 'config' }],
        })
      ).toEqual([]);
    }
  );
  it('normalizes realistic timer, signed counter, valve and basic remote state', () => {
    expect(readNavetTimerState(mapped('timer'))).toEqual({
      phase: 'active',
      durationSeconds: 600,
      remainingSeconds: 600,
      finishesAt: '2026-10-11T12:10:00+00:00',
      canStart: true,
      canPause: true,
      canCancel: true,
      canFinish: true,
    });
    expect(readNavetCounterState(mapped('counter'))).toMatchObject({
      value: 4,
      min: -10,
      max: 20,
      step: 2,
      initial: 0,
      canSetValue: true,
    });
    expect(readNavetValveState(mapped('valve'))).toEqual({
      phase: 'opening',
      position: 35,
      canOpen: true,
      canClose: true,
      canStop: true,
      canSetPosition: true,
    });
    expect(readNavetRemoteState(mapped('remote'))).toEqual({
      isOn: false,
      canTurnOn: true,
      canTurnOff: true,
    });
  });
  it.each([
    ['timer', { type: 'timer_start' }, 'start', {}],
    ['timer', { type: 'timer_start', durationSeconds: 120 }, 'start', { duration: 120 }],
    ['timer', { type: 'timer_pause' }, 'pause', {}],
    ['timer', { type: 'timer_cancel' }, 'cancel', {}],
    ['timer', { type: 'timer_finish' }, 'finish', {}],
    ['counter', { type: 'counter_increment' }, 'increment', {}],
    ['counter', { type: 'counter_decrement' }, 'decrement', {}],
    ['counter', { type: 'counter_reset' }, 'reset', {}],
    ['counter', { type: 'set_counter_value', value: -4 }, 'set_value', { value: -4 }],
    ['valve', { type: 'open' }, 'open_valve', {}],
    ['valve', { type: 'close' }, 'close_valve', {}],
    ['valve', { type: 'stop' }, 'stop_valve', {}],
    ['valve', { type: 'set_position', position: 70 }, 'set_valve_position', { position: 70 }],
    ['remote', { type: 'turn_on' }, 'turn_on', {}],
    ['remote', { type: 'turn_off' }, 'turn_off', {}],
  ] as const)('routes %s %j to the exact native action', (domain, command, service, data) => {
    expect(route(domain, command)).toEqual({ domain, service, data });
  });
  it('resumes a paused timer without duration and finishes paused work', () => {
    expect(
      route(
        'timer',
        { type: 'timer_start' },
        { remaining: '0:02:03', finishes_at: undefined },
        'paused'
      ).data
    ).toEqual({});
    expect(route('timer', { type: 'timer_finish' }, {}, 'paused').service).toBe('finish');
    expect(
      readNavetTimerState(
        mapped('timer', { remaining: '0:02:03', finishes_at: undefined }, 'paused')
      )
    ).toMatchObject({ remainingSeconds: 123, finishesAt: null, canPause: false });
    expect(readNavetTimerState(mapped('timer', {}, 'idle'))).toMatchObject({
      canPause: false,
      canCancel: false,
      canFinish: false,
    });
  });
  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid timer duration %s',
    (durationSeconds) => {
      expect(() =>
        route('timer', { type: 'timer_start', durationSeconds } as Omit<NavetCommand, 'entityId'>)
      ).toThrow();
    }
  );
  it.each([-12, 22, 3, 2.5, Number.NaN])('rejects unsupported counter value %s', (value) => {
    expect(() =>
      route('counter', { type: 'set_counter_value', value } as Omit<NavetCommand, 'entityId'>)
    ).toThrow();
  });
  it('respects counter limits and does not invent bounds for an unbounded counter', () => {
    expect(readNavetCounterState(mapped('counter', {}, '20'))?.canIncrement).toBe(false);
    expect(readNavetCounterState(mapped('counter', {}, '-10'))?.canDecrement).toBe(false);
    expect(
      route(
        'counter',
        { type: 'set_counter_value', value: -100 } as Omit<NavetCommand, 'entityId'>,
        { minimum: undefined, maximum: undefined, step: 1 }
      ).data
    ).toEqual({ value: -100 });
  });
  it.each([0, -1, 2.5, '2'])('rejects malformed counter constraints %s', (step) => {
    expect(readNavetCounterState(mapped('counter', { step }))?.canSetValue).toBe(false);
  });
  it('only exposes explicitly advertised valve capabilities', () => {
    const entity = mapped(
      'valve',
      { supported_features: 4, current_position: undefined },
      'closed'
    );
    expect(readNavetValveState(entity)).toEqual({
      phase: 'closed',
      position: null,
      canOpen: false,
      canClose: false,
      canStop: false,
      canSetPosition: true,
    });
    expect(() =>
      getHomeAssistantHouseholdCommandRoute(entity, { type: 'open', entityId: entity.id })
    ).toThrow();
    expect(
      route(
        'valve',
        { type: 'set_position', position: 0 } as Omit<NavetCommand, 'entityId'>,
        { supported_features: 4 },
        'closed'
      ).data
    ).toEqual({ position: 0 });
    expect(readNavetValveState(mapped('valve', { supported_features: undefined }))).toMatchObject({
      canOpen: false,
      canClose: false,
      canStop: false,
      canSetPosition: false,
    });
  });
  it.each([-1, 101, 20.5, Number.NaN])('rejects invalid valve position %s', (position) => {
    expect(() =>
      route('valve', { type: 'set_position', position } as Omit<NavetCommand, 'entityId'>)
    ).toThrow();
  });
  it.each(['timer', 'counter', 'valve', 'remote'] as const)(
    'rejects unsupported and unavailable %s actions',
    (domain) => {
      const command = {
        timer: { type: 'timer_start' },
        counter: { type: 'counter_reset' },
        valve: { type: 'open' },
        remote: { type: 'turn_on' },
      }[domain] as Omit<NavetCommand, 'entityId'>;
      for (const state of ['unavailable', 'unknown'])
        expect(() => route(domain, command, {}, state)).toThrow();
      expect(() => route(domain, { type: 'start' })).toThrow();
      const entity = mapped(domain);
      entity.capabilities = [];
      expect(() =>
        getHomeAssistantHouseholdCommandRoute(entity, {
          ...command,
          entityId: entity.id,
        } as NavetCommand)
      ).toThrow();
    }
  );
  it('retains malformed display values as unknown instead of making up state', () => {
    expect(
      readNavetTimerState(
        mapped('timer', { duration: 'bad', remaining: '0:99:00', finishes_at: 'bad' })
      )
    ).toMatchObject({ durationSeconds: null, remainingSeconds: null, finishesAt: null });
    expect(readNavetCounterState(mapped('counter', {}, 'bad'))).toMatchObject({
      value: null,
      canIncrement: false,
      canDecrement: false,
    });
    expect(readNavetValveState(mapped('valve', { current_position: 101 }))).toMatchObject({
      position: null,
    });
  });
});
