import { describe, expect, it } from 'vitest';
import { buildTradeRows, buildTransactionRows } from './transactions';
import * as fixtures from '../test-fixtures';

const LEAGUE = fixtures.FIXTURE_LEAGUE_ID;

function rowsForWeek(week: number) {
  return buildTransactionRows({
    leagueId: LEAGUE,
    week,
    transactions: fixtures.transactions(week),
  });
}

describe('buildTransactionRows', () => {
  const week1 = rowsForWeek(1);

  it('returns one row per transaction, keyed on the Sleeper transaction id', () => {
    expect(week1).toHaveLength(32);
    for (const row of week1) {
      expect(row.$id).toBe(row.transaction_id);
      expect(row.league_id).toBe(LEAGUE);
      expect(row.week).toBe(1);
    }
  });

  // Failed waiver claims are kept, not filtered: "3 of my 5 claims failed" is a
  // real part of the activity story, and the consumer filters on status.
  it('keeps failed claims and records their status verbatim', () => {
    const statuses = new Set(week1.map((row) => row.status));
    expect(statuses).toEqual(new Set(['complete', 'failed']));
    expect(week1.filter((row) => row.status === 'complete')).toHaveLength(23);
  });

  it("stores Sleeper's own type vocabulary rather than an enum of ours", () => {
    const types = new Set(
      fixtures.FINALIZED_WEEKS.flatMap((w) => rowsForWeek(w).map((r) => r.type)),
    );
    expect(types).toContain('waiver');
    expect(types).toContain('free_agent');
    expect(types).toContain('commissioner');
    expect(types).toContain('trade');
  });

  it('counts the adds in each transaction', () => {
    const claim = week1.find((row) => row.transaction_id === '1405746079651164160');
    expect(claim?.add_count).toBe(1);
    expect(claim?.roster_ids).toEqual([7]);
  });

  // Metric 2e counts unique transaction IDs with at least one add, per manager,
  // so the roster each add went to has to survive normalization.
  it('stores adds and drops as JSON that maps player id to roster id', () => {
    const claim = week1.find((row) => row.transaction_id === '1405746079651164160');
    expect(JSON.parse(claim?.adds ?? 'null')).toEqual({ '11834': 7 });
    expect(claim?.drops).toBeNull();
  });

  it('counts completed add-transactions per week the way the activity metric will', () => {
    const counts = fixtures.FINALIZED_WEEKS.map(
      (week) =>
        rowsForWeek(week).filter((row) => row.status === 'complete' && row.add_count > 0).length,
    );

    expect(counts).toEqual([20, 19, 17, 23]);
  });

  it('records the created timestamp as ISO 8601', () => {
    const claim = week1.find((row) => row.transaction_id === '1405746079651164160');
    expect(claim?.created_at).toBe(new Date(1789518492189).toISOString());
  });

  it('reads a FAAB bid from settings and leaves it null when there was none', () => {
    const [bid] = buildTransactionRows({
      leagueId: LEAGUE,
      week: 2,
      transactions: [
        {
          transaction_id: 't1',
          type: 'waiver',
          status: 'complete',
          settings: { waiver_bid: 14 },
          adds: { p1: 3 },
          roster_ids: [3],
          created: 1,
        },
      ],
    });

    expect(bid?.waiver_bid).toBe(14);
    expect(week1[0]?.waiver_bid).toBeNull();
  });

  it('prefers the transaction leg over the requested week when they disagree', () => {
    const [row] = buildTransactionRows({
      leagueId: LEAGUE,
      week: 4,
      transactions: [
        { transaction_id: 't1', type: 'waiver', status: 'complete', leg: 3, created: 1 },
      ],
    });

    expect(row?.week).toBe(3);
  });

  it('handles a transaction with neither adds nor drops', () => {
    const [row] = buildTransactionRows({
      leagueId: LEAGUE,
      week: 0,
      transactions: [
        { transaction_id: 't1', type: 'commissioner', status: 'complete', created: 1 },
      ],
    });

    expect(row).toMatchObject({ add_count: 0, adds: null, drops: null, roster_ids: [] });
  });

  it('returns nothing for the empty pre-season week', () => {
    expect(rowsForWeek(0)).toEqual([]);
  });
});

describe('buildTradeRows', () => {
  const trades = fixtures.FINALIZED_WEEKS.flatMap((week) =>
    buildTradeRows({ leagueId: LEAGUE, week, transactions: fixtures.transactions(week) }),
  );

  it('finds the one completed trade in the finalized weeks', () => {
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      $id: '1408558773072629760',
      transaction_id: '1408558773072629760',
      league_id: LEAGUE,
      week: 3,
      player_asset_count: 2,
    });
    expect(trades[0]?.roster_ids).toEqual([1, 14]);
  });

  // The two sides of a trade are read off the same adds/drops maps: a player in
  // `adds` under roster 14 and in `drops` under roster 1 moved from 1 to 14.
  it('splits the assets into what each roster received and sent', () => {
    const assets = JSON.parse(trades[0]?.assets ?? 'null') as Record<
      string,
      { received: string[]; sent: string[] }
    >;

    expect(assets['1']).toEqual({ received: ['12526'], sent: ['12514'] });
    expect(assets['14']).toEqual({ received: ['12514'], sent: ['12526'] });
  });

  it('ignores adds, waiver claims and failed trades', () => {
    const rows = buildTradeRows({
      leagueId: LEAGUE,
      week: 4,
      transactions: [
        { transaction_id: 't1', type: 'waiver', status: 'complete', adds: { p1: 1 }, created: 1 },
        {
          transaction_id: 't2',
          type: 'trade',
          status: 'failed',
          adds: { p2: 1 },
          drops: { p2: 2 },
          roster_ids: [1, 2],
          created: 1,
        },
      ],
    });

    expect(rows).toEqual([]);
  });

  it('records traded picks and FAAB alongside the players', () => {
    const [row] = buildTradeRows({
      leagueId: LEAGUE,
      week: 4,
      transactions: [
        {
          transaction_id: 't1',
          type: 'trade',
          status: 'complete',
          adds: { p1: 2 },
          drops: { p1: 1 },
          roster_ids: [1, 2],
          draft_picks: [{ season: '2027', round: 2, roster_id: 1, owner_id: 2 }],
          waiver_budget: [{ sender: 2, receiver: 1, amount: 10 }],
          created: 1,
        },
      ],
    });

    const assets = JSON.parse(row?.assets ?? 'null') as Record<
      string,
      { picks: unknown[]; faabIn: number; faabOut: number }
    >;

    expect(assets['2']?.picks).toHaveLength(1);
    expect(assets['1']?.faabIn).toBe(10);
    expect(assets['2']?.faabOut).toBe(10);
  });

  it('leaves the measured outcome for packages/core/metrics to fill', () => {
    expect(trades[0]).not.toHaveProperty('measured_points');
    expect(trades[0]).not.toHaveProperty('estimate_note');
  });
});
