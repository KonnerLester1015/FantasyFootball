import { describe, expect, it } from 'vitest';

import type { PlayerScoreRow } from '../normalize/matchups';
import type { PlayerRow } from '../normalize/players';
import { positionLeaders } from './leaders';

const player = (player_id: string, position: string | null, full_name: string | null): PlayerRow => ({
  $id: player_id,
  player_id,
  full_name,
  position,
  fantasy_positions: position ? [position] : [],
  team: null,
  status: null,
  age: null,
  synced_at: '2026-10-10T00:00:00.000Z',
});

const score = (
  week: number,
  roster_id: number,
  player_id: string,
  points: number | null,
  started = true,
): PlayerScoreRow => ({
  $id: `${week}_${roster_id}_${player_id}`,
  league_id: 'L',
  week,
  roster_id,
  player_id,
  points,
  started,
  slot: started ? 'FLEX' : null,
});

const players = [
  player('q1', 'QB', 'Zed Passer'),
  player('q2', 'QB', 'Abe Thrower'),
  player('r1', 'RB', 'Runs Fast'),
  player('k1', 'K', 'Big Leg'),
  player('x1', null, 'No Position'),
];

const cell = (rows: ReturnType<typeof positionLeaders>, week: number, position: string) =>
  rows.find((row) => row.week === week)?.positions.find((p) => p.position === position);

describe('positionLeaders', () => {
  it('lists every card position for every week, in display order', () => {
    const rows = positionLeaders({ weeks: [1, 2], playerScores: [], players });
    expect(rows.map((row) => row.week)).toEqual([1, 2]);
    expect(rows[0]!.positions.map((p) => p.position)).toEqual(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);
  });

  it('picks the top score per position and week, bench players included', () => {
    const rows = positionLeaders({
      weeks: [1, 2],
      playerScores: [
        score(1, 1, 'q1', 20.5),
        score(1, 2, 'q2', 31.4, false),
        score(1, 3, 'r1', 12),
        score(2, 1, 'q1', 9),
      ],
      players,
    });
    expect(cell(rows, 1, 'QB')!.leaders).toEqual([
      { player_id: 'q2', name: 'Abe Thrower', roster_id: 2, points: 31.4, started: false },
    ]);
    expect(cell(rows, 1, 'RB')!.leaders[0]!.points).toBe(12);
    expect(cell(rows, 2, 'QB')!.leaders[0]!.player_id).toBe('q1');
  });

  it('keeps every tied leader, ordered by name', () => {
    const rows = positionLeaders({
      weeks: [1],
      playerScores: [score(1, 1, 'q1', 22), score(1, 2, 'q2', 22)],
      players,
    });
    expect(cell(rows, 1, 'QB')!.leaders.map((l) => l.name)).toEqual(['Abe Thrower', 'Zed Passer']);
  });

  it('keeps a negative top score, which is a real number', () => {
    const rows = positionLeaders({ weeks: [1], playerScores: [score(1, 1, 'k1', -1)], players });
    expect(cell(rows, 1, 'K')!.leaders[0]!.points).toBe(-1);
  });

  it('leaves a position empty, not zero, when nobody there has a score', () => {
    const rows = positionLeaders({
      weeks: [1],
      playerScores: [score(1, 1, 'q1', null), score(1, 1, 'x1', 40), score(1, 1, 'unknown', 50)],
      players,
    });
    expect(cell(rows, 1, 'QB')!.leaders).toEqual([]);
    expect(rows[0]!.positions.every((p) => p.leaders.length === 0)).toBe(true);
  });
});
