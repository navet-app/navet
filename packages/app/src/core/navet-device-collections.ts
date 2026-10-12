import type { DeviceCollection } from '@navet/app/types/device.types';
import { readNavetHelperState } from '@navet/core/helper-state';
import type { NavetEntity } from '@navet/core/types';
import { getClimateSensorGroup } from './climate-sensor-group';

export function createEmptyDeviceCollection(): DeviceCollection {
  return {
    lights: [],
    fans: [],
    hvac: [],
    climate: [],
    media: [],
    weather: [],
    switches: [],
    helpers: [],
    timers: [],
    counters: [],
    valves: [],
    remotes: [],
    covers: [],
    locks: [],
    scenes: [],
    persons: [],
    sensors: [],
    vacuums: [],
    calendars: [],
    cameras: [],
    'grouped-sensors': [],
  };
}

type EntityStateRecord = Record<string, unknown>;

type DeviceSuppressionIndexes = {
  deviceIdsWithPrimaryCards: Set<string>;
  deviceIdsWithClimateEntity: Set<string>;
  deviceIdsWithFanEntity: Set<string>;
  deviceIdsWithVacuumEntity: Set<string>;
  primarySwitchByDeviceId: Map<string, NavetEntity>;
};

function readEntityState(entity: NavetEntity): EntityStateRecord {
  return entity.attributes && typeof entity.attributes === 'object' ? entity.attributes : {};
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value.filter((entry): entry is string => typeof entry === 'string');
  return strings.length > 0 ? strings : undefined;
}

function toBaseDevice(entity: NavetEntity, state: EntityStateRecord) {
  const underlyingDeviceId = readDeviceId(state);
  const defaultSize =
    entity.type === 'climate' || entity.type === 'hvac' || entity.type === 'media_player'
      ? 'medium'
      : 'small';

  return {
    id: entity.canonicalId,
    name: entity.name,
    room: entity.room ?? 'Unknown',
    roomId: entity.roomId,
    size: readString(state.size, defaultSize) as
      | 'small'
      | 'medium'
      | 'large'
      | 'extra-large'
      | 'medium-vertical',
    providerId: entity.providerId,
    nativeId: entity.externalId,
    canonicalId: entity.canonicalId,
    underlyingDeviceId,
    resources: entity.resources
      ? {
          primaryImage: entity.resources.primary_image,
          artwork: entity.resources.media_artwork,
          snapshot: entity.resources.camera_snapshot,
          stream: entity.resources.camera_stream,
        }
      : undefined,
    securityKind: readSecurityKind(state.securityKind),
    securitySeverity: readSecuritySeverity(state.securitySeverity),
  };
}

