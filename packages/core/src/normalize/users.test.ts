import { describe, expect, it } from 'vitest';
import { buildIdentityIndex, buildManagerRows, resolveIdentity } from './users';
import * as fixtures from '../test-fixtures';
import golden from '../../../../fixtures/golden/2026-through-week-04.json';

describe('buildManagerRows', () => {
  const syncedAt = new Date('2026-10-10T17:22:58.037Z');
  const rows = buildManagerRows({ users: fixtures.users, syncedAt });

  it('returns one row per league member, keyed on the Sleeper user id', () => {
    expect(rows).toHaveLength(14);
    for (const row of rows) {
      expect(row.$id).toBe(row.user_id);
    }
  });

  it('carries the display name Sleeper reports', () => {
    const konman = rows.find((row) => row.user_id === '1391943955381235712');
    expect(konman?.display_name).toBe('prettynpink1006');
  });

  it('keeps the avatar hash, not a URL', () => {
    const withAvatar = rows.find((row) => row.user_id === '1034729371141320704');
    expect(withAvatar?.avatar).toBe('15d7cf259bc30eab8f6120f45f652fb6');
  });

  it('leaves an absent username or avatar null', () => {
    const rowsMinimal = buildManagerRows({
      users: [{ user_id: 'u1', display_name: 'Someone' }],
      syncedAt,
    });

    expect(rowsMinimal[0]?.username).toBeNull();
    expect(rowsMinimal[0]?.avatar).toBeNull();
  });

  // display_name is a required column, so it needs a defined fallback rather
  // than an empty cell that renders as a blank row.
  it('falls back to the username, then to the user id', () => {
    const rowsFallback = buildManagerRows({
      users: [{ user_id: 'u1', username: 'only_username' }, { user_id: 'u2' }],
      syncedAt,
    });

    expect(rowsFallback[0]?.display_name).toBe('only_username');
    expect(rowsFallback[1]?.display_name).toBe('User u2');
  });

  it('stamps synced_at as ISO 8601, because display names change', () => {
    expect(rows[0]?.synced_at).toBe('2026-10-10T17:22:58.037Z');
  });
});

describe('resolveIdentity', () => {
  const index = buildIdentityIndex({ users: fixtures.users, rosters: fixtures.rosters });

  it('maps every roster to a manager and a team name', () => {
    expect(index.size).toBe(14);
  });

  // The golden file names the manager and team for all 14 rosters, so this is
  // the whole mapping checked against an independent source.
  it('reproduces every manager and team name in the golden file', () => {
    for (const team of golden.teams) {
      expect(index.get(team.rosterId)).toMatchObject({
        managerName: team.manager,
        teamName: team.team,
      });
    }
  });

  it('falls back to the manager name when a team was never named', () => {
    const identity = resolveIdentity(
      { roster_id: 9, owner_id: 'u1' },
      new Map([['u1', { user_id: 'u1', display_name: 'bigKdawgie' }]]),
    );

    expect(identity).toEqual({
      ownerId: 'u1',
      managerName: 'bigKdawgie',
      teamName: 'bigKdawgie',
    });
  });

  it('prefers the team name from user metadata', () => {
    const identity = resolveIdentity(
      { roster_id: 4, owner_id: 'u1' },
      new Map([
        [
          'u1',
          { user_id: 'u1', display_name: 'Konman0725', metadata: { team_name: 'Happy Hamsters' } },
        ],
      ]),
    );

    expect(identity.teamName).toBe('Happy Hamsters');
  });

  it('labels an unowned roster rather than leaving it blank', () => {
    const identity = resolveIdentity({ roster_id: 7, owner_id: null }, new Map());

    expect(identity.ownerId).toBeNull();
    expect(identity.managerName).toBe('Unowned roster 7');
    expect(identity.teamName).toBe('Unowned roster 7');
  });

  it('labels a roster whose owner is missing from the users payload', () => {
    const identity = resolveIdentity({ roster_id: 2, owner_id: 'ghost' }, new Map());

    expect(identity.ownerId).toBe('ghost');
    expect(identity.managerName).toBe('User ghost');
  });
});
