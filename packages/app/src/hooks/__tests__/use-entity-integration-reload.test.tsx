import * as contracts from '@navet/app/provider-contract-registry';
import { integrationAdminService } from '@navet/app/services/integration-admin.service';
import { integrationStore } from '@navet/app/stores/integration-store';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEntityIntegrationReload } from '../use-entity-integration-reload';

// Keep: administrative availability must update even when normalized dashboard data stays equal.
describe('integration reload availability subscriptions', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    vi.spyOn(integrationAdminService, 'subscribeEntityIntegrationReload').mockReturnValue(() => {});
  });

  it('updates and unsubscribes when live reload support changes', () => {
    let available = false;
    let notify = () => {};
    const unsubscribe = vi.fn();
    vi.mocked(integrationAdminService.subscribeEntityIntegrationReload).mockImplementation(
      (_entityId, listener) => {
        notify = listener;
        return unsubscribe;
      }
    );
    vi.spyOn(integrationAdminService, 'canReloadEntityIntegration').mockImplementation(
      () => available
    );
    const { result, unmount } = renderHook(() =>
      useEntityIntegrationReload('home_assistant:light.kitchen')
    );
    expect(result.current.available).toBe(false);
    act(() => {
      available = true;
      notify();
    });
    expect(result.current.available).toBe(true);
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it.each(['hubitat', 'smartthings'])(
    'renders unavailable recovery for catalog-only %s',
    (providerId) => {
      const { result } = renderHook(() => useEntityIntegrationReload(`${providerId}:lamp`));
      expect(result.current.available).toBe(false);
    }
  );

  it('reacts to provider-only permission and registry updates without a merged dashboard update', () => {
    let available = false;
    const listeners = new Set<() => void>();
    const contract = contracts.getRegisteredProviderContract('home_assistant');
    vi.spyOn(contracts, 'getRegisteredProviderContract').mockReturnValue({
      ...contract,
      subscribeState: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    });
    vi.spyOn(integrationAdminService, 'canReloadEntityIntegration').mockImplementation(
      () => available
    );
    const dashboardState = integrationStore.getState();
    const { result, unmount } = renderHook(() =>
      useEntityIntegrationReload('home_assistant:light.bed_light')
    );
    expect(result.current.available).toBe(false);
    act(() => {
      available = true;
      for (const listener of listeners) listener();
    });
    expect(integrationStore.getState()).toBe(dashboardState);
    expect(result.current.available).toBe(true);
    act(() => {
      available = false;
      for (const listener of listeners) listener();
    });
    expect(result.current.available).toBe(false);
    unmount();
    expect(listeners.size).toBe(0);
  });

  it('subscribes to the scoped entity owner when another provider is selected', () => {
    integrationStore.getState().setCurrentProviderId('homey');
    const contract = contracts.getRegisteredProviderContract('home_assistant');
    const unsubscribe = vi.fn();
    const lookup = vi.spyOn(contracts, 'getRegisteredProviderContract').mockReturnValue({
      ...contract,
      subscribeState: () => unsubscribe,
    });
    vi.spyOn(integrationAdminService, 'canReloadEntityIntegration').mockReturnValue(false);
    const { unmount } = renderHook(() =>
      useEntityIntegrationReload('home_assistant:light.bed_light')
    );
    expect(lookup).toHaveBeenCalledWith('home_assistant');
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
