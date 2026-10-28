import { describe, expect, it } from 'vitest';

import golden from '../../../../fixtures/golden/2026-through-week-04.json';
import { round2 } from '../numbers';
import { effectivePoints } from '../normalize/matchups';
import type { PlayerDictionary, SleeperMatchup } from '../sleeper/types';
import { FINALIZED_WEEKS, league, matchups, players, rosters } from '../test-fixtures';
import type { SeasonLineupTotals } from './lineup';
import { optimalLineup, rollUpLineups, weeklyLineups } from './lineup';

/**
 * Tests for the optimal-lineup solver and the three numbers derived from it
 * (calculated Max PF, bench gap, efficiency).
 *
 * Three layers, in order of how much they prove:
 *
 *  1. The unit cases ported from reference/legacy/redraft_tests.js, which pin
 *     the rules the Sheets version asserted about its own solver.
 *  2. The 40 generated fixtures from the same file, each checked against an
 *     independent exhaustive oracle written here. The oracle fills slots rather
 *     than assigning players, so it shares no structure with the DP: an error
 *     in the bitmask would have to be reproduced by a different algorithm to
 *     go unnoticed.
 *  3. The real league fixtures against fixtures/golden, which is the check that
 *     matters — every number to 2 decimals.
 */

// ---------------------------------------------------------------------------
// Shared test data, ported verbatim from reference/legacy/redraft_tests.js:3
// ---------------------------------------------------------------------------

const legacyPlayers: PlayerDictionary = {
  q: { position: 'QB' },
  a: { position: 'RB' },
  b: { position: 'RB' },
  c: { position: 'WR' },
  d: { position: 'TE' },
  e: { position: 'WR' },
};

function matchupOf(points: Record<string, number>, ids = Object.keys(points)): SleeperMatchup {
  return { roster_id: 1, players: ids, players_points: points };
}

interface OracleResult {
  /** Slots occupied, which is what the full-lineup rule maximises first. */
  filled: number;
  score: number;
}

/** Better of two candidates under the rule being tested. */
function preferred(a: OracleResult, b: OracleResult, allowEmptySlots: boolean): OracleResult {
  if (!allowEmptySlots && a.filled !== b.filled) return a.filled > b.filled ? a : b;
  return a.score > b.score ? a : b;
}

/**
 * Independent oracle: walk the slots, and for each one either leave it empty or
 * fill it with any unused eligible player. Exhaustive, exponential, and
 * structured the opposite way round from the DP — slot-first rather than
 * player-first — so a bitmask error would have to be reproduced by a different
 * algorithm to go unnoticed.
 *
 * Ported from reference/legacy/redraft_tests.js:16 and extended to both rules:
 * `allowEmptySlots` false maximises occupied slots first, score second.
 */
function bruteForce(
  ids: readonly string[],
  scores: Readonly<Record<string, number>>,
  slots: readonly string[],
  dictionary: PlayerDictionary,
  allowEmptySlots: boolean,
  index = 0,
  used: Set<string> = new Set(),
): OracleResult {
  if (index === slots.length) return { filled: 0, score: 0 };

  // Leaving the slot empty. Always legal; under the full-lineup rule it simply
  // loses to any candidate that fills the slot.
  let best = bruteForce(ids, scores, slots, dictionary, allowEmptySlots, index + 1, used);

  const slot = slots[index];
  const allowed =
    slot === 'FLEX'
      ? ['RB', 'WR', 'TE']
      : slot === 'SUPER_FLEX'
        ? ['QB', 'RB', 'WR', 'TE']
        : [slot];

  for (const id of ids) {
    if (used.has(id)) continue;

    const entry = dictionary[id];
    const score = scores[id];
    if (entry === undefined || score === undefined) continue;

    const positions = entry.fantasy_positions ?? [entry.position];
    if (!positions.some((position) => position != null && allowed.includes(position))) continue;

    used.add(id);
    const rest = bruteForce(ids, scores, slots, dictionary, allowEmptySlots, index + 1, used);
    best = preferred({ filled: rest.filled + 1, score: rest.score + score }, best, allowEmptySlots);
    used.delete(id);
  }

  return best;
}

// ---------------------------------------------------------------------------
// 1. Rules the legacy suite asserted
// ---------------------------------------------------------------------------

