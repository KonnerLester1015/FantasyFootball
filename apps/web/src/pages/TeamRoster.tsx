// A team's players: the season MVP at each position (fanned like the weekly
// leader cards), then the roster as player cards — today's roster with season
// totals, or any week's lineup with that week's points. Every number comes from
// the current read model (packages/core metrics/roster.ts); nothing is summed here.

import { useState, type CSSProperties } from 'react';
import {
  LEADER_POSITIONS,
  type CurrentDashboard,
  type LeaderPosition,
  type LineupPlayer,
  type RosterPlayerSeason,
  type TeamLineupWeek,
  type TeamRosterView,
} from '@fantasy-football/core';
import { BounceCards } from '../BounceCards';
import { count, pts } from '../format';
import { PositionArt } from '../PositionArt';
import { Bubble, Card, Tabs } from '../ui';
import { useFanFits } from './PositionLeaders';

const isCardPosition = (position: string | null): position is LeaderPosition =>
  (LEADER_POSITIONS as readonly (string | null)[]).includes(position);

const nameOf = (player: { name: string | null }): string => player.name ?? 'Unnamed player';
const proTeam = (player: { position: string | null; nfl_team: string | null }): string =>
  [player.position, player.nfl_team ?? 'FA'].filter(Boolean).join(' · ');

