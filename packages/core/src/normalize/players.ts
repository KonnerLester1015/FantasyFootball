import type { PlayerDictionary, SleeperPlayer } from '../sleeper/types';
import { assertRowId } from './ids';

/** A row of the `players` table. */
export interface PlayerRow {
  $id: string;
  player_id: string;
  full_name: string | null;
  position: string | null;
  fantasy_positions: string[];
  team: string | null;
  status: string | null;
  age: number | null;
  synced_at: string;
}

/**
 * The display name. Sleeper gives team defenses no `full_name`, only
 * `first_name: "Baltimore"` and `last_name: "Ravens"`, so fall back to those.
 */
export function playerName(player: SleeperPlayer): string | null {
  if (player.full_name) return player.full_name;
  const joined = [player.first_name, player.last_name].filter(Boolean).join(' ');
  return joined === '' ? null : joined;
}

export interface BuildPlayerRowsInput {
  /** Every player ID the league's payloads mention: rosters, scores, transactions, picks. */
  playerIds: Iterable<string>;
  players: PlayerDictionary;
  /** When the dictionary itself was fetched, not when this row was built. */
  syncedAt: Date;
}

/**
 * One row per player the league has touched (REBUILD_PLAN §3: "store only players
 * that appear on a league roster or in a score"), not the 12,000-player dictionary.
 *
 * A player the dictionary does not know is skipped rather than written with blank
 * fields: a row of nulls would read as a real player with no position.
 */
export function buildPlayerRows({
  playerIds,
  players,
  syncedAt,
}: BuildPlayerRowsInput): PlayerRow[] {
  const synced = syncedAt.toISOString();
  const ids = [...new Set(playerIds)].filter((id) => id !== '' && id !== '0').sort();

  return ids.flatMap((playerId) => {
    const player = players[playerId];
    if (player === undefined) return [];
    return [
      {
        $id: assertRowId(playerId),
        player_id: playerId,
        full_name: playerName(player),
        position: player.position ?? null,
        fantasy_positions: (player.fantasy_positions ?? []).filter(Boolean),
        team: player.team ?? null,
        status: player.status ?? null,
        age: player.age ?? null,
        synced_at: synced,
      },
    ];
  });
}

/**
 * Shrink /players/nfl (~20 MB) to the fields the app needs, so a browser
 * caching this in localStorage keeps it around 1-2 MB instead.
 *
 * Every player is kept, not just the currently rostered ones: rosters change
 * between fetches, and a cache trimmed to today's rosters would miss a player
 * added after it was written.
 */
export function trimPlayerDictionary(players: PlayerDictionary): PlayerDictionary {
  const trimmed: PlayerDictionary = {};
  for (const [id, player] of Object.entries(players)) {
    if (!player) continue;
    trimmed[id] = {
      full_name: playerName(player),
      position: player.position ?? null,
      fantasy_positions: player.fantasy_positions ?? null,
      team: player.team ?? null,
      status: player.status ?? null,
      age: player.age ?? null,
    };
  }
  return trimmed;
}
