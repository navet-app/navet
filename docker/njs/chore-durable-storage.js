import zlib from 'zlib';
import assertDeflateSize from './chore-deflate-size.js';

// Storage-only framing. Public workspace and interchange documents stay hydrated.
const COLLECTIONS = [
  'occurrencesById',
  'pointTransactions',
  'progressAwards',
  'activity',
  'outbox',
  'rewardRequestsById',
];
const COMPRESSION_BYTES = 32 * 1024;
const MAX_INFLATED_BYTES = 64 * 1024 * 1024;

function pack(value, hash) {
  const serialized = JSON.stringify(value);
  return packSerialized(value, serialized, hash);
}

function packSerialized(value, serialized, hash) {
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes > MAX_INFLATED_BYTES) throw new Error('Chore expanded storage is too large');
  if (bytes < COMPRESSION_BYTES) return value;
  const compressed = {
    storageEncoding: 'deflate-v1',
    uncompressedBytes: bytes,
    checksum: hash(serialized),
    payload: zlib.deflateSync(serialized).toString('base64'),
  };
  return Buffer.byteLength(JSON.stringify(compressed), 'utf8') < bytes * 0.9 ? compressed : value;
}

function unpack(value, hash, maxBytes) {
  if (!value || !Object.prototype.hasOwnProperty.call(value, 'storageEncoding')) return value;
  if (value.storageEncoding !== 'deflate-v1' ||
      !Number.isSafeInteger(value.uncompressedBytes) || value.uncompressedBytes < 0 ||
      value.uncompressedBytes > (maxBytes || MAX_INFLATED_BYTES) ||
      typeof value.checksum !== 'string' || !/^[a-f0-9]{64}$/.test(value.checksum) ||
      typeof value.payload !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.payload)) {
    throw new Error('Chore compressed storage is invalid');
  }
  const compressed = Buffer.from(value.payload, 'base64');
  assertDeflateSize(compressed, value.uncompressedBytes);
  const inflated = zlib.inflateSync(compressed, { maxOutputLength: Math.max(1, value.uncompressedBytes) });
  if (inflated.length !== value.uncompressedBytes || hash(inflated.toString('utf8')) !== value.checksum)
    throw new Error('Chore compressed storage is corrupt');
  return JSON.parse(inflated.toString('utf8'));
}

const CHUNK_BYTES = 2 * 1024 * 1024;
const TARGET_CHUNK_BYTES = 256 * 1024;

function collectionItems(document, name) {
  return name === 'occurrencesById'
    ? Object.values(document.data.occurrencesById)
    : name === 'rewardRequestsById'
      ? Object.values(document.data.experience[name])
      : name === 'activity' || name === 'outbox'
        ? document.data[name]
        : document.data.experience[name];
}

function encodeCollection(records, name, hash, writeChunk, hasChunk) {
  const chunks = [];
  let items = [];
  let bytes = 128;
  function flush() {
    if (!items.length) return;
    const chunk = { version: 1, collection: name, items };
    const key = hash(JSON.stringify(chunk));
    // Only reuse content verified by this transaction's decoder, never mere file existence.
    if (!hasChunk || !hasChunk(key)) writeChunk(key, pack(chunk, hash), chunk.items.length);
    chunks.push(key);
    items = [];
    bytes = 128;
  }
  for (let index = 0; index < records.length; index++) {
    const item = records[index];
    const size = Buffer.byteLength(JSON.stringify(item), 'utf8') + 1;
    if (size > CHUNK_BYTES - 128) throw new Error('Chore durable record is too large');
    if (bytes + size > TARGET_CHUNK_BYTES) flush();
    items.push(item);
    bytes += size;
  }
  flush();
  return chunks;
}

function encode(document, maxBytes, hash, writeChunk, hasChunk) {
  const serialized = JSON.stringify(document);
  if (Buffer.byteLength(serialized, 'utf8') <= maxBytes)
    return packSerialized(document, serialized, hash);
  const references = { version: 1 };
  for (let collectionIndex = 0; collectionIndex < COLLECTIONS.length; collectionIndex++) {
    const name = COLLECTIONS[collectionIndex];
    references[name] = encodeCollection(collectionItems(document, name), name, hash, writeChunk, hasChunk);
  }
  return Object.assign({}, document, {
    durableCollections: references,
    data: Object.assign({}, document.data, {
      occurrencesById: {},
      activity: [],
      outbox: [],
      experience: Object.assign({}, document.data.experience, {
        pointTransactions: [],
        progressAwards: [],
        rewardRequestsById: {},
      }),
    }),
  });
}

