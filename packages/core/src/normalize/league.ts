import type { SleeperLeague } from '../sleeper/types';
import { NormalizeError } from './errors';
import { assertRowId } from './ids';

/** A row of the `leagues` table. */
export interface LeagueRow {
  $id: string;
  league_id: string;
  season: string;
  name: string;
  status: string;
  previous_league_id: string | null;
  draft_id: string | null;
  playoff_week_start: number;
  regular_season_weeks: number;
  num_teams: number;
  playoff_teams: number;
  last_scored_leg: number | null;
  roster_positions: string[];
  /** Sleeper's scoring rules, stored verbatim as JSON text. */
  scoring_settings: string | null;
  synced_at: string;
}

export interface BuildLeagueRowInput {
  league: SleeperLeague;
  syncedAt: Date;
}

function required(value: number | undefined, field: string, leagueId: string): number {
  if (value === undefined || value === null) {
    throw new NormalizeError(`league ${leagueId} has no settings.${field}`);
  }
  return value;
}

/**
 * The league's own row: config, season status and the structural facts every
 * other table is interpreted against.
 *
 * `playoff_week_start`, `num_teams` and `playoff_teams` are required rather
 * than defaulted. Defaulting `playoff_week_start` would silently redefine what
 * "regular season" means — and the length of the regular season is the divisor
 * under half the metrics in REBUILD_PLAN §2.
 */
export function buildLeagueRow({ league, syncedAt }: BuildLeagueRowInput): LeagueRow {
  const leagueId = league.league_id;
  const playoffWeekStart = required(
    league.settings.playoff_week_start,
    'playoff_week_start',
    leagueId,
  );

  return {
    $id: assertRowId(leagueId),
    league_id: leagueId,
    season: league.season,
    name: league.name,
    status: league.status,
    previous_league_id: league.previous_league_id ?? null,
    draft_id: league.draft_id ?? null,
    playoff_week_start: playoffWeekStart,
    // Weeks 1..14 for a week-15 postseason.
    regular_season_weeks: playoffWeekStart - 1,
    num_teams: required(league.settings.num_teams ?? league.total_rosters, 'num_teams', leagueId),
    playoff_teams: required(league.settings.playoff_teams, 'playoff_teams', leagueId),
    // The finalized-week watermark. Null before Sleeper has scored anything.
    last_scored_leg: league.settings.last_scored_leg ?? null,
    roster_positions: league.roster_positions,
    scoring_settings: league.scoring_settings ? JSON.stringify(league.scoring_settings) : null,
    synced_at: syncedAt.toISOString(),
  };
}
