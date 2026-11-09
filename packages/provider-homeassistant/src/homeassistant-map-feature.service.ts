import type {
  PlatformEntityHistoryPoint,
  PlatformEntitySnapshotMap,
  PlatformLocationPoint,
  PlatformMapMarker,
} from '@navet/core/provider-feature-models';
import type { ProviderMapFeatureService } from '@navet/core/provider-feature-services';
import { lazyHomeAssistantHistoryFeatureService } from './homeassistant-history-feature.service.lazy';

export function normalizeMarkerName(value: string | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

export function getFirstName(value: string | undefined) {
  const normalized = normalizeMarkerName(value);
  return normalized.split(/\s+/)[0] ?? '';
}

function validCoordinates(latitude: unknown, longitude: unknown) {
  return (
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    Math.abs(latitude) <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    Math.abs(longitude) <= 180
  );
}

export function readEntityPicture(attributes: Record<string, unknown>) {
  return (
    (typeof attributes.entity_picture === 'string' && attributes.entity_picture) ||
    (typeof attributes.entity_picture_local === 'string' && attributes.entity_picture_local) ||
    undefined
  );
}

export function selectHomeAssistantMapMarkers(
  entities: PlatformEntitySnapshotMap | null
): PlatformMapMarker[] {
  if (!entities) return [];

  const personPicturesByName = new Map<string, string>();
  const personPicturesByFirstName = new Map<string, string>();
  const personPicturesByTrackerId = new Map<string, string>();
  const markers: PlatformMapMarker[] = [];

  for (const [id, entity] of Object.entries(entities)) {
    const attrs = entity.attributes as Record<string, unknown>;
    if (id.startsWith('person.')) {
      const entityPicture = readEntityPicture(attrs);
      const friendlyName =
        typeof attrs.friendly_name === 'string' ? attrs.friendly_name : id.replace(/_/g, ' ');
      const normalizedName = normalizeMarkerName(friendlyName);
      const firstName = getFirstName(friendlyName);
      const source = typeof attrs.source === 'string' ? attrs.source : undefined;

      if (entityPicture && normalizedName) {
        personPicturesByName.set(normalizedName, entityPicture);
      }

      if (entityPicture && firstName && !personPicturesByFirstName.has(firstName)) {
        personPicturesByFirstName.set(firstName, entityPicture);
      }

      if (entityPicture && source) {
        personPicturesByTrackerId.set(source, entityPicture);
      }
    }

    const kind = id.startsWith('person.')
      ? 'person'
      : id.startsWith('device_tracker.')
        ? 'tracker'
        : id.startsWith('zone.')
          ? 'zone'
          : id.startsWith('geo_location.')
            ? 'geolocation'
            : null;
    if (
      !kind ||
      ['unknown', 'unavailable'].includes(entity.state) ||
      (kind === 'zone' && attrs.passive === true)
    )
      continue;

    const lat = attrs.latitude;
    const lon = attrs.longitude;
    if (!validCoordinates(lat, lon)) {
      continue;
    }

    const markerName =
      typeof attrs.friendly_name === 'string' ? attrs.friendly_name : id.replace(/_/g, ' ');
    markers.push({
      id,
      name: markerName,
      latitude: lat as number,
      longitude: lon as number,
      kind,
      canShowHistory: kind === 'person' || kind === 'tracker',
      ...(kind === 'zone' &&
      typeof attrs.radius === 'number' &&
      Number.isFinite(attrs.radius) &&
      attrs.radius >= 0
        ? { radiusMeters: attrs.radius }
        : {}),
      entityPicture: readEntityPicture(attrs),
      state:
        kind === 'geolocation' && typeof attrs.unit_of_measurement === 'string'
          ? `${entity.state} ${attrs.unit_of_measurement}`
          : entity.state,
      gpsAccuracy:
        typeof attrs.gps_accuracy === 'number' &&
        Number.isFinite(attrs.gps_accuracy) &&
        attrs.gps_accuracy >= 0
          ? attrs.gps_accuracy
          : undefined,
    });
  }

  return markers.map((marker) => {
    if (marker.entityPicture || (marker.kind !== 'person' && marker.kind !== 'tracker')) {
      return marker;
    }

    const normalizedMarkerName = normalizeMarkerName(marker.name);
    const markerFirstName = getFirstName(marker.name);
    return {
      ...marker,
      entityPicture:
        personPicturesByTrackerId.get(marker.id) ??
        personPicturesByName.get(normalizedMarkerName) ??
        personPicturesByFirstName.get(markerFirstName),
    };
  });
}

export function locationSegments(
  points: PlatformEntityHistoryPoint[],
  startTime: string,
  endTime: string
): PlatformLocationPoint[][] {
  const start = Date.parse(startTime);
  const end = Date.parse(endTime);
  const ordered = points
    .map((point) => ({ point, timestamp: point.updatedAt ?? point.changedAt }))
    .filter(({ timestamp }) => Number.isFinite(Date.parse(timestamp)))
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  const segments: PlatformLocationPoint[][] = [];
  let current: PlatformLocationPoint[] = [];
  let previousMs: number | null = null;
  const finish = () => {
    if (current.length > 1) segments.push(current);
    current = [];
    previousMs = null;
  };
  for (const { point, timestamp } of ordered) {
    const time = Date.parse(timestamp);
    if (time < start || time >= end) continue;
    const latitude = point.attributes?.latitude;
    const longitude = point.attributes?.longitude;
    if (
      ['unavailable', 'unknown'].includes(point.state) ||
      !validCoordinates(latitude, longitude)
    ) {
      finish();
      continue;
    }
    // A line must not bridge prolonged gaps or cross the antimeridian as a world-spanning path.
    if (
      previousMs !== null &&
      (time - previousMs > 60 * 60 * 1000 ||
        Math.abs((current.at(-1)?.longitude ?? 0) - (longitude as number)) > 180)
    )
      finish();
    const last = current.at(-1);
    if (!last || last.latitude !== latitude || last.longitude !== longitude)
      current.push({ latitude: latitude as number, longitude: longitude as number, timestamp });
    previousMs = time;
  }
  finish();
  return segments;
}

export const homeAssistantMapFeatureService: ProviderMapFeatureService = {
  entityPrefixes: ['person.', 'device_tracker.', 'zone.', 'geo_location.'],
  mapEntities: selectHomeAssistantMapMarkers,
  async getLocationHistory(request) {
    if (!request.entityId.startsWith('person.') && !request.entityId.startsWith('device_tracker.'))
      throw new Error('Location history is unsupported for this entity');
    const start = Date.parse(request.startTime);
    const end = Date.parse(request.endTime);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start ||
      end - start > 24 * 60 * 60 * 1000
    )
      throw new Error('Location history requires a range of up to 24 hours');
    const series = await lazyHomeAssistantHistoryFeatureService.getEntityHistories?.({
      entityIds: [request.entityId],
      startTime: request.startTime,
      endTime: request.endTime,
      includeAttributes: true,
      significantChangesOnly: false,
      signal: request.signal,
    });
    if (!series) throw new Error('Location history is unavailable');
    return locationSegments(
      series.find((entry) => entry.entityId === request.entityId)?.points ?? [],
      request.startTime,
      request.endTime
    );
  },
};