describe('optimalLineup — rules ported from the Apps Script suite', () => {
  it('fills every slot from a shared pool, using each player at most once', () => {
    const result = optimalLineup(
      matchupOf({ q: 20, a: 10, b: 30, c: 25, d: 15, e: 40 }),
      ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN'],
      legacyPlayers,
    );

    // QB 20 + RB 30 + WR 40 + TE 15 + FLEX 25 = 130. The second RB (10) is the
    // one left out, not the 25-point WR, which is what the shared FLEX pool buys.
    expect(result.status).toBe('OK');
    expect(result.total).toBe(130);
    expect(new Set(result.lineup.map((entry) => entry.player_id)).size).toBe(5);
  });

  it('starts a negative score rather than leave the slot empty', () => {
    // The one rule the rebuild changed. The Sheets version returned 0 here by
    // benching the player; you cannot start nobody at RB, so a full lineup
    // carries the -2. `allowEmptySlots: true` still returns the old 0.
    const result = optimalLineup(matchupOf({ a: -2 }), ['RB'], legacyPlayers);

    expect(result.status).toBe('OK');
    expect(result.total).toBe(-2);
    expect(result.lineup).toEqual([{ slot: 1, position: 'RB', player_id: 'a', points: -2 }]);
  });

  it('reports MISSING_PLAYER_SCORES with a blank total', () => {
    const result = optimalLineup(matchupOf({}, ['a']), ['RB'], legacyPlayers);

    expect(result.status).toBe('MISSING_PLAYER_SCORES');
    expect(result.total).toBeNull();
    expect(result.lineup).toEqual([]);
  });

  it('reports UNSUPPORTED_SLOTS with a blank total', () => {
    const result = optimalLineup(matchupOf({ a: 3 }), ['UNKNOWN'], legacyPlayers);

    expect(result.status).toBe('UNSUPPORTED_SLOTS');
    expect(result.total).toBeNull();
  });

  it('ignores bench, IR and taxi slots', () => {
    const scores = { q: 20, a: 10, b: 30, c: 25, d: 15, e: 40 };

    expect(optimalLineup(matchupOf(scores), ['QB', 'BN', 'IR', 'TAXI'], legacyPlayers).total).toBe(
      20,
    );
  });

  it('never reuses a player across two slots that both accept them', () => {
    const result = optimalLineup(matchupOf({ q: 25 }), ['QB', 'SUPER_FLEX'], legacyPlayers);

    expect(result.total).toBe(25);
    expect(result.lineup).toHaveLength(1);
  });
});

describe('optimalLineup — allowEmptySlots', () => {
  it('fills the slot by default, carrying the negative score', () => {
    const result = optimalLineup(matchupOf({ a: -2 }), ['RB'], legacyPlayers);

    expect(result.total).toBe(-2);
    expect(result.lineup).toEqual([{ slot: 1, position: 'RB', player_id: 'a', points: -2 }]);
  });

  it('reproduces the old Sheets number when empty slots are allowed', () => {
    const result = optimalLineup(matchupOf({ a: -2 }), ['RB'], legacyPlayers, {
      allowEmptySlots: true,
    });

    expect(result.total).toBe(0);
    expect(result.lineup).toEqual([]);
  });

  it('maximises the score among the lineups that fill the most slots', () => {
    const result = optimalLineup(matchupOf({ a: -5, b: -1 }), ['RB'], legacyPlayers);

    expect(result.total).toBe(-1);
  });

  it('fills as many slots as it can when there are fewer players than slots', () => {
    const result = optimalLineup(matchupOf({ a: -3 }), ['RB', 'RB'], legacyPlayers);

    expect(result.total).toBe(-3);
    expect(result.lineup).toHaveLength(1);
  });

  it('leaves a slot empty only when nobody on the roster is eligible for it', () => {
    // No kicker rostered, so the K slot cannot be filled under either rule.
    const result = optimalLineup(matchupOf({ q: 20 }), ['QB', 'K'], legacyPlayers);

    expect(result.total).toBe(20);
    expect(result.lineup).toHaveLength(1);
  });

  it('agrees with itself either way when no score is negative', () => {
    const scores = { q: 20, a: 10, b: 30, c: 25, d: 15, e: 40 };
    const slots = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN'];

    expect(optimalLineup(matchupOf(scores), slots, legacyPlayers).total).toBe(
      optimalLineup(matchupOf(scores), slots, legacyPlayers, { allowEmptySlots: true }).total,
    );
  });
});

