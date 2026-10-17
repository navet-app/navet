import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTeamOperation } from './agent-team-operation.mjs';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
});
afterEach(() => vi.useRealTimers());

it('bounds stalled observations and propagates the deadline to the adapter', async () => {
  const operation = createTeamOperation({ maxRunMs: 25 });
  let observedSignal;
  try {
    const result = operation.remote((signal) => {
      observedSignal = signal;
      return new Promise(() => {});
    });
    const rejected = expect(result).rejects.toThrow('Canceled');
    await vi.advanceTimersByTimeAsync(25);
    await rejected;
    expect(observedSignal.aborted).toBe(true);
  } finally { operation.close(); }
});

it('does not start an observation after parent cancellation', async () => {
  const parent = new AbortController();
  parent.abort();
  const operation = createTeamOperation({ signal: parent.signal });
  const read = vi.fn();
  try {
    await expect(operation.remote(read)).rejects.toThrow('Expired');
    expect(read).not.toHaveBeenCalled();
  } finally { operation.close(); }
});

it('rejects synchronous cancellation even when the adapter returns success', async () => {
  const parent = new AbortController();
  const operation = createTeamOperation({ signal: parent.signal });
  try {
    await expect(operation.remote(() => {
      parent.abort();
      return 'late success';
    })).rejects.toThrow();
  } finally { operation.close(); }
});

it('discards a late result after cancellation without running subsequent work', async () => {
  const parent = new AbortController();
  const operation = createTeamOperation({ signal: parent.signal });
  let finish;
  const publish = vi.fn();
  try {
    const result = operation.remote(() => new Promise((resolve) => { finish = resolve; })).then(publish);
    const rejected = expect(result).rejects.toThrow('Canceled');
    parent.abort();
    await rejected;
    finish('late result');
    await Promise.resolve();
    expect(publish).not.toHaveBeenCalled();
  } finally { operation.close(); }
});

it('shares the remaining deadline across observations and subprocess budgets', async () => {
  const operation = createTeamOperation({ maxRunMs: 100 });
  try {
    expect(await operation.remote(() => 'first')).toBe('first');
    vi.setSystemTime(1_075);
    expect(operation.remainingMs()).toBe(25);
    vi.setSystemTime(1_100);
    await expect(operation.remote(() => 'too late')).rejects.toThrow('Expired');
    expect(() => operation.remainingMs()).toThrow('Expired');
  } finally { operation.close(); }
});

it.each([0, 999, Number.NaN, Number.POSITIVE_INFINITY])('rejects an invalid clock reading %s', (time) => {
  const operation = createTeamOperation();
  try {
    vi.setSystemTime(Number.isFinite(time) ? time : 1_000);
    const invalid = Number.isFinite(time) ? operation : createTeamOperation({ now: () => time });
    try { expect(() => invalid.clock()).toThrow('Expired'); }
    finally { if (invalid !== operation) invalid.close(); }
  } finally { operation.close(); }
});

it('closing aborts pending reads and releases the deadline', async () => {
  const operation = createTeamOperation();
  const result = operation.remote(() => new Promise(() => {}));
  const rejected = expect(result).rejects.toThrow('Canceled');
  operation.close();
  await rejected;
  expect(vi.getTimerCount()).toBe(0);
  await expect(operation.remote(() => 'closed')).rejects.toThrow('Expired');
});
