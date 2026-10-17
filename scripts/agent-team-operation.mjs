// Bound remote observations; callers await already-started atomic store commits directly.
export function createTeamOperation({ now = Date.now, maxRunMs = 30_000, signal } = {}) {
  if (typeof now !== 'function' || !Number.isSafeInteger(maxRunMs) || maxRunMs < 1 || maxRunMs > 60_000) throw new Error('Invalid team deadline.');
  const controller = new AbortController(); const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true }); if (signal?.aborted) cancel();
  const startedAt = now(); const timer = setTimeout(cancel, maxRunMs);
  const clock = () => {
    const time = now();
    if (controller.signal.aborted || !Number.isSafeInteger(time) || !Number.isSafeInteger(startedAt) || startedAt <= 0 || time < startedAt || time - startedAt >= maxRunMs) throw new Error('Expired team operation.');
    return time;
  };
  return { signal: controller.signal, clock,
    remainingMs: () => maxRunMs - (clock() - startedAt),
    async remote(operation) {
      clock(); let rejectAbort;
      const canceled = new Promise((_, reject) => { rejectAbort = reject; });
      const onAbort = () => rejectAbort(new Error('Canceled team observation.'));
      controller.signal.addEventListener('abort', onAbort, { once: true });
      try { const result = await Promise.race([operation(controller.signal), canceled]); clock(); return result; }
      finally { controller.signal.removeEventListener('abort', onAbort); }
    },
    close() { clearTimeout(timer); signal?.removeEventListener('abort', cancel); controller.abort(); },
  };
}
