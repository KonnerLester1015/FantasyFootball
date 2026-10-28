// Per-week and per-season metrics: optimal lineup (exact DP over legal slots incl.
// FLEX/SUPER_FLEX), all-play %, schedule luck, consistency, crowns, 150/200 thresholds,
// margins, record events.
// Definitions: docs/REBUILD_PLAN.md §2a-2c, §2h.
//
// Invariants carried over from the Apps Script version:
//   - a player occupies at most one optimal slot
//   - every starting slot is filled when a player is available for it, so a filled
//     slot can carry a negative score
//   - missing positions or scores produce a status and a BLANK total, never zero
//   - "> 150" means strictly greater
//   - ties share a crown, and a tie never breaks a record

export * from './standings';
export * from './lineup';
export * from './analytics';
export * from './trades';
export * from './activity';
export * from './leaders';
