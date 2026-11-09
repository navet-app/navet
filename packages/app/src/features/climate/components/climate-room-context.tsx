import { DeviceControlOptions, DeviceControlRow } from '@navet/app/components/shared/device-editor';
import { useI18n } from '@navet/app/hooks';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import type { DeviceWithType } from '@navet/app/types/device.types';
import { getDeviceRoomLabel } from '@navet/app/utils/device-location';
import { ensureCanonicalEntityId } from '@navet/app/utils/provider-entity-id';
import { normalizeRoomName } from '@navet/app/utils/room-name';
import {
  convertTemperatureUnitValue,
  formatDisplayTemperature,
  normalizeTemperatureUnit,
  type TemperatureUnit,
} from '@navet/app/utils/temperature';

/** Room IDs survive renames. Label-only adapters retain the existing normalized room seam. */
export function getClimateRoomContextKey(room: string, devices: DeviceWithType[]): string {
  const ids = [
    ...new Set(
      devices.map((device) => ('roomId' in device ? device.roomId : undefined)).filter(Boolean)
    ),
  ].sort();
  return ids.length === 1 ? `id:${ids[0]}` : `name:${normalizeRoomName(room)}`;
}

export function ClimateRoomContext({
  room,
  roomKey,
  deviceMap,
  temperatureUnit,
  isEditMode,
}: {
  room: string;
  roomKey: string;
  deviceMap: Map<string, DeviceWithType>;
  temperatureUnit: TemperatureUnit;
  isEditMode: boolean;
}) {
  const { t } = useI18n();
  const selections = useSettingsStore((state) => state.climateRoomSources[roomKey]);
  const devices = [...deviceMap.values()];

  return (
    <section aria-label={t('climate.roomContext.readings', { room })}>
      {(['temperature', 'humidity'] as const).map((metric) => {
        const sourceId = selections?.[metric];
        const candidates = devices.filter(
          (device) => device.type === 'sensors' && device.deviceClass?.toLowerCase() === metric
        );
        const source = candidates.find(
          (device) => ensureCanonicalEntityId(device.canonicalId ?? device.id) === sourceId
        );
        const sourceName =
          source?.name ??
          (sourceId ? t('climate.roomContext.missing') : t('climate.roomContext.none'));
        let reading = '—';
        if (
          source?.type === 'sensors' &&
          source.status !== 'unavailable' &&
          !['unknown', 'unavailable'].includes(source.availability ?? '')
        ) {
          const value =
            typeof source.value === 'number' ||
            (typeof source.value === 'string' && source.value.trim())
              ? Number(source.value)
              : Number.NaN;
          const sourceUnit = normalizeTemperatureUnit(source.unit);
          if (Number.isFinite(value)) {
            if (metric === 'temperature' && sourceUnit) {
              reading = `${formatDisplayTemperature(convertTemperatureUnitValue(value, sourceUnit, temperatureUnit))} ${temperatureUnit === 'celsius' ? '°C' : '°F'}`;
            } else if (metric === 'humidity' && value >= 0 && value <= 100) {
              reading = `${formatDisplayTemperature(value)} %`;
            }
          }
        }
        const label = t(
          metric === 'temperature'
            ? 'climate.roomContext.temperature'
            : 'climate.roomContext.humidity'
        );
        const value = `${reading} · ${sourceName}${source && reading === '—' ? ` · ${t('common.unavailable')}` : ''}`;
        return isEditMode ? (
          <DeviceControlRow key={metric} kind="disclosure" label={label} value={value}>
            <DeviceControlOptions
              label={label}
              value={sourceId ?? ''}
              options={[
                { value: '', label: t('climate.roomContext.none') },
                ...(sourceId && !source
                  ? [{ value: sourceId, label: t('climate.roomContext.missing') }]
                  : []),
                ...candidates.map((device) => ({
                  value: ensureCanonicalEntityId(device.canonicalId ?? device.id),
                  label: `${device.name} · ${getDeviceRoomLabel(device)}`,
                })),
              ]}
              onValueChange={(id) => {
                const { climateRoomSources, updateSettings } = useSettingsStore.getState();
                updateSettings({
                  climateRoomSources: {
                    ...climateRoomSources,
                    [roomKey]: { ...climateRoomSources[roomKey], [metric]: id },
                  },
                });
              }}
            />
          </DeviceControlRow>
        ) : (
          <DeviceControlRow key={metric} kind="reading" label={label} value={value} />
        );
      })}
    </section>
  );
}
