import { round2 } from '../numbers';
import type { SleeperMatchup } from '../sleeper/types';
import { NormalizeError } from './errors';
import { matchupRowId, playerScoreId } from './ids';

/** Sleeper uses '0' to mark an empty starting slot. */
const EMPTY_SLOT = '0';

/** Slots that are not part of the starting lineup. */
const NON_STARTING_SLOTS = new Set(['BN', 'IR', 'TAXI']);

export type MatchupResult = 'W' | 'L' | 'T' | 'PENDING';

/**
 * A row of the `matchups` table — the part that comes
 * from the matchups payload.
 *
 * The analytics columns (`optimal_points`, `bench_gap`, `efficiency`,
 * `all_play_*`, `schedule_luck`, `weekly_high`, `weekly_low`) belong to
 * packages/core/metrics: they need the whole week, the player dictionary, or
 * both. The ingest function merges the two halves before writing.
 */
export interface MatchupRow {
  $id: string;
  league_id: string;
  week: number;
  roster_id: number;
  matchup_id: number | null;
  opponent_roster_id: number | null;
  /** The score that counts: `custom_points` when set, otherwise `points`. */
  points: number;
  /** The commissioner override itself, kept so an adjusted score is auditable. */
  custom_points: number | null;
  opponent_points: number | null;
  margin: number | null;
  result: MatchupResult;
  starters: string[];
  players: string[];
}

/** A row of the `player_scores` table. */
export interface PlayerScoreRow {
  $id: string;
  league_id: string;
  week: number;
  roster_id: number;
  player_id: string;
  /** Null when Sleeper has no score for this player — unobserved, not zero. */
  points: number | null;
  started: boolean;
  /** The lineup slot this player filled, or null for a bench player. */
  slot: string | null;
}

export interface BuildMatchupRowsInput {
  leagueId: string;
  week: number;
  matchups: readonly SleeperMatchup[];
  /**
   * Whether Sleeper has finished scoring this week. An unfinalized week keeps
   * its live scores but stays PENDING: a Sunday-morning 0 is not a loss.
   */
  finalized: boolean;
}

export interface BuildPlayerScoreRowsInput {
  leagueId: string;
  week: number;
  matchups: readonly SleeperMatchup[];
  /** `league.roster_positions`, bench slots included. */
  rosterPositions: readonly string[];
}

/**
 * The score that counts.
 *
 * `custom_points` is a commissioner override and wins whenever it is present,
 * including when it is 0 — hence `??` and not `||`. Legacy rule from
 * reference/legacy/FamilyFeud_Redraft.gs:169, asserted by its own test suite.
 */
export function effectivePoints(matchup: SleeperMatchup): number {
  return Number(matchup.custom_points ?? matchup.points ?? 0);
}

/**
 * The lineup slots in order, bench and reserve dropped.
 *
 * Sleeper's `starters` array is positionally aligned with this list, which is
 * the only way to know which slot a given starter filled.
 */
export function startingSlots(rosterPositions: readonly string[]): string[] {
  return rosterPositions.filter((slot) => !NON_STARTING_SLOTS.has(slot));
}

function playerList(ids: string[] | null | undefined): string[] {
  return (ids ?? []).filter((id) => id !== EMPTY_SLOT && id !== '');
}

/** Every player in the payload for one roster: starters first, then the bench. */
function rosterPlayerIds(matchup: SleeperMatchup): string[] {
  const starters = playerList(matchup.starters);
  const seen = new Set(starters);
  const rest = playerList(matchup.players).filter((id) => !seen.has(id));
  return [...starters, ...rest];
}

/**
 * Pair the rosters that share a `matchup_id`.
 *
 * A null `matchup_id` means Sleeper has not published a pairing — a future
 * week, or a postseason week this roster is not playing in. More than two
 * rosters on one ID is not something to average over: it means the pairing
 * assumption is wrong, so it fails.
 */
