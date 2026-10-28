// Compare stored read models to fixtures/golden. Tooling, not product: it is NOT
// exported from index.ts, so the ingest bundle never carries it. Used by
// model.test.ts (fixtures in, golden out) and scripts/compare-golden.ts (live
// dashboards in, golden out), so both checks mean the same thing.

import type { RecordBookEntry } from '../history/records';
import type { CurrentDashboard, HistoryDashboard } from './model';

/** The parts of fixtures/golden/*.json this comparison reads. */
export interface GoldenFile {
  asOf: { finalizedThroughWeek: number };
  teams: {
    rosterId: number;
    manager: string;
    team: string;
    record: string;
    pf: number;
    pa: number;
    maxPfSleeper: number;
    maxPfBestLegalLineup: number;
    allPlayPct: number;
    scheduleLuck: number;
    pointsLeftOnBench: number;
    consistency: number;
    weeklyCrowns: number;
    rank: number;
    playoffChancePct: number;
    gamesLeft: number;
    positionNow: string;
  }[];
  records: {
    highestSingleWeekScore: { points: number; teams: string[]; week: number };
    lowestSingleWeekScore: { points: number; teams: string[]; week: number };
    largestWinningMargin: { margin: number; winner: string; loser: string; week: number };
    narrowestVictory: { margin: number; winner: string; loser: string; week: number };
    highestScoringLoss: { points: number; team: string; week: number };
    mostWeeksOver150: { weeks: number; teams: string[] };
    mostWeeksOver200: { weeks: number; teams: string[] };
    mostLastPlaceWeeks: { weeks: number; teams: string[] };
  };
  recordBook: Record<string, unknown>;
  tradeRecap: {
    transactionId: string;
    week: number;
    sides: { rosterId: number; team: string; received: string[]; measuredPoints: number }[];
  };
  luck: Record<string, unknown>;
}

export interface GoldenDifference {
  path: string;
  expected: unknown;
  actual: unknown;
}

