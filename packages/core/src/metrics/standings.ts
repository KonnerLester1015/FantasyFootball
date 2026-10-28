import { round2 } from '../numbers';
import type { MatchupResult, MatchupRow } from '../normalize/matchups';
import type { TeamRow } from '../normalize/rosters';

/**
 * Standings and core scoring — docs/REBUILD_PLAN.md §2a, plus the weekly
 * score/opponent/margin series from §2b that the standings table drills into.
 *
 * This module owns the standings comparator. `normalize/rosters.ts`
 * deliberately leaves `rank` out of its row for that reason: one rule, one
 * implementation, which is the bug class this rebuild removes.
 *
 * Nothing here recomputes a score. Record, PF, PA and Sleeper's Max PF come
 * from the roster payload via `TeamRow`; the weekly series comes from
 * `MatchupRow`. What this module adds is the derived layer — win %, games left,
 * rank, the lowest-PF flag and the finalized PF total.
 */

/** The record fields the win-percentage rule needs. */
export interface RecordLike {
  wins: number;
  losses: number;
  ties: number;
}

/** The four keys the Sleeper standings order compares, in precedence order. */
export interface StandingsKey extends RecordLike {
  points_for: number;
  points_against: number;
}

/** One finalized week of a team's season: score, opponent, margin, result. */
export interface StandingsWeek {
  week: number;
  points: number;
  opponent_roster_id: number | null;
  opponent_points: number | null;
  /** Null only when Sleeper published no opponent for the week. */
  margin: number | null;
  result: MatchupResult;
}

/** One team's standings line. Every number is stored as a number. */
export interface StandingsEntry {
  roster_id: number;
  manager_name: string;
  team_name: string;
  /** Text (`2-1-0`) so nothing becomes a date — CLAUDE.md. */
  record: string;
  wins: number;
  losses: number;
  ties: number;
  games_played: number;
  /** Percent 0-100, 2dp: (W + ½T) / games. */
  win_pct: number;
  points_for: number;
  points_against: number;
  point_difference: number;
  /** Sleeper's own potential points. Null when Sleeper reports none. */
  max_pf_sleeper: number | null;
  /** Sum of the finalized weekly scores, which honours `custom_points`. */
  total_pf_finalized: number;
  /** Regular-season games still to play. Never negative. */
  games_left: number;
  /** 1-based. Teams that tie on all three keys share the better rank. */
  rank: number;
  /** True when another team ties this one on record, PF and PA alike. */
  rank_tied: boolean;
  /** Fewest actual PF in the league; all tied teams are flagged. */
  lowest_pf: boolean;
  /** The finalized weeks, in week order. */
  weeks: StandingsWeek[];
}

export interface StandingsInput {
  teams: readonly TeamRow[];
  /**
   * Matchup rows for the season. Unfinalized rows are ignored: a week still
   * being played has live scores but no result, and counting it would publish a
   * Sunday-morning 0 as a loss.
   */
  matchups: readonly MatchupRow[];
  /** `LeagueRow.regular_season_weeks` — one game per team per week. */
  regularSeasonWeeks: number;
}

/**
 * Win percentage as a fraction: a tie is half a win.
 *
 * 0 before the first game rather than a division by zero. Legacy rule, from
 * reference/legacy/Redraft.gs:273.
 */
export function recordPct(record: RecordLike): number {
  const games = record.wins + record.losses + record.ties;
  return games === 0 ? 0 : (record.wins + 0.5 * record.ties) / games;
}

/**
 * Sleeper's standings order: record percentage, then higher PF, then higher PA.
 *
 * Negative when `a` ranks above `b`, so it drops straight into `sort`. A return
 * of 0 is an exact tie in all three keys, which is what `rank_tied` reports —
 * this comparator does not invent a winner for one. Legacy rule, from
 * reference/legacy/Redraft.gs:274.
 */
export function standingsCompare(a: StandingsKey, b: StandingsKey): number {
  return (
    recordPct(b) - recordPct(a) ||
    b.points_for - a.points_for ||
    b.points_against - a.points_against
  );
}

function keyOf(team: TeamRow): StandingsKey {
  return {
    wins: team.wins,
    losses: team.losses,
    ties: team.ties,
    points_for: team.points_for,
    points_against: team.points_against,
  };
}

/** The finalized weeks for one roster, in week order. */
function weeksFor(rosterId: number, matchups: readonly MatchupRow[]): StandingsWeek[] {
  return matchups
    .filter((row) => row.roster_id === rosterId && row.result !== 'PENDING')
    .sort((a, b) => a.week - b.week)
    .map((row) => ({
      week: row.week,
      points: row.points,
      opponent_roster_id: row.opponent_roster_id,
      opponent_points: row.opponent_points,
      margin: row.margin,
      result: row.result,
    }));
}

/**
 * The standings, best team first.
 *
 * Ties on all three comparator keys share the better rank and are ordered by
 * roster id, so two runs over the same data return the same array — the stored
 * numbers have to be stable for the site to render them without recalculating.
 */
export function buildStandings({
  teams,
  matchups,
  regularSeasonWeeks,
}: StandingsInput): StandingsEntry[] {
  const ordered = teams
    .slice()
    .sort((a, b) => standingsCompare(keyOf(a), keyOf(b)) || a.roster_id - b.roster_id);

  // A team with no score at all is not the lowest scorer in the league; it is
  // unobserved. There is no such team today — buildTeamRows refuses a roster
  // without PF — but the flag must not be awarded by a missing number.
  const scored = ordered.filter((team) => Number.isFinite(team.points_for));
  const lowestPf = scored.length === 0 ? null : Math.min(...scored.map((t) => t.points_for));

  const keys = ordered.map(keyOf);

  return ordered.map((team) => {
    const key = keyOf(team);
    const gamesPlayed = team.wins + team.losses + team.ties;
    const weeks = weeksFor(team.roster_id, matchups);

    // Ties share the better rank: rank is the position of the first team that
    // compares equal, so a two-way tie reads 1, 1, 3 and not 1, 2, 3.
    const first = keys.findIndex((other) => standingsCompare(other, key) === 0);
    const lastFromEnd = keys
      .slice()
      .reverse()
      .findIndex((other) => standingsCompare(other, key) === 0);
    const last = keys.length - 1 - lastFromEnd;

    return {
      roster_id: team.roster_id,
      manager_name: team.manager_name,
      team_name: team.team_name,
      record: `${team.wins}-${team.losses}-${team.ties}`,
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      games_played: gamesPlayed,
      win_pct: round2(100 * recordPct(key)),
      points_for: team.points_for,
      points_against: team.points_against,
      point_difference: round2(team.points_for - team.points_against),
      max_pf_sleeper: team.max_pf_sleeper,
      total_pf_finalized: round2(weeks.reduce((total, week) => total + week.points, 0)),
      // One game per team per week, so the games left are the weeks left. Never
      // negative: a league that adds a median game would otherwise report -1.
      games_left: Math.max(0, regularSeasonWeeks - gamesPlayed),
      rank: first + 1,
      rank_tied: last > first,
      lowest_pf: lowestPf !== null && team.points_for === lowestPf,
      weeks,
    };
  });
}
