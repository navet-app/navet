import { useCallback, useMemo, useRef } from 'react';
import type { DeviceCollection, DeviceWithType } from '../types/device.types';

export const useDeviceMap = (devices: DeviceCollection) => {
  const {
    lights,
    fans,
    climate,
    hvac: legacyClimateDevices,
    media,
    weather,
    switches,
    helpers,
    timers,
    counters,
    valves,
    remotes,
    covers,
    locks,
    scenes,
    persons,
    sensors,
    vacuums,
    calendars,
    cameras,
    'grouped-sensors': groupedSensors,
  } = devices;

  const prevMapRef = useRef<Map<string, DeviceWithType>>(new Map());
  const typedDeviceCacheRef = useRef<WeakMap<object, DeviceWithType>>(new WeakMap());

  const deviceMap = useMemo(() => {
    const prev = prevMapRef.current;
    const typedDeviceCache = typedDeviceCacheRef.current;
    const map = new Map<string, DeviceWithType>();
    const groups = [
      ['lights', lights],
      ['fans', fans],
      ['climate', climate],
      ['hvac', legacyClimateDevices],
      ['media', media],
      ['weather', weather],
      ['switches', switches],
      ['helpers', helpers],
      ['timers', timers],
      ['counters', counters],
      ['valves', valves],
      ['remotes', remotes],
      ['covers', covers],
      ['locks', locks],
      ['scenes', scenes],
      ['persons', persons],
      ['sensors', sensors],
      ['vacuums', vacuums],
      ['calendars', calendars],
      ['cameras', cameras],
      ['grouped-sensors', groupedSensors],
    ] as const;

    let changed = false;

    for (const [type, arr] of groups) {
      for (const device of arr) {
        const cachedDevice = typedDeviceCache.get(device as object);
        const nextDevice = cachedDevice ?? ({ ...device, type } as DeviceWithType);

        if (!cachedDevice) {
          typedDeviceCache.set(device as object, nextDevice);
        }

        map.set(device.id, nextDevice);
        if (prev.get(device.id) !== nextDevice) {
          changed = true;
        }
      }
    }

    if (!changed && prev.size === map.size) {
      return prev;
    }

    prevMapRef.current = map;
    return map;
  }, [
    calendars,
    cameras,
    climate,
    covers,
    fans,
    groupedSensors,
    helpers,
    timers,
    counters,
    valves,
    remotes,
    legacyClimateDevices,
    lights,
    locks,
    scenes,
    media,
    persons,
    sensors,
    switches,
    vacuums,
    weather,
  ]);

  const getDevice = useCallback(
    (id: string): DeviceWithType | undefined => deviceMap.get(id),
    [deviceMap]
  );

  return { deviceMap, getDevice };
};
