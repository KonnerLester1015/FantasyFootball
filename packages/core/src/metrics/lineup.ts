import { round2 } from '../numbers';
import { effectivePoints } from '../normalize/matchups';
import type { PlayerDictionary, SleeperMatchup } from '../sleeper/types';

/**
 * Optimal lineup, calculated Max PF, bench gap and efficiency —
 * docs/REBUILD_PLAN.md §2a ("Max PF (calculated)") and §2b ("Optimal lineup,
 * points left on bench, efficiency").
 *
 * The solver answers one question: given every player a roster held in a week
 * and what each of them scored, what is the most points the legal starting
 * slots could have held? It is an exact assignment problem, not a sort — two
 * FLEX slots drawing on one RB/WR/TE pool mean "best player per slot, in slot
 * order" can lose points to a globally better assignment. So this is a dynamic
 * program over a bitmask of occupied slots, which is exact by construction and
 * checked against an independent exhaustive oracle in lineup.test.ts.
 *
 * The rules:
 *
 *   - A player occupies at most one slot.
 *   - **Every starting slot is filled** whenever a player is available for it,
 *     even when the best one available scored below zero. You cannot start
 *     nobody at DEF, so a lineup with an empty slot is not a lineup the manager
 *     could have fielded, and crediting one would overstate Max PF and the
 *     bench gap alike. This is the one place the rebuild deliberately departs
 *     from reference/legacy/Redraft.gs:181, which allowed empty
 *     slots; `allowEmptySlots: true` still reproduces the legacy number, and
 *     the four teams it moved are recorded in fixtures/golden.
 *   - Missing positions or missing scores produce a status and a BLANK total,
 *     never a zero. A zero here would read as "left nothing on the bench",
 *     which is the opposite of "we could not tell".
 *
 * Filling every slot is also what makes the result externally checkable: it is
 * exactly Sleeper's own `ppts` for all 14 teams, so the stored number is
 * anchored to a value we did not compute.
 *
 * Positions come from the current player dictionary. Sleeper does not publish
 * historical position eligibility, so a player reclassified mid-season is
 * solved under today's positions — recorded here because it is a real limit of
 * the input, not a choice.
 */

/** Slots that are not part of the starting lineup. */
const NON_STARTING_SLOTS = new Set(['BN', 'IR', 'TAXI']);

