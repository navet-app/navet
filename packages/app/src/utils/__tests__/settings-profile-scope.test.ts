import { defaultSettings, useSettingsStore } from '@navet/app/stores/settings-store';
import { detectDeviceTier } from '@navet/app/utils/detect-device-tier';
import {
  applySettingsPreferenceLayer,
  applySettingsPreferenceLayerToStore,
  isCredentialBearingSettingsUrl,
  isCredentialFieldName,
  migrateSettingsPreferenceLayer,
  projectSettingsPreferenceLayer,
  SETTINGS_PROFILE_CLASSIFICATION,
} from '@navet/app/utils/settings-profile-scope';
import { beforeEach, describe, expect, it } from 'vitest';

describe('settings profile scope', () => {
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState(), true);
  });

  it('classifies every persisted setting exactly once', () => {
    expect(Object.keys(SETTINGS_PROFILE_CLASSIFICATION).sort()).toEqual(
      Object.keys(defaultSettings).sort()
    );
    expect(SETTINGS_PROFILE_CLASSIFICATION).toMatchObject({
      showHomeSummaryBar: 'shared',
      choresEnabled: 'shared',
      language: 'account',
      keepDeviceAwake: 'device',
      disableAnimations: 'device',
      lowPowerMode: 'device',
      cameraDirectStreamUrls: 'secret',
      cameraWebRtcStreamSources: 'secret',
      cameraViewMode: 'legacy',
    });
  });

  it('round-trips screensaver opt-in only through device preferences', () => {
    const settings = {
      ...defaultSettings,
      screensaverEnabled: true,
      screensaverIdleMinutes: 10 as const,
      screensaverBackground: 'solid:mint' as const,
    };
    const device = projectSettingsPreferenceLayer(settings, 'device');
    expect(device.settings.screensaverEnabled).toBe(true);
    expect(projectSettingsPreferenceLayer(settings, 'shared').settings).not.toHaveProperty(
      'screensaverEnabled'
    );
    expect(projectSettingsPreferenceLayer(settings, 'account').settings).not.toHaveProperty(
      'screensaverEnabled'
    );
    expect(device.settings).toMatchObject({
      screensaverIdleMinutes: 10,
      screensaverBackground: 'solid:mint',
    });
    for (const layer of ['shared', 'account'] as const) {
      expect(projectSettingsPreferenceLayer(settings, layer).settings).not.toHaveProperty(
        'screensaverIdleMinutes'
      );
      expect(projectSettingsPreferenceLayer(settings, layer).settings).not.toHaveProperty(
        'screensaverBackground'
      );
    }
    applySettingsPreferenceLayerToStore(device, 'device');
    expect(useSettingsStore.getState()).toMatchObject({
      screensaverEnabled: true,
      screensaverIdleMinutes: 10,
      screensaverBackground: 'solid:mint',
    });
  });

  it('round-trips companion enablement only through device preferences', () => {
    const settings = { ...defaultSettings, companionEnabled: false };
    const device = projectSettingsPreferenceLayer(settings, 'device');
    expect(device.settings.companionEnabled).toBe(false);
    expect(projectSettingsPreferenceLayer(settings, 'shared').settings).not.toHaveProperty(
      'companionEnabled'
    );
    expect(projectSettingsPreferenceLayer(settings, 'account').settings).not.toHaveProperty(
      'companionEnabled'
    );
    expect(migrateSettingsPreferenceLayer(device, 'device').settings.companionEnabled).toBe(false);
    useSettingsStore.getState().updateSettings({ companionEnabled: true });
    applySettingsPreferenceLayerToStore(device, 'device');
    expect(useSettingsStore.getState().companionEnabled).toBe(false);
  });

  it('keeps companion collapse local to the device preference layer', () => {
    const settings = { ...defaultSettings, companionCollapsed: true };
    expect(projectSettingsPreferenceLayer(settings, 'device').settings.companionCollapsed).toBe(
      true
    );
    expect(projectSettingsPreferenceLayer(settings, 'shared').settings).not.toHaveProperty(
      'companionCollapsed'
    );
    expect(projectSettingsPreferenceLayer(settings, 'account').settings).not.toHaveProperty(
      'companionCollapsed'
    );
    expect(
      migrateSettingsPreferenceLayer(
        { schemaVersion: 1, settings: { companionCollapsed: true } },
        'device'
      ).settings.companionCollapsed
    ).toBe(true);
  });

  it('projects shared, account, and device documents without credentials', () => {
    const settings = {
      ...defaultSettings,
      username: 'Vishal',
      email: 'vishal@example.com',
      language: 'sv' as const,
      showHomeSummaryBar: false,
      choresEnabled: false,
      keepDeviceAwake: true,
      cameraDirectStreamUrls: {
        'camera.front': 'https://user:secret@example.com/live?token=private',
      },
      cameraWebRtcStreamSources: {
        'camera.front': 'direct' as const,
      },
      customSidebarActions: [
        {
          id: 'private-link',
          label: 'Private camera',
          icon: 'Link2',
          targetType: 'url' as const,
          targetUrl: 'https://example.com/live?access_token=private',
        },
      ],
    };

    const shared = projectSettingsPreferenceLayer(settings, 'shared');
    const account = projectSettingsPreferenceLayer(settings, 'account');
    const device = projectSettingsPreferenceLayer(settings, 'device');

    expect(shared.settings).toMatchObject({ choresEnabled: false, showHomeSummaryBar: false });
    expect(account.settings).toMatchObject({ language: 'sv' });
    expect(device.settings).toMatchObject({ keepDeviceAwake: true });
    for (const projection of [shared, account, device]) {
      expect(projection.settings).not.toHaveProperty('username');
      expect(projection.settings).not.toHaveProperty('email');
      expect(projection.settings).not.toHaveProperty('cameraDirectStreamUrls');
      expect(projection.settings).not.toHaveProperty('cameraWebRtcStreamSources');
      expect(JSON.stringify(projection)).not.toContain('private');
    }
    expect(shared.settings.customSidebarActions).toEqual([]);
  });

  it('migrates only validated values for the requested layer', () => {
    expect(
      migrateSettingsPreferenceLayer(
        {
          schemaVersion: 99,
          settings: {
            language: 'sv',
            temperatureUnit: 'kelvin',
            kioskMode: true,
            cameraDirectStreamUrls: { 'camera.front': 'https://secret.example.com' },
          },
        },
        'account'
      )
    ).toEqual({
      schemaVersion: 1,
      settings: {
        language: 'sv',
      },
    });
  });

  it('migrates legacy device camera and effects preferences', () => {
    expect(
      migrateSettingsPreferenceLayer(
        {
          schemaVersion: 0,
          settings: {
            cameraViewMode: 'snapshot',
            cameraStreamPreferences: {
              'camera.front': 'direct_stream',
            },
            effectsQuality: 'low',
          },
        },
        'device'
      )
    ).toEqual({
      schemaVersion: 1,
      settings: expect.objectContaining({
        cameraDashboardViewMode: 'snapshot',
        cameraStreamPreferences: {
          'home_assistant:camera.front': 'web_rtc',
        },
        effectsQuality: 'low',
        effectsQualityUserOverride: true,
      }),
    });
  });

  it('keeps the legacy default high quality on automatic device detection', () => {
    expect(
      migrateSettingsPreferenceLayer(
        {
          schemaVersion: 0,
          settings: {
            effectsQuality: 'high',
          },
        },
        'device'
      )
    ).toEqual({
      schemaVersion: 1,
      settings: expect.objectContaining({
        effectsQuality: 'high',
        effectsQualityUserOverride: false,
      }),
    });
  });

  it('redetects effects quality when a device preference remains on Auto', () => {
    const next = applySettingsPreferenceLayer(
      {
        ...defaultSettings,
        effectsQuality: 'low',
        effectsQualityUserOverride: true,
      },
      {
        settings: {
          effectsQuality: 'low',
          effectsQualityUserOverride: false,
        },
      },
      'device'
    );

    expect(next.effectsQualityUserOverride).toBe(false);
    expect(next.effectsQuality).toBe(detectDeviceTier());
  });

  it('applies one layer without replacing settings owned by another layer', () => {
    const current = {
      ...defaultSettings,
      language: 'en' as const,
      keepDeviceAwake: true,
      showHomeSummaryBar: true,
    };
    const next = applySettingsPreferenceLayer(
      current,
      {
        settings: {
          language: 'sv',
          keepDeviceAwake: false,
          showHomeSummaryBar: false,
        },
      },
      'account'
    );

    expect(next.language).toBe('sv');
    expect(next.keepDeviceAwake).toBe(true);
    expect(next.showHomeSummaryBar).toBe(true);
  });

  it('applies sanitized preference documents to the live settings store', () => {
    useSettingsStore.getState().updateSettings({
      language: 'en',
      kioskMode: true,
    });

    applySettingsPreferenceLayerToStore(
      {
        settings: {
          language: 'de',
          kioskMode: false,
        },
      },
      'account'
    );

    expect(useSettingsStore.getState()).toMatchObject({
      language: 'de',
      kioskMode: true,
    });
  });

  it('detects credential field names and credential-bearing URLs', () => {
    expect(isCredentialFieldName('refresh_token')).toBe(true);
    expect(isCredentialFieldName('cameraFitMode')).toBe(false);
    expect(isCredentialBearingSettingsUrl('https://user:secret@example.com/live')).toBe(true);
    expect(isCredentialBearingSettingsUrl('https://example.com/live?access_token=private')).toBe(
      true
    );
    expect(isCredentialBearingSettingsUrl('/api/camera_proxy/camera.front?authSig=private')).toBe(
      true
    );
    expect(isCredentialBearingSettingsUrl('/dashboard#access_token=private')).toBe(true);
    expect(isCredentialBearingSettingsUrl('/dashboard#/camera?api_key=private')).toBe(true);
    expect(isCredentialBearingSettingsUrl('/oauth/callback?code=private')).toBe(true);
    expect(isCredentialBearingSettingsUrl('/dashboard?jwt=private')).toBe(true);
    expect(isCredentialBearingSettingsUrl('/dashboard?X-API-Key=private')).toBe(true);
    expect(isCredentialBearingSettingsUrl('https://example.com/live?camera=front')).toBe(false);
    expect(isCredentialBearingSettingsUrl('/dashboard?camera=front#overview')).toBe(false);
  });
});
