# Architecture and metric dictionary

How the site works, and the metrics it computes. For the product decisions
(scope, no backend, no money/injury) see [`CLAUDE.md`](../CLAUDE.md).

---

## 1. Architecture

```
apps/web (static SPA, GitHub Pages)
  │
  │  visitor enters a Sleeper league ID (or finds it by username)
  ▼
apps/web/src/data/loadSeason.ts      fetches raw Sleeper JSON, in the browser
  │                                   (api.sleeper.app allows cross-origin reads)
  ▼
packages/core                        pure TypeScript: normalize → metrics →
  │                                   playoff sim → history → the dashboards
  ▼
React pages render the dashboards    no metric logic in apps/web itself
```

There is no server, no database, and no secret: every number the site shows
is computed fresh, in the visitor's own browser, from Sleeper's public API.
A page load fetches the league, rosters, users, every week's matchups and
transactions, the brackets, the draft, and the player dictionary (cached a
day at a time in `localStorage` — it's the one call worth ~20 MB).

**History across seasons** walks `previous_league_id` back through every
season Sleeper links, computing each one with the same pure functions
`packages/core/src/pipeline/history-slice.ts` exposes, then composes them
into one career/record-book view (`combineHistory`). The current league's
previous seasons live on Sleeper itself — nothing is backfilled or stored.

**Idempotence and purity, not storage.** The original design (Appwrite
Functions + Databases) existed to make repeated writes safe. There's nothing
to write now, but the underlying discipline carried over: every
`packages/core` function is pure (every input handed in, including the
clock), so the same Sleeper payloads always produce the same numbers — the
same property that used to mean "a re-run replaces rows" now just means
"reloading the page never shows a different answer for the same data."

---

## 2. Metric dictionary

Legend: **R** = raw from Sleeper · **W** = derived per week · **S** = derived
per season · **C** = career/all-time · **Sim** = simulation

### 2a. Standings and core scoring
| Metric | Definition | Tier | Inputs |
|---|---|---|---|
| Record (W-L-T), Win % | Win % = (W + ½T) / games | R | `rosters[].settings.wins/losses/ties` |
| PF, PA, PF−PA | `fpts + fpts_decimal/100`, same for `fpts_against` | R | rosters |
| Max PF (Sleeper) | `ppts + ppts_decimal/100`; regular season, includes taxi | R | rosters |
| Max PF (calculated) | Sum per finalized regular week of the best full lineup — every starting slot filled, including when the best player available for a slot scored below zero | W→S | matchups `players_points`, player positions, `league.roster_positions` |
| Total PF finalized | Sum of actual matchup points (honors `custom_points`) | W→S | matchups |
| Games left | Regular-season games − finalized | S | league settings, matchups |
| Lowest PF flag | Fewest actual regular-season PF; ties share | S | rosters |
| Rank | Sleeper order: record, then PF, then PA | S | derived |

### 2b. Weekly analytics
| Metric | Definition | Tier |
|---|---|---|
| Weekly score / opponent / margin / result | From paired `matchup_id` | W |
| Weekly high scorer ("crown") | Highest score among all rosters; ties each get one | W |
| Weekly low scorer | Lowest score; ties share (feeds "most last-place weeks") | W |
| Optimal lineup, points left on bench, efficiency | Exact DP over legal slots incl. FLEX/SUPER_FLEX, filling every starting slot a player is available for; blank (not zero) when positions or scores are missing | W |
| All-play % | Share of the other rosters' weekly scores you beat, ½ for ties; weekly and season average | W/S |
| Schedule luck | Actual win credit − all-play expected wins | W/S |
| Consistency | Population standard deviation of completed weekly scores | S |
| Weeks > 150, weeks > 200 | Strictly greater than | W→C |
| Largest winning margin / narrowest victory | Over all finalized games; name winner, opponent, week | W |
| Highest-scoring loss, points scored in losses | Per game / summed | W→C |

### 2c. Playoff model
| Metric | Definition | Tier |
|---|---|---|
| Playoff % | Simulations over the real remaining schedule; future scores sampled mostly from the team's own completed weeks, the rest from league-wide; seeding by record %, PF, PA, then a coin | Sim |
| Position now | Inside / outside the playoff cutoff | S |
| Clinched / eliminated | Only from proven record-only bounds or final seeding; never from a rounded 0%/100% | S |
| Wins to guarantee, losses to eliminate, wins for 80% odds | Conservative bounds | S |
| Scenario table | Estimated chance per remaining W–L finish | Sim |

Forecasts are withheld (shown as N/A) for incomplete schedules, missing PF/PA,
divisions, or non-standard seeding.

### 2d. Activity, trades, draft
| Metric | Definition | Tier |
|---|---|---|
| Completed add-transactions per manager | Unique transaction IDs with ≥1 add | S |
| Trade recap | Every completed trade: assets each side, measured points from acquired players after the trade week (same season) | S |
| Trade estimate | Received vs sent players' latest up-to-3 observed weeks; picks ungraded; labeled an estimate, not a verdict | S |
| Draft results | Annual draft picks | R |

### 2e. Postseason
| Metric | Definition | Tier |
|---|---|---|
| Championship / consolation brackets | Round, game, team 1/2, recorded winner, placement game; unassigned slots shown as byes/future slots | R |
| Champion, runner-up, consolation champion | From placement games (`p`), winner-advances consolation format | R |
| Postseason scoring leader | Actual starter points, completed postseason weeks only, incl. consolation | W→S |
| Biggest postseason win | One week's margin | W |

### 2f. History and record book
| Metric | Definition |
|---|---|
| Career W/L/T, win %, PF, PA, avg PF per game, titles, playoff appearances, luck wins | Keyed by Sleeper **user ID** across linked seasons (a different account taking a slot starts new totals) |
| Season PF by year | Trajectory chart, every linked season |
| Record book (11 records) | Highest/lowest single-week score, most weekly titles, most weeks >150 / >200, most weekly last-place scores, highest/lowest completed-season score, most career PF, most championships, narrowest victory |
| Previous record holders | Verified predecessors only, from replaying saved results in order. Ties do not break records; zero counts do not qualify |
| Luck table | Luckiest/unluckiest season and career, biggest swing, points in losses, career PA |
| Lowest-PF seasons | Count per manager, ties included |

### 2g. Summary (weekly recap)
Pure view over the above for the latest finalized week: new record breaks,
rollup cards, all-play latest vs season, schedule luck latest vs season, crown
race, playoff watch. No new calculations.

One calculation of its own: **position leaders** (`metrics/leaders.ts`,
stored as `summary.position_leaders` for every scored week). Per week and per
position (QB, RB, WR, TE, K, DEF, by the player dictionary's primary
`position`), the highest `player_scores.points` among every rostered player,
bench included. Ties keep every leader, ordered by name. A null score is
unobserved and skipped; a position where nobody has a score has no leader
(shown as "No score yet"), never 0.

---

## 3. What a page load fetches

Base URL `https://api.sleeper.app/v1`. No authentication, CORS-open. A normal
load is on the order of 10-20 calls per season walked, plus the player
dictionary (cached a day at a time).

| Endpoint | Fields kept | When |
|---|---|---|
| `/state/nfl` | `season`, `week` | Once, for the current season's clock |
| `/league/{id}` | `season`, `status`, `settings`, `roster_positions`, `scoring_settings`, `previous_league_id`, `draft_id` | Every league in the chain |
| `/league/{id}/users` | `user_id`, `display_name`, `username`, `avatar`, `metadata.team_name` | Every league in the chain |
| `/league/{id}/rosters` | `roster_id`, `owner_id`, `settings`, `players`, `starters`, `reserve`, `taxi` | Every league in the chain |
| `/league/{id}/matchups/{week}` | `roster_id`, `matchup_id`, `points`, `custom_points`, `starters`, `starters_points`, `players`, `players_points` | Every week the league has played |
| `/league/{id}/winners_bracket`, `/losers_bracket` | `r`, `m`, `t1`, `t2`, `w`, `l`, `t1_from`, `t2_from`, `p` | Every league in the chain |
| `/league/{id}/drafts`, `/draft/{id}`, `/draft/{id}/picks` | Draft metadata and picks | Current season only |
| `/user/{username}`, `/user/{id}/leagues/nfl/{season}` | Account lookup for the "find my league" flow | Only when a visitor searches by username |
| `/players/nfl` (~20 MB) | `position`, `fantasy_positions`, `team`, `status`, `full_name`, `age` | At most once a day, cached in `localStorage` trimmed to ~1-2 MB |

---

## 4. Repo layout

```
apps/web/                 GitHub Pages site (static SPA)
  src/data/loadSeason.ts  the thin I/O wrapper: fetches Sleeper, calls core
packages/core/
  sleeper/                API client, retry, batching, typed responses
  normalize/              API JSON → table rows
  metrics/                optimal lineup, all-play, luck, consistency, records
  playoff/                simulation, bounds, tiebreaks
  history/                identity, career, record-event replay
  pipeline/               model.ts (one season) + history-slice.ts (cross-season)
config/league.json          playoff-sim tuning + the league fixtures/ was captured from
fixtures/                  saved Sleeper JSON + expected outputs, for Vitest
.github/workflows/         lint, typecheck, test, build and deploy to Pages
```
