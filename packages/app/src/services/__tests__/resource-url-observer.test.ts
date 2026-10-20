import { integrationStore } from '@navet/app/stores/integration-store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeResourceUrls } from '../resource-url-observer';

const { resolveDisplayResource } = vi.hoisted(() => ({ resolveDisplayResource: vi.fn() }));
vi.mock('../integration-resource.service', () => ({ resolveDisplayResource }));

function image(url?: string, expiresAt?: number) {
  return { id: 'image', kind: 'image', cacheKey: 'image', authStrategy: 'none', url, expiresAt };
}

function connected(value: boolean) {
  const state = integrationStore.getState();
  integrationStore.setState({
    providerHealth: {
      ...state.providerHealth,
      home_assistant: { ...state.providerHealth.home_assistant, connected: value },
    },
  });
}

describe('display resource lifetime', () => {
  let stop: (() => void) | undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    resolveDisplayResource.mockReset();
    connected(false);
  });
  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries unavailable images when their provider connection becomes ready', async () => {
    resolveDisplayResource
      .mockResolvedValueOnce(image())
      .mockResolvedValueOnce(image('/api/image?authSig=ready', 30_000));
    const changes = vi.fn();
    stop = observeResourceUrls(['/api/image'], 'home_assistant', changes);
    await vi.advanceTimersByTimeAsync(0);
    expect(changes).toHaveBeenLastCalledWith(new Map());
    connected(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(resolveDisplayResource).toHaveBeenCalledTimes(2);
    expect(changes).toHaveBeenLastCalledWith(new Map([['/api/image', '/api/image?authSig=ready']]));
  });

  it.each(['rejection', 'unavailable'])(
    'recovers from a transient %s without a connection change',
    async (failure) => {
      connected(true);
      if (failure === 'rejection')
        resolveDisplayResource.mockRejectedValueOnce(new Error('Temporary failure'));
      else resolveDisplayResource.mockResolvedValueOnce(image());
      resolveDisplayResource.mockResolvedValue(image('/api/image?authSig=recovered', 31_000));
      const changes = vi.fn();
      stop = observeResourceUrls(['/api/image'], 'home_assistant', changes);
      await vi.advanceTimersByTimeAsync(999);
      expect(changes).toHaveBeenLastCalledWith(new Map());
      expect(resolveDisplayResource).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(changes).toHaveBeenLastCalledWith(
        new Map([['/api/image', '/api/image?authSig=recovered']])
      );
      expect(resolveDisplayResource).toHaveBeenCalledTimes(2);
    }
  );

  it('backs off persistent failures and cancels retries on cleanup', async () => {
    resolveDisplayResource.mockResolvedValue(image());
    stop = observeResourceUrls(['/api/image'], 'home_assistant', vi.fn());
    await vi.advanceTimersByTimeAsync(31_000);
    expect(resolveDisplayResource).toHaveBeenCalledTimes(6);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(resolveDisplayResource).toHaveBeenCalledTimes(6);
    await vi.advanceTimersByTimeAsync(1);
    expect(resolveDisplayResource).toHaveBeenCalledTimes(7);
    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(resolveDisplayResource).toHaveBeenCalledTimes(7);
  });

  it('recovers from a failed renewal without refetching public images', async () => {
    let signature = 0;
    resolveDisplayResource.mockImplementation(async (source: string) => {
      if (source === '/public.png') return image(source);
      if (++signature === 2) throw new Error('Temporary failure');
      return image(`/api/image?authSig=${signature}`, Date.now() + 30_000);
    });
    const changes = vi.fn();
    stop = observeResourceUrls(['/api/image', '/public.png'], 'home_assistant', changes);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(changes).toHaveBeenLastCalledWith(new Map([['/public.png', '/public.png']]));
    await vi.advanceTimersByTimeAsync(1000);
    expect(changes).toHaveBeenLastCalledWith(
      new Map([
        ['/public.png', '/public.png'],
        ['/api/image', '/api/image?authSig=3'],
      ])
    );
    expect(
      resolveDisplayResource.mock.calls.filter(([source]) => source === '/public.png')
    ).toHaveLength(1);
  });

  it('renews signed URLs before expiry while leaving public images alone', async () => {
    let signature = 0;
    resolveDisplayResource.mockImplementation(async (source: string) =>
      source === '/public.png'
        ? image(source)
        : image(`/api/image?authSig=${++signature}`, Date.now() + 30_000)
    );
    const changes = vi.fn();
    stop = observeResourceUrls(['/api/image', '/public.png'], 'home_assistant', changes);
    await vi.advanceTimersByTimeAsync(24_999);
    expect(resolveDisplayResource).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(resolveDisplayResource).toHaveBeenCalledTimes(3);
    expect(changes).toHaveBeenLastCalledWith(
      new Map([
        ['/api/image', '/api/image?authSig=2'],
        ['/public.png', '/public.png'],
      ])
    );
    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    connected(true);
    expect(resolveDisplayResource).toHaveBeenCalledTimes(3);
  });

  it('discards expired signatures and renews them after a suspended page becomes visible', async () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    resolveDisplayResource.mockImplementation(async () =>
      image('/api/image?authSig=fresh', Date.now() + 30_000)
    );
    const changes = vi.fn();
    stop = observeResourceUrls(['/api/image'], 'home_assistant', changes);
    await vi.advanceTimersByTimeAsync(0);
    vi.setSystemTime(45_000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(changes).toHaveBeenLastCalledWith(new Map());
    await vi.advanceTimersByTimeAsync(0);
    expect(resolveDisplayResource).toHaveBeenCalledTimes(2);
    expect(changes).toHaveBeenLastCalledWith(new Map([['/api/image', '/api/image?authSig=fresh']]));
  });
});
