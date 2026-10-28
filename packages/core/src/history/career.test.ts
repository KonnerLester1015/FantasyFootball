import { describe, expect, it } from 'vitest';

import golden from '../../../../fixtures/golden/2026-through-week-04.json';
import { seasonAnalytics } from '../metrics/analytics';
import { buildBracketSlotRows, type BracketSlotRow } from '../normalize/brackets';
import { buildMatchupRows } from '../normalize/matchups';
import { buildTeamRows } from '../normalize/rosters';
import { buildIdentityIndex } from '../normalize/users';
import * as fixtures from '../test-fixtures';
import { careerTotals, luckTable, type CareerRow } from './career';
import { historyIdentity } from './identity';
import { historySeasons, type HistorySeason } from './seasons';

/**
 * Identity, the season layer and career totals — docs/REBUILD_PLAN.md §2h.
 *
 *  1. Identity and career rules on hand-built seasons, including the legacy
 *     suite's two-league career fixture (reference/legacy/redraft_tests.js:52-60):
 *     a manager who changes roster slot keeps one career, a replacement owner
 *     in the same slot starts a new one.
 *  2. The real 2026 fixtures against the sheet's career table and luck table
 *     (fixtures/golden). One season exists, so career equals season.
 */

const LEAGUE = fixtures.FIXTURE_LEAGUE_ID;
const SYNCED = new Date('2026-10-09T10:14:12.389Z');

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

describe('historyIdentity', () => {
  it('follows the Sleeper account across leagues and roster slots', () => {
    expect(historyIdentity('league1', 1, 'manager-a')).toBe(
      historyIdentity('league2', 9, 'manager-a'),
    );
  });

  it('starts a new identity when a different account takes the same slot', () => {
    expect(historyIdentity('league1', 1, 'manager-a')).not.toBe(
      historyIdentity('league2', 1, 'manager-b'),
    );
  });

  it('scopes an unowned roster to its league, so two seasons never merge', () => {
    expect(historyIdentity('league1', 3, null)).toBe('unowned:league1:3');
    expect(historyIdentity('league1', 3, null)).not.toBe(historyIdentity('league2', 3, null));
  });

  it('fits the 32-character identity column for a real league ID', () => {
    expect(historyIdentity(LEAGUE, 14, null).length).toBeLessThanOrEqual(32);
  });
});

// ---------------------------------------------------------------------------
// Hand-built seasons
// ---------------------------------------------------------------------------

