import { describe, expect, it } from 'vitest';
import { buildDraftPickRows, buildDraftRow } from './drafts';
import * as fixtures from '../test-fixtures';

const LEAGUE = fixtures.FIXTURE_LEAGUE_ID;

describe('buildDraftRow', () => {
  const syncedAt = new Date('2026-10-10T17:22:58.037Z');
  const row = buildDraftRow({ draft: fixtures.draft, leagueId: LEAGUE, syncedAt });

  it('keys the row on the draft id', () => {
    expect(row.$id).toBe(fixtures.FIXTURE_DRAFT_ID);
    expect(row.draft_id).toBe(fixtures.FIXTURE_DRAFT_ID);
    expect(row.league_id).toBe(LEAGUE);
  });

  it('carries the format, status and season', () => {
    expect(row).toMatchObject({ season: '2026', type: 'snake', status: 'complete', rounds: 15 });
  });

  it('records the start time as ISO 8601 and stamps the sync', () => {
    expect(row.start_time).toBe(new Date(1788647826809).toISOString());
    expect(row.synced_at).toBe('2026-10-10T17:22:58.037Z');
  });

  it('leaves an unscheduled start time and unknown round count null', () => {
    const minimal = buildDraftRow({
      draft: { draft_id: 'd1', season: '2026', status: 'pre_draft', type: 'snake' },
      leagueId: LEAGUE,
      syncedAt,
    });

    expect(minimal.start_time).toBeNull();
    expect(minimal.rounds).toBeNull();
  });

  it('prefers the draft payload league id when it is present', () => {
    expect(
      buildDraftRow({ draft: fixtures.drafts[0]!, leagueId: 'fallback', syncedAt }).league_id,
    ).toBe(LEAGUE);
  });
});

describe('buildDraftPickRows', () => {
  const rows = buildDraftPickRows({
    leagueId: LEAGUE,
    draftId: fixtures.FIXTURE_DRAFT_ID,
    picks: fixtures.draftPicks,
  });

  it('returns one row per pick: 15 rounds of 14 teams', () => {
    expect(rows).toHaveLength(210);
    expect(new Set(rows.map((row) => row.$id)).size).toBe(210);
  });

  it('keys each pick on the draft and a four-digit pick number, so rows sort in pick order', () => {
    expect(rows[0]?.$id).toBe(`${fixtures.FIXTURE_DRAFT_ID}_0001`);
    expect(rows.at(-1)?.$id).toBe(`${fixtures.FIXTURE_DRAFT_ID}_0210`);

    const sorted = [...rows].sort((a, b) => a.$id.localeCompare(b.$id));
    expect(sorted.map((row) => row.pick_no)).toEqual(rows.map((row) => row.pick_no));
  });

  it('carries the first pick as Sleeper reported it', () => {
    expect(rows[0]).toMatchObject({
      league_id: LEAGUE,
      draft_id: fixtures.FIXTURE_DRAFT_ID,
      round: 1,
      pick_no: 1,
      draft_slot: 1,
      roster_id: 8,
      picked_by: '1391943955381235712',
      player_id: '9221',
    });
  });

  it('carries the last pick', () => {
    expect(rows.at(-1)).toMatchObject({
      round: 15,
      pick_no: 210,
      roster_id: 12,
      player_id: '11618',
    });
  });

  it('covers all 14 rosters across all 15 rounds', () => {
    expect(new Set(rows.map((row) => row.roster_id)).size).toBe(14);
    expect(new Set(rows.map((row) => row.round)).size).toBe(15);
  });

  it('drops the player metadata Sleeper duplicates onto each pick', () => {
    expect(rows[0]).not.toHaveProperty('metadata');
    expect(rows[0]).not.toHaveProperty('player_name');
  });

  // player_id is required: a slot nobody picked is not a pick, and writing it
  // with a blank player would put a phantom row in the draft board.
  it('skips a slot that was never filled', () => {
    const rowsOut = buildDraftPickRows({
      leagueId: LEAGUE,
      draftId: 'd1',
      picks: [
        { draft_id: 'd1', round: 1, pick_no: 1, player_id: 'p1', roster_id: 1 },
        { draft_id: 'd1', round: 1, pick_no: 2, player_id: null, roster_id: 2 },
      ],
    });

    expect(rowsOut.map((row) => row.pick_no)).toEqual([1]);
  });

  it('returns nothing for a draft with no picks yet', () => {
    expect(buildDraftPickRows({ leagueId: LEAGUE, draftId: 'd1', picks: [] })).toEqual([]);
  });
});
