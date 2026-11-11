// apps/web's thin I/O wrapper: fetches a Sleeper league straight from the
// browser and hands raw payloads to @fantasy-football/core, which does every
// calculation. No backend, no persistence beyond a local player-dictionary
// cache — a page load always recomputes from Sleeper's live data.

import {
  SleeperClient,
  buildSeasonModel,
  leagueCurrentWeek,
  partitionSettled,
  seasonLastWeek,
  trimPlayerDictionary,
  type CurrentDashboard,
  type HistoryDashboard,
  type PlayerDictionary,
  type PlayoffsDashboard,
  type SleeperDraftPick,
  type SleeperLeague,
  type SummaryDashboard,
} from '@fantasy-football/core';
import leagueConfig from '../../../../config/league.json';

export interface Dashboards {
  current: CurrentDashboard;
  history: HistoryDashboard;
  playoffs: PlayoffsDashboard;
  summary: SummaryDashboard;
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
    localStorage.setItem(
      PLAYERS_CACHE_KEY,
      JSON.stringify({ fetchedAt: syncedAt.toISOString(), players }),
    );
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

/**
 * Every week on the league's calendar, scored or not. Unplayed weeks carry
 * Sleeper's published pairings, which the playoff simulation needs to replay
 * the real remaining schedule; core ignores their zero scores.
 */
async function fetchWeeklyMatchups(
  league: SleeperLeague,
): Promise<Map<number, Awaited<ReturnType<SleeperClient['getMatchups']>>>> {
  const weeks = Array.from({ length: seasonLastWeek(league) }, (_unused, i) => i + 1);
  const results = partitionSettled(await sleeper.getMatchupsForWeeks(league.league_id, weeks));
  return new Map(results.ok.map(({ key, value }) => [key, value]));
}

/** The entered league's season (possibly still live), as raw payloads. */
async function fetchCurrentSeason(leagueId: string): Promise<RawSeason> {
  const [league, users, rosters] = await Promise.all([
    sleeper.getLeague(leagueId),
    sleeper.getUsers(leagueId),
    sleeper.getRosters(leagueId),
  ]);
  const [matchups, winnersBracket, losersBracket] = await Promise.all([
    fetchWeeklyMatchups(league),
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

/**
 * Every public read model for one league, computed fresh from Sleeper. Only
 * the entered league's own season is fetched; prior seasons are not.
 */
export async function loadDashboards(leagueId: string): Promise<Dashboards> {
  const now = new Date();
  const [current, { players, syncedAt: playersSyncedAt }] = await Promise.all([
    fetchCurrentSeason(leagueId),
    loadPlayers(),
  ]);

  let draft = null;
  let draftPicks: SleeperDraftPick[] = [];
  try {
    const drafts = await sleeper.getDrafts(leagueId);
    const draftId = current.league.draft_id ?? drafts[0]?.draft_id;
    if (draftId) {
      const [full, picks] = await Promise.all([
        sleeper.getDraft(draftId),
        sleeper.getDraftPicks(draftId),
      ]);
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
    currentWeek: leagueCurrentWeek(current.league, current.scoredThroughWeek),
    frozenWeeks: new Map(),
    rules: { playoffSim: leagueConfig.playoffSim },
    now,
    coreVersion: 'web',
  });

  return {
    current: model.dashboards.current,
    history: model.dashboards.history,
    playoffs: model.dashboards.playoffs,
    summary: model.dashboards.summary,
    generatedAt: now.toISOString(),
    finalizedThroughWeek: current.scoredThroughWeek >= 1 ? current.scoredThroughWeek : null,
  };
}

export interface FoundLeague {
  league_id: string;
  name: string;
  season: string;
  status: string;
  total_rosters: number | null;
}

/** The Sleeper user ID for a username, or null when Sleeper has no such user. */
export async function findUserId(username: string): Promise<string | null> {
  const trimmed = username.trim();
  if (trimmed === '') return null;
  const user = await sleeper.getUserByUsername(trimmed);
  return user?.user_id ?? null;
}

/** Leagues a Sleeper user belongs to for a season, for the "find my league" entry flow. */
export async function findLeaguesForUser(userId: string, season: string): Promise<FoundLeague[]> {
  const leagues = await sleeper.getUserLeagues(userId, season);
  return (leagues ?? []).map((league) => ({
    league_id: league.league_id,
    name: league.name,
    season: league.season,
    status: league.status,
    total_rosters: league.total_rosters ?? null,
  }));
}