function season(
  overrides: Partial<HistorySeason> & {
    league_id: string;
    season: string;
    roster_id: number;
    identity: string;
  },
): HistorySeason {
  return {
    manager_name: overrides.identity,
    team_name: `Team ${overrides.identity}`,
    season_complete: false,
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

/** The legacy career fixture, field for field (reference/legacy/redraft_tests.js:54-59). */
function legacySeasons(): HistorySeason[] {
  return [
    season({
      league_id: 'old',
      season: '2025',
      roster_id: 1,
      identity: 'a',
      team_name: 'Old team',
      season_complete: true,
      wins: 2,
      losses: 1,
      points_for: 300,
      points_against: 270,
      playoff_appearance: true,
      champion: true,
      championship_appearance: true,
    }),
    season({
      league_id: 'old',
      season: '2025',
      roster_id: 2,
      identity: 'b',
      team_name: 'B',
      season_complete: true,
      wins: 1,
      losses: 2,
      points_for: 270,
      points_against: 300,
      playoff_appearance: true,
      champion: false,
      championship_appearance: true,
    }),
    season({
      league_id: 'new',
      season: '2026',
      roster_id: 9,
      identity: 'a',
      team_name: 'New team',
      losses: 1,
      points_for: 90,
      points_against: 110,
    }),
    season({
      league_id: 'new',
      season: '2026',
      roster_id: 1,
      identity: 'c',
      team_name: 'Replacement',
      wins: 1,
      points_for: 110,
      points_against: 90,
    }),
  ];
}

function career(rows: readonly CareerRow[], identity: string): CareerRow {
  const found = rows.find((row) => row.identity === identity);
  if (found === undefined) throw new Error(`no career for ${identity}`);
  return found;
}

describe('careerTotals', () => {
  const careers = careerTotals(legacySeasons());

  it('adds one manager’s seasons across a slot change', () => {
    expect(career(careers, 'a')).toMatchObject({
      record: '2-2-0',
      wins: 2,
      losses: 2,
      ties: 0,
      win_pct: 50,
      points_for: 390,
      points_against: 380,
      avg_pf_per_game: 97.5,
      seasons_observed: 2,
      completed_seasons: 1,
      titles: 1,
      championship_appearances: 1,
      playoff_appearances: 1,
    });
  });

  it('keeps the newest team name', () => {
    expect(career(careers, 'a').team_name).toBe('New team');
  });

  it('gives a replacement owner in the same slot a separate career', () => {
    expect(career(careers, 'c')).toMatchObject({
      record: '1-0-0',
      seasons_observed: 1,
    });
  });

  it('counts the lowest-PF completed seasons, and not an incomplete one', () => {
    expect(career(careers, 'b').lowest_pf_seasons).toBe(1);
    // 'a' scored 90 in the unfinished 2026 season, below 'c' — not counted yet.
    expect(career(careers, 'a').lowest_pf_seasons).toBe(0);
  });

  it('counts last-place record finishes in completed seasons', () => {
    expect(career(careers, 'b').last_place_finishes).toBe(1);
    expect(career(careers, 'a').last_place_finishes).toBe(0);
  });

  it('counts titles and playoffs only from completed seasons', () => {
    const unfinished = careerTotals([
      season({
        league_id: 'x',
        season: '2026',
        roster_id: 1,
        identity: 'z',
        champion: null,
        playoff_appearance: null,
      }),
    ]);
    expect(unfinished[0]).toMatchObject({
      titles: 0,
      playoff_appearances: 0,
      completed_seasons: 0,
    });
  });

  it('weights career all-play by comparisons and adds luck across seasons', () => {
    const rows = careerTotals([
      season({
        league_id: 'x',
        season: '2025',
        roster_id: 1,
        identity: 'z',
        all_play_comparisons: 26,
        all_play_win_equivalents: 13,
        schedule_luck: 0.5,
      }),
      season({
        league_id: 'y',
        season: '2026',
        roster_id: 4,
        identity: 'z',
        all_play_comparisons: 13,
        all_play_win_equivalents: 13,
        schedule_luck: -1.25,
      }),
    ]);
    expect(rows[0]).toMatchObject({ all_play_pct: 66.67, expected_wins: 26, luck_wins: -0.75 });
  });

  it('blanks career luck when any season’s luck is unobserved', () => {
    const rows = careerTotals([
      season({ league_id: 'x', season: '2025', roster_id: 1, identity: 'z', schedule_luck: 1 }),
      season({ league_id: 'y', season: '2026', roster_id: 1, identity: 'z', schedule_luck: null }),
    ]);
    expect(rows[0]?.luck_wins).toBeNull();
  });

  it('blanks win % and per-game averages before the first game', () => {
    const rows = careerTotals([
      season({ league_id: 'x', season: '2026', roster_id: 1, identity: 'z' }),
    ]);
    expect(rows[0]).toMatchObject({ win_pct: null, avg_pf_per_game: null, avg_pa_per_game: null });
  });

  it('ignores a duplicated season row', () => {
    const rows = careerTotals([...legacySeasons(), legacySeasons()[0] as HistorySeason]);
    expect(career(rows, 'a').points_for).toBe(390);
  });

  it('orders careers by record, then PF', () => {
    expect(careers.map((row) => row.identity)).toEqual(['c', 'a', 'b']);
  });
});

describe('historySeasons', () => {
  const base = {
    teams: buildTeamRows({
      leagueId: 'L',
      season: '2026',
      rosters: fixtures.rosters.slice(0, 2),
      identities: buildIdentityIndex({ users: fixtures.users, rosters: fixtures.rosters }),
      syncedAt: SYNCED,
    }),
    analytics: [],
  };
  const title = (overrides: Partial<BracketSlotRow>): BracketSlotRow => ({
    $id: 'L_winners_06',
    league_id: 'L',
    bracket: 'winners',
    round: 3,
    game: 6,
    team1_roster_id: 1,
    team2_roster_id: 2,
    team1_from: null,
    team2_from: null,
    winner_roster_id: null,
    loser_roster_id: null,
    placement: 1,
    ...overrides,
  });

  it('reads champion, finalist and playoff appearance once the season is complete', () => {
    const rows = historySeasons({
      ...base,
      brackets: [title({ winner_roster_id: 2, loser_roster_id: 1 })],
      seasonComplete: true,
    });
    expect(
      rows.map((row) => [
        row.roster_id,
        row.champion,
        row.championship_appearance,
        row.playoff_appearance,
      ]),
    ).toEqual([
      [1, false, true, true],
      [2, true, true, true],
    ]);
  });

  it('leaves postseason facts unknown while the season is running', () => {
    const rows = historySeasons({
      ...base,
      brackets: [title({ winner_roster_id: 2 })],
      seasonComplete: false,
    });
    expect(rows.every((row) => row.champion === null && row.playoff_appearance === null)).toBe(
      true,
    );
  });

  it('keys each season on the owner’s Sleeper user ID', () => {
    const rows = historySeasons({ ...base, brackets: [], seasonComplete: false });
    expect(rows.map((row) => row.identity)).toEqual(base.teams.map((team) => team.owner_id));
  });
});

// ---------------------------------------------------------------------------
// Real fixtures against fixtures/golden
// ---------------------------------------------------------------------------

describe('2026 career through week 4', () => {
  const teams = buildTeamRows({
    leagueId: LEAGUE,
    season: fixtures.FIXTURE_SEASON,
    rosters: fixtures.rosters,
    identities: buildIdentityIndex({ users: fixtures.users, rosters: fixtures.rosters }),
    syncedAt: SYNCED,
  });
  const matchups = fixtures.FINALIZED_WEEKS.flatMap((week) =>
    buildMatchupRows({
      leagueId: LEAGUE,
      week,
      matchups: fixtures.matchups(week),
      finalized: true,
    }),
  );
  const seasons = historySeasons({
    teams,
    analytics: seasonAnalytics(matchups),
    brackets: buildBracketSlotRows({
      leagueId: LEAGUE,
      bracket: 'winners',
      games: fixtures.winnersBracket,
    }),
    seasonComplete: false,
  });
  const careers = careerTotals(seasons);

  function forRoster(rosterId: number): CareerRow {
    const owner = teams.find((team) => team.roster_id === rosterId)?.owner_id;
    return career(careers, owner as string);
  }

  it('has one career per manager, keyed on the Sleeper user ID', () => {
    expect(careers).toHaveLength(14);
    expect(new Set(careers.map((row) => row.identity))).toEqual(
      new Set(teams.map((team) => team.owner_id)),
    );
  });

  it('matches every team’s record, win %, PF, PA, all-play % and luck', () => {
    for (const team of golden.teams) {
      const row = forRoster(team.rosterId);
      expect(
        [
          row.record,
          row.win_pct,
          row.points_for,
          row.points_against,
          row.all_play_pct,
          row.luck_wins,
        ],
        team.team,
      ).toEqual([
        team.record,
        ((team.wins + team.ties / 2) / (team.wins + team.losses + team.ties)) * 100,
        team.pf,
        team.pa,
        team.allPlayPct,
        team.scheduleLuck,
      ]);
    }
  });

  it('shows no titles or playoff appearances mid-season, as the sheet does', () => {
    expect(careers.every((row) => row.titles === 0 && row.playoff_appearances === 0)).toBe(true);
  });

  it('matches the sheet’s luck table', () => {
    const table = luckTable(seasons, careers);
    const names = (holders: { team_name: string }[]) => holders.map((holder) => holder.team_name);

    expect([names(table.luckiest_season.holders), table.luckiest_season.value]).toEqual([
      [golden.luck.luckiestSeason.team],
      golden.luck.luckiestSeason.value,
    ]);
    expect([names(table.unluckiest_season.holders), table.unluckiest_season.value]).toEqual([
      [golden.luck.unluckiestSeason.team],
      golden.luck.unluckiestSeason.value,
    ]);
    expect([names(table.most_points_in_losses.holders), table.most_points_in_losses.value]).toEqual(
      [[golden.luck.mostPointsInLosses.team], golden.luck.mostPointsInLosses.value],
    );
    expect([
      names(table.most_career_points_against.holders),
      table.most_career_points_against.value,
    ]).toEqual([
      [golden.luck.mostCareerPointsAgainst.team],
      golden.luck.mostCareerPointsAgainst.value,
    ]);
    // One season: the career extremes are the season extremes.
    expect(table.luckiest_career.value).toBe(golden.luck.luckiestSeason.value);
    expect(table.unluckiest_career.value).toBe(golden.luck.unluckiestSeason.value);
    expect(table.biggest_season_swing.value).toBe(golden.luck.luckiestSeason.value);
  });
});
