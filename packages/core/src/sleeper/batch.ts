// Concurrency-limited batching that never throws.
//
// The Apps Script version this replaced fetched up to 30 URLs at once and threw
// on the first non-200, which aborted the whole refresh. The
// replacement runs a bounded number of requests at a time and reports each one
// separately, so week 3 still lands when week 4 is briefly unavailable and the
// failure can be written to `ingest_runs.errors` instead of being lost.

/** One task's outcome. Never a rejected promise; the error is a value. */
export type Settled<T> = { ok: true; value: T } | { ok: false; error: Error };

export interface SettledEntry<K, T> {
  key: K;
  result: Settled<T>;
}

export interface SettleOptions {
  /**
   * Requests in flight at once. Sleeper asks callers to stay modest and a run
   * is only a few dozen calls, so there is nothing to gain from going wide.
   */
  concurrency?: number;
}

export const DEFAULT_CONCURRENCY = 6;

function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

/**
 * Run `task` for every key, at most `concurrency` at a time, and return one
 * entry per key in the order the keys were given.
 *
 * Order is by key rather than by completion so a caller can line results up
 * with what it asked for. A task that throws — synchronously or not — fails
 * only its own key.
 */
export async function settleAll<K, T>(
  keys: readonly K[],
  task: (key: K) => Promise<T>,
  options: SettleOptions = {},
): Promise<Array<SettledEntry<K, T>>> {
  const limit = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const entries = new Array<SettledEntry<K, T>>(keys.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next++;
      if (index >= keys.length) return;
      const key = keys[index] as K;

      try {
        entries[index] = { key, result: { ok: true, value: await task(key) } };
      } catch (cause) {
        entries[index] = { key, result: { ok: false, error: toError(cause) } };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, keys.length) }, worker));
  return entries;
}

/**
 * Split settled entries into the values to use and the failures to log.
 * `ingest_runs` records both: `status: 'partial'` is a real outcome.
 */
export function partitionSettled<K, T>(
  entries: ReadonlyArray<SettledEntry<K, T>>,
): {
  ok: Array<{ key: K; value: T }>;
  failed: Array<{ key: K; error: Error }>;
} {
  const ok: Array<{ key: K; value: T }> = [];
  const failed: Array<{ key: K; error: Error }> = [];

  for (const entry of entries) {
    if (entry.result.ok) ok.push({ key: entry.key, value: entry.result.value });
    else failed.push({ key: entry.key, error: entry.result.error });
  }

  return { ok, failed };
}
