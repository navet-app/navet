import type { NavetClimateState } from '@navet/app/core/navet-device-state';
import { parseNumberish, resolveClimateTargetTemperature } from '@navet/app/hooks/entity-utils';
import type { PlatformEntitySnapshot } from '@navet/app/platform/provider-feature-models';
import type { ClimateControlState, ClimateObservedState } from './climate-reconciliation';

function parseSupportedClimateModes(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((mode): mode is string => typeof mode === 'string');
}

function resolveMode(
  liveEntity: PlatformEntitySnapshot,
  attrs: Record<string, unknown>,
  initialMode: string
) {
  if (typeof liveEntity.state === 'string' && liveEntity.state) {
    return liveEntity.state;
  }

  if (typeof attrs.hvac_mode === 'string') {
    return attrs.hvac_mode;
  }

  if (typeof attrs.operation_mode === 'string') {
    return attrs.operation_mode;
  }
  return initialMode;
}

function resolveSupportedModes(liveEntity: PlatformEntitySnapshot, attrs: Record<string, unknown>) {
  const supportedModes = parseSupportedClimateModes(attrs.hvac_modes ?? attrs.operation_list);
  return liveEntity.entityId.startsWith('water_heater.') ? (supportedModes ?? []) : supportedModes;
}

export function resolveClimateEntityState({
  liveEntity,
  providerState,
  initial,
}: {
  liveEntity?: PlatformEntitySnapshot;
  providerState?: NavetClimateState | null;
  initial: ClimateControlState;
}): ClimateObservedState {
  if (liveEntity) {
    const attrs = liveEntity.attributes as Record<string, unknown>;
    return {
      mode: resolveMode(liveEntity, attrs, initial.mode),
      isOn: liveEntity.state !== 'off',
      action: typeof attrs.hvac_action === 'string' ? attrs.hvac_action : initial.action,
      supportedClimateModes: resolveSupportedModes(liveEntity, attrs),
      targetTemp: resolveClimateTargetTemperature(liveEntity) ?? undefined,
      currentTemp: parseNumberish(attrs.current_temperature) ?? undefined,
    };
  }
  if (providerState) {
    return {
      targetTemp:
        typeof providerState.temperature === 'number'
          ? providerState.temperature
          : initial.targetTemp,
      currentTemp:
        typeof providerState.currentTemperature === 'number'
          ? providerState.currentTemperature
          : initial.currentTemp,
      mode: typeof providerState.mode === 'string' ? providerState.mode : initial.mode,
      action: typeof providerState.action === 'string' ? providerState.action : initial.action,
      supportedClimateModes: providerState.supportedClimateModes ?? initial.supportedClimateModes,
      isOn:
        (providerState.mode ?? initial.mode) !== 'off' && (providerState.value ?? 'off') !== 'off',
    };
  }
  return initial;
}
