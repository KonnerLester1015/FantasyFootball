import { recordEventId } from '../normalize/ids';
import type { HistoryWeek } from './weeks';

/**
 * Record-event replay — docs/REBUILD_PLAN.md §2f.
 *
 * The record book is rebuilt by replaying saved results in order, every
 * time, so a corrected score or a removed duplicate changes the book rather
 * than leaving an obsolete claim behind. Rules carried over from
 * reference/legacy/Redraft.gs:805-850 (algorithm version 3):
 *
 *   - only a **strict improvement** breaks a record, and only a break names a
 *     predecessor; the outgoing holders join the record's chain
 *   - a **tie** never breaks a record: it adds the co-holder, so the next real
 *     break names everyone who held that value
 *   - a **zero count never qualifies**: nobody holds "most weeks above 200"
 *     at 0, and so nobody can be listed as having lost it
 *   - running totals (crowns, 150/200 weeks, last places) are re-ranked after each week across **every** manager seen so far, not
 *     row by row, so a mid-week partial count never sets a record
 *   - weekly crowns and last places come from the scores, never from a stored
 *     flag, and only in a week where every participant has a score
 *
 * **Scope is the caller's**: pass one season's finalized regular-season weeks.
 * Every record is a within-season record; nothing here spans seasons.
 */

export const RECORD_CODES = [
  'hi_week',
  'lo_week',
  'crowns',
  'over_150',
  'over_200',
  'last_week',
  'narrow_win',
] as const;

/** `record_events.record_code`. */
export type RecordCode = (typeof RECORD_CODES)[number];

const LABELS: Record<RecordCode, string> = {
  hi_week: 'Highest single-week score',
  lo_week: 'Lowest single-week score',
  crowns: 'Most weekly scoring titles',
  over_150: 'Most weeks above 150',
  over_200: 'Most weeks above 200',
  last_week: 'Most weekly last-place scores',
  narrow_win: 'Narrowest victory',
};

const LOWER_IS_BETTER: ReadonlySet<RecordCode> = new Set<RecordCode>(['lo_week', 'narrow_win']);

/** Counts: a zero is "no result", never a record. */
const COUNTS: ReadonlySet<RecordCode> = new Set<RecordCode>([
  'crowns',
  'over_150',
  'over_200',
  'last_week',
]);

/** Running totals, re-ranked as a whole after each step. */
const RUNNING: ReadonlySet<RecordCode> = new Set<RecordCode>([
  'crowns',
  'over_150',
  'over_200',
  'last_week',
]);

/** Who holds a record value, and where it was set. */
export interface RecordBookHolder {
  identity: string;
  team_name: string;
  season: string;
  /** The score's week for a single-week record; the latest counted week for a running total. */
  week: number;
  /** The beaten team, for the narrowest victory; otherwise null. */
  opponent_team_name: string | null;
}

/** One link of a record's chain: a value that stood until it was beaten. */
export interface PreviousRecord {
  value: number;
  holders: RecordBookHolder[];
  broken_in_season: string;
  broken_in_week: number;
}

/** One record as the book shows it now. */
export interface RecordBookEntry {
  record_code: RecordCode;
  record_label: string;
  /** Null when nothing qualifies yet. */
  value: number | null;
  holders: RecordBookHolder[];
  /** Every value this record has replaced, oldest first. */
  previous: PreviousRecord[];
}

/** A row of the `record_events` table. */
export interface RecordEventRow {
  $id: string;
  league_id: string;
  season: string;
  record_code: RecordCode;
  record_label: string;
  week: number;
  value: number;
  holder_ids: string[];
  holder_names: string[];
  /** Filled only when this event broke the record. */
  predecessor_ids: string[];
  predecessor_names: string[];
  predecessor_value: number | null;
  observed_at: string;
  source: string;
}

export interface ReplayInput {
  weeks: readonly HistoryWeek[];
  observedAt: Date;
}

export interface RecordReplay {
  /** Every set, tie and break, in the order they happened. */
  events: RecordEventRow[];
  /** Every record, in RECORD_CODES order. */
  book: RecordBookEntry[];
}

/** A result competing for a record at one step. */
interface Candidate {
  code: RecordCode;
  league_id: string;
  season: string;
  /** The week replayed. */
  step: number;
  value: number;
  holder: RecordBookHolder;
}

interface State {
  value: number;
  holders: RecordBookHolder[];
  previous: PreviousRecord[];
}

const holderKey = (holder: RecordBookHolder) =>
  `${holder.identity}|${holder.season}|${holder.week}`;

function sortHolders(holders: readonly RecordBookHolder[]): RecordBookHolder[] {
  return holders
    .slice()
    .sort(
      (a, b) =>
        a.team_name.localeCompare(b.team_name) ||
        a.identity.localeCompare(b.identity) ||
        a.week - b.week,
    );
}

function holderName(code: RecordCode, holder: RecordBookHolder): string {
  return code === 'narrow_win' && holder.opponent_team_name !== null
    ? `${holder.team_name} beat ${holder.opponent_team_name}`
    : holder.team_name;
}

/** First row per key: a re-imported row is the same fact, not a second one. */
function distinct<T>(rows: readonly T[], key: (row: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const row of rows) if (!seen.has(key(row))) seen.set(key(row), row);
  return [...seen.values()];
}

