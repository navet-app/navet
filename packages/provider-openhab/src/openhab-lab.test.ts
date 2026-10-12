import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeOpenHABCommand } from './openhab-adapter';
import {
  openhabEntityRuntimeService,
  resetOpenhabEntityRuntimeServiceCachesForTests,
} from './openhab-entity-runtime.service';
import {
  openHABClimateFeatureService,
  openHABNativeActionFeatureService,
  openHABSecurityFeatureService,
} from './openhab-feature-services';
import { buildOpenHABProviderRooms, mapOpenHABSnapshotToNavetEntities } from './openhab-mappers';
import { openhabService } from './openhab-service';
import type { OpenHABItem, OpenHABSnapshot } from './openhab-types';

function labSnapshot(): OpenHABSnapshot {
  const declarations = readFileSync(
    resolve(process.cwd(), 'testing/provider-lab/openhab/conf/items/navet-lab.items'),
    'utf8'
  );
  const rules = readFileSync(
    resolve(process.cwd(), 'testing/provider-lab/openhab/conf/rules/navet-lab.rules'),
    'utf8'
  );
  const seeds = new Map(
    [...rules.matchAll(/(\w+)\.postUpdate\(([^\n]+)\)/g)].map((match) => [
      match[1],
      match[2].replace(/^"|"$/g, ''),
    ])
  );
  const items = new Map<string, OpenHABItem>();
  for (const match of declarations.matchAll(
    /^(Group|Switch|Dimmer|Color|Contact|String|DateTime|Rollershutter|Number(?::\w+)?)\s+(\w+)\s+"([^"]+)"(?:\s+<([^>]+)>)?(?:\s+\(([^)]+)\))?(?:\s+\[([^\]]+)\])?/gm
  )) {
    const [, type, name, label, category, groups, tags] = match;
    items.set(name, {
      name,
      type,
      label,
      category,
      groupNames: groups?.split(',').map((group) => group.trim()) ?? [],
      tags: [...(tags ?? '').matchAll(/"([^"]+)"/g)].map((tag) => tag[1]),
      state: type === 'DateTime' ? '2026-09-14T20:00:00Z' : (seeds.get(name) ?? 'NULL'),
    });
  }
  return { connected: true, items: Object.fromEntries(items) };
}

