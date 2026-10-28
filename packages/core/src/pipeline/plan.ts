import type { SleeperLeague } from '../sleeper/types';

/**
 * Season-calendar math every Sleeper fetch needs — docs/REBUILD_PLAN.md §3.
 */

/**
 * The championship week: the postseason start plus one week per round. Six
 * playoff teams is three rounds, so a week-15 start ends in week 17.
 */
export function seasonLastWeek(league: SleeperLeague): number {
  const start = league.settings.playoff_week_start ?? 15;
  const teams = Math.max(2, league.settings.playoff_teams ?? 2);
  return start + Math.ceil(Math.log2(teams)) - 1;
}

/**
 * The week the season is in, clamped to the league's own calendar: a complete
 * league reads as its championship week, and the offseason reads 0.
 */
export function currentSeasonWeek(league: SleeperLeague, nflWeek: number): number {
  const lastWeek = seasonLastWeek(league);
  return league.status === 'complete' ? lastWeek : Math.max(0, Math.min(nflWeek, lastWeek));
}

/**
 * True once Sleeper's bracket is the real one rather than a projection from
 * today's standings: two weeks before the postseason, or once the league is
 * complete.
 */
export function bracketsAreReal(league: SleeperLeague, currentWeek: number): boolean {
  const playoffWeekStart = league.settings.playoff_week_start ?? 15;
  return league.status === 'complete' || currentWeek >= playoffWeekStart - 2;
}
