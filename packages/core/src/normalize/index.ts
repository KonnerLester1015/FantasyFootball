// Sleeper JSON -> table rows, with deterministic document IDs.
// ID shape is part of the contract: re-running ingestion must replace, never duplicate.
// Table list and ID formulas: docs/REBUILD_PLAN.md.
//
// A normalizer only translates the payload it is given. Anything that needs a
// whole week, the player dictionary, or a cross-roster comparison — rank,
// optimal lineup, all-play, luck, crowns, trade outcomes — belongs to
// packages/core/metrics, which the ingest function merges in before writing.

export * from './errors';
export * from './ids';
export * from './league';
export * from './users';
export * from './rosters';
export * from './matchups';
export * from './transactions';
export * from './brackets';
export * from './drafts';
export * from './players';
