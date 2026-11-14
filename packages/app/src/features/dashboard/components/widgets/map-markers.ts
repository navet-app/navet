import type { IntegrationUser } from '@navet/app/types/integration-user';
import type { MapMarker } from './map-types';

export function normalizeMarkerName(value: string | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

export function getFirstName(value: string | undefined) {
  const normalized = normalizeMarkerName(value);
  return normalized.split(/\s+/)[0] ?? '';
}

export function applyCurrentUserAvatar(
  markers: readonly MapMarker[],
  currentUser: IntegrationUser | null,
  providerId?: string
): MapMarker[] {
  const avatarUrl = currentUser?.avatarUrl?.trim();
  const normalizedUserName = normalizeMarkerName(currentUser?.name);
  if (!avatarUrl || !normalizedUserName) {
    return [...markers];
  }

  const eligible = markers.filter(
    (marker) =>
      (!marker.kind || marker.kind === 'person' || marker.kind === 'tracker') &&
      (!providerId || !marker.providerId || marker.providerId === providerId)
  );
  const exactMatches = eligible.filter(
    (marker) => normalizeMarkerName(marker.name) === normalizedUserName
  );
  const matchedIds = new Set(exactMatches.map((marker) => marker.id));

  if (matchedIds.size === 0) {
    const userFirstName = getFirstName(normalizedUserName);
    const firstNameMatches = eligible.filter(
      (marker) => getFirstName(marker.name) === userFirstName
    );

    if (firstNameMatches.length === 1 && firstNameMatches[0]) {
      matchedIds.add(firstNameMatches[0].id);
    }
  }

  return markers.map((marker) =>
    matchedIds.has(marker.id) && !marker.entityPicture
      ? { ...marker, entityPicture: avatarUrl }
      : marker
  );
}

export function mapMarkersEqual(a: readonly MapMarker[], b: readonly MapMarker[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every(
    (m, i) =>
      m.id === b[i].id &&
      m.name === b[i].name &&
      m.kind === b[i].kind &&
      m.radiusMeters === b[i].radiusMeters &&
      m.canShowHistory === b[i].canShowHistory &&
      m.providerId === b[i].providerId &&
      m.latitude === b[i].latitude &&
      m.longitude === b[i].longitude &&
      m.state === b[i].state &&
      m.gpsAccuracy === b[i].gpsAccuracy &&
      m.entityPicture === b[i].entityPicture
  );
}
