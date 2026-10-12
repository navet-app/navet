import { createEmptyDeviceCollection } from '@navet/app/core/navet-device-collections';
import type { DeviceCollection } from '@navet/app/types/device.types';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  buildDashboardVisibilityResult,
  getAbsorbedDashboardEntityIds,
  getExpandedHiddenDashboardEntityIds,
  useDashboardDevices,
} from '../use-dashboard-devices';

describe('useDashboardDevices', () => {
  it('keeps standalone helpers opt-in and absorbs related helpers within their provider', () => {
    const devices: DeviceCollection = {
      ...createEmptyDeviceCollection(),
      lights: [
        {
          id: 'home_assistant:light.kitchen',
          providerId: 'home_assistant',
          underlyingDeviceId: 'shared',
          name: 'Kitchen',
          room: 'Kitchen',
          size: 'small',
          state: true,
          brightness: 100,
          temp: 3000,
        },
      ],
      helpers: [
        {
          id: 'home_assistant:number.related',
          providerId: 'home_assistant',
          underlyingDeviceId: 'shared',
          name: 'Related',
          room: 'Kitchen',
          size: 'small',
          state: false,
        },
        {
          id: 'home_assistant:input_number.lone',
          providerId: 'home_assistant',
          name: 'Lone',
          room: 'Kitchen',
          size: 'small',
          state: false,
        },
        {
          id: 'openhab:helper',
          providerId: 'openhab',
          underlyingDeviceId: 'shared',
          name: 'Other provider',
          room: 'Kitchen',
          size: 'small',
          state: false,
        },
      ],
    };
    const initial = buildDashboardVisibilityResult(devices, []);
    expect(initial.visibleDevices.helpers).toEqual([]);
    expect(initial.availableDevices.helpers.map((helper) => helper.id)).toEqual([
      'home_assistant:input_number.lone',
      'openhab:helper',
    ]);
    const selected = buildDashboardVisibilityResult(
      devices,
      [],
      [],
      devices.helpers.map((helper) => helper.id)
    );
    expect(selected.visibleDevices.helpers.map((helper) => helper.id)).toEqual([
      'home_assistant:input_number.lone',
      'openhab:helper',
    ]);
    expect(
      buildDashboardVisibilityResult(
        devices,
        ['home_assistant:input_number.lone'],
        [],
        ['home_assistant:input_number.lone']
      ).visibleDevices.helpers
    ).toEqual([]);
  });

  it('keeps person-associated helpers available and absorbs them for remote controls', () => {
    const helper = {
      id: 'home_assistant:number.delay',
      name: 'Delay',
      room: 'Hall',
      size: 'small' as const,
      state: false,
      providerId: 'home_assistant' as const,
      underlyingDeviceId: 'shared',
    };
    const devices: DeviceCollection = {
      ...createEmptyDeviceCollection(),
      persons: [
        {
          id: 'home_assistant:device_tracker.phone',
          name: 'Phone',
          room: 'Hall',
          size: 'small',
          state: 'home',
          location: 'Home',
          providerId: 'home_assistant',
          underlyingDeviceId: 'shared',
        },
      ],
      helpers: [helper],
    };
    expect(getAbsorbedDashboardEntityIds(devices, [])).toEqual([]);
    expect(buildDashboardVisibilityResult(devices, []).availableDevices.helpers).toEqual([helper]);
    expect(
      buildDashboardVisibilityResult(devices, [], [], [helper.id]).visibleDevices.helpers
    ).toEqual([helper]);
    devices.persons = [];
    devices.remotes = [
      {
        ...helper,
        id: 'home_assistant:remote.tv',
        normalizedEntity: {
          id: 'home_assistant:remote.tv',
          canonicalId: 'home_assistant:remote.tv',
          externalId: 'remote.tv',
          providerId: 'home_assistant',
          type: 'remote',
          name: 'TV',
          primaryState: 'on',
          availability: 'available',
          attributes: {},
          capabilities: [],
        },
      },
    ];
    expect(buildDashboardVisibilityResult(devices, []).availableDevices.helpers).toEqual([]);
    expect(getAbsorbedDashboardEntityIds(devices, [])).toEqual([helper.id]);
  });

  it('keeps sensors hidden until explicitly shown', () => {
    const devices: DeviceCollection = {
      ...createEmptyDeviceCollection(),
      lights: [
        {
          id: 'light.kitchen',
          name: 'Kitchen',
          room: 'Kitchen',
          size: 'small',
          state: true,
          brightness: 100,
          temp: 3000,
        },
      ],
      sensors: [
        {
          id: 'sensor.kitchen_temperature',
          name: 'Kitchen Temperature',
          room: 'Kitchen',
          value: '21.4',
          unit: '°C',
          size: 'small',
        },
        {
          id: 'binary_sensor.front_window',
          name: 'Front Window',
          room: 'Hallway',
          value: 'Closed',
          unit: '',
          size: 'small',
        },
      ],
    };

    const { result, rerender } = renderHook(
      ({ shownSensorEntityIds }) => useDashboardDevices(devices, [], shownSensorEntityIds),
      { initialProps: { shownSensorEntityIds: [] as string[] } }
    );

    expect(result.current.lights).toHaveLength(1);
    expect(result.current.sensors).toEqual([]);

    rerender({ shownSensorEntityIds: ['sensor.kitchen_temperature'] });

    expect(result.current.sensors).toEqual([
      expect.objectContaining({ id: 'sensor.kitchen_temperature' }),
    ]);
  });

  it('preserves the original device collection reference when no visibility filters apply', () => {
    const devices: DeviceCollection = {
      ...createEmptyDeviceCollection(),
      lights: [
        {
          id: 'light.kitchen',
          name: 'Kitchen',
          room: 'Kitchen',
          size: 'small',
          state: true,
          brightness: 100,
          temp: 3000,
        },
      ],
    };

    const { result } = renderHook(() => useDashboardDevices(devices, [], ['sensor.none']));

    expect(result.current).toBe(devices);
    expect(result.current.lights).toBe(devices.lights);
  });

  it('absorbs security sensors but keeps lock-associated helpers available without a helper dialog', () => {
    const devices: DeviceCollection = {
      ...createEmptyDeviceCollection(),
      locks: [
        {
          id: 'lock.front_door',
          name: 'Front Door Lock',
          room: 'Hallway',
          size: 'small',
          state: true,
          securityKind: 'lock',
          securitySeverity: 'normal',
          underlyingDeviceId: 'device-front-door',
        },
      ],
      sensors: [
        {
          id: 'binary_sensor.front_door_contact',
          name: 'Front Door Contact',
          room: 'Hallway',
          value: 'Open',
          unit: '',
          size: 'small',
          securityKind: 'door',
          securitySeverity: 'warning',
          underlyingDeviceId: 'device-front-door',
        },
      ],
      helpers: [
        {
          id: 'button.front_door_chime',
          name: 'Front Door Chime',
          room: 'Hallway',
          size: 'small',
          state: false,
          entityType: 'Button',
          serviceDomain: 'button',
          serviceAction: 'press',
          securityKind: 'button',
          securitySeverity: 'normal',
          underlyingDeviceId: 'device-front-door',
        },
      ],
    };

    const { result } = renderHook(() =>
      useDashboardDevices(devices, [], ['binary_sensor.front_door_contact'])
    );
    const visibility = buildDashboardVisibilityResult(
      devices,
      [],
      ['binary_sensor.front_door_contact']
    );

    expect(result.current.locks).toHaveLength(1);
    expect(result.current.sensors).toEqual([]);
    expect(result.current.helpers).toEqual([]);
    expect(getAbsorbedDashboardEntityIds(devices, [])).toEqual([
      'binary_sensor.front_door_contact',
    ]);
    expect(visibility.availableDevices.sensors).toEqual([]);
    expect(visibility.availableDevices.helpers).toEqual(devices.helpers);
  });

  it('allows a child security entity to surface again when its parent card is hidden', () => {
    const devices: DeviceCollection = {
      ...createEmptyDeviceCollection(),
      locks: [
        {
          id: 'lock.front_door',
          name: 'Front Door Lock',
          room: 'Hallway',
          size: 'small',
          state: true,
          securityKind: 'lock',
          securitySeverity: 'normal',
          underlyingDeviceId: 'device-front-door',
        },
      ],
      sensors: [
        {
          id: 'binary_sensor.front_door_contact',
          name: 'Front Door Contact',
          room: 'Hallway',
          value: 'Open',
          unit: '',
          size: 'small',
          securityKind: 'door',
          securitySeverity: 'warning',
          underlyingDeviceId: 'device-front-door',
        },
      ],
    };

    const { result } = renderHook(() =>
      useDashboardDevices(devices, ['lock.front_door'], ['binary_sensor.front_door_contact'])
    );

    expect(result.current.locks).toEqual([]);
    expect(result.current.sensors).toEqual([
      expect.objectContaining({ id: 'binary_sensor.front_door_contact' }),
    ]);
    expect(getAbsorbedDashboardEntityIds(devices, ['lock.front_door'])).toEqual([]);
  });

  it('offers standalone button helpers without automatically adding them', () => {
    const devices: DeviceCollection = {
      ...createEmptyDeviceCollection(),
      helpers: [
        {
          id: 'button.identity',
          name: 'Identity',
          room: 'Office',
          size: 'small',
          state: false,
          entityType: 'Button',
          serviceDomain: 'button',
          serviceAction: 'press',
          securityKind: 'button',
          securitySeverity: 'normal',
        },
      ],
    };

    const { result } = renderHook(() => useDashboardDevices(devices, []));
    const visibility = buildDashboardVisibilityResult(devices, []);

    expect(result.current.helpers).toEqual([]);
    expect(getAbsorbedDashboardEntityIds(devices, [])).toEqual([]);
    expect(visibility.availableDevices.helpers).toEqual(devices.helpers);
    expect(
      buildDashboardVisibilityResult(devices, [], [], ['button.identity']).visibleDevices.helpers
    ).toEqual(devices.helpers);
  });

  it('expands hidden camera variants so sibling security cameras stay hidden everywhere', () => {
    const devices: DeviceCollection = {
      ...createEmptyDeviceCollection(),
      cameras: [
        {
          id: 'camera.garage',
          name: 'Garage Camera',
          room: 'Garage',
          size: 'medium',
          providerId: 'home_assistant',
          sourceDeviceId: 'device-garage',
          state: 'idle',
          securityKind: 'camera',
          securitySeverity: 'normal',
        },
        {
          id: 'camera.garage_2',
          name: 'Garage Camera',
          room: 'Garage',
          size: 'medium',
          providerId: 'home_assistant',
          sourceDeviceId: 'device-garage',
          state: 'idle',
          securityKind: 'camera',
          securitySeverity: 'warning',
        },
      ],
    };

    expect(getExpandedHiddenDashboardEntityIds(devices, ['camera.garage'])).toEqual([
      'camera.garage',
      'camera.garage_2',
    ]);

    const visibility = buildDashboardVisibilityResult(devices, ['camera.garage']);

    expect(visibility.visibleDevices.cameras).toEqual([]);
  });

  it('matches canonical hidden IDs against legacy runtime entity IDs', () => {
    const devices: DeviceCollection = {
      ...createEmptyDeviceCollection(),
      locks: [
        {
          id: 'lock.side_door',
          nativeId: 'lock.side_door',
          name: 'Side Door',
          room: 'Hallway',
          size: 'small',
          state: false,
          securityKind: 'lock',
          securitySeverity: 'unknown',
        },
      ],
    };

    const visibility = buildDashboardVisibilityResult(devices, ['home_assistant:lock.side_door']);

    expect(visibility.visibleDevices.locks).toEqual([]);
  });
});
