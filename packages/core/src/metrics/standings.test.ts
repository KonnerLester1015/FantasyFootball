import { describe, expect, it } from 'vitest';
import { buildStandings, recordPct, standingsCompare, type StandingsInput } from './standings';
import { round2 } from '../numbers';
import { buildTeamRows, type TeamRow } from '../normalize/rosters';
import { buildIdentityIndex } from '../normalize/users';
import { buildMatchupRows } from '../normalize/matchups';
import * as fixtures from '../test-fixtures';
import golden from '../../../../fixtures/golden/2026-through-week-04.json';

const LEAGUE = fixtures.FIXTURE_LEAGUE_ID;
const SYNCED = new Date('2026-10-09T10:14:12.389Z');

// The golden file is "finalized through week 4" of a 14-week regular season
// (fixtures/golden/2026-through-week-04.json, asOf). Every expectation below is
// read from that file rather than retyped, so a fixture recapture moves the
// test with it.
const REGULAR_SEASON_WEEKS = golden.asOf.regularSeasonWeeks;
const FINALIZED_WEEKS = fixtures.FINALIZED_WEEKS;

function goldenTeam(rosterId: number): (typeof golden.teams)[number] {
  const found = golden.teams.find((candidate) => candidate.rosterId === rosterId);
  if (found === undefined) throw new Error(`golden file has no roster ${rosterId}`);
  return found;
}

function teamRows() {
  return buildTeamRows({
    leagueId: LEAGUE,
    season: fixtures.FIXTURE_SEASON,
    rosters: fixtures.rosters,
    identities: buildIdentityIndex({ users: fixtures.users, rosters: fixtures.rosters }),
    syncedAt: SYNCED,
  });
}

/**
 * One real team row, used as the base for the synthetic tie cases below so they
 * carry a complete row and only the fields under test are rewritten.
 */
function sampleTeam(index: number): TeamRow {
  const row = teamRows()[index];
  if (row === undefined) throw new Error(`fixtures have no roster at index ${index}`);
  return row;
}

/** Weeks 1-4 of finalized matchup rows, which is what the golden numbers cover. */
function finalizedMatchups() {
  return FINALIZED_WEEKS.flatMap((week) =>
    buildMatchupRows({
      leagueId: LEAGUE,
      week,
      matchups: fixtures.matchups(week),
      finalized: true,
    }),
  );
}

function input(overrides: Partial<StandingsInput> = {}): StandingsInput {
  return {
    teams: teamRows(),
    matchups: finalizedMatchups(),
    regularSeasonWeeks: REGULAR_SEASON_WEEKS,
    ...overrides,
  };
}

function standings() {
  return buildStandings(input());
}

function entry(rosterId: number) {
  const found = standings().find((candidate) => candidate.roster_id === rosterId);
  if (found === undefined) throw new Error(`no standings entry for roster ${rosterId}`);
  return found;
}

describe('recordPct', () => {
  it('counts a tie as half a win', () => {
    expect(recordPct({ wins: 2, losses: 1, ties: 1 })).toBeCloseTo(0.625, 10);
  });

  it('is 0 before any game is played, rather than dividing by zero', () => {
    expect(recordPct({ wins: 0, losses: 0, ties: 0 })).toBe(0);
  });
});

// Legacy rule, from reference/legacy/Redraft.gs:274 — record
// percentage, then higher PF, then higher PA.
describe('standingsCompare', () => {
  const base = { wins: 2, losses: 2, ties: 0, points_for: 500, points_against: 400 };

  it('puts the better record first', () => {
    expect(standingsCompare({ ...base, wins: 3, losses: 1 }, base)).toBeLessThan(0);
  });

  it('breaks a record tie on higher PF', () => {
    expect(standingsCompare({ ...base, points_for: 501 }, base)).toBeLessThan(0);
  });

  it('breaks a record and PF tie on higher PA', () => {
    expect(standingsCompare({ ...base, points_against: 401 }, base)).toBeLessThan(0);
  });

  it('reports an exact tie as 0 in all three fields', () => {
    expect(standingsCompare(base, { ...base })).toBe(0);
  });
});

