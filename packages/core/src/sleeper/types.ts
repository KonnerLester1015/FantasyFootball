// Sleeper API response shapes, narrowed to the fields we actually keep.
// Endpoint-by-endpoint contract: docs/REBUILD_PLAN.md §3.
//
// Everything optional is optional because Sleeper omits it, not for convenience.
// Treat a missing field as unknown, never as zero or false.
//
// `packages/core/src/test-fixtures.ts` assigns every file in fixtures/sleeper to
// the types below, so `npm run typecheck` is itself the check that these shapes
// still describe what Sleeper actually returns.

/** GET /state/nfl */
export interface NflState {
  season: string;
  /** Scoring week. 0 in the offseason. */
  week: number;
  season_type: string;
  display_week?: number;
}

/**
 * GET /league/{id} -> `settings`. Every value Sleeper puts here is a number.
 * Only the handful the dashboards depend on is named.
 */
export interface SleeperLeagueSettings {
  /** First postseason week. 15 for Family Feud; the regular season is 1..14. */
  playoff_week_start?: number;
  /** Last week Sleeper has finished scoring. The finalized-week watermark. */
  last_scored_leg?: number;
  num_teams?: number;
  playoff_teams?: number;
  /** Current week within the season. */
  leg?: number;
  /** First regular-season week. 1 unless the league started late. */
  start_week?: number;
  /** 0 is Sleeper's default seeding; anything else is a custom rule. */
  playoff_seed_type?: number;
  /** 1 when every team also plays the league median each week. */
  league_average_match?: number;
  /** Number of divisions; absent or 0 for a league without them. */
  divisions?: number;
}

/** GET /league/{id} */
export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status: string;
  sport?: string;
  /** The same league one season earlier. `null` for a league's first season. */
  previous_league_id?: string | null;
  draft_id?: string | null;
  /** Lineup slots in order, bench included: QB, RB, RB, …, FLEX, FLEX, K, DEF, BN… */
  roster_positions: string[];
  scoring_settings?: Record<string, number> | null;
  settings: SleeperLeagueSettings;
  total_rosters?: number;
}

/** GET /league/{id}/users */
export interface SleeperUser {
  user_id: string;
  display_name?: string | null;
  username?: string | null;
  /** Avatar hash for Sleeper's CDN, not a URL. */
  avatar?: string | null;
  metadata?: {
    /** Absent when the manager never named their team. */
    team_name?: string | null;
    avatar?: string | null;
  } | null;
  is_bot?: boolean | null;
}

/** GET /league/{id}/rosters -> `settings`. */
export interface SleeperRosterSettings {
  wins?: number;
  losses?: number;
  ties?: number;
  /** Whole points. The hundredths live in the matching `_decimal` field. */
  fpts?: number;
  fpts_decimal?: number;
  fpts_against?: number;
  fpts_against_decimal?: number;
  /** "Potential points": Sleeper's own max-PF number. */
  ppts?: number;
  ppts_decimal?: number;
  waiver_position?: number;
  waiver_budget_used?: number;
  total_moves?: number;
  division?: number;
}

/** GET /league/{id}/rosters */
export interface SleeperRoster {
  roster_id: number;
  owner_id?: string | null;
  league_id?: string | null;
  /** Every player on the roster, including reserve and taxi. */
  players?: string[] | null;
  /** Starting lineup by slot. '0' marks an empty slot. */
  starters?: string[] | null;
  /** IR slots. */
  reserve?: string[] | null;
  taxi?: string[] | null;
  settings?: SleeperRosterSettings | null;
  metadata?: {
    record?: string | null;
    streak?: string | null;
  } | null;
}

/** One entry of GET /players/nfl, trimmed to what the dashboards need. */
export interface SleeperPlayer {
  /** Absent for team defenses, which carry only first_name/last_name. */
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  fantasy_positions?: string[] | null;
  team?: string | null;
  /** Game-availability designation: Questionable, Doubtful, Out, IR, PUP, … */
  injury_status?: string | null;
  /** Roster status: Active, Inactive, Injured Reserve, Suspended, … */
  status?: string | null;
  age?: number | null;
}

