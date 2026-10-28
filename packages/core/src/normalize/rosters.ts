import { round2 } from '../numbers';
import type { SleeperRoster, SleeperRosterSettings } from '../sleeper/types';
import { NormalizeError } from './errors';
import { teamId } from './ids';
import type { Identity } from './users';

/** Sleeper uses '0' to mark an empty starting slot. */
const EMPTY_SLOT = '0';

/**
 * A row of the `teams` table — the part that comes from
 * the rosters payload.
 *
 * The derived columns are deliberately absent: `rank`, `max_pf_calculated`,
 * `max_pf_calc_status` and the `total_pf_finalized_*` pair are produced by
 * packages/core/metrics, which owns the standings comparator and the
 * optimal-lineup DP. Computing rank here too would be the second
 * implementation of one rule, which is the bug class this rebuild removes.
 */
export interface TeamRow {
  $id: string;
  league_id: string;
  season: string;
  roster_id: number;
  owner_id: string | null;
  manager_name: string;
  team_name: string;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  /** Sleeper's own "potential points". Null when Sleeper reports none. */
  max_pf_sleeper: number | null;
  players: string[];
  starters: string[];
  reserve: string[];
  taxi: string[];
  synced_at: string;
}

export interface BuildTeamRowsInput {
  leagueId: string;
  season: string;
  rosters: readonly SleeperRoster[];
  identities: ReadonlyMap<number, Identity>;
  syncedAt: Date;
}

/** The whole-points fields Sleeper pairs with a `_decimal` field. */
type PointsField = 'fpts' | 'fpts_against' | 'ppts';

/**
 * Recombine Sleeper's split score: `fpts` 548 plus `fpts_decimal` 64 is 548.64.
 *
 * Reading only the whole part loses the decimals; treating the decimal part as
 * a fraction loses the factor of 100. Returns null when the whole-points field
 * is absent — unobserved, not zero.
 */
export function decimalPoints(
  settings: SleeperRosterSettings | null | undefined,
  field: PointsField,
): number | null {
  const whole = settings?.[field];
  if (whole === undefined || whole === null) return null;
  return round2(whole + (settings?.[`${field}_decimal`] ?? 0) / 100);
}

function playerList(ids: string[] | null | undefined): string[] {
  return (ids ?? []).filter((id) => id !== EMPTY_SLOT && id !== '');
}

/**
 * One row per roster: the season's record, scoring totals and current roster
 * snapshot.
 *
 * `points_for` and `points_against` are required columns, and substituting 0
 * for a missing score would publish a wrong number on the standings. A roster
 * Sleeper reports no scoring for is refused instead.
 */
export function buildTeamRows({
  leagueId,
  season,
  rosters,
  identities,
  syncedAt,
}: BuildTeamRowsInput): TeamRow[] {
  const synced = syncedAt.toISOString();

  return rosters.map((roster) => {
    const settings = roster.settings ?? null;
    const identity = identities.get(roster.roster_id) ?? {
      ownerId: roster.owner_id ?? null,
      managerName: `Unowned roster ${roster.roster_id}`,
      teamName: `Unowned roster ${roster.roster_id}`,
    };

    const pointsFor = decimalPoints(settings, 'fpts');
    const pointsAgainst = decimalPoints(settings, 'fpts_against');
    if (pointsFor === null || pointsAgainst === null) {
      throw new NormalizeError(
        `roster ${roster.roster_id} in league ${leagueId} reports no fpts/fpts_against`,
      );
    }

    return {
      $id: teamId(leagueId, roster.roster_id),
      league_id: leagueId,
      season,
      roster_id: roster.roster_id,
      owner_id: identity.ownerId,
      manager_name: identity.managerName,
      team_name: identity.teamName,
      // A roster always has a record; 0-0-0 before week 1 is the real answer.
      wins: settings?.wins ?? 0,
      losses: settings?.losses ?? 0,
      ties: settings?.ties ?? 0,
      points_for: pointsFor,
      points_against: pointsAgainst,
      max_pf_sleeper: decimalPoints(settings, 'ppts'),
      players: playerList(roster.players),
      starters: playerList(roster.starters),
      reserve: playerList(roster.reserve),
      taxi: playerList(roster.taxi),
      synced_at: synced,
    };
  });
}
