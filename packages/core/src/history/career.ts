import { recordPct, standingsCompare } from '../metrics/standings';
import { round2 } from '../numbers';
import type { HistorySeason } from './seasons';

/**
 * Career totals and the luck table — docs/REBUILD_PLAN.md §2h.
 *
 * One row per Sleeper user ID across every season handed in, so the 2027
 * rollover adds a season rather than a second career. Rules carried over
 * from reference/legacy/Redraft.gs:694-709:
 *
 *   - titles, finals, playoff appearances, lowest-PF seasons and last-place
 *     finishes count **completed** seasons only — a mid-season leader has no
 *     title, and a mid-season low PF is not yet a lowest-PF season
 *   - all-play % is weighted by comparisons across seasons, not an average of
 *     season percentages
 *   - unobserved is blank: a season whose luck could not be measured blanks
 *     the career luck
 */

export interface CareerRow {
  identity: string;
  manager_name: string;
  /** From the most recent season. */
  team_name: string;
  seasons_observed: number;
  completed_seasons: number;
  /** Text (`2-1-0`) so nothing becomes a date. */
  record: string;
  wins: number;
  losses: number;
  ties: number;
  /** Percent 0-100. Null before the first game. */
  win_pct: number | null;
  points_for: number;
  points_against: number;
  avg_pf_per_game: number | null;
  avg_pa_per_game: number | null;
  titles: number;
  championship_appearances: number;
  playoff_appearances: number;
  lowest_pf_seasons: number;
  last_place_finishes: number;
  all_play_comparisons: number;
  /** Percent 0-100, weighted by comparisons. Null with none. */
  all_play_pct: number | null;
  expected_wins: number;
  /** Actual minus all-play expected wins, summed over seasons. */
  luck_wins: number | null;
  points_in_losses: number;
}

/** One luck-table line. Ties list every holder; null when nothing qualifies. */
export interface LuckLine {
  value: number | null;
  holders: { identity: string; team_name: string; season: string | null }[];
}

export interface LuckTable {
  luckiest_season: LuckLine;
  unluckiest_season: LuckLine;
  /** Largest season luck in either direction, as a magnitude. */
  biggest_season_swing: LuckLine;
  luckiest_career: LuckLine;
  unluckiest_career: LuckLine;
  most_points_in_losses: LuckLine;
  most_career_points_against: LuckLine;
}

/** One row per (league, identity); a repeated archive row is not a second season. */
function distinct(seasons: readonly HistorySeason[]): HistorySeason[] {
  const seen = new Map<string, HistorySeason>();
  for (const season of seasons) {
    const key = `${season.league_id}|${season.identity}`;
    if (!seen.has(key)) seen.set(key, season);
  }
  return [...seen.values()];
}

export function careerTotals(seasons: readonly HistorySeason[]): CareerRow[] {
  const rows = distinct(seasons);
  const byLeague = new Map<string, HistorySeason[]>();
  for (const row of rows)
    byLeague.set(row.league_id, [...(byLeague.get(row.league_id) ?? []), row]);

  const lowestPf = (row: HistorySeason) =>
    row.points_for ===
    Math.min(...(byLeague.get(row.league_id) ?? []).map((peer) => peer.points_for));
  const lastPlace = (row: HistorySeason) =>
    recordPct(row) ===
    Math.min(...(byLeague.get(row.league_id) ?? []).map((peer) => recordPct(peer)));

  const byIdentity = new Map<string, HistorySeason[]>();
  for (const row of rows)
    byIdentity.set(row.identity, [...(byIdentity.get(row.identity) ?? []), row]);

  return [...byIdentity.entries()]
    .map(([identity, own]): CareerRow => {
      const ordered = own.slice().sort((a, b) => Number(a.season) - Number(b.season));
      const latest = ordered.at(-1) as HistorySeason;
      const done = ordered.filter((row) => row.season_complete);
      const sum = (pick: (row: HistorySeason) => number) =>
        ordered.reduce((total, row) => total + pick(row), 0);

      const wins = sum((row) => row.wins);
      const losses = sum((row) => row.losses);
      const ties = sum((row) => row.ties);
      const games = wins + losses + ties;
      const comparisons = sum((row) => row.all_play_comparisons);
      const expected = sum((row) => row.all_play_win_equivalents);

      return {
        identity,
        manager_name: latest.manager_name,
        team_name: latest.team_name,
        seasons_observed: ordered.length,
        completed_seasons: done.length,
        record: `${wins}-${losses}-${ties}`,
        wins,
        losses,
        ties,
        win_pct: games === 0 ? null : round2(((wins + ties / 2) / games) * 100),
        points_for: round2(sum((row) => row.points_for)),
        points_against: round2(sum((row) => row.points_against)),
        avg_pf_per_game: games === 0 ? null : round2(sum((row) => row.points_for) / games),
        avg_pa_per_game: games === 0 ? null : round2(sum((row) => row.points_against) / games),
        titles: done.filter((row) => row.champion === true).length,
        championship_appearances: done.filter((row) => row.championship_appearance === true).length,
        playoff_appearances: done.filter((row) => row.playoff_appearance === true).length,
        lowest_pf_seasons: done.filter(lowestPf).length,
        last_place_finishes: done.filter(lastPlace).length,
        all_play_comparisons: comparisons,
        all_play_pct: comparisons === 0 ? null : round2((expected / comparisons) * 100),
        expected_wins: round2(expected),
        luck_wins: ordered.some((row) => row.schedule_luck === null)
          ? null
          : round2(sum((row) => row.schedule_luck as number)),
        points_in_losses: round2(sum((row) => row.points_in_losses)),
      };
    })
    .sort((a, b) => standingsCompare(a, b) || a.identity.localeCompare(b.identity));
}

/** Every row tied at the extreme of `value`, skipping rows where it is null. */
function extreme<T>(
  rows: readonly T[],
  value: (row: T) => number | null,
  holder: (row: T) => LuckLine['holders'][number],
  pick: (values: number[]) => number,
): LuckLine {
  const measured = rows.filter((row) => value(row) !== null);
  if (measured.length === 0) return { value: null, holders: [] };
  const best = pick(measured.map((row) => value(row) as number));
  return { value: best, holders: measured.filter((row) => value(row) === best).map(holder) };
}

export function luckTable(
  seasons: readonly HistorySeason[],
  careers: readonly CareerRow[],
): LuckTable {
  const rows = distinct(seasons);
  const ofSeason = (row: HistorySeason) => ({
    identity: row.identity,
    team_name: row.team_name,
    season: row.season,
  });
  const ofCareer = (row: CareerRow) => ({
    identity: row.identity,
    team_name: row.team_name,
    season: null,
  });
  const max = (values: number[]) => Math.max(...values);
  const min = (values: number[]) => Math.min(...values);

  return {
    luckiest_season: extreme(rows, (row) => row.schedule_luck, ofSeason, max),
    unluckiest_season: extreme(rows, (row) => row.schedule_luck, ofSeason, min),
    biggest_season_swing: extreme(
      rows,
      (row) => (row.schedule_luck === null ? null : Math.abs(row.schedule_luck)),
      ofSeason,
      max,
    ),
    luckiest_career: extreme(careers, (row) => row.luck_wins, ofCareer, max),
    unluckiest_career: extreme(careers, (row) => row.luck_wins, ofCareer, min),
    most_points_in_losses: extreme(careers, (row) => row.points_in_losses, ofCareer, max),
    most_career_points_against: extreme(careers, (row) => row.points_against, ofCareer, max),
  };
}
