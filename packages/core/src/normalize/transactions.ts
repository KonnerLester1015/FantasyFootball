import type {
  SleeperTradedPick,
  SleeperTransaction,
  SleeperWaiverBudgetTransfer,
} from '../sleeper/types';
import { NormalizeError } from './errors';
import { assertRowId } from './ids';

/** A row of the `transactions` table. */
export interface TransactionRow {
  $id: string;
  transaction_id: string;
  league_id: string;
  week: number;
  /** Sleeper's own vocabulary: waiver, free_agent, trade, commissioner. */
  type: string;
  /** complete or failed. Failed claims are kept, not filtered. */
  status: string;
  roster_ids: number[];
  /** JSON: player ID -> the roster that gained them. Null when there are none. */
  adds: string | null;
  /** JSON: player ID -> the roster that lost them. */
  drops: string | null;
  waiver_bid: number | null;
  add_count: number;
  created_at: string;
}

/** One roster's side of a trade. Empty asset classes are omitted. */
export interface TradeSide {
  received: string[];
  sent: string[];
  picks?: SleeperTradedPick[];
  faabIn?: number;
  faabOut?: number;
}

/**
 * A row of the `trades` table — the part that comes
 * from the transaction payload. `measured_points` and `estimate_note` are
 * filled by packages/core/metrics, which scores the acquired players over the
 * weeks after the trade.
 */
export interface TradeRow {
  $id: string;
  transaction_id: string;
  league_id: string;
  week: number;
  roster_ids: number[];
  /** JSON: roster ID -> TradeSide. */
  assets: string;
  player_asset_count: number;
  created_at: string;
}

export interface BuildTransactionsInput {
  leagueId: string;
  /** The week that was fetched; `leg` on the payload wins when they disagree. */
  week: number;
  transactions: readonly SleeperTransaction[];
}

function weekOf(transaction: SleeperTransaction, fallback: number): number {
  return transaction.leg ?? fallback;
}

function createdAt(transaction: SleeperTransaction): string {
  const epochMs = transaction.created ?? transaction.status_updated;
  if (epochMs === null || epochMs === undefined) {
    throw new NormalizeError(`transaction ${transaction.transaction_id} has no created timestamp`);
  }
  return new Date(epochMs).toISOString();
}

function asJson(map: Record<string, number> | null | undefined): string | null {
  return map && Object.keys(map).length > 0 ? JSON.stringify(map) : null;
}

/** Player IDs the given roster gained or lost in this transaction. */
function playersFor(map: Record<string, number> | null | undefined, rosterId: number): string[] {
  return Object.entries(map ?? {})
    .filter(([, toRoster]) => toRoster === rosterId)
    .map(([playerId]) => playerId);
}

function faab(
  transfers: readonly SleeperWaiverBudgetTransfer[] | null | undefined,
  rosterId: number,
  direction: 'receiver' | 'sender',
): number {
  return (transfers ?? [])
    .filter((transfer) => transfer[direction] === rosterId)
    .reduce((sum, transfer) => sum + (transfer.amount ?? 0), 0);
}

/**
 * One row per transaction, failed claims included.
 *
 * A failed waiver claim is part of the activity story ("three of my five claims
 * lost"), so status is stored and the consumer filters on it. `add_count`
 * supports metric 2e, which counts completed transactions with at least one
 * add; `adds` keeps the player-to-roster mapping that metric needs to attribute
 * them to a manager.
 */
export function buildTransactionRows({
  leagueId,
  week,
  transactions,
}: BuildTransactionsInput): TransactionRow[] {
  return transactions.map((transaction) => ({
    $id: assertRowId(transaction.transaction_id),
    transaction_id: transaction.transaction_id,
    league_id: leagueId,
    week: weekOf(transaction, week),
    type: transaction.type,
    status: transaction.status,
    roster_ids: transaction.roster_ids ?? [],
    adds: asJson(transaction.adds),
    drops: asJson(transaction.drops),
    waiver_bid: transaction.settings?.waiver_bid ?? null,
    add_count: Object.keys(transaction.adds ?? {}).length,
    created_at: createdAt(transaction),
  }));
}

/**
 * One row per completed trade.
 *
 * Both sides come out of the same two maps: a player listed in `adds` under
 * roster 14 and in `drops` under roster 1 moved from 1 to 14. Only completed
 * trades are kept — a vetoed or expired offer moved nothing.
 */
export function buildTradeRows({
  leagueId,
  week,
  transactions,
}: BuildTransactionsInput): TradeRow[] {
  return transactions
    .filter((transaction) => transaction.type === 'trade' && transaction.status === 'complete')
    .map((transaction) => {
      const rosterIds = transaction.roster_ids ?? [];

      const assets: Record<string, TradeSide> = {};
      for (const rosterId of rosterIds) {
        const side: TradeSide = {
          received: playersFor(transaction.adds, rosterId),
          sent: playersFor(transaction.drops, rosterId),
        };

        const picks = (transaction.draft_picks ?? []).filter((pick) => pick.owner_id === rosterId);
        if (picks.length > 0) side.picks = picks;

        const faabIn = faab(transaction.waiver_budget, rosterId, 'receiver');
        if (faabIn > 0) side.faabIn = faabIn;

        const faabOut = faab(transaction.waiver_budget, rosterId, 'sender');
        if (faabOut > 0) side.faabOut = faabOut;

        assets[String(rosterId)] = side;
      }

      return {
        $id: assertRowId(transaction.transaction_id),
        transaction_id: transaction.transaction_id,
        league_id: leagueId,
        week: weekOf(transaction, week),
        roster_ids: rosterIds,
        assets: JSON.stringify(assets),
        // Distinct players who changed hands, matching the legacy "assets
        // moved" count that labels a 4+ player trade a blockbuster.
        player_asset_count: Object.keys(transaction.adds ?? {}).length,
        created_at: createdAt(transaction),
      };
    });
}
