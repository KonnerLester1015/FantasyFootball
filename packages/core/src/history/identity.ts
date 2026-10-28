/**
 * Who a roster's history belongs to — docs/REBUILD_PLAN.md §2h.
 *
 * The Sleeper **user ID**, not the roster slot: a manager who moves slots
 * between seasons keeps one career, and a different account taking a slot
 * starts new totals. An unowned roster has no account, so it gets an identity
 * scoped to its league and slot — it can never merge into another season's
 * unowned roster, or into a real manager. Legacy rule, from
 * reference/legacy/FamilyFeud_Redraft.gs:644.
 *
 * Every career and record-book row keys on this one function.
 */
export function historyIdentity(
  leagueId: string,
  rosterId: number,
  ownerId: string | null | undefined,
): string {
  return ownerId ? ownerId : `unowned:${leagueId}:${rosterId}`;
}
