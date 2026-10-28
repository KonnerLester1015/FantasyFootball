import type { SleeperRoster, SleeperUser } from '../sleeper/types';
import { assertRowId } from './ids';

/** A row of the `managers` table, keyed on Sleeper user ID. */
export interface ManagerRow {
  $id: string;
  user_id: string;
  display_name: string;
  username: string | null;
  /** Avatar hash for Sleeper's CDN, not a URL. */
  avatar: string | null;
  synced_at: string;
}

/** Who a roster belonged to in one season, as the dashboards display it. */
export interface Identity {
  ownerId: string | null;
  managerName: string;
  teamName: string;
}

export interface BuildManagerRowsInput {
  users: readonly SleeperUser[];
  syncedAt: Date;
}

export interface BuildIdentityIndexInput {
  users: readonly SleeperUser[];
  rosters: readonly SleeperRoster[];
}

/**
 * `display_name` is a required column, so a name is always produced. Sleeper
 * has shown accounts with one field or the other missing, and a blank row on
 * the standings is worse than a visibly technical label.
 */
function displayNameOf(user: SleeperUser): string {
  return user.display_name ?? user.username ?? `User ${user.user_id}`;
}

/**
 * One row per league member. Re-pulled every run because display names, team
 * names and avatars change mid-season (REBUILD_PLAN §3).
 *
 * Career history keys on this `user_id`, not on roster ID: a different account
 * taking a league slot starts new totals (REBUILD_PLAN §2h).
 */
export function buildManagerRows({ users, syncedAt }: BuildManagerRowsInput): ManagerRow[] {
  const synced = syncedAt.toISOString();

  return users.map((user) => ({
    $id: assertRowId(user.user_id),
    user_id: user.user_id,
    display_name: displayNameOf(user),
    username: user.username ?? null,
    avatar: user.avatar ?? null,
    synced_at: synced,
  }));
}

/**
 * The manager and team name to show for one roster.
 *
 * A team name only exists if the manager set one, so it falls back to the
 * manager's name — the same rule the Sheets version used, which is why the
 * golden file lists "bigKdawgie" as both manager and team.
 */
export function resolveIdentity(
  roster: Pick<SleeperRoster, 'roster_id' | 'owner_id'>,
  usersById: ReadonlyMap<string, SleeperUser>,
): Identity {
  const ownerId = roster.owner_id ?? null;
  const user = ownerId === null ? undefined : usersById.get(ownerId);

  const managerName =
    user === undefined
      ? ownerId === null
        ? `Unowned roster ${roster.roster_id}`
        : `User ${ownerId}`
      : displayNameOf(user);

  return {
    ownerId,
    managerName,
    teamName: user?.metadata?.team_name ?? managerName,
  };
}

/** Roster ID -> identity, for the season the users and rosters came from. */
export function buildIdentityIndex({
  users,
  rosters,
}: BuildIdentityIndexInput): Map<number, Identity> {
  const usersById = new Map(users.map((user) => [user.user_id, user]));
  return new Map(rosters.map((roster) => [roster.roster_id, resolveIdentity(roster, usersById)]));
}
