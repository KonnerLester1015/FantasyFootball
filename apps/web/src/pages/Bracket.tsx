// A playoff bracket drawn as a tree: each game sits level with the games that
// feed it, joined by bracket lines, so "Winner of game 1" visibly points at
// game 1. Placement games (3rd, 5th…) sit apart, below. A consolation bracket
// may advance losers instead of winners; the tree follows whichever kind feeds
// its final. Layout only: every team, winner and slot label comes from the read model.

import { parseBracketSource, type BracketGameView, type BracketSource } from '@fantasy-football/core';

type Advance = BracketSource['kind'];

const sourcesOf = (g: BracketGameView): BracketSource[] =>
  [g.team1_from, g.team2_from].flatMap((token) => {
    const source = parseBracketSource(token);
    return source ? [source] : [];
  });

/** Which result moves a team along this bracket: what feeds its final. */
function advanceKind(games: readonly BracketGameView[]): Advance {
  const final = games.find((g) => g.placement === 1);
  return (final && sourcesOf(final)[0]?.kind) ?? 'winner';
}
import { Bubble, Card } from '../ui';
import type { TeamNames } from './shared';

const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

/** Fed the other way, or deciding a place other than 1st: not on the main path. */
const isPlacement = (g: BracketGameView, advance: Advance): boolean =>
  sourcesOf(g).some((source) => source.kind !== advance) || (g.placement !== null && g.placement !== 1);

function caption(g: BracketGameView, finalLabel: string): string {
  if (g.placement === 1) return `${finalLabel} · game ${g.game}`;
  if (g.placement !== null) return `For ${ordinal(g.placement)} place · game ${g.game}`;
  return `Round ${g.round} · game ${g.game}`;
}

function BracketTeam({
  id,
  label,
  winner,
  name,
}: {
  id: number | null;
  label: string | null;
  winner: number | null;
  name: TeamNames;
}) {
  const won = id !== null && id === winner;
  const decided = winner !== null;
  return (
    <p className={`bracket-team ${won ? 'won' : decided && id !== null ? 'lost' : ''} ${id === null ? 'tbd' : ''}`}>
      <span>{id !== null ? name(id) : (label ?? 'Bye')}</span>
      {won && <span className="chip chip-in">Won</span>}
    </p>
  );
}

function GameCard({ g, name, finalLabel }: { g: BracketGameView; name: TeamNames; finalLabel: string }) {
  return (
    <article className={`bracket-game ${g.placement === 1 ? 'final' : ''}`} aria-label={caption(g, finalLabel)}>
      <p className="bracket-caption">{caption(g, finalLabel)}</p>
      <BracketTeam id={g.team1_roster_id} label={g.team1_label} winner={g.winner_roster_id} name={name} />
      <BracketTeam id={g.team2_roster_id} label={g.team2_label} winner={g.winner_roster_id} name={name} />
    </article>
  );
}

/** One game with the games feeding it drawn to its left, recursively. */
function Node({
  g,
  path,
  name,
  finalLabel,
  advance,
}: {
  g: BracketGameView;
  path: readonly BracketGameView[];
  name: TeamNames;
  finalLabel: string;
  advance: Advance;
}) {
  const feeders = sourcesOf(g).flatMap((source) => {
    const from = source.kind === advance ? path.find((other) => other.game === source.game) : undefined;
    return from ? [from] : [];
  });
  return (
    <div className="bt-node">
      {feeders.length > 0 && (
        <div className={`bt-feeders ${feeders.length === 1 ? 'single' : ''}`}>
          {feeders.map((f) => (
            <Node key={f.game} g={f} path={path} name={name} finalLabel={finalLabel} advance={advance} />
          ))}
        </div>
      )}
      <div className={`bt-slot ${feeders.length > 0 ? 'fed' : ''}`}>
        <GameCard g={g} name={name} finalLabel={finalLabel} />
      </div>
    </div>
  );
}

export function Bracket({
  title,
  games,
  name,
  i,
  finalLabel,
}: {
  title: string;
  games: BracketGameView[];
  name: TeamNames;
  i: number;
  /** What the placement-1 game is called in this bracket ("Championship"). */
  finalLabel: string;
}) {
  const advance = advanceKind(games);
  const path = games.filter((g) => !isPlacement(g, advance));
  const feedsLater = new Set(
    path.flatMap((g) => sourcesOf(g).flatMap((source) => (source.kind === advance ? [source.game] : []))),
  );
  // The final, plus any path game nothing later feeds from (an unusual bracket).
  const roots = path.filter((g) => !feedsLater.has(g.game)).sort((a, b) => b.round - a.round || a.game - b.game);
  const placement = games
    .filter((g) => isPlacement(g, advance))
    .sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99) || a.game - b.game);

  return (
    <Card i={i} className="panel" aria-label={title}>
      <h2>{title}</h2>
      {games.length === 0 ? (
        <Bubble>The bracket appears here once Sleeper publishes it after the regular season.</Bubble>
      ) : (
        <>
          <div className="bracket-scroll">
            {roots.map((g) => (
              <div key={g.game} className="bracket-tree">
                <Node g={g} path={path} name={name} finalLabel={finalLabel} advance={advance} />
              </div>
            ))}
          </div>
          {placement.length > 0 && (
            <>
              <h3 className="bracket-sub">Placement games</h3>
              <div className="bracket-placement">
                {placement.map((g) => (
                  <GameCard key={g.game} g={g} name={name} finalLabel={finalLabel} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Card>
  );
}
