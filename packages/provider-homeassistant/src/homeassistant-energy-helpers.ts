import type { EnergySourceConfig } from '@navet/core/energy-types';
import type {
  PlatformEnergyEntityLike,
  PlatformEnergyEntityMap,
  PlatformEnergyEntityRegistryEntry,
} from '@navet/core/provider-feature-models';

export interface HaEnergySolarSource {
  type: 'solar';
  stat_energy_from: string;
  stat_rate?: string;
}

export interface HaEnergyGridSource {
  type: 'grid';
  stat_energy_from?: string;
  stat_energy_to?: string | null;
  stat_rate?: string;
  flow_from?: { stat_energy_from: string; stat_rate?: string }[];
  flow_to?: { stat_energy_to: string }[];
}

export interface HaEnergyBatterySource {
  type: 'battery';
  stat_energy_from: string;
  stat_energy_to: string;
  stat_rate?: string;
}

export interface HaEnergyGasOrWaterSource {
  type: 'gas' | 'water';
  stat_energy_from: string;
}

export type HaEnergySource =
  | HaEnergySolarSource
  | HaEnergyGridSource
  | HaEnergyBatterySource
  | HaEnergyGasOrWaterSource;

export interface HaDeviceConsumption {
  stat_consumption: string;
  stat_rate?: string;
  name?: string;
}

export interface HaEnergyPrefs {
  energy_sources: HaEnergySource[];
  device_consumption: HaDeviceConsumption[];
  device_consumption_water?: HaDeviceConsumption[];
}

export type HaEnergyEntityMap = PlatformEnergyEntityMap;
export type HaEnergyEntityLike = PlatformEnergyEntityLike;
export type HaEnergyEntityRegistryEntry = PlatformEnergyEntityRegistryEntry & {
  entity_id?: string;
  device_id?: string | null;
};

interface PowerEntityAnalysis {
  bestHomeLoadCandidateId?: string;
  powerEntityIds: Set<string>;
  siblingEntityIdsByDeviceId: Map<string, string[]>;
  sourceDeviceIdByEntityId: Map<string, string>;
}

function getRegistryEntityId(entry: HaEnergyEntityRegistryEntry): string {
  return entry.entityId ?? entry.entity_id ?? '';
}

function getRegistryDeviceId(entry: HaEnergyEntityRegistryEntry): string | null | undefined {
  return entry.deviceId ?? entry.device_id;
}

function getEntityDeviceClass(entity: HaEnergyEntityLike | undefined): string {
  return String(entity?.attributes?.device_class ?? '').toLowerCase();
}

function getEntityUnit(entity: HaEnergyEntityLike | undefined): string {
  return String(
    entity?.attributes?.unit_of_measurement ?? entity?.attributes?.native_unit_of_measurement ?? ''
  ).toUpperCase();
}

function parsePowerEntityWatts(entity: HaEnergyEntityLike | undefined): number | null {
  if (!entity) {
    return null;
  }

  const raw = Number.parseFloat(String(entity.state));
  if (!Number.isFinite(raw)) {
    return null;
  }

  const unit = getEntityUnit(entity);
  if (unit === 'W') {
    return raw;
  }
  if (unit === 'KW') {
    return raw * 1000;
  }

  return getEntityDeviceClass(entity) === 'power' ? raw : null;
}

function isLikelyPowerSensor(entityId: string, entity: HaEnergyEntityLike | undefined): boolean {
  if (parsePowerEntityWatts(entity) === null) {
    return false;
  }

  const friendlyName = String(entity?.attributes?.friendly_name ?? '').toLowerCase();
  const haystack = `${entityId} ${friendlyName}`;

  return (
    getEntityDeviceClass(entity) === 'power' ||
    getEntityUnit(entity) === 'W' ||
    getEntityUnit(entity) === 'KW' ||
    haystack.includes('power') ||
    haystack.includes('demand') ||
    haystack.includes('electrical_measurement')
  );
}

function getPowerCandidateIds(energyEntityId: string): string[] {
  return [
    energyEntityId.replace('_summation_delivered', '_instantaneous_demand'),
    energyEntityId.replace('_summation_received', '_instantaneous_demand'),
    energyEntityId.replace('_summation_delivered', '_power'),
    energyEntityId.replace('_summation_received', '_power'),
    energyEntityId.replace('_energy_usage', '_power'),
    energyEntityId.replace('_energy_usage', '_power_usage'),
    energyEntityId.replace('_energy_usage', '_power_consumed'),
    energyEntityId.replace('_energy_usage', '_power_now'),
    energyEntityId.replace('_energy_usage', '_current_power'),
    energyEntityId.replace('_energy', '_power'),
    energyEntityId.replace('_kwh', '_power'),
    energyEntityId.replace('_total_energy', '_power'),
    energyEntityId.replace('_summation_delivered', '_electrical_measurement'),
  ].filter(
    (candidate, index, candidates) =>
      candidate !== energyEntityId && candidates.indexOf(candidate) === index
  );
}

function scoreHomeLoadCandidate(entityId: string, entity: HaEnergyEntityLike | undefined): number {
  const friendlyName = String(entity?.attributes?.friendly_name ?? '').toLowerCase();
  const haystack = `${entityId} ${friendlyName}`;

  let score = 0;
  if (haystack.includes('instantaneous_demand') || haystack.includes('instantaneous demand')) {
    score += 100;
  }
  if (
    haystack.includes('home load') ||
    haystack.includes('home_load') ||
    haystack.includes('house power') ||
    haystack.includes('active power') ||
    haystack.includes('total power') ||
    haystack.includes('main power') ||
    haystack.includes('demand')
  ) {
    score += 30;
  }
  if (
    haystack.includes('solar') ||
    haystack.includes('battery') ||
    haystack.includes('grid export') ||
    haystack.includes('pv') ||
    haystack.includes('charger')
  ) {
    score -= 40;
  }

  return score;
}

