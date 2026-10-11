import type { NavetEntity } from '@navet/core/types';
import type { HassEntity } from 'home-assistant-js-websocket';

export const HOME_ASSISTANT_HOUSEHOLD_DOMAINS = new Set(['timer', 'counter', 'valve', 'remote']);
const integer = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
function duration(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+:[0-5]\d:[0-5]\d$/.test(value)) return null;
  const [hours, minutes, seconds] = value.split(':').map(Number);
  const result = hours * 3600 + minutes * 60 + seconds;
  return Number.isSafeInteger(result) ? result : null;
}

export function mapHomeAssistantHouseholdControls(
  entity: HassEntity
): { attributes: Record<string, unknown>; capabilities: NavetEntity['capabilities'] } | undefined {
  const domain = entity.entity_id.split('.')[0];
  const attrs = entity.attributes;
  if (domain === 'timer')
    return {
      attributes: {
        phase: ['idle', 'active', 'paused'].includes(entity.state) ? entity.state : 'unknown',
        durationSeconds: duration(attrs.duration),
        remainingSeconds: duration(attrs.remaining),
        finishesAt:
          typeof attrs.finishes_at === 'string' && Number.isFinite(Date.parse(attrs.finishes_at))
            ? attrs.finishes_at
            : null,
      },
      capabilities: ['timer_start', 'timer_pause', 'timer_cancel', 'timer_finish'],
    };
  if (domain === 'counter') {
    const rawStep = integer(attrs.step);
    const step = rawStep !== null && rawStep > 0 ? rawStep : null;
    const min = integer(attrs.minimum);
    const max = integer(attrs.maximum);
    const valid =
      step !== null &&
      (attrs.minimum == null || min !== null) &&
      (attrs.maximum == null || max !== null) &&
      (min === null || max === null || min <= max);
    const value =
      typeof entity.state === 'string' &&
      /^-?\d+$/.test(entity.state) &&
      Number.isSafeInteger(Number(entity.state))
        ? Number(entity.state)
        : null;
    return {
      attributes: { value, min, max, step, initial: integer(attrs.initial) },
      capabilities: valid
        ? ['counter_increment', 'counter_decrement', 'counter_reset', 'counter_value']
        : ['counter_reset'],
    };
  }
  if (domain === 'valve') {
    const rawFeatures = integer(attrs.supported_features);
    const features = rawFeatures !== null && rawFeatures >= 0 ? rawFeatures : 0;
    const position = integer(attrs.current_position);
    const capabilities: NavetEntity['capabilities'] = [];
    if (features & 1) capabilities.push('valve_open');
    if (features & 2) capabilities.push('valve_close');
    if (features & 4) capabilities.push('position');
    if (features & 8) capabilities.push('valve_stop');
    return {
      attributes: {
        phase: ['open', 'closed', 'opening', 'closing'].includes(entity.state)
          ? entity.state
          : 'unknown',
        position: position !== null && position >= 0 && position <= 100 ? position : null,
      },
      capabilities,
    };
  }
  if (domain === 'remote')
    return {
      attributes: { isOn: entity.state === 'on' ? true : entity.state === 'off' ? false : null },
      capabilities: ['toggle'],
    };
  return undefined;
}