describe('buildStandings — golden numbers', () => {
  it('returns one entry per team', () => {
    expect(standings()).toHaveLength(golden.teams.length);
  });

  it('reproduces the golden record, PF, PA and Sleeper Max PF for all 14 teams', () => {
    for (const expected of golden.teams) {
      const actual = entry(expected.rosterId);

      expect(actual.record).toBe(expected.record);
      expect(actual.wins).toBe(expected.wins);
      expect(actual.losses).toBe(expected.losses);
      expect(actual.ties).toBe(expected.ties);
      expect(actual.points_for).toBeCloseTo(expected.pf, 2);
      expect(actual.points_against).toBeCloseTo(expected.pa, 2);
      expect(actual.max_pf_sleeper).toBeCloseTo(expected.maxPfSleeper, 2);
    }
  });

  it('keeps the record as text so nothing becomes a date', () => {
    expect(entry(4).record).toBe('4-0-0');
    expect(typeof entry(4).record).toBe('string');
  });

  it('computes win % as (W + half T) / games, to 2 decimals', () => {
    expect(entry(4).win_pct).toBeCloseTo(100, 2); // 4-0-0
    expect(entry(10).win_pct).toBeCloseTo(75, 2); // 3-1-0
    expect(entry(1).win_pct).toBeCloseTo(50, 2); // 2-2-0
    expect(entry(13).win_pct).toBeCloseTo(25, 2); // 1-3-0
    expect(entry(5).win_pct).toBeCloseTo(0, 2); // 0-4-0
  });

  it('stores PF minus PA as a number, negative where PA is higher', () => {
    const expected = goldenTeam(5);
    expect(entry(5).point_difference).toBeCloseTo(expected.pf - expected.pa, 2);
    expect(entry(5).point_difference).toBeLessThan(0);
  });

  it('sums the finalized weekly scores to the golden PF for all 14 teams', () => {
    for (const expected of golden.teams) {
      expect(entry(expected.rosterId).total_pf_finalized).toBeCloseTo(expected.pf, 2);
    }
  });
});

describe('buildStandings — rank order', () => {
  it('ranks by record, then PF, then PA', () => {
    // Derived from the golden records and scores by the legacy comparator.
    expect(standings().map((team) => team.roster_id)).toEqual([
      4, 10, 9, 12, 14, 1, 2, 8, 3, 11, 7, 13, 5, 6,
    ]);
  });

  it('numbers the ranks 1..14 in that order', () => {
    expect(standings().map((team) => team.rank)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ]);
  });

  it('puts the undefeated team first and a 0-4 team last', () => {
    expect(entry(4).rank).toBe(1); // 4-0-0
    expect(entry(6).rank).toBe(14); // 0-4-0, lowest PF of the two
  });

  it('marks no team as tied, because PF separates every pair this season', () => {
    expect(standings().filter((team) => team.rank_tied)).toEqual([]);
  });

  it('shares the better rank between teams that tie on all three keys', () => {
    const first = sampleTeam(0);
    const second = sampleTeam(1);
    const tied = buildStandings(
      input({
        teams: [
          { ...first, wins: 2, losses: 2, ties: 0, points_for: 500, points_against: 400 },
          { ...second, wins: 2, losses: 2, ties: 0, points_for: 500, points_against: 400 },
        ],
        matchups: [],
      }),
    );

    expect(tied.map((team) => team.rank)).toEqual([1, 1]);
    expect(tied.every((team) => team.rank_tied)).toBe(true);
  });

  it('orders an exact tie by roster id, so a rerun returns the same order', () => {
    const first = sampleTeam(0);
    const second = sampleTeam(1);
    const tie = { wins: 2, losses: 2, ties: 0, points_for: 500, points_against: 400 };
    const rows = [
      { ...second, ...tie },
      { ...first, ...tie },
    ];

    expect(buildStandings(input({ teams: rows, matchups: [] })).map((t) => t.roster_id)).toEqual(
      [first.roster_id, second.roster_id].sort((a, b) => a - b),
    );
  });
});

