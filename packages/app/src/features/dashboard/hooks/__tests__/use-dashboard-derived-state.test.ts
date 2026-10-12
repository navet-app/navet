import type { DeviceWithType } from '@navet/app/types/device.types';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  getRoomScopedDashboardEntityIds,
  useDashboardDerivedState,
} from '../use-dashboard-derived-state';

function createDevice(overrides: Partial<DeviceWithType> & Pick<DeviceWithType, 'id' | 'type'>) {
  return {
    name: overrides.id,
    room: 'Hallway',
    size: 'small',
    ...overrides,
  } as DeviceWithType;
}

describe('useDashboardDerivedState', () => {
  it('offers standalone helpers for adding when other cards are hidden', () => {
    const light = createDevice({ id: 'light.kitchen', type: 'lights' });
    const helper = createDevice({ id: 'input_number.target', type: 'helpers' });
    const { result } = renderHook(() =>
      useDashboardDerivedState({
        activeRoom: 'Hallway',
        availableDeviceMap: new Map([
          [light.id, light],
          [helper.id, helper],
        ]),
        deviceMap: new Map(),
        cardOrders: {},
        hiddenEntityIds: [light.id],
        rooms: ['Hallway'],
      })
    );
    expect(result.current.addableEntityIds).toEqual([light.id, helper.id]);
  });

  it('limits addable dashboard entities to the active room', () => {
    const kitchenLight = createDevice({
      id: 'light.kitchen',
      type: 'lights',
      room: 'Kitchen',
    });
    const hallwayLight = createDevice({
      id: 'light.hallway',
      type: 'lights',
      room: 'Hallway',
    });
    const deviceMap = new Map([
      [kitchenLight.id, kitchenLight],
      [hallwayLight.id, hallwayLight],
    ]);

    expect(
      getRoomScopedDashboardEntityIds([kitchenLight.id, hallwayLight.id], deviceMap, 'kitchen')
    ).toEqual([kitchenLight.id]);
  });

  it('matches light rooms and saved card orders without regard to capitalization', () => {
    const deviceMap = new Map([
      [
        'openhab:accent',
        createDevice({ id: 'openhab:accent', type: 'lights', room: 'living room' }),
      ],
    ]);
    const { result } = renderHook(() =>
      useDashboardDerivedState({
        activeRoom: 'LIVING ROOM',
        availableDeviceMap: deviceMap,
        deviceMap,
        cardOrders: { 'Living Room': ['openhab:accent'] },
        hiddenEntityIds: [],
        rooms: ['Living Room'],
      })
    );

    expect(result.current.lightRooms).toEqual(['Living Room']);
    expect(result.current.orderedCardIds).toEqual(['openhab:accent']);
  });

  it('keeps absorbed child entities out of home and room addable entity ids', () => {
    const availableDeviceMap = new Map<string, DeviceWithType>([
      [
        'lock.front_door',
        createDevice({
          id: 'lock.front_door',
          type: 'locks',
          state: true,
        }),
      ],
      [
        'binary_sensor.front_door_contact',
        createDevice({
          id: 'binary_sensor.front_door_contact',
          type: 'sensors',
          value: 'Open',
          unit: '',
        }),
      ],
    ]);
    const deviceMap = new Map<string, DeviceWithType>([
      [
        'lock.front_door',
        createDevice({
          id: 'lock.front_door',
          type: 'locks',
          state: true,
        }),
      ],
    ]);

    const { result } = renderHook(() =>
      useDashboardDerivedState({
        activeRoom: 'Hallway',
        absorbedEntityIds: ['binary_sensor.front_door_contact'],
        availableDeviceMap,
        cardOrders: { Hallway: ['lock.front_door'] },
        deviceMap,
        hiddenEntityIds: ['binary_sensor.front_door_contact'],
        rooms: ['Hallway'],
      })
    );

    expect(result.current.allEntityIds).toEqual([
      'lock.front_door',
      'binary_sensor.front_door_contact',
    ]);
    expect(result.current.addableEntityIds).toEqual([]);
  });
});
