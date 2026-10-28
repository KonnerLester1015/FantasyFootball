// Playoff model: seeded simulation over the real remaining schedule, plus the
// conservative record-only bounds.
// Definitions: docs/REBUILD_PLAN.md §2d.
//
// Invariants:
//   - a stable seed makes unchanged inputs reproducible
//   - a sampled 0% / 100% is NOT elimination or clinching; those come only from bounds
//   - forecasts are withheld (N/A) for incomplete schedules, missing PF/PA,
//     divisions, or non-standard seeding

export * from './forecast';
