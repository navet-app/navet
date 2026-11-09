import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ha, homey } = vi.hoisted(() => ({ ha: vi.fn(), homey: vi.fn() }));
vi.mock('@navet/app/stores/integration-store', () => ({
  integrationStore: { getState: () => ({ currentProviderId: 'homey' }) },
}));
vi.mock('@navet/app/provider-runtime-registry', () => ({
  getProviderRuntimeRegistration: (provider: string) => ({
    climateFeatureService: { setTargetTemperature: provider === 'home_assistant' ? ha : homey },
  }),
}));

import { integrationClimateFeatureService } from '../integration-climate-feature.service';

const update = { temperature: 21 };
beforeEach(() => vi.clearAllMocks());
describe('climate command ownership', () => {
  it('uses an explicit entity owner even when another provider is current', async () => {
    await integrationClimateFeatureService.setTargetTemperature(
      'climate.living_room',
      update,
      'home_assistant'
    );
    expect(ha).toHaveBeenCalledWith('climate.living_room', update);
    expect(homey).not.toHaveBeenCalled();
  });
  it('retains scoped routing and the existing current-provider fallback for other callers', async () => {
    await integrationClimateFeatureService.setTargetTemperature(
      'home_assistant:climate.living_room',
      update
    );
    expect(ha).toHaveBeenCalledWith('climate.living_room', update);
    await integrationClimateFeatureService.setTargetTemperature('radiator', update);
    expect(homey).toHaveBeenCalledWith('radiator', update);
  });
});
