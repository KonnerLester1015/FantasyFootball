// Phase 2: save the raw Sleeper payloads that every packages/core test runs against.
//
//   npx tsx scripts/capture-fixtures.ts
//
// Writes fixtures/sleeper/. Each league endpoint is stored as the exact bytes Sleeper
// returned, so a fixture is evidence of what the API said, not of what we believe it
// says. The one constructed file is players.json: the full dictionary is ~20 MB of
// mostly irrelevant players, so only the players referenced by the payloads above are
// kept — whole entries, never field-trimmed, since trimming fields would bake today's
// idea of "fields we need" into tomorrow's test inputs.
//
// This script does its own fetching instead of importing packages/core/sleeper on
// purpose: these files are the inputs that client's tests assert against, and test
// inputs must not be produced by the code under test. It is the only duplicated
// fetch in the repo, and it stays small for that reason.
//
// Re-running overwrites everything. A finalized week's payload must not change when
// it does (CLAUDE.md, "finalized weeks are immutable"); if one does, that is a finding,
// not a fixture to quietly commit.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SLEEPER_BASE_URL = 'https://api.sleeper.app/v1';

/**
 * Weeks 1-5 are the finalized-or-live span the sheet exports cover (REBUILD_PLAN §6, phase 2).
 * Weeks 6-14 are unplayed: they carry the real remaining schedule the playoff model needs.
 */
const MATCHUP_WEEKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;
/** Week 0 holds Sleeper's pre-season waiver and commissioner moves, so transactions start there. */
const TRANSACTION_WEEKS = [0, 1, 2, 3, 4, 5] as const;

const RETRIES = 2;
const RETRY_DELAY_MS = 500;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(repoRoot, 'fixtures', 'sleeper');

const written: string[] = [];
let httpCalls = 0;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Raw response text plus its parsed form: the text is what we save, the value is what we read. */
interface Fetched {
  readonly text: string;
  readonly value: unknown;
}

/** Retries a network failure, a 429 and a 5xx. A 404 is a real answer and fails immediately. */
async function get(endpoint: string): Promise<Fetched> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS * 2 ** (attempt - 1));
    httpCalls++;

    let response: Response;
    try {
      response = await fetch(`${SLEEPER_BASE_URL}${endpoint}`, {
        headers: { accept: 'application/json' },
      });
    } catch (cause) {
      lastError = new Error(`${endpoint}: network error: ${String(cause)}`);
      continue;
    }

    if (!response.ok) {
      lastError = new Error(`${endpoint}: HTTP ${response.status}`);
      if (response.status !== 429 && response.status < 500) throw lastError;
      continue;
    }

    const text = await response.text();
    return { text, value: JSON.parse(text) as unknown };
  }

  throw lastError ?? new Error(`${endpoint}: request failed`);
}

/** Saves Sleeper's own bytes, unaltered. */
async function saveRaw(name: string, text: string): Promise<void> {
  await writeFile(path.join(outDir, name), text, 'utf8');
  written.push(name);
  console.log(`  ${name} (${text.length.toLocaleString('en-US')} bytes)`);
}

/** Saves a file we construct, formatted for review. */
async function saveOwn(name: string, value: unknown): Promise<void> {
  await saveRaw(name, `${JSON.stringify(value, null, 2)}\n`);
}

