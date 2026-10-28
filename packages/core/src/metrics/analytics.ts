import { round2 } from '../numbers';
import type { MatchupRow } from '../normalize/matchups';

/**
 * Weekly analytics — docs/REBUILD_PLAN.md §2b.
 *
 * All-play %, schedule luck, consistency, weekly crowns and last places, the
 * 150/200 thresholds, and the three margin records (biggest win, narrowest win,
 * highest-scoring loss).
 *
 * Three pure functions over the same input, the normalized `matchups` rows:
 * `weeklyAnalytics` for the per-roster-week layer, `seasonAnalytics` for the
 * per-team season layer, `leagueRecords` for the record book. Each recomputes
 * what it needs rather than taking a half-built result, so no caller can hand
 * in two halves that disagree — the bug class this rebuild removes.
 *
 * **Scope is the caller's.** Every function measures exactly the rows handed
 * in. Ingest passes the finalized regular-season weeks; a postseason view
 * passes its own. Nothing here filters by `finalized` or phase, because two
 * callers disagreeing about what "the season" means is how the Sheets version
 * ended up with the same metric reading differently on two tabs.
 *
 * Rules carried over from reference/legacy/FamilyFeud_Redraft.gs:252-271 and
 * :660 (the weekly top/last definition):
 *
 *   - All-play compares against the other rosters **in the same week**, never
 *     across weeks. A tie is half a win, both ways.
 *   - Season all-play % weights by comparisons, not by averaging the weekly
 *     percentages — they differ whenever a week has a different roster count.
 *   - Crowns and last places are shared by every tied roster.
 *   - "> 150" and "> 200" are strictly greater.
 *   - Consistency is the **population** standard deviation, matching the sheet.
 *   - A tie is not a victory, so it holds neither margin record.
 */

/** The results that mean a head-to-head game actually happened. */
const DECIDED: ReadonlySet<MatchupRow['result']> = new Set<MatchupRow['result']>(['W', 'L', 'T']);

/** Win credit for a decided game: a tie is half a win. */
function winCredit(result: MatchupRow['result']): number {
  return result === 'W' ? 1 : result === 'T' ? 0.5 : 0;
}

/** One roster's week, with the league-wide comparisons resolved. */
export interface WeeklyAnalyticsRow {
  league_id: string;
  week: number;
  roster_id: number;
  /** The score that counted, `custom_points` already honoured upstream. */
  points: number;
  /** Other rosters' scores this one beat that week. */
  all_play_wins: number;
  all_play_ties: number;
  /** Other rosters playing that week. 13 in a 14-team league. */
  all_play_games: number;
  /** Percent 0-100, (W + ½T) / games. Blank when nobody else played. */
  all_play_pct: number | null;
  /**
   * The same share expressed as expected wins, 0-1.
   *
   * Deliberately **not** rounded, unlike `all_play_pct`: schedule luck is the
   * sum of these across a season, and rounding each week first would drift the
   * season number away from the sheet's. The rounding happens once, on the
   * season total.
   */
  all_play_expected_wins: number | null;
  /** Highest actual score in the league that week; every tied roster shares it. */
  weekly_crown: boolean;
  /** Lowest actual score that week; shared on a tie. Feeds "most last-place weeks". */
  weekly_last: boolean;
  over_150: boolean;
  over_200: boolean;
}

/** One roster's season. */
export interface SeasonAnalyticsRow {
  league_id: string;
  roster_id: number;
  /** Total other-roster scores compared against, all weeks. */
  all_play_comparisons: number;
  /** Win equivalents from those comparisons; fractional when ties occurred. */
  all_play_win_equivalents: number;
  /** Percent 0-100, weighted by comparisons. Blank with no comparisons. */
  all_play_pct: number | null;
  /**
   * Actual win credit minus all-play expected wins. Positive means the schedule
   * was kind. Blank unless every counted week had an opponent — a bye has no
   * head-to-head result to credit, and scoring it as 0 would read as bad luck.
   */
  schedule_luck: number | null;
  /** Population standard deviation of the weekly scores. Blank with no weeks. */
  consistency: number | null;
  weekly_crowns: number;
  last_place_weeks: number;
  weeks_over_150: number;
  weeks_over_200: number;
  /** Most points scored in a game still lost, and its week. Blank with no losses. */
  highest_scoring_loss: number | null;
  highest_scoring_loss_week: number | null;
  /** Points scored in losses. A real 0 when there were none. */
  points_in_losses: number;
  weeks_counted: number;
}

/** One holder of one record. Ties mean several. */
export interface RecordHolder {
  roster_id: number;
  opponent_roster_id: number | null;
  week: number;
  value: number;
}

/** The margin record book over the rows handed in (§2b). */
export interface LeagueRecords {
  /** Largest winner-minus-opponent margin. */
  largest_margin: RecordHolder[];
  /** Smallest winning margin. A tie does not qualify. */
  narrowest_victory: RecordHolder[];
  /** Most points scored in a game that was still lost. */
  highest_scoring_loss: RecordHolder[];
}

/** Group rows by week, preserving week order. */
function byWeek(matchups: readonly MatchupRow[]): Map<number, MatchupRow[]> {
  const weeks = new Map<number, MatchupRow[]>();
  for (const matchup of matchups) {
    const group = weeks.get(matchup.week) ?? [];
    group.push(matchup);
    weeks.set(matchup.week, group);
  }
  return new Map([...weeks.entries()].sort(([a], [b]) => a - b));
}

