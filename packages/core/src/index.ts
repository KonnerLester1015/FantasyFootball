// Public surface of @fantasy-football/core.
//
// Every number the site shows is produced here and stored by functions/ingest.
// The browser renders stored values and never recalculates a metric.
//
// Implementation order (docs/REBUILD_PLAN.md §6, phase 3):
//   standings -> weekly scores -> optimal lineup -> all-play and luck
//   -> crowns -> playoff sim -> record events -> history
// Each step is checked against fixtures/ before the next begins.

export * from './numbers';
export * from './sleeper';
export * from './normalize';
export * from './metrics';
export * from './playoff';
export * from './history';
export * from './pipeline';
