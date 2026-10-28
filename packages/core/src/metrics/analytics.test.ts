import { describe, expect, it } from 'vitest';

import golden from '../../../../fixtures/golden/2026-through-week-04.json';
import { round2 } from '../numbers';
import { buildMatchupRows, type MatchupRow } from '../normalize/matchups';
import { FINALIZED_WEEKS, league, matchups } from '../test-fixtures';
import { leagueRecords, seasonAnalytics, weeklyAnalytics } from './analytics';

/**
 * Weekly analytics — docs/REBUILD_PLAN.md §2b.
 *
 * Two layers, in order of how much they prove:
 *
 *  1. Rule tests on hand-built rows, where the expected number is obvious by
 *     inspection: all-play tallies, half-credit for ties, strict 150/200,
 *     population (not sample) standard deviation, and every blank-not-zero case.
 *  2. The real fixtures against fixtures/golden — all-play %, schedule luck,
 *     consistency and crowns for all 14 teams, and the record book. The
 *     per-team 150/200 and last-place counts are checked twice: against a
 *     direct count off the raw fixture JSON, and against the sheet's own
 *     "most weeks above 150" / "most weekly last-place scores" records.
 */

// ---------------------------------------------------------------------------
// Hand-built rows
// ---------------------------------------------------------------------------

/**
 * One finalized matchup row. Defaults make the common case short; the fields
 * that matter to a given test are the ones it passes.
 */
function row(overrides: Partial<MatchupRow> & { week: number; roster_id: number }): MatchupRow {
  return {
    $id: `L_${overrides.week}_${overrides.roster_id}`,
    league_id: 'L',
    matchup_id: 1,
    opponent_roster_id: null,
    points: 0,
    custom_points: null,
    opponent_points: null,
    margin: null,
    result: 'PENDING',
    starters: [],
    players: [],
    ...overrides,
  };
}

/** A finalized head-to-head pair, with result and margin filled in both ways. */
function pair(
  week: number,
  home: { roster_id: number; points: number },
  away: { roster_id: number; points: number },
  matchupId = 1,
): MatchupRow[] {
  const outcome = (mine: number, theirs: number): MatchupRow['result'] =>
    mine > theirs ? 'W' : mine < theirs ? 'L' : 'T';

  return [
    row({
      week,
      roster_id: home.roster_id,
      matchup_id: matchupId,
      points: home.points,
      opponent_roster_id: away.roster_id,
      opponent_points: away.points,
      margin: round2(home.points - away.points),
      result: outcome(home.points, away.points),
    }),
    row({
      week,
      roster_id: away.roster_id,
      matchup_id: matchupId,
      points: away.points,
      opponent_roster_id: home.roster_id,
      opponent_points: home.points,
      margin: round2(away.points - home.points),
      result: outcome(away.points, home.points),
    }),
  ];
}

describe('weeklyAnalytics — all-play', () => {
  it('counts the other scores beaten, with half credit for a tie', () => {
    // Roster 1 scores 100 against 120, 100 and 80: beats one, ties one, loses one.
    const weekly = weeklyAnalytics([
      ...pair(1, { roster_id: 1, points: 100 }, { roster_id: 2, points: 120 }, 1),
      ...pair(1, { roster_id: 3, points: 100 }, { roster_id: 4, points: 80 }, 2),
    ]);
    const mine = weekly.find((entry) => entry.roster_id === 1);

    expect(mine?.all_play_games).toBe(3);
    expect(mine?.all_play_wins).toBe(1);
    expect(mine?.all_play_ties).toBe(1);
    // (1 + 0.5) / 3 = 50%
    expect(mine?.all_play_pct).toBe(50);
    expect(mine?.all_play_expected_wins).toBe(0.5);
  });

  it('compares against the week only, never across weeks', () => {
    const weekly = weeklyAnalytics([
      ...pair(1, { roster_id: 1, points: 100 }, { roster_id: 2, points: 90 }),
      ...pair(2, { roster_id: 1, points: 50 }, { roster_id: 2, points: 60 }),
    ]);

    expect(weekly.filter((entry) => entry.week === 1).every((e) => e.all_play_games === 1)).toBe(
      true,
    );
    expect(weekly.find((e) => e.week === 1 && e.roster_id === 1)?.all_play_pct).toBe(100);
    expect(weekly.find((e) => e.week === 2 && e.roster_id === 1)?.all_play_pct).toBe(0);
  });

  it('blanks all-play for a week with nobody to compare against', () => {
    const weekly = weeklyAnalytics([row({ week: 1, roster_id: 1, points: 100 })]);

    expect(weekly[0]?.all_play_games).toBe(0);
    expect(weekly[0]?.all_play_pct).toBeNull();
    expect(weekly[0]?.all_play_expected_wins).toBeNull();
  });
});