describe('optimalLineup — blank, never zero', () => {
  it('reports MISSING_POSITIONS when the dictionary has no entry for a player', () => {
    const result = optimalLineup(matchupOf({ zz: 12 }), ['RB'], legacyPlayers);

    expect(result.status).toBe('MISSING_POSITIONS');
    expect(result.total).toBeNull();
  });

  it('reports MISSING_POSITIONS when an entry carries no usable position', () => {
    const result = optimalLineup(matchupOf({ a: 12 }), ['RB'], {
      a: { fantasy_positions: [] },
    });

    expect(result.status).toBe('MISSING_POSITIONS');
    expect(result.total).toBeNull();
  });

  it('reports MISSING_PLAYER_SCORES when the payload carries no score map', () => {
    // Blank even though the roster is empty too: no score map is missing data,
    // and a 0 here would read as a real optimum of zero.
    const result = optimalLineup({ roster_id: 1, players: [] }, ['RB'], legacyPlayers);

    expect(result.status).toBe('MISSING_PLAYER_SCORES');
    expect(result.total).toBeNull();
  });

  it('reports MISSING_PLAYER_SCORES when a score is present but not finite', () => {
    const result = optimalLineup(
      { roster_id: 1, players: ['a'], players_points: { a: Number.NaN } },
      ['RB'],
      legacyPlayers,
    );

    expect(result.status).toBe('MISSING_PLAYER_SCORES');
    expect(result.total).toBeNull();
  });

  it('treats a starter missing from `players` as part of the pool', () => {
    // Sleeper has shipped payloads where a starter is absent from `players`.
    // Dropping them would silently understate the optimum.
    const result = optimalLineup(
      { roster_id: 1, starters: ['b'], players: ['a'], players_points: { a: 10, b: 30 } },
      ['RB'],
      legacyPlayers,
    );

    expect(result.total).toBe(30);
  });

  it('refuses more than 16 starting slots rather than overflow the bitmask', () => {
    const slots = Array.from({ length: 17 }, () => 'RB');

    expect(optimalLineup(matchupOf({ a: 5 }), slots, legacyPlayers).status).toBe(
      'UNSUPPORTED_SLOTS',
    );
  });

  it('accepts exactly 16 starting slots', () => {
    const slots = Array.from({ length: 16 }, () => 'RB');

    expect(optimalLineup(matchupOf({ a: 5 }), slots, legacyPlayers).status).toBe('OK');
  });
});

// ---------------------------------------------------------------------------
// 2. The 40 generated fixtures, against the independent oracle
// ---------------------------------------------------------------------------

describe('optimalLineup — 40 generated fixtures vs an exhaustive oracle', () => {
  // Ported from reference/legacy/redraft_tests.js:17. The score formula is kept
  // exactly as the legacy suite wrote it so these are the same 40 cases, not 40
  // new ones: ids cycle through -10..30, which guarantees negative scores,
  // ties, and overlapping FLEX/SUPER_FLEX demand on the same players.
  const slots = ['QB', 'RB', 'WR', 'FLEX', 'SUPER_FLEX'];
  const ids = Object.keys(legacyPlayers);

  for (let caseIndex = 0; caseIndex < 40; caseIndex += 1) {
    const scores = Object.fromEntries(
      ids.map((id, playerIndex) => [id, ((caseIndex * 13 + playerIndex * 7) % 41) - 10]),
    );

    it(`case ${caseIndex}: ${ids.map((id) => `${id}=${scores[id]}`).join(' ')}`, () => {
      // Both rules, because these cases are the ones with negative scores and
      // so the ones where the two definitions can diverge.
      for (const allowEmptySlots of [false, true]) {
        const result = optimalLineup(matchupOf(scores), slots, legacyPlayers, { allowEmptySlots });
        const oracle = bruteForce(ids, scores, slots, legacyPlayers, allowEmptySlots);

        expect(result.status).toBe('OK');
        expect(result.total).toBe(round2(oracle.score));
        expect(result.lineup).toHaveLength(oracle.filled);
      }
    });
  }

  it('agrees with the oracle on the real league slot structure', () => {
    // The league's own shape — two FLEX slots competing for one RB/WR/TE pool —
    // checked against the oracle on a hand-built roster small enough to brute force.
    const dictionary: PlayerDictionary = {
      qb: { fantasy_positions: ['QB'] },
      rb1: { fantasy_positions: ['RB'] },
      rb2: { fantasy_positions: ['RB'] },
      rb3: { fantasy_positions: ['RB'] },
      wr1: { fantasy_positions: ['WR'] },
      wr2: { fantasy_positions: ['WR'] },
      wr3: { fantasy_positions: ['WR'] },
      te1: { fantasy_positions: ['TE'] },
      te2: { fantasy_positions: ['TE'] },
      k: { fantasy_positions: ['K'] },
      def: { fantasy_positions: ['DEF'] },
    };
    const scores = {
      qb: 24.96,
      rb1: 18.8,
      rb2: 32.4,
      rb3: 4.1,
      wr1: 15.4,
      wr2: 7,
      wr3: 16.44,
      te1: 2.6,
      te2: 10,
      k: 7,
      def: 11,
    };
    const realSlots = league.roster_positions.filter((slot) => slot !== 'BN');

    const result = optimalLineup(matchupOf(scores), realSlots, dictionary);

    expect(result.total).toBe(
      round2(bruteForce(Object.keys(dictionary), scores, realSlots, dictionary, false).score),
    );
  });
});

