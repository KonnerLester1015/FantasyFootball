import { describe, expect, it } from 'vitest';
import { SLEEPER_BASE_URL, SleeperClient, SleeperError } from './client';
import * as fixtures from '../test-fixtures';

// The retry rules are the point of this file. The Apps Script version this
// replaced aborted everything on one HTTP error, so the replacement has
// to retry what is worth retrying and fail fast on what is not.

interface Recorded {
  urls: string[];
  sleeps: number[];
}

/** A client whose fetch returns the queued responses in order. */
function clientReturning(
  responses: Array<Response | Error>,
  options: { retries?: number; retryDelayMs?: number } = {},
): { client: SleeperClient; recorded: Recorded } {
  const recorded: Recorded = { urls: [], sleeps: [] };
  let index = 0;

  const client = new SleeperClient({
    ...options,
    fetchImpl: (input) => {
      recorded.urls.push(String(input));
      const next = responses[index++];
      if (next === undefined) throw new Error('fetch called more times than the test queued');
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
    sleep: (ms) => {
      recorded.sleeps.push(ms);
      return Promise.resolve();
    },
  });

  return { client, recorded };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function ok(body: unknown): Response {
  return json(body);
}

describe('SleeperClient request paths', () => {
  const leagueId = fixtures.FIXTURE_LEAGUE_ID;

  it('builds every documented endpoint off the public base URL', async () => {
    const { client, recorded } = clientReturning([
      ok(fixtures.state),
      ok(fixtures.league),
      ok(fixtures.users),
      ok(fixtures.rosters),
      ok(fixtures.matchups(4)),
      ok(fixtures.transactions(4)),
      ok(fixtures.winnersBracket),
      ok(fixtures.losersBracket),
      ok(fixtures.drafts),
      ok(fixtures.draft),
      ok(fixtures.draftPicks),
      ok(fixtures.players),
    ]);

    await client.getNflState();
    await client.getLeague(leagueId);
    await client.getUsers(leagueId);
    await client.getRosters(leagueId);
    await client.getMatchups(leagueId, 4);
    await client.getTransactions(leagueId, 4);
    await client.getWinnersBracket(leagueId);
    await client.getLosersBracket(leagueId);
    await client.getDrafts(leagueId);
    await client.getDraft(fixtures.FIXTURE_DRAFT_ID);
    await client.getDraftPicks(fixtures.FIXTURE_DRAFT_ID);
    await client.getPlayers();

    expect(recorded.urls).toEqual([
      `${SLEEPER_BASE_URL}/state/nfl`,
      `${SLEEPER_BASE_URL}/league/${leagueId}`,
      `${SLEEPER_BASE_URL}/league/${leagueId}/users`,
      `${SLEEPER_BASE_URL}/league/${leagueId}/rosters`,
      `${SLEEPER_BASE_URL}/league/${leagueId}/matchups/4`,
      `${SLEEPER_BASE_URL}/league/${leagueId}/transactions/4`,
      `${SLEEPER_BASE_URL}/league/${leagueId}/winners_bracket`,
      `${SLEEPER_BASE_URL}/league/${leagueId}/losers_bracket`,
      `${SLEEPER_BASE_URL}/league/${leagueId}/drafts`,
      `${SLEEPER_BASE_URL}/draft/${fixtures.FIXTURE_DRAFT_ID}`,
      `${SLEEPER_BASE_URL}/draft/${fixtures.FIXTURE_DRAFT_ID}/picks`,
      `${SLEEPER_BASE_URL}/players/nfl`,
    ]);
  });

  it('returns the parsed payload under the endpoint type', async () => {
    const { client } = clientReturning([ok(fixtures.league), ok(fixtures.rosters)]);

    const league = await client.getLeague(leagueId);
    expect(league.league_id).toBe(leagueId);
    expect(league.settings.playoff_week_start).toBe(15);
    expect(league.roster_positions).toContain('FLEX');

    const rosters = await client.getRosters(leagueId);
    expect(rosters).toHaveLength(14);
    expect(rosters[0]?.settings?.fpts).toBe(548);
  });

  it('honours a custom base URL so a replay proxy can stand in', async () => {
    const recorded: string[] = [];
    const client = new SleeperClient({
      baseUrl: 'https://example.test/v1',
      fetchImpl: (input) => {
        recorded.push(String(input));
        return Promise.resolve(ok(fixtures.state));
      },
    });

    await client.getNflState();
    expect(recorded).toEqual(['https://example.test/v1/state/nfl']);
  });
});

describe('SleeperClient retry', () => {
  it('retries a 5xx and doubles the backoff between attempts', async () => {
    const { client, recorded } = clientReturning(
      [json({}, 500), json({}, 503), ok(fixtures.state)],
      { retryDelayMs: 100 },
    );

    const state = await client.getNflState();

    expect(state.week).toBe(5);
    expect(recorded.sleeps).toEqual([100, 200]);
    expect(client.calls).toBe(3);
  });

  it('retries a 429', async () => {
    const { client } = clientReturning([json({}, 429), ok(fixtures.state)]);
    await expect(client.getNflState()).resolves.toMatchObject({ week: 5 });
    expect(client.calls).toBe(2);
  });

  it('retries a network failure', async () => {
    const { client } = clientReturning([new Error('ECONNRESET'), ok(fixtures.state)]);
    await expect(client.getNflState()).resolves.toMatchObject({ week: 5 });
  });

  // A 404 is a real answer — a league that does not exist will not start
  // existing on attempt three.
  it('fails a 404 immediately without sleeping', async () => {
    const { client, recorded } = clientReturning([json({ error: 'not found' }, 404)]);

    await expect(client.getLeague('nope')).rejects.toThrow(SleeperError);
    expect(recorded.sleeps).toEqual([]);
    expect(client.calls).toBe(1);
  });

  it('gives up after the configured number of retries and reports the last status', async () => {
    const { client } = clientReturning([json({}, 500), json({}, 500), json({}, 502)], {
      retries: 2,
    });

    const error = await client.getNflState().catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(SleeperError);
    expect(error).toMatchObject({ status: 502, path: '/state/nfl' });
    expect(client.calls).toBe(3);
  });

  it('surfaces a network failure that never clears as a SleeperError with no status', async () => {
    const { client } = clientReturning([new Error('ECONNRESET'), new Error('ECONNRESET')], {
      retries: 1,
    });

    const error = await client.getNflState().catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(SleeperError);
    expect(error).toMatchObject({ status: null });
    expect(String(error)).toContain('ECONNRESET');
  });

  // Sleeper answers 200 with a bare `null` for some unknown IDs. Writing that
  // into the database as "no rosters" would quietly wipe a table, so it is an
  // error — and not a retryable one, because the answer will not change.
  it('rejects a 200 whose body is null, without retrying', async () => {
    const { client, recorded } = clientReturning([ok(null)]);

    await expect(client.getRosters('nope')).rejects.toThrow(/null/i);
    expect(recorded.sleeps).toEqual([]);
    expect(client.calls).toBe(1);
  });

  it('counts every attempt across calls so a run can report its true cost', async () => {
    const { client } = clientReturning([json({}, 500), ok(fixtures.state), ok(fixtures.league)]);

    await client.getNflState();
    await client.getLeague(fixtures.FIXTURE_LEAGUE_ID);

    expect(client.calls).toBe(3);
  });
});

describe('SleeperClient weekly batches', () => {
  it('fetches the requested weeks and keys the results by week', async () => {
    const { client, recorded } = clientReturning([
      ok(fixtures.matchups(3)),
      ok(fixtures.matchups(4)),
    ]);

    const entries = await client.getMatchupsForWeeks(fixtures.FIXTURE_LEAGUE_ID, [3, 4], {
      concurrency: 1,
    });

    expect(entries.map((entry) => entry.key)).toEqual([3, 4]);
    expect(recorded.urls).toEqual([
      `${SLEEPER_BASE_URL}/league/${fixtures.FIXTURE_LEAGUE_ID}/matchups/3`,
      `${SLEEPER_BASE_URL}/league/${fixtures.FIXTURE_LEAGUE_ID}/matchups/4`,
    ]);
    for (const entry of entries) {
      expect(entry.result.ok).toBe(true);
    }
  });

  // The whole point of batching per endpoint: week 3 still lands when week 4
  // 500s, and the failure is reported rather than thrown away.
  it('keeps the weeks that succeeded when one week fails', async () => {
    const { client } = clientReturning(
      [ok(fixtures.transactions(1)), json({}, 500), json({}, 500)],
      { retries: 1 },
    );

    const entries = await client.getTransactionsForWeeks(fixtures.FIXTURE_LEAGUE_ID, [1, 2], {
      concurrency: 1,
    });

    expect(entries[0]?.result.ok).toBe(true);
    expect(entries[1]?.result.ok).toBe(false);
    if (entries[1]?.result.ok === false) {
      expect(entries[1].result.error).toBeInstanceOf(SleeperError);
    }
  });
});
