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

export interface OwnedResourceUrl {
  id: string;
  url: string;
  providerId?: IntegrationProviderId;
}

/** Resolve equal resource paths independently for each owning provider. */
export function useOwnedResourceUrls(sources: readonly OwnedResourceUrl[]) {
  const key = JSON.stringify(sources);
  const [resolved, setResolved] = useState<{ key: string; urls: Map<string, string> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const stops: Array<() => void> = [];
    const results = new Map<string, string>();
    const groups = new Map<IntegrationProviderId | undefined, OwnedResourceUrl[]>();
    for (const source of JSON.parse(key) as OwnedResourceUrl[]) {
      const group = groups.get(source.providerId) ?? [];
      group.push(source);
      groups.set(source.providerId, group);
    }
    if (groups.size > 0) {
      void import('@navet/app/services/resource-url-observer').then(({ observeResourceUrls }) => {
        if (cancelled) return;
        for (const [providerId, group] of groups) {
          stops.push(
            observeResourceUrls([...new Set(group.map(({ url }) => url))], providerId, (urls) => {
              if (cancelled) return;
              for (const source of group) {
                const url = urls.get(source.url);
                if (url) results.set(source.id, url);
                else results.delete(source.id);
              }
              setResolved({ key, urls: new Map(results) });
            })
          );
        }
      });
    }
    return () => {
      cancelled = true;
      for (const stop of stops) stop();
    };
  }, [key]);

  return resolved?.key === key ? resolved.urls : EMPTY_URLS;
}
