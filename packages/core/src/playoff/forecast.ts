import { standingsCompare, type RecordLike } from '../metrics/standings';
import { round2 } from '../numbers';
import type { MatchupRow } from '../normalize/matchups';
import type { TeamRow } from '../normalize/rosters';
import type { SleeperLeague, SleeperRoster } from '../sleeper/types';

/**
 * The playoff model — docs/REBUILD_PLAN.md §2d.
 *
 * Two independent answers to "will this team make the top 6":
 *
 *  - **Record-only bounds** (`recordBounds`) are proofs. They let every other
 *    team's future results vary independently, so they never claim a clinch or
 *    an elimination that some real outcome could contradict. CLINCHED and
 *    ELIMINATED come only from here, or from the final standings once the
 *    regular season is over.
 *  - **Playoff %** is an estimate: 5,000 replays of the real remaining
 *    schedule, each future score drawn 70% of the time from the team's own
 *    finalized weeks and otherwise from every finalized league score, seeded
 *    by record %, PF, PA and then a coin. A sampled 0% or 100% is not proof.
 *
 * Ported call-for-call from reference/legacy/Redraft.gs:290-371,
 * including the order the random stream is consumed in (every team's tie coin,
 * then each game's two draws in schedule order), so one seed reproduces one
 * forecast.
 *
 * The forecast is withheld — every chance blank, never 0% — when the model
 * does not describe the league: an incomplete or non-head-to-head schedule, an
 * official record that disagrees with the finalized weeks, missing PF/PA,
 * divisions, league-median games, or non-standard seeding.
 */

/** Everything the model reads from the league and `config/league.json -> playoffSim`. */
export interface PlayoffSettings {
  playoffTeams: number;
  startWeek: number;
  regularSeasonWeeks: number;
  /** Sleeper `playoff_seed_type` other than 0, or `customPlayoffRules` in config. */
  customSeeding: boolean;
  /** Sleeper `league_average_match`: an extra game against the median each week. */
  medianGames: boolean;
  divisions: boolean;
  simulations: number;
  seed: number;
  /** Share of draws taken from the team's own weeks; the rest are league-wide. */
  teamSampleWeight: number;
}

/** `config/league.json -> playoffSim`. */
export interface PlayoffSimConfig {
  simulations: number;
  seed: number;
  teamSampleWeight: number;
  customPlayoffRules: boolean;
}

export type PlayoffStatus =
  | 'CLINCHED_BY_RECORD_BOUND'
  | 'ELIMINATED_BY_RECORD_BOUND'
  | 'OPEN'
  | 'EXACT_TIE_UNRESOLVED'
  | 'UNAVAILABLE';

export interface RecordBounds {
  /** Fewest more wins that could get inside the cut with every tiebreak going your way. Null: even winning out cannot. */
  optimistic_min_wins: number | null;
  /** Fewest more wins that guarantee a seat whatever anyone else does. Null: none do. */
  guarantee_wins: number | null;
  /** Remaining games minus `guarantee_wins`. */
  safe_losses: number | null;
  /** Fewest more losses that make a seat impossible. Null: no number of losses proves it. */
  losses_to_eliminate: number | null;
  status: 'CLINCHED_BY_RECORD_BOUND' | 'ELIMINATED_BY_RECORD_BOUND' | 'OPEN';
}

/** One team's forecast line. */
export interface PlayoffForecastRow {
  league_id: string;
  roster_id: number;
  record: string;
  remaining_games: number;
  /** Where the current standings put the team. Null when seeding is not standard. */
  position_now: 'inside' | 'outside' | 'tied_at_cutoff' | null;
  /** Percent 0-100. Null when withheld or when an exact final tie is unresolved. */
  playoff_chance_pct: number | null;
  status: PlayoffStatus;
  optimistic_min_wins: number | null;
  guarantee_wins: number | null;
  safe_losses: number | null;
  losses_to_eliminate: number | null;
  /** Fewest more wins whose sampled qualification rate is at least 80%. */
  lowest_wins_with_80pct_odds: number | null;
  /** Median wins of the last team in, across simulations. */
  median_cutoff_wins: number | null;
}

/** One row of the scenario table: a team's chance given one W-L finish. */
export interface PlayoffScenarioRow {
  league_id: string;
  roster_id: number;
  additional_wins: number;
  additional_losses: number;
  /** Simulations ending in exactly this finish with no ties. */
  simulated_cases: number;
  qualifying_cases: number;
  /** Percent 0-100. Null when the finish was sampled fewer than 100 times. */
  conditional_playoff_chance_pct: number | null;
}

