// Which Sleeper league the current route is scoped to. Every hash route is
// `#/<leagueId>/...`, so anything that builds a link within the league reads
// the id from here instead of threading it through every component's props.

import { createContext, useContext, type ReactNode } from 'react';

const LeagueContext = createContext<string | null>(null);

export function LeagueProvider({
  leagueId,
  children,
}: {
  leagueId: string;
  children: ReactNode;
}) {
  return <LeagueContext.Provider value={leagueId}>{children}</LeagueContext.Provider>;
}

export function useLeagueId(): string {
  const id = useContext(LeagueContext);
  if (id === null) throw new Error('useLeagueId() used outside a LeagueProvider');
  return id;
}

/** A hash link to a path within the current league, e.g. useLeagueHref('/team/3'). */
export function useLeagueHref(path: string): string {
  return `#/${useLeagueId()}${path}`;
}
