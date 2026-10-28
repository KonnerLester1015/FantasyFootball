import { careerTotals, luckTable } from '../history/career';
import { replayRecords } from '../history/records';
import { historySeasons, historyWeeks, type HistorySeason, type HistoryWeek } from '../history/seasons';
import { seasonAnalytics } from '../metrics/analytics';
import { buildBracketSlotRows } from '../normalize/brackets';
import { buildMatchupRows } from '../normalize/matchups';
import { buildTeamRows } from '../normalize/rosters';
import { buildIdentityIndex } from '../normalize/users';
import type {
  SleeperBracketGame,
  SleeperLeague,
  SleeperMatchup,
  SleeperRoster,
  SleeperUser,
} from '../sleeper/types';
import type { AsOf, HistoryDashboard } from './model';

/**
 * One season's slice of the history layer, computed the same way
 * `buildSeasonModel` computes it for the current season — so a caller that
 * walks `previous_league_id` back through a league's prior seasons gets
 * numbers built by the exact same rules, not a second implementation of them.
 *
 * Kept separate from `buildSeasonModel` because a prior, fully-scored season
 * needs none of the current-season machinery (playoff forecast, trades,
 * live-week handling) — only the history layer.
 */

export interface SeasonHistorySliceInput {
  league: SleeperLeague;
  users: readonly SleeperUser[];
  rosters: readonly SleeperRoster[];
  /** Every week held, scored or not. */
  matchups: ReadonlyMap<number, readonly SleeperMatchup[]>;
  winnersBracket: readonly SleeperBracketGame[];
  /** Normally `league.settings.last_scored_leg`. */
  scoredThroughWeek: number;
  now: Date;
}

export interface SeasonHistorySlice {
  seasons: HistorySeason[];
  weeks: HistoryWeek[];
}

export function buildSeasonHistorySlice(input: SeasonHistorySliceInput): SeasonHistorySlice {
  const { league, users, rosters } = input;
  const leagueId = league.league_id;
  const season = league.season;
  const regularWeeks = (league.settings.playoff_week_start ?? 15) - 1;
  const scoredThrough = Math.max(0, input.scoredThroughWeek);
  const seasonComplete = league.status === 'complete';
  const isScored = (week: number): boolean => week >= 1 && week <= scoredThrough;

  const identities = buildIdentityIndex({ users, rosters });
  const teams = buildTeamRows({ leagueId, season, rosters, identities, syncedAt: input.now });

  const matchupRows = [...input.matchups.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([week, matchups]) => buildMatchupRows({ leagueId, week, matchups, finalized: isScored(week) }));
  const scoredRows = matchupRows.filter((row) => isScored(row.week));
  const scoredRegular = scoredRows.filter((row) => row.week <= regularWeeks);

  const bracketRows = buildBracketSlotRows({
    leagueId,
    bracket: 'winners',
    games: input.winnersBracket,
  });

  const seasons = historySeasons({
    teams,
    analytics: seasonAnalytics(scoredRegular),
    brackets: bracketRows,
    seasonComplete,
  });
  const weeks = historyWeeks({ season, matchups: scoredRows, teams });

  return { seasons, weeks };
}

export interface CombineHistoryInput {
  /** One slice per season, any order. */
  slices: readonly SeasonHistorySlice[];
  /** The current season's as-of stamp; the combined dashboard describes "now". */
  asOf: AsOf;
  now: Date;
}

/** Every season's slice, combined into the one multi-season history dashboard. */
export function combineHistory({ slices, asOf, now }: CombineHistoryInput): HistoryDashboard {
  const seasons = slices.flatMap((slice) => slice.seasons);
  const weeks = slices.flatMap((slice) => slice.weeks);
  const careers = careerTotals(seasons);
  const replay = replayRecords({ weeks, seasons, observedAt: now });

  return {
    as_of: asOf,
    seasons,
    careers,
    luck: luckTable(seasons, careers),
    record_book: replay.book,
    season_pf: seasons
      .map((row) => ({
        identity: row.identity,
        team_name: row.team_name,
        season: row.season,
        points_for: row.points_for,
      }))
      .sort((a, b) => Number(a.season) - Number(b.season) || a.identity.localeCompare(b.identity)),
  };
}