describe('weeklyAnalytics — crowns, last place, thresholds', () => {
  it('shares the crown and the last place on a tie', () => {
    const weekly = weeklyAnalytics([
      ...pair(1, { roster_id: 1, points: 120 }, { roster_id: 2, points: 120 }, 1),
      ...pair(1, { roster_id: 3, points: 80 }, { roster_id: 4, points: 80 }, 2),
    ]);

    expect(weekly.filter((entry) => entry.weekly_crown).map((e) => e.roster_id)).toEqual([1, 2]);
    expect(weekly.filter((entry) => entry.weekly_last).map((e) => e.roster_id)).toEqual([3, 4]);
  });

  it('gives one roster both the crown and last place when it is alone', () => {
    const weekly = weeklyAnalytics([row({ week: 1, roster_id: 1, points: 100 })]);

    expect(weekly[0]?.weekly_crown).toBe(true);
    expect(weekly[0]?.weekly_last).toBe(true);
  });

  it('treats 150 and 200 as strictly greater', () => {
    const weekly = weeklyAnalytics([
      row({ week: 1, roster_id: 1, points: 150 }),
      row({ week: 1, roster_id: 2, points: 150.01 }),
      row({ week: 1, roster_id: 3, points: 200 }),
      row({ week: 1, roster_id: 4, points: 200.01 }),
    ]);
    const at = (rosterId: number) => weekly.find((entry) => entry.roster_id === rosterId);

    expect(at(1)?.over_150).toBe(false);
    expect(at(2)?.over_150).toBe(true);
    expect(at(3)?.over_150).toBe(true);
    expect(at(3)?.over_200).toBe(false);
    expect(at(4)?.over_200).toBe(true);
  });
});

