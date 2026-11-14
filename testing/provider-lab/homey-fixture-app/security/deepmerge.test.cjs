const assert = require('node:assert/strict');
const { test } = require('node:test');
const merge = require('./deepmerge');

test('keeps a plain prototype when merging records with prototype metadata', () => {
  const metadata = JSON.parse('{"__proto__":{"inherited":true},"config":{"enabled":true}}');
  const result = merge.all([metadata, { config: { labels: ['navet'] } }, metadata]);

  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.deepEqual(result, { config: { enabled: true, labels: ['navet'] } });
});