// ---------------------------------------------------------------------------
// 3. The real league fixtures against the golden numbers
// ---------------------------------------------------------------------------

describe('lineup metrics — fixtures/golden, to 2 decimals', () => {
  const rosterPositions = league.roster_positions;

  const weeks = FINALIZED_WEEKS.map((week) =>
    weeklyLineups({
      leagueId: league.league_id,
      week,
      matchups: matchups(week),
      rosterPositions,
      players,
    }),
  );
  const allWeeks = weeks.flat();
  const totals = rollUpLineups(allWeeks);

  function goldenTeam(rosterId: number): (typeof golden.teams)[number] {
    const found = golden.teams.find((team) => team.rosterId === rosterId);
    if (found === undefined) throw new Error(`golden file has no roster ${rosterId}`);
    return found;
  }

  function seasonTotals(rosterId: number): (typeof totals)[number] {
    const found = totals.find((entry) => entry.roster_id === rosterId);
    if (found === undefined) throw new Error(`no rollup for roster ${rosterId}`);
    return found;
  }

  it('solves every roster for every finalized week', () => {
    expect(allWeeks).toHaveLength(14 * FINALIZED_WEEKS.length);

    for (const row of allWeeks) {
      expect(row.status).toBe('OK');
      expect(row.optimal_points).not.toBeNull();
    }
  });

  it('never returns an optimum below the lineup the manager actually started', () => {
    for (const row of allWeeks) {
      expect(row.optimal_points).toBeGreaterThanOrEqual(row.actual_points);
      expect(row.bench_gap).toBeGreaterThanOrEqual(0);
    }
  });

  it.each(golden.teams.map((team) => [team.team, team.rosterId] as const))(
    'calculated Max PF matches the golden number for %s',
    (_team, rosterId) => {
      expect(seasonTotals(rosterId).max_pf_calculated).toBe(
        goldenTeam(rosterId).maxPfBestLegalLineup,
      );
    },
  );

  it.each(golden.teams.map((team) => [team.team, team.rosterId] as const))(
    'bench gap matches the golden number for %s',
    (_team, rosterId) => {
      expect(seasonTotals(rosterId).bench_gap).toBe(goldenTeam(rosterId).pointsLeftOnBench);
    },
  );

  it('derives the bench gap as calculated Max PF minus actual PF', () => {
    for (const team of golden.teams) {
      const entry = seasonTotals(team.rosterId);

      expect(entry.bench_gap).toBe(round2((entry.max_pf_calculated ?? 0) - entry.actual_points));
      expect(entry.actual_points).toBe(team.pf);
    }
  });

  it('reports efficiency as actual over optimal, 0-100', () => {
    for (const entry of totals) {
      expect(entry.efficiency).toBe(
        round2((entry.actual_points / (entry.max_pf_calculated ?? 1)) * 100),
      );
      expect(entry.efficiency).toBeGreaterThan(0);
      expect(entry.efficiency).toBeLessThanOrEqual(100);
    }
  });

  it('sums the weekly optima into the season number', () => {
    for (const entry of totals) {
      const own = allWeeks.filter((row) => row.roster_id === entry.roster_id);

      expect(entry.weeks_counted).toBe(FINALIZED_WEEKS.length);
      expect(entry.max_pf_calculated).toBe(
        round2(own.reduce((sum, row) => sum + (row.optimal_points ?? 0), 0)),
      );
    }
  });

  it('honours custom_points in the actual score it compares against', () => {
    for (const week of FINALIZED_WEEKS) {
      for (const matchup of matchups(week)) {
        const row = allWeeks.find(
          (entry) => entry.week === week && entry.roster_id === matchup.roster_id,
        );

        expect(row?.actual_points).toBe(round2(effectivePoints(matchup)));
      }
    }
  });
});