describe('seasonAnalytics', () => {
  it('averages all-play over every comparison, not over the weekly percentages', () => {
    // Week 1 has 3 comparisons, week 2 has 1. Averaging the two percentages
    // would give 50%; the correct answer weights by comparisons: 3/4 = 75%.
    const season = seasonAnalytics([
      ...pair(1, { roster_id: 1, points: 200 }, { roster_id: 2, points: 10 }, 1),
      ...pair(1, { roster_id: 3, points: 20 }, { roster_id: 4, points: 30 }, 2),
      ...pair(2, { roster_id: 1, points: 10 }, { roster_id: 2, points: 20 }, 1),
    ]);
    const mine = season.find((entry) => entry.roster_id === 1);

    expect(mine?.all_play_comparisons).toBe(4);
    expect(mine?.all_play_win_equivalents).toBe(3);
    expect(mine?.all_play_pct).toBe(75);
  });

  it('reports schedule luck as actual win credit minus all-play expected wins', () => {
    // Roster 1 wins its game but is the second-lowest scorer of four, so it was
    // lucky: 1 actual win against 1/3 expected.
    const season = seasonAnalytics([
      ...pair(1, { roster_id: 1, points: 90 }, { roster_id: 2, points: 80 }, 1),
      ...pair(1, { roster_id: 3, points: 200 }, { roster_id: 4, points: 150 }, 2),
    ]);

    expect(season.find((entry) => entry.roster_id === 1)?.schedule_luck).toBe(round2(1 - 1 / 3));
    // The 200 scored every all-play win and took its game, so luck is zero.
    expect(season.find((entry) => entry.roster_id === 3)?.schedule_luck).toBe(0);
  });

  it('counts a tie as half a win on both sides of schedule luck', () => {
    const season = seasonAnalytics([
      ...pair(1, { roster_id: 1, points: 100 }, { roster_id: 2, points: 100 }, 1),
    ]);

    expect(season.find((entry) => entry.roster_id === 1)?.schedule_luck).toBe(0);
  });

  it('blanks schedule luck when a counted week had no opponent', () => {
    // A bye: finalized, but no head-to-head result to credit.
    const season = seasonAnalytics([
      ...pair(1, { roster_id: 1, points: 100 }, { roster_id: 2, points: 90 }, 1),
      row({ week: 2, roster_id: 1, points: 100, matchup_id: null }),
      row({ week: 2, roster_id: 2, points: 90, matchup_id: null }),
    ]);

    expect(season.find((entry) => entry.roster_id === 1)?.schedule_luck).toBeNull();
    // All-play does not need an opponent, so it still reports.
    expect(season.find((entry) => entry.roster_id === 1)?.all_play_pct).toBe(100);
  });

  it('uses the population standard deviation for consistency', () => {
    // Scores 10 and 20: mean 15, population sd 5. The sample sd would be 7.07.
    const season = seasonAnalytics([
      ...pair(1, { roster_id: 1, points: 10 }, { roster_id: 2, points: 0 }, 1),
      ...pair(2, { roster_id: 1, points: 20 }, { roster_id: 2, points: 0 }, 1),
    ]);

    expect(season.find((entry) => entry.roster_id === 1)?.consistency).toBe(5);
  });

  it('reports zero consistency for a single week, and blank for none', () => {
    const one = seasonAnalytics([row({ week: 1, roster_id: 1, points: 100 })]);
    expect(one[0]?.consistency).toBe(0);

    expect(seasonAnalytics([])).toEqual([]);
  });

  it('counts crowns, last places and the 150/200 thresholds', () => {
    const season = seasonAnalytics([
      ...pair(1, { roster_id: 1, points: 160 }, { roster_id: 2, points: 100 }, 1),
      ...pair(2, { roster_id: 1, points: 210 }, { roster_id: 2, points: 100 }, 1),
      ...pair(3, { roster_id: 1, points: 90 }, { roster_id: 2, points: 100 }, 1),
    ]);
    const mine = season.find((entry) => entry.roster_id === 1);

    expect(mine?.weekly_crowns).toBe(2);
    expect(mine?.last_place_weeks).toBe(1);
    expect(mine?.weeks_over_150).toBe(2);
    expect(mine?.weeks_over_200).toBe(1);
  });

  it('reports the highest-scoring loss and the points scored in losses', () => {
    const season = seasonAnalytics([
      ...pair(1, { roster_id: 1, points: 130 }, { roster_id: 2, points: 140 }, 1),
      ...pair(2, { roster_id: 1, points: 90 }, { roster_id: 2, points: 100 }, 1),
      ...pair(3, { roster_id: 1, points: 200 }, { roster_id: 2, points: 10 }, 1),
    ]);
    const mine = season.find((entry) => entry.roster_id === 1);

    expect(mine?.highest_scoring_loss).toBe(130);
    expect(mine?.highest_scoring_loss_week).toBe(1);
    expect(mine?.points_in_losses).toBe(220);
  });

  it('blanks the highest-scoring loss for a team that has not lost', () => {
    const season = seasonAnalytics([
      ...pair(1, { roster_id: 1, points: 130 }, { roster_id: 2, points: 10 }, 1),
    ]);
    const mine = season.find((entry) => entry.roster_id === 1);

    expect(mine?.highest_scoring_loss).toBeNull();
    expect(mine?.highest_scoring_loss_week).toBeNull();
    // Zero points in losses is a real zero: there were no losses to score in.
    expect(mine?.points_in_losses).toBe(0);
  });
});

