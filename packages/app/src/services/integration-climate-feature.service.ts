import type {
  ProviderClimateFeatureService,
  ProviderClimateTemperatureUpdate,
} from '@navet/app/platform/provider-feature-services';
import { getProviderRuntimeRegistration } from '@navet/app/provider-runtime-registry';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import {
  getNativeIntegrationEntityId,
  resolveIntegrationProviderId,
} from './integration-provider-context.service';

function getClimateFeatureService(entityId: string, ownerProviderId?: IntegrationProviderId) {
  const providerId = resolveIntegrationProviderId(entityId, ownerProviderId);
  const service = getProviderRuntimeRegistration(providerId).climateFeatureService;
  if (!service) {
    throw new Error('Climate controls are not implemented yet for the current integration');
  }
  return service;
}

export const integrationClimateFeatureService = {
  setTargetTemperature: async (
    entityId: string,
    update: ProviderClimateTemperatureUpdate,
    ownerProviderId?: IntegrationProviderId
  ) =>
    await getClimateFeatureService(entityId, ownerProviderId).setTargetTemperature(
      getNativeIntegrationEntityId(entityId),
      update
    ),
} satisfies ProviderClimateFeatureService;
