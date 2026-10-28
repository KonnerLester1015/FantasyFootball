// apps/web's thin I/O wrapper: fetches a Sleeper league straight from the
// browser and hands raw payloads to @family-feud/core, which does every
// calculation. No backend, no persistence beyond a local player-dictionary
// cache — a page load always recomputes from Sleeper's live data.

import {
  SleeperClient,
  buildSeasonHistorySlice,
  buildSeasonModel,
  combineHistory,
  currentSeasonWeek,
  partitionSettled,
  seasonLastWeek,
  trimPlayerDictionary,
  type CurrentDashboard,
  type HistoryDashboard,
  type PlayerDictionary,
  type PlayoffsDashboard,
  type SeasonHistorySlice,
  type SleeperDraftPick,
  type SleeperLeague,
  type SummaryDashboard,
} from '@family-feud/core';
import leagueConfig from '../../../../config/league.json';

export interface Dashboards {
  current: CurrentDashboard;
  history: HistoryDashboard;
  playoffs: PlayoffsDashboard;
  summary: SummaryDashboard;
  /** Trade recaps show players by name, resolved from this season's player dictionary. */
  playerNames: Map<string, string>;
  generatedAt: string;
  finalizedThroughWeek: number | null;
}

const sleeper = new SleeperClient();

const PLAYERS_CACHE_KEY = 'ff.players.v1';
const PLAYERS_MAX_AGE_HOURS = 24;

interface PlayersCache {
  fetchedAt: string;
  players: PlayerDictionary;
}

/** The trimmed player dictionary (~1-2 MB), cached a day at a time per browser. */
async function loadPlayers(): Promise<{ players: PlayerDictionary; syncedAt: Date }> {
  try {
    const raw = localStorage.getItem(PLAYERS_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as PlayersCache;
      const syncedAt = new Date(cached.fetchedAt);
      const ageHours = (Date.now() - syncedAt.getTime()) / 3_600_000;
      if (ageHours < PLAYERS_MAX_AGE_HOURS) return { players: cached.players, syncedAt };
    }
  } catch {
    // Unreadable or disabled storage: fall through and fetch fresh.
  }

  const players = trimPlayerDictionary(await sleeper.getPlayers());
  const syncedAt = new Date();
  try {
    localStorage.setItem(PLAYERS_CACHE_KEY, JSON.stringify({ fetchedAt: syncedAt.toISOString(), players }));
  } catch {
    // Storage full or disabled: still works, just refetches next load.
  }
  return { players, syncedAt };
}

interface RawSeason {
  league: SleeperLeague;
  users: Awaited<ReturnType<SleeperClient['getUsers']>>;
  rosters: Awaited<ReturnType<SleeperClient['getRosters']>>;
  matchups: Map<number, Awaited<ReturnType<SleeperClient['getMatchups']>>>;
  winnersBracket: Awaited<ReturnType<SleeperClient['getWinnersBracket']>>;
  losersBracket: Awaited<ReturnType<SleeperClient['getLosersBracket']>>;
  scoredThroughWeek: number;
}

/** Every week a season could have played, scored or not. */
async function fetchWeeklyMatchups(
  leagueId: string,
  throughWeek: number,
): Promise<Map<number, Awaited<ReturnType<SleeperClient['getMatchups']>>>> {
  const weeks = Array.from({ length: Math.max(0, throughWeek) }, (_unused, i) => i + 1);
  const results = partitionSettled(await sleeper.getMatchupsForWeeks(leagueId, weeks));
  return new Map(results.ok.map(({ key, value }) => [key, value]));
}

/** The current (most recent, possibly still-live) season's full raw payload. */
async function fetchCurrentSeason(leagueId: string): Promise<RawSeason> {
  const [state, league, users, rosters] = await Promise.all([
    sleeper.getNflState(),
    sleeper.getLeague(leagueId),
    sleeper.getUsers(leagueId),
    sleeper.getRosters(leagueId),
  ]);
  const currentWeek = currentSeasonWeek(league, Number(state.week) || 0);
  const [matchups, winnersBracket, losersBracket] = await Promise.all([
    fetchWeeklyMatchups(leagueId, currentWeek),
    sleeper.getWinnersBracket(leagueId),
    sleeper.getLosersBracket(leagueId),
  ]);
  return {
    league,
    users,
    rosters,
    matchups,
    winnersBracket,
    losersBracket,
    scoredThroughWeek: league.settings.last_scored_leg ?? 0,
  };
}

