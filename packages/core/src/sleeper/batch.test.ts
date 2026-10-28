import { describe, expect, it } from 'vitest';
import { partitionSettled, settleAll } from './batch';

describe('settleAll', () => {
  it('returns one entry per key, in the order the keys were given', async () => {
    const entries = await settleAll([3, 1, 2], (week) => Promise.resolve(`week ${week}`));

    expect(entries.map((entry) => entry.key)).toEqual([3, 1, 2]);
    expect(entries.map((entry) => (entry.result.ok ? entry.result.value : null))).toEqual([
      'week 3',
      'week 1',
      'week 2',
    ]);
  });

  it('returns an empty list for no keys without calling the task', async () => {
    let called = 0;
    const entries = await settleAll([], () => {
      called++;
      return Promise.resolve(1);
    });

    expect(entries).toEqual([]);
    expect(called).toBe(0);
  });

  // Sleeper asks callers to stay in the dozens of requests per run; an
  // unbounded Promise.all over 18 weeks is how you get rate-limited.
  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const release: Array<() => void> = [];

    const pending = settleAll(
      [1, 2, 3, 4, 5, 6, 7],
      () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        return new Promise<number>((resolve) => {
          release.push(() => {
            inFlight--;
            resolve(1);
          });
        });
      },
      { concurrency: 2 },
    );

    // Drain by repeatedly releasing whatever has started.
    while (release.length > 0) {
      release.shift()?.();
      await Promise.resolve();
      await Promise.resolve();
    }

    await pending;
    expect(peak).toBe(2);
  });

  it('runs tasks concurrently up to the limit', async () => {
    let inFlight = 0;
    let peak = 0;

    await settleAll(
      [1, 2, 3, 4],
      async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await Promise.resolve();
        inFlight--;
        return 1;
      },
      { concurrency: 4 },
    );

    expect(peak).toBeGreaterThan(1);
  });

  // Partial success is the design.
  it('isolates a failure to its own key', async () => {
    const entries = await settleAll([1, 2, 3], (week) =>
      week === 2 ? Promise.reject(new Error('week 2 is down')) : Promise.resolve(week),
    );

    expect(entries[0]?.result).toEqual({ ok: true, value: 1 });
    expect(entries[2]?.result).toEqual({ ok: true, value: 3 });
    expect(entries[1]?.result.ok).toBe(false);
    if (entries[1]?.result.ok === false) {
      expect(entries[1].result.error.message).toBe('week 2 is down');
    }
  });

  it('wraps a thrown non-Error so callers always get an Error to log', async () => {
    const entries = await settleAll([1], () => Promise.reject('just a string'));

    const result = entries[0]?.result;
    expect(result?.ok).toBe(false);
    if (result?.ok === false) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toContain('just a string');
    }
  });

  it('isolates a task that throws synchronously', async () => {
    const entries = await settleAll([1, 2], (week) => {
      if (week === 1) throw new Error('sync boom');
      return Promise.resolve(week);
    });

    expect(entries[0]?.result.ok).toBe(false);
    expect(entries[1]?.result.ok).toBe(true);
  });
});

describe('partitionSettled', () => {
  it('splits the entries into what landed and what to record as an error', async () => {
    const entries = await settleAll([1, 2, 3], (week) =>
      week === 2 ? Promise.reject(new Error('nope')) : Promise.resolve(week * 10),
    );

    const { ok, failed } = partitionSettled(entries);

    expect(ok).toEqual([
      { key: 1, value: 10 },
      { key: 3, value: 30 },
    ]);
    expect(failed).toHaveLength(1);
    expect(failed[0]?.key).toBe(2);
    expect(failed[0]?.error.message).toBe('nope');
  });

  it('reports both sides as empty for no entries', () => {
    expect(partitionSettled([])).toEqual({ ok: [], failed: [] });
  });
});
