import type {
  PlatformActivityEntry,
  PlatformEntityHistoriesRequest,
  PlatformEntityHistoryPoint,
  PlatformEntityHistorySeries,
  PlatformStatisticsHistoryPoint,
  PlatformStatisticsHistorySeries,
} from '@navet/core/provider-feature-models';
import type { ProviderHistoryFeatureService } from '@navet/core/provider-feature-services';
import { callHomeAssistantApi, getHomeAssistantConnection } from './homeassistant-service-bridge';

interface HomeAssistantHistoryState {
  entity_id?: unknown;
  state?: unknown;
  attributes?: unknown;
  last_changed?: unknown;
  last_updated?: unknown;
}

type HomeAssistantHistoryResponse = HomeAssistantHistoryState[][];

type HomeAssistantStatisticsResponse = Record<string, unknown>;

const STATISTIC_VALUE_KEYS = ['change', 'max', 'mean', 'min', 'state', 'sum'] as const;

function parseTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    return null;
  }

  return value;
}

function validatePeriod(startTime: string, endTime: string) {
  const start = Date.parse(startTime);
  const end = Date.parse(endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new Error('Entity history requires a valid start time before the end time');
  }
}

function throwIfHistoryRequestAborted(signal?: AbortSignal) {
  if (!signal?.aborted) {
    return;
  }

  throw signal.reason ?? new DOMException('History request aborted', 'AbortError');
}

function parseEntityHistoryPoints(
  entries: HomeAssistantHistoryState[],
  includeAttributes: boolean
): PlatformEntityHistoryPoint[] {
  return entries
    .map((entry) => {
      const changedAt = parseTimestamp(entry.last_changed ?? entry.last_updated);
      if (typeof entry.state !== 'string' || !changedAt) {
        return null;
      }

      const updatedAt = parseTimestamp(entry.last_updated);
      const attributes =
        includeAttributes &&
        entry.attributes &&
        typeof entry.attributes === 'object' &&
        !Array.isArray(entry.attributes)
          ? (entry.attributes as Record<string, unknown>)
          : undefined;

      return {
        state: entry.state,
        changedAt,
        ...(updatedAt ? { updatedAt } : {}),
        ...(attributes ? { attributes } : {}),
      };
    })
    .filter((point): point is PlatformEntityHistoryPoint => point !== null);
}

async function loadEntityHistories(
  request: PlatformEntityHistoriesRequest
): Promise<PlatformEntityHistorySeries[]> {
  if (request.entityIds.length === 0) {
    return [];
  }

  throwIfHistoryRequestAborted(request.signal);
  const endTime = request.endTime ?? new Date().toISOString();
  validatePeriod(request.startTime, endTime);

  const query = new URLSearchParams({
    filter_entity_id: request.entityIds.join(','),
    end_time: endTime,
  });
  if (!request.includeAttributes) {
    query.set('minimal_response', '');
    query.set('no_attributes', '');
  }
  if (request.significantChangesOnly) {
    query.set('significant_changes_only', '');
  }

  const response = await callHomeAssistantApi<HomeAssistantHistoryResponse>(
    'GET',
    `history/period/${encodeURIComponent(request.startTime)}?${query.toString()}`
  );
  throwIfHistoryRequestAborted(request.signal);

  const entriesByEntityId = new Map<string, HomeAssistantHistoryState[]>();
  const requestedEntityIds = new Set(request.entityIds);
  for (const entries of Array.isArray(response) ? response : []) {
    if (!Array.isArray(entries)) {
      continue;
    }
    const entityId = entries.find((entry) => typeof entry.entity_id === 'string')?.entity_id;
    if (typeof entityId === 'string' && requestedEntityIds.has(entityId)) {
      entriesByEntityId.set(entityId, entries);
    }
  }

  return request.entityIds.map((entityId) => ({
    entityId,
    points: parseEntityHistoryPoints(
      entriesByEntityId.get(entityId) ?? [],
      request.includeAttributes === true
    ),
  }));
}

function parseStatisticsTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && value.trim() !== '') {
      return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseStatisticsPoint(value: unknown): PlatformStatisticsHistoryPoint | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  const startMs = parseStatisticsTimestamp(row.start);
  const endMs = parseStatisticsTimestamp(row.end);
  if (startMs === null || endMs === null || startMs >= endMs) {
    return null;
  }

  const point: PlatformStatisticsHistoryPoint = { startMs, endMs };
  for (const key of STATISTIC_VALUE_KEYS) {
    if (typeof row[key] === 'number' && Number.isFinite(row[key])) {
      point[key] = row[key];
    }
  }
  return point;
}

export const homeAssistantHistoryFeatureService: ProviderHistoryFeatureService = {
  getMessageClient: () => getHomeAssistantConnection(),
  getEntityHistories: loadEntityHistories,
  async getActivity(request) {
    throwIfHistoryRequestAborted(request.signal);
    validatePeriod(request.startTime, request.endTime);
    if (request.entityIds.length === 0) return [];
    const connection = getHomeAssistantConnection();
    if (!connection) throw new Error('Home Assistant activity requires an active connection');
    const response = await connection.sendMessagePromise<unknown>({
      type: 'logbook/get_events',
      start_time: request.startTime,
      end_time: request.endTime,
      entity_ids: request.entityIds,
    });
    throwIfHistoryRequestAborted(request.signal);
    if (!Array.isArray(response)) throw new Error('Invalid Home Assistant activity response');
    const selected = new Set(request.entityIds);
    const startMs = Date.parse(request.startTime);
    const endMs = Date.parse(request.endTime);
    return response
      .flatMap((value): PlatformActivityEntry[] => {
        if (!value || typeof value !== 'object') return [];
        const entry = value as Record<string, unknown>;
        if (
          typeof entry.entity_id !== 'string' ||
          !selected.has(entry.entity_id) ||
          typeof entry.when !== 'number' ||
          !Number.isFinite(entry.when)
        )
          return [];
        const date = new Date(entry.when * 1000);
        if (!Number.isFinite(date.getTime()) || date.getTime() < startMs || date.getTime() >= endMs)
          return [];
        return [
          {
            entityId: entry.entity_id,
            timestamp: date.toISOString(),
            ...(typeof entry.state === 'string' ? { state: entry.state } : {}),
            ...(typeof entry.name === 'string' ? { name: entry.name } : {}),
            ...(typeof entry.message === 'string' ? { message: entry.message } : {}),
          },
        ];
      })
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  },
  async getEntityHistory(request) {
    const [series] = await loadEntityHistories({
      ...request,
      entityIds: [request.entityId],
    });
    return series ?? { entityId: request.entityId, points: [] };
  },
  async getStatisticsHistory(request) {
    const endTime = request.endTime ?? new Date().toISOString();
    validatePeriod(request.startTime, endTime);
    if (request.entityIds.length === 0) {
      return {};
    }

    const connection = getHomeAssistantConnection();
    if (!connection) {
      throw new Error('Home Assistant statistics history requires an active connection');
    }

    const response = await connection.sendMessagePromise<HomeAssistantStatisticsResponse>({
      type: 'recorder/statistics_during_period',
      start_time: request.startTime,
      end_time: endTime,
      statistic_ids: request.entityIds,
      period: request.period,
      types: request.types,
      ...(request.units ? { units: request.units } : {}),
    });

    const series: PlatformStatisticsHistorySeries = {};
    for (const entityId of request.entityIds) {
      const rows = response?.[entityId];
      series[entityId] = (Array.isArray(rows) ? rows : [])
        .map(parseStatisticsPoint)
        .filter((point): point is PlatformStatisticsHistoryPoint => point !== null);
    }
    return series;
  },
  supportsStatisticsHistory: (entityId) => entityId.startsWith('sensor.'),
  supportsEnergyStatistics: (entityId) => entityId.startsWith('sensor.'),
};
