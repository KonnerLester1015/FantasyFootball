import { describe, expect, it } from 'vitest';
import { buildMatchupRows, buildPlayerScoreRows, effectivePoints, startingSlots } from './matchups';
import * as fixtures from '../test-fixtures';
import golden from '../../../../fixtures/golden/2026-through-week-04.json';

const LEAGUE = fixtures.FIXTURE_LEAGUE_ID;

function rowsForWeek(week: number, finalized = true) {
  return buildMatchupRows({
    leagueId: LEAGUE,
    week,
    matchups: fixtures.matchups(week),
    finalized,
  });
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Legacy rule, from reference/legacy/Redraft.gs:169 and its test at
// redraft_tests.js:8 — a commissioner override of 0 IS the score.
describe('effectivePoints', () => {
  it('prefers custom_points over points, including a zero override', () => {
    expect(effectivePoints({ roster_id: 1, points: 20, custom_points: 0 })).toBe(0);
    expect(effectivePoints({ roster_id: 1, points: 20, custom_points: 123.45 })).toBe(123.45);
  });

  it('uses points when there is no override', () => {
    expect(effectivePoints({ roster_id: 1, points: 136.4, custom_points: null })).toBe(136.4);
  });

  it('reads 0 for a week with no score yet', () => {
    expect(effectivePoints({ roster_id: 1 })).toBe(0);
  });
});

describe('startingSlots', () => {
  it('drops bench and reserve slots, keeping lineup order', () => {
    expect(startingSlots(fixtures.league.roster_positions)).toEqual([
      'QB',
      'RB',
      'RB',
      'WR',
      'WR',
      'TE',
      'FLEX',
      'FLEX',
      'K',
      'DEF',
    ]);
  });

  it('aligns one-to-one with the starters array Sleeper returns', () => {
    const slots = startingSlots(fixtures.league.roster_positions);
    for (const matchup of fixtures.matchups(4)) {
      expect(matchup.starters).toHaveLength(slots.length);
    }
  });
});

describe('buildMatchupRows', () => {
  const week4 = rowsForWeek(4);

  it('returns one row per roster, keyed on league, week and roster', () => {
    expect(week4).toHaveLength(14);
    expect(week4.find((row) => row.roster_id === 1)?.$id).toBe(`${LEAGUE}_04_01`);
  });

  it('reads the score and pairs the opponent from matchup_id', () => {
    const roster1 = week4.find((row) => row.roster_id === 1);

    expect(roster1).toMatchObject({
      week: 4,
      matchup_id: 2,
      points: 169.04,
      custom_points: null,
      opponent_roster_id: 5,
      opponent_points: 87.32,
      result: 'W',
    });
    expect(roster1?.margin).toBeCloseTo(81.72, 2);
  });

  it('gives the two sides of a game mirrored margins and complementary results', () => {
    for (const row of week4) {
      if (row.opponent_roster_id === null) continue;
      const opponent = week4.find((other) => other.roster_id === row.opponent_roster_id);
      expect(opponent?.opponent_roster_id).toBe(row.roster_id);
      expect(opponent?.margin).toBeCloseTo(-(row.margin ?? 0), 2);

      const mirrored = { W: 'L', L: 'W', T: 'T', PENDING: 'PENDING' } as const;
      expect(opponent?.result).toBe(mirrored[row.result]);
    }
  });

  // The strongest cross-check available: PF comes from rosters[].settings and
  // these points come from the matchup payloads, two independent sources that
  // must agree with the sheet's number for all 14 teams.
  it('sums to the golden PF for all 14 teams over the finalized weeks', () => {
    const totals = new Map<number, number>();

    for (const week of fixtures.FINALIZED_WEEKS) {
      for (const row of rowsForWeek(week)) {
        totals.set(row.roster_id, (totals.get(row.roster_id) ?? 0) + row.points);
      }
    }

    for (const team of golden.teams) {
      expect(round2(totals.get(team.rosterId) ?? 0)).toBeCloseTo(team.pf, 2);
    }
  });

  // Independent of PF: the records come from rosters[].settings, while these
  // results come from comparing paired matchup scores.
  it('reproduces the golden W-L-T for all 14 teams over the finalized weeks', () => {
    const tally = new Map<number, { W: number; L: number; T: number }>();

    for (const week of fixtures.FINALIZED_WEEKS) {
      for (const row of rowsForWeek(week)) {
        const current = tally.get(row.roster_id) ?? { W: 0, L: 0, T: 0 };
        if (row.result !== 'PENDING') current[row.result]++;
        tally.set(row.roster_id, current);
      }
    }

    for (const team of golden.teams) {
      const counted = tally.get(team.rosterId);
      expect(`${counted?.W}-${counted?.L}-${counted?.T}`).toBe(team.record);
    }
  });

  // Also independent: the sheet counted crowns from its own weekly scores.
  it('identifies the weekly high scorer consistently with the golden crown counts', () => {
    const crowns = new Map<number, number>();

    for (const week of fixtures.FINALIZED_WEEKS) {
      const rows = rowsForWeek(week);
      const best = Math.max(...rows.map((row) => row.points));
      for (const row of rows.filter((candidate) => candidate.points === best)) {
        crowns.set(row.roster_id, (crowns.get(row.roster_id) ?? 0) + 1);
      }
    }

    for (const team of golden.teams) {
      expect(crowns.get(team.rosterId) ?? 0).toBe(team.weeklyCrowns);
    }
  });

  it('marks an unfinalized week PENDING without losing the score or the pairing', () => {
    const week5 = rowsForWeek(5, false);
    const roster1 = week5.find((row) => row.roster_id === 1);

    expect(roster1?.result).toBe('PENDING');
    expect(roster1?.opponent_roster_id).not.toBeNull();
    expect(roster1?.points).toBe(1);
  });

  it('records a tie as T', () => {
    const [a, b] = buildMatchupRows({
      leagueId: LEAGUE,
      week: 4,
      finalized: true,
      matchups: [
        { roster_id: 1, matchup_id: 1, points: 100 },
        { roster_id: 2, matchup_id: 1, points: 100 },
      ],
    });

    expect(a?.result).toBe('T');
    expect(b?.result).toBe('T');
    expect(a?.margin).toBe(0);
  });

  it('keeps a commissioner override in its own column as well as in points', () => {
    const [row] = buildMatchupRows({
      leagueId: LEAGUE,
      week: 4,
      finalized: true,
      matchups: [{ roster_id: 1, matchup_id: 1, points: 100, custom_points: 0 }],
    });

    expect(row?.points).toBe(0);
    expect(row?.custom_points).toBe(0);
  });

  // A roster with no published pairing is unobserved, not a loss: opponent
  // fields stay null and the result stays PENDING.
  it('leaves an unpaired roster without an opponent', () => {
    const [row] = buildMatchupRows({
      leagueId: LEAGUE,
      week: 15,
      finalized: true,
      matchups: [{ roster_id: 1, matchup_id: null, points: 120 }],
    });

    expect(row).toMatchObject({
      matchup_id: null,
      opponent_roster_id: null,
      opponent_points: null,
      margin: null,
      result: 'PENDING',
    });
  });

  it('refuses to pair a matchup_id shared by more than two rosters', () => {
    expect(() =>
      buildMatchupRows({
        leagueId: LEAGUE,
        week: 4,
        finalized: true,
        matchups: [
          { roster_id: 1, matchup_id: 1, points: 1 },
          { roster_id: 2, matchup_id: 1, points: 2 },
          { roster_id: 3, matchup_id: 1, points: 3 },
        ],
      }),
    ).toThrow(/matchup_id 1/);
  });

  it('keeps the lineup arrays, with empty slots dropped', () => {
    const roster1 = week4.find((row) => row.roster_id === 1);

    expect(roster1?.starters).toHaveLength(10);
    expect(roster1?.starters).not.toContain('0');
    expect(roster1?.players.length).toBeGreaterThan(roster1?.starters.length ?? 0);
  });
});

describe('buildPlayerScoreRows', () => {
  const rows = buildPlayerScoreRows({
    leagueId: LEAGUE,
    week: 4,
    matchups: fixtures.matchups(4),
    rosterPositions: fixtures.league.roster_positions,
  });

  it('returns one row per rostered player per roster, keyed on all four parts', () => {
    const roster1 = rows.filter((row) => row.roster_id === 1);
    expect(roster1).toHaveLength(17);
    expect(new Set(rows.map((row) => row.$id)).size).toBe(rows.length);
    expect(roster1[0]?.$id.startsWith(`${LEAGUE}_04_01_`)).toBe(true);
  });

  it('flags the ten starters and labels the slot each one filled', () => {
    const roster1 = rows.filter((row) => row.roster_id === 1);
    const starters = roster1.filter((row) => row.started);

    expect(starters).toHaveLength(10);
    expect(starters.map((row) => row.slot)).toEqual([
      'QB',
      'RB',
      'RB',
      'WR',
      'WR',
      'TE',
      'FLEX',
      'FLEX',
      'K',
      'DEF',
    ]);
  });

  it('leaves slot null for a bench player', () => {
    const bench = rows.filter((row) => row.roster_id === 1 && !row.started);
    expect(bench.length).toBeGreaterThan(0);
    for (const row of bench) {
      expect(row.slot).toBeNull();
    }
  });

  it("sums each roster's started points to that roster's matchup score", () => {
    const matchupRows = rowsForWeek(4);

    for (const matchupRow of matchupRows) {
      const started = rows.filter((row) => row.roster_id === matchupRow.roster_id && row.started);
      const total = round2(started.reduce((sum, row) => sum + (row.points ?? 0), 0));
      expect(total).toBeCloseTo(matchupRow.points, 2);
    }
  });

  // Missing data is blank, never zero: a player Sleeper has no score for is
  // unobserved, which a rendered 0.0 would misreport as a bad week.
  it('leaves points null for a player absent from players_points', () => {
    const rowsOut = buildPlayerScoreRows({
      leagueId: LEAGUE,
      week: 4,
      rosterPositions: ['QB', 'BN'],
      matchups: [
        {
          roster_id: 1,
          matchup_id: 1,
          starters: ['qb1'],
          players: ['qb1', 'bench1'],
          players_points: { qb1: 20 },
        },
      ],
    });

    expect(rowsOut.find((row) => row.player_id === 'qb1')?.points).toBe(20);
    expect(rowsOut.find((row) => row.player_id === 'bench1')?.points).toBeNull();
  });

  it('includes a player who started but is missing from the players array', () => {
    const rowsOut = buildPlayerScoreRows({
      leagueId: LEAGUE,
      week: 4,
      rosterPositions: ['QB', 'BN'],
      matchups: [
        {
          roster_id: 1,
          matchup_id: 1,
          starters: ['qb1'],
          players: null,
          players_points: { qb1: 9 },
        },
      ],
    });

    expect(rowsOut).toHaveLength(1);
    expect(rowsOut[0]).toMatchObject({ player_id: 'qb1', started: true, slot: 'QB', points: 9 });
  });

  it('skips the empty-slot marker', () => {
    const rowsOut = buildPlayerScoreRows({
      leagueId: LEAGUE,
      week: 4,
      rosterPositions: ['QB', 'RB', 'BN'],
      matchups: [
        {
          roster_id: 13,
          matchup_id: 1,
          starters: ['qb1', '0'],
          players: ['qb1'],
          players_points: { qb1: 5 },
        },
      ],
    });

    expect(rowsOut.map((row) => row.player_id)).toEqual(['qb1']);
  });

  // An empty slot must not shift every later starter up a position: filtering
  // the '0' out before reading the slot would label the RB a QB.
  it('keeps slot alignment when an earlier slot is empty', () => {
    const rowsOut = buildPlayerScoreRows({
      leagueId: LEAGUE,
      week: 4,
      rosterPositions: ['QB', 'RB', 'BN'],
      matchups: [
        {
          roster_id: 13,
          matchup_id: 1,
          starters: ['0', 'rb1'],
          players: ['rb1'],
          players_points: { rb1: 7 },
        },
      ],
    });

    expect(rowsOut).toHaveLength(1);
    expect(rowsOut[0]).toMatchObject({ player_id: 'rb1', slot: 'RB', started: true });
  });

  it('leaves optimal_starter for packages/core/metrics to fill', () => {
    for (const row of rows.slice(0, 5)) {
      expect(row).not.toHaveProperty('optimal_starter');
    }
  });
});
