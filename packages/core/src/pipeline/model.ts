import { replayRecords, type RecordBookEntry, type RecordEventRow } from '../history/records';
import { historyWeeks } from '../history/weeks';
import { activityCounts, type ActivityRow } from '../metrics/activity';
import { positionLeaders, type PositionLeadersWeek } from '../metrics/leaders';
import {
  leagueRecords,
  seasonAnalytics,
  weeklyAnalytics,
  type LeagueRecords,
  type SeasonAnalyticsRow,
  type WeeklyAnalyticsRow,
} from '../metrics/analytics';
import { rollUpLineups, weeklyLineups, type WeeklyLineupRow } from '../metrics/lineup';
import { buildStandings, type StandingsEntry } from '../metrics/standings';
import {
  tradeEstimates,
  tradeRecap,
  type TradeEstimateRow,
  type TradeRecapRow,
} from '../metrics/trades';
import { round2 } from '../numbers';
import { bracketSlotLabel, buildBracketSlotRows, type BracketSlotRow } from '../normalize/brackets';
import {
  buildDraftPickRows,
  buildDraftRow,
  type DraftPickRow,
  type DraftRow,
} from '../normalize/drafts';
import { dashboardId, weekRowId } from '../normalize/ids';
import { buildLeagueRow, type LeagueRow } from '../normalize/league';
import {
  buildMatchupRows,
  buildPlayerScoreRows,
  type MatchupRow,
  type PlayerScoreRow,
} from '../normalize/matchups';
import { buildPlayerRows, type PlayerRow } from '../normalize/players';
import { buildTeamRows, type TeamRow } from '../normalize/rosters';
import {
  buildTradeRows,
  buildTransactionRows,
  type TradeRow,
  type TransactionRow,
} from '../normalize/transactions';
import { buildIdentityIndex, buildManagerRows, type ManagerRow } from '../normalize/users';
import {
  forecastPlayoffs,
  playoffSettings,
  type PlayoffForecast,
  type PlayoffSimConfig,
} from '../playoff/forecast';
import type {
  PlayerDictionary,
  SleeperBracketGame,
  SleeperDraft,
  SleeperDraftPick,
  SleeperLeague,
  SleeperMatchup,
  SleeperRoster,
  SleeperTransaction,
  SleeperUser,
} from '../sleeper/types';

/**
 * The whole season, from raw Sleeper payloads to every stored row and read model.
 *
 * This is the one place the core modules are composed, so ingest, the backfill
 * script and the golden test all get the same numbers by construction: none of
 * them can wire two modules together differently. It is pure — every input is
 * handed in, including the clock — so the same payloads always produce the same
 * output, which is what lets a re-run replace rows instead of drifting them.
 *
 * Scope rules, applied once here and nowhere else:
 *
 *   - **Scored weeks** are `1..scoredThroughWeek` (Sleeper's `last_scored_leg`).
 *     A week still being played has live scores and no result.
 *   - **Season metrics** (standings extras, all-play, luck, Max PF, crowns, the
 *     record book's margins) use scored *regular-season* weeks.
 *   - **History weeks** use every scored week, postseason included.
 *   - **The playoff model** reads every regular-season week: results for the
 *     scored ones, Sleeper's published pairings for the rest.
 */

export interface SeasonRules {
  playoffSim: PlayoffSimConfig;
}

export interface SeasonModelInput {
  league: SleeperLeague;
  users: readonly SleeperUser[];
  rosters: readonly SleeperRoster[];
  /** Every week held, scored or not: the cache plus this run's pulls. */
  matchups: ReadonlyMap<number, readonly SleeperMatchup[]>;
  transactions: ReadonlyMap<number, readonly SleeperTransaction[]>;
  winnersBracket: readonly SleeperBracketGame[];
  losersBracket: readonly SleeperBracketGame[];
  draft: SleeperDraft | null;
  draftPicks: readonly SleeperDraftPick[];
  players: PlayerDictionary;
  /** When the player dictionary was fetched. */
  playersSyncedAt: Date;
  /** Normally `last_scored_leg`. The golden test passes 4. */
  scoredThroughWeek: number;
  /** The week being played now (`FetchPlan.currentWeek`). */
  currentWeek: number;
  /** Frozen weeks and when they were frozen (`weeks.finalized_at`). */
  frozenWeeks: ReadonlyMap<number, string>;
  rules: SeasonRules;
  now: Date;
  coreVersion: string;
}

