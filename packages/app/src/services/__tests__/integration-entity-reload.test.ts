import { integrationStore } from '@navet/app/stores/integration-store';
import { homeAssistantAdminFeatureService } from '@navet/provider-homeassistant/homeassistant-admin-feature.service';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as runtime from '../../provider-runtime-registry';
import { integrationAdminService } from '../integration-admin.service';

// Keep: administrative recovery must reach the entity owner, independent of current selection.
describe('integration reload routing', () => {
  afterEach(() => vi.restoreAllMocks());

  it('routes a scoped Home Assistant entity while another provider is selected', async () => {
    integrationStore.getState().setCurrentProviderId('homey');
    const registration = runtime.getProviderRuntimeRegistration('home_assistant');
    const reload = vi.fn(async () => undefined);
    const available = vi.fn(() => true);
    const lookup = vi.spyOn(runtime, 'getProviderRuntimeRegistration').mockReturnValue({
      ...registration,
      adminFeatureService: {
        ...homeAssistantAdminFeatureService,
        canReloadEntityIntegration: available,
        reloadEntityIntegration: reload,
      },
    });
    const id = 'home_assistant:light.kitchen';
    expect(integrationAdminService.canReloadEntityIntegration(id)).toBe(true);
    await integrationAdminService.reloadEntityIntegration(id);
    expect(lookup.mock.calls.every(([providerId]) => providerId === 'home_assistant')).toBe(true);
    expect(reload).toHaveBeenCalledExactlyOnceWith(id);
  });

  it('hides unsupported providers and rejects their reload requests', async () => {
    expect(integrationAdminService.canReloadEntityIntegration('openhab:lamp')).toBe(false);
    await expect(integrationAdminService.reloadEntityIntegration('openhab:lamp')).rejects.toThrow(
      'unavailable'
    );
  });

  it.each(['hubitat', 'smartthings'])(
    'does not look up a runtime for catalog-only %s',
    async (providerId) => {
      const lookup = vi.spyOn(runtime, 'getProviderRuntimeRegistration');
      const id = `${providerId}:lamp`;
      expect(integrationAdminService.canReloadEntityIntegration(id)).toBe(false);
      await expect(integrationAdminService.reloadEntityIntegration(id)).rejects.toThrow(
        'unavailable'
      );
      expect(lookup).not.toHaveBeenCalled();
    }
  );

  it('rechecks entity availability before dispatch and propagates backend failures', async () => {
    const registration = runtime.getProviderRuntimeRegistration('home_assistant');
    const available = vi.fn(() => false);
    const reload = vi.fn(async () => {
      throw new Error('backend unavailable');
    });
    vi.spyOn(runtime, 'getProviderRuntimeRegistration').mockReturnValue({
      ...registration,
      adminFeatureService: {
        ...homeAssistantAdminFeatureService,
        canReloadEntityIntegration: available,
        reloadEntityIntegration: reload,
      },
    });
    await expect(
      integrationAdminService.reloadEntityIntegration('home_assistant:light.kitchen')
    ).rejects.toThrow('unavailable');
    expect(reload).not.toHaveBeenCalled();
    available.mockReturnValue(true);
    await expect(
      integrationAdminService.reloadEntityIntegration('home_assistant:light.kitchen')
    ).rejects.toThrow('backend unavailable');
  });
});
