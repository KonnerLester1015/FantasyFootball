# Fixtures

Two kinds of file, both committed:

**`sleeper/`** — raw Sleeper API responses, saved verbatim by
[`scripts/capture-fixtures.ts`](../scripts/capture-fixtures.ts) and named after the
endpoint and week (`matchups-w04.json`, `rosters.json`, `league.json`, …). These are the
inputs every `packages/core` test runs against. Save them once; never hand-edit them to
make a test pass. `.prettierignore` covers the directory so formatting cannot rewrite them
either. Phase 2 saved the 2026 season through week 5:

| File                                                      | Endpoint                                                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `state.json`                                              | `/state/nfl`                                                                                 |
| `league.json`, `users.json`, `rosters.json`               | `/league/{id}`, `…/users`, `…/rosters`                                                       |
| `winners_bracket.json`, `losers_bracket.json`             | `…/winners_bracket`, `…/losers_bracket`                                                      |
| `drafts.json`, `draft-{id}.json`, `draft-{id}-picks.json` | `…/drafts`, `/draft/{id}`, `/draft/{id}/picks`                                               |
| `matchups-w01…w14.json`                                   | `…/matchups/{week}`; weeks 6–14 are unplayed and carry only the remaining schedule           |
| `transactions-w00…w05.json`                               | `…/transactions/{week}` (week 0 is pre-season; it is legitimately `[]`)                      |
| `players.json`                                            | `/players/nfl`, trimmed                                                                      |
| `capture-meta.json`                                       | not from Sleeper: when the capture ran, the NFL state at the time, call count, player counts |

`players.json` is the one constructed file. The full dictionary is ~20 MB, so only the 274
players the payloads above actually mention are kept — whole entries, never field-trimmed,
because trimming fields would bake today's idea of "fields we need" into tomorrow's test
inputs. 61 of them are no longer on any roster; they are kept because an earlier week's
matchup or a transaction refers to them.

Weeks 6–14 were fetched on their own afterwards (`capture-meta.json` → `scheduleCapture`)
so the playoff model has the real remaining schedule; every other file was left as captured,
so the golden numbers below still describe it.

Re-running the capture overwrites everything. A finalized week must not change when it
does (CLAUDE.md, "finalized weeks are immutable") — if one does, that is a finding, not a
fixture to quietly commit.

**`golden/`** — the numbers those inputs must produce, copied from the Sheets version's
exports in `reference/sheet-exports/` (which is gitignored, so the numbers live here
rather than being read at test time).

[`golden/2026-through-week-04.json`](golden/2026-through-week-04.json) holds the 2026
season as the sheet reported it finalized through week 4: per-team record, PF, PA, both Max
PF values, all-play %, schedule luck, points left on bench, consistency and weekly crowns,
plus a `records` block holding the sheet's record-book rows (highest and lowest single-week
score, most weeks above 150/200, most weekly last-place scores, largest winning margin,
narrowest victory, highest-scoring loss), and the standings table's rank, Playoff %, games
left and position (inside/outside the top 6). Each value's unit is spelled out in the file's
`units` block. Spot checks from it:

| Value                               | Expected                     |
| ----------------------------------- | ---------------------------- |
| alexdun17 — regular-season PF       | 590.84                       |
| alexdun17 — all-play %              | 78.85%                       |
| Happy Hamsters — schedule luck      | +1.62                        |
| Rumple122 — points left on bench    | 128.2                        |
| Rumple122 — lowest PF               | 349.44                       |
| Prestige Worldwide — largest margin | 81.72 over Team Sith, week 4 |
| alexdun17 — Playoff %               | 93.16%                       |

Two fields in that file are **no longer the sheet's numbers**. `maxPfBestLegalLineup` and
`pointsLeftOnBench` were regenerated when Max PF moved to "best full lineup; every starting
slot filled" (an issue found and resolved during the original rebuild). The old sheet showed 1–2 points more
Max PF — and the same excess bench — for Greatest show on turf, ftcrumpfantasea, Rumple122
and tmwasmer, because it left a starting slot empty rather than start a negative-scoring
defense. Its prior values are preserved in the file's `maxPfDefinitionChange` block, and
`optimalLineup(…, { allowEmptySlots: true })` still reproduces them; both directions are
asserted in
[`packages/core/src/metrics/max-pf.investigate.test.ts`](../packages/core/src/metrics/max-pf.investigate.test.ts).

Regenerating those two is safe against circular reasoning, which is worth stating plainly:
`maxPfBestLegalLineup` now equals Sleeper's own `ppts` for all 14 teams, and
`pointsLeftOnBench` is that minus the sheet's `pf`. Both stay anchored to numbers this repo
did not compute, so the golden file is not `packages/core` grading its own homework. Every
other value still comes from the sheet exports untouched.