describe('rollUpLineups — a season is blank unless every week solved', () => {
  const base = {
    league_id: 'L',
    roster_id: 1,
    actual_points: 100,
    optimal_points: 120,
    bench_gap: 20,
    efficiency: 83.33,
    status: 'OK' as const,
    lineup: [],
  };

  /** The rollup returns one row per roster; these cases hand it exactly one. */
  function only(rows: readonly SeasonLineupTotals[]): SeasonLineupTotals {
    const row = rows[0];
    if (row === undefined) throw new Error('expected exactly one rollup row');
    return row;
  }

  it('blanks Max PF, bench gap and efficiency when one week is unsolved', () => {
    const result = only(
      rollUpLineups([
        { ...base, week: 1 },
        {
          ...base,
          week: 2,
          optimal_points: null,
          bench_gap: null,
          efficiency: null,
          status: 'MISSING_POSITIONS',
        },
      ]),
    );

    expect(result.max_pf_calculated).toBeNull();
    expect(result.bench_gap).toBeNull();
    expect(result.efficiency).toBeNull();
    // The weeks that did solve are still counted, so the dashboard can say
    // "3 of 4 weeks" rather than only "unavailable".
    expect(result.weeks_counted).toBe(1);
    expect(result.weeks_unsolved).toBe(1);
    // Actual points are not in doubt just because a lineup was not solvable.
    expect(result.actual_points).toBe(200);
  });

  it('blanks a roster with no weeks at all', () => {
    const result = rollUpLineups([]);

    expect(result).toEqual([]);
  });

  it('blanks efficiency rather than dividing by a zero optimum', () => {
    const result = only(
      rollUpLineups([
        { ...base, week: 1, actual_points: 0, optimal_points: 0, bench_gap: 0, efficiency: null },
      ]),
    );

    expect(result.max_pf_calculated).toBe(0);
    expect(result.efficiency).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The four teams whose Sleeper ppts disagrees with the calculated value
// ---------------------------------------------------------------------------

describe('calculated Max PF vs Sleeper ppts', () => {
  const rosterPositions = league.roster_positions;
  const totals = rollUpLineups(
    FINALIZED_WEEKS.flatMap((week) =>
      weeklyLineups({
        leagueId: league.league_id,
        week,
        matchups: matchups(week),
        rosterPositions,
        players,
      }),
    ),
  );

  function sleeperPpts(rosterId: number): number {
    const roster = rosters.find((entry) => entry.roster_id === rosterId);
    const settings = roster?.settings;
    if (settings?.ppts === undefined) throw new Error(`roster ${rosterId} has no ppts`);
    return round2(settings.ppts + (settings.ppts_decimal ?? 0) / 100);
  }

  // The full-lineup definition's headline property, and the reason the golden
  // numbers are not this repo grading its own homework: the stored Max PF
  // equals a number Sleeper published and we did not compute. Why the old sheet
  // differed for four teams is max-pf.investigate.test.ts.
  it.each(golden.teams.map((team) => [team.team, team.rosterId] as const))(
    'calculated Max PF equals Sleeper ppts for %s',
    (_team, rosterId) => {
      const entry = totals.find((row) => row.roster_id === rosterId);

      expect(entry?.max_pf_calculated).toBe(sleeperPpts(rosterId));
    },
  );
});