function decode(document, hash, readChunk, verifiedChunk) {
  document = unpack(document, hash, CHUNK_BYTES);
  if (!document || !Object.prototype.hasOwnProperty.call(document, 'durableCollections'))
    return document;
  const references = document.durableCollections;
  if (!references || references.version !== 1)
    throw new Error('Chore durable storage version is invalid');
  const restored = {};
  for (let collectionIndex = 0; collectionIndex < COLLECTIONS.length; collectionIndex++) {
    const name = COLLECTIONS[collectionIndex];
    if (!Array.isArray(references[name])) throw new Error('Chore durable manifest is invalid');
    const items = [];
    for (let referenceIndex = 0; referenceIndex < references[name].length; referenceIndex++) {
      const key = references[name][referenceIndex];
      if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key))
        throw new Error('Chore durable reference is invalid');
      const chunk = unpack(readChunk(key), hash, CHUNK_BYTES);
      if (
        !chunk ||
        chunk.version !== 1 ||
        chunk.collection !== name ||
        !Array.isArray(chunk.items) ||
        hash(JSON.stringify(chunk)) !== key
      ) {
        throw new Error('Chore durable chunk is missing or corrupt');
      }
      if (verifiedChunk) verifiedChunk(key);
      for (let index = 0; index < chunk.items.length; index++) items.push(chunk.items[index]);
    }
    restored[name] = items;
  }
  const occurrences = {};
  for (let index = 0; index < restored.occurrencesById.length; index++) {
    const item = restored.occurrencesById[index];
    if (
      !item ||
      typeof item.id !== 'string' ||
      Object.prototype.hasOwnProperty.call(occurrences, item.id)
    ) {
      throw new Error('Chore durable occurrence is invalid');
    }
    Object.defineProperty(occurrences, item.id, {
      value: item,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  const requests = {};
  for (let index = 0; index < restored.rewardRequestsById.length; index++) {
    const item = restored.rewardRequestsById[index];
    if (
      !item ||
      typeof item.id !== 'string' ||
      Object.prototype.hasOwnProperty.call(requests, item.id)
    )
      throw new Error('Chore durable request is invalid');
    Object.defineProperty(requests, item.id, {
      value: item,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  const hydrated = Object.assign({}, document, {
    data: Object.assign({}, document.data, {
      occurrencesById: occurrences,
      activity: restored.activity,
      outbox: restored.outbox,
      experience: Object.assign({}, document.data.experience, {
        pointTransactions: restored.pointTransactions,
        progressAwards: restored.progressAwards,
        rewardRequestsById: requests,
      }),
    }),
  });
  delete hydrated.durableCollections;
  return hydrated;
}

// Historical accounting uses the same immutable content-addressed chunks as the
// workspace. Only the bounded tail is read/replaced when old recent rows move out.
function splitRecentPoints(records) {
  let start = records.length;
  let bytes = 2;
  while (start > 0 && records.length - start < 128) {
    const size = Buffer.byteLength(JSON.stringify(records[start - 1]), 'utf8') + 1;
    if (bytes + size > 32 * 1024) break;
    bytes += size;
    start--;
  }
  return { archived: records.slice(0, start), recent: records.slice(start) };
}

function validPointHistory(history) {
  if (!history || history.version !== 1 || !Array.isArray(history.pages) ||
      !Number.isSafeInteger(history.count) || history.count < 0) return false;
  let count = 0;
  for (let index = 0; index < history.pages.length; index++) {
    const page = history.pages[index];
    if (!page || typeof page.key !== 'string' || !/^[a-f0-9]{64}$/.test(page.key) ||
        !Number.isSafeInteger(page.count) || page.count < 1 ||
        (page.identity !== null && typeof page.identity !== 'string')) return false;
    count += page.count;
  }
  return count === history.count;
}

function readPointChunk(page, hash, readChunk) {
  const chunk = unpack(readChunk(page.key), hash, CHUNK_BYTES);
  if (!chunk || chunk.version !== 1 || chunk.collection !== 'pointHistory' ||
      !Array.isArray(chunk.items) || chunk.items.length !== page.count ||
      hash(JSON.stringify(chunk)) !== page.key) throw new Error('Chore point history is missing or corrupt');
  return chunk.items;
}

function validatePointHistory(history, hash, readChunk, identity) {
  if (!validPointHistory(history)) throw new Error('Chore point history manifest is invalid');
  let changed = false;
  const pages = [];
  for (let index = 0; index < history.pages.length; index++) {
    const page = history.pages[index];
    const current = identity(page.key);
    if (current === null || current !== page.identity) {
      readPointChunk(page, hash, readChunk);
      changed = changed || current !== page.identity;
    }
    pages.push(current === page.identity ? page : Object.assign({}, page, { identity: current }));
  }
  return changed ? Object.assign({}, history, { pages }) : history;
}

function appendPointHistory(previous, additions, hash, readChunk, writeChunk, identity) {
  const history = previous || { version: 1, count: 0, pages: [] };
  if (!validPointHistory(history)) throw new Error('Chore point history manifest is invalid');
  if (!additions.length) return history;
  const pages = history.pages.slice();
  const tail = pages.pop();
  const records = (tail ? readPointChunk(tail, hash, readChunk) : []).concat(additions);
  encodeCollection(records, 'pointHistory', hash, function (key, chunk, count) {
    writeChunk(key, chunk);
    pages.push({ key, count, identity: identity(key) });
  });
  return { version: 1, count: history.count + additions.length, pages };
}

function readPointHistory(history, after, limit, hash, readChunk) {
  if (!validPointHistory(history)) throw new Error('Chore point history manifest is invalid');
  const records = [];
  let skipped = 0;
  for (let index = 0; index < history.pages.length && records.length < limit; index++) {
    const page = history.pages[index];
    if (skipped + page.count > after) {
      const rows = readPointChunk(page, hash, readChunk);
      const start = Math.max(0, after - skipped);
      const end = Math.min(rows.length, start + limit - records.length);
      for (let row = start; row < end; row++) records.push(rows[row]);
    }
    skipped += page.count;
  }
  return records;
}

export default { encode, decode, pack, unpack, CHUNK_BYTES, splitRecentPoints, validPointHistory, validatePointHistory, appendPointHistory, readPointHistory };
