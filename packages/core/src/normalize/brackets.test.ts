import { describe, expect, it } from 'vitest';
import {
  bracketSlotLabel,
  bracketSourceLabel,
  bracketSourceToken,
  buildBracketSlotRows,
  parseBracketSource,
  type BracketSlotRow,
} from './brackets';
import { buildIdentityIndex } from './users';
import * as fixtures from '../test-fixtures';

const LEAGUE = fixtures.FIXTURE_LEAGUE_ID;

const winners = buildBracketSlotRows({
  leagueId: LEAGUE,
  bracket: 'winners',
  games: fixtures.winnersBracket,
});

const losers = buildBracketSlotRows({
  leagueId: LEAGUE,
  bracket: 'losers',
  games: fixtures.losersBracket,
});

function game(rows: readonly BracketSlotRow[], number: number): BracketSlotRow {
  const found = rows.find((row) => row.game === number);
  if (found === undefined) throw new Error(`no bracket row for game ${number}`);
  return found;
}

// The Sheets version this replaced printed "Loser of game undefined" in
// future rounds. The fix is to store the reference explicitly, as a token
// that cannot read back as `undefined`.
describe('bracketSourceToken', () => {
  it('names the winner or the loser of a specific earlier game', () => {
    expect(bracketSourceToken({ w: 1 })).toBe('winner_of_game_1');
    expect(bracketSourceToken({ l: 4 })).toBe('loser_of_game_4');
    expect(bracketSourceToken({ w: 12 })).toBe('winner_of_game_12');
  });

  it('returns null for a slot with no source, rather than a string with undefined in it', () => {
    expect(bracketSourceToken(null)).toBeNull();
    expect(bracketSourceToken(undefined)).toBeNull();
    expect(bracketSourceToken({})).toBeNull();
    expect(bracketSourceToken({ w: null })).toBeNull();
  });

  it('fits the 32-character column for any plausible game number', () => {
    expect((bracketSourceToken({ w: 9999 }) ?? '').length).toBeLessThanOrEqual(32);
  });
});

describe('parseBracketSource', () => {
  it('round-trips every token the normalizer writes', () => {
    expect(parseBracketSource('winner_of_game_1')).toEqual({ kind: 'winner', game: 1 });
    expect(parseBracketSource('loser_of_game_12')).toEqual({ kind: 'loser', game: 12 });
  });

  it('returns null for an absent or unrecognised token instead of guessing', () => {
    expect(parseBracketSource(null)).toBeNull();
    expect(parseBracketSource('')).toBeNull();
    expect(parseBracketSource('winner_of_game_')).toBeNull();
    expect(parseBracketSource('something_else')).toBeNull();
  });
});