/**
 * The per-roster-week analytics layer.
 *
 * This is the half of a `matchups` row that needs the whole week rather than
 * one pairing; the caller merges it with the normalizer's
 * half before writing.
 */
export function weeklyAnalytics(matchups: readonly MatchupRow[]): WeeklyAnalyticsRow[] {
  const rows: WeeklyAnalyticsRow[] = [];

  for (const [week, inWeek] of byWeek(matchups)) {
    const scores = inWeek.map((matchup) => matchup.points);
    const highest = Math.max(...scores);
    const lowest = Math.min(...scores);

    for (const matchup of inWeek) {
      const mine = matchup.points;
      const others = inWeek.filter((other) => other.roster_id !== matchup.roster_id);

      const wins = others.filter((other) => mine > other.points).length;
      const ties = others.filter((other) => mine === other.points).length;
      const share = others.length === 0 ? null : (wins + ties * 0.5) / others.length;

      rows.push({
        league_id: matchup.league_id,
        week,
        roster_id: matchup.roster_id,
        points: matchup.points,
        all_play_wins: wins,
        all_play_ties: ties,
        all_play_games: others.length,
        all_play_pct: share === null ? null : round2(share * 100),
        all_play_expected_wins: share,
        // `>=` so every tied roster shares the crown, and likewise last place.
        weekly_crown: mine >= highest,
        weekly_last: mine <= lowest,
        over_150: mine > 150,
        over_200: mine > 200,
      });
    }
  }

  return rows;
}

/** The per-team season layer. */
export function seasonAnalytics(matchups: readonly MatchupRow[]): SeasonAnalyticsRow[] {
  const weekly = weeklyAnalytics(matchups);

  const rosters = new Map<number, { league_id: string; games: MatchupRow[] }>();
  for (const matchup of matchups) {
    const group = rosters.get(matchup.roster_id) ?? {
      league_id: matchup.league_id,
      games: [],
    };
    group.games.push(matchup);
    rosters.set(matchup.roster_id, group);
  }

  return [...rosters.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rosterId, { league_id, games }]) => {
      const own = weekly.filter((entry) => entry.roster_id === rosterId);

      const comparisons = own.reduce((sum, entry) => sum + entry.all_play_games, 0);
      const equivalents = own.reduce(
        (sum, entry) => sum + entry.all_play_wins + entry.all_play_ties * 0.5,
        0,
      );

      // Luck needs a head-to-head result for every week measured, so a bye
      // blanks it rather than counting as a loss.
      const decided = games.filter((game) => DECIDED.has(game.result));
      const complete = decided.length === games.length && games.length > 0;
      const actual = decided.reduce((sum, game) => sum + winCredit(game.result), 0);
      const expected = own.reduce((sum, entry) => sum + (entry.all_play_expected_wins ?? 0), 0);

      const mean =
        games.length === 0
          ? null
          : games.reduce((sum, game) => sum + game.points, 0) / games.length;
      const variance =
        mean === null
          ? null
          : games.reduce((sum, game) => sum + (game.points - mean) ** 2, 0) / games.length;

      const losses = games.filter((game) => game.result === 'L');
      const worst = losses.reduce<MatchupRow | null>(
        (best, game) => (best === null || game.points > best.points ? game : best),
        null,
      );

      return {
        league_id,
        roster_id: rosterId,
        all_play_comparisons: comparisons,
        all_play_win_equivalents: equivalents,
        all_play_pct: comparisons === 0 ? null : round2((100 * equivalents) / comparisons),
        schedule_luck: complete ? round2(actual - expected) : null,
        consistency: variance === null ? null : round2(Math.sqrt(variance)),
        weekly_crowns: own.filter((entry) => entry.weekly_crown).length,
        last_place_weeks: own.filter((entry) => entry.weekly_last).length,
        weeks_over_150: own.filter((entry) => entry.over_150).length,
        weeks_over_200: own.filter((entry) => entry.over_200).length,
        highest_scoring_loss: worst === null ? null : worst.points,
        highest_scoring_loss_week: worst === null ? null : worst.week,
        points_in_losses: round2(losses.reduce((sum, game) => sum + game.points, 0)),
        weeks_counted: games.length,
      };
    });
}

/** Every row holding the extreme value, so a tie shares the record. */
function holdersOf(
  games: readonly MatchupRow[],
  valueOf: (game: MatchupRow) => number,
  pick: 'max' | 'min',
): RecordHolder[] {
  if (games.length === 0) return [];

  const values = games.map(valueOf);
  const best = pick === 'max' ? Math.max(...values) : Math.min(...values);

  return games
    .filter((game) => valueOf(game) === best)
    .map((game) => ({
      roster_id: game.roster_id,
      opponent_roster_id: game.opponent_roster_id,
      week: game.week,
      value: round2(valueOf(game)),
    }));
}

/**
 * The margin record book.
 *
 * A victory needs a positive margin, which is what keeps a tie out of both
 * margin records (legacy rule, reference/legacy/FamilyFeud_Redraft.gs:719).
 */
export function leagueRecords(matchups: readonly MatchupRow[]): LeagueRecords {
  const wins = matchups.filter((game) => game.result === 'W' && (game.margin ?? 0) > 0);
  const losses = matchups.filter((game) => game.result === 'L');

  return {
    largest_margin: holdersOf(wins, (game) => game.margin ?? 0, 'max'),
    narrowest_victory: holdersOf(wins, (game) => game.margin ?? 0, 'min'),
    highest_scoring_loss: holdersOf(losses, (game) => game.points, 'max'),
  };
}
