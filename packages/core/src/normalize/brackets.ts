import type { SleeperBracketGame, SleeperBracketSource } from '../sleeper/types';
import { bracketSlotId } from './ids';

export type BracketKind = 'winners' | 'losers';

/** A row of the `bracket_slots` table. */
export interface BracketSlotRow {
  $id: string;
  league_id: string;
  bracket: BracketKind;
  round: number;
  game: number;
  team1_roster_id: number | null;
  team2_roster_id: number | null;
  /** Where team 1 comes from while the slot is unfilled, e.g. `winner_of_game_3`. */
  team1_from: string | null;
  team2_from: string | null;
  winner_roster_id: number | null;
  loser_roster_id: number | null;
  /** Placement game: the winner finishes here, the loser one place lower. */
  placement: number | null;
}

export interface BuildBracketSlotRowsInput {
  leagueId: string;
  bracket: BracketKind;
  games: readonly SleeperBracketGame[];
}

/** A parsed slot source. */
export interface BracketSource {
  kind: 'winner' | 'loser';
  game: number;
}

const SOURCE_PATTERN = /^(winner|loser)_of_game_(\d+)$/;

/**
 * Turn Sleeper's `{ w: 3 }` / `{ l: 3 }` reference into a stored token.
 *
 * The Sheets version this replaced rendered these future slots as "Loser of
 * game undefined". Both halves of the reference — which outcome, and
 * which game — are written into one self-describing token, so there is no way
 * to print a slot label with a missing game number. A slot with no source at
 * all returns null, which renders as a bye or an unpublished pairing.
 */
export function bracketSourceToken(source: SleeperBracketSource | null | undefined): string | null {
  if (!source) return null;
  if (source.w !== null && source.w !== undefined) return `winner_of_game_${source.w}`;
  if (source.l !== null && source.l !== undefined) return `loser_of_game_${source.l}`;
  return null;
}

/** Read a stored token back. Returns null for anything unrecognised. */
export function parseBracketSource(token: string | null | undefined): BracketSource | null {
  const match = token === null || token === undefined ? null : SOURCE_PATTERN.exec(token);
  if (match === null) return null;
  return { kind: match[1] as 'winner' | 'loser', game: Number(match[2]) };
}

/**
 * "Winner of game 3" / "Loser of game 3" for a stored token; null for none.
 *
 * Built from the parsed token, so both the word and the number come from the
 * same match and neither can be absent: an unparseable token is null, never
 * "Loser of game undefined".
 */
export function bracketSourceLabel(token: string | null | undefined): string | null {
  const source = parseBracketSource(token);
  if (source === null) return null;
  return `${source.kind === 'winner' ? 'Winner' : 'Loser'} of game ${source.game}`;
}

export interface BracketSlotLabelInput {
  slot: BracketSlotRow;
  side: 'team1' | 'team2';
  /** Every row of the same bracket, so a source game can be looked up. */
  bracket: readonly BracketSlotRow[];
  /** The display name for a roster. */
  teamName: (rosterId: number) => string;
}

/**
 * What one side of a bracket game shows.
 *
 * In order: the roster Sleeper assigned; else the team the source game has
 * already produced (Sleeper fills the slot on a later refresh, and the label
 * should not lag a decided game); else "Winner of game N" / "Loser of game N".
 * Null only when the slot has neither a team nor a source — a bye or a pairing
 * Sleeper has not published — which the page renders as such.
 */
export function bracketSlotLabel({
  slot,
  side,
  bracket,
  teamName,
}: BracketSlotLabelInput): string | null {
  const assigned = side === 'team1' ? slot.team1_roster_id : slot.team2_roster_id;
  if (assigned !== null) return teamName(assigned);

  const token = side === 'team1' ? slot.team1_from : slot.team2_from;
  const source = parseBracketSource(token);
  if (source === null) return null;

  const from = bracket.find((row) => row.game === source.game);
  const produced = source.kind === 'winner' ? from?.winner_roster_id : from?.loser_roster_id;
  if (produced !== null && produced !== undefined) return teamName(produced);

  return bracketSourceLabel(token);
}

/**
 * One row per bracket game, for either bracket.
 *
 * Nothing is inferred: an undecided game keeps null winner and loser, and an
 * unfilled slot keeps a null roster ID next to the token saying where its team
 * will come from. "Winner of game 3" is a future slot, never a prediction.
 */
export function buildBracketSlotRows({
  leagueId,
  bracket,
  games,
}: BuildBracketSlotRowsInput): BracketSlotRow[] {
  return games.map((game) => ({
    $id: bracketSlotId(leagueId, bracket, game.m),
    league_id: leagueId,
    bracket,
    round: game.r,
    game: game.m,
    team1_roster_id: game.t1 ?? null,
    team2_roster_id: game.t2 ?? null,
    team1_from: bracketSourceToken(game.t1_from),
    team2_from: bracketSourceToken(game.t2_from),
    winner_roster_id: game.w ?? null,
    loser_roster_id: game.l ?? null,
    placement: game.p ?? null,
  }));
}
