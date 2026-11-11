import type { PlayerScoreRow } from '../normalize/matchups';
import type { PlayerRow } from '../normalize/players';
import type { TeamRow } from '../normalize/rosters';
import { round2 } from '../numbers';
import { LEADER_POSITIONS, type LeaderPosition } from './leaders';

/**
 * Team pages: who each roster played each week, and what every player has done
 * for that roster this season. Pure lookups and sums over `player_scores`.
 *
 * Scope is the caller's: `teamLineups` describes every week handed in (the
 * model passes scored weeks plus the live one), `rosterSeasons` sums only the
 * score rows handed in (the model passes scored weeks only).
 */

export interface LineupPlayer {
  player_id: string;
  /** Null when the player dictionary has no name for this player. */
  name: string | null;
  position: string | null;
  nfl_team: string | null;
  /** The lineup slot filled (QB, FLEX, …), or null on the bench. */
  slot: string | null;
  started: boolean;
  /** Null when Sleeper has no score for the player that week. */
  points: number | null;
  /** In the best possible lineup that week. False for a week not yet scored. */
  optimal_starter: boolean;
}

export interface TeamLineupWeek {
  week: number;
  roster_id: number;
  /** True for the week being played now: scores are still moving. */
  live: boolean;
  /** Starters in slot order, then the bench by points, best first. */
  players: LineupPlayer[];
}

export type RosterStatus = 'starter' | 'bench' | 'reserve' | 'taxi' | 'gone';

export interface RosterPlayerSeason {
  player_id: string;
  name: string | null;
  position: string | null;
  nfl_team: string | null;
  /** Where the player sits on the roster today; `gone` once dropped or traded. */
  status: RosterStatus;
  /** Points scored in this roster's starting lineup. Null when never scored while started. */
  started_points: number | null;
  /** Every point scored while on this roster, bench included. Null when never scored. */
  total_points: number | null;
  weeks_started: number;
  weeks_rostered: number;
}

export interface TeamRosterView {
  roster_id: number;
  /** Starters in lineup order, then bench, reserve, taxi and former players, each by points. */
  players: RosterPlayerSeason[];
  /** Top contributor (started points) at each card position. Null when nobody qualifies. */
  mvps: { position: LeaderPosition; player_id: string | null }[];
}

function describe(players: ReadonlyMap<string, PlayerRow>, playerId: string) {
  const player = players.get(playerId);
  return {
    name: player?.full_name ?? null,
    position: player?.position ?? null,
    nfl_team: player?.team ?? null,
  };
}

const byPointsThenName = (
  a: { points: number | null; name: string | null; player_id: string },
  b: { points: number | null; name: string | null; player_id: string },
): number =>
  (b.points ?? -Infinity) - (a.points ?? -Infinity) ||
  (a.name ?? '').localeCompare(b.name ?? '') ||
  a.player_id.localeCompare(b.player_id);

/** One lineup per roster per week handed in, in week then roster order. */
export function teamLineups({
  weeks,
  liveWeek,
  playerScores,
  players,
}: {
  weeks: readonly number[];
  /** The week still being played, or null when every week handed in is final. */
  liveWeek: number | null;
  /** Score rows with the optimal-lineup flag already solved. */
  playerScores: readonly (PlayerScoreRow & { optimal_starter: boolean })[];
  players: readonly PlayerRow[];
}): TeamLineupWeek[] {
  const byId = new Map(players.map((player) => [player.player_id, player]));
  const wanted = new Set(weeks);
  const groups = new Map<string, (PlayerScoreRow & { optimal_starter: boolean })[]>();
  for (const row of playerScores) {
    if (!wanted.has(row.week)) continue;
    const key = `${row.week}:${row.roster_id}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((rows) => {
      const { week, roster_id } = rows[0]!;
      const live = week === liveWeek;
      const lineup = rows.map(
        (row): LineupPlayer => ({
          player_id: row.player_id,
          ...describe(byId, row.player_id),
          slot: row.slot,
          started: row.started,
          points: row.points,
          optimal_starter: !live && row.optimal_starter,
        }),
      );
      // Score rows arrive starters-first in slot order; keep that, sort the bench.
      const starters = lineup.filter((player) => player.started);
      const bench = lineup.filter((player) => !player.started).sort(byPointsThenName);
      return { week, roster_id, live, players: [...starters, ...bench] };
    })
    .sort((a, b) => a.week - b.week || a.roster_id - b.roster_id);
}

/**
 * Every player who is on, or has scored for, each roster, with their season for
 * that roster. MVPs rank by points that counted (started), not bench points.
 */
export function rosterSeasons({
  teams,
  playerScores,
  players,
}: {
  teams: readonly TeamRow[];
  /** Scored weeks only: a live week's moving numbers are not a season total. */
  playerScores: readonly PlayerScoreRow[];
  players: readonly PlayerRow[];
}): TeamRosterView[] {
  const byId = new Map(players.map((player) => [player.player_id, player]));

  return teams.map((team) => {
    const reserve = new Set(team.reserve);
    const taxi = new Set(team.taxi);
    const starters = new Set(team.starters.filter((id) => id !== '0'));
    const statusOf = (playerId: string): RosterStatus =>
      starters.has(playerId)
        ? 'starter'
        : reserve.has(playerId)
          ? 'reserve'
          : taxi.has(playerId)
            ? 'taxi'
            : team.players.includes(playerId)
              ? 'bench'
              : 'gone';

    const own = playerScores.filter((row) => row.roster_id === team.roster_id);
    const ids = [
      ...new Set([...team.players, ...own.map((row) => row.player_id)].filter((id) => id && id !== '0')),
    ];

    const seasons = ids.map((playerId): RosterPlayerSeason => {
      const rows = own.filter((row) => row.player_id === playerId);
      const scored = rows.filter((row) => row.points !== null);
      const started = scored.filter((row) => row.started);
      const sum = (list: PlayerScoreRow[]): number | null =>
        list.length === 0 ? null : round2(list.reduce((total, row) => total + row.points!, 0));
      return {
        player_id: playerId,
        ...describe(byId, playerId),
        status: statusOf(playerId),
        started_points: sum(started),
        total_points: sum(scored),
        weeks_started: rows.filter((row) => row.started).length,
        weeks_rostered: new Set(rows.map((row) => row.week)).size,
      };
    });

    const order: RosterStatus[] = ['starter', 'bench', 'reserve', 'taxi', 'gone'];
    // Starters keep lineup (slot) order; every other group ranks by points.
    const slotIndex = (player: RosterPlayerSeason): number =>
      player.status === 'starter' ? team.starters.indexOf(player.player_id) : 0;
    seasons.sort(
      (a, b) =>
        order.indexOf(a.status) - order.indexOf(b.status) ||
        slotIndex(a) - slotIndex(b) ||
        byPointsThenName(
          { ...a, points: a.total_points },
          { ...b, points: b.total_points },
        ),
    );

    const mvps = LEADER_POSITIONS.map((position) => {
      const pool = seasons
        .filter((player) => player.position === position && player.started_points !== null)
        .sort((a, b) =>
          byPointsThenName({ ...a, points: a.started_points }, { ...b, points: b.started_points }),
        );
      return { position, player_id: pool[0]?.player_id ?? null };
    });

    return { roster_id: team.roster_id, players: seasons, mvps };
  });
}