function candidates({ weeks }: ReplayInput): Candidate[] {
  const out: Candidate[] = [];
  const add = (candidate: Candidate) => {
    if (!Number.isFinite(candidate.value)) return;
    if (COUNTS.has(candidate.code) && candidate.value <= 0) return;
    out.push(candidate);
  };

  const games = distinct(
    weeks,
    (row) => `${row.league_id}|${row.season}|${row.week}|${row.identity}`,
  );

  // Single-week records.
  for (const row of games) {
    const holder: RecordBookHolder = {
      identity: row.identity,
      team_name: row.team_name,
      season: row.season,
      week: row.week,
      opponent_team_name: null,
    };
    const at = { league_id: row.league_id, season: row.season, step: row.week };
    add({ ...at, code: 'hi_week', value: row.points, holder });
    add({ ...at, code: 'lo_week', value: row.points, holder });
    if (row.result === 'W' && row.margin !== null && row.margin > 0) {
      add({
        ...at,
        code: 'narrow_win',
        value: row.margin,
        holder: { ...holder, opponent_team_name: row.opponent_team_name },
      });
    }
  }

  // Running weekly totals, re-ranked after each week.
  const participants = new Set(games.map((row) => row.identity));
  const steps = new Map<number, HistoryWeek[]>();
  for (const row of games) steps.set(row.week, [...(steps.get(row.week) ?? []), row]);
  const totals = new Map<
    string,
    {
      crowns: number;
      last: number;
      over150: number;
      over200: number;
      holder: RecordBookHolder;
    }
  >();
  const ordered = [...steps.entries()].sort(([a], [b]) => a - b).map(([, step]) => step);
  for (const step of ordered) {
    const first = step[0] as HistoryWeek;
    for (const row of step) {
      const full = step.length > 1 && step.length === participants.size;
      const scores = step.map((peer) => peer.points);
      const total = totals.get(row.identity) ?? {
        crowns: 0,
        last: 0,
        over150: 0,
        over200: 0,
        holder: {
          identity: row.identity,
          team_name: row.team_name,
          season: row.season,
          week: row.week,
          opponent_team_name: null,
        },
      };
      if (full && row.points === Math.max(...scores)) total.crowns += 1;
      if (full && row.points === Math.min(...scores)) total.last += 1;
      if (row.points > 150) total.over150 += 1;
      if (row.points > 200) total.over200 += 1;
      total.holder = {
        identity: row.identity,
        team_name: row.team_name,
        season: row.season,
        week: row.week,
        opponent_team_name: null,
      };
      totals.set(row.identity, total);
    }
    for (const total of totals.values()) {
      const at = {
        league_id: first.league_id,
        season: first.season,
        step: first.week,
        holder: total.holder,
      };
      add({ ...at, code: 'crowns', value: total.crowns });
      add({ ...at, code: 'over_150', value: total.over150 });
      add({ ...at, code: 'over_200', value: total.over200 });
      add({ ...at, code: 'last_week', value: total.last });
    }
  }

  return out;
}

export function replayRecords(input: ReplayInput): RecordReplay {
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates(input)) {
    const key = `${candidate.code}|${candidate.season}|${candidate.step}`;
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  const ordered = [...groups.values()].sort((a, b) => {
    const x = a[0] as Candidate;
    const y = b[0] as Candidate;
    return x.step - y.step || RECORD_CODES.indexOf(x.code) - RECORD_CODES.indexOf(y.code);
  });

  const states = new Map<RecordCode, State>();
  const events: RecordEventRow[] = [];
  const observedAt = input.observedAt.toISOString();

  const emit = (group: Candidate, state: State, predecessor: State | null) => {
    events.push({
      $id: recordEventId(group.league_id, group.code, group.step),
      league_id: group.league_id,
      season: group.season,
      record_code: group.code,
      record_label: LABELS[group.code],
      week: group.step,
      value: state.value,
      holder_ids: state.holders.map((holder) => holder.identity),
      holder_names: state.holders.map((holder) => holderName(group.code, holder)),
      predecessor_ids: predecessor?.holders.map((holder) => holder.identity) ?? [],
      predecessor_names: predecessor?.holders.map((holder) => holderName(group.code, holder)) ?? [],
      predecessor_value: predecessor?.value ?? null,
      observed_at: observedAt,
      source: 'replay',
    });
  };

  for (const group of ordered) {
    const head = group[0] as Candidate;
    const lower = LOWER_IS_BETTER.has(head.code);
    const best = (lower ? Math.min : Math.max)(...group.map((candidate) => candidate.value));
    const tied = sortHolders(
      distinct(
        group.filter((candidate) => candidate.value === best).map((candidate) => candidate.holder),
        holderKey,
      ),
    );
    const current = states.get(head.code);

    if (current === undefined || (lower ? best < current.value : best > current.value)) {
      const next: State = {
        value: best,
        holders: tied,
        previous:
          current === undefined
            ? []
            : [
                ...current.previous,
                {
                  value: current.value,
                  holders: current.holders,
                  broken_in_season: head.season,
                  broken_in_week: head.step,
                },
              ],
      };
      states.set(head.code, next);
      emit(head, next, current ?? null);
    } else if (best === current.value) {
      // A tie. A running total is re-ranked as a whole, so the tied set *is*
      // the holder set; a single-week record accumulates every co-holder.
      const holders = RUNNING.has(head.code)
        ? tied
        : sortHolders(distinct([...current.holders, ...tied], holderKey));
      const before = new Set(current.holders.map((holder) => holder.identity));
      const grew =
        holders.length !== current.holders.length ||
        holders.some((holder) => !before.has(holder.identity));
      current.holders = holders;
      if (grew) emit(head, current, null);
    }
  }

  return {
    events,
    book: RECORD_CODES.map((code) => {
      const state = states.get(code);
      return {
        record_code: code,
        record_label: LABELS[code],
        value: state?.value ?? null,
        holders: state?.holders ?? [],
        previous: state?.previous ?? [],
      };
    }),
  };
}
