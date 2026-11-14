import { expect, it, vi } from 'vitest';

const { getLocationHistory } = vi.hoisted(() => ({ getLocationHistory: vi.fn() }));
vi.mock('@navet/app/provider-runtime-registry', () => ({
  getProviderRuntimeRegistration: (provider: string) => ({
    mapFeatureService: provider === 'home_assistant' ? { getLocationHistory } : undefined,
  }),
}));

import { getIntegrationLocationHistory } from '../integration-map.service';

const request = {
  entityId: 'home_assistant:person.alex',
  startTime: '2026-10-14T10:00:00Z',
  endTime: '2026-10-14T12:00:00Z',
};
it('routes coordinate history to the entity owner and distinguishes unsupported from failures', async () => {
  getLocationHistory.mockResolvedValueOnce([]);
  await expect(getIntegrationLocationHistory(request)).resolves.toEqual([]);
  expect(getLocationHistory).toHaveBeenCalledWith({ ...request, entityId: 'person.alex' });
  await expect(
    getIntegrationLocationHistory({ ...request, entityId: 'homey:person.alex' })
  ).resolves.toBeNull();
  await expect(
    getIntegrationLocationHistory({ ...request, entityId: 'person.alex' })
  ).rejects.toThrow('owning provider');
  getLocationHistory.mockRejectedValueOnce(new Error('Recorder offline'));
  await expect(getIntegrationLocationHistory(request)).rejects.toThrow('Recorder offline');
});
it('suppresses a late cancelled history response', async () => {
  const controller = new AbortController();
  getLocationHistory.mockImplementationOnce(async () => {
    controller.abort();
    return [];
  });
  await expect(
    getIntegrationLocationHistory({ ...request, signal: controller.signal })
  ).rejects.toThrow();
});
