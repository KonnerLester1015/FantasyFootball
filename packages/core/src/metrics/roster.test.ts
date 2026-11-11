import { describe, expect, it } from 'vitest';

import type { PlayerScoreRow } from '../normalize/matchups';
import type { PlayerRow } from '../normalize/players';
import type { TeamRow } from '../normalize/rosters';
import { rosterSeasons, teamLineups } from './roster';

const player = (player_id: string, position: string, full_name: string): PlayerRow => ({
  $id: player_id,
  player_id,
  full_name,
  position,
  fantasy_positions: [position],
  team: 'KC',
  status: 'Active',
  age: null,
  synced_at: '2026-10-10T00:00:00.000Z',
});

const score = (
  week: number,
  roster_id: number,
  player_id: string,
  points: number | null,
  slot: string | null,
  optimal_starter = false,
): PlayerScoreRow & { optimal_starter: boolean } => ({
  $id: `${week}_${roster_id}_${player_id}`,
  league_id: 'L',
  week,
  roster_id,
  player_id,
  points,
  started: slot !== null,
  slot,
  optimal_starter,
});

const team = (roster_id: number, players: string[], starters: string[], reserve: string[] = []): TeamRow => ({
  $id: String(roster_id),
  league_id: 'L',
  season: '2026',
  roster_id,
  owner_id: null,
  manager_name: 'M',
  team_name: `Team ${roster_id}`,
  wins: 0,
  losses: 0,
  ties: 0,
  points_for: 0,
  points_against: 0,
  max_pf_sleeper: null,
  players,
  starters,
  reserve,
  taxi: [],
  synced_at: '2026-10-10T00:00:00.000Z',
});

const players = [
  player('q1', 'QB', 'Quinn Arm'),
  player('r1', 'RB', 'Rex Legs'),
  player('r2', 'RB', 'Ray Bench'),
  player('w1', 'WR', 'Will Hands'),
];

describe('teamLineups', () => {
  const rows = [
    score(1, 1, 'q1', 20, 'QB', true),
    score(1, 1, 'r1', 5, 'RB', false),
    score(1, 1, 'r2', 12, null, true),
    score(1, 1, 'w1', 3, null, false),
    score(2, 1, 'q1', 8, 'QB', true),
    score(3, 1, 'q1', 4, 'QB', true),
  ];

  it('keeps starters in slot order and sorts the bench by points', () => {
    const [week1] = teamLineups({ weeks: [1], liveWeek: null, playerScores: rows, players });
    expect(week1!.players.map((p) => p.player_id)).toEqual(['q1', 'r1', 'r2', 'w1']);
    expect(week1!.players[2]).toMatchObject({ name: 'Ray Bench', started: false, optimal_starter: true });
    expect(week1!.live).toBe(false);
  });

  it('only covers the weeks handed in, and never flags a live week as optimal', () => {
    const lineups = teamLineups({ weeks: [1, 3], liveWeek: 3, playerScores: rows, players });
    expect(lineups.map((l) => l.week)).toEqual([1, 3]);
    expect(lineups[1]).toMatchObject({ live: true });
    expect(lineups[1]!.players[0]!.optimal_starter).toBe(false);
  });
});

describe('rosterSeasons', () => {
  const rows = [
    score(1, 1, 'q1', 20, 'QB'),
    score(1, 1, 'r1', 5, 'RB'),
    score(1, 1, 'r2', 12, null),
    score(2, 1, 'q1', 8.25, 'QB'),
    score(2, 1, 'r1', null, 'RB'),
    score(2, 1, 'w1', 30, 'WR'),
    score(1, 2, 'w1', 99, 'WR'),
  ];
  // w1 scored for roster 1 in week 2 but has since left; r2 is on IR.
  const [view] = rosterSeasons({
    teams: [team(1, ['q1', 'r1', 'r2'], ['q1', 'r1'], ['r2'])],
    playerScores: rows,
    players,
  });

  it('sums only this roster’s rows, splitting started points from the bench', () => {
    const q1 = view!.players.find((p) => p.player_id === 'q1');
    expect(q1).toMatchObject({ status: 'starter', started_points: 28.25, total_points: 28.25, weeks_started: 2 });
    const r2 = view!.players.find((p) => p.player_id === 'r2');
    expect(r2).toMatchObject({ status: 'reserve', started_points: null, total_points: 12, weeks_started: 0 });
  });

  it('treats an unscored week as blank, not zero', () => {
    const r1 = view!.players.find((p) => p.player_id === 'r1');
    expect(r1).toMatchObject({ started_points: 5, weeks_started: 2, weeks_rostered: 2 });
  });

  it('keeps former players after the current roster, and ignores their other teams', () => {
    expect(view!.players.map((p) => p.player_id)).toEqual(['q1', 'r1', 'r2', 'w1']);
    expect(view!.players.at(-1)).toMatchObject({ status: 'gone', started_points: 30 });
  });

  it('keeps starters in lineup order rather than by points', () => {
    const [ordered] = rosterSeasons({
      teams: [team(1, ['q1', 'r1'], ['r1', 'q1'])],
      playerScores: rows,
      players,
    });
    expect(ordered!.players.slice(0, 2).map((p) => p.player_id)).toEqual(['r1', 'q1']);
  });

  it('picks the top started scorer per position, or none', () => {
    const mvp = Object.fromEntries(view!.mvps.map((m) => [m.position, m.player_id]));
    expect(mvp).toEqual({ QB: 'q1', RB: 'r1', WR: 'w1', TE: null, K: null, DEF: null });
  });
});
