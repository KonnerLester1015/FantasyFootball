/**
 * A Sleeper payload that cannot be turned into a valid row.
 *
 * Thrown rather than patched over, because the alternative is publishing a
 * fabricated number. The ingest function catches these per endpoint, records
 * them in `ingest_runs.errors`, and finishes with `status: 'partial'` — one bad
 * payload costs one table, not the whole run.
 */
export class NormalizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NormalizeError';
  }
}