/** Multi-position slots and the positions each one accepts. */
const FLEX_SLOTS: Readonly<Record<string, readonly string[]>> = {
  FLEX: ['RB', 'WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  REC_FLEX: ['WR', 'TE'],
  WRRB_FLEX: ['WR', 'RB'],
  IDP_FLEX: ['DL', 'LB', 'DB'],
};

/** Slots that accept exactly the position they are named for. */
const DEDICATED_SLOTS = new Set([
  'QB',
  'RB',
  'WR',
  'TE',
  'K',
  'DEF',
  'DL',
  'LB',
  'DB',
  'DE',
  'DT',
  'CB',
  'S',
]);

/**
 * One occupied-slot bitmask per DP state, so 16 starting slots is the ceiling.
 * The fixture league starts 10. A league beyond the ceiling gets UNSUPPORTED_SLOTS and
 * a blank, which is the honest answer — not a silently truncated lineup.
 */
const MAX_STARTING_SLOTS = 16;

/** Sleeper uses '0' to mark an empty starting slot. */
const EMPTY_SLOT = '0';

export type LineupStatus =
  | 'OK'
  /** A slot this solver has no eligibility rule for, or too many slots. */
  | 'UNSUPPORTED_SLOTS'
  /** Sleeper published no usable score for at least one rostered player. */
  | 'MISSING_PLAYER_SCORES'
  /** The player dictionary has no position for at least one rostered player. */
  | 'MISSING_POSITIONS';

/** One filled slot of a solved lineup. */
export interface OptimalSlotAssignment {
  /** 1-based position in the starting-slot list, so the order is renderable. */
  slot: number;
  /** The slot's label, e.g. `RB` or `FLEX`. */
  position: string;
  player_id: string;
  points: number;
}

export interface OptimalLineup {
  /** Blank (null) whenever `status` is not `OK`. Never zero in that case. */
  total: number | null;
  status: LineupStatus;
  /**
   * Empty when the lineup could not be solved, or when the roster held nobody
   * eligible. Under the default rule a filled slot may carry a negative score.
   */
  lineup: OptimalSlotAssignment[];
}

export interface OptimalLineupOptions {
  /**
   * Whether a starting slot may be left empty for 0 rather than hold a
   * negative score.
   *
   * **Default false**: every slot that can be filled is filled, which matches
   * Sleeper's `ppts` for all 14 teams and is the definition the site publishes.
   *
   * True is the old Sheets rule, kept because it is the whole explanation of
   * why that sheet showed 1-2 points more for four teams — holding it as a
   * flag lets max-pf.investigate.test.ts prove the cause instead of asserting
   * it in a comment.
   */
  allowEmptySlots?: boolean;
}

/** The lineup half of a `matchups` row, one roster-week. */
export interface WeeklyLineupRow {
  league_id: string;
  week: number;
  roster_id: number;
  /** The score that counted, `custom_points` honoured. */
  actual_points: number;
  /** Best legal lineup. Blank when the week could not be solved. */
  optimal_points: number | null;
  /** Points left on the bench: optimal − actual. Blank when unsolved. */
  bench_gap: number | null;
  /** Percent 0-100, actual over optimal. Blank when unsolved or optimal ≤ 0. */
  efficiency: number | null;
  status: LineupStatus;
  lineup: OptimalSlotAssignment[];
}

/** The season rollup of the above, one row per roster. */
export interface SeasonLineupTotals {
  league_id: string;
  roster_id: number;
  /** Sum of the weekly scores that counted. Never blank: these are observed. */
  actual_points: number;
  /**
   * Calculated Max PF — the sum of the weekly optima.
   *
   * Blank unless every week handed in solved. A partial sum would read as a
   * season total and quietly understate it, which is the same class of bug as
   * rendering a zero for "unknown".
   */
  max_pf_calculated: number | null;
  /** Season points left on the bench. Blank under the same rule. */
  bench_gap: number | null;
  /** Percent 0-100. Blank under the same rule, or when the optimum is ≤ 0. */
  efficiency: number | null;
  /** Weeks that solved. */
  weeks_counted: number;
  /** Weeks that did not, so a dashboard can say which rather than only "N/A". */
  weeks_unsolved: number;
}

export interface WeeklyLineupsInput {
  leagueId: string;
  week: number;
  matchups: readonly SleeperMatchup[];
  /** `league.roster_positions`, bench slots included — they are filtered here. */
  rosterPositions: readonly string[];
  players: PlayerDictionary;
}

/** The positions a slot accepts, or null when there is no rule for it. */
function slotEligibility(slot: string): readonly string[] | null {
  if (FLEX_SLOTS[slot] !== undefined) return FLEX_SLOTS[slot];
  if (DEDICATED_SLOTS.has(slot)) return [slot];
  return null;
}

/** A player's fantasy positions, falling back to the primary position. */
function positionsOf(players: PlayerDictionary, playerId: string): readonly string[] | undefined {
  const entry = players[playerId];
  if (entry === undefined) return undefined;

  const listed = entry.fantasy_positions ?? [entry.position];
  const usable = listed.filter((position): position is string => Boolean(position));
  return usable.length > 0 ? usable : undefined;
}

/**
 * Every player the roster held that week: starters first, then the rest.
 *
 * Starters are unioned in rather than assumed to be a subset of `players`,
 * because Sleeper has shipped payloads where they are not. Dropping one would
 * understate the optimum and overstate efficiency.
 */
function rosterPool(matchup: SleeperMatchup): string[] {
  const ids = [...(matchup.starters ?? []), ...(matchup.players ?? [])];
  return [...new Set(ids)].filter((id) => id !== EMPTY_SLOT && id !== '');
}

/**
 * The best legal starting lineup for one roster in one week.
 *
 * Exact assignment by player → occupied-slot bitmask. For each player the DP
 * either leaves them out or puts them in one slot they are eligible for,
 * keeping the best-scoring way to reach each set of occupied slots. The answer
 * is then the highest-scoring assignment that fills the most slots, so a slot
 * goes unfilled only when no eligible player is left to fill it.
 */
export function optimalLineup(
  matchup: SleeperMatchup,
  rosterPositions: readonly string[],
  players: PlayerDictionary,
  options: OptimalLineupOptions = {},
): OptimalLineup {
  const allowEmptySlots = options.allowEmptySlots ?? false;
  const blank = (status: LineupStatus): OptimalLineup => ({ total: null, status, lineup: [] });

  /** One starting slot: where it sits in the lineup and what it accepts. */
  interface StartingSlot {
    index: number;
    label: string;
    accepts: readonly string[];
  }

  const labels = rosterPositions.filter((slot) => !NON_STARTING_SLOTS.has(slot));
  if (labels.length > MAX_STARTING_SLOTS) return blank('UNSUPPORTED_SLOTS');

  const slots: StartingSlot[] = [];
  for (const [index, label] of labels.entries()) {
    const accepts = slotEligibility(label);
    if (accepts === null) return blank('UNSUPPORTED_SLOTS');
    slots.push({ index, label, accepts });
  }

  const pool = rosterPool(matchup);

  // A payload with no score map at all is missing data, even when the roster is
  // also empty — "missing is blank, never zero" (CLAUDE.md).
  const scores = matchup.players_points;
  if (scores === null || scores === undefined) return blank('MISSING_PLAYER_SCORES');

  const points = new Map<string, number>();
  for (const playerId of pool) {
    const score = scores[playerId];
    if (score === undefined || score === null || !Number.isFinite(Number(score))) {
      return blank('MISSING_PLAYER_SCORES');
    }
    points.set(playerId, Number(score));
  }

  const positions = new Map<string, readonly string[]>();
  for (const playerId of pool) {
    const usable = positionsOf(players, playerId);
    if (usable === undefined) return blank('MISSING_POSITIONS');
    positions.set(playerId, usable);
  }

  interface State {
    score: number;
    lineup: OptimalSlotAssignment[];
  }

  let reachable = new Map<number, State>([[0, { score: 0, lineup: [] }]]);

  for (const playerId of pool) {
    const playerPositions = positions.get(playerId) ?? [];
    const open = slots.filter((slot) =>
      slot.accepts.some((position) => playerPositions.includes(position)),
    );
    if (open.length === 0) continue;

    const score = points.get(playerId) ?? 0;
    // Seeded from the previous generation, which is also how "leave this player
    // out" stays on the table. Reads come from `reachable` only, so no player
    // can be assigned twice within their own turn.
    const next = new Map(reachable);

    for (const [mask, state] of reachable) {
      for (const slot of open) {
        if (mask & (1 << slot.index)) continue;

        const nextMask = mask | (1 << slot.index);
        const nextScore = state.score + score;
        const incumbent = next.get(nextMask);
        if (incumbent !== undefined && incumbent.score >= nextScore) continue;

        next.set(nextMask, {
          score: nextScore,
          lineup: [
            ...state.lineup,
            {
              slot: slot.index + 1,
              position: slot.label,
              player_id: playerId,
              points: score,
            },
          ],
        });
      }
    }

    reachable = next;
  }

  // `lineup.length` is the number of occupied slots, so "fill as many slots as
  // possible, then score as high as possible" needs no second pass.
  let best: State = { score: 0, lineup: [] };
  let bestFilled = allowEmptySlots ? 0 : -1;
  for (const state of reachable.values()) {
    const filled = state.lineup.length;
    if (allowEmptySlots ? state.score > best.score : filled > bestFilled) {
      best = state;
      bestFilled = filled;
    } else if (!allowEmptySlots && filled === bestFilled && state.score > best.score) {
      best = state;
    }
  }

  return {
    total: round2(best.score),
    status: 'OK',
    lineup: [...best.lineup].sort((a, b) => a.slot - b.slot),
  };
}

/** Solve one week for every roster and derive the three weekly numbers. */
export function weeklyLineups({
  leagueId,
  week,
  matchups,
  rosterPositions,
  players,
}: WeeklyLineupsInput): WeeklyLineupRow[] {
  return matchups.map((matchup) => {
    const actual = round2(effectivePoints(matchup));
    const solved = optimalLineup(matchup, rosterPositions, players);
    const optimal = solved.total;

    return {
      league_id: leagueId,
      week,
      roster_id: matchup.roster_id,
      actual_points: actual,
      optimal_points: optimal,
      bench_gap: optimal === null ? null : round2(optimal - actual),
      efficiency: optimal !== null && optimal > 0 ? round2((actual / optimal) * 100) : null,
      status: solved.status,
      lineup: solved.lineup,
    };
  });
}

/**
 * Roll weekly lineups up to one row per roster.
 *
 * The caller chooses the scope. Calculated Max PF is defined over finalized
 * regular-season weeks (docs/REBUILD_PLAN.md §2a), so ingest hands in those
 * weeks; a postseason view hands in its own. Keeping the filter out here is
 * what stops two callers disagreeing about what "the season" means.
 */
export function rollUpLineups(weeks: readonly WeeklyLineupRow[]): SeasonLineupTotals[] {
  const byRoster = new Map<number, { league_id: string; rows: WeeklyLineupRow[] }>();
  for (const row of weeks) {
    const group = byRoster.get(row.roster_id) ?? { league_id: row.league_id, rows: [] };
    group.rows.push(row);
    byRoster.set(row.roster_id, group);
  }

  return [...byRoster.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rosterId, { league_id, rows }]) => {
      const solved = rows.filter((row) => row.optimal_points !== null);
      const complete = solved.length === rows.length;

      const actual = round2(rows.reduce((sum, row) => sum + row.actual_points, 0));
      const optimal = complete
        ? round2(solved.reduce((sum, row) => sum + (row.optimal_points ?? 0), 0))
        : null;
      const bench = complete
        ? round2(solved.reduce((sum, row) => sum + (row.bench_gap ?? 0), 0))
        : null;

      return {
        league_id,
        roster_id: rosterId,
        actual_points: actual,
        max_pf_calculated: optimal,
        bench_gap: bench,
        efficiency: optimal !== null && optimal > 0 ? round2((actual / optimal) * 100) : null,
        weeks_counted: solved.length,
        weeks_unsolved: rows.length - solved.length,
      };
    });
}
