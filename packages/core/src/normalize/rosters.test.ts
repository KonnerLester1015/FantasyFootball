import { describe, expect, it } from 'vitest';
import { buildTeamRows, decimalPoints } from './rosters';
import { buildIdentityIndex } from './users';
import * as fixtures from '../test-fixtures';
import golden from '../../../../fixtures/golden/2026-through-week-04.json';

const identities = buildIdentityIndex({ users: fixtures.users, rosters: fixtures.rosters });
const syncedAt = new Date('2026-10-10T17:22:58.037Z');

const rows = buildTeamRows({
  leagueId: fixtures.FIXTURE_LEAGUE_ID,
  season: fixtures.FIXTURE_SEASON,
  rosters: fixtures.rosters,
  identities,
  syncedAt,
});

function row(rosterId: number): (typeof rows)[number] {
  const found = rows.find((candidate) => candidate.roster_id === rosterId);
  if (found === undefined) throw new Error(`no team row for roster ${rosterId}`);
  return found;
}

// Sleeper splits a score into whole points and hundredths: fpts 548 plus
// fpts_decimal 64 is 548.64. Reading only fpts loses the decimals; reading
// fpts_decimal as a fraction loses the factor of 100.
describe('decimalPoints', () => {
  it('recombines whole points and hundredths', () => {
    expect(decimalPoints({ fpts: 548, fpts_decimal: 64 }, 'fpts')).toBe(548.64);
  });

  it('treats a missing decimal part as zero hundredths, not a missing score', () => {
    expect(decimalPoints({ fpts: 510 }, 'fpts')).toBe(510);
  });

  it('returns null when the whole-points field itself is absent', () => {
    expect(decimalPoints({}, 'ppts')).toBeNull();
    expect(decimalPoints(null, 'fpts')).toBeNull();
  });

  it('keeps a genuine zero distinct from a missing value', () => {
    expect(decimalPoints({ fpts: 0, fpts_decimal: 0 }, 'fpts')).toBe(0);
  });

  it('rounds to two decimals rather than leaving binary float noise', () => {
    expect(decimalPoints({ fpts: 1, fpts_decimal: 1 }, 'fpts')).toBe(1.01);
  });
});

describe('buildTeamRows', () => {
  it('returns one row per roster, keyed on league and roster', () => {
    expect(rows).toHaveLength(14);
    expect(row(1).$id).toBe(`${fixtures.FIXTURE_LEAGUE_ID}_01`);
    expect(row(14).$id).toBe(`${fixtures.FIXTURE_LEAGUE_ID}_14`);
  });

  it('carries the league and season on every row', () => {
    for (const teamRow of rows) {
      expect(teamRow.league_id).toBe(fixtures.FIXTURE_LEAGUE_ID);
      expect(teamRow.season).toBe('2026');
      expect(teamRow.synced_at).toBe('2026-10-10T17:22:58.037Z');
    }
  });

  it('resolves the manager and team name for every roster', () => {
    for (const team of golden.teams) {
      expect(row(team.rosterId)).toMatchObject({
        manager_name: team.manager,
        team_name: team.team,
      });
    }
  });

  // The golden records are text ("2-2-0"); the table stores three integers and
  // the site formats them, so nothing can turn into a date.
  it('matches the golden W-L-T for all 14 teams', () => {
    for (const team of golden.teams) {
      const teamRow = row(team.rosterId);
      expect(`${teamRow.wins}-${teamRow.losses}-${teamRow.ties}`).toBe(team.record);
      expect(teamRow.wins).toBe(team.wins);
      expect(teamRow.losses).toBe(team.losses);
      expect(teamRow.ties).toBe(team.ties);
    }
  });

  it('matches the golden PF and PA for all 14 teams, to 2 decimals', () => {
    for (const team of golden.teams) {
      expect(row(team.rosterId).points_for).toBeCloseTo(team.pf, 2);
      expect(row(team.rosterId).points_against).toBeCloseTo(team.pa, 2);
    }
  });

  it('matches the golden Sleeper Max PF for all 14 teams, to 2 decimals', () => {
    for (const team of golden.teams) {
      expect(row(team.rosterId).max_pf_sleeper).toBeCloseTo(team.maxPfSleeper, 2);
    }
  });

  it('keeps the roster snapshot arrays, with empty starting slots dropped', () => {
    // Roster 13 carries a literal '0' in its starters: an unfilled slot.
    expect(fixtures.rosters.find((r) => r.roster_id === 13)?.starters).toContain('0');
    expect(row(13).starters).not.toContain('0');
    expect(row(13).starters).toHaveLength(9);

    expect(row(1).players).toContain('DAL');
    expect(row(1).reserve).toEqual(['13281']);
    expect(row(1).taxi).toEqual([]);
  });

  it('leaves the metric columns for packages/core/metrics to fill', () => {
    for (const teamRow of rows) {
      expect(teamRow).not.toHaveProperty('rank');
      expect(teamRow).not.toHaveProperty('max_pf_calculated');
      expect(teamRow).not.toHaveProperty('total_pf_finalized_regular');
    }
  });

  it('treats an absent record as 0-0-0, since a roster always has a record', () => {
    const [bare] = buildTeamRows({
      leagueId: 'L1',
      season: '2026',
      rosters: [{ roster_id: 1, owner_id: 'u1', settings: { fpts: 0, fpts_against: 0 } }],
      identities: new Map([[1, { ownerId: 'u1', managerName: 'A', teamName: 'A' }]]),
      syncedAt,
    });

    expect(bare).toMatchObject({ wins: 0, losses: 0, ties: 0, points_for: 0, points_against: 0 });
  });

  it('leaves max_pf_sleeper null when Sleeper reports no ppts', () => {
    const [bare] = buildTeamRows({
      leagueId: 'L1',
      season: '2026',
      rosters: [{ roster_id: 1, owner_id: 'u1', settings: { fpts: 0, fpts_against: 0 } }],
      identities: new Map([[1, { ownerId: 'u1', managerName: 'A', teamName: 'A' }]]),
      syncedAt,
    });

    expect(bare?.max_pf_sleeper).toBeNull();
  });

  // points_for and points_against are required columns. Substituting 0 for a
  // missing score would publish a wrong number; refusing publishes none.
  it('refuses a roster with no scoring fields at all', () => {
    expect(() =>
      buildTeamRows({
        leagueId: 'L1',
        season: '2026',
        rosters: [{ roster_id: 1, owner_id: 'u1' }],
        identities: new Map([[1, { ownerId: 'u1', managerName: 'A', teamName: 'A' }]]),
        syncedAt,
      }),
    ).toThrow(/roster 1/);
  });
});
