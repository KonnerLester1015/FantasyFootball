# Sunday Funnies — Sleeper fantasy football dashboards

## Goal

A public, static web app — **React + Vite, hosted on GitHub Pages** — that renders fantasy
football dashboards for *any* Sleeper league. A visitor enters a Sleeper league ID (or finds one
by their Sleeper username); the browser fetches that league straight from Sleeper's public API
and computes every number itself. There is no backend, no database, and nothing to deploy beyond
the static site.

The site renders four dashboards — Current Season, History, Playoffs, Summary — from numbers
computed once per page load and never recalculated twice. That discipline (one computation, pure
functions, every input including the clock handed in explicitly) is what used to make the
Google-Apps-Script-and-Sheets predecessor to this project fight the "chart shows blank / number
differs between tabs" class of bug through 13 versions; it carries over even though there's no
database to keep consistent anymore.

Full design and the metric dictionary: [`docs/REBUILD_PLAN.md`](docs/REBUILD_PLAN.md).

Legacy source of truth for the original scoring rules, kept out of git:
`reference/legacy/` (the Apps Script this replaced, plus its tests) and `reference/sheet-exports/`
(golden numbers one specific league's sheet produced — still used as fixtures to prove
`packages/core`'s math, even though the site itself is no longer tied to that one league).

## Decisions (locked)

| Decision        | Detail                                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Scope**        | Any Sleeper league, chosen by the visitor. Nothing is hardcoded to one league ID. Money and injury tracking are **out of scope** — not hidden, not gated, removed. Hall of Glory (dynasty) is also out of scope.               |
| **Backend**      | **None.** No server, no database, no scheduled job, no API key, no passcode, no secret of any kind anywhere in this repo. The browser calls `api.sleeper.app` directly (it answers cross-origin reads) and computes locally. |
| **Access**       | Fully public. Every dashboard is visible to anyone who enters a league ID; there is nothing to gate because there is no money view and no private data.                                                                      |
| **History**      | Computed live by walking `previous_league_id` back through every season Sleeper links for the entered league. No backfill script, no stored career table — Sleeper itself is the source of truth for prior seasons.          |
| **Front end**    | React + Vite + TypeScript, static build, hash-based routing (`#/<leagueId>/...`) so GitHub Pages' lack of server-side rewrites never matters. No SSR framework.                                                              |
| **Math**         | All of it lives in `packages/core` as pure TypeScript, tested with **Vitest** against fixtures in `fixtures/`. `apps/web/src/data/loadSeason.ts` is the thin I/O wrapper (fetch Sleeper, call core); the web app only renders what core returns. No metric logic in `apps/web` itself. |
| **Secrets**      | None. There is nothing to put in `.env` — no `.env.example` exists because there is no variable left to template.                                                                                                             |
| **Caching**      | The only thing cached is Sleeper's ~20 MB player dictionary, trimmed and kept in the visitor's own `localStorage` for up to a day. Everything else is fetched fresh on every page load. No cache failure is fatal — a quota error or disabled storage just means a refetch next time. |

Supporting rules that follow from the above:

- **Every `packages/core` function is pure.** Every input is handed in explicitly, including the
  clock (`now: Date`), so the same Sleeper payloads always produce the same numbers. This is what
  lets a page reload never show a different answer for data that hasn't changed.
- **Missing data is blank, never zero.** An unplayed week, an incomplete schedule, or missing
  player scores render as N/A — never a misleading rounded 0.
- **Numbers are stored as numbers** and formatted only at render time. `-$25.00`-style formatting
  concerns are gone along with money, but the same rule still applies to every other value:
  records are text (`2-1-0`) so nothing becomes a date.

## Repo layout

```
apps/web/                 GitHub Pages site (static SPA)
  src/data/loadSeason.ts  fetches Sleeper directly from the browser, calls packages/core
  src/league-context.tsx  which Sleeper league the current route is scoped to
  src/pages/              one file per dashboard, plus LeagueEntryPage
packages/core/
  sleeper/                API client, retry, batching, typed responses
  normalize/              API JSON → table rows
  metrics/                optimal lineup, all-play, luck, consistency, records
  playoff/                simulation, bounds, tiebreaks
  history/                identity, career, record-event replay
  pipeline/               model.ts (one season) + history-slice.ts (cross-season composition)
config/league.json        playoff-sim tuning + the league scripts/capture-fixtures.ts pulls
                           from; the app itself takes its league from the visitor, not this file
fixtures/                 saved Sleeper JSON + expected outputs (from the original sheet)
.github/workflows/        lint, typecheck, test on every PR; build + deploy to Pages on main
docs/REBUILD_PLAN.md      architecture and the metric dictionary, kept in sync
```

npm workspaces: `apps/*`, `packages/*`.

## Before every commit

Run all three from the repo root and fix what they report. Do not commit red:

```bash
npm run lint
npm run typecheck
npm test
```

CI (`.github/workflows/ci.yml`) runs the same three on every PR; `.github/workflows/deploy-pages.yml`
runs them again on every push to `main` before building and publishing the site. A metric change
needs a fixture test proving the new number; a golden number from `reference/sheet-exports/` is
the preferred source where one exists.
