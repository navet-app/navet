import type { NavetHelperState } from '@navet/core/helper-state';
import type { HassEntity } from 'home-assistant-js-websocket';

export const HOME_ASSISTANT_VALUE_HELPER_DOMAINS = new Set([
  'number',
  'input_number',
  'select',
  'input_select',
  'text',
  'input_text',
  'input_datetime',
  'date',
  'time',
  'datetime',
]);

const finiteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function mapHomeAssistantHelper(entity: HassEntity): NavetHelperState | undefined {
  const domain = entity.entity_id.split('.')[0];
  const attributes = entity.attributes;
  const available = entity.state !== 'unknown' && entity.state !== 'unavailable';
  const value = available ? entity.state : null;
  if (domain === 'number' || domain === 'input_number') {
    const { min, max, step } = attributes;
    const valid =
      finiteNumber(min) && finiteNumber(max) && min <= max && finiteNumber(step) && step > 0;
    const numeric = value === null || value.trim() === '' ? null : Number(value);
    return {
      helperType: 'number',
      writable: available && valid,
      value: numeric !== null && Number.isFinite(numeric) ? numeric : null,
      min: valid ? min : 0,
      max: valid ? max : 0,
      step: valid ? step : 1,
      unit:
        typeof attributes.unit_of_measurement === 'string'
          ? attributes.unit_of_measurement
          : undefined,
    };
  }
  if (domain === 'select' || domain === 'input_select') {
    const valid =
      Array.isArray(attributes.options) &&
      attributes.options.every((option: unknown) => typeof option === 'string');
    const options = valid ? (attributes.options as string[]) : [];
    return { helperType: 'select', writable: available && options.length > 0, value, options };
  }
  if (domain === 'text' || domain === 'input_text') {
    const minLength = attributes.min ?? 0;
    const maxLength = attributes.max ?? (domain === 'input_text' ? 100 : 255);
    const valid =
      Number.isInteger(minLength) &&
      minLength >= 0 &&
      Number.isInteger(maxLength) &&
      maxLength >= minLength &&
      maxLength <= 255;
    return {
      helperType: 'text',
      writable: available && valid,
      value,
      minLength: valid ? minLength : 0,
      maxLength: valid ? maxLength : 255,
      mode: attributes.mode === 'password' ? 'password' : 'text',
    };
  }
  if (domain === 'date' || domain === 'time')
    return { helperType: domain, writable: available, value };
  if (domain === 'datetime') {
    const instant = value === null ? NaN : Date.parse(value);
    return {
      helperType: 'datetime',
      writable: available,
      timeZone: 'UTC',
      value: Number.isFinite(instant)
        ? new Date(instant).toISOString().slice(0, 19).replace('T', ' ')
        : null,
    };
  }
  if (domain === 'input_datetime') {
    const hasDate = attributes.has_date === true;
    const hasTime = attributes.has_time === true;
    return {
      helperType:
        hasDate && hasTime ? 'datetime' : hasDate ? 'date' : hasTime ? 'time' : 'datetime',
      writable: available && (hasDate || hasTime),
      value,
    };
  }
  return undefined;
}
