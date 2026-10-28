import { describe, expect, it } from 'vitest';

import golden from '../../../../fixtures/golden/2026-through-week-04.json';
import leagueJson from '../../../../fixtures/sleeper/league.json';
import { buildPlayerScoreRows, type PlayerScoreRow } from '../normalize/matchups';
import { buildTradeRows, type TradeRow, type TradeSide } from '../normalize/transactions';
import * as fixtures from '../test-fixtures';
import { tradeEstimates, tradeRecap } from './trades';

/**
 * Trade recap and trade estimate — docs/REBUILD_PLAN.md §2e.
 *
 *  - **Recap**: every completed trade, each side's assets, and the points the
 *    acquired players went on to score for the receiving roster after the
 *    trade week, same season. A measurement, not a verdict.
 *  - **Estimate**: received vs sent players' average over their latest up-to-3
 *    observed weeks. Draft picks are not priced, so a trade with picks stays
 *    ungraded; so does one with a player who has no observed weeks.
 *
 * Rules from reference/legacy/Redraft.gs:764-776 (recap) and
 * :859-876 (estimate). The real fixture holds one trade — week 3, roster 1
 * sent player 12514 to roster 14 for 12526 — checked against the sheet's
 * recap row and against a hand calculation from the raw matchup JSON.
 */

const LEAGUE = 'L';

function side(overrides: Partial<TradeSide> = {}): TradeSide {
  return { received: [], sent: [], ...overrides };
}

function trade(week: number, sides: Record<number, TradeSide>, id = 'T1'): TradeRow {
  const rosterIds = Object.keys(sides).map(Number);
  return {
    $id: id,
    transaction_id: id,
    league_id: LEAGUE,
    week,
    roster_ids: rosterIds,
    assets: JSON.stringify(sides),
    player_asset_count: Object.values(sides).reduce((sum, entry) => sum + entry.received.length, 0),
    created_at: '2026-09-20T00:00:00.000Z',
  };
}

function score(
  week: number,
  rosterId: number,
  playerId: string,
  points: number | null,
): PlayerScoreRow {
  return {
    $id: `${LEAGUE}_${week}_${rosterId}_${playerId}`,
    league_id: LEAGUE,
    week,
    roster_id: rosterId,
    player_id: playerId,
    points,
    started: true,
    slot: 'WR',
  };
}

/** Roster 1 sends p1 to roster 2 for p2 in week 2. */
const swap = trade(2, {
  1: side({ received: ['p2'], sent: ['p1'] }),
  2: side({ received: ['p1'], sent: ['p2'] }),
});

describe('tradeRecap', () => {
  it('measures acquired players for the receiving roster after the trade week only', () => {
    const recap = tradeRecap({
      trades: [swap],
      playerScores: [
        score(1, 2, 'p2', 99), // before the trade, on the old roster
        score(2, 1, 'p2', 50), // the trade week itself is excluded
        score(3, 1, 'p2', 12.5),
        score(4, 1, 'p2', 7.25),
        score(4, 1, 'p9', 40), // a player roster 1 did not acquire
        score(3, 2, 'p1', 8),
      ],
    });

    expect(
      recap.map((row) => [
        row.roster_id,
        row.received,
        row.sent,
        row.measured_points,
        row.measured_player_weeks,
      ]),
    ).toEqual([
      [1, ['p2'], ['p1'], 19.75, 2],
      [2, ['p1'], ['p2'], 8, 1],
    ]);
  });

  it('stops measuring a player once he is on another roster', () => {
    const recap = tradeRecap({
      trades: [swap],
      playerScores: [score(3, 1, 'p2', 10), score(4, 5, 'p2', 30)],
    });
    expect(recap[0]?.measured_points).toBe(10);
  });

  it('leaves the measurement blank, not zero, when nothing has been observed', () => {
    const recap = tradeRecap({ trades: [swap], playerScores: [score(3, 1, 'p2', null)] });
    expect(recap[0]).toMatchObject({ measured_points: null, measured_player_weeks: 0 });
  });

  it('labels a trade moving four or more players a blockbuster, and lists it first', () => {
    const big = trade(
      5,
      {
        3: side({ received: ['a', 'b'], sent: ['c', 'd'] }),
        4: side({ received: ['c', 'd'], sent: ['a', 'b'] }),
      },
      'T2',
    );
    const recap = tradeRecap({ trades: [swap, big], playerScores: [] });
    expect(recap.map((row) => [row.transaction_id, row.blockbuster])).toEqual([
      ['T2', true],
      ['T2', true],
      ['T1', false],
      ['T1', false],
    ]);
  });

  it('carries picks and FAAB in the side’s assets', () => {
    const withPicks = trade(2, {
      1: side({
        received: ['p2'],
        picks: [{ season: '2027', round: 1, roster_id: 2, previous_owner_id: 2, owner_id: 1 }],
        faabIn: 10,
      }),
      2: side({ sent: ['p2'], faabOut: 10 }),
    });
    const recap = tradeRecap({ trades: [withPicks], playerScores: [] });
    expect(recap[0]).toMatchObject({ picks_received: 1, faab_in: 10, faab_out: 0 });
    expect(recap[1]).toMatchObject({ picks_received: 0, faab_in: 0, faab_out: 10 });
  });

  it('ignores scores from another league', () => {
    const recap = tradeRecap({
      trades: [swap],
      playerScores: [{ ...score(3, 1, 'p2', 10), league_id: 'other' }],
    });
    expect(recap[0]?.measured_points).toBeNull();
  });
});

