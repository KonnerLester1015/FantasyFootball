import { useState, type FormEvent } from 'react';
import { findLeaguesForUsername, type FoundLeague } from '../data/loadSeason';
import { Card, Football } from '../ui';

const LEAGUE_ID_RE = /^\d+$/;

/** NFL seasons run Sept-Feb under the year they kicked off in. */
function guessSeason(): string {
  const now = new Date();
  return String(now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1);
}

export function LeagueEntryPage({ onSelect }: { onSelect: (leagueId: string) => void }) {
  const [leagueId, setLeagueId] = useState('');
  const [username, setUsername] = useState('');
  const [season, setSeason] = useState(guessSeason);
  const [found, setFound] = useState<FoundLeague[] | null>(null);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitId = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = leagueId.trim();
    if (LEAGUE_ID_RE.test(trimmed)) onSelect(trimmed);
  };

  const lookup = (event: FormEvent): void => {
    event.preventDefault();
    setLooking(true);
    setError(null);
    setFound(null);
    findLeaguesForUsername(username, season).then(
      (leagues) => {
        setLooking(false);
        setFound(leagues);
        if (leagues.length === 0) setError(`No ${season} leagues found for "${username.trim()}".`);
      },
      (cause: unknown) => {
        setLooking(false);
        setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
  };

  return (
    <>
      <header className="site-header">
        <a className="brand" href="#/">
          <Football size={48} />
          <span>
            <span className="brand-name">Fantasy Football</span>
            <span className="tagline">Your league, on the record.</span>
          </span>
        </a>
      </header>
      <main id="main" className="container" tabIndex={-1}>
        <Card i={0} className="panel hero">
          <div>
            <h1>Pull up any Sleeper league</h1>
            <p className="hero-status">
              Enter a Sleeper league ID, or find it by your Sleeper username. Nothing about your
              league is sent anywhere but your own browser and Sleeper itself.
            </p>
          </div>
        </Card>

        <Card i={1} className="panel" aria-labelledby="by-id-h">
          <h2 id="by-id-h">By league ID</h2>
          <form onSubmit={submitId}>
            <div className="field">
              <label htmlFor="league-id">Sleeper league ID</label>
              <input
                id="league-id"
                inputMode="numeric"
                pattern="[0-9]*"
                value={leagueId}
                onChange={(event) => setLeagueId(event.target.value)}
                placeholder="e.g. 1390575664880418816"
              />
            </div>
            <button type="submit" className="button big" disabled={!LEAGUE_ID_RE.test(leagueId.trim())}>
              Go
            </button>
          </form>
        </Card>

        <Card i={2} className="panel" aria-labelledby="by-username-h">
          <h2 id="by-username-h">By username</h2>
          <form onSubmit={lookup}>
            <div className="field">
              <label htmlFor="username">Sleeper username</label>
              <input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="your Sleeper username"
              />
            </div>
            <div className="field">
              <label htmlFor="season">Season</label>
              <input
                id="season"
                inputMode="numeric"
                value={season}
                onChange={(event) => setSeason(event.target.value)}
              />
            </div>
            <button type="submit" className="button" disabled={username.trim() === '' || looking}>
              {looking ? 'Looking…' : 'Find my leagues'}
            </button>
          </form>
          {error && <p>{error}</p>}
          {found && found.length > 0 && (
            <ul className="games">
              {found.map((league) => (
                <li key={league.league_id}>
                  <button type="button" className="button" onClick={() => onSelect(league.league_id)}>
                    {league.name} ({league.season})
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </main>
      <footer className="site-footer">
        <p>&copy; 2026 Fantasy Football</p>
      </footer>
    </>
  );
}
