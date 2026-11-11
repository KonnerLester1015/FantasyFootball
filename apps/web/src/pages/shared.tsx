// Lookups and selections over stored read models. Nothing here derives a
// metric: it finds rows, orders them, and picks the rows sharing a top value.

import type { AsOf, CurrentDashboard, CurrentTeam } from '@fantasy-football/core';
import { pct, positionLabel } from '../format';
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

/** "7-2-0 (77.78%)": the record and its win percentage in one cell. */
export const recordWithPct = (team: Pick<CurrentTeam, 'record' | 'win_pct'>): string =>
  `${team.record} (${pct(team.win_pct)})`;

/** Plain-language walk-through of how the playoff simulation works. */
export function OddsExplainer({ asOf }: { asOf: AsOf }) {
  const seats = asOf.playoff_teams;
  return (
    <details className="explainer">
      <summary>How are playoff odds calculated?</summary>
      <ol>
        <li>
          Start from today’s real standings: every team’s record, points for and points against.
        </li>
        <li>
          Play out every remaining regular-season game on the real schedule. Each team’s score in a simulated week is
          picked at random from real scores: 7 times in 10 from that team’s own finished weeks, otherwise from any
          team’s. A team that has been scoring 140 tends to keep scoring around 140.
        </li>
        {asOf.median_games && (
          <li>
            This league also plays the median: each simulated week, every team above the middle score gets an extra
            win and every team below it an extra loss.
          </li>
        )}
        <li>
          Rank the finished table the way Sleeper does: win percentage, then points for, then points against.
          {seats > 0 ? ` The top ${seats} are in.` : ''}
        </li>
        <li>
          Do that 5,000 times. Playoff odds are the share of those seasons a team got in: 4,000 of 5,000 shows as 80%.
        </li>
      </ol>
      <p>
        “If they finish…” uses the same 5,000 seasons, grouped by how many more games the team won. “Wins that clinch”
        and “losses that eliminate” are not simulated: they hold however every other game goes.
      </p>
    </details>
  );
}

/** Win / Loss / Tie in the same colors as streaks: blue, red, brown. */
export function ResultText({ result }: { result: 'W' | 'L' | 'T' | 'PENDING' | null | undefined }) {
  if (result === 'W') return <span className="result result-w">Win</span>;
  if (result === 'L') return <span className="result result-l">Loss</span>;
  if (result === 'T') return <span className="result result-t">Tie</span>;
  return <span className="result">Pending</span>;
}
