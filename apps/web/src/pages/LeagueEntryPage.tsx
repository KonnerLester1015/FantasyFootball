import { useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { findLeaguesForUser, findUserId, type FoundLeague } from '../data/loadSeason';
import { Card, Football, SiteFooter, Tabs } from '../ui';

const LEAGUE_ID_RE = /^\d+$/;
const LAST_USERNAME_KEY = 'ff.lastUsername';

/** NFL seasons run Sept-Feb under the year they kicked off in. */
function guessSeason(): string {
  const now = new Date();
  return String(now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1);
}

/** Sleeper's first NFL fantasy season. */
const FIRST_SEASON = 2017;
/** Seasons shown as pills before "Earlier…". */
const RECENT_SEASONS = 4;

/** Every season Sleeper could have a league for, newest first. */
function validSeasons(): string[] {
  const latest = Number(guessSeason());
  return Array.from({ length: latest - FIRST_SEASON + 1 }, (_unused, i) => String(latest - i));
}

function readLastUsername(): string {
  try {
    return localStorage.getItem(LAST_USERNAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberUsername(username: string): void {
  try {
    localStorage.setItem(LAST_USERNAME_KEY, username);
  } catch {
    // Storage disabled: the field just starts empty next visit.
  }
}

const statusLabel = (status: string): string =>
  status === 'in_season'
    ? 'In season'
    : status === 'complete'
      ? 'Complete'
      : status === 'drafting'
        ? 'Drafting'
        : 'Pre-draft';

type Lookup =
  | { state: 'idle' }
  | { state: 'looking' }
  | { state: 'no-user'; username: string }
  | { state: 'error'; message: string }
  | { state: 'found'; userId: string; username: string; season: string; leagues: FoundLeague[] | null };

const failure = (cause: unknown): Lookup => ({
  state: 'error',
  message: cause instanceof Error ? cause.message : String(cause),
});

export function LeagueEntryPage({ onSelect }: { onSelect: (leagueId: string) => void }) {
  const [leagueId, setLeagueId] = useState('');
  const [username, setUsername] = useState(readLastUsername);
  const [seasons] = useState(validSeasons);
  const [showAll, setShowAll] = useState(false);
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });
  /** Only the newest request may write results; a slow older one is dropped. */
  const request = useRef(0);

  const submitId = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = leagueId.trim();
    if (LEAGUE_ID_RE.test(trimmed)) onSelect(trimmed);
  };

  const loadSeason = (userId: string, name: string, season: string): void => {
    const ticket = ++request.current;
    setLookup({ state: 'found', userId, username: name, season, leagues: null });
    findLeaguesForUser(userId, season).then(
      (leagues) => {
        if (ticket === request.current) setLookup({ state: 'found', userId, username: name, season, leagues });
      },
      (cause: unknown) => {
        if (ticket === request.current) setLookup(failure(cause));
      },
    );
  };

  const findUser = (event: FormEvent): void => {
    event.preventDefault();
    const name = username.trim();
    if (name === '') return;
    const ticket = ++request.current;
    setLookup({ state: 'looking' });
    findUserId(name).then(
      (userId) => {
        if (ticket !== request.current) return;
        if (userId === null) {
          setLookup({ state: 'no-user', username: name });
          return;
        }
        rememberUsername(name);
        loadSeason(userId, name, seasons[0]!);
      },
      (cause: unknown) => {
        if (ticket === request.current) setLookup(failure(cause));
      },
    );
  };

  const found = lookup.state === 'found' ? lookup : null;
  const pickedOlder = found !== null && seasons.indexOf(found.season) >= RECENT_SEASONS;
  const shownSeasons = showAll || pickedOlder ? seasons : seasons.slice(0, RECENT_SEASONS);
  const hiddenCount = seasons.length - shownSeasons.length;

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
            <p className="hero-status">Find it by your Sleeper username, or paste a league ID.</p>
          </div>
        </Card>

        <Card i={1} className="panel" aria-labelledby="by-username-h">
          <h2 id="by-username-h">By username</h2>
          <form onSubmit={findUser} className="inline-form">
            <div className="field">
              <label htmlFor="username">Sleeper username</label>
              <input
                id="username"
                value={username}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="your Sleeper username"
              />
            </div>
            <button
              type="submit"
              className="button"
              disabled={username.trim() === '' || lookup.state === 'looking'}
            >
              {lookup.state === 'looking' ? 'Looking…' : 'Find my leagues'}
            </button>
          </form>

          <div aria-live="polite">
            {lookup.state === 'no-user' && (
              <p className="lookup-note">No Sleeper user named “{lookup.username}”. Check the spelling.</p>
            )}
            {lookup.state === 'error' && <p className="lookup-note">{lookup.message}</p>}
            {found && (
              <div className="found">
                <div className="found-head">
                  <h3>Leagues for {found.username}</h3>
                  <div className="season-pills">
                    <Tabs
                      label="Season"
                      value={found.season}
                      onChange={(season) => loadSeason(found.userId, found.username, season)}
                      options={shownSeasons.map((year) => ({ key: year, label: year }))}
                    />
                    {hiddenCount > 0 && (
                      <button type="button" className="tab" onClick={() => setShowAll(true)}>
                        Earlier…
                      </button>
                    )}
                  </div>
                </div>
                {found.leagues === null ? (
                  <p className="lookup-note">Looking up {found.season} leagues…</p>
                ) : found.leagues.length === 0 ? (
                  <p className="lookup-note">No {found.season} leagues. Try another season.</p>
                ) : (
                  <ul className="league-list">
                    {found.leagues.map((league, n) => (
                      <li key={league.league_id} className="row-in" style={{ '--i': n } as CSSProperties}>
                        <button type="button" className="league-pick" onClick={() => onSelect(league.league_id)}>
                          <span className="league-pick-name">{league.name}</span>
                          <span className="league-pick-meta">
                            {league.season} · {statusLabel(league.status)}
                            {league.total_rosters !== null && ` · ${league.total_rosters} teams`}
                          </span>
                          <span className="league-pick-go" aria-hidden="true">
                            →
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card i={2} className="panel" aria-labelledby="by-id-h">
          <h2 id="by-id-h">By league ID</h2>
          <form onSubmit={submitId} className="inline-form">
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
            <button type="submit" className="button" disabled={!LEAGUE_ID_RE.test(leagueId.trim())}>
              Go
            </button>
          </form>
        </Card>
      </main>
      <SiteFooter />
    </>
  );
}
