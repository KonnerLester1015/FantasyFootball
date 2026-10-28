import { describe, expect, it } from 'vitest';

import golden from '../../../../fixtures/golden/2026-through-week-04.json';
import { round2 } from '../numbers';
import { FINALIZED_WEEKS, league, matchups, players, rosters } from '../test-fixtures';
import { optimalLineup } from './lineup';

/**
 * Why the old Sheets version reported 1-2 points more Max PF than Sleeper for
 * four teams — answered, and the definition changed as a result.
 *
 * This file used to state the question with `it.fails` placeholders, from
 * when the rebuild first found the discrepancy. It now holds the answer as
 * assertions, so the explanation
 * breaks loudly if it ever stops being true.
 *
 * **The cause is whether a starting slot may be left empty.** Sleeper's `ppts`
 * always fields a full lineup. The sheet left a slot empty for 0 rather than
 * start a negative score. The only negative scores in weeks 1-4 are four team
 * defenses, each on a roster carrying no second DEF, so a full lineup had no
 * choice but to absorb them:
 *
 *   ftcrumpfantasea        week 3   NE DEF   -1
 *   Rumple122              week 1   HOU DEF  -1
 *   Greatest show on turf  week 2   DET DEF  -1
 *   tmwasmer               week 3   GB DEF   -2
 *
 * Exactly the four teams, exactly the four deltas — which is why every gap was
 * a whole number of points, the observation the golden file could not explain.
 *
 * **The cause is NOT slot-assignment order**, which was the earlier leading
 * hypothesis: that Sleeper fills slots greedily and loses points to a global
 * optimum when two FLEX slots compete for one pool. Refuted below — on this
 * league's structure greedy and exact-DP are the same number for all 14 teams,
 * every week. They have to be: dedicated slots plus a flex pool is a laminar
 * structure, where greedy by score is already optimal.
 *
 * **What changed.** Max PF (calculated) is now "best full lineup; every
 * starting slot filled", because an empty DEF slot is not a lineup anyone could
 * have fielded. `fixtures/golden` was regenerated: the four teams' Max PF and
 * bench gap each fell by their delta, and the sheet's prior values are kept in
 * the file's `maxPfDefinitionChange` block. `allowEmptySlots: true` still
 * reproduces the sheet exactly, which is what the tests below check.
 */

const rosterPositions = league.roster_positions;
const history = golden.maxPfDefinitionChange.teams;
const changed = new Set(history.map((team) => team.rosterId));

function seasonTotal(rosterId: number, allowEmptySlots: boolean): number {
  let total = 0;
  for (const week of FINALIZED_WEEKS) {
    const matchup = matchups(week).find((entry) => entry.roster_id === rosterId);
    if (matchup === undefined) throw new Error(`week ${week} has no roster ${rosterId}`);

    const solved = optimalLineup(matchup, rosterPositions, players, { allowEmptySlots });
    if (solved.total === null) throw new Error(`week ${week} roster ${rosterId}: ${solved.status}`);
    total += solved.total;
  }
  return round2(total);
}

function sleeperPpts(rosterId: number): number {
  const settings = rosters.find((entry) => entry.roster_id === rosterId)?.settings;
  if (settings?.ppts === undefined) throw new Error(`roster ${rosterId} has no ppts`);
  return round2(settings.ppts + (settings.ppts_decimal ?? 0) / 100);
}

/** Every negative score the full lineup was forced to start. */
function forcedNegativePoints(rosterId: number): number {
  let total = 0;
  for (const week of FINALIZED_WEEKS) {
    const matchup = matchups(week).find((entry) => entry.roster_id === rosterId);
    if (matchup === undefined) throw new Error(`week ${week} has no roster ${rosterId}`);

    for (const assignment of optimalLineup(matchup, rosterPositions, players).lineup) {
      if (assignment.points < 0) total += assignment.points;
    }
  }
  return round2(total);
}

const rosterIds = rosters.map((roster) => roster.roster_id).sort((a, b) => a - b);

describe('Max PF — the full-lineup definition', () => {
  it('equals Sleeper ppts for all 14 teams', () => {
    expect(rosterIds).toHaveLength(14);

    for (const rosterId of rosterIds) {
      expect(seasonTotal(rosterId, false)).toBe(sleeperPpts(rosterId));
    }
  });

  it('is what fixtures/golden now records', () => {
    expect(golden.teams).toHaveLength(14);

    for (const team of golden.teams) {
      expect(team.maxPfBestLegalLineup).toBe(team.maxPfSleeper);
      expect(seasonTotal(team.rosterId, false)).toBe(team.maxPfBestLegalLineup);
    }
  });
});

