import { ensureCanonicalEntityId } from './provider-entity-id';
import { parseProviderScopedId } from './provider-ids';

export interface ClimateRoomSources {
  temperature?: string;
  humidity?: string;
}

/** Household selections keyed by room identity; values are provider-scoped entity IDs. */
export type ClimateRoomSourceSelections = Record<string, ClimateRoomSources>;

export function normalizeClimateRoomSources(value: unknown): ClimateRoomSourceSelections {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([roomId, sources]) => {
      if (!roomId || !sources || typeof sources !== 'object' || Array.isArray(sources)) return [];
      const record = sources as Record<string, unknown>;
      const normalized: ClimateRoomSources = {};
      for (const metric of ['temperature', 'humidity'] as const) {
        const id = record[metric];
        if (typeof id === 'string' && id.trim()) {
          const canonicalId = ensureCanonicalEntityId(id.trim());
          if (parseProviderScopedId(canonicalId)) normalized[metric] = canonicalId;
        }
      }
      return Object.keys(normalized).length ? [[roomId, normalized]] : [];
    })
  );
}