describe('leagueRecords', () => {
  it('names the biggest and narrowest wins with winner, opponent and week', () => {
    const records = leagueRecords([
      ...pair(1, { roster_id: 1, points: 150 }, { roster_id: 2, points: 50 }, 1),
      ...pair(2, { roster_id: 3, points: 101 }, { roster_id: 4, points: 100 }, 1),
    ]);

    expect(records.largest_margin).toEqual([
      { roster_id: 1, opponent_roster_id: 2, week: 1, value: 100 },
    ]);
    expect(records.narrowest_victory).toEqual([
      { roster_id: 3, opponent_roster_id: 4, week: 2, value: 1 },
    ]);
  });

  it('shares a record between every tied holder', () => {
    const records = leagueRecords([
      ...pair(1, { roster_id: 1, points: 150 }, { roster_id: 2, points: 50 }, 1),
      ...pair(1, { roster_id: 3, points: 160 }, { roster_id: 4, points: 60 }, 2),
    ]);

    expect(records.largest_margin.map((entry) => entry.roster_id)).toEqual([1, 3]);
    expect(records.largest_margin.every((entry) => entry.value === 100)).toBe(true);
  });

  it('does not treat a tie as a victory', () => {
    const records = leagueRecords([
      ...pair(1, { roster_id: 1, points: 100 }, { roster_id: 2, points: 100 }, 1),
    ]);

    expect(records.largest_margin).toEqual([]);
    expect(records.narrowest_victory).toEqual([]);
  });

  it('reports the highest-scoring loss across the league', () => {
    const records = leagueRecords([
      ...pair(1, { roster_id: 1, points: 130 }, { roster_id: 2, points: 140 }, 1),
      ...pair(1, { roster_id: 3, points: 120 }, { roster_id: 4, points: 190 }, 2),
    ]);

    expect(records.highest_scoring_loss).toEqual([
      { roster_id: 1, opponent_roster_id: 2, week: 1, value: 130 },
    ]);
  });

  it('blanks every record for a season with no finalized games', () => {
    const records = leagueRecords([]);

    expect(records.largest_margin).toEqual([]);
    expect(records.narrowest_victory).toEqual([]);
    expect(records.highest_scoring_loss).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The real fixtures against the golden numbers
// ---------------------------------------------------------------------------

describe('weekly analytics — fixtures/golden, to 2 decimals', () => {
  const rows = FINALIZED_WEEKS.flatMap((week) =>
    buildMatchupRows({
      leagueId: league.league_id,
      week,
      matchups: matchups(week),
      finalized: true,
    }),
  );
  const weekly = weeklyAnalytics(rows);
  const season = seasonAnalytics(rows);
  const records = leagueRecords(rows);

  /** roster id for a golden team name, so records read as names in the test. */
  function rosterOf(teamName: string): number {
    const found = golden.teams.find((team) => team.team === teamName);
    if (found === undefined) throw new Error(`golden file has no team ${teamName}`);
    return found.rosterId;
  }

  function seasonOf(rosterId: number): (typeof season)[number] {
    const found = season.find((entry) => entry.roster_id === rosterId);
    if (found === undefined) throw new Error(`no season row for roster ${rosterId}`);
    return found;
  }

  it('covers every roster in every finalized week', () => {
    expect(weekly).toHaveLength(14 * FINALIZED_WEEKS.length);
    expect(season).toHaveLength(14);
    // 14 teams means 13 other scores to compare against, every week.
    expect(weekly.every((entry) => entry.all_play_games === 13)).toBe(true);
  });

  it.each(golden.teams.map((team) => [team.team, team.rosterId] as const))(
    'all-play %% matches the golden number for %s',
    (_team, rosterId) => {
      const expected = golden.teams.find((team) => team.rosterId === rosterId)?.allPlayPct;

      expect(seasonOf(rosterId).all_play_pct).toBe(expected);
    },
  );

  it.each(golden.teams.map((team) => [team.team, team.rosterId] as const))(
    'schedule luck matches the golden number for %s',
    (_team, rosterId) => {
      const expected = golden.teams.find((team) => team.rosterId === rosterId)?.scheduleLuck;

      expect(seasonOf(rosterId).schedule_luck).toBe(expected);
    },
  );

  it.each(golden.teams.map((team) => [team.team, team.rosterId] as const))(
    'consistency matches the golden number for %s',
    (_team, rosterId) => {
      const expected = golden.teams.find((team) => team.rosterId === rosterId)?.consistency;

      expect(seasonOf(rosterId).consistency).toBe(expected);
    },
  );

  it.each(golden.teams.map((team) => [team.team, team.rosterId] as const))(
    'weekly crowns match the golden number for %s',
    (_team, rosterId) => {
      const expected = golden.teams.find((team) => team.rosterId === rosterId)?.weeklyCrowns;

      expect(seasonOf(rosterId).weekly_crowns).toBe(expected);
    },
  );

  it('awards exactly one crown and one last place per week', () => {
    for (const week of FINALIZED_WEEKS) {
      const inWeek = weekly.filter((entry) => entry.week === week);

      expect(inWeek.filter((entry) => entry.weekly_crown)).toHaveLength(1);
      expect(inWeek.filter((entry) => entry.weekly_last)).toHaveLength(1);
    }
  });

  it('agrees with a direct count off the raw fixtures for the thresholds', () => {
    // Independent of the module: count straight from the Sleeper payloads.
    for (const team of golden.teams) {
      const own = FINALIZED_WEEKS.map((week) => {
        const found = matchups(week).find((entry) => entry.roster_id === team.rosterId);
        return round2(Number(found?.custom_points ?? found?.points ?? 0));
      });

      expect(seasonOf(team.rosterId).weeks_over_150).toBe(
        own.filter((points) => points > 150).length,
      );
      expect(seasonOf(team.rosterId).weeks_over_200).toBe(
        own.filter((points) => points > 200).length,
      );
    }
  });

  it("matches the sheet's most-weeks-above-150 record", () => {
    const expected = golden.records.mostWeeksOver150;
    const best = Math.max(...season.map((entry) => entry.weeks_over_150));
    const holders = season
      .filter((entry) => entry.weeks_over_150 === best)
      .map((entry) => entry.roster_id);

    expect(best).toBe(expected.weeks);
    expect(holders.sort()).toEqual(expected.teams.map(rosterOf).sort());
  });

  it("matches the sheet's most-weeks-above-200 record, which nobody holds", () => {
    expect(Math.max(...season.map((entry) => entry.weeks_over_200))).toBe(
      golden.records.mostWeeksOver200.weeks,
    );
  });

  it("matches the sheet's most-weekly-last-place record", () => {
    const expected = golden.records.mostLastPlaceWeeks;
    const best = Math.max(...season.map((entry) => entry.last_place_weeks));
    const holders = season
      .filter((entry) => entry.last_place_weeks === best)
      .map((entry) => entry.roster_id);

    expect(best).toBe(expected.weeks);
    expect(holders).toEqual(expected.teams.map(rosterOf));
  });

  it("matches the sheet's largest winning margin", () => {
    const expected = golden.records.largestWinningMargin;

    expect(records.largest_margin).toEqual([
      {
        roster_id: rosterOf(expected.winner),
        opponent_roster_id: rosterOf(expected.loser),
        week: expected.week,
        value: expected.margin,
      },
    ]);
  });

  it("matches the sheet's narrowest victory", () => {
    const expected = golden.records.narrowestVictory;

    expect(records.narrowest_victory).toEqual([
      {
        roster_id: rosterOf(expected.winner),
        opponent_roster_id: rosterOf(expected.loser),
        week: expected.week,
        value: expected.margin,
      },
    ]);
  });

  it("matches the sheet's highest-scoring loss", () => {
    const expected = golden.records.highestScoringLoss;
    const holder = records.highest_scoring_loss[0];

    expect(records.highest_scoring_loss).toHaveLength(1);
    expect(holder?.roster_id).toBe(rosterOf(expected.team));
    expect(holder?.week).toBe(expected.week);
    expect(holder?.value).toBe(expected.points);
    // The same game, read from the other side.
    expect(seasonOf(rosterOf(expected.team)).highest_scoring_loss).toBe(expected.points);
  });

  it("matches the sheet's highest and lowest single-week scores", () => {
    const high = golden.records.highestSingleWeekScore;
    const low = golden.records.lowestSingleWeekScore;
    const scores = weekly.map((entry) => entry.points);

    const highest = weekly.filter((entry) => entry.points === Math.max(...scores));
    expect(highest.map((entry) => entry.roster_id)).toEqual(high.teams.map(rosterOf));
    expect(highest[0]?.week).toBe(high.week);
    expect(highest[0]?.points).toBe(high.points);

    const lowest = weekly.filter((entry) => entry.points === Math.min(...scores));
    expect(lowest.map((entry) => entry.roster_id)).toEqual(low.teams.map(rosterOf));
    expect(lowest[0]?.week).toBe(low.week);
    expect(lowest[0]?.points).toBe(low.points);
  });

  it('keeps the league-wide all-play books balanced', () => {
    // Every comparison is one roster's win, loss or half-tie against another,
    // so the league's win equivalents must total half of all comparisons.
    const comparisons = season.reduce((sum, entry) => sum + entry.all_play_comparisons, 0);
    const equivalents = season.reduce((sum, entry) => sum + entry.all_play_win_equivalents, 0);

    expect(equivalents).toBe(comparisons / 2);
  });

  it('makes schedule luck zero-sum across the league', () => {
    // Each week awards one win credit per game and the all-play shares in that
    // week sum to the same number, so luck has to cancel league-wide.
    const credit = rows.reduce(
      (sum, game) => sum + (game.result === 'W' ? 1 : game.result === 'T' ? 0.5 : 0),
      0,
    );
    const expected = weekly.reduce((sum, entry) => sum + (entry.all_play_expected_wins ?? 0), 0);

    expect(round2(credit - expected)).toBe(0);

    // The stored per-team numbers are each rounded to 2dp, so their sum carries
    // up to half a cent of rounding per team rather than landing exactly on 0.
    const stored = season.reduce((sum, entry) => sum + (entry.schedule_luck ?? 0), 0);
    expect(Math.abs(stored)).toBeLessThanOrEqual(0.005 * season.length);
  });
});