function resolveEntityValue(entity: NavetEntity, state: EntityStateRecord) {
  return 'value' in state ? state.value : entity.primaryState;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readSecurityKind(value: unknown) {
  switch (value) {
    case 'alarm':
    case 'lock':
    case 'camera':
    case 'siren':
    case 'door':
    case 'window':
    case 'garageDoor':
    case 'opening':
    case 'motion':
    case 'occupancy':
    case 'presence':
    case 'tamper':
    case 'smoke':
    case 'carbonMonoxide':
    case 'gas':
    case 'waterLeak':
    case 'vibration':
    case 'sound':
    case 'safety':
    case 'problem':
    case 'connectivity':
    case 'battery':
    case 'person':
    case 'deviceTracker':
    case 'button':
    case 'event':
      return value;
    default:
      return undefined;
  }
}

function readSecuritySeverity(value: unknown) {
  switch (value) {
    case 'critical':
    case 'warning':
    case 'active':
    case 'normal':
    case 'unknown':
      return value;
    default:
      return undefined;
  }
}

function readDeviceId(state: EntityStateRecord): string | undefined {
  return readOptionalString(state.deviceId) ?? readOptionalString(state.sourceDeviceId);
}

function isSuppressedEntityCategory(state: EntityStateRecord) {
  return state.entityCategory === 'config' || state.entityCategory === 'diagnostic';
}

export function hasStableDeviceCollectionMembership(
  previous: NavetEntity,
  next: NavetEntity
): boolean {
  const previousState = readEntityState(previous);
  const nextState = readEntityState(next);

  return (
    previous.canonicalId === next.canonicalId &&
    previous.providerId === next.providerId &&
    previous.externalId === next.externalId &&
    previous.type === next.type &&
    previous.name === next.name &&
    readDeviceId(previousState) === readDeviceId(nextState) &&
    previousState.entityCategory === nextState.entityCategory &&
    (getClimateSensorGroup(previousState.deviceClass) !== null) ===
      (getClimateSensorGroup(nextState.deviceClass) !== null) &&
    previousState.retainSensorCard === nextState.retainSensorCard &&
    previousState.securityKind === nextState.securityKind
  );
}

function hasPrimaryCardType(entity: NavetEntity) {
  return [
    'light',
    'switch',
    'fan',
    'climate',
    'hvac',
    'cover',
    'lock',
    'media_player',
    'vacuum',
    'camera',
  ].includes(entity.type);
}

function getSwitchPrimarySortKey(entity: NavetEntity): [number, number, string] {
  const state = readEntityState(entity);
  const categoryPenalty =
    state.entityCategory === 'config' ? 100 : state.entityCategory === 'diagnostic' ? 200 : 0;
  const objectId = entity.externalId.includes('.')
    ? entity.externalId.split('.').slice(1).join('.').toLowerCase()
    : entity.externalId.toLowerCase();
  const friendlyName = entity.name.toLowerCase();
  const helperKeywordPenalty =
    /(boost|timer|speed|mode|humidity|light|brightness|delay|interval|preset|continuous|trickle|gateway|restart|reboot|update|oscillat|swing|display|buzzer|beep|indicator|child[_\s-]?lock|led)/.test(
      `${objectId} ${friendlyName}`
    )
      ? 20
      : 0;

  return [categoryPenalty + helperKeywordPenalty, objectId.length, objectId];
}

function compareSortKeys(left: [number, number, string], right: [number, number, string]) {
  if (left[0] !== right[0]) {
    return left[0] - right[0];
  }

  if (left[1] !== right[1]) {
    return left[1] - right[1];
  }

  return left[2].localeCompare(right[2]);
}

function buildDeviceSuppressionIndexes(entities: NavetEntity[]): DeviceSuppressionIndexes {
  const indexes: DeviceSuppressionIndexes = {
    deviceIdsWithPrimaryCards: new Set<string>(),
    deviceIdsWithClimateEntity: new Set<string>(),
    deviceIdsWithFanEntity: new Set<string>(),
    deviceIdsWithVacuumEntity: new Set<string>(),
    primarySwitchByDeviceId: new Map<string, NavetEntity>(),
  };

  for (const entity of entities) {
    const state = readEntityState(entity);
    const deviceId = readDeviceId(state);

    if (!deviceId) {
      continue;
    }

    if (hasPrimaryCardType(entity)) {
      indexes.deviceIdsWithPrimaryCards.add(deviceId);
    }

    if (entity.type === 'climate' || entity.type === 'hvac') {
      indexes.deviceIdsWithClimateEntity.add(deviceId);
    }

    if (entity.type === 'fan') {
      indexes.deviceIdsWithFanEntity.add(deviceId);
    }

    if (entity.type === 'vacuum') {
      indexes.deviceIdsWithVacuumEntity.add(deviceId);
    }

    if (entity.type !== 'switch') {
      continue;
    }

    const currentPrimary = indexes.primarySwitchByDeviceId.get(deviceId);
    if (!currentPrimary) {
      indexes.primarySwitchByDeviceId.set(deviceId, entity);
      continue;
    }

    if (
      compareSortKeys(getSwitchPrimarySortKey(entity), getSwitchPrimarySortKey(currentPrimary)) < 0
    ) {
      indexes.primarySwitchByDeviceId.set(deviceId, entity);
    }
  }

  return indexes;
}

/** Compatibility snapshot for profiles saved before helper cards became opt-in. */
export function getLegacyVisibleHelperIds(entities: NavetEntity[]): string[] {
  const parentDeviceIds = new Set(
    entities
      .filter(
        (entity) =>
          hasPrimaryCardType(entity) ||
          ['sensor', 'binary_sensor', 'energy', 'unknown', 'grouped_sensor'].includes(entity.type)
      )
      .map((entity) => readDeviceId(readEntityState(entity)))
      .filter((id): id is string => Boolean(id))
  );
  return entities
    .filter((entity) => {
      if (entity.type !== 'helper') return false;
      const state = readEntityState(entity);
      // Configuration helpers were newly admitted alongside opt-in visibility.
      if (state.entityCategory === 'config') return false;
      if (readNavetHelperState(entity) || readSecurityKind(state.securityKind)) return true;
      const deviceId = readDeviceId(state);
      return !deviceId || !parentDeviceIds.has(deviceId);
    })
    .map((entity) => entity.canonicalId);
}

export function mapNavetEntitiesToDeviceCollection(entities: NavetEntity[]): DeviceCollection {
  const collection = createEmptyDeviceCollection();
  const indexes = buildDeviceSuppressionIndexes(entities);

  for (const entity of entities) {
    const state = readEntityState(entity);
    const base = toBaseDevice(entity, state);
    const value = resolveEntityValue(entity, state);
    const deviceId = readDeviceId(state);

    switch (entity.type) {
      case 'timer':
      case 'counter':
      case 'valve':
      case 'remote': {
        const key = (
          { timer: 'timers', counter: 'counters', valve: 'valves', remote: 'remotes' } as const
        )[entity.type];
        collection[key].push({ ...base, normalizedEntity: entity });
        break;
      }
      case 'light':
        collection.lights.push({
          ...base,
          state: value === 'on' || state.on === true,
          brightness: readNumber(state.brightnessPct, 0),
          temp: readNumber(state.colorTemperatureKelvin, 0),
        });
        break;
      case 'fan':
        collection.fans.push({
          ...base,
          state: value === 'on' || state.on === true,
          percentage: readNumber(state.percentage, 0),
          presetMode: typeof state.presetMode === 'string' ? state.presetMode : undefined,
          presetModes: readStringArray(state.presetModes),
        });
        break;
      case 'switch':
        if (isSuppressedEntityCategory(state)) {
          break;
        }
        if (deviceId && indexes.deviceIdsWithVacuumEntity.has(deviceId)) {
          break;
        }
        if (deviceId && indexes.deviceIdsWithClimateEntity.has(deviceId)) {
          break;
        }
        if (deviceId && indexes.deviceIdsWithFanEntity.has(deviceId)) {
          break;
        }
        if (
          deviceId &&
          indexes.primarySwitchByDeviceId.get(deviceId)?.canonicalId !== entity.canonicalId
        ) {
          break;
        }
        collection.switches.push({
          ...base,
          state: value === 'on' || state.on === true,
          entityType: typeof state.entityType === 'string' ? state.entityType : undefined,
          deviceClass: typeof state.deviceClass === 'string' ? state.deviceClass : undefined,
          serviceDomain: typeof state.serviceDomain === 'string' ? state.serviceDomain : undefined,
          serviceAction: typeof state.serviceAction === 'string' ? state.serviceAction : undefined,
          power: typeof state.power === 'number' ? state.power : undefined,
          voltage: typeof state.voltage === 'number' ? state.voltage : undefined,
          energy: typeof state.energy === 'number' ? state.energy : undefined,
          metrics: Array.isArray(state.metrics)
            ? (state.metrics as DeviceCollection['switches'][number]['metrics'])
            : undefined,
          currentHumidity:
            typeof state.currentHumidity === 'number' ? state.currentHumidity : undefined,
          targetHumidity:
            typeof state.targetHumidity === 'number' ? state.targetHumidity : undefined,
          minHumidity: typeof state.minHumidity === 'number' ? state.minHumidity : undefined,
          maxHumidity: typeof state.maxHumidity === 'number' ? state.maxHumidity : undefined,
          targetHumidityStep:
            typeof state.targetHumidityStep === 'number' ? state.targetHumidityStep : undefined,
          mode: typeof state.mode === 'string' ? state.mode : undefined,
          availableModes: readStringArray(state.availableModes),
          action: typeof state.action === 'string' ? state.action : undefined,
        });
        break;
      case 'helper': {
        const helper = readNavetHelperState(entity);
        if (helper) {
          collection.helpers.push({
            ...base,
            state: false,
            entityType: typeof state.entityType === 'string' ? state.entityType : undefined,
            helper,
          });
          break;
        }
        if (base.securityKind) {
          collection.helpers.push({
            ...base,
            state: value === 'on' || state.on === true,
            entityType: typeof state.entityType === 'string' ? state.entityType : undefined,
            serviceDomain:
              typeof state.serviceDomain === 'string' ? state.serviceDomain : undefined,
            serviceAction:
              typeof state.serviceAction === 'string' ? state.serviceAction : undefined,
          });
          break;
        }
        // Dashboard visibility absorbs helpers only while a capable parent is visible.
        // Retain them here so hidden parents and cards without helper controls stay recoverable.
        collection.helpers.push({
          ...base,
          state: value === 'on' || state.on === true,
          entityType: typeof state.entityType === 'string' ? state.entityType : undefined,
          serviceDomain: typeof state.serviceDomain === 'string' ? state.serviceDomain : undefined,
          serviceAction: typeof state.serviceAction === 'string' ? state.serviceAction : undefined,
        });
        break;
      }
      case 'sensor':
      case 'binary_sensor':
      case 'energy':
      case 'unknown':
        if (base.securityKind) {
          collection.sensors.push({
            ...base,
            value:
              typeof value === 'string'
                ? value
                : typeof value === 'number'
                  ? String(value)
                  : value === true
                    ? 'Detected'
                    : value === false
                      ? 'Clear'
                      : '',
            unit: readString(state.unit, ''),
            icon:
              typeof state.icon === 'string'
                ? (state.icon as DeviceCollection['sensors'][number]['icon'])
                : undefined,
            entityType: typeof state.entityType === 'string' ? state.entityType : undefined,
            deviceClass: typeof state.deviceClass === 'string' ? state.deviceClass : undefined,
            groupMembers: readStringArray(state.groupMembers),
            sourceDeviceId:
              typeof state.sourceDeviceId === 'string' ? state.sourceDeviceId : undefined,
            sourceDeviceName:
              typeof state.sourceDeviceName === 'string' ? state.sourceDeviceName : undefined,
            status:
              typeof state.status === 'string'
                ? (state.status as DeviceCollection['sensors'][number]['status'])
                : undefined,
            lastUpdated:
              typeof state.lastUpdated === 'string'
                ? state.lastUpdated
                : typeof state.last_updated === 'string'
                  ? state.last_updated
                  : entity.lastUpdated,
            alarmState:
              typeof state.alarmState === 'string'
                ? (state.alarmState as DeviceCollection['sensors'][number]['alarmState'])
                : undefined,
            alarmSupportedActions: Array.isArray(state.alarmSupportedActions)
              ? (state.alarmSupportedActions as DeviceCollection['sensors'][number]['alarmSupportedActions'])
              : undefined,
            alarmCodeFormat:
              state.alarmCodeFormat === 'none' ||
              state.alarmCodeFormat === 'number' ||
              state.alarmCodeFormat === 'text'
                ? state.alarmCodeFormat
                : undefined,
            alarmRequiresCode:
              typeof state.alarmRequiresCode === 'boolean' ? state.alarmRequiresCode : undefined,
            alarmChangedBy:
              typeof state.alarmChangedBy === 'string' ? state.alarmChangedBy : undefined,
            alarmLastChanged:
              typeof state.alarmLastChanged === 'string' ? state.alarmLastChanged : undefined,
            availability:
              state.availability === 'available' ||
              state.availability === 'unavailable' ||
              state.availability === 'unknown'
                ? state.availability
                : entity.availability,
          });
          break;
        }
        if (
          deviceId &&
          indexes.deviceIdsWithPrimaryCards.has(deviceId) &&
          state.retainSensorCard !== true &&
          (entity.type !== 'sensor' ||
            isSuppressedEntityCategory(state) ||
            getClimateSensorGroup(state.deviceClass) === null)
        ) {
          break;
        }
        collection.sensors.push({
          ...base,
          value:
            typeof value === 'string'
              ? value
              : typeof value === 'number'
                ? String(value)
                : value === true
                  ? 'Detected'
                  : value === false
                    ? 'Clear'
                    : '',
          unit: readString(state.unit, ''),
          icon:
            typeof state.icon === 'string'
              ? (state.icon as DeviceCollection['sensors'][number]['icon'])
              : undefined,
          entityType: typeof state.entityType === 'string' ? state.entityType : undefined,
          deviceClass: typeof state.deviceClass === 'string' ? state.deviceClass : undefined,
          groupMembers: readStringArray(state.groupMembers),
          sourceDeviceId:
            typeof state.sourceDeviceId === 'string' ? state.sourceDeviceId : undefined,
          sourceDeviceName:
            typeof state.sourceDeviceName === 'string' ? state.sourceDeviceName : undefined,
          status:
            typeof state.status === 'string'
              ? (state.status as DeviceCollection['sensors'][number]['status'])
              : undefined,
          lastUpdated:
            typeof state.lastUpdated === 'string'
              ? state.lastUpdated
              : typeof state.last_updated === 'string'
                ? state.last_updated
                : entity.lastUpdated,
        });
        break;
      case 'grouped_sensor':
        collection['grouped-sensors'].push({
          ...base,
          sensors: Array.isArray(state.sensors)
            ? (state.sensors as DeviceCollection['grouped-sensors'][number]['sensors'])
            : [],
          accentColor:
            state.accentColor === 'teal' ||
            state.accentColor === 'blue' ||
            state.accentColor === 'purple' ||
            state.accentColor === 'amber' ||
            state.accentColor === 'emerald'
              ? state.accentColor
              : undefined,
        });
        break;
      case 'climate':
      case 'hvac': {
        const supportedClimateModes = readStringArray(
          state.supportedClimateModes ?? state.supportedHvacModes
        );
        collection.climate.push({
          ...base,
          temperature: readNumber(state.temperature, 0),
          currentTemperature: readNumber(state.currentTemperature, 0),
          hasCurrentTemperature:
            typeof state.hasCurrentTemperature === 'boolean'
              ? state.hasCurrentTemperature
              : undefined,
          temperatureUnit:
            state.temperatureUnit === 'celsius' || state.temperatureUnit === 'fahrenheit'
              ? state.temperatureUnit
              : undefined,
          mode: readString(state.mode, 'off'),
          action: typeof state.action === 'string' ? state.action : undefined,
          supportedClimateModes,
          supportedHvacModes: supportedClimateModes,
          serviceDomain:
            state.serviceDomain === 'climate' || state.serviceDomain === 'water_heater'
              ? state.serviceDomain
              : undefined,
        });
        break;
      }
      case 'weather':
        collection.weather.push({
          ...base,
          temperature: readNumber(state.temperature, 0),
          temperatureUnit:
            state.temperatureUnit === 'celsius' || state.temperatureUnit === 'fahrenheit'
              ? state.temperatureUnit
              : undefined,
          feelsLikeTemperature:
            typeof state.feelsLikeTemperature === 'number' ? state.feelsLikeTemperature : undefined,
          feelsLikeTemperatureUnit:
            state.feelsLikeTemperatureUnit === 'celsius' ||
            state.feelsLikeTemperatureUnit === 'fahrenheit'
              ? state.feelsLikeTemperatureUnit
              : undefined,
          location: readString(state.location, base.room),
          condition: readString(state.condition, ''),
          humidity: readNumber(state.humidity, 0),
          windSpeed: readNumber(state.windSpeed, 0),
          windSpeedUnit: typeof state.windSpeedUnit === 'string' ? state.windSpeedUnit : undefined,
          windGustSpeed: typeof state.windGustSpeed === 'number' ? state.windGustSpeed : undefined,
          pressure: readNumber(state.pressure, 0),
          pressureUnit: typeof state.pressureUnit === 'string' ? state.pressureUnit : undefined,
          uvIndex: typeof state.uvIndex === 'number' ? state.uvIndex : undefined,
          cloudCoverage: typeof state.cloudCoverage === 'number' ? state.cloudCoverage : undefined,
          precipitation: readNumber(state.precipitation, 0),
          precipitationUnit: readString(state.precipitationUnit, ''),
          sunrise: readString(state.sunrise, ''),
          sunset: readString(state.sunset, ''),
          daylight: readString(state.daylight, ''),
          rainForecast: readString(state.rainForecast, ''),
          highTemp: readNumber(state.highTemp, 0),
          highTempUnit:
            state.highTempUnit === 'celsius' || state.highTempUnit === 'fahrenheit'
              ? state.highTempUnit
              : undefined,
          lowTemp: readNumber(state.lowTemp, 0),
          lowTempUnit:
            state.lowTempUnit === 'celsius' || state.lowTempUnit === 'fahrenheit'
              ? state.lowTempUnit
              : undefined,
          forecastMode:
            state.forecastMode === 'weekly' || state.forecastMode === 'hourly'
              ? state.forecastMode
              : 'weekly',
          forecast: Array.isArray(state.forecast)
            ? (state.forecast as DeviceCollection['weather'][number]['forecast'])
            : [],
        });
        break;
      case 'media_player':
        collection.media.push({
          ...base,
          title: readString(state.title, entity.name),
          artist: readString(state.artist, ''),
          album: readString(state.album, ''),
          entityType: typeof state.entityType === 'string' ? state.entityType : undefined,
          deviceClass: typeof state.deviceClass === 'string' ? state.deviceClass : undefined,
          source: typeof state.source === 'string' ? state.source : undefined,
          sourceList: readStringArray(state.sourceList),
          entityPicture: typeof state.entityPicture === 'string' ? state.entityPicture : undefined,
          state: value === 'playing' || value === 'paused' || value === 'idle' ? value : 'off',
          isPoweredOn: state.isPoweredOn === true,
          volume: readNumber(state.volume, 0),
          isMuted: state.isMuted === true,
          elapsedSeconds:
            typeof state.elapsedSeconds === 'number' ? state.elapsedSeconds : undefined,
          durationSeconds:
            typeof state.durationSeconds === 'number' ? state.durationSeconds : undefined,
          positionUpdatedAt:
            typeof state.positionUpdatedAt === 'string' ? state.positionUpdatedAt : undefined,
          mediaContentId:
            typeof state.mediaContentId === 'string' ? state.mediaContentId : undefined,
          mediaContentType:
            typeof state.mediaContentType === 'string' ? state.mediaContentType : undefined,
          mediaCapabilities:
            state.mediaCapabilities && typeof state.mediaCapabilities === 'object'
              ? (state.mediaCapabilities as DeviceCollection['media'][number]['mediaCapabilities'])
              : undefined,
          supportsGrouping: state.supportsGrouping === true,
          supportsPreviousTrack: state.supportsPreviousTrack !== false,
          supportsNextTrack: state.supportsNextTrack !== false,
          supportedFeatures:
            typeof state.supportedFeatures === 'number' ? state.supportedFeatures : undefined,
          groupMembers: readStringArray(state.groupMembers),
        });
        break;
      case 'cover':
        collection.covers.push({
          ...base,
          state:
            value === 'open' ||
            value === 'closed' ||
            value === 'opening' ||
            value === 'closing' ||
            value === 'unknown' ||
            value === 'unavailable'
              ? value
              : undefined,
          position: readNumber(state.position, 0),
          positionMode:
            state.positionMode === 'position' || state.positionMode === 'tilt'
              ? state.positionMode
              : undefined,
          deviceClass: typeof state.deviceClass === 'string' ? state.deviceClass : undefined,
          supportedFeatures:
            typeof state.supportedFeatures === 'number' ? state.supportedFeatures : undefined,
          hasPosition: state.hasPosition === true,
        });
        break;
      case 'lock':
        collection.locks.push({
          ...base,
          state: value === 'locked' || state.locked === true,
        });
        break;
      case 'scene':
        collection.scenes.push(base);
        break;
      case 'person':
        collection.persons.push({
          ...base,
          location: readString(state.location, ''),
          state: value === 'home' ? 'home' : 'away',
          entityPicture: typeof state.entityPicture === 'string' ? state.entityPicture : undefined,
        });
        break;
      case 'vacuum':
        collection.vacuums.push({
          ...base,
          rawStatus: readOptionalString(state.rawStatus) ?? readOptionalString(state.value),
          status: readString(state.status, 'idle') as DeviceCollection['vacuums'][number]['status'],
          battery: typeof state.battery === 'number' ? readNumber(state.battery, 0) : undefined,
          cleanedArea: typeof state.cleanedArea === 'string' ? state.cleanedArea : undefined,
          cleaningTime: typeof state.cleaningTime === 'string' ? state.cleaningTime : undefined,
          nextCleaning: typeof state.nextCleaning === 'string' ? state.nextCleaning : undefined,
          waterLevel:
            typeof state.waterLevel === 'string' || typeof state.waterLevel === 'number'
              ? state.waterLevel
              : undefined,
          binLevel:
            typeof state.binLevel === 'string' || typeof state.binLevel === 'number'
              ? state.binLevel
              : undefined,
        });
        break;
      case 'camera':
        collection.cameras.push({
          ...base,
          sourceDeviceId: deviceId,
          entityPicture: typeof state.entityPicture === 'string' ? state.entityPicture : undefined,
          state: readString(value, ''),
          supportedFeatures:
            typeof state.supportedFeatures === 'number' ? state.supportedFeatures : undefined,
          isStreamCapable: state.isStreamCapable === true,
          isStillImageOnly: state.isStillImageOnly === true,
          lastChanged:
            typeof state.lastChanged === 'string'
              ? state.lastChanged
              : typeof state.last_changed === 'string'
                ? state.last_changed
                : undefined,
          lastUpdated:
            typeof state.lastUpdated === 'string'
              ? state.lastUpdated
              : typeof state.last_updated === 'string'
                ? state.last_updated
                : entity.lastUpdated,
          motionDetected: state.motionDetected === true,
          motionChangedAt:
            typeof state.motionChangedAt === 'string' ? state.motionChangedAt : undefined,
        });
        break;
      default:
        break;
    }
  }

  return collection;
}