describe('buildStandings — games left', () => {
  it('leaves 10 of 14 regular-season games for every team after week 4', () => {
    for (const team of standings()) {
      expect(team.games_played).toBe(FINALIZED_WEEKS.length);
      expect(team.games_left).toBe(REGULAR_SEASON_WEEKS - FINALIZED_WEEKS.length);
    }
  });

  it('reaches zero, not a negative number, once the regular season is over', () => {
    const finished = buildStandings(
      input({
        teams: [{ ...sampleTeam(0), wins: 14, losses: 0, ties: 0 }],
        matchups: [],
        regularSeasonWeeks: 14,
      }),
    );

    expect(finished.map((team) => team.games_left)).toEqual([0]);
  });
});

describe('buildStandings — lowest PF flag', () => {
  it('flags only the team with the fewest points for', () => {
    const lowest = Math.min(...golden.teams.map((team) => team.pf));
    const flagged = standings().filter((team) => team.lowest_pf);

    expect(flagged.map((team) => team.roster_id)).toEqual([6]);
    expect(flagged.map((team) => team.points_for)).toEqual([round2(lowest)]);
  });

  it('flags every tied team when two share the fewest points', () => {
    const first = sampleTeam(0);
    const second = sampleTeam(1);
    const third = sampleTeam(2);
    const tied = buildStandings(
      input({
        teams: [
          { ...first, points_for: 300 },
          { ...second, points_for: 300 },
          { ...third, points_for: 400 },
        ],
        matchups: [],
      }),
    );

    expect(
      tied
        .filter((team) => team.lowest_pf)
        .map((team) => team.roster_id)
        .sort((a, b) => a - b),
    ).toEqual([first.roster_id, second.roster_id].sort((a, b) => a - b));
  });
});

describe('buildStandings — weekly scores, opponents and margins', () => {
  it('attaches one week per finalized week, in week order', () => {
    expect(entry(1).weeks.map((week) => week.week)).toEqual([...FINALIZED_WEEKS]);
  });

  it('carries the score, the opponent and the margin for each week', () => {
    for (const team of standings()) {
      for (const week of team.weeks) {
        expect(week.opponent_roster_id).not.toBeNull();
        expect(week.margin).toBeCloseTo(week.points - (week.opponent_points ?? 0), 2);
        expect(week.result).toMatch(/^[WLT]$/);
      }
    }
  });

  it('mirrors the margin between the two sides of a game', () => {
    const [weekOne] = FINALIZED_WEEKS;
    const mine = entry(1).weeks.find((week) => week.week === weekOne);
    if (mine === undefined || mine.opponent_roster_id === null) throw new Error('no week 1 game');
    const theirs = entry(mine.opponent_roster_id).weeks.find((week) => week.week === weekOne);

    expect(theirs?.margin).toBeCloseTo(-(mine.margin ?? 0), 2);
    expect(theirs?.points).toBeCloseTo(mine.opponent_points ?? 0, 2);
  });

  it('counts the weekly results back to the golden record for all 14 teams', () => {
    for (const expected of golden.teams) {
      const weeks = entry(expected.rosterId).weeks;

      expect(weeks.filter((week) => week.result === 'W')).toHaveLength(expected.wins);
      expect(weeks.filter((week) => week.result === 'L')).toHaveLength(expected.losses);
      expect(weeks.filter((week) => week.result === 'T')).toHaveLength(expected.ties);
    }
  });

  it('excludes an unfinalized week from the record and the weekly series', () => {
    const withLiveWeek = buildStandings(
      input({
        matchups: [
          ...finalizedMatchups(),
          ...buildMatchupRows({
            leagueId: LEAGUE,
            week: 5,
            matchups: fixtures.matchups(5),
            finalized: false,
          }),
        ],
      }),
    );
    const team = withLiveWeek.find((candidate) => candidate.roster_id === 1);

    expect(team?.weeks.map((week) => week.week)).toEqual([...FINALIZED_WEEKS]);
    expect(team?.total_pf_finalized).toBeCloseTo(goldenTeam(1).pf, 2);
  });
});
