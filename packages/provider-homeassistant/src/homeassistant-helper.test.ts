import {
  writableHelperEntities,
  writableHelperRegistry,
} from '@navet/app/test/fixtures/home-assistant/entities/writable-helper';
import { readNavetHelperState } from '@navet/core/helper-state';
import type { NavetCommand } from '@navet/core/types';
import { describe, expect, it } from 'vitest';
import { getHomeAssistantHelperCommandRoute } from './homeassistant-helper-commands';
import { mapHomeAssistantEntitiesToNavetEntities } from './homeassistant-mappers';

function mapped(entities = writableHelperEntities) {
  return mapHomeAssistantEntitiesToNavetEntities({
    entities,
    areas: [],
    deviceRegistry: [],
    entityRegistry: [],
  });
}
function entity(id: string) {
  const found = mapped().find((value) => value.externalId === id);
  if (!found) throw new Error(`Missing fixture ${id}`);
  return found;
}

describe('Home Assistant writable helper boundary', () => {
  it('retains device-owned configuration helpers for secondary controls', () => {
    const entities = mapHomeAssistantEntitiesToNavetEntities({
      entities: writableHelperEntities,
      areas: [],
      deviceRegistry: [],
      entityRegistry: writableHelperRegistry,
    });
    for (const id of ['number.threshold', 'select.profile']) {
      const entity = entities.find((entity) => entity.externalId === id);
      expect(entity).toMatchObject({ type: 'helper', attributes: { deviceId: 'device-kitchen' } });
      expect(readNavetHelperState(entity)?.writable).toBe(true);
    }
  });

  it('maps native datetime instants as explicitly UTC controls and writes UTC instants', () => {
    const [helper] = mapped({
      'datetime.departure': {
        ...writableHelperEntities['input_datetime.reminder'],
        entity_id: 'datetime.departure',
        state: '2026-10-25T02:30:00+02:00',
        attributes: { friendly_name: 'Departure' },
      },
    });
    expect(readNavetHelperState(helper)).toMatchObject({
      helperType: 'datetime',
      value: '2026-10-25 00:30:00',
      timeZone: 'UTC',
      writable: true,
    });
    expect(
      getHomeAssistantHelperCommandRoute(helper, {
        type: 'set_datetime_value',
        entityId: helper.id,
        value: '2026-10-25T01:30:00',
      })
    ).toEqual({
      domain: 'datetime',
      service: 'set_value',
      data: { datetime: '2026-10-25T01:30:00+00:00' },
    });
    expect(() =>
      getHomeAssistantHelperCommandRoute(helper, {
        type: 'set_datetime_value',
        entityId: helper.id,
        value: '2026-02-30T01:30:00',
      })
    ).toThrow();
  });
  it.each(['(?i)hello', '(?P<word>hello)', 'hello'])(
    'leaves backend pattern %s to Home Assistant validation',
    (pattern) => {
      const [helper] = mapped({
        'text.note': {
          ...writableHelperEntities['input_text.note'],
          entity_id: 'text.note',
          attributes: { min: 0, max: 40, pattern },
        },
      });
      expect(readNavetHelperState(helper)).toMatchObject({ writable: true });
      expect(readNavetHelperState(helper)).not.toHaveProperty('pattern', pattern);
      expect(
        getHomeAssistantHelperCommandRoute(helper, {
          type: 'set_text_value',
          entityId: helper.id,
          value: 'hello world',
        })
      ).toEqual({ domain: 'text', service: 'set_value', data: { value: 'hello world' } });
    }
  );
  it('retains config value controls alongside the device configuration metric', () => {
    const entities = {
      ...writableHelperEntities,
      'switch.heater': {
        ...writableHelperEntities['input_number.target'],
        entity_id: 'switch.heater',
        state: 'on',
        attributes: { friendly_name: 'Heater' },
      },
    };
    const mappedEntities = mapHomeAssistantEntitiesToNavetEntities({
      entities,
      areas: [],
      deviceRegistry: [],
      entityRegistry: [
        { entity_id: 'number.threshold', device_id: 'heater', entity_category: 'config' },
        { entity_id: 'input_select.house_mode', device_id: 'heater', entity_category: 'config' },
        { entity_id: 'switch.heater', device_id: 'heater' },
      ],
    });
    expect(
      mappedEntities.some(
        (value) =>
          value.externalId === 'number.threshold' || value.externalId === 'input_select.house_mode'
      )
    ).toBe(true);
    expect(
      mappedEntities.find((value) => value.externalId === 'switch.heater')?.attributes.metrics
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ category: 'configuration', value: 5 })])
    );
  });

  it('maps household helpers with normalized values and advertised controls', () => {
    expect(mapped()).toHaveLength(11);
    expect(readNavetHelperState(entity('input_number.target'))).toEqual({
      helperType: 'number',
      value: 20.5,
      writable: true,
      min: 10,
      max: 30,
      step: 0.5,
      unit: '°C',
    });
    expect(readNavetHelperState(entity('input_select.house_mode'))).toMatchObject({
      helperType: 'select',
      options: ['Home', 'Away'],
      value: 'Home',
      writable: true,
    });
    expect(readNavetHelperState(entity('input_text.note'))).toMatchObject({
      helperType: 'text',
      minLength: 0,
      maxLength: 40,
      mode: 'text',
    });
    expect(mapped().every((value) => value.type === 'helper')).toBe(true);
  });
  it.each([
    [
      'input_number.target',
      { type: 'set_number_value', value: 21.25 },
      'input_number',
      'set_value',
      { value: 21.25 },
    ],
    [
      'number.threshold',
      { type: 'set_number_value', value: 7 },
      'number',
      'set_value',
      { value: 7 },
    ],
    [
      'input_select.house_mode',
      { type: 'select_option', option: 'Away' },
      'input_select',
      'select_option',
      { option: 'Away' },
    ],
    [
      'select.profile',
      { type: 'select_option', option: 'Normal' },
      'select',
      'select_option',
      { option: 'Normal' },
    ],
    [
      'input_text.note',
      { type: 'set_text_value', value: 'Lunch' },
      'input_text',
      'set_value',
      { value: 'Lunch' },
    ],
    [
      'text.label',
      { type: 'set_text_value', value: 'Kitchen' },
      'text',
      'set_value',
      { value: 'Kitchen' },
    ],
    [
      'input_datetime.wakeup',
      { type: 'set_datetime_value', value: '08:15:00' },
      'input_datetime',
      'set_datetime',
      { time: '08:15:00' },
    ],
    [
      'input_datetime.birthday',
      { type: 'set_datetime_value', value: '2028-02-29' },
      'input_datetime',
      'set_datetime',
      { date: '2028-02-29' },
    ],
    [
      'input_datetime.reminder',
      { type: 'set_datetime_value', value: '2026-10-25T02:30:00' },
      'input_datetime',
      'set_datetime',
      { datetime: '2026-10-25 02:30:00' },
    ],
    [
      'date.filter',
      { type: 'set_datetime_value', value: '2028-02-29' },
      'date',
      'set_value',
      { date: '2028-02-29' },
    ],
    [
      'time.schedule',
      { type: 'set_datetime_value', value: '08:15:00' },
      'time',
      'set_value',
      { time: '08:15:00' },
    ],
  ])(
    'routes %s without changing local calendar semantics',
    (id, command, domain, service, data) => {
      expect(
        getHomeAssistantHelperCommandRoute(entity(id as string), {
          ...(command as object),
          entityId: id,
        } as NavetCommand)
      ).toEqual({ domain, service, data });
    }
  );
  it.each([
    ['input_number.target', { type: 'set_number_value', value: Number.NaN }],
    ['input_number.target', { type: 'set_number_value', value: 31 }],
    ['input_select.house_mode', { type: 'select_option', option: 'Missing' }],
    ['input_text.note', { type: 'set_text_value', value: 'a'.repeat(41) }],
    ['input_datetime.wakeup', { type: 'set_datetime_value', value: '24:00:00' }],
    ['input_datetime.birthday', { type: 'set_datetime_value', value: '2026-02-29' }],
    ['input_datetime.birthday', { type: 'set_datetime_value', value: '2028-04-31' }],
    ['input_datetime.reminder', { type: 'set_datetime_value', value: '2026-10-10T07:30:00Z' }],
    ['input_select.house_mode', { type: 'set_number_value', value: 1 }],
  ])('rejects invalid values for %s', (id, command) => {
    expect(() =>
      getHomeAssistantHelperCommandRoute(entity(id as string), {
        ...(command as object),
        entityId: id,
      } as NavetCommand)
    ).toThrow();
  });
  it.each(['unknown', 'unavailable'])('retains %s helpers without a writable action', (state) => {
    const [helper] = mapped({
      'input_number.target': { ...writableHelperEntities['input_number.target'], state },
    });
    expect(helper.availability).toBe(state);
    expect(helper.capabilities).toEqual([]);
    expect(readNavetHelperState(helper)).toMatchObject({ value: null, writable: false });
    expect(() =>
      getHomeAssistantHelperCommandRoute(helper, {
        type: 'set_number_value',
        entityId: helper.id,
        value: 20,
      })
    ).toThrow();
  });
  it('keeps malformed metadata read-only and respects missing advertised capabilities', () => {
    const [helper] = mapped({
      'input_number.target': {
        ...writableHelperEntities['input_number.target'],
        attributes: { min: 'ten', max: 30, step: 0.5 },
      },
    });
    expect(readNavetHelperState(helper)).toMatchObject({ writable: false });
    expect(readNavetHelperState({ ...entity('input_text.note'), capabilities: [] })).toMatchObject({
      writable: false,
    });
  });
});
