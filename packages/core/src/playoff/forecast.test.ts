import { describe, expect, it } from 'vitest';

import golden from '../../../../fixtures/golden/2026-through-week-04.json';
import leagueConfig from '../../../../config/league.json';
import { standingsCompare } from '../metrics/standings';
import { buildMatchupRows, type MatchupRow } from '../normalize/matchups';
import { buildTeamRows, type TeamRow } from '../normalize/rosters';
import { buildIdentityIndex } from '../normalize/users';
import * as fixtures from '../test-fixtures';
import {
  forecastPlayoffs,
  playoffSettings,
  recordBounds,
  seededRandom,
  type ForecastInput,
  type PlayoffSettings,
} from './forecast';

/**
 * The playoff model — docs/REBUILD_PLAN.md §2d.
 *
 * Three layers, in order of how much they prove:
 *
 *  1. The record-only bounds, checked the way the legacy suite checked them
 *     (reference/legacy/tests.js:55-66): enumerate every outcome of a small
 *     remaining schedule and prove no bound ever claims a clinch or an
 *     elimination that some outcome contradicts. Plus hand-derived values.
 *  2. The simulation and its guards on hand-built leagues, including the
 *     legacy deterministic fixture and unsupported-rule guards
 *     (reference/legacy/tests.js:67-78).
 *  3. The real 2026 fixtures against the sheet's Playoff % column
 *     (fixtures/golden). Playoff % is sampled, but the port consumes the
 *     seeded stream in the legacy order, so it reproduces the sheet's 5,000
 *     simulated seasons exactly and is compared to 0.01, not to a tolerance.
 *     Any change to sampling order, tiebreaks or the seed shows up here.
 */

const LEAGUE = fixtures.FIXTURE_LEAGUE_ID;
const SYNCED = new Date('2026-10-09T10:14:12.389Z');

// ---------------------------------------------------------------------------
// Hand-built input
// ---------------------------------------------------------------------------

function team(overrides: Partial<TeamRow> & { roster_id: number }): TeamRow {
  return {
    $id: `L_${overrides.roster_id}`,
    league_id: 'L',
    season: '2026',
    owner_id: `user-${overrides.roster_id}`,
    manager_name: `Manager ${overrides.roster_id}`,
    team_name: `Team ${overrides.roster_id}`,
    wins: 0,
    losses: 0,
    ties: 0,
    points_for: 0,
    points_against: 0,
    max_pf_sleeper: null,
    players: [],
    starters: [],
    reserve: [],
    taxi: [],
    synced_at: SYNCED.toISOString(),
    ...overrides,
  };
}

function game(
  week: number,
  rosterId: number,
  matchupId: number | null,
  result: MatchupRow['result'] = 'PENDING',
  points = 0,
): MatchupRow {
  return {
    $id: `L_${week}_${rosterId}`,
    league_id: 'L',
    week,
    roster_id: rosterId,
    matchup_id: matchupId,
    opponent_roster_id: null,
    points,
    custom_points: null,
    opponent_points: null,
    margin: null,
    result,
    starters: [],
    players: [],
  };
}

function settings(overrides: Partial<PlayoffSettings> = {}): PlayoffSettings {
  return {
    playoffTeams: 1,
    startWeek: 1,
    regularSeasonWeeks: 2,
    customSeeding: false,
    medianGames: false,
    divisions: false,
    simulations: leagueConfig.playoffSim.simulations,
    seed: leagueConfig.playoffSim.seed,
    teamSampleWeight: leagueConfig.playoffSim.teamSampleWeight,
    ...overrides,
  };
}

/**
 * The legacy forecast fixture (reference/legacy/tests.js:68-71): two teams, one
 * finalized week, one week left, one playoff seat.
 */
function legacyFixture(): ForecastInput {
  return {
    teams: [
      team({ roster_id: 1, wins: 1, points_for: 150, points_against: 100 }),
      team({ roster_id: 2, losses: 1, points_for: 100, points_against: 150 }),
    ],
    matchups: [game(1, 1, 1, 'W', 150), game(1, 2, 1, 'L', 100), game(2, 1, 1), game(2, 2, 1)],
    finalizedThroughWeek: 1,
    settings: settings(),
  };
}

