import type { IntegrationProviderId } from '@navet/app/types/provider';
import { useEffect, useState } from 'react';

const EMPTY_URLS = new Map<string, string>();

export function useResourceUrls(
  urls: readonly (string | null | undefined)[],
  providerId?: IntegrationProviderId
) {
  const urlsKey = JSON.stringify([...new Set(urls.filter((url): url is string => Boolean(url)))]);
  const key = `${providerId ?? ''}:${urlsKey}`;
  const [resolved, setResolved] = useState<{ key: string; urls: Map<string, string> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResolved(null);
    if (urlsKey === '[]') return;
    let stop: (() => void) | undefined;
    void import('@navet/app/services/resource-url-observer').then(({ observeResourceUrls }) => {
      if (cancelled) return;
      stop = observeResourceUrls(JSON.parse(urlsKey) as string[], providerId, (urls) => {
        if (!cancelled) setResolved({ key, urls });
      });
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [key, providerId, urlsKey]);

  return resolved?.key === key ? resolved.urls : EMPTY_URLS;
}

export function useResourceUrl(url: string | null | undefined, providerId?: IntegrationProviderId) {
  return useResourceUrls([url], providerId).get(url ?? '') ?? null;
}
