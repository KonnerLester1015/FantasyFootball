import type { MatchupResult, MatchupRow } from '../normalize/matchups';
import type { TeamRow } from '../normalize/rosters';
import { historyIdentity } from './identity';

/**
 * The per-week rows the record replay reads, one per manager-week.
 *
 * Nothing here is recalculated: the score and result come from `MatchupRow`.
 * What this layer adds is the identity every row is keyed on and the names
 * the record book shows.
 *
 * **Scope is the caller's**, as in metrics/analytics.ts: pass finalized
 * regular-season weeks. A live week would put a Sunday-morning score in the
 * record book.
 */

/** One manager's finalized regular-season week. */
export interface HistoryWeek {
  league_id: string;
  season: string;
  week: number;
  roster_id: number;
  identity: string;
  team_name: string;
  points: number;
  result: MatchupResult;
  /** Points minus the opponent's; null without an opponent. */
  margin: number | null;
  opponent_team_name: string | null;
}

export interface HistoryWeeksInput {
  season: string;
  matchups: readonly MatchupRow[];
  /** The season's teams, for identity and names. */
  teams: readonly TeamRow[];
}

/** The history row for each matchup row handed in. */
export function historyWeeks({ season, matchups, teams }: HistoryWeeksInput): HistoryWeek[] {
  const byRoster = new Map(teams.map((team) => [team.roster_id, team]));
  return matchups.map((row) => {
    const team = byRoster.get(row.roster_id);
    const opponent =
      row.opponent_roster_id === null ? undefined : byRoster.get(row.opponent_roster_id);
    return {
      league_id: row.league_id,
      season,
      week: row.week,
      roster_id: row.roster_id,
      identity: historyIdentity(row.league_id, row.roster_id, team?.owner_id),
      team_name: team?.team_name ?? `Roster ${row.roster_id}`,
      points: row.points,
      result: row.result,
      margin: row.margin,
      opponent_team_name:
        row.opponent_roster_id === null
          ? null
          : (opponent?.team_name ?? `Roster ${row.opponent_roster_id}`),
    };
  });
}