/** A row of `weeks`. */
export interface WeekRow {
  $id: string;
  league_id: string;
  week: number;
  season_type: 'regular' | 'post';
  finalized: boolean;
  finalized_at: string | null;
  scores_complete: boolean;
  captured_at: string;
}

/** A `teams` row with the derived columns merged in. */
export interface TeamTableRow extends TeamRow {
  max_pf_calculated: number | null;
  max_pf_calc_status: string;
  total_pf_finalized_regular: number;
  total_pf_finalized_all: number;
  rank: number;
}

/** A `matchups` row with the analytics columns merged in. */
export interface MatchupTableRow extends MatchupRow {
  optimal_points: number | null;
  optimal_status: string | null;
  bench_gap: number | null;
  efficiency: number | null;
  /** Win equivalents against the rest of the league that week: W + ½T. */
  all_play_wins: number | null;
  all_play_pct: number | null;
  schedule_luck: number | null;
  weekly_high: boolean | null;
  weekly_low: boolean | null;
}

export interface PlayerScoreTableRow extends PlayerScoreRow {
  optimal_starter: boolean;
}

export interface TradeTableRow extends TradeRow {
  /** JSON: roster ID -> measured points (null when unobserved). */
  measured_points: string;
  estimate_note: string;
}

/** A `dashboards` / `private_dashboards` row. */
export interface DashboardRow<View extends string> {
  $id: string;
  league_id: string;
  view: View;
  /** The read model, as JSON text. */
  payload: string;
  generated_at: string;
  core_version: string;
  finalized_through_week: number | null;
}

export interface SeasonTables {
  leagues: LeagueRow[];
  managers: ManagerRow[];
  teams: TeamTableRow[];
  weeks: WeekRow[];
  matchups: MatchupTableRow[];
  player_scores: PlayerScoreTableRow[];
  players: PlayerRow[];
  transactions: TransactionRow[];
  trades: TradeTableRow[];
  bracket_slots: BracketSlotRow[];
  drafts: DraftRow[];
  draft_picks: DraftPickRow[];
  record_events: RecordEventRow[];
}

// ---------------------------------------------------------------------------
// Read models. Every number is a number; formatting happens in the browser.
// ---------------------------------------------------------------------------

export interface AsOf {
  season: string;
  /** The week being played now, clamped to the league calendar. */
  current_week: number;
  /** Last scored week. Every season number is through this week. */
  finalized_through_week: number;
  regular_season_weeks: number;
  season_complete: boolean;
}

/** One standings line with every season metric for that team. */
export interface CurrentTeam extends StandingsEntry {
  owner_id: string | null;
  max_pf_calculated: number | null;
  points_left_on_bench: number | null;
  efficiency: number | null;
  all_play_pct: number | null;
  schedule_luck: number | null;
  consistency: number | null;
  weekly_crowns: number;
  last_place_weeks: number;
  weeks_over_150: number;
  weeks_over_200: number;
  highest_scoring_loss: number | null;
  points_in_losses: number;
  add_transactions: number;
  playoff_chance_pct: number | null;
  position_now: 'inside' | 'outside' | 'tied_at_cutoff' | null;
  playoff_status: string;
}

export interface CurrentWeekCell {
  week: number;
  roster_id: number;
  points: number;
  opponent_roster_id: number | null;
  margin: number | null;
  result: MatchupRow['result'];
  all_play_pct: number | null;
  weekly_crown: boolean;
  weekly_last: boolean;
  optimal_points: number | null;
  bench_gap: number | null;
}

export interface CurrentDashboard {
  league: { league_id: string; name: string; season: string; status: string };
  as_of: AsOf;
  teams: CurrentTeam[];
  weeks: CurrentWeekCell[];
  records: LeagueRecords;
  trades: { recap: TradeRecapRow[]; estimates: TradeEstimateRow[] };
}

export interface BracketGameView extends BracketSlotRow {
  team1_label: string | null;
  team2_label: string | null;
}

