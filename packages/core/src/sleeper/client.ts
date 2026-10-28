import { settleAll } from './batch';
import type { SettleOptions, SettledEntry } from './batch';
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
} from './types';

export const SLEEPER_BASE_URL = 'https://api.sleeper.app/v1';

export interface SleeperClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof globalThis.fetch;
  /** Extra attempts after the first. Default 2, so 3 attempts total. */
  retries?: number;
  /** Base backoff, doubled per attempt. Default 500ms. */
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class SleeperError extends Error {
  constructor(
    readonly path: string,
    readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'SleeperError';
  }
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Sleeper API client. No authentication; the whole API is public.
 *
 * Retries only what is worth retrying — a network failure, a 429, or a 5xx.
 * A 404 is a real answer and fails immediately. `calls` counts every HTTP
 * attempt so `ingest_runs.calls_made` reports the true cost of a run.
 */
export class SleeperClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly retries: number;
  private readonly retryDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private attempts = 0;

  constructor(options: SleeperClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? SLEEPER_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.retries = options.retries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 500;
    this.sleep = options.sleep ?? defaultSleep;
  }

  /** HTTP attempts made so far, retries included. */
  get calls(): number {
    return this.attempts;
  }

  private async get<T>(path: string): Promise<T> {
    let lastError: SleeperError | undefined;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0) await this.sleep(this.retryDelayMs * 2 ** (attempt - 1));
      this.attempts++;

      let response: Response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          headers: { accept: 'application/json' },
        });
      } catch (cause) {
        lastError = new SleeperError(path, null, `network error: ${String(cause)}`);
        continue;
      }

      if (response.ok) {
        const body = (await response.json()) as T | null;

        // Sleeper answers 200 with a bare `null` for some unknown IDs. Stored
        // as "no rows" that would quietly empty a table, and retrying will not
        // change the answer, so it fails here and now.
        if (body === null) {
          throw new SleeperError(path, response.status, 'Sleeper returned a null body');
        }
        return body;
      }

      const retryable = response.status === 429 || response.status >= 500;
      lastError = new SleeperError(path, response.status, `HTTP ${response.status}`);
      if (!retryable) throw lastError;
    }

    throw lastError ?? new SleeperError(path, null, 'request failed');
  }

  getNflState(): Promise<NflState> {
    return this.get<NflState>('/state/nfl');
  }

  getLeague(leagueId: string): Promise<SleeperLeague> {
    return this.get<SleeperLeague>(`/league/${leagueId}`);
  }

  /**
   * Resolves a Sleeper username to an account. Null for a username that
   * doesn't exist — Sleeper answers an unknown username with `200 null`,
   * not a 404, so that's the signal this checks for.
   */
  async getUserByUsername(username: string): Promise<SleeperUser | null> {
    try {
      return await this.get<SleeperUser>(`/user/${encodeURIComponent(username)}`);
    } catch (cause) {
      if (cause instanceof SleeperError && cause.message === 'Sleeper returned a null body') {
        return null;
      }
      throw cause;
    }
  }

  /** Every league a user is in for a season — the "find my league" lookup. */
  getUserLeagues(userId: string, season: string): Promise<SleeperLeague[]> {
    return this.get<SleeperLeague[]>(`/user/${userId}/leagues/nfl/${season}`);
  }

  /** Display names and team names change mid-season; re-pull every run. */
  getUsers(leagueId: string): Promise<SleeperUser[]> {
    return this.get<SleeperUser[]>(`/league/${leagueId}/users`);
  }

  getRosters(leagueId: string): Promise<SleeperRoster[]> {
    return this.get<SleeperRoster[]>(`/league/${leagueId}/rosters`);
  }

  getMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
    return this.get<SleeperMatchup[]>(`/league/${leagueId}/matchups/${week}`);
  }

  /** Week 0 is the pre-season and is legitimately empty. */
  getTransactions(leagueId: string, week: number): Promise<SleeperTransaction[]> {
    return this.get<SleeperTransaction[]>(`/league/${leagueId}/transactions/${week}`);
  }

  getWinnersBracket(leagueId: string): Promise<SleeperBracketGame[]> {
    return this.get<SleeperBracketGame[]>(`/league/${leagueId}/winners_bracket`);
  }

  getLosersBracket(leagueId: string): Promise<SleeperBracketGame[]> {
    return this.get<SleeperBracketGame[]>(`/league/${leagueId}/losers_bracket`);
  }

  getDrafts(leagueId: string): Promise<SleeperDraft[]> {
    return this.get<SleeperDraft[]>(`/league/${leagueId}/drafts`);
  }

  getDraft(draftId: string): Promise<SleeperDraft> {
    return this.get<SleeperDraft>(`/draft/${draftId}`);
  }

  getDraftPicks(draftId: string): Promise<SleeperDraftPick[]> {
    return this.get<SleeperDraftPick[]>(`/draft/${draftId}/picks`);
  }

  /** ~20 MB. Fetch at most once a day and cache the trimmed result. */
  getPlayers(): Promise<PlayerDictionary> {
    return this.get<PlayerDictionary>('/players/nfl');
  }

  /**
   * Several weeks of matchups at once, keyed by week. A week that fails is
   * reported as a failure for that week only — the rest still arrive.
   */
  getMatchupsForWeeks(
    leagueId: string,
    weeks: readonly number[],
    options: SettleOptions = {},
  ): Promise<Array<SettledEntry<number, SleeperMatchup[]>>> {
    return settleAll(weeks, (week) => this.getMatchups(leagueId, week), options);
  }

  /** As getMatchupsForWeeks, for transactions. */
  getTransactionsForWeeks(
    leagueId: string,
    weeks: readonly number[],
    options: SettleOptions = {},
  ): Promise<Array<SettledEntry<number, SleeperTransaction[]>>> {
    return settleAll(weeks, (week) => this.getTransactions(leagueId, week), options);
  }
}