export interface Dashboards {
  current: CurrentDashboard;
  history: HistoryDashboard;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Every field the golden file pins that the dashboards disagree with. Empty is a match. */
export function diffAgainstGolden(golden: GoldenFile, dashboards: Dashboards): GoldenDifference[] {
  const out: GoldenDifference[] = [];
  const check = (path: string, expected: unknown, actual: unknown): void => {
    if (!same(expected, actual)) out.push({ path, expected, actual });
  };
  const { current, history } = dashboards;

  check(
    'asOf.finalizedThroughWeek',
    golden.asOf.finalizedThroughWeek,
    current.as_of.finalized_through_week,
  );

  const nameOf = (rosterId: number): string =>
    current.teams.find((team) => team.roster_id === rosterId)?.team_name ?? `Roster ${rosterId}`;

  for (const expected of golden.teams) {
    const team = current.teams.find((row) => row.roster_id === expected.rosterId);
    const at = `teams[${expected.team}]`;
    if (team === undefined) {
      out.push({ path: at, expected: 'present', actual: 'missing' });
      continue;
    }
    check(`${at}.manager`, expected.manager, team.manager_name);
    check(`${at}.team`, expected.team, team.team_name);
    check(`${at}.record`, expected.record, team.record);
    check(`${at}.pf`, expected.pf, team.points_for);
    check(`${at}.pa`, expected.pa, team.points_against);
    check(`${at}.maxPfSleeper`, expected.maxPfSleeper, team.max_pf_sleeper);
    check(`${at}.maxPfBestLegalLineup`, expected.maxPfBestLegalLineup, team.max_pf_calculated);
    check(`${at}.allPlayPct`, expected.allPlayPct, team.all_play_pct);
    check(`${at}.scheduleLuck`, expected.scheduleLuck, team.schedule_luck);
    check(`${at}.pointsLeftOnBench`, expected.pointsLeftOnBench, team.points_left_on_bench);
    check(`${at}.consistency`, expected.consistency, team.consistency);
    check(`${at}.weeklyCrowns`, expected.weeklyCrowns, team.weekly_crowns);
    check(`${at}.rank`, expected.rank, team.rank);
    check(`${at}.playoffChancePct`, expected.playoffChancePct, team.playoff_chance_pct);
    check(`${at}.gamesLeft`, expected.gamesLeft, team.games_left);
    check(`${at}.positionNow`, expected.positionNow, team.position_now);
  }

  // Single-game records, from the current dashboard's margin book and weekly grid.
  const r = golden.records;
  const book = (code: string): RecordBookEntry | undefined =>
    history.record_book.find((entry) => entry.record_code === code);
  const holderTeams = (entry: RecordBookEntry | undefined): string[] =>
    (entry?.holders ?? []).map((holder) => holder.team_name).sort();

  check('records.highestSingleWeekScore', r.highestSingleWeekScore, {
    points: book('hi_week')?.value,
    teams: holderTeams(book('hi_week')),
    week: book('hi_week')?.holders[0]?.week,
  });
  check('records.lowestSingleWeekScore', r.lowestSingleWeekScore, {
    points: book('lo_week')?.value,
    teams: holderTeams(book('lo_week')),
    week: book('lo_week')?.holders[0]?.week,
  });
  const largest = current.records.largest_margin[0];
  check('records.largestWinningMargin', r.largestWinningMargin, {
    margin: largest?.value,
    winner: largest === undefined ? undefined : nameOf(largest.roster_id),
    loser: largest?.opponent_roster_id == null ? undefined : nameOf(largest.opponent_roster_id),
    week: largest?.week,
  });
  const narrowest = current.records.narrowest_victory[0];
  check('records.narrowestVictory', r.narrowestVictory, {
    margin: narrowest?.value,
    winner: narrowest === undefined ? undefined : nameOf(narrowest.roster_id),
    loser: narrowest?.opponent_roster_id == null ? undefined : nameOf(narrowest.opponent_roster_id),
    week: narrowest?.week,
  });
  const loss = current.records.highest_scoring_loss[0];
  check('records.highestScoringLoss', r.highestScoringLoss, {
    points: loss?.value,
    team: loss === undefined ? undefined : nameOf(loss.roster_id),
    week: loss?.week,
  });
  const most = (field: 'weeks_over_150' | 'weeks_over_200' | 'last_place_weeks') => {
    const top = Math.max(...current.teams.map((team) => team[field]));
    return {
      weeks: top,
      teams:
        top === 0
          ? []
          : current.teams
              .filter((team) => team[field] === top)
              .map((team) => team.team_name)
              .sort(),
    };
  };
  const sortedTeams = (entry: { weeks: number; teams: string[] }) => ({
    weeks: entry.weeks,
    teams: [...entry.teams].sort(),
  });
  check('records.mostWeeksOver150', sortedTeams(r.mostWeeksOver150), most('weeks_over_150'));
  check('records.mostWeeksOver200', sortedTeams(r.mostWeeksOver200), most('weeks_over_200'));
  check('records.mostLastPlaceWeeks', sortedTeams(r.mostLastPlaceWeeks), most('last_place_weeks'));

  // The record book: current holders and every predecessor, oldest first.
  for (const [code, expected] of Object.entries(golden.recordBook)) {
    if (code === 'note') continue;
    const entry = book(code);
    const actual =
      entry === undefined || entry.value === null
        ? null
        : {
            value: entry.value,
            holders: entry.holders.map((holder) => ({
              team: holder.team_name,
              week: holder.week,
              ...(holder.opponent_team_name === null
                ? {}
                : { opponent: holder.opponent_team_name }),
            })),
            previous: entry.previous.map((link) => ({
              value: link.value,
              holders: link.holders.map((holder) => ({
                team: holder.team_name,
                week: holder.week,
                ...(holder.opponent_team_name === null
                  ? {}
                  : { opponent: holder.opponent_team_name }),
              })),
              brokenInWeek: link.broken_in_week,
            })),
          };
    // Co-holders are a set; the sheet and the replay list them in different orders.
    type Link = { holders?: { team: string }[]; previous?: Link[] };
    const sortHolders = (value: unknown): unknown => {
      if (value === null || typeof value !== 'object') return value;
      const link = value as Link;
      return {
        ...link,
        holders: [...(link.holders ?? [])].sort((a, b) => a.team.localeCompare(b.team)),
        ...(link.previous === undefined ? {} : { previous: link.previous.map(sortHolders) }),
      };
    };
    check(`recordBook.${code}`, sortHolders(expected), sortHolders(actual));
  }

  // Trade recap: the sides the sheet listed.
  for (const side of golden.tradeRecap.sides) {
    const row = current.trades.recap.find(
      (entry) =>
        entry.transaction_id === golden.tradeRecap.transactionId &&
        entry.roster_id === side.rosterId,
    );
    const at = `tradeRecap[${side.team}]`;
    check(`${at}.week`, golden.tradeRecap.week, row?.week);
    check(`${at}.received`, side.received, row?.received);
    check(`${at}.measuredPoints`, side.measuredPoints, row?.measured_points);
  }

  // Luck table: one season, so season and career lines agree.
  const luck = golden.luck as Record<string, { team: string; value: number }>;
  const line = (key: keyof HistoryDashboard['luck']) => {
    const found = history.luck[key];
    return {
      team: found.holders.map((holder) => holder.team_name).join(' / '),
      value: found.value,
    };
  };
  check('luck.luckiestSeason', luck.luckiestSeason, line('luckiest_season'));
  check('luck.unluckiestSeason', luck.unluckiestSeason, line('unluckiest_season'));
  check('luck.mostPointsInLosses', luck.mostPointsInLosses, line('most_points_in_losses'));
  check(
    'luck.mostCareerPointsAgainst',
    luck.mostCareerPointsAgainst,
    line('most_career_points_against'),
  );

  return out;
}
