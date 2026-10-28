// "Week N leaders": the top rostered scorer at each position, as stored in the
// summary read model (packages/core metrics/leaders.ts). Nothing is ranked here.

import { useSyncExternalStore } from 'react';
import type { PositionLeaderCell, PositionLeadersWeek } from '@sunday-funnies/core';
import { BounceCards } from '../BounceCards';
import { pts } from '../format';
import { PositionArt } from '../PositionArt';
import { Bubble, Card } from '../ui';
import type { TeamNames } from './shared';

/** Six cards fanned at a 160 px spread need about 1000 px of row. */
const FAN_QUERY = '(min-width: 1060px)';
const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(FAN_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const fanFits = () => window.matchMedia(FAN_QUERY).matches;

const playerName = (cell: PositionLeaderCell): string => cell.leaders[0]?.name ?? 'Unnamed player';

function describe(cell: PositionLeaderCell, name: TeamNames): string {
  const [top, ...tied] = cell.leaders;
  if (!top) return `${cell.position}: no scored player this week`;
  const tie = tied.length > 0 ? `, tied with ${tied.map((l) => l.name ?? 'an unnamed player').join(' and ')}` : '';
  const bench = top.started ? '' : ', on the bench';
  return `${cell.position}: ${playerName(cell)}, ${name(top.roster_id)}, ${pts(top.points)} points${bench}${tie}`;
}

function LeaderCard({ cell, name }: { cell: PositionLeaderCell; name: TeamNames }) {
  const [top, ...tied] = cell.leaders;
  return (
    <>
      <div className={`leader-art art-${cell.position.toLowerCase()}`}>
        <PositionArt position={cell.position} />
        <span className="leader-badge">{cell.position}</span>
      </div>
      {top ? (
        <div className="leader-body">
          <p className="leader-points">
            {pts(top.points)} <small>pts</small>
          </p>
          <p className="leader-name">{playerName(cell)}</p>
          <p className="leader-team">{name(top.roster_id)}</p>
          {(tied.length > 0 || !top.started) && (
            <p className="leader-note">
              {[!top.started && 'From the bench', tied.length > 0 && `Tied with ${tied.length} more`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
      ) : (
        <div className="leader-body leader-empty">
          <p className="leader-name">No score yet</p>
          <p className="leader-team">Nobody rostered at {cell.position} has a score this week.</p>
        </div>
      )}
    </>
  );
}

export function PositionLeaders({
  i,
  week,
  leaders,
  name,
}: {
  i: number;
  week: number;
  /** Undefined until an ingest run on this version publishes it. */
  leaders: PositionLeadersWeek | undefined;
  name: TeamNames;
}) {
  const fan = useSyncExternalStore(subscribe, fanFits);
  const label = `Week ${week} position leaders`;

  return (
    <Card i={i} className="panel leaders-panel" aria-labelledby="leaders-h">
      <h2 id="leaders-h">Week {week} leaders</h2>
      <Bubble>The top-scoring rostered player at each position, bench included, and the team that owns them.</Bubble>
      {!leaders ? (
        <p>Position leaders show up after the next data refresh.</p>
      ) : fan ? (
        <BounceCards
          key={week}
          items={leaders.positions}
          itemKey={(cell) => cell.position}
          label={label}
          cardLabel={(cell) => describe(cell, name)}
          renderCard={(cell) => <LeaderCard cell={cell} name={name} />}
          cardWidth={188}
          cardHeight={276}
          spread={164}
        />
      ) : (
        <ul className="leader-grid" aria-label={label}>
          {leaders.positions.map((cell) => (
            <li key={cell.position} className="bounce-card" tabIndex={0} aria-label={describe(cell, name)}>
              <LeaderCard cell={cell} name={name} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