export interface PlayoffForecast {
  rows: PlayoffForecastRow[];
  scenarios: PlayoffScenarioRow[];
  /** 0 when withheld, 1 when the regular season is over, otherwise the configured count. */
  simulations: number;
  /** The assumptions, or why the forecast was withheld. */
  note: string;
}

export interface ForecastInput {
  /** Official record, PF and PA. */
  teams: readonly TeamRow[];
  /**
   * Every regular-season matchup row: finalized weeks with results, and the
   * remaining weeks with Sleeper's published pairings.
   */
  matchups: readonly MatchupRow[];
  /** Sleeper `last_scored_leg`. */
  finalizedThroughWeek: number;
  settings: PlayoffSettings;
}

/** The model's settings from the raw league, its rosters and config. */
export function playoffSettings(
  league: SleeperLeague,
  rosters: readonly SleeperRoster[],
  sim: PlayoffSimConfig,
): PlayoffSettings {
  const settings = league.settings;
  return {
    playoffTeams: settings.playoff_teams ?? 0,
    startWeek: settings.start_week ?? 1,
    regularSeasonWeeks: (settings.playoff_week_start ?? 19) - 1,
    customSeeding: sim.customPlayoffRules || (settings.playoff_seed_type ?? 0) !== 0,
    medianGames: (settings.league_average_match ?? 0) !== 0,
    divisions:
      (settings.divisions ?? 0) > 0 ||
      rosters.some(
        (roster) => roster.settings?.division !== undefined && roster.settings?.division !== null,
      ),
    simulations: sim.simulations,
    seed: sim.seed,
    teamSampleWeight: sim.teamSampleWeight,
  };
}

/**
 * Sufficient record-only bounds for `teams[index]`.
 *
 * Every other team's remaining games are treated as independent, so these
 * never claim a schedule-dependent clinch number — only what holds however the
 * other games go. A tie is half a win; PF is ignored, so an exact record tie at
 * the cutoff stays OPEN.
 */
export function recordBounds(
  teams: readonly RecordLike[],
  index: number,
  remaining: readonly number[],
  seats: number,
): RecordBounds {
  const score = (team: RecordLike) => team.wins + 0.5 * team.ties;
  const me = teams[index] as RecordLike;
  const base = score(me);
  const left = remaining[index] as number;
  const aheadAt = (target: number) =>
    teams.filter((team, i) => i !== index && score(team) > target).length;
  const couldReach = (target: number) =>
    teams.filter((team, i) => i !== index && score(team) + (remaining[i] as number) >= target)
      .length;

  let optimistic: number | null = null;
  let guarantee: number | null = null;
  let losses: number | null = null;
  for (let wins = 0; wins <= left; wins += 1) {
    if (optimistic === null && aheadAt(base + wins) < seats) optimistic = wins;
    if (guarantee === null && couldReach(base + wins) < seats) guarantee = wins;
  }
  for (let lost = 0; lost <= left; lost += 1) {
    if (aheadAt(base + left - lost) >= seats) {
      losses = lost;
      break;
    }
  }

  return {
    optimistic_min_wins: optimistic,
    guarantee_wins: guarantee,
    safe_losses: guarantee === null ? null : left - guarantee,
    losses_to_eliminate: losses,
    status:
      guarantee === 0
        ? 'CLINCHED_BY_RECORD_BOUND'
        : optimistic === null
          ? 'ELIMINATED_BY_RECORD_BOUND'
          : 'OPEN',
  };
}

/** mulberry32: a small, fast generator whose stream is fixed by its seed. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A scheduled game between two teams, by index into `teams`. */
interface Game {
  a: number;
  b: number;
}

/** A team mid-simulation. PF and PA are whole cents so sums stay exact. */
interface SimTeam {
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  added_wins: number;
  added_ties: number;
  coin: number;
  index: number;
}

const DECIDED: ReadonlySet<MatchupRow['result']> = new Set<MatchupRow['result']>(['W', 'L', 'T']);

/** Fewest samples a W-L finish needs before its conditional chance is shown. */
const MIN_SCENARIO_SAMPLES = 100;

function positionNow(
  teams: readonly TeamRow[],
  index: number,
  seats: number,
  special: boolean,
): PlayoffForecastRow['position_now'] {
  if (special) return null;
  const ordered = teams.slice().sort((a, b) => standingsCompare(a, b) || a.roster_id - b.roster_id);
  const me = teams[index] as TeamRow;
  const first = ordered.findIndex((team) => standingsCompare(team, me) === 0);
  const last =
    ordered.length -
    1 -
    [...ordered].reverse().findIndex((team) => standingsCompare(team, me) === 0);
  if (first < seats && last >= seats) return 'tied_at_cutoff';
  return first < seats ? 'inside' : 'outside';
}