describe('Max PF — why the old sheet showed 1-2 points more', () => {
  it('names exactly four teams', () => {
    expect(history).toHaveLength(4);
    expect(history.map((team) => team.overstatedBy)).toEqual([1, 1, 1, 2]);
  });

  it.each(history.map((team) => [team.team, team.rosterId] as const))(
    'reproduces the sheet for %s once empty slots are allowed again',
    (_team, rosterId) => {
      const recorded = history.find((team) => team.rosterId === rosterId);
      if (recorded === undefined) throw new Error(`no history for roster ${rosterId}`);

      expect(seasonTotal(rosterId, true)).toBe(recorded.sheetMaxPfBestLegalLineup);
    },
  );

  it.each(history.map((team) => [team.team, team.rosterId] as const))(
    'explains the whole gap for %s as forced negative starters',
    (_team, rosterId) => {
      const recorded = history.find((team) => team.rosterId === rosterId);
      if (recorded === undefined) throw new Error(`no history for roster ${rosterId}`);

      // The gap is the negative points a full lineup had to absorb — nothing else.
      expect(forcedNegativePoints(rosterId)).toBe(-recorded.overstatedBy);
      expect(round2(seasonTotal(rosterId, true) - seasonTotal(rosterId, false))).toBe(
        recorded.overstatedBy,
      );
    },
  );

  it('leaves the other ten teams identical under either rule', () => {
    const unchanged = golden.teams.filter((team) => !changed.has(team.rosterId));
    expect(unchanged).toHaveLength(10);

    for (const team of unchanged) {
      expect(seasonTotal(team.rosterId, true)).toBe(seasonTotal(team.rosterId, false));
      expect(forcedNegativePoints(team.rosterId)).toBe(0);
    }
  });

  it('also moved the bench gap by the same amount', () => {
    for (const recorded of history) {
      const team = golden.teams.find((entry) => entry.rosterId === recorded.rosterId);
      if (team === undefined) throw new Error(`no golden team ${recorded.rosterId}`);

      expect(round2(recorded.sheetPointsLeftOnBench - team.pointsLeftOnBench)).toBe(
        recorded.overstatedBy,
      );
      // Still the same identity the sheet satisfied: bench = Max PF - PF.
      expect(team.pointsLeftOnBench).toBe(round2(team.maxPfBestLegalLineup - team.pf));
    }
  });

  it('refutes slot-assignment order as the cause', () => {
    // Greedy by descending score into the first open eligible slot, which was
    // the hypothesis in fixtures/golden. If ordering were the cause this would
    // differ from the exact DP somewhere; it never does.
    const flex: Record<string, readonly string[]> = {
      FLEX: ['RB', 'WR', 'TE'],
      SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
    };
    const slots = rosterPositions.filter((slot) => slot !== 'BN');

    for (const week of FINALIZED_WEEKS) {
      for (const matchup of matchups(week)) {
        const pool = [...new Set([...(matchup.starters ?? []), ...(matchup.players ?? [])])].filter(
          (id) => id !== '0' && id !== '',
        );
        const open = slots.map(() => true);
        let greedy = 0;

        for (const id of [...pool].sort(
          (a, b) => (matchup.players_points?.[b] ?? 0) - (matchup.players_points?.[a] ?? 0),
        )) {
          const score = matchup.players_points?.[id] ?? 0;
          if (score <= 0) continue;

          const positions = players[id]?.fantasy_positions ?? [players[id]?.position];
          const index = slots.findIndex(
            (slot, slotIndex) =>
              open[slotIndex] &&
              (flex[slot] ?? [slot]).some((position) => positions.includes(position)),
          );
          if (index >= 0) {
            open[index] = false;
            greedy += score;
          }
        }

        // Greedy skips negative scores, so it is compared against the rule that
        // also leaves them out — isolating ordering as the only variable.
        expect(round2(greedy)).toBe(
          optimalLineup(matchup, rosterPositions, players, { allowEmptySlots: true }).total,
        );
      }
    }
  });
});
