import {
  getIntegrationActivity,
  getIntegrationEntityHistories,
} from '@navet/app/services/integration-history.service';

export type HistoryMode = 'states' | 'activity';
export interface HistoryQuery {
  entityId: string;
  startTime: string;
  endTime: string;
  mode: HistoryMode;
}
export interface HistoryRecord {
  timestamp: string;
  value: string;
  name?: string;
  atStart?: boolean;
}

export function toLocalDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function historyRange(start: string, end: string) {
  const dates = [start, end].map((value) => {
    const date = new Date(value);
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ||
      Number.isNaN(date.getTime()) ||
      toLocalDateTime(date) !== value
    )
      throw new Error('range');
    return date;
  });
  const duration = dates[1].getTime() - dates[0].getTime();
  if (duration <= 0 || duration > 31 * 24 * 60 * 60 * 1000) throw new Error('range');
  return { startTime: dates[0].toISOString(), endTime: dates[1].toISOString() };
}

export async function loadHistoryRecords(
  query: HistoryQuery,
  signal: AbortSignal
): Promise<HistoryRecord[] | null> {
  if (query.mode === 'activity') {
    const entries = await getIntegrationActivity({
      entityIds: [query.entityId],
      startTime: query.startTime,
      endTime: query.endTime,
      signal,
    });
    return (
      entries?.map((entry) => ({
        timestamp: entry.timestamp,
        value: entry.message ?? entry.state ?? '',
        name: entry.name,
      })) ?? null
    );
  }
  const series = await getIntegrationEntityHistories(
    {
      entityIds: [query.entityId],
      startTime: query.startTime,
      endTime: query.endTime,
      significantChangesOnly: false,
      includeAttributes: false,
      signal,
    },
    { requireComplete: true }
  );
  const selected = series.find((entry) => entry.entityId === query.entityId);
  if (!selected) return null;
  const start = Date.parse(query.startTime);
  const end = Date.parse(query.endTime);
  return selected.points
    .filter(
      (point) => Number.isFinite(Date.parse(point.changedAt)) && Date.parse(point.changedAt) < end
    )
    .map((point) => ({
      timestamp: point.changedAt,
      value: point.state,
      atStart: Date.parse(point.changedAt) < start,
    }))
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
}