/** A completed prior season: every week is scored, so there is no "current week" to find. */
async function fetchPastSeason(league: SleeperLeague): Promise<RawSeason> {
  const leagueId = league.league_id;
  const [users, rosters] = await Promise.all([sleeper.getUsers(leagueId), sleeper.getRosters(leagueId)]);
  const lastWeek = seasonLastWeek(league);
  const [matchups, winnersBracket, losersBracket] = await Promise.all([
    fetchWeeklyMatchups(leagueId, lastWeek),
    sleeper.getWinnersBracket(leagueId),
    sleeper.getLosersBracket(leagueId),
  ]);
  return {
    league,
    users,
    rosters,
    matchups,
    winnersBracket,
    losersBracket,
    scoredThroughWeek: league.settings.last_scored_leg ?? lastWeek,
  };
}

/** The current league plus every prior season reachable via `previous_league_id`. */
async function fetchLeagueChain(leagueId: string): Promise<RawSeason[]> {
  const current = await fetchCurrentSeason(leagueId);
  const seasons = [current];
  let previousId = current.league.previous_league_id;
  while (previousId) {
    const league = await sleeper.getLeague(previousId);
    seasons.push(await fetchPastSeason(league));
    previousId = league.previous_league_id ?? null;
  }
  return seasons;
}

function playerNamesOf(players: PlayerDictionary): Map<string, string> {
  return new Map(
    Object.entries(players).map(([id, player]) => [
      id,
      [
        player.full_name ?? id,
        player.position && `(${player.position}${player.team ? `, ${player.team}` : ''})`,
      ]
        .filter(Boolean)
        .join(' '),
    ]),
  );
}

/**
 * Every public read model for one league, computed fresh from Sleeper. History
 * walks `previous_league_id` back through every reachable prior season and
 * composes them with the current season using the same pure history functions
 * `buildSeasonModel` uses for the current one — see pipeline/history-slice.ts.
 */
export async function loadDashboards(leagueId: string): Promise<Dashboards> {
  const now = new Date();
  const [chain, { players, syncedAt: playersSyncedAt }] = await Promise.all([
    fetchLeagueChain(leagueId),
    loadPlayers(),
  ]);
  const [current, ...past] = chain;
  if (!current) throw new Error(`League ${leagueId} was not found.`);

  let draft = null;
  let draftPicks: SleeperDraftPick[] = [];
  try {
    const drafts = await sleeper.getDrafts(leagueId);
    const draftId = current.league.draft_id ?? drafts[0]?.draft_id;
    if (draftId) {
      const [full, picks] = await Promise.all([sleeper.getDraft(draftId), sleeper.getDraftPicks(draftId)]);
      draft = full;
      draftPicks = picks;
    }
  } catch {
    // Draft data is supplementary to the dashboards; proceed without it.
  }

  const model = buildSeasonModel({
    league: current.league,
    users: current.users,
    rosters: current.rosters,
    matchups: current.matchups,
    transactions: new Map(),
    winnersBracket: current.winnersBracket,
    losersBracket: current.losersBracket,
    draft,
    draftPicks,
    players,
    playersSyncedAt,
    scoredThroughWeek: current.scoredThroughWeek,
    currentWeek: currentSeasonWeek(current.league, current.scoredThroughWeek),
    frozenWeeks: new Map(),
    rules: { playoffSim: leagueConfig.playoffSim },
    now,
    coreVersion: 'web',
  });

  const slices: SeasonHistorySlice[] = [current, ...past].map((season) =>
    buildSeasonHistorySlice({
      league: season.league,
      users: season.users,
      rosters: season.rosters,
      matchups: season.matchups,
      winnersBracket: season.winnersBracket,
      scoredThroughWeek: season.scoredThroughWeek,
      now,
    }),
  );
  const history = combineHistory({ slices, asOf: model.dashboards.current.as_of, now });

  return {
    current: model.dashboards.current,
    history,
    playoffs: model.dashboards.playoffs,
    summary: model.dashboards.summary,
    playerNames: playerNamesOf(players),
    generatedAt: now.toISOString(),
    finalizedThroughWeek: current.scoredThroughWeek >= 1 ? current.scoredThroughWeek : null,
  };
}

export interface FoundLeague {
  league_id: string;
  name: string;
  season: string;
}

/** Leagues a Sleeper username belongs to for a season, for the "find my league" entry flow. */
export async function findLeaguesForUsername(username: string, season: string): Promise<FoundLeague[]> {
  const trimmed = username.trim();
  if (trimmed === '') return [];
  const user = await sleeper.getUserByUsername(trimmed);
  if (!user) return [];
  return sleeper.getUserLeagues(user.user_id, season);
}
