import type { SeasonAnalyticsRow } from '../metrics/analytics';
import type { BracketSlotRow } from '../normalize/brackets';
import type { MatchupResult, MatchupRow } from '../normalize/matchups';
import type { TeamRow } from '../normalize/rosters';
import { historyIdentity } from './identity';

/**
 * The per-season and per-week history layer — the inputs career totals and
 * the record replay read, one row per manager-season and per manager-week.
 *
 * Nothing here is recalculated: record, PF and PA come from `TeamRow`;
 * all-play, luck and points in losses from `seasonAnalytics`; the score and
 * result from `MatchupRow`. What this layer adds is the identity every row is
 * keyed on and the postseason facts of a completed season.
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

/** One manager's season. */
export interface HistorySeason {
  league_id: string;
  season: string;
  roster_id: number;
  identity: string;
  manager_name: string;
  team_name: string;
  season_complete: boolean;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  all_play_comparisons: number;
  all_play_win_equivalents: number;
  /** Null when a counted week had no opponent (see SeasonAnalyticsRow). */
  schedule_luck: number | null;
  points_in_losses: number;
  /** Null until the season is complete, or when no winners bracket exists. */
  playoff_appearance: boolean | null;
  /** Null until the season is complete with a decided title game. */
  champion: boolean | null;
  championship_appearance: boolean | null;
}

export interface HistoryWeeksInput {
  season: string;
  matchups: readonly MatchupRow[];
  /** The season's teams, for identity and names. */
  teams: readonly TeamRow[];
}

export interface HistorySeasonsInput {
  teams: readonly TeamRow[];
  analytics: readonly SeasonAnalyticsRow[];
  /** The season's bracket rows; only the winners bracket is read. */
  brackets: readonly BracketSlotRow[];
  seasonComplete: boolean;
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

/** One history row per team, roster order. */
export function historySeasons({
  teams,
  analytics,
  brackets,
  seasonComplete,
}: HistorySeasonsInput): HistorySeason[] {
  const winners = brackets.filter((game) => game.bracket === 'winners');
  const qualified = new Set(
    winners.flatMap((game) => [
      game.team1_roster_id,
      game.team2_roster_id,
      game.winner_roster_id,
      game.loser_roster_id,
    ]),
  );
  const title = winners.find((game) => game.placement === 1);
  const decided = title !== undefined && title.winner_roster_id !== null;

  return teams
    .slice()
    .sort((a, b) => a.roster_id - b.roster_id)
    .map((team) => {
      const season = analytics.find((row) => row.roster_id === team.roster_id);
      const finalists = decided
        ? [
            title.team1_roster_id,
            title.team2_roster_id,
            title.winner_roster_id,
            title.loser_roster_id,
          ]
        : [];
      return {
        league_id: team.league_id,
        season: team.season,
        roster_id: team.roster_id,
        identity: historyIdentity(team.league_id, team.roster_id, team.owner_id),
        manager_name: team.manager_name,
        team_name: team.team_name,
        season_complete: seasonComplete,
        wins: team.wins,
        losses: team.losses,
        ties: team.ties,
        points_for: team.points_for,
        points_against: team.points_against,
        all_play_comparisons: season?.all_play_comparisons ?? 0,
        all_play_win_equivalents: season?.all_play_win_equivalents ?? 0,
        schedule_luck: season?.schedule_luck ?? null,
        points_in_losses: season?.points_in_losses ?? 0,
        playoff_appearance:
          seasonComplete && winners.length > 0 ? qualified.has(team.roster_id) : null,
        champion: seasonComplete && decided ? title.winner_roster_id === team.roster_id : null,
        championship_appearance:
          seasonComplete && decided ? finalists.includes(team.roster_id) : null,
      };
    });
}
