import { describe, expect, it } from 'vitest';
import { buildLeagueRow } from './league';
import * as fixtures from '../test-fixtures';

describe('buildLeagueRow', () => {
  const syncedAt = new Date('2026-10-10T17:22:58.037Z');
  const row = buildLeagueRow({ league: fixtures.league, syncedAt });

  it('keys the row on the league id', () => {
    expect(row.$id).toBe(fixtures.FIXTURE_LEAGUE_ID);
    expect(row.league_id).toBe(fixtures.FIXTURE_LEAGUE_ID);
  });

  it('carries the identity and status fields the dashboards read', () => {
    expect(row.name).toBe('Family Feud');
    expect(row.season).toBe('2026');
    expect(row.status).toBe('in_season');
    expect(row.draft_id).toBe(fixtures.FIXTURE_DRAFT_ID);
  });

  it('records no previous league, because 2026 is the first Sleeper season', () => {
    expect(row.previous_league_id).toBeNull();
  });

  it('derives the regular season length from the first postseason week', () => {
    expect(row.playoff_week_start).toBe(15);
    expect(row.regular_season_weeks).toBe(14);
  });

  it('carries the structural settings', () => {
    expect(row.num_teams).toBe(14);
    expect(row.playoff_teams).toBe(6);
    expect(row.last_scored_leg).toBe(4);
  });

  it('keeps the lineup slots in Sleeper order, bench included', () => {
    expect(row.roster_positions).toEqual([
      'QB',
      'RB',
      'RB',
      'WR',
      'WR',
      'TE',
      'FLEX',
      'FLEX',
      'K',
      'DEF',
      'BN',
      'BN',
      'BN',
      'BN',
      'BN',
    ]);
  });

  // The column is mediumtext: scoring settings are stored verbatim for audit,
  // not parsed into columns we would have to migrate every rule change.
  it('stores scoring settings as JSON text that round-trips', () => {
    expect(typeof row.scoring_settings).toBe('string');
    const parsed = JSON.parse(row.scoring_settings ?? '{}') as Record<string, number>;
    expect(parsed.rec).toBe(1);
    expect(parsed.pass_td).toBe(4);
  });

  it('stamps synced_at as ISO 8601', () => {
    expect(row.synced_at).toBe('2026-10-10T17:22:58.037Z');
  });

  it('leaves previous_league_id and draft_id null rather than empty strings', () => {
    const minimal = buildLeagueRow({
      league: {
        league_id: 'L1',
        name: 'Test',
        season: '2026',
        status: 'pre_draft',
        roster_positions: ['QB', 'BN'],
        settings: { playoff_week_start: 15, num_teams: 14, playoff_teams: 6 },
      },
      syncedAt,
    });

    expect(minimal.previous_league_id).toBeNull();
    expect(minimal.draft_id).toBeNull();
    expect(minimal.scoring_settings).toBeNull();
    expect(minimal.last_scored_leg).toBeNull();
  });

  // Defaulting this would silently redefine "regular season" — exactly the
  // class of bug the rebuild exists to remove. Fail loudly instead.
  it('refuses a league with no playoff_week_start', () => {
    expect(() =>
      buildLeagueRow({
        league: {
          league_id: 'L1',
          name: 'Test',
          season: '2026',
          status: 'in_season',
          roster_positions: ['QB'],
          settings: {},
        },
        syncedAt,
      }),
    ).toThrow(/playoff_week_start/);
  });

  it('refuses a league with no team count or playoff field count', () => {
    const base = {
      league_id: 'L1',
      name: 'Test',
      season: '2026',
      status: 'in_season',
      roster_positions: ['QB'],
    };

    expect(() =>
      buildLeagueRow({
        league: { ...base, settings: { playoff_week_start: 15, playoff_teams: 6 } },
        syncedAt,
      }),
    ).toThrow(/num_teams/);

    expect(() =>
      buildLeagueRow({
        league: { ...base, settings: { playoff_week_start: 15, num_teams: 14 } },
        syncedAt,
      }),
    ).toThrow(/playoff_teams/);
  });

  it('falls back to the roster count when num_teams is absent', () => {
    const row2 = buildLeagueRow({
      league: {
        league_id: 'L1',
        name: 'Test',
        season: '2026',
        status: 'in_season',
        roster_positions: ['QB'],
        settings: { playoff_week_start: 15, playoff_teams: 6 },
        total_rosters: 12,
      },
      syncedAt,
    });

    expect(row2.num_teams).toBe(12);
  });
});
