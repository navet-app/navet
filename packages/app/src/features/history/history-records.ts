import {
  getIntegrationActivity,
  getIntegrationEntityHistories,
} from '@navet/app/services/integration-history.service';
import type { PlatformActivityEntry } from '@navet/core/provider-feature-models';

export const HISTORY_RECORD_LIMIT = 1000;
const FETCH_LIMIT = HISTORY_RECORD_LIMIT + 1;
const HISTORY_WINDOW_MS = 60 * 60 * 1000;

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
  context?: PlatformActivityEntry['context'];
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
  const start = Date.parse(query.startTime);
  const end = Date.parse(query.endTime);
  const records: HistoryRecord[] = [];
  const trim = () => {
    records.sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
    records.length = Math.min(records.length, FETCH_LIMIT);
  };
  const append = (record: HistoryRecord) => {
    records.push(record);
    // Bound allocations and sorting even when a source returns a dense or unordered window.
    if (records.length >= FETCH_LIMIT * 2) trim();
  };

  for (let windowEnd = end; windowEnd > start; ) {
    signal.throwIfAborted();
    const windowStart = Math.max(start, windowEnd - HISTORY_WINDOW_MS);
    const range = {
      entityIds: [query.entityId],
      // Overlap by one millisecond so strict provider endpoints retain boundary changes.
      startTime: new Date(windowStart === start ? start : windowStart - 1).toISOString(),
      endTime: new Date(windowEnd).toISOString(),
      signal,
    };
    if (query.mode === 'activity') {
      const entries = await getIntegrationActivity(range);
      signal.throwIfAborted();
      if (entries === null) return null;
      for (const entry of entries) {
        const timestamp = Date.parse(entry.timestamp);
        if (!Number.isFinite(timestamp) || timestamp < windowStart || timestamp >= windowEnd)
          continue;
        append({
          timestamp: entry.timestamp,
          value: entry.message ?? entry.state ?? '',
          name: entry.name,
          context: entry.context,
        });
      }
    } else {
      const series = await getIntegrationEntityHistories(
        { ...range, significantChangesOnly: false, includeAttributes: false },
        { requireComplete: true }
      );
      signal.throwIfAborted();
      const selected = series.find((entry) => entry.entityId === query.entityId);
      if (!selected) return null;
      for (const point of selected.points) {
        const timestamp = Date.parse(point.changedAt);
        if (!Number.isFinite(timestamp) || timestamp >= windowEnd) continue;
        // Intermediate windows carry snapshots, not additional state changes.
        if (windowStart > start && (point.atStart || timestamp < windowStart)) continue;
        append({
          timestamp: point.changedAt,
          value: point.state,
          atStart: point.atStart === true || timestamp < start,
        });
      }
    }
    trim();
    if (records.length >= FETCH_LIMIT) break;
    windowEnd = windowStart;
  }
  return records;
}
