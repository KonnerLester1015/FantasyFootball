import type { SleeperDraft, SleeperDraftPick } from '../sleeper/types';
import { assertRowId, draftPickId } from './ids';

/** A row of the `drafts` table. */
export interface DraftRow {
  $id: string;
  draft_id: string;
  league_id: string;
  season: string;
  type: string;
  status: string;
  rounds: number | null;
  start_time: string | null;
  synced_at: string;
}

/** A row of the `draft_picks` table. */
export interface DraftPickRow {
  $id: string;
  draft_id: string;
  league_id: string;
  round: number;
  pick_no: number;
  draft_slot: number | null;
  roster_id: number | null;
  picked_by: string | null;
  player_id: string;
}

export interface BuildDraftRowInput {
  draft: SleeperDraft;
  /** Used when the draft payload does not carry its own league ID. */
  leagueId: string;
  syncedAt: Date;
}

export interface BuildDraftPickRowsInput {
  leagueId: string;
  draftId: string;
  picks: readonly SleeperDraftPick[];
}

/**
 * The draft's own row. A redraft league runs one draft a year, so this is pulled
 * once a season and then only when its status changes (REBUILD_PLAN §3).
 */
export function buildDraftRow({ draft, leagueId, syncedAt }: BuildDraftRowInput): DraftRow {
  return {
    $id: assertRowId(draft.draft_id),
    draft_id: draft.draft_id,
    league_id: draft.league_id ?? leagueId,
    season: draft.season,
    type: draft.type,
    status: draft.status,
    rounds: draft.settings?.rounds ?? null,
    start_time: draft.start_time ? new Date(draft.start_time).toISOString() : null,
    synced_at: syncedAt.toISOString(),
  };
}

/**
 * One row per pick.
 *
 * Sleeper repeats a copy of the player's name, team and position on every pick;
 * none of it is stored, because `players` already holds that and a second copy
 * would go stale. A slot with no `player_id` is not a pick yet and is skipped
 * rather than written as a phantom row on the draft board.
 */
export function buildDraftPickRows({
  leagueId,
  draftId,
  picks,
}: BuildDraftPickRowsInput): DraftPickRow[] {
  const rows: DraftPickRow[] = [];

  for (const pick of picks) {
    if (!pick.player_id) continue;

    rows.push({
      $id: draftPickId(draftId, pick.pick_no),
      draft_id: draftId,
      league_id: leagueId,
      round: pick.round,
      pick_no: pick.pick_no,
      draft_slot: pick.draft_slot ?? null,
      roster_id: pick.roster_id ?? null,
      picked_by: pick.picked_by ?? null,
      player_id: pick.player_id,
    });
  }

  return rows;
}
