import { useIntegrationStore } from '@navet/app/hooks';
import { getProviderFeatureMatrix } from '@navet/app/provider-runtime-registry';
import {
  type ProviderUpsWidgetDataResult,
  resolveHomeyUpsSourceDeviceId,
  resolveProviderUpsWidgetData,
} from '@navet/app/services/integration-energy-widget.service';
import { integrationSelectors } from '@navet/app/stores/selectors';
import type { SensorDevice } from '@navet/app/types/device.types';
import { areRecordValuesEqual } from '@navet/app/utils/structural-equality';
import type { NavetEntity } from '@navet/core/types';
import { useMemo } from 'react';
import { useHomeAssistantUpsWidgetData } from './use-home-assistant-ups-widget-data';

export interface ProviderUpsWidgetDataOptions {
  use24HourTime: boolean;
}

const EMPTY_DEVICE_COLLECTION = {
  lights: [],
  fans: [],
  hvac: [],
  climate: [],
  media: [],
  weather: [],
  switches: [],
  timers: [],
  counters: [],
  valves: [],
  remotes: [],
  helpers: [],
  covers: [],
  locks: [],
  scenes: [],
  persons: [],
  sensors: [],
  vacuums: [],
  calendars: [],
  cameras: [],
  'grouped-sensors': [],
};
const EMPTY_SOURCE_DEVICE_IDS: string[] = [];
const EMPTY_SOURCE_DEVICES_BY_SOURCE_ID: Record<string, NavetEntity | null> = {};

function getSourceDeviceIds(sensors: SensorDevice[]) {
  return Array.from(new Set(sensors.map(resolveHomeyUpsSourceDeviceId))).sort();
}

export function useProviderUpsWidgetData(
  options: ProviderUpsWidgetDataOptions
): ProviderUpsWidgetDataResult {
  const currentProviderId = useIntegrationStore(integrationSelectors.currentProviderId);
  const providerDeviceCollection = useIntegrationStore(
    (state) =>
      currentProviderId === 'home_assistant'
        ? EMPTY_DEVICE_COLLECTION
        : (integrationSelectors.providerDeviceCollectionById(currentProviderId)(state) ??
          EMPTY_DEVICE_COLLECTION),
    Object.is
  );
  const supportsProviderEnergyNow = getProviderFeatureMatrix(currentProviderId).energyNow;
  const homeAssistantData = useHomeAssistantUpsWidgetData(options, supportsProviderEnergyNow);
  const sourceDeviceIds = useMemo(
    () =>
      currentProviderId === 'home_assistant'
        ? EMPTY_SOURCE_DEVICE_IDS
        : getSourceDeviceIds(providerDeviceCollection.sensors),
    [currentProviderId, providerDeviceCollection.sensors]
  );
  const sourceDevicesBySourceDeviceId = useIntegrationStore((state) => {
    if (sourceDeviceIds.length === 0) {
      return EMPTY_SOURCE_DEVICES_BY_SOURCE_ID;
    }

    const entities = integrationSelectors.providerEntitiesForId(currentProviderId)(state);
    const entityLookup = integrationSelectors.providerEntityLookupForId(currentProviderId)(state);

    return Object.fromEntries(
      sourceDeviceIds.map((sourceDeviceId) => {
        const canonicalId = entityLookup[sourceDeviceId];
        const entity = canonicalId ? (entities[canonicalId] ?? null) : null;

        return [
          sourceDeviceId,
          entity && entity.type !== 'sensor' && entity.type !== 'binary_sensor' ? entity : null,
        ];
      })
    ) as Record<string, NavetEntity | null>;
  }, areRecordValuesEqual);

  return useMemo(() => {
    return resolveProviderUpsWidgetData({
      currentProviderId,
      providerDeviceCollection,
      sourceDevicesBySourceDeviceId,
      homeAssistantData,
    });
  }, [
    currentProviderId,
    homeAssistantData,
    providerDeviceCollection,
    sourceDevicesBySourceDeviceId,
  ]);
}