// ---------------------------------------------------------------------------
// Record-only bounds
// ---------------------------------------------------------------------------

describe('recordBounds', () => {
  it('never contradicts any outcome of the remaining schedule', () => {
    // reference/legacy/tests.js:55-66. Four teams, two games each left, two
    // seats; every one of the 16 outcomes is played out and seeded.
    const baseline = [2, 1, 0, 0].map((wins, index) => ({
      roster_id: index + 1,
      wins,
      losses: 2 - wins,
      ties: 0,
      points_for: 100 + index,
      points_against: 100,
    }));
    const pairs: [number, number][] = [
      [0, 1],
      [2, 3],
      [0, 2],
      [1, 3],
    ];

    for (let mask = 0; mask < 16; mask += 1) {
      const played = baseline.map((entry) => ({ ...entry }));
      const added = [0, 0, 0, 0];
      pairs.forEach(([a, b], bit) => {
        const winner = mask & (1 << bit) ? a : b;
        const loser = winner === a ? b : a;
        (played[winner] as (typeof played)[number]).wins += 1;
        added[winner] = (added[winner] as number) + 1;
        (played[loser] as (typeof played)[number]).losses += 1;
      });
      const qualified = new Set(
        played
          .slice()
          .sort(standingsCompare)
          .slice(0, 2)
          .map((entry) => entry.roster_id),
      );

      baseline.forEach((entry, index) => {
        const bounds = recordBounds(baseline, index, [2, 2, 2, 2], 2);
        const wins = added[index] as number;
        if (bounds.guarantee_wins !== null && wins >= bounds.guarantee_wins) {
          expect(qualified.has(entry.roster_id), `mask ${mask} roster ${entry.roster_id}`).toBe(
            true,
          );
        }
        if (bounds.optimistic_min_wins === null || wins < bounds.optimistic_min_wins) {
          expect(qualified.has(entry.roster_id), `mask ${mask} roster ${entry.roster_id}`).toBe(
            false,
          );
        }
        if (bounds.losses_to_eliminate !== null && 2 - wins >= bounds.losses_to_eliminate) {
          expect(qualified.has(entry.roster_id), `mask ${mask} roster ${entry.roster_id}`).toBe(
            false,
          );
        }
      });
    }
  });

  it('clinches a team no one else can catch', () => {
    const teams = [
      { wins: 5, losses: 0, ties: 0 },
      { wins: 1, losses: 4, ties: 0 },
      { wins: 0, losses: 5, ties: 0 },
    ];
    const bounds = recordBounds(teams, 0, [2, 2, 2], 1);

    expect(bounds).toMatchObject({
      guarantee_wins: 0,
      safe_losses: 2,
      status: 'CLINCHED_BY_RECORD_BOUND',
    });
  });

  it('eliminates a team that cannot get inside the cut even by winning out', () => {
    const teams = [
      { wins: 5, losses: 0, ties: 0 },
      { wins: 5, losses: 0, ties: 0 },
      { wins: 0, losses: 5, ties: 0 },
    ];
    const bounds = recordBounds(teams, 2, [2, 2, 2], 2);

    expect(bounds).toMatchObject({
      optimistic_min_wins: null,
      guarantee_wins: null,
      safe_losses: null,
      status: 'ELIMINATED_BY_RECORD_BOUND',
    });
  });

  it('counts a tie as half a win', () => {
    // 2-0-1 has 2.5 wins: a 2-1-0 rival is strictly behind, so one seat is held.
    const teams = [
      { wins: 2, losses: 0, ties: 1 },
      { wins: 2, losses: 1, ties: 0 },
    ];
    expect(recordBounds(teams, 0, [0, 0], 1).status).toBe('CLINCHED_BY_RECORD_BOUND');
    expect(recordBounds(teams, 1, [0, 0], 1).status).toBe('ELIMINATED_BY_RECORD_BOUND');
  });

  it('leaves an exact record tie at the cutoff open', () => {
    // Equal records with nothing left to play: PF decides, so the record bound
    // proves neither a clinch nor an elimination.
    const teams = [
      { wins: 3, losses: 1, ties: 0 },
      { wins: 3, losses: 1, ties: 0 },
    ];
    expect(recordBounds(teams, 0, [0, 0], 1).status).toBe('OPEN');
    expect(recordBounds(teams, 1, [0, 0], 1).status).toBe('OPEN');
  });
});

