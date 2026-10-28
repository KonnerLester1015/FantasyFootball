import { describe, expect, it } from 'vitest';

import golden from '../../../../fixtures/golden/2026-through-week-04.json';
import { seasonAnalytics } from '../metrics/analytics';
import { buildMatchupRows, type MatchupResult } from '../normalize/matchups';
import { buildTeamRows } from '../normalize/rosters';
import { buildIdentityIndex } from '../normalize/users';
import * as fixtures from '../test-fixtures';
import {
  RECORD_CODES,
  replayRecords,
  type RecordBookEntry,
  type RecordCode,
  type ReplayInput,
} from './records';
import { historySeasons, historyWeeks, type HistorySeason, type HistoryWeek } from './seasons';

/**
 * Record-event replay — docs/REBUILD_PLAN.md §2h.
 *
 * The rules under test: a record is replayed from saved results in order;
 * only a strict improvement breaks it and names its predecessors; a tie adds
 * co-holders without breaking it; a zero count never qualifies; every record
 * keeps its full chain of previous holders.
 *
 *  1. The legacy suite's record fixture, ported assertion for assertion
 *     (reference/legacy/redraft_tests.js:91-110): false zero holders, weekly
 *     titles derived from scores (never from a stale flag), genuine tied
 *     predecessors, duplicate rows and a corrected score.
 *  2. The real 2026 fixtures against the sheet's LEAGUE RECORD BOOK, chains
 *     included (fixtures/golden recordBook).
 */

const OBSERVED = new Date('2026-10-09T10:14:12.389Z');

function week(
  overrides: Partial<HistoryWeek> & { week: number; identity: string; points: number },
): HistoryWeek {
  return {
    league_id: 'fix',
    season: '2026',
    roster_id: Number(overrides.identity.replace(/\D/g, '')) || 1,
    team_name: overrides.identity,
    result: 'W' as MatchupResult,
    margin: null,
    opponent_team_name: null,
    ...overrides,
  };
}

function input(overrides: Partial<ReplayInput>): ReplayInput {
  return { weeks: [], seasons: [], observedAt: OBSERVED, ...overrides };
}

function entry(book: readonly RecordBookEntry[], code: RecordCode): RecordBookEntry {
  const found = book.find((row) => row.record_code === code);
  if (found === undefined) throw new Error(`no record book entry ${code}`);
  return found;
}

const names = (holders: readonly { team_name: string }[]) =>
  holders.map((holder) => holder.team_name);

// ---------------------------------------------------------------------------
// The legacy record fixture
// ---------------------------------------------------------------------------

/**
 * reference/legacy/redraft_tests.js:93-95. Three teams, four weeks; the legacy
 * fixture also carried a deliberately wrong `weekly_top` flag, which this
 * shape cannot even express — crowns are always derived from scores.
 */
function legacyWeeks(): HistoryWeek[] {
  const teams = ['Pudgy', 'Coalition', 'tdunwoody17'];
  const scores = [
    [210, 80, 90],
    [160, 180, 100],
    [220, 230, 240],
    [140, 180, 100],
  ];
  return scores.flatMap((points, index) =>
    points.map((value, team) =>
      week({
        week: index + 1,
        identity: `id-${team + 1}`,
        roster_id: team + 1,
        team_name: teams[team] as string,
        points: value,
      }),
    ),
  );
}

