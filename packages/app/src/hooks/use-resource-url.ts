import { resolveResourceUrl } from '@navet/app/services/integration-resource.service';
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
    const sources = JSON.parse(urlsKey) as string[];
    void Promise.all(
      sources.map(async (url) => {
        try {
          return [url, await resolveResourceUrl(url, providerId)] as const;
        } catch {
          return [url, null] as const;
        }
      })
    ).then((entries) => {
      if (!cancelled) {
        setResolved({
          key,
          urls: new Map(
            entries.filter((entry): entry is readonly [string, string] => entry[1] !== null)
          ),
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [key, providerId, urlsKey]);

  return resolved?.key === key ? resolved.urls : EMPTY_URLS;
}

export function useResourceUrl(url: string | null | undefined, providerId?: IntegrationProviderId) {
  return useResourceUrls([url], providerId).get(url ?? '') ?? null;
}