describe('openHAB provider lab coverage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    openhabService.resetSnapshot();
    resetOpenhabEntityRuntimeServiceCachesForTests();
  });

  it('imports every point in the lab, retaining stable IDs and assigning all eight rooms', () => {
    const snapshot = labSnapshot();
    const entities = mapOpenHABSnapshotToNavetEntities(snapshot);
    const points = Object.values(snapshot.items).filter((item) => item.type !== 'Group');
    expect(points).toHaveLength(48);
    expect(entities.map((entity) => entity.externalId).sort()).toEqual(
      points.map((point) => point.name).sort()
    );
    expect(entities.every((entity) => entity.canonicalId === `openhab:${entity.externalId}`)).toBe(
      true
    );
    expect(buildOpenHABProviderRooms(snapshot)).toHaveLength(8);
    const byId = new Map(entities.map((entity) => [entity.externalId, entity]));
    expect(byId.get('NavetBedroom_FanSpeed')).toMatchObject({
      type: 'fan',
      attributes: { percentage: 40 },
    });
    expect(byId.get('NavetMedia_State')).toMatchObject({
      type: 'media_player',
      primaryState: 'paused',
      attributes: { volume: 32 },
    });
    expect(byId.get('NavetBedroom_RadiatorTarget')).toMatchObject({
      type: 'climate',
      attributes: { temperature: 19.5, currentTemperature: 18.8 },
    });
    expect(byId.get('NavetLivingAccent_Color')).toMatchObject({
      type: 'light',
      attributes: { brightnessPct: 68 },
    });
    expect(byId.get('NavetBedroom_Blind')).toMatchObject({
      type: 'cover',
      attributes: { position: 65, hasPosition: true },
    });
    expect(byId.get('NavetHallway_Motion')).toMatchObject({
      type: 'binary_sensor',
      attributes: { securityKind: 'motion', securitySeverity: 'normal' },
    });
    expect(byId.get('NavetHallway_CO')).toMatchObject({
      attributes: { securityKind: 'carbonMonoxide' },
    });
    expect(byId.get('NavetKitchen_FreezerAlarm')).toMatchObject({
      attributes: { securityKind: 'safety', securitySeverity: 'critical' },
    });
    expect(byId.get('NavetBedroom_WindowBattery')).toMatchObject({
      attributes: { deviceClass: 'battery', unit: '%', securitySeverity: 'warning' },
    });
    expect(byId.get('NavetOffice_PM25')).toMatchObject({
      attributes: { deviceClass: 'pm25', unit: 'μg/m³' },
    });
    expect(byId.get('NavetOffice_TVOC')).toMatchObject({
      attributes: { deviceClass: 'volatile_organic_compounds', unit: 'ppb' },
    });
    expect(byId.get('NavetLaundry_WaterMeter')).toMatchObject({
      attributes: { unit: 'm³', deviceClass: 'water' },
    });
    expect(byId.get('NavetLastActivity')).toMatchObject({ primaryState: '2026-09-14T20:00:00Z' });
    expect(byId.get('NavetKitchenCoffee_Power')).toMatchObject({
      attributes: {
        metrics: [
          { value: 0, unit: 'W' },
          { value: 12.45, unit: 'kWh' },
        ],
      },
    });
  });

  it('routes lock, cover, thermostat and speaker controls to the correct native items', async () => {
    const snapshot = labSnapshot();
    openhabService.replaceSnapshot(snapshot);
    const send = vi.spyOn(openhabService, 'sendItemCommand').mockResolvedValue();
    await openHABSecurityFeatureService.unlockEntity('NavetHallway_FrontDoorLock');
    await openHABSecurityFeatureService.setCoverPosition('NavetBedroom_Blind', 80);
    await openHABSecurityFeatureService.stopCover('NavetBedroom_Blind');
    await openHABClimateFeatureService.setTargetTemperature('NavetBedroom_RadiatorTarget', {
      temperature: 19.5,
    });
    const speaker = mapOpenHABSnapshotToNavetEntities(snapshot).find(
      (item) => item.externalId === 'NavetMedia_State'
    );
    expect(speaker).toBeDefined();
    if (!speaker) throw new Error('Missing lab speaker');
    await executeOpenHABCommand(speaker, { type: 'set_volume', entityId: speaker.id, volume: 50 });
    await executeOpenHABCommand(speaker, { type: 'start', entityId: speaker.id });
    await openHABNativeActionFeatureService.invokeAction({
      domain: 'fan',
      service: 'set_percentage',
      entityId: 'NavetBedroom_FanSpeed',
      serviceData: { percentage: 60 },
    });
    await openHABNativeActionFeatureService.invokeAction({
      domain: 'light',
      service: 'turn_on',
      entityId: 'NavetLivingAccent_Color',
      serviceData: { hs_color: [140, 80], brightness_pct: 45 },
    });
    expect(send.mock.calls).toEqual([
      ['NavetHallway_FrontDoorLock', 'OFF'],
      ['NavetBedroom_Blind', '20'],
      ['NavetBedroom_Blind', 'STOP'],
      ['NavetBedroom_RadiatorTarget', '19.5'],
      ['NavetMedia_Volume', '50'],
      ['NavetMedia_State', 'PLAYING'],
      ['NavetBedroom_FanSpeed', '60'],
      ['NavetLivingAccent_Color', '140,80,45'],
    ]);
  });

  it('preserves unknown safety readings and rejects writes to read-only setpoints', async () => {
    const snapshot = labSnapshot();
    snapshot.items.NavetKitchen_FreezerAlarm.state = 'UNDEF';
    snapshot.items.NavetBedroom_RadiatorTarget.stateDescription = { readOnly: true };
    openhabService.replaceSnapshot(snapshot);
    const send = vi.spyOn(openhabService, 'sendItemCommand').mockResolvedValue();
    expect(
      mapOpenHABSnapshotToNavetEntities(snapshot).find(
        (item) => item.externalId === 'NavetKitchen_FreezerAlarm'
      )
    ).toMatchObject({ availability: 'unknown', attributes: { securitySeverity: 'unknown' } });
    await expect(
      openHABClimateFeatureService.setTargetTemperature('NavetBedroom_RadiatorTarget', {
        temperature: 20,
      })
    ).rejects.toThrow('read-only');
    expect(send).not.toHaveBeenCalled();
    expect(
      openhabEntityRuntimeService.getEntitySnapshot?.('NavetBedroom_RadiatorTarget')
    ).toMatchObject({ attributes: { temperature: 19.5, current_temperature: 18.8 } });
  });

  it('uses the writable volume point when playback state is read-only', async () => {
    const snapshot = labSnapshot();
    snapshot.items.NavetMedia_State.stateDescription = { readOnly: true };
    openhabService.replaceSnapshot(snapshot);
    const send = vi.spyOn(openhabService, 'sendItemCommand').mockResolvedValue();
    await openHABNativeActionFeatureService.invokeAction({
      domain: 'media_player',
      service: 'volume_set',
      entityId: 'NavetMedia_State',
      serviceData: { volume_level: 0.45 },
    });
    expect(send).toHaveBeenCalledWith('NavetMedia_Volume', '45');
    await expect(
      openHABNativeActionFeatureService.invokeAction({
        domain: 'media_player',
        service: 'media_play',
        entityId: 'NavetMedia_State',
      })
    ).rejects.toThrow('read-only');
  });
});
