import { describe, expect, it } from 'vitest';
import * as fixtures from '../test-fixtures';
import { careerTotals } from '../history/career';
import { historySeasons, historyWeeks, type HistorySeason } from '../history/seasons';
import { buildBracketSlotRows } from '../normalize/brackets';
import { buildMatchupRows } from '../normalize/matchups';
import { buildTeamRows } from '../normalize/rosters';
import { buildIdentityIndex } from '../normalize/users';
import { seasonAnalytics } from '../metrics/analytics';
import { buildSeasonHistorySlice, combineHistory, type SeasonHistorySlice } from './history-slice';
import type { AsOf } from './model';

const NOW = new Date('2026-10-10T17:22:58.037Z');
const LEAGUE = fixtures.FIXTURE_LEAGUE_ID;

function fixtureMatchupMap(): Map<number, ReturnType<typeof fixtures.matchups>> {
  return new Map(fixtures.FINALIZED_WEEKS.map((week) => [week, fixtures.matchups(week)]));
}

describe('buildSeasonHistorySlice', () => {
  it('matches historySeasons/historyWeeks called directly on the same fixtures', () => {
    const slice = buildSeasonHistorySlice({
      league: fixtures.league,
      users: fixtures.users,
      rosters: fixtures.rosters,
      matchups: fixtureMatchupMap(),
      winnersBracket: fixtures.winnersBracket,
      scoredThroughWeek: 4,
      now: NOW,
    });

    const identities = buildIdentityIndex({ users: fixtures.users, rosters: fixtures.rosters });
    const teams = buildTeamRows({
      leagueId: LEAGUE,
      season: fixtures.FIXTURE_SEASON,
      rosters: fixtures.rosters,
      identities,
      syncedAt: NOW,
    });
    const scoredRows = fixtures.FINALIZED_WEEKS.flatMap((week) =>
      buildMatchupRows({ leagueId: LEAGUE, week, matchups: fixtures.matchups(week), finalized: true }),
    );
    const expectedSeasons = historySeasons({
      teams,
      analytics: seasonAnalytics(scoredRows),
      brackets: buildBracketSlotRows({
        leagueId: LEAGUE,
        bracket: 'winners',
        games: fixtures.winnersBracket,
      }),
      seasonComplete: false,
    });
    const expectedWeeks = historyWeeks({ season: fixtures.FIXTURE_SEASON, matchups: scoredRows, teams });

    expect(slice.seasons).toEqual(expectedSeasons);
    expect(slice.weeks).toEqual(expectedWeeks);
  });

  it('reads unplayed weeks as not scored, never as a zero result', () => {
    const slice = buildSeasonHistorySlice({
      league: fixtures.league,
      users: fixtures.users,
      rosters: fixtures.rosters,
      matchups: new Map([[1, fixtures.matchups(1)]]),
      winnersBracket: [],
      scoredThroughWeek: 0,
      now: NOW,
    });
    expect(slice.weeks).toEqual([]);
  });
});

describe('combineHistory', () => {
  const asOf: AsOf = {
    season: '2026',
    current_week: 5,
    finalized_through_week: 4,
    regular_season_weeks: 14,
    season_complete: false,
  };

  function season(overrides: Partial<HistorySeason> & { season: string; roster_id: number }): HistorySeason {
    return {
      league_id: overrides.season === '2025' ? 'old' : 'new',
      identity: `id-${overrides.roster_id}`,
      manager_name: `manager-${overrides.roster_id}`,
      team_name: `Team ${overrides.roster_id}`,
      season_complete: true,
      wins: 0,
      losses: 0,
      ties: 0,
      points_for: 0,
      points_against: 0,
      all_play_comparisons: 0,
      all_play_win_equivalents: 0,
      schedule_luck: 0,
      points_in_losses: 0,
      playoff_appearance: null,
      champion: null,
      championship_appearance: null,
      ...overrides,
    };
  }

  it('concatenates every season before computing career totals, instead of per-season', () => {
    const slices: SeasonHistorySlice[] = [
      {
        seasons: [season({ season: '2025', roster_id: 1, points_for: 300, wins: 2, losses: 1 })],
        weeks: [],
      },
      {
        seasons: [season({ season: '2026', roster_id: 1, points_for: 90, wins: 0, losses: 1 })],
        weeks: [],
      },
    ];
    const history = combineHistory({ slices, asOf, now: NOW });
    expect(history.seasons).toHaveLength(2);
    const career = history.careers.find((row) => row.identity === 'id-1');
    expect(career).toMatchObject({ points_for: 390, wins: 2, losses: 2, seasons_observed: 2 });
  });

  it('carries the current season as-of stamp onto the combined dashboard', () => {
    const history = combineHistory({ slices: [], asOf, now: NOW });
    expect(history.as_of).toEqual(asOf);
    expect(history.seasons).toEqual([]);
    expect(history.careers).toEqual(careerTotals([]));
  });
});
