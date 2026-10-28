// Lookups and selections over stored read models. Nothing here derives a
// metric: it finds rows, orders them, and picks the rows sharing a top value.

import type { CurrentDashboard, CurrentTeam } from '@fantasy-football/core';
import { positionLabel } from '../format';
import { useLeagueHref } from '../league-context';
import { Chip } from '../ui';

export type TeamNames = (rosterId: number | null | undefined) => string;

export function teamNames(current: CurrentDashboard): TeamNames {
  const map = new Map(current.teams.map((t) => [t.roster_id, t.team_name]));
  return (id) => (id == null ? 'TBD' : (map.get(id) ?? `Roster ${id}`));
}

/** Every item tied for the top (or bottom) of a stored value; nulls never lead. */
export function leaders<T>(items: readonly T[], value: (item: T) => number | null, lowest = false): T[] {
  const present = items.filter((item) => value(item) !== null);
  if (present.length === 0) return [];
  const best = present.reduce((a, b) => ((lowest ? value(b)! < value(a)! : value(b)! > value(a)!) ? b : a));
  return present.filter((item) => value(item) === value(best));
}

/** Weeks with stored results, 1..finalized. */
export const finalizedWeeks = (through: number): number[] =>
  Array.from({ length: Math.max(0, through) }, (_, n) => n + 1);

export function PositionChip({ position }: { position: CurrentTeam['position_now'] }) {
  const tone = position === 'inside' ? 'in' : position === 'tied_at_cutoff' ? 'tie' : position === 'outside' ? 'out' : 'na';
  return <Chip tone={tone}>{positionLabel(position)}</Chip>;
}

export function TeamLink({ id, name }: { id: number; name: string }) {
  const href = useLeagueHref(`/team/${id}`);
  return (
    <a className="team-link" href={href}>
      {name}
    </a>
  );
}