function pairOpponents(
  matchups: readonly SleeperMatchup[],
  week: number,
): Map<number, SleeperMatchup | null> {
  const byMatchupId = new Map<number, SleeperMatchup[]>();
  for (const matchup of matchups) {
    if (matchup.matchup_id === null || matchup.matchup_id === undefined) continue;
    const group = byMatchupId.get(matchup.matchup_id) ?? [];
    group.push(matchup);
    byMatchupId.set(matchup.matchup_id, group);
  }

  for (const [matchupId, group] of byMatchupId) {
    if (group.length > 2) {
      throw new NormalizeError(
        `week ${week} matchup_id ${matchupId} pairs ${group.length} rosters, expected 2`,
      );
    }
  }

  const opponents = new Map<number, SleeperMatchup | null>();
  for (const matchup of matchups) {
    const group =
      matchup.matchup_id === null || matchup.matchup_id === undefined
        ? []
        : (byMatchupId.get(matchup.matchup_id) ?? []);
    const opponent = group.find((other) => other.roster_id !== matchup.roster_id) ?? null;
    opponents.set(matchup.roster_id, opponent);
  }

  return opponents;
}

/** One row per roster for one week, with the opponent resolved. */
export function buildMatchupRows({
  leagueId,
  week,
  matchups,
  finalized,
}: BuildMatchupRowsInput): MatchupRow[] {
  const opponents = pairOpponents(matchups, week);

  return matchups.map((matchup) => {
    const opponent = opponents.get(matchup.roster_id) ?? null;
    const points = round2(effectivePoints(matchup));
    const opponentPoints = opponent === null ? null : round2(effectivePoints(opponent));

    let result: MatchupResult = 'PENDING';
    if (finalized && opponentPoints !== null) {
      result = points > opponentPoints ? 'W' : points < opponentPoints ? 'L' : 'T';
    }

    return {
      $id: matchupRowId(leagueId, week, matchup.roster_id),
      league_id: leagueId,
      week,
      roster_id: matchup.roster_id,
      matchup_id: matchup.matchup_id ?? null,
      opponent_roster_id: opponent?.roster_id ?? null,
      points,
      custom_points: matchup.custom_points ?? null,
      opponent_points: opponentPoints,
      margin: opponentPoints === null ? null : round2(points - opponentPoints),
      result,
      starters: playerList(matchup.starters),
      players: playerList(matchup.players),
    };
  });
}

/**
 * One row per player per roster for one week.
 *
 * Drives the player drill-down and is the input the optimal-lineup DP reads, so
 * it keeps bench players too. `optimal_starter` is filled by
 * packages/core/metrics once that lineup is solved.
 */
export function buildPlayerScoreRows({
  leagueId,
  week,
  matchups,
  rosterPositions,
}: BuildPlayerScoreRowsInput): PlayerScoreRow[] {
  const slots = startingSlots(rosterPositions);
  const rows: PlayerScoreRow[] = [];

  for (const matchup of matchups) {
    // Slot by player, read off the positional alignment with `starters`. The
    // raw array is used, not the filtered one, so an empty slot does not shift
    // every later starter into the wrong position.
    const slotByPlayer = new Map<string, string>();
    (matchup.starters ?? []).forEach((playerId, index) => {
      if (playerId === EMPTY_SLOT || !playerId) return;
      const slot = slots[index];
      if (slot !== undefined) slotByPlayer.set(playerId, slot);
    });

    const started = new Set(playerList(matchup.starters));

    for (const playerId of rosterPlayerIds(matchup)) {
      const points = matchup.players_points?.[playerId];

      rows.push({
        $id: playerScoreId(leagueId, week, matchup.roster_id, playerId),
        league_id: leagueId,
        week,
        roster_id: matchup.roster_id,
        player_id: playerId,
        points: points === undefined || points === null ? null : round2(points),
        started: started.has(playerId),
        slot: slotByPlayer.get(playerId) ?? null,
      });
    }
  }

  return rows;
}
