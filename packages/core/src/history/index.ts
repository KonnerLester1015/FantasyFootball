// Manager identity and the season's record-event replay.
// Definitions: docs/REBUILD_PLAN.md §2f.
//
// Everything here covers one season — the league ID the visitor entered.
// Prior seasons are not fetched or combined.
//
// Invariants:
//   - identity is the Sleeper USER ID, not the roster slot
//   - records are replayed from saved results in order; only strict improvements
//     create a predecessor, and zero counts never qualify
//   - unobserved weeks are unobserved, not zero

export * from './identity';
export * from './weeks';
export * from './records';