export interface PlayoffsDashboard {
  as_of: AsOf;
  forecast: PlayoffForecast;
  brackets: { winners: BracketGameView[]; losers: BracketGameView[] };
}

/** This season's record book. Nothing here spans seasons. */
export interface HistoryDashboard {
  as_of: AsOf;
  record_book: RecordBookEntry[];
}

export interface SummaryDashboard {
  as_of: AsOf;
  /** The latest scored week the recap describes. Null before week 1 is scored. */
  week: number | null;
  record_breaks: RecordEventRow[];
  /** Top rostered scorer at each card position, for every scored week, oldest first. */
  position_leaders: PositionLeadersWeek[];
  cards: {
    high_score: { roster_id: number; points: number }[];
    low_score: { roster_id: number; points: number }[];
    records: LeagueRecords;
  };
  teams: {
    roster_id: number;
    team_name: string;
    latest_points: number | null;
    latest_all_play_pct: number | null;
    season_all_play_pct: number | null;
    latest_schedule_luck: number | null;
    season_schedule_luck: number | null;
    weekly_crowns: number;
    playoff_chance_pct: number | null;
    playoff_status: string;
    position_now: 'inside' | 'outside' | 'tied_at_cutoff' | null;
  }[];
}

export interface SeasonModel {
  tables: SeasonTables;
  dashboards: {
    current: CurrentDashboard;
    history: HistoryDashboard;
    playoffs: PlayoffsDashboard;
    summary: SummaryDashboard;
  };
  dashboardRows: DashboardRow<'current' | 'history' | 'playoffs' | 'summary'>[];
}

const winCredit = (result: MatchupRow['result']): number | null =>
  result === 'W' ? 1 : result === 'T' ? 0.5 : result === 'L' ? 0 : null;

function rowsOf<T>(map: ReadonlyMap<number, readonly T[]>): [number, readonly T[]][] {
  return [...map.entries()].sort(([a], [b]) => a - b);
}

