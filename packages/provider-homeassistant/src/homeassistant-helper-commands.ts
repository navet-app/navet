import { readNavetHelperState } from '@navet/core/helper-state';
import type { NavetCommand, NavetEntity } from '@navet/core/types';
import { HOME_ASSISTANT_VALUE_HELPER_DOMAINS } from './homeassistant-helper';

const finiteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function validTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value);
}

export function getHomeAssistantHelperCommandRoute(entity: NavetEntity, command: NavetCommand) {
  const helper = readNavetHelperState(entity);
  const domain = entity.externalId.split('.')[0];
  if (!helper?.writable || !HOME_ASSISTANT_VALUE_HELPER_DOMAINS.has(domain))
    throw new Error('Helper is unavailable or read-only');
  switch (command.type) {
    case 'set_number_value':
      if (
        helper.helperType !== 'number' ||
        !entity.capabilities.includes('number_value') ||
        !finiteNumber(command.value) ||
        command.value < helper.min ||
        command.value > helper.max
      )
        throw new Error('Number value is outside the supported range');
      return { domain, service: 'set_value', data: { value: command.value } };
    case 'select_option':
      if (
        helper.helperType !== 'select' ||
        !entity.capabilities.includes('select_option') ||
        !helper.options.includes(command.option)
      )
        throw new Error('Option is not supported');
      return { domain, service: 'select_option', data: { option: command.option } };
    case 'set_text_value':
      if (
        helper.helperType !== 'text' ||
        !entity.capabilities.includes('text_value') ||
        typeof command.value !== 'string' ||
        [...command.value].length < helper.minLength ||
        [...command.value].length > helper.maxLength
      )
        throw new Error('Text does not meet the supported length');
      return { domain, service: 'set_value', data: { value: command.value } };
    case 'set_datetime_value': {
      if (
        !['date', 'time', 'datetime'].includes(helper.helperType) ||
        !entity.capabilities.includes('datetime_value') ||
        typeof command.value !== 'string'
      )
        throw new Error('Date or time is not supported');
      const value = command.value.replace('T', ' ');
      if (
        helper.helperType === 'date'
          ? !validDate(value)
          : helper.helperType === 'time'
            ? !validTime(value)
            : !(
                value.length === 19 &&
                validDate(value.slice(0, 10)) &&
                value[10] === ' ' &&
                validTime(value.slice(11))
              )
      )
        throw new Error('Date or time has an invalid format');
      return {
        domain,
        service: domain === 'input_datetime' ? 'set_datetime' : 'set_value',
        data:
          domain === 'datetime'
            ? { datetime: `${value.replace(' ', 'T')}+00:00` }
            : domain === 'input_datetime'
              ? { [helper.helperType]: value }
              : { [domain]: value },
      };
    }
    default:
      throw new Error('Unsupported helper command');
  }
}
