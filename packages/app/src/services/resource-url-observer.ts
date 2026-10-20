import type { ResolvedPlatformResource } from '@navet/app/platform/resources';
import { integrationStore } from '@navet/app/stores/integration-store';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import { resolveDisplayResource } from './integration-resource.service';

const RENEW_BEFORE_EXPIRY_MS = 5000;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30_000;

export function observeResourceUrls(
  sources: readonly string[],
  providerId: IntegrationProviderId | undefined,
  onChange: (urls: Map<string, string>) => void
) {
  const resources = new Map<string, ResolvedPlatformResource>();
  const failures = new Map<string, { attempts: number; retryAt: number }>();
  let stopped = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function publish() {
    const urls = new Map<string, string>();
    for (const [source, resource] of resources) {
      if (resource.url && (resource.expiresAt === undefined || resource.expiresAt > Date.now())) {
        urls.set(source, resource.url);
      }
    }
    onChange(urls);
  }

  function renew() {
    const due = sources.filter((source) => {
      const failure = failures.get(source);
      if (failure) return failure.retryAt <= Date.now();
      const expiry = resources.get(source)?.expiresAt;
      return expiry !== undefined && expiry <= Date.now() + RENEW_BEFORE_EXPIRY_MS;
    });
    publish();
    if (due.length) void resolve(due);
  }

  async function resolve(requested: readonly string[]) {
    const requestGeneration = ++generation;
    clearTimeout(timer);
    const entries = await Promise.all(
      requested.map(async (source) => {
        try {
          return [source, await resolveDisplayResource(source, providerId)] as const;
        } catch {
          return [source, null] as const;
        }
      })
    );
    if (stopped || requestGeneration !== generation) return;
    for (const [source, resource] of entries) {
      if (resource?.url) {
        resources.set(source, resource);
        failures.delete(source);
      } else {
        resources.delete(source);
        const attempts = (failures.get(source)?.attempts ?? 0) + 1;
        failures.set(source, {
          attempts,
          retryAt:
            Date.now() + Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(attempts - 1, 5)),
        });
      }
    }
    publish();
    const deadlines = sources.flatMap((source) => {
      const failure = failures.get(source);
      if (failure) return [failure.retryAt];
      const expiry = resources.get(source)?.expiresAt;
      return expiry === undefined ? [] : [expiry - RENEW_BEFORE_EXPIRY_MS];
    });
    if (deadlines.length) {
      timer = setTimeout(renew, Math.max(1000, Math.min(...deadlines) - Date.now()));
    }
  }

  function connectionKey() {
    const state = integrationStore.getState();
    const owner = providerId ?? state.currentProviderId;
    return `${owner}:${state.providerHealth[owner].connected}`;
  }

  let lastConnection = connectionKey();
  const unsubscribe = integrationStore.subscribe(() => {
    const nextConnection = connectionKey();
    if (nextConnection !== lastConnection) {
      lastConnection = nextConnection;
      resources.clear();
      failures.clear();
      publish();
      void resolve(sources);
    }
  });
  const onVisibilityChange = () => {
    if (!document.hidden) renew();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  void resolve(sources);

  return () => {
    stopped = true;
    generation += 1;
    clearTimeout(timer);
    unsubscribe();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
