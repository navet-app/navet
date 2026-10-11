const ENERGY_STATISTICS_CACHE_MAX_SIZE = 80;

type EnergyStatisticsCacheEntry<T> = {
  value: T;
  createdAt: number;
  lastAccessedAt: number;
};

const cache = new Map<string, EnergyStatisticsCacheEntry<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();

function evictCacheIfNeeded() {
  if (cache.size <= ENERGY_STATISTICS_CACHE_MAX_SIZE) {
    return;
  }

  const entries = Array.from(cache.entries()).sort(
    (left, right) => left[1].lastAccessedAt - right[1].lastAccessedAt
  );
  const removeCount = Math.max(1, Math.floor(ENERGY_STATISTICS_CACHE_MAX_SIZE * 0.2));

  for (let index = 0; index < removeCount; index += 1) {
    const entry = entries[index];
    if (entry) {
      cache.delete(entry[0]);
    }
  }
}

export async function getCachedEnergyStatistics<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cachedEntry = cache.get(key);
  const now = Date.now();
  if (cachedEntry && now - cachedEntry.createdAt <= ttlMs) {
    cachedEntry.lastAccessedAt = now;
    cache.set(key, cachedEntry);
    return cachedEntry.value as T;
  }

  const existingRequest = inFlightRequests.get(key) as Promise<T> | undefined;
  if (existingRequest) {
    return existingRequest;
  }

  const request = fetcher()
    .then((value) => {
      evictCacheIfNeeded();
      cache.set(key, {
        value,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
      });
      return value;
    })
    .finally(() => {
      if (inFlightRequests.get(key) === request) {
        inFlightRequests.delete(key);
      }
    });

  inFlightRequests.set(key, request);

  return request;
}

export function clearEnergyStatisticsCache() {
  cache.clear();
  inFlightRequests.clear();
}
