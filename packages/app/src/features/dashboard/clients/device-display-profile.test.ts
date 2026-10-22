import { defaultSettings } from '@navet/app/stores/settings-store';
import { describe, expect, it } from 'vitest';
import {
  mergeDeviceDisplayProfilePolicies,
  projectDeviceDisplaySettings,
  sanitizeDeviceDisplayProfilePolicy,
  sanitizeDeviceDisplaySettings,
} from './device-display-profile';

const timestamp = '2026-08-03T10:00:00.000Z';

function profile(name: string, settings: Record<string, unknown>) {
  return {
    id: `display_${name.toLowerCase().replaceAll(' ', '_')}`,
    name,
    settings,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe('device display profiles', () => {
  it.each([true, false])('copies explicit screensaver and panel preferences (%s)', (enabled) => {
    expect(
      projectDeviceDisplaySettings({
        ...defaultSettings,
        screensaverEnabled: enabled,
        companionEnabled: enabled,
        companionCollapsed: enabled,
      })
    ).toMatchObject({
      screensaverEnabled: enabled,
      companionEnabled: enabled,
      companionCollapsed: enabled,
    });
  });

  it('rejects malformed screen preferences and leaves absent legacy preferences unset', () => {
    expect(
      sanitizeDeviceDisplaySettings({
        screensaverEnabled: 'true',
        companionEnabled: 1,
        companionCollapsed: null,
      })
    ).toEqual({});
    expect(sanitizeDeviceDisplaySettings({})).toEqual({});
  });
  it('projects only safe cross-device display settings', () => {
    const settings = projectDeviceDisplaySettings({
      ...defaultSettings,
      kioskMode: true,
      effectsQuality: 'low',
      effectsQualityUserOverride: true,
      cameraDirectStreamUrls: { 'camera.front': 'https://secret.example/live' },
      language: 'sv',
    });

    expect(settings).toMatchObject({
      kioskMode: true,
      effectsQuality: 'low',
      effectsQualityUserOverride: true,
    });
    expect(settings).not.toHaveProperty('cameraDirectStreamUrls');
    expect(settings).not.toHaveProperty('language');
  });

  it('keeps automatic visual quality local to each linked device', () => {
    expect(
      projectDeviceDisplaySettings({
        ...defaultSettings,
        effectsQuality: 'low',
        effectsQualityUserOverride: false,
      })
    ).toMatchObject({ effectsQualityUserOverride: false });
    expect(
      projectDeviceDisplaySettings({
        ...defaultSettings,
        effectsQuality: 'low',
        effectsQualityUserOverride: false,
      })
    ).not.toHaveProperty('effectsQuality');
  });

  it('drops malformed profiles, assignments, and unsupported settings', () => {
    expect(
      sanitizeDeviceDisplayProfilePolicy({
        profilesById: {
          display_wall: profile('Wall displays', {
            kioskMode: true,
            effectsQuality: 'low',
            cameraDirectStreamUrls: { camera: 'secret' },
          }),
          bad: { name: '', settings: {} },
        },
        profileIdByClientId: {
          client_panel_01: 'display_wall',
          client_phone_01: 'missing',
        },
      })
    ).toEqual({
      schemaVersion: 1,
      profilesById: {
        display_wall: {
          ...profile('Wall displays', {
            kioskMode: true,
            effectsQuality: 'low',
          }),
          id: 'display_wall',
        },
      },
      profileIdByClientId: {
        client_panel_01: 'display_wall',
      },
    });
  });

  it('merges changes to separate profiles and client assignments', () => {
    const base = sanitizeDeviceDisplayProfilePolicy({
      profilesById: {
        display_wall: profile('Wall displays', { kioskMode: true, effectsQuality: 'low' }),
        display_personal: profile('Personal', { kioskMode: false, effectsQuality: 'high' }),
      },
      profileIdByClientId: { client_panel_01: 'display_wall' },
    });
    const local = sanitizeDeviceDisplayProfilePolicy({
      ...base,
      profilesById: {
        ...base.profilesById,
        display_wall: profile('Wall displays', { kioskMode: true, effectsQuality: 'medium' }),
      },
      profileIdByClientId: {
        ...base.profileIdByClientId,
        client_phone_01: 'display_personal',
      },
    });
    const remote = sanitizeDeviceDisplayProfilePolicy({
      ...base,
      profilesById: {
        ...base.profilesById,
        display_personal: profile('Personal devices', {
          kioskMode: false,
          effectsQuality: 'high',
        }),
      },
      profileIdByClientId: {
        ...base.profileIdByClientId,
        client_desktop_01: 'display_personal',
      },
    });

    const merged = mergeDeviceDisplayProfilePolicies(base, local, remote);
    expect(merged.profilesById.display_wall?.settings.effectsQuality).toBe('medium');
    expect(merged.profilesById.display_personal?.name).toBe('Personal devices');
    expect(merged.profileIdByClientId).toMatchObject({
      client_panel_01: 'display_wall',
      client_phone_01: 'display_personal',
      client_desktop_01: 'display_personal',
    });
  });
});
