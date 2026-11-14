import { normalizeTemperatureUnit } from '@navet/app/utils/temperature';
import { parseNumberish } from './numeric-utils';

interface ClimateEntityLike {
  state: string;
  attributes?: Record<string, unknown>;
}

export function resolveHomeAssistantTemperatureUnit(
  config: { unit_system?: { temperature?: unknown } } | null | undefined
) {
  return normalizeTemperatureUnit(config?.unit_system?.temperature);
}

export function resolveProviderTemperatureUnit(
  config:
    | {
        unit_system?: { temperature?: unknown };
        temperature_unit?: unknown;
        temperatureUnit?: unknown;
      }
    | null
    | undefined
) {
  return (
    normalizeTemperatureUnit(config?.temperature_unit) ??
    normalizeTemperatureUnit(config?.temperatureUnit) ??
    normalizeTemperatureUnit(config?.unit_system?.temperature)
  );
}

export function resolveClimateTemperatureUnit(
  entity: ClimateEntityLike | undefined,
  fallbackUnit?: unknown
) {
  if (!entity) {
    return normalizeTemperatureUnit(fallbackUnit);
  }

  return (
    normalizeTemperatureUnit(entity.attributes?.temperature_unit) ??
    normalizeTemperatureUnit(entity.attributes?.unit_of_measurement) ??
    normalizeTemperatureUnit(entity.attributes?.native_temperature_unit) ??
    normalizeTemperatureUnit(entity.attributes?.native_unit_of_measurement) ??
    normalizeTemperatureUnit(fallbackUnit)
  );
}

export function resolveClimateTargetTemperature(
  entity: ClimateEntityLike | undefined
): number | null {
  if (!entity) {
    return null;
  }

  const attrs = entity.attributes;
  const targetTemperature =
    parseNumberish(attrs?.temperature) ??
    parseNumberish(attrs?.target_temperature) ??
    parseNumberish(attrs?.target_temp);

  if (targetTemperature !== null) {
    return targetTemperature;
  }

  const targetLow = parseNumberish(attrs?.target_temp_low);
  const targetHigh = parseNumberish(attrs?.target_temp_high);

  if (targetLow === null && targetHigh === null) {
    return null;
  }

  const action = typeof attrs?.hvac_action === 'string' ? attrs.hvac_action.toLowerCase() : '';
  const mode = typeof entity.state === 'string' ? entity.state.toLowerCase() : '';

  if ((action.includes('cool') || mode === 'cool') && targetHigh !== null) {
    return targetHigh;
  }

  if ((action.includes('heat') || mode === 'heat') && targetLow !== null) {
    return targetLow;
  }

  if (targetLow !== null && targetHigh !== null) {
    return Number(((targetLow + targetHigh) / 2).toFixed(3));
  }

  return targetLow ?? targetHigh;
}
