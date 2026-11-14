import type { TranslateFn } from '@navet/app/hooks';

export function getClimateTemperatureStatusLabel(
  t: TranslateFn,
  targetTemp: string | number,
  currentTemp: string | number,
  visualMode?: string,
  comparisonTargetTemp = Number(targetTemp),
  comparisonCurrentTemp = Number(currentTemp),
  hasTargetTemperature = true
) {
  if (visualMode === 'unknown')
    return hasTargetTemperature
      ? `${t('climate.target')} ${targetTemp}`
      : t('widgets.generic.unknown');

  if (visualMode === 'cool') {
    return t('climate.coolingDownTo', { temp: targetTemp });
  }

  if (visualMode === 'heat') {
    return t('climate.heatingTo', { temp: targetTemp });
  }

  if (visualMode === 'idle') {
    return hasTargetTemperature ? `${t('climate.idle')} · ${targetTemp}` : t('climate.idle');
  }

  if (visualMode === 'off') {
    return hasTargetTemperature ? `${t('common.off')} · ${targetTemp}` : t('common.off');
  }

  return comparisonTargetTemp < comparisonCurrentTemp
    ? t('climate.coolingDownTo', { temp: targetTemp })
    : t('climate.heatingTo', { temp: targetTemp });
}
