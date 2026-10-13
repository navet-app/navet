import zlib from 'zlib';

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
  const inflated = zlib.inflateSync(Buffer.from(value.payload, 'base64'));
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

function encodeCollection(records, name, hash, writeChunk) {
  const chunks = [];
  let items = [];
  let bytes = 128;
  function flush() {
    if (!items.length) return;
    const chunk = { version: 1, collection: name, items };
    const key = hash(JSON.stringify(chunk));
    writeChunk(key, pack(chunk, hash));
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

function encode(document, maxBytes, hash, writeChunk) {
  if (Buffer.byteLength(JSON.stringify(document), 'utf8') <= maxBytes) return pack(document, hash);
  const references = { version: 1 };
  for (let collectionIndex = 0; collectionIndex < COLLECTIONS.length; collectionIndex++) {
    const name = COLLECTIONS[collectionIndex];
    references[name] = encodeCollection(collectionItems(document, name), name, hash, writeChunk);
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

function decode(document, hash, readChunk) {
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

export default { encode, decode, pack, unpack, CHUNK_BYTES };
