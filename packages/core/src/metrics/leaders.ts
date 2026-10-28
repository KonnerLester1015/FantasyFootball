import type { PlayerScoreRow } from '../normalize/matchups';
import type { PlayerRow } from '../normalize/players';

/** The positions the recap's leader cards show, in display order. */
export const LEADER_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;
export type LeaderPosition = (typeof LEADER_POSITIONS)[number];

export interface PositionLeader {
  player_id: string;
  /** Null when the player dictionary has no name for this player. */
  name: string | null;
  roster_id: number;
  points: number;
  /** False when the leader sat on that team's bench. */
  started: boolean;
}

export interface PositionLeaderCell {
  position: LeaderPosition;
  /**
   * Everyone tied for the top score, ordered by name then ID so a re-run lists
   * them the same way. Empty when no rostered player at the position has a score.
   */
  leaders: PositionLeader[];
}

export interface PositionLeadersWeek {
  week: number;
  positions: PositionLeaderCell[];
}

/**
 * The top-scoring rostered player at each position, per week.
 *
 * Every rostered player counts, bench included: the card answers "who owned the
 * best QB this week", not "who started him". A player is placed by the
 * dictionary's primary `position`. A null score is unobserved and is skipped, so
 * a position where nobody has a score yields no leader rather than a 0.
 */
export function positionLeaders({
  weeks,
  playerScores,
  players,
}: {
  weeks: readonly number[];
  playerScores: readonly PlayerScoreRow[];
  players: readonly PlayerRow[];
}): PositionLeadersWeek[] {
  const byId = new Map(players.map((player) => [player.player_id, player]));

  return weeks.map((week) => {
    const scored = playerScores.flatMap((row) => {
      const player = byId.get(row.player_id);
      if (row.week !== week || row.points === null || !player?.position) return [];
      return [{ row, player, points: row.points }];
    });

    return {
      week,
      positions: LEADER_POSITIONS.map((position) => {
        const pool = scored.filter((entry) => entry.player.position === position);
        const top = Math.max(...pool.map((entry) => entry.points));
        return {
          position,
          leaders: pool
            .filter((entry) => entry.points === top)
            .map(({ row, player, points }) => ({
              player_id: row.player_id,
              name: player.full_name,
              roster_id: row.roster_id,
              points,
              started: row.started,
            }))
            .sort(
              (a, b) =>
                (a.name ?? '').localeCompare(b.name ?? '') || a.player_id.localeCompare(b.player_id),
            ),
        };
      }),
    };
  });
}
