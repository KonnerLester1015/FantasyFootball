/**
 * Who a record-book holder is — docs/REBUILD_PLAN.md §2f.
 *
 * The Sleeper **user ID** when the roster has an owner. An unowned roster has
 * no account, so it gets an identity scoped to its league and slot, which can
 * never collide with a real manager. Legacy rule, from
 * reference/legacy/Redraft.gs:644.
 *
 * Every record-book row keys on this one function.
 */
export function historyIdentity(
  leagueId: string,
  rosterId: number,
  ownerId: string | null | undefined,
): string {
  return ownerId ? ownerId : `unowned:${leagueId}:${rosterId}`;
}
