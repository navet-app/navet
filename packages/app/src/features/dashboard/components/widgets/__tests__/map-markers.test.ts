import type { IntegrationUser } from '@navet/app/types/integration-user';
import { describe, expect, it } from 'vitest';
import { applyCurrentUserAvatar } from '../map-markers';
import type { MapMarker } from '../map-types';

const MARKER: MapMarker = {
  id: 'person.vishal',
  name: 'Vishal',
  latitude: 59.33,
  longitude: 18.06,
  state: 'home',
};

const CURRENT_USER: IntegrationUser = {
  id: 'user-vishal',
  name: 'Vishal Gupta',
  avatarUrl: '/api/image/serve/vishal/512x512',
};

describe('applyCurrentUserAvatar', () => {
  it('uses the signed-in user profile photo for a unique first-name marker match', () => {
    expect(applyCurrentUserAvatar([MARKER], CURRENT_USER)).toEqual([
      {
        ...MARKER,
        entityPicture: '/api/image/serve/vishal/512x512',
      },
    ]);
  });

  it('preserves a person entity picture instead of replacing it', () => {
    const markerPicture = '/api/image/serve/person-vishal/512x512';

    expect(
      applyCurrentUserAvatar([{ ...MARKER, entityPicture: markerPicture }], CURRENT_USER)[0]
        ?.entityPicture
    ).toBe(markerPicture);
  });

  it('does not attach a profile photo when a first-name match is ambiguous', () => {
    const markers = [MARKER, { ...MARKER, id: 'device_tracker.vishal', name: 'Vishal Phone' }];

    expect(applyCurrentUserAvatar(markers, CURRENT_USER)).toEqual(markers);
  });
});