// ---------------------------------------------------------------------------
// The seeded generator
// ---------------------------------------------------------------------------

describe('seededRandom', () => {
  it('repeats the same stream for the same seed', () => {
    const a = seededRandom(20261008);
    const b = seededRandom(20261008);
    const first = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(first);
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it('gives a different stream for a different seed', () => {
    expect(seededRandom(1)()).not.toBe(seededRandom(2)());
  });
});

// ---------------------------------------------------------------------------
// The simulation and its guards
// ---------------------------------------------------------------------------

describe('forecastPlayoffs', () => {
  it('is deterministic and complete on the legacy fixture', () => {
    const a = forecastPlayoffs(legacyFixture());
    const b = forecastPlayoffs(legacyFixture());

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.simulations).toBe(5000);
    expect(a.rows).toHaveLength(2);
    // One seat, so the qualification chances share 100%.
    const total = a.rows.reduce((sum, row) => sum + (row.playoff_chance_pct ?? 0), 0);
    expect(Math.abs(total - 100)).toBeLessThan(0.02);
    // One game left: every scenario is 1-0 or 0-1.
    expect(a.scenarios.every((row) => row.additional_wins + row.additional_losses === 1)).toBe(
      true,
    );
  });

  it('samples only completed scores, so a 150-vs-100 history favours the 150 team', () => {
    const forecast = forecastPlayoffs(legacyFixture());
    const [leader, trailer] = forecast.rows;

    // The leader also owns the head-to-head record and the PF tiebreak, so it
    // is out only when it loses week 2 *and* the coin of PF goes against it.
    expect(leader?.playoff_chance_pct).toBeGreaterThan(trailer?.playoff_chance_pct ?? 100);
    expect(leader?.remaining_games).toBe(1);
  });

  it('changes when the seed changes', () => {
    const base = legacyFixture();
    const other = forecastPlayoffs({ ...base, settings: { ...base.settings, seed: 1 } });
    expect(JSON.stringify(other.rows)).not.toBe(JSON.stringify(forecastPlayoffs(base).rows));
  });

  it('reports conditional odds per remaining win-loss finish', () => {
    const forecast = forecastPlayoffs(legacyFixture());
    const leaderWins = forecast.scenarios.find(
      (row) => row.roster_id === 1 && row.additional_wins === 1,
    );

    // A 2-0 leader against a 0-2 trailer cannot miss the one seat.
    expect(leaderWins?.conditional_playoff_chance_pct).toBe(100);
    expect(leaderWins?.simulated_cases).toBeGreaterThan(0);
    expect(leaderWins?.qualifying_cases).toBe(leaderWins?.simulated_cases);
  });

  describe('withholds the forecast', () => {
    const cases: [string, (input: ForecastInput) => ForecastInput, RegExp][] = [
      [
        'with no remaining schedule',
        (input) => ({ ...input, matchups: input.matchups.filter((row) => row.week === 1) }),
        /incomplete schedule/i,
      ],
      [
        'with league-median games',
        (input) => ({ ...input, settings: { ...input.settings, medianGames: true } }),
        /median/i,
      ],
      [
        'with divisions',
        (input) => ({ ...input, settings: { ...input.settings, divisions: true } }),
        /division/i,
      ],
      [
        'with custom seeding',
        (input) => ({ ...input, settings: { ...input.settings, customSeeding: true } }),
        /custom playoff seeding/i,
      ],
      [
        'with an unsupported seat count',
        (input) => ({ ...input, settings: { ...input.settings, playoffTeams: 3 } }),
        /playoff-team count/i,
      ],
      [
        'with an unpaired remaining game',
        (input) => ({
          ...input,
          matchups: input.matchups.map((row) =>
            row.week === 2 && row.roster_id === 2 ? { ...row, matchup_id: null } : row,
          ),
        }),
        /missing opponent/i,
      ],
      [
        'with a three-team matchup group',
        (input) => ({
          ...input,
          teams: [...input.teams, team({ roster_id: 3, losses: 1 })],
          matchups: [...input.matchups, game(1, 3, 2, 'L', 90), game(2, 3, 1)],
        }),
        /non-head-to-head/i,
      ],
      [
        'with a duplicate schedule row',
        (input) => ({ ...input, matchups: [...input.matchups, game(2, 1, 1)] }),
        /duplicate/i,
      ],
      [
        'when the official record disagrees with the finalized weeks',
        (input) => ({
          ...input,
          teams: input.teams.map((row) => (row.roster_id === 1 ? { ...row, wins: 2 } : row)),
        }),
        /record mismatch/i,
      ],
      [
        'when a finalized week is missing a result',
        (input) => ({
          ...input,
          matchups: input.matchups.map((row) =>
            row.week === 1 && row.roster_id === 2 ? { ...row, result: 'PENDING' as const } : row,
          ),
        }),
        /record mismatch/i,
      ],
      [
        'when PF is missing',
        (input) => ({
          ...input,
          teams: input.teams.map((row) =>
            row.roster_id === 2 ? { ...row, points_for: Number.NaN } : row,
          ),
        }),
        /missing official pf\/pa/i,
      ],
      [
        'when no week has been scored',
        (input) => ({
          ...input,
          teams: input.teams.map((row) => ({
            ...row,
            wins: 0,
            losses: 0,
            points_for: 0,
            points_against: 0,
          })),
          matchups: input.matchups.filter((row) => row.week === 2),
          finalizedThroughWeek: 0,
        }),
        /no finalized weekly scores/i,
      ],
    ];

    for (const [label, mutate, reason] of cases) {
      it(label, () => {
        const forecast = forecastPlayoffs(mutate(legacyFixture()));

        expect(forecast.simulations).toBe(0);
        expect(forecast.scenarios).toEqual([]);
        expect(forecast.note).toMatch(reason);
        for (const row of forecast.rows) {
          // Withheld is blank, never a 0% that would read as eliminated.
          expect(row.playoff_chance_pct).toBeNull();
          expect(row.status).toBe('UNAVAILABLE');
          expect(row.optimistic_min_wins).toBeNull();
          expect(row.guarantee_wins).toBeNull();
        }
      });
    }
  });

  describe('a completed regular season', () => {
    function finished(points: [number, number]): ForecastInput {
      return {
        teams: [
          team({ roster_id: 1, wins: 1, losses: 1, points_for: points[0], points_against: 100 }),
          team({ roster_id: 2, wins: 1, losses: 1, points_for: points[1], points_against: 100 }),
        ],
        matchups: [
          game(1, 1, 1, 'W', 150),
          game(1, 2, 1, 'L', 100),
          game(2, 1, 1, 'L', 90),
          game(2, 2, 1, 'W', 120),
        ],
        finalizedThroughWeek: 2,
        settings: settings(),
      };
    }

    it('seeds by PF without simulating', () => {
      const forecast = forecastPlayoffs(finished([240, 220]));

      expect(forecast.simulations).toBe(1);
      expect(forecast.rows.map((row) => row.playoff_chance_pct)).toEqual([100, 0]);
      expect(forecast.rows.every((row) => row.remaining_games === 0)).toBe(true);
    });

    it('leaves an exact final tie unresolved instead of trusting the coin', () => {
      const forecast = forecastPlayoffs(finished([240, 240]));

      expect(forecast.rows.map((row) => row.status)).toEqual([
        'EXACT_TIE_UNRESOLVED',
        'EXACT_TIE_UNRESOLVED',
      ]);
      expect(forecast.rows.map((row) => row.playoff_chance_pct)).toEqual([null, null]);
    });
  });
});

describe('playoffSettings', () => {
  it('reads the fixture league as a supported standard league', () => {
    expect(playoffSettings(fixtures.league, fixtures.rosters, leagueConfig.playoffSim)).toEqual({
      playoffTeams: 6,
      startWeek: 1,
      regularSeasonWeeks: 14,
      customSeeding: false,
      medianGames: false,
      divisions: false,
      simulations: 5000,
      seed: 20261004,
      teamSampleWeight: 0.7,
    });
  });

  it('flags custom seeding from Sleeper or from config', () => {
    const custom = {
      ...fixtures.league,
      settings: { ...fixtures.league.settings, playoff_seed_type: 1 },
    };
    expect(playoffSettings(custom, fixtures.rosters, leagueConfig.playoffSim).customSeeding).toBe(
      true,
    );
    expect(
      playoffSettings(fixtures.league, fixtures.rosters, {
        ...leagueConfig.playoffSim,
        customPlayoffRules: true,
      }).customSeeding,
    ).toBe(true);
  });

  it('flags divisions from league settings or a roster', () => {
    const divided = fixtures.rosters.map((roster, index) =>
      index === 0 ? { ...roster, settings: { ...roster.settings, division: 1 } } : roster,
    );
    expect(playoffSettings(fixtures.league, divided, leagueConfig.playoffSim).divisions).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Real fixtures against fixtures/golden
// ---------------------------------------------------------------------------

describe('2026 fixtures from week 4', () => {
  const teams = buildTeamRows({
    leagueId: LEAGUE,
    season: fixtures.FIXTURE_SEASON,
    rosters: fixtures.rosters,
    identities: buildIdentityIndex({ users: fixtures.users, rosters: fixtures.rosters }),
    syncedAt: SYNCED,
  });
  const finalized = fixtures.FINALIZED_WEEKS.length;
  const matchups = Array.from(
    { length: golden.asOf.regularSeasonWeeks },
    (_unused, index) => index + 1,
  ).flatMap((week) =>
    buildMatchupRows({
      leagueId: LEAGUE,
      week,
      matchups: fixtures.matchups(week),
      finalized: week <= finalized,
    }),
  );
  const forecast = forecastPlayoffs({
    teams,
    matchups,
    finalizedThroughWeek: finalized,
    settings: playoffSettings(fixtures.league, fixtures.rosters, leagueConfig.playoffSim),
  });

  function row(rosterId: number) {
    const found = forecast.rows.find((entry) => entry.roster_id === rosterId);
    if (found === undefined) throw new Error(`no forecast row for roster ${rosterId}`);
    return found;
  }

  it('runs 5,000 simulations over the real remaining schedule', () => {
    expect(forecast.note).not.toMatch(/withheld/i);
    expect(forecast.simulations).toBe(5000);
    for (const team of golden.teams)
      expect(row(team.rosterId).remaining_games).toBe(team.gamesLeft);
  });

  it('hands out exactly six seats per simulated season', () => {
    const total = forecast.rows.reduce((sum, entry) => sum + (entry.playoff_chance_pct ?? 0), 0);
    expect(Math.abs(total - 600)).toBeLessThan(0.15);
  });

  it("reproduces the sheet's Playoff % exactly, same seed and same stream", () => {
    for (const team of golden.teams) {
      expect(row(team.rosterId).playoff_chance_pct, team.team).toBe(team.playoffChancePct);
    }
  });

  it('places each team inside or outside the top 6 as the sheet did', () => {
    for (const team of golden.teams)
      expect(row(team.rosterId).position_now, team.team).toBe(team.positionNow);
  });

  it('proves no clinch or elimination with ten games left', () => {
    expect(forecast.rows.every((entry) => entry.status === 'OPEN')).toBe(true);
  });

  it('derives the record bounds by hand for the 4-0 and 0-4 teams', () => {
    // 4-0: rivals can reach at most 13 (the three 3-1s), 12 (seven 2-2s), 11,
    // 10. Thirteen wins leaves only three rivals able to match it, fewer than
    // six seats, so 9 more wins guarantee a spot and one loss is safe.
    const leader = golden.teams.find((team) => team.record === '4-0-0');
    expect(row(leader?.rosterId as number)).toMatchObject({
      guarantee_wins: 9,
      safe_losses: 1,
      optimistic_min_wins: 0,
    });

    // 0-4: eleven rivals already have more than one win, but only four have
    // more than two, so two more wins could be enough with every tiebreak
    // going its way. No rival is past ten yet, so the bound cannot eliminate;
    // nine more losses (a 1-13 finish) leave eleven rivals already ahead.
    expect(row(6)).toMatchObject({
      optimistic_min_wins: 2,
      guarantee_wins: null,
      safe_losses: null,
      losses_to_eliminate: 9,
    });
  });

  it('keeps every scenario within the remaining ten games', () => {
    expect(
      forecast.scenarios.every((entry) => entry.additional_wins + entry.additional_losses === 10),
    ).toBe(true);
    expect(forecast.scenarios).toHaveLength(14 * 11);
  });
});
