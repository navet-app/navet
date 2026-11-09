import type { IntegrationProviderId } from '@navet/core/integration-providers';
import type { PlatformMapMarker } from '@navet/core/provider-feature-models';
export interface MapMarker extends PlatformMapMarker {
  providerId?: IntegrationProviderId;
}
