// Deterministic row IDs for packages/core's normalized tables (SeasonModel.tables):
// every ID is a pure function of the thing it identifies, so the same row always
// gets the same ID — stable enough to use as a React list key.
//
// The 36-character cap and allowed-character set came from this project's original
// Appwrite-backed design, where an ID this shape was a real document ID. Nothing
// writes to Appwrite anymore, but the formulas kept their budget rather than being
// loosened for no reason — a league ID alone is 19 characters, so there was never
// much headroom to begin with.

/** The historical row-ID cap every formula below still budgets against. */
export const MAX_ROW_ID_LENGTH = 36;

const VALID_ROW_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export class RowIdError extends Error {
  constructor(id: string, reason: string) {
    super(`invalid row id ${JSON.stringify(id)}: ${reason}`);
    this.name = 'RowIdError';
  }
}

/**
 * Enforce the row-ID shape at the point of construction.
 *
 * The league ID alone is 19 of the 36 allowed characters, so the formulas below
 * have little headroom. Failing loudly here is the point: a truncated or
 * rejected ID would silently split one logical row into two.
 */
export function assertRowId(id: string): string {
  if (id.length === 0) throw new RowIdError(id, 'empty');
  if (id.length > MAX_ROW_ID_LENGTH) {
    throw new RowIdError(id, `${id.length} chars exceeds the ${MAX_ROW_ID_LENGTH}-char limit`);
  }
  if (!VALID_ROW_ID.test(id)) {
    throw new RowIdError(id, 'must start alphanumeric and use only a-z A-Z 0-9 . - _');
  }
  return id;
}

/** Zero-pad so IDs sort lexically in the same order as numerically. */
export function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/** One row per season per roster: `{leagueId}_{rosterId}`. */
export function teamId(leagueId: string, rosterId: number): string {
  return assertRowId(`${leagueId}_${pad(rosterId, 2)}`);
}

/** One row per week: `{leagueId}_{ww}`. */
export function weekRowId(leagueId: string, week: number): string {
  return assertRowId(`${leagueId}_${pad(week, 2)}`);
}

/** One read model per view: `{leagueId}_{view}`. */
export function dashboardId(
  leagueId: string,
  view: 'current' | 'history' | 'playoffs' | 'summary',
): string {
  return assertRowId(`${leagueId}_${view}`);
}

/** One row per roster per week: `{leagueId}_{ww}_{rosterId}`. */
export function matchupRowId(leagueId: string, week: number, rosterId: number): string {
  return assertRowId(`${leagueId}_${pad(week, 2)}_${pad(rosterId, 2)}`);
}

/**
 * `{leagueId}_{ww}_{rosterId}_{playerId}` — 26 fixed characters, leaving 10 for
 * a Sleeper player ID. Shared by the two tables keyed that way, so the length
 * budget cannot drift between them.
 */
function weekRosterPlayerId(
  leagueId: string,
  week: number,
  rosterId: number,
  playerId: string,
): string {
  return assertRowId(`${leagueId}_${pad(week, 2)}_${pad(rosterId, 2)}_${playerId}`);
}

/** One row per player per roster per week. */
export function playerScoreId(
  leagueId: string,
  week: number,
  rosterId: number,
  playerId: string,
): string {
  return weekRosterPlayerId(leagueId, week, rosterId, playerId);
}

/**
 * One row per bracket game: `{leagueId}_{bracket}_{gg}`. Sleeper numbers games
 * uniquely across rounds, so the round is not part of the key.
 */
export function bracketSlotId(
  leagueId: string,
  bracket: 'winners' | 'losers',
  game: number,
): string {
  return assertRowId(`${leagueId}_${bracket}_${pad(game, 2)}`);
}

/**
 * One row per record per step: `{leagueId}_{recordCode}_{ww}`. A season-level
 * step (completed-season score, titles) has no week and uses `ss`, which sorts
 * after every week. The longest code, `narrow_win`, gives 33 characters.
 */
export function recordEventId(leagueId: string, recordCode: string, week: number | null): string {
  return assertRowId(`${leagueId}_${recordCode}_${week === null ? 'ss' : pad(week, 2)}`);
}

/** One row per pick: `{draftId}_{pppp}`, padded to four so picks sort in order. */
export function draftPickId(draftId: string, pickNo: number): string {
  return assertRowId(`${draftId}_${pad(pickNo, 4)}`);
}
