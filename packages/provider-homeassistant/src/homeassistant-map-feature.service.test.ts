import type { PlatformEntityHistoryPoint } from '@navet/core/provider-feature-models';
import { describe, expect, it, vi } from 'vitest';
import { geolocationEntityFactory } from '../../app/src/test/fixtures/home-assistant/entities/geolocation';
import { zoneEntityFactory } from '../../app/src/test/fixtures/home-assistant/entities/zone';
import {
  homeAssistantMapFeatureService,
  locationSegments,
  selectHomeAssistantMapMarkers,
} from './homeassistant-map-feature.service';

const { getHistories } = vi.hoisted(() => ({ getHistories: vi.fn() }));
vi.mock('./homeassistant-history-feature.service.lazy', () => ({
  lazyHomeAssistantHistoryFeatureService: { getEntityHistories: getHistories },
}));

describe('selectHomeAssistantMapMarkers', () => {
  it('gives a sourced device tracker the person profile photo', () => {
    const markers = selectHomeAssistantMapMarkers({
      'person.vishal': {
        entityId: 'person.vishal',
        state: 'home',
        attributes: {
          friendly_name: 'Vishal',
          latitude: 59.33,
          longitude: 18.06,
          entity_picture: '/api/image/serve/vishal/512x512',
          source: 'device_tracker.vishals_iphone',
        },
      },
      'device_tracker.vishals_iphone': {
        entityId: 'device_tracker.vishals_iphone',
        state: 'home',
        attributes: {
          friendly_name: 'Vishals iPhone',
          latitude: 59.33,
          longitude: 18.06,
        },
      },
    });

    expect(markers.find((marker) => marker.id === 'device_tracker.vishals_iphone')).toEqual(
      expect.objectContaining({
        entityPicture: '/api/image/serve/vishal/512x512',
      })
    );
  });
});

it('includes zones and geolocation, excludes passive, unavailable and invalid locations', () => {
  const zone = zoneEntityFactory();
  const geolocation = geolocationEntityFactory();
  const entities = {
    'zone.home': { entityId: 'zone.home', state: zone.state, attributes: zone.attributes },
    'zone.passive': {
      entityId: 'zone.passive',
      state: '0',
      attributes: { ...zone.attributes, passive: true },
    },
    'geo_location.alert': {
      entityId: 'geo_location.alert',
      state: geolocation.state,
      attributes: geolocation.attributes,
    },
    'person.unavailable': {
      entityId: 'person.unavailable',
      state: 'unavailable',
      attributes: { latitude: 55, longitude: 13 },
    },
    'device_tracker.invalid': {
      entityId: 'device_tracker.invalid',
      state: 'home',
      attributes: { latitude: Number.NaN, longitude: 999 },
    },
  };
  const markers = selectHomeAssistantMapMarkers(entities);
  expect(markers.map((marker) => marker.id)).toEqual(['zone.home', 'geo_location.alert']);
  expect(markers[0]).toMatchObject({ kind: 'zone', radiusMeters: 100, canShowHistory: false });
  expect(markers[1]).toMatchObject({ kind: 'geolocation', state: '12 km', canShowHistory: false });
});

const point = (time: string, latitude?: number, longitude = 13): PlatformEntityHistoryPoint => ({
  state: 'home',
  changedAt: '2026-10-14T00:00:00Z',
  updatedAt: time,
  attributes: { latitude, longitude },
});
it('uses attribute update times and breaks paths at missing coordinates and prolonged gaps', () => {
  const result = locationSegments(
    [
      point('2026-10-14T10:00:00Z', 55),
      point('2026-10-14T10:05:00Z', 55.1),
      point('2026-10-14T10:10:00Z'),
      point('2026-10-14T10:15:00Z', 55.2),
      point('2026-10-14T10:20:00Z', 55.3),
      point('2026-10-14T12:00:00Z', 55.4),
      point('2026-10-14T12:05:00Z', 55.5),
    ],
    '2026-10-14T09:00:00Z',
    '2026-10-14T13:00:00Z'
  );
  expect(result.map((segment) => segment.map((entry) => entry.latitude))).toEqual([
    [55, 55.1],
    [55.2, 55.3],
    [55.4, 55.5],
  ]);
  expect(result[0][0].timestamp).toBe('2026-10-14T10:00:00Z');
});
it('does not invent a path from missing, one-point, duplicate, or antimeridian samples', () => {
  const start = '2026-10-14T09:00:00Z';
  const end = '2026-10-14T13:00:00Z';
  expect(locationSegments([], start, end)).toEqual([]);
  expect(locationSegments([point('2026-10-14T10:00:00Z', 55)], start, end)).toEqual([]);
  expect(
    locationSegments(
      [point('2026-10-14T10:00:00Z', 55), point('2026-10-14T10:05:00Z', 55)],
      start,
      end
    )
  ).toEqual([]);
  expect(
    locationSegments(
      [point('2026-10-14T10:00:00Z', 55, 179), point('2026-10-14T10:05:00Z', 55, -179)],
      start,
      end
    )
  ).toEqual([]);
});
it('requests retained coordinate attributes through the existing history transport', async () => {
  getHistories.mockResolvedValueOnce([
    {
      entityId: 'person.alex',
      points: [point('2026-10-14T10:00:00Z', 55), point('2026-10-14T10:05:00Z', 55.1)],
    },
  ]);
  const request = {
    entityId: 'person.alex',
    startTime: '2026-10-14T09:00:00Z',
    endTime: '2026-10-14T13:00:00Z',
  };
  const result = await homeAssistantMapFeatureService.getLocationHistory?.(request);
  expect(result?.[0]).toHaveLength(2);
  expect(getHistories).toHaveBeenCalledWith(
    expect.objectContaining({
      entityIds: ['person.alex'],
      includeAttributes: true,
      significantChangesOnly: false,
    })
  );
  await expect(
    homeAssistantMapFeatureService.getLocationHistory?.({ ...request, entityId: 'zone.home' })
  ).rejects.toThrow('unsupported');
});