export function forecastPlayoffs({
  teams,
  matchups,
  finalizedThroughWeek,
  settings,
}: ForecastInput): PlayoffForecast {
  const seats = settings.playoffTeams;
  const regularEnd = settings.regularSeasonWeeks;
  const start = settings.startWeek;
  const special = settings.customSeeding || settings.divisions;
  const indexOf = new Map(teams.map((team, index) => [team.roster_id, index]));
  const remaining = teams.map(() => 0);
  const games: Game[] = [];
  const issues: string[] = [];

  if (!seats || seats > teams.length) issues.push('No supported playoff-team count');
  if (settings.customSeeding) issues.push('Custom playoff seeding needs a league-specific model');
  if (settings.divisions) issues.push('Division qualification is not modeled');
  if (settings.medianGames) issues.push('Extra league-median games are not modeled');

  const scoredThrough = Math.min(finalizedThroughWeek, regularEnd);
  const regular = matchups.filter((row) => row.week <= scoredThrough && DECIDED.has(row.result));
  const expectedPlayed = Math.max(0, scoredThrough - start + 1);
  for (const team of teams) {
    const observed = matchups.filter(
      (row) => row.roster_id === team.roster_id && row.week >= start && row.week <= scoredThrough,
    );
    if (
      observed.length !== expectedPlayed ||
      observed.some((row) => !DECIDED.has(row.result)) ||
      team.wins + team.losses + team.ties !== expectedPlayed
    ) {
      issues.push(`Finalized matchup coverage/official record mismatch for ${team.manager_name}`);
    }
    if (!Number.isFinite(team.points_for) || !Number.isFinite(team.points_against)) {
      issues.push(`Missing official PF/PA for ${team.manager_name}`);
    }
  }

  for (let week = Math.max(start, finalizedThroughWeek + 1); week <= regularEnd; week += 1) {
    const groups = new Map<number, MatchupRow[]>();
    const seen = new Set<number>();
    for (const row of matchups.filter((entry) => entry.week === week)) {
      if (!indexOf.has(row.roster_id) || seen.has(row.roster_id)) {
        issues.push(`Invalid/duplicate schedule roster in week ${week}`);
      }
      seen.add(row.roster_id);
      if (row.matchup_id === null) {
        issues.push(`Missing opponent in week ${week}`);
        continue;
      }
      groups.set(row.matchup_id, [...(groups.get(row.matchup_id) ?? []), row]);
    }
    if (seen.size !== teams.length) issues.push(`Incomplete schedule in week ${week}`);
    for (const group of groups.values()) {
      if (group.length !== 2) {
        issues.push(`Non-head-to-head schedule group in week ${week}`);
        continue;
      }
      const a = indexOf.get((group[0] as MatchupRow).roster_id);
      const b = indexOf.get((group[1] as MatchupRow).roster_id);
      if (a === undefined || b === undefined || a === b) continue;
      games.push({ a, b });
      remaining[a] = (remaining[a] as number) + 1;
      remaining[b] = (remaining[b] as number) + 1;
    }
  }
  if (games.length > 0 && regular.length === 0)
    issues.push('No finalized weekly scores yet for forecasting');

  const recordOf = (team: TeamRow) => `${team.wins}-${team.losses}-${team.ties}`;

  if (issues.length > 0) {
    const note = `Forecast withheld: ${[...new Set(issues)].join('; ')}`;
    return {
      rows: teams.map((team, index) => ({
        league_id: team.league_id,
        roster_id: team.roster_id,
        record: recordOf(team),
        remaining_games: remaining[index] as number,
        position_now: positionNow(teams, index, seats, special),
        playoff_chance_pct: null,
        status: 'UNAVAILABLE',
        optimistic_min_wins: null,
        guarantee_wins: null,
        safe_losses: null,
        losses_to_eliminate: null,
        lowest_wins_with_80pct_odds: null,
        median_cutoff_wins: null,
      })),
      scenarios: [],
      simulations: 0,
      note,
    };
  }

  const random = seededRandom(settings.seed + finalizedThroughWeek);
  const pool = regular.map((row) => row.points);
  const samples = teams.map((team) =>
    regular.filter((row) => row.roster_id === team.roster_id).map((row) => row.points),
  );
  const weight = Math.max(0, Math.min(1, settings.teamSampleWeight));
  const count =
    games.length > 0 ? Math.max(100, Math.min(20000, Math.floor(settings.simulations))) : 1;

  const qualified = teams.map(() => 0);
  const finishes = teams.map((_team, index) =>
    Array.from({ length: (remaining[index] as number) + 1 }, () => ({ cases: 0, qualifying: 0 })),
  );
  const cutoffs: number[] = [];

  // Short-circuit kept from the legacy draw: a team with no weeks of its own
  // consumes no random number for the own-vs-league choice.
  const draw = (index: number): number => {
    const own = samples[index] as number[];
    const values = own.length > 0 && random() < weight ? own : pool;
    return Math.round((values[Math.floor(random() * values.length)] as number) * 100);
  };

  for (let run = 0; run < count; run += 1) {
    const simulated: SimTeam[] = teams.map((team, index) => ({
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      points_for: Math.round(team.points_for * 100),
      points_against: Math.round(team.points_against * 100),
      added_wins: 0,
      added_ties: 0,
      coin: random(),
      index,
    }));
    for (const { a, b } of games) {
      const home = simulated[a] as SimTeam;
      const away = simulated[b] as SimTeam;
      const homePoints = draw(a);
      const awayPoints = draw(b);
      home.points_for += homePoints;
      away.points_for += awayPoints;
      home.points_against += awayPoints;
      away.points_against += homePoints;
      if (homePoints > awayPoints) {
        home.wins += 1;
        home.added_wins += 1;
        away.losses += 1;
      } else if (awayPoints > homePoints) {
        away.wins += 1;
        away.added_wins += 1;
        home.losses += 1;
      } else {
        home.ties += 1;
        away.ties += 1;
        home.added_ties += 1;
        away.added_ties += 1;
      }
    }
    const ordered = simulated.slice().sort((x, y) => standingsCompare(x, y) || x.coin - y.coin);
    const inside = new Set(ordered.slice(0, seats).map((team) => team.index));
    cutoffs.push((ordered[seats - 1] as SimTeam).wins);
    for (const team of simulated) {
      if (inside.has(team.index)) qualified[team.index] = (qualified[team.index] as number) + 1;
      if (team.added_ties === 0) {
        const finish = (finishes[team.index] as { cases: number; qualifying: number }[])[
          team.added_wins
        ] as {
          cases: number;
          qualifying: number;
        };
        finish.cases += 1;
        if (inside.has(team.index)) finish.qualifying += 1;
      }
    }
  }

  cutoffs.sort((x, y) => x - y);
  const medianCutoff = cutoffs[Math.floor(cutoffs.length / 2)] as number;
  const enough = Math.min(MIN_SCENARIO_SAMPLES, count);

  const rows = teams.map((team, index): PlayoffForecastRow => {
    const bounds = recordBounds(teams, index, remaining, seats);
    const exactTie =
      count === 1 && teams.some((other, j) => j !== index && standingsCompare(other, team) === 0);
    const reliable = (finishes[index] as { cases: number; qualifying: number }[]).findIndex(
      (finish) => finish.cases >= enough && finish.qualifying / finish.cases >= 0.8,
    );
    return {
      league_id: team.league_id,
      roster_id: team.roster_id,
      record: recordOf(team),
      remaining_games: remaining[index] as number,
      position_now: positionNow(teams, index, seats, special),
      playoff_chance_pct: exactTie ? null : round2((100 * (qualified[index] as number)) / count),
      status: exactTie ? 'EXACT_TIE_UNRESOLVED' : bounds.status,
      optimistic_min_wins: bounds.optimistic_min_wins,
      guarantee_wins: bounds.guarantee_wins,
      safe_losses: bounds.safe_losses,
      losses_to_eliminate: bounds.losses_to_eliminate,
      lowest_wins_with_80pct_odds: reliable === -1 ? null : reliable,
      median_cutoff_wins: medianCutoff,
    };
  });

  const scenarios = teams.flatMap((team, index) =>
    (finishes[index] as { cases: number; qualifying: number }[]).map(
      (finish, wins): PlayoffScenarioRow => ({
        league_id: team.league_id,
        roster_id: team.roster_id,
        additional_wins: wins,
        additional_losses: (remaining[index] as number) - wins,
        simulated_cases: finish.cases,
        qualifying_cases: finish.qualifying,
        conditional_playoff_chance_pct:
          finish.cases >= enough ? round2((100 * finish.qualifying) / finish.cases) : null,
      }),
    ),
  );

  const note =
    count === 1
      ? 'Season complete: qualification from record, PF and PA; an exact final tie is left unresolved.'
      : `${count} simulated remaining seasons. Each future weekly score is sampled ${Math.round(weight * 100)}% from that team's finalized weeks and ${Math.round((1 - weight) * 100)}% from all league scores. The remaining schedule is real; live scores, future injuries and roster changes are not modeled. Record, PF and PA break ties; an exact final tie uses a random coin. A sampled 0% or 100% is not elimination or clinching.`;

  return { rows, scenarios, simulations: count, note };
}
