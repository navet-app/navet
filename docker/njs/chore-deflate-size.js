// RFC 1951 size preflight for NJS, whose native inflater has no output limit.
// Count literals and back-references without allocating the expanded payload.
const LENGTH_BASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
const LENGTH_BITS = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
const DISTANCE_BASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
const DISTANCE_BITS = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
const CODE_ORDER = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];

function invalid() { throw new Error('Chore compressed storage is corrupt'); }

function huffman(lengths) {
  const counts = new Array(16).fill(0);
  const first = new Array(16).fill(0);
  const offsets = new Array(16).fill(0);
  const symbols = [];
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index];
    if (length < 0 || length > 15) invalid();
    if (length) counts[length]++;
  }
  let code = 0;
  let remaining = 1;
  for (let length = 1; length <= 15; length++) {
    remaining = remaining * 2 - counts[length];
    if (remaining < 0) invalid();
    code = (code + counts[length - 1]) * 2;
    first[length] = code;
    offsets[length] = symbols.length;
    for (let symbol = 0; symbol < lengths.length; symbol++) {
      if (lengths[symbol] === length) symbols.push(symbol);
    }
  }
  return { counts, first, offsets, symbols };
}

function assertDeflateSize(input, expectedBytes) {
  if (input.length < 6 || (input[0] & 15) !== 8 || (input[0] >>> 4) > 7 ||
      (input[1] & 32) || ((input[0] << 8) + input[1]) % 31) invalid();
  let position = 16;
  const end = (input.length - 4) * 8; // Exclude the zlib Adler-32 trailer.
  let output = 0;
  function bits(count) {
    if (position + count > end) invalid();
    let value = 0;
    for (let index = 0; index < count; index++, position++)
      value |= ((input[position >>> 3] >>> (position & 7)) & 1) << index;
    return value;
  }
  function symbol(table) {
    let code = 0;
    for (let length = 1; length <= 15; length++) {
      code = code * 2 + bits(1);
      const offset = code - table.first[length];
      if (offset >= 0 && offset < table.counts[length])
        return table.symbols[table.offsets[length] + offset];
    }
    invalid();
  }
  function add(count) {
    output += count;
    if (output > expectedBytes) throw new Error('Chore compressed storage exceeds expanded size');
  }
  let final;
  do {
    final = bits(1);
    const type = bits(2);
    if (type === 0) {
      position = Math.ceil(position / 8) * 8;
      const length = bits(16);
      if ((length ^ bits(16)) !== 65535) invalid();
      add(length);
      position += length * 8;
      if (position > end) invalid();
      continue;
    }
    if (type === 3) invalid();
    let literalLengths;
    let distanceLengths;
    if (type === 1) {
      literalLengths = [];
      for (let index = 0; index < 288; index++)
        literalLengths.push(index < 144 ? 8 : index < 256 ? 9 : index < 280 ? 7 : 8);
      distanceLengths = new Array(32).fill(5);
    } else {
      const literalCount = bits(5) + 257;
      const distanceCount = bits(5) + 1;
      const codeCount = bits(4) + 4;
      if (literalCount > 286) invalid();
      const codeLengths = new Array(19).fill(0);
      for (let index = 0; index < codeCount; index++) codeLengths[CODE_ORDER[index]] = bits(3);
      const codes = huffman(codeLengths);
      const lengths = [];
      while (lengths.length < literalCount + distanceCount) {
        const value = symbol(codes);
        if (value < 16) lengths.push(value);
        else {
          if (value === 16 && !lengths.length) invalid();
          const count = value === 16 ? bits(2) + 3 : value === 17 ? bits(3) + 3 : bits(7) + 11;
          const repeated = value === 16 ? lengths[lengths.length - 1] : 0;
          if (lengths.length + count > literalCount + distanceCount) invalid();
          for (let index = 0; index < count; index++) lengths.push(repeated);
        }
      }
      literalLengths = lengths.slice(0, literalCount);
      distanceLengths = lengths.slice(literalCount);
    }
    if (!literalLengths[256]) invalid();
    const literals = huffman(literalLengths);
    const distances = huffman(distanceLengths);
    while (true) {
      const value = symbol(literals);
      if (value === 256) break;
      if (value < 256) add(1);
      else {
        if (value > 285) invalid();
        const length = LENGTH_BASE[value - 257] + bits(LENGTH_BITS[value - 257]);
        const distanceCode = symbol(distances);
        if (distanceCode > 29) invalid();
        const distance = DISTANCE_BASE[distanceCode] + bits(DISTANCE_BITS[distanceCode]);
        if (distance > output) invalid();
        add(length);
      }
    }
  } while (!final);
  if (output !== expectedBytes || Math.ceil(position / 8) !== input.length - 4) invalid();
}

export default assertDeflateSize;
