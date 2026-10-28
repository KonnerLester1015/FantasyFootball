// Test input only. Loads fixtures/sleeper and hands each payload back under the
// type the client promises for that endpoint. Deliberately NOT exported from
// index.ts: nothing shipped should depend on fixtures.
//
// This file earns its keep twice. The tests use it to avoid repeating import
// paths, and `npm run typecheck` uses it to prove that the shapes in
// sleeper/types.ts still describe real Sleeper responses — a field renamed in
// types.ts but not in the API fails the build here rather than in production.
//
// Fixtures are raw captures; never hand-edit one to make a test pass
// (fixtures/README.md).

import leagueJson from '../../../fixtures/sleeper/league.json';
import usersJson from '../../../fixtures/sleeper/users.json';
import rostersJson from '../../../fixtures/sleeper/rosters.json';
import stateJson from '../../../fixtures/sleeper/state.json';
import playersJson from '../../../fixtures/sleeper/players.json';
import winnersBracketJson from '../../../fixtures/sleeper/winners_bracket.json';
import losersBracketJson from '../../../fixtures/sleeper/losers_bracket.json';
import draftsJson from '../../../fixtures/sleeper/drafts.json';
import draftJson from '../../../fixtures/sleeper/draft-1390575666528796672.json';
import draftPicksJson from '../../../fixtures/sleeper/draft-1390575666528796672-picks.json';
import matchupsW01 from '../../../fixtures/sleeper/matchups-w01.json';
import matchupsW02 from '../../../fixtures/sleeper/matchups-w02.json';
import matchupsW03 from '../../../fixtures/sleeper/matchups-w03.json';
import matchupsW04 from '../../../fixtures/sleeper/matchups-w04.json';
import matchupsW05 from '../../../fixtures/sleeper/matchups-w05.json';
import matchupsW06 from '../../../fixtures/sleeper/matchups-w06.json';
import matchupsW07 from '../../../fixtures/sleeper/matchups-w07.json';
import matchupsW08 from '../../../fixtures/sleeper/matchups-w08.json';
import matchupsW09 from '../../../fixtures/sleeper/matchups-w09.json';
import matchupsW10 from '../../../fixtures/sleeper/matchups-w10.json';
import matchupsW11 from '../../../fixtures/sleeper/matchups-w11.json';
import matchupsW12 from '../../../fixtures/sleeper/matchups-w12.json';
import matchupsW13 from '../../../fixtures/sleeper/matchups-w13.json';
import matchupsW14 from '../../../fixtures/sleeper/matchups-w14.json';
import transactionsW00 from '../../../fixtures/sleeper/transactions-w00.json';
import transactionsW01 from '../../../fixtures/sleeper/transactions-w01.json';
import transactionsW02 from '../../../fixtures/sleeper/transactions-w02.json';
import transactionsW03 from '../../../fixtures/sleeper/transactions-w03.json';
import transactionsW04 from '../../../fixtures/sleeper/transactions-w04.json';
import transactionsW05 from '../../../fixtures/sleeper/transactions-w05.json';

import type {
  NflState,
  PlayerDictionary,
  SleeperBracketGame,
  SleeperDraft,
  SleeperDraftPick,
  SleeperLeague,
  SleeperMatchup,
  SleeperRoster,
  SleeperTransaction,
  SleeperUser,
} from './sleeper/types';

/** The league the fixtures were captured from. */
export const FIXTURE_LEAGUE_ID = '1390575664880418816';
export const FIXTURE_SEASON = '2026';
export const FIXTURE_DRAFT_ID = '1390575666528796672';

/**
 * Weeks 1-4 are finalized; the capture ran during week 5, so week 5 is live.
 * Every golden number is "through week 4" for that reason. Weeks 6-14 are
 * unplayed: they are the real remaining schedule, pairings only.
 */
export const FINALIZED_WEEKS = [1, 2, 3, 4] as const;

export const state: NflState = stateJson;
export const league: SleeperLeague = leagueJson;
export const users: SleeperUser[] = usersJson;
export const rosters: SleeperRoster[] = rostersJson;
export const players: PlayerDictionary = playersJson as PlayerDictionary;
export const winnersBracket: SleeperBracketGame[] = winnersBracketJson;
export const losersBracket: SleeperBracketGame[] = losersBracketJson;
export const drafts: SleeperDraft[] = draftsJson;
export const draft: SleeperDraft = draftJson;
export const draftPicks: SleeperDraftPick[] = draftPicksJson;

const matchupsByWeek: Record<number, SleeperMatchup[]> = {
  1: matchupsW01,
  2: matchupsW02,
  3: matchupsW03,
  4: matchupsW04,
  5: matchupsW05,
  6: matchupsW06,
  7: matchupsW07,
  8: matchupsW08,
  9: matchupsW09,
  10: matchupsW10,
  11: matchupsW11,
  12: matchupsW12,
  13: matchupsW13,
  14: matchupsW14,
};

const transactionsByWeek: Record<number, SleeperTransaction[]> = {
  0: transactionsW00,
  1: transactionsW01,
  2: transactionsW02,
  3: transactionsW03,
  4: transactionsW04,
  5: transactionsW05,
};

export function matchups(week: number): SleeperMatchup[] {
  const found = matchupsByWeek[week];
  if (!found) throw new Error(`no matchup fixture for week ${week}`);
  return found;
}

export function transactions(week: number): SleeperTransaction[] {
  const found = transactionsByWeek[week];
  if (!found) throw new Error(`no transaction fixture for week ${week}`);
  return found;
}