function buildPowerEntityAnalysis(
  entities: HaEnergyEntityMap,
  entityRegistry: HaEnergyEntityRegistryEntry[]
): PowerEntityAnalysis {
  const powerEntityIds = new Set<string>();
  let bestHomeLoadCandidateId: string | undefined;
  let bestHomeLoadCandidateScore = Number.NEGATIVE_INFINITY;

  for (const [entityId, entity] of Object.entries(entities)) {
    if (!entityId.startsWith('sensor.') || parsePowerEntityWatts(entity) === null) {
      continue;
    }

    powerEntityIds.add(entityId);
    const score = scoreHomeLoadCandidate(entityId, entity);
    if (score > bestHomeLoadCandidateScore) {
      bestHomeLoadCandidateScore = score;
      bestHomeLoadCandidateId = score > 0 ? entityId : bestHomeLoadCandidateId;
    }
  }

  const sourceDeviceIdByEntityId = new Map<string, string>();
  const siblingEntityIdsByDeviceId = new Map<string, string[]>();

  for (const entry of entityRegistry) {
    const entityId = getRegistryEntityId(entry);
    const deviceId = getRegistryDeviceId(entry);
    if (!entityId || !deviceId) {
      continue;
    }

    sourceDeviceIdByEntityId.set(entityId, deviceId);
    const siblingEntityIds = siblingEntityIdsByDeviceId.get(deviceId);
    if (siblingEntityIds) {
      siblingEntityIds.push(entityId);
    } else {
      siblingEntityIdsByDeviceId.set(deviceId, [entityId]);
    }
  }

  return {
    bestHomeLoadCandidateId,
    powerEntityIds,
    siblingEntityIdsByDeviceId,
    sourceDeviceIdByEntityId,
  };
}

function inferRelatedPowerEntityId(
  energyEntityId: string | undefined,
  entities: HaEnergyEntityMap,
  entityRegistry: HaEnergyEntityRegistryEntry[] = [],
  analysis: PowerEntityAnalysis = buildPowerEntityAnalysis(entities, entityRegistry)
): string | undefined {
  if (!energyEntityId) {
    return undefined;
  }

  const energyDeviceRef = analysis.sourceDeviceIdByEntityId.get(energyEntityId);
  if (energyDeviceRef) {
    const siblingEntityIds = analysis.siblingEntityIdsByDeviceId.get(energyDeviceRef) ?? [];
    for (const siblingEntityId of siblingEntityIds) {
      if (
        siblingEntityId !== energyEntityId &&
        analysis.powerEntityIds.has(siblingEntityId) &&
        isLikelyPowerSensor(siblingEntityId, entities[siblingEntityId])
      ) {
        return siblingEntityId;
      }
    }
  }

  for (const candidate of getPowerCandidateIds(energyEntityId)) {
    if (analysis.powerEntityIds.has(candidate)) {
      return candidate;
    }
  }

  return analysis.powerEntityIds.has(energyEntityId) ? energyEntityId : undefined;
}

function inferHomeLoadPowerEntityId(
  config: EnergySourceConfig,
  entities: HaEnergyEntityMap,
  entityRegistry: HaEnergyEntityRegistryEntry[] = [],
  analysis: PowerEntityAnalysis = buildPowerEntityAnalysis(entities, entityRegistry)
): string | undefined {
  if (config.gridImportPowerEntityId) {
    return config.gridImportPowerEntityId;
  }

  const relatedGridPowerEntityId = inferRelatedPowerEntityId(
    config.gridImportEnergyEntityId,
    entities,
    entityRegistry,
    analysis
  );
  if (relatedGridPowerEntityId) {
    return relatedGridPowerEntityId;
  }

  return analysis.bestHomeLoadCandidateId;
}

export function augmentConfigWithLivePowerEntities(
  config: EnergySourceConfig,
  entities: HaEnergyEntityMap,
  entityRegistry: HaEnergyEntityRegistryEntry[] = []
): EnergySourceConfig {
  const analysis = buildPowerEntityAnalysis(entities, entityRegistry);

  return {
    ...config,
    homeLoadPowerEntityId:
      config.homeLoadPowerEntityId ??
      inferHomeLoadPowerEntityId(config, entities, entityRegistry, analysis),
    gridImportPowerEntityId:
      config.gridImportPowerEntityId ??
      inferRelatedPowerEntityId(
        config.gridImportEnergyEntityId,
        entities,
        entityRegistry,
        analysis
      ),
    gridExportPowerEntityId:
      config.gridExportPowerEntityId ??
      inferRelatedPowerEntityId(
        config.gridExportEnergyEntityId,
        entities,
        entityRegistry,
        analysis
      ),
    solarPowerEntityId:
      config.solarPowerEntityId ??
      inferRelatedPowerEntityId(config.solarEnergyEntityId, entities, entityRegistry, analysis),
    batteryPowerEntityId:
      config.batteryPowerEntityId ??
      inferRelatedPowerEntityId(config.batterySocEntityId, entities, entityRegistry, analysis),
    devices: config.devices.map((device) => ({
      ...device,
      powerEntityId:
        device.powerEntityId ??
        inferRelatedPowerEntityId(device.entityId, entities, entityRegistry, analysis),
    })),
  };
}
