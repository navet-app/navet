import { getProviderRuntimeRegistration } from '@navet/app/provider-runtime-registry';
import { parseProviderScopedId } from '@navet/core/ids';
import type {
  PlatformLocationHistoryRequest,
  PlatformLocationPoint,
} from '@navet/core/provider-feature-models';

export async function getIntegrationLocationHistory(
  request: PlatformLocationHistoryRequest
): Promise<PlatformLocationPoint[][] | null> {
  const owner = parseProviderScopedId(request.entityId);
  if (!owner) throw new Error('Location history requires an owning provider');
  const service = getProviderRuntimeRegistration(owner.providerId).mapFeatureService;
  if (!service?.getLocationHistory) return null;
  if (request.signal?.aborted) throw request.signal.reason;
  const result = await service.getLocationHistory({ ...request, entityId: owner.nativeId });
  if (request.signal?.aborted) throw request.signal.reason;
  return result;
}
