import type { TransactionRow } from '../normalize/transactions';

/**
 * Completed add-transactions per manager — docs/REBUILD_PLAN.md §2e.
 *
 * A transaction counts once for each roster that gained at least one player in it,
 * however many players it added: three players claimed in one waiver run is one
 * move. Failed claims are excluded; they moved nothing. Rosters with no adds get a
 * real 0, because the transaction list is complete for the weeks handed in.
 */
export interface ActivityRow {
  roster_id: number;
  add_transactions: number;
}

export function activityCounts(
  transactions: readonly TransactionRow[],
  rosterIds: readonly number[],
): ActivityRow[] {
  const seen = new Map<number, Set<string>>(rosterIds.map((id) => [id, new Set<string>()]));

  for (const tx of transactions) {
    if (tx.status !== 'complete' || tx.adds === null) continue;
    const adds = JSON.parse(tx.adds) as Record<string, number>;
    for (const rosterId of new Set(Object.values(adds))) {
      const bucket = seen.get(rosterId) ?? new Set<string>();
      bucket.add(tx.transaction_id);
      seen.set(rosterId, bucket);
    }
  }

  return [...seen.entries()]
    .sort(([a], [b]) => a - b)
    .map(([roster_id, ids]) => ({ roster_id, add_transactions: ids.size }));
}