describe('tradeEstimates', () => {
  it('compares the latest three observed weeks of received and sent players', () => {
    // Latest week is 5, so the window is weeks 3-5. p2 averages (10+20+30)/3,
    // p1 averages its two observed weeks (6+8)/2; week 2 is outside the window.
    const estimates = tradeEstimates({
      trades: [swap],
      playerScores: [
        score(2, 2, 'p2', 100),
        score(3, 1, 'p2', 10),
        score(4, 1, 'p2', 20),
        score(5, 1, 'p2', 30),
        score(4, 2, 'p1', 6),
        score(5, 2, 'p1', 8),
      ],
    });

    expect(
      estimates.map((row) => [
        row.roster_id,
        row.received_recent_ppg,
        row.sent_recent_ppg,
        row.estimated_weekly_edge,
        row.classification,
      ]),
    ).toEqual([
      [1, 20, 7, 13, 'gain'],
      [2, 7, 20, -13, 'loss'],
    ]);
    expect(estimates[0]).toMatchObject({ window_from_week: 3, window_to_week: 5 });
  });

  it('calls equal recent scoring even', () => {
    const estimates = tradeEstimates({
      trades: [swap],
      playerScores: [score(3, 1, 'p2', 10), score(3, 2, 'p1', 10)],
    });
    expect(estimates.map((row) => row.classification)).toEqual(['even', 'even']);
  });

  it('leaves a trade with draft picks ungraded', () => {
    const withPicks = trade(2, {
      1: side({
        received: ['p2'],
        sent: ['p1'],
        picks: [{ season: '2027', round: 2, roster_id: 2, previous_owner_id: 2, owner_id: 1 }],
      }),
      2: side({ received: ['p1'], sent: ['p2'] }),
    });
    const estimates = tradeEstimates({
      trades: [withPicks],
      playerScores: [score(3, 1, 'p2', 10), score(3, 2, 'p1', 10)],
    });
    // Both sides: a priced side against an unpriced pick is not a comparison.
    expect(estimates.map((row) => [row.classification, row.estimated_weekly_edge])).toEqual([
      ['ungraded_picks', null],
      ['ungraded_picks', null],
    ]);
  });

  it('leaves a side ungraded when a player has no observed weeks', () => {
    const estimates = tradeEstimates({ trades: [swap], playerScores: [score(3, 1, 'p2', 10)] });
    expect(estimates.map((row) => [row.classification, row.received_recent_ppg])).toEqual([
      ['ungraded_coverage', null],
      ['ungraded_coverage', null],
    ]);
  });

  it('leaves a one-sided move ungraded', () => {
    const gift = trade(2, { 1: side({ received: ['p2'] }), 2: side({ sent: ['p2'] }) });
    const estimates = tradeEstimates({ trades: [gift], playerScores: [score(3, 1, 'p2', 10)] });
    expect(estimates.every((row) => row.classification === 'ungraded_coverage')).toBe(true);
  });
});

describe('the real week-3 trade', () => {
  const LEAGUE_ID = fixtures.FIXTURE_LEAGUE_ID;
  const trades = [0, 1, 2, 3, 4, 5].flatMap((week) =>
    buildTradeRows({ leagueId: LEAGUE_ID, week, transactions: fixtures.transactions(week) }),
  );
  const playerScores = fixtures.FINALIZED_WEEKS.flatMap((week) =>
    buildPlayerScoreRows({
      leagueId: LEAGUE_ID,
      week,
      matchups: fixtures.matchups(week),
      rosterPositions: leagueJson.roster_positions,
    }),
  );

  it('finds exactly the one completed trade', () => {
    expect(trades.map((row) => [row.transaction_id, row.week])).toEqual([
      [golden.tradeRecap.transactionId, golden.tradeRecap.week],
    ]);
  });

  it('matches the sheet’s recap: 45.2 points for Prestige Worldwide', () => {
    const recap = tradeRecap({ trades, playerScores });
    for (const expected of golden.tradeRecap.sides) {
      expect(recap.find((row) => row.roster_id === expected.rosterId)).toMatchObject({
        received: expected.received,
        measured_points: expected.measuredPoints,
      });
    }
    // The other side, from the raw matchup JSON: 12514 scored 3.3 for roster 14 in week 4.
    expect(recap.find((row) => row.roster_id === 14)).toMatchObject({
      received: ['12514'],
      measured_points: 3.3,
      measured_player_weeks: 1,
    });
  });

  it('estimates the edge from weeks 2-4, by hand from the raw JSON', () => {
    // 12526: 15.1, 3.7, 45.2 -> 21.333…   12514: 10.3, 11.2, 3.3 -> 8.266…
    const estimates = tradeEstimates({ trades, playerScores });
    expect(
      estimates.map((row) => [
        row.roster_id,
        row.received_recent_ppg,
        row.sent_recent_ppg,
        row.estimated_weekly_edge,
        row.classification,
      ]),
    ).toEqual([
      [1, 21.33, 8.27, 13.07, 'gain'],
      [14, 8.27, 21.33, -13.07, 'loss'],
    ]);
    expect(estimates[0]).toMatchObject({ window_from_week: 2, window_to_week: 4 });
  });
});
