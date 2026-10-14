import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOwnedResourceUrls, useResourceUrl, useResourceUrls } from './use-resource-url';

const { resolveUrl } = vi.hoisted(() => ({ resolveUrl: vi.fn() }));
vi.mock('@navet/app/services/integration-resource.service', () => ({
  resolveDisplayResource: async (...args: unknown[]) => ({
    id: 'image',
    kind: 'image',
    cacheKey: 'image',
    authStrategy: 'none',
    url: await resolveUrl(...args),
  }),
}));

describe('provider display URLs', () => {
  beforeEach(() => {
    resolveUrl.mockReset();
  });

  it('waits for the user-scoped URL and hides stale results when the source changes', async () => {
    const pending = new Map<string, (url: string) => void>();
    resolveUrl.mockImplementation(
      (url: string) => new Promise<string>((resolve) => pending.set(url, resolve))
    );
    const { result, rerender } = renderHook(({ url }) => useResourceUrl(url, 'home_assistant'), {
      initialProps: { url: '/api/camera_proxy/camera.front' },
    });
    expect(result.current).toBeNull();
    await waitFor(() =>
      expect(resolveUrl).toHaveBeenCalledWith('/api/camera_proxy/camera.front', 'home_assistant')
    );
    rerender({ url: '/api/camera_proxy/camera.back' });
    await waitFor(() =>
      expect(resolveUrl).toHaveBeenCalledWith('/api/camera_proxy/camera.back', 'home_assistant')
    );
    await act(async () =>
      pending.get('/api/camera_proxy/camera.front')?.('/api/camera_proxy/camera.front?authSig=old')
    );
    expect(result.current).toBeNull();
    await act(async () =>
      pending.get('/api/camera_proxy/camera.back')?.(
        '/api/camera_proxy/camera.back?authSig=current'
      )
    );
    expect(result.current).toBe('/api/camera_proxy/camera.back?authSig=current');
    expect(resolveUrl).toHaveBeenCalledWith('/api/camera_proxy/camera.back', 'home_assistant');
  });

  it('deduplicates visible thumbnails and keeps failed URLs unavailable', async () => {
    resolveUrl.mockImplementation(async (url: string) => {
      if (url === '/denied') throw new Error('unauthorized');
      return `${url}?authSig=current`;
    });
    const { result } = renderHook(() =>
      useResourceUrls(['/art', '/art', '/denied', null], 'home_assistant')
    );
    await waitFor(() => expect(result.current.get('/art')).toBe('/art?authSig=current'));
    expect(result.current.has('/denied')).toBe(false);
    expect(resolveUrl).toHaveBeenCalledTimes(2);
  });
  it('keeps identical paths isolated by provider and removes old ownership results', async () => {
    resolveUrl.mockImplementation(async (url: string, provider: string) => `${provider}:${url}`);
    const { result, rerender } = renderHook(
      ({ provider }) =>
        useOwnedResourceUrls([
          { id: 'first', url: '/art', providerId: provider },
          { id: 'second', url: '/art', providerId: 'openhab' },
        ]),
      { initialProps: { provider: 'home_assistant' as 'home_assistant' | 'homey' } }
    );
    await waitFor(() => expect(result.current.get('first')).toBe('home_assistant:/art'));
    expect(result.current.get('second')).toBe('openhab:/art');
    rerender({ provider: 'homey' });
    expect(result.current.size).toBe(0);
    await waitFor(() => expect(result.current.get('first')).toBe('homey:/art'));
    expect(result.current.get('second')).toBe('openhab:/art');
  });
});
