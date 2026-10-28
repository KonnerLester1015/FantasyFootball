// Every route is scoped to a league: #/<leagueId>/... . Entering or finding a
// league on LeagueEntryPage sets that prefix; everything after it renders the
// same dashboards, computed fresh from Sleeper by data/loadSeason.ts. Hash
// routes keep the build a plain static site, GitHub Pages subpath included.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { MotionConfig } from 'motion/react';
import { loadDashboards, type Dashboards } from './data/loadSeason';
import { asOfLabel } from './format';
import { LeagueProvider, useLeagueHref } from './league-context';
import { CurrentPage } from './pages/CurrentPage';
import { HistoryPage } from './pages/HistoryPage';
import { LeagueEntryPage } from './pages/LeagueEntryPage';
import { PlayoffsPage } from './pages/PlayoffsPage';
import { SummaryPage } from './pages/SummaryPage';
import { TeamPage } from './pages/TeamPage';
import { Card, Football, Helmet, Spinner } from './ui';

const NAV = [
  { path: '/', label: 'Current Season' },
  { path: '/playoffs', label: 'Playoffs' },
  { path: '/history', label: 'Record Book' },
  { path: '/summary', label: 'Weekly Recap' },
] as const;

const REFRESH_MS = 5 * 60 * 1000;
const LAST_LEAGUE_KEY = 'ff.lastLeague';
const LEAGUE_PATH = /^\/(\d{1,25})(\/.*)?$/;

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}
const readPath = (): string => window.location.hash.replace(/^#/, '') || '/';

function rememberLeague(leagueId: string): void {
  try {
    localStorage.setItem(LAST_LEAGUE_KEY, leagueId);
  } catch {
    // Storage disabled: the entry screen just shows again next visit.
  }
}

function lastLeague(): string | null {
  try {
    return localStorage.getItem(LAST_LEAGUE_KEY);
  } catch {
    return null;
  }
}

export function App() {
  const path = useSyncExternalStore(subscribe, readPath);
  const match = LEAGUE_PATH.exec(path);
  const leagueId = match?.[1] ?? null;
  const subPath = match?.[2] && match[2] !== '' ? match[2] : '/';

  useEffect(() => {
    if (leagueId !== null || path !== '/') return;
    const remembered = lastLeague();
    if (remembered) window.location.hash = `#/${remembered}`;
  }, [leagueId, path]);

  return (
    <MotionConfig reducedMotion="user">
      {leagueId === null ? (
        <LeagueEntryPage
          onSelect={(id) => {
            rememberLeague(id);
            window.location.hash = `#/${id}`;
          }}
        />
      ) : (
        <LeagueProvider leagueId={leagueId}>
          <LeagueApp key={leagueId} leagueId={leagueId} subPath={subPath} />
        </LeagueProvider>
      )}
    </MotionConfig>
  );
}

function LeagueApp({ leagueId, subPath }: { leagueId: string; subPath: string }) {
  const [data, setData] = useState<Dashboards | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    loadDashboards(leagueId).then(
      (next) => {
        setData(next);
        setError(null);
        rememberLeague(leagueId);
      },
      (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)),
    );
  }, [leagueId]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    window.scrollTo(0, 0);
    const page = NAV.find((n) => n.path === subPath)?.label;
    document.title = page ? `${page} · Sunday Funnies` : 'Sunday Funnies';
  }, [subPath]);

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href={`#/${leagueId}`}>
          <Helmet />
          <span>
            <span className="brand-name">Sunday Funnies</span>
            <span className="tagline">Your league, on the record.</span>
          </span>
        </a>
        <nav aria-label="Dashboards">
          <ul className="nav">
            {NAV.map((n) => (
              <li key={n.path}>
                <a
                  className="pill"
                  href={`#/${leagueId}${n.path}`}
                  aria-current={n.path === subPath ? 'page' : undefined}
                >
                  {n.label}
                </a>
              </li>
            ))}
            <li>
              <a className="pill" href="#/">
                Switch league
              </a>
            </li>
          </ul>
        </nav>
      </header>

      {data && (
        <p className="as-of">
          As of <strong>{asOfLabel(data.generatedAt)}</strong> · finalized through{' '}
          <strong>{data.finalizedThroughWeek === null ? 'no weeks yet' : `week ${data.finalizedThroughWeek}`}</strong>
        </p>
      )}

      <main id="main" className="container" tabIndex={-1}>
        {error && !data ? (
          <Card i={1} className="panel">
            <h2>Couldn’t load that league</h2>
            <p>{error}</p>
            <button type="button" className="button" onClick={refresh}>
              Try again
            </button>
          </Card>
        ) : !data ? (
          <Spinner label="Fetching the scores" />
        ) : (
          <Route path={subPath} data={data} />
        )}
      </main>
      <footer className="site-footer">
        <p>&copy; 2026 Sunday Funnies</p>
      </footer>
    </>
  );
}

function Route({ path, data }: { path: string; data: Dashboards }) {
  if (path === '/') return <CurrentPage data={data} />;
  if (path === '/playoffs') return <PlayoffsPage data={data} />;
  if (path === '/history') return <HistoryPage data={data} />;
  if (path === '/summary') return <SummaryPage data={data} />;
  const team = /^\/team\/(\d+)$/.exec(path);
  if (team) return <TeamPage data={data} rosterId={Number(team[1])} />;
  return <NotFound />;
}

function NotFound() {
  const home = useLeagueHref('/');
  return (
    <Card i={2} className="panel not-found">
      <Football size={120} className="lost-ball" />
      <h2>Fumble! That page isn’t here.</h2>
      <p>
        <a className="button" href={home}>
          Back to the standings
        </a>
      </p>
    </Card>
  );
}