export type PlayerDictionary = Record<string, SleeperPlayer>;

/**
 * GET /league/{id}/matchups/{week}. One entry per roster, every week, whether
 * or not the week has been played.
 *
 * `matchup_id` pairs two entries. It is null when Sleeper has not published a
 * pairing — a future week, or a postseason week a roster is not playing in.
 */
export interface SleeperMatchup {
  roster_id: number;
  matchup_id?: number | null;
  points?: number | null;
  /** A commissioner override. When present it IS the score, even at 0. */
  custom_points?: number | null;
  starters?: string[] | null;
  /** Positionally aligned with `starters`. */
  starters_points?: number[] | null;
  players?: string[] | null;
  players_points?: Record<string, number> | null;
}

/** A draft pick traded as part of a transaction. Dynasty only; Family Feud sends []. */
export interface SleeperTradedPick {
  season?: string;
  round?: number;
  roster_id?: number;
  previous_owner_id?: number;
  owner_id?: number;
}

/** FAAB moved between rosters as part of a trade. */
export interface SleeperWaiverBudgetTransfer {
  sender?: number;
  receiver?: number;
  amount?: number;
}

/**
 * GET /league/{id}/transactions/{week}. Failed waiver claims are included and
 * must be filtered out by `status`, not assumed away.
 *
 * `adds` and `drops` map player ID -> the roster that gained or lost them, so a
 * trade's two sides are read off the same two maps.
 */
export interface SleeperTransaction {
  transaction_id: string;
  /** waiver, free_agent, trade, commissioner. Sleeper's vocabulary, not ours. */
  type: string;
  /** complete, failed. */
  status: string;
  /** The week the transaction belongs to. */
  leg?: number | null;
  /** Epoch milliseconds. */
  created?: number | null;
  status_updated?: number | null;
  creator?: string | null;
  roster_ids?: number[] | null;
  consenter_ids?: number[] | null;
  adds?: Record<string, number> | null;
  drops?: Record<string, number> | null;
  draft_picks?: SleeperTradedPick[] | null;
  waiver_budget?: SleeperWaiverBudgetTransfer[] | null;
  settings?: {
    waiver_bid?: number;
    seq?: number;
  } | null;
  metadata?: {
    notes?: string | null;
  } | null;
}

/**
 * Where a bracket slot's team comes from once an earlier game decides it.
 * `{ w: 3 }` is "the winner of game 3"; `{ l: 3 }` is "the loser of game 3".
 */
export interface SleeperBracketSource {
  w?: number | null;
  l?: number | null;
}

/** GET /league/{id}/winners_bracket and /losers_bracket. */
export interface SleeperBracketGame {
  /** Round. */
  r: number;
  /** Game number within the bracket, unique across rounds. */
  m: number;
  t1?: number | null;
  t2?: number | null;
  /** Winner's roster ID; null until the game is decided. */
  w?: number | null;
  l?: number | null;
  t1_from?: SleeperBracketSource | null;
  t2_from?: SleeperBracketSource | null;
  /** Placement game: the winner finishes `p`, the loser `p + 1`. */
  p?: number | null;
}

/** GET /league/{id}/drafts and GET /draft/{id}. */
export interface SleeperDraft {
  draft_id: string;
  league_id?: string | null;
  season: string;
  season_type?: string;
  status: string;
  type: string;
  /** Epoch milliseconds. */
  start_time?: number | null;
  created?: number | null;
  settings?: {
    rounds?: number;
    teams?: number;
  } | null;
  draft_order?: Record<string, number> | null;
  slot_to_roster_id?: Record<string, number> | null;
}

/** GET /draft/{id}/picks. */
export interface SleeperDraftPick {
  draft_id: string;
  round: number;
  /** Overall pick number, 1-based. */
  pick_no: number;
  draft_slot?: number | null;
  roster_id?: number | null;
  picked_by?: string | null;
  /** Null for a slot that was never filled. */
  player_id?: string | null;
  is_keeper?: boolean | null;
}
