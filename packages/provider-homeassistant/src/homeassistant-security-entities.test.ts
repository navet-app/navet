import { describe, expect, it } from 'vitest';
import {
  classifySecurityEntity,
  getSecuritySeverity,
  type SecurityEntityKind,
} from './homeassistant-security-entities';

function makeEntity(entity_id: string, state: string, attributes: Record<string, unknown> = {}) {
  return {
    entity_id,
    state,
    attributes,
    last_changed: '2026-06-01T10:00:00.000Z',
    last_updated: '2026-06-01T10:00:00.000Z',
    context: { id: 'ctx-1', parent_id: null, user_id: null },
  };
}

function expectSeverity(
  entityId: string,
  state: string,
  kind: SecurityEntityKind,
  expected: string
) {
  expect(getSecuritySeverity(makeEntity(entityId, state), kind)).toBe(expected);
}

describe('homeassistant-security-entities', () => {
  it('classifies supported Home Assistant security domains and device classes', () => {
    expect(classifySecurityEntity(makeEntity('alarm_control_panel.home', 'disarmed'))).toBe(
      'alarm'
    );
    expect(classifySecurityEntity(makeEntity('lock.front_door', 'locked'))).toBe('lock');
    expect(classifySecurityEntity(makeEntity('camera.driveway', 'idle'))).toBe('camera');
    expect(classifySecurityEntity(makeEntity('siren.entry', 'off'))).toBe('siren');
    expect(classifySecurityEntity(makeEntity('person.alex', 'home'))).toBe('person');
    expect(classifySecurityEntity(makeEntity('device_tracker.phone', 'not_home'))).toBe(
      'deviceTracker'
    );
    expect(
      classifySecurityEntity(
        makeEntity('binary_sensor.front_door', 'off', { device_class: 'door' })
      )
    ).toBe('door');
    expect(
      classifySecurityEntity(
        makeEntity('binary_sensor.hall_smoke', 'off', { device_class: 'smoke' })
      )
    ).toBe('smoke');
    expect(
      classifySecurityEntity(
        makeEntity('button.doorbell_chime', 'unknown', {
          friendly_name: 'Doorbell Chime',
        })
      )
    ).toBe('button');
    expect(
      classifySecurityEntity(
        makeEntity('event.front_doorbell', '2026-06-01T10:00:00.000Z', {
          event_type: 'doorbell_press',
        })
      )
    ).toBe('event');
  });

  it('rejects unsupported domains and unsupported binary sensor classes', () => {
    expect(classifySecurityEntity(makeEntity('switch.kitchen', 'on'))).toBeNull();
    expect(
      classifySecurityEntity(
        makeEntity('binary_sensor.temperature_window', 'off', { device_class: 'cold' })
      )
    ).toBeNull();
    expect(
      classifySecurityEntity(
        makeEntity('binary_sensor.wan_status', 'on', {
          device_class: 'connectivity',
          friendly_name: 'WAN Status',
        })
      )
    ).toBeNull();
    expect(
      classifySecurityEntity(
        makeEntity('binary_sensor.router_problem', 'on', {
          device_class: 'problem',
          friendly_name: 'Router Problem',
        })
      )
    ).toBeNull();
    expect(
      classifySecurityEntity(
        makeEntity('button.router_restart', 'unknown', { device_class: 'restart' })
      )
    ).toBeNull();
    expect(
      classifySecurityEntity(
        makeEntity('event.feedreader_news', '2026-06-01T10:00:00.000Z', {
          event_type: 'feedreader',
        })
      )
    ).toBeNull();
    expect(
      classifySecurityEntity(
        makeEntity('button.front_door_identify', 'unknown', {
          friendly_name: 'Front Door Identify',
        })
      )
    ).toBeNull();
    expect(
      classifySecurityEntity(
        makeEntity('event.garage_identify', '2026-06-01T10:00:00.000Z', {
          event_type: 'garage_identify',
        })
      )
    ).toBeNull();
  });

  it('maps alarm control panel states to severity', () => {
    expectSeverity('alarm_control_panel.home', 'disarmed', 'alarm', 'normal');
    expectSeverity('alarm_control_panel.home', 'armed_home', 'alarm', 'active');
    expectSeverity('alarm_control_panel.home', 'armed_away', 'alarm', 'active');
    expectSeverity('alarm_control_panel.home', 'pending', 'alarm', 'warning');
    expectSeverity('alarm_control_panel.home', 'triggered', 'alarm', 'critical');
    expectSeverity('alarm_control_panel.home', 'unavailable', 'alarm', 'unknown');
  });

  it('maps lock states to severity', () => {
    expectSeverity('lock.front_door', 'locked', 'lock', 'normal');
    expectSeverity('lock.front_door', 'unlocked', 'lock', 'warning');
    expectSeverity('lock.front_door', 'jammed', 'lock', 'critical');
    expectSeverity('lock.front_door', 'locking', 'lock', 'active');
  });

  it('maps binary sensor states to severity across supported security classes', () => {
    expectSeverity('binary_sensor.front_door', 'on', 'door', 'warning');
    expectSeverity('binary_sensor.front_door', 'off', 'door', 'normal');
    expectSeverity('binary_sensor.front_window', 'on', 'window', 'warning');
    expectSeverity('binary_sensor.front_window', 'off', 'window', 'normal');
    expectSeverity('binary_sensor.garage', 'on', 'garageDoor', 'warning');
    expectSeverity('binary_sensor.garage', 'off', 'garageDoor', 'normal');
    expectSeverity('binary_sensor.motion', 'on', 'motion', 'active');
    expectSeverity('binary_sensor.motion', 'off', 'motion', 'normal');
    expectSeverity('binary_sensor.occupancy', 'on', 'occupancy', 'active');
    expectSeverity('binary_sensor.occupancy', 'off', 'occupancy', 'normal');
    expectSeverity('binary_sensor.smoke', 'on', 'smoke', 'critical');
    expectSeverity('binary_sensor.smoke', 'off', 'smoke', 'normal');
    expectSeverity('binary_sensor.co', 'on', 'carbonMonoxide', 'critical');
    expectSeverity('binary_sensor.co', 'off', 'carbonMonoxide', 'normal');
    expectSeverity('binary_sensor.gas', 'on', 'gas', 'critical');
    expectSeverity('binary_sensor.gas', 'off', 'gas', 'normal');
    expectSeverity('binary_sensor.moisture', 'on', 'waterLeak', 'warning');
    expectSeverity('binary_sensor.moisture', 'off', 'waterLeak', 'normal');
    expectSeverity('binary_sensor.tamper', 'on', 'tamper', 'warning');
    expectSeverity('binary_sensor.tamper', 'off', 'tamper', 'normal');
    expectSeverity('binary_sensor.problem', 'on', 'problem', 'warning');
    expectSeverity('binary_sensor.problem', 'off', 'problem', 'normal');
    expectSeverity('binary_sensor.battery_low', 'on', 'battery', 'warning');
    expectSeverity('binary_sensor.battery_low', 'off', 'battery', 'normal');
    expectSeverity('binary_sensor.connectivity', 'on', 'connectivity', 'normal');
    expectSeverity('binary_sensor.connectivity', 'off', 'connectivity', 'warning');
    expectSeverity('binary_sensor.connectivity', 'unavailable', 'connectivity', 'unknown');
    expectSeverity('binary_sensor.connectivity', 'unknown', 'connectivity', 'unknown');
  });

  it('keeps security-scoped connectivity and problem sensors classifiable', () => {
    expect(
      classifySecurityEntity(
        makeEntity('binary_sensor.front_door_connectivity', 'on', {
          device_class: 'connectivity',
          friendly_name: 'Front Door Lock Connectivity',
        })
      )
    ).toBe('connectivity');
    expect(
      classifySecurityEntity(
        makeEntity('binary_sensor.security_panel_problem', 'on', {
          device_class: 'problem',
          friendly_name: 'Security Panel Problem',
        })
      )
    ).toBe('problem');
  });

  it('maps camera and siren states to severity', () => {
    expectSeverity('camera.driveway', 'streaming', 'camera', 'active');
    expectSeverity('camera.driveway', 'recording', 'camera', 'active');
    expectSeverity('camera.driveway', 'idle', 'camera', 'normal');
    expectSeverity('siren.entry', 'on', 'siren', 'critical');
    expectSeverity('siren.entry', 'off', 'siren', 'normal');
  });

  it('treats person and device tracker states as normal and unknown states as unknown', () => {
    expectSeverity('person.alex', 'home', 'person', 'normal');
    expectSeverity('device_tracker.phone', 'not_home', 'deviceTracker', 'normal');
    expectSeverity('device_tracker.phone', 'unknown', 'deviceTracker', 'unknown');
    expectSeverity('button.doorbell_chime', 'unknown', 'button', 'unknown');
    expectSeverity('event.front_doorbell', 'unavailable', 'event', 'unknown');
  });
});
