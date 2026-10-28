# Sunday Funnies

Fantasy football dashboards for **any Sleeper league** — standings, playoff odds, optimal-lineup
and all-play metrics, a cross-season record book, and a weekly recap. Enter a Sleeper league ID
(or find it by username) and the site computes everything live from Sleeper's public API,
entirely in your browser.

**Live site:** <https://konnerlester1015.github.io/FantasyFootball/>

## How it works

There is no backend. `apps/web` is a static React + Vite single-page app hosted on GitHub Pages;
when you open it, `apps/web/src/data/loadSeason.ts` fetches your league directly from
`api.sleeper.app` (which allows cross-origin reads) and hands the raw data to `packages/core`,
a pure TypeScript library that does every calculation — normalization, optimal lineups, all-play
and luck, playoff simulation, and the cross-season history/record book. The browser never talks
to anything but Sleeper and its own `localStorage` (used only to cache Sleeper's ~20 MB player
dictionary for up to a day). See [`docs/REBUILD_PLAN.md`](docs/REBUILD_PLAN.md) for the full
architecture and metric dictionary.

## What's in this repository

An npm-workspaces monorepo with two layers:

- **`apps/web`** — the React 19 + Vite + TypeScript static site.
- **`packages/core`** — pure TypeScript: Sleeper API client, normalization, metrics, playoff
  forecasts, and history. No I/O of its own; `apps/web` is the only caller.

## Dashboards

Every route is scoped to a league: `#/<leagueId>/...`.

| Route                           | Dashboard                                                               |
| -------------------------------- | ------------------------------------------------------------------------ |
| `#/`                             | League entry — enter a league ID, or find one by Sleeper username        |
| `#/<leagueId>`                   | Current Season — standings, scoring, efficiency, luck, and playoff odds  |
| `#/<leagueId>/playoffs`          | Playoffs — bracket, seeds, and simulation outcomes                       |
| `#/<leagueId>/history`           | Record Book — season and career records, walked back through every prior season Sleeper links |
| `#/<leagueId>/summary`           | Weekly Recap                                                             |
| `#/<leagueId>/team/<rosterId>`   | Team detail and weekly metrics                                           |

The last league you opened is remembered in your browser (`localStorage`) so you land back on it
next time; a "Switch league" link in the header returns to the entry screen. Missing or unplayed
data is rendered as blank/N/A rather than as zero.

## Local development

Requirements: Node.js 22 and npm.

```bash
npm ci
npm run dev
```

Open the local URL Vite prints, normally <http://localhost:5173>. No environment variables are
needed — there's nothing to configure; the app talks straight to Sleeper.

To build or preview the static site:

```bash
npm run build --workspace @family-feud/web
npm run preview --workspace @family-feud/web
```

## Verification

Run the same checks CI runs, from the repository root:

```bash
npm run lint
npm run typecheck
npm test
```

`packages/core` is covered by Vitest fixtures captured from a real Sleeper league
(`fixtures/sleeper`), checked against golden numbers from that league's original spreadsheet
(`reference/sheet-exports`, kept out of git). A metric change should come with a fixture test.

## Deployment

[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) builds and publishes
`apps/web` to GitHub Pages on every push to `main`, after running the same lint/typecheck/test
gates as [`ci.yml`](.github/workflows/ci.yml). GitHub Pages must be set to deploy from "GitHub
Actions" (repo Settings → Pages → Source) for the workflow to take effect — a one-time setting,
not something this workflow configures itself.

## Documentation

- [`docs/REBUILD_PLAN.md`](docs/REBUILD_PLAN.md) — architecture and the metric dictionary.
- [`docs/DESIGN_BRIEF.md`](docs/DESIGN_BRIEF.md) — the visual design system.
- [`CLAUDE.md`](CLAUDE.md) — locked project decisions and contribution rules.

Legacy Apps Script and one league's exported spreadsheet data are kept outside the normal
application source under `reference/` (gitignored) for comparison and historical context.