describe('the legacy record fixture', () => {
  const { book } = replayRecords(input({ weeks: legacyWeeks() }));

  it('gives weeks above 200 to the team with two, and no zero-count predecessor', () => {
    const over200 = entry(book, 'over_200');
    expect(over200.value).toBe(2);
    expect(names(over200.holders)).toEqual(['Pudgy']);
    // The only predecessor is Pudgy's own first 200-point week; Coalition
    // never held the record, and nobody held it at 0.
    expect(over200.previous.map((link) => [names(link.holders), link.value])).toEqual([
      [['Pudgy'], 1],
    ]);
  });

  it('names every genuine co-holder of a tied count when it is finally broken', () => {
    const crowns = entry(book, 'crowns');
    expect(crowns.value).toBe(2);
    expect(names(crowns.holders)).toEqual(['Coalition']);
    // Weeks 1-3 each had a different winner, so all three held "1" together
    // when Coalition's second crown in week 4 broke it.
    expect(crowns.previous).toHaveLength(1);
    expect(crowns.previous[0]).toMatchObject({
      value: 1,
      broken_in_season: '2026',
      broken_in_week: 4,
    });
    expect(names(crowns.previous[0]?.holders ?? [])).toEqual(['Coalition', 'Pudgy', 'tdunwoody17']);
  });

  it('reports no championship record rather than a zero', () => {
    expect(entry(book, 'titles')).toMatchObject({ value: null, holders: [], previous: [] });
  });

  it('is unchanged by a duplicated week row', () => {
    const again = replayRecords(
      input({ weeks: [...legacyWeeks(), legacyWeeks()[0] as HistoryWeek] }),
    );
    expect(JSON.stringify(again)).toBe(
      JSON.stringify(replayRecords(input({ weeks: legacyWeeks() }))),
    );
  });

  it('drops a record a corrected score no longer supports', () => {
    const corrected = legacyWeeks().map((row) => ({ ...row, points: Math.min(row.points, 199) }));
    const replay = replayRecords(input({ weeks: corrected }));
    expect(entry(replay.book, 'over_200')).toMatchObject({ value: null, previous: [] });
    expect(replay.events.some((event) => event.record_code === 'over_200')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule tests
// ---------------------------------------------------------------------------

describe('replay rules', () => {
  it('does not break a record on a tie, but adds the co-holder', () => {
    const { book, events } = replayRecords(
      input({
        weeks: [
          week({ week: 1, identity: 'id-1', points: 150 }),
          week({ week: 1, identity: 'id-2', points: 100 }),
          week({ week: 2, identity: 'id-1', points: 120 }),
          week({ week: 2, identity: 'id-2', points: 150 }),
        ],
      }),
    );
    const high = entry(book, 'hi_week');
    expect(high.value).toBe(150);
    expect(high.holders.map((holder) => [holder.identity, holder.week])).toEqual([
      ['id-1', 1],
      ['id-2', 2],
    ]);
    expect(high.previous).toEqual([]);
    // Two events: set in week 1, tied in week 2 — the tie has no predecessor.
    const highEvents = events.filter((event) => event.record_code === 'hi_week');
    expect(highEvents.map((event) => [event.week, event.predecessor_value])).toEqual([
      [1, null],
      [2, null],
    ]);
    expect(highEvents[1]?.holder_ids).toEqual(['id-1', 'id-2']);
  });

  it('breaks only on a strict improvement and keeps the whole chain, oldest first', () => {
    const { book } = replayRecords(
      input({
        weeks: [
          week({ week: 1, identity: 'id-1', points: 100 }),
          week({ week: 2, identity: 'id-2', points: 110 }),
          week({ week: 3, identity: 'id-1', points: 109.99 }),
          week({ week: 4, identity: 'id-3', points: 120 }),
        ],
      }),
    );
    const high = entry(book, 'hi_week');
    expect(high.value).toBe(120);
    expect(
      high.previous.map((link) => [link.value, link.holders[0]?.identity, link.broken_in_week]),
    ).toEqual([
      [100, 'id-1', 2],
      [110, 'id-2', 4],
    ]);
  });

  it('runs lowest-is-best records the other way', () => {
    const { book } = replayRecords(
      input({
        weeks: [
          week({ week: 1, identity: 'id-1', points: 80 }),
          week({ week: 2, identity: 'id-1', points: 90 }),
          week({ week: 3, identity: 'id-2', points: 70 }),
        ],
      }),
    );
    expect(entry(book, 'lo_week')).toMatchObject({ value: 70 });
    expect(entry(book, 'lo_week').previous.map((link) => link.value)).toEqual([80]);
  });

  it('counts a narrowest victory only for a real win, and names the opponent', () => {
    const { book, events } = replayRecords(
      input({
        weeks: [
          week({
            week: 1,
            identity: 'id-1',
            points: 100,
            result: 'W',
            margin: 3,
            opponent_team_name: 'Rival',
          }),
          week({
            week: 1,
            identity: 'id-2',
            points: 90,
            result: 'T',
            margin: 0,
            opponent_team_name: 'Other',
          }),
          week({
            week: 1,
            identity: 'id-3',
            points: 97,
            result: 'L',
            margin: -3,
            opponent_team_name: 'id-1',
          }),
        ],
      }),
    );
    expect(entry(book, 'narrow_win').value).toBe(3);
    expect(entry(book, 'narrow_win').holders).toEqual([
      expect.objectContaining({ identity: 'id-1', opponent_team_name: 'Rival' }),
    ]);
    expect(events.find((event) => event.record_code === 'narrow_win')?.holder_names).toEqual([
      'id-1 beat Rival',
    ]);
  });

  it('awards a weekly crown only when every participant scored that week', () => {
    const { book } = replayRecords(
      input({
        weeks: [
          week({ week: 1, identity: 'id-1', points: 150 }),
          week({ week: 1, identity: 'id-2', points: 100 }),
          // Week 2 is missing id-2's score, so nobody can be proven top.
          week({ week: 2, identity: 'id-1', points: 160 }),
        ],
      }),
    );
    expect(entry(book, 'crowns')).toMatchObject({ value: 1 });
    expect(entry(book, 'last_week')).toMatchObject({ value: 1 });
  });

  it('counts strictly above 150 and 200', () => {
    const { book } = replayRecords(
      input({
        weeks: [
          week({ week: 1, identity: 'id-1', points: 150 }),
          week({ week: 1, identity: 'id-2', points: 200 }),
        ],
      }),
    );
    expect(entry(book, 'over_150')).toMatchObject({
      value: 1,
      holders: [expect.objectContaining({ identity: 'id-2' })],
    });
    expect(entry(book, 'over_200').value).toBeNull();
  });

  it('takes completed-season and title records from completed seasons only', () => {
    const base: Omit<
      HistorySeason,
      | 'league_id'
      | 'season'
      | 'roster_id'
      | 'identity'
      | 'points_for'
      | 'champion'
      | 'season_complete'
    > = {
      manager_name: 'm',
      team_name: 't',
      wins: 0,
      losses: 0,
      ties: 0,
      points_against: 0,
      all_play_comparisons: 0,
      all_play_win_equivalents: 0,
      schedule_luck: null,
      points_in_losses: 0,
      playoff_appearance: null,
      championship_appearance: null,
    };
    const { book } = replayRecords(
      input({
        seasons: [
          {
            ...base,
            league_id: 'a',
            season: '2025',
            roster_id: 1,
            identity: 'id-1',
            team_name: 'One',
            points_for: 1500,
            champion: true,
            season_complete: true,
          },
          {
            ...base,
            league_id: 'a',
            season: '2025',
            roster_id: 2,
            identity: 'id-2',
            team_name: 'Two',
            points_for: 1300,
            champion: false,
            season_complete: true,
          },
          {
            ...base,
            league_id: 'b',
            season: '2026',
            roster_id: 1,
            identity: 'id-1',
            team_name: 'One',
            points_for: 400,
            champion: null,
            season_complete: false,
          },
        ],
      }),
    );
    expect(entry(book, 'hi_season')).toMatchObject({
      value: 1500,
      holders: [expect.objectContaining({ identity: 'id-1', season: '2025', week: null })],
    });
    // The unfinished 400 is not a "lowest completed season".
    expect(entry(book, 'lo_season')).toMatchObject({ value: 1300 });
    expect(entry(book, 'titles')).toMatchObject({
      value: 1,
      holders: [expect.objectContaining({ identity: 'id-1' })],
    });
  });

  it('writes deterministic event rows the record_events table accepts', () => {
    const { events } = replayRecords(input({ weeks: legacyWeeks() }));
    expect(new Set(events.map((event) => event.$id)).size).toBe(events.length);
    for (const event of events) {
      expect(event.$id).toBe(
        `${event.league_id}_${event.record_code}_${String(event.week).padStart(2, '0')}`,
      );
      expect(event.$id.length).toBeLessThanOrEqual(36);
      expect(event.observed_at).toBe(OBSERVED.toISOString());
      expect(event.holder_ids).toHaveLength(event.holder_names.length);
    }
  });

  it('lists all twelve records, unheld ones included', () => {
    expect(replayRecords(input({})).book.map((row) => row.record_code)).toEqual([...RECORD_CODES]);
  });
});

// ---------------------------------------------------------------------------
// Real fixtures against fixtures/golden
// ---------------------------------------------------------------------------

describe('2026 record book through week 4', () => {
  const LEAGUE = fixtures.FIXTURE_LEAGUE_ID;
  const identities = buildIdentityIndex({ users: fixtures.users, rosters: fixtures.rosters });
  const matchups = fixtures.FINALIZED_WEEKS.flatMap((weekNo) =>
    buildMatchupRows({
      leagueId: LEAGUE,
      week: weekNo,
      matchups: fixtures.matchups(weekNo),
      finalized: true,
    }),
  );
  const teams = buildTeamRows({
    leagueId: LEAGUE,
    season: fixtures.FIXTURE_SEASON,
    rosters: fixtures.rosters,
    identities,
    syncedAt: OBSERVED,
  });
  const { book } = replayRecords(
    input({
      weeks: historyWeeks({ season: fixtures.FIXTURE_SEASON, matchups, teams }),
      seasons: historySeasons({
        teams,
        analytics: seasonAnalytics(matchups),
        brackets: [],
        seasonComplete: false,
      }),
    }),
  );

  type GoldenHolder = { team: string; week: number; opponent?: string };
  type GoldenRecord = {
    value: number;
    holders: GoldenHolder[];
    previous: { value: number; holders: GoldenHolder[]; brokenInWeek: number }[];
  } | null;

  const shape = (
    holders: readonly {
      team_name: string;
      week: number | null;
      opponent_team_name?: string | null;
    }[],
  ) =>
    holders
      .map((holder) => ({
        team: holder.team_name,
        week: holder.week,
        ...(holder.opponent_team_name ? { opponent: holder.opponent_team_name } : {}),
      }))
      .sort((a, b) => a.team.localeCompare(b.team));
  const sorted = (holders: GoldenHolder[]) =>
    holders.slice().sort((a, b) => a.team.localeCompare(b.team));

  const codes = [
    'hi_week',
    'lo_week',
    'crowns',
    'over_150',
    'over_200',
    'last_week',
    'career_pf',
    'titles',
    'narrow_win',
  ] as const;

  for (const code of codes) {
    it(`matches the sheet's ${code} record and its chain of previous holders`, () => {
      const expected = (golden.recordBook as unknown as Record<string, GoldenRecord>)[code] ?? null;
      const actual = entry(book, code);
      if (expected === null) {
        expect(actual).toMatchObject({ value: null, holders: [], previous: [] });
        return;
      }
      expect(actual.value).toBe(expected.value);
      expect(shape(actual.holders)).toEqual(sorted(expected.holders));
      expect(
        actual.previous.map((link) => ({
          value: link.value,
          holders: shape(link.holders),
          brokenInWeek: link.broken_in_week,
        })),
      ).toEqual(expected.previous.map((link) => ({ ...link, holders: sorted(link.holders) })));
    });
  }

  it('agrees with the golden current-holder block', () => {
    expect(entry(book, 'hi_week').value).toBe(golden.records.highestSingleWeekScore.points);
    expect(entry(book, 'lo_week').value).toBe(golden.records.lowestSingleWeekScore.points);
    expect(entry(book, 'narrow_win').value).toBe(golden.records.narrowestVictory.margin);
    expect(entry(book, 'over_150').value).toBe(golden.records.mostWeeksOver150.weeks);
    expect(entry(book, 'last_week').value).toBe(golden.records.mostLastPlaceWeeks.weeks);
  });
});