describe('buildBracketSlotRows', () => {
  it('returns one row per game, keyed on league, bracket and game', () => {
    expect(winners).toHaveLength(7);
    expect(losers).toHaveLength(12);
    expect(game(winners, 1).$id).toBe(`${LEAGUE}_winners_01`);
    expect(game(losers, 12).$id).toBe(`${LEAGUE}_losers_12`);
  });

  it('keeps the two brackets apart', () => {
    expect(game(winners, 1).bracket).toBe('winners');
    expect(game(losers, 1).bracket).toBe('losers');
    expect(game(winners, 1).$id).not.toBe(game(losers, 1).$id);
  });

  it('carries the round and the already-seeded teams', () => {
    expect(game(winners, 1)).toMatchObject({
      round: 1,
      team1_roster_id: 12,
      team2_roster_id: 14,
      team1_from: null,
      team2_from: null,
    });
  });

  it('resolves a future slot to the game it comes from', () => {
    expect(game(winners, 3)).toMatchObject({
      round: 2,
      team1_roster_id: 4,
      team2_roster_id: null,
      team2_from: 'winner_of_game_1',
    });

    expect(game(winners, 7)).toMatchObject({
      team1_from: 'loser_of_game_3',
      team2_from: 'loser_of_game_4',
    });
  });

  it('leaves winner and loser null while a game is undecided', () => {
    for (const row of [...winners, ...losers]) {
      expect(row.winner_roster_id).toBeNull();
      expect(row.loser_roster_id).toBeNull();
    }
  });

  it('marks the placement games', () => {
    expect(game(winners, 6).placement).toBe(1);
    expect(game(winners, 7).placement).toBe(3);
    expect(game(winners, 5).placement).toBe(5);
    expect(game(winners, 1).placement).toBeNull();

    expect(game(losers, 9).placement).toBe(1);
    expect(game(losers, 12).placement).toBe(7);
  });

  it('describes the real league structure: 6 playoff teams with 2 byes, 8 in consolation', () => {
    const firstRound = winners.filter((row) => row.round === 1);
    const seeded = new Set(
      winners
        .flatMap((row) => [row.team1_roster_id, row.team2_roster_id])
        .filter((id) => id !== null),
    );

    expect(firstRound).toHaveLength(2);
    expect(seeded.size).toBe(6);
    expect(
      new Set(
        losers
          .filter((row) => row.round === 1)
          .flatMap((row) => [row.team1_roster_id, row.team2_roster_id]),
      ).size,
    ).toBe(8);
  });

  it('records a decided game', () => {
    const [row] = buildBracketSlotRows({
      leagueId: LEAGUE,
      bracket: 'winners',
      games: [{ r: 3, m: 6, t1: 4, t2: 10, w: 4, l: 10, p: 1 }],
    });

    expect(row).toMatchObject({
      winner_roster_id: 4,
      loser_roster_id: 10,
      placement: 1,
    });
  });

  it('returns nothing for a bracket Sleeper has not published yet', () => {
    expect(buildBracketSlotRows({ leagueId: LEAGUE, bracket: 'winners', games: [] })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Slot labels — the half of the bracket a reader actually sees
// ---------------------------------------------------------------------------

const identities = buildIdentityIndex({ users: fixtures.users, rosters: fixtures.rosters });

/** The display name the dashboards use; fails loudly for a roster the league lacks. */
function teamName(rosterId: number): string {
  const identity = identities.get(rosterId);
  if (identity === undefined) throw new Error(`no identity for roster ${rosterId}`);
  return identity.teamName;
}

/** Both slot labels for one game, team 1 first. */
function labels(rows: readonly BracketSlotRow[], number: number): [string | null, string | null] {
  const slot = game(rows, number);
  return [
    bracketSlotLabel({ slot, side: 'team1', bracket: rows, teamName }),
    bracketSlotLabel({ slot, side: 'team2', bracket: rows, teamName }),
  ];
}

describe('bracketSourceLabel', () => {
  it('reads a token back as "Winner of game N" or "Loser of game N"', () => {
    expect(bracketSourceLabel('winner_of_game_3')).toBe('Winner of game 3');
    expect(bracketSourceLabel('loser_of_game_12')).toBe('Loser of game 12');
  });

  it('returns null rather than a label with a missing game number', () => {
    expect(bracketSourceLabel(null)).toBeNull();
    expect(bracketSourceLabel('loser_of_game_')).toBeNull();
    expect(bracketSourceLabel('undefined')).toBeNull();
  });

  it('labels a source by the key that carries a game, not by which key exists', () => {
    // The legacy test was `from.w !== undefined`: a source shaped
    // { w: null, l: 2 } became "Winner of game 2". The token keys on the
    // non-null half.
    expect(bracketSourceLabel(bracketSourceToken({ w: null, l: 2 }))).toBe('Loser of game 2');
    expect(bracketSourceLabel(bracketSourceToken({ w: 1, l: null }))).toBe('Winner of game 1');
  });
});

describe('bracketSlotLabel on the real 2026 brackets', () => {
  it('labels every unfilled slot from its own source, in both brackets', () => {
    for (const [rows, raw] of [
      [winners, fixtures.winnersBracket],
      [losers, fixtures.losersBracket],
    ] as const) {
      for (const source of raw) {
        for (const side of ['t1', 't2'] as const) {
          if (source[side] !== null && source[side] !== undefined) continue;
          const from = source[`${side}_from`];
          const expected =
            from?.w !== null && from?.w !== undefined
              ? `Winner of game ${from.w}`
              : `Loser of game ${from?.l}`;
          const [team1, team2] = labels(rows, source.m);
          expect(side === 't1' ? team1 : team2, `game ${source.m} ${side}`).toBe(expected);
        }
      }
    }
  });

  it('never prints undefined, null or NaN in any slot', () => {
    for (const rows of [winners, losers]) {
      for (const row of rows) {
        for (const label of labels(rows, row.game)) {
          expect(label, `game ${row.game}`).not.toBeNull();
          expect(label).not.toMatch(/undefined|null|NaN/);
        }
      }
    }
  });

  it('names the seeded teams in round 1', () => {
    expect(labels(winners, 1)).toEqual([teamName(12), teamName(14)]);
    expect(labels(losers, 1)).toEqual([teamName(2), teamName(6)]);
  });

  it('pairs a bye team with the winner of a round-1 game', () => {
    // Rosters 4 and 10 hold the two byes and wait for games 1 and 2.
    expect(labels(winners, 3)).toEqual([teamName(4), 'Winner of game 1']);
    expect(labels(winners, 4)).toEqual([teamName(10), 'Winner of game 2']);
  });

  it('labels the title game and the placement games', () => {
    expect(labels(winners, 6)).toEqual(['Winner of game 3', 'Winner of game 4']);
    expect(labels(winners, 5)).toEqual(['Loser of game 1', 'Loser of game 2']);
    expect(labels(winners, 7)).toEqual(['Loser of game 3', 'Loser of game 4']);
    expect(labels(losers, 9)).toEqual(['Winner of game 5', 'Winner of game 6']);
    expect(labels(losers, 12)).toEqual(['Loser of game 7', 'Loser of game 8']);
  });
});

describe('bracketSlotLabel once results arrive', () => {
  /** The real winners bracket with game 1 decided: roster 12 beat roster 14. */
  const decided = winners.map((row) =>
    row.game === 1 ? { ...row, winner_roster_id: 12, loser_roster_id: 14 } : row,
  );

  it('names the team as soon as its source game is decided', () => {
    // Sleeper fills t2 itself on its next refresh; until then the decided
    // source game already says who it is, so the label does not lag.
    expect(labels(decided, 3)).toEqual([teamName(4), teamName(12)]);
    expect(labels(decided, 5)[0]).toBe(teamName(14));
  });

  it('keeps the reference while the source game is undecided', () => {
    expect(labels(decided, 4)).toEqual([teamName(10), 'Winner of game 2']);
  });

  it('prefers the roster Sleeper assigned over the source game', () => {
    const filled = decided.map((row) => (row.game === 3 ? { ...row, team2_roster_id: 9 } : row));
    expect(labels(filled, 3)[1]).toBe(teamName(9));
  });

  it('keeps the reference when the source game is not in the bracket', () => {
    const orphan = decided.filter((row) => row.game !== 1);
    expect(labels(orphan, 3)[1]).toBe('Winner of game 1');
  });

  it('returns null for a slot with no team and no source: a bye or an unpublished pairing', () => {
    const empty = { ...game(winners, 6), team1_from: null };
    expect(bracketSlotLabel({ slot: empty, side: 'team1', bracket: winners, teamName })).toBeNull();
  });
});
