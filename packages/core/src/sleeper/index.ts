// Sleeper API client: typed responses, per-endpoint retry, bounded batching.
// Base URL https://api.sleeper.app/v1, no authentication.
// Endpoint-by-endpoint contract: docs/REBUILD_PLAN.md §3.
// Keep a normal in-season run to roughly 8-12 calls plus the daily player refresh.

export * from './types';
export * from './client';
export * from './batch';
