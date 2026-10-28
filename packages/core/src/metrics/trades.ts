import { round2 } from '../numbers';
import type { PlayerScoreRow } from '../normalize/matchups';
import type { TradeRow, TradeSide } from '../normalize/transactions';

/**
 * Trade recap and trade estimate — docs/REBUILD_PLAN.md §2e.
 *
 * Two different questions, kept apart so neither is mistaken for a verdict:
 *
 *  - **Recap** (measured): what the acquired players actually scored for the
 *    receiving roster after the trade week, same season. The trade week is
 *    excluded; a player who moves on stops counting for this roster; bench
 *    points count, because the recap measures the player, not the lineup.
 *    Legacy rule, reference/legacy/Redraft.gs:764-776.
 *  - **Estimate** (projected): received minus sent players' average over the
 *    league's latest up-to-3 observed weeks, on any roster. Picks are not
 *    priced, so a trade with picks is ungraded; so is a side where any player
 *    has no observed week, or that only received or only sent. Legacy rule,
 *    reference/legacy/Redraft.gs:859-870.
 *
 * Unobserved is blank: no measured week is a null, never 0 points.
 * **Scope is the caller's**: pass finalized weeks' player scores.
 */

/** A trade moving this many players or more is a blockbuster. */
const BLOCKBUSTER_PLAYERS = 4;

/** The estimate looks back over this many latest weeks. */
const RECENT_WEEKS = 3;

/** One roster's side of one completed trade, with its measured outcome. */
export interface TradeRecapRow {
  league_id: string;
  transaction_id: string;
  week: number;
  roster_id: number;
  received: string[];
  sent: string[];
  picks_received: number;
  faab_in: number;
  faab_out: number;
  player_asset_count: number;
  blockbuster: boolean;
  /** Acquired players' points for this roster after the trade week. Null when none observed. */
  measured_points: number | null;
  measured_player_weeks: number;
}

export type TradeClassification = 'gain' | 'loss' | 'even' | 'ungraded_picks' | 'ungraded_coverage';

/** One roster's side of one trade, as a recent-scoring estimate. */
export interface TradeEstimateRow {
  league_id: string;
  transaction_id: string;
  week: number;
  roster_id: number;
  /** Sum of the received players' recent averages. Null when ungraded. */
  received_recent_ppg: number | null;
  sent_recent_ppg: number | null;
  /** Received minus sent. Positive is more recent scoring acquired. */
  estimated_weekly_edge: number | null;
  classification: TradeClassification;
  /** The weeks averaged over. Null when no week was observed. */
  window_from_week: number | null;
  window_to_week: number | null;
}

export interface TradeMetricsInput {
  trades: readonly TradeRow[];
  playerScores: readonly PlayerScoreRow[];
}

function sides(trade: TradeRow): [number, TradeSide][] {
  const assets = JSON.parse(trade.assets) as Record<string, TradeSide>;
  return trade.roster_ids.map((rosterId) => [
    rosterId,
    assets[String(rosterId)] ?? { received: [], sent: [] },
  ]);
}

export function tradeRecap({ trades, playerScores }: TradeMetricsInput): TradeRecapRow[] {
  return trades
    .slice()
    .sort(
      (a, b) =>
        b.player_asset_count - a.player_asset_count ||
        a.week - b.week ||
        a.transaction_id.localeCompare(b.transaction_id),
    )
    .flatMap((trade) =>
      sides(trade).map(([rosterId, side]): TradeRecapRow => {
        const scored = playerScores.filter(
          (row) =>
            row.league_id === trade.league_id &&
            row.roster_id === rosterId &&
            row.week > trade.week &&
            row.points !== null &&
            side.received.includes(row.player_id),
        );
        return {
          league_id: trade.league_id,
          transaction_id: trade.transaction_id,
          week: trade.week,
          roster_id: rosterId,
          received: side.received,
          sent: side.sent,
          picks_received: side.picks?.length ?? 0,
          faab_in: side.faabIn ?? 0,
          faab_out: side.faabOut ?? 0,
          player_asset_count: trade.player_asset_count,
          blockbuster: trade.player_asset_count >= BLOCKBUSTER_PLAYERS,
          measured_points:
            scored.length === 0
              ? null
              : round2(scored.reduce((sum, row) => sum + (row.points as number), 0)),
          measured_player_weeks: scored.length,
        };
      }),
    );
}

export function tradeEstimates({ trades, playerScores }: TradeMetricsInput): TradeEstimateRow[] {
  return trades.flatMap((trade) => {
    const observed = playerScores.filter(
      (row) => row.league_id === trade.league_id && row.points !== null,
    );
    const last = observed.length === 0 ? null : Math.max(...observed.map((row) => row.week));
    const from = last === null ? null : Math.max(1, last - RECENT_WEEKS + 1);

    /** A player's average over the window, one score per week; null if never observed in it. */
    const recent = (playerId: string): number | null => {
      if (last === null || from === null) return null;
      const byWeek = new Map<number, number>();
      for (const row of observed) {
        if (row.player_id === playerId && row.week >= from && row.week <= last)
          byWeek.set(row.week, row.points as number);
      }
      return byWeek.size === 0
        ? null
        : [...byWeek.values()].reduce((sum, value) => sum + value, 0) / byWeek.size;
    };

    const all = sides(trade);
    const hasPicks = all.some(([, side]) => (side.picks?.length ?? 0) > 0);

    return all.map(([rosterId, side]): TradeEstimateRow => {
      const received = side.received.map(recent);
      const sent = side.sent.map(recent);
      const measured =
        !hasPicks &&
        received.length > 0 &&
        sent.length > 0 &&
        [...received, ...sent].every((value) => value !== null);
      const total = (values: (number | null)[]) =>
        values.reduce<number>((sum, value) => sum + (value as number), 0);
      const edge = measured ? round2(total(received) - total(sent)) : null;

      return {
        league_id: trade.league_id,
        transaction_id: trade.transaction_id,
        week: trade.week,
        roster_id: rosterId,
        received_recent_ppg: measured ? round2(total(received)) : null,
        sent_recent_ppg: measured ? round2(total(sent)) : null,
        estimated_weekly_edge: edge,
        classification: hasPicks
          ? 'ungraded_picks'
          : edge === null
            ? 'ungraded_coverage'
            : edge > 0
              ? 'gain'
              : edge < 0
                ? 'loss'
                : 'even',
        window_from_week: from,
        window_to_week: last,
      };
    });
  });
}