export function buildSeasonModel(input: SeasonModelInput): SeasonModel {
  const { league, users, rosters, rules, now, coreVersion } = input;
  const leagueId = league.league_id;
  const season = league.season;

  const leagueRow = buildLeagueRow({ league, syncedAt: now });
  const regularWeeks = leagueRow.regular_season_weeks;
  const scoredThrough = Math.max(0, input.scoredThroughWeek);
  const seasonComplete = league.status === 'complete';
  const isScored = (week: number): boolean => week >= 1 && week <= scoredThrough;

  const identities = buildIdentityIndex({ users, rosters });
  const teamRows = buildTeamRows({ leagueId, season, rosters, identities, syncedAt: now });
  const rosterIds = teamRows.map((team) => team.roster_id);
  const teamName = (rosterId: number): string =>
    teamRows.find((team) => team.roster_id === rosterId)?.team_name ?? `Roster ${rosterId}`;

  // --- Weekly layer --------------------------------------------------------
  const matchupWeeks = rowsOf(input.matchups);
  const matchupRows = matchupWeeks.flatMap(([week, matchups]) =>
    buildMatchupRows({ leagueId, week, matchups, finalized: isScored(week) }),
  );
  const scoredRows = matchupRows.filter((row) => isScored(row.week));
  const scoredRegular = scoredRows.filter((row) => row.week <= regularWeeks);

  const lineups: WeeklyLineupRow[] = matchupWeeks
    .filter(([week]) => isScored(week))
    .flatMap(([week, matchups]) =>
      weeklyLineups({
        leagueId,
        week,
        matchups,
        rosterPositions: league.roster_positions,
        players: input.players,
      }),
    );
  const lineupOf = (week: number, rosterId: number): WeeklyLineupRow | undefined =>
    lineups.find((row) => row.week === week && row.roster_id === rosterId);

  const weekly: WeeklyAnalyticsRow[] = weeklyAnalytics(scoredRows);
  const weeklyOf = (week: number, rosterId: number): WeeklyAnalyticsRow | undefined =>
    weekly.find((row) => row.week === week && row.roster_id === rosterId);

  const matchupTable: MatchupTableRow[] = matchupRows.map((row) => {
    const lineup = lineupOf(row.week, row.roster_id);
    const analytics = weeklyOf(row.week, row.roster_id);
    const credit = winCredit(row.result);
    const expected = analytics?.all_play_expected_wins ?? null;
    return {
      ...row,
      optimal_points: lineup?.optimal_points ?? null,
      optimal_status: lineup?.status ?? null,
      bench_gap: lineup?.bench_gap ?? null,
      efficiency: lineup?.efficiency ?? null,
      all_play_wins:
        analytics === undefined ? null : analytics.all_play_wins + analytics.all_play_ties / 2,
      all_play_pct: analytics?.all_play_pct ?? null,
      schedule_luck: credit === null || expected === null ? null : round2(credit - expected),
      weekly_high: analytics?.weekly_crown ?? null,
      weekly_low: analytics?.weekly_last ?? null,
    };
  });

  const playerScores: PlayerScoreTableRow[] = matchupWeeks.flatMap(([week, matchups]) => {
    const rows = buildPlayerScoreRows({
      leagueId,
      week,
      matchups,
      rosterPositions: league.roster_positions,
    });
    return rows.map((row) => ({
      ...row,
      optimal_starter:
        lineupOf(week, row.roster_id)?.lineup.some((slot) => slot.player_id === row.player_id) ??
        false,
    }));
  });
  const scoredPlayerScores = playerScores.filter((row) => isScored(row.week));

  // --- Season layer --------------------------------------------------------
  const standings = buildStandings({
    teams: teamRows,
    matchups: scoredRegular,
    regularSeasonWeeks: regularWeeks,
  });
  const seasonRows: SeasonAnalyticsRow[] = seasonAnalytics(scoredRegular);
  const lineupTotals = rollUpLineups(lineups.filter((row) => row.week <= regularWeeks));

  const teamsTable: TeamTableRow[] = teamRows.map((team) => {
    const totals = lineupTotals.find((row) => row.roster_id === team.roster_id);
    const ownRows = scoredRows.filter((row) => row.roster_id === team.roster_id);
    const sum = (rows: MatchupRow[]): number => round2(rows.reduce((s, r) => s + r.points, 0));
    return {
      ...team,
      max_pf_calculated: totals?.max_pf_calculated ?? null,
      max_pf_calc_status:
        totals === undefined
          ? 'NO_WEEKS'
          : totals.weeks_unsolved === 0
            ? 'OK'
            : `UNSOLVED_WEEKS_${totals.weeks_unsolved}`,
      total_pf_finalized_regular: sum(ownRows.filter((row) => row.week <= regularWeeks)),
      total_pf_finalized_all: sum(ownRows),
      rank: standings.find((row) => row.roster_id === team.roster_id)?.rank ?? 0,
    };
  });

  // --- Transactions and trades --------------------------------------------
  const txWeeks = rowsOf(input.transactions);
  const transactionRows = txWeeks.flatMap(([week, transactions]) =>
    buildTransactionRows({ leagueId, week, transactions }),
  );
  const tradeRows = txWeeks.flatMap(([week, transactions]) =>
    buildTradeRows({ leagueId, week, transactions }),
  );
  const recap = tradeRecap({ trades: tradeRows, playerScores: scoredPlayerScores });
  const estimates = tradeEstimates({ trades: tradeRows, playerScores: scoredPlayerScores });
  const tradesTable: TradeTableRow[] = tradeRows.map((trade) => {
    const sides = recap.filter((row) => row.transaction_id === trade.transaction_id);
    const graded = estimates.filter((row) => row.transaction_id === trade.transaction_id);
    return {
      ...trade,
      measured_points: JSON.stringify(
        Object.fromEntries(sides.map((side) => [String(side.roster_id), side.measured_points])),
      ),
      estimate_note: graded
        .map((row) => `${teamName(row.roster_id)}: ${row.classification}`)
        .join('; ')
        .slice(0, 256),
    };
  });
  const activity: ActivityRow[] = activityCounts(transactionRows, rosterIds);

  // --- Brackets, draft, players ------------------------------------------
  const bracketRows = [
    ...buildBracketSlotRows({ leagueId, bracket: 'winners', games: input.winnersBracket }),
    ...buildBracketSlotRows({ leagueId, bracket: 'losers', games: input.losersBracket }),
  ];
  const draftRows = input.draft
    ? [buildDraftRow({ draft: input.draft, leagueId, syncedAt: now })]
    : [];
  const pickRows = input.draft
    ? buildDraftPickRows({ leagueId, draftId: input.draft.draft_id, picks: input.draftPicks })
    : [];

  const referenced = new Set<string>([
    ...teamRows.flatMap((team) => [
      ...team.players,
      ...team.starters,
      ...team.reserve,
      ...team.taxi,
    ]),
    ...playerScores.map((row) => row.player_id),
    ...pickRows.map((row) => row.player_id),
    ...transactionRows.flatMap((row) => [
      ...Object.keys(row.adds === null ? {} : (JSON.parse(row.adds) as object)),
      ...Object.keys(row.drops === null ? {} : (JSON.parse(row.drops) as object)),
    ]),
  ]);
  const playerRows = buildPlayerRows({
    playerIds: referenced,
    players: input.players,
    syncedAt: input.playersSyncedAt,
  });

  // --- Playoffs ------------------------------------------------------------
  const forecast = forecastPlayoffs({
    teams: teamRows,
    matchups: matchupRows.filter((row) => row.week <= regularWeeks),
    finalizedThroughWeek: scoredThrough,
    settings: playoffSettings(league, rosters, rules.playoffSim),
  });
  const forecastOf = (rosterId: number) => forecast.rows.find((row) => row.roster_id === rosterId);

  // --- History -------------------------------------------------------------
  const replay = replayRecords({
    weeks: historyWeeks({ season, matchups: scoredRows, teams: teamRows }),
    observedAt: now,
  });

  // --- Read models ---------------------------------------------------------
  const asOf: AsOf = {
    season,
    current_week: input.currentWeek,
    finalized_through_week: scoredThrough,
    regular_season_weeks: regularWeeks,
    season_complete: seasonComplete,
  };

  const currentTeams: CurrentTeam[] = standings.map((entry) => {
    const team = teamsTable.find((row) => row.roster_id === entry.roster_id) as TeamTableRow;
    const totals = lineupTotals.find((row) => row.roster_id === entry.roster_id);
    const stats = seasonRows.find((row) => row.roster_id === entry.roster_id);
    const odds = forecastOf(entry.roster_id);
    return {
      ...entry,
      owner_id: team.owner_id,
      max_pf_calculated: team.max_pf_calculated,
      points_left_on_bench: totals?.bench_gap ?? null,
      efficiency: totals?.efficiency ?? null,
      all_play_pct: stats?.all_play_pct ?? null,
      schedule_luck: stats?.schedule_luck ?? null,
      consistency: stats?.consistency ?? null,
      weekly_crowns: stats?.weekly_crowns ?? 0,
      last_place_weeks: stats?.last_place_weeks ?? 0,
      weeks_over_150: stats?.weeks_over_150 ?? 0,
      weeks_over_200: stats?.weeks_over_200 ?? 0,
      highest_scoring_loss: stats?.highest_scoring_loss ?? null,
      points_in_losses: stats?.points_in_losses ?? 0,
      add_transactions:
        activity.find((row) => row.roster_id === entry.roster_id)?.add_transactions ?? 0,
      playoff_chance_pct: odds?.playoff_chance_pct ?? null,
      position_now: odds?.position_now ?? null,
      playoff_status: odds?.status ?? 'UNAVAILABLE',
    };
  });

  const current: CurrentDashboard = {
    league: { league_id: leagueId, name: leagueRow.name, season, status: leagueRow.status },
    as_of: asOf,
    teams: currentTeams,
    weeks: matchupTable
      .filter((row) => isScored(row.week))
      .map((row) => ({
        week: row.week,
        roster_id: row.roster_id,
        points: row.points,
        opponent_roster_id: row.opponent_roster_id,
        margin: row.margin,
        result: row.result,
        all_play_pct: row.all_play_pct,
        weekly_crown: row.weekly_high ?? false,
        weekly_last: row.weekly_low ?? false,
        optimal_points: row.optimal_points,
        bench_gap: row.bench_gap,
      })),
    records: leagueRecords(scoredRegular),
    trades: { recap, estimates },
  };

  const withLabels = (rows: BracketSlotRow[]): BracketGameView[] =>
    rows.map((slot) => ({
      ...slot,
      team1_label: bracketSlotLabel({ slot, side: 'team1', bracket: rows, teamName }),
      team2_label: bracketSlotLabel({ slot, side: 'team2', bracket: rows, teamName }),
    }));
  const playoffs: PlayoffsDashboard = {
    as_of: asOf,
    forecast,
    brackets: {
      winners: withLabels(bracketRows.filter((row) => row.bracket === 'winners')),
      losers: withLabels(bracketRows.filter((row) => row.bracket === 'losers')),
    },
  };

  const history: HistoryDashboard = {
    as_of: asOf,
    record_book: replay.book,
  };

  const latest = scoredThrough >= 1 ? scoredThrough : null;
  const latestRows = latest === null ? [] : scoredRows.filter((row) => row.week === latest);
  const latestHigh = Math.max(...latestRows.map((row) => row.points));
  const latestLow = Math.min(...latestRows.map((row) => row.points));
  const summary: SummaryDashboard = {
    as_of: asOf,
    week: latest,
    record_breaks: replay.events.filter(
      (event) => event.week === latest && event.predecessor_value !== null,
    ),
    position_leaders: positionLeaders({
      weeks: matchupWeeks.map(([week]) => week).filter(isScored),
      playerScores: scoredPlayerScores,
      players: playerRows,
    }),
    cards: {
      high_score: latestRows
        .filter((row) => row.points === latestHigh)
        .map((row) => ({ roster_id: row.roster_id, points: row.points })),
      low_score: latestRows
        .filter((row) => row.points === latestLow)
        .map((row) => ({ roster_id: row.roster_id, points: row.points })),
      records: leagueRecords(latestRows),
    },
    teams: currentTeams.map((team) => {
      const cell = matchupTable.find(
        (row) => row.week === latest && row.roster_id === team.roster_id,
      );
      return {
        roster_id: team.roster_id,
        team_name: team.team_name,
        latest_points: cell?.points ?? null,
        latest_all_play_pct: cell?.all_play_pct ?? null,
        season_all_play_pct: team.all_play_pct,
        latest_schedule_luck: cell?.schedule_luck ?? null,
        season_schedule_luck: team.schedule_luck,
        weekly_crowns: team.weekly_crowns,
        playoff_chance_pct: team.playoff_chance_pct,
        playoff_status: team.playoff_status,
        position_now: team.position_now,
      };
    }),
  };

  const generatedAt = now.toISOString();
  const row = <View extends string>(view: View, payload: unknown): DashboardRow<View> => ({
    $id: dashboardId(leagueId, view as Parameters<typeof dashboardId>[1]),
    league_id: leagueId,
    view,
    payload: JSON.stringify(payload),
    generated_at: generatedAt,
    core_version: coreVersion,
    finalized_through_week: scoredThrough >= 1 ? scoredThrough : null,
  });

  const weekNumbers = matchupWeeks.map(([week]) => week);
  const weeksTable: WeekRow[] = weekNumbers.map((week) => ({
    $id: weekRowId(leagueId, week),
    league_id: leagueId,
    week,
    season_type: week <= regularWeeks ? 'regular' : 'post',
    finalized: input.frozenWeeks.has(week),
    finalized_at: input.frozenWeeks.get(week) ?? null,
    scores_complete: isScored(week),
    captured_at: generatedAt,
  }));

  return {
    tables: {
      leagues: [leagueRow],
      managers: buildManagerRows({ users, syncedAt: now }),
      teams: teamsTable,
      weeks: weeksTable,
      matchups: matchupTable,
      player_scores: playerScores,
      players: playerRows,
      transactions: transactionRows,
      trades: tradesTable,
      bracket_slots: bracketRows,
      drafts: draftRows,
      draft_picks: pickRows,
      record_events: replay.events,
    },
    dashboards: { current, history, playoffs, summary },
    dashboardRows: [
      row('current', current),
      row('history', history),
      row('playoffs', playoffs),
      row('summary', summary),
    ],
  };
}