/** The position drawing, or a blank strip for positions without one (IDP and the like). */
function CardArt({ position, badge, flair }: { position: string | null; badge: string; flair?: string | undefined }) {
  const art = isCardPosition(position) ? position : null;
  return (
    <div className={`leader-art ${art ? `art-${art.toLowerCase()}` : 'art-none'}`}>
      {art && <PositionArt position={art} />}
      <span className="leader-badge">{badge}</span>
      {flair && (
        <span className="card-flair" aria-hidden="true">
          {flair}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team MVPs
// ---------------------------------------------------------------------------

interface MvpCell {
  position: LeaderPosition;
  player: RosterPlayerSeason | null;
}

function MvpCard({ cell }: { cell: MvpCell }) {
  const { player } = cell;
  return (
    <>
      <CardArt position={cell.position} badge={cell.position} />
      {player ? (
        <div className="leader-body">
          <p className="leader-points">
            {pts(player.started_points)} <small>pts</small>
          </p>
          <p className="leader-name">{nameOf(player)}</p>
          <p className="leader-team">
            {player.nfl_team ?? 'FA'} · {count(player.weeks_started)} {player.weeks_started === 1 ? 'start' : 'starts'}
          </p>
          {player.status === 'gone' && <p className="leader-note">No longer on the roster</p>}
        </div>
      ) : (
        <div className="leader-body leader-empty">
          <p className="leader-name">Nobody yet</p>
          <p className="leader-team">No {cell.position} has started and scored for this team.</p>
        </div>
      )}
    </>
  );
}

const describeMvp = (cell: MvpCell): string =>
  cell.player
    ? `${cell.position}: ${nameOf(cell.player)}, ${pts(cell.player.started_points)} points as a starter`
    : `${cell.position}: nobody yet`;

function TeamMvps({ roster, i }: { roster: TeamRosterView; i: number }) {
  const fan = useFanFits();
  const cells: MvpCell[] = roster.mvps.map((m) => ({
    position: m.position,
    player: roster.players.find((p) => p.player_id === m.player_id) ?? null,
  }));
  if (cells.every((c) => c.player === null)) return null;
  const label = 'Team MVP at each position';

  return (
    <Card i={i} className="panel leaders-panel" aria-labelledby="mvps-h">
      <h2 id="mvps-h">Team MVPs</h2>
      <Bubble>The player at each position who has scored the most points in this team’s starting lineup this season.</Bubble>
      {fan ? (
        <BounceCards
          items={cells}
          itemKey={(cell) => cell.position}
          label={label}
          cardLabel={describeMvp}
          renderCard={(cell) => <MvpCard cell={cell} />}
          cardWidth={188}
          cardHeight={276}
          spread={164}
        />
      ) : (
        <ul className="leader-grid" aria-label={label}>
          {cells.map((cell) => (
            <li key={cell.position} className="bounce-card" tabIndex={0} aria-label={describeMvp(cell)}>
              <MvpCard cell={cell} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Roster and weekly lineups
// ---------------------------------------------------------------------------

function PlayerCards<T extends { player_id: string }>({
  title,
  players,
  render,
  describe,
  active = null,
  onActive,
}: {
  title: string;
  players: readonly T[];
  render: (player: T) => React.ReactNode;
  describe: (player: T) => string;
  /** The player highlighted from elsewhere (the points bar). */
  active?: string | null;
  onActive?: (playerId: string | null) => void;
}) {
  if (players.length === 0) return null;
  return (
    <>
      <h3 className="roster-group">
        {title} <small>({players.length})</small>
      </h3>
      <ul className="leader-grid player-grid" aria-label={title}>
        {players.map((player, n) => (
          <li
            key={player.player_id}
            className="bounce-card player-card row-in"
            style={{ '--i': n } as CSSProperties}
            tabIndex={0}
            aria-label={describe(player)}
            data-active={active === player.player_id ? '' : undefined}
            onMouseEnter={() => onActive?.(player.player_id)}
            onMouseLeave={() => onActive?.(null)}
            onFocus={() => onActive?.(player.player_id)}
            onBlur={() => onActive?.(null)}
          >
            {render(player)}
          </li>
        ))}
      </ul>
    </>
  );
}

function SeasonCard({ player, badge }: { player: RosterPlayerSeason; badge: string }) {
  return (
    <>
      <CardArt position={player.position} badge={badge} />
      <div className="leader-body">
        <p className="leader-points">
          {pts(player.started_points)} <small>pts</small>
        </p>
        <p className="leader-name">{nameOf(player)}</p>
        <p className="leader-team">{proTeam(player)}</p>
        <p className="leader-note neutral">
          {count(player.weeks_started)} {player.weeks_started === 1 ? 'start' : 'starts'}
          {player.total_points !== null &&
            player.total_points !== player.started_points &&
            ` · ${pts(player.total_points)} incl. bench`}
        </p>
      </div>
    </>
  );
}

const describeSeason = (player: RosterPlayerSeason): string =>
  `${nameOf(player)}, ${proTeam(player)}: ${pts(player.started_points)} points as a starter in ${count(player.weeks_started)} starts`;

function RosterNow({ roster }: { roster: TeamRosterView }) {
  const group = (status: RosterPlayerSeason['status']) => roster.players.filter((p) => p.status === status);
  const card = (player: RosterPlayerSeason) => <SeasonCard player={player} badge={player.position ?? '?'} />;
  const former = group('gone');
  return (
    <>
      <Bubble>Points each player has scored in this team’s starting lineup this season. Bench points don’t count toward the big number.</Bubble>
      <PlayerCards title="Set to start" players={group('starter')} render={card} describe={describeSeason} />
      <PlayerCards title="Bench" players={group('bench')} render={card} describe={describeSeason} />
      <PlayerCards title="Injured reserve" players={group('reserve')} render={card} describe={describeSeason} />
      <PlayerCards title="Taxi squad" players={group('taxi')} render={card} describe={describeSeason} />
      {former.length > 0 && (
        <details className="former">
          <summary>Former players ({former.length})</summary>
          <ul>
            {former.map((p) => (
              <li key={p.player_id}>
                <strong>{nameOf(p)}</strong> <span className="small">{proTeam(p)}</span> · {pts(p.started_points)} pts in{' '}
                {count(p.weeks_started)} {p.weeks_started === 1 ? 'start' : 'starts'}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function lineupFlair(player: LineupPlayer, top: number | null, live: boolean): { flair?: string; note?: string } {
  if (live) return {};
  if (player.started && top !== null && player.points === top) return { flair: '👑', note: 'Top scorer this week' };
  if (!player.started && player.optimal_starter) return { note: 'Belonged in the lineup' };
  if (player.started && !player.optimal_starter) return { note: 'A bench player would have scored more' };
  return {};
}

function WeekLineup({ lineup, cell }: { lineup: TeamLineupWeek; cell: CurrentDashboard['weeks'][number] | undefined }) {
  const starters = lineup.players.filter((p) => p.started);
  const bench = lineup.players.filter((p) => !p.started);
  const scored = starters.flatMap((p) => (p.points === null ? [] : [p.points]));
  const top = scored.length > 0 ? Math.max(...scored) : null;
  const total = starters.reduce((sum, p) => sum + Math.max(0, p.points ?? 0), 0);
  const [active, setActive] = useState<string | null>(null);
  const contributors = starters.filter((p) => (p.points ?? 0) > 0);

  const card = (player: LineupPlayer) => {
    const { flair, note } = lineupFlair(player, top, lineup.live);
    return (
      <>
        <CardArt position={player.position} badge={player.slot ?? 'BN'} flair={flair} />
        <div className="leader-body">
          <p className={`leader-points ${player.started ? '' : 'bench-points'}`}>
            {pts(player.points)} <small>pts</small>
          </p>
          <p className="leader-name">{nameOf(player)}</p>
          <p className="leader-team">{proTeam(player)}</p>
          {note && <p className="leader-note">{note}</p>}
        </div>
      </>
    );
  };
  const describe = (player: LineupPlayer) =>
    `${player.slot ?? 'Bench'}: ${nameOf(player)}, ${proTeam(player)}, ${pts(player.points)} points` +
    (lineupFlair(player, top, lineup.live).note ? `, ${lineupFlair(player, top, lineup.live).note}` : '');

  return (
    <>
      {lineup.live ? (
        <Bubble>
          Week {lineup.week} is still being played, so these scores are moving. Sleeper shows 0 for anyone who hasn’t
          kicked off yet.
        </Bubble>
      ) : (
        cell && (
          <p className="lineup-summary">
            Scored <strong>{pts(cell.points)}</strong> · best possible lineup <strong>{pts(cell.optimal_points)}</strong> ·
            left <strong>{pts(cell.bench_gap)}</strong> on the bench
          </p>
        )
      )}
      {total > 0 && (
        <>
          <h3 className="roster-group">Where the points came from</h3>
          <div
            className="points-split"
            role="img"
            aria-label={`Week ${lineup.week} starting points by player: ${contributors
              .map((p) => `${nameOf(p)} ${pts(p.points)}`)
              .join(', ')}`}
            onMouseLeave={() => setActive(null)}
          >
            {contributors.map((p) => {
              const art = isCardPosition(p.position) ? p.position.toLowerCase() : 'none';
              const share = (p.points ?? 0) / total;
              return (
                <span
                  key={p.player_id}
                  className={`split art-${art}`}
                  style={{ flexGrow: share } as CSSProperties}
                  data-active={active === p.player_id ? '' : undefined}
                  onMouseEnter={() => setActive(p.player_id)}
                  onClick={() => setActive(active === p.player_id ? null : p.player_id)}
                >
                  <span className="split-label">{p.position ?? '?'}</span>
                  <span className="split-tip">
                    <strong>{nameOf(p)}</strong>
                    <span>
                      {p.slot ?? p.position} · {pts(p.points)} pts · {Math.round(share * 100)}%
                    </span>
                  </span>
                </span>
              );
            })}
          </div>
          <p className="split-hint">Hover a section or a card to match them up.</p>
        </>
      )}
      <PlayerCards
        title="Starters"
        players={starters}
        render={card}
        describe={describe}
        active={active}
        onActive={setActive}
      />
      <PlayerCards title="Bench" players={bench} render={card} describe={describe} />
    </>
  );
}

export function TeamRoster({ current, rosterId, i }: { current: CurrentDashboard; rosterId: number; i: number }) {
  const roster = current.rosters.find((r) => r.roster_id === rosterId);
  const lineups = current.lineups.filter((l) => l.roster_id === rosterId);
  const [view, setView] = useState('now');
  if (!roster) return null;

  const options = [
    { key: 'now', label: 'Roster now' },
    ...lineups.map((l) => ({ key: String(l.week), label: l.live ? `Week ${l.week} · live` : `Week ${l.week}` })),
  ];
  const lineup = lineups.find((l) => String(l.week) === view);
  const cell = current.weeks.find((c) => c.roster_id === rosterId && String(c.week) === view);

  return (
    <>
      <TeamMvps roster={roster} i={i} />
      <Card i={i + 1} className="panel" aria-labelledby="roster-h">
        <div className="panel-head">
          <h2 id="roster-h">The roster</h2>
          <Tabs label="Show the roster now or a week's lineup" options={options} value={lineup ? view : 'now'} onChange={setView} />
        </div>
        {lineup ? <WeekLineup key={lineup.week} lineup={lineup} cell={cell} /> : <RosterNow roster={roster} />}
      </Card>
    </>
  );
}
