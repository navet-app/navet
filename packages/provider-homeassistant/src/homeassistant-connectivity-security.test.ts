import { mapNavetEntitiesToDeviceCollection } from '@navet/app/core/navet-device-collections';
import { selectHomeSecurityAlertDevices } from '@navet/app/features/dashboard/hooks/use-home-security-alert-count';
import {
  buildSecurityCameraDashboardModel,
  getSecurityDashboardAlertCount,
} from '@navet/app/features/security/utils/security-camera-dashboard-model';
import { securityConnectivityEntity } from '@navet/app/test/fixtures/home-assistant/entities/binary-sensor';
import { describe, expect, it } from 'vitest';
import { mapHomeAssistantEntitiesToNavetEntities } from './homeassistant-mappers';

describe('Home Assistant connectivity security', () => {
  it.each([
    ['on', 'Connected', 'clear', 0],
    ['off', 'Disconnected', 'active', 1],
    ['unavailable', 'unavailable', 'unavailable', 1],
    ['unknown', 'unknown', 'unavailable', 1],
  ])('keeps %s presentation and alert counts consistent', (state, value, status, count) => {
    const entityId = securityConnectivityEntity.entity_id;
    const entities = mapHomeAssistantEntitiesToNavetEntities({
      entities: {
        [entityId]: {
          ...securityConnectivityEntity,
          state,
        },
      },
      areas: [],
      deviceRegistry: [],
      entityRegistry: [],
    });
    const devices = mapNavetEntitiesToDeviceCollection(entities);
    expect(devices.sensors[0]).toMatchObject({ value, status, securityKind: 'connectivity' });
    const selected = selectHomeSecurityAlertDevices(devices, []);
    expect(getSecurityDashboardAlertCount(selected)).toBe(count);
    expect(buildSecurityCameraDashboardModel(selected).summary.attentionEntityCount).toBe(count);
  });
});
