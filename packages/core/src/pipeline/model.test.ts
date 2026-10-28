import { describe, expect, it } from 'vitest';

import golden from '../../../../fixtures/golden/2026-through-week-04.json';
import leagueConfig from '../../../../config/league.json';
import * as fixtures from '../test-fixtures';
import { trimPlayerDictionary } from '../normalize/players';
import { diffAgainstGolden, type GoldenFile } from './golden';
import { buildSeasonModel, type SeasonModelInput } from './model';

/**
 * The composed pipeline against fixtures/golden.
 *
 * Every module already has its own golden test; this one proves the wiring:
 * that the pipeline hands each module the scope it was tested under (scored
 * regular weeks for standings and luck, the full schedule for the playoff
 * model). A wrong scope anywhere shows up as a named field in the diff, not as
 * a silently different number on one tab.
 */

const NOW = new Date('2026-10-10T17:22:58.037Z');

function input(overrides: Partial<SeasonModelInput> = {}): SeasonModelInput {
  const weeks = Array.from({ length: 14 }, (_unused, index) => index + 1);
  return {
    league: fixtures.league,
    users: fixtures.users,
    rosters: fixtures.rosters,
    matchups: new Map(weeks.map((week) => [week, fixtures.matchups(week)])),
    transactions: new Map([0, 1, 2, 3, 4, 5].map((week) => [week, fixtures.transactions(week)])),
    winnersBracket: fixtures.winnersBracket,
    losersBracket: fixtures.losersBracket,
    draft: fixtures.draft,
    draftPicks: fixtures.draftPicks,
    players: fixtures.players,
    playersSyncedAt: NOW,
    scoredThroughWeek: 4,
    currentWeek: 5,
    frozenWeeks: new Map(),
    rules: {
      playoffSim: leagueConfig.playoffSim,
    },
    now: NOW,
    coreVersion: 'test',
    ...overrides,
  };
}

describe('buildSeasonModel on the 2026 fixtures through week 4', () => {
  const model = buildSeasonModel(input());

  it('reproduces every golden number', () => {
    const diff = diffAgainstGolden(golden as unknown as GoldenFile, {
      current: model.dashboards.current,
      history: model.dashboards.history,
    });
    expect(diff).toEqual([]);
  });

  it('is deterministic, so a re-run replaces rows with identical ones', () => {
    expect(JSON.stringify(buildSeasonModel(input()))).toBe(JSON.stringify(model));
  });

  it('writes one dashboard row per public view with deterministic ids', () => {
    expect(model.dashboardRows.map((row) => row.$id)).toEqual([
      '1390575664880418816_current',
      '1390575664880418816_history',
      '1390575664880418816_playoffs',
      '1390575664880418816_summary',
    ]);
    expect(model.dashboardRows.every((row) => row.finalized_through_week === 4)).toBe(true);
  });

  it('leaves the live week pending and unsolved, not zero', () => {
    const live = model.tables.matchups.filter((row) => row.week === 5);
    expect(live).toHaveLength(14);
    expect(live.every((row) => row.result === 'PENDING')).toBe(true);
    expect(live.every((row) => row.optimal_points === null && row.all_play_pct === null)).toBe(
      true,
    );
  });

  it('marks the optimal starters, which sum to the team Max PF', () => {
    const team = model.tables.teams.find((row) => row.roster_id === 1);
    const optimal = model.tables.player_scores
      .filter((row) => row.roster_id === 1 && row.week <= 4 && row.optimal_starter)
      .reduce((sum, row) => sum + (row.points ?? 0), 0);
    expect(Math.round(optimal * 100) / 100).toBe(team?.max_pf_calculated);
  });

  it('records weeks as scored, not frozen, until a finalize run freezes them', () => {
    const week4 = model.tables.weeks.find((row) => row.week === 4);
    expect(week4).toMatchObject({ scores_complete: true, finalized: false, finalized_at: null });
    const frozen = buildSeasonModel(
      input({ frozenWeeks: new Map([[4, '2026-10-06T13:00:00.000Z']]) }),
    ).tables.weeks.find((row) => row.week === 4);
    expect(frozen).toMatchObject({ finalized: true, finalized_at: '2026-10-06T13:00:00.000Z' });
  });

  it('only stores players the league touched', () => {
    expect(model.tables.players.length).toBeGreaterThan(200);
    expect(model.tables.players.length).toBeLessThanOrEqual(Object.keys(fixtures.players).length);
  });

  it('counts completed add-transactions per manager', () => {
    const total = model.dashboards.current.teams.reduce(
      (sum, team) => sum + team.add_transactions,
      0,
    );
    expect(total).toBeGreaterThan(0);
  });

  it('summarizes the latest scored week', () => {
    const { summary } = model.dashboards;
    expect(summary.week).toBe(4);
    expect(summary.teams).toHaveLength(14);
    expect(summary.cards.high_score.length).toBeGreaterThan(0);
  });

  it('names the top rostered scorer at each position for every scored week', () => {
    const { position_leaders } = model.dashboards.summary;
    expect(position_leaders.map((row) => row.week)).toEqual([1, 2, 3, 4]);
    // Read by hand from fixtures/sleeper/matchups-w04.json + players.json.
    const week4 = Object.fromEntries(
      position_leaders[3]!.positions.map((cell) => [
        cell.position,
        cell.leaders.map(({ name, roster_id, points, started }) => ({ name, roster_id, points, started })),
      ]),
    );
    expect(week4).toEqual({
      QB: [{ name: 'Drake Maye', roster_id: 3, points: 27.16, started: false }],
      RB: [{ name: 'Kyren Williams', roster_id: 3, points: 36.7, started: true }],
      WR: [{ name: 'Tetairoa McMillan', roster_id: 1, points: 45.2, started: true }],
      TE: [{ name: 'T.J. Hockenson', roster_id: 10, points: 24.9, started: false }],
      K: [{ name: 'Will Reichard', roster_id: 12, points: 19, started: true }],
      DEF: [{ name: 'Seattle Seahawks', roster_id: 5, points: 12, started: true }],
    });
  });

  it('names team defenses, which Sleeper gives no full_name', () => {
    expect(fixtures.players['SEA']?.full_name).toBeUndefined();
    expect(model.tables.players.find((row) => row.player_id === 'SEA')?.full_name).toBe(
      'Seattle Seahawks',
    );
    expect(trimPlayerDictionary(fixtures.players)['SEA']?.full_name).toBe('Seattle Seahawks');
  });
});
