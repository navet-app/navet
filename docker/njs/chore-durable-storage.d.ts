export interface PointHistory {
  version: 1;
  count: number;
  pages: { key: string; count: number; identity: string | null }[];
}

declare const storage: {
  splitRecentPoints<T>(records: readonly T[]): { archived: T[]; recent: T[] };
  validPointHistory(value: unknown): value is PointHistory;
  validatePointHistory(history: PointHistory, hash: (value: string) => string,
    readChunk: (key: string) => unknown, identity: (key: string) => string | null): PointHistory;
  appendPointHistory(history: PointHistory | undefined, additions: readonly unknown[],
    hash: (value: string) => string, readChunk: (key: string) => unknown,
    writeChunk: (key: string, chunk: unknown) => void, identity: (key: string) => string | null): PointHistory;
  readPointHistory<T = unknown>(history: PointHistory, after: number, limit: number,
    hash: (value: string) => string, readChunk: (key: string) => unknown): T[];
  CHUNK_BYTES: number;
  pack(value: unknown, hash: (value: string) => string): unknown;
  unpack(value: unknown, hash: (value: string) => string, maxBytes?: number): unknown;
  encode(
    document: unknown,
    maxBytes: number,
    hash: (value: string) => string,
    writeChunk: (key: string, chunk: unknown) => void,
    hasChunk?: (key: string) => boolean
  ): unknown;
  decode(
    document: unknown,
    hash: (value: string) => string,
    readChunk: (key: string) => unknown,
    verifiedChunk?: (key: string) => void
  ): unknown;
};
export default storage;
