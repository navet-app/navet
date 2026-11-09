import { useMemo } from 'react';

interface UseClimateVisualModeParams {
  action?: string;
  currentTemp: number;
  isOn: boolean;
  mode: string;
  preferExplicitAction?: boolean;
  supportedClimateModes?: string[];
  targetTemp: number;
}

const WATER_HEATER_HEAT_MODES = new Set([
  'eco',
  'electric',
  'gas',
  'heat_pump',
  'high_demand',
  'performance',
]);

export function useClimateVisualMode({
  action,
  currentTemp,
  isOn,
  mode,
  preferExplicitAction = false,
  supportedClimateModes,
  targetTemp,
}: UseClimateVisualModeParams) {
  return useMemo(() => {
    const normalizedAction = action?.toLowerCase() ?? '';
    const normalizedMode = mode.toLowerCase();
    const normalizedSupportedModes =
      supportedClimateModes?.map((entry) => entry.toLowerCase()) ?? [];
    const temperatureDelta = targetTemp - currentTemp;
    const isExplicitlyIdle = normalizedAction.includes('idle');
    const isHeatingMode = normalizedMode === 'heat' || WATER_HEATER_HEAT_MODES.has(normalizedMode);
    const isCoolingMode = normalizedMode === 'cool';
    const isAutoLikeMode = normalizedMode === 'auto' || normalizedMode === 'heat_cool';
    const canCool =
      normalizedSupportedModes.length === 0 ||
      normalizedSupportedModes.includes('cool') ||
      normalizedSupportedModes.includes('heat_cool') ||
      normalizedSupportedModes.includes('auto');

    if (!isOn) {
      return 'off';
    }

    if (
      preferExplicitAction &&
      !['heat', 'cool', 'dry', 'fan', 'idle'].some((entry) => normalizedAction.includes(entry))
    ) {
      return 'unknown';
    }

    if (normalizedAction.includes('fan')) {
      return 'fan';
    }

    if (normalizedMode === 'fan' || normalizedMode === 'fan_only') {
      return 'fan';
    }

    if (isExplicitlyIdle) {
      return 'idle';
    }

    if (isCoolingMode) {
      if (normalizedAction.includes('cool')) {
        return 'cool';
      }

      if (canCool && temperatureDelta < -0.05) {
        return 'cool';
      }

      return 'idle';
    }

    if (isHeatingMode) {
      if (normalizedAction.includes('heat') && (preferExplicitAction || !canCool)) {
        return 'heat';
      }

      if (WATER_HEATER_HEAT_MODES.has(normalizedMode)) {
        return 'heat';
      }

      if (canCool && temperatureDelta < -0.05) {
        return 'cool';
      }

      if (normalizedAction.includes('heat')) {
        return 'heat';
      }

      if (temperatureDelta > 0.05) {
        return 'heat';
      }

      return 'idle';
    }

    if (temperatureDelta > 0.05) {
      return 'heat';
    }

    if (temperatureDelta < -0.05) {
      return 'cool';
    }

    if (normalizedAction.includes('heat')) {
      return 'heat';
    }

    if (normalizedAction.includes('cool')) {
      return 'cool';
    }

    if (isAutoLikeMode) {
      return 'idle';
    }

    return normalizedMode;
  }, [action, currentTemp, isOn, mode, preferExplicitAction, supportedClimateModes, targetTemp]);
}