/** Fetches an endpoint and saves it verbatim. */
async function capture(endpoint: string, name: string): Promise<unknown> {
  const { text, value } = await get(endpoint);
  await saveRaw(name, text);
  return value;
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Player IDs listed in arrays: rosters and matchups. `starters_points` needs no entry
 *  here or below — it is an array of scores parallel to `starters`, not player IDs. */
const ID_ARRAY_KEYS = ['players', 'starters', 'reserve', 'taxi'] as const;
/** Player IDs used as object keys: matchup scores and transaction adds/drops. */
const ID_MAP_KEYS = ['players_points', 'adds', 'drops'] as const;

/**
 * Collects every player ID an array payload mentions. '0' is Sleeper's empty-starter-slot
 * marker, not a player. Team-defense IDs ('KC', 'DEN') are real dictionary keys and stay.
 */
function collectPlayerIds(payload: unknown, into: Set<string>): void {
  for (const entry of asArray(payload)) {
    const row = asRecord(entry);

    for (const key of ID_ARRAY_KEYS) {
      for (const id of asArray(row[key])) {
        if (typeof id === 'string' && id !== '' && id !== '0') into.add(id);
      }
    }

    for (const key of ID_MAP_KEYS) {
      for (const id of Object.keys(asRecord(row[key]))) {
        if (id !== '' && id !== '0') into.add(id);
      }
    }

    const draftPick = row['player_id'];
    if (typeof draftPick === 'string' && draftPick !== '' && draftPick !== '0') {
      into.add(draftPick);
    }
  }
}

async function main(): Promise<void> {
  const config = asRecord(
    JSON.parse(await readFile(path.join(repoRoot, 'config', 'league.json'), 'utf8')) as unknown,
  );
  const leagueId = config['leagueId'];
  if (typeof leagueId !== 'string') throw new Error('config/league.json: leagueId is missing');

  await mkdir(outDir, { recursive: true });
  console.log(`Capturing league ${leagueId} into fixtures/sleeper/`);

  const state = asRecord(await capture('/state/nfl', 'state.json'));
  await capture(`/league/${leagueId}`, 'league.json');
  await capture(`/league/${leagueId}/users`, 'users.json');
  const rosters = await capture(`/league/${leagueId}/rosters`, 'rosters.json');
  await capture(`/league/${leagueId}/winners_bracket`, 'winners_bracket.json');
  await capture(`/league/${leagueId}/losers_bracket`, 'losers_bracket.json');

  const playerIds = new Set<string>();
  collectPlayerIds(rosters, playerIds);

  const drafts = await capture(`/league/${leagueId}/drafts`, 'drafts.json');
  for (const draft of asArray(drafts)) {
    const draftId = asRecord(draft)['draft_id'];
    if (typeof draftId !== 'string') continue;
    await capture(`/draft/${draftId}`, `draft-${draftId}.json`);
    collectPlayerIds(
      await capture(`/draft/${draftId}/picks`, `draft-${draftId}-picks.json`),
      playerIds,
    );
  }

  for (const week of MATCHUP_WEEKS) {
    const name = `matchups-w${String(week).padStart(2, '0')}.json`;
    collectPlayerIds(await capture(`/league/${leagueId}/matchups/${week}`, name), playerIds);
  }

  for (const week of TRANSACTION_WEEKS) {
    const name = `transactions-w${String(week).padStart(2, '0')}.json`;
    collectPlayerIds(await capture(`/league/${leagueId}/transactions/${week}`, name), playerIds);
  }

  console.log(`  …referenced ${playerIds.size} players; fetching the dictionary (~20 MB)`);
  const dictionary = asRecord((await get('/players/nfl')).value);

  const players: Record<string, unknown> = {};
  const missing: string[] = [];
  for (const id of [...playerIds].sort()) {
    const entry = dictionary[id];
    if (entry === undefined) missing.push(id);
    else players[id] = entry;
  }
  await saveOwn('players.json', players);

  await saveOwn('capture-meta.json', {
    capturedAt: new Date().toISOString(),
    capturedBy: 'scripts/capture-fixtures.ts',
    leagueId,
    sleeperState: {
      season: state['season'],
      week: state['week'],
      season_type: state['season_type'],
    },
    weeks: { matchups: [...MATCHUP_WEEKS], transactions: [...TRANSACTION_WEEKS] },
    players: {
      referenced: playerIds.size,
      saved: Object.keys(players).length,
      // Blank, never zero: an ID Sleeper no longer knows is recorded, not dropped silently.
      missingFromDictionary: missing,
    },
    httpCalls,
    files: [...written].sort(),
  });

  console.log(`Done: ${written.length} files, ${httpCalls} HTTP calls.`);
  if (missing.length > 0) {
    console.log(`Note: ${missing.length} referenced player IDs are absent from /players/nfl.`);
  }
}

await main();
