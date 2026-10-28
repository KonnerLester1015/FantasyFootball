import type { RecordBookEntry } from '@fantasy-football/core';
import type { Dashboards } from '../data/loadSeason';
import { DEF } from '../definitions';
import { count, NA, pct, pts, signed } from '../format';
import { Bars, Bubble, Card, MetricHead, names } from '../ui';

// Record values that are counts, not points.
const COUNT_RECORDS = new Set(['crowns', 'over_150', 'over_200', 'last_week', 'titles']);

const RECORD_DEFS: Record<string, string> = {
  hi_week: 'The most points any team has scored in one week.',
  lo_week: 'The fewest points any team has scored in one finished week.',
  crowns: DEF.crowns,
  over_150: DEF.over150,
  over_200: DEF.over200,
  last_week: DEF.lastPlace,
  hi_season: 'The most points in one completed season.',
  lo_season: 'The fewest points in one completed season.',
  career_pf: DEF.careerPf,
  titles: DEF.titles,
  narrow_win: DEF.narrowestWin,
};

export function HistoryPage({ data }: { data: Dashboards }) {
  const { history } = data;
  const careers = [...history.careers].sort((a, b) => b.points_for - a.points_for);
  const seasonPf = [...history.season_pf].sort((a, b) => b.points_for - a.points_for);
  const maxPf = Math.max(1, ...seasonPf.map((s) => s.points_for));
  const l = history.luck;
  const luckCards = [
    { title: 'Luckiest season', rec: l.luckiest_season, fmt: signed, def: DEF.luck },
    { title: 'Unluckiest season', rec: l.unluckiest_season, fmt: signed, def: DEF.luck },
    { title: 'Most points in losses', rec: l.most_points_in_losses, fmt: pts, def: DEF.pointsInLosses },
    { title: 'Most points against (career)', rec: l.most_career_points_against, fmt: pts, def: DEF.pointsAgainst },
  ];

  return (
    <>
      <Card i={0} className="panel hero">
        <div>
          <h1>The Record Book</h1>
          <p className="hero-status">
            {history.seasons.length > 0
              ? `Every mark since the ${history.as_of.season} season, through week ${history.as_of.finalized_through_week}.`
              : 'No seasons recorded yet.'}
          </p>
        </div>
      </Card>
      <Bubble>{DEF.recordBook}</Bubble>

      <div className="trophy-grid">
        {history.record_book.map((r, n) => (
          <Trophy key={r.record_code} entry={r} i={n} />
        ))}
      </div>

      <div className="stat-row">
        {luckCards.map((c, n) => (
          <Card key={c.title} i={n} as="article" className="stat">
            <h3 className="stat-label">{c.title}</h3>
            <p className="stat-number tone-ink">{c.fmt(c.rec.value)}</p>
            <p className="stat-name">
              {names(c.rec.holders.map((h) => (h.season ? `${h.team_name} (${h.season})` : h.team_name)))}
            </p>
            <Bubble>{c.def}</Bubble>
          </Card>
        ))}
      </div>

      <Card i={2} className="panel" aria-labelledby="career-h">
        <h2 id="career-h">Career table</h2>
        <div className="table-box">
          <table className="table">
            <caption className="sr-only">Career totals per manager, by points</caption>
            <thead>
              <tr>
                <th scope="col">Manager</th>
                <th scope="col" className="num">Seasons</th>
                <th scope="col">Record</th>
                <th scope="col" className="num">Win %</th>
                <th scope="col" className="num">PF</th>
                <th scope="col" className="num">PF / game</th>
                <th scope="col" className="num">All-play</th>
                <th scope="col" className="num">Luck</th>
                <th scope="col" className="num">Titles</th>
                <th scope="col" className="num">Playoffs</th>
              </tr>
            </thead>
            <tbody>
              {careers.map((c) => (
                <tr key={c.identity}>
                  <th scope="row">
                    {c.team_name}
                    <span className="manager">{c.manager_name}</span>
                  </th>
                  <td className="num">{count(c.seasons_observed)}</td>
                  <td>{c.record}</td>
                  <td className="num">{pct(c.win_pct)}</td>
                  <td className="num">{pts(c.points_for)}</td>
                  <td className="num">{pts(c.avg_pf_per_game)}</td>
                  <td className="num">{pct(c.all_play_pct)}</td>
                  <td className="num">{signed(c.luck_wins)}</td>
                  <td className="num">{count(c.titles)}</td>
                  <td className="num">{count(c.playoff_appearances)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="glossary">
          <div><dt>PF</dt><dd>{DEF.careerPf}</dd></div>
          <div><dt>PF / game</dt><dd>{DEF.avgPf}</dd></div>
          <div><dt>All-play</dt><dd>{DEF.allPlay}</dd></div>
          <div><dt>Luck</dt><dd>{DEF.luckWins}</dd></div>
        </dl>
      </Card>

      <Card i={3} className="panel">
        <MetricHead title="Points by season" def={DEF.seasonPf} />
        <Bars
          label="Season points per manager"
          max={maxPf}
          format={pts}
          data={seasonPf.map((s) => ({
            key: `${s.identity}-${s.season}`,
            label: `${s.team_name} · ${s.season}`,
            value: s.points_for,
            tone: 'blue',
          }))}
        />
      </Card>
    </>
  );
}

function Trophy({ entry, i }: { entry: RecordBookEntry; i: number }) {
  const fmt = COUNT_RECORDS.has(entry.record_code) ? count : pts;
  const last = entry.previous.at(-1);
  const where = (h: RecordBookEntry['holders'][number]) =>
    [h.team_name, h.week !== null && `wk ${h.week}`, h.opponent_team_name && `vs ${h.opponent_team_name}`]
      .filter(Boolean)
      .join(', ');
  return (
    <Card i={i} as="article" className="trophy">
      <svg className="trophy-icon" viewBox="0 0 48 48" aria-hidden="true">
        <path d="M14 6h20v10a10 10 0 0 1-20 0zM14 9H7c0 7 3 10 8 11M34 9h7c0 7-3 10-8 11M20 26h8v8h-8zM15 42h18v-8H15z" fill="var(--yellow)" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round" />
      </svg>
      <h3>{entry.record_label}</h3>
      <p className="trophy-value">{entry.value === null ? NA : fmt(entry.value)}</p>
      <p className="trophy-holder">{entry.holders.length > 0 ? entry.holders.map(where).join(' / ') : 'Not set yet'}</p>
      {last && (
        <p className="previous">
          Previous holder: {last.holders.map((h) => h.team_name).join(' / ')} ({fmt(last.value)}), broken week{' '}
          {last.broken_in_week}
        </p>
      )}
      <p className="small">{RECORD_DEFS[entry.record_code] ?? ''}</p>
    </Card>
  );
}
