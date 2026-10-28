// Manager identity, career rollups, and record-event replay.
// Definitions: docs/REBUILD_PLAN.md §2h.
//
// The fixture league has no prior Sleeper seasons, so these produce one season of history
// today. They exist now so the 2027 rollover via previous_league_id needs no rewrite.
//
// Invariants:
//   - identity is the Sleeper USER ID, not the roster slot; a different account
//     taking a slot starts new career totals
//   - records are replayed from saved results in order; only strict improvements
//     create a predecessor, and zero counts never qualify
//   - unobserved weeks are unobserved, not zero

export * from './identity';
export * from './seasons';
export * from './career';
export * from './records';
